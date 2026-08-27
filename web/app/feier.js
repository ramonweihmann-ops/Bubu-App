// Der Jubel nach einer bestätigten Quest.
//
// Drei Stufen, je nachdem, wie viel es wert war: leise, mittel, groß. Das
// Feuerwerk gehört in die oberste Stufe — sonst nutzt es sich ab, und die
// kleine Quest fühlt sich an wie die große.
//
// Jede Stufe hat zehn Rezepte. Ein Rezept ist keine fertige Animation, sondern
// eine Anweisung an die Bühne: streu das, wirf jenes, blitze kurz. Dadurch
// bleibt jedes einzelne kurz genug zum Lesen, und neue kommen mit drei Zeilen
// dazu.
//
// Gezeichnet wird auf ein Canvas über dem Bild. Ein einziges, das sich nach dem
// Lauf selbst leert — kein Bild bleibt liegen, wenn die App weiterläuft.

/* ------------------------------------------------------------------ Farben */

const MARKE = ["#ec0f06", "#ffffff", "#f0913f", "#6ba4ff"];
const GOLD = ["#ffd76e", "#ffb01f", "#fff3c9", "#e79b00"];
const REGENBOGEN = ["#ec0f06", "#f0913f", "#ffd76e", "#4fc7a1", "#6ba4ff", "#b98cff"];
const KUEHL = ["#6ba4ff", "#8fd3ff", "#ffffff", "#b98cff"];
const WARM = ["#ec0f06", "#ff7a5c", "#ffd76e", "#ffffff"];

const zuf = (a, b) => a + Math.random() * (b - a);
const eins = (liste) => liste[Math.floor(Math.random() * liste.length)];

/* ------------------------------------------------------------------ Teilchen */

/** Ein Teilchen kennt nur sich selbst: wo es ist, wohin es will, wie lange
 *  noch. Alles Weitere entscheidet die Form beim Zeichnen. */
function teilchen(o) {
  return {
    x: 0, y: 0, vx: 0, vy: 0, g: 0, luft: 0.995,
    leben: 1200, alter: 0, groesse: 8, farbe: "#fff", form: "flocke",
    dreh: Math.random() * Math.PI * 2, drehv: zuf(-0.2, 0.2),
    funkeln: 0, schwanken: 0, ...o
  };
}

const FORMEN = {
  flocke(c, t, s) { c.fillRect(-t.groesse / 2, -t.groesse * 0.8, t.groesse, t.groesse * 1.6); },
  kreis(c, t) { c.beginPath(); c.arc(0, 0, t.groesse / 2, 0, 7); c.fill(); },
  blase(c, t) {
    c.beginPath(); c.arc(0, 0, t.groesse / 2, 0, 7);
    c.strokeStyle = t.farbe; c.lineWidth = 1.4; c.stroke();
    c.globalAlpha *= 0.25; c.fill();
  },
  band(c, t) { c.fillRect(-t.groesse / 6, -t.groesse * 1.4, t.groesse / 3, t.groesse * 2.8); },
  stern(c, t) {
    const r = t.groesse / 2;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const w = (i * Math.PI) / 5;
      const l = i % 2 ? r * 0.42 : r;
      c[i ? "lineTo" : "moveTo"](Math.cos(w) * l, Math.sin(w) * l);
    }
    c.closePath(); c.fill();
  },
  herz(c, t) {
    const r = t.groesse / 2;
    c.beginPath();
    c.moveTo(0, r * 0.75);
    c.bezierCurveTo(-r * 1.4, -r * 0.35, -r * 0.5, -r * 1.2, 0, -r * 0.45);
    c.bezierCurveTo(r * 0.5, -r * 1.2, r * 1.4, -r * 0.35, 0, r * 0.75);
    c.fill();
  },
  funke(c, t) {
    c.strokeStyle = t.farbe; c.lineWidth = Math.max(1, t.groesse / 4); c.lineCap = "round";
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, t.groesse * 1.6); c.stroke();
  },
  schweif(c, t) {
    const l = t.groesse * 3.2;
    const g = c.createLinearGradient(0, 0, 0, l);
    g.addColorStop(0, t.farbe); g.addColorStop(1, "rgba(255,255,255,0)");
    c.strokeStyle = g; c.lineWidth = Math.max(1.2, t.groesse / 3); c.lineCap = "round";
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, l); c.stroke();
  }
};

