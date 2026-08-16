// Der Haushaltsplan: wiederkehrende Aufgaben, Bewerbung, Sperre, Strafe.
//
// Getrennt von den Quests. Der Unterschied ist der Rhythmus: eine Aufgabe hat
// ein Fälligkeitsdatum, das nach jedem Erledigen um genau den Rhythmus nach
// vorn springt. Vor diesem Datum ist sie für alle gesperrt — daraus ergibt
// sich die Sperrfrist, ohne dass sie irgendwo zusätzlich gespeichert wäre.
//
// Zwei Zahlen entscheiden, wer drankommt: „am Stück" (wie oft zuletzt
// hintereinander) und „dieses Jahr". Wenig am Stück steht oben, bei
// Gleichstand die kleinere Jahreszahl. Das sorgt für den Wechsel.

import { melde, meldeAlle, mitgliederVon } from "./melden.js";

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

const HEUTE = "date('now')";
const tageBis = (datum) =>
  Math.round((Date.parse(datum + "T12:00:00Z") - Date.parse(new Date().toISOString().slice(0, 10) + "T12:00:00Z")) / 86400000);

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

async function zaehlerFuer(env, aufgabeId) {
  const erledigt = await env.DB.prepare(
    `select member_id, created_at from plan_erledigungen
      where aufgabe_id = ?1 and status = 'bestaetigt' order by created_at desc`
  ).bind(aufgabeId).all();
  if (!erledigt.results.length) return {};
  return zaehlerAus(erledigt.results, String(new Date().getUTCFullYear()));
}

/* ------------------------------------------------------------------ Liste */

/** Was die Liste braucht — bewusst schlank, die Zähler kommen erst im Detail. */
export async function planListe(env, paar, ichId) {
  const [aufgaben, bewerbungen, offene] = await Promise.all([
    env.DB.prepare(`select * from plan_aufgaben where couple_id = ?1 and aktiv = 1
                     order by faellig_am`).bind(paar).all(),
    env.DB.prepare(`select b.aufgabe_id, b.member_id, b.status, b.runde from plan_bewerbungen b
                     join plan_aufgaben a on a.id = b.aufgabe_id
                    where b.couple_id = ?1 and b.runde = a.faellig_am and b.status = 'offen'`).bind(paar).all(),
    env.DB.prepare(`select id, aufgabe_id, member_id, punkte, grund, created_at from plan_erledigungen
                     where couple_id = ?1 and status = 'offen'`).bind(paar).all()
  ]);

  return aufgaben.results.map((a) => {
    const meine = bewerbungen.results.filter((b) => b.aufgabe_id === a.id);
    const pruefung = offene.results.find((e) => e.aufgabe_id === a.id) || null;
    return {
      id: a.id,
      name: a.name,
      raum: a.raum,
      punkte: a.punkte,
      tage: a.tage,
      rhythmus: a.rhythmus,
      faellig_am: a.faellig_am,
      offen: tageBis(a.faellig_am),
      dran: a.dran,
      zugewiesen: a.zugewiesen,
      bewerber: meine.length,
      ichBeworben: meine.some((b) => b.member_id === ichId),
      pruefung: pruefung ? { id: pruefung.id, von: pruefung.member_id, punkte: pruefung.punkte,
                             grund: pruefung.grund, created_at: pruefung.created_at } : null
    };
  });
}

