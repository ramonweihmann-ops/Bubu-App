// Die Schnittstelle. Alles, was Punkte bewegt, läuft hier durch.
//
// Die App schickt nur Absichten („ich habe X erledigt“). Ob daraus eine Buchung
// wird, entscheiden diese Prüfungen und die Regeln in der Datenbank — nicht das Handy.

import { angemeldet } from "./auth.js";
import { QUESTS, BELOHNUNGEN, ANFANGSBESTAND } from "./startdaten.js";

const json = (daten, status = 200) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

class Fehler extends Error {
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
}

const id = () => crypto.randomUUID();

export async function handleApi(request, env, url) {
  const pfad = url.pathname.replace(/^\/api\//, "");
  const ich = await angemeldet(request, env);

  if (pfad === "health") {
    // Zeigt nur, OB etwas hinterlegt ist — nie den Wert selbst.
    return json({
      ok: true,
      zeit: new Date().toISOString(),
      clientId: env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_ID.split("-")[0] + "-…" : null,
      clientSchluesselHinterlegt: Boolean(env.GOOGLE_CLIENT_SECRET)
    });
  }
  if (!ich) return json({ fehler: "Nicht angemeldet", angemeldet: false }, 401);

  const koerper = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const teile = pfad.split("/");

  try {
    if (pfad === "state") return json(await zustand(env, ich));
    if (pfad === "pair/create") return json(await paarAnlegen(env, ich));
    if (pfad === "pair/join") return json(await paarBeitreten(env, ich, koerper.code));
    if (pfad === "export") return json(await ausgabe(env, ich));

    if (!ich.couple_id) throw new Fehler("Noch kein Paar verbunden", 409);

    if (pfad === "claims") return json(await melden(env, ich, koerper));
    if (teile[0] === "claims" && teile[2] === "decide") return json(await meldungEntscheiden(env, ich, teile[1], koerper.status));

    if (pfad === "requests") return json(await antragStellen(env, ich, koerper));
    if (teile[0] === "requests" && teile[2] === "decide") return json(await antragEntscheiden(env, ich, teile[1], koerper.status));

    if (pfad === "transfers") return json(await uebertragen(env, ich, koerper));
    if (teile[0] === "transfers" && teile[2] === "decide") return json(await uebertragungEntscheiden(env, ich, teile[1], koerper.status));

    if (pfad === "proposals") return json(await vorschlagen(env, ich, koerper));
    if (teile[0] === "proposals" && teile[2] === "vote") return json(await abstimmen(env, ich, teile[1], koerper.antwort));

    return json({ fehler: "Unbekannter Endpunkt" }, 404);
  } catch (fehler) {
    const text = String(fehler.message || fehler);
    // Meldungen aus den Datenbankregeln durchreichen, technisches Beiwerk abschneiden.
    const sauber = text.includes("SQLITE_CONSTRAINT") || text.includes("D1_ERROR")
      ? (text.match(/(?:abort at \d+ in \[[^\]]*\]:\s*)?([^:]*(?:muss|kann|bereits|Zu wenig|besteht)[^:]*)/)?.[1] || "Das geht so nicht.").trim()
      : text;
    return json({ fehler: sauber }, fehler.status || 400);
  }
}

/* ------------------------------------------------------------------ Paar */

async function code6() {
  const zahl = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(zahl).padStart(6, "0");
}

async function paarAnlegen(env, ich) {
  if (ich.couple_id) throw new Fehler("Du bist bereits mit jemandem verbunden");

  const paar = id();
  const code = await code6();
  await env.DB.batch([
    env.DB.prepare("insert into couples (id, pair_code, pair_code_expires) values (?1, ?2, datetime('now', '+1 day'))").bind(paar, code),
    env.DB.prepare("insert into members (user_id, couple_id) values (?1, ?2)").bind(ich.id, paar),
    ...QUESTS.map((q) =>
      env.DB.prepare("insert into quests (id, couple_id, name, category, points) values (?1, ?2, ?3, ?4, ?5)")
        .bind(id(), paar, q.name, q.kategorie, q.punkte)),
    ...BELOHNUNGEN.map((b) =>
      env.DB.prepare("insert into rewards (id, couple_id, name, cost) values (?1, ?2, ?3, ?4)")
        .bind(id(), paar, b.name, b.kosten))
  ]);
  return { code };
}