/* ------------------------------------------------------------------ Bühne */

/** Die Bühne ist das, womit ein Rezept arbeitet. Sie kennt die Fläche, die Uhr
 *  und ein paar Gesten — streuen, knallen, regnen. Mehr braucht es nicht. */
function buehne(c, breite, hoehe) {
  const teile = [];
  const ringe = [];
  const blitze = [];
  const spaeter = [];

  const B = {
    breite, hoehe,
    mitte: { x: breite / 2, y: hoehe / 2 },
    teile, ringe, blitze, spaeter,

    /** Etwas zur Bühne geben. */
    wirf(o) { teile.push(teilchen(o)); return B; },

    /** Ein paar Teilchen in einem Bereich verteilen. */
    streu({ anzahl = 12, x = [0, breite], y = [0, hoehe], vx = [-0.6, 0.6], vy = [-1.4, -0.4],
            g = 0, groesse = [6, 12], farben = MARKE, form = "kreis", leben = [1200, 2000],
            funkeln = 0, schwanken = 0, luft = 0.998 } = {}) {
      for (let i = 0; i < anzahl; i++) {
        B.wirf({
          x: zuf(x[0], x[1]), y: zuf(y[0], y[1]),
          vx: zuf(vx[0], vx[1]), vy: zuf(vy[0], vy[1]), g, luft,
          groesse: zuf(groesse[0], groesse[1]), farbe: eins(farben), form,
          leben: zuf(leben[0], leben[1]), funkeln, schwanken
        });
      }
      return B;
    },

    /** Eine Explosion: alles fliegt vom selben Punkt in alle Richtungen. */
    knall({ x = breite / 2, y = hoehe / 2, anzahl = 60, kraft = [3.5, 9], g = 0.02,
            farben = GOLD, form = "kreis", groesse = [3, 7], leben = [900, 1600],
            funkeln = 0.4, ring = true } = {}) {
      for (let i = 0; i < anzahl; i++) {
        const w = (i / anzahl) * Math.PI * 2 + zuf(-0.08, 0.08);
        const k = zuf(kraft[0], kraft[1]);
        B.wirf({
          x, y, vx: Math.cos(w) * k, vy: Math.sin(w) * k, g, luft: 0.972,
          groesse: zuf(groesse[0], groesse[1]), farbe: eins(farben), form,
          leben: zuf(leben[0], leben[1]), funkeln
        });
      }
      if (ring) B.welle({ x, y, farbe: farben[0] });
      return B;
    },

    /** Etwas fällt von oben herein. */
    regen({ anzahl = 40, farben = MARKE, form = "flocke", groesse = [7, 13],
            tempo = [3, 6.5], schwanken = 1.2, leben = [1600, 2600] } = {}) {
      for (let i = 0; i < anzahl; i++) {
        B.wirf({
          x: zuf(0, breite), y: zuf(-hoehe * 0.4, -10),
          vx: zuf(-0.6, 0.6), vy: zuf(tempo[0], tempo[1]), g: 0.012, luft: 1,
          groesse: zuf(groesse[0], groesse[1]), farbe: eins(farben), form,
          leben: zuf(leben[0], leben[1]), schwanken, drehv: zuf(-0.14, 0.14)
        });
      }
      return B;
    },

    /** Ein Springbrunnen von unten. */
    fontaene({ x = breite / 2, anzahl = 50, farben = KUEHL, form = "kreis",
               kraft = [7, 12], streuung = 0.5, groesse = [3, 8] } = {}) {
      for (let i = 0; i < anzahl; i++) {
        const w = -Math.PI / 2 + zuf(-streuung, streuung);
        const k = zuf(kraft[0], kraft[1]);
        B.wirf({
          x: x + zuf(-14, 14), y: hoehe + 8,
          vx: Math.cos(w) * k, vy: Math.sin(w) * k, g: 0.018, luft: 0.999,
          groesse: zuf(groesse[0], groesse[1]), farbe: eins(farben), form,
          leben: zuf(1400, 2200), funkeln: 0.3
        });
      }
      return B;
    },

    /** Eine Konfettikanone von der Seite. */
    kanone({ links = true, anzahl = 45, farben = REGENBOGEN } = {}) {
      for (let i = 0; i < anzahl; i++) {
        const w = (links ? -0.95 : -Math.PI + 0.95) + zuf(-0.3, 0.3);
        const k = zuf(4, 9);
        B.wirf({
          x: links ? -10 : breite + 10, y: hoehe * 0.86,
          vx: Math.cos(w) * k, vy: Math.sin(w) * k, g: 0.022, luft: 0.994,
          groesse: zuf(7, 13), farbe: eins(farben), form: "flocke",
          leben: zuf(1600, 2400), schwanken: 0.8, drehv: zuf(-0.3, 0.3)
        });
      }
      return B;
    },

    /** Ein Ring, der nach außen läuft. */
    welle({ x = breite / 2, y = hoehe / 2, farbe = "#fff", tempo = 0.42, leben = 900, dicke = 3 } = {}) {
      ringe.push({ x, y, r: 4, tempo, alter: 0, leben, farbe, dicke });
      return B;
    },

    /** Ein kurzes Aufblitzen über die ganze Fläche. */
    blitz({ farbe = "#fff", staerke = 0.5, leben = 260 } = {}) {
      blitze.push({ farbe, staerke, alter: 0, leben });
      return B;
    },

    /** Etwas später noch einmal. */
    nach(ms, fn) { spaeter.push({ bei: ms, fn, getan: false }); return B; }
  };
  return B;
}

