// Events — Regeln auf Zeit, die der Haushalt selbst schreibt.
//
// Ein Event sagt: „so viele Cleanies, dafür, so lange, so oft, für die". Was
// „dafür" heißt, gibt niemand vor — das ist ein freies Textfeld, und genau das
// ist der Unterschied zwischen einer Familie („1 Stunde Zockzeit") und einer
// WG („Party anmelden").
//
// Alles Weitere ist Wiederverwendung: ein freigegebenes Event hängt an einer
// ganz gewöhnlichen Belohnung (Richtung „ausgeben") oder an einer ganz
// gewöhnlichen Quest (Richtung „verdienen"). Läuft das Fenster, ist der
// Eintrag aktiv; ist es vorbei, ist er es nicht. Einlösen ist deshalb der
// Antrag, den es längst gibt — samt Freigabe, Empfangsbestätigung und Verlauf.
//
// Ein Dauerevent ist dasselbe mit einem Rhythmus davor. Es wird einmal
// abgestimmt, danach rückt sein Fenster von allein weiter; sonst wäre es kein
// Dauerevent, sondern eine Erinnerung, eins anzulegen.

class Fehler extends Error {
  constructor(text, status = 400) { super(text); this.status = status; }
}

/** Die vier Rhythmen eines Dauerevents — dieselben wie im Haushaltsplan,
 *  damit niemand zwei Systeme lernen muss. */
export const RHYTHMEN = {
  "jede Woche": { art: "woche", n: 1 },
  "alle 2 Wochen": { art: "woche", n: 2 },
  "1× im Monat": { art: "monat", n: 1 },
  "1× im Quartal": { art: "monat", n: 3 }
};

/** Wie lange ein Fenster offen steht. Mehr Auswahl braucht es nicht. */
export const LAENGEN = [1, 2, 3, 7, 14, 30];

const TAG = 86400000;
export const HEUTE = () => new Date().toISOString().slice(0, 10);
const alsDatum = (s) => new Date(s + "T12:00:00Z");
const alsText = (d) => d.toISOString().slice(0, 10);
const letzterTag = (jahr, monat) => new Date(Date.UTC(jahr, monat + 1, 0, 12)).getUTCDate();

export const plusTage = (s, n) => alsText(new Date(alsDatum(s).getTime() + n * TAG));

/** Denselben Tag im Monat, n Monate später. Der Starttag ist auf 28 begrenzt,
 *  damit kein Fenster im Februar verschwindet. */
function plusMonate(s, n, tag) {
  const d = alsDatum(s);
  const ziel = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12));
  ziel.setUTCDate(Math.min(tag, letzterTag(ziel.getUTCFullYear(), ziel.getUTCMonth())));
  return alsText(ziel);
}

/** Der Wochentag als 1 = Montag … 7 = Sonntag. */
const wochentag = (s) => alsDatum(s).getUTCDay() || 7;

/** Das erste Fenster, das am Stichtag oder danach anfängt. */
export function ersterStart(ab, rhythmus, starttag) {
  const r = RHYTHMEN[rhythmus];
  if (r.art === "woche") return plusTage(ab, (starttag - wochentag(ab) + 7) % 7);

  const d = alsDatum(ab);
  const kandidat = plusMonate(ab, 0, starttag);
  return kandidat >= ab ? kandidat : plusMonate(alsText(d), 1, starttag);
}

/**
 * Das nächste Fenster nach diesem.
 *
 * Beide Zweige rasten auf dem Starttag ein, statt einfach weiterzuzählen: ein
 * Haushaltsurlaub schiebt die Fenster um seine Tage, und „jedes Wochenende"
 * soll danach wieder am Wochenende liegen und nicht für immer am Montag.
 */
export function naechsterStart(von, rhythmus, starttag) {
  const r = RHYTHMEN[rhythmus];
  if (r.art !== "woche") return plusMonate(von, r.n, starttag);
  return ersterStart(plusTage(von, 7 * r.n), rhythmus, starttag);
}

/** Die nächsten Anfangstermine — für den Satz „Nächste Male: 30.08. · 06.09.". */
export function naechsteTermine(ev, wie_viele = 3) {
  if (!ev.rhythmus) return [];
  const liste = [];
  let von = ev.von;
  for (let i = 0; i < wie_viele; i += 1) {
    von = naechsterStart(von, ev.rhythmus, ev.starttag);
    liste.push(von);
  }
  return liste;
}

