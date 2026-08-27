// Haus-Quest – Oberfläche.
//
// Diese Datei zeigt nur an und schickt Absichten an die Schnittstelle.
// Ob aus „erledigt“ Cleanies werden, entscheidet der Server — nie das Handy.

const app = document.getElementById("app");
const scrim = document.getElementById("scrim");
const celebrate = document.getElementById("celebrate");
const toastEl = document.getElementById("toast");
const confettiEl = document.getElementById("confetti");

let S = null;                  // Zustand vom Server
let ansicht = "start";
let filter = "Alle";
const suche = { quests: "", belohnungen: "" };
const sortierung = { quests: { nach: "punkte", ab: true }, belohnungen: { nach: "punkte", ab: false } };
let laderTimer = null;

/* ------------------------------------------------------------------ Werkzeug */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Der Stern hinter einer Zahl — er ist die Währung, so wie das €-Zeichen.
 *  Wo das Wort „Cleanies" ohnehin dasteht, braucht es ihn nicht. */
const cl = (n) => `${n}<img class="cleanie" src="/cleanie.webp" alt="Cleanies">`;

const icon = (id, s = 20) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;

async function api(pfad, daten) {
  const antwort = await fetch(`/api/${pfad}`, {
    method: daten ? "POST" : "GET",
    headers: daten ? { "Content-Type": "application/json" } : {},
    body: daten ? JSON.stringify(daten) : undefined
  });
  const ergebnis = await antwort.json().catch(() => ({}));
  if (!antwort.ok) throw new Error(ergebnis.fehler || "Da ist etwas schiefgegangen");
  return ergebnis;
}

