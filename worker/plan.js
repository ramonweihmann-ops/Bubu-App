// Der Haushaltsplan: Quests mit Rhythmus.
//
// Eine wiederkehrende Aufgabe ist keine eigene Sorte, sondern eine Quest mit
// „wiederkehrend = 1". Damit lässt sich jede bestehende Quest umstellen, ohne
// sie neu anzulegen — und gemeldet und bestätigt wird sie über dieselben
// claims wie jede andere auch.
//
// Der Unterschied ist das Fälligkeitsdatum. Nach jeder bestätigten Meldung
// springt es um den Rhythmus nach vorn; bis dahin ist die Quest für alle
// gesperrt. Die Sperrfrist steht dadurch nirgends zusätzlich — sie ist das
// Datum selbst.
//
// Zwei Zahlen entscheiden, wer drankommt: „am Stück" (wie oft zuletzt
// hintereinander) und „dieses Jahr". Wenig am Stück steht oben, bei
// Gleichstand die kleinere Jahreszahl. Das sorgt für den Wechsel.

import { melde, meldeAlle, mitgliederVon } from "./melden.js";
import { urlaubsLage } from "./urlaub.js";

const id = () => crypto.randomUUID();
const vorname = (n) => String(n || "").split(" ")[0];

class Fehler extends Error {
  constructor(text, status = 400) { super(text); this.status = status; }
}

/** Rhythmus und die Tage, die daraus folgen. Die Sperre ist genau dieser Wert. */
export const RHYTHMEN = {
  "1× pro Woche": 7,
  "2× pro Woche": 3,
  "3× pro Woche": 2,
  "1× alle 2 Wochen": 14,
  "1× im Monat": 30,
  "1× im Quartal": 90
};

export const tageBis = (datum) => datum
  ? Math.round((Date.parse(datum + "T12:00:00Z") - Date.parse(new Date().toISOString().slice(0, 10) + "T12:00:00Z")) / 86400000)
  : null;

/* ------------------------------------------------------------------ Zähler */

/**
 * „Am Stück" kann nur die Person haben, die zuletzt dran war: sobald jemand
 * anderes erledigt, fängt der Zähler aller anderen wieder bei null an.
 * „Dieses Jahr" zählt alles seit dem 1. Januar.
 */
export function zaehlerAus(erledigungen, jahr) {
  const zaehler = {};
  const zu = (wer) => (zaehler[wer] ||= { stueck: 0, jahr: 0 });

  for (const e of erledigungen) {
    zu(e.member_id).jahr += String(e.created_at).slice(0, 4) === jahr ? 1 : 0;
  }
  // Die Liste kommt neueste zuerst.
  for (const e of erledigungen) {
    if (e.member_id !== erledigungen[0].member_id) break;
    zu(e.member_id).stueck += 1;
  }
  return zaehler;
}

export function rangfolge(mitglieder, zaehler) {
  return [...mitglieder].sort((a, b) => {
    const A = zaehler[a.id] || { stueck: 0, jahr: 0 };
    const B = zaehler[b.id] || { stueck: 0, jahr: 0 };
    return A.stueck - B.stueck || A.jahr - B.jahr || String(a.name).localeCompare(String(b.name), "de");
  });
}

async function zaehlerFuer(env, questId) {
  const erledigt = await env.DB.prepare(
    `select claimed_by as member_id, created_at from claims
      where quest_id = ?1 and status = 'bestaetigt' order by created_at desc`
  ).bind(questId).all();
  if (!erledigt.results.length) return {};
  return zaehlerAus(erledigt.results, String(new Date().getUTCFullYear()));
}

/* ------------------------------------------------------------------ Liste */

/** Was der Plan braucht: alle Quests mit Rhythmus, dazu Bewerbungen und offene Meldungen. */
export async function planListe(env, paar, ichId) {
  const [quests, bewerbungen, offene] = await Promise.all([
    env.DB.prepare(`select * from quests where couple_id = ?1 and active = 1 and wiederkehrend = 1
                     order by faellig_am`).bind(paar).all(),
    env.DB.prepare(`select b.quest_id, b.member_id, b.status from bewerbungen b
                     join quests q on q.id = b.quest_id
                    where b.couple_id = ?1 and b.runde = q.faellig_am and b.status = 'offen'`).bind(paar).all(),
    env.DB.prepare(`select id, quest_id, claimed_by, created_at from claims
                     where couple_id = ?1 and status = 'offen'`).bind(paar).all()
  ]);

  return quests.results.map((q) => {
    const meine = bewerbungen.results.filter((b) => b.quest_id === q.id);
    const pruefung = offene.results.find((c) => c.quest_id === q.id) || null;
    return {
      id: q.id,
      name: q.name,
      raum: q.category,
      punkte: q.points,
      tage: q.tage,
      rhythmus: q.rhythmus,
      faellig_am: q.faellig_am,
      offen: tageBis(q.faellig_am),
      dran: q.dran,
      zugewiesen: q.zugewiesen,
      bewerber: meine.length,
      ichBeworben: meine.some((b) => b.member_id === ichId),
      pruefung: pruefung ? { id: pruefung.id, von: pruefung.claimed_by, punkte: q.points,
                             created_at: pruefung.created_at } : null
    };
  });
}

