// Der Familienmodus: Kinder machen mit, auch ohne eigenes Handy.
//
// Ein Kind ist ein Mitglied ohne Google-Konto — Vorname und Tier, keine E-Mail,
// kein Foto. Drei Regeln halten das Ganze fair:
//
//   1. Kinder bestätigen nie Kinder. Bei einem Kind ist immer ein Erwachsener
//      das zweite Paar Augen. Die Eltern bestätigen dürfen Kinder mit eigenem
//      Gerät dagegen schon — sonst fände ein Alleinerziehender niemanden.
//   2. Abstimmen dürfen Erwachsene und Jugendliche, nicht die kleinen Kinder.
//   3. Ist ein Erwachsener mit kleinen Kindern allein, zählt seine eigene
//      Meldung sofort: es gibt niemanden, der sie bestätigen könnte.
//
// Anlegen, ändern, auszahlen: das machen die Erwachsenen.

const id = () => crypto.randomUUID();

class Fehler extends Error {
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
}

export const STUFEN = ["ohne", "geraet", "gross"];
export const FUER = ["alle", "kinder", "erwachsene"];
export const ANSICHTEN = ["glas", "weg"];

/** Die Wünsche, mit denen eine Familie anfängt. Ändern lassen sie sich danach
 *  wie jede Belohnung — über eine Abstimmung der Erwachsenen. */
const START_WUENSCHE = [
  { name: "30 Minuten Tablet", kosten: 8, icon: "📱", bild: "motiv:zocken" },
  { name: "Lieblingsessen aussuchen", kosten: 12, icon: "🍝", bild: "motiv:essen" },
  { name: "Eis essen gehen", kosten: 20, icon: "🍦", bild: "motiv:suess" },
  { name: "Übernachtungsbesuch", kosten: 30, icon: "🏕️", bild: "motiv:ausflug" },
  { name: "Kinobesuch", kosten: 40, icon: "🎬", bild: "motiv:kino" }
];

/** Die Aufgaben, mit denen Kinder anfangen. Die Quests von vorher sind Sachen
 *  für Erwachsene — welche davon auch Kinder sehen, stellen die Eltern hinter
 *  dem Stift ein („Für wen“). */
const START_AUFGABEN = [
  { name: "Tisch decken", punkte: 2, icon: "🍽️", farbe: "gelb" },
  { name: "Zimmer aufräumen", punkte: 3, icon: "🧸", farbe: "rot" },
  { name: "Schuhe wegräumen", punkte: 1, icon: "👟", farbe: "blau" },
  { name: "Blumen gießen", punkte: 1, icon: "🪴", farbe: "gruen" },
  { name: "Müll rausbringen", punkte: 1, icon: "🗑️", farbe: "grau" }
];

/** Kind ohne eigenes Konto: kein Google, die Eltern oder ein Code melden es an. */
export const istKindProfil = (m) => m?.stufe === "ohne" || m?.stufe === "geraet";
/** Jedes Kind, auch Jugendliche mit eigenem Google-Konto. */
export const istKind = (m) => !!m && Number(m.erwachsen) === 0;
export const istErwachsen = (m) => !!m && !istKind(m) && !m.stufe;

/** Wer abstimmt — als SQL-Bedingung auf members. */
export const STIMMRECHT = "(stufe is null or stufe = 'gross')";

export function mitgliedVon(env, paar, wer) {
  return env.DB.prepare(
    `select m.user_id as id, m.erwachsen, m.stufe, m.tier, m.ansicht, m.wunsch, m.taschengeld, u.name
       from members m join users u on u.id = m.user_id
      where m.couple_id = ?1 and m.user_id = ?2`
  ).bind(paar, wer).first();
}

export async function nurErwachsene(env, ich) {
  const m = await mitgliedVon(env, ich.couple_id, ich.id);
  if (!istErwachsen(m)) throw new Fehler("Das machen die Erwachsenen", 403);
  return m;
}

async function kindVon(env, ich, kindId) {
  const k = await mitgliedVon(env, ich.couple_id, kindId);
  if (!k || !istKind(k)) throw new Fehler("Dieses Kind gibt es nicht", 404);
  return k;
}

export async function stimmberechtigte(env, paar) {
  const z = await env.DB.prepare(`select count(*) as n from members where couple_id = ?1 and ${STIMMRECHT}`)
    .bind(paar).first();
  return z.n;
}

