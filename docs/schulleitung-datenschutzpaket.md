# AzubiCheck - Unterlage fuer Schulleitung und Datenschutzpruefung

Stand: 20.07.2026

## 1. Kurzfassung

AzubiCheck ist eine Web-Anwendung zur digitalen Erfassung und Auswertung von Anwesenheiten und Fehlzeiten in Bildungsgang- bzw. Kursgruppen.

Ziel ist ein zeitnaher Beta-Test im Schulalltag. Auszubildende melden sich an Unterrichtstagen digital an und ab. Lehrkraefte, Verwaltung und Administratoren koennen Anwesenheiten, Fehlzeiten und Korrekturen je nach Rolle einsehen und verwalten.

Vor einem Test mit Echtdaten sollte die Schulleitung gemeinsam mit dem behördlichen Datenschutzbeauftragten klaeren, ob und unter welchen Bedingungen AzubiCheck eingesetzt werden darf.

## 2. Zweck des Systems

AzubiCheck soll folgende schulorganisatorische Aufgaben erleichtern:

- Erfassung von Anwesenheiten in Theoriephasen
- Dokumentation von Fehlzeiten und Teilfehlzeiten
- Anzeige von Soll-Stunden, Ist-Stunden und Fehlstunden
- Zuordnung von Auszubildenden zu Kursen
- Zuordnung von Lehrkraeften zu Kursen
- Rollenbasierte Einsicht fuer Admin, Verwaltung, Lehrkraefte und Auszubildende
- Erstellung von Fehlzeitenberichten fuer einzelne Auszubildende oder Kurse
- Nachtraegliche Korrektur durch berechtigte Personen, z. B. bei vergessenem Handy, frueherem Unterrichtsende oder manuellen Fehlzeiten

## 3. Aktueller Funktionsumfang der Beta

### Auszubildende

- Account-Erstellung und Anmeldung
- Kurszuordnung
- Button "Anmelden" bzw. nach erfolgter Anmeldung "Abmelden"
- Anzeige der eigenen Check-in-Zeit
- Anzeige der eigenen Fehlzeiten
- QR-Code-Scan fuer Anwesenheitsvorgaenge

### Lehrkraefte

- Einsicht in zugewiesene Kurse
- Anzeige der Auszubildenden eines Kurses
- Sortierung und Suche nach Namen
- Anzeige von Soll-, Ist- und Fehlstunden
- Detailansicht einzelner Auszubildender
- Nachtragen von Anwesenheiten
- Eintragen einzelner Fehlzeiten
- Korrektur von Teilfehlzeiten
- Sammelkorrekturen fuer Kurstage, wenn viele oder alle Auszubildenden betroffen sind
- Erstellung von Fehlzeitenberichten fuer Kurs oder einzelne Auszubildende

### Verwaltung

- Einsicht in alle Kurse und Auszubildenden
- Suche ueber alle Accounts
- Rollen- und Kursverwaltung
- Verwaltung von Lehrkraeften und Auszubildenden
- Fehlzeitenberichte und Korrekturen

### Admin

- Vollzugriff auf Verwaltung, Rollen, Kurse und Korrekturen
- Passwort-Reset-Funktion
- Account- und Rollenverwaltung

## 4. Verarbeitete personenbezogene Daten

Nach aktuellem Stand werden bzw. koennen folgende Daten verarbeitet werden:

- Vorname und Nachname
- E-Mail-Adresse
- Rolle im System: Auszubildender, Lehrkraft, Verwaltung, Admin
- Kurszuordnung
- Anwesenheitsdatum
- Check-in-Zeit
- Check-out-Zeit
- errechnete Anwesenheitsstunden
- Fehlzeiten und Teilfehlzeiten
- manuelle Korrekturen durch berechtigte Personen
- technische Account-ID aus Firebase Authentication

Nicht vorgesehen:

