// Haus-Quest – Oberfläche.
//
// Diese Datei zeigt nur an und schickt Absichten an die Schnittstelle.
// Ob aus „erledigt“ Punkte werden, entscheidet der Server — nie das Handy.

const app = document.getElementById("app");
const scrim = document.getElementById("scrim");
const celebrate = document.getElementById("celebrate");
const toastEl = document.getElementById("toast");
const confettiEl = document.getElementById("confetti");

let S = null;                  // Zustand vom Server
let ansicht = "start";
let filter = "Alle";
let laderTimer = null;

/* ------------------------------------------------------------------ Werkzeug */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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

function bild(person, groesse = "") {
  const quelle = person?.avatar;
  const ersatz = person && S?.partner && person.id === S.partner.id ? "/wolf.webp" : "/fox.webp";
  return `<span class="avatar ${groesse}"><img src="${esc(quelle || ersatz)}" alt=""
    onerror="this.src='${ersatz}'"></span>`;
}

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
  if (!S.verbunden) return verbinden();

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
    statistik: schirmStatistik
  }[ansicht] || schirmStart;

  app.innerHTML = inhalt() + `
    <nav class="navbar">
      ${nav.map((n) => `
        <button data-go="${n.id}" aria-current="${ansicht === n.id}">
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
      <p>Punkte für erledigte Aufgaben.<br>Freigegeben nur zu zweit.</p>
      <a class="btn ghost" href="/api/auth/start" style="gap:10px">${icon("i-google", 20)}Mit Google anmelden</a>
      <p style="font-size:12px;color:var(--ink-3);margin-top:18px;max-width:30ch">
        Gespeichert werden Name, E-Mail und Profilbild aus deinem Google-Konto — sonst nichts.
      </p>
    </div>`;
}

function verbinden() {
  const code = S.code;
  app.innerHTML = `
    <div class="appbar"><div><div class="title">Paar verbinden</div>
      <div class="sub">Angemeldet als ${esc(S.ich.name)}</div></div>
      <button class="iconbtn" data-abmelden aria-label="Abmelden">${icon("i-out", 18)}</button></div>
    <div class="body">
      <div class="card flat leer">
        <img src="/logo.webp" alt="">
        <div class="t">Ohne zweite Person geht hier nichts: Bestätigen und Abstimmen brauchen zwei.</div>
      </div>

      ${code ? `
      <div class="card" style="align-items:center;gap:8px">
        <span class="section-label" style="margin:0">Dein Code</span>
        <span class="codeanzeige">${esc(code)}</span>
        <div class="btnrow" style="width:100%">
          <button class="btn ghost" data-teilen>Code teilen</button>
          <button class="btn ghost" data-neuladen>Aktualisieren</button>
        </div>
        <div style="font-size:12px;color:var(--ink-3);text-align:center">
          Gib ihn deinem Partner. Sobald er ihn eingibt, geht es los.
        </div>
      </div>` : `
      <button class="btn primary block" data-paar-anlegen>Code erzeugen</button>`}

      <p class="section-label">Oder Code eingeben</p>
      <div class="card">
        <div class="field">
          <label>Code deines Partners</label>
          <input class="codefeld" id="code-eingabe" inputmode="numeric" maxlength="6" placeholder="000000">
        </div>
        <button class="btn dark block" data-paar-beitreten>Verbinden</button>
      </div>

      <div class="note">${icon("i-lock", 16)}<span>Ein Konto kann in genau einem Paar sein.
        Alle Daten gehören dem Paar — niemand sonst sieht sie.</span></div>
    </div>`;
}

/* ------------------------------------------------------------------ Hilfen zum Zustand */

const zuPruefen = () => [
  ...S.meldungen.filter((m) => m.claimed_by !== S.ich.id).map((m) => ({ ...m, art: "meldung" })),
  ...S.antraege.filter((a) => a.requested_by !== S.ich.id).map((a) => ({ ...a, art: "antrag" })),
  ...S.uebertragungen.filter((u) => u.to_member === S.ich.id).map((u) => ({ ...u, art: "uebertragung" }))
];

const meineOffenen = () => S.meldungen.filter((m) => m.claimed_by === S.ich.id);
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
            ? `+${a.prozent} % Punkte${a.kategorie ? ` auf ${esc(a.kategorie)}` : " auf alles"}`
            : `${a.prozent} % Rabatt auf Belohnungen`}</span>
        <span class="chip wait">${restzeit(a.ende)}</span>
      </div>
    </div>`).join("");
}

/* ------------------------------------------------------------------ Start */

