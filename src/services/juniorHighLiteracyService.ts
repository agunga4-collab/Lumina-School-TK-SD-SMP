import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase.ts';
import {
  JuniorHighProgressRecord,
  JuniorHighArea,
  JuniorHighSessionKey
} from '../types/juniorHighLiteracyNumeracy';
import {
  calculateWpm,
} from '../constants/juniorHighLiteracyBenchmarks';

const COLLECTION = 'junior_high_literacy_numeracy_records';

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

export const juniorHighLiteracyService = {
  /**
   * Save a single progress record
   */
  async saveProgressRecord(record: Omit<JuniorHighProgressRecord, 'updatedAt'> & { id?: string }): Promise<string> {
    try {
      const enriched = { ...record } as any;

      // Ensure standard keys
      enriched.unit = 'JUNIOR_HIGH';
      
      // Auto-calculate WPM for English Reading if wordsRead & errors are present
      if (enriched.subjectArea === 'ENGLISH_READING') {
        const hasWords = enriched.wordsRead !== undefined && enriched.wordsRead !== null && enriched.wordsRead !== '';
        const hasErrs = enriched.errors !== undefined && enriched.errors !== null && enriched.errors !== '';
        
        if (hasWords && hasErrs) {
          const wpm = calculateWpm(Number(enriched.wordsRead), Number(enriched.errors));
          enriched.wpm = wpm;
        } else {
          enriched.wpm = null;
        }
      }

      // Backward-compatibility field mappings
      enriched.period = enriched.sessionKey;
      enriched.area = enriched.subjectArea;
      enriched.teacherId = enriched.updatedBy;

      const docId = enriched.id || `${enriched.studentId}_${enriched.sessionKey}_${enriched.subjectArea}_${enriched.schoolYear.replace(/\//g, '-')}`;
      enriched.id = docId;
      enriched.updatedAt = serverTimestamp();

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
  async updateProgressRecord(id: string, payload: Partial<JuniorHighProgressRecord>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, id);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        throw new Error(`Record with ID ${id} not found.`);
      }

      const existing = snap.data() as JuniorHighProgressRecord;
      const merged = { ...existing, ...payload } as any;

      if (merged.subjectArea === 'ENGLISH_READING') {
        const hasWords = merged.wordsRead !== undefined && merged.wordsRead !== null && merged.wordsRead !== '';
        const hasErrs = merged.errors !== undefined && merged.errors !== null && merged.errors !== '';
        
        if (hasWords && hasErrs) {
          const wpm = calculateWpm(Number(merged.wordsRead), Number(merged.errors));
          merged.wpm = wpm;
        } else {
          merged.wpm = null;
        }
      }

      merged.updatedAt = serverTimestamp();

      await updateDoc(docRef, sanitizeRecord(merged));
    } catch (error) {
      return handleFirestoreError(error, 'update', `${COLLECTION}/${id}`);
    }
  },

  /**
   * Get progress records filtered by class, schoolYear, sessionKey, and subjectArea
   */
  async getRecordsByClass(
    schoolYear: string,
    gradeLevel: number,
    classId: string,
    sessionKey: JuniorHighSessionKey,
    subjectArea: JuniorHighArea
  ): Promise<JuniorHighProgressRecord[]> {
    try {
      const q = query(
        collection(db, COLLECTION),
        where('unit', '==', 'JUNIOR_HIGH'),
        where('schoolYear', '==', schoolYear),
        where('sessionKey', '==', sessionKey),
        where('subjectArea', '==', subjectArea),
        where('classId', '==', classId)
      );

      const snap = await getDocs(q);
      const records: JuniorHighProgressRecord[] = [];
      snap.forEach((docSnap) => {
        records.push(docSnap.data() as JuniorHighProgressRecord);
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
    subjectArea?: JuniorHighArea
  ): Promise<JuniorHighProgressRecord[]> {
    try {
      let q = query(
        collection(db, COLLECTION), 
        where('unit', '==', 'JUNIOR_HIGH'),
        where('studentId', '==', studentId)
      );

      if (schoolYear) {
        q = query(q, where('schoolYear', '==', schoolYear));
      }

      if (subjectArea) {
        q = query(q, where('subjectArea', '==', subjectArea));
      }

      const snap = await getDocs(q);
      const records: JuniorHighProgressRecord[] = [];
      snap.forEach((docSnap) => {
        records.push(docSnap.data() as JuniorHighProgressRecord);
      });

      return records;
    } catch (error) {
      return handleFirestoreError(error, 'list', COLLECTION);
    }
  },

  /**
   * Bulk insert/update progress records in a single batch
   */
  async bulkUpsertRecords(records: (Omit<JuniorHighProgressRecord, 'updatedAt'> & { id?: string })[]): Promise<void> {
    try {
      const batch = writeBatch(db);

      for (const record of records) {
        const enriched = { ...record } as any;

        enriched.unit = 'JUNIOR_HIGH';

        if (enriched.subjectArea === 'ENGLISH_READING') {
          const hasWords = enriched.wordsRead !== undefined && enriched.wordsRead !== null && enriched.wordsRead !== '';
          const hasErrs = enriched.errors !== undefined && enriched.errors !== null && enriched.errors !== '';
          
          if (hasWords && hasErrs) {
            const wpm = calculateWpm(Number(enriched.wordsRead), Number(enriched.errors));
            enriched.wpm = wpm;
          } else {
            enriched.wpm = null;
          }
        }

        // Backward-compatibility field mappings
        enriched.period = enriched.sessionKey;
        enriched.area = enriched.subjectArea;
        enriched.teacherId = enriched.updatedBy;

        const docId = enriched.id || `${enriched.studentId}_${enriched.sessionKey}_${enriched.subjectArea}_${enriched.schoolYear.replace(/\//g, '-')}`;
        enriched.id = docId;
        enriched.updatedAt = serverTimestamp();

        const docRef = doc(db, COLLECTION, docId);
        batch.set(docRef, sanitizeRecord(enriched), { merge: true });
      }

      await batch.commit();
    } catch (error) {
      return handleFirestoreError(error, 'write', COLLECTION);
    }
  }
};
