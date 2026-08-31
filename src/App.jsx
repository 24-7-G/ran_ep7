import { useEffect, useMemo, useState } from "react";
import "./App.css";

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

import { db } from "./firebase";

const PH_TIMEZONE = "Asia/Manila";

/*
============================================================
TIMEZONES
============================================================
*/

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

/*
============================================================
DEFAULT RAID DATA
============================================================
*/

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

/*
============================================================
TIMEZONE HELPERS
============================================================
*/

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

/*
============================================================
TIME HELPERS
============================================================
*/

function pad(value) {
  return String(value).padStart(2, "0");
}

function get12Hour(hour) {
  hour = Number(hour);

  if (hour === 0) return 12;
  if (hour > 12) return hour - 12;

  return hour;
}

function getPeriod(hour) {
  return Number(hour) >= 12
    ? "PM"
    : "AM";
}

function to24Hour(hour, period) {
  let h = Number(hour);

  if (!Number.isFinite(h)) {
    h = 12;
  }

  h = Math.max(1, Math.min(12, h));

  if (period === "AM") {
    return h === 12 ? 0 : h;
  }

  return h === 12 ? 12 : h + 12;
}

/*
============================================================
GET TODAY IN PHILIPPINES
============================================================
*/

function getTodayPhilippines() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: PH_TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }
  ).formatToParts(now);

  const result = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      result[part.type] = Number(
        part.value
      );
    }
  });

  return {
    year: result.year,
    month: result.month,
    day: result.day,
  };
}

/*
============================================================
PHILIPPINES LOCAL TIME → UTC

IMPORTANT:

Philippines is ALWAYS UTC+8.

There is NO daylight saving time.

Therefore:

PH 9:00 PM
=
UTC 1:00 PM

This is much more reliable than trying
to calculate the Philippines offset dynamically.
============================================================
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
      Number(hour) - 8,
      Number(minute),
      0,
      0
    )
  );
}

/*
============================================================
GET NEXT RAID OCCURRENCE

The date is based on PHILIPPINES date.

The resulting Date represents the exact
instant of the raid worldwide.
============================================================
*/

function getNextOccurrence(raid) {
  const today =
    getTodayPhilippines();

  let {
    year,
    month,
    day,
  } = today;

  /*
    DAILY RAID
  */
  if (raid.day === null) {
    return philippinesDateToUTC(
      year,
      month,
      day,
      raid.hour,
      raid.minute
    );
  }

  /*
    WEEKLY RAID
  */

  /*
    JS:
    Sunday = 0
    Monday = 1
    Tuesday = 2
    Wednesday = 3
    Thursday = 4
    Friday = 5
    Saturday = 6
  */

  const currentDay = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).getUTCDay();

  let daysUntil =
    raid.day - currentDay;

  if (daysUntil < 0) {
    daysUntil += 7;
  }

  /*
    If today is the raid day but the raid
    time has already passed, move to next week.

    This prevents Wednesday's Sonya from
    incorrectly showing the old occurrence.
  */

  if (daysUntil === 0) {
    const currentUTC =
      new Date();

    const raidUTC =
      philippinesDateToUTC(
        year,
        month,
        day,
        raid.hour,
        raid.minute
      );

    if (
      currentUTC.getTime() >
      raidUTC.getTime()
    ) {
      daysUntil = 7;
    }
  }

  const targetDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + daysUntil
      )
    );

  year =
    targetDate.getUTCFullYear();

  month =
    targetDate.getUTCMonth() + 1;

  day =
    targetDate.getUTCDate();

  return philippinesDateToUTC(
    year,
    month,
    day,
    raid.hour,
    raid.minute
  );
}

/*
============================================================
CONVERT RAID TO TARGET TIMEZONE

The Date object represents one exact
worldwide instant.

Intl then converts that instant into
the requested timezone.

DST is automatically handled by the browser.
============================================================
*/

