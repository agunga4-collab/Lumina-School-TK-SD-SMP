import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { 
  MTSSAcademicCase, 
  MTSSAcademicMeeting, 
  MTSSAcademicEvaluation, 
  MTSSAcademicGoal, 
  Student, 
  MTSSAcademicPlan,
  MTSSAcademicSession
} from '../types';
import { 
  getMTSSAcademicCaseById, 
  getMTSSAcademicMeetings, 
  getMTSSAcademicGoals, 
  getStudentById,
  getMTSSAcademicPlans,
  getUserProfile,
  getMTSSAcademicEvaluations,
  getMTSSAcademicSessions
} from '../lib/firebase';

export interface MeetingDocumentData {
  student: Student;
  academicCase: MTSSAcademicCase;
  meeting: MTSSAcademicMeeting;
  goals: MTSSAcademicGoal[];
  plan?: MTSSAcademicPlan;
}

export interface EvaluationDocumentData {
  student: Student;
  academicCase: MTSSAcademicCase;
  evaluation: MTSSAcademicEvaluation;
  goals: MTSSAcademicGoal[];
  sessions: MTSSAcademicSession[];
}

const addHeader = (doc: jsPDF, title: string) => {
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LAZUARDI JUNIOR HIGH SCHOOL', 105, 20, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('MTSS ACADEMIC PROGRAM', 105, 26, { align: 'center' });
  
  doc.setLineWidth(0.5);
  doc.line(20, 30, 190, 30);
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 105, 40, { align: 'center' });
};

const addLabelValue = (doc: jsPDF, label: string, value: string, x: number, y: number, labelWidth = 50) => {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(label + ':', x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(value || '-', x + labelWidth, y);
};

const addParagraph = (doc: jsPDF, label: string, text: string, x: number, y: number): number => {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(label + ':', x, y);
  
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text || '-', 170);
  doc.text(lines, x, y + 5);
  
  return y + 10 + (lines.length * 5);
};