/** Darf `ich` über eine Meldung oder einen Antrag von `steller` entscheiden?
 *  Wer etwas selbst geschickt hat, prüft der Aufrufer — hier geht es um Kinder. */
export async function entscheidenPruefen(env, ich, steller) {
  const [s, e] = await Promise.all([mitgliedVon(env, ich.couple_id, steller), mitgliedVon(env, ich.couple_id, ich.id)]);
  if (istKind(s) && istKind(e)) throw new Fehler("Bei Kindern bestätigt immer ein Erwachsener", 403);
  if (e?.stufe === "ohne") throw new Fehler("Das machen die Erwachsenen", 403);
}

/** Kann außer dem Steller überhaupt jemand entscheiden? Nur wichtig für
 *  Erwachsene: Kinder legt immer ein Erwachsener an, der ist dann auch da.
 *  Wer ganz allein im Haushalt ist, wartet wie bisher auf die anderen. */
export async function zaehltSofort(env, paar, steller) {
  const s = await mitgliedVon(env, paar, steller);
  if (!istErwachsen(s)) return false;
  const z = await env.DB.prepare(
    `select count(*) as andere,
            coalesce(sum(case when coalesce(stufe, '') <> 'ohne' then 1 else 0 end), 0) as koennen
       from members where couple_id = ?1 and user_id <> ?2`
  ).bind(paar, steller).first();
  return z.andere > 0 && z.koennen === 0;
}

/** Die Kinderansicht auf dem Handy der Eltern: dieselbe Sitzung, aber die
 *  Absicht gehört dem Kind. Das geht nur für Kinder ohne eigenes Konto. */
export async function alsKind(env, ich, kindId) {
  await nurErwachsene(env, ich);
  const k = await kindVon(env, ich, kindId);
  if (!istKindProfil(k)) throw new Fehler("Jugendliche nutzen ihr eigenes Konto", 403);
  return { id: k.id, name: k.name, couple_id: ich.couple_id, erwachsen: 0, stufe: k.stufe };
}

/* ------------------------------------------------------------------ Anlegen und ändern */

const vornameSauber = (n) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 20);

