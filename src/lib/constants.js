export const ADMIN_UID = "oKGRQDdmiXUFuyRPDw5QsPBmsAD2";
export const PRIMARY_TIMEZONE = "Asia/Manila";

export const DEFAULT_RAIDS = [
  {
    id: "sonya",
    name: "Sonya",
    type: "BOSS RAID",
    scheduleType: "weekly",
    days: ["Wednesday"],
    hour: 21,
    minute: 0,
    intervalHours: null,
    anchorDate: null,
    anchorHour: null,
    anchorMinute: null,
    timezone: PRIMARY_TIMEZONE,
    active: true
  },
  {
    id: "geomancer",
    name: "Geomancer",
    type: "MINI BOSS",
    scheduleType: "interval",
    days: [],
    hour: 12,
    minute: 0,
    intervalHours: 10,
    anchorDate: "2026-09-02",
    anchorHour: 12,
    anchorMinute: 0,
    timezone: PRIMARY_TIMEZONE,
    active: true
  },
  {
    id: "reflector",
    name: "Reflector",
    type: "MINI BOSS",
    scheduleType: "daily",
    days: [],
    hour: 12,
    minute: 0,
    intervalHours: null,
    anchorDate: null,
    anchorHour: null,
    anchorMinute: null,
    timezone: PRIMARY_TIMEZONE,
    active: true
  },
  {
    id: "giant-hawk",
    name: "Giant Hawk",
    type: "MINI BOSS",
    scheduleType: "daily",
    days: [],
    hour: 12,
    minute: 0,
    intervalHours: null,
    anchorDate: null,
    anchorHour: null,
    anchorMinute: null,
    timezone: PRIMARY_TIMEZONE,
    active: true
  }
];

export const TIMEZONES = [
  { value: "Automatic", label: "Automatic — My Browser" },
  { value: "Asia/Manila", label: "Philippines — Manila" },
  { value: "America/Los_Angeles", label: "US Pacific — Los Angeles / Seattle" },
  { value: "America/Denver", label: "US Mountain — Denver" },
  { value: "America/Chicago", label: "US Central — Chicago" },
  { value: "America/New_York", label: "US Eastern — New York" },
  { value: "Asia/Tokyo", label: "Japan — Tokyo" },
  { value: "Asia/Seoul", label: "South Korea — Seoul" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Australia/Sydney", label: "Australia — Sydney" },
  { value: "Europe/London", label: "United Kingdom — London" },
  { value: "UTC", label: "UTC" }
];

export const GUILD_CLASSES = ["Swordman", "Archer", "Gunner", "Shaman", "Extreme", "Brawler"];
export const CLASSES = GUILD_CLASSES;

export const BH_BOSSES = [
  { id: "sonya", name: "Sonya", points: 1.0 },
  { id: "geomancer", name: "Geomancer", points: 0.2 },
  { id: "reflector", name: "Reflector", points: 0.2 },
  { id: "giant-hawk", name: "Giant Hawk", points: 0.2 }
];

export const BH_CLAIM_THRESHOLD = 6.0;
export const CW_DAYS = ["Monday", "Wednesday", "Friday", "Sunday"];

export const DEFAULT_CW_REWARDS = {
  Swordman: 0, Archer: 0, Gunner: 0,
  Shaman: 0, Extreme: 0, Brawler: 0
};

export const DEFAULT_CW_SETTINGS = {
  notice: "Eligible players may claim the reward for each attended Castle War.",
  rewards: { ...DEFAULT_CW_REWARDS },
  startingGold: 0
};