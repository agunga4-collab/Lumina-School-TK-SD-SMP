import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, auth } from '../lib/firebase';
import { ElementaryMTSSCase, ElementaryCoachingSession } from '../types/elementaryMTSS';
import { ElementaryProgressRecord, ElementaryArea } from '../types/elementaryLiteracyNumeracy';

const CASES_COLLECTION = 'elementary_mtss_cases';

// Helper to map areas to user-friendly subject names
export function mapAreaToSubject(area: ElementaryArea): 'Bahasa Indonesia' | 'English' | 'Numeracy' | 'Mengaji' {
  switch (area) {
    case 'BAHASA_INDONESIA':
      return 'Bahasa Indonesia';
    case 'ENGLISH_READING':
      return 'English';
    case 'NUMERACY':
      return 'Numeracy';
    case 'MENGAJI':
      return 'Mengaji';
    default:
      return 'Numeracy';
  }
}

// Helper to map support status to MTSS tier
export function mapSupportStatusToTier(status: string): 'Tier 2' | 'Tier 3' | 'SN' | null {
  if (status === 'MONITOR') return 'Tier 2';
  if (status === 'NEEDS_SUPPORT') return 'Tier 3';
  if (status === 'INTERVENTION_RECOMMENDED') return 'SN';
  return null;
}

