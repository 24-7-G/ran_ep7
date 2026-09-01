
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  addDoc,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import * as XLSX from "xlsx";

import {
  auth,
  db,
} from "./firebase";

/* ============================================================
   CONSTANTS
============================================================ */

const PH_TIMEZONE = "Asia/Manila";

const TIMEZONES = [
  ["America/Los_Angeles", "Seattle / Los Angeles", "🇺🇸"],
  ["America/Denver", "Denver", "🇺🇸"],
  ["America/Chicago", "Chicago", "🇺🇸"],
  ["America/New_York", "New York", "🇺🇸"],
  ["America/Vancouver", "Vancouver", "🇨🇦"],
  ["America/Toronto", "Toronto", "🇨🇦"],
  ["Asia/Tokyo", "Japan", "🇯🇵"],
  ["Asia/Seoul", "South Korea", "🇰🇷"],
  ["Asia/Singapore", "Singapore", "🇸🇬"],
  ["Asia/Hong_Kong", "Hong Kong", "🇭🇰"],
  ["Asia/Taipei", "Taiwan", "🇹🇼"],
  ["Asia/Bangkok", "Thailand", "🇹🇭"],
  ["Asia/Ho_Chi_Minh", "Vietnam", "🇻🇳"],
  ["Asia/Kolkata", "India", "🇮🇳"],
  ["Asia/Dubai", "Dubai", "🇦🇪"],
  ["Australia/Sydney", "Sydney", "🇦🇺"],
  ["Australia/Perth", "Perth", "🇦🇺"],
  ["Pacific/Auckland", "New Zealand", "🇳🇿"],
  ["Europe/London", "London", "🇬🇧"],
  ["Europe/Paris", "Paris", "🇫🇷"],
  ["Europe/Berlin", "Berlin", "🇩🇪"],
];

const CLASSES = [
  "Swordman",
  "Archer",
  "Gunner",
  "Shaman",
  "Extreme",
  "Brawler",
];

const DEFAULT_RAIDS = [
  {
    id: "sonya",
    name: "Sonya",
    type: "BOSS RAID",
    schedule: "Every Wednesday",
    day: 3,
    hour: 21,
    minute: 0,
    updatedAt: null,
  },
  {
    id: "geomancer",
    name: "Geomancer",
    type: "MINI BOSS",
    schedule: "Every Day",
    day: null,
    hour: 12,
    minute: 0,
    updatedAt: null,
  },
  {
    id: "reflector",
    name: "Reflector",
    type: "MINI BOSS",
    schedule: "Every Day",
    day: null,
    hour: 12,
    minute: 0,
    updatedAt: null,
  },
  {
    id: "giant-hawk",
    name: "Giant Hawk",
    type: "MINI BOSS",
    schedule: "Every Day",
    day: null,
    hour: 12,
    minute: 0,
    updatedAt: null,
  },
];

const DEFAULT_SETTINGS = {
  sonyaPoints: 1,
  miniBossPoints: 0.2,
  eligibilityScore: 6,
};

/* ============================================================
   TIME HELPERS
============================================================ */

function getLocalTimezone() {
  return (
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/Los_Angeles"
  );
}

function getTimezoneLabel(timezone) {
  const found = TIMEZONES.find(
    ([zone]) => zone === timezone
  );

  return found ? found[1] : timezone;
}

function getTimezoneFlag(timezone) {
  const found = TIMEZONES.find(
    ([zone]) => zone === timezone
  );

  return found ? found[2] : "🌎";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function get12Hour(hour) {
  if (hour === 0) return 12;
  if (hour > 12) return hour - 12;
  return hour;
}

function getPeriod(hour) {
  return hour >= 12 ? "PM" : "AM";
}

function to24Hour(hour, period) {
  let h = Number(hour);

  if (!Number.isFinite(h)) {
    h = 12;
  }

  h = Math.max(
    1,
    Math.min(12, Math.trunc(h))
  );

  if (period === "AM") {
    return h === 12 ? 0 : h;
  }

  return h === 12 ? 12 : h + 12;
}

function getTimezoneOffset(timezone, date) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(date);

  const values = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  });

  const asUTC = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  return Math.round(
    (asUTC - date.getTime()) / 60000
  );
}

function philippinesDateToUTC(
  year,
  month,
  day,
  hour,
  minute
) {
  let guess = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    )
  );

  for (let i = 0; i < 4; i++) {
    const offset =
      getTimezoneOffset(
        PH_TIMEZONE,
        guess
      );

    guess = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        0
      ) -
        offset * 60000
    );
  }

  return guess;
}

function getTodayPhilippines() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(new Date());

  const result = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      result[part.type] = Number(part.value);
    }
  });

  return result;
}

function getNextOccurrence(raid) {
  const today = getTodayPhilippines();

  let {
    year,
    month,
    day,
  } = today;

  if (raid.day === null) {
    const todayOccurrence =
      philippinesDateToUTC(
        year,
        month,
        day,
        Number(raid.hour),
        Number(raid.minute)
      );

    if (
      todayOccurrence.getTime() >=
      Date.now()
    ) {
      return todayOccurrence;
    }

    return philippinesDateToUTC(
      year,
      month,
      day + 1,
      Number(raid.hour),
      Number(raid.minute)
    );
  }

  const todayUTC = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  const currentDay =
    todayUTC.getUTCDay();

  let daysUntil =
    Number(raid.day) - currentDay;

  if (daysUntil < 0) {
    daysUntil += 7;
  }

  let occurrence =
    philippinesDateToUTC(
      year,
      month,
      day + daysUntil,
      Number(raid.hour),
      Number(raid.minute)
    );

  if (
    occurrence.getTime() <
    Date.now()
  ) {
    occurrence =
      philippinesDateToUTC(
        year,
        month,
        day + daysUntil + 7,
        Number(raid.hour),
        Number(raid.minute)
      );
  }

  return occurrence;
}

function convertRaidTime(
  raid,
  timezone
) {
  const utcDate =
    getNextOccurrence(raid);

  const dateString =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    ).format(utcDate);

  const timeString =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }
    ).format(utcDate);

  const day =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        weekday: "long",
      }
    ).format(utcDate);

  return {
    date: dateString,
    time: timeString,
    day,
  };
}

function getPhilippinesDisplay(raid) {
  return `${get12Hour(
    Number(raid.hour)
  )}:${pad(
    Number(raid.minute)
  )} ${getPeriod(
    Number(raid.hour)
  )}`;
}