/* ------------------------------------------------------------------ Rezepte */

/** Leise: eine kleine Quest ist erledigt. Ein Nicken, kein Applaus. */
const LEISE = [
  { id: "seifenblasen", name: "Seifenblasen", dauer: 2200, mach: (b) =>
      b.streu({ anzahl: 16, y: [b.hoehe * 0.7, b.hoehe], vy: [-1.8, -0.9], groesse: [10, 26],
                farben: KUEHL, form: "blase", schwanken: 1.4, leben: [1800, 2400] }) },
  { id: "sternenregen", name: "Sternenregen", dauer: 2200, mach: (b) =>
      b.regen({ anzahl: 18, farben: GOLD, form: "stern", groesse: [7, 13], tempo: [1.8, 3.6] }) },
  { id: "funkeln", name: "Funkeln", dauer: 1800, mach: (b) =>
      b.streu({ anzahl: 26, vx: [-0.15, 0.15], vy: [-0.15, 0.15], groesse: [3, 8],
                farben: GOLD, form: "stern", funkeln: 1, leben: [900, 1700] }) },
  { id: "herzchen", name: "Herzchen", dauer: 2200, mach: (b) =>
      b.streu({ anzahl: 14, y: [b.hoehe * 0.65, b.hoehe], vy: [-2.2, -1.1], groesse: [10, 20],
                farben: WARM, form: "herz", schwanken: 1.1, leben: [1700, 2300] }) },
  { id: "woelkchen", name: "Konfetti-Wölkchen", dauer: 2000, mach: (b) =>
      b.streu({ anzahl: 14, y: [-30, 40], vy: [1.6, 3.2], g: 0.008, groesse: [7, 12],
                farben: MARKE, form: "flocke", schwanken: 1.3, leben: [1600, 2200] }) },
  { id: "welle", name: "Sanfte Welle", dauer: 1700, mach: (b) => {
      b.welle({ tempo: 0.3, leben: 1300, dicke: 2, farbe: "#8fd3ff" });
      b.nach(320, () => b.welle({ tempo: 0.26, leben: 1200, dicke: 1.6, farbe: "#ffffff" })); } },
  { id: "glitzerstaub", name: "Glitzerstaub", dauer: 2100, mach: (b) =>
      b.streu({ anzahl: 30, vx: [0.9, 2.6], vy: [-0.4, 0.4], groesse: [2, 5],
                farben: GOLD, form: "kreis", funkeln: 0.8, leben: [1400, 2100], luft: 1 }) },
  { id: "pusteblume", name: "Pusteblume", dauer: 2300, mach: (b) =>
      b.streu({ anzahl: 20, x: [b.breite * 0.3, b.breite * 0.5], y: [b.hoehe * 0.55, b.hoehe * 0.7],
                vx: [1.1, 3.2], vy: [-1.6, -0.4], groesse: [4, 9], farben: ["#ffffff", "#e9eff8"],
                form: "stern", schwanken: 1.6, leben: [1800, 2400], luft: 1 }) },
  { id: "blubber", name: "Blubbern", dauer: 2000, mach: (b) =>
      b.fontaene({ anzahl: 22, kraft: [4.5, 7.5], streuung: 0.75, farben: KUEHL,
                   form: "blase", groesse: [7, 16] }) },
  { id: "lichtpunkte", name: "Lichtpunkte", dauer: 1900, mach: (b) =>
      b.streu({ anzahl: 22, vx: [-0.3, 0.3], vy: [-0.8, -0.2], groesse: [5, 11],
                farben: KUEHL, form: "kreis", funkeln: 0.6, leben: [1200, 1900] }) }
];

