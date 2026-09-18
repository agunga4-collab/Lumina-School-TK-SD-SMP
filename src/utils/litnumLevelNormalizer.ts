export type CanonicalMengajiLevel =
  | 'IQRA_1'
  | 'IQRA_2'
  | 'IQRA_3'
  | 'IQRA_4'
  | 'IQRA_5'
  | 'IQRA_6'
  | 'JUZ_AMMA'
  | 'ALQURAN';

export type CanonicalNumerasiLevel =
  | 'TRAILHEAD'
  | 'ASCENT'
  | 'RIDGE';

export const CANONICAL_MENGAJI_OPTIONS: Array<{ value: CanonicalMengajiLevel; label: string }> = [
  { value: 'IQRA_1', label: 'Iqra 1' },
  { value: 'IQRA_2', label: 'Iqra 2' },
  { value: 'IQRA_3', label: 'Iqra 3' },
  { value: 'IQRA_4', label: 'Iqra 4' },
  { value: 'IQRA_5', label: 'Iqra 5' },
  { value: 'IQRA_6', label: 'Iqra 6' },
  { value: 'JUZ_AMMA', label: 'Juz Amma' },
  { value: 'ALQURAN', label: 'Alquran' }
];

export const CANONICAL_NUMERASI_OPTIONS: Array<{ value: CanonicalNumerasiLevel; label: string }> = [
  { value: 'TRAILHEAD', label: 'Trailhead' },
  { value: 'ASCENT', label: 'Ascent' },
  { value: 'RIDGE', label: 'Ridge' }
];

/**
 * Read-only normalizer for Mengaji levels.
 * Converts legacy strings (e.g., "Alquran", "al-quran", "Iqra 1", "iqra_1")
 * into their canonical uppercase identifier (e.g., "ALQURAN", "IQRA_1").
 * Returns null if unrecognized or empty.
 */
export function normalizeMengajiLevel(val: any): CanonicalMengajiLevel | null {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim().toLowerCase().replace(/[\s\-_]+/g, '');

  if (s === 'iqra1' || s === 'iqro1') return 'IQRA_1';
  if (s === 'iqra2' || s === 'iqro2') return 'IQRA_2';
  if (s === 'iqra3' || s === 'iqro3') return 'IQRA_3';
  if (s === 'iqra4' || s === 'iqro4') return 'IQRA_4';
  if (s === 'iqra5' || s === 'iqro5') return 'IQRA_5';
  if (s === 'iqra6' || s === 'iqro6') return 'IQRA_6';
  if (s === 'juzamma' || s === 'juz30' || s === 'amma') return 'JUZ_AMMA';
  if (s === 'alquran' || s === 'quran' || s === 'alkuran' || s === 'kuran') return 'ALQURAN';

  return null;
}

/**
 * Read-only normalizer for Numerasi levels.
 * Converts legacy strings (e.g., "Trailhead", "trailhead", "Ascent", "Ridge")
 * into their canonical uppercase identifier ("TRAILHEAD", "ASCENT", "RIDGE").
 * Returns null if unrecognized or empty.
 */
export function normalizeNumerasiLevel(val: any): CanonicalNumerasiLevel | null {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim().toLowerCase().replace(/[\s\-_]+/g, '');

  if (s === 'trailhead') return 'TRAILHEAD';
  if (s === 'ascent') return 'ASCENT';
  if (s === 'ridge') return 'RIDGE';
  if (s === 'summit') return 'RIDGE'; // Gracefully treat Summit as top ridge if encountered

  return null;
}

/**
 * Formats a Mengaji level for user-facing display (e.g. "Alquran", "Juz Amma", "Iqra 3").
 */
export function formatMengajiDisplay(val: any): string {
  const norm = normalizeMengajiLevel(val);
  if (!norm) return (typeof val === 'string' ? val : '');
  const opt = CANONICAL_MENGAJI_OPTIONS.find(o => o.value === norm);
  return opt ? opt.label : norm;
}

/**
 * Formats a Numerasi level for user-facing display (e.g. "Trailhead", "Ascent", "Ridge").
 */
export function formatNumerasiDisplay(val: any): string {
  const norm = normalizeNumerasiLevel(val);
  if (!norm) return (typeof val === 'string' ? val : '');
  const opt = CANONICAL_NUMERASI_OPTIONS.find(o => o.value === norm);
  return opt ? opt.label : norm;
}
