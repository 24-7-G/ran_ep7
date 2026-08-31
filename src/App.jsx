import { useEffect, useMemo, useState } from "react";
import "./App.css";

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
    id: "giant-hawk",
    name: "Giant Hawk",
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
];

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

function loadStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);

    if (!saved) {
      return fallback;
    }

    return JSON.parse(saved);
  } catch {
    return fallback;
  }
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

  if (h < 1) h = 1;
  if (h > 12) h = 12;

  if (period === "AM") {
    return h === 12 ? 0 : h;
  }

  return h === 12 ? 12 : h + 12;
}

/*
  Returns the UTC offset in minutes for a timezone
  at a particular moment.

  This automatically handles daylight saving time.
*/
function getTimezoneOffset(timezone, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

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

/*
  Creates a Date representing a fixed Philippines
  local date/time.

  This does NOT run like a clock.
  It is only used to perform the timezone conversion.
*/
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
    const offset = getTimezoneOffset(
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
        offset * 60 * 1000
    );
  }

  return guess;
}

function getTodayPhilippines() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

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

  let year = today.year;
  let month = today.month;
  let day = today.day;

  if (raid.day === null) {
    return philippinesDateToUTC(
      year,
      month,
      day,
      raid.hour,
      raid.minute
    );
  }

  const todayUTC = new Date(
    Date.UTC(year, month - 1, day)
  );

  const currentDay = todayUTC.getUTCDay();

  let daysUntil = raid.day - currentDay;

  if (daysUntil < 0) {
    daysUntil += 7;
  }

  return philippinesDateToUTC(
    year,
    month,
    day + daysUntil,
    raid.hour,
    raid.minute
  );
}

/*
  Convert the fixed Philippines raid time
  into the target timezone.

  The returned object contains the target
  date/time only. It does not continuously update.
*/
function convertRaidTime(raid, timezone) {
  const utcDate = getNextOccurrence(raid);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(utcDate);

  const result = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  });

  const dateString = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: timezone,
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(utcDate);

  const timeString = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(utcDate);

  return {
    date: dateString,
    time: timeString,
    day: result.weekday,
  };
}

function getPhilippinesDisplay(raid) {
  const hour = get12Hour(raid.hour);
  const period = getPeriod(raid.hour);

  return `${hour}:${pad(raid.minute)} ${period}`;
}