function zeitpunkt(iso) {
  if (!iso) return "";
  const dann = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
  const min = Math.round((Date.now() - dann.getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  if (min < 24 * 60) return `vor ${Math.round(min / 60)} Std.`;
  if (min < 48 * 60) return "gestern";
  return dann.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/* ---------- Personen ---------- */
// Der Haushalt hat zwei oder zwanzig Mitglieder. Damit die Texte in beiden
// Fällen stimmen, gibt es hier einen Namen für „die anderen" und die passende
// Beugung dazu — statt überall „dein Partner" hart hineinzuschreiben.

const vorname = (n) => String(n || "").split(" ")[0];
const andere = () => S?.andere || [];
const mehrere = () => andere().length > 1;
const andereName = () => mehrere() ? "die anderen" : (andere()[0] ? vorname(andere()[0].name) : "niemand");
const beugung = (einzahl, mehrzahl) => mehrere() ? mehrzahl : einzahl;
/** Am Satzanfang wird aus „die anderen“ ein „Die anderen“. Namen bleiben, wie
 *  sie sind — sie sind ohnehin schon groß. */
const gross = (text) => String(text).charAt(0).toUpperCase() + String(text).slice(1);
const allein = () => andere().length === 0;
const nameVon = (id) => id === S?.ich?.id ? "Du"
  : vorname((S?.mitglieder || []).find((m) => m.id === id)?.name) || "jemand";
const mitglied = (id) => (S?.mitglieder || []).find((m) => m.id === id) || { id };

/** Zu zweit nebeneinander wie bisher, zu dritt und mehr als Liste — sonst
 *  schrumpfen die Cleanies-Stände auf dem Handy zu Briefmarken. */
function kontenTafel() {
  const alle = S.mitglieder || [];
  if (alle.length <= 2) {
    return `<div class="accounts">
      ${alle.map((m) => `
        <div class="account ${m.id === S.ich.id ? "me" : ""}">
          ${bild(m)}<span class="who">${esc(vorname(m.name))}</span>
          <span class="pts">${cl(m.punkte)}</span><span class="unit">Cleanies</span>
        </div>`).join("")}
    </div>`;
  }
  return `<div class="card konten">
    ${[...alle].sort((a, b) => b.punkte - a.punkte).map((m) => `
      <div class="konto">
        ${bild(m, "sm")}
        <span class="who">${esc(vorname(m.name))}${m.id === S.ich.id ? ' <span class="chip wait">du</span>' : ""}</span>
        <span class="pts">${cl(m.punkte)}</span>
      </div>`).join("")}
  </div>`;
}

const FIGUREN = { "fuchs": "/fox.webp", "wolf": "/wolf.webp" };

function bild(person, groesse = "") {
  const huelle = `avatar ${groesse}`;
  const eigen = person?.bild;
  if (eigen) {
    if (FIGUREN[eigen]) return `<span class="${huelle}"><img src="${FIGUREN[eigen]}" alt=""></span>`;
    if (eigen.startsWith("data:")) return `<span class="${huelle}"><img src="${esc(eigen)}" alt=""></span>`;
    return `<span class="${huelle}">${esc(eigen)}</span>`;
  }
  // Immer dieselbe Figur für dieselbe Person, egal in welcher Reihenfolge die
  // Liste gerade steht.
  const streu = [...String(person?.id || "")].reduce((n, z) => n + z.charCodeAt(0), 0);
  const ersatz = person?.id === S?.ich?.id || streu % 2 === 0 ? "/fox.webp" : "/wolf.webp";
  return `<span class="${huelle}"><img src="${esc(person?.avatar || ersatz)}" alt=""
    onerror="this.src='${ersatz}'"></span>`;
}

/* ------------------------------------------------------------------ Darstellung */
//
// Hell oder dunkel ist Sache des Geräts, nicht des Paars — die Wahl liegt
// deshalb im Speicher des Browsers und wandert nicht in die Datenbank.
// Gesetzt wird sie bereits im Kopf der Seite; hier wird sie nur noch geändert
// und der Systemeinstellung nachgeführt, solange „System“ gewählt ist.

const THEMEN = [
  { id: "system", label: "System" },
  { id: "hell", label: "Hell" },
  { id: "dunkel", label: "Dunkel" }
];

const systemDunkel = matchMedia("(prefers-color-scheme: dark)");

function themaWahl() {
  try { return localStorage.getItem("hq-thema") || "system"; } catch { return "system"; }
}

function themaAnwenden() {
  const wahl = themaWahl();
  const dunkel = wahl === "dunkel" || (wahl === "system" && systemDunkel.matches);
  document.documentElement.dataset.theme = dunkel ? "dunkel" : "hell";
  const marke = document.querySelector('meta[name="theme-color"]');
  if (marke) marke.content = dunkel ? "#0f1c31" : "#ffffff";
}

function themaSetzen(wahl) {
  try { localStorage.setItem("hq-thema", wahl); } catch { /* dann gilt es nur für dieses Mal */ }
  themaAnwenden();
}

systemDunkel.addEventListener("change", () => { if (themaWahl() === "system") themaAnwenden(); });

/* ------------------------------------------------------------------ Rückmeldung */

let toastTimer;
function toast(text, fehler = false) {
  toastEl.className = "toast" + (fehler ? " fehler" : "");
  toastEl.innerHTML = `${icon(fehler ? "i-info" : "i-check", 18)}<span>${esc(text)}</span>`;
  toastEl.setAttribute("data-open", "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.removeAttribute("data-open"), 3200);
}

function konfetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const farben = ["#ec0f06", "#ffffff", "#f0913f", "#a9a6a1"];
  confettiEl.innerHTML = Array.from({ length: 34 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${farben[i % farben.length]};animation-delay:${(Math.random() * .6).toFixed(2)}s"></i>`
  ).join("");
  setTimeout(() => { confettiEl.innerHTML = ""; }, 2600);
}

function feiern({ punkte = 0, titel = "", text = "", positiv = true }) {
  const posen = ["anim-a", "anim-b", "anim-c"];
  const pose = posen[Math.floor(Math.random() * posen.length)];

  celebrate.innerHTML = `
    <img src="/logo.webp" alt="" class="${positiv ? pose : ""}" ${positiv ? "" : 'style="opacity:.75"'}>
    ${positiv && punkte ? '<div class="big">+0</div>' : ""}
    <div class="cap" style="font-size:19px;font-weight:700;opacity:1">${esc(titel)}</div>
    ${text ? `<div class="cap">${esc(text)}</div>` : ""}
    <button class="btn ghost" data-schliessen>Weiter</button>`;
  celebrate.setAttribute("data-open", "");

  if (positiv) {
    konfetti();
    if (navigator.vibrate) navigator.vibrate([18, 60, 30]);
  } else if (navigator.vibrate) {
    navigator.vibrate(40);
  }

  const ziel = celebrate.querySelector(".big");
  if (!ziel || !punkte) return;
  let v = 0;
  const schritt = Math.max(1, Math.round(Math.abs(punkte) / 14));
  const uhr = setInterval(() => {
    v = Math.min(Math.abs(punkte), v + schritt);
    ziel.textContent = (punkte < 0 ? "−" : "+") + v;
    if (v >= Math.abs(punkte)) clearInterval(uhr);
  }, 45);
}

celebrate.addEventListener("click", (ev) => {
  if (!ev.target.closest("[data-schliessen]") && ev.target !== celebrate) return;
  celebrate.removeAttribute("data-open");
  setTimeout(naechstesEreignis, 250);
});

/* ------------------------------------------------------------------ Laden */

async function laden(still = false) {
  try {
    S = await api("state");
    zeichne();
    await ereignisseZeigen();
  } catch (fehler) {
    if (String(fehler.message).includes("Nicht angemeldet")) {
      S = { angemeldet: false };
      zeichne();
    } else if (!still) {
      toast(fehler.message, true);
    }
  }
}

/** Was der Partner entschieden hat, während die App zu war.
 *  Mehrere Ereignisse werden nacheinander gezeigt, keins fällt unter den Tisch. */
let ereignisWarteschlange = [];

async function ereignisseZeigen() {
  const liste = S?.ereignisse || [];
  if (liste.length) {
    S.ereignisse = [];
    ereignisWarteschlange.push(...liste);
    api("events/gelesen", { ids: liste.map((e) => e.id) }).catch(() => {});
  }
  naechstesEreignis();
}

function naechstesEreignis() {
  if (celebrate.hasAttribute("data-open") || scrim.hasAttribute("data-open")) return;
  const e = ereignisWarteschlange.shift();
  if (!e) return;

  if (e.art === "bestaetigt" || e.art === "abgelehnt") {
    feiern({
      punkte: e.art === "bestaetigt" ? e.punkte : 0,
      titel: e.titel,
      text: e.text,
      positiv: e.art === "bestaetigt"
    });
  } else {
    toast(e.titel);
    naechstesEreignis();
  }
}

function zeichne() {
  if (!S) return;
  if (!S.angemeldet) return anmelden();
  if (!S.eingerichtet) return einrichtung();
  if (ansicht === "einladen") return einladen();

  const nav = [
    { id: "start", label: "Start", icon: "i-home" },
    { id: "quests", label: "Quests", icon: "i-broom" },
    { id: "pruefen", label: "Prüfen", icon: "i-shield", badge: zuPruefen().length },
    { id: "belohnungen", label: "Belohnung", icon: "i-gift" },
    { id: "wir", label: "Wir", icon: "i-vote" }
  ];

  const inhalt = {
    start: schirmStart, quests: schirmQuests, pruefen: schirmPruefen,
    belohnungen: schirmBelohnungen, wir: schirmWir, verlauf: schirmVerlauf,
    statistik: schirmStatistik, einstellungen: schirmEinstellungen,
    raeume: schirmRaeume, haushalt: schirmHaushalt, urlaub: schirmUrlaub,
    plan: schirmPlan, aufgabe: schirmAufgabe
  }[ansicht] || schirmStart;

  // Unterseiten haben keinen eigenen Knopf in der Leiste. Damit trotzdem immer
  // ein Reiter leuchtet, zeigen sie auf den, aus dem sie hervorgehen.
  const aktiv = { verlauf: "start", statistik: "start", einstellungen: "start",
                  raeume: "start", haushalt: "start", plan: "start", aufgabe: "start" }[ansicht] || ansicht;

  app.innerHTML = inhalt() + `
    <nav class="navbar">
      ${nav.map((n) => `
        <button data-go="${n.id}" aria-current="${aktiv === n.id}">
          ${n.badge ? `<span class="badge-n">${n.badge}</span>` : ""}
          ${icon(n.icon, 21)}${n.label}
        </button>`).join("")}
    </nav>`;
}

/* ------------------------------------------------------------------ Anmeldung */

function anmelden() {
  app.innerHTML = `
    <div class="mitte">
      <img class="logo" src="/logo.webp" alt="Ein Fuchs und ein Wolf">
      <h1>Haus-Quest</h1>
      <p>Cleanies für erledigte Aufgaben.<br>Freigegeben nur zu zweit.</p>
      <a class="btn ghost" href="/api/auth/start" style="gap:10px">${icon("i-google", 20)}Mit Google anmelden</a>
      <p style="font-size:12px;color:var(--ink-3);margin-top:18px;max-width:30ch">
        Gespeichert werden Name, E-Mail und Profilbild aus deinem Google-Konto — sonst nichts.
      </p>
    </div>`;
}

/* ------------------------------------------------------------------ Einrichtung */
//
// Der Weg beim allerersten Öffnen. Er läuft genau einmal: Name und Bild,
// Begrüßung, Art des Haushalts mit Teilnehmerzahl, Räume, zwei Erklärseiten,
// starten. Wer eingeladen wurde, biegt gleich auf der Begrüßung zum Code ab.

const ARTEN = [
  { id: "wg", k: "WG", m: "Mehrere Erwachsene, geteilte Aufgaben" },
  { id: "familie", k: "Familie", m: "Eltern und Kinder unter einem Dach" },
  { id: "paar", k: "Pärchen", m: "Meist zwei — mehr geht auch" },
  { id: "sonstige", k: "Sonstige", m: "Passt nichts davon? Dann das hier" }
];

const BILDWAHL = ["fuchs", "wolf", "★", "☾", "☀", "♣", "◆", "☘", "☕", "⚑"];

const E = {
  schritt: 0,
  name: "",
  bild: "fuchs",
  art: "paar",
  erwachsene: 2,
  kinder: 1,
  personen: 2,
  raeume: null,
  code: ""
};

const eZahl = () => E.art === "familie" ? E.erwachsene + E.kinder : E.personen;

function eRaeume() {
  if (!E.raeume) E.raeume = new Set((S.raumvorschlaege || []).slice(0, 5));
  return E.raeume;
}

function huelle(inhalt, fuss) {
  app.innerHTML = `<div class="schritt">${inhalt}</div><div class="schrittfuss">${fuss}</div>`;
}

function einrichtung() {
  if (E.schritt < 0) return eCodeSchirm();
  if (!E.name) E.name = vorname(S.ich.name);
  if (!E.bild && S.ich.bild) E.bild = S.ich.bild;
  const bauer = [eName, eBegruessung, eHaushalt, eRaumwahl, eFinden, eErhalten, eStarten][E.schritt] || eName;
  bauer();
}

function eCleanies() {
  return `<div class="schrittpunkte">${
    Array.from({ length: 7 }, (_, i) => `<i ${i === E.schritt ? "data-an" : ""}></i>`).join("")}</div>`;
}

function eName() {
  huelle(`
    <div class="appbar"><div>
      <div class="title">Wie sollen wir dich nennen?</div>
      <div class="sub">Vorname, Spitzname — was dir lieber ist</div></div></div>
    <div class="body ohne-leiste">
      <div class="card" style="align-items:center;gap:10px">
        ${bild({ bild: E.bild }, "gr")}
        <div style="font-size:12.5px;color:var(--ink-3)">So sehen dich die anderen</div>
      </div>
      <div class="field">
        <label>Dein Name</label>
        <input id="e-name" maxlength="40" autocomplete="off" value="${esc(E.name)}" placeholder="z. B. Ramon">
      </div>
      <p class="section-label">Dein Bild</p>
      <div class="bildwahl">
        ${BILDWAHL.map((b) => `
          <button class="bw" data-ebild="${esc(b)}" ${E.bild === b ? "data-an" : ""} aria-label="Bild ${esc(b)}">
            ${FIGUREN[b] ? `<img src="${FIGUREN[b]}" alt="">` : esc(b)}
          </button>`).join("")}
      </div>
      <button class="btn ghost block" data-foto style="font-size:14px">Eigenes Foto wählen</button>
      <input type="file" id="fotofeld" accept="image/*" hidden>
      <div class="note">${icon("i-info", 16)}<span>Beides lässt sich später jederzeit in den
        Einstellungen ändern — dafür braucht es keine Abstimmung.</span></div>
    </div>`,
    `<button class="btn primary block" data-eweiter>Weiter</button>${eCleanies()}`);
}

function eBegruessung() {
  huelle(`
    <div class="mitte">
      <img class="logo" src="/logo.webp" alt="">
      <h1>Schön, dass du da bist,<br>${esc(E.name || "Du")}</h1>
      <p>Ab hier zählt jede erledigte Aufgabe. Wir richten in drei kurzen Schritten
        euren Haushalt ein — danach könnt ihr sofort loslegen.</p>
    </div>`,
    `<button class="btn primary block" data-eweiter>Los geht's</button>
     <button class="btn text block" data-ezurueck>Name doch noch ändern</button>
     <button class="btn text block" data-ecode>Ich wurde eingeladen — Code eingeben</button>
     ${eCleanies()}`);
}

function eHaushalt() {
  const zaehler = (feld, bezeichnung, min) => `
    <div class="stepper">
      <button data-ezaehl="${feld}:-1" aria-label="weniger">−</button>
      <span class="val">${E[feld]}</span>
      <button data-ezaehl="${feld}:1" aria-label="mehr">+</button>
      <span style="margin-left:auto;font-size:12.5px;color:var(--ink-2)">${bezeichnung}</span>
    </div>`;

  huelle(`
    <div class="appbar"><div>
      <div class="title">Euer Haushalt</div>
      <div class="sub">Danach richtet sich, wie die App mit euch rechnet</div></div></div>
    <div class="body ohne-leiste">
      <div class="kacheln">
        ${ARTEN.map((a) => `
          <button class="kachel" data-eart="${a.id}" ${E.art === a.id ? "data-an" : ""}>
            <span class="k">${a.k}</span><span class="m">${a.m}</span>
          </button>`).join("")}
      </div>

      <p class="section-label">Wie viele seid ihr?</p>
      <div class="card">
        ${E.art === "familie"
          ? zaehler("erwachsene", "Erwachsene", 1) + zaehler("kinder", "Kinder", 0)
          : zaehler("personen", "Teilnehmer", 1)}
      </div>
      <div class="note">${icon("i-info", 16)}<span>${E.art === "familie"
        ? "<b>Erwachsene verwalten.</b> Einladen, entfernen, Haushaltstyp ändern — das können nur sie. Beim Melden, Bestätigen, Beantragen und Abstimmen haben Kinder dieselben Rechte."
        : `<b>${E.art === "wg" ? "Wer einrichtet, verwaltet." : "Du verwaltest."}</b> Das heißt nur: einladen und entfernen. Sonst haben alle dieselben Rechte.${
            E.art === "paar" ? " Zwei sind der Normalfall, mehr geht genauso." : ""}`}</span></div>
    </div>`,
    `<button class="btn primary block" data-eweiter>Weiter</button>
     <button class="btn text block" data-ezurueck>Zurück</button>${eCleanies()}`);
}

function eRaumwahl() {
  const gewaehlt = eRaeume();
  const liste = [...new Set([...(S.raumvorschlaege || []), ...gewaehlt])];
  huelle(`
    <div class="appbar"><div>
      <div class="title">Eure Räume</div>
      <div class="sub">${gewaehlt.size} ausgewählt · jederzeit änderbar</div></div></div>
    <div class="body ohne-leiste">
      <div class="raumwahl">
        ${liste.map((r) => `
          <button class="raum" data-eraum="${esc(r)}" ${gewaehlt.has(r) ? "data-an" : ""}>
            <span class="haken">${gewaehlt.has(r) ? "✓" : ""}</span><span class="n">${esc(r)}</span>
          </button>`).join("")}
      </div>
      <button class="btn ghost block" data-eneuerraum style="font-size:14px">+ Eigenen Raum anlegen</button>
      <div class="note">${icon("i-info", 16)}<span>Die Räume sind später die <b>Kategorien eurer
        Quests</b>: danach wird sortiert, gefiltert und gesucht. Auch eine Aktion wie
        „+100 % auf Küche“ hängt daran.</span></div>
    </div>`,
    `<button class="btn primary block" data-eweiter ${gewaehlt.size ? "" : "disabled"}>Weiter</button>
     <button class="btn text block" data-ezurueck>Zurück</button>${eCleanies()}`);
}

function eFinden() {
  huelle(`
    <div class="mitte">
      <img class="logo" src="/fox.webp" alt="" style="width:min(160px,45vw)">
      <h1 style="font-size:27px">Ordnung finden und<br>Belohnungen schaffen</h1>
      <p style="max-width:34ch">Entdecke mit Quests Schritt für Schritt eine neue Grundordnung für
        dein Zuhause. Strukturiere deine Räume ganz einfach anhand verschiedener Questpunkte neu
        und erlebe dabei, wie aus kleinen Aufgaben sichtbare Fortschritte werden. So wird es
        langfristig leichter und sogar ein bisschen spaßiger, die Ordnung zu bewahren.</p>
    </div>`,
    `<button class="btn primary block" data-eweiter>Weiter</button>
     <button class="btn text block" data-ezurueck>Zurück</button>${eCleanies()}`);
}

function eErhalten() {
  huelle(`
    <div class="mitte">
      <img class="logo" src="/wolf.webp" alt="" style="width:min(160px,45vw)">
      <h1 style="font-size:27px">Ordnung konstant erhalten</h1>
      <p style="max-width:34ch">Plane wiederkehrende Haushaltsaufgaben ganz entspannt und sorge
        dafür, dass Ordnung und Sauberkeit langfristig erhalten bleiben. Haus-Quest unterstützt
        dich dabei mit einem individuellen Jahresplan, der sich ganz automatisch auf Basis deiner
        Angaben erstellt. So habt ihr alle Aufgaben und Quests jederzeit im Blick und könnt euren
        Haushalt Schritt für Schritt leichter organisieren.</p>
    </div>`,
    `<button class="btn primary block" data-eweiter>Weiter</button>
     <button class="btn text block" data-ezurueck>Zurück</button>${eCleanies()}`);
}

function eStarten() {
  const art = ARTEN.find((a) => a.id === E.art);
  huelle(`
    <div class="mitte">
      <img class="logo" src="/logo.webp" alt="">
      <h1>Alles steht</h1>
      <p>${esc(art.k)} · ${eZahl()} ${eZahl() === 1 ? "Person" : "Personen"} · ${eRaeume().size} Räume</p>
    </div>`,
    `<button class="btn primary block" data-eanlegen>Jetzt starten</button>
     <button class="btn text block" data-ezurueck>Zurück</button>${eCleanies()}`);
}

/* ------------------------------------------------------------------ Einladen */

function einladen() {
  const frei = Math.max(0, S.haushalt.groesse - S.mitglieder.length);
  app.innerHTML = `
    <div class="appbar">
      <button class="iconbtn links" data-go="start" aria-label="Zurück">‹</button>
      <div><div class="title">Die anderen holen</div>
        <div class="sub">${frei ? `Es ${frei === 1 ? "fehlt" : "fehlen"} noch ${frei} von ${S.haushalt.groesse}`
                                : "Alle sind da"}</div></div>
    </div>
    <div class="body ohne-leiste">
      ${S.code ? `
      <div class="card" style="align-items:center;gap:8px">
        <span class="section-label" style="margin:0">Euer Einladecode</span>
        <span class="codeanzeige">${esc(S.code)}</span>
        <div class="btnrow" style="width:100%">
          <button class="btn ghost" data-teilen>Teilen</button>
          <button class="btn ghost" data-neuladen>Aktualisieren</button>
        </div>
        <div style="font-size:12px;color:var(--ink-3);text-align:center">
          Gilt 24 Stunden und für ${frei} ${frei === 1 ? "Person" : "Personen"}.</div>
      </div>` : `
      <div class="card flat" style="font-size:13.5px;color:var(--ink-2)">
        Der Haushalt ist voll. Mehr Plätze gibt es in den Einstellungen unter „Haushalt“.
      </div>`}

      <p class="section-label">Schon dabei</p>
      ${S.mitglieder.map((m) => `
        <div class="rowlink" style="cursor:default">
          ${bild(m)}
          <span class="grow"><span class="t">${esc(vorname(m.name))}</span>
            <span class="m">${m.rolle === "verwalter" ? "Verwaltet den Haushalt" : "Mitglied"}</span></span>
          ${m.id === S.ich.id ? '<span class="chip wait">du</span>' : ""}
        </div>`).join("")}
      ${Array.from({ length: frei }, (_, i) => `
        <div class="rowlink" style="border-style:dashed;opacity:.65;cursor:default">
          <span class="avatar">?</span>
          <span class="grow"><span class="t">Platz ${S.mitglieder.length + i + 1}</span>
            <span class="m">Wartet auf den Code</span></span>
        </div>`).join("")}

      <div class="note">${icon("i-lock", 16)}<span>Ein Konto gehört zu genau einem Haushalt.
        Alle Daten gehören euch — niemand sonst sieht sie.</span></div>
    </div>`;
}

/** Wer eingeladen wurde, gibt hier den Code ein statt einzurichten. */
function eCodeSchirm() {
  huelle(`
    <div class="appbar"><div>
      <div class="title">Code eingeben</div>
      <div class="sub">Angemeldet als ${esc(S.ich.name)}</div></div></div>
    <div class="body ohne-leiste">
      <div class="card flat leer">
        <img src="/logo.webp" alt="">
        <div class="t">Der Code steht in der App der Person, die den Haushalt eingerichtet hat.</div>
      </div>
      <div class="card">
        <div class="field">
          <label>Einladecode</label>
          <input class="codefeld" id="code-eingabe" inputmode="numeric" maxlength="6" placeholder="000000">
        </div>
        <button class="btn dark block" data-paar-beitreten>Beitreten</button>
      </div>
    </div>`,
    `<button class="btn text block" data-ezurueck>Doch selbst einrichten</button>`);
}

/* ------------------------------------------------------------------ Hilfen zum Zustand */

/** Alles, was auf meine Entscheidung wartet. Was hier steht, steht beim
 *  Absender auf der Startseite unter „Wartet auf …“ — beides ist dieselbe
 *  Sache aus den zwei Blickrichtungen. Auch Abstimmungen gehören dazu:
 *  solange meine Stimme fehlt, bin ich der Empfänger. */
const zuPruefen = () => [
  ...S.meldungen.filter((m) => m.claimed_by !== S.ich.id && !m.rueckfrage).map((m) => ({ ...m, art: "meldung" })),
  ...offeneAbstimmungen().filter((a) => a.meine === undefined || a.meine === null)
    .map((a) => ({ ...a, vorschlag: a.art, art: "abstimmung" })),
  ...belohnungenOffen().filter((r) => r.requested_by === S.ich.id && r.erfuellt === "offen")
    .map((r) => ({ ...r, art: "empfang" })),
  ...belohnungenOffen().filter((r) => r.requested_by === S.ich.id && r.erfuellt === "nachgeholt")
    .map((r) => ({ ...r, art: "nachhol" })),
  ...S.antraege.filter((a) => a.requested_by !== S.ich.id && !a.rueckfrage).map((a) => ({ ...a, art: "antrag" })),
  ...S.uebertragungen.filter((u) => u.to_member === S.ich.id).map((u) => ({ ...u, art: "uebertragung" }))
];

/* ---------- Haushaltsplan ---------- */

const plan = () => S.plan || [];
const ueberfaellig = () => plan().filter((a) => a.offen < 0 && !a.pruefung);
/** Wo ich selbst gefragt bin: entscheiden, erledigen oder eine Meldung prüfen. */
const meinePlanSachen = () => plan().filter((a) =>
  a.dran === S.ich.id || (a.zugewiesen === S.ich.id && a.offen <= 0 && !a.pruefung));

/* ---------- Urlaub ---------- */

const heute = () => new Date().toISOString().slice(0, 10);
const urlaube = () => S.urlaube || [];
const laeuft = (u) => u.von <= heute() && u.bis >= heute();
/** Der laufende Haushaltsurlaub, falls einer läuft. */
const hausUrlaub = () => urlaube().find((u) => u.art === "haushalt" && laeuft(u)) || null;
/** Mein eigener laufender Urlaub. */
const meinUrlaub = () => urlaube().find((u) => u.art === "person" && u.member_id === S.ich.id && laeuft(u)) || null;
/** Alle, die heute weg sind — auch die anderen. */
const abwesende = () => urlaube().filter((u) => u.art === "person" && laeuft(u));
/** Was noch kommt, aber noch nicht angefangen hat. */
const kommendeUrlaube = () => urlaube().filter((u) => u.von > heute());

const datumKurz = (d) => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : "";
const TAG_MS = 86400000;
const alsZahl = (d) => Date.parse(d + "T12:00:00Z");
const tageZwischen = (von, bis) => Math.round((alsZahl(bis) - alsZahl(von)) / TAG_MS) + 1;
const nochTage = (u) => Math.max(0, tageZwischen(heute(), u.bis));
/** Wie der Haushalt von sich spricht. */
const hausWort = () => ({ wg: "Die WG", familie: "Die Familie", paar: "Wir" })[S.haushalt?.art] || "Der Haushalt";

const RHYTHMEN = ["1× pro Woche", "2× pro Woche", "3× pro Woche", "1× alle 2 Wochen", "1× im Monat", "1× im Quartal"];
const RHYTHMUS_TAGE = { "1× pro Woche": 7, "2× pro Woche": 3, "3× pro Woche": 2,
                        "1× alle 2 Wochen": 14, "1× im Monat": 30, "1× im Quartal": 90 };

function fristText(offen) {
  if (offen < 0) return { text: `${-offen} ${-offen === 1 ? "Tag" : "Tage"} überfällig`, art: "rot" };
  if (offen === 0) return { text: "Heute fällig", art: "gelb" };
  return { text: `Fällig in ${offen} ${offen === 1 ? "Tag" : "Tagen"}`, art: "ruhig" };
}

function planBalken(a) {
  const anteil = a.offen < 0 ? 1 : Math.max(0, Math.min(1, (a.tage - a.offen) / a.tage));
  const farbe = a.offen < 0 ? "var(--accent)" : a.offen <= 2 ? "var(--bald)" : "var(--ruhig)";
  return `<span class="balken"><i style="width:${Math.round(anteil * 100)}%;background:${farbe}"></i></span>`;
}

const meineOffenen = () => S.meldungen.filter((m) => m.claimed_by === S.ich.id);

/** Alles, was ich losgeschickt habe und worauf ich noch warte — Meldungen,
 *  Anträge auf Belohnungen und angebotene Übertragungen. */
const meineOffenenSachen = () => [
  ...meineOffenen().map((m) => ({
    id: m.id, bereich: "claims",
    titel: m.quest + (m.quantity > 1 ? ` · ${m.quantity}×` : ""), was: "Quest gemeldet",
    zusatz: m.rueckfrage ? "Rückfrage offen" : "", punkte: `+${cl(m.quantity * m.points_each)}`,
    nachricht: m.note || "", created_at: m.created_at
  })),
  ...S.antraege.filter((a) => a.requested_by === S.ich.id).map((a) => ({
    id: a.id, bereich: "requests",
    titel: a.belohnung, was: "Belohnung beantragt",
    zusatz: a.rueckfrage ? "Rückfrage offen"
      : a.gutschrift_an ? `an ${nameVon(a.gutschrift_an)}${a.wish_date ? ` · ${a.wish_date}` : ""}`
      : (a.wish_date || ""), punkte: `−${cl(a.cost)}`,
    nachricht: a.message || "", termin: a.wish_date || "", created_at: a.created_at
  })),
  ...S.uebertragungen.filter((u) => u.from_member === S.ich.id).map((u) => ({
    id: u.id, bereich: "transfers",
    titel: `Cleanies an ${nameVon(u.to_member)}`, was: "Übertragung angeboten",
    zusatz: "", punkte: `−${cl(u.amount)}`,
    nachricht: u.message || "", created_at: u.created_at
  }))
].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
const belohnungenOffen = () => S.belohnungenOffen || [];
/** Rückfragen, auf die ich antworten muss — an meinen eigenen Anträgen. */
const meineRueckfragen = () => [
  ...S.meldungen.filter((m) => m.claimed_by === S.ich.id && m.rueckfrage).map((m) => ({ ...m, bereich: "claims", titel: m.quest })),
  ...S.antraege.filter((a) => a.requested_by === S.ich.id && a.rueckfrage).map((a) => ({ ...a, bereich: "requests", titel: a.belohnung }))
];
/** Was ich zugesagt habe und noch schulde. */
const meineZusagen = () => belohnungenOffen().filter((r) => r.decided_by === S.ich.id
  && (r.erfuellt === "offen" || (r.erfuellt === "nicht_erhalten" && r.nachholbar)));
const offeneAbstimmungen = () => S.abstimmungen.filter((a) => a.status === "offen");

/* ------------------------------------------------------------------ Aktionen */

const laufendeAktionen = () => {
  const jetzt = new Date().toISOString().slice(0, 19).replace("T", " ");
  return (S.aktionen || []).filter((a) => a.beginn <= jetzt && a.ende > jetzt);
};

function restzeit(ende) {
  const bis = new Date(ende.replace(" ", "T") + "Z").getTime();
  const std = Math.max(0, Math.round((bis - Date.now()) / 3600000));
  if (std < 1) return "läuft aus";
  if (std < 24) return `noch ${std} Std.`;
  const tage = Math.round(std / 24);
  return `noch ${tage} ${tage === 1 ? "Tag" : "Tage"}`;
}

function aktionsBanner(nur = null) {
  const liste = laufendeAktionen().filter((a) => !nur || a.art === nur);
  if (!liste.length) return "";
  return liste.map((a) => `
    <div class="card alert" style="gap:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:var(--accent);flex:none">${icon("i-heart", 20)}</span>
        <span style="flex:1;font-size:14.5px;font-weight:700">
          ${a.art === "quest_bonus"
            ? `+${a.prozent} % Cleanies${a.kategorie ? ` auf ${esc(a.kategorie)}` : " auf alles"}`
            : `${a.prozent} % Rabatt auf Belohnungen`}</span>
        <span class="chip wait">${restzeit(a.ende)}</span>
      </div>
    </div>`).join("");
}

/* ------------------------------------------------------------------ Start */

function schirmStart() {
  const offen = zuPruefen();
  const abst = offeneAbstimmungen();

  return `
    <div class="appbar">
      <div>
        <div class="title">Hallo ${esc(S.ich.name.split(" ")[0])}</div>
        <div class="sub">${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</div>
      </div>
      <button class="iconbtn" data-go="verlauf" aria-label="Verlauf">${icon("i-clock", 18)}</button>
      <button class="iconbtn" data-go="einstellungen" aria-label="Einstellungen">${icon("i-zahnrad", 18)}</button>
    </div>
    <div class="body">
      ${kontenTafel()}

      ${urlaubBanner()}

      ${aktionsBanner()}

      ${offen.length ? `
      <div class="card alert">
        <div style="display:flex;gap:11px;align-items:center">
          <span style="color:var(--accent);flex:none">${icon("i-shield", 22)}</span>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${offen.length} ${offen.length === 1 ? "Sache wartet" : "Sachen warten"} auf dich</div>
            <div style="font-size:12.5px;color:var(--ink-2)">Ohne dein OK gibt es keine Cleanies.</div>
          </div>
        </div>
        <button class="btn primary block" data-go="pruefen">Jetzt prüfen</button>
      </div>` : ""}

      ${meineRueckfragen().map((r) => `
      <div class="card alert">
        <div style="display:flex;gap:11px;align-items:center">
          ${bild(mitglied(r.rueckfrage_von), "sm")}
          <span style="flex:1">
            <span style="font-size:12px;color:var(--ink-3);display:block">
              ${esc(nameVon(r.rueckfrage_von))} fragt nach · ${zeitpunkt(r.rueckfrage_am)}</span>
            <span style="font-size:14.5px;font-weight:700;display:block">${esc(r.titel)}</span>
          </span>
        </div>
        <div style="font-size:12.5px;color:var(--ink-2)">„${esc(r.rueckfrage)}“${
          r.vorschlag_datum ? ` · Vorschlag: <b>${esc(r.vorschlag_datum)}</b>` : ""}</div>
        <button class="btn primary block" data-sheet="antwort" data-bereich="${r.bereich}" data-id="${r.id}">Antworten</button>
      </div>`).join("")}

      ${meineZusagen().map((r) => `
      <button class="rowlink" data-sheet="zusage" data-id="${r.id}"
        style="border-color:${r.erfuellt === "nicht_erhalten" ? "var(--accent)" : "var(--line)"}">
        <span class="avatar sm" style="background:var(--tint);color:var(--accent)">${icon("i-gift", 18)}</span>
        <span class="grow"><span class="t">${r.erfuellt === "nicht_erhalten"
            ? `${esc(r.belohnung)} — nachholen?` : `Du schuldest: ${esc(r.belohnung)}`}</span>
          <span class="m">${r.erfuellt === "nicht_erhalten"
            ? `${r.cost} Cleanies ab · noch rückholbar`
            : `für ${esc(nameVon(r.requested_by))}${r.wish_date ? ` · ${esc(r.wish_date)}` : ""}`}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>`).join("")}

      ${ueberfaellig().length ? `
      <div class="card alert">
        <div style="font-size:14.5px;font-weight:700">
          ${ueberfaellig().length} ${ueberfaellig().length === 1 ? "Aufgabe ist" : "Aufgaben sind"} überfällig</div>
        <div style="font-size:12.5px;color:var(--ink-2)">
          ${ueberfaellig().slice(0, 3).map((a) => `${esc(a.name)} seit ${-a.offen} ${-a.offen === 1 ? "Tag" : "Tagen"}`).join(", ")}.
          ${ueberfaellig().some((a) => a.offen <= -5) ? "Ab sieben Tagen kostet es die ganze Gruppe Cleanies." : ""}</div>
        <button class="btn primary block" data-go="plan">Zum Haushaltsplan</button>
      </div>` : ""}

      ${meinePlanSachen().map((a) => `
      <button class="rowlink" data-plan="${a.id}" style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-shield", 18)}</span>
        <span class="grow"><span class="t">${a.dran === S.ich.id ? "Du bist dran" : "Gehört dir"}: ${esc(a.name)}</span>
          <span class="m">${a.dran === S.ich.id ? "Annehmen oder weiterreichen" : "Erledigt melden"}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>`).join("")}


      ${S.haushalt.belegt < S.haushalt.groesse ? `
      <button class="rowlink" data-go="einladen" style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-plus", 18)}</span>
        <span class="grow"><span class="t">Es fehlen noch ${S.haushalt.groesse - S.haushalt.belegt}</span>
          <span class="m">${allein() ? "Allein geht hier wenig: Bestätigen braucht zwei."
            : "Code teilen, damit alle dabei sind"}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>` : ""}

      ${pushOffen() ? `
      <button class="rowlink" data-push style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-bell", 18)}</span>
        <span class="grow"><span class="t">Benachrichtigungen einschalten</span>
          <span class="m">Damit du merkst, wenn ${esc(andereName())} etwas ${beugung("meldet", "melden")}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>` : ""}

      <div class="quick">
        <button data-go="quests">${icon("i-broom", 21)}Quest erledigt</button>
        <button data-go="belohnungen">${icon("i-gift", 21)}Belohnung</button>
        <button data-sheet="transfer">${icon("i-swap", 21)}Cleanies senden</button>
      </div>

      ${meineOffenenSachen().length ? `
      <p class="section-label">Wartet auf ${esc(andereName())}</p>
      <div class="card" style="gap:9px">
        ${meineOffenenSachen().map((o) => `
          <button class="offene-zeile" data-sheet="meins" data-bereich="${o.bereich}" data-id="${o.id}">
            <span style="flex:1;min-width:0;text-align:left">
              <span style="font-size:13.5px;display:block">${esc(o.titel)}</span>
              <span style="font-size:11.5px;color:var(--ink-3)">${esc(o.was)}${
                o.zusatz ? ` · ${esc(o.zusatz)}` : ""} · ${zeitpunkt(o.created_at)}</span>
              ${o.nachricht ? `<span style="font-size:11.5px;color:var(--ink-2);display:block">„${esc(o.nachricht)}“</span>` : ""}
            </span>
            <span class="pts-pill">${o.punkte}</span>
            <span style="color:var(--ink-3);flex:none">›</span>
          </button>`).join("")}
      </div>
      <div style="font-size:11.5px;color:var(--ink-3);margin-top:-6px">
        Offen, bis ${esc(andereName())} ${beugung("entscheidet", "entscheiden")}.
        Solange kannst du nachbessern oder zurückziehen.</div>` : ""}

      ${abst.length ? `
      ${aktionsBanner()}

      <p class="section-label">Aktionen</p>
      <button class="rowlink" data-sheet="aktion" style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-heart", 18)}</span>
        <span class="grow"><span class="t">Aktion starten</span>
          <span class="m">Doppelte Cleanies oder Rabatt — befristet, nur gemeinsam</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Offene Abstimmungen</p>
      ${abst.slice(0, 2).map(abstimmungKarte).join("")}` : ""}

      <button class="rowlink" data-go="plan">
        <span class="avatar sm" style="background:var(--tint);color:var(--ruhig)">${icon("i-broom", 18)}</span>
        <span class="grow"><span class="t">Haushaltsplan</span>
          <span class="m">${plan().length} wiederkehrende ${plan().length === 1 ? "Aufgabe" : "Aufgaben"}${
            ueberfaellig().length ? ` · ${ueberfaellig().length} überfällig` : ""}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <button class="rowlink" data-go="statistik">
        <span class="avatar sm" style="background:var(--tint);color:var(--reihe-ich)">${icon("i-chart", 18)}</span>
        <span class="grow"><span class="t">Auswertung</span>
          <span class="m">Cleanies je Tag, Wochen- und Monatsprognose</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Letzte Aktivität</p>
      ${S.verlauf.length ? `
      <ul class="card feed">
        ${S.verlauf.slice(0, 6).map((b) => `
          <li><span class="dot ${b.delta < 0 ? "red" : ""}"></span>
            <span class="txt"><b>${esc(nameVon(b.member_id))}</b> ·
              ${esc(b.reason)} <b>${b.delta > 0 ? "+" : ""}${cl(b.delta)}</b>
              <div class="when">${zeitpunkt(b.created_at)}</div></span></li>`).join("")}
      </ul>` : `
      <div class="card flat leer"><img src="/logo.webp" alt="">
        <div class="h">Noch nichts passiert</div>
        <div class="t">Meldet eure erste Quest — dann füllt sich das hier.</div></div>`}
    </div>`;
}

/* ------------------------------------------------------------------ Suchen & Sortieren */

const SORTIERUNGEN = [
  { id: "genutzt", label: "Meist genutzt" },
  { id: "punkte", label: "Cleanies" },
  { id: "alpha", label: "A–Z" }
];

function suchzeile(bereich, platzhalter) {
  const wert = suche[bereich];
  return `
    <div class="suchzeile">
      ${icon("i-search", 18)}
      <input id="suchfeld" type="search" inputmode="search" autocomplete="off"
        placeholder="${esc(platzhalter)}" value="${esc(wert)}" data-bereich="${bereich}">
      ${wert ? `<button class="leeren" data-suche-leeren="${bereich}" aria-label="Suche leeren">×</button>` : ""}
    </div>`;
}

function sortierzeile(bereich) {
  const s = sortierung[bereich];
  return `
    <div class="filters">
      ${SORTIERUNGEN.map((o) => {
        const aktiv = s.nach === o.id;
        const pfeil = !aktiv ? "" : o.id === "genutzt" ? "" : (s.ab ? " ↓" : " ↑");
        return `<button data-sort="${o.id}" data-bereich="${bereich}" aria-pressed="${aktiv}">${o.label}${pfeil}</button>`;
      }).join("")}
    </div>`;
}

/** Sucht ohne Rücksicht auf Groß- und Kleinschreibung und auf Umlaute. */
const schlicht = (t) => String(t).toLowerCase()
  .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");

function sortiereUndSuche(liste, bereich, wertVon) {
  const s = sortierung[bereich];
  const begriff = schlicht(suche[bereich].trim());
  const gefiltert = begriff
    ? liste.filter((e) => schlicht(e.name).includes(begriff) || schlicht(e.category || "").includes(begriff))
    : liste;

  const kopie = [...gefiltert];
  if (s.nach === "alpha") {
    kopie.sort((a, b) => a.name.localeCompare(b.name, "de") * (s.ab ? -1 : 1));
  } else if (s.nach === "genutzt") {
    kopie.sort((a, b) => (b.genutzt || 0) - (a.genutzt || 0) || a.name.localeCompare(b.name, "de"));
  } else {
    kopie.sort((a, b) => (wertVon(b) - wertVon(a)) * (s.ab ? 1 : -1) || a.name.localeCompare(b.name, "de"));
  }
  return kopie;
}

/* ------------------------------------------------------------------ Quests */

function questListe() {
  const gemeldet = new Set(meineOffenen().map((m) => m.quest_id));
  const liste = sortiereUndSuche(
    S.quests.filter((q) => filter === "Alle" || q.category === filter),
    "quests",
    (q) => q.punkte_jetzt ?? q.points
  );

  if (!liste.length) return '<div class="leer-hinweis">Nichts gefunden.</div>';

  return liste.map((q) => `
    <div class="zeile">
      <button class="rowlink" ${q.wiederkehrend ? `data-plan="${q.id}"` : `data-sheet="melden" data-id="${q.id}"`}
        ${gemeldet.has(q.id) && !q.wiederkehrend ? "disabled" : ""}>
        <span class="grow">
          <span class="t">${esc(q.name)}${q.wiederkehrend ? '&nbsp;<span class="chip open">↻</span>' : ""}</span>
          <span class="m">${esc(q.category)}${q.wiederkehrend ? ` · ${esc(q.rhythmus)}` : ""}${
            q.genutzt ? ` · ${q.genutzt}×` : ""}${
            gemeldet.has(q.id) ? ` · wartet auf ${esc(andereName())}` : ""}</span>
        </span>
        ${gemeldet.has(q.id) ? '<span class="chip wait">Gemeldet</span>'
          : q.bonus ? `<span class="pts-pill"><s style="opacity:.55">${q.points}</s> ${cl(q.punkte_jetzt)}</span>`
          : `<span class="pts-pill">${cl(q.points)}</span>`}
      </button>
      <button class="stiftbtn" data-sheet="menue" data-art="quest" data-id="${q.id}"
        aria-label="${esc(q.name)} ändern oder löschen">${icon("i-stift", 18)}</button>
    </div>`).join("");
}

function schirmQuests() {
  const kategorien = ["Alle", ...new Set(S.quests.map((q) => q.category))];

  return `
    <div class="appbar">
      <div><div class="title">Quests</div><div class="sub">Cleanies gelten für beide</div></div>
      <button class="iconbtn" data-sheet="neu" aria-label="Quest vorschlagen">${icon("i-plus", 18)}</button>
    </div>
    <div class="body">
      ${suchzeile("quests", "Quest suchen …")}
      ${aktionsBanner("quest_bonus")}
      ${sortierzeile("quests")}
      <div class="filters">
        ${kategorien.map((k) => `<button data-filter="${esc(k)}" aria-pressed="${filter === k}">${esc(k)}</button>`).join("")}
      </div>
      <div id="liste" style="display:flex;flex-direction:column;gap:8px">${questListe()}</div>
    </div>`;
}

/* ------------------------------------------------------------------ Prüfen */

function schirmPruefen() {
  const offen = zuPruefen();
  const wer = (id) => nameVon(id);

  return `
    <div class="appbar"><div><div class="title">Prüfen</div>
      <div class="sub">Alles, was auf deine Entscheidung wartet</div></div></div>
    <div class="body">
      ${offen.length ? offen.map((e) => {
        if (e.art === "meldung") return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              ${bild(mitglied(e.claimed_by), "sm")}
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">${esc(wer(e.claimed_by))} meldet · ${zeitpunkt(e.created_at)}</span>
                <span style="font-size:15px;font-weight:700;display:block">${esc(e.quest)}</span>
              </span>
              <span class="pts-pill">+${cl(e.quantity * e.points_each)}</span>
            </div>
            ${e.quantity > 1 || e.note ? `<div style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--ink-2);flex-wrap:wrap">
              ${e.quantity > 1 ? `<span class="chip open">${e.quantity}× à ${cl(e.points_each)}</span>` : ""}
              ${e.note ? `<span>„${esc(e.note)}“</span>` : ""}</div>` : ""}
            <div class="btnrow">
              <button class="btn primary" data-entscheiden="claims" data-id="${e.id}" data-status="bestaetigt">Bestätigen</button>
              <button class="btn ghost" data-entscheiden="claims" data-id="${e.id}" data-status="abgelehnt">Ablehnen</button>
            </div>
            <button class="btn text block" data-sheet="rueckfrage" data-bereich="claims" data-id="${e.id}">Nachfragen</button>
          </div>`;
        // Dieselbe Karte wie unter „Wir“ — wer entscheiden muss, soll nicht
        // erst zwei Schirme weiter suchen, wofür seine Stimme fehlt.
        if (e.art === "abstimmung") return abstimmungKarte({ ...e, art: e.vorschlag });
        if (e.art === "empfang") return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              <span class="avatar sm" style="background:var(--tint);color:var(--accent)">${icon("i-gift", 18)}</span>
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">
                  ${esc(nameVon(e.decided_by))} hat zugesagt · ${zeitpunkt(e.decided_at)}</span>
                <span style="font-size:15px;font-weight:700;display:block">${esc(e.belohnung)}</span>
              </span>
              <span class="pts-pill">−${cl(e.cost)}</span>
            </div>
            <div style="font-size:12.5px;color:var(--ink-2)">
              ${e.wish_date ? `<b>${esc(e.wish_date)}</b> · ` : ""}Hast du sie bekommen?</div>
            <div class="btnrow">
              <button class="btn primary" data-empfang="${e.id}" data-erhalten="ja">Bekommen</button>
              <button class="btn ghost" data-empfang="${e.id}" data-erhalten="nein">Kam nicht</button>
            </div>
            <div style="font-size:11.5px;color:var(--ink-3)">
              „Kam nicht“ kostet ${esc(nameVon(e.decided_by))} ${e.cost} Cleanies — rückholbar,
              wenn es binnen drei Tagen doch noch passiert.</div>
          </div>`;
        if (e.art === "nachhol") return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              ${bild(mitglied(e.nachhol_von), "sm")}
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">
                  ${esc(nameVon(e.nachhol_von))} hat nachgeholt · ${zeitpunkt(e.nachhol_am)}</span>
                <span style="font-size:15px;font-weight:700;display:block">${esc(e.belohnung)}</span>
              </span>
              <span class="pts-pill">+${cl(e.cost)}</span>
            </div>
            <div style="font-size:12.5px;color:var(--ink-2)">Stimmt das? Dann bekommt
              ${esc(nameVon(e.nachhol_von))} die ${e.cost} Cleanies zurück.</div>
            <div class="btnrow">
              <button class="btn primary" data-nachhol="${e.id}" data-ja="ja">Stimmt</button>
              <button class="btn ghost" data-nachhol="${e.id}" data-ja="nein">Kam trotzdem nicht</button>
            </div>
          </div>`;
        if (e.art === "antrag") return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              ${bild(mitglied(e.requested_by), "sm")}
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">${esc(wer(e.requested_by))} beantragt · ${zeitpunkt(e.created_at)}</span>
                <span style="font-size:15px;font-weight:700;display:block">${esc(e.belohnung)}</span>
              </span>
              <span class="pts-pill">−${cl(e.cost)}</span>
            </div>
            ${e.wish_date || e.message ? `<div style="font-size:12.5px;color:var(--ink-2)">
              ${e.wish_date ? `<b>${esc(e.wish_date)}</b>` : ""}${e.wish_date && e.message ? " · " : ""}${e.message ? `„${esc(e.message)}“` : ""}</div>` : ""}
            ${e.gutschrift_an ? `<div class="gutschein">${icon("i-send", 15)}<span>Die ${cl(e.cost)} gehen
              an <b>${e.gutschrift_an === S.ich.id ? "dich" : esc(nameVon(e.gutschrift_an))}</b> — mit dem Genehmigen.</span></div>` : ""}
            <div class="btnrow">
              <button class="btn primary" data-entscheiden="requests" data-id="${e.id}" data-status="bestaetigt">Genehmigen</button>
              <button class="btn ghost" data-entscheiden="requests" data-id="${e.id}" data-status="abgelehnt">Ablehnen</button>
            </div>
            <button class="btn text block" data-sheet="rueckfrage" data-bereich="requests" data-id="${e.id}"
              data-termin="${esc(e.wish_date || "")}">Termin passt nicht — nachfragen</button>
          </div>`;
        return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              ${bild(mitglied(e.from_member), "sm")}
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">${esc(wer(e.from_member))} überträgt · ${zeitpunkt(e.created_at)}</span>
                <span style="font-size:15px;font-weight:700;display:block">Cleanies für dich</span>
              </span>
              <span class="pts-pill">+${cl(e.amount)}</span>
            </div>
            ${e.message ? `<div style="font-size:12.5px;color:var(--ink-2)">„${esc(e.message)}“</div>` : ""}
            <div class="btnrow">
              <button class="btn primary" data-entscheiden="transfers" data-id="${e.id}" data-status="bestaetigt">Annehmen</button>
              <button class="btn ghost" data-entscheiden="transfers" data-id="${e.id}" data-status="abgelehnt">Ablehnen</button>
            </div>
          </div>`;
      }).join("") : `
        <div class="card flat leer">
          <img src="/logo.webp" alt="">
          <div class="h">Alles geprüft</div>
          <div class="t">${allein() ? "Sobald jemand dazukommt, landen hier die Meldungen."
            : `Keine Meldungen, Anträge oder Abstimmungen offen. ${esc(gross(andereName()))} ${beugung("weiß", "wissen")} Bescheid.`}</div>
        </div>`}
    </div>`;
}

/* ------------------------------------------------------------------ Belohnungen */

function belohnungsListe() {
  const liste = sortiereUndSuche(S.belohnungen, "belohnungen", (b) => b.kosten_jetzt ?? b.cost);
  if (!liste.length) return '<div class="leer-hinweis" style="grid-column:1/-1">Nichts gefunden.</div>';

  return liste.map((b) => {
    const kosten = b.kosten_jetzt ?? b.cost;
    const zuTeuer = kosten > S.ich.punkte;
    return `
      <div class="reward-wrap">
        <button class="reward" data-sheet="antrag" data-id="${b.id}" ${zuTeuer ? "data-locked" : ""}>
          <span class="ico">${icon(b.cost >= 15 ? "i-shield" : "i-heart", 17)}</span>
          <span class="n">${esc(b.name)}</span>
          <span class="c">${zuTeuer
            ? `${S.ich.punkte} von ${kosten} Cleanies`
            : b.rabatt ? `<s style="opacity:.55">${b.cost}</s> ${kosten} Cleanies`
            : `${b.cost} Cleanies`}${b.genutzt ? ` · ${b.genutzt}×` : ""}</span>
        </button>
        <button class="stiftbtn" data-sheet="menue" data-art="belohnung" data-id="${b.id}"
          aria-label="${esc(b.name)} ändern oder löschen">${icon("i-stift", 16)}</button>
      </div>`;
  }).join("");
}

function schirmBelohnungen() {
  return `
    <div class="appbar">
      <div><div class="title">Belohnungen</div>
        <div class="sub">Dein Konto: <b>${S.ich.punkte}</b> Cleanies</div></div>
      <button class="iconbtn" data-sheet="neue-belohnung" aria-label="Belohnung vorschlagen">${icon("i-plus", 18)}</button>
    </div>
    <div class="body">
      ${suchzeile("belohnungen", "Belohnung suchen …")}
      ${aktionsBanner("belohnung_rabatt")}
      ${sortierzeile("belohnungen")}

      <button class="reward wide" data-sheet="transfer" style="background:var(--tint);border-color:transparent">
        <span class="ico" style="background:var(--bg)">${icon("i-swap", 18)}</span>
        <span class="n">Cleanies ${mehrere() ? "übertragen" : `an ${esc(andereName())} übertragen`}<br>
          <span style="font-weight:400;color:var(--ink-2);font-size:12px">Damit sie oder er sich etwas leisten kann</span></span>
      </button>

      <p class="section-label">Einlösbar</p>
      <div class="rewards" id="liste">${belohnungsListe()}</div>
      <p style="font-size:12px;color:var(--ink-3);margin:2px 0 0">
        Jede Einlösung geht als Antrag an ${esc(andereName())}.
        Erst mit Zustimmung werden die Cleanies abgebucht.
      </p>
    </div>`;
}

/* ------------------------------------------------------------------ Wir */

/** Worum es in einer Abstimmung geht — in einem Satz, ohne Fachwort.
 *  Steht als Zeile über der Gegenüberstellung, damit niemand raten muss. */
function abstimmungWorum(a) {
  const wieder = a.wiederkehrend !== false;
  switch (a.art) {
    case "neue_aufgabe":
      return `Neue Quest — soll gleich als wiederkehrende Aufgabe laufen`;
    case "aufgabe_aendern":
      return wieder
        ? (a.alt_wiederkehrend
            ? "Bestehende wiederkehrende Aufgabe — der Rhythmus soll sich ändern"
            : "Bestehende Quest — soll eine wiederkehrende Aufgabe werden")
        : "Bestehende wiederkehrende Aufgabe — soll wieder eine normale Quest werden";
    case "delete_aufgabe": return "Wiederkehrende Aufgabe — soll ganz weg";
    case "new_quest": return "Neue Quest";
    case "new_reward": return "Neue Belohnung";
    case "quest_points": return "Bestehende Quest — der Cleanies-Wert soll sich ändern";
    case "reward_cost": return "Bestehende Belohnung — die Kosten sollen sich ändern";
    case "delete_quest": return "Bestehende Quest — soll gelöscht werden";
    case "delete_reward": return "Bestehende Belohnung — soll gelöscht werden";
    case "neue_aktion": return "Befristete Aktion für alle";
    case "urlaub_person": return "Nur eine Person — der Plan bleibt, wie er ist";
    case "urlaub_haushalt": return "Alle Fälligkeiten rücken nach hinten";
    case "ruecktritt": return `${a.aufgabe || "Wiederkehrende Aufgabe"} — die Runde wird wieder frei`;
    default: return "Vorschlag";
  }
}

/** Was sich genau ändert. Bei einer wiederkehrenden Aufgabe ist das der
 *  Rhythmus — der Cleanies-Wert bleibt gleich, ihn hier zu zeigen sagt nichts. */
function abstimmungWandel(a) {
  const raumZusatz = a.raum ? `<span style="color:var(--ink-2);font-weight:400">· ${esc(a.raum)}</span>` : "";
  const wieder = a.wiederkehrend !== false;

  if (a.art === "neue_aufgabe") {
    return `<span class="new">${esc(a.rhythmus || "")}</span>
            <span style="color:var(--ink-2);font-weight:400">· ${cl(a.neu)}</span> ${raumZusatz}`;
  }
  if (a.art === "aufgabe_aendern") {
    if (!wieder) return `<span class="old">${esc(a.alt_rhythmus || "wiederkehrend")}</span>→<span class="new">nur noch normale Quest</span>`;
    return a.alt_wiederkehrend && a.alt_rhythmus
      ? `<span class="old">${esc(a.alt_rhythmus)}</span>→<span class="new">${esc(a.rhythmus || "")}</span>`
      : `<span class="old">jederzeit meldbar</span>→<span class="new">${esc(a.rhythmus || "")}</span>`;
  }
  if (a.art === "urlaub_person" || a.art === "urlaub_haushalt") {
    return `<span class="new" style="color:var(--urlaub)">${datumKurz(a.urlaub_von)} – ${datumKurz(a.urlaub_bis)}</span>
            <span style="color:var(--ink-2);font-weight:400">· ${a.neu} ${a.neu === 1 ? "Tag" : "Tage"}${
              a.art === "urlaub_haushalt" ? " nach hinten" : " ohne Mahnung und Strafe"}</span>`;
  }
  if (a.art === "ruecktritt") {
    return `<span class="old">gehört ${esc(nameVon(a.von))}</span>→<span class="new" style="color:var(--urlaub)">für alle offen</span>
            <span style="color:var(--ink-2);font-weight:400">· Frist bleibt</span>`;
  }
  if (a.art === "delete_aufgabe") return `<span class="old">im Plan</span>→<span class="new">löschen</span>`;
  if (a.art === "neue_aktion") {
    return `<span class="new">${a.titel.startsWith("Rabatt") ? `${a.neu} % Rabatt` : `+${a.neu} % Cleanies`}</span>
            <span style="color:var(--ink-2);font-weight:400">${a.raum ? `· ${esc(a.raum)}` : "· alles"}
            ${a.tage ? `· ${a.tage === 1 ? "heute" : a.tage + " Tage"}` : ""}</span>`;
  }
  if (a.art === "delete_quest" || a.art === "delete_reward") {
    return `<span class="old">${cl(a.alt)}</span>→<span class="new">löschen</span>`;
  }
  if (a.art === "new_quest" || a.art === "new_reward") {
    return `<span class="new">${cl(a.neu)}</span> ${raumZusatz}`;
  }
  return a.alt !== null && a.alt !== undefined
    ? `<span class="old">${cl(a.alt)}</span>→<span class="new">${cl(a.neu)}</span>`
    : `<span>Cleanies-Wert</span><span class="new">${cl(a.neu)}</span>`;
}

function abstimmungKarte(a) {
  const entschieden = a.status !== "offen";
  const angenommen = a.status === "bestaetigt";
  const stimme = (w) => w === undefined || w === null ? "offen" : (w ? "zugestimmt" : "abgelehnt");
  // Ein Rücktritt braucht nur eine Mehrheit; alles andere alle Stimmen.
  const koepfe = a.koepfe || S.mitglieder.length;
  const noetig = a.noetig || koepfe;
  const mehrheitsSache = noetig < koepfe;
  const jaZahl = (a.stimmen || []).filter((s) => s.antwort === true).length;

  return `
    <div class="card vote">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="flex:1;min-width:0">
          <span style="font-size:14.5px;font-weight:700;display:block">${esc(a.titel || "Vorschlag")}</span>
          <span style="font-size:11.5px;color:var(--ink-3);display:block">${esc(abstimmungWorum(a))}</span>
        </span>
        <span class="chip ${entschieden ? (angenommen ? "done" : "open") : "wait"}">
          ${entschieden ? (angenommen ? "Übernommen" : "Abgelehnt") : "Offen"}</span>
      </div>
      <div class="change">${abstimmungWandel(a)}</div>
      <div style="font-size:11.5px;color:var(--ink-3)">
        Vorgeschlagen von ${esc(nameVon(a.von))} · ${zeitpunkt(a.created_at)}</div>
      ${a.grund ? `<div class="why">${esc(nameVon(a.von))}: „${esc(a.grund)}“</div>`
        : `<div class="why" style="color:var(--ink-3)">Keine Begründung angegeben.</div>`}
      <div class="stance">
        ${(a.stimmen || []).map((s) => `
          <span>${esc(s.id === S.ich.id ? "Du" : vorname(s.name))}: <i>${stimme(s.antwort)}</i></span>`).join("")}
      </div>
      ${!entschieden ? (mehrheitsSache
        ? `<div class="zaehlbalken">${Array.from({ length: koepfe },
             (_, i) => `<i ${i < jaZahl ? "data-ja" : ""}></i>`).join("")}</div>
           <div style="font-size:11.5px;color:var(--ink-3)">${jaZahl} von ${koepfe} ·
             ${noetig - jaZahl <= 0 ? "die Mehrheit steht"
               : noetig - jaZahl === 1 ? "<b>eine Stimme fehlt noch</b>, dann ist die Mehrheit da"
               : `noch <b>${noetig - jaZahl} Stimmen</b> bis zur Mehrheit`}.</div>`
        : `<div style="font-size:11.5px;color:var(--ink-3)">Übernommen wird der
             Vorschlag erst, wenn alle ${koepfe} zugestimmt haben.</div>`) : ""}
      ${!entschieden && (a.meine === undefined || a.meine === null) ? `
      <div class="btnrow">
        <button class="btn dark" data-stimme="${a.id}" data-antwort="ja">Zustimmen</button>
        ${mehrheitsSache
          ? `<button class="btn ghost" data-sheet="ablehnen" data-id="${a.id}"
               data-titel="${esc(a.titel || "")}">Ablehnen</button>`
          : `<button class="btn ghost" data-stimme="${a.id}" data-antwort="nein">Ablehnen</button>`}
      </div>` : ""}
      ${entschieden && !angenommen ? '<div style="font-size:12px;color:var(--ink-3)">Der alte Stand gilt weiter.</div>' : ""}
    </div>`;
}

function schirmWir() {
  const offen = offeneAbstimmungen();
  const erledigt = S.abstimmungen.filter((a) => a.status !== "offen").slice(0, 5);

  return `
    <div class="appbar">
      <div><div class="title">Wir</div>
        <div class="sub">${esc(S.mitglieder.map((m) => vorname(m.name)).join(" · "))}</div></div>
      <button class="iconbtn" data-go="verlauf" aria-label="Verlauf">${icon("i-clock", 18)}</button>
      <button class="iconbtn" data-go="einstellungen" aria-label="Einstellungen">${icon("i-zahnrad", 18)}</button>
    </div>
    <div class="body">
      ${aktionsBanner()}

      <p class="section-label">Aktionen</p>
      <button class="rowlink" data-sheet="aktion" style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-heart", 18)}</span>
        <span class="grow"><span class="t">Aktion starten</span>
          <span class="m">Doppelte Cleanies oder Rabatt — befristet, nur gemeinsam</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Offene Abstimmungen</p>
      ${offen.length ? offen.map(abstimmungKarte).join("") : `
        <div class="card flat" style="font-size:13px;color:var(--ink-2)">
          Nichts offen. Cleanies ändert ihr über den Stift in der Quest-Liste.
        </div>`}

      <p class="section-label">Hausregeln</p>
      <ul class="card rules">
        <li><span class="n">01</span><span>Der Cleanies-Wert einer Quest steht <b>vor</b> dem Erledigen fest.</span></li>
        <li><span class="n">02</span><span>Erledigt melden kann jeder — <b>freigeben nur der andere</b>.</span></li>
        <li><span class="n">03</span><span>Werte ändern, Quests anlegen: <b>nur wenn beide zustimmen</b>.</span></li>
        <li><span class="n">04</span><span>Bis eine Abstimmung durch ist, gilt der <b>alte Wert</b>.</span></li>
        <li><span class="n">05</span><span>Anträge und Übertragungen brauchen ein <b>Ja</b> vom anderen.</span></li>
      </ul>

      ${erledigt.length ? `<p class="section-label">Entschieden</p>${erledigt.map(abstimmungKarte).join("")}` : ""}

      <p class="section-label">Konto</p>
      <button class="rowlink" data-go="verlauf">
        <span class="avatar sm" style="background:var(--tint)">${icon("i-clock", 17)}</span>
        <span class="grow"><span class="t">Verlauf &amp; Cleanies-Konto</span>
          <span class="m">Jede Buchung nachvollziehbar</span></span><span style="color:var(--ink-3)">›</span>
      </button>
      <button class="rowlink" data-export>
        <span class="avatar sm" style="background:var(--tint)">${icon("i-down", 17)}</span>
        <span class="grow"><span class="t">Alles exportieren</span>
          <span class="m">Kompletter Stand als Datei</span></span><span style="color:var(--ink-3)">›</span>
      </button>
      <button class="btn text block" data-abmelden>Abmelden</button>
    </div>`;
}

/* ------------------------------------------------------------------ Auswertung */

let statistik = null;

async function statistikLaden() {
  statistik = await api(`statistik?versatz=${-new Date().getTimezoneOffset()}`);
}

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Gruppiertes Balkendiagramm: je Tag zwei schmale Balken. */
function diagramm(tage) {
  const breite = 340, hoehe = 150, links = 22, unten = 20, oben = 12;
  const feldB = (breite - links) / tage.length;
  const balkenB = Math.min(7, (feldB - 4) / 2);
  const hoechst = Math.max(4, ...tage.map((t) => Math.max(t.ich, t.partner)));
  const skala = (w) => (hoehe - oben - unten) * (w / hoechst);

  const linien = [0, 0.5, 1].map((f) => {
    const y = oben + (hoehe - oben - unten) * (1 - f);
    return `<line class="gitter" x1="${links}" y1="${y}" x2="${breite}" y2="${y}"/>
            <text class="achse" x="0" y="${y + 3}">${Math.round(hoechst * f)}</text>`;
  }).join("");

  const balken = tage.map((t, i) => {
    const x = links + i * feldB + (feldB - balkenB * 2 - 2) / 2;
    const boden = hoehe - unten;
    const stueck = (wert, versatz, farbe, wer) => {
      if (!wert) return "";
      const h = Math.max(2, skala(wert));
      return `<rect class="balken" data-tag="${t.tag}" data-wer="${wer}" data-wert="${wert}"
        x="${(x + versatz).toFixed(1)}" y="${(boden - h).toFixed(1)}"
        width="${balkenB.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${farbe}"/>`;
    };
    const datum = new Date(t.tag + "T12:00:00Z");
    const zeigen = i === tage.length - 1 || i % 3 === 0;
    return stueck(t.ich, 0, "var(--reihe-ich)", "ich")
         + stueck(t.partner, balkenB + 2, "var(--reihe-partner)", "partner")
         + (zeigen ? `<text class="achse" text-anchor="middle"
              x="${(x + balkenB).toFixed(1)}" y="${hoehe - 6}">${WOCHENTAGE[datum.getUTCDay()]}</text>` : "");
  }).join("");

  // Höchstwert direkt beschriften statt jeden Balken
  const spitze = tage.reduce((b, t, i) => (Math.max(t.ich, t.partner) > Math.max(b.t.ich, b.t.partner) ? { t, i } : b), { t: tage[0], i: 0 });
  const spitzeWert = Math.max(spitze.t.ich, spitze.t.partner);
  const spitzeX = links + spitze.i * feldB + feldB / 2;
  const beschriftung = spitzeWert > 0
    ? `<text class="wert" text-anchor="middle" x="${spitzeX.toFixed(1)}"
         y="${(hoehe - unten - skala(spitzeWert) - 5).toFixed(1)}">${spitzeWert}</text>`
    : "";

  return `<svg class="diagramm" viewBox="0 0 ${breite} ${hoehe}" role="img"
            aria-label="Cleanies je Tag der letzten zwei Wochen">
    ${linien}${balken}${beschriftung}
  </svg>`;
}

function prognoseKarte(titel, zahlen, offen, einheit) {
  const mehr = zahlen.prognose - zahlen.bisher;
  return `
    <div class="card">
      <span class="section-label" style="margin:0">${titel}</span>
      <div class="prognose">
        <span class="jetzt">
          <span class="hero-zahl">${cl(zahlen.bisher)}</span>
          <div class="hero-zusatz">bisher</div>
        </span>
        <span class="pfeil" aria-hidden="true" style="font-size:20px;font-weight:700">→</span>
        <span class="ziel">
          <span class="hero-zahl" style="color:var(--reihe-ich);font-size:34px">${cl(zahlen.prognose)}</span>
          <div class="hero-zusatz">Hochrechnung</div>
        </span>
      </div>
      <div style="font-size:12.5px;color:var(--ink-2)">
        ${offen > 0
          ? `Noch ${offen} ${einheit === "woche" ? (offen === 1 ? "Tag" : "Tage") : (offen === 1 ? "Tag" : "Tage")} —
             bei deinem Schnitt kämen ${mehr} Cleanies dazu.`
          : "Der Zeitraum ist durch."}
        ${einheit === "monat" && zahlen.vormonat
          ? `<br>Vormonat: <b>${zahlen.vormonat}</b> Cleanies.` : ""}
      </div>
    </div>`;
}

function schirmStatistik() {
  if (!statistik) {
    return `
      <div class="appbar">
        <button class="iconbtn links" data-go="start" aria-label="Zurück">‹</button>
        <div><div class="title">Auswertung</div><div class="sub">wird geladen …</div></div>
      </div>
      <div class="body"><div class="lader"><img src="/logo.webp" alt="" width="110"></div></div>`;
  }

  const zwei = statistik.tage.slice(-14);
  const meins = statistik.ich;
  const meinName = S.ich.name.split(" ")[0];
  const partnerName = mehrere() ? "Die anderen" : andereName();

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="start" aria-label="Zurück">‹</button>
      <div><div class="title">Auswertung</div><div class="sub">Cleanies aus bestätigten Quests</div></div>
      <button class="iconbtn" data-go="verlauf" aria-label="Verlauf">${icon("i-clock", 18)}</button>
    </div>
    <div class="body">
      <div class="card">
        <span class="section-label" style="margin:0">Letzte zwei Wochen</span>
        <div class="legende">
          <span><i style="background:var(--reihe-ich)"></i>${esc(meinName)}</span>
          <span><i style="background:var(--reihe-partner)"></i>${esc(partnerName)}</span>
        </div>
        ${diagramm(zwei)}
        <div id="diagramm-hinweis" style="font-size:12.5px;color:var(--ink-2);min-height:18px">
          Tippe auf einen Balken für den einzelnen Tag.
        </div>
        <details class="tabelle">
          <summary>Als Tabelle anzeigen</summary>
          <table class="tabellenansicht">
            <thead><tr><th>Tag</th><th>${esc(meinName)}</th><th>${esc(partnerName)}</th></tr></thead>
            <tbody>
              ${zwei.slice().reverse().filter((t) => t.ich || t.partner).map((t) => `
                <tr><td>${t.tag.slice(8)}.${t.tag.slice(5, 7)}.</td><td>${t.ich}</td><td>${t.partner}</td></tr>`).join("")
                || '<tr><td colspan="3" style="text-align:left;color:var(--ink-3)">Noch keine Cleanies in diesem Zeitraum.</td></tr>'}
            </tbody>
          </table>
        </details>
      </div>

      ${prognoseKarte("Diese Woche", meins.woche, statistik.tageOffen, "woche")}
      ${prognoseKarte("Dieser Monat", meins.monat, statistik.monatOffen, "monat")}

      <p class="section-label">Deine Zahlen</p>
      <div class="kennzahlen">
        <div class="kennzahl">
          <span class="k">Schnitt pro Tag</span>
          <span class="v">${meins.schnitt}</span>
          <span class="z">letzte sieben Tage</span>
        </div>
        <div class="kennzahl">
          <span class="k">Serie</span>
          <span class="v">${meins.serie}</span>
          <span class="z">${meins.serie === 1 ? "Tag" : "Tage"} in Folge</span>
        </div>
        <div class="kennzahl">
          <span class="k">Bester Tag</span>
          <span class="v">${meins.bester ? meins.bester.punkte : "–"}</span>
          <span class="z">${meins.bester ? `am ${meins.bester.tag.slice(8)}.${meins.bester.tag.slice(5, 7)}.` : "noch keiner"}</span>
        </div>
        <div class="kennzahl">
          <span class="k" style="display:flex;align-items:center;gap:6px">
            <i style="width:9px;height:9px;border-radius:2px;background:var(--reihe-partner);display:block"></i>
            ${esc(partnerName)} diese Woche</span>
          <span class="v">${statistik.partner ? statistik.partner.woche.bisher : 0}</span>
          <span class="z">du: ${meins.woche.bisher}</span>
        </div>
      </div>

      ${statistik.naechsteBelohnung ? `
      <div class="card flat">
        <span class="section-label" style="margin:0">Nächstes Ziel</span>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="flex:1;font-size:14.5px;font-weight:700">${esc(statistik.naechsteBelohnung.name)}</span>
          <span class="pts-pill">noch ${cl(statistik.naechsteBelohnung.fehlt)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--ink-2)">
          Bei ${meins.schnitt} Cleanies am Tag in
          ${meins.schnitt > 0 ? Math.ceil(statistik.naechsteBelohnung.fehlt / meins.schnitt) : "…"}
          ${meins.schnitt > 0 && Math.ceil(statistik.naechsteBelohnung.fehlt / meins.schnitt) === 1 ? "Tag" : "Tagen"} drin.
        </div>
      </div>` : ""}
    </div>`;
}

