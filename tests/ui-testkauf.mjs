// Der Testkauf im Browser: die Zeile auf der Startseite kurz vor Ende des Tests,
// die Plus-Seite mit drei Plänen, „Jetzt nicht“ mit Gründen, was nach dem Test
// pausiert (Fair-Bericht, Familienmodus, Kinder-Gerät, viertes Event), der Kauf
// mit der ehrlichen Frage, die Einstellungen und die Kachel im Betriebs-Dashboard.
// Hell, dunkel, 375 Pixel. Braucht den Testserver mit BETRIEB_EMAILS=ramon@example.com.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const ZIEL = "http://127.0.0.1:8792";
const AUS = process.env.HQ_BILDER || "/tmp";

let fehler = 0;
const pruefe = (n, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}: ${JSON.stringify(ist)}${ok ? "" : " soll=" + JSON.stringify(soll)}`);
};
const enthaelt = (n, text, teil) => {
  const ok = String(text).includes(teil);
  if (!ok) fehler++;
  console.log(`${ok ? "  ok  " : "  FEHL"} ${n}${ok ? "" : `: „${teil}“ fehlt in „${String(text).slice(0, 300)}“`}`);
};
const sql = (befehl) => JSON.parse(execFileSync("npx",
  ["wrangler", "d1", "execute", "haus-quest", "--local", "--json", "--command", befehl.replace(/\s+/g, " ")],
  { cwd: "/workspace/bubu-app", stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;
const api = async (pfad, daten, token) => {
  const r = await fetch(`${ZIEL}/api/${pfad}`, {
    method: daten ? "POST" : "GET",
    headers: { Cookie: `hq_sitzung=${token}`, ...(daten ? { "Content-Type": "application/json" } : {}) },
    body: daten ? JSON.stringify(daten) : undefined
  });
  return r.json();
};

const aufraeumen = () => sql(`delete from couples where id in (select couple_id from members where user_id like 'u-tkui%');
  delete from users where id like 'u-tkui%' or (id like 'kind-%' and id not in (select user_id from members));
  delete from einladungen where name = 'Testkauf UI';`);
aufraeumen();

// Tina und Tom (erwachsen), Jana (jugendlich) — eigene Konten mit festen Sitzungen.
for (const [n, name] of [["tkui1", "Tina"], ["tkui2", "Tom"], ["tkui3", "Jana"]]) {
  const hash = createHash("sha256").update(`tok-${n}`).digest("hex");
  sql(`insert into users (id, email, name, name_gesetzt) values ('u-${n}', '${n}@test', '${name}', 1) on conflict(id) do nothing;
       insert into sessions (token_hash, user_id, expires_at) values ('${hash}', 'u-${n}', datetime('now', '+1 day'))
         on conflict(token_hash) do update set user_id = 'u-${n}', expires_at = datetime('now', '+1 day');`);
}

console.log("== Ein Pilot-Haushalt mit Kind");
const E = (await api("betrieb/einladung", { name: "Testkauf UI" }, "tok-ramon")).code;
await api("pilot/annehmen", { code: E }, "tok-tkui1");
const HC = (await api("haushalt/einrichten", { art: "familie", erwachsene: 2, kinder: 1, raeume: ["Küche", "Bad"] }, "tok-tkui1")).code;
await api("pair/join", { code: HC }, "tok-tkui2");
await api("pair/join", { code: HC }, "tok-tkui3");
await api("mitglieder/u-tkui3/jugendlich", { ja: true }, "tok-tkui1");
const LENA = (await api("kinder", { name: "Lena", tier: "🦊", stufe: "geraet", taschengeld: true, einwilligung: true }, "tok-tkui1")).id;
const KC = (await api(`kinder/${LENA}/code`, {}, "tok-tkui1")).code;
const PAAR = sql("select couple_id as p from members where user_id = 'u-tkui1'")[0].p;
pruefe("Plus im Test", (await api("state", null, "tok-tkui1")).plus.testTage, 14);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token, { dunkel = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "de-DE",
    timezoneId: "Europe/Berlin", colorScheme: dunkel ? "dark" : "light" });
  if (token) await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) { console.log("  FEHL console: " + m.text()); fehler++; }
  });
  return s;
}
const text = async (s, sel = "body") => (await s.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
  || [...document.querySelectorAll(".body, .card, .sheet, .plus-plan, .zuletzt, .kv-body, .karte")].some((e) => e.scrollWidth > e.clientWidth + 1));
const oeffnen = async (s) => { await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" }); await s.waitForSelector(".navbar"); };
const blattDa = (s) => s.waitForTimeout(450);
const zuStart = async (s) => { await s.click('.navbar [data-go="start"]'); await s.waitForSelector(".appbar .title"); };

console.log("== Zwei Tage vor Ende: die Zeile auf der Startseite");
sql(`update couples set plus_test_bis = datetime('now', '+2 days') where id = '${PAAR}'`);
const tina = await seiteFuer("tok-tkui1");
await oeffnen(tina);
await tina.waitForSelector(".zuletzt.hinweis.plus");
enthaelt("Endet übermorgen", await text(tina, ".zuletzt.hinweis.plus"), "Euer Plus-Test endet übermorgen");
enthaelt("Sagt, was dazugehört", await text(tina, ".zuletzt.hinweis.plus"), "Fair-Bericht, Kinderansicht und Events ohne Grenze — Plus behalten?");
pruefe("375 px: nichts läuft über", await ueberlauf(tina), false);
await tina.locator(".zuletzt.hinweis.plus").scrollIntoViewIfNeeded();
await tina.screenshot({ path: `${AUS}/utk1-zeile.png` });

console.log("== Die Plus-Seite");
await tina.click(".zuletzt.hinweis.plus [data-plus-holen]");
await tina.waitForSelector(".sheet .plus-plaene");
pruefe("Drei Pläne", await tina.locator(".sheet [data-plus-plan]").count(), 3);
pruefe("Jahr ist vorgewählt", await tina.locator('.sheet [data-plus-plan][aria-checked="true"]').getAttribute("data-plus-plan"), "jahr");
pruefe("Knopf nennt den Preis", await text(tina, ".sheet [data-plus-kaufen]"), "Kaufen · 11,99 €");
enthaelt("Vorher steht: nichts wird abgebucht", await text(tina, ".sheet"), "Pilot: Es wird nichts abgebucht.");
enthaelt("Sagt, wann der Test endet", await text(tina, ".sheet .plus-kopf"), "Euer Test endet übermorgen");
pruefe("Nichts läuft über", await ueberlauf(tina), false);
await blattDa(tina);
await tina.screenshot({ path: `${AUS}/utk2-plus-seite.png` });
await tina.click('.sheet [data-plus-plan="monat"]');
pruefe("Plan wechseln ändert den Knopf", await text(tina, ".sheet [data-plus-kaufen]"), "Kaufen · 1,99 €");

console.log("== Jetzt nicht — mit Gründen");
await tina.click(".sheet [data-plus-nicht]");
await tina.waitForSelector(".sheet .plus-gruende");
pruefe("Fünf Gründe", await tina.locator(".sheet [data-plus-grund]").count(), 5);
pruefe("Ohne Grund geht es auch", await text(tina, ".sheet [data-plus-nicht-ok]"), "Ohne Grund schließen");
await tina.click('.sheet [data-plus-grund="Zu teuer"]');
await tina.click('.sheet [data-plus-grund="Erst später"]');
pruefe("Zwei gewählt", await tina.locator('.sheet [data-plus-grund][aria-pressed="true"]').count(), 2);
pruefe("Der Knopf heißt jetzt Fertig", await text(tina, ".sheet [data-plus-nicht-ok]"), "Fertig");
await blattDa(tina);
await tina.screenshot({ path: `${AUS}/utk3-jetzt-nicht.png` });
await tina.click(".sheet [data-plus-nicht-ok]");
await tina.waitForSelector("#toast[data-open]");
enthaelt("Bedankt sich", await text(tina, "#toast"), "Plus findest du weiter in den Einstellungen");
await tina.waitForFunction(() => !document.querySelector(".zuletzt.hinweis.plus"));
pruefe("Die Zeile ist weg", await tina.locator(".zuletzt.hinweis.plus").count(), 0);
pruefe("Gespeichert", sql("select gruende as g from plus_absagen where wer = 'u-tkui1'")[0]?.g, '["Zu teuer","Erst später"]');

console.log("== Test vorbei: Plus pausiert");
sql(`update couples set plus_test_bis = datetime('now', '-1 hour') where id = '${PAAR}'`);
const tom = await seiteFuer("tok-tkui2");
await oeffnen(tom);
await tom.waitForSelector(".zuletzt.hinweis.plus");
enthaelt("Die Zeile sagt: vorbei", await text(tom, ".zuletzt.hinweis.plus"), "Euer Plus-Test ist vorbei");
await tom.locator(".zuletzt.hinweis.plus").scrollIntoViewIfNeeded();
await tom.screenshot({ path: `${AUS}/utk4-vorbei.png` });

await tom.click('.navbar [data-go="wir"]');
await tom.waitForSelector(".plus-pause");
enthaelt("Familienmodus pausiert", await text(tom, ".plus-pause"), "Familienmodus pausiert");
enthaelt("Profile bleiben", await text(tom, ".plus-pause"), "Profile und Cleanies der Kinder bleiben");
await tom.locator(".plus-pause").scrollIntoViewIfNeeded();
await tom.screenshot({ path: `${AUS}/utk5-familie-pausiert.png` });
await tom.click("[data-kind-neu]");
await tom.waitForSelector(".sheet .plus-plaene");
enthaelt("Kind anlegen führt zu Plus", await text(tom, ".sheet .plus-kopf"), "Kinderprofile gibt es mit Plus.");
await tom.click(".sheet [data-plus-nicht]");
await tom.evaluate(() => document.querySelector("#scrim").click());

// Das vierte Event: erklärt statt angefangen.
for (const t of ["Eins", "Zwei", "Drei"]) {
  sql(`insert into events (id, couple_id, richtung, titel, cleanies, von, bis, laenge, created_by)
       values ('tkui-ev-${t}', '${PAAR}', 'verdienen', '${t}', 5, date('now'), date('now', '+3 days'), 3, 'u-tkui1')`);
}
await tom.reload({ waitUntil: "networkidle" });
await tom.waitForSelector(".navbar");
await tom.evaluate(() => { const b = document.createElement("button"); b.dataset.sheet = "event"; document.body.append(b); b.click(); });
await tom.waitForSelector(".sheet .plus-kopf");
enthaelt("Viertes Event: Plus-Seite mit Grund", await text(tom, ".sheet .plus-kopf"), "Mehr als 3 Events zugleich gibt es mit Plus");
await tom.evaluate(() => document.querySelector("#scrim").click());

console.log("== Kinder-Gerät und Jugendliche");
const lena = await seiteFuer(null);
const anmeldung = await lena.request.post(`${ZIEL}/api/kind/anmelden`, { data: { code: KC } });
pruefe("Lenas Gerät angemeldet", anmeldung.ok(), true);
await lena.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await lena.waitForSelector("[data-kv-pause]");
enthaelt("Pause statt Aufgaben", await text(lena, "[data-kv-pause]"), "Deine Ansicht macht gerade Pause");
enthaelt("Wen fragen", await text(lena, "[data-kv-pause]"), "Frag Tina oder Tom");
pruefe("Keine Aufgaben", await lena.locator("[data-kv-quest]").count(), 0);
pruefe("Kein Schalter Glas/Weg", await lena.locator("[data-kv-ansicht]").count(), 0);
pruefe("Nichts läuft über", await ueberlauf(lena), false);
await lena.screenshot({ path: `${AUS}/utk6-kind-pause.png` });

const jana = await seiteFuer("tok-tkui3");
await oeffnen(jana);
pruefe("Keine Zeile für Jugendliche", await jana.locator(".zuletzt.hinweis.plus").count(), 0);
await jana.click("[data-woche]");
await jana.click('.sheet [data-go="fair"]');
await jana.waitForSelector("[data-fair-schloss]");
enthaelt("Schloss: Frag die Großen", await text(jana, ".fair-schloss"), "Frag die Großen");
pruefe("Kein Kaufknopf", await jana.locator("[data-plus-holen], [data-plus-kaufen]").count(), 0);
await jana.context().close();

console.log("== Der Testkauf aus dem Fair-Bericht");
await zuStart(tom);
await tom.click("[data-woche]");
await tom.click('.sheet [data-go="fair"]');
await tom.waitForSelector("[data-fair-schloss]");
enthaelt("Schloss: Test vorbei", await text(tom, ".fair-schloss"), "Euer Test ist vorbei");
enthaelt("Was es mit Plus gibt", await text(tom, ".fair-schloss"), "Den ganzen Bericht, die Kinderansicht und Events ohne Grenze gibt es mit Plus. Die Woche bleibt für alle.");
await tom.screenshot({ path: `${AUS}/utk7-fair-schloss.png` });
await tom.click(".fair-schloss [data-plus-holen]");
await tom.waitForSelector(".sheet .plus-plaene");
enthaelt("Nach dem Test", await text(tom, ".sheet .plus-kopf"), "Euer Test ist vorbei — mit Plus ist alles wieder da.");
await tom.click('.sheet [data-plus-plan="immer"]');
pruefe("Für immer", await text(tom, ".sheet [data-plus-kaufen]"), "Kaufen · 49,99 €");
await tom.click(".sheet [data-plus-kaufen]");
await tom.waitForSelector(".sheet .plus-danke");
enthaelt("Danke", await text(tom, ".sheet"), "Danke! Plus ist an.");
enthaelt("Sagt, was es war", await text(tom, ".sheet"), "Das war ein Testkauf über Plus für immer (49,99 €).");
enthaelt("Nichts abgebucht", await text(tom, ".sheet"), "Im Pilot wird nichts abgebucht");
pruefe("Die ehrliche Frage", await tom.locator(".sheet [data-plus-ehrlich]").count(), 3);
pruefe("Nichts läuft über", await ueberlauf(tom), false);
await blattDa(tom);
await tom.screenshot({ path: `${AUS}/utk8-danke.png` });
await tom.click('.sheet [data-plus-ehrlich="vielleicht"]');
await tom.waitForSelector(".sheet [data-plus-ehrlich]", { state: "detached" });
enthaelt("Bedankt sich", await text(tom, ".sheet"), "Danke für die Antwort.");
pruefe("Gespeichert", sql("select plan || '/' || ehrlich as k from testkaeufe where wer = 'u-tkui2'")[0]?.k, "immer/vielleicht");
await tom.click(".sheet [data-plus-zu]");
await tom.waitForFunction(() => !document.querySelector("[data-fair-schloss]"));
pruefe("Der ganze Bericht ist wieder da", await tom.locator("[data-fair-schloss]").count(), 0);

console.log("== Danach");
await zuStart(tom);
pruefe("Keine Zeile mehr", await tom.locator(".zuletzt.hinweis.plus").count(), 0);
await tom.click('.navbar [data-go="wir"]');
await tom.waitForSelector(".navbar");
pruefe("Familienmodus wieder an", await tom.locator(".plus-pause").count(), 0);
await lena.reload({ waitUntil: "networkidle" });
await lena.waitForSelector(".kv-body");
pruefe("Lenas Gerät: Aufgaben wieder da", await lena.locator("[data-kv-pause]").count(), 0);
await lena.context().close();
await tom.evaluate(() => { const b = document.createElement("button"); b.dataset.go = "einstellungen"; document.body.append(b); b.click(); });
await tom.waitForSelector(".plus-avatar");
const zeile = tom.locator("[data-plus-stand]");
enthaelt("In den Einstellungen", await text(tom, "[data-plus-stand]"), "Testkauf: Für immer · abgebucht wird nichts");
pruefe("Nur noch Auskunft, kein Kaufknopf", await tom.locator(".rowlink[data-plus-holen]").count(), 0);
await zeile.scrollIntoViewIfNeeded();
await tom.screenshot({ path: `${AUS}/utk9-einstellungen.png` });

console.log("== Dunkel");
sql(`update couples set plus = 0, plus_test_bis = datetime('now', '+1 day') where id = '${PAAR}'; delete from testkaeufe where couple_id = '${PAAR}'`);
const dunkel = await seiteFuer("tok-tkui2", { dunkel: true });
await oeffnen(dunkel);
await dunkel.waitForSelector(".zuletzt.hinweis.plus");
enthaelt("Endet morgen", await text(dunkel, ".zuletzt.hinweis.plus"), "Euer Plus-Test endet morgen");
await dunkel.locator(".zuletzt.hinweis.plus").scrollIntoViewIfNeeded();
await dunkel.screenshot({ path: `${AUS}/utk10-dunkel-zeile.png` });
await dunkel.click(".zuletzt.hinweis.plus [data-plus-holen]");
await dunkel.waitForSelector(".sheet .plus-plaene");
pruefe("Dunkel: nichts läuft über", await ueberlauf(dunkel), false);
await blattDa(dunkel);
await dunkel.screenshot({ path: `${AUS}/utk11-dunkel-plus.png` });
await dunkel.context().close();
await tom.context().close();
await tina.context().close();

console.log("== Im Betriebs-Dashboard");
sql(`update couples set plus = 1 where id = '${PAAR}';
     insert into testkaeufe (id, couple_id, wer, plan, preis_cent, ehrlich) values ('tkui-kauf', '${PAAR}', 'u-tkui2', 'jahr', 1199, 'ja')`);
for (const thema of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1, colorScheme: thema, locale: "de-DE" });
  await ctx.addCookies([{ name: "hq_sitzung", value: "tok-ramon", domain: "127.0.0.1", path: "/" }]);
  const b = await ctx.newPage();
  b.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  await b.goto(`${ZIEL}/betrieb/`, { waitUntil: "networkidle" });
  await b.waitForSelector('[data-tor="testkauf"]');
  if (thema === "light") {
    const L = await api("betrieb", null, "tok-ramon");
    const t = L.tore.testkauf;
    const p = Math.round(t.anzahl / t.von * 100);
    pruefe("Kachel rechnet wie der Server", await text(b, '[data-tor="testkauf"] .zahl'), `${p} %`);
    enthaelt("Nenner: nach ihrem Test", await text(b, '[data-tor="testkauf"]'), `${t.anzahl} von ${t.von} nach ihrem Test`);
    enthaelt("Welcher Plan", await text(b, '[data-testkauf="plaene"]'), `Jahr ${t.plaene.jahr}`);
    enthaelt("Ehrlich", await text(b, '[data-testkauf="ehrlich"]'), `Ja ${t.ehrlich.ja}`);
    enthaelt("Gründe", await text(b, '[data-testkauf="gruende"]'), "Zu teuer");
    enthaelt("Haushalt mit Chip", await text(b, "body"), "Plus gekauft · Jahr");
  }
  pruefe(`Dashboard ${thema}: nichts läuft über`, await ueberlauf(b), false);
  await b.screenshot({ path: `${AUS}/utk-dashboard-${thema}.png`, fullPage: true });
  await ctx.close();
}
const handy = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
await handy.addCookies([{ name: "hq_sitzung", value: "tok-ramon", domain: "127.0.0.1", path: "/" }]);
const h = await handy.newPage();
await h.goto(`${ZIEL}/betrieb/`, { waitUntil: "networkidle" });
await h.waitForSelector('[data-testkauf="plaene"]');
pruefe("Dashboard 375 px: nichts läuft über", await ueberlauf(h), false);
await h.locator('[data-testkauf="plaene"]').scrollIntoViewIfNeeded();
await h.screenshot({ path: `${AUS}/utk-dashboard-handy.png` });
await handy.close();

await browser.close();
aufraeumen();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