async function paarBeitreten(env, ich, code) {
  if (!code || !/^\d{6}$/.test(String(code).trim())) throw new Fehler("Der Code besteht aus sechs Ziffern");
  const sauber = String(code).trim();

  const paar = await env.DB.prepare(
    `select id from couples where pair_code = ?1 and pair_code_expires > datetime('now')`
  ).bind(sauber).first();
  if (!paar) throw new Fehler("Dieser Code ist unbekannt oder abgelaufen");

  const anzahl = await env.DB.prepare("select count(*) as n from members where couple_id = ?1").bind(paar.id).first();
  if (anzahl.n >= 2) throw new Fehler("Dieses Paar ist bereits vollständig");

  if (ich.couple_id === paar.id) throw new Fehler("Das ist dein eigener Code — gib ihn deinem Partner");

  // Wer selbst ein leeres Paar angelegt hat, darf es beim Beitreten aufgeben.
  if (ich.couple_id) {
    const alt = await env.DB.prepare(
      `select (select count(*) from members where couple_id = ?1) as personen,
              (select count(*) from ledger  where couple_id = ?1) as buchungen`
    ).bind(ich.couple_id).first();
    if (alt.personen > 1 || alt.buchungen > 0) throw new Fehler("Du bist bereits mit jemandem verbunden");
    await env.DB.batch([
      env.DB.prepare("delete from members where user_id = ?1").bind(ich.id),
      env.DB.prepare("delete from couples where id = ?1").bind(ich.couple_id)
    ]);
  }

  await env.DB.batch([
    env.DB.prepare("insert into members (user_id, couple_id) values (?1, ?2)").bind(ich.id, paar.id),
    env.DB.prepare("update couples set pair_code = null, pair_code_expires = null where id = ?1").bind(paar.id)
  ]);

  await anfangsbestand(env, paar.id);
  return { ok: true };
}

/** Einmalige Übernahme der Punktestände aus der bisherigen Tabelle.
 *  Läuft nur, solange das Konto noch völlig leer ist. */