function sheetRueckfrage(bereich, satzId, termin) {
  const belohnung = bereich === "requests";
  sheet(`
    <div class="grabber"></div>
    <h3>Nachfragen</h3>
    <div class="note">${icon("i-info", 16)}<span>Der Antrag bleibt offen — er wird weder genehmigt
      noch abgelehnt. Wer ihn gestellt hat, antwortet und schickt ihn erneut.</span></div>
    ${belohnung ? `
    <div class="field"><label>Anderer Termin (Vorschlag)</label>
      <input id="rtermin" value="${esc(termin || "")}" placeholder="z. B. Samstag Abend"></div>` : ""}
    <div class="field"><label>Deine Frage</label>
      <textarea id="rtext" placeholder="${belohnung ? "z. B. Am Freitag schaffe ich es nicht." : "z. B. War die Küche auch dabei?"}"></textarea></div>
    <button class="btn primary block" data-senden="rueckfrage" data-bereich="${bereich}" data-id="${satzId}">
      Rückfrage schicken</button>`);
}

function sheetAntwort(bereich, satz) {
  const belohnung = bereich === "requests";
  sheet(`
    <div class="grabber"></div>
    <h3>Antworten</h3>
    <div class="card flat" style="gap:6px">
      <span style="font-size:14px;font-weight:600">${esc(satz.titel)}</span>
      <span style="font-size:12.5px;color:var(--ink-2)">
        ${esc(nameVon(satz.rueckfrage_von))}: „${esc(satz.rueckfrage)}“</span>
    </div>
    ${belohnung ? `
    <div class="field"><label>Terminwunsch</label>
      <input id="atermin" value="${esc(satz.vorschlag_datum || satz.wish_date || "")}"></div>` : ""}
    <div class="field"><label>Deine Antwort</label><textarea id="atext" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>Danach steht der Antrag wieder zur Entscheidung.</span></div>
    <button class="btn primary block" data-senden="antwort" data-bereich="${bereich}" data-id="${satz.id}">
      Erneut schicken</button>`);
}