function schirmStart() {
  const offen = zuPruefen();
  const wartet = meineOffenen();
  const abst = offeneAbstimmungen();

  return `
    <div class="appbar">
      <div>
        <div class="title">Hallo ${esc(S.ich.name.split(" ")[0])}</div>
        <div class="sub">${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</div>
      </div>
      <button class="iconbtn" data-go="verlauf" aria-label="Verlauf">${icon("i-clock", 18)}</button>
    </div>
    <div class="body">
      <div class="accounts">
        <div class="account me">
          ${bild(S.ich)}<span class="who">${esc(S.ich.name.split(" ")[0])}</span>
          <span class="pts">${S.ich.punkte}</span><span class="unit">Punkte</span>
        </div>
        <div class="account">
          ${bild(S.partner)}<span class="who">${esc(S.partner.name.split(" ")[0])}</span>
          <span class="pts">${S.partner.punkte}</span><span class="unit">Punkte</span>
        </div>
      </div>

      ${aktionsBanner()}

      ${offen.length ? `
      <div class="card alert">
        <div style="display:flex;gap:11px;align-items:center">
          <span style="color:var(--accent);flex:none">${icon("i-shield", 22)}</span>
          <div style="flex:1">
            <div style="font-size:14.5px;font-weight:700">${offen.length} ${offen.length === 1 ? "Sache wartet" : "Sachen warten"} auf dich</div>
            <div style="font-size:12.5px;color:var(--ink-2)">Ohne dein OK gibt es keine Punkte.</div>
          </div>
        </div>
        <button class="btn primary block" data-go="pruefen">Jetzt prüfen</button>
      </div>` : ""}

      ${pushOffen() ? `
      <button class="rowlink" data-push style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-bell", 18)}</span>
        <span class="grow"><span class="t">Benachrichtigungen einschalten</span>
          <span class="m">Damit du merkst, wenn ${esc(S.partner.name.split(" ")[0])} etwas meldet</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>` : ""}

      <div class="quick">
        <button data-go="quests">${icon("i-broom", 21)}Quest erledigt</button>
        <button data-go="belohnungen">${icon("i-gift", 21)}Belohnung</button>
        <button data-sheet="transfer">${icon("i-swap", 21)}Punkte senden</button>
      </div>

      ${wartet.length ? `
      <p class="section-label">Wartet auf ${esc(S.partner.name.split(" ")[0])}</p>
      <div class="card" style="gap:8px">
        ${wartet.map((m) => `
          <div style="display:flex;align-items:center;gap:10px">
            <span style="flex:1;font-size:13.5px">${esc(m.quest)}${m.quantity > 1 ? ` · ${m.quantity}×` : ""}</span>
            <span class="chip wait">+${m.quantity * m.points_each}</span>
          </div>`).join("")}
      </div>` : ""}

      ${abst.length ? `
      ${aktionsBanner()}

      <p class="section-label">Aktionen</p>
      <button class="rowlink" data-sheet="aktion" style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-heart", 18)}</span>
        <span class="grow"><span class="t">Aktion starten</span>
          <span class="m">Doppelte Punkte oder Rabatt — befristet, nur gemeinsam</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Offene Abstimmungen</p>
      ${abst.slice(0, 2).map(abstimmungKarte).join("")}` : ""}

      <button class="rowlink" data-go="statistik">
        <span class="avatar sm" style="background:var(--tint);color:var(--reihe-ich)">${icon("i-chart", 18)}</span>
        <span class="grow"><span class="t">Auswertung</span>
          <span class="m">Punkte je Tag, Wochen- und Monatsprognose</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Letzte Aktivität</p>
      ${S.verlauf.length ? `
      <ul class="card feed">
        ${S.verlauf.slice(0, 6).map((b) => `
          <li><span class="dot ${b.delta < 0 ? "red" : ""}"></span>
            <span class="txt"><b>${esc(b.member_id === S.ich.id ? "Du" : S.partner.name.split(" ")[0])}</b> ·
              ${esc(b.reason)} <b>${b.delta > 0 ? "+" : ""}${b.delta}</b>
              <div class="when">${zeitpunkt(b.created_at)}</div></span></li>`).join("")}
      </ul>` : `
      <div class="card flat leer"><img src="/logo.webp" alt="">
        <div class="h">Noch nichts passiert</div>
        <div class="t">Meldet eure erste Quest — dann füllt sich das hier.</div></div>`}
    </div>`;
}

/* ------------------------------------------------------------------ Quests */

