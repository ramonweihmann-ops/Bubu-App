import { chromium } from "playwright";
const AUS = process.env.HQ_BILDER || "/tmp";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};

async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => { if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; } });
  return s;
}
const momenteWeg = async (s) => {
  for (let i = 0; i < 8 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(350);
  }
};

/* ---------------- Einrichtung mit einem frischen Konto ---------------- */
console.log("== Einrichtung von vorn (Konto D)");
const d = await seiteFuer("tok-d");
await d.goto("http://127.0.0.1:8792/app/", { waitUntil: "networkidle" });
await d.waitForSelector("#e-name", { timeout: 8000 });
pruefe("Startet mit dem Namen", await d.locator(".title").innerText(), "Wie sollen wir dich nennen?");

await d.fill("#e-name", "Dana");
await d.click('[data-ebild="★"]');
await d.waitForTimeout(150);
pruefe("Bild gewählt", await d.locator('[data-ebild="★"][data-an]').count(), 1);
await d.screenshot({ path: `${AUS}/e1-name.png` });

await d.click("[data-eweiter]");
await d.waitForTimeout(200);
pruefe("Begrüßung mit Namen", (await d.locator("h1").innerText()).includes("Dana"), true);
pruefe("Weg zum Code vorhanden", await d.locator("[data-ecode]").count(), 1);
await d.screenshot({ path: `${AUS}/e2-begruessung.png` });

await d.click("[data-eweiter]");
await d.waitForSelector("[data-eart]");
await d.click('[data-eart="familie"]');
await d.waitForTimeout(150);
pruefe("Familie: zwei Zähler", await d.locator("[data-ezaehl]").count(), 4);
await d.click('[data-ezaehl="kinder:1"]');
await d.waitForTimeout(120);
await d.screenshot({ path: `${AUS}/e3-haushalt.png` });
await d.click('[data-eart="wg"]');
await d.waitForTimeout(150);
pruefe("WG startet bei drei", await d.locator(".stepper .val").innerText(), "3");

await d.click("[data-eweiter]");
await d.waitForSelector("[data-eraum]");
const vorher = await d.locator("[data-eraum][data-an]").count();
await d.click('[data-eraum="Keller"]');
await d.waitForTimeout(150);
pruefe("Raum dazugewählt", await d.locator("[data-eraum][data-an]").count(), vorher + 1);
await d.screenshot({ path: `${AUS}/e4-raeume.png` });

await d.click("[data-eweiter]");
await d.waitForTimeout(200);
pruefe("Seite „Ordnung finden“", (await d.locator("h1").innerText()).includes("Ordnung finden"), true);
await d.screenshot({ path: `${AUS}/e5-finden.png` });

await d.click("[data-eweiter]");
await d.waitForTimeout(200);
pruefe("Seite „Ordnung konstant erhalten“", await d.locator("h1").innerText(), "Ordnung konstant erhalten");
pruefe("Jahresplan steht im Text", (await d.locator(".mitte p").innerText()).includes("Jahresplan"), true);
await d.screenshot({ path: `${AUS}/e6-erhalten.png` });

await d.click("[data-eweiter]");
await d.waitForTimeout(200);
pruefe("Zusammenfassung", (await d.locator(".mitte p").innerText()).includes("WG · 3 Personen"), true);
await d.screenshot({ path: `${AUS}/e7-starten.png` });

await d.click("[data-eanlegen]");
await d.waitForSelector(".codeanzeige", { timeout: 8000 });
const code = (await d.locator(".codeanzeige").innerText()).trim();
pruefe("Einladecode da", /^\d{6}$/.test(code), true);
pruefe("Zwei freie Plätze", (await d.locator(".rowlink").allInnerTexts()).filter((t) => t.includes("Wartet auf den Code")).length, 2);
await d.screenshot({ path: `${AUS}/e8-einladen.png` });

await d.click('[data-go="start"]');
await d.waitForSelector(".navbar");
await momenteWeg(d);
pruefe("Name in der Begrüßung", await d.locator(".appbar .title").innerText(), "Hallo Dana");
pruefe("Fußleiste da", await d.locator(".navbar").isVisible(), true);
await d.screenshot({ path: `${AUS}/e9-dashboard-allein.png` });

