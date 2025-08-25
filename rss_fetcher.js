// rss_fetcher.js
// Futtatás: node rss_fetcher.js
// (A projekt package.json-jában legyen "type": "module", vagy nevezd át .mjs-re.)

import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";

// --- Supabase beállítások ---
const supabaseUrl = "https://lcqvsevemstgtdncqoki.supabase.co";
// FIGYELEM: szerveroldalon használd a service_role kulcsot (NE tedd a frontendbe!)
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjcXZzZXZlbXN0Z3RkbmNxb2tpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjAzMDQ2NiwiZXhwIjoyMDcxNjA2NDY2fQ.Ua8Pm0nAtkN2MDhEsHLIIhuuvOLWYfZyWgEvRWLI4Uk";
const supabase = createClient(supabaseUrl, supabaseKey);

// Segédek
const parser = new XMLParser({ ignoreAttributes: false });

function toText(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return toText(v[0]);
  if (typeof v === "object") {
    if (v["#text"]) return v["#text"];
    if (v["@_href"]) return v["@_href"]; // Atom link formátum
  }
  return String(v);
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchFeeds() {
  // 1) Források lekérése
  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("id, feed_url, site_name");

  if (sourcesError) {
    console.error("Hiba a források lekérésekor:", sourcesError);
    return;
  }

  console.log("Források:", sources);

  let totalProcessed = 0;
  for (const source of sources) {
    try {
      const res = await fetch(source.feed_url);
      const xmlText = await res.text();
      const feedData = parser.parse(xmlText);

      // RSS (item) vagy Atom (entry) támogatás
      const items =
        feedData?.rss?.channel?.item ??
        feedData?.feed?.entry ??
        [];

      console.log(`${source.site_name}-ben talált itemek száma: ${items.length}`);

      for (const item of items) {
        // --- URL és GUID kinyerés ---
        const link = toText(item.link) || toText(item.guid);
        if (!link) {
          // Ha nincs link, kihagyjuk, mert az articles.url NOT NULL
          console.warn("Kihagyva (nincs link):", { source: source.site_name, itemTitle: toText(item.title) });
          continue;
        }

        const guid =
          toText(item.guid) ||
          link; // fallback: használjuk a linket guid-ként

        // --- További mezők ---
        const title = toText(item.title) || "Nincs cím";
        const contentHtml = toText(item["content:encoded"]) || toText(item.description) || "";
        const content = contentHtml;
        const summary = stripHtml(contentHtml).slice(0, 300);

        const author =
          toText(item["dc:creator"]) ||
          toText(item.author) ||
          null;

        const pubRaw =
          toText(item.pubDate) ||
          toText(item.updated) ||
          toText(item["dc:date"]) ||
          null;

        const pubDate = pubRaw && !Number.isNaN(Date.parse(pubRaw))
          ? new Date(pubRaw)
          : new Date();

        // Kép (ha van)
        const imageUrl =
          item?.enclosure?.["@_url"] ||
          item?.["media:thumbnail"]?.["@_url"] ||
          item?.["media:content"]?.["@_url"] ||
          null;

        // 2) Upsert guid alapján (url-t MOSTANTÓL MINDIG BEÁLLÍTJUK!)
        const { error: upsertError } = await supabase
          .from("articles")
          .upsert(
            {
              guid,
              url: link,                // <-- EDDIG EZ HIÁNYZOTT, ez okozta a NOT NULL hibát
              title,
              author_name: author,
              summary,
              content,
              image_url: imageUrl,
              published_at: pubDate.toISOString(),
              source_id: source.id,
            },
            { onConflict: ["guid"] }   // guid unique constraint kell hozzá
          );

        if (upsertError) {
          console.error("Hiba a cikk mentésénél:", upsertError);
        } else {
          totalProcessed++;
        }
      }
    } catch (err) {
      console.error(`Hiba a feed lekérésénél: ${source.feed_url}`, err);
    }
  }

  console.log(`RSS feedek feldolgozva. Összes feldolgozott item: ${totalProcessed}`);
}

fetchFeeds();
