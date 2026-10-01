import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from './html2canvasPatch';

export const JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID = '1fdDP4BFPe8yFuCN8lHJ8SHJ7wp9gQK4Q';

/**
 * Normalizes filename according to exact pattern:
 * Midterm_Report_Junior_High_[Class]_[StudentName]_Term[Term]_[AcademicYear].pdf
 * Spaces replaced with '-', repeated '-' collapsed, illegal characters removed.
 */
export function normalizeMidtermFilename(
  className: string,
  studentName: string,
  term: string | number,
  academicYear: string
): string {
  const sanitize = (val: string) =>
    (val || '')
      .replace(/[\/\\:\*\?"<>\|]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

  const cleanClass = sanitize(className);
  const cleanStudent = sanitize(studentName);
  const cleanTerm = sanitize(String(term));
  const cleanYear = sanitize(academicYear);

  return `Midterm_Report_Junior_High_${cleanClass}_${cleanStudent}_Term${cleanTerm}_${cleanYear}.pdf`;
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
 * Generates A4 PDF from the rendered report DOM elements dynamically
 */
export async function generateMidtermPdfBlob(
  firstArg: HTMLElement | HTMLElement[],
  secondArg?: HTMLElement
): Promise<Blob> {
  let pageElements: HTMLElement[] = [];
  if (Array.isArray(firstArg)) {
    pageElements = firstArg;
  } else {
    pageElements = [firstArg];
    if (secondArg) {
      pageElements.push(secondArg);
    }
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
 * Checks if current user token has access to the official Junior High Midterm Root Folder
 */
export async function verifyJuniorHighRootFolderAccess(token: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID}?supportsAllDrives=true&fields=id,name`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error('Akun Google Anda belum memiliki akses ke Shared Drive folder Midterm Junior High.');
  }
}

/**
 * Finds a folder by name inside a parent folder on Google Drive (Shared Drive compatible)
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
 * Creates a folder inside a parent folder on Google Drive (Shared Drive compatible)
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
 * Ensures hierarchy on Shared Drive (root: 1fdDP4BFPe8yFuCN8lHJ8SHJ7wp9gQK4Q):
 * └── Tahun Ajaran [Academic Year]
 *     └── Semester [Semester]
 *         └── Midterm [Period]
 *             └── [Class Name]
 */
export async function ensureJuniorHighMidtermDriveFolders(
  token: string,
  academicYear: string,
  semester: string | number,
  midtermTerm: string | number,
  className: string
): Promise<{ yearFolderId: string; semesterFolderId: string; termFolderId: string; classFolderId: string }> {
  // 1. Verify access to official root folder
  await verifyJuniorHighRootFolderAccess(token);

  // 2. Academic Year folder
  const cleanYear = academicYear.replace(/\//g, '-').trim();
  const yearFolderName = `Tahun Ajaran ${cleanYear}`;
  let yearFolderId = await findFolderOnDrive(token, yearFolderName, JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID);
  if (!yearFolderId) {
    yearFolderId = await createFolderOnDrive(token, yearFolderName, JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID);
  }

  // 3. Semester folder
  const semesterFolderName = `Semester ${semester}`;
  let semesterFolderId = await findFolderOnDrive(token, semesterFolderName, yearFolderId);
  if (!semesterFolderId) {
    semesterFolderId = await createFolderOnDrive(token, semesterFolderName, yearFolderId);
  }

  // 4. Midterm folder
  const termFolderName = `Midterm ${midtermTerm}`;
  let termFolderId = await findFolderOnDrive(token, termFolderName, semesterFolderId);
  if (!termFolderId) {
    termFolderId = await createFolderOnDrive(token, termFolderName, semesterFolderId);
  }

  // 5. Class folder
  const classFolderName = className.trim();
  let classFolderId = await findFolderOnDrive(token, classFolderName, termFolderId);
  if (!classFolderId) {
    classFolderId = await createFolderOnDrive(token, classFolderName, termFolderId);
  }

  return { yearFolderId, semesterFolderId, termFolderId, classFolderId };
}

/**
 * Uploads Midterm PDF Blob to specified Google Drive folder and sets public read permissions
 */
export async function uploadJuniorHighMidtermPdfToDrive(
  pdfBlob: Blob,
  fileName: string,
  parentFolderId: string,
  token: string
): Promise<{ driveFileId: string; driveFileUrl: string }> {
  const base64Data = await blobToBase64(pdfBlob);
  const boundary = 'foo_bar_boundary_jh';
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

/**
 * Backward compatibility helper
 */
export async function uploadMidtermPdfToDrive(
  pdfBlob: Blob,
  fileName: string,
  tokenOrFolder: string,
  tokenOpt?: string
): Promise<{ driveFileId: string; driveFileUrl: string }> {
  if (tokenOpt) {
    return await uploadJuniorHighMidtermPdfToDrive(pdfBlob, fileName, tokenOrFolder, tokenOpt);
  }
  return await uploadJuniorHighMidtermPdfToDrive(pdfBlob, fileName, JUNIOR_HIGH_MIDTERM_ROOT_FOLDER_ID, tokenOrFolder);
}
