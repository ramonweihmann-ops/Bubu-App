import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let fehler = 0;

async function seite(thema) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "hq_sitzung", value: "tok-a", domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
      console.log("  FEHL console: " + m.text()); fehler++;
    }
  });
  await s.addInitScript((t) => localStorage.setItem("hq-thema", t), thema);
  await s.goto(URL, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 12000 });
  for (let i = 0; i < 10 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(300);
  }
  return s;
}

for (const [thema, kuerzel] of [["hell", "h"], ["dunkel", "d"]]) {
  const s = await seite(thema);
  await s.screenshot({ path: `${AUS}/cl-${kuerzel}1-start.png` });
  await s.click('.navbar [data-go="quests"]');
  await s.waitForSelector(".zeile .rowlink");
  await s.waitForTimeout(500);
  await s.screenshot({ path: `${AUS}/cl-${kuerzel}2-quests.png` });

  // Der Stern muss wirklich im Chip stecken, nicht nur im Stylesheet.
  const sterne = await s.locator(".pts-pill img.cleanie").count();
  console.log(`  ${sterne > 0 ? "ok  " : "FEHL"} ${thema}: Sterne in Chips: ${sterne}`);
  if (!sterne) fehler++;
  const geladen = await s.evaluate(() => {
    const b = document.querySelector(".pts-pill img.cleanie");
    return b ? b.complete && b.naturalWidth > 0 : false;
  });
  console.log(`  ${geladen ? "ok  " : "FEHL"} ${thema}: Bild geladen: ${geladen}`);
  if (!geladen) fehler++;

  await s.click('.navbar [data-go="belohnungen"]');
  await s.waitForTimeout(600);
  await s.screenshot({ path: `${AUS}/cl-${kuerzel}3-belohnungen.png` });
  await s.click('.navbar [data-go="wir"]');
  await s.waitForTimeout(600);
  await s.screenshot({ path: `${AUS}/cl-${kuerzel}4-wir.png` });

  const wort = await s.evaluate(() => /\bPunkte?\b|Punktwert|Punktestand|Punktekonto/.test(document.body.innerText));
  console.log(`  ${wort ? "FEHL" : "ok  "} ${thema}: kein „Punkte" mehr im Text: ${!wort}`);
  if (wort) fehler++;
}

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