function schirmQuests() {
  const gemeldet = new Set(meineOffenen().map((m) => m.quest_id));
  const kategorien = ["Alle", ...new Set(S.quests.map((q) => q.category))];
  const liste = S.quests
    .filter((q) => filter === "Alle" || q.category === filter)
    .sort((a, b) => (b.punkte_jetzt ?? b.points) - (a.punkte_jetzt ?? a.points) || a.name.localeCompare(b.name, "de"));

  return `
    <div class="appbar">
      <div><div class="title">Quests</div><div class="sub">Punktwerte gelten für beide</div></div>
      <button class="iconbtn" data-sheet="neu" aria-label="Quest vorschlagen">${icon("i-plus", 18)}</button>
    </div>
    <div class="body">
      ${aktionsBanner("quest_bonus")}
      <div class="filters">
        ${kategorien.map((k) => `<button data-filter="${esc(k)}" aria-pressed="${filter === k}">${esc(k)}</button>`).join("")}
      </div>
      ${liste.map((q) => `
        <button class="rowlink" data-sheet="melden" data-id="${q.id}" ${gemeldet.has(q.id) ? "disabled" : ""}>
          <span class="grow">
            <span class="t">${esc(q.name)}</span>
            <span class="m">${esc(q.category)}${gemeldet.has(q.id) ? ` · wartet auf ${esc(S.partner.name.split(" ")[0])}` : ""}</span>
          </span>
          ${gemeldet.has(q.id) ? '<span class="chip wait">Gemeldet</span>'
            : q.bonus ? `<span class="pts-pill"><s style="opacity:.55">${q.points}</s> ${q.punkte_jetzt}</span>`
            : `<span class="pts-pill">${q.points}</span>`}
        </button>`).join("")}
      <p style="font-size:12px;color:var(--ink-3);text-align:center;margin:6px 0 0">
        Punktwert ändern oder löschen? Lange auf eine Quest tippen.
      </p>
    </div>`;
}

/* ------------------------------------------------------------------ Prüfen */

function schirmPruefen() {
  const offen = zuPruefen();
  const kurz = S.partner.name.split(" ")[0];

  return `
    <div class="appbar"><div><div class="title">Prüfen</div>
      <div class="sub">Du gibst die Punkte frei</div></div></div>
    <div class="body">
      ${offen.length ? offen.map((e) => {
        if (e.art === "meldung") return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              ${bild(S.partner, "sm")}
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">${esc(kurz)} meldet · ${zeitpunkt(e.created_at)}</span>
                <span style="font-size:15px;font-weight:700;display:block">${esc(e.quest)}</span>
              </span>
              <span class="pts-pill">+${e.quantity * e.points_each}</span>
            </div>
            ${e.quantity > 1 || e.note ? `<div style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--ink-2);flex-wrap:wrap">
              ${e.quantity > 1 ? `<span class="chip open">${e.quantity}× à ${e.points_each}</span>` : ""}
              ${e.note ? `<span>„${esc(e.note)}“</span>` : ""}</div>` : ""}
            <div class="btnrow">
              <button class="btn primary" data-entscheiden="claims" data-id="${e.id}" data-status="bestaetigt">Bestätigen</button>
              <button class="btn ghost" data-entscheiden="claims" data-id="${e.id}" data-status="abgelehnt">Ablehnen</button>
            </div>
          </div>`;
        if (e.art === "antrag") return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              ${bild(S.partner, "sm")}
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">${esc(kurz)} beantragt · ${zeitpunkt(e.created_at)}</span>
                <span style="font-size:15px;font-weight:700;display:block">${esc(e.belohnung)}</span>
              </span>
              <span class="pts-pill">−${e.cost}</span>
            </div>
            ${e.wish_date || e.message ? `<div style="font-size:12.5px;color:var(--ink-2)">
              ${e.wish_date ? `<b>${esc(e.wish_date)}</b>` : ""}${e.wish_date && e.message ? " · " : ""}${e.message ? `„${esc(e.message)}“` : ""}</div>` : ""}
            <div class="btnrow">
              <button class="btn primary" data-entscheiden="requests" data-id="${e.id}" data-status="bestaetigt">Genehmigen</button>
              <button class="btn ghost" data-entscheiden="requests" data-id="${e.id}" data-status="abgelehnt">Ablehnen</button>
            </div>
          </div>`;
        return `
          <div class="card">
            <div style="display:flex;gap:11px;align-items:center">
              ${bild(S.partner, "sm")}
              <span style="flex:1">
                <span style="font-size:12px;color:var(--ink-3);display:block">${esc(kurz)} überträgt · ${zeitpunkt(e.created_at)}</span>
                <span style="font-size:15px;font-weight:700;display:block">Punkte für dich</span>
              </span>
              <span class="pts-pill">+${e.amount}</span>
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
          <div class="t">Keine offenen Meldungen. ${esc(kurz)} weiß Bescheid.</div>
        </div>`}
    </div>`;
}

/* ------------------------------------------------------------------ Belohnungen */

