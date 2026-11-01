import { auth, db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  updateDoc,
  writeBatch 
} from 'firebase/firestore';

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
 * 24 Official Strengths & Progress Bank Items (Junior High)
 * "Mulai" and "Konsisten" must never be merged.
 */
export const JH_MONTHLY_STRENGTHS_BANK: string[] = [
  'Mulai berpartisipasi aktif dalam kelas.',
  'Konsisten berpartisipasi aktif dalam kelas.',
  'Mulai menyadari pengaruh usaha terhadap hasil belajar.',
  'Percaya usahanya membuahkan hasil positif.',
  'Mulai percaya diri mengerjakan tugas.',
  'Memiliki keyakinan tinggi untuk berhasil dalam tugas.',
  'Mulai memahami manfaat tugas.',
  'Sangat memahami manfaat tugas sekolah.',
  'Mulai tekun dan berusaha fokus menghadapi gangguan/tantangan.',
  'Konsisten tekun, tepat waktu dan memberikan usaha terbaik.',
  'Mulai menggunakan strategi belajar, memantau pemahaman dan memperbaiki kesalahan.',
  'Konsisten menggunakan strategi belajar yang efektif, memantau pemahaman dan memperbaiki kesalahan.',
  'Mulai menunjukkan kehadiran lebih teratur, partisipasi dan kesiapan belajar.',
  'Konsisten hadir teratur, siap, fokus dan aktif belajar.',
  'Mulai bekerja sama dan menjaga hubungan positif.',
  'Konsisten membangun dan menjaga hubungan positif.',
  'Mulai asertif, menyampaikan ide positif dan mencari bantuan.',
  'Konsisten asertif tanpa merugikan orang lain.',
  'Mulai bertanggung jawab terhadap tugas dan ekspektasi.',
  'Konsisten bertanggung jawab terhadap kewajiban akademik.',
  'Mulai peduli, memahami perspektif teman dan menghargai perbedaan.',
  'Menunjukkan kepedulian tinggi terhadap perasaan teman.',
  'Mulai mengelola stres dan mencari solusi saat menghadapi kendala.',
  'Konsisten mengelola stres dan mencari solusi secara positif.'
];

/**
 * Achievements Bank is EMPTY by default.
 * Teachers can write free-form or select custom added options.
 */
export const JH_MONTHLY_ACHIEVEMENTS_BANK: string[] = [];

/**
 * 12 Official Needs Improvement & Recommendations Bank Items (Junior High)
 * Focuses on aspects that still need guidance or development, never claims of mastery.
 */
export const JH_MONTHLY_NEEDS_IMPROVEMENT_BANK: string[] = [
  'Memerlukan dorongan untuk berpartisipasi aktif dalam diskusi kelas.',
  'Perlu menyadari bahwa usaha konsisten memengaruhi hasil belajar.',
  'Memerlukan bimbingan untuk membangun keyakinan diri dalam menuntaskan tugas.',
  'Perlu memahami tujuan dan manfaat dari tugas yang diberikan.',
  'Memerlukan pendampingan untuk menjaga fokus dan ketekunan saat menghadapi tantangan.',
  'Perlu membiasakan evaluasi mandiri dan memperbaiki kesalahan belajar.',
  'Memerlukan perhatian pada keteraturan kehadiran dan kesiapan mengikuti pelajaran.',
  'Perlu bimbingan dalam bekerja sama dan membangun interaksi positif dengan teman.',
  'Memerlukan dorongan untuk menyampaikan kebutuhan belajar secara asertif.',
  'Perlu meningkatkan tanggung jawab terhadap tugas dan kesepakatan kelas.',
  'Memerlukan penguatan empati dan kepedulian terhadap lingkungan sekitar.',
  'Perlu pendampingan dalam mengelola emosi dan menghadapi situasi sulit secara konstruktif.'
];

export interface JHMonthlyCustomOption {
  id: string;
  group: 'STRENGTHS' | 'ACHIEVEMENTS' | 'NEEDS_IMPROVEMENT';
  text: string;
  scope: 'CLASS' | 'SPECIFIC_CLASSES' | 'ALL_JH';
  targetClassIds?: string[];
  unit: 'JUNIOR_HIGH';
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  isArchived?: boolean;
}

/**
 * Fetch custom comment choices saved by teachers for Junior High.
 */
export async function fetchJHMonthlyCustomOptions(classId?: string): Promise<JHMonthlyCustomOption[]> {
  try {
    const q = query(
      collection(db, 'jh_monthly_comment_custom_options'),
      where('unit', '==', 'JUNIOR_HIGH')
    );
    const snap = await getDocs(q);
    const list: JHMonthlyCustomOption[] = [];

    snap.forEach((d) => {
      const data = d.data() as JHMonthlyCustomOption;
      if (data.isArchived) return;

      // Filter by scope
      if (data.scope === 'ALL_JH') {
        list.push({ ...data, id: d.id });
      } else if (classId && data.targetClassIds && data.targetClassIds.includes(classId)) {
        list.push({ ...data, id: d.id });
      }
    });

    return list;
  } catch (err) {
    console.warn('Could not fetch JH monthly custom options:', err);
    return [];
  }
}