function formatTimestamp(value) {
  if (!value) return "—";

  let date;

  if (
    typeof value?.toDate ===
    "function"
  ) {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function getDateKey() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: PH_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(new Date());

  const values = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  });

  return `${values.year}-${values.month}-${values.day}`;
}

/* ============================================================
   LOGIN
============================================================ */

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
    } catch (err) {
      console.error(err);

      let message =
        "Invalid admin login.";

      if (
        err.code ===
        "auth/invalid-credential"
      ) {
        message =
          "Invalid email or password.";
      }

      if (
        err.code ===
        "auth/user-not-found"
      ) {
        message =
          "Admin account does not exist.";
      }

      if (
        err.code ===
        "auth/wrong-password"
      ) {
        message =
          "Incorrect password.";
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form
        className="login-card"
        onSubmit={login}
      >
        <div className="eyebrow">
          RAN ONLINE EP7
        </div>

        <h1>
          Attendance
          <span> Admin</span>
        </h1>

        <p>
          Administrator access is required
          to modify attendance records.
        </p>

        <label>
          EMAIL
          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            autoComplete="username"
            required
          />
        </label>

        <label>
          PASSWORD
          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <button
          className="primary-button full"
          disabled={loading}
        >
          {loading
            ? "SIGNING IN..."
            : "ADMIN LOGIN"}
        </button>

        <div className="login-note">
          Firebase admin authentication.
        </div>
      </form>
    </div>
  );
}

/* ============================================================
   RAID CARD
   PUBLIC EDITING
============================================================ */

