// Der Fair-Bericht: wer macht wie viel — nicht nur diese Woche, sondern über
// Monate. Nach Räumen, mit der Arbeit, die man nicht sieht, und gemessen an
// dem, was der Haushalt gemeinsam fair nennt.
//
// Die Waage zählt Cleanies aus bestätigten Quests, genau wie die Auswertung.
// Bestätigen, Vorschlagen, Übernehmen und Einlösen stehen daneben, zählen aber
// nicht hinein: sonst stritte man über die Gewichtung statt über den Abwasch.
// Kinder stehen in einer eigenen Zeile — die Waage ist für die Großen.
//
// Ohne Plus gibt es nur die laufende Woche und ihre Waage. Alles andere
// schickt der Server dann gar nicht erst mit.

import { meldeAlle } from "./melden.js";
import { nurErwachsene } from "./familie.js";

class Fehler extends Error {
  constructor(text, status = 400) { super(text); this.status = status; }
}

const id = () => crypto.randomUUID();
const vorname = (n) => String(n || "").split(" ")[0];

export const ZEITRAEUME = ["woche", "monat", "quartal", "jahr"];
const TAG = 86400000;
const WTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
                "August", "September", "Oktober", "November", "Dezember"];

/* ------------------------------------------------------------------ Kalender */

const ms = (tag) => Date.parse(tag + "T00:00:00Z");
const tagVon = (zahl) => new Date(zahl).toISOString().slice(0, 10);
const plusTage = (tag, n) => tagVon(ms(tag) + n * TAG);
/** Montag ist 0. */
const wochentag = (tag) => (new Date(ms(tag)).getUTCDay() + 6) % 7;
const kurz = (tag) => `${Number(tag.slice(8))}.${Number(tag.slice(5, 7))}.`;
const monatVon = (tag) => Number(tag.slice(5, 7)) - 1;

/** Kalenderwoche nach ISO: die Woche mit dem ersten Donnerstag ist die erste. */
export function kw(tag) {
  const d = new Date(ms(tag));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - jan4) / TAG - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/**
 * Die Fächer eines Zeitraums: Tage einer Woche, Wochen eines Monats, die
 * letzten dreizehn Wochen, die letzten zwölf Monate. „zurueck" blättert
 * ganze Zeiträume zurück. Alles in Tagen der Person, die fragt.
 */
export function faecherVon(art, zurueck, heute) {
  if (art === "woche") {
    const montag = plusTage(heute, -wochentag(heute) - 7 * zurueck);
    const faecher = Array.from({ length: 7 }, (_, i) => {
      const t = plusTage(montag, i);
      const wt = WTAGE[new Date(ms(t)).getUTCDay()];
      return { label: wt, lang: `${wt} ${kurz(t)}`, von: t, bis: t };
    });
    return { faecher, von: montag, bis: plusTage(montag, 6) };
  }
  if (art === "monat") {
    const j = Number(heute.slice(0, 4)), m = monatVon(heute) - zurueck;
    const erster = tagVon(Date.UTC(j, m, 1)), letzter = tagVon(Date.UTC(j, m + 1, 0));
    const faecher = [];
    for (let start = erster; start <= letzter;) {
      const ende = [plusTage(start, 6 - wochentag(start)), letzter].sort()[0];
      faecher.push({ label: `KW ${kw(start)}`, lang: `KW ${kw(start)} · ${kurz(start)}–${kurz(ende)}`, von: start, bis: ende });
      start = plusTage(ende, 1);
    }
    return { faecher, von: erster, bis: letzter };
  }
  if (art === "quartal") {
    const montag = plusTage(heute, -wochentag(heute) - 7 * 13 * zurueck);
    const faecher = Array.from({ length: 13 }, (_, i) => {
      const von = plusTage(montag, -7 * (12 - i));
      const bis = plusTage(von, 6);
      return { label: String(kw(von)), lang: `KW ${kw(von)} · ${kurz(von)}–${kurz(bis)}`, von, bis };
    });
    return { faecher, von: faecher[0].von, bis: faecher[12].bis };
  }
  const j = Number(heute.slice(0, 4)), m = monatVon(heute) - 12 * zurueck;
  const faecher = Array.from({ length: 12 }, (_, i) => {
    const von = tagVon(Date.UTC(j, m - 11 + i, 1));
    const bis = tagVon(Date.UTC(j, m - 10 + i, 0));
    const name = MONATE[monatVon(von)];
    return { label: name.slice(0, 3), lang: `${name} ${von.slice(0, 4)}`, von, bis };
  });
  return { faecher, von: faecher[0].von, bis: faecher[11].bis };
}

