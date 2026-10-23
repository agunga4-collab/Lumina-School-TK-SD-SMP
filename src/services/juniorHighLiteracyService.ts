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
  parseGradeFromClassName,
  isOralReadingFluencyRiskApplicable
} from '../config/oralReadingFluencyRiskThresholds';
import {
  normalizeMengajiLevel,
  normalizeNumerasiLevel,
  formatMengajiDisplay,
  formatNumerasiDisplay
} from '../utils/litnumLevelNormalizer';

const COLLECTION = 'junior_high_literacy_numeracy_records';

/**
 * Sanitizes record for Firestore merge, guaranteeing existing non-empty values
 * are never overwritten with null or empty string.
 */
function sanitizeRecordForMerge(record: any): any {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }
  // Guarantee essential identifying metadata is always retained
  if (record.studentId) cleaned.studentId = record.studentId;
  if (record.schoolYear) cleaned.schoolYear = record.schoolYear;
  if (record.sessionKey) cleaned.sessionKey = record.sessionKey;
  if (record.subjectArea) cleaned.subjectArea = record.subjectArea;
  cleaned.unit = record.unit || 'JUNIOR_HIGH';
  if (record.id) cleaned.id = record.id;
  if (record.studentName) cleaned.studentName = record.studentName;
  if (record.classId) cleaned.classId = record.classId;
  if (record.gradeLevel !== undefined && record.gradeLevel !== null) cleaned.gradeLevel = record.gradeLevel;
  if (record.sessionLabel) cleaned.sessionLabel = record.sessionLabel;
  if (record.updatedBy) cleaned.updatedBy = record.updatedBy;
  if (record.updatedAt) cleaned.updatedAt = record.updatedAt;
  return cleaned;
}

/**
 * Prepares record with canonical values and backward-compatible fields before save.
 */
