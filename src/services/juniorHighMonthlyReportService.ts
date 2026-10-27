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
