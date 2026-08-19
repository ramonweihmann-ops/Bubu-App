// Rückfragen und der Weg einer Belohnung nach der Zusage.
//
// Zwei Dinge, die vorher fehlten:
//
// 1. Auf eine Meldung oder einen Antrag gab es nur Ja oder Nein. Passt bloß der
//    Termin nicht, ist beides falsch. Die Rückfrage lässt den Antrag offen und
//    hängt eine Frage daran; wer ihn gestellt hat, antwortet und schickt erneut.
//
// 2. Eine zugesagte Belohnung ist noch keine erhaltene. Wer sie beantragt hat,
//    bestätigt den Empfang. Blieb sie aus, verliert die Person, die zugesagt
//    hat, denselben Betrag — rückholbar, wenn sie binnen drei Tagen doch noch
//    kommt und der Empfänger das bestätigt.

import { melde, meldeAlle, ereignisseWeg } from "./melden.js";

const id = () => crypto.randomUUID();
const vorname = (n) => String(n || "").split(" ")[0];

/** Wie lange nach der Strafe eine Belohnung noch nachgeholt werden kann. */
export const NACHHOLTAGE = 3;

class Fehler extends Error {
  constructor(text, status = 400) { super(text); this.status = status; }
}

const TABELLEN = {
  claims: { tabelle: "claims", steller: "claimed_by", was: "Meldung" },
  requests: { tabelle: "requests", steller: "requested_by", was: "Antrag" }
};

/* ------------------------------------------------------------------ Rückfrage */

/** Eine Frage statt einer Entscheidung. Der Antrag bleibt offen. */
export async function rueckfrageStellen(env, ich, bereich, satzId, { text = "", termin = "" }) {
  const b = TABELLEN[bereich];
  if (!b) throw new Fehler("Unbekannter Bereich", 404);

  const satz = await env.DB.prepare(
    `select * from ${b.tabelle} where id = ?1 and couple_id = ?2`
  ).bind(satzId, ich.couple_id).first();
  if (!satz) throw new Fehler(`${b.was} nicht gefunden`, 404);
  if (satz.status !== "offen") throw new Fehler(`Dieser ${b.was} ist bereits entschieden`);
  if (satz[b.steller] === ich.id) throw new Fehler("Zu deinem eigenen Antrag kannst du nichts nachfragen");

  const frage = String(text).trim().slice(0, 300);
  const vorschlag = String(termin).trim().slice(0, 60);
  if (frage.length < 3 && !vorschlag) throw new Fehler("Schreib kurz dazu, worum es geht");

  await env.DB.prepare(
    bereich === "requests"
      ? `update requests set rueckfrage = ?1, rueckfrage_von = ?2, rueckfrage_am = datetime('now'),
                             vorschlag_datum = ?3 where id = ?4`
      : `update claims set rueckfrage = ?1, rueckfrage_von = ?2, rueckfrage_am = datetime('now') where id = ?4`
  ).bind(frage || "Passt der Termin auch anders?", ich.id, vorschlag || null, satzId).run();

  await melde(env, ich.couple_id, satz[b.steller], {
    art: "info", quelle: satzId,
    titel: `${vorname(ich.name)} hat eine Rückfrage`,
    text: vorschlag ? `Vorschlag: ${vorschlag}${frage ? ` — „${frage}“` : ""}` : frage
  });
  return { ok: true };
}

