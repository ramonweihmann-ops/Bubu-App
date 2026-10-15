// Bilder für Quests und Belohnungen.
//
// Symbole, Farben und Hintergründe sind Ordnung, keine Cleanies — wie die
// Räume. Deshalb ändert sie jeder im Haushalt sofort, ohne Abstimmung.
//
// Ein Symbol ist ein Emoji oder ein eigenes Bild, ein Hintergrund ein Motiv
// aus der App oder ein eigenes Foto. Eigene Bilder kommen auf dem Handy schon
// klein gerechnet an und liegen in der Tabelle bilder; in Quest und
// Belohnung steht nur „foto:<id>". Ausgeliefert werden sie einzeln und lange
// zwischengespeichert — eine neue Wahl bekommt eine neue Kennung.

class Fehler extends Error {
  constructor(text, status = 400) { super(text); this.status = status; }
}

export const FARBEN = ["blau", "gruen", "rot", "gelb", "lila", "grau"];
export const MOTIVE = ["kino", "essen", "wellness", "ausflug", "zocken", "suess", "ruhe", "shoppen", "natur"];

/** Grenzen nach dem, was das Handy schickt: ein Symbol auf 160 Pixel, ein
 *  Foto auf 640 Pixel — beides als JPEG. Darüber stimmt etwas nicht. */
const GRENZE = { symbol: 60 * 1024, foto: 300 * 1024 };
const BILD = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** Ein Emoji, kein Text: kurz, ohne Buchstaben und ohne Zeichen, die im
 *  HTML etwas bedeuten. */
function emojiPruefen(wert) {
  const s = String(wert ?? "").trim();
  if (!s || s.length > 16 || /[A-Za-z<>"'&\\]/.test(s) || ![...s].some((z) => z.codePointAt(0) > 0x2000)) {
    throw new Fehler("Das ist kein Symbol");
  }
  return s;
}

async function bildAblegen(env, ich, daten, art) {
  const wert = String(daten ?? "");
  if (!BILD.test(wert)) throw new Fehler("Das Bild versteht die App nicht — JPEG, PNG oder WebP");
  const roh = Math.floor((wert.length - wert.indexOf(",") - 1) * 3 / 4);
  if (roh > GRENZE[art]) throw new Fehler(`Das Bild ist zu groß: ${Math.round(roh / 1024)} KB`);
  const bildId = crypto.randomUUID();
  await env.DB.prepare("insert into bilder (id, couple_id, daten, groesse, created_by) values (?1, ?2, ?3, ?4, ?5)")
    .bind(bildId, ich.couple_id, wert, roh, ich.id).run();
  return `foto:${bildId}`;
}

/** Ein schon abgelegtes Bild darf wiederkommen — etwa wenn nur die Farbe
 *  wechselt. Fremde Kennungen nicht. */
async function eigenesFoto(env, ich, wert) {
  const bildId = String(wert).slice(5);
  const da = await env.DB.prepare("select 1 from bilder where id = ?1 and couple_id = ?2")
    .bind(bildId, ich.couple_id).first();
  if (!da) throw new Fehler("Dieses Bild gibt es nicht");
  return wert;
}

/** Was vorher da war und jetzt nicht mehr gebraucht wird, kommt weg. */
async function altesWeg(env, ich, alt, neu) {
  if (!alt || alt === neu || !String(alt).startsWith("foto:")) return;
  await env.DB.prepare("delete from bilder where id = ?1 and couple_id = ?2")
    .bind(String(alt).slice(5), ich.couple_id).run();
}

async function symbolLesen(env, ich, icon) {
  if (icon === null || icon === "") return null;
  if (String(icon).startsWith("data:")) return bildAblegen(env, ich, icon, "symbol");
  if (String(icon).startsWith("foto:")) return eigenesFoto(env, ich, icon);
  return emojiPruefen(icon);
}

/** Symbol und Farbe einer Quest. Nur, was mitkommt, ändert sich. */
export async function questBild(env, ich, questId, daten) {
  const q = await env.DB.prepare("select icon, farbe from quests where id = ?1 and couple_id = ?2 and active = 1")
    .bind(questId, ich.couple_id).first();
  if (!q) throw new Fehler("Diese Quest gibt es nicht", 404);

  const icon = "icon" in daten ? await symbolLesen(env, ich, daten.icon) : q.icon;
  let farbe = q.farbe;
  if ("farbe" in daten) {
    if (daten.farbe !== null && !FARBEN.includes(daten.farbe)) throw new Fehler("Diese Farbe gibt es nicht");
    farbe = daten.farbe;
  }
  await env.DB.prepare("update quests set icon = ?1, farbe = ?2 where id = ?3 and couple_id = ?4")
    .bind(icon, farbe, questId, ich.couple_id).run();
  await altesWeg(env, ich, q.icon, icon);
  return { ok: true, icon, farbe };
}

/** Symbol und Hintergrund einer Belohnung. „ohne" heißt: bewusst kein Bild. */
export async function belohnungBild(env, ich, belohnungId, daten) {
  const b = await env.DB.prepare("select icon, bild from rewards where id = ?1 and couple_id = ?2 and active = 1")
    .bind(belohnungId, ich.couple_id).first();
  if (!b) throw new Fehler("Diese Belohnung gibt es nicht", 404);

  const icon = "icon" in daten ? await symbolLesen(env, ich, daten.icon) : b.icon;
  let bild = b.bild;
  if ("bild" in daten) {
    const w = daten.bild;
    if (w === null || w === "") bild = null;
    else if (w === "ohne") bild = "ohne";
    else if (String(w).startsWith("motiv:")) {
      if (!MOTIVE.includes(String(w).slice(6))) throw new Fehler("Dieses Motiv gibt es nicht");
      bild = w;
    } else if (String(w).startsWith("data:")) bild = await bildAblegen(env, ich, w, "foto");
    else if (String(w).startsWith("foto:")) bild = await eigenesFoto(env, ich, w);
    else throw new Fehler("Dieses Bild versteht die App nicht");
  }
  await env.DB.prepare("update rewards set icon = ?1, bild = ?2 where id = ?3 and couple_id = ?4")
    .bind(icon, bild, belohnungId, ich.couple_id).run();
  await altesWeg(env, ich, b.icon, icon);
  await altesWeg(env, ich, b.bild, bild);
  return { ok: true, icon, bild };
}

/** Ein eigenes Bild ausliefern — nur an den eigenen Haushalt. Die Kennung
 *  ändert sich mit jedem neuen Bild, deshalb darf der Browser es behalten. */
export async function bildAusliefern(env, ich, bildId) {
  const z = await env.DB.prepare("select daten from bilder where id = ?1 and couple_id = ?2")
    .bind(bildId, ich.couple_id).first();
  if (!z) return new Response("Nicht gefunden", { status: 404 });
  const [kopf, inhalt] = z.daten.split(",");
  const typ = kopf.slice(5, kopf.indexOf(";"));
  const bytes = Uint8Array.from(atob(inhalt), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: { "Content-Type": typ, "Cache-Control": "private, max-age=31536000, immutable" }
  });
}
