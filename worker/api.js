// Die Schnittstelle. Alles, was Cleanies bewegt, läuft hier durch.
//
// Die App schickt nur Absichten („ich habe X erledigt“). Ob daraus eine Buchung
// wird, entscheiden diese Prüfungen und die Regeln in der Datenbank — nicht das Handy.

import { angemeldet } from "./auth.js";
import { QUESTS, BELOHNUNGEN, ANFANGSBESTAND, RAUMVORSCHLAEGE } from "./startdaten.js";
import { vapid } from "./push.js";
import { melde, meldeAlle } from "./melden.js";
import {
  RHYTHMEN, planListe, planNachziehen, aufgabeDetail, bewerben, bewerbungZurueck,
  vergabeEntscheiden, meldenErlaubt, nachErledigung, rhythmusSetzen, questMitRhythmus
} from "./plan.js";
import {
  rueckfrageStellen, rueckfrageBeantworten, offeneBelohnungen,
  belohnungEmpfang, belohnungNachholen, nachholEntscheiden,
  anfrageAendern, anfrageZuruecknehmen
} from "./rueckmeldung.js";
import { zeitraum, urlaubAnlegen, urlaubBeenden, urlaubeVon, urlaubsLage } from "./urlaub.js";

const json = (daten, status = 200) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

class Fehler extends Error {
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
}

const id = () => crypto.randomUUID();
const vorname = (n) => String(n || "").split(" ")[0];

export async function handleApi(request, env, url) {
  const pfad = url.pathname.replace(/^\/api\//, "");
  const ich = await angemeldet(request, env);

  if (pfad === "health") {
    // Zeigt nur, OB etwas hinterlegt ist — nie den Wert selbst.
    return json({
      ok: true,
      zeit: new Date().toISOString(),
      clientId: env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_ID.split("-")[0] + "-…" : null,
      clientSchluesselHinterlegt: Boolean(env.GOOGLE_CLIENT_SECRET)
    });
  }
  if (!ich) return json({ fehler: "Nicht angemeldet", angemeldet: false }, 401);

  const koerper = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const teile = pfad.split("/");

  try {
    if (pfad === "state") return json(await zustand(env, ich));
    if (pfad === "pair/create") return json(await paarAnlegen(env, ich));
    if (pfad === "pair/join") return json(await paarBeitreten(env, ich, koerper.code));
    if (pfad === "export") return json(await ausgabe(env, ich));
    if (pfad === "statistik") return json(await statistik(env, ich, url.searchParams.get("versatz")));
    if (pfad === "push/key") return json({ schluessel: (await vapid(env)).oeffentlich });
    if (pfad === "push/subscribe") return json(await geraetMerken(env, ich, koerper));
    if (pfad === "events/gelesen") return json(await ereignisseGelesen(env, ich, koerper.ids));
    if (pfad === "profil") return json(await profilAendern(env, ich, koerper));
    if (pfad === "haushalt/einrichten") return json(await haushaltEinrichten(env, ich, koerper));

    if (!ich.couple_id) throw new Fehler("Noch kein Haushalt eingerichtet", 409);

    if (pfad === "claims") return json(await melden(env, ich, koerper));
    if (teile[0] === "claims" && teile[2] === "decide") return json(await meldungEntscheiden(env, ich, teile[1], koerper.status));

    if (pfad === "requests") return json(await antragStellen(env, ich, koerper));
    if (teile[0] === "requests" && teile[2] === "decide") return json(await antragEntscheiden(env, ich, teile[1], koerper.status));

    if (pfad === "transfers") return json(await uebertragen(env, ich, koerper));
    if (teile[0] === "transfers" && teile[2] === "decide") return json(await uebertragungEntscheiden(env, ich, teile[1], koerper.status));

    if (pfad === "haushalt") return json(await haushaltAendern(env, ich, koerper));

    if (teile[0] === "plan" && teile[1] && !teile[2]) return json(await aufgabeDetail(env, ich, teile[1]));
    if (teile[0] === "plan" && teile[2] === "bewerben") return json(await bewerben(env, ich, teile[1]));
    if (teile[0] === "plan" && teile[2] === "zurueckziehen") return json(await bewerbungZurueck(env, ich, teile[1]));
    if (teile[0] === "plan" && teile[2] === "vergabe") return json(await vergabeEntscheiden(env, ich, teile[1], !!koerper.annehmen));

    if ((teile[0] === "claims" || teile[0] === "requests") && teile[2] === "rueckfrage") {
      return json(await rueckfrageStellen(env, ich, teile[0], teile[1], koerper));
    }
    if ((teile[0] === "claims" || teile[0] === "requests") && teile[2] === "antwort") {
      return json(await rueckfrageBeantworten(env, ich, teile[0], teile[1], koerper));
    }
    // Solange niemand entschieden hat, gehört die Anfrage noch dem Absender.
    if (["claims", "requests", "transfers"].includes(teile[0]) && teile[2] === "aendern") {
      return json(await anfrageAendern(env, ich, teile[0], teile[1], koerper));
    }
    if (["claims", "requests", "transfers"].includes(teile[0]) && teile[2] === "storno") {
      return json(await anfrageZuruecknehmen(env, ich, teile[0], teile[1]));
    }
    if (teile[0] === "requests" && teile[2] === "empfang") return json(await belohnungEmpfang(env, ich, teile[1], !!koerper.erhalten));
    if (teile[0] === "requests" && teile[2] === "nachholen") return json(await belohnungNachholen(env, ich, teile[1]));
    if (teile[0] === "requests" && teile[2] === "nachhol-pruefen") return json(await nachholEntscheiden(env, ich, teile[1], !!koerper.ja));
    if (teile[0] === "quests" && teile[2] === "raum") return json(await questRaum(env, ich, teile[1], koerper.raum));
    if (pfad === "raeume") return json(await raumAnlegen(env, ich, koerper));
    if (teile[0] === "raeume" && teile[1]) return json(await raumAendern(env, ich, teile[1], koerper));

    if (teile[0] === "urlaub" && teile[2] === "beenden") return json(await urlaubBeenden(env, ich, teile[1]));

    if (pfad === "proposals") return json(await vorschlagen(env, ich, koerper));
    if (teile[0] === "proposals" && teile[2] === "vote") return json(await abstimmen(env, ich, teile[1], koerper.antwort));

    return json({ fehler: "Unbekannter Endpunkt" }, 404);
  } catch (fehler) {
    const text = String(fehler.message || fehler);
    // Meldungen aus den Datenbankregeln durchreichen, technisches Beiwerk abschneiden.
    const sauber = text.includes("SQLITE_CONSTRAINT") || text.includes("D1_ERROR")
      ? (text.match(/(?:abort at \d+ in \[[^\]]*\]:\s*)?([^:]*(?:muss|kann|bereits|Zu wenig|besteht)[^:]*)/)?.[1] || "Das geht so nicht.").trim()
      : text;
    return json({ fehler: sauber }, fehler.status || 400);
  }
}

/* ------------------------------------------------------------------ Profil */

/** Der Anzeigename gehört einem allein — das ist keine Sache für eine Abstimmung.
 *  Gemerkt wird nur, dass er von Hand gesetzt wurde, damit die nächste Anmeldung
 *  ihn nicht wieder mit dem Google-Namen überschreibt. */
async function profilAendern(env, ich, { name, bild }) {
  if (name !== undefined) {
    const sauber = String(name).replace(/\s+/g, " ").trim().slice(0, 40);
    if (sauber.length < 2) throw new Fehler("Der Name braucht mindestens zwei Zeichen");
    await env.DB.prepare("update users set name = ?1, name_gesetzt = 1 where id = ?2")
      .bind(sauber, ich.id).run();
  }
  if (bild !== undefined) {
    await env.DB.prepare("update users set bild = ?1 where id = ?2").bind(bildPruefen(bild), ich.id).run();
  }
  const jetzt = await env.DB.prepare("select name, bild from users where id = ?1").bind(ich.id).first();
  return { ok: true, name: jetzt.name, bild: jetzt.bild };
}

/** Erlaubt sind eine der mitgelieferten Figuren, ein einzelnes Zeichen — oder ein
 *  eigenes Foto als Data-URL. Das Handy verkleinert es vorher; hier steht nur die
 *  Obergrenze, damit die Datenbank nicht als Bilderspeicher missbraucht wird. */
function bildPruefen(bild) {
  if (bild === null || bild === "") return null;
  const wert = String(bild);
  if (wert.startsWith("data:image/")) {
    if (wert.length > 120000) throw new Fehler("Das Bild ist zu groß — bitte ein kleineres wählen");
    return wert;
  }
  if (wert.length <= 8) return wert;               // Figur oder Zeichen
  throw new Fehler("Dieses Bild versteht die App nicht");
}

/* ------------------------------------------------------------------ Haushalt */

const HAUSHALTSARTEN = ["wg", "familie", "paar", "sonstige"];

/** Die Einrichtung beim allerersten Öffnen: Name, Bild, Art des Haushalts,
 *  geplante Größe und die Räume — alles in einem Zug. Danach steht der Haushalt
 *  und die anderen können über den Code dazukommen. */
