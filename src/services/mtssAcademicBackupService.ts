import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  MTSSAcademicBackupConfig, 
  MTSSAcademicCaseBackupMap,
  MTSSAcademicSemesterBackupMap,
  MTSSAcademicBackupSyncResult
} from '../types';

const CONFIG_DOC_ID = 'junior_high_mtss';
const CONFIG_COLLECTION = 'system_backup_configs';
const CASE_MAP_COLLECTION = 'mtss_academic_case_backup_maps';
const SEMESTER_MAP_COLLECTION = 'mtss_academic_semester_backup_maps';

/**
 * Service to manage MTSS Academic Backup Configuration and Sync in Firestore
 */
export const mtssAcademicBackupService = {
  /**
   * Get MTSS backup configuration
   */
  async getConfig(): Promise<MTSSAcademicBackupConfig | null> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as MTSSAcademicBackupConfig;
      }
      return null;
    } catch (error) {
      console.error('Error fetching MTSS backup config:', error);
      return null;
    }
  },

  /**
   * Listen to config changes
   */
  subscribeToConfig(callback: (config: MTSSAcademicBackupConfig | null) => void) {
    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data() as MTSSAcademicBackupConfig);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error("[MTSSAcademicBackupService] Snapshot error:", error);
      callback(null);
    });
  },

  /**
   * Save or update backup configuration
   */
  async saveConfig(config: MTSSAcademicBackupConfig): Promise<void> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      await setDoc(docRef, {
        ...config,
        id: CONFIG_DOC_ID,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving MTSS backup config:', error);
      throw error;
    }
  },

  /**
   * Get case backup map
   */
  async getCaseMap(caseId: string): Promise<MTSSAcademicCaseBackupMap | null> {
    try {
      const docRef = doc(db, CASE_MAP_COLLECTION, caseId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as MTSSAcademicCaseBackupMap;
      }
      return null;
    } catch (error) {
      console.error('Error fetching case backup map:', error);
      return null;
    }
  },

  /**
   * Trigger case sync (event-based)
   */
  async triggerCaseSync(caseId: string, eventType: string): Promise<MTSSAcademicBackupSyncResult> {
    try {
      const response = await fetch('/api/mtss-academic/sync-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, eventType })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          syncStatus: 'FAILED',
          message: errorData.error || 'Server error',
          targetType: 'CASE_FOLDER',
          targetId: caseId,
          updatedAt: Date.now(),
          error: errorData.error
        };
      }

      return await response.json();
    } catch (error) {
      console.error('MTSS Case Sync error:', error);
      return {
        success: false,
        syncStatus: 'FAILED',
        message: 'Network error',
        targetType: 'CASE_FOLDER',
        targetId: caseId,
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown'
      };
    }
  },

  /**
   * Trigger semester summary sync
   */
  async triggerSemesterSync(academicYear: string, semester: '1' | '2'): Promise<MTSSAcademicBackupSyncResult> {
    try {
      const response = await fetch('/api/mtss-academic/sync-semester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear, semester })
      });

      return await response.json();
    } catch (error) {
      console.error('MTSS Semester Sync error:', error);
      return {
        success: false,
        syncStatus: 'FAILED',
        message: 'Network error',
        targetType: 'SHEET',
        targetId: `${academicYear}_${semester}`,
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown'
      };
    }
  }
};