/** Detail mit Zählern und — sobald die Runde eingefroren ist — der Rangliste. */
export async function aufgabeDetail(env, ich, questId) {
  const q = await env.DB.prepare(
    "select * from quests where id = ?1 and couple_id = ?2 and wiederkehrend = 1"
  ).bind(questId, ich.couple_id).first();
  if (!q) throw new Fehler("Diese Aufgabe gibt es nicht", 404);

  const [personen, bewerbungen, letzte] = await Promise.all([
    env.DB.prepare(`select u.id, u.name, u.bild, u.avatar_url from members m join users u on u.id = m.user_id
                     where m.couple_id = ?1`).bind(ich.couple_id).all(),
    env.DB.prepare("select member_id, status from bewerbungen where quest_id = ?1 and runde = ?2")
      .bind(questId, q.faellig_am).all(),
    env.DB.prepare(`select claimed_by as member_id, created_at from claims
                     where quest_id = ?1 and status = 'bestaetigt'
                     order by created_at desc limit 1`).bind(questId).first()
  ]);

  const zaehler = await zaehlerFuer(env, questId);
  const mitglieder = personen.results.map((p) => ({ ...p, ...(zaehler[p.id] || { stueck: 0, jahr: 0 }) }));

  // Eine Rangliste gibt es nur, solange wirklich mehrere zur Wahl stehen: nach
  // der Zuteilung — oder wenn ein einziger Bewerber sie direkt bekommen hat —
  // wäre sie leer und stünde sinnlos im Weg.
  const offeneBewerber = bewerbungen.results.filter((b) => b.status === "offen").map((b) => b.member_id);
  const liste = !q.zugewiesen && q.vergabe_runde === q.faellig_am && offeneBewerber.length
    ? rangfolge(mitglieder.filter((m) => offeneBewerber.includes(m.id)), zaehler)
    : null;

  return {
    id: q.id, name: q.name, raum: q.category, punkte: q.points,
    tage: q.tage, rhythmus: q.rhythmus, faellig_am: q.faellig_am,
    dran: q.dran, zugewiesen: q.zugewiesen,
    offen: tageBis(q.faellig_am),
    mitglieder: rangfolge(mitglieder, zaehler),
    bewerber: offeneBewerber,
    abgelehnt: bewerbungen.results.filter((b) => b.status === "abgelehnt").map((b) => b.member_id),
    rangliste: liste ? liste.map((m) => m.id) : null,
    ichBeworben: offeneBewerber.includes(ich.id),
    zuletzt: letzte || null
  };
}

/* ------------------------------------------------------------------ Nachziehen */

/**
 * Läuft im Wecker und bei jedem Laden der App: Rangliste einfrieren,
 * Alleinbewerber zuteilen, an Überfälliges erinnern, nach sieben Tagen die
 * Gruppenstrafe buchen. Jeder Schritt hält am Fälligkeitsdatum fest, dass er
 * gelaufen ist — deshalb schadet doppeltes Aufrufen nichts.
 */
export async function planNachziehen(env, paar) {
  const { abwesend, pausiert } = await urlaubsLage(env, paar);
  // Im Haushaltsurlaub ruht der Plan: nichts wird vergeben, nichts gemahnt,
  // nichts bestraft. Die Fälligkeiten stehen ohnehin schon verschoben.
  if (pausiert) return;

  const haus = await env.DB.prepare("select strafe_an from couples where id = ?1").bind(paar).first();
  const quests = await env.DB.prepare(
    "select * from quests where couple_id = ?1 and active = 1 and wiederkehrend = 1"
  ).bind(paar).all();

  for (const q of quests.results) {
    try {
      const offen = tageBis(q.faellig_am);
      if (offen === null) continue;
      if (offen <= 1 && q.vergabe_runde !== q.faellig_am && !q.zugewiesen) await vergeben(env, paar, q, abwesend);
      if (offen < 0 && q.mahnung_runde !== q.faellig_am) await mahnen(env, paar, q, abwesend);
      if (offen <= -7 && q.strafe_runde !== q.faellig_am && haus?.strafe_an) await strafen(env, paar, q, abwesend);
    } catch {
      // Eine einzelne Aufgabe darf das Laden der App nie verhindern.
    }
  }
}