async function haushaltEinrichten(env, ich, daten) {
  const { name, bild, art = "paar", erwachsene = 2, kinder = 0, personen = 2, raeume = [] } = daten;

  if (!HAUSHALTSARTEN.includes(art)) throw new Fehler("Unbekannte Art von Haushalt");
  if (ich.couple_id) {
    const schon = await env.DB.prepare("select eingerichtet from couples where id = ?1").bind(ich.couple_id).first();
    if (schon?.eingerichtet) throw new Fehler("Dieser Haushalt ist bereits eingerichtet");
  }

  const kinderZahl = art === "familie" ? grenze(kinder, 0, 12) : 0;
  const erwachsenenZahl = art === "familie" ? grenze(erwachsene, 1, 12) : 0;
  const groesse = art === "familie" ? erwachsenenZahl + kinderZahl : grenze(personen, 1, 12);

  const liste = [...new Set((Array.isArray(raeume) ? raeume : [])
    .map((r) => String(r).replace(/\s+/g, " ").trim().slice(0, 40))
    .filter(Boolean))].slice(0, 30);

  if (name !== undefined) await profilAendern(env, ich, { name });
  if (bild !== undefined) await profilAendern(env, ich, { bild });

  const paar = ich.couple_id || id();
  const code = await code6();
  const anweisungen = [];

  if (!ich.couple_id) {
    anweisungen.push(
      env.DB.prepare(
        `insert into couples (id, pair_code, pair_code_expires, art, groesse, erwachsene, kinder, eingerichtet)
         values (?1, ?2, datetime('now', '+1 day'), ?3, ?4, ?5, ?6, 1)`
      ).bind(paar, code, art, groesse, erwachsenenZahl, kinderZahl),
      env.DB.prepare("insert into members (user_id, couple_id, rolle) values (?1, ?2, 'verwalter')").bind(ich.id, paar),
      ...QUESTS.map((q) =>
        env.DB.prepare("insert into quests (id, couple_id, name, category, points) values (?1, ?2, ?3, ?4, ?5)")
          .bind(id(), paar, q.name, q.kategorie, q.punkte)),
      ...BELOHNUNGEN.map((b) =>
        env.DB.prepare("insert into rewards (id, couple_id, name, cost, bestaetigen) values (?1, ?2, ?3, ?4, ?5)")
          .bind(id(), paar, b.name, b.kosten, b.bestaetigen === false ? 0 : 1))
    );
  } else {
    anweisungen.push(
      env.DB.prepare(
        `update couples set art = ?1, groesse = ?2, erwachsene = ?3, kinder = ?4, eingerichtet = 1,
                            pair_code = ?5, pair_code_expires = datetime('now', '+1 day')
          where id = ?6`
      ).bind(art, groesse, erwachsenenZahl, kinderZahl, code, paar),
      env.DB.prepare("update members set rolle = 'verwalter' where user_id = ?1").bind(ich.id)
    );
  }

  liste.forEach((raum, i) => anweisungen.push(
    env.DB.prepare(`insert into raeume (id, couple_id, name, sortierung) values (?1, ?2, ?3, ?4)
                    on conflict(couple_id, name) do nothing`).bind(id(), paar, raum, i)
  ));

  await env.DB.batch(anweisungen);
  return { ok: true, code };
}

/** Art und Größe später ändern — das darf nur, wer verwaltet. */
async function haushaltAendern(env, ich, { art, erwachsene, kinder, personen, strafe }) {
  await nurVerwalter(env, ich);

  if (strafe !== undefined) {
    await env.DB.prepare("update couples set strafe_an = ?1 where id = ?2")
      .bind(strafe ? 1 : 0, ich.couple_id).run();
    if (art === undefined && personen === undefined && erwachsene === undefined && kinder === undefined) {
      return { ok: true };
    }
  }

  const jetzt = await env.DB.prepare("select * from couples where id = ?1").bind(ich.couple_id).first();
  const neueArt = art === undefined ? jetzt.art : art;
  if (!HAUSHALTSARTEN.includes(neueArt)) throw new Fehler("Unbekannte Art von Haushalt");

  const kinderZahl = neueArt === "familie" ? grenze(kinder ?? jetzt.kinder, 0, 12) : 0;
  const erwachsenenZahl = neueArt === "familie" ? grenze(erwachsene ?? jetzt.erwachsene, 1, 12) : 0;
  const groesse = neueArt === "familie"
    ? erwachsenenZahl + kinderZahl
    : grenze(personen ?? jetzt.groesse, 1, 12);

  const belegt = await env.DB.prepare("select count(*) as n from members where couple_id = ?1")
    .bind(ich.couple_id).first();
  if (groesse < belegt.n) throw new Fehler(`Ihr seid schon zu ${belegt.n} — kleiner geht nur, wenn jemand geht`);

  await env.DB.prepare(
    "update couples set art = ?1, groesse = ?2, erwachsene = ?3, kinder = ?4 where id = ?5"
  ).bind(neueArt, groesse, erwachsenenZahl, kinderZahl, ich.couple_id).run();
  return { ok: true };
}

async function nurVerwalter(env, ich) {
  const meins = await env.DB.prepare("select rolle from members where user_id = ?1").bind(ich.id).first();
  if (meins?.rolle !== "verwalter") throw new Fehler("Das kann nur, wer den Haushalt verwaltet", 403);
}

const grenze = (wert, min, max) => Math.max(min, Math.min(max, Math.floor(Number(wert) || 0)));

/* ------------------------------------------------------------------ Räume */

/** Räume sind Ordnung, keine Cleanies — deshalb darf sie jeder pflegen. Der Name
 *  steht zusätzlich als Text in den Quests; ein umbenannter Raum zieht sie mit. */
async function raumAnlegen(env, ich, { name }) {
  const sauber = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (sauber.length < 2) throw new Fehler("Der Name braucht mindestens zwei Zeichen");

  const letzte = await env.DB.prepare("select coalesce(max(sortierung), 0) as n from raeume where couple_id = ?1")
    .bind(ich.couple_id).first();
  await env.DB.prepare(
    `insert into raeume (id, couple_id, name, sortierung) values (?1, ?2, ?3, ?4)
     on conflict(couple_id, name) do update set aktiv = 1`
  ).bind(id(), ich.couple_id, sauber, letzte.n + 1).run();
  return { ok: true, name: sauber };
}

/** Eine Quest in einen anderen Raum schieben. Am Cleanies-Wert ändert das nichts,
 *  deshalb braucht es dafür auch keine Abstimmung — nur Ordnung. */
async function questRaum(env, ich, questId, raum) {
  const ziel = await env.DB.prepare("select name from raeume where couple_id = ?1 and name = ?2 and aktiv = 1")
    .bind(ich.couple_id, String(raum ?? "")).first();
  if (!ziel) throw new Fehler("Diesen Raum gibt es nicht");

  const geaendert = await env.DB.prepare(
    "update quests set category = ?1 where id = ?2 and couple_id = ?3 and active = 1"
  ).bind(ziel.name, questId, ich.couple_id).run();
  if (!geaendert.meta.changes) throw new Fehler("Diese Quest gibt es nicht");
  return { ok: true, raum: ziel.name };
}

