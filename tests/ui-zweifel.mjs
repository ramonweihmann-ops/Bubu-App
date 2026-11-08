// Buchung anzweifeln — über die Oberfläche, zu dritt: B zweifelt im Verlauf
// an, C entscheidet im Stapel, A sieht die Gegenbuchung. Danach eine zweite,
// die „bleibt“. Dazu Handybreite und Dunkel.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const AUS = process.env.HQ_BILDER || "/tmp";
const URL = "http://127.0.0.1:8792/app/";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);
const lies = (s) => JSON.parse(execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "${s}" 2>/dev/null`).toString())[0].results;

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 340)}“`}`);
};

const aufraeumen = () => {
  sql("delete from urlaube; delete from proposal_votes; delete from proposals; delete from bewerbungen; delete from claims; delete from requests; delete from ereignisse; delete from ledger");
  sql("update quests set wiederkehrend = 0, faellig_am = null, tage = null, rhythmus = null, vergabe_runde = null, dran = null, zugewiesen = null, strafe_runde = null, mahnung_runde = null");
};
aufraeumen();
sql("insert into ledger (id, couple_id, member_id, delta, reason, source_type, created_at) select lower(hex(randomblob(8))), couple_id, user_id, 100, 'Testguthaben', 'start', datetime('now','-3 days') from members where user_id in ('u-a','u-b','u-c')");
const PAAR = lies("select couple_id from members where user_id = 'u-a'")[0].couple_id;
// Die Bilder sollen wie der echte Fall aussehen: Bibi, Ramon und „Bad reinigen“
// für 5 Cleanies, zweimal bestätigt, eine Stunde auseinander. Die Namen der
// Test-WG kommen am Ende zurück — auch wenn der Test unterwegs abbricht.
const NAMEN = lies("select id, name from users where id in ('u-a','u-b','u-c')");
const zurueckNamen = () => { for (const n of NAMEN) sql(`update users set name = '${n.name.replace(/'/g, "''")}' where id = '${n.id}'`); };
process.on("exit", zurueckNamen);
sql("update users set name = case id when 'u-a' then 'Bibi' when 'u-b' then 'Ramon' else 'Chris' end where id in ('u-a','u-b','u-c')");
sql(`insert into quests (id, couple_id, name, points, category, wiederkehrend, tage, rhythmus, faellig_am) values ('q-zw-bad', '${PAAR}', 'Bad reinigen', 5, 'Bad', 1, 7, '1× pro Woche', date('now','+5 days')) on conflict(id) do update set active = 1, faellig_am = excluded.faellig_am`);
const Q = { id: "q-zw-bad", name: "Bad reinigen", points: 5 };
for (const [id, std] of [["zw-ui-1", 24], ["zw-ui-2", 23]]) {
  sql(`insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, status, decided_by, decided_at, created_at) values ('${id}', '${PAAR}', '${Q.id}', 'u-a', 1, ${Q.points}, 'bestaetigt', 'u-b', datetime('now','-${std} hours','+20 minutes'), datetime('now','-${std} hours'))`);
  sql(`insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id, created_at) values ('${id}-l', '${PAAR}', 'u-a', ${Q.points}, '${Q.name}', 'claim', '${id}', datetime('now','-${std} hours','+20 minutes'))`);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token, { breite = 390, thema = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: 860 }, deviceScaleFactor: 2, locale: "de-DE", colorScheme: thema });
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
const laden = async (s) => {
  await s.goto(URL, { waitUntil: "networkidle" });
  await s.waitForSelector(".navbar", { timeout: 12000 });
  await momenteWeg(s);
};
const zumVerlauf = async (s) => {
  await laden(s);
  await s.click('.navbar [data-go="wir"]');
  await s.click('.appbar [data-go="verlauf"]');
  await s.waitForSelector(".ledger", { timeout: 8000 });
};
// Auf den Hinweis mit diesem Text warten — davor kann noch ein anderer stehen,
// etwa die Nachricht, dass jemand angezweifelt hat.
const toastText = async (s, teil) => {
  await s.waitForFunction((t) => {
    const el = document.querySelector("#toast[data-open]");
    return el && el.innerText.includes(t);
  }, teil, { timeout: 6000 }).catch(() => {});
  return (await s.locator("#toast").innerText()).trim();
};
const ueberlauf = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
  || [...document.querySelectorAll(".ledger li, .sheet, .karte, .card")].some((e) => e.scrollWidth > e.clientWidth + 1));

const a = await seiteFuer("tok-a");
const b = await seiteFuer("tok-b");
const c = await seiteFuer("tok-c");

