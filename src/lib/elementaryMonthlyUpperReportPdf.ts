import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from './html2canvasPatch';
import { normalizeUpperReportFilename } from '../types/elementaryMonthlyUpperReport';

export { normalizeUpperReportFilename };

/**
 * Generates an A4 PDF Blob for Elementary Upper Grade Monthly Progress Report (Strict 2 pages).
 */
export async function generateUpperMonthlyProgressPdfBlob(
  pageElements: HTMLElement[]
): Promise<Blob> {
  if (!pageElements || pageElements.length === 0) {
    throw new Error('Elemen halaman Monthly Progress PDF tidak ditemukan.');
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
      onclone: (_clonedDoc, clonedElement) => {
        if (clonedElement) {
          clonedElement.style.width = '794px';
          clonedElement.style.height = '1123px';
          clonedElement.style.minWidth = '794px';
          clonedElement.style.minHeight = '1123px';
          clonedElement.style.boxSizing = 'border-box';
        }
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (i > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  }

  return pdf.output('blob');
}

/**
 * Generates an A4 PDF Blob for Elementary Upper Grade Literacy & Numeracy Report (Strict 1 page).
 */
export async function generateUpperLiteracyNumeracyPdfBlob(
  pageElement: HTMLElement
): Promise<Blob> {
  if (!pageElement) {
    throw new Error('Elemen halaman Laporan Literasi & Numerasi tidak ditemukan.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const canvas = await html2canvasWithModernColors(pageElement, {
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: 794,
    windowHeight: 1123,
    onclone: (_clonedDoc, clonedElement) => {
      if (clonedElement) {
        clonedElement.style.width = '794px';
        clonedElement.style.height = '1123px';
        clonedElement.style.minWidth = '794px';
        clonedElement.style.minHeight = '1123px';
        clonedElement.style.boxSizing = 'border-box';
      }
    },
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

  return pdf.output('blob');
}
