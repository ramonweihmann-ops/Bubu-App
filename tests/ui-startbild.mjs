// Das Startbild in der App: das Homi-Point-Logo nur beim echten Start der
// installierten App, mindestens 1 Sekunde, höchstens 2,5 — nicht im Browser-Tab,
// nicht nach dem Neuladen. Im Dunkeln dunkel. Dazu der neue Name „Homi Point“.
//
// Im Test ist der Browser keine installierte App; „?startbild“ tut so, als wäre er es.
// Braucht den Haushalt aus fair-api.sh (Anna).
import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";
const ZIEL = "http://127.0.0.1:8792";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token, { dunkel = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "de-DE",
    colorScheme: dunkel ? "dark" : "light" });
  if (token) await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
      console.log("  FEHL console: " + m.text()); fehler++;
    }
  });
  return s;
}
const sichtbar = (s) => s.evaluate(() => {
  const el = document.getElementById("startbild");
  return !!el && !el.hidden && !el.hasAttribute("data-weg");
});
const weg = (s) => s.evaluate(() => !document.getElementById("startbild"));

console.log("== Der neue Name");
const anna = await seiteFuer("tok-wa");
await anna.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
pruefe("Der Titel", await anna.title(), "Homi Point");
const manifest = await anna.evaluate(() => fetch("/manifest.webmanifest").then((r) => r.json()));
pruefe("Name auf dem Handy", manifest.name, "Homi Point");
pruefe("… auch kurz", manifest.short_name, "Homi Point");
pruefe("Name fürs iPhone", await anna.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content"), "Homi Point");
pruefe("Das Logo fürs Startbild ist da", await anna.evaluate(() => fetch("/icons/startbild.webp").then((r) => r.ok)), true);
const gast = await seiteFuer(null);
await gast.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
pruefe("Die Anmeldung sagt Homi Point", (await gast.locator(".mitte h1").innerText()).trim(), "Homi Point");
const website = await gast.goto(`${ZIEL}/`, { waitUntil: "networkidle" });
pruefe("Die Website auch", (await gast.locator("h1").innerText()).trim(), "Homi Point");
pruefe("Website da", website.status(), 200);

console.log("== Im Browser-Tab kein Startbild");
pruefe("Kein Startbild", await sichtbar(anna), false);

console.log("== Der echte Start: mindestens eine Sekunde");
const start = await seiteFuer("tok-wa");
await start.goto(`${ZIEL}/app/?startbild`, { waitUntil: "domcontentloaded" });
const ab = Date.now();
pruefe("Das Startbild ist da", await sichtbar(start), true);
pruefe("… mit dem Logo", await start.locator('#startbild img[alt="Homi Point"]').count(), 1);
pruefe("… über allem", await start.locator("#startbild").evaluate((e) => getComputedStyle(e).position + " " + getComputedStyle(e).zIndex), "fixed 100");
pruefe("Hell im Hellen", await start.locator("#startbild").evaluate((e) => getComputedStyle(e).backgroundColor), "rgb(255, 255, 255)");
await start.waitForTimeout(150);
await start.screenshot({ path: `${AUS}/usb1-startbild.png` });
await start.waitForTimeout(Math.max(0, 850 - (Date.now() - ab)));
pruefe("Nach 0,85 s steht es noch", await sichtbar(start), true);
await start.waitForFunction(() => !document.getElementById("startbild"), null, { timeout: 4000 });
const dauer = Date.now() - ab;
pruefe("Dann ist es weg", await weg(start), true);
pruefe(`… nach gut einer Sekunde (${dauer} ms)`, dauer >= 1000 && dauer < 2400, true);
pruefe("Die App ist da", await start.locator(".navbar").count(), 1);

console.log("== Neuladen zählt nicht");
await start.reload({ waitUntil: "domcontentloaded" });
pruefe("Kein Startbild nach dem Neuladen", await sichtbar(start), false);
await start.waitForLoadState("networkidle");

console.log("== Im Dunkeln dunkel");
const nacht = await seiteFuer("tok-wa", { dunkel: true });
await nacht.goto(`${ZIEL}/app/?startbild`, { waitUntil: "domcontentloaded" });
pruefe("Das Startbild ist da", await sichtbar(nacht), true);
pruefe("Dunkler Hintergrund", await nacht.locator("#startbild").evaluate((e) => getComputedStyle(e).backgroundColor), "rgb(15, 28, 49)");
await nacht.waitForTimeout(150);
await nacht.screenshot({ path: `${AUS}/usb2-dunkel.png` });

console.log("== Langsames Netz: höchstens 2,5 Sekunden");
const langsam = await seiteFuer("tok-wa");
await langsam.route("**/api/state**", async (r) => { await new Promise((ok) => setTimeout(ok, 4000)); await r.continue(); });
await langsam.goto(`${ZIEL}/app/?startbild`, { waitUntil: "domcontentloaded" });
const ab2 = Date.now();
await langsam.waitForTimeout(1800);
pruefe("Nach 1,8 s wartet es noch auf die Daten", await sichtbar(langsam), true);
await langsam.waitForFunction(() => !document.getElementById("startbild"), null, { timeout: 4000 });
const dauer2 = Date.now() - ab2;
pruefe(`Spätestens nach 2,5 s geht es (${dauer2} ms)`, dauer2 >= 2300 && dauer2 < 3300, true);

console.log("== Ohne Anmeldung: Startbild, dann die Anmeldung");
const neu = await seiteFuer(null);
await neu.goto(`${ZIEL}/app/?startbild`, { waitUntil: "domcontentloaded" });
pruefe("Das Startbild ist da", await sichtbar(neu), true);
await neu.waitForFunction(() => !document.getElementById("startbild"), null, { timeout: 4000 });
pruefe("Dann die Anmeldung", (await neu.locator(".mitte h1").innerText()).trim(), "Homi Point");

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
