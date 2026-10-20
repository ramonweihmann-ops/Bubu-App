// Konto löschen und Haushalt verlassen.
//
// Was einem selbst gehört, geht: Cleanies, Meldungen, Anträge, Erledigungen,
// Nachrichten, die eigene Stimme. Was andere betrifft, bleibt — ohne Namen:
// Bestätigungen ihrer Meldungen, Cleanies, die man ihnen geschenkt hat,
// Aktionen, Events und Urlaube des Haushalts. Dafür bekommt jede Person, die
// geht, einen namenlosen Platzhalter „Ehemaliges Mitglied“ (eine Zeile in users
// ohne E-Mail, ohne Haushalt). Auf ihn zeigt danach, was bleibt.
//
// Ist die Person die letzte erwachsene im Haushalt, geht beim Löschen der ganze
// Haushalt mit, auch die Profile der Kinder; Jugendliche mit eigenem Konto
// behalten ihr Konto, sind dann aber in keinem Haushalt. Verlassen kann die
// letzte Erwachsene den Haushalt nicht — die Kinder stünden sonst allein da.
//
// Alles läuft in einem einzigen batch: entweder ganz oder gar nicht.

import { meldeAlle } from "./melden.js";

class Fehler extends Error {
  constructor(text, status = 400) { super(text); this.status = status; }
}

export const EHEMALIG = "Ehemaliges Mitglied";
const vorname = (n) => String(n || "").split(" ")[0];
const istErwachsen = (m) => Number(m.erwachsen) !== 0 && !m.stufe;
const istKindProfil = (m) => m.stufe === "ohne" || m.stufe === "geraet";

/** Wer im Haushalt ist, und was das für die Person heißt, die geht. */
async function lage(env, ich) {
  const r = await env.DB.prepare(
    `select m.user_id as id, u.name, m.rolle, m.erwachsen, m.stufe, m.joined_at
       from members m join users u on u.id = m.user_id
      where m.couple_id = ?1 order by m.joined_at, m.user_id`
  ).bind(ich.couple_id).all();
  const alle = r.results;
  const mich = alle.find((m) => m.id === ich.id);
  const andere = alle.filter((m) => m.id !== ich.id);
  const andereGrosse = andere.filter(istErwachsen);
  return {
    alle, mich, andere,
    kinderProfile: andere.filter(istKindProfil),
    jugendliche: andere.filter((m) => m.stufe === "gross"),
    // Mit mir geht der Haushalt, wenn danach keine erwachsene Person mehr da ist.
    letzteErwachsene: istErwachsen(mich) && !andereGrosse.length,
    // Wer übernimmt, wenn ich verwalte: die erwachsene Person, die am längsten dabei ist.
    nachfolge: mich.rolle === "verwalter" ? (andereGrosse[0] || andere.find((m) => !istKindProfil(m)) || null) : null
  };
}

/** Den Namen der Person in Texten anderer durch „Ehemaliges Mitglied“ ersetzen —
 *  in den Texten, die die App selbst schreibt: Buchungen, Notizen, Nachrichten. */
