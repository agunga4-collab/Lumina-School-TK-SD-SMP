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

export interface LdssScoreColorInfo {
  hex: string;            // Main score color: #6366f1 (high), #f59e0b (medium), #f43f5e (low), #cbd5e1 (empty)
  bgHex: string;          // Light card background: #eef2ff, #fffbeb, #fff1f2, #f8fafc
  borderHex: string;      // Border color: #c7d2fe, #fde68a, #fecdd3, #e2e8f0
  textHex: string;        // Text color: #4338ca, #b45309, #be123c, #64748b
  label: string;          // 'Tinggi' | 'Menengah' | 'Rendah' | 'Belum Ada Data'
  level: 'high' | 'medium' | 'low' | 'empty';
}

/**
 * Single shared score color resolver for LDSS across Screen (Modal) and PDF.
 * Thresholds:
 * - >= 60%: Tinggi -> Biru / Indigo (#6366f1)
 * - 40% - 59%: Menengah -> Oranye / Amber (#f59e0b)
 * - < 40%: Rendah -> Merah / Rose (#f43f5e)
 * - Empty / null / NaN: Tanpa data -> Abu-abu (#cbd5e1) / tanpa batang
 */
export function getLdssScoreColor(score: number | null | undefined): LdssScoreColorInfo {
  if (score === null || score === undefined || isNaN(score)) {
    return {
      hex: '#cbd5e1',
      bgHex: '#f8fafc',
      borderHex: '#e2e8f0',
      textHex: '#64748b',
      label: 'Belum Ada Data',
      level: 'empty'
    };
  }

  if (score >= 60) {
    return {
      hex: '#6366f1',
      bgHex: '#eef2ff',
      borderHex: '#c7d2fe',
      textHex: '#4338ca',
      label: 'Tinggi',
      level: 'high'
    };
  }

  if (score >= 40) {
    return {
      hex: '#f59e0b',
      bgHex: '#fffbeb',
      borderHex: '#fde68a',
      textHex: '#b45309',
      label: 'Menengah',
      level: 'medium'
    };
  }

  return {
    hex: '#f43f5e',
    bgHex: '#fff1f2',
    borderHex: '#fecdd3',
    textHex: '#be123c',
    label: 'Rendah',
    level: 'low'
  };
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

  // 1. Ensure all web fonts are completely ready before html2canvas capture
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready;
    } catch (e) {
      console.warn('document.fonts.ready warning:', e);
    }
  }

  // Brief delay to ensure Recharts SVG layout and font metrics are settled
  await new Promise((resolve) => setTimeout(resolve, 200));

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pageElements.length; i++) {
    const pageEl = pageElements[i];

    const contentWidth = pageEl.scrollWidth || pageEl.offsetWidth || 794;
    const contentHeight = pageEl.scrollHeight || pageEl.offsetHeight || 1123;

    const canvas = await html2canvasWithModernColors(pageEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: contentWidth,
      windowHeight: contentHeight,
      width: contentWidth,
      height: contentHeight,
      onclone: (clonedDoc, clonedElement) => {
        if (clonedElement) {
          clonedElement.style.width = '794px';
          clonedElement.style.height = '1123px';
          clonedElement.style.minWidth = '794px';
          clonedElement.style.minHeight = '1123px';
          clonedElement.style.boxSizing = 'border-box';
          clonedElement.style.overflow = 'visible';
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
