import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from './html2canvasPatch';

/**
 * Normalizes filename according to requirement:
 * LDSS_[NamaSiswa]_[Kelas]_[TahunAjaran].pdf
 * Example: LDSS_Muhammad_Gibran_Arasya_1_Fuji_2026-2027.pdf
 */
export function normalizeElementaryLdssFilename(
  studentName: string,
  className: string,
  academicYear: string
): string {
  const sanitize = (val: string) =>
    (val || '')
      .replace(/[\/\\:\*\?"<>\|]/g, '')
      .trim()
      .replace(/\s+/g, '_');

  const cleanStudent = sanitize(studentName);
  const cleanClass = sanitize(className);
  const cleanYear = academicYear.replace(/\//g, '-').trim();

  return `LDSS_${cleanStudent}_${cleanClass}_${cleanYear}.pdf`;
}

/**
 * Generates an A4 PDF Blob and triggers download from an array of HTMLElement (.pdf-page elements)
 */
export async function generateElementaryLdssPdfBlob(
  pageElements: HTMLElement[],
  fileName: string
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

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (i > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  }

  // Trigger download directly in browser
  pdf.save(fileName);

  return pdf.output('blob');
}
