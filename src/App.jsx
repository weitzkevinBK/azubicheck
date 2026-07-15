import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'
import {
  AlertTriangle,
  BookOpen,
  Check,
  Clock,
  Fingerprint,
  LogOut,
  Printer,
  UserCog,
  Users,
} from 'lucide-react'
import {
  auth,
  collection,
  createUserWithEmailAndPassword,
  deleteUser,
  db,
  doc,
  firebaseEnabled,
  onAuthStateChanged,
  onSnapshot,
  sendPasswordResetEmail,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
} from './firebase'
import './App.css'

const courseRenames = { 'GP-8': 'PFA-8' }
const courses = ['PFA-8', ...Array.from({ length: 17 }, (_, index) => `GP-${index + 9}`)]
const roleLabels = {
  student: 'Azubi',
  teacher: 'Lehrer',
  management: 'Verwaltung',
  admin: 'Admin',
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const nowTime = () => new Date().toTimeString().slice(0, 5)

const seedState = {
  users: [
    {
      id: 'admin-1',
      email: 'admin@azubicheck.local',
      password: 'demo1234',
      firstName: 'Kevin',
      lastName: 'Weitz',
      role: 'admin',
      courseId: '',
      assignedCourseIds: courses,
      active: true,
    },
    {
      id: 'teacher-1',
      email: 'lehrer@azubicheck.local',
      password: 'demo1234',
      firstName: 'Mara',
      lastName: 'Schulte',
      role: 'teacher',
      courseId: '',
      assignedCourseIds: ['GP-12', 'GP-13'],
      active: true,
    },
    {
      id: 'student-1',
      email: 'azubi@azubicheck.local',
      password: 'demo1234',
      firstName: 'Nina',
      lastName: 'Becker',
      role: 'student',
      courseId: 'GP-12',
      assignedCourseIds: [],
      active: true,
    },
    {
      id: 'student-2',
      email: 'samir@azubicheck.local',
      password: 'demo1234',
      firstName: 'Samir',
      lastName: 'Kaya',
      role: 'student',
      courseId: 'GP-12',
      assignedCourseIds: [],
      active: true,
    },
  ],
  blocks: [
    {
      id: 'block-demo-theory',
      courseId: 'GP-12',
      type: 'theory',
      blockNumber: '6',
      startDate: todayIso(),
      endDate: todayIso(),
      qrToken: 'AZUBICHECK:block-demo-theory',
      createdBy: 'teacher-1',
      active: true,
    },
    {
      id: 'block-demo-practice',
      courseId: 'GP-12',
      type: 'practice',
      blockNumber: '7',
      startDate: todayIso(),
      endDate: todayIso(),
      qrToken: 'AZUBICHECK:block-demo-practice',
      createdBy: 'teacher-1',
      active: true,
    },
  ],
  theoryAttendances: [],
  practiceAttendances: [],
  dayOverrides: [],
  settings: [
    {
      id: 'registration',
      teacherCode: 'lehrer-2026',
      teacherCodeUpdatedAt: new Date().toISOString(),
      managementCode: 'verwaltung-2026',
      managementCodeUpdatedAt: new Date().toISOString(),
    },
  ],
}

function loadStore() {
  const raw = localStorage.getItem('azubicheck:mvp')
  if (!raw) return normalizeStore(seedState)
  try {
    return normalizeStore({ ...seedState, ...JSON.parse(raw) })
  } catch {
    return normalizeStore(seedState)
  }
}

function saveStore(store) {
  localStorage.setItem('azubicheck:mvp', JSON.stringify(store))
}

const collectionMap = {
  users: 'users',
  blocks: 'blocks',
  theoryAttendances: 'theoryAttendances',
  practiceAttendances: 'practiceAttendances',
  dayOverrides: 'dayOverrides',
  settings: 'settings',
}

function emptyStore() {
  return {
    users: [],
    blocks: [],
    theoryAttendances: [],
    practiceAttendances: [],
    dayOverrides: [],
    settings: [],
  }
}

function normalizeInviteCode(code) {
  return code.trim().toLowerCase()
}

async function hashInviteCode(code) {
  const data = new TextEncoder().encode(normalizeInviteCode(code))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getRegistrationSettings(store) {
  return store.settings.find((item) => item.id === 'registration') || {}
}

function normalizeCourseId(courseId) {
  return courseRenames[courseId] || courseId
}

function normalizeCourseData(item) {
  const normalized = { ...item }
  if ('courseId' in normalized) normalized.courseId = normalizeCourseId(normalized.courseId)
  if (Array.isArray(normalized.assignedCourseIds)) {
    normalized.assignedCourseIds = Array.from(new Set(normalized.assignedCourseIds.map(normalizeCourseId)))
  }
  return normalized
}

function normalizeStore(store) {
  return {
    ...store,
    users: store.users.map(normalizeCourseData),
    blocks: store.blocks.map(normalizeCourseData),
    theoryAttendances: store.theoryAttendances.map(normalizeCourseData),
    practiceAttendances: store.practiceAttendances.map(normalizeCourseData),
    dayOverrides: store.dayOverrides.map(normalizeCourseData),
  }
}

function mergeCollection(store, key, docs) {
  const normalizedDocs = ['users', 'blocks', 'theoryAttendances', 'practiceAttendances', 'dayOverrides'].includes(key)
    ? docs.map(normalizeCourseData)
    : docs
  return { ...store, [key]: normalizedDocs }
}

function dateDiffDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.max(1, Math.floor((end - start) / 86400000) + 1)
}

function blockWeeks(block) {
  return Math.max(1, Math.ceil(dateDiffDays(block.startDate, block.endDate) / 7))
}

function targetHoursForBlock(block) {
  return blockWeeks(block) * (block.type === 'practice' ? 40 : 38)
}

function accruedTargetHoursForBlock(block, referenceDate = todayIso()) {
  if (block.startDate > referenceDate) return 0
  const effectiveEndDate = block.endDate < referenceDate ? block.endDate : referenceDate
  return Math.max(1, Math.ceil(dateDiffDays(block.startDate, effectiveEndDate) / 7)) * (block.type === 'practice' ? 40 : 38)
}

function blockOverlapsRange(block, startDate, endDate) {
  return block.startDate <= endDate && block.endDate >= startDate
}

function targetHoursForBlockRange(block, startDate, endDate) {
  if (!blockOverlapsRange(block, startDate, endDate)) return 0
  const effectiveStartDate = block.startDate > startDate ? block.startDate : startDate
  const effectiveEndDate = block.endDate < endDate ? block.endDate : endDate
  return Math.max(1, Math.ceil(dateDiffDays(effectiveStartDate, effectiveEndDate) / 7)) * (block.type === 'practice' ? 40 : 38)
}

function addDaysIso(date, days) {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + days)
  return value.toISOString().slice(0, 10)
}

function isWeekday(date) {
  const day = new Date(`${date}T00:00:00`).getDay()
  return day !== 0 && day !== 6
}

function nextSchoolDay(date) {
  let next = addDaysIso(date, 1)
  while (!isWeekday(next)) next = addDaysIso(next, 1)
  return next
}

function formatDate(date) {
  if (!date) return ''
  return date.split('-').reverse().join('.')
}