/** Mittel: das war schon Arbeit. Mehr Bewegung, aber noch kein Knall. */
const MITTEL = [
  { id: "konfettiregen", name: "Konfettiregen", dauer: 2400, mach: (b) =>
      b.regen({ anzahl: 46, farben: REGENBOGEN }) },
  { id: "sternschnuppe", name: "Sternschnuppe", dauer: 2100, mach: (b) => {
      b.wirf({ x: -20, y: b.hoehe * 0.25, vx: 13, vy: 4.4, groesse: 9, farbe: "#fff",
               form: "schweif", leben: 1200, dreh: -Math.PI / 2 - 0.33, drehv: 0 });
      b.nach(220, () => b.streu({ anzahl: 18, x: [b.breite * 0.3, b.breite * 0.8],
                                  y: [b.hoehe * 0.3, b.hoehe * 0.55], groesse: [3, 7],
                                  farben: GOLD, form: "stern", funkeln: 1, leben: [900, 1500] })); } },
  { id: "doppelwelle", name: "Doppelwelle", dauer: 2000, mach: (b) => {
      b.welle({ tempo: 0.6, leben: 1100, dicke: 4, farbe: "#6ba4ff" });
      b.nach(180, () => b.welle({ tempo: 0.55, leben: 1100, dicke: 3, farbe: "#ffffff" }));
      b.nach(360, () => b.welle({ tempo: 0.5, leben: 1100, dicke: 2, farbe: "#ffd76e" }));
      b.streu({ anzahl: 18, groesse: [3, 7], farben: KUEHL, form: "stern", funkeln: 0.7 }); } },
  { id: "baender", name: "Luftschlangen", dauer: 2400, mach: (b) =>
      b.regen({ anzahl: 26, farben: REGENBOGEN, form: "band", groesse: [12, 22],
                tempo: [2.4, 4.6], schwanken: 2.2 }) },
  { id: "sprudel", name: "Sprudel", dauer: 2200, mach: (b) =>
      b.fontaene({ anzahl: 55, farben: [...KUEHL, ...GOLD], kraft: [8, 13] }) },
  { id: "kreisel", name: "Kreisel", dauer: 2100, mach: (b) => {
      for (let i = 0; i < 40; i++) {
        const w = (i / 40) * Math.PI * 2;
        b.wirf({ x: b.mitte.x, y: b.mitte.y, vx: Math.cos(w) * 5.5, vy: Math.sin(w) * 5.5,
                 luft: 0.978, groesse: zuf(4, 9), farbe: eins(REGENBOGEN), form: "flocke",
                 leben: zuf(1200, 1800), drehv: 0.34 });
      } } },
  { id: "regenbogen", name: "Regenbogen-Konfetti", dauer: 2400, mach: (b) => {
      b.regen({ anzahl: 30, farben: REGENBOGEN, groesse: [8, 14] });
      b.nach(400, () => b.regen({ anzahl: 24, farben: REGENBOGEN, form: "band", groesse: [10, 18] })); } },
  { id: "blitzlichter", name: "Blitzlichter", dauer: 1900, mach: (b) => {
      b.blitz({ staerke: 0.32, leben: 220 });
      b.nach(280, () => b.blitz({ staerke: 0.24, leben: 200, farbe: "#ffd76e" }));
      b.nach(560, () => b.blitz({ staerke: 0.18, leben: 200 }));
      b.streu({ anzahl: 24, groesse: [3, 8], farben: GOLD, form: "stern", funkeln: 1 }); } },
  { id: "sternexplosion", name: "Sternenwurf", dauer: 2100, mach: (b) =>
      b.knall({ anzahl: 44, farben: GOLD, form: "stern", groesse: [5, 11], kraft: [3, 7] }) },
  { id: "wirbel", name: "Papierwirbel", dauer: 2300, mach: (b) => {
      b.streu({ anzahl: 34, y: [b.hoehe * 0.4, b.hoehe], vx: [-3, 3], vy: [-6, -2.4],
                g: 0.03, groesse: [7, 13], farben: MARKE, form: "flocke",
                schwanken: 2, leben: [1600, 2300] }); } }
];

