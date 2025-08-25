// Deno Edge Function (Supabase) – RSS fetcher & upserter with GUID+language+etag

import Parser from "https://esm.sh/rss-parser";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["dc:creator", "creator"],
    ],
  },
});

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function deriveGuid(item: any): Promise<string> {
  if (item?.guid) return String(item.guid);
  if (item?.id) return String(item.id);
  if (item?.link) return String(item.link);
  const fallback = `${item?.link ?? ""}|${item?.title ?? ""}|${item?.isoDate ?? ""}`;
  return await sha1Hex(fallback);
}

// function extractImageUrl(item: any): string | null {
//   // 1) Standard enclosure (sok feed használja)
//   if (item?.enclosure?.url) return item.enclosure.url;
//   if (Array.isArray(item?.enclosure) && item.enclosure[0]?.url) return item.enclosure[0].url;

//   // 2) media:content (általában rss-parser -> mediaContent vagy media:content)
//   if (item?.mediaContent) {
//     if (Array.isArray(item.mediaContent)) {
//       const img = item.mediaContent.find((c: any) => c?.$?.url);
//       if (img?.$?.url) return img.$.url;
//     } else if (item.mediaContent?.$?.url) {
//       return item.mediaContent.$.url;
//     }
//   }
//   if (item["media:content"]) {
//     if (Array.isArray(item["media:content"])) {
//       const img = item["media:content"].find((c: any) => c?.$?.url);
//       if (img?.$?.url) return img.$.url;
//     } else if (item["media:content"]?.$?.url) {
//       return item["media:content"].$?.url;
//     }
//   }

//   // 3) media:group -> media:content tömb (CNN tipikus formátum)
//   if (item?.mediaGroup?.[0]?.mediaContent) {
//     const img = item.mediaGroup[0].mediaContent.find((c: any) => c?.$?.url);
//     if (img?.$?.url) return img.$.url;
//   }

//   // 4) media:thumbnail
//   if (item?.mediaThumbnail) {
//     if (Array.isArray(item.mediaThumbnail) && item.mediaThumbnail[0]?.url) {
//       return item.mediaThumbnail[0].url;
//     } else if (item.mediaThumbnail?.url) {
//       return item.mediaThumbnail.url;
//     }
//   }
//   if (item["media:thumbnail"]?.[0]?.$?.url) {
//     return item["media:thumbnail"][0].$.url;
//   }

//   // 5) image vagy thumbnail property
//   if (item?.image?.url) return item.image.url;
//   if (item?.thumbnail?.url) return item.thumbnail.url;

//   // 6) DC terms vagy egyedi feedek (pl. feedburner)
//   if (item["dc:thumbnail"]?.["@_url"]) return item["dc:thumbnail"]["@_url"];

//   return null;
// }