function RaidCard({
  raid,
  targetTimezone,
  onUpdate,
}) {
  const converted = useMemo(
    () =>
      convertRaidTime(
        raid,
        targetTimezone
      ),
    [raid, targetTimezone]
  );

  const [
    hourInput,
    setHourInput,
  ] = useState(
    String(
      get12Hour(
        Number(raid.hour)
      )
    ).padStart(2, "0")
  );

  const [
    minuteInput,
    setMinuteInput,
  ] = useState(
    String(
      Number(raid.minute)
    ).padStart(2, "0")
  );

  const [
    period,
    setPeriod,
  ] = useState(
    getPeriod(
      Number(raid.hour)
    )
  );

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    setHourInput(
      String(
        get12Hour(
          Number(raid.hour)
        )
      ).padStart(2, "0")
    );

    setMinuteInput(
      String(
        Number(raid.minute)
      ).padStart(2, "0")
    );

    setPeriod(
      getPeriod(
        Number(raid.hour)
      )
    );
  }, [
    raid.hour,
    raid.minute,
  ]);

  async function save() {
    let h = Number(hourInput);
    let m = Number(minuteInput);

    if (!Number.isFinite(h)) h = 12;
    if (!Number.isFinite(m)) m = 0;

    h = Math.max(
      1,
      Math.min(12, Math.trunc(h))
    );

    m = Math.max(
      0,
      Math.min(59, Math.trunc(m))
    );

    const updatedRaid = {
      ...raid,
      hour: to24Hour(
        h,
        period
      ),
      minute: m,
      updatedAt:
        new Date().toISOString(),
    };

    setSaving(true);
    setMessage("");

    try {
      await onUpdate(
        raid.id,
        updatedRaid
      );

      setMessage(
        "Raid time saved."
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to save raid time. Check your Firebase Firestore rules."
      );
    } finally {
      setSaving(false);

      setTimeout(
        () => setMessage(""),
        3000
      );
    }
  }

  return (
    <article className="raid-card">
      <div className="boss-art">
        <div className="tbd">
          {raid.name}
        </div>

        <div className="boss-art-bottom">
          RAN ONLINE EP7
        </div>
      </div>

      <div className="raid-main">
        <div className="raid-type">
          {raid.type}
        </div>

        <h2>{raid.name}</h2>

        <div className="raid-frequency">
          {raid.schedule}
        </div>

        <div className="conversion-grid">
          <div className="time-panel">
            <div className="panel-label">
              🇵🇭 PHILIPPINES
              <small>RAID TIME</small>
            </div>

            <div className="big-time">
              {getPhilippinesDisplay(
                raid
              )}
            </div>

            <div className="time-sub">
              Asia / Manila
            </div>
          </div>

          <div className="time-panel local">
            <div className="panel-label">
              {getTimezoneFlag(
                targetTimezone
              )}{" "}
              YOUR LOCAL TIME
              <small>CONVERTED</small>
            </div>

            <div className="big-time">
              {converted.time}
            </div>

            <div className="time-sub">
              {getTimezoneLabel(
                targetTimezone
              )}{" "}
              •{" "}
              {converted.day}
            </div>
          </div>
        </div>

        <div className="edit-area">
          <div className="edit-label">
            EDIT PHILIPPINES RAID TIME
            <small>
              No login required
            </small>
          </div>

          <div className="edit-controls">
            <div className="number-control">
              <input
                type="text"
                inputMode="numeric"
                value={hourInput}
                onChange={(e) => {
                  const value =
                    e.target.value.replace(
                      /\D/g,
                      ""
                    );

                  if (
                    value.length <= 2
                  ) {
                    setHourInput(
                      value
                    );
                  }
                }}
              />

              <span>:</span>

              <input
                type="text"
                inputMode="numeric"
                value={minuteInput}
                onChange={(e) => {
                  const value =
                    e.target.value.replace(
                      /\D/g,
                      ""
                    );

                  if (
                    value.length <= 2
                  ) {
                    setMinuteInput(
                      value
                    );
                  }
                }}
              />

              <select
                value={period}
                onChange={(e) =>
                  setPeriod(
                    e.target.value
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
            </div>

            <button
              className="primary-button"
              onClick={save}
              disabled={saving}
            >
              {saving
                ? "SAVING..."
                : "SAVE"}
            </button>
          </div>

          {message && (
            <div className="raid-save-message">
              {message}
            </div>
          )}

          <div className="raid-updated">
            <strong>
              LAST UPDATED
            </strong>

            <span>
              {formatTimestamp(
                raid.updatedAt
              )}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ============================================================
   RAID PAGE
============================================================ */

function RaidPage({
  raids,
  onUpdateRaid,
}) {
  const localTimezone =
    getLocalTimezone();

  const [
    customLocations,
    setCustomLocations,
  ] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem(
          "ran-bh-locations"
        ) || "[]"
      );
    } catch {
      return [];
    }
  });

  const [
    selectedLocation,
    setSelectedLocation,
  ] = useState("");

  function addLocation() {
    if (
      !selectedLocation ||
      customLocations.includes(
        selectedLocation
      )
    ) {
      return;
    }

    const next = [
      ...customLocations,
      selectedLocation,
    ];

    setCustomLocations(next);

    localStorage.setItem(
      "ran-bh-locations",
      JSON.stringify(next)
    );

    setSelectedLocation("");
  }

  function removeLocation(zone) {
    const next =
      customLocations.filter(
        (x) => x !== zone
      );

    setCustomLocations(next);

    localStorage.setItem(
      "ran-bh-locations",
      JSON.stringify(next)
    );
  }

  return (
    <main className="page">
      <div className="notice">
        <div className="notice-icon">
          🇵🇭
        </div>

        <div>
          <strong>
            All raid schedules use
            Philippines time.
          </strong>

          <span>
            Anyone can update the raid
            schedule. No login required.
          </span>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <div className="section-label">
            BOSS HUNT
          </div>

          <h2>
            Raid Schedule
          </h2>

          <p className="subtext">
            Each boss has its own last
            updated timestamp.
          </p>
        </div>
      </div>

      <div className="raid-list">
        {raids.map((raid) => (
          <RaidCard
            key={raid.id}
            raid={raid}
            targetTimezone={
              localTimezone
            }
            onUpdate={
              onUpdateRaid
            }
          />
        ))}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="section-label">
              OPTIONAL
            </div>

            <h2>
              Custom Raid Locations
            </h2>

            <p>
              Add additional locations to
              compare the raid schedule.
            </p>
          </div>

          <div className="location-add">
            <select
              value={
                selectedLocation
              }
              onChange={(e) =>
                setSelectedLocation(
                  e.target.value
                )
              }
            >
              <option value="">
                Select location
              </option>

              {TIMEZONES.map(
                ([
                  zone,
                  name,
                  flag,
                ]) => (
                  <option
                    key={zone}
                    value={zone}
                  >
                    {flag} {name}
                  </option>
                )
              )}
            </select>

            <button
              className="secondary-button"
              onClick={
                addLocation
              }
            >
              + ADD
            </button>
          </div>
        </div>

        <div className="location-list">
          {customLocations.map(
            (zone) => (
              <div
                className="location-chip"
                key={zone}
              >
                <span>
                  {getTimezoneFlag(
                    zone
                  )}
                </span>

                <div>
                  <strong>
                    {getTimezoneLabel(
                      zone
                    )}
                  </strong>

                  <small>
                    {zone}
                  </small>
                </div>

                <button
                  onClick={() =>
                    removeLocation(
                      zone
                    )
                  }
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      </section>

      {customLocations.length >
        0 && (
        <section className="panel">
          <div className="section-label">
            CUSTOM VIEW
          </div>

          <h2>
            Raid Times by Location
          </h2>

          <div className="table-scroll">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>BOSS</th>
                  <th>
                    🇵🇭 PHILIPPINES
                  </th>

                  {customLocations.map(
                    (zone) => (
                      <th key={zone}>
                        {
                          getTimezoneFlag(
                            zone
                          )
                        }{" "}
                        {
                          getTimezoneLabel(
                            zone
                          )
                        }
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {raids.map(
                  (raid) => (
                    <tr
                      key={
                        raid.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            raid.name
                          }
                        </strong>

                        <small>
                          {
                            raid.schedule
                          }
                        </small>
                      </td>

                      <td>
                        <strong>
                          {getPhilippinesDisplay(
                            raid
                          )}
                        </strong>
                      </td>

                      {customLocations.map(
                        (zone) => {
                          const converted =
                            convertRaidTime(
                              raid,
                              zone
                            );

                          return (
                            <td
                              key={
                                zone
                              }
                            >
                              <strong>
                                {
                                  converted.time
                                }
                              </strong>

                              <small>
                                {
                                  converted.day
                                }
                              </small>
                            </td>
                          );
                        }
                      )}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

/* ============================================================
   ATTENDANCE
============================================================ */

function AttendancePage({
  players,
  history,
  settings,
  admin,
  onAddPlayer,
  onUpdatePlayer,
  onDeletePlayer,
  onAddAttendance,
  onDeleteHistory,
}) {
  const [search, setSearch] =
    useState("");

  const [classFilter, setClassFilter] =
    useState("");

  const [weaponFilter, setWeaponFilter] =
    useState("");

  const [claimFilter, setClaimFilter] =
    useState("");

  const [selectedPlayer, setSelectedPlayer] =
    useState(null);

  const [selectedBosses, setSelectedBosses] =
    useState([]);

  const [showLogin, setShowLogin] =
    useState(false);

  const [newIGN, setNewIGN] =
    useState("");

  const [newClass, setNewClass] =
    useState("Swordman");

  const [newWeapon, setNewWeapon] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [
    sonyaPoints,
    setSonyaPoints,
  ] = useState(
    String(settings.sonyaPoints)
  );

  const [
    miniPoints,
    setMiniPoints,
  ] = useState(
    String(settings.miniBossPoints)
  );

  const [
    eligibility,
    setEligibility,
  ] = useState(
    String(
      settings.eligibilityScore
    )
  );

  useEffect(() => {
    setSonyaPoints(
      String(settings.sonyaPoints)
    );

    setMiniPoints(
      String(settings.miniBossPoints)
    );

    setEligibility(
      String(
        settings.eligibilityScore
      )
    );
  }, [settings]);

  /* ----------------------------------------------------------
     WEAPON LIST
  ---------------------------------------------------------- */

  const availableWeapons =
    useMemo(() => {
      const values =
        players
          .map(
            (player) =>
              player.weapon
          )
          .filter(Boolean)
          .map((weapon) =>
            String(
              weapon
            ).trim()
          )
          .filter(Boolean);

      return [
        ...new Set(values),
      ].sort((a, b) =>
        a.localeCompare(b)
      );
    }, [players]);

  /* ----------------------------------------------------------
     FILTERED PLAYERS
  ---------------------------------------------------------- */

  const filteredPlayers =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return players.filter(
        (player) => {
          if (
            term &&
            !String(
              player.ign || ""
            )
              .toLowerCase()
              .includes(term)
          ) {
            return false;
          }

          if (
            classFilter &&
            player.className !==
              classFilter
          ) {
            return false;
          }

          if (
            weaponFilter &&
            player.weapon !==
              weaponFilter
          ) {
            return false;
          }

          const eligible =
            Number(
              player.totalScore || 0
            ) >=
            Number(
              settings.eligibilityScore
            );

          if (
            claimFilter ===
            "eligible" &&
            !eligible
          ) {
            return false;
          }

          if (
            claimFilter ===
            "not-eligible" &&
            eligible
          ) {
            return false;
          }

          return true;
        }
      );
    }, [
      players,
      search,
      classFilter,
      weaponFilter,
      claimFilter,
      settings,
    ]);

  function selectPlayer(player) {
    setSelectedPlayer(player);
    setSelectedBosses([]);
  }

  function toggleBoss(id) {
    setSelectedBosses(
      (current) =>
        current.includes(id)
          ? current.filter(
              (x) => x !== id
            )
          : [
              ...current,
              id,
            ]
    );
  }

  /* ----------------------------------------------------------
     SAVE ATTENDANCE
  ---------------------------------------------------------- */

  async function saveAttendance() {
    if (
      !admin ||
      !selectedPlayer ||
      selectedBosses.length ===
        0
    ) {
      return;
    }

    const bosses =
      selectedBosses.map(
        (id) => {
          const boss =
            DEFAULT_RAIDS.find(
              (x) =>
                x.id === id
            );

          const points =
            id === "sonya"
              ? Number(
                  settings.sonyaPoints
                )
              : Number(
                  settings.miniBossPoints
                );

          return {
            id,
            name:
              boss?.name || id,
            points,
          };
        }
      );

    const points =
      bosses.reduce(
        (sum, boss) =>
          sum +
          Number(
            boss.points
          ),
        0
      );

    try {
      await onAddAttendance(
        selectedPlayer,
        bosses,
        points
      );

      setSelectedBosses([]);

      setMessage(
        `${selectedPlayer.ign} attendance saved. +${points.toFixed(
          2
        )} points.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to save attendance."
      );
    }

    setTimeout(
      () => setMessage(""),
      3000
    );
  }

  /* ----------------------------------------------------------
     ADD PLAYER
  ---------------------------------------------------------- */

  async function addPlayer() {
    if (!admin) return;

    const ign =
      newIGN.trim();

    if (!ign) return;

    try {
      await onAddPlayer({
        ign,
        className: newClass,
        weapon: newWeapon.trim(),
      });

      setNewIGN("");
      setNewWeapon("");

      setMessage(
        `${ign} added successfully.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to add player."
      );
    }

    setTimeout(
      () => setMessage(""),
      3000
    );
  }

  /* ----------------------------------------------------------
     SETTINGS
  ---------------------------------------------------------- */

  async function saveSettings() {
    if (!admin) return;

    const values = {
      sonyaPoints:
        Number(sonyaPoints),
      miniBossPoints:
        Number(miniPoints),
      eligibilityScore:
        Number(eligibility),
    };

    if (
      !Number.isFinite(
        values.sonyaPoints
      ) ||
      !Number.isFinite(
        values.miniBossPoints
      ) ||
      !Number.isFinite(
        values.eligibilityScore
      )
    ) {
      return;
    }

    try {
      await setDoc(
        doc(
          db,
          "settings",
          "attendance"
        ),
        {
          ...values,
          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      setMessage(
        "Attendance settings saved."
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to save settings."
      );
    }

    setTimeout(
      () => setMessage(""),
      3000
    );
  }

  /* ----------------------------------------------------------
     EXPORT
  ---------------------------------------------------------- */

  function exportXLSX() {
    const playerRows =
      players.map(
        (player) => ({
          IGN: player.ign,
          Class:
            player.className,
          "Preferred Weapon":
            player.weapon,
          Score: Number(
            player.totalScore || 0
          ),
          Eligible:
            Number(
              player.totalScore || 0
            ) >=
            Number(
              settings.eligibilityScore
            )
              ? "YES"
              : "NO",
          "Last Updated":
            formatTimestamp(
              player.updatedAt
            ),
        })
      );

    const historyRows =
      history.map(
        (item) => ({
          IGN: item.ign,
          Date: item.dateKey,
          Bosses:
            item.bosses
              ?.map(
                (b) =>
                  b.name
              )
              .join(", "),
          Points: Number(
            item.points || 0
          ),
          "Recorded At":
            formatTimestamp(
              item.createdAt
            ),
        })
      );

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        playerRows
      ),
      "Attendance"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        historyRows
      ),
      "History"
    );

    XLSX.writeFile(
      wb,
      `RAN_EP7_Attendance_Backup_${getDateKey()}.xlsx`
    );
  }

  /* ----------------------------------------------------------
     IMPORT
  ---------------------------------------------------------- */

  async function importXLSX(event) {
    if (!admin) return;

    const file =
      event.target.files?.[0];

    if (!file) return;

    try {
      const buffer =
        await file.arrayBuffer();

      const workbook =
        XLSX.read(buffer, {
          type: "array",
        });

      const sheet =
        workbook.Sheets[
          "Attendance"
        ] ||
        workbook.Sheets[
          workbook.SheetNames[0]
        ];

      if (!sheet) return;

      const rows =
        XLSX.utils.sheet_to_json(
          sheet
        );

      for (const row of rows) {
        const ign =
          String(
            row.IGN || ""
          ).trim();

        if (!ign) continue;

        const existing =
          players.find(
            (p) =>
              String(
                p.ign || ""
              ).toLowerCase() ===
              ign.toLowerCase()
          );

        const score =
          Number(
            row.Score || 0
          );

        const data = {
          ign,
          className:
            String(
              row.Class || ""
            ),
          weapon:
            String(
              row[
                "Preferred Weapon"
              ] || ""
            ),
          totalScore:
            Number.isFinite(score)
              ? score
              : 0,
          updatedAt:
            serverTimestamp(),
        };

        if (existing) {
          await updateDoc(
            doc(
              db,
              "attendancePlayers",
              existing.id
            ),
            data
          );
        } else {
          await addDoc(
            collection(
              db,
              "attendancePlayers"
            ),
            {
              ...data,
              createdAt:
                serverTimestamp(),
            }
          );
        }
      }

      event.target.value = "";

      setMessage(
        "XLSX attendance backup imported."
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to import XLSX."
      );
    }

    setTimeout(
      () => setMessage(""),
      3000
    );
  }

  const selectedHistory =
    selectedPlayer
      ? history.filter(
          (item) =>
            item.playerId ===
            selectedPlayer.id
        )
      : [];

  return (
    <main className="page attendance-page">
      <div className="page-title-row">
        <div>
          <div className="section-label">
            BH ATTENDANCE
          </div>

          <h2>
            Attendance Sheet
          </h2>

          <p>
            {admin
              ? "Administrator mode • attendance changes are protected by Firebase."
              : "View-only mode • only administrators can modify attendance."}
          </p>
        </div>

        <div className="admin-actions">
          {admin ? (
            <>
              <span className="admin-badge">
                🔐 ADMIN
              </span>

              <button
                className="secondary-button"
                onClick={() =>
                  signOut(auth)
                }
              >
                LOGOUT
              </button>
            </>
          ) : (
            <button
              className="primary-button"
              onClick={() =>
                setShowLogin(true)
              }
            >
              ADMIN LOGIN
            </button>
          )}
        </div>
      </div>

      <div className="score-summary">
        <div>
          <span>PLAYERS</span>
          <strong>
            {players.length}
          </strong>
        </div>

        <div>
          <span>ELIGIBLE</span>
          <strong>
            {
              players.filter(
                (p) =>
                  Number(
                    p.totalScore || 0
                  ) >=
                  Number(
                    settings.eligibilityScore
                  )
              ).length
            }
          </strong>
        </div>

        <div>
          <span>SONYA</span>
          <strong>
            {settings.sonyaPoints}
          </strong>
        </div>

        <div>
          <span>MINI BOSS</span>
          <strong>
            {
              settings.miniBossPoints
            }
          </strong>
        </div>

        <div>
          <span>REQUIRED</span>
          <strong>
            {
              settings.eligibilityScore
            }
          </strong>
        </div>
      </div>

      {/* ======================================================
          ADMIN ADD PLAYER
      ====================================================== */}

      {admin && (
        <section className="panel attendance-form">
          <div className="panel-heading">
            <div>
              <div className="section-label">
                ADMIN
              </div>

              <h3>
                Add IGN
              </h3>

              <p>
                Add the player first, then
                record attendance.
              </p>
            </div>
          </div>

          <div className="form-grid compact">
            <label>
              IGN
              <input
                value={newIGN}
                onChange={(e) =>
                  setNewIGN(
                    e.target.value
                  )
                }
                placeholder="Player IGN"
              />
            </label>

            <label>
              CLASS
              <select
                value={newClass}
                onChange={(e) =>
                  setNewClass(
                    e.target.value
                  )
                }
              >
                {CLASSES.map(
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
            </label>

            <label>
              PREFERRED WEAPON
              <input
                list="weapon-options"
                value={newWeapon}
                onChange={(e) =>
                  setNewWeapon(
                    e.target.value
                  )
                }
                placeholder="Type or select weapon"
              />

              <datalist id="weapon-options">
                {availableWeapons.map(
                  (weapon) => (
                    <option
                      key={weapon}
                      value={weapon}
                    />
                  )
                )}
              </datalist>
            </label>

            <button
              className="primary-button"
              onClick={
                addPlayer
              }
            >
              + ADD IGN
            </button>
          </div>
        </section>
      )}

      {/* ======================================================
          SETTINGS
      ====================================================== */}

      {admin && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <div className="section-label">
                SETTINGS
              </div>

              <h3>
                Attendance Points
              </h3>
            </div>
          </div>

          <div className="settings-grid">
            <label>
              SONYA POINTS
              <input
                type="number"
                step="0.1"
                value={sonyaPoints}
                onChange={(e) =>
                  setSonyaPoints(
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              MINI BOSS POINTS
              <input
                type="number"
                step="0.1"
                value={miniPoints}
                onChange={(e) =>
                  setMiniPoints(
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              ELIGIBILITY SCORE
              <input
                type="number"
                step="0.1"
                value={eligibility}
                onChange={(e) =>
                  setEligibility(
                    e.target.value
                  )
                }
              />
            </label>

            <button
              className="primary-button"
              onClick={
                saveSettings
              }
            >
              SAVE SETTINGS
            </button>
          </div>
        </section>
      )}

      {/* ======================================================
          RECORD ATTENDANCE
      ====================================================== */}

      <section className="attendance-entry panel">
        <div className="panel-heading">
          <div>
            <div className="section-label">
              RECORD ATTENDANCE
            </div>

            <h3>
              Find Player
            </h3>

            <p>
              Search the attendance table,
              select an IGN, choose bosses,
              then save.
            </p>
          </div>
        </div>

        <div className="filter-grid">
          <input
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Search IGN..."
          />

          <select
            value={classFilter}
            onChange={(e) =>
              setClassFilter(
                e.target.value
              )
            }
          >
            <option value="">
              All Classes
            </option>

            {CLASSES.map(
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
            value={weaponFilter}
            onChange={(e) =>
              setWeaponFilter(
                e.target.value
              )
            }
          >
            <option value="">
              All Weapons
            </option>

            {availableWeapons.map(
              (weapon) => (
                <option
                  key={weapon}
                  value={weapon}
                >
                  {weapon}
                </option>
              )
            )}
          </select>

          <select
            value={claimFilter}
            onChange={(e) =>
              setClaimFilter(
                e.target.value
              )
            }
          >
            <option value="">
              All Eligibility
            </option>

            <option value="eligible">
              Eligible
            </option>

            <option value="not-eligible">
              Not Eligible
            </option>
          </select>
        </div>

        {/* TABLE */}
        <div className="table-scroll">
          <table className="attendance-table record-table">
            <thead>
              <tr>
                <th>IGN</th>
                <th>CLASS</th>
                <th>WEAPON</th>
                <th>SCORE</th>
                <th>CLAIM</th>
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.map(
                (player) => (
                  <tr
                    key={
                      player.id
                    }
                    className={
                      selectedPlayer?.id ===
                      player.id
                        ? "selected-row"
                        : ""
                    }
                    onClick={() =>
                      selectPlayer(
                        player
                      )
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
                        player.className
                      }
                    </td>

                    <td>
                      {
                        player.weapon ||
                        "—"
                      }
                    </td>

                    <td>
                      <strong>
                        {Number(
                          player.totalScore ||
                            0
                        ).toFixed(
                          2
                        )}
                      </strong>
                    </td>

                    <td>
                      {Number(
                        player.totalScore ||
                          0
                      ) >=
                      Number(
                        settings.eligibilityScore
                      ) ? (
                        <span className="eligible-badge small">
                          ✓ ELIGIBLE
                        </span>
                      ) : (
                        <span className="not-eligible">
                          NOT YET
                        </span>
                      )}
                    </td>
                  </tr>
                )
              )}

              {filteredPlayers.length ===
                0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="empty-table"
                  >
                    No players found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* SELECTED PLAYER */}
        {selectedPlayer && (
          <div className="attendance-selector">
            <div className="selected-player">
              <div>
                <span>
                  SELECTED IGN
                </span>

                <strong>
                  {
                    selectedPlayer.ign
                  }
                </strong>

                <small>
                  {
                    selectedPlayer.className
                  }{" "}
                  •{" "}
                  {
                    selectedPlayer.weapon ||
                    "No weapon"
                  }
                </small>
              </div>

              <div className="score-large">
                {Number(
                  selectedPlayer.totalScore ||
                    0
                ).toFixed(2)}

                {Number(
                  selectedPlayer.totalScore ||
                    0
                ) >=
                  Number(
                    settings.eligibilityScore
                  ) && (
                  <small>
                    SONYA WEAPON ELIGIBLE
                  </small>
                )}
              </div>
            </div>

            <div className="boss-check-grid">
              {DEFAULT_RAIDS.map(
                (boss) => {
                  const checked =
                    selectedBosses.includes(
                      boss.id
                    );

                  const points =
                    boss.id ===
                    "sonya"
                      ? settings.sonyaPoints
                      : settings.miniBossPoints;

                  return (
                    <label
                      className={`boss-check ${
                        checked
                          ? "checked"
                          : ""
                      }`}
                      key={
                        boss.id
                      }
                    >
                      <input
                        type="checkbox"
                        checked={
                          checked
                        }
                        disabled={!admin}
                        onChange={() =>
                          toggleBoss(
                            boss.id
                          )
                        }
                      />

                      <span className="check-box">
                        {checked
                          ? "✓"
                          : ""}
                      </span>

                      <span>
                        <strong>
                          {
                            boss.name
                          }
                        </strong>

                        <small>
                          +
                          {Number(
                            points
                          ).toFixed(
                            2
                          )}{" "}
                          points
                        </small>
                      </span>
                    </label>
                  );
                }
              )}
            </div>

            <div className="save-attendance-row">
              <div>
                <span>
                  THIS SAVE
                </span>

                <strong>
                  +
                  {selectedBosses
                    .reduce(
                      (
                        total,
                        id
                      ) =>
                        total +
                        (id ===
                        "sonya"
                          ? Number(
                              settings.sonyaPoints
                            )
                          : Number(
                              settings.miniBossPoints
                            )),
                      0
                    )
                    .toFixed(2)}
                </strong>
              </div>

              {admin ? (
                <button
                  className="primary-button"
                  disabled={
                    selectedBosses.length ===
                    0
                  }
                  onClick={
                    saveAttendance
                  }
                >
                  SAVE ATTENDANCE
                </button>
              ) : (
                <span className="public-note">
                  Login required to
                  record attendance.
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ======================================================
          PLAYER HISTORY
      ====================================================== */}

      {selectedPlayer && (
        <section className="panel history-panel">
          <div className="panel-heading">
            <div>
              <div className="section-label">
                PLAYER HISTORY
              </div>

              <h3>
                {
                  selectedPlayer.ign
                }
              </h3>

              <p>
                Every attendance save is
                stored permanently in
                Firestore.
              </p>
            </div>
          </div>

          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>BOSSES</th>
                  <th>POINTS</th>
                  <th>RECORDED</th>

                  {admin && (
                    <th>ACTION</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {selectedHistory.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={
                        admin ? 5 : 4
                      }
                      className="empty-table"
                    >
                      No attendance
                      history yet.
                    </td>
                  </tr>
                ) : (
                  selectedHistory.map(
                    (item) => (
                      <tr
                        key={
                          item.id
                        }
                      >
                        <td>
                          {
                            item.dateKey
                          }
                        </td>

                        <td>
                          {item.bosses
                            ?.map(
                              (
                                b
                              ) =>
                                b.name
                            )
                            .join(
                              ", "
                            )}
                        </td>

                        <td className="points-cell">
                          +
                          {Number(
                            item.points ||
                              0
                          ).toFixed(
                            2
                          )}
                        </td>

                        <td>
                          {formatTimestamp(
                            item.createdAt
                          )}
                        </td>

                        {admin && (
                          <td>
                            <button
                              className="danger-button"
                              onClick={() =>
                                onDeleteHistory(
                                  item.id,
                                  selectedPlayer.id
                                )
                              }
                            >
                              DELETE
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ======================================================
          DATABASE
      ====================================================== */}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="section-label">
              ATTENDANCE DATABASE
            </div>

            <h3>
              Current Scores
            </h3>

            <p>
              Administrators can edit player
              information directly.
            </p>
          </div>

          {admin && (
            <div className="backup-actions">
              <button
                className="secondary-button"
                onClick={
                  exportXLSX
                }
              >
                EXPORT XLSX
              </button>

              <label className="secondary-button file-button">
                IMPORT XLSX

                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={
                    importXLSX
                  }
                  hidden
                />
              </label>
            </div>
          )}
        </div>

        <div className="table-scroll">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>IGN</th>
                <th>CLASS</th>
                <th>WEAPON</th>
                <th>SCORE</th>
                <th>CLAIM</th>
                <th>LAST UPDATED</th>

                {admin && (
                  <th>ACTIONS</th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.map(
                (player) => (
                  <AttendanceRow
                    key={
                      player.id
                    }
                    player={
                      player
                    }
                    admin={
                      admin
                    }
                    eligibility={
                      settings.eligibilityScore
                    }
                    availableWeapons={
                      availableWeapons
                    }
                    onSelect={
                      selectPlayer
                    }
                    onUpdate={
                      onUpdatePlayer
                    }
                    onDelete={
                      onDeletePlayer
                    }
                  />
                )
              )}

              {filteredPlayers.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      admin ? 7 : 6
                    }
                    className="empty-table"
                  >
                    No players found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {message && (
        <div className="success-message">
          ✓ {message}
        </div>
      )}

      {showLogin && (
        <LoginModal
          onClose={() =>
            setShowLogin(false)
          }
        />
      )}
    </main>
  );
}

/* ============================================================
   ATTENDANCE ROW
============================================================ */

function AttendanceRow({
  player,
  admin,
  eligibility,
  availableWeapons,
  onSelect,
  onUpdate,
  onDelete,
}) {
  const [ign, setIgn] =
    useState(player.ign);

  const [className, setClassName] =
    useState(
      player.className
    );

  const [weapon, setWeapon] =
    useState(
      player.weapon || ""
    );

  useEffect(() => {
    setIgn(player.ign);

    setClassName(
      player.className
    );

    setWeapon(
      player.weapon || ""
    );
  }, [
    player.ign,
    player.className,
    player.weapon,
  ]);

  async function save() {
    const cleanIGN =
      ign.trim();

    if (!cleanIGN) return;

    await onUpdate(
      player.id,
      {
        ign: cleanIGN,
        className,
        weapon:
          weapon.trim(),
      }
    );
  }

  const score =
    Number(
      player.totalScore || 0
    );

  const eligible =
    score >=
    Number(eligibility);

  return (
    <tr>
      <td>
        {admin ? (
          <input
            className="table-input ign-input"
            value={ign}
            onChange={(e) =>
              setIgn(
                e.target.value
              )
            }
          />
        ) : (
          <button
            className="ign-link"
            onClick={() =>
              onSelect(
                player
              )
            }
          >
            {player.ign}
          </button>
        )}
      </td>

      <td>
        {admin ? (
          <select
            className="table-select"
            value={className}
            onChange={(e) =>
              setClassName(
                e.target.value
              )
            }
          >
            {CLASSES.map(
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
        ) : (
          player.className
        )}
      </td>

      <td>
        {admin ? (
          <>
            <input
              className="table-input"
              list={`weapon-list-${player.id}`}
              value={weapon}
              onChange={(e) =>
                setWeapon(
                  e.target.value
                )
              }
              placeholder="Type or select"
            />

            <datalist
              id={`weapon-list-${player.id}`}
            >
              {availableWeapons.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  />
                )
              )}
            </datalist>
          </>
        ) : (
          player.weapon ||
          "—"
        )}
      </td>

      <td>
        <strong className="score-value">
          {score.toFixed(2)}
        </strong>
      </td>

      <td>
        {eligible ? (
          <span className="eligible-badge small">
            ✓ ELIGIBLE
          </span>
        ) : (
          <span className="not-eligible">
            NOT YET
          </span>
        )}
      </td>

      <td className="updated-cell">
        {formatTimestamp(
          player.updatedAt
        )}
      </td>

      {admin && (
        <td>
          <div className="row-actions">
            <button
              className="mini-button"
              onClick={
                save
              }
            >
              SAVE
            </button>

            <button
              className="danger-button"
              onClick={() =>
                onDelete(
                  player.id
                )
              }
            >
              DELETE
            </button>

            <button
              className="mini-button"
              onClick={() =>
                onSelect(
                  player
                )
              }
            >
              HISTORY
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/* ============================================================
   LOGIN MODAL
============================================================ */

function LoginModal({
  onClose,
}) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function submit(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      onClose();
    } catch (err) {
      console.error(err);

      setError(
        "Invalid email or password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <form
        className="modal-card"
        onSubmit={submit}
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <div className="section-label">
          ADMIN ACCESS
        </div>

        <h2>
          Attendance Admin
        </h2>

        <input
          type="email"
          placeholder="Admin email"
          value={email}
          onChange={(e) =>
            setEmail(
              e.target.value
            )
          }
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(
              e.target.value
            )
          }
          required
        />

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            CANCEL
          </button>

          <button
            className="primary-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "LOGIN..."
              : "LOGIN"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================
   APP
============================================================ */

export default function App() {
  const [page, setPage] =
    useState("raid");

  const [user, setUser] =
    useState(null);

  const [isAdmin, setIsAdmin] =
    useState(false);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [raids, setRaids] =
    useState(DEFAULT_RAIDS);

  const [players, setPlayers] =
    useState([]);

  const [history, setHistory] =
    useState([]);

  const [settings, setSettings] =
    useState(
      DEFAULT_SETTINGS
    );

  /* ==========================================================
     AUTH
  ========================================================== */

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(
          currentUser
        );

        if (!currentUser) {
          setIsAdmin(false);
          setAuthLoading(false);
          return;
        }

        try {
          const adminDoc =
            await getDoc(
              doc(
                db,
                "admins",
                currentUser.uid
              )
            );

          const adminData =
            adminDoc.exists()
              ? adminDoc.data()
              : null;

          setIsAdmin(
            adminData?.active ===
              true
          );
        } catch (error) {
          console.error(
            "Admin lookup failed:",
            error
          );

          setIsAdmin(false);
        }

        setAuthLoading(false);
      }
    );
  }, []);

  /* ==========================================================
     RAID SCHEDULE
  ========================================================== */

  useEffect(() => {
    return onSnapshot(
      doc(
        db,
        "settings",
        "raidSchedule"
      ),
      (snapshot) => {
        if (
          snapshot.exists()
        ) {
          const data =
            snapshot.data();

          const storedRaids =
            Array.isArray(
              data.raids
            )
              ? data.raids
              : [];

          const merged =
            DEFAULT_RAIDS.map(
              (defaultRaid) => {
                const stored =
                  storedRaids.find(
                    (raid) =>
                      raid.id ===
                      defaultRaid.id
                  );

                return stored
                  ? {
                      ...defaultRaid,
                      ...stored,
                    }
                  : defaultRaid;
              }
            );

          setRaids(merged);
        } else {
          setRaids(
            DEFAULT_RAIDS
          );
        }
      },
      (error) => {
        console.error(
          "Raid schedule:",
          error
        );

        setRaids(
          DEFAULT_RAIDS
        );
      }
    );
  }, []);

  /* ==========================================================
     ATTENDANCE SETTINGS
  ========================================================== */

  useEffect(() => {
    return onSnapshot(
      doc(
        db,
        "settings",
        "attendance"
      ),
      (snapshot) => {
        if (
          snapshot.exists()
        ) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...snapshot.data(),
          });
        } else {
          setSettings(
            DEFAULT_SETTINGS
          );
        }
      },
      (error) => {
        console.error(
          "Attendance settings:",
          error
        );
      }
    );
  }, []);

  /* ==========================================================
     PLAYERS
  ========================================================== */

  useEffect(() => {
    return onSnapshot(
      query(
        collection(
          db,
          "attendancePlayers"
        ),
        orderBy(
          "ign",
          "asc"
        )
      ),
      (snapshot) => {
        setPlayers(
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          )
        );
      },
      (error) => {
        console.error(
          "Attendance players:",
          error
        );
      }
    );
  }, []);

  /* ==========================================================
     HISTORY
  ========================================================== */

  useEffect(() => {
    return onSnapshot(
      query(
        collection(
          db,
          "attendanceHistory"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      ),
      (snapshot) => {
        setHistory(
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          )
        );
      },
      (error) => {
        console.error(
          "Attendance history:",
          error
        );
      }
    );
  }, []);

  /* ==========================================================
     PUBLIC RAID UPDATE
  ========================================================== */

  async function updateRaid(
    id,
    updatedRaid
  ) {
    const next =
      raids.map((raid) =>
        raid.id === id
          ? updatedRaid
          : raid
      );

    await setDoc(
      doc(
        db,
        "settings",
        "raidSchedule"
      ),
      {
        raids: next,
        updatedAt:
          serverTimestamp(),
      },
      {
        merge: true,
      }
    );
  }

  /* ==========================================================
     ADD PLAYER
  ========================================================== */

  async function addPlayer(
    player
  ) {
    if (!isAdmin) {
      throw new Error(
        "Admin required."
      );
    }

    const duplicate =
      players.some(
        (existing) =>
          String(
            existing.ign || ""
          ).toLowerCase() ===
          String(
            player.ign || ""
          ).toLowerCase()
      );

    if (duplicate) {
      throw new Error(
        "IGN already exists."
      );
    }

    await addDoc(
      collection(
        db,
        "attendancePlayers"
      ),
      {
        ign: player.ign,
        className:
          player.className,
        weapon:
          player.weapon || "",
        totalScore: 0,
        eligible: false,
        createdAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp(),
      }
    );
  }

  /* ==========================================================
     UPDATE PLAYER
  ========================================================== */

  async function updatePlayer(
    id,
    changes
  ) {
    if (!isAdmin) return;

    await updateDoc(
      doc(
        db,
        "attendancePlayers",
        id
      ),
      {
        ...changes,
        updatedAt:
          serverTimestamp(),
      }
    );
  }

  /* ==========================================================
     DELETE PLAYER
  ========================================================== */

  async function deletePlayer(
    id
  ) {
    if (!isAdmin) return;

    const answer =
      window.confirm(
        "Delete this IGN? Attendance history will be kept."
      );

    if (!answer) return;

    await deleteDoc(
      doc(
        db,
        "attendancePlayers",
        id
      )
    );
  }

  /* ==========================================================
     ADD ATTENDANCE

     IMPORTANT:
     Score is recalculated from ALL history after adding.
     This avoids score corruption.
  ========================================================== */

  async function addAttendance(
    player,
    bosses,
    points
  ) {
    if (!isAdmin) {
      throw new Error(
        "Admin required."
      );
    }

    await addDoc(
      collection(
        db,
        "attendanceHistory"
      ),
      {
        playerId:
          player.id,
        ign:
          player.ign,
        dateKey:
          getDateKey(),
        bosses,
        points:
          Number(points),
        createdAt:
          serverTimestamp(),
        createdBy:
          user?.email || "",
      }
    );

    await recalculatePlayerScore(
      player.id
    );
  }

  /* ==========================================================
     RECALCULATE PLAYER SCORE
  ========================================================== */

  async function recalculatePlayerScore(
    playerId
  ) {
    const playerHistory =
      history.filter(
        (item) =>
          item.playerId ===
          playerId
      );

    const total =
      playerHistory.reduce(
        (sum, item) =>
          sum +
          Number(
            item.points || 0
          ),
        0
      );

    const score =
      Number(total.toFixed(2));

    await updateDoc(
      doc(
        db,
        "attendancePlayers",
        playerId
      ),
      {
        totalScore: score,
        eligible:
          score >=
          Number(
            settings.eligibilityScore
          ),
        updatedAt:
          serverTimestamp(),
      }
    );
  }

  /* ==========================================================
     DELETE HISTORY

     Score is recalculated from remaining history.
  ========================================================== */

  async function deleteHistory(
    historyId,
    playerId
  ) {
    if (!isAdmin) return;

    const answer =
      window.confirm(
        "Delete this attendance record?"
      );

    if (!answer) return;

    await deleteDoc(
      doc(
        db,
        "attendanceHistory",
        historyId
      )
    );

    /*
      Build score from local history
      minus the deleted record.
    */

    const remaining =
      history.filter(
        (item) =>
          item.playerId ===
            playerId &&
          item.id !==
            historyId
      );

    const total =
      remaining.reduce(
        (sum, item) =>
          sum +
          Number(
            item.points || 0
          ),
        0
      );

    const score =
      Number(
        total.toFixed(2)
      );

    await updateDoc(
      doc(
        db,
        "attendancePlayers",
        playerId
      ),
      {
        totalScore: score,
        eligible:
          score >=
          Number(
            settings.eligibilityScore
          ),
        updatedAt:
          serverTimestamp(),
      }
    );
  }

  /* ==========================================================
     LOADING
  ========================================================== */

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-box">
          <div className="eyebrow">
            RAN ONLINE EP7
          </div>

          <strong>
            Loading...
          </strong>
        </div>
      </div>
    );
  }

  /* ==========================================================
     APP
  ========================================================== */

  return (
    <div className="app">
      <header className="site-header">
        <div className="brand-area">
          <div className="eyebrow">
            RAN ONLINE EP7
          </div>

          <h1>
            BH RAID
            <span>
              {" "}
              SCHEDULE
            </span>
          </h1>

          <p>
            Philippines raid schedule
            converted to your timezone
          </p>
        </div>

        <div className="local-info">
          <span>
            YOUR LOCAL TIMEZONE
          </span>

          <strong>
            {getTimezoneFlag(
              getLocalTimezone()
            )}{" "}
            {getTimezoneLabel(
              getLocalTimezone()
            )}
          </strong>

          <small>
            Fixed Philippines raid times
            are converted automatically.
          </small>
        </div>
      </header>

      <nav className="main-nav">
        <button
          className={
            page === "raid"
              ? "active"
              : ""
          }
          onClick={() =>
            setPage("raid")
          }
        >
          RAID SCHEDULE
        </button>

        <button
          className={
            page ===
            "attendance"
              ? "active"
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
      </nav>

      {page === "raid" ? (
        <RaidPage
          raids={raids}
          onUpdateRaid={
            updateRaid
          }
        />
      ) : (
        <AttendancePage
          players={players}
          history={history}
          settings={settings}
          admin={isAdmin}
          onAddPlayer={
            addPlayer
          }
          onUpdatePlayer={
            updatePlayer
          }
          onDeletePlayer={
            deletePlayer
          }
          onAddAttendance={
            addAttendance
          }
          onDeleteHistory={
            deleteHistory
          }
        />
      )}

      <footer>
        RAN ONLINE EP7 • BH RAID
        SCHEDULE • ATTENDANCE
      </footer>
    </div>
  );
}