/* ---------------- Zwei treten bei ---------------- */
console.log("\n== Zwei treten über den Code bei");
for (const [token, name] of [["tok-e", "Emil"], ["tok-f", "Fine"]]) {
  const s = await seiteFuer(token);
  await s.goto("http://127.0.0.1:8792/app/", { waitUntil: "networkidle" });
  await s.waitForSelector("#e-name");
  await s.fill("#e-name", name);
  await s.click("[data-eweiter]");
  await s.waitForTimeout(200);
  await s.click("[data-ecode]");
  await s.waitForSelector("#code-eingabe");
  await s.fill("#code-eingabe", code);
  await s.click("[data-paar-beitreten]");
  await s.waitForSelector(".navbar", { timeout: 8000 });
  await momenteWeg(s);
  pruefe(`${name} ist drin`, await s.locator(".navbar").isVisible(), true);
  await s.context().close();
}

await d.reload({ waitUntil: "networkidle" });
await d.waitForSelector(".navbar");
await momenteWeg(d);
pruefe("Drei Konten auf dem Dashboard", await d.locator(".konto").count(), 3);
await d.screenshot({ path: `${AUS}/e10-dashboard-drei.png` });

console.log("\n== Texte in der Mehrzahl");
const quests = await d.locator('.navbar [data-go="quests"]');
await quests.click();
await d.waitForSelector(".zeile");
await d.click(".zeile .rowlink");
await d.waitForSelector(".sheet");
const beschriftungen = await d.locator(".sheet .field label").allInnerTexts();
pruefe("Notiz für die anderen", beschriftungen.includes("NOTIZ FÜR DIE ANDEREN"), true);
const hinweis = await d.locator(".sheet .note").last().innerText();
pruefe("Mehrzahl im Hinweis", hinweis.includes("die anderen bestätigen"), true);
await d.screenshot({ path: `${AUS}/e11-melden-mehrere.png` });
await d.click("#scrim", { position: { x: 10, y: 10 } });

console.log("\n== Raum ändern über den Stift");
await d.waitForTimeout(300);
await d.click(".zeile .stiftbtn");
await d.waitForSelector('[data-sheet="raum"]');
await d.click('[data-sheet="raum"]');
await d.waitForSelector("[data-questraum]");
await d.screenshot({ path: `${AUS}/e12-raumwahl.png` });
await d.click('[data-questraum="Keller"]');
await d.waitForTimeout(900);
pruefe("Quest liegt jetzt im Keller",
  (await d.locator(".zeile .rowlink .m").first().innerText()).startsWith("Keller"), true);

console.log("\n== Einstellungen: Bild, Haushalt, Räume");
await d.click('.navbar [data-go="start"]');
await d.waitForSelector('[data-go="einstellungen"]');
await d.click('[data-go="einstellungen"]');
await d.waitForSelector("#name-feld");
pruefe("Bildwahl da", await d.locator("[data-bildwahl]").count() > 0, true);
pruefe("Haushalt verlinkt", await d.locator('[data-go="haushalt"]').count(), 1);
pruefe("Räume verlinkt", await d.locator('[data-go="raeume"]').count(), 1);
await d.screenshot({ path: `${AUS}/e13-einstellungen.png`, fullPage: true });

await d.click('[data-go="haushalt"]');
await d.waitForSelector("[data-hart]");
pruefe("Haushaltsschirm zeigt drei", (await d.locator(".appbar .sub").innerText()).includes("3 von 3"), true);
await d.screenshot({ path: `${AUS}/e14-haushalt.png` });

await d.click('[data-go="einstellungen"]');
await d.waitForSelector('[data-go="raeume"]');
await d.click('[data-go="raeume"]');
await d.waitForSelector("[data-raum-schalten]");
await d.screenshot({ path: `${AUS}/e15-raeume.png` });

console.log("\n== Abstimmung zu dritt");
await d.click('.navbar [data-go="wir"]');
await d.waitForSelector(".body");
await d.screenshot({ path: `${AUS}/e16-wir.png` });

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
