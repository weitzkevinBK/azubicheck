// ==========================================
// FIREBASE DATABASE ENGINE (Option A: Live)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD1lxlhQh97GnF9rD3UxqSFTiN7Fy-Bi0Y",
    authDomain: "azubicheckbergkamen.firebaseapp.com",
    databaseURL: "https://azubicheckbergkamen-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "azubicheckbergkamen",
    storageBucket: "azubicheckbergkamen.firebasestorage.app",
    messagingSenderId: "517410461228",
    appId: "1:517410461228:web:0a836cb5594d6b7db76389"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

class FirebaseDB {
    constructor() {
        this.sessionRef = database.ref('sessions');
        this.currentSessionsCache = {};
    }

    getSessions() {
        return this.currentSessionsCache;
    }

    saveSession(sessionId, data) {
        database.ref('sessions/' + sessionId).set(data);
    }
    
    addAttendance(sessionId, studentName) {
        const ref = database.ref('sessions/' + sessionId + '/attendances');
        
        ref.once('value').then(snapshot => {
            let attendances = snapshot.val() || [];
            // Sicherstellen, dass es ein Array ist (Firebase speichert leere Arrays manchmal nicht oder als Objekt)
            if(!Array.isArray(attendances)) {
                // Wenn es ein Objekt mit Indexes ist, in Array umwandeln
                attendances = Object.values(attendances);
            }
            
            const exists = attendances.find(a => a.name === studentName);
            if(!exists) {
                attendances.push({
                    name: studentName,
                    time: new Date().toISOString()
                });
                ref.set(attendances);
                console.log("Gesendet über Internet an", sessionId);
            }
        }).catch(err => {
            console.error("Firebase Schreibfehler:", err);
            alert("Fehler beim Senden in die Datenbank. Bitte die Firebase Sicherheitsregeln (Testmodus) prüfen.");
        });
    }

    onUpdate(cb) {
        this.sessionRef.on('value', (snapshot) => {
            const data = snapshot.val() || {};
            this.currentSessionsCache = data;
            cb(data);
        });
    }
}

const db = new FirebaseDB();

