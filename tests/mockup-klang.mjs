// Die Hörprobe: steht alles da — und klingt jeder der sechzehn Knöpfe wirklich?
//
// Hören kann ein Test nicht. Er kann aber jeden Jubel in einem stillen Kontext
// ausrechnen und den Pegel messen. Ein Tippfehler in einer Klangfamilie fiele
// sonst erst am Ohr auf, und zwar erst nach dem Einbau.
import { chromium } from "playwright";

const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const BILDER = process.env.HQ_BILDER || "/tmp";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const seite = await browser.newPage({ viewport: { width: 900, height: 1000 } });
seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
seite.on("console", (m) => {
  if (m.type() === "error" && !/favicon|ERR_NAME_NOT_RESOLVED/.test(m.text())) {
    console.log("  FEHL console: " + m.text()); fehler++;
  }
});

const antwort = await seite.goto(`${ZIEL}/mockup-klang/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);

console.log("== Alles da");
await seite.waitForSelector("[data-satz]");
pruefe("Vier Familien", await seite.locator(".karte .kopf h3").count(), 5);   // vier plus Vibration
pruefe("Sechzehn Klangknöpfe", await seite.locator("[data-satz]").count(), 16);
pruefe("Drei Vibrationsmuster", await seite.locator("[data-vib]").count(), 3);
const text = await seite.locator("body").innerText();
pruefe("Nennt die Cleanies-Phasen", /1–3 Cleanies/.test(text) && /ab 7 Cleanies/.test(text), true);
pruefe("Sagt, dass die Push keinen eigenen Ton kann", /kein Browser/i.test(text), true);
pruefe("Keine „Punkte“", /\bPunkte\b/.test(text), false);

console.log("== Klingt jeder wirklich?");
// Jeden Jubel in einem stillen Kontext ausrechnen und den Effektivwert messen.
const pegel = await seite.evaluate(async () => {
  const { SATZ_IDS, PHASEN, bauen, grundLaut } = await import("/app/klang.js");
  const messen = async (satz, phase, positiv) => {
    const k = new OfflineAudioContext(1, 44100 * 2, 44100);
    const summe = k.createGain();
    summe.gain.value = grundLaut(phase, positiv);
    summe.connect(k.destination);
    bauen(k, summe, { satz, phase, positiv, ab: 0 });
    const puffer = await k.startRendering();
    const daten = puffer.getChannelData(0);
    let summeQuadrate = 0;
    let spitze = 0;
    for (let i = 0; i < daten.length; i++) {
      summeQuadrate += daten[i] * daten[i];
      if (Math.abs(daten[i]) > spitze) spitze = Math.abs(daten[i]);
    }
    return { satz, phase, positiv, rms: Math.sqrt(summeQuadrate / daten.length), spitze };
  };

  const werte = [];
  for (const satz of SATZ_IDS) {
    for (const phase of PHASEN) werte.push(await messen(satz, phase, true));
    werte.push(await messen(satz, "leise", false));
  }
  return werte;
});

pruefe("Sechzehn gemessen", pegel.length, 16);
for (const p of pegel) {
  const name = `${p.satz} · ${p.positiv ? p.phase : "Ablehnung"}`;
  const ok = p.rms > 0.002;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${name}: Pegel ${p.rms.toFixed(4)}, Spitze ${p.spitze.toFixed(3)}`);
}

console.log("== Und nichts übersteuert");
const zuLaut = pegel.filter((p) => p.spitze >= 1);
pruefe("Keiner reißt aus", zuLaut.map((p) => `${p.satz}/${p.phase}`).join(", "), "");

console.log("== Und die Familien sind gleich laut");
// Sonst wählt man beim Vergleichen die lauteste statt der schönsten.
const grosse = pegel.filter((p) => p.positiv && p.phase === "gross");
const leiseste = Math.min(...grosse.map((p) => p.spitze));
const lauteste = Math.max(...grosse.map((p) => p.spitze));
console.log(`       Spitzen: ${grosse.map((p) => `${p.satz} ${p.spitze.toFixed(3)}`).join(", ")}`);
pruefe("Höchstens Faktor 1,5 zwischen der leisesten und der lautesten", lauteste / leiseste < 1.5, true);

console.log("== Ein großer Jubel ist mehr als ein leiser");
for (const satz of [...new Set(pegel.map((p) => p.satz))]) {
  const von = (phase) => pegel.find((p) => p.satz === satz && p.phase === phase && p.positiv).rms;
  const ok = von("gross") > von("leise");
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${satz}: groß ${von("gross").toFixed(4)} > leise ${von("leise").toFixed(4)}`);
}

console.log("== Stumm ist wirklich stumm");
pruefe("Bei 0 passiert nichts", await seite.evaluate(async () => {
  const { klingen } = await import("/app/klang.js");
  return klingen({ phase: "gross", satz: "glocke", lautstaerke: 0 });
}), false);
pruefe("Eine unbekannte Familie auch nicht", await seite.evaluate(async () => {
  const { klingen } = await import("/app/klang.js");
  return klingen({ phase: "gross", satz: "gibtesnicht", lautstaerke: 1 });
}), false);

await seite.screenshot({ path: `${BILDER}/k1-hoerprobe.png`, fullPage: true });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