function schirmBelohnungen() {
  return `
    <div class="appbar">
      <div><div class="title">Belohnungen</div>
        <div class="sub">Dein Konto: <b>${S.ich.punkte}</b> Punkte</div></div>
      <button class="iconbtn" data-sheet="neue-belohnung" aria-label="Belohnung vorschlagen">${icon("i-plus", 18)}</button>
    </div>
    <div class="body">
      <button class="reward wide" data-sheet="transfer" style="background:var(--tint);border-color:transparent">
        <span class="ico" style="background:var(--bg)">${icon("i-swap", 18)}</span>
        <span class="n">Punkte an ${esc(S.partner.name.split(" ")[0])} übertragen<br>
          <span style="font-weight:400;color:var(--ink-2);font-size:12px">Damit sie oder er sich etwas leisten kann</span></span>
      </button>
      ${aktionsBanner("belohnung_rabatt")}
      <p class="section-label">Einlösbar</p>
      <div class="rewards">
        ${S.belohnungen.map((b) => {
          const zuTeuer = b.kosten_jetzt > S.ich.punkte;
          return `
          <button class="reward" data-sheet="antrag" data-id="${b.id}" ${zuTeuer ? "data-locked" : ""}>
            <span class="ico">${icon(b.cost >= 15 ? "i-shield" : "i-heart", 17)}</span>
            <span class="n">${esc(b.name)}</span>
            <span class="c">${zuTeuer
              ? `${S.ich.punkte} von ${b.kosten_jetzt} Punkten`
              : b.rabatt ? `<s style="opacity:.55">${b.cost}</s> ${b.kosten_jetzt} Punkte`
              : `${b.cost} Punkte`}</span>
          </button>`;
        }).join("")}
      </div>
      <p style="font-size:12px;color:var(--ink-3);margin:2px 0 0">
        Jede Einlösung geht als Antrag an ${esc(S.partner.name.split(" ")[0])}.
        Erst mit Zustimmung werden die Punkte abgebucht.
      </p>
      <p style="font-size:12px;color:var(--ink-3);text-align:center;margin:2px 0 0">
        Kosten ändern oder löschen? Lange auf eine Belohnung tippen.
      </p>
    </div>`;
}

/* ------------------------------------------------------------------ Wir */

