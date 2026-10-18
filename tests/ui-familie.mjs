// Der Familienmodus auf dem Schirm: Mama legt Kinder an, trägt für sie ein,
// öffnet die Kinderansicht (Sparglas oder Weg) und kommt nur mit der PIN
// zurück. Ein Kind meldet sich auf seinem eigenen Gerät mit einem Code an —
// ohne Google — und bestätigt dort, was Papa erledigt hat.
//
// Braucht die Familie aus familie-api.sh (Mama, Papa, Jule).
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const AUS = process.env.HQ_BILDER || "/tmp";
const ZIEL = "http://127.0.0.1:8792";
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

/** Die Schnittstelle direkt — für das, was nicht Thema dieses Tests ist. */
async function api(token, pfad, daten, nochmal = true) {
  try {
    const antwort = await fetch(`${ZIEL}/api/${pfad}`, {
      method: daten ? "POST" : "GET",
      headers: { Cookie: `hq_sitzung=${token}`, ...(daten ? { "Content-Type": "application/json" } : {}) },
      body: daten ? JSON.stringify(daten) : undefined
    });
    return await antwort.json();
  } catch (f) {
    // Der Testserver schließt ruhende Verbindungen — dann einmal neu.
    if (nochmal) return api(token, pfad, daten, false);
    throw f;
  }
}

console.log("== Aufräumen: keine Kinderprofile, keine PIN, nichts offen");
let st = await api("tok-fm", "state");
for (const k of st.mitglieder.filter((m) => m.stufe === "ohne" || m.stufe === "geraet")) {
  await api("tok-fm", `kinder/${k.id}/loeschen`, {});
}
sql("update couples set eltern_pin = null, kurs = 10 where id in (select couple_id from members where user_id = 'u-fm')");
sql("delete from claims where couple_id in (select couple_id from members where user_id = 'u-fm') and status = 'offen'");
sql("delete from requests where couple_id in (select couple_id from members where user_id = 'u-fm') and status = 'offen'");
sql("delete from ereignisse where user_id in ('u-fm','u-fp')");
const lena = await api("tok-fm", "kinder", { name: "Lena", tier: "🦊", stufe: "ohne", taschengeld: true, einwilligung: true });
st = await api("tok-fm", "state");
const Q = st.quests.find((q) => q.name.startsWith("Spülmaschine"));
await api("tok-fm", `quests/${Q.id}/fuer`, { fuer: "kinder" });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function seiteFuer(token, { dunkel = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "de-DE",
    colorScheme: dunkel ? "dark" : "light" });
  if (token) await ctx.addCookies([{ name: "hq_sitzung", value: token, domain: "127.0.0.1", path: "/" }]);
  const s = await ctx.newPage();
  s.on("pageerror", (e) => { console.log("  FEHL pageerror: " + e.message); fehler++; });
  s.on("console", (m) => {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|favicon|vibrate|status of 40/.test(m.text())) {
      console.log("  FEHL console: " + m.text()); fehler++;
    }
  });
  return s;
}
const ueberlauf = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
/** Die Meldung unten — die von vorher wird vorher weggeräumt, damit nicht sie gelesen wird. */
const toastLeeren = (s) => s.evaluate(() => document.getElementById("toast").removeAttribute("data-open"));
const toastText = async (s) => { await s.waitForSelector("#toast[data-open]"); return s.locator("#toast").innerText(); };
const jubelWeg = async (s) => {
  if (await s.locator("#celebrate[data-open]").count()) await s.click("#celebrate [data-schliessen]");
};

const mama = await seiteFuer("tok-fm");
await mama.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await jubelWeg(mama);

console.log("== Start: die Kinder unter dem Konto");
pruefe("Lenas Karte", await mama.locator(`.kindkarte[data-kind="${lena.id}"]`).count(), 1);
enthaelt("Mit Wunsch", await mama.locator(`.kindkarte[data-kind="${lena.id}"]`).innerText(), "30 Minuten Tablet");
pruefe("Nichts läuft über", await ueberlauf(mama), false);
await mama.screenshot({ path: `${AUS}/uf1-start.png` });

