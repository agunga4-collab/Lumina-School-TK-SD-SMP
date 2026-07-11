import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { MTSSAcademicCase, MTSSAcademicSession } from '../types';

export interface JHMTSSBlockConfig {
  id: string;
  type: 'MEETING' | 'ASSESSMENT';
  label: string;
}

export interface JHMTSSStudentRowData {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  goal: string;
  teachers: string;
  baseline: string;
  current: string;
  target: string;
  blocks: Record<string, any>; // Keyed by block.id -> JHMeetingValue or JHAssessmentValue
  dateAssessed?: string;
  finalDiagnosis?: string;
  notes?: string;
}

export interface JHMTSSMeetingValue {
  date?: string;
  status?: string;
}

export interface JHMTSSAssessmentValue {
  result?: string;
  dateAssessed?: string;
  note?: string;
}

export interface JHMTSSBatchSheet {
  id: string;
  academicYear: string;
  semester: string;
  subject: 'ENGLISH' | 'NUMERACY' | 'BAHASA_INDONESIA'; // Subject domain key
  tier: 'Tier 2' | 'Tier 3';
  classId: string;
  className: string;
  teacherName: string;
  orderedBlocks: JHMTSSBlockConfig[];
  studentsData: Record<string, JHMTSSStudentRowData>;
  studentIds: string[];
  createdAt: number;
  updatedAt: number;
}

const BATCH_SHEETS_COLLECTION = 'juniorhigh_mtss_academic_batch_sheets';
const CASES_COLLECTION = 'juniorhigh_mtss_academic_cases';