async function raumAendern(env, ich, raumId, { name, aktiv }) {
  const raum = await env.DB.prepare("select * from raeume where id = ?1 and couple_id = ?2")
    .bind(raumId, ich.couple_id).first();
  if (!raum) throw new Fehler("Diesen Raum gibt es nicht", 404);

  if (name !== undefined) {
    const sauber = String(name).replace(/\s+/g, " ").trim().slice(0, 40);
    if (sauber.length < 2) throw new Fehler("Der Name braucht mindestens zwei Zeichen");
    // Der Raum steht in den Quests als Text — beides wandert gemeinsam.
    await env.DB.batch([
      env.DB.prepare("update raeume set name = ?1 where id = ?2").bind(sauber, raumId),
      env.DB.prepare("update quests set category = ?1 where couple_id = ?2 and category = ?3")
        .bind(sauber, ich.couple_id, raum.name),
      env.DB.prepare("update aktionen set kategorie = ?1 where couple_id = ?2 and kategorie = ?3")
        .bind(sauber, ich.couple_id, raum.name)
    ]);
  }
  if (aktiv !== undefined) {
    const offen = await env.DB.prepare(
      "select count(*) as n from quests where couple_id = ?1 and category = ?2 and active = 1"
    ).bind(ich.couple_id, raum.name).first();
    if (!aktiv && offen.n > 0) throw new Fehler(`In „${raum.name}“ liegen noch ${offen.n} Quests`);
    await env.DB.prepare("update raeume set aktiv = ?1 where id = ?2").bind(aktiv ? 1 : 0, raumId).run();
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ Paar */

async function code6() {
  const zahl = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(zahl).padStart(6, "0");
}

/** Der alte Weg „Code erzeugen“ ohne Einrichtung. Er legt denselben Haushalt an,
 *  nur mit den Voreinstellungen — damit niemand in einem halben Zustand landet. */
async function paarAnlegen(env, ich) {
  if (ich.couple_id) throw new Fehler("Du bist bereits mit jemandem verbunden");
  return haushaltEinrichten(env, ich, {
    art: "paar", personen: 2,
    raeume: [...new Set(QUESTS.map((q) => q.kategorie))]
  });
}

async function paarBeitreten(env, ich, code) {
  if (!code || !/^\d{6}$/.test(String(code).trim())) throw new Fehler("Der Code besteht aus sechs Ziffern");
  const sauber = String(code).trim();

  const paar = await env.DB.prepare(
    `select id, groesse from couples where pair_code = ?1 and pair_code_expires > datetime('now')`
  ).bind(sauber).first();
  if (!paar) throw new Fehler("Dieser Code ist unbekannt oder abgelaufen");

  const anzahl = await env.DB.prepare("select count(*) as n from members where couple_id = ?1").bind(paar.id).first();
  if (anzahl.n >= paar.groesse) throw new Fehler("Dieser Haushalt ist bereits vollständig");

  if (ich.couple_id === paar.id) throw new Fehler("Das ist dein eigener Code — gib ihn den anderen");

  // Wer selbst ein leeres Paar angelegt hat, darf es beim Beitreten aufgeben.
  if (ich.couple_id) {
    const alt = await env.DB.prepare(
      `select (select count(*) from members where couple_id = ?1) as personen,
              (select count(*) from ledger  where couple_id = ?1) as buchungen`
    ).bind(ich.couple_id).first();
    if (alt.personen > 1 || alt.buchungen > 0) throw new Fehler("Du bist bereits mit jemandem verbunden");
    await env.DB.batch([
      env.DB.prepare("delete from members where user_id = ?1").bind(ich.id),
      env.DB.prepare("delete from couples where id = ?1").bind(ich.couple_id)
    ]);
  }

  // Der Code bleibt gültig, solange noch Plätze frei sind — in einer WG kommen
  // die anderen nicht alle in derselben Minute.
  const voll = anzahl.n + 1 >= paar.groesse;
  await env.DB.batch([
    env.DB.prepare("insert into members (user_id, couple_id, rolle) values (?1, ?2, 'mitglied')").bind(ich.id, paar.id),
    ...(voll ? [env.DB.prepare("update couples set pair_code = null, pair_code_expires = null where id = ?1").bind(paar.id)] : [])
  ]);

  await anfangsbestand(env, paar.id);
  return { ok: true };
}

/** Einmalige Übernahme der Cleanies-Stände aus der Reinigungsquest-Tabelle.
 *  Läuft nur für den Haushalt, aus dem die Tabelle stammt, und nur solange das
 *  Konto völlig leer ist. Jeder neue Haushalt fängt bei null an. */
async function anfangsbestand(env, paarId) {
  const haus = await env.DB.prepare("select startguthaben from couples where id = ?1").bind(paarId).first();
  if (!haus?.startguthaben) return;

  const bisher = await env.DB.prepare("select count(*) as n from ledger where couple_id = ?1").bind(paarId).first();
  if (bisher.n > 0) return;

  const personen = await env.DB.prepare(
    "select u.id, u.email from members m join users u on u.id = m.user_id where m.couple_id = ?1"
  ).bind(paarId).all();

  const buchungen = personen.results
    .map((p) => ({ id: p.id, punkte: ANFANGSBESTAND[String(p.email).toLowerCase()] ?? ANFANGSBESTAND.standard ?? 0 }))
    .filter((b) => b.punkte > 0)
    .map((b) => env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type)
       values (?1, ?2, ?3, ?4, 'Anfangsbestand aus der Tabelle', 'start')`
    ).bind(id(), paarId, b.id, b.punkte));

  if (buchungen.length) await env.DB.batch(buchungen);
}

/* ------------------------------------------------------------------ Benachrichtigungen */

async function geraetMerken(env, ich, { endpoint, p256dh, auth }) {
  if (!endpoint || !p256dh || !auth) throw new Fehler("Angaben zum Gerät fehlen");
  await env.DB.prepare(
    `insert into push_subscriptions (id, user_id, endpoint, p256dh, auth) values (?1, ?2, ?3, ?4, ?5)
     on conflict(endpoint) do update set user_id = ?2, p256dh = ?4, auth = ?5`
  ).bind(id(), ich.id, endpoint, p256dh, auth).run();
  return { ok: true };
}

async function ereignisseGelesen(env, ich, ids) {
  const liste = Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, 50) : [];
  if (!liste.length) return { ok: true };
  const platzhalter = liste.map((_, i) => `?${i + 2}`).join(",");
  await env.DB.prepare(
    `update ereignisse set gelesen = 1 where user_id = ?1 and id in (${platzhalter})`
  ).bind(ich.id, ...liste).run();
  return { ok: true };
}

/** Alle außer mir — in einer WG sind das mehrere. */
async function andereVon(env, ich) {
  const treffer = await env.DB.prepare(
    "select user_id from members where couple_id = ?1 and user_id <> ?2"
  ).bind(ich.couple_id, ich.id).all();
  return treffer.results.map((r) => r.user_id);
}

const meldeAllen = (env, ich, ereignis) => meldeAlle(env, ich.couple_id, ich.id, ereignis);

/* ------------------------------------------------------------------ Aktionen */

const DAUERN = { heute: 1, wochenende: 2, woche: 7 };

async function laufendeAktionen(env, paarId) {
  const treffer = await env.DB.prepare(
    `select * from aktionen where couple_id = ?1 and beginn <= datetime('now') and ende > datetime('now')`
  ).bind(paarId).all();
  return treffer.results;
}

/** Cleanies einer Quest inklusive laufendem Bonus. */
function questWert(quest, aktionen) {
  const bonus = aktionen.find((a) => a.art === "quest_bonus" && (!a.kategorie || a.kategorie === quest.category));
  if (!bonus) return { wert: quest.points, aktion: null };
  return { wert: Math.round(quest.points * (100 + bonus.prozent) / 100), aktion: bonus };
}

/** Kosten einer Belohnung inklusive laufendem Rabatt. */
function belohnungWert(belohnung, aktionen) {
  const rabatt = aktionen.find((a) => a.art === "belohnung_rabatt");
  if (!rabatt) return { wert: belohnung.cost, aktion: null };
  return { wert: Math.max(1, Math.round(belohnung.cost * (100 - rabatt.prozent) / 100)), aktion: rabatt };
}

/* ------------------------------------------------------------------ Zustand */

/**
 * Zieht Abstimmungen nach, die schon entschieden sind, aber noch offen stehen.
 * Nötig für alles, was vor der Reparatur oben hängen geblieben ist — und als
 * Netz, falls eine Übernahme künftig einmal abbricht.
 */
async function abstimmungenNachziehen(env, paarId) {
  const haengend = await env.DB.prepare(
    `select p.* from proposals p
      where p.couple_id = ?1 and p.status = 'offen'
        and (select count(*) from proposal_votes v where v.proposal_id = p.id and v.answer = 1)
            >= (select count(*) from members where couple_id = p.couple_id)`
  ).bind(paarId).all();

  for (const vorschlag of haengend.results) {
    try {
      await auszaehlen(env, vorschlag);
    } catch {
      // Eine kaputte Abstimmung darf das Laden der App nicht verhindern.
    }
  }
}

async function zustand(env, ich) {
  // Ohne Haushalt beginnt die Einrichtung. Sie ist der einzige Weg hinein —
  // erst danach gibt es Quests, Cleanies und alles Weitere.
  if (!ich.couple_id) {
    return {
      angemeldet: true,
      eingerichtet: false,
      ich: { id: ich.id, name: ich.name, avatar: ich.avatar_url, bild: ich.bild },
      raumvorschlaege: RAUMVORSCHLAEGE
    };
  }

  const paar = ich.couple_id;
  const haus = await env.DB.prepare("select * from couples where id = ?1").bind(paar).first();
  if (!haus.eingerichtet) {
    return {
      angemeldet: true,
      eingerichtet: false,
      ich: { id: ich.id, name: ich.name, avatar: ich.avatar_url, bild: ich.bild },
      raumvorschlaege: RAUMVORSCHLAEGE
    };
  }

  await abstimmungenNachziehen(env, paar);
  await planNachziehen(env, paar);

  const [personen, staende, quests, belohnungen, meldungen, antraege, uebertragungen, vorschlaege, stimmen, verlauf, ereignisse, aktionen, raeume] =
    await Promise.all([
      env.DB.prepare(`select u.id, u.name, u.avatar_url, u.bild, m.joined_at, m.rolle, m.erwachsen
                        from members m join users u on u.id = m.user_id
                       where m.couple_id = ?1 order by m.joined_at`).bind(paar).all(),
      env.DB.prepare("select member_id, points from balances where couple_id = ?1").bind(paar).all(),
      env.DB.prepare(`select q.id, q.name, q.category, q.points, q.wiederkehrend, q.rhythmus, q.faellig_am,
                             (select count(*) from claims c where c.quest_id = q.id and c.status = 'bestaetigt') as genutzt
                        from quests q where q.couple_id = ?1 and q.active = 1`).bind(paar).all(),
      env.DB.prepare(`select b.id, b.name, b.cost, b.bestaetigen,
                             (select count(*) from requests r where r.reward_id = b.id and r.status = 'bestaetigt') as genutzt
                        from rewards b where b.couple_id = ?1 and b.active = 1`).bind(paar).all(),
      env.DB.prepare(`select c.id, c.quest_id, c.claimed_by, c.quantity, c.points_each, c.note, c.created_at,
                             c.rueckfrage, c.rueckfrage_von, q.name as quest
                        from claims c join quests q on q.id = c.quest_id
                       where c.couple_id = ?1 and c.status = 'offen' order by c.created_at desc`).bind(paar).all(),
      env.DB.prepare(`select r.id, r.requested_by, r.cost, r.wish_date, r.message, r.created_at,
                             r.rueckfrage, r.rueckfrage_von, r.vorschlag_datum, r.gutschrift_an, b.name as belohnung
                        from requests r join rewards b on b.id = r.reward_id
                       where r.couple_id = ?1 and r.status = 'offen' order by r.created_at desc`).bind(paar).all(),
      env.DB.prepare(`select id, from_member, to_member, amount, message, created_at
                        from transfers where couple_id = ?1 and status = 'offen' order by created_at desc`).bind(paar).all(),
      env.DB.prepare(`select p.*, q.name as quest_name, b.name as belohnung_name,
                             q.rhythmus as quest_rhythmus, q.wiederkehrend as quest_wiederkehrend
                        from proposals p
                        left join quests q on q.id = p.target_id
                        left join rewards b on b.id = p.target_id
                       where p.couple_id = ?1 order by p.status = 'offen' desc, p.created_at desc limit 20`).bind(paar).all(),
      env.DB.prepare(`select v.* from proposal_votes v join proposals p on p.id = v.proposal_id
                       where p.couple_id = ?1`).bind(paar).all(),
      env.DB.prepare(`select id, member_id, delta, reason, created_at from ledger
                       where couple_id = ?1 order by created_at desc limit 40`).bind(paar).all(),
      env.DB.prepare(`select id, art, titel, text, punkte, created_at from ereignisse
                       where user_id = ?1 and gelesen = 0 order by created_at limit 5`).bind(ich.id).all(),
      env.DB.prepare(`select id, art, prozent, kategorie, beginn, ende from aktionen
                       where couple_id = ?1 and ende > datetime('now') order by beginn`).bind(paar).all(),
      env.DB.prepare(`select id, name, aktiv from raeume where couple_id = ?1
                       order by sortierung, name`).bind(paar).all()
    ]);

  const jetzt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const laufend = aktionen.results.filter((a) => a.beginn <= jetzt && a.ende > jetzt);
  const punkteVon = Object.fromEntries(staende.results.map((z) => [z.member_id, z.points]));
  const mit = personen.results.map((p) => ({
    id: p.id, name: p.name, avatar: p.avatar_url, bild: p.bild, seit: p.joined_at,
    rolle: p.rolle, erwachsen: !!p.erwachsen, punkte: punkteVon[p.id] || 0
  }));
  const mein = mit.find((p) => p.id === ich.id) || { id: ich.id, name: ich.name, punkte: 0 };
  const andere = mit.filter((p) => p.id !== ich.id);

  const stimmenJe = {};
  for (const s of stimmen.results) (stimmenJe[s.proposal_id] ||= {})[s.member_id] = !!s.answer;

  return {
    angemeldet: true,
    eingerichtet: true,
    verbunden: andere.length > 0,
    code: mit.length < haus.groesse ? haus.pair_code : null,
    haushalt: {
      art: haus.art, groesse: haus.groesse, erwachsene: haus.erwachsene, kinder: haus.kinder,
      belegt: mit.length, ichVerwalte: mein.rolle === "verwalter",
      strafe: !!haus.strafe_an
    },
    ich: mein,
    mitglieder: mit,
    andere,
    raeume: raeume.results,
    quests: quests.results.map((q) => {
      const { wert, aktion } = questWert(q, laufend);
      return { ...q, punkte_jetzt: wert, bonus: aktion ? aktion.prozent : 0 };
    }),
    belohnungen: belohnungen.results.map((b) => {
      const { wert, aktion } = belohnungWert(b, laufend);
      return { ...b, kosten_jetzt: wert, rabatt: aktion ? aktion.prozent : 0 };
    }),
    aktionen: aktionen.results,
    urlaube: await urlaubeVon(env, paar),
    plan: await planListe(env, paar, ich.id),
    belohnungenOffen: await offeneBelohnungen(env, paar),
    meldungen: meldungen.results,
    antraege: antraege.results,
    uebertragungen: uebertragungen.results,
    abstimmungen: vorschlaege.results.map((p) => ({
      id: p.id,
      art: p.kind,
      titel: p.kind === "quest_points" || p.kind === "delete_quest" ? p.quest_name
           : p.kind === "reward_cost" || p.kind === "delete_reward" ? p.belohnung_name
           : p.name,
      alt: p.old_value,
      neu: p.new_value,
      grund: p.reason,
      von: p.created_by,
      raum: p.category,
      // Was im Anhang steht, gehört auch auf die Karte. Ohne den Rhythmus liest
      // sich ein Wechsel sonst als „12 Cleanies → 12 Cleanies“ und sagt nichts.
      tage: anhang(p).tage || null,
      rhythmus: anhang(p).rhythmus || null,
      wiederkehrend: anhang(p).wiederkehrend,
      von: anhang(p).von || null,
      bis: anhang(p).bis || null,
      alt_rhythmus: p.quest_rhythmus || null,
      alt_wiederkehrend: !!p.quest_wiederkehrend,
      status: p.status,
      created_at: p.created_at,
      meine: stimmenJe[p.id]?.[ich.id],
      stimmen: mit.map((m) => ({ id: m.id, name: m.name, antwort: stimmenJe[p.id]?.[m.id] }))
    })),
    verlauf: verlauf.results,
    ereignisse: ereignisse.results
  };
}

/* ------------------------------------------------------------------ Melden */

async function melden(env, ich, daten) {
  const { questId, anzahl = 1, notiz = "" } = daten;
  const menge = Math.max(1, Math.min(50, Number(anzahl) || 1));

  const quest = await env.DB.prepare(
    `select id, name, points, category, wiederkehrend, tage, rhythmus, faellig_am, zugewiesen
       from quests where id = ?1 and couple_id = ?2 and active = 1`
  ).bind(questId, ich.couple_id).first();
  if (!quest) throw new Fehler("Diese Quest gibt es nicht");

  // Bei einer wiederkehrenden Quest gilt zusätzlich die Sperre und die Zuteilung.
  const vorzeitig = meldenErlaubt(quest, ich, daten);

  const laeuft = quest.wiederkehrend
    ? await env.DB.prepare("select 1 as da from claims where quest_id = ?1 and status = 'offen'").bind(quest.id).first()
    : null;
  if (laeuft) throw new Fehler("Dazu wartet schon eine Meldung auf Bestätigung");

  // Der Wert friert jetzt ein — inklusive einer gerade laufenden Aktion.
  const { wert } = questWert(quest, await laufendeAktionen(env, ich.couple_id));
  const bemerkung = vorzeitig ? `Vorzeitig: ${vorzeitig}` : String(notiz).slice(0, 300);

  const meldung = id();
  await env.DB.prepare(
    `insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, note)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(meldung, ich.couple_id, quest.id, ich.id, menge, wert, bemerkung).run();
  await meldeAllen(env, ich, {
    art: "info", quelle: meldung,
    titel: `${vorname(ich.name)} hat etwas erledigt`,
    text: `${quest.name}${menge > 1 ? ` (${menge}×)` : ""} — ${menge * wert} Cleanies warten auf eine Bestätigung.`
  });
  return { ok: true };
}

async function meldungEntscheiden(env, ich, meldungId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");

  const meldung = await env.DB.prepare(
    `select c.*, q.name as quest, q.wiederkehrend, q.tage from claims c join quests q on q.id = c.quest_id
      where c.id = ?1 and c.couple_id = ?2`
  ).bind(meldungId, ich.couple_id).first();
  if (!meldung) throw new Fehler("Meldung nicht gefunden", 404);
  if (meldung.claimed_by === ich.id) throw new Fehler("Eine Meldung muss von jemand anderem bestätigt werden");

  // Entscheidung und Buchung in einem Zug: die zweite Anweisung sieht den neuen
  // Stand und bucht nur, wenn wirklich bestätigt wurde — und nur einmal.
  const [entschieden] = await env.DB.batch([
    env.DB.prepare(
      `update claims set status = ?1, decided_by = ?2, decided_at = datetime('now')
        where id = ?3 and couple_id = ?4 and status = 'offen' and claimed_by <> ?2`
    ).bind(status, ich.id, meldungId, ich.couple_id),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, c.couple_id, c.claimed_by, c.quantity * c.points_each,
              (select name from quests where id = c.quest_id), 'claim', c.id
         from claims c
        where c.id = ?2 and c.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = c.id)`
    ).bind(id(), meldungId),
    // Bei einer wiederkehrenden Quest springt die Fälligkeit jetzt nach vorn.
    ...(status === "bestaetigt"
      ? nachErledigung(env, { id: meldung.quest_id, wiederkehrend: meldung.wiederkehrend })
      : [])
  ]);
  if (!entschieden.meta.changes) throw new Fehler("Diese Meldung ist bereits entschieden");

  const punkte = meldung.quantity * meldung.points_each;
  await melde(env, ich.couple_id, meldung.claimed_by, status === "bestaetigt"
    ? { art: "bestaetigt", titel: `${vorname(ich.name)} hat bestätigt`, text: meldung.quest, punkte }
    : { art: "abgelehnt", titel: `${vorname(ich.name)} hat abgelehnt`, text: meldung.quest, punkte });

  return { ok: true, punkte, quest: meldung.quest };
}

/* ------------------------------------------------------------------ Belohnungen */

async function antragStellen(env, ich, { rewardId, termin = "", nachricht = "", gutschriftAn = null }) {
  const belohnung = await env.DB.prepare(
    "select id, name, cost from rewards where id = ?1 and couple_id = ?2 and active = 1"
  ).bind(rewardId, ich.couple_id).first();
  if (!belohnung) throw new Fehler("Diese Belohnung gibt es nicht");

  // Auch der Preis friert jetzt ein — wer im Rabatt beantragt, behält ihn.
  const { wert } = belohnungWert(belohnung, await laufendeAktionen(env, ich.couple_id));
  const empfaenger = await gutschriftPruefen(env, ich, gutschriftAn);

  const antrag = id();
  await env.DB.prepare(
    `insert into requests (id, couple_id, reward_id, requested_by, cost, wish_date, message, gutschrift_an)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(antrag, ich.couple_id, belohnung.id, ich.id, wert,
         String(termin).slice(0, 60), String(nachricht).slice(0, 300), empfaenger).run();
  await meldeAllen(env, ich, {
    art: "info", quelle: antrag,
    titel: `${vorname(ich.name)} möchte etwas einlösen`,
    text: `${belohnung.name} — ${wert} Cleanies.${
      empfaenger ? ` Sie gehen an ${vorname((await person(env, empfaenger))?.name)}.` : ""} Ihr entscheidet.`
  });
  return { ok: true, gutschriftAn: empfaenger };
}

const person = (env, wer) =>
  env.DB.prepare("select id, name from users where id = ?1").bind(wer).first();

/** Wem die Cleanies gutgeschrieben werden — oder niemandem.
 *
 *  Die Wahl gilt nur für diesen einen Antrag und wird nirgends gemerkt. Sich
 *  selbst gutschreiben geht nicht: das wäre eine Belohnung zum Nulltarif. */
async function gutschriftPruefen(env, ich, wen) {
  if (!wen) return null;
  if (wen === ich.id) throw new Fehler("Dir selbst kannst du die Cleanies nicht gutschreiben");

  const drin = await env.DB.prepare(
    "select 1 as da from members where couple_id = ?1 and user_id = ?2"
  ).bind(ich.couple_id, wen).first();
  if (!drin) throw new Fehler("Diese Person gehört nicht zum Haushalt");
  return wen;
}

async function antragEntscheiden(env, ich, antragId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");

  const antrag = await env.DB.prepare(
    `select r.*, b.name as belohnung from requests r join rewards b on b.id = r.reward_id
      where r.id = ?1 and r.couple_id = ?2`
  ).bind(antragId, ich.couple_id).first();
  if (!antrag) throw new Fehler("Antrag nicht gefunden", 404);
  if (antrag.requested_by === ich.id) throw new Fehler("Ein Antrag muss von jemand anderem entschieden werden");

  if (status === "bestaetigt") {
    const stand = await env.DB.prepare(
      "select coalesce(sum(delta), 0) as punkte from ledger where member_id = ?1"
    ).bind(antrag.requested_by).first();
    if (stand.punkte < antrag.cost) {
      throw new Fehler(`Zu wenig Cleanies für diese Belohnung — ${stand.punkte} von ${antrag.cost}`);
    }
  }

  const [entschieden] = await env.DB.batch([
    env.DB.prepare(
      `update requests set status = ?1, decided_by = ?2, decided_at = datetime('now')
        where id = ?3 and couple_id = ?4 and status = 'offen' and requested_by <> ?2`
    ).bind(status, ich.id, antragId, ich.couple_id),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, r.couple_id, r.requested_by, -r.cost,
              (select name from rewards where id = r.reward_id), 'request', r.id
         from requests r
        where r.id = ?2 and r.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = r.id)`
    ).bind(id(), antragId),
    // Die Gegenbuchung, falls der Antrag jemanden benannt hat. Eigene Kennung,
    // damit die Sperre der Abbuchung sie nicht mitverschluckt — und eine eigene
    // Sperre, damit auch sie nur einmal läuft.
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, r.couple_id, r.gutschrift_an, r.cost,
              (select name from rewards where id = r.reward_id) || ' (von '
                || (select name from users where id = r.requested_by) || ')', 'request', r.id || ':gut'
         from requests r
        where r.id = ?2 and r.status = 'bestaetigt' and r.gutschrift_an is not null
          and not exists (select 1 from ledger where source_id = r.id || ':gut')`
    ).bind(id(), antragId),
    // Eine zugesagte Belohnung ist noch keine erhaltene — außer bei Ausnahme-
    // und Vetoanträgen, die nichts zu liefern haben.
    env.DB.prepare(
      `update requests set erfuellt = case
          when (select bestaetigen from rewards where id = requests.reward_id) = 1 then 'offen' else 'erhalten' end
        where id = ?1 and status = 'bestaetigt'`
    ).bind(antragId)
  ]);
  if (!entschieden.meta.changes) throw new Fehler("Dieser Antrag ist bereits entschieden");

  await melde(env, ich.couple_id, antrag.requested_by, status === "bestaetigt"
    ? { art: "bestaetigt", titel: `${vorname(ich.name)} hat genehmigt`, text: antrag.belohnung, punkte: -antrag.cost }
    : { art: "abgelehnt", titel: `${vorname(ich.name)} hat abgelehnt`, text: antrag.belohnung });

  // Wer die Cleanies bekommt, soll es auch erfahren — außer die Person hat
  // gerade selbst genehmigt und sieht es ohnehin.
  if (status === "bestaetigt" && antrag.gutschrift_an && antrag.gutschrift_an !== ich.id) {
    await melde(env, ich.couple_id, antrag.gutschrift_an, {
      art: "bestaetigt",
      titel: `${vorname((await person(env, antrag.requested_by))?.name)} hat dir Cleanies gutgeschrieben`,
      text: antrag.belohnung, punkte: antrag.cost
    });
  }

  return { ok: true, belohnung: antrag.belohnung, kosten: antrag.cost, gutschriftAn: antrag.gutschrift_an };
}