/**
 * Save new teacher-created option for monthly comments with explicit scope.
 */
export async function saveJHMonthlyCustomOption(
  option: Omit<JHMonthlyCustomOption, 'id' | 'createdAt'>
): Promise<JHMonthlyCustomOption> {
  const docRef = doc(collection(db, 'jh_monthly_comment_custom_options'));
  const fullData: JHMonthlyCustomOption = {
    ...option,
    id: docRef.id,
    createdAt: new Date().toISOString(),
    unit: 'JUNIOR_HIGH',
    isArchived: false,
  };
  await setDoc(docRef, fullData);
  return fullData;
}

/**
 * Archive a custom option so it won't appear in picker, without mutating past snapshots.
 */
export async function archiveJHMonthlyCustomOption(optionId: string): Promise<void> {
  const docRef = doc(db, 'jh_monthly_comment_custom_options', optionId);
  await updateDoc(docRef, { isArchived: true });
}

/**
 * Computes default month using Asia/Jakarta timezone.
 * Day 1–10: previous month (e.g., 1 & 10 Nov 2026 -> 2026-10; 1 Jan 2027 -> 2026-12).
 * Day 11+: current month (e.g., 11 Nov 2026 -> 2026-11; 11 Jan 2027 -> 2027-01).
 */
export function getJakartaDefaultMonth(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.format(date).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (day <= 10) {
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  } else {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
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
 * Strictly adheres to LUMINA Junior High Monthly narrative standards:
 * 1. Single paragraph, maximum 120 words.
 * 2. MUST begin with "Ananda [panggilan] telah ...".
 * 3. Use pronoun "ananda", NEVER "dia" or "ia".
 * 4. Positive tone WITHOUT contrasting conjunctions ("tetapi", "namun", "meskipun").
 * 5. Recommendations MUST use "Ananda disarankan untuk ...".
 * 6. Closing encouraging growth wish.
 * 7. Congratulations ONLY if valid achievements are specified.
 */
export function generateDeterministicMonthlyComment(params: MonthlyCommentAIOptions): string {
  const callName = (params.nickname && params.nickname.trim()) || params.studentName.trim().split(' ')[0] || params.studentName.trim();
  const sentences: string[] = [];

  // Opening & Strengths
  if (params.strengths && params.strengths.length > 0) {
    const sText = params.strengths.map(s => {
      let clean = s.trim().replace(/\.$/, '');
      return clean.charAt(0).toLowerCase() + clean.slice(1);
    }).join(', serta ');
    sentences.push(`Ananda ${callName} telah menunjukkan perkembangan positif dalam proses belajar bulan ini, di antaranya ${sText}.`);
  } else {
    sentences.push(`Ananda ${callName} telah berpartisipasi dengan baik dalam rangkaian aktivitas pembelajaran sepanjang bulan ini.`);
  }

  // Factual Attendance (only if available and positive)
  if (params.attendanceSummary && !params.attendanceSummary.includes('Tidak Tersedia') && !params.attendanceSummary.includes('Belum Tersedia')) {
    if (params.attendanceSummary.includes('Alpa: 0') && (params.attendanceSummary.includes('Sakit: 0') || params.attendanceSummary.includes('Izin: 0'))) {
      sentences.push(`Kedisiplinan kehadiran ananda terjaga dengan sangat baik sepanjang periode ini.`);
    }
  }

  // Achievements (congratulations ONLY if filled)
  if (params.achievements && params.achievements.length > 0) {
    const validAchievements = params.achievements.filter(a => a && a.trim());
    if (validAchievements.length > 0) {
      const aText = validAchievements.map(a => a.trim().replace(/\.$/, '')).join(', serta ');
      sentences.push(`Selamat atas capaian membanggakan ananda dalam ${aText}.`);
    }
  }

  // Needs Improvement / Recommendation
  if (params.needsImprovement && params.needsImprovement.length > 0) {
    const nText = params.needsImprovement.map(n => {
      let clean = n.trim().replace(/\.$/, '');
      return clean.charAt(0).toLowerCase() + clean.slice(1);
    }).join(', serta ');
    sentences.push(`Ananda disarankan untuk ${nText}.`);
  }

  // Additional teacher manual notes (filtered for pronouns)
  if (params.manualNotes && params.manualNotes.trim()) {
    let cleanNotes = params.manualNotes.trim();
    cleanNotes = cleanNotes.replace(/\bdia\b/gi, 'ananda').replace(/\bia\b/gi, 'ananda');
    sentences.push(cleanNotes);
  }

  // Closing growth wish
  sentences.push(`Semoga ananda senantiasa termotivasi dan terus bertumbuh optimal pada periode belajar berikutnya.`);

  // Combine into a single paragraph
  let paragraph = sentences.join(' ').replace(/\s+/g, ' ').trim();

  // Enforce max 120 words
  const words = paragraph.split(/\s+/);
  if (words.length > 120) {
    paragraph = words.slice(0, 120).join(' ') + '.';
  }

  return paragraph;
}

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
