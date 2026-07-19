import { db } from "./db";
import { appBaseUrl } from "./twilio";

/**
 * Link tracking. At send time we rewrite each URL in a campaign body to a short
 * capability link — /l/<code>/<contactId> — that logs the click and 302s to the
 * original. One TrackedLink row per (campaign, URL); click rows are created
 * lazily on the redirect (clicks are far rarer than sends, so this stays cheap
 * even at 100k+ recipients).
 */

// Matches http(s) URLs up to the next whitespace.
const URL_RE = /https?:\/\/[^\s]+/g;

const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars

function randomCode(len = 7): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    // crypto.getRandomValues avoids Math.random; available in Node 18+ / Edge.
    const idx = crypto.getRandomValues(new Uint8Array(1))[0] % CODE_ALPHABET.length;
    out += CODE_ALPHABET[idx];
  }
  return out;
}

function extractUrls(body: string): string[] {
  return [...new Set(body.match(URL_RE) ?? [])];
}

/**
 * Get-or-create a short code for every distinct URL in a campaign body. Returns
 * a map of originalUrl -> code so the per-contact loop can rewrite without any
 * DB round-trips.
 */
export async function buildLinkMap(opts: {
  tenantId: string;
  campaignId: string;
  body: string;
}): Promise<Map<string, string>> {
  const urls = extractUrls(opts.body);
  const map = new Map<string, string>();
  for (const url of urls) {
    const existing = await db.trackedLink.findUnique({
      where: { campaignId_targetUrl: { campaignId: opts.campaignId, targetUrl: url } },
    });
    if (existing) {
      map.set(url, existing.code);
      continue;
    }
    // Create with a unique code (retry on the rare collision).
    let created = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      try {
        created = await db.trackedLink.create({
          data: { tenantId: opts.tenantId, campaignId: opts.campaignId, code: randomCode(), targetUrl: url },
        });
      } catch {
        // unique violation on code -> try again; unique on (campaign,url) -> fetch
        const again = await db.trackedLink.findUnique({
          where: { campaignId_targetUrl: { campaignId: opts.campaignId, targetUrl: url } },
        });
        if (again) {
          created = again;
        }
      }
    }
    if (created) map.set(url, created.code);
  }
  return map;
}

/** Rewrite a rendered body's URLs to tracked short links for one contact. */
export function rewriteLinks(body: string, map: Map<string, string>, contactId: string): string {
  if (map.size === 0) return body;
  const base = appBaseUrl();
  return body.replace(URL_RE, (url) => {
    const code = map.get(url);
    return code ? `${base}/l/${code}/${contactId}` : url;
  });
}
