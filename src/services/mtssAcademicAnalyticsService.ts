import { 
  collection, 
  query, 
  where, 
  getDocs, 
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  MTSSAcademicCase,
  MTSSAcademicAnalyticsFilters,
  MTSSAcademicExecutiveOverview,
  MTSSAcademicGradeSummary,
  MTSSAcademicDomainSummary,
  MTSSAcademicProgressSummary,
  MTSSAcademicComplianceSummary,
  MTSSAcademicOutcomeTrendPoint,
  MTSSAcademicSession,
  MTSSAcademicEvaluation,
  MTSSAcademicMeeting,
  MTSSAcademicParentDocument,
  MTSSAcademicAlert,
  MTSSAcademicDomain,
  MTSSAcademicTier,
  MTSSAcademicStatus
} from '../types';

const CASES_COLLECTION = 'mtssAcademicCases';
const SESSIONS_COLLECTION = 'mtssAcademicSessions';
const EVALUATIONS_COLLECTION = 'mtssAcademicEvaluations';
const MEETINGS_COLLECTION = 'mtssAcademicMeetings';
const DOCUMENTS_COLLECTION = 'mtssAcademicParentDocuments';
const ALERTS_COLLECTION = 'mtssAcademicAlerts';

export const getMTSSAcademicExecutiveOverview = async (filters: MTSSAcademicAnalyticsFilters): Promise<MTSSAcademicExecutiveOverview> => {
  let q = query(collection(db, CASES_COLLECTION), where('academicYear', '==', filters.academicYear));
  
  if (filters.semester) {
    q = query(q, where('semester', '==', filters.semester));
  }

  const snapshot = await getDocs(q);
  const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicCase));

  // Filter local for optional fields (Firestore limitations with multiple where)
  const filteredCases = cases.filter(c => {
    if (filters.grade && c.className && !c.className.startsWith(filters.grade.toString())) return false;
    if (filters.classId && c.classId !== filters.classId) return false;
    if (filters.domain && !c.subjectDomains.includes(filters.domain)) return false;
    return true;
  });

  const activeCases = filteredCases.filter(c => c.status !== 'CLOSED');
  
  // Get Alerts for follow-up and parent follow-up
  const alertsSnapshot = await getDocs(query(collection(db, ALERTS_COLLECTION), where('status', '==', 'OPEN')));
  const allAlerts = alertsSnapshot.docs.map(doc => doc.data() as MTSSAcademicAlert);
  
  const followUpAlerts = allAlerts.filter(a => filteredCases.some(c => c.id === a.caseId));

  const now = Date.now();
  const oneWeekFromNow = now + (7 * 24 * 60 * 60 * 1000);

  return {
    totalActiveCases: activeCases.length,
    tier2Active: activeCases.filter(c => c.currentTier === 'Tier 2').length,
    tier3Active: activeCases.filter(c => c.currentTier === 'Tier 3').length,
    newCasesThisTerm: filteredCases.filter(c => c.createdAt > now - (30 * 24 * 60 * 60 * 1000)).length, // Simplified "this term" as last 30 days or based on semester
    reviewsDueThisWeek: followUpAlerts.filter(a => a.type === 'REVIEW_OVERDUE' || (a.dueDate && a.dueDate <= oneWeekFromNow)).length,
    followUpRequired: followUpAlerts.length,
    successfullyClosed: filteredCases.filter(c => c.status === 'CLOSED' && c.latestDecision === 'BACK_TO_TIER_1').length,
    parentFollowUpNeeded: followUpAlerts.filter(a => a.type === 'PARENT_FOLLOWUP_REQUIRED').length
  };
};

export const getMTSSAcademicGradeSummary = async (filters: MTSSAcademicAnalyticsFilters): Promise<MTSSAcademicGradeSummary[]> => {
  const q = query(collection(db, CASES_COLLECTION), where('academicYear', '==', filters.academicYear));
  const snapshot = await getDocs(q);
  const cases = snapshot.docs.map(doc => doc.data() as MTSSAcademicCase);

  const summaries: Record<number, MTSSAcademicGradeSummary> = {
    7: { grade: 7, totalStudents: 0, totalCases: 0, tierDistribution: {}, domainDistribution: {} },
    8: { grade: 8, totalStudents: 0, totalCases: 0, tierDistribution: {}, domainDistribution: {} },
    9: { grade: 9, totalStudents: 0, totalCases: 0, tierDistribution: {}, domainDistribution: {} }
  };

  cases.forEach(c => {
    const gradeMatch = c.className?.match(/^(\d)/);
    if (!gradeMatch) return;
    const grade = parseInt(gradeMatch[1]);
    if (!summaries[grade]) return;

    summaries[grade].totalCases++;
    
    // Tier
    summaries[grade].tierDistribution[c.currentTier] = (summaries[grade].tierDistribution[c.currentTier] || 0) + 1;
    
    // Domain
    c.subjectDomains.forEach(d => {
      summaries[grade].domainDistribution[d] = (summaries[grade].domainDistribution[d] || 0) + 1;
    });
  });

  return Object.values(summaries);
};

