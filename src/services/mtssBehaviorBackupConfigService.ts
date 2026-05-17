import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MTSSBehaviorBackupConfig } from '../types';

const CONFIG_DOC_ID = 'junior_high_mtss_behavior_v1';
const CONFIG_COLLECTION = 'system_backup_configs';

/**
 * Service to manage MTSS Behavior Backup Configuration in Firestore
 */
export const mtssBehaviorBackupConfigService = {
  /**
   * Get global backup configuration
   */
  async getConfig(): Promise<MTSSBehaviorBackupConfig | null> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as MTSSBehaviorBackupConfig;
      }
      return null;
    } catch (error) {
      console.error('Error fetching MTSS behavior backup config:', error);
      return null;
    }
  },

  /**
   * Listen to config changes
   */
  subscribeToConfig(callback: (config: MTSSBehaviorBackupConfig | null) => void) {
    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data() as MTSSBehaviorBackupConfig);
      } else {
        callback(null);
      }
    });
  },

  /**
   * Save or update backup configuration
   */
  async saveConfig(config: MTSSBehaviorBackupConfig, updatedBy: string): Promise<void> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      await setDoc(docRef, {
        ...config,
        id: CONFIG_DOC_ID,
        updatedAt: Date.now(),
        updatedBy
      }, { merge: true });
    } catch (error) {
      console.error('Error saving MTSS behavior backup config:', error);
      throw error;
    }
  },

  /**
   * Verify Google Drive folder and Spreadsheet access via Backend
   */
  async verifyConfig(config: MTSSBehaviorBackupConfig): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const response = await fetch('/api/mtss-behavior/v1/verify-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });

      return await response.json();
    } catch (error) {
      console.error('Behavior config verification error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }
};