export async function generateInitialMeetingPdf(caseId: string, meetingId: string) {
  const caseData = await getMTSSAcademicCaseById(caseId);
  const meetings = await getMTSSAcademicMeetings(caseId);
  const meeting = meetings.find(m => m.id === meetingId);
  const goals = await getMTSSAcademicGoals(caseId);
  const student = await getStudentById(caseData!.studentId);
  const plans = await getMTSSAcademicPlans(caseId);
  const plan = plans[0]; // Get most recent plan

  if (!caseData || !meeting || !student) throw new Error('Incomplete data for PDF generation');

  const doc = new jsPDF();
  addHeader(doc, 'INITIAL MEETING NOTES');

  let y = 55;
  addLabelValue(doc, 'Student Name', student.name, 20, y);
  addLabelValue(doc, 'Grade/Class', `${caseData.className}`, 120, y);
  y += 7;
  addLabelValue(doc, 'Meeting Date', format(meeting.date, 'PPP'), 20, y);
  addLabelValue(doc, 'Academic Year', caseData.academicYear, 120, y);
  y += 7;
  addLabelValue(doc, 'Participants', meeting.participants.map(p => p.name).join(', '), 20, y);
  y += 12;

  y = addParagraph(doc, 'Summary of Current Data / Background', meeting.summaryCurrentData, 20, y);
  y = addParagraph(doc, 'Strengths', meeting.strengths, 20, y);
  y = addParagraph(doc, 'Current Grade-Level Concerns', meeting.currentConcerns, 20, y);
  y = addParagraph(doc, 'Definition of Problem', meeting.definitionOfProblem, 20, y);

  if (y > 240) { doc.addPage(); y = 20; }

  doc.setFont('helvetica', 'bold');
  doc.text('INTERVENTION PLAN', 20, y);
  y += 7;

  goals.forEach((goal, idx) => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.text(`Domain ${idx + 1}: ${goal.domain}`, 25, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Goal: ${goal.title}`, 25, y);
    y += 5;
    doc.text(`Target: ${goal.measurableTarget}`, 25, y);
    y += 10;
  });

  if (plan) {
    addLabelValue(doc, 'Frequency', `${plan.frequencyPerWeek}x per week (${plan.durationMinutes} mins)`, 20, y);
    y += 7;
    y = addParagraph(doc, 'Strategies', plan.plannedStrategies.join(', '), 20, y);
    y = addParagraph(doc, 'Materials', plan.plannedMaterials.join(', '), 20, y);
  }

  y += 10;
  addLabelValue(doc, 'Next Review Date', meeting.nextReviewDate ? format(meeting.nextReviewDate, 'PPP') : 'TBD', 20, y);

  return doc;
}

export async function generateFollowUpMeetingPdf(caseId: string, meetingId: string) {
  const caseData = await getMTSSAcademicCaseById(caseId);
  const meetings = await getMTSSAcademicMeetings(caseId);
  const meeting = meetings.find(m => m.id === meetingId);
  const student = await getStudentById(caseData!.studentId);
  const goals = await getMTSSAcademicGoals(caseId);
  const plans = await getMTSSAcademicPlans(caseId);
  const plan = plans[0];

  if (!caseData || !meeting || !student) throw new Error('Data not found');

  const doc = new jsPDF();
  addHeader(doc, 'FOLLOW-UP MEETING NOTES');

  let y = 55;
  addLabelValue(doc, 'Student Name', student.name, 20, y);
  addLabelValue(doc, 'Class', caseData.className, 120, y);
  y += 7;
  addLabelValue(doc, 'Meeting Date', format(meeting.date, 'PPP'), 20, y);
  y += 15;

  y = addParagraph(doc, 'Current Summary', meeting.summaryCurrentData, 20, y);
  y = addParagraph(doc, 'Progress toward previous goals', goals.map(g => `${g.title}: ${g.status}`).join('\n'), 20, y);
  y = addParagraph(doc, 'Current Concern', meeting.currentConcerns, 20, y);
  
  doc.setFont('helvetica', 'bold');
  doc.text('DECISION / NEXT STEPS', 20, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  const decisionLines = doc.splitTextToSize(meeting.notes, 170);
  doc.text(decisionLines, 20, y);
  y += (decisionLines.length * 6) + 10;

  if (meeting.nextReviewDate) {
    addLabelValue(doc, 'Next Review Date', format(meeting.nextReviewDate, 'PPP'), 20, y);
  }

  return doc;
}

export async function generateTier3TransitionPdf(caseId: string) {
  const caseData = await getMTSSAcademicCaseById(caseId);
  const student = await getStudentById(caseData!.studentId);
  const goals = await getMTSSAcademicGoals(caseId);
  const sessions = await getMTSSAcademicSessions(caseId);
  const evaluations = await getMTSSAcademicEvaluations(caseId);
  const latestEvaluation = evaluations[0];

  if (!caseData || !student) throw new Error('Data not found');

  const doc = new jsPDF();
  addHeader(doc, 'TIER 3 TRANSITION / CONTINUATION SUMMARY');

  let y = 55;
  addLabelValue(doc, 'Student Name', student.name, 20, y);
  addLabelValue(doc, 'Grade', `${caseData.className}`, 120, y);
  y += 7;
  addLabelValue(doc, 'Domain(s)', caseData.subjectDomains.join(', '), 20, y);
  y += 15;

  doc.setFont('helvetica', 'bold');
  doc.text('SUMMARY OF TIER 2 IMPLEMENTATION', 20, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Sessions Completed: ${sessions.length}`, 25, y);
  y += 7;
  doc.text(`Implementation Results: ${latestEvaluation?.recommendedTier === 'Tier 3' ? 'Candidate for Escalation' : 'Review for Tier 3 Continuation'}`, 25, y);
  y += 15;

  y = addParagraph(doc, 'Reason for Escalation / Continuation', latestEvaluation?.additionalComments || 'Evaluation of current progress indicates need for more intensive data-driven support.', 20, y);
  
  doc.setFont('helvetica', 'bold');
  doc.text('RECOMMENDED TIER 3 FOCUS', 20, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  goals.filter(g => g.status !== 'ACHIEVED').forEach(g => {
    doc.text(`- ${g.title}: ${g.measurableTarget}`, 25, y);
    y += 6;
  });

  y += 10;
  doc.setFontSize(9);
  doc.text('This summary serves as the official handoff document for the Tier 3 Planning Team.', 20, y);

  return doc;
}

export async function generateParentCommitmentPdf(caseId: string) {
  const caseData = await getMTSSAcademicCaseById(caseId);
  const student = await getStudentById(caseData!.studentId);
  const meetings = await getMTSSAcademicMeetings(caseId);
  const initialMeeting = meetings.find(m => m.meetingType === 'INITIAL');

  if (!caseData || !student) throw new Error('Data not found');

  const doc = new jsPDF();
  addHeader(doc, 'SURAT PERNYATAAN & KOMITMEN ORANG TUA / WALI');

  let y = 60;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const intro = `Kami yang bertanda tangan di bawah ini, orang tua/wali dari siswa:`;
  doc.text(intro, 20, y);
  y += 15;

  addLabelValue(doc, 'Nama Siswa', student.name, 30, y, 40);
  y += 7;
  addLabelValue(doc, 'Kelas', caseData.className, 30, y, 40);
  y += 7;
  addLabelValue(doc, 'Tahun Ajaran', caseData.academicYear, 30, y, 40);
  y += 15;

  const bodyText = `Menyatakan telah memahami rencana dukungan akademik (MTSS Tier 2) yang telah didiskusikan pada pertemuan tanggal ${initialMeeting ? format(initialMeeting.date, 'PPP') : '__________'}.

Sebagai bagian dari upaya optimalisasi potensi belajar siswa, kami berkomitmen untuk:
1. Menciptakan lingkungan belajar yang kondusif di rumah.
2. Membantu penguatan konsep akademik sesuai anjuran guru.
3. Berkomunikasi secara aktif dengan tim pengajar mengenai perkembangan siswa.
4. Memberikan motivasi dan dukungan emosional bagi siswa selama proses intervensi.
5. Bersedia mendukung langkah pembelajaran lanjutan (Tier 3) apabila diperlukan berdasarkan evaluasi berkala.

Demikian pernyataan ini kami buat dengan penuh kesadaran demi kebaikan putra/putri kami.`;

  const lines = doc.splitTextToSize(bodyText, 170);
  doc.text(lines, 20, y);
  
  y += (lines.length * 6) + 20;
  
  doc.text('Jakarta, ' + format(new Date(), 'PPP'), 130, y);
  y += 10;
  doc.text('Orang Tua / Wali,', 140, y);
  y += 30;
  doc.text('( ____________________ )', 135, y);

  return doc;
}

export async function generateEvaluationReportPdf(caseId: string, evaluationId: string) {
  const caseData = await getMTSSAcademicCaseById(caseId);
  const evaluation = (await getMTSSAcademicEvaluations(caseId)).find(e => e.id === evaluationId);
  const student = await getStudentById(caseData!.studentId);
  const goals = await getMTSSAcademicGoals(caseId);

  if (!caseData || !evaluation || !student) throw new Error('Data not found');

  const doc = new jsPDF();
  addHeader(doc, 'TIER 2 LEARNING EVALUATION REPORT');

  let y = 55;
  addLabelValue(doc, 'Student Name', student.name, 20, y);
  addLabelValue(doc, 'Class', caseData.className, 120, y);
  y += 7;
  addLabelValue(doc, 'Evaluation Date', format(evaluation.date, 'PPP'), 20, y);
  addLabelValue(doc, 'Period', caseData.academicYear, 120, y);
  y += 15;

  doc.setFont('helvetica', 'bold');
  doc.text('PROGRESS SUMMARY', 20, y);
  y += 10;

  evaluation.domainSummaries.forEach(ds => {
    if (y > 240) { doc.addPage(); y = 20; }
    const goal = goals.find(g => g.id === ds.goalId);
    doc.setFont('helvetica', 'bold');
    doc.text(`${ds.domain} - ${goal?.title || 'Goal'}`, 25, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const commentLines = doc.splitTextToSize(ds.progressComment, 160);
    doc.text(commentLines, 25, y);
    y += (commentLines.length * 5) + 3;
    doc.setFont('helvetica', 'bold');
    doc.text(`Result: ${ds.result}`, 25, y);
    y += 10;
  });

  y = addParagraph(doc, 'Additional Comments', evaluation.additionalComments, 20, y);
  y += 5;
  addLabelValue(doc, 'Strategy Decision', evaluation.strategyDecision, 20, y);
  y += 7;
  addLabelValue(doc, 'Recommended Next Tier', evaluation.recommendedTier, 20, y);

  y += 30;
  doc.text('Homeroom Teacher,', 30, y);
  doc.text('Principal,', 140, y);
  y += 25;
  doc.text('____________________', 20, y);
  doc.text('____________________', 130, y);

  return doc;
}
