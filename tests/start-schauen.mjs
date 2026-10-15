// Ein Blick auf die Startseite: Bild und Maße, ohne etwas zu prüfen.
import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";
const wer = process.argv[2] || "tok-a";
const dunkel = process.argv[3] === "dunkel";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "de-DE", colorScheme: dunkel ? "dark" : "light" });
await ctx.addCookies([{ name: "hq_sitzung", value: wer, domain: "127.0.0.1", path: "/" }]);
const s = await ctx.newPage();
s.on("pageerror", (e) => console.log("pageerror:", e.message));
s.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await s.goto("http://127.0.0.1:8792/app/", { waitUntil: "networkidle" });
await s.waitForSelector(".navbar");
for (let i = 0; i < 12 && (await s.locator("#celebrate[data-open]").count()); i++) {
  await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(200);
}
await s.evaluate(() => document.getElementById("toast")?.removeAttribute("data-open"));
await s.waitForTimeout(400);
const m = await s.evaluate(() => { const b = document.querySelector(".body"); return { scroll: b.scrollHeight, sicht: b.clientHeight }; });
console.log(JSON.stringify(m));
await s.screenshot({ path: `${AUS}/start-${wer}${dunkel ? "-dunkel" : ""}.png` });
await browser.close();
