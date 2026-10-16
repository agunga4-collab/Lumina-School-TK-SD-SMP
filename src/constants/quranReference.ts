/**
 * DATA REFERENSI AL-QUR'AN UNTUK FITUR "SAHABAT QUR'AN"
 * 
 * Modul ini berisi:
 * 1. SURAH_LIST (114 surat dengan nomor, nama, dan jumlah ayat)
 * 2. JUZ_BOUNDARIES (30 juz dengan nomor, awal surat:ayat, akhir surat:ayat)
 * 3. Helper functions: getSurahsInJuz, getAyahRangeForSurahInJuz, dll.
 * 4. Fungsi dan eksekusi pemeriksaan otomatis (validation suite)
 */

export interface Surah {
  readonly number: number;
  readonly name: string;
  readonly totalVerses: number;
}

export interface JuzBoundary {
  readonly juz: number;
  readonly startSurah: number;
  readonly startAyah: number;
  readonly endSurah: number;
  readonly endAyah: number;
}

export interface AyahRange {
  readonly startAyah: number;
  readonly endAyah: number;
}

export interface SurahInJuz {
  readonly surahNumber: number;
  readonly surahName: string;
  readonly totalVerses: number;
  readonly startAyah: number;
  readonly endAyah: number;
}

/**
 * SURAH_LIST (114 surat)
 * Disalin persis dari Data Resmi
 */
