
import React, {
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
  addDoc,
  updateDoc,
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
  },
  {
    id: "geomancer",
    name: "Geomancer",
    type: "MINI BOSS",
    schedule: "Every Day",
    day: null,
    hour: 12,
    minute: 0,
  },
  {
    id: "reflector",
    name: "Reflector",
    type: "MINI BOSS",
    schedule: "Every Day",
    day: null,
    hour: 12,
    minute: 0,
  },
  {
    id: "giant-hawk",
    name: "Giant Hawk",
    type: "MINI BOSS",
    schedule: "Every Day",
    day: null,
    hour: 12,
    minute: 0,
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
    Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone ||
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
      values[part.type] =
        Number(part.value);
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
      result[part.type] =
        Number(part.value);
    }
  });

  return result;
}

function getNextOccurrence(raid) {
  const today =
    getTodayPhilippines();

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
    Number(raid.day) -
    currentDay;

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
        day +
          daysUntil +
          7,
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
      values[part.type] =
        part.value;
    }
  });

  return `${values.year}-${values.month}-${values.day}`;
}

/* ============================================================
   SCORE CALCULATION
============================================================ */

/*
  IMPORTANT:

  totalScore is NOT trusted anymore.

  Firebase attendanceHistory is the source of truth.

  Every history document contains:

  playerId
  ign
  bosses
  points

  Score is calculated by adding history.points.
*/

function calculatePlayerScore(
  playerId,
  history
) {
  return history
    .filter(
      (item) =>
        item.playerId === playerId
    )
    .reduce(
      (total, item) =>
        total +
        Number(item.points || 0),
      0
    );
}

