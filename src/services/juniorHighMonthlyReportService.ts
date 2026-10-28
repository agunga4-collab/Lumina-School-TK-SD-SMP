import { auth } from '../lib/firebase';

export interface MonthlyCommentAIOptions {
  studentName: string;
  nickname?: string;
  gender: 'MALE' | 'FEMALE';
  monthPeriod?: string;
  learningContext?: string;
  attendanceSummary?: string;
  reflectionSummary?: string;
  strengths: string[];
  achievements: string[];
  needsImprovement: string[];
  manualNotes?: string;
}

export interface MonthlyCommentRefineOptions {
  studentName?: string;
  nickname?: string;
  originalComment: string;
}

/**
 * Calls server-side AI endpoint for Junior High Monthly Report General Comment in Indonesian.
 */
export async function generateMonthlyGeneralCommentAI(params: MonthlyCommentAIOptions): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Sesi login telah berakhir. Silakan muat ulang halaman.');
  }

  const response = await fetch('/api/junior-high/monthly/generate-general-comment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  const resJson = await response.json();
  if (!response.ok) {
    throw new Error(resJson.error || 'AI belum dapat digunakan. Silakan gunakan penyusunan narasi manual.');
  }

  return resJson.text || '';
}

/**
 * Refines/polishes Junior High Monthly Report comment draft using server-side AI.
 */
export async function refineMonthlyGeneralCommentAI(params: MonthlyCommentRefineOptions): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Sesi login telah berakhir. Silakan muat ulang halaman.');
  }

  const originalComment = (params.originalComment || '').trim();
  if (!originalComment) {
    throw new Error('Teks komentar tidak boleh kosong.');
  }

  const response = await fetch('/api/junior-high/monthly/refine-general-comment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  const resJson = await response.json();
  if (!response.ok) {
    throw new Error(resJson.error || 'Gagal merapikan komentar dengan AI.');
  }

  return resJson.text || '';
}

/**
 * Deterministic, high-quality Indonesian narrative synthesizer.
 * Combines real available monthly data with selected teacher focus aspects without fabricating facts.
 */
