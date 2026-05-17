import { 
  MTSSAcademicScreeningResult, 
  MTSSAcademicRiskFlag, 
  MTSSAcademicRiskLevel, 
  MTSSAcademicRecommendedAction,
  ClassScreeningSummary,
  Student
} from '../types';
import { MTSS_ACADEMIC_BASIC_SKILLS, MTSS_SOP_CONFIG } from '../constants/mtssSop';

/**
 * Screening Engine Logic for MTSS Academic Junior High
 */

export function buildScreeningResult(
  student: Student,
  domain: 'BI' | 'ENG' | 'NUM',
  assessments: any[],
  historicalCases: any[],
  teacherReferral: { flagged: boolean; notes?: string } = { flagged: false }
): MTSSAcademicScreeningResult {
  const flags: MTSSAcademicRiskFlag[] = [];
  const basicSkillsBelow: string[] = [];
  
  // 1. Analyze Scores for Basic Skills
  const recentAssessments = assessments
    .filter(a => a.studentId === student.id && a.category === (domain === 'NUM' ? 'NUMERACY' : 'LITERACY'))
    .sort((a, b) => b.date - a.date);
    
  const averageScore = recentAssessments.length > 0
    ? recentAssessments.reduce((acc, curr) => acc + curr.score, 0) / recentAssessments.length
    : null;

  if (averageScore !== null && averageScore < MTSS_SOP_CONFIG.SCORE_LOW_THRESHOLD) {
    flags.push('LOW_PERFORMANCE_BASIC_SKILLS');
  }

  // Check specific basic skills mapping (Mock logic - in real app would use tag-based assessments)
  const skillsForGrade = MTSS_ACADEMIC_BASIC_SKILLS.filter(s => s.grade === student.grade && s.domain === (domain === 'NUM' ? 'NUMERACY' : 'BI'));
  
  recentAssessments.forEach(a => {
    if (a.score < MTSS_SOP_CONFIG.SCORE_CRITICAL_THRESHOLD && a.skillCode) {
      if (!basicSkillsBelow.includes(a.skillCode)) {
        basicSkillsBelow.push(a.skillCode);
      }
    }
  });

  // 2. Trend Analysis
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN' = 'UNKNOWN';
  if (recentAssessments.length >= 2) {
    const latest = recentAssessments[0].score;
    const previous = recentAssessments[1].score;
    if (latest > previous + 5) trend = 'IMPROVING';
    else if (latest < previous - 5) {
      trend = 'DECLINING';
      flags.push('SIGNIFICANT_REGRESSION');
    }
    else trend = 'STABLE';
  }

  // 3. Historical Data
  const previousTier2 = historicalCases.filter(c => c.studentId === student.id && c.domain === domain && c.currentTier === 'Tier 2');
  const previousTier3 = historicalCases.filter(c => c.studentId === student.id && c.domain === domain && c.currentTier === 'Tier 3');

  if (previousTier2.length > 0) flags.push('REPEATED_TIER2_HISTORY');
  if (previousTier3.length > 0) flags.push('PREVIOUS_TIER3_HISTORY');

  // 4. Teacher Referral
  if (teacherReferral.flagged) {
    flags.push('TEACHER_REFERRAL');
  }

  // Determine Risk Level
  let riskLevel: MTSSAcademicRiskLevel = 'LOW';
  if (flags.includes('PREVIOUS_TIER3_HISTORY') || (flags.length >= 3 && averageScore !== null && averageScore < MTSS_SOP_CONFIG.SCORE_CRITICAL_THRESHOLD)) {
    riskLevel = 'HIGH';
  } else if (flags.length >= 1 || (averageScore !== null && averageScore < MTSS_SOP_CONFIG.SCORE_LOW_THRESHOLD)) {
    riskLevel = 'MODERATE';
  }

  // Determine Recommended Action
  let recommendedAction: MTSSAcademicRecommendedAction = 'MONITOR_IN_TIER1';
  if (riskLevel === 'HIGH') {
    recommendedAction = flags.includes('PREVIOUS_TIER3_HISTORY') ? 'CONSIDER_TIER3_REVIEW' : 'RECOMMEND_TIER2';
  } else if (riskLevel === 'MODERATE') {
    recommendedAction = 'CONSIDER_TIER2_DISCUSSION';
  }

  return {
    id: `${student.id}-${domain}-${Date.now()}`,
    studentId: student.id,
    studentName: student.name,
    classId: student.classId,
    className: (student as any).className || 'Unknown',
    domain,
    gradeLevel: student.grade as 7 | 8 | 9,
    basicSkillsBelowExpectation: basicSkillsBelow,
    averageScore,
    recentTrend: trend,
    riskFlags: flags,
    riskLevel,
    recommendedAction,
    lastAssessmentDate: recentAssessments.length > 0 ? recentAssessments[0].date : null,
    teacherNotes: teacherReferral.notes
  };
}

export function aggregateClassSummaries(
  screeningResults: MTSSAcademicScreeningResult[],
  students: Student[]
): ClassScreeningSummary[] {
  const classMap = new Map<string, MTSSAcademicScreeningResult[]>();
  
  screeningResults.forEach(res => {
    const group = classMap.get(res.classId) || [];
    group.push(res);
    classMap.set(res.classId, group);
  });

  const summaries: ClassScreeningSummary[] = [];

  classMap.forEach((results, classId) => {
    const classStudents = students.filter(s => s.classId === classId);
    const domain = results[0].domain;
    const tier2Candidates = results.filter(r => r.recommendedAction === 'RECOMMEND_TIER2').length;
    const percentage = classStudents.length > 0 ? (tier2Candidates / classStudents.length) * 100 : 0;

    summaries.push({
      classId,
      className: results[0].className,
      totalStudents: classStudents.length,
      domain,
      tier2CandidateCount: tier2Candidates,
      tier2CandidatePercentage: percentage,
      exceedsRecommendedThreshold: percentage > MTSS_SOP_CONFIG.TIER2_THRESHOLD_PERCENTAGE
    });
  });

  return summaries;
}
