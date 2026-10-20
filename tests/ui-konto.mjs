// Konto löschen und Haushalt verlassen auf dem Schirm: Einstellungen → Konto,
// das Blatt mit den Folgen, „löschen“ eintippen, der Gruß auf der Anmeldung;
// Verlassen bis zur neuen Einrichtung; die letzte Erwachsene mit Kind; und der
// Weg über die Löschseite auf haus-quest.com. Eigene Konten, eigene Haushalte.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
const AUS = process.env.HQ_BILDER || "/tmp";
const ZIEL = "http://127.0.0.1:8792";
const sql = (s) => execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "${s}" > /dev/null 2>&1`);
const sqlJson = (s) => JSON.parse(execSync(`cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "${s}" 2>/dev/null`).toString())[0].results;

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

console.log("== Frische Konten und Haushalte");
const NAMEN = { ku: "Uli", kv: "Vera", kw: "Wanda", kx: "Xaver", ky: "Yara", kz: "Zoe" };
for (const n of Object.keys(NAMEN)) {
  sql(`delete from couples where id in (select couple_id from members where user_id = 'u-${n}')`);
  sql(`insert into users (id, email, name) values ('u-${n}', '${n}@test', 'Konto ${n}') on conflict(id) do nothing`);
  const hash = createHash("sha256").update(`tok-${n}`).digest("hex");
  sql(`insert into sessions (token_hash, user_id, expires_at) values ('${hash}', 'u-${n}', datetime('now','+1 day')) on conflict(token_hash) do update set user_id = 'u-${n}', expires_at = datetime('now','+1 day')`);
}
const paar = await api("tok-ku", "haushalt/einrichten", { name: "Uli", art: "paar" });
await api("tok-kv", "pair/join", { code: paar.code });
await api("tok-kv", "profil", { name: "Vera" });
let st = await api("tok-ku", "state");
const q = st.quests.find((x) => x.name === "Küche reinigen nach Kochen");
await api("tok-ku", "claims", { questId: q.id });
const m = sqlJson("select id from claims where claimed_by = 'u-ku' and status = 'offen'")[0].id;
await api("tok-kv", `claims/${m}/decide`, { status: "bestaetigt" });
const wg = await api("tok-kw", "haushalt/einrichten", { name: "Wanda", art: "wg", personen: 2 });
await api("tok-kx", "pair/join", { code: wg.code });
await api("tok-kx", "profil", { name: "Xaver" });
await api("tok-ky", "haushalt/einrichten", { name: "Yara", art: "familie", erwachsene: 1, kinder: 1 });
await api("tok-ky", "kinder", { name: "Mia", tier: "🐰", stufe: "ohne", einwilligung: true });
await api("tok-kz", "haushalt/einrichten", { name: "Zoe", art: "paar" });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token, { dunkel = false, breite = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: 844 }, deviceScaleFactor: 2, locale: "de-DE",
    colorScheme: dunkel ? "dark" : "light" });
  if (token) await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (msg) => {
    if (msg.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(msg.text())) {
      console.log("  FEHL console: " + msg.text()); fehler++;
    }
  });
  return s;
}
const text = async (l) => (await l.innerText()).replace(/\s+/g, " ").trim();
const ueberlauf = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
  || [...document.querySelectorAll(".sheet, .body")].some((e) => e.scrollWidth > e.clientWidth + 1));
const jubelWeg = async (s) => { if (await s.locator("#celebrate[data-open]").count()) await s.click("#celebrate [data-schliessen]"); };
const toastText = async (s) => { await s.waitForSelector("#toast[data-open]"); return s.locator("#toast").innerText(); };
async function zuDenEinstellungen(s) {
  await s.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
  await jubelWeg(s);
  await s.click('.appbar [data-go="einstellungen"]');
  await s.waitForSelector("[data-konto-loeschen]");
}

console.log("== Uli löscht sein Konto, Vera bleibt");
const uli = await seiteFuer("tok-ku");
await zuDenEinstellungen(uli);
pruefe("Haushalt verlassen steht da", await uli.locator("[data-haushalt-verlassen]").count(), 1);
await uli.click("[data-konto-loeschen]");
await uli.waitForSelector(".sheet [data-konto-weiter]");
const blatt = await text(uli.locator(".sheet"));
st = await api("tok-ku", "state");
enthaelt("Seine Cleanies verfallen", blatt, `Deine ${st.ich.punkte} Cleanies verfallen`);
enthaelt("Der Haushalt bleibt für Vera", blatt, "Der Haushalt bleibt für Vera");
enthaelt("Vera verwaltet dann", blatt, "Vera verwaltet den Haushalt ab dann");
enthaelt("Auch im Fair-Bericht", blatt, "auch im Fair-Bericht der anderen");
pruefe("Nur verlassen geht auch", await uli.locator(".sheet [data-haushalt-verlassen]").count(), 1);
pruefe("Vorher verschenken", await uli.locator('.sheet [data-sheet="transfer"]').count(), 1);
pruefe("Vorher exportieren", await uli.locator(".sheet [data-export]").count(), 1);
pruefe("Nichts läuft über", await ueberlauf(uli), false);
await uli.waitForTimeout(350);
await uli.screenshot({ path: `${AUS}/uko1-was.png` });
await uli.click(".sheet [data-konto-weiter]");
const knopf = uli.locator("[data-konto-endgueltig]");
pruefe("Erst gesperrt", await knopf.isDisabled(), true);
await uli.fill("#konto-wort", "lösch");
pruefe("Halbes Wort reicht nicht", await knopf.isDisabled(), true);
await uli.fill("#konto-wort", "löschen");
pruefe("„löschen“ macht ihn scharf", await knopf.isDisabled(), false);
await uli.waitForTimeout(350);
await uli.screenshot({ path: `${AUS}/uko2-bestaetigen.png` });
await Promise.all([uli.waitForURL(/geloescht/), knopf.click()]);
await uli.waitForSelector("[data-geloescht]");
enthaelt("Der Gruß auf der Anmeldung", await text(uli.locator("[data-geloescht]")), "Dein Konto ist gelöscht.");
pruefe("Mit Google wieder anmelden ginge", await uli.locator('a[href="/api/auth/start"]').count(), 1);
pruefe("Uli ist weg", sqlJson("select count(*) as n from users where id = 'u-ku'")[0].n, 0);
await uli.screenshot({ path: `${AUS}/uko3-geloescht.png` });

console.log("== Vera danach");
st = await api("tok-kv", "state");
pruefe("Vera ist allein", st.mitglieder.length, 1);
pruefe("… und verwaltet", st.haushalt.ichVerwalte, true);
pruefe("Sie bekommt Bescheid", sqlJson("select count(*) as n from ereignisse where user_id = 'u-kv' and titel = 'Uli ist nicht mehr dabei'")[0].n, 1);

console.log("== Wanda verlässt die WG, Xaver bleibt");
const wanda = await seiteFuer("tok-kw");
await zuDenEinstellungen(wanda);
await wanda.click("[data-haushalt-verlassen]");
await wanda.waitForSelector(".sheet [data-verlassen-ok]");
const vblatt = await text(wanda.locator(".sheet"));
enthaelt("Ihr Konto bleibt", vblatt, "Dein Konto bleibt.");
enthaelt("Der Haushalt bleibt für Xaver", vblatt, "Der Haushalt bleibt für Xaver");
await wanda.waitForTimeout(350);
await wanda.screenshot({ path: `${AUS}/uko4-verlassen.png` });
await wanda.click(".sheet [data-verlassen-ok]");
pruefe("Die Meldung", (await toastText(wanda)).includes("Du hast den Haushalt verlassen."), true);
await wanda.waitForSelector("#e-name, .schritt");
pruefe("Sie richtet neu ein", await wanda.locator(".schritt").count() > 0, true);
pruefe("Ihr Konto gibt es noch", sqlJson("select count(*) as n from users where id = 'u-kw'")[0].n, 1);
pruefe("Xaver bleibt", (await api("tok-kx", "state")).mitglieder.length, 1);

console.log("== Yara, letzte Erwachsene, mit Mia");
const yara = await seiteFuer("tok-ky", { dunkel: true, breite: 375 });
await zuDenEinstellungen(yara);
await yara.click("[data-konto-loeschen]");
await yara.waitForSelector(".sheet [data-konto-weiter]");
const yblatt = await text(yara.locator(".sheet"));
enthaelt("Sie ist die letzte Erwachsene", yblatt, "Du bist die letzte erwachsene Person.");
enthaelt("Mia wird genannt", yblatt, "Mia 🐰");
enthaelt("Der ganze Haushalt geht", yblatt, "Der ganze Haushalt");
pruefe("Keine „0 Cleanies“", yblatt.includes("0 Cleanies"), false);
pruefe("Kein „Nur verlassen“", await yara.locator(".sheet [data-haushalt-verlassen]").count(), 0);
pruefe("Dunkel und 375 px: nichts läuft über", await ueberlauf(yara), false);
await yara.waitForTimeout(350);
await yara.screenshot({ path: `${AUS}/uko5-letzte.png` });
await yara.click(".sheet [data-bleiben]");
await yara.click("[data-haushalt-verlassen]");
await yara.waitForSelector(".sheet .hinweis");
enthaelt("Verlassen geht nicht", await text(yara.locator(".sheet")), "Als letzte erwachsene Person kannst du nicht gehen");

console.log("== Die Löschseite im Web");
const web = await seiteFuer(null);
const antwort = await web.goto(`${ZIEL}/konto-loeschen/`, { waitUntil: "networkidle" });
pruefe("Die Seite kommt", antwort.status(), 200);
pruefe("Die Überschrift", (await web.locator("h1").innerText()).trim(), "Dein Konto bei Homi Point löschen");
pruefe("Der Knopf führt in die App", await web.locator("[data-loeschen-start]").getAttribute("href"), "/app/?konto-loeschen");
pruefe("Kein seitliches Scrollen", await web.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await web.screenshot({ path: `${AUS}/uko6-webseite.png`, fullPage: true });
const start = await web.goto(`${ZIEL}/`, { waitUntil: "networkidle" });
pruefe("Die Startseite verlinkt sie", await web.locator('footer a[href="/konto-loeschen/"]').count(), 1);
pruefe("Startseite da", start.status(), 200);
// Ohne Anmeldung: der Wunsch wird gemerkt, nach der Anmeldung öffnet sich das Blatt.
await web.goto(`${ZIEL}/app/?konto-loeschen`, { waitUntil: "networkidle" });
pruefe("Erst die Anmeldung", (await web.locator(".mitte h1").innerText()).trim(), "Homi Point");
pruefe("Der Wunsch ist gemerkt", await web.evaluate(() => localStorage.getItem("hq-loeschen")), "1");
await web.context().addCookies([{ name: "hq_sitzung", value: "tok-kz", domain: "127.0.0.1", path: "/" }]);
await web.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await web.waitForSelector(".sheet [data-konto-weiter]", { timeout: 8000 }).catch(() => {});
pruefe("Nach der Anmeldung: gleich das Blatt", await web.locator(".sheet h3").innerText().catch(() => ""), "Konto löschen");
pruefe("Der Wunsch ist erledigt", await web.evaluate(() => localStorage.getItem("hq-loeschen")), null);

await browser.close();
console.log(fehler ? `${fehler} Fehler` : "ALLES GRÜN");
process.exit(fehler ? 1 : 0);