async function anfangsbestand(env, paarId) {
  const bisher = await env.DB.prepare("select count(*) as n from ledger where couple_id = ?1").bind(paarId).first();
  if (bisher.n > 0) return;

  const personen = await env.DB.prepare(
    "select u.id, u.email from members m join users u on u.id = m.user_id where m.couple_id = ?1"
  ).bind(paarId).all();

  const buchungen = personen.results
    .map((p) => ({ id: p.id, punkte: ANFANGSBESTAND[String(p.email).toLowerCase()] ?? ANFANGSBESTAND.standard ?? 0 }))
    .filter((b) => b.punkte > 0)
    .map((b) => env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type)
       values (?1, ?2, ?3, ?4, 'Anfangsbestand aus der Tabelle', 'start')`
    ).bind(id(), paarId, b.id, b.punkte));

  if (buchungen.length) await env.DB.batch(buchungen);
}

/* ------------------------------------------------------------------ Zustand */

async function zustand(env, ich) {
  if (!ich.couple_id) {
    const eigener = await env.DB.prepare(
      `select c.pair_code from couples c join members m on m.couple_id = c.id where m.user_id = ?1`
    ).bind(ich.id).first();
    return {
      angemeldet: true,
      verbunden: false,
      ich: { id: ich.id, name: ich.name, avatar: ich.avatar_url },
      code: eigener?.pair_code || null
    };
  }

  const paar = ich.couple_id;
  const [personen, staende, quests, belohnungen, meldungen, antraege, uebertragungen, vorschlaege, stimmen, verlauf] =
    await Promise.all([
      env.DB.prepare(`select u.id, u.name, u.avatar_url, m.joined_at from members m join users u on u.id = m.user_id
                       where m.couple_id = ?1`).bind(paar).all(),
      env.DB.prepare("select member_id, points from balances where couple_id = ?1").bind(paar).all(),
      env.DB.prepare("select id, name, category, points from quests where couple_id = ?1 and active = 1 order by points desc, name").bind(paar).all(),
      env.DB.prepare("select id, name, cost from rewards where couple_id = ?1 and active = 1 order by cost, name").bind(paar).all(),
      env.DB.prepare(`select c.id, c.quest_id, c.claimed_by, c.quantity, c.points_each, c.note, c.created_at, q.name as quest
                        from claims c join quests q on q.id = c.quest_id
                       where c.couple_id = ?1 and c.status = 'offen' order by c.created_at desc`).bind(paar).all(),
      env.DB.prepare(`select r.id, r.requested_by, r.cost, r.wish_date, r.message, r.created_at, b.name as belohnung
                        from requests r join rewards b on b.id = r.reward_id
                       where r.couple_id = ?1 and r.status = 'offen' order by r.created_at desc`).bind(paar).all(),
      env.DB.prepare(`select id, from_member, to_member, amount, message, created_at
                        from transfers where couple_id = ?1 and status = 'offen' order by created_at desc`).bind(paar).all(),
      env.DB.prepare(`select p.*, q.name as quest_name, b.name as belohnung_name
                        from proposals p
                        left join quests q on q.id = p.target_id
                        left join rewards b on b.id = p.target_id
                       where p.couple_id = ?1 order by p.status = 'offen' desc, p.created_at desc limit 20`).bind(paar).all(),
      env.DB.prepare(`select v.* from proposal_votes v join proposals p on p.id = v.proposal_id
                       where p.couple_id = ?1`).bind(paar).all(),
      env.DB.prepare(`select id, member_id, delta, reason, created_at from ledger
                       where couple_id = ?1 order by created_at desc limit 40`).bind(paar).all()
    ]);

  const punkteVon = Object.fromEntries(staende.results.map((z) => [z.member_id, z.points]));
  const mit = personen.results.map((p) => ({
    id: p.id, name: p.name, avatar: p.avatar_url, seit: p.joined_at, punkte: punkteVon[p.id] || 0
  }));
  const mein = mit.find((p) => p.id === ich.id) || { id: ich.id, name: ich.name, punkte: 0 };
  const partner = mit.find((p) => p.id !== ich.id) || null;

  const stimmenJe = {};
  for (const s of stimmen.results) (stimmenJe[s.proposal_id] ||= {})[s.member_id] = !!s.answer;

  return {
    angemeldet: true,
    verbunden: !!partner,
    code: partner ? null : (await env.DB.prepare("select pair_code from couples where id = ?1").bind(paar).first())?.pair_code,
    ich: mein,
    partner,
    quests: quests.results,
    belohnungen: belohnungen.results,
    meldungen: meldungen.results,
    antraege: antraege.results,
    uebertragungen: uebertragungen.results,
    abstimmungen: vorschlaege.results.map((p) => ({
      id: p.id,
      art: p.kind,
      titel: p.kind === "quest_points" || p.kind === "delete_quest" ? p.quest_name
           : p.kind === "reward_cost" || p.kind === "delete_reward" ? p.belohnung_name
           : p.name,
      alt: p.old_value,
      neu: p.new_value,
      grund: p.reason,
      von: p.created_by,
      status: p.status,
      meine: stimmenJe[p.id]?.[ich.id],
      ihre: partner ? stimmenJe[p.id]?.[partner.id] : undefined
    })),
    verlauf: verlauf.results
  };
}

/* ------------------------------------------------------------------ Melden */

async function melden(env, ich, { questId, anzahl = 1, notiz = "" }) {
  const menge = Math.max(1, Math.min(50, Number(anzahl) || 1));
  const ergebnis = await env.DB.prepare(
    `insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, note)
     select ?1, ?2, q.id, ?3, ?4, q.points, ?5 from quests q where q.id = ?6 and q.couple_id = ?2`
  ).bind(id(), ich.couple_id, ich.id, menge, String(notiz).slice(0, 300), questId).run();

  if (!ergebnis.meta.changes) throw new Fehler("Diese Quest gibt es nicht");
  return { ok: true };
}

async function meldungEntscheiden(env, ich, meldungId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");

  const meldung = await env.DB.prepare(
    `select c.*, q.name as quest from claims c join quests q on q.id = c.quest_id
      where c.id = ?1 and c.couple_id = ?2`
  ).bind(meldungId, ich.couple_id).first();
  if (!meldung) throw new Fehler("Meldung nicht gefunden", 404);
  if (meldung.claimed_by === ich.id) throw new Fehler("Eine Meldung muss vom jeweils anderen bestätigt werden");

  // Entscheidung und Buchung in einem Zug: die zweite Anweisung sieht den neuen
  // Stand und bucht nur, wenn wirklich bestätigt wurde — und nur einmal.
  const [entschieden] = await env.DB.batch([
    env.DB.prepare(
      `update claims set status = ?1, decided_by = ?2, decided_at = datetime('now')
        where id = ?3 and couple_id = ?4 and status = 'offen' and claimed_by <> ?2`
    ).bind(status, ich.id, meldungId, ich.couple_id),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, c.couple_id, c.claimed_by, c.quantity * c.points_each,
              (select name from quests where id = c.quest_id), 'claim', c.id
         from claims c
        where c.id = ?2 and c.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = c.id)`
    ).bind(id(), meldungId)
  ]);
  if (!entschieden.meta.changes) throw new Fehler("Diese Meldung ist bereits entschieden");

  return { ok: true, punkte: meldung.quantity * meldung.points_each, quest: meldung.quest };
}