- Speicherung von Passwoertern im Klartext
- Speicherung von biometrischen Face-ID-Daten in der Anwendung
- Noten, Leistungsdaten, Gesundheitsdaten oder Entschuldigungsgruende

Wichtig: Falls Face-ID bzw. WebAuthn genutzt wird, muss sauber dokumentiert werden, dass biometrische Daten nicht an AzubiCheck uebertragen oder dort gespeichert werden, sondern lokal auf dem Geraet verbleiben.

## 5. Rollen- und Berechtigungskonzept

### Auszubildende

Auszubildende sollen nur die eigenen Daten sehen:

- eigene Fehlzeiten
- eigene Anwesenheitsdaten
- eigener Kurs

### Lehrkraefte

Lehrkraefte sollen nur Daten der ihnen zugewiesenen Kurse sehen:

- Kursliste der zugewiesenen Kurse
- Auszubildende dieser Kurse
- Anwesenheits- und Fehlzeitdaten dieser Kurse
- Korrekturfunktionen fuer diese Kurse

### Verwaltung

Verwaltungsaccounts sollen schulorganisatorisch Zugriff auf alle Kurse und Auszubildenden erhalten:

- alle Auszubildenden
- alle Kurse
- Rollen- und Kurszuordnung
- Korrekturen und Berichte

### Admin

Admin-Accounts haben Vollzugriff:

- alle Daten und Funktionen
- Rollenvergabe
- Kursverwaltung
- Passwort-Reset
- technische Verwaltung

## 6. Datenschutzrechtlich zu klaerende Punkte

Vor Nutzung mit Echtdaten sollten folgende Punkte durch Schulleitung und Datenschutzbeauftragten geprueft werden:

- Ist der Zweck "Anwesenheits- und Fehlzeitverwaltung" durch den schulischen Auftrag gedeckt?
- Welche Rechtsgrundlage wird fuer die Verarbeitung genutzt?
- Ist eine Einwilligung ungeeignet, weil die Nutzung im Schulkontext nicht wirklich freiwillig waere?
- Welche Daten sind wirklich erforderlich?
- Welche Daten sollen bewusst nicht erhoben werden?
- Wie lange werden Anwesenheits- und Fehlzeitdaten gespeichert?
- Wer darf welche Daten sehen?
- Wie wird dokumentiert, wer Daten eingetragen, veraendert oder geloescht hat?
- Wie werden Betroffene informiert?
- Wie koennen Auszubildende Auskunft, Berichtigung oder Loeschung verlangen?
- Duerfen Firebase und Vercel fuer diesen Zweck eingesetzt werden?
- Liegen Vereinbarungen zur Auftragsverarbeitung vor?
- Gibt es Drittlanduebermittlungen ausserhalb des Europaeischen Wirtschaftsraums?
- Sind die technischen und organisatorischen Massnahmen ausreichend?
- Muss eine Datenschutz-Folgenabschaetzung vorgenommen werden?

## 7. Technische Anbieter

### Firebase / Google

Firebase wird aktuell fuer Authentifizierung und Datenbankfunktionen genutzt.

Zu pruefen:

- Abschluss bzw. Anerkennung der Firebase Data Processing and Security Terms
- Speicherort der Firestore-Daten
- Subunternehmer
- Drittlandtransfer
- Loesch- und Exportmoeglichkeiten
- Zugriffsschutz und Protokollierung

Offizielle Quelle:
https://firebase.google.com/terms/data-processing-terms

### Vercel

Vercel wird aktuell fuer das Hosting der Web-Anwendung genutzt.

Zu pruefen:

- Ob der genutzte Tarif eine passende Vereinbarung zur Auftragsverarbeitung abdeckt
- Hosting-Region und technische Verarbeitung
- Subunternehmer
- Logs und Aufbewahrungsfristen
- Drittlandtransfer

Offizielle Quelle:
https://vercel.com/legal/dpa

## 8. Datenschutzanforderungen fuer Schulen in NRW

Relevante Orientierung:

