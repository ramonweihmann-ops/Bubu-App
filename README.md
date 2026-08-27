# Haus-Quest

Punktekonto für einen Haushalt. Aufgaben („Quests“) haben einen **vorher festgelegten**
Punktwert. Wer eine erledigt, meldet sie — gutgeschrieben wird sie erst, wenn **jemand
anderes bestätigt**. Punktwerte ändern sich nie im Alleingang, sondern nur über eine
**Abstimmung**, der **alle** zustimmen.

Ob Pärchen, WG, Familie oder etwas anderes: der Haushalt hat einen Typ und so viele
Plätze, wie ihr braucht.

Grundlage ist die Reinigungsquest-Tabelle (22 Quests, 11 Belohnungen, zwei Konten).

Eigenes Projekt mit eigener Datenbasis — bewusst getrennt von allen anderen Projekten.

- **Mockup:** [`docs/mockup.html`](./docs/mockup.html) — im Browser öffnen, der Prototyp oben ist antippbar.
- **Mockup „Erster Start":** [`web/mockup/`](./web/mockup) — live unter `haus-quest.com/mockup/`.
  Der Entwurf, aus dem die Einrichtung entstanden ist.
- **Mockup „Wiederkehrende Aufgaben":** [`web/mockup-plan/`](./web/mockup-plan) — live unter
  `haus-quest.com/mockup-plan/`. Der Entwurf, aus dem der Haushaltsplan entstanden ist.
- **Mockup „Quest-Liste mit Cleanies":** [`web/mockup-quests/`](./web/mockup-quests) — live unter
  `haus-quest.com/mockup-quests/`. Drei Entwürfe für den Cleanies-Chip; gewählt wurde C.
- **Mockup „Urlaubsmodus":** [`web/mockup-urlaub/`](./web/mockup-urlaub) — live unter
  `haus-quest.com/mockup-urlaub/`. Der Entwurf, aus dem der Urlaubsmodus entstanden ist.
- **Mockup „Zurücktreten":** [`web/mockup-ruecktritt/`](./web/mockup-ruecktritt) — live unter
  `haus-quest.com/mockup-ruecktritt/`. Der Entwurf, aus dem der Rücktritt entstanden ist.
- **Mockup „Jubel nach Cleanies-Phasen":** [`web/mockup-animationen/`](./web/mockup-animationen) —
  live unter `haus-quest.com/mockup-animationen/`. Alle dreißig Animationen laufen dort echt;
  noch nicht in der App verdrahtet.
- **Tests:** [`tests/`](./tests) — alle Regressionssuiten, `bash tests/alle.sh` spielt sie durch.
- **Einrichtung:** [`docs/SETUP.md`](./docs/SETUP.md) — Schritt für Schritt, was zu klicken ist.
- **Google-Login:** [`docs/google-login.md`](./docs/google-login.md) — die neue Google Auth Platform, Klick für Klick.
- **Geplant:** [`docs/naechste-schritte.md`](./docs/naechste-schritte.md) — Dashboard mit Prognose, Rabatte, doppelte Punkte.
- **Datenbank:** [`d1/migrations/`](./d1/migrations) — Tabellen und Regeln, als Migrationen.

---

## Die drei Regeln

| Regel | Bedeutung |
| --- | --- |
| Preis steht vorher | Beim Melden wird der aktuelle Punktwert eingefroren. Spätere Änderungen wirken nie rückwirkend. |
| Vier Augen | Melden darf jeder, freigeben nur jemand **anderes**. Wer meldet, kann nie selbst bestätigen — sonst reicht eine beliebige andere Person aus dem Haushalt. |
| Nur gemeinsam | Punktwert ändern, Quest oder Belohnung anlegen **oder löschen**, Aktion starten: nur mit Zustimmung **aller**. Ein Nein lässt alles beim Alten, eine fehlende Stimme hält den Vorschlag offen. |

Die Übernahme selbst — neuer Punktwert, neuer Eintrag, Löschung, Aktion — passiert in derselben
Transaktion wie das Schließen der Abstimmung: entweder beides oder nichts. Sollte eine Abstimmung
doch einmal trotz vollständiger Zustimmung offen stehen bleiben, zieht die App sie beim nächsten Laden nach.