/* ------------------------------------------------------------------ Belohnungen */

async function antragStellen(env, ich, { rewardId, termin = "", nachricht = "" }) {
  const ergebnis = await env.DB.prepare(
    `insert into requests (id, couple_id, reward_id, requested_by, cost, wish_date, message)
     select ?1, ?2, b.id, ?3, b.cost, ?4, ?5 from rewards b where b.id = ?6 and b.couple_id = ?2`
  ).bind(id(), ich.couple_id, ich.id, String(termin).slice(0, 60), String(nachricht).slice(0, 300), rewardId).run();

  if (!ergebnis.meta.changes) throw new Fehler("Diese Belohnung gibt es nicht");
  return { ok: true };
}

async function antragEntscheiden(env, ich, antragId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");

  const antrag = await env.DB.prepare(
    `select r.*, b.name as belohnung from requests r join rewards b on b.id = r.reward_id
      where r.id = ?1 and r.couple_id = ?2`
  ).bind(antragId, ich.couple_id).first();
  if (!antrag) throw new Fehler("Antrag nicht gefunden", 404);
  if (antrag.requested_by === ich.id) throw new Fehler("Ein Antrag muss vom jeweils anderen entschieden werden");

  if (status === "bestaetigt") {
    const stand = await env.DB.prepare(
      "select coalesce(sum(delta), 0) as punkte from ledger where member_id = ?1"
    ).bind(antrag.requested_by).first();
    if (stand.punkte < antrag.cost) {
      throw new Fehler(`Zu wenig Punkte für diese Belohnung — ${stand.punkte} von ${antrag.cost}`);
    }
  }

  const [entschieden] = await env.DB.batch([
    env.DB.prepare(
      `update requests set status = ?1, decided_by = ?2, decided_at = datetime('now')
        where id = ?3 and couple_id = ?4 and status = 'offen' and requested_by <> ?2`
    ).bind(status, ich.id, antragId, ich.couple_id),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, r.couple_id, r.requested_by, -r.cost,
              (select name from rewards where id = r.reward_id), 'request', r.id
         from requests r
        where r.id = ?2 and r.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = r.id)`
    ).bind(id(), antragId)
  ]);
  if (!entschieden.meta.changes) throw new Fehler("Dieser Antrag ist bereits entschieden");

  return { ok: true, belohnung: antrag.belohnung, kosten: antrag.cost };
}

/* ------------------------------------------------------------------ Übertragen */

async function uebertragen(env, ich, { betrag, nachricht = "" }) {
  const menge = Math.floor(Number(betrag));
  if (!(menge > 0)) throw new Fehler("Der Betrag muss größer als null sein");

  const partner = await env.DB.prepare(
    "select user_id from members where couple_id = ?1 and user_id <> ?2"
  ).bind(ich.couple_id, ich.id).first();
  if (!partner) throw new Fehler("Noch kein Partner verbunden");

  const stand = await env.DB.prepare(
    "select coalesce(sum(delta), 0) as punkte from ledger where member_id = ?1"
  ).bind(ich.id).first();
  if (stand.punkte < menge) throw new Fehler(`Du hast nur ${stand.punkte} Punkte`);

  await env.DB.prepare(
    `insert into transfers (id, couple_id, from_member, to_member, amount, message)
     values (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(id(), ich.couple_id, ich.id, partner.user_id, menge, String(nachricht).slice(0, 300)).run();
  return { ok: true };
}

async function uebertragungEntscheiden(env, ich, uebertragungId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");

  const uebertragung = await env.DB.prepare(
    "select * from transfers where id = ?1 and couple_id = ?2"
  ).bind(uebertragungId, ich.couple_id).first();
  if (!uebertragung) throw new Fehler("Übertragung nicht gefunden", 404);
  if (uebertragung.to_member !== ich.id) throw new Fehler("Nur die empfangende Person kann annehmen oder ablehnen");

  if (status === "bestaetigt") {
    const stand = await env.DB.prepare(
      "select coalesce(sum(delta), 0) as punkte from ledger where member_id = ?1"
    ).bind(uebertragung.from_member).first();
    if (stand.punkte < uebertragung.amount) throw new Fehler("Die Punkte reichen inzwischen nicht mehr");
  }

  const [entschieden] = await env.DB.batch([
    env.DB.prepare(
      `update transfers set status = ?1, decided_at = datetime('now')
        where id = ?2 and couple_id = ?3 and to_member = ?4 and status = 'offen'`
    ).bind(status, uebertragungId, ich.couple_id, ich.id),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, t.couple_id, t.from_member, -t.amount, 'Punkte übertragen', 'transfer', t.id
         from transfers t where t.id = ?2 and t.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = t.id and delta < 0)`
    ).bind(id(), uebertragungId),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, t.couple_id, t.to_member, t.amount, 'Punkte erhalten', 'transfer', t.id
         from transfers t where t.id = ?2 and t.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = t.id and delta > 0)`
    ).bind(id(), uebertragungId)
  ]);
  if (!entschieden.meta.changes) throw new Fehler("Diese Übertragung ist bereits entschieden");
  return { ok: true };
}

/* ------------------------------------------------------------------ Abstimmungen */

async function vorschlagen(env, ich, { art, zielId, wert, name = "", kategorie = "Sonstiges", grund = "" }) {
  const arten = ["quest_points", "new_quest", "reward_cost", "new_reward", "delete_quest", "delete_reward"];
  if (!arten.includes(art)) throw new Fehler("Unbekannte Art von Vorschlag");

  const loeschen = art === "delete_quest" || art === "delete_reward";
  const neu = loeschen ? 0 : Math.floor(Number(wert));
  if (!loeschen && !(neu > 0)) throw new Fehler("Der Wert muss größer als null sein");

  let alt = null;
  if (loeschen) {
    const tabelle = art === "delete_quest" ? "quests" : "rewards";
    const spalte = art === "delete_quest" ? "points" : "cost";
    const ziel = await env.DB.prepare(
      `select ${spalte} as wert from ${tabelle} where id = ?1 and couple_id = ?2 and active = 1`
    ).bind(zielId, ich.couple_id).first();
    if (!ziel) throw new Fehler("Das gibt es nicht");
    alt = ziel.wert;

    const schonOffen = await env.DB.prepare(
      "select 1 as da from proposals where couple_id = ?1 and target_id = ?2 and status = 'offen'"
    ).bind(ich.couple_id, zielId).first();
    if (schonOffen) throw new Fehler("Dazu läuft schon eine Abstimmung");
  } else if (art === "quest_points" || art === "reward_cost") {
    const tabelle = art === "quest_points" ? "quests" : "rewards";
    const spalte = art === "quest_points" ? "points" : "cost";
    const ziel = await env.DB.prepare(
      `select ${spalte} as wert from ${tabelle} where id = ?1 and couple_id = ?2`
    ).bind(zielId, ich.couple_id).first();
    if (!ziel) throw new Fehler("Das gibt es nicht");
    if (ziel.wert === neu) throw new Fehler("Das ist der aktuelle Wert");
    alt = ziel.wert;
  } else if (!String(name).trim()) {
    throw new Fehler("Ein Name fehlt");
  }

  const vorschlag = id();
  await env.DB.batch([
    env.DB.prepare(
      `insert into proposals (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, created_by)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(vorschlag, ich.couple_id, art, zielId || null, alt, neu,
           String(name).slice(0, 120), String(kategorie).slice(0, 40), String(grund).slice(0, 300), ich.id),
    // Wer vorschlägt, stimmt zu. Es fehlt noch die andere Stimme.
    env.DB.prepare("insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, 1)")
      .bind(vorschlag, ich.id)
  ]);
  return { ok: true };
}

async function abstimmen(env, ich, vorschlagId, antwort) {
  const vorschlag = await env.DB.prepare(
    "select * from proposals where id = ?1 and couple_id = ?2"
  ).bind(vorschlagId, ich.couple_id).first();
  if (!vorschlag) throw new Fehler("Vorschlag nicht gefunden", 404);
  if (vorschlag.status !== "offen") throw new Fehler("Diese Abstimmung ist bereits entschieden");

  await env.DB.prepare(
    `insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, ?3)
     on conflict(proposal_id, member_id) do nothing`
  ).bind(vorschlagId, ich.id, antwort ? 1 : 0).run();

  const status = await auszaehlen(env, vorschlag);
  return { ok: true, status, wert: vorschlag.new_value };
}

/** Ein Nein beendet den Vorschlag sofort, der alte Wert gilt weiter.
 *  Übernommen wird er erst, wenn beide zugestimmt haben. */
async function auszaehlen(env, vorschlag) {
  const stimmen = await env.DB.prepare(
    "select answer from proposal_votes where proposal_id = ?1"
  ).bind(vorschlag.id).all();

  const nein = stimmen.results.some((s) => !s.answer);
  const ja = stimmen.results.filter((s) => s.answer).length;

  if (nein) {
    await env.DB.prepare(
      "update proposals set status = 'abgelehnt', decided_at = datetime('now') where id = ?1 and status = 'offen'"
    ).bind(vorschlag.id).run();
    return "abgelehnt";
  }
  if (ja < 2) return "offen";

  const anwenden = {
    quest_points: env.DB.prepare("update quests set points = ?1 where id = ?2 and couple_id = ?3")
      .bind(vorschlag.new_value, vorschlag.target_id, vorschlag.couple_id),
    reward_cost: env.DB.prepare("update rewards set cost = ?1 where id = ?2 and couple_id = ?3")
      .bind(vorschlag.new_value, vorschlag.target_id, vorschlag.couple_id),
    new_quest: env.DB.prepare("insert into quests (id, couple_id, name, category, points) values (?1, ?2, ?3, ?4, ?5)")
      .bind(id(), vorschlag.couple_id, vorschlag.name, vorschlag.category || "Sonstiges", vorschlag.new_value),
    new_reward: env.DB.prepare("insert into rewards (id, couple_id, name, cost) values (?1, ?2, ?3, ?4)")
      .bind(id(), vorschlag.couple_id, vorschlag.name, vorschlag.new_value),
    // Nie hart löschen: der Verlauf soll lesbar bleiben.
    delete_quest: env.DB.prepare("update quests set active = 0 where id = ?1 and couple_id = ?2")
      .bind(vorschlag.target_id, vorschlag.couple_id),
    delete_reward: env.DB.prepare("update rewards set active = 0 where id = ?1 and couple_id = ?2")
      .bind(vorschlag.target_id, vorschlag.couple_id)
  }[vorschlag.kind];

  await env.DB.batch([
    anwenden,
    env.DB.prepare("update proposals set status = 'bestaetigt', decided_at = datetime('now') where id = ?1 and status = 'offen'")
      .bind(vorschlag.id)
  ]);
  return "bestaetigt";
}

/* ------------------------------------------------------------------ Sicherung */

async function ausgabe(env, ich) {
  if (!ich.couple_id) return { hinweis: "Noch kein Paar verbunden" };
  const paar = ich.couple_id;
  const hole = (sql) => env.DB.prepare(sql).bind(paar).all().then((r) => r.results);
  return {
    erstellt: new Date().toISOString(),
    personen: await hole("select u.id, u.name, u.email from members m join users u on u.id = m.user_id where m.couple_id = ?1"),
    punktestaende: await hole("select member_id, points from balances where couple_id = ?1"),
    quests: await hole("select * from quests where couple_id = ?1"),
    belohnungen: await hole("select * from rewards where couple_id = ?1"),
    meldungen: await hole("select * from claims where couple_id = ?1"),
    antraege: await hole("select * from requests where couple_id = ?1"),
    uebertragungen: await hole("select * from transfers where couple_id = ?1"),
    abstimmungen: await hole("select * from proposals where couple_id = ?1"),
    buchungen: await hole("select * from ledger where couple_id = ?1 order by created_at")
  };
}
