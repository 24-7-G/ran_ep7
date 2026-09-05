export const browserTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/*
============================================================
 TIMEZONE UTILITIES
============================================================
*/

export function partsInTimezone(
  date,
  timezone = browserTimezone
) {
  const d = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(d);

    const out = {};

    for (const p of parts) {
      if (p.type !== "literal") {
        out[p.type] = p.value;
      }
    }

    return {
      year: Number(out.year),
      month: Number(out.month),
      day: Number(out.day),
      hour: Number(out.hour),
      minute: Number(out.minute),
      second: Number(out.second)
    };
  } catch {
    return null;
  }
}

/*
============================================================
 TIMEZONE OFFSET
============================================================
*/

function tzOffsetMs(date, timezone) {
  const p = partsInTimezone(date, timezone);

  if (!p) return 0;

  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );

  return asUtc - date.getTime();
}

/*
============================================================
 ZONED LOCAL TIME -> UTC
============================================================
*/

export function zonedTimeToUtc(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  timezone = browserTimezone
) {
  const target = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  let guess = new Date(target);

  for (let i = 0; i < 5; i++) {
    const offset = tzOffsetMs(
      guess,
      timezone || "UTC"
    );

    const next = new Date(
      target - offset
    );

    if (
      Math.abs(
        next.getTime() - guess.getTime()
      ) < 1000
    ) {
      return next;
    }

    guess = next;
  }

  return guess;
}

/*
============================================================
 DATE STRING + LOCAL TIME -> UTC
============================================================
*/

export function zonedDateToUtc(
  dateString,
  hour = 0,
  minute = 0,
  timezone = browserTimezone
) {
  if (!dateString) return null;

  const match = String(dateString).match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return zonedTimeToUtc(
    year,
    month,
    day,
    Number(hour) || 0,
    Number(minute) || 0,
    0,
    timezone || "UTC"
  );
}

/*
============================================================
 PHILIPPINE TIME
============================================================
*/

export function getPHTParts(
  date = new Date()
) {
  return partsInTimezone(
    date,
    "Asia/Manila"
  );
}

/*
============================================================
 FORMATTING
============================================================
*/

function timezoneAbbreviation(date, timezone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  const tz = timezone || browserTimezone;
  if (tz === "Asia/Manila") return "PHT";
  if (tz === "UTC") return "UTC";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
      hour: "numeric",
      minute: "2-digit",
    }).formatToParts(d);
    return parts.find((part) => part.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

export function formatDateTime(
  date,
  timezone = browserTimezone
) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";

  const dateText = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || browserTimezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);

  const timeText = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || browserTimezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  const zone = timezoneAbbreviation(d, timezone);
  return `${dateText}, ${timeText}${zone ? ` ${zone}` : ""}`;
}
export function formatPHTDateTime(
  date
) {
  return formatDateTime(
    date,
    "Asia/Manila"
  );
}

export const formatDateTimePHT =
  formatPHTDateTime;

export function formatDateOnly(
  date,
  timezone = browserTimezone
) {
  if (!date) return "—";

  const d =
    date instanceof Date
      ? date
      : new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone || "UTC",
        year: "numeric",
        month: "short",
        day: "numeric"
      }
    ).format(d);
  } catch {
    return "—";
  }
}

export function formatTime(
  date,
  timezone = browserTimezone
) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";

  const timeText = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || browserTimezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  const zone = timezoneAbbreviation(d, timezone);
  return `${timeText}${zone ? ` ${zone}` : ""}`;
}
export const formatTimeOnly =
  formatTime;

/*
============================================================
 COUNTDOWN
============================================================
*/

export function countdown(
  target,
  now = new Date()
) {
  const targetDate =
    target instanceof Date
      ? target
      : new Date(target);

  if (
    Number.isNaN(targetDate.getTime())
  ) {
    return "—";
  }

  const nowDate =
    now instanceof Date
      ? now
      : new Date(now);

  const ms = Math.max(
    0,
    targetDate.getTime() -
    nowDate.getTime()
  );

  const total = Math.floor(
    ms / 1000
  );

  const days = Math.floor(
    total / 86400
  );

  const hours = Math.floor(
    (total % 86400) / 3600
  );

  const minutes = Math.floor(
    (total % 3600) / 60
  );

  const seconds =
    total % 60;

  if (days) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

/*
============================================================
 FIRESTORE DATE
============================================================
*/

export function parseFirestoreTimestamp(
  value
) {
  if (!value) return null;

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? null
    : d;
}

/*
============================================================
 WEEKDAY
============================================================
*/

function weekdayIndex(name) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ].indexOf(name);
}

/*
============================================================
 BUILD LOCAL DAY
============================================================
*/

function getLocalDay(
  now,
  timezone,
  addDays
) {
  const p = partsInTimezone(
    now,
    timezone
  );

  if (!p) return null;

  /*
    Use UTC only as a calendar container.
    We then extract the calendar date.
  */
  const base = new Date(
    Date.UTC(
      p.year,
      p.month - 1,
      p.day + addDays,
      12,
      0,
      0
    )
  );

  const q = partsInTimezone(
    base,
    timezone
  );

  return q;
}

/*
============================================================
 DAILY
============================================================
*/

