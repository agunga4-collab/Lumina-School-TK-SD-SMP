/**
 * Helpers and utilities for Junior High Monthly Report PDF generation
 */

import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

export interface PublishedReportMetadata {
  id?: string;
  unit: "JUNIOR_HIGH";
  reportType: "MONTHLY_REPORT";

  studentId: string;
  studentNameSnapshot: string;
  classId: string;
  classNameSnapshot: string;
  gradeSnapshot: number;
  attendanceNumberSnapshot: number;

  academicYear: string;
  semester: string;
  periodKey: string;
  periodLabel: string;

  version: number;

  driveFolderId: string;
  driveFileId: string;
  driveFileUrl: string;
  fileName: string;

  generatedBy: string;
  generatedAt: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Normalizes filenames according to the specified constraints:
 * - base pattern: Monthly_Report_Junior_High_[Class]_[StudentName]_[YYYY-MM].pdf
 * - replace whitespace with '-'
 * - collapse repeated '-'
 * - remove filesystem-invalid characters: /, \, :, *, ?, ", <, >, |
 * - retain selected periodKey exactly as YYYY-MM
 * - never use NIS/NISN or UID in filename
 */
export function normalizeFilename(className: string, studentName: string, periodKey: string): string {
  let cleanClass = className.replace(/\s+/g, '-');
  let cleanStudent = studentName.replace(/\s+/g, '-');

  const invalidChars = /[\/\\:\*\?"<>\|]/g;
  cleanClass = cleanClass.replace(invalidChars, '');
  cleanStudent = cleanStudent.replace(invalidChars, '');

  const base = `Monthly_Report_Junior_High_${cleanClass}_${cleanStudent}_${periodKey}`;
  const normalized = base.replace(/-+/g, '-');

  return `${normalized}.pdf`;
}

/**
 * Queries existing records to determine the next version number for a student/period context.
 */
export async function getNextReportVersion(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  periodKey: string
): Promise<number> {
  try {
    const q = query(
      collection(db, 'published_junior_high_monthly_reports'),
      where('unit', '==', 'JUNIOR_HIGH'),
      where('reportType', '==', 'MONTHLY_REPORT'),
      where('studentId', '==', studentId),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('periodKey', '==', periodKey)
    );

    const snap = await getDocs(q);
    if (snap.empty) {
      return 1;
    }

    let maxVersion = 0;
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.version === 'number' && data.version > maxVersion) {
        maxVersion = data.version;
      }
    });

    return maxVersion + 1;
  } catch (err: any) {
    console.error('[DEV DEBUG] GET NEXT VERSION FAILURE DETECTED', {
      operationName: 'getNextReportVersion',
      collectionPath: 'published_junior_high_monthly_reports',
      operationType: 'read/query',
      studentId,
      classId,
      academicYear,
      semester,
      periodKey,
      firebaseErrorCode: err?.code || 'N/A',
      firebaseErrorMessage: err?.message || String(err),
    });
    console.error('[getNextReportVersion] Error calculating next version:', err);
    return 1; // Default to 1 on failure to prevent blocking
  }
}

/**
 * Saves a single publish log metadata to Firestore
 * Uses the deterministic base identity path:
 * JUNIOR_HIGH_MONTHLY_REPORT_${studentId}_${classId}_${academicYearNormalized}_${semester}_${periodKey}_v${version}
 */
export async function savePublishedReportMetadata(
  metadata: Omit<PublishedReportMetadata, 'createdAt' | 'updatedAt'>
): Promise<void> {
  const { studentId, classId, academicYear, semester, periodKey, version } = metadata;
  const academicYearNormalized = academicYear.replace(/\//g, '-');
  
  const docId = `JUNIOR_HIGH_MONTHLY_REPORT_${studentId}_${classId}_${academicYearNormalized}_${semester}_${periodKey}_v${version}`;
  const docRef = doc(db, 'published_junior_high_monthly_reports', docId);

  const timestamp = Date.now();
  const fullMetadata = {
    ...metadata,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setDoc(docRef, fullMetadata);
}

/**
 * Fetches the latest published report for the given context
 */
export async function getLatestPublishedReport(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  periodKey: string
): Promise<PublishedReportMetadata | null> {
  try {
    const q = query(
      collection(db, 'published_junior_high_monthly_reports'),
      where('unit', '==', 'JUNIOR_HIGH'),
      where('reportType', '==', 'MONTHLY_REPORT'),
      where('studentId', '==', studentId),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('periodKey', '==', periodKey)
    );

    const snap = await getDocs(q);
    if (snap.empty) {
      return null;
    }

    let latestDoc: PublishedReportMetadata | null = null;
    snap.forEach((d) => {
      const data = { id: d.id, ...d.data() } as PublishedReportMetadata;
      if (!latestDoc || data.version > latestDoc.version) {
        latestDoc = data;
      }
    });

    return latestDoc;
  } catch (err) {
    console.error('[getLatestPublishedReport] Error loading latest report:', err);
    return null;
  }
}
