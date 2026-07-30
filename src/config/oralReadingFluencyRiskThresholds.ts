export type JuniorHighOrfGrade = 7 | 8 | 9;

export type OralReadingRiskLevel =
  | 'HIGH_RISK'
  | 'MEDIUM_RISK'
  | 'LOW_RISK';

export type OralReadingRiskThreshold = {
  highRiskMax: number;
  mediumRiskMin: number;
  mediumRiskMax: number;
  lowRiskMin: number;
};

export const SPRING_ASSESSMENT_3_ORF_THRESHOLDS: Record<
  JuniorHighOrfGrade,
  OralReadingRiskThreshold
> = {
  7: {
    highRiskMax: 119,
    mediumRiskMin: 120,
    mediumRiskMax: 146,
    lowRiskMin: 147,
  },
  8: {
    highRiskMax: 121,
    mediumRiskMin: 122,
    mediumRiskMax: 146,
    lowRiskMin: 147,
  },
  9: {
    highRiskMax: 121,
    mediumRiskMin: 122,
    mediumRiskMax: 146,
    lowRiskMin: 147,
  },
};

export function isJuniorHighOrfGrade(
  grade: number | null | undefined
): grade is JuniorHighOrfGrade {
  return grade === 7 || grade === 8 || grade === 9;
}

export function isOralReadingFluencyRiskApplicable(input: {
  unitId: string | null | undefined;
  grade: number | null | undefined;
  assessmentType: string | null | undefined;
  wpm: number | null | undefined;
}): boolean {
  const isJh = input.unitId === 'JUNIOR_HIGH' || input.unitId === 'JUNIORHIGH';
  const isReading = input.assessmentType === 'ENGLISH_READING' || input.assessmentType === 'ORAL_READING_FLUENCY';
  return (
    isJh &&
    isJuniorHighOrfGrade(input.grade) &&
    isReading &&
    input.wpm !== null &&
    input.wpm !== undefined &&
    Number.isFinite(input.wpm) &&
    Number(input.wpm) >= 0
  );
}

export function getOralReadingFluencyRiskLevel(
  grade: number | null | undefined,
  wpm: number | null | undefined
): OralReadingRiskLevel | null {
  if (!isJuniorHighOrfGrade(grade) || wpm === null || wpm === undefined || !Number.isFinite(wpm)) {
    return null;
  }

  const threshold = SPRING_ASSESSMENT_3_ORF_THRESHOLDS[grade];

  if (wpm <= threshold.highRiskMax) {
    return 'HIGH_RISK';
  }

  if (wpm <= threshold.mediumRiskMax) {
    return 'MEDIUM_RISK';
  }

  return 'LOW_RISK';
}

export function parseGradeFromClassName(className: string | null | undefined): number | null {
  if (!className) return null;
  // Support prefixes like "Grade ", "Kelas ", or none
  const pattern = /^\s*(?:Grade|Kelas)?\s*(7|8|9)(?:\s+|-|[A-Za-z]|$)/i;
  const match = className.match(pattern);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
