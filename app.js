// ==========================================
// FIREBASE DATABASE ENGINE
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
const auth = firebase.auth();

class FirebaseDB {
    constructor() {}

    async createUserProfile(uid, name, role) {
        await database.ref(`users/${uid}`).set({
            name: name,
            role: role
        });
    }

    async getUserProfile(uid) {
        const snap = await database.ref(`users/${uid}`).once('value');
        return snap.val();
    }

    async createSession(teacherUid, courseName) {
        // Generate code
        const code = Math.random().toString(36).substring(2, 7).toUpperCase();
        const sessionId = `Sitzung-${code}`;
        
        await database.ref(`sessions/${sessionId}`).set({
            createdBy: teacherUid,
            courseName: courseName || "Unbenannt",
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            attendances: {}
        });
        
        return sessionId;
    }

    async deleteSession(sessionId) {
        await database.ref(`sessions/${sessionId}`).remove();
    }
    
    async addAttendance(sessionId, studentUid, studentName) {
        await database.ref(`sessions/${sessionId}/attendances/${studentUid}`).set({
            name: studentName,
            time: firebase.database.ServerValue.TIMESTAMP
        });
    }
    
    async removeAttendance(sessionId, studentUid) {
        await database.ref(`sessions/${sessionId}/attendances/${studentUid}`).remove();
    }

