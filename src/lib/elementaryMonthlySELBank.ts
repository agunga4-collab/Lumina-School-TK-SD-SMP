import type { Class } from '../types';

export interface SELAspectTemplate {
  id: string;
  text: string;
}

export interface SELAspectDefinition {
  key: string;
  title: string;
  description: string;
  isBankConfigured: boolean;
  templates: SELAspectTemplate[];
}

/**
 * Official Elementary Lower Grade Aspects by Grade Level:
 * - Kelas 1: Disiplin Diri dan Keterlibatan Sosial.
 * - Kelas 2: Komunikasi, Kerja Sama Tim, dan Disiplin Diri.
 * - Kelas 3: Empati, Motivasi Diri, dan Komunikasi.
 */
export const ELEMENTARY_LOWER_SEL_GRADE_ASPECTS: Record<number, string[]> = {
  1: ['disiplin_diri', 'keterlibatan_sosial'],
  2: ['komunikasi', 'kerja_sama_tim', 'disiplin_diri'],
  3: ['empati', 'motivasi_diri', 'komunikasi']
};

export const ELEMENTARY_LOWER_SEL_ASPECT_DEFINITIONS: Record<string, SELAspectDefinition> = {
  disiplin_diri: {
    key: 'disiplin_diri',
    title: 'Disiplin Diri',
    description: 'Kemampuan mengikuti tata tertib, rutinitas kelas, dan kemandirian menjaga perlengkapan belajar.',
    isBankConfigured: true,
    templates: [
      {
        id: 'dd_1',
        text: 'Mampu mematuhi rutinitas dan instruksi kelas secara mandiri serta teratur menjaga kerapian perlengkapan belajarnya.'
      },
      {
        id: 'dd_2',
        text: 'Menunjukkan kesadaran yang baik terhadap aturan kelas dan mulai konsisten menyelesaikan tugas tepat waktu.'
      },
      {
        id: 'dd_3',
        text: 'Sedang berproses membangun fokus saat pembelajaran mandiri serta bersikap kooperatif saat diingatkan guru.'
      }
    ]
  },
  keterlibatan_sosial: {
    key: 'keterlibatan_sosial',
    title: 'Keterlibatan Sosial',
    description: 'Interaksi positif dengan rekan sebaya, sikap santun, dan partisipasi aktif di lingkungan sekolah.',
    isBankConfigured: true,
    templates: [
      {
        id: 'ks_1',
        text: 'Aktif berinteraksi positif dengan teman sebaya dan senang berpartisipasi dalam setiap kegiatan bersama di kelas.'
      },
      {
        id: 'ks_2',
        text: 'Menunjukkan sikap ramah, senang berbagi, serta menyapa guru dan teman dengan santun setiap hari.'
      },
      {
        id: 'ks_3',
        text: 'Mulai mengembangkan rasa percaya diri dalam pergaulan di sekolah dan terbuka ketika diajak berinteraksi oleh teman.'
      }
    ]
  },
  komunikasi: {
    key: 'komunikasi',
    title: 'Komunikasi',
    description: 'Keterampilan menyampaikan pendapat secara santun dan menyimak teman maupun guru secara aktif.',
    isBankConfigured: true,
    templates: [
      {
        id: 'km_1',
        text: 'Mampu menyampaikan gagasan, perasaan, dan pertanyaan dengan sopan, teratur, serta menggunakan intonasi yang jelas.'
      },
      {
        id: 'km_2',
        text: 'Menyimak dengan penuh perhatian saat orang lain berbicara dan mampu memberikan tanggapan yang relevan.'
      },
      {
        id: 'km_3',
        text: 'Mulai berani mengutarakan pendapat dalam forum kelas dengan dorongan positif serta pendampingan guru.'
      }
    ]
  },
  kerja_sama_tim: {
    key: 'kerja_sama_tim',
    title: 'Kerja Sama Tim',
    description: 'Semangat kolaborasi, kesediaan berbagi tugas, dan menghargai peran rekan satu kelompok.',
    isBankConfigured: true,
    templates: [
      {
        id: 'kt_1',
        text: 'Menunjukkan semangat kolaborasi yang solid, bersedia berbagi tugas, dan saling menyemangati rekan satu kelompok.'
      },
      {
        id: 'kt_2',
        text: 'Dapat bekerja sama secara positif dalam tugas kelompok serta menghormati kesepakatan bersama.'
      },
      {
        id: 'kt_3',
        text: 'Sedang membiasakan diri untuk berbagi tanggung jawab dan mendengarkan masukan teman saat bekerja kelompok.'
      }
    ]
  },
  empati: {
    key: 'empati',
    title: 'Empati',
    description: 'Kepekaan terhadap perasaan orang lain, sikap tenggang rasa, dan kepedulian sosial.',
    isBankConfigured: true,
    templates: [
      {
        id: 'em_1',
        text: 'Menunjukkan kepedulian yang tulus terhadap perasaan orang lain dan tanggap memberikan bantuan kepada teman yang membutuhkan.'
      },
      {
        id: 'em_2',
        text: 'Bersikap tenggang rasa, menghormati perbedaan, dan senantiasa menjaga kerukunan dalam pergaulan di sekolah.'
      },
      {
        id: 'em_3',
        text: 'Mulai belajar memahami situasi teman sebaya dan merespons kondisi sekitar dengan sikap santun dan peduli.'
      }
    ]
  },
  motivasi_diri: {
    key: 'motivasi_diri',
    title: 'Motivasi Diri',
    description: 'Inisiatif belajar mandiri, kegigihan dalam menghadapi tantangan, dan semangat bertumbuh.',
    isBankConfigured: true,
    templates: [
      {
        id: 'md_1',
        text: 'Memiliki inisiatif belajar mandiri yang kuat, antusias mencoba tantangan baru, dan gigih menyelesaikan tugas hingga tuntas.'
      },
      {
        id: 'md_2',
        text: 'Menunjukkan tekad yang konsisten untuk terus berkembang dan menyelesaikan setiap kegiatan pembelajaran dengan sungguh-sungguh.'
      },
      {
        id: 'md_3',
        text: 'Menunjukkan kemauan belajar yang terus bertumbuh dan semakin termotivasi ketika mendapatkan apresiasi serta arahan terarah.'
      }
    ]
  }
};

