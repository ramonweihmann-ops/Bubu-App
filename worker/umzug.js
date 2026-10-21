// Der Umzug in die EU-Datenbank — einmalig.
//
// Die neue Datenbank (DB) ist in Cloudflare auf die EU festgelegt; die alte
// hängt für die Dauer des Umzugs als ALT daneben. Der Worker kopiert alles aus
// ALT nach DB: Tabelle für Tabelle, Eltern vor Kindern, Zeile für Zeile mit
// „insert or ignore“. Am Ende setzt er die Marke `umzug_eu` in `einstellungen`;
// steht sie da, passiert nichts mehr.
//
// In Häppchen: Im kostenlosen Plan hat ein Aufruf nur 10 ms Rechenzeit. Jeder
// Aufruf kopiert deshalb höchstens HAPPEN Zeilen und hält in `umzug_eu_stand`
// fest, welche Tabelle dran ist. Innerhalb einer Tabelle zeigt die Zahl der
// schon kopierten Zeilen, wo es weitergeht — die alte Datenbank ändert sich
// nicht mehr, und jede Kopie ist ein Anfang der alten Tabelle in derselben
// Reihenfolge. Bricht ein Aufruf mittendrin ab, geht nichts verloren; der
// nächste macht weiter. Laufen zwei gleichzeitig, schadet das nicht: „insert or
// ignore“ legt nichts doppelt an und überschreibt nichts.
//
// Bis die Marke steht, antwortet die Schnittstelle mit 503 „zieht gerade um“ —
// niemand sieht eine halbe Datenbank, und niemand schreibt hinein.
//
// Ist der Umzug geprüft, fliegen ALT aus wrangler.toml und diese Datei wieder
// raus. Die alte Datenbank wird danach in Cloudflare gelöscht.

const MARKE = "umzug_eu";
const STAND = "umzug_eu_stand";
// Was SQLite, D1 und die Migrationen selbst verwalten, zieht nicht mit um.
const AUSLASSEN = /^(sqlite_|_cf_|d1_migrations$)/;
// Zeilen pro Aufruf. Ein Bild (bis 400 KB) zählt wie GEWICHT_BILD Zeilen.
const HAPPEN = 100;
const GEWICHT_BILD = 40;
const SEITE_BILDER = 2;
const STAPEL = 50;

let fertig = false;
let laeuft = null;

/**
 * Ein Schritt des Umzugs. true: fertig (oder nichts umzuziehen), false: es
 * fehlt noch etwas, der nächste Aufruf macht weiter. Wirft bei echten Fehlern.
 */
export async function umziehen(env) {
  if (!env.ALT || fertig) return true;
  laeuft ??= schritt(env).finally(() => {
    laeuft = null;
  });
  const ergebnis = await laeuft;
  if (ergebnis) fertig = true;
  return ergebnis;
}

/**
 * Für /api/health: steht der Umzug, wie weit ist er, und aus welcher Region
 * antwortet die Datenbank? Schiebt ihn auch an — und sagt, woran er scheitert,
 * statt selbst zu scheitern.
 */
export async function umzugsLage(env) {
  let fehler = null;
  try {
    await umziehen(env);
  } catch (e) {
    fehler = e.message;
  }
  const werte = await lesen(env.DB).catch(() => ({}));
  // D1 sagt bei jeder Abfrage, aus welcher Region sie beantwortet wurde.
  const probe = await env.DB.prepare("select 1").run().catch(() => null);
  return {
    umzug: werte[MARKE] ?? (env.ALT ? { laeuft: werte[STAND] ?? { tabelle: 0, zeilen: 0 } } : null),
    ...(fehler ? { umzugFehler: fehler } : {}),
    region: probe?.meta?.served_by_region ?? null
  };
}

async function lesen(db) {
  const { results } = await db.prepare("select schluessel, wert from einstellungen where schluessel in (?1, ?2)")
    .bind(MARKE, STAND).all();
  return Object.fromEntries(results.map((r) => [r.schluessel, JSON.parse(r.wert)]));
}

async function merken(db, schluessel, wert) {
  await db.prepare("insert into einstellungen (schluessel, wert) values (?1, ?2) " +
    "on conflict (schluessel) do update set wert = excluded.wert")
    .bind(schluessel, JSON.stringify(wert)).run();
}

