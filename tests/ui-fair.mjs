// Der Fair-Bericht auf dem Schirm: vom Blatt „Diese Woche" hinein, Zeitraum
// und Blättern, Säule antippen, Tabellen, das Soll zur Abstimmung, die Kinder,
// Export als Tabelle und als PDF, der Rückblick in Karten — und ohne Plus das
// Schloss mit dem Test. Hell, dunkel, 375 Pixel.
//
// Braucht den Haushalt aus fair-api.sh (Anna, Ben, Lena). Legt dazu einen
// Verlauf von fünf Monaten an — immer derselbe, damit die Bilder vergleichbar sind.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const AUS = process.env.HQ_BILDER || "/tmp";
const ZIEL = "http://127.0.0.1:8792";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);
const sqlDatei = (pfad) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --file "${pfad}" > /dev/null 2>&1`);

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

async function api(token, pfad, daten, nochmal = true) {
  try {
    const antwort = await fetch(`${ZIEL}/api/${pfad}`, {
      method: daten ? "POST" : "GET",
      headers: { Cookie: `hq_sitzung=${token}`, ...(daten ? { "Content-Type": "application/json" } : {}) },
      body: daten ? JSON.stringify(daten) : undefined
    });
    return await antwort.json();
  } catch (f) {
    if (nochmal) return api(token, pfad, daten, false);
    throw f;
  }
}

console.log("== Aufräumen und fünf Monate Verlauf anlegen");
let st = await api("tok-wa", "state");
const paar = (await api("tok-wa", "fair?zeitraum=woche")).personen ? true : false;
pruefe("Annas Haushalt ist da", paar, true);
const PAAR = `(select couple_id from members where user_id = 'u-wa')`;
sql(`delete from ledger where id like 'seed-fair-%'`);
sql(`delete from claims where id like 'seed-fair-%'`);
sql(`update proposals set status = 'abgelehnt' where couple_id = ${PAAR} and status = 'offen'`);
sql(`update couples set fair_soll = null, fair_soll_von = null, plus = 1, plus_test_bis = null, created_at = datetime('now', '-400 days') where id = ${PAAR}`);
sql(`delete from ereignisse where user_id in ('u-wa','u-wb')`);

// Immer dieselben Zufallszahlen: Anna eher Küche, Ben eher Bad und Wohnen.
let saat = 7;
const zufall = () => { saat = (saat + 0x6D2B79F5) | 0; let t = Math.imul(saat ^ (saat >>> 15), 1 | saat); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const quests = st.quests.filter((q) => !q.event_id && q.fuer !== "kinder");
const nachRaum = (raum) => quests.filter((q) => q.category === raum);
const vorlieben = { "u-wa": ["Küche", "Küche", "Küche", "Wohnen", "Fenster", "Sonstiges"], "u-wb": ["Bad", "Bad", "Wohnen", "Wohnen", "Küche", "Sonstiges"] };
const zeilen = [];
let n = 0;
for (let tag = 1; tag <= 150; tag++) {
  for (const wer of ["u-wa", "u-wb"]) {
    const anzahl = Math.floor(zufall() * (wer === "u-wa" ? 3.4 : 2.9));
    for (let i = 0; i < anzahl; i++) {
      const raum = vorlieben[wer][Math.floor(zufall() * 6)];
      const liste = nachRaum(raum).length ? nachRaum(raum) : quests;
      const q = liste[Math.floor(zufall() * liste.length)];
      const stunde = 8 + Math.floor(zufall() * 12);
      const zeit = `datetime('now', 'start of day', '-${tag} days', '+${stunde} hours')`;
      const anderer = wer === "u-wa" ? "u-wb" : "u-wa";
      n++;
      zeilen.push(`insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, status, decided_by, decided_at, created_at) values ('seed-fair-${n}', ${PAAR}, '${q.id}', '${wer}', 1, ${q.points}, 'bestaetigt', '${anderer}', ${zeit}, ${zeit});`);
      zeilen.push(`insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id, created_at) values ('seed-fair-l${n}', ${PAAR}, '${wer}', ${q.points}, '${q.name.replace(/'/g, "''")}', 'claim', 'seed-fair-${n}', ${zeit});`);
    }
  }
}
writeFileSync(`${AUS}/fair-saat.sql`, zeilen.join("\n"));
sqlDatei(`${AUS}/fair-saat.sql`);
const monat = await api("tok-wa", `fair?zeitraum=monat&versatz=${120}`);
pruefe("Der Verlauf ist da", monat.waage.gesamt > 50, true);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token, { dunkel = false, breite = 390, zeit = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: 844 }, deviceScaleFactor: 2, locale: "de-DE",
    timezoneId: "Europe/Berlin", colorScheme: dunkel ? "dark" : "light", acceptDownloads: true });
  await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  if (zeit) await s.clock.setFixedTime(zeit);
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
      console.log("  FEHL console: " + m.text()); fehler++;
    }
  });
  return s;
}
const ueberlauf = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
  || [...document.querySelectorAll(".body, .card")].some((e) => e.scrollWidth > e.clientWidth + 1));