export const SURAH_LIST: readonly Surah[] = [
  { number: 1, name: "Al-Fatihah", totalVerses: 7 },
  { number: 2, name: "Al-Baqarah", totalVerses: 286 },
  { number: 3, name: "Ali 'Imran", totalVerses: 200 },
  { number: 4, name: "An-Nisa", totalVerses: 176 },
  { number: 5, name: "Al-Ma'idah", totalVerses: 120 },
  { number: 6, name: "Al-An'am", totalVerses: 165 },
  { number: 7, name: "Al-A'raf", totalVerses: 206 },
  { number: 8, name: "Al-Anfal", totalVerses: 75 },
  { number: 9, name: "At-Taubah", totalVerses: 129 },
  { number: 10, name: "Yunus", totalVerses: 109 },
  { number: 11, name: "Hud", totalVerses: 123 },
  { number: 12, name: "Yusuf", totalVerses: 111 },
  { number: 13, name: "Ar-Ra'd", totalVerses: 43 },
  { number: 14, name: "Ibrahim", totalVerses: 52 },
  { number: 15, name: "Al-Hijr", totalVerses: 99 },
  { number: 16, name: "An-Nahl", totalVerses: 128 },
  { number: 17, name: "Al-Isra", totalVerses: 111 },
  { number: 18, name: "Al-Kahf", totalVerses: 110 },
  { number: 19, name: "Maryam", totalVerses: 98 },
  { number: 20, name: "Taha", totalVerses: 135 },
  { number: 21, name: "Al-Anbiya", totalVerses: 112 },
  { number: 22, name: "Al-Hajj", totalVerses: 78 },
  { number: 23, name: "Al-Mu'minun", totalVerses: 118 },
  { number: 24, name: "An-Nur", totalVerses: 64 },
  { number: 25, name: "Al-Furqan", totalVerses: 77 },
  { number: 26, name: "Asy-Syu'ara", totalVerses: 227 },
  { number: 27, name: "An-Naml", totalVerses: 93 },
  { number: 28, name: "Al-Qasas", totalVerses: 88 },
  { number: 29, name: "Al-'Ankabut", totalVerses: 69 },
  { number: 30, name: "Ar-Rum", totalVerses: 60 },
  { number: 31, name: "Luqman", totalVerses: 34 },
  { number: 32, name: "As-Sajdah", totalVerses: 30 },
  { number: 33, name: "Al-Ahzab", totalVerses: 73 },
  { number: 34, name: "Saba", totalVerses: 54 },
  { number: 35, name: "Fatir", totalVerses: 45 },
  { number: 36, name: "Yasin", totalVerses: 83 },
  { number: 37, name: "As-Saffat", totalVerses: 182 },
  { number: 38, name: "Sad", totalVerses: 88 },
  { number: 39, name: "Az-Zumar", totalVerses: 75 },
  { number: 40, name: "Ghafir", totalVerses: 85 },
  { number: 41, name: "Fussilat", totalVerses: 54 },
  { number: 42, name: "Asy-Syura", totalVerses: 53 },
  { number: 43, name: "Az-Zukhruf", totalVerses: 89 },
  { number: 44, name: "Ad-Dukhan", totalVerses: 59 },
  { number: 45, name: "Al-Jasiyah", totalVerses: 37 },
  { number: 46, name: "Al-Ahqaf", totalVerses: 35 },
  { number: 47, name: "Muhammad", totalVerses: 38 },
  { number: 48, name: "Al-Fath", totalVerses: 29 },
  { number: 49, name: "Al-Hujurat", totalVerses: 18 },
  { number: 50, name: "Qaf", totalVerses: 45 },
  { number: 51, name: "Az-Zariyat", totalVerses: 60 },
  { number: 52, name: "At-Tur", totalVerses: 49 },
  { number: 53, name: "An-Najm", totalVerses: 62 },
  { number: 54, name: "Al-Qamar", totalVerses: 55 },
  { number: 55, name: "Ar-Rahman", totalVerses: 78 },
  { number: 56, name: "Al-Waqi'ah", totalVerses: 96 },
  { number: 57, name: "Al-Hadid", totalVerses: 29 },
  { number: 58, name: "Al-Mujadilah", totalVerses: 22 },
  { number: 59, name: "Al-Hasyr", totalVerses: 24 },
  { number: 60, name: "Al-Mumtahanah", totalVerses: 13 },
  { number: 61, name: "As-Saff", totalVerses: 14 },
  { number: 62, name: "Al-Jumu'ah", totalVerses: 11 },
  { number: 63, name: "Al-Munafiqun", totalVerses: 11 },
  { number: 64, name: "At-Tagabun", totalVerses: 18 },
  { number: 65, name: "At-Talaq", totalVerses: 12 },
  { number: 66, name: "At-Tahrim", totalVerses: 12 },
  { number: 67, name: "Al-Mulk", totalVerses: 30 },
  { number: 68, name: "Al-Qalam", totalVerses: 52 },
  { number: 69, name: "Al-Haqqah", totalVerses: 52 },
  { number: 70, name: "Al-Ma'arij", totalVerses: 44 },
  { number: 71, name: "Nuh", totalVerses: 28 },
  { number: 72, name: "Al-Jinn", totalVerses: 28 },
  { number: 73, name: "Al-Muzzammil", totalVerses: 20 },
  { number: 74, name: "Al-Muddassir", totalVerses: 56 },
  { number: 75, name: "Al-Qiyamah", totalVerses: 40 },
  { number: 76, name: "Al-Insan", totalVerses: 31 },
  { number: 77, name: "Al-Mursalat", totalVerses: 50 },
  { number: 78, name: "An-Naba", totalVerses: 40 },
  { number: 79, name: "An-Nazi'at", totalVerses: 46 },
  { number: 80, name: "Abasa", totalVerses: 42 },
  { number: 81, name: "At-Takwir", totalVerses: 29 },
  { number: 82, name: "Al-Infitar", totalVerses: 19 },
  { number: 83, name: "Al-Mutaffifin", totalVerses: 36 },
  { number: 84, name: "Al-Insyiqaq", totalVerses: 25 },
  { number: 85, name: "Al-Buruj", totalVerses: 22 },
  { number: 86, name: "At-Tariq", totalVerses: 17 },
  { number: 87, name: "Al-A'la", totalVerses: 19 },
  { number: 88, name: "Al-Gasyiyah", totalVerses: 26 },
  { number: 89, name: "Al-Fajr", totalVerses: 30 },
  { number: 90, name: "Al-Balad", totalVerses: 20 },
  { number: 91, name: "Asy-Syams", totalVerses: 15 },
  { number: 92, name: "Al-Lail", totalVerses: 21 },
  { number: 93, name: "Ad-Duha", totalVerses: 11 },
  { number: 94, name: "Asy-Syarh", totalVerses: 8 },
  { number: 95, name: "At-Tin", totalVerses: 8 },
  { number: 96, name: "Al-'Alaq", totalVerses: 19 },
  { number: 97, name: "Al-Qadr", totalVerses: 5 },
  { number: 98, name: "Al-Bayyinah", totalVerses: 8 },
  { number: 99, name: "Az-Zalzalah", totalVerses: 8 },
  { number: 100, name: "Al-'Adiyat", totalVerses: 11 },
  { number: 101, name: "Al-Qari'ah", totalVerses: 11 },
  { number: 102, name: "At-Takasur", totalVerses: 8 },
  { number: 103, name: "Al-'Asr", totalVerses: 3 },
  { number: 104, name: "Al-Humazah", totalVerses: 9 },
  { number: 105, name: "Al-Fil", totalVerses: 5 },
  { number: 106, name: "Quraisy", totalVerses: 4 },
  { number: 107, name: "Al-Ma'un", totalVerses: 7 },
  { number: 108, name: "Al-Kausar", totalVerses: 3 },
  { number: 109, name: "Al-Kafirun", totalVerses: 6 },
  { number: 110, name: "An-Nasr", totalVerses: 3 },
  { number: 111, name: "Al-Lahab", totalVerses: 5 },
  { number: 112, name: "Al-Ikhlas", totalVerses: 4 },
  { number: 113, name: "Al-Falaq", totalVerses: 5 },
  { number: 114, name: "An-Nas", totalVerses: 6 },
];

