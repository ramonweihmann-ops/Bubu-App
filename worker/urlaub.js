// Urlaubsmodus.
//
// Zwei Arten, die beide „Urlaub" heißen und trotzdem Verschiedenes tun:
//
// „person" — eine Person ist weg, der Haushalt läuft weiter. Die Fälligkeiten
//   bleiben stehen. Sie bekommt keine Mahnung, zahlt keine Gruppenstrafe mit
//   und wird bei der Vergabe übersprungen. Ihre Zähler laufen nicht weiter,
//   weil sie aus den Meldungen kommen — sie steht danach also nicht schlechter
//   da als vorher.
//
// „haushalt" — alle sind weg. Jede wiederkehrende Aufgabe rückt einmalig um
//   die Urlaubstage nach hinten. Der Rhythmus bleibt, nur der Startpunkt
//   wandert. Ein Rückstand wird dabei mitverschoben, nicht erlassen: sonst
//   wäre „kurz vor dem Urlaub nichts mehr machen" eine Strategie.
//
// Beides beschließt der Haushalt gemeinsam. Wirksam wird es erst, wenn die
// Abstimmung durch ist — angelegt wird der Urlaub deshalb hier, nicht schon
// beim Vorschlagen.

const id = () => crypto.randomUUID();

class Fehler extends Error {
  constructor(text, status = 400) { super(text); this.status = status; }
}

const HEUTE = () => new Date().toISOString().slice(0, 10);
const TAG = 86400000;
const alsZahl = (datum) => Date.parse(datum + "T12:00:00Z");

/** Tage von einem Datum bis zum anderen, den letzten Tag mitgezählt. */
export const tageZwischen = (von, bis) => Math.round((alsZahl(bis) - alsZahl(von)) / TAG) + 1;