function nextDaily(
  raid,
  now
) {
  const timezone =
    raid.timezone ||
    "Asia/Manila";

  const hour =
    Number(raid.hour);

  const minute =
    Number(raid.minute);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  for (
    let add = 0;
    add <= 3;
    add++
  ) {
    const q = getLocalDay(
      now,
      timezone,
      add
    );

    if (!q) continue;

    const candidate =
      zonedTimeToUtc(
        q.year,
        q.month,
        q.day,
        hour,
        minute,
        0,
        timezone
      );

    if (
      candidate &&
      candidate > now
    ) {
      return candidate;
    }
  }

  return null;
}

/*
============================================================
 WEEKLY
============================================================
*/

function nextWeekly(
  raid,
  now
) {
  const timezone =
    raid.timezone ||
    "Asia/Manila";

  const wanted =
    raid.days?.[0] ||
    raid.day ||
    "Wednesday";

  const target =
    weekdayIndex(wanted);

  if (target < 0) {
    return null;
  }

  const hour =
    Number(raid.hour);

  const minute =
    Number(raid.minute);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  for (
    let add = 0;
    add <= 14;
    add++
  ) {
    const q = getLocalDay(
      now,
      timezone,
      add
    );

    if (!q) continue;

    const weekday =
      new Date(
        Date.UTC(
          q.year,
          q.month - 1,
          q.day
        )
      ).getUTCDay();

    if (
      weekday !== target
    ) {
      continue;
    }

    const candidate =
      zonedTimeToUtc(
        q.year,
        q.month,
        q.day,
        hour,
        minute,
        0,
        timezone
      );

    if (
      candidate &&
      candidate > now
    ) {
      return candidate;
    }
  }

  return null;
}

/*
============================================================
 INTERVAL
============================================================
*/

function nextInterval(
  raid,
  now
) {
  const hours =
    Number(raid.intervalHours);

  if (
    !Number.isFinite(hours) ||
    hours <= 0
  ) {
    return null;
  }

  const timezone =
    raid.timezone ||
    "Asia/Manila";

  /*
    Preferred anchor.
  */
  let anchor = null;

  if (raid.anchorDate) {
    anchor =
      zonedDateToUtc(
        raid.anchorDate,
        Number(
          raid.anchorHour ??
          raid.hour ??
          0
        ),
        Number(
          raid.anchorMinute ??
          raid.minute ??
          0
        ),
        timezone
      );
  }

  /*
    If an old Firebase document has
    no anchorDate, recover instead of
    returning null and blanking the page.
  */
  if (!anchor) {
    const p =
      partsInTimezone(
        now,
        timezone
      );

    if (!p) {
      return null;
    }

    anchor =
      zonedTimeToUtc(
        p.year,
        p.month,
        p.day,
        Number(
          raid.anchorHour ??
          raid.hour ??
          0
        ),
        Number(
          raid.anchorMinute ??
          raid.minute ??
          0
        ),
        0,
        timezone
      );

    /*
      If today's recovered anchor is
      ahead of now, that's fine.

      If it is behind now, we use the
      interval calculation below.
    */
  }

  if (!anchor) {
    return null;
  }

  const step =
    hours * 60 * 60 * 1000;

  if (
    !Number.isFinite(step) ||
    step <= 0
  ) {
    return null;
  }

  const nowMs =
    now.getTime();

  const anchorMs =
    anchor.getTime();

  /*
    Before anchor:
    first occurrence is anchor.
  */
  if (nowMs < anchorMs) {
    return anchor;
  }

  /*
    Find next interval.
  */
  const elapsed =
    nowMs - anchorMs;

  const intervalsPassed =
    Math.floor(
      elapsed / step
    ) + 1;

  return new Date(
    anchorMs +
    intervalsPassed * step
  );
}

/*
============================================================
 NEXT RAID
============================================================
*/

export function getNextRaid(
  raid,
  now = new Date()
) {
  if (!raid) {
    return null;
  }

  if (raid.active === false) {
    return null;
  }

  const scheduleType =
    raid.scheduleType ||
    "daily";

  let result = null;

  if (
    scheduleType ===
    "interval"
  ) {
    result =
      nextInterval(
        raid,
        now
      );
  } else if (
    scheduleType ===
    "weekly"
  ) {
    result =
      nextWeekly(
        raid,
        now
      );
  } else {
    result =
      nextDaily(
        raid,
        now
      );
  }

  return result instanceof Date &&
    !Number.isNaN(
      result.getTime()
    )
    ? result
    : null;
}

/*
============================================================
 UPCOMING RAIDS
============================================================
*/

export function getUpcomingRaids(
  raid,
  count = 8,
  now = new Date()
) {
  const results = [];

  const wantedCount =
    Math.max(
      1,
      Number(count) || 8
    );

  let cursor =
    new Date(now);

  for (
    let i = 0;
    i < wantedCount;
    i++
  ) {
    const next =
      getNextRaid(
        raid,
        cursor
      );

    if (!next) {
      break;
    }

    /*
      Protect against duplicate
      occurrences.
    */
    if (
      !results.some(
        x =>
          x.getTime() ===
          next.getTime()
      )
    ) {
      results.push(next);
    }

    /*
      Move one second beyond
      the current occurrence.
    */
    cursor =
      new Date(
        next.getTime() + 1000
      );
  }

  return results;
}

export const nextRaidTime =
  getNextRaid;

/*
============================================================
 TIMEZONE LABEL
============================================================
*/

export function getTimezoneLabel(
  timezone
) {
  try {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          timezone || "UTC",
        timeZoneName: "short"
      }
    )
      .format(new Date())
      .split(", ")
      .pop();
  } catch {
    return timezone || "UTC";
  }
}