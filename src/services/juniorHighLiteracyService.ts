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
import {
  getOralReadingFluencyRiskLevel,
  isJuniorHighOrfGrade,
  parseGradeFromClassName
} from '../config/oralReadingFluencyRiskThresholds';

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

/**
 * Enriches the record with Oral Reading Fluency risk levels if all conditions are met:
 * - Unit: JUNIOR_HIGH
 * - Grade: 7, 8, 9
 * - Assessment: Spring Assessment 3
 * - Domain/assessment: Oral Reading Fluency (subjectArea: ENGLISH_READING)
 * - Metric: WPM
 */
async function enrichOrfRisk(enriched: any): Promise<void> {
  const isJh = enriched.unit === 'JUNIOR_HIGH';
  const isReading = enriched.subjectArea === 'ENGLISH_READING' || enriched.area === 'ENGLISH_READING';
  const isSpring3 = enriched.sessionKey === 'SPRING_ASSESSMENT_3' || enriched.period === 'SPRING_ASSESSMENT_3';

  if (isJh && isReading && isSpring3) {
    let resolvedGrade: number | null = null;
    
    // 1. Enrollment siswa untuk `academicYear` milik assessment
    try {
      const academicYear = enriched.schoolYear;
      const studentId = enriched.studentId;
      if (studentId && academicYear) {
        const qEnroll = query(
          collection(db, 'enrollments'),
          where('academicYear', '==', academicYear),
          where('studentId', '==', studentId),
          where('status', '==', 'active')
        );
        const enrollSnap = await getDocs(qEnroll);
        if (!enrollSnap.empty) {
          const enrollData = enrollSnap.docs[0].data();
          const classId = enrollData.classId;
          
          // 2. Structured field grade pada class record yang terkait enrollment tersebut
          if (classId) {
            const classSnap = await getDoc(doc(db, 'classes', classId));
            if (classSnap.exists()) {
              const classData = classSnap.data();
              if (classData && classData.grade) {
                const gradeNum = parseInt(classData.grade, 10);
                if (gradeNum === 7 || gradeNum === 8 || gradeNum === 9) {
                  resolvedGrade = gradeNum;
                }
              }
              if (!resolvedGrade && classData && classData.name) {
                resolvedGrade = parseGradeFromClassName(classData.name);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error resolving grade from enrollment/class:', err);
    }

    // 3. Structured field grade pada student snapshot bila memang disimpan bersama assessment (enriched.gradeLevel)
    if (!resolvedGrade && enriched.gradeLevel) {
      const gradeNum = Number(enriched.gradeLevel);
      if (gradeNum === 7 || gradeNum === 8 || gradeNum === 9) {
        resolvedGrade = gradeNum;
      }
    }

    const hasWords = enriched.wordsRead !== undefined && enriched.wordsRead !== null && enriched.wordsRead !== '';
    const hasErrs = enriched.errors !== undefined && enriched.errors !== null && enriched.errors !== '';
    let wpmVal: number | null = null;
    if (hasWords && hasErrs) {
      wpmVal = calculateWpm(Number(enriched.wordsRead), Number(enriched.errors));
    } else if (enriched.wpm !== undefined && enriched.wpm !== null && enriched.wpm !== '') {
      wpmVal = Number(enriched.wpm);
    }

    if (isJuniorHighOrfGrade(resolvedGrade) && wpmVal !== null) {
      const risk = getOralReadingFluencyRiskLevel(resolvedGrade, wpmVal);
      enriched.riskLevel = risk;
      enriched.riskBenchmark = 'SPRING_ASSESSMENT_3';
      enriched.riskGrade = resolvedGrade;
      enriched.riskCalculatedAt = Date.now();
    } else {
      enriched.riskLevel = null;
      enriched.riskBenchmark = null;
      enriched.riskGrade = null;
      enriched.riskCalculatedAt = null;
    }
  } else {
    enriched.riskLevel = null;
    enriched.riskBenchmark = null;
    enriched.riskGrade = null;
    enriched.riskCalculatedAt = null;
  }
}

/**
 * Computes ORF risk level on-read for historical records if conditions are met.
 */
function enrichOnRead(record: any): any {
  if (!record) return record;
  const isJh = record.unit === 'JUNIOR_HIGH';
  const isReading = record.subjectArea === 'ENGLISH_READING' || record.area === 'ENGLISH_READING';
  const isSpring3 = record.sessionKey === 'SPRING_ASSESSMENT_3' || record.period === 'SPRING_ASSESSMENT_3';

  if (isJh && isReading && isSpring3) {
    if (record.riskLevel !== undefined && record.riskLevel !== null) {
      return record;
    }

    const gradeNum = Number(record.gradeLevel);
    const hasWords = record.wordsRead !== undefined && record.wordsRead !== null && record.wordsRead !== '';
    const hasErrs = record.errors !== undefined && record.errors !== null && record.errors !== '';
    let wpmVal: number | null = null;
    if (hasWords && hasErrs) {
      wpmVal = calculateWpm(Number(record.wordsRead), Number(record.errors));
    } else if (record.wpm !== undefined && record.wpm !== null && record.wpm !== '') {
      wpmVal = Number(record.wpm);
    }

    if (isJuniorHighOrfGrade(gradeNum) && wpmVal !== null) {
      record.riskLevel = getOralReadingFluencyRiskLevel(gradeNum, wpmVal);
      record.riskBenchmark = 'SPRING_ASSESSMENT_3';
      record.riskGrade = gradeNum;
    }
  }
  return record;
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

      // Enrich with ORF Risk level if conditions met
      await enrichOrfRisk(enriched);

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

      // Enrich with ORF Risk level if conditions met
      await enrichOrfRisk(merged);

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
        records.push(enrichOnRead(docSnap.data()) as JuniorHighProgressRecord);
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
        records.push(enrichOnRead(docSnap.data()) as JuniorHighProgressRecord);
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

        // Enrich with ORF Risk level if conditions met
        await enrichOrfRisk(enriched);

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