/** Meine eigene, noch offene Anfrage. Solange niemand entschieden hat, darf
 *  ich den Hinweis nachschärfen oder sie ganz zurückziehen. Der Wert steht
 *  nicht zur Debatte — er ist beim Absenden eingefroren. */
function sheetMeins(o) {
  const belohnung = o.bereich === "requests";
  sheet(`
    <div class="grabber"></div>
    <h3>Deine ${o.bereich === "claims" ? "Meldung" : belohnung ? "Anfrage" : "Übertragung"}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(o.titel)}</span>
      <span class="pts-pill">${o.punkte}</span>
    </div>
    ${o.zusatz === "Rückfrage offen" ? `
    <div class="note">${icon("i-info", 16)}<span>Dazu steht eine Rückfrage offen —
      die beantwortest du oben auf der Startseite.</span></div>` : ""}
    ${belohnung ? `
    <div class="field"><label>Terminwunsch</label>
      <input id="mtermin" value="${esc(o.termin || "")}" placeholder="z. B. heute Abend"></div>` : ""}
    <div class="field"><label>Hinweis für ${esc(andereName())}</label>
      <textarea id="mtext" placeholder="optional">${esc(o.nachricht || "")}</textarea></div>
    <button class="btn primary block" data-senden="meins-aendern"
      data-bereich="${o.bereich}" data-id="${o.id}">Ergänzung schicken</button>
    <div class="note">${icon("i-info", 16)}<span>Zurückziehen heißt: es war nie da.
      ${esc(gross(andereName()))} ${beugung("sieht", "sehen")} es dann nicht mehr, und die
      Benachrichtigung dazu verschwindet mit.</span></div>
    <button class="btn text block" data-senden="meins-storno"
      data-bereich="${o.bereich}" data-id="${o.id}" style="color:var(--accent)">Zurückziehen</button>`);
}

function sheetZusage(r) {
  const gestraft = r.erfuellt === "nicht_erhalten";
  sheet(`
    <div class="grabber"></div>
    <h3>${gestraft ? "Doch noch nachholen" : "Deine Zusage"}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(r.belohnung)}</span>
      <span class="pts-pill">${gestraft ? "−" : ""}${cl(r.cost)}</span>
    </div>
    <div style="font-size:13px;color:var(--ink-2)">
      Für ${esc(nameVon(r.requested_by))}${r.wish_date ? ` · <b>${esc(r.wish_date)}</b>` : ""}.
      ${r.message ? `„${esc(r.message)}“` : ""}</div>
    ${gestraft ? `
    <div class="note">${icon("i-info", 16)}<span>Die ${r.cost} Cleanies sind ab. Wenn du es jetzt
      machst und ${esc(nameVon(r.requested_by))} bestätigt, kommen sie zurück.</span></div>
    <button class="btn primary block" data-nachholen="${r.id}">Habe ich nachgeholt</button>`
    : `<div class="note">${icon("i-info", 16)}<span>Bestätigen kann nur
      ${esc(nameVon(r.requested_by))} — du siehst hier nur, was noch offen ist.</span></div>`}`);
}

/* ------------------------------------------------------------------ Haushaltsplan */

let planGruppiert = false;

function planZeile(a) {
  const f = fristText(a.offen);
  // Blass wird nur, was gerade nicht deine Sache ist. Dass eine Aufgabe noch
  // nicht dran ist, sagt der Balken — dafür muss nicht die halbe Liste grau sein.
  const fremd = a.pruefung || (a.zugewiesen && a.zugewiesen !== S.ich.id);
  return `
    <button class="aufgabe" data-plan="${a.id}" ${fremd ? "data-gesperrt" : ""}>
      <span class="n">
        <span class="t">${esc(a.name)}</span>
        <span class="m">${planGruppiert ? "" : esc(a.raum) + " · "}${esc(a.rhythmus)}${
          a.pruefung ? " · wartet auf Bestätigung"
          : a.zugewiesen ? ` · ${esc(nameVon(a.zugewiesen))}`
          : a.dran ? ` · ${esc(nameVon(a.dran))} entscheidet`
          : a.bewerber ? ` · ${a.bewerber} ${a.bewerber === 1 ? "Bewerbung" : "Bewerbungen"}` : ""}</span>
      </span>
      <span class="frist">
        ${planBalken(a)}
        <span class="w ${f.art}">${a.pruefung ? "gemeldet" : f.text}</span>
      </span>
    </button>`;
}