/** Wie der Zeitraum heißt — und wie man vom vorigen spricht. */
function namen(art, zurueck, z, heute) {
  const jahr = (t) => t.slice(0, 4) === heute.slice(0, 4) ? "" : ` ${t.slice(0, 4)}`;
  if (art === "woche") {
    return {
      titel: zurueck === 0 ? "Diese Woche" : zurueck === 1 ? "Letzte Woche" : `KW ${kw(z.von)} · ${kurz(z.von)}–${kurz(z.bis)}${jahr(z.von)}`,
      vorher: zurueck === 0 ? "letzte Woche" : "die Woche davor"
    };
  }
  if (art === "monat") {
    const davor = MONATE[(monatVon(z.von) + 11) % 12];
    return { titel: `${MONATE[monatVon(z.von)]}${jahr(z.von)}`, vorher: `im ${davor}` };
  }
  if (art === "quartal") {
    return {
      titel: zurueck === 0 ? "Letzte 13 Wochen" : `13 Wochen bis ${kurz(z.bis)}${jahr(z.bis)}`,
      vorher: "die 13 Wochen davor"
    };
  }
  return {
    titel: zurueck === 0 ? "Letzte 12 Monate"
      : `${MONATE[monatVon(z.von)].slice(0, 3)} ${z.von.slice(0, 4)} – ${MONATE[monatVon(z.bis)].slice(0, 3)} ${z.bis.slice(0, 4)}`,
    vorher: "die 12 Monate davor"
  };
}

/* ------------------------------------------------------------------ Plus */

export async function plusLage(env, paar) {
  const haus = await env.DB.prepare(
    `select plus, plus_test_bis, coalesce(plus_test_bis > datetime('now'), 0) as testet
       from couples where id = ?1`
  ).bind(paar).first();
  return {
    plus: haus.plus === 1 || haus.testet === 1,
    testBis: haus.testet === 1 && haus.plus !== 1 ? haus.plus_test_bis : null,
    testen: haus.plus !== 1 && !haus.plus_test_bis
  };
}

/** Einmal je Haushalt: 14 Tage alles. */
export async function plusTesten(env, ich) {
  await nurErwachsene(env, ich);
  const lage = await plusLage(env, ich.couple_id);
  if (lage.plus && !lage.testBis) throw new Fehler("Ihr habt Plus schon");
  if (!lage.testen) throw new Fehler("Getestet habt ihr schon");
  await env.DB.prepare(
    "update couples set plus_test_bis = datetime('now', '+14 days') where id = ?1 and plus_test_bis is null"
  ).bind(ich.couple_id).run();
  return { ok: true, ...(await plusLage(env, ich.couple_id)) };
}

/* ------------------------------------------------------------------ Soll */

async function grosseVon(env, paar) {
  const r = await env.DB.prepare(
    `select m.user_id as id, u.name, m.erwachsen, m.stufe, m.tier
       from members m join users u on u.id = m.user_id
      where m.couple_id = ?1 order by m.joined_at, m.user_id`
  ).bind(paar).all();
  const alle = r.results;
  return {
    grosse: alle.filter((m) => Number(m.erwachsen) !== 0 && !m.stufe),
    kinder: alle.filter((m) => Number(m.erwachsen) === 0)
  };
}

/** Was fair heißt, je Person in Prozent. Zu zweit per Abstimmung, sonst gleich. */
function sollVon(grosse, haus) {
  if (grosse.length === 2) {
    const [a, b] = grosse;
    const fest = haus.fair_soll && grosse.some((g) => g.id === haus.fair_soll_von);
    const anteil = !fest ? 50 : haus.fair_soll_von === a.id ? haus.fair_soll : 100 - haus.fair_soll;
    return { [a.id]: anteil, [b.id]: 100 - anteil };
  }
  return Object.fromEntries(grosse.map((g) => [g.id, Math.round(1000 / grosse.length) / 10]));
}