const toastLeeren = (s) => s.evaluate(() => document.getElementById("toast").removeAttribute("data-open"));
const toastText = async (s) => { await s.waitForSelector("#toast[data-open]"); return s.locator("#toast").innerText(); };
const jubelWeg = async (s) => {
  if (await s.locator("#celebrate[data-open]").count()) await s.click("#celebrate [data-schliessen]");
};
const text = async (l) => (await l.innerText()).replace(/\s+/g, " ").trim();
const versatz = (s) => s.evaluate(() => -new Date().getTimezoneOffset());
/** Warten, bis der Bericht für diesen Zeitraum da ist. */
const berichtDa = (s, zeitraum) => s.waitForSelector(`.body.fair[data-fair-zeitraum-ist="${zeitraum}"]`);

const anna = await seiteFuer("tok-wa");
await anna.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await anna.evaluate(() => { try { localStorage.removeItem("hq-fair-zeitraum"); } catch {} });
await anna.reload({ waitUntil: "networkidle" });
await jubelWeg(anna);
const V = await versatz(anna);

console.log("== Vom Blatt „Diese Woche“ in den Bericht");
await anna.click("[data-woche]");
await anna.click('.sheet [data-go="fair"]');
await berichtDa(anna, "monat");
pruefe("Der Bericht", await text(anna.locator(".appbar .title")), "Fair-Bericht");
let f = await api("tok-wa", `fair?zeitraum=monat&versatz=${V}`);
enthaelt("Der Monat im Kopf", await text(anna.locator(".appbar .sub")), `${f.titel} · Anna und Ben`);
const a = Math.round(f.waage.je["u-wa"] / f.waage.gesamt * 100);
pruefe("Die Waage wie gerechnet", (await text(anna.locator("[data-fair-anteil]"))).replace(/\s/g, ""), `${a}:${100 - a}`);
enthaelt("Annas Cleanies", await text(anna.locator(".fair-enden")), `Anna ${f.waage.je["u-wa"]}`);
enthaelt("fair: 50 : 50", await text(anna.locator("[data-fair-soll-text]")), "fair: 50 : 50");
pruefe("Ein Urteil", ["gut", "leicht", "schief"].includes(await anna.locator(".fair-urteil").getAttribute("data-u")), true);
pruefe("Säulen je Woche", await anna.locator(".fair-saeulen rect.ziel").count(), f.faecher.length);
pruefe("Räume wie gerechnet", await anna.locator("[data-fair-raum]").count(), f.raeume.length);
pruefe("Küche ganz oben", await anna.locator("[data-fair-raum]").first().getAttribute("data-fair-raum"), f.raeume[0].name);
pruefe("Vier Zeilen, die man nicht sieht", await anna.locator("[data-fair-unsichtbar]").count(), 4);
enthaelt("Bestätigt wie gerechnet", await text(anna.locator('[data-fair-unsichtbar="bestaetigt"]')),
  `${f.unsichtbar.bestaetigt["u-wa"]} ${f.unsichtbar.bestaetigt["u-wb"]}`);
