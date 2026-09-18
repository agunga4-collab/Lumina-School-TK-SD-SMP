import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from './html2canvasPatch';
import { uploadJuniorHighMonthlyReportPdf } from './juniorHighMonthlyReportDrive';

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
 * Generates 2-page A4 PDF from the rendered report DOM elements
 */
export async function generateMidtermPdfBlob(
  page1Element: HTMLElement,
  page2Element: HTMLElement
): Promise<Blob> {
  const canvas1 = await html2canvasWithModernColors(page1Element, {
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

  const canvas2 = await html2canvasWithModernColors(page2Element, {
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

  const imgData1 = canvas1.toDataURL('image/jpeg', 0.90);
  const imgData2 = canvas2.toDataURL('image/jpeg', 0.90);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  // Page 1
  pdf.addImage(imgData1, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

  // Page 2
  pdf.addPage();
  pdf.addImage(imgData2, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

  return pdf.output('blob');
}

/**
 * Uploads Midterm PDF to Google Drive using existing Drive service
 */
export async function uploadMidtermPdfToDrive(
  pdfBlob: Blob,
  fileName: string,
  token: string
): Promise<{ driveFileId: string; driveFileUrl: string }> {
  return await uploadJuniorHighMonthlyReportPdf(pdfBlob, fileName, token);
}