console.log("== Im Verlauf: erledigte Quests haben ein ›");
await zumVerlauf(b);
pruefe("Zwei Zeilen antippbar", await b.locator(".ledger li.waehlbar [data-zweifeln]").count(), 2);
pruefe("Das Startguthaben nicht", await b.locator(".ledger li", { hasText: "Testguthaben" }).locator("[data-zweifeln]").count(), 0);
pruefe("Hinweis unter dem Stand", await b.locator("[data-zweifel-hinweis]").count(), 1);
await b.screenshot({ path: `${AUS}/zw1-verlauf.png` });

console.log("== Anzweifeln: Grund ist Pflicht, Notiz nicht");
await b.locator(".ledger li.waehlbar [data-zweifeln]").first().click();
await b.waitForSelector(".sheet [data-zgrund]");
const blatt = await b.locator(".sheet").innerText();
enthaelt("Titel", blatt, "Buchung anzweifeln");
enthaelt("Quest steht drauf", blatt, Q.name);
enthaelt("Gemeldet und bestätigt", blatt, "bestätigt von");
pruefe("Vier Gründe", await b.locator(".sheet [data-zgrund]").count(), 4);
enthaelt("Sagt, wer entscheidet", blatt, "Stimmen eine weitere Person zu, gehen die Cleanies von Bibi zurück");
pruefe("Hinweis zum Haushaltsplan", await b.locator(".sheet [data-zweifel-runde]").count(), 1);
await b.click('[data-senden="zweifel"]');
enthaelt("Ohne Grund geht es nicht", await toastText(b, "Bitte einen Grund wählen"), "Bitte einen Grund wählen");
pruefe("Blatt bleibt offen", await b.locator(".sheet [data-zgrund]").count(), 4);
await b.click('[data-zgrund="doppelt"]');
pruefe("Gewählt", await b.getAttribute('[data-zgrund="doppelt"]', "aria-pressed"), "true");
pruefe("Nur einer", await b.locator('.sheet [data-zgrund][aria-pressed="true"]').count(), 1);
await b.fill("#zwnotiz", "Einmal geputzt, zweimal gebucht");
await b.waitForSelector("#toast:not([data-open])", { state: "attached", timeout: 6000 });
await b.waitForTimeout(300);
await b.screenshot({ path: `${AUS}/zw2-blatt.png` });
await b.click('[data-senden="zweifel"]');
enthaelt("Steht zur Abstimmung", await toastText(b, "Steht zur Abstimmung — eine Stimme fehlt noch"), "Steht zur Abstimmung — eine Stimme fehlt noch");
await b.waitForTimeout(500);
pruefe("Zeile heißt jetzt angezweifelt", await b.locator(".ledger .etikett.zweifel").count(), 1);
pruefe("Nur noch eine antippbar", await b.locator(".ledger li.waehlbar [data-zweifeln]").count(), 1);
pruefe("Fußnote", await b.locator(".feinhinweis").count(), 1);

console.log("== C entscheidet im Stapel");
await laden(c);
await c.waitForSelector('.karte[data-platz="0"]', { timeout: 8000 });
const oben = c.locator('.karte[data-platz="0"]');
const kt = (await oben.innerText()).replace(/\s+/g, " ");
enthaelt("Wer", kt, "Ramon zweifelt eine Buchung an");
enthaelt("Was", kt, "zweifelt eine Buchung an");
enthaelt("Titel", kt, `${Q.name} zurücksetzen`);
enthaelt("Für wen", kt, "für Bibi");
enthaelt("Grund", kt, "Doppelt gezählt — „Einmal geputzt");
enthaelt("Stimmen", kt, "Ja · deine Stimme entscheidet");
pruefe("Knöpfe", (await oben.locator(".knoepfe").innerText()).replace(/\s+/g, " ").trim(), "Bleibt Zurücksetzen");
pruefe("Titel nicht abgeschnitten", await oben.locator(".was").evaluate((e) => e.scrollHeight <= e.clientHeight + 1), true);
// Das Bild aus Bibis Sicht, wie im Mockup: „für dich“.
await laden(a);
await a.waitForSelector('.karte[data-platz="0"] .stimmen', { timeout: 8000 });
enthaelt("Bei Bibi: für dich", await a.locator('.karte[data-platz="0"]').innerText(), "für dich");
await a.waitForSelector("#toast:not([data-open])", { state: "attached", timeout: 6000 });
await a.screenshot({ path: `${AUS}/zw3-stapel.png` });
const schmal = await seiteFuer("tok-c", { breite: 375 });
await laden(schmal);
await schmal.waitForSelector('.karte[data-platz="0"] .stimmen', { timeout: 8000 });
pruefe("375 px: Titel nicht abgeschnitten", await schmal.locator('.karte[data-platz="0"] .was').evaluate((e) => e.scrollHeight <= e.clientHeight + 1), true);
pruefe("375 px: Knöpfe ganz drin", await schmal.evaluate(() => {
  const k = document.querySelector('.karte[data-platz="0"]'), b = k.querySelector(".knoepfe");
  return b.getBoundingClientRect().bottom <= k.getBoundingClientRect().bottom;
}), true);
await schmal.locator('.karte[data-platz="0"]').screenshot({ path: `${AUS}/zw3-karte-375.png` });
await schmal.close();
await oben.locator('[data-kartentun="ja"]').click();
enthaelt("Sagt, was passiert ist", await toastText(c, `Zurückgesetzt — ${Q.points} Cleanies gehen von Bibi zurück`), `Zurückgesetzt — ${Q.points} Cleanies gehen von Bibi zurück`);
await c.waitForTimeout(800);