export const getMTSSAcademicDomainAnalysis = async (filters: MTSSAcademicAnalyticsFilters): Promise<MTSSAcademicDomainSummary[]> => {
  const q = query(collection(db, CASES_COLLECTION), where('academicYear', '==', filters.academicYear));
  const snapshot = await getDocs(q);
  const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicCase));

  const domains: MTSSAcademicDomain[] = ['ENGLISH', 'NUMERACY', 'BAHASA_INDONESIA'];
  const summaries: MTSSAcademicDomainSummary[] = [];

  for (const domain of domains) {
    const domainCases = cases.filter(c => c.subjectDomains.includes(domain));
    
    // For avg sessions, we need session logs
    // This could be heavy, ideally we have these counts cached in the case doc
    // For now we'll fetch or skip for perf
    
    summaries.push({
      domain,
      totalCases: domainCases.length,
      activeCount: domainCases.filter(c => c.status !== 'CLOSED').length,
      closedCount: domainCases.filter(c => c.status === 'CLOSED').length,
      escalatedToTier3: domainCases.filter(c => c.latestDecision === 'ESCALATE_TO_TIER_3').length,
      avgSessions: 0, // Placeholder
      avgCompletionRate: 0, // Placeholder
      topConcerns: [] // Mock for now
    });
  }

  return summaries;
};

export const getMTSSAcademicProgressSummary = async (filters: MTSSAcademicAnalyticsFilters): Promise<MTSSAcademicProgressSummary> => {
   // Use alerts to define status
   const alertsSnapshot = await getDocs(query(collection(db, ALERTS_COLLECTION), where('status', '==', 'OPEN')));
   const openAlerts = alertsSnapshot.docs.map(doc => doc.data() as MTSSAcademicAlert);

   const casesSnapshot = await getDocs(query(collection(db, CASES_COLLECTION), where('status', '!=', 'CLOSED')));
   const activeCases = casesSnapshot.docs.map(doc => doc.id);

   const actionNeeded = new Set(openAlerts.filter(a => a.severity === 'CRITICAL' && a.caseId).map(a => a.caseId)).size;
   const needsReview = new Set(openAlerts.filter(a => a.severity === 'WARNING' && a.caseId).map(a => a.caseId)).size;
   
   return {
     onTrack: Math.max(0, activeCases.length - actionNeeded - needsReview),
     needsReview,
     actionNeeded
   };
};

export const getMTSSAcademicComplianceOverview = async (filters: MTSSAcademicAnalyticsFilters): Promise<MTSSAcademicComplianceSummary> => {
  const q = query(collection(db, CASES_COLLECTION), where('academicYear', '==', filters.academicYear));
  const snapshot = await getDocs(q);
  const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicCase));

  let initialMeetingComplete = 0;
  let parentCommitmentSent = 0;
  let evaluationCompleted = 0;
  let parentCommunicationRecorded = 0;

  cases.forEach(c => {
    if (c.parentMeetingStatus === 'COMPLETED') initialMeetingComplete++;
    if (c.parentCommitmentStatus !== 'NOT_SENT') parentCommitmentSent++;
    // Add more logic if needed
  });

  return {
    initialMeetingComplete,
    parentCommunicationRecorded, // Requires fetching meeting logs
    parentCommitmentSent,
    evaluationCompleted, // Requires fetching evaluation docs
    totalCases: cases.length
  };
};

export const getMTSSAcademicOutcomeTrends = async (filters: MTSSAcademicAnalyticsFilters): Promise<MTSSAcademicOutcomeTrendPoint[]> => {
  // Normally we would group evaluations by month/term
  const q = query(collection(db, EVALUATIONS_COLLECTION), orderBy('date', 'desc'));
  const snapshot = await getDocs(q);
  const evaluations = snapshot.docs.map(doc => doc.data() as MTSSAcademicEvaluation);

  // Simple grouping by month for now
  const trends: Record<string, MTSSAcademicOutcomeTrendPoint> = {};
  
  evaluations.forEach(e => {
    const month = new Date(e.date).toLocaleString('default', { month: 'short', year: '2-digit' });
    if (!trends[month]) {
      trends[month] = { period: month, continue: 0, revise: 0, close: 0, escalate: 0 };
    }

    if (e.strategyDecision === 'CONTINUE') trends[month].continue++;
    if (e.strategyDecision === 'REVISE' || e.strategyDecision === 'REPLACE') trends[month].revise++;
    if (e.strategyDecision === 'CLOSE') trends[month].close++;
    if (e.strategyDecision === 'ESCALATE') trends[month].escalate++;
  });

  return Object.values(trends).reverse().slice(-6); // Last 6 months
};

export const getMTSSAcademicCrossModuleInsights = async (filters: MTSSAcademicAnalyticsFilters) => {
  // This aggregation would normally be done via cloud functions or more complex joins
  // For now, we perform local aggregation for demonstration
  
  const casesSnapshot = await getDocs(query(collection(db, CASES_COLLECTION), where('status', '!=', 'CLOSED')));
  const academicCases = casesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicCase));
  
  const behaviorSnapshot = await getDocs(query(collection(db, 'behaviorCases'), where('status', '!=', 'CLOSED')));
  const behaviorCases = behaviorSnapshot.docs.map(doc => doc.data());

  const crossCases = academicCases.filter(ac => behaviorCases.some((bc: any) => bc.studentId === ac.studentId));
  
  // Mock data for attendance concern and rapor based on academic case meta (demonstration)
  return {
    casesWithAttendanceConcern: Math.min(academicCases.length, 5), // Mock
    casesWithActiveBehaviorSupport: crossCases.length,
    casesWithAlignedRaporConcern: Math.min(academicCases.length, 3), // Mock
    casesWithPositiveAssessmentTrend: Math.min(academicCases.length, 8) // Mock
  };
};