function convertRaidTime(
  raid,
  timezone
) {
  const utcDate =
    getNextOccurrence(raid);

  const dateFormatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    );

  const timeFormatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }
    );

  const weekdayFormatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        weekday: "long",
      }
    );

  return {
    date: dateFormatter.format(
      utcDate
    ),

    time: timeFormatter.format(
      utcDate
    ),

    day: weekdayFormatter.format(
      utcDate
    ),
  };
}

/*
============================================================
PHILIPPINES DISPLAY
============================================================
*/

function getPhilippinesDisplay(
  raid
) {
  const hour = get12Hour(
    raid.hour
  );

  const period =
    getPeriod(raid.hour);

  return `${hour}:${pad(
    raid.minute
  )} ${period}`;
}

/*
============================================================
RAID CARD
============================================================
*/

function RaidCard({
  raid,
  targetTimezone,
  onUpdate,
  onSave,
}) {
  const converted = useMemo(
    () =>
      convertRaidTime(
        raid,
        targetTimezone
      ),
    [raid, targetTimezone]
  );

  const [saving, setSaving] =
    useState(false);

  const [saved, setSaved] =
    useState(false);

  /*
    String values allow manual editing.
  */

  const [hourInput, setHourInput] =
    useState(
      String(
        get12Hour(
          Number(raid.hour)
        )
      ).padStart(2, "0")
    );

  const [minuteInput, setMinuteInput] =
    useState(
      String(
        Number(raid.minute)
      ).padStart(2, "0")
    );

  const hour12 =
    get12Hour(
      Number(raid.hour)
    );

  const period =
    getPeriod(
      Number(raid.hour)
    );

  /*
    Sync fields when Firestore sends
    a new value from another user.
  */

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

  /*
    HOUR INPUT
  */

  function changeHourInput(
    value
  ) {
    if (!/^\d*$/.test(value)) {
      return;
    }

    if (value.length > 2) {
      return;
    }

    setHourInput(value);

    if (value === "") {
      return;
    }

    const number =
      Number(value);

    if (
      number >= 1 &&
      number <= 12
    ) {
      onUpdate(
        raid.id,
        {
          hour: to24Hour(
            number,
            period
          ),
        }
      );

      setSaved(false);
    }
  }

  function finishHourInput() {
    let value =
      Number(hourInput);

    if (
      !value ||
      value < 1
    ) {
      value = 1;
    }

    if (value > 12) {
      value = 12;
    }

    setHourInput(
      String(value).padStart(
        2,
        "0"
      )
    );

    onUpdate(
      raid.id,
      {
        hour: to24Hour(
          value,
          period
        ),
      }
    );
  }

  /*
    MINUTE INPUT
  */

  function changeMinuteInput(
    value
  ) {
    if (!/^\d*$/.test(value)) {
      return;
    }

    if (value.length > 2) {
      return;
    }

    setMinuteInput(value);

    if (value === "") {
      return;
    }

    let minute =
      Number(value);

    if (minute > 59) {
      minute = 59;
    }

    onUpdate(
      raid.id,
      {
        minute,
      }
    );

    setSaved(false);
  }

  function finishMinuteInput() {
    let minute =
      Number(minuteInput);

    if (
      Number.isNaN(minute)
    ) {
      minute = 0;
    }

    minute = Math.max(
      0,
      Math.min(
        59,
        minute
      )
    );

    setMinuteInput(
      String(minute).padStart(
        2,
        "0"
      )
    );

    onUpdate(
      raid.id,
      {
        minute,
      }
    );
  }

  /*
    AM / PM
  */

  function changePeriod(
    value
  ) {
    onUpdate(
      raid.id,
      {
        hour: to24Hour(
          hour12,
          value
        ),
      }
    );

    setSaved(false);
  }

  /*
    SAVE
  */

  async function save() {
    try {
      let finalHour =
        Number(hourInput);

      if (
        !finalHour ||
        finalHour < 1
      ) {
        finalHour = 1;
      }

      if (finalHour > 12) {
        finalHour = 12;
      }

      let finalMinute =
        Number(minuteInput);

      if (
        Number.isNaN(
          finalMinute
        )
      ) {
        finalMinute = 0;
      }

      finalMinute =
        Math.max(
          0,
          Math.min(
            59,
            finalMinute
          )
        );

      const final24Hour =
        to24Hour(
          finalHour,
          period
        );

      onUpdate(
        raid.id,
        {
          hour:
            final24Hour,
          minute:
            finalMinute,
        }
      );

      const updatedRaid = {
        ...raid,
        hour:
          final24Hour,
        minute:
          finalMinute,
      };

      setSaving(true);

      await onSave(
        updatedRaid
      );

      setHourInput(
        String(finalHour).padStart(
          2,
          "0"
        )
      );

      setMinuteInput(
        String(finalMinute).padStart(
          2,
          "0"
        )
      );

      setSaved(true);

      setTimeout(
        () => {
          setSaved(false);
        },
        1500
      );
    } catch (error) {
      console.error(
        "Save error:",
        error
      );

      alert(
        "Unable to save the raid time."
      );
    } finally {
      setSaving(false);
    }
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

            <h2>
              {raid.name}
            </h2>

            <div className="raid-frequency">
              {raid.schedule}
            </div>

          </div>
        </div>

        {/* ==================================================
            TIME CONVERSION
        ================================================== */}

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
                )}{" "}
                YOUR LOCAL TIME
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

        {/* ==================================================
            EDIT
        ================================================== */}

        <div className="edit-area">

          <div className="edit-label">
            EDIT PHILIPPINES RAID TIME
          </div>

          <div className="edit-controls">

            <div className="number-control">

              <input
                type="text"
                inputMode="numeric"
                maxLength="2"
                value={
                  hourInput
                }
                onChange={(e) =>
                  changeHourInput(
                    e.target.value
                  )
                }
                onBlur={
                  finishHourInput
                }
                onFocus={(e) =>
                  e.target.select()
                }
                aria-label="Hour"
              />

              <span>
                :
              </span>

              <input
                type="text"
                inputMode="numeric"
                maxLength="2"
                value={
                  minuteInput
                }
                onChange={(e) =>
                  changeMinuteInput(
                    e.target.value
                  )
                }
                onBlur={
                  finishMinuteInput
                }
                onFocus={(e) =>
                  e.target.select()
                }
                aria-label="Minute"
              />

              <select
                value={
                  period
                }
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
              disabled={saving}
            >
              {saving
                ? "SAVING..."
                : saved
                ? "SAVED"
                : "SAVE"}
            </button>

          </div>

        </div>

      </div>

    </article>
  );
}

