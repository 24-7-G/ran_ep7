import React, { useEffect, useMemo, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ADMIN_UID } from "../lib/constants";
import {
  ARCHIVE_RETENTION_DAYS,
  BACKUP_COLLECTIONS,
  archiveCollections,
  downloadBackup,
  saveBackupAndDownload,
  saveBackupToChosenFolder,
  downloadJsonBackup,
  downloadXlsxBackup,
  listArchives,
  purgeExpiredArchives,
  readXlsxBackup,
  restoreArchive,
  restoreBackup,
} from "../lib/adminBackup";
import "./AdminPage.css";

const DEFAULT_PIN = "123456";
const PAGE_SIZE = 10;
const STATUS_COLLECTIONS = [
  ...BACKUP_COLLECTIONS,
  "adminArchives",
  "adminArchiveChunks",
];

const BACKUP_REMINDER_OPTIONS = [
  { value: "off", label: "OFF" },
  { value: "1", label: "EVERY 1 DAY" },
  { value: "2", label: "EVERY 2 DAYS" },
  { value: "3", label: "EVERY 3 DAYS" },
  { value: "7", label: "EVERY 7 DAYS" },
  { value: "login", label: "EVERY ADMIN LOGIN" },
];

const clean = (value) => String(value ?? "").trim();