/* ------------------------------------------------------------------ Eingabe */

const deckel = (wert) => {
  if (wert === null || wert === undefined || wert === "" || Number(wert) <= 0) return null;
  const n = Math.floor(Number(wert));
  if (!(n > 0 && n <= 999)) throw new Fehler("Der Deckel passt nicht");
  return n;
};

const istDatum = (text) => /^\d{4}-\d{2}-\d{2}$/.test(String(text || "").trim())
  && alsText(alsDatum(String(text).trim())) === String(text).trim();

/**
 * Prüft, was das Blatt geschickt hat, und macht daraus eine saubere
 * Konfiguration. Sie reist im Anhang des Vorschlags mit und wird erst bei der
 * Freigabe zu einem Event — bis dahin ändert sich nichts.
 */
export function konfigPruefen(daten, mitglieder) {
  const richtung = daten.richtung === "verdienen" ? "verdienen" : "ausgeben";

  const titel = String(daten.titel || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (titel.length < 2) throw new Fehler("Wofür das Event gut ist, muss dastehen");

  const beschreibung = String(daten.beschreibung || "").trim().slice(0, 400) || null;

  const cleanies = Math.floor(Number(daten.cleanies));
  if (!(cleanies > 0 && cleanies <= 9999)) throw new Fehler("Der Cleanies-Wert passt nicht");

  const proPerson = deckel(daten.proPerson);
  const gesamt = deckel(daten.gesamt);

  // Wer nicht im Haushalt ist, kann nicht gemeint sein. Sind alle gewählt,
  // ist das dasselbe wie „für alle" — dann bleibt die Liste leer.
  const gewaehlt = [...new Set((Array.isArray(daten.fuer) ? daten.fuer : []).map(String))]
    .filter((w) => mitglieder.includes(w));
  const fuer = gewaehlt.length === mitglieder.length ? [] : gewaehlt;

  const konf = { richtung, titel, beschreibung, cleanies, proPerson, gesamt, fuer,
                 rhythmus: null, starttag: null, laenge: 1, von: null, bis: null };

  if (daten.rhythmus) {
    if (!RHYTHMEN[daten.rhythmus]) throw new Fehler("Unbekannter Rhythmus");
    konf.rhythmus = daten.rhythmus;
    konf.laenge = laengePruefen(daten.laenge);
    const woche = RHYTHMEN[konf.rhythmus].art === "woche";
    const tag = Math.floor(Number(daten.starttag));
    const grenze = woche ? 7 : 28;
    if (!(tag >= 1 && tag <= grenze)) {
      throw new Fehler(woche ? "Der Starttag passt nicht" : "Der Starttag muss zwischen 1 und 28 liegen");
    }
    konf.starttag = tag;
    // Ein Fenster darf sich nicht selbst überholen. Gerechnet wird mit dem
    // kürzesten Abstand, den der Rhythmus haben kann — ein Februar zählt auch.
    const abstand = woche ? 7 * RHYTHMEN[konf.rhythmus].n : 28 * RHYTHMEN[konf.rhythmus].n;
    if (konf.laenge > abstand) {
      throw new Fehler("So lange, wie es läuft, kommt es nicht wieder — kürzeres Fenster oder größerer Abstand");
    }
    return konf;
  }

  if (daten.zeitart === "zeitraum") {
    const von = String(daten.von || "").trim();
    const bis = String(daten.bis || "").trim();
    if (!istDatum(von) || !istDatum(bis)) throw new Fehler("Der Zeitraum fehlt oder ist unvollständig");
    if (bis < von) throw new Fehler("Das Ende liegt vor dem Anfang");
    if (bis < HEUTE()) throw new Fehler("Dieser Zeitraum liegt schon hinter euch");
    const tage = Math.round((alsDatum(bis) - alsDatum(von)) / TAG) + 1;
    if (tage > 366) throw new Fehler("Länger als ein Jahr geht nicht");
    konf.von = von;
    konf.bis = bis;
    konf.laenge = tage;
    return konf;
  }

  konf.laenge = laengePruefen(daten.laenge);
  return konf;
}

function laengePruefen(wert) {
  const n = Math.floor(Number(wert));
  if (!LAENGEN.includes(n)) throw new Fehler("Diese Dauer gibt es nicht");
  return n;
}

/** Das Fenster, mit dem ein Event startet — gerechnet zum Tag der Freigabe. */
export function fensterFuer(konf, ab = HEUTE()) {
  if (konf.rhythmus) {
    const von = ersterStart(ab, konf.rhythmus, konf.starttag);
    return { von, bis: plusTage(von, konf.laenge - 1) };
  }
  if (konf.von) return { von: konf.von, bis: konf.bis };
  return { von: ab, bis: plusTage(ab, konf.laenge - 1) };
}

/* ------------------------------------------------------------------ Nachziehen */

export const laeuft = (ev, tag = HEUTE()) => ev.von <= tag && ev.bis >= tag;

/** Wer mitmachen darf. Leere Liste heißt: alle. */
export function fuerListe(ev) {
  try {
    const liste = JSON.parse(ev.fuer || "[]");
    return Array.isArray(liste) ? liste : [];
  } catch { return []; }
}
export const darfMitmachen = (ev, wer) => {
  const liste = fuerListe(ev);
  return !liste.length || liste.includes(wer);
};

/**
 * Rückt die Fenster nach und schaltet die dahinterliegenden Einträge scharf
 * oder stumm. Läuft beim Laden der App und noch einmal im Wecker — doppelt
 * schadet nicht, weil jeder Schritt nur etwas tut, wenn er etwas zu tun hat.
 */
export async function eventsNachziehen(env, paar) {
  const evs = await env.DB.prepare(
    "select * from events where couple_id = ?1 and aktiv = 1"
  ).bind(paar).all();
  if (!evs.results.length) return;

  const heute = HEUTE();
  const schritte = [];

  for (const ev of evs.results) {
    let { von, bis } = ev;

    if (ev.rhythmus && bis < heute) {
      // Weiterrücken, bis das Fenster wieder in der Zukunft oder Gegenwart
      // liegt. Die Schranke ist nur ein Notausgang für kaputte Daten.
      for (let i = 0; i < 400 && bis < heute; i += 1) {
        von = naechsterStart(von, ev.rhythmus, ev.starttag);
        bis = plusTage(von, ev.laenge - 1);
      }
      schritte.push(env.DB.prepare("update events set von = ?1, bis = ?2 where id = ?3")
        .bind(von, bis, ev.id));
    }

    // Ein einmaliges Event ist mit seinem Fenster zu Ende.
    if (!ev.rhythmus && bis < heute) {
      schritte.push(env.DB.prepare("update events set aktiv = 0 where id = ?1").bind(ev.id));
    }

    const offen = von <= heute && bis >= heute ? 1 : 0;
    const tabelle = ev.richtung === "verdienen" ? "quests" : "rewards";
    schritte.push(env.DB.prepare(
      `update ${tabelle} set active = ?1 where id = ?2 and active <> ?1`
    ).bind(offen, ev.ziel_id));
  }

  if (schritte.length) await env.DB.batch(schritte);
}

/* ------------------------------------------------------------------ Einlösen */

/**
 * Wie oft ein Event in seinem laufenden Fenster schon genutzt wurde — einmal
 * insgesamt und einmal von mir. Gezählt wird ab dem Anfang des Fensters,
 * damit ein Dauerevent jedes Mal frisch beginnt.
 */
export async function eventStaende(env, paar, wer) {
  const [raus, rein] = await Promise.all([
    env.DB.prepare(
      `select b.event_id as ev, count(*) as n,
              sum(case when r.requested_by = ?2 then 1 else 0 end) as meins
         from requests r join rewards b on b.id = r.reward_id
         join events e on e.id = b.event_id
        where b.couple_id = ?1 and r.status in ('offen','bestaetigt')
          and date(r.created_at) >= e.von
        group by b.event_id`
    ).bind(paar, wer).all(),
    env.DB.prepare(
      `select q.event_id as ev, sum(c.quantity) as n,
              sum(case when c.claimed_by = ?2 then c.quantity else 0 end) as meins
         from claims c join quests q on q.id = c.quest_id
         join events e on e.id = q.event_id
        where q.couple_id = ?1 and c.status in ('offen','bestaetigt')
          and date(c.created_at) >= e.von
        group by q.event_id`
    ).bind(paar, wer).all()
  ]);

  const stand = {};
  for (const z of [...raus.results, ...rein.results]) {
    stand[z.ev] = { gesamt: Number(z.n) || 0, meins: Number(z.meins) || 0 };
  }
  return stand;
}

/**
 * Darf diese Person das Event jetzt und in dieser Menge nutzen?
 *
 * Wird aus dem Antrag beziehungsweise der Meldung heraus gerufen — also genau
 * dort, wo sonst auch entschieden wird, ob etwas gebucht werden darf.
 */
export async function eventPruefen(env, ich, eventId, anzahl = 1) {
  const ev = await env.DB.prepare("select * from events where id = ?1 and couple_id = ?2")
    .bind(eventId, ich.couple_id).first();
  if (!ev) throw new Fehler("Dieses Event gibt es nicht", 404);
  if (!ev.aktiv) throw new Fehler("Dieses Event ist beendet");
  if (!laeuft(ev)) throw new Fehler("Dieses Event läuft gerade nicht");
  if (!darfMitmachen(ev, ich.id)) throw new Fehler("Dieses Event ist nicht für dich gedacht");

  const stand = (await eventStaende(env, ich.couple_id, ich.id))[ev.id] || { gesamt: 0, meins: 0 };

  if (ev.pro_person && stand.meins + anzahl > ev.pro_person) {
    const rest = Math.max(0, ev.pro_person - stand.meins);
    throw new Fehler(rest
      ? `Davon bleibt dir in diesem Zeitraum noch ${rest}×`
      : "Du hast dieses Event in diesem Zeitraum schon ausgeschöpft");
  }
  if (ev.gesamt && stand.gesamt + anzahl > ev.gesamt) {
    const rest = Math.max(0, ev.gesamt - stand.gesamt);
    throw new Fehler(rest
      ? `Für alle zusammen bleibt noch ${rest}×`
      : "Dieses Event ist für diesen Zeitraum ausgeschöpft");
  }
  return ev;
}

/* ------------------------------------------------------------------ Anlegen */

/** Die Kennung des Eintrags, der hinter einem Event steht. Sie leitet sich aus
 *  der Abstimmung ab: damit kann dieselbe Abstimmung nie zwei davon anlegen. */
export const zielKennung = (eventId) => `${eventId}:z`;

/**
 * Wird aus der Abstimmung heraus gerufen, sobald alle zugestimmt haben. Gibt
 * die Anweisungen zurück, damit sie in derselben Transaktion laufen wie das
 * Schließen der Abstimmung — entweder beides oder nichts.
 */
export function eventAnlegen(env, vorschlag, konf) {
  const { von, bis } = fensterFuer(konf);
  const ziel = zielKennung(vorschlag.id);
  const offen = laeuft({ von, bis }) ? 1 : 0;

  const anweisungen = [
    env.DB.prepare(
      `insert into events (id, couple_id, richtung, titel, beschreibung, cleanies, pro_person,
                           gesamt, fuer, von, bis, rhythmus, starttag, laenge, ziel_id, created_by)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
    ).bind(vorschlag.id, vorschlag.couple_id, konf.richtung, konf.titel, konf.beschreibung,
           konf.cleanies, konf.proPerson, konf.gesamt, JSON.stringify(konf.fuer || []),
           von, bis, konf.rhythmus, konf.starttag, konf.laenge, ziel, vorschlag.created_by)
  ];

  // Der Eintrag, an dem alles Weitere hängt: eine Belohnung oder eine Quest.
  anweisungen.push(konf.richtung === "verdienen"
    ? env.DB.prepare(
        `insert into quests (id, couple_id, name, category, points, active, event_id)
         values (?1, ?2, ?3, 'Event', ?4, ?5, ?6)`
      ).bind(ziel, vorschlag.couple_id, konf.titel, konf.cleanies, offen, vorschlag.id)
    : env.DB.prepare(
        `insert into rewards (id, couple_id, name, cost, bestaetigen, active, event_id)
         values (?1, ?2, ?3, ?4, 1, ?5, ?6)`
      ).bind(ziel, vorschlag.couple_id, konf.titel, konf.cleanies, offen, vorschlag.id));

  return { anweisungen, von, bis };
}

/**
 * Ein Event ändern. Die Richtung bleibt, wie sie ist — sie entscheidet, ob
 * eine Belohnung oder eine Quest dahintersteht, und die wandert nicht mitten
 * im Betrieb. Ein laufendes Fenster wird nicht abgeschnitten: die neue
 * Zeitplanung greift ab dem nächsten.
 */
export async function eventAendern(env, vorschlag, konf) {
  const ev = await env.DB.prepare("select * from events where id = ?1 and couple_id = ?2")
    .bind(vorschlag.target_id, vorschlag.couple_id).first();
  if (!ev) throw new Fehler("Dieses Event gibt es nicht", 404);

  const offen = laeuft(ev);
  const fenster = offen ? { von: ev.von, bis: ev.bis } : fensterFuer(konf);

  return [
    env.DB.prepare(
      `update events set titel = ?1, beschreibung = ?2, cleanies = ?3, pro_person = ?4,
                         gesamt = ?5, fuer = ?6, rhythmus = ?7, starttag = ?8, laenge = ?9,
                         von = ?10, bis = ?11
        where id = ?12`
    ).bind(konf.titel, konf.beschreibung, konf.cleanies, konf.proPerson, konf.gesamt,
           JSON.stringify(konf.fuer || []), konf.rhythmus, konf.starttag, konf.laenge,
           fenster.von, fenster.bis, ev.id),
    ev.richtung === "verdienen"
      ? env.DB.prepare("update quests set name = ?1, points = ?2 where id = ?3")
          .bind(konf.titel, konf.cleanies, ev.ziel_id)
      : env.DB.prepare("update rewards set name = ?1, cost = ?2 where id = ?3")
          .bind(konf.titel, konf.cleanies, ev.ziel_id)
  ];
}

/** Ein Event beenden. Der Eintrag dahinter verschwindet aus den Listen; was
 *  daraus schon beantragt ist, wird normal zu Ende gebracht. */
export async function eventAus(env, vorschlag) {
  const ev = await env.DB.prepare("select * from events where id = ?1 and couple_id = ?2")
    .bind(vorschlag.target_id, vorschlag.couple_id).first();
  if (!ev) throw new Fehler("Dieses Event gibt es nicht", 404);

  return [
    env.DB.prepare("update events set aktiv = 0, beendet_am = datetime('now') where id = ?1").bind(ev.id),
    env.DB.prepare(`update ${ev.richtung === "verdienen" ? "quests" : "rewards"} set active = 0 where id = ?1`)
      .bind(ev.ziel_id)
  ];
}

/* ------------------------------------------------------------------ Zustand */

/** Alle Events eines Haushalts, aufbereitet für die App. */
export async function eventsVon(env, paar, ich) {
  const [evs, staende] = await Promise.all([
    env.DB.prepare(
      `select * from events where couple_id = ?1 and aktiv = 1 order by von, created_at`
    ).bind(paar).all(),
    eventStaende(env, paar, ich)
  ]);

  return evs.results.map((ev) => {
    const stand = staende[ev.id] || { gesamt: 0, meins: 0 };
    const dabei = darfMitmachen(ev, ich);
    const restIch = ev.pro_person === null ? null : Math.max(0, ev.pro_person - stand.meins);
    const restAlle = ev.gesamt === null ? null : Math.max(0, ev.gesamt - stand.gesamt);

    return {
      id: ev.id,
      richtung: ev.richtung,
      titel: ev.titel,
      beschreibung: ev.beschreibung,
      cleanies: ev.cleanies,
      pro_person: ev.pro_person,
      gesamt: ev.gesamt,
      fuer: fuerListe(ev),
      von: ev.von,
      bis: ev.bis,
      rhythmus: ev.rhythmus,
      starttag: ev.starttag,
      laenge: ev.laenge,
      ziel_id: ev.ziel_id,
      von_wem: ev.created_by,
      laeuft: laeuft(ev),
      genutzt: stand.gesamt,
      genutzt_ich: stand.meins,
      dabei,
      rest_ich: restIch,
      rest_alle: restAlle,
      // Wie oft ich jetzt noch könnte — das Kleinere von beiden Deckeln.
      offen_fuer_mich: !dabei ? 0
        : restIch === null && restAlle === null ? null
        : Math.min(restIch === null ? Infinity : restIch, restAlle === null ? Infinity : restAlle),
      naechste: naechsteTermine(ev)
    };
  });
}

export { Fehler as EventFehler };
