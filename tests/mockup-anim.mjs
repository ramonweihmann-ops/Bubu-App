// Das Animations-Mockup: laufen wirklich alle dreißig?
import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2, locale: "de-DE" });
const s = await ctx.newPage();
let fehler = 0;
s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
s.on("console", (m) => { if (m.type() === "error") { console.log("  FEHL console: " + m.text()); fehler++; } });
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

await s.goto("http://127.0.0.1:8792/mockup-animationen/", { waitUntil: "networkidle" });
await s.waitForSelector("[data-rezept]", { timeout: 8000 });

pruefe("Zehn leise", await s.locator('[data-liste="leise"] button').count(), 10);
pruefe("Zehn mittel", await s.locator('[data-liste="mittel"] button').count(), 10);
pruefe("Zehn groß", await s.locator('[data-liste="gross"] button').count(), 10);

const ueberlauf = await s.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
pruefe("Kein waagerechter Überlauf", ueberlauf, false);

// Die Stufen müssen zu den Cleanies passen — auch weit oben.
const stufen = await s.evaluate(async () => {
  const { phaseFuer } = await import("/app/feier.js");
  return [1, 3, 4, 6, 7, 12, 99].map((p) => `${p}:${phaseFuer(p)}`);
});
pruefe("Grenzen stimmen", stufen.join(" "),
  "1:leise 3:leise 4:mittel 6:mittel 7:gross 12:gross 99:gross");

// Jedes Rezept einmal anstoßen: keines darf einen Fehler werfen, und jedes muss
// wirklich etwas auf die Leinwand malen.
const namen = await s.locator("[data-rezept]").evaluateAll((ks) => ks.map((k) => k.dataset.rezept));
let leer = 0;
for (const id of namen) {
  await s.click(`[data-rezept="${id}"]`);
  await s.waitForTimeout(420);
  const gemalt = await s.evaluate(() => {
    const c = document.getElementById("leinwand");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 40) if (d[i] > 8) return true;
    return false;
  });
  if (!gemalt) { console.log(`  FEHL ${id} malt nichts`); leer++; }
}
pruefe("Alle malen etwas", leer, 0);

// Nie zweimal dasselbe hintereinander.
await s.click('[data-melden="9"]');
await s.waitForTimeout(300);
const folge = [];
for (let i = 0; i < 8; i++) {
  await s.click('[data-melden="9"]');
  await s.waitForTimeout(260);
  folge.push(await s.locator("#name").innerText());
}
const doppelt = folge.some((n, i) => i && n === folge[i - 1]);
pruefe("Nie zweimal dasselbe direkt hintereinander", doppelt, false);

await s.click('[data-rezept="feuerwerk"]');
await s.waitForTimeout(700);
await s.screenshot({ path: `${AUS}/an1-feuerwerk.png` });
await s.click('[data-rezept="seifenblasen"]');
await s.waitForTimeout(700);
await s.screenshot({ path: `${AUS}/an2-leise.png` });
await s.click('[data-rezept="doppelkanone"]');
await s.waitForTimeout(600);
await s.screenshot({ path: `${AUS}/an3-kanone.png` });
await s.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.45));
await s.waitForTimeout(300);
await s.screenshot({ path: `${AUS}/an4-einstellungen.png` });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