export function generateDeterministicMonthlyComment(params: MonthlyCommentAIOptions & { templateId?: string }): string {
  const callName = (params.nickname && params.nickname.trim()) || params.studentName.trim().split(' ')[0] || params.studentName.trim();
  const sentences: string[] = [];

  // Opening based on template / focus
  if (params.templateId === 'ACADEMIC_INDEPENDENCE') {
    sentences.push(`Alhamdulillah, sepanjang periode bulan ini ananda ${callName} menunjukkan antusiasme belajar dan kemandirian yang sangat baik dalam menyelesaikan rangkaian aktivitas di kelas.`);
  } else if (params.templateId === 'ACTIVE_COLLABORATION') {
    sentences.push(`Alhamdulillah, ananda ${callName} memperlihatkan perkembangan yang positif dalam interaksi sosial, keaktifan bertanya, serta kerja sama yang solid bersama teman di kelas.`);
  } else if (params.templateId === 'GUIDANCE_FOCUS') {
    sentences.push(`Alhamdulillah, proses pembelajaran ananda ${callName} bulan ini terus menunjukkan kemajuan yang bermakna dengan pendampingan yang konsisten dari para guru.`);
  } else if (params.templateId === 'ISLAMIC_CHARACTER') {
    sentences.push(`Alhamdulillah, ananda ${callName} senantiasa mengedepankan adab islami yang santun, kepedulian antarteman, serta kedisiplinan yang terpuji di lingkungan sekolah.`);
  } else {
    sentences.push(`Alhamdulillah, ananda ${callName} menjalani kegiatan pembelajaran bulan ini dengan dedikasi dan kesungguhan yang patut diapresiasi.`);
  }

  // Attendance mention if provided and clean
  if (params.attendanceSummary && !params.attendanceSummary.includes('Tidak Tersedia')) {
    if (params.attendanceSummary.includes('Sakit: 0') && params.attendanceSummary.includes('Izin: 0') && params.attendanceSummary.includes('Alpa: 0')) {
      sentences.push(`Tingkat kehadiran ananda sangat prima dengan catatan kehadiran penuh dan tepat waktu.`);
    }
  }

  // Learning / topics context mention if available
  if (params.learningContext && params.learningContext.trim() && !params.learningContext.includes('(Ringkasan kelas umum)')) {
    const cleanTopic = params.learningContext.replace(/\n+/g, ' ').slice(0, 100);
    sentences.push(`Ananda berpartisipasi dengan baik pada materi pembahasan kelas mengenai ${cleanTopic}.`);
  }

  // Selected strengths
  if (params.strengths && params.strengths.length > 0) {
    const sText = params.strengths.map(s => s.toLowerCase().trim()).join(', serta ');
    sentences.push(`Dalam keseharian belajar, ananda ${sText}.`);
  }

  // Selected achievements
  if (params.achievements && params.achievements.length > 0) {
    const aText = params.achievements.map(a => a.toLowerCase().trim()).join(', dan ');
    sentences.push(`Capaian yang ditunjukkan antara lain ${aText}.`);
  }

  // Self-Exploration reflection mention if provided
  if (params.reflectionSummary && params.reflectionSummary.trim() && !params.reflectionSummary.includes('(Belum ada refleksi khusus)')) {
    sentences.push(`Pada kegiatan eksplorasi diri, ananda juga telah menyelesaikan dan merefleksikan pengalamannya secara positif.`);
  }

  // Selected recommendations / areas for improvement
  if (params.needsImprovement && params.needsImprovement.length > 0) {
    const nText = params.needsImprovement.map(n => n.toLowerCase().trim()).join(', serta ');
    sentences.push(`Untuk terus mengoptimalkan potensinya, ananda ${callName} disarankan untuk ${nText}.`);
  }

  // Teacher manual notes
  if (params.manualNotes && params.manualNotes.trim()) {
    sentences.push(params.manualNotes.trim());
  }

  // Closing encouraging prayer/wish
  sentences.push(`Semoga ananda senantiasa istiqomah dan semakin percaya diri dalam mengembangkan potensinya di bulan mendatang.`);

  return sentences.join(' ');
}

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { 
  JuniorHighMonthlyReportComment, 
  MonthlyGenComReviewStatus, 
  MonthlyCommentReviewHistoryEntry 
} from '../types';

/**
 * Checks if a user has authority to approve or request revisions for Junior High comments.
 * Super Admin OR Kepala Unit SMP (HEAD_JUNIOR, HEAD_UNIT SMP, PRINCIPAL/VICE_PRINCIPAL SMP).
 */
export function isJuniorHighApprover(user?: { role?: string; unitId?: string } | null): boolean {
  if (!user || !user.role) return false;
  const role = user.role.toUpperCase();
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'HEAD_JUNIOR') return true;
  if (role === 'HEAD_UNIT' && (!user.unitId || user.unitId === 'JUNIOR_HIGH')) return true;
  if ((role === 'PRINCIPAL' || role === 'VICE_PRINCIPAL') && (!user.unitId || user.unitId === 'JUNIOR_HIGH')) return true;
  return false;
}

/**
 * Submit one or multiple comments for review.
 * State transition: DRAFT / REVISION_REQUESTED -> SUBMITTED.
 */