enthaelt("Lena steht daneben", await text(anna.locator("[data-fair-kinder]")), "Lena");
enthaelt("… nicht in der Waage", await text(anna.locator("[data-fair-kinder]")), "nicht in der Waage");
pruefe("Kein „Punkte“", /Punkte/.test(await anna.locator(".body").innerText()), false);
pruefe("Nichts läuft über", await ueberlauf(anna), false);
await anna.screenshot({ path: `${AUS}/uff1-bericht.png` });
await anna.screenshot({ path: `${AUS}/uff1-bericht-ganz.png`, fullPage: false });

console.log("== Eine Säule antippen");
const volle = f.faecher.findIndex((x) => !x.zukunft && (x.je["u-wa"] + x.je["u-wb"]));
await anna.click(`.fair-saeulen [data-fair-fach="${volle}"]`);
enthaelt("Die Zahlen der Woche", await text(anna.locator("#fair-hinweis")), `${f.faecher[volle].lang} — Anna ${f.faecher[volle].je["u-wa"]}`);
pruefe("Die anderen treten zurück", await anna.locator(".fair-saeulen .saeule[data-aus]").count(),
  f.faecher.filter((x) => !x.zukunft && (x.je["u-wa"] + x.je["u-wb"])).length - 1);
await anna.click("details.tabelle summary");
pruefe("Die Tabelle: eine Zeile je Woche mit Cleanies", await anna.locator("details.tabelle tbody tr").count(),
  f.faecher.filter((x) => !x.zukunft && (x.je["u-wa"] + x.je["u-wb"])).length);

console.log("== Zeitraum und Blättern");
await anna.click('[data-fair-zeitraum="woche"]');
await berichtDa(anna, "woche");
enthaelt("Diese Woche", await text(anna.locator(".appbar .sub")), "Diese Woche");
pruefe("Sieben Tage", await anna.locator(".fair-saeulen rect.ziel").count(), 7);
pruefe("Später geht nicht", await anna.locator('[data-fair-blaettern="-1"]').isDisabled(), true);
await anna.click('[data-fair-blaettern="1"]');
await anna.waitForFunction(() => document.querySelector("[data-fair-titel]")?.textContent === "Letzte Woche");
pruefe("Zurückgeblättert", await text(anna.locator("[data-fair-titel]")), "Letzte Woche");
pruefe("Jetzt geht es wieder vor", await anna.locator('[data-fair-blaettern="-1"]').isDisabled(), false);
const lw = await api("tok-wa", `fair?zeitraum=woche&zurueck=1&versatz=${V}`);
const la = Math.round(lw.waage.je["u-wa"] / lw.waage.gesamt * 100);
pruefe("Die Waage der letzten Woche", (await text(anna.locator("[data-fair-anteil]"))).replace(/\s/g, ""), `${la}:${100 - la}`);
await anna.click('[data-fair-zeitraum="jahr"]');
await berichtDa(anna, "jahr");
pruefe("Jahr: zwölf Monate", await anna.locator(".fair-saeulen rect.ziel").count(), 12);
pruefe("Zurück auf heute", await text(anna.locator("[data-fair-titel]")), "Letzte 12 Monate");
await anna.screenshot({ path: `${AUS}/uff2-jahr.png` });
await anna.click('[data-fair-zeitraum="quartal"]');
await berichtDa(anna, "quartal");
pruefe("13 Wochen", await anna.locator(".fair-saeulen rect.ziel").count(), 13);
pruefe("Der Zeitraum bleibt gemerkt", await anna.evaluate(() => localStorage.getItem("hq-fair-zeitraum")), "quartal");
await anna.click('[data-fair-zeitraum="monat"]');
await berichtDa(anna, "monat");

