import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from './html2canvasPatch';

export const ELEMENTARY_ROOT_FOLDER_ID = '17nW4LvLZ5t4SPHA50RIvRTsqebzv0s0R';

/**
 * Normalizes filename according to requirement:
 * [Nama Siswa] - Midterm [Periode] - [Tahun Ajaran].pdf
 * Example: Mikhaila Vallari Parveen - Midterm 1 - 2026-2027.pdf
 */
export function normalizeElementaryMidtermFilename(
  studentName: string,
  midtermTerm: string | number,
  academicYear: string
): string {
  const sanitize = (val: string) =>
    (val || '')
      .replace(/[\/\\:\*\?"<>\|]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

  const cleanStudent = sanitize(studentName);
  const cleanTerm = String(midtermTerm).trim();
  const cleanYear = academicYear.replace(/\//g, '-').trim();

  return `${cleanStudent} - Midterm ${cleanTerm} - ${cleanYear}.pdf`;
}

/**
 * Converts a Blob to base64 string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Generates an A4 PDF Blob from an array of HTMLElement (.pdf-page elements)
 */
export async function generateElementaryMidtermPdfBlob(
  pageElements: HTMLElement[]
): Promise<Blob> {
  if (!pageElements || pageElements.length === 0) {
    throw new Error('Elemen halaman laporan PDF tidak ditemukan.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pageElements.length; i++) {
    const pageEl = pageElements[i];

    const canvas = await html2canvasWithModernColors(pageEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 794,
      windowHeight: 1123,
      onclone: (clonedDoc, clonedElement) => {
        if (clonedElement) {
          clonedElement.style.width = '794px';
          clonedElement.style.height = '1123px';
          clonedElement.style.minWidth = '794px';
          clonedElement.style.minHeight = '1123px';
          clonedElement.style.boxSizing = 'border-box';
        }
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.90);

    if (i > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  }

  return pdf.output('blob');
}

/**
 * Checks if current user token has access to the official Elementary Root Folder
 */
export async function verifyElementaryRootFolderAccess(token: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${ELEMENTARY_ROOT_FOLDER_ID}?supportsAllDrives=true&fields=id,name`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error('Akun Google Anda belum memiliki akses ke folder Midterm Elementary.');
  }
}

/**
 * Finds a folder by name inside a parent folder on Google Drive
 */
export async function findFolderOnDrive(
  token: string,
  name: string,
  parentId: string
): Promise<string | null> {
  const escapedName = name.replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id,name)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal mencari folder '${name}' di Google Drive: ${text}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Creates a folder inside a parent folder on Google Drive
 */
export async function createFolderOnDrive(
  token: string,
  name: string,
  parentId: string
): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal membuat folder '${name}' di Google Drive: ${text}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Ensures hierarchy:
 * rootFolderId ("17nW4LvLZ5t4SPHA50RIvRTsqebzv0s0R")
 * └── Rapor Midterm Elementary [Tahun Ajaran]
 *     └── [Nama Kelas] - Midterm [Periode]
 */
export async function ensureElementaryDriveFolders(
  token: string,
  academicYear: string,
  className: string,
  midtermTerm: string | number
): Promise<{ yearFolderId: string; classFolderId: string }> {
  // 1. Verify access to official root folder
  await verifyElementaryRootFolderAccess(token);

  // 2. Academic Year folder
  const yearFolderName = `Rapor Midterm Elementary ${academicYear}`;
  let yearFolderId = await findFolderOnDrive(token, yearFolderName, ELEMENTARY_ROOT_FOLDER_ID);
  if (!yearFolderId) {
    yearFolderId = await createFolderOnDrive(token, yearFolderName, ELEMENTARY_ROOT_FOLDER_ID);
  }

  // 3. Class & Term subfolder
  const classFolderName = `${className} - Midterm ${midtermTerm}`;
  let classFolderId = await findFolderOnDrive(token, classFolderName, yearFolderId);
  if (!classFolderId) {
    classFolderId = await createFolderOnDrive(token, classFolderName, yearFolderId);
  }

  return { yearFolderId, classFolderId };
}

/**
 * Uploads PDF Blob to specified Google Drive folder and sets public read permissions
 */
export async function uploadElementaryMidtermPdfToDrive(
  pdfBlob: Blob,
  fileName: string,
  parentFolderId: string,
  token: string
): Promise<{ driveFileId: string; driveFileUrl: string }> {
  const base64Data = await blobToBase64(pdfBlob);
  const boundary = 'foo_bar_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    mimeType: 'application/pdf',
    parents: [parentFolderId],
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

  const res = await fetch(
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengunggah file '${fileName}' ke Google Drive (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const driveFileId = data.id || '';
  if (!driveFileId) {
    throw new Error('Google Drive tidak mengembalikan ID file setelah upload.');
  }

  const driveFileUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

  // Grant public read permission (anyone with link can view)
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
  } catch (permErr) {
    console.warn('Failed to set public permissions on uploaded file:', permErr);
  }

  return { driveFileId, driveFileUrl };
}
