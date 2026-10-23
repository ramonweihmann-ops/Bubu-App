// Plus: was es gibt, wer es hat, und der Testkauf im Pilot.
//
// Plus ist der ganze Fair-Bericht, der Familienmodus (Kinderansicht, Kinder-
// Geräte, Taschengeld) und Events ohne Grenze; ohne Plus gehen drei Events
// zugleich. Werbung gibt es im Pilot nicht.
//
// Wer Plus hat: couples.plus = 1 (Haushalte von vor dem Pilot und alle nach einem
// Testkauf) oder ein laufender Test (plus_test_bis in der Zukunft). Neue Pilot-
// Haushalte bekommen beim Gründen 14 Tage Test; danach pausiert Plus, bis jemand
// den Testkauf macht. Abgebucht wird im Pilot nichts — der Testkauf misst, wer zu
// welchem Preis kaufen würde, und Plus bleibt als Dankeschön.

import { nurErwachsene } from "./familie.js";

const TEST_TAGE = 14;
const HINWEIS_TAGE = 2; // ab Tag 12 erinnert die Startseite
export const EVENTS_OHNE_PLUS = 3;
export const PLAENE = {
  monat: { preis_cent: 199, name: "Monat" },
  jahr: { preis_cent: 1199, name: "Jahr" },
  immer: { preis_cent: 4999, name: "Für immer" }
};
const EHRLICH = ["ja", "vielleicht", "nein"];
export const GRUENDE = ["Zu teuer", "Brauchen wir nicht", "Erst später", "Lieber ohne Abo", "Anderes"];

class Fehler extends Error {
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
}

/** Hat der Haushalt gerade Plus — und wie steht der Test? */
export async function plusLage(env, paar) {
  const haus = await env.DB.prepare(
    `select plus, plus_test_bis, coalesce(plus_test_bis > datetime('now'), 0) as testet,
            cast(julianday(date(plus_test_bis)) - julianday(date('now')) as integer) as rest
       from couples where id = ?1`
  ).bind(paar).first();
  const testet = haus.testet === 1 && haus.plus !== 1;
  return {
    plus: haus.plus === 1 || haus.testet === 1,
    testBis: testet ? haus.plus_test_bis : null,
    // Kalendertage bis zum Ende des Tests: 0 = endet heute, 1 = morgen, 2 = übermorgen.
    testTage: testet ? Math.max(0, haus.rest) : null,
    // Der Test ist um und niemand hat gekauft: Plus pausiert.
    vorbei: haus.plus !== 1 && Boolean(haus.plus_test_bis) && haus.testet !== 1,
    testen: haus.plus !== 1 && !haus.plus_test_bis
  };
}

export async function plusAn(env, paar) {
  return (await plusLage(env, paar)).plus;
}

/** Wirft, wenn der Haushalt kein Plus hat — mit einem Satz, der sagt, was fehlt. */
export async function plusNoetig(env, paar, was) {
  if (!(await plusAn(env, paar))) throw new Fehler(`${was} gibt es mit Plus. Euer Test ist vorbei — ein Testkauf schaltet Plus wieder frei.`, 402);
}

/** Beim Gründen mit einer Pilot-Einladung: 14 Tage Plus zum Testen, danach nur mit Testkauf. */
export function testBeimGruenden(env, paar) {
  return env.DB.prepare(
    `update couples set plus = 0, plus_test_bis = datetime('now', '+${TEST_TAGE} days')
      where id = ?1 and exists (select 1 from einladungen where haushalt = ?1)`
  ).bind(paar);
}

/** Einmal je Haushalt von Hand: 14 Tage alles (für Haushalte ohne automatischen Test). */
export async function plusTesten(env, ich) {
  await nurErwachsene(env, ich);
  const lage = await plusLage(env, ich.couple_id);
  if (lage.plus && !lage.testBis) throw new Fehler("Ihr habt Plus schon");
  if (!lage.testen) throw new Fehler("Getestet habt ihr schon");
  await env.DB.prepare(
    `update couples set plus_test_bis = datetime('now', '+${TEST_TAGE} days') where id = ?1 and plus_test_bis is null`
  ).bind(ich.couple_id).run();
  return { ok: true, ...(await plusLage(env, ich.couple_id)) };
}

