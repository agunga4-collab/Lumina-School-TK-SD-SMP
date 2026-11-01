import express, { type Request, type Response } from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  MONTHLY_PHOTO_ROOT, PhotoHttpError, currentPhotoRevision, decodeMonthlyPhotoDataUrl,
  normalizedPhotoYear, photoAlbumLink, photoCaption, photoDocumentId, photoHash,
  photoReferenceId, photoReferences, photoReportId, photoRevision, requireDocumentId,
  requireOperationId, requirePhotoSlot, stablePhotoJson, validatePhotoCrop,
  validatePhotoPeriod, type MonthlyPhotoSlot
} from './elementaryMonthlyPhotoValidation.server';

export { PhotoHttpError } from './elementaryMonthlyPhotoValidation.server';
export const ELEMENTARY_MONTHLY_ROOT_FOLDER_ID = MONTHLY_PHOTO_ROOT;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PHOTO_DOCS = 'elem_monthly_student_photos';
const PHOTO_FILES = 'elem_monthly_drive_files';
const OPERATIONS = 'elem_monthly_photo_upload_operations';
const COUNTERS = 'elem_monthly_photo_versions';
const FOLDER_KEYS = 'elem_monthly_photo_folder_keys';
const REPORTS = 'elem_monthly_published_reports';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface MonthlyPhotoActor {
  uid: string;
  email?: string;
  name: string;
  profile: Record<string, any>;
}

export interface MonthlyPhotoScope {
  classId: string;
  studentId: string;
  academicYear: string;
  normalizedYear: string;
  semester: string;
  month: string;
  className: string;
  studentName: string;
  gradeLevel: number;
  gradeCategory: 'Lower Grade' | 'Upper Grade';
  photoDocId: string;
  classData: Record<string, any>;
  studentData: Record<string, any>;
  staffAccess: boolean;
}

/** Dependencies are lazy; importing this module does not initialize Firebase or contact Drive. */
export interface MonthlyPhotoDependencies {
  getDb(): any;
  getDrive(): any;
  verifyIdToken(token: string): Promise<{ uid: string; email?: string }>;
  now?: () => number;
}

