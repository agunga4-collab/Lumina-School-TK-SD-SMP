import * as React from 'react';
import { X, Download, Printer, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { ElementaryMonthlyReportDocument } from './ElementaryMonthlyReportDocument';
import { generateElementaryMonthlyPdfBlob, normalizeElementaryMonthlyFilename } from '../../../../lib/elementaryMonthlyReportPdf';
import type { 
  ElementaryMonthlyReportSnapshot,
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

interface MonthlyReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  allStudents: Student[];
  onSelectStudent: (st: Student) => void;
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
  publishedReport: PublishedElementaryMonthlyReportDoc | null;
}

export const MonthlyReportPreviewModal: React.FC<MonthlyReportPreviewModalProps> = ({
  isOpen,
  onClose,
  student,
  allStudents,
  onSelectStudent,
  classInfo,
  academicYear,
  semester,
  month,
  monthLabel,
  curriculumDoc,
  studentScoresMap,
  narrativeDoc,
  projectDoc,
  photoDoc,
  attendanceSummary,
  signatory,
  publishedReport
}) => {
  const [isReadyForPdf, setIsReadyForPdf] = React.useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState<boolean>(false);

  if (!isOpen || !student) return null;

  const currentIndex = allStudents.findIndex(s => s.id === student.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allStudents.length - 1;

  const isPublished = !!publishedReport && publishedReport.status === 'PUBLISHED';

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    const toastId = toast.loading('Sedang merender PDF Monthly Report...');

    try {
      // Find the two page elements
      const page1 = document.getElementById('elem-monthly-pdf-page-1');
      const page2 = document.getElementById('elem-monthly-pdf-page-2');

      if (!page1 || !page2) {
        throw new Error('Halaman laporan tidak ditemukan pada renderer.');
      }

      const pdfBlob = await generateElementaryMonthlyPdfBlob([page1, page2]);
      const filename = normalizeElementaryMonthlyFilename(student.name, monthLabel, academicYear);

      // Trigger browser download
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`PDF berhasil diunduh: ${filename}`, { id: toastId });
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast.error(err.message || 'Gagal membuat file PDF.', { id: toastId });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/75 backdrop-blur-xs">
      <div className="bg-slate-100 rounded-3xl max-w-5xl w-full h-[95vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden">
        {/* Top Floating Control Bar */}
        <div className="bg-white px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-slate-900 tracking-tight">
                  {student.name}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {classInfo?.name || 'Elementary'} ({monthLabel})
                </span>
                {isPublished ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Terbit v{publishedReport.version}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    Draft Internal (Belum Terbit)
                  </span>
                )}
              </div>
            </div>

            {/* Prev / Next Navigation */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
              <button
                type="button"
                onClick={() => hasPrev && onSelectStudent(allStudents[currentIndex - 1])}
                disabled={!hasPrev}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                title="Siswa Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[11px] font-bold text-slate-500 px-1">
                {currentIndex + 1} / {allStudents.length}
              </span>
              <button
                type="button"
                onClick={() => hasNext && onSelectStudent(allStudents[currentIndex + 1])}
                disabled={!hasNext}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                title="Siswa Berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} />
              <span>Cetak</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center">
          <ElementaryMonthlyReportDocument
            snapshot={publishedReport?.reportSnapshot || null}
            previewData={{
              student,
              classInfo,
              academicYear,
              semester,
              month,
              monthLabel,
              curriculumDoc,
              scoresMap: studentScoresMap,
              narrativeDoc,
              projectDoc,
              photoDoc,
              attendanceSummary,
              signatory
            }}
            isDraft={!isPublished}
            onReadyChange={setIsReadyForPdf}
          />
        </div>
      </div>
    </div>
  );
};