function getDateRangeLabel(startDate, endDate) {
  return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} bis ${formatDate(endDate)}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer)
  let value = ''
  bytes.forEach((byte) => {
    value += String.fromCharCode(byte)
  })
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlToBuffer(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function minutesFromTime(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function calculateTheoryHours({ checkInTime, checkOutTime, override, choice }) {
  if (choice === 'cancelled') return 0
  const dayStart = minutesFromTime(override?.officialStartTime || '07:15')
  const dayEnd = minutesFromTime(override?.officialEndTime || '14:15')
  const graceEnd = minutesFromTime('07:40')
  const fullCredit = Number(override?.fullCreditHours || 8)
  const checkIn = minutesFromTime(checkInTime)
  const checkOut = checkOutTime ? minutesFromTime(checkOutTime) : dayEnd

  if (override?.teacherConfirmedEarlyEnd) return fullCredit
  if (checkIn <= graceEnd && checkOut >= minutesFromTime('13:30')) return fullCredit

  const lateMinutes = Math.max(0, checkIn - dayStart)
  const earlyLeaveMinutes = Math.max(0, dayEnd - checkOut)
  return Math.max(0, fullCredit - (lateMinutes + earlyLeaveMinutes) / 60)
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getName(user) {
  return `${user.lastName}, ${user.firstName}`
}

function capitalizeNamePart(value) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function getFallbackProfileName(user) {
  const displayName = user.displayName?.trim()
  const rawName = displayName || user.email?.split('@')[0] || 'unbekannt account'
  const parts = rawName.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  return {
    firstName: capitalizeNamePart(parts[0] || 'Unbekannt'),
    lastName: parts.slice(1).map(capitalizeNamePart).join(' ') || 'Account',
  }
}

function summarizeStudent(store, student, period) {
  const studentBlocks = store.blocks.filter((block) => block.courseId === student.courseId && block.active)
  const scopedBlocks = period
    ? studentBlocks.filter((block) => blockOverlapsRange(block, period.startDate, period.endDate))
    : studentBlocks
  const target = scopedBlocks.reduce((sum, block) => {
    if (period) return sum + targetHoursForBlockRange(block, period.startDate, period.endDate)
    return sum + accruedTargetHoursForBlock(block)
  }, 0)
  const theory = store.theoryAttendances
    .filter((entry) => entry.studentId === student.id && (!period || (entry.date >= period.startDate && entry.date <= period.endDate)))
    .reduce((sum, entry) => sum + Number(entry.adjustedHours ?? entry.calculatedHours ?? 0), 0)
  const practice = store.practiceAttendances
    .filter((entry) => {
      if (entry.studentId !== student.id) return false
      if (!period) return true
      const block = studentBlocks.find((item) => item.id === entry.blockId)
      return block ? blockOverlapsRange(block, period.startDate, period.endDate) : false
    })
    .reduce((sum, entry) => sum + Number(entry.actualHours || 0), 0)
  const actual = theory + practice
  return { target, actual, missing: Math.max(0, target - actual) }
}

function getTheoryDayHours(store, block, studentId, date) {
  return store.theoryAttendances
    .filter((entry) => entry.blockId === block.id && entry.studentId === studentId && entry.date === date)
    .reduce((sum, entry) => sum + Number(entry.adjustedHours ?? entry.calculatedHours ?? 0), 0)
}

function groupAbsenceItems(items) {
  return items
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.source.localeCompare(b.source))
    .reduce((groups, item) => {
      const previous = groups[groups.length - 1]
      const canMerge = previous
        && previous.status === 'Fehltag'
        && item.status === 'Fehltag'
        && previous.source === item.source
        && item.startDate === nextSchoolDay(previous.endDate)
      if (canMerge) {
        previous.endDate = item.endDate
        previous.hours += item.hours
        return groups
      }
      groups.push({ ...item })
      return groups
    }, [])
}

function getAbsenceItems(store, student, period = { startDate: '0000-01-01', endDate: todayIso() }) {
  const items = []
  const referenceDate = period.endDate < todayIso() ? period.endDate : todayIso()
  const blocks = store.blocks.filter((block) =>
    block.courseId === student.courseId
    && block.active
    && block.startDate <= referenceDate
    && blockOverlapsRange(block, period.startDate, referenceDate),
  )

  blocks.forEach((block) => {
    const effectiveStartDate = block.startDate > period.startDate ? block.startDate : period.startDate
    const effectiveEndDate = block.endDate < referenceDate ? block.endDate : referenceDate
    if (block.type === 'theory') {
      for (let date = effectiveStartDate; date <= effectiveEndDate; date = addDaysIso(date, 1)) {
        if (!isWeekday(date)) continue
        const override = store.dayOverrides.find((item) => item.blockId === block.id && item.date === date)
        const targetHours = Number(override?.fullCreditHours || 8)
        const actualHours = getTheoryDayHours(store, block, student.id, date)
        const missingHours = Math.max(0, targetHours - actualHours)
        if (missingHours > 0.01) {
          items.push({
            startDate: date,
            endDate: date,
            source: `Theorie Block ${block.blockNumber}`,
            status: actualHours > 0 ? 'Teilfehlzeit' : 'Fehltag',
            hours: missingHours,
          })
        }
      }
      return
    }

    const targetHours = targetHoursForBlockRange(block, effectiveStartDate, effectiveEndDate)
    const actualHours = store.practiceAttendances
      .filter((entry) => entry.blockId === block.id && entry.studentId === student.id)
      .reduce((sum, entry) => sum + Number(entry.actualHours || 0), 0)
    const missingHours = Math.max(0, targetHours - actualHours)
    if (missingHours > 0.01) {
      items.push({
        startDate: block.startDate,
        endDate: effectiveEndDate,
        source: `Praxis Block ${block.blockNumber}`,
        status: 'Praxisstunden offen',
        hours: missingHours,
      })
    }
  })

  return groupAbsenceItems(items)
}

function openAbsenceReport(store, students, title, period) {
  const generatedAt = new Date().toLocaleString('de-DE')
  const reportPeriod = period || { startDate: '0000-01-01', endDate: todayIso() }
  const evaluatedUntil = reportPeriod.endDate < todayIso() ? reportPeriod.endDate : todayIso()
  const reportStudents = students
    .filter((student) => student.role === 'student' && student.active)
    .sort((a, b) => getName(a).localeCompare(getName(b)))
  const studentSections = reportStudents.map((student) => {
    const summary = summarizeStudent(store, student, { startDate: reportPeriod.startDate, endDate: evaluatedUntil })
    const absences = getAbsenceItems(store, student, { startDate: reportPeriod.startDate, endDate: reportPeriod.endDate })
    const rows = absences.length
      ? absences.map((item) => `
          <tr>
            <td>${escapeHtml(getDateRangeLabel(item.startDate, item.endDate))}</td>
            <td>${escapeHtml(item.source)}</td>
            <td>${escapeHtml(item.status)}</td>
            <td class="hours">${item.hours.toFixed(2)} h</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" class="empty">Keine Fehlzeiten bis heute.</td></tr>'
    return `
      <section class="student">
        <h2>${escapeHtml(student.lastName)}, ${escapeHtml(student.firstName)}</h2>
        <p class="meta">${escapeHtml(student.courseId)} · ${escapeHtml(student.email || '')}</p>
        <div class="stats">
          <span>Soll: <strong>${summary.target.toFixed(2)} h</strong></span>
          <span>Ist: <strong>${summary.actual.toFixed(2)} h</strong></span>
          <span>Fehlzeit: <strong>${summary.missing.toFixed(2)} h</strong></span>
        </div>
        <table>
          <thead><tr><th>Datum / Zeitraum</th><th>Quelle</th><th>Status</th><th>Stunden</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `
  }).join('')
  const html = `<!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          h2 { margin: 0; font-size: 18px; }
          .meta { color: #4b5563; margin: 4px 0 12px; }
          .student { break-inside: avoid; border-top: 1px solid #d1d5db; padding-top: 18px; margin-top: 22px; }
          .stats { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 12px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; }
          .hours { text-align: right; white-space: nowrap; }
          .empty { color: #6b7280; text-align: center; }
          @media print { body { margin: 18mm; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">Erstellt am ${escapeHtml(generatedAt)} · Zeitraum ${escapeHtml(formatDate(reportPeriod.startDate))} bis ${escapeHtml(formatDate(reportPeriod.endDate))} · ausgewertet bis ${escapeHtml(formatDate(evaluatedUntil))}</p>
        <button onclick="window.print()">Drucken / als PDF speichern</button>
        ${studentSections || '<p class="empty">Keine Azubis für diesen Bericht.</p>'}
      </body>
    </html>`
  const reportWindow = window.open('', '_blank')
  if (!reportWindow) return
  reportWindow.document.open()
  reportWindow.document.write(html)
  reportWindow.document.close()
  reportWindow.focus()
}

function App() {
  const [store, setStore] = useState(firebaseEnabled ? emptyStore : loadStore)
  const [currentUserId, setCurrentUserId] = useState(firebaseEnabled ? '' : localStorage.getItem('azubicheck:user') || '')
  const [authUser, setAuthUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(firebaseEnabled)
  const [usersLoaded, setUsersLoaded] = useState(!firebaseEnabled)
  const [authMode, setAuthMode] = useState('login')
  const [selectedCourse, setSelectedCourse] = useState('GP-12')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [activeBlockId, setActiveBlockId] = useState('block-demo-theory')
  const [checkoutContext, setCheckoutContext] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!firebaseEnabled) saveStore(store)
  }, [store])
  useEffect(() => {
    if (firebaseEnabled) return
    if (currentUserId) localStorage.setItem('azubicheck:user', currentUserId)
    else localStorage.removeItem('azubicheck:user')
  }, [currentUserId])

  useEffect(() => {
    if (!firebaseEnabled) return undefined
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setCurrentUserId(user?.uid || '')
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!firebaseEnabled || !authUser) {
      if (firebaseEnabled) {
        setStore(emptyStore())
        setUsersLoaded(false)
      }
      return undefined
    }

    setUsersLoaded(false)
    const unsubscribers = Object.entries(collectionMap).map(([key, name]) =>
      onSnapshot(collection(db, name), (snapshot) => {
        const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        setStore((previous) => mergeCollection(previous, key, docs))
        if (key === 'users') setUsersLoaded(true)
      }, () => {
        if (key === 'users') setUsersLoaded(true)
        setMessage('Firebase-Daten konnten nicht geladen werden. Prüfe Firestore und die Sicherheitsregeln.')
      }),
    )

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [authUser])

  const currentUser = store.users.find((user) => user.id === currentUserId)

  useEffect(() => {
    if (!firebaseEnabled || !authUser || !usersLoaded || currentUser) return undefined

    let cancelled = false
    async function recoverMissingProfile() {
      const profileName = getFallbackProfileName(authUser)
      try {
        await setDoc(doc(db, collectionMap.users, authUser.uid), {
          email: authUser.email || '',
          firstName: profileName.firstName,
          lastName: profileName.lastName,
          role: 'student',
          courseId: 'GP-12',
          assignedCourseIds: [],
          active: true,
          createdAt: new Date().toISOString(),
          profileRecovered: true,
        })
        if (!cancelled) {
          setSelectedCourse('GP-12')
          setMessage('Dein Azubi-Profil wurde angelegt. Die Verwaltung kann Kurs und Rolle jetzt prüfen.')
        }
      } catch {
        if (!cancelled) setMessage('Profil konnte nicht automatisch angelegt werden. Bitte an die Verwaltung wenden.')
      }
    }

    recoverMissingProfile()
    return () => {
      cancelled = true
    }
  }, [authUser, currentUser, usersLoaded])

  const visibleCourses = useMemo(() => {
    if (!currentUser) return courses
    if (currentUser.role === 'management' || currentUser.role === 'admin') return courses
    if (currentUser.role === 'teacher') {
      return currentUser.assignedCourseIds?.length ? currentUser.assignedCourseIds : []
    }
    return courses
  }, [currentUser])

  const selectedStudents = useMemo(
    () =>
      store.users
        .filter((user) => user.role === 'student' && user.courseId === selectedCourse && user.active)
        .sort((a, b) => getName(a).localeCompare(getName(b))),
    [store.users, selectedCourse],
  )

  function updateStore(recipe) {
    setStore((previous) => {
      const next = structuredClone(previous)
      recipe(next)
      return next
    })
  }

  async function login(email, password) {
    if (firebaseEnabled) {
      try {
        await signInWithEmailAndPassword(auth, email, password)
      } catch {
        setMessage('Login nicht gefunden oder Passwort falsch.')
      }
      return
    }
    const user = store.users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password)
    if (!user || !user.active) {
      setMessage('Login nicht gefunden. Nutze im Demo-Modus demo1234 als Passwort.')
      return
    }
    setCurrentUserId(user.id)
    if (user.role === 'teacher' && user.assignedCourseIds?.[0]) setSelectedCourse(user.assignedCourseIds[0])
    if (user.role === 'student') setSelectedCourse(user.courseId)
  }

  async function registerAccount(form) {
    const requestedRole = ['teacher', 'management'].includes(form.accountType) ? form.accountType : 'student'
    const inviteCode = requestedRole === 'teacher' ? form.teacherCode : form.managementCode
    if (requestedRole !== 'student' && !normalizeInviteCode(inviteCode || '')) {
      setMessage(requestedRole === 'teacher' ? 'Bitte gib den Lehrercode ein.' : 'Bitte gib den Verwaltungscode ein.')
      return
    }

    if (firebaseEnabled) {
      let credential
      try {
        credential = await createUserWithEmailAndPassword(auth, form.email, form.password)
        const inviteCodeHash = requestedRole !== 'student' ? await hashInviteCode(inviteCode) : ''
        const user = {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          role: requestedRole,
          courseId: requestedRole === 'student' ? form.courseId : '',
          assignedCourseIds: [],
          active: true,
          createdAt: new Date().toISOString(),
        }
        if (requestedRole === 'teacher') user.teacherInviteCodeHash = inviteCodeHash
        if (requestedRole === 'management') user.managementInviteCodeHash = inviteCodeHash
        await setDoc(doc(db, collectionMap.users, credential.user.uid), user)
        setSelectedCourse(user.courseId || user.assignedCourseIds[0] || 'GP-12')
      } catch (error) {
        if (credential?.user) await deleteUser(credential.user).catch(() => signOut(auth))
        if (error.code === 'auth/email-already-in-use') setMessage('Diese E-Mail ist bereits registriert.')
        else if (requestedRole === 'teacher') setMessage('Lehrerregistrierung nicht möglich. Prüfe den Lehrercode.')
        else if (requestedRole === 'management') setMessage('Verwaltungsregistrierung nicht möglich. Prüfe den Verwaltungscode.')
        else setMessage('Registrierung konnte nicht abgeschlossen werden.')
      }
      return
    }
    const exists = store.users.some((item) => item.email.toLowerCase() === form.email.toLowerCase())
    if (exists) {
      setMessage('Diese E-Mail ist bereits registriert.')
      return
    }
    const registrationSettings = getRegistrationSettings(store)
    if (requestedRole === 'teacher' && normalizeInviteCode(form.teacherCode || '') !== normalizeInviteCode(registrationSettings.teacherCode || 'lehrer-2026')) {
      setMessage('Der Lehrercode stimmt nicht.')
      return
    }
    if (requestedRole === 'management' && normalizeInviteCode(form.managementCode || '') !== normalizeInviteCode(registrationSettings.managementCode || 'verwaltung-2026')) {
      setMessage('Der Verwaltungscode stimmt nicht.')
      return
    }
    const user = {
      id: createId(requestedRole),
      email: form.email,
      password: form.password,
      firstName: form.firstName,
      lastName: form.lastName,
      role: requestedRole,
      courseId: requestedRole === 'student' ? form.courseId : '',
      assignedCourseIds: [],
      active: true,
    }
    updateStore((draft) => draft.users.push(user))
    setCurrentUserId(user.id)
    setSelectedCourse(user.courseId || 'GP-12')
  }

  async function saveInviteCode(type, code) {
    if (!normalizeInviteCode(code)) {
      setMessage(type === 'teacher' ? 'Bitte gib einen Lehrercode ein.' : 'Bitte gib einen Verwaltungscode ein.')
      return
    }
    const codeHash = await hashInviteCode(code)
    const label = type === 'teacher' ? 'Lehrercode' : 'Verwaltungscode'
    const keyPrefix = type === 'teacher' ? 'teacher' : 'management'
    const patch = {
      [`${keyPrefix}CodeHash`]: codeHash,
      [`${keyPrefix}CodeUpdatedAt`]: new Date().toISOString(),
      [`${keyPrefix}CodeUpdatedBy`]: currentUser.id,
    }
    if (firebaseEnabled) {
      await setDoc(doc(db, collectionMap.settings, 'registration'), patch, { merge: true })
      setMessage(`${label} wurde gespeichert.`)
      return
    }
    updateStore((draft) => {
      let settings = draft.settings.find((item) => item.id === 'registration')
      if (!settings) {
        settings = { id: 'registration' }
        draft.settings.push(settings)
      }
      Object.assign(settings, patch, { [`${keyPrefix}Code`]: code })
    })
    setMessage(`${label} wurde gespeichert.`)
  }

  async function logout() {
    if (firebaseEnabled) await signOut(auth)
    setCurrentUserId('')
    setMessage('')
  }

  async function createBlock(form) {
    const id = createId('block')
    const block = {
      id,
      courseId: form.courseId,
      type: form.type,
      blockNumber: form.blockNumber,
      startDate: form.startDate,
      endDate: form.endDate,
      qrToken: '',
      createdBy: currentUser.id,
      active: true,
      createdAt: new Date().toISOString(),
    }
    block.qrToken = `AZUBICHECK:${id}`
    if (firebaseEnabled) {
      await setDoc(doc(db, collectionMap.blocks, id), block)
      setActiveBlockId(id)
      setMessage('Block wurde erstellt.')
      return
    }
    updateStore((draft) => draft.blocks.unshift(block))
    setActiveBlockId(id)
    setMessage('Block wurde erstellt.')
  }

  async function verifyDevice() {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      return window.confirm('Dieses Gerät unterstützt keine Face ID / Windows Hello im Browser. Trotzdem mit Kamera-Scan fortfahren?')
    }
    try {
      const platformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      if (!platformAvailable) {
        return window.confirm('Auf diesem Gerät ist keine Face ID / Windows Hello Bestätigung verfügbar. Trotzdem mit Kamera-Scan fortfahren?')
      }

      const challenge = new Uint8Array(32)
      window.crypto.getRandomValues(challenge)

      if (currentUser.deviceCredentialId) {
        await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: 'required',
            allowCredentials: [
              {
                id: base64UrlToBuffer(currentUser.deviceCredentialId),
                type: 'public-key',
              },
            ],
          },
        })
        return true
      }

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'AzubiCheck' },
          user: {
            id: new TextEncoder().encode(currentUser.id).slice(0, 64),
            name: currentUser.email || currentUser.id,
            displayName: `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.email || 'AzubiCheck',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
          timeout: 60000,
          attestation: 'none',
        },
      })

      const deviceCredentialId = bufferToBase64Url(credential.rawId)
      if (firebaseEnabled) {
        await updateDoc(doc(db, collectionMap.users, currentUser.id), { deviceCredentialId })
      } else {
        updateStore((draft) => {
          const user = draft.users.find((item) => item.id === currentUser.id)
          if (user) user.deviceCredentialId = deviceCredentialId
        })
      }
      setMessage('Gerät wurde für Face ID / Gerätebestätigung verbunden.')
      return true
    } catch {
      setMessage('Face ID / Gerätebestätigung wurde abgebrochen oder konnte nicht bestätigt werden.')
      return false
    }
  }

  async function handleAttendanceScan(token, options = {}) {
    if (!currentUser || currentUser.role !== 'student') return
    const block = store.blocks.find((item) => item.qrToken === token && item.type === 'theory' && item.active)
    if (!block) {
      setMessage('QR-Code wurde nicht als aktiver Theorieblock erkannt.')
      return
    }
    if (block.courseId !== currentUser.courseId) {
      setMessage('Dieser QR-Code gehört nicht zu deinem Kurs.')
      return
    }
    if (!options.verified) {
      const verified = await verifyDevice()
      if (!verified) return
    }
    const date = todayIso()
    const existing = store.theoryAttendances.find(
      (item) => item.blockId === block.id && item.studentId === currentUser.id && item.date === date,
    )
    if (!existing) {
      const attendance = {
        id: createId('theory'),
        blockId: block.id,
        courseId: block.courseId,
        studentId: currentUser.id,
        date,
        checkInTime: nowTime(),
        checkOutTime: '',
        checkoutChoice: '',
        calculatedHours: 0,
        adjustedHours: 0,
        status: 'checked-in',
        createdAt: new Date().toISOString(),
      }
      if (firebaseEnabled) {
        await setDoc(doc(db, collectionMap.theoryAttendances, attendance.id), attendance)
        setMessage('Anwesenheit erfasst. Bitte am Unterrichtsende erneut scannen.')
        return
      }
      updateStore((draft) => {
        draft.theoryAttendances.push(attendance)
      })
      setMessage('Anwesenheit erfasst. Bitte am Unterrichtsende erneut scannen.')
      return
    }
    if (existing.status === 'checked-out') {
      setMessage('Du bist für heute bereits abgemeldet.')
      return
    }
    setCheckoutContext({ attendanceId: existing.id, blockId: block.id })
  }

  async function finishCheckout(choice) {
    if (!checkoutContext) return
    if (choice === 'cancelled') {
      setCheckoutContext(null)
      return
    }
    const attendance = store.theoryAttendances.find((item) => item.id === checkoutContext.attendanceId)
    const block = store.blocks.find((item) => item.id === checkoutContext.blockId)
    const override = store.dayOverrides.find((item) => item.blockId === block.id && item.date === attendance.date)
    const patch = {
      checkOutTime: nowTime(),
      checkoutChoice: choice,
      status: 'checked-out',
      updatedAt: new Date().toISOString(),
    }
    patch.calculatedHours = calculateTheoryHours({
      checkInTime: attendance.checkInTime,
      checkOutTime: patch.checkOutTime,
      override,
      choice,
    })
    patch.adjustedHours = patch.calculatedHours
    if (firebaseEnabled) {
      await updateDoc(doc(db, collectionMap.theoryAttendances, attendance.id), patch)
      setCheckoutContext(null)
      setMessage(choice === 'classEnded' ? 'Unterrichtsende gemeldet.' : 'Du wurdest abgemeldet.')
      return
    }
    updateStore((draft) => {
      const draftAttendance = draft.theoryAttendances.find((item) => item.id === checkoutContext.attendanceId)
      Object.assign(draftAttendance, patch)
    })
    setCheckoutContext(null)
    setMessage(choice === 'classEnded' ? 'Unterrichtsende gemeldet.' : 'Du wurdest abgemeldet.')
  }

  async function savePracticeHours(blockId, studentId, actualHours) {
    const existing = store.practiceAttendances.find((item) => item.blockId === blockId && item.studentId === studentId)
    if (firebaseEnabled) {
      if (existing) {
        await updateDoc(doc(db, collectionMap.practiceAttendances, existing.id), {
          actualHours: Number(actualHours || 0),
          enteredAt: new Date().toISOString(),
          enteredBy: currentUser.id,
        })
      } else {
        const block = store.blocks.find((item) => item.id === blockId)
        const id = createId('practice')
        await setDoc(doc(db, collectionMap.practiceAttendances, id), {
          id,
          blockId,
          courseId: block.courseId,
          studentId,
          actualHours: Number(actualHours || 0),
          note: '',
          enteredBy: currentUser.id,
          enteredAt: new Date().toISOString(),
        })
      }
      return
    }
    updateStore((draft) => {
      const existing = draft.practiceAttendances.find((item) => item.blockId === blockId && item.studentId === studentId)
      if (existing) {
        existing.actualHours = Number(actualHours || 0)
        existing.enteredAt = new Date().toISOString()
      } else {
        const block = draft.blocks.find((item) => item.id === blockId)
        draft.practiceAttendances.push({
          id: createId('practice'),
          blockId,
          courseId: block.courseId,
          studentId,
          actualHours: Number(actualHours || 0),
          note: '',
          enteredBy: currentUser.id,
          enteredAt: new Date().toISOString(),
        })
      }
    })
  }

  async function addManualTheoryAttendance(blockId, studentId, values) {
    const block = store.blocks.find((item) => item.id === blockId)
    const override = store.dayOverrides.find((item) => item.blockId === blockId && item.date === values.date)
    const calculatedHours = values.fullCredit
      ? Number(override?.fullCreditHours || 8)
      : calculateTheoryHours({
          checkInTime: values.checkInTime,
          checkOutTime: values.checkOutTime,
          override,
          choice: 'leftEarly',
        })
    const existing = store.theoryAttendances.find(
      (item) => item.blockId === blockId && item.studentId === studentId && item.date === values.date,
    )
    const record = {
      blockId,
      courseId: block.courseId,
      studentId,
      date: values.date,
      checkInTime: values.checkInTime,
      checkOutTime: values.checkOutTime,
      checkoutChoice: values.fullCredit ? 'teacherManualFullDay' : 'teacherManual',
      calculatedHours,
      adjustedHours: values.hours === '' ? calculatedHours : Number(values.hours),
      status: 'manual',
      enteredBy: currentUser.id,
      enteredAt: new Date().toISOString(),
    }

    if (firebaseEnabled) {
      if (existing) await updateDoc(doc(db, collectionMap.theoryAttendances, existing.id), record)
      else {
        const id = createId('theory')
        await setDoc(doc(db, collectionMap.theoryAttendances, id), { id, ...record })
      }
      setMessage('Theorie-Anwesenheit wurde manuell nachgetragen.')
      return
    }
    updateStore((draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      const override = draft.dayOverrides.find((item) => item.blockId === blockId && item.date === values.date)
      const calculatedHours = values.fullCredit
        ? Number(override?.fullCreditHours || 8)
        : calculateTheoryHours({
            checkInTime: values.checkInTime,
            checkOutTime: values.checkOutTime,
            override,
            choice: 'leftEarly',
          })
      const existing = draft.theoryAttendances.find(
        (item) => item.blockId === blockId && item.studentId === studentId && item.date === values.date,
      )

      const record = {
        blockId,
        courseId: block.courseId,
        studentId,
        date: values.date,
        checkInTime: values.checkInTime,
        checkOutTime: values.checkOutTime,
        checkoutChoice: values.fullCredit ? 'teacherManualFullDay' : 'teacherManual',
        calculatedHours,
        adjustedHours: values.hours === '' ? calculatedHours : Number(values.hours),
        status: 'manual',
        enteredBy: currentUser.id,
        enteredAt: new Date().toISOString(),
      }

      if (existing) Object.assign(existing, record)
      else draft.theoryAttendances.push({ id: createId('theory'), ...record })
    })
    setMessage('Theorie-Anwesenheit wurde manuell nachgetragen.')
  }

  async function saveOverride(blockId, date, patch) {
    const existing = store.dayOverrides.find((item) => item.blockId === blockId && item.date === date)
    const block = store.blocks.find((item) => item.id === blockId)
    if (firebaseEnabled) {
      if (existing) await updateDoc(doc(db, collectionMap.dayOverrides, existing.id), patch)
      else {
        const id = createId('override')
        await setDoc(doc(db, collectionMap.dayOverrides, id), {
          id,
          blockId,
          courseId: block.courseId,
          date,
          officialStartTime: '07:15',
          officialEndTime: '14:15',
          fullCreditHours: 8,
          teacherConfirmedEarlyEnd: false,
          note: '',
          ...patch,
        })
      }
      return
    }
    updateStore((draft) => {
      const existing = draft.dayOverrides.find((item) => item.blockId === blockId && item.date === date)
      if (existing) Object.assign(existing, patch)
      else {
        draft.dayOverrides.push({
          id: createId('override'),
          blockId,
          courseId: block.courseId,
          date,
          officialStartTime: '07:15',
          officialEndTime: '14:15',
          fullCreditHours: 8,
          teacherConfirmedEarlyEnd: false,
          note: '',
          ...patch,
        })
      }
    })
  }

  async function updateUser(userId, patch) {
    if (firebaseEnabled) {
      await updateDoc(doc(db, collectionMap.users, userId), patch)
      return
    }
    updateStore((draft) => {
      const user = draft.users.find((item) => item.id === userId)
      Object.assign(user, patch)
    })
  }

  async function resetPassword(email) {
    if (firebaseEnabled) {
      await sendPasswordResetEmail(auth, email)
      setMessage('Passwort-Reset-Mail wurde versendet.')
      return
    }
    alert('Im Firebase-Betrieb wird hier eine Passwort-Reset-Mail versendet.')
  }

  if (authLoading) {
    return <main className="auth-page"><section className="auth-card"><h1>AzubiCheck wird geladen</h1></section></main>
  }

  if (firebaseEnabled && authUser && !currentUser) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>{usersLoaded ? 'Profil wird angelegt' : 'Profil wird geladen'}</h1>
          <p>
            {usersLoaded
              ? 'Dein Login existiert bereits. AzubiCheck legt gerade das fehlende Profil für die Verwaltung an.'
              : 'Dein Account ist angemeldet, das AzubiCheck-Profil wird aus Firebase geladen.'}
          </p>
          <button className="btn secondary" onClick={logout}>Abmelden</button>
        </section>
      </main>
    )
  }

  if (!currentUser) {
    return <AuthScreen authMode={authMode} setAuthMode={setAuthMode} login={login} registerAccount={registerAccount} message={message} />
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Fingerprint size={24} />
          </div>
          <div>
            <strong>
              Azubi<span>Check.</span>
            </strong>
            <small>Anwesenheiten leicht gemacht</small>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="role-pill">{roleLabels[currentUser.role]}</span>
          <span className="user-chip">{currentUser.firstName} {currentUser.lastName}</span>
          <button className="icon-button" onClick={logout} title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {message && (
        <div className="notice">
          <Check size={18} />
          <span>{message}</span>
          <button onClick={() => setMessage('')}>Schließen</button>
        </div>
      )}

      {currentUser.role === 'student' && (
        <StudentDashboard
          store={store}
          student={currentUser}
          verifyDevice={verifyDevice}
          handleAttendanceScan={handleAttendanceScan}
        />
      )}

      {(currentUser.role === 'teacher' || currentUser.role === 'management' || currentUser.role === 'admin') && (
        <StaffDashboard
          store={store}
          currentUser={currentUser}
          visibleCourses={visibleCourses}
          selectedCourse={selectedCourse}
          setSelectedCourse={setSelectedCourse}
          selectedStudents={selectedStudents}
          selectedStudentId={selectedStudentId}
          setSelectedStudentId={setSelectedStudentId}
          activeBlockId={activeBlockId}
          setActiveBlockId={setActiveBlockId}
          createBlock={createBlock}
          savePracticeHours={savePracticeHours}
          addManualTheoryAttendance={addManualTheoryAttendance}
          saveOverride={saveOverride}
          updateUser={updateUser}
          resetPassword={resetPassword}
          saveInviteCode={saveInviteCode}
        />
      )}

      {checkoutContext && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Zweiter Scan erkannt</h2>
            <p>Was soll mit diesem Scan passieren?</p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => finishCheckout('cancelled')}>Abbrechen</button>
              <button className="btn warning" onClick={() => finishCheckout('leftEarly')}>Abmelden</button>
              <button className="btn primary" onClick={() => finishCheckout('classEnded')}>Unterricht beendet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AuthScreen({ authMode, setAuthMode, login, registerAccount, message }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    courseId: 'GP-12',
    accountType: 'student',
    teacherCode: '',
    managementCode: '',
  })

  function submit(event) {
    event.preventDefault()
    if (authMode === 'login') login(form.email, form.password)
    else registerAccount(form)
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark"><Fingerprint size={24} /></div>
          <strong>Azubi<span>Check.</span></strong>
        </div>
        <div className="tabs">
          <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Einloggen</button>
          <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Registrieren</button>
        </div>
        <form onSubmit={submit}>
          <h1>{authMode === 'login' ? 'Willkommen zurück' : 'Account erstellen'}</h1>
          <p>
            {authMode === 'login'
              ? firebaseEnabled ? 'Melde dich mit deinem Firebase-Account an.' : 'Demo-Zugänge: admin@azubicheck.local, lehrer@azubicheck.local, azubi@azubicheck.local. Passwort jeweils demo1234.'
              : 'Azubis wählen ihren Kurs. Lehrer und Verwaltung registrieren sich mit ihrem jeweiligen Code.'}
          </p>
          {authMode === 'register' && (
            <>
              <div className="account-type-toggle">
                <label>
                  <input type="radio" name="accountType" checked={form.accountType === 'student'} onChange={() => setForm({ ...form, accountType: 'student' })} />
                  Azubi
                </label>
                <label>
                  <input type="radio" name="accountType" checked={form.accountType === 'teacher'} onChange={() => setForm({ ...form, accountType: 'teacher' })} />
                  Lehrer
                </label>
                <label>
                  <input type="radio" name="accountType" checked={form.accountType === 'management'} onChange={() => setForm({ ...form, accountType: 'management' })} />
                  Verwaltung
                </label>
              </div>
              <div className="form-grid two">
                <label>Vorname<input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required /></label>
                <label>Nachname<input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required /></label>
                {form.accountType === 'student' ? (
                  <label>Kurs<select value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })}>{courses.map((course) => <option key={course}>{course}</option>)}</select></label>
                ) : form.accountType === 'teacher' ? (
                  <label>Lehrercode<input value={form.teacherCode} onChange={(event) => setForm({ ...form, teacherCode: event.target.value })} required /></label>
                ) : (
                  <label>Verwaltungscode<input value={form.managementCode} onChange={(event) => setForm({ ...form, managementCode: event.target.value })} required /></label>
                )}
              </div>
            </>
          )}
          <label>E-Mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>Passwort<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
          {message && <div className="form-message">{message}</div>}
          <button className="btn primary full">{authMode === 'login' ? 'Einloggen' : 'Registrieren'}</button>
        </form>
      </section>
    </main>
  )
}

