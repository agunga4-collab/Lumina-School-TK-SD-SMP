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
  ElementaryMonthlySubject 
} from '../types/elementaryMonthlyReport';
import type { User, Student, Class } from '../types';
import {
  buildElementaryMonthlyAttendanceSummary,
  resolveElementaryMonthlyTeacherId,
  resolveElementaryMonthlyLogo,
  resolveElementaryMonthlySignatory
} from '../lib/elementaryMonthlyReportModel';

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

export function normalizeAcademicYear(academicYear: string): string {
  return academicYear ? academicYear.replace(/\//g, '_') : '2025_2026';
}

export function buildMonthlyCurriculumDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildMonthlyStudentScoreDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function formatMonthLabel(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, mStr] = monthStr.split('-');
  const mIndex = parseInt(mStr, 10) - 1;
  if (mIndex >= 0 && mIndex < 12) {
    return `${MONTH_NAMES_ID[mIndex]} ${yearStr}`;
  }
  return monthStr;
}

/**
 * Returns sensible months for Semester 1 (July - Dec) or Semester 2 (Jan - June)
 * based on academic year, e.g. "2025/2026".
 */
export function getMonthOptionsForAcademicYear(academicYear: string, semester: string): Array<{ value: string; label: string }> {
  const parts = academicYear.split('/');
  const startYear = parseInt(parts[0], 10) || 2025;
  const endYear = parseInt(parts[1], 10) || (startYear + 1);

  if (semester === '1') {
    // July to Dec of startYear
    return [
      { value: `${startYear}-07`, label: `Juli ${startYear}` },
      { value: `${startYear}-08`, label: `Agustus ${startYear}` },
      { value: `${startYear}-09`, label: `September ${startYear}` },
      { value: `${startYear}-10`, label: `Oktober ${startYear}` },
      { value: `${startYear}-11`, label: `November ${startYear}` },
      { value: `${startYear}-12`, label: `Desember ${startYear}` },
    ];
  } else {
    // January to June of endYear
    return [
      { value: `${endYear}-01`, label: `Januari ${endYear}` },
      { value: `${endYear}-02`, label: `Februari ${endYear}` },
      { value: `${endYear}-03`, label: `Maret ${endYear}` },
      { value: `${endYear}-04`, label: `April ${endYear}` },
      { value: `${endYear}-05`, label: `Mei ${endYear}` },
      { value: `${endYear}-06`, label: `Juni ${endYear}` },
    ];
  }
}

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

export function buildMonthlyProjectDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildMonthlyStudentPhotoDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildMonthlyStudentNarrativeDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

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
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format berkas gambar tidak valid atau rusak.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to raw data url if canvas is not available
          return resolve(e.target?.result as string);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const ELEMENTARY_MONTHLY_ROOT_FOLDER_ID = '18HrRf50BaVoID2zUJBkgu7Okn6huBhlP';

export interface UploadSharedDrivePhotoParams {
  file: File;
  academicYear: string;
  gradeLevel?: number;
  gradeCategory?: 'Lower Grade' | 'Upper Grade';
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  month: string;
  slot: 'profile' | 'activity1' | 'activity2' | 'activity3';
  version?: number;
  caption?: string;
  cropSettings?: any;
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
  cropSettings?: any;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: number;
}

/**
 * Verifies accessibility of Google Shared Drive root folder (18HrRf50BaVoID2zUJBkgu7Okn6huBhlP).
 */