/** Ein neues Soll vorschlagen: der Anteil einer Person, in Fünferschritten. */
export async function fairSollVorschlagen(env, ich, { zielId, wert, grund = "" }) {
  await nurErwachsene(env, ich);
  const { grosse } = await grosseVon(env, ich.couple_id);
  if (grosse.length !== 2) throw new Fehler("Ein eigenes Soll gibt es, wenn ihr zwei Erwachsene seid");
  if (!grosse.some((g) => g.id === zielId)) throw new Fehler("Diese Person gehört nicht dazu");
  const prozent = Math.round(Number(wert));
  if (!(prozent >= 10 && prozent <= 90) || prozent % 5) throw new Fehler("Das Soll liegt zwischen 10 und 90, in Fünferschritten");

  const haus = await env.DB.prepare("select fair_soll, fair_soll_von from couples where id = ?1").bind(ich.couple_id).first();
  const jetzt = sollVon(grosse, haus)[zielId];
  if (jetzt === prozent) throw new Fehler("So ist es schon");
  const offen = await env.DB.prepare(
    "select 1 as da from proposals where couple_id = ?1 and kind = 'fair_soll' and status = 'offen'"
  ).bind(ich.couple_id).first();
  if (offen) throw new Fehler("Dazu läuft schon eine Abstimmung");

  const vorschlag = id();
  await env.DB.batch([
    env.DB.prepare(
      `insert into proposals (id, couple_id, kind, target_id, old_value, new_value, name, reason, created_by)
       values (?1, ?2, 'fair_soll', ?3, ?4, ?5, 'Was fair heißt', ?6, ?7)`
    ).bind(vorschlag, ich.couple_id, zielId, jetzt, prozent, String(grund).slice(0, 300), ich.id),
    env.DB.prepare("insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, 1)")
      .bind(vorschlag, ich.id)
  ]);
  const ziel = grosse.find((g) => g.id === zielId);
  const andere = grosse.find((g) => g.id !== zielId);
  await meldeAlle(env, ich.couple_id, ich.id, {
    art: "info", quelle: vorschlag,
    titel: `${vorname(ich.name)} schlägt vor, was fair heißt`,
    text: `${vorname(ziel.name)} ${prozent} : ${vorname(andere.name)} ${100 - prozent} — deine Stimme fehlt.`
  });
  return { ok: true };
}

export const fairSollUebernehmen = (env, vorschlag) =>
  env.DB.prepare("update couples set fair_soll = ?1, fair_soll_von = ?2 where id = ?3")
    .bind(vorschlag.new_value, vorschlag.target_id, vorschlag.couple_id);

/* ------------------------------------------------------------------ Bericht */

const leer = (ids) => Object.fromEntries(ids.map((x) => [x, 0]));

