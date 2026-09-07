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
import GuideManual from "./components/GuideManual";
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
          const data = snap.exists() ? snap.data() : {};
          const activeRecord = data.active === true || data.status === "active";
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
          email: createdCredential.user.email || emailValue,
          displayName: name,
          role: "admin",
          status: "active",
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
        <GuideManual
          isAdmin={isAdmin}
          guideMode={guideMode}
          guideFilter={guideFilter}
          setGuideFilter={setGuideFilter}
          closeGuide={closeGuide}
          images={{ ranVIcon, bhGuideImage, guildWarGuideImage, heroGuideImage }}
        />
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