/** Groß: ab hier das Feuerwerk. Wer zehn Cleanies holt, soll es sehen. */
const GROSS = [
  { id: "feuerwerk", name: "Feuerwerk", dauer: 2800, mach: (b) => {
      b.knall({ x: b.breite * 0.3, y: b.hoehe * 0.34, farben: WARM, anzahl: 70 });
      b.nach(360, () => b.knall({ x: b.breite * 0.72, y: b.hoehe * 0.26, farben: KUEHL, anzahl: 70 }));
      b.nach(760, () => b.knall({ x: b.breite * 0.5, y: b.hoehe * 0.45, farben: GOLD, anzahl: 90 })); } },
  { id: "kette", name: "Feuerwerk-Kette", dauer: 3000, mach: (b) => {
      for (let i = 0; i < 6; i++) {
        b.nach(i * 300, () => b.knall({
          x: b.breite * (0.15 + 0.14 * i), y: b.hoehe * zuf(0.2, 0.5),
          anzahl: 48, farben: [REGENBOGEN, GOLD, WARM, KUEHL][i % 4], kraft: [1.4, 3.6] }));
      } } },
  { id: "goldregen", name: "Goldregen", dauer: 2900, mach: (b) => {
      b.knall({ y: b.hoehe * 0.24, anzahl: 80, farben: GOLD, g: 0.05, kraft: [4, 9], form: "funke" });
      b.nach(300, () => b.regen({ anzahl: 60, farben: GOLD, form: "funke", groesse: [5, 11],
                                  tempo: [4, 8] })); } },
  { id: "doppelkanone", name: "Doppelkanone", dauer: 2800, mach: (b) => {
      b.kanone({ links: true }); b.kanone({ links: false });
      b.nach(500, () => { b.kanone({ links: true, anzahl: 28 }); b.kanone({ links: false, anzahl: 28 }); }); } },
  { id: "supernova", name: "Supernova", dauer: 2800, mach: (b) => {
      b.blitz({ staerke: 0.55, leben: 300 });
      b.knall({ anzahl: 110, farben: [...GOLD, "#ffffff"], kraft: [4, 11], groesse: [3, 9] });
      b.nach(140, () => b.welle({ tempo: 1.1, leben: 1000, dicke: 5, farbe: "#ffd76e" }));
      b.nach(420, () => b.knall({ anzahl: 60, farben: WARM, kraft: [2.5, 6.5], ring: false })); } },
  { id: "sternenhimmel", name: "Sternenhimmel", dauer: 3000, mach: (b) => {
      b.streu({ anzahl: 60, vx: [-0.12, 0.12], vy: [-0.12, 0.12], groesse: [2, 7],
                farben: [...GOLD, "#ffffff"], form: "stern", funkeln: 1, leben: [1600, 2800] });
      b.nach(600, () => b.knall({ y: b.hoehe * 0.35, anzahl: 70, farben: GOLD }));
      b.nach(1400, () => b.knall({ x: b.breite * 0.3, y: b.hoehe * 0.5, anzahl: 50, farben: KUEHL })); } },
  { id: "sturm", name: "Konfettisturm", dauer: 3000, mach: (b) => {
      b.regen({ anzahl: 70, farben: REGENBOGEN, groesse: [8, 15], tempo: [4.5, 9], schwanken: 2.4 });
      b.nach(400, () => b.regen({ anzahl: 50, farben: REGENBOGEN, form: "band",
                                  groesse: [12, 22], tempo: [3.5, 7], schwanken: 3 }));
      b.nach(900, () => b.kanone({ links: Math.random() < 0.5, anzahl: 40 })); } },
  { id: "raketen", name: "Raketen", dauer: 3000, mach: (b) => {
      for (let i = 0; i < 3; i++) {
        const zx = b.breite * (0.25 + 0.25 * i);
        const zy = b.hoehe * zuf(0.2, 0.4);
        b.nach(i * 260, () => {
          b.wirf({ x: zx, y: b.hoehe + 10, vx: 0, vy: -(b.hoehe - zy) / 44,
                   groesse: 7, farbe: "#ffd76e", form: "schweif", leben: 760, drehv: 0 });
          b.nach(i * 260 + 780, () => b.knall({ x: zx, y: zy, anzahl: 64,
                                                farben: [GOLD, WARM, KUEHL][i % 3] }));
        });
      } } },
  { id: "glitzerexplosion", name: "Glitzer-Explosion", dauer: 2800, mach: (b) => {
      b.knall({ anzahl: 90, farben: [...GOLD, ...KUEHL], form: "stern",
                groesse: [4, 10], kraft: [3.5, 9], funkeln: 1 });
      b.nach(500, () => b.streu({ anzahl: 40, groesse: [2, 6], farben: GOLD,
                                  form: "stern", funkeln: 1, leben: [1200, 2000] })); } },
  { id: "finale", name: "Großes Finale", dauer: 3200, mach: (b) => {
      b.blitz({ staerke: 0.4, leben: 260 });
      b.kanone({ links: true }); b.kanone({ links: false });
      b.knall({ y: b.hoehe * 0.3, anzahl: 80, farben: GOLD });
      b.nach(500, () => b.regen({ anzahl: 50, farben: REGENBOGEN }));
      b.nach(900, () => b.knall({ x: b.breite * 0.28, y: b.hoehe * 0.42, anzahl: 60, farben: WARM }));
      b.nach(1300, () => b.knall({ x: b.breite * 0.74, y: b.hoehe * 0.36, anzahl: 60, farben: KUEHL }));
      b.nach(1700, () => b.fontaene({ anzahl: 60, farben: GOLD, kraft: [9, 15] })); } }
];

