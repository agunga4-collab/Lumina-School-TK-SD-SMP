import express from 'express';
import { createHash } from 'node:crypto';
import {
  authenticateMonthlyPhotoRequest, authorizeMonthlyPhotoScope, getMonthlyPhotoDb,
  type MonthlyPhotoActor
} from './elementaryMonthlyDrivePhoto.server';
import { PhotoHttpError, validatePhotoPeriod, normalizedPhotoYear, requireDocumentId, photoDocumentId, stablePhotoJson } from './elementaryMonthlyPhotoValidation.server';
import { assembleRubricSEL, validateSELRubric, validateSELSource, selSourceFingerprint } from '../src/lib/elementaryMonthlySELBank';
import type { SELRubric, ElementaryMonthlyStudentNarrativeDoc, ElementaryMonthlySelSource } from '../src/types/elementaryMonthlyReport';

const RUBRICS = 'elem_monthly_sel_rubrics';
const BINDINGS = 'elem_monthly_sel_bindings';
const NARRATIVES = 'elem_monthly_student_narratives';
const fail = (status: number, code: string, text: string, details = {}) => { throw new PhotoHttpError(status, code, text, details); };
const hash = (value: unknown) => createHash('sha256').update(stablePhotoJson(value)).digest('hex');
const data = (snapshot: any) => snapshot.exists ? snapshot.data() : null;
export function canManageSELRubrics(actor: MonthlyPhotoActor): boolean {
  const p = actor.profile;
  if (p?.status !== 'active') return false;
  if (p.role === 'SUPER_ADMIN' || ['agunga4@gmail.com', 'agunga4@lazuardi.sch.id'].includes((actor.email || '').toLowerCase())) return true;
  const units = [p.unitId, p.unit, ...(p.assignedUnits || [])].filter(Boolean);
  return ['HEAD_UNIT', 'PRINCIPAL'].includes(p.role) && (!units.length || units.some(u => ['ELEMENTARY', 'ALL'].includes(u)));
}
/** Monthly narrative approval is separate from rubric administration. */
export function canReviewMonthlySELNarratives(actor: MonthlyPhotoActor): boolean {
  const p = actor.profile || {};
  if (!actor.uid || p.status !== 'active' || String(p.role || '').trim().toUpperCase() !== 'HEAD_UNIT') return false;
  const units = [p.unitId, p.unit, ...(Array.isArray(p.assignedUnits) ? p.assignedUnits : [])]
    .filter(value => typeof value === 'string')
    .map(value => value.trim().toUpperCase());
  return units.includes('ELEMENTARY') || units.includes('ALL');
}
export function selBindingId(input: any): string {
  return hash([input.classId, normalizedPhotoYear(input.academicYear), String(input.semester), input.month]);
}
export interface SELDependencies {
  getDb(): any;
  authorize(actor: MonthlyPhotoActor, input: any, options: { write: boolean; studentRequired: boolean }): Promise<any>;
  now?: () => number;
}
export function createElementaryMonthlySELService(deps: SELDependencies) {
  const db = deps.getDb;
  const now = deps.now || Date.now;
  const ref = (collection: string, id: string) => db().collection(collection).doc(id);
  function admin(actor: MonthlyPhotoActor) { if (!canManageSELRubrics(actor)) fail(403, 'SEL_ADMIN_REQUIRED', 'Hanya Super Admin atau pimpinan Elementary yang berwenang mengelola rubrik.'); }
  async function scope(actor: MonthlyPhotoActor, input: any, studentRequired = false) {
    const result = await deps.authorize(actor, input, { write: true, studentRequired });
    if (![1, 2, 3].includes(result.gradeLevel)) fail(403, 'SEL_LOWER_ONLY', 'Rubrik ini khusus Elementary kelas 1–3.');
    return result;
  }
  async function context(actor: MonthlyPhotoActor, input: any) {
    const allowed = await scope(actor, input);
    const binding = data(await ref(BINDINGS, selBindingId(input)).get());
    const rubric = binding ? data(await ref(RUBRICS, binding.rubricId).get()) : null;
    let pinnedRubric = null;
    if (input.rubricId) {
      const pinned = data(await ref(RUBRICS, requireDocumentId(input.rubricId, 'Rubrik')).get());
      if (pinned?.status === 'APPLIED' && pinned.classIds.includes(input.classId) && pinned.academicYear === input.academicYear && pinned.semester === input.semester && pinned.month === input.month) pinnedRubric = pinned;
    }
    return { rubric, pinnedRubric, binding, canManage: canManageSELRubrics(actor), gradeLevel: allowed.gradeLevel };
  }
  async function list(actor: MonthlyPhotoActor, input: any) {
    admin(actor);
    const period = validatePhotoPeriod(input);
    const classesSnap = await db().collection('classes').where('unitId', '==', 'ELEMENTARY').get();
    const classes = classesSnap.docs.map((d: any) => ({ ...d.data(), id: d.id })).filter((c: any) => {
      try { return c.status === 'active' && normalizedPhotoYear(c.academicYear) === period.normalizedYear && Number(c.grade || c.gradeLevel) === Number(input.gradeLevel); }
      catch { return false; }
    });
    const templates = await db().collection(RUBRICS).where('academicYear', '==', input.academicYear).get();
    return { classes: classes.map((c: any) => ({ id: c.id, name: c.name })), rubrics: templates.docs.map((d: any) => d.data()).filter((r: any) => r.semester === input.semester && r.month === input.month && r.gradeLevel === Number(input.gradeLevel)) };
  }
  function cleanRubric(raw: any): SELRubric {
    validatePhotoPeriod(raw);
    if (![1, 2, 3].includes(raw.gradeLevel)) fail(400, 'SEL_INVALID_GRADE', 'Tingkat harus 1, 2, atau 3.');
    const text = (v: any, max = 10000) => { if (typeof v !== 'string' || v.length > max) fail(400, 'SEL_INVALID_TEXT', 'Teks rubrik tidak valid atau terlalu panjang.'); return v; };
    if (!Array.isArray(raw.classIds) || raw.classIds.length > 100 || new Set(raw.classIds).size !== raw.classIds.length) fail(400, 'SEL_INVALID_CLASSES', 'Pilih maksimal 100 kelas unik.');
    if (!Array.isArray(raw.aspects) || raw.aspects.length > 30) fail(400, 'SEL_INVALID_ASPECTS', 'Maksimal 30 aspek.');
    const aspects = raw.aspects.map((a: any) => ({ key: requireDocumentId(a.key, 'ID aspek'), title: text(a.title, 200), levels: Object.fromEntries(['MB', 'SB', 'BSH', 'SAB'].map(level => {
      if (!Array.isArray(a.levels?.[level]) || a.levels[level].length > 20) fail(400, 'SEL_INVALID_VARIANTS', 'Varian redaksi tidak valid (maksimal 20 per capaian).');
      return [level, a.levels[level].map((v: any) => ({ id: requireDocumentId(v.id, 'ID varian'), text: text(v.text) }))];
    })) }));
    return { id: requireDocumentId(raw.id, 'ID rubrik'), version: 1, revision: 0,
      ...(raw.previousId ? { previousId: requireDocumentId(raw.previousId, 'ID versi asal') } : {}),
      name: text(raw.name, 200), academicYear: raw.academicYear, semester: String(raw.semester), month: raw.month,
      gradeLevel: raw.gradeLevel, classIds: raw.classIds.map((id: any) => requireDocumentId(id, 'Kelas')),
      opening: text(raw.opening), closing: text(raw.closing), aspects: aspects as any,
      status: 'DRAFT', createdAt: 0, createdBy: '', updatedAt: 0, updatedBy: '' };
  }
  async function saveRubric(actor: MonthlyPhotoActor, input: any) {
    admin(actor);
    const clean = cleanRubric(input.rubric);
    if (Buffer.byteLength(JSON.stringify(clean)) > 750000) fail(400, 'SEL_RUBRIC_TOO_LARGE', 'Definisi rubrik terlalu besar (maksimal 750 KB).');
    for (const classId of clean.classIds) {
      const c = await scope(actor, { ...clean, classId });
      if (c.gradeLevel !== clean.gradeLevel) fail(400, 'SEL_CLASS_GRADE', 'Kelas penerima tidak sesuai tingkat rubrik.');
    }
    return db().runTransaction(async (tx: any) => {
      const r = ref(RUBRICS, clean.id);
      const old = data(await tx.get(r));
      const previous = clean.previousId ? data(await tx.get(ref(RUBRICS, clean.previousId))) : null;
      const fingerprint = hash(clean);
      if (old?.draftFingerprint === fingerprint) return { rubric: old };
      if (old?.status === 'APPLIED') fail(409, 'SEL_IMMUTABLE', 'Rubrik yang telah diterapkan tidak dapat diubah. Buat versi baru sebagai draf.'); // Lost response / identical retry.
      if ((old?.revision || 0) !== input.expectedRevision) fail(409, 'SEL_DRAFT_CONFLICT', 'Draf rubrik berubah di sesi lain. Muat ulang sebelum menyimpan.');
      if (clean.previousId && !previous) fail(404, 'SEL_PREVIOUS_NOT_FOUND', 'Versi asal tidak ditemukan.');
      const rubric = { ...clean, version: previous ? previous.version + 1 : 1,
        revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || now(), createdBy: old?.createdBy || actor.uid,
        updatedAt: now(), updatedBy: actor.uid, draftFingerprint: fingerprint };
      tx.set(r, rubric);
      return { rubric };
    });
  }
  async function applyRubric(actor: MonthlyPhotoActor, input: any) {
    admin(actor);
    const r = ref(RUBRICS, requireDocumentId(input.rubricId, 'Rubrik'));
    return db().runTransaction(async (tx: any) => {
      const rubric = data(await tx.get(r)) as SELRubric;
      if (!rubric) fail(404, 'SEL_NOT_FOUND', 'Rubrik tidak ditemukan.');
      const errors = validateSELRubric(rubric);
      if (errors.length) fail(400, 'SEL_INCOMPLETE', errors.join('\n'));
      const bindingRefs = rubric.classIds.map(classId => ref(BINDINGS, selBindingId({ ...rubric, classId })));
      const bindings = await Promise.all(bindingRefs.map(r => tx.get(r).then(data)));
      // Re-read class definitions in this transaction; a concurrent archive/grade change aborts/retries.
      const classes = await Promise.all(rubric.classIds.map(id => tx.get(ref('classes', id)).then(data)));
      classes.forEach((c, i) => {
        if (!c || c.status !== 'active' || c.unitId !== 'ELEMENTARY' || normalizedPhotoYear(c.academicYear) !== normalizedPhotoYear(rubric.academicYear) || Number(c.grade || c.gradeLevel) !== rubric.gradeLevel) fail(409, 'SEL_CLASS_CHANGED', `Kelas ${rubric.classIds[i]} tidak lagi sesuai. Tidak ada kelas yang diubah.`);
      });
      if (rubric.status === 'APPLIED') {
        // Never reactivate an old rubric over a newer one when retrying a completed request.
        return { results: bindings.map((b, i) => ({ classId: rubric.classIds[i], status: b?.rubricId === rubric.id ? 'APPLIED' : 'SUPERSEDED', rubricId: b?.rubricId || '' })) };
      }
      if (rubric.revision !== input.expectedRevision) fail(409, 'SEL_DRAFT_CONFLICT', 'Draf berubah. Simpan/muat ulang sebelum menerapkan.');
      const conflicts = bindings.flatMap((b, i) => b && b.rubricId !== rubric.id ? [{ classId: rubric.classIds[i], rubricId: b.rubricId, version: b.version, revision: b.revision }] : []);
      if (conflicts.length && (!input.confirmReplacement || stablePhotoJson(input.conflicts) !== stablePhotoJson(conflicts))) fail(409, 'SEL_BINDING_CONFLICT', 'Kelas berikut sudah memiliki rubrik aktif. Periksa dan konfirmasi penggantian. Belum ada kelas yang diubah.', { conflicts });
      const timestamp = now();
      bindings.forEach((b, i) => tx.set(bindingRefs[i], {
        classId: rubric.classIds[i], academicYear: rubric.academicYear, semester: rubric.semester, month: rubric.month,
        rubricId: rubric.id, version: rubric.version, revision: (b?.revision || 0) + 1, updatedBy: actor.uid, updatedAt: timestamp
      }));
      tx.update(r, { status: 'APPLIED', appliedAt: timestamp, appliedBy: actor.uid });
      return { results: rubric.classIds.map(classId => ({ classId, status: 'APPLIED', rubricId: rubric.id })) };
    });
  }
  async function narrative(actor: MonthlyPhotoActor, input: any) {
    const allowed = await scope(actor, input, true);
    const id = photoDocumentId(input);
    return db().runTransaction(async (tx: any) => {
      const r = ref(NARRATIVES, id);
      const old = data(await tx.get(r));
      const scoreDoc = data(await tx.get(ref('elem_monthly_student_scores', id)));
      const scoresHash = Object.entries(scoreDoc?.scores || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}:${v}`).join('|');
      const action = input.action;
      const incoming = input.narrativeDoc || {};
      const source: ElementaryMonthlySelSource | undefined = action === 'save' ? incoming.selSource ?? old?.selSource : old?.selSource;
      const rubric = source?.schemaVersion === 2 && source.rubricId ? data(await tx.get(ref(RUBRICS, requireDocumentId(source.rubricId, 'Rubrik')))) : null;
      if (!['save', 'submit', 'approve', 'revision', 'unlock'].includes(action)) fail(400, 'SEL_INVALID_ACTION', 'Aksi narasi tidak valid.');
      if (action !== 'save' && !old) fail(404, 'SEL_NARRATIVE_MISSING', 'Simpan draf sebelum mengajukan.');
      if (action === 'save') {
        if (old && ['SUBMITTED', 'APPROVED'].includes(old.reviewStatus)) fail(409, 'SEL_LOCKED', 'Buka kunci narasi sebelum mengubah isi.');
        const payload = { academicComment: String(incoming.academicComment ?? old?.academicComment ?? ''), selProfile: String(incoming.selProfile ?? old?.selProfile ?? ''),
          ...(incoming.academicSource !== undefined ? { academicSource: incoming.academicSource } : old?.academicSource ? { academicSource: old.academicSource } : {}),
          ...(source ? { selSource: source } : {}) };
        const fingerprint = hash(payload);
        if (old?.contentFingerprint === fingerprint) return { narrativeDoc: old }; // Same save after lost response is harmless.
        if ((old?.revision || 0) !== input.expectedRevision) fail(409, 'SEL_NARRATIVE_CONFLICT', 'Narasi berubah di sesi lain. Draf Anda dipertahankan; muat ulang dan bandingkan sebelum menyimpan ulang.');
        if (old?.selSource?.schemaVersion === 2 && source?.schemaVersion !== 2) fail(400, 'SEL_SOURCE_REMOVAL', 'Sumber rubrik siswa tidak boleh dihapus untuk melewati validasi.');
        if (JSON.stringify(payload).length > 200000) fail(400, 'SEL_NARRATIVE_TOO_LARGE', 'Isian narasi terlalu panjang.');
        if (source?.schemaVersion === 2) {
          if (!rubric || rubric.status !== 'APPLIED' || source.rubricVersion !== rubric.version || source.classId !== input.classId || source.academicYear !== input.academicYear || source.semester !== input.semester || source.month !== input.month || !rubric.classIds.includes(input.classId) || rubric.month !== input.month || rubric.academicYear !== input.academicYear || rubric.semester !== input.semester) fail(400, 'SEL_SOURCE_SCOPE', 'Rubrik dan konteks siswa tidak sesuai.');
          // A newly selected rubric must be active; existing students retain their pinned immutable version.
          const binding = data(await tx.get(ref(BINDINGS, selBindingId(input))));
          if (old?.selSource?.rubricId !== source.rubricId && binding?.rubricId !== source.rubricId) fail(409, 'SEL_NOT_ACTIVE', 'Rubrik pilihan tidak lagi aktif. Muat ulang pengaturan.');
          const student = allowed.studentData;
          const expected = { namaSiswa: allowed.studentName, namaPanggilan: String(student.nickname || student.nickName || allowed.studentName), bulan: monthLabel(input.month), kelas: allowed.className };
          if (stablePhotoJson(source.placeholders) !== stablePhotoJson(expected) && !(old?.selSource?.schemaVersion === 2 && old.selSource.placeholders && stablePhotoJson(source.placeholders) === stablePhotoJson(old.selSource.placeholders))) fail(409, 'SEL_PLACEHOLDER_CONTEXT', 'Nama siswa, kelas, atau bulan berubah. Pilih ulang rubrik untuk memperbarui konteks.');
        }
        const result = { ...(old || {}), ...payload, id, studentId: input.studentId, studentName: allowed.studentName,
          classId: input.classId, academicYear: input.academicYear, semester: input.semester, month: input.month,
          revision: (old?.revision || 0) + 1, reviewStatus: old?.reviewStatus || 'DRAFT', contentFingerprint: fingerprint,
          createdAt: old?.createdAt || now(), createdBy: old?.createdBy || actor.uid, updatedAt: now(), updatedBy: actor.uid, updatedByName: actor.name };
        tx.set(r, result);
        return { narrativeDoc: result };
      }
      if (action === 'approve' || action === 'revision') {
        if (!canReviewMonthlySELNarratives(actor)) fail(403, 'SEL_REVIEWER_REQUIRED', 'Hanya Kepala Unit Elementary yang berwenang meninjau narasi Monthly.');
        if (old.reviewStatus !== 'SUBMITTED') fail(409, 'SEL_REVIEW_STATE', 'Hanya narasi yang diajukan yang dapat ditinjau.');
      }
      if (action === 'unlock') {
        if (old.reviewStatus === 'APPROVED' && !canReviewMonthlySELNarratives(actor)) fail(403, 'SEL_REVIEWER_REQUIRED', 'Hanya Kepala Unit Elementary yang berwenang membuka kembali narasi yang disetujui.');
        if (!['SUBMITTED', 'APPROVED'].includes(old.reviewStatus)) fail(409, 'SEL_UNLOCK_STATE', 'Narasi sudah terbuka.');
      }
      if (action === 'submit') {
        if (!['DRAFT', 'NEEDS_REVISION'].includes(old.reviewStatus)) fail(409, 'SEL_SUBMIT_STATE', 'Narasi sudah diajukan atau disetujui.');
      }
      if (action === 'submit' || action === 'approve') {
        const errors = validateNarrativeForSELReview(old, rubric);
        if (errors.length) fail(400, 'SEL_REVIEW_INCOMPLETE', errors.join('\n'));
        if (action === 'approve' && (old.lastScoresHash !== scoresHash || old.isSourceStale)) fail(409, 'SEL_SCORES_CHANGED', 'Nilai berubah setelah pengajuan. Buka kunci dan ajukan ulang.');
      }
      if (action === 'revision' && !String(input.reviewNotes || '').trim()) fail(400, 'SEL_REVIEW_NOTE', 'Catatan revisi wajib diisi.');
      const patch: any = { revision: (old.revision || 0) + 1, updatedAt: now(), updatedBy: actor.uid, updatedByName: actor.name };
      if (action === 'submit') Object.assign(patch, { reviewStatus: 'SUBMITTED', submittedAt: now(), submittedBy: actor.uid, submittedByName: actor.name, lastScoresHash: scoresHash, isSourceStale: false });
      if (action === 'unlock') Object.assign(patch, { reviewStatus: 'DRAFT', reviewedAt: null, reviewedBy: null, reviewedByName: null, reviewedRole: null, lastScoresHash: '', isSourceStale: false });
      if (action === 'approve' || action === 'revision') Object.assign(patch, { reviewStatus: action === 'approve' ? 'APPROVED' : 'NEEDS_REVISION', reviewNotes: String(input.reviewNotes || '').trim(), reviewedAt: now(), reviewedBy: actor.uid, reviewedByName: actor.name, reviewedRole: actor.profile.role });
      tx.update(r, patch);
      return { narrativeDoc: { ...old, ...patch } };
    });
  }
  return { context, list, saveRubric, applyRubric, narrative };
}
export function monthLabel(month: string) {
  const names = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${names[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
}
export function validateNarrativeForSELReview(document: ElementaryMonthlyStudentNarrativeDoc, rubric: SELRubric | null): string[] {
  const errors = [];
  if ((document.academicComment || '').trim().length < 15 || (document.selProfile || '').trim().length < 15) errors.push('Kedua narasi final wajib minimal 15 karakter.');
  const source = document.selSource;
  if (source?.schemaVersion === 2) {
    errors.push(...validateSELSource(source, rubric));
    if (source.assembledFingerprint !== selSourceFingerprint(source) || !source.lastAssembledText || source.lastAssembledText !== assembleRubricSEL(source, rubric)) errors.push('Sumber berubah atau belum disusun. Susun Narasi SEL kembali sebelum mengajukan.');
  }
  return errors;
}
const service = createElementaryMonthlySELService({ getDb: getMonthlyPhotoDb, authorize: authorizeMonthlyPhotoScope });
export const elementaryMonthlySELRouter = express.Router();
for (const action of ['context', 'list', 'saveRubric', 'applyRubric', 'narrative'] as const) {
  elementaryMonthlySELRouter.post(`/${action}`, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const actor = await authenticateMonthlyPhotoRequest(req);
      res.json({ success: true, ...await service[action](actor, req.body || {}) });
    } catch (error) {
      if (error instanceof PhotoHttpError) res.status(error.status).json({ success: false, code: error.code, error: error.message, ...error.details });
      else res.status(503).json({ success: false, code: 'SEL_STORAGE_UNAVAILABLE', error: 'Penyimpanan belum terkonfirmasi. Draf tetap dipertahankan; coba lagi dengan isian yang sama.' });
    }
  });
}