- Medienberatung NRW: Datenschutz und Informationssicherheit in Schulen
  https://www.medienberatung.schulministerium.nrw.de/de/themen/datenschutz_1/datenschutz_und_informationssicherheit.html

- Medienberatung NRW: Fragen zu Anwendungen, Apps und Programmen
  https://www.medienberatung.schulministerium.nrw.de/de/themen/datenschutz_1/anwendung/fragen_zur_dienstlichen_verarbeitung_personenbezogener_daten_auf_privaten_endgeraeten.html

- BASS NRW: Dienstanweisung fuer die automatisierte Verarbeitung personenbezogener Daten in der Schule
  https://bass.schule.nrw/17580.htm

Aus den genannten Anforderungen ergeben sich fuer AzubiCheck insbesondere:

- Verarbeitung nur durch berechtigte Personen
- Zugriff nur nach Aufgabenbereich
- Schutz vor unberechtigtem Zugriff
- Dokumentation des Verfahrens vor Nutzung mit Echtdaten
- Einbindung des behördlichen Datenschutzbeauftragten
- Vereinbarungen zur Auftragsverarbeitung bei Cloud-Diensten
- angemessene Absicherung bei moeglichen Drittlanduebermittlungen

## 9. Empfohlene Mindestmassnahmen vor dem Beta-Test

Vor einem echten Schulalltagstest sollte mindestens Folgendes erledigt sein:

- Freigabe der Schulleitung einholen
- Datenschutzbeauftragten einbinden
- Zweck und Rechtsgrundlage schriftlich festhalten
- Verzeichnis der Verarbeitungstaetigkeiten anlegen
- Datenkategorien und Rollenmodell dokumentieren
- Datenschutzhinweise fuer Auszubildende erstellen
- Zugriffskonzept pruefen
- Firestore-Sicherheitsregeln pruefen
- Admin-Accounts auf wenige Personen begrenzen
- Zwei-Faktor-Schutz fuer Firebase, Vercel und GitHub aktivieren
- Keine privaten oder geteilten Admin-Zugaenge verwenden
- Testphase zuerst mit Testdaten oder begrenztem Pilotkurs starten
- Loesch- und Aufbewahrungsfristen festlegen
- Vorgehen fuer Auskunft, Berichtigung und Loeschung festlegen
- Protokollierung von manuellen Aenderungen einplanen

## 10. Offene Punkte aus technischer Sicht

Diese Punkte sollten vor einem breiteren Einsatz noch umgesetzt oder abschliessend geprueft werden:

- Aenderungsprotokoll fuer manuelle Korrekturen: Wer hat wann was geaendert?
- Export- und Loeschkonzept fuer einzelne Auszubildende
- Endgueltige Datenschutzhinweise im System
- Festlegung der Aufbewahrungsfrist fuer Fehlzeitdaten
- Begrenzung der Admin-Rechte
- Pruefung, ob Lehrer- und Verwaltungscodes fuer Registrierung langfristig ausreichen oder ob Accounts zentral freigegeben werden sollten
- Entscheidung, ob QR-Codes langfristig statisch pro Block bleiben oder spaeter dynamisch aktualisiert werden
- Klare Regel, wie Sondertage, Homeschooling, Projekte oder Unterrichtsausfall dokumentiert werden

## 11. Empfehlung fuer den Pilotbetrieb

Fuer den Beta-Test wird empfohlen:

- Start mit einem kleinen Pilotkurs
- Nutzung nur mit notwendigen Daten
- Vorabinformation der Auszubildenden
- klare Benennung der verantwortlichen Personen
- keine Speicherung sensibler Zusatzinformationen
- regelmaessige Rueckmeldung von Lehrkraeften und Verwaltung
- woechentliche technische Kontrolle in der Testphase
- keine breite Einfuehrung, bevor Datenschutzfreigabe und Verfahren geklaert sind

## 12. Entscheidungsvorlage fuer die Schulleitung

Die Schulleitung sollte entscheiden:

- Soll AzubiCheck grundsaetzlich als Pilotprojekt geprueft werden?
- Wer ist fachlich verantwortlich?
- Wer ist technisch verantwortlich?
- Welcher Kurs eignet sich fuer den ersten Test?
- Welche Personen erhalten Admin- oder Verwaltungsrechte?
- Welche Daten duerfen im Pilotbetrieb verarbeitet werden?
- Soll der Datenschutzbeauftragte eine formelle Pruefung vor Echtdatennutzung durchfuehren?
- Welche Rueckmeldefrist gilt fuer die Pilotphase?

## 13. Vorschlag fuer eine Nachricht an die Schulleitung

Betreff: Pruefung eines digitalen Anwesenheits- und Fehlzeitensystems fuer Auszubildende

Sehr geehrte/r [Name],

ich moechte gerne das Projekt "AzubiCheck" zur Pruefung vorstellen. Dabei handelt es sich um eine Web-Anwendung, mit der Anwesenheiten und Fehlzeiten von Auszubildenden digital erfasst, ausgewertet und fuer Lehrkraefte sowie Verwaltung uebersichtlich bereitgestellt werden koennen.

Ziel ist zunaechst kein sofortiger breiter Einsatz, sondern eine datenschutzrechtlich und organisatorisch saubere Pruefung fuer einen moeglichen Pilotbetrieb im Schulalltag.

Die Anwendung sieht rollenbasierte Zugriffe vor:

- Auszubildende sehen nur die eigenen Fehlzeiten.
- Lehrkraefte sehen nur die ihnen zugewiesenen Kurse.
- Verwaltung und Admin koennen kursuebergreifend verwalten und korrigieren.

Vor einer Nutzung mit Echtdaten sollten aus meiner Sicht Schulleitung und behördlicher Datenschutzbeauftragter pruefen, ob Zweck, Rechtsgrundlage, Auftragsverarbeitung, Zugriffskonzept, Speicherfristen und technische Schutzmassnahmen ausreichend geklaert sind.

Ich habe eine kurze Unterlage mit Zweck, Funktionsumfang, Datenkategorien, Rollenmodell und offenen Datenschutzpunkten vorbereitet. Mein Vorschlag waere, AzubiCheck zunaechst gemeinsam zu bewerten und dann gegebenenfalls mit einem kleinen Pilotkurs zu testen.

Mit freundlichen Gruessen

[Name]

## 14. Kurze Ampelbewertung

Gruen:

- klarer schulorganisatorischer Zweck
- rollenbasiertes Zugriffskonzept vorgesehen
- keine Speicherung von Passwoertern im Klartext
- keine Speicherung von biometrischen Daten in der App vorgesehen
- Pilotbetrieb kann klein und kontrolliert starten

Gelb:

- Cloud-Anbieter Firebase und Vercel muessen datenschutzrechtlich geprueft werden
- Auftragsverarbeitung und Drittlandtransfer muessen geklaert sein
- Loesch- und Aufbewahrungsfristen fehlen noch
- Aenderungsprotokoll fuer manuelle Korrekturen sollte ergaenzt werden

Rot vor Echtdatennutzung, falls nicht geklaert:

- keine Freigabe durch Schulleitung
- keine Einbindung des Datenschutzbeauftragten
- keine dokumentierte Rechtsgrundlage
- keine geprueften Auftragsverarbeitungsvertraege
- unklare Zugriffsbeschraenkungen

## 15. Naechster sinnvoller Schritt

Empfehlung:

1. Diese Unterlage an die Schulleitung geben.
2. Datenschutzbeauftragten einbinden.
3. Gemeinsam entscheiden, ob ein kleiner Pilot mit einem Kurs vorbereitet werden soll.
4. Vor Echtdatennutzung die offenen Datenschutz- und Sicherheitsfragen dokumentiert abarbeiten.
