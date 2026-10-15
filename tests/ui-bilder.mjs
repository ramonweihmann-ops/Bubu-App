// Bilder für Quests und Belohnungen — auf dem Schirm, zu zweit.
//
// Der Stift sitzt oben neben dem Plus. Er schaltet in den Bearbeiten-Modus;
// eine Quest antippen öffnet das Menü mit „Bild ändern“. Rechts stehen die
// Cleanies, der Stern schwach dahinter. Belohnungen tragen oben ein Bild,
// darunter die Schrift, und ein Symbol statt des Herzens. Was einer wählt,
// sehen alle — ohne Abstimmung.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 300)}“`}`);
};

const HAUS = "(select couple_id from members where user_id = 'u-a')";
sql(`update quests set icon = null, farbe = null where couple_id = ${HAUS}`);
sql(`update rewards set icon = null, bild = null where couple_id = ${HAUS}`);
sql("delete from bilder; delete from ereignisse; delete from aktionen");

const FUCHS = { name: "fuchs.webp", mimeType: "image/webp", buffer: readFileSync("/workspace/bubu-app/web/fox.webp") };
const WOLF = { name: "wolf.webp", mimeType: "image/webp", buffer: readFileSync("/workspace/bubu-app/web/wolf.webp") };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "de-DE" });
  await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
      console.log("  FEHL console: " + m.text()); fehler++;
    }
  });
  return s;
}
const momenteWeg = async (s) => {
  for (let i = 0; i < 10 && (await s.locator("#celebrate[data-open]").count()); i++) {
    await s.click("#celebrate [data-schliessen]"); await s.waitForTimeout(300);
  }
};
const laden = async (s, reiter) => {
  await s.goto(URL, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 12000 });
  await momenteWeg(s);
  if (reiter) { await s.click(`.navbar [data-go="${reiter}"]`); await s.waitForTimeout(300); }
};
const zustand = (s) => s.evaluate(async () => (await fetch("/api/state")).json());
const schliessen = (s) => s.click("#scrim", { position: { x: 10, y: 10 } });
const zeile = (s, name) => s.locator(".zeile .questzeile", { hasText: name });
const box = (s, name) => s.locator(".bildbox", { hasText: name });

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");

console.log("== Die Questseite: Symbol links, Cleanies rechts, der Stift oben");
await laden(a, "quests");
const offenVorher = (await zustand(a)).abstimmungen.filter((x) => x.status === "offen").length;
const zeilen = await a.locator(".zeile .questzeile").count();
pruefe("Jede Quest hat ein Symbol", await a.locator(".zeile .questzeile .symbolkachel").count(), zeilen);
pruefe("Und rechts die Cleanies", await a.locator(".zeile .questzeile .wert").count(), zeilen);
pruefe("Kein Stift mehr in den Zeilen", await a.locator(".zeile .stiftbtn").count(), 0);
pruefe("Der Stift steht oben neben dem Plus",
  await a.evaluate(() => document.querySelector('.appbar [data-bearbeiten="quests"]')?.nextElementSibling?.dataset.sheet), "neu");
pruefe("Der Stern hängt schwach dahinter", await a.locator(".questzeile .wert").first().evaluate((w) => {
  const s = getComputedStyle(w, "::before");
  return s.backgroundImage.includes("cleanie.webp") && Number(s.opacity) < 0.3;
}), true);
enthaelt("Ein Vorschlag aus dem Namen", await zeile(a, "Staubsaugen").locator(".symbolkachel").innerText(), "🧹");
enthaelt("Und aus dem Raum, wo der Name nichts sagt", await zeile(a, "Gäste-WC").locator(".symbolkachel").innerText(), "🚽");
await a.screenshot({ path: `${AUS}/bi1-quests.png` });

console.log("== Ohne Stift meldet das Antippen");
await zeile(a, "Staubsaugen").click();
pruefe("Das Melde-Blatt", (await a.locator(".sheet h3").innerText()).trim(), "Erledigt melden");
pruefe("Mit dem Symbol", await a.locator(".sheet .symbolkachel").count(), 1);
await schliessen(a);

