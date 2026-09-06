import { useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";

import { auth, db } from "./lib/firebase";
import { ADMIN_UID } from "./lib/constants";
import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import Header from "./components/common/Header";
import Modal from "./components/common/Modal";
import RaidPage from "./pages/RaidPage";
import BHPage from "./pages/BHPage";
import CWPage from "./pages/CWPage";
import TicketPage from "./pages/TicketPage";
import AdminPage from "./pages/AdminPage";
import { DisplayTimezoneProvider } from "./lib/displayTimezone";
import { downloadBackup } from "./lib/adminBackup";

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
  const [backupPromptOpen, setBackupPromptOpen] = useState(false);
  const [backupPromptBusy, setBackupPromptBusy] = useState(false);
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
    setError("");
    setLoginOpen(false);
    setRegisterOpen(true);
  }

  async function registerAdmin(e) {
    e.preventDefault();
    if (registerBusy) return;
    setError("");

    // A signed-in normal user must never be able to turn the registration form
    // into an administrator-escalation path. New administrator registration is
    // performed from the signed-out login screen using the current registration
    // PIN.
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
      // IMPORTANT: verify the PIN BEFORE creating a Firebase Authentication user.
      // This prevents incorrect PIN attempts from appearing in Firebase Authentication.
      const bytes = new TextEncoder().encode(pin);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const pinHash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Bind the registration request to both the email and the PIN proof. This
      // prevents an old request created under a previous PIN from blocking a new
      // registration after an administrator changes the PIN.
      const requestDigest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${emailValue}:${pinHash}`)
      );
      const requestId = Array.from(new Uint8Array(requestDigest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      requestRef = doc(db, "adminRequests", requestId);

      await setDoc(requestRef, {
        email: emailValue,
        displayName: name,
        pinHash,
        status: "verified_pending_auth",
        requestedByUid: "",
        createdAt: serverTimestamp(),
      }, { merge: false });

      // Only reached when Firestore accepted the correct PIN.
      createdCredential = await createUserWithEmailAndPassword(
        auth,
        emailValue,
        passwordValue
      );

      // The Firestore rules allow this exact new Auth identity to claim the
      // already PIN-verified request. This is intentionally done BEFORE marking
      // the request verified, so an interrupted client update cannot strand a
      // legitimate new administrator.
      await setDoc(doc(db, "adminUsers", createdCredential.user.uid), {
        uid: createdCredential.user.uid,
        email: emailValue,
        displayName: name,
        active: true,
        registrationRequestId: requestId,
        createdAt: serverTimestamp(),
        createdBy: "Administrator Registration",
      }, { merge: true });

      // Once the new admin record exists, the new session is already an active
      // administrator, so this status update is allowed by the admin rules.
      // It is bookkeeping only; failure here must not undo the newly-created
      // administrator account.
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
    } catch (err) {
      // If Auth creation failed after the PIN was verified, do not leave a fake
      // active admin behind. The request is harmless and can be reused only by
      // an authenticated account matching the verified request.
      setError(
        err?.code === "permission-denied"
          ? "Incorrect administrator registration PIN, or the new PIN has not been deployed to Firestore yet. No administrator account was created."
          : err?.code === "auth/email-already-in-use"
            ? "That email already has a Firebase account. No new administrator was created."
            : err?.message || "Admin registration failed."
      );
    } finally {
      setRegisterBusy(false);
    }
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
      />

      <main className="app-main">
        {page === "raid" && <RaidPage user={user} isAdmin={isAdmin} />}
        {page === "bh" && <BHPage user={user} isAdmin={isAdmin} />}
        {page === "cw" && <CWPage user={user} isAdmin={isAdmin} />}
        {page === "tickets" && <TicketPage user={user} isAdmin={isAdmin} />}
        {page === "admin" && <AdminPage user={user} isAdmin={isAdmin} />}
      </main>

      <Modal
        open={backupPromptOpen && isAdmin}
        title="ADMIN BACKUP REMINDER"
        onClose={() => setBackupPromptOpen(false)}
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
        <form className="admin-auth-form" onSubmit={registerAdmin}>
          <p className="admin-register-note">Enter the correct 6-digit administrator registration PIN. The PIN is verified before the Firebase account is created. A wrong PIN creates no account and gives no administrator access.</p>
          <label>Display Name<input value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} required /></label>
          <label>Email<input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} required /></label>
          <label>Password<input type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} minLength={6} required /></label>
          <label>6-Digit Registration PIN<input inputMode="numeric" value={registerForm.pin} onChange={(e) => setRegisterForm({ ...registerForm, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} maxLength={6} placeholder="123456" required /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="button primary" type="submit" disabled={registerBusy}>{registerBusy ? "REGISTERING..." : "REGISTER ADMINISTRATOR"}</button>
        </form>
      </Modal>
    </DisplayTimezoneProvider>
  );
}
