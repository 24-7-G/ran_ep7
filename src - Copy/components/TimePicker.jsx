import { useEffect, useState } from "react";

function formatTimeValue(value) {
  const h = Number(value?.hour ?? 12);
  const m = Number(value?.minute ?? 0);
  const hh = h % 12 || 12;
  const mm = String(Math.max(0, Math.min(59, m))).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  return `${hh}:${mm} ${ap}`;
}

function parseTimeInput(raw) {
  const text = String(raw ?? "").trim().toUpperCase();

  // Accept: 7:37 AM, 07:37 AM, 7:37AM, 7:37 PM
  const match = text.match(/^(\d{1,2})\s*:\s*(\d{1,2})\s*(AM|PM)$/);
  if (!match) return null;

  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  const ap = match[3];

  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
    return null;
  }

  let hour = hour12 % 12;
  if (ap === "PM") hour += 12;

  return { hour, minute };
}

export default function TimePicker({ value, onChange }) {
  const [inputValue, setInputValue] = useState(() => formatTimeValue(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setInputValue(formatTimeValue(value));
    setInvalid(false);
  }, [value?.hour, value?.minute]);

  const handleChange = (event) => {
    setInputValue(event.target.value);
    setInvalid(false);
  };

  const commit = () => {
    const parsed = parseTimeInput(inputValue);

    if (!parsed) {
      setInvalid(true);
      setInputValue(formatTimeValue(value));
      return;
    }

    setInvalid(false);
    setInputValue(formatTimeValue(parsed));
    onChange(parsed);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  return (
    <div className="time-picker">
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder="7:00 AM"
        inputMode="text"
        autoComplete="off"
        aria-label="Exact spawn time"
        aria-invalid={invalid}
        className={invalid ? "time-picker-invalid" : ""}
      />
      {invalid && (
        <small className="time-picker-error">Use h:mm AM/PM</small>
      )}
    </div>
  );
}