/** Ein Tier oder ein anderes einzelnes Symbol — kein Text, kein HTML. */
function tierPruefen(tier) {
  const wert = String(tier ?? "").trim();
  if (!wert) return "🦊";
  if (wert.length > 16 || /[A-Za-z0-9<>"'&`]/.test(wert) || ![...wert].some((z) => z.codePointAt(0) > 0x2000)) {
    throw new Fehler("Das ist kein Tier");
  }
  return wert;
}

export async function kindAnlegen(env, ich, { name, tier, stufe = "ohne", taschengeld = false, einwilligung = false }) {
  await nurErwachsene(env, ich);
  const vor = vornameSauber(name);
  if (vor.length < 2) throw new Fehler("Der Vorname braucht mindestens zwei Zeichen");
  if (stufe === "gross") throw new Fehler("Jugendliche kommen mit eigenem Google-Konto über den Einladungscode");
  if (!["ohne", "geraet"].includes(stufe)) throw new Fehler("Unbekannte Stufe");
  if (einwilligung !== true) throw new Fehler("Ohne Einwilligung der Eltern geht es nicht");

  const kind = `kind-${id()}`;
  const paar = ich.couple_id;
  const schon = await env.DB.prepare("select count(*) as n from rewards where couple_id = ?1 and fuer = 'kinder' and active = 1")
    .bind(paar).first();
  const aufgaben = await env.DB.prepare("select count(*) as n from quests where couple_id = ?1 and fuer = 'kinder' and active = 1")
    .bind(paar).first();
  const zahl = await env.DB.prepare("select count(*) as n from members where couple_id = ?1").bind(paar).first();

  await env.DB.batch([
    env.DB.prepare("insert into users (id, email, name, name_gesetzt) values (?1, '', ?2, 1)").bind(kind, vor),
    env.DB.prepare(
      `insert into members (user_id, couple_id, rolle, erwachsen, stufe, tier, taschengeld, einwilligung_von, einwilligung_am)
       values (?1, ?2, 'mitglied', 0, ?3, ?4, ?5, ?6, datetime('now'))`
    ).bind(kind, paar, stufe, tierPruefen(tier), taschengeld ? 1 : 0, ich.id),
    // Ein Kind belegt einen Platz. Reicht die geplante Größe nicht, wächst sie mit —
    // sonst müsste man erst in den Einstellungen Plätze schaffen.
    env.DB.prepare(
      `update couples set groesse = max(groesse, ?1),
                          kinder = case when art = 'familie' then max(kinder, ?1 - erwachsene) else kinder end
        where id = ?2`
    ).bind(zahl.n + 1, paar),
    ...(schon.n ? [] : START_WUENSCHE.map((w) => env.DB.prepare(
      `insert into rewards (id, couple_id, name, cost, bestaetigen, fuer, icon, bild)
       values (?1, ?2, ?3, ?4, 0, 'kinder', ?5, ?6)`
    ).bind(id(), paar, w.name, w.kosten, w.icon, w.bild))),
    // Das erste Kind: die bisherigen Quests bleiben bei den Erwachsenen, und für
    // die Kinder gibt es eigene. Sonst stünde „Backofen reinigen“ im Sparglas.
    ...(aufgaben.n ? [] : [
      env.DB.prepare("update quests set fuer = 'erwachsene' where couple_id = ?1 and fuer = 'alle'").bind(paar),
      ...START_AUFGABEN.map((a) => env.DB.prepare(
        `insert into quests (id, couple_id, name, category, points, fuer, icon, farbe)
         values (?1, ?2, ?3, 'Sonstiges', ?4, 'kinder', ?5, ?6)`
      ).bind(id(), paar, a.name, a.punkte, a.icon, a.farbe))
    ])
  ]);
  return { ok: true, id: kind, stufe };
}

export async function kindAendern(env, ich, kindId, { name, tier, stufe, taschengeld }) {
  await nurErwachsene(env, ich);
  const k = await kindVon(env, ich, kindId);
  if (!istKindProfil(k)) throw new Fehler("Jugendliche ändern ihr Konto selbst");

  const schritte = [];
  if (name !== undefined) {
    const vor = vornameSauber(name);
    if (vor.length < 2) throw new Fehler("Der Vorname braucht mindestens zwei Zeichen");
    schritte.push(env.DB.prepare("update users set name = ?1 where id = ?2").bind(vor, k.id));
  }
  if (tier !== undefined) {
    schritte.push(env.DB.prepare("update members set tier = ?1 where user_id = ?2").bind(tierPruefen(tier), k.id));
  }
  if (taschengeld !== undefined) {
    schritte.push(env.DB.prepare("update members set taschengeld = ?1 where user_id = ?2").bind(taschengeld ? 1 : 0, k.id));
  }
  if (stufe !== undefined) {
    if (!["ohne", "geraet"].includes(stufe)) throw new Fehler("Unbekannte Stufe");
    schritte.push(env.DB.prepare("update members set stufe = ?1 where user_id = ?2").bind(stufe, k.id));
    // Ohne Gerät gibt es auch keine Sitzung mehr — das alte Gerät fliegt raus.
    if (stufe === "ohne") {
      schritte.push(env.DB.prepare("delete from sessions where user_id = ?1").bind(k.id));
      schritte.push(env.DB.prepare("delete from kindcodes where user_id = ?1").bind(k.id));
    }
  }
  if (schritte.length) await env.DB.batch(schritte);
  return { ok: true };
}

/** Löschen heißt: das Kind ist weg, mit allem, was es gebucht hat. Wo es bei
 *  den Eltern etwas bestätigt hat, bleibt die Entscheidung ohne Namen stehen. */
export async function kindLoeschen(env, ich, kindId) {
  await nurErwachsene(env, ich);
  const k = await kindVon(env, ich, kindId);
  if (!istKindProfil(k)) throw new Fehler("Jugendliche verlassen den Haushalt selbst");
  await env.DB.batch([
    env.DB.prepare("update claims set decided_by = null where decided_by = ?1").bind(k.id),
    env.DB.prepare("update requests set decided_by = null where decided_by = ?1").bind(k.id),
    env.DB.prepare("update requests set gutschrift_an = null where gutschrift_an = ?1").bind(k.id),
    env.DB.prepare("delete from users where id = ?1").bind(k.id),
    // Der Platz des Kindes geht mit — sonst stünde auf der Startseite
    // „Es fehlt noch jemand“ und lüde zum Einladen ein.
    env.DB.prepare(
      `update couples set groesse = max(1, groesse - 1),
                          kinder = case when art = 'familie' and kinder > 0 then kinder - 1 else kinder end
        where id = ?1`
    ).bind(ich.couple_id)
  ]);
  return { ok: true };
}

/* ------------------------------------------------------------------ Eigenes Gerät */

const ZEICHEN = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

async function hash(text) {
  const roh = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(roh)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Acht Zeichen ohne Verwechsler (kein 0/O, 1/I/L). Lang genug, dass niemand
 *  ihn in zehn Minuten errät — kurz genug, um ihn abzutippen. */
export async function kindCode(env, ich, kindId) {
  await nurErwachsene(env, ich);
  const k = await kindVon(env, ich, kindId);
  if (k.stufe !== "geraet") throw new Fehler(`Stell ${k.name} erst auf „Eigenes Gerät“`);

  const zufall = crypto.getRandomValues(new Uint8Array(8));
  const code = [...zufall].map((b) => ZEICHEN[b % ZEICHEN.length]).join("");
  await env.DB.batch([
    env.DB.prepare("delete from kindcodes where user_id = ?1 or expires_at <= datetime('now')").bind(k.id),
    env.DB.prepare(
      `insert into kindcodes (code_hash, user_id, couple_id, created_by, expires_at)
       values (?1, ?2, ?3, ?4, datetime('now', '+10 minutes'))`
    ).bind(await hash(code), k.id, ich.couple_id, ich.id)
  ]);
  return { ok: true, code: `${code.slice(0, 4)}-${code.slice(4)}`, minuten: 10 };
}

/** Der Code gegen eine Sitzung — ohne Google und ohne E-Mail. Er gilt nur einmal. */
export async function kindEinloesen(env, roh) {
  const code = String(roh ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) throw new Fehler("Der Code hat acht Zeichen");
  const h = await hash(code);
  const treffer = await env.DB.prepare(
    `select c.user_id, m.stufe from kindcodes c join members m on m.user_id = c.user_id
      where c.code_hash = ?1 and c.expires_at > datetime('now')`
  ).bind(h).first();
  await env.DB.prepare("delete from kindcodes where code_hash = ?1").bind(h).run();
  if (!treffer || treffer.stufe !== "geraet") throw new Fehler("Dieser Code ist unbekannt oder abgelaufen");
  return treffer.user_id;
}

export async function kindAbmelden(env, ich, kindId) {
  await nurErwachsene(env, ich);
  const k = await kindVon(env, ich, kindId);
  const weg = await env.DB.prepare("delete from sessions where user_id = ?1").bind(k.id).run();
  return { ok: true, geraete: weg.meta.changes };
}

/* ------------------------------------------------------------------ Wunsch, Ansicht, Für wen */

export async function wunschSetzen(env, kind, rewardId) {
  const b = await env.DB.prepare(
    "select id, name from rewards where id = ?1 and couple_id = ?2 and active = 1 and fuer in ('kinder','alle')"
  ).bind(rewardId, kind.couple_id).first();
  if (!b) throw new Fehler("Diesen Wunsch gibt es nicht");
  await env.DB.prepare("update members set wunsch = ?1 where user_id = ?2").bind(b.id, kind.id).run();
  return { ok: true, wunsch: b.id, name: b.name };
}

export async function ansichtSetzen(env, kind, ansicht) {
  if (!ANSICHTEN.includes(ansicht)) throw new Fehler("Diese Ansicht gibt es nicht");
  await env.DB.prepare("update members set ansicht = ?1 where user_id = ?2").bind(ansicht, kind.id).run();
  return { ok: true, ansicht };
}

/** Wer eine Quest oder Belohnung sieht. Das ist Ordnung wie ein Raum — die
 *  Erwachsenen ändern es sofort, ohne Abstimmung. */
export async function fuerSetzen(env, ich, tabelle, eintragId, fuer) {
  await nurErwachsene(env, ich);
  if (!FUER.includes(fuer)) throw new Fehler("Das gibt es nicht");
  const t = tabelle === "quests" ? "quests" : "rewards";
  const r = await env.DB.prepare(`update ${t} set fuer = ?1 where id = ?2 and couple_id = ?3 and active = 1`)
    .bind(fuer, eintragId, ich.couple_id).run();
  if (!r.meta.changes) throw new Fehler(t === "quests" ? "Diese Quest gibt es nicht" : "Diese Belohnung gibt es nicht", 404);
  return { ok: true, fuer };
}

/* ------------------------------------------------------------------ Taschengeld */

const euro = (cl, kurs) => (cl * kurs / 100).toFixed(2).replace(".", ",");

/** Das Geld geben die Eltern selbst. Die App bucht nur die Cleanies ab, damit
 *  der Stand stimmt — wie eine Einlösung. */
export async function auszahlen(env, ich, kindId, { cleanies }) {
  await nurErwachsene(env, ich);
  const k = await kindVon(env, ich, kindId);
  if (!k.taschengeld) throw new Fehler(`Für ${k.name} ist Taschengeld aus`);
  const n = Math.floor(Number(cleanies));
  if (!(n > 0)) throw new Fehler("Wie viele Cleanies?");

  const [stand, haus] = await Promise.all([
    env.DB.prepare("select coalesce(sum(delta), 0) as n from ledger where member_id = ?1").bind(k.id).first(),
    env.DB.prepare("select kurs from couples where id = ?1").bind(ich.couple_id).first()
  ]);
  if (stand.n < n) throw new Fehler(`${k.name} hat nur ${stand.n} Cleanies`);

  const betrag = euro(n, haus.kurs);
  await env.DB.prepare(
    `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
     values (?1, ?2, ?3, ?4, ?5, 'taschengeld', null)`
  ).bind(id(), ich.couple_id, k.id, -n, `Taschengeld ausgezahlt (${betrag} €)`).run();
  return { ok: true, euro: betrag, stand: stand.n - n };
}

/* ------------------------------------------------------------------ Eltern-PIN */

const pinHash = (paar, pin) => hash(`${paar}:${pin}`);

export async function pinSetzen(env, ich, { pin, alt }) {
  await nurErwachsene(env, ich);
  if (!/^\d{4}$/.test(String(pin ?? ""))) throw new Fehler("Die PIN hat vier Ziffern");
  const haus = await env.DB.prepare("select eltern_pin from couples where id = ?1").bind(ich.couple_id).first();
  if (haus.eltern_pin && haus.eltern_pin !== await pinHash(ich.couple_id, String(alt ?? ""))) {
    throw new Fehler("Die alte PIN stimmt nicht");
  }
  await env.DB.prepare("update couples set eltern_pin = ?1 where id = ?2")
    .bind(await pinHash(ich.couple_id, String(pin)), ich.couple_id).run();
  return { ok: true };
}

export async function pinPruefen(env, ich, { pin }) {
  await nurErwachsene(env, ich);
  const haus = await env.DB.prepare("select eltern_pin from couples where id = ?1").bind(ich.couple_id).first();
  if (!haus.eltern_pin) return { ok: true };
  if (haus.eltern_pin !== await pinHash(ich.couple_id, String(pin ?? ""))) throw new Fehler("Die PIN stimmt nicht");
  return { ok: true };
}

/* ------------------------------------------------------------------ Für den Zustand */

/** Was die Kinder heute schon geschafft haben — für die Haken in der
 *  Kinderansicht. „Heute“ ist der Tag dort, wo die Familie wohnt. */
export async function heuteGeschafft(env, paar, versatzRoh) {
  const versatz = Math.max(-840, Math.min(840, Number(versatzRoh) || 0));
  const schieben = `${versatz >= 0 ? "+" : ""}${versatz} minutes`;
  const zeilen = await env.DB.prepare(
    `select c.claimed_by as wer, c.quest_id as quest, count(*) as n
       from claims c join members m on m.user_id = c.claimed_by
      where c.couple_id = ?1 and c.status = 'bestaetigt' and m.erwachsen = 0
        and c.decided_at >= datetime('now', '-2 days')
        and date(c.decided_at, ?2) = date('now', ?2)
      group by c.claimed_by, c.quest_id`
  ).bind(paar, schieben).all();
  return zeilen.results;
}

export { Fehler as FamilienFehler };

/** Ein Mitglied mit eigenem Google-Konto als jugendlich führen — oder zurück
 *  als erwachsen. Sich selbst kann man so nicht einstufen. */
export async function jugendlichSetzen(env, ich, wer, ja) {
  await nurErwachsene(env, ich);
  if (wer === ich.id) throw new Fehler("Dich selbst stufst du nicht ein");
  const m = await mitgliedVon(env, ich.couple_id, wer);
  if (!m || istKindProfil(m)) throw new Fehler("Diese Person gibt es nicht", 404);
  await env.DB.prepare("update members set erwachsen = ?1, stufe = ?2 where user_id = ?3 and couple_id = ?4")
    .bind(ja ? 0 : 1, ja ? "gross" : null, wer, ich.couple_id).run();
  return { ok: true, jugendlich: ja };
}
