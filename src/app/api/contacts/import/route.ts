import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { snakeCase } from "@/lib/render";
import { currentTenantId } from "@/lib/tenant";

export const maxDuration = 300;

const PHONE_TOKENS = ["phone", "mobile", "cell", "tel", "number", "msisdn"];
const KNOWN_FIRST = ["first_name", "firstname", "first", "fname", "given_name"];
const KNOWN_LAST = ["last_name", "lastname", "last", "lname", "surname", "family_name"];
const KNOWN_EMAIL = ["email", "email_address", "e_mail"];

const CHUNK = 500; // rows per bulk DB round-trip (SQLite param-limit safe)

type ParsedRow = {
  phone: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  customFields: string | null;
};

/**
 * CSV import, built for large files (100k+ rows). Multipart form with `file`
 * (plus optional `listId` or `listName`). Headers auto-detected, phones
 * auto-formatted to E.164, unknown columns become dynamic custom fields.
 * Rows are processed in bulk chunks: existing contacts are matched with one
 * query per chunk, new ones inserted with createMany.
 */
export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a CSV file in the `file` field" }, { status: 400 });
  }
  const listId = (form.get("listId") as string) || null;
  const listName = (form.get("listName") as string) || null;

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => snakeCase(h),
  });
  if (!parsed.data.length) {
    return NextResponse.json({ error: "No rows found in CSV" }, { status: 400 });
  }

  const headers = parsed.meta.fields ?? [];
  const phoneHeader =
    headers.find((h) => PHONE_TOKENS.some((t) => h === t || h.includes(t))) ?? headers[0];
  const firstHeader = headers.find((h) => KNOWN_FIRST.includes(h));
  const lastHeader = headers.find((h) => KNOWN_LAST.includes(h));
  const emailHeader = headers.find((h) => KNOWN_EMAIL.includes(h));
  const customHeaders = headers.filter(
    (h) => ![phoneHeader, firstHeader, lastHeader, emailHeader].includes(h)
  );

  let targetListId = listId;
  if (!targetListId && listName) {
    const list = await db.contactList.upsert({
      where: { tenantId_name: { tenantId, name: listName } },
      create: { tenantId, name: listName },
      update: {},
    });
    targetListId = list.id;
  }

  // ---- Parse + normalize all rows up front, dedupe within the file ----
  const rows: ParsedRow[] = [];
  const invalid: { row: number; phone: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const phone = normalizePhone(row[phoneHeader] ?? "");
    if (!phone) {
      invalid.push({ row: i + 2, phone: row[phoneHeader] ?? "" });
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);

    const customFields: Record<string, string> = {};
    for (const h of customHeaders) {
      if (row[h] !== undefined && row[h] !== "") customFields[h] = row[h];
    }
    rows.push({
      phone,
      firstName: firstHeader ? row[firstHeader] || null : null,
      lastName: lastHeader ? row[lastHeader] || null : null,
      email: emailHeader ? row[emailHeader] || null : null,
      customFields: Object.keys(customFields).length ? JSON.stringify(customFields) : null,
    });
  }

  let imported = 0;
  let updated = 0;

  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const phones = chunk.map((r) => r.phone);

    const existing = await db.contact.findMany({
      where: { tenantId, phone: { in: phones } },
      select: { id: true, phone: true, firstName: true, lastName: true, email: true, customFields: true },
    });
    const existingByPhone = new Map(existing.map((c) => [c.phone, c]));

    // Bulk-insert brand-new contacts
    const fresh = chunk.filter((r) => !existingByPhone.has(r.phone));
    if (fresh.length) {
      await db.contact.createMany({ data: fresh.map((r) => ({ ...r, tenantId })) });
      imported += fresh.length;
    }

    // Update existing contacts — only fill blanks, never clobber
    for (const r of chunk) {
      const ex = existingByPhone.get(r.phone);
      if (!ex) continue;
      const needsUpdate =
        (!ex.firstName && r.firstName) ||
        (!ex.lastName && r.lastName) ||
        (!ex.email && r.email) ||
        r.customFields;
      if (needsUpdate) {
        await db.contact.update({
          where: { id: ex.id },
          data: {
            firstName: ex.firstName ?? r.firstName,
            lastName: ex.lastName ?? r.lastName,
            email: ex.email ?? r.email,
            customFields: mergeCustomFields(ex.customFields, r.customFields),
          },
        });
      }
      updated++;
    }

    // Bulk list memberships for the whole chunk
    if (targetListId) {
      const chunkContacts = await db.contact.findMany({
        where: { tenantId, phone: { in: phones } },
        select: { id: true },
      });
      const ids = chunkContacts.map((c) => c.id);
      const already = await db.listMembership.findMany({
        where: { listId: targetListId, contactId: { in: ids } },
        select: { contactId: true },
      });
      const alreadySet = new Set(already.map((m) => m.contactId));
      const newMembers = ids.filter((cid) => !alreadySet.has(cid));
      if (newMembers.length) {
        await db.listMembership.createMany({
          data: newMembers.map((contactId) => ({ contactId, listId: targetListId! })),
        });
      }
    }
  }

  return NextResponse.json({
    imported,
    updated,
    invalidCount: invalid.length,
    invalid: invalid.slice(0, 25),
    listId: targetListId,
    detectedColumns: { phone: phoneHeader, firstName: firstHeader, lastName: lastHeader, email: emailHeader, custom: customHeaders },
  });
}

function mergeCustomFields(existing: string | null, incoming: string | null): string | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  try {
    return JSON.stringify({ ...JSON.parse(existing), ...JSON.parse(incoming) });
  } catch {
    return incoming;
  }
}
