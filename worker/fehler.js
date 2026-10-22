// Fehler aus App und Server — für das Betriebs-Dashboard.
//
// Gespeichert wird nur das Technische: die Meldung, wo sie auftrat, wie oft und
// bei wie vielen Personen. Keine Inhalte, keine Namen. Gleiche Fehler werden
// zusammengezählt statt neu angelegt, und mehr als TAGESGRENZE Meldungen am Tag
// nimmt die App nicht an — eine Schleife in einem Browser soll nicht den
// kostenlosen Rahmen der Datenbank aufbrauchen. Nach 30 Tagen räumt der Wecker auf.

const TAGESGRENZE = 200;
const ZAEHLER = "fehler_tag";

async function kennung(text) {
  const roh = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(roh)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pfade ohne Kennungen, damit gleiche Fehler zusammenkommen: /api/claims/…/decide */
export function ortOhneKennung(pfad) {
  return String(pfad ?? "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "…")
    .replace(/\/\d{3,}(?=\/|$)/g, "/…")
    .slice(0, 100);
}

/** Einen Fehler festhalten. Scheitert still — ein Fehler beim Melden darf nichts weiter kaputt machen. */
export async function fehlerMerken(env, { quelle, nachricht, ort = "" }, wer = null) {
  try {
    if (!["app", "server"].includes(quelle)) return { ok: false };
    const text = String(nachricht ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!text) return { ok: false };
    const wo = String(ort ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

    const heute = new Date().toISOString().slice(0, 10);
    const z = await env.DB.prepare("select wert from einstellungen where schluessel = ?1").bind(ZAEHLER).first();
    const stand = z ? JSON.parse(z.wert) : null;
    const n = stand?.tag === heute ? stand.n : 0;
    if (n >= TAGESGRENZE) return { ok: false, grenze: true };

    const id = await kennung(`${quelle}|${text}|${wo}`);
    const schritte = [
      env.DB.prepare(
        `insert into fehler (id, quelle, nachricht, ort) values (?1, ?2, ?3, ?4)
         on conflict (id) do update set anzahl = anzahl + 1, zuletzt = datetime('now'), erledigt_am = null`
      ).bind(id, quelle, text, wo),
      env.DB.prepare(`insert into einstellungen (schluessel, wert) values (?1, ?2)
                      on conflict (schluessel) do update set wert = excluded.wert`)
        .bind(ZAEHLER, JSON.stringify({ tag: heute, n: n + 1 }))
    ];
    if (wer) schritte.push(env.DB.prepare("insert or ignore into fehler_wer (fehler_id, wer) values (?1, ?2)").bind(id, wer));
    await env.DB.batch(schritte);
    return { ok: true };
  } catch (e) {
    console.log(`Fehler ließ sich nicht merken: ${e.message}`);
    return { ok: false };
  }
}

/** Älter als 30 Tage? Weg. Läuft im morgendlichen Wecker. */
export async function fehlerAufraeumen(env) {
  await env.DB.prepare("delete from fehler where zuletzt < datetime('now', '-30 days')").run();
}
