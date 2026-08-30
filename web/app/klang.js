// Der Klang zum Jubel.
//
// Kein Ton liegt als Datei bei: alles entsteht im Browser aus Oszillatoren und
// Hüllkurven. Das sind ein paar hundert Zeichen statt ein paar hundert Kilobyte,
// es lädt nie nach, es klingt offline genauso — und es lässt sich mit den
// Cleanies-Phasen mitwachsen lassen, ohne für jede Stufe eine eigene Aufnahme
// zu brauchen.
//
// Was hier NICHT geht: der Ton einer Push-Benachrichtigung. Das `sound`-Feld
// der Web-Notifications-API steht zwar im Standard, wird aber von keinem
// Browser umgesetzt; auf Android kommt der Ton aus dem Benachrichtigungskanal,
// auf iOS aus dem System. Deshalb klingt hier nur, was bei offener App
// passiert — die Push bekommt stattdessen ihr eigenes Vibrationsmuster.

/* ------------------------------------------------------------------ Töne */

/** Die Halbtöne, die vorkommen. Alles bleibt in einer Pentatonik auf C:
 *  darin klingt jede Kombination gut, auch die zufällige. */
const N = {
  D3: 146.83, F3: 174.61, A3: 220.00, D4: 293.66, F4: 349.23, A4: 440.00,
  C5: 523.25, E5: 659.25, G5: 783.99,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.00, C7: 2093.00
};

/** Dieselbe Abfolge für alle Familien — so vergleicht die Hörprobe wirklich
 *  die Klangfarbe und nicht die Melodie. */
const FOLGEN = {
  leise: [["C6", 0, 1], ["E6", 0.09, 0.9]],
  mittel: [["C6", 0, 0.9], ["E6", 0.08, 0.9], ["G6", 0.16, 0.95], ["C7", 0.26, 1]],
  gross: [
    ["C6", 0, 0.8], ["E6", 0.07, 0.8], ["G6", 0.14, 0.85], ["C7", 0.21, 0.9],
    ["G6", 0.30, 0.7], ["A6", 0.37, 0.8], ["C7", 0.44, 0.95],
    // Der Schlussakkord: drei Töne auf einmal, etwas länger stehen gelassen.
    ["C6", 0.56, 0.8], ["E6", 0.56, 0.7], ["G6", 0.56, 0.7]
  ]
};

/** Zwei tiefe, kurze Töne. Eine Ablehnung wird ruhig gezeigt — sie soll nicht
 *  wie ein Fehler scheppern. */
const NEIN = [["A3", 0, 0.8], ["F3", 0.15, 0.7]];

const LAUT = { leise: 0.34, mittel: 0.46, gross: 0.6 };

/* ------------------------------------------------------------------ Familien */

/** Eine Stimme baut sich immer gleich auf: ein oder zwei Oszillatoren, eine
 *  Hüllkurve, fertig. Was die Familien unterscheidet, ist Wellenform, Abklingen
 *  und ob ein Oberton mitläuft. */
function stimme(k, ziel, { art, hz, ab, dauer, laut, anstieg = 0.004, filter = 0 }) {
  const o = k.createOscillator();
  const g = k.createGain();
  o.type = art;
  o.frequency.setValueAtTime(hz, ab);

  let kette = g;
  if (filter) {
    const f = k.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(filter, ab);
    g.connect(f);
    kette = f;
  }
  kette.connect(ziel);
  o.connect(g);

  g.gain.setValueAtTime(0.0001, ab);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, laut), ab + anstieg);
  g.gain.exponentialRampToValueAtTime(0.0001, ab + dauer);

  o.start(ab);
  o.stop(ab + dauer + 0.02);
  return o;
}

