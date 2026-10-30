export type ElementaryMonthlyPredicate = 'A' | 'D' | 'B';

export interface ElementaryMonthlyLearningObjective {
  id: string;
  code: string;
  title: string;
  order: number;
}

export interface ElementaryMonthlyLearningGoal {
  id: string;
  code: string;
  title: string;
  order: number;
  kkmOverride?: number; // 0 < K < 100
  learningObjectives: ElementaryMonthlyLearningObjective[];
}

export interface ElementaryMonthlySubject {
  id: string;
  name: string;
  kkm: number; // default 70, 0 < K < 100
  order: number;
  learningGoals: ElementaryMonthlyLearningGoal[];
}

export interface ElementaryMonthlyCurriculumDoc {
  id: string; // `${classId}_${normYear}_S${semester}_M${month}`
  classId: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  subjects: ElementaryMonthlySubject[];
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface ElementaryMonthlyStudentScoreDoc {
  id: string; // `${studentId}_${classId}_${normYear}_S${semester}_M${month}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  scores: Record<string, number>; // loId -> score (0-100)
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface LGAverageResult {
  average: number | null; // null if all blank
  displayAverage: string; // e.g. "84.99", "70", "-"
  predicate: ElementaryMonthlyPredicate | null;
  kkm: number;
  batasA: number;
  totalLOs: number;
  filledLOs: number;
  isComplete: boolean;
}

/**
 * Calculates the arithmetic average of LO scores for an LG, and derives
 * the predicate based on KKM and Batas A = K + (100 - K) / 2.
 * 
 * Rules:
 * - Empty/blank is NOT zero.
 * - If all LOs are blank -> average is null, predicate is null.
 * - Conversion uses exact floating number before rounding.
 * - Display average formatted to at most 2 decimals.
 */
export function calculateLGAverageAndPredicate(
  scores: Record<string, number | undefined | null | string>,
  loList: ElementaryMonthlyLearningObjective[],
  kkm: number = 70
): LGAverageResult {
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

  if (filledCount === 0 || totalLOs === 0) {
    return {
      average: null,
      displayAverage: '-',
      predicate: null,
      kkm: effectiveKkm,
      batasA,
      totalLOs,
      filledLOs: 0,
      isComplete: false
    };
  }

  const rawAvg = sum / filledCount;

  let predicate: ElementaryMonthlyPredicate;
  if (rawAvg >= batasA) {
    predicate = 'A';
  } else if (rawAvg >= effectiveKkm) {
    predicate = 'D';
  } else {
    predicate = 'B';
  }

  // Display average formatted up to 2 decimal places without trailing unnecessary zeros
  const rounded2 = Math.round(rawAvg * 100) / 100;
  const displayAverage = Number.isInteger(rounded2) ? String(rounded2) : rounded2.toFixed(2).replace(/\.?0+$/, '');

  return {
    average: rawAvg,
    displayAverage,
    predicate,
    kkm: effectiveKkm,
    batasA,
    totalLOs,
    filledLOs: filledCount,
    isComplete: filledCount === totalLOs && totalLOs > 0
  };
}

export const ELEMENTARY_DEFAULT_SUBJECT_TEMPLATES = [
  'Bahasa Indonesia',
  'Mathematics',
  'English',
  'Pendidikan Agama Islam',
  'Arts and Crafts',
  'Physical Education',
  'Information and Communications Technology',
  'Tematik'
];
