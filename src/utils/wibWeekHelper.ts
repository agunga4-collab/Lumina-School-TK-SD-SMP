/**
 * Helper terpusat untuk kalkulasi Minggu & Batas Waktu WIB (Asia/Jakarta, UTC+7).
 * Aturan:
 * - Minggu = Senin s/d Minggu
 * - weekStart = YYYY-MM-DD (hari Senin)
 * - weekEnd = YYYY-MM-DD (hari Minggu)
 * - Batas tepat waktu: Senin 12.00 WIB minggu berikutnya
 * - Siswa boleh mengisi minggu berjalan dan 2 minggu sebelumnya
 */

// Offset WIB = +7 jam (420 menit)
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface WeekPeriod {
  weekStart: string; // YYYY-MM-DD (Senin)
  weekEnd: string; // YYYY-MM-DD (Minggu)
  label: string; // "12 Okt - 18 Okt 2026"
  isCurrent: boolean;
  canStudentSubmit: boolean; // minggu berjalan dan 2 minggu sebelumnya
  deadlineWibString: string; // "Senin, 19 Okt 2026 12:00 WIB"
}

/**
 * Mengubah Date apapun ke representasi string WIB YYYY-MM-DD
 */
export function formatWibDate(date: Date = new Date()): string {
  // Format menggunakan toLocaleDateString dengan timeZone Asia/Jakarta
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  return parts; // 'YYYY-MM-DD'
}

/**
 * Mengambil tanggal Date yang dikompensasi ke jam WIB
 */
export function getNowWibDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + WIB_OFFSET_MS);
}

/**
 * Mencari hari Senin pada minggu dari tanggal tertentu (WIB)
 */
export function getMondayOfWeek(dateStringOrDate: string | Date = new Date()): string {
  let d: Date;
  if (typeof dateStringOrDate === 'string') {
    const [y, m, day] = dateStringOrDate.split('-').map(Number);
    d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  } else {
    const wibStr = formatWibDate(dateStringOrDate);
    const [y, m, day] = wibStr.split('-').map(Number);
    d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  }

  // Hari dalam seminggu: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const dayOfWeek = d.getUTCDay();
  // Jarak mundur ke hari Senin (jika Minggu = 0, mundur 6 hari; jika Senin = 1, mundur 0 hari)
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  d.setUTCDate(d.getUTCDate() - diffToMonday);

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Menghitung hari Minggu (akhir minggu) dari hari Senin
 */
export function getSundayOfWeek(mondayStr: string): string {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + 6);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
];

/**
 * Menghasilkan label rentang minggu dalam format Bahasa Indonesia
 * Contoh: "12 Okt - 18 Okt 2026"
 */
export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  if (!weekStart || !weekEnd) return '';
  const [, mStart, dStart] = weekStart.split('-').map(Number);
  const [yEnd, mEnd, dEnd] = weekEnd.split('-').map(Number);

  const monthStartName = MONTH_NAMES_ID[mStart - 1] || '';
  const monthEndName = MONTH_NAMES_ID[mEnd - 1] || '';

  if (mStart === mEnd) {
    return `${dStart} - ${dEnd} ${monthEndName} ${yEnd}`;
  }
  return `${dStart} ${monthStartName} - ${dEnd} ${monthEndName} ${yEnd}`;
}

/**
 * Menghitung deadline pengiriman tepat waktu untuk minggu tersebut:
 * Senin 12.00 WIB minggu berikutnya (weekStart + 7 hari, jam 12:00:00 WIB).
 */
export function getWeekDeadlineUtcMs(weekStart: string): number {
  const [y, m, d] = weekStart.split('-').map(Number);
  // Senin minggu berikutnya jam 12:00 WIB = 05:00 UTC
  const nextMonday = new Date(Date.UTC(y, m - 1, d + 7, 5, 0, 0));
  return nextMonday.getTime();
}

/**
 * Memeriksa apakah waktu saat ini melewati batas deadline (Senin 12:00 WIB berikutnya)
 */
export function isSubmissionLate(weekStart: string, submitDate: Date = new Date()): boolean {
  const deadlineMs = getWeekDeadlineUtcMs(weekStart);
  return submitDate.getTime() > deadlineMs;
}