function abstimmungKarte(a) {
  const entschieden = a.status !== "offen";
  const angenommen = a.status === "bestaetigt";
  const kurz = (id) => id === S.ich.id ? "Du" : S.partner.name.split(" ")[0];
  const stimme = (w) => w === undefined || w === null ? "offen" : (w ? "zugestimmt" : "abgelehnt");

  return `
    <div class="card vote">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14.5px;font-weight:700;flex:1">${esc(a.titel || "Vorschlag")}</span>
        <span class="chip ${entschieden ? (angenommen ? "done" : "open") : "wait"}">
          ${entschieden ? (angenommen ? "Übernommen" : "Abgelehnt") : "Offen"}</span>
      </div>
      <div class="change">
        ${a.art === "neue_aktion"
          ? `<span class="new">${a.titel.startsWith("Rabatt") ? `${a.neu} % Rabatt` : `+${a.neu} % Punkte`}</span>
             <span style="color:var(--ink-2);font-weight:400">${a.raum ? `· ${esc(a.raum)}` : "· alles"}
             ${a.tage ? `· ${a.tage === 1 ? "heute" : a.tage + " Tage"}` : ""}</span>`
          : a.art === "delete_quest" || a.art === "delete_reward"
          ? `<span class="old">${a.alt} Punkte</span>→<span class="new">löschen</span>`
          : (a.alt !== null && a.alt !== undefined
              ? `<span class="old">${a.alt} Punkte</span>→<span class="new">${a.neu} Punkte</span>`
              : `<span>Punktwert</span><span class="new">${a.neu} Punkte</span>`)}
      </div>
      ${a.grund ? `<div class="why">${esc(kurz(a.von))}: „${esc(a.grund)}“</div>` : ""}
      <div class="stance">
        <span>Du: <i>${stimme(a.meine)}</i></span>
        <span>${esc(S.partner.name.split(" ")[0])}: <i>${stimme(a.ihre)}</i></span>
      </div>
      ${!entschieden && (a.meine === undefined || a.meine === null) ? `
      <div class="btnrow">
        <button class="btn dark" data-stimme="${a.id}" data-antwort="ja">Zustimmen</button>
        <button class="btn ghost" data-stimme="${a.id}" data-antwort="nein">Ablehnen</button>
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
        <div class="sub">${esc(S.ich.name.split(" ")[0])} &amp; ${esc(S.partner.name.split(" ")[0])}</div></div>
      <button class="iconbtn" data-go="verlauf" aria-label="Verlauf">${icon("i-clock", 18)}</button>
    </div>
    <div class="body">
      ${aktionsBanner()}

      <p class="section-label">Aktionen</p>
      <button class="rowlink" data-sheet="aktion" style="border-color:var(--accent)">
        <span class="avatar sm" style="background:var(--accent-tint);color:var(--accent)">${icon("i-heart", 18)}</span>
        <span class="grow"><span class="t">Aktion starten</span>
          <span class="m">Doppelte Punkte oder Rabatt — befristet, nur gemeinsam</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>

      <p class="section-label">Offene Abstimmungen</p>
      ${offen.length ? offen.map(abstimmungKarte).join("") : `
        <div class="card flat" style="font-size:13px;color:var(--ink-2)">
          Nichts offen. Punktwerte ändert ihr über die Quest-Liste — lange auf eine Quest tippen.
        </div>`}

      <p class="section-label">Hausregeln</p>
      <ul class="card rules">
        <li><span class="n">01</span><span>Der Punktwert einer Quest steht <b>vor</b> dem Erledigen fest.</span></li>
        <li><span class="n">02</span><span>Erledigt melden kann jeder — <b>freigeben nur der andere</b>.</span></li>
        <li><span class="n">03</span><span>Werte ändern, Quests anlegen: <b>nur wenn beide zustimmen</b>.</span></li>
        <li><span class="n">04</span><span>Bis eine Abstimmung durch ist, gilt der <b>alte Wert</b>.</span></li>
        <li><span class="n">05</span><span>Anträge und Übertragungen brauchen ein <b>Ja</b> vom anderen.</span></li>
      </ul>

      ${erledigt.length ? `<p class="section-label">Entschieden</p>${erledigt.map(abstimmungKarte).join("")}` : ""}

      <p class="section-label">Konto</p>
      <button class="rowlink" data-go="verlauf">
        <span class="avatar sm" style="background:var(--tint)">${icon("i-clock", 17)}</span>
        <span class="grow"><span class="t">Verlauf &amp; Punktekonto</span>
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
            aria-label="Punkte je Tag der letzten zwei Wochen">
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
          <span class="hero-zahl">${zahlen.bisher}</span>
          <div class="hero-zusatz">bisher</div>
        </span>
        <span class="pfeil" aria-hidden="true" style="font-size:20px;font-weight:700">→</span>
        <span class="ziel">
          <span class="hero-zahl" style="color:var(--reihe-ich);font-size:34px">${zahlen.prognose}</span>
          <div class="hero-zusatz">Hochrechnung</div>
        </span>
      </div>
      <div style="font-size:12.5px;color:var(--ink-2)">
        ${offen > 0
          ? `Noch ${offen} ${einheit === "woche" ? (offen === 1 ? "Tag" : "Tage") : (offen === 1 ? "Tag" : "Tage")} —
             bei deinem Schnitt kämen ${mehr} Punkte dazu.`
          : "Der Zeitraum ist durch."}
        ${einheit === "monat" && zahlen.vormonat
          ? `<br>Vormonat: <b>${zahlen.vormonat}</b> Punkte.` : ""}
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
  const partnerName = S.partner.name.split(" ")[0];

  return `
    <div class="appbar">
      <button class="iconbtn links" data-go="start" aria-label="Zurück">‹</button>
      <div><div class="title">Auswertung</div><div class="sub">Punkte aus bestätigten Quests</div></div>
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
                || '<tr><td colspan="3" style="text-align:left;color:var(--ink-3)">Noch keine Punkte in diesem Zeitraum.</td></tr>'}
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
          <span class="pts-pill">noch ${statistik.naechsteBelohnung.fehlt}</span>
        </div>
        <div style="font-size:12.5px;color:var(--ink-2)">
          Bei ${meins.schnitt} Punkten am Tag in
          ${meins.schnitt > 0 ? Math.ceil(statistik.naechsteBelohnung.fehlt / meins.schnitt) : "…"}
          ${meins.schnitt > 0 && Math.ceil(statistik.naechsteBelohnung.fehlt / meins.schnitt) === 1 ? "Tag" : "Tagen"} drin.
        </div>
      </div>` : ""}
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
        <span style="font-family:var(--font-data);font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6">Dein Punktestand</span>
        <span style="font-family:var(--font-display);font-weight:800;font-size:44px;letter-spacing:-.04em;line-height:1">${S.ich.punkte}</span>
        <span style="font-size:12.5px;opacity:.75">${gesammelt} gesammelt · ${eingeloest} eingelöst (letzte 40 Buchungen)</span>
      </div>
      ${S.verlauf.length ? `
      <ul class="card ledger">
        ${S.verlauf.map((b) => `
          <li>
            ${bild(b.member_id === S.ich.id ? S.ich : S.partner, "sm")}
            <span style="flex:1">
              <span style="font-size:13.5px;font-weight:600;display:block">${esc(b.reason)}</span>
              <span style="font-size:11px;color:var(--ink-3);font-family:var(--font-data)">
                ${esc(b.member_id === S.ich.id ? "Du" : S.partner.name.split(" ")[0])} · ${zeitpunkt(b.created_at)}</span>
            </span>
            <span class="amt ${b.delta > 0 ? "plus" : "minus"}">${b.delta > 0 ? "+" : ""}${b.delta}</span>
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
      <span class="pts-pill">${quest.bonus ? `<s style="opacity:.55">${quest.points}</s> ` : ""}${punkte} Punkte</span>
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
          = <b style="color:var(--accent)" id="summe">${punkte}</b> Punkte</span>
      </div>
    </div>
    <div class="field"><label>Notiz für ${esc(S.partner.name.split(" ")[0])}</label>
      <textarea id="notiz" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>Die Punkte werden erst gutgeschrieben, wenn
      ${esc(S.partner.name.split(" ")[0])} bestätigt. Es zählt der Wert von jetzt — auch wenn er später geändert wird.</span></div>
    <button class="btn primary block" data-senden="melden" data-id="${quest.id}" data-punkte="${punkte}">
      Zur Bestätigung senden</button>`);
}

function sheetAntrag(belohnung) {
  const kosten = belohnung.kosten_jetzt ?? belohnung.cost;
  const fehlt = kosten > S.ich.punkte;
  sheet(`
    <div class="grabber"></div>
    <h3>Antrag stellen</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(belohnung.name)}</span>
      <span class="pts-pill">${belohnung.rabatt ? `<s style="opacity:.55">−${belohnung.cost}</s> ` : ""}−${kosten}</span>
    </div>
    ${belohnung.rabatt ? `<div class="note">${icon("i-heart", 16)}<span>Rabatt von ${belohnung.rabatt} % läuft —
      der Preis friert beim Absenden ein, auch wenn erst später entschieden wird.</span></div>` : ""}
    <div class="field"><label>Wunschtermin</label><input id="termin" placeholder="z. B. heute Abend"></div>
    <div class="field"><label>Nachricht</label><textarea id="nachricht" placeholder="optional"></textarea></div>
    <div style="display:flex;justify-content:space-between;font-family:var(--font-data);font-size:13px;color:var(--ink-2)">
      <span>Konto nach Einlösung</span>
      <span><b>${S.ich.punkte}</b> → <b style="color:var(--accent)">${S.ich.punkte - kosten}</b></span>
    </div>
    <div class="note">${icon("i-info", 16)}<span>${fehlt
      ? "Dir fehlen noch Punkte — der Antrag lässt sich erst genehmigen, wenn du sie hast."
      : `${esc(S.partner.name.split(" ")[0])} muss zustimmen. Erst dann werden die Punkte abgebucht.`}</span></div>
    <button class="btn primary block" data-senden="antrag" data-id="${belohnung.id}">Antrag senden</button>`);
}

function sheetTransfer() {
  sheet(`
    <div class="grabber"></div>
    <h3>Punkte übertragen</h3>
    <div style="display:flex;align-items:center;gap:14px;justify-content:center;padding:6px 0">
      <span style="text-align:center">${bild(S.ich)}<div style="font-size:12px;margin-top:5px">${esc(S.ich.name.split(" ")[0])}</div></span>
      <span style="color:var(--accent)">${icon("i-send", 22)}</span>
      <span style="text-align:center">${bild(S.partner)}<div style="font-size:12px;margin-top:5px">${esc(S.partner.name.split(" ")[0])}</div></span>
    </div>
    <div class="field">
      <label>Betrag</label>
      <div class="stepper">
        <button data-betrag="-1" aria-label="weniger">−</button>
        <span class="val" id="betrag">${Math.min(5, S.ich.punkte) || 1}</span>
        <button data-betrag="1" aria-label="mehr">+</button>
        <span style="margin-left:auto;font-family:var(--font-data);font-size:13px;color:var(--ink-2)">
          von ${S.ich.punkte} verfügbar</span>
      </div>
    </div>
    <div class="field"><label>Nachricht</label><textarea id="nachricht" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>${esc(S.partner.name.split(" ")[0])} muss die Übertragung annehmen.</span></div>
    <button class="btn primary block" data-senden="transfer">Übertragen</button>`);
}

function sheetNeu() {
  sheet(`
    <div class="grabber"></div>
    <h3>Quest vorschlagen</h3>
    <div class="field"><label>Name</label><input id="qname" placeholder="z. B. Wäsche waschen"></div>
    <div class="field"><label>Kategorie</label>
      <select id="qkat">${["Wohnen", "Küche", "Bad", "Fenster", "Sonstiges"].map((k) => `<option>${k}</option>`).join("")}</select></div>
    <div class="field">
      <label>Punktwert</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">3</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="Warum lohnt sich das?"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Neue Quests gehen in die Abstimmung. Übernommen wird der
      Vorschlag erst, wenn ${esc(S.partner.name.split(" ")[0])} zustimmt.</span></div>
    <button class="btn primary block" data-senden="neu">Zur Abstimmung geben</button>`);
}

function sheetMenue(art, eintrag) {
  const istQuest = art === "quest";
  sheet(`
    <div class="grabber"></div>
    <h3>${esc(eintrag.name)}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:13px;color:var(--ink-2)">${istQuest ? "Quest" : "Belohnung"}</span>
      <span class="pts-pill">${istQuest ? eintrag.points : eintrag.cost} Punkte</span>
    </div>
    <button class="btn ghost block" data-sheet="${istQuest ? "punktwert" : "kosten"}" data-id="${eintrag.id}">
      ${istQuest ? "Punktwert ändern" : "Kosten ändern"}</button>
    <button class="btn ghost block" data-sheet="loeschen" data-art="${art}" data-id="${eintrag.id}"
      style="color:var(--accent);border-color:var(--accent)">
      ${istQuest ? "Quest löschen" : "Belohnung löschen"}</button>
    <div class="note">${icon("i-vote", 16)}<span>Beides geht nur gemeinsam:
      ${esc(S.partner.name.split(" ")[0])} muss zustimmen.</span></div>`);
}

function sheetLoeschen(art, eintrag) {
  const istQuest = art === "quest";
  sheet(`
    <div class="grabber"></div>
    <h3>${istQuest ? "Quest löschen" : "Belohnung löschen"}</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(eintrag.name)}</span>
      <span class="pts-pill">${istQuest ? eintrag.points : eintrag.cost}</span>
    </div>
    <div class="field"><label>Begründung</label>
      <textarea id="grund" placeholder="Warum braucht ihr das nicht mehr?"></textarea></div>
    <div class="note">${icon("i-info", 16)}<span>Der Eintrag verschwindet nur aus der Liste.
      Bereits gebuchte Punkte und der Verlauf bleiben unangetastet.</span></div>
    <button class="btn primary block" data-senden="loeschen" data-art="${art}" data-id="${eintrag.id}">
      Zur Abstimmung geben</button>`);
}

function sheetAktion() {
  const kategorien = [...new Set(S.quests.map((q) => q.category))];
  sheet(`
    <div class="grabber"></div>
    <h3>Aktion starten</h3>
    <div class="btnrow" id="aktionsart">
      <button class="btn dark" data-art-wahl="quest_bonus">Doppelte Punkte</button>
      <button class="btn ghost" data-art-wahl="belohnung_rabatt">Rabatt</button>
    </div>

    <div class="field">
      <label id="prozent-label">Wie viel mehr Punkte</label>
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
      ${esc(S.partner.name.split(" ")[0])} muss zustimmen — danach läuft sie sofort.</span></div>
    <button class="btn primary block" data-senden="aktion">Zur Abstimmung geben</button>`);
}

function sheetNeueBelohnung() {
  sheet(`
    <div class="grabber"></div>
    <h3>Belohnung vorschlagen</h3>
    <div class="field"><label>Name</label><input id="bname" placeholder="z. B. Frühstück ans Bett"></div>
    <div class="field">
      <label>Kosten in Punkten</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">5</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="optional"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Neue Belohnungen gehen in die Abstimmung.
      Übernommen wird der Vorschlag erst, wenn ${esc(S.partner.name.split(" ")[0])} zustimmt.</span></div>
    <button class="btn primary block" data-senden="neue-belohnung">Zur Abstimmung geben</button>`);
}

function sheetKosten(belohnung) {
  sheet(`
    <div class="grabber"></div>
    <h3>Kosten ändern</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(belohnung.name)}</span>
      <span class="pts-pill">jetzt ${belohnung.cost}</span>
    </div>
    <div class="field">
      <label>Neue Kosten</label>
      <div class="stepper">
        <button data-menge="-1" aria-label="weniger">−</button>
        <span class="val" id="menge">${belohnung.cost}</span>
        <button data-menge="1" aria-label="mehr">+</button>
      </div>
    </div>
    <div class="field"><label>Begründung</label><textarea id="grund" placeholder="Warum passt der alte Wert nicht mehr?"></textarea></div>
    <div class="note">${icon("i-vote", 16)}<span>Gilt erst, wenn beide zustimmen — und nie rückwirkend.</span></div>
    <button class="btn primary block" data-senden="kosten" data-id="${belohnung.id}">Zur Abstimmung geben</button>`);
}

function sheetPunktwert(quest) {
  sheet(`
    <div class="grabber"></div>
    <h3>Punktwert ändern</h3>
    <div class="card flat" style="flex-direction:row;align-items:center;gap:10px">
      <span style="flex:1;font-size:14px;font-weight:600">${esc(quest.name)}</span>
      <span class="pts-pill">jetzt ${quest.points}</span>
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
      Bereits gemeldete Quests behalten ${quest.points} Punkte.</span></div>
    <button class="btn primary block" data-senden="punktwert" data-id="${quest.id}">Zur Abstimmung geben</button>`);
}

/* ------------------------------------------------------------------ Bedienung */

let druckTimer = null;
let langGedrueckt = false;

document.addEventListener("pointerdown", (ev) => {
  const quest = ev.target.closest("[data-sheet='melden'][data-id]");
  const belohnung = ev.target.closest("[data-sheet='antrag'][data-id]");
  const ziel = quest || belohnung;
  if (!ziel || scrim.hasAttribute("data-open")) return;
  druckTimer = setTimeout(() => {
    druckTimer = null;
    langGedrueckt = true;
    if (navigator.vibrate) navigator.vibrate(12);
    if (quest) {
      const q = S.quests.find((x) => x.id === quest.dataset.id);
      if (q) sheetMenue("quest", q);
    } else {
      const b = S.belohnungen.find((x) => x.id === belohnung.dataset.id);
      if (b) sheetMenue("belohnung", b);
    }
  }, 500);
});
document.addEventListener("pointerup", () => { clearTimeout(druckTimer); });
document.addEventListener("pointercancel", () => { clearTimeout(druckTimer); });
document.addEventListener("pointermove", () => { clearTimeout(druckTimer); });

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-go],[data-filter],[data-sheet],[data-menge],[data-betrag],[data-senden],[data-entscheiden],[data-stimme],[data-paar-anlegen],[data-paar-beitreten],[data-teilen],[data-neuladen],[data-abmelden],[data-export],[data-bleiben],[data-schliessen-app],[data-push],[data-art-wahl],[data-dauer-wahl]");
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

  if (el.dataset.sheet) {
    const art = el.dataset.sheet;
    // Nach langem Drücken ist das Menü schon offen — der Klick danach darf nichts auslösen.
    if (langGedrueckt && (art === "melden" || art === "antrag")) { langGedrueckt = false; return; }
    langGedrueckt = false;

    if (art === "punktwert" || art === "kosten" || art === "loeschen") {
      const liste = art === "kosten" || el.dataset.art === "belohnung" ? S.belohnungen : S.quests;
      const eintrag = liste.find((x) => x.id === el.dataset.id);
      if (!eintrag) return;
      sheetZu();
      if (art === "punktwert") sheetPunktwert(eintrag);
      else if (art === "kosten") sheetKosten(eintrag);
      else sheetLoeschen(el.dataset.art, eintrag);
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
      if (S.ich.punkte < 1) return toast("Du hast noch keine Punkte zum Übertragen", true);
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
    document.getElementById("prozent-label").textContent = rabatt ? "Wie viel Rabatt" : "Wie viel mehr Punkte";
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

    if (el.dataset.senden === "melden") {
      await api("claims", { questId: el.dataset.id, anzahl: zahl("menge"), notiz: wert("notiz") });
      sheetZu(); await laden();
      toast(`Gemeldet — ${S.partner.name.split(" ")[0]} muss bestätigen.`);
      return;
    }
    if (el.dataset.senden === "antrag") {
      await api("requests", { rewardId: el.dataset.id, termin: wert("termin"), nachricht: wert("nachricht") });
      sheetZu(); await laden();
      toast("Antrag gesendet.");
      return;
    }
    if (el.dataset.senden === "transfer") {
      await api("transfers", { betrag: zahl("betrag"), nachricht: wert("nachricht") });
      sheetZu(); await laden();
      toast("Übertragung angeboten.");
      return;
    }
    if (el.dataset.senden === "neu") {
      if (!wert("qname")) throw new Error("Ein Name fehlt");
      await api("proposals", { art: "new_quest", wert: zahl("menge"), name: wert("qname"), kategorie: wert("qkat"), grund: wert("grund") });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
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
      await api("proposals", { art: "new_reward", wert: zahl("menge"), name: wert("bname"), grund: wert("grund") });
      sheetZu(); ansicht = "wir"; await laden();
      toast("Vorschlag steht zur Abstimmung.");
      return;
    }
    if (el.dataset.senden === "kosten") {
      await api("proposals", { art: "reward_cost", zielId: el.dataset.id, wert: zahl("menge"), grund: wert("grund") });
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
        else toast("Punkte angenommen.");
      } else {
        toast("Abgelehnt.");
      }
      return;
    }

    if (el.dataset.stimme) {
      const ergebnis = await api(`proposals/${el.dataset.stimme}/vote`, { antwort: el.dataset.antwort === "ja" });
      await laden();
      if (ergebnis.status === "bestaetigt") toast(`Beide einverstanden — neuer Wert: ${ergebnis.wert} Punkte.`);
      else if (ergebnis.status === "abgelehnt") toast("Abgelehnt — der alte Wert gilt weiter.");
      else toast(`Deine Stimme zählt. Es fehlt noch ${S.partner.name.split(" ")[0]}.`);
      return;
    }

    if (el.hasAttribute("data-paar-anlegen")) { await api("pair/create", {}); await laden(); return; }

    if (el.hasAttribute("data-paar-beitreten")) {
      const code = document.getElementById("code-eingabe")?.value.replace(/\D/g, "");
      await api("pair/join", { code });
      await laden();
      toast("Verbunden. Los geht's!");
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
    + `${esc(S.ich.name.split(" ")[0])} ${eintrag.ich}, ${esc(S.partner.name.split(" ")[0])} ${eintrag.partner} Punkte`;
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
