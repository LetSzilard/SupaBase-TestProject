import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supabase környezeti változók
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function runSeeder() {
  const summary: { inserted: number; updated: number; errors: string[] } = {
    inserted: 0,
    updated: 0,
    errors: [],
  };

  try {
    // 1️⃣ JSON letöltése Storage-ból
    const { data, error: storageError } = await supabase
      .storage
      .from("Feeds")
      .download("sources.json");

    if (storageError || !data) {
      summary.errors.push(`Hiba a Storage-ból letöltéskor: ${storageError?.message ?? "ismeretlen hiba"}`);
      return summary;
    }

    const jsonText = await data.text();
    const sourcesArray: any[] = JSON.parse(jsonText);

    // 2️⃣ Feldolgozás és upsert a sources táblába
    for (const source of sourcesArray) {
      try {
        // Ellenőrizzük, van-e már ilyen feed_url
        const { data: existingData, error: existingError } = await supabase
          .from("sources")
          .select("*")
          .eq("feed_url", source.feed_url)
          .limit(1)
          .single();

        if (existingError && existingError.code !== "PGRST116") { // nincs találat
          summary.errors.push(`Lekérdezési hiba: ${existingError.message}`);
          continue;
        }

        const record: any = {
          site_name: source.site_name,
          feed_url: source.feed_url,
          site_url: source.site_url,
          active: source.active ?? true,
          language: source.language ?? null,
          category: source.category ?? null,
          etag: null,
          last_modified: null,
          last_fetched_at: null,
        };

        // Ha már létezik, tartsuk meg a created_at-ot
        if (existingData) {
          record.created_at = existingData.created_at;
          const { error: updateErr } = await supabase
            .from("sources")
            .update(record)
            .eq("id", existingData.id);
          if (updateErr) {
            summary.errors.push(`Update hiba [${source.site_name}]: ${updateErr.message}`);
          } else {
            summary.updated += 1;
          }
        } else {
          // Új sor beszúrása
          record.created_at = new Date().toISOString();
          const { error: insertErr } = await supabase
            .from("sources")
            .insert(record);
          if (insertErr) {
            summary.errors.push(`Insert hiba [${source.site_name}]: ${insertErr.message}`);
          } else {
            summary.inserted += 1;
          }
        }

      } catch (itemErr: any) {
        summary.errors.push(`Item feldolgozási hiba [${source.site_name}]: ${itemErr.message}`);
      }
    }

  } catch (err: any) {
    summary.errors.push(`Fő futási hiba: ${err.message}`);
  }

  return summary;
}

// HTTP handler
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
    const summary = await runSeeder();
    return new Response(JSON.stringify({ ok: true, ...summary }, null, 2), { status: 200, headers });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers });
  }
});
