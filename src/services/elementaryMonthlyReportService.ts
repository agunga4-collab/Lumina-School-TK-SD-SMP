import { normalizeAcademicYear, buildMonthlyCurriculumDocId, buildMonthlyStudentScoreDocId, formatMonthLabel, getMonthOptionsForAcademicYear, buildMonthlyProjectDocId, buildMonthlyStudentPhotoDocId, buildMonthlyStudentNarrativeDocId, isElementaryHeadOrSuperAdmin, computeStudentScoresHash, buildMonthlyAttendanceConfigDocId, buildPublishedMonthlyReportDocId, calculateStudentAttendanceSummary } from '../lib/elementaryMonthlyReportCore';
export { normalizeAcademicYear, buildMonthlyCurriculumDocId, buildMonthlyStudentScoreDocId, formatMonthLabel, getMonthOptionsForAcademicYear, buildMonthlyProjectDocId, buildMonthlyStudentPhotoDocId, buildMonthlyStudentNarrativeDocId, isElementaryHeadOrSuperAdmin, computeStudentScoresHash, buildMonthlyAttendanceConfigDocId, buildPublishedMonthlyReportDocId, calculateStudentAttendanceSummary } from '../lib/elementaryMonthlyReportCore';
import { mutateMonthlyNarrative } from './elementaryMonthlySELService';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import type { 
  ElementaryMonthlyCurriculumDoc, 
  ElementaryMonthlyStudentScoreDoc, 
  ElementaryMonthlySubject,
  ElementaryMonthlyStudentPhotoDoc,
  ElementaryMonthlyCropSettings
} from '../types/elementaryMonthlyReport';
import type { User, Student, Class } from '../types';
import {
  buildElementaryMonthlyAttendanceSummary,
  resolveElementaryMonthlyTeacherId,
  resolveElementaryMonthlyLogo,
  resolveElementaryMonthlySignatory
} from '../lib/elementaryMonthlyReportModel';
import { resolveElementaryMonthlyImage } from '../lib/elementaryMonthlyReportRender';
import type { ElementaryMonthlyAssetScope } from '../lib/elementaryMonthlyReportRender';
import { DEFAULT_ELEMENTARY_MONTHLY_CROP } from '../lib/elementaryMonthlyPhoto';

type ElementaryMonthlyWriteInput<T extends {
  id: string;
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}> = Omit<T, 'id' | 'createdAt' | 'createdBy' | 'createdByName' | 'updatedAt' | 'updatedBy' | 'updatedByName'> &
  Partial<Pick<T, 'id' | 'createdAt' | 'createdBy' | 'createdByName'>>;











/**
 * Returns sensible months for Semester 1 (July - Dec) or Semester 2 (Jan - June)
 * based on academic year, e.g. "2025/2026".
 */


/**
 * Fetches the curriculum document for a specific class, year, semester, and month.
 */
export async function fetchElementaryMonthlyCurriculum(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<ElementaryMonthlyCurriculumDoc | null> {
  try {
    const docId = buildMonthlyCurriculumDocId(classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_curriculum', docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as ElementaryMonthlyCurriculumDoc;
  } catch (err: any) {
    handleFirestoreError(err, 'get', 'elem_monthly_curriculum');
    return null;
  }
}

/**
 * Saves the entire curriculum structure (subjects, LGs, LOs, KKMs) for a monthly context.
 */
export async function saveElementaryMonthlyCurriculum(
  curriculum: ElementaryMonthlyWriteInput<ElementaryMonthlyCurriculumDoc>,
  user?: User | null
): Promise<void> {
  try {
    const docId = buildMonthlyCurriculumDocId(
      curriculum.classId,
      curriculum.academicYear,
      curriculum.semester,
      curriculum.month
    );
    const docRef = doc(db, 'elem_monthly_curriculum', docId);

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const payload: ElementaryMonthlyCurriculumDoc = {
      ...curriculum,
      id: docId,
      createdAt: curriculum.createdAt || now,
      createdBy: curriculum.createdBy || userId,
      createdByName: curriculum.createdByName || userName,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'elem_monthly_curriculum');
    throw err;
  }
}

/**
 * Fetches all student score documents for a class, academicYear, semester, month.
 */
export async function fetchElementaryMonthlyStudentScores(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<Record<string, ElementaryMonthlyStudentScoreDoc>> {
  try {
    const q = query(
      collection(db, 'elem_monthly_student_scores'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    const snap = await getDocs(q);
    const map: Record<string, ElementaryMonthlyStudentScoreDoc> = {};
    snap.docs.forEach(d => {
      const data = d.data() as ElementaryMonthlyStudentScoreDoc;
      if (data && data.studentId) {
        map[data.studentId] = data;
      }
    });
    return map;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'elem_monthly_student_scores');
    return {};
  }
}

/**
 * Saves a single LO score for a student.
 */
export async function saveElementaryMonthlySingleScore(params: {
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  loId: string;
  score: number | null; // null deletes or clears
  user?: User | null;
}): Promise<void> {
  const { studentId, studentName, classId, academicYear, semester, month, loId, score, user } = params;
  try {
    const docId = buildMonthlyStudentScoreDocId(studentId, classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_student_scores', docId);

    const snap = await getDoc(docRef);
    const existing = snap.exists() ? (snap.data() as ElementaryMonthlyStudentScoreDoc) : null;
    const scores = existing?.scores ? { ...existing.scores } : {};

    if (score === null || score === undefined) {
      delete scores[loId];
    } else {
      scores[loId] = score;
    }

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const payload: ElementaryMonthlyStudentScoreDoc = {
      id: docId,
      studentId,
      studentName,
      classId,
      academicYear,
      semester,
      month,
      scores,
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || userId,
      createdByName: existing?.createdByName || userName,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `elem_monthly_student_scores/${studentId}`);
    throw err;
  }
}

/**
 * Bulk writes LO score across multiple students.
 */
export async function saveBulkElementaryMonthlyScores(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  loId: string;
  score: number;
  students: Student[];
  targetStudentIds: string[];
  onlyEmpty?: boolean;
  existingScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  user?: User | null;
}): Promise<number> {
  const { 
    classId, academicYear, semester, month, loId, score, 
    students, targetStudentIds, onlyEmpty, existingScoresMap, user 
  } = params;

  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';
    let count = 0;

    for (const student of students) {
      if (!targetStudentIds.includes(student.id)) continue;

      const existingDoc = existingScoresMap[student.id];
      const existingScore = existingDoc?.scores?.[loId];

      if (onlyEmpty && existingScore !== undefined && existingScore !== null) {
        continue;
      }

      const docId = buildMonthlyStudentScoreDocId(student.id, classId, academicYear, semester, month);
      const docRef = doc(db, 'elem_monthly_student_scores', docId);

      const currentScores = existingDoc?.scores ? { ...existingDoc.scores } : {};
      currentScores[loId] = score;

      batch.set(docRef, {
        id: docId,
        studentId: student.id,
        studentName: student.name,
        classId,
        academicYear,
        semester,
        month,
        scores: currentScores,
        createdAt: existingDoc?.createdAt || now,
        createdBy: existingDoc?.createdBy || userId,
        createdByName: existingDoc?.createdByName || userName,
        updatedAt: now,
        updatedBy: userId,
        updatedByName: userName
      }, { merge: true });

      count++;
    }

    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'elem_monthly_student_scores/bulk');
    throw err;
  }
}

/**
 * Imports table scores for multiple students and LOs from paste/import.
 */
export async function importTableElementaryMonthlyScores(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  scoresByStudent: Record<string, Record<string, number>>; // studentId -> { loId: score }
  students: Student[];
  existingScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  user?: User | null;
}): Promise<number> {
  const { classId, academicYear, semester, month, scoresByStudent, students, existingScoresMap, user } = params;

  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';
    let updatedCount = 0;

    for (const [studentId, loScores] of Object.entries(scoresByStudent)) {
      const student = students.find(s => s.id === studentId);
      if (!student) continue;

      const docId = buildMonthlyStudentScoreDocId(studentId, classId, academicYear, semester, month);
      const docRef = doc(db, 'elem_monthly_student_scores', docId);

      const existingDoc = existingScoresMap[studentId];
      const mergedScores = {
        ...(existingDoc?.scores || {}),
        ...loScores
      };

      batch.set(docRef, {
        id: docId,
        studentId,
        studentName: student.name,
        classId,
        academicYear,
        semester,
        month,
        scores: mergedScores,
        createdAt: existingDoc?.createdAt || now,
        createdBy: existingDoc?.createdBy || userId,
        createdByName: existingDoc?.createdByName || userName,
        updatedAt: now,
        updatedBy: userId,
        updatedByName: userName
      }, { merge: true });

      updatedCount++;
    }

    if (updatedCount > 0) {
      await batch.commit();
    }
    return updatedCount;
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'elem_monthly_student_scores/import');
    throw err;
  }
}