console.log("== Was fair heißt: Anna schlägt 60 : 40 vor");
await anna.click("[data-fair-soll]");
await anna.waitForSelector("#fairsoll");
pruefe("Heute 50 : 50", await text(anna.locator("#fairsoll")), "50 : 50");
await anna.click('[data-fair-soll-schritt="5"]');
await anna.click('[data-fair-soll-schritt="5"]');
pruefe("Zweimal mehr", await text(anna.locator("#fairsoll")), "60 : 40");
await anna.fill("#grund", "Ben arbeitet gerade mehr");
await anna.screenshot({ path: `${AUS}/uff3-soll.png` });
await toastLeeren(anna);
await anna.click("[data-fair-soll-ok]");
enthaelt("Steht zur Abstimmung", await toastText(anna), "Steht zur Abstimmung");
await anna.waitForSelector('.fair-sollzeile[data-go="wir"]');
enthaelt("Die Waage sagt es", await text(anna.locator(".fair-sollzeile")), "Abstimmung läuft: Anna 60 : Ben 40");

const ben = await seiteFuer("tok-wb");
await ben.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await jubelWeg(ben);
await ben.click('.navbar [data-go="wir"]');
const karte = ben.locator(".card", { hasText: "daran misst die Waage" }).first();
enthaelt("Bei Ben unter Wir", await text(karte), "50 : 50");
enthaelt("… mit dem neuen Soll", await text(karte), "60 : 40");
enthaelt("… und wessen Anteil", await text(karte), "Anna : Du");
await ben.screenshot({ path: `${AUS}/uff4-abstimmung.png` });
const vorschlag = (await api("tok-wb", "state")).abstimmungen.find((x) => x.art === "fair_soll" && x.status === "offen");
await api("tok-wb", `proposals/${vorschlag.id}/vote`, { antwort: true });
await ben.context().close();
await anna.click('.fair-sollzeile[data-go="wir"]');
await anna.click('.navbar [data-go="start"]');
await anna.click("[data-woche]");
await anna.click('.sheet [data-go="fair"]');
await berichtDa(anna, "monat");
enthaelt("Jetzt gilt 60 : 40", await text(anna.locator("[data-fair-soll-text]")), "fair: 60 : 40");
f = await api("tok-wa", `fair?zeitraum=monat&versatz=${V}`);
const urteil = Math.abs(a - 60) <= 5 ? "gut" : Math.abs(a - 60) <= 12 ? "leicht" : "schief";
pruefe("Das Urteil misst am neuen Soll", await anna.locator(".fair-urteil").getAttribute("data-u"), urteil);
pruefe("Der Strich steht bei 60", await anna.locator(".fair-balken .fair-sollstrich").evaluate((e) => e.style.left), "60%");

console.log("== Export");
const [download] = await Promise.all([anna.waitForEvent("download"), anna.click("[data-fair-csv]")]);
const datei = `${AUS}/fair-export.csv`;
await download.saveAs(datei);
const csv = readFileSync(datei, "utf8");
enthaelt("Die Tabelle hat den Titel", csv, `"Homi Point Fair-Bericht";"${f.titel}"`);
enthaelt("… beide Namen", csv, `"Abschnitt";"Anna";"Ben"`);
enthaelt("… die Summe", csv, `"Zusammen";"${f.waage.je["u-wa"]}";"${f.waage.je["u-wb"]}"`);
enthaelt("… das Soll", csv, `"Fair heißt in %";"60";"40"`);
enthaelt("… und Lena", csv, `"Lena"`);
pruefe("Mit BOM für Excel", csv.charCodeAt(0), 0xfeff);
await anna.emulateMedia({ media: "print" });
pruefe("Gedruckt ohne Leiste", await anna.locator(".navbar").isVisible(), false);
pruefe("… ohne Zeitraum-Knöpfe", await anna.locator(".fair-zeitraum").isVisible(), false);
pruefe("… und nichts abgeschnitten", await anna.locator(".body").evaluate((e) => getComputedStyle(e).overflowY), "visible");
await anna.pdf({ path: `${AUS}/fair-bericht.pdf`, format: "A4", printBackground: true });
await anna.emulateMedia({ media: "screen" });