/** Einen Tag vor Fälligkeit steht die Reihenfolge fest. Wer im Urlaub ist,
 *  steht nicht drin: sonst wartet die Aufgabe zwei Wochen auf eine Entscheidung
 *  aus dem Ausland. */
async function vergeben(env, paar, q, abwesend = new Set()) {
  const bewerber = await env.DB.prepare(
    "select member_id from bewerbungen where quest_id = ?1 and runde = ?2 and status = 'offen'"
  ).bind(q.id, q.faellig_am).all();
  const ids = bewerber.results.map((b) => b.member_id).filter((w) => !abwesend.has(w));
  if (!ids.length) return;                       // Niemand will — bleibt für alle offen.

  const personen = await env.DB.prepare(
    `select u.id, u.name from members m join users u on u.id = m.user_id where m.couple_id = ?1`
  ).bind(paar).all();
  const zaehler = await zaehlerFuer(env, q.id);
  const geordnet = rangfolge(personen.results.filter((p) => ids.includes(p.id)), zaehler);

  if (geordnet.length === 1) {
    // Ein einziger Bewerber bekommt sie ohne Rangliste.
    await env.DB.batch([
      env.DB.prepare("update quests set zugewiesen = ?1, vergabe_runde = ?2, dran = null where id = ?3")
        .bind(geordnet[0].id, q.faellig_am, q.id),
      env.DB.prepare("update bewerbungen set status = 'vergeben' where quest_id = ?1 and runde = ?2 and member_id = ?3")
        .bind(q.id, q.faellig_am, geordnet[0].id)
    ]);
    await melde(env, paar, geordnet[0].id, {
      art: "info", titel: `${q.name} gehört dir`,
      text: "Du warst der einzige Bewerber — keine Rangliste nötig."
    });
    return;
  }

  await env.DB.prepare("update quests set dran = ?1, vergabe_runde = ?2 where id = ?3")
    .bind(geordnet[0].id, q.faellig_am, q.id).run();

  for (const p of geordnet) {
    await melde(env, paar, p.id, {
      art: "info",
      titel: p.id === geordnet[0].id ? `Du bist dran: ${q.name}` : `Rangliste steht: ${q.name}`,
      text: p.id === geordnet[0].id
        ? "Nimm an oder gib weiter — bis morgen früh."
        : `${vorname(geordnet[0].name)} steht oben und entscheidet.`
    });
  }
}

async function mahnen(env, paar, q, abwesend = new Set()) {
  await env.DB.prepare("update quests set mahnung_runde = ?1 where id = ?2").bind(q.faellig_am, q.id).run();
  const tage = -tageBis(q.faellig_am);
  await meldeAlle(env, paar, abwesend, {
    art: "info",
    titel: `${q.name} ist überfällig`,
    text: `${tage} ${tage === 1 ? "Tag" : "Tage"} über der Zeit. Wer macht sie?`
  });
}

/** Nach sieben überfälligen Tagen zahlt der ganze Haushalt — es war eine
 *  Gemeinschaftsaufgabe, also trifft es alle gleich.
 *
 *  Wer im Urlaub ist, zahlt nicht mit. Die Anwesenden zahlen deshalb aber auch
 *  nicht mehr: den Ausfall umzulegen hieße, sie für die Abwesenheit der anderen
 *  zu bestrafen. Die Strafe wird kleiner, nicht schwerer. */