async function schritt(env) {
  const werte = await lesen(env.DB);
  if (werte[MARKE]) return true;
  let stand = werte[STAND] ?? { tabelle: 0, zeilen: 0 };

  const tabellen = await reihenfolge(env.ALT);
  const neu = new Set((await tabellenVon(env.DB)).map((t) => t.name));
  const fehlt = tabellen.filter((t) => !neu.has(t));
  if (fehlt.length) throw new Error(`Umzug: In der neuen Datenbank fehlt ${fehlt.join(", ")}`);

  let budget = Number(env.UMZUG_HAPPEN) || HAPPEN;
  for (let i = stand.tabelle; i < tabellen.length; i++) {
    const tabelle = tabellen[i];
    const bild = tabelle === "bilder";
    const soll = await zaehlen(env.ALT, tabelle);
    let schon = await zaehlen(env.DB, tabelle, true);

    while (schon < soll) {
      if (budget <= 0) return false;
      const groesse = bild ? SEITE_BILDER : Math.min(budget, soll - schon);
      const { results } = await env.ALT.prepare(`select * from "${tabelle}" order by rowid limit ?1 offset ?2`)
        .bind(groesse, schon).all();
      if (!results.length) throw new Error(`Umzug: ${tabelle} endet bei ${schon} statt ${soll} Zeilen`);
      const schritte = results.map((zeile) => {
        // Beide Datenbanken haben dieselben Migrationen hinter sich, also dieselben Spalten.
        const namen = Object.keys(zeile);
        return env.DB.prepare(
          `insert or ignore into "${tabelle}" (${namen.map((s) => `"${s}"`).join(", ")}) ` +
          `values (${namen.map((_, n) => `?${n + 1}`).join(", ")})`
        ).bind(...namen.map((s) => zeile[s]));
      });
      for (let s = 0; s < schritte.length; s += STAPEL) await env.DB.batch(schritte.slice(s, s + STAPEL));
      schon += results.length;
      budget -= results.length * (bild ? GEWICHT_BILD : 1);
    }

    stand = { tabelle: i + 1, zeilen: stand.zeilen + soll };
    await merken(env.DB, STAND, stand);
  }

  await merken(env.DB, MARKE, { am: new Date().toISOString(), tabellen: tabellen.length, zeilen: stand.zeilen });
  await env.DB.prepare("delete from einstellungen where schluessel = ?1").bind(STAND).run();
  console.log(`Umzug: ${stand.zeilen} Zeilen aus ${tabellen.length} Tabellen übernommen`);
  return true;
}

async function tabellenVon(db) {
  const { results } = await db.prepare("select name, sql from sqlite_master where type = 'table' order by name").all();
  return results.filter((r) => !AUSLASSEN.test(r.name));
}

/** In der neuen Datenbank zählen die eigenen Notizen des Umzugs nicht mit. */
async function zaehlen(db, tabelle, neu = false) {
  if (neu && tabelle === "einstellungen") {
    return (await db.prepare("select count(*) as n from einstellungen where schluessel not in (?1, ?2)")
      .bind(MARKE, STAND).first()).n;
  }
  return (await db.prepare(`select count(*) as n from "${tabelle}"`).first()).n;
}

/**
 * Tabellen so sortiert, dass jede erst nach denen kommt, auf die sie verweist.
 * Die Verweise stehen im CREATE TABLE, das SQLite auch nach „alter table“
 * vollständig in sqlite_master führt.
 */
async function reihenfolge(db) {
  const alle = await tabellenVon(db);
  const tabellen = alle.map((t) => t.name);
  const braucht = new Map();
  for (const { name, sql } of alle) {
    const ziele = [...String(sql).matchAll(/references\s+"?(\w+)"?/gi)].map((m) => m[1]);
    braucht.set(name, new Set(ziele.filter((z) => z !== name && tabellen.includes(z))));
  }
  const sortiert = [];
  while (sortiert.length < tabellen.length) {
    const naechste = tabellen.filter((t) => !sortiert.includes(t) && [...braucht.get(t)].every((z) => sortiert.includes(z)));
    if (!naechste.length) throw new Error("Umzug: Verweise im Kreis — " + tabellen.filter((t) => !sortiert.includes(t)).join(", "));
    sortiert.push(...naechste);
  }
  return sortiert;
}