export function getMonthlyPhotoDb(): Firestore {
  try {
    if (!getApps().length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT;
      if (!raw) throw new Error('Missing credential');
      let account: any;
      try { account = JSON.parse(raw); } catch { account = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
      if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
      initializeApp({ credential: cert(account) });
    }
    return getFirestore();
  } catch {
    throw new PhotoHttpError(503, 'PHOTO_STORAGE_UNAVAILABLE', 'Penyimpanan metadata foto belum tersedia. Coba lagi setelah koneksi server pulih.', { retryable: true });
  }
}

let sharedMonthlyPhotoDriveClient: drive_v3.Drive | undefined;

/** Reuse the JWT client's token cache; folder/file authorization still runs on every request. */
export function getGoogleDriveClient(): drive_v3.Drive {
  if (sharedMonthlyPhotoDriveClient) return sharedMonthlyPhotoDriveClient;
  const raw = process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  try {
    if (!raw) throw new Error('Missing credential');
    let account: any;
    try { account = JSON.parse(raw); } catch { account = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
    const auth = new google.auth.JWT({ email: account.client_email, key: account.private_key?.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive'] });
    sharedMonthlyPhotoDriveClient = google.drive({ version: 'v3', auth });
    return sharedMonthlyPhotoDriveClient;
  } catch {
    throw new PhotoHttpError(503, 'PHOTO_DRIVE_UNAVAILABLE', 'Konfigurasi akses Drive foto belum tersedia.', { retryable: true });
  }
}

export function canManageMonthlyPhotoClass(actor: { uid: string; email?: string; profile: Record<string, any> }, cls: Record<string, any>): boolean {
  const profile = actor.profile || {};
  if (profile.status !== 'active' || String(cls.unitId || cls.unit || '').toUpperCase() !== 'ELEMENTARY') return false;
  const role = String(profile.role || '').toUpperCase();
  const adminEmail = ['agunga4@gmail.com', 'agunga4@lazuardi.sch.id'].includes((actor.email || '').trim().toLowerCase());
  if (role === 'SUPER_ADMIN' || adminEmail) return true;
  const units = [profile.unitId, profile.unit, ...(Array.isArray(profile.assignedUnits) ? profile.assignedUnits : [])].filter(Boolean).map(value => String(value).toUpperCase());
  const declaredUnit = ['unitId', 'unit', 'assignedUnits'].some(key => Object.prototype.hasOwnProperty.call(profile, key));
  if (declaredUnit && !units.some(unit => unit === 'ELEMENTARY' || unit === 'ALL')) return false;
  if (['HEAD_UNIT', 'PRINCIPAL', 'VICE_PRINCIPAL', 'SECRETARY_ELEM', 'COORDINATOR'].includes(role)) return true;
  if (!['TEACHER', 'HOMEROOM_TEACHER', 'COUNSELOR', 'BK_MENTOR'].includes(role)) return false;
  const ids = [cls.homeroomTeacherId, ...['assignedTeacherIds', 'homeroomTeacherIds', 'waliKelasIds', 'gpkTeacherIds'].flatMap(key => Array.isArray(cls[key]) ? cls[key] : []), ...(Array.isArray(cls.teacherAssignments) ? cls.teacherAssignments.map((assignment: any) => assignment.userId) : [])];
  return ids.includes(actor.uid);
}

function sameYear(left: unknown, right: unknown): boolean {
  try { return normalizedPhotoYear(left) === normalizedPhotoYear(right); } catch { return false; }
}

function sameScope(record: any, scope: MonthlyPhotoScope, includeStudent = true): boolean {
  return !!record && record.classId === scope.classId && (!includeStudent || record.studentId === scope.studentId)
    && sameYear(record.academicYear, scope.academicYear) && record.month === scope.month
    && (record.semester === undefined || String(record.semester) === scope.semester);
}

function assertPhotoDocumentScope(document: any, scope: MonthlyPhotoScope): void {
  if (document && (!sameScope(document, scope) || String(document.semester) !== scope.semester || (document.id && document.id !== scope.photoDocId))) {
    throw new PhotoHttpError(409, 'PHOTO_DOCUMENT_SCOPE_CONFLICT', 'Identitas dokumen foto tersimpan tidak sesuai siswa, kelas, atau periode. Periksa data sebelum menyimpan; dokumen tidak diubah.');
  }
}

function isNotFound(error: any): boolean { return Number(error?.code || error?.response?.status) === 404; }
function cleanName(value: string): string { return String(value || '').replace(/[\/\\:*?"<>|]/g, '').trim(); }
function escapeDrive(value: string): string { return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function docData(snapshot: any): any { return snapshot?.exists ? snapshot.data() : undefined; }
function photoSlot(document: any, slot: MonthlyPhotoSlot): any {
  return slot === 'profile' ? document?.identityPhoto || { url: document?.identityPhotoUrl || '' } : document?.snapshots?.[Number(slot.slice(-1)) - 1] || null;
}

function blankPhotoDoc(scope: MonthlyPhotoScope, previous: any, actor: MonthlyPhotoActor, now: number): Record<string, any> {
  return {
    ...(previous || {}), id: scope.photoDocId, studentId: scope.studentId, studentName: scope.studentName,
    classId: scope.classId, academicYear: scope.academicYear, semester: scope.semester, month: scope.month,
    identityPhotoUrl: previous?.identityPhotoUrl || '',
    snapshots: [0, 1, 2].map(index => previous?.snapshots?.[index] || { index, url: '', caption: '' }),
    albumLink: previous?.albumLink || '', createdAt: previous?.createdAt || now,
    createdBy: previous?.createdBy || actor.uid, createdByName: previous?.createdByName || actor.name,
    updatedAt: now, updatedBy: actor.uid, updatedByName: actor.name,
    revision: currentPhotoRevision(previous) + 1, photoSchemaVersion: 2
  };
}

function filePhoto(record: any, crop = record.cropSettings, caption = record.caption || '') {
  return {
    url: `/api/elementary-monthly/photo-stream/${record.fileId}`, driveFileId: record.fileId,
    folderId: record.folderId, fileName: record.fileName, mimeType: record.mimeType,
    fileSize: record.fileSize, version: record.version, caption, cropSettings: validatePhotoCrop(crop),
    uploadedBy: record.uploadedBy, uploadedByName: record.uploadedByName || '', uploadedAt: record.uploadedAt
  };
}

export function createElementaryMonthlyPhotoService(deps: MonthlyPhotoDependencies) {
  const now = deps.now || Date.now;
  const db = () => {
    const value = deps.getDb();
    if (!value) throw new PhotoHttpError(503, 'PHOTO_STORAGE_UNAVAILABLE', 'Penyimpanan metadata foto belum tersedia.', { retryable: true });
    return value;
  };
  const drive = () => deps.getDrive();

  async function authenticate(authorization: unknown): Promise<MonthlyPhotoActor> {
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) throw new PhotoHttpError(401, 'PHOTO_AUTH_REQUIRED', 'Silakan masuk kembali untuk mengakses foto.');
    let token: { uid: string; email?: string };
    try { token = await deps.verifyIdToken(authorization.slice(7)); } catch { throw new PhotoHttpError(401, 'PHOTO_AUTH_INVALID', 'Sesi login tidak valid atau telah berakhir.'); }
    const snapshot = await db().collection('users').doc(token.uid).get();
    const profile = docData(snapshot);
    if (!profile || profile.status !== 'active') throw new PhotoHttpError(403, 'PHOTO_ACCESS_DENIED', 'Akun aktif diperlukan untuk mengakses foto.');
    return { uid: token.uid, email: token.email, name: String(profile.displayName || profile.name || token.uid), profile };
  }

  async function historicalIdentity(input: any, staffAccess: boolean): Promise<any | null> {
    const reference = db().collection(REPORTS).doc(photoReportId(input));
    const report = docData(await reference.get());
    const published = (item: any) => sameScope(item, input) && item.status === 'PUBLISHED' && (staffAccess || item.deliveryStatus === 'SENT');
    let proof = published(report) ? report : null;
    if (!proof && staffAccess) {
      const versions = await reference.collection('versions').get();
      proof = versions.docs.map((item: any) => item.data()).find(published) || null;
      if (!proof) {
        const state = docData(await db().collection('elem_monthly_publication_states').doc(photoReportId(input)).get());
        if (typeof state?.pendingOperationId === 'string' && state.pendingOperationId && !state.pendingOperationId.includes('/')) {
          const pending = docData(await db().collection('elem_monthly_publication_jobs').doc(state.pendingOperationId).get());
          if (sameScope(pending, input) && ['PREPARED', 'UPLOADING', 'UPLOADED', 'RECOVERABLE'].includes(pending.status)) proof = pending;
        }
      }
    }
    return proof ? { ...(proof.reportSnapshot?.student || {}), name: proof.studentNameSnapshot || proof.reportSnapshot?.student?.name || input.studentId } : null;
  }

  async function authorizeScope(actor: MonthlyPhotoActor, input: Record<string, any>, options: { write?: boolean; studentRequired?: boolean } = {}): Promise<MonthlyPhotoScope> {
    if (!actor?.uid || actor.profile?.status !== 'active') throw new PhotoHttpError(403, 'PHOTO_ACCESS_DENIED', 'Akun aktif diperlukan.');
    const period = validatePhotoPeriod(input);
    const classId = requireDocumentId(input.classId, 'Kelas');
    const studentId = options.studentRequired === false && !input.studentId ? '' : requireDocumentId(input.studentId, 'Siswa');
    const classSnapshot = await db().collection('classes').doc(classId).get();
    const classData = docData(classSnapshot);
    if (!classData || String(classData.unitId || classData.unit || '').toUpperCase() !== 'ELEMENTARY' || !sameYear(classData.academicYear, period.academicYear)) throw new PhotoHttpError(403, 'PHOTO_SCOPE_DENIED', 'Kelas dan tahun ajaran tidak sesuai.');
    const explicitGrade = classData.grade ?? classData.gradeLevel;
    const legacyGrade = String(classData.name || '').match(/^(?:(?:grade|class|kelas)\s*[:.-]?\s*)?([1-6])(?:\s|[-–—.]|[a-z]\b|$)/i);
    const gradeLevel = explicitGrade !== undefined && explicitGrade !== null && String(explicitGrade).trim() !== ''
      ? Number(explicitGrade) : legacyGrade ? Number(legacyGrade[1]) : NaN;
    if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 6) throw new PhotoHttpError(403, 'PHOTO_SCOPE_DENIED', 'Kelas Elementary tidak valid.');
    if (options.write && classData.status !== 'active') throw new PhotoHttpError(403, 'PHOTO_CLASS_ARCHIVED', 'Foto pada kelas arsip hanya dapat dibaca.');
    const staffAccess = canManageMonthlyPhotoClass(actor, classData);
    let studentData: Record<string, any> = {};
    if (studentId) {
      const snapshot = await db().collection('students').doc(studentId).get();
      studentData = docData(snapshot);
      let historical: any = null;
      if (!studentData && !options.write) {
        historical = await historicalIdentity({ classId, studentId, ...period }, staffAccess);
        studentData = historical;
      }
      if (!studentData) throw new PhotoHttpError(404, 'PHOTO_STUDENT_NOT_FOUND', 'Data siswa tidak ditemukan.');
      const enrollments = await db().collection('enrollments').where('studentId', '==', studentId).get();
      const keys = [classId, classData.classId, classData.name].filter(Boolean);
      const matching = enrollments.docs.map((item: any) => item.data()).filter((item: any) => keys.includes(item.classId) && sameYear(item.academicYear, period.academicYear));
      const active = (item: any) => item.status === undefined || String(item.status).toLowerCase() === 'active';
      const direct = studentData.classId === classId
        ? !studentData.academicYear || sameYear(studentData.academicYear, period.academicYear)
        : keys.includes(studentData.classId) && sameYear(studentData.academicYear, period.academicYear);
      const enrollmentAllowed = matching.length ? matching.some((item: any) => !options.write || active(item)) : direct && (!options.write || active(studentData));
      if (!enrollmentAllowed && !options.write && !historical) historical = await historicalIdentity({ classId, studentId, ...period }, staffAccess);
      if (!enrollmentAllowed && !historical) throw new PhotoHttpError(403, 'PHOTO_STUDENT_SCOPE_DENIED', 'Siswa tidak terdaftar pada kelas dan tahun ajaran ini.');
      if (!staffAccess && !options.write) {
        const ids = [studentId, studentData.nis, studentData.nisn, studentData.luminaId].filter(Boolean).map(value => String(value).toLowerCase());
        const role = String(actor.profile.role || '').toUpperCase();
        let permitted = role === 'STUDENT' && [actor.uid, actor.profile.luminaId, actor.profile.studentId].some(value => value && ids.includes(String(value).toLowerCase()));
        if (role === 'PARENT') {
          const linked = Array.isArray(actor.profile.linkedStudents) ? [...actor.profile.linkedStudents] : [];
          if (actor.email) {
            const link = docData(await db().collection('parentStudentLinks').doc(actor.email.toLowerCase()).get());
            if (Array.isArray(link?.studentIds)) linked.push(...link.studentIds);
          }
          permitted = linked.some(value => ids.includes(String(value).toLowerCase()));
        }
        if (!permitted) throw new PhotoHttpError(403, 'PHOTO_SCOPE_DENIED', 'Anda tidak memiliki akses pada siswa ini.');
      }
    }
    if ((!studentId || options.write) && !staffAccess) throw new PhotoHttpError(403, 'PHOTO_SCOPE_DENIED', 'Anda tidak ditugaskan pada kelas ini.');
    return {
      classId, studentId, ...period, className: String(classData.name || classId),
      studentName: String(studentData.name || studentData.fullName || studentId), gradeLevel,
      gradeCategory: gradeLevel <= 3 ? 'Lower Grade' : 'Upper Grade',
      photoDocId: studentId ? photoDocumentId({ classId, studentId, ...period }) : '',
      classData, studentData, staffAccess
    };
  }

  async function getDriveMetadata(fileId: string) {
    const result = await drive().files.get({ fileId, supportsAllDrives: true, fields: 'id,name,mimeType,parents,trashed,size,md5Checksum,appProperties,driveId,capabilities(canAddChildren,canEdit)' });
    return result.data;
  }

  async function assertPhotoRootAncestry(fileId: string): Promise<any[]> {
    const chain: any[] = [];
    let currentId = fileId;
    const seen = new Set<string>();
    for (let depth = 0; depth < 12; depth++) {
      if (seen.has(currentId)) break;
      seen.add(currentId);
      const metadata = await getDriveMetadata(currentId);
      if (!metadata?.id || metadata.trashed) throw new PhotoHttpError(409, 'PHOTO_FILE_UNAVAILABLE', 'File atau folder foto sudah tidak tersedia.');
      chain.push(metadata);
      if (currentId === MONTHLY_PHOTO_ROOT) {
        if (metadata.mimeType !== FOLDER_MIME) throw new PhotoHttpError(409, 'PHOTO_ROOT_INVALID', 'Root foto bukan folder.');
        return chain;
      }
      if (!Array.isArray(metadata.parents) || metadata.parents.length !== 1) break;
      currentId = metadata.parents[0];
    }
    throw new PhotoHttpError(403, 'PHOTO_ROOT_MISMATCH', 'Referensi foto berada di luar root foto Elementary.');
  }

  async function verifyRoot(rootFolderId = MONTHLY_PHOTO_ROOT) {
    if (rootFolderId !== MONTHLY_PHOTO_ROOT) throw new PhotoHttpError(400, 'PHOTO_ROOT_MISMATCH', 'Root foto tidak dapat diganti melalui request.');
    const metadata = await getDriveMetadata(rootFolderId);
    if (metadata.trashed || metadata.mimeType !== FOLDER_MIME) throw new PhotoHttpError(409, 'PHOTO_ROOT_INVALID', 'Root foto tidak tersedia sebagai folder.');
    if (metadata.capabilities?.canAddChildren === false) throw new PhotoHttpError(403, 'PHOTO_ROOT_READ_ONLY', 'Akun server tidak memiliki izin menambahkan foto di root foto.');
    return { ok: true, id: metadata.id, name: metadata.name, driveId: metadata.driveId, capabilities: metadata.capabilities || {} };
  }

  async function generatedDriveId(): Promise<string> {
    const response = await drive().files.generateIds({ count: 1, space: 'drive', type: 'files' });
    const id = response.data.ids?.[0];
    if (!id) throw new PhotoHttpError(503, 'PHOTO_ID_RESERVATION_FAILED', 'ID file Drive belum dapat disiapkan.', { retryable: true });
    return id;
  }

  async function listFolders(name: string, parentId: string, driveId?: string): Promise<any[]> {
    const files: any[] = [];
    let pageToken: string | undefined;
    do {
      const response = await drive().files.list({
        q: `name = '${escapeDrive(name)}' and '${escapeDrive(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
        supportsAllDrives: true, includeItemsFromAllDrives: true,
        corpora: driveId ? 'drive' : 'user', ...(driveId ? { driveId } : {}),
        pageSize: 100, ...(pageToken ? { pageToken } : {}), fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed)'
      });
      if (response.data.incompleteSearch) throw new PhotoHttpError(503, 'PHOTO_FOLDER_SEARCH_INCOMPLETE', 'Pencarian folder Drive belum lengkap. Coba lagi.', { retryable: true });
      files.push(...(response.data.files || []));
      if (files.length > 1) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', `Terdapat folder ganda bernama "${name}" pada parent yang sama. Minta administrator menyelesaikan konflik ini.`);
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    return files;
  }

  async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const parent = (await assertPhotoRootAncestry(parentId))[0];
    if (parent.mimeType !== FOLDER_MIME) throw new PhotoHttpError(409, 'PHOTO_FOLDER_INVALID', 'Parent foto bukan folder.');
    const matches = await listFolders(name, parentId, parent.driveId);
    const manifestRef = db().collection(FOLDER_KEYS).doc(photoHash(`${parentId}\u0000${name}`));
    const candidate = matches[0]?.id || (docData(await manifestRef.get())?.folderId) || await generatedDriveId();
    const folderId = await db().runTransaction(async (transaction: any) => {
      const previous = docData(await transaction.get(manifestRef));
      if (previous && (previous.parentId !== parentId || previous.name !== name || previous.rootFolderId !== MONTHLY_PHOTO_ROOT)) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Pemetaan folder tidak sesuai.');
      if (previous?.folderId && matches[0]?.id && previous.folderId !== matches[0].id) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Folder yang ditemukan berbeda dari ID folder yang sudah dicatat.');
      const id = previous?.folderId || candidate;
      if (!previous) transaction.set(manifestRef, { folderId: id, parentId, name, rootFolderId: MONTHLY_PHOTO_ROOT, createdAt: now() });
      return id;
    });
    let metadata: any;
    try { metadata = await getDriveMetadata(folderId); } catch (error) { if (!isNotFound(error)) throw error; }
    if (!metadata) {
      try {
        const response = await drive().files.create({ requestBody: { id: folderId, name, parents: [parentId], mimeType: FOLDER_MIME }, supportsAllDrives: true, fields: 'id,name,mimeType,parents,trashed' });
        metadata = response.data;
      } catch {
        // The generated ID was persisted before create; recover a lost response or 409 by ID.
        try { metadata = await getDriveMetadata(folderId); } catch { throw new PhotoHttpError(503, 'PHOTO_FOLDER_PENDING', 'Pembuatan folder belum terkonfirmasi. Ulangi operasi yang sama.', { retryable: true }); }
      }
    }
    if (metadata.trashed || metadata.mimeType !== FOLDER_MIME || metadata.name !== name || metadata.parents?.length !== 1 || metadata.parents[0] !== parentId) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Folder yang dicatat telah dipindahkan atau diubah. Tidak ada folder pengganti yang dibuat otomatis.');
    const finalMatches = await listFolders(name, parentId, parent.driveId);
    if (finalMatches[0] && finalMatches[0].id !== folderId) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Folder berbeda ditemukan pada parent yang sama.');
    return folderId;
  }

  async function resolveFolder(scope: MonthlyPhotoScope) {
    const normalizedYear = scope.normalizedYear || (scope.academicYear ? normalizedPhotoYear(scope.academicYear) : '2025-2026');
    const gradeCategory = scope.gradeCategory || ((scope.gradeLevel || 1) <= 3 ? 'Lower Grade' : 'Upper Grade');
    const folderKey = `${normalizedYear}_${gradeCategory.replace(/\s+/g, '_')}_${scope.classId}_${scope.studentId}_${scope.month}`;
    const mappingRef = db().collection('elem_monthly_drive_folders').doc(folderKey);
    const previous = docData(await mappingRef.get());
    const className = cleanName(previous?.className || scope.className) || scope.classId;
    const studentName = cleanName(previous?.studentName || scope.studentName);
    const names = [normalizedYear, gradeCategory, className, `${studentName} - ${className} - ${scope.studentId}`, scope.month];
    if (previous?.folderId) {
      if (previous.rootFolderId !== MONTHLY_PHOTO_ROOT || previous.classId !== scope.classId || previous.studentId !== scope.studentId || previous.month !== scope.month) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Pemetaan folder foto tidak sesuai konteks siswa.');
      const chain = await assertPhotoRootAncestry(previous.folderId);
      if (chain.length !== names.length + 1 || names.some((name, index) => chain[names.length - 1 - index]?.name !== name || chain[names.length - 1 - index]?.mimeType !== FOLDER_MIME)) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Jalur folder foto tersimpan telah berubah. Periksa folder sebelum melanjutkan.');
    }
    await verifyRoot();
    let folderId = MONTHLY_PHOTO_ROOT;
    for (const name of names) folderId = await findOrCreateFolder(name, folderId);
    if (previous?.folderId && previous.folderId !== folderId) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Jalur foto berbeda dari folder yang sudah dicatat.');
    const folderPath = `/${names.join('/')}`;
    await mappingRef.set({ folderKey, folderId, folderPath, rootFolderId: MONTHLY_PHOTO_ROOT,
      classId: scope.classId, className, studentId: scope.studentId, studentName,
      academicYear: normalizedYear, gradeCategory, month: scope.month,
      createdAt: previous?.createdAt || now(), updatedAt: now()
    }, { merge: true });
    return { folderId, folderPath, folderKey };
  }

  async function scopedPhotoDocuments(scope: MonthlyPhotoScope) {
    const reportRef = db().collection(REPORTS).doc(photoReportId(scope));
    const [photoSnapshot, reportSnapshot] = await Promise.all([
      db().collection(PHOTO_DOCS).doc(scope.photoDocId).get(), reportRef.get()
    ]);
    const photoDoc = docData(photoSnapshot);
    const report = docData(reportSnapshot);
    const records: any[] = [];
    if (scope.staffAccess && sameScope(photoDoc, scope)) records.push({ photos: photoDoc, kind: 'draft' });
    if (sameScope(report, scope) && report.status === 'PUBLISHED' && (scope.staffAccess || report.deliveryStatus === 'SENT')) records.push({ photos: report.reportSnapshot?.photos, kind: 'published' });
    if (scope.staffAccess) {
      const [versions, stateSnapshot] = await Promise.all([
        reportRef.collection('versions').get(), db().collection('elem_monthly_publication_states').doc(photoReportId(scope)).get()
      ]);
      for (const version of versions.docs) {
        const data = version.data();
        if (sameScope(data, scope) && data.status === 'PUBLISHED') records.push({ photos: data.reportSnapshot?.photos, kind: 'published' });
      }
      const pendingId = docData(stateSnapshot)?.pendingOperationId;
      if (typeof pendingId === 'string' && pendingId && !pendingId.includes('/')) {
        const pending = docData(await db().collection('elem_monthly_publication_jobs').doc(pendingId).get());
        if (sameScope(pending, scope) && ['PREPARED', 'UPLOADING', 'UPLOADED', 'RECOVERABLE'].includes(pending.status)) records.push({ photos: pending.reportSnapshot?.photos, kind: 'pending' });
      }
    }
    return { records, photoDoc };
  }

  async function authorizedFile(actor: MonthlyPhotoActor, fileId: string, input: Record<string, any>) {
    if (!/^[A-Za-z0-9_-]{5,200}$/.test(fileId || '')) throw new PhotoHttpError(400, 'INVALID_FILE_ID', 'ID foto tidak valid.');
    const scope = await authorizeScope(actor, input, { write: false });
    const { records } = await scopedPhotoDocuments(scope);
    if (!records.some(record => photoReferences(record.photos).includes(fileId))) throw new PhotoHttpError(403, 'PHOTO_REFERENCE_DENIED', 'Foto tidak direferensikan oleh laporan siswa dan periode ini.');
    const record = docData(await db().collection(PHOTO_FILES).doc(fileId).get());
    if (record && (record.fileId !== fileId || record.rootFolderId !== MONTHLY_PHOTO_ROOT || !sameScope(record, scope, false))) throw new PhotoHttpError(403, 'PHOTO_FILE_SCOPE_DENIED', 'Metadata file foto tidak sesuai kelas dan periode laporan.');
    const chain = await assertPhotoRootAncestry(fileId);
    const metadata = chain[0];
    if (!IMAGE_TYPES.has(metadata.mimeType) || !Number(metadata.size)) throw new PhotoHttpError(415, 'PHOTO_NOT_IMAGE', 'Referensi foto bukan berkas gambar yang didukung.');
    if (record?.folderId && metadata.parents?.[0] !== record.folderId) throw new PhotoHttpError(409, 'PHOTO_FILE_MOVED', 'File foto telah dipindahkan dari folder yang dicatat.');
    if (record?.md5Checksum && metadata.md5Checksum !== record.md5Checksum) throw new PhotoHttpError(409, 'PHOTO_FILE_CHANGED', 'Isi file foto telah berubah sejak diunggah. Gunakan versi foto yang benar.');
    if (!record) {
      // Legacy references remain readable, but never authorize an arbitrary service-account file.
      if (chain.length !== 7 || chain[1].name !== scope.month || !sameYear(chain[5].name, scope.academicYear) || chain[4].name !== scope.gradeCategory || chain[3].name !== cleanName(scope.className)) throw new PhotoHttpError(403, 'PHOTO_LEGACY_SCOPE_DENIED', 'Foto lama tidak berada pada folder kelas dan periode yang sesuai.');
    }
    return { record: record || null, metadata, scope };
  }

  async function validateEditablePhoto(value: any, previous: any, scope: MonthlyPhotoScope, identity: boolean, actor: MonthlyPhotoActor) {
    if (identity && value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PhotoHttpError(400, 'INVALID_PHOTO', 'Data foto tidak valid.');
    const caption = identity ? '' : photoCaption(value.caption);
    const crop = validatePhotoCrop(value.cropSettings ?? previous?.cropSettings);
    const url = typeof value.url === 'string' ? value.url : '';
    const masterUrls = [scope.studentData.photoUrl, scope.studentData.photoURL].filter((source: any) => typeof source === 'string' && source);
    if (identity && url && masterUrls.includes(url) && !value.driveFileId) return { url, cropSettings: crop };
    const id = photoReferenceId(value);
    const previousId = photoReferenceId(previous);
    if (!id) {
      if (!url) return identity ? null : { index: value.index, url: '', caption, cropSettings: crop };
      if (previous?.url === url && !previousId) {
        // Existing legacy bytes/URLs may be retained unchanged; new permanent base64 is rejected.
        return { ...previous, ...(identity ? {} : { caption }), cropSettings: crop };
      }
      throw new PhotoHttpError(400, 'PHOTO_UPLOAD_REQUIRED', 'Unggah foto ke Drive sebelum menyimpan referensinya.');
    }
    const file = docData(await db().collection(PHOTO_FILES).doc(id).get());
    if (id === previousId && !file) {
      await authorizedFile(actor, id, scope);
      return { ...previous, ...(identity ? {} : { caption }), cropSettings: crop };
    }
    if (!file || file.rootFolderId !== MONTHLY_PHOTO_ROOT || !sameScope(file, scope, false) || (file.studentId !== scope.studentId && id !== previousId)) throw new PhotoHttpError(403, 'PHOTO_REFERENCE_DENIED', 'Referensi foto tidak dimiliki siswa ini. Gunakan Terapkan Bersama untuk membagikan foto.');
    const metadata = filePhoto(file, crop, caption);
    if (identity) { const { caption: omitted, ...result } = metadata; return result; }
    return { ...metadata, index: value.index };
  }

  async function save(actor: MonthlyPhotoActor, input: Record<string, any>) {
    const incoming = input.photoDoc;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new PhotoHttpError(400, 'INVALID_PHOTO', 'Dokumen foto diperlukan.');
    const scope = await authorizeScope(actor, incoming, { write: true });
    const expectedRevision = photoRevision(input.expectedRevision);
    const reference = db().collection(PHOTO_DOCS).doc(scope.photoDocId);
    const before = docData(await reference.get());
    assertPhotoDocumentScope(before, scope);
    if (currentPhotoRevision(before) !== expectedRevision) throw new PhotoHttpError(409, 'PHOTO_REVISION_CONFLICT', 'Foto telah diubah oleh pengguna lain. Muat ulang sebelum menyimpan.');
    const changes: any = {};
    if (Object.prototype.hasOwnProperty.call(incoming, 'identityPhoto')) {
      changes.identityPhoto = await validateEditablePhoto(incoming.identityPhoto, before?.identityPhoto || { url: before?.identityPhotoUrl || '' }, scope, true, actor);
      changes.identityPhotoUrl = changes.identityPhoto?.url || '';
    } else if (incoming.identityPhotoUrl !== undefined && incoming.identityPhotoUrl !== (before?.identityPhotoUrl || '')) {
      throw new PhotoHttpError(400, 'PHOTO_UPLOAD_REQUIRED', 'Perubahan foto identitas harus menyertakan metadata foto.');
    }
    if (incoming.snapshots !== undefined) {
      if (!Array.isArray(incoming.snapshots) || incoming.snapshots.length !== 3 || incoming.snapshots.some((item: any, index: number) => item?.index !== index)) throw new PhotoHttpError(400, 'INVALID_SNAPSHOTS', 'Snapshot harus berisi tepat tiga slot berurutan.');
      changes.snapshots = await Promise.all(incoming.snapshots.map((item: any, index: number) => validateEditablePhoto(item, before?.snapshots?.[index], scope, false, actor)));
    }
    if (incoming.albumLink !== undefined) changes.albumLink = photoAlbumLink(incoming.albumLink);
    const photoDoc = await db().runTransaction(async (transaction: any) => {
      const previous = docData(await transaction.get(reference));
      assertPhotoDocumentScope(previous, scope);
      if (currentPhotoRevision(previous) !== expectedRevision) throw new PhotoHttpError(409, 'PHOTO_REVISION_CONFLICT', 'Foto telah berubah selama proses simpan. Muat ulang data.');
      const next = { ...blankPhotoDoc(scope, previous, actor, now()), ...changes };
      transaction.set(reference, next);
      return next;
    });
    return { success: true, photoDoc, revision: photoDoc.revision };
  }

  async function upload(actor: MonthlyPhotoActor, input: Record<string, any>) {
    const scope = await authorizeScope(actor, input, { write: true });
    const operationId = requireOperationId(input.operationId);
    const slot = requirePhotoSlot(input.slot);
    const expectedRevision = photoRevision(input.expectedRevision);
    const image = decodeMonthlyPhotoDataUrl(input.base64);
    const cropSettings = validatePhotoCrop(input.cropSettings, 'contain');
    const caption = photoCaption(input.caption);
    const fingerprint = photoHash(stablePhotoJson({ classId: scope.classId, studentId: scope.studentId, academicYear: scope.normalizedYear, semester: scope.semester, month: scope.month, slot, sha256: image.sha256, caption, cropSettings }));
    const operationRef = db().collection(OPERATIONS).doc(operationId);
    const photoRef = db().collection(PHOTO_DOCS).doc(scope.photoDocId);
    const counterRef = db().collection(COUNTERS).doc(photoHash(`${scope.photoDocId}\u0000${slot}`));
    let operation = docData(await operationRef.get());
    const validateOperation = (value: any) => {
      if (value.actorUid !== actor.uid || value.fingerprint !== fingerprint || value.photoDocId !== scope.photoDocId) throw new PhotoHttpError(409, 'PHOTO_OPERATION_CONFLICT', 'ID operasi sudah dipakai untuk upload yang berbeda.');
    };
    if (operation) validateOperation(operation);
    if (!operation) {
      const generatedId = await generatedDriveId();
      const oldFiles = await db().collection(PHOTO_FILES).where('studentId', '==', scope.studentId).get();
      const historicalVersion = oldFiles.docs.reduce((max: number, item: any) => {
        const file = item.data();
        return sameScope(file, scope) && file.slot === slot && Number.isSafeInteger(file.version) ? Math.max(max, file.version) : max;
      }, 0);
      operation = await db().runTransaction(async (transaction: any) => {
        const [opSnapshot, photoSnapshot, counterSnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(photoRef), transaction.get(counterRef)]);
        const existing = docData(opSnapshot);
        if (existing) { validateOperation(existing); return existing; }
        const previous = docData(photoSnapshot);
        assertPhotoDocumentScope(previous, scope);
        if (currentPhotoRevision(previous) !== expectedRevision) throw new PhotoHttpError(409, 'PHOTO_REVISION_CONFLICT', 'Foto telah berubah. Muat ulang sebelum mengganti foto.');
        const version = Math.max(historicalVersion, Number(docData(counterSnapshot)?.version) || 0, Number(photoSlot(previous, slot)?.version) || 0) + 1;
        const createdAt = now();
        const ext = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const next = {
          operationId, fingerprint, actorUid: actor.uid, actorName: actor.name,
          classId: scope.classId, studentId: scope.studentId, academicYear: scope.academicYear,
          semester: scope.semester, month: scope.month, photoDocId: scope.photoDocId,
          slot, version, fileId: generatedId, mimeType: image.mimeType, fileSize: image.byteSize,
          width: image.width, height: image.height, sha256: image.sha256, md5Checksum: image.md5Checksum,
          caption, cropSettings, expectedRevision, baseSlotFingerprint: photoHash(stablePhotoJson(photoSlot(previous, slot))),
          fileName: `${cleanName(scope.studentName)} - ${cleanName(scope.className) || scope.classId} - ${slot} - v${version}_${createdAt}_${operationId.slice(0, 8)}.${ext}`,
          status: 'RESERVED', createdAt, updatedAt: createdAt
        };
        transaction.set(operationRef, next);
        transaction.set(counterRef, { version, photoDocId: scope.photoDocId, slot, updatedAt: createdAt });
        return next;
      });
    }
    if (operation.status === 'COMMITTED') {
      const photoDoc = docData(await photoRef.get());
      assertPhotoDocumentScope(photoDoc, scope);
      return { success: true, photo: operation.photo, photoDoc, revision: currentPhotoRevision(photoDoc), operationId, recovered: true };
    }
    const folder = await resolveFolder(scope);
    if (operation.folderId && operation.folderId !== folder.folderId) throw new PhotoHttpError(409, 'PHOTO_FOLDER_CONFLICT', 'Folder operasi upload telah berubah.');
    if (!operation.folderId) {
      await operationRef.set({ folderId: folder.folderId, folderPath: folder.folderPath, updatedAt: now() }, { merge: true });
      operation = { ...operation, folderId: folder.folderId, folderPath: folder.folderPath };
    }
    let metadata: any;
    try { metadata = await getDriveMetadata(operation.fileId); } catch (error) { if (!isNotFound(error)) throw error; }
    if (!metadata) {
      try {
        const result = await drive().files.create({
          requestBody: { id: operation.fileId, name: operation.fileName, parents: [operation.folderId], mimeType: image.mimeType,
            appProperties: { luminaPhotoOperationId: operationId, luminaPhotoSha256: image.sha256, luminaPhotoRoot: MONTHLY_PHOTO_ROOT } },
          media: { mimeType: image.mimeType, body: Readable.from(image.buffer) }, supportsAllDrives: true,
          fields: 'id,name,mimeType,parents,trashed,size,md5Checksum,appProperties'
        });
        metadata = result.data;
      } catch {
        try { metadata = await getDriveMetadata(operation.fileId); } catch {
          throw new PhotoHttpError(503, 'PHOTO_UPLOAD_PENDING', 'Hasil upload belum dapat dikonfirmasi. Ulangi operasi yang sama agar tidak membuat file ganda.', { operationId, driveFileId: operation.fileId, retryable: true });
        }
      }
    }
    if (!metadata?.id || metadata.id !== operation.fileId || metadata.trashed || metadata.parents?.length !== 1 || metadata.parents[0] !== operation.folderId || metadata.mimeType !== image.mimeType || Number(metadata.size) !== image.byteSize || metadata.md5Checksum !== image.md5Checksum || metadata.appProperties?.luminaPhotoOperationId !== operationId) throw new PhotoHttpError(409, 'PHOTO_UPLOAD_CONTENT_CONFLICT', 'File Drive tidak cocok dengan operasi upload yang dicatat. File tidak ditimpa.', { operationId, driveFileId: operation.fileId });
    const record = {
      fileId: operation.fileId, folderId: operation.folderId, rootFolderId: MONTHLY_PHOTO_ROOT,
      fileName: operation.fileName, mimeType: image.mimeType, fileSize: image.byteSize,
      sha256: image.sha256, md5Checksum: image.md5Checksum, width: image.width, height: image.height,
      version: operation.version, slot, studentId: scope.studentId, studentName: scope.studentName,
      classId: scope.classId, className: scope.className, academicYear: scope.academicYear,
      semester: scope.semester, month: scope.month, folderPath: operation.folderPath,
      photoDocId: scope.photoDocId, operationId, caption, cropSettings,
      uploadedBy: actor.uid, uploadedByName: actor.name, uploadedAt: operation.createdAt
    };
    const photo = { ...filePhoto(record), slot, streamUrl: `/api/elementary-monthly/photo-stream/${record.fileId}` };
    try {
      const result = await db().runTransaction(async (transaction: any) => {
        const [operationSnapshot, photoSnapshot, fileSnapshot] = await Promise.all([
          transaction.get(operationRef), transaction.get(photoRef), transaction.get(db().collection(PHOTO_FILES).doc(record.fileId))
        ]);
        const latestOperation = docData(operationSnapshot);
        if (!latestOperation) throw new PhotoHttpError(409, 'PHOTO_OPERATION_CONFLICT', 'Catatan operasi upload tidak ditemukan.');
        validateOperation(latestOperation);
        const previous = docData(photoSnapshot);
        assertPhotoDocumentScope(previous, scope);
        if (latestOperation.status === 'COMMITTED') return { photoDoc: previous, recovered: true };
        if (fileSnapshot.exists && docData(fileSnapshot)?.operationId !== operationId) throw new PhotoHttpError(409, 'PHOTO_FILE_CONFLICT', 'File sudah terdaftar pada operasi lain.');
        const currentRevision = currentPhotoRevision(previous);
        const sameSlot = photoHash(stablePhotoJson(photoSlot(previous, slot))) === operation.baseSlotFingerprint;
        if (currentRevision !== operation.expectedRevision && !sameSlot && expectedRevision !== currentRevision) throw new PhotoHttpError(409, 'PHOTO_REVISION_CONFLICT', 'File telah diunggah, tetapi foto slot ini sudah berubah. Muat ulang dan konfirmasi penggantian sebelum memulihkan operasi yang sama.', { operationId, driveFileId: record.fileId, retryable: true });
        const photoDoc = blankPhotoDoc(scope, previous, actor, now());
        if (slot === 'profile') {
          const { caption: omitted, ...identityPhoto } = filePhoto(record);
          photoDoc.identityPhoto = identityPhoto;
          photoDoc.identityPhotoUrl = identityPhoto.url;
        } else {
          const index = Number(slot.slice(-1)) - 1;
          photoDoc.snapshots[index] = { ...filePhoto(record), index };
        }
        transaction.set(db().collection(PHOTO_FILES).doc(record.fileId), record);
        transaction.set(photoRef, photoDoc);
        transaction.set(operationRef, { status: 'COMMITTED', photo, committedRevision: photoDoc.revision, updatedAt: now() }, { merge: true });
        return { photoDoc, recovered: false };
      });
      return { success: true, photo, photoDoc: result.photoDoc, revision: currentPhotoRevision(result.photoDoc), operationId, recovered: result.recovered };
    } catch (error) {
      if (error instanceof PhotoHttpError) throw error;
      throw new PhotoHttpError(503, 'PHOTO_METADATA_PENDING', 'Foto sudah berada di Drive, tetapi metadata belum tersimpan. Ulangi operasi yang sama untuk memulihkan tanpa upload ganda.', { operationId, driveFileId: record.fileId, retryable: true });
    }
  }

  async function bulk(actor: MonthlyPhotoActor, input: Record<string, any>) {
    const sourceStudentId = requireDocumentId(input.sourceStudentId, 'Siswa sumber');
    const sourceScope = await authorizeScope(actor, { ...input, studentId: sourceStudentId }, { write: true });
    const sourceRevision = photoRevision(input.sourceRevision, 'Revisi foto sumber');
    if (!Array.isArray(input.targetStudentIds) || !input.targetStudentIds.length || input.targetStudentIds.length > 200) throw new PhotoHttpError(400, 'INVALID_TARGETS', 'Pilih 1–200 siswa tujuan.');
    const targets = [...new Set<string>(input.targetStudentIds.map((id: unknown) => requireDocumentId(id, 'Siswa tujuan')))];
    const indices = [...new Set<number>(Array.isArray(input.snapshotIndices) ? input.snapshotIndices : [])];
    if (indices.some(index => !Number.isInteger(index) || index < 0 || index > 2) || (!indices.length && input.applyAlbumLink !== true)) throw new PhotoHttpError(400, 'INVALID_SNAPSHOTS', 'Pilih slot snapshot atau link album yang akan diterapkan.');
    const overwrite = input.overwriteExisting === true;
    if (overwrite && input.replacementConfirmed !== true) throw new PhotoHttpError(400, 'PHOTO_REPLACEMENT_CONFIRMATION_REQUIRED', 'Konfirmasi penggantian foto individual diperlukan.');
    const scopes = await Promise.all(targets.map(studentId => authorizeScope(actor, { ...input, studentId }, { write: true })));
    for (const target of targets) photoRevision(input.expectedRevisions?.[target], `Revisi foto siswa ${target}`);
    const sourceRef = db().collection(PHOTO_DOCS).doc(sourceScope.photoDocId);
    const sourceBefore = docData(await sourceRef.get());
    assertPhotoDocumentScope(sourceBefore, sourceScope);
    if (!sourceBefore || currentPhotoRevision(sourceBefore) !== sourceRevision) throw new PhotoHttpError(409, 'PHOTO_SOURCE_CHANGED', 'Foto sumber telah berubah. Simpan dan muat ulang sebelum menerapkan bersama.');
    for (const index of indices) {
      const id = photoReferenceId(sourceBefore.snapshots?.[index]);
      if (!id) throw new PhotoHttpError(400, 'PHOTO_UPLOAD_REQUIRED', 'Semua snapshot sumber yang dipilih harus sudah diunggah ke Drive.');
      await authorizedFile(actor, id, sourceScope);
    }
    const result = await db().runTransaction(async (transaction: any) => {
      const references = scopes.map(scope => db().collection(PHOTO_DOCS).doc(scope.photoDocId));
      const snapshots = await Promise.all([transaction.get(sourceRef), ...references.map(ref => transaction.get(ref))]);
      const source = docData(snapshots[0]);
      assertPhotoDocumentScope(source, sourceScope);
      if (!source || currentPhotoRevision(source) !== sourceRevision) throw new PhotoHttpError(409, 'PHOTO_SOURCE_CHANGED', 'Foto sumber telah berubah selama proses. Tidak ada data siswa yang ditimpa.');
      const skipped: { studentId: string; index: number; reason: string }[] = [];
      const photoDocs: Record<string, any> = {};
      const writes: { reference: any; document: any }[] = [];
      scopes.forEach((scope, position) => {
        const previous = docData(snapshots[position + 1]);
        assertPhotoDocumentScope(previous, scope);
        if (currentPhotoRevision(previous) !== input.expectedRevisions[scope.studentId]) throw new PhotoHttpError(409, 'PHOTO_REVISION_CONFLICT', 'Salah satu foto siswa tujuan telah berubah. Muat ulang semua tujuan sebelum mencoba lagi.', { studentId: scope.studentId });
        if (scope.studentId === sourceStudentId) { photoDocs[scope.studentId] = source; return; }
        const next = blankPhotoDoc(scope, previous, actor, now());
        let changed = false;
        for (const index of indices) {
          const incoming = source.snapshots[index];
          const existing = previous?.snapshots?.[index];
          const occupied = !!(existing?.url || existing?.driveFileId || existing?.caption);
          const equal = stablePhotoJson(existing || null) === stablePhotoJson(incoming);
          if (equal) continue;
          if (occupied && !overwrite) { skipped.push({ studentId: scope.studentId, index, reason: 'Foto atau caption individual dipertahankan.' }); continue; }
          next.snapshots[index] = { ...incoming, index, sharedFromStudentId: sourceStudentId, sharedFromRevision: sourceRevision };
          changed = true;
        }
        if (input.applyAlbumLink === true) {
          const link = photoAlbumLink(source.albumLink);
          if (link !== (previous?.albumLink || '')) {
            if (previous?.albumLink && !overwrite) skipped.push({ studentId: scope.studentId, index: -1, reason: 'Link album individual dipertahankan.' });
            else { next.albumLink = link; changed = true; }
          }
        }
        if (changed) { writes.push({ reference: references[position], document: next }); photoDocs[scope.studentId] = next; }
        else if (previous) photoDocs[scope.studentId] = previous;
      });
      for (const write of writes) transaction.set(write.reference, write.document);
      return { count: writes.length, photoDocs, skipped };
    });
    return { success: true, ...result };
  }

  return { authenticate, authorizeScope, verifyRoot, findOrCreateFolder, resolveFolder, authorizedFile, save, upload, bulk, getDriveMetadata };
}

let defaultService: ReturnType<typeof createElementaryMonthlyPhotoService> | undefined;
function photoService() {
  if (!defaultService) defaultService = createElementaryMonthlyPhotoService({
    getDb: getMonthlyPhotoDb, getDrive: getGoogleDriveClient,
    verifyIdToken: async token => { getMonthlyPhotoDb(); return getAuth().verifyIdToken(token, true); }
  });
  return defaultService;
}

export function authenticateMonthlyPhotoRequest(req: Pick<Request, 'headers'>) { return photoService().authenticate(req.headers.authorization); }
export function authorizeMonthlyPhotoScope(actor: MonthlyPhotoActor, input: Record<string, any>, options: { write?: boolean; studentRequired?: boolean } = {}) { return photoService().authorizeScope(actor, input, options); }
export function getAuthorizedMonthlyPhotoFile(actor: MonthlyPhotoActor, fileId: string, input: Record<string, any>) { return photoService().authorizedFile(actor, fileId, input); }
export function verifyRootFolderAccess(rootFolderId = MONTHLY_PHOTO_ROOT) { return photoService().verifyRoot(rootFolderId); }
export function findOrCreateDriveFolder(name: string, parentId: string) { return photoService().findOrCreateFolder(name, parentId); }
export async function resolveStudentMonthlyDriveFolder(scope: MonthlyPhotoScope) { return photoService().resolveFolder(scope); }
export async function uploadStudentMonthlyPhoto(input: Record<string, any>, actor?: MonthlyPhotoActor) {
  const effectiveActor: MonthlyPhotoActor = actor || {
    uid: input.uploadedBy || 'system_test_user',
    name: input.uploadedByName || 'Guru',
    profile: { role: 'SUPER_ADMIN', status: 'active' }
  };
  return photoService().upload(effectiveActor, input);
}
export async function isElementaryPhotoAuthorized(fileId: string, actor?: MonthlyPhotoActor, scope?: Record<string, any>): Promise<boolean> {
  if (!actor || !scope) return false;
  try { await getAuthorizedMonthlyPhotoFile(actor, fileId, scope); return true; } catch { return false; }
}

function sendPhotoError(res: Response, error: unknown) {
  if (res.headersSent) { res.destroy(); return; }
  if (error instanceof PhotoHttpError) {
    res.status(error.status).json({ success: false, error: error.message, code: error.code, ...error.details });
    return;
  }
  res.status(503).json({ success: false, code: 'PHOTO_SERVICE_UNAVAILABLE', error: 'Layanan foto belum dapat menyelesaikan permintaan. Coba lagi; jangan mengganti ID operasi upload yang sama.', retryable: true });
}

export async function streamElementaryMonthlyPhoto(req: Request, res: Response) {
  try {
    const actor = await authenticateMonthlyPhotoRequest(req);
    const { metadata } = await getAuthorizedMonthlyPhotoFile(actor, String(req.params.fileId), req.query);
    const response = await getGoogleDriveClient().files.get({ fileId: metadata.id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (metadata.size) res.setHeader('Content-Length', metadata.size);
    const onClose = () => { if (!res.writableFinished) response.data.destroy(); };
    res.once('close', onClose);
    try { await pipeline(response.data, res); } finally { res.off('close', onClose); }
  } catch (error) { sendPhotoError(res, error); }
}

export const elementaryMonthlyPhotoRouter = express.Router();
elementaryMonthlyPhotoRouter.post('/verify-root', async (req: Request, res: Response) => {
  try {
    const actor = await authenticateMonthlyPhotoRequest(req);
    await authorizeMonthlyPhotoScope(actor, req.body || {}, { write: true, studentRequired: false });
    res.json({ success: true, ...await verifyRootFolderAccess() });
  } catch (error) { sendPhotoError(res, error); }
});
elementaryMonthlyPhotoRouter.post('/upload-photo', async (req: Request, res: Response) => {
  try { res.json(await photoService().upload(await authenticateMonthlyPhotoRequest(req), req.body || {})); } catch (error) { sendPhotoError(res, error); }
});
elementaryMonthlyPhotoRouter.post('/save-photos', async (req: Request, res: Response) => {
  try { res.json(await photoService().save(await authenticateMonthlyPhotoRequest(req), req.body || {})); } catch (error) { sendPhotoError(res, error); }
});
elementaryMonthlyPhotoRouter.post('/bulk-photos', async (req: Request, res: Response) => {
  try { res.json(await photoService().bulk(await authenticateMonthlyPhotoRequest(req), req.body || {})); } catch (error) { sendPhotoError(res, error); }
});
elementaryMonthlyPhotoRouter.get('/photo-stream/:fileId', streamElementaryMonthlyPhoto);