export async function fairBericht(env, ich, frage = {}) {
  const paar = ich.couple_id;
  const plus = await plusLage(env, paar);
  let art = ZEITRAEUME.includes(frage.zeitraum) ? frage.zeitraum : "monat";
  let zurueck = Math.max(0, Math.min(60, Math.floor(Number(frage.zurueck) || 0)));
  if (!plus.plus) { art = "woche"; zurueck = 0; }

  // Der Tag beginnt dort, wo die Person wohnt — wie in der Auswertung.
  const versatz = Math.max(-840, Math.min(840, Number(frage.versatz) || 0));
  const schieben = `${versatz >= 0 ? "+" : ""}${versatz} minutes`;
  const heute = tagVon(Date.now() + versatz * 60000);

  const jetzt = faecherVon(art, zurueck, heute);
  const davor = faecherVon(art, zurueck + 1, heute);
  const { titel, vorher: vorherText } = namen(art, zurueck, jetzt, heute);

  const haus = await env.DB.prepare(
    "select fair_soll, fair_soll_von, date(created_at, ?2) as ab from couples where id = ?1"
  ).bind(paar, schieben).first();
  const { grosse, kinder } = await grosseVon(env, paar);
  // Ich zuerst: in der App steht man selbst immer links und in Blau.
  grosse.sort((a, b) => (b.id === ich.id) - (a.id === ich.id));
  const ids = grosse.map((g) => g.id);

  const zeilen = (await env.DB.prepare(
    `select date(l.created_at, ?2) as tag, l.member_id as wer, coalesce(q.category, 'Sonstiges') as raum,
            l.reason as quest, sum(l.delta) as n, sum(coalesce(c.quantity, 1)) as mal
       from ledger l
       left join claims c on c.id = l.source_id
       left join quests q on q.id = c.quest_id
      where l.couple_id = ?1 and l.source_type = 'claim' and l.delta > 0
        and l.created_at >= datetime(?3, '-1 day') and l.created_at < datetime(?4, '+2 days')
        and date(l.created_at, ?2) between ?3 and ?4
      group by tag, wer, raum, quest`
  ).bind(paar, schieben, davor.von, jetzt.bis).all()).results;

  const summe = (von, bis, wer) => zeilen
    .filter((z) => z.tag >= von && z.tag <= bis && z.wer === wer)
    .reduce((s, z) => s + z.n, 0);
  const waageVon = (von, bis) => {
    const je = Object.fromEntries(ids.map((x) => [x, summe(von, bis, x)]));
    const aufgaben = zeilen.filter((z) => z.tag >= von && z.tag <= bis && ids.includes(z.wer)).reduce((s, z) => s + z.mal, 0);
    return { je, gesamt: Object.values(je).reduce((a, b) => a + b, 0), aufgaben };
  };

  const ergebnis = {
    zeitraum: art, zurueck, titel, vorherText, heute,
    von: jetzt.von, bis: jetzt.bis,
    frueher: davor.bis >= (haus.ab || "0000"),
    ...plus,
    personen: grosse.map((g) => ({ id: g.id, name: vorname(g.name), ich: g.id === ich.id })),
    soll: sollVon(grosse, haus),
    sollAenderbar: grosse.length === 2,
    sollOffen: await env.DB.prepare(
      `select id, target_id as ziel, old_value as alt, new_value as neu, created_by as von
         from proposals where couple_id = ?1 and kind = 'fair_soll' and status = 'offen'`
    ).bind(paar).first(),
    waage: waageVon(jetzt.von, jetzt.bis),
    vorher: waageVon(davor.von, davor.bis),
    kinder: kinder.map((k) => {
      const eigene = zeilen.filter((z) => z.wer === k.id && z.tag >= jetzt.von && z.tag <= jetzt.bis);
      return {
        id: k.id, name: vorname(k.name), tier: k.tier,
        cleanies: eigene.reduce((s, z) => s + z.n, 0),
        aufgaben: eigene.reduce((s, z) => s + z.mal, 0)
      };
    })
  };
  if (!plus.plus) return { ...ergebnis, gesperrt: true };

  const imZeitraum = zeilen.filter((z) => z.tag >= jetzt.von && z.tag <= jetzt.bis && ids.includes(z.wer));

  // Verlauf: je Fach die Cleanies jeder Person. Was noch in der Zukunft liegt,
  // ist ein leeres Fach — es soll sich nicht wie eine faule Woche lesen.
  const faecher = jetzt.faecher.map((f) => ({
    ...f, zukunft: f.von > heute,
    je: Object.fromEntries(ids.map((x) => [x, summe(f.von, f.bis, x)]))
  }));

  // Wer macht was: nach dem Raum der Quest.
  const raeume = new Map();
  for (const z of imZeitraum) {
    if (!raeume.has(z.raum)) raeume.set(z.raum, leer(ids));
    raeume.get(z.raum)[z.wer] += z.n;
  }

  // Aufgefallen: die häufigste Quest und der beste Tag je Person.
  const aufgefallen = Object.fromEntries(ids.map((x) => {
    const eigene = imZeitraum.filter((z) => z.wer === x);
    const quests = new Map(), tage = new Map();
    for (const z of eigene) {
      quests.set(z.quest, (quests.get(z.quest) || 0) + z.mal);
      tage.set(z.tag, (tage.get(z.tag) || 0) + z.n);
    }
    const quest = [...quests].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
    const tag = [...tage].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return [x, {
      quest: quest ? { name: quest[0], mal: quest[1] } : null,
      tag: tag ? { tag: tag[0], n: tag[1] } : null
    }];
  }));

  // Was man nicht sieht. Gezählt im Tag der Person, die fragt.
  const zaehlen = async (sql) => {
    const r = await env.DB.prepare(sql).bind(paar, schieben, jetzt.von, jetzt.bis).all();
    const je = leer(ids);
    for (const z of r.results) if (z.wer in je) je[z.wer] = z.n;
    return je;
  };
  const unsichtbar = {
    bestaetigt: await zaehlen(
      `select decided_by as wer, count(*) as n from claims
        where couple_id = ?1 and status = 'bestaetigt' and decided_by is not null
          and date(decided_at, ?2) between ?3 and ?4 group by decided_by`),
    vorgeschlagen: await zaehlen(
      `select created_by as wer, count(*) as n from proposals
        where couple_id = ?1 and date(created_at, ?2) between ?3 and ?4 group by created_by`),
    uebernommen: await zaehlen(
      `select claimed_by as wer, count(*) as n from claims
        where couple_id = ?1 and status = 'bestaetigt'
          and (uebernommen_von is not null or note like 'Für % übernommen%')
          and date(decided_at, ?2) between ?3 and ?4 group by claimed_by`),
    eingeloest: await zaehlen(
      `select requested_by as wer, sum(cost) as n from requests
        where couple_id = ?1 and status = 'bestaetigt'
          and date(decided_at, ?2) between ?3 and ?4 group by requested_by`)
  };

  return {
    ...ergebnis,
    faecher,
    raeume: [...raeume].map(([name, je]) => ({ name, je }))
      .sort((a, b) => Object.values(b.je).reduce((s, n) => s + n, 0) - Object.values(a.je).reduce((s, n) => s + n, 0)),
    aufgefallen,
    unsichtbar
  };
}