console.log("== Wir: Familie und ein neues Kind mit eigenem Gerät");
await mama.click('[data-go="wir"]');
enthaelt("Familie steht da", await mama.locator(".body").innerText(), "Kind hinzufügen");
await mama.click("[data-kind-neu]");
await mama.fill("#kindname", "Mia");
await mama.click('[data-kv-tier="🐰"]');
await mama.click('[data-kv-stufe="geraet"]');
pruefe("Der Name bleibt beim Wählen", await mama.inputValue("#kindname"), "Mia");
await toastLeeren(mama);
await mama.click("[data-kind-speichern]");
enthaelt("Ohne Einwilligung nicht", await toastText(mama), "Ohne Einwilligung der Eltern geht es nicht");
await mama.check("#einwilligung");
await mama.screenshot({ path: `${AUS}/uf2-anlegen.png` });
await mama.click("[data-kind-speichern]");
await mama.waitForSelector(".kv-qr svg");
const code = (await mama.locator("#kindcode").innerText()).trim();
pruefe("Ein Code mit acht Zeichen", code.replace("-", "").length, 8);
pruefe("Und ein QR-Code", await mama.locator(".kv-qr svg path").count(), 1);
await mama.screenshot({ path: `${AUS}/uf3-code.png` });
await mama.click("[data-bleiben]");
st = await api("tok-fm", "state");
const mia = st.mitglieder.find((m) => m.name === "Mia");
pruefe("Mia mit eigenem Gerät", mia?.stufe, "geraet");

console.log("== Für Lena eintragen — zählt sofort");
await mama.click("[data-plus]");
pruefe("Wer hat's gemacht? Ich, Jule, Lena, Mia", await mama.locator("[data-plus-wer]").count(), 4);
await mama.click(`[data-plus-wer="${lena.id}"]`);
enthaelt("Die Frage für Lena", await mama.locator(".sheet h3").innerText(), "Was hat Lena erledigt?");
pruefe("Nur Quests für Kinder", await mama.locator('#plusliste [data-melden-aus]').evaluateAll((l) =>
  l.every((b) => !/Bad reinigen/.test(b.innerText))), true);
await mama.click(`#plusliste [data-melden-aus="${Q.id}"]`);
enthaelt("Das Eintrage-Blatt", await mama.locator(".sheet").innerText(), "zählt es gleich als bestätigt");
await toastLeeren(mama);
await mama.click('[data-senden="eintragen"]');
enthaelt("Eingetragen", await toastText(mama), "Lena bekommt");
st = await api("tok-fm", "state");
pruefe("Lena hat Cleanies", st.mitglieder.find((m) => m.id === lena.id).punkte, Q.points);

console.log("== Für wen eine Quest gilt — hinter dem Stift");
await mama.click('[data-go="quests"]');
await mama.click('[data-bearbeiten="quests"]');
await mama.click(`[data-sheet="menue"][data-id="${Q.id}"]`);
enthaelt("Für wen im Menü", await mama.locator(".sheet").innerText(), "Für wen: Kinder");
await toastLeeren(mama);
await mama.click("[data-fuer-wahl]");
enthaelt("Gewechselt", await toastText(mama), "Sehen jetzt: Erwachsene");
for (const wort of ["Alle", "Kinder"]) {
  await toastLeeren(mama);
  await mama.click("[data-fuer-wahl]");
  enthaelt(`Weiter: ${wort}`, await toastText(mama), `Sehen jetzt: ${wort}`);
}
st = await api("tok-fm", "state");
pruefe("Wieder für Kinder", st.quests.find((q) => q.id === Q.id).fuer, "kinder");
await mama.evaluate(() => document.getElementById("scrim").click());
await mama.click('[data-bearbeiten="quests"]');