function extractImageUrl(item: any): string | null {
  // Elsődleges források
  const url =
    item?.enclosure?.url ??
    item?.enclosure?.[0]?.url ??
    item?.mediaContent?.[0]?.url ??
    item?.mediaThumbnail?.[0]?.url ??
    item?.image?.url ??
    item?.thumbnail?.url ??
    null;

  if (url) return url;

  // Fallback: description-ből <img> src
  if (item?.description) {
    const match = item.description.match(/<img[^>]+src="([^">]+)"/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}


function extractAuthor(item: any): string | null {
  return item?.creator ?? item?.author ?? null;
}

function extractLanguage(feed: any, xmlText: string, siteName: string): string | null {
  if (feed?.language) return String(feed.language);
  const m = xmlText.match(/<language>\s*([^<]+)\s*<\/language>/i);
  if (m?.[1]) return m[1].trim();

  const name = siteName.toLowerCase();
  if (name.includes("telex") || name.includes("444") || name.includes("hvg") || name.includes("index.hu")) {
    return "hu-HU";
  }
  if (name.includes("bbc") || name.includes("guardian") || name.includes("cnn")) {
    return "en-GB";
  }
  return null;
}

// async function runOnce() {
//   const summary = {
//     sourcesProcessed: 0,
//     itemsProcessed: 0,
//     upsertsTried: 0,
//     upsertsErrored: 0,
//     skippedFeeds: 0,
//     errors: [] as string[],
//   };

//   const { data: sources, error: srcErr } = await supabase
//     .from("sources")
//     .select("id, feed_url, site_name, etag, category");

//   if (srcErr) {
//     summary.errors.push(`Források lekérése sikertelen: ${srcErr.message}`);
//     return summary;
//   }

//   for (const source of sources ?? []) {
//     summary.sourcesProcessed += 1;
//     try {
//       const headers: Record<string, string> = {
//         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
//       };
//       if (source.etag) headers["If-None-Match"] = source.etag;

//       const res = await fetch(source.feed_url, { headers });

//       if (res.status === 304) {
//         summary.skippedFeeds += 1;
//         continue; // nincs új feed
//       }

//       if (!res.ok) throw new Error(`Feed letöltési hiba: HTTP ${res.status}`);

//       const xmlText = await res.text();
//       const feed = await parser.parseString(xmlText);

//       // Nyelv kinyerése prioritásokkal: feed.language > channel XML > site_name/URL
//       let lang: string | null = feed?.language ?? null;
//       const m = xmlText.match(/<language>\s*([^<]+)\s*<\/language>/i);
//       if (!lang && m?.[1]) lang = m[1].trim();

//       // Ha nincs nyelv, próbáljuk URL vagy site_name alapján
//       if (!lang) {
//         const name = source.site_name.toLowerCase();
//         const url = source.feed_url.toLowerCase();
//         if (name.includes("telex") || name.includes("444") || name.includes("hvg") || name.includes("index.hu") || url.includes(".hu")) lang = "hu-HU";
//         else if (name.includes("bbc") || name.includes("guardian") || name.includes("cnn") || url.includes(".com")) lang = "en-GB";
//       }

//       // Nyelv normalizálása
//       let normalizedLang = lang?.toLowerCase() ?? "";
//       if (normalizedLang.startsWith("en")) normalizedLang = "angol";
//       else if (normalizedLang.startsWith("hu")) normalizedLang = "magyar";
//       else normalizedLang = normalizedLang; // marad az eredeti, ha nem angol/magyar

//       const newEtag = res.headers.get("etag");

//       for (const item of feed.items ?? []) {
//         summary.itemsProcessed += 1;
//         try {
//           const guid = await deriveGuid(item);

//           // Kép kinyerése
//           const imageUrl = extractImageUrl(item);

//           // Szerző kinyerése
//           const author = extractAuthor(item);

//           const publishedAt = item?.isoDate ? new Date(item.isoDate).toISOString() : new Date().toISOString();

//           // Kategória normalizálása a source-ból
//           const category = source.category ?? null;

//           const record: Record<string, any> = {
//             guid,
//             source_id: source.id,
//             url: item?.link ?? null,
//             title: item?.title ?? null,
//             author_name: author,
//             summary: item?.contentSnippet ?? null,
//             description: item?.contentSnippet ?? item?.content ?? null,
//             content: item?.content ?? null,
//             image_url: imageUrl,
//             language: normalizedLang,
//             category,
//             published_at: publishedAt,
//             updated_at: new Date().toISOString(),
//           };

//           const { error: upsertError } = await supabase
//             .from("articles")
//             .upsert(record, { onConflict: "guid" });

//           summary.upsertsTried += 1;
//           if (upsertError) {
//             summary.upsertsErrored += 1;
//             summary.errors.push(
//               `Upsert hiba [${source.site_name} | ${record.title ?? guid}]: ${upsertError.message}`
//             );
//           }
//         } catch (itemErr: any) {
//           summary.upsertsErrored += 1;
//           summary.errors.push(
//             `Item feldolgozási hiba [${source.site_name}]: ${itemErr?.message ?? String(itemErr)}`
//           );
//         }
//       }

//       // Frissítjük a sources táblában az új ETag-et
//       if (newEtag) {
//         const { error: etagError } = await supabase
//           .from("sources")
//           .update({ etag: newEtag })
//           .eq("id", source.id);
//         if (etagError) summary.errors.push(`ETag frissítési hiba [${source.site_name}]: ${etagError.message}`);
//       }
//     } catch (err: any) {
//       summary.errors.push(`Feed feldolgozási hiba (${source.site_name}): ${err?.message ?? String(err)}`);
//     }
//   }

//   return summary;
// }

async function runOnce() {
  const summary = {
    sourcesProcessed: 0,
    itemsProcessed: 0,
    upsertsTried: 0,
    upsertsErrored: 0,
    skippedFeeds: 0,
    errors: [] as string[],
  };

  const { data: sources, error: srcErr } = await supabase
    .from("sources")
    .select("id, feed_url, site_name, etag");

  if (srcErr) {
    summary.errors.push(`Források lekérése sikertelen: ${srcErr.message}`);
    return summary;
  }

  for (const source of sources ?? []) {
    summary.sourcesProcessed += 1;
    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
      };
      if (source.etag) headers["If-None-Match"] = source.etag;

      const res = await fetch(source.feed_url, { headers });

      if (res.status === 304) {
        summary.skippedFeeds += 1;
        continue; // nincs új feed
      }

      if (!res.ok) throw new Error(`Feed letöltési hiba: HTTP ${res.status}`);

      const xmlText = await res.text();
      const feed = await parser.parseString(xmlText);

      // --- Language normalizálás ---
      function normalizeLanguage(lang: string | null): string | null {
        if (!lang) return null;
        const lower = lang.toLowerCase();
        if (lower.startsWith("hu")) return "magyar";
        if (lower.startsWith("en")) return "angol";
        return lang; // egyébként változatlanul
      }

      const languageFromFeed = extractLanguage(feed, xmlText, source.site_name);
      const language = normalizeLanguage(languageFromFeed);

      const newEtag = res.headers.get("etag");

      for (const item of feed.items ?? []) {
        summary.itemsProcessed += 1;
        try {
          const guid = await deriveGuid(item);
          const imageUrl = extractImageUrl(item);
          const author = extractAuthor(item);

          const publishedAt = item?.isoDate ? new Date(item.isoDate).toISOString() : new Date().toISOString();

          const record: Record<string, any> = {
            guid,
            source_id: source.id,
            url: item?.link ?? null,
            title: item?.title ?? null,
            author_name: author,
            summary: item?.contentSnippet ?? null,
            description: item?.contentSnippet ?? item?.content ?? null,
            content: item?.content ?? null,
            image_url: imageUrl,
            language,
            published_at: publishedAt,
            updated_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabase
            .from("articles")
            .upsert(record, { onConflict: "guid" }); // GUID az egyedi kulcs

          summary.upsertsTried += 1;
          if (upsertError) {
            summary.upsertsErrored += 1;
            summary.errors.push(
              `Upsert hiba [${source.site_name} | ${record.title ?? guid}]: ${upsertError.message}`
            );
          }
        } catch (itemErr: any) {
          summary.upsertsErrored += 1;
          summary.errors.push(
            `Item feldolgozási hiba [${source.site_name}]: ${itemErr?.message ?? String(itemErr)}`
          );
        }
      }

      // Frissítjük a sources táblában az új ETag-et
      if (newEtag) {
        const { error: etagError } = await supabase
          .from("sources")
          .update({ etag: newEtag })
          .eq("id", source.id);
        if (etagError) summary.errors.push(`ETag frissítési hiba [${source.site_name}]: ${etagError.message}`);
      }
    } catch (err: any) {
      summary.errors.push(`Feed feldolgozási hiba (${source.site_name}): ${err?.message ?? String(err)}`);
    }
  }

  return summary;
}


// HTTP handler + CORS + OPTIONS
Deno.serve(async (req) => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const summary = await runOnce();
    return new Response(JSON.stringify({ ok: true, ...summary }, null, 2), {
      status: 200,
      headers,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers,
    });
  }
});