/* ------------------------------------------------------------------ Übertragen */

async function uebertragen(env, ich, { betrag, an, nachricht = "" }) {
  const menge = Math.floor(Number(betrag));
  if (!(menge > 0)) throw new Fehler("Der Betrag muss größer als null sein");

  // Mit mehreren im Haushalt muss stehen, wer die Cleanies bekommt. Fehlt die
  // Angabe und es kommt ohnehin nur eine Person in Frage, ist es diese.
  const andere = await env.DB.prepare(
    "select user_id from members where couple_id = ?1 and user_id <> ?2"
  ).bind(ich.couple_id, ich.id).all();
  if (!andere.results.length) throw new Fehler("Es ist noch niemand sonst im Haushalt");

  const partner = an
    ? andere.results.find((m) => m.user_id === an)
    : (andere.results.length === 1 ? andere.results[0] : null);
  if (!partner) throw new Fehler("Wähle aus, wer die Cleanies bekommen soll");

  const stand = await env.DB.prepare(
    "select coalesce(sum(delta), 0) as punkte from ledger where member_id = ?1"
  ).bind(ich.id).first();
  if (stand.punkte < menge) throw new Fehler(`Du hast nur ${stand.punkte} Cleanies`);

  const uebertragung = id();
  await env.DB.prepare(
    `insert into transfers (id, couple_id, from_member, to_member, amount, message)
     values (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(uebertragung, ich.couple_id, ich.id, partner.user_id, menge, String(nachricht).slice(0, 300)).run();

  await melde(env, ich.couple_id, partner.user_id, {
    art: "info", quelle: uebertragung,
    titel: `${vorname(ich.name)} schickt dir Cleanies`,
    text: `${menge} Cleanies — du musst sie annehmen.`
  });
  return { ok: true };
}

async function uebertragungEntscheiden(env, ich, uebertragungId, status) {
  if (!["bestaetigt", "abgelehnt"].includes(status)) throw new Fehler("Unbekannte Entscheidung");

  const uebertragung = await env.DB.prepare(
    "select * from transfers where id = ?1 and couple_id = ?2"
  ).bind(uebertragungId, ich.couple_id).first();
  if (!uebertragung) throw new Fehler("Übertragung nicht gefunden", 404);
  if (uebertragung.to_member !== ich.id) throw new Fehler("Nur die empfangende Person kann annehmen oder ablehnen");

  if (status === "bestaetigt") {
    const stand = await env.DB.prepare(
      "select coalesce(sum(delta), 0) as punkte from ledger where member_id = ?1"
    ).bind(uebertragung.from_member).first();
    if (stand.punkte < uebertragung.amount) throw new Fehler("Die Cleanies reichen inzwischen nicht mehr");
  }

  const [entschieden] = await env.DB.batch([
    env.DB.prepare(
      `update transfers set status = ?1, decided_at = datetime('now')
        where id = ?2 and couple_id = ?3 and to_member = ?4 and status = 'offen'`
    ).bind(status, uebertragungId, ich.couple_id, ich.id),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, t.couple_id, t.from_member, -t.amount, 'Cleanies übertragen', 'transfer', t.id
         from transfers t where t.id = ?2 and t.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = t.id and delta < 0)`
    ).bind(id(), uebertragungId),
    env.DB.prepare(
      `insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
       select ?1, t.couple_id, t.to_member, t.amount, 'Cleanies erhalten', 'transfer', t.id
         from transfers t where t.id = ?2 and t.status = 'bestaetigt'
          and not exists (select 1 from ledger where source_id = t.id and delta > 0)`
    ).bind(id(), uebertragungId)
  ]);
  if (!entschieden.meta.changes) throw new Fehler("Diese Übertragung ist bereits entschieden");

  await melde(env, ich.couple_id, uebertragung.from_member, status === "bestaetigt"
    ? { art: "bestaetigt", titel: `${vorname(ich.name)} hat die Cleanies angenommen`,
        text: `${uebertragung.amount} Cleanies übertragen`, punkte: -uebertragung.amount }
    : { art: "abgelehnt", titel: `${vorname(ich.name)} hat die Cleanies abgelehnt`,
        text: `${uebertragung.amount} Cleanies bleiben bei dir` });
  return { ok: true };
}

