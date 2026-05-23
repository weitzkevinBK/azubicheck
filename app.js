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

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

class FirebaseDB {
    constructor() {}

    async createUserProfile(uid, name, role, course) {
        await database.ref(`users/${uid}`).set({
            name: name,
            role: role,
            course: course || null
        });
    }

    async getUserProfile(uid) {
        const snap = await database.ref(`users/${uid}`).once('value');
        return snap.val();
    }
    
    async getAllStudents() {
        try {
            const snap = await database.ref('users').once('value');
            const allUsers = snap.val() || {};
            const students = {};
            for (let uid in allUsers) {
                if (allUsers[uid].role === 'student') {
                    students[uid] = allUsers[uid];
                }
            }
            return students;
        } catch(e) {
            console.error("Fehler beim Laden der Schüler:", e);
            alert("Fehler beim Laden der Schüler: " + e.message);
            return {};
        }
    }

    async updateStudentCourse(uid, newCourse) {
        await database.ref(`users/${uid}/course`).set(newCourse);
    }

    async createSession(teacherUid, courseName, blockNumber, startDate, endDate) {
        const code = Math.random().toString(36).substring(2, 7).toUpperCase();
        const sessionId = `Block-${code}`;
        
        await database.ref(`sessions/${sessionId}`).set({
            createdBy: teacherUid,
            courseName: courseName || "Unbenannt",
            blockNumber: blockNumber || "1",
            startDate: startDate,
            endDate: endDate,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            attendances: {}
        });
        
        return sessionId;
    }

    async deleteSession(sessionId) {
        await database.ref(`sessions/${sessionId}`).remove();
    }
    
    async addAttendance(sessionId, studentUid, studentName, dateStr, timestamp, hours) {
        await database.ref(`sessions/${sessionId}/attendances/${dateStr}/${studentUid}`).set({
            name: studentName,
            time: timestamp,
            hours: hours
        });
    }
    
    async removeAttendance(sessionId, dateStr, studentUid) {
        await database.ref(`sessions/${sessionId}/attendances/${dateStr}/${studentUid}`).remove();
    }

