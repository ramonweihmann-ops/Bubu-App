// Das Startbild-Mockup: der erste Start zeigt das Homi-Point-Logo mindestens eine
// Sekunde, danach liegt die App im Hintergrund — Zurückholen und Neuladen zeigen es
// nicht. Dunkel, langsames Netz, und nichts läuft über.
import { chromium } from "playwright";
const ZIEL = process.env.HQ_ZIEL || "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const seite = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
seite.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
seite.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });

const antwort = await seite.goto(`${ZIEL}/mockup-startbild/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await seite.locator("body").innerText()), false);
pruefe("Drei Telefone", await seite.locator(".phone").count(), 3);
pruefe("Das Logo ist geladen", await seite.evaluate(() => fetch("/icons/icon-512.png").then((r) => r.ok)), true);
pruefe("Nichts läuft seitlich über", await seite.evaluate(() =>
  [...document.querySelectorAll(".phone")].filter((p) => p.scrollWidth > p.clientWidth + 1).length), 0);

const sichtbar = (id, was) => seite.locator(`#${id} [data-${was}]`).isVisible();
const status = (id) => seite.locator(`#${id}`).locator("xpath=..").locator("[data-status]").innerText();

console.log("== A: der erste Start zeigt das Logo");
pruefe("Erst der Homescreen", await sichtbar("pa", "home-bild"), true);
await seite.click("#pa [data-oeffnen]");
pruefe("Das Startbild ist da", await sichtbar("pa", "startbild"), true);
pruefe("… mit dem Homi-Point-Logo", await seite.locator('#pa [data-startbild] .logo[aria-label="Homi Point"]').count(), 1);
pruefe("Die App noch nicht", await sichtbar("pa", "app-bild"), false);
await seite.locator("#pa").screenshot({ path: `${AUS}/msb1-startbild.png` });
await seite.waitForTimeout(700);
pruefe("Nach 0,7 s steht es noch", await sichtbar("pa", "startbild"), true);
await seite.waitForTimeout(800);
pruefe("Nach 1,5 s ist die App da", await sichtbar("pa", "app-bild"), true);
pruefe("… und das Startbild weg", await sichtbar("pa", "startbild"), false);
pruefe("Der Status sagt 1 s", (await status("pa")).includes("1,0 s"), true);

console.log("== Aus dem Hintergrund und neu laden: kein Startbild");
await seite.click('#pa >> xpath=.. >> [data-home]');
pruefe("Zurück auf dem Homescreen", await sichtbar("pa", "home-bild"), true);
await seite.click("#pa [data-oeffnen]");
pruefe("Gleich in der App", await sichtbar("pa", "app-bild"), true);
pruefe("Kein Startbild", await sichtbar("pa", "startbild"), false);
pruefe("Der Status sagt warum", (await status("pa")).includes("Aus dem Hintergrund"), true);
await seite.click('#pa >> xpath=.. >> [data-neuladen]');
pruefe("Neu laden: der Kreisel", await seite.locator("#pa [data-kreisel][data-an]").count(), 1);
pruefe("… kein Startbild", await sichtbar("pa", "startbild"), false);
await seite.click('#pa >> xpath=.. >> [data-kalt]');
pruefe("Ganz geschlossen: wieder das Startbild", await sichtbar("pa", "startbild"), true);

console.log("== B und C, dunkel und langsam");
await seite.click('[data-dunkel="an"]');
await seite.click('[data-netz="langsam"]');
pruefe("Die Handys sind dunkel", await seite.locator(".phone[data-dunkel]").count(), 3);
await seite.click("[data-alle]");
pruefe("B: der Name unter dem Logo", await seite.locator("#pb [data-startbild] .name").isVisible(), true);
pruefe("C: Cleanies funkeln", await seite.locator("#pc [data-startbild][data-laeuft] .sterne img").count(), 3);
const hgA = await seite.locator("#pa [data-startbild]").evaluate((e) => getComputedStyle(e).backgroundColor);
pruefe("A im Dunkeln dunkel", hgA, "rgb(15, 28, 49)");
await seite.waitForTimeout(400);
await seite.locator(".reihe").screenshot({ path: `${AUS}/msb2-dunkel.png` });
await seite.waitForTimeout(1300);
pruefe("Langsames Netz: nach 1,7 s steht es noch", await sichtbar("pb", "startbild"), true);
await seite.waitForTimeout(800);
pruefe("Nach 2,5 s ist die App da", await sichtbar("pb", "app-bild"), true);
pruefe("Der Status sagt 2 s", (await status("pb")).includes("2,0 s"), true);

console.log("== Handy: 375 Pixel");
const handy = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });
await handy.goto(`${ZIEL}/mockup-startbild/`, { waitUntil: "networkidle" });
pruefe("Kein seitliches Scrollen", await handy.evaluate(() => document.documentElement.scrollWidth <= 375), true);
await handy.close();

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
