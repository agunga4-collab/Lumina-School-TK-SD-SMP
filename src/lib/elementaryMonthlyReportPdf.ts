import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from './html2canvasPatch';

/**
 * Normalizes filename according to requirement:
 * [Nama Siswa] - Monthly Report [Bulan] - [Tahun Ajaran].pdf
 * Example: Alana - Monthly Report Agustus 2025 - 2025-2026.pdf
 */
export function normalizeElementaryMonthlyFilename(
  studentName: string,
  monthLabel: string,
  academicYear: string
): string {
  const sanitize = (val: string) =>
    (val || '')
      .replace(/[\/\\:\*\?"<>\|]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

  const cleanStudent = sanitize(studentName);
  const cleanMonth = sanitize(monthLabel);
  const cleanYear = academicYear.replace(/\//g, '-').trim();

  return `${cleanStudent} - Monthly Report ${cleanMonth} - ${cleanYear}.pdf`;
}

/**
 * Generates an A4 PDF Blob from an array of HTMLElement (.elem-monthly-page elements)
 */
export async function generateElementaryMonthlyPdfBlob(
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