console.log("== Mit Stift: Quest antippen, Bild ändern");
await a.click('[data-bearbeiten="quests"]');
pruefe("Aus dem Stift wird Fertig", (await a.locator('[data-bearbeiten="quests"]').innerText()).trim(), "Fertig");
enthaelt("Die Frage steht oben", await a.locator(".bearbeiten-hinweis").innerText(), "Welche Quest willst du anpassen?");
await zeile(a, "Staubsaugen").click();
const menue = await a.locator(".sheet").innerText();
enthaelt("Das Menü bietet Bild ändern", menue, "Bild ändern");
enthaelt("… und das Bisherige", menue, "Cleanies-Wert ändern");
enthaelt("… mit Abstimmung", menue, "Abstimmung");
enthaelt("Bild ändern geht sofort", await a.locator(".sheet [data-symbol]").innerText(), "sofort");
await a.click(".sheet [data-symbol]");
await a.click('[data-symkat="Küche"]');
await a.click('[data-emoji="🧊"]');
await a.click('[data-symfarbe="lila"]');
enthaelt("Die Vorschau zieht mit", await a.locator(".sheet .bildvorschau").innerText(), "🧊");
pruefe("Mit der neuen Farbe", await a.locator(".sheet .bildvorschau .symbolkachel").getAttribute("data-farbe"), "lila");
await a.screenshot({ path: `${AUS}/bi2-waehler.png` });
await a.click("[data-bild-ok]");
await a.waitForTimeout(500);
enthaelt("Geändert", await a.locator("#toast").innerText(), "gilt sofort für alle");
enthaelt("Die Zeile zeigt das neue Symbol", await zeile(a, "Staubsaugen").locator(".symbolkachel").innerText(), "🧊");
pruefe("Auf lila", await zeile(a, "Staubsaugen").locator(".symbolkachel").getAttribute("data-farbe"), "lila");
const q = (await zustand(a)).quests.find((x) => x.name.startsWith("Staubsaugen"));
pruefe("Gespeichert", `${q.icon} ${q.farbe}`, "🧊 lila");
pruefe("Keine Abstimmung dafür", (await zustand(a)).abstimmungen.filter((x) => x.status === "offen").length, offenVorher);

console.log("== Ein eigenes Bild als Symbol");
await zeile(a, "Staubsaugen").click();
await a.click(".sheet [data-symbol]");
await a.setInputFiles("#symbolfeld", FUCHS);
await a.waitForSelector(".sheet .bildvorschau img");
await a.click("[data-bild-ok]");
await a.waitForTimeout(600);
const bildQuelle = await zeile(a, "Staubsaugen").locator(".symbolkachel img").getAttribute("src");
pruefe("Das Bild kommt vom Server", String(bildQuelle).startsWith("/api/bild/"), true);
pruefe("Und ist geladen", await zeile(a, "Staubsaugen").locator(".symbolkachel img").evaluate((i) => i.complete && i.naturalWidth > 0), true);

console.log("== Fertig: wieder melden");
await a.click('[data-bearbeiten="quests"]');
pruefe("Die Frage ist weg", await a.locator(".bearbeiten-hinweis").count(), 0);
await zeile(a, "Gäste-WC").click();
pruefe("Antippen meldet wieder", (await a.locator(".sheet h3").innerText()).trim(), "Erledigt melden");
await schliessen(a);

console.log("== B sieht dasselbe Bild");
await laden(b, "quests");
pruefe("Das eigene Bild auch bei B", await zeile(b, "Staubsaugen").locator(".symbolkachel img").count(), 1);

console.log("== Belohnungen: Bild oben, Schrift darunter, Symbol statt Herz");
await laden(a, "belohnungen");
pruefe("Jede Belohnung als Bildbox", await a.locator("#liste .bildbox").count(), (await zustand(a)).belohnungen.filter((x) => !x.event_id).length);
pruefe("Film hat ein Motiv vorgeschlagen", await box(a, "Film").locator(".motiv").count(), 1);
enthaelt("Und ein passendes Symbol", await box(a, "Film").locator(".rico").innerText(), "🎬");
pruefe("Die Schrift steht nicht auf dem Bild", await box(a, "Film").evaluate((k) => {
  const bild = k.querySelector(".bildteil").getBoundingClientRect();
  const name = k.querySelector(".n").getBoundingClientRect();
  return name.top >= bild.bottom;
}), true);
await a.screenshot({ path: `${AUS}/bi3-belohnungen.png` });