    listenToSessionsForTeacher(teacherUid, callback) {
        const ref = database.ref('sessions').orderByChild('createdBy').equalTo(teacherUid);
        ref.on('value', (snapshot) => {
            const data = snapshot.val() || {};
            // Sort by createdAt descending
            const sorted = Object.entries(data).sort((a,b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
            callback(sorted);
        });
        return ref;
    }
    
    listenToSession(sessionId, callback) {
        const ref = database.ref(`sessions/${sessionId}`);
        ref.on('value', (snapshot) => {
            callback(snapshot.val());
        });
        return ref;
    }
}

const db = new FirebaseDB();

// ==========================================
// MAIN APP CONTROLLER
// ==========================================
const AppController = {
    currentUser: null,
    userProfile: null,
    
    currentAuthMode: 'login', // 'login' or 'register'
    html5QrCode: null,
    
    activeSessionId: null, // Teacher's currently viewed session
    activeSessionRef: null,
    teacherSessionsListener: null,

    init() {
        // Update online indicator
        const indicator = document.getElementById('header-status');
        if(navigator.onLine) indicator.classList.add('online');
        
        // Listen to Auth state
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                // Fetch profile
                try {
                    const profile = await db.getUserProfile(user.uid);
                    if(profile) {
                        this.userProfile = profile;
                        document.getElementById('user-info-text').innerText = `${profile.name} (${profile.role === 'teacher' ? 'Lehrer' : 'Azubi'})`;
                        document.getElementById('btn-logout').classList.remove('hidden');
                        
                        if(profile.role === 'teacher') {
                            this.showScreen('screen-teacher-dashboard');
                            this.initTeacherDashboard();
                        } else {
                            this.showScreen('screen-student-scan');
                            document.getElementById('display-student-name').innerText = profile.name;
                        }
                    } else {
                        // Edge case: Auth exists but no profile
                        console.error("Profil nicht in DB gefunden");
                        auth.signOut();
                    }
                } catch(e) {
                    console.error("Fehler beim Laden des Profils", e);
                }
            } else {
                this.currentUser = null;
                this.userProfile = null;
                document.getElementById('user-info-text').innerText = '';
                document.getElementById('btn-logout').classList.add('hidden');
                this.showScreen('screen-auth');
                this.switchAuthTab('login');
                
                // Cleanup listeners
                if(this.teacherSessionsListener) this.teacherSessionsListener.off();
                if(this.activeSessionRef) this.activeSessionRef.off();
            }
        });
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.add('hidden');
            s.classList.remove('active');
        });
        const activeScreen = document.getElementById(screenId);
        if(activeScreen) {
            activeScreen.classList.remove('hidden');
            activeScreen.classList.add('active');
        }
    },
    
    logout() {
        auth.signOut();
    },

    // ==========================================
    // AUTH LOGIC
    // ==========================================
    switchAuthTab(mode) {
        this.currentAuthMode = mode;
        const tabs = document.querySelectorAll('.auth-tab');
        
        if (mode === 'login') {
            tabs[0].classList.add('active');
            tabs[1].classList.remove('active');
            document.getElementById('register-fields').classList.add('hidden');
            document.getElementById('auth-title').innerText = "Willkommen zurück";
            document.getElementById('auth-desc').innerText = "Bitte logge dich ein.";
            document.getElementById('btn-auth-action').innerText = "Einloggen";
        } else {
            tabs[0].classList.remove('active');
            tabs[1].classList.add('active');
            document.getElementById('register-fields').classList.remove('hidden');
            document.getElementById('auth-title').innerText = "Neuen Account erstellen";
            document.getElementById('auth-desc').innerText = "Registriere dich für AzubiCheck.";
            document.getElementById('btn-auth-action').innerText = "Registrieren";
            this.checkRoleCode();
        }
    },
    
    checkRoleCode() {
        if(this.currentAuthMode !== 'register') return;
        const role = document.getElementById('auth-role').value;
        if(role === 'teacher') {
            document.getElementById('teacher-code-group').classList.remove('hidden');
        } else {
            document.getElementById('teacher-code-group').classList.add('hidden');
        }
    },
    
    async processAuth() {
        const email = document.getElementById('auth-email').value.trim();
        const pw = document.getElementById('auth-password').value;
        const btn = document.getElementById('btn-auth-action');
        
        if(!email || !pw) {
            alert("Bitte E-Mail und Passwort eingeben.");
            return;
        }

        try {
            btn.disabled = true;
            btn.innerText = "Bitte warten...";
            
            if (this.currentAuthMode === 'login') {   
                await auth.signInWithEmailAndPassword(email, pw);
            } else {
                const role = document.getElementById('auth-role').value;
                const selectedName = document.getElementById('auth-name').value.trim();
                
                if(!selectedName) {
                    alert("Bitte Namen eingeben.");
                    btn.disabled = false; return;
                }
                
                if(role === 'teacher') {
                    const code = document.getElementById('auth-teacher-code').value;
                    if(code !== "Azubi2026") {
                        alert("Lehrer Geheimcode ist falsch!");
                        btn.disabled = false; btn.innerText = "Registrieren"; return;
                    }
                }
                
                // Register
                const cred = await auth.createUserWithEmailAndPassword(email, pw);
                await db.createUserProfile(cred.user.uid, selectedName, role);
            }
        } catch (error) {
            console.error("Auth Exception:", error);
            alert("Fehler bei Authentifizierung: " + error.message);
            btn.disabled = false;
        }
        
        btn.disabled = false;
        btn.innerText = this.currentAuthMode === 'login' ? "Einloggen" : "Registrieren";
    },

    // ==========================================
    // STUDENT LOGIC
    // ==========================================
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
        } catch(err) {
            const wts = confirm("Lokaler Testlauf? FaceID/Hello Check überspringen und als Erfolg werten?");
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
                (errorMessage) => { /* ignore normal errors */ }
            );
        } catch(err) {
            console.warn("Kamera Zugriff verweigert:", err);
            const simStr = prompt("Kamera konnte lokal nicht gestartet werden. Manuelle Eingabe Sitzungs-Code (z.b. Sitzung-XYZ12) um fortzufahren:");
            if(simStr) {
                this.onQrCodeScanned(simStr);
            } else {
                startBtn.classList.remove('hidden');
                readerEl.classList.add('hidden');
            }
        }
    },

    async onQrCodeScanned(sessionId) {
        if(this.html5QrCode) {
            try {
                await this.html5QrCode.stop();
                this.html5QrCode.clear();
            } catch(e) { }
        }
        document.getElementById('reader-container').classList.add('hidden');

        try {
            await db.addAttendance(sessionId, this.currentUser.uid, this.userProfile.name);
            
            document.getElementById('scan-success').classList.remove('hidden');
            
            // Add to student local history text
            const hist = document.getElementById('student-history');
            hist.classList.remove('hidden');
            const dStr = new Date().toLocaleTimeString('de-DE');
            document.getElementById('student-last-scan-info').innerText = `Für Sitzung ${sessionId} um ${dStr} Uhr eingecheckt.`;
            
            setTimeout(() => {
                document.getElementById('scan-success').classList.add('hidden');
                document.getElementById('btn-start-scan').classList.remove('hidden');
            }, 3000);
            
        } catch(e) {
            alert("Fehler beim Eintragen: " + e.message);
            document.getElementById('btn-start-scan').classList.remove('hidden');
        }
    },

    // ==========================================
    // TEACHER LOGIC
    // ==========================================
    initTeacherDashboard() {
        if(this.teacherSessionsListener) this.teacherSessionsListener.off();
        
        this.teacherSessionsListener = db.listenToSessionsForTeacher(this.currentUser.uid, (sessions) => {
            this.renderSessionsList(sessions);
            
            // If active session is deleted somehow
            if(this.activeSessionId && !sessions.find(s => s[0] === this.activeSessionId)) {
                this.closeActiveSession();
            }
        });
    },
    
    renderSessionsList(sessions) {
        const ul = document.getElementById('past-sessions-list');
        ul.innerHTML = "";
        
        if(!sessions || sessions.length === 0) {
            ul.innerHTML = '<li class="empty-state text-sm">Keine Sitzungen gefunden.</li>';
            return;
        }
        
        sessions.forEach(([sid, data]) => {
            const li = document.createElement('li');
            if(sid === this.activeSessionId) li.classList.add('active');
            
            const dateStr = new Date(data.createdAt).toLocaleDateString();
            const timeStr = new Date(data.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const count = data.attendances ? Object.keys(data.attendances).length : 0;
            
            li.innerHTML = `
                <div style="font-weight:600">${data.courseName}</div>
                <div style="font-size:0.8rem; color:var(--text-muted)">${dateStr} ${timeStr} • ${count} Pers.</div>
            `;
            li.onclick = () => this.openSession(sid);
            ul.appendChild(li);
        });
    },

    async generateNewSession() {
        const cName = document.getElementById('course-name').value.trim() || 'Neue Sitzung';
        try {
            const sid = await db.createSession(this.currentUser.uid, cName);
            document.getElementById('course-name').value = '';
            this.openSession(sid);
        } catch(e) {
            alert("Fehler beim Erstellen der Sitzung: " + e.message);
        }
    },
    
    openSession(sessionId) {
        this.activeSessionId = sessionId;
        document.getElementById('active-session-view').classList.remove('hidden');
        
        // Highlight active left
        const lis = document.querySelectorAll('#past-sessions-list li');
        lis.forEach(li => li.classList.remove('active'));
        // (will be updated via listenToSessionsForTeacher anyway eventually)
        
        if(this.activeSessionRef) this.activeSessionRef.off();
        
        // Listen to this specific session closely
        this.activeSessionRef = db.listenToSession(sessionId, (data) => {
            if(!data) return;
            this.renderActiveSessionUI(sessionId, data);
        });
    },
    
    closeActiveSession() {
        this.activeSessionId = null;
        document.getElementById('active-session-view').classList.add('hidden');
        if(this.activeSessionRef) this.activeSessionRef.off();
        const lis = document.querySelectorAll('#past-sessions-list li');
        lis.forEach(li => li.classList.remove('active'));
    },
    
    renderActiveSessionUI(sid, data) {
        document.getElementById('current-session-id').innerText = data.courseName + " ("+sid+")";
        document.getElementById('qr-modal-course-name').innerText = data.courseName;
        
        const dateStr = new Date(data.createdAt).toLocaleString();
        document.getElementById('session-date-display').innerText = dateStr;
        
        // Render QR
        const canvasContainers = [document.getElementById('qr-code-canvas'), document.getElementById('qr-code-canvas-large')];
        canvasContainers.forEach(c => {
            c.innerHTML = "";
            const qrCanvas = document.createElement('canvas');
            const size = c.id.includes('large') ? 300 : 64;
            QRCode.toCanvas(qrCanvas, sid, { width: size, margin: 1, color: { dark: '#0b0f19', light: '#ffffff' } }, (error) => {
                if (!error) c.appendChild(qrCanvas);
            });
        });
        
        // Render Attendances
        const listObj = data.attendances || {};
        const entries = Object.entries(listObj);
        document.getElementById('attendance-count').innerText = entries.length;
        
        const ul = document.getElementById('attendance-list');
        ul.innerHTML = "";
        
        if(entries.length === 0) {
            ul.innerHTML = `<li class="empty-state">Noch niemand eingecheckt.</li>`;
            return;
        }

        // Sort by time
        entries.sort((a,b) => a[1].time - b[1].time).forEach(([studentUid, record]) => {
            const li = document.createElement('li');
            const d = new Date(record.time);
            const displayTime = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} Uhr`;
            
            li.innerHTML = `
                <div class="flex-grow-1" style="flex:1;">
                    <div class="list-name">${record.name}</div>
                    <div class="list-time">${displayTime}</div>
                </div>
                <button class="btn-icon" style="color:var(--danger)" onclick="app.removeStudentFromSession('${studentUid}')" title="Entfernen">✕</button>
            `;
            ul.appendChild(li);
        });
    },

    toggleQrFullscreen() {
        const modal = document.getElementById('qr-modal');
        if(modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
        } else {
            modal.classList.add('hidden');
        }
    },
    
    async deleteCurrentSession() {
        if(!this.activeSessionId) return;
        if(confirm("Möchtest du diese Sitzung wirklich unwiderruflich löschen?")) {
            await db.deleteSession(this.activeSessionId);
            this.closeActiveSession();
        }
    },
    
    async addStudentManuallyPrompt() {
        if(!this.activeSessionId) return;
        const name = prompt("Name des Schülers eingeben, der manuell hinzugefügt werden soll:");
        if(!name) return;
        
        // Use a random uid for manual entries to avoid collision
        const manualUid = "manual-" + Math.random().toString(36).substr(2, 9);
        try {
            await db.addAttendance(this.activeSessionId, manualUid, name + " (Manuell)");
        } catch(e) {
            alert("Fehler: " + e.message);
        }
    },
    
    async removeStudentFromSession(studentUid) {
        if(!this.activeSessionId) return;
        if(confirm("Diesen Eintrag wirklich entfernen?")) {
            await db.removeAttendance(this.activeSessionId, studentUid);
        }
    },

    async exportListPdf() {
        if(!this.activeSessionId) return;
        
        // Use html2pdf.js
        const element = document.getElementById('exportable-area');
        // create a clone to strip out buttons
        const clone = element.cloneNode(true);
        // Remove buttons
        clone.querySelectorAll('button').forEach(b => b.remove());
        
        // Make body white for print
        clone.style.background = 'white';
        clone.style.color = 'black';
        clone.style.padding = '20px';
        clone.style.borderRadius = '0';
        
        clone.querySelectorAll('.empty-state').forEach(el => el.style.color = 'black');
        clone.querySelectorAll('.list-time').forEach(el => el.style.color = '#555');
        
        const opt = {
          margin:       0.5,
          filename:     `Anwesenheit_${this.activeSessionId}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        const worker = html2pdf().from(clone).set(opt);
        
        // Save PDF
        await worker.save();
        
        // Also open Mailto
        // Fetch current session data to extract names (already in DOM, but cleaner from memory)
        const items = document.querySelectorAll('#attendance-list .list-name');
        let body = `Details im Anhang. \n\nAnwesende (${items.length}):\n`;
        items.forEach(i => body += `- ${i.innerText}\n`);
        
        const cName = document.getElementById('current-session-id').innerText;
        window.location.href = `mailto:?subject=Anwesenheitsliste ${cName}&body=${encodeURIComponent(body)}`;
    }
};

window.app = AppController;

// Init when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    AppController.init();
});
