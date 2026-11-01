import express, { Request, Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  authenticateMonthlyPhotoRequest,
  canManageMonthlyPhotoClass,
  getAuthorizedMonthlyPhotoFile,
  getGoogleDriveClient,
  getMonthlyPhotoDb,
  PhotoHttpError,
} from './elementaryMonthlyDrivePhoto.server';
import {
  buildElementaryMonthlyReportSnapshot,
  buildElementaryMonthlyAttendanceSummary,
  resolveElementaryMonthlyTeacherId,
  resolveElementaryMonthlySignatory,
  resolveElementaryMonthlyLogo,
} from '../src/lib/elementaryMonthlyReportModel';
import {
  validateElementaryMonthlyPublishEligibility,
  type ElementaryMonthlyReportSnapshot,
  type PublishedElementaryMonthlyReportDoc,
} from '../src/types/elementaryMonthlyReport';

/** Reports and photos intentionally have different roots. Never move photo assets here. */
export const ELEMENTARY_MONTHLY_REPORTS_ROOT_ID = '17nW4LvLZ5t4SPHA50RIvRTsqebzv0s0R';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const JOBS = 'elem_monthly_publication_jobs';
const STATES = 'elem_monthly_publication_states';
const FOLDERS = 'elem_monthly_report_folder_reservations';
const REPORTS = 'elem_monthly_published_reports';
const LEASE_MS = 5 * 60 * 1000;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const DRIVE_FIELDS = 'id,name,mimeType,parents,trashed,size,md5Checksum,sha256Checksum,appProperties,webViewLink';

type Json = Record<string, any>;
export interface MonthlyPublicationScope {
  classId: string;
  studentId: string;
  academicYear: string;
  semester: string;
  month: string;
}
export interface MonthlyPublicationActor { uid: string; email?: string; profile: Json }
export interface MonthlyPublicationDependencies {
  db: Firestore;
  drive: ReturnType<typeof getGoogleDriveClient>;
  now?: () => number;
}
type JobStatus = 'PREPARED' | 'UPLOADING' | 'UPLOADED' | 'RECOVERABLE' | 'PUBLISHED' | 'SUPERSEDED';
interface PublicationJob extends MonthlyPublicationScope {
  id: string;
  reportId: string;
  status: JobStatus;
  version: number;
  reportSnapshot: ElementaryMonthlyReportSnapshot;
  snapshotFingerprint: string;
  driveFileId: string;
  driveFolderId?: string;
  driveFileUrl?: string;
  fileName: string;
  actorUid: string;
  actorName: string;
  preparedAt: number;
  updatedAt: number;
  uploadValidatedAt?: number;
  uploadAttemptedAt?: number;
  uploadedAt?: number;
  publishedAt?: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number;
  pdfSha256?: string;
  pdfMd5?: string;
  byteSize?: number;
  lastErrorCode?: string | null;
}

export class MonthlyPublicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
    public readonly operationId?: string,
    public readonly partialUpload = false,
    public readonly retryable = false,
  ) { super(message); this.name = 'MonthlyPublicationError'; }
}