function StudentDashboard({ store, student, verifyDevice, handleAttendanceScan }) {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanBusy, setScanBusy] = useState(false)
  const summary = summarizeStudent(store, student)
  const entries = store.theoryAttendances
    .filter((item) => item.studentId === student.id)
    .map((item) => ({ ...item, block: store.blocks.find((block) => block.id === item.blockId) }))
    .sort((a, b) => b.date.localeCompare(a.date))

  async function startScanFlow() {
    setScanBusy(true)
    const verified = await verifyDevice()
    setScanBusy(false)
    if (verified) setScannerOpen(true)
  }

  async function submitScannedToken(token) {
    setScannerOpen(false)
    await handleAttendanceScan(token, { verified: true })
  }

  return (
    <main className="dashboard-grid">
      <section className="panel student-hero">
        <div>
          <p className="eyebrow">Mein Kurs</p>
          <h1>{student.courseId}</h1>
          <p>Scanne den QR-Code deines Theorieblocks nach der Gerätebestätigung.</p>
        </div>
        <div className="scan-card">
          <Fingerprint size={34} />
          <p>Bestätige dich zuerst mit Face ID oder Geräte-PIN. Danach öffnet sich die Kamera für den QR-Code im Klassenraum.</p>
          <button className="btn primary full" onClick={startScanFlow} disabled={scanBusy}>
            {scanBusy ? 'Bestätigung läuft...' : 'Anwesend'}
          </button>
        </div>
      </section>
      {scannerOpen && (
        <QrScanModal
          onScan={submitScannedToken}
          onClose={() => setScannerOpen(false)}
        />
      )}
      <StatsCards summary={summary} />
      <section className="panel span-2">
        <h2>Meine Anwesenheiten</h2>
        <div className="table">
          <div className="row header"><span>Datum</span><span>Block</span><span>Status</span><span>Stunden</span></div>
          {entries.map((entry) => (
            <div className="row" key={entry.id}>
              <span>{entry.date}</span>
              <span>{entry.block?.courseId} Block {entry.block?.blockNumber}</span>
              <span>{entry.status === 'checked-out' ? 'Abgeschlossen' : 'Eingecheckt'}</span>
              <strong>{Number(entry.adjustedHours || entry.calculatedHours || 0).toFixed(2)} h</strong>
            </div>
          ))}
          {!entries.length && <div className="empty">Noch keine Anwesenheiten vorhanden.</div>}
        </div>
      </section>
    </main>
  )
}

