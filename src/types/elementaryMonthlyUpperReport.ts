export type ElementaryUpperPredicate = 'A' | 'D' | 'B' | 'IP';

export type UpperLGStatusMode = 'AUTO' | 'IP';

export interface ElementaryUpperLearningObjective {
  id: string;
  code: string;
  title: string;
  order: number;
}

export interface ElementaryUpperLearningGoal {
  id: string;
  code: string;
  title: string;
  order: number;
  kkmOverride?: number; // 0 < K < 100
  isActiveForReport?: boolean;
  learningObjectives: ElementaryUpperLearningObjective[];
}

export interface ElementaryUpperSubject {
  id: string;
  name: string;
  kkm: number; // default 70, 0 < K < 100
  order: number;
  isActiveForReport?: boolean;
  learningGoals: ElementaryUpperLearningGoal[];
}

export interface ElementaryUpperProjectObjective {
  id: string;
  code: string;
  title: string;
  order: number;
}

export interface ElementaryUpperProjectLearningGoal {
  id: string;
  code: string;
  title: string;
  order: number;
  learningObjectives: ElementaryUpperProjectObjective[];
}

export interface ElementaryUpperProject {
  id: string;
  name: string;
  performanceOfUnderstanding: string;
  order: number;
  isActiveForReport?: boolean;
  learningGoals: ElementaryUpperProjectLearningGoal[];
}

export interface ElementaryUpperCurriculumDoc {
  id: string; // `${classId}_${normYear}_S${semester}_M${month}`
  classId: string;
  className: string;
  gradeLevel: number; // 4, 5, or 6
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  subjects: ElementaryUpperSubject[];
  projects: ElementaryUpperProject[];
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface UpperLGAverageResult {
  average: number | null; // null if all blank or IP
  displayAverage: string; // e.g. "84.99", "70", "-", "IP"
  predicate: ElementaryUpperPredicate | null;
  statusMode: UpperLGStatusMode;
  kkm: number;
  batasA: number;
  totalLOs: number;
  filledLOs: number;
  isComplete: boolean;
}

/**
 * Calculates average and predicate for Upper Grade Learning Goal.
 * Supports explicit IP (In Progress) status override.
 * 
 * Rules:
 * - If statusMode === 'IP', result predicate is 'IP', display is 'IP'.
 * - Any underlying numeric scores are preserved and unaffected.
 * - Empty is NOT zero.
 * - Batas A = K + (100 - K) / 2.
 * - A >= batas A, D >= K && < batas A, B < K.
 */
export function calculateUpperLGAverageAndPredicate(
  scores: Record<string, number | undefined | null | string>,
  loList: ElementaryUpperLearningObjective[] | ElementaryUpperProjectObjective[],
  kkm: number = 70,
  statusMode: UpperLGStatusMode = 'AUTO'
): UpperLGAverageResult {
  const effectiveKkm = (typeof kkm === 'number' && kkm > 0 && kkm < 100) ? kkm : 70;
  const batasA = effectiveKkm + (100 - effectiveKkm) / 2;

  let sum = 0;
  let filledCount = 0;
  const totalLOs = loList.length;

  for (const lo of loList) {
    const rawVal = scores[lo.id];
    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(',', '.'));
      if (!isNaN(num) && num >= 0 && num <= 100) {
        sum += num;
        filledCount++;
      }
    }
  }

  // If teacher explicitly set this LG to In Progress (IP)
  if (statusMode === 'IP') {
    return {
      average: filledCount > 0 ? sum / filledCount : null,
      displayAverage: 'IP',
      predicate: 'IP',
      statusMode: 'IP',
      kkm: effectiveKkm,
      batasA,
      totalLOs,
      filledLOs: filledCount,
      isComplete: true // IP is an explicit recorded status
    };
  }

  if (filledCount === 0 || totalLOs === 0) {
    return {
      average: null,
      displayAverage: '-',
      predicate: null,
      statusMode: 'AUTO',
      kkm: effectiveKkm,
      batasA,
      totalLOs,
      filledLOs: 0,
      isComplete: false
    };
  }

  const rawAvg = sum / filledCount;

  let predicate: ElementaryUpperPredicate;
  if (rawAvg >= batasA) {
    predicate = 'A';
  } else if (rawAvg >= effectiveKkm) {
    predicate = 'D';
  } else {
    predicate = 'B';
  }

  const rounded2 = Math.round(rawAvg * 100) / 100;
  const displayAverage = Number.isInteger(rounded2) ? String(rounded2) : rounded2.toFixed(2).replace(/\.?0+$/, '');

  return {
    average: rawAvg,
    displayAverage,
    predicate,
    statusMode: 'AUTO',
    kkm: effectiveKkm,
    batasA,
    totalLOs,
    filledLOs: filledCount,
    isComplete: filledCount === totalLOs && totalLOs > 0
  };
}