/**
 * Menghasilkan daftar periode minggu (default 8 minggu ke belakang dari minggu berjalan)
 */
export function getRecentWeekPeriods(count: number = 8): WeekPeriod[] {
  const currentMonday = getMondayOfWeek(new Date());
  const periods: WeekPeriod[] = [];

  // Hitung mundur `count` minggu
  for (let i = 0; i < count; i++) {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const mondayDate = new Date(Date.UTC(y, m - 1, d - i * 7, 12, 0, 0));
    const year = mondayDate.getUTCFullYear();
    const month = String(mondayDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(mondayDate.getUTCDate()).padStart(2, '0');
    const wStart = `${year}-${month}-${day}`;
    const wEnd = getSundayOfWeek(wStart);

    // Deadline: Senin berikutnya jam 12.00 WIB
    const deadlineDate = new Date(Date.UTC(year, mondayDate.getUTCMonth(), mondayDate.getUTCDate() + 7, 12, 0, 0));
    const dDay = deadlineDate.getUTCDate();
    const dMonth = MONTH_NAMES_ID[deadlineDate.getUTCMonth()];
    const dYear = deadlineDate.getUTCFullYear();

    periods.push({
      weekStart: wStart,
      weekEnd: wEnd,
      label: formatWeekLabel(wStart, wEnd),
      isCurrent: i === 0,
      // Siswa boleh mengisi minggu berjalan (i=0) dan 2 minggu sebelumnya (i=1, i=2)
      canStudentSubmit: i <= 2,
      deadlineWibString: `Senin, ${dDay} ${dMonth} ${dYear} 12:00 WIB`
    });
  }

  return periods;
}

/**
 * Memeriksa apakah siswa diperbolehkan mengisi laporan untuk minggu tertentu
 * (hanya minggu berjalan dan 2 minggu sebelumnya)
 */
export function canStudentSubmitForWeek(weekStart: string): boolean {
  const recentAllowed = getRecentWeekPeriods(3);
  return recentAllowed.some(p => p.weekStart === weekStart);
}

// =========================================================================
// HELPER KHUSUS OSIS JUNIOR HIGH (Mulai 19-25 Oktober 2026)
// =========================================================================

export const OSIS_START_WEEK = '2026-10-19';

export interface OsisWeekPeriod {
  weekStart: string; // YYYY-MM-DD (Senin)
  weekEnd: string;   // YYYY-MM-DD (Minggu)
  label: string;     // "19 - 25 Okt 2026"
  isCurrent: boolean;
  deadlineMs: number;
  deadlineWibString: string;
}

/**
 * Menghasilkan daftar periode minggu OSIS (hanya minggu >= 2026-10-19).
 * Dari minggu berjalan mundur sampai 2026-10-19. Minggu sebelumnya tidak masuk pilihan.
 */
export function getOsisWeekPeriods(): OsisWeekPeriod[] {
  const currentMonday = getMondayOfWeek(new Date());
  // Jika minggu berjalan sebelum OSIS_START_WEEK, default ke OSIS_START_WEEK
  const effectiveMonday = currentMonday < OSIS_START_WEEK ? OSIS_START_WEEK : currentMonday;

  const periods: OsisWeekPeriod[] = [];
  let cur = effectiveMonday;

  // Mundur per minggu hingga sebelum OSIS_START_WEEK
  while (cur >= OSIS_START_WEEK) {
    const wStart = cur;
    const wEnd = getSundayOfWeek(wStart);
    const deadlineMs = getWeekDeadlineUtcMs(wStart);

    const [y, m, d] = wStart.split('-').map(Number);
    const mondayDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const deadlineDate = new Date(Date.UTC(y, mondayDate.getUTCMonth(), mondayDate.getUTCDate() + 7, 12, 0, 0));
    const dDay = deadlineDate.getUTCDate();
    const dMonth = MONTH_NAMES_ID[deadlineDate.getUTCMonth()];
    const dYear = deadlineDate.getUTCFullYear();

    periods.push({
      weekStart: wStart,
      weekEnd: wEnd,
      label: formatWeekLabel(wStart, wEnd),
      isCurrent: wStart === currentMonday,
      deadlineMs,
      deadlineWibString: `Senin, ${dDay} ${dMonth} ${dYear} 12:00 WIB`
    });

    const prevDate = new Date(Date.UTC(y, m - 1, d - 7, 12, 0, 0));
    const pYear = prevDate.getUTCFullYear();
    const pMonth = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
    const pDay = String(prevDate.getUTCDate()).padStart(2, '0');
    cur = `${pYear}-${pMonth}-${pDay}`;
  }

  // Jaminan ada minimal 1 periode (minggu pertama)
  if (periods.length === 0) {
    const wStart = OSIS_START_WEEK;
    const wEnd = getSundayOfWeek(wStart);
    periods.push({
      weekStart: wStart,
      weekEnd: wEnd,
      label: formatWeekLabel(wStart, wEnd),
      isCurrent: true,
      deadlineMs: getWeekDeadlineUtcMs(wStart),
      deadlineWibString: 'Senin, 26 Okt 2026 12:00 WIB'
    });
  }

  return periods;
}

/**
 * Memformat string ISO / timestamp ke tampilan tanggal & jam WIB
 * Contoh: "24 Okt 2026, 14:30 WIB"
 */
export function formatWibDateTime(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    return (
      new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(d) + ' WIB'
    );
  } catch {
    return String(dateInput);
  }
}

