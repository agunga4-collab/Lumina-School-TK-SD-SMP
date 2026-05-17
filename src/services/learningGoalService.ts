import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  addDoc, 
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase.ts';
import type { 
  LGGoal, 
  LGBackupSummary, 
  LGBackupStatus, 
  LGBackupLog 
} from '../types.ts';

const LG_COLLECTION = 'learning_goals';
const BACKUP_LOGS_SUBCOLLECTION = 'backup_logs';

export const learningGoalService = {
  /**
   * Create a new Learning Goal document
   */
  async createLearningGoal(data: Omit<LGGoal, 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'backupSummary'>): Promise<string> {
    try {
      const lgRef = doc(collection(db, LG_COLLECTION));
      const now = Date.now();
      
      const newLG: LGGoal = {
        ...data,
        lgId: lgRef.id,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        deletedAt: null,
        backupSummary: {
          lastBackupAt: null,
          lastBackupStatus: 'PENDING',
          lastBackupFileId: null,
          lastBackupFileUrl: null,
          lastBackupMessage: 'Waiting for initial backup'
        }
      };

      await setDoc(lgRef, newLG);
      return lgRef.id;
    } catch (error) {
      return handleFirestoreError(error, 'create', LG_COLLECTION);
    }
  },

  /**
   * Update an existing Learning Goal
   */
  async updateLearningGoal(lgId: string, updates: Partial<LGGoal>): Promise<void> {
    try {
      const lgRef = doc(db, LG_COLLECTION, lgId);
      await updateDoc(lgRef, {
        ...updates,
        updatedAt: Date.now()
      });
    } catch (error) {
      return handleFirestoreError(error, 'update', `${LG_COLLECTION}/${lgId}`);
    }
  },

  /**
   * Get a single Learning Goal by ID
   */
  async getLearningGoal(lgId: string): Promise<LGGoal | null> {
    try {
      const lgRef = doc(db, LG_COLLECTION, lgId);
      const snap = await getDoc(lgRef);
      
      if (!snap.exists()) return null;
      return snap.data() as LGGoal;
    } catch (error) {
      return handleFirestoreError(error, 'get', `${LG_COLLECTION}/${lgId}`);
    }
  },

  /**
   * Update backup status and summary, and append to backup logs subcollection
   */
  async syncBackupResultToFirestore(
    lgId: string, 
    result: { 
      status: LGBackupStatus; 
      fileId?: string | null; 
      fileUrl?: string | null; 
      message?: string | null;
      triggeredBy: string;
    }
  ): Promise<void> {
    try {
      const now = Date.now();
      const lgRef = doc(db, LG_COLLECTION, lgId);
      
      // 1. Update the main document summary
      const backupSummary: LGBackupSummary = {
        lastBackupAt: now,
        lastBackupStatus: result.status,
        lastBackupFileId: result.fileId || null,
        lastBackupFileUrl: result.fileUrl || null,
        lastBackupMessage: result.message || (result.status === 'SUCCESS' ? 'Backup successful' : 'Backup failed')
      };

      await updateDoc(lgRef, {
        backupSummary,
        updatedAt: now
      });

      // 2. Add detailed log entry to subcollection
      const logRef = doc(collection(lgRef, BACKUP_LOGS_SUBCOLLECTION));
      const logEntry: LGBackupLog = {
        id: logRef.id,
        lgId,
        status: result.status,
        fileId: result.fileId || null,
        fileUrl: result.fileUrl || null,
        message: result.message || null,
        triggeredBy: result.triggeredBy,
        createdAt: now
      };

      await setDoc(logRef, logEntry);
    } catch (error) {
      return handleFirestoreError(error, 'update', `${LG_COLLECTION}/${lgId}/backup_logs`);
    }
  },

  /**
   * Create a goal and immediately trigger the backup flow.
   * Note: This is the foundation; the actual Drive/Service logic for backup 
   * should be implemented in a separate service (e.g. learningGoalBackupService).
   */
  async createAndBackupLearningGoal(
    data: Omit<LGGoal, 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'backupSummary'>,
    performedBy: string
  ): Promise<string> {
    // 1. Create the doc
    const lgId = await this.createLearningGoal(data);
    
    // 2. Set status to PENDING (initial state is already pending from createLearningGoal)
    // In a real implementation, you would trigger the side-effect here.
    // For now, we return the ID as the foundation.
    return lgId;
  }
};
