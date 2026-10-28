// Das Mockup „Einladung teilen“: zwei Varianten (kurze Nachricht mit Schritten hinter dem
// Link, oder alles in der Nachricht), der Weg auf Android und auf dem iPhone, die
// Entscheidungen. Nichts läuft über, auch nicht auf dem Handy und im Dunkeln.
import { chromium } from "playwright";
const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const seite = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
seite.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) { console.log("  FEHL " + r.status() + " " + r.url()); fehler++; } });
const text = async (sel) => (await seite.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = (s) => s.evaluate(() =>
  [...document.querySelectorAll(".phone, .phone .inhalt, .frage")].filter((p) => p.scrollWidth > p.clientWidth + 1).length);

pruefe("Die Seite kommt", (await seite.goto(`${ZIEL}/mockup-einladung/`, { waitUntil: "networkidle" })).status(), 200);
pruefe("Neun Telefone", await seite.locator(".phone").count(), 9);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Nichts läuft über", await ueberlauf(seite), 0);

console.log("== B · kurze Nachricht");
pruefe("Nachricht nur mit Einladungslink", (await text("#p2")).includes("groups.google.com"), false);
pruefe("… und dem Hinweis auf die Schritte", (await text("#p2")).includes("dort steht, wie es auf Android und iPhone weitergeht"), true);
pruefe("Android-Seite mit drei Schritten", await seite.locator("#p4 .schritte-k li").count(), 3);
pruefe("iPhone-Seite mit drei Schritten", await seite.locator("#p7 .schritte-k li").count(), 3);
pruefe("Haushalt: Link bringt den Code mit", (await text("#p3")).includes("?einladung=482913"), true);
await seite.screenshot({ path: `${AUS}/me-b.png`, fullPage: true });

console.log("== A · alles in der Nachricht");
await seite.click('[data-weg="a"]');
pruefe("Android-Abschnitt", (await text("#p2")).includes("📱 Android"), true);
pruefe("iPhone-Abschnitt", (await text("#p2")).includes("🍎 iPhone"), true);
pruefe("Testgruppe und Tester-Link drin", (await text("#p2")).includes("groups.google.com/g/homi-point-pilot") && (await text("#p2")).includes("apps/testing/com.homipoint.app"), true);
pruefe("Nichts läuft über (A)", await ueberlauf(seite), 0);
await seite.screenshot({ path: `${AUS}/me-a.png`, fullPage: true });

console.log("== Handy, hell und dunkel");
for (const thema of ["light", "dark"]) {
  const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: thema });
  handy.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  await handy.goto(`${ZIEL}/mockup-einladung/`, { waitUntil: "networkidle" });
  pruefe(`375 px ${thema}: kein seitliches Scrollen`, await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  pruefe(`375 px ${thema}: nichts läuft über`, await ueberlauf(handy), 0);
  for (const p of ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]) await handy.locator(`#${p}`).screenshot({ path: `${AUS}/me-${p}-${thema}.png` });
  await handy.click('[data-weg="a"]');
  await handy.locator("#p2").screenshot({ path: `${AUS}/me-a2-${thema}.png` });
  await handy.close();
}
await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