console.log("== A sieht die Gegenbuchung");
await zumVerlauf(a);
const erste = (await a.locator(".ledger li").first().innerText()).replace(/\s+/g, " ");
enthaelt("Oben die Gegenbuchung", erste, `Zurückgesetzt: ${Q.name}`);
enthaelt("Aus der Abstimmung", erste, "Abstimmung");
pruefe("Alte Zeile durchgestrichen", await a.locator(".ledger li.weg").count(), 1);
pruefe("Mit Etikett", await a.locator(".ledger li.weg .etikett.zurueck").count(), 1);
pruefe("Stand: eine Buchung bleibt", lies("select points from balances where member_id = 'u-a'")[0].points, 100 + Q.points);
enthaelt("Gesammelt ohne die zurückgesetzte", await a.locator(".card.navy").innerText(), `${Q.points} gesammelt · 0 eingelöst`);
pruefe("Die Runde bleibt erledigt", lies(`select faellig_am = date('now','+5 days') as j from quests where id = '${Q.id}'`)[0].j, 1);
await a.screenshot({ path: `${AUS}/zw4-zurueck.png` });
pruefe("Nichts läuft über", await ueberlauf(a), false);

console.log("== Bei „Wir“: entschieden, und eine zweite, die bleibt");
await a.click('.navbar [data-go="wir"]');
await a.waitForSelector("[data-zweifelkarte]", { timeout: 8000 });
enthaelt("Entschieden: zurückgesetzt", await a.locator("[data-zweifelkarte]").first().innerText(), "Zurückgesetzt");
await b.evaluate(() => fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ art: "zweifel", zielId: "zw-ui-1", grund: "anders", notiz: "Ich war doch dabei" }) }));
await laden(a);
await a.click('.navbar [data-go="wir"]');
await a.waitForSelector("[data-zweifelkarte] [data-stimme]", { timeout: 8000 });
const wk = (await a.locator("[data-zweifelkarte]").first().innerText()).replace(/\s+/g, " ");
enthaelt("Worum es geht", wk, "Buchung angezweifelt — Anderer Grund");
enthaelt("Was sich ändert", wk, "zurückgesetzt");
enthaelt("Notiz", wk, "Ich war doch dabei");
await a.waitForSelector("#toast:not([data-open])", { state: "attached", timeout: 6000 });
// Die Leiste unten liegt fest über der Seite — die Karte in die Mitte holen.
await a.locator("[data-zweifelkarte]").first().evaluate((e) => e.scrollIntoView({ block: "center" }));
await a.locator("[data-zweifelkarte]").first().screenshot({ path: `${AUS}/zw5-wir.png` });
await a.click('[data-zweifelkarte] [data-stimme][data-antwort="nein"]');
enthaelt("Eine Stimme reicht nicht", await toastText(a, "Es fehlen noch Stimmen"), "Es fehlen noch Stimmen");
await laden(c);
await c.click('.navbar [data-go="wir"]');
await c.waitForSelector("[data-zweifelkarte] [data-stimme]", { timeout: 8000 });
await c.click('[data-zweifelkarte] [data-stimme][data-antwort="nein"]');
enthaelt("Mit dem zweiten Nein bleibt sie", await toastText(c, `Die Buchung bleibt — ${Q.name} ist weiter gebucht`), `Die Buchung bleibt — ${Q.name} ist weiter gebucht`);
pruefe("Stand unverändert", lies("select points from balances where member_id = 'u-a'")[0].points, 100 + Q.points);

