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
import { ElementaryMTSSCase, ElementaryCoachingSession, MTSSBatchSheet, MTSSBlockConfig, MTSSStudentRowData, MTSSMeetingValue, MTSSAssessmentValue } from '../types/elementaryMTSS';
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
export function mapSupportStatusToTier(status: string): 'Tier 2' | 'Tier 3' | null {
  if (status === 'MONITOR') return 'Tier 2';
  if (status === 'NEEDS_SUPPORT') return 'Tier 3';
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
            status: currentData.status === 'Achieved' ? 'Achieved' : 'Active', // Preserve Achieved status from spreadsheet
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
        // Under the new rules, we do NOT change active cases to Achieved automatically when status changes.
        // It must only change to Achieved via spreadsheet outcomes (e.g. Passed Tier 2).
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
   * Fetch coaching sessions sub-collection for a case.
   * Differentiates spreadsheet-synced sessions vs manual notes,
   * and reports legacy duplicate conflicts without deleting.
   */
  async fetchCoachingSessions(caseId: string): Promise<ElementaryCoachingSession[]> {
    try {
      const path = `${CASES_COLLECTION}/${caseId}/coaching_sessions`;
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const rawSessions: ElementaryCoachingSession[] = [];
      snap.forEach((docSnap) => {
        rawSessions.push(docSnap.data() as ElementaryCoachingSession);
      });

      // Detect duplicates from legacy sync data
      const blockCounts = new Map<string, number>();
      rawSessions.forEach(s => {
        if (s.batchSheetId && s.blockId) {
          const key = `${s.batchSheetId}_${s.blockId}`;
          blockCounts.set(key, (blockCounts.get(key) || 0) + 1);
        }
      });

      const sessions: ElementaryCoachingSession[] = rawSessions.map(s => {
        const isSpreadsheet = Boolean(s.batchSheetId);
        const hasConflict = isSpreadsheet && s.blockId
          ? (blockCounts.get(`${s.batchSheetId}_${s.blockId}`) || 0) > 1
          : false;

        return {
          ...s,
          sourceType: isSpreadsheet ? 'SPREADSHEET' : (s.sourceType || 'MANUAL'),
          hasConflict
        };
      });

      // Sort: session date descending, then createdAt descending
      return sessions.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        const dateComp = dateB.localeCompare(dateA);
        if (dateComp !== 0) return dateComp;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    } catch (error) {
      return handleFirestoreError(error, 'list', `${CASES_COLLECTION}/${caseId}/coaching_sessions`);
    }
  },

  /**
   * Add a new manual coaching session to sub-collection.
   */
  async addCoachingSession(caseId: string, session: Omit<ElementaryCoachingSession, 'id' | 'createdAt'>): Promise<string> {
    try {
      const path = `${CASES_COLLECTION}/${caseId}/coaching_sessions`;
      const colRef = collection(db, path);
      
      const newSessionDoc = doc(colRef);
      const now = Date.now();
      const fullSession: ElementaryCoachingSession = {
        ...session,
        id: newSessionDoc.id,
        createdAt: now,
        updatedAt: now,
        sourceType: 'MANUAL',
        sourceStatus: 'active',
        isArchived: false,
        caseId: caseId
      };

      await setDoc(newSessionDoc, fullSession);
      
      // Update case last update time
      await this.updateCase(caseId, { updatedAt: now });

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
  /**
   * Reconcile/sync all existing records in `elementary_literacy_numeracy_records` with `elementary_mtss_cases`.
   * Strictly NON-DESTRUCTIVE:
   * - Never deletes cases, even if student is now ON_TRACK (Tier 1) or not in current spreadsheet.
   * - Considers coaching_sessions (including manual logs) as history.
   * - Preserves valid baselineScore, targetScore, and Achieved status.
   */
  async reconcileAllMTSSCases(): Promise<number> {
    try {
      const recordsCol = collection(db, 'elementary_literacy_numeracy_records');
      const recordsSnap = await getDocs(recordsCol);
      
      let syncedCount = 0;
      
      // Helper to normalize record.updatedAt to a number
      const getRecordTimestamp = (record: any): number => {
        if (!record || !record.updatedAt) return 0;
        if (typeof record.updatedAt === 'number') return record.updatedAt;
        if (record.updatedAt.seconds) return record.updatedAt.seconds * 1000;
        if (typeof record.updatedAt.toDate === 'function') return record.updatedAt.toDate().getTime();
        const parsed = Date.parse(record.updatedAt);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Group records by studentId_area to only process the latest progress record per student and academic area
      const latestRecordsMap: Record<string, ElementaryProgressRecord> = {};
      
      for (const recordDoc of recordsSnap.docs) {
        const record = recordDoc.data() as ElementaryProgressRecord;
        if (!record.studentId || !record.area) continue;
        
        const key = `${record.studentId}_${record.area}`;
        const existing = latestRecordsMap[key];
        
        if (!existing) {
          latestRecordsMap[key] = record;
        } else {
          const existingTime = getRecordTimestamp(existing);
          const currentTime = getRecordTimestamp(record);
          if (currentTime > existingTime) {
            latestRecordsMap[key] = record;
          }
        }
      }

      // Fetch all batch sheets to determine explicit graduation
      const sheetsCol = collection(db, 'elementary_mtss_batch_sheets');
      const sheetsSnap = await getDocs(sheetsCol);
      const validAchievedKeys = new Set<string>();

      sheetsSnap.forEach(docSnap => {
        const sheet = docSnap.data() as MTSSBatchSheet;
        const subject = sheet.subject;
        let area: ElementaryArea = 'NUMERACY';
        if (subject === 'Bahasa Indonesia') area = 'BAHASA_INDONESIA';
        else if (subject === 'English') area = 'ENGLISH_READING';
        else if (subject === 'Mengaji') area = 'MENGAJI';

        const studentIds = sheet.studentIds || [];
        const studentsData = sheet.studentsData || {};

        studentIds.forEach((stId: string) => {
          const key = `${stId}_${area}`;
          const sData = studentsData[stId];
          if (sData) {
            if (sData.finalDiagnosis === 'Achieved' || sData.finalDiagnosis === 'Passed Tier 2') {
              validAchievedKeys.add(key);
            }
          }
        });
      });
      
      // Process latest progress records to synchronize Tier 2 / Tier 3 cases NON-DESTRUCTIVELY
      for (const record of Object.values(latestRecordsMap)) {
        const tier = mapSupportStatusToTier(record.supportStatus);
        
        if (tier) {
          const caseId = `${record.studentId}_${record.area}`;
          const caseDocRef = doc(db, CASES_COLLECTION, caseId);
          const caseSnap = await getDoc(caseDocRef);
          const subject = mapAreaToSubject(record.area);
          const isExplicitlyAchieved = validAchievedKeys.has(caseId);
          
          if (caseSnap.exists()) {
            const currentData = caseSnap.data() as ElementaryMTSSCase;
            const updatedCase: ElementaryMTSSCase = {
              ...currentData,
              tier,
              studentName: record.studentName || currentData.studentName,
              classId: record.classId || currentData.classId,
              status: isExplicitlyAchieved ? 'Achieved' : (currentData.status || 'Active'),
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
              status: isExplicitlyAchieved ? 'Achieved' : 'Active',
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await setDoc(caseDocRef, newCase);
          }
          syncedCount++;
        }
      }

      // NON-DESTRUCTIVE: Cases are NEVER deleted.
      // History in coaching_sessions and student case files are protected.

      return syncedCount;
    } catch (error) {
      console.error('Error in reconcileAllMTSSCases:', error);
      throw error;
    }
  },

  /**
   * Fetch all saved batch sheets, sorted by updatedAt descending.
   */
  async fetchBatchSheets(): Promise<MTSSBatchSheet[]> {
    try {
      const snap = await getDocs(query(collection(db, 'elementary_mtss_batch_sheets'), orderBy('updatedAt', 'desc')));
      const sheets: MTSSBatchSheet[] = [];
      snap.forEach((docSnap) => {
        sheets.push(docSnap.data() as MTSSBatchSheet);
      });
      return sheets;
    } catch (error) {
      return handleFirestoreError(error, 'list', 'elementary_mtss_batch_sheets');
    }
  },

  /**
   * Fetch a single batch sheet by its ID.
   */
  async fetchBatchSheetById(id: string): Promise<MTSSBatchSheet | null> {
    try {
      const snap = await getDoc(doc(db, 'elementary_mtss_batch_sheets', id));
      return snap.exists() ? (snap.data() as MTSSBatchSheet) : null;
    } catch (error) {
      return handleFirestoreError(error, 'get', `elementary_mtss_batch_sheets/${id}`);
    }
  },

  /**
   * Delete a batch sheet by its ID.
   * Keeps existing coaching session history readable with inactive/deleted-source notice.
   */
  async deleteBatchSheet(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'elementary_mtss_batch_sheets', id));
    } catch (error) {
      return handleFirestoreError(error, 'delete', `elementary_mtss_batch_sheets/${id}`);
    }
  },

  /**
   * Save a batch sheet (create or update).
   * Idempotent synchronization:
   * - Does not re-create or duplicate sessions when saved repeatedly.
   * - Preserves stable session IDs, original createdAt, and original loggedBy.
   * - Never deletes or overwrites manual coaching notes.
   * - Archives emptied/removed blocks instead of silently deleting them.
   */
  async saveBatchSheet(sheet: Omit<MTSSBatchSheet, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string): Promise<string> {
    try {
      const colRef = collection(db, 'elementary_mtss_batch_sheets');
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

      const fullSheet: MTSSBatchSheet = {
        ...sheet,
        id: docId,
        createdAt,
        updatedAt: now
      };

      // 1. Save the batch sheet document
      await setDoc(docRef, fullSheet);

      // 2. Map the subject name to area key
      let area: ElementaryArea = 'NUMERACY';
      if (sheet.subject === 'Bahasa Indonesia') area = 'BAHASA_INDONESIA';
      else if (sheet.subject === 'English') area = 'ENGLISH_READING';
      else if (sheet.subject === 'Mengaji') area = 'MENGAJI';

      // 3. For each student, update their case and sync sessions idempotently
      for (const studentId of sheet.studentIds) {
        const student = sheet.studentsData[studentId];
        if (!student) continue;

        const caseId = `${studentId}_${area}`;
        const caseRef = doc(db, CASES_COLLECTION, caseId);
        const caseSnap = await getDoc(caseRef);

        const isExplicitGraduation = student.finalDiagnosis === 'Achieved' || student.finalDiagnosis === 'Passed Tier 2';

        // Update or create case non-destructively
        if (caseSnap.exists()) {
          const currentCaseData = caseSnap.data() as ElementaryMTSSCase;
          const status: 'Active' | 'Achieved' = isExplicitGraduation
            ? 'Achieved'
            : (currentCaseData.status === 'Achieved' ? 'Achieved' : 'Active');

          await setDoc(caseRef, {
            ...currentCaseData,
            baselineScore: (student.baseline && student.baseline.trim() !== '') ? student.baseline : (currentCaseData.baselineScore || ''),
            targetScore: (student.target && student.target.trim() !== '') ? student.target : (currentCaseData.targetScore || ''),
            status,
            updatedAt: now
          }, { merge: true });
        } else {
          const newCase: ElementaryMTSSCase = {
            id: caseId,
            studentId: studentId,
            studentName: student.studentName,
            classId: student.classId,
            subject: sheet.subject as any,
            tier: sheet.tier as any,
            baselineScore: student.baseline || '',
            targetScore: student.target || '',
            status: isExplicitGraduation ? 'Achieved' : 'Active',
            createdAt: now,
            updatedAt: now
          };
          await setDoc(caseRef, newCase);
        }

        // Idempotent synchronization for coaching sessions
        const sessionsPath = `${CASES_COLLECTION}/${caseId}/coaching_sessions`;
        const sessionsColRef = collection(db, sessionsPath);

        // Fetch existing sessions belonging ONLY to this batchSheetId
        const q = query(sessionsColRef, where('batchSheetId', '==', docId));
        const sessionsSnap = await getDocs(q);

        const existingSessionsByBlock = new Map<string, { ref: any; data: ElementaryCoachingSession }>();
        const duplicateBlocks = new Set<string>();

        sessionsSnap.docs.forEach(sDoc => {
          const sData = sDoc.data() as ElementaryCoachingSession;
          if (sData.blockId) {
            if (existingSessionsByBlock.has(sData.blockId)) {
              duplicateBlocks.add(sData.blockId);
            } else {
              existingSessionsByBlock.set(sData.blockId, { ref: sDoc.ref, data: sData });
            }
          }
        });

        // Track blocks that are actively present and populated in this sheet
        const processedBlockIds = new Set<string>();

        for (const block of sheet.orderedBlocks) {
          const blockVal = student.blocks[block.id];
          let hasContent = false;
          let sessionDate = '';
          let notes = '';

          if (block.type === 'MEETING') {
            const mVal = blockVal as MTSSMeetingValue | undefined;
            if (mVal && (mVal.status?.trim() || mVal.date?.trim() || mVal.date1?.trim() || mVal.date2?.trim())) {
              hasContent = true;
              sessionDate = mVal.date || mVal.date1 || mVal.date2 || new Date().toISOString().split('T')[0];
              notes = `Pertemuan: ${block.label}\nStatus/Progres: ${mVal.status || 'Belum diisi'}\nTanggal Pertemuan: ${sessionDate}`;
            }
          } else if (block.type === 'ASSESSMENT') {
            const aVal = blockVal as MTSSAssessmentValue | undefined;
            if (aVal && (aVal.result?.trim() || aVal.dateAssessed?.trim() || aVal.note?.trim())) {
              hasContent = true;
              sessionDate = aVal.dateAssessed || new Date().toISOString().split('T')[0];
              notes = `Evaluasi: ${block.label}\nHasil/Skor: ${aVal.result || 'Belum diisi'}\nCatatan Singkat: ${aVal.note || '-'}`;
            }
          }

          if (hasContent) {
            processedBlockIds.add(block.id);
            const existingItem = existingSessionsByBlock.get(block.id);

            if (existingItem) {
              // Existing session for this block: check if changes exist
              const prev = existingItem.data;
              const hasChanged = prev.notes !== notes || prev.date !== sessionDate || prev.sourceStatus === 'inactive' || prev.isArchived;

              if (hasChanged) {
                await updateDoc(existingItem.ref, {
                  date: sessionDate,
                  notes,
                  sourceStatus: 'active',
                  isArchived: false,
                  updatedAt: now
                  // Preserves original createdAt and loggedBy!
                });
              }
              // Mark as retained
              existingSessionsByBlock.delete(block.id);
            } else {
              // Create with stable deterministic ID: sync_${docId}_${block.id}
              const stableDocId = `sync_${docId}_${block.id}`;
              const sDocRef = doc(sessionsColRef, stableDocId);
              const existingCheck = await getDoc(sDocRef);

              if (existingCheck.exists()) {
                await updateDoc(sDocRef, {
                  date: sessionDate,
                  notes,
                  sourceStatus: 'active',
                  isArchived: false,
                  updatedAt: now
                });
              } else {
                await setDoc(sDocRef, {
                  id: stableDocId,
                  date: sessionDate,
                  notes,
                  loggedBy: sheet.teacherName || 'Guru Pengajar',
                  createdAt: now,
                  updatedAt: now,
                  batchSheetId: docId,
                  blockId: block.id,
                  caseId: caseId,
                  sourceType: 'SPREADSHEET',
                  sourceStatus: 'active',
                  isArchived: false
                });
              }
            }
          }
        }

        // For any remaining existing sessions for this sheet that were emptied or removed from orderedBlocks:
        // DO NOT silently delete! Mark as inactive/archived to preserve historical trail.
        for (const [unusedBlockId, item] of existingSessionsByBlock.entries()) {
          if (item.data.sourceStatus !== 'inactive' || !item.data.isArchived) {
            await updateDoc(item.ref, {
              sourceStatus: 'inactive',
              isArchived: true,
              archivedReason: 'Blok dikosongkan atau dihapus dari spreadsheet sumber',
              updatedAt: now
            });
          }
        }
      }

      return docId;
    } catch (error) {
      return handleFirestoreError(error, 'create', 'elementary_mtss_batch_sheets');
    }
  }
};