export async function submitMonthlyCommentsForReview(
  comments: JuniorHighMonthlyReportComment[],
  actor: { uid: string; displayName?: string; email?: string; role?: string }
): Promise<{ successCount: number; errors: string[] }> {
  if (!comments || comments.length === 0) return { successCount: 0, errors: [] };

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const errors: string[] = [];
  let count = 0;

  for (const c of comments) {
    if (!c.id) {
      errors.push(`ID komentar siswa ${c.studentNameSnapshot} tidak valid.`);
      continue;
    }
    if (!c.generalComment || !c.generalComment.trim()) {
      errors.push(`Komentar ${c.studentNameSnapshot} masih kosong.`);
      continue;
    }

    const docRef = doc(db, 'junior_high_monthly_report_comments', c.id);
    const newHistoryEntry: MonthlyCommentReviewHistoryEntry = {
      action: c.reviewStatus === 'REVISION_REQUESTED' ? 'RESUBMITTED' : 'SUBMITTED',
      actorId: actor.uid,
      actorName: actor.displayName || actor.email || 'Guru',
      actorRole: actor.role || 'TEACHER',
      timestamp: now,
      commentSnapshot: c.generalComment
    };

    const updatedHistory = [newHistoryEntry, ...(c.reviewHistory || [])];

    batch.update(docRef, {
      reviewStatus: 'SUBMITTED',
      submittedAt: now,
      submittedByUid: actor.uid,
      submittedByName: actor.displayName || actor.email || 'Guru',
      reviewHistory: updatedHistory,
      version: (c.version || 1) + 1
    });
    count++;
  }

  if (count > 0) {
    await batch.commit();
  }

  return { successCount: count, errors };
}

/**
 * Approve one or multiple submitted comments.
 * Performed by Kepala Unit SMP or Super Admin.
 * Does NOT overwrite author/content editor metadata.
 */
export async function approveMonthlyComments(
  comments: JuniorHighMonthlyReportComment[],
  actor: { uid: string; displayName?: string; email?: string; role?: string }
): Promise<{ successCount: number; errors: string[] }> {
  if (!comments || comments.length === 0) return { successCount: 0, errors: [] };

  if (!isJuniorHighApprover(actor)) {
    throw new Error('Anda tidak memiliki izin sebagai Kepala Unit SMP atau Super Admin untuk menyetujui komentar.');
  }

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const errors: string[] = [];
  let count = 0;

  for (const c of comments) {
    if (!c.id) {
      errors.push(`ID komentar siswa ${c.studentNameSnapshot} tidak valid.`);
      continue;
    }

    const docRef = doc(db, 'junior_high_monthly_report_comments', c.id);
    const newHistoryEntry: MonthlyCommentReviewHistoryEntry = {
      action: 'APPROVED',
      actorId: actor.uid,
      actorName: actor.displayName || actor.email || 'Reviewer',
      actorRole: actor.role || 'HEAD_JUNIOR',
      timestamp: now,
      commentSnapshot: c.generalComment
    };

    const updatedHistory = [newHistoryEntry, ...(c.reviewHistory || [])];

    batch.update(docRef, {
      reviewStatus: 'APPROVED',
      reviewedAt: now,
      reviewedByUid: actor.uid,
      reviewedByName: actor.displayName || actor.email || 'Reviewer',
      reviewedByRole: actor.role || 'HEAD_JUNIOR',
      reviewFeedback: '', // Clear revision feedback on approval
      reviewHistory: updatedHistory,
      version: (c.version || 1) + 1
    });
    count++;
  }

  if (count > 0) {
    await batch.commit();
  }

  return { successCount: count, errors };
}

/**
 * Request revision for one or multiple comments with mandatory feedback.
 * Performed by Kepala Unit SMP or Super Admin.
 * Does NOT overwrite author/content editor metadata.
 */
