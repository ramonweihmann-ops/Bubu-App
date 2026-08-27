import { chromium } from "playwright";

const AUS = process.env.HQ_BILDER || "/tmp";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 780 },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true
});
await ctx.addCookies([{ name: "hq_sitzung", value: "tok-ramon", domain: "127.0.0.1", path: "/" }]);
const seite = await ctx.newPage();
const fehler = [];
seite.on("pageerror", (e) => fehler.push("pageerror: " + e.message));
seite.on("console", (m) => { if (m.type() === "error") fehler.push("console: " + m.text()); });

const pruefe = (name, ist, soll) =>
  console.log(`${ist === soll ? "  ok  " : "  FEHL"} ${name}: ${JSON.stringify(ist)}${ist === soll ? "" : " soll=" + JSON.stringify(soll)}`);

// Liegengebliebene Vollbild-Momente wegklicken, sonst fängt sie jeden Klick ab.
async function momenteWeg() {
  for (let i = 0; i < 6; i++) {
    if (!(await seite.locator("#celebrate[data-open]").count())) return;
    await seite.click("#celebrate [data-schliessen]");
    await seite.waitForTimeout(400);
  }
}

await seite.goto("http://127.0.0.1:8792/app/", { waitUntil: "networkidle" });
await seite.waitForSelector(".navbar", { timeout: 8000 });
await momenteWeg();

console.log("== Start, hell");
pruefe("Thema", await seite.evaluate(() => document.documentElement.dataset.theme), "hell");
pruefe("Zahnrad vorhanden", await seite.locator('[data-go="einstellungen"]').count(), 1);
pruefe("Verlauf vorhanden", await seite.locator('.appbar [data-go="verlauf"]').count(), 1);
pruefe("Reiter Start aktiv", await seite.locator('.navbar [aria-current="true"]').innerText(), "Start");
await seite.screenshot({ path: `${AUS}/01-start-hell.png` });

// Leiste sichtbar, auch ganz unten im Inhalt
await seite.evaluate(() => { document.querySelector(".body").scrollTop = 99999; });
await seite.waitForTimeout(250);
const leiste = await seite.evaluate(() => {
  const r = document.querySelector(".navbar").getBoundingClientRect();
  return { unten: Math.round(r.bottom), fenster: window.innerHeight, sichtbar: r.top < window.innerHeight && r.bottom > 0 };
});
console.log("== Fußleiste nach dem Scrollen bis zum Ende");
pruefe("sichtbar", leiste.sichtbar, true);
pruefe("sitzt am unteren Rand", leiste.unten, leiste.fenster);

// letzte Karte im Inhalt darf nicht unter der Leiste liegen
const frei = await seite.evaluate(() => {
  const body = document.querySelector(".body");
  const letzte = body.lastElementChild.getBoundingClientRect();
  const nav = document.querySelector(".navbar").getBoundingClientRect();
  return Math.round(nav.top - letzte.bottom);
});
console.log(`  ok   Abstand letzte Karte → Leiste: ${frei}px${frei >= 0 ? "" : "  FEHL (verdeckt)"}`);

console.log("== Einstellungen");
await seite.click('[data-go="einstellungen"]');
await seite.waitForSelector("#name-feld");
pruefe("Leiste weiterhin da", await seite.locator(".navbar").isVisible(), true);
pruefe("Reiter Start bleibt aktiv", await seite.locator('.navbar [aria-current="true"]').innerText(), "Start");
pruefe("Name im Feld", await seite.inputValue("#name-feld"), (await seite.locator(".card .grow, .card span[style*='font-weight:700']").first().innerText()).trim() || await seite.inputValue("#name-feld"));
await seite.screenshot({ path: `${AUS}/02-einstellungen-hell.png`, fullPage: true });

console.log("== Auf Dunkel schalten");
await seite.click('[data-thema="dunkel"]');
await seite.waitForTimeout(250);
pruefe("Thema", await seite.evaluate(() => document.documentElement.dataset.theme), "dunkel");
pruefe("Gemerkt", await seite.evaluate(() => localStorage.getItem("hq-thema")), "dunkel");
pruefe("Seitenfarbe", await seite.evaluate(() => document.querySelector('meta[name="theme-color"]').content), "#0f1c31");
pruefe("Hintergrund", await seite.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(15, 28, 49)");
await seite.screenshot({ path: `${AUS}/03-einstellungen-dunkel.png`, fullPage: true });

console.log("== Namen ändern");
await seite.fill("#name-feld", "Ramon");
await seite.click('[data-senden="name"]');
await seite.waitForTimeout(900);
pruefe("Feld übernommen", await seite.inputValue("#name-feld"), "Ramon");

console.log("== Dunkel auf allen Schirmen");
await seite.click('[data-go="start"]');
await seite.waitForSelector(".accounts");
pruefe("Begrüßung", (await seite.locator(".appbar .title").innerText()).trim(), "Hallo Ramon");
await seite.screenshot({ path: `${AUS}/04-start-dunkel.png` });

for (const [reiter, datei] of [["quests", "05-quests-dunkel"], ["belohnungen", "06-belohnungen-dunkel"], ["wir", "07-wir-dunkel"]]) {
  await seite.click(`.navbar [data-go="${reiter}"]`);
  await seite.waitForTimeout(350);
  await seite.screenshot({ path: `${AUS}/${datei}.png` });
}

console.log("== Nach Neuladen bleibt es dunkel (ohne Aufblitzen)");
await seite.goto("http://127.0.0.1:8792/app/", { waitUntil: "domcontentloaded" });
pruefe("Thema direkt nach dem Laden", await seite.evaluate(() => document.documentElement.dataset.theme), "dunkel");

console.log("== Zurück auf System");
await seite.waitForSelector(".navbar");
await seite.click('[data-go="einstellungen"]');
await seite.waitForSelector('[data-thema="system"]');
await seite.click('[data-thema="system"]');
await seite.waitForTimeout(200);
pruefe("Thema", await seite.evaluate(() => document.documentElement.dataset.theme), "hell");

console.log(fehler.length ? "\nMeldungen aus dem Browser:\n" + fehler.join("\n") : "\nKeine Fehler im Browser.");
await browser.close();