function StaffDashboard(props) {
  const {
    store,
    currentUser,
    visibleCourses,
    selectedCourse,
    setSelectedCourse,
    selectedStudents,
    selectedStudentId,
    setSelectedStudentId,
    activeBlockId,
    setActiveBlockId,
    createBlock,
    savePracticeHours,
    addManualTheoryAttendance,
    saveOverride,
    updateUser,
    resetPassword,
    saveInviteCode,
  } = props
  const [tab, setTab] = useState('students')
  const [studentSearch, setStudentSearch] = useState('')
  const canSearchAllStudents = currentUser.role === 'admin' || currentUser.role === 'management'
  const normalizedSearch = studentSearch.trim().toLowerCase()
  const displayedStudents = useMemo(() => {
    if (!canSearchAllStudents || !normalizedSearch) return selectedStudents
    return store.users
      .filter((user) => {
        if (user.role !== 'student' || !user.active) return false
        const haystack = `${user.firstName} ${user.lastName} ${user.email || ''} ${user.courseId}`.toLowerCase()
        return haystack.includes(normalizedSearch)
      })
      .sort((a, b) => getName(a).localeCompare(getName(b)))
  }, [canSearchAllStudents, normalizedSearch, selectedStudents, store.users])
  const selectedStudent = store.users.find((user) => user.id === selectedStudentId) || displayedStudents[0]
  const courseBlocks = store.blocks.filter((block) => block.courseId === selectedCourse && block.active)
  const activeBlock = store.blocks.find((block) => block.id === activeBlockId) || courseBlocks[0]

  useEffect(() => {
    if (visibleCourses.length && !visibleCourses.includes(selectedCourse)) setSelectedCourse(visibleCourses[0])
  }, [visibleCourses, selectedCourse, setSelectedCourse])

  return (
    <main className="staff-layout">
      <aside className="sidebar panel">
        <label>Kurs
          <select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>
            {visibleCourses.map((course) => <option key={course}>{course}</option>)}
          </select>
        </label>
        <nav className="side-nav">
          <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}><Users size={18} /> Azubis</button>
          <button className={tab === 'blocks' ? 'active' : ''} onClick={() => setTab('blocks')}><BookOpen size={18} /> Blöcke</button>
          {(currentUser.role === 'admin' || currentUser.role === 'management') && (
            <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}><UserCog size={18} /> Verwaltung</button>
          )}
        </nav>
      </aside>
      <section className="content">
        {tab === 'students' && (
          <StudentOverview
            store={store}
            students={displayedStudents}
            selectedStudent={selectedStudent}
            selectedCourse={selectedCourse}
            setSelectedStudentId={setSelectedStudentId}
            canSearchAllStudents={canSearchAllStudents}
            studentSearch={studentSearch}
            setStudentSearch={setStudentSearch}
          />
        )}
        {tab === 'blocks' && (
          <BlockManager
            store={store}
            selectedCourse={selectedCourse}
            blocks={courseBlocks}
            activeBlock={activeBlock}
            setActiveBlockId={setActiveBlockId}
            createBlock={createBlock}
            savePracticeHours={savePracticeHours}
            addManualTheoryAttendance={addManualTheoryAttendance}
            saveOverride={saveOverride}
          />
        )}
        {tab === 'admin' && <AdminPanel store={store} currentUser={currentUser} updateUser={updateUser} resetPassword={resetPassword} saveInviteCode={saveInviteCode} />}
      </section>
    </main>
  )
}