/**
 * JUZ_BOUNDARIES (30 juz)
 * Disalin persis dari Data Resmi
 */
export const JUZ_BOUNDARIES: readonly JuzBoundary[] = [
  { juz: 1, startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 141 },
  { juz: 2, startSurah: 2, startAyah: 142, endSurah: 2, endAyah: 252 },
  { juz: 3, startSurah: 2, startAyah: 253, endSurah: 3, endAyah: 92 },
  { juz: 4, startSurah: 3, startAyah: 93, endSurah: 4, endAyah: 23 },
  { juz: 5, startSurah: 4, startAyah: 24, endSurah: 4, endAyah: 147 },
  { juz: 6, startSurah: 4, startAyah: 148, endSurah: 5, endAyah: 81 },
  { juz: 7, startSurah: 5, startAyah: 82, endSurah: 6, endAyah: 110 },
  { juz: 8, startSurah: 6, startAyah: 111, endSurah: 7, endAyah: 87 },
  { juz: 9, startSurah: 7, startAyah: 88, endSurah: 8, endAyah: 40 },
  { juz: 10, startSurah: 8, startAyah: 41, endSurah: 9, endAyah: 92 },
  { juz: 11, startSurah: 9, startAyah: 93, endSurah: 11, endAyah: 5 },
  { juz: 12, startSurah: 11, startAyah: 6, endSurah: 12, endAyah: 52 },
  { juz: 13, startSurah: 12, startAyah: 53, endSurah: 14, endAyah: 52 },
  { juz: 14, startSurah: 15, startAyah: 1, endSurah: 16, endAyah: 128 },
  { juz: 15, startSurah: 17, startAyah: 1, endSurah: 18, endAyah: 74 },
  { juz: 16, startSurah: 18, startAyah: 75, endSurah: 20, endAyah: 135 },
  { juz: 17, startSurah: 21, startAyah: 1, endSurah: 22, endAyah: 78 },
  { juz: 18, startSurah: 23, startAyah: 1, endSurah: 25, endAyah: 20 },
  { juz: 19, startSurah: 25, startAyah: 21, endSurah: 27, endAyah: 55 },
  { juz: 20, startSurah: 27, startAyah: 56, endSurah: 29, endAyah: 45 },
  { juz: 21, startSurah: 29, startAyah: 46, endSurah: 33, endAyah: 30 },
  { juz: 22, startSurah: 33, startAyah: 31, endSurah: 36, endAyah: 27 },
  { juz: 23, startSurah: 36, startAyah: 28, endSurah: 39, endAyah: 31 },
  { juz: 24, startSurah: 39, startAyah: 32, endSurah: 41, endAyah: 46 },
  { juz: 25, startSurah: 41, startAyah: 47, endSurah: 45, endAyah: 37 },
  { juz: 26, startSurah: 46, startAyah: 1, endSurah: 51, endAyah: 30 },
  { juz: 27, startSurah: 51, startAyah: 31, endSurah: 57, endAyah: 29 },
  { juz: 28, startSurah: 58, startAyah: 1, endSurah: 66, endAyah: 12 },
  { juz: 29, startSurah: 67, startAyah: 1, endSurah: 77, endAyah: 50 },
  { juz: 30, startSurah: 78, startAyah: 1, endSurah: 114, endAyah: 6 },
];

// Map lookup untuk performa cepat O(1)
const surahMapByNumber = new Map<number, Surah>();
SURAH_LIST.forEach((s) => surahMapByNumber.set(s.number, s));

