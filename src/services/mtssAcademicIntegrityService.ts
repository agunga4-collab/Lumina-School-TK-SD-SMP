import { MTSSAcademicCase, MTSSAcademicGoal, MTSSAcademicSession } from '../types';

export interface IntegrityIssue {
  caseId: string;
  studentName: string;
  issueType: 'MISSING_GOALS' | 'STALE_STATUS' | 'NO_RECENT_SESSIONS' | 'INCONSISTENT_TIER';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

export function runAcademicIntegrityChecks(
  cases: MTSSAcademicCase[],
  goals: MTSSAcademicGoal[],
  sessions: MTSSAcademicSession[]
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  cases.forEach(c => {
    // 1. ACTIVE cases must have goals
    if (c.status === 'ACTIVE') {
      const caseGoals = goals.filter(g => g.caseId === c.id);
      if (caseGoals.length === 0) {
        issues.push({
          caseId: c.id,
          studentName: c.studentName,
          issueType: 'MISSING_GOALS',
          severity: 'HIGH',
          description: 'Case is ACTIVE but has no defined goals.'
        });
      }
    }

    // 2. ACTIVE cases should have recent sessions
    if (c.status === 'ACTIVE') {
      const caseSessions = sessions.filter(s => s.caseId === c.id);
      const latestSession = caseSessions.sort((a, b) => b.date - a.date)[0];
      
      if (!latestSession || (now - latestSession.date > thirtyDays)) {
        issues.push({
          caseId: c.id,
          studentName: c.studentName,
          issueType: 'NO_RECENT_SESSIONS',
          severity: 'MEDIUM',
          description: `No sessions logged in the last 30 days for this active case.`
        });
      }
    }

    // 3. Status consistency
    if (c.status === 'SCREENING' && c.currentTier !== 'Tier 1') {
      issues.push({
        caseId: c.id,
        studentName: c.studentName,
        issueType: 'INCONSISTENT_TIER',
        severity: 'LOW',
        description: `Case is in SCREENING but assigned to ${c.currentTier}. Expected Tier 1 during screening.`
      });
    }
  });

  return issues;
}

export function logOperationalMetric(metricName: string, value: any, tags: Record<string, string> = {}) {
  // In a real production app, this would send to Datadog / CloudWatch / Firebase Analytics
  console.log(`[METRIC] ${metricName}:`, value, tags);
}