/**
 * Extracts official elementary lower grade number (1, 2, or 3) from Class data.
 * Returns null if grade is not defined or outside 1..3.
 * Strictly avoids name parsing or silent fallback.
 */
export function getOfficialElementaryLowerGrade(cls: Class | null | undefined): number | null {
  if (!cls) return null;
  const raw = (cls.grade !== undefined && cls.grade !== null && cls.grade !== '') 
    ? cls.grade 
    : (cls as any).gradeLevel;

  if (typeof raw === 'number' && [1, 2, 3].includes(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (['1', '2', '3'].includes(trimmed)) {
      return parseInt(trimmed, 10);
    }
  }
  return null;
}

/**
 * Deterministically assemble Social Emotional Profile narrative without AI.
 */
export function assembleDeterministicSELNarrative(params: {
  studentName: string;
  gradeLevel: number;
  opening?: string;
  closing?: string;
  aspects: Record<string, {
    mode?: 'template' | 'custom';
    selectedText?: string;
    customText?: string;
    teacherNote?: string;
  }>;
}): string {
  const { studentName, gradeLevel, opening, closing, aspects } = params;
  const aspectKeys = ELEMENTARY_LOWER_SEL_GRADE_ASPECTS[gradeLevel] || [];
  
  const sentences: string[] = [];
  
  const effectiveOpening = (opening && opening.trim()) 
    ? opening.trim() 
    : `Dalam perkembangan sosial dan emosional periode ini, ${studentName} menunjukkan proses adaptasi karakter yang positif di lingkungan sekolah.`;

  let hasAspectContent = false;
  const aspectSentences: string[] = [];

  for (const key of aspectKeys) {
    const def = ELEMENTARY_LOWER_SEL_ASPECT_DEFINITIONS[key];
    const sel = aspects[key];
    if (!def || !sel) continue;

    const desc = (sel.mode === 'custom' ? sel.customText : sel.selectedText) || '';
    if (!desc.trim()) continue;

    hasAspectContent = true;
    let s = `Terkait aspek ${def.title.toLowerCase()}, ${desc.trim()}`;
    if (!s.endsWith('.')) {
      s += '.';
    }
    if (sel.teacherNote && sel.teacherNote.trim()) {
      let note = sel.teacherNote.trim();
      if (!note.endsWith('.')) {
        note += '.';
      }
      s += ` ${note}`;
    }
    aspectSentences.push(s);
  }

  if (!hasAspectContent) {
    return '';
  }

  sentences.push(effectiveOpening);
  sentences.push(...aspectSentences);

  const effectiveClosing = (closing && closing.trim())
    ? closing.trim()
    : `Semoga ananda terus menumbuhkan potensi terbaik dan nilai-nilai kebaikan dalam keseharian di sekolah.`;
  sentences.push(effectiveClosing);

  return sentences.join(' ');
}

/**
 * Deterministically assemble Academic Comments narrative without AI.
 */
export function assembleDeterministicAcademicNarrative(params: {
  studentName: string;
  monthLabel: string;
  opening?: string;
  closing?: string;
  subjects: { id: string; name: string }[];
  subjectComments: Record<string, string>;
}): string {
  const { studentName, monthLabel, opening, closing, subjects, subjectComments } = params;

  const validEntries: { subjectName: string; text: string }[] = [];
  for (const sub of subjects) {
    const comment = (subjectComments[sub.id] || '').trim();
    if (comment) {
      validEntries.push({ subjectName: sub.name, text: comment });
    }
  }

  if (validEntries.length === 0) {
    return '';
  }

  const sentences: string[] = [];
  const effectiveOpening = (opening && opening.trim())
    ? opening.trim()
    : `Pada bulan ${monthLabel}, perkembangan capaian pembelajaran ananda ${studentName} adalah sebagai berikut:`;
  sentences.push(effectiveOpening);

  for (const item of validEntries) {
    let commentText = item.text;
    if (!commentText.endsWith('.')) {
      commentText += '.';
    }

    const lowerComment = commentText.toLowerCase();
    const lowerSub = item.subjectName.toLowerCase();
    if (lowerComment.startsWith(lowerSub) || lowerComment.startsWith(`pada mata pelajaran ${lowerSub}`)) {
      sentences.push(commentText);
    } else {
      sentences.push(`Pada mata pelajaran ${item.subjectName}, ${commentText}`);
    }
  }

  const effectiveClosing = (closing && closing.trim())
    ? closing.trim()
    : `Dukungan dan apresiasi berkelanjutan di rumah senantiasa menjadi penyemangat ananda untuk terus berkembang secara optimal.`;
  sentences.push(effectiveClosing);

  return sentences.join(' ');
}
