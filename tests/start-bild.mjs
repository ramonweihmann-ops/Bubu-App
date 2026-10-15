// Das Vorher-Bild für den Mockup: die echte Startseite an einem vollen Tag,
// als JPEG, damit die Seite nicht schwer wird.
import { chromium } from "playwright";
const ZIEL = process.argv[2] || "/workspace/bubu-app/web/mockup-start/vorher.jpg";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "de-DE" });
await ctx.addCookies([{ name: "hq_sitzung", value: "tok-a", domain: "127.0.0.1", path: "/" }]);
const s = await ctx.newPage();
await s.goto("http://127.0.0.1:8792/app/", { waitUntil: "networkidle" });
await s.waitForSelector(".navbar");
for (let i = 0; i < 12 && (await s.locator("#celebrate[data-open]").count()); i++) {
  await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(200);
}
// Toasts und Momente stören im Bild.
await s.evaluate(() => document.getElementById("toast")?.removeAttribute("data-open"));
await s.waitForTimeout(300);
const hoehe = await s.evaluate(() => {
  const b = document.querySelector(".body");
  const h = b.scrollHeight;
  document.getElementById("app").style.height = h + 150 + "px";
  b.style.overflow = "visible";
  return h;
});
await s.setViewportSize({ width: 390, height: hoehe + 150 });
await s.waitForTimeout(300);
await s.screenshot({ path: ZIEL, type: "jpeg", quality: 74, fullPage: true });
console.log("Bild:", ZIEL, "Höhe", hoehe);
await browser.close();