async function strafen(env, paar, q, abwesend = new Set()) {
  const zahlen = (await mitgliederVon(env, paar)).filter((wer) => !abwesend.has(wer));
  if (!zahlen.length) {
    // Alle weg, ohne Haushaltsurlaub: dann steht die Runde einfach still.
    await env.DB.prepare("update quests set strafe_runde = ?1 where id = ?2").bind(q.faellig_am, q.id).run();
    return;
  }

  await env.DB.batch([
    env.DB.prepare("update quests set strafe_runde = ?1 where id = ?2").bind(q.faellig_am, q.id),
    ...zahlen.map((wer) => env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       values (?1, ?2, ?3, ?4, ?5, 'strafe', ?6)`
    ).bind(id(), paar, wer, -q.points, `Gruppenstrafe: ${q.name}`, `${q.id}:${q.faellig_am}`))
  ]);

  await meldeAlle(env, paar, abwesend, {
    art: "abgelehnt",
    titel: `${q.name} — sieben Tage überfällig`,
    text: `Gruppenstrafe: ${q.points} Cleanies für jeden, der da ist.`,
    punkte: -q.points
  });
}

/* ------------------------------------------------------------------ Bewerben */

async function holeAufgabe(env, ich, questId) {
  const q = await env.DB.prepare(
    "select * from quests where id = ?1 and couple_id = ?2 and active = 1 and wiederkehrend = 1"
  ).bind(questId, ich.couple_id).first();
  if (!q) throw new Fehler("Diese Aufgabe gibt es nicht", 404);
  return q;
}

export async function bewerben(env, ich, questId) {
  const q = await holeAufgabe(env, ich, questId);
  if (q.zugewiesen) throw new Fehler("Diese Runde ist schon vergeben");
  if (q.vergabe_runde === q.faellig_am) throw new Fehler("Die Rangliste steht bereits");

  await env.DB.prepare(
    `insert into bewerbungen (id, couple_id, quest_id, member_id, runde) values (?1, ?2, ?3, ?4, ?5)
     on conflict(quest_id, runde, member_id) do update set status = 'offen'`
  ).bind(id(), ich.couple_id, q.id, ich.id, q.faellig_am).run();

  await meldeAlle(env, ich.couple_id, ich.id, {
    art: "info",
    titel: `${vorname(ich.name)} bewirbt sich`,
    text: `${q.name} — wer noch will, meldet sich bis morgen.`
  });
  return { ok: true };
}

export async function bewerbungZurueck(env, ich, questId) {
  const q = await holeAufgabe(env, ich, questId);
  if (q.vergabe_runde === q.faellig_am) throw new Fehler("Zu spät — die Rangliste steht schon");

  await env.DB.prepare("delete from bewerbungen where quest_id = ?1 and runde = ?2 and member_id = ?3")
    .bind(q.id, q.faellig_am, ich.id).run();
  return { ok: true };
}

/** Annehmen oder weiterreichen — nur, wer gerade oben steht. */
export async function vergabeEntscheiden(env, ich, questId, annehmen) {
  const q = await holeAufgabe(env, ich, questId);
  if (q.dran !== ich.id) throw new Fehler("Entscheiden darf nur, wer oben in der Rangliste steht");

  if (annehmen) {
    const andere = await env.DB.prepare(
      "select member_id from bewerbungen where quest_id = ?1 and runde = ?2 and status = 'offen' and member_id <> ?3"
    ).bind(q.id, q.faellig_am, ich.id).all();

    await env.DB.batch([
      env.DB.prepare("update quests set zugewiesen = ?1, dran = null where id = ?2").bind(ich.id, q.id),
      env.DB.prepare("update bewerbungen set status = 'vergeben' where quest_id = ?1 and runde = ?2 and member_id = ?3")
        .bind(q.id, q.faellig_am, ich.id),
      env.DB.prepare("update bewerbungen set status = 'abgesagt' where quest_id = ?1 and runde = ?2 and status = 'offen'")
        .bind(q.id, q.faellig_am)
    ]);

    for (const b of andere.results) {
      await melde(env, ich.couple_id, b.member_id, {
        art: "info", titel: `${q.name} geht an ${vorname(ich.name)}`,
        text: "Beim nächsten Mal stehst du weiter oben."
      });
    }
    return { ok: true, status: "angenommen" };
  }

  await env.DB.prepare(
    "update bewerbungen set status = 'abgelehnt' where quest_id = ?1 and runde = ?2 and member_id = ?3"
  ).bind(q.id, q.faellig_am, ich.id).run();

  const rest = await env.DB.prepare(
    `select u.id, u.name from bewerbungen b join users u on u.id = b.member_id
      where b.quest_id = ?1 and b.runde = ?2 and b.status = 'offen'`
  ).bind(q.id, q.faellig_am).all();

  if (!rest.results.length) {
    await env.DB.prepare("update quests set dran = null where id = ?1").bind(q.id).run();
    await meldeAlle(env, ich.couple_id, null, {
      art: "info", titel: `${q.name} ist wieder offen`,
      text: "Alle Bewerber haben abgelehnt — wer sie macht, macht sie."
    });
    return { ok: true, status: "offen" };
  }

  const zaehler = await zaehlerFuer(env, q.id);
  const naechster = rangfolge(rest.results, zaehler)[0];
  await env.DB.prepare("update quests set dran = ?1 where id = ?2").bind(naechster.id, q.id).run();
  await melde(env, ich.couple_id, naechster.id, {
    art: "info", titel: `Jetzt bist du dran: ${q.name}`,
    text: `${vorname(ich.name)} hat weitergereicht.`
  });
  return { ok: true, status: "weitergereicht" };
}

/* ------------------------------------------------------------------ Melden und Bestätigen */

/**
 * Prüft, ob eine wiederkehrende Quest gerade gemeldet werden darf. Wird aus
 * dem gewöhnlichen Melden gerufen — für alle anderen Quests passiert nichts.
 */
export function meldenErlaubt(quest, ich, { trotzdem = false, grund = "" } = {}) {
  if (!quest.wiederkehrend) return null;

  if (quest.zugewiesen && quest.zugewiesen !== ich.id) {
    throw new Fehler("Diese Runde gehört jemand anderem");
  }
  const offen = tageBis(quest.faellig_am);
  const sauber = String(grund).slice(0, 300).trim();
  if (offen > 0 && !trotzdem) {
    throw new Fehler(`Gesperrt bis ${quest.faellig_am} — noch ${offen} ${offen === 1 ? "Tag" : "Tage"}`);
  }
  if (offen > 0 && sauber.length < 3) {
    throw new Fehler("Für besondere Umstände braucht es eine Begründung");
  }
  return offen > 0 ? sauber : null;      // Begründung, falls vorzeitig
}

/**
 * Nach einer bestätigten Meldung springt die Fälligkeit um den Rhythmus nach
 * vorn — gerechnet ab heute, nicht ab dem alten Termin. Sonst wäre eine spät
 * erledigte Aufgabe sofort wieder überfällig.
 */
export function nachErledigung(env, quest) {
  if (!quest.wiederkehrend) return [];
  return [
    env.DB.prepare(
      `update quests set faellig_am = date('now', '+' || tage || ' days'),
                         dran = null, zugewiesen = null, vergabe_runde = null,
                         strafe_runde = null, mahnung_runde = null
        where id = ?1`
    ).bind(quest.id),
    env.DB.prepare("update bewerbungen set status = 'abgesagt' where quest_id = ?1 and status = 'offen'")
      .bind(quest.id)
  ];
}

/* ------------------------------------------------------------------ Anlegen und Ändern */

/** Aus einer Quest eine wiederkehrende machen — oder zurück. */
export function rhythmusSetzen(env, vorschlag) {
  const daten = JSON.parse(vorschlag.payload || "{}");
  if (daten.wiederkehrend === false) {
    return env.DB.prepare(
      `update quests set wiederkehrend = 0, tage = null, rhythmus = null, faellig_am = null,
                         dran = null, zugewiesen = null, vergabe_runde = null,
                         strafe_runde = null, mahnung_runde = null
        where id = ?1 and couple_id = ?2`
    ).bind(vorschlag.target_id, vorschlag.couple_id);
  }

  const tage = RHYTHMEN[daten.rhythmus] || 7;
  return env.DB.prepare(
    `update quests set wiederkehrend = 1, tage = ?1, rhythmus = ?2,
                       faellig_am = coalesce(faellig_am, date('now', '+' || ?1 || ' days'))
      where id = ?3 and couple_id = ?4`
  ).bind(tage, daten.rhythmus || "1× pro Woche", vorschlag.target_id, vorschlag.couple_id);
}

/** Eine neue Quest, die von Anfang an einen Rhythmus hat. */
export function questMitRhythmus(env, vorschlag) {
  const daten = JSON.parse(vorschlag.payload || "{}");
  const tage = RHYTHMEN[daten.rhythmus] || 7;
  return env.DB.prepare(
    `insert into quests (id, couple_id, name, category, points, wiederkehrend, tage, rhythmus, faellig_am)
     values (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, date('now', '+' || ?6 || ' days'))`
  ).bind(vorschlag.id, vorschlag.couple_id, vorschlag.name, vorschlag.category || "Sonstiges",
         vorschlag.new_value, tage, daten.rhythmus || "1× pro Woche");
}

export { Fehler as PlanFehler };