console.log("== Der Rückblick in Karten");
await anna.click("[data-fair-rueckblick]");
await anna.waitForSelector("#rueckblick .rb-karte");
const rb = await api("tok-wa", `fair?zeitraum=monat&zurueck=1&versatz=${V}`);
enthaelt("Der Vormonat", await text(anna.locator("#rueckblick .rb-kopf")), rb.titel);
enthaelt("Erste Karte: alle Cleanies", await text(anna.locator("#rueckblick .rb-karte")), String(rb.waage.gesamt));
const karten = await anna.locator("#rueckblick .rb-punkte i").count();
pruefe("Mehrere Karten", karten >= 5, true);
await anna.screenshot({ path: `${AUS}/uff5-rueckblick.png` });
await anna.click("#rueckblick [data-rb-weiter]");
pruefe("Tippen blättert", await anna.locator("#rueckblick .rb-punkte i.an").count(), 2);
enthaelt("Karte 2: die Waage", await text(anna.locator("#rueckblick .rb-karte")), "fair heißt bei euch 60 : 40");
await anna.keyboard.press("Enter");
pruefe("Enter blättert auch", await anna.locator("#rueckblick .rb-punkte i.an").count(), 3);
for (let i = 3; i < karten; i++) await anna.click("#rueckblick [data-rb-weiter]");
enthaelt("Am Ende", await text(anna.locator("#rueckblick .rb-karte")), "Das war's.");
pruefe("… teilen", await anna.locator("#rueckblick [data-rb-teilen]").count(), 1);
pruefe("Kein „Punkte“", /Punkte/.test(await anna.locator("#rueckblick").innerText()), false);
await anna.screenshot({ path: `${AUS}/uff6-rueckblick-ende.png` });
await anna.keyboard.press("Escape");
pruefe("Escape schließt", await anna.locator("#rueckblick").count(), 0);

console.log("== Anfang November: der Rückblick liegt auf der Startseite");
const nov = await seiteFuer("tok-wa", { zeit: new Date("2026-11-02T09:00:00+01:00") });
await nov.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await nov.evaluate(() => { try { localStorage.removeItem("hq-rueckblick"); } catch {} });
await nov.reload({ waitUntil: "networkidle" });
await jubelWeg(nov);
await nov.waitForSelector(".rueckblick-karte", { timeout: 8000 }).catch(() => {});
pruefe("Die Karte ist da", await nov.locator(".rueckblick-karte").count(), 1);
enthaelt("Der Rückblick ist da", await text(nov.locator(".rueckblick-karte")), "Der Rückblick ist da");
await nov.screenshot({ path: `${AUS}/uff7-start-rueckblick.png` });
await nov.click("[data-rb-weg]");
pruefe("Ausgeblendet", await nov.locator(".rueckblick-karte").count(), 0);
await nov.reload({ waitUntil: "networkidle" });
await jubelWeg(nov);
await nov.waitForTimeout(800);
pruefe("… und bleibt weg", await nov.locator(".rueckblick-karte").count(), 0);
const okt = await seiteFuer("tok-wa", { zeit: new Date("2026-10-19T09:00:00+02:00") });
await okt.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await okt.waitForTimeout(800);
pruefe("Mitten im Monat keine Karte", await okt.locator(".rueckblick-karte").count(), 0);
await nov.context().close();
await okt.context().close();