export async function verifyElementaryMonthlyDriveRoot(): Promise<{
  ok: boolean;
  folderName?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/elementary-monthly/verify-root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { ok: false, error: data.error || 'Akses Google Shared Drive ditolak.' };
    }
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
    gradeLevel,
    gradeCategory,
    classId,
    className,
    studentId,
    studentName,
    month,
    slot,
    version = 1,
    caption = '',
    cropSettings = null,
    user
  } = params;

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran berkas gambar maksimal 10MB.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Hanya berkas gambar (JPG, PNG, WebP) yang diperbolehkan.');
  }

  // Compress image client-side before sending to server
  const compressedDataUrl = await compressImageToDataUrl(file);

  const payload = {
    base64: compressedDataUrl,
    academicYear,
    gradeLevel,
    gradeCategory,
    classId,
    className,
    studentId,
    studentName,
    month,
    slot,
    version,
    caption,
    cropSettings,
    uploadedBy: user?.uid || (user as any)?.id || 'unknown',
    uploadedByName: user?.displayName || (user as any)?.name || 'Guru'
  };

  const response = await fetch('/api/elementary-monthly/upload-photo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `Upload foto ke Google Shared Drive gagal (HTTP ${response.status}).`);
  }

  const result = await response.json();
  if (!result.success || !result.photo) {
    throw new Error(result.error || 'Upload foto ke Google Shared Drive tidak mengembalikan data berkas.');
  }

  return result.photo;
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
    return {};
  }
}

/**
 * Saves photo documentation for a single student.
 */
export async function saveElementaryMonthlyStudentPhotoDoc(
  photoDoc: ElementaryMonthlyWriteInput<import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc>,
  user?: User | null
): Promise<void> {
  try {
    const docId = buildMonthlyStudentPhotoDocId(
      photoDoc.studentId,
      photoDoc.classId,
      photoDoc.academicYear,
      photoDoc.semester,
      photoDoc.month
    );
    const docRef = doc(db, 'elem_monthly_student_photos', docId);

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const payload: import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc = {
      ...photoDoc,
      id: docId,
      createdAt: photoDoc.createdAt || now,
      createdBy: photoDoc.createdBy || userId,
      createdByName: photoDoc.createdByName || userName,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `elem_monthly_student_photos/${photoDoc.studentId}`);
    throw err;
  }
}

/**
 * Bulk applies photos, captions, and/or album link to selected students.
 * Maintains individual editability per student.
 */
export async function bulkApplyElementaryMonthlyPhotos(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  targetStudentIds: string[];
  students: Student[];
  snapshotsToApply: { index: number; url: string; caption: string }[];
  albumLinkToApply?: string;
  existingPhotosMap: Record<string, import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc>;
  user?: User | null;
}): Promise<number> {
  const {
    classId, academicYear, semester, month,
    targetStudentIds, students, snapshotsToApply,
    albumLinkToApply, existingPhotosMap, user
  } = params;

  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';
    let count = 0;

    for (const student of students) {
      if (!targetStudentIds.includes(student.id)) continue;

      const docId = buildMonthlyStudentPhotoDocId(student.id, classId, academicYear, semester, month);
      const docRef = doc(db, 'elem_monthly_student_photos', docId);
      const existing = existingPhotosMap[student.id];

      // Merge snapshots: replace only the ones provided in snapshotsToApply
      const mergedSnapshots: [
        import('../types/elementaryMonthlyReport').ElementaryMonthlyPhotoSnapshot,
        import('../types/elementaryMonthlyReport').ElementaryMonthlyPhotoSnapshot,
        import('../types/elementaryMonthlyReport').ElementaryMonthlyPhotoSnapshot
      ] = [
        existing?.snapshots?.[0] || { index: 0, url: '', caption: '' },
        existing?.snapshots?.[1] || { index: 1, url: '', caption: '' },
        existing?.snapshots?.[2] || { index: 2, url: '', caption: '' }
      ];

      snapshotsToApply.forEach(s => {
        if (s.index >= 0 && s.index < 3) {
          mergedSnapshots[s.index] = {
            index: s.index,
            url: s.url !== undefined ? s.url : mergedSnapshots[s.index].url,
            caption: s.caption !== undefined ? s.caption : mergedSnapshots[s.index].caption,
            driveFileId: (s as any).driveFileId ?? mergedSnapshots[s.index].driveFileId,
            folderId: (s as any).folderId ?? mergedSnapshots[s.index].folderId,
            fileName: (s as any).fileName ?? mergedSnapshots[s.index].fileName,
            mimeType: (s as any).mimeType ?? mergedSnapshots[s.index].mimeType,
            fileSize: (s as any).fileSize ?? mergedSnapshots[s.index].fileSize,
            version: (s as any).version ?? mergedSnapshots[s.index].version,
            cropSettings: (s as any).cropSettings ?? mergedSnapshots[s.index].cropSettings,
            uploadedBy: (s as any).uploadedBy ?? mergedSnapshots[s.index].uploadedBy,
            uploadedByName: (s as any).uploadedByName ?? mergedSnapshots[s.index].uploadedByName,
            uploadedAt: (s as any).uploadedAt ?? mergedSnapshots[s.index].uploadedAt
          };
        }
      });

      const payload: import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc = {
        id: docId,
        studentId: student.id,
        studentName: student.name,
        classId,
        academicYear,
        semester,
        month,
        identityPhotoUrl: existing?.identityPhotoUrl || '',
        snapshots: mergedSnapshots,
        albumLink: albumLinkToApply !== undefined ? albumLinkToApply : (existing?.albumLink || ''),
        createdAt: existing?.createdAt || now,
        createdBy: existing?.createdBy || userId,
        createdByName: existing?.createdByName || userName,
        updatedAt: now,
        updatedBy: userId,
        updatedByName: userName
      };

      batch.set(docRef, payload, { merge: true });
      count++;
    }

    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'elem_monthly_student_photos/bulk');
    throw err;
  }
}