/** Antworten heißt: nachbessern und erneut schicken. */
export async function rueckfrageBeantworten(env, ich, bereich, satzId, { termin = "", nachricht = "" }) {
  const b = TABELLEN[bereich];
  if (!b) throw new Fehler("Unbekannter Bereich", 404);

  const satz = await env.DB.prepare(
    `select * from ${b.tabelle} where id = ?1 and couple_id = ?2`
  ).bind(satzId, ich.couple_id).first();
  if (!satz) throw new Fehler(`${b.was} nicht gefunden`, 404);
  if (satz.status !== "offen") throw new Fehler(`Dieser ${b.was} ist bereits entschieden`);
  if (satz[b.steller] !== ich.id) throw new Fehler("Antworten kann nur, wer den Antrag gestellt hat");
  if (!satz.rueckfrage) throw new Fehler("Dazu steht keine Rückfrage offen");

  const antwort = String(nachricht).trim().slice(0, 300);

  if (bereich === "requests") {
    const neuerTermin = String(termin).trim().slice(0, 60);
    await env.DB.prepare(
      `update requests set wish_date = ?1, message = ?2,
                           rueckfrage = null, rueckfrage_von = null, rueckfrage_am = null,
                           vorschlag_datum = null
        where id = ?3`
    ).bind(neuerTermin || satz.wish_date, antwort || satz.message, satzId).run();
  } else {
    await env.DB.prepare(
      `update claims set note = ?1, rueckfrage = null, rueckfrage_von = null, rueckfrage_am = null
        where id = ?2`
    ).bind(antwort || satz.note, satzId).run();
  }

  await meldeAlle(env, ich.couple_id, ich.id, {
    art: "info", quelle: satzId,
    titel: `${vorname(ich.name)} hat geantwortet`,
    text: bereich === "requests" && termin ? `Neuer Terminwunsch: ${termin}` : (antwort || "Der Antrag steht wieder zur Entscheidung.")
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ Nachbessern und Zurückziehen */

/** Was noch niemand entschieden hat, gehört noch der Person, die es abgeschickt
 *  hat. Sie darf den Hinweis nachschärfen — für die Übertragung ist das die
 *  Nachricht, für einen Antrag zusätzlich der Wunschtermin.
 *
 *  Der Wert bleibt unberührt: er ist beim Absenden eingefroren, und daran soll
 *  auch ein zweiter Gedanke nichts ändern. */
export async function anfrageAendern(env, ich, bereich, satzId, { nachricht = "", termin } = {}) {
  const { satz, b } = await meineOffeneAnfrage(env, ich, bereich, satzId);

  const text = String(nachricht).trim().slice(0, 300);
  const neuerTermin = termin === undefined ? undefined : String(termin).trim().slice(0, 60);
  if (!text && neuerTermin === undefined) throw new Fehler("Schreib etwas dazu, sonst ändert sich nichts");

  if (bereich === "claims") {
    await env.DB.prepare("update claims set note = ?1 where id = ?2").bind(text, satzId).run();
  } else if (bereich === "requests") {
    await env.DB.prepare("update requests set message = ?1, wish_date = ?2 where id = ?3")
      .bind(text, neuerTermin === undefined ? satz.wish_date : neuerTermin, satzId).run();
  } else {
    await env.DB.prepare("update transfers set message = ?1 where id = ?2").bind(text, satzId).run();
  }

  // Eine Ergänzung ist keine neue Anfrage. Sie ersetzt die alte Nachricht,
  // damit beim Empfänger nicht zweimal dasselbe steht.
  await ereignisseWeg(env, satzId);
  await meldeAlle(env, ich.couple_id, ich.id, {
    art: "info", quelle: satzId,
    titel: `${vorname(ich.name)} hat etwas ergänzt`,
    text: [b.was, text, neuerTermin ? `Wunsch: ${neuerTermin}` : ""].filter(Boolean).join(" · ")
  });
  return { ok: true, nachricht: text, termin: neuerTermin === undefined ? satz.wish_date : neuerTermin };
}

/** Zurückziehen heißt: es war nie da. Deshalb geht auch die Nachricht beim
 *  Empfänger mit — und es kommt keine neue hinterher, die vom Rückzug erzählt. */
export async function anfrageZuruecknehmen(env, ich, bereich, satzId) {
  const { b } = await meineOffeneAnfrage(env, ich, bereich, satzId);

  await env.DB.batch([
    env.DB.prepare(`delete from ${b.tabelle} where id = ?1 and couple_id = ?2 and status = 'offen'`)
      .bind(satzId, ich.couple_id),
    env.DB.prepare("delete from ereignisse where quelle_id = ?1").bind(satzId)
  ]);
  return { ok: true, zurueckgezogen: b.was };
}

/** Der gemeinsame Türsteher: gibt es das, ist es noch offen, und ist es meins? */
async function meineOffeneAnfrage(env, ich, bereich, satzId) {
  const b = NACHBESSERBAR[bereich];
  if (!b) throw new Fehler("Unbekannter Bereich", 404);

  const satz = await env.DB.prepare(
    `select * from ${b.tabelle} where id = ?1 and couple_id = ?2`
  ).bind(satzId, ich.couple_id).first();
  if (!satz) throw new Fehler(`${b.was} nicht gefunden`, 404);
  if (satz.status !== "offen") throw new Fehler(`${b.was} ist bereits entschieden — daran lässt sich nichts mehr ändern`);
  if (satz[b.steller] !== ich.id) throw new Fehler(`Das kann nur, wer ${b.wen} abgeschickt hat`);
  return { satz, b };
}

const NACHBESSERBAR = {
  claims: { tabelle: "claims", steller: "claimed_by", was: "Die Meldung", wen: "die Meldung" },
  requests: { tabelle: "requests", steller: "requested_by", was: "Der Antrag", wen: "den Antrag" },
  transfers: { tabelle: "transfers", steller: "from_member", was: "Die Übertragung", wen: "die Übertragung" }
};

/* ------------------------------------------------------------------ Belohnung */

/** Alles, was nach der Zusage noch offen ist — für beide Seiten sichtbar. */
export async function offeneBelohnungen(env, paar) {
  const treffer = await env.DB.prepare(
    `select r.id, r.reward_id, r.requested_by, r.decided_by, r.cost, r.wish_date, r.message,
            r.erfuellt, r.erfuellt_am, r.strafe_am, r.nachhol_von, r.nachhol_am, r.decided_at,
            b.name as belohnung,
            cast(julianday('now') - julianday(r.strafe_am) as real) as seit_strafe
       from requests r join rewards b on b.id = r.reward_id
      where r.couple_id = ?1 and r.status = 'bestaetigt'
        and r.erfuellt in ('offen', 'nicht_erhalten', 'nachgeholt')
      order by r.decided_at desc`
  ).bind(paar).all();

  return treffer.results.map((r) => ({
    ...r,
    nachholbar: r.strafe_am ? (r.seit_strafe ?? 99) <= NACHHOLTAGE : false
  }));
}

async function holeAntrag(env, ich, antragId) {
  const antrag = await env.DB.prepare(
    `select r.*, b.name as belohnung from requests r join rewards b on b.id = r.reward_id
      where r.id = ?1 and r.couple_id = ?2`
  ).bind(antragId, ich.couple_id).first();
  if (!antrag) throw new Fehler("Antrag nicht gefunden", 404);
  if (antrag.status !== "bestaetigt") throw new Fehler("Dieser Antrag ist nicht genehmigt");
  return antrag;
}

/**
 * Der Empfänger sagt, ob die Belohnung tatsächlich kam.
 *
 * Kam sie nicht, verliert die Person, die zugesagt hat, denselben Betrag. Das
 * ist kein Rückgängigmachen der Einlösung: der Empfänger hat bezahlt und nichts
 * bekommen, deshalb steht die Strafe auf der anderen Seite.
 */
export async function belohnungEmpfang(env, ich, antragId, erhalten) {
  const antrag = await holeAntrag(env, ich, antragId);
  if (antrag.requested_by !== ich.id) throw new Fehler("Nur wer sie eingelöst hat, kann den Empfang bestätigen");
  if (antrag.erfuellt === "erhalten") throw new Fehler("Das ist schon bestätigt");

  if (erhalten) {
    // Auch nach einer Strafe: „doch bekommen“ holt sie zurück.
    const zurueck = antrag.strafe_am && antrag.decided_by
      ? [env.DB.prepare(
          `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
           select ?1, ?2, ?3, ?4, ?5, 'nachholung', ?6
            where not exists (select 1 from ledger where source_id = ?6)`
        ).bind(id(), ich.couple_id, antrag.decided_by, antrag.cost,
               `Nachgeholt: ${antrag.belohnung}`, `nachhol:${antrag.id}`)]
      : [];

    await env.DB.batch([
      env.DB.prepare("update requests set erfuellt = 'erhalten', erfuellt_am = datetime('now') where id = ?1")
        .bind(antragId),
      ...zurueck
    ]);

    if (antrag.decided_by) {
      await melde(env, ich.couple_id, antrag.decided_by, antrag.strafe_am
        ? { art: "bestaetigt", titel: `${vorname(ich.name)} hat es doch bekommen`,
            text: `${antrag.belohnung} — die ${antrag.cost} Cleanies sind wieder da.`, punkte: antrag.cost }
        : { art: "bestaetigt", titel: `${vorname(ich.name)} hat bestätigt`,
            text: `${antrag.belohnung} ist angekommen.` });
    }
    return { ok: true, status: "erhalten" };
  }

  if (antrag.erfuellt === "nicht_erhalten") throw new Fehler("Das steht bereits so");
  if (!antrag.decided_by) throw new Fehler("Zu diesem Antrag ist niemand hinterlegt");

  await env.DB.batch([
    env.DB.prepare(
      "update requests set erfuellt = 'nicht_erhalten', strafe_am = datetime('now') where id = ?1"
    ).bind(antragId),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, ?2, ?3, ?4, ?5, 'strafe', ?6
        where not exists (select 1 from ledger where source_id = ?6)`
    ).bind(id(), ich.couple_id, antrag.decided_by, -antrag.cost,
           `Nicht eingelöst: ${antrag.belohnung}`, `strafe:${antrag.id}`)
  ]);

  await melde(env, ich.couple_id, antrag.decided_by, {
    art: "abgelehnt",
    titel: `${antrag.belohnung} kam nicht an`,
    text: `${antrag.cost} Cleanies ab. Du hast ${NACHHOLTAGE} Tage, es nachzuholen.`,
    punkte: -antrag.cost
  });
  return { ok: true, status: "nicht_erhalten" };
}

/** „Doch gemacht" — gilt erst, wenn der Empfänger es bestätigt. */
export async function belohnungNachholen(env, ich, antragId) {
  const antrag = await holeAntrag(env, ich, antragId);
  if (antrag.decided_by !== ich.id) throw new Fehler("Das kann nur, wer die Belohnung zugesagt hat");
  if (antrag.erfuellt !== "nicht_erhalten") throw new Fehler("Dazu steht keine Strafe offen");

  const verstrichen = await env.DB.prepare(
    "select cast(julianday('now') - julianday(?1) as real) as tage"
  ).bind(antrag.strafe_am).first();
  if ((verstrichen?.tage ?? 99) > NACHHOLTAGE) {
    throw new Fehler(`Die ${NACHHOLTAGE} Tage sind vorbei — das lässt sich nicht mehr zurückholen`);
  }

  await env.DB.prepare(
    "update requests set erfuellt = 'nachgeholt', nachhol_von = ?1, nachhol_am = datetime('now') where id = ?2"
  ).bind(ich.id, antragId).run();

  await melde(env, ich.couple_id, antrag.requested_by, {
    art: "info",
    titel: `${vorname(ich.name)} hat nachgeholt`,
    text: `${antrag.belohnung} — stimmt das? Dann sind die Cleanies wieder da.`
  });
  return { ok: true };
}

/** Der Empfänger entscheidet über die Nachholung. */
export async function nachholEntscheiden(env, ich, antragId, ja) {
  const antrag = await holeAntrag(env, ich, antragId);
  if (antrag.requested_by !== ich.id) throw new Fehler("Das bestätigt, wer die Belohnung eingelöst hat");
  if (antrag.erfuellt !== "nachgeholt") throw new Fehler("Dazu steht keine Nachholung offen");

  if (!ja) {
    await env.DB.prepare(
      "update requests set erfuellt = 'nicht_erhalten', nachhol_von = null, nachhol_am = null where id = ?1"
    ).bind(antragId).run();
    await melde(env, ich.couple_id, antrag.nachhol_von, {
      art: "abgelehnt",
      titel: `${vorname(ich.name)} sagt: kam nicht`,
      text: `${antrag.belohnung} — die Cleanies bleiben ab.`
    });
    return { ok: true, status: "nicht_erhalten" };
  }

  return belohnungEmpfang(env, ich, antragId, true);
}

export { Fehler as RueckmeldungFehler };
