// Die wöchentliche Sicherung der Datenbank.
//
// Einmal pro Woche lässt der Worker Cloudflare die ganze Datenbank als SQL-Datei
// exportieren und legt sie im Speicher SICHERUNG ab (R2, auf die EU festgelegt).
// Der Wecker läuft jeden Morgen und sichert, sobald die letzte Sicherung älter als
// 6½ Tage ist. Schlägt eine fehl, versucht er es am nächsten Morgen wieder; der
// Fehler steht im Dashboard. Kopien, die älter als 28 Tage sind, löscht er jeden
// Morgen — so steht es in der Datenschutzerklärung (spätestens nach 30 Tagen).
//
// Der Export läuft über die Schnittstelle von Cloudflare. Er braucht ein API-Token
// mit dem Recht „D1 bearbeiten“, hinterlegt als Geheimnis D1_SICHERUNG_TOKEN. Während
// des Exports beantwortet die Datenbank keine Abfragen — bei unserer Größe ein, zwei
// Sekunden. Zurückholen: siehe README, Abschnitt „Sicherung“.

import { fehlerMerken } from "./fehler.js";

const SCHLUESSEL = "sicherung";
const ORDNER = "sicherung/";
const TAG = 24 * 3600e3;
const ALLE = 6.5 * TAG;
const HALTEN = 28 * TAG;
const WARTEN = 2000; // zwischen zwei Nachfragen, ob der Export fertig ist
const NACHFRAGEN = 30; // also höchstens eine Minute

/** Der Stand der letzten Sicherung: { am, datei, groesse, kopien, fehler?, fehlerAm? } */
export async function sicherungsStand(env) {
  const z = await env.DB.prepare("select wert from einstellungen where schluessel = ?1").bind(SCHLUESSEL).first();
  return z ? JSON.parse(z.wert) : null;
}

async function merken(env, stand) {
  await env.DB.prepare(`insert into einstellungen (schluessel, wert) values (?1, ?2)
                        on conflict (schluessel) do update set wert = excluded.wert`)
    .bind(SCHLUESSEL, JSON.stringify(stand)).run();
}

/** Für den Wecker: alte Kopien löschen, dann sichern, wenn die letzte älter als 6½ Tage ist. */
export async function sicherungNachziehen(env, jetzt = new Date()) {
  const stand = await sicherungsStand(env);
  const kopien = await aufraeumen(env, jetzt);
  if (stand && kopien !== null && kopien !== stand.kopien) await merken(env, { ...stand, kopien });
  if (!stand?.am || jetzt - Date.parse(stand.am) >= ALLE) return sichern(env, { zeit: jetzt });
  return { ok: true, uebersprungen: true };
}

/**
 * Eine Sicherung jetzt. Wirft nie: Ein Fehler landet im Stand und in der Fehlerliste
 * des Dashboards. `zeit` gibt es nur, damit Tests eine alte Sicherung anlegen können.
 */
export async function sichern(env, { zeit = new Date() } = {}) {
  const vorher = (await sicherungsStand(env)) || {};
  try {
    if (!env.SICHERUNG) throw new Error("Kein Speicher für Sicherungen eingerichtet (R2-Bindung SICHERUNG fehlt)");
    if (!env.D1_SICHERUNG_TOKEN) throw new Error("Kein Token für den Export hinterlegt (Geheimnis D1_SICHERUNG_TOKEN)");
    const fertig = await exportieren(env);
    const download = await fetch(fertig.signed_url);
    if (!download.ok) throw new Error(`Die exportierte Datei ließ sich nicht laden (${download.status})`);
    const datei = `${ORDNER}${zeit.toISOString().slice(0, 19).replace(/:/g, "-")}Z.sql`;
    // Mit bekannter Länge fließt die Datei direkt in den Speicher, sonst erst ganz laden.
    const laenge = Number(download.headers.get("content-length")) > 0;
    const objekt = await env.SICHERUNG.put(datei, laenge ? download.body : await download.arrayBuffer(), {
      httpMetadata: { contentType: "application/sql" },
      customMetadata: { export: String(fertig.filename || "") }
    });
    const stand = { am: zeit.toISOString(), datei, groesse: objekt.size, kopien: await aufraeumen(env, new Date()) };
    await merken(env, stand);
    return { ok: true, ...stand };
  } catch (fehler) {
    const stand = { ...vorher, fehler: fehler.message, fehlerAm: zeit.toISOString() };
    await merken(env, stand).catch(() => {});
    await fehlerMerken(env, { quelle: "server", nachricht: `Sicherung: ${fehler.message}`, ort: "sicherung" });
    return { ok: false, ...stand };
  }
}

/** Startet den Export bei Cloudflare und fragt nach, bis die Datei bereitliegt. */
async function exportieren(env) {
  const basis = env.SICHERUNG_API || "https://api.cloudflare.com/client/v4";
  const adresse = `${basis}/accounts/${env.CF_KONTO}/d1/database/${env.DB_ID}/export`;
  const fragen = async (inhalt) => {
    const antwort = await fetch(adresse, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.D1_SICHERUNG_TOKEN}` },
      body: JSON.stringify(inhalt)
    });
    const daten = await antwort.json().catch(() => null);
    if (antwort.status === 401 || antwort.status === 403) {
      throw new Error(`Cloudflare lehnt das Token ab (${antwort.status}) — braucht das Recht „D1 bearbeiten“`);
    }
    if (!antwort.ok || !daten?.success) {
      throw new Error(`Cloudflare hat den Export abgelehnt: ${daten?.errors?.[0]?.message || antwort.status}`);
    }
    return daten.result || {};
  };

  let lage = await fragen({ output_format: "polling" });
  const lesezeichen = lage.at_bookmark;
  if (!lesezeichen) throw new Error("Cloudflare hat den Export ohne Lesezeichen gestartet");
  for (let i = 0; ; i++) {
    if (lage.status === "error") throw new Error(`Der Export ist fehlgeschlagen: ${lage.error || "ohne Angabe"}`);
    // Die Beschreibung bei Cloudflare nennt result.result.signed_url, ihr Beispiel result.signed_url.
    const fertig = lage.result?.signed_url ? lage.result : lage.signed_url ? lage : null;
    if (fertig) return fertig;
    if (lage.status === "complete") throw new Error("Der Export ist fertig, aber ohne Adresse zum Herunterladen");
    if (i >= NACHFRAGEN) throw new Error("Der Export dauert länger als eine Minute");
    await new Promise((weiter) => setTimeout(weiter, WARTEN));
    lage = await fragen({ output_format: "polling", current_bookmark: lesezeichen });
  }
}

/** Löscht Kopien, die älter als 28 Tage sind. Gibt zurück, wie viele bleiben (null: kein Speicher). */
export async function aufraeumen(env, jetzt = new Date()) {
  if (!env.SICHERUNG) return null;
  const { objects } = await env.SICHERUNG.list({ prefix: ORDNER, limit: 1000 });
  const alt = objects.filter((o) => jetzt - zeitVon(o) > HALTEN);
  if (alt.length) await env.SICHERUNG.delete(alt.map((o) => o.key));
  return objects.length - alt.length;
}

/** Wann eine Kopie entstand: aus ihrem Namen (sicherung/2026-11-08T06-00-12Z.sql), sonst vom Hochladen. */
function zeitVon(objekt) {
  const m = objekt.key.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : +new Date(objekt.uploaded);
}
