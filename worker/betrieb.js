// Das Betriebs-Dashboard: wie steht der Pilot?
//
// Hinein kommt nur, wessen Google-Adresse im Geheimnis BETRIEB_EMAILS steht
// (in Cloudflare unter Workers → bubu-app → Einstellungen → Variablen und
// Geheimnisse, mehrere mit Komma). Die Adressen stehen absichtlich nicht im
// öffentlichen Projekt. Weitere Personen kommen hinzu, indem man sie dort von
// Hand ergänzt — eine Oberfläche dafür gibt es bewusst nicht.
//
// Gemessen wird an den Toren aus dem Businessplan. Haushalte erscheinen nur
// unter dem Namen ihrer Einladung, ohne Inhalte. Gezählt werden nur Haushalte,
// die mit einer Einladung gegründet wurden; was vor dem Pilot da war, steht
// getrennt daneben.

import { pilotPflicht, pilotSetzen, einladungAnlegen, einladungZurueckziehen } from "./pilot.js";
import { PLAENE, GRUENDE } from "./plus.js";

const PLAN_NAMEN = Object.fromEntries(Object.entries(PLAENE).map(([k, p]) => [k, p.name]));

const TAG = 24 * 3600e3;
const PILOT_WOCHEN = 8;

class Fehler extends Error {
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
}

export function betriebAdressen(env) {
  return String(env.BETRIEB_EMAILS ?? "").split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean);
}

export function istBetrieb(env, email) {
  return Boolean(email) && betriebAdressen(env).includes(String(email).toLowerCase());
}

/** Alle Wege ins Dashboard. teile = ["betrieb", …] */
export async function betrieb(env, ich, methode, teile, daten) {
  if (!istBetrieb(env, ich?.email)) throw new Fehler("Kein Zugang zum Betrieb", 403);
  const [, was, code, tun] = teile;
  if (!was && methode === "GET") return lage(env);
  if (methode !== "POST") throw new Fehler("Nur mit POST", 405);
  if (was === "einladung" && !code) return einladungAnlegen(env, daten.name);
  if (was === "einladung" && tun === "zurueckziehen") return einladungZurueckziehen(env, code);
  if (was === "fehler" && tun === "erledigt") {
    await env.DB.prepare("update fehler set erledigt_am = datetime('now') where id = ?1").bind(String(code)).run();
    return { ok: true };
  }
  if (was === "pilot") return pilotSetzen(env, daten.pflicht !== false);
  throw new Fehler("Unbekannter Endpunkt", 404);
}