export const elementaryMTSSService = {
  /**
   * Sync a student's progress record to MTSS Cases.
   * If they are Tier 2 (MONITOR), Tier 3 (NEEDS_SUPPORT), or SN (INTERVENTION_RECOMMENDED),
   * we ensure an Active case is created/updated.
   * If they are improved to ON_TRACK, we can mark the case as Achieved.
   */
  async syncProgressRecordToMTSS(record: ElementaryProgressRecord): Promise<void> {
    try {
      const subject = mapAreaToSubject(record.area);
      const tier = mapSupportStatusToTier(record.supportStatus);
      const caseId = `${record.studentId}_${record.area}`;

      const docRef = doc(db, CASES_COLLECTION, caseId);
      const caseSnap = await getDoc(docRef);

      if (tier) {
        // Create or update Case
        if (caseSnap.exists()) {
          const currentData = caseSnap.data() as ElementaryMTSSCase;
          // Keep existing baseline/target scores so they aren't lost when guru updates literacy scores
          const updatedCase: ElementaryMTSSCase = {
            ...currentData,
            tier,
            studentName: record.studentName,
            classId: record.classId,
            status: currentData.status === 'Achieved' ? 'Active' : currentData.status || 'Active', // Reactive back to active if update occurs
            updatedAt: Date.now()
          };
          await setDoc(docRef, updatedCase, { merge: true });
        } else {
          // New case
          const newCase: ElementaryMTSSCase = {
            id: caseId,
            studentId: record.studentId,
            studentName: record.studentName,
            classId: record.classId,
            subject,
            tier,
            baselineScore: '',
            targetScore: '',
            status: 'Active',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          await setDoc(docRef, newCase);
        }
      } else {
        // If they are on track / Tier 1, and an active case already exists, mark it as 'Achieved' or let it be
        if (caseSnap.exists()) {
          const currentData = caseSnap.data() as ElementaryMTSSCase;
          if (currentData.status === 'Active') {
            await updateDoc(docRef, {
              status: 'Achieved',
              updatedAt: Date.now()
            });
          }
        }
      }
    } catch (error) {
      console.error('Error syncing progress record to MTSS:', error);
      // Fail silently to not block main save
    }
  },

  /**
   * Sync multiple progress records to MTSS (for bulk save operations)
   */
  async syncBulkRecordsToMTSS(records: ElementaryProgressRecord[]): Promise<void> {
    for (const record of records) {
      await this.syncProgressRecordToMTSS(record);
    }
  },

  /**
   * Fetch all elementary cases
   */
  async fetchCases(): Promise<ElementaryMTSSCase[]> {
    try {
      const snap = await getDocs(collection(db, CASES_COLLECTION));
      const cases: ElementaryMTSSCase[] = [];
      snap.forEach((docSnap) => {
        cases.push(docSnap.data() as ElementaryMTSSCase);
      });
      return cases;
    } catch (error) {
      return handleFirestoreError(error, 'list', CASES_COLLECTION);
    }
  },

  /**
   * Update case details (like baseline goals, target goals, status)
   */
  async updateCase(caseId: string, updates: Partial<ElementaryMTSSCase>): Promise<void> {
    try {
      const docRef = doc(db, CASES_COLLECTION, caseId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: Date.now()
      });
    } catch (error) {
      return handleFirestoreError(error, 'update', `${CASES_COLLECTION}/${caseId}`);
    }
  },

  /**
   * Fetch coaching sessions sub-collection for a case
   */
  async fetchCoachingSessions(caseId: string): Promise<ElementaryCoachingSession[]> {
    try {
      const path = `${CASES_COLLECTION}/${caseId}/coaching_sessions`;
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const sessions: ElementaryCoachingSession[] = [];
      snap.forEach((docSnap) => {
        sessions.push(docSnap.data() as ElementaryCoachingSession);
      });
      return sessions;
    } catch (error) {
      return handleFirestoreError(error, 'list', `${CASES_COLLECTION}/${caseId}/coaching_sessions`);
    }
  },

  /**
   * Add a new coaching session to sub-collection
   */
  async addCoachingSession(caseId: string, session: Omit<ElementaryCoachingSession, 'id' | 'createdAt'>): Promise<string> {
    try {
      const path = `${CASES_COLLECTION}/${caseId}/coaching_sessions`;
      const colRef = collection(db, path);
      
      const newSessionDoc = doc(colRef);
      const fullSession: ElementaryCoachingSession = {
        ...session,
        id: newSessionDoc.id,
        createdAt: Date.now()
      };

      await setDoc(newSessionDoc, fullSession);
      
      // Update case last update time
      await this.updateCase(caseId, { updatedAt: Date.now() });

      return newSessionDoc.id;
    } catch (error) {
      return handleFirestoreError(error, 'create', `${CASES_COLLECTION}/${caseId}/coaching_sessions`);
    }
  },

  /**
   * Delete coaching session
   */
  async deleteCoachingSession(caseId: string, sessionId: string): Promise<void> {
    try {
      const path = `${CASES_COLLECTION}/${caseId}/coaching_sessions/${sessionId}`;
      await deleteDoc(doc(db, path));
    } catch (error) {
      return handleFirestoreError(error, 'delete', `${CASES_COLLECTION}/${caseId}/coaching_sessions/${sessionId}`);
    }
  },

  /**
   * Reconcile/sync all existing records in `elementary_literacy_numeracy_records` with `elementary_mtss_cases`.
   * This is extremely useful for loading historical data or recovering from desynchronization.
   */
  async reconcileAllMTSSCases(): Promise<number> {
    try {
      const recordsCol = collection(db, 'elementary_literacy_numeracy_records');
      const recordsSnap = await getDocs(recordsCol);
      
      let syncedCount = 0;
      
      for (const recordDoc of recordsSnap.docs) {
        const record = recordDoc.data() as ElementaryProgressRecord;
        const tier = mapSupportStatusToTier(record.supportStatus);
        
        if (tier) {
          const caseId = `${record.studentId}_${record.area}`;
          const caseDocRef = doc(db, CASES_COLLECTION, caseId);
          const caseSnap = await getDoc(caseDocRef);
          const subject = mapAreaToSubject(record.area);
          
          if (caseSnap.exists()) {
            const currentData = caseSnap.data() as ElementaryMTSSCase;
            const updatedCase: ElementaryMTSSCase = {
              ...currentData,
              tier,
              studentName: record.studentName || currentData.studentName,
              classId: record.classId || currentData.classId,
              status: currentData.status === 'Achieved' ? 'Active' : currentData.status || 'Active',
              updatedAt: Date.now()
            };
            await setDoc(caseDocRef, updatedCase, { merge: true });
          } else {
            const newCase: ElementaryMTSSCase = {
              id: caseId,
              studentId: record.studentId,
              studentName: record.studentName,
              classId: record.classId,
              subject,
              tier,
              baselineScore: '',
              targetScore: '',
              status: 'Active',
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await setDoc(caseDocRef, newCase);
          }
          syncedCount++;
        } else {
          // If the record exists but supportStatus is ON_TRACK or other non-intervention status,
          // mark existing active case as 'Achieved' automatically
          const caseId = `${record.studentId}_${record.area}`;
          const caseDocRef = doc(db, CASES_COLLECTION, caseId);
          const caseSnap = await getDoc(caseDocRef);
          if (caseSnap.exists()) {
            const currentData = caseSnap.data() as ElementaryMTSSCase;
            if (currentData.status === 'Active') {
              await updateDoc(caseDocRef, {
                status: 'Achieved',
                updatedAt: Date.now()
              });
              syncedCount++;
            }
          }
        }
      }
      return syncedCount;
    } catch (error) {
      console.error('Error in reconcileAllMTSSCases:', error);
      throw error;
    }
  }
};