function schirmPlan() {
  const liste = [...plan()].sort((a, b) => a.offen - b.offen || a.name.localeCompare(b.name, "de"));
  const raeume = [...new Set(liste.map((a) => a.raum))];

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="start" aria-label="Zurück">‹</button>
      <div><div class="title">Haushaltsplan</div>
        <div class="sub">${planGruppiert ? "Nach Räumen" : "Das Dringendste oben"}</div></div>
      <button class="iconbtn" data-sheet="neue-aufgabe" aria-label="Aufgabe vorschlagen">${icon("i-plus", 18)}</button>
    </div>
    <div class="body">
      ${urlaubBanner()}
      ${liste.length ? `
      <div class="btnrow">
        <button class="btn ${planGruppiert ? "ghost" : "dark"}" style="font-size:13px;padding:9px"
          data-plansicht="frist">Nach Fälligkeit</button>
        <button class="btn ${planGruppiert ? "dark" : "ghost"}" style="font-size:13px;padding:9px"
          data-plansicht="raum">Nach Raum</button>
      </div>
      ${planGruppiert
        ? raeume.map((r) => `<p class="section-label">${esc(r)}</p>
            ${liste.filter((a) => a.raum === r).map(planZeile).join("")}`).join("")
        : liste.map(planZeile).join("")}
      <div class="note">${icon("i-info", 16)}<span>Wer eine Aufgabe erledigt, sperrt sie für alle,
        bis der Zeitraum um ist. Bei mehreren Bewerbern entscheidet die Rangliste einen Tag vor
        Fälligkeit.</span></div>`
      : `<div class="card flat leer"><img src="/logo.webp" alt="">
           <div class="h">Noch kein Plan</div>
           <div class="t">Über das Plus oben kommt die erste wiederkehrende Aufgabe dazu —
             sie geht wie alles in die Abstimmung.</div></div>`}
    </div>`;
}

/* ---------- Eine Aufgabe ---------- */

let aufgabe = null;                       // Detail vom Server, inklusive Zählern

async function aufgabeLaden(id) {
  aufgabe = await api(`plan/${id}`);
}

function zaehlerZeile(m, platz = null) {
  return `
    <div class="rang" ${platz === 1 ? "data-erster" : ""}>
      ${platz ? `<span class="platz">${platz}</span>` : ""}
      ${bild(m, "sm")}
      <span class="n">
        <span class="t">${esc(vorname(m.name))}${m.id === S.ich.id ? " (du)" : ""}</span>
        ${platz === 1 ? '<span class="m">ist dran</span>' : ""}
      </span>
      <span class="zahlen">
        <span class="zahl"><b>${m.stueck}</b><span>Stück</span></span>
        <span class="zahl"><b>${m.jahr}</b><span>Jahr</span></span>
      </span>
    </div>`;
}

function schirmAufgabe() {
  if (!aufgabe) {
    return `
      <div class="appbar">
        <button class="iconbtn links" data-go="plan" aria-label="Zurück">‹</button>
        <div><div class="title">Aufgabe</div><div class="sub">wird geladen …</div></div>
      </div>
      <div class="body"><div class="lader"><img src="/logo.webp" alt="" width="110"></div></div>`;
  }

  const a = aufgabe;
  const f = fristText(a.offen);
  const gesperrt = a.offen > 0;
  const ichDran = a.dran === S.ich.id;
  const ichHabe = a.zugewiesen === S.ich.id;
  const jemandAnders = a.zugewiesen && !ichHabe;
  const rang = a.rangliste ? a.rangliste.map((wer) => a.mitglieder.find((m) => m.id === wer)) : null;

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="plan" aria-label="Zurück">‹</button>
      <div><div class="title">${esc(a.name)}</div>
        <div class="sub">${esc(a.raum)} · ${esc(a.rhythmus)}</div></div>
      <button class="iconbtn" data-sheet="aufgabe-menue" data-id="${a.id}"
        aria-label="Ändern oder löschen">${icon("i-stift", 18)}</button>
    </div>
    <div class="body">
      <div class="card ${a.offen < 0 ? "alert" : ""}" style="gap:7px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="flex:1;font-size:14.5px;font-weight:700">${esc(f.text)}</span>
          <span class="pts-pill">+${cl(a.punkte)}</span>
        </div>
        ${planBalken(a)}
        <div style="font-size:12.5px;color:var(--ink-2)">
          ${a.zuletzt ? `Zuletzt: ${esc(nameVon(a.zuletzt.member_id))}, ${zeitpunkt(a.zuletzt.created_at)}`
                      : "Noch nie erledigt."}</div>
      </div>

      ${ruecktrittKarte(a)}

      ${rang ? `
      <p class="section-label">Rangliste — wer ist dran?</p>
      ${rang.map((m, i) => zaehlerZeile(m, i + 1)).join("")}
      ${ichDran ? `
      <div class="btnrow">
        <button class="btn primary" data-vergabe="${a.id}" data-annehmen="ja">Annehmen</button>
        <button class="btn ghost" data-vergabe="${a.id}" data-annehmen="nein">Ablehnen</button>
      </div>`
      : a.dran ? `<div class="card flat" style="font-size:13px;color:var(--ink-2)">
          ${esc(nameVon(a.dran))} steht oben und entscheidet. Du erfährst es, sobald es feststeht.</div>` : ""}`
      : `
      <p class="section-label">Wer war wie oft dran</p>
      ${a.mitglieder.map((m) => zaehlerZeile(m)).join("")}
      <div class="note">${icon("i-info", 16)}<span>Die linke Zahl entscheidet: wer am wenigsten
        <b>am Stück</b> dran war, steht in der Rangliste oben. Bei Gleichstand zählt die rechte.</span></div>`}

      ${jemandAnders ? `
      <div class="card flat" style="font-size:13px;color:var(--ink-2)">
        Diese Runde gehört ${esc(nameVon(a.zugewiesen))}.</div>` : ""}

      ${!rang && !a.zugewiesen ? `
      <p class="section-label">Bewerbung</p>
      <div class="card" style="gap:9px">
        <div style="font-size:13px;color:var(--ink-2)">
          ${a.bewerber.length
            ? `${a.bewerber.map((wer) => esc(nameVon(wer))).join(", ")} ${a.bewerber.length === 1 ? "hat sich" : "haben sich"} beworben.`
            : "Noch niemand beworben. Wer sich meldet und allein bleibt, bekommt sie ohne Rangliste."}
        </div>
        ${a.ichBeworben
          ? `<button class="btn ghost block" data-bewerbung="zurueck" data-id="${a.id}">Bewerbung zurückziehen</button>`
          : `<button class="btn dark block" data-bewerbung="ja" data-id="${a.id}">Ich übernehme das</button>`}
      </div>` : ""}

      ${a.pruefung ? "" : `
      <button class="btn ${gesperrt ? "ghost" : "primary"} block" data-sheet="erledigt" data-id="${a.id}"
        ${jemandAnders ? "disabled" : ""}>
        ${gesperrt ? "Trotzdem erledigen" : "Erledigt melden"}</button>`}

      ${!a.pruefung && a.ichKannZurueck ? `
      <button class="btn ghost block" data-sheet="ruecktritt" data-id="${a.id}">
        Zurücktreten von der Aufgabe</button>` : ""}

      ${gesperrt ? `<div class="note">${icon("i-lock", 16)}<span>Gesperrt bis
        <b>${esc(a.faellig_am)}</b>. Für besondere Umstände geht es trotzdem — mit Begründung, und
        jemand anderes muss bestätigen.</span></div>` : ""}
    </div>`;
}

/** Der Zustand eines Rücktritts an der Aufgabe: läuft er, ist er durch, wurde
 *  er abgelehnt? Jedes Mal etwas anderes zu sagen. */
function ruecktrittKarte(a) {
  const r = a.ruecktritt;
  if (!r) return "";
  const meiner = r.created_by === S.ich.id;
  const wer = meiner ? "dir" : nameVon(r.created_by);

  if (r.status === "offen") return `
    <div class="card urlaub" style="gap:7px">
      <div style="font-size:13.5px;font-weight:700">${
        meiner ? "Dein Rücktritt steht zur Abstimmung" : `${esc(nameVon(r.created_by))} möchte zurücktreten`}</div>
      <div style="font-size:12px;color:var(--ink-2)">„${esc(r.reason)}“</div>
      <div style="font-size:11.5px;color:var(--ink-3)">${r.ja} von ${S.mitglieder.length} ·
        bis dahin gehört die Aufgabe weiter ${esc(wer)}.</div>
    </div>`;

  if (r.status === "bestaetigt" && !a.zugewiesen) return `
    <div class="card urlaub" style="gap:7px">
      <div style="font-size:13.5px;font-weight:700">Wieder für alle offen</div>
      <div style="font-size:12px;color:var(--ink-2)">${
        meiner ? "Du bist" : `${esc(nameVon(r.created_by))} ist`} zurückgetreten —
        wer sie macht, meldet sie.</div>
    </div>`;

  if (r.status === "abgelehnt" && a.zugewiesen === r.created_by) return `
    <div class="card alert" style="gap:7px">
      <div style="font-size:13.5px;font-weight:700">Rücktritt abgelehnt</div>
      <div style="font-size:12px;color:var(--ink-2)">Die Aufgabe gehört weiter ${esc(wer)}.</div>
      ${(r.gegenstimmen || []).map((g) =>
        `<div style="font-size:12px;color:var(--ink-2)">${esc(nameVon(g.von))}: „${esc(g.grund)}“</div>`).join("")}
    </div>`;

  return "";
}

/** Zurücktreten braucht einen Grund — die anderen entscheiden darüber und
 *  müssen dafür wissen, worum es geht. */
function sheetRuecktritt(a) {
  const weitere = Math.floor(S.mitglieder.length / 2);
  sheet(`
    <div class="grabber"></div>
    <h3>Zurücktreten</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(a.name)}</span>
      <span class="pts-pill">+${cl(a.punkte)}</span>
    </div>
    <div class="field">
      <label>Warum geht es nicht <span style="color:var(--accent)">· nötig</span></label>
      <textarea id="rtgrund" maxlength="300" placeholder="Kurz, damit die anderen entscheiden können"></textarea>
    </div>
    <div class="note">${icon("i-info", 16)}<span><b>Ohne Grund geht es nicht.</b>
      ${esc(gross(andereName()))} ${beugung("entscheidet", "entscheiden")} darüber — und dafür
      ${beugung("muss", "müssen")} sie wissen, worum es geht.</span></div>
    <div class="note">${icon("i-vote", 16)}<span>Es reicht, wenn eine <b>Mehrheit</b> zustimmt:
      <b>${weitere === 1 ? "eine weitere Stimme" : `${weitere} weitere Stimmen`}</b>.
      Bis dahin gehört die Aufgabe weiter dir, und die Frist bleibt stehen.</span></div>
    <button class="btn dark block" data-senden="ruecktritt" data-id="${a.id}">Zur Abstimmung geben</button>`);
}

/** Ein Rücktritt darf mit Begründung abgelehnt werden — sie steht danach an
 *  der Aufgabe. Bei allen anderen Abstimmungen bleibt Ablehnen ein Tipp. */
function sheetAblehnen(vorschlagId, titel) {
  sheet(`
    <div class="grabber"></div>
    <h3>Rücktritt ablehnen</h3>
    <div class="card flat" style="font-size:14px;font-weight:600">${esc(titel)}</div>
    <div class="field"><label>Warum</label>
      <textarea id="abgrund" maxlength="300" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>Ein Nein beendet den Antrag nicht sofort —
      gezählt wird, bis eine Mehrheit steht oder nicht mehr zu erreichen ist.</span></div>
    <button class="btn primary block" data-senden="ablehnen" data-id="${vorschlagId}">Ablehnen</button>`);
}

