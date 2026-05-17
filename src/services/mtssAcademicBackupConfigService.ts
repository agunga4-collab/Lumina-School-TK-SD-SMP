import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MTSSAcademicBackupConfig } from '../types';

const CONFIG_DOC_ID = 'junior_high_mtss_v1';
const CONFIG_COLLECTION = 'system_backup_configs';

/**
 * Service to manage MTSS Academic Backup Configuration in Firestore
 */
export const mtssAcademicBackupConfigService = {
  /**
   * Get global backup configuration
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
      console.error("[MTSSAcademicBackupConfig] Snapshot error:", error);
      callback(null);
    });
  },

  /**
   * Save or update backup configuration
   */
  async saveConfig(config: MTSSAcademicBackupConfig, updatedBy: string): Promise<void> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      await setDoc(docRef, {
        ...config,
        id: CONFIG_DOC_ID,
        updatedAt: Date.now(),
        updatedBy
      }, { merge: true });
    } catch (error) {
      console.error('Error saving MTSS backup config:', error);
      throw error;
    }
  },

  /**
   * Verify Google Drive folder and Spreadsheet access via Backend
   */
  async verifyConfig(config: MTSSAcademicBackupConfig): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const response = await fetch('/api/mtss-academic/v1/verify-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });

      return await response.json();
    } catch (error) {
      console.error('Config verification error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }
};
