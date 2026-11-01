import * as React from 'react';
import { X, Download, Printer, ChevronLeft, ChevronRight, AlertTriangle, ExternalLink } from 'lucide-react';
import { ElementaryMonthlyReportDocument } from './ElementaryMonthlyReportDocument';
import { generateElementaryMonthlyPdfBlob, normalizeElementaryMonthlyFilename } from '../../../../lib/elementaryMonthlyReportPdf';
import type {
  ElementaryMonthlyAttendanceSummary,
  ElementaryMonthlyReportSignatory,
  ElementaryMonthlyCurriculumDoc,
  ElementaryMonthlyStudentNarrativeDoc,
  ElementaryMonthlyProjectDoc,
  ElementaryMonthlyStudentPhotoDoc,
  PublishedElementaryMonthlyReportDoc
} from '../../../../types/elementaryMonthlyReport';
import type { Student, Class } from '../../../../types';
import { toast } from 'sonner';
import { auth } from '../../../../lib/firebase';

interface MonthlyReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  allStudents: Student[];
  onSelectStudent: (student: Student) => void;
  classInfo: Class | null;
  academicYear: string;
  semester: string;
  month: string;
  monthLabel: string;
  curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
  studentScoresMap: Record<string, number>;
  narrativeDoc: ElementaryMonthlyStudentNarrativeDoc | null;
  projectDoc: ElementaryMonthlyProjectDoc | null;
  photoDoc: ElementaryMonthlyStudentPhotoDoc | null;
  attendanceSummary: ElementaryMonthlyAttendanceSummary;
  signatory: ElementaryMonthlyReportSignatory;
  logoUrl?: string | null;
  publishedReport: PublishedElementaryMonthlyReportDoc | null;
}