const juzMapByNumber = new Map<number, JuzBoundary>();
JUZ_BOUNDARIES.forEach((j) => juzMapByNumber.set(j.juz, j));

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Mengambil data surat berdasarkan nomor surat (1..114).
 */
export function getSurahByNumber(surahNumber: number): Surah | undefined {
  return surahMapByNumber.get(surahNumber);
}

/**
 * Mengambil batas juz berdasarkan nomor juz (1..30).
 */
export function getJuzBoundary(juzNumber: number): JuzBoundary | undefined {
  return juzMapByNumber.get(juzNumber);
}

/**
 * Mengambil daftar surat yang beririsan dengan suatu juz tertentu (1..30).
 * Mengembalikan array Surah dasar.
 */
export function getSurahsInJuz(juzNumber: number): Surah[] {
  const boundary = getJuzBoundary(juzNumber);
  if (!boundary) return [];

  return SURAH_LIST.filter(
    (s) => s.number >= boundary.startSurah && s.number <= boundary.endSurah
  );
}

/**
 * Mengambil daftar surat beririsan lengkap beserta rentang ayat spesifik
 * dalam juz tersebut.
 */
export function getSurahDetailsInJuz(juzNumber: number): SurahInJuz[] {
  const boundary = getJuzBoundary(juzNumber);
  if (!boundary) return [];

  const surahs = getSurahsInJuz(juzNumber);
  return surahs.map((s) => {
    const range = getAyahRangeForSurahInJuz(juzNumber, s.number);
    return {
      surahNumber: s.number,
      surahName: s.name,
      totalVerses: s.totalVerses,
      startAyah: range ? range.startAyah : 1,
      endAyah: range ? range.endAyah : s.totalVerses,
    };
  });
}

/**
 * Mengambil rentang ayat yang valid untuk pasangan (juz, surat).
 * Contoh:
 * - Juz 1 + Al-Fatihah (1) => { startAyah: 1, endAyah: 7 }
 * - Juz 1 + Al-Baqarah (2) => { startAyah: 1, endAyah: 141 }
 * - Juz 2 + Al-Baqarah (2) => { startAyah: 142, endAyah: 252 }
 * - Juz 3 + Al-Baqarah (2) => { startAyah: 253, endAyah: 286 }
 * - Bila surat tidak ada dalam juz tersebut, mengembalikan null.
 */
export function getAyahRangeForSurahInJuz(
  juzNumber: number,
  surahNumber: number
): AyahRange | null {
  const boundary = getJuzBoundary(juzNumber);
  if (!boundary) return null;

  if (surahNumber < boundary.startSurah || surahNumber > boundary.endSurah) {
    return null;
  }

  const surah = getSurahByNumber(surahNumber);
  if (!surah) return null;

  let startAyah = 1;
  let endAyah = surah.totalVerses;

  // Jika surat berada di batas awal juz
  if (surahNumber === boundary.startSurah) {
    startAyah = boundary.startAyah;
  }

  // Jika surat berada di batas akhir juz
  if (surahNumber === boundary.endSurah) {
    endAyah = boundary.endAyah;
  }

  return { startAyah, endAyah };
}

/**
 * Menemukan juz dari pasangan (surat, ayat).
 */
export function getJuzForSurahAyah(
  surahNumber: number,
  ayahNumber: number
): number | null {
  for (const b of JUZ_BOUNDARIES) {
    if (surahNumber < b.startSurah || surahNumber > b.endSurah) continue;

    if (b.startSurah === b.endSurah) {
      if (ayahNumber >= b.startAyah && ayahNumber <= b.endAyah) {
        return b.juz;
      }
    } else if (surahNumber === b.startSurah) {
      if (ayahNumber >= b.startAyah) return b.juz;
    } else if (surahNumber === b.endSurah) {
      if (ayahNumber <= b.endAyah) return b.juz;
    } else {
      // Surat berada di tengah antara startSurah dan endSurah
      return b.juz;
    }
  }
  return null;
}

// ==========================================
// PEMERIKSAAN OTOMATIS (VALIDATION SUITE)
// ==========================================

export interface QuranValidationReport {
  readonly isValid: boolean;
  readonly surahCount: number;
  readonly totalVerses: number;
  readonly juzCount: number;
  readonly errors: readonly string[];
}