/** Ein Datum als YYYY-MM-DD, oder null wenn es keines ist. */
export function datum(text) {
  const s = String(text || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T12:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Prüft einen Zeitraum, wie ihn ein Vorschlag mitbringt. */
export function zeitraum({ von, bis }) {
  const a = datum(von);
  const b = datum(bis);
  if (!a || !b) throw new Fehler("Der Zeitraum fehlt oder ist unvollständig");
  if (alsZahl(b) < alsZahl(a)) throw new Fehler("Das Ende liegt vor dem Anfang");
  if (alsZahl(b) < alsZahl(HEUTE())) throw new Fehler("Dieser Urlaub liegt schon hinter euch");
  const tage = tageZwischen(a, b);
  if (tage > 366) throw new Fehler("Länger als ein Jahr geht nicht");
  return { von: a, bis: b, tage };
}

/* ------------------------------------------------------------------ Nachschlagen */

/** Alle Urlaube, die heute laufen oder noch kommen. Vorbei ist vorbei. */
export async function urlaubeVon(env, paar) {
  const treffer = await env.DB.prepare(
    `select id, art, member_id, von, bis, grund, verschoben, created_by, created_at
       from urlaube
      where couple_id = ?1 and beendet_am is null and bis >= date('now')
      order by von`
  ).bind(paar).all();
  return treffer.results;
}

const laeuftHeute = (u) => u.von <= HEUTE() && u.bis >= HEUTE();

/** Wer heute weg ist — als Menge von Kennungen. Ein Haushaltsurlaub zählt
 *  hier nicht mit: der hält den ganzen Plan an, nicht einzelne Personen. */
export function abwesendeAus(urlaube) {
  return new Set(urlaube.filter((u) => u.art === "person" && laeuftHeute(u)).map((u) => u.member_id));
}

/** Ruht der ganze Plan gerade? */
export function haushaltPausiert(urlaube) {
  return urlaube.some((u) => u.art === "haushalt" && laeuftHeute(u));
}

/** Beides in einem Zug — die meisten Aufrufer brauchen genau das. */
export async function urlaubsLage(env, paar) {
  const urlaube = await urlaubeVon(env, paar);
  return { urlaube, abwesend: abwesendeAus(urlaube), pausiert: haushaltPausiert(urlaube) };
}

/* ------------------------------------------------------------------ Anlegen */

/** Wird aus der Abstimmung heraus aufgerufen, sobald alle zugestimmt haben.
 *  Gibt die Anweisungen zurück, damit sie in derselben Transaktion laufen wie
 *  das Schließen der Abstimmung — entweder beides oder nichts. */
export async function urlaubAnlegen(env, vorschlag, anhang) {
  const { von, bis } = zeitraum(anhang);
  const haushalt = vorschlag.kind === "urlaub_haushalt";

  // Wird erst mitten im Urlaub abgestimmt, verschiebt nur noch, was übrig ist.
  // Sonst bekäme der Plan Tage geschenkt, die längst vorbei sind.
  const abHeute = von < HEUTE() ? HEUTE() : von;
  const tage = haushalt ? Math.max(0, tageZwischen(abHeute, bis)) : tageZwischen(von, bis);

  const anweisungen = [
    env.DB.prepare(
      `insert into urlaube (id, couple_id, art, member_id, von, bis, grund, verschoben, created_by)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(vorschlag.id, vorschlag.couple_id, haushalt ? "haushalt" : "person",
           haushalt ? null : (anhang.member_id || vorschlag.created_by),
           von, bis, vorschlag.reason || null, haushalt ? tage : null, vorschlag.created_by)
  ];

  if (haushalt && tage > 0) {
    // Jede Fälligkeit bekommt dieselben Tage dazu. Die Runden-Merker gehen mit:
    // sie zeigen auf das alte Datum und würden sonst eine neue Runde vortäuschen.
    anweisungen.push(env.DB.prepare(
      `update quests
          set faellig_am = date(faellig_am, '+' || ?1 || ' days'),
              vergabe_runde = case when vergabe_runde is null then null
                                   else date(vergabe_runde, '+' || ?1 || ' days') end,
              mahnung_runde = case when mahnung_runde is null then null
                                   else date(mahnung_runde, '+' || ?1 || ' days') end,
              strafe_runde  = case when strafe_runde is null then null
                                   else date(strafe_runde, '+' || ?1 || ' days') end
        where couple_id = ?2 and active = 1 and wiederkehrend = 1 and faellig_am is not null`
    ).bind(tage, vorschlag.couple_id));

    // Laufende Bewerbungen hängen an der alten Runde und müssen mitwandern.
    anweisungen.push(env.DB.prepare(
      `update bewerbungen set runde = date(runde, '+' || ?1 || ' days')
        where couple_id = ?2 and status = 'offen'`
    ).bind(tage, vorschlag.couple_id));
  }

  return { anweisungen, tage, von, bis, haushalt };
}

/* ------------------------------------------------------------------ Beenden */

/** Vorzeitig beenden braucht keine Abstimmung: früher zurück zu sein ist nie
 *  ein Vorteil. Die verschobenen Fälligkeiten bleiben, wo sie sind — sonst
 *  stünde nach der Heimkehr plötzlich alles auf einmal an. */
export async function urlaubBeenden(env, ich, urlaubId) {
  const u = await env.DB.prepare(
    "select * from urlaube where id = ?1 and couple_id = ?2 and beendet_am is null"
  ).bind(urlaubId, ich.couple_id).first();
  if (!u) throw new Fehler("Diesen Urlaub gibt es nicht", 404);
  if (u.bis < HEUTE()) throw new Fehler("Dieser Urlaub ist schon vorbei");

  const verwaltet = await env.DB.prepare(
    "select 1 as da from members where couple_id = ?1 and user_id = ?2 and rolle = 'verwalter'"
  ).bind(ich.couple_id, ich.id).first();

  const darf = u.art === "person"
    ? u.member_id === ich.id
    : (u.created_by === ich.id || !!verwaltet);
  if (!darf) {
    throw new Fehler(u.art === "person"
      ? "Beenden kann nur, wessen Urlaub es ist"
      : "Das kann nur, wer ihn vorgeschlagen hat oder den Haushalt verwaltet");
  }

  await env.DB.prepare("update urlaube set beendet_am = datetime('now') where id = ?1")
    .bind(urlaubId).run();
  return { ok: true, art: u.art };
}

export { Fehler as UrlaubFehler };