function StatsCards({ summary }) {
  return (
    <section className="stats">
      <article className="stat-card"><Clock size={20} /><span>Soll</span><strong>{summary.target.toFixed(2)} h</strong></article>
      <article className="stat-card"><Check size={20} /><span>Ist</span><strong>{summary.actual.toFixed(2)} h</strong></article>
      <article className={`stat-card ${summary.missing > 0 ? 'danger' : 'ok'}`}><AlertTriangle size={20} /><span>Fehlzeit</span><strong>{summary.missing.toFixed(2)} h</strong></article>
    </section>
  )
}

function QrScanModal({ onScan, onClose }) {
  const readerId = 'azubicheck-camera-reader'
  const lockedRef = useRef(false)
  const [scanError, setScanError] = useState('')

  useEffect(() => {
    let mounted = true
    const scanner = new Html5Qrcode(readerId)

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      async (decodedText) => {
        if (lockedRef.current) return
        lockedRef.current = true
        await scanner.stop().catch(() => {})
        if (mounted) onScan(decodedText)
      },
      () => {},
    ).catch(() => {
      if (mounted) setScanError('Kamera konnte nicht gestartet werden. Bitte Kamerazugriff erlauben und erneut versuchen.')
    })

    return () => {
      mounted = false
      scanner.stop().catch(() => {})
    }
  }, [onScan])

  return (
    <div className="modal-backdrop">
      <section className="modal qr-modal">
        <h2>QR-Code scannen</h2>
        <p>Halte die Kamera auf den ausgedruckten Code im Klassenraum.</p>
        <div id={readerId} className="camera-reader" />
        {scanError && <div className="form-message">{scanError}</div>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button>
        </div>
      </section>
    </div>
  )
}

