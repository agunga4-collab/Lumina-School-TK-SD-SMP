/**
 * Helper service for direct Google Drive API v3 multipart uploads
 * Scoped strictly to Junior High Monthly Reports Drive folder
 */

const JUNIOR_HIGH_DRIVE_FOLDER_ID = '1mjxXJKaKSCfn0RNpJWQTsI65DwnhiyqK';

export interface UploadResult {
  driveFileId: string;
  driveFileUrl: string;
}

/**
 * Transforms a Blob into its Base64-encoded string representation
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Performs direct multipart/related Google Drive v3 file upload.
 * Places the generated A4 PDF strictly within the designated Junior High root folder.
 */
export async function uploadJuniorHighMonthlyReportPdf(
  pdfBlob: Blob,
  filename: string,
  token: string
): Promise<UploadResult> {
  try {
    const base64Data = await blobToBase64(pdfBlob);
    const boundary = 'foo_bar_jh_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const metadata = {
      name: filename,
      mimeType: 'application/pdf',
      parents: [JUNIOR_HIGH_DRIVE_FOLDER_ID],
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/pdf\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      close_delim;

    const driveResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!driveResponse.ok) {
      const errText = await driveResponse.text();
      throw new Error(`Google Drive API returned status ${driveResponse.status}: ${errText}`);
    }

    const driveData = await driveResponse.json();
    const driveFileId = driveData.id || '';
    const driveFileUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : '';

    return { driveFileId, driveFileUrl };
  } catch (error) {
    console.error('[uploadJuniorHighMonthlyReportPdf] Error uploading file:', error);
    throw error;
  }
}