/* ============================================================
   RAID CARD
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

  const [saved, setSaved] = useState(false);

  const hour12 = get12Hour(
    Number(raid.hour)
  );

  const period = getPeriod(
    Number(raid.hour)
  );

  function changeHour(value) {
    const hour = to24Hour(
      value,
      period
    );

    onUpdate(raid.id, {
      hour,
    });

    setSaved(false);
  }

  function changeMinute(value) {
    let minute = Number(value);

    if (Number.isNaN(minute)) {
      minute = 0;
    }

    minute = Math.max(
      0,
      Math.min(59, minute)
    );

    onUpdate(raid.id, {
      minute,
    });

    setSaved(false);
  }

  function changePeriod(value) {
    onUpdate(raid.id, {
      hour: to24Hour(
        hour12,
        value
      ),
    });

    setSaved(false);
  }

  function save() {
    localStorage.setItem(
      "ran-bh-raids",
      JSON.stringify(
        window.__RAN_RAIDS__
      )
    );

    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 1500);
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
        <div className="raid-title-row">
          <div>
            <div className="raid-type">
              {raid.type}
            </div>

            <h2>{raid.name}</h2>

            <div className="raid-frequency">
              {raid.schedule}
            </div>
          </div>
        </div>

        <div className="conversion-grid">
          {/* PHILIPPINES */}
          <div className="time-panel philippines">
            <div className="panel-label">
              <span>
                🇵🇭 PHILIPPINES
              </span>

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

          {/* LOCAL */}
          <div className="time-panel local">
            <div className="panel-label">
              <span>
                {getTimezoneFlag(
                  targetTimezone
                )} YOUR LOCAL TIME
              </span>

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
              )}
              {" • "}
              {converted.day}
            </div>
          </div>
        </div>

        {/* EDIT */}
        <div className="edit-area">
          <div className="edit-label">
            EDIT PHILIPPINES RAID TIME
          </div>

          <div className="edit-controls">
            <div className="number-control">
              <input
                type="number"
                min="1"
                max="12"
                value={hour12}
                onChange={(e) =>
                  changeHour(
                    e.target.value
                  )
                }
              />

              <span>:</span>

              <input
                type="number"
                min="0"
                max="59"
                value={pad(
                  raid.minute
                )}
                onChange={(e) =>
                  changeMinute(
                    e.target.value
                  )
                }
              />

              <select
                value={period}
                onChange={(e) =>
                  changePeriod(
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
              className="save-button"
              onClick={save}
            >
              {saved ? "SAVED" : "SAVE"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ============================================================
   CUSTOM LOCATIONS
   ============================================================ */

function CustomLocations({
  customLocations,
  setCustomLocations,
}) {
  const [selected, setSelected] =
    useState("");

  function addLocation() {
    if (!selected) return;

    if (
      customLocations.includes(selected)
    ) {
      return;
    }

    setCustomLocations([
      ...customLocations,
      selected,
    ]);

    setSelected("");
  }

  function removeLocation(zone) {
    setCustomLocations(
      customLocations.filter(
        (item) => item !== zone
      )
    );
  }

  return (
    <section className="custom-section">
      <div className="custom-header">
        <div>
          <div className="section-label">
            OPTIONAL
          </div>

          <h2>
            Custom Raid Locations
          </h2>

          <p>
            Add locations to see the boss
            schedule in their timezone.
          </p>
        </div>

        <div className="location-add">
          <select
            value={selected}
            onChange={(e) =>
              setSelected(
                e.target.value
              )
            }
          >
            <option value="">
              Select location
            </option>

            {TIMEZONES.map(
              ([zone, name, flag]) => (
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
            onClick={addLocation}
          >
            + ADD LOCATION
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
                {getTimezoneFlag(zone)}
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
                  removeLocation(zone)
                }
              >
                ×
              </button>
            </div>
          )
        )}

        {customLocations.length ===
          0 && (
          <div className="empty-location">
            No custom locations added.
          </div>
        )}
      </div>
    </section>
  );
}

/* ============================================================
   APP
   ============================================================ */

export default function App() {
  const localTimezone =
    getLocalTimezone();

  const [raids, setRaids] = useState(() =>
    loadStorage(
      "ran-bh-raids",
      DEFAULT_RAIDS
    )
  );

  const [customLocations, setCustomLocations] =
    useState(() =>
      loadStorage(
        "ran-bh-locations",
        []
      )
    );

  useEffect(() => {
    localStorage.setItem(
      "ran-bh-raids",
      JSON.stringify(raids)
    );

    /*
      Allows the Save button in a child card
      to save the latest state.
    */
    window.__RAN_RAIDS__ = raids;
  }, [raids]);

  useEffect(() => {
    localStorage.setItem(
      "ran-bh-locations",
      JSON.stringify(
        customLocations
      )
    );
  }, [customLocations]);

  function updateRaid(id, changes) {
    setRaids((current) =>
      current.map((raid) =>
        raid.id === id
          ? {
              ...raid,
              ...changes,
            }
          : raid
      )
    );
  }

  function resetAll() {
    const answer = window.confirm(
      "Reset all boss times and custom locations?"
    );

    if (!answer) return;

    setRaids(DEFAULT_RAIDS);
    setCustomLocations([]);

    localStorage.setItem(
      "ran-bh-raids",
      JSON.stringify(DEFAULT_RAIDS)
    );

    localStorage.setItem(
      "ran-bh-locations",
      JSON.stringify([])
    );
  }

  return (
    <div className="app">
      {/* HEADER */}
      <header className="site-header">
        <div>
          <div className="eyebrow">
            RAN ONLINE EP7
          </div>

          <h1>
            BH RAID
            <span> SCHEDULE</span>
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
              localTimezone
            )}{" "}
            {getTimezoneLabel(
              localTimezone
            )}
          </strong>

          <small>
            Raid times below are converted
            from Philippines time.
          </small>
        </div>
      </header>

      {/* IMPORTANT NOTICE */}
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
            Your local raid time is a
            conversion of that fixed
            schedule. It does not act as a
            running clock.
          </span>
        </div>
      </div>

      {/* BOSS SCHEDULE */}
      <main>
        <div className="section-heading">
          <div>
            <div className="section-label">
              BOSS HUNT
            </div>

            <h2>
              Raid Schedule
            </h2>
          </div>

          <button
            className="reset-button"
            onClick={resetAll}
          >
            RESET
          </button>
        </div>

        <div className="raid-list">
          {raids.map((raid) => (
            <RaidCard
              key={raid.id}
              raid={raid}
              targetTimezone={
                localTimezone
              }
              onUpdate={updateRaid}
            />
          ))}
        </div>

        {/* CUSTOM */}
        <CustomLocations
          customLocations={
            customLocations
          }
          setCustomLocations={
            setCustomLocations
          }
        />

        {/* CUSTOM CONVERSION TABLE */}
        {customLocations.length >
          0 && (
          <section className="conversion-section">
            <div className="section-label">
              CUSTOM VIEW
            </div>

            <h2>
              Raid Times by Location
            </h2>

            <p>
              Fixed conversions from
              Philippines raid time.
            </p>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>
                      BOSS
                    </th>

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
                  {raids.map((raid) => (
                    <tr key={raid.id}>
                      <td>
                        <strong>
                          {raid.name}
                        </strong>

                        <small>
                          {
                            raid.schedule
                          }
                        </small>
                      </td>

                      <td>
                        <strong>
                          {
                            getPhilippinesDisplay(
                              raid
                            )
                          }
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
                              key={zone}
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
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <footer>
        RAN ONLINE EP7 • BH RAID SCHEDULE
      </footer>
    </div>
  );
}