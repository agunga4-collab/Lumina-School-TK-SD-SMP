/**
 * Skrip Pemeriksaan Otomatis Data Referensi Al-Qur'an
 * Dijalankan untuk memverifikasi data dan memastikan build gagal jika ada kesalahan.
 */

import {
  SURAH_LIST,
  JUZ_BOUNDARIES,
  validateQuranReference,
  getSurahsInJuz,
  getAyahRangeForSurahInJuz,
  getSurahByNumber,
} from "../constants/quranReference.ts";

console.log("==================================================");
console.log("  PEMERIKSAAN DATA REFERENSI AL-QUR'AN");
console.log("  FITUR: SAHABAT QUR'AN");
console.log("==================================================");

const report = validateQuranReference();

console.log(`1. Jumlah Surat   : ${report.surahCount} (Target: 114)`);
console.log(`2. Total Seluruh Ayat: ${report.totalVerses} (Target: 6236)`);
console.log(`3. Jumlah Juz     : ${report.juzCount} (Target: 30)`);
console.log(`4. Nilai Acuan:`);
console.log(`   - Al-Fatihah   : ${getSurahByNumber(1)?.totalVerses} ayat (Target: 7)`);
console.log(`   - Al-Baqarah   : ${getSurahByNumber(2)?.totalVerses} ayat (Target: 286)`);
console.log(`   - Al-Kahf      : ${getSurahByNumber(18)?.totalVerses} ayat (Target: 110)`);
console.log(`   - Yasin        : ${getSurahByNumber(36)?.totalVerses} ayat (Target: 83)`);
console.log(`   - Al-Mulk      : ${getSurahByNumber(67)?.totalVerses} ayat (Target: 30)`);
console.log(`   - An-Nas       : ${getSurahByNumber(114)?.totalVerses} ayat (Target: 6)`);

// Uji helper: Juz 1 + Al-Baqarah (2)
const juz1Surahs = getSurahsInJuz(1);
const juz1BaqarahRange = getAyahRangeForSurahInJuz(1, 2);
console.log(`5. Uji Helper:`);
console.log(`   - Surat dalam Juz 1: ${juz1Surahs.map((s) => s.name).join(", ")}`);
console.log(`   - Rentang Al-Baqarah di Juz 1: Ayat ${juz1BaqarahRange?.startAyah} s/d ${juz1BaqarahRange?.endAyah}`);

if (juz1BaqarahRange?.startAyah !== 1 || juz1BaqarahRange?.endAyah !== 141) {
  console.error("❌ GAGAL: Rentang Al-Baqarah di Juz 1 tidak sesuai target (harus 1 s/d 141)!");
  process.exit(1);
}

if (!report.isValid) {
  console.error("\n❌ VALIDASI GAGAL! Ditemukan kesalahan:");
  report.errors.forEach((err, idx) => {
    console.error(`   ${idx + 1}. ${err}`);
  });
  process.exit(1);
}

console.log("\n✅ SEMUA PEMERIKSAAN BERHASIL (100% VALID & SESUAI DATA RESMI).");
console.log("==================================================");
process.exit(0);