async function hashPin(pin) {
  const value = new TextEncoder().encode(String(pin));
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (value?.seconds != null) return new Date(Number(value.seconds) * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateText(value) {
  const date = toDate(value);
  return date ? date.toLocaleString() : "—";
}

function actorName(user) {
  return clean(user?.displayName) || clean(user?.email) || "Administrator";
}


function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString() : "0";
}

export default function AdminPage({ user, isAdmin }) {
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState({ name: "", email: "", backupReminderDays: "1" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [settings, setSettings] = useState({ registrationPinHash: "", factoryResetPinHash: "", registrationPin: "", factoryResetPin: "", updatedAt: null });
  const [pinForm, setPinForm] = useState({ registration: "", factory: "" });
  const [showRegistrationPin, setShowRegistrationPin] = useState(false);
  const [showFactoryPin, setShowFactoryPin] = useState(false);
  const [savingPins, setSavingPins] = useState(false);

  const [admins, setAdmins] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupFormatBusy, setBackupFormatBusy] = useState("");
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMode, setRestoreMode] = useState("merge");

  const [health, setHealth] = useState({ loading: false, rows: [], scannedAt: null });
  const [archives, setArchives] = useState([]);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveRestoreBusy, setArchiveRestoreBusy] = useState("");
  const [resetPin, setResetPin] = useState("");
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [consolidateDays, setConsolidateDays] = useState("30");
  const [consolidateBusy, setConsolidateBusy] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditRows, setAuditRows] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.displayName || "",
      email: user.email || "",
      backupReminderDays: "1",
    });
  }, [user]);

  useEffect(() => {
    if (!isAdmin || !user) return undefined;

    const adminRef = doc(db, "adminUsers", user.uid);
    const unsubSelf = onSnapshot(adminRef, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setProfile((current) => ({
        ...current,
        name: user.displayName || data.displayName || current.name || "",
        email: user.email || data.email || current.email || "",
        backupReminderDays: data.backupReminderDays ?? current.backupReminderDays ?? "1",
      }));
    });

    setDoc(adminRef, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email || "Administrator",
      active: true,
      lastSeenAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});

    const securityRef = doc(db, "adminSettings", "security");
    const unsubSettings = onSnapshot(securityRef, async (snap) => {
      const data = snap.exists() ? snap.data() : {};
      if (!data.registrationPinHash || !data.factoryResetPinHash) {
        const defaultHash = await hashPin(DEFAULT_PIN);
        const patch = {};
        if (!data.registrationPinHash) {
          patch.registrationPinHash = defaultHash;
          patch.registrationPin = DEFAULT_PIN;
        }
        if (!data.factoryResetPinHash) {
          patch.factoryResetPinHash = defaultHash;
          patch.factoryResetPin = DEFAULT_PIN;
        }
        if (Object.keys(patch).length) {
          setDoc(securityRef, {
            ...patch,
            initializedAt: data.initializedAt || serverTimestamp(),
            initializedByUid: data.initializedByUid || user.uid,
            updatedAt: serverTimestamp(),
            updatedByUid: user.uid,
            updatedBy: actorName(user),
          }, { merge: true }).catch(() => {});
        }
      }
      setSettings({
        registrationPinHash: data.registrationPinHash || "",
        factoryResetPinHash: data.factoryResetPinHash || "",
        registrationPin: data.registrationPin || "",
        factoryResetPin: data.factoryResetPin || "",
        updatedAt: data.updatedAt || null,
      });
    });

    const unsubAdmins = onSnapshot(collection(db, "adminUsers"), (snap) => {
      setAdmins(
        snap.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)))
      );
    });

    return () => {
      unsubSelf();
      unsubSettings();
      unsubAdmins();
    };
  }, [isAdmin, user]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    const loadAudit = async () => {
      try {
        const snap = await getDocs(collection(db, "guildNotices"));
        const rows = snap.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (toDate(b.createdAt || b.timestamp)?.getTime() || 0) - (toDate(a.createdAt || a.timestamp)?.getTime() || 0));
        if (active) {
          setAuditRows(rows);
          setAuditTotal(rows.length);
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to read audit history.");
      }
    };
    loadAudit();
    return () => { active = false; };
  }, [isAdmin, message]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    (async () => {
      try {
        await purgeExpiredArchives(db);
        const rows = await listArchives(db);
        if (active) setArchives(rows);
      } catch (err) {
        if (active) setError(err.message || "Unable to load recovery archives.");
      }
    })();
    return () => { active = false; };
  }, [isAdmin, message]);

  const visibleAudit = useMemo(
    () => auditRows.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE),
    [auditRows, auditPage]
  );
  const auditPages = Math.max(1, Math.ceil(auditTotal / PAGE_SIZE));
  const activeAdmins = admins.filter((admin) => admin.active !== false);

  async function saveProfile(event) {
    event.preventDefault();
    if (!user || !isAdmin || savingProfile) return;
    setSavingProfile(true);
    setMessage("");
    setError("");
    try {
      const name = clean(profile.name);
      const email = clean(profile.email).toLowerCase();
      const changedCredentials = email !== clean(user.email).toLowerCase() || Boolean(newPassword);
      if (changedCredentials && !currentPassword) {
        throw new Error("Enter your current password to change the administrator email or password.");
      }
      if (changedCredentials) {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      }
      if (name !== clean(user.displayName)) await updateProfile(user, { displayName: name });
      if (email && email !== clean(user.email).toLowerCase()) await updateEmail(user, email);
      if (newPassword) await updatePassword(user, newPassword);

      await setDoc(doc(db, "adminUsers", user.uid), {
        uid: user.uid,
        email: email || user.email || "",
        displayName: name || email || "Administrator",
        backupReminderDays: profile.backupReminderDays,
        active: true,
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid,
        updatedBy: actorName(user),
      }, { merge: true });

      if (name !== clean(user.displayName) || email !== clean(user.email).toLowerCase()) {
        await syncActorAcrossHistory(user.uid, name || email || "Administrator", email || user.email || "");
      }

      setCurrentPassword("");
      setNewPassword("");
      setMessage("Administrator profile updated. Audit and ledger actor labels were synchronized where mapped.");
    } catch (err) {
      setError(err?.message || "Profile update failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function syncActorAcrossHistory(uid, label, email) {
    const collections = BACKUP_COLLECTIONS.filter(
      (name) => !["adminSettings", "adminRequests", "adminUsers"].includes(name)
    );
    for (const collectionName of collections) {
      const snap = await getDocs(collection(db, collectionName));
      const matches = snap.docs.filter((item) => {
        const data = item.data();
        return data.createdByUid === uid || data.updatedByUid === uid || data.actorUid === uid;
      });
      for (let i = 0; i < matches.length; i += 450) {
        const batch = writeBatch(db);
        matches.slice(i, i + 450).forEach((item) => {
          const data = item.data();
          const patch = {};
          if (data.createdByUid === uid) {
            patch.createdBy = label;
            patch.createdByEmail = email;
          }
          if (data.updatedByUid === uid) {
            patch.updatedBy = label;
            patch.updatedByEmail = email;
          }
          if (data.actorUid === uid) {
            patch.actor = label;
            patch.actorEmail = email;
          }
          batch.update(item.ref, patch);
        });
        if (matches.length) await batch.commit();
      }
    }
  }

  async function savePins(event) {
    event.preventDefault();
    if (!isAdmin || savingPins) return;
    setSavingPins(true);
    setError("");
    setMessage("");
    try {
      const registration = clean(pinForm.registration);
      const factory = clean(pinForm.factory);
      if (registration && !/^\d{6}$/.test(registration)) throw new Error("Registration PIN must be exactly 6 digits.");
      if (factory && !/^\d{6}$/.test(factory)) throw new Error("Factory reset PIN must be exactly 6 digits.");

      const patch = {
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid,
        updatedBy: actorName(user),
      };
      if (registration) {
        patch.registrationPinHash = await hashPin(registration);
        patch.registrationPin = registration;
      }
      if (factory) {
        patch.factoryResetPinHash = await hashPin(factory);
        patch.factoryResetPin = factory;
      }
      const securityRef = doc(db, "adminSettings", "security");
      await setDoc(securityRef, patch, { merge: true });

      // Read the saved document back before reporting success. This prevents the
      // UI from claiming that a PIN changed when Firestore did not persist it.
      const saved = await getDocs(query(collection(db, "adminSettings")));
      const securitySaved = saved.docs.find((item) => item.id === "security")?.data() || {};
      if (registration && securitySaved.registrationPinHash !== patch.registrationPinHash) {
        throw new Error("Registration PIN was not confirmed by Firestore. No PIN change was reported as successful.");
      }
      if (factory && securitySaved.factoryResetPinHash !== patch.factoryResetPinHash) {
        throw new Error("Factory reset PIN was not confirmed by Firestore. No PIN change was reported as successful.");
      }

      setSettings((current) => ({ ...current, ...securitySaved }));
      setPinForm({ registration: "", factory: "" });
      setShowRegistrationPin(false);
      setShowFactoryPin(false);
      setMessage("Security PIN settings saved. New administrator registration now uses the new registration PIN immediately after Firestore rules/settings are synchronized.");
    } catch (err) {
      setError(err?.message || "PIN settings could not be saved.");
    } finally {
      setSavingPins(false);
    }
  }

  async function setAdminActive(admin, active) {
    if (!isAdmin || admin.id === user.uid) return;
    try {
      await updateDoc(doc(db, "adminUsers", admin.id), {
        active,
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid,
        updatedBy: actorName(user),
      });
      setMessage(active ? "Administrator enabled." : "Administrator disabled. Their admin session will be rechecked automatically.");
    } catch (err) {
      setError(err?.message || "Administrator status update failed.");
    }
  }

  async function markBackupComplete() {
    await setDoc(doc(db, "adminUsers", user.uid), {
      lastBackupAt: serverTimestamp(),
      lastBackupType: "json+xlsx+bundle",
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async function exportAll() {
    if (!isAdmin || backupBusy || backupFormatBusy) return;
    setBackupBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveBackupAndDownload(db, { actorUid: user.uid, actor: actorName(user) });
      await markBackupComplete();
      setMessage(`Backup recorded in Firebase and downloaded locally. JSON + consolidated XLSX + a separate Excel folder of organized table-by-table XLSX files are inside ${saved.files.folder}. Firebase Storage is not used.`);
    } catch (err) {
      setError(err?.message || "Backup failed.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function exportToFolder() {
    if (!isAdmin || backupBusy || backupFormatBusy) return;
    setBackupFormatBusy("folder");
    setError("");
    setMessage("");
    try {
      await saveBackupToChosenFolder(db);
      await markBackupComplete();
      setMessage("Both JSON and XLSX were saved into the selected RAN_TODAY date folder.");
    } catch (err) {
      setError(err?.message || "Folder backup failed. Use the ZIP backup if your browser does not support folder access.");
    } finally {
      setBackupFormatBusy("");
    }
  }

  async function exportSingleBackup(format) {
    if (!isAdmin || backupBusy || backupFormatBusy) return;
    setBackupFormatBusy(format);
    setError("");
    setMessage("");
    try {
      if (format === "json") await downloadJsonBackup(db);
      else await downloadXlsxBackup(db);
      await markBackupComplete();
      setMessage(`${format.toUpperCase()} backup downloaded successfully.`);
    } catch (err) {
      setError(err?.message || `${format.toUpperCase()} backup failed.`);
    } finally {
      setBackupFormatBusy("");
    }
  }

  async function importBackup() {
    if (!isAdmin || !restoreFile || restoreBusy) return;
    setRestoreBusy(true);
    setError("");
    setMessage("");
    try {
      let backup;
      if (restoreFile.name.toLowerCase().endsWith(".json")) {
        backup = JSON.parse(await restoreFile.text());
      } else if (restoreFile.name.toLowerCase().endsWith(".xlsx")) {
        backup = await readXlsxBackup(restoreFile);
      } else {
        throw new Error("Choose a RAN EP7 JSON or XLSX backup.");
      }

      if (restoreMode === "replace") {
        const archive = await archiveCollections(db, {
          collections: BACKUP_COLLECTIONS,
          actorUid: user.uid,
          actor: actorName(user),
          reason: "pre-restore-replace",
          label: "Automatic archive before replace restore",
        });
        setMessage(`Safety archive ${archive.archiveId} created. Restoring backup now...`);
      }

      await restoreBackup(db, backup, { replace: restoreMode === "replace" });
      setRestoreFile(null);
      setMessage(`Restore complete (${restoreMode === "replace" ? "replace" : "merge"} mode). The application data was mapped by collection and exact document ID.`);
    } catch (err) {
      setError(err?.message || "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  }

  async function loadHealth() {
    if (!isAdmin || health.loading) return;
    setHealth({ loading: true, rows: [], scannedAt: null });
    setError("");
    try {
      const rows = [];
      for (const collectionName of STATUS_COLLECTIONS) {
        const snap = await getDocs(collection(db, collectionName));
        const timestamps = snap.docs.flatMap((item) =>
          [item.data().updatedAt, item.data().createdAt, item.data().timestamp]
            .map(toDate)
            .filter(Boolean)
        );
        const latest = timestamps.sort((a, b) => b.getTime() - a.getTime())[0] || null;
        rows.push({ collection: collectionName, count: snap.size, latest });
      }
      setHealth({ loading: false, rows, scannedAt: new Date() });
    } catch (err) {
      setHealth({ loading: false, rows: [], scannedAt: null });
      setError(err?.message || "Firebase data status scan failed.");
    }
  }

  async function refreshArchives() {
    try {
      await purgeExpiredArchives(db);
      setArchives(await listArchives(db));
    } catch (err) {
      setError(err?.message || "Unable to refresh recovery archives.");
    }
  }

  async function recoverArchive(archive) {
    if (!isAdmin || archiveRestoreBusy) return;
    if (!window.confirm(`Restore ${archive.documentCount || 0} archived records from ${archive.label || archive.id}? Existing matching document IDs will be replaced.`)) return;
    setArchiveRestoreBusy(archive.id);
    setError("");
    setMessage("");
    try {
      await restoreArchive(db, archive.id);
      await refreshArchives();
      setMessage(`Recovery complete for ${archive.id}.`);
    } catch (err) {
      setError(err?.message || "Recovery failed.");
    } finally {
      setArchiveRestoreBusy("");
    }
  }

  async function factoryReset() {
    if (!isAdmin || resetBusy) return;
    if (resetPhrase !== "FACTORY RESET") {
      setError("Type FACTORY RESET exactly to continue.");
      return;
    }
    if (!/^\d{6}$/.test(resetPin)) {
      setError("Enter the 6-digit factory reset PIN.");
      return;
    }

    setResetBusy(true);
    setError("");
    setMessage("");
    try {
      const configuredHash = settings.factoryResetPinHash || await hashPin(DEFAULT_PIN);
      if (await hashPin(resetPin) !== configuredHash) throw new Error("Incorrect factory reset PIN. No data was changed.");

      const operational = BACKUP_COLLECTIONS.filter((name) => !["adminUsers", "adminSettings", "adminRequests"].includes(name));
      const archive = await archiveCollections(db, {
        collections: operational,
        actorUid: user.uid,
        actor: actorName(user),
        reason: "factory-reset",
        label: "Factory reset recovery archive",
      });

      for (const collectionName of operational) {
        const snap = await getDocs(collection(db, collectionName));
        for (let i = 0; i < snap.docs.length; i += 450) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 450).forEach((item) => batch.delete(item.ref));
          await batch.commit();
        }
      }

      setResetPin("");
      setResetPhrase("");
      await refreshArchives();
      setMessage(`Factory reset completed. ${formatMoney(archive.documentCount)} operational records were archived for ${ARCHIVE_RETENTION_DAYS} days before permanent purge.`);
    } catch (err) {
      setError(err?.message || "Factory reset failed.");
    } finally {
      setResetBusy(false);
    }
  }

  async function consolidateAudit() {
    if (!isAdmin || consolidateBusy) return;
    const days = Math.max(7, Number(consolidateDays) || 30);
    if (!window.confirm(`Consolidate guild activity older than ${days} days? A backup should be created first. Old detail will be replaced by monthly summaries.`)) return;

    setConsolidateBusy(true);
    setError("");
    setMessage("");
    try {
      const cutoff = Date.now() - days * 86400000;
      const snap = await getDocs(collection(db, "guildNotices"));
      const old = snap.docs.filter((item) => (toDate(item.data().createdAt || item.data().timestamp)?.getTime() || Date.now()) < cutoff);
      if (!old.length) {
        setMessage("No old activity records were found for consolidation.");
        return;
      }

      const archive = await archiveCollections(db, {
        collections: ["guildNotices"],
        actorUid: user.uid,
        actor: actorName(user),
        reason: "audit-consolidation",
        label: `Guild activity archive before ${days}-day consolidation`,
      });

      const byMonth = new Map();
      old.forEach((item) => {
        const d = toDate(item.data().createdAt || item.data().timestamp) || new Date();
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonth.has(key)) byMonth.set(key, { month: key, records: 0, modules: {}, actions: {} });
        const bucket = byMonth.get(key);
        const data = item.data();
        bucket.records += 1;
        const module = clean(data.module) || "system";
        const action = clean(data.action || data.title) || "activity";
        bucket.modules[module] = (bucket.modules[module] || 0) + 1;
        bucket.actions[action] = (bucket.actions[action] || 0) + 1;
      });

      for (const [month, summary] of byMonth.entries()) {
        await setDoc(doc(db, "guildNoticeArchives", month), {
          ...summary,
          consolidatedAt: serverTimestamp(),
          consolidatedByUid: user.uid,
          consolidatedBy: actorName(user),
        }, { merge: true });
      }

      for (let i = 0; i < old.length; i += 450) {
        const batch = writeBatch(db);
        old.slice(i, i + 450).forEach((item) => batch.delete(item.ref));
        await batch.commit();
      }

      await refreshArchives();
      setMessage(`Consolidated ${old.length} old activity records into ${byMonth.size} monthly summaries. Recovery archive: ${archive.archiveId}.`);
    } catch (err) {
      setError(err?.message || "Consolidation failed.");
    } finally {
      setConsolidateBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <section className="admin-hero admin-denied">
          <div className="admin-kicker">ACCESS DENIED</div>
          <h1>Administrator Portal</h1>
          <p>This area is restricted to active authenticated administrators.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <section className="admin-hero">
        <div>
          <div className="admin-kicker">SYSTEM CONTROL • ADMIN ONLY</div>
          <h1>Administrator Portal</h1>
          <p>Secure profile, administrator access, backup / restore, Firebase data status, recovery archives and maintenance.</p>
        </div>
        <div className="admin-hero-badge">
          <span>● ADMIN SESSION</span>
          <strong>{actorName(user)}</strong>
          <small>{user.email || ""}</small>
        </div>
      </section>

      <div className="admin-tabs" role="tablist" aria-label="Administrator sections">
        {[
          ["overview", "OVERVIEW"],
          ["profile", "MY PROFILE"],
          ["admins", "ADMIN ACCESS"],
          ["backup", "BACKUP / RESTORE"],
          ["health", "DATA STATUS"],
          ["maintenance", "MAINTENANCE"],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {message && <div className="admin-alert success">✓ {message}</div>}
      {error && <div className="admin-alert error">! {error}</div>}

      {tab === "overview" && (
        <section className="admin-grid">
          <article className="admin-card admin-card-wide">
            <div className="admin-card-kicker">CONTROL SUMMARY</div>
            <h2>Guild Data Management</h2>
            <p>Every sensitive operation stays inside the authenticated administrator portal.</p>
            <div className="admin-feature-grid">
              <div><b>PROFILE</b><span>Name, email, password and backup reminder.</span></div>
              <div><b>ACCESS</b><span>Registration PIN and active administrator directory.</span></div>
              <div><b>BACKUP</b><span>Exact JSON plus organized, importable XLSX.</span></div>
              <div><b>STATUS</b><span>Live Firebase collection/document inventory.</span></div>
              <div><b>RECOVERY</b><span>Deleted/reset data retained for 90 days.</span></div>
              <div><b>MAINTENANCE</b><span>Audit consolidation and protected factory reset.</span></div>
            </div>
          </article>

          <article className="admin-card">
            <div className="admin-card-kicker">SECURITY</div>
            <h2>PIN Status</h2>
            <p>The active registration and factory-reset PINs are protected hashes. The actual PIN is never shown publicly.</p>
            <div className="security-status"><span>REGISTRATION PIN</span><strong>● CONFIGURED</strong></div>
            <div className="security-status"><span>FACTORY RESET PIN</span><strong>● CONFIGURED</strong></div>
            <div className="admin-warning">{settings.registrationPin === DEFAULT_PIN ? <>First-install registration PIN is still <strong>123456</strong>. Change it before opening registration publicly.</> : <>The registration PIN has been changed from the first-install default. Use <strong>VIEW</strong> in Admin Access to inspect the current value.</>}</div>
          </article>

          <article className="admin-card stat-card">
            <div className="admin-card-kicker">ACTIVE ADMINISTRATORS</div>
            <div className="admin-big-number">{activeAdmins.length}</div>
            <span>enabled administrator accounts</span>
          </article>

          <article className="admin-card stat-card">
            <div className="admin-card-kicker">RECOVERY ARCHIVES</div>
            <div className="admin-big-number">{archives.filter((a) => a.status !== "purged").length}</div>
            <span>archives currently inside the 90-day recovery window</span>
          </article>
        </section>
      )}

      {tab === "profile" && (
        <section className="admin-stack">
          <article className="admin-card">
            <div className="admin-card-kicker">ADMINISTRATOR PROFILE</div>
            <h2>My Profile</h2>
            <p>Your administrator name is used as the readable actor label in audit and ledger history. UID ownership remains unchanged.</p>
            <form className="admin-form" onSubmit={saveProfile}>
              <label>DISPLAY NAME<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} maxLength={80} required /></label>
              <label>EMAIL<input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} type="email" required /></label>
              <label>CURRENT PASSWORD<input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Required for email/password changes" /></label>
              <label>NEW PASSWORD<input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" minLength={6} autoComplete="new-password" placeholder="Leave blank to keep current password" /></label>
              <label>LOCAL BACKUP REMINDER
                <select value={profile.backupReminderDays} onChange={(e) => setProfile({ ...profile, backupReminderDays: e.target.value })}>
                  {BACKUP_REMINDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <div className="admin-profile-help">The reminder asks whether you want a local JSON + XLSX backup when the selected interval is due.</div>
              <div className="admin-form-actions"><button className="admin-btn primary" disabled={savingProfile}>{savingProfile ? "SAVING..." : "SAVE PROFILE"}</button></div>
            </form>
          </article>
        </section>
      )}

      {tab === "admins" && (
        <section className="admin-stack">
          <article className="admin-card">
            <div className="admin-card-kicker">ADMINISTRATOR REGISTRATION SECURITY</div>
            <h2>Security PINs</h2>
            <p>Only a logged-in active administrator can change these values. Registration validates the submitted PIN before Firebase Authentication creates the new account.</p>
            <form className="admin-pin-grid" onSubmit={savePins}>
              <label>NEW REGISTRATION PIN
                <div className="secret-field"><input type={showRegistrationPin ? "text" : "password"} inputMode="numeric" autoComplete="off" value={pinForm.registration} onChange={(e) => setPinForm({ ...pinForm, registration: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6 digits" /><button type="button" onClick={() => setShowRegistrationPin((value) => !value)}>{showRegistrationPin ? "HIDE" : "VIEW"}</button></div>
              </label>
              <label>NEW FACTORY RESET PIN
                <div className="secret-field"><input type={showFactoryPin ? "text" : "password"} inputMode="numeric" autoComplete="off" value={pinForm.factory} onChange={(e) => setPinForm({ ...pinForm, factory: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6 digits" /><button type="button" onClick={() => setShowFactoryPin((value) => !value)}>{showFactoryPin ? "HIDE" : "VIEW"}</button></div>
              </label>
              <button className="admin-btn primary" disabled={savingPins}>{savingPins ? "SAVING..." : "SAVE PIN SETTINGS"}</button>
            </form>
            <div className="admin-current-pins">
              <div><span>CURRENT REGISTRATION PIN</span><strong>{showRegistrationPin ? (settings.registrationPin || "LEGACY HASH") : "••••••"}</strong><button type="button" onClick={() => setShowRegistrationPin((value) => !value)}>{showRegistrationPin ? "HIDE" : "VIEW"}</button></div>
              <div><span>CURRENT FACTORY RESET PIN</span><strong>{showFactoryPin ? (settings.factoryResetPin || "LEGACY HASH") : "••••••"}</strong><button type="button" onClick={() => setShowFactoryPin((value) => !value)}>{showFactoryPin ? "HIDE" : "VIEW"}</button></div>
            </div>
            <div className="admin-security-note">Changing a PIN updates the protected Firebase security record immediately. The old PIN stops authorizing new registrations as soon as the Firestore write is committed. Only authenticated administrators can read or change these current PIN values. No Firebase rules redeploy is required for a PIN value change; the rules read the current security document dynamically.</div>
          </article>

          <article className="admin-card">
            <div className="admin-card-kicker">ACTIVE ADMINISTRATORS</div>
            <h2>Administrator Directory</h2>
            <div className="admin-list">
              {admins.map((admin) => (
                <div className="admin-list-row" key={admin.id}>
                  <div><strong>{admin.displayName || admin.email || "Administrator"}</strong><span>{admin.email || "No email"} • {admin.id === user.uid ? "CURRENT SESSION" : admin.active === false ? "DISABLED" : "ACTIVE"}</span></div>
                  <button className={admin.active === false ? "admin-btn" : "admin-btn danger"} disabled={admin.id === user.uid} onClick={() => setAdminActive(admin, admin.active === false)}>{admin.id === user.uid ? "CURRENT ADMIN" : admin.active === false ? "ENABLE" : "DISABLE"}</button>
                </div>
              ))}
              {!admins.length && <div className="admin-empty">No administrator records found.</div>}
            </div>
          </article>
        </section>
      )}

      {tab === "backup" && (
        <section className="admin-stack">
          <article className="admin-card admin-card-wide">
            <div className="admin-card-kicker">COMPLETE APPLICATION BACKUP</div>
            <h2>Export Everything</h2>
            <p>One export produces a single dated RAN_TODAY bundle containing BOTH matching files: JSON for exact machine restore and one XLSX workbook for normal people to read and manage. The XLSX keeps a hidden exact JSON payload so application-generated XLSX backups can also be restored.</p>
            <div className="admin-collection-chips">{BACKUP_COLLECTIONS.map((name) => <span key={name}>{name}</span>)}</div>
            <div className="backup-actions">
              <button className="admin-btn primary large" disabled={backupBusy || backupFormatBusy} onClick={exportAll}>{backupBusy ? "CREATING BOTH FILES..." : "BACKUP + DOWNLOAD BOTH • ZIP"}</button>
              <button className="admin-btn" disabled={backupBusy || backupFormatBusy} onClick={exportToFolder}>{backupFormatBusy === "folder" ? "SAVING..." : "SAVE BOTH TO FOLDER"}</button>
              <button className="admin-btn" disabled={backupBusy || backupFormatBusy} onClick={() => exportSingleBackup("json")}>{backupFormatBusy === "json" ? "EXPORTING..." : "JSON ONLY"}</button>
              <button className="admin-btn" disabled={backupBusy || backupFormatBusy} onClick={() => exportSingleBackup("xlsx")}>{backupFormatBusy === "xlsx" ? "EXPORTING..." : "XLSX ONLY"}</button>
            </div>
            <div className="backup-output-note"><strong>ZIP CONTENTS:</strong> RAN_TODAY_YYYY-MM-DD/ → <strong>one human-readable XLSX</strong> + <strong>one exact JSON restore file</strong> + README. The XLSX uses simple sheets such as Players, BH Attendance, BH Rewards, CW Attendance, CW Inventory, Treasury, Tickets, Activity Log, and Raid/CW Schedule. Technical/security data stays in the exact JSON backup. The hidden <em>Backup JSON</em> sheet is only for XLSX restore support.</div>
          </article>

          <article className="admin-card">
            <div className="admin-card-kicker">RESTORE</div>
            <h2>Import JSON or XLSX</h2>
            <p>Both exported formats can be imported. Replace mode automatically creates a 90-day safety archive before clearing mapped collections.</p>
            <div className="admin-form single">
              <label>BACKUP FILE<input type="file" accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} /></label>
              <label>RESTORE MODE<select value={restoreMode} onChange={(e) => setRestoreMode(e.target.value)}><option value="merge">MERGE / REPLACE MATCHING IDS</option><option value="replace">REPLACE ALL MAPPED DATA (ARCHIVE FIRST)</option></select></label>
              <button className="admin-btn primary" disabled={!restoreFile || restoreBusy} onClick={importBackup}>{restoreBusy ? "RESTORING..." : "RESTORE BACKUP"}</button>
            </div>
          </article>

          <article className="admin-card">
            <div className="admin-card-kicker">BACKUP HISTORY</div>
            <h2>Local Backup Reminder</h2>
            <p>Last backup recorded for this administrator: <strong>{dateText(admins.find((a) => a.id === user.uid)?.lastBackupAt)}</strong></p>
            <p>Reminder: <strong>{BACKUP_REMINDER_OPTIONS.find((o) => o.value === profile.backupReminderDays)?.label || "EVERY 1 DAY"}</strong></p>
            <button className="admin-btn primary" onClick={exportAll} disabled={backupBusy}>{backupBusy ? "BACKING UP..." : "CREATE BACKUP NOW"}</button>
          </article>
        </section>
      )}

      {tab === "health" && (
        <section className="admin-stack">
          <article className="admin-card admin-card-wide">
            <div className="admin-card-kicker">FIREBASE DATA STATUS</div>
            <h2>Live Database Inventory</h2>
            <p>This is the application data status, not a generic quota message. It reads the mapped Firebase collections and reports actual document counts and latest activity.</p>
            <div className="health-summary">
              <div><span>FIRESTORE</span><strong className="status-ok">● ONLINE</strong></div>
              <div><span>AUTHENTICATION</span><strong className="status-ok">● SESSION ACTIVE</strong></div>
              <div><span>COLLECTIONS MAPPED</span><strong>{STATUS_COLLECTIONS.length}</strong></div>
              <div><span>TOTAL DOCUMENTS</span><strong>{health.rows.reduce((sum, row) => sum + row.count, 0).toLocaleString()}</strong></div>
            </div>
            <button className="admin-btn primary" onClick={loadHealth} disabled={health.loading}>{health.loading ? "SCANNING FIREBASE..." : "RUN FIREBASE DATA STATUS SCAN"}</button>
            {health.scannedAt && <div className="scan-note">Last scan: {dateText(health.scannedAt)}</div>}
            {health.rows.length > 0 && (
              <div className="health-table">
                <div className="health-head"><span>COLLECTION</span><span>DOCUMENTS</span><span>LAST ACTIVITY</span><span>STATUS</span></div>
                {health.rows.map((row) => (
                  <div className="health-row" key={row.collection}><span>{row.collection}</span><span>{row.count.toLocaleString()}</span><span>{dateText(row.latest)}</span><span className={row.count ? "status-ok" : "status-empty"}>{row.count ? "ACTIVE" : "EMPTY"}</span></div>
                ))}
              </div>
            )}
          </article>

          <article className="admin-card">
            <div className="admin-card-kicker">FIREBASE USAGE & LIMITS</div>
            <h2>Service Reference</h2>
            <p>Firebase plan quotas are separate from your actual guild data. Use this panel for application data; use Firebase Console for authoritative billing/quota measurements.</p>
            <div className="quota-list"><div><span>Document reads</span><b>Firebase Console</b></div><div><span>Document writes</span><b>Firebase Console</b></div><div><span>Stored data</span><b>Firebase Console</b></div><div><span>Network transfer</span><b>Firebase Console</b></div></div>
          </article>
        </section>
      )}

      {tab === "maintenance" && (
        <section className="admin-stack">
          <article className="admin-card">
            <div className="admin-card-kicker">RECOVERY ARCHIVE • 90 DAYS</div>
            <div className="maintenance-heading"><div><h2>Deleted / Reset Data Recovery</h2><p>Factory resets and protected replace/consolidation operations create recovery archives. After {ARCHIVE_RETENTION_DAYS} days, expired archive chunks are permanently purged.</p></div><button className="admin-btn" onClick={refreshArchives}>REFRESH</button></div>
            <div className="archive-list">
              {archives.filter((a) => a.status !== "purged").map((archive) => (
                <div className="archive-row" key={archive.id}>
                  <div><strong>{archive.label || "Deleted data archive"}</strong><span>{archive.reason || "maintenance"} • {archive.documentCount || 0} records • created {dateText(archive.createdAt)} • expires {dateText(archive.expiresAt)}</span></div>
                  <div className="admin-actions"><span className={`archive-status ${archive.status}`}>{String(archive.status || "active").toUpperCase()}</span>{archive.status !== "restored" && <button className="admin-btn primary" disabled={archiveRestoreBusy === archive.id} onClick={() => recoverArchive(archive)}>{archiveRestoreBusy === archive.id ? "RESTORING..." : "RESTORE POINT"}</button>}</div>
                </div>
              ))}
              {!archives.filter((a) => a.status !== "purged").length && <div className="admin-empty">No recoverable archives.</div>}
            </div>
          </article>

          <article className="admin-card">
            <div className="admin-card-kicker">AUDIT FEED</div>
            <h2>Recent Guild Activity</h2>
            <p>Readable administrator activity without exposing internal Firebase IDs in normal views.</p>
            <div className="mini-table">{visibleAudit.map((row) => <div className="mini-row" key={row.id}><div><strong>{row.title || row.action || "Guild Activity"}</strong><span>{row.module || "system"} • {row.createdBy || row.updatedBy || "System"}</span></div><time>{dateText(row.createdAt || row.timestamp)}</time></div>)}{!visibleAudit.length && <div className="admin-empty">No audit records.</div>}</div>
            <div className="pager"><button disabled={auditPage <= 1} onClick={() => setAuditPage((p) => p - 1)}>PREVIOUS</button><span>PAGE {auditPage} / {auditPages} • {auditTotal} RECORDS</span><button disabled={auditPage >= auditPages} onClick={() => setAuditPage((p) => p + 1)}>NEXT</button></div>
          </article>

          <article className="admin-card">
            <div className="admin-card-kicker">DATA MAINTENANCE</div>
            <h2>Compact Old Activity</h2>
            <p>Creates a 90-day recovery archive first, then replaces only old detailed <code>guildNotices</code> records with monthly summaries.</p>
            <label className="standalone-label">OLDER THAN<select value={consolidateDays} onChange={(e) => setConsolidateDays(e.target.value)}><option value="30">30 DAYS</option><option value="60">60 DAYS</option><option value="90">90 DAYS</option><option value="180">180 DAYS</option><option value="365">1 YEAR</option></select></label>
            <button className="admin-btn primary" disabled={consolidateBusy} onClick={consolidateAudit}>{consolidateBusy ? "CONSOLIDATING..." : "CONSOLIDATE OLD ACTIVITY"}</button>
          </article>

          <article className="admin-card factory-card">
            <div className="admin-card-kicker">DESTRUCTIVE • FACTORY RESET</div>
            <h2>Flush Operational Data</h2>
            <p>Use for a new week/season. A complete recovery archive is created first. Administrator accounts and security PIN settings are preserved.</p>
            <div className="factory-warning">The recovery archive is kept for {ARCHIVE_RETENTION_DAYS} days. After expiration, its archived records are permanently purged.</div>
            <label className="standalone-label">FACTORY RESET PIN<input value={resetPin} onChange={(e) => setResetPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 digits" type="password" /></label>
            <label className="standalone-label">TYPE <strong>FACTORY RESET</strong><input value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value)} placeholder="FACTORY RESET" /></label>
            <button className="admin-btn danger large" disabled={resetBusy} onClick={factoryReset}>{resetBusy ? "RESETTING..." : "ARCHIVE + FACTORY RESET"}</button>
          </article>
        </section>
      )}
    </div>
  );
}