function sheetNeueAufgabe(vorlage = null) {
  sheet(`
    <div class="grabber"></div>
    <h3>Wiederkehrende Aufgabe</h3>
    <div class="field"><label>Name</label>
      <input id="aname" value="${esc(vorlage?.name || "")}" placeholder="z. B. Wohnung saugen"></div>
    <div class="field"><label>Raum</label>
      <select id="araum">${raumListe().map((r) =>
        `<option ${vorlage && r === vorlage.category ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></div>
    <div class="field">
      <label>Cleanies-Wert</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">${vorlage ? vorlage.points : 6}</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    ${vorlage ? `<div class="note">${icon("i-info", 16)}<span>Die Quest <b>${esc(vorlage.name)}</b>
      bleibt bestehen. Wenn ihr sie nicht doppelt wollt, löscht sie danach über den Stift.</span></div>` : ""}
    <div class="field">
      <label>Wie oft</label>
      <div class="rhythmuswahl" id="rhythmus">
        ${RHYTHMEN.map((r, i) => `<button data-rhythmus="${esc(r)}" aria-pressed="${i === 0}">${esc(r)}</button>`).join("")}
      </div>
    </div>
    <div class="note">${icon("i-info", 16)}<span>Daraus ergibt sich die Sperre: nach dem Erledigen
      ist die Aufgabe für alle gesperrt, bis der Zeitraum um ist.</span></div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="Warum braucht ihr das?"></textarea></div>
    <button class="btn primary block" data-senden="neue-aufgabe">Zur Abstimmung geben</button>`);
}

function sheetAufgabeMenue(a) {
  const quest = S.quests.find((q) => q.id === a.id) || { id: a.id, name: a.name, points: a.punkte };
  sheet(`
    <div class="grabber"></div>
    <h3>${esc(a.name)}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:13px;color:var(--ink-2)">${esc(a.raum)} · ${esc(a.rhythmus)}</span>
      <span class="pts-pill">${cl(a.punkte)}</span>
    </div>
    <button class="btn ghost block" data-sheet="punktwert" data-id="${quest.id}">Cleanies-Wert ändern</button>
    <button class="btn ghost block" data-sheet="rhythmus" data-id="${quest.id}">Rhythmus ändern</button>
    <button class="btn ghost block" data-senden="nicht-mehr" data-id="${quest.id}">Keine wiederkehrende Aufgabe mehr</button>
    <button class="btn ghost block" data-sheet="loeschen" data-art="quest" data-id="${quest.id}"
      style="color:var(--accent);border-color:var(--accent)">Quest löschen</button>
    <div class="note">${icon("i-vote", 16)}<span>Alles davon geht nur gemeinsam:
      ${esc(andereName())} ${beugung("muss", "müssen")} zustimmen.</span></div>`);
}

/** Aus einer Quest eine wiederkehrende machen — oder den Rhythmus ändern. */
function sheetRhythmus(quest) {
  const schon = !!quest.wiederkehrend;
  sheet(`
    <div class="grabber"></div>
    <h3>${schon ? "Rhythmus ändern" : "Wiederkehrende Aufgabe"}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(quest.name)}</span>
      <span class="pts-pill">${cl(quest.points)}</span>
    </div>
    <div class="field">
      <label>Wie oft</label>
      <div class="rhythmuswahl" id="rhythmus">
        ${RHYTHMEN.map((r) => `<button data-rhythmus="${esc(r)}"
          aria-pressed="${schon ? r === quest.rhythmus : r === RHYTHMEN[0]}">${esc(r)}</button>`).join("")}
      </div>
    </div>
    <div class="note">${icon("i-info", 16)}<span>${schon
      ? "Der neue Rhythmus gilt ab der nächsten Erledigung."
      : "Die Quest wandert damit in den <b>Haushaltsplan</b>: mit Fälligkeit, Sperre nach dem Erledigen und Bewerbung, wenn mehrere sie wollen. Neu anlegen musst du nichts — es bleibt dieselbe Quest."}</span></div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="optional"></textarea></div>
    <button class="btn primary block" data-senden="rhythmus" data-id="${quest.id}">Zur Abstimmung geben</button>`);
}

function sheetErledigt(a) {
  const gesperrt = a.offen > 0;
  sheet(`
    <div class="grabber"></div>
    <h3>${gesperrt ? "Trotzdem erledigen" : "Erledigt melden"}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(a.name)}</span>
      <span class="pts-pill">+${cl(a.punkte)}</span>
    </div>
    ${gesperrt ? `
    <div class="note">${icon("i-lock", 16)}<span>Sie ist noch bis <b>${esc(a.faellig_am)}</b> gesperrt.
      Besondere Umstände brauchen eine Begründung — und jemand anderes muss trotzdem bestätigen.</span></div>
    <div class="field"><label>Warum jetzt schon</label>
      <textarea id="grund" placeholder="z. B. Besuch kommt kurzfristig"></textarea></div>` : `
    <div class="note">${icon("i-info", 16)}<span>${esc(andereName())} ${beugung("bestätigt", "bestätigen")} —
      erst dann gibt es die Cleanies. Danach ist die Aufgabe für ${a.tage} Tage gesperrt.</span></div>`}
    <button class="btn primary block" data-senden="erledigt" data-id="${a.id}"
      data-trotzdem="${gesperrt ? "ja" : "nein"}">Zur Bestätigung senden</button>`);
}

/* ------------------------------------------------------------------ Einstellungen */

function schirmEinstellungen() {
  const wahl = themaWahl();

  const pushZeile = !pushMoeglich()
    ? { text: "Dieses Gerät kann keine Benachrichtigungen", knopf: false }
    : Notification.permission === "granted"
    ? { text: "Eingeschaltet — du erfährst sofort, wenn etwas entschieden wird", knopf: false }
    : Notification.permission === "denied"
    ? { text: "Im Browser blockiert. Dort unter „Berechtigungen“ wieder erlauben.", knopf: false }
    : { text: `Damit du merkst, wenn ${andereName()} etwas ${beugung("meldet", "melden")}`, knopf: true };

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="start" aria-label="Zurück">‹</button>
      <div><div class="title">Einstellungen</div><div class="sub">Dein Konto und dieses Gerät</div></div>
    </div>
    <div class="body">
      <p class="section-label">Dein Name</p>
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px">
          ${bild(S.ich)}
          <span style="flex:1;min-width:0">
            <span style="font-size:14.5px;font-weight:700;display:block">${esc(S.ich.name)}</span>
            <span style="font-size:12px;color:var(--ink-3)">So ${beugung("sieht dich", "sehen dich")} ${esc(andereName())}</span>
          </span>
        </div>
        <div class="field">
          <label>Anzeigename</label>
          <input id="name-feld" maxlength="40" autocomplete="off"
            value="${esc(S.ich.name)}" placeholder="Wie sollen wir dich nennen?">
        </div>
        <button class="btn dark block" data-senden="name">Name speichern</button>
      </div>

      <p class="section-label">Dein Bild</p>
      <div class="card">
        <div class="bildwahl">
          ${BILDWAHL.map((b) => `
            <button class="bw" data-bildwahl="${esc(b)}" ${S.ich.bild === b ? "data-an" : ""}
              aria-label="Bild ${esc(b)}">
              ${FIGUREN[b] ? `<img src="${FIGUREN[b]}" alt="">` : esc(b)}
            </button>`).join("")}
        </div>
        <button class="btn ghost block" data-foto style="font-size:14px">Eigenes Foto wählen</button>
        <input type="file" id="fotofeld" accept="image/*" hidden>
      </div>
      <div class="note">${icon("i-info", 16)}<span>Den Namen änderst du allein — dafür braucht es keine
        Abstimmung. E-Mail und Profilbild kommen weiter aus deinem Google-Konto.</span></div>

      <p class="section-label">Darstellung</p>
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="avatar sm" style="background:var(--tint);color:var(--ink-2)">${icon("i-mond", 17)}</span>
          <span style="flex:1">
            <span style="font-size:14.5px;font-weight:600;display:block">Dunkles Design</span>
            <span style="font-size:12px;color:var(--ink-3)">„System“ folgt der Einstellung deines Handys</span>
          </span>
        </div>
        <div class="filters">
          ${THEMEN.map((t) => `<button data-thema="${t.id}" aria-pressed="${wahl === t.id}">${t.label}</button>`).join("")}
        </div>
        <div style="font-size:12px;color:var(--ink-3)">Gilt nur auf diesem Gerät.</div>
      </div>

      <p class="section-label">Haushalt</p>
      <button class="rowlink" data-go="haushalt">
        <span class="avatar sm" style="background:var(--tint)">${icon("i-heart", 17)}</span>
        <span class="grow"><span class="t">${esc((ARTEN.find((a) => a.id === S.haushalt.art) || ARTEN[2]).k)}</span>
          <span class="m">${S.haushalt.belegt} von ${S.haushalt.groesse} Plätzen${
            S.haushalt.ichVerwalte ? " · du verwaltest" : ""}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>
      <button class="rowlink" data-go="raeume">
        <span class="avatar sm" style="background:var(--tint)">${icon("i-home", 17)}</span>
        <span class="grow"><span class="t">Räume</span>
          <span class="m">${(S.raeume || []).filter((r) => r.aktiv).length} Räume · Kategorien der Quests</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Urlaub</p>
      <button class="rowlink" data-go="urlaub"
        style="${meinUrlaub() || hausUrlaub() ? "border-color:var(--urlaub)" : ""}">
        <span class="avatar sm" style="background:var(--urlaub-tint);color:var(--urlaub)">${icon("i-koffer", 17)}</span>
        <span class="grow"><span class="t">Urlaubsmodus</span>
          <span class="m">${hausUrlaub() ? `${esc(hausWort())} ${beugung("ist", "sind")} bis ${datumKurz(hausUrlaub().bis)} weg`
            : meinUrlaub() ? `Du bist bis ${datumKurz(meinUrlaub().bis)} weg`
            : `Für dich oder für ${esc(hausWort().toLowerCase())}`}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Benachrichtigungen</p>
      ${pushZeile.knopf ? `
      <button class="rowlink" data-push>
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-bell", 18)}</span>
        <span class="grow"><span class="t">Einschalten</span>
          <span class="m">${esc(pushZeile.text)}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>` : `
      <div class="card" style="flex-direction:row;align-items:center;gap:12px">
        <span class="avatar sm" style="background:var(--tint);color:var(--ink-2)">${icon("i-bell", 18)}</span>
        <span style="flex:1;font-size:13px;color:var(--ink-2)">${esc(pushZeile.text)}</span>
      </div>`}

      <p class="section-label">Konto</p>
      <button class="rowlink" data-export>
        <span class="avatar sm" style="background:var(--tint)">${icon("i-down", 17)}</span>
        <span class="grow"><span class="t">Alles exportieren</span>
          <span class="m">Kompletter Stand als Datei</span></span><span style="color:var(--ink-3)">›</span>
      </button>
      <button class="btn text block" data-abmelden>Abmelden</button>
    </div>`;
}

/* ------------------------------------------------------------------ Urlaub */

/** Ein laufender oder kommender Urlaub als Karte. */
function urlaubKarte(u) {
  const haushalt = u.art === "haushalt";
  const meiner = !haushalt && u.member_id === S.ich.id;
  const kommt = u.von > heute();
  const darfBeenden = haushalt ? (u.created_by === S.ich.id || S.haushalt.ichVerwalte) : meiner;

  return `
    <div class="card urlaub">
      <div style="display:flex;align-items:center;gap:11px">
        <span class="avatar sm" style="background:var(--bg);color:var(--urlaub)">
          ${icon(haushalt ? "i-home" : "i-koffer", 18)}</span>
        <span style="flex:1;min-width:0">
          <span style="font-size:14px;font-weight:700;display:block">${
            haushalt ? `${esc(hausWort())} ${beugung("ist", "sind")} im Urlaub`
                     : `${esc(meiner ? "Du bist" : nameVon(u.member_id) + " ist")} im Urlaub`}</span>
          <span style="font-size:11.5px;color:var(--ink-2)">${datumKurz(u.von)} – ${datumKurz(u.bis)}${
            kommt ? " · fängt noch an" : ` · noch ${nochTage(u)} ${nochTage(u) === 1 ? "Tag" : "Tage"}`}</span>
        </span>
      </div>
      <div style="font-size:12px;color:var(--ink-2)">${haushalt
        ? `Alles im Haushaltsplan ist um ${u.verschoben} ${u.verschoben === 1 ? "Tag" : "Tage"} nach hinten gerückt.
           Solange nichts mahnt und nichts bestraft.`
        : "Keine Mahnungen, keine Gruppenstrafe, nicht in der Rangliste. Der Plan bleibt, wie er ist."}</div>
      ${u.grund ? `<div style="font-size:12px;color:var(--ink-2)">„${esc(u.grund)}“</div>` : ""}
      ${darfBeenden ? `<button class="btn text block" data-urlaub-beenden="${u.id}"
        style="color:var(--urlaub)">${kommt ? "Doch nicht" : "Früher zurück"}</button>` : ""}
    </div>`;
}

/** Der kurze Hinweis oben auf Start und im Plan. */
function urlaubBanner() {
  const h = hausUrlaub();
  if (h) return `
    <div class="card urlaub" style="flex-direction:row;align-items:center;gap:11px">
      <span class="avatar sm" style="background:var(--bg);color:var(--urlaub)">${icon("i-home", 18)}</span>
      <span style="flex:1"><span style="font-size:13.5px;font-weight:700;display:block">
        ${esc(hausWort())} ${beugung("ist", "sind")} im Urlaub</span>
        <span style="font-size:11.5px;color:var(--ink-2)">Noch ${nochTage(h)} ${nochTage(h) === 1 ? "Tag" : "Tage"} ·
          alles um ${h.verschoben} ${h.verschoben === 1 ? "Tag" : "Tage"} nach hinten gerückt</span></span>
    </div>`;

  const weg = abwesende();
  if (!weg.length) return "";
  const meiner = weg.find((u) => u.member_id === S.ich.id);
  return `
    <div class="card urlaub" style="flex-direction:row;align-items:center;gap:11px">
      <span class="avatar sm" style="background:var(--bg);color:var(--urlaub)">${icon("i-koffer", 18)}</span>
      <span style="flex:1"><span style="font-size:13.5px;font-weight:700;display:block">${
        meiner ? "Du bist im Urlaub"
               : `${esc(weg.map((u) => nameVon(u.member_id)).join(", "))} ${weg.length === 1 ? "ist" : "sind"} im Urlaub`}</span>
        <span style="font-size:11.5px;color:var(--ink-2)">${meiner
          ? `Noch ${nochTage(meiner)} ${nochTage(meiner) === 1 ? "Tag" : "Tage"} · keine Mahnungen, keine Gruppenstrafe`
          : "Ohne Mahnung und ohne Gruppenstrafe — und nicht in der Rangliste"}</span></span>
    </div>`;
}

function schirmUrlaub() {
  const laufend = urlaube().filter((u) => laeuft(u));
  const kommend = kommendeUrlaube();
  const offen = offeneAbstimmungen().filter((a) => a.art === "urlaub_person" || a.art === "urlaub_haushalt");

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="einstellungen" aria-label="Zurück">‹</button>
      <div><div class="title">Urlaubsmodus</div><div class="sub">Zwei Arten, eine Abstimmung</div></div>
    </div>
    <div class="body">
      ${laufend.map(urlaubKarte).join("")}
      ${kommend.length ? `<p class="section-label">Angemeldet</p>${kommend.map(urlaubKarte).join("")}` : ""}
      ${offen.length ? `
      <p class="section-label">Steht zur Abstimmung</p>
      ${offen.map(abstimmungKarte).join("")}` : ""}

      <p class="section-label">Neu anmelden</p>
      <div class="note">${icon("i-vote", 16)}<span>Beides ${beugung("muss", "müssen")} ${esc(andereName())}
        mitbeschließen. Solange nicht alle zugestimmt haben, ändert sich nichts.</span></div>

      <div class="wahl">
        <button class="urlaubsart" data-urlaubsart="urlaub_person" aria-pressed="true">
          <span class="ico">${icon("i-koffer", 19)}</span>
          <span><span class="t">Nur mich</span>
            <span class="m">Ich bin weg, für ${esc(andereName())} läuft alles weiter. Ich bekomme keine
              Mahnungen und zahle keine Gruppenstrafe mit.</span></span>
        </button>
        <button class="urlaubsart" data-urlaubsart="urlaub_haushalt" aria-pressed="false">
          <span class="ico">${icon("i-home", 19)}</span>
          <span><span class="t">${esc(hausWort())}</span>
            <span class="m">Wir sind alle weg. Jede Fälligkeit im Haushaltsplan rückt um dieselbe
              Zeit nach hinten.</span></span>
        </button>
      </div>

      <div class="zweifeld">
        <div class="field"><label>Von</label><input type="date" id="uvon" value="${heute()}"></div>
        <div class="field"><label>Bis</label><input type="date" id="ubis" value="${heute()}"></div>
      </div>
      <div class="note" id="udauer">${icon("i-info", 16)}<span><b>1 Tag.</b> Der letzte Tag zählt mit.</span></div>
      <div class="field"><label>Warum</label>
        <textarea id="ugrund" placeholder="optional" maxlength="300"></textarea></div>

      <button class="btn block" data-senden="urlaub"
        style="background:var(--urlaub);color:#fff">Zur Abstimmung geben</button>
    </div>`;
}

/* ------------------------------------------------------------------ Verlauf */

function schirmVerlauf() {
  const meins = S.verlauf.filter((b) => b.member_id === S.ich.id);
  const gesammelt = meins.filter((b) => b.delta > 0).reduce((s, b) => s + b.delta, 0);
  const eingeloest = meins.filter((b) => b.delta < 0).reduce((s, b) => s - b.delta, 0);

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="start" aria-label="Zurück">‹</button>
      <div><div class="title">Verlauf</div><div class="sub">Alle Buchungen</div></div>
    </div>
    <div class="body">
      <div class="card navy">
        <span style="font-family:var(--font-data);font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6">Dein Cleanies-Stand</span>
        <span style="font-family:var(--font-display);font-weight:800;font-size:44px;letter-spacing:-.04em;line-height:1">${cl(S.ich.punkte)}</span>
        <span style="font-size:12.5px;opacity:.75">${gesammelt} gesammelt · ${eingeloest} eingelöst (letzte 40 Buchungen)</span>
      </div>
      ${S.verlauf.length ? `
      <ul class="card ledger">
        ${S.verlauf.map((b) => `
          <li>
            ${bild(mitglied(b.member_id), "sm")}
            <span style="flex:1">
              <span style="font-size:13.5px;font-weight:600;display:block">${esc(b.reason)}</span>
              <span style="font-size:11px;color:var(--ink-3);font-family:var(--font-data)">
                ${esc(nameVon(b.member_id))} · ${zeitpunkt(b.created_at)}</span>
            </span>
            <span class="amt ${b.delta > 0 ? "plus" : "minus"}">${b.delta > 0 ? "+" : ""}${cl(b.delta)}</span>
          </li>`).join("")}
      </ul>` : `<div class="card flat leer"><div class="t">Noch keine Buchungen.</div></div>`}
    </div>`;
}

/* ------------------------------------------------------------------ Sheets */

function sheet(html) {
  scrim.innerHTML = `<div class="sheet">${html}</div>`;
  scrim.setAttribute("data-open", "");
}
function sheetZu() {
  scrim.removeAttribute("data-open");
  scrim.innerHTML = "";
}
scrim.addEventListener("click", (ev) => { if (ev.target === scrim) sheetZu(); });

function sheetMelden(quest) {
  const punkte = quest.punkte_jetzt ?? quest.points;
  sheet(`
    <div class="grabber"></div>
    <h3>Erledigt melden</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(quest.name)}</span>
      <span class="pts-pill">${quest.bonus ? `<s style="opacity:.55">${quest.points}</s> ` : ""}${cl(punkte)}</span>
    </div>
    ${quest.bonus ? `<div class="note">${icon("i-heart", 16)}<span>+${quest.bonus} % Aktion läuft —
      der Wert friert beim Melden ein und bleibt, auch wenn erst später bestätigt wird.</span></div>` : ""}
    <div class="field">
      <label>Wie oft</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">1</span>
        <button data-menge="1" aria-label="mehr">+</button>
        <span style="margin-left:auto;font-family:var(--font-data);font-size:14px;color:var(--ink-2)">
          = <b style="color:var(--accent)" id="summe">${punkte}</b> Cleanies</span>
      </div>
    </div>
    <div class="field"><label>Notiz für ${esc(andereName())}</label>
      <textarea id="notiz" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>Die Cleanies werden erst gutgeschrieben, wenn
      ${esc(andereName())} ${beugung("bestätigt", "bestätigen")}. Es zählt der Wert von jetzt — auch wenn er später geändert wird.</span></div>
    <button class="btn primary block" data-senden="melden" data-id="${quest.id}" data-punkte="${punkte}">
      Zur Bestätigung senden</button>`);
}

function sheetAntrag(belohnung) {
  const kosten = belohnung.kosten_jetzt ?? belohnung.cost;
  const fehlt = kosten > S.ich.punkte;
  const ziel = andere();
  sheet(`
    <div class="grabber"></div>
    <h3>Antrag stellen</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(belohnung.name)}</span>
      <span class="pts-pill">${belohnung.rabatt ? `<s style="opacity:.55">−${belohnung.cost}</s> ` : ""}−${cl(kosten)}</span>
    </div>
    ${belohnung.rabatt ? `<div class="note">${icon("i-heart", 16)}<span>Rabatt von ${belohnung.rabatt} % läuft —
      der Preis friert beim Absenden ein, auch wenn erst später entschieden wird.</span></div>` : ""}
    <div class="field"><label>Wunschtermin</label><input id="termin" placeholder="z. B. heute Abend"></div>
    <div class="field"><label>Nachricht</label><textarea id="nachricht" placeholder="optional"></textarea></div>

    ${ziel.length ? `
    <button class="schalter" data-gutschrift aria-pressed="false">
      <span class="box"></span>
      <span class="t">Cleanies an Empfänger senden</span>
    </button>
    <div style="font-size:11.5px;color:var(--ink-3);margin-top:-4px">
      Ohne Haken sind die Cleanies einfach ab. Mit Haken bekommt ${
        ziel.length === 1 ? esc(vorname(ziel[0].name)) : "die gewählte Person"} sie gutgeschrieben —
      jedes Mal neu zu wählen.</div>
    ${ziel.length > 1 ? `
    <div class="field" id="gutschriftwahl" hidden>
      <label>An wen</label>
      <div class="filters">
        ${ziel.map((m, i) => `<button data-gutempfaenger="${m.id}" aria-pressed="${i === 0}">${esc(vorname(m.name))}</button>`).join("")}
      </div>
    </div>` : ""}` : ""}

    <div style="display:flex;justify-content:space-between;font-family:var(--font-data);font-size:13px;color:var(--ink-2)">
      <span>Konto nach Einlösung</span>
      <span><b>${cl(S.ich.punkte)}</b> → <b style="color:var(--accent)">${cl(S.ich.punkte - kosten)}</b></span>
    </div>
    <div id="gutschriftstand" hidden
      style="display:flex;justify-content:space-between;font-family:var(--font-data);font-size:13px;color:var(--ink-2)">
      <span id="gutschriftwer"></span><span id="gutschriftzahlen"></span>
    </div>

    <div class="note">${icon("i-info", 16)}<span>${fehlt
      ? "Dir fehlen noch Cleanies — der Antrag lässt sich erst genehmigen, wenn du sie hast."
      : `${esc(gross(andereName()))} ${beugung("muss", "müssen")} zustimmen. Erst dann werden die Cleanies abgebucht.`}</span></div>
    <button class="btn primary block" data-senden="antrag" data-id="${belohnung.id}"
      data-kosten="${kosten}">Antrag senden</button>`);
}

/** Wer die Gutschrift bekommt: die gewählte Person, sonst die einzige andere. */
function gutschriftEmpfaenger() {
  const gewaehlt = scrim.querySelector('[data-gutempfaenger][aria-pressed="true"]');
  return gewaehlt ? gewaehlt.dataset.gutempfaenger : (andere()[0]?.id || null);
}

/** Ist der Haken gesetzt? */
const gutschriftAn = () => scrim.querySelector("[data-gutschrift]")?.getAttribute("aria-pressed") === "true";

/** Die zweite Kontozeile: alter und neuer Stand der Person, die die Cleanies
 *  bekommt. Erst mit dem Haken sichtbar — vorher gibt es nichts zu zeigen. */
function gutschriftStandZeichnen() {
  const zeile = scrim.querySelector("#gutschriftstand");
  if (!zeile) return;
  const an = gutschriftAn();
  const wahl = scrim.querySelector("#gutschriftwahl");
  if (wahl) wahl.hidden = !an;
  zeile.hidden = !an;
  if (!an) return;

  const wer = mitglied(gutschriftEmpfaenger());
  const kosten = Number(scrim.querySelector('[data-senden="antrag"]')?.dataset.kosten || 0);
  const stand = wer?.punkte ?? 0;
  zeile.querySelector("#gutschriftwer").textContent = `Konto ${vorname(wer?.name || "")}`;
  zeile.querySelector("#gutschriftzahlen").innerHTML =
    `<b>${cl(stand)}</b> → <b style="color:var(--urlaub)">${cl(stand + kosten)}</b>`;
}

function sheetTransfer() {
  const ziel = andere();
  sheet(`
    <div class="grabber"></div>
    <h3>Cleanies übertragen</h3>
    ${ziel.length === 1 ? `
    <div style="display:flex;align-items:center;gap:14px;justify-content:center;padding:6px 0">
      <span style="text-align:center">${bild(S.ich)}<div style="font-size:12px;margin-top:5px">${esc(vorname(S.ich.name))}</div></span>
      <span style="color:var(--accent)">${icon("i-send", 22)}</span>
      <span style="text-align:center">${bild(ziel[0])}<div style="font-size:12px;margin-top:5px">${esc(vorname(ziel[0].name))}</div></span>
    </div>` : `
    <div class="field">
      <label>An wen</label>
      <div class="filters" id="empfaenger">
        ${ziel.map((m, i) => `<button data-empfaenger="${m.id}" aria-pressed="${i === 0}">${esc(vorname(m.name))}</button>`).join("")}
      </div>
    </div>`}
    <div class="field">
      <label>Betrag</label>
      <div class="stepper">
        <button data-betrag="-1" aria-label="weniger">−</button>
        <span class="val" id="betrag">${Math.min(5, S.ich.punkte) || 1}</span>
        <button data-betrag="1" aria-label="mehr">+</button>
        <span style="margin-left:auto;font-family:var(--font-data);font-size:13px;color:var(--ink-2)">
          von ${cl(S.ich.punkte)} verfügbar</span>
      </div>
    </div>
    <div class="field"><label>Nachricht</label><textarea id="nachricht" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>Die Cleanies gelten erst, wenn sie angenommen werden.</span></div>
    <button class="btn primary block" data-senden="transfer">Übertragen</button>`);
}

function sheetNeu() {
  sheet(`
    <div class="grabber"></div>
    <h3>Quest vorschlagen</h3>
    <div class="field"><label>Name</label><input id="qname" placeholder="z. B. Wäsche waschen"></div>
    <div class="field"><label>Raum</label>
      <select id="qkat">${raumListe().map((r) => `<option>${esc(r)}</option>`).join("")}</select></div>
    <div class="field">
      <label>Cleanies-Wert</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">3</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    <button class="schalter" data-wiederkehrend aria-pressed="false">
      <span class="box"></span>
      <span class="t">Wiederkehrende Aufgabe</span>
    </button>
    <div id="rhythmusfeld" hidden>
      <div class="field">
        <label>Wie oft</label>
        <div class="rhythmuswahl" id="rhythmus">
          ${RHYTHMEN.map((r, i) => `<button data-rhythmus="${esc(r)}" aria-pressed="${i === 0}">${esc(r)}</button>`).join("")}
        </div>
      </div>
      <div class="note" style="margin-top:10px">${icon("i-info", 16)}<span>Damit landet sie im
        <b>Haushaltsplan</b> statt in der Quest-Liste: mit Fälligkeit, Sperre nach dem Erledigen
        und Bewerbung, wenn mehrere sie wollen.</span></div>
    </div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="Warum lohnt sich das?"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Beides geht in die Abstimmung. Übernommen wird der
      Vorschlag erst, wenn ${esc(andereName())} ${beugung("zustimmt", "zustimmen")}.</span></div>
    <button class="btn primary block" data-senden="neu">Zur Abstimmung geben</button>`);
}

function sheetMenue(art, eintrag) {
  const istQuest = art === "quest";
  sheet(`
    <div class="grabber"></div>
    <h3>${esc(eintrag.name)}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:13px;color:var(--ink-2)">${istQuest ? "Quest" : "Belohnung"}</span>
      <span class="pts-pill">${cl(istQuest ? eintrag.points : eintrag.cost)}</span>
    </div>
    <button class="btn ghost block" data-sheet="${istQuest ? "punktwert" : "kosten"}" data-id="${eintrag.id}">
      ${istQuest ? "Cleanies-Wert ändern" : "Kosten ändern"}</button>
    ${istQuest ? `<button class="btn ghost block" data-sheet="raum" data-id="${eintrag.id}">Raum ändern</button>
    <button class="btn ghost block" data-sheet="rhythmus" data-id="${eintrag.id}">
      ${eintrag.wiederkehrend ? "Rhythmus ändern" : "Wiederkehrende Aufgabe daraus machen"}</button>
    ${eintrag.wiederkehrend ? `<button class="btn ghost block" data-senden="nicht-mehr" data-id="${eintrag.id}">Keine wiederkehrende Aufgabe mehr</button>` : ""}` : ""}
    <button class="btn ghost block" data-sheet="loeschen" data-art="${art}" data-id="${eintrag.id}"
      style="color:var(--accent);border-color:var(--accent)">
      ${istQuest ? "Quest löschen" : "Belohnung löschen"}</button>
    <div class="note">${icon("i-vote", 16)}<span>Beides geht nur gemeinsam:
      ${esc(andereName())} ${beugung("muss", "müssen")} zustimmen.</span></div>`);
}

function sheetLoeschen(art, eintrag) {
  const istQuest = art === "quest";
  sheet(`
    <div class="grabber"></div>
    <h3>${istQuest ? "Quest löschen" : "Belohnung löschen"}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(eintrag.name)}</span>
      <span class="pts-pill">${cl(istQuest ? eintrag.points : eintrag.cost)}</span>
    </div>
    <div class="field"><label>Begründung</label>
      <textarea id="grund" placeholder="Warum braucht ihr das nicht mehr?"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>Der Eintrag verschwindet nur aus der Liste.
      Bereits gebuchte Cleanies und der Verlauf bleiben unangetastet.</span></div>
    <button class="btn primary block" data-senden="loeschen" data-art="${art}" data-id="${eintrag.id}">
      Zur Abstimmung geben</button>`);
}

function sheetAktion() {
  const kategorien = raumListe();
  sheet(`
    <div class="grabber"></div>
    <h3>Aktion starten</h3>
    <div class="btnrow" id="aktionsart">
      <button class="btn dark" data-art-wahl="quest_bonus">Doppelte Cleanies</button>
      <button class="btn ghost" data-art-wahl="belohnung_rabatt">Rabatt</button>
    </div>

    <div class="field">
      <label id="prozent-label">Wie viel mehr Cleanies</label>
      <div class="stepper">
        <button data-menge="-25" aria-label="weniger">−</button>
        <span class="val" id="menge">100</span>
        <button data-menge="25" aria-label="mehr">+</button>
        <span style="margin-left:auto;font-family:var(--font-data);font-size:14px;color:var(--ink-2)">Prozent</span>
      </div>
    </div>

    <div class="field" id="raum-feld">
      <label>Wofür</label>
      <select id="raum">
        <option value="">Alle Quests</option>
        ${kategorien.map((k) => `<option value="${esc(k)}">Nur ${esc(k)}</option>`).join("")}
      </select>
    </div>

    <div class="field">
      <label>Wie lange</label>
      <div class="btnrow" id="dauer">
        <button class="btn dark" data-dauer-wahl="heute">Heute</button>
        <button class="btn ghost" data-dauer-wahl="wochenende">2 Tage</button>
        <button class="btn ghost" data-dauer-wahl="woche">1 Woche</button>
      </div>
    </div>

    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="Warum jetzt?"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Aktionen starten nur gemeinsam.
      ${esc(andereName())} ${beugung("muss", "müssen")} zustimmen — danach läuft sie sofort.</span></div>
    <button class="btn primary block" data-senden="aktion">Zur Abstimmung geben</button>`);
}

function sheetNeueBelohnung() {
  sheet(`
    <div class="grabber"></div>
    <h3>Belohnung vorschlagen</h3>
    <div class="field"><label>Name</label><input id="bname" placeholder="z. B. Frühstück ans Bett"></div>
    <div class="field">
      <label>Kosten in Cleanies</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">5</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    <button class="schalter" data-bestaetigen aria-pressed="true">
      <span class="box">✓</span>
      <span class="t">Empfang muss bestätigt werden</span>
    </button>
    <div style="font-size:11.5px;color:var(--ink-3);margin-top:-4px">
      Für alles, was jemand ausführt — Massage, Frühstück, Film aussuchen. Bei Ausnahme- und
      Vetoanträgen aus, dort gibt es nichts zu liefern.</div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Neue Belohnungen gehen in die Abstimmung.
      Übernommen wird der Vorschlag erst, wenn ${esc(andereName())} ${beugung("zustimmt", "zustimmen")}.</span></div>
    <button class="btn primary block" data-senden="neue-belohnung">Zur Abstimmung geben</button>`);
}

function sheetKosten(belohnung) {
  sheet(`
    <div class="grabber"></div>
    <h3>Kosten ändern</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(belohnung.name)}</span>
      <span class="pts-pill">jetzt ${cl(belohnung.cost)}</span>
    </div>
    <div class="field">
      <label>Neue Kosten</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">${belohnung.cost}</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    <button class="schalter" data-bestaetigen aria-pressed="${belohnung.bestaetigen ? "true" : "false"}">
      <span class="box">${belohnung.bestaetigen ? "✓" : ""}</span>
      <span class="t">Empfang muss bestätigt werden</span>
    </button>
    <div style="font-size:11.5px;color:var(--ink-3);margin-top:-4px">
      Aus für Ausnahme- und Vetoanträge — dort gibt es nichts zu liefern.</div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="Warum passt der alte Wert nicht mehr?"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Gilt erst, wenn alle zustimmen — und nie rückwirkend.</span></div>
    <button class="btn primary block" data-senden="kosten" data-id="${belohnung.id}">Zur Abstimmung geben</button>`);
}

function sheetCleanieWert(quest) {
  sheet(`
    <div class="grabber"></div>
    <h3>Cleanies-Wert ändern</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(quest.name)}</span>
      <span class="pts-pill">jetzt ${cl(quest.points)}</span>
    </div>
    <div class="field">
      <label>Neuer Wert</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">${quest.points}</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="Warum passt der alte Wert nicht mehr?"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Gilt erst, wenn beide zustimmen — und nie rückwirkend.
      Bereits gemeldete Quests behalten ${quest.points} Cleanies.</span></div>
    <button class="btn primary block" data-senden="punktwert" data-id="${quest.id}">Zur Abstimmung geben</button>`);
}

/** Räume des Haushalts; falls noch keiner gepflegt ist, die Kategorien der Quests. */
function raumListe() {
  const gepflegt = (S.raeume || []).filter((r) => r.aktiv).map((r) => r.name);
  if (gepflegt.length) return gepflegt;
  return [...new Set(S.quests.map((q) => q.category))];
}

function sheetRaum(quest) {
  sheet(`
    <div class="grabber"></div>
    <h3>Raum ändern</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(quest.name)}</span>
      <span class="chip open">${esc(quest.category)}</span>
    </div>
    <div class="raumwahl">
      ${raumListe().map((r) => `
        <button class="raum" data-questraum="${esc(r)}" data-id="${quest.id}" ${r === quest.category ? "data-an" : ""}>
          <span class="haken">${r === quest.category ? "✓" : ""}</span><span class="n">${esc(r)}</span>
        </button>`).join("")}
    </div>
    <div class="note">${icon("i-info", 16)}<span>Der Raum ordnet nur ein — am Cleanies-Wert ändert
      sich nichts. Deshalb geht das ohne Abstimmung.</span></div>`);
}

function schirmRaeume() {
  const liste = S.raeume || [];
  const belegung = (name) => S.quests.filter((q) => q.category === name).length;

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="einstellungen" aria-label="Zurück">‹</button>
      <div><div class="title">Räume</div><div class="sub">Die Kategorien eurer Quests</div></div>
      <button class="iconbtn" data-neuer-raum aria-label="Raum anlegen">${icon("i-plus", 18)}</button>
    </div>
    <div class="body">
      ${liste.length ? liste.map((r) => `
        <div class="zeile" ${r.aktiv ? "" : 'style="opacity:.55"'}>
          <div class="rowlink" style="cursor:default">
            <span class="grow"><span class="t">${esc(r.name)}</span>
              <span class="m">${belegung(r.name)} ${belegung(r.name) === 1 ? "Quest" : "Quests"}${
                r.aktiv ? "" : " · ausgeblendet"}</span></span>
          </div>
          <button class="stiftbtn" data-raum-umbenennen="${r.id}" data-name="${esc(r.name)}"
            aria-label="${esc(r.name)} umbenennen">${icon("i-stift", 17)}</button>
          <button class="stiftbtn" data-raum-schalten="${r.id}" data-aktiv="${r.aktiv ? 0 : 1}"
            aria-label="${esc(r.name)} ${r.aktiv ? "ausblenden" : "einblenden"}">${r.aktiv ? "✕" : "＋"}</button>
        </div>`).join("") : `
        <div class="card flat" style="font-size:13.5px;color:var(--ink-2)">
          Noch keine Räume angelegt. Über das Plus oben kommt der erste dazu.
        </div>`}
      <div class="note">${icon("i-info", 16)}<span>Ein umbenannter Raum zieht seine Quests mit.
        Ausblenden geht erst, wenn keine Quest mehr darin liegt — so verschwindet nichts
        aus Versehen.</span></div>
    </div>`;
}