/* ------------------------------------------------------------------ Abstimmungen */

async function vorschlagen(env, ich, daten) {
  const { art, zielId, wert, name = "", kategorie = "Sonstiges", grund = "", bestaetigen = true } = daten;
  const arten = ["quest_points", "new_quest", "reward_cost", "new_reward", "delete_quest", "delete_reward",
                 "neue_aktion", "neue_aufgabe", "aufgabe_aendern", "delete_aufgabe",
                 "urlaub_person", "urlaub_haushalt"];
  if (!arten.includes(art)) throw new Fehler("Unbekannte Art von Vorschlag");

  if (art === "urlaub_person" || art === "urlaub_haushalt") return urlaubVorschlagen(env, ich, daten);
  if (art === "neue_aktion") return aktionVorschlagen(env, ich, daten);
  if (art === "neue_aufgabe" || art === "aufgabe_aendern" || art === "delete_aufgabe") {
    return aufgabeVorschlagen(env, ich, daten);
  }

  const loeschen = art === "delete_quest" || art === "delete_reward";
  const neu = loeschen ? 0 : Math.floor(Number(wert));
  if (!loeschen && !(neu > 0)) throw new Fehler("Der Wert muss größer als null sein");

  let alt = null;
  if (loeschen) {
    const tabelle = art === "delete_quest" ? "quests" : "rewards";
    const spalte = art === "delete_quest" ? "points" : "cost";
    const ziel = await env.DB.prepare(
      `select ${spalte} as wert from ${tabelle} where id = ?1 and couple_id = ?2 and active = 1`
    ).bind(zielId, ich.couple_id).first();
    if (!ziel) throw new Fehler("Das gibt es nicht");
    alt = ziel.wert;

    const schonOffen = await env.DB.prepare(
      "select 1 as da from proposals where couple_id = ?1 and target_id = ?2 and status = 'offen'"
    ).bind(ich.couple_id, zielId).first();
    if (schonOffen) throw new Fehler("Dazu läuft schon eine Abstimmung");
  } else if (art === "quest_points" || art === "reward_cost") {
    const tabelle = art === "quest_points" ? "quests" : "rewards";
    const spalte = art === "quest_points" ? "points" : "cost";
    const ziel = await env.DB.prepare(
      `select ${spalte} as wert from ${tabelle} where id = ?1 and couple_id = ?2`
    ).bind(zielId, ich.couple_id).first();
    if (!ziel) throw new Fehler("Das gibt es nicht");
    if (ziel.wert === neu) throw new Fehler("Das ist der aktuelle Wert");
    alt = ziel.wert;
  } else if (!String(name).trim()) {
    throw new Fehler("Ein Name fehlt");
  }

  const vorschlag = id();
  await env.DB.batch([
    env.DB.prepare(
      `insert into proposals (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(vorschlag, ich.couple_id, art, zielId || null, alt, neu,
           String(name).slice(0, 120), String(kategorie).slice(0, 40), String(grund).slice(0, 300),
           JSON.stringify({ bestaetigen: !!bestaetigen }), ich.id),
    // Wer vorschlägt, stimmt zu. Es fehlt noch die andere Stimme.
    env.DB.prepare("insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, 1)")
      .bind(vorschlag, ich.id)
  ]);

  await meldeAllen(env, ich, {
    art: "info",
    titel: `${vorname(ich.name)} schlägt etwas vor`,
    text: loeschen ? `${name || "Ein Eintrag"} soll gelöscht werden — deine Stimme fehlt.`
                   : `Neuer Wert: ${neu} Cleanies — deine Stimme fehlt.`
  });
  return { ok: true };
}

async function abstimmen(env, ich, vorschlagId, antwort) {
  const vorschlag = await env.DB.prepare(
    "select * from proposals where id = ?1 and couple_id = ?2"
  ).bind(vorschlagId, ich.couple_id).first();
  if (!vorschlag) throw new Fehler("Vorschlag nicht gefunden", 404);
  if (vorschlag.status !== "offen") throw new Fehler("Diese Abstimmung ist bereits entschieden");

  await env.DB.prepare(
    `insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, ?3)
     on conflict(proposal_id, member_id) do nothing`
  ).bind(vorschlagId, ich.id, antwort ? 1 : 0).run();

  const status = await auszaehlen(env, vorschlag);

  if (status !== "offen" && vorschlag.created_by !== ich.id) {
    await melde(env, ich.couple_id, vorschlag.created_by, status === "bestaetigt"
      ? { art: "bestaetigt", titel: `${vorname(ich.name)} hat zugestimmt`, text: "Euer Vorschlag gilt ab jetzt" }
      : { art: "abgelehnt", titel: `${vorname(ich.name)} hat abgelehnt`, text: "Der alte Stand gilt weiter" });
  }
  return { ok: true, status, wert: vorschlag.new_value };
}

/** Urlaub vorschlagen — für sich selbst oder für den ganzen Haushalt. Beides
 *  beschließt der Haushalt gemeinsam; wirksam wird es erst mit der letzten
 *  Stimme, deshalb steht hier nur der Vorschlag. */
async function urlaubVorschlagen(env, ich, { art, von, bis, grund = "" }) {
  const { von: a, bis: b, tage } = zeitraum({ von, bis });
  const haushalt = art === "urlaub_haushalt";

  // Zwei gleichzeitig ergäben zwei Verschiebungen — für dieselbe Zeit einmal
  // ist genug. Bei „nur ich" zählt nur der eigene.
  const offen = await env.DB.prepare(
    `select 1 as da from proposals
      where couple_id = ?1 and status = 'offen' and kind = ?2
        and (?2 = 'urlaub_haushalt' or created_by = ?3)`
  ).bind(ich.couple_id, art, ich.id).first();
  if (offen) throw new Fehler("Dazu läuft schon eine Abstimmung");

  const laufend = await env.DB.prepare(
    `select 1 as da from urlaube
      where couple_id = ?1 and beendet_am is null and bis >= ?2 and von <= ?3
        and art = ?4 and (?4 = 'haushalt' or member_id = ?5)`
  ).bind(ich.couple_id, a, b, haushalt ? "haushalt" : "person", ich.id).first();
  if (laufend) throw new Fehler("Für diese Zeit ist schon ein Urlaub eingetragen");

  const titel = haushalt ? `${hausWort(await hausArt(env, ich.couple_id))} macht Urlaub`
                         : `${vorname(ich.name)} macht Urlaub`;
  const vorschlag = id();
  await env.DB.batch([
    env.DB.prepare(
      `insert into proposals (id, couple_id, kind, new_value, name, reason, payload, created_by)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(vorschlag, ich.couple_id, art, tage, titel, String(grund).slice(0, 300),
           JSON.stringify({ von: a, bis: b, member_id: haushalt ? null : ich.id }), ich.id),
    env.DB.prepare("insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, 1)")
      .bind(vorschlag, ich.id)
  ]);

  await meldeAllen(env, ich, {
    art: "info", quelle: vorschlag,
    titel: `${vorname(ich.name)} schlägt Urlaub vor`,
    text: haushalt
      ? `${a} bis ${b} — alle Fälligkeiten rücken um ${tage} ${tage === 1 ? "Tag" : "Tage"} nach hinten. Deine Stimme fehlt.`
      : `${a} bis ${b} — ${tage} ${tage === 1 ? "Tag" : "Tage"} ohne Mahnungen und Gruppenstrafe. Deine Stimme fehlt.`
  });
  return { ok: true, tage };
}

