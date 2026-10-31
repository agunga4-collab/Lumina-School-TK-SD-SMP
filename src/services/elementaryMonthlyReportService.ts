import { db, handleFirestoreError } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import type { 
  ElementaryMonthlyCurriculumDoc, 
  ElementaryMonthlyStudentScoreDoc, 
  ElementaryMonthlySubject 
} from '../types/elementaryMonthlyReport';
import type { User, Student } from '../types';

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
  curriculum: Omit<ElementaryMonthlyCurriculumDoc, 'updatedAt' | 'updatedBy' | 'updatedByName'> & {
    createdAt?: number;
    createdBy?: string;
    createdByName?: string;
  },
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
    handleFirestoreError(err, 'batch', 'elem_monthly_student_scores/bulk');
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
    handleFirestoreError(err, 'batch', 'elem_monthly_student_scores/import');
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

/**
 * Uploads an image file to Firebase Storage if available, or returns compressed base64 data URL as reliable fallback.
 */
export async function uploadMonthlyPhoto(
  file: File,
  storagePath: string
): Promise<string> {
  // Validate file size (max 10MB input before compression)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran berkas gambar maksimal 10MB.');
  }

  // Validate MIME type
  if (!file.type.startsWith('image/')) {
    throw new Error('Hanya berkas gambar (JPG, PNG, WebP) yang diperbolehkan.');
  }

  const compressedDataUrl = await compressImageToDataUrl(file);

  try {
    const { storage, ref, uploadBytes, getDownloadURL } = await import('../lib/firebase');
    if (storage) {
      // Convert data URL to Blob for storage upload
      const res = await fetch(compressedDataUrl);
      const blob = await res.blob();
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg'
      });
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    }
  } catch (storageErr) {
    console.warn('[uploadMonthlyPhoto] Firebase Storage upload skipped/failed, using optimized data URL:', storageErr);
  }

  return compressedDataUrl;
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
  projectDoc: Omit<import('../types/elementaryMonthlyReport').ElementaryMonthlyProjectDoc, 'updatedAt' | 'updatedBy' | 'updatedByName'> & {
    createdAt?: number;
    createdBy?: string;
    createdByName?: string;
  },
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
  photoDoc: Omit<import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentPhotoDoc, 'updatedAt' | 'updatedBy' | 'updatedByName'> & {
    createdAt?: number;
    createdBy?: string;
    createdByName?: string;
  },
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
            caption: s.caption !== undefined ? s.caption : mergedSnapshots[s.index].caption
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
    handleFirestoreError(err, 'batch', 'elem_monthly_student_photos/bulk');
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
  narrativeDoc: Omit<import('../types/elementaryMonthlyReport').ElementaryMonthlyStudentNarrativeDoc, 'updatedAt' | 'updatedBy' | 'updatedByName'> & {
    createdAt?: number;
    createdBy?: string;
    createdByName?: string;
  },
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
    handleFirestoreError(err, 'batch', 'elem_monthly_student_narratives/bulkSubmit');
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
    handleFirestoreError(err, 'batch', 'elem_monthly_student_narratives/bulkApprove');
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
import {
  calculateLGAverageAndPredicate,
  validateElementaryMonthlyPublishEligibility
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
  if (!config) {
    return {
      startDate: '',
      endDate: '',
      presentDays: 0,
      totalDays: 0,
      percentage: 0,
      basisDescription: 'Belum dikonfigurasi',
      isAvailable: false
    };
  }

  const record = config.studentAttendanceMap?.[studentId];
  const totalDays = (record && typeof record.totalDays === 'number' && record.totalDays > 0)
    ? record.totalDays
    : config.totalSchoolDays;

  if (!record || typeof record.presentDays !== 'number' || totalDays <= 0) {
    return {
      startDate: config.startDate || '',
      endDate: config.endDate || '',
      presentDays: 0,
      totalDays: totalDays || 0,
      percentage: 0,
      basisDescription: 'Data presensi siswa belum diisi (tidak diasumsikan 100%)',
      isAvailable: false
    };
  }

  const presentDays = Math.max(0, Math.min(record.presentDays, totalDays));
  const rawPct = (presentDays / totalDays) * 100;
  const percentage = Math.round(rawPct * 10) / 10;
  const basisDescription = `${presentDays} dari ${totalDays} hari sekolah (${percentage}%)`;

  return {
    startDate: config.startDate || '',
    endDate: config.endDate || '',
    presentDays,
    totalDays,
    percentage,
    basisDescription,
    isAvailable: true
  };
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

/**
 * Builds an immutable snapshot and publishes the Monthly Report for a student.
 */
export async function publishElementaryMonthlyReport(params: {
  student: Student;
  classId: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: string;
  month: string;
  curriculumDoc: ElementaryMonthlyCurriculumDoc;
  studentScoreDoc: ElementaryMonthlyStudentScoreDoc | null;
  projectDoc: ElementaryMonthlyProjectDoc | null;
  photoDoc: ElementaryMonthlyStudentPhotoDoc | null;
  narrativeDoc: ElementaryMonthlyStudentNarrativeDoc | null;
  attendanceConfig: ElementaryMonthlyAttendanceConfig | null;
  signatory: ElementaryMonthlyReportSignatory;
  currentUser: User;
}): Promise<PublishedElementaryMonthlyReportDoc> {
  const {
    student,
    classId,
    className,
    gradeLevel,
    academicYear,
    semester,
    month,
    curriculumDoc,
    studentScoreDoc,
    projectDoc,
    photoDoc,
    narrativeDoc,
    attendanceConfig,
    signatory,
    currentUser
  } = params;

  const attendanceSummary = calculateStudentAttendanceSummary(attendanceConfig, student.id);

  // Pre-publish gate validation
  const validation = validateElementaryMonthlyPublishEligibility({
    student: { id: student.id, name: student.name },
    curriculumDoc,
    studentScoreDoc,
    narrativeDoc,
    projectDoc,
    photoDoc,
    attendanceSummary,
    signatory
  });

  if (!validation.isEligible) {
    throw new Error(`Gagal mempublikasikan rapor: ${validation.blockingReasons.join(' ')}`);
  }

  // Calculate LG results summary for the snapshot
  const scores = studentScoreDoc?.scores || {};
  const lgResults: Record<string, any> = {};
  for (const sub of curriculumDoc.subjects) {
    for (const lg of sub.learningGoals || []) {
      const kkm = lg.kkmOverride || sub.kkm || 70;
      lgResults[lg.id] = calculateLGAverageAndPredicate(scores, lg.learningObjectives || [], kkm);
    }
  }

  const docId = buildPublishedMonthlyReportDocId(academicYear, semester, month, classId, student.id);
  const now = Date.now();

  // Check if existing document to increment version
  let version = 1;
  let prevDoc: PublishedElementaryMonthlyReportDoc | null = null;
  try {
    const existingSnap = await getDoc(doc(db, 'elem_monthly_published_reports', docId));
    if (existingSnap.exists()) {
      prevDoc = existingSnap.data() as PublishedElementaryMonthlyReportDoc;
      version = (prevDoc.version || 1) + 1;
    }
  } catch (e) {
    console.warn('Could not read previous published report version:', e);
  }

  const snapshot: ElementaryMonthlyReportSnapshot = {
    student: {
      id: student.id,
      name: student.name,
      nisn: (student as any).nisn || (student as any).nis || '-',
      className,
      grade: gradeLevel
    },
    academicYear,
    semester,
    month,
    monthLabel: formatMonthLabel(month),
    curriculum: curriculumDoc,
    scoresSummary: {
      scores,
      lgResults
    },
    project: {
      projectTitle: projectDoc!.projectTitle,
      projectOverview: projectDoc!.projectOverview,
      sharedAlbumLink: projectDoc?.sharedAlbumLink || ''
    },
    photos: {
      identityPhotoUrl: photoDoc?.identityPhotoUrl || '',
      snapshots: photoDoc!.snapshots,
      albumLink: photoDoc?.albumLink || ''
    },
    narratives: {
      academicComment: narrativeDoc!.academicComment,
      selProfile: narrativeDoc!.selProfile,
      approvedByName: narrativeDoc?.approvedByName || '',
      approvedAt: narrativeDoc?.approvedAt || now
    },
    attendance: attendanceSummary,
    signatory
  };

  const publishedDoc: PublishedElementaryMonthlyReportDoc = {
    id: docId,
    unit: 'ELEMENTARY',
    reportType: 'MONTHLY_REPORT',
    studentId: student.id,
    studentNameSnapshot: student.name,
    nisnSnapshot: (student as any).nisn || (student as any).nis || '-',
    classId,
    classNameSnapshot: className,
    gradeSnapshot: gradeLevel,
    academicYear,
    semester,
    month,
    monthLabel: formatMonthLabel(month),
    version,
    status: 'PUBLISHED',
    deliveryStatus: prevDoc?.deliveryStatus || 'NOT_SENT',
    isSentToPortal: prevDoc?.isSentToPortal || false,
    sentAt: prevDoc?.sentAt || null,
    sentBy: prevDoc?.sentBy || null,
    sentByName: prevDoc?.sentByName || null,
    reportSnapshot: snapshot,
    generatedBy: currentUser.uid || (currentUser as any).id || 'system',
    generatedByName: currentUser.displayName || currentUser.name || 'Guru',
    generatedAt: now,
    isOpened: prevDoc?.isOpened || false,
    firstOpenedAt: prevDoc?.firstOpenedAt || null,
    lastOpenedAt: prevDoc?.lastOpenedAt || null,
    openCount: prevDoc?.openCount || 0,
    openedByEmail: prevDoc?.openedByEmail || null,
    createdAt: prevDoc?.createdAt || now,
    updatedAt: now
  };

  await setDoc(doc(db, 'elem_monthly_published_reports', docId), publishedDoc);
  return publishedDoc;
}

export async function sendElementaryMonthlyReportToPortal(
  reportId: string,
  currentUser: User
): Promise<void> {
  const now = Date.now();
  const ref = doc(db, 'elem_monthly_published_reports', reportId);
  await setDoc(
    ref,
    {
      deliveryStatus: 'SENT',
      isSentToPortal: true,
      sentAt: now,
      sentBy: currentUser.uid || (currentUser as any).id || 'system',
      sentByName: currentUser.displayName || currentUser.name || 'Guru',
      updatedAt: now
    },
    { merge: true }
  );
}

export async function revokeElementaryMonthlyReportAccess(
  reportId: string,
  currentUser: User
): Promise<void> {
  const now = Date.now();
  const ref = doc(db, 'elem_monthly_published_reports', reportId);
  await setDoc(
    ref,
    {
      deliveryStatus: 'REVOKED',
      isSentToPortal: false,
      updatedAt: now
    },
    { merge: true }
  );
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