/** Detail mit Zählern und — sobald die Runde eingefroren ist — der Rangliste. */
export async function aufgabeDetail(env, ich, aufgabeId) {
  const a = await env.DB.prepare("select * from plan_aufgaben where id = ?1 and couple_id = ?2")
    .bind(aufgabeId, ich.couple_id).first();
  if (!a) throw new Fehler("Diese Aufgabe gibt es nicht", 404);

  const [personen, bewerbungen, letzte] = await Promise.all([
    env.DB.prepare(`select u.id, u.name, u.bild, u.avatar_url from members m join users u on u.id = m.user_id
                     where m.couple_id = ?1`).bind(ich.couple_id).all(),
    env.DB.prepare(`select member_id, status from plan_bewerbungen
                     where aufgabe_id = ?1 and runde = ?2`).bind(aufgabeId, a.faellig_am).all(),
    env.DB.prepare(`select member_id, created_at from plan_erledigungen
                     where aufgabe_id = ?1 and status = 'bestaetigt'
                     order by created_at desc limit 1`).bind(aufgabeId).first()
  ]);

  const zaehler = await zaehlerFuer(env, aufgabeId);
  const mitglieder = personen.results.map((p) => ({
    ...p, ...(zaehler[p.id] || { stueck: 0, jahr: 0 })
  }));

  // Eine Rangliste gibt es nur, solange wirklich mehrere zur Wahl stehen: nach
  // der Zuteilung — oder wenn ein einziger Bewerber sie direkt bekommen hat —
  // wäre sie leer und stünde sinnlos im Weg.
  const offeneBewerber = bewerbungen.results.filter((b) => b.status === "offen").map((b) => b.member_id);
  const liste = !a.zugewiesen && a.vergabe_runde === a.faellig_am && offeneBewerber.length
    ? rangfolge(mitglieder.filter((m) => offeneBewerber.includes(m.id)), zaehler)
    : null;

  return {
    ...a,
    offen: tageBis(a.faellig_am),
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
 * Läuft bei jedem Laden der App. Sie ersetzt die Uhr, die es auf einem Worker
 * ohne Zeitplan nicht gibt: Rangliste einfrieren, Alleinbewerber zuteilen,
 * an Überfälliges erinnern, nach sieben Tagen die Gruppenstrafe buchen.
 */
export async function planNachziehen(env, paar) {
  const haus = await env.DB.prepare("select strafe_an from couples where id = ?1").bind(paar).first();
  const aufgaben = await env.DB.prepare(
    "select * from plan_aufgaben where couple_id = ?1 and aktiv = 1"
  ).bind(paar).all();

  for (const a of aufgaben.results) {
    try {
      const offen = tageBis(a.faellig_am);
      if (offen <= 1 && a.vergabe_runde !== a.faellig_am && !a.zugewiesen) await vergeben(env, paar, a);
      if (offen < 0 && a.mahnung_runde !== a.faellig_am) await mahnen(env, paar, a);
      if (offen <= -7 && a.strafe_runde !== a.faellig_am && haus?.strafe_an) await strafen(env, paar, a);
    } catch {
      // Eine einzelne Aufgabe darf das Laden der App nie verhindern.
    }
  }
}

/** Einen Tag vor Fälligkeit steht die Reihenfolge fest. */
async function vergeben(env, paar, a) {
  const bewerber = await env.DB.prepare(
    "select member_id from plan_bewerbungen where aufgabe_id = ?1 and runde = ?2 and status = 'offen'"
  ).bind(a.id, a.faellig_am).all();
  const ids = bewerber.results.map((b) => b.member_id);
  if (!ids.length) return;                       // Niemand will — bleibt für alle offen.

  const personen = await env.DB.prepare(
    `select u.id, u.name from members m join users u on u.id = m.user_id where m.couple_id = ?1`
  ).bind(paar).all();
  const zaehler = await zaehlerFuer(env, a.id);
  const geordnet = rangfolge(personen.results.filter((p) => ids.includes(p.id)), zaehler);

  if (geordnet.length === 1) {
    // Ein einziger Bewerber bekommt sie ohne Rangliste.
    await env.DB.batch([
      env.DB.prepare("update plan_aufgaben set zugewiesen = ?1, vergabe_runde = ?2, dran = null where id = ?3")
        .bind(geordnet[0].id, a.faellig_am, a.id),
      env.DB.prepare("update plan_bewerbungen set status = 'vergeben' where aufgabe_id = ?1 and runde = ?2 and member_id = ?3")
        .bind(a.id, a.faellig_am, geordnet[0].id)
    ]);
    await melde(env, paar, geordnet[0].id, {
      art: "info", titel: `${a.name} gehört dir`,
      text: "Du warst der einzige Bewerber — keine Rangliste nötig."
    });
    return;
  }

  await env.DB.prepare("update plan_aufgaben set dran = ?1, vergabe_runde = ?2 where id = ?3")
    .bind(geordnet[0].id, a.faellig_am, a.id).run();

  for (const p of geordnet) {
    await melde(env, paar, p.id, {
      art: "info",
      titel: p.id === geordnet[0].id ? `Du bist dran: ${a.name}` : `Rangliste steht: ${a.name}`,
      text: p.id === geordnet[0].id
        ? "Nimm an oder gib weiter — bis morgen früh."
        : `${vorname(geordnet[0].name)} steht oben und entscheidet.`
    });
  }
}

async function mahnen(env, paar, a) {
  await env.DB.prepare("update plan_aufgaben set mahnung_runde = ?1 where id = ?2").bind(a.faellig_am, a.id).run();
  const tage = -tageBis(a.faellig_am);
  await meldeAlle(env, paar, null, {
    art: "info",
    titel: `${a.name} ist überfällig`,
    text: `${tage} ${tage === 1 ? "Tag" : "Tage"} über der Zeit. Wer macht sie?`
  });
}

/** Nach sieben überfälligen Tagen zahlt der ganze Haushalt — es war eine
 *  Gemeinschaftsaufgabe, also trifft es alle gleich. */
async function strafen(env, paar, a) {
  const alle = await mitgliederVon(env, paar);
  await env.DB.batch([
    env.DB.prepare("update plan_aufgaben set strafe_runde = ?1 where id = ?2").bind(a.faellig_am, a.id),
    ...alle.map((wer) => env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       values (?1, ?2, ?3, ?4, ?5, 'strafe', ?6)`
    ).bind(id(), paar, wer, -a.punkte, `Gruppenstrafe: ${a.name}`, `${a.id}:${a.faellig_am}`))
  ]);

  await meldeAlle(env, paar, null, {
    art: "abgelehnt",
    titel: `${a.name} — sieben Tage überfällig`,
    text: `Gruppenstrafe: ${a.punkte} Punkte für jeden.`,
    punkte: -a.punkte
  });
}

/* ------------------------------------------------------------------ Bewerben */

export async function bewerben(env, ich, aufgabeId) {
  const a = await env.DB.prepare("select * from plan_aufgaben where id = ?1 and couple_id = ?2 and aktiv = 1")
    .bind(aufgabeId, ich.couple_id).first();
  if (!a) throw new Fehler("Diese Aufgabe gibt es nicht", 404);
  if (a.zugewiesen) throw new Fehler("Diese Runde ist schon vergeben");
  if (a.vergabe_runde === a.faellig_am) throw new Fehler("Die Rangliste steht bereits");

  await env.DB.prepare(
    `insert into plan_bewerbungen (id, aufgabe_id, couple_id, member_id, runde) values (?1, ?2, ?3, ?4, ?5)
     on conflict(aufgabe_id, runde, member_id) do update set status = 'offen'`
  ).bind(id(), a.id, ich.couple_id, ich.id, a.faellig_am).run();

  await meldeAlle(env, ich.couple_id, ich.id, {
    art: "info",
    titel: `${vorname(ich.name)} bewirbt sich`,
    text: `${a.name} — wer noch will, meldet sich bis morgen.`
  });
  return { ok: true };
}

export async function bewerbungZurueck(env, ich, aufgabeId) {
  const a = await env.DB.prepare("select * from plan_aufgaben where id = ?1 and couple_id = ?2")
    .bind(aufgabeId, ich.couple_id).first();
  if (!a) throw new Fehler("Diese Aufgabe gibt es nicht", 404);
  if (a.vergabe_runde === a.faellig_am) throw new Fehler("Zu spät — die Rangliste steht schon");

  await env.DB.prepare(
    "delete from plan_bewerbungen where aufgabe_id = ?1 and runde = ?2 and member_id = ?3"
  ).bind(a.id, a.faellig_am, ich.id).run();
  return { ok: true };
}

/** Annehmen oder weiterreichen — nur, wer gerade oben steht. */
export async function vergabeEntscheiden(env, ich, aufgabeId, annehmen) {
  const a = await env.DB.prepare("select * from plan_aufgaben where id = ?1 and couple_id = ?2")
    .bind(aufgabeId, ich.couple_id).first();
  if (!a) throw new Fehler("Diese Aufgabe gibt es nicht", 404);
  if (a.dran !== ich.id) throw new Fehler("Entscheiden darf nur, wer oben in der Rangliste steht");

  if (annehmen) {
    const andere = await env.DB.prepare(
      "select member_id from plan_bewerbungen where aufgabe_id = ?1 and runde = ?2 and status = 'offen' and member_id <> ?3"
    ).bind(a.id, a.faellig_am, ich.id).all();

    await env.DB.batch([
      env.DB.prepare("update plan_aufgaben set zugewiesen = ?1, dran = null where id = ?2").bind(ich.id, a.id),
      env.DB.prepare("update plan_bewerbungen set status = 'vergeben' where aufgabe_id = ?1 and runde = ?2 and member_id = ?3")
        .bind(a.id, a.faellig_am, ich.id),
      env.DB.prepare("update plan_bewerbungen set status = 'abgesagt' where aufgabe_id = ?1 and runde = ?2 and status = 'offen'")
        .bind(a.id, a.faellig_am)
    ]);

    for (const b of andere.results) {
      await melde(env, ich.couple_id, b.member_id, {
        art: "info", titel: `${a.name} geht an ${vorname(ich.name)}`,
        text: "Beim nächsten Mal stehst du weiter oben."
      });
    }
    return { ok: true, status: "angenommen" };
  }

  // Abgelehnt: an den Nächsten weiterreichen.
  await env.DB.prepare(
    "update plan_bewerbungen set status = 'abgelehnt' where aufgabe_id = ?1 and runde = ?2 and member_id = ?3"
  ).bind(a.id, a.faellig_am, ich.id).run();

  const rest = await env.DB.prepare(
    `select u.id, u.name from plan_bewerbungen b join users u on u.id = b.member_id
      where b.aufgabe_id = ?1 and b.runde = ?2 and b.status = 'offen'`
  ).bind(a.id, a.faellig_am).all();

  if (!rest.results.length) {
    await env.DB.prepare("update plan_aufgaben set dran = null where id = ?1").bind(a.id).run();
    await meldeAlle(env, ich.couple_id, null, {
      art: "info", titel: `${a.name} ist wieder offen`,
      text: "Alle Bewerber haben abgelehnt — wer sie macht, macht sie."
    });
    return { ok: true, status: "offen" };
  }

  const zaehler = await zaehlerFuer(env, a.id);
  const naechster = rangfolge(rest.results, zaehler)[0];
  await env.DB.prepare("update plan_aufgaben set dran = ?1 where id = ?2").bind(naechster.id, a.id).run();
  await melde(env, ich.couple_id, naechster.id, {
    art: "info", titel: `Jetzt bist du dran: ${a.name}`,
    text: `${vorname(ich.name)} hat weitergereicht.`
  });
  return { ok: true, status: "weitergereicht" };
}

/* ------------------------------------------------------------------ Erledigen */

export async function erledigtMelden(env, ich, aufgabeId, { trotzdem = false, grund = "" } = {}) {
  const a = await env.DB.prepare("select * from plan_aufgaben where id = ?1 and couple_id = ?2 and aktiv = 1")
    .bind(aufgabeId, ich.couple_id).first();
  if (!a) throw new Fehler("Diese Aufgabe gibt es nicht", 404);

  const laeuft = await env.DB.prepare(
    "select 1 as da from plan_erledigungen where aufgabe_id = ?1 and status = 'offen'"
  ).bind(a.id).first();
  if (laeuft) throw new Fehler("Dazu wartet schon eine Meldung auf Bestätigung");

  if (a.zugewiesen && a.zugewiesen !== ich.id) {
    throw new Fehler("Diese Runde gehört jemand anderem");
  }

  const offen = tageBis(a.faellig_am);
  const sauber = String(grund).slice(0, 300).trim();
  if (offen > 0 && !trotzdem) {
    throw new Fehler(`Gesperrt bis ${a.faellig_am} — noch ${offen} ${offen === 1 ? "Tag" : "Tage"}`);
  }
  if (offen > 0 && sauber.length < 3) {
    throw new Fehler("Für besondere Umstände braucht es eine Begründung");
  }

  await env.DB.prepare(
    `insert into plan_erledigungen (id, aufgabe_id, couple_id, member_id, punkte, grund)
     values (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(id(), a.id, ich.couple_id, ich.id, a.punkte, offen > 0 ? sauber : null).run();

  await meldeAlle(env, ich.couple_id, ich.id, {
    art: "info",
    titel: `${vorname(ich.name)} hat ${a.name} erledigt`,
    text: offen > 0
      ? `Vorzeitig: „${sauber}“ — ${a.punkte} Punkte warten auf eine Bestätigung.`
      : `${a.punkte} Punkte warten auf eine Bestätigung.`
  });
  return { ok: true };
}

export async function erledigungEntscheiden(env, ich, erledigungId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");

  const e = await env.DB.prepare(
    `select e.*, a.name, a.tage from plan_erledigungen e join plan_aufgaben a on a.id = e.aufgabe_id
      where e.id = ?1 and e.couple_id = ?2`
  ).bind(erledigungId, ich.couple_id).first();
  if (!e) throw new Fehler("Meldung nicht gefunden", 404);
  if (e.member_id === ich.id) throw new Fehler("Eine Meldung muss von jemand anderem bestätigt werden");

  const anweisungen = [
    env.DB.prepare(
      `update plan_erledigungen set status = ?1, decided_by = ?2, decided_at = datetime('now')
        where id = ?3 and status = 'offen' and member_id <> ?2`
    ).bind(status, ich.id, erledigungId)
  ];

  if (status === "bestaetigt") {
    anweisungen.push(
      env.DB.prepare(
        `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
         select ?1, e.couple_id, e.member_id, e.punkte, a.name, 'plan', e.id
           from plan_erledigungen e join plan_aufgaben a on a.id = e.aufgabe_id
          where e.id = ?2 and e.status = 'bestaetigt'
            and not exists (select 1 from ledger where source_id = e.id)`
      ).bind(id(), erledigungId),
      // Neues Fälligkeitsdatum ab heute — sonst wäre eine verspätet erledigte
      // Aufgabe sofort wieder überfällig. Vergabe und Mahnungen zurücksetzen.
      env.DB.prepare(
        `update plan_aufgaben
            set faellig_am = date('now', '+' || tage || ' days'),
                dran = null, zugewiesen = null, vergabe_runde = null,
                strafe_runde = null, mahnung_runde = null
          where id = ?1`
      ).bind(e.aufgabe_id),
      env.DB.prepare("update plan_bewerbungen set status = 'abgesagt' where aufgabe_id = ?1 and status = 'offen'")
        .bind(e.aufgabe_id)
    );
  }

  const [entschieden] = await env.DB.batch(anweisungen);
  if (!entschieden.meta.changes) throw new Fehler("Diese Meldung ist bereits entschieden");

  await melde(env, ich.couple_id, e.member_id, status === "bestaetigt"
    ? { art: "bestaetigt", titel: `${vorname(ich.name)} hat bestätigt`, text: e.name, punkte: e.punkte }
    : { art: "abgelehnt", titel: `${vorname(ich.name)} hat abgelehnt`, text: e.name });

  return { ok: true, punkte: e.punkte, aufgabe: e.name };
}

/* ------------------------------------------------------------------ Anlegen und Ändern */

/** Wird aus der Auszählung eines Vorschlags gerufen — Aufgaben entstehen nur gemeinsam. */
export function aufgabeAnlegen(env, vorschlag) {
  const daten = JSON.parse(vorschlag.payload || "{}");
  const tage = RHYTHMEN[daten.rhythmus] || 7;
  return env.DB.prepare(
    `insert into plan_aufgaben (id, couple_id, name, raum, punkte, tage, rhythmus, faellig_am)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, date('now', '+' || ?6 || ' days'))`
  ).bind(vorschlag.id, vorschlag.couple_id, vorschlag.name, daten.raum || "Sonstiges",
         vorschlag.new_value, tage, daten.rhythmus || "1× pro Woche");
}

export function aufgabeAendern(env, vorschlag) {
  const daten = JSON.parse(vorschlag.payload || "{}");
  const tage = RHYTHMEN[daten.rhythmus] || 7;
  return env.DB.prepare(
    `update plan_aufgaben set punkte = ?1, tage = ?2, rhythmus = ?3, raum = ?4
      where id = ?5 and couple_id = ?6`
  ).bind(vorschlag.new_value, tage, daten.rhythmus || "1× pro Woche",
         daten.raum || "Sonstiges", vorschlag.target_id, vorschlag.couple_id);
}

export function aufgabeLoeschen(env, vorschlag) {
  return env.DB.prepare("update plan_aufgaben set aktiv = 0 where id = ?1 and couple_id = ?2")
    .bind(vorschlag.target_id, vorschlag.couple_id);
}

export { Fehler as PlanFehler };