export function namenWeg(text, name) {
  let neu = String(text ?? "");
  for (const n of [...new Set([String(name || "").trim(), vorname(name)])].filter((x) => x.length >= 2)) {
    const muster = new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "gu");
    neu = neu.replace(muster, (_, vor, stelle, ganz) => {
      // Gebeugt wie ein Name an dieser Stelle: nach „von“ und Co. im Dativ, am Satzanfang groß.
      const davor = ganz.slice(0, stelle + vor.length);
      const dativ = /(?:^|[^\p{L}])(von|mit|bei|zu|nach|aus|seit)\s*$/iu.test(davor);
      const anfang = /(^|[.!?:„"]\s*)$/.test(davor);
      const wort = dativ ? "einem ehemaligen Mitglied" : "ein ehemaliges Mitglied";
      return vor + (anfang ? wort[0].toUpperCase() + wort.slice(1) : wort);
    });
  }
  return neu;
}

async function namenAnweisungen(env, paar, ich, name) {
  const muster = `%${vorname(name)}%`;
  const anweisungen = [];
  const felder = [
    ["ledger", "reason", "id", "couple_id = ?1 and member_id <> ?2 and reason like ?3"],
    ["claims", "note", "id", "couple_id = ?1 and claimed_by <> ?2 and note like ?3"],
    ["ereignisse", "titel", "id", "couple_id = ?1 and user_id <> ?2 and titel like ?3"],
    ["ereignisse", "text", "id", "couple_id = ?1 and user_id <> ?2 and text like ?3"]
  ];
  for (const [tabelle, feld, schluessel, wo] of felder) {
    const zeilen = await env.DB.prepare(`select ${schluessel} as k, ${feld} as v from ${tabelle} where ${wo}`)
      .bind(paar, ich, muster).all();
    for (const z of zeilen.results) {
      const neu = namenWeg(z.v, name);
      if (neu !== z.v) anweisungen.push(env.DB.prepare(`update ${tabelle} set ${feld} = ?1 where ${schluessel} = ?2`).bind(neu, z.k));
    }
  }
  return anweisungen;
}

/** Die Person verlässt einen Haushalt, in dem andere bleiben. */
async function herausloesen(env, ich, l, { kontoWeg }) {
  const paar = ich.couple_id;
  // Der Platzhalter trägt den Haushalt im Namen: geht der Haushalt, geht er mit.
  const platzhalter = `ehemalig-${paar}-${crypto.randomUUID()}`;
  const P = (sql, ...werte) => env.DB.prepare(sql).bind(...werte);
  const istGross = istErwachsen(l.mich);

  const anweisungen = [
    P("insert into users (id, email, name, name_gesetzt) values (?1, '', ?2, 1)", platzhalter, EHEMALIG),

    // Was andere betrifft, zeigt jetzt auf den Platzhalter.
    P("update claims set decided_by = ?1 where couple_id = ?2 and decided_by = ?3", platzhalter, paar, ich.id),
    P("update claims set rueckfrage_von = ?1 where couple_id = ?2 and rueckfrage_von = ?3", platzhalter, paar, ich.id),
    P("update claims set uebernommen_von = ?1 where couple_id = ?2 and uebernommen_von = ?3", platzhalter, paar, ich.id),
    P("update requests set decided_by = ?1 where couple_id = ?2 and decided_by = ?3", platzhalter, paar, ich.id),
    P("update requests set rueckfrage_von = ?1 where couple_id = ?2 and rueckfrage_von = ?3", platzhalter, paar, ich.id),
    P("update requests set nachhol_von = ?1 where couple_id = ?2 and nachhol_von = ?3", platzhalter, paar, ich.id),
    P("update requests set gutschrift_an = ?1 where couple_id = ?2 and gutschrift_an = ?3 and requested_by <> ?3", platzhalter, paar, ich.id),
    // Geschenke: angenommene bleiben bei den anderen, offene und abgelehnte fallen weg.
    P("delete from transfers where couple_id = ?1 and (to_member = ?2 or (from_member = ?2 and status <> 'bestaetigt'))", paar, ich.id),
    P("update transfers set from_member = ?1 where couple_id = ?2 and from_member = ?3", platzhalter, paar, ich.id),
    // Eigene offene Vorschläge fallen weg, entschiedene sind Geschichte des Haushalts.
    P("delete from proposal_votes where member_id = ?1 and proposal_id in (select id from proposals where couple_id = ?2)", ich.id, paar),
    P("delete from proposals where couple_id = ?1 and created_by = ?2 and status = 'offen'", paar, ich.id),
    P("update proposals set created_by = ?1 where couple_id = ?2 and created_by = ?3", platzhalter, paar, ich.id),
    // Was dem Haushalt gehört, bleibt.
    P("update aktionen set created_by = ?1 where couple_id = ?2 and created_by = ?3", platzhalter, paar, ich.id),
    P("update events set created_by = ?1 where couple_id = ?2 and created_by = ?3", platzhalter, paar, ich.id),
    P("update jubel_gifs set created_by = ?1 where couple_id = ?2 and created_by = ?3", platzhalter, paar, ich.id),
    P("delete from urlaube where couple_id = ?1 and member_id = ?2", paar, ich.id),
    P("update urlaube set created_by = ?1 where couple_id = ?2 and created_by = ?3", platzhalter, paar, ich.id),
    P("update bilder set created_by = null where couple_id = ?1 and created_by = ?2", paar, ich.id),
    P("update kindcodes set created_by = null where couple_id = ?1 and created_by = ?2", paar, ich.id),
    P("update members set einwilligung_von = ?1 where couple_id = ?2 and einwilligung_von = ?3", platzhalter, paar, ich.id),
    // Runden im Plan werden frei, wie bei einem Rücktritt; die Frist bleibt.
    P("update quests set dran = null where couple_id = ?1 and dran = ?2", paar, ich.id),
    P("update quests set zugewiesen = null where couple_id = ?1 and zugewiesen = ?2", paar, ich.id),
    P("delete from bewerbungen where couple_id = ?1 and member_id = ?2", paar, ich.id),
    P("update couples set fair_soll = null, fair_soll_von = null where id = ?1 and fair_soll_von = ?2", paar, ich.id),

    ...(await namenAnweisungen(env, paar, ich.id, l.mich.name)),

    // Was mir gehört, geht: Cleanies, Erledigungen, Anträge, Nachrichten.
    P("delete from ledger where couple_id = ?1 and member_id = ?2", paar, ich.id),
    P("delete from claims where couple_id = ?1 and claimed_by = ?2", paar, ich.id),
    P("delete from requests where couple_id = ?1 and requested_by = ?2", paar, ich.id),
    P("delete from ereignisse where couple_id = ?1 and user_id = ?2", paar, ich.id),
    P("delete from members where user_id = ?1", ich.id),
    // Die Plätze schrumpfen mit.
    P(`update couples set groesse = max(1, groesse - 1),
         erwachsene = case when art = 'familie' and ?2 = 1 then max(1, erwachsene - 1) else erwachsene end,
         kinder = case when art = 'familie' and ?2 = 0 then max(0, kinder - 1) else kinder end
       where id = ?1`, paar, istGross ? 1 : 0)
  ];
  if (l.nachfolge) anweisungen.push(P("update members set rolle = 'verwalter' where user_id = ?1", l.nachfolge.id));
  if (kontoWeg) anweisungen.push(P("delete from users where id = ?1", ich.id));
  await env.DB.batch(anweisungen);

  const wer = vorname(l.mich.name);
  await meldeAlle(env, paar, ich.id, {
    art: "info",
    titel: `${wer} ist nicht mehr dabei`,
    text: `${wer} hat ${kontoWeg ? "das Konto gelöscht" : "den Haushalt verlassen"}. Offene Anfragen sind zurückgenommen.${
      l.nachfolge ? ` ${vorname(l.nachfolge.name)} verwaltet den Haushalt jetzt.` : ""}`
  });
}

/** Mit der Person geht der ganze Haushalt — samt den Profilen der Kinder. */
async function haushaltWeg(env, ich, l, { kontoWeg }) {
  const vorsilbe = `ehemalig-${ich.couple_id}-`;
  const anweisungen = [
    env.DB.prepare("delete from couples where id = ?1").bind(ich.couple_id),
    ...l.kinderProfile.map((k) => env.DB.prepare("delete from users where id = ?1").bind(k.id)),
    // Platzhalter früherer Mitglieder: nach dem Haushalt zeigt nichts mehr auf sie.
    env.DB.prepare("delete from users where substr(id, 1, ?1) = ?2").bind(vorsilbe.length, vorsilbe)
  ];
  if (kontoWeg) anweisungen.push(env.DB.prepare("delete from users where id = ?1").bind(ich.id));
  await env.DB.batch(anweisungen);
}

/** Was passieren würde — für das Blatt, bevor man bestätigt. */
export async function kontoVorschau(env, ich) {
  if (!ich.couple_id) return { haushalt: false };
  const l = await lage(env, ich);
  return {
    haushalt: true,
    letzteErwachsene: l.letzteErwachsene,
    andere: l.andere.filter((m) => !istKindProfil(m)).map((m) => vorname(m.name)),
    kinder: l.kinderProfile.map((m) => m.id),
    jugendliche: l.jugendliche.map((m) => vorname(m.name)),
    nachfolge: l.nachfolge ? vorname(l.nachfolge.name) : null,
    kannGehen: !(l.letzteErwachsene && l.andere.length)
  };
}

export async function kontoLoeschen(env, ich, { bestaetigung }) {
  if (String(bestaetigung || "").trim().toLowerCase() !== "löschen") {
    throw new Fehler("Zum Löschen bitte „löschen“ eintippen");
  }
  if (!ich.couple_id) {
    await env.DB.prepare("delete from users where id = ?1").bind(ich.id).run();
    return { ok: true, haushaltWeg: false };
  }
  const l = await lage(env, ich);
  if (l.letzteErwachsene) {
    await haushaltWeg(env, ich, l, { kontoWeg: true });
    return { ok: true, haushaltWeg: true };
  }
  await herausloesen(env, ich, l, { kontoWeg: true });
  return { ok: true, haushaltWeg: false };
}

export async function haushaltVerlassen(env, ich) {
  if (!ich.couple_id) throw new Fehler("Du bist in keinem Haushalt");
  const l = await lage(env, ich);
  if (!l.andere.length) {
    // Allein: der Haushalt geht, das Konto bleibt.
    await haushaltWeg(env, ich, l, { kontoWeg: false });
    return { ok: true, haushaltWeg: true };
  }
  if (l.letzteErwachsene) {
    throw new Fehler("Als letzte erwachsene Person kannst du nicht gehen — die Kinder stünden sonst allein da");
  }
  await herausloesen(env, ich, l, { kontoWeg: false });
  return { ok: true, haushaltWeg: false };
}