/** Wie der Haushalt sich selbst nennt — „die WG", „die Familie", … */
async function hausArt(env, paar) {
  const haus = await env.DB.prepare("select art from couples where id = ?1").bind(paar).first();
  return haus?.art || "sonstige";
}
const hausWort = (art) => ({ wg: "Die WG", familie: "Die Familie", paar: "Wir" })[art] || "Der Haushalt";

/** Eine Aktion vorschlagen: doppelte Cleanies oder Rabatt, befristet, auf Wunsch
 *  auf einen Raum begrenzt. Gültig wird sie erst mit beiden Stimmen. */
async function aktionVorschlagen(env, ich, { aktionsart, prozent, kategorie = "", dauer = "heute", grund = "" }) {
  if (!["quest_bonus", "belohnung_rabatt"].includes(aktionsart)) throw new Fehler("Unbekannte Art von Aktion");

  const wert = Math.floor(Number(prozent));
  if (!(wert > 0 && wert <= 400)) throw new Fehler("Der Prozentwert passt nicht");
  if (aktionsart === "belohnung_rabatt" && wert > 90) throw new Fehler("Mehr als 90 % Rabatt wäre geschenkt");

  const tage = DAUERN[dauer];
  if (!tage) throw new Fehler("Unbekannter Zeitraum");

  const raum = aktionsart === "quest_bonus" ? String(kategorie).slice(0, 40) : "";

  const laufend = await env.DB.prepare(
    `select 1 as da from aktionen where couple_id = ?1 and art = ?2 and ende > datetime('now')`
  ).bind(ich.couple_id, aktionsart).first();
  if (laufend) throw new Fehler("Dazu läuft schon eine Aktion");

  const offen = await env.DB.prepare(
    "select 1 as da from proposals where couple_id = ?1 and kind = 'neue_aktion' and status = 'offen'"
  ).bind(ich.couple_id).first();
  if (offen) throw new Fehler("Ein Vorschlag für eine Aktion steht noch zur Abstimmung");

  const vorschlag = id();
  await env.DB.batch([
    env.DB.prepare(
      `insert into proposals (id, couple_id, kind, new_value, name, category, reason, payload, created_by)
       values (?1, ?2, 'neue_aktion', ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(vorschlag, ich.couple_id, wert,
           aktionsart === "quest_bonus" ? "Doppelte Cleanies" : "Rabatt auf Belohnungen",
           raum || null, String(grund).slice(0, 300),
           JSON.stringify({ aktionsart, prozent: wert, kategorie: raum, tage }), ich.id),
    env.DB.prepare("insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, 1)")
      .bind(vorschlag, ich.id)
  ]);

  await meldeAllen(env, ich, {
    art: "info",
    titel: `${vorname(ich.name)} schlägt eine Aktion vor`,
    text: aktionsart === "quest_bonus"
      ? `+${wert} % Cleanies${raum ? ` auf ${raum}` : ""} — deine Stimme fehlt.`
      : `${wert} % Rabatt auf Belohnungen — deine Stimme fehlt.`
  });
  return { ok: true };
}

/** Eine wiederkehrende Aufgabe anlegen, ändern oder löschen — wie alles, was
 *  Cleanies bewegt, nur gemeinsam. Rhythmus und Raum reisen im Anhang mit. */
async function aufgabeVorschlagen(env, ich, { art, zielId, wert, name = "", raum = "Sonstiges",
                                              rhythmus = "1× pro Woche", wiederkehrend = true, grund = "" }) {
  if (wiederkehrend && !RHYTHMEN[rhythmus]) throw new Fehler("Unbekannter Rhythmus");

  let ziel = null;
  if (art !== "neue_aufgabe") {
    ziel = await env.DB.prepare("select * from quests where id = ?1 and couple_id = ?2 and active = 1")
      .bind(zielId, ich.couple_id).first();
    if (!ziel) throw new Fehler("Diese Quest gibt es nicht");

    const schonOffen = await env.DB.prepare(
      "select 1 as da from proposals where couple_id = ?1 and target_id = ?2 and status = 'offen'"
    ).bind(ich.couple_id, zielId).first();
    if (schonOffen) throw new Fehler("Dazu läuft schon eine Abstimmung");
  }

  const punkte = art === "neue_aufgabe" ? Math.floor(Number(wert)) : ziel.points;
  if (!(punkte > 0)) throw new Fehler("Der Cleanies-Wert muss größer als null sein");
  const titel = art === "neue_aufgabe" ? String(name).trim().slice(0, 60) : ziel.name;
  if (!titel) throw new Fehler("Ein Name fehlt");

  const vorschlag = id();
  await env.DB.batch([
    env.DB.prepare(
      `insert into proposals (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(vorschlag, ich.couple_id, art, zielId || null, ziel ? ziel.points : null, punkte,
           titel, raum || "Sonstiges", String(grund).slice(0, 300),
           JSON.stringify({ raum: raum || "Sonstiges", rhythmus, wiederkehrend: !!wiederkehrend }), ich.id),
    env.DB.prepare("insert into proposal_votes (proposal_id, member_id, answer) values (?1, ?2, 1)")
      .bind(vorschlag, ich.id)
  ]);

  await meldeAllen(env, ich, {
    art: "info",
    titel: `${vorname(ich.name)} schlägt etwas für den Plan vor`,
    text: art === "delete_aufgabe" ? `${titel} soll aus dem Plan — deine Stimme fehlt.`
        : !wiederkehrend ? `${titel} soll keine wiederkehrende Aufgabe mehr sein — deine Stimme fehlt.`
        : `${titel} · ${rhythmus} · ${punkte} Cleanies — deine Stimme fehlt.`
  });
  return { ok: true };
}

/** Der Anhang eines Vorschlags — leer, wenn keiner mitgeschickt wurde. */
function anhang(vorschlag) {
  try { return JSON.parse(vorschlag.payload || "{}"); } catch { return {}; }
}

/** Ein Nein beendet den Vorschlag sofort, der alte Wert gilt weiter.
 *  Übernommen wird er erst, wenn beide zugestimmt haben. */
async function auszaehlen(env, vorschlag) {
  const stimmen = await env.DB.prepare(
    "select answer from proposal_votes where proposal_id = ?1"
  ).bind(vorschlag.id).all();

  const nein = stimmen.results.some((s) => !s.answer);
  const ja = stimmen.results.filter((s) => s.answer).length;

  if (nein) {
    await env.DB.prepare(
      "update proposals set status = 'abgelehnt', decided_at = datetime('now') where id = ?1 and status = 'offen'"
    ).bind(vorschlag.id).run();
    return "abgelehnt";
  }

  // Nur gemeinsam heißt: wirklich alle. Ein einziges Nein beendet den Vorschlag
  // sofort, eine fehlende Stimme lässt ihn offen — der alte Wert gilt weiter.
  const koepfe = await env.DB.prepare("select count(*) as n from members where couple_id = ?1")
    .bind(vorschlag.couple_id).first();
  if (ja < koepfe.n) return "offen";

  // Nur die Anweisung der tatsächlichen Art bauen. Vorher wurden alle Arten auf
  // einmal erzeugt — bei einer Änderung der Cleanies sind die Felder einer Aktion leer,
  // und ein leerer Wert in bind() lässt die ganze Auszählung scheitern.
  const bauplan = {
    quest_points: () => env.DB.prepare("update quests set points = ?1 where id = ?2 and couple_id = ?3")
      .bind(vorschlag.new_value, vorschlag.target_id, vorschlag.couple_id),
    reward_cost: () => env.DB.prepare("update rewards set cost = ?1, bestaetigen = ?2 where id = ?3 and couple_id = ?4")
      .bind(vorschlag.new_value, anhang(vorschlag).bestaetigen === false ? 0 : 1,
            vorschlag.target_id, vorschlag.couple_id),
    // Der Vorschlag gibt dem neuen Eintrag seine Kennung. Damit kann dieselbe
    // Abstimmung nie zwei Quests anlegen — ein zweiter Anlauf verletzt den
    // Primärschlüssel, und der ganze Schritt wird zurückgerollt.
    new_quest: () => env.DB.prepare("insert into quests (id, couple_id, name, category, points) values (?1, ?2, ?3, ?4, ?5)")
      .bind(vorschlag.id, vorschlag.couple_id, vorschlag.name, vorschlag.category || "Sonstiges", vorschlag.new_value),
    new_reward: () => env.DB.prepare("insert into rewards (id, couple_id, name, cost, bestaetigen) values (?1, ?2, ?3, ?4, ?5)")
      .bind(vorschlag.id, vorschlag.couple_id, vorschlag.name, vorschlag.new_value,
            anhang(vorschlag).bestaetigen === false ? 0 : 1),
    // Nie hart löschen: der Verlauf soll lesbar bleiben.
    delete_quest: () => env.DB.prepare("update quests set active = 0 where id = ?1 and couple_id = ?2")
      .bind(vorschlag.target_id, vorschlag.couple_id),
    delete_reward: () => env.DB.prepare("update rewards set active = 0 where id = ?1 and couple_id = ?2")
      .bind(vorschlag.target_id, vorschlag.couple_id),
    neue_aktion: () => aktionAnlegen(env, vorschlag),
    neue_aufgabe: () => questMitRhythmus(env, vorschlag),
    aufgabe_aendern: () => rhythmusSetzen(env, vorschlag),
    delete_aufgabe: () => env.DB.prepare("update quests set active = 0 where id = ?1 and couple_id = ?2")
      .bind(vorschlag.target_id, vorschlag.couple_id),
    urlaub_person: () => urlaubAnlegen(env, vorschlag, anhang(vorschlag)),
    urlaub_haushalt: () => urlaubAnlegen(env, vorschlag, anhang(vorschlag))
  }[vorschlag.kind];

  if (!bauplan) throw new Fehler("Unbekannte Art von Vorschlag");
  // Ein Urlaub bewegt mehrere Tabellen auf einmal; alles andere genau eine.
  const anwenden = await bauplan();
  const schritte = anwenden?.anweisungen || (Array.isArray(anwenden) ? anwenden : [anwenden]);

  await env.DB.batch([
    ...schritte,
    env.DB.prepare("update proposals set status = 'bestaetigt', decided_at = datetime('now') where id = ?1 and status = 'offen'")
      .bind(vorschlag.id)
  ]);
  return "bestaetigt";
}

function aktionAnlegen(env, vorschlag) {
  const daten = JSON.parse(vorschlag.payload || "{}");
  const tage = DAUERN[Object.keys(DAUERN).find((k) => DAUERN[k] === daten.tage)] || daten.tage || 1;
  return env.DB.prepare(
    `insert into aktionen (id, couple_id, art, prozent, kategorie, beginn, ende, created_by)
     values (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now', '+${Number(tage)} days'), ?6)`
  ).bind(vorschlag.id, vorschlag.couple_id, daten.aktionsart, daten.prozent,
         daten.kategorie || null, vorschlag.created_by);
}

/* ------------------------------------------------------------------ Auswertung */

const TAG = 86400000;
const alsTag = (d) => d.toISOString().slice(0, 10);

/**
 * Cleanies je Tag, dazu Hochrechnungen auf Woche und Monat.
 *
 * Gezählt wird nur, was durch bestätigte Quests hereinkam — Übertragungen,
 * Einlösungen und der Anfangsbestand aus der Tabelle sind Bewegungen, kein Verdienst.
 * Sonst stünde am ersten Tag ein Balken von 88 und alles andere verschwände daneben.
 */
async function statistik(env, ich, versatzRoh) {
  if (!ich.couple_id) throw new Fehler("Noch kein Haushalt eingerichtet", 409);

  // Der Tag beginnt dort, wo die Person wohnt — nicht in Greenwich.
  const versatz = Math.max(-840, Math.min(840, Number(versatzRoh) || 0));
  const schieben = `${versatz >= 0 ? "+" : ""}${versatz} minutes`;

  const zeilen = await env.DB.prepare(
    `select date(created_at, ?2) as tag, member_id, sum(delta) as punkte
       from ledger
      where couple_id = ?1 and source_type = 'claim' and delta > 0
        and created_at >= datetime('now', '-70 days')
      group by tag, member_id`
  ).bind(ich.couple_id, schieben).all();

  // Zwei Reihen bleiben es auch zu viert: du und alle anderen zusammen. Wer im
  // Einzelnen wie viel beigetragen hat, steht auf dem Dashboard.
  const andere = await andereVon(env, ich);
  const proTag = new Map();
  for (const z of zeilen.results) {
    if (!proTag.has(z.tag)) proTag.set(z.tag, {});
    proTag.get(z.tag)[z.member_id] = z.punkte;
  }

  const heuteLokal = new Date(Date.now() + versatz * 60000);
  const heute = alsTag(heuteLokal);

  const tage = [];
  for (let i = 27; i >= 0; i--) {
    const tag = alsTag(new Date(heuteLokal.getTime() - i * TAG));
    const werte = proTag.get(tag) || {};
    tage.push({
      tag,
      ich: werte[ich.id] || 0,
      partner: andere.reduce((n, wer) => n + (werte[wer] || 0), 0)
    });
  }

  const summe = (liste, feld) => liste.reduce((n, t) => n + t[feld], 0);

  // Woche ab Montag
  const wochentag = (heuteLokal.getUTCDay() + 6) % 7;
  const wocheAb = alsTag(new Date(heuteLokal.getTime() - wochentag * TAG));
  const diese = tage.filter((t) => t.tag >= wocheAb);
  const tageOffen = 6 - wochentag;

  // Monat
  const monatAb = heute.slice(0, 8) + "01";
  const dieserMonat = tage.filter((t) => t.tag >= monatAb);
  const tageImMonat = new Date(Date.UTC(heuteLokal.getUTCFullYear(), heuteLokal.getUTCMonth() + 1, 0)).getUTCDate();
  const monatOffen = tageImMonat - Number(heute.slice(8, 10));

  // Vormonat vollständig, dafür reichen die 70 Tage aus der Abfrage
  const vorMonatEnde = new Date(Date.UTC(heuteLokal.getUTCFullYear(), heuteLokal.getUTCMonth(), 0));
  const vorMonatAb = alsTag(new Date(Date.UTC(vorMonatEnde.getUTCFullYear(), vorMonatEnde.getUTCMonth(), 1)));
  const vorMonat = { ich: 0, partner: 0 };
  for (const [tag, werte] of proTag) {
    if (tag >= vorMonatAb && tag <= alsTag(vorMonatEnde)) {
      vorMonat.ich += werte[ich.id] || 0;
      vorMonat.partner += andere.reduce((n, wer) => n + (werte[wer] || 0), 0);
    }
  }

  const letzte7 = tage.slice(-7);
  const schnitt = (feld) => summe(letzte7, feld) / 7;

  const kennzahlen = (feld) => {
    const bester = tage.reduce((b, t) => (t[feld] > (b?.[feld] ?? -1) ? t : b), null);
    let serie = 0;
    for (let i = tage.length - 1; i >= 0; i--) {
      if (tage[i][feld] > 0) serie++;
      else if (i < tage.length - 1) break;      // der heutige Tag darf noch leer sein
    }
    return {
      woche: { bisher: summe(diese, feld), prognose: Math.round(summe(diese, feld) + schnitt(feld) * tageOffen) },
      monat: {
        bisher: summe(dieserMonat, feld),
        prognose: Math.round(summe(dieserMonat, feld) + schnitt(feld) * monatOffen),
        vormonat: vorMonat[feld]
      },
      schnitt: Math.round(schnitt(feld) * 10) / 10,
      bester: bester && bester[feld] > 0 ? { tag: bester.tag, punkte: bester[feld] } : null,
      serie
    };
  };

  // Was als Nächstes drin wäre
  const laufend = await laufendeAktionen(env, ich.couple_id);
  const belohnungen = await env.DB.prepare(
    "select name, cost from rewards where couple_id = ?1 and active = 1"
  ).bind(ich.couple_id).all();
  const stand = await env.DB.prepare(
    "select coalesce(sum(delta), 0) as punkte from ledger where member_id = ?1"
  ).bind(ich.id).first();

  const naechste = belohnungen.results
    .map((b) => ({ name: b.name, kosten: belohnungWert(b, laufend).wert }))
    .filter((b) => b.kosten > stand.punkte)
    .sort((a, b) => a.kosten - b.kosten)[0] || null;

  return {
    tage,
    tageOffen,
    monatOffen,
    ich: kennzahlen("ich"),
    partner: andere.length ? kennzahlen("partner") : null,
    andereZahl: andere.length,
    naechsteBelohnung: naechste ? { ...naechste, fehlt: naechste.kosten - stand.punkte } : null
  };
}

/* ------------------------------------------------------------------ Sicherung */

async function ausgabe(env, ich) {
  if (!ich.couple_id) return { hinweis: "Noch kein Paar verbunden" };
  const paar = ich.couple_id;
  const hole = (sql) => env.DB.prepare(sql).bind(paar).all().then((r) => r.results);
  return {
    erstellt: new Date().toISOString(),
    personen: await hole("select u.id, u.name, u.email from members m join users u on u.id = m.user_id where m.couple_id = ?1"),
    punktestaende: await hole("select member_id, points from balances where couple_id = ?1"),
    quests: await hole("select * from quests where couple_id = ?1"),
    belohnungen: await hole("select * from rewards where couple_id = ?1"),
    meldungen: await hole("select * from claims where couple_id = ?1"),
    antraege: await hole("select * from requests where couple_id = ?1"),
    uebertragungen: await hole("select * from transfers where couple_id = ?1"),
    abstimmungen: await hole("select * from proposals where couple_id = ?1"),
    bewerbungen: await hole("select * from bewerbungen where couple_id = ?1"),
    buchungen: await hole("select * from ledger where couple_id = ?1 order by created_at")
  };
}