console.log("== Hintergrund wählen");
await a.click('[data-bearbeiten="belohnungen"]');
await box(a, "Veto").click();
const rmenue = await a.locator(".sheet").innerText();
enthaelt("Hintergrundbild ändern", rmenue, "Hintergrundbild ändern");
enthaelt("Symbol ändern", rmenue, "Symbol ändern");
enthaelt("Kosten ändern bleibt", rmenue, "Kosten ändern");
await a.click(".sheet [data-hintergrund]");
await a.click('[data-motiv="suess"]');
pruefe("Die Probe zeigt das Motiv", await a.locator(".sheet .probe .motiv").count(), 1);
await a.screenshot({ path: `${AUS}/bi4-hintergrund.png` });
await a.click("[data-bild-ok]");
await a.waitForTimeout(500);
pruefe("Die Box hat das Motiv", await box(a, "Veto").locator(".motiv").count(), 1);
pruefe("Gespeichert", (await zustand(a)).belohnungen.find((x) => x.name.startsWith("Veto")).bild, "motiv:suess");

console.log("== Symbol statt Herz");
await box(a, "Veto").click();
await a.click(".sheet [data-symbol]");
await a.click('[data-emoji="💅"]');
await a.click("[data-bild-ok]");
await a.waitForTimeout(500);
enthaelt("Das neue Symbol", await box(a, "Veto").locator(".rico").innerText(), "💅");

console.log("== Ein eigenes Foto");
await box(a, "Veto").click();
await a.click(".sheet [data-hintergrund]");
await a.setInputFiles("#hintergrundfeld", WOLF);
await a.waitForSelector(".sheet .probe .motiv img");
await a.click("[data-bild-ok]");
await a.waitForTimeout(600);
const foto = box(a, "Veto").locator(".motiv img");
pruefe("Das Foto kommt vom Server", String(await foto.getAttribute("src")).startsWith("/api/bild/"), true);
pruefe("Und ist geladen", await foto.evaluate((i) => i.complete && i.naturalWidth > 0), true);

console.log("== Bewusst ohne Bild");
await box(a, "Film").click();
await a.click(".sheet [data-hintergrund]");
await a.click("[data-bild-ohne]");
await a.click("[data-bild-ok]");
await a.waitForTimeout(500);
pruefe("Film hat kein Bild mehr", await box(a, "Film").locator(".motiv").count(), 0);
pruefe("Und der Vorschlag kommt nicht wieder", (await zustand(a)).belohnungen.find((x) => x.name.startsWith("Film")).bild, "ohne");

console.log("== Fertig: antippen beantragt wieder");
await a.click('[data-bearbeiten="belohnungen"]');
await box(a, "Film").click();
pruefe("Das Antragsblatt", await a.locator('.sheet [data-senden="antrag"]').count(), 1);
await schliessen(a);
await a.screenshot({ path: `${AUS}/bi5-belohnungen-fertig.png` });
pruefe("Kein „Punkte“", /\bPunkte\b/.test(await a.locator("body").innerText()), false);

console.log("== Dunkel");
await b.emulateMedia({ colorScheme: "dark" });
await laden(b, "belohnungen");
await b.screenshot({ path: `${AUS}/bi6-dunkel.png` });
pruefe("B sieht das Foto", await box(b, "Veto").locator(".motiv img").count(), 1);

// Aufräumen: Vorschläge statt eigener Wahl, keine Bilder.
sql(`update quests set icon = null, farbe = null where couple_id = ${HAUS}`);
sql(`update rewards set icon = null, bild = null where couple_id = ${HAUS}`);
sql("delete from bilder");

console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
await browser.close();
process.exit(fehler ? 1 : 0);