console.log("== Eine Belohnung: Bibis Ausnahmeantrag von gestern");
sql(`insert into rewards (id, couple_id, name, cost, bestaetigen) values ('rw-zw-ui', '${PAAR}', 'Veto-Ausnahmeantrag', 15, 0) on conflict(id) do update set active = 1`);
sql(`insert into requests (id, couple_id, reward_id, requested_by, cost, status, decided_by, decided_at, created_at, erfuellt) values ('rq-zw-ui', '${PAAR}', 'rw-zw-ui', 'u-a', 15, 'bestaetigt', 'u-b', datetime('now','-20 hours'), datetime('now','-20 hours','-10 minutes'), 'erhalten')`);
sql(`insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id, created_at) values ('rq-zw-ui-l', '${PAAR}', 'u-a', -15, 'Veto-Ausnahmeantrag', 'request', 'rq-zw-ui', datetime('now','-20 hours'))`);
const vorher = lies("select points from balances where member_id = 'u-a'")[0].points;
await zumVerlauf(b);
const bz = b.locator(".ledger li.waehlbar", { hasText: "Veto-Ausnahmeantrag" });
pruefe("Die Abbuchung hat ein ›", await bz.count(), 1);
enthaelt("Hinweis nennt Belohnungen", await b.locator("[data-zweifel-hinweis]").innerText(), "eingelöste Belohnungen");
await bz.locator("[data-zweifeln]").click();
await b.waitForSelector(".sheet [data-zgrund]");
const bblatt = (await b.locator(".sheet").innerText()).replace(/\s+/g, " ");
enthaelt("Eingelöst und genehmigt", bblatt, "eingelöst");
enthaelt("… genehmigt von dir", bblatt, "genehmigt von dir");
enthaelt("Gründe einer Belohnung", bblatt, "Doppelt abgebucht");
enthaelt("Nicht bekommen", bblatt, "Nicht bekommen");
enthaelt("Cleanies gehen an Bibi zurück", bblatt, "gehen die Cleanies an Bibi zurück");
pruefe("Ausnahmeantrag: keine Zusage zu erwähnen", bblatt.includes("Zusage"), false);
pruefe("Kein Hinweis zum Haushaltsplan", await b.locator(".sheet [data-zweifel-runde]").count(), 0);
await b.click('[data-zgrund="versehen"]');
await b.fill("#zwnotiz", "Aus Versehen getippt");
await b.waitForTimeout(300);
await b.screenshot({ path: `${AUS}/zw7-blatt-belohnung.png` });
await b.click('[data-senden="zweifel"]');
enthaelt("Steht zur Abstimmung", await toastText(b, "Steht zur Abstimmung"), "Steht zur Abstimmung");
await laden(a);
await a.waitForSelector('.karte[data-platz="0"] .stimmen', { timeout: 8000 });
const bk = (await a.locator('.karte[data-platz="0"]').innerText()).replace(/\s+/g, " ");
enthaelt("Karte: Titel", bk, "Veto-Ausnahmeantrag zurücksetzen");
enthaelt("Karte: Plus für dich", bk, "+15");
enthaelt("Karte: für dich", bk, "für dich");
enthaelt("Karte: Grund", bk, "Aus Versehen eingelöst");
await a.waitForSelector("#toast:not([data-open])", { state: "attached", timeout: 6000 });
await a.screenshot({ path: `${AUS}/zw8-stapel-belohnung.png` });
await a.locator('.karte[data-platz="0"] [data-kartentun="ja"]').click();
enthaelt("Cleanies zurück", await toastText(a, "Zurückgesetzt — 15 Cleanies gehen an dich zurück"), "Zurückgesetzt — 15 Cleanies gehen an dich zurück");
await a.waitForTimeout(800);
pruefe("Stand: 15 mehr", lies("select points from balances where member_id = 'u-a'")[0].points, vorher + 15);
await zumVerlauf(a);
enthaelt("Gegenbuchung oben", (await a.locator(".ledger li").first().innerText()).replace(/\s+/g, " "), "Zurückgesetzt: Veto-Ausnahmeantrag");
pruefe("Abbuchung durchgestrichen", await a.locator(".ledger li.weg", { hasText: "Veto-Ausnahmeantrag" }).count(), 1);
await a.screenshot({ path: `${AUS}/zw9-verlauf-belohnung.png` });
pruefe("Nichts läuft über", await ueberlauf(a), false);

console.log("== Handy und dunkel");
for (const thema of ["light", "dark"]) {
  const h = await seiteFuer("tok-b", { breite: 375, thema });
  await zumVerlauf(h);
  pruefe(`375 px ${thema}: nichts läuft über`, await ueberlauf(h), false);
  await h.screenshot({ path: `${AUS}/zw6-verlauf-${thema}.png` });
  await h.close();
}

await browser.close();
aufraeumen();
sql("delete from quests where id = 'q-zw-bad'; delete from rewards where id = 'rw-zw-ui'");
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
