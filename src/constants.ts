export const ACADEMIC_SUBJECTS = {
  ELEMENTARY: [
    { name: "Matematika", code: "MTK" },
    { name: "IPA", code: "IPA" },
    { name: "IPS", code: "IPS" },
    { name: "Bahasa Indonesia", code: "BIN" },
    { name: "English", code: "ENG" },
    { name: "Agama & Budi Pekerti", code: "AGM" },
    { name: "PKn", code: "PKN" },
    { name: "SBdP", code: "SBP" },
    { name: "PJOK", code: "PJK" },
    { name: "Pendidikan Al-Quran", code: "PAQ" },
    { name: "ICT", code: "ICT" }
  ],
  JUNIOR_HIGH: [
    { name: "Matematika", code: "MTK" },
    { name: "IPA", code: "IPA" },
    { name: "IPS", code: "IPS" },
    { name: "Bahasa Indonesia", code: "BIN" },
    { name: "English", code: "ENG" },
    { name: "Pendidikan Agama Islam", code: "PAI" },
    { name: "PKn", code: "PKN" },
    { name: "Seni Budaya", code: "SNB" },
    { name: "PJOK", code: "PJK" },
    { name: "Informatika", code: "INF" },
    { name: "Bahasa Arab", code: "BAR" },
    { name: "Pendidikan Al-Quran", code: "PAQ" }
  ]
};

export const ACADEMIC_GRADES = {
  ELEMENTARY: ["1", "2", "3", "4", "5", "6"],
  JUNIOR_HIGH: ["7", "8", "9"]
};

export const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

export const CICO_SESSIONS = [
  { id: "class_time", label: "Class Time", time: "07:30–08:10" },
  { id: "ram_ceremony", label: "RAM/Ceremony/Teen Talk", time: "08:10–08:40" },
  { id: "learning_journey", label: "Learning Journey", time: "08:40–10:40" },
  { id: "recess_time", label: "Recess Time", time: "10:10–10:40" },
  { id: "weekly_lesson", label: "Weekly Lesson/SE", time: "10:40–11:40" },
  { id: "daily_reflection", label: "Daily Reflection", time: "11:40–12:20" },
  { id: "lunch_kirei", label: "Lunch & Kirei", time: "12:20–12:45" },
  { id: "dhuhur_prayer", label: "Dhuhur Prayer", time: "12:45–13:25" },
  { id: "ua_rest", label: "UA/REST", time: "13:25–14:35" }
];

export const CICO_DEFAULT_GOALS = [
  "Constructive Criticism",
  "Cooperative",
  "Respect Others",
  "Being More Mature"
];
