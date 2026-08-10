var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/auth.js
var SITZUNG = "hq_sitzung";
var STATUS = "hq_status";
var TAGE = 90;
function keks(request, name) {
  const kopf = request.headers.get("Cookie") || "";
  for (const teil of kopf.split(";")) {
    const [k, ...rest] = teil.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
__name(keks, "keks");
function setzeKeks(name, wert, sekunden) {
  const teile = [
    `${name}=${encodeURIComponent(wert)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${sekunden}`
  ];
  return teile.join("; ");
}
__name(setzeKeks, "setzeKeks");
async function hash(text) {
  const roh = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(roh)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hash, "hash");
function zufall(bytes = 32) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]);
}
__name(zufall, "zufall");
async function angemeldet(request, env) {
  const roh = keks(request, SITZUNG);
  if (!roh) return null;
  const treffer = await env.DB.prepare(
    `select u.id, u.email, u.name, u.avatar_url, m.couple_id
       from sessions s
       join users u on u.id = s.user_id
       left join members m on m.user_id = u.id
      where s.token_hash = ?1 and s.expires_at > datetime('now')`
  ).bind(await hash(roh)).first();
  return treffer || null;
}
__name(angemeldet, "angemeldet");
async function handleAuth(request, env, url) {
  if (url.pathname === "/api/auth/start") return start(request, env);
  if (url.pathname === "/api/auth/callback") return callback(request, env, url);
  if (url.pathname === "/api/auth/logout") return logout(request, env);
  return new Response("Nicht gefunden", { status: 404 });
}
__name(handleAuth, "handleAuth");
function basis(env, request) {
  return env.BASIS_URL || new URL(request.url).origin;
}
__name(basis, "basis");
function start(request, env) {
  const status = zufall(16);
  const ziel = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  ziel.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  ziel.searchParams.set("redirect_uri", `${basis(env, request)}/api/auth/callback`);
  ziel.searchParams.set("response_type", "code");
  ziel.searchParams.set("scope", "openid email profile");
  ziel.searchParams.set("state", status);
  ziel.searchParams.set("prompt", "select_account");
  return new Response(null, {
    status: 302,
    headers: {
      Location: ziel.toString(),
      "Set-Cookie": setzeKeks(STATUS, status, 600)
    }
  });
}
__name(start, "start");
async function callback(request, env, url) {
  const code = url.searchParams.get("code");
  const status = url.searchParams.get("state");
  const erwartet = keks(request, STATUS);
  if (!code) return fehlerseite("Google hat keinen Anmeldecode geschickt.");
  if (!status || status !== erwartet) return fehlerseite("Die Anmeldung passt nicht zu diesem Ger\xE4t. Bitte noch einmal versuchen.");
  const antwort = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${basis(env, request)}/api/auth/callback`,
      grant_type: "authorization_code"
    })
  });
  if (!antwort.ok) {
    const text = await antwort.text();
    return fehlerseite("Google hat die Anmeldung abgelehnt.", text.slice(0, 300));
  }
  const daten = await antwort.json();
  const person = jwtInhalt(daten.id_token);
  if (!person || !person.sub) return fehlerseite("Die Antwort von Google war unvollst\xE4ndig.");
  await env.DB.prepare(
    `insert into users (id, email, name, avatar_url) values (?1, ?2, ?3, ?4)
     on conflict(id) do update set email = ?2, name = ?3, avatar_url = ?4`
  ).bind(person.sub, person.email || "", person.name || person.email || "Unbekannt", person.picture || null).run();
  const token = zufall(32);
  await env.DB.prepare(
    `insert into sessions (token_hash, user_id, expires_at)
     values (?1, ?2, datetime('now', '+${TAGE} days'))`
  ).bind(await hash(token), person.sub).run();
  return new Response(null, {
    status: 302,
    headers: [
      ["Location", "/app/"],
      ["Set-Cookie", setzeKeks(SITZUNG, token, TAGE * 86400)],
      ["Set-Cookie", setzeKeks(STATUS, "", 0)]
    ]
  });
}
__name(callback, "callback");
async function logout(request, env) {
  const roh = keks(request, SITZUNG);
  if (roh) await env.DB.prepare("delete from sessions where token_hash = ?1").bind(await hash(roh)).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": setzeKeks(SITZUNG, "", 0) }
  });
}
__name(logout, "logout");
function jwtInhalt(token) {
  if (!token) return null;
  const teil = token.split(".")[1];
  if (!teil) return null;
  const roh = atob(teil.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(roh, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
__name(jwtInhalt, "jwtInhalt");
function fehlerseite(text, detail = "") {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Anmeldung fehlgeschlagen</title>
<style>body{margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;
gap:14px;padding:32px;text-align:center;font-family:system-ui,sans-serif;background:#fff;color:#152c4f}
h1{font-size:22px;margin:0}p{color:#55688a;max-width:34ch;margin:0;line-height:1.5}
a{margin-top:10px;background:#ec0f06;color:#fff;text-decoration:none;padding:13px 20px;border-radius:14px;font-weight:700}
code{font-size:11px;color:#8899b3;word-break:break-all;max-width:40ch}</style></head><body>
<h1>Anmeldung fehlgeschlagen</h1><p>${text}</p>${detail ? `<code>${detail}</code>` : ""}
<a href="/app/">Noch einmal versuchen</a></body></html>`;
  return new Response(html, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(fehlerseite, "fehlerseite");

// worker/startdaten.js
var QUESTS = [
  { name: "Staubsaugen ganze Wohnung", kategorie: "Wohnen", punkte: 10 },
  { name: "Staub wischen alle R\xE4ume", kategorie: "Wohnen", punkte: 1 },
  { name: "1 gr. Fenster putzen (beide Seiten)", kategorie: "Fenster", punkte: 10 },
  { name: "1 kl. Fenster putzen (beide Seiten)", kategorie: "Fenster", punkte: 4 },
  { name: "1 gro\xDFen Raum Boden wischen", kategorie: "Wohnen", punkte: 3 },
  { name: "K\xFCche reinigen nach Kochen", kategorie: "K\xFCche", punkte: 3 },
  { name: "Dunstabzugshaube reinigen", kategorie: "K\xFCche", punkte: 4 },
  { name: "Backofen reinigen + Blech + Rost", kategorie: "K\xFCche", punkte: 5 },
  { name: "Fliesenspiegel K\xFCche reinigen", kategorie: "K\xFCche", punkte: 3 },
  { name: "K\xFChlschrank sauber machen + enteisen", kategorie: "K\xFCche", punkte: 5 },
  { name: "Sp\xFClmaschine ausr\xE4umen", kategorie: "K\xFCche", punkte: 2 },
  { name: "Bad reinigen", kategorie: "Bad", punkte: 4 },
  { name: "G\xE4ste-WC reinigen", kategorie: "Bad", punkte: 3 },
  { name: "W\xE4sche aufh\xE4ngen + zusammenlegen", kategorie: "Wohnen", punkte: 2 },
  { name: "Betten abziehen / frisch beziehen", kategorie: "Wohnen", punkte: 3 },
  { name: "Aufr\xE4umen Wohnzimmer / B\xFCro", kategorie: "Wohnen", punkte: 3 },
  { name: "Tisch wischen", kategorie: "Wohnen", punkte: 1 },
  { name: "1 Monitor reinigen", kategorie: "Wohnen", punkte: 1 },
  { name: "Papierm\xFCll entsorgen", kategorie: "Sonstiges", punkte: 1 },
  { name: "Restm\xFCll entsorgen", kategorie: "Sonstiges", punkte: 1 },
  { name: "Altglas entsorgen (5 Flaschen = 1 Pkt)", kategorie: "Sonstiges", punkte: 1 },
  { name: "Arzttermin machen + hingehen", kategorie: "Sonstiges", punkte: 6 }
];
var ANFANGSBESTAND = {
  "ramon.weihmann@googlemail.com": 10,
  standard: 88
};
var BELOHNUNGEN = [
  { name: "Veto-Ausnahmeantrag", kosten: 15 },
  { name: "Freizeitaktivit\xE4t bestimmen", kosten: 15 },
  { name: "Massage eine Region", kosten: 3 },
  { name: "Eincremen komplett", kosten: 4 },
  { name: "Gua Sha Gesicht", kosten: 4 },
  { name: "Zopf flechten", kosten: 4 },
  { name: "Film / Serie aussuchen", kosten: 3 },
  { name: "Lieferdienst bestimmen", kosten: 2 },
  { name: "Brote schmieren abgeben", kosten: 4 },
  { name: "B", kosten: 8 },
  { name: "L", kosten: 8 }
];

// worker/api.js
var json = /* @__PURE__ */ __name((daten, status = 200) => new Response(JSON.stringify(daten), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
}), "json");
var Fehler = class extends Error {
  static {
    __name(this, "Fehler");
  }
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
};
var id = /* @__PURE__ */ __name(() => crypto.randomUUID(), "id");
async function handleApi(request, env, url) {
  const pfad = url.pathname.replace(/^\/api\//, "");
  const ich = await angemeldet(request, env);
  if (pfad === "health") return json({ ok: true, zeit: (/* @__PURE__ */ new Date()).toISOString() });
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
    const sauber = text.includes("SQLITE_CONSTRAINT") || text.includes("D1_ERROR") ? (text.match(/(?:abort at \d+ in \[[^\]]*\]:\s*)?([^:]*(?:muss|kann|bereits|Zu wenig|besteht)[^:]*)/)?.[1] || "Das geht so nicht.").trim() : text;
    return json({ fehler: sauber }, fehler.status || 400);
  }
}
__name(handleApi, "handleApi");
async function code6() {
  const zahl = crypto.getRandomValues(new Uint32Array(1))[0] % 1e6;
  return String(zahl).padStart(6, "0");
}
__name(code6, "code6");
async function paarAnlegen(env, ich) {
  if (ich.couple_id) throw new Fehler("Du bist bereits mit jemandem verbunden");
  const paar = id();
  const code = await code6();
  await env.DB.batch([
    env.DB.prepare("insert into couples (id, pair_code, pair_code_expires) values (?1, ?2, datetime('now', '+1 day'))").bind(paar, code),
    env.DB.prepare("insert into members (user_id, couple_id) values (?1, ?2)").bind(ich.id, paar),
    ...QUESTS.map((q) => env.DB.prepare("insert into quests (id, couple_id, name, category, points) values (?1, ?2, ?3, ?4, ?5)").bind(id(), paar, q.name, q.kategorie, q.punkte)),
    ...BELOHNUNGEN.map((b) => env.DB.prepare("insert into rewards (id, couple_id, name, cost) values (?1, ?2, ?3, ?4)").bind(id(), paar, b.name, b.kosten))
  ]);
  return { code };
}
__name(paarAnlegen, "paarAnlegen");
async function paarBeitreten(env, ich, code) {
  if (!code || !/^\d{6}$/.test(String(code).trim())) throw new Fehler("Der Code besteht aus sechs Ziffern");
  const sauber = String(code).trim();
  const paar = await env.DB.prepare(
    `select id from couples where pair_code = ?1 and pair_code_expires > datetime('now')`
  ).bind(sauber).first();
  if (!paar) throw new Fehler("Dieser Code ist unbekannt oder abgelaufen");
  const anzahl = await env.DB.prepare("select count(*) as n from members where couple_id = ?1").bind(paar.id).first();
  if (anzahl.n >= 2) throw new Fehler("Dieses Paar ist bereits vollst\xE4ndig");
  if (ich.couple_id === paar.id) throw new Fehler("Das ist dein eigener Code \u2014 gib ihn deinem Partner");
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
__name(paarBeitreten, "paarBeitreten");
async function anfangsbestand(env, paarId) {
  const bisher = await env.DB.prepare("select count(*) as n from ledger where couple_id = ?1").bind(paarId).first();
  if (bisher.n > 0) return;
  const personen = await env.DB.prepare(
    "select u.id, u.email from members m join users u on u.id = m.user_id where m.couple_id = ?1"
  ).bind(paarId).all();
  const buchungen = personen.results.map((p) => ({ id: p.id, punkte: ANFANGSBESTAND[String(p.email).toLowerCase()] ?? ANFANGSBESTAND.standard ?? 0 })).filter((b) => b.punkte > 0).map((b) => env.DB.prepare(
    `insert into ledger (id, couple_id, member_id, delta, reason, source_type)
       values (?1, ?2, ?3, ?4, 'Anfangsbestand aus der Tabelle', 'start')`
  ).bind(id(), paarId, b.id, b.punkte));
  if (buchungen.length) await env.DB.batch(buchungen);
}
__name(anfangsbestand, "anfangsbestand");
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
  const [personen, staende, quests, belohnungen, meldungen, antraege, uebertragungen, vorschlaege, stimmen, verlauf] = await Promise.all([
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
    id: p.id,
    name: p.name,
    avatar: p.avatar_url,
    seit: p.joined_at,
    punkte: punkteVon[p.id] || 0
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
      titel: p.kind === "quest_points" ? p.quest_name : p.kind === "reward_cost" ? p.belohnung_name : p.name,
      alt: p.old_value,
      neu: p.new_value,
      grund: p.reason,
      von: p.created_by,
      status: p.status,
      meine: stimmenJe[p.id]?.[ich.id],
      ihre: partner ? stimmenJe[p.id]?.[partner.id] : void 0
    })),
    verlauf: verlauf.results
  };
}
__name(zustand, "zustand");
async function melden(env, ich, { questId, anzahl = 1, notiz = "" }) {
  const menge = Math.max(1, Math.min(50, Number(anzahl) || 1));
  const ergebnis = await env.DB.prepare(
    `insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, note)
     select ?1, ?2, q.id, ?3, ?4, q.points, ?5 from quests q where q.id = ?6 and q.couple_id = ?2`
  ).bind(id(), ich.couple_id, ich.id, menge, String(notiz).slice(0, 300), questId).run();
  if (!ergebnis.meta.changes) throw new Fehler("Diese Quest gibt es nicht");
  return { ok: true };
}
__name(melden, "melden");
async function meldungEntscheiden(env, ich, meldungId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");
  const meldung = await env.DB.prepare(
    `select c.*, q.name as quest from claims c join quests q on q.id = c.quest_id
      where c.id = ?1 and c.couple_id = ?2`
  ).bind(meldungId, ich.couple_id).first();
  if (!meldung) throw new Fehler("Meldung nicht gefunden", 404);
  if (meldung.claimed_by === ich.id) throw new Fehler("Eine Meldung muss vom jeweils anderen best\xE4tigt werden");
  const ergebnis = await env.DB.prepare(
    `update claims set status = ?1, decided_by = ?2, decided_at = datetime('now')
      where id = ?3 and couple_id = ?4 and status = 'offen'`
  ).bind(status, ich.id, meldungId, ich.couple_id).run();
  if (!ergebnis.meta.changes) throw new Fehler("Diese Meldung ist bereits entschieden");
  return { ok: true, punkte: meldung.quantity * meldung.points_each, quest: meldung.quest };
}
__name(meldungEntscheiden, "meldungEntscheiden");
async function antragStellen(env, ich, { rewardId, termin = "", nachricht = "" }) {
  const ergebnis = await env.DB.prepare(
    `insert into requests (id, couple_id, reward_id, requested_by, cost, wish_date, message)
     select ?1, ?2, b.id, ?3, b.cost, ?4, ?5 from rewards b where b.id = ?6 and b.couple_id = ?2`
  ).bind(id(), ich.couple_id, ich.id, String(termin).slice(0, 60), String(nachricht).slice(0, 300), rewardId).run();
  if (!ergebnis.meta.changes) throw new Fehler("Diese Belohnung gibt es nicht");
  return { ok: true };
}
__name(antragStellen, "antragStellen");
async function antragEntscheiden(env, ich, antragId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");
  const antrag = await env.DB.prepare(
    `select r.*, b.name as belohnung from requests r join rewards b on b.id = r.reward_id
      where r.id = ?1 and r.couple_id = ?2`
  ).bind(antragId, ich.couple_id).first();
  if (!antrag) throw new Fehler("Antrag nicht gefunden", 404);
  if (antrag.requested_by === ich.id) throw new Fehler("Ein Antrag muss vom jeweils anderen entschieden werden");
  const ergebnis = await env.DB.prepare(
    `update requests set status = ?1, decided_by = ?2, decided_at = datetime('now')
      where id = ?3 and couple_id = ?4 and status = 'offen'`
  ).bind(status, ich.id, antragId, ich.couple_id).run();
  if (!ergebnis.meta.changes) throw new Fehler("Dieser Antrag ist bereits entschieden");
  return { ok: true, belohnung: antrag.belohnung, kosten: antrag.cost };
}
__name(antragEntscheiden, "antragEntscheiden");
async function uebertragen(env, ich, { betrag, nachricht = "" }) {
  const menge = Math.floor(Number(betrag));
  if (!(menge > 0)) throw new Fehler("Der Betrag muss gr\xF6\xDFer als null sein");
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
__name(uebertragen, "uebertragen");
async function uebertragungEntscheiden(env, ich, uebertragungId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");
  const ergebnis = await env.DB.prepare(
    `update transfers set status = ?1, decided_at = datetime('now')
      where id = ?2 and couple_id = ?3 and to_member = ?4 and status = 'offen'`
  ).bind(status, uebertragungId, ich.couple_id, ich.id).run();
  if (!ergebnis.meta.changes) throw new Fehler("Nur die empfangende Person kann annehmen oder ablehnen");
  return { ok: true };
}
__name(uebertragungEntscheiden, "uebertragungEntscheiden");
async function vorschlagen(env, ich, { art, zielId, wert, name = "", kategorie = "Sonstiges", grund = "" }) {
  const arten = ["quest_points", "new_quest", "reward_cost", "new_reward"];
  if (!arten.includes(art)) throw new Fehler("Unbekannte Art von Vorschlag");
  const neu = Math.floor(Number(wert));
  if (!(neu > 0)) throw new Fehler("Der Wert muss gr\xF6\xDFer als null sein");
  let alt = null;
  if (art === "quest_points" || art === "reward_cost") {
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
    ).bind(
      vorschlag,
      ich.couple_id,
      art,
      zielId || null,
      alt,
      neu,
      String(name).slice(0, 120),
      String(kategorie).slice(0, 40),
      String(grund).slice(0, 300),
      ich.id
    ),
    // Wer vorschlägt, stimmt zu. Es fehlt noch die andere Stimme.
    env.DB.prepare("insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, 1)").bind(vorschlag, ich.id)
  ]);
  return { ok: true };
}
__name(vorschlagen, "vorschlagen");
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
  const danach = await env.DB.prepare("select status, new_value from proposals where id = ?1").bind(vorschlagId).first();
  return { ok: true, status: danach.status, wert: danach.new_value };
}
__name(abstimmen, "abstimmen");
async function ausgabe(env, ich) {
  if (!ich.couple_id) return { hinweis: "Noch kein Paar verbunden" };
  const paar = ich.couple_id;
  const hole = /* @__PURE__ */ __name((sql) => env.DB.prepare(sql).bind(paar).all().then((r) => r.results), "hole");
  return {
    erstellt: (/* @__PURE__ */ new Date()).toISOString(),
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
__name(ausgabe, "ausgabe");

// worker/index.js
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) {
      return handleAuth(request, env, url);
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Oobq0r/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Oobq0r/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