export interface ElementaryUpperStudentDataDoc {
  id: string; // `${studentId}_${classId}_${normYear}_S${semester}_M${month}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  
  // Subject LO scores & LG explicit statuses
  scores: Record<string, number>; // loId -> score (0-100)
  lgStatus: Record<string, UpperLGStatusMode>; // lgId -> 'AUTO' | 'IP'
  
  // Project LO scores & LG explicit statuses
  projectScores: Record<string, number>; // projectLoId -> score (0-100)
  projectLgStatus: Record<string, UpperLGStatusMode>; // projectLgId -> 'AUTO' | 'IP'

  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

// ==========================================
// B. LITERASI & NUMERASI TYPES
// ==========================================

export type UpperLitNumSubjectField = 'bahasa_indonesia' | 'english' | 'mathematics';
export type UpperLitNumPredicate = 'A' | 'D' | 'B';

export interface UpperLitNumThresholds {
  minA: number; // e.g. 85 (Achieved >= minA)
  minD: number; // e.g. 70 or 55 (Developing >= minD and < minA, Beginning < minD)
}

export interface UpperLitNumFieldConfig {
  field: UpperLitNumSubjectField;
  label: string;
  defaultStandard: number; // e.g. BI 70, English 55, Math 70
  defaultThresholds: UpperLitNumThresholds;
}

export const UPPER_LITNUM_FIELDS: UpperLitNumFieldConfig[] = [
  { 
    field: 'bahasa_indonesia', 
    label: 'Bahasa Indonesia', 
    defaultStandard: 70,
    defaultThresholds: { minA: 85, minD: 70 }
  },
  { 
    field: 'english', 
    label: 'English', 
    defaultStandard: 55,
    defaultThresholds: { minA: 78, minD: 55 }
  },
  { 
    field: 'mathematics', 
    label: 'Mathematics', 
    defaultStandard: 70,
    defaultThresholds: { minA: 85, minD: 70 }
  },
];

export interface UpperLitNumPeriodScore {
  score: number | null; // null if not assessed
  minimumStandard: number;
  sourceDescription?: string; // e.g. "Asesmen Sumatif Bab 2", "Monthly Test", "Midterm"
  assessedAt?: string; // date or month
}

export interface ElementaryUpperLitNumRecordDoc {
  id: string; // `${studentId}_${classId}_${normYear}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  
  // Map: field -> periodKey (e.g. '2025-08', '2025-09', 'midterm-1') -> UpperLitNumPeriodScore
  periodScores: Record<UpperLitNumSubjectField, Record<string, UpperLitNumPeriodScore>>;

  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface ElementaryUpperLitNumClassConfigDoc {
  id: string; // `${classId}_${normYear}`
  classId: string;
  academicYear: string;
  
  // Minimum standards per field for charts
  standards: Record<UpperLitNumSubjectField, number>;

  // A/D/B Thresholds per field (minA, minD)
  thresholds?: Record<UpperLitNumSubjectField, UpperLitNumThresholds>;

  // Narrative Templates per field & predicate
  narrativeTemplates?: Record<UpperLitNumSubjectField, Record<UpperLitNumPredicate, string>>;
  
  // Selected comparison periods for charts in this class
  comparisonPeriods: Array<{
    periodKey: string;
    label: string; // dynamic label e.g. "Agustus", "September", "Midterm 1"
    order: number;
  }>;

  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export const DEFAULT_LITNUM_TEMPLATES: Record<UpperLitNumSubjectField, Record<UpperLitNumPredicate, string>> = {
  bahasa_indonesia: {
    A: 'Pada pembelajaran Bahasa Indonesia periode {monthLabel}, {studentName} mencapai capaian optimal (Achieved). Ananda mampu memahami teks bacaan secara mendalam, mengidentifikasi ide pokok serta menyusun tanggapan tertulis secara runtut dan mandiri.',
    D: 'Pada pembelajaran Bahasa Indonesia periode {monthLabel}, {studentName} menunjukkan perkembangan yang baik (Developing). Ananda mulai mampu memahami informasi penting dalam teks dan menyusun kalimat terstruktur dengan bimbingan berkala.',
    B: 'Pada pembelajaran Bahasa Indonesia periode {monthLabel}, {studentName} berada pada tahap awal (Beginning). Ananda membutuhkan pendampingan lebih intensif dalam kelancaran membaca, memahami isi teks, dan penguasaan kosakata dasar.'
  },
  english: {
    A: 'In English literacy for {monthLabel}, {studentName} has achieved the learning standards (Achieved). The student demonstrates strong comprehension of reading materials and expresses ideas clearly with well-structured vocabulary.',
    D: 'In English literacy for {monthLabel}, {studentName} shows good progress (Developing). The student is developing reading confidence and simple conversational skills with occasional guidance.',
    B: 'In English literacy for {monthLabel}, {studentName} is at the beginning stage (Beginning). The student requires continuous support and practice in basic phonics, vocabulary recognition, and simple sentence comprehension.'
  },
  mathematics: {
    A: 'Pada pembelajaran Matematika periode {monthLabel}, {studentName} mencapai capaian optimal (Achieved). Ananda menunjukkan pemahaman konsep berhitung yang solid serta penalaran logis yang baik dalam menyelesaikan soal cerita.',
    D: 'Pada pembelajaran Matematika periode {monthLabel}, {studentName} menunjukkan perkembangan yang baik (Developing). Ananda mampu menyelesaikan operasi hitung dasar dan membutuhkan latihan terarah pada penyelesaian masalah kontekstual.',
    B: 'Pada pembelajaran Matematika periode {monthLabel}, {studentName} berada pada tahap awal (Beginning). Ananda memerlukan bimbingan konseptual berulang serta latihan bertahap dalam operasi hitung dasar.'
  }
};

/**
 * Validate A/D/B Thresholds
 * Rules: 100 >= minA > minD > 0
 * No overlap, no gap:
 * A: [minA, 100]
 * D: [minD, minA)
 * B: [0, minD)
 */
export function validateLitNumThresholds(thresholds: UpperLitNumThresholds): { isValid: boolean; error?: string } {
  if (!thresholds) return { isValid: false, error: 'Thresholds belum dikonfigurasi.' };
  const { minA, minD } = thresholds;
  if (typeof minA !== 'number' || typeof minD !== 'number' || isNaN(minA) || isNaN(minD)) {
    return { isValid: false, error: 'Batas nilai harus berupa angka yang valid.' };
  }
  if (minA > 100 || minD <= 0) {
    return { isValid: false, error: 'Batas nilai harus berada dalam rentang 1 hingga 100.' };
  }
  if (minA <= minD) {
    return { isValid: false, error: `Batas Achieved (${minA}) harus lebih tinggi dari batas Developing (${minD}).` };
  }
  return { isValid: true };
}

/**
 * Classify a score into A/D/B
 * Kosong (null/undefined/NaN) is NOT zero -> returns null.
 * 0 is valid -> returns 'B'.
 * No rounding before classification.
 */
export function calculateUpperLitNumPredicate(
  score: number | null | undefined,
  thresholds?: UpperLitNumThresholds | null
): UpperLitNumPredicate | null {
  if (score === null || score === undefined || isNaN(score)) {
    return null;
  }
  const minA = thresholds?.minA ?? 85;
  const minD = thresholds?.minD ?? 70;

  if (score >= minA) {
    return 'A';
  }
  if (score >= minD) {
    return 'D';
  }
  return 'B';
}

/**
 * Compile qualitative narrative from template without AI
 */
export function compileLitNumNarrative(
  template: string,
  context: {
    studentName: string;
    monthLabel: string;
    fieldLabel: string;
    score?: number | null;
    predicate?: UpperLitNumPredicate | null;
  }
): string {
  if (!template || !template.trim()) return '';
  return template
    .replace(/\{studentName\}/g, context.studentName || 'Siswa')
    .replace(/\{monthLabel\}/g, context.monthLabel || 'Bulan ini')
    .replace(/\{fieldLabel\}/g, context.fieldLabel || '')
    .replace(/\{score\}/g, context.score !== null && context.score !== undefined ? String(context.score) : '-')
    .replace(/\{predicate\}/g, context.predicate || '');
}

export interface JakartaDateInfo {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  currentYm: string; // 'YYYY-MM'
  defaultYm: string; // 'YYYY-MM' (day 1-10 -> previous month, day >= 11 -> current month)
  academicYear: string; // e.g. '2026/2027'
  semester: '1' | '2';
}

/**
 * Jakarta Asia/Jakarta date calculation
 * Day 1–10: default previous month
 * Day 11+: default current month
 */
export function getJakartaDateInfo(dateInput?: Date): JakartaDateInfo {
  const d = dateInput || new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const parts = formatter.formatToParts(d);
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  let day = d.getDate();

  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    if (part.type === 'month') month = parseInt(part.value, 10);
    if (part.type === 'day') day = parseInt(part.value, 10);
  }

  const currentYm = `${year}-${String(month).padStart(2, '0')}`;

  let targetYear = year;
  let targetMonth = month;

  if (day <= 10) {
    // Previous month
    if (month === 1) {
      targetMonth = 12;
      targetYear = year - 1;
    } else {
      targetMonth = month - 1;
    }
  }

  const defaultYm = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

  // Semester determination:
  // Month 7–12 -> Semester 1 of targetYear / (targetYear + 1)
  // Month 1–6 -> Semester 2 of (targetYear - 1) / targetYear
  const semester: '1' | '2' = targetMonth >= 7 ? '1' : '2';
  const academicYear = targetMonth >= 7 ? `${targetYear}/${targetYear + 1}` : `${targetYear - 1}/${targetYear}`;

  return {
    year,
    month,
    day,
    currentYm,
    defaultYm,
    academicYear,
    semester
  };
}

// ==========================================
// C. NARASI & APPROVAL TYPES (DUAL PACKAGES)
// ==========================================

export type UpperReviewStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'APPROVED' 
  | 'NEEDS_REVISION';

export interface UpperApprovalPackage {
  reviewStatus: UpperReviewStatus;
  reviewNotes?: string;
  submittedAt?: number;
  submittedBy?: string;
  submittedByName?: string;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedRole?: string;
  sourceHash?: string;
  isSourceStale?: boolean;
}

export interface ElementaryUpperStudentNarrativesDoc {
  id: string; // `${studentId}_${classId}_${normYear}_S${semester}_M${month}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'