export async function requestRevisionMonthlyComments(
  comments: JuniorHighMonthlyReportComment[],
  feedback: string,
  actor: { uid: string; displayName?: string; email?: string; role?: string }
): Promise<{ successCount: number; errors: string[] }> {
  const cleanFeedback = (feedback || '').trim();
  if (!cleanFeedback) {
    throw new Error('Catatan/feedback revisi wajib diisi agar guru mengetahui bagian yang perlu diperbaiki.');
  }

  if (!comments || comments.length === 0) return { successCount: 0, errors: [] };

  if (!isJuniorHighApprover(actor)) {
    throw new Error('Anda tidak memiliki izin sebagai Kepala Unit SMP atau Super Admin untuk meminta revisi.');
  }

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const errors: string[] = [];
  let count = 0;

  for (const c of comments) {
    if (!c.id) {
      errors.push(`ID komentar siswa ${c.studentNameSnapshot} tidak valid.`);
      continue;
    }

    const docRef = doc(db, 'junior_high_monthly_report_comments', c.id);
    const newHistoryEntry: MonthlyCommentReviewHistoryEntry = {
      action: 'REVISION_REQUESTED',
      actorId: actor.uid,
      actorName: actor.displayName || actor.email || 'Reviewer',
      actorRole: actor.role || 'HEAD_JUNIOR',
      timestamp: now,
      feedback: cleanFeedback,
      commentSnapshot: c.generalComment
    };

    const updatedHistory = [newHistoryEntry, ...(c.reviewHistory || [])];

    batch.update(docRef, {
      reviewStatus: 'REVISION_REQUESTED',
      reviewedAt: now,
      reviewedByUid: actor.uid,
      reviewedByName: actor.displayName || actor.email || 'Reviewer',
      reviewedByRole: actor.role || 'HEAD_JUNIOR',
      reviewFeedback: cleanFeedback,
      reviewHistory: updatedHistory,
      version: (c.version || 1) + 1
    });
    count++;
  }

  if (count > 0) {
    await batch.commit();
  }

  return { successCount: count, errors };
}

/**
 * Open revision on an approved or submitted comment to unlock it for teacher edits.
 */
export async function openRevisionMonthlyComment(
  comment: JuniorHighMonthlyReportComment,
  actor: { uid: string; displayName?: string; email?: string; role?: string }
): Promise<void> {
  if (!comment?.id) throw new Error('ID komentar tidak valid.');

  if (!isJuniorHighApprover(actor)) {
    throw new Error('Hanya Kepala Unit SMP atau Super Admin yang dapat membuka revisi komentar.');
  }

  const now = new Date().toISOString();
  const docRef = doc(db, 'junior_high_monthly_report_comments', comment.id);

  const newHistoryEntry: MonthlyCommentReviewHistoryEntry = {
    action: 'REVISION_OPENED',
    actorId: actor.uid,
    actorName: actor.displayName || actor.email || 'Reviewer',
    actorRole: actor.role || 'HEAD_JUNIOR',
    timestamp: now,
    feedback: 'Revisi dibuka kembali oleh Kepala Unit/Admin.',
    commentSnapshot: comment.generalComment
  };

  const updatedHistory = [newHistoryEntry, ...(comment.reviewHistory || [])];

  await updateDoc(docRef, {
    reviewStatus: 'REVISION_REQUESTED',
    reviewedAt: now,
    reviewedByUid: actor.uid,
    reviewedByName: actor.displayName || actor.email || 'Reviewer',
    reviewedByRole: actor.role || 'HEAD_JUNIOR',
    reviewFeedback: 'Revisi dibuka kembali. Silakan sesuaikan komentar dan ajukan ulang.',
    reviewHistory: updatedHistory,
    version: (comment.version || 1) + 1
  });
}

export interface PreviousGencomHistoryItem {
  id: string;
  source: 'MONTHLY' | 'MIDTERM';
  reportTitle: string;
  periodKey: string;
  periodLabel: string;
  semester: string;
  commentText: string;
  status: string;
  reviewStatus?: string;
  reviewedByName?: string;
  updatedAt?: string;
  updatedByName?: string;
}

/**
 * Fetches Gencom Monthly and Midterm from strictly previous periods in the selected academic year.
 * Cross-semester within the academic year is included.
 * Future periods and current selected month are excluded.
 */