// ==========================================
// MAIN APP CONTROLLER
// ==========================================
const AppController = {
    currentSessionId: null,
    html5QrCode: null,

    init() {
        // Look for existing student setup
        const studentName = localStorage.getItem('student_name');
        if (studentName) {
            document.getElementById('display-student-name').innerText = studentName;
        }
        
        // Update online indicator
        const indicator = document.getElementById('header-status');
        if(navigator.onLine) indicator.classList.add('online');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.add('hidden');
            s.classList.remove('active');
        });
        const activeScreen = document.getElementById(screenId);
        activeScreen.classList.remove('hidden');
        activeScreen.classList.add('active');
    },

    selectRole(role) {
        if (role === 'student') {
            const isSetup = localStorage.getItem('student_setup_complete');
            if (isSetup) {
                this.showScreen('screen-student-scan');
            } else {
                this.showScreen('screen-student-setup');
            }
        } else if (role === 'teacher') {
            const hasLogin = sessionStorage.getItem('teacher_logged_in');
            if (hasLogin) {
                this.showScreen('screen-teacher-dashboard');
                this.loadTeacherDashboard();
            } else {
                document.getElementById('teacher-password').value = "";
                this.showScreen('screen-teacher-login');
            }
        }
    },

    verifyTeacherPassword() {
        const pwd = document.getElementById('teacher-password').value;
        const SECRET = "Azubi2026";
        if (pwd === SECRET) {
            sessionStorage.setItem('teacher_logged_in', 'true');
            this.showScreen('screen-teacher-dashboard');
            this.loadTeacherDashboard();
        } else {
            alert("Das Passwort ist leider falsch.");
        }
    },

    // ==========================================
    // STUDENT LOGIC
    // ==========================================
    async registerStudent() {
        const nameInput = document.getElementById('student-name').value.trim();
        if(!nameInput) {
            alert('Bitte gib deinen Namen ein!');
            return;
        }

        // WebAuthn Biometric Registration
        try {
            // Generate a random challenge (mock server)
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            const userId = new Uint8Array(16);
            window.crypto.getRandomValues(userId);

            // Attempt Biometric Registration
            // NOTE: This will fail on file:// or non-HTTPS domains in most browsers.
            await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: "Azubi Attendance App" },
                    user: {
                        id: userId,
                        name: nameInput,
                        displayName: nameInput
                    },
                    pubKeyCredParams: [ { type: "public-key", alg: -7 } ], // ES256
                    authenticatorSelection: { 
                        authenticatorAttachment: "platform", // Forces FaceID/Windows Hello
                        userVerification: "required"
                    },
                    timeout: 60000
                }
            });
            console.log("WebAuthn erfolgreich!");
        } catch (err) {
            console.warn("WebAuthn Error (normal in lokaler Testumgebung):", err);
            // We soft-fail here so the demo can proceed even if opened via file://
            alert("Hinweis: Echte Biometrie (FaceID) benötigt HTTPS. Das System simuliert nun die Kopplung für diesen Testlauf.");
        }

        localStorage.setItem('student_name', nameInput);
        localStorage.setItem('student_setup_complete', 'true');
        
        document.getElementById('display-student-name').innerText = nameInput;
        this.showScreen('screen-student-scan');
    },

    resetStudent() {
        if(confirm("Möchtest du dein Gerät entkoppeln und die Einrichtung neu starten?")) {
            localStorage.removeItem('student_name');
            localStorage.removeItem('student_setup_complete');
            this.showScreen('screen-student-setup');
        }
    },

    async startScanProcess() {
        // Phase 1: Biometric Verification
        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    userVerification: "required"
                }
            });
            // Success
        } catch(err) {
            console.warn("WebAuthn Check fehlgeschlagen/nicht verfügbar:", err);
            const wts = confirm("Biometrie Überprüfung simuliert (da lokaler Testlauf). Fortfahren als FaceID-Erfolg?");
            if(!wts) return;
        }

        // Phase 2: Open Camera
        const startBtn = document.getElementById('btn-start-scan');
        const readerEl = document.getElementById('reader-container');
        
        startBtn.classList.add('hidden');
        readerEl.classList.remove('hidden');

        try {
            this.html5QrCode = new Html5Qrcode("reader");
            await this.html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => this.onQrCodeScanned(decodedText),
                (errorMessage) => { /* ignore normal scanning errors */ }
            );
        } catch(err) {
            console.warn("Kamera Zugriff verweigert:", err);
            const sim = confirm("Da wir die App aktuell ohne Server als Datei öffnen, blockiert der Browser die Kamera aus Sicherheitsgründen.\n\nMöchtest du stattdessen jetzt den Scan 'simulieren' um den Ablauf zu testen?");
            
            if (sim) {
                // Hole die ID vom anderen Tab für einen perfekten Test
                const activeSession = localStorage.getItem('teacher_current_session') || "TEST-SITZUNG";
                this.onQrCodeScanned(activeSession);
            } else {
                startBtn.classList.remove('hidden');
                readerEl.classList.add('hidden');
            }
        }
    },

    async onQrCodeScanned(decodedText) {
        if(this.html5QrCode) {
            try {
                await this.html5QrCode.stop();
                this.html5QrCode.clear();
            } catch(e) { /* ignore if wasn't running */ }
        }
        document.getElementById('reader-container').classList.add('hidden');

        // Assuming decoded text is the Session-ID (e.g., "AZUBI-12345")
        const studentName = localStorage.getItem('student_name');
        console.log("Scanned:", decodedText);
        
        // Write to mock DB
        db.addAttendance(decodedText, studentName);
        
        // Show success UI
        document.getElementById('scan-success').classList.remove('hidden');
        
        // Reset UI after 3 seconds
        setTimeout(() => {
            document.getElementById('scan-success').classList.add('hidden');
            document.getElementById('btn-start-scan').classList.remove('hidden');
        }, 3000);
    },

    // ==========================================
    // TEACHER LOGIC
    // ==========================================
    loadTeacherDashboard() {
        const lastSession = localStorage.getItem('teacher_current_session');
        if(lastSession) {
            this.currentSessionId = lastSession;
            this.updateTeacherUI();
        }
        
        // Listen to Database updates (e.g. when student scans in another tab)
        db.onUpdate((sessions) => {
            if(this.currentSessionId) {
                 this.renderAttendanceList(sessions[this.currentSessionId]?.attendances || []);
            }
        });
    },

    generateNewSession() {
        // Generate a random code like AZUBI-ABC12
        const code = Math.random().toString(36).substring(2, 7).toUpperCase();
        this.currentSessionId = `SITZUNG-${code}`;
        
        // Save to DB
        db.saveSession(this.currentSessionId, { created: Date.now(), attendances: [] });
        localStorage.setItem('teacher_current_session', this.currentSessionId);
        
        this.updateTeacherUI();
    },

    updateTeacherUI() {
        document.getElementById('current-session-id').innerText = this.currentSessionId;
        
        // Generate real QR code image
        const canvas = document.getElementById('qr-code-canvas');
        canvas.innerHTML = ""; // clear
        
        const qrCanvas = document.createElement('canvas');
        QRCode.toCanvas(qrCanvas, this.currentSessionId, { width: 200, margin: 1, color: { dark: '#0b0f19', light: '#ffffff' } }, (error) => {
            if (error) console.error(error);
            canvas.appendChild(qrCanvas);
        });
        
        document.getElementById('qr-display-container').classList.remove('hidden');
        
        // Load existing attendances for this session
        const sessions = db.getSessions();
        const data = sessions[this.currentSessionId];
        this.renderAttendanceList(data ? data.attendances : []);
    },

    renderAttendanceList(list) {
        document.getElementById('attendance-count').innerText = list.length;
        const ul = document.getElementById('attendance-list');
        ul.innerHTML = "";
        
        if(list.length === 0) {
            ul.innerHTML = `<li class="empty-state">Noch niemand eingecheckt.</li>`;
            return;
        }

        list.forEach(record => {
            const li = document.createElement('li');
            const d = new Date(record.time);
            const displayTime = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} Uhr`;
            
            li.innerHTML = `
                <span class="list-name">${record.name}</span>
                <span class="list-time">${displayTime}</span>
            `;
            ul.appendChild(li);
        });
    },

    sendEmailList() {
        if(!this.currentSessionId) return;
        
        const sessions = db.getSessions();
        const data = sessions[this.currentSessionId];
        if(!data || !data.attendances || data.attendances.length === 0) {
            alert("Es gibt noch keine Teilnehmer zum Versenden.");
            return;
        }
        
        let body = `Anwesenheitsliste für Sitzung: ${this.currentSessionId}\n`;
        body += `Datum: ${new Date().toLocaleDateString()}\n\n`;
        body += `Anwesende Schüler:\n`;
        
        data.attendances.forEach(a => {
            const d = new Date(a.time);
            body += `- ${a.name} (Eingecheckt um ${d.getHours()}:${d.getMinutes()})\n`;
        });
        
        // Open default mail client
        window.location.href = `mailto:?subject=Anwesenheitsliste ${this.currentSessionId}&body=${encodeURIComponent(body)}`;
    }
};

window.app = AppController;

// Init when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    AppController.init();
});
