export interface JHSubjectCatalogEntry {
  key: string;
  label: string;
  legacyValue: string;
  aliases: string[];
}

/**
 * Junior High Subject Catalog (Tampilan & Normalisasi)
 * Catatan: Bahasa Arab dan PKN TIDAK dimasukkan sesuai instruksi.
 */
export const JH_SUBJECT_CATALOG: JHSubjectCatalogEntry[] = [
  {
    key: 'mathematics',
    label: 'Mathematics',
    legacyValue: 'Matematika',
    aliases: ['Matematika', 'Math', 'MTK']
  },
  {
    key: 'science',
    label: 'Science',
    legacyValue: 'IPA',
    aliases: ['IPA', 'Ilmu Pengetahuan Alam']
  },
  {
    key: 'social_studies_and_civics',
    label: 'Social Studies and Civics',
    legacyValue: 'IPS',
    aliases: ['IPS', 'Ilmu Pengetahuan Sosial']
  },
  {
    key: 'bahasa_indonesia',
    label: 'Bahasa Indonesia',
    legacyValue: 'Bahasa Indonesia',
    aliases: ['BIN', 'Bahasa Indo', 'B. Indonesia']
  },
  {
    key: 'english',
    label: 'English',
    legacyValue: 'English',
    aliases: ['ENG', 'Bahasa Inggris', 'English Language']
  },
  {
    key: 'islamic_studies',
    label: 'Islamic Studies',
    legacyValue: 'Pendidikan Agama Islam',
    aliases: ['Pendidikan Agama Islam', 'PAI', 'Agama Islam', 'Agama & Budi Pekerti']
  },
  {
    key: 'quran_reciting',
    label: "Qur'an Reciting",
    legacyValue: 'Pendidikan Al-Quran',
    aliases: ['Pendidikan Al-Quran', 'PAQ', 'Al-Quran', 'Quran Recitation', "Al-Qur'an"]
  },
  {
    key: 'seni_rupa',
    label: 'Seni Rupa',
    legacyValue: 'Seni Rupa',
    aliases: ['Art', 'Seni Budaya', 'Seni Budaya - Rupa']
  },
  {
    key: 'seni_musik',
    label: 'Seni Musik',
    legacyValue: 'Seni Musik',
    aliases: ['Music', 'Musik', 'Performing Arts', 'Seni Budaya - Musik']
  },
  {
    key: 'physical_education',
    label: 'Physical Education',
    legacyValue: 'PJOK',
    aliases: ['PJOK', 'PJK', 'Penjas', 'Penjaskes']
  },
  {
    key: 'digital_literacy',
    label: 'Digital Literacy',
    legacyValue: 'Informatika',
    aliases: ['Informatika', 'ICT', 'INF']
  },
  {
    key: 'kewirausahaan',
    label: 'Kewirausahaan',
    legacyValue: 'Kewirausahaan',
    aliases: ['Entrepreneurship', 'KWU', 'Prakarya']
  },
  {
    key: 'urban_gardening_and_household',
    label: 'Urban Gardening & Household',
    legacyValue: 'Urban Gardening & Household',
    aliases: ['Household & Urban Gardening', 'Urban Gardening', 'Household']
  }
];

/**
 * Normalisasi string nama mapel: trim dan huruf kecil
 */
export function normalizeSubjectName(val?: string | null): string {
  if (!val) return '';
  return val.trim().toLowerCase();
}

/**
 * Temukan entri katalog berdasarkan key, label, legacyValue, atau alias
 */
export function findCatalogEntry(subject?: string | null): JHSubjectCatalogEntry | undefined {
  if (!subject) return undefined;
  const norm = normalizeSubjectName(subject);
  if (!norm) return undefined;

  return JH_SUBJECT_CATALOG.find(entry => {
    if (normalizeSubjectName(entry.key) === norm) return true;
    if (normalizeSubjectName(entry.label) === norm) return true;
    if (normalizeSubjectName(entry.legacyValue) === norm) return true;
    return entry.aliases.some(alias => normalizeSubjectName(alias) === norm);
  });
}

/**
 * Dapatkan label tampilan Lazuardi untuk mata pelajaran Junior High.
 * Jika tidak ada di katalog (misal mapel custom / lama), kembalikan teks aslinya agar tidak hilang.
 */
export function getJHSubjectLabel(subject?: string | null): string {
  if (!subject) return '';
  const entry = findCatalogEntry(subject);
  return entry ? entry.label : subject.trim();
}

/**
 * Dapatkan legacyValue untuk disimpan ke database Firestore.
 * Jika tidak ada di katalog, kembalikan nilai yang diketik/diberikan.
 */
export function getJHSubjectLegacyValue(subject?: string | null): string {
  if (!subject) return '';
  const entry = findCatalogEntry(subject);
  return entry ? entry.legacyValue : subject.trim();
}

/**
 * Pencocokan dua nama mapel Junior High dengan normalisasi:
 * trim, case-insensitive, dan pencocokan silang key & alias.
 */
export function isSameJHSubject(subjA?: string | null, subjB?: string | null): boolean {
  if (!subjA || !subjB) return false;
  const normA = normalizeSubjectName(subjA);
  const normB = normalizeSubjectName(subjB);
  if (normA === normB) return true;

  const entryA = findCatalogEntry(subjA);
  const entryB = findCatalogEntry(subjB);

  if (entryA && entryB) {
    return entryA.key === entryB.key;
  }

  if (entryA) {
    return (
      normalizeSubjectName(entryA.label) === normB ||
      normalizeSubjectName(entryA.legacyValue) === normB ||
      entryA.aliases.some(alias => normalizeSubjectName(alias) === normB)
    );
  }

  if (entryB) {
    return (
      normalizeSubjectName(entryB.label) === normA ||
      normalizeSubjectName(entryB.legacyValue) === normA ||
      entryB.aliases.some(alias => normalizeSubjectName(alias) === normA)
    );
  }

  return false;
}
