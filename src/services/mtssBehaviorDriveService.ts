/**
 * Service to handle Shared Drive operations and PDF archival for MTSS Behavior
 */
import { MTSSBehaviorPdfType } from '../types.ts';

export const mtssBehaviorDriveService = {
  /**
   * Archive a generated PDF to Shared Drive
   */
  async archivePdf(caseId: string, pdfData: {
    type: MTSSBehaviorPdfType;
    fileName: string;
    version: number;
    generatedBy: string;
  }): Promise<{ success: boolean; fileId?: string; folderId?: string; error?: string }> {
    try {
      const response = await fetch('/api/mtss-behavior/v1/archive-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          caseId,
          ...pdfData
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Archive Behavior PDF error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  },

  /**
   * Create or ensure case folder exists
   */
  async ensureFolder(caseId: string): Promise<{ success: boolean; folderId?: string; error?: string }> {
    try {
      const response = await fetch('/api/mtss-behavior/v1/ensure-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId })
      });

      return await response.json();
    } catch (error) {
      console.error('Ensure behavior folder error:', error);
      return { success: false, error: String(error) };
    }
  },

  /**
   * Sync a structured JSON snapshot to Shared Drive (v2)
   */
  async syncSnapshot(caseId: string): Promise<{ success: boolean; fileId?: string; error?: string }> {
    try {
      const response = await fetch('/api/mtss-behavior/v2/sync-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId })
      });

      return await response.json();
    } catch (error) {
      console.error('Sync Snapshot Behavior error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }
};
