#!/usr/bin/env bash
# Wiederkehrende Aufgaben: anlegen, bewerben, Rangliste, Sperre, Strafe — zu dritt.
set -u
B=http://127.0.0.1:8792/api
CURL=(curl -s --noproxy 127.0.0.1)
fehler=0
J='Content-Type: application/json'

post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))'; }
feld() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(eval('(' + s + ')')$1 ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }

echo "== Frische WG zu dritt (A verwaltet)"
sql "delete from bewerbungen; delete from claims; delete from ereignisse" > /dev/null
sql "delete from quests where wiederkehrend = 1" > /dev/null
sql "delete from proposal_votes; delete from proposals" > /dev/null
sql "delete from ledger where source_type in ('claim','plan','strafe')" > /dev/null

PAAR=$(get tok-a state | feld ".haushalt ? 'da' : ''")
if [ "$PAAR" != "da" ]; then echo "  (WG fehlt — haushalt.sh zuerst laufen lassen)"; exit 1; fi

echo "== Aufgabe anlegen geht nur gemeinsam"
post tok-a proposals '{"art":"neue_aufgabe","name":"Wohnung saugen","raum":"Küche","wert":6,"rhythmus":"1× pro Woche","grund":"Muss halt"}' > /dev/null
VOR=$(get tok-a state | feld ".abstimmungen[0].id")
pruefe "Nach einer Stimme noch offen" "$(get tok-a state | feld ".plan.length")" "0"
post tok-b "proposals/$VOR/vote" '{"antwort":true}' > /dev/null
pruefe "Nach zwei Stimmen weiter offen" "$(get tok-a state | feld ".plan.length")" "0"
post tok-c "proposals/$VOR/vote" '{"antwort":true}' > /dev/null
pruefe "Nach allen dreien angelegt" "$(get tok-a state | feld ".plan.length")" "1"

AUF=$(get tok-a state | feld ".plan[0].id")
pruefe "Rhythmus übernommen" "$(get tok-a state | feld ".plan[0].rhythmus")" "1× pro Woche"
pruefe "Fällig in sieben Tagen" "$(get tok-a state | feld ".plan[0].offen")" "7"
pruefe "Punktwert" "$(get tok-a state | feld ".plan[0].punkte")" "6"

echo "== Vor der Fälligkeit ist gesperrt"
pruefe "Erledigen abgewiesen" "$(post tok-a claims "{\"questId\":\"$AUF\"}" | feld ".fehler.startsWith('Gesperrt bis')")" "true"
pruefe "Ohne Begründung auch mit Trotzdem" "$(post tok-a claims "{\"questId\":\"$AUF\",\"trotzdem\":true}" | feld ".fehler")" "Für besondere Umstände braucht es eine Begründung"
pruefe "Mit Begründung geht es" "$(post tok-a claims "{\"questId\":\"$AUF\",\"trotzdem\":true,\"grund\":\"Besuch kommt\"}" | feld ".ok")" "true"

ERL=$(get tok-b state | feld ".plan[0].pruefung.id")
pruefe "Selbstbestätigung abgewiesen" "$(post tok-a "claims/$ERL/decide" '{"status":"bestaetigt"}' | feld ".fehler")" "Eine Meldung muss von jemand anderem bestätigt werden"
pruefe "B bestätigt" "$(post tok-b "claims/$ERL/decide" '{"status":"bestaetigt"}' | feld ".ok")" "true"
pruefe "Punkte gebucht" "$(sql "select coalesce(sum(delta),0) as n from ledger where member_id='u-a' and source_type='claim'" | feld "[0].n")" "6"
pruefe "Neu fällig in sieben Tagen" "$(get tok-a state | feld ".plan[0].offen")" "7"

echo "== Zähler: A war einmal am Stück dran"
pruefe "A am Stück" "$(get tok-a "plan/$AUF" | feld ".mitglieder.find(m=>m.id==='u-a').stueck")" "1"
pruefe "B am Stück" "$(get tok-a "plan/$AUF" | feld ".mitglieder.find(m=>m.id==='u-b').stueck")" "0"
pruefe "A dieses Jahr" "$(get tok-a "plan/$AUF" | feld ".mitglieder.find(m=>m.id==='u-a').jahr")" "1"

echo "== Bewerbung und Rangliste"
sql "update quests set faellig_am = date('now','+1 day') where id='$AUF'" > /dev/null
pruefe "A bewirbt sich" "$(post tok-a "plan/$AUF/bewerben" '{}' | feld ".ok")" "true"
pruefe "B bewirbt sich" "$(post tok-b "plan/$AUF/bewerben" '{}' | feld ".ok")" "true"
get tok-a state > /dev/null                       # löst das Einfrieren aus
pruefe "Rangliste steht" "$(get tok-a "plan/$AUF" | feld ".rangliste.length")" "2"
pruefe "B steht oben (A war zuletzt dran)" "$(get tok-a "plan/$AUF" | feld ".rangliste[0]")" "u-b"
pruefe "A darf nicht entscheiden" "$(post tok-a "plan/$AUF/vergabe" '{"annehmen":true}' | feld ".fehler")" "Entscheiden darf nur, wer oben in der Rangliste steht"