function fail(code: string, message: string, status = 400): never {
  throw new MonthlyPublicationError(code, message, status);
}
function now(deps: MonthlyPublicationDependencies) { return (deps.now || Date.now)(); }
function hash(value: string | Buffer, algorithm = 'sha256') {
  return createHash(algorithm).update(value).digest('hex');
}
export function stableMonthlyJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(v => stableMonthlyJson(v ?? null)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableMonthlyJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
function plain<T>(value: T): T { return JSON.parse(stableMonthlyJson(value)); }
function textValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function requireId(value: unknown, label: string): string {
  const result = textValue(value);
  if (!result || result.length > 300 || /[\/\u0000-\u001f]/.test(result)) {
    fail('INVALID_CONTEXT', `${label} tidak valid.`);
  }
  return result;
}
export function parseMonthlyPublicationScope(input: Json): MonthlyPublicationScope {
  const academicYear = textValue(input.academicYear);
  const semester = textValue(input.semester);
  const month = textValue(input.month);
  const yearParts = academicYear.match(/^(\d{4})[\/_-](\d{4})$/);
  if (!yearParts || Number(yearParts[2]) !== Number(yearParts[1]) + 1) {
    fail('INVALID_CONTEXT', 'Tahun ajaran harus memuat dua tahun berurutan.');
  }
  if (!['1', '2'].includes(semester) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    fail('INVALID_CONTEXT', 'Semester atau bulan rapor tidak valid.');
  }
  const [monthYear, monthNumber] = month.split('-').map(Number);
  if ((semester === '1' && (monthYear !== Number(yearParts[1]) || monthNumber < 7)) ||
      (semester === '2' && (monthYear !== Number(yearParts[2]) || monthNumber > 6))) {
    fail('INVALID_CONTEXT', 'Bulan rapor tidak berada dalam semester dan tahun ajaran yang dipilih.');
  }
  return {
    classId: requireId(input.classId, 'Kelas'), studentId: requireId(input.studentId, 'Siswa'),
    academicYear, semester, month,
  };
}
function ids(scope: MonthlyPublicationScope) {
  const period = `${scope.classId}_${scope.academicYear.replace(/\//g, '_')}_S${scope.semester}_M${scope.month}`;
  return { period, studentPeriod: `${scope.studentId}_${period}`,
    report: `${scope.academicYear.replace(/\//g, '_')}_S${scope.semester}_M${scope.month}_${scope.classId}_${scope.studentId}` };
}
function yearEqual(a: unknown, b: string) {
  return textValue(a).replace(/[\/_]/g, '-') === b.replace(/[\/_]/g, '-');
}
export function canManageMonthlyClass(actor: MonthlyPublicationActor, cls: Json): boolean {
  return canManageMonthlyPhotoClass(actor, cls);
}
async function requireClassAccess(deps: MonthlyPublicationDependencies, actor: MonthlyPublicationActor, scope: MonthlyPublicationScope): Promise<Json> {
  const classSnap = await deps.db.collection('classes').doc(scope.classId).get();
  const cls = classSnap.data();
  if (!cls || !canManageMonthlyClass(actor, cls)) fail('FORBIDDEN', 'Akses publikasi untuk kelas ini tidak diizinkan.', 403);
  const rawGrade = typeof cls.grade === 'number' ? cls.grade : /^\d+$/.test(textValue(cls.grade)) ? Number(cls.grade) : null;
  const legacyMatch = textValue(cls.name).match(/^(?:(?:grade|class|kelas)\s*[:.-]?\s*)?([1-6])(?:\s|[-–—.]|[a-z]\b|$)/i);
  const grade = rawGrade ?? (legacyMatch ? Number(legacyMatch[1]) : null);
  if (!Number.isInteger(grade) || ![1, 2, 3].includes(grade!)) {
    fail('INVALID_GRADE', 'Kelas harus memiliki grade yang valid untuk Monthly Report Elementary Lower Grade 1–3.');
  }
  return { ...cls, id: scope.classId, gradeLevel: grade };
}
function teacherIdForClass(cls: Json): string {
  let id: string;
  try { id = resolveElementaryMonthlyTeacherId(cls); }
  catch { fail('AMBIGUOUS_HOMEROOM', 'Penugasan wali kelas belum tunggal/utama. Perbaiki profil kelas terlebih dahulu.'); }
  if (!id) fail('MISSING_HOMEROOM', 'Identitas wali kelas belum terdaftar pada penugasan kelas.');
  return id;
}
export const monthlyAttendanceSummary = buildElementaryMonthlyAttendanceSummary;
async function loadAuthoritativeSnapshot(deps: MonthlyPublicationDependencies, actor: MonthlyPublicationActor, scope: MonthlyPublicationScope) {
  const cls = await requireClassAccess(deps, actor, scope);
  if (cls.status === 'archived' || !yearEqual(cls.academicYear, scope.academicYear)) {
    fail('INVALID_CLASS', 'Kelas tidak aktif atau tahun ajaran kelas tidak sesuai.');
  }
  const context = ids(scope);
  const paths = [
    ['students', scope.studentId], ['elem_monthly_curriculum', context.period], ['elem_monthly_student_scores', context.studentPeriod],
    ['elem_monthly_project_docs', context.period], ['elem_monthly_student_photos', context.studentPeriod],
    ['elem_monthly_student_narratives', context.studentPeriod], ['elem_monthly_attendance_configs', context.period],
    ['reportConfig', 'ELEMENTARY'], ['settings', 'logos'],
  ];
  const docs = await deps.db.getAll(...paths.map(([collection, id]) => deps.db.collection(collection).doc(id)));
  const [student, curriculumDoc, studentScoreDoc, projectDoc, photoDoc, narrativeDoc, attendanceConfig, reportConfig, logos] = docs.map(s => s.exists ? s.data()! : null);
  if (!student) fail('MISSING_STUDENT', 'Profil siswa tidak ditemukan.');
  const enrollments = await deps.db.collection('enrollments').where('studentId', '==', scope.studentId).get();
  const enrolled = enrollments.docs.some(s => {
    const e = s.data();
    return [scope.classId, cls.name].includes(e.classId) && yearEqual(e.academicYear, scope.academicYear) && !['inactive', 'archived', 'withdrawn'].includes(e.status);
  });
  if (!enrolled) fail('STUDENT_CLASS_MISMATCH', 'Siswa tidak tercatat dalam enrollment kelas dan tahun ajaran yang dipilih.');
  for (const d of [curriculumDoc, studentScoreDoc, projectDoc, photoDoc, narrativeDoc, attendanceConfig]) {
    if (d && (d.classId !== scope.classId || !yearEqual(d.academicYear, scope.academicYear) || String(d.semester) !== scope.semester || d.month !== scope.month)) {
      fail('SOURCE_CONTEXT_MISMATCH', 'Konteks salah satu data rapor berbeda dari kelas/periode yang diminta.');
    }
  }
  for (const d of [studentScoreDoc, photoDoc, narrativeDoc]) {
    if (d && d.studentId !== scope.studentId) fail('SOURCE_CONTEXT_MISMATCH', 'Data rapor tidak sesuai dengan siswa.');
  }
  const teacherId = teacherIdForClass(cls);
  const teacherDoc = await deps.db.collection('users').doc(teacherId).get();
  const teacher = teacherDoc.data();
  if (!teacher) fail('MISSING_TEACHER_PROFILE', 'Profil pengguna wali kelas yang ditugaskan tidak ditemukan.');
  const signatory = resolveElementaryMonthlySignatory({ classData: cls,
    teacherProfile: teacher, reportConfig, attendanceConfig: attendanceConfig as any });
  const logoUrl = resolveElementaryMonthlyLogo(logos);
  const attendanceSummary = buildElementaryMonthlyAttendanceSummary(attendanceConfig as any, scope.studentId);
  const validation = validateElementaryMonthlyPublishEligibility({ student: { id: scope.studentId, name: student.name || student.fullName || '', photoUrl: student.photoUrl },
    curriculumDoc: curriculumDoc as any, studentScoreDoc: studentScoreDoc as any, projectDoc: projectDoc as any,
    photoDoc: photoDoc as any, narrativeDoc: narrativeDoc as any, attendanceSummary, signatory, logoUrl });
  if (!validation.isEligible) fail('VALIDATION_FAILED', `Publikasi diblokir: ${validation.blockingReasons.join(' ')}`);
  const snapshot = buildElementaryMonthlyReportSnapshot({
    student: { ...student, id: scope.studentId, name: student.name || student.fullName || '' },
    classId: scope.classId, className: cls.name, gradeLevel: cls.gradeLevel, academicYear: scope.academicYear,
    semester: scope.semester, month: scope.month, curriculumDoc: curriculumDoc as any, studentScoreDoc: studentScoreDoc as any,
    projectDoc: projectDoc as any, photoDoc: photoDoc as any, narrativeDoc: narrativeDoc as any, attendanceSummary, signatory, logoUrl,
  });
  const clean = plain(snapshot);
  if (Buffer.byteLength(stableMonthlyJson(clean), 'utf8') > 800_000) {
    fail('SNAPSHOT_TOO_LARGE', 'Snapshot rapor terlalu besar untuk Firestore. Kecilkan ukuran gambar logo/tanda tangan pada konfigurasi, lalu coba lagi.');
  }
  return clean;
}

function makeFileName(snapshot: ElementaryMonthlyReportSnapshot, studentId: string, version: number) {
  const clean = (s: string) => s.replace(/[\u0000-\u001f/\\:*?"<>|]/g, '').trim();
  return `${clean(snapshot.student.name).slice(0,90)} - ${clean(studentId).slice(0,40)} - Monthly Report ${snapshot.month} - ${clean(snapshot.academicYear.replace(/[\/_]/g, '-'))} - v${version}.pdf`;
}
function responseFor(job: PublicationJob, publishedReport?: PublishedElementaryMonthlyReportDoc, currentTime = Date.now()) {
  const status = job.status === 'UPLOADING' && (!job.leaseOwner || (job.leaseExpiresAt || 0) <= currentTime) ? 'RECOVERABLE' : job.status;
  return { success: true, operationId: job.id, status, version: job.version, leaseExpiresAt: job.leaseExpiresAt || null,
    reportSnapshot: job.reportSnapshot, driveFileId: job.driveFileId, driveFolderId: job.driveFolderId || null,
    fileName: job.fileName, partialUpload: job.status === 'UPLOADED', ...(publishedReport ? { publishedReport } : {}) };
}
async function getJob(deps: MonthlyPublicationDependencies, operationId: string): Promise<PublicationJob> {
  const job = await deps.db.collection(JOBS).doc(requireId(operationId, 'ID publikasi')).get();
  if (!job.exists) fail('OPERATION_NOT_FOUND', 'Operasi publikasi tidak ditemukan.', 404);
  return job.data() as PublicationJob;
}
async function publishedVersion(deps: MonthlyPublicationDependencies, job: PublicationJob) {
  const ref = deps.db.collection(REPORTS).doc(job.reportId);
  const latest = await ref.get();
  if (latest.exists && latest.data()?.publicationId === job.id) return latest.data() as PublishedElementaryMonthlyReportDoc;
  const version = await ref.collection('versions').doc(String(job.version)).get();
  if (version.exists) return version.data() as PublishedElementaryMonthlyReportDoc;
  fail('METADATA_INCONSISTENT', 'Status publikasi selesai tetapi metadata versi tidak tersedia.', 503);
}

export async function prepareMonthlyPublication(deps: MonthlyPublicationDependencies, actor: MonthlyPublicationActor, scope: MonthlyPublicationScope) {
  await requireClassAccess(deps, actor, scope);
  const context = ids(scope);
  const stateRef = deps.db.collection(STATES).doc(context.report);
  const state = await stateRef.get();
  if (state.data()?.pendingOperationId) {
    const pending = await getJob(deps, state.data()!.pendingOperationId);
    return responseFor(pending, pending.status === 'PUBLISHED' ? await publishedVersion(deps, pending) : undefined, now(deps));
  }
  const snapshot = await loadAuthoritativeSnapshot(deps, actor, scope);
  const snapshotFingerprint = hash(stableMonthlyJson(snapshot));
  const operationId = randomUUID();
  // Reserve an ID before saving a job. No file or folder is created by generateIds.
  const generated = await deps.drive.files.generateIds({ count: 1, space: 'drive', type: 'files' });
  const fileId = generated.data.ids?.[0];
  if (!fileId) fail('DRIVE_ID_FAILED', 'Drive tidak mengembalikan ID berkas untuk publikasi.', 503);
  const jobRef = deps.db.collection(JOBS).doc(operationId);
  const latestRef = deps.db.collection(REPORTS).doc(context.report);
  const result = await deps.db.runTransaction(async tx => {
    const [stateSnap, latestSnap] = await Promise.all([tx.get(stateRef), tx.get(latestRef)]);
    const stateData = stateSnap.data() || {};
    if (stateData.pendingOperationId) {
      const pending = await tx.get(deps.db.collection(JOBS).doc(stateData.pendingOperationId));
      if (!pending.exists) fail('METADATA_INCONSISTENT', 'Reservasi publikasi tidak memiliki operasi yang sesuai.', 503);
      return { job: pending.data() as PublicationJob };
    }
    const latest = latestSnap.data();
    if (latest?.snapshotFingerprint === snapshotFingerprint && latest?.driveFileId && latest?.publicationId) {
      const done = await tx.get(deps.db.collection(JOBS).doc(latest.publicationId));
      if (!done.exists) fail('METADATA_INCONSISTENT', 'Catatan operasi publikasi terakhir tidak ditemukan.', 503);
      return { job: done.data() as PublicationJob, report: latest as PublishedElementaryMonthlyReportDoc };
    }
    const version = Math.max(Number(stateData.lastReservedVersion) || 0, Number(latest?.version) || 0) + 1;
    const timestamp = now(deps);
    const job: PublicationJob = { ...scope, id: operationId, reportId: context.report, status: 'PREPARED', version,
      reportSnapshot: { ...snapshot, snapshotCreatedAt: timestamp }, snapshotFingerprint, driveFileId: fileId,
      fileName: makeFileName(snapshot, scope.studentId, version), actorUid: actor.uid,
      actorName: textValue(actor.profile.displayName || actor.profile.name || actor.email), preparedAt: timestamp, updatedAt: timestamp };
    tx.create(jobRef, job);
    tx.set(stateRef, { ...scope, pendingOperationId: operationId, lastReservedVersion: version, updatedAt: timestamp }, { merge: true });
    return { job };
  });
  return responseFor(result.job, result.report, now(deps));
}

function errorStatus(error: any): number { return Number(error?.code || error?.response?.status || 0); }
function escapeDriveQuery(value: string) { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
async function getDriveFileOrNull(deps: MonthlyPublicationDependencies, fileId: string) {
  try { return (await deps.drive.files.get({ fileId, supportsAllDrives: true, fields: DRIVE_FIELDS })).data; }
  catch (error) { if (errorStatus(error) === 404) return null; throw error; }
}
async function listNamedFolders(deps: MonthlyPublicationDependencies, parentId: string, name: string) {
  const files: Json[] = [];
  let pageToken: string | undefined;
  do {
    const result = await deps.drive.files.list({
      q: `'${escapeDriveQuery(parentId)}' in parents and name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
      pageSize: 100, pageToken, fields: 'nextPageToken,incompleteSearch,files(id,name,parents,mimeType,trashed)',
    });
    if (result.data.incompleteSearch) fail('DRIVE_SEARCH_INCOMPLETE', 'Pencarian folder Drive belum lengkap; publikasi dihentikan agar tidak membuat folder ganda.', 503);
    files.push(...(result.data.files || []));
    pageToken = result.data.nextPageToken || undefined;
  } while (pageToken);
  if (files.length > 1) fail('FOLDER_CONFLICT', `Konflik: ditemukan ${files.length} folder bernama “${name}” pada parent ${parentId}. Rapikan konflik secara manual sebelum mencoba lagi.`, 409);
  return files;
}
export async function findOrCreateMonthlyReportFolder(deps: MonthlyPublicationDependencies, parentId: string, name: string): Promise<string> {
  const reservation = deps.db.collection(FOLDERS).doc(hash(`${parentId}\n${name}`));
  let existing = await listNamedFolders(deps, parentId, name);
  if (existing.length === 1) {
    await deps.db.runTransaction(async tx => {
      const latest = await tx.get(reservation);
      if (latest.data()?.folderId && latest.data()!.folderId !== existing[0].id) {
        fail('FOLDER_CONFLICT', `Reservasi folder “${name}” berbeda dari folder yang ditemukan. Periksa konflik secara manual.`, 409);
      }
      tx.set(reservation, { parentId, name, folderId: existing[0].id, verifiedAt: now(deps) }, { merge: true });
    });
    return existing[0].id;
  }
  const generated = await deps.drive.files.generateIds({ count: 1, space: 'drive', type: 'files' });
  if (!generated.data.ids?.[0]) fail('DRIVE_ID_FAILED', 'Drive tidak mengembalikan ID folder.', 503);
  const folderId = await deps.db.runTransaction(async tx => {
    const snap = await tx.get(reservation);
    if (snap.data()?.folderId) return snap.data()!.folderId as string;
    tx.set(reservation, { parentId, name, folderId: generated.data.ids![0], reservedAt: now(deps) });
    return generated.data.ids![0];
  });
  const reserved = await getDriveFileOrNull(deps, folderId);
  if (reserved) {
    if (reserved.trashed || reserved.mimeType !== FOLDER_MIME || reserved.name !== name || !reserved.parents?.includes(parentId)) {
      fail('FOLDER_CONFLICT', `Folder yang telah direservasi untuk “${name}” telah diubah atau dipindahkan.`, 409);
    }
  } else {
    existing = await listNamedFolders(deps, parentId, name);
    if (existing.length && existing[0].id !== folderId) {
      // Another actor created a folder outside this reservation. Neither create a duplicate nor change the reserved ID.
      fail('FOLDER_CONFLICT', `Folder “${name}” muncul dengan ID berbeda ketika resolusi sedang berjalan. Periksa konflik secara manual.`, 409);
    }
    try {
      await deps.drive.files.create({ supportsAllDrives: true, fields: 'id',
        requestBody: { id: folderId, name, parents: [parentId], mimeType: FOLDER_MIME } });
    } catch (error) {
      // A timed-out create is recovered by its preallocated ID; other failures stay recoverable.
      const recovered = await getDriveFileOrNull(deps, folderId);
      if (!recovered || recovered.trashed || recovered.mimeType !== FOLDER_MIME || recovered.name !== name || !recovered.parents?.includes(parentId)) throw error;
    }
  }
  existing = await listNamedFolders(deps, parentId, name);
  if (existing.length !== 1 || existing[0].id !== folderId) {
    fail('FOLDER_CONFLICT', `Folder “${name}” belum dapat diverifikasi secara tunggal setelah pembuatan. Coba kembali setelah daftar Drive diperbarui.`, 409);
  }
  return folderId;
}
export async function resolveMonthlyReportsFolder(deps: MonthlyPublicationDependencies, job: Pick<PublicationJob, 'reportSnapshot' | 'month'>) {
  const root = await deps.drive.files.get({ fileId: ELEMENTARY_MONTHLY_REPORTS_ROOT_ID, supportsAllDrives: true,
    fields: 'id,name,mimeType,trashed,capabilities(canAddChildren)' });
  if (root.data.trashed || root.data.mimeType !== FOLDER_MIME || root.data.capabilities?.canAddChildren === false) {
    fail('REPORTS_ROOT_UNAVAILABLE', 'Parent resmi Elementary Reports tidak tersedia atau akun Drive server tidak dapat menambah berkas.', 403);
  }
  const labels = [`Rapor Monthly Elementary ${job.reportSnapshot.academicYear.replace(/[\/_]/g, '-')}`, 'Lower Grade (1–3)', job.reportSnapshot.student.className.trim(), job.month];
  if (labels.some(s => !s)) fail('INVALID_FOLDER_NAME', 'Nama kelas/periode folder rapor belum lengkap.');
  let folderId = ELEMENTARY_MONTHLY_REPORTS_ROOT_ID;
  for (const label of labels) folderId = await findOrCreateMonthlyReportFolder(deps, folderId, label);
  return folderId;
}
function decodePdf(value: unknown): Buffer | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail('INVALID_PDF', 'PDF harus dikirim sebagai base64.');
  const raw = value.replace(/^data:application\/pdf;base64,/, '');
  if (raw.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) fail('INVALID_PDF', 'Ukuran atau encoding PDF tidak valid.');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length < 100 || buffer.length > MAX_PDF_BYTES || buffer.subarray(0, 5).toString('ascii') !== '%PDF-' || !buffer.subarray(-2048).includes(Buffer.from('%%EOF'))) {
    fail('INVALID_PDF', 'Data bukan berkas PDF lengkap atau ukurannya melebihi 32 MiB.');
  }
  return buffer;
}
function verifyUploadedFile(file: Json, job: PublicationJob) {
  if (file.trashed || file.id !== job.driveFileId || file.mimeType !== 'application/pdf' || file.name !== job.fileName ||
      !job.driveFolderId || !file.parents?.includes(job.driveFolderId) ||
      file.appProperties?.luminaOperationId !== job.id || file.appProperties?.luminaSnapshot !== job.snapshotFingerprint ||
      Number(file.size) !== job.byteSize || !job.pdfSha256 || !job.pdfMd5 ||
      (file.sha256Checksum ? file.sha256Checksum !== job.pdfSha256 : file.md5Checksum !== job.pdfMd5)) {
    throw new MonthlyPublicationError('PDF_FILE_CONFLICT', 'Berkas pada ID Drive yang direservasi tidak sesuai metadata publikasi. Tidak ada berkas yang ditimpa.', 409, job.id, true);
  }
}
async function supersedeUnuploadedJob(deps: MonthlyPublicationDependencies, job: PublicationJob, leaseOwner: string) {
  const ref = deps.db.collection(JOBS).doc(job.id);
  const state = deps.db.collection(STATES).doc(job.reportId);
  await deps.db.runTransaction(async tx => {
    const [j, s] = await Promise.all([tx.get(ref), tx.get(state)]);
    if (j.data()?.leaseOwner !== leaseOwner || j.data()?.uploadedAt) return;
    tx.update(ref, { status: 'SUPERSEDED', leaseOwner: null, leaseExpiresAt: 0, updatedAt: now(deps) });
    if (s.data()?.pendingOperationId === job.id) tx.update(state, { pendingOperationId: null, updatedAt: now(deps) });
  });
}
function assertSameUploadIdentity(current: PublicationJob, expected: PublicationJob) {
  const fields: Array<keyof PublicationJob> = ['id', 'reportId', 'version', 'snapshotFingerprint', 'driveFileId', 'driveFolderId', 'fileName', 'pdfSha256', 'pdfMd5', 'byteSize', 'uploadAttemptedAt'];
  if (fields.some(field => current[field] !== expected[field])) {
    throw new MonthlyPublicationError('PDF_FILE_CONFLICT', 'Identitas atau checksum operasi berubah saat unggah. Hentikan dan periksa operasi yang sama; tidak ada file yang ditimpa.', 409, expected.id, true);
  }
}
async function finalizeMonthlyPublication(deps: MonthlyPublicationDependencies, job: PublicationJob, driveFile: Json, leaseOwner: string) {
  verifyUploadedFile(driveFile, job);
  const jobRef = deps.db.collection(JOBS).doc(job.id);
  const latestRef = deps.db.collection(REPORTS).doc(job.reportId);
  const stateRef = deps.db.collection(STATES).doc(job.reportId);
  const versionRef = latestRef.collection('versions').doc(String(job.version));
  return deps.db.runTransaction(async tx => {
    const [liveJob, latestSnap, state, versionSnap] = await Promise.all([tx.get(jobRef), tx.get(latestRef), tx.get(stateRef), tx.get(versionRef)]);
    if (versionSnap.exists && versionSnap.data()?.publicationId === job.id) {
      return (latestSnap.data()?.publicationId === job.id ? latestSnap.data() : versionSnap.data()) as PublishedElementaryMonthlyReportDoc;
    }
    const current = liveJob.data() as PublicationJob;
    if (current.status === 'SUPERSEDED' || current.status === 'PUBLISHED') fail('PUBLICATION_CONFLICT', 'Status operasi telah berubah; hentikan dan periksa riwayat.', 409);
    if (current.leaseOwner !== leaseOwner) throw new MonthlyPublicationError('IN_PROGRESS', 'Operasi ini sedang dipulihkan proses lain. Cek status operasi yang sama.', 409, job.id, true, true);
    assertSameUploadIdentity(current, job);
    if (state.data()?.pendingOperationId !== job.id) fail('PUBLICATION_CONFLICT', 'Reservasi publikasi telah berubah; hentikan dan periksa riwayat.', 409);
    if (versionSnap.exists) fail('VERSION_CONFLICT', 'Versi publikasi ini sudah ada dan tidak boleh ditimpa.', 409);
    const previous = latestSnap.data();
    if (previous && Number(previous.version) >= job.version) fail('VERSION_CONFLICT', 'Versi yang lebih baru sudah terbit; versi sebelumnya tidak ditimpa.', 409);
    const previousRef = previous ? latestRef.collection('versions').doc(String(previous.version || 1)) : null;
    const previousVersion = previousRef ? await tx.get(previousRef) : null;
    const timestamp = now(deps);
    const report: PublishedElementaryMonthlyReportDoc & Json = {
      id: job.reportId, unit: 'ELEMENTARY', reportType: 'MONTHLY_REPORT', studentId: job.studentId,
      studentNameSnapshot: job.reportSnapshot.student.name, nisnSnapshot: job.reportSnapshot.student.nisn,
      classId: job.classId, classNameSnapshot: job.reportSnapshot.student.className,
      gradeSnapshot: job.reportSnapshot.student.grade, academicYear: job.academicYear, semester: job.semester,
      month: job.month, monthLabel: job.reportSnapshot.monthLabel, version: job.version, status: 'PUBLISHED',
      deliveryStatus: 'NOT_SENT', isSentToPortal: false, sentAt: null, sentBy: null, sentByName: null,
      reportSnapshot: job.reportSnapshot, driveFileId: job.driveFileId,
      driveFileUrl: driveFile.webViewLink || `https://drive.google.com/file/d/${job.driveFileId}/view`,
      driveFolderId: job.driveFolderId, fileName: job.fileName, publicationId: job.id,
      pdfSha256: job.pdfSha256, byteSize: job.byteSize, templateVersion: job.reportSnapshot.templateVersion,
      snapshotFingerprint: job.snapshotFingerprint, generatedBy: job.actorUid, generatedByName: job.actorName,
      generatedAt: job.preparedAt, uploadedAt: job.uploadedAt || timestamp, publishedAt: timestamp,
      isOpened: false, firstOpenedAt: null, lastOpenedAt: null, openCount: 0, openedByEmail: null,
      createdAt: previous?.createdAt || job.preparedAt, updatedAt: timestamp,
    };
    // Preserve a legacy or current version verbatim before updating the compatible latest pointer.
    if (previous && previousRef && !previousVersion?.exists) tx.create(previousRef, previous);
    tx.create(versionRef, plain(report));
    tx.set(latestRef, plain(report));
    tx.update(jobRef, { status: 'PUBLISHED', driveFileUrl: report.driveFileUrl, uploadedAt: report.uploadedAt,
      publishedAt: timestamp, leaseOwner: null, leaseExpiresAt: 0, lastErrorCode: null, updatedAt: timestamp });
    tx.set(stateRef, { pendingOperationId: null, latestOperationId: job.id, latestVersion: job.version, updatedAt: timestamp }, { merge: true });
    return report;
  });
}

export async function publishMonthlyPublication(deps: MonthlyPublicationDependencies, actor: MonthlyPublicationActor, operationId: string, pdfBase64?: unknown) {
  let job = await getJob(deps, operationId);
  await requireClassAccess(deps, actor, job);
  if (job.status === 'PUBLISHED') return responseFor(job, await publishedVersion(deps, job), now(deps));
  if (job.status === 'SUPERSEDED') throw new MonthlyPublicationError('SOURCE_CHANGED', 'Data sumber berubah. Muat ulang kesiapan dan siapkan publikasi baru.', 409, job.id);
  const pdf = decodePdf(pdfBase64);
  const leaseOwner = randomUUID();
  const jobRef = deps.db.collection(JOBS).doc(job.id);
  job = await deps.db.runTransaction(async tx => {
    const [live, state] = await Promise.all([tx.get(jobRef), tx.get(deps.db.collection(STATES).doc(job.reportId))]);
    const data = live.data() as PublicationJob;
    if (data.status === 'PUBLISHED') return data;
    if (data.status === 'SUPERSEDED') {
      throw new MonthlyPublicationError('SOURCE_CHANGED', 'Reservasi ini sudah digantikan setelah sumber berubah. Muat ulang kesiapan sebelum mencoba lagi.', 409, data.id);
    }
    if (state.data()?.pendingOperationId !== data.id) {
      throw new MonthlyPublicationError('PUBLICATION_CONFLICT', 'Reservasi publikasi tidak lagi menunjuk operasi ini.', 409, data.id);
    }
    if (data.leaseOwner && (data.leaseExpiresAt || 0) > now(deps)) {
      throw new MonthlyPublicationError('IN_PROGRESS', 'Publikasi yang sama sedang diproses. Cek status sebelum mencoba kembali.', 409, data.id, Boolean(data.uploadedAt), true);
    }
    const next: PublicationJob = { ...data, status: data.uploadedAt ? 'UPLOADED' : 'UPLOADING', leaseOwner,
      leaseExpiresAt: now(deps) + LEASE_MS, updatedAt: now(deps) };
    tx.update(jobRef, { status: next.status, leaseOwner, leaseExpiresAt: next.leaseExpiresAt, updatedAt: next.updatedAt });
    return next;
  });
  if (job.status === 'PUBLISHED') return responseFor(job, await publishedVersion(deps, job), now(deps));
  let confirmedUploaded = false;
  try {
    let file = await getDriveFileOrNull(deps, job.driveFileId);
    if (file) {
      verifyUploadedFile(file, job);
      confirmedUploaded = true;
    } else {
      if (job.uploadedAt) throw new MonthlyPublicationError('PUBLISHED_FILE_MISSING', 'Drive pernah mengonfirmasi unggahan tetapi berkas kini tidak tersedia. Periksa akses/berkas; jangan membuat unggahan pengganti otomatis.', 409, job.id, true);
      if (!job.uploadAttemptedAt) {
        // A metadata-only probe must detect a corrected draft before the browser tries to render stale/broken assets.
        let freshSnapshot: ElementaryMonthlyReportSnapshot;
        try { freshSnapshot = await loadAuthoritativeSnapshot(deps, actor, job); }
        catch (error) {
          if (error instanceof MonthlyPublicationError && error.httpStatus < 500) {
            await supersedeUnuploadedJob(deps, job, leaseOwner);
            throw new MonthlyPublicationError('SOURCE_CHANGED', `Sumber publikasi berubah atau belum memenuhi gate. ${error.message} Muat ulang kesiapan sebelum mencoba lagi.`, 409, job.id);
          }
          throw error;
        }
        if (hash(stableMonthlyJson(freshSnapshot)) !== job.snapshotFingerprint) {
          await supersedeUnuploadedJob(deps, job, leaseOwner);
          throw new MonthlyPublicationError('SOURCE_CHANGED', 'Data nilai, persetujuan, foto, konfigurasi, atau penandatangan berubah setelah preview. Muat ulang dan siapkan publikasi baru.', 409, job.id);
        }
      }
      // Once an upload has been attempted, the previously validated immutable operation is recovered in place.
      // It is never superseded using a new ID after an ambiguous Drive response.
      if (!pdf) throw new MonthlyPublicationError('PDF_REQUIRED', 'Berkas PDF belum ada pada ID yang direservasi. Render snapshot tersimpan dan kirim PDF untuk operasi yang sama.', 409, job.id, false, true);
      const nextSha256 = hash(pdf);
      const nextMd5 = hash(pdf, 'md5');
      if (job.uploadAttemptedAt && (job.pdfSha256 !== nextSha256 || job.pdfMd5 !== nextMd5 || job.byteSize !== pdf.length)) {
        throw new MonthlyPublicationError('PDF_BYTES_CHANGED', 'PDF hasil render ulang berbeda dari unggahan yang sudah dicoba. Cek status untuk memulihkan berkas asli; jangan mengganti checksum atau membuat operasi baru.', 409, job.id, false, true);
      }
      const folderId = await resolveMonthlyReportsFolder(deps, job);
      if (job.uploadAttemptedAt && job.driveFolderId !== folderId) {
        throw new MonthlyPublicationError('FOLDER_CONFLICT', 'Folder unggahan yang direservasi berubah. Pulihkan folder asli sebelum melanjutkan.', 409, job.id);
      }
      job = { ...job, driveFolderId: folderId, pdfSha256: job.pdfSha256 || nextSha256, pdfMd5: job.pdfMd5 || nextMd5, byteSize: job.byteSize || pdf.length,
        uploadValidatedAt: job.uploadValidatedAt || now(deps), uploadAttemptedAt: job.uploadAttemptedAt || now(deps) };
      // Persist the exact file identity and checksums BEFORE any upload attempt.
      await deps.db.runTransaction(async tx => {
        const live = await tx.get(jobRef);
        if (live.data()?.leaseOwner !== leaseOwner) throw new MonthlyPublicationError('IN_PROGRESS', 'Reservasi unggah diambil proses lain. Cek status operasi yang sama.', 409, job.id, false, true);
        tx.update(jobRef, { driveFolderId: folderId, pdfSha256: job.pdfSha256, pdfMd5: job.pdfMd5, byteSize: job.byteSize,
          uploadValidatedAt: job.uploadValidatedAt, uploadAttemptedAt: job.uploadAttemptedAt, leaseExpiresAt: now(deps) + LEASE_MS, updatedAt: now(deps) });
      });
      try {
        await deps.drive.files.create({
          supportsAllDrives: true, fields: DRIVE_FIELDS,
          requestBody: { id: job.driveFileId, name: job.fileName, mimeType: 'application/pdf', parents: [folderId],
            appProperties: { luminaOperationId: job.id, luminaSnapshot: job.snapshotFingerprint, luminaReport: hash(job.reportId) } },
          media: { mimeType: 'application/pdf', body: Readable.from(pdf) },
        }, { timeout: 120_000, retry: false });
      } catch (uploadError) {
        // Never allocate a new ID after an ambiguous response. A retry checks this ID first.
        file = await getDriveFileOrNull(deps, job.driveFileId);
        if (!file) throw new MonthlyPublicationError('UPLOAD_UNCERTAIN', 'Unggahan Drive belum dapat dikonfirmasi. Coba pemulihan dengan operasi yang sama; jangan membuat publikasi baru.', 503, job.id, false, true);
      }
      file = file || await getDriveFileOrNull(deps, job.driveFileId);
      if (!file) throw new MonthlyPublicationError('UPLOAD_UNCERTAIN', 'Drive belum mengembalikan metadata unggahan. Pulihkan operasi yang sama.', 503, job.id, false, true);
      verifyUploadedFile(file, job);
      confirmedUploaded = true;
    }
    job = await deps.db.runTransaction(async tx => {
      const [live, state] = await Promise.all([tx.get(jobRef), tx.get(deps.db.collection(STATES).doc(job.reportId))]);
      const current = live.data() as PublicationJob;
      if (current.status === 'PUBLISHED') return current;
      if (current.leaseOwner !== leaseOwner || state.data()?.pendingOperationId !== job.id) {
        throw new MonthlyPublicationError('IN_PROGRESS', 'Unggahan telah dikonfirmasi, tetapi operasi sedang dipulihkan proses lain. Cek status operasi yang sama.', 409, job.id, true, true);
      }
      assertSameUploadIdentity(current, job);
      const next: PublicationJob = { ...current, status: 'UPLOADED', uploadedAt: current.uploadedAt || now(deps),
        leaseExpiresAt: now(deps) + LEASE_MS, updatedAt: now(deps) };
      tx.update(jobRef, { status: next.status, uploadedAt: next.uploadedAt, leaseExpiresAt: next.leaseExpiresAt, updatedAt: next.updatedAt });
      return next;
    });
    if (job.status === 'PUBLISHED') return responseFor(job, await publishedVersion(deps, job), now(deps));
    const report = await finalizeMonthlyPublication(deps, job, file!, leaseOwner);
    return responseFor({ ...job, status: 'PUBLISHED' }, report, now(deps));
  } catch (error) {
    const known = error instanceof MonthlyPublicationError ? error : null;
    // Retain all identity/checksum fields even if recording an error itself fails.
    try {
      await deps.db.runTransaction(async tx => {
        const live = await tx.get(jobRef);
        if (live.data()?.leaseOwner === leaseOwner && live.data()?.status !== 'PUBLISHED' && live.data()?.status !== 'SUPERSEDED') {
          tx.update(jobRef, { status: confirmedUploaded ? 'UPLOADED' : 'RECOVERABLE', leaseOwner: null, leaseExpiresAt: 0,
            ...(confirmedUploaded ? { uploadedAt: job.uploadedAt || now(deps) } : {}),
            lastErrorCode: known?.code || (confirmedUploaded ? 'PARTIAL_UPLOAD' : 'PUBLICATION_FAILED'), updatedAt: now(deps) });
        }
      });
    } catch { /* The durable job and preallocated Drive ID still permit recovery after Firestore returns. */ }
    if (known && !confirmedUploaded) throw known;
    if (known && ['PDF_FILE_CONFLICT', 'VERSION_CONFLICT', 'PUBLICATION_CONFLICT', 'IN_PROGRESS'].includes(known.code)) throw known;
    if (confirmedUploaded) throw new MonthlyPublicationError('PARTIAL_UPLOAD', 'PDF sudah ada di Drive, tetapi finalisasi metadata gagal. Pulihkan operasi yang sama; PDF tidak diunggah ulang.', 503, job.id, true, true);
    throw new MonthlyPublicationError('PUBLICATION_FAILED', 'Publikasi belum selesai. Periksa koneksi dan akses akun Drive server, lalu coba operasi yang sama.', 503, job.id, false, true);
  }
}

export async function statusMonthlyPublication(deps: MonthlyPublicationDependencies, actor: MonthlyPublicationActor, operationId: string) {
  const job = await getJob(deps, operationId);
  await requireClassAccess(deps, actor, job);
  return responseFor(job, job.status === 'PUBLISHED' ? await publishedVersion(deps, job) : undefined, now(deps));
}

/** Extract only recognized Drive URLs; arbitrary URLs are never fetched by the server. */
export function monthlyDriveFileId(value: unknown): string | null {
  const raw = textValue(value);
  const stream = raw.match(/^\/api\/elementary-monthly\/(?:photo-stream|reports\/assets)\/([A-Za-z0-9_-]+)(?:[?#]|$)/);
  if (stream) return stream[1];
  try {
    const url = new URL(raw);
    // These are stored references only. The original host is never fetched or trusted for credentials.
    const absoluteStream = url.pathname.match(/^\/api\/elementary-monthly\/(?:photo-stream|reports\/assets)\/([A-Za-z0-9_-]+)$/);
    if (absoluteStream) return absoluteStream[1];
    if (!['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/\/(?:file\/d|d)\/([A-Za-z0-9_-]+)/);
    const id = match?.[1] || url.searchParams.get('id');
    return id && /^[A-Za-z0-9_-]{5,}$/.test(id) ? id : null;
  } catch { return null; }
}
export type MonthlyReportAssetKind = 'photo' | 'official';

/** A trusted master portrait, logo or signature need not live under the monthly photo root. */
function addSnapshotAssets(target: Map<string, MonthlyReportAssetKind>, snapshot: any): void {
  const add = (value: unknown, kind: MonthlyReportAssetKind, isFileId = false) => {
    const id = isFileId ? textValue(value) : monthlyDriveFileId(value);
    if (!id || !/^[A-Za-z0-9_-]{5,}$/.test(id)) return;
    if (kind === 'official' || target.get(id) !== 'official') target.set(id, kind);
  };
  add(snapshot?.logoUrl, 'official');
  add(snapshot?.signatory?.principalSignatureUrl, 'official');
  add(snapshot?.signatory?.homeroomTeacherSignatureUrl, 'official');
  if (snapshot?.photos?.identityPhotoSource === 'master') {
    // Only the exact frozen master URL inherits this exception. A stale or
    // mismatched metadata.driveFileId must still pass the monthly-photo gate.
    add(snapshot?.photos?.identityPhotoUrl || snapshot?.photos?.identityPhoto?.url, 'official');
  } else {
    add(snapshot?.photos?.identityPhotoUrl, 'photo');
    add(snapshot?.photos?.identityPhoto?.url, 'photo');
    add(snapshot?.photos?.identityPhoto?.driveFileId, 'photo', true);
  }
  const snapshots = Array.isArray(snapshot?.photos?.snapshots) ? snapshot.photos.snapshots : [];
  for (const photo of snapshots) {
    add(photo?.url, 'photo');
    add(photo?.driveFileId, 'photo', true);
  }
}

function matchesMonthlyAssetScope(value: Json | null | undefined, scope: MonthlyPublicationScope): boolean {
  return Boolean(value && value.classId === scope.classId && value.studentId === scope.studentId &&
    yearEqual(value.academicYear, scope.academicYear) && String(value.semester) === scope.semester && value.month === scope.month);
}

function hasMatchingReportSnapshot(value: Json | null | undefined, scope: MonthlyPublicationScope): boolean {
  return Boolean(matchesMonthlyAssetScope(value, scope) && value?.reportSnapshot?.student?.id === scope.studentId &&
    yearEqual(value.reportSnapshot.academicYear, scope.academicYear) &&
    String(value.reportSnapshot.semester) === scope.semester && value.reportSnapshot.month === scope.month);
}
async function actorOwnsStudent(deps: MonthlyPublicationDependencies, actor: MonthlyPublicationActor, studentId: string) {
  if (actor.profile.role === 'STUDENT') {
    const linked = [actor.uid, actor.profile.luminaId, actor.profile.studentId].filter(Boolean);
    if (linked.includes(studentId)) return true;
    for (const id of linked) {
      const student = await deps.db.collection('students').doc(String(id)).get();
      if (student.data()?.nisn === studentId) return true;
    }
  }
  if (actor.profile.role === 'PARENT') {
    const profileIds = Array.isArray(actor.profile.linkedStudents) ? actor.profile.linkedStudents : [];
    let documentIds: unknown[] = [];
    if (actor.email) {
      const link = await deps.db.collection('parentStudentLinks').doc(actor.email.toLowerCase()).get();
      if (Array.isArray(link.data()?.studentIds)) documentIds = link.data()!.studentIds;
    }
    // Firestore student IDs are case-sensitive; only the parent's email key is normalized.
    if ([...profileIds, ...documentIds].some(id => String(id) === studentId)) return true;
    for (const id of [...profileIds.slice(0, 3), ...documentIds.slice(0, 3)]) {
      const student = await deps.db.collection('students').doc(String(id)).get();
      if (student.data()?.nisn === studentId) return true;
    }
  }
  return false;
}
/**
 * Authorize one requested asset from this student's exact period. A matching root
 * alone is never enough. Shared photos are allowed through the recipient's nested
 * references; the registry's original student remains unchanged.
 */
export async function resolveMonthlyReportAssetAccess(
  deps: MonthlyPublicationDependencies,
  actor: MonthlyPublicationActor,
  scope: MonthlyPublicationScope,
  fileId: string,
): Promise<MonthlyReportAssetKind> {
  if (actor.profile.status !== 'active') fail('FORBIDDEN', 'Profil pengguna aktif diperlukan.', 403);
  const context = ids(scope);
  const reportRef = deps.db.collection(REPORTS).doc(context.report);
  const [latest, cls] = await Promise.all([
    reportRef.get(), deps.db.collection('classes').doc(scope.classId).get(),
  ]);
  const latestReport = latest.data();
  const latestMatches = latestReport?.status === 'PUBLISHED' && hasMatchingReportSnapshot(latestReport, scope);
  const permitted = new Map<string, MonthlyReportAssetKind>();
  const add = (snapshot: any) => addSnapshotAssets(permitted, snapshot);
  if (cls.exists && canManageMonthlyClass(actor, cls.data()!)) {
    await requireClassAccess(deps, actor, scope);
    const [photo, student, enrollments, config, logo, versions, state, registry] = await Promise.all([
      deps.db.collection('elem_monthly_student_photos').doc(context.studentPeriod).get(),
      deps.db.collection('students').doc(scope.studentId).get(),
      deps.db.collection('enrollments').where('studentId', '==', scope.studentId).get(),
      deps.db.collection('reportConfig').doc('ELEMENTARY').get(), deps.db.collection('settings').doc('logos').get(),
      reportRef.collection('versions').get(), deps.db.collection(STATES).doc(context.report).get(),
      deps.db.collection('elem_monthly_drive_files').doc(fileId).get(),
    ]);
    // Historical enrollment records remain readable; a new publication still
    // uses the stricter active-class/enrollment gate in loadAuthoritativeSnapshot.
    const classKeys = [scope.classId, cls.data()?.classId, cls.data()?.name].filter(Boolean);
    const matchingEnrollment = enrollments.docs.some(doc => {
      const entry = doc.data();
      return entry.studentId === scope.studentId && classKeys.includes(entry.classId) &&
        yearEqual(entry.academicYear, scope.academicYear);
    });
    // Legacy rosters can store their authoritative assignment on the student
    // profile. This read fallback must agree with the photo-stream verifier.
    const directAssignment = student.exists && classKeys.includes(student.data()?.classId) &&
      yearEqual(cls.data()?.academicYear, scope.academicYear) &&
      (!student.data()?.academicYear || yearEqual(student.data()?.academicYear, scope.academicYear));
    const enrolled = student.exists && (matchingEnrollment || directAssignment);
    const historical = versions.docs.map(doc => doc.data()).filter(data => data.status === 'PUBLISHED' && hasMatchingReportSnapshot(data, scope));
    let pending: PublicationJob | null = null;
    const pendingId = textValue(state.data()?.pendingOperationId);
    if (/^[A-Za-z0-9_-]{1,200}$/.test(pendingId)) {
      const operation = (await deps.db.collection(JOBS).doc(pendingId).get()).data() as PublicationJob | undefined;
      if (operation && operation.status !== 'SUPERSEDED' && hasMatchingReportSnapshot(operation, scope)) pending = operation;
    }
    if (!enrolled && !latestMatches && !historical.length && !pending) {
      fail('STUDENT_CLASS_MISMATCH', 'Siswa tidak memiliki enrollment atau arsip rapor untuk kelas dan periode ini.', 403);
    }
    if (enrolled) {
      if (matchesMonthlyAssetScope(photo.data(), scope)) add({ photos: photo.data() });
      // Master portrait is an authoritative student-profile reference. Never
      // infer it from the current admin or an arbitrary URL in the request.
      add({ photos: { identityPhotoUrl: student.data()?.photoUrl, identityPhotoSource: 'master' } });
      add({ logoUrl: resolveElementaryMonthlyLogo(logo.data()),
        signatory: { principalSignatureUrl: config.data()?.principalSignatureUrl } });
      try {
        const teacher = await deps.db.collection('users').doc(teacherIdForClass(cls.data()!)).get();
        add({ signatory: { homeroomTeacherSignatureUrl: teacher.data()?.signatureUrl || cls.data()?.teacherSignatureUrl } });
      } catch (error) { if (!(error instanceof MonthlyPublicationError)) throw error; }
      const registered = registry.data();
      // Older registry records omit semester. The already-validated year/month
      // still identify that semester without rewriting those records.
      if (registered && registered.fileId === fileId && registered.classId === scope.classId &&
          registered.studentId === scope.studentId && yearEqual(registered.academicYear, scope.academicYear) &&
          registered.month === scope.month && (!registered.semester || String(registered.semester) === scope.semester) &&
          permitted.get(fileId) !== 'official') permitted.set(fileId, 'photo');
    }
    if (latestMatches) add(latestReport!.reportSnapshot);
    historical.forEach(data => add(data.reportSnapshot));
    if (pending) add(pending.reportSnapshot);
  } else if (latestMatches && latestReport!.deliveryStatus === 'SENT' && await actorOwnsStudent(deps, actor, scope.studentId)) {
    add(latestReport!.reportSnapshot);
  } else fail('FORBIDDEN', 'Akses foto rapor ini tidak diizinkan.', 403);
  const kind = permitted.get(fileId);
  if (!kind) fail('FORBIDDEN_ASSET', 'Gambar tidak tercatat sebagai aset untuk siswa, kelas, dan periode ini.', 403);
  return kind;
}
async function streamDriveAsset(deps: MonthlyPublicationDependencies, fileId: string, res: Response, mode: 'image' | 'pdf', fileName?: string) {
  const metadata = await deps.drive.files.get({ fileId, supportsAllDrives: true, fields: 'id,mimeType,size,trashed' });
  const mime = metadata.data.mimeType || '';
  if (metadata.data.trashed || (mode === 'image' ? !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime) : mime !== 'application/pdf')) {
    fail('INVALID_ASSET', 'Jenis berkas rapor tidak didukung atau telah dihapus.', 415);
  }
  if (Number(metadata.data.size) > (mode === 'image' ? 20 * 1024 * 1024 : MAX_PDF_BYTES)) fail('ASSET_TOO_LARGE', 'Ukuran berkas rapor melebihi batas.', 413);
  const stream = await deps.drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (mode === 'pdf') res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName || 'Monthly-Report.pdf')}`);
  await pipeline(stream.data, res);
}
function routeError(res: Response, error: unknown) {
  if (res.headersSent) { res.destroy(); return; }
  if (error instanceof PhotoHttpError) {
    res.status(error.httpStatus).json({ success: false, code: error.code, error: error.message,
      partialUpload: false, retryable: error.details.retryable === true || error.httpStatus >= 500 });
    return;
  }
  const known = error instanceof MonthlyPublicationError ? error : null;
  res.status(known?.httpStatus || 503).json({ success: false, code: known?.code || 'SERVICE_UNAVAILABLE',
    error: known?.message || 'Layanan rapor belum dapat menyelesaikan permintaan. Periksa konfigurasi dan akses server, lalu coba lagi.',
    ...(known?.operationId ? { operationId: known.operationId } : {}), partialUpload: known?.partialUpload || false, retryable: known?.retryable ?? true });
}
export const elementaryMonthlyPublicationRouter = express.Router();
const dependencyFactory = (): MonthlyPublicationDependencies => ({ db: getMonthlyPhotoDb(), drive: getGoogleDriveClient() });
function route(handler: (req: Request, res: Response, deps: MonthlyPublicationDependencies, actor: MonthlyPublicationActor) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      const actor = await authenticateMonthlyPhotoRequest(req);
      const deps = dependencyFactory();
      await handler(req, res, deps, actor);
    }
    catch (error) { routeError(res, error); }
  };
}
elementaryMonthlyPublicationRouter.post('/prepare', route(async (req, res, deps, actor) => {
  res.json(await prepareMonthlyPublication(deps, actor, parseMonthlyPublicationScope(req.body || {})));
}));
elementaryMonthlyPublicationRouter.post('/publish', route(async (req, res, deps, actor) => {
  res.json(await publishMonthlyPublication(deps, actor, requireId(req.body?.operationId, 'ID publikasi'), req.body?.pdfBase64));
}));
elementaryMonthlyPublicationRouter.get('/status/:operationId', route(async (req, res, deps, actor) => {
  res.json(await statusMonthlyPublication(deps, actor, String(req.params.operationId)));
}));
elementaryMonthlyPublicationRouter.get('/history', route(async (req, res, deps, actor) => {
  const scope = parseMonthlyPublicationScope(req.query);
  await requireClassAccess(deps, actor, scope);
  const ref = deps.db.collection(REPORTS).doc(ids(scope).report);
  const [latest, history] = await Promise.all([ref.get(), ref.collection('versions').get()]);
  const reports = new Map<number, Json>();
  history.docs.forEach(d => reports.set(d.data().version, d.data()));
  if (latest.exists) reports.set(latest.data()!.version, latest.data()!);
  res.json({ success: true, publishedReports: Array.from(reports.values()).sort((a, b) => b.version - a.version) });
}));
elementaryMonthlyPublicationRouter.get('/assets/:fileId', route(async (req, res, deps, actor) => {
  const fileId = requireId(req.params.fileId, 'ID gambar');
  if (!/^[A-Za-z0-9_-]{5,}$/.test(fileId)) fail('INVALID_ASSET', 'ID gambar Drive tidak valid.');
  const scope = parseMonthlyPublicationScope(req.query);
  const kind = await resolveMonthlyReportAssetAccess(deps, actor, scope, fileId);
  if (kind === 'photo') {
    // The same verifier used by the photo editor checks the registry, shared
    // references and actual Drive ancestry. It never makes a photo public.
    await getAuthorizedMonthlyPhotoFile({ ...actor, name: textValue(actor.profile.displayName || actor.profile.name || actor.email) }, fileId, scope);
  }
  await streamDriveAsset(deps, fileId, res, 'image');
}));
elementaryMonthlyPublicationRouter.get('/pdf/:reportId', route(async (req, res, deps, actor) => {
  const reportId = requireId(req.params.reportId, 'ID rapor');
  const ref = deps.db.collection(REPORTS).doc(reportId);
  const latest = await ref.get();
  if (!latest.exists) fail('REPORT_NOT_FOUND', 'Rapor terbit tidak ditemukan.', 404);
  const latestData = latest.data()!;
  const version = req.query.version ? Number(req.query.version) : Number(latestData.version);
  if (!Number.isSafeInteger(version) || version < 1) fail('INVALID_VERSION', 'Nomor versi rapor tidak valid.');
  const cls = await deps.db.collection('classes').doc(latestData.classId).get();
  const staff = cls.exists && canManageMonthlyClass(actor, cls.data()!);
  if (!staff && !(latestData.status === 'PUBLISHED' && latestData.deliveryStatus === 'SENT' && version === latestData.version && await actorOwnsStudent(deps, actor, latestData.studentId))) {
    fail('FORBIDDEN', 'Akses PDF rapor ini tidak diizinkan.', 403);
  }
  const data = version === latestData.version ? latestData : (await ref.collection('versions').doc(String(version)).get()).data();
  if (!data?.driveFileId) fail('PDF_UNAVAILABLE', 'Versi ini tidak memiliki PDF Drive tersimpan. Snapshot lama tidak dibuat ulang secara diam-diam.', 404);
  await streamDriveAsset(deps, data.driveFileId, res, 'pdf', data.fileName);
}));