function prepareRecordForSave(record: any): any {
  const enriched = { ...record };
  enriched.unit = 'JUNIOR_HIGH';

  if (enriched.subjectArea === 'MENGAJI') {
    const rawLevel = enriched.mengajiLevel || enriched.level;
    const normLevel = normalizeMengajiLevel(rawLevel);
    if (normLevel) {
      enriched.mengajiLevel = normLevel;
      enriched.level = formatMengajiDisplay(normLevel);
    }
    const rawTarget = enriched.mengajiTarget || enriched.targetLevel;
    const normTarget = normalizeMengajiLevel(rawTarget);
    if (normTarget) {
      enriched.mengajiTarget = normTarget;
      enriched.targetLevel = formatMengajiDisplay(normTarget);
    }
  } else if (enriched.subjectArea === 'NUMERACY') {
    const rawLevel = enriched.numerasiLevel || enriched.mathLevel;
    const normLevel = normalizeNumerasiLevel(rawLevel);
    if (normLevel) {
      enriched.numerasiLevel = normLevel;
      enriched.mathLevel = formatNumerasiDisplay(normLevel);
    }
    const rawTarget = enriched.numerasiTarget || enriched.targetLevel || enriched.mathTargetLevel;
    const normTarget = normalizeNumerasiLevel(rawTarget);
    if (normTarget) {
      enriched.numerasiTarget = normTarget;
      enriched.targetLevel = formatNumerasiDisplay(normTarget);
      enriched.mathTargetLevel = formatNumerasiDisplay(normTarget);
    }
  }

  return enriched;
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
  const isJh = enriched.unit === 'JUNIOR_HIGH' || enriched.unit === 'JUNIORHIGH';
  const isReading = enriched.subjectArea === 'ENGLISH_READING' || enriched.area === 'ENGLISH_READING';

  if (isJh && isReading) {
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

    const isApplicable = isOralReadingFluencyRiskApplicable({
      unitId: enriched.unit,
      grade: resolvedGrade,
      assessmentType: enriched.subjectArea || enriched.area,
      wpm: wpmVal,
    });

    if (isApplicable && wpmVal !== null) {
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
 * Computes ORF risk level on-read for historical records and normalizes Mengaji & Numeracy levels.
 */
function enrichOnRead(record: any): any {
  if (!record) return record;
  const isJh = record.unit === 'JUNIOR_HIGH' || record.unit === 'JUNIORHIGH';
  const isReading = record.subjectArea === 'ENGLISH_READING' || record.area === 'ENGLISH_READING';
  const isMengaji = record.subjectArea === 'MENGAJI' || record.area === 'MENGAJI';
  const isNumeracy = record.subjectArea === 'NUMERACY' || record.area === 'NUMERACY';

  // Normalize and bidirectional sync Mengaji
  if (isMengaji) {
    const rawLevel = record.mengajiLevel || record.level;
    const normLevel = normalizeMengajiLevel(rawLevel);
    if (normLevel) {
      record.mengajiLevel = normLevel;
      if (!record.level) record.level = formatMengajiDisplay(normLevel);
    }
    const rawTarget = record.mengajiTarget || record.targetLevel;
    const normTarget = normalizeMengajiLevel(rawTarget);
    if (normTarget) {
      record.mengajiTarget = normTarget;
      if (!record.targetLevel) record.targetLevel = formatMengajiDisplay(normTarget);
    }
  }

  // Normalize and bidirectional sync Numerasi
  if (isNumeracy) {
    const rawLevel = record.numerasiLevel || record.mathLevel;
    const normLevel = normalizeNumerasiLevel(rawLevel);
    if (normLevel) {
      record.numerasiLevel = normLevel;
      if (!record.mathLevel) record.mathLevel = formatNumerasiDisplay(normLevel);
    }
    const rawTarget = record.numerasiTarget || record.targetLevel || record.mathTargetLevel;
    const normTarget = normalizeNumerasiLevel(rawTarget);
    if (normTarget) {
      record.numerasiTarget = normTarget;
      if (!record.targetLevel) record.targetLevel = formatNumerasiDisplay(normTarget);
      if (!record.mathTargetLevel) record.mathTargetLevel = formatNumerasiDisplay(normTarget);
    }
  }

  if (isJh && isReading) {
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

    const isApplicable = isOralReadingFluencyRiskApplicable({
      unitId: record.unit,
      grade: gradeNum,
      assessmentType: record.subjectArea || record.area,
      wpm: wpmVal,
    });

    if (isApplicable && wpmVal !== null) {
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
      const prepared = prepareRecordForSave(record);
      const enriched = { ...prepared } as any;

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
      await setDoc(docRef, sanitizeRecordForMerge(enriched), { merge: true });
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

      await updateDoc(docRef, sanitizeRecordForMerge(merged));
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
        const prepared = prepareRecordForSave(record);
        const enriched = { ...prepared } as any;

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
        batch.set(docRef, sanitizeRecordForMerge(enriched), { merge: true });
      }

      await batch.commit();
    } catch (error) {
      return handleFirestoreError(error, 'write', COLLECTION);
    }
  },

  /**
   * Load flexible custom assessment columns for a class & subject
   */
  async loadLitnumCustomColumns(schoolYear: string, classId: string, subjectArea: JuniorHighArea) {
    try {
      const q = query(
        collection(db, 'junior_high_litnum_custom_columns'),
        where('unit', '==', 'JUNIOR_HIGH'),
        where('schoolYear', '==', schoolYear),
        where('classId', '==', classId),
        where('subjectArea', '==', subjectArea)
      );
      const snap = await getDocs(q);
      const cols: any[] = [];
      snap.forEach(d => cols.push({ ...d.data(), id: d.id }));
      return cols.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
    } catch (error) {
      console.warn('loadLitnumCustomColumns graceful fallback:', error);
      return [];
    }
  },

  /**
   * Save or update a flexible custom column
   */
  async saveLitnumCustomColumn(column: any) {
    try {
      const docId = column.id || doc(collection(db, 'junior_high_litnum_custom_columns')).id;
      const docRef = doc(db, 'junior_high_litnum_custom_columns', docId);
      const payload = {
        ...column,
        id: docId,
        unit: 'JUNIOR_HIGH',
        updatedAt: Date.now()
      };
      if (!payload.createdAt) payload.createdAt = Date.now();
      await setDoc(docRef, payload, { merge: true });
      return docId;
    } catch (error) {
      return handleFirestoreError(error, 'write', 'junior_high_litnum_custom_columns');
    }
  },

  /**
   * Archive a custom column
   */
  async archiveLitnumCustomColumn(columnId: string) {
    try {
      const docRef = doc(db, 'junior_high_litnum_custom_columns', columnId);
      await updateDoc(docRef, { archived: true, updatedAt: Date.now() });
    } catch (error) {
      return handleFirestoreError(error, 'update', `junior_high_litnum_custom_columns/${columnId}`);
    }
  },

  /**
   * Load cell values for custom columns
   */
  async loadLitnumCellValues(schoolYear: string, classId: string, subjectArea: JuniorHighArea) {
    try {
      const q = query(
        collection(db, 'junior_high_litnum_cell_values'),
        where('schoolYear', '==', schoolYear),
        where('classId', '==', classId),
        where('subjectArea', '==', subjectArea)
      );
      const snap = await getDocs(q);
      const cells: any[] = [];
      snap.forEach(d => cells.push({ ...d.data(), id: d.id }));
      return cells;
    } catch (error) {
      console.warn('loadLitnumCellValues graceful fallback:', error);
      return [];
    }
  },

  /**
   * Bulk upsert cell values for custom columns
   */
  async saveLitnumCellValues(cellValues: any[]) {
    try {
      const batch = writeBatch(db);
      for (const cell of cellValues) {
        const docId = cell.id || `${cell.columnId}_${cell.studentId}`;
        const docRef = doc(db, 'junior_high_litnum_cell_values', docId);
        const payload = {
          ...cell,
          id: docId,
          updatedAt: Date.now()
        };
        batch.set(docRef, payload, { merge: true });
      }
      await batch.commit();
    } catch (error) {
      return handleFirestoreError(error, 'write', 'junior_high_litnum_cell_values');
    }
  },

  /**
   * Load active LPU subject reference for a class & subject
   */
  async loadLpuSubjectReference(schoolYear: string, classId: string, subjectArea: JuniorHighArea) {
    try {
      const docId = `${classId}_${subjectArea}_${schoolYear.replace(/\//g, '-')}`;
      const docRef = doc(db, 'lpu_subject_references', docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (error) {
      console.warn('loadLpuSubjectReference graceful fallback:', error);
      return null;
    }
  },

  /**
   * Save active LpuSubjectReference
   */
  async saveLpuSubjectReference(refData: any) {
    try {
      const docId = `${refData.classId}_${refData.subjectArea}_${refData.schoolYear.replace(/\//g, '-')}`;
      const docRef = doc(db, 'lpu_subject_references', docId);
      const payload = {
        ...refData,
        id: docId,
        unit: 'JUNIOR_HIGH',
        appliedAt: Date.now()
      };
      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      return handleFirestoreError(error, 'write', 'lpu_subject_references');
    }
  },

  /**
   * Get all progress records for a class & subject across all sessions
   */
  async getAllRecordsByClass(
    schoolYear: string,
    classId: string,
    subjectArea: JuniorHighArea
  ): Promise<JuniorHighProgressRecord[]> {
    try {
      const q = query(
        collection(db, COLLECTION),
        where('unit', '==', 'JUNIOR_HIGH'),
        where('schoolYear', '==', schoolYear),
        where('subjectArea', '==', subjectArea),
        where('classId', '==', classId)
      );
      const snap = await getDocs(q);
      const records: JuniorHighProgressRecord[] = [];
      const seenIds = new Set<string>();

      snap.forEach(d => {
        seenIds.add(d.id);
        records.push(enrichOnRead({ ...d.data(), id: d.id }) as JuniorHighProgressRecord);
      });

      // Resilient fallback for older records stored with 'area' instead of 'subjectArea'
      if (records.length === 0) {
        const fallbackQ = query(
          collection(db, COLLECTION),
          where('unit', '==', 'JUNIOR_HIGH'),
          where('schoolYear', '==', schoolYear),
          where('area', '==', subjectArea),
          where('classId', '==', classId)
        );
        const fbSnap = await getDocs(fallbackQ);
        fbSnap.forEach(d => {
          if (!seenIds.has(d.id)) {
            seenIds.add(d.id);
            records.push(enrichOnRead({ ...d.data(), id: d.id }) as JuniorHighProgressRecord);
          }
        });
      }

      return records;
    } catch (error) {
      console.error('Error fetching records for class:', error);
      return [];
    }
  },

  /**
   * Load custom session titles for a class & subject
   */
  async loadLitnumSessionTitles(schoolYear: string, classId: string, subjectArea: JuniorHighArea): Promise<Record<string, string>> {
    try {
      const docId = `${classId}_${subjectArea}_${schoolYear.replace(/\//g, '-')}`;
      const docRef = doc(db, 'junior_high_litnum_session_titles', docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return data.sessionTitles || {};
      }
      return {};
    } catch (error) {
      console.warn('loadLitnumSessionTitles graceful fallback:', error);
      return {};
    }
  },

  /**
   * Save custom session titles for a class & subject
   */
  async saveLitnumSessionTitles(schoolYear: string, classId: string, subjectArea: JuniorHighArea, sessionTitles: Record<string, string>): Promise<void> {
    try {
      const docId = `${classId}_${subjectArea}_${schoolYear.replace(/\//g, '-')}`;
      const docRef = doc(db, 'junior_high_litnum_session_titles', docId);
      const payload = {
        id: docId,
        unit: 'JUNIOR_HIGH',
        schoolYear,
        classId,
        subjectArea,
        sessionTitles,
        updatedAt: Date.now()
      };
      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      return handleFirestoreError(error, 'write', 'junior_high_litnum_session_titles');
    }
  }
};