function StudentOverview({ store, students, selectedStudent, selectedCourse, setSelectedStudentId, canSearchAllStudents, studentSearch, setStudentSearch }) {
  const [reportRequest, setReportRequest] = useState(null)
  const [reportPeriod, setReportPeriod] = useState({ startDate: `${new Date().getFullYear()}-01-01`, endDate: todayIso() })
  const summary = selectedStudent ? summarizeStudent(store, selectedStudent) : null
  const details = selectedStudent
    ? [
        ...store.theoryAttendances.filter((entry) => entry.studentId === selectedStudent.id).map((entry) => ({ ...entry, source: 'Theorie' })),
        ...store.practiceAttendances.filter((entry) => entry.studentId === selectedStudent.id).map((entry) => ({ ...entry, date: entry.enteredAt?.slice(0, 10), source: 'Praxis', adjustedHours: entry.actualHours })),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)))
    : []
  return (
    <div className="split">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h1>Azubis</h1>
            <p>{canSearchAllStudents ? 'Suche kursübergreifend nach Vorname, Nachname, E-Mail oder Kurs.' : 'Alphabetisch sortiert nach Nachname.'}</p>
          </div>
          <button className="btn secondary" onClick={() => setReportRequest({ students, title: studentSearch ? 'Fehlzeiten Suchergebnis' : `Fehlzeiten Kurs ${selectedCourse}` })}>
            <Printer size={18} /> Liste
          </button>
        </div>
        {canSearchAllStudents && (
          <label className="student-search">
            Azubi suchen
            <input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Vorname, Nachname, E-Mail oder Kurs" />
          </label>
        )}
        <div className="student-list">
          {students.map((student) => {
            const row = summarizeStudent(store, student)
            return (
              <button key={student.id} className={student.id === selectedStudent?.id ? 'student-row active' : 'student-row'} onClick={() => setSelectedStudentId(student.id)}>
                <span><strong>{getName(student)}</strong><small>{student.courseId}</small></span>
                <span>{row.target.toFixed(1)} h</span>
                <span>{row.actual.toFixed(1)} h</span>
                <span className={row.missing > 0 ? 'text-danger' : 'text-ok'}>{row.missing.toFixed(1)} h</span>
              </button>
            )
          })}
          {!students.length && <div className="empty">{studentSearch ? 'Keine passenden Azubis gefunden.' : 'Keine Azubis in diesem Kurs.'}</div>}
        </div>
      </section>
      <section className="panel">
        {selectedStudent && summary ? (
          <>
            <div className="panel-heading">
              <div>
                <h2>{selectedStudent.firstName} {selectedStudent.lastName}</h2>
                <p>{selectedStudent.courseId}</p>
              </div>
              <button className="btn secondary" onClick={() => setReportRequest({ students: [selectedStudent], title: `Fehlzeiten ${selectedStudent.firstName} ${selectedStudent.lastName}` })}>
                <Printer size={18} /> Azubi
              </button>
            </div>
            <StatsCards summary={summary} />
            <h3>Fehlzeiten nach Tagen und Blöcken</h3>
            <div className="table compact">
              <div className="row header"><span>Datum</span><span>Quelle</span><span>Status</span><span>Stunden</span></div>
              {details.map((entry) => (
                <div className="row" key={entry.id}>
                  <span>{entry.date}</span>
                  <span>{entry.source}</span>
                  <span>{entry.status || 'eingetragen'}</span>
                  <strong>{Number(entry.adjustedHours || entry.calculatedHours || 0).toFixed(2)} h</strong>
                </div>
              ))}
              {!details.length && <div className="empty">Noch keine Tagesdaten.</div>}
            </div>
          </>
        ) : (
          <div className="empty">Wähle einen Azubi aus.</div>
        )}
      </section>
      {reportRequest && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(event) => {
              event.preventDefault()
              if (reportPeriod.startDate > reportPeriod.endDate) return
              openAbsenceReport(store, reportRequest.students, reportRequest.title, reportPeriod)
              setReportRequest(null)
            }}
          >
            <h2>Zeitraum auswählen</h2>
            <p>Der Bericht enthält nur Anwesenheiten und Fehlzeiten innerhalb dieses Datumsbereichs.</p>
            <div className="form-grid two">
              <label>Von
                <input type="date" value={reportPeriod.startDate} onChange={(event) => setReportPeriod({ ...reportPeriod, startDate: event.target.value })} required />
              </label>
              <label>Bis
                <input type="date" value={reportPeriod.endDate} onChange={(event) => setReportPeriod({ ...reportPeriod, endDate: event.target.value })} required />
              </label>
            </div>
            {reportPeriod.startDate > reportPeriod.endDate && <div className="form-message">Das Startdatum muss vor dem Enddatum liegen.</div>}
            <div className="modal-actions">
              <button className="btn primary" disabled={reportPeriod.startDate > reportPeriod.endDate}><Printer size={18} /> Bericht erstellen</button>
              <button type="button" className="btn secondary" onClick={() => setReportRequest(null)}>Abbrechen</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function BlockManager({ store, selectedCourse, blocks, activeBlock, setActiveBlockId, createBlock, savePracticeHours, addManualTheoryAttendance, saveOverride }) {
  const [form, setForm] = useState({ courseId: selectedCourse, type: 'theory', blockNumber: '', startDate: todayIso(), endDate: todayIso() })
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => setForm((previous) => ({ ...previous, courseId: selectedCourse })), [selectedCourse])
  useEffect(() => {
    if (!activeBlock?.qrToken) {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(activeBlock.qrToken, { width: 280, margin: 1 }).then(setQrDataUrl)
  }, [activeBlock])

  const earlyEndWarnings = useMemo(() => {
    if (!activeBlock || activeBlock.type !== 'theory') return []
    const courseStudents = store.users.filter((user) => user.role === 'student' && user.courseId === activeBlock.courseId)
    const threshold = Math.floor(courseStudents.length / 2) + 1
    const grouped = {}
    store.theoryAttendances
      .filter((entry) => entry.blockId === activeBlock.id && entry.checkoutChoice === 'classEnded' && minutesFromTime(entry.checkOutTime || '14:15') < minutesFromTime('13:30'))
      .forEach((entry) => {
        grouped[entry.date] = (grouped[entry.date] || 0) + 1
      })
    return Object.entries(grouped).filter(([, count]) => count >= threshold).map(([date, count]) => ({ date, count, threshold }))
  }, [activeBlock, store])

  return (
    <div className="split">
      <section className="panel">
        <h1>Blöcke</h1>
        <form className="block-form" onSubmit={(event) => { event.preventDefault(); createBlock(form) }}>
          <div className="form-grid two">
            <label>Art<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="theory">Theorie</option><option value="practice">Praxis</option></select></label>
            <label>Blocknummer<input value={form.blockNumber} onChange={(event) => setForm({ ...form, blockNumber: event.target.value })} required /></label>
            <label>Start<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
            <label>Ende<input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
          </div>
          <button className="btn primary full">Block anlegen</button>
        </form>
        <div className="block-list">
          {blocks.map((block) => (
            <button key={block.id} className={block.id === activeBlock?.id ? 'block-row active' : 'block-row'} onClick={() => setActiveBlockId(block.id)}>
              <span><strong>{block.type === 'theory' ? 'Theorie' : 'Praxis'} Block {block.blockNumber}</strong><small>{block.startDate} bis {block.endDate}</small></span>
              <strong>{targetHoursForBlock(block)} h</strong>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        {activeBlock ? (
          <>
            <h2>{activeBlock.courseId} Block {activeBlock.blockNumber}</h2>
            <p>{activeBlock.type === 'theory' ? 'Theorieblock mit QR-Code' : 'Praxisblock mit manueller Stundenerfassung'} · Soll {targetHoursForBlock(activeBlock)} h</p>
            {activeBlock.type === 'theory' ? (
              <TheoryBlockDetail block={activeBlock} qrDataUrl={qrDataUrl} warnings={earlyEndWarnings} saveOverride={saveOverride} addManualTheoryAttendance={addManualTheoryAttendance} store={store} />
            ) : (
              <PracticeBlockDetail block={activeBlock} store={store} savePracticeHours={savePracticeHours} />
            )}
          </>
        ) : <div className="empty">Noch kein Block in diesem Kurs.</div>}
      </section>
    </div>
  )
}

function TheoryBlockDetail({ block, qrDataUrl, warnings, saveOverride, addManualTheoryAttendance, store }) {
  const [date, setDate] = useState(todayIso())
  const courseStudents = store.users
    .filter((user) => user.role === 'student' && user.courseId === block.courseId && user.active)
    .sort((a, b) => getName(a).localeCompare(getName(b)))
  const [manualEntry, setManualEntry] = useState({
    studentId: courseStudents[0]?.id || '',
    date: todayIso(),
    checkInTime: '07:15',
    checkOutTime: '14:15',
    fullCredit: true,
    hours: '',
  })
  const override = store.dayOverrides.find((item) => item.blockId === block.id && item.date === date) || {}
  const entries = store.theoryAttendances.filter((item) => item.blockId === block.id && item.date === date)

  useEffect(() => {
    if (!manualEntry.studentId && courseStudents[0]?.id) {
      setManualEntry((previous) => ({ ...previous, studentId: courseStudents[0].id }))
    }
  }, [courseStudents, manualEntry.studentId])

  function submitManualEntry(event) {
    event.preventDefault()
    if (!manualEntry.studentId) return
    addManualTheoryAttendance(block.id, manualEntry.studentId, manualEntry)
    setDate(manualEntry.date)
  }

  return (
    <div className="detail-stack">
      <div className="qr-panel">
        {qrDataUrl && <img src={qrDataUrl} alt="QR-Code für diesen Block" />}
        <code>{block.qrToken}</code>
      </div>
      {!!warnings.length && warnings.map((warning) => (
        <div className="danger-box" key={warning.date}>
          <AlertTriangle size={18} />
          <span>{warning.count} Meldungen für Unterrichtsende am {warning.date}. Bitte bestätigen.</span>
          <button onClick={() => saveOverride(block.id, warning.date, { teacherConfirmedEarlyEnd: true, officialEndTime: '12:00', note: 'Frühes Ende bestätigt' })}>Bestätigen</button>
        </div>
      ))}
      <div className="day-editor">
        <label>Tag<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Start<input type="time" value={override.officialStartTime || '07:15'} onChange={(event) => saveOverride(block.id, date, { officialStartTime: event.target.value })} /></label>
        <label>Ende<input type="time" value={override.officialEndTime || '14:15'} onChange={(event) => saveOverride(block.id, date, { officialEndTime: event.target.value })} /></label>
        <label className="checkbox"><input type="checkbox" checked={!!override.teacherConfirmedEarlyEnd} onChange={(event) => saveOverride(block.id, date, { teacherConfirmedEarlyEnd: event.target.checked })} /> Voller Tag trotz Sonderzeit</label>
      </div>
      <form className="manual-entry-card" onSubmit={submitManualEntry}>
        <div>
          <h3>Theorie-Tag manuell nachtragen</h3>
          <p>Für Azubis ohne Handy oder vergessenen Scan. Ein bestehender Eintrag für denselben Tag wird aktualisiert.</p>
        </div>
        <div className="manual-entry-grid">
          <label>Azubi
            <select value={manualEntry.studentId} onChange={(event) => setManualEntry({ ...manualEntry, studentId: event.target.value })}>
              {courseStudents.map((student) => <option value={student.id} key={student.id}>{getName(student)}</option>)}
            </select>
          </label>
          <label>Datum<input type="date" value={manualEntry.date} onChange={(event) => setManualEntry({ ...manualEntry, date: event.target.value })} /></label>
          <label>Von<input type="time" value={manualEntry.checkInTime} onChange={(event) => setManualEntry({ ...manualEntry, checkInTime: event.target.value })} /></label>
          <label>Bis<input type="time" value={manualEntry.checkOutTime} onChange={(event) => setManualEntry({ ...manualEntry, checkOutTime: event.target.value })} /></label>
          <label className="checkbox"><input type="checkbox" checked={manualEntry.fullCredit} onChange={(event) => setManualEntry({ ...manualEntry, fullCredit: event.target.checked })} /> vollen Tag gutschreiben</label>
          <label>Stunden manuell
            <input type="number" min="0" step="0.25" value={manualEntry.hours} placeholder="automatisch" onChange={(event) => setManualEntry({ ...manualEntry, hours: event.target.value })} />
          </label>
        </div>
        <button className="btn secondary">Nachtragen</button>
      </form>
      <div className="table compact">
        <div className="row header"><span>Azubi</span><span>In</span><span>Out</span><span>Stunden</span></div>
        {entries.map((entry) => {
          const student = store.users.find((user) => user.id === entry.studentId)
          return <div className="row" key={entry.id}><span>{student ? getName(student) : entry.studentId}</span><span>{entry.checkInTime}</span><span>{entry.checkOutTime || '-'}</span><strong>{Number(entry.adjustedHours || entry.calculatedHours || 0).toFixed(2)} h</strong></div>
        })}
        {!entries.length && <div className="empty">Für diesen Tag noch keine Scans.</div>}
      </div>
    </div>
  )
}

function PracticeBlockDetail({ block, store, savePracticeHours }) {
  const students = store.users.filter((user) => user.role === 'student' && user.courseId === block.courseId).sort((a, b) => getName(a).localeCompare(getName(b)))
  return (
    <div className="table compact">
      <div className="row header"><span>Azubi</span><span>Soll</span><span>Ist eintragen</span><span>Status</span></div>
      {students.map((student) => {
        const existing = store.practiceAttendances.find((entry) => entry.blockId === block.id && entry.studentId === student.id)
        const actual = existing?.actualHours ?? targetHoursForBlock(block)
        return (
          <div className="row" key={student.id}>
            <span>{getName(student)}</span>
            <span>{targetHoursForBlock(block)} h</span>
            <input className="hours-input" type="number" min="0" step="0.25" defaultValue={actual} onBlur={(event) => savePracticeHours(block.id, student.id, event.target.value)} />
            <span className={Number(actual) >= targetHoursForBlock(block) ? 'text-ok' : 'text-danger'}>{Number(actual) >= targetHoursForBlock(block) ? 'ok' : 'fehlend'}</span>
          </div>
        )
      })}
    </div>
  )
}

function AdminPanel({ store, currentUser, updateUser, resetPassword, saveInviteCode }) {
  const [teacherCode, setTeacherCode] = useState('')
  const [managementCode, setManagementCode] = useState('')
  const manageable = store.users.sort((a, b) => getName(a).localeCompare(getName(b)))
  const registrationSettings = getRegistrationSettings(store)
  const canAssignAdmin = currentUser.role === 'admin'
  return (
    <section className="panel">
      <h1>Verwaltung</h1>
      <p>Rollen, Kurszuordnung, Lehrerrechte und Registrierungscodes.</p>
      <div className="invite-code-grid">
        <div className="invite-code-panel">
          <div>
            <strong>Lehrerregistrierung</strong>
            <small>{registrationSettings.teacherCodeUpdatedAt ? `Code zuletzt geändert: ${registrationSettings.teacherCodeUpdatedAt.slice(0, 10)}` : 'Noch kein Lehrercode hinterlegt.'}</small>
          </div>
          <label>
            Neuer Lehrercode
            <input value={teacherCode} onChange={(event) => setTeacherCode(event.target.value)} placeholder="z. B. BK-Lehrer-2026" />
          </label>
          <button
            className="btn secondary"
            onClick={() => {
              saveInviteCode('teacher', teacherCode)
              setTeacherCode('')
            }}
          >
            Code speichern
          </button>
        </div>
        <div className="invite-code-panel">
        <div>
          <strong>Verwaltungsregistrierung</strong>
          <small>{registrationSettings.managementCodeUpdatedAt ? `Code zuletzt geändert: ${registrationSettings.managementCodeUpdatedAt.slice(0, 10)}` : 'Noch kein Verwaltungscode hinterlegt.'}</small>
        </div>
        <label>
          Neuer Verwaltungscode
          <input value={managementCode} onChange={(event) => setManagementCode(event.target.value)} placeholder="z. B. BK-Verwaltung-2026" />
        </label>
        <button
          className="btn secondary"
          onClick={() => {
            saveInviteCode('management', managementCode)
            setManagementCode('')
          }}
        >
          Code speichern
        </button>
        </div>
      </div>
      <div className="admin-list">
        {manageable.map((user) => {
          const isSelf = user.id === currentUser.id
          const isProtectedAdmin = currentUser.role !== 'admin' && user.role === 'admin'
          const canEditUser = !isSelf && !isProtectedAdmin
          return (
          <div className={isSelf ? 'admin-row current' : 'admin-row'} key={user.id}>
            <div>
              <strong>{user.firstName} {user.lastName}</strong>
              <small>{user.email}</small>
              <small>{roleLabels[user.role]}{isSelf ? ' · eigener Account' : ''}</small>
            </div>
            <select disabled={!canEditUser} value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value })}>
              <option value="student">Azubi</option>
              <option value="teacher">Lehrer</option>
              <option value="management">Verwaltung</option>
              {canAssignAdmin && <option value="admin">Admin</option>}
            </select>
            {user.role === 'student' ? (
              <select disabled={!canEditUser} value={user.courseId} onChange={(event) => updateUser(user.id, { courseId: event.target.value })}>{courses.map((course) => <option key={course}>{course}</option>)}</select>
            ) : user.role === 'teacher' ? (
              <CourseCheckboxes user={user} updateUser={updateUser} disabled={!canEditUser} />
            ) : (
              <div className="all-courses-note">Zugriff auf alle Kurse</div>
            )}
            <button className="btn secondary" disabled={isSelf} onClick={() => resetPassword(user.email)}>Passwort-Reset</button>
          </div>
          )
        })}
      </div>
    </section>
  )
}

function CourseCheckboxes({ user, updateUser, disabled }) {
  const assigned = user.assignedCourseIds || []
  return (
    <div className="course-checks">
      {courses.map((course) => (
        <label key={course}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={assigned.includes(course)}
            onChange={(event) => {
              const next = event.target.checked ? [...assigned, course] : assigned.filter((item) => item !== course)
              updateUser(user.id, { assignedCourseIds: next })
            }}
          />
          {course}
        </label>
      ))}
    </div>
  )
}

export default App
