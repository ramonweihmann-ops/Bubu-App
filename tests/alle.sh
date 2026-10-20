#!/usr/bin/env bash
# Alle Suiten in der Reihenfolge, in der sie sich vertragen.
#
# Die Suiten teilen sich eine Datenbank und bauen aufeinander auf:
# test.sh braucht den Zweier-Haushalt aus seed.sql, alles danach die
# Dreier-WG, die haushalt.sh anlegt, und ui3.mjs frische Konten d/e/f.
# In falscher Reihenfolge scheitern sie an Altlasten, nicht an der App.
#
# Vorher muss `npx wrangler dev --local --port 8792` laufen.
set -u
cd "$(dirname "$0")"
APP=$(cd .. && pwd)
HIER=$PWD

# Playwright liegt nicht im Projekt — es wird nur zum Testen gebraucht und wiegt
# mehr als die ganze App. Wo es liegt, sagt HQ_PLAYWRIGHT oder die Suche.
#
# Ein Symlink statt NODE_PATH: für `import` schaut Node nur in node_modules
# neben der Datei und darüber, NODE_PATH ignoriert es.
if [ ! -d "$HIER/node_modules/playwright" ]; then
  for kandidat in "${HQ_PLAYWRIGHT:-}" /tmp/claude-*/*/*/scratchpad/node_modules; do
    if [ -d "$kandidat/playwright" ]; then
      rm -f "$HIER/node_modules"
      ln -s "$kandidat" "$HIER/node_modules"
      break
    fi
  done
fi
if [ ! -d "$HIER/node_modules/playwright" ]; then
  echo "Playwright nicht gefunden — mit HQ_PLAYWRIGHT=/pfad/node_modules den Ort angeben."
  echo "Die API-Suiten laufen trotzdem."
fi
export HQ_BILDER="${HQ_BILDER:-${TMPDIR:-/tmp}}"

# Der lokale Testserver stürzt selten, aber dann ohne Vorwarnung ab („Network
# connection lost“) — und alles danach liefe ins Leere. Deshalb vor jedem Teil
# die Probe: antwortet er nicht, wird er neu gestartet.
serverDa() {
  curl -s -o /dev/null -m 5 --noproxy 127.0.0.1 http://127.0.0.1:8792/api/health && return 0
  echo "  (Testserver antwortet nicht — wird neu gestartet)"
  (cd "$APP" && nohup npx wrangler dev --local --port 8792 > "${TMPDIR:-/tmp}/hq-wrangler.log" 2>&1 &)
  for _ in $(seq 1 60); do
    curl -s -o /dev/null -m 5 --noproxy 127.0.0.1 http://127.0.0.1:8792/api/health && return 0
    sleep 1
  done
  echo "  (Testserver kommt nicht hoch)"
}
# Gezeigt werden die letzten Zeilen; das ganze Protokoll jedes Teils liegt
# daneben in $HQ_BILDER/protokoll-<teil>.log — für die Fehlersuche.
lauf() {
  serverDa; echo; echo "───── $1"
  local teil=$1; shift
  "$@" > "$HQ_BILDER/protokoll-$teil.log" 2>&1
  tail -"${TAIL:-8}" "$HQ_BILDER/protokoll-$teil.log"
}

echo "═════ Zweier-Haushalt: Vorschläge"
(cd "$APP" && npx wrangler d1 execute haus-quest --local --file "$HIER/seed.sql" > /dev/null 2>&1) \
  || { echo "Seed ließ sich nicht einspielen"; exit 1; }
bash sitzungen.sh > /dev/null 2>&1
lauf "test.sh" bash test.sh

echo
echo "═════ Dreier-WG aufbauen"
bash reset-def.sh > /dev/null 2>&1
lauf "haushalt.sh" bash haushalt.sh
lauf "plan-api.sh" bash plan-api.sh
lauf "rueck-api.sh" bash rueck-api.sh
lauf "storno-api.sh" bash storno-api.sh
lauf "urlaub-api.sh" bash urlaub-api.sh
lauf "gutschrift-api.sh" bash gutschrift-api.sh
lauf "ruecktritt-api.sh" bash ruecktritt-api.sh
lauf "jubel-api.sh" bash jubel-api.sh
lauf "event-api.sh" bash event-api.sh
lauf "bilder-api.sh" bash bilder-api.sh
lauf "familie-api.sh" bash familie-api.sh
lauf "fair-api.sh" bash fair-api.sh

echo
echo "═════ Oberfläche"
for t in ui ui-scroll ui-plan ui-questplan ui-rueck ui-wieder ui-offen ui-abst ui-storno ui-urlaub ui-gutschrift ui-ruecktritt ui-jubel ui-event ui-start ui-bilder ui-familie ui-fair ui-startbild cleanie-shot mockup-anim mockup-events mockup-klang mockup-start mockup-icons mockup-familie mockup-fair mockup-startbild; do
  lauf "$t.mjs" node "$t.mjs"
done

echo
echo "═════ Ersteinrichtung braucht frische Konten"
bash reset-def.sh > /dev/null 2>&1
lauf "ui3.mjs" node ui3.mjs

echo
echo "Fertig. Jede Zeile oben muss auf ALLES GRÜN oder „Keine Fehler“ enden."
