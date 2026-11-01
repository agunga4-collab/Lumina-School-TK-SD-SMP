import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from './html2canvasPatch';
import type { ElementaryMonthlyReportSnapshot } from '../types/elementaryMonthlyReport';
import {
  ELEMENTARY_MONTHLY_PAGE_HEIGHT,
  ELEMENTARY_MONTHLY_PAGE_WIDTH,
  ELEMENTARY_MONTHLY_RENDER_TIMEOUT,
  waitForElementaryMonthlyPages
} from './elementaryMonthlyReportRender';

/** Versions are appended by the publication workflow; draft names stay readable. */
export function normalizeElementaryMonthlyFilename(
  studentName: string,
  monthLabel: string,
  academicYear: string
): string {
  const sanitize = (value: string) => (value || '')
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return `${sanitize(studentName)} - Monthly Report ${sanitize(monthLabel)} - ${sanitize(academicYear.replace(/\//g, '-'))}.pdf`;
}

function addAlbumLinks(pdf: jsPDF, page: HTMLElement): void {
  const pageRect = page.getBoundingClientRect();
  const scaleX = pdf.internal.pageSize.getWidth() / pageRect.width;
  const scaleY = pdf.internal.pageSize.getHeight() / pageRect.height;
  page.querySelectorAll<HTMLAnchorElement>('a[data-monthly-album]').forEach(anchor => {
    if (!/^https?:\/\//i.test(anchor.href)) return;
    Array.from(anchor.getClientRects()).forEach(rect => {
      const left = Math.max(rect.left, pageRect.left);
      const top = Math.max(rect.top, pageRect.top);
      const right = Math.min(rect.right, pageRect.right);
      const bottom = Math.min(rect.bottom, pageRect.bottom);
      if (right <= left || bottom <= top) return;
      pdf.link((left - pageRect.left) * scaleX, (top - pageRect.top) * scaleY,
        (right - left) * scaleX, (bottom - top) * scaleY, { url: anchor.href });
    });
  });
}

/**
 * All image bytes are resolved before this function is called. A missing image,
 * failed font, or oversized page rejects export instead of creating a clipped PDF.
 */
export async function generateElementaryMonthlyPdfBlob(
  pageElements: HTMLElement[],
  options: { snapshot?: ElementaryMonthlyReportSnapshot } = {}
): Promise<Blob> {
  await waitForElementaryMonthlyPages(pageElements);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  // The server persists the reservation timestamp once; retries keep that actual time.
  if (options.snapshot?.snapshotCreatedAt && Number.isFinite(options.snapshot.snapshotCreatedAt)) {
    pdf.setCreationDate(new Date(options.snapshot.snapshotCreatedAt));
  }
  if (options.snapshot) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(options.snapshot)));
    const id = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('').slice(0, 32);
    pdf.setFileId(id);
    pdf.setProperties({ title: `${options.snapshot.student.name} - Monthly Report ${options.snapshot.monthLabel}` });
  } else {
    pdf.setFileId('00000000000000000000000000000000');
  }
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let index = 0; index < pageElements.length; index++) {
    const page = pageElements[index];
    const canvas = await html2canvasWithModernColors(page, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: ELEMENTARY_MONTHLY_RENDER_TIMEOUT,
      windowWidth: ELEMENTARY_MONTHLY_PAGE_WIDTH,
      windowHeight: ELEMENTARY_MONTHLY_PAGE_HEIGHT,
      onclone: (_document: Document, clone: HTMLElement) => {
        clone.style.boxShadow = 'none';
        clone.style.margin = '0';
        clone.style.width = `${ELEMENTARY_MONTHLY_PAGE_WIDTH}px`;
        clone.style.minWidth = `${ELEMENTARY_MONTHLY_PAGE_WIDTH}px`;
        clone.style.minHeight = `${ELEMENTARY_MONTHLY_PAGE_HEIGHT}px`;
        clone.style.overflow = 'visible';
      }
    });
    if (canvas.width < 1 || canvas.height < 1) throw new Error('Renderer menghasilkan halaman PDF kosong.');
    if (index > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    addAlbumLinks(pdf, page);
    canvas.width = 0;
    canvas.height = 0;
  }
  const blob = pdf.output('blob');
  if (blob.size === 0) throw new Error('Berkas PDF kosong. Publikasi dihentikan.');
  return blob;
}

class MonthlyPdfRenderBoundary extends React.Component<{
  children: React.ReactNode;
  onError: (error: Error) => void;
}, { failed: boolean }> {
  declare props: { children: React.ReactNode; onError: (error: Error) => void };
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Publication uses exactly the same snapshot component as the preview. The
 * isolated container is scoped by a reference, never by global element IDs.
 */
export async function renderElementaryMonthlyReportPdf(snapshot: ElementaryMonthlyReportSnapshot): Promise<Blob> {
  const { ElementaryMonthlyReportDocument } = await import('../pages/Elementary/MonthlyReport/components/ElementaryMonthlyReportDocument');
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.setAttribute('data-monthly-pdf-renderer', 'true');
  Object.assign(container.style, {
    position: 'fixed', left: '-10000px', top: '0', width: `${ELEMENTARY_MONTHLY_PAGE_WIDTH}px`,
    pointerEvents: 'none', backgroundColor: '#ffffff', zIndex: '-1'
  });
  document.body.appendChild(container);
  const root = createRoot(container);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Renderer PDF melewati batas waktu. Periksa font, foto, logo, dan tanda tangan.')), ELEMENTARY_MONTHLY_RENDER_TIMEOUT);
      root.render(React.createElement(MonthlyPdfRenderBoundary, { onError: reject, children:
        React.createElement(ElementaryMonthlyReportDocument, {
          snapshot,
          isDraft: false,
          onReadyChange: ready => { if (ready) resolve(); },
          onRenderError: message => { if (message) reject(new Error(message)); }
        })
      }));
    });
    clearTimeout(timer);
    const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-monthly-page]'));
    return await generateElementaryMonthlyPdfBlob(pages, { snapshot });
  } finally {
    clearTimeout(timer);
    root.unmount();
    container.remove();
  }
}