  // Package 1: Monthly Progress Narrative
  monthlyGeneralComment: string;
  monthlyGeneralCommentDraft?: string;
  monthlyProgressReview: UpperApprovalPackage;

  // Package 2: Literacy & Numeracy 3 Field Narratives
  bahasaIndonesiaNarrative: string;
  bahasaIndonesiaDraft?: string;

  englishNarrative: string;
  englishDraft?: string;

  mathematicsNarrative: string;
  mathematicsDraft?: string;

  litNumReview: UpperApprovalPackage;

  // Language preferences
  narrativeLanguage: 'ID' | 'EN';

  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export const ELEMENTARY_UPPER_DEFAULT_SUBJECT_TEMPLATES = [
  'Bahasa Indonesia',
  'Mathematics',
  'English',
  'Pendidikan Agama Islam',
  'Ilmu Pengetahuan Alam & Sosial (IPAS)',
  'Pendidikan Pancasila',
  'Seni Budaya & Prakarya',
  'Pendidikan Jasmani, Olahraga & Kesehatan',
  'Information and Communications Technology'
];

// ==========================================
// D. ATTENDANCE & SIGNATORY TYPES
// ==========================================

export interface ElementaryUpperAttendanceConfig {
  id: string; // `${classId}_${normYear}_S${semester}_M${month}`
  classId: string;
  className?: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalSchoolDays: number; // Hari Efektif
  signingDate: string; // Titimangsa, e.g. "Depok, 31 Oktober 2025"
  signingLocation: string; // e.g. "Depok"
  studentAttendanceMap: Record<string, {
    presentDays: number;
    totalDays?: number;
    notes?: string;
  }>;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
}

export interface ElementaryUpperAttendanceSummary {
  startDate: string;
  endDate: string;
  presentDays: number;
  totalDays: number;
  percentage: number;
  basisDescription: string;
  isAvailable: boolean;
}

/**
 * Calculates student attendance summary.
 * CRITICAL RULE: Missing data must NEVER be assumed 100%!
 */
export function calculateUpperStudentAttendanceSummary(
  config: ElementaryUpperAttendanceConfig | null | undefined,
  studentId: string
): ElementaryUpperAttendanceSummary {
  if (!config || !config.totalSchoolDays || config.totalSchoolDays <= 0) {
    return {
      startDate: config?.startDate || '',
      endDate: config?.endDate || '',
      presentDays: 0,
      totalDays: 0,
      percentage: 0,
      basisDescription: 'Belum dikonfigurasi',
      isAvailable: false
    };
  }

  const studentRec = config.studentAttendanceMap?.[studentId];
  if (!studentRec || typeof studentRec.presentDays !== 'number' || studentRec.presentDays < 0) {
    return {
      startDate: config.startDate,
      endDate: config.endDate,
      presentDays: 0,
      totalDays: config.totalSchoolDays,
      percentage: 0,
      basisDescription: 'Data presensi siswa belum diisi',
      isAvailable: false
    };
  }

  const effectiveTotal = studentRec.totalDays && studentRec.totalDays > 0 ? studentRec.totalDays : config.totalSchoolDays;
  const clampedPresent = Math.min(studentRec.presentDays, effectiveTotal);
  const percentage = Math.round((clampedPresent / effectiveTotal) * 100);

  return {
    startDate: config.startDate,
    endDate: config.endDate,
    presentDays: clampedPresent,
    totalDays: effectiveTotal,
    percentage,
    basisDescription: `${clampedPresent} dari ${effectiveTotal} hari sekolah (${percentage}%)`,
    isAvailable: true
  };
}

export interface ElementaryUpperReportSignatory {
  principalName: string;
  principalTitle?: string;
  principalNiy?: string;
  principalSignatureUrl?: string | null;
  homeroomTeacherName: string;
  homeroomTeacherNiy?: string;
  homeroomTeacherSignatureUrl?: string | null;
  signingDate: string;
  signingLocation: string;
}

// ==========================================
// E. PUBLICATION & SNAPSHOT TYPES
// ==========================================

export type ElementaryUpperReportKind = 'MONTHLY_PROGRESS' | 'LITERACY_NUMERACY';

export type ElementaryUpperDeliveryStatus = 'NOT_SENT' | 'SENT' | 'REVOKED';

export interface ElementaryUpperMonthlyProgressSnapshot {
  student: {
    id: string;
    name: string;
    nisn: string;
    className: string;
    grade: number;
  };
  academicYear: string;
  semester: string;
  month: string;
  monthLabel: string;
  curriculum: ElementaryUpperCurriculumDoc;
  scoresSummary: {
    scores: Record<string, number>;
    lgStatus: Record<string, UpperLGStatusMode>;
    projectScores: Record<string, number>;
    projectLgStatus: Record<string, UpperLGStatusMode>;
    lgResults: Record<string, UpperLGAverageResult>;
    projectLgResults: Record<string, UpperLGAverageResult>;
  };
  narratives: {
    monthlyGeneralComment: string;
    approvedByName?: string;
    approvedAt?: number;
  };
  attendance: ElementaryUpperAttendanceSummary;
  signatory: ElementaryUpperReportSignatory;
}

export interface ElementaryUpperLiteracyNumeracySnapshot {
  student: {
    id: string;
    name: string;
    nisn: string;
    className: string;
    grade: number;
  };
  academicYear: string;
  semester: string;
  month: string;
  monthLabel: string;
  classConfig: ElementaryUpperLitNumClassConfigDoc;
  record: ElementaryUpperLitNumRecordDoc;
  narratives: {
    bahasaIndonesiaNarrative: string;
    englishNarrative: string;
    mathematicsNarrative: string;
    approvedByName?: string;
    approvedAt?: number;
  };
  signatory: ElementaryUpperReportSignatory;
}

export interface PublishedElementaryUpperReportDoc {
  id: string; // `${normYear}_S${semester}_M${month}_${classId}_${studentId}_${reportKind}`
  unit: 'ELEMENTARY';
  reportType: 'MONTHLY_REPORT_UPPER';
  reportKind: ElementaryUpperReportKind;
  studentId: string;
  studentNameSnapshot: string;
  nisnSnapshot: string;
  classId: string;
  classNameSnapshot: string;
  gradeSnapshot: number;
  academicYear: string;
  semester: string;
  month: string;
  monthLabel: string;
  version: number;
  status: 'PUBLISHED';
  deliveryStatus: ElementaryUpperDeliveryStatus;
  isSentToPortal: boolean;
  sentAt: number | null;
  sentBy: string | null;
  sentByName?: string | null;
  