    listenToSessionsForTeacher(teacherUid, callback) {
        const ref = database.ref('sessions').orderByChild('createdBy').equalTo(teacherUid);
        ref.on('value', (snapshot) => {
            const data = snapshot.val() || {};
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

    async getMySessions(uid) {
        const snap = await database.ref('sessions').once('value');
        const allSessions = snap.val() || {};
        const mySessions = {};
        
        for(let sid in allSessions) {
            const session = allSessions[sid];
            if(session.attendances) {
                let attendedInThisBlock = false;
                for(let dateStr in session.attendances) {
                    if(session.attendances[dateStr][uid]) {
                        attendedInThisBlock = true;
                        break;
                    }
                }
                if(attendedInThisBlock) {
                    mySessions[sid] = session;
                }
            }
        }
        return mySessions;
    }
}

const db = new FirebaseDB();

// ==========================================
// TIME CALCULATION HELPERS
// ==========================================
function calculateHours(scanDateObj) {
    // Wochenende prüfen
    const day = scanDateObj.getDay();
    if(day === 0 || day === 6) return 0; // Kein Blockunterricht am Wochenende
    
    const isFriday = (day === 5);
    const endHour = isFriday ? 12 : 14;
    const endMin = 15;
    
    const scanHour = scanDateObj.getHours();
    const scanMin = scanDateObj.getMinutes();
    
    let startHour = scanHour;
    let startMin = scanMin;
    
    // If before or exactly 08:00
    if (scanHour < 8 || (scanHour === 8 && scanMin === 0)) {
        startHour = 7;
        startMin = 15;
    }
    
    const startTimeDecimal = startHour + (startMin / 60);
    const endTimeDecimal = endHour + (endMin / 60);
    
    let duration = endTimeDecimal - startTimeDecimal;
    if (duration < 0) duration = 0;
    
    return duration > 0 ? duration + 1 : 0; // +1 Stunde
}

function formatDateStr(dateObj) {
    const y = dateObj.getFullYear();
    const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const d = dateObj.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ==========================================
// MAIN APP CONTROLLER
// ==========================================
const AppController = {
    currentUser: null,
    userProfile: null,
    
    currentAuthMode: 'login',
    html5QrCode: null,
    
    activeSessionId: null,
    activeSessionRef: null,
    teacherSessionsListener: null,
    
    allStudents: {},
    selectedStudentUid: null,
    teacherSessionsData: [],

    init() {
        const indicator = document.getElementById('header-status');
        if(navigator.onLine) indicator.classList.add('online');
        
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                try {
                    const profile = await db.getUserProfile(user.uid);
                    if(profile) {
                        this.userProfile = profile;
                        document.getElementById('user-info-text').innerText = `${profile.name} (${profile.role === 'teacher' ? 'Lehrer' : 'Azubi' + (profile.course ? ' - ' + profile.course : '')})`;
                        document.getElementById('btn-logout').classList.remove('hidden');
                        
                        if(profile.role === 'teacher') {
                            this.showScreen('screen-teacher-dashboard');
                            this.initTeacherDashboard();
                        } else {
                            this.showScreen('screen-student-scan');
                            document.getElementById('display-student-name').innerText = profile.name;
                            this.renderStudentHistory();
                        }
                    } else {
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
            document.getElementById('student-course-group').classList.add('hidden');
        } else {
            document.getElementById('teacher-code-group').classList.add('hidden');
            document.getElementById('student-course-group').classList.remove('hidden');
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
                let course = null;
                
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
                } else {
                    course = document.getElementById('auth-course').value;
                }
                
                const cred = await auth.createUserWithEmailAndPassword(email, pw);
                await db.createUserProfile(cred.user.uid, selectedName, role, course);
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
        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            await navigator.credentials.get({
                publicKey: { challenge: challenge, userVerification: "required" }
            });
        } catch(err) {
            const wts = confirm("Lokaler Testlauf? FaceID/Hello Check überspringen und als Erfolg werten?");
            if(!wts) return;
        }

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
                (errorMessage) => { }
            );
        } catch(err) {
            console.warn("Kamera Zugriff verweigert:", err);
            const simStr = prompt("Manuelle Eingabe Sitzungs-Code:");
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
            const now = new Date();
            const dateStr = formatDateStr(now);
            
            // Check if already scanned today
            const sessionData = (await database.ref(`sessions/${sessionId}`).once('value')).val();
            if(!sessionData) throw new Error("Block nicht gefunden!");
            
            if(sessionData.attendances && sessionData.attendances[dateStr] && sessionData.attendances[dateStr][this.currentUser.uid]) {
                throw new Error("Du bist für heute bereits eingetragen!");
            }
            
            const hours = calculateHours(now);
            if(hours === 0) {
                throw new Error("Am Wochenende können keine Zeiten erfasst werden.");
            }

            await db.addAttendance(sessionId, this.currentUser.uid, this.userProfile.name, dateStr, now.getTime(), hours);
            
            document.getElementById('scan-success').classList.remove('hidden');
            this.renderStudentHistory();
            
            setTimeout(() => {
                document.getElementById('scan-success').classList.add('hidden');
                document.getElementById('btn-start-scan').classList.remove('hidden');
            }, 3000);
            
        } catch(e) {
            alert("Fehler beim Eintragen: " + e.message);
            document.getElementById('btn-start-scan').classList.remove('hidden');
        }
    },
    
    async renderStudentHistory() {
        const uid = this.currentUser.uid;
        const sessions = await db.getMySessions(uid);
        
        const ul = document.getElementById('student-blocks-list');
        ul.innerHTML = "";
        
        let totalHours = 0;
        
        const sortedSessions = Object.entries(sessions).sort((a,b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
        
        if(sortedSessions.length === 0) {
            ul.innerHTML = '<li class="empty-state">Noch keine Anwesenheiten registriert.</li>';
        } else {
            sortedSessions.forEach(([sid, data]) => {
                let blockHours = 0;
                let daysCount = 0;
                
                if(data.attendances) {
                    for(let dateStr in data.attendances) {
                        const rec = data.attendances[dateStr][uid];
                        if(rec) {
                            blockHours += rec.hours || 0;
                            daysCount++;
                        }
                    }
                }
                
                totalHours += blockHours;
                
                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="flex:1;">
                        <div class="list-name">${data.courseName || 'Unbenannt'} - Block ${data.blockNumber || 1}</div>
                        <div class="list-time">${data.startDate} bis ${data.endDate} • ${daysCount} Tage anwesend</div>
                    </div>
                    <div style="font-weight:bold; color:var(--success);">${blockHours.toFixed(2)} h</div>
                `;
                ul.appendChild(li);
            });
        }
        
        document.getElementById('student-total-hours').innerText = `${totalHours.toFixed(2)} h`;
    },

    // ==========================================
    // TEACHER LOGIC
    // ==========================================
    switchTeacherTab(tabName) {
        document.getElementById('tab-btn-sessions').classList.toggle('active', tabName === 'sessions');
        document.getElementById('tab-btn-students').classList.toggle('active', tabName === 'students');
        
        if(tabName === 'sessions') {
            document.getElementById('teacher-tab-sessions').classList.remove('hidden');
            document.getElementById('teacher-tab-students').classList.add('hidden');
        } else {
            document.getElementById('teacher-tab-sessions').classList.add('hidden');
            document.getElementById('teacher-tab-students').classList.remove('hidden');
            this.loadStudents();
        }
    },

    initTeacherDashboard() {
        if(this.teacherSessionsListener) this.teacherSessionsListener.off();
        
        this.teacherSessionsListener = db.listenToSessionsForTeacher(this.currentUser.uid, (sessions) => {
            this.teacherSessionsData = sessions;
            this.renderSessionsList(sessions);
            
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
            
            li.innerHTML = `
                <div style="font-weight:600">${data.courseName} (Block ${data.blockNumber || '-'})</div>
                <div style="font-size:0.8rem; color:var(--text-muted)">${data.startDate || '?'} - ${data.endDate || '?'}</div>
            `;
            li.onclick = () => this.openSession(sid);
            ul.appendChild(li);
        });
    },

    async generateNewSession() {
        const cName = document.getElementById('course-name').value;
        const bNum = document.getElementById('block-number').value;
        const sDate = document.getElementById('start-date').value;
        const eDate = document.getElementById('end-date').value;
        
        if(!cName || !bNum || !sDate || !eDate) {
            alert("Bitte alle Felder ausfüllen!");
            return;
        }
        
        try {
            const sid = await db.createSession(this.currentUser.uid, cName, bNum, sDate, eDate);
            this.openSession(sid);
        } catch(e) {
            alert("Fehler beim Erstellen der Sitzung: " + e.message);
        }
    },
    
    openSession(sessionId) {
        this.activeSessionId = sessionId;
        document.getElementById('active-session-view').classList.remove('hidden');
        
        const lis = document.querySelectorAll('#past-sessions-list li');
        lis.forEach(li => li.classList.remove('active'));
        
        if(this.activeSessionRef) this.activeSessionRef.off();
        
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
        document.getElementById('current-session-id').innerText = `${data.courseName} - Block ${data.blockNumber}`;
        document.getElementById('qr-modal-course-name').innerText = `${data.courseName} - Block ${data.blockNumber}`;
        
        const todayStr = formatDateStr(new Date());
        document.getElementById('session-date-display').innerText = `Heute: ${todayStr}`;
        
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
        
        // Render Attendances for TODAY
        const allAttendances = data.attendances || {};
        const todayAttendances = allAttendances[todayStr] || {};
        const entries = Object.entries(todayAttendances);
        
        document.getElementById('attendance-count').innerText = entries.length;
        
        const ul = document.getElementById('attendance-list');
        ul.innerHTML = "";
        
        if(entries.length === 0) {
            ul.innerHTML = `<li class="empty-state">Noch niemand eingecheckt (Heute).</li>`;
            return;
        }

        entries.sort((a,b) => a[1].time - b[1].time).forEach(([studentUid, record]) => {
            const li = document.createElement('li');
            const d = new Date(record.time);
            const displayTime = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} Uhr`;
            
            li.innerHTML = `
                <div class="flex-grow-1" style="flex:1;">
                    <div class="list-name">${record.name}</div>
                    <div class="list-time">Scan: ${displayTime} | Gewertet: ${(record.hours || 0).toFixed(2)}h</div>
                </div>
                <button class="btn-icon" style="color:var(--danger)" onclick="app.removeStudentFromSession('${sid}', '${todayStr}', '${studentUid}')" title="Entfernen">✕</button>
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
        if(confirm("Möchtest du diesen kompletten Block wirklich unwiderruflich löschen?")) {
            await db.deleteSession(this.activeSessionId);
            this.closeActiveSession();
        }
    },
    
    async removeStudentFromSession(sid, dateStr, studentUid) {
        if(confirm("Diesen Eintrag wirklich entfernen?")) {
            await db.removeAttendance(sid, dateStr, studentUid);
        }
    },

    // ==========================================
    // STUDENT MANAGEMENT (TEACHER TAB 2)
    // ==========================================
    async loadStudents() {
        this.allStudents = await db.getAllStudents();
        this.renderStudentList();
    },

    renderStudentList() {
        const filterCourse = document.getElementById('student-filter-course').value;
        const ul = document.getElementById('admin-student-list');
        ul.innerHTML = "";

        const entries = Object.entries(this.allStudents);
        if(entries.length === 0) {
            ul.innerHTML = `<li class="empty-state">Keine Schüler gefunden.</li>`;
            return;
        }

        let count = 0;
        entries.forEach(([uid, data]) => {
            if(filterCourse !== 'all' && data.course !== filterCourse) return;
            count++;
            
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.innerHTML = `
                <div>
                    <div style="font-weight:600">${data.name}</div>
                    <div class="text-sm text-muted">Kurs: ${data.course || 'Keiner'}</div>
                </div>
                <div>→</div>
            `;
            li.onclick = () => this.openStudentModal(uid, data);
            ul.appendChild(li);
        });
        
        if(count === 0) {
            ul.innerHTML = `<li class="empty-state">Keine Schüler im Kurs ${filterCourse}.</li>`;
        }
    },

    openStudentModal(uid, data) {
        this.selectedStudentUid = uid;
        document.getElementById('modal-student-name').innerText = data.name;
        document.getElementById('modal-student-email').innerText = `Kurs: ${data.course || 'Keiner'}`;
        if(data.course) {
            document.getElementById('modal-student-course').value = data.course;
        }
        
        // Populate manual block select
        const sessionSelect = document.getElementById('modal-manual-session');
        sessionSelect.innerHTML = "";
        this.teacherSessionsData.forEach(([sid, sData]) => {
            const opt = document.createElement('option');
            opt.value = sid;
            opt.innerText = `${sData.courseName} - Block ${sData.blockNumber}`;
            sessionSelect.appendChild(opt);
        });

        document.getElementById('student-modal').classList.remove('hidden');
    },

    closeStudentModal() {
        document.getElementById('student-modal').classList.add('hidden');
        this.selectedStudentUid = null;
    },

    async saveStudentCourse() {
        if(!this.selectedStudentUid) return;
        const newCourse = document.getElementById('modal-student-course').value;
        try {
            await db.updateStudentCourse(this.selectedStudentUid, newCourse);
            this.allStudents[this.selectedStudentUid].course = newCourse;
            this.renderStudentList();
            document.getElementById('modal-student-email').innerText = `Kurs: ${newCourse}`;
            alert("Kurs erfolgreich aktualisiert.");
        } catch(e) {
            alert("Fehler: " + e.message);
        }
    },

    async addManualAttendance() {
        if(!this.selectedStudentUid) return;
        const sid = document.getElementById('modal-manual-session').value;
        const dateStr = document.getElementById('modal-manual-date').value;
        const timeStr = document.getElementById('modal-manual-time').value;
        
        if(!sid || !dateStr || !timeStr) {
            alert("Bitte Block, Datum und Zeit eingeben.");
            return;
        }

        try {
            // Create a pseudo Date object for the calculation
            const parts = dateStr.split('-');
            const tParts = timeStr.split(':');
            const fakeDate = new Date(parts[0], parts[1]-1, parts[2], tParts[0], tParts[1]);
            
            const hours = calculateHours(fakeDate);
            if(hours === 0) {
                alert("Am Wochenende können keine Zeiten erfasst werden.");
                return;
            }

            const sName = this.allStudents[this.selectedStudentUid].name;
            await db.addAttendance(sid, this.selectedStudentUid, sName + " (Manuell)", dateStr, fakeDate.getTime(), hours);
            alert("Manuelle Anwesenheit gespeichert!");
        } catch(e) {
            alert("Fehler: " + e.message);
        }
    },

    async exportStudentPdf() {
        if(!this.selectedStudentUid) return;
        
        const uid = this.selectedStudentUid;
        const studentName = this.allStudents[uid].name;
        const sessions = await db.getMySessions(uid);
        
        let html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: black; background: white;">
                <h2>Anwesenheitsreport: ${studentName}</h2>
                <hr>
        `;
        
        const sortedSessions = Object.entries(sessions).sort((a,b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
        
        let superTotal = 0;
        
        if(sortedSessions.length === 0) {
            html += `<p>Keine Anwesenheiten gefunden.</p>`;
        } else {
            sortedSessions.forEach(([sid, data]) => {
                html += `
                    <div style="margin-top: 20px; border: 1px solid #ccc; padding: 10px; border-radius: 5px;">
                        <h3>${data.courseName} - Block ${data.blockNumber} (${data.startDate} bis ${data.endDate})</h3>
                        <table style="width:100%; border-collapse: collapse; margin-top:10px;">
                            <tr style="background:#f0f0f0;">
                                <th style="text-align:left; border:1px solid #ccc; padding:5px;">Datum</th>
                                <th style="text-align:left; border:1px solid #ccc; padding:5px;">Scan-Zeit</th>
                                <th style="text-align:left; border:1px solid #ccc; padding:5px;">Gewertete Stunden</th>
                            </tr>
                `;
                
                let blockTotal = 0;
                
                if(data.attendances) {
                    const sortedDates = Object.keys(data.attendances).sort();
                    sortedDates.forEach(dateStr => {
                        const rec = data.attendances[dateStr][uid];
                        if(rec) {
                            const d = new Date(rec.time);
                            const t = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                            const h = rec.hours || 0;
                            blockTotal += h;
                            html += `
                                <tr>
                                    <td style="border:1px solid #ccc; padding:5px;">${dateStr}</td>
                                    <td style="border:1px solid #ccc; padding:5px;">${t} Uhr</td>
                                    <td style="border:1px solid #ccc; padding:5px;">${h.toFixed(2)} h</td>
                                </tr>
                            `;
                        }
                    });
                }
                
                superTotal += blockTotal;
                
                html += `
                        </table>
                        <p style="text-align:right; font-weight:bold; margin-top:10px;">Block Gesamt: ${blockTotal.toFixed(2)} h</p>
                    </div>
                `;
            });
        }
        
        html += `
            <h2 style="text-align:right; margin-top: 20px; color: #10b981;">Gesamtstunden: ${superTotal.toFixed(2)} h</h2>
            </div>
        `;
        
        const container = document.getElementById('student-pdf-export-container');
        container.innerHTML = html;
        container.style.display = 'block'; // Make it visible for html2pdf to render properly but keep it off-screen ideally
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        
        const opt = {
          margin:       0.5,
          filename:     `Anwesenheit_${studentName.replace(/\\s+/g, '_')}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        const worker = html2pdf().from(container).set(opt);
        await worker.save();
        
        container.innerHTML = "";
    }
};

window.app = AppController;

document.addEventListener('DOMContentLoaded', () => {
    AppController.init();
});