// Gerechnet wird in ganzen Tagen (UTC): Woche 4 eines Haushalts sind die Tage 21 bis 27 nach seinem Gründungstag.
const tagVon = (iso) => {
  const d = new Date(String(iso).replace(" ", "T") + (String(iso).endsWith("Z") ? "" : "Z"));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const tageZwischen = (a, b) => Math.round((b - a) / TAG);

async function lage(env) {
  const jetzt = new Date();
  const heute = tagVon(jetzt.toISOString());
  const [pflicht, einladungen, mitglieder, tage, fehler, vorher, plusRoh, kaeufe, absagen] = await Promise.all([
    pilotPflicht(env),
    env.DB.prepare(
      `select code, name, angelegt_am, angenommen_am, haushalt, gegruendet_am, zurueckgezogen_am
         from einladungen order by angelegt_am desc`
    ).all(),
    env.DB.prepare(
      `select m.couple_id as haushalt, count(*) as personen, sum(case when m.erwachsen = 0 then 1 else 0 end) as kinder
         from members m where m.couple_id in (select haushalt from einladungen where haushalt is not null)
        group by m.couple_id`
    ).all(),
    // Bestätigte Quests je Haushalt und Tag — daraus „aktiv“, „zuletzt“ und die Wochen.
    env.DB.prepare(
      `select couple_id as haushalt, date(decided_at) as tag, count(*) as n
         from claims where status = 'bestaetigt' and decided_at is not null
          and couple_id in (select haushalt from einladungen where haushalt is not null)
        group by couple_id, date(decided_at)`
    ).all(),
    env.DB.prepare(
      `select f.id, f.quelle, f.nachricht, f.ort, f.anzahl, f.erstmals, f.zuletzt, f.erledigt_am,
              (select count(*) from fehler_wer w where w.fehler_id = f.id) as personen
         from fehler f where f.zuletzt >= datetime('now', '-30 days')
        order by f.erledigt_am is not null, f.zuletzt desc limit 50`
    ).all(),
    env.DB.prepare(
      `select count(*) as n from couples where eingerichtet = 1
          and id not in (select haushalt from einladungen where haushalt is not null)`
    ).first(),
    // Der Testkauf: wie Plus je Pilot-Haushalt steht, wer gekauft hat und warum nicht.
    env.DB.prepare(
      `select id as haushalt, plus, plus_test_bis, coalesce(plus_test_bis <= datetime('now'), 0) as vorbei
         from couples where id in (select haushalt from einladungen where haushalt is not null)`
    ).all(),
    env.DB.prepare(
      `select couple_id as haushalt, plan, ehrlich from testkaeufe
        where couple_id in (select haushalt from einladungen where haushalt is not null)`
    ).all(),
    env.DB.prepare(
      `select gruende from plus_absagen
        where couple_id in (select haushalt from einladungen where haushalt is not null)`
    ).all()
  ]);
  const plusJe = new Map(plusRoh.results.map((p) => [p.haushalt, p]));
  const kaufJe = new Map(kaeufe.results.map((k) => [k.haushalt, k]));

  const leute = new Map(mitglieder.results.map((m) => [m.haushalt, m]));
  const aktivTage = new Map();
  for (const t of tage.results) {
    if (!aktivTage.has(t.haushalt)) aktivTage.set(t.haushalt, []);
    aktivTage.get(t.haushalt).push(tagVon(t.tag));
  }
  const aktivZwischen = (haushalt, von, bis) => (aktivTage.get(haushalt) || []).some((d) => d >= von && d < bis);

  const haushalte = einladungen.results
    .filter((e) => e.haushalt && e.gegruendet_am)
    .map((e) => {
      const gegruendet = tagVon(e.gegruendet_am);
      const alter = tageZwischen(gegruendet, heute);
      const tageListe = aktivTage.get(e.haushalt) || [];
      const letzter = tageListe.length ? new Date(Math.max(...tageListe)) : null;
      const still = letzter ? tageZwischen(letzter, heute) : null;
      const p = leute.get(e.haushalt) || { personen: 0, kinder: 0 };
      const pl = plusJe.get(e.haushalt), kauf = kaufJe.get(e.haushalt);
      return {
        plus: kauf ? `gekauft · ${PLAN_NAMEN[kauf.plan]}` : !pl ? null : pl.plus === 1 ? "an"
          : !pl.plus_test_bis ? "aus" : pl.vorbei ? "pausiert" : "Test",
        testkaufZaehlt: Boolean(kauf) || Boolean(pl && pl.plus !== 1 && pl.vorbei),
        gekauft: Boolean(kauf),
        id: e.haushalt, start: gegruendet, name: e.name, gegruendet: e.gegruendet_am, alter, woche: Math.floor(alter / 7) + 1,
        personen: p.personen, kinder: p.kinder || 0,
        still, status: still === null ? (alter >= 7 ? "eingeschlafen" : "neu") : still <= 7 ? "aktiv" : still <= 13 ? "ruhig" : "eingeschlafen",
        woche4: alter >= 28 ? aktivZwischen(e.haushalt, new Date(+gegruendet + 21 * TAG), new Date(+gegruendet + 28 * TAG)) : null
      };
    });

  // Der Pilot beginnt mit dem ersten gegründeten Haushalt.
  const start = haushalte.length ? new Date(Math.min(...haushalte.map((h) => +h.start))) : null;
  const pilotTag = start ? tageZwischen(start, heute) : null;
  const wochen = [];
  if (start) {
    const bisWoche = Math.floor(pilotTag / 7) + 1;
    for (let w = 1; w <= bisWoche; w++) {
      const von = new Date(+start + (w - 1) * 7 * TAG), bis = new Date(+start + w * 7 * TAG);
      const dabei = haushalte.filter((h) => +h.start < +bis);
      const aktiv = dabei.filter((h) => aktivZwischen(h.id, von, bis)).length;
      wochen.push({ woche: w, haushalte: dabei.length, aktiv, anteil: dabei.length ? Math.round(aktiv / dabei.length * 100) : 0, laufend: +bis > +jetzt });
    }
  }

  const durch4 = haushalte.filter((h) => h.woche4 !== null);
  // Der Nenner: Haushalte, deren Test vorbei ist — oder die vorher schon gekauft haben.
  const nachTest = haushalte.filter((h) => h.testkaufZaehlt);
  const zaehlen = (liste, schluessel) => Object.fromEntries(schluessel.map((k) => [k, liste.filter((x) => x === k).length]));
  const gruende = absagen.results.flatMap((a) => { try { return JSON.parse(a.gruende); } catch { return []; } });
  const allein = haushalte.filter((h) => h.personen === 1);
  const fehlerListe = fehler.results.map((f) => ({ ...f, kritisch: f.quelle === "server" || f.personen > 1 }));
  const zaehl = (f) => einladungen.results.filter(f).length;

  return {
    stand: jetzt.toISOString(),
    pflicht,
    pilot: start ? { start: start.toISOString(), tag: pilotTag, woche: Math.floor(pilotTag / 7) + 1, wochen: PILOT_WOCHEN,
                     ende: new Date(+start + PILOT_WOCHEN * 7 * TAG).toISOString() } : null,
    tore: {
      woche4: { aktiv: durch4.filter((h) => h.woche4).length, von: durch4.length, ziel: 60 },
      allein: { anzahl: allein.length, von: haushalte.length, ziel: 20 },
      testkauf: {
        anzahl: nachTest.filter((h) => h.gekauft).length, von: nachTest.length, ziel: 5,
        plaene: zaehlen(kaeufe.results.map((k) => k.plan), ["jahr", "monat", "immer"]),
        ehrlich: { ...zaehlen(kaeufe.results.map((k) => k.ehrlich), ["ja", "vielleicht", "nein"]),
                   offen: kaeufe.results.filter((k) => !k.ehrlich).length },
        absagen: absagen.results.length,
        gruende: zaehlen(gruende, GRUENDE)
      },
      fehler: { offen: fehlerListe.filter((f) => f.kritisch && !f.erledigt_am).length }
    },
    wochen,
    zahlen: {
      haushalte: haushalte.length,
      neu: haushalte.filter((h) => h.alter < 7).length,
      erwachsene: haushalte.reduce((s, h) => s + h.personen - h.kinder, 0),
      kinder: haushalte.reduce((s, h) => s + h.kinder, 0),
      familien: haushalte.filter((h) => h.kinder > 0).length,
      vorher: vorher?.n ?? 0,
      einladungen: {
        angelegt: einladungen.results.length,
        eingeloest: zaehl((e) => e.gegruendet_am),
        offen: zaehl((e) => !e.gegruendet_am && !e.zurueckgezogen_am),
        zurueckgezogen: zaehl((e) => e.zurueckgezogen_am && !e.gegruendet_am)
      }
    },
    // Wer am längsten still ist, steht oben. Kennungen und Gründungstag bleiben drinnen.
    haushalte: haushalte
      .sort((a, b) => (b.still ?? 999) - (a.still ?? 999) || a.name.localeCompare(b.name, "de"))
      .map(({ id, start, testkaufZaehlt, gekauft, ...rest }) => rest),
    einladungen: einladungen.results.map((e) => ({
      code: e.code, name: e.name, angelegt: e.angelegt_am,
      status: e.gegruendet_am ? (e.haushalt ? "eingelöst" : "Haushalt gelöscht") : e.zurueckgezogen_am ? "zurückgezogen"
        : e.angenommen_am ? "angenommen" : "offen",
      wann: e.gegruendet_am || e.zurueckgezogen_am || e.angenommen_am || e.angelegt_am
    })),
    fehler: fehlerListe
  };
}