const ID_MONTH_MAP: Record<string, number> = {
  januari: 0, jan: 0,
  februari: 1, feb: 1,
  maret: 2, mar: 2,
  april: 3, apr: 3,
  mei: 4,
  juni: 5, jun: 5,
  juli: 6, jul: 6,
  agustus: 7, ags: 7, agt: 7,
  september: 8, sep: 8,
  oktober: 9, okt: 9,
  november: 10, nov: 10,
  desember: 11, des: 11
};

/**
 * Mencoba mem-parsing tanggal bergabung anggota (joinedAt atau createdAt).
 * Mendukung format ISO, YYYY-MM-DD, dan format teks Indonesia ("24 Oktober 2026").
 * Jika data tidak lengkap atau tidak valid, mengembalikan null agar tidak menebak riwayat.
 */
export function parseMembershipJoinDate(
  joinedAt?: string | null,
  createdAt?: string | null
): Date | null {
  const cleanJoined = (joinedAt || '').trim();
  if (cleanJoined) {
    // Format YYYY-MM-DD atau ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(cleanJoined)) {
      const d = new Date(cleanJoined);
      if (!isNaN(d.getTime())) return d;
    }
    // Format tanggal Indonesia "24 Oktober 2026"
    const match = cleanJoined.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthKey = match[2].toLowerCase();
      const year = parseInt(match[3], 10);
      if (monthKey in ID_MONTH_MAP) {
        const month = ID_MONTH_MAP[monthKey];
        const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        if (!isNaN(d.getTime())) return d;
      }
    }
    const standard = new Date(cleanJoined);
    if (!isNaN(standard.getTime())) return standard;
  }

  const cleanCreated = (createdAt || '').trim();
  if (cleanCreated) {
    const d = new Date(cleanCreated);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Menentukan apakah anggota memiliki kewajiban mengisi laporan pada weekStart tertentu.
 * Aturan:
 * - Minggu sebelum 2026-10-19 tidak memiliki kewajiban.
 * - Jika tanggal bergabung tersedia, tidak mewajibkan minggu sebelum anggota bergabung.
 * - Jika tanggal bergabung tidak lengkap/tidak ada, jangan menebak; tetap wajibkan untuk minggu OSIS yang valid.
 */
export function isMemberObligatedForOsisWeek(
  joinedAt?: string | null,
  createdAt?: string | null,
  weekStart: string = OSIS_START_WEEK
): boolean {
  if (weekStart < OSIS_START_WEEK) {
    return false;
  }

  const joinDate = parseMembershipJoinDate(joinedAt, createdAt);
  if (!joinDate) {
    // Data tidak lengkap, jangan menebak riwayat; anggap wajib sejak awal
    return true;
  }

  const joinMonday = getMondayOfWeek(joinDate);
  // Jika minggu laporan berada sebelum minggu anggota bergabung
  if (weekStart < joinMonday) {
    return false;
  }

  return true;
}