// ==========================================
// TAHAP 2: NARASI & APPROVAL SERVICES
// ==========================================

export function isElementaryHeadOrSuperAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role || (user as any).roleId || '').toUpperCase();
  if (['SUPER_ADMIN', 'ADMIN'].includes(role)) return true;
  if (['HEAD_UNIT', 'HEAD_ELEMENTARY', 'PRINCIPAL'].includes(role)) {
    const unit = ((user as any).unitId || (user as any).unit || '').toUpperCase();
    return !unit || unit === 'ELEMENTARY' || unit === 'ALL';
  }
  return false;
}

/**
 * Computes a hash or fingerprint of student scores to detect changes after narrative submission/approval.
 */
export function computeStudentScoresHash(scoresDoc: ElementaryMonthlyStudentScoreDoc | null): string {
  if (!scoresDoc || !scoresDoc.scores) return '';
  const entries = Object.entries(scoresDoc.scores).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([loId, val]) => `${loId}:${val}`).join('|');
}

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
  try {
    const docId = buildMonthlyStudentNarrativeDocId(
      narrativeDoc.studentId,
      narrativeDoc.classId,
      narrativeDoc.academicYear,
      narrativeDoc.semester,
      narrativeDoc.month
    );
    const docRef = doc(db, 'elem_monthly_student_narratives', docId);

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const payload: import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc = {
      ...narrativeDoc,
      id: docId,
      reviewStatus: narrativeDoc.reviewStatus || 'DRAFT',
      createdAt: narrativeDoc.createdAt || now,
      createdBy: narrativeDoc.createdBy || userId,
      createdByName: narrativeDoc.createdByName || userName,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `elem_monthly_student_narratives/${narrativeDoc.studentId}`);
    throw err;
  }
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
  const { studentId, studentName, classId, academicYear, semester, month, currentScoresHash, user } = params;
  try {
    const docId = buildMonthlyStudentNarrativeDocId(studentId, classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_student_narratives', docId);

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const updateData: Partial<import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc> = {
      reviewStatus: 'SUBMITTED',
      submittedAt: now,
      submittedBy: userId,
      submittedByName: userName,
      lastScoresHash: currentScoresHash || '',
      isSourceStale: false,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, updateData, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `elem_monthly_student_narratives/${studentId}/submit`);
    throw err;
  }
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
  const { classId, academicYear, semester, month, studentIds, scoresMap, user } = params;
  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';
    let count = 0;

    for (const studentId of studentIds) {
      const docId = buildMonthlyStudentNarrativeDocId(studentId, classId, academicYear, semester, month);
      const docRef = doc(db, 'elem_monthly_student_narratives', docId);
      const scoresHash = computeStudentScoresHash(scoresMap[studentId] || null);

      batch.set(docRef, {
        reviewStatus: 'SUBMITTED',
        submittedAt: now,
        submittedBy: userId,
        submittedByName: userName,
        lastScoresHash: scoresHash,
        isSourceStale: false,
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
    handleFirestoreError(err, 'write', 'elem_monthly_student_narratives/bulkSubmit');
    throw err;
  }
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
  const { studentId, classId, academicYear, semester, month, action, reviewNotes, reviewer } = params;

  if (!isElementaryHeadOrSuperAdmin(reviewer)) {
    throw new Error('Hanya Head of Unit Elementary atau Super Admin yang berwenang meninjau atau menyetujui narasi.');
  }

  if (action === 'REQUEST_REVISION' && (!reviewNotes || !reviewNotes.trim())) {
    throw new Error('Catatan revisi wajib diisi saat meminta revisi narasi.');
  }

  try {
    const docId = buildMonthlyStudentNarrativeDocId(studentId, classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_student_narratives', docId);

    const now = Date.now();
    const reviewerId = reviewer?.uid || (reviewer as any)?.id || 'unknown';
    const reviewerName = reviewer?.displayName || (reviewer as any)?.name || 'Head Unit';
    const reviewerRole = (reviewer?.role || (reviewer as any)?.roleId || 'HEAD_UNIT').toUpperCase();

    const updateData: Partial<import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc> = {
      reviewStatus: action === 'APPROVE' ? 'APPROVED' : 'NEEDS_REVISION',
      reviewNotes: action === 'REQUEST_REVISION' ? reviewNotes!.trim() : (reviewNotes || ''),
      reviewedAt: now,
      reviewedBy: reviewerId,
      reviewedByName: reviewerName,
      reviewedRole: reviewerRole,
      updatedAt: now,
      updatedBy: reviewerId,
      updatedByName: reviewerName
    };

    await setDoc(docRef, updateData, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `elem_monthly_student_narratives/${studentId}/review`);
    throw err;
  }
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
  const { classId, academicYear, semester, month, studentIds, reviewer } = params;

  if (!isElementaryHeadOrSuperAdmin(reviewer)) {
    throw new Error('Hanya Head of Unit Elementary atau Super Admin yang berwenang menyetujui narasi.');
  }

  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const reviewerId = reviewer?.uid || (reviewer as any)?.id || 'unknown';
    const reviewerName = reviewer?.displayName || (reviewer as any)?.name || 'Head Unit';
    const reviewerRole = (reviewer?.role || (reviewer as any)?.roleId || 'HEAD_UNIT').toUpperCase();
    let count = 0;

    for (const studentId of studentIds) {
      const docId = buildMonthlyStudentNarrativeDocId(studentId, classId, academicYear, semester, month);
      const docRef = doc(db, 'elem_monthly_student_narratives', docId);

      batch.set(docRef, {
        reviewStatus: 'APPROVED',
        reviewedAt: now,
        reviewedBy: reviewerId,
        reviewedByName: reviewerName,
        reviewedRole: reviewerRole,
        updatedAt: now,
        updatedBy: reviewerId,
        updatedByName: reviewerName
      }, { merge: true });

      count++;
    }

    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'elem_monthly_student_narratives/bulkApprove');
    throw err;
  }
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
  const { studentId, classId, academicYear, semester, month, user } = params;
  try {
    const docId = buildMonthlyStudentNarrativeDocId(studentId, classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_student_narratives', docId);

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    await setDoc(docRef, {
      reviewStatus: 'DRAFT',
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    }, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `elem_monthly_student_narratives/${studentId}/unlock`);
    throw err;
  }
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
  ElementaryMonthlyStudentPhotoDoc,
  ElementaryMonthlyStudentNarrativeDoc
} from '../types/elementaryMonthlyReport';

export function buildMonthlyAttendanceConfigDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildPublishedMonthlyReportDocId(
  academicYear: string,
  semester: string,
  month: string,
  classId: string,
  studentId: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${normYear}_S${semester}_M${month}_${classId}_${studentId}`;
}

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
export function calculateStudentAttendanceSummary(
  config: ElementaryMonthlyAttendanceConfig | null,
  studentId: string
): ElementaryMonthlyAttendanceSummary {
  return buildElementaryMonthlyAttendanceSummary(config, studentId);
}

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