Die zweite Regel ist keine Frage der Oberfläche, sondern der Datenbank: Wer eine eigene Meldung
bestätigen will, bekommt einen Fehler — nicht weil ein Knopf versteckt ist, sondern weil die
Datenbank es abweist (CHECK in der Tabelle und Prüfung in `worker/api.js`). Punktestände werden nirgends
gespeichert, sondern aus allen Buchungen berechnet.

## Aufbau

```
haus-quest.com          →  Seite mit dem Installationsknopf
haus-quest.com/app      →  die App (Web-App zum Anheften, PWA)
haus-quest.com/api/…    →  Worker: prüft, wer fragt, und setzt die Regeln durch
                            D1: Quests, Meldungen, Buchungen
```

| Baustein | Technik | Kosten |
| --- | --- | --- |
| Website + App | Cloudflare Workers (statische Dateien) | 0 € |
| API und Regeln | derselbe Worker unter `/api` | 0 € |
| Datenbank | Cloudflare D1 (SQLite) | 0 € |
| Anmeldung | Google OAuth, Sitzung im Worker | 0 € |
| Benachrichtigungen | Web Push (VAPID), Schlüsselpaar erzeugt sich selbst | 0 € |
| Domain | beliebiger Registrar | ~5–12 €/Jahr |

Warum nicht Supabase: Der kostenlose Rahmen erlaubt zwei aktive Projekte pro Konto, und die
sind hier bereits belegt. Das fertige Postgres-Schema liegt für den Fall der Fälle unter
[`supabase/schema.sql`](./supabase/schema.sql) bereit — Details im
[Anhang der Einrichtung](./docs/SETUP.md#anhang-supabase-variante).

## Erster Start

Beim allerersten Öffnen läuft die Einrichtung — genau einmal:

1. **Name und Bild.** Vorname oder Spitzname frei wählbar, Google schlägt nur vor. Dazu
   eine der Figuren, ein Zeichen oder ein eigenes Foto.
2. **Begrüßung.** Von hier führt auch der Weg für alle, die eingeladen wurden: *Ich wurde
   eingeladen — Code eingeben*.
3. **Haushalt.** WG, Familie, Pärchen oder Sonstige, dazu die Zahl der Teilnehmer — bei
   einer Familie getrennt nach Erwachsenen und Kindern. Pärchen sind meist zwei, dürfen
   aber mehr sein.
4. **Räume.** Vorschläge zum Antippen, Eigenes dazu.
5. Zwei Erklärseiten, dann **Jetzt starten** und die Einladecodes.

Der Code gilt 24 Stunden und bleibt gültig, solange noch Plätze frei sind — in einer WG
kommen nicht alle in derselben Minute.

## Rollen

| Wer | Darf |
| --- | --- |
| Alle | Melden, bestätigen, beantragen, übertragen, abstimmen, Räume pflegen, Quests einem Raum zuordnen. Kinder eingeschlossen. |
| Verwalter | Zusätzlich: einladen, Haushaltstyp und Plätze ändern. Wer einrichtet, verwaltet; in einer Familie können das mehrere Erwachsene sein. |

Am täglichen Gebrauch ändert die Rolle nichts. Sie regelt nur das, was sonst niemand
allein tun sollte.

## Bilder

Jede Person hat ein eigenes Bild: eine der mitgelieferten Figuren, ein Zeichen — oder ein
Foto vom Handy. Das Foto wird **vor** dem Hochladen quadratisch zugeschnitten und auf 256
Pixel verkleinert; alles, was sonst in einer Fotodatei steckt (Ort, Uhrzeit, Kameramodell),
bleibt dabei auf der Strecke. Änderbar in den Einstellungen, jederzeit, ohne Abstimmung.

## Räume

Die Räume sind die Kategorien der Quests: danach wird sortiert, gefiltert und gesucht, und
daran hängt auch eine Aktion wie „+100 % auf Küche“. Pflegen darf sie jeder — das ist
Ordnung, nicht Punktesache. Ein umbenannter Raum zieht seine Quests mit; ausblenden geht
erst, wenn keine Quest mehr darin liegt.

Eine Quest in einen anderen Raum zu schieben geht über den **Stift** in der Liste und
braucht keine Abstimmung — am Punktwert ändert sich dabei nichts.

## Anmeldung

Google Sign-In — kein eigenes Passwort, keine Registrierung. Übernommen werden Name, E-Mail
und Profilbild. Wer den Namen in den Einstellungen ändert, behält ihn: die nächste Anmeldung
lässt ihn dann in Ruhe.

Ein Konto gehört zu genau einem Haushalt — das erzwingt die Datenbank. Wie viele Personen
ein Haushalt hat, steht in seinen Einstellungen und lässt sich jederzeit ändern.

## Trennung von anderen Projekten

| Ebene | Trennung |
| --- | --- |
| Repository | Eigenes Repo, eigener Verlauf, eigene Releases. |
| Datenbank | Eigene D1-Instanz, ausschließlich für diese App. Kein geteiltes Schema, keine geteilten Tabellen. |
| Nutzerkonten | Eigene Sitzungsverwaltung. Eine Anmeldung anderswo gilt hier nicht und umgekehrt. |
| Schlüssel | Eigene Secrets in diesem Repo. Kein Schlüssel wandert zwischen Projekten. |
| Hosting | Eigenes Cloudflare-Projekt unter eigener Domain. |

## Wie die App aufs Handy kommt

Über die Domain: Seite öffnen, **App installieren** antippen, fertig. Danach liegt sie als
Symbol auf dem Startbildschirm, mit eigenem Fenster und Push-Benachrichtigungen — auf Android
kaum von einer Store-App zu unterscheiden. Kein Store, keine Gebühr, keine Installationsdatei
zum Verschicken, und Updates sind sofort bei beiden.

Falls es später doch in den Play Store soll: Dieselbe App lässt sich mit Bubblewrap in eine APK
verpacken, ohne den Code neu zu schreiben. Das Google-Entwicklerkonto kostet einmalig 25 US-Dollar.

## Figuren und Namen

Fuchs und Wolf liegen als Bilddateien in `web/` (`logo.webp`, `fox.webp`, `wolf.webp`) und
in `docs/assets/`. Sie können bleiben oder in einem Zug getauscht werden. Das **App-Symbol**
in `web/icons/` ist davon unabhängig: es entsteht aus `docs/assets/grafik.png` und zeigt
beide Figuren nebeneinander.
Der Name **Haus-Quest** ist beschreibend und übersteht einen Verkauf; privat heißt die App
weiterhin Bubu App.

## Listen bedienen

Quests und Belohnungen haben oben ein Suchfeld (Groß- und Kleinschreibung sowie Umlaute egal),
darunter Sortierung nach **meist genutzt**, **Punkten** oder **Alphabet** — die aktive
Sortierung kehrt beim erneuten Tippen ihre Richtung um. Bei den Quests bleibt darunter der
Filter nach Kategorie.

Jeder Eintrag hat einen **Stift**, der ein Menü mit *Ändern* und *Löschen* öffnet. Beides geht
weiterhin nur über die Abstimmung. Zwei getrennte Symbole je Zeile wären auf dem Handy zu
kleine Ziele, und Löschen soll nicht direkt neben dem Melden liegen.

## Einstellungen

Das Zahnrad steht oben neben dem Verlauf, auf **Start** und auf **Wir**. Darunter liegen:

| Einstellung | Reicht wie weit |
| --- | --- |
| **Anzeigename** | Gilt für beide — der Name steht auch in der App des anderen. Ändern darf ihn jeder für sich allein, das ist keine Sache für eine Abstimmung. |
| **Dunkles Design** | Nur dieses Gerät. *System* folgt der Handy-Einstellung und wechselt mit ihr, *Hell* und *Dunkel* setzen sich darüber. |
| **Benachrichtigungen** | Nur dieses Gerät. Zeigt auch, wenn der Browser sie blockiert — dann hilft nur dessen Berechtigungsdialog. |

Der dunkle Satz ist dieselbe Marke mit getauschten Rollen: Navy als Grund, Weiß als Schrift.
Das Rot bleibt, wird aber für Schrift aufgehellt und für gefüllte Knöpfe vertieft — sonst
trägt weißer Text darauf nicht. Die Wahl liegt im Speicher des Browsers, nicht in der
Datenbank, und wird schon im Kopf der Seite gesetzt, damit beim Öffnen kein Weiß aufblitzt.

Die Fußleiste steht fest am unteren Rand: sie bleibt sichtbar, egal wie lang eine Liste ist.
Auf Unterseiten — Verlauf, Auswertung, Einstellungen — leuchtet weiter der Reiter, aus dem sie
hervorgehen, damit die Leiste nie erloschen wirkt.

## Haushaltsplan

Eine wiederkehrende Aufgabe ist **keine eigene Sorte, sondern eine Quest mit Rhythmus**.
Jede bestehende Quest lässt sich dazu machen — über den Stift, ohne sie neu anzulegen —
und genauso wieder zurück. Gemeldet und bestätigt wird sie wie jede andere Quest auch.

Der Plan zeigt alle Quests mit Rhythmus, zu finden auf der Startseite über der Auswertung;
ist etwas überfällig, springt eine rote Karte davor.

| Sache | Wie es läuft |
| --- | --- |
| **Rhythmus** | *1× pro Woche* bis *1× im Quartal*. Daraus folgt alles Weitere. |
| **Umstellen** | Stift an der Quest → *Wiederkehrende Aufgabe daraus machen*. Geht über dieselbe Abstimmung wie alles andere, und *Keine wiederkehrende Aufgabe mehr* macht es rückgängig — die Quest bleibt dabei bestehen. |
| **Sperre** | Nach dem Erledigen springt das Fälligkeitsdatum um genau den Rhythmus nach vorn. Bis dahin kann sie niemand noch einmal melden. Für besondere Umstände gibt es **Trotzdem erledigen** — mit Begründung, und jemand anderes muss trotzdem bestätigen. |
| **Punkte** | Ganz normal: melden, jemand anderes bestätigt, dann gibt es sie. |
| **Bewerbung** | Bewerben kann sich jeder. Einen Tag vor Fälligkeit friert die App die Reihenfolge ein und zeigt allen Bewerbern dieselbe Liste. |
| **Reihenfolge** | Wer am wenigsten **am Stück** dran war, steht oben. Bei Gleichstand die kleinere Jahreszahl. Wer zuletzt dran war, rutscht nach unten — genau das sorgt für den Wechsel. |
| **Annehmen** | Nur wer oben steht. Ablehnen reicht an Platz 2 weiter; lehnen alle ab, ist die Aufgabe wieder für jeden offen. |
| **Ein Bewerber** | Bekommt sie ohne Rangliste. Bewirbt sich niemand, macht sie, wer sie macht. |
| **Zurücktreten** | Wem die Runde gehört, kann sie abgeben — mit Begründung. Darüber entscheidet eine **Mehrheit** des Haushalts, nicht alle. Geht sie durch, fällt die Zuteilung weg und die Runde ist wieder für jeden offen; **die Frist bleibt stehen**. Ein einzelnes Nein beendet den Antrag nicht, und wer ablehnt, darf sagen warum. |
| **Überfällig** | Ab dem ersten Tag Benachrichtigung an alle. Nach sieben Tagen verliert jeder den Punktwert der Aufgabe — abschaltbar unter Einstellungen → Haushalt. |

„Am Stück" kann nur die Person haben, die zuletzt dran war: sobald jemand anderes erledigt,
fängt der Zähler aller anderen wieder bei null an. Beide Zahlen stehen offen in der Aufgabe,
damit die Reihenfolge nachvollziehbar bleibt.

Anlegen, umstellen und zurückstellen geht wie alles andere nur über eine **Abstimmung**.

Vergabe, Mahnung und Strafe hängen am Kalender, nicht an einer Bedienung. Ein **Cron**
weckt den Worker deshalb jeden Morgen um 6 Uhr UTC und zieht sie für alle Haushalte nach;
beim Laden der App passiert dasselbe noch einmal. Doppelt schadet nicht, weil jeder Schritt
am Fälligkeitsdatum festhält, dass er gelaufen ist.

## Urlaubsmodus

Zwei Dinge, die beide „Urlaub" heißen. Beide beschließt der Haushalt gemeinsam, beide
stehen unter **Einstellungen → Urlaubsmodus**, und beide lassen sich vorzeitig beenden,
ohne noch einmal abzustimmen — früher zurück zu sein ist nie ein Vorteil.

| | **Nur eine Person** | **Der ganze Haushalt** |
| --- | --- | --- |
| Fälligkeiten | bleiben stehen | rücken um die Urlaubstage nach hinten |
| Mahnungen | gehen an alle anderen | fallen weg, solange er läuft |
| Gruppenstrafe | die Person zahlt nicht mit; die Anwesenden zahlen deshalb **nicht mehr**, sondern weiter nur ihren eigenen Anteil | fällt weg, solange er läuft |
| Rangliste | die Person wird übersprungen | ruht |
| Melden, Belohnungen, Cleanies senden | unberührt | unberührt |
| Beenden | die Person selbst | wer ihn vorgeschlagen hat, oder die Verwaltung |

Ein Rückstand wird beim Haushaltsurlaub **verschoben, nicht erlassen**: was vorher überfällig
war, ist es danach wieder, mit demselben Abstand. Sonst wäre „kurz vor dem Urlaub nichts mehr
machen" eine Strategie. Wird erst mitten im Urlaub abgestimmt, verschiebt die App nur noch die
verbleibenden Tage — sonst bekäme der Plan Tage geschenkt, die längst vorbei sind.

Die Zähler „am Stück" und „dieses Jahr" laufen im Urlaub nicht weiter, weil sie aus den
Meldungen kommen. Wer zurückkommt, steht also nicht schlechter da als vorher.

## Was von mir noch offen ist

Auf der Startseite steht unter **Wartet auf …** alles, was ich losgeschickt habe und was noch
niemand entschieden hat: gemeldete Quests, beantragte Belohnungen samt Terminwunsch und
angebotene Übertragungen. Steht dazu eine Rückfrage, sagt die Zeile das ebenfalls.

## Rückfragen

Auf eine Meldung oder einen Antrag gab es lange nur Ja oder Nein. Passt bloß der Termin
nicht, ist beides falsch. Deshalb steht im Prüfen-Stapel ein dritter Weg: **Nachfragen**.

Der Antrag bleibt dabei offen — er wird weder genehmigt noch abgelehnt. Die Frage hängt
daran, samt Terminvorschlag; wer den Antrag gestellt hat, sieht sie auf der Startseite,
antwortet und schickt ihn erneut. Danach steht er wieder zur Entscheidung.

## Belohnungen: zugesagt ist noch nicht erhalten

Nach der Genehmigung sind die Punkte weg — die Belohnung selbst kommt erst noch. Deshalb
bestätigt, **wer sie eingelöst hat**, dass sie tatsächlich kam.

| Fall | Was passiert |
| --- | --- |
| **Bekommen** | Fertig. |
| **Kam nicht** | Wer zugesagt hat, verliert denselben Betrag. Die Einlösung wird nicht rückgängig gemacht: bezahlt und nichts bekommen ist der Schaden, deshalb steht die Strafe auf der anderen Seite. |
| **Doch noch geliefert** | Binnen **drei Tagen** kann die zusagende Person *Habe ich nachgeholt* melden. Bestätigt der Empfänger, sind die Punkte wieder da. Danach ist es endgültig. |

Ausnahme- und Vetoanträge haben nichts zu liefern — für sie entfällt die Bestätigung.
Beim Anlegen oder Ändern einer Belohnung steht dafür ein Haken bereit, der wie alles
andere über eine Abstimmung gesetzt wird.

### Cleanies an den Empfänger

Normalerweise sind die Cleanies einer Einlösung danach einfach weg. Für „ich koche heute für
dich" ist das falsch herum: wer die Belohnung erbringt, soll sie auch bekommen können.

Im Antrag steht deshalb ein Haken **Cleanies an Empfänger senden**. Ist er gesetzt, wird der
Betrag bei der Genehmigung nicht nur abgebucht, sondern der gewählten Person gutgeschrieben —
beides in derselben Transaktion. Neben *Konto nach Einlösung* erscheint dann eine zweite
Zeile mit dem alten und neuen Stand dieser Person.

Wer mehr als eine Person im Haushalt hat, wählt zusätzlich aus, wer sie bekommt. Bei genau
einer anderen Person entfällt die Wahl — es gibt nur eine Möglichkeit.

Der Haken wird **nie gemerkt**: jeder Antrag fängt wieder ohne an. Sich selbst gutschreiben
geht nicht, und wer nicht zum Haushalt gehört, auch nicht. Bleibt die Belohnung aus, greift
dieselbe Regel wie sonst — wer zugesagt hat, verliert den Betrag wieder.

## Auswertung

Punkte je Tag der letzten zwei Wochen als Balken — du und alle anderen zusammen, dazu
Hochrechnungen auf Woche und Monat aus dem Schnitt der letzten sieben Tage. Gezählt wird nur,
was durch **bestätigte Quests** hereinkam — Übertragungen und Einlösungen sind Bewegungen,
kein Verdienst.

Der Tag beginnt dort, wo die Person wohnt: die App schickt ihren Zeitversatz mit, damit eine
Meldung um 23 Uhr nicht auf den Folgetag rutscht.

## Aktionen

Befristete Zeiträume, die nur gemeinsam starten — über dieselbe Abstimmung wie alles andere:

- **Doppelte Punkte** auf Quests, wahlweise für alle oder nur für einen Raum
  („+100 % auf Küche, diese Woche“)
- **Rabatt** auf Belohnungen, in Prozent

Der Faktor greift beim **Melden** bzw. beim **Stellen des Antrags** — dort friert der Wert ein.
Wer während der Aktion meldet, behält den erhöhten Wert, auch wenn erst danach bestätigt wird;
wer vorher gemeldet hat, bekommt nichts nachträglich. Damit bleibt die Grundregel unangetastet:
der Preis steht fest, bevor gearbeitet wird — und niemand hat einen Grund, Meldungen
zurückzuhalten.

## Benachrichtigungen

Jede Entscheidung erreicht die andere Person auf zwei Wegen:

- **Push aufs Handy**, auch bei geschlossener App. Das Schlüsselpaar (VAPID) erzeugt der Worker
  beim ersten Versand selbst und legt es in der Datenbank ab — es ist nichts von Hand zu hinterlegen.
- **Ein gemerktes Ereignis** in der Datenbank. Beim nächsten Öffnen zeigt die App den
  Vollbild-Moment nach — auch wenn die Push-Nachricht nie ankam oder weggewischt wurde.

Der Vollbild-Moment erscheint dadurch bei **beiden**: beim Prüfenden sofort nach dem Tippen,
beim Melder, sobald er die App das nächste Mal öffnet. Zustimmung feiert mit Konfetti und
hochzählenden Punkten, eine Ablehnung wird ruhig gezeigt.

## Aufbau des Codes

```
web/            Startseite mit Installationsknopf, Symbole, Service Worker
web/app/        Die App selbst (index.html, app.css, app.js) — ohne Bauschritt
worker/         Schnittstelle: index.js (Router und Wecker), auth.js (Google),
                api.js (Regeln), plan.js (Quests mit Rhythmus),
                rueckmeldung.js (Rückfragen, Empfang, Strafe, Zurückziehen),
                urlaub.js (Urlaubsmodus),
                melden.js und push.js (Benachrichtigungen)
d1/migrations/  Datenbank: Tabellen, Ansichten, Änderungsschritte
tests/          Regressionssuiten: API über curl, Oberfläche über Playwright
docs/           Mockup und Anleitungen
```
