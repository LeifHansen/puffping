import type { Contact } from "@prisma/client";

/**
 * Dynamic field rendering. Supports {{first_name}}, {{last_name}}, {{phone}},
 * {{email}}, any custom CSV column by its snake_cased header, and fallbacks
 * via {{first_name|there}}.
 */
export function renderTemplate(body: string, contact: ContactLike): string {
  const fields = contactFields(contact);
  return body.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_m, key: string, fallback?: string) => {
    const value = fields[key.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
    return fallback ?? "";
  });
}

export type ContactLike = Pick<Contact, "phone" | "firstName" | "lastName" | "email" | "customFields">;

function contactFields(contact: ContactLike): Record<string, string> {
  const fields: Record<string, string> = {
    first_name: contact.firstName ?? "",
    last_name: contact.lastName ?? "",
    phone: contact.phone,
    email: contact.email ?? "",
  };
  if (contact.customFields) {
    try {
      const custom = JSON.parse(contact.customFields) as Record<string, unknown>;
      for (const [k, v] of Object.entries(custom)) {
        fields[snakeCase(k)] = v == null ? "" : String(v);
      }
    } catch {
      // ignore malformed custom fields
    }
  }
  return fields;
}

export function snakeCase(s: string): string {
  return s
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

/** Estimate SMS segment count for a message body. */
export function segmentCount(body: string): { segments: number; encoding: "GSM-7" | "UCS-2"; chars: number } {
  let gsm = true;
  let len = 0;
  for (const ch of body) {
    if (GSM7.includes(ch)) len += 1;
    else if (GSM7_EXT.includes(ch)) len += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    const segments = len <= 160 ? 1 : Math.ceil(len / 153);
    return { segments, encoding: "GSM-7", chars: len };
  }
  const chars = [...body].length;
  const segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { segments, encoding: "UCS-2", chars };
}