echo "== Ablehnen reicht weiter"
pruefe "B lehnt ab" "$(post tok-b "plan/$AUF/vergabe" '{"annehmen":false}' | feld ".status")" "weitergereicht"
pruefe "Jetzt ist A dran" "$(get tok-a "plan/$AUF" | feld ".dran")" "u-a"
pruefe "A nimmt an" "$(post tok-a "plan/$AUF/vergabe" '{"annehmen":true}' | feld ".status")" "angenommen"
pruefe "A ist zugewiesen" "$(get tok-a state | feld ".plan[0].zugewiesen")" "u-a"
pruefe "C darf nicht melden" "$(post tok-c claims "{\"questId\":\"$AUF\",\"trotzdem\":true,\"grund\":\"egal\"}" | feld ".fehler")" "Diese Runde gehört jemand anderem"

echo "== Ein einziger Bewerber bekommt sie ohne Rangliste"
sql "update quests set faellig_am = date('now'), dran = null, zugewiesen = null, vergabe_runde = null where id='$AUF'" > /dev/null
sql "delete from bewerbungen" > /dev/null
post tok-c "plan/$AUF/bewerben" '{}' > /dev/null
get tok-a state > /dev/null
pruefe "C direkt zugewiesen" "$(get tok-a state | feld ".plan[0].zugewiesen")" "u-c"
pruefe "Keine Rangliste nötig" "$(get tok-a "plan/$AUF" | feld ".rangliste ? 'ja' : 'nein'")" "nein"

echo "== Überfällig: Mahnung an alle"
sql "delete from ereignisse" > /dev/null
sql "update quests set faellig_am = date('now','-2 days'), mahnung_runde = null where id='$AUF'" > /dev/null
get tok-a state > /dev/null
pruefe "Drei Mahnungen" "$(sql "select count(*) as n from ereignisse where titel like '%ist überfällig'" | feld "[0].n")" "3"
pruefe "Nicht doppelt gemahnt" "$(get tok-a state > /dev/null; sql "select count(*) as n from ereignisse where titel like '%ist überfällig'" | feld "[0].n")" "3"

echo "== Sieben Tage überfällig: Gruppenstrafe"
sql "update quests set faellig_am = date('now','-7 days'), strafe_runde = null where id='$AUF'" > /dev/null
get tok-a state > /dev/null
pruefe "Drei Buchungen" "$(sql "select count(*) as n from ledger where source_type='strafe'" | feld "[0].n")" "3"
pruefe "Jeder minus sechs" "$(sql "select distinct delta as d from ledger where source_type='strafe'" | feld ".map(r=>r.d).join(',')")" "-6"
pruefe "Nur einmal je Runde" "$(get tok-a state > /dev/null; sql "select count(*) as n from ledger where source_type='strafe'" | feld "[0].n")" "3"

echo "== Strafe abschaltbar"
sql "delete from ledger where source_type='strafe'" > /dev/null
sql "update quests set strafe_runde = null where id='$AUF'" > /dev/null
pruefe "C darf nicht abschalten" "$(post tok-c haushalt '{"strafe":false}' | feld ".fehler")" "Das kann nur, wer den Haushalt verwaltet"
pruefe "A schaltet ab" "$(post tok-a haushalt '{"strafe":false}' | feld ".ok")" "true"
get tok-a state > /dev/null
pruefe "Keine Strafe mehr" "$(sql "select count(*) as n from ledger where source_type='strafe'" | feld "[0].n")" "0"
post tok-a haushalt '{"strafe":true}' > /dev/null

echo "== Rhythmus ändern und zurückstellen laufen über die Abstimmung"
post tok-a proposals "{\"art\":\"aufgabe_aendern\",\"zielId\":\"$AUF\",\"rhythmus\":\"1× im Monat\"}" > /dev/null
VOR2=$(get tok-a state | feld ".abstimmungen.find(v=>v.status==='offen').id")
post tok-b "proposals/$VOR2/vote" '{"antwort":true}' > /dev/null
post tok-c "proposals/$VOR2/vote" '{"antwort":true}' > /dev/null
pruefe "Rhythmus geändert" "$(get tok-a state | feld ".plan[0].rhythmus")" "1× im Monat"
pruefe "Tage folgen dem Rhythmus" "$(get tok-a state | feld ".plan[0].tage")" "30"

post tok-a proposals "{\"art\":\"aufgabe_aendern\",\"zielId\":\"$AUF\",\"wiederkehrend\":false}" > /dev/null
VOR3=$(get tok-a state | feld ".abstimmungen.find(v=>v.status==='offen').id")
post tok-b "proposals/$VOR3/vote" '{"antwort":true}' > /dev/null
post tok-c "proposals/$VOR3/vote" '{"antwort":true}' > /dev/null
pruefe "Aus dem Plan" "$(get tok-a state | feld ".plan.length")" "0"
pruefe "Quest bleibt bestehen" "$(get tok-a state | feld ".quests.filter(q=>q.id==='$AUF').length")" "1"

echo
[ "$fehler" -eq 0 ] && echo "ALLES GRÜN" || echo "$fehler FEHLER"
exit "$fehler"