export const REZEPTE = { leise: LEISE, mittel: MITTEL, gross: GROSS };

/** Die Stufen mit ihren Grenzen. „bis" ist einschließlich; die oberste hat
 *  keine Grenze, damit auch eine 99er-Quest irgendwo landet. */
export const PHASEN = [
  { id: "leise", name: "Leise", bis: 3 },
  { id: "mittel", name: "Mittel", bis: 6 },
  { id: "gross", name: "Groß", bis: null }
];

export const STANDARD_GRENZEN = { leise: 3, mittel: 6 };

/** Welche Stufe gilt für so viele Cleanies? */
export function phaseFuer(punkte, grenzen = STANDARD_GRENZEN) {
  const p = Math.abs(Number(punkte) || 0);
  if (p <= (grenzen.leise ?? 3)) return "leise";
  if (p <= (grenzen.mittel ?? 6)) return "mittel";
  return "gross";
}

/** Ein Rezept aus der Stufe — aber nicht dasselbe wie beim letzten Mal. */
export function waehle(phase, letzte = null) {
  const liste = REZEPTE[phase] || LEISE;
  const frei = liste.length > 1 ? liste.filter((r) => r.id !== letzte) : liste;
  return frei[Math.floor(Math.random() * frei.length)];
}

/* ------------------------------------------------------------------ Spielen */

let laeuft = null;

/**
 * Eine Animation auf ein Canvas spielen. Gibt zurück, welches Rezept es war —
 * damit der nächste Aufruf ein anderes nehmen kann.
 *
 * Wer „Bewegung reduzieren" eingestellt hat, bekommt gar nichts. Das ist keine
 * Einstellung der App, sondern eine des Geräts, und sie hat Vorrang.
 */