/**
 * Menjalankan pemeriksaan integritas menyeluruh terhadap data Al-Qur'an.
 * Kriteria yang diperiksa:
 * 1. Tepat 114 surat bernomor 1..114 berurutan tanpa putus.
 * 2. Jumlah seluruh ayat tepat 6236.
 * 3. Tepat 30 juz bernomor 1..30 berurutan.
 * 4. Juz 1 mulai di surat 1 ayat 1 (1:1).
 * 5. Juz 30 berakhir di surat 114 ayat 6 (114:6).
 * 6. Awal juz N+1 tepat setelah akhir juz N (kontinuitas tanpa jeda dan tanpa tumpang tindih).
 * 7. Ayat akhir tiap juz tidak melebihi jumlah ayat suratnya dan ayat awal >= 1.
 * 8. Nilai acuan terverifikasi:
 *    - Al-Fatihah = 7
 *    - Al-Baqarah = 286
 *    - Al-Kahf = 110
 *    - Yasin = 83
 *    - Al-Mulk = 30
 *    - An-Nas = 6
 */
export function validateQuranReference(): QuranValidationReport {
  const errors: string[] = [];

  // 1. Tepat 114 surat bernomor 1..114 berurutan
  if (SURAH_LIST.length !== 114) {
    errors.push(`Jumlah surat tidak 114 (ditemukan: ${SURAH_LIST.length})`);
  }
  for (let i = 0; i < SURAH_LIST.length; i++) {
    const expectedNum = i + 1;
    if (SURAH_LIST[i].number !== expectedNum) {
      errors.push(
        `Surat pada indeks ${i} memiliki nomor ${SURAH_LIST[i].number}, diharapkan ${expectedNum}`
      );
    }
    if (!SURAH_LIST[i].name || SURAH_LIST[i].name.trim() === '') {
      errors.push(`Surat ${expectedNum} tidak memiliki nama yang valid`);
    }
    if (!SURAH_LIST[i].totalVerses || SURAH_LIST[i].totalVerses < 1) {
      errors.push(`Surat ${expectedNum} memiliki jumlah ayat tidak valid: ${SURAH_LIST[i].totalVerses}`);
    }
  }

  // 2. Jumlah seluruh ayat = 6236
  const totalVerses = SURAH_LIST.reduce((sum, s) => sum + s.totalVerses, 0);
  if (totalVerses !== 6236) {
    errors.push(`Total ayat tidak sama dengan 6236 (ditemukan: ${totalVerses})`);
  }

  // 3. Tepat 30 juz
  if (JUZ_BOUNDARIES.length !== 30) {
    errors.push(`Jumlah juz tidak 30 (ditemukan: ${JUZ_BOUNDARIES.length})`);
  }
  for (let i = 0; i < JUZ_BOUNDARIES.length; i++) {
    const expectedJuz = i + 1;
    if (JUZ_BOUNDARIES[i].juz !== expectedJuz) {
      errors.push(
        `Juz pada indeks ${i} memiliki nomor ${JUZ_BOUNDARIES[i].juz}, diharapkan ${expectedJuz}`
      );
    }
  }

  // 4. Juz 1 mulai 1:1
  const juz1 = JUZ_BOUNDARIES[0];
  if (juz1 && (juz1.startSurah !== 1 || juz1.startAyah !== 1)) {
    errors.push(`Juz 1 tidak mulai di 1:1 (ditemukan: ${juz1.startSurah}:${juz1.startAyah})`);
  }

  // 5. Juz 30 berakhir 114:6
  const juz30 = JUZ_BOUNDARIES[JUZ_BOUNDARIES.length - 1];
  if (juz30 && (juz30.endSurah !== 114 || juz30.endAyah !== 6)) {
    errors.push(`Juz 30 tidak berakhir di 114:6 (ditemukan: ${juz30.endSurah}:${juz30.endAyah})`);
  }

  // 6 & 7. Kontinuitas batas juz N+1 dan validitas batas ayat
  for (let i = 0; i < JUZ_BOUNDARIES.length; i++) {
    const current = JUZ_BOUNDARIES[i];
    const startSurahObj = surahMapByNumber.get(current.startSurah);
    const endSurahObj = surahMapByNumber.get(current.endSurah);

    if (!startSurahObj) {
      errors.push(`Juz ${current.juz}: surat awal ${current.startSurah} tidak ditemukan di SURAH_LIST`);
    }
    if (!endSurahObj) {
      errors.push(`Juz ${current.juz}: surat akhir ${current.endSurah} tidak ditemukan di SURAH_LIST`);
    }

    if (current.startAyah < 1) {
      errors.push(`Juz ${current.juz}: ayat awal < 1 (${current.startAyah})`);
    }
    if (startSurahObj && current.startAyah > startSurahObj.totalVerses) {
      errors.push(
        `Juz ${current.juz}: ayat awal (${current.startAyah}) melebihi jumlah ayat surat ${startSurahObj.name} (${startSurahObj.totalVerses})`
      );
    }

    if (endSurahObj && current.endAyah > endSurahObj.totalVerses) {
      errors.push(
        `Juz ${current.juz}: ayat akhir (${current.endAyah}) melebihi jumlah ayat surat ${endSurahObj.name} (${endSurahObj.totalVerses})`
      );
    }

    // Periksa kontinuitas ke juz berikutnya (N+1 tepat setelah akhir juz N)
    if (i < JUZ_BOUNDARIES.length - 1) {
      const next = JUZ_BOUNDARIES[i + 1];
      if (current.endSurah === next.startSurah) {
        // Berada di surat yang sama: ayat awal next harus endAyah + 1
        if (next.startAyah !== current.endAyah + 1) {
          errors.push(
            `Diskontinuitas antara Juz ${current.juz} (akhir ${current.endSurah}:${current.endAyah}) dan Juz ${next.juz} (awal ${next.startSurah}:${next.startAyah})`
          );
        }
      } else if (next.startSurah === current.endSurah + 1) {
        // Surat berpindah ke surat berikutnya: current harus berakhir di ayat terakhir suratnya, dan next mulai di ayat 1
        if (endSurahObj && current.endAyah !== endSurahObj.totalVerses) {
          errors.push(
            `Juz ${current.juz} berakhir di surat ${current.endSurah} ayat ${current.endAyah}, bukan ayat terakhir (${endSurahObj.totalVerses}), padahal Juz ${next.juz} mulai di surat berikutnya`
          );
        }
        if (next.startAyah !== 1) {
          errors.push(
            `Juz ${next.juz} mulai di surat baru ${next.startSurah} tetapi ayat awalnya bukan 1 (ditemukan: ${next.startAyah})`
          );
        }
      } else {
        errors.push(
          `Lompatan nomor surat tidak valid antara Juz ${current.juz} (akhir surat ${current.endSurah}) dan Juz ${next.juz} (awal surat ${next.startSurah})`
        );
      }
    }
  }

  // 8. Nilai acuan spesifik
  const referenceValues: Record<string, { surahNum: number; expectedVerses: number }> = {
    "Al-Fatihah": { surahNum: 1, expectedVerses: 7 },
    "Al-Baqarah": { surahNum: 2, expectedVerses: 286 },
    "Al-Kahf": { surahNum: 18, expectedVerses: 110 },
    "Yasin": { surahNum: 36, expectedVerses: 83 },
    "Al-Mulk": { surahNum: 67, expectedVerses: 30 },
    "An-Nas": { surahNum: 114, expectedVerses: 6 },
  };

  for (const [name, ref] of Object.entries(referenceValues)) {
    const s = surahMapByNumber.get(ref.surahNum);
    if (!s) {
      errors.push(`Nilai acuan gagal: Surat ${name} (nomor ${ref.surahNum}) tidak ditemukan`);
    } else {
      if (s.name !== name) {
        errors.push(`Nilai acuan gagal: Surat ${ref.surahNum} bernama "${s.name}", diharapkan "${name}"`);
      }
      if (s.totalVerses !== ref.expectedVerses) {
        errors.push(
          `Nilai acuan gagal: Surat ${name} memiliki ${s.totalVerses} ayat, diharapkan ${ref.expectedVerses}`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    surahCount: SURAH_LIST.length,
    totalVerses,
    juzCount: JUZ_BOUNDARIES.length,
    errors,
  };
}

/**
 * Eksekusi verifikasi otomatis saat modul di-load.
 * Jika terdapat kesalahan sekecil apa pun pada data, eksekusi akan langsung
 * melempar Error dan menggagalkan bundling / build secara instan.
 */
export const QURAN_VALIDATION_REPORT: QuranValidationReport = validateQuranReference();
if (!QURAN_VALIDATION_REPORT.isValid) {
  const formattedErrors = QURAN_VALIDATION_REPORT.errors.join("\n - ");
  throw new Error(`[QURAN_DATA_VALIDATION_FAILED] Validasi data Al-Qur'an gagal:\n - ${formattedErrors}`);
}