/**
 * Copies the curriculum structure (subjects, LGs, LOs, KKMs) from a source class/month to target class/month.
 * Generates fresh unique IDs for subjects, LGs, and LOs so target has its own independent identity.
 * Does NOT copy student scores.
 */
export async function copyElementaryMonthlyCurriculum(params: {
  sourceCurriculum: ElementaryMonthlyCurriculumDoc;
  targetClassId: string;
  targetClassName: string;
  targetGradeLevel: number;
  targetAcademicYear: string;
  targetSemester: string;
  targetMonth: string;
  user?: User | null;
}): Promise<void> {
  const { 
    sourceCurriculum, 
    targetClassId, 
    targetClassName, 
    targetGradeLevel, 
    targetAcademicYear, 
    targetSemester, 
    targetMonth, 
    user 
  } = params;

  const now = Date.now();
  const userId = user?.uid || (user as any)?.id || 'unknown';
  const userName = user?.displayName || (user as any)?.name || 'Guru';

  // Deep clone subjects with new stable IDs
  const clonedSubjects: ElementaryMonthlySubject[] = (sourceCurriculum.subjects || []).map((sub, sIdx) => {
    const newSubjectId = `subj_${now}_${sIdx}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: newSubjectId,
      name: sub.name,
      kkm: sub.kkm ?? 70,
      order: sub.order ?? sIdx,
      learningGoals: (sub.learningGoals || []).map((lg, lgIdx) => {
        const newLgId = `lg_${now}_${sIdx}_${lgIdx}_${Math.random().toString(36).substring(2, 7)}`;
        return {
          id: newLgId,
          code: lg.code || `LG ${lgIdx + 1}`,
          title: lg.title,
          order: lg.order ?? lgIdx,
          kkmOverride: lg.kkmOverride,
          learningObjectives: (lg.learningObjectives || []).map((lo, loIdx) => {
            const newLoId = `lo_${now}_${sIdx}_${lgIdx}_${loIdx}_${Math.random().toString(36).substring(2, 7)}`;
            return {
              id: newLoId,
              code: lo.code || `LO ${loIdx + 1}`,
              title: lo.title,
              order: lo.order ?? loIdx
            };
          })
        };
      })
    };
  });

  const docId = buildMonthlyCurriculumDocId(targetClassId, targetAcademicYear, targetSemester, targetMonth);
  const docRef = doc(db, 'elem_monthly_curriculum', docId);

  const payload: ElementaryMonthlyCurriculumDoc = {
    id: docId,
    classId: targetClassId,
    className: targetClassName,
    gradeLevel: targetGradeLevel,
    academicYear: targetAcademicYear,
    semester: targetSemester,
    month: targetMonth,
    subjects: clonedSubjects,
    createdAt: now,
    createdBy: userId,
    createdByName: userName,
    updatedAt: now,
    updatedBy: userId,
    updatedByName: userName
  };

  await setDoc(docRef, payload, { merge: true });
}

// ==========================================
// TAHAP 2: PROYEK & FOTO SERVICES
// ==========================================







/**
 * Compresses an image client-side to ensure fast uploads and storage efficiency without distortion.
 */
export async function compressImageToDataUrl(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const img = new Image();
    let settled = false;
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reader.onload = null;
      reader.onerror = null;
      img.onload = null;
      img.onerror = null;
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(() => {
      finish(new Error('Foto belum selesai dibaca dalam 30 detik. Pilih kembali berkas gambar yang valid.'));
      if (reader.readyState === FileReader.LOADING) reader.abort();
    }, 30000);
    reader.onerror = () => finish(new Error('Gagal membaca berkas gambar.'));
    img.onerror = () => finish(new Error('Format berkas gambar tidak valid atau rusak.'));
    reader.onload = () => { img.src = String(reader.result || ''); };
    img.onload = () => {
      try {
        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) throw new Error('Dimensi foto tidak valid.');
        const ratio = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Browser tidak menyediakan kompresi gambar. Coba browser yang mendukung canvas.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        if (!compressed.startsWith('data:image/jpeg;base64,')) throw new Error('Kompresi foto ke JPEG gagal.');
        finish(undefined, compressed);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Foto tidak dapat dikompresi.'));
      }
    };
    try { reader.readAsDataURL(file); }
    catch (error) { finish(error instanceof Error ? error : new Error('Berkas foto tidak dapat dibaca.')); }
  });
}

export const ELEMENTARY_MONTHLY_ROOT_FOLDER_ID = '18HrRf50BaVoID2zUJBkgu7Okn6huBhlP';

export interface UploadSharedDrivePhotoParams {
  file: File;
  academicYear: string;
  semester: string;
  gradeLevel?: number;
  gradeCategory?: 'Lower Grade' | 'Upper Grade';
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  month: string;
  slot: 'profile' | 'activity1' | 'activity2' | 'activity3';
  version?: number;
  operationId: string;
  expectedRevision: number;
  caption?: string;
  cropSettings?: ElementaryMonthlyCropSettings;
  user?: User | null;
}

export interface SharedDrivePhotoUploadResult {
  driveFileId: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  version: number;
  slot: string;
  streamUrl: string;
  caption?: string;
  cropSettings?: ElementaryMonthlyCropSettings;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: number;
  photoDoc: ElementaryMonthlyStudentPhotoDoc;
}

export class ElementaryMonthlyPhotoError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;
  readonly operationId?: string;
  readonly driveFileId?: string;

  constructor(message: string, details: {
    code?: string; retryable?: boolean; status?: number; operationId?: string; driveFileId?: string;
  } = {}) {
    super(message);
    this.name = 'ElementaryMonthlyPhotoError';
    this.code = details.code || 'PHOTO_ERROR';
    this.retryable = details.retryable ?? false;
    this.status = details.status || 0;
    this.operationId = details.operationId;
    this.driveFileId = details.driveFileId;
  }
}

/** The verified token, never an actor ID supplied in JSON, establishes the caller. */
async function requestElementaryMonthlyPhoto<T>(path: string, payload: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ElementaryMonthlyPhotoError('Sesi login berakhir. Masuk kembali untuk menyimpan foto.', { code: 'AUTH_REQUIRED', status: 401 });
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new ElementaryMonthlyPhotoError('Sesi login belum dapat diverifikasi. Coba lagi setelah koneksi pulih.', { code: 'AUTH_UNAVAILABLE', retryable: true });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`/api/elementary-monthly${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      throw new ElementaryMonthlyPhotoError(result?.error || `Permintaan foto gagal (HTTP ${response.status}).`, {
        code: result?.code || (response.status === 409 ? 'PHOTO_CONFLICT' : 'PHOTO_REQUEST_FAILED'),
        status: response.status,
        retryable: Boolean(result?.retryable ?? (response.status >= 500 || response.status === 408 || response.status === 429)),
        operationId: result?.operationId,
        driveFileId: result?.driveFileId,
      });
    }
    return result as T;
  } catch (error) {
    if (error instanceof ElementaryMonthlyPhotoError) throw error;
    throw new ElementaryMonthlyPhotoError(
      'Respons penyimpanan foto belum diterima. Gunakan Coba Lagi untuk melanjutkan operasi yang sama.',
      { code: 'NETWORK_ERROR', retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** UI uses the same authenticated asset resolver as Preview/PDF; bytes stay temporary. */
export async function fetchElementaryMonthlyPhotoBlob(
  url: string,
  scope: ElementaryMonthlyAssetScope,
  signal?: AbortSignal,
): Promise<Blob> {
  const dataUrl = await resolveElementaryMonthlyImage(url, scope, signal);
  if (!dataUrl) throw new Error('Sumber foto kosong.');
  const response = await fetch(dataUrl, { signal });
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith('image/')) throw new Error('Foto tidak dapat dibaca.');
  return blob;
}

/**
 * Verifies accessibility of Google Shared Drive root folder (18HrRf50BaVoID2zUJBkgu7Okn6huBhlP).
 */
export async function verifyElementaryMonthlyDriveRoot(scope: Omit<ElementaryMonthlyAssetScope, 'studentId'>): Promise<{
  ok: boolean;
  folderName?: string;
  error?: string;
}> {
  try {
    const data = await requestElementaryMonthlyPhoto<{ success: true; name: string }>('/verify-root', scope);
    return { ok: true, folderName: data.name };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Gagal menghubungi backend untuk verifikasi Google Drive.' };
  }
}

/**
 * Uploads student photo directly to Google Shared Drive under root 18HrRf50BaVoID2zUJBkgu7Okn6huBhlP.
 * Strictly adheres to hierarchy:
 * [Root] -> [AcademicYear] -> [Lower/Upper Grade] -> [Class] -> "[StudentName] - [Class] - [studentId]" -> [YYYY-MM]
 * File naming: "${studentName} - ${className} - ${slot} - v${version}_${uniqueSuffix}.${ext}"
 */
export async function uploadElementaryMonthlyPhotoToSharedDrive(
  params: UploadSharedDrivePhotoParams
): Promise<SharedDrivePhotoUploadResult> {
  const {
    file,
    academicYear,
    semester,
    gradeLevel,
    gradeCategory,
    classId,
    className,
    studentId,
    studentName,
    month,
    slot,
    operationId,
    expectedRevision,
    caption = '',
    cropSettings = { ...DEFAULT_ELEMENTARY_MONTHLY_CROP }
  } = params;

  if (file.size > 10 * 1024 * 1024) {
    throw new ElementaryMonthlyPhotoError('Ukuran berkas gambar maksimal 10MB.', { code: 'INVALID_PHOTO_FILE' });
  }

  if (!file.type.startsWith('image/')) {
    throw new ElementaryMonthlyPhotoError('Hanya berkas gambar yang dapat dibaca browser yang diperbolehkan.', { code: 'INVALID_PHOTO_FILE' });
  }
  if (!operationId || !semester) throw new ElementaryMonthlyPhotoError('Identitas operasi dan semester diperlukan.', { code: 'INVALID_PHOTO_CONTEXT' });

  // Compress image client-side before sending to server
  let compressedDataUrl: string;
  try {
    compressedDataUrl = await compressImageToDataUrl(file);
  } catch (error) {
    throw new ElementaryMonthlyPhotoError(error instanceof Error ? error.message : 'Kompresi foto gagal.', { code: 'PHOTO_COMPRESSION_FAILED' });
  }

  const payload = {
    base64: compressedDataUrl,
    academicYear,
    semester,
    gradeLevel,
    gradeCategory,
    classId,
    className,
    studentId,
    studentName,
    month,
    slot,
    operationId,
    expectedRevision,
    caption,
    cropSettings
  };
  const result = await requestElementaryMonthlyPhoto<{
    photo: Omit<SharedDrivePhotoUploadResult, 'photoDoc'>;
    photoDoc: ElementaryMonthlyStudentPhotoDoc;
  }>('/upload-photo', payload);
  if (!result.photo?.driveFileId || !result.photoDoc) {
    throw new ElementaryMonthlyPhotoError('Respons upload belum memuat referensi foto siswa. Coba lagi dengan operasi yang sama.', {
      code: 'PHOTO_METADATA_PENDING', retryable: true, operationId,
      driveFileId: result.photo?.driveFileId,
    });
  }
  return { ...result.photo, photoDoc: result.photoDoc };
}

/**
 * Converts an image URL (such as authenticated stream URL or data URL) into a base64 Data URL
 * to be safely embedded into PDF canvases without requiring external Drive access for the PDF viewer.
 */
export async function convertImageUrlToBase64(url: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[convertImageUrlToBase64] Could not convert URL to base64, returning original:', err);
    return url;
  }
}

/**
 * Legacy upload helper retained for backward compatibility with existing components if needed.
 */
export async function uploadMonthlyPhoto(
  file: File,
  _storagePath?: string
): Promise<string> {
  return await compressImageToDataUrl(file);
}

/**
 * Fetches class-level project documentation (Title, Overview, Shared Album Link).
 */
export async function fetchElementaryMonthlyProjectDoc(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<import('../types/elementaryMonthlyReport').ElementaryMonthlyProjectDoc | null> {
  try {
    const docId = buildMonthlyProjectDocId(classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_project_docs', docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as import('../types/elementaryMonthlyReport').ElementaryMonthlyProjectDoc;
  } catch (err: any) {
    handleFirestoreError(err, 'get', 'elem_monthly_project_docs');
    return null;
  }
}

/**
 * Saves class-level project documentation.
 */
export async function saveElementaryMonthlyProjectDoc(
  projectDoc: ElementaryMonthlyWriteInput<import('../types/elementaryMonthlyReport').ElementaryMonthlyProjectDoc>,
  user?: User | null
): Promise<void> {
  try {
    const docId = buildMonthlyProjectDocId(
      projectDoc.classId,
      projectDoc.academicYear,
      projectDoc.semester,
      projectDoc.month
    );
    const docRef = doc(db, 'elem_monthly_project_docs', docId);

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const payload: import('../types/elementaryMonthlyReport').ElementaryMonthlyProjectDoc = {
      ...projectDoc,
      id: docId,
      createdAt: projectDoc.createdAt || now,
      createdBy: projectDoc.createdBy || userId,
      createdByName: projectDoc.createdByName || userName,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'elem_monthly_project_docs');
    throw err;
  }
}

/**
 * Fetches all student photo documents for a class and month.
 */
export async function fetchElementaryMonthlyStudentPhotos(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<Record<string, import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc>> {
  try {
    const q = query(
      collection(db, 'elem_monthly_student_photos'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    const snap = await getDocs(q);
    const map: Record<string, import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc> = {};
    snap.docs.forEach(d => {
      const data = d.data() as import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc;
      if (data && data.studentId) {
        map[data.studentId] = data;
      }
    });
    return map;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'elem_monthly_student_photos');
    throw err;
  }
}

/**
 * Saves photo documentation for a single student.
 */
export async function saveElementaryMonthlyStudentPhotoDoc(
  photoDoc: ElementaryMonthlyWriteInput<ElementaryMonthlyStudentPhotoDoc>,
  _user?: User | null,
  expectedRevision = photoDoc.revision ?? 0,
): Promise<ElementaryMonthlyStudentPhotoDoc> {
  const result = await requestElementaryMonthlyPhoto<{ photoDoc: ElementaryMonthlyStudentPhotoDoc }>(
    '/save-photos', { photoDoc, expectedRevision },
  );
  if (!result.photoDoc) throw new ElementaryMonthlyPhotoError('Respons penyimpanan foto tidak lengkap.', { code: 'INVALID_PHOTO_RESPONSE', retryable: true });
  return result.photoDoc;
}

export interface ElementaryMonthlyBulkPhotoResult {
  count: number;
  photoDocs: Record<string, ElementaryMonthlyStudentPhotoDoc>;
  skipped: Array<{ studentId: string; index: number; reason: string }>;
}

/**
 * Source and targets are re-read in one server transaction. The default keeps
 * populated individual slots; replacing them requires the explicit UI choice.
 */
export async function bulkApplyElementaryMonthlyPhotos(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  sourceStudentId: string;
  sourceRevision: number;
  snapshotIndices: number[];
  targetStudentIds: string[];
  applyAlbumLink: boolean;
  mode: 'skip-existing' | 'replace';
  replacementConfirmed: boolean;
  existingPhotosMap: Record<string, ElementaryMonthlyStudentPhotoDoc>;
  students?: Student[];
  user?: User | null;
}): Promise<ElementaryMonthlyBulkPhotoResult> {
  if (params.mode === 'replace' && !params.replacementConfirmed) {
    throw new ElementaryMonthlyPhotoError('Konfirmasi penggantian foto individual diperlukan.', { code: 'OVERWRITE_CONFIRMATION_REQUIRED' });
  }
  const targetStudentIds = Array.from(new Set(params.targetStudentIds)).filter(id => id !== params.sourceStudentId);
  if (!targetStudentIds.length) return { count: 0, photoDocs: {}, skipped: [] };
  return requestElementaryMonthlyPhoto<ElementaryMonthlyBulkPhotoResult>('/bulk-photos', {
    classId: params.classId,
    academicYear: params.academicYear,
    semester: params.semester,
    month: params.month,
    sourceStudentId: params.sourceStudentId,
    sourceRevision: params.sourceRevision,
    snapshotIndices: Array.from(new Set(params.snapshotIndices)),
    targetStudentIds,
    applyAlbumLink: params.applyAlbumLink,
    overwriteExisting: params.mode === 'replace',
    replacementConfirmed: params.replacementConfirmed,
    expectedRevisions: Object.fromEntries(targetStudentIds.map(studentId => [studentId, params.existingPhotosMap[studentId]?.revision ?? 0])),
  });
}

// ==========================================
// TAHAP 2: NARASI & APPROVAL SERVICES
// ==========================================



/**
 * Computes a hash or fingerprint of student scores to detect changes after narrative submission/approval.
 */


/**
 * Fetches all student narratives for a class and month.
 */
export async function fetchElementaryMonthlyStudentNarratives(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<Record<string, import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc>> {
  try {
    const q = query(
      collection(db, 'elem_monthly_student_narratives'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    const snap = await getDocs(q);
    const map: Record<string, import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc> = {};
    snap.docs.forEach(d => {
      const data = d.data() as import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc;
      if (data && data.studentId) {
        map[data.studentId] = data;
      }
    });
    return map;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'elem_monthly_student_narratives');
    return {};
  }
}

/**
 * Saves narrative documentation for a single student (Academic + SEL).
 */
export async function saveElementaryMonthlyStudentNarrativeDoc(
  narrativeDoc: ElementaryMonthlyWriteInput<import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc>,
  user?: User | null
): Promise<void> {
  const result = await mutateMonthlyNarrative({
    classId: narrativeDoc.classId, studentId: narrativeDoc.studentId,
    academicYear: narrativeDoc.academicYear, semester: narrativeDoc.semester, month: narrativeDoc.month,
    action: 'save', narrativeDoc, expectedRevision: narrativeDoc.revision ?? 0
  });
  Object.assign(narrativeDoc, result.narrativeDoc);
}

/**
 * Submits single student narrative package for Head Unit review.
 */
export async function submitElementaryMonthlyNarrativeForReview(params: {
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  currentScoresHash?: string;
  user?: User | null;
}): Promise<void> {
  await mutateMonthlyNarrative({ ...params, action: 'submit' });
}

/**
 * Bulk submits narratives for review across selected students.
 */
export async function bulkSubmitElementaryMonthlyNarratives(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  studentIds: string[];
  scoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  user?: User | null;
}): Promise<number> {
  let count = 0;
  const failures: string[] = [];
  for (const studentId of [...new Set(params.studentIds)]) {
    try { await mutateMonthlyNarrative({ ...params, studentId, action: 'submit' }); count++; }
    catch (e) { failures.push(`${studentId}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (failures.length) throw new Error(`Berhasil: ${count}. Gagal: ${failures.length}. Muat ulang status; ulangi hanya siswa yang belum diajukan.\n${failures.join('\n')}`);
  return count;
}

/**
 * Review action by Head Unit / Super Admin (APPROVE or REQUEST_REVISION).
 * Requires reviewNotes when requesting revision.
 */
export async function reviewElementaryMonthlyNarrative(params: {
  studentId: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  action: 'APPROVE' | 'REQUEST_REVISION';
  reviewNotes?: string;
  reviewer: User | null;
}): Promise<void> {
  await mutateMonthlyNarrative({ ...params, action: params.action === 'APPROVE' ? 'approve' : 'revision' });
}

/**
 * Bulk approves all submitted narratives for a class.
 */
export async function bulkApproveElementaryMonthlyNarratives(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  studentIds: string[];
  reviewer: User | null;
}): Promise<number> {
  let count = 0;
  const failures: string[] = [];
  for (const studentId of [...new Set(params.studentIds)]) {
    try { await mutateMonthlyNarrative({ ...params, studentId, action: 'approve' }); count++; }
    catch (e) { failures.push(`${studentId}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (failures.length) throw new Error(`Berhasil: ${count}. Gagal: ${failures.length}. Muat ulang status; ulangi hanya siswa yang masih diajukan.\n${failures.join('\n')}`);
  return count;
}

/**
 * Unlocks a submitted or approved narrative so teacher can make modifications.
 * Transitions status back to DRAFT.
 */
export async function unlockElementaryMonthlyNarrativeForEdit(params: {
  studentId: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  user: User | null;
}): Promise<void> {
  await mutateMonthlyNarrative({ ...params, action: 'unlock' });
}

// ==========================================
// TAHAP 2: AI NARRATIVE GENERATION & REFINE
// ==========================================

export async function generateElementaryMonthlyAcademicCommentAI(params: {
  studentName: string;
  nickname?: string;
  monthLabel: string;
  gradeLevel: number;
  subjectSummaries: Array<{
    subjectName: string;
    lgTitles: string[];
    average: number | null;
    predicate: string | null;
  }>;
  teacherNotes?: string;
}): Promise<string> {
  const { studentName, nickname, monthLabel, gradeLevel, subjectSummaries, teacherNotes } = params;
  const nameToUse = nickname?.trim() || studentName.trim();

  // Format subjects summary
  const formattedSubjects = subjectSummaries.map(s => {
    const avgStr = s.average !== null ? `${s.average.toFixed(1)} (${s.predicate})` : 'Belum dinilai';
    const lgStr = s.lgTitles.length > 0 ? s.lgTitles.join(', ') : 'Umum';
    return `- ${s.subjectName} [${lgStr}]: ${avgStr}`;
  }).join('\n');

  try {
    const { auth } = await import('../lib/firebase');
    const idToken = await auth.currentUser?.getIdToken();

    if (idToken) {
      const response = await fetch('/api/elementary/monthly/generate-academic-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          studentName,
          nickname: nameToUse,
          monthLabel,
          gradeLevel,
          subjectSummaries: formattedSubjects,
          teacherNotes: teacherNotes || ''
        }),
      });

      if (response.ok) {
        const resJson = await response.json();
        if (resJson.text) return resJson.text.trim();
      }
    }
  } catch (e) {
    console.warn('[AI:generateAcademic] API call fallback to client formulation:', e);
  }

  // Graceful client fallback formulation
  const strengths: string[] = [];
  const growths: string[] = [];
  subjectSummaries.forEach(s => {
    if (s.predicate === 'A') {
      strengths.push(`${s.subjectName} (predikat A)`);
    } else if (s.predicate === 'B') {
      growths.push(`${s.subjectName} untuk pendalaman konsep`);
    }
  });

  let comment = `Sepanjang bulan ${monthLabel}, Ananda ${nameToUse} di Grade ${gradeLevel} menunjukkan perkembangan belajar yang positif dan partisipasi aktif di kelas. `;
  if (strengths.length > 0) {
    comment += `Ananda menonjol pada mata pelajaran ${strengths.slice(0, 3).join(', ')}, dengan pemahaman materi dan antusiasme belajar yang sangat baik. `;
  } else {
    comment += `Ananda tekun menyelesaikan tugas-tugas terstruktur dengan bimbingan guru. `;
  }

  if (growths.length > 0) {
    comment += `Sebagai penguatan di bulan berikutnya, Ananda diarahkan untuk meningkatkan ketelitian pada ${growths.slice(0, 2).join(' serta ')}. `;
  } else {
    comment += `Semangat belajar dan rasa ingin tahu Ananda terus didorong untuk mempertahankan capaian optimal ini. `;
  }

  if (teacherNotes?.trim()) {
    comment += `Catatan khusus: ${teacherNotes.trim()}.`;
  }

  return comment.trim();
}

export async function generateElementaryMonthlySelProfileAI(params: {
  studentName: string;
  nickname?: string;
  monthLabel: string;
  gradeLevel: number;
  focusAreas: string[];
  observations?: string;
}): Promise<string> {
  const { studentName, nickname, monthLabel, gradeLevel, focusAreas, observations } = params;
  const nameToUse = nickname?.trim() || studentName.trim();
  const focusList = focusAreas.length > 0 ? focusAreas.join(', ') : 'Kemandirian dan Kerja Sama';

  try {
    const { auth } = await import('../lib/firebase');
    const idToken = await auth.currentUser?.getIdToken();

    if (idToken) {
      const response = await fetch('/api/elementary/monthly/generate-sel-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          studentName,
          nickname: nameToUse,
          monthLabel,
          gradeLevel,
          focusAreas: focusList,
          observations: observations || ''
        }),
      });

      if (response.ok) {
        const resJson = await response.json();
        if (resJson.text) return resJson.text.trim();
      }
    }
  } catch (e) {
    console.warn('[AI:generateSEL] API call fallback to client formulation:', e);
  }

  // Graceful client fallback formulation
  let selText = `Pada aspek profil perkembangan sosial emosional bulan ${monthLabel}, Ananda ${nameToUse} menunjukkan kebiasaan yang baik dalam fokus ${focusList}. `;
  if (observations?.trim()) {
    selText += `${observations.trim()} Ananda mampu berinteraksi secara santun dengan guru dan teman sebayanya, serta menunjukkan sikap bertanggung jawab dalam kegiatan harian sekolah.`;
  } else {
    selText += `Ananda mampu mengelola emosi secara adaptif, berkolaborasi dengan hangat bersama teman kelompok, dan mengikuti kesepakatan kelas dengan penuh kesadaran.`;
  }

  return selText.trim();
}

export async function refineElementaryMonthlyNarrativeAI(params: {
  originalText: string;
  narrativeType: 'academic' | 'sel';
  studentName: string;
  nickname?: string;
}): Promise<string> {
  const { originalText, narrativeType, studentName, nickname } = params;
  const cleanOriginal = originalText.trim();
  if (!cleanOriginal) return '';

  try {
    const { auth } = await import('../lib/firebase');
    const idToken = await auth.currentUser?.getIdToken();

    if (idToken) {
      const response = await fetch('/api/elementary/monthly/refine-narrative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          originalText: cleanOriginal,
          narrativeType,
          studentName,
          nickname: nickname || studentName
        }),
      });

      if (response.ok) {
        const resJson = await response.json();
        if (resJson.text) return resJson.text.trim();
      }
    }
  } catch (e) {
    console.warn('[AI:refineNarrative] API call fallback:', e);
  }

  // Simple client-side formatting cleanup
  return cleanOriginal
    .replace(/\s+/g, ' ')
    .replace(/\s([.,!?:;])/g, '$1')
    .trim();
}

// ==========================================
// TAHAP 3: PREVIEW, ATTENDANCE, PDF & PUBLIKASI
// ==========================================

import type {
  ElementaryMonthlyAttendanceConfig,
  ElementaryMonthlyAttendanceSummary,
  ElementaryMonthlyReportSignatory,
  ElementaryMonthlyReportSnapshot,
  PublishedElementaryMonthlyReportDoc,
  ElementaryMonthlyProjectDoc,
  ElementaryMonthlyStudentNarrativeDoc
} from '../types/elementaryMonthlyReport';





export async function fetchElementaryMonthlyAttendanceConfig(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<ElementaryMonthlyAttendanceConfig | null> {
  if (!classId || !academicYear || !semester || !month) return null;
  const docId = buildMonthlyAttendanceConfigDocId(classId, academicYear, semester, month);
  try {
    const snap = await getDoc(doc(db, 'elem_monthly_attendance_configs', docId));
    if (snap.exists()) {
      return snap.data() as ElementaryMonthlyAttendanceConfig;
    }
    return null;
  } catch (err) {
    console.error('Error fetching elementary monthly attendance config:', err);
    throw err;
  }
}

export async function saveElementaryMonthlyAttendanceConfig(
  params: {
    classId: string;
    className?: string;
    academicYear: string;
    semester: string;
    month: string;
    startDate: string;
    endDate: string;
    totalSchoolDays: number;
    signingDate: string;
    signingLocation: string;
    studentAttendanceMap: Record<string, { presentDays: number; totalDays?: number; notes?: string }>;
  },
  currentUser: User
): Promise<void> {
  const {
    classId,
    className,
    academicYear,
    semester,
    month,
    startDate,
    endDate,
    totalSchoolDays,
    signingDate,
    signingLocation,
    studentAttendanceMap
  } = params;

  const docId = buildMonthlyAttendanceConfigDocId(classId, academicYear, semester, month);
  const now = Date.now();

  const data: ElementaryMonthlyAttendanceConfig = {
    id: docId,
    classId,
    className,
    academicYear,
    semester,
    month,
    startDate,
    endDate,
    totalSchoolDays,
    signingDate,
    signingLocation: signingLocation || 'Depok',
    studentAttendanceMap,
    createdAt: now,
    createdBy: currentUser.uid || (currentUser as any).id || 'system',
    updatedAt: now,
    updatedBy: currentUser.uid || (currentUser as any).id || 'system'
  };

  try {
    await setDoc(doc(db, 'elem_monthly_attendance_configs', docId), data, { merge: true });
  } catch (err) {
    console.error('Error saving elementary monthly attendance config:', err);
    throw err;
  }
}

/**
 * Calculates student attendance percentage strictly.
 * Missing data is NOT assumed 100%. Returns isAvailable: false if data is missing.
 */


export async function fetchPublishedElementaryMonthlyReports(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<PublishedElementaryMonthlyReportDoc[]> {
  if (!classId || !academicYear || !semester || !month) return [];
  try {
    const q = query(
      collection(db, 'elem_monthly_published_reports'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PublishedElementaryMonthlyReportDoc);
  } catch (err) {
    console.error('Error fetching published elementary monthly reports:', err);
    throw err;
  }
}

export interface ElementaryMonthlyReportConfiguration {
  logoUrl: string | null;
  signatory: ElementaryMonthlyReportSignatory;
  issues: string[];
}

/** Read the official Elementary configuration and the assigned teacher's profile. */
export async function fetchElementaryMonthlyReportConfiguration(
  classInfo: Class,
  attendanceConfig: ElementaryMonthlyAttendanceConfig | null = null
): Promise<ElementaryMonthlyReportConfiguration> {
  const [configSnap, logosSnap, classSnap] = await Promise.all([
    getDoc(doc(db, 'reportConfig', 'ELEMENTARY')),
    getDoc(doc(db, 'settings', 'logos')),
    getDoc(doc(db, 'classes', classInfo.id))
  ]);
  const config = configSnap.exists() ? configSnap.data() : {};
  const logos = logosSnap.exists() ? logosSnap.data() : null;
  const actualClass = classSnap.exists() ? classSnap.data() as Class : classInfo;
  const issues: string[] = [];
  if (!configSnap.exists()) issues.push('Report Config Elementary belum tersedia.');
  if (!classSnap.exists()) issues.push('Data kelas resmi belum tersedia.');
  let teacherId = '';
  let assignedClass: Class | null = actualClass;
  try {
    teacherId = resolveElementaryMonthlyTeacherId(actualClass);
  } catch (error) {
    assignedClass = null;
    issues.push(error instanceof Error ? error.message : 'Penugasan wali kelas tidak valid.');
  }
  let teacher: Partial<User> | null = null;
  if (teacherId) {
    const teacherSnap = await getDoc(doc(db, 'users', teacherId));
    if (teacherSnap.exists()) teacher = teacherSnap.data() as Partial<User>;
  }
  if (!teacher) issues.push('Profil wali kelas yang ditugaskan belum tersedia.');
  const logoUrl = resolveElementaryMonthlyLogo(logos) || null;
  if (!logoUrl) issues.push('Logo resmi Elementary belum diatur pada menu Logo.');
  return {
    logoUrl,
    issues,
    signatory: resolveElementaryMonthlySignatory({
      classData: assignedClass,
      teacherProfile: teacher,
      reportConfig: config,
      attendanceConfig
    })
  };
}

export interface ElementaryMonthlyPublicationContext {
  classId: string;
  studentId: string;
  academicYear: string;
  semester: string;
  month: string;
}

type MonthlyPublicationStatus = 'PREPARED' | 'UPLOADING' | 'UPLOADED' | 'PUBLISHED' | 'RECOVERABLE' | 'SUPERSEDED';

interface MonthlyPublicationOperation {
  success: true;
  operationId: string;
  status: MonthlyPublicationStatus;
  version: number;
  reportSnapshot: ElementaryMonthlyReportSnapshot;
  driveFileId: string;
  driveFolderId?: string;
  fileName: string;
  publishedReport?: PublishedElementaryMonthlyReportDoc;
}

export class ElementaryMonthlyPublicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operationId?: string,
    public readonly partialUpload = false,
    public readonly retryable = true
  ) {
    super(message);
    this.name = 'ElementaryMonthlyPublicationError';
  }
}

const pendingMonthlyOperations = new Map<string, string>();
const activeMonthlyPublications = new Map<string, Promise<PublishedElementaryMonthlyReportDoc>>();

function monthlyPublicationStorageKey(context: ElementaryMonthlyPublicationContext): string {
  return `lumina:monthly-lower-publication:${auth.currentUser?.uid || 'signed-out'}:${encodeURIComponent(JSON.stringify([
    context.classId, context.studentId, context.academicYear, context.semester, context.month
  ]))}`;
}

/** Only a recovery operation ID is retained locally; no PDF, token, or snapshot is stored. */
export function getPendingElementaryMonthlyPublication(context: ElementaryMonthlyPublicationContext): string | null {
  const key = monthlyPublicationStorageKey(context);
  const inMemory = pendingMonthlyOperations.get(key);
  if (inMemory) return inMemory;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved && /^[A-Za-z0-9_-]{1,200}$/.test(saved)) return saved;
  } catch {
    // Server-side idempotency remains authoritative when browser storage is unavailable.
  }
  return null;
}

