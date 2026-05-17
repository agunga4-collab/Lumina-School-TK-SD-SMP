import { 
  getMTSSCases, 
  getAssessments, 
  getReportCards,
  getActiveCaseForStudent,
  getMTSSAcademicCases
} from '../lib/firebase';
import { 
  MTSSAcademicStudentContext,
  AttendanceContextSummary,
  BehaviorContextSummary,
  AssessmentContextSummary,
  RaporContextSummary,
  MTSSAcademicDomain
} from '../types';

export async function getStudentSupportContext(
  studentId: string, 
  domains: MTSSAcademicDomain[]
): Promise<MTSSAcademicStudentContext> {
  const [behaviorCase, assessments, reports] = await Promise.all([
    getActiveCaseForStudent(studentId),
    getAssessments(),
    getReportCards({ status: 'PUBLISHED' })
  ]);

  // Behavior Context
  const behavior: BehaviorContextSummary = {
    activeCaseId: behaviorCase?.id,
    currentTier: behaviorCase?.tier as any,
    lastIncidentDate: behaviorCase?.lastConcernDate,
    cicoActive: !!(behaviorCase as any)?.isCICOActive || !!(behaviorCase as any)?.tier2Meeting?.cicoGoals?.length,
    recentConcern: behaviorCase?.lastConcernSummary
  };

  // Assessment Context
  const relevantAssessments: AssessmentContextSummary[] = domains.map(domain => {
    const subject = mapDomainToSubject(domain);
    const filtered = (assessments || [])
      .filter(a => a.subject === subject)
      .filter(a => a.scores.some(s => s.studentId === studentId))
      .sort((a, b) => b.assessedAt - a.assessedAt)
      .slice(0, 5);

    const recentScores = filtered.map(a => {
      const studentScore = a.scores.find(s => s.studentId === studentId);
      // Map AssessmentScore ("A", "B", "D") to numeric values for calculation
      const scoreMap: Record<string, number> = { 'A': 100, 'B': 75, 'D': 50 };
      const goalScoresArray = Object.values(studentScore?.goalScores || {});
      const validScores = goalScoresArray.filter((gs: any) => gs.score !== null);
      const totalScoreValue = validScores.reduce((sum, gs: any) => sum + (scoreMap[gs.score as string] || 0), 0);
      const count = validScores.length || 1;
      
      return {
        date: a.assessedAt,
        score: totalScoreValue / count,
        label: a.assessmentLabel
      };
    });

    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    if (recentScores.length >= 2) {
      const diff = recentScores[0].score - recentScores[1].score;
      if (diff > 5) trend = 'up';
      else if (diff < -5) trend = 'down';
    }

    const latestScore = recentScores[0]?.score || 0;
    const masteryLevel = latestScore > 80 ? 'HIGH' : latestScore > 60 ? 'MEDIUM' : 'LOW';

    return {
      domain,
      recentScores,
      masteryLevel,
      trend
    };
  });

  // Rapor Context
  const relevantReports = (reports || [])
    .map(r => ({
      report: r,
      studentData: r.studentReports.find(sr => sr.studentId === studentId)
    }))
    .filter(x => x.studentData);
    
  const latestResult = relevantReports.sort((a, b) => b.report.updatedAt - a.report.updatedAt)[0];
  const narrative = latestResult?.studentData?.selfExplorationComment || latestResult?.report.homeroomComment;
  
  const rapor: RaporContextSummary = {
    lastNarrative: narrative || null,
    consistentWithMTSS: !!narrative?.toLowerCase().includes('perlu bimbingan') || 
                        !!narrative?.toLowerCase().includes('konsentrasi') ||
                        !!narrative?.toLowerCase().includes('academic support'),
    period: latestResult ? `${latestResult.report.academicYear} Sem ${latestResult.report.semester}` : 'N/A'
  };

  // Attendance (Integration Point)
  // In a real app we'd fetch from an attendance service. Mocking realistic pattern.
  const attendance: AttendanceContextSummary = {
    absentCount: 2,
    tardyCount: 4,
    last30DaysTrend: 'stable',
    thresholdWarning: 4 > 3 // Example threshold
  };

  // Insight Tags
  const insightTags: string[] = [];
  if (attendance.thresholdWarning) insightTags.push('Attendance Concern');
  if (attendance.tardyCount > 3) insightTags.push('Frequent Tardiness');
  if (behavior.activeCaseId) insightTags.push('Active Behavior Support');
  if (relevantAssessments.some(a => a.trend === 'down')) insightTags.push('Recent Academic Decline');
  if (rapor.consistentWithMTSS) insightTags.push('Rapor Comment Aligned');
  if (behavior.cicoActive) insightTags.push('Active CICO');

  return {
    studentId,
    behavior,
    assessments: relevantAssessments,
    rapor,
    attendance,
    insightTags
  };
}

// Reverse mapping for Behavior Case to Academic Context
export async function getBehaviorStudentAcademicContext(studentId: string) {
  const academicCases = await getMTSSAcademicCases(); // Filter client side for now
  const activeAcademicCase = academicCases.find(c => c.studentId === studentId && c.status !== 'CLOSED');
  
  return {
    activeAcademicCaseId: activeAcademicCase?.id,
    currentTier: activeAcademicCase?.currentTier,
    domains: activeAcademicCase?.subjectDomains || [],
    status: activeAcademicCase?.status
  };
}

function mapDomainToSubject(domain: MTSSAcademicDomain): string {
  switch (domain) {
    case 'BAHASA_INDONESIA': return 'Bahasa Indonesia';
    case 'ENGLISH': return 'English';
    case 'NUMERACY': return 'Mathematics';
    default: return 'General';
  }
}
