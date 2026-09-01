import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import * as XLSX from "xlsx";

import { auth, db } from "./firebase";
import "./App.css";

/* =========================================================
   CONSTANTS
========================================================= */

const PH_TIMEZONE = "Asia/Manila";

const TIMEZONE_OPTIONS = [
  {
    value: "auto",
    label: "Automatic — My Browser",
  },
  {
    value: "Asia/Manila",
    label: "Philippines — Manila",
  },
  {
    value: "America/Los_Angeles",
    label: "US Pacific — Los Angeles / Seattle",
  },
  {
    value: "America/Denver",
    label: "US Mountain — Denver",
  },
  {
    value: "America/Chicago",
    label: "US Central — Chicago",
  },
  {
    value: "America/New_York",
    label: "US Eastern — New York",
  },
  {
    value: "America/Anchorage",
    label: "US Alaska — Anchorage",
  },
  {
    value: "Pacific/Honolulu",
    label: "US Hawaii — Honolulu",
  },
  {
    value: "Asia/Tokyo",
    label: "Japan — Tokyo",
  },
  {
    value: "Asia/Seoul",
    label: "South Korea — Seoul",
  },
  {
    value: "Asia/Singapore",
    label: "Singapore",
  },
  {
    value: "Asia/Hong_Kong",
    label: "Hong Kong",
  },
  {
    value: "Australia/Sydney",
    label: "Australia — Sydney",
  },
  {
    value: "Europe/London",
    label: "United Kingdom — London",
  },
  {
    value: "Europe/Paris",
    label: "Central Europe — Paris",
  },
  {
    value: "UTC",
    label: "UTC",
  },
];

function getBrowserTimezone() {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC"
    );
  } catch {
    return "UTC";
  }
}

function getStoredTimezone() {
  try {
    return (
      localStorage.getItem(
        "ranAttendanceTimezone"
      ) || "auto"
    );
  } catch {
    return "auto";
  }
}

function saveTimezonePreference(timezone) {
  try {
    localStorage.setItem(
      "ranAttendanceTimezone",
      timezone
    );
  } catch {
    // Ignore localStorage failures.
  }
}

function getDisplayTimezone(selectedTimezone) {
  if (
    !selectedTimezone ||
    selectedTimezone === "auto"
  ) {
    return getBrowserTimezone();
  }

  return selectedTimezone;
}

function getTimezoneLabel(selectedTimezone) {
  if (selectedTimezone === "auto") {
    return `Automatic — ${getBrowserTimezone()}`;
  }

  const option = TIMEZONE_OPTIONS.find(
    (item) => item.value === selectedTimezone
  );

  return option?.label || selectedTimezone;
}

function formatRaidDateTime(value, timezone) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatRaidTime(value, timezone) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatRaidDateOnly(value, timezone) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

const BOSSES = [
  {
    id: "sonya",
    name: "Sonya",
    type: "BOSS RAID",
    frequency: "Every Wednesday",
    day: 3,
    pointsKey: "sonyaPoints",
    defaultHour: 21,
    defaultMinute: 0,
    image: "",
  },
  {
    id: "geomancer",
    name: "Geomancer",
    type: "MINI BOSS",
    frequency: "Every Day",
    day: null,
    pointsKey: "geomancerPoints",
    defaultHour: 12,
    defaultMinute: 0,
    image: "",
  },
  {
    id: "reflector",
    name: "Reflector",
    type: "MINI BOSS",
    frequency: "Every Day",
    day: null,
    pointsKey: "reflectorPoints",
    defaultHour: 12,
    defaultMinute: 0,
    image:
      "https://www.deviantart.com/michaelxgamingph/art/Reflector-01-Ran-Online-1026072917",
  },
  {
    id: "giantHawk",
    name: "Giant Hawk",
    type: "MINI BOSS",
    frequency: "Every Day",
    day: null,
    pointsKey: "giantHawkPoints",
    defaultHour: 12,
    defaultMinute: 0,
    image:
      "https://www.deviantart.com/michaelxgamingph/art/Giant-Hawk-Ran-Online-PH-01-982873311",
  },
];

const DEFAULT_SETTINGS = {
  sonyaPoints: 1,
  geomancerPoints: 0.2,
  reflectorPoints: 0.2,
  giantHawkPoints: 0.2,
  eligibilityScore: 6,
};

const CLASS_OPTIONS = [
  "Swordman",
  "Archer",
  "Gunner",
  "Shaman",
  "Extreme",
  "Brawler",
];

const WEAPON_OPTIONS = [

];

/* =========================================================
   HELPERS
========================================================= */

function normalizeIgn(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function roundScore(value) {
  const n = Number(value || 0);
  return Math.round(n * 100) / 100;
}

function formatScore(value) {
  return roundScore(value).toFixed(2).replace(/\.00$/, "");
}

function timestampToDate(value) {
  if (!value) return null;

  if (value?.toDate) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function formatDateTime(value) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDateOnly(value) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatTime12(hour24, minute) {
  let h = Number(hour24);
  const m = Number(minute);

  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return "—";
  }

  h = ((h % 24) + 24) % 24;

  const period = h >= 12 ? "PM" : "AM";

  let h12 = h % 12;

  if (h12 === 0) {
    h12 = 12;
  }

  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function normalize12HourTo24(hour12, minute, period) {
  let h = parseInt(hour12, 10);
  const m = parseInt(minute, 10);

  if (!Number.isFinite(h) || h < 1 || h > 12) {
    throw new Error("Hour must be between 1 and 12.");
  }

  if (!Number.isFinite(m) || m < 0 || m > 59) {
    throw new Error("Minute must be between 0 and 59.");
  }

  h = h % 12;

  if (String(period).toUpperCase() === "PM") {
    h += 12;
  }

  return {
    hour: h,
    minute: m,
  };
}

function from24Hour(hour24) {
  const h = Number(hour24) || 0;

  return {
    hour: String(h % 12 || 12),
    period: h >= 12 ? "PM" : "AM",
  };
}

function getPhilippinesDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const result = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  });

  return {
    year: Number(result.year),
    month: Number(result.month),
    day: Number(result.day),
    hour: Number(result.hour),
    minute: Number(result.minute),
  };
}

function getTodayPhilippines() {
  const p = getPhilippinesDateParts();

  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(
    p.day
  ).padStart(2, "0")}`;
}

/*
  Philippines is UTC+8 year-round.
*/
function philippinesDateToUTC(year, month, day, hour, minute) {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) - 8 * 60 * 60 * 1000
  );
}

function getNextRaidOccurrence(raid) {
  const now = new Date();
  const today = getPhilippinesDateParts(now);

  const base = new Date(
    Date.UTC(today.year, today.month - 1, today.day)
  );

  for (let i = 0; i <= 14; i++) {
    const candidate = new Date(base);
    candidate.setUTCDate(candidate.getUTCDate() + i);

    const year = candidate.getUTCFullYear();
    const month = candidate.getUTCMonth() + 1;
    const day = candidate.getUTCDate();
    const weekday = candidate.getUTCDay();

    if (raid.day !== null && raid.day !== weekday) {
      continue;
    }

    const occurrence = philippinesDateToUTC(
      year,
      month,
      day,
      Number(raid.hour || 0),
      Number(raid.minute || 0)
    );

    if (occurrence > now) {
      return occurrence;
    }
  }

  return null;
}

function getDefaultRaid(boss) {
  return {
    id: boss.id,
    name: boss.name,
    type: boss.type,
    frequency: boss.frequency,
    day: boss.day,
    hour: boss.defaultHour,
    minute: boss.defaultMinute,
    image: boss.image || "",
    updatedAt: null,
    updatedBy: "",
  };
}

function sanitizeRaid(raid, boss) {
  return {
    id: boss.id,
    name: boss.name,
    type: boss.type,
    frequency: raid?.frequency || boss.frequency,
    day:
      raid?.day === null || raid?.day === undefined
        ? boss.day
        : Number(raid.day),
    hour: Number.isFinite(Number(raid?.hour))
      ? Number(raid.hour)
      : boss.defaultHour,
    minute: Number.isFinite(Number(raid?.minute))
      ? Number(raid.minute)
      : boss.defaultMinute,
    image: raid?.image || boss.image || "",
    updatedAt: raid?.updatedAt || null,
    updatedBy: raid?.updatedBy || "",
  };
}

function safeRow(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (value?.toDate) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

function excelDateToJS(value) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    return new Date(
      Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000
    );
  }

  if (typeof value === "string") {
    const d = new Date(value);

    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  return null;
}

function convertFirestoreObjectForImport(obj) {
  const result = { ...obj };

  Object.keys(result).forEach((key) => {
    const value = result[key];

    if (
      key.toLowerCase().includes("at") ||
      key.toLowerCase().includes("date")
    ) {
      const parsed = excelDateToJS(value);

      if (parsed) {
        result[key] = parsed.toISOString();
      }
    }
  });

  return result;
}

/* =========================================================
   MODAL
========================================================= */

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal-card ${wide ? "modal-wide" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-kicker">ADMIN PANEL</div>
            <h2>{title}</h2>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN LOGIN
========================================================= */

function AdminLogin({ onClose }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(event) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const adminRef = doc(db, "admins", credential.user.uid);
      const adminSnap = await getDoc(adminRef);

      if (!adminSnap.exists() || adminSnap.data()?.active !== true) {
        await signOut(auth);
        throw new Error("This account is not an active administrator.");
      }

      onClose();
    } catch (err) {
      console.error(err);

      setError(
        err?.message || "Unable to sign in. Check your credentials."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Administrator Login" onClose={onClose}>
      <form className="login-form" onSubmit={login}>
        <div className="login-icon">⚡</div>

        <p className="modal-description">
          Administrator access is required for attendance, players,
          scoring, claims, settings, and backup operations.
        </p>

        {error && <div className="error-box">{error}</div>}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@email.com"
            autoComplete="username"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
          />
        </label>

        <button className="primary-button full-button" disabled={busy}>
          {busy ? "SIGNING IN..." : "SIGN IN"}
        </button>
      </form>
    </Modal>
  );
}

/* =========================================================
   RAID CARD
========================================================= */

function RaidCard({
  raid,
  onEdit,
  timezone,
}) {
  const displayTimezone =
    getDisplayTimezone(timezone);

  const next = getNextRaidOccurrence(raid);

  return (
    <article className="raid-card">
      <div className="raid-image">
        {raid.image ? (
          <img
            src={raid.image}
            alt={raid.name}
            onError={(event) => {
              event.currentTarget.style.display =
                "none";
            }}
          />
        ) : (
          <div className="boss-placeholder">
            <span>RAN</span>
            <strong>
              {raid.name.slice(0, 1)}
            </strong>
          </div>
        )}

        <div className="raid-type">
          {raid.type}
        </div>
      </div>

      <div className="raid-content">
        <div className="raid-title-row">
          <div>
            <h2>{raid.name}</h2>
            <p>{raid.frequency}</p>
          </div>

          <div className="raid-status">
            <span className="status-dot" />
            ACTIVE
          </div>
        </div>

        <div className="raid-time-box timezone-aware">
          <span>NEXT RAID</span>

          {next ? (
            <>
              <strong>
                {formatRaidTime(
                  next,
                  displayTimezone
                )}
              </strong>

              <div className="raid-local-date">
                {formatRaidDateOnly(
                  next,
                  displayTimezone
                )}
              </div>

              <small>
                {getTimezoneLabel(timezone)}
              </small>

              <div className="raid-ph-time">
                Philippines Time:{" "}
                {formatTime12(
                  raid.hour,
                  raid.minute
                )}
              </div>
            </>
          ) : (
            <strong>
              No occurrence found
            </strong>
          )}
        </div>

        <div className="raid-meta">
          <div>
            <span>Schedule</span>

            <strong>
              {raid.frequency}
              <br />
              {formatTime12(
                raid.hour,
                raid.minute
              )}
            </strong>
          </div>

          <div>
            <span>Last Updated</span>

            <strong>
              {raid.updatedAt
                ? formatDateTime(
                  raid.updatedAt
                )
                : "Default schedule"}
            </strong>
          </div>
        </div>

        <button
          className="outline-button"
          onClick={() => onEdit(raid)}
        >
          EDIT SCHEDULE
        </button>
      </div>
    </article>
  );
}

/* =========================================================
   RAID EDITOR
========================================================= */

function RaidEditor({ raid, onClose, onSaved }) {
  const initial = from24Hour(raid.hour);

  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(
    String(raid.minute ?? 0).padStart(2, "0")
  );
  const [period, setPeriod] = useState(initial.period);
  const [frequency, setFrequency] = useState(
    raid.day === null ? "daily" : "weekly"
  );
  const [day, setDay] = useState(
    raid.day === null ? "0" : String(raid.day)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");

    try {
      const converted = normalize12HourTo24(
        hour,
        minute,
        period
      );

      const updatedRaid = {
        ...raid,
        frequency:
          frequency === "daily"
            ? "Every Day"
            : `Every ${[
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ][Number(day)]
            }`,
        day:
          frequency === "daily"
            ? null
            : Number(day),
        hour: converted.hour,
        minute: converted.minute,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || auth.currentUser?.uid || "Admin",
      };

      const currentRef = doc(db, "settings", "raidSchedule");
      const currentSnap = await getDoc(currentRef);

      const currentData = currentSnap.exists()
        ? currentSnap.data()
        : {};

      const currentRaids = Array.isArray(currentData.raids)
        ? currentData.raids
        : BOSSES.map(getDefaultRaid);

      const nextRaids = BOSSES.map((boss) => {
        if (boss.id === raid.id) {
          return sanitizeRaid(updatedRaid, boss);
        }

        const existing = currentRaids.find(
          (item) => item.id === boss.id
        );

        return sanitizeRaid(existing, boss);
      });

      await setDoc(
        currentRef,
        {
          raids: nextRaids,
          updatedAt: serverTimestamp(),
          updatedBy:
            auth.currentUser?.email ||
            auth.currentUser?.uid ||
            "Admin",
        },
        { merge: true }
      );

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to save schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${raid.name} Schedule`} onClose={onClose}>
      <div className="editor-grid">
        <div className="editor-preview">
          <span className="editor-preview-label">CURRENT TIME</span>
          <strong>{formatTime12(raid.hour, raid.minute)}</strong>
          <small>Philippines Time</small>
        </div>

        <div className="editor-section">
          <label>
            Frequency
            <select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value)}
            >
              <option value="daily">Every Day</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>

          {frequency === "weekly" && (
            <label>
              Day
              <select
                value={day}
                onChange={(event) => setDay(event.target.value)}
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </label>
          )}

          <div className="time-controls">
            <label>
              Hour
              <select
                value={hour}
                onChange={(event) => setHour(event.target.value)}
              >
                {Array.from({ length: 12 }, (_, index) => {
                  const value = String(index + 1);

                  return (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  );
                })}
              </select>
            </label>

            <label>
              Minute
              <select
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
              >
                {Array.from({ length: 60 }, (_, index) => {
                  const value = String(index).padStart(2, "0");

                  return (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  );
                })}
              </select>
            </label>

            <label>
              AM / PM
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          CANCEL
        </button>

        <button className="primary-button" onClick={save} disabled={busy}>
          {busy ? "SAVING..." : "SAVE SCHEDULE"}
        </button>
      </div>
    </Modal>
  );
}

/* =========================================================
   PLAYER FORM
========================================================= */

function PlayerFormModal({
  player,
  onClose,
  onSaved,
}) {
  const [ign, setIgn] = useState(player?.ign || "");
  const [playerClass, setPlayerClass] = useState(
    player?.class || ""
  );
  const [weapon, setWeapon] = useState(
    player?.preferredWeapon || ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const editing = Boolean(player);

  async function savePlayer(event) {
    event.preventDefault();

    const cleanIgn = ign.trim();

    if (!cleanIgn) {
      setError("IGN is required.");
      return;
    }

    if (!playerClass.trim()) {
      setError("Class is required.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (editing) {
        await setDoc(
          doc(db, "attendancePlayers", player.id),
          {
            ign: cleanIgn,
            class: playerClass.trim(),
            preferredWeapon: weapon.trim(),
            updatedAt: serverTimestamp(),
            updatedBy:
              auth.currentUser?.email ||
              auth.currentUser?.uid ||
              "Admin",
          },
          { merge: true }
        );
      } else {
        await addDoc(collection(db, "attendancePlayers"), {
          ign: cleanIgn,
          class: playerClass.trim(),
          preferredWeapon: weapon.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy:
            auth.currentUser?.email ||
            auth.currentUser?.uid ||
            "Admin",
          updatedBy:
            auth.currentUser?.email ||
            auth.currentUser?.uid ||
            "Admin",
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to save player.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${player.ign}` : "Add New Player"}
      onClose={onClose}
    >
      <form className="player-form" onSubmit={savePlayer}>
        {error && <div className="error-box">{error}</div>}

        <label>
          IGN
          <input
            value={ign}
            onChange={(event) => setIgn(event.target.value)}
            placeholder="Enter in-game name"
            autoFocus
            required
          />
        </label>

        <label>
          Class
          <input
            list="class-options"
            value={playerClass}
            onChange={(event) => setPlayerClass(event.target.value)}
            placeholder="Type any class"
            required
          />
          <datalist id="class-options">
            {CLASS_OPTIONS.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>

        <label>
          Preferred Weapon
          <input
            list="weapon-options"
            value={weapon}
            onChange={(event) => setWeapon(event.target.value)}
            placeholder="Type or select weapon"
          />
          <datalist id="weapon-options">
            {WEAPON_OPTIONS.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            CANCEL
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={busy}
          >
            {busy
              ? "SAVING..."
              : editing
                ? "SAVE CHANGES"
                : "ADD PLAYER"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* =========================================================
   SCORE CALCULATION
========================================================= */

function getPlayerScore(player, histories, ledger) {
  let total = 0;

  for (const record of histories) {
    const samePlayer =
      record.playerId === player.id ||
      (
        !record.playerId &&
        normalizeIgn(record.ign) === normalizeIgn(player.ign)
      );

    if (samePlayer) {
      total += Number(record.points || 0);
    }
  }

  for (const record of ledger) {
    const samePlayer =
      record.playerId === player.id ||
      (
        !record.playerId &&
        normalizeIgn(record.ign) === normalizeIgn(player.ign)
      );

    if (samePlayer) {
      total += Number(record.delta || 0);
    }
  }

  return roundScore(total);
}

/* =========================================================
   HISTORY MODAL
========================================================= */

function PlayerHistoryModal({
  player,
  histories,
  ledger,
  score,
  onClose,
}) {
  if (!player) return null;

  const playerHistory = histories
    .filter(
      (item) =>
        item.playerId === player.id ||
        (
          !item.playerId &&
          normalizeIgn(item.ign) === normalizeIgn(player.ign)
        )
    )
    .sort((a, b) => {
      const ad = timestampToDate(a.createdAt)?.getTime() || 0;
      const bd = timestampToDate(b.createdAt)?.getTime() || 0;

      return bd - ad;
    });

  const playerLedger = ledger
    .filter(
      (item) =>
        item.playerId === player.id ||
        (
          !item.playerId &&
          normalizeIgn(item.ign) === normalizeIgn(player.ign)
        )
    )
    .sort((a, b) => {
      const ad = timestampToDate(a.createdAt)?.getTime() || 0;
      const bd = timestampToDate(b.createdAt)?.getTime() || 0;

      return bd - ad;
    });

  return (
    <Modal title={`${player.ign} — Full History`} onClose={onClose} wide>
      <div className="history-profile">
        <div>
          <span>IGN</span>
          <strong>{player.ign}</strong>
        </div>

        <div>
          <span>CLASS</span>
          <strong>{player.class || "—"}</strong>
        </div>

        <div>
          <span>WEAPON</span>
          <strong>{player.preferredWeapon || "—"}</strong>
        </div>

        <div>
          <span>CURRENT SCORE</span>
          <strong className={score >= 6 ? "score-green" : ""}>
            {formatScore(score)}
          </strong>
        </div>
      </div>

      <div className="history-section">
        <div className="section-title-row">
          <h3>Attendance History</h3>
          <span>{playerHistory.length} records</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Boss</th>
                <th>Points</th>
                <th>Saved By</th>
              </tr>
            </thead>

            <tbody>
              {playerHistory.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    No attendance history.
                  </td>
                </tr>
              ) : (
                playerHistory.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.attendanceDate ||
                        formatDateOnly(item.createdAt)}
                    </td>
                    <td>{item.bossName || item.bossId}</td>
                    <td className="positive-value">
                      +{formatScore(item.points)}
                    </td>
                    <td>
                      {item.createdBy || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="history-section">
        <div className="section-title-row">
          <h3>Score Ledger</h3>
          <span>{playerLedger.length} records</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Delta</th>
                <th>Old Score</th>
                <th>New Score</th>
                <th>Reason</th>
              </tr>
            </thead>

            <tbody>
              {playerLedger.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    No score ledger records.
                  </td>
                </tr>
              ) : (
                playerLedger.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      <span className="ledger-type">
                        {item.type || "LEDGER"}
                      </span>
                    </td>
                    <td
                      className={
                        Number(item.delta) >= 0
                          ? "positive-value"
                          : "negative-value"
                      }
                    >
                      {Number(item.delta) >= 0 ? "+" : ""}
                      {formatScore(item.delta)}
                    </td>
                    <td>{formatScore(item.oldScore)}</td>
                    <td>{formatScore(item.newScore)}</td>
                    <td>{item.reason || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   CLAIM MODAL
========================================================= */

function ClaimModal({
  player,
  currentScore,
  eligibilityScore,
  onClose,
}) {
  const [weapon, setWeapon] = useState(player?.preferredWeapon || "");
  const [reason, setReason] = useState("Weapon claim");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!player) return null;

  const eligible = currentScore >= eligibilityScore;

  async function claim() {
    if (!eligible) {
      setError("This player is not eligible.");
      return;
    }

    if (!weapon.trim()) {
      setError("Enter the weapon being claimed.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const oldScore = roundScore(currentScore);
      const newScore = roundScore(
        currentScore - eligibilityScore
      );

      await addDoc(collection(db, "scoreLedger"), {
        playerId: player.id,
        ign: player.ign,
        type: "WEAPON_CLAIM",
        delta: -Number(eligibilityScore),
        oldScore,
        newScore,
        weapon: weapon.trim(),
        reason: reason.trim() || "Weapon claim",
        admin:
          auth.currentUser?.email ||
          auth.currentUser?.uid ||
          "Admin",
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "attendancePlayers", player.id),
        {
          updatedAt: serverTimestamp(),
          updatedBy:
            auth.currentUser?.email ||
            auth.currentUser?.uid ||
            "Admin",
        },
        { merge: true }
      );

      onClose();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to claim weapon.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Claim Weapon — ${player.ign}`} onClose={onClose}>
      <div className="claim-summary">
        <div>
          <span>CURRENT SCORE</span>
          <strong>{formatScore(currentScore)}</strong>
        </div>

        <div>
          <span>REQUIRED</span>
          <strong>{formatScore(eligibilityScore)}</strong>
        </div>

        <div>
          <span>AFTER CLAIM</span>
          <strong>{formatScore(currentScore - eligibilityScore)}</strong>
        </div>
      </div>

      {!eligible && (
        <div className="warning-box">
          This player needs {formatScore(eligibilityScore - currentScore)}{" "}
          more points to claim.
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <label>
        Weapon
        <input
          list="claim-weapon-options"
          value={weapon}
          onChange={(event) => setWeapon(event.target.value)}
          placeholder="Weapon being claimed"
        />
        <datalist id="claim-weapon-options">
          {WEAPON_OPTIONS.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>

      <label>
        Reason
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason"
        />
      </label>

      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          CANCEL
        </button>

        <button
          className="danger-button"
          onClick={claim}
          disabled={busy || !eligible}
        >
          {busy ? "PROCESSING..." : "CONFIRM CLAIM"}
        </button>
      </div>
    </Modal>
  );
}

/* =========================================================
   SCORE OVERRIDE MODAL
========================================================= */

function OverrideModal({
  player,
  currentScore,
  onClose,
}) {
  const [newScore, setNewScore] = useState(String(currentScore));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!player) return null;

  async function save() {
    const target = Number(newScore);

    if (!Number.isFinite(target) || target < 0) {
      setError("Enter a valid score.");
      return;
    }

    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }

    const oldScore = roundScore(currentScore);
    const finalScore = roundScore(target);
    const delta = roundScore(finalScore - oldScore);

    setBusy(true);
    setError("");

    try {
      await addDoc(collection(db, "scoreLedger"), {
        playerId: player.id,
        ign: player.ign,
        type: "MANUAL_OVERRIDE",
        delta,
        oldScore,
        newScore: finalScore,
        reason: reason.trim(),
        admin:
          auth.currentUser?.email ||
          auth.currentUser?.uid ||
          "Admin",
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "attendancePlayers", player.id),
        {
          updatedAt: serverTimestamp(),
          updatedBy:
            auth.currentUser?.email ||
            auth.currentUser?.uid ||
            "Admin",
        },
        { merge: true }
      );

      onClose();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to override score.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Override Score — ${player.ign}`} onClose={onClose}>
      <div className="override-current">
        <span>CURRENT CALCULATED SCORE</span>
        <strong>{formatScore(currentScore)}</strong>
      </div>

      {error && <div className="error-box">{error}</div>}

      <label>
        New Score
        <input
          type="number"
          min="0"
          step="0.1"
          value={newScore}
          onChange={(event) => setNewScore(event.target.value)}
        />
      </label>

      <label>
        Required Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain why this score is being changed..."
          rows="4"
        />
      </label>

      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          CANCEL
        </button>

        <button
          className="primary-button"
          onClick={save}
          disabled={busy}
        >
          {busy ? "SAVING..." : "SAVE OVERRIDE"}
        </button>
      </div>
    </Modal>
  );
}

/* =========================================================
   ATTENDANCE PAGE
========================================================= */

function AttendancePage({
  players,
  histories,
  ledger,
  settings,
  isAdmin,
  onAddPlayer,
  onEditPlayer,
  onDeletePlayer,
  onPurgePlayer,
  onHistory,
  onClaim,
  onOverride,
}) {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("ALL");
  const [weaponFilter, setWeaponFilter] = useState("ALL");
  const [eligibilityFilter, setEligibilityFilter] = useState("ALL");

  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(
    getTodayPhilippines()
  );
  const [attendanceDraft, setAttendanceDraft] = useState([]);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState("");

  const classList = useMemo(() => {
    return [
      ...new Set(
        players
          .map((p) => p.class)
          .filter(Boolean)
      ),
    ].sort();
  }, [players]);

  const weaponList = useMemo(() => {
    return [
      ...new Set(
        players
          .map((p) => p.preferredWeapon)
          .filter(Boolean)
      ),
    ].sort();
  }, [players]);

  const selectedPlayer = players.find(
    (player) => player.id === selectedPlayerId
  );

  const selectedScore = selectedPlayer
    ? getPlayerScore(selectedPlayer, histories, ledger)
    : 0;

  const filteredPlayers = useMemo(() => {
    const term = normalizeIgn(search);

    return [...players]
      .filter((player) => {
        if (
          term &&
          !normalizeIgn(player.ign).includes(term)
        ) {
          return false;
        }

        if (
          classFilter !== "ALL" &&
          player.class !== classFilter
        ) {
          return false;
        }

        if (
          weaponFilter !== "ALL" &&
          player.preferredWeapon !== weaponFilter
        ) {
          return false;
        }

        const score = getPlayerScore(
          player,
          histories,
          ledger
        );

        if (
          eligibilityFilter === "ELIGIBLE" &&
          score < Number(settings.eligibilityScore)
        ) {
          return false;
        }

        if (
          eligibilityFilter === "NOT_ELIGIBLE" &&
          score >= Number(settings.eligibilityScore)
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) =>
        String(a.ign).localeCompare(String(b.ign))
      );
  }, [
    players,
    histories,
    ledger,
    search,
    classFilter,
    weaponFilter,
    eligibilityFilter,
    settings.eligibilityScore,
  ]);

  function toggleBoss(bossId) {
    setAttendanceDraft((current) =>
      current.includes(bossId)
        ? current.filter((id) => id !== bossId)
        : [...current, bossId]
    );
  }

  async function saveAttendance() {
    if (!isAdmin) return;

    if (!selectedPlayer) {
      setAttendanceMessage("Select a player first.");
      return;
    }

    if (attendanceDraft.length === 0) {
      setAttendanceMessage("Select at least one boss.");
      return;
    }

    if (!attendanceDate) {
      setAttendanceMessage("Select an attendance date.");
      return;
    }

    setSavingAttendance(true);
    setAttendanceMessage("");

    try {
      const selectedBosses = BOSSES.filter((boss) =>
        attendanceDraft.includes(boss.id)
      );

      const adminName =
        auth.currentUser?.email ||
        auth.currentUser?.uid ||
        "Admin";

      for (const boss of selectedBosses) {
        const points = Number(
          settings[boss.pointsKey] || 0
        );

        await addDoc(collection(db, "attendanceHistory"), {
          playerId: selectedPlayer.id,
          ign: selectedPlayer.ign,
          bossId: boss.id,
          bossName: boss.name,
          points,
          attendanceDate,
          createdAt: serverTimestamp(),
          createdBy: adminName,
        });
      }

      await setDoc(
        doc(
          db,
          "attendancePlayers",
          selectedPlayer.id
        ),
        {
          updatedAt: serverTimestamp(),
          updatedBy: adminName,
        },
        { merge: true }
      );

      setAttendanceDraft([]);
      setAttendanceMessage(
        `Attendance saved for ${selectedPlayer.ign}.`
      );
    } catch (err) {
      console.error(err);
      setAttendanceMessage(
        err?.message || "Unable to save attendance."
      );
    } finally {
      setSavingAttendance(false);
    }
  }

  async function deletePlayer(player) {
    if (!isAdmin) return;

    const confirmed = window.confirm(
      `Delete the player profile for "${player.ign}"?\n\n` +
      `Their attendance history and score ledger will remain.\n\n` +
      `Use NEW USER / PURGE if this is actually a completely different person.`
    );

    if (!confirmed) return;

    await onDeletePlayer(player);
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <div className="eyebrow">RAN ONLINE EP7</div>
          <h1>Attendance</h1>
          <p>
            Track raid attendance, points, eligibility, claims,
            and complete player history.
          </p>
        </div>

        {isAdmin && (
          <button
            className="primary-button"
            onClick={onAddPlayer}
          >
            + ADD PLAYER
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="attendance-console">
          <div className="console-header">
            <div>
              <span className="console-kicker">
                ADMIN ATTENDANCE
              </span>
              <h2>Record Attendance</h2>
            </div>

            <div className="admin-badge">ADMIN</div>
          </div>

          <div className="console-grid">
            <label>
              Player
              <select
                value={selectedPlayerId}
                onChange={(event) => {
                  setSelectedPlayerId(event.target.value);
                  setAttendanceDraft([]);
                  setAttendanceMessage("");
                }}
              >
                <option value="">Select IGN...</option>

                {players
                  .slice()
                  .sort((a, b) =>
                    a.ign.localeCompare(b.ign)
                  )
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.ign} — {player.class || "No Class"}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Attendance Date
              <input
                type="date"
                value={attendanceDate}
                onChange={(event) =>
                  setAttendanceDate(event.target.value)
                }
              />
            </label>

            <div className="console-score">
              <span>CURRENT SCORE</span>
              <strong>
                {selectedPlayer
                  ? formatScore(selectedScore)
                  : "—"}
              </strong>
            </div>
          </div>

          <div className="boss-selector">
            <span className="field-label">
              Select Boss Attendance
            </span>

            <div className="boss-check-grid">
              {BOSSES.map((boss) => {
                const checked = attendanceDraft.includes(
                  boss.id
                );

                return (
                  <button
                    type="button"
                    key={boss.id}
                    className={`boss-check ${checked ? "checked" : ""
                      }`}
                    onClick={() => toggleBoss(boss.id)}
                  >
                    <span className="checkbox">
                      {checked ? "✓" : ""}
                    </span>

                    <span>
                      <strong>{boss.name}</strong>
                      <small>
                        +{formatScore(settings[boss.pointsKey])}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="console-footer">
            {attendanceMessage && (
              <span
                className={
                  attendanceMessage.includes("saved")
                    ? "success-text"
                    : "error-text"
                }
              >
                {attendanceMessage}
              </span>
            )}

            <button
              className="primary-button"
              onClick={saveAttendance}
              disabled={savingAttendance}
            >
              {savingAttendance
                ? "SAVING..."
                : "SAVE ATTENDANCE"}
            </button>
          </div>
        </div>
      )}

      <div className="filter-panel">
        <div className="filter-title">
          <span>PLAYER DIRECTORY</span>
          <strong>{filteredPlayers.length} players</strong>
        </div>

        <div className="filters">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search IGN..."
          />

          <select
            value={classFilter}
            onChange={(event) =>
              setClassFilter(event.target.value)
            }
          >
            <option value="ALL">All Classes</option>

            {classList.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={weaponFilter}
            onChange={(event) =>
              setWeaponFilter(event.target.value)
            }
          >
            <option value="ALL">All Weapons</option>

            {weaponList.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={eligibilityFilter}
            onChange={(event) =>
              setEligibilityFilter(event.target.value)
            }
          >
            <option value="ALL">All Scores</option>
            <option value="ELIGIBLE">Eligible</option>
            <option value="NOT_ELIGIBLE">
              Not Eligible
            </option>
          </select>
        </div>
      </div>

      <div className="attendance-table-card">
        <div className="table-scroll">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>IGN</th>
                <th>Class</th>
                <th>Preferred Weapon</th>

                {BOSSES.map((boss) => (
                  <th key={boss.id}>{boss.name}</th>
                ))}

                <th>Score</th>
                <th>Eligibility</th>
                <th>Last Updated</th>

                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 12 : 11}
                    className="empty-cell"
                  >
                    No players found.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => {
                  const score = getPlayerScore(
                    player,
                    histories,
                    ledger
                  );

                  const eligible =
                    score >=
                    Number(settings.eligibilityScore);

                  const playerHistory = histories.filter(
                    (item) =>
                      item.playerId === player.id ||
                      (
                        !item.playerId &&
                        normalizeIgn(item.ign) ===
                        normalizeIgn(player.ign)
                      )
                  );

                  const attendedBosses = new Set(
                    playerHistory.map(
                      (item) => item.bossId
                    )
                  );

                  return (
                    <tr key={player.id}>
                      <td>
                        <button
                          className="ign-button"
                          onClick={() =>
                            onHistory(player)
                          }
                        >
                          {player.ign}
                        </button>
                      </td>

                      <td>
                        <span className="class-pill">
                          {player.class || "—"}
                        </span>
                      </td>

                      <td>
                        {player.preferredWeapon || "—"}
                      </td>

                      {BOSSES.map((boss) => (
                        <td key={boss.id}>
                          <span
                            className={`attendance-dot ${attendedBosses.has(boss.id)
                              ? "present"
                              : ""
                              }`}
                          >
                            {attendedBosses.has(
                              boss.id
                            )
                              ? "✓"
                              : "—"}
                          </span>
                        </td>
                      ))}

                      <td>
                        <strong
                          className={`score-value ${eligible ? "score-green" : ""
                            }`}
                        >
                          {formatScore(score)}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`eligibility ${eligible
                            ? "eligible"
                            : "not-eligible"
                            }`}
                        >
                          {eligible
                            ? "ELIGIBLE"
                            : "NOT ELIGIBLE"}
                        </span>
                      </td>

                      <td className="date-cell">
                        {formatDateTime(
                          player.updatedAt
                        )}
                      </td>

                      {isAdmin && (
                        <td>
                          <div className="row-actions">
                            <button
                              className="small-button"
                              onClick={() =>
                                onEditPlayer(player)
                              }
                            >
                              EDIT
                            </button>

                            <button
                              className="small-button"
                              onClick={() =>
                                onHistory(player)
                              }
                            >
                              HISTORY
                            </button>

                            <button
                              className="small-button claim-button"
                              onClick={() =>
                                onClaim(player)
                              }
                              disabled={!eligible}
                            >
                              CLAIM
                            </button>

                            <button
                              className="small-button override-button"
                              onClick={() =>
                                onOverride(player)
                              }
                            >
                              SCORE
                            </button>

                            <button
                              className="small-button delete-button"
                              onClick={() =>
                                deletePlayer(player)
                              }
                            >
                              DELETE
                            </button>

                            <button
                              className="small-button purge-button"
                              onClick={() =>
                                onPurgePlayer(player)
                              }
                            >
                              NEW USER / PURGE
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <div className="danger-information">
          <div className="danger-icon">!</div>

          <div>
            <strong>NEW USER / PURGE IGN</strong>
            <p>
              Use this only when the current IGN belongs to a
              completely different person. It permanently removes
              the player's profile, attendance records, weapon
              claims, score deductions, and manual score changes.
              Re-adding the IGN afterwards starts from 0.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/* =========================================================
   RAID PAGE
========================================================= */

function RaidPage({
  raids,
  onEdit,
  timezone,
  onTimezoneChange,
}) {
  const displayTimezone =
    getDisplayTimezone(timezone);

  return (
    <section className="page-section">
      <div className="hero-heading">
        <div>
          <div className="eyebrow">
            RAN ONLINE EP7 CLASSIC
          </div>

          <h1>Raid Schedule</h1>

          <p>
            Philippines raid schedule with automatic
            timezone conversion.
          </p>
        </div>

        <div className="timezone-badge">
          <span>SCHEDULE SOURCE</span>
          <strong>PHILIPPINES TIME</strong>
        </div>
      </div>

      {/* =====================================================
          TIMEZONE SELECTOR
      ===================================================== */}

      <div className="timezone-panel">
        <div className="timezone-panel-info">
          <div className="timezone-icon">
            🌎
          </div>

          <div>
            <div className="timezone-title">
              Display Timezone
            </div>

            <div className="timezone-subtitle">
              Raid schedules are stored in Philippines
              Time (Asia/Manila). Choose how you want
              the schedule displayed.
            </div>
          </div>
        </div>

        <div className="timezone-control">
          <select
            value={timezone}
            onChange={(event) =>
              onTimezoneChange(
                event.target.value
              )
            }
            className="timezone-select"
          >
            {TIMEZONE_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>

          <div className="timezone-current">
            Showing raid times in{" "}
            <strong>
              {displayTimezone}
            </strong>
          </div>
        </div>
      </div>

      <div className="raid-grid">
        {raids.map((raid) => (
          <RaidCard
            key={raid.id}
            raid={raid}
            timezone={timezone}
            onEdit={onEdit}
          />
        ))}
      </div>

      <div className="raid-note">
        <div className="raid-note-icon">
          ◷
        </div>

        <div>
          <strong>
            Timezone Conversion
          </strong>

          <p>
            The official schedule is always saved in
            Philippines Time (Asia/Manila). The displayed
            time and date automatically convert to your
            selected timezone, including when the conversion
            crosses midnight into another day.
          </p>

          <p className="raid-note-example">
            Example: 9:00 PM Philippines → 6:00 AM US
            Pacific → 9:00 AM US Eastern → 10:00 PM Tokyo.
          </p>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function AdminPage({
  players,
  histories,
  ledger,
  settings,
  settingsHistory,
  user,
  onAddPlayer,
  onEditPlayer,
  onHistory,
  onClaim,
  onOverride,
  onPurgePlayer,
  onDeletePlayer,
  onSaveSettings,
  onExport,
  onImport,
}) {
  const [tab, setTab] = useState("dashboard");

  const totalScore = useMemo(() => {
    return roundScore(
      players.reduce(
        (sum, player) =>
          sum +
          getPlayerScore(player, histories, ledger),
        0
      )
    );
  }, [players, histories, ledger]);

  const eligibleCount = players.filter(
    (player) =>
      getPlayerScore(player, histories, ledger) >=
      Number(settings.eligibilityScore)
  ).length;

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONTROL CENTER</div>
          <h1>Administrator</h1>
          <p>
            Manage players, scoring, history, settings, and
            backups.
          </p>
        </div>

        <div className="admin-user">
          <span>SIGNED IN</span>
          <strong>
            {user?.email || user?.uid || "Administrator"}
          </strong>
        </div>
      </div>

      <div className="admin-tabs">
        {[
          ["dashboard", "Dashboard"],
          ["players", "Players"],
          ["ledger", "Score Ledger"],
          ["settings", "Scoring"],
          ["history", "Settings History"],
          ["backup", "Backup / Restore"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "admin-tab-active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div className="admin-dashboard">
          <div className="stat-grid">
            <div className="stat-card">
              <span>TOTAL PLAYERS</span>
              <strong>{players.length}</strong>
            </div>

            <div className="stat-card">
              <span>ELIGIBLE</span>
              <strong>{eligibleCount}</strong>
            </div>

            <div className="stat-card">
              <span>ATTENDANCE RECORDS</span>
              <strong>{histories.length}</strong>
            </div>

            <div className="stat-card">
              <span>LEDGER RECORDS</span>
              <strong>{ledger.length}</strong>
            </div>

            <div className="stat-card">
              <span>POINTS IN SYSTEM</span>
              <strong>{formatScore(totalScore)}</strong>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="dashboard-card">
              <div className="dashboard-card-title">
                <span>ELIGIBILITY THRESHOLD</span>
              </div>

              <strong className="big-number">
                {formatScore(settings.eligibilityScore)}
              </strong>

              <p>
                Players at or above this score can claim a weapon.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-title">
                <span>LAST SETTINGS UPDATE</span>
              </div>

              <strong>
                {formatDateTime(settings.updatedAt)}
              </strong>

              <p>
                Changed by{" "}
                {settings.updatedBy || "Not recorded"}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === "players" && (
        <div className="admin-content-card">
          <div className="content-card-header">
            <div>
              <h2>Player Management</h2>
              <p>
                Manage player profiles without deleting historical
                records.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={onAddPlayer}
            >
              + ADD PLAYER
            </button>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>IGN</th>
                  <th>Class</th>
                  <th>Weapon</th>
                  <th>Score</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {players
                  .slice()
                  .sort((a, b) =>
                    a.ign.localeCompare(b.ign)
                  )
                  .map((player) => {
                    const score = getPlayerScore(
                      player,
                      histories,
                      ledger
                    );

                    return (
                      <tr key={player.id}>
                        <td>
                          <button
                            className="ign-button"
                            onClick={() =>
                              onHistory(player)
                            }
                          >
                            {player.ign}
                          </button>
                        </td>

                        <td>{player.class || "—"}</td>
                        <td>
                          {player.preferredWeapon || "—"}
                        </td>

                        <td>
                          <strong>
                            {formatScore(score)}
                          </strong>
                        </td>

                        <td>
                          {formatDateTime(
                            player.updatedAt
                          )}
                        </td>

                        <td>
                          <div className="row-actions">
                            <button
                              className="small-button"
                              onClick={() =>
                                onEditPlayer(player)
                              }
                            >
                              EDIT
                            </button>

                            <button
                              className="small-button"
                              onClick={() =>
                                onHistory(player)
                              }
                            >
                              HISTORY
                            </button>

                            <button
                              className="small-button purge-button"
                              onClick={() =>
                                onPurgePlayer(player)
                              }
                            >
                              NEW USER / PURGE
                            </button>

                            <button
                              className="small-button delete-button"
                              onClick={() =>
                                onDeletePlayer(player)
                              }
                            >
                              DELETE
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "ledger" && (
        <div className="admin-content-card">
          <div className="content-card-header">
            <div>
              <h2>Score Ledger</h2>
              <p>
                Every weapon claim and manual score adjustment is
                recorded here.
              </p>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>IGN</th>
                  <th>Type</th>
                  <th>Delta</th>
                  <th>Old</th>
                  <th>New</th>
                  <th>Weapon</th>
                  <th>Reason</th>
                  <th>Admin</th>
                </tr>
              </thead>

              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-cell">
                      No ledger records.
                    </td>
                  </tr>
                ) : (
                  ledger
                    .slice()
                    .sort((a, b) => {
                      const ad =
                        timestampToDate(
                          a.createdAt
                        )?.getTime() || 0;
                      const bd =
                        timestampToDate(
                          b.createdAt
                        )?.getTime() || 0;

                      return bd - ad;
                    })
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          {formatDateTime(
                            item.createdAt
                          )}
                        </td>

                        <td>{item.ign || "—"}</td>

                        <td>
                          <span className="ledger-type">
                            {item.type || "LEDGER"}
                          </span>
                        </td>

                        <td
                          className={
                            Number(item.delta) >= 0
                              ? "positive-value"
                              : "negative-value"
                          }
                        >
                          {Number(item.delta) >= 0
                            ? "+"
                            : ""}
                          {formatScore(item.delta)}
                        </td>

                        <td>
                          {formatScore(item.oldScore)}
                        </td>

                        <td>
                          {formatScore(item.newScore)}
                        </td>

                        <td>{item.weapon || "—"}</td>
                        <td>{item.reason || "—"}</td>
                        <td>{item.admin || "—"}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <SettingsPanel
          settings={settings}
          user={user}
          onSave={onSaveSettings}
        />
      )}

      {tab === "history" && (
        <SettingsHistoryPanel
          settingsHistory={settingsHistory}
        />
      )}

      {tab === "backup" && (
        <BackupPanel
          players={players}
          histories={histories}
          ledger={ledger}
          settings={settings}
          settingsHistory={settingsHistory}
          onExport={onExport}
          onImport={onImport}
        />
      )}
    </section>
  );
}

/* =========================================================
   SETTINGS
========================================================= */

function SettingsPanel({ settings, user, onSave }) {
  const [form, setForm] = useState({
    sonyaPoints: settings.sonyaPoints,
    geomancerPoints: settings.geomancerPoints,
    reflectorPoints: settings.reflectorPoints,
    giantHawkPoints: settings.giantHawkPoints,
    eligibilityScore: settings.eligibilityScore,
  });

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm({
      sonyaPoints: settings.sonyaPoints,
      geomancerPoints: settings.geomancerPoints,
      reflectorPoints: settings.reflectorPoints,
      giantHawkPoints: settings.giantHawkPoints,
      eligibilityScore: settings.eligibilityScore,
    });
  }, [settings]);

  function update(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function save() {
    setBusy(true);
    setMessage("");

    try {
      await onSave({
        sonyaPoints: Number(form.sonyaPoints),
        geomancerPoints: Number(form.geomancerPoints),
        reflectorPoints: Number(form.reflectorPoints),
        giantHawkPoints: Number(form.giantHawkPoints),
        eligibilityScore: Number(form.eligibilityScore),
      });

      setMessage("Settings saved successfully.");
    } catch (err) {
      setMessage(err?.message || "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-layout">
      <div className="settings-card">
        <div className="content-card-header">
          <div>
            <h2>Scoring Settings</h2>
            <p>
              These values affect new attendance records only.
              Existing attendance keeps the points awarded when it
              was saved.
            </p>
          </div>
        </div>

        <div className="settings-grid">
          {BOSSES.map((boss) => (
            <label key={boss.id}>
              {boss.name} Points
              <input
                type="number"
                min="0"
                step="0.1"
                value={form[boss.pointsKey]}
                onChange={(event) =>
                  update(
                    boss.pointsKey,
                    event.target.value
                  )
                }
              />
            </label>
          ))}

          <label>
            Eligibility Score
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.eligibilityScore}
              onChange={(event) =>
                update(
                  "eligibilityScore",
                  event.target.value
                )
              }
            />
          </label>
        </div>

        {message && (
          <div
            className={
              message.includes("successfully")
                ? "success-box"
                : "error-box"
            }
          >
            {message}
          </div>
        )}

        <div className="settings-footer">
          <div>
            <span>Last updated</span>
            <strong>
              {formatDateTime(settings.updatedAt)}
            </strong>
          </div>

          <div>
            <span>Changed by</span>
            <strong>
              {settings.updatedBy ||
                user?.email ||
                "—"}
            </strong>
          </div>

          <button
            className="primary-button"
            onClick={save}
            disabled={busy}
          >
            {busy ? "SAVING..." : "SAVE SETTINGS"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SETTINGS HISTORY
========================================================= */

function SettingsHistoryPanel({ settingsHistory }) {
  return (
    <div className="admin-content-card">
      <div className="content-card-header">
        <div>
          <h2>Settings History</h2>
          <p>
            Audit trail of every scoring setting change.
          </p>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Setting</th>
              <th>Old Value</th>
              <th>New Value</th>
              <th>Changed By</th>
            </tr>
          </thead>

          <tbody>
            {settingsHistory.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-cell">
                  No settings history.
                </td>
              </tr>
            ) : (
              settingsHistory
                .slice()
                .sort((a, b) => {
                  const ad =
                    timestampToDate(
                      a.changedAt
                    )?.getTime() || 0;

                  const bd =
                    timestampToDate(
                      b.changedAt
                    )?.getTime() || 0;

                  return bd - ad;
                })
                .map((item) => (
                  <tr key={item.id}>
                    <td>
                      {formatDateTime(item.changedAt)}
                    </td>

                    <td>
                      <span className="ledger-type">
                        {item.setting}
                      </span>
                    </td>

                    <td>{safeRow(item.oldValue)}</td>
                    <td>{safeRow(item.newValue)}</td>
                    <td>{item.changedBy || "—"}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================
   BACKUP / RESTORE
========================================================= */

function BackupPanel({
  players,
  histories,
  ledger,
  settings,
  settingsHistory,
  onExport,
  onImport,
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function exportBackup() {
    setBusy(true);
    setMessage("");

    try {
      await onExport();
      setMessage("Full backup created successfully.");
    } catch (err) {
      setMessage(err?.message || "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setBusy(true);
    setMessage("");

    try {
      await onImport(file);

      setMessage(
        "Backup restored. Existing matching records were updated."
      );
    } catch (err) {
      console.error(err);
      setMessage(
        err?.message || "Unable to restore backup."
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="backup-layout">
      <div className="backup-card">
        <div className="backup-icon">⇩</div>

        <h2>Full Backup</h2>

        <p>
          Creates a complete Excel backup containing players,
          attendance history, score ledger, scoring settings,
          settings history, raid schedule, and backup information.
        </p>

        <div className="backup-counts">
          <span>{players.length} Players</span>
          <span>{histories.length} Attendance</span>
          <span>{ledger.length} Ledger</span>
          <span>{settingsHistory.length} Setting History</span>
        </div>

        <button
          className="primary-button"
          onClick={exportBackup}
          disabled={busy}
        >
          {busy ? "CREATING..." : "EXPORT FULL XLSX BACKUP"}
        </button>
      </div>

      <div className="backup-card">
        <div className="backup-icon">⇧</div>

        <h2>Restore Backup</h2>

        <p>
          Restores records from a previous full backup. Existing
          records with matching IDs are updated. New records are
          added.
        </p>

        <label className="file-upload">
          <span>
            {busy ? "PROCESSING..." : "SELECT XLSX BACKUP"}
          </span>

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={importBackup}
            disabled={busy}
          />
        </label>
      </div>

      {message && (
        <div className="backup-message">
          {message}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [page, setPage] = useState("raid");

  const [timezone, setTimezone] =
    useState(getStoredTimezone());

  function handleTimezoneChange(value) {
    setTimezone(value);
    saveTimezonePreference(value);
  }

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showLogin, setShowLogin] = useState(false);

  const [raids, setRaids] = useState(
    BOSSES.map(getDefaultRaid)
  );

  const [players, setPlayers] = useState([]);
  const [histories, setHistories] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [settings, setSettings] = useState(
    DEFAULT_SETTINGS
  );
  const [settingsHistory, setSettingsHistory] =
    useState([]);

  const [raidEditor, setRaidEditor] = useState(null);
  const [playerEditor, setPlayerEditor] = useState(null);
  const [historyPlayer, setHistoryPlayer] = useState(null);
  const [claimPlayer, setClaimPlayer] = useState(null);
  const [overridePlayer, setOverridePlayer] =
    useState(null);

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        try {
          setUser(firebaseUser);

          if (!firebaseUser) {
            setIsAdmin(false);
            setAuthLoading(false);
            return;
          }

          const adminSnap = await getDoc(
            doc(db, "admins", firebaseUser.uid)
          );

          setIsAdmin(
            adminSnap.exists() &&
            adminSnap.data()?.active === true
          );
        } catch (error) {
          console.error(error);
          setIsAdmin(false);
        } finally {
          setAuthLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     RAID LISTENER
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "raidSchedule"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setRaids(BOSSES.map(getDefaultRaid));
          return;
        }

        const data = snapshot.data();

        const loaded = BOSSES.map((boss) => {
          const raid = Array.isArray(data.raids)
            ? data.raids.find(
              (item) => item.id === boss.id
            )
            : null;

          return sanitizeRaid(raid, boss);
        });

        setRaids(loaded);
      },
      (error) => {
        console.error(
          "Raid schedule listener:",
          error
        );
        setRaids(BOSSES.map(getDefaultRaid));
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     PLAYERS
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "attendancePlayers"),
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setPlayers(rows);
      },
      (error) => {
        console.error(
          "Player listener:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     ATTENDANCE HISTORY
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "attendanceHistory"),
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setHistories(rows);
      },
      (error) => {
        console.error(
          "Attendance listener:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     SCORE LEDGER
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "scoreLedger"),
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setLedger(rows);
      },
      (error) => {
        console.error(
          "Ledger listener:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     SETTINGS
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "attendance"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSettings(DEFAULT_SETTINGS);
          return;
        }

        setSettings({
          ...DEFAULT_SETTINGS,
          ...snapshot.data(),
        });
      },
      (error) => {
        console.error(
          "Settings listener:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     SETTINGS HISTORY
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "settingsHistory"),
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setSettingsHistory(rows);
      },
      (error) => {
        console.error(
          "Settings history listener:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     PLAYER OPERATIONS
  ======================================================= */

  async function deletePlayerProfile(player) {
    if (!isAdmin) {
      throw new Error("Administrator access required.");
    }

    await deleteDoc(
      doc(db, "attendancePlayers", player.id)
    );
  }

  /*
   * COMPLETE IGN PURGE
   *
   * This is intentionally different from DELETE.
   *
   * DELETE:
   *   Removes profile only.
   *
   * PURGE:
   *   Removes profile + ALL attendance + ALL ledger records.
   *
   * Therefore, when the IGN is added again, its calculated
   * score is zero.
   */
  async function completelyPurgeIgn(player) {
    if (!isAdmin) {
      throw new Error(
        "Administrator access is required."
      );
    }

    if (!player?.id || !player?.ign) {
      throw new Error("Invalid player.");
    }

    const ign = String(player.ign).trim();

    const typed = window.prompt(
      `PERMANENTLY PURGE "${ign}"?\n\n` +
      `This removes ALL information connected to this IGN:\n\n` +
      `• Player profile\n` +
      `• Attendance history\n` +
      `• Weapon claims\n` +
      `• Score deductions\n` +
      `• Manual score overrides\n\n` +
      `This cannot be undone.\n\n` +
      `Type the IGN exactly to continue:`
    );

    if (typed === null) {
      return;
    }

    if (normalizeIgn(typed) !== normalizeIgn(ign)) {
      window.alert(
        "The IGN did not match exactly.\n\nNothing was deleted."
      );

      return;
    }

    const finalConfirm = window.confirm(
      `FINAL CONFIRMATION\n\n` +
      `Completely delete "${ign}" and make it a clean NEW USER?\n\n` +
      `After this operation, adding "${ign}" again will start at 0 points.`
    );

    if (!finalConfirm) {
      return;
    }

    try {
      const attendanceSnapshot = await getDocs(
        collection(db, "attendanceHistory")
      );

      const ledgerSnapshot = await getDocs(
        collection(db, "scoreLedger")
      );

      /*
       * Match by playerId FIRST.
       *
       * IGN fallback is included for older records that may not
       * contain playerId.
       */
      const attendanceRefs =
        attendanceSnapshot.docs
          .filter((snap) => {
            const data = snap.data();

            return (
              data.playerId === player.id ||
              (
                !data.playerId &&
                normalizeIgn(data.ign) ===
                normalizeIgn(ign)
              )
            );
          })
          .map((snap) => snap.ref);

      const ledgerRefs =
        ledgerSnapshot.docs
          .filter((snap) => {
            const data = snap.data();

            return (
              data.playerId === player.id ||
              (
                !data.playerId &&
                normalizeIgn(data.ign) ===
                normalizeIgn(ign)
              )
            );
          })
          .map((snap) => snap.ref);

      const allRefs = [
        ...attendanceRefs,
        ...ledgerRefs,
        doc(
          db,
          "attendancePlayers",
          player.id
        ),
      ];

      /*
       * Firestore batch limit is 500.
       * Keep batches below that limit.
       */
      for (
        let start = 0;
        start < allRefs.length;
        start += 450
      ) {
        const batch = writeBatch(db);

        allRefs
          .slice(start, start + 450)
          .forEach((ref) => batch.delete(ref));

        await batch.commit();
      }

      /*
       * Immediately clean local state too.
       * Firestore listeners will also synchronize afterwards.
       */
      setPlayers((current) =>
        current.filter(
          (item) => item.id !== player.id
        )
      );

      setHistories((current) =>
        current.filter(
          (item) =>
            item.playerId !== player.id &&
            normalizeIgn(item.ign) !==
            normalizeIgn(ign)
        )
      );

      setLedger((current) =>
        current.filter(
          (item) =>
            item.playerId !== player.id &&
            normalizeIgn(item.ign) !==
            normalizeIgn(ign)
        )
      );

      if (historyPlayer?.id === player.id) {
        setHistoryPlayer(null);
      }

      if (claimPlayer?.id === player.id) {
        setClaimPlayer(null);
      }

      if (overridePlayer?.id === player.id) {
        setOverridePlayer(null);
      }

      window.alert(
        `"${ign}" was completely purged.\n\n` +
        `All profile, attendance, claim, and score information was removed.\n\n` +
        `If you add this IGN again, it starts at 0 points.`
      );
    } catch (error) {
      console.error(
        "COMPLETE IGN PURGE FAILED:",
        error
      );

      window.alert(
        `Unable to completely purge "${ign}".\n\n` +
        `${error?.message || error}`
      );
    }
  }

  /* =======================================================
     SETTINGS SAVE
  ======================================================= */

  async function saveSettings(nextSettings) {
    if (!isAdmin) {
      throw new Error(
        "Administrator access required."
      );
    }

    const adminName =
      auth.currentUser?.email ||
      auth.currentUser?.uid ||
      "Admin";

    const settingsRef = doc(
      db,
      "settings",
      "attendance"
    );

    const currentSnap = await getDoc(settingsRef);

    const current = currentSnap.exists()
      ? {
        ...DEFAULT_SETTINGS,
        ...currentSnap.data(),
      }
      : DEFAULT_SETTINGS;

    const batch = writeBatch(db);

    batch.set(
      settingsRef,
      {
        ...nextSettings,
        updatedAt: serverTimestamp(),
        updatedBy: adminName,
      },
      { merge: true }
    );

    const settingKeys = [
      "sonyaPoints",
      "geomancerPoints",
      "reflectorPoints",
      "giantHawkPoints",
      "eligibilityScore",
    ];

    for (const key of settingKeys) {
      const oldValue = Number(current[key]);
      const newValue = Number(nextSettings[key]);

      if (oldValue !== newValue) {
        const historyRef = doc(
          collection(db, "settingsHistory")
        );

        batch.set(historyRef, {
          setting: key,
          oldValue,
          newValue,
          changedBy: adminName,
          changedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  }

  /* =======================================================
     XLSX EXPORT
  ======================================================= */

  async function exportFullBackup() {
    const raidSchedule = raids.map((raid) => ({
      id: raid.id,
      name: raid.name,
      type: raid.type,
      frequency: raid.frequency,
      day:
        raid.day === null
          ? ""
          : raid.day,
      hour: raid.hour,
      minute: raid.minute,
      time12: formatTime12(
        raid.hour,
        raid.minute
      ),
      image: raid.image || "",
      updatedAt: safeRow(raid.updatedAt),
      updatedBy: raid.updatedBy || "",
    }));

    const playersSheet = players.map((item) => ({
      id: item.id,
      ign: item.ign || "",
      class: item.class || "",
      preferredWeapon:
        item.preferredWeapon || "",
      createdAt: safeRow(item.createdAt),
      updatedAt: safeRow(item.updatedAt),
      createdBy: item.createdBy || "",
      updatedBy: item.updatedBy || "",
    }));

    const historySheet = histories.map((item) => ({
      id: item.id,
      playerId: item.playerId || "",
      ign: item.ign || "",
      bossId: item.bossId || "",
      bossName: item.bossName || "",
      points: Number(item.points || 0),
      attendanceDate:
        item.attendanceDate || "",
      createdAt: safeRow(item.createdAt),
      createdBy: item.createdBy || "",
    }));

    const ledgerSheet = ledger.map((item) => ({
      id: item.id,
      playerId: item.playerId || "",
      ign: item.ign || "",
      type: item.type || "",
      delta: Number(item.delta || 0),
      oldScore: Number(item.oldScore || 0),
      newScore: Number(item.newScore || 0),
      weapon: item.weapon || "",
      reason: item.reason || "",
      admin: item.admin || "",
      createdAt: safeRow(item.createdAt),
    }));

    const settingsSheet = [
      {
        id: "attendance",
        sonyaPoints: Number(
          settings.sonyaPoints
        ),
        geomancerPoints: Number(
          settings.geomancerPoints
        ),
        reflectorPoints: Number(
          settings.reflectorPoints
        ),
        giantHawkPoints: Number(
          settings.giantHawkPoints
        ),
        eligibilityScore: Number(
          settings.eligibilityScore
        ),
        updatedAt: safeRow(settings.updatedAt),
        updatedBy: settings.updatedBy || "",
      },
    ];

    const settingsHistorySheet =
      settingsHistory.map((item) => ({
        id: item.id,
        setting: item.setting || "",
        oldValue: safeRow(item.oldValue),
        newValue: safeRow(item.newValue),
        changedBy: item.changedBy || "",
        changedAt: safeRow(item.changedAt),
      }));

    const backupInfo = [
      {
        exportedAt: new Date().toISOString(),
        application:
          "RAN Online EP7 BH Attendance",
        version: "2.0",
        players: players.length,
        attendanceHistory:
          histories.length,
        scoreLedger: ledger.length,
        settingsHistory:
          settingsHistory.length,
        raidSchedule: raids.length,
        restoreMode: "MERGE / UPSERT",
      },
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(playersSheet),
      "Players"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(historySheet),
      "Attendance History"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(ledgerSheet),
      "Score Ledger"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(settingsSheet),
      "Scoring Settings"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        settingsHistorySheet
      ),
      "Settings History"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(raidSchedule),
      "Raid Schedule"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(backupInfo),
      "Backup Info"
    );

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    XLSX.writeFile(
      workbook,
      `RAN-EP7-FULL-BACKUP-${stamp}.xlsx`
    );
  }

  /* =======================================================
     XLSX IMPORT
  ======================================================= */

  async function importFullBackup(file) {
    if (!isAdmin) {
      throw new Error(
        "Administrator access required."
      );
    }

    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
    });

    function readSheet(name) {
      const sheet = workbook.Sheets[name];

      if (!sheet) return [];

      return XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });
    }

    const playersRows = readSheet("Players");
    const historyRows =
      readSheet("Attendance History");
    const ledgerRows =
      readSheet("Score Ledger");
    const settingsRows =
      readSheet("Scoring Settings");
    const settingsHistoryRows =
      readSheet("Settings History");
    const raidRows =
      readSheet("Raid Schedule");

    /*
     * Restore in chunks to respect Firestore batch limits.
     */
    const operations = [];

    playersRows.forEach((row) => {
      if (!row.id) return;

      operations.push({
        ref: doc(
          db,
          "attendancePlayers",
          String(row.id)
        ),
        data: {
          ign: String(row.ign || ""),
          class: String(row.class || ""),
          preferredWeapon: String(
            row.preferredWeapon || ""
          ),
          createdAt:
            excelDateToJS(row.createdAt)
              ?.toISOString() ||
            row.createdAt ||
            null,
          updatedAt:
            excelDateToJS(row.updatedAt)
              ?.toISOString() ||
            row.updatedAt ||
            null,
          createdBy:
            String(row.createdBy || ""),
          updatedBy:
            String(row.updatedBy || ""),
        },
      });
    });

    historyRows.forEach((row) => {
      if (!row.id) return;

      operations.push({
        ref: doc(
          db,
          "attendanceHistory",
          String(row.id)
        ),
        data: {
          playerId:
            String(row.playerId || ""),
          ign: String(row.ign || ""),
          bossId: String(row.bossId || ""),
          bossName: String(
            row.bossName || ""
          ),
          points: Number(row.points || 0),
          attendanceDate:
            String(row.attendanceDate || ""),
          createdAt:
            excelDateToJS(row.createdAt)
              ?.toISOString() ||
            row.createdAt ||
            null,
          createdBy:
            String(row.createdBy || ""),
        },
      });
    });

    ledgerRows.forEach((row) => {
      if (!row.id) return;

      operations.push({
        ref: doc(
          db,
          "scoreLedger",
          String(row.id)
        ),
        data: {
          playerId:
            String(row.playerId || ""),
          ign: String(row.ign || ""),
          type: String(row.type || ""),
          delta: Number(row.delta || 0),
          oldScore: Number(
            row.oldScore || 0
          ),
          newScore: Number(
            row.newScore || 0
          ),
          weapon: String(
            row.weapon || ""
          ),
          reason: String(
            row.reason || ""
          ),
          admin: String(
            row.admin || ""
          ),
          createdAt:
            excelDateToJS(row.createdAt)
              ?.toISOString() ||
            row.createdAt ||
            null,
        },
      });
    });

    settingsHistoryRows.forEach((row) => {
      if (!row.id) return;

      operations.push({
        ref: doc(
          db,
          "settingsHistory",
          String(row.id)
        ),
        data: {
          setting: String(
            row.setting || ""
          ),
          oldValue: row.oldValue,
          newValue: row.newValue,
          changedBy: String(
            row.changedBy || ""
          ),
          changedAt:
            excelDateToJS(row.changedAt)
              ?.toISOString() ||
            row.changedAt ||
            null,
        },
      });
    });

    for (
      let start = 0;
      start < operations.length;
      start += 450
    ) {
      const batch = writeBatch(db);

      operations
        .slice(start, start + 450)
        .forEach((operation) => {
          batch.set(
            operation.ref,
            operation.data,
            { merge: true }
          );
        });

      await batch.commit();
    }

    if (settingsRows.length > 0) {
      const row = settingsRows[0];

      await setDoc(
        doc(db, "settings", "attendance"),
        {
          sonyaPoints: Number(
            row.sonyaPoints || 0
          ),
          geomancerPoints: Number(
            row.geomancerPoints || 0
          ),
          reflectorPoints: Number(
            row.reflectorPoints || 0
          ),
          giantHawkPoints: Number(
            row.giantHawkPoints || 0
          ),
          eligibilityScore: Number(
            row.eligibilityScore || 0
          ),
          updatedAt:
            excelDateToJS(row.updatedAt)
              ?.toISOString() ||
            row.updatedAt ||
            null,
          updatedBy:
            String(row.updatedBy || ""),
        },
        { merge: true }
      );
    }

    if (raidRows.length > 0) {
      const importedRaids =
        BOSSES.map((boss) => {
          const row = raidRows.find(
            (item) =>
              String(item.id) ===
              String(boss.id)
          );

          if (!row) {
            return getDefaultRaid(boss);
          }

          return sanitizeRaid(
            {
              id: boss.id,
              name: row.name,
              type: row.type,
              frequency: row.frequency,
              day:
                row.day === ""
                  ? null
                  : Number(row.day),
              hour: Number(row.hour),
              minute: Number(row.minute),
              image: row.image || "",
              updatedAt:
                excelDateToJS(
                  row.updatedAt
                )?.toISOString() ||
                row.updatedAt ||
                null,
              updatedBy:
                row.updatedBy || "",
            },
            boss
          );
        });

      await setDoc(
        doc(db, "settings", "raidSchedule"),
        {
          raiders: importedRaids,
          raids: importedRaids,
          updatedAt: serverTimestamp(),
          updatedBy:
            auth.currentUser?.email ||
            auth.currentUser?.uid ||
            "Admin",
        },
        { merge: true }
      );
    }
  }

  /* =======================================================
     AUTH LOADING
  ======================================================= */

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">RAN</div>
        <div className="loading-bar">
          <span />
        </div>
        <p>LOADING DATABASE...</p>
      </div>
    );
  }

  /* =======================================================
     APP UI
  ======================================================= */

  return (
    <div className="app">
      <header className="main-header">
        <div className="brand">
          <div className="brand-mark">R</div>

          <div>
            <strong>RAN EP7</strong>
            <span>BH ATTENDANCE</span>
          </div>
        </div>

        <nav className="main-nav">
          <button
            className={
              page === "raid" ? "nav-active" : ""
            }
            onClick={() => setPage("raid")}
          >
            RAID SCHEDULE
          </button>

          <button
            className={
              page === "attendance"
                ? "nav-active"
                : ""
            }
            onClick={() => setPage("attendance")}
          >
            ATTENDANCE
          </button>

          {isAdmin && (
            <button
              className={
                page === "admin"
                  ? "nav-active"
                  : ""
              }
              onClick={() => setPage("admin")}
            >
              ADMIN
            </button>
          )}
        </nav>

        <div className="header-right">
          {isAdmin ? (
            <>
              <span className="admin-indicator">
                ADMIN ACCESS
              </span>

              <button
                className="logout-button"
                onClick={() => signOut(auth)}
              >
                LOG OUT
              </button>
            </>
          ) : (
            <button
              className="admin-login-button"
              onClick={() => setShowLogin(true)}
            >
              ADMIN LOGIN
            </button>
          )}
        </div>
      </header>

      <main>
        {page === "raid" && (
          <RaidPage
            raids={raids}
            timezone={timezone}
            onTimezoneChange={handleTimezoneChange}
            onEdit={setRaidEditor}
          />
        )}

        {page === "attendance" && (
          <AttendancePage
            players={players}
            histories={histories}
            ledger={ledger}
            settings={settings}
            isAdmin={isAdmin}
            onAddPlayer={() =>
              setPlayerEditor({ mode: "new" })
            }
            onEditPlayer={(player) =>
              setPlayerEditor(player)
            }
            onDeletePlayer={deletePlayerProfile}
            onPurgePlayer={completelyPurgeIgn}
            onHistory={setHistoryPlayer}
            onClaim={setClaimPlayer}
            onOverride={setOverridePlayer}
          />
        )}

        {page === "admin" && isAdmin && (
          <AdminPage
            players={players}
            histories={histories}
            ledger={ledger}
            settings={settings}
            settingsHistory={settingsHistory}
            user={user}
            onAddPlayer={() =>
              setPlayerEditor({ mode: "new" })
            }
            onEditPlayer={(player) =>
              setPlayerEditor(player)
            }
            onHistory={setHistoryPlayer}
            onClaim={setClaimPlayer}
            onOverride={setOverridePlayer}
            onPurgePlayer={completelyPurgeIgn}
            onDeletePlayer={deletePlayerProfile}
            onSaveSettings={saveSettings}
            onExport={exportFullBackup}
            onImport={importFullBackup}
          />
        )}
      </main>

      <footer className="main-footer">
        <div>
          <strong>RAN ONLINE EP7 BH ATTENDANCE</strong>
          <span>
            Attendance • Raid Schedule • Scoring
          </span>
        </div>

        <span>
          © {new Date().getFullYear()} BH Guild
        </span>
      </footer>

      {showLogin && (
        <AdminLogin
          onClose={() => setShowLogin(false)}
        />
      )}

      {raidEditor && (
        <RaidEditor
          raid={raidEditor}
          onClose={() => setRaidEditor(null)}
          onSaved={() => { }}
        />
      )}

      {playerEditor && (
        <PlayerFormModal
          player={
            playerEditor.mode === "new"
              ? null
              : playerEditor
          }
          onClose={() => setPlayerEditor(null)}
          onSaved={() => { }}
        />
      )}

      {historyPlayer && (
        <PlayerHistoryModal
          player={historyPlayer}
          histories={histories}
          ledger={ledger}
          score={getPlayerScore(
            historyPlayer,
            histories,
            ledger
          )}
          onClose={() => setHistoryPlayer(null)}
        />
      )}

      {claimPlayer && (
        <ClaimModal
          player={claimPlayer}
          currentScore={getPlayerScore(
            claimPlayer,
            histories,
            ledger
          )}
          eligibilityScore={Number(
            settings.eligibilityScore
          )}
          onClose={() => setClaimPlayer(null)}
        />
      )}

      {overridePlayer && (
        <OverrideModal
          player={overridePlayer}
          currentScore={getPlayerScore(
            overridePlayer,
            histories,
            ledger
          )}
          onClose={() =>
            setOverridePlayer(null)
          }
        />
      )}
    </div>
  );
}