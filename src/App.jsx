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

const GEOMANCER_INTERVAL_HOURS = 10;
const GEOMANCER_CYCLE_DAYS = 3;
const GEOMANCER_UPCOMING_COUNT = 8;

const ADMIN_UID = "S4dPP7gtceeqnQV2guLmorgikh23";

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
    frequency: "Every 10 Hours",
    day: null,
    intervalHours: GEOMANCER_INTERVAL_HOURS,
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

const WEAPON_OPTIONS = [];

/* =========================================================
   TIMEZONE HELPERS
========================================================= */

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

/* =========================================================
   DATE HELPERS
========================================================= */

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

    return Number.isNaN(d.getTime())
      ? null
      : d;
  }

  if (typeof value === "number") {
    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? null
      : d;
  }

  return null;
}

function formatRaidDateTime(
  value,
  timezone
) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

function formatRaidTime(
  value,
  timezone
) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

function formatRaidDateOnly(
  value,
  timezone
) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  ).format(date);
}

function formatDateTime(value) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

function formatDateOnly(value) {
  const date = timestampToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }
  ).format(date);
}

/* =========================================================
   SCORE HELPERS
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
  return roundScore(value)
    .toFixed(2)
    .replace(/\.00$/, "");
}

function formatTime12(
  hour24,
  minute
) {
  let h = Number(hour24);
  const m = Number(minute);

  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m)
  ) {
    return "—";
  }

  h = ((h % 24) + 24) % 24;

  const period =
    h >= 12 ? "PM" : "AM";

  let h12 = h % 12;

  if (h12 === 0) {
    h12 = 12;
  }

  return `${h12}:${String(
    m
  ).padStart(2, "0")} ${period}`;
}

function normalize12HourTo24(
  hour12,
  minute,
  period
) {
  let h = parseInt(
    hour12,
    10
  );

  const m = parseInt(
    minute,
    10
  );

  if (
    !Number.isFinite(h) ||
    h < 1 ||
    h > 12
  ) {
    throw new Error(
      "Hour must be between 1 and 12."
    );
  }

  if (
    !Number.isFinite(m) ||
    m < 0 ||
    m > 59
  ) {
    throw new Error(
      "Minute must be between 0 and 59."
    );
  }

  h = h % 12;

  if (
    String(period).toUpperCase() ===
    "PM"
  ) {
    h += 12;
  }

  return {
    hour: h,
    minute: m,
  };
}

function from24Hour(hour24) {
  const h =
    Number(hour24) || 0;

  return {
    hour: String(
      h % 12 || 12
    ),
    period:
      h >= 12 ? "PM" : "AM",
  };
}

/* =========================================================
   PHILIPPINES DATE HELPERS
========================================================= */

function getPhilippinesDateParts(
  date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(date);

  const result = {};

  parts.forEach((part) => {
    if (
      part.type !== "literal"
    ) {
      result[part.type] =
        part.value;
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
  const p =
    getPhilippinesDateParts();

  return `${p.year}-${String(
    p.month
  ).padStart(2, "0")}-${String(
    p.day
  ).padStart(2, "0")}`;
}

/*
 * Philippines is UTC+8 year-round.
 */
function philippinesDateToUTC(
  year,
  month,
  day,
  hour,
  minute
) {
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute
    ) -
    8 *
    60 *
    60 *
    1000
  );
}

function parsePhilippinesDateString(
  value
) {
  const match = String(
    value || ""
  ).match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getPhilippinesDateString(
  date
) {
  const parts =
    getPhilippinesDateParts(date);

  return `${parts.year}-${String(
    parts.month
  ).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

/* =========================================================
   GEOMANCER CYCLE
========================================================= */

function getGeomancerAnchorDateTime(
  raid
) {
  if (!raid) return null;

  const parsed =
    parsePhilippinesDateString(
      raid.anchorDate
    );

  if (!parsed) {
    const today =
      getPhilippinesDateParts();

    return philippinesDateToUTC(
      today.year,
      today.month,
      today.day,
      Number(raid.hour || 0),
      Number(raid.minute || 0)
    );
  }

  return philippinesDateToUTC(
    parsed.year,
    parsed.month,
    parsed.day,
    Number(raid.hour || 0),
    Number(raid.minute || 0)
  );
}

function getNextGeomancerOccurrence(
  raid
) {
  const anchor =
    getGeomancerAnchorDateTime(
      raid
    );

  if (!anchor) return null;

  const interval =
    Number(raid?.intervalHours) >
      0
      ? Number(
        raid.intervalHours
      )
      : GEOMANCER_INTERVAL_HOURS;

  const intervalMs =
    interval *
    60 *
    60 *
    1000;

  const now = Date.now();

  const anchorMs =
    anchor.getTime();

  if (anchorMs > now) {
    return anchor;
  }

  const elapsed =
    now - anchorMs;

  const intervalsPassed =
    Math.floor(
      elapsed / intervalMs
    ) + 1;

  return new Date(
    anchorMs +
    intervalsPassed *
    intervalMs
  );
}

function getGeomancerCycleOccurrences(
  raid,
  days = GEOMANCER_CYCLE_DAYS
) {
  const anchor =
    getGeomancerAnchorDateTime(
      raid
    );

  if (!anchor) return [];

  const interval =
    Number(raid?.intervalHours) >
      0
      ? Number(
        raid.intervalHours
      )
      : GEOMANCER_INTERVAL_HOURS;

  const intervalMs =
    interval *
    60 *
    60 *
    1000;

  const spanMs =
    Number(days) *
    24 *
    60 *
    60 *
    1000;

  const occurrences = [];

  for (
    let time = anchor.getTime();
    time <
    anchor.getTime() +
    spanMs;
    time += intervalMs
  ) {
    occurrences.push(
      new Date(time)
    );
  }

  return occurrences;
}

/*
 * PUBLIC SCHEDULE:
 *
 * Always starts from the NEXT actual
 * Geomancer occurrence and then shows
 * eight future occurrences.
 *
 * 8 occurrences =
 * 0, 10, 20, 30, 40, 50, 60, 70 hours
 *
 * This covers the next 72 hours.
 */
function getUpcomingGeomancerOccurrences(
  raid,
  count = GEOMANCER_UPCOMING_COUNT
) {
  const first =
    getNextGeomancerOccurrence(
      raid
    );

  if (!first) return [];

  const intervalMs =
    (
      Number(
        raid?.intervalHours
      ) ||
      GEOMANCER_INTERVAL_HOURS
    ) *
    60 *
    60 *
    1000;

  return Array.from(
    { length: count },
    (_, index) =>
      new Date(
        first.getTime() +
        index * intervalMs
      )
  );
}

function formatPhilippinesCycleOccurrence(
  date
) {
  if (!date) return "—";

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: PH_TIMEZONE,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

/* =========================================================
   RAID OCCURRENCE
========================================================= */

function getNextRaidOccurrence(
  raid
) {
  if (
    raid?.id === "geomancer" &&
    raid?.frequency ===
    "Every 10 Hours"
  ) {
    return getNextGeomancerOccurrence(
      raid
    );
  }

  const now = new Date();

  const today =
    getPhilippinesDateParts(now);

  const base = new Date(
    Date.UTC(
      today.year,
      today.month - 1,
      today.day
    )
  );

  for (
    let i = 0;
    i <= 14;
    i++
  ) {
    const candidate =
      new Date(base);

    candidate.setUTCDate(
      candidate.getUTCDate() +
      i
    );

    const year =
      candidate.getUTCFullYear();

    const month =
      candidate.getUTCMonth() +
      1;

    const day =
      candidate.getUTCDate();

    const weekday =
      candidate.getUTCDay();

    if (
      raid.day !== null &&
      raid.day !== undefined &&
      raid.day !== weekday
    ) {
      continue;
    }

    const occurrence =
      philippinesDateToUTC(
        year,
        month,
        day,
        Number(raid.hour || 0),
        Number(raid.minute || 0)
      );

    if (
      occurrence > now
    ) {
      return occurrence;
    }
  }

  return null;
}

/* =========================================================
   RAID STORAGE
========================================================= */

function getDefaultRaid(boss) {
  const isGeomancer =
    boss.id === "geomancer";

  return {
    id: boss.id,
    name: boss.name,
    type: boss.type,
    frequency:
      boss.frequency,
    day: boss.day,
    hour:
      boss.defaultHour,
    minute:
      boss.defaultMinute,
    image:
      boss.image || "",
    intervalHours:
      isGeomancer
        ? GEOMANCER_INTERVAL_HOURS
        : undefined,
    anchorDate:
      isGeomancer
        ? getTodayPhilippines()
        : undefined,
    updatedAt: null,
    updatedBy: "",
  };
}

function sanitizeRaid(
  raid,
  boss
) {
  const isGeomancer =
    boss.id === "geomancer";

  const frequency =
    raid?.frequency ||
    boss.frequency;

  let intervalHours;

  if (isGeomancer) {
    intervalHours =
      Number(
        raid?.intervalHours
      ) > 0
        ? Number(
          raid.intervalHours
        )
        : GEOMANCER_INTERVAL_HOURS;
  }

  let anchorDate;

  if (isGeomancer) {
    anchorDate =
      typeof raid?.anchorDate ===
        "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(
          raid.anchorDate
        )
        ? raid.anchorDate
        : getTodayPhilippines();
  }

  return {
    id: boss.id,

    name: boss.name,

    type: boss.type,

    frequency:
      isGeomancer
        ? "Every 10 Hours"
        : frequency,

    day:
      isGeomancer
        ? null
        : raid?.day === null ||
          raid?.day === undefined
          ? boss.day
          : Number(
            raid.day
          ),

    hour: Number.isFinite(
      Number(raid?.hour)
    )
      ? Number(raid.hour)
      : boss.defaultHour,

    minute:
      Number.isFinite(
        Number(raid?.minute)
      )
        ? Number(
          raid.minute
        )
        : boss.defaultMinute,

    intervalHours,

    anchorDate,

    image:
      raid?.image ||
      boss.image ||
      "",

    updatedAt:
      raid?.updatedAt ||
      null,

    updatedBy:
      raid?.updatedBy ||
      "",
  };
}

/* =========================================================
   XLSX HELPERS
========================================================= */

function safeRow(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  if (value?.toDate) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value ===
    "object"
  ) {
    return JSON.stringify(
      value
    );
  }

  return value;
}

function excelDateToJS(
  value
) {
  if (
    value instanceof Date
  ) {
    return value;
  }

  if (
    typeof value ===
    "number"
  ) {
    return new Date(
      Date.UTC(
        1899,
        11,
        30
      ) +
      value *
      24 *
      60 *
      60 *
      1000
    );
  }

  if (
    typeof value ===
    "string"
  ) {
    const d = new Date(
      value
    );

    if (
      !Number.isNaN(
        d.getTime()
      )
    ) {
      return d;
    }
  }

  return null;
}

/* =========================================================
   MODAL
========================================================= */

function Modal({
  title,
  children,
  onClose,
  wide = false,
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
    >
      <div
        className={`modal-card ${wide ? "modal-wide" : ""
          }`}
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="modal-header">
          <div>
            <div className="modal-kicker">
              ADMIN PANEL
            </div>

            <h2>{title}</h2>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN LOGIN
========================================================= */

function AdminLogin({
  onClose,
}) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  async function login(
    event
  ) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const credential =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

      const adminRef =
        doc(
          db,
          "admins",
          credential.user.uid
        );

      const adminSnap =
        await getDoc(
          adminRef
        );

      if (
        !adminSnap.exists() ||
        adminSnap.data()
          ?.active !== true
      ) {
        await signOut(auth);

        throw new Error(
          "This account is not an active administrator."
        );
      }

      onClose();
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to sign in. Check your credentials."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Administrator Login"
      onClose={onClose}
    >
      <form
        className="login-form"
        onSubmit={login}
      >
        <div className="login-icon">
          ⚡
        </div>

        <p className="modal-description">
          Administrator access is
          required for attendance,
          players, scoring, claims,
          settings, and backup
          operations.
        </p>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        <label>
          Email

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
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
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            placeholder="Password"
            autoComplete="current-password"
            required
          />
        </label>

        <button
          className="primary-button full-button"
          disabled={busy}
        >
          {busy
            ? "SIGNING IN..."
            : "SIGN IN"}
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
    getDisplayTimezone(
      timezone
    );

  const next =
    getNextRaidOccurrence(
      raid
    );

  const isGeomancer =
    raid.id === "geomancer" &&
    raid.frequency ===
    "Every 10 Hours";

  const upcomingGeomancer =
    isGeomancer
      ? getUpcomingGeomancerOccurrences(
        raid,
        GEOMANCER_UPCOMING_COUNT
      )
      : [];

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
              {raid.name.slice(
                0,
                1
              )}
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
            <h2>
              {raid.name}
            </h2>

            <p>
              {raid.frequency}
            </p>
          </div>

          <div className="raid-status">
            <span className="status-dot" />
            ACTIVE
          </div>
        </div>

        <div className="raid-time-box timezone-aware">
          <span>
            NEXT RAID
          </span>

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
                {getTimezoneLabel(
                  timezone
                )}
              </small>

              <div className="raid-ph-time">
                Philippines Time:{" "}
                {formatRaidDateTime(
                  next,
                  PH_TIMEZONE
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
            <span>
              Schedule
            </span>

            <strong>
              {isGeomancer
                ? `Every ${raid.intervalHours || GEOMANCER_INTERVAL_HOURS} Hours`
                : `${raid.frequency} — ${formatTime12(
                  raid.hour,
                  raid.minute
                )}`}
            </strong>
          </div>

          <div>
            <span>
              Last Updated
            </span>

            <strong>
              {raid.updatedAt
                ? formatDateTime(
                  raid.updatedAt
                )
                : "Default schedule"}
            </strong>
          </div>
        </div>

        {isGeomancer && (
          <>
            <details className="geomancer-cycle">
              <summary>
                <span className="geomancer-summary-text">
                  <span>
                    VIEW 3-DAY SCHEDULE
                  </span>

                  <strong>
                    2 raids per day
                  </strong>
                </span>
              </summary>

              <div className="geomancer-cycle-list">
                {upcomingGeomancer.map(
                  (
                    occurrence,
                    index
                  ) => (
                    <div
                      className={`geomancer-cycle-item ${index === 0
                        ? "next-spawn"
                        : ""
                        }`}
                      key={occurrence.toISOString()}
                    >
                      <span className="geomancer-cycle-number">
                        {index + 1}
                      </span>

                      <div className="geomancer-cycle-time">
                        <strong>
                          {formatRaidDateTime(
                            occurrence,
                            displayTimezone
                          )}
                        </strong>

                        <small>
                          Philippines:{" "}
                          {formatRaidDateTime(
                            occurrence,
                            PH_TIMEZONE
                          )}
                        </small>
                      </div>

                      {index ===
                        0 && (
                          <span className="geomancer-next-badge">
                            NEXT
                          </span>
                        )}
                    </div>
                  )
                )}
              </div>
            </details>

            <div className="geomancer-cycle-info">
              <span>
                CYCLE START — PHILIPPINES TIME
              </span>

              <strong>
                {raid.anchorDate
                  ? `${raid.anchorDate} ${formatTime12(
                    raid.hour,
                    raid.minute
                  )}`
                  : "—"}
              </strong>
            </div>
          </>
        )}

        <button
          className="outline-button"
          onClick={() =>
            onEdit(raid)
          }
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

function RaidEditor({
  raid,
  onClose,
  onSaved,
}) {
  const initial =
    from24Hour(
      raid.hour
    );

  const isGeomancer =
    raid.id ===
    "geomancer";

  const [hour, setHour] =
    useState(
      initial.hour
    );

  const [minute, setMinute] =
    useState(
      String(
        raid.minute ?? 0
      ).padStart(2, "0")
    );

  const [period, setPeriod] =
    useState(
      initial.period
    );

  const [frequency, setFrequency] =
    useState(
      isGeomancer
        ? "10hours"
        : raid.day === null
          ? "daily"
          : "weekly"
    );

  const [day, setDay] =
    useState(
      raid.day === null
        ? "0"
        : String(
          raid.day
        )
    );

  const [anchorDate, setAnchorDate] =
    useState(
      raid.anchorDate ||
      getTodayPhilippines()
    );

  const [cycleSelection, setCycleSelection] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const cyclePreviewRaid =
    useMemo(() => {
      try {
        const converted =
          normalize12HourTo24(
            hour,
            minute,
            period
          );

        return {
          ...raid,
          id: "geomancer",
          frequency:
            "Every 10 Hours",
          day: null,
          hour:
            converted.hour,
          minute:
            converted.minute,
          intervalHours:
            GEOMANCER_INTERVAL_HOURS,
          anchorDate,
        };
      } catch {
        return {
          ...raid,
          id: "geomancer",
          frequency:
            "Every 10 Hours",
          day: null,
          hour:
            Number(raid.hour) ||
            12,
          minute:
            Number(raid.minute) ||
            0,
          intervalHours:
            GEOMANCER_INTERVAL_HOURS,
          anchorDate,
        };
      }
    }, [
      raid,
      hour,
      minute,
      period,
      anchorDate,
    ]);

  const cycleOccurrences =
    useMemo(() => {
      if (!isGeomancer) {
        return [];
      }

      return getGeomancerCycleOccurrences(
        cyclePreviewRaid,
        GEOMANCER_CYCLE_DAYS
      );
    }, [
      isGeomancer,
      cyclePreviewRaid,
    ]);

  function selectCycleOccurrence(
    value
  ) {
    setCycleSelection(value);

    const selected =
      cycleOccurrences.find(
        (item) =>
          String(
            item.getTime()
          ) ===
          String(value)
      );

    if (!selected) {
      return;
    }

    const ph =
      getPhilippinesDateParts(
        selected
      );

    const selectedDate =
      `${ph.year}-${String(
        ph.month
      ).padStart(
        2,
        "0"
      )}-${String(
        ph.day
      ).padStart(
        2,
        "0"
      )}`;

    const selectedTime =
      from24Hour(
        ph.hour
      );

    setAnchorDate(
      selectedDate
    );

    setHour(
      selectedTime.hour
    );

    setMinute(
      String(
        ph.minute
      ).padStart(
        2,
        "0"
      )
    );

    setPeriod(
      selectedTime.period
    );
  }

  function handleHourChange(
    value
  ) {
    setHour(value);
    setCycleSelection("");
  }

  function handleMinuteChange(
    value
  ) {
    setMinute(value);
    setCycleSelection("");
  }

  function handlePeriodChange(
    value
  ) {
    setPeriod(value);
    setCycleSelection("");
  }

  function handleAnchorDateChange(
    value
  ) {
    setAnchorDate(value);
    setCycleSelection("");
  }

  async function save() {
    setBusy(true);
    setError("");

    try {
      const converted =
        normalize12HourTo24(
          hour,
          minute,
          period
        );

      let updatedRaid;

      if (
        isGeomancer
      ) {
        if (!anchorDate) {
          throw new Error(
            "Select a Geomancer cycle start date."
          );
        }

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(
            anchorDate
          )
        ) {
          throw new Error(
            "Invalid Geomancer cycle date."
          );
        }

        updatedRaid = {
          ...raid,
          frequency:
            "Every 10 Hours",
          day: null,
          hour:
            converted.hour,
          minute:
            converted.minute,
          intervalHours:
            GEOMANCER_INTERVAL_HOURS,
          anchorDate,
          updatedAt:
            new Date().toISOString(),
          updatedBy:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",
        };
      } else {
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];

        updatedRaid = {
          ...raid,

          frequency:
            frequency ===
              "daily"
              ? "Every Day"
              : `Every ${days[
              Number(day)
              ]
              }`,

          day:
            frequency ===
              "daily"
              ? null
              : Number(day),

          hour:
            converted.hour,

          minute:
            converted.minute,

          updatedAt:
            new Date().toISOString(),

          updatedBy:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",
        };
      }

      const currentRef =
        doc(
          db,
          "settings",
          "raidSchedule"
        );

      const currentSnap =
        await getDoc(
          currentRef
        );

      const currentData =
        currentSnap.exists()
          ? currentSnap.data()
          : {};

      const currentRaids =
        Array.isArray(
          currentData.raids
        )
          ? currentData.raids
          : BOSSES.map(
            getDefaultRaid
          );

      const nextRaids =
        BOSSES.map(
          (boss) => {
            if (
              boss.id ===
              raid.id
            ) {
              return sanitizeRaid(
                updatedRaid,
                boss
              );
            }

            const existing =
              currentRaids.find(
                (item) =>
                  item.id ===
                  boss.id
              );

            return sanitizeRaid(
              existing,
              boss
            );
          }
        );

      await setDoc(
        currentRef,
        {
          raids:
            nextRaids,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",
        },
        {
          merge: true,
        }
      );

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to save schedule."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Edit ${raid.name} Schedule`}
      onClose={onClose}
      wide={isGeomancer}
    >
      <div className="editor-grid">
        <div className="editor-preview">
          <span className="editor-preview-label">
            CURRENT TIME
          </span>

          <strong>
            {formatTime12(
              raid.hour,
              raid.minute
            )}
          </strong>

          <small>
            Philippines Time
          </small>
        </div>

        <div className="editor-section">
          {!isGeomancer && (
            <label>
              Frequency

              <select
                value={
                  frequency
                }
                onChange={(
                  event
                ) => {
                  setFrequency(
                    event.target
                      .value
                  );
                }}
              >
                <option value="daily">
                  Every Day
                </option>

                <option value="weekly">
                  Weekly
                </option>
              </select>
            </label>
          )}

          {isGeomancer && (
            <div className="geomancer-cycle-editor">
              <div className="geomancer-cycle-heading">
                <div>
                  <span>
                    GEOMANCER CYCLE
                  </span>

                  <strong>
                    10-HOUR RECURRING
                    SCHEDULE
                  </strong>
                </div>

                <div className="geomancer-cycle-badge">
                  3 DAYS
                </div>
              </div>

              <p className="geomancer-cycle-description">
                Choose the starting
                occurrence in
                Philippines Time.
                Geomancer will then
                respawn automatically
                every 10 hours.
              </p>

              <label>
                Cycle Start Date

                <input
                  type="date"
                  value={
                    anchorDate
                  }
                  onChange={(
                    event
                  ) =>
                    handleAnchorDateChange(
                      event.target
                        .value
                    )
                  }
                />
              </label>

              <div className="time-controls">
                <label>
                  Hour

                  <select
                    value={
                      hour
                    }
                    onChange={(
                      event
                    ) =>
                      handleHourChange(
                        event
                          .target
                          .value
                      )
                    }
                  >
                    {Array.from(
                      {
                        length: 12,
                      },
                      (
                        _,
                        index
                      ) => {
                        const value =
                          String(
                            index +
                            1
                          );

                        return (
                          <option
                            key={
                              value
                            }
                            value={
                              value
                            }
                          >
                            {
                              value
                            }
                          </option>
                        );
                      }
                    )}
                  </select>
                </label>

                <label>
                  Minute

                  <select
                    value={
                      minute
                    }
                    onChange={(
                      event
                    ) =>
                      handleMinuteChange(
                        event
                          .target
                          .value
                      )
                    }
                  >
                    {Array.from(
                      {
                        length: 60,
                      },
                      (
                        _,
                        index
                      ) => {
                        const value =
                          String(
                            index
                          ).padStart(
                            2,
                            "0"
                          );

                        return (
                          <option
                            key={
                              value
                            }
                            value={
                              value
                            }
                          >
                            {
                              value
                            }
                          </option>
                        );
                      }
                    )}
                  </select>
                </label>

                <label>
                  AM / PM

                  <select
                    value={
                      period
                    }
                    onChange={(
                      event
                    ) =>
                      handlePeriodChange(
                        event
                          .target
                          .value
                      )
                    }
                  >
                    <option value="AM">
                      AM
                    </option>

                    <option value="PM">
                      PM
                    </option>
                  </select>
                </label>
              </div>

              <label className="geomancer-occurrence-label">
                Select 3-Day Cycle
                Occurrence

                <select
                  value={
                    cycleSelection
                  }
                  onChange={(
                    event
                  ) =>
                    selectCycleOccurrence(
                      event
                        .target
                        .value
                    )
                  }
                >
                  <option value="">
                    Select cycle start...
                  </option>

                  {cycleOccurrences.map(
                    (
                      occurrence,
                      index
                    ) => (
                      <option
                        key={`${occurrence.getTime()}-${index}`}
                        value={String(
                          occurrence.getTime()
                        )}
                      >
                        {formatPhilippinesCycleOccurrence(
                          occurrence
                        )}
                      </option>
                    )
                  )}
                </select>
              </label>

              <div className="geomancer-cycle-list">
                <div className="geomancer-cycle-list-title">
                  3-DAY PREVIEW —
                  PHILIPPINES TIME
                </div>

                {cycleOccurrences.map(
                  (
                    occurrence,
                    index
                  ) => (
                    <div
                      className="geomancer-cycle-row"
                      key={`${occurrence.getTime()}-row-${index}`}
                    >
                      <span>
                        #{index + 1}
                      </span>

                      <strong>
                        {formatPhilippinesCycleOccurrence(
                          occurrence
                        )}
                      </strong>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {!isGeomancer &&
            frequency ===
            "weekly" && (
              <label>
                Day

                <select
                  value={
                    day
                  }
                  onChange={(
                    event
                  ) =>
                    setDay(
                      event
                        .target
                        .value
                    )
                  }
                >
                  <option value="0">
                    Sunday
                  </option>

                  <option value="1">
                    Monday
                  </option>

                  <option value="2">
                    Tuesday
                  </option>

                  <option value="3">
                    Wednesday
                  </option>

                  <option value="4">
                    Thursday
                  </option>

                  <option value="5">
                    Friday
                  </option>

                  <option value="6">
                    Saturday
                  </option>
                </select>
              </label>
            )}

          {!isGeomancer && (
            <div className="time-controls">
              <label>
                Hour

                <select
                  value={
                    hour
                  }
                  onChange={(
                    event
                  ) =>
                    setHour(
                      event
                        .target
                        .value
                    )
                  }
                >
                  {Array.from(
                    {
                      length: 12,
                    },
                    (
                      _,
                      index
                    ) => {
                      const value =
                        String(
                          index +
                          1
                        );

                      return (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {
                            value
                          }
                        </option>
                      );
                    }
                  )}
                </select>
              </label>

              <label>
                Minute

                <select
                  value={
                    minute
                  }
                  onChange={(
                    event
                  ) =>
                    setMinute(
                      event
                        .target
                        .value
                    )
                  }
                >
                  {Array.from(
                    {
                      length: 60,
                    },
                    (
                      _,
                      index
                    ) => {
                      const value =
                        String(
                          index
                        ).padStart(
                          2,
                          "0"
                        );

                      return (
                        <option
                          key={
                            value
                          }
                          value={
                            value
                          }
                        >
                          {
                            value
                          }
                        </option>
                      );
                    }
                  )}
                </select>
              </label>

              <label>
                AM / PM

                <select
                  value={
                    period
                  }
                  onChange={(
                    event
                  ) =>
                    setPeriod(
                      event
                        .target
                        .value
                    )
                  }
                >
                  <option value="AM">
                    AM
                  </option>

                  <option value="PM">
                    PM
                  </option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button
          className="secondary-button"
          onClick={onClose}
        >
          CANCEL
        </button>

        <button
          className="primary-button"
          onClick={save}
          disabled={busy}
        >
          {busy
            ? "SAVING..."
            : "SAVE SCHEDULE"}
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
  const [ign, setIgn] =
    useState(
      player?.ign || ""
    );

  const [playerClass, setPlayerClass] =
    useState(
      player?.class || ""
    );

  const [weapon, setWeapon] =
    useState(
      player?.preferredWeapon ||
      ""
    );

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const editing =
    Boolean(player);

  async function savePlayer(
    event
  ) {
    event.preventDefault();

    const cleanIgn =
      ign.trim();

    if (!cleanIgn) {
      setError(
        "IGN is required."
      );
      return;
    }

    if (!playerClass.trim()) {
      setError(
        "Class is required."
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const adminName =
        auth.currentUser
          ?.email ||
        auth.currentUser
          ?.uid ||
        "Admin";

      if (editing) {
        await setDoc(
          doc(
            db,
            "attendancePlayers",
            player.id
          ),
          {
            ign: cleanIgn,
            class:
              playerClass.trim(),
            preferredWeapon:
              weapon.trim(),
            updatedAt:
              serverTimestamp(),
            updatedBy:
              adminName,
          },
          {
            merge: true,
          }
        );
      } else {
        await addDoc(
          collection(
            db,
            "attendancePlayers"
          ),
          {
            ign: cleanIgn,
            class:
              playerClass.trim(),
            preferredWeapon:
              weapon.trim(),
            createdAt:
              serverTimestamp(),
            updatedAt:
              serverTimestamp(),
            createdBy:
              adminName,
            updatedBy:
              adminName,
          }
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to save player."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={
        editing
          ? `Edit ${player.ign}`
          : "Add New Player"
      }
      onClose={onClose}
    >
      <form
        className="player-form"
        onSubmit={savePlayer}
      >
        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        <label>
          IGN

          <input
            value={ign}
            onChange={(event) =>
              setIgn(
                event.target.value
              )
            }
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
            onChange={(event) =>
              setPlayerClass(
                event.target.value
              )
            }
            placeholder="Type any class"
            required
          />

          <datalist id="class-options">
            {CLASS_OPTIONS.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                />
              )
            )}
          </datalist>
        </label>

        <label>
          Preferred Weapon

          <input
            list="weapon-options"
            value={weapon}
            onChange={(event) =>
              setWeapon(
                event.target.value
              )
            }
            placeholder="Type or select weapon"
          />

          <datalist id="weapon-options">
            {WEAPON_OPTIONS.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                />
              )
            )}
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
   SCORE
========================================================= */

function getPlayerScore(
  player,
  histories,
  ledger
) {
  let total = 0;

  for (const record of histories) {
    const samePlayer =
      record.playerId ===
      player.id ||
      (!record.playerId &&
        normalizeIgn(
          record.ign
        ) ===
        normalizeIgn(
          player.ign
        ));

    if (samePlayer) {
      total += Number(
        record.points || 0
      );
    }
  }

  for (const record of ledger) {
    const samePlayer =
      record.playerId ===
      player.id ||
      (!record.playerId &&
        normalizeIgn(
          record.ign
        ) ===
        normalizeIgn(
          player.ign
        ));

    if (samePlayer) {
      total += Number(
        record.delta || 0
      );
    }
  }

  return roundScore(
    total
  );
}

/* =========================================================
   PLAYER HISTORY
========================================================= */

function PlayerHistoryModal({
  player,
  histories,
  ledger,
  score,
  onClose,
}) {
  if (!player) return null;

  const playerHistory =
    histories
      .filter(
        (item) =>
          item.playerId ===
          player.id ||
          (!item.playerId &&
            normalizeIgn(
              item.ign
            ) ===
            normalizeIgn(
              player.ign
            ))
      )
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
      });

  const playerLedger =
    ledger
      .filter(
        (item) =>
          item.playerId ===
          player.id ||
          (!item.playerId &&
            normalizeIgn(
              item.ign
            ) ===
            normalizeIgn(
              player.ign
            ))
      )
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
      });

  return (
    <Modal
      title={`${player.ign} — Full History`}
      onClose={onClose}
      wide
    >
      <div className="history-profile">
        <div>
          <span>
            IGN
          </span>

          <strong>
            {player.ign}
          </strong>
        </div>

        <div>
          <span>
            CLASS
          </span>

          <strong>
            {player.class ||
              "—"}
          </strong>
        </div>

        <div>
          <span>
            WEAPON
          </span>

          <strong>
            {player.preferredWeapon ||
              "—"}
          </strong>
        </div>

        <div>
          <span>
            CURRENT SCORE
          </span>

          <strong
            className={
              score >= 6
                ? "score-green"
                : ""
            }
          >
            {formatScore(
              score
            )}
          </strong>
        </div>
      </div>

      <div className="history-section">
        <div className="section-title-row">
          <h3>
            Attendance History
          </h3>

          <span>
            {
              playerHistory.length
            }{" "}
            records
          </span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  Date
                </th>

                <th>
                  Boss
                </th>

                <th>
                  Points
                </th>

                <th>
                  Saved By
                </th>
              </tr>
            </thead>

            <tbody>
              {playerHistory.length ===
                0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="empty-cell"
                  >
                    No attendance
                    history.
                  </td>
                </tr>
              ) : (
                playerHistory.map(
                  (item) => (
                    <tr
                      key={
                        item.id
                      }
                    >
                      <td>
                        {item.attendanceDate ||
                          formatDateOnly(
                            item.createdAt
                          )}
                      </td>

                      <td>
                        {item.bossName ||
                          item.bossId}
                      </td>

                      <td className="positive-value">
                        +
                        {formatScore(
                          item.points
                        )}
                      </td>

                      <td>
                        {item.createdBy ||
                          "—"}
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="history-section">
        <div className="section-title-row">
          <h3>
            Score Ledger
          </h3>

          <span>
            {
              playerLedger.length
            }{" "}
            records
          </span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  Date
                </th>

                <th>
                  Type
                </th>

                <th>
                  Delta
                </th>

                <th>
                  Old Score
                </th>

                <th>
                  New Score
                </th>

                <th>
                  Reason
                </th>
              </tr>
            </thead>

            <tbody>
              {playerLedger.length ===
                0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="empty-cell"
                  >
                    No score ledger
                    records.
                  </td>
                </tr>
              ) : (
                playerLedger.map(
                  (item) => (
                    <tr
                      key={
                        item.id
                      }
                    >
                      <td>
                        {formatDateTime(
                          item.createdAt
                        )}
                      </td>

                      <td>
                        <span className="ledger-type">
                          {item.type ||
                            "LEDGER"}
                        </span>
                      </td>

                      <td
                        className={
                          Number(
                            item.delta
                          ) >= 0
                            ? "positive-value"
                            : "negative-value"
                        }
                      >
                        {Number(
                          item.delta
                        ) >= 0
                          ? "+"
                          : ""}

                        {formatScore(
                          item.delta
                        )}
                      </td>

                      <td>
                        {formatScore(
                          item.oldScore
                        )}
                      </td>

                      <td>
                        {formatScore(
                          item.newScore
                        )}
                      </td>

                      <td>
                        {item.reason ||
                          "—"}
                      </td>
                    </tr>
                  )
                )
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
  const [weapon, setWeapon] =
    useState(
      player?.preferredWeapon ||
      ""
    );

  const [reason, setReason] =
    useState(
      "Weapon claim"
    );

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  if (!player) return null;

  const eligible =
    currentScore >=
    eligibilityScore;

  async function claim() {
    if (!eligible) {
      setError(
        "This player is not eligible."
      );

      return;
    }

    if (!weapon.trim()) {
      setError(
        "Enter the weapon being claimed."
      );

      return;
    }

    setBusy(true);
    setError("");

    try {
      const oldScore =
        roundScore(
          currentScore
        );

      const newScore =
        roundScore(
          currentScore -
          eligibilityScore
        );

      await addDoc(
        collection(
          db,
          "scoreLedger"
        ),
        {
          playerId:
            player.id,

          ign:
            player.ign,

          type:
            "WEAPON_CLAIM",

          delta:
            -Number(
              eligibilityScore
            ),

          oldScore,

          newScore,

          weapon:
            weapon.trim(),

          reason:
            reason.trim() ||
            "Weapon claim",

          admin:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",

          createdAt:
            serverTimestamp(),
        }
      );

      await setDoc(
        doc(
          db,
          "attendancePlayers",
          player.id
        ),
        {
          updatedAt:
            serverTimestamp(),

          updatedBy:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",
        },
        {
          merge: true,
        }
      );

      onClose();
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to claim weapon."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Claim Weapon — ${player.ign}`}
      onClose={onClose}
    >
      <div className="claim-summary">
        <div>
          <span>
            CURRENT SCORE
          </span>

          <strong>
            {formatScore(
              currentScore
            )}
          </strong>
        </div>

        <div>
          <span>
            REQUIRED
          </span>

          <strong>
            {formatScore(
              eligibilityScore
            )}
          </strong>
        </div>

        <div>
          <span>
            AFTER CLAIM
          </span>

          <strong>
            {formatScore(
              currentScore -
              eligibilityScore
            )}
          </strong>
        </div>
      </div>

      {!eligible && (
        <div className="warning-box">
          This player needs{" "}
          {formatScore(
            eligibilityScore -
            currentScore
          )}{" "}
          more points to claim.
        </div>
      )}

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <label>
        Weapon

        <input
          list="claim-weapon-options"
          value={weapon}
          onChange={(event) =>
            setWeapon(
              event.target.value
            )
          }
          placeholder="Weapon being claimed"
        />

        <datalist id="claim-weapon-options">
          {WEAPON_OPTIONS.map(
            (item) => (
              <option
                key={item}
                value={item}
              />
            )
          )}
        </datalist>
      </label>

      <label>
        Reason

        <input
          value={reason}
          onChange={(event) =>
            setReason(
              event.target.value
            )
          }
          placeholder="Reason"
        />
      </label>

      <div className="modal-actions">
        <button
          className="secondary-button"
          onClick={onClose}
        >
          CANCEL
        </button>

        <button
          className="danger-button"
          onClick={claim}
          disabled={
            busy || !eligible
          }
        >
          {busy
            ? "PROCESSING..."
            : "CONFIRM CLAIM"}
        </button>
      </div>
    </Modal>
  );
}

/* =========================================================
   SCORE OVERRIDE
========================================================= */

function OverrideModal({
  player,
  currentScore,
  onClose,
}) {
  const [newScore, setNewScore] =
    useState(
      String(currentScore)
    );

  const [reason, setReason] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  if (!player) return null;

  async function save() {
    const target =
      Number(newScore);

    if (
      !Number.isFinite(
        target
      ) ||
      target < 0
    ) {
      setError(
        "Enter a valid score."
      );

      return;
    }

    if (!reason.trim()) {
      setError(
        "A reason is required."
      );

      return;
    }

    const oldScore =
      roundScore(
        currentScore
      );

    const finalScore =
      roundScore(target);

    const delta =
      roundScore(
        finalScore -
        oldScore
      );

    setBusy(true);
    setError("");

    try {
      await addDoc(
        collection(
          db,
          "scoreLedger"
        ),
        {
          playerId:
            player.id,

          ign:
            player.ign,

          type:
            "MANUAL_OVERRIDE",

          delta,

          oldScore,

          newScore:
            finalScore,

          reason:
            reason.trim(),

          admin:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",

          createdAt:
            serverTimestamp(),
        }
      );

      await setDoc(
        doc(
          db,
          "attendancePlayers",
          player.id
        ),
        {
          updatedAt:
            serverTimestamp(),

          updatedBy:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",
        },
        {
          merge: true,
        }
      );

      onClose();
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to override score."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Override Score — ${player.ign}`}
      onClose={onClose}
    >
      <div className="override-current">
        <span>
          CURRENT CALCULATED SCORE
        </span>

        <strong>
          {formatScore(
            currentScore
          )}
        </strong>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <label>
        New Score

        <input
          type="number"
          min="0"
          step="0.1"
          value={newScore}
          onChange={(event) =>
            setNewScore(
              event.target.value
            )
          }
        />
      </label>

      <label>
        Required Reason

        <textarea
          value={reason}
          onChange={(event) =>
            setReason(
              event.target.value
            )
          }
          placeholder="Explain why this score is being changed..."
          rows="4"
        />
      </label>

      <div className="modal-actions">
        <button
          className="secondary-button"
          onClick={onClose}
        >
          CANCEL
        </button>

        <button
          className="primary-button"
          onClick={save}
          disabled={busy}
        >
          {busy
            ? "SAVING..."
            : "SAVE OVERRIDE"}
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
  const [search, setSearch] =
    useState("");

  const [classFilter, setClassFilter] =
    useState("all");

  const [weaponFilter, setWeaponFilter] =
    useState("all");

  const [eligibilityFilter, setEligibilityFilter] =
    useState("all");

  const [selectedPlayerId, setSelectedPlayerId] =
    useState("");

  const [attendanceDate, setAttendanceDate] =
    useState(
      getTodayPhilippines()
    );

  const [attendanceDraft, setAttendanceDraft] =
    useState({});

  const [savingAttendance, setSavingAttendance] =
    useState(false);

  const [attendanceMessage, setAttendanceMessage] =
    useState("");

  const classList =
    useMemo(
      () =>
        Array.from(
          new Set(
            players
              .map(
                (item) =>
                  item.class
              )
              .filter(Boolean)
          )
        ).sort(),
      [players]
    );

  const weaponList =
    useMemo(
      () =>
        Array.from(
          new Set(
            players
              .map(
                (item) =>
                  item.preferredWeapon
              )
              .filter(Boolean)
          )
        ).sort(),
      [players]
    );

  const selectedPlayer =
    players.find(
      (item) =>
        item.id ===
        selectedPlayerId
    ) || null;

  const selectedScore =
    selectedPlayer
      ? getPlayerScore(
        selectedPlayer,
        histories,
        ledger
      )
      : 0;

  const filteredPlayers =
    useMemo(() => {
      const q =
        normalizeIgn(
          search
        );

      return players
        .filter((player) => {
          if (
            q &&
            !normalizeIgn(
              player.ign
            ).includes(q)
          ) {
            return false;
          }

          if (
            classFilter !==
            "all" &&
            player.class !==
            classFilter
          ) {
            return false;
          }

          if (
            weaponFilter !==
            "all" &&
            player.preferredWeapon !==
            weaponFilter
          ) {
            return false;
          }

          const score =
            getPlayerScore(
              player,
              histories,
              ledger
            );

          if (
            eligibilityFilter ===
            "eligible" &&
            score <
            Number(
              settings.eligibilityScore
            )
          ) {
            return false;
          }

          if (
            eligibilityFilter ===
            "notEligible" &&
            score >=
            Number(
              settings.eligibilityScore
            )
          ) {
            return false;
          }

          return true;
        })
        .sort((a, b) =>
          String(
            a.ign || ""
          ).localeCompare(
            String(
              b.ign || ""
            )
          )
        );
    }, [
      players,
      histories,
      ledger,
      settings,
      search,
      classFilter,
      weaponFilter,
      eligibilityFilter,
    ]);

  function toggleBoss(
    bossId
  ) {
    setAttendanceDraft(
      (current) => ({
        ...current,
        [bossId]:
          !current[bossId],
      })
    );
  }

  async function saveAttendance() {
    if (!isAdmin) {
      setAttendanceMessage(
        "Administrator access required."
      );

      return;
    }

    if (!selectedPlayer) {
      setAttendanceMessage(
        "Select a player."
      );

      return;
    }

    const selectedBosses =
      BOSSES.filter(
        (boss) =>
          attendanceDraft[
          boss.id
          ]
      );

    if (
      selectedBosses.length ===
      0
    ) {
      setAttendanceMessage(
        "Select at least one boss."
      );

      return;
    }

    if (!attendanceDate) {
      setAttendanceMessage(
        "Select an attendance date."
      );

      return;
    }

    setSavingAttendance(
      true
    );

    setAttendanceMessage("");

    try {
      const adminName =
        auth.currentUser
          ?.email ||
        auth.currentUser
          ?.uid ||
        "Admin";

      const batch =
        writeBatch(db);

      for (const boss of selectedBosses) {
        const points =
          Number(
            settings[
            boss.pointsKey
            ] || 0
          );

        const ref =
          doc(
            collection(
              db,
              "attendanceHistory"
            )
          );

        batch.set(ref, {
          playerId:
            selectedPlayer.id,

          ign:
            selectedPlayer.ign,

          bossId:
            boss.id,

          bossName:
            boss.name,

          points,

          attendanceDate,

          createdAt:
            serverTimestamp(),

          createdBy:
            adminName,
        });
      }

      batch.set(
        doc(
          db,
          "attendancePlayers",
          selectedPlayer.id
        ),
        {
          updatedAt:
            serverTimestamp(),

          updatedBy:
            adminName,
        },
        {
          merge: true,
        }
      );

      await batch.commit();

      setAttendanceDraft({});

      setAttendanceMessage(
        `${selectedPlayer.ign} attendance saved successfully.`
      );
    } catch (error) {
      console.error(error);

      setAttendanceMessage(
        error?.message ||
        "Unable to save attendance."
      );
    } finally {
      setSavingAttendance(
        false
      );
    }
  }

  async function deletePlayer(
    player
  ) {
    if (!isAdmin) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete the player profile for "${player.ign}"?\n\nAttendance history and score records will be preserved.`
      );

    if (!confirmed) {
      return;
    }

    try {
      await onDeletePlayer(
        player
      );
    } catch (error) {
      window.alert(
        error?.message ||
        "Unable to delete player."
      );
    }
  }

  return (
    <section className="page-section">
      <div className="hero-heading">
        <div>
          <div className="eyebrow">
            RAN ONLINE EP7 CLASSIC
          </div>

          <h1>
            Attendance
          </h1>

          <p>
            Track guild attendance,
            scores, eligibility and
            weapon claims.
          </p>
        </div>

        {isAdmin && (
          <button
            className="primary-button"
            onClick={
              onAddPlayer
            }
          >
            + ADD PLAYER
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="attendance-console">
          <div className="content-card-header">
            <div>
              <h2>
                Attendance Console
              </h2>

              <p>
                Record attendance for
                one player and one date.
              </p>
            </div>
          </div>

          <div className="attendance-console-grid">
            <label>
              Player

              <select
                value={
                  selectedPlayerId
                }
                onChange={(event) =>
                  setSelectedPlayerId(
                    event.target
                      .value
                  )
                }
              >
                <option value="">
                  Select player...
                </option>

                {players
                  .slice()
                  .sort(
                    (
                      a,
                      b
                    ) =>
                      String(
                        a.ign
                      ).localeCompare(
                        String(
                          b.ign
                        )
                      )
                  )
                  .map(
                    (
                      player
                    ) => (
                      <option
                        key={
                          player.id
                        }
                        value={
                          player.id
                        }
                      >
                        {
                          player.ign
                        }
                      </option>
                    )
                  )}
              </select>
            </label>

            <label>
              Attendance Date

              <input
                type="date"
                value={
                  attendanceDate
                }
                onChange={(
                  event
                ) =>
                  setAttendanceDate(
                    event
                      .target
                      .value
                  )
                }
              />
            </label>

            <div className="attendance-score-preview">
              <span>
                CURRENT SCORE
              </span>

              <strong>
                {formatScore(
                  selectedScore
                )}
              </strong>
            </div>
          </div>

          <div className="boss-attendance-buttons">
            {BOSSES.map(
              (boss) => {
                const active =
                  Boolean(
                    attendanceDraft[
                    boss.id
                    ]
                  );

                return (
                  <button
                    key={
                      boss.id
                    }
                    className={
                      active
                        ? "boss-attendance-button active"
                        : "boss-attendance-button"
                    }
                    onClick={() =>
                      toggleBoss(
                        boss.id
                      )
                    }
                  >
                    <span>
                      {boss.name}
                    </span>

                    <small>
                      +
                      {formatScore(
                        settings[
                        boss.pointsKey
                        ]
                      )}
                    </small>
                  </button>
                );
              }
            )}
          </div>

          {attendanceMessage && (
            <div className="success-box">
              {attendanceMessage}
            </div>
          )}

          <button
            className="primary-button"
            onClick={
              saveAttendance
            }
            disabled={
              savingAttendance
            }
          >
            {savingAttendance
              ? "SAVING..."
              : "SAVE ATTENDANCE"}
          </button>
        </div>
      )}

      <div className="admin-content-card">
        <div className="content-card-header">
          <div>
            <h2>
              Player Directory
            </h2>

            <p>
              {filteredPlayers.length}{" "}
              players shown.
            </p>
          </div>
        </div>

        <div className="directory-filters">
          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target
                  .value
              )
            }
            placeholder="Search IGN..."
          />

          <select
            value={
              classFilter
            }
            onChange={(event) =>
              setClassFilter(
                event.target
                  .value
              )
            }
          >
            <option value="all">
              All Classes
            </option>

            {classList.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={
              weaponFilter
            }
            onChange={(event) =>
              setWeaponFilter(
                event.target
                  .value
              )
            }
          >
            <option value="all">
              All Weapons
            </option>

            {weaponList.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={
              eligibilityFilter
            }
            onChange={(event) =>
              setEligibilityFilter(
                event.target
                  .value
              )
            }
          >
            <option value="all">
              All Eligibility
            </option>

            <option value="eligible">
              Eligible
            </option>

            <option value="notEligible">
              Not Eligible
            </option>
          </select>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  IGN
                </th>

                <th>
                  Class
                </th>

                <th>
                  Preferred Weapon
                </th>

                {BOSSES.map(
                  (boss) => (
                    <th
                      key={
                        boss.id
                      }
                    >
                      {
                        boss.name
                      }
                    </th>
                  )
                )}

                <th>
                  Score
                </th>

                <th>
                  Eligibility
                </th>

                <th>
                  Last Updated
                </th>

                {isAdmin && (
                  <th>
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={
                      8 +
                      BOSSES.length +
                      (isAdmin
                        ? 1
                        : 0)
                    }
                    className="empty-cell"
                  >
                    No players found.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map(
                  (player) => {
                    const score =
                      getPlayerScore(
                        player,
                        histories,
                        ledger
                      );

                    const eligible =
                      score >=
                      Number(
                        settings.eligibilityScore
                      );

                    return (
                      <tr
                        key={
                          player.id
                        }
                      >
                        <td>
                          <strong>
                            {
                              player.ign
                            }
                          </strong>
                        </td>

                        <td>
                          {
                            player.class
                          }
                        </td>

                        <td>
                          {player.preferredWeapon ||
                            "—"}
                        </td>

                        {BOSSES.map(
                          (
                            boss
                          ) => {
                            const attended =
                              histories.some(
                                (
                                  item
                                ) =>
                                  (
                                    item.playerId ===
                                    player.id ||
                                    (!item.playerId &&
                                      normalizeIgn(
                                        item.ign
                                      ) ===
                                      normalizeIgn(
                                        player.ign
                                      ))
                                  ) &&
                                  item.bossId ===
                                  boss.id
                              );

                            return (
                              <td
                                key={
                                  boss.id
                                }
                                className={
                                  attended
                                    ? "positive-value"
                                    : ""
                                }
                              >
                                {attended
                                  ? "✓"
                                  : "—"}
                              </td>
                            );
                          }
                        )}

                        <td>
                          <strong>
                            {formatScore(
                              score
                            )}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={
                              eligible
                                ? "eligibility eligible"
                                : "eligibility"
                            }
                          >
                            {eligible
                              ? "ELIGIBLE"
                              : "NOT YET"}
                          </span>
                        </td>

                        <td>
                          {formatDateTime(
                            player.updatedAt
                          )}
                        </td>

                        {isAdmin && (
                          <td>
                            <div className="table-actions">
                              <button
                                className="small-button"
                                onClick={() =>
                                  onEditPlayer(
                                    player
                                  )
                                }
                              >
                                EDIT
                              </button>

                              <button
                                className="small-button"
                                onClick={() =>
                                  onHistory(
                                    player
                                  )
                                }
                              >
                                HISTORY
                              </button>

                              <button
                                className="small-button"
                                onClick={() =>
                                  onClaim(
                                    player
                                  )
                                }
                              >
                                CLAIM
                              </button>

                              <button
                                className="small-button"
                                onClick={() =>
                                  onOverride(
                                    player
                                  )
                                }
                              >
                                SCORE
                              </button>

                              <button
                                className="small-danger-button"
                                onClick={() =>
                                  deletePlayer(
                                    player
                                  )
                                }
                              >
                                DELETE
                              </button>

                              <button
                                className="small-danger-button"
                                onClick={() =>
                                  onPurgePlayer(
                                    player
                                  )
                                }
                              >
                                NEW USER
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <div className="danger-info">
          <strong>
            COMPLETE IGN PURGE
          </strong>

          <p>
            The NEW USER / PURGE action
            permanently removes the player
            profile, attendance history,
            weapon claims, deductions and
            manual score overrides for that
            IGN. Adding the IGN again starts
            the player at 0 points.
          </p>
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
    getDisplayTimezone(
      timezone
    );

  return (
    <section className="page-section">
      <div className="hero-heading">
        <div>
          <div className="eyebrow">
            RAN ONLINE EP7 CLASSIC
          </div>

          <h1>
            Raid Schedule
          </h1>

          <p>
            Philippines raid schedule
            with automatic timezone
            conversion.
          </p>
        </div>

        <div className="timezone-badge">
          <span>
            SCHEDULE SOURCE
          </span>

          <strong>
            PHILIPPINES TIME
          </strong>
        </div>
      </div>

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
              Raid schedules are stored
              in Philippines Time
              (Asia/Manila). Choose
              how you want the schedule
              displayed.
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
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
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
            key={
              raid.id
            }
            raid={raid}
            timezone={
              timezone
            }
            onEdit={
              onEdit
            }
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
            The official schedule is
            always saved in
            Philippines Time
            (Asia/Manila). The
            displayed time and date
            automatically convert to
            your selected timezone,
            including when the
            conversion crosses
            midnight into another day.
          </p>

          <p className="raid-note-example">
            Example: 9:00 PM Philippines
            → 6:00 AM US Pacific
            → 9:00 AM US Eastern
            → 10:00 PM Tokyo.
          </p>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   SETTINGS PANEL
========================================================= */

function SettingsPanel({
  settings,
  user,
  onSave,
}) {
  const [form, setForm] =
    useState(settings);

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function update(
    key,
    value
  ) {
    setForm(
      (current) => ({
        ...current,
        [key]: value,
      })
    );
  }

  async function save() {
    setBusy(true);
    setMessage("");
    setError("");

    try {
      await onSave({
        sonyaPoints:
          Number(
            form.sonyaPoints
          ),

        geomancerPoints:
          Number(
            form.geomancerPoints
          ),

        reflectorPoints:
          Number(
            form.reflectorPoints
          ),

        giantHawkPoints:
          Number(
            form.giantHawkPoints
          ),

        eligibilityScore:
          Number(
            form.eligibilityScore
          ),
      });

      setMessage(
        "Scoring settings saved successfully."
      );
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to save settings."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-content-card">
      <div className="content-card-header">
        <div>
          <h2>
            Scoring Settings
          </h2>

          <p>
            Configure attendance points
            and eligibility requirements.
          </p>
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {message && (
        <div className="success-box">
          {message}
        </div>
      )}

      <div className="settings-grid">
        {BOSSES.map(
          (boss) => (
            <div
              className="setting-card"
              key={
                boss.id
              }
            >
              <span>
                {
                  boss.name
                }
              </span>

              <strong>
                POINTS
              </strong>

              <input
                type="number"
                step="0.1"
                value={
                  form[
                  boss.pointsKey
                  ] ?? 0
                }
                onChange={(
                  event
                ) =>
                  update(
                    boss.pointsKey,
                    event
                      .target
                      .value
                  )
                }
              />
            </div>
          )
        )}

        <div className="setting-card">
          <span>
            Eligibility
          </span>

          <strong>
            REQUIRED SCORE
          </strong>

          <input
            type="number"
            min="0"
            step="0.1"
            value={
              form.eligibilityScore ??
              0
            }
            onChange={(
              event
            ) =>
              update(
                "eligibilityScore",
                event
                  .target
                  .value
              )
            }
          />
        </div>
      </div>

      <div className="settings-meta">
        <div>
          <span>
            Last Updated
          </span>

          <strong>
            {settings.updatedAt
              ? formatDateTime(
                settings.updatedAt
              )
              : "Never"}
          </strong>
        </div>

        <div>
          <span>
            Changed By
          </span>

          <strong>
            {settings.updatedBy ||
              user?.email ||
              "—"}
          </strong>
        </div>
      </div>

      <button
        className="primary-button"
        onClick={save}
        disabled={busy}
      >
        {busy
          ? "SAVING..."
          : "SAVE SCORING SETTINGS"}
      </button>
    </div>
  );
}

/* =========================================================
   SETTINGS HISTORY
========================================================= */

function SettingsHistoryPanel({
  settingsHistory,
}) {
  return (
    <div className="admin-content-card">
      <div className="content-card-header">
        <div>
          <h2>
            Settings History
          </h2>

          <p>
            Audit trail of every
            scoring setting change.
          </p>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                Date
              </th>

              <th>
                Setting
              </th>

              <th>
                Old Value
              </th>

              <th>
                New Value
              </th>

              <th>
                Changed By
              </th>
            </tr>
          </thead>

          <tbody>
            {settingsHistory.length ===
              0 ? (
              <tr>
                <td
                  colSpan="5"
                  className="empty-cell"
                >
                  No settings
                  history.
                </td>
              </tr>
            ) : (
              settingsHistory
                .slice()
                .sort(
                  (a, b) => {
                    const ad =
                      timestampToDate(
                        a.changedAt
                      )?.getTime() ||
                      0;

                    const bd =
                      timestampToDate(
                        b.changedAt
                      )?.getTime() ||
                      0;

                    return (
                      bd - ad
                    );
                  }
                )
                .map(
                  (item) => (
                    <tr
                      key={
                        item.id
                      }
                    >
                      <td>
                        {formatDateTime(
                          item.changedAt
                        )}
                      </td>

                      <td>
                        <span className="ledger-type">
                          {
                            item.setting
                          }
                        </span>
                      </td>

                      <td>
                        {safeRow(
                          item.oldValue
                        )}
                      </td>

                      <td>
                        {safeRow(
                          item.newValue
                        )}
                      </td>

                      <td>
                        {item.changedBy ||
                          "—"}
                      </td>
                    </tr>
                  )
                )
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
  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  async function exportBackup() {
    setBusy(true);
    setMessage("");

    try {
      await onExport();

      setMessage(
        "Full backup created successfully."
      );
    } catch (err) {
      setMessage(
        err?.message ||
        "Backup failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(
    event
  ) {
    const file =
      event.target.files?.[0];

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
        err?.message ||
        "Unable to restore backup."
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="backup-layout">
      <div className="backup-card">
        <div className="backup-icon">
          ⇩
        </div>

        <h2>
          Full Backup
        </h2>

        <p>
          Creates a complete Excel
          backup containing players,
          attendance history, score
          ledger, scoring settings,
          settings history, raid
          schedule, and backup
          information.
        </p>

        <div className="backup-counts">
          <span>
            {players.length} Players
          </span>

          <span>
            {histories.length} Attendance
          </span>

          <span>
            {ledger.length} Ledger
          </span>

          <span>
            {
              settingsHistory.length
            }{" "}
            Setting History
          </span>
        </div>

        <button
          className="primary-button"
          onClick={
            exportBackup
          }
          disabled={busy}
        >
          {busy
            ? "CREATING..."
            : "EXPORT FULL XLSX BACKUP"}
        </button>
      </div>

      <div className="backup-card">
        <div className="backup-icon">
          ⇧
        </div>

        <h2>
          Restore Backup
        </h2>

        <p>
          Restores records from a
          previous full backup.
          Existing records with
          matching IDs are updated.
          New records are added.
        </p>

        <label className="file-upload">
          <span>
            {busy
              ? "PROCESSING..."
              : "SELECT XLSX BACKUP"}
          </span>

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={
              importBackup
            }
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
   ADMIN PAGE
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
  const [tab, setTab] =
    useState(
      "dashboard"
    );

  const totalScore =
    useMemo(
      () =>
        roundScore(
          players.reduce(
            (
              total,
              player
            ) =>
              total +
              getPlayerScore(
                player,
                histories,
                ledger
              ),
            0
          )
        ),
      [
        players,
        histories,
        ledger,
      ]
    );

  const eligibleCount =
    players.filter(
      (player) =>
        getPlayerScore(
          player,
          histories,
          ledger
        ) >=
        Number(
          settings.eligibilityScore
        )
    ).length;

  return (
    <section className="page-section">
      <div className="hero-heading">
        <div>
          <div className="eyebrow">
            CONTROL CENTER
          </div>

          <h1>
            Administrator
          </h1>

          <p>
            Manage guild attendance,
            players, scoring and
            backups.
          </p>
        </div>

        <div className="admin-user-badge">
          <span>
            SIGNED IN
          </span>

          <strong>
            {user?.email ||
              user?.uid}
          </strong>
        </div>
      </div>

      <div className="admin-tabs">
        {[
          [
            "dashboard",
            "Dashboard",
          ],
          [
            "players",
            "Players",
          ],
          [
            "ledger",
            "Score Ledger",
          ],
          [
            "scoring",
            "Scoring",
          ],
          [
            "history",
            "Settings History",
          ],
          [
            "backup",
            "Backup / Restore",
          ],
        ].map(
          ([value, label]) => (
            <button
              key={value}
              className={
                tab === value
                  ? "admin-tab active"
                  : "admin-tab"
              }
              onClick={() =>
                setTab(value)
              }
            >
              {label}
            </button>
          )
        )}
      </div>

      {tab ===
        "dashboard" && (
          <div className="dashboard-grid">
            <div className="dashboard-stat">
              <span>
                TOTAL PLAYERS
              </span>

              <strong>
                {players.length}
              </strong>
            </div>

            <div className="dashboard-stat">
              <span>
                ELIGIBLE
              </span>

              <strong>
                {eligibleCount}
              </strong>
            </div>

            <div className="dashboard-stat">
              <span>
                ATTENDANCE RECORDS
              </span>

              <strong>
                {histories.length}
              </strong>
            </div>

            <div className="dashboard-stat">
              <span>
                LEDGER RECORDS
              </span>

              <strong>
                {ledger.length}
              </strong>
            </div>

            <div className="dashboard-stat">
              <span>
                POINTS IN SYSTEM
              </span>

              <strong>
                {formatScore(
                  totalScore
                )}
              </strong>
            </div>

            <div className="dashboard-stat">
              <span>
                ELIGIBILITY THRESHOLD
              </span>

              <strong>
                {formatScore(
                  settings.eligibilityScore
                )}
              </strong>
            </div>

            <div className="admin-content-card dashboard-wide-card">
              <div className="content-card-header">
                <div>
                  <h2>
                    Current Scoring
                  </h2>

                  <p>
                    Points awarded per
                    attendance.
                  </p>
                </div>
              </div>

              <div className="dashboard-scoring">
                {BOSSES.map(
                  (boss) => (
                    <div
                      key={
                        boss.id
                      }
                    >
                      <span>
                        {
                          boss.name
                        }
                      </span>

                      <strong>
                        +
                        {formatScore(
                          settings[
                          boss.pointsKey
                          ]
                        )}
                      </strong>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="admin-content-card dashboard-wide-card">
              <div className="content-card-header">
                <div>
                  <h2>
                    Raid System
                  </h2>

                  <p>
                    Geomancer is configured
                    as a true 10-hour
                    repeating schedule.
                  </p>
                </div>
              </div>

              <div className="dashboard-scoring">
                <div>
                  <span>
                    GEOMANCER
                  </span>

                  <strong>
                    EVERY 10 HOURS
                  </strong>
                </div>

                <div>
                  <span>
                    CYCLE WINDOW
                  </span>

                  <strong>
                    72 HOURS
                  </strong>
                </div>

                <div>
                  <span>
                    UPCOMING
                  </span>

                  <strong>
                    8 SPAWNS
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

      {tab ===
        "players" && (
          <div className="admin-content-card">
            <div className="content-card-header">
              <div>
                <h2>
                  Players
                </h2>

                <p>
                  Manage guild player
                  profiles.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={
                  onAddPlayer
                }
              >
                + ADD PLAYER
              </button>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      IGN
                    </th>

                    <th>
                      Class
                    </th>

                    <th>
                      Weapon
                    </th>

                    <th>
                      Score
                    </th>

                    <th>
                      Updated
                    </th>

                    <th>
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {players.length ===
                    0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="empty-cell"
                      >
                        No players.
                      </td>
                    </tr>
                  ) : (
                    players
                      .slice()
                      .sort(
                        (
                          a,
                          b
                        ) =>
                          String(
                            a.ign
                          ).localeCompare(
                            String(
                              b.ign
                            )
                          )
                      )
                      .map(
                        (
                          player
                        ) => (
                          <tr
                            key={
                              player.id
                            }
                          >
                            <td>
                              <strong>
                                {
                                  player.ign
                                }
                              </strong>
                            </td>

                            <td>
                              {
                                player.class
                              }
                            </td>

                            <td>
                              {player.preferredWeapon ||
                                "—"}
                            </td>

                            <td>
                              {formatScore(
                                getPlayerScore(
                                  player,
                                  histories,
                                  ledger
                                )
                              )}
                            </td>

                            <td>
                              {formatDateTime(
                                player.updatedAt
                              )}
                            </td>

                            <td>
                              <div className="table-actions">
                                <button
                                  className="small-button"
                                  onClick={() =>
                                    onEditPlayer(
                                      player
                                    )
                                  }
                                >
                                  EDIT
                                </button>

                                <button
                                  className="small-button"
                                  onClick={() =>
                                    onHistory(
                                      player
                                    )
                                  }
                                >
                                  HISTORY
                                </button>

                                <button
                                  className="small-button"
                                  onClick={() =>
                                    onClaim(
                                      player
                                    )
                                  }
                                >
                                  CLAIM
                                </button>

                                <button
                                  className="small-button"
                                  onClick={() =>
                                    onOverride(
                                      player
                                    )
                                  }
                                >
                                  SCORE
                                </button>

                                <button
                                  className="small-danger-button"
                                  onClick={() =>
                                    onDeletePlayer(
                                      player
                                    )
                                  }
                                >
                                  DELETE
                                </button>

                                <button
                                  className="small-danger-button"
                                  onClick={() =>
                                    onPurgePlayer(
                                      player
                                    )
                                  }
                                >
                                  PURGE
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {tab ===
        "ledger" && (
          <div className="admin-content-card">
            <div className="content-card-header">
              <div>
                <h2>
                  Score Ledger
                </h2>

                <p>
                  Every claim and manual
                  score adjustment.
                </p>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      Date
                    </th>

                    <th>
                      IGN
                    </th>

                    <th>
                      Type
                    </th>

                    <th>
                      Delta
                    </th>

                    <th>
                      Old
                    </th>

                    <th>
                      New
                    </th>

                    <th>
                      Weapon
                    </th>

                    <th>
                      Reason
                    </th>

                    <th>
                      Admin
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {ledger.length ===
                    0 ? (
                    <tr>
                      <td
                        colSpan="9"
                        className="empty-cell"
                      >
                        No ledger records.
                      </td>
                    </tr>
                  ) : (
                    ledger
                      .slice()
                      .sort(
                        (
                          a,
                          b
                        ) =>
                          (
                            timestampToDate(
                              b.createdAt
                            )?.getTime() ||
                            0
                          ) -
                          (
                            timestampToDate(
                              a.createdAt
                            )?.getTime() ||
                            0
                          )
                      )
                      .map(
                        (
                          item
                        ) => (
                          <tr
                            key={
                              item.id
                            }
                          >
                            <td>
                              {formatDateTime(
                                item.createdAt
                              )}
                            </td>

                            <td>
                              {
                                item.ign
                              }
                            </td>

                            <td>
                              <span className="ledger-type">
                                {
                                  item.type
                                }
                              </span>
                            </td>

                            <td
                              className={
                                Number(
                                  item.delta
                                ) >=
                                  0
                                  ? "positive-value"
                                  : "negative-value"
                              }
                            >
                              {Number(
                                item.delta
                              ) >=
                                0
                                ? "+"
                                : ""}

                              {formatScore(
                                item.delta
                              )}
                            </td>

                            <td>
                              {formatScore(
                                item.oldScore
                              )}
                            </td>

                            <td>
                              {formatScore(
                                item.newScore
                              )}
                            </td>

                            <td>
                              {
                                item.weapon ||
                                "—"
                              }
                            </td>

                            <td>
                              {
                                item.reason ||
                                "—"
                              }
                            </td>

                            <td>
                              {
                                item.admin ||
                                "—"
                              }
                            </td>
                          </tr>
                        )
                      )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {tab ===
        "scoring" && (
          <SettingsPanel
            settings={
              settings
            }
            user={user}
            onSave={
              onSaveSettings
            }
          />
        )}

      {tab ===
        "history" && (
          <SettingsHistoryPanel
            settingsHistory={
              settingsHistory
            }
          />
        )}

      {tab ===
        "backup" && (
          <BackupPanel
            players={
              players
            }
            histories={
              histories
            }
            ledger={ledger}
            settings={
              settings
            }
            settingsHistory={
              settingsHistory
            }
            onExport={
              onExport
            }
            onImport={
              onImport
            }
          />
        )}
    </section>
  );
}

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [page, setPage] =
    useState("raid");

  const [timezone, setTimezone] =
    useState(
      getStoredTimezone()
    );

  function handleTimezoneChange(
    value
  ) {
    setTimezone(value);
    saveTimezonePreference(
      value
    );
  }

  const [user, setUser] =
    useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [isAdmin, setIsAdmin] =
    useState(false);

  const [showLogin, setShowLogin] =
    useState(false);

  const [raids, setRaids] =
    useState(
      BOSSES.map(
        getDefaultRaid
      )
    );

  const [players, setPlayers] =
    useState([]);

  const [histories, setHistories] =
    useState([]);

  const [ledger, setLedger] =
    useState([]);

  const [settings, setSettings] =
    useState(
      DEFAULT_SETTINGS
    );

  const [settingsHistory, setSettingsHistory] =
    useState([]);

  const [raidEditor, setRaidEditor] =
    useState(null);

  const [playerEditor, setPlayerEditor] =
    useState(null);

  const [historyPlayer, setHistoryPlayer] =
    useState(null);

  const [claimPlayer, setClaimPlayer] =
    useState(null);

  const [overridePlayer, setOverridePlayer] =
    useState(null);

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (
          firebaseUser
        ) => {
          try {
            setUser(
              firebaseUser
            );

            if (
              !firebaseUser
            ) {
              setIsAdmin(false);
              setAuthLoading(
                false
              );

              return;
            }

            const adminSnap =
              await getDoc(
                doc(
                  db,
                  "admins",
                  firebaseUser.uid
                )
              );

            setIsAdmin(
              adminSnap.exists() &&
              adminSnap.data()
                ?.active === true
            );
          } catch (error) {
            console.error(
              error
            );

            setIsAdmin(false);
          } finally {
            setAuthLoading(
              false
            );
          }
        }
      );

    return () =>
      unsubscribe();
  }, []);

  /* =======================================================
     RAID LISTENER
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        doc(
          db,
          "settings",
          "raidSchedule"
        ),
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            setRaids(
              BOSSES.map(
                getDefaultRaid
              )
            );

            return;
          }

          const data =
            snapshot.data();

          const loaded =
            BOSSES.map(
              (boss) => {
                const raid =
                  Array.isArray(
                    data.raids
                  )
                    ? data.raids.find(
                      (item) =>
                        item.id ===
                        boss.id
                    )
                    : null;

                return sanitizeRaid(
                  raid,
                  boss
                );
              }
            );

          setRaids(
            loaded
          );
        },
        (error) => {
          console.error(
            "Raid schedule listener:",
            error
          );

          setRaids(
            BOSSES.map(
              getDefaultRaid
            )
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  /* =======================================================
     PLAYERS
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "attendancePlayers"
        ),
        (snapshot) => {
          const rows =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setPlayers(rows);
        },
        (error) => {
          console.error(
            "Player listener:",
            error
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  /* =======================================================
     ATTENDANCE HISTORY
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "attendanceHistory"
        ),
        (snapshot) => {
          const rows =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setHistories(rows);
        },
        (error) => {
          console.error(
            "Attendance listener:",
            error
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  /* =======================================================
     SCORE LEDGER
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "scoreLedger"
        ),
        (snapshot) => {
          const rows =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setLedger(rows);
        },
        (error) => {
          console.error(
            "Ledger listener:",
            error
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  /* =======================================================
     SETTINGS
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        doc(
          db,
          "settings",
          "attendance"
        ),
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            setSettings(
              DEFAULT_SETTINGS
            );

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

    return () =>
      unsubscribe();
  }, []);

  /* =======================================================
     SETTINGS HISTORY
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "settingsHistory"
        ),
        (snapshot) => {
          const rows =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setSettingsHistory(
            rows
          );
        },
        (error) => {
          console.error(
            "Settings history listener:",
            error
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  /* =======================================================
     PLAYER DELETE
  ======================================================= */

  async function deletePlayerProfile(
    player
  ) {
    if (!isAdmin) {
      throw new Error(
        "Administrator access required."
      );
    }

    await deleteDoc(
      doc(
        db,
        "attendancePlayers",
        player.id
      )
    );
  }

  /* =======================================================
     COMPLETE IGN PURGE
  ======================================================= */

  async function completelyPurgeIgn(
    player
  ) {
    if (!isAdmin) {
      throw new Error(
        "Administrator access is required."
      );
    }

    if (
      !player?.id ||
      !player?.ign
    ) {
      throw new Error(
        "Invalid player."
      );
    }

    const ign =
      String(
        player.ign
      ).trim();

    const typed =
      window.prompt(
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

    if (
      typed ===
      null
    ) {
      return;
    }

    if (
      normalizeIgn(
        typed
      ) !==
      normalizeIgn(
        ign
      )
    ) {
      window.alert(
        "The IGN did not match exactly.\n\nNothing was deleted."
      );

      return;
    }

    const finalConfirm =
      window.confirm(
        `FINAL CONFIRMATION\n\n` +
        `Completely delete "${ign}" and make it a clean NEW USER?\n\n` +
        `After this operation, adding "${ign}" again will start at 0 points.`
      );

    if (
      !finalConfirm
    ) {
      return;
    }

    try {
      const attendanceSnapshot =
        await getDocs(
          collection(
            db,
            "attendanceHistory"
          )
        );

      const ledgerSnapshot =
        await getDocs(
          collection(
            db,
            "scoreLedger"
          )
        );

      const attendanceRefs =
        attendanceSnapshot.docs
          .filter(
            (snap) => {
              const data =
                snap.data();

              return (
                data.playerId ===
                player.id ||
                (!data.playerId &&
                  normalizeIgn(
                    data.ign
                  ) ===
                  normalizeIgn(
                    ign
                  ))
              );
            }
          )
          .map(
            (snap) =>
              snap.ref
          );

      const ledgerRefs =
        ledgerSnapshot.docs
          .filter(
            (snap) => {
              const data =
                snap.data();

              return (
                data.playerId ===
                player.id ||
                (!data.playerId &&
                  normalizeIgn(
                    data.ign
                  ) ===
                  normalizeIgn(
                    ign
                  ))
              );
            }
          )
          .map(
            (snap) =>
              snap.ref
          );

      const allRefs = [
        ...attendanceRefs,
        ...ledgerRefs,
        doc(
          db,
          "attendancePlayers",
          player.id
        ),
      ];

      for (
        let start = 0;
        start <
        allRefs.length;
        start += 450
      ) {
        const batch =
          writeBatch(db);

        allRefs
          .slice(
            start,
            start + 450
          )
          .forEach(
            (ref) =>
              batch.delete(
                ref
              )
          );

        await batch.commit();
      }

      setPlayers(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              player.id
          )
      );

      setHistories(
        (current) =>
          current.filter(
            (item) =>
              item.playerId !==
              player.id &&
              normalizeIgn(
                item.ign
              ) !==
              normalizeIgn(
                ign
              )
          )
      );

      setLedger(
        (current) =>
          current.filter(
            (item) =>
              item.playerId !==
              player.id &&
              normalizeIgn(
                item.ign
              ) !==
              normalizeIgn(
                ign
              )
          )
      );

      if (
        historyPlayer?.id ===
        player.id
      ) {
        setHistoryPlayer(
          null
        );
      }

      if (
        claimPlayer?.id ===
        player.id
      ) {
        setClaimPlayer(
          null
        );
      }

      if (
        overridePlayer?.id ===
        player.id
      ) {
        setOverridePlayer(
          null
        );
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

  async function saveSettings(
    nextSettings
  ) {
    if (!isAdmin) {
      throw new Error(
        "Administrator access required."
      );
    }

    const adminName =
      auth.currentUser
        ?.email ||
      auth.currentUser
        ?.uid ||
      "Admin";

    const settingsRef =
      doc(
        db,
        "settings",
        "attendance"
      );

    const currentSnap =
      await getDoc(
        settingsRef
      );

    const current =
      currentSnap.exists()
        ? {
          ...DEFAULT_SETTINGS,
          ...currentSnap.data(),
        }
        : DEFAULT_SETTINGS;

    const batch =
      writeBatch(db);

    batch.set(
      settingsRef,
      {
        ...nextSettings,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          adminName,
      },
      {
        merge: true,
      }
    );

    const settingKeys = [
      "sonyaPoints",
      "geomancerPoints",
      "reflectorPoints",
      "giantHawkPoints",
      "eligibilityScore",
    ];

    for (const key of settingKeys) {
      const oldValue =
        Number(
          current[key]
        );

      const newValue =
        Number(
          nextSettings[key]
        );

      if (
        oldValue !==
        newValue
      ) {
        const historyRef =
          doc(
            collection(
              db,
              "settingsHistory"
            )
          );

        batch.set(
          historyRef,
          {
            setting: key,
            oldValue,
            newValue,
            changedBy:
              adminName,
            changedAt:
              serverTimestamp(),
          }
        );
      }
    }

    await batch.commit();
  }

  /* =======================================================
     XLSX EXPORT
  ======================================================= */

  async function exportFullBackup() {
    const raidSchedule =
      raids.map(
        (raid) => ({
          id: raid.id,
          name: raid.name,
          type: raid.type,
          frequency:
            raid.frequency,

          day:
            raid.day ===
              null
              ? ""
              : raid.day,

          hour:
            raid.hour,

          minute:
            raid.minute,

          time12:
            formatTime12(
              raid.hour,
              raid.minute
            ),

          intervalHours:
            raid.intervalHours ||
            "",

          anchorDate:
            raid.anchorDate ||
            "",

          cycleStartPH:
            raid.frequency ===
              "Every 10 Hours" &&
              raid.anchorDate
              ? `${raid.anchorDate} ${formatTime12(
                raid.hour,
                raid.minute
              )}`
              : "",

          image:
            raid.image || "",

          updatedAt:
            safeRow(
              raid.updatedAt
            ),

          updatedBy:
            raid.updatedBy ||
            "",
        })
      );

    const playersSheet =
      players.map(
        (item) => ({
          id: item.id,

          ign:
            item.ign || "",

          class:
            item.class || "",

          preferredWeapon:
            item.preferredWeapon ||
            "",

          createdAt:
            safeRow(
              item.createdAt
            ),

          updatedAt:
            safeRow(
              item.updatedAt
            ),

          createdBy:
            item.createdBy ||
            "",

          updatedBy:
            item.updatedBy ||
            "",
        })
      );

    const historySheet =
      histories.map(
        (item) => ({
          id: item.id,

          playerId:
            item.playerId ||
            "",

          ign:
            item.ign || "",

          bossId:
            item.bossId ||
            "",

          bossName:
            item.bossName ||
            "",

          points:
            Number(
              item.points || 0
            ),

          attendanceDate:
            item.attendanceDate ||
            "",

          createdAt:
            safeRow(
              item.createdAt
            ),

          createdBy:
            item.createdBy ||
            "",
        })
      );

    const ledgerSheet =
      ledger.map(
        (item) => ({
          id: item.id,

          playerId:
            item.playerId ||
            "",

          ign:
            item.ign || "",

          type:
            item.type || "",

          delta:
            Number(
              item.delta || 0
            ),

          oldScore:
            Number(
              item.oldScore || 0
            ),

          newScore:
            Number(
              item.newScore || 0
            ),

          weapon:
            item.weapon || "",

          reason:
            item.reason || "",

          admin:
            item.admin || "",

          createdAt:
            safeRow(
              item.createdAt
            ),
        })
      );

    const settingsSheet =
      [
        {
          id: "attendance",

          sonyaPoints:
            Number(
              settings.sonyaPoints
            ),

          geomancerPoints:
            Number(
              settings.geomancerPoints
            ),

          reflectorPoints:
            Number(
              settings.reflectorPoints
            ),

          giantHawkPoints:
            Number(
              settings.giantHawkPoints
            ),

          eligibilityScore:
            Number(
              settings.eligibilityScore
            ),

          updatedAt:
            safeRow(
              settings.updatedAt
            ),

          updatedBy:
            settings.updatedBy ||
            "",
        },
      ];

    const settingsHistorySheet =
      settingsHistory.map(
        (item) => ({
          id: item.id,

          setting:
            item.setting || "",

          oldValue:
            safeRow(
              item.oldValue
            ),

          newValue:
            safeRow(
              item.newValue
            ),

          changedBy:
            item.changedBy ||
            "",

          changedAt:
            safeRow(
              item.changedAt
            ),
        })
      );

    const backupInfo =
      [
        {
          exportedAt:
            new Date().toISOString(),

          application:
            "RAN Online EP7 BH Attendance",

          version:
            "2.1",

          players:
            players.length,

          attendanceHistory:
            histories.length,

          scoreLedger:
            ledger.length,

          settingsHistory:
            settingsHistory.length,

          raidSchedule:
            raids.length,

          geomancerSchedule:
            "Every 10 Hours",

          geomancerCycleSpan:
            "3 Days / 72 Hours",

          geomancerUpcomingSpawns:
            "8",

          restoreMode:
            "MERGE / UPSERT",
        },
      ];

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        playersSheet
      ),
      "Players"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        historySheet
      ),
      "Attendance History"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        ledgerSheet
      ),
      "Score Ledger"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        settingsSheet
      ),
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
      XLSX.utils.json_to_sheet(
        raidSchedule
      ),
      "Raid Schedule"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        backupInfo
      ),
      "Backup Info"
    );

    const stamp =
      new Date()
        .toISOString()
        .replace(
          /[:.]/g,
          "-"
        );

    XLSX.writeFile(
      workbook,
      `RAN-EP7-FULL-BACKUP-${stamp}.xlsx`
    );
  }

  /* =======================================================
     XLSX IMPORT
  ======================================================= */

  async function importFullBackup(
    file
  ) {
    if (!isAdmin) {
      throw new Error(
        "Administrator access required."
      );
    }

    const buffer =
      await file.arrayBuffer();

    const workbook =
      XLSX.read(
        buffer,
        {
          type: "array",
          cellDates: true,
        }
      );

    function readSheet(
      name
    ) {
      const sheet =
        workbook.Sheets[
        name
        ];

      if (!sheet) {
        return [];
      }

      return XLSX.utils.sheet_to_json(
        sheet,
        {
          defval: "",
        }
      );
    }

    const playersRows =
      readSheet(
        "Players"
      );

    const historyRows =
      readSheet(
        "Attendance History"
      );

    const ledgerRows =
      readSheet(
        "Score Ledger"
      );

    const settingsRows =
      readSheet(
        "Scoring Settings"
      );

    const settingsHistoryRows =
      readSheet(
        "Settings History"
      );

    const raidRows =
      readSheet(
        "Raid Schedule"
      );

    const operations = [];

    playersRows.forEach(
      (row) => {
        if (!row.id) return;

        operations.push({
          ref: doc(
            db,
            "attendancePlayers",
            String(row.id)
          ),

          data: {
            ign:
              String(
                row.ign || ""
              ),

            class:
              String(
                row.class || ""
              ),

            preferredWeapon:
              String(
                row.preferredWeapon ||
                ""
              ),

            createdAt:
              excelDateToJS(
                row.createdAt
              )?.toISOString() ||
              row.createdAt ||
              null,

            updatedAt:
              excelDateToJS(
                row.updatedAt
              )?.toISOString() ||
              row.updatedAt ||
              null,

            createdBy:
              String(
                row.createdBy ||
                ""
              ),

            updatedBy:
              String(
                row.updatedBy ||
                ""
              ),
          },
        });
      }
    );

    historyRows.forEach(
      (row) => {
        if (!row.id) return;

        operations.push({
          ref: doc(
            db,
            "attendanceHistory",
            String(row.id)
          ),

          data: {
            playerId:
              String(
                row.playerId ||
                ""
              ),

            ign:
              String(
                row.ign || ""
              ),

            bossId:
              String(
                row.bossId || ""
              ),

            bossName:
              String(
                row.bossName ||
                ""
              ),

            points:
              Number(
                row.points || 0
              ),

            attendanceDate:
              String(
                row.attendanceDate ||
                ""
              ),

            createdAt:
              excelDateToJS(
                row.createdAt
              )?.toISOString() ||
              row.createdAt ||
              null,

            createdBy:
              String(
                row.createdBy ||
                ""
              ),
          },
        });
      }
    );

    ledgerRows.forEach(
      (row) => {
        if (!row.id) return;

        operations.push({
          ref: doc(
            db,
            "scoreLedger",
            String(row.id)
          ),

          data: {
            playerId:
              String(
                row.playerId ||
                ""
              ),

            ign:
              String(
                row.ign || ""
              ),

            type:
              String(
                row.type || ""
              ),

            delta:
              Number(
                row.delta || 0
              ),

            oldScore:
              Number(
                row.oldScore || 0
              ),

            newScore:
              Number(
                row.newScore || 0
              ),

            weapon:
              String(
                row.weapon ||
                ""
              ),

            reason:
              String(
                row.reason ||
                ""
              ),

            admin:
              String(
                row.admin || ""
              ),

            createdAt:
              excelDateToJS(
                row.createdAt
              )?.toISOString() ||
              row.createdAt ||
              null,
          },
        });
      }
    );

    settingsHistoryRows.forEach(
      (row) => {
        if (!row.id) return;

        operations.push({
          ref: doc(
            db,
            "settingsHistory",
            String(row.id)
          ),

          data: {
            setting:
              String(
                row.setting ||
                ""
              ),

            oldValue:
              row.oldValue,

            newValue:
              row.newValue,

            changedBy:
              String(
                row.changedBy ||
                ""
              ),

            changedAt:
              excelDateToJS(
                row.changedAt
              )?.toISOString() ||
              row.changedAt ||
              null,
          },
        });
      }
    );

    for (
      let start = 0;
      start <
      operations.length;
      start += 450
    ) {
      const batch =
        writeBatch(db);

      operations
        .slice(
          start,
          start + 450
        )
        .forEach(
          (
            operation
          ) => {
            batch.set(
              operation.ref,
              operation.data,
              {
                merge: true,
              }
            );
          }
        );

      await batch.commit();
    }

    if (
      settingsRows.length >
      0
    ) {
      const row =
        settingsRows[0];

      await setDoc(
        doc(
          db,
          "settings",
          "attendance"
        ),
        {
          sonyaPoints:
            Number(
              row.sonyaPoints ||
              0
            ),

          geomancerPoints:
            Number(
              row.geomancerPoints ||
              0
            ),

          reflectorPoints:
            Number(
              row.reflectorPoints ||
              0
            ),

          giantHawkPoints:
            Number(
              row.giantHawkPoints ||
              0
            ),

          eligibilityScore:
            Number(
              row.eligibilityScore ||
              0
            ),

          updatedAt:
            excelDateToJS(
              row.updatedAt
            )?.toISOString() ||
            row.updatedAt ||
            null,

          updatedBy:
            String(
              row.updatedBy ||
              ""
            ),
        },
        {
          merge: true,
        }
      );
    }

    /* =====================================================
       RESTORE RAID SCHEDULE
    ===================================================== */

    if (
      raidRows.length >
      0
    ) {
      const importedRaids =
        BOSSES.map(
          (boss) => {
            const row =
              raidRows.find(
                (item) =>
                  String(
                    item.id
                  ) ===
                  String(
                    boss.id
                  )
              );

            if (!row) {
              return getDefaultRaid(
                boss
              );
            }

            const importedRaid =
            {
              id:
                boss.id,

              name:
                row.name ||
                boss.name,

              type:
                row.type ||
                boss.type,

              frequency:
                boss.id ===
                  "geomancer"
                  ? "Every 10 Hours"
                  : row.frequency ||
                  boss.frequency,

              day:
                boss.id ===
                  "geomancer"
                  ? null
                  : row.day ===
                    ""
                    ? null
                    : Number(
                      row.day
                    ),

              hour:
                Number.isFinite(
                  Number(
                    row.hour
                  )
                )
                  ? Number(
                    row.hour
                  )
                  : boss.defaultHour,

              minute:
                Number.isFinite(
                  Number(
                    row.minute
                  )
                )
                  ? Number(
                    row.minute
                  )
                  : boss.defaultMinute,

              intervalHours:
                boss.id ===
                  "geomancer"
                  ? Number(
                    row.intervalHours ||
                    GEOMANCER_INTERVAL_HOURS
                  )
                  : undefined,

              anchorDate:
                boss.id ===
                  "geomancer"
                  ? /^\d{4}-\d{2}-\d{2}$/.test(
                    String(
                      row.anchorDate ||
                      ""
                    )
                  )
                    ? String(
                      row.anchorDate
                    )
                    : getTodayPhilippines()
                  : undefined,

              image:
                row.image ||
                boss.image ||
                "",

              updatedAt:
                excelDateToJS(
                  row.updatedAt
                )?.toISOString() ||
                row.updatedAt ||
                null,

              updatedBy:
                row.updatedBy ||
                "",
            };

            return sanitizeRaid(
              importedRaid,
              boss
            );
          }
        );

      await setDoc(
        doc(
          db,
          "settings",
          "raidSchedule"
        ),
        {
          raids:
            importedRaids,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            auth.currentUser
              ?.email ||
            auth.currentUser
              ?.uid ||
            "Admin",
        },
        {
          merge: true,
        }
      );
    }
  }

  /* =======================================================
     AUTH LOADING
  ======================================================= */

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          RAN
        </div>

        <div className="loading-bar">
          <span />
        </div>

        <p>
          LOADING DATABASE...
        </p>
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
          <div className="brand-mark">
            R
          </div>

          <div>
            <strong>
              RAN EP7
            </strong>

            <span>
              BH ATTENDANCE
            </span>
          </div>
        </div>

        <nav className="main-nav">
          <button
            className={
              page === "raid"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              setPage(
                "raid"
              )
            }
          >
            RAID SCHEDULE
          </button>

          <button
            className={
              page ===
                "attendance"
                ? "nav-active"
                : ""
            }
            onClick={() =>
              setPage(
                "attendance"
              )
            }
          >
            ATTENDANCE
          </button>

          {isAdmin && (
            <button
              className={
                page ===
                  "admin"
                  ? "nav-active"
                  : ""
              }
              onClick={() =>
                setPage(
                  "admin"
                )
              }
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
                onClick={() =>
                  signOut(
                    auth
                  )
                }
              >
                LOG OUT
              </button>
            </>
          ) : (
            <button
              className="admin-login-button"
              onClick={() =>
                setShowLogin(
                  true
                )
              }
            >
              ADMIN LOGIN
            </button>
          )}
        </div>
      </header>

      <main>
        {page ===
          "raid" && (
            <RaidPage
              raids={
                raids
              }
              timezone={
                timezone
              }
              onTimezoneChange={
                handleTimezoneChange
              }
              onEdit={
                setRaidEditor
              }
            />
          )}

        {page ===
          "attendance" && (
            <AttendancePage
              players={
                players
              }
              histories={
                histories
              }
              ledger={
                ledger
              }
              settings={
                settings
              }
              isAdmin={
                isAdmin
              }
              onAddPlayer={() =>
                setPlayerEditor(
                  {
                    mode: "new",
                  }
                )
              }
              onEditPlayer={(
                player
              ) =>
                setPlayerEditor(
                  player
                )
              }
              onDeletePlayer={
                deletePlayerProfile
              }
              onPurgePlayer={
                completelyPurgeIgn
              }
              onHistory={
                setHistoryPlayer
              }
              onClaim={
                setClaimPlayer
              }
              onOverride={
                setOverridePlayer
              }
            />
          )}

        {page ===
          "admin" &&
          isAdmin && (
            <AdminPage
              players={
                players
              }
              histories={
                histories
              }
              ledger={
                ledger
              }
              settings={
                settings
              }
              settingsHistory={
                settingsHistory
              }
              user={
                user
              }
              onAddPlayer={() =>
                setPlayerEditor(
                  {
                    mode: "new",
                  }
                )
              }
              onEditPlayer={(
                player
              ) =>
                setPlayerEditor(
                  player
                )
              }
              onHistory={
                setHistoryPlayer
              }
              onClaim={
                setClaimPlayer
              }
              onOverride={
                setOverridePlayer
              }
              onPurgePlayer={
                completelyPurgeIgn
              }
              onDeletePlayer={
                deletePlayerProfile
              }
              onSaveSettings={
                saveSettings
              }
              onExport={
                exportFullBackup
              }
              onImport={
                importFullBackup
              }
            />
          )}
      </main>

      <footer className="main-footer">
        <div>
          <strong>
            RAN ONLINE EP7 BH ATTENDANCE
          </strong>

          <span>
            Attendance • Raid
            Schedule • Scoring
          </span>
        </div>

        <span>
          ©{" "}
          {new Date().getFullYear()}{" "}
          BH Guild
        </span>
      </footer>

      {showLogin && (
        <AdminLogin
          onClose={() =>
            setShowLogin(false)
          }
        />
      )}

      {raidEditor && (
        <RaidEditor
          raid={
            raidEditor
          }
          onClose={() =>
            setRaidEditor(
              null
            )
          }
          onSaved={() => { }}
        />
      )}

      {playerEditor && (
        <PlayerFormModal
          player={
            playerEditor.mode ===
              "new"
              ? null
              : playerEditor
          }
          onClose={() =>
            setPlayerEditor(
              null
            )
          }
          onSaved={() => { }}
        />
      )}

      {historyPlayer && (
        <PlayerHistoryModal
          player={
            historyPlayer
          }
          histories={
            histories
          }
          ledger={
            ledger
          }
          score={getPlayerScore(
            historyPlayer,
            histories,
            ledger
          )}
          onClose={() =>
            setHistoryPlayer(
              null
            )
          }
        />
      )}

      {claimPlayer && (
        <ClaimModal
          player={
            claimPlayer
          }
          currentScore={getPlayerScore(
            claimPlayer,
            histories,
            ledger
          )}
          eligibilityScore={Number(
            settings.eligibilityScore
          )}
          onClose={() =>
            setClaimPlayer(
              null
            )
          }
        />
      )}

      {overridePlayer && (
        <OverrideModal
          player={
            overridePlayer
          }
          currentScore={getPlayerScore(
            overridePlayer,
            histories,
            ledger
          )}
          onClose={() =>
            setOverridePlayer(
              null
            )
          }
        />
      )}
    </div>
  );
}