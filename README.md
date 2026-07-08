# AzubiCheck

MVP fuer Anwesenheiten, Fehlzeiten und Blockverwaltung im Schulalltag.

## Aktueller Stand

Die App laeuft aktuell im lokalen Demo-Modus mit `localStorage`.

Demo-Logins:

- Admin: `admin@azubicheck.local` / `demo1234`
- Lehrer: `lehrer@azubicheck.local` / `demo1234`
- Azubi: `azubi@azubicheck.local` / `demo1234`

Enthaltene MVP-Funktionen:

- Login und Azubi-Registrierung
- Rollen: Azubi, Lehrer, Verwaltung, Admin
- Kursstruktur GP-8 bis GP-25
- Lehrer-Dashboard mit alphabetischer Azubi-Liste
- Soll-/Ist-/Fehlzeitenberechnung
- Theorie- und Praxisbloecke mit Start-/Enddatum
- QR-Code-Erzeugung fuer Theorieblock
- Azubi-Check-in mit WebAuthn/Geraetebestaetigung-Fallback
- Zweiter Scan mit Auswahl: Abbrechen, Abmelden, Unterricht beendet
- Praxisstunden manuell eintragen
- Fruehes-Unterrichtsende-Warnung bei Mehrheit vor 13:30
- Tageskorrektur fuer Start-/Endzeiten
- Admin-/Verwaltungsansicht fuer Rollen und Kurszuweisungen

## Entwicklung

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Firebase

Die Datei `.env.example` zeigt die benoetigten Variablen fuer Firebase.

Geplante Produktanbindung:

- Firebase Auth fuer echte Accounts
- Firestore fuer Users, Kurse, Bloecke, Theorie-/Praxisanwesenheiten
- Firestore Security Rules aus `firestore.rules`
- Passwort-Reset per Firebase Auth Reset-Mail

## Vercel

Vercel kann die App direkt als Vite-Projekt deployen.

Build Command:

```bash
npm run build
```

Output Directory:

```bash
dist
```