/*
============================================================
CUSTOM LOCATIONS
============================================================
*/

function CustomLocations({
  customLocations,
  setCustomLocations,
}) {
  const [selected, setSelected] =
    useState("");

  function addLocation() {
    if (!selected) {
      return;
    }

    if (
      customLocations.includes(
        selected
      )
    ) {
      return;
    }

    setCustomLocations([
      ...customLocations,
      selected,
    ]);

    setSelected("");
  }

  function removeLocation(
    zone
  ) {
    setCustomLocations(
      customLocations.filter(
        (item) =>
          item !== zone
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
            onClick={
              addLocation
            }
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

/*
============================================================
APP
============================================================
*/

export default function App() {

  const localTimezone =
    getLocalTimezone();

  const [raids, setRaids] =
    useState(
      DEFAULT_RAIDS
    );

  const [
    customLocations,
    setCustomLocations,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  /*
  ============================================================
  FIRESTORE REAL-TIME LISTENER
  ============================================================
  */

  useEffect(() => {

    const raidsRef =
      collection(
        db,
        "raids"
      );

    const unsubscribe =
      onSnapshot(
        raidsRef,
        (snapshot) => {

          if (
            snapshot.empty
          ) {

            setRaids(
              DEFAULT_RAIDS
            );

            setLoading(false);

            return;
          }

          const firebaseRaids =
            snapshot.docs.map(
              (item) => ({
                ...item.data(),
                id: item.id,
              })
            );

          const orderedRaids =
            DEFAULT_RAIDS.map(
              (defaultRaid) => {

                const firebaseRaid =
                  firebaseRaids.find(
                    (raid) =>
                      raid.id ===
                      defaultRaid.id
                  );

                return (
                  firebaseRaid ||
                  defaultRaid
                );
              }
            );

          setRaids(
            orderedRaids
          );

          setLoading(false);
        },
        (error) => {

          console.error(
            "Firestore error:",
            error
          );

          setRaids(
            DEFAULT_RAIDS
          );

          setLoading(false);
        }
      );

    return () =>
      unsubscribe();

  }, []);

  /*
  ============================================================
  SAVE RAID
  ============================================================
  */

  async function saveRaid(
    raid
  ) {

    const raidRef =
      doc(
        db,
        "raids",
        raid.id
      );

    await setDoc(
      raidRef,
      {
        id:
          raid.id,

        name:
          raid.name,

        type:
          raid.type,

        schedule:
          raid.schedule,

        day:
          raid.day,

        hour:
          Number(
            raid.hour
          ),

        minute:
          Number(
            raid.minute
          ),
      },
      {
        merge: true,
      }
    );
  }

  /*
  ============================================================
  UPDATE LOCAL STATE
  ============================================================
  */

  function updateRaid(
    id,
    changes
  ) {

    setRaids(
      (current) =>
        current.map(
          (raid) =>
            raid.id === id
              ? {
                  ...raid,
                  ...changes,
                }
              : raid
        )
    );
  }

  /*
  ============================================================
  RESET
  ============================================================
  */

  async function resetAll() {

    const answer =
      window.confirm(
        "Reset all boss times?"
      );

    if (!answer) {
      return;
    }

    try {

      await Promise.all(
        DEFAULT_RAIDS.map(
          (raid) =>
            setDoc(
              doc(
                db,
                "raids",
                raid.id
              ),
              raid,
              {
                merge: true,
              }
            )
        )
      );

      setRaids(
        DEFAULT_RAIDS
      );

    } catch (error) {

      console.error(
        "Reset failed:",
        error
      );

      alert(
        "Unable to reset the schedule."
      );
    }
  }

  /*
  ============================================================
  PAGE
  ============================================================
  */

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
              localTimezone
            )}{" "}
            {getTimezoneLabel(
              localTimezone
            )}
          </strong>

          <small>
            Raid times are fixed to
            Philippines time.
          </small>

        </div>

      </header>

      {/* NOTICE */}

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
            The converted time automatically
            accounts for the destination
            timezone and daylight saving time.
          </span>

        </div>

      </div>

      {/* MAIN */}

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
            onClick={
              resetAll
            }
          >
            RESET
          </button>

        </div>

        {loading ? (

          <div className="loading-message">
            Loading shared raid schedule...
          </div>

        ) : (

          <div className="raid-list">

            {raids.map(
              (raid) => (

                <RaidCard
                  key={
                    raid.id
                  }
                  raid={
                    raid
                  }
                  targetTimezone={
                    localTimezone
                  }
                  onUpdate={
                    updateRaid
                  }
                  onSave={
                    saveRaid
                  }
                />

              )
            )}

          </div>

        )}

        {/* CUSTOM LOCATIONS */}

        <CustomLocations
          customLocations={
            customLocations
          }
          setCustomLocations={
            setCustomLocations
          }
        />

        {/* CUSTOM TABLE */}

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

                        <th
                          key={
                            zone
                          }
                        >
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

      <footer>
        RAN ONLINE EP7 • BH RAID SCHEDULE
      </footer>

    </div>
  );
}

