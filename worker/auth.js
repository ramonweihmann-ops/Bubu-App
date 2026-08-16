// Anmeldung über Google und die eigene Sitzung.
//
// Google wird nur einmal gebraucht — für die Anmeldung selbst. Danach führt
// diese Anwendung eine eigene Sitzung, deshalb spielt Googles Sieben-Tage-Grenze
// im Testmodus für uns keine Rolle.

const SITZUNG = "hq_sitzung";
const STATUS = "hq_status";
const TAGE = 90;

export function keks(request, name) {
  const kopf = request.headers.get("Cookie") || "";
  for (const teil of kopf.split(";")) {
    const [k, ...rest] = teil.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

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

async function hash(text) {
  const roh = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(roh)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function zufall(bytes = 32) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]));
}

/** Liest die angemeldete Person aus dem Sitzungs-Cookie. Null, wenn niemand angemeldet ist. */
export async function angemeldet(request, env) {
  const roh = keks(request, SITZUNG);
  if (!roh) return null;
  const treffer = await env.DB.prepare(
    `select u.id, u.email, u.name, u.avatar_url, u.bild, m.couple_id
       from sessions s
       join users u on u.id = s.user_id
       left join members m on m.user_id = u.id
      where s.token_hash = ?1 and s.expires_at > datetime('now')`
  ).bind(await hash(roh)).first();
  return treffer || null;
}

export async function handleAuth(request, env, url) {
  if (url.pathname === "/api/auth/start") return start(request, env);
  if (url.pathname === "/api/auth/callback") return callback(request, env, url);
  if (url.pathname === "/api/auth/logout") return logout(request, env);
  return new Response("Nicht gefunden", { status: 404 });
}

function basis(env, request) {
  return env.BASIS_URL || new URL(request.url).origin;
}

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

async function callback(request, env, url) {
  const code = url.searchParams.get("code");
  const status = url.searchParams.get("state");
  const erwartet = keks(request, STATUS);

  if (!code) return fehlerseite("Google hat keinen Anmeldecode geschickt.");
  if (!status || status !== erwartet) return fehlerseite("Die Anmeldung passt nicht zu diesem Gerät. Bitte noch einmal versuchen.");

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
  if (!person || !person.sub) return fehlerseite("Die Antwort von Google war unvollständig.");

  // Ein selbst gewählter Name bleibt stehen — sonst käme bei jeder Anmeldung
  // wieder der aus dem Google-Konto zurück.
  await env.DB.prepare(
    `insert into users (id, email, name, avatar_url) values (?1, ?2, ?3, ?4)
     on conflict(id) do update set email = ?2, avatar_url = ?4,
       name = case when users.name_gesetzt = 1 then users.name else ?3 end`
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

async function logout(request, env) {
  const roh = keks(request, SITZUNG);
  if (roh) await env.DB.prepare("delete from sessions where token_hash = ?1").bind(await hash(roh)).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": setzeKeks(SITZUNG, "", 0) }
  });
}

/** Inhalt eines von Google frisch geholten ID-Tokens. Die Echtheit sichert die
 *  TLS-Verbindung zum Token-Endpunkt, über die es gerade kam. */
function jwtInhalt(token) {
  if (!token) return null;
  const teil = token.split(".")[1];
  if (!teil) return null;
  const roh = atob(teil.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(roh, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

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
