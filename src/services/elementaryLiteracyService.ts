import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase.ts';
import {
  ElementaryProgressRecord,
  ElementaryArea,
  ElementaryPeriod
} from '../types/elementaryLiteracyNumeracy';
import {
  calculateWpm,
  getReadingSupportStatus,
  getMengajiSupportStatus
} from '../constants/elementaryLiteracyBenchmarks';

const COLLECTION = 'elementary_literacy_numeracy_records';

/**
 * Sanitizes record to replace undefined values with null to prevent Firestore save errors.
 */
function sanitizeRecord(record: any): any {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) {
      cleaned[key] = null;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export const elementaryLiteracyService = {
  /**
   * Save a single progress record
   */
  async saveProgressRecord(record: Omit<ElementaryProgressRecord, 'updatedAt'> & { id?: string }): Promise<string> {
    try {
      const enriched = { ...record } as any;

      // Auto-calculate WPM and Support Status for Reading areas if wordsRead & errors are present
      if (
        (enriched.area === 'BAHASA_INDONESIA' || enriched.area === 'ENGLISH_READING')
      ) {
        const hasWords = enriched.wordsRead !== undefined && enriched.wordsRead !== null && enriched.wordsRead !== '';
        const hasErrs = enriched.errors !== undefined && enriched.errors !== null && enriched.errors !== '';
        
        if (hasWords && hasErrs) {
          const wpm = calculateWpm(Number(enriched.wordsRead), Number(enriched.errors));
          const compRaw = enriched.comprehensionScore;
          const comprehension = (compRaw === 'N/A' || compRaw === null || compRaw === undefined || compRaw === '') ? 'N/A' : Number(compRaw);
          enriched.wpm = wpm;
          enriched.supportStatus = getReadingSupportStatus(
            Number(enriched.gradeLevel),
            enriched.period,
            wpm,
            compRaw === 'N/A' ? 'N/A' : (compRaw === '' || compRaw === null || compRaw === undefined ? null : Number(compRaw))
          );
        } else {
          enriched.wpm = null;
          enriched.supportStatus = 'INCOMPLETE_DATA';
        }
      } else if (enriched.area === 'MENGAJI') {
        enriched.supportStatus = getMengajiSupportStatus(enriched.completionStatus || '');
      }

      const docId = enriched.id || `${enriched.studentId}_${enriched.period}_${enriched.area}_${enriched.schoolYear.replace(/\//g, '-')}`;
      enriched.id = docId;
      enriched.updatedAt = Date.now();

      const docRef = doc(db, COLLECTION, docId);
      await setDoc(docRef, sanitizeRecord(enriched), { merge: true });
      return docId;
    } catch (error) {
      return handleFirestoreError(error, 'write', COLLECTION);
    }
  },

  /**
   * Update an existing progress record
   */
  async updateProgressRecord(id: string, payload: Partial<ElementaryProgressRecord>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, id);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        throw new Error(`Record with ID ${id} not found.`);
      }

      const existing = snap.data() as ElementaryProgressRecord;
      const merged = { ...existing, ...payload } as any;

      if (
        (merged.area === 'BAHASA_INDONESIA' || merged.area === 'ENGLISH_READING')
      ) {
        const hasWords = merged.wordsRead !== undefined && merged.wordsRead !== null && merged.wordsRead !== '';
        const hasErrs = merged.errors !== undefined && merged.errors !== null && merged.errors !== '';
        
        if (hasWords && hasErrs) {
          const wpm = calculateWpm(Number(merged.wordsRead), Number(merged.errors));
          const compRaw = merged.comprehensionScore;
          const comprehension = (compRaw === 'N/A' || compRaw === null || compRaw === undefined || compRaw === '') ? 'N/A' : Number(compRaw);
          merged.wpm = wpm;
          merged.supportStatus = getReadingSupportStatus(
            Number(merged.gradeLevel),
            merged.period,
            wpm,
            compRaw === 'N/A' ? 'N/A' : (compRaw === '' || compRaw === null || compRaw === undefined ? null : Number(compRaw))
          );
        } else {
          merged.wpm = null;
          merged.supportStatus = 'INCOMPLETE_DATA';
        }
      } else if (merged.area === 'MENGAJI') {
        merged.supportStatus = getMengajiSupportStatus(merged.completionStatus || '');
      }

      merged.updatedAt = Date.now();

      await updateDoc(docRef, sanitizeRecord(merged));
    } catch (error) {
      return handleFirestoreError(error, 'update', `${COLLECTION}/${id}`);
    }
  },

  /**
   * Get progress records filtered by class and optional period and area
   */
  async getRecordsByClass(
    schoolYear: string,
    gradeLevel: number,
    classId: string,
    period?: ElementaryPeriod,
    area?: ElementaryArea
  ): Promise<ElementaryProgressRecord[]> {
    try {
      let q = query(
        collection(db, COLLECTION),
        where('schoolYear', '==', schoolYear),
        where('gradeLevel', '==', Number(gradeLevel)),
        where('classId', '==', classId)
      );

      if (period) {
        q = query(q, where('period', '==', period));
      }

      if (area) {
        q = query(q, where('area', '==', area));
      }

      const snap = await getDocs(q);
      const records: ElementaryProgressRecord[] = [];
      snap.forEach((docSnap) => {
        records.push(docSnap.data() as ElementaryProgressRecord);
      });

      return records;
    } catch (error) {
      return handleFirestoreError(error, 'list', COLLECTION);
    }
  },

  /**
   * Get historical performance of a student
   */
  async getStudentHistory(
    studentId: string,
    schoolYear?: string,
    area?: ElementaryArea
  ): Promise<ElementaryProgressRecord[]> {
    try {
      let q = query(collection(db, COLLECTION), where('studentId', '==', studentId));

      if (schoolYear) {
        q = query(q, where('schoolYear', '==', schoolYear));
      }

      if (area) {
        q = query(q, where('area', '==', area));
      }

      const snap = await getDocs(q);
      const records: ElementaryProgressRecord[] = [];
      snap.forEach((docSnap) => {
        records.push(docSnap.data() as ElementaryProgressRecord);
      });

      return records;
    } catch (error) {
      return handleFirestoreError(error, 'list', COLLECTION);
    }
  },

  /**
   * Bulk insert/update progress records in a single batch
   */
  async bulkUpsertRecords(records: (Omit<ElementaryProgressRecord, 'updatedAt'> & { id?: string })[]): Promise<void> {
    try {
      const batch = writeBatch(db);

      for (const record of records) {
        const enriched = { ...record } as any;

        if (
          (enriched.area === 'BAHASA_INDONESIA' || enriched.area === 'ENGLISH_READING')
        ) {
          const hasWords = enriched.wordsRead !== undefined && enriched.wordsRead !== null && enriched.wordsRead !== '';
          const hasErrs = enriched.errors !== undefined && enriched.errors !== null && enriched.errors !== '';
          
          if (hasWords && hasErrs) {
            const wpm = calculateWpm(Number(enriched.wordsRead), Number(enriched.errors));
            const compRaw = enriched.comprehensionScore;
            const comprehension = (compRaw === 'N/A' || compRaw === null || compRaw === undefined || compRaw === '') ? 'N/A' : Number(compRaw);
            enriched.wpm = wpm;
            enriched.supportStatus = getReadingSupportStatus(
              Number(enriched.gradeLevel),
              enriched.period,
              wpm,
              compRaw === 'N/A' ? 'N/A' : (compRaw === '' || compRaw === null || compRaw === undefined ? null : Number(compRaw))
            );
          } else {
            enriched.wpm = null;
            enriched.supportStatus = 'INCOMPLETE_DATA';
          }
        } else if (enriched.area === 'MENGAJI') {
          enriched.supportStatus = getMengajiSupportStatus(enriched.completionStatus || '');
        }

        const docId = enriched.id || `${enriched.studentId}_${enriched.period}_${enriched.area}_${enriched.schoolYear.replace(/\//g, '-')}`;
        enriched.id = docId;
        enriched.updatedAt = Date.now();

        const docRef = doc(db, COLLECTION, docId);
        batch.set(docRef, sanitizeRecord(enriched), { merge: true });
      }

      await batch.commit();
    } catch (error) {
      return handleFirestoreError(error, 'write', COLLECTION);
    }
  }
};