function schirmHaushalt() {
  const h = S.haushalt;
  const art = ARTEN.find((a) => a.id === h.art) || ARTEN[2];

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="einstellungen" aria-label="Zurück">‹</button>
      <div><div class="title">Haushalt</div>
        <div class="sub">${esc(art.k)} · ${h.belegt} von ${h.groesse}</div></div>
    </div>
    <div class="body">
      <p class="section-label">Art</p>
      <div class="kacheln">
        ${ARTEN.map((a) => `
          <button class="kachel" data-hart="${a.id}" ${h.art === a.id ? "data-an" : ""}
            ${h.ichVerwalte ? "" : "disabled"}>
            <span class="k">${a.k}</span><span class="m">${a.m}</span>
          </button>`).join("")}
      </div>

      <p class="section-label">Plätze</p>
      <div class="card">
        <div class="stepper">
          <button data-hzaehl="-1" ${h.ichVerwalte ? "" : "disabled"} aria-label="weniger">−</button>
          <span class="val">${h.groesse}</span>
          <button data-hzaehl="1" ${h.ichVerwalte ? "" : "disabled"} aria-label="mehr">+</button>
          <span style="margin-left:auto;font-size:12.5px;color:var(--ink-2)">${h.belegt} belegt</span>
        </div>
      </div>

      <p class="section-label">Gruppenstrafe</p>
      <div class="card" style="gap:9px">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-shield", 17)}</span>
          <span style="flex:1">
            <span style="font-size:14px;font-weight:600;display:block">Nach sieben überfälligen Tagen</span>
            <span style="font-size:12px;color:var(--ink-3)">Jeder verliert den Cleanies-Wert der Aufgabe</span>
          </span>
        </div>
        <div class="filters">
          <button data-strafe="an" aria-pressed="${h.strafe}" ${h.ichVerwalte ? "" : "disabled"}>An</button>
          <button data-strafe="aus" aria-pressed="${!h.strafe}" ${h.ichVerwalte ? "" : "disabled"}>Aus</button>
        </div>
      </div>

      <p class="section-label">Wer dabei ist</p>
      ${S.mitglieder.map((m) => `
        <div class="rowlink" style="cursor:default">
          ${bild(m)}
          <span class="grow"><span class="t">${esc(vorname(m.name))}</span>
            <span class="m">${m.rolle === "verwalter" ? "Verwaltet den Haushalt" : "Mitglied"}</span></span>
          ${m.id === S.ich.id ? '<span class="chip wait">du</span>' : ""}
        </div>`).join("")}
      ${h.belegt < h.groesse ? `
      <button class="rowlink" data-go="einladen">
        <span class="avatar sm" style="background:var(--tint)">${icon("i-plus", 17)}</span>
        <span class="grow"><span class="t">Einladen</span>
          <span class="m">Code für die freien Plätze</span></span><span style="color:var(--ink-3)">›</span>
      </button>` : ""}

      ${h.ichVerwalte ? "" : `<div class="note">${icon("i-lock", 16)}<span>Art und Plätze ändert,
        wer den Haushalt verwaltet. Alles andere darfst du genauso wie alle.</span></div>`}
    </div>`;
}

/* ------------------------------------------------------------------ Bedienung */

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-go],[data-filter],[data-sheet],[data-menge],[data-betrag],[data-senden],[data-entscheiden],[data-stimme],[data-paar-anlegen],[data-paar-beitreten],[data-teilen],[data-neuladen],[data-abmelden],[data-export],[data-bleiben],[data-schliessen-app],[data-push],[data-art-wahl],[data-dauer-wahl],[data-sort],[data-suche-leeren],[data-thema],[data-eweiter],[data-ezurueck],[data-ecode],[data-ebild],[data-eart],[data-ezaehl],[data-eraum],[data-eneuerraum],[data-foto],[data-eanlegen],[data-bildwahl],[data-empfaenger],[data-questraum],[data-neuer-raum],[data-raum-umbenennen],[data-raum-schalten],[data-hart],[data-hzaehl],[data-wiederkehrend],[data-plan],[data-plansicht],[data-rhythmus],[data-bewerbung],[data-vergabe],[data-strafe],[data-empfang],[data-nachhol],[data-nachholen],[data-bestaetigen],[data-urlaubsart],[data-urlaub-beenden],[data-gutschrift],[data-gutempfaenger],[data-ruecktritt]");
  if (!el) return;

  // Navigation & Anzeige
  if (el.dataset.go) {
    ansicht = el.dataset.go;
    sheetZu();
    zeichne();
    if (ansicht === "statistik") {
      statistikLaden().then(zeichne).catch((f) => toast(f.message, true));
    }
    return;
  }
  if (el.dataset.filter) { filter = el.dataset.filter; zeichne(); return; }

  if (el.dataset.sort) {
    const bereich = el.dataset.bereich;
    const s = sortierung[bereich];
    if (s.nach === el.dataset.sort && el.dataset.sort !== "genutzt") s.ab = !s.ab;
    else { s.nach = el.dataset.sort; s.ab = el.dataset.sort === "punkte"; }
    zeichne();
    return;
  }

  if (el.dataset.sucheLeeren) {
    suche[el.dataset.sucheLeeren] = "";
    zeichne();
    return;
  }

  if (el.dataset.thema) {
    themaSetzen(el.dataset.thema);
    zeichne();
    return;
  }

  if (el.dataset.plansicht) { planGruppiert = el.dataset.plansicht === "raum"; zeichne(); return; }

  // Die Art wechseln, ohne den Schirm neu zu zeichnen — sonst wären die schon
  // eingetippten Daten wieder weg.
  if (el.dataset.urlaubsart) {
    for (const k of document.querySelectorAll(".urlaubsart")) k.setAttribute("aria-pressed", String(k === el));
    return;
  }

  if (el.dataset.urlaubBeenden) {
    const ergebnis = await api(`urlaub/${el.dataset.urlaubBeenden}/beenden`, {});
    await laden();
    toast(ergebnis.art === "haushalt" ? "Urlaub beendet — der Plan läuft wieder." : "Willkommen zurück.");
    return;
  }

  if (el.hasAttribute("data-wiederkehrend")) {
    const an = el.getAttribute("aria-pressed") !== "true";
    el.setAttribute("aria-pressed", an);
    el.querySelector(".box").textContent = an ? "✓" : "";
    document.getElementById("rhythmusfeld").hidden = !an;
    return;
  }

  if (el.hasAttribute("data-bestaetigen")) {
    const an = el.getAttribute("aria-pressed") !== "true";
    el.setAttribute("aria-pressed", an);
    el.querySelector(".box").textContent = an ? "✓" : "";
    return;
  }

  if (el.dataset.plan) {
    ansicht = "aufgabe";
    aufgabe = null;
    sheetZu();
    zeichne();
    aufgabeLaden(el.dataset.plan).then(zeichne).catch((f) => toast(f.message, true));
    return;
  }

  if (el.dataset.rhythmus) {
    scrim.querySelectorAll("[data-rhythmus]").forEach((b) => b.setAttribute("aria-pressed", b === el));
    return;
  }

  if (el.dataset.empfaenger) {
    scrim.querySelectorAll("[data-empfaenger]").forEach((b) => b.setAttribute("aria-pressed", b === el));
    return;
  }

  // Der Haken „Cleanies an Empfänger senden" und die Wahl dahinter. Beides
  // zeichnet nur die zweite Kontozeile neu, nicht das ganze Blatt — sonst wären
  // Termin und Nachricht wieder leer.
  if (el.hasAttribute("data-gutschrift")) {
    el.setAttribute("aria-pressed", String(el.getAttribute("aria-pressed") !== "true"));
    el.querySelector(".box").textContent = el.getAttribute("aria-pressed") === "true" ? "\u2713" : "";
    gutschriftStandZeichnen();
    return;
  }
  if (el.dataset.gutempfaenger) {
    scrim.querySelectorAll("[data-gutempfaenger]").forEach((b) => b.setAttribute("aria-pressed", b === el));
    gutschriftStandZeichnen();
    return;
  }

  /* ---------- Einrichtung ---------- */
  if (el.hasAttribute("data-eweiter")) { eNamenMerken(); E.schritt++; return zeichne(); }
  if (el.hasAttribute("data-ezurueck")) { eNamenMerken(); E.schritt = Math.max(0, E.schritt - 1); return zeichne(); }
  if (el.hasAttribute("data-ecode")) { eNamenMerken(); E.schritt = -1; return zeichne(); }
  if (el.dataset.ebild) { eNamenMerken(); E.bild = el.dataset.ebild; return zeichne(); }
  if (el.dataset.eart) {
    E.art = el.dataset.eart;
    if (E.art === "wg" && E.personen < 3) E.personen = 3;
    if (E.art === "paar" && E.personen < 2) E.personen = 2;
    return zeichne();
  }
  if (el.dataset.ezaehl) {
    const [feld, schritt] = el.dataset.ezaehl.split(":");
    const min = feld === "kinder" ? 0 : 1;
    E[feld] = Math.max(min, Math.min(12, E[feld] + Number(schritt)));
    return zeichne();
  }
  if (el.dataset.eraum) {
    eRaeume().has(el.dataset.eraum) ? eRaeume().delete(el.dataset.eraum) : eRaeume().add(el.dataset.eraum);
    return zeichne();
  }
  if (el.hasAttribute("data-eneuerraum")) {
    const name = (prompt("Wie heißt der Raum?") || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (name.length >= 2) eRaeume().add(name);
    return zeichne();
  }
  if (el.hasAttribute("data-foto")) {
    document.getElementById("fotofeld")?.click();
    return;
  }

  if (el.dataset.sheet) {
    const art = el.dataset.sheet;
    if (art === "menue") {
      const istQuest = el.dataset.art === "quest";
      const eintrag = (istQuest ? S.quests : S.belohnungen).find((x) => x.id === el.dataset.id);
      if (eintrag) sheetMenue(el.dataset.art, eintrag);
      return;
    }
    if (art === "punktwert" || art === "kosten" || art === "loeschen") {
      const liste = art === "kosten" || el.dataset.art === "belohnung" ? S.belohnungen : S.quests;
      const eintrag = liste.find((x) => x.id === el.dataset.id);
      if (!eintrag) return;
      sheetZu();
      if (art === "punktwert") sheetCleanieWert(eintrag);
      else if (art === "kosten") sheetKosten(eintrag);
      else sheetLoeschen(el.dataset.art, eintrag);
      return;
    }
    if (art === "raum") {
      const quest = S.quests.find((q) => q.id === el.dataset.id);
      if (!quest) return;
      sheetZu();
      sheetRaum(quest);
      return;
    }
    if (art === "rueckfrage") { sheetRueckfrage(el.dataset.bereich, el.dataset.id, el.dataset.termin); return; }
    if (art === "antwort") {
      const satz = meineRueckfragen().find((r) => r.id === el.dataset.id);
      if (satz) sheetAntwort(el.dataset.bereich, satz);
      return;
    }
    if (art === "zusage") {
      const r = belohnungenOffen().find((x) => x.id === el.dataset.id);
      if (r) sheetZusage(r);
      return;
    }
    if (art === "meins") {
      const o = meineOffenenSachen().find((x) => x.id === el.dataset.id && x.bereich === el.dataset.bereich);
      if (o) sheetMeins(o);
      return;
    }
    if (art === "ruecktritt") { if (aufgabe) sheetRuecktritt(aufgabe); return; }
    if (art === "ablehnen") { sheetAblehnen(el.dataset.id, el.dataset.titel); return; }
    if (art === "neue-aufgabe") { sheetNeueAufgabe(); return; }

    if (art === "aufgabe-menue") { if (aufgabe) sheetAufgabeMenue(aufgabe); return; }
    if (art === "rhythmus") {
      const quest = S.quests.find((q) => q.id === el.dataset.id);
      if (!quest) return;
      sheetZu();
      sheetRhythmus(quest);
      return;
    }
    if (art === "erledigt") {
      const eintrag = aufgabe && aufgabe.id === el.dataset.id ? aufgabe : plan().find((x) => x.id === el.dataset.id);
      if (eintrag) sheetErledigt(eintrag);
      return;
    }
    if (art === "neue-belohnung") { sheetNeueBelohnung(); return; }
    if (art === "aktion") { sheetAktion(); return; }
    if (scrim.hasAttribute("data-open")) return;
    if (art === "melden") {
      const quest = S.quests.find((q) => q.id === el.dataset.id);
      if (quest) sheetMelden(quest);
    } else if (art === "antrag") {
      const b = S.belohnungen.find((x) => x.id === el.dataset.id);
      if (b) sheetAntrag(b);
    } else if (art === "transfer") {
      if (allein()) return toast("Es ist noch niemand sonst im Haushalt", true);
      if (S.ich.punkte < 1) return toast("Du hast noch keine Cleanies zum Übertragen", true);
      sheetTransfer();
    } else if (art === "neu") sheetNeu();
    return;
  }

  // Aktions-Sheet: Art und Dauer umschalten
  if (el.dataset.artWahl) {
    scrim.querySelectorAll("[data-art-wahl]").forEach((b) => {
      b.className = "btn " + (b === el ? "dark" : "ghost");
    });
    const rabatt = el.dataset.artWahl === "belohnung_rabatt";
    document.getElementById("raum-feld").style.display = rabatt ? "none" : "";
    document.getElementById("prozent-label").textContent = rabatt ? "Wie viel Rabatt" : "Wie viel mehr Cleanies";
    document.getElementById("menge").textContent = rabatt ? 25 : 100;
    return;
  }
  if (el.dataset.dauerWahl) {
    scrim.querySelectorAll("[data-dauer-wahl]").forEach((b) => {
      b.className = "btn " + (b === el ? "dark" : "ghost");
    });
    return;
  }

  // Stepper
  if (el.dataset.menge) {
    const feld = document.getElementById("menge");
    const summe = document.getElementById("summe");
    const schritt = Number(el.dataset.menge);
    const neu = Math.max(Math.abs(schritt) === 25 ? 25 : 1, Number(feld.textContent) + schritt);
    feld.textContent = neu;
    if (summe) {
      const proStueck = Number(document.querySelector("[data-senden='melden']")?.dataset.punkte || 0);
      summe.textContent = neu * proStueck;
    }
    return;
  }
  if (el.dataset.betrag) {
    const feld = document.getElementById("betrag");
    const neu = Math.max(1, Math.min(S.ich.punkte, Number(feld.textContent) + Number(el.dataset.betrag)));
    feld.textContent = neu;
    return;
  }

  const wert = (id) => document.getElementById(id)?.value?.trim() || "";
  const zahl = (id) => Number(document.getElementById(id)?.textContent || 0);

  try {
    el.disabled = true;

    if (el.dataset.bildwahl) {
      await api("profil", { bild: el.dataset.bildwahl });
      await laden();
      return;
    }

    if (el.dataset.questraum) {
      await api(`quests/${el.dataset.id}/raum`, { raum: el.dataset.questraum });
      sheetZu(); await laden();
      toast(`Raum: ${el.dataset.questraum}`);
      return;
    }

    if (el.hasAttribute("data-neuer-raum")) {
      const name = (prompt("Wie heißt der Raum?") || "").trim();
      if (!name) return;
      await api("raeume", { name });
      await laden();
      toast("Raum angelegt.");
      return;
    }

    if (el.dataset.raumUmbenennen) {
      const name = (prompt("Neuer Name des Raums", el.dataset.name) || "").trim();
      if (!name || name === el.dataset.name) return;
      await api(`raeume/${el.dataset.raumUmbenennen}`, { name });
      await laden();
      toast("Umbenannt — die Quests sind mitgewandert.");
      return;
    }

    if (el.dataset.raumSchalten) {
      await api(`raeume/${el.dataset.raumSchalten}`, { aktiv: el.dataset.aktiv === "1" });
      await laden();
      return;
    }

    if (el.dataset.hart) {
      await api("haushalt", { art: el.dataset.hart });
      await laden();
      return;
    }

    if (el.dataset.hzaehl) {
      const h = S.haushalt;
      await api("haushalt", { personen: h.groesse + Number(el.dataset.hzaehl),
                              erwachsene: h.erwachsene + Number(el.dataset.hzaehl), kinder: h.kinder });
      await laden();
      return;
    }

    if (el.hasAttribute("data-eanlegen")) {
      eNamenMerken();
      await api("haushalt/einrichten", {
        name: E.name, bild: E.bild, art: E.art,
        erwachsene: E.erwachsene, kinder: E.kinder, personen: E.personen,
        raeume: [...eRaeume()]
      });
      ansicht = eZahl() > 1 ? "einladen" : "start";
      await laden();
      toast("Euer Haushalt steht.");
      return;
    }

    if (el.dataset.senden === "rueckfrage") {
      await api(`${el.dataset.bereich}/${el.dataset.id}/rueckfrage`, {
        text: wert("rtext"), termin: wert("rtermin")
      });
      sheetZu(); await laden();
      toast("Rückfrage geschickt.");
      return;
    }

    if (el.dataset.senden === "antwort") {
      await api(`${el.dataset.bereich}/${el.dataset.id}/antwort`, {
        termin: wert("atermin"), nachricht: wert("atext")
      });
      sheetZu(); await laden();
      toast("Antwort raus — der Antrag steht wieder zur Entscheidung.");
      return;
    }

    if (el.dataset.senden === "meins-aendern") {
      const körper = { nachricht: wert("mtext") };
      if (el.dataset.bereich === "requests") körper.termin = wert("mtermin");
      await api(`${el.dataset.bereich}/${el.dataset.id}/aendern`, körper);
      sheetZu(); await laden();
      toast(`${andereName()} ${beugung("sieht", "sehen")} deine Ergänzung.`);
      return;
    }

    if (el.dataset.senden === "ruecktritt") {
      const ergebnis = await api("proposals", {
        art: "ruecktritt", zielId: el.dataset.id, grund: wert("rtgrund")
      });
      sheetZu(); await aufgabeLaden(el.dataset.id); await laden();
      const weitere = ergebnis.noetig - 1;
      toast(`Steht zur Abstimmung — ${weitere === 1 ? "eine Stimme" : `${weitere} Stimmen`} fehlen noch.`);
      return;
    }

    if (el.dataset.senden === "ablehnen") {
      const ergebnis = await api(`proposals/${el.dataset.id}/vote`, { antwort: false, grund: wert("abgrund") });
      sheetZu(); await laden();
      toast(ergebnis.status === "abgelehnt" ? "Abgelehnt — es bleibt, wie es war."
                                            : "Vermerkt. Es fehlen noch Stimmen.");
      return;
    }

    if (el.dataset.senden === "urlaub") {
      const art = document.querySelector('.urlaubsart[aria-pressed="true"]')?.dataset.urlaubsart || "urlaub_person";
      const ergebnis = await api("proposals", {
        art, von: wert("uvon"), bis: wert("ubis"), grund: wert("ugrund")
      });
      await laden();
      toast(`${ergebnis.tage} ${ergebnis.tage === 1 ? "Tag" : "Tage"} — steht jetzt zur Abstimmung.`);
      return;
    }

    if (el.dataset.senden === "meins-storno") {
      await api(`${el.dataset.bereich}/${el.dataset.id}/storno`, {});
      sheetZu(); await laden();
      toast("Zurückgezogen — als wäre nichts gewesen.");
      return;
    }

    if (el.dataset.empfang) {
      const ja = el.dataset.erhalten === "ja";
      const ergebnis = await api(`requests/${el.dataset.empfang}/empfang`, { erhalten: ja });
      await laden();
      if (ja) toast("Schön — bestätigt.");
      else toast("Vermerkt. Die Cleanies sind ab, drei Tage bleiben zum Nachholen.", true);
      return;
    }

    if (el.dataset.nachhol) {
      await api(`requests/${el.dataset.nachhol}/nachhol-pruefen`, { ja: el.dataset.ja === "ja" });
      await laden();
      toast(el.dataset.ja === "ja" ? "Die Cleanies sind zurück." : "Vermerkt — die Cleanies bleiben ab.");
      return;
    }

    if (el.dataset.nachholen) {
      await api(`requests/${el.dataset.nachholen}/nachholen`, {});
      sheetZu(); await laden();
      toast("Gemeldet — es fehlt noch die Bestätigung.");
      return;
    }

    if (el.dataset.bewerbung) {
      const weg = el.dataset.bewerbung === "zurueck";
      await api(`plan/${el.dataset.id}/${weg ? "zurueckziehen" : "bewerben"}`, {});
      await aufgabeLaden(el.dataset.id);
      await laden();
      toast(weg ? "Bewerbung zurückgezogen." : "Beworben — bis morgen können sich die anderen melden.");
      return;
    }

    if (el.dataset.vergabe) {
      const ja = el.dataset.annehmen === "ja";
      const ergebnis = await api(`plan/${el.dataset.vergabe}/vergabe`, { annehmen: ja });
      await aufgabeLaden(el.dataset.vergabe);
      await laden();
      toast(ja ? "Die Aufgabe gehört dir."
           : ergebnis.status === "offen" ? "Abgelehnt — jetzt ist sie wieder für alle offen."
           : "Weitergereicht an den Nächsten.");
      return;
    }

    if (el.dataset.senden === "neue-aufgabe") {
      if (!wert("aname")) throw new Error("Ein Name fehlt");
      await api("proposals", {
        art: "neue_aufgabe", wert: zahl("menge"), name: wert("aname"), raum: wert("araum"),
        rhythmus: scrim.querySelector('[data-rhythmus][aria-pressed="true"]')?.dataset.rhythmus || "1× pro Woche",
        grund: wert("grund")
      });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
      return;
    }

    if (el.dataset.senden === "rhythmus") {
      await api("proposals", {
        art: "aufgabe_aendern", zielId: el.dataset.id, wiederkehrend: true,
        rhythmus: scrim.querySelector('[data-rhythmus][aria-pressed="true"]')?.dataset.rhythmus || "1× pro Woche",
        grund: wert("grund")
      });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
      return;
    }

    if (el.dataset.senden === "nicht-mehr") {
      await api("proposals", { art: "aufgabe_aendern", zielId: el.dataset.id, wiederkehrend: false });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
      return;
    }

    if (el.dataset.senden === "erledigt") {
      await api("claims", {
        questId: el.dataset.id, anzahl: 1,
        trotzdem: el.dataset.trotzdem === "ja", grund: wert("grund")
      });
      sheetZu();
      await aufgabeLaden(el.dataset.id).catch(() => {});
      await laden();
      toast(`Gemeldet — ${andereName()} ${beugung("muss", "müssen")} bestätigen.`);
      return;
    }

    if (el.dataset.strafe !== undefined) {
      await api("haushalt", { strafe: el.dataset.strafe === "an" });
      await laden();
      return;
    }

    if (el.dataset.senden === "name") {
      const ergebnis = await api("profil", { name: document.getElementById("name-feld")?.value || "" });
      await laden();
      toast(`Name geändert: ${ergebnis.name}`);
      return;
    }
    if (el.dataset.senden === "melden") {
      await api("claims", { questId: el.dataset.id, anzahl: zahl("menge"), notiz: wert("notiz") });
      sheetZu(); await laden();
      toast(`Gemeldet — ${andereName()} ${beugung("muss", "müssen")} bestätigen.`);
      return;
    }
    if (el.dataset.senden === "antrag") {
      const an = gutschriftAn() ? gutschriftEmpfaenger() : null;
      await api("requests", {
        rewardId: el.dataset.id, termin: wert("termin"), nachricht: wert("nachricht"), gutschriftAn: an
      });
      sheetZu(); await laden();
      toast(an ? `Antrag gesendet — die Cleanies gehen an ${vorname(mitglied(an)?.name || "")}.`
               : "Antrag gesendet.");
      return;
    }
    if (el.dataset.senden === "transfer") {
      const empfaenger = scrim.querySelector('[data-empfaenger][aria-pressed="true"]')?.dataset.empfaenger
        || (andere().length === 1 ? andere()[0].id : null);
      await api("transfers", { betrag: zahl("betrag"), an: empfaenger, nachricht: wert("nachricht") });
      sheetZu(); await laden();
      toast("Übertragung angeboten.");
      return;
    }
    if (el.dataset.senden === "neu") {
      if (!wert("qname")) throw new Error("Ein Name fehlt");
      const wiederkehrend = scrim.querySelector("[data-wiederkehrend]")?.getAttribute("aria-pressed") === "true";
      await api("proposals", wiederkehrend
        ? { art: "neue_aufgabe", wert: zahl("menge"), name: wert("qname"), raum: wert("qkat"),
            rhythmus: scrim.querySelector('[data-rhythmus][aria-pressed="true"]')?.dataset.rhythmus || "1× pro Woche",
            grund: wert("grund") }
        : { art: "new_quest", wert: zahl("menge"), name: wert("qname"), kategorie: wert("qkat"), grund: wert("grund") });
      sheetZu(); ansicht = "wir"; await laden();
      toast(wiederkehrend ? "Aufgabe für den Plan steht zur Abstimmung." : "Vorschlag steht zur Abstimmung.");
      return;
    }
    if (el.dataset.senden === "aktion") {
      const gewaehlt = scrim.querySelector("[data-art-wahl].dark")?.dataset.artWahl || "quest_bonus";
      const dauer = scrim.querySelector("[data-dauer-wahl].dark")?.dataset.dauerWahl || "heute";
      await api("proposals", {
        art: "neue_aktion",
        aktionsart: gewaehlt,
        prozent: zahl("menge"),
        kategorie: gewaehlt === "quest_bonus" ? wert("raum") : "",
        dauer,
        grund: wert("grund")
      });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Aktion steht zur Abstimmung.");
      return;
    }
    if (el.dataset.senden === "neue-belohnung") {
      if (!wert("bname")) throw new Error("Ein Name fehlt");
      await api("proposals", { art: "new_reward", wert: zahl("menge"), name: wert("bname"),
        bestaetigen: scrim.querySelector("[data-bestaetigen]")?.getAttribute("aria-pressed") !== "false",
        grund: wert("grund") });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
      return;
    }
    if (el.dataset.senden === "kosten") {
      await api("proposals", { art: "reward_cost", zielId: el.dataset.id, wert: zahl("menge"),
        bestaetigen: scrim.querySelector("[data-bestaetigen]")?.getAttribute("aria-pressed") !== "false",
        grund: wert("grund") });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
      return;
    }
    if (el.dataset.senden === "loeschen") {
      const art = el.dataset.art === "quest" ? "delete_quest" : "delete_reward";
      await api("proposals", { art, zielId: el.dataset.id, grund: wert("grund") });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Löschen steht zur Abstimmung.");
      return;
    }
    if (el.dataset.senden === "punktwert") {
      await api("proposals", { art: "quest_points", zielId: el.dataset.id, wert: zahl("menge"), grund: wert("grund") });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
      return;
    }

    if (el.dataset.entscheiden) {
      const bereich = el.dataset.entscheiden;
      const status = el.dataset.status;
      const ergebnis = await api(`${bereich}/${el.dataset.id}/decide`, { status });
      await laden();
      if (status === "bestaetigt") {
        if (bereich === "claims") feiern({ punkte: ergebnis.punkte, titel: "Bestätigt", text: ergebnis.quest });
        else if (bereich === "requests") toast(`${ergebnis.belohnung} genehmigt.`);
        else toast("Cleanies angenommen.");
      } else {
        toast("Abgelehnt.");
      }
      return;
    }

    if (el.dataset.stimme) {
      const ergebnis = await api(`proposals/${el.dataset.stimme}/vote`, { antwort: el.dataset.antwort === "ja" });
      await laden();
      if (ergebnis.status === "bestaetigt") toast(`Beide einverstanden — neuer Wert: ${ergebnis.wert} Cleanies.`);
      else if (ergebnis.status === "abgelehnt") toast("Abgelehnt — der alte Wert gilt weiter.");
      else toast(`Deine Stimme zählt. ${beugung("Es fehlt noch eine.", "Es fehlen noch Stimmen.")}`);
      return;
    }

    if (el.hasAttribute("data-paar-anlegen")) { await api("pair/create", {}); await laden(); return; }

    if (el.hasAttribute("data-paar-beitreten")) {
      const code = document.getElementById("code-eingabe")?.value.replace(/\D/g, "");
      // Name und Bild aus dem ersten Schritt gelten auch für den, der beitritt.
      if (!S.eingerichtet) await api("profil", { name: E.name, bild: E.bild });
      await api("pair/join", { code });
      await laden();
      toast("Willkommen im Haushalt!");
      return;
    }

    if (el.hasAttribute("data-teilen")) {
      const text = `Mein Haus-Quest-Code: ${S.code}\nApp: https://haus-quest.com`;
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Code kopiert."); }
      return;
    }

    if (el.hasAttribute("data-neuladen")) { await laden(); toast("Aktualisiert."); return; }

    if (el.hasAttribute("data-export")) {
      const daten = await api("export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `haus-quest-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Datei gespeichert.");
      return;
    }

    if (el.hasAttribute("data-push")) {
      await pushEinschalten();
      zeichne();
      toast("Benachrichtigungen sind an.");
      return;
    }

    if (el.hasAttribute("data-bleiben")) { sheetZu(); return; }

    if (el.hasAttribute("data-schliessen-app")) {
      sheetZu();
      // Zwei Schritte zurück: über den Wächter hinaus und aus der App heraus.
      history.go(-2);
      return;
    }

    if (el.hasAttribute("data-abmelden")) {
      await fetch("/api/auth/logout", { method: "POST" });
      location.href = "/";
      return;
    }
  } catch (fehler) {
    toast(fehler.message, true);
  } finally {
    el.disabled = false;
  }
});

