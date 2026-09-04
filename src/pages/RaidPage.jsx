import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";

import { db, firebaseConfigured } from "../firebase";

import {
  DEFAULT_RAIDS,
  PRIMARY_TIMEZONE,
  TIMEZONES,
} from "../lib/constants";

import {
  formatDateTime,
  getNextRaid,
} from "../lib/time";

import Modal from "../components/Modal";
import TimePicker from "../components/TimePicker";
import { useGlobalDisplayTimezone } from "../lib/displayTimezone";

// Real boss artwork used throughout the Raid Schedule UI.
import sonyaBossImage from "../bosses/sonya.png";
import geomancerBossImage from "../bosses/geomancer.png";
import giantHawkBossImage from "../bosses/giant-hawk.png";
import reflectorBossImage from "../bosses/reflector.png";

const MAX_UPCOMING_DAYS = 7;

/* =========================================================
   LOCAL DATE STRING
========================================================= */

function localDateString(
  timezone = PRIMARY_TIMEZONE,
  date = new Date()
) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const values = {};

    parts.forEach((part) => {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    });

    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }
}

/* =========================================================
   CANONICAL RAID ID
========================================================= */

function canonicalRaidId(raid) {
  const raw = String(
    raid?.id ??
    raid?.raidId ??
    raid?.name ??
    ""
  )
    .trim()
    .toLowerCase();

  return raw
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* =========================================================
   NORMALIZE RAID
========================================================= */

function normalizeRaid(raid) {
  const id = canonicalRaidId(raid);

  const rawHour = Number(
    raid?.hour ?? 0
  );

  const rawMinute = Number(
    raid?.minute ?? 0
  );

  const hour = Number.isFinite(rawHour)
    ? Math.min(23, Math.max(0, Math.floor(rawHour)))
    : 0;

  const minute = Number.isFinite(rawMinute)
    ? Math.min(59, Math.max(0, Math.floor(rawMinute)))
    : 0;

  const intervalValue =
    raid?.intervalHours === null ||
      raid?.intervalHours === undefined ||
      raid?.intervalHours === ""
      ? null
      : Number(raid.intervalHours);

  const intervalHours =
    intervalValue !== null &&
      Number.isFinite(intervalValue) &&
      intervalValue > 0
      ? intervalValue
      : null;

  const rawAnchorHour =
    raid?.anchorHour === null ||
      raid?.anchorHour === undefined ||
      raid?.anchorHour === ""
      ? hour
      : Number(raid.anchorHour);

  const rawAnchorMinute =
    raid?.anchorMinute === null ||
      raid?.anchorMinute === undefined ||
      raid?.anchorMinute === ""
      ? minute
      : Number(raid.anchorMinute);

  const anchorHour = Number.isFinite(
    rawAnchorHour
  )
    ? Math.min(
      23,
      Math.max(
        0,
        Math.floor(rawAnchorHour)
      )
    )
    : hour;

  const anchorMinute = Number.isFinite(
    rawAnchorMinute
  )
    ? Math.min(
      59,
      Math.max(
        0,
        Math.floor(rawAnchorMinute)
      )
    )
    : minute;

  let scheduleType =
    raid?.scheduleType || "daily";

  if (
    !["daily", "weekly", "interval"].includes(
      scheduleType
    )
  ) {
    scheduleType = "daily";
  }

  return {
    ...raid,

    id,

    name:
      raid?.name ||
      id ||
      "Unnamed Raid",

    type:
      raid?.type ||
      "BOSS RAID",

    scheduleType,

    days:
      Array.isArray(raid?.days)
        ? [...raid.days]
        : [],

    hour,

    minute,

    intervalHours,

    anchorDate:
      raid?.anchorDate ||
      null,

    anchorHour,

    anchorMinute,

    timezone:
      raid?.timezone ||
      PRIMARY_TIMEZONE,

    active:
      raid?.active !== false,
  };
}

/* =========================================================
   DEDUPLICATE RAIDS
========================================================= */

function deduplicateRaids(raids) {
  const map = new Map();

  for (const rawRaid of raids || []) {
    const raid = normalizeRaid(rawRaid);

    const id = canonicalRaidId(raid);

    if (!id) {
      continue;
    }

    if (!map.has(id)) {
      map.set(id, raid);
      continue;
    }

    const existing = map.get(id);

    map.set(id, {
      ...existing,
      ...raid,
      id,
    });
  }

  return Array.from(map.values());
}

/* =========================================================
   COUNTDOWN
========================================================= */

function formatCountdown(
  target,
  current = new Date()
) {
  if (
    !(target instanceof Date) ||
    Number.isNaN(target.getTime())
  ) {
    return "—";
  }

  const diff =
    target.getTime() -
    current.getTime();

  if (diff <= 0) {
    return "NOW";
  }

  const totalSeconds =
    Math.floor(diff / 1000);

  const days =
    Math.floor(
      totalSeconds / 86400
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(
      hours
    ).padStart(2, "0")}h ${String(
      minutes
    ).padStart(2, "0")}m`;
  }

  if (hours > 0) {
    return `${hours}h ${String(
      minutes
    ).padStart(2, "0")}m ${String(
      seconds
    ).padStart(2, "0")}s`;
  }

  return `${minutes}m ${String(
    seconds
  ).padStart(2, "0")}s`;
}

/* =========================================================
   DISPLAY HELPERS
========================================================= */

function raidAccentClass(raid) {
  const id = canonicalRaidId(raid);

  if (id === "sonya") {
    return "raid-accent-sonya";
  }

  if (id === "geomancer") {
    return "raid-accent-geomancer";
  }

  if (id === "reflector") {
    return "raid-accent-reflector";
  }

  if (id === "giant-hawk") {
    return "raid-accent-hawk";
  }

  return "raid-accent-default";
}

function raidBossImage(raid) {
  const id = canonicalRaidId(raid);

  if (id === "sonya") {
    return sonyaBossImage;
  }

  if (id === "geomancer") {
    return geomancerBossImage;
  }

  if (id === "reflector") {
    return reflectorBossImage;
  }

  if (id === "giant-hawk") {
    return giantHawkBossImage;
  }

  return sonyaBossImage;
}

function formatRecurrence(raid) {
  if (
    raid.scheduleType ===
    "weekly"
  ) {
    if (!raid.days?.length) {
      return "Weekly";
    }

    return `Every ${raid.days.join(
      ", "
    )}`;
  }

  if (
    raid.scheduleType ===
    "interval"
  ) {
    const hours =
      Number(raid.intervalHours);

    if (hours === 1) {
      return "Every 1 hour";
    }

    if (hours > 0) {
      return `Every ${hours} hours`;
    }

    return "Interval schedule";
  }

  if (
    raid.scheduleType ===
    "daily"
  ) {
    return "Every day";
  }

  return "Custom schedule";
}

function formatTimeOnly(
  raid,
  timezone
) {
  try {
    const next = getNextRaid(
      raid,
      new Date(Date.now() - 1000)
    );

    if (
      !(next instanceof Date) ||
      Number.isNaN(next.getTime())
    ) {
      return "—";
    }

    const tz = timezone || PRIMARY_TIMEZONE;
    const text = new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }
    ).format(next);

    let zone = "";
    if (tz === "Asia/Manila") zone = "PHT";
    else if (tz === "UTC") zone = "UTC";
    else {
      try {
        zone = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          timeZoneName: "short",
          hour: "numeric",
        }).formatToParts(next).find((part) => part.type === "timeZoneName")?.value || "";
      } catch {
        zone = "";
      }
    }

    return zone ? `${text} ${zone}` : text;
  } catch {
    return "—";
  }
}

function formatPHT(date) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  const text = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Manila",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);

  return `${text} PHT`;
}

/* =========================================================
   UPCOMING OCCURRENCES
========================================================= */

function generateUpcomingOccurrences(
  raids,
  now,
  filter,
  bossFilter,
  days
) {
  const safeDays = Math.min(
    MAX_UPCOMING_DAYS,
    Math.max(
      1,
      Number(days) || 1
    )
  );

  let filteredRaids = [
    ...(raids || []),
  ];

  if (filter === "active") {
    filteredRaids =
      filteredRaids.filter(
        (raid) =>
          raid.active === true
      );
  }

  if (filter === "inactive") {
    filteredRaids =
      filteredRaids.filter(
        (raid) =>
          raid.active === false
      );
  }

  if (bossFilter !== "all") {
    filteredRaids =
      filteredRaids.filter(
        (raid) =>
          canonicalRaidId(raid) ===
          bossFilter
      );
  }

  const startTime =
    now.getTime();

  const endTime =
    startTime +
    safeDays *
    24 *
    60 *
    60 *
    1000;

  const occurrences = [];

  filteredRaids.forEach(
    (raid) => {
      /*
       * getNextRaid() returns null when inactive.
       *
       * For All / Inactive we temporarily calculate
       * the schedule as active, without modifying
       * the actual raid object.
       */
      const calculationRaid =
        raid.active === true
          ? raid
          : {
            ...raid,
            active: true,
          };

      let cursor =
        new Date(startTime);

      /*
       * Use a large safety limit instead of 100.
       *
       * This prevents frequent interval schedules
       * from being truncated inside a 7-day window.
       */
      for (
        let i = 0;
        i < 1000;
        i += 1
      ) {
        let next = null;

        try {
          next =
            getNextRaid(
              calculationRaid,
              cursor
            );
        } catch (error) {
          console.error(
            `Failed calculating ${raid.name}:`,
            error
          );

          break;
        }

        if (
          !(next instanceof Date) ||
          Number.isNaN(
            next.getTime()
          )
        ) {
          break;
        }

        /*
         * Prevent infinite loops.
         */
        if (
          next.getTime() <=
          cursor.getTime()
        ) {
          cursor =
            new Date(
              cursor.getTime() +
              1000
            );

          continue;
        }

        /*
         * Only future occurrences.
         */
        if (
          next.getTime() <=
          startTime
        ) {
          cursor =
            new Date(
              startTime + 1000
            );

          continue;
        }

        /*
         * HARD 7-DAY MAXIMUM.
         */
        if (
          next.getTime() >
          endTime
        ) {
          break;
        }

        occurrences.push({
          id: `${canonicalRaidId(
            raid
          )}-${next.getTime()}`,

          raid,

          date: next,
        });

        cursor =
          new Date(
            next.getTime() +
            1000
          );
      }
    }
  );

  return occurrences
    .filter((item) => {
      const time =
        item.date?.getTime?.();

      return (
        Number.isFinite(time) &&
        time > startTime &&
        time <= endTime
      );
    })
    .sort(
      (a, b) =>
        a.date.getTime() -
        b.date.getTime()
    );
}

/* =========================================================
   EDITOR
========================================================= */

function getInitialEditValues(
  raid
) {
  const normalized =
    normalizeRaid(raid);

  const anchorDate =
    normalized.anchorDate ||
    localDateString(
      normalized.timezone ||
      PRIMARY_TIMEZONE
    );

  return {
    ...normalized,

    days:
      Array.isArray(
        normalized.days
      )
        ? [...normalized.days]
        : [],

    hour:
      Number(
        normalized.hour ?? 0
      ),

    minute:
      Number(
        normalized.minute ?? 0
      ),

    intervalHours:
      normalized.intervalHours ??
      null,

    anchorDate,

    anchorHour:
      Number(
        normalized.anchorHour ??
        normalized.hour ??
        0
      ),

    anchorMinute:
      Number(
        normalized.anchorMinute ??
        normalized.minute ??
        0
      ),
  };
}

function DaySelector({
  selectedDays,
  onChange,
}) {
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  function toggleDay(day) {
    if (
      selectedDays.includes(day)
    ) {
      onChange(
        selectedDays.filter(
          (item) =>
            item !== day
        )
      );
    } else {
      onChange([
        ...selectedDays,
        day,
      ]);
    }
  }

  return (
    <div className="raid-day-selector">
      {days.map((day) => (
        <button
          key={day}
          type="button"
          className={
            selectedDays.includes(
              day
            )
              ? "raid-day-button active"
              : "raid-day-button"
          }
          onClick={() =>
            toggleDay(day)
          }
        >
          {day.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function RaidPage() {
  const [
    raids,
    setRaids,
  ] = useState(() =>
    deduplicateRaids(
      DEFAULT_RAIDS || []
    )
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const { resolvedTimezone } = useGlobalDisplayTimezone();

  const [
    now,
    setNow,
  ] = useState(
    new Date()
  );

  const [
    upcomingFilter,
    setUpcomingFilter,
  ] = useState(
    "active"
  );

  const [
    bossFilter,
    setBossFilter,
  ] = useState(
    "all"
  );

  const [
    upcomingDays,
    setUpcomingDays,
  ] = useState(3);

  const [
    editingRaid,
    setEditingRaid,
  ] = useState(null);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    saveError,
    setSaveError,
  ] = useState("");

  /* =======================================================
     LIVE CLOCK
  ======================================================= */

  useEffect(() => {
    const timer =
      setInterval(() => {
        setNow(
          new Date()
        );
      }, 1000);

    return () =>
      clearInterval(timer);
  }, []);

  /* =======================================================
     LOAD FIREBASE
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadRaids() {
      setLoading(true);

      try {
        if (
          !firebaseConfigured ||
          !db
        ) {
          if (!cancelled) {
            setRaids(
              deduplicateRaids(
                DEFAULT_RAIDS || []
              )
            );
          }

          return;
        }

        const snapshot =
          await getDocs(
            collection(
              db,
              "raids"
            )
          );

        if (cancelled) {
          return;
        }

        const firebaseRaids =
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          );

        /*
         * Defaults first.
         * Firebase second.
         *
         * Firebase therefore overrides
         * the default schedule.
         */
        setRaids(
          deduplicateRaids([
            ...(DEFAULT_RAIDS || []),
            ...firebaseRaids,
          ])
        );
      } catch (error) {
        console.error(
          "Failed loading raids:",
          error
        );

        if (!cancelled) {
          setRaids(
            deduplicateRaids(
              DEFAULT_RAIDS || []
            )
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRaids();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     NEXT RAID
  ======================================================= */

  const nextRaids =
    useMemo(() => {
      return raids
        .filter(
          (raid) =>
            raid.active === true
        )
        .map(
          (raid) => {
            try {
              return {
                raid,

                next:
                  getNextRaid(
                    raid,
                    now
                  ),
              };
            } catch (error) {
              console.error(
                `Failed calculating ${raid.name}:`,
                error
              );

              return {
                raid,
                next: null,
              };
            }
          }
        )
        .filter(
          (item) =>
            item.next instanceof
            Date &&
            !Number.isNaN(
              item.next.getTime()
            )
        )
        .sort(
          (a, b) =>
            a.next.getTime() -
            b.next.getTime()
        );
    }, [
      raids,
      now,
    ]);

  /* =======================================================
     UPCOMING
  ======================================================= */

  const upcomingOccurrences =
    useMemo(
      () =>
        generateUpcomingOccurrences(
          raids,
          now,
          upcomingFilter,
          bossFilter,
          upcomingDays
        ),
      [
        raids,
        now,
        upcomingFilter,
        bossFilter,
        upcomingDays,
      ]
    );

  /* =======================================================
     OPEN EDITOR
  ======================================================= */

  function openEditor(raid) {
    setSaveError("");

    setEditingRaid(
      getInitialEditValues(
        raid
      )
    );
  }

  /* =======================================================
     CLOSE EDITOR
  ======================================================= */

  function closeEditor() {
    if (saving) {
      return;
    }

    setEditingRaid(null);
    setSaveError("");
  }

  /* =======================================================
     SAVE RAID
  ======================================================= */

  async function saveRaid() {
    if (
      !editingRaid ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      const normalized =
        normalizeRaid(
          editingRaid
        );

      const id =
        canonicalRaidId(
          normalized
        );

      if (!id) {
        throw new Error(
          "Raid ID is missing."
        );
      }

      const hour =
        Number(
          normalized.hour
        );

      const minute =
        Number(
          normalized.minute
        );

      if (
        !Number.isInteger(hour) ||
        hour < 0 ||
        hour > 23
      ) {
        throw new Error(
          "Spawn hour must be between 0 and 23."
        );
      }

      if (
        !Number.isInteger(
          minute
        ) ||
        minute < 0 ||
        minute > 59
      ) {
        throw new Error(
          "Spawn minute must be between 0 and 59."
        );
      }

      normalized.hour =
        hour;

      normalized.minute =
        minute;

      /* -----------------------------------------------
         WEEKLY VALIDATION
      ------------------------------------------------ */

      if (
        normalized.scheduleType ===
        "weekly"
      ) {
        if (
          !Array.isArray(
            normalized.days
          ) ||
          normalized.days.length ===
          0
        ) {
          throw new Error(
            "Select at least one day for a weekly schedule."
          );
        }
      }

      /* -----------------------------------------------
         INTERVAL VALIDATION
      ------------------------------------------------ */

      if (
        normalized.scheduleType ===
        "interval"
      ) {
        const interval =
          Number(
            normalized.intervalHours
          );

        if (
          !Number.isFinite(
            interval
          ) ||
          interval <= 0
        ) {
          throw new Error(
            "Interval hours must be greater than 0."
          );
        }

        if (
          interval > 720
        ) {
          throw new Error(
            "Interval cannot exceed 720 hours."
          );
        }

        normalized.intervalHours =
          interval;

        normalized.anchorDate =
          normalized.anchorDate ||
          localDateString(
            normalized.timezone ||
            PRIMARY_TIMEZONE
          );

        normalized.anchorHour =
          Number.isFinite(
            Number(
              normalized.anchorHour
            )
          )
            ? Number(
              normalized.anchorHour
            )
            : hour;

        normalized.anchorMinute =
          Number.isFinite(
            Number(
              normalized.anchorMinute
            )
          )
            ? Number(
              normalized.anchorMinute
            )
            : minute;

        normalized.anchorHour =
          Math.min(
            23,
            Math.max(
              0,
              Math.floor(
                normalized.anchorHour
              )
            )
          );

        normalized.anchorMinute =
          Math.min(
            59,
            Math.max(
              0,
              Math.floor(
                normalized.anchorMinute
              )
            )
          );
      }

      /* -----------------------------------------------
         DAILY / WEEKLY
      ------------------------------------------------ */

      if (
        normalized.scheduleType !==
        "interval"
      ) {
        normalized.intervalHours =
          null;

        normalized.anchorDate =
          null;

        normalized.anchorHour =
          hour;

        normalized.anchorMinute =
          minute;
      }

      const finalRaid = {
        ...normalized,

        id,

        name:
          normalized.name,

        type:
          normalized.type,

        scheduleType:
          normalized.scheduleType,

        days:
          normalized.scheduleType ===
            "weekly"
            ? [
              ...normalized.days,
            ]
            : [],

        hour,

        minute,

        intervalHours:
          normalized.scheduleType ===
            "interval"
            ? Number(
              normalized.intervalHours
            )
            : null,

        anchorDate:
          normalized.scheduleType ===
            "interval"
            ? normalized.anchorDate
            : null,

        anchorHour:
          Number(
            normalized.anchorHour
          ),

        anchorMinute:
          Number(
            normalized.anchorMinute
          ),

        timezone:
          normalized.timezone ||
          PRIMARY_TIMEZONE,

        active:
          normalized.active ===
          true,
      };

      /*
       * Update the UI immediately.
       */
      setRaids(
        (current) => {
          const exists =
            current.some(
              (raid) =>
                canonicalRaidId(
                  raid
                ) === id
            );

          const updated =
            exists
              ? current.map(
                (raid) =>
                  canonicalRaidId(
                    raid
                  ) === id
                    ? finalRaid
                    : raid
              )
              : [
                ...current,
                finalRaid,
              ];

          return deduplicateRaids(
            updated
          );
        }
      );

      /*
       * Save to Firebase.
       */
      if (
        firebaseConfigured &&
        db
      ) {
        await setDoc(
          doc(
            db,
            "raids",
            id
          ),
          finalRaid,
          {
            merge: true,
          }
        );
      }

      /*
       * Close only after successful save.
       */
      setEditingRaid(null);
      setSaveError("");
    } catch (error) {
      console.error(
        "Failed saving raid:",
        error
      );

      setSaveError(
        error?.message ||
        "Failed to save raid schedule."
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="raid-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="raid-page-header">

        <div>

          <div className="raid-page-kicker">
            RAN ONLINE EP7
          </div>

          <h1>
            Raid Schedule
          </h1>

          <p>
            Track the actual
            spawn schedule.
            Attendance is
            recorded separately.
          </p>

        </div>


      </div>


      {/* =================================================
          NEXT RAID
      ================================================= */}

      <section className="raid-next-section">

        <div className="raid-section-heading">

          <div>

            <span className="raid-section-label">
              NEXT RAID
            </span>

            <h2>
              Nearest spawn
              for each active
              raid
            </h2>

          </div>

          <div className="raid-current-time">
            {formatDateTime(
              now,
              resolvedTimezone
            )}
          </div>

        </div>


        {loading ? (

          <div className="raid-loading">
            Loading raid
            schedules...
          </div>

        ) : (

          <div className="raid-card-grid">

            {nextRaids.map(
              ({
                raid,
                next,
              }) => (

                <article
                  className={`raid-card ${raidAccentClass(
                    raid
                  )}`}
                  key={canonicalRaidId(
                    raid
                  )}
                >

                  <div className="raid-card-top">

                    <div className="raid-boss-icon">
                      <img
                        src={raidBossImage(raid)}
                        alt={`${raid.name} boss`}
                        className="raid-boss-icon-image"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    </div>

                    <div className="raid-card-title">

                      <div className="raid-type">
                        {raid.type}
                      </div>

                      <h3>
                        {raid.name}
                      </h3>

                    </div>

                    <div className="raid-status active">
                      ACTIVE
                    </div>

                  </div>


                  <div className="raid-card-next">

                    <span>
                      NEXT RAID
                    </span>

                    <strong>
                      {next
                        ? formatDateTime(
                          next,
                          resolvedTimezone
                        )
                        : "No upcoming spawn"}
                    </strong>

                  </div>


                  <div className="raid-countdown">

                    {next
                      ? formatCountdown(
                        next,
                        now
                      )
                      : "—"}

                  </div>


                  <div className="raid-card-details">

                    <div className="raid-detail">

                      <span>
                        RECURRENCE
                      </span>

                      <strong>
                        {formatRecurrence(
                          raid
                        )}
                      </strong>

                    </div>


                    <div className="raid-detail">

                      <span>
                        SERVER TIME
                      </span>

                      <strong>
                        {formatTimeOnly(
                          raid,
                          raid.timezone ||
                          PRIMARY_TIMEZONE
                        )}
                      </strong>

                    </div>


                    <div className="raid-detail">

                      <span>
                        PHILIPPINES
                      </span>

                      <strong>
                        {formatPHT(
                          next
                        )}
                      </strong>

                    </div>


                    <div className="raid-detail">

                      <span>
                        DISPLAY
                      </span>

                      <strong>
                        {resolvedTimezone}
                      </strong>

                    </div>

                  </div>


                  <div className="raid-card-description">

                    {raid.scheduleType ===
                      "interval"
                      ? `Spawns every ${raid.intervalHours} hours based on the configured anchor time.`
                      : raid.scheduleType ===
                        "weekly"
                        ? `Scheduled ${formatRecurrence(
                          raid
                        )}.`
                        : "Scheduled once every day."}

                  </div>


                  <div className="raid-card-footer">

                    <div className="raid-last-updated">
                      Schedule stored
                      in Firebase
                    </div>

                    <button
                      type="button"
                      className="raid-edit-button"
                      onClick={() =>
                        openEditor(
                          raid
                        )
                      }
                    >
                      EDIT SCHEDULE
                    </button>

                  </div>

                </article>

              )
            )}

          </div>

        )}

      </section>


      {/* =================================================
          UPCOMING SPAWNS
      ================================================= */}

      <section className="raid-upcoming-section">

        <div className="raid-section-heading">

          <div>

            <span className="raid-section-label">
              UPCOMING SPAWNS
            </span>

            <h2>
              Future occurrences
            </h2>

          </div>

        </div>


        <div className="raid-upcoming-controls">

          {/* STATUS */}

          <div className="raid-filter-group">

            <span className="raid-filter-label">
              STATUS
            </span>

            <div className="raid-filter-buttons">

              {[
                [
                  "active",
                  "Active",
                ],
                [
                  "all",
                  "All",
                ],
                [
                  "inactive",
                  "Inactive",
                ],
              ].map(
                ([value, label]) => (

                  <button
                    key={value}
                    type="button"
                    className={
                      upcomingFilter ===
                        value
                        ? "raid-filter-button active"
                        : "raid-filter-button"
                    }
                    onClick={() =>
                      setUpcomingFilter(
                        value
                      )
                    }
                  >
                    {label}
                  </button>

                )
              )}

            </div>

          </div>


          {/* BOSS */}

          <div className="raid-filter-group">

            <span className="raid-filter-label">
              BOSS
            </span>

            <select
              className="raid-boss-filter"
              value={
                bossFilter
              }
              onChange={(
                event
              ) =>
                setBossFilter(
                  event.target.value
                )
              }
            >

              <option value="all">
                All Bosses
              </option>

              {raids.map(
                (raid) => (

                  <option
                    key={canonicalRaidId(
                      raid
                    )}
                    value={canonicalRaidId(
                      raid
                    )}
                  >
                    {raid.name}
                  </option>

                )
              )}

            </select>

          </div>


          {/* DAYS */}

          <div className="raid-filter-group">

            <span className="raid-filter-label">
              SHOW NEXT
            </span>

            <div className="raid-filter-buttons">

              {[1, 3, 5, 7].map(
                (days) => (

                  <button
                    key={days}
                    type="button"
                    className={
                      upcomingDays ===
                        days
                        ? "raid-filter-button active"
                        : "raid-filter-button"
                    }
                    onClick={() =>
                      setUpcomingDays(
                        Math.min(
                          MAX_UPCOMING_DAYS,
                          days
                        )
                      )
                    }
                  >
                    {days} Day
                    {days !== 1
                      ? "s"
                      : ""}
                  </button>

                )
              )}

            </div>

          </div>

        </div>


        <div className="raid-upcoming-table-wrap">

          <table className="raid-upcoming-table">

            <thead>

              <tr>

                <th>
                  Boss
                </th>

                <th>
                  Type
                </th>

                <th>
                  Spawn
                </th>

                <th>
                  Philippines
                </th>

                <th>
                  Countdown
                </th>

                <th>
                  Status
                </th>

              </tr>

            </thead>


            <tbody>

              {upcomingOccurrences.length ===
                0 ? (

                <tr>

                  <td
                    colSpan="6"
                    className="raid-empty"
                  >
                    No upcoming
                    spawns match
                    the selected
                    filters.
                  </td>

                </tr>

              ) : (

                upcomingOccurrences.map(
                  (item) => (

                    <tr
                      key={
                        item.id
                      }
                    >

                      <td>

                        <div className="raid-table-boss">

                          <span
                            className={`raid-table-icon ${raidAccentClass(
                              item.raid
                            )}`}
                          >
                            <img
                              src={raidBossImage(item.raid)}
                              alt={`${item.raid.name} boss`}
                              className="raid-table-icon-image"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                display: "block",
                              }}
                            />
                          </span>

                          <strong>
                            {
                              item
                                .raid
                                .name
                            }
                          </strong>

                        </div>

                      </td>


                      <td>
                        {
                          item
                            .raid
                            .type
                        }
                      </td>


                      <td>
                        {formatDateTime(
                          item.date,
                          resolvedTimezone
                        )}
                      </td>


                      <td>
                        {formatPHT(
                          item.date
                        )}
                      </td>


                      <td>

                        <strong>
                          {formatCountdown(
                            item.date,
                            now
                          )}
                        </strong>

                      </td>


                      <td>

                        <span
                          className={
                            item
                              .raid
                              .active
                              ? "raid-table-status active"
                              : "raid-table-status inactive"
                          }
                        >
                          {item
                            .raid
                            .active
                            ? "ACTIVE"
                            : "INACTIVE"}
                        </span>

                      </td>

                    </tr>

                  )
                )

              )}

            </tbody>

          </table>

        </div>

      </section>


      {/* =================================================
          EDIT MODAL
      ================================================= */}

      {editingRaid && (

        <Modal
          open={Boolean(
            editingRaid
          )}

          title={`Edit ${editingRaid.name} Schedule`}

          onClose={closeEditor}
        >

          <div className="raid-editor">

            {/* ACTIVE */}

            <div className="raid-editor-row">

              <label>
                Active

                <input
                  type="checkbox"
                  checked={
                    editingRaid.active ===
                    true
                  }
                  onChange={(
                    event
                  ) =>
                    setEditingRaid(
                      (current) => ({
                        ...current,
                        active:
                          event.target
                            .checked,
                      })
                    )
                  }
                />

              </label>

            </div>


            {/* SCHEDULE TYPE */}

            <div className="raid-editor-row">

              <label>
                Schedule Type

                <select
                  value={
                    editingRaid.scheduleType
                  }
                  onChange={(
                    event
                  ) =>
                    setEditingRaid(
                      (current) => ({
                        ...current,
                        scheduleType:
                          event.target
                            .value,
                      })
                    )
                  }
                >

                  <option value="daily">
                    Daily
                  </option>

                  <option value="weekly">
                    Weekly
                  </option>

                  <option value="interval">
                    Interval
                  </option>

                </select>

              </label>

            </div>


            {/* WEEKLY DAYS */}

            {editingRaid.scheduleType ===
              "weekly" && (

                <div className="raid-editor-row">

                  <label>
                    Days
                  </label>

                  <DaySelector
                    selectedDays={
                      editingRaid.days
                    }
                    onChange={(
                      days
                    ) =>
                      setEditingRaid(
                        (current) => ({
                          ...current,
                          days,
                        })
                      )
                    }
                  />

                </div>

              )}


            {/* INTERVAL */}

            {editingRaid.scheduleType ===
              "interval" && (

                <>

                  <div className="raid-editor-row">

                    <label>

                      Interval
                      Hours

                      <input
                        type="number"
                        min="1"
                        max="720"
                        step="1"
                        value={
                          editingRaid.intervalHours ??
                          ""
                        }
                        onChange={(
                          event
                        ) =>
                          setEditingRaid(
                            (current) => ({
                              ...current,

                              intervalHours:
                                event.target
                                  .value ===
                                  ""
                                  ? null
                                  : Number(
                                    event
                                      .target
                                      .value
                                  ),
                            })
                          )
                        }
                      />

                    </label>

                  </div>


                  <div className="raid-editor-row">

                    <label>

                      Anchor Date

                      <input
                        type="date"
                        value={
                          editingRaid.anchorDate ||
                          ""
                        }
                        onChange={(
                          event
                        ) =>
                          setEditingRaid(
                            (current) => ({
                              ...current,

                              anchorDate:
                                event.target
                                  .value,
                            })
                          )
                        }
                      />

                    </label>

                  </div>

                </>

              )}


            {/* TIMEZONE */}

            <div className="raid-editor-row">

              <label>

                Timezone

                <select
                  value={
                    editingRaid.timezone ||
                    PRIMARY_TIMEZONE
                  }
                  onChange={(
                    event
                  ) =>
                    setEditingRaid(
                      (current) => ({
                        ...current,

                        timezone:
                          event.target
                            .value,
                      })
                    )
                  }
                >

                  {TIMEZONES
                    .filter(
                      (item) =>
                        item.value !==
                        "Automatic"
                    )
                    .map(
                      (timezone) => (

                        <option
                          key={
                            timezone.value
                          }
                          value={
                            timezone.value
                          }
                        >
                          {
                            timezone.label
                          }
                        </option>

                      )
                    )}

                </select>

              </label>

            </div>


            {/* SPAWN TIME */}

            <div className="raid-editor-row">

              <label>
                Spawn Time
              </label>

              <TimePicker
                value={{
                  hour:
                    Number(
                      editingRaid.hour
                    ) || 0,

                  minute:
                    Number(
                      editingRaid.minute
                    ) || 0,
                }}

                onChange={(
                  value
                ) => {

                  if (
                    !value ||
                    typeof value !==
                    "object"
                  ) {
                    return;
                  }

                  const hour =
                    Number(
                      value.hour
                    );

                  const minute =
                    Number(
                      value.minute
                    );

                  if (
                    !Number.isFinite(
                      hour
                    ) ||
                    !Number.isFinite(
                      minute
                    )
                  ) {
                    return;
                  }

                  setEditingRaid(
                    (current) => ({
                      ...current,

                      hour,

                      minute,

                      /*
                       * For interval schedules,
                       * TimePicker controls the
                       * anchor time too.
                       */
                      ...(current.scheduleType ===
                        "interval"
                        ? {
                          anchorHour:
                            hour,

                          anchorMinute:
                            minute,
                        }
                        : {}),
                    })
                  );
                }}
              />

            </div>


            {/* SAVE ERROR */}

            {saveError && (

              <div className="raid-save-error">
                {saveError}
              </div>

            )}


            {/* ACTIONS */}

            <div className="raid-editor-actions">

              <button
                type="button"
                className="raid-cancel-button"
                disabled={
                  saving
                }
                onClick={
                  closeEditor
                }
              >
                CANCEL
              </button>


              <button
                type="button"
                className="raid-save-button"
                disabled={
                  saving
                }
                onClick={
                  saveRaid
                }
              >
                {saving
                  ? "SAVING..."
                  : "SAVE SCHEDULE"}
              </button>

            </div>

          </div>

        </Modal>

      )}

    </div>
  );
}