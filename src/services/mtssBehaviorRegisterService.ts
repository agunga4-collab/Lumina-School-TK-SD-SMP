import { MTSSCase, MTSSSyncStatus } from '../types';

export interface MTSSBehaviorSyncResult {
  success: boolean;
  error?: string;
  rowKey?: string;
  timestamp?: number;
}

/**
 * Service to sync MTSS Behavior Case data to Master Register Google Sheet
 */
export const mtssBehaviorRegisterService = {
  /**
   * Sync a case to the master register
   */
  async syncCase(mtssCase: MTSSCase, triggerSource: string): Promise<MTSSBehaviorSyncResult> {
    try {
      const response = await fetch('/api/mtss-behavior/v1/sync-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          caseId: mtssCase.id,
          triggerSource
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || 'Server error during sync'
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Behavior Intervention Record sync error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown network error'
      };
    }
  },

  /**
   * Bulk sync all active cases (for initialization or recovery)
   */
  async bulkSync(academicYear: string, semester: '1' | '2'): Promise<{ total: number; success: number; errors: number }> {
    try {
      const response = await fetch('/api/mtss-behavior/v1/bulk-sync-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear, semester })
      });

      return await response.json();
    } catch (error) {
      console.error('Behavior bulk sync error:', error);
      throw error;
    }
  }
};
