import type { Prisma } from "@prisma/client";

/**
 * Segment definition — a saved audience filter. Kept intentionally small and
 * fully relational so it resolves to an efficient Prisma `where` even at scale.
 */
export type SegmentDefinition = {
  listIds?: string[]; // contact belongs to ANY of these lists
  tags?: string[]; // contact has these tags
  tagMatch?: "any" | "all"; // how to combine tags (default: any)
  engagement?: "clicked" | "replied" | null; // behavioral filter
};

export function parseDefinition(raw: string | null | undefined): SegmentDefinition {
  if (!raw) return {};
  try {
    const d = JSON.parse(raw) as SegmentDefinition;
    return {
      listIds: Array.isArray(d.listIds) ? d.listIds.filter(Boolean) : undefined,
      tags: Array.isArray(d.tags) ? d.tags.map(String).filter(Boolean) : undefined,
      tagMatch: d.tagMatch === "all" ? "all" : "any",
      engagement: d.engagement === "clicked" || d.engagement === "replied" ? d.engagement : null,
    };
  } catch {
    return {};
  }
}

/**
 * Build a Prisma Contact `where` for a segment. Always scoped to the tenant and
 * always excludes opted-out contacts (suppression is mirrored onto optedOut).
 */
export function segmentWhere(tenantId: string, def: SegmentDefinition): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [{ tenantId, optedOut: false }];

  if (def.listIds?.length) {
    and.push({ memberships: { some: { listId: { in: def.listIds } } } });
  }

  if (def.tags?.length) {
    if ((def.tagMatch ?? "any") === "all") {
      // Must have every tag → one relation filter per tag.
      for (const tag of def.tags) and.push({ tagLinks: { some: { tag } } });
    } else {
      and.push({ tagLinks: { some: { tag: { in: def.tags } } } });
    }
  }

  if (def.engagement === "clicked") {
    and.push({ linkClicks: { some: {} } });
  } else if (def.engagement === "replied") {
    and.push({ messages: { some: { direction: "inbound" } } });
  }

  return { AND: and };
}

/** Human summary of a segment for the UI. */
export function describeSegment(def: SegmentDefinition, listNames?: Record<string, string>): string {
  const parts: string[] = [];
  if (def.listIds?.length) {
    const names = def.listIds.map((id) => listNames?.[id] ?? "a list");
    parts.push(`in ${names.join(" or ")}`);
  }
  if (def.tags?.length) {
    parts.push(`tagged ${def.tags.join((def.tagMatch ?? "any") === "all" ? " AND " : " or ")}`);
  }
  if (def.engagement === "clicked") parts.push("clicked a link");
  if (def.engagement === "replied") parts.push("replied");
  return parts.length ? parts.join(" · ") : "all opted-in contacts";
}