export const MonthlyReportPreviewModal: React.FC<MonthlyReportPreviewModalProps> = ({
  isOpen, onClose, student, allStudents, onSelectStudent, classInfo,
  academicYear, semester, month, monthLabel, curriculumDoc, studentScoresMap,
  narrativeDoc, projectDoc, photoDoc, attendanceSummary, signatory, logoUrl, publishedReport
}) => {
  const [mode, setMode] = React.useState<'draft' | 'published'>('draft');
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
  const [originalAsset, setOriginalAsset] = React.useState<{ key: string; url: string; error: string | null }>({ key: '', url: '', error: null });
  const [readiness, setReadiness] = React.useState({ key: '', ready: false });
  const [renderError, setRenderError] = React.useState<{ key: string; message: string | null }>({ key: '', message: null });
  const documentRef = React.useRef<HTMLDivElement>(null);
  const busyRef = React.useRef(false);
  const contextKey = `${student?.id || ''}|${classInfo?.id || ''}|${academicYear}|${semester}|${month}|${mode}`;
  const isReadyForPdf = readiness.key === contextKey && readiness.ready;
  const onReadyChange = React.useCallback((ready: boolean) => setReadiness({ key: contextKey, ready }), [contextKey]);
  const onRenderError = React.useCallback((message: string | null) => setRenderError({ key: contextKey, message }), [contextKey]);
  const isPublished = publishedReport?.status === 'PUBLISHED';
  const originalPdfUrl = publishedReport?.driveFileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(publishedReport.driveFileId)}/view`
    : /^https:\/\//i.test(publishedReport?.driveFileUrl || '') ? publishedReport!.driveFileUrl! : '';
  const originalKey = `${publishedReport?.id || ''}|${publishedReport?.version || 0}`;
  const originalReady = originalAsset.key === originalKey && Boolean(originalAsset.url);

  React.useEffect(() => {
    if (!isOpen || mode !== 'published' || !originalPdfUrl || !publishedReport) return;
    const controller = new AbortController();
    let objectUrl = '';
    setOriginalAsset({ key: originalKey, url: '', error: null });
    (async () => {
      const user = auth.currentUser;
      if (!user) throw new Error('Sesi login diperlukan untuk membuka PDF arsip.');
      const token = await user.getIdToken();
      const response = await fetch(`/api/elementary-monthly/reports/pdf/${encodeURIComponent(publishedReport.id)}?version=${publishedReport.version}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, credentials: 'same-origin', cache: 'no-store'
      });
      if (!response.ok) throw new Error(`PDF arsip tidak dapat diakses (HTTP ${response.status}). Periksa izin atau buka tautan Drive dengan akun yang berhak.`);
      const blob = await response.blob();
      if (!blob.size || (await blob.slice(0, 5).text()) !== '%PDF-') throw new Error('Arsip tidak mengembalikan berkas PDF yang valid.');
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setOriginalAsset({ key: originalKey, url: objectUrl, error: null });
    })().catch(error => {
      if (!controller.signal.aborted) setOriginalAsset({ key: originalKey, url: '', error: error instanceof Error ? error.message : 'PDF arsip gagal dimuat.' });
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [isOpen, mode, originalKey, originalPdfUrl]);

  React.useEffect(() => {
    setMode(publishedReport?.status === 'PUBLISHED' ? 'published' : 'draft');
  }, [isOpen, student?.id, publishedReport?.id, publishedReport?.version]);

  if (!isOpen || !student) return null;

  const currentIndex = allStudents.findIndex(item => item.id === student.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allStudents.length - 1;

  const generateDraftPdf = async (print: boolean) => {
    if (busyRef.current || !isReadyForPdf) return;
    busyRef.current = true;
    setIsGeneratingPdf(true);
    const printWindow = print ? window.open('', '_blank') : null;
    if (printWindow) printWindow.opener = null;
    const toastId = toast.loading('Membuat PDF draft Monthly Report...');
    try {
      if (print && !printWindow) throw new Error('Izinkan tab baru untuk membuka PDF yang akan dicetak.');
      const pages = Array.from(documentRef.current?.querySelectorAll<HTMLElement>('[data-monthly-page]') || []) as HTMLElement[];
      const pdfBlob = await generateElementaryMonthlyPdfBlob(pages);
      const filename = normalizeElementaryMonthlyFilename(student.name, monthLabel, academicYear).replace(/\.pdf$/, ' - DRAFT.pdf');
      const url = URL.createObjectURL(pdfBlob);
      if (printWindow) {
        printWindow.location.href = url;
        toast.success('PDF draft dibuka. Gunakan tombol cetak pada penampil PDF browser.', { id: toastId });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(`PDF draft dibuat: ${filename}`, { id: toastId });
      }
    } catch (error) {
      printWindow?.close();
      toast.error(error instanceof Error ? error.message : 'Gagal membuat PDF draft.', { id: toastId });
    } finally {
      busyRef.current = false;
      setIsGeneratingPdf(false);
    }
  };

  const openOriginalPdf = (print: boolean) => {
    if (!originalReady) return;
    if (print) {
      window.open(originalAsset.url, '_blank', 'noopener,noreferrer');
      toast.info('Gunakan tombol cetak pada penampil PDF browser.');
    } else {
      const link = document.createElement('a');
      link.href = originalAsset.url;
      link.download = publishedReport?.fileName || normalizeElementaryMonthlyFilename(student.name, monthLabel, academicYear);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-xs" role="dialog" aria-modal="true" aria-label="Pratinjau Monthly Report Elementary">
      <div className="bg-slate-100 rounded-3xl max-w-5xl w-full h-[95vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden">
        <div className="bg-white px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase text-slate-900 tracking-tight">{student.name}</span>
                <span className="text-slate-300">·</span>
                <span className="text-[11px] font-semibold text-slate-500">{classInfo?.name || 'Elementary'} ({monthLabel})</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mode === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {mode === 'published' ? `Arsip v${publishedReport?.version || 1}` : 'Draft Internal'}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setMode('draft')} disabled={isGeneratingPdf} className={`px-2 py-1 border rounded text-xs ${mode === 'draft' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200'}`}>
                  Draft terbaru
                </button>
                {isPublished && (
                  <button type="button" onClick={() => setMode('published')} disabled={isGeneratingPdf} className={`px-2 py-1 border rounded text-xs ${mode === 'published' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'border-slate-200'}`}>
                    Arsip terbit v{publishedReport.version}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
              <button type="button" onClick={() => hasPrev && onSelectStudent(allStudents[currentIndex - 1])} disabled={!hasPrev || isGeneratingPdf} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30" title="Siswa sebelumnya"><ChevronLeft size={16} /></button>
              <span className="text-[11px] font-bold text-slate-500 px-1">{currentIndex + 1} / {allStudents.length}</span>
              <button type="button" onClick={() => hasNext && onSelectStudent(allStudents[currentIndex + 1])} disabled={!hasNext || isGeneratingPdf} className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30" title="Siswa berikutnya"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => mode === 'published' ? openOriginalPdf(true) : void generateDraftPdf(true)} disabled={isGeneratingPdf || (mode === 'draft' ? !isReadyForPdf : !originalReady)} className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-700 flex items-center gap-1.5 disabled:opacity-50"><Printer size={14} />Cetak PDF</button>
            <button type="button" onClick={() => mode === 'published' ? openOriginalPdf(false) : void generateDraftPdf(false)} disabled={isGeneratingPdf || (mode === 'draft' ? !isReadyForPdf : !originalReady)} className="px-4 py-1.5 text-xs font-bold rounded-xl bg-blue-600 text-white flex items-center gap-1.5 disabled:opacity-50">
              <Download size={14} />{isGeneratingPdf ? 'Membuat PDF...' : mode === 'published' ? 'Unduh PDF asli' : 'Unduh PDF draft'}
            </button>
            <button type="button" onClick={onClose} disabled={isGeneratingPdf} className="p-2 text-slate-500 rounded-xl hover:bg-slate-100 disabled:opacity-50" aria-label="Tutup pratinjau"><X size={18} /></button>
          </div>
        </div>
        {mode === 'draft' && (
          <div className="px-5 py-2 text-xs bg-amber-50 border-b border-amber-200 text-amber-900">
            Draft dapat dilihat sebelum data lengkap. Publikasi tetap memerlukan seluruh validasi dan PDF berhasil diunggah.
            {!isReadyForPdf && !(renderError.key === contextKey && renderError.message) && <span> Menunggu gambar, font, dan pemeriksaan ukuran A4.</span>}
          </div>
        )}
        <div className="flex-1 overflow-auto p-4 sm:p-6" ref={documentRef}>
          {mode === 'draft' ? (
            <ElementaryMonthlyReportDocument
              key={contextKey}
              previewData={{ student, classInfo, academicYear, semester, month, monthLabel, curriculumDoc, scoresMap: studentScoresMap, narrativeDoc, projectDoc, photoDoc, attendanceSummary, signatory, logoUrl }}
              isDraft={true}
              onReadyChange={onReadyChange}
              onRenderError={onRenderError}
            />
          ) : originalPdfUrl ? (
            <div className="h-full flex flex-col gap-3">
              <div className="text-xs text-slate-700 bg-white border border-slate-200 p-3">
                Ini PDF asli versi {publishedReport?.version} yang tersimpan saat publikasi, dibaca melalui akses aplikasi yang terautentikasi.
                <a href={originalPdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline inline-flex items-center gap-1 ml-2">Buka di Drive <ExternalLink size={12} /></a>
                {!publishedReport?.reportSnapshot?.templateVersion && <p className="mt-1">Arsip ini belum menyimpan templateVersion; file aslinya dipertahankan dan tidak dibuat ulang otomatis.</p>}
              </div>
              {originalReady ? <iframe title={`PDF Monthly Report ${student.name}`} src={originalAsset.url} className="w-full flex-1 min-h-[500px] bg-white border border-slate-300" /> : <p className="text-sm" role={originalAsset.error ? 'alert' : 'status'}>{originalAsset.key === originalKey && originalAsset.error ? originalAsset.error : 'Memuat PDF asli...'}</p>}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-300 p-5 text-amber-950 text-sm">
              <h3 className="font-bold flex items-center gap-2"><AlertTriangle size={18} />Arsip lama hanya memiliki snapshot</h3>
              <p className="mt-2">Record versi {publishedReport?.version} belum memiliki ID/URL PDF Drive. Snapshot yang tersimpan tidak diubah dan tidak dianggap sebagai bukti PDF sudah terunggah.</p>
              <p className="mt-2">Pilih Draft terbaru untuk memeriksa data saat ini. Publikasikan versi baru setelah semua persyaratan lengkap agar PDF dibuat dan metadata Drive tercatat.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