console.log("== Ohne Plus: die Woche frei, der Rest hinter dem Schloss");
sql(`update couples set plus = 0, plus_test_bis = null where id = ${PAAR}`);
await anna.click('.navbar [data-go="start"]');
await anna.click("[data-woche]");
await anna.click('.sheet [data-go="fair"]');
await berichtDa(anna, "woche");
pruefe("Das Schloss", await anna.locator("[data-fair-schloss]").count(), 1);
pruefe("Die Waage bleibt frei", await anna.locator("[data-fair-waage]").count(), 1);
pruefe("Keine echten Säulen", await anna.locator(".fair-saeulen rect.ziel").count(), 0);
pruefe("Die Attrappe ist nicht erreichbar", await anna.locator(".fair-attrappe[inert][aria-hidden=true]").count(), 1);
pruefe("Monat ist zu", await anna.locator('[data-fair-zeitraum="monat"]').getAttribute("aria-disabled"), "true");
await toastLeeren(anna);
// aria-disabled: angetippt werden darf er trotzdem — dann sagt er, warum nicht.
await anna.click('[data-fair-zeitraum="monat"]', { force: true });
enthaelt("Sagt, warum", await toastText(anna), "mit Plus");
pruefe("Kein Rückblick, kein Export", await anna.locator("[data-fair-rueckblick], [data-fair-csv]").count(), 0);
pruefe("Nichts läuft über", await ueberlauf(anna), false);
await anna.screenshot({ path: `${AUS}/uff8-ohne-plus.png` });
await toastLeeren(anna);
await anna.click("[data-fair-testen]");
enthaelt("Der Test läuft", await toastText(anna), "14 Tage Plus");
await anna.waitForSelector(".fair-saeulen rect.ziel");
pruefe("Das Schloss ist weg", await anna.locator("[data-fair-schloss]").count(), 0);
enthaelt("Bis wann", await text(anna.locator(".fair-fuss")), "Plus zum Testen bis");
sql(`update couples set plus = 1, plus_test_bis = null where id = ${PAAR}`);

console.log("== Dunkel und schmal");
const dunkel = await seiteFuer("tok-wa", { dunkel: true, breite: 375 });
await dunkel.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await jubelWeg(dunkel);
await dunkel.click("[data-woche]");
await dunkel.click('.sheet [data-go="fair"]');
await dunkel.waitForSelector(".body.fair");
pruefe("Dunkel", await dunkel.evaluate(() => document.documentElement.dataset.theme), "dunkel");
pruefe("Die Reihenfarbe fürs Dunkle", await dunkel.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fair-1").trim()), "#4f86e0");
pruefe("375 Pixel: nichts läuft über", await ueberlauf(dunkel), false);
await dunkel.screenshot({ path: `${AUS}/uff9-dunkel.png` });
await dunkel.locator(".body").evaluate((e) => e.scrollTo(0, e.scrollHeight));
await dunkel.screenshot({ path: `${AUS}/uff9-dunkel-unten.png` });

console.log("== Über „Wir“ geht es auch");
await dunkel.click('.navbar [data-go="wir"]');
await dunkel.click('.body [data-go="fair"]');
await dunkel.waitForSelector(".body.fair");
pruefe("Der Bericht", await text(dunkel.locator(".appbar .title")), "Fair-Bericht");
await dunkel.context().close();

console.log("== Allein unter Erwachsenen: kein Vergleich");
// Wim aus fair-api.sh hat noch keinen Haushalt — er gründet einen allein mit Kind.
sql(`delete from couples where id in (select couple_id from members where user_id = 'u-wc')`);
await api("tok-wc", "haushalt/einrichten", { name: "Wim", art: "familie", erwachsene: 1, kinder: 1 });
await api("tok-wc", "kinder", { name: "Pia", tier: "🐼", stufe: "ohne", einwilligung: true });
const allein = await seiteFuer("tok-wc");
await allein.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await jubelWeg(allein);
await allein.click('.navbar [data-go="wir"]');
await allein.click('.body [data-go="fair"]');
await allein.waitForSelector(".body.fair");
enthaelt("Die Waage sagt, warum", await text(allein.locator("[data-fair-waage]")), "Die Waage braucht zwei Erwachsene");
pruefe("Kein Verlauf", await allein.locator(".fair-saeulen").count(), 0);
pruefe("Keine Räume", await allein.locator("[data-fair-raum]").count(), 0);
pruefe("Was man nicht sieht bleibt", await allein.locator("[data-fair-unsichtbar]").count(), 4);

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
