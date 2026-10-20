#!/usr/bin/env bash
# Konto löschen und Haushalt verlassen: was einem selbst gehört, geht; was andere
# betrifft, bleibt ohne Namen. Die letzte Erwachsene nimmt den Haushalt mit,
# Jugendliche behalten ihr Konto. Eigene Haushalte, eigene Konten.
set -u
B=http://127.0.0.1:8792/api
CURL=(curl -s --noproxy 127.0.0.1 -m 20)
fehler=0
J='Content-Type: application/json'

post() { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" -H "$J" -d "$3" "$B/$2"; }
get()  { "${CURL[@]}" -H "Cookie: hq_sitzung=$1" "$B/$2"; }
sql()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --json --command "$1" 2>/dev/null \
         | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results)))'; }
roh()  { cd /workspace/bubu-app && npx wrangler d1 execute haus-quest --local --command "$1" > /dev/null 2>&1; }
feld() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(eval('(' + s + ')')$1 ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
rech() { node -e "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{try{const d=JSON.parse(s);console.log(($1) ?? '')}catch(e){console.log('FEHLER '+e.message)}})"; }
pruefe() { if [ "$2" = "$3" ]; then echo "  ok   $1: $2"; else echo "  FEHL $1: ist=$2 soll=$3"; fehler=$((fehler+1)); fi; }
zahl() { sql "$1" | feld "[0].n"; }

echo "== Frische Konten"
ALLE="ka kb kc kd ke kf kg kh ki kj"
for n in $ALLE; do
  roh "delete from couples where id in (select couple_id from members where user_id = 'u-$n')"
done
roh "delete from users where id like 'kind-%' and id not in (select user_id from members)"
for n in $ALLE; do
  roh "insert into users (id, email, name) values ('u-$n', '$n@test', 'Konto $n') on conflict(id) do nothing"
done
node -e '
const c=require("crypto");
for (const n of process.argv.slice(1)) console.log(n+" "+c.createHash("sha256").update("tok-"+n).digest("hex"));
' $ALLE | while read n h; do
  roh "insert into sessions (token_hash, user_id, expires_at) values ('$h', 'u-$n', datetime('now','+1 day')) on conflict(token_hash) do update set user_id = 'u-$n', expires_at = datetime('now','+1 day')"
done

echo "== Anna und Ben: ein gelebter Haushalt"
CODE=$(post tok-ka haushalt/einrichten '{"name":"Anna","art":"paar"}' | feld ".code")
post tok-kb pair/join "{\"code\":\"$CODE\"}" > /dev/null
post tok-kb profil '{"name":"Ben"}' > /dev/null
PAAR=$(sql "select couple_id as c from members where user_id = 'u-ka'" | feld "[0].c")
Q=$(get tok-ka state | feld ".quests.find(q => q.name === 'Küche reinigen nach Kochen').id")
QB=$(get tok-ka state | feld ".quests.find(q => q.name === 'Bad reinigen').id")
# Anna erledigt, Ben bestätigt.
post tok-ka claims "{\"questId\":\"$Q\"}" > /dev/null
M=$(sql "select id from claims where claimed_by = 'u-ka' and status = 'offen'" | feld "[0].id")
post tok-kb "claims/$M/decide" '{"status":"bestaetigt"}' > /dev/null
# Ben erledigt, Anna bestätigt — das gehört Ben.
post tok-kb claims "{\"questId\":\"$QB\"}" > /dev/null
MB=$(sql "select id from claims where claimed_by = 'u-kb' and status = 'offen'" | feld "[0].id")
post tok-ka "claims/$MB/decide" '{"status":"bestaetigt"}' > /dev/null
# Geschenke hin und her.
post tok-ka transfers '{"betrag":2,"an":"u-kb"}' > /dev/null
T1=$(sql "select id from transfers where from_member = 'u-ka'" | feld "[0].id")
post tok-kb "transfers/$T1/decide" '{"status":"bestaetigt"}' > /dev/null
post tok-kb transfers '{"betrag":1,"an":"u-ka"}' > /dev/null
T2=$(sql "select id from transfers where from_member = 'u-kb'" | feld "[0].id")
post tok-ka "transfers/$T2/decide" '{"status":"bestaetigt"}' > /dev/null
# Eine Belohnung, die Anna für Ben einlöst: Bens Buchung nennt Anna.
R=$(get tok-ka state | feld ".belohnungen.filter(b => b.cost <= 1).sort((a, b) => a.cost - b.cost)[0]?.id")
if [ -n "$R" ]; then
  post tok-ka requests "{\"rewardId\":\"$R\",\"gutschriftAn\":\"u-kb\"}" > /dev/null
  AN=$(sql "select id from requests where requested_by = 'u-ka' and status = 'offen'" | feld "[0].id")
  post tok-kb "requests/$AN/decide" '{"status":"bestaetigt"}' > /dev/null
fi
roh "insert into ledger (id, couple_id, member_id, delta, reason, source_type) values ('test-name-$PAAR', '$PAAR', 'u-kb', 0, 'Kino (von Anna)', 'test')"
# Eine Aktion, die Anna vorgeschlagen und Ben angenommen hat — sie gehört dem Haushalt.
post tok-ka proposals '{"art":"neue_aktion","aktionsart":"quest_bonus","prozent":50,"dauer":"woche"}' > /dev/null
PA=$(sql "select id from proposals where couple_id = '$PAAR' and kind = 'neue_aktion' and status = 'offen'" | feld "[0].id")
post tok-kb "proposals/$PA/vote" '{"antwort":true}' > /dev/null
pruefe "Die Aktion läuft" "$(zahl "select count(*) as n from aktionen where couple_id = '$PAAR' and created_by = 'u-ka'")" "1"
# Offen: eine Meldung von Anna, ein Vorschlag von Anna, ein Vorschlag von Ben mit Annas Ja.
post tok-ka claims "{\"questId\":\"$Q\"}" > /dev/null
post tok-ka proposals "{\"art\":\"quest_points\",\"zielId\":\"$Q\",\"wert\":9}" > /dev/null
post tok-kb proposals "{\"art\":\"quest_points\",\"zielId\":\"$QB\",\"wert\":7}" > /dev/null
PB=$(sql "select id from proposals where couple_id = '$PAAR' and created_by = 'u-kb' and status = 'offen'" | feld "[0].id")
pruefe "Bens Vorschlag wartet auf Anna" "$(sql "select status from proposals where id = '$PB'" | feld "[0].status")" "offen"
BEN_VORHER=$(get tok-kb state | feld ".ich.punkte")

echo "== Was passieren würde"
V=$(get tok-ka konto/vorschau)
pruefe "Nicht die letzte Erwachsene" "$(echo "$V" | feld ".letzteErwachsene")" "false"
pruefe "Ben bleibt" "$(echo "$V" | rech "d.andere.join()")" "Ben"
pruefe "Ben verwaltet dann" "$(echo "$V" | feld ".nachfolge")" "Ben"
pruefe "Verlassen ginge" "$(echo "$V" | feld ".kannGehen")" "true"

echo "== Nur mit „löschen“ und nur mit POST"
pruefe "GET löscht nicht" "$(get tok-ka konto/loeschen | feld ".fehler")" "Nur mit POST"
pruefe "Ohne Wort nicht" "$(post tok-ka konto/loeschen '{}' | feld ".fehler")" "Zum Löschen bitte „löschen“ eintippen"
pruefe "Falsches Wort nicht" "$(post tok-ka konto/loeschen '{"bestaetigung":"loeschen"}' | feld ".fehler")" "Zum Löschen bitte „löschen“ eintippen"
pruefe "Anna gibt es noch" "$(zahl "select count(*) as n from users where id = 'u-ka'")" "1"
KOPF=$("${CURL[@]}" -D - -o /dev/null -H "Cookie: hq_sitzung=tok-ka" -H "$J" -d '{"bestaetigung":" Löschen "}' "$B/konto/loeschen")
pruefe "Gelöscht, die Sitzung endet" "$(echo "$KOPF" | grep -ci '^set-cookie: hq_sitzung=;')" "1"

echo "== Anna ist weg"
pruefe "Kein Konto mehr" "$(zahl "select count(*) as n from users where id = 'u-ka'")" "0"
pruefe "Keine Sitzung mehr" "$(get tok-ka state | feld ".angemeldet")" "false"
pruefe "Keine Buchungen mehr" "$(zahl "select count(*) as n from ledger where member_id = 'u-ka'")" "0"
pruefe "Keine Meldungen mehr" "$(zahl "select count(*) as n from claims where claimed_by = 'u-ka'")" "0"
pruefe "Keine Anträge mehr" "$(zahl "select count(*) as n from requests where requested_by = 'u-ka'")" "0"
pruefe "Keine Nachrichten mehr" "$(zahl "select count(*) as n from ereignisse where user_id = 'u-ka'")" "0"
pruefe "Ihr offener Vorschlag ist weg" "$(zahl "select count(*) as n from proposals where couple_id = '$PAAR' and kind = 'quest_points' and target_id = '$Q'")" "0"
pruefe "Ihr Geschenk an Ben bleibt" "$(sql "select from_member as f from transfers where id = '$T1'" | rech "d[0].f.startsWith('ehemalig-')")" "true"
pruefe "Bens Geschenk an sie ist weg" "$(zahl "select count(*) as n from transfers where id = '$T2'")" "0"

echo "== Bei Ben bleibt alles, ohne Annas Namen"
pruefe "Bens Cleanies unverändert" "$(get tok-kb state | feld ".ich.punkte")" "$BEN_VORHER"
pruefe "Ben ist allein" "$(get tok-kb state | feld ".mitglieder.length")" "1"
pruefe "Ben verwaltet" "$(get tok-kb state | feld ".haushalt.ichVerwalte")" "true"
pruefe "Plätze: einer weniger" "$(get tok-kb state | feld ".haushalt.groesse")" "1"
PL=$(sql "select decided_by as d from claims where id = '$MB'" | feld "[0].d")
pruefe "Bens Meldung bleibt bestätigt" "$(sql "select status from claims where id = '$MB'" | feld "[0].status")" "bestaetigt"
pruefe "… von einem Platzhalter" "${PL:0:9}" "ehemalig-"
pruefe "Der Platzhalter hat keinen Namen und keine E-Mail" "$(sql "select name, email from users where id = '$PL'" | rech "d[0].name + '|' + d[0].email")" "Ehemaliges Mitglied|"
pruefe "Der Platzhalter ist in keinem Haushalt" "$(zahl "select count(*) as n from members where user_id = '$PL'")" "0"
pruefe "Die Aktion läuft weiter" "$(sql "select created_by as c from aktionen where couple_id = '$PAAR'" | rech "d.length + ' ' + d[0].c.startsWith('ehemalig-')")" "1 true"
pruefe "Annas Name aus Bens Buchung" "$(sql "select reason from ledger where id = 'test-name-$PAAR'" | feld "[0].reason")" "Kino (von einem ehemaligen Mitglied)"
pruefe "Kein „Anna“ in Bens Buchungen" "$(zahl "select count(*) as n from ledger where member_id = 'u-kb' and reason like '%Anna%'")" "0"
pruefe "Ben bekommt Bescheid" "$(zahl "select count(*) as n from ereignisse where user_id = 'u-kb' and titel = 'Anna ist nicht mehr dabei'")" "1"
pruefe "Sonst kein „Anna“ in Bens Nachrichten" "$(zahl "select count(*) as n from ereignisse where user_id = 'u-kb' and titel <> 'Anna ist nicht mehr dabei' and (titel like '%Anna%' or text like '%Anna%')")" "0"
pruefe "Bens Vorschlag: jetzt reicht sein Ja" "$(sql "select status from proposals where id = '$PB'" | feld "[0].status")" "bestaetigt"
pruefe "Der Fair-Bericht läuft" "$(get tok-kb "fair?zeitraum=monat" | rech "d.personen.map(p => p.name).join()")" "Ben"

echo "== Geht auch Ben, geht der Platzhalter mit"
pruefe "Ben löscht als Letzter" "$(post tok-kb konto/loeschen '{"bestaetigung":"löschen"}' | feld ".haushaltWeg")" "true"
pruefe "Kein Platzhalter bleibt zurück" "$(zahl "select count(*) as n from users where id like 'ehemalig-$PAAR-%'")" "0"

echo "== Haushalt verlassen: Carl geht aus der WG, Dora bleibt"
CODE=$(post tok-kc haushalt/einrichten '{"name":"Carl","art":"wg","personen":2}' | feld ".code")
post tok-kd pair/join "{\"code\":\"$CODE\"}" > /dev/null
WG=$(sql "select couple_id as c from members where user_id = 'u-kc'" | feld "[0].c")
post tok-kc claims "{\"questId\":\"$(get tok-kc state | feld ".quests[0].id")\"}" > /dev/null
pruefe "GET verlässt nicht" "$(get tok-kc haushalt/verlassen | feld ".fehler")" "Nur mit POST"
pruefe "Carl geht" "$(post tok-kc haushalt/verlassen '{}' | feld ".ok")" "true"
pruefe "Carls Konto bleibt" "$(zahl "select count(*) as n from users where id = 'u-kc'")" "1"
pruefe "… ohne Haushalt" "$(get tok-kc state | feld ".eingerichtet")" "false"
pruefe "Seine offene Meldung ist weg" "$(zahl "select count(*) as n from claims where claimed_by = 'u-kc'")" "0"
pruefe "Dora bleibt" "$(get tok-kd state | feld ".mitglieder.length")" "1"
pruefe "Dora verwaltet jetzt" "$(get tok-kd state | feld ".haushalt.ichVerwalte")" "true"
pruefe "Carl gründet neu" "$(post tok-kc haushalt/einrichten '{"name":"Carl","art":"paar"}' | rech "!!d.code")" "true"
pruefe "Ohne Haushalt kein Verlassen" "$(post tok-kh haushalt/verlassen '{}' | feld ".fehler")" "Noch kein Haushalt eingerichtet"

echo "== Eva, letzte Erwachsene, mit Lena (ohne Handy) und Jule (jugendlich)"
CODE=$(post tok-ke haushalt/einrichten '{"name":"Eva","art":"familie","erwachsene":1,"kinder":2}' | feld ".code")
post tok-kf pair/join "{\"code\":\"$CODE\"}" > /dev/null
post tok-kf profil '{"name":"Jule"}' > /dev/null
post tok-ke mitglieder/u-kf/jugendlich '{"ja":true}' > /dev/null
LENA=$(post tok-ke kinder '{"name":"Lena","tier":"🦊","stufe":"ohne","einwilligung":true}' | feld ".id")
FAM=$(sql "select couple_id as c from members where user_id = 'u-ke'" | feld "[0].c")
V=$(get tok-ke konto/vorschau)
pruefe "Die letzte Erwachsene" "$(echo "$V" | feld ".letzteErwachsene")" "true"
pruefe "Lena wird genannt" "$(echo "$V" | rech "d.kinder.join()")" "$LENA"
pruefe "Jule auch" "$(echo "$V" | rech "d.jugendliche.join()")" "Jule"
pruefe "Gehen geht nicht" "$(echo "$V" | feld ".kannGehen")" "false"
pruefe "Verlassen verweigert" "$(post tok-ke haushalt/verlassen '{}' | feld ".fehler")" "Als letzte erwachsene Person kannst du nicht gehen — die Kinder stünden sonst allein da"
pruefe "Nicht aus der Kinderansicht" "$(post tok-ke konto/loeschen "{\"bestaetigung\":\"löschen\",\"alsKind\":\"$LENA\"}" | feld ".fehler")" "Das geht in der Kinderansicht nicht"
pruefe "Eva löscht" "$(post tok-ke konto/loeschen '{"bestaetigung":"löschen"}' | feld ".haushaltWeg")" "true"
pruefe "Der Haushalt ist weg" "$(zahl "select count(*) as n from couples where id = '$FAM'")" "0"
pruefe "Lenas Profil ist weg" "$(zahl "select count(*) as n from users where id = '$LENA'")" "0"
pruefe "Evas Konto ist weg" "$(zahl "select count(*) as n from users where id = 'u-ke'")" "0"
pruefe "Jule behält ihr Konto" "$(zahl "select count(*) as n from users where id = 'u-kf'")" "1"
pruefe "… ohne Haushalt" "$(get tok-kf state | feld ".eingerichtet")" "false"
pruefe "Nichts bleibt vom Haushalt" "$(zahl "select (select count(*) from quests where couple_id = '$FAM') + (select count(*) from ledger where couple_id = '$FAM') + (select count(*) from ereignisse where couple_id = '$FAM') as n")" "0"

echo "== Jugendliche gehen selbst"
CODE=$(post tok-ki haushalt/einrichten '{"name":"Ina","art":"familie","erwachsene":1,"kinder":1}' | feld ".code")
post tok-kj pair/join "{\"code\":\"$CODE\"}" > /dev/null
post tok-ki mitglieder/u-kj/jugendlich '{"ja":true}' > /dev/null
pruefe "Vorher ein Kind" "$(get tok-ki state | feld ".haushalt.kinder")" "1"
pruefe "Der Jugendliche geht" "$(post tok-kj haushalt/verlassen '{}' | feld ".ok")" "true"
pruefe "Ina bleibt, ohne Kind" "$(get tok-ki state | rech "d.mitglieder.length + ' ' + d.haushalt.kinder")" "1 0"

echo "== Allein"
post tok-kg haushalt/einrichten '{"name":"Gabi","art":"paar"}' > /dev/null
ALLEIN=$(sql "select couple_id as c from members where user_id = 'u-kg'" | feld "[0].c")
pruefe "Allein verlassen: der Haushalt geht" "$(post tok-kg haushalt/verlassen '{}' | feld ".haushaltWeg")" "true"
pruefe "… das Konto bleibt" "$(zahl "select count(*) as n from users where id = 'u-kg'")" "1"
pruefe "Der Haushalt ist weg" "$(zahl "select count(*) as n from couples where id = '$ALLEIN'")" "0"
pruefe "Ohne Haushalt löschen geht auch" "$(post tok-kg konto/loeschen '{"bestaetigung":"löschen"}' | feld ".ok")" "true"
pruefe "Gabi ist weg" "$(zahl "select count(*) as n from users where id = 'u-kg'")" "0"

echo
[ "$fehler" = 0 ] && echo "ALLES GRÜN" || echo "$fehler Fehler"
exit $fehler
