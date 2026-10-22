// Der Pilot: Einladungen, das Tor vor der Anmeldung und Gründen nur mit Einladung.
//
// Solange der Pilot läuft (einstellungen.pilot_pflicht, fehlt = ja), legt die
// Google-Anmeldung ein neues Konto nur an, wenn vorher eine gültige Einladung
// geprüft wurde: ein Pilot-Code (HOMI-7K3-PQ8) oder der Code eines Haushalts.
// Die geprüfte Einladung reist als Keks durch die Anmeldung. Von jemandem ohne
// Einladung wird nichts gespeichert. Wer schon ein Konto hat, kommt immer herein.
//
// Einen Haushalt gründen darf nur, wer eine Pilot-Einladung angenommen hat — eine
// pro Haushalt. Die anderen kommen mit dem Code des Haushalts dazu.

import { keks } from "./auth.js";

export const EINLADUNG = "hq_einladung";
const PFLICHT = "pilot_pflicht";
// Ohne 0/O, 1/I/L — was man am Telefon verwechselt, kommt nicht vor.
const ZEICHEN = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

class Fehler extends Error {
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
}

export function neuerCode() {
  const zufall = crypto.getRandomValues(new Uint8Array(6));
  const z = [...zufall].map((b) => ZEICHEN[b % ZEICHEN.length]).join("");
  return `HOMI-${z.slice(0, 3)}-${z.slice(3)}`;
}

/** Was jemand eingetippt hat, in die Form der Datenbank: HOMI-7K3-PQ8 oder sechs Ziffern. */
export function codeSauber(roh) {
  const text = String(roh ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
  if (/^\d{6}$/.test(text)) return { art: "haushalt", code: text };
  const ohne = text.startsWith("HOMI") ? text.slice(4) : text;
  if (/^[A-Z0-9]{6}$/.test(ohne)) return { art: "pilot", code: `HOMI-${ohne.slice(0, 3)}-${ohne.slice(3)}` };
  return null;
}

export async function pilotPflicht(env) {
  const z = await env.DB.prepare("select wert from einstellungen where schluessel = ?1").bind(PFLICHT).first();
  return z ? z.wert !== "nein" : true;
}

export async function pilotSetzen(env, an) {
  await env.DB.prepare(`insert into einstellungen (schluessel, wert) values (?1, ?2)
                        on conflict (schluessel) do update set wert = excluded.wert`)
    .bind(PFLICHT, an ? "ja" : "nein").run();
  return { pflicht: Boolean(an) };
}

/** Prüft eine Einladung. Gibt { art, code } zurück oder wirft mit einem Satz, der sagt, was los ist. */
export async function einladungPruefen(env, roh) {
  const c = codeSauber(roh);
  if (!c) throw new Fehler("So sieht kein Code aus — Einladungen beginnen mit HOMI, Haushaltscodes sind sechs Ziffern");
  if (c.art === "haushalt") {
    const paar = await env.DB.prepare(
      `select c.id, c.groesse, (select count(*) from members m where m.couple_id = c.id) as personen
         from couples c where c.pair_code = ?1 and c.pair_code_expires > datetime('now')`
    ).bind(c.code).first();
    if (!paar) throw new Fehler("Diesen Haushaltscode gibt es nicht oder nicht mehr — er gilt 24 Stunden. Frag nach einem neuen.");
    if (paar.personen >= paar.groesse) throw new Fehler("Dieser Haushalt ist schon vollständig");
    return c;
  }
  const e = await env.DB.prepare(
    "select angenommen_von, gegruendet_am, zurueckgezogen_am from einladungen where code = ?1"
  ).bind(c.code).first();
  if (!e) throw new Fehler("Diese Einladung kennen wir nicht. Tippfehler? Sonst frag bei der Person nach, die dich eingeladen hat.");
  if (e.zurueckgezogen_am) throw new Fehler("Diese Einladung gilt nicht mehr");
  if (e.gegruendet_am) throw new Fehler("Mit dieser Einladung ist schon ein Haushalt gegründet. Wohnst du dort? Dann frag nach dem Code eures Haushalts.");
  if (e.angenommen_von) throw new Fehler("Diese Einladung ist schon angenommen. Warst du das? Dann melde dich über „Ich bin schon dabei“ an.");
  return c;
}

/** Die vor der Anmeldung geprüfte Einladung — noch einmal geprüft, denn seitdem kann sie verbraucht sein. */
export async function einladungAusKeks(env, request) {
  const roh = keks(request, EINLADUNG);
  if (!roh) return null;
  try {
    return await einladungPruefen(env, roh);
  } catch {
    return null;
  }
}

/** Wer mit einer Pilot-Einladung hereinkommt, hält sie, bis er gründet. Höchstens eine zugleich,
 *  und nur, wer noch in keinem Haushalt ist. */
export async function einladungAnnehmen(env, code, wer) {
  await env.DB.prepare(
    `update einladungen set angenommen_von = ?2, angenommen_am = datetime('now')
      where code = ?1 and angenommen_von is null and gegruendet_am is null and zurueckgezogen_am is null
        and not exists (select 1 from einladungen where angenommen_von = ?2 and gegruendet_am is null
                                                     and zurueckgezogen_am is null)
        and not exists (select 1 from members where user_id = ?2)`
  ).bind(code, wer).run();
}

/** Darf diese Person einen Haushalt gründen? Ohne Pilot immer, im Pilot nur mit angenommener Einladung. */
export async function gruendenErlaubt(env, ich) {
  if (!(await pilotPflicht(env))) return true;
  const e = await env.DB.prepare(
    `select 1 from einladungen where angenommen_von = ?1 and gegruendet_am is null and zurueckgezogen_am is null`
  ).bind(ich.id).first();
  return Boolean(e);
}

/** Die Anweisung, die beim Gründen die Einladung einlöst — läuft im selben Batch wie das Gründen. */
export function einloesen(env, ich, paar) {
  return env.DB.prepare(
    `update einladungen set haushalt = ?2, gegruendet_am = datetime('now')
      where code = (select code from einladungen where angenommen_von = ?1 and gegruendet_am is null
                                                   and zurueckgezogen_am is null order by angenommen_am limit 1)`
  ).bind(ich.id, paar);
}

/** Für den Betrieb: eine neue Einladung mit einem Namen, den nur der Betrieb sieht. */
export async function einladungAnlegen(env, name) {
  const sauber = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!sauber) throw new Fehler("Gib der Einladung einen Namen — nur du siehst ihn");
  for (let versuch = 0; versuch < 5; versuch++) {
    const code = neuerCode();
    const r = await env.DB.prepare("insert or ignore into einladungen (code, name) values (?1, ?2)").bind(code, sauber).run();
    if (r.meta.changes) return { code, name: sauber };
  }
  throw new Fehler("Gerade ließ sich kein freier Code finden — bitte noch einmal", 500);
}

export async function einladungZurueckziehen(env, code) {
  const r = await env.DB.prepare(
    `update einladungen set zurueckgezogen_am = datetime('now')
      where code = ?1 and gegruendet_am is null and zurueckgezogen_am is null`
  ).bind(String(code)).run();
  if (!r.meta.changes) throw new Fehler("Diese Einladung lässt sich nicht mehr zurückziehen");
  return { ok: true };
}