function calculateAllScores(
  players,
  history
) {
  return players.map(
    (player) => ({
      ...player,
      calculatedScore:
        calculatePlayerScore(
          player.id,
          history
        ),
    })
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
      const credential =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

      const adminDoc =
        await getDoc(
          doc(
            db,
            "admins",
            credential.user.uid
          )
        );

      if (
        !adminDoc.exists() ||
        adminDoc.data()
          ?.active !== true
      ) {
        await signOut(auth);

        setError(
          `Login succeeded, but this Firebase account is NOT registered as an admin. UID: ${credential.user.uid}`
        );

        return;
      }

      onClose();
    } catch (err) {
      console.error(err);

      setError(
        err.code ===
          "auth/invalid-credential"
          ? "Invalid email or password."
          : err.message ||
              "Unable to login."
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
            setEmail(e.target.value)
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
   RAID CARD
============================================================ */

function RaidCard({
  raid,
  targetTimezone,
  admin,
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

  const period =
    getPeriod(
      Number(raid.hour)
    );

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
  }, [
    raid.hour,
    raid.minute,
  ]);

  async function save() {
    let h = Number(hourInput);
    let m = Number(minuteInput);

    if (!Number.isFinite(h))
      h = 12;

    if (!Number.isFinite(m))
      m = 0;

    h = Math.max(
      1,
      Math.min(12, Math.trunc(h))
    );

    m = Math.max(
      0,
      Math.min(59, Math.trunc(m))
    );

    await onUpdate(
      raid.id,
      {
        ...raid,
        hour: to24Hour(
          h,
          period
        ),
        minute: m,
      }
    );
  }

  return (
    <article className="raid-card">
      <div className="boss-art">
        <div className="tbd">
          TBD
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
              <small>
                RAID TIME
              </small>
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
              <small>
                CONVERTED
              </small>
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

        <div className="raid-updated">
          <span>
            RAID SCHEDULE STATUS
          </span>

          <strong>
            {formatTimestamp(
              raid.updatedAt
            )}
          </strong>
        </div>

        {admin && (
          <div className="edit-area">
            <div className="edit-label">
              EDIT PHILIPPINES RAID TIME
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
                  onChange={async (
                    e
                  ) => {
                    let h =
                      Number(
                        hourInput
                      );

                    if (
                      !Number.isFinite(
                        h
                      )
                    )
                      h = 12;

                    await onUpdate(
                      raid.id,
                      {
                        ...raid,
                        hour:
                          to24Hour(
                            h,
                            e.target
                              .value
                          ),
                      }
                    );
                  }}
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
              >
                SAVE
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ============================================================
   RAID PAGE
============================================================ */

function RaidPage({
  raids,
  admin,
  onUpdateRaid,
  lastUpdated,
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
            Local times are converted
            automatically.
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
            Overall schedule last
            updated:{" "}
            {formatTimestamp(
              lastUpdated
            )}
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
            admin={admin}
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
              Add additional locations
              to compare raid times.
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
   ATTENDANCE PLAYER ROW
============================================================ */

function AttendancePlayerRow({
  player,
  score,
  eligible,
  admin,
  onSelect,
  onUpdate,
  onDelete,
  weaponOptions,
}) {
  const [ign, setIgn] =
    useState(player.ign);

  const [className, setClassName] =
    useState(
      player.className || "Swordman"
    );

  const [weapon, setWeapon] =
    useState(player.weapon || "");

  useEffect(() => {
    setIgn(player.ign);
    setClassName(
      player.className ||
        "Swordman"
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
              onSelect(player)
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
          player.className ||
          "—"
        )}
      </td>

      <td>
        {admin ? (
          <div className="weapon-editor">
            <input
              className="table-input"
              list={`weapon-list-${player.id}`}
              value={weapon}
              placeholder="Type or select"
              onChange={(e) =>
                setWeapon(
                  e.target.value
                )
              }
            />

            <datalist
              id={`weapon-list-${player.id}`}
            >
              {weaponOptions.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  />
                )
              )}
            </datalist>
          </div>
        ) : (
          player.weapon ||
          "—"
        )}
      </td>

      <td>
        <strong className="score-value">
          {Number(score).toFixed(2)}
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
              onClick={save}
            >
              SAVE
            </button>

            <button
              className="mini-button"
              onClick={() =>
                onSelect(player)
              }
            >
              HISTORY
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
          </div>
        </td>
      )}
    </tr>
  );
}

/* ============================================================
   ATTENDANCE PAGE
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

  const [
    sonyaPoints,
    setSonyaPoints,
  ] = useState(
    String(
      settings.sonyaPoints
    )
  );

  const [
    miniPoints,
    setMiniPoints,
  ] = useState(
    String(
      settings.miniBossPoints
    )
  );

  const [
    eligibility,
    setEligibility,
  ] = useState(
    String(
      settings.eligibilityScore
    )
  );

  const [message, setMessage] =
    useState("");

  /* ----------------------------------------------------------
     CALCULATE SCORES FROM HISTORY
  ---------------------------------------------------------- */

  const scoredPlayers =
    useMemo(
      () =>
        calculateAllScores(
          players,
          history
        ),
      [players, history]
    );

  /* ----------------------------------------------------------
     WEAPON OPTIONS
  ---------------------------------------------------------- */

  const weaponOptions =
    useMemo(() => {
      const values =
        players
          .map(
            (player) =>
              player.weapon
          )
          .filter(
            (weapon) =>
              String(
                weapon || ""
              ).trim()
          );

      return [
        ...new Set(
          values.map(
            (x) =>
              String(x).trim()
          )
        ),
      ].sort();
    }, [players]);

  /* ----------------------------------------------------------
     FILTER PLAYERS
  ---------------------------------------------------------- */

  const filteredPlayers =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return scoredPlayers.filter(
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
              player.calculatedScore
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
      scoredPlayers,
      search,
      classFilter,
      weaponFilter,
      claimFilter,
      settings.eligibilityScore,
    ]);

  /* ----------------------------------------------------------
     SETTINGS
  ---------------------------------------------------------- */

  useEffect(() => {
    setSonyaPoints(
      String(
        settings.sonyaPoints
      )
    );

    setMiniPoints(
      String(
        settings.miniBossPoints
      )
    );

    setEligibility(
      String(
        settings.eligibilityScore
      )
    );
  }, [settings]);

  /* ----------------------------------------------------------
     SELECT PLAYER
  ---------------------------------------------------------- */

  function selectPlayer(player) {
    const latest =
      scoredPlayers.find(
        (item) =>
          item.id === player.id
      );

    setSelectedPlayer(
      latest || player
    );

    setSelectedBosses([]);
  }

  /* ----------------------------------------------------------
     BOSS TOGGLE
  ---------------------------------------------------------- */

  function toggleBoss(id) {
    if (!admin) return;

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
            boss.points || 0
          ),
        0
      );

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

    await onAddPlayer({
      ign,
      className: newClass,
      weapon:
        newWeapon.trim(),
    });

    setNewIGN("");
    setNewWeapon("");

    setMessage(
      `${ign} added successfully.`
    );

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
      setMessage(
        "Invalid settings."
      );

      return;
    }

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
      scoredPlayers.map(
        (player) => ({
          IGN: player.ign,
          Class:
            player.className,
          "Preferred Weapon":
            player.weapon || "",
          Score: Number(
            player.calculatedScore ||
              0
          ),
          Eligible:
            Number(
              player.calculatedScore ||
                0
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
          HistoryID: item.id,
          PlayerID:
            item.playerId,
          IGN: item.ign,
          Date:
            item.dateKey,
          Bosses:
            item.bosses
              ?.map(
                (b) =>
                  b.name
              )
              .join(", ") ||
            "",
          Points: Number(
            item.points || 0
          ),
          "Recorded At":
            formatTimestamp(
              item.createdAt
            ),
          "Created By":
            item.createdBy ||
            "",
        })
      );

    const wb =
      XLSX.utils.book_new();

    const playersSheet =
      XLSX.utils.json_to_sheet(
        playerRows
      );

    const historySheet =
      XLSX.utils.json_to_sheet(
        historyRows
      );

    XLSX.utils.book_append_sheet(
      wb,
      playersSheet,
      "Attendance"
    );

    XLSX.utils.book_append_sheet(
      wb,
      historySheet,
      "History"
    );

    XLSX.writeFile(
      wb,
      `RAN_EP7_Attendance_Backup_${getDateKey()}.xlsx`
    );

    setMessage(
      "Attendance backup exported."
    );

    setTimeout(
      () => setMessage(""),
      3000
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

      /*
        IMPORT PLAYERS
      */

      const attendanceSheet =
        workbook.Sheets[
          "Attendance"
        ];

      if (attendanceSheet) {
        const rows =
          XLSX.utils.sheet_to_json(
            attendanceSheet
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

          const playerData = {
            ign,
            className:
              String(
                row.Class ||
                  "Swordman"
              ),
            weapon:
              String(
                row[
                  "Preferred Weapon"
                ] || ""
              ),
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
              playerData
            );
          } else {
            await addDoc(
              collection(
                db,
                "attendancePlayers"
              ),
              {
                ...playerData,
                createdAt:
                  serverTimestamp(),
              }
            );
          }
        }
      }

      /*
        IMPORT HISTORY

        If History sheet exists, restore
        each history record.

        IMPORTANT:
        We DO NOT import a manually
        calculated score into players.

        The score is reconstructed
        from history.
      */

      const historySheet =
        workbook.Sheets[
          "History"
        ];

      if (historySheet) {
        const rows =
          XLSX.utils.sheet_to_json(
            historySheet
          );

        for (const row of rows) {
          const ign =
            String(
              row.IGN || ""
            ).trim();

          if (!ign) continue;

          let player =
            players.find(
              (p) =>
                String(
                  p.ign || ""
                ).toLowerCase() ===
                ign.toLowerCase()
            );

          /*
            The player may have been
            created moments ago and not
            yet appeared in the realtime
            snapshot.

            Find by IGN again.
          */

          if (!player) {
            continue;
          }

          const bossText =
            String(
              row.Bosses || ""
            );

          const bossNames =
            bossText
              .split(",")
              .map(
                (x) =>
                  x.trim()
              )
              .filter(Boolean);

          const bosses =
            bossNames.map(
              (name) => {
                const boss =
                  DEFAULT_RAIDS.find(
                    (x) =>
                      x.name.toLowerCase() ===
                      name.toLowerCase()
                  );

                const points =
                  boss?.id ===
                  "sonya"
                    ? Number(
                        settings.sonyaPoints
                      )
                    : Number(
                        settings.miniBossPoints
                      );

                return {
                  id:
                    boss?.id ||
                    name
                      .toLowerCase()
                      .replace(
                        /\s+/g,
                        "-"
                      ),
                  name,
                  points,
                };
              }
            );

          const pointsFromBosses =
            bosses.reduce(
              (
                total,
                boss
              ) =>
                total +
                Number(
                  boss.points ||
                    0
                ),
              0
            );

          const points =
            Number.isFinite(
              Number(row.Points)
            )
              ? Number(
                  row.Points
                )
              : pointsFromBosses;

          await addDoc(
            collection(
              db,
              "attendanceHistory"
            ),
            {
              playerId:
                player.id,
              ign,
              dateKey:
                String(
                  row.Date ||
                    getDateKey()
                ),
              bosses,
              points,
              createdAt:
                serverTimestamp(),
              createdBy:
                userEmail(),
            }
          );
        }
      }

      event.target.value = "";

      setMessage(
        "XLSX backup imported successfully."
      );
    } catch (error) {
      console.error(
        "Import failed:",
        error
      );

      setMessage(
        "Import failed. Check the XLSX format."
      );
    }

    setTimeout(
      () => setMessage(""),
      4000
    );
  }

  function userEmail() {
    return (
      auth.currentUser?.email ||
      ""
    );
  }

  /*
    Selected player's history
  */

  const selectedHistory =
    selectedPlayer
      ? history
          .filter(
            (item) =>
              item.playerId ===
              selectedPlayer.id
          )
          .sort(
            (a, b) => {
              const aTime =
                a.createdAt
                  ?.toDate?.()
                  ?.getTime?.() ||
                0;

              const bTime =
                b.createdAt
                  ?.toDate?.()
                  ?.getTime?.() ||
                0;

              return (
                bTime - aTime
              );
            }
          )
      : [];

  const selectedScore =
    selectedPlayer
      ? calculatePlayerScore(
          selectedPlayer.id,
          history
        )
      : 0;

  const selectedEligible =
    selectedScore >=
    Number(
      settings.eligibilityScore
    );

  return (
    <main className="page attendance-page">
      {/* ======================================================
          HEADER
      ====================================================== */}

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

      {/* ======================================================
          SUMMARY
      ====================================================== */}

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
              scoredPlayers.filter(
                (p) =>
                  Number(
                    p.calculatedScore
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
            {Number(
              settings.sonyaPoints
            ).toFixed(2)}
          </strong>
        </div>

        <div>
          <span>MINI BOSS</span>
          <strong>
            {Number(
              settings.miniBossPoints
            ).toFixed(2)}
          </strong>
        </div>

        <div>
          <span>REQUIRED</span>
          <strong>
            {Number(
              settings.eligibilityScore
            ).toFixed(2)}
          </strong>
        </div>
      </div>

      {/* ======================================================
          ADD IGN
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
                Add a player to the
                attendance database.
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
                list="new-weapon-list"
                value={newWeapon}
                onChange={(e) =>
                  setNewWeapon(
                    e.target.value
                  )
                }
                placeholder="Type or select"
              />

              <datalist id="new-weapon-list">
                {weaponOptions.map(
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
                value={
                  sonyaPoints
                }
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
                value={
                  miniPoints
                }
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
                value={
                  eligibility
                }
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
          RECORD ATTENDANCE / FIND PLAYER
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
              Search the table and select
              an IGN to record attendance.
            </p>
          </div>
        </div>

        {/* FILTERS */}

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

            {weaponOptions.map(
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

        {/* ====================================================
            PLAYER TABLE
        ==================================================== */}

        <div className="table-scroll">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>
                  IGN
                </th>

                <th>
                  CLASS
                </th>

                <th>
                  PREFERRED WEAPON
                </th>

                <th>
                  CURRENT SCORE
                </th>

                <th>
                  CLAIM
                </th>

                <th>
                  LAST UPDATED
                </th>

                {admin && (
                  <th>
                    ACTIONS
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.map(
                (player) => {
                  const score =
                    Number(
                      player.calculatedScore ||
                        0
                    );

                  const eligible =
                    score >=
                    Number(
                      settings.eligibilityScore
                    );

                  return (
                    <AttendancePlayerRow
                      key={
                        player.id
                      }
                      player={
                        player
                      }
                      score={
                        score
                      }
                      eligible={
                        eligible
                      }
                      admin={
                        admin
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
                      weaponOptions={
                        weaponOptions
                      }
                    />
                  );
                }
              )}

              {filteredPlayers.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      admin
                        ? 7
                        : 6
                    }
                    className="empty-table"
                  >
                    No players
                    found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ==================================================
            SELECTED PLAYER
        ================================================== */}

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

              <div
                className={
                  selectedEligible
                    ? "eligible-badge"
                    : "score-large"
                }
              >
                {Number(
                  selectedScore
                ).toFixed(2)}

                {selectedEligible && (
                  <small>
                    SONYA WEAPON
                    ELIGIBLE
                  </small>
                )}
              </div>
            </div>

            {/* BOSS TABLE */}

            <div className="table-scroll">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>
                      BOSS
                    </th>

                    <th>
                      TYPE
                    </th>

                    <th>
                      POINTS
                    </th>

                    <th>
                      ATTENDANCE
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {DEFAULT_RAIDS.map(
                    (boss) => {
                      const checked =
                        selectedBosses.includes(
                          boss.id
                        );

                      const points =
                        boss.id ===
                        "sonya"
                          ? Number(
                              settings.sonyaPoints
                            )
                          : Number(
                              settings.miniBossPoints
                            );

                      return (
                        <tr
                          key={
                            boss.id
                          }
                        >
                          <td>
                            <strong>
                              {
                                boss.name
                              }
                            </strong>
                          </td>

                          <td>
                            {
                              boss.type
                            }
                          </td>

                          <td>
                            +
                            {points.toFixed(
                              2
                            )}
                          </td>

                          <td>
                            <label className="boss-check">
                              <input
                                type="checkbox"
                                checked={
                                  checked
                                }
                                disabled={
                                  !admin
                                }
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
                                {checked
                                  ? "SELECTED"
                                  : "MARK ATTENDANCE"}
                              </span>
                            </label>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
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

              {admin && (
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
                Attendance history is the
                source of truth for the
                player's score.
              </p>
            </div>

            <div>
              <strong>
                TOTAL:{" "}
                {Number(
                  selectedScore
                ).toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    DATE
                  </th>

                  <th>
                    BOSSES
                  </th>

                  <th>
                    POINTS
                  </th>

                  <th>
                    RECORDED
                  </th>

                  {admin && (
                    <th>
                      ACTION
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {selectedHistory.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={
                        admin
                          ? 5
                          : 4
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
                                  item.id
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
              Scores are calculated from
              Firebase attendance history.
            </p>
          </div>

          <div className="backup-actions">
            {admin && (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="table-scroll">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>
                  IGN
                </th>

                <th>
                  CLASS
                </th>

                <th>
                  WEAPON
                </th>

                <th>
                  SCORE
                </th>

                <th>
                  CLAIM
                </th>

                <th>
                  LAST UPDATED
                </th>

                {admin && (
                  <th>
                    ACTIONS
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {scoredPlayers.map(
                (player) => {
                  const score =
                    Number(
                      player.calculatedScore ||
                        0
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
                        <button
                          className="ign-link"
                          onClick={() =>
                            selectPlayer(
                              player
                            )
                          }
                        >
                          {
                            player.ign
                          }
                        </button>
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
                        <strong className="score-value">
                          {score.toFixed(
                            2
                          )}
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

                      <td>
                        {formatTimestamp(
                          player.updatedAt
                        )}
                      </td>

                      {admin && (
                        <td>
                          <button
                            className="mini-button"
                            onClick={() =>
                              selectPlayer(
                                player
                              )
                            }
                          >
                            HISTORY
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MESSAGE */}

      {message && (
        <div className="success-message">
          ✓ {message}
        </div>
      )}

      {/* LOGIN */}

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

  const [raidUpdated, setRaidUpdated] =
    useState(null);

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

          setIsAdmin(
            adminDoc.exists() &&
              adminDoc.data()
                ?.active === true
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

          const firebaseRaids =
            data.raids;

          if (
            Array.isArray(
              firebaseRaids
            ) &&
            firebaseRaids.length
          ) {
            setRaids(
              firebaseRaids
            );
          } else {
            setRaids(
              DEFAULT_RAIDS
            );
          }

          setRaidUpdated(
            data.updatedAt
          );
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
     UPDATE RAID
  ========================================================== */

  async function updateRaid(
    id,
    updatedRaid
  ) {
    /*
      Raid editing is intentionally
      allowed according to Firestore
      rules.

      If your rules require admin,
      this function requires the
      logged-in admin.
    */

    if (
      !isAdmin
    ) {
      alert(
        "Admin login required to change raid schedules."
      );

      return;
    }

    const now =
      new Date();

    const updatedWithTime = {
      ...updatedRaid,
      updatedAt:
        now.toISOString(),
      updatedBy:
        user?.email || "",
    };

    const next =
      raids.map((raid) =>
        raid.id === id
          ? updatedWithTime
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
        updatedBy:
          user?.email || "",
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
    if (!isAdmin) return;

    const cleanIGN =
      player.ign.trim();

    if (!cleanIGN) return;

    /*
      Prevent duplicate IGN.
    */

    const duplicate =
      players.some(
        (existing) =>
          String(
            existing.ign || ""
          ).toLowerCase() ===
          cleanIGN.toLowerCase()
      );

    if (duplicate) {
      alert(
        "That IGN already exists."
      );

      return;
    }

    await addDoc(
      collection(
        db,
        "attendancePlayers"
      ),
      {
        ign: cleanIGN,
        className:
          player.className,
        weapon:
          player.weapon || "",
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

    const cleanIGN =
      String(
        changes.ign || ""
      ).trim();

    if (!cleanIGN) {
      alert(
        "IGN cannot be empty."
      );

      return;
    }

    const duplicate =
      players.some(
        (player) =>
          player.id !== id &&
          String(
            player.ign || ""
          ).toLowerCase() ===
            cleanIGN.toLowerCase()
      );

    if (duplicate) {
      alert(
        "Another player already uses this IGN."
      );

      return;
    }

    /*
      IMPORTANT:

      We deliberately DO NOT save
      totalScore here.

      Score is calculated from
      attendanceHistory.
    */

    await updateDoc(
      doc(
        db,
        "attendancePlayers",
        id
      ),
      {
        ign: cleanIGN,
        className:
          changes.className ||
          "Swordman",
        weapon:
          changes.weapon || "",
        updatedAt:
          serverTimestamp(),
      }
    );

    /*
      Keep history IGN synchronized
      when an admin changes an IGN.
    */

    const relatedHistory =
      history.filter(
        (item) =>
          item.playerId === id
      );

    for (const item of relatedHistory) {
      await updateDoc(
        doc(
          db,
          "attendanceHistory",
          item.id
        ),
        {
          ign: cleanIGN,
        }
      );
    }
  }

  /* ==========================================================
     DELETE PLAYER
  ========================================================== */

  async function deletePlayer(
    id
  ) {
    if (!isAdmin) return;

    const player =
      players.find(
        (p) =>
          p.id === id
      );

    const answer =
      window.confirm(
        `Delete ${player?.ign || "this player"}?\n\nThe attendance history will NOT be deleted.`
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
  ========================================================== */

  async function addAttendance(
    player,
    bosses,
    points
  ) {
    if (!isAdmin) return;

    /*
      ONLY create the history record.

      DO NOT manually increment
      player.totalScore.

      This prevents score drift.
    */

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
          Number(points || 0),
        createdAt:
          serverTimestamp(),
        createdBy:
          user?.email || "",
      }
    );

    /*
      Update player timestamp only.
      Score remains derived from history.
    */

    await updateDoc(
      doc(
        db,
        "attendancePlayers",
        player.id
      ),
      {
        updatedAt:
          serverTimestamp(),
      }
    );
  }

  /* ==========================================================
     DELETE HISTORY
  ========================================================== */

  async function deleteHistory(
    historyId
  ) {
    if (!isAdmin) return;

    const item =
      history.find(
        (x) =>
          x.id ===
          historyId
      );

    if (!item) return;

    const answer =
      window.confirm(
        `Delete this attendance record?\n\n${item.ign || ""}\n${item.bosses
          ?.map(
            (b) =>
              b.name
          )
          .join(", ")}\n+${Number(
          item.points || 0
        ).toFixed(2)} points`
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
      IMPORTANT:

      We do NOT subtract points from
      the player.

      The score will automatically
      recalculate from the remaining
      history records.
    */

    if (item.playerId) {
      try {
        await updateDoc(
          doc(
            db,
            "attendancePlayers",
            item.playerId
          ),
          {
            updatedAt:
              serverTimestamp(),
          }
        );
      } catch (error) {
        console.error(
          "Player timestamp update failed:",
          error
        );
      }
    }
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
            Fixed Philippines raid
            times are converted
            automatically.
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
          admin={isAdmin}
          onUpdateRaid={
            updateRaid
          }
          lastUpdated={
            raidUpdated
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

