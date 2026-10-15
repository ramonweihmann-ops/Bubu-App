// Die Startseite, wie sie an einem vollen Tag aussieht — gemessen, nicht geschätzt.
import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
// Ein gängiges Handy: 390 × 844 (iPhone 13/14).
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "de-DE" });
await ctx.addCookies([{ name: "hq_sitzung", value: "tok-a", domain: "127.0.0.1", path: "/" }]);
const s = await ctx.newPage();
await s.goto("http://127.0.0.1:8792/app/", { waitUntil: "networkidle" });
await s.waitForSelector(".navbar");
for (let i = 0; i < 12 && (await s.locator("#celebrate[data-open]").count()); i++) {
  await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(200);
}
await s.waitForTimeout(400);

const mass = await s.evaluate(() => {
  const b = document.querySelector(".body");
  const kinder = [...b.children].filter((e) => e.offsetHeight > 0);
  // Blöcke zählen, die eine eigene Aufforderung tragen: rote Karten, rote Zeilen.
  const rot = kinder.filter((e) => e.classList.contains("alert")
    || getComputedStyle(e).borderColor.includes("236, 15, 6")).length;
  const knoepfe = b.querySelectorAll(".btn.primary").length;
  const bis = (sel) => { const e = b.querySelector(sel); return e ? Math.round(e.offsetTop) : null; };
  return {
    hoehe: b.scrollHeight, fenster: b.clientHeight,
    bloecke: kinder.length, rot, knoepfe,
    abschnitte: [...b.querySelectorAll(".section-label")].map((e) => e.textContent.trim()),
    aktivitaetAb: bis(".feed"),
    feedHoehe: b.querySelector(".feed")?.offsetHeight || 0
  };
});
console.log(JSON.stringify(mass, null, 1));
console.log(`Bildschirmhöhen: ${(mass.hoehe / mass.fenster).toFixed(1)}`);

// Ein Bild in voller Länge, damit man sieht, wie viel da steht.
await s.evaluate(() => {
  const b = document.querySelector(".body");
  document.getElementById("app").style.height = b.scrollHeight + 200 + "px";
  b.style.overflow = "visible";
});
await s.setViewportSize({ width: 390, height: Math.min(mass.hoehe + 160, 6000) });
await s.waitForTimeout(300);
await s.screenshot({ path: `${AUS}/vorher-start.png`, fullPage: true });
await browser.close();