export const juniorHighMTSSAcademicCoachingService = {
  /**
   * Fetch all batch sheets matching academic year & semester
   */
  async getBatchSheets(academicYear: string, semester: string): Promise<JHMTSSBatchSheet[]> {
    try {
      const q = query(
        collection(db, BATCH_SHEETS_COLLECTION),
        where('academicYear', '==', academicYear),
        where('semester', '==', semester)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as JHMTSSBatchSheet))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Error in getBatchSheets:', error);
      return [];
    }
  },

  /**
   * Delete a batch sheet by ID
   */
  async deleteBatchSheet(id: string): Promise<void> {
    try {
      const docRef = doc(db, BATCH_SHEETS_COLLECTION, id);
      await deleteDoc(docRef);
    } catch (error) {
      return handleFirestoreError(error, 'delete', `${BATCH_SHEETS_COLLECTION}/${id}`);
    }
  },

  /**
   * Save a batch sheet (create or update) and automatically synchronize coaching session history
   * under individual junior high academic case timelines.
   */
  async saveBatchSheet(
    sheet: Omit<JHMTSSBatchSheet, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ): Promise<string> {
    try {
      const colRef = collection(db, BATCH_SHEETS_COLLECTION);
      let docId = existingId;
      let docRef;

      if (docId) {
        docRef = doc(colRef, docId);
      } else {
        docRef = doc(colRef);
        docId = docRef.id;
      }

      const now = Date.now();
      const existingDoc = existingId ? await getDoc(docRef) : null;
      const createdAt = existingDoc?.exists() ? ((existingDoc.data() as any)?.createdAt || now) : now;

      const fullSheet: JHMTSSBatchSheet = {
        ...sheet,
        id: docId,
        createdAt,
        updatedAt: now
      };

      // 1. Save the main batch sheet
      await setDoc(docRef, fullSheet);

      // 2. Map and sync individual junior high student cases
      for (const studentId of sheet.studentIds) {
        const student = sheet.studentsData[studentId];
        if (!student) continue;

        // In JH MTSS Academic, cases are created per student.
        // Let's search for an active case for this student in this academicYear, semester and domain.
        const casesRef = collection(db, CASES_COLLECTION);
        const qCases = query(
          casesRef,
          where('studentId', '==', studentId),
          where('academicYear', '==', sheet.academicYear),
          where('semester', '==', sheet.semester)
        );
        const casesSnap = await getDocs(qCases);
        
        let targetCase: MTSSAcademicCase | null = null;
        let caseId = '';

        // Filter for domain
        const foundCaseDoc = casesSnap.docs.find(d => {
          const data = d.data() as MTSSAcademicCase;
          return data.subjectDomains && data.subjectDomains.includes(sheet.subject);
        });

        if (foundCaseDoc) {
          targetCase = { id: foundCaseDoc.id, ...foundCaseDoc.data() } as MTSSAcademicCase;
          caseId = foundCaseDoc.id;
        }

        // If no case exists, we won't crash; we can optionally create or update if appropriate.
        // But normally the user selects from existing Tier 2/Tier 3 students.
        if (caseId) {
          // Update baseline / target or status in case
          const currentStatus = student.finalDiagnosis === 'Achieved' || student.finalDiagnosis === 'Passed Tier 2' ? 'CLOSED' : 'ACTIVE';
          await setDoc(doc(db, CASES_COLLECTION, caseId), {
            updatedAt: now,
            status: currentStatus,
            latestDecision: {
              decisionType: student.finalDiagnosis === 'Achieved' || student.finalDiagnosis === 'Passed Tier 2' ? 'EXIT_MTSS' : 'CONTINUE_TIER_2',
              notes: student.notes || 'Diperbarui via Coaching Spreadsheet',
              decidedAt: now,
              decidedBy: sheet.teacherName
            }
          }, { merge: true });

          // Clean up previously synced session logs for this batch sheet to prevent duplication
          const sessionsColRef = collection(db, CASES_COLLECTION, caseId, 'sessions');
          const qSessions = query(sessionsColRef, where('batchSheetId', '==', docId));
          const sessionsSnap = await getDocs(qSessions);
          for (const sDoc of sessionsSnap.docs) {
            await deleteDoc(sDoc.ref);
          }

          // Write meetings and assessments as individual sessions under juniorhigh_mtss_academic_cases/{caseId}/sessions
          let sessionIndex = 1;
          for (const block of sheet.orderedBlocks) {
            const blockVal = student.blocks[block.id];
            if (!blockVal) continue;

            const sessionDocRef = doc(sessionsColRef);
            const blockDateStr = block.type === 'MEETING' ? (blockVal as JHMTSSMeetingValue).date : (blockVal as JHMTSSAssessmentValue).dateAssessed;
            const sessionDate = blockDateStr ? new Date(blockDateStr).getTime() : now;

            if (block.type === 'MEETING') {
              const mVal = blockVal as JHMTSSMeetingValue;
              if (mVal.status || mVal.date) {
                const activitySummary = `Batch Coaching: ${block.label}\nStatus/Progres: ${mVal.status || 'Belum diisi'}`;
                
                const newSession: MTSSAcademicSession = {
                  id: sessionDocRef.id,
                  caseId: caseId,
                  sessionNo: sessionIndex++,
                  date: sessionDate,
                  domain: sheet.subject,
                  topic: block.label,
                  materialTitle: 'Batch Coaching Meeting',
                  activitySummary,
                  attendanceStatus: 'PRESENT',
                  latenessMinutes: null,
                  teacherObservation: mVal.status || '',
                  performanceMark: null,
                  score: null,
                  homeworkAssigned: false,
                  homeworkStatus: null,
                  notes: student.notes || '',
                  createdBy: sheet.teacherName,
                  createdAt: now
                };
                await setDoc(sessionDocRef, newSession);
              }
            } else if (block.type === 'ASSESSMENT') {
              const aVal = blockVal as JHMTSSAssessmentValue;
              if (aVal.result || aVal.dateAssessed || aVal.note) {
                const activitySummary = `Batch Evaluation: ${block.label}\nHasil/Skor: ${aVal.result || 'Belum diisi'}\nCatatan: ${aVal.note || '-'}`;
                const scoreNum = aVal.result ? parseFloat(aVal.result) : null;

                const newSession: MTSSAcademicSession = {
                  id: sessionDocRef.id,
                  caseId: caseId,
                  sessionNo: sessionIndex++,
                  date: sessionDate,
                  domain: sheet.subject,
                  topic: block.label,
                  materialTitle: 'Batch Coaching Assessment',
                  activitySummary,
                  attendanceStatus: 'PRESENT',
                  latenessMinutes: null,
                  teacherObservation: aVal.note || '',
                  performanceMark: null,
                  score: isNaN(scoreNum as any) ? null : scoreNum,
                  homeworkAssigned: false,
                  homeworkStatus: null,
                  notes: student.notes || '',
                  createdBy: sheet.teacherName,
                  createdAt: now
                };
                await setDoc(sessionDocRef, newSession);
              }
            }
          }
        }
      }

      return docId;
    } catch (error) {
      console.error('Error saving batch coaching sheet:', error);
      throw error;
    }
  }
};