export function spielen(leinwand, { punkte = 0, grenzen = STANDARD_GRENZEN, rezept = null,
                                    letzte = null, phase = null } = {}) {
  if (!leinwand) return null;
  const stufe = phase || phaseFuer(punkte, grenzen);
  const r = rezept
    ? (REZEPTE[stufe].find((x) => x.id === rezept) || waehle(stufe, letzte))
    : waehle(stufe, letzte);

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return r.id;

  if (laeuft) cancelAnimationFrame(laeuft);
  const c = leinwand.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const breite = leinwand.clientWidth || 360;
  const hoehe = leinwand.clientHeight || 640;
  leinwand.width = Math.round(breite * dpr);
  leinwand.height = Math.round(hoehe * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const B = buehne(c, breite, hoehe);
  r.mach(B);

  const start = performance.now();
  let vorher = start;

  const bild = (jetzt) => {
    // Der erste Zeitstempel eines Bildes kann vor dem Start liegen — er zeigt
    // den Anfang des Frames, nicht den Moment des Aufrufs. Ohne die Null unten
    // liefe die Zeit dann rückwärts, und der Ring schrumpfte ins Negative.
    const dt = Math.max(0, Math.min(48, jetzt - vorher));
    vorher = jetzt;
    const zeit = jetzt - start;

    for (const s of B.spaeter) {
      if (!s.getan && zeit >= s.bei) { s.getan = true; s.fn(); }
    }

    c.clearRect(0, 0, breite, hoehe);

    for (const bl of B.blitze) {
      bl.alter += dt;
      const a = Math.max(0, 1 - bl.alter / bl.leben) * bl.staerke;
      if (a <= 0) continue;
      c.globalAlpha = a; c.fillStyle = bl.farbe;
      c.fillRect(0, 0, breite, hoehe);
    }

    for (const ring of B.ringe) {
      ring.alter += dt;
      ring.r += ring.tempo * dt;
      const a = Math.max(0, 1 - ring.alter / ring.leben);
      if (a <= 0) continue;
      c.globalAlpha = a * 0.7; c.strokeStyle = ring.farbe; c.lineWidth = ring.dicke;
      c.beginPath(); c.arc(ring.x, ring.y, Math.max(0, ring.r), 0, 7); c.stroke();
    }

    for (const t of B.teile) {
      t.alter += dt;
      const rest = 1 - t.alter / t.leben;
      if (rest <= 0) continue;
      t.vy += t.g * dt;
      t.vx *= Math.pow(t.luft, dt / 16);
      t.vy *= Math.pow(t.luft, dt / 16);
      t.x += t.vx * (dt / 16) + (t.schwanken ? Math.sin((t.alter + t.dreh * 400) / 240) * t.schwanken * (dt / 16) : 0);
      t.y += t.vy * (dt / 16);
      t.dreh += t.drehv * (dt / 16);

      let a = Math.min(1, rest * 2.4);
      if (t.funkeln) a *= 0.45 + 0.55 * Math.abs(Math.sin(t.alter / (90 / t.funkeln)));

      c.save();
      c.globalAlpha = a;
      c.fillStyle = t.farbe;
      c.translate(t.x, t.y);
      c.rotate(t.dreh);
      (FORMEN[t.form] || FORMEN.kreis)(c, t, t.groesse);
      c.restore();
    }

    c.globalAlpha = 1;

    const fertig = zeit > r.dauer + 400 ||
      (zeit > 600 && B.teile.every((t) => t.alter >= t.leben) &&
       B.ringe.every((x) => x.alter >= x.leben) && B.spaeter.every((s) => s.getan));
    if (fertig) {
      c.clearRect(0, 0, breite, hoehe);
      laeuft = null;
      return;
    }
    laeuft = requestAnimationFrame(bild);
  };

  laeuft = requestAnimationFrame(bild);
  return r.id;
}

/** Alles sofort abräumen — etwa wenn das Fenster geschlossen wird. */
export function stoppen(leinwand) {
  if (laeuft) cancelAnimationFrame(laeuft);
  laeuft = null;
  if (leinwand) {
    const c = leinwand.getContext("2d");
    c.clearRect(0, 0, leinwand.width, leinwand.height);
  }
}
