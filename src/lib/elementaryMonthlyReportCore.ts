import type { User } from '../types';
import type { ElementaryMonthlyStudentScoreDoc, ElementaryMonthlyAttendanceConfig, ElementaryMonthlyAttendanceSummary } from '../types/elementaryMonthlyReport';
import { buildElementaryMonthlyAttendanceSummary } from './elementaryMonthlyReportModel';

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function normalizeAcademicYear(academicYear: string): string {
  return academicYear ? academicYear.replace(/\//g, '_') : '2025_2026';
}

export function buildMonthlyCurriculumDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildMonthlyStudentScoreDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

export function formatMonthLabel(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, mStr] = monthStr.split('-');
  const mIndex = parseInt(mStr, 10) - 1;
  if (mIndex >= 0 && mIndex < 12) {
    return `${MONTH_NAMES_ID[mIndex]} ${yearStr}`;
  }
  return monthStr;
}

export function getMonthOptionsForAcademicYear(academicYear: string, semester: string): Array<{ value: string; label: string }> {
  const parts = academicYear.split('/');
  const startYear = parseInt(parts[0], 10) || 2025;
  const endYear = parseInt(parts[1], 10) || (startYear + 1);

  if (semester === '1') {
    // July to Dec of startYear
    return [
      { value: `${startYear}-07`, label: `Juli ${startYear}` },
      { value: `${startYear}-08`, label: `Agustus ${startYear}` },
      { value: `${startYear}-09`, label: `September ${startYear}` },
      { value: `${startYear}-10`, label: `Oktober ${startYear}` },
      { value: `${startYear}-11`, label: `November ${startYear}` },
      { value: `${startYear}-12`, label: `Desember ${startYear}` },
    ];
  } else {
    // January to June of endYear
    return [
      { value: `${endYear}-01`, label: `Januari ${endYear}` },
      { value: `${endYear}-02`, label: `Februari ${endYear}` },
      { value: `${endYear}-03`, label: `Maret ${endYear}` },
      { value: `${endYear}-04`, label: `April ${endYear}` },
      { value: `${endYear}-05`, label: `Mei ${endYear}` },
      { value: `${endYear}-06`, label: `Juni ${endYear}` },
    ];
  }
}

export function buildMonthlyProjectDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildMonthlyStudentPhotoDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildMonthlyStudentNarrativeDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

export function isElementaryHeadOrSuperAdmin(user: User | null | undefined): boolean {
  if (!user || user.status !== 'active') return false;
  const p = user as any;
  if (p.role === 'SUPER_ADMIN' || ['agunga4@gmail.com', 'agunga4@lazuardi.sch.id'].includes((p.email || '').toLowerCase())) return true;
  const units = [p.unitId, p.unit, ...(p.assignedUnits || [])].filter(Boolean);
  return ['HEAD_UNIT', 'PRINCIPAL'].includes(p.role) && (!units.length || units.some(u => ['ELEMENTARY', 'ALL'].includes(u)));
}

export function computeStudentScoresHash(scoresDoc: ElementaryMonthlyStudentScoreDoc | null): string {
  if (!scoresDoc || !scoresDoc.scores) return '';
  const entries = Object.entries(scoresDoc.scores).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([loId, val]) => `${loId}:${val}`).join('|');
}

export function buildMonthlyAttendanceConfigDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildPublishedMonthlyReportDocId(
  academicYear: string,
  semester: string,
  month: string,
  classId: string,
  studentId: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${normYear}_S${semester}_M${month}_${classId}_${studentId}`;
}

export function calculateStudentAttendanceSummary(
  config: ElementaryMonthlyAttendanceConfig | null,
  studentId: string
): ElementaryMonthlyAttendanceSummary {
  return buildElementaryMonthlyAttendanceSummary(config, studentId);
}