export const SAETZE = {
  glocke: {
    name: "Glocke",
    kurz: "Hell und klar, klingt lange nach. Ruhig, fast feierlich.",
    ton(k, ziel, hz, ab, laut) {
      stimme(k, ziel, { art: "sine", hz, ab, dauer: 1.1, laut: laut * 0.22 });
      // Der Oberton macht aus einem Piepsen eine Glocke. 2,76 ist das
      // Verhältnis, das echte Glocken haben.
      stimme(k, ziel, { art: "sine", hz: hz * 2.76, ab, dauer: 0.5, laut: laut * 0.07 });
    }
  },
  marimba: {
    name: "Marimba",
    kurz: "Holzig und kurz. Warm, unaufdringlich, für jeden Tag.",
    ton(k, ziel, hz, ab, laut) {
      stimme(k, ziel, { art: "triangle", hz, ab, dauer: 0.34, laut: laut * 0.255 });
      stimme(k, ziel, { art: "sine", hz: hz * 2, ab, dauer: 0.14, laut: laut * 0.076 });
    }
  },
  arcade: {
    name: "Arcade",
    kurz: "Acht Bit, wie eine eingesammelte Münze. Für Kinder das Beste.",
    ton(k, ziel, hz, ab, laut) {
      stimme(k, ziel, { art: "square", hz, ab, dauer: 0.13, laut: laut * 0.32, anstieg: 0.002 });
      stimme(k, ziel, { art: "square", hz: hz * 1.5, ab: ab + 0.05, dauer: 0.1, laut: laut * 0.18, anstieg: 0.002 });
    }
  },
  weich: {
    name: "Weich",
    kurz: "Ein gefiltertes Schweben. Erwachsen, leise, kaum zu bemerken.",
    ton(k, ziel, hz, ab, laut) {
      stimme(k, ziel, { art: "sawtooth", hz, ab, dauer: 0.75, laut: laut * 0.36,
                        anstieg: 0.07, filter: Math.min(6000, hz * 2.2) });
    }
  }
};

/* Die Zahlen oben sind aneinander angeglichen, nicht geraten: sonst klingt eine
 * Familie nur deshalb besser, weil sie lauter ist. `tests/mockup-klang.mjs`
 * rechnet alle sechzehn Jubel durch und wacht darüber, dass sie im selben
 * Pegelband bleiben. */

export const SATZ_IDS = Object.keys(SAETZE);
export const PHASEN = ["leise", "mittel", "gross"];

/* ------------------------------------------------------------------ Abspielen */

let kontext = null;

/**
 * Holt den Tonkontext — und legt ihn beim ersten Mal an.
 *
 * Browser lassen Ton erst nach einer Berührung zu. Beim Prüfen ist das kein
 * Problem (da wurde gerade getippt), beim nachgeholten Moment nach dem Öffnen
 * der App schon: dort ist der Kontext angehalten. Wir versuchen ihn zu wecken
 * und schweigen, wenn es nicht geht — ein stummer Jubel ist besser als eine
 * Fehlermeldung.
 */
export function tonKontext() {
  if (!kontext) {
    const Klasse = window.AudioContext || window.webkitAudioContext;
    if (!Klasse) return null;
    try { kontext = new Klasse(); } catch { return null; }
  }
  if (kontext.state === "suspended") kontext.resume().catch(() => {});
  return kontext;
}

/**
 * Baut die Töne eines Jubels in einen beliebigen Tonkontext.
 *
 * Getrennt vom Abspielen, weil beides gebraucht wird: die App schickt es an
 * die Lautsprecher, der Test rechnet es in einem stillen Kontext aus und misst
 * nach, ob wirklich etwas herauskommt. Wäre das eine Funktion, ließe sich das
 * nur mit Ohren prüfen.
 */
export function bauen(k, ziel, { phase = "leise", satz = "marimba", positiv = true, ab = 0 } = {}) {
  const familie = SAETZE[satz];
  if (!familie) return 0;
  const folge = positiv ? (FOLGEN[phase] || FOLGEN.leise) : NEIN;
  for (const [note, versatz, laut] of folge) {
    familie.ton(k, ziel, N[note], ab + versatz, laut);
  }
  return folge.length;
}

/** Die Grundlautstärke einer Phase — ein großer Jubel darf lauter sein. */
export const grundLaut = (phase, positiv = true) => positiv ? (LAUT[phase] || LAUT.leise) : 0.3;

/**
 * Spielt den Jubel einer Phase.
 *
 * `satz` ist eine der Familien oben, `lautstaerke` geht von 0 bis 1 — bei 0
 * passiert nichts, und der Kontext wird gar nicht erst geweckt.
 */
export function klingen({ phase = "leise", satz = "marimba", positiv = true, lautstaerke = 0.7 } = {}) {
  if (!(lautstaerke > 0)) return false;
  if (!SAETZE[satz]) return false;

  const k = tonKontext();
  if (!k || k.state !== "running") return false;

  const summe = k.createGain();
  summe.gain.value = Math.min(1, lautstaerke) * grundLaut(phase, positiv);
  summe.connect(k.destination);

  bauen(k, summe, { phase, satz, positiv, ab: k.currentTime + 0.02 });
  return true;
}

/** Wie lange der längste Jubel klingt — damit die Hörprobe weiß, wann sie den
 *  Knopf wieder freigeben darf. */
export const dauerVon = (phase, positiv = true) =>
  positiv ? (phase === "gross" ? 1.7 : phase === "mittel" ? 1.4 : 1.2) : 0.9;