function rememberMonthlyOperation(context: ElementaryMonthlyPublicationContext, operationId: string | null): void {
  const key = monthlyPublicationStorageKey(context);
  if (operationId) pendingMonthlyOperations.set(key, operationId);
  else pendingMonthlyOperations.delete(key);
  try {
    if (operationId) window.localStorage.setItem(key, operationId);
    else window.localStorage.removeItem(key);
  } catch {
    // A retry still resolves the same operation on the server.
  }
}

async function monthlyPublicationRequest<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const current = auth.currentUser;
  if (!current) throw new ElementaryMonthlyPublicationError('Sesi berakhir. Masuk kembali sebelum mempublikasikan.', 'UNAUTHENTICATED', undefined, false, false);
  const token = await current.getIdToken();
  let response: Response;
  try {
    response = await fetch(`/api/elementary-monthly/reports${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  } catch {
    throw new ElementaryMonthlyPublicationError('Koneksi publikasi terputus. Gunakan Pulihkan untuk memeriksa operasi yang sama sebelum mencoba ulang.', 'NETWORK_ERROR');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    throw new ElementaryMonthlyPublicationError(
      typeof data?.error === 'string' ? data.error : `Backend publikasi tidak memberi respons yang valid (HTTP ${response.status}). Pastikan seluruh file pengganti telah dipasang.`,
      typeof data?.code === 'string' ? data.code : `HTTP_${response.status}`,
      typeof data?.operationId === 'string' ? data.operationId : undefined,
      data?.partialUpload === true,
      data?.retryable !== false
    );
  }
  return data as T;
}

export function hasElementaryMonthlyPublishedPdf(report: PublishedElementaryMonthlyReportDoc | null | undefined): boolean {
  return !!(report?.status === 'PUBLISHED' && report.driveFileId && report.driveFileUrl && report.fileName);
}

function requireUploadedMonthlyReport(operation: MonthlyPublicationOperation): PublishedElementaryMonthlyReportDoc {
  const report = operation.publishedReport;
  if (operation.status !== 'PUBLISHED' || !hasElementaryMonthlyPublishedPdf(report) || !report?.driveFolderId) {
    throw new ElementaryMonthlyPublicationError(
      'Publikasi belum selesai: PDF Drive dan metadata terbit belum terkonfirmasi. Gunakan Pulihkan pada operasi yang sama.',
      'INCOMPLETE_PUBLICATION', operation.operationId, operation.status === 'UPLOADED' || operation.status === 'RECOVERABLE'
    );
  }
  return report;
}

async function monthlyPdfToBase64(blob: Blob): Promise<string> {
  if (blob.type !== 'application/pdf' || blob.size === 0) {
    throw new Error('Renderer tidak menghasilkan PDF yang valid.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('PDF tidak dapat dibaca untuk pengunggahan.'));
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      if (!value) reject(new Error('Isi PDF kosong.'));
      else resolve(value);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * The server reloads authoritative sources and reserves one immutable version.
 * The very same snapshot renderer used in preview creates the PDF. Completion
 * is reported only after Drive upload AND the publication metadata commit.
 */
export function publishElementaryMonthlyReport(params: {
  student: Student;
  classId: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: string;
  month: string;
  curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
  studentScoreDoc: ElementaryMonthlyStudentScoreDoc | null;
  projectDoc: ElementaryMonthlyProjectDoc | null;
  photoDoc: ElementaryMonthlyStudentPhotoDoc | null;
  narrativeDoc: ElementaryMonthlyStudentNarrativeDoc | null;
  attendanceConfig: ElementaryMonthlyAttendanceConfig | null;
  signatory: ElementaryMonthlyReportSignatory;
  currentUser: User;
  onProgress?: (message: string) => void;
}): Promise<PublishedElementaryMonthlyReportDoc> {
  const context: ElementaryMonthlyPublicationContext = {
    classId: params.classId,
    studentId: params.student.id,
    academicYear: params.academicYear,
    semester: params.semester,
    month: params.month
  };
  const key = monthlyPublicationStorageKey(context);
  const running = activeMonthlyPublications.get(key);
  if (running) return running;
  const run = (async () => {
    let operationId = getPendingElementaryMonthlyPublication(context) || undefined;
    let knownUploaded = false;
    try {
      params.onProgress?.('Memvalidasi data dan memeriksa versi');
      let operation: MonthlyPublicationOperation;
      if (operationId) {
        try {
          operation = await monthlyPublicationRequest<MonthlyPublicationOperation>(`/status/${encodeURIComponent(operationId)}`);
        } catch (error) {
          if (error instanceof ElementaryMonthlyPublicationError && ['NOT_FOUND', 'OPERATION_NOT_FOUND', 'HTTP_404', 'SOURCE_CHANGED'].includes(error.code)) {
            rememberMonthlyOperation(context, null);
            operationId = undefined;
            operation = await monthlyPublicationRequest<MonthlyPublicationOperation>('/prepare', context);
          } else throw error;
        }
      } else {
        operation = await monthlyPublicationRequest<MonthlyPublicationOperation>('/prepare', context);
      }
      operationId = operation.operationId;
      if (!operationId) throw new Error('Backend tidak mengembalikan ID operasi publikasi.');
      rememberMonthlyOperation(context, operationId);
      if (operation.status === 'PUBLISHED') {
        const report = requireUploadedMonthlyReport(operation);
        rememberMonthlyOperation(context, null);
        return report;
      }
      if (operation.status === 'SUPERSEDED') {
        throw new ElementaryMonthlyPublicationError('Sumber rapor telah berubah. Segarkan data lalu terbitkan versi dari sumber terbaru.', 'SOURCE_CHANGED', operationId);
      }
      knownUploaded = operation.status === 'UPLOADED';
      if (operation.status === 'PREPARED' || operation.status === 'UPLOADED' || operation.status === 'RECOVERABLE' || operation.status === 'UPLOADING') {
        params.onProgress?.('Memeriksa operasi tersimpan dan memulihkan metadata');
        try {
          const recovered = await monthlyPublicationRequest<MonthlyPublicationOperation>('/publish', { operationId });
          const report = requireUploadedMonthlyReport(recovered);
          rememberMonthlyOperation(context, null);
          return report;
        } catch (error) {
          if (!(error instanceof ElementaryMonthlyPublicationError && error.code === 'PDF_REQUIRED')) throw error;
        }
      }
      if (!operation.reportSnapshot) throw new Error('Snapshot terverifikasi tidak tersedia untuk renderer PDF.');
      params.onProgress?.('Memuat gambar dan merender PDF');
      const { renderElementaryMonthlyReportPdf } = await import('../lib/elementaryMonthlyReportPdf');
      const pdfBlob = await renderElementaryMonthlyReportPdf(operation.reportSnapshot);
      const pdfBase64 = await monthlyPdfToBase64(pdfBlob);
      params.onProgress?.('Mengunggah PDF dan menyimpan metadata');
      const result = await monthlyPublicationRequest<MonthlyPublicationOperation>('/publish', { operationId, pdfBase64 });
      const report = requireUploadedMonthlyReport(result);
      rememberMonthlyOperation(context, null);
      return report;
    } catch (error) {
      const failure = error instanceof ElementaryMonthlyPublicationError ? error : new ElementaryMonthlyPublicationError(
        error instanceof Error ? error.message : 'Publikasi rapor gagal.', 'RENDER_OR_PUBLICATION_FAILED', operationId, knownUploaded
      );
      if (failure.code === 'SOURCE_CHANGED') {
        rememberMonthlyOperation(context, null);
        throw new ElementaryMonthlyPublicationError(failure.message, failure.code, undefined, false, true);
      }
      if (failure.operationId && !operationId) operationId = failure.operationId;
      if (operationId) rememberMonthlyOperation(context, operationId);
      // A lost HTTP response is not evidence that the upload failed. Inspect the
      // same durable operation; never allocate another PDF ID in this catch.
      if (operationId && !['IN_PROGRESS', 'RENDER_OR_PUBLICATION_FAILED'].includes(failure.code)) {
        try {
          const status = await monthlyPublicationRequest<MonthlyPublicationOperation>(`/status/${encodeURIComponent(operationId)}`);
          if (status.status === 'PUBLISHED') {
            const report = requireUploadedMonthlyReport(status);
            rememberMonthlyOperation(context, null);
            return report;
          }
          knownUploaded = knownUploaded || status.status === 'UPLOADED';
        } catch {
          // Keep the operation ID so the next explicit retry can recover it.
        }
      }
      const partialUpload = failure.partialUpload || knownUploaded;
      const message = partialUpload
        ? `${failure.message} PDF sudah terunggah atau menunggu konfirmasi metadata. Gunakan Pulihkan; versi dan ID file yang sama akan digunakan kembali.`
        : failure.message;
      throw new ElementaryMonthlyPublicationError(message, failure.code, operationId, partialUpload, failure.retryable);
    }
  })();
  activeMonthlyPublications.set(key, run);
  void run.finally(() => activeMonthlyPublications.delete(key)).catch(() => undefined);
  return run;
}

export async function fetchElementaryMonthlyPublicationHistory(
  context: ElementaryMonthlyPublicationContext
): Promise<PublishedElementaryMonthlyReportDoc[]> {
  const search = new URLSearchParams({ ...context });
  const result = await monthlyPublicationRequest<{ success: true; publishedReports: PublishedElementaryMonthlyReportDoc[] }>(`/history?${search.toString()}`);
  return (result.publishedReports || []).sort((a, b) => b.version - a.version);
}

export async function sendElementaryMonthlyReportToPortal(
  reportId: string,
  currentUser: User,
  expectedVersion?: number
): Promise<void> {
  const ref = doc(db, 'elem_monthly_published_reports', reportId);
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Rapor terbit tidak ditemukan.');
    const report = snap.data() as PublishedElementaryMonthlyReportDoc;
    if (!hasElementaryMonthlyPublishedPdf(report)) {
      throw new Error(report.driveFileId || report.driveFileUrl || report.fileName || report.driveFolderId
        ? 'Metadata PDF rapor belum lengkap atau belum terverifikasi. Pulihkan publikasi sebelum mengirim ke portal.'
        : 'Rapor ini baru memiliki snapshot. Terbitkan PDF ke Drive sebelum mengirim ke portal.');
    }
    if (expectedVersion !== undefined && report.version !== expectedVersion) {
      throw new Error('Versi rapor berubah. Segarkan dan periksa versi terbaru sebelum mengirim ke portal.');
    }
    const now = Date.now();
    transaction.update(ref, {
      deliveryStatus: 'SENT',
      isSentToPortal: true,
      sentAt: now,
      sentBy: currentUser.uid,
      sentByName: currentUser.displayName || '',
      updatedAt: now
    });
  });
}

export async function revokeElementaryMonthlyReportAccess(
  reportId: string,
  _currentUser: User
): Promise<void> {
  const ref = doc(db, 'elem_monthly_published_reports', reportId);
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Rapor terbit tidak ditemukan.');
    transaction.update(ref, {
      deliveryStatus: 'REVOKED',
      isSentToPortal: false,
      updatedAt: Date.now()
    });
  });
}

export async function trackElementaryMonthlyReportOpened(
  reportId: string,
  viewerEmail: string
): Promise<void> {
  const now = Date.now();
  const ref = doc(db, 'elem_monthly_published_reports', reportId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const current = snap.data() as PublishedElementaryMonthlyReportDoc;
    const newCount = (current.openCount || 0) + 1;
    await setDoc(
      ref,
      {
        isOpened: true,
        openCount: newCount,
        firstOpenedAt: current.firstOpenedAt || now,
        lastOpenedAt: now,
        openedByEmail: viewerEmail || current.openedByEmail || null
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Could not record report open tracking:', err);
  }
}