export async function fetchStudentPreviousGencomHistory(
  studentId: string,
  academicYear: string,
  currentPeriodKey: string,
  currentSemester: string
): Promise<PreviousGencomHistoryItem[]> {
  if (!studentId || !academicYear || !currentPeriodKey) return [];

  const results: PreviousGencomHistoryItem[] = [];

  try {
    // 1. Fetch previous Monthly comments
    const monthlyQ = query(
      collection(db, 'junior_high_monthly_report_comments'),
      where('studentId', '==', studentId),
      where('academicYear', '==', academicYear)
    );
    const monthlySnap = await getDocs(monthlyQ);

    monthlySnap.docs.forEach((d) => {
      const data = d.data() as JuniorHighMonthlyReportComment;
      // Filter strictly previous periods (periodKey < currentPeriodKey)
      if (data.periodKey && data.periodKey < currentPeriodKey && data.generalComment?.trim()) {
        results.push({
          id: d.id,
          source: 'MONTHLY',
          reportTitle: 'Monthly Progress Report',
          periodKey: data.periodKey,
          periodLabel: data.periodLabel || data.periodKey,
          semester: data.semester || '1',
          commentText: data.generalComment.trim(),
          status: data.status || 'DRAFT',
          reviewStatus: data.reviewStatus || 'DRAFT',
          reviewedByName: data.reviewedByName,
          updatedAt: data.updatedAt,
          updatedByName: data.updatedByName || data.updatedBy
        });
      }
    });

    // 2. Fetch previous Midterm comments from jh_midterm_student_data
    try {
      const midtermQ = query(
        collection(db, 'jh_midterm_student_data'),
        where('studentId', '==', studentId),
        where('academicYear', '==', academicYear)
      );
      const midtermSnap = await getDocs(midtermQ);

      midtermSnap.docs.forEach((d) => {
        const data = d.data();
        const text = (data.generalComment?.finalComment || data.generalComment?.draftComment || '').trim();
        if (!text) return;

        const mSem = String(data.semester || '1');
        const mTerm = String(data.midtermTerm || '1');
        const termLabel = mTerm === '2' ? 'Midterm 2' : 'Midterm 1';
        const label = `${termLabel} (Semester ${mSem})`;

        // Determine if this midterm is strictly previous to currentPeriodKey
        // In Indonesian school calendar:
        // Semester 1 Midterm occurs around October (e.g. 2026-10).
        // Semester 2 Midterm occurs around March (e.g. 2027-03).
        const midtermKey = mSem === '1' ? `${currentPeriodKey.split('-')[0]}-09-midterm` : `${currentPeriodKey.split('-')[0]}-03-midterm`;

        let isPrevious = false;
        if (currentSemester === '2') {
          // In semester 2, Semester 1 midterm is always previous
          if (mSem === '1') isPrevious = true;
          // In semester 2, Midterm 2 is previous only if month is after March
          else if (currentPeriodKey >= `${currentPeriodKey.split('-')[0]}-04`) isPrevious = true;
        } else {
          // In semester 1, Midterm 1 is previous only if month is November or December
          if (mSem === '1' && currentPeriodKey >= `${currentPeriodKey.split('-')[0]}-11`) isPrevious = true;
        }

        if (isPrevious) {
          results.push({
            id: d.id,
            source: 'MIDTERM',
            reportTitle: 'Midterm Progress Report',
            periodKey: midtermKey,
            periodLabel: label,
            semester: mSem,
            commentText: text,
            status: data.generalComment?.isFinal ? 'FINAL' : 'DRAFT',
            reviewStatus: data.generalCommentReviewStatus || 'DRAFT',
            reviewedByName: data.approvedByName,
            updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : undefined,
            updatedByName: data.updatedBy
          });
        }
      });
    } catch (midtermErr) {
      console.warn('Could not query Midterm history records:', midtermErr);
    }

    // Sort descending by periodKey
    results.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  } catch (err) {
    console.error('Error fetching previous gencom history:', err);
  }

  return results;
}
