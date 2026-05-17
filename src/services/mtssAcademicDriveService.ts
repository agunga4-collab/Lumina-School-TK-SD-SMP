/**
 * Service to handle Shared Drive operations and PDF archival for MTSS Academic
 */
export const mtssAcademicDriveService = {
  /**
   * Archive a generated PDF to Shared Drive
   * Note: This assumes the PDF is already "generated" in the sense that the data is ready.
   * In a real flow, the client might trigger this after successful PDF generation in the browser
   * or the backend might handle both generation and upload.
   * For v1, we'll let the backend handle the "Archive" part from a provided data snapshot.
   */
  async archivePdf(caseId: string, pdfData: {
    fileName: string;
    version: number;
    generatedBy: string;
    // contentBase64?: string; // If we want to send the actual blob from client
  }): Promise<{ success: boolean; fileId?: string; folderId?: string; error?: string }> {
    try {
      const response = await fetch('/api/mtss-academic/v1/archive-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          caseId,
          ...pdfData
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Archive PDF error:', error);
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
      const response = await fetch('/api/mtss-academic/v1/ensure-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId })
      });

      return await response.json();
    } catch (error) {
      console.error('Ensure folder error:', error);
      return { success: false, error: String(error) };
    }
  },

  /**
   * Sync a structured JSON snapshot to Shared Drive (v2)
   */
  async syncSnapshot(caseId: string): Promise<{ success: boolean; fileId?: string; error?: string }> {
    try {
      const response = await fetch('/api/mtss-academic/v2/sync-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId })
      });

      return await response.json();
    } catch (error) {
      console.error('Sync Snapshot Academic error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }
};
