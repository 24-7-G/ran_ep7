import { useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";

import { auth, db } from "./lib/firebase";
import { ADMIN_UID } from "./lib/constants";
import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import Header from "./components/common/Header";
import Modal from "./components/common/Modal";
import RaidPage from "./pages/RaidPage";
import BHPage from "./pages/BHPage";
import CWPage from "./pages/CWPage";
import TicketPage from "./pages/TicketPage";
import AdminPage from "./pages/AdminPage";
import { DisplayTimezoneProvider } from "./lib/displayTimezone";
import { downloadBackup } from "./lib/adminBackup";
import ranVIcon from "./assets/ran-v-icon.png";
import bhGuideImage from "./assets/bh-dashboard-reference.png";
import guildWarGuideImage from "./bosses/guild-war.png";
import heroGuideImage from "./assets/hero.png";

export default function App() {
  const [page, setPage] = useState("raid");
  const [user, setUser] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [adminAccess, setAdminAccess] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", pin: "" });
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerFormKey, setRegisterFormKey] = useState(0);
  const [backupPromptOpen, setBackupPromptOpen] = useState(false);
  const [backupPromptBusy, setBackupPromptBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideMode, setGuideMode] = useState("user");
  const [guideFilter, setGuideFilter] = useState("ALL");
  const backupPromptShownRef = useRef(false);

  const localDayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  const backupPromptKey = (uid) => `ran_ep7_backup_prompt_${uid}`;

  useEffect(() => {
    let unsubscribeAdmin = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAdminAccess(false);

      if (unsubscribeAdmin) {
        unsubscribeAdmin();
        unsubscribeAdmin = null;
      }

      if (!currentUser) {
        backupPromptShownRef.current = false;
        setBackupPromptOpen(false);
        return;
      }

      backupPromptShownRef.current = false;
      const checkBackupReminder = (adminData) => {
        const mode = String(adminData?.backupReminderDays ?? "1");
        if (mode === "off") return false;
        if (backupPromptShownRef.current) return false;

        const today = localDayKey();
        const lastPromptDay = localStorage.getItem(backupPromptKey(currentUser.uid)) || "";
        if (lastPromptDay === today) return false;

        const last = adminData?.lastBackupAt?.toMillis?.() || (adminData?.lastBackupAt ? new Date(adminData.lastBackupAt).getTime() : 0);
        if (last) {
          const lastDate = new Date(last);
          const sameDay = lastDate.getFullYear() === new Date().getFullYear()
            && lastDate.getMonth() === new Date().getMonth()
            && lastDate.getDate() === new Date().getDate();
          if (sameDay) return false;
        }

        if (mode === "login") {
          backupPromptShownRef.current = true;
          return true;
        }

        const due = !last || Date.now() - last >= Number(mode) * 86400000;
        if (due) backupPromptShownRef.current = true;
        return due;
      };

      // Keep administrator access live. If another administrator disables this
      // account, the UI immediately stops treating the session as admin.
      unsubscribeAdmin = onSnapshot(
        doc(db, "adminUsers", currentUser.uid),
        (snap) => {
          const activeRecord = snap.exists() && snap.data()?.active === true;
          const allowed = currentUser.uid === ADMIN_UID || activeRecord;
          setAdminAccess(allowed);
          if (allowed && checkBackupReminder(snap.data())) setBackupPromptOpen(true);
        },
        () => {
          setAdminAccess(currentUser.uid === ADMIN_UID);
        }
      );

      // The original bootstrap administrator may predate adminUsers, so check
      // the hard-coded bootstrap UID independently as well.
      if (currentUser.uid === ADMIN_UID) {
        setAdminAccess(true);
        getDoc(doc(db, "adminUsers", currentUser.uid)).then((snap) => {
          if (checkBackupReminder(snap.exists() ? snap.data() : {})) setBackupPromptOpen(true);
        }).catch(() => setBackupPromptOpen(true));
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeAdmin) unsubscribeAdmin();
    };
  }, []);

  const isAdmin = Boolean(user && (user.uid === ADMIN_UID || adminAccess));

  async function login(e) {
    e.preventDefault();
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setLoginOpen(false);
      setPassword("");
    } catch (err) {
      setError(err?.message || "Login failed.");
    }
  }


  function openAdminRegistration() {
    // Registration is intentionally available only from the signed-out admin
    // login screen. Never carry a previous administrator's form values into a
    // new registration attempt.
    setRegisterForm({ name: "", email: "", password: "", pin: "" });
    setRegisterFormKey((value) => value + 1);
    setError("");
    setLoginOpen(false);
    setRegisterOpen(true);
  }

  async function registerAdmin(e) {
    e.preventDefault();
    if (registerBusy) return;
    setError("");

    // A signed-in visitor must never be able to use this form to escalate
    // themselves. Registration is intentionally a signed-out flow.
    if (user) {
      setError("Log out before registering a new administrator.");
      return;
    }

    const name = registerForm.name.trim();
    const emailValue = registerForm.email.trim().toLowerCase();
    const passwordValue = registerForm.password;
    const pin = registerForm.pin.trim();

    if (!name || !emailValue || passwordValue.length < 6 || !/^\d{6}$/.test(pin)) {
      setError("Enter a name, valid email, password with at least 6 characters, and the 6-digit registration PIN.");
      return;
    }

    setRegisterBusy(true);
    let requestRef = null;
    let createdCredential = null;

    try {
      /*
       * SECURITY MODEL
       * ----------------
       * The browser NEVER reads the protected PIN document while signed out.
       * Instead it submits a SHA-256 proof. Firestore rules compare that proof
       * with adminSettings/security.registrationPinHash. If it does not match,
       * the write is rejected BEFORE Firebase Authentication is touched.
       *
       * IMPORTANT FIX:
       * The old implementation derived the request document ID from
       * email + PIN. That made a previous failed/abandoned registration able to
       * collide with every later attempt for the same email/PIN. We now use a
       * cryptographically random request ID, so every legitimate attempt gets
       * a fresh request document.
       */
      const bytes = new TextEncoder().encode(pin);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const pinHash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // addDoc creates a new random document ID. The Firestore rule is the
      // authoritative PIN validator; no client-side PIN comparison is trusted.
      // Step 1: create a harmless pending proof request. This write does NOT
      // grant admin access and does NOT create a Firebase Authentication user.
      requestRef = await addDoc(collection(db, "adminRequests"), {
        email: emailValue,
        displayName: name,
        pinHash,
        status: "pending_pin",
        requestedByUid: "",
        createdAt: serverTimestamp(),
      });

      // Step 2: Firestore rules perform the authoritative PIN check. A wrong
      // PIN is rejected here, so Firebase Authentication is never called.
      await updateDoc(requestRef, {
        status: "verified_pending_auth",
        verifiedProofAt: serverTimestamp(),
      });

      // The Auth account is created ONLY after Firestore accepted the PIN proof.
      createdCredential = await createUserWithEmailAndPassword(
        auth,
        emailValue,
        passwordValue
      );

      try {
        // The newly-created Auth identity can claim only the request it created.
        await setDoc(doc(db, "adminUsers", createdCredential.user.uid), {
          uid: createdCredential.user.uid,
          email: emailValue,
          displayName: name,
          active: true,
          registrationRequestId: requestRef.id,
          createdAt: serverTimestamp(),
          createdBy: "Administrator Registration",
        }, { merge: true });
      } catch (adminRecordError) {
        // Never leave an Auth account that was created by a registration attempt
        // without the administrator record. Delete the just-created Auth user
        // when possible so a deployment/rules problem cannot create an orphan.
        try {
          await deleteUser(createdCredential.user);
        } catch (deleteError) {
          console.error("Unable to remove orphaned registration account:", deleteError);
        }
        throw adminRecordError;
      }

      // Bookkeeping only. Failure here must not undo a successful admin account.
      try {
        await updateDoc(requestRef, {
          requestedByUid: createdCredential.user.uid,
          status: "verified",
          verifiedAt: serverTimestamp(),
        });
      } catch (requestError) {
        console.warn("Administrator registration bookkeeping update failed:", requestError);
      }

      setRegisterOpen(false);
      setRegisterForm({ name: "", email: "", password: "", pin: "" });
      setError("");
      // Give every newly registered administrator the complete operating manual
      // immediately after registration. The GUIDE button remains available later.
      setGuideMode("new-admin");
      setGuideOpen(true);
    } catch (err) {
      const code = err?.code || "";
      const message = String(err?.message || "");

      if (code === "permission-denied") {
        setError(
          "Incorrect administrator registration PIN, or the live Firestore rules/security PIN are not synchronized. No Firebase administrator account was created."
        );
      } else if (code === "auth/email-already-in-use") {
        setError("That email already has a Firebase account. No new administrator was created.");
      } else if (code === "auth/invalid-email") {
        setError("Enter a valid administrator email address.");
      } else if (code === "auth/weak-password") {
        setError("The administrator password must be at least 6 characters.");
      } else {
        setError(message || "Administrator registration failed.");
      }
    } finally {
      setRegisterBusy(false);
    }
  }

  function openGuide(mode = null, firstTime = false) {
    const nextMode = mode || (isAdmin ? "admin" : user ? "user" : "visitor");
    setGuideMode(firstTime ? "new-admin" : nextMode);
    setGuideFilter("ALL");
    setGuideOpen(true);
  }

  function closeGuide() {
    if (user?.uid && guideMode === "new-admin") {
      try { localStorage.setItem(`ran_ep7_admin_guide_seen_${user.uid}`, "1"); } catch {}
    }
    setGuideOpen(false);
  }

  async function logout() {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  async function backupFromLoginPrompt() {
    if (!user || !isAdmin || backupPromptBusy) return;
    setBackupPromptBusy(true);
    try {
      await downloadBackup(db);
      await setDoc(doc(db, "adminUsers", user.uid), {
        lastBackupAt: serverTimestamp(),
        lastBackupType: "json+xlsx+bundle",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      localStorage.setItem(backupPromptKey(user.uid), localDayKey());
      setBackupPromptOpen(false);
    } catch (err) {
      setError(err?.message || "Local backup failed.");
    } finally {
      setBackupPromptBusy(false);
    }
  }

  return (
    <DisplayTimezoneProvider>
      <Header
        page={page}
        setPage={setPage}
        user={user}
        isAdmin={isAdmin}
        onLogin={() => {
          setError("");
          setLoginOpen(true);
        }}
        onLogout={logout}
        onAdmin={() => setPage("admin")}
        onGuide={() => openGuide()}
      />

      <main className="app-main">
        {page === "raid" && <RaidPage user={user} isAdmin={isAdmin} />}
        {page === "bh" && <BHPage user={user} isAdmin={isAdmin} />}
        {page === "cw" && <CWPage user={user} isAdmin={isAdmin} />}
        {page === "tickets" && <TicketPage user={user} isAdmin={isAdmin} />}
        {page === "admin" && <AdminPage user={user} isAdmin={isAdmin} />}
      </main>

      <Modal
        open={guideOpen}
        title={guideMode === "new-admin" ? "FIRST-TIME ADMINISTRATOR MANUAL" : isAdmin ? "ADMINISTRATOR STEP-BY-STEP MANUAL" : user ? "USER STEP-BY-STEP MANUAL" : "SITE USER GUIDE"}
        width="1180px"
        onClose={closeGuide}
      >
        <div className="guide-manual guide-manual-pro">
          <div className="guide-hero">
            <div className="guide-hero-copy">
              <div className="guide-kicker">RAN ONLINE EP7 CLASSIC • {guideMode === "new-admin" ? "FIRST LOGIN" : isAdmin ? "ADMIN CONTROL MANUAL" : "PLAYER / USER MANUAL"}</div>
              <h2>{guideMode === "new-admin" ? "START HERE — COMPLETE ADMIN WALKTHROUGH" : isAdmin ? "ADMINISTRATOR CONTROL MANUAL" : "HOW TO USE THE GUILD DASHBOARD"}</h2>
              <p>
                This manual is written for someone who has <b>never used the dashboard before</b>. Follow the steps in order. Each section tells you what to click, what you should see, what the action does, and what to do if something does not look right.
              </p>
            </div>
            <div className="guide-hero-art">
              <img src={guideMode === "new-admin" || isAdmin ? ranVIcon : heroGuideImage} alt="RAN Online guide" />
            </div>
          </div>

          <div className="guide-filter-bar">
            <div className="guide-filter-label">FILTER MANUAL</div>
            <div className="guide-filter-buttons">
              {(guideMode === "new-admin" || isAdmin
                ? ["ALL","START HERE","RAID","BH","CW","TICKETS","ADMIN","BACKUP","SAFETY"]
                : ["ALL","START HERE","RAID","BH","CW","TICKETS","YOUR ACCESS"]
              ).map((filter) => (
                <button key={filter} type="button" className={`guide-filter ${guideFilter === filter ? "active" : ""}`} onClick={() => setGuideFilter(filter)}>
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="guide-note">
            <span className="guide-note-icon">!</span>
            <div><b>BEGINNER RULE:</b> If you are unsure what to click, do not guess. Read the section for that task first. Administrators should check the activity feed after protected changes.</div>
          </div>

          {guideMode === "new-admin" || isAdmin ? (
            <>
              {(guideFilter === "ALL" || guideFilter === "START HERE") && <div className="guide-big-section">
                <div className="guide-number">01</div><div className="guide-content">
                  <div className="guide-title">FIRST LOGIN & UNDERSTANDING YOUR ADMIN ACCOUNT</div>
                  <div className="guide-grid">
                    <div>
                      <h4>STEP 1 — Sign in</h4><p>At the top of the site, click <b>ADMIN LOGIN</b>. Enter the administrator email and password you registered.</p>
                      <h4>STEP 2 — Confirm you are really an admin</h4><p>Look at the upper-right corner. You should see the <b>ADMIN</b> badge. If you only see USER, stop and do not attempt protected changes.</p>
                      <h4>STEP 3 — Open the manual again anytime</h4><p>Click <b>GUIDE</b> in the header. This manual is always available after login.</p>
                      <h4>STEP 4 — Learn the navigation</h4><p>The main areas are <b>RAID SCHEDULE</b>, <b>BH ATTENDANCE</b>, <b>CW ATTENDANCE</b>, <b>GUILD QUESTIONS</b>, and the <b>ADMIN</b> portal.</p>
                    </div>
                    <div className="guide-visual"><img src={ranVIcon} alt="Administrator V icon" /><span>ADMIN ACCESS</span><small>The gold/administrator badge means protected controls are available.</small></div>
                  </div>
                  <div className="guide-checklist"><b>YOU SHOULD SEE:</b> ADMIN badge • GUIDE button • protected edit controls • ADMIN portal access.</div>
                </div>
              </div>}

              {(guideFilter === "ALL" || guideFilter === "RAID") && <div className="guide-big-section">
                <div className="guide-number">02</div><div className="guide-content">
                  <div className="guide-title">RAID SCHEDULE — VIEW, CHECK, AND EDIT BOSS TIMES</div>
                  <div className="guide-grid">
                    <div>
                      <h4>STEP 1 — Open RAID SCHEDULE</h4><p>Click <b>RAID SCHEDULE</b> in the main navigation. This is where you check upcoming boss/raid occurrences.</p>
                      <h4>STEP 2 — Check the displayed timezone</h4><p>Look at the global <b>DISPLAY TIMEZONE</b> selector. Make sure you understand whether the displayed time is Manila, Pacific, or another selected timezone.</p>
                      <h4>STEP 3 — Find the boss occurrence</h4><p>Read the boss card and confirm the boss name, date, time, recurrence, and countdown before changing anything.</p>
                      <h4>STEP 4 — Edit only when necessary</h4><p>Use the administrator edit control. Change the smallest field necessary. Do not create a duplicate schedule when the existing occurrence should simply be corrected.</p>
                      <h4>STEP 5 — Verify</h4><p>Return to the schedule and confirm the new time is displayed correctly. Then check <b>ACTIVITY & NOTIFICATIONS</b> when available to verify the change was recorded.</p>
                    </div>
                    <div className="guide-visual guide-visual-wide"><img src={heroGuideImage} alt="Raid schedule visual" /><span>RAID SCHEDULE</span><small>Always verify date, time, timezone, and recurrence before editing.</small></div>
                  </div>
                  <div className="guide-mistakes"><b>COMMON BEGINNER MISTAKES:</b> editing the wrong boss • reading a different timezone • creating a duplicate instead of correcting the existing schedule.</div>
                </div>
              </div>}

              {(guideFilter === "ALL" || guideFilter === "BH") && <div className="guide-big-section">
                <div className="guide-number">03</div><div className="guide-content">
                  <div className="guide-title">BOSS HUNT — ATTENDANCE, POINTS, HISTORY & REWARDS</div>
                  <div className="guide-grid">
                    <div>
                      <h4>STEP 1 — Open BH ATTENDANCE</h4><p>Use the main navigation and select <b>BH ATTENDANCE</b>.</p>
                      <h4>STEP 2 — Start with ACTUAL SCHEDULE</h4><p>Find the correct Boss Hunt occurrence. Do not record attendance against a different date or spawn.</p>
                      <h4>STEP 3 — Select the correct player</h4><p>Before saving, compare the player name/class with the roster. Player selection must be correct because attendance changes points and history.</p>
                      <h4>STEP 4 — Record attendance</h4><p>Use the administrator attendance control. Confirm the occurrence and player one more time before saving.</p>
                      <h4>STEP 5 — Check PLAYERS & HISTORY</h4><p>Use the player's history to verify attended days, total points, rewards claimed, and total activity.</p>
                      <h4>STEP 6 — Check REWARDS</h4><p>Review reward inventory and claims. If a reward was assigned to the wrong owner, correct the assignment and verify the resulting activity record.</p>
                      <h4>STEP 7 — Check the audit feed</h4><p>Open <b>ACTIVITY & NOTIFICATIONS</b>. Select the new activity entry to inspect its full details.</p>
                    </div>
                    <div className="guide-visual guide-visual-tall"><img src={bhGuideImage} alt="Boss Hunt dashboard reference" /><span>BOSS HUNT</span><small>Use the schedule first, then player/history, then rewards and activity verification.</small></div>
                  </div>
                  <div className="guide-mistakes"><b>STOP IF:</b> the player is wrong • the occurrence is wrong • the points look unexpected • the reward owner is wrong. Correct the source record rather than adding another compensating entry.</div>
                </div>
              </div>}

              {(guideFilter === "ALL" || guideFilter === "CW") && <div className="guide-big-section">
                <div className="guide-number">04</div><div className="guide-content">
                  <div className="guide-title">CLAN WAR & TREASURY — ATTENDANCE, SALARY AND ITEMS</div>
                  <div className="guide-grid">
                    <div>
                      <h4>STEP 1 — Open CW ATTENDANCE</h4><p>Select <b>CW ATTENDANCE</b> from the main navigation.</p>
                      <h4>STEP 2 — Understand the local calendar</h4><p>Today is pinned first. Use the <b>BACK</b> and <b>FORWARD</b> day controls to browse the number of days you need. Pick the correct Clan War occurrence before editing.</p>
                      <h4>STEP 3 — Record attendance</h4><p>Select the correct player and occurrence. Verify the date/time before saving.</p>
                      <h4>STEP 4 — Check salary</h4><p>Open the salary/history area and verify the player's earned salary. Corrections should be made against the original record.</p>
                      <h4>STEP 5 — Assign inventory</h4><p>In Treasury, select the item row(s), enter the quantity, select the player, and confirm the assignment. Quantities may be small; do not assume a minimum of 10.</p>
                      <h4>STEP 6 — Verify activity</h4><p>Use the unified CW/Treasury activity feed to confirm salary received/edited, item received, owner changes, and other protected actions.</p>
                    </div>
                    <div className="guide-visual guide-visual-wide"><img src={guildWarGuideImage} alt="Clan War visual" /><span>CLAN WAR</span><small>Browse the correct occurrence before attendance, salary, or item changes.</small></div>
                  </div>
                </div>
              </div>}

              {(guideFilter === "ALL" || guideFilter === "TICKETS") && <div className="guide-big-section">
                <div className="guide-number">05</div><div className="guide-content">
                  <div className="guide-title">GUILD QUESTIONS — HOW TO HANDLE A PLAYER REPORT</div>
                  <ol className="guide-detailed-list">
                    <li><b>Open GUILD QUESTIONS.</b> This is the ticket area for player-reported issues.</li>
                    <li><b>Read the subject and description.</b> Do not assume the category from random text in the subject.</li>
                    <li><b>Use the structured category.</b> Examples include BH ATTENDANCE, CW ATTENDANCE, SALARY, REWARDS, TREASURY, ITEM / INVENTORY, SCHEDULE, PLAYER / ACCOUNT, and CONCERN / COMPLAINT.</li>
                    <li><b>Select the issue type.</b> Use the most accurate issue type so filtering works later.</li>
                    <li><b>Investigate the real record.</b> If the ticket says attendance is missing, check the actual attendance/history instead of immediately changing data.</li>
                    <li><b>Make one correction.</b> If a correction is required, fix the underlying record and then verify the resulting history/balance.</li>
                    <li><b>Use the ticket as the communication trail.</b> Keep the response clear enough that another administrator can understand what happened.</li>
                  </ol>
                  <div className="guide-mistakes"><b>IMPORTANT:</b> a ticket category is structured data. It should not be guessed from a player's subject text.</div>
                </div>
              </div>}

              {(guideFilter === "ALL" || guideFilter === "ADMIN") && <div className="guide-big-section">
                <div className="guide-number">06</div><div className="guide-content">
                  <div className="guide-title">ADMIN PORTAL — WHAT EVERY TAB IS FOR</div>
                  <div className="guide-admin-table">
                    <div><b>OVERVIEW</b><span>Start here for a quick administration status view.</span></div>
                    <div><b>MY PROFILE</b><span>Change your administrator name, email, password, and backup reminder settings. Credential changes may require your current password.</span></div>
                    <div><b>ADMIN ACCESS</b><span>Manage administrator registration PIN and factory-reset PIN. Current PIN visibility is restricted to active administrators.</span></div>
                    <div><b>BACKUP / RESTORE</b><span>Create the JSON + XLSX backup bundle before major changes. The current free-tier design does not use Firebase Storage.</span></div>
                    <div><b>DATA STATUS</b><span>Inspect application collections and data health gathered from Firebase.</span></div>
                    <div><b>MAINTENANCE</b><span>Use archive/consolidation/reset tools only after backing up and understanding the effect.</span></div>
                  </div>
                  <div className="guide-grid guide-admin-visual-grid"><div><h4>BEGINNER RULE</h4><p>If you do not know what a tab does, do not click a destructive button. Read the tab's explanation first.</p><h4>ADMIN SECURITY</h4><p>Never give regular users the administrator password, registration PIN, or factory-reset PIN.</p></div><div className="guide-visual"><img src={ranVIcon} alt="Admin portal icon" /><span>ADMIN PORTAL</span><small>Protected system controls belong only to active administrators.</small></div></div>
                </div>
              </div>}

              {(guideFilter === "ALL" || guideFilter === "BACKUP") && <div className="guide-big-section guide-warning-section">
                <div className="guide-number">07</div><div className="guide-content">
                  <div className="guide-title">BACKUP / RESTORE — DO THIS BEFORE MAJOR CHANGES</div>
                  <div className="guide-grid">
                    <div>
                      <h4>STEP 1 — Open ADMIN → BACKUP / RESTORE</h4><p>Do this before factory reset, major maintenance, or a large correction session.</p>
                      <h4>STEP 2 — Use BACKUP + DOWNLOAD BOTH • ZIP</h4><p>The dashboard gathers the application data and creates a single ZIP containing the JSON and XLSX backup formats.</p>
                      <h4>STEP 3 — Save the file</h4><p>The browser saves the ZIP to your normal/default Downloads location unless your browser asks you where to save it.</p>
                      <h4>STEP 4 — Confirm the backup exists</h4><p>Open your Downloads folder and verify the ZIP is present. Do not assume a backup completed just because you clicked the button.</p>
                      <h4>STEP 5 — Keep a known-good copy</h4><p>For important season/week changes, keep the backup somewhere safe before performing maintenance.</p>
                    </div>
                    <div className="guide-visual guide-visual-backup"><img src={heroGuideImage} alt="Backup guide visual" /><span>BACKUP FIRST</span><small>Backup → verify file → then perform major maintenance.</small></div>
                  </div>
                </div>
              </div>}

              {(guideFilter === "ALL" || guideFilter === "SAFETY") && <div className="guide-big-section guide-warning-section">
                <div className="guide-number">08</div><div className="guide-content">
                  <div className="guide-title">FACTORY RESET & MAINTENANCE — DESTRUCTIVE OPERATIONS</div>
                  <ol className="guide-detailed-list">
                    <li><b>Do not start with reset.</b> First understand why the data needs to be cleared or consolidated.</li>
                    <li><b>Create and verify a backup.</b> Download the JSON + XLSX ZIP and make sure it exists on your computer.</li>
                    <li><b>Review DATA STATUS.</b> Confirm the current data you expect to preserve.</li>
                    <li><b>Understand the archive.</b> Operational data removed by supported maintenance/reset operations is archived for the configured recovery period before permanent purge.</li>
                    <li><b>Enter the factory-reset PIN only when intentionally resetting.</b> This is not the registration PIN unless your current configuration has deliberately made them the same.</li>
                    <li><b>After reset, refresh and inspect the dashboard.</b> Confirm the new week/season starts in the expected state.</li>
                    <li><b>Never use reset to fix one small mistake.</b> Use the specific edit/correction control for the affected record.</li>
                  </ol>
                  <div className="guide-danger"><b>DESTRUCTIVE ACTION:</b> Factory reset can remove operational records. Backup first. Verify twice. Reset once.</div>
                </div>
              </div>}

              {guideFilter === "START HERE" && <div className="guide-big-section"><div className="guide-number">✓</div><div className="guide-content"><div className="guide-title">YOUR FIRST 10 MINUTES</div><ol className="guide-detailed-list"><li>Log in and confirm ADMIN.</li><li>Click GUIDE and keep this manual available.</li><li>Open RAID SCHEDULE and identify the timezone selector.</li><li>Open BH ATTENDANCE and locate ACTUAL SCHEDULE, PLAYERS & HISTORY, REWARDS, and ACTIVITY & NOTIFICATIONS.</li><li>Open CW ATTENDANCE and locate the local calendar and Treasury.</li><li>Open GUILD QUESTIONS and inspect the category/issue filters.</li><li>Open ADMIN and read each tab without changing anything.</li><li>Create a test backup only when you are ready, then verify the downloaded ZIP.</li><li>Do not use factory reset while learning.</li></ol></div></div>}
            </>
          ) : (
            <>
              {(guideFilter === "ALL" || guideFilter === "START HERE") && <div className="guide-big-section"><div className="guide-number">01</div><div className="guide-content"><div className="guide-title">START HERE — WHAT A REGULAR USER CAN DO</div><div className="guide-grid"><div><h4>STEP 1 — Browse without changing protected data</h4><p>You can browse the dashboard. Protected attendance, points, rewards, players, and treasury records are not yours to edit.</p><h4>STEP 2 — Sign in only when needed</h4><p>If your account is authenticated as a regular user, the site should show USER rather than ADMIN.</p><h4>STEP 3 — Use GUIDE anytime</h4><p>Click GUIDE in the header whenever you forget a step.</p></div><div className="guide-visual"><img src={ranVIcon} alt="User guide icon" /><span>USER ACCESS</span><small>USER does not mean administrator. Protected controls remain unavailable.</small></div></div></div></div>}
              {(guideFilter === "ALL" || guideFilter === "RAID") && <div className="guide-big-section"><div className="guide-number">02</div><div className="guide-content"><div className="guide-title">RAID SCHEDULE — VIEW THE NEXT BOSS</div><ol className="guide-detailed-list"><li>Click <b>RAID SCHEDULE</b>.</li><li>Look at the boss cards and next occurrence.</li><li>Check <b>DISPLAY TIMEZONE</b> so you understand the displayed time.</li><li>Use the countdown/date to know when the event occurs.</li><li>Do not try to edit protected schedule data as a regular user.</li></ol></div></div>}
              {(guideFilter === "ALL" || guideFilter === "BH") && <div className="guide-big-section"><div className="guide-number">03</div><div className="guide-content"><div className="guide-title">BOSS HUNT — FIND YOUR OWN RECORDS</div><div className="guide-grid"><div><h4>STEP 1</h4><p>Open <b>BH ATTENDANCE</b>.</p><h4>STEP 2</h4><p>Use <b>PLAYERS & HISTORY</b> to find your permitted player information.</p><h4>STEP 3</h4><p>Review attendance points and reward history.</p><h4>STEP 4</h4><p>If something is wrong, do not attempt to add points yourself. Use <b>GUILD QUESTIONS</b> to report it.</p></div><div className="guide-visual guide-visual-tall"><img src={bhGuideImage} alt="Boss Hunt guide" /><span>BH ATTENDANCE</span><small>Review your permitted information and report mistakes instead of changing records.</small></div></div></div></div>}
              {(guideFilter === "ALL" || guideFilter === "CW") && <div className="guide-big-section"><div className="guide-number">04</div><div className="guide-content"><div className="guide-title">CLAN WAR — VIEW YOUR RECORD</div><ol className="guide-detailed-list"><li>Open <b>CW ATTENDANCE</b>.</li><li>Use the calendar window to browse the relevant Clan War occurrence.</li><li>Review your attendance, salary, and item history when available to your account.</li><li>Do not add points, attendance, salary, or inventory records yourself.</li></ol></div></div>}
              {(guideFilter === "ALL" || guideFilter === "TICKETS") && <div className="guide-big-section"><div className="guide-number">05</div><div className="guide-content"><div className="guide-title">GUILD QUESTIONS — REPORT A PROBLEM CORRECTLY</div><ol className="guide-detailed-list"><li>Open <b>GUILD QUESTIONS</b>.</li><li>Choose the correct structured category.</li><li>Choose the most accurate issue type.</li><li>Describe what happened: player name, date, boss/war occurrence, and what you expected.</li><li>Submit the ticket and let an administrator investigate the actual record.</li></ol><div className="guide-mistakes"><b>GOOD REPORT:</b> “BH attendance missing for PlayerName on Sep 5, Sonya spawn.”<br/><b>BAD REPORT:</b> “fix this” with no date, player, or occurrence.</div></div></div>}
              {(guideFilter === "ALL" || guideFilter === "YOUR ACCESS") && <div className="guide-big-section"><div className="guide-number">06</div><div className="guide-content"><div className="guide-title">YOUR ACCESS — WHAT YOU SHOULD NOT SEE</div><div className="guide-permission-row guide-permission-large"><div><b>YOU CAN</b><span>Browse public schedules • view your permitted records • submit questions/tickets • use the GUIDE manual.</span></div><div><b>YOU CANNOT</b><span>Add/edit/remove protected attendance, points, players, rewards, treasury, or administrator settings.</span></div></div></div></div>}
            </>
          )}

          <div className="guide-footer guide-footer-pro"><span><b>TIP:</b> Keep this manual open while learning. If an instruction says VERIFY, stop and check the screen before saving.</span><button type="button" className="button primary" onClick={closeGuide}>DONE • CLOSE GUIDE</button></div>
        </div>
      </Modal>

      <Modal
        open={backupPromptOpen && isAdmin}
        title="ADMIN BACKUP REMINDER"
        onClose={() => {
          if (user?.uid) localStorage.setItem(backupPromptKey(user.uid), localDayKey());
          setBackupPromptOpen(false);
        }}
        width="560px"
      >
        <div className="admin-auth-form">
          <div className="admin-auth-intro">
            <div>
              <strong>LOCAL BACKUP RECOMMENDED</strong>
              Your configured backup reminder is due. Create a matching JSON + XLSX copy of the current Firebase application data before continuing.
            </div>
          </div>
          <div className="admin-backup-prompt-meta">
            <span>FILES CREATED</span>
            <strong>JSON + XLSX</strong>
          </div>
          <button className="button primary" type="button" onClick={backupFromLoginPrompt} disabled={backupPromptBusy}>
            {backupPromptBusy ? "CREATING BACKUP..." : "YES • CREATE LOCAL BACKUP"}
          </button>
          <button type="button" className="admin-register-link" onClick={() => { localStorage.setItem(backupPromptKey(user?.uid), localDayKey()); setBackupPromptOpen(false); }}>NO, NOT NOW</button>
        </div>
      </Modal>

      <Modal
        open={loginOpen}
        title="ADMIN LOGIN"
        width="560px"
        onClose={() => {
          setLoginOpen(false);
          setError("");
        }}
      >
        <form className="admin-auth-form" onSubmit={login}>
          <div className="admin-auth-intro">
            <div>
              <strong>SECURE ADMINISTRATOR ACCESS</strong>
              Sign in with an approved administrator Firebase account. Normal visitors do not receive administrator privileges.
            </div>
          </div>

          <label>
            ADMIN EMAIL
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="administrator@email.com"
              required
            />
          </label>

          <label>
            PASSWORD
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Enter administrator password"
              required
            />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="button primary" type="submit">
            SIGN IN
          </button>
          <button type="button" className="admin-register-link" onClick={openAdminRegistration}>REGISTER NEW ADMIN</button>
        </form>
      </Modal>

      <Modal
        open={registerOpen}
        title="REGISTER NEW ADMINISTRATOR"
        onClose={() => {
          setRegisterOpen(false);
          setError("");
          setRegisterForm({ name: "", email: "", password: "", pin: "" });
        }}
        width="680px"
      >
        <form key={registerFormKey} className="admin-auth-form" onSubmit={registerAdmin} autoComplete="off">
          <p className="admin-register-note">Enter the correct 6-digit administrator registration PIN. The PIN is verified before the Firebase account is created. A wrong PIN creates no account and gives no administrator access.</p>
          <label>Display Name<input value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} autoComplete="off" required /></label>
          <label>Email<input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} autoComplete="off" required /></label>
          <label>Password<input type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} autoComplete="new-password" minLength={6} required /></label>
          <label>6-Digit Registration PIN<input inputMode="numeric" type="text" value={registerForm.pin} onChange={(e) => setRegisterForm({ ...registerForm, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} autoComplete="off" maxLength={6} placeholder="6 digits" required /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="button primary" type="submit" disabled={registerBusy}>{registerBusy ? "REGISTERING..." : "REGISTER ADMINISTRATOR"}</button>
        </form>
      </Modal>
    </DisplayTimezoneProvider>
  );
}
