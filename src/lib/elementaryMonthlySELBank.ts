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

export const ELEMENTARY_LOWER_SEL_ASPECT_DEFINITIONS: Record<string, SELAspectDefinition> = Object.fromEntries([
  ['disiplin_diri', 'Disiplin Diri'], ['keterlibatan_sosial', 'Keterlibatan Sosial'],
  ['komunikasi', 'Komunikasi'], ['kerja_sama_tim', 'Kerja Sama Tim'],
  ['empati', 'Empati'], ['motivasi_diri', 'Motivasi Diri']
].map(([key, title]) => [key, { key, title, description: '', isBankConfigured: false, templates: [] }]));

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
    : '';

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
    : '';
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

import type { SELRubric, SELAchievement, ElementaryMonthlySelSource } from '../types/elementaryMonthlyReport';

export const SEL_LEVELS: SELAchievement[] = ['MB', 'SB', 'BSH', 'SAB'];
export const SEL_LABELS: Record<SELAchievement, string> = {
  MB: 'Masih Berkembang', SB: 'Sedang Berkembang',
  BSH: 'Berkembang Sesuai Harapan', SAB: 'Sangat Berkembang'
};
export function normalizeSELAchievement(value: unknown): SELAchievement | '' {
  const normalized = value === 'SD' ? 'SB' : value;
  return SEL_LEVELS.includes(normalized as SELAchievement) ? normalized as SELAchievement : '';
}
export function renderSELText(text: string, values: Record<string, string>): string {
  return text.replace(/\{(namaPanggilan|namaSiswa|bulan|kelas)\}/g, (_, key) => values[key] || '').trim();
}
export function selSourceFingerprint(source: ElementaryMonthlySelSource): string {
  // Canonical content signature, independent of object insertion order and final manual edits.
  return JSON.stringify([
    source.rubricId, source.rubricVersion, source.classId, source.academicYear, source.semester, source.month,
    source.opening || '', source.closing || '',
    ...Object.keys(source.aspects || {}).sort().map(key => {
      const a = source.aspects![key];
      return [key, normalizeSELAchievement(a.achievement), a.variantId || '', a.selectedText || '', a.teacherNote || ''];
    })
  ]);
}
export function createBlankSELRubric(context: Pick<SELRubric, 'academicYear' | 'semester' | 'month' | 'gradeLevel'>): SELRubric {
  return {
    ...context, id: '', version: 1, revision: 0, name: '', classIds: [], opening: '', closing: '',
    status: 'DRAFT', createdAt: 0, createdBy: '', updatedAt: 0, updatedBy: '',
    aspects: (ELEMENTARY_LOWER_SEL_GRADE_ASPECTS[context.gradeLevel] || []).map(key => ({
      key, title: ELEMENTARY_LOWER_SEL_ASPECT_DEFINITIONS[key].title,
      levels: Object.fromEntries(SEL_LEVELS.map(level => [level, [{ id: 'v1', text: '' }]])) as any
    }))
  };
}
export function validateSELRubric(rubric: SELRubric): string[] {
  const errors: string[] = [];
  if (!rubric.name.trim()) errors.push('Nama rubrik wajib diisi.');
  if (!rubric.classIds.length) errors.push('Pilih minimal satu kelas penerima.');
  if (!rubric.opening.trim() || !rubric.closing.trim()) errors.push('Pembuka dan penutup wajib diisi.');
  if (!rubric.aspects.length) errors.push('Minimal satu aspek wajib diisi.');
  if (new Set(rubric.aspects.map(a => a.key)).size !== rubric.aspects.length) errors.push('ID aspek ganda.');
  for (const aspect of rubric.aspects) {
    if (!aspect.title.trim()) errors.push('Nama aspek wajib diisi.');
    for (const level of SEL_LEVELS) {
      const variants = aspect.levels[level] || [];
      if (!variants.length || variants.some(v => !v.text.trim())) errors.push(`${aspect.title}: redaksi ${level} belum lengkap.`);
      if (new Set(variants.map(v => v.id)).size !== variants.length) errors.push(`${aspect.title}: ID varian ${level} ganda.`);
    }
  }
  const texts = [rubric.opening, rubric.closing, ...rubric.aspects.flatMap(a => SEL_LEVELS.flatMap(l => (a.levels[l] || []).map(v => v.text)))];
  if (texts.some(t => /\{[^{}]+\}/g.test(t.replace(/\{(namaPanggilan|namaSiswa|bulan|kelas)\}/g, '')))) errors.push('Placeholder tidak dikenal.');
  return errors;
}
export function validateSELSource(source: ElementaryMonthlySelSource | undefined, rubric: SELRubric | null): string[] {
  if (source?.schemaVersion !== 2) return []; // Legacy text is never reverse-inferred or force-migrated.
  if (!rubric || rubric.status !== 'APPLIED' || source.rubricId !== rubric.id || source.rubricVersion !== rubric.version) return ['ID/versi rubrik sumber tidak sesuai.'];
  const errors: string[] = [];
  if (!source.placeholders || ['namaSiswa','namaPanggilan','bulan','kelas'].some(k => typeof source.placeholders![k] !== 'string' || !source.placeholders![k].trim())) errors.push('Konteks placeholder siswa belum lengkap.');
  if (source.academicYear !== rubric.academicYear || source.semester !== rubric.semester || source.month !== rubric.month || !rubric.classIds.includes(source.classId || '')) errors.push('Konteks rubrik tidak sesuai.');
  if (source.opening !== rubric.opening || source.closing !== rubric.closing) errors.push('Pembuka/penutup sumber tidak sesuai rubrik.');
  if (Object.keys(source.aspects || {}).length !== rubric.aspects.length) errors.push('Jumlah aspek sumber tidak sesuai.');
  for (const aspect of rubric.aspects) {
    const selected = source.aspects?.[aspect.key];
    const level = normalizeSELAchievement(selected?.achievement);
    const variant = level && aspect.levels[level].find(v => v.id === selected?.variantId);
    if (!variant || !selected?.selectedText?.trim()) errors.push(`${aspect.title}: belum dinilai atau varian kosong.`);
    else if (selected.selectedText !== renderSELText(variant.text, source.placeholders || {})) errors.push(`${aspect.title}: snapshot redaksi tidak sesuai.`);
  }
  return errors;
}
export function assembleRubricSEL(source: ElementaryMonthlySelSource, rubric: SELRubric | null): string {
  if (validateSELSource(source, rubric).length || !rubric) return '';
  return [renderSELText(source.opening || '', source.placeholders || {}),
    ...rubric.aspects.flatMap(a => [source.aspects?.[a.key]?.selectedText || '', source.aspects?.[a.key]?.teacherNote?.trim() || '']),
    renderSELText(source.closing || '', source.placeholders || {})].filter(Boolean).join(' ');
}
