// Messhülle für tests/lesen.sh: legt sich um den echten Worker und zählt, was
// jede Anfrage in D1 liest und schreibt. Die Summen kommen als Kopfzeilen
// x-lesen / x-schreiben / x-abfragen zurück. Läuft nur lokal, nie live.
import app from "../../worker/index.js";

function zaehlend(db, summe) {
  const merke = (meta) => {
    summe.lesen += meta?.rows_read ?? 0;
    summe.schreiben += meta?.rows_written ?? 0;
    summe.abfragen += 1;
  };
  const anweisung = (inner) => ({
    __inner: inner,
    bind: (...werte) => anweisung(inner.bind(...werte)),
    async all() { const r = await inner.all(); merke(r.meta); return r; },
    async run() { const r = await inner.run(); merke(r.meta); return r; },
    async first(spalte) {
      const r = await inner.all();
      merke(r.meta);
      const zeile = r.results[0];
      if (!zeile) return null;
      return spalte ? zeile[spalte] : zeile;
    },
    async raw(optionen) {
      const r = await inner.all();
      merke(r.meta);
      const zeilen = r.results.map((z) => Object.values(z));
      return optionen?.columnNames ? [Object.keys(r.results[0] ?? {}), ...zeilen] : zeilen;
    }
  });
  return {
    prepare: (sql) => anweisung(db.prepare(sql)),
    async batch(liste) {
      const r = await db.batch(liste.map((a) => a.__inner));
      r.forEach((x) => merke(x.meta));
      return r;
    },
    exec: (...a) => db.exec(...a)
  };
}

export default {
  async fetch(request, env, ctx) {
    const summe = { lesen: 0, schreiben: 0, abfragen: 0 };
    const antwort = await app.fetch(request, { ...env, DB: zaehlend(env.DB, summe) }, ctx);
    const neu = new Response(antwort.body, antwort);
    neu.headers.set("x-lesen", String(summe.lesen));
    neu.headers.set("x-schreiben", String(summe.schreiben));
    neu.headers.set("x-abfragen", String(summe.abfragen));
    return neu;
  }
};
