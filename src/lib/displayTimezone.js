import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { browserTimezone } from "./time";

export const DISPLAY_TIMEZONE_STORAGE_KEY = "ran_display_timezone";
export const DISPLAY_TIMEZONE_EVENT = "ran-display-timezone-change";
export const AUTOMATIC_TIMEZONE = "Automatic";

/*
 * Global application-wide display timezone.
 * App.jsx owns the state; every page reads the same value.
 */
export const DisplayTimezoneContext = createContext(null);

export function DisplayTimezoneProvider({ children }) {
    const timezone = useDisplayTimezone();

    return createElement(
        DisplayTimezoneContext.Provider,
        { value: timezone },
        children
    );
}

export function useGlobalDisplayTimezone() {
    const context = useContext(DisplayTimezoneContext);

    if (context) {
        return context;
    }

    // Safe fallback for components rendered outside App's provider.
    return useDisplayTimezone();
}

/*
 * "Automatic" means the user's actual browser timezone.
 *
 * IMPORTANT:
 * This is ONLY the display timezone.
 * It must never be used to calculate the actual raid schedule.
 */
export function resolveDisplayTimezone(value) {
    if (!value || value === AUTOMATIC_TIMEZONE) {
        return browserTimezone;
    }

    return value;
}

export function readDisplayTimezone() {
    try {
        return (
            window.localStorage.getItem(DISPLAY_TIMEZONE_STORAGE_KEY) ||
            AUTOMATIC_TIMEZONE
        );
    } catch {
        return AUTOMATIC_TIMEZONE;
    }
}

export function writeDisplayTimezone(value) {
    const next = value || AUTOMATIC_TIMEZONE;

    try {
        window.localStorage.setItem(
            DISPLAY_TIMEZONE_STORAGE_KEY,
            next
        );

        /*
         * storage does NOT fire in the same browser tab that
         * changed localStorage, so we also dispatch our own event.
         */
        window.dispatchEvent(
            new CustomEvent(DISPLAY_TIMEZONE_EVENT, {
                detail: next,
            })
        );
    } catch {
        // Ignore localStorage errors.
    }

    return next;
}

export function useDisplayTimezone() {
    const [displayTimezone, setDisplayTimezoneState] =
        useState(readDisplayTimezone);

    useEffect(() => {
        const handleStorage = (event) => {
            if (event.key !== DISPLAY_TIMEZONE_STORAGE_KEY) {
                return;
            }

            setDisplayTimezoneState(
                event.newValue || AUTOMATIC_TIMEZONE
            );
        };

        const handleCustomChange = (event) => {
            setDisplayTimezoneState(
                event.detail || AUTOMATIC_TIMEZONE
            );
        };

        window.addEventListener("storage", handleStorage);

        window.addEventListener(
            DISPLAY_TIMEZONE_EVENT,
            handleCustomChange
        );

        return () => {
            window.removeEventListener(
                "storage",
                handleStorage
            );

            window.removeEventListener(
                DISPLAY_TIMEZONE_EVENT,
                handleCustomChange
            );
        };
    }, []);

    const resolvedTimezone = useMemo(
        () => resolveDisplayTimezone(displayTimezone),
        [displayTimezone]
    );

    function setDisplayTimezone(value) {
        const next = writeDisplayTimezone(value);

        setDisplayTimezoneState(next);
    }

    return {
        displayTimezone,
        resolvedTimezone,
        setDisplayTimezone,
    };
}

/*
 * Returns YYYY-MM-DD in the supplied DISPLAY timezone.
 *
 * Never use Date#getDate(), getMonth(), etc. for this.
 */
export function dateKey(date, timezone) {
    const d = date instanceof Date ? date : new Date(date);

    if (Number.isNaN(d.getTime())) {
        return "";
    }

    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || browserTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return `${values.year}-${values.month}-${values.day}`;
}

/*
 * 12-hour time.
 *
 * Examples:
 * 5:30 AM
 * 2:50 PM
 */
export function format12(
    date,
    timezone,
    options = {}
) {
    const d = date instanceof Date ? date : new Date(date);

    if (Number.isNaN(d.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || browserTimezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        ...options,
    }).format(d);
}

/*
 * Full date + 12-hour time.
 *
 * Example:
 * Sep 4, 2026, 5:30 AM
 */

export function timezoneAbbreviation(date, timezone) {
    const d = date instanceof Date ? date : new Date(date);

    if (Number.isNaN(d.getTime())) {
        return "";
    }

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

export function formatTimeWithTimezone(date, timezone) {
    const time = format12(date, timezone);
    const zone = timezoneAbbreviation(date, timezone);
    return zone ? `${time} ${zone}` : time;
}

export function formatDateTimeWithTimezone(date, timezone) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "—";

    const dateText = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || browserTimezone,
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(d);

    return `${dateText}, ${formatTimeWithTimezone(d, timezone)}`;
}

export function formatDateTime12(
    date,
    timezone
) {
    return format12(
        date,
        timezone,
        {
            year: "numeric",
            month: "short",
            day: "numeric",
        }
    );
}

/*
 * Full calendar header.
 *
 * Example:
 * Friday, September 4, 2026
 */
export function formatDayHeader(
    date,
    timezone
) {
    const d = date instanceof Date ? date : new Date(date);

    if (Number.isNaN(d.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || browserTimezone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(d);
}

/*
 * Move a YYYY-MM-DD calendar key without
 * allowing browser timezone to interfere.
 */
export function shiftDateKey(key, days) {
    const [year, month, day] = String(key)
        .split("-")
        .map(Number);

    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
    ) {
        return key;
    }

    return new Date(
        Date.UTC(
            year,
            month - 1,
            day + Number(days || 0),
            12
        )
    )
        .toISOString()
        .slice(0, 10);
}