// Benachrichtigungen aufs Handy (Web Push).
//
// Ohne fremde Bibliothek: Der Versand nach RFC 8291 (Verschlüsselung) und
// RFC 8292 (VAPID) lässt sich mit den Bordmitteln des Browsers bauen.
//
// Das Schlüsselpaar erzeugt sich beim ersten Mal selbst und liegt danach in
// der Datenbank — es ist also nichts von Hand zu hinterlegen.

const enc = new TextEncoder();

const b64url = (puffer) =>
  btoa(String.fromCharCode(...new Uint8Array(puffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const vonB64url = (text) => {
  const roh = atob(String(text).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(roh, (c) => c.charCodeAt(0));
};

function zusammen(...teile) {
  const gesamt = teile.reduce((n, t) => n + t.length, 0);
  const aus = new Uint8Array(gesamt);
  let stelle = 0;
  for (const t of teile) { aus.set(t, stelle); stelle += t.length; }
  return aus;
}

async function hmac(schluessel, daten) {
  const k = await crypto.subtle.importKey("raw", schluessel, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, daten));
}

/* ---------------------------------------------------------------- VAPID */

/** Holt das Schlüsselpaar aus der Datenbank oder erzeugt es beim ersten Aufruf. */
export async function vapid(env) {
  const zeile = await env.DB.prepare("select wert from einstellungen where schluessel = 'vapid'").first();
  if (zeile) return JSON.parse(zeile.wert);

  const paar = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const daten = {
    oeffentlich: b64url(await crypto.subtle.exportKey("raw", paar.publicKey)),
    privat: await crypto.subtle.exportKey("jwk", paar.privateKey)
  };
  await env.DB.prepare(
    "insert into einstellungen (schluessel, wert) values ('vapid', ?1) on conflict(schluessel) do nothing"
  ).bind(JSON.stringify(daten)).run();

  const nachher = await env.DB.prepare("select wert from einstellungen where schluessel = 'vapid'").first();
  return JSON.parse(nachher.wert);
}

async function vapidKopf(env, endpunkt) {
  const schluessel = await vapid(env);
  const ziel = new URL(endpunkt);

  const kopf = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const inhalt = b64url(enc.encode(JSON.stringify({
    aud: ziel.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: `https://${ziel.hostname === "localhost" ? "haus-quest.com" : "haus-quest.com"}`
  })));

  const privat = await crypto.subtle.importKey(
    "jwk", schluessel.privat, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const signatur = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privat, enc.encode(`${kopf}.${inhalt}`)
  );

  return `vapid t=${kopf}.${inhalt}.${b64url(signatur)}, k=${schluessel.oeffentlich}`;
}

/* ---------------------------------------------------------------- Verschlüsselung */

/** Verschlüsselt den Text für genau diesen Empfänger (aes128gcm). */
async function verschluesseln(text, p256dh, auth) {
  const empfaenger = vonB64url(p256dh);
  const geheimnis = vonB64url(auth);

  const eigen = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const eigenRoh = new Uint8Array(await crypto.subtle.exportKey("raw", eigen.publicKey));
  const fremd = await crypto.subtle.importKey("raw", empfaenger, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const gemeinsam = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: fremd }, eigen.privateKey, 256));

  const prkSchluessel = await hmac(geheimnis, gemeinsam);
  const infoSchluessel = zusammen(enc.encode("WebPush: info\0"), empfaenger, eigenRoh, new Uint8Array([1]));
  const ikm = await hmac(prkSchluessel, infoSchluessel);

  const salz = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salz, ikm);

  const cek = (await hmac(prk, zusammen(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, zusammen(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const klartext = zusammen(enc.encode(text), new Uint8Array([2]));   // 2 = Ende, keine Füllung
  const schluessel = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const geheim = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 }, schluessel, klartext
  ));

  const groesse = new Uint8Array(4);
  new DataView(groesse.buffer).setUint32(0, 4096);
  return zusammen(salz, groesse, new Uint8Array([eigenRoh.length]), eigenRoh, geheim);
}

/* ---------------------------------------------------------------- Versand */

/**
 * Schickt eine Benachrichtigung an alle Geräte einer Person.
 * Abgemeldete Geräte werden dabei stillschweigend entfernt.
 */
export async function sendePush(env, benutzerId, nachricht) {
  const geraete = await env.DB.prepare(
    "select id, endpoint, p256dh, auth from push_subscriptions where user_id = ?1"
  ).bind(benutzerId).all();
  if (!geraete.results.length) return;

  const text = JSON.stringify(nachricht);

  await Promise.all(geraete.results.map(async (g) => {
    try {
      const koerper = await verschluesseln(text, g.p256dh, g.auth);
      const antwort = await fetch(g.endpoint, {
        method: "POST",
        headers: {
          Authorization: await vapidKopf(env, g.endpoint),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "86400",
          Urgency: "normal"
        },
        body: koerper
      });
      if (antwort.status === 404 || antwort.status === 410) {
        await env.DB.prepare("delete from push_subscriptions where id = ?1").bind(g.id).run();
      }
    } catch {
      // Ein stummes Handy darf keine Buchung verhindern.
    }
  }));
}