  monthlyProgressSnapshot?: ElementaryUpperMonthlyProgressSnapshot;
  litNumSnapshot?: ElementaryUpperLiteracyNumeracySnapshot;

  driveFileUrl?: string;
  driveFileId?: string;
  fileName?: string;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: number;

  // Portal tracking
  isOpened: boolean;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  openCount: number;
  openedByEmail: string | null;

  createdAt: number;
  updatedAt: number;
}

export interface ElementaryUpperPublishValidationResult {
  isEligible: boolean;
  blockingReasons: string[];
  warnings: string[];
}

/**
 * Normalizes academic year for document IDs (e.g. 2025/2026 -> 2025_2026)
 */
export function normalizeUpperYear(academicYear: string): string {
  return (academicYear || '2025_2026').replace(/\//g, '_').trim();
}

/**
 * Deterministic, retry-safe document ID for published Upper Grade reports
 */
export function buildPublishedUpperReportDocId(
  classId: string,
  studentId: string,
  academicYear: string,
  semester: string,
  month: string,
  reportKind: ElementaryUpperReportKind
): string {
  const normYear = normalizeUpperYear(academicYear);
  return `${normYear}_S${semester}_M${month}_${classId}_${studentId}_${reportKind}`;
}

export function buildUpperAttendanceConfigDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeUpperYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

/**
 * Normalizes export filename for Upper Grade documents:
 * [Nama Siswa] - Monthly Progress [Bulan] - [Tahun Ajaran].pdf
 * [Nama Siswa] - Literasi Numerasi [Bulan] - [Tahun Ajaran].pdf
 */
export function normalizeUpperReportFilename(
  studentName: string,
  reportKind: ElementaryUpperReportKind,
  monthLabel: string,
  academicYear: string
): string {
  const sanitize = (val: string) =>
    (val || '')
      .replace(/[\/\\:\*\?"<>\|]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

  const cleanStudent = sanitize(studentName);
  const cleanMonth = sanitize(monthLabel);
  const cleanYear = academicYear.replace(/\//g, '-').trim();
  const kindLabel = reportKind === 'MONTHLY_PROGRESS' ? 'Monthly Progress' : 'Literasi Numerasi';

  return `${cleanStudent} - ${kindLabel} ${cleanMonth} - ${cleanYear}.pdf`;
}

/**
 * Pre-publish validation gate for MONTHLY_PROGRESS document
 */
export function validateUpperMonthlyProgressPublishEligibility(params: {
  student: { id: string; name: string };
  curriculumDoc: ElementaryUpperCurriculumDoc | null;
  studentDataDoc: ElementaryUpperStudentDataDoc | null;
  narrativesDoc: ElementaryUpperStudentNarrativesDoc | null;
  attendanceSummary: ElementaryUpperAttendanceSummary | null;
  signatory: ElementaryUpperReportSignatory | null;
}): ElementaryUpperPublishValidationResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  const { student, curriculumDoc, studentDataDoc, narrativesDoc, attendanceSummary, signatory } = params;

  if (!curriculumDoc || !curriculumDoc.subjects || curriculumDoc.subjects.length === 0) {
    blockingReasons.push('Struktur kurikulum pelajaran belum dibuat untuk periode ini.');
  }

  const scores = studentDataDoc?.scores || {};
  const lgStatusMap = studentDataDoc?.lgStatus || {};
  const projectScores = studentDataDoc?.projectScores || {};
  const projectLgStatusMap = studentDataDoc?.projectLgStatus || {};

  // Check active subjects and LGs
  if (curriculumDoc?.subjects) {
    for (const sub of curriculumDoc.subjects) {
      if (sub.isActiveForReport === false) continue;
      for (const lg of sub.learningGoals || []) {
        if (lg.isActiveForReport === false) continue;
        const statusMode = lgStatusMap[lg.id] || 'AUTO';
        if (statusMode === 'IP') {
          // Explicit In Progress - valid and allowed!
          continue;
        }
        const loList = lg.learningObjectives || [];
        if (loList.length === 0) {
          warnings.push(`Pelajaran "${sub.name}", LG "${lg.code || lg.title}" belum memiliki LO.`);
          continue;
        }
        let missingCount = 0;
        for (const lo of loList) {
          const val = scores[lo.id];
          if (val === undefined || val === null || val === '') {
            missingCount++;
          }
        }
        if (missingCount > 0) {
          blockingReasons.push(`Nilai "${sub.name} - ${lg.code || lg.title}" belum lengkap (${missingCount} LO belum dinilai).`);
        }
      }
    }
  }

  // Check active projects and LGs
  if (curriculumDoc?.projects) {
    for (const proj of curriculumDoc.projects) {
      if (proj.isActiveForReport === false) continue;
      for (const lg of proj.learningGoals || []) {
        const statusMode = projectLgStatusMap[lg.id] || 'AUTO';
        if (statusMode === 'IP') continue;
        const loList = lg.learningObjectives || [];
        for (const lo of loList) {
          const val = projectScores[lo.id];
          if (val === undefined || val === null || val === '') {
            blockingReasons.push(`Nilai Proyek "${proj.name} - ${lg.code || lg.title}" belum lengkap.`);
            break;
          }
        }
      }
    }
  }

  // Check Narasi & Approval
  const review = narrativesDoc?.monthlyProgressReview;
  if (!review || review.reviewStatus !== 'APPROVED') {
    const curStatus = review?.reviewStatus || 'DRAFT';
    blockingReasons.push(`Paket narasi Monthly Progress belum di-approve oleh Kepala Unit (Status saat ini: ${curStatus}).`);
  }
  if (review?.isSourceStale) {
    blockingReasons.push('Data nilai diubah setelah narasi Monthly Progress di-approve. Perlu review ulang.');
  }
  if (!narrativesDoc?.monthlyGeneralComment || !narrativesDoc.monthlyGeneralComment.trim()) {
    blockingReasons.push('General Monthly Comment siswa belum diisi.');
  }

  // Check Attendance
  if (!attendanceSummary || !attendanceSummary.isAvailable) {
    blockingReasons.push('Data kehadiran siswa belum dikonfigurasi (tidak boleh diasumsikan 100%).');
  }

  // Check Signatory
  if (!signatory?.principalName || !signatory.principalName.trim()) {
    blockingReasons.push('Nama Kepala Sekolah (Principal) penandatangan belum dikonfigurasi.');
  }
  if (!signatory?.homeroomTeacherName || !signatory.homeroomTeacherName.trim()) {
    blockingReasons.push('Nama Homeroom Teacher penandatangan belum dikonfigurasi.');
  }

  return {
    isEligible: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}

/**
 * Pre-publish validation gate for LITERACY_NUMERACY document
 */
export function validateUpperLiteracyNumeracyPublishEligibility(params: {
  student: { id: string; name: string };
  currentMonth: string;
  classConfigDoc: ElementaryUpperLitNumClassConfigDoc | null;
  litNumRecordDoc: ElementaryUpperLitNumRecordDoc | null;
  narrativesDoc: ElementaryUpperStudentNarrativesDoc | null;
  signatory: ElementaryUpperReportSignatory | null;
}): ElementaryUpperPublishValidationResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  const { currentMonth, classConfigDoc, litNumRecordDoc, narrativesDoc, signatory } = params;

  if (!classConfigDoc) {
    blockingReasons.push('Konfigurasi standar minimal Literasi & Numerasi kelas belum diatur.');
  } else {
    for (const f of UPPER_LITNUM_FIELDS) {
      const std = classConfigDoc.standards?.[f.field];
      if (typeof std !== 'number' || std <= 0) {
        blockingReasons.push(`Standar minimal untuk bidang "${f.label}" belum ditentukan.`);
      }
    }
    if (!classConfigDoc.comparisonPeriods || classConfigDoc.comparisonPeriods.length === 0) {
      warnings.push('Belum ada periode perbandingan grafik yang dipilih.');
    }
  }

  // Check scores for current month in all 3 fields
  const periodScores = litNumRecordDoc?.periodScores;
  for (const f of UPPER_LITNUM_FIELDS) {
    const entry = periodScores?.[f.field]?.[currentMonth];
    if (!entry || entry.score === null || entry.score === undefined || isNaN(entry.score)) {
      blockingReasons.push(`Nilai capaian periode ini (${f.label}) belum diinput.`);
    }
  }

  // Check 3 Narratives & Approval
  const review = narrativesDoc?.litNumReview;
  if (!review || review.reviewStatus !== 'APPROVED') {
    const curStatus = review?.reviewStatus || 'DRAFT';
    blockingReasons.push(`Paket narasi Literasi & Numerasi belum di-approve oleh Kepala Unit (Status saat ini: ${curStatus}).`);
  }
  if (review?.isSourceStale) {
    blockingReasons.push('Data nilai Literasi/Numerasi diubah setelah di-approve. Perlu review ulang.');
  }

  if (!narrativesDoc?.bahasaIndonesiaNarrative || !narrativesDoc.bahasaIndonesiaNarrative.trim()) {
    blockingReasons.push('Deskripsi Narasi Bahasa Indonesia belum diisi.');
  }
  if (!narrativesDoc?.englishNarrative || !narrativesDoc.englishNarrative.trim()) {
    blockingReasons.push('Deskripsi Narasi English belum diisi.');
  }
  if (!narrativesDoc?.mathematicsNarrative || !narrativesDoc.mathematicsNarrative.trim()) {
    blockingReasons.push('Deskripsi Narasi Mathematics belum diisi.');
  }

  // Check Signatory
  if (!signatory?.principalName || !signatory.principalName.trim()) {
    blockingReasons.push('Nama Kepala Sekolah (Principal) penandatangan belum dikonfigurasi.');
  }
  if (!signatory?.homeroomTeacherName || !signatory.homeroomTeacherName.trim()) {
    blockingReasons.push('Nama Homeroom Teacher penandatangan belum dikonfigurasi.');
  }

  return {
    isEligible: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}