/** Für den Zustand: alles, was die App über Plus wissen muss. */
export async function plusFuerMich(env, ich, erwachsen) {
  const paar = ich.couple_id;
  const [lage, kauf, absage] = await Promise.all([
    plusLage(env, paar),
    env.DB.prepare("select plan, created_at from testkaeufe where couple_id = ?1 order by created_at desc limit 1").bind(paar).first(),
    env.DB.prepare("select 1 as da from plus_absagen where couple_id = ?1 and wer = ?2 limit 1").bind(paar, ich.id).first()
  ]);
  const kurzVorEnde = lage.testTage !== null && lage.testTage <= HINWEIS_TAGE;
  return {
    an: lage.plus,
    testBis: lage.testBis,
    testTage: lage.testTage,
    vorbei: lage.vorbei,
    testen: lage.testen,
    gekauft: kauf ? { plan: kauf.plan, am: kauf.created_at } : null,
    kannKaufen: erwachsen,
    // Die Zeile auf der Startseite: kurz vor Ende des Tests oder danach, bis man kauft oder abwinkt.
    hinweis: erwachsen && !kauf && !absage && (kurzVorEnde || lage.vorbei)
  };
}

/** Der Testkauf: ein Plan zu den späteren Preisen. Abgebucht wird nichts. */
export async function plusKaufen(env, ich, plan) {
  await nurErwachsene(env, ich);
  const p = PLAENE[plan];
  if (!p) throw new Fehler("Wähle Monat, Jahr oder für immer");
  const schon = await env.DB.prepare("select 1 as da from testkaeufe where couple_id = ?1").bind(ich.couple_id).first();
  if (schon) throw new Fehler("Ihr habt Plus schon gekauft");
  const lage = await plusLage(env, ich.couple_id);
  if (lage.plus && !lage.testBis) throw new Fehler("Ihr habt Plus schon");
  const kennung = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("insert into testkaeufe (id, couple_id, wer, plan, preis_cent) values (?1, ?2, ?3, ?4, ?5)")
      .bind(kennung, ich.couple_id, ich.id, plan, p.preis_cent),
    env.DB.prepare("update couples set plus = 1 where id = ?1").bind(ich.couple_id)
  ]);
  return { ok: true, id: kennung, plan, preis_cent: p.preis_cent };
}

/** Die ehrliche Antwort nach dem Testkauf: Hättest du das auch bezahlt? */
export async function plusEhrlich(env, ich, kennung, antwort) {
  if (!EHRLICH.includes(antwort)) throw new Fehler("Ja, vielleicht oder nein");
  const r = await env.DB.prepare("update testkaeufe set ehrlich = ?3 where id = ?1 and couple_id = ?2 and wer = ?4")
    .bind(String(kennung), ich.couple_id, antwort, ich.id).run();
  if (!r.meta.changes) throw new Fehler("Diesen Testkauf gibt es nicht", 404);
  return { ok: true };
}

/** „Jetzt nicht“ — mit freiwilligen Gründen. Danach erinnert die Startseite diese Person nicht mehr. */
export async function plusNicht(env, ich, gruende) {
  const liste = [...new Set((Array.isArray(gruende) ? gruende : []).filter((g) => GRUENDE.includes(g)))];
  await env.DB.prepare("insert into plus_absagen (id, couple_id, wer, gruende) values (?1, ?2, ?3, ?4)")
    .bind(crypto.randomUUID(), ich.couple_id, ich.id, JSON.stringify(liste)).run();
  return { ok: true };
}

/** Ohne Plus gehen höchstens drei Events zugleich — offene Vorschläge für neue zählen mit. */
export async function eventGrenze(env, paar) {
  if (await plusAn(env, paar)) return;
  const z = await env.DB.prepare(
    `select (select count(*) from events where couple_id = ?1 and aktiv = 1)
          + (select count(*) from proposals where couple_id = ?1 and kind = 'neues_event' and status = 'offen') as n`
  ).bind(paar).first();
  if (z.n >= EVENTS_OHNE_PLUS) {
    throw new Fehler(`Mehr als ${EVENTS_OHNE_PLUS} Events zugleich gibt es mit Plus. Beendet eins — oder holt euch Plus.`, 402);
  }
}