/* ------------------------------------------------------------------ Eigenes Foto */
//
// Das Bild wird auf dem Handy quadratisch zugeschnitten und auf 256 Pixel
// verkleinert, bevor es überhaupt losgeschickt wird. So bleibt es klein, und
// alles, was sonst in einer Fotodatei steckt — Ort, Uhrzeit, Kameramodell —
// bleibt beim Zeichnen auf der Strecke.

function eNamenMerken() {
  const feld = document.getElementById("e-name");
  if (feld) E.name = feld.value.replace(/\s+/g, " ").trim() || vorname(S.ich.name);
}

async function fotoVerkleinern(datei, kante = 256) {
  const bitmap = await createImageBitmap(datei);
  const seite = Math.min(bitmap.width, bitmap.height);
  const leinwand = document.createElement("canvas");
  leinwand.width = leinwand.height = kante;
  leinwand.getContext("2d").drawImage(
    bitmap,
    (bitmap.width - seite) / 2, (bitmap.height - seite) / 2, seite, seite,
    0, 0, kante, kante
  );
  bitmap.close?.();
  return leinwand.toDataURL("image/jpeg", 0.82);
}

document.addEventListener("change", async (ev) => {
  const feld = ev.target.closest("#fotofeld");
  if (!feld || !feld.files?.length) return;
  try {
    const datenUrl = await fotoVerkleinern(feld.files[0]);
    if (S.eingerichtet) {
      await api("profil", { bild: datenUrl });
      await laden();
      toast("Bild geändert.");
    } else {
      E.bild = datenUrl;
      zeichne();
    }
  } catch {
    toast("Dieses Bild ließ sich nicht lesen", true);
  } finally {
    feld.value = "";
  }
});

/* ------------------------------------------------------------------ Suchen & Sortieren bedienen */

function listeZeichnen() {
  const behaelter = document.getElementById("liste");
  if (!behaelter) return;
  behaelter.innerHTML = ansicht === "quests" ? questListe() : belohnungsListe();
}

/** Die Tageszahl beim Urlaub rechnet mit, während man tippt — sonst weiß
 *  niemand, worüber gleich abgestimmt wird. */
document.addEventListener("input", (ev) => {
  if (!ev.target.closest("#uvon, #ubis")) return;
  const hinweis = document.getElementById("udauer")?.querySelector("span");
  if (!hinweis) return;
  const von = document.getElementById("uvon")?.value;
  const bis = document.getElementById("ubis")?.value;
  if (!von || !bis) { hinweis.innerHTML = "Wähle einen Zeitraum."; return; }
  const tage = tageZwischen(von, bis);
  hinweis.innerHTML = tage < 1
    ? "Das Ende liegt vor dem Anfang."
    : `<b>${tage} ${tage === 1 ? "Tag" : "Tage"}.</b> Der letzte Tag zählt mit.`;
});

document.addEventListener("input", (ev) => {
  const feld = ev.target.closest("#suchfeld");
  if (!feld) return;
  suche[feld.dataset.bereich] = feld.value;
  listeZeichnen();

  // Der Knopf zum Leeren erscheint und verschwindet, ohne das Feld neu zu bauen.
  const zeile = feld.parentElement;
  const vorhanden = zeile.querySelector(".leeren");
  if (feld.value && !vorhanden) {
    zeile.insertAdjacentHTML("beforeend",
      `<button class="leeren" data-suche-leeren="${feld.dataset.bereich}" aria-label="Suche leeren">×</button>`);
  } else if (!feld.value && vorhanden) {
    vorhanden.remove();
  }
});

/* ------------------------------------------------------------------ Diagramm antippen */

document.addEventListener("click", (ev) => {
  const balken = ev.target.closest("rect.balken");
  const hinweis = document.getElementById("diagramm-hinweis");
  if (!hinweis) return;

  if (!balken) {
    document.querySelectorAll("rect.balken[data-aus]").forEach((r) => r.removeAttribute("data-aus"));
    hinweis.textContent = "Tippe auf einen Balken für den einzelnen Tag.";
    return;
  }

  const tag = balken.dataset.tag;
  document.querySelectorAll("rect.balken").forEach((r) => {
    r.toggleAttribute("data-aus", r.dataset.tag !== tag);
  });

  const eintrag = statistik.tage.find((t) => t.tag === tag);
  const datum = new Date(tag + "T12:00:00Z");
  hinweis.innerHTML = `<b>${WOCHENTAGE[datum.getUTCDay()]}, ${tag.slice(8)}.${tag.slice(5, 7)}.</b> — `
    + `${esc(vorname(S.ich.name))} ${eintrag.ich}, ${esc(mehrere() ? "die anderen" : andereName())} ${eintrag.partner} Cleanies`;
});

/* ------------------------------------------------------------------ Benachrichtigungen */

function pushMoeglich() {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function pushOffen() {
  return pushMoeglich() && Notification.permission === "default";
}

async function pushEinschalten() {
  if (!pushMoeglich()) throw new Error("Dieses Gerät kann keine Benachrichtigungen");

  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") throw new Error("Ohne Erlaubnis geht es nicht — im Browser unter „Berechtigungen“ nachholbar");

  const { schluessel } = await api("push/key");
  const roh = atob(schluessel.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(roh, (c) => c.charCodeAt(0));

  const reg = await navigator.serviceWorker.ready;
  const vorhanden = await reg.pushManager.getSubscription();
  const abo = vorhanden || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });

  const j = abo.toJSON();
  await api("push/subscribe", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
}

/* ------------------------------------------------------------------ Zurück-Taste */
//
// Zurück soll in der App bleiben: erst Overlays schließen, dann aufs Dashboard,
// und erst wenn man dort noch einmal drückt, wird nach dem Schließen gefragt.
// Dafür liegt immer genau ein zusätzlicher Eintrag im Verlauf, den das
// Zurückdrücken aufbraucht und den wir danach neu setzen.

function waechterSetzen() {
  history.pushState({ hq: true }, "");
}

function frageSchliessen() {
  sheet(`
    <div class="grabber"></div>
    <h3>App schließen?</h3>
    <p style="margin:0;font-size:14.5px;color:var(--ink-2)">
      Du bist auf der Startseite. Zurück führt von hier aus aus der App heraus.</p>
    <button class="btn ghost block" data-bleiben>In der App bleiben</button>
    <button class="btn primary block" data-schliessen-app>App schließen</button>`);
}

window.addEventListener("popstate", () => {
  if (celebrate.hasAttribute("data-open")) {
    celebrate.removeAttribute("data-open");
    waechterSetzen();
    return;
  }
  if (scrim.hasAttribute("data-open")) {
    sheetZu();
    waechterSetzen();
    return;
  }
  if (ansicht !== "start") {
    ansicht = "start";
    zeichne();
    waechterSetzen();
    return;
  }
  frageSchliessen();
  waechterSetzen();
});

/* ------------------------------------------------------------------ Start */

waechterSetzen();
laden();

// Der Partner arbeitet auf einem anderen Gerät — regelmäßig nachsehen.
setInterval(() => { if (!document.hidden && !scrim.hasAttribute("data-open")) laden(true); }, 25000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) laden(true); });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => {
    // Erlaubnis schon erteilt? Dann das Gerät still nachtragen — etwa nach Neuinstallation.
    if (pushMoeglich() && Notification.permission === "granted") pushEinschalten().catch(() => {});
  });
}