console.log("== Die Kinderansicht auf Mamas Handy — mit PIN");
await mama.click('[data-go="start"]');
await mama.click(`.kindkarte[data-kind="${lena.id}"]`);
await mama.click(`[data-kv-oeffnen="${lena.id}"]`);
enthaelt("Erst eine PIN", await mama.locator(".sheet h3").innerText(), "Eltern-PIN festlegen");
await mama.fill("#pinneu", "2468");
await mama.click("[data-pin-ok]");
await mama.waitForSelector(".kv");
pruefe("Keine Leiste", await mama.locator(".navbar").count(), 0);
enthaelt("Hallo Lena", await mama.locator(".kv-hallo").innerText(), "Hallo Lena!");
pruefe("Das Sparglas", await mama.locator(".kv-spar .kv-glas").count(), 1);
pruefe("Das Schloss", await mama.locator("[data-kv-schloss]").count(), 1);
pruefe("Mia steht zur Wahl", await mama.locator(`[data-kv-kind="${mia.id}"]`).count(), 1);
pruefe("Nichts läuft über", await ueberlauf(mama), false);
await mama.screenshot({ path: `${AUS}/uf4-sparglas.png` });

console.log("== Lena meldet selbst");
await mama.click(`[data-kv-quest="${Q.id}"]`);
enthaelt("Die Frage", await mama.locator(".sheet").innerText(), "Noch einmal geschafft?");
await mama.click(`[data-kv-fertig="${Q.id}"]`);
await mama.waitForSelector(`[data-kv-quest="${Q.id}"][data-zustand="wartet"]`);
pruefe("Wartet", await mama.locator(`[data-kv-quest="${Q.id}"]`).getAttribute("data-zustand"), "wartet");
st = await api("tok-fp", "state");
const meldung = st.meldungen.find((m) => m.claimed_by === lena.id);
pruefe("Die Meldung gehört Lena", !!meldung, true);

console.log("== Der Weg zum Wunsch — das Kind wählt");
await mama.click('[data-kv-ansicht="weg"]');
await mama.waitForSelector(".kv-weg");
pruefe("Neun Steine", await mama.locator(".kv-stein").count(), 9);
pruefe("Gemerkt", (await api("tok-fm", "state")).mitglieder.find((m) => m.id === lena.id).ansicht, "weg");
await mama.screenshot({ path: `${AUS}/uf5-weg.png` });
await mama.click("[data-kv-wunsch]");
const eis = st.belohnungen.find((b) => b.name === "Eis essen gehen");
await mama.click(`[data-kv-wunschwahl="${eis.id}"]`);
await mama.waitForSelector(`[data-kv-wunschwahl="${eis.id}"][aria-pressed="true"]`);
await mama.evaluate(() => document.getElementById("scrim").click());
enthaelt("Neues Ziel", await mama.locator(".kv-wegtext").innerText(), "Eis essen gehen");
await mama.click('[data-kv-ansicht="glas"]');
await mama.waitForSelector(".kv-spar");

console.log("== Neu laden bleibt in der Kinderansicht");
await mama.reload({ waitUntil: "networkidle" });
pruefe("Noch die Kinderansicht", await mama.locator(".kv").count(), 1);

console.log("== Zurück nur mit der PIN");
await mama.click("[data-kv-schloss]");
await toastLeeren(mama);
for (const z of "1111") await mama.click(`[data-kv-ziffer="${z}"]`);
enthaelt("Falsche PIN", await toastText(mama), "Die PIN stimmt nicht");
pruefe("Noch drin", await mama.locator(".kv").count(), 1);
for (const z of "2468") await mama.click(`[data-kv-ziffer="${z}"]`);
await mama.waitForSelector(".navbar");
pruefe("Wieder bei Mama", await mama.locator(".kv").count(), 0);

console.log("== Papa bestätigt, Mama zahlt Taschengeld aus");
await api("tok-fp", `claims/${meldung.id}/decide`, { status: "bestaetigt" });
// Papa hat auf seinem Handy bestätigt — Mamas App erfährt es beim nächsten Laden.
await mama.reload({ waitUntil: "networkidle" });
await jubelWeg(mama);
await mama.click('[data-go="wir"]');
const lenasStand = (await api("tok-fm", "state")).mitglieder.find((m) => m.id === lena.id).punkte;
pruefe("Lena: zweimal Spülmaschine", lenasStand, Q.points * 2);
await mama.click(`[data-auszahlen="${lena.id}"]`);
await mama.click(`[data-auszahl-betrag="${lenasStand}"]`);
enthaelt("In Euro", await mama.locator("[data-auszahlen-ok]").innerText(),
  (lenasStand / 10).toLocaleString("de-DE", { minimumFractionDigits: 2 }));
await toastLeeren(mama);
await mama.click("[data-auszahlen-ok]");
enthaelt("Gebucht", await toastText(mama), "Taschengeld für Lena");
pruefe("Lena: alles ausgezahlt", (await api("tok-fm", "state")).mitglieder.find((m) => m.id === lena.id).punkte, 0);
await mama.screenshot({ path: `${AUS}/uf6-wir.png` });

console.log("== Auch auf der Haushalt-Seite: Kind hinzufügen");
await mama.click('[data-go="einstellungen"]');
await mama.click('[data-go="haushalt"]');
pruefe("Der Knopf steht da", await mama.locator(".body [data-kind-neu]").count(), 1);
enthaelt("Kinder mit Stufe", await mama.locator(".body").innerText(), "Kind · Ohne Handy");
await mama.click(".body [data-kind-neu]");
enthaelt("Das Blatt öffnet sich", await mama.locator(".sheet h3").innerText(), "Kind hinzufügen");
await mama.evaluate(() => document.getElementById("scrim").click());
await mama.screenshot({ path: `${AUS}/uf9-haushalt.png` });

console.log("== Mias eigenes Gerät: QR-Link statt Google");
await api("tok-fp", "claims", { questId: st.quests.find((q) => q.name === "Bad reinigen").id });
const geraet = await seiteFuer(null);
await geraet.goto(`${ZIEL}/app/?kind=${code.replace("-", "")}`, { waitUntil: "networkidle" });
await geraet.waitForSelector(".kv");
enthaelt("Hallo Mia", await geraet.locator(".kv-hallo").innerText(), "Hallo Mia!");
pruefe("Kein Schloss", await geraet.locator("[data-kv-schloss]").count(), 0);
pruefe("Die Adresse ist sauber", new URL(geraet.url()).search, "");
pruefe("Papas Meldung zum Bestätigen", await geraet.locator(".kv-pruef").count(), 1);
pruefe("Nichts läuft über", await ueberlauf(geraet), false);
await geraet.screenshot({ path: `${AUS}/uf7-geraet.png` });
await geraet.click('.kv-pruef [data-entscheiden="claims"]');
await geraet.waitForSelector(".kv-pruef", { state: "detached" });
pruefe("Bestätigt", (await api("tok-fm", "state")).meldungen.filter((m) => m.claimed_by === "u-fp").length, 0);

console.log("== Anmelden mit Code, ohne Link");
const neu = await seiteFuer(null);
await neu.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await neu.click("[data-kind-code-eingeben]");
pruefe("Das Codefeld", await neu.locator("#kindcode-eingabe").count(), 1);
await neu.fill("#kindcode-eingabe", "ABCD-EFGH");
await toastLeeren(neu);
await neu.click("[data-kind-anmelden]");
enthaelt("Falscher Code", await toastText(neu), "unbekannt oder abgelaufen");

console.log("== Im Dunkeln");
const nacht = await seiteFuer("tok-fm", { dunkel: true });
await nacht.addInitScript((id) => localStorage.setItem("hq-kindmodus", id), lena.id);
await nacht.goto(`${ZIEL}/app/`, { waitUntil: "networkidle" });
await nacht.waitForSelector(".kv");
pruefe("Dunkler Grund", await nacht.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(15, 28, 49)");
await nacht.screenshot({ path: `${AUS}/uf8-dunkel.png` });

await browser.close();
console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES GRÜN");
process.exit(fehler ? 1 : 0);
