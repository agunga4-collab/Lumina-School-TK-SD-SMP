import * as React from 'react';
import { 
  X, Download, ChevronLeft, ChevronRight, FileText, 
  BarChart2, Printer, CheckCircle2, AlertTriangle, Eye 
} from 'lucide-react';
import type { 
  ElementaryUpperCurriculumDoc,
  ElementaryUpperStudentDataDoc,
  ElementaryUpperStudentNarrativesDoc,
  ElementaryUpperLitNumRecordDoc,
  ElementaryUpperLitNumClassConfigDoc,
  ElementaryUpperAttendanceConfig,
  ElementaryUpperReportSignatory,
  ElementaryUpperReportKind,
  PublishedElementaryUpperReportDoc
} from '../../../../types/elementaryMonthlyUpperReport';
import { calculateUpperStudentAttendanceSummary, normalizeUpperReportFilename } from '../../../../types/elementaryMonthlyUpperReport';
import { generateUpperMonthlyProgressPdfBlob, generateUpperLiteracyNumeracyPdfBlob } from '../../../../lib/elementaryMonthlyUpperReportPdf';
import { UpperMonthlyProgressDocument } from './UpperMonthlyProgressDocument';
import { UpperLiteracyNumeracyDocument } from './UpperLiteracyNumeracyDocument';
import type { Student, Class, User } from '../../../../types';
import { toast } from 'sonner';

interface UpperMonthlyReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudentId?: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  curriculumDoc: ElementaryUpperCurriculumDoc | null;
  studentDataMap: Record<string, ElementaryUpperStudentDataDoc>;
  narrativesMap: Record<string, ElementaryUpperStudentNarrativesDoc>;
  litNumRecordsMap: Record<string, ElementaryUpperLitNumRecordDoc>;
  classConfigDoc: ElementaryUpperLitNumClassConfigDoc | null;
  attendanceConfig: ElementaryUpperAttendanceConfig | null;
  signatory: ElementaryUpperReportSignatory;
  publishedReportsMap?: Record<string, PublishedElementaryUpperReportDoc>;
  initialReportKind?: ElementaryUpperReportKind;
}

export const UpperMonthlyReportPreviewModal: React.FC<UpperMonthlyReportPreviewModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudentId,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  curriculumDoc,
  studentDataMap,
  narrativesMap,
  litNumRecordsMap,
  classConfigDoc,
  attendanceConfig,
  signatory,
  publishedReportsMap = {},
  initialReportKind = 'MONTHLY_PROGRESS'
}) => {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(
    initialStudentId || students[0]?.id || ''
  );
  const [activeReportKind, setActiveReportKind] = React.useState<ElementaryUpperReportKind>(
    initialReportKind
  );
  const [isExporting, setIsExporting] = React.useState<boolean>(false);

  // Sync if initial props change
  React.useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  React.useEffect(() => {
    if (initialReportKind) {
      setActiveReportKind(initialReportKind);
    }
  }, [initialReportKind]);

  const currentIndex = React.useMemo(() => {
    return students.findIndex(s => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  const currentStudent = students[currentIndex] || students[0];

  const handlePrevStudent = () => {
    if (currentIndex > 0) {
      setSelectedStudentId(students[currentIndex - 1].id);
    }
  };

  const handleNextStudent = () => {
    if (currentIndex < students.length - 1) {
      setSelectedStudentId(students[currentIndex + 1].id);
    }
  };

  // Data for current student
  const studentDataDoc = currentStudent ? studentDataMap[currentStudent.id] || null : null;
  const narrativesDoc = currentStudent ? narrativesMap[currentStudent.id] || null : null;
  const litNumRecordDoc = currentStudent ? litNumRecordsMap[currentStudent.id] || null : null;
  const attendanceSummary = currentStudent
    ? calculateUpperStudentAttendanceSummary(attendanceConfig, currentStudent.id)
    : {
        startDate: '',
        endDate: '',
        presentDays: 0,
        totalDays: 0,
        percentage: 0,
        basisDescription: 'Belum dikonfigurasi',
        isAvailable: false
      };

  // Check if published snapshot exists
  const publishedDocKey = `${currentStudent?.id}_${activeReportKind}`;
  const publishedDoc = publishedReportsMap[publishedDocKey];

  const handleDownloadPdf = async () => {
    if (!currentStudent) return;
    setIsExporting(true);
    const toastId = toast.loading('Menyiapkan file PDF laporan...');

    try {
      if (activeReportKind === 'MONTHLY_PROGRESS') {
        const pages = document.querySelectorAll<HTMLElement>('.elem-monthly-upper-page');
        if (!pages || pages.length === 0) {
          throw new Error('Elemen halaman Monthly Progress tidak ditemukan.');
        }
        const blob = await generateUpperMonthlyProgressPdfBlob(Array.from(pages));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = normalizeUpperReportFilename(currentStudent.name, 'MONTHLY_PROGRESS', monthLabel, selectedYear);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('PDF Monthly Progress berhasil diunduh.', { id: toastId });
      } else {
        const page = document.querySelector<HTMLElement>('.elem-monthly-upper-page');
        if (!page) {
          throw new Error('Elemen halaman Literasi & Numerasi tidak ditemukan.');
        }
        const blob = await generateUpperLiteracyNumeracyPdfBlob(page);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = normalizeUpperReportFilename(currentStudent.name, 'LITERACY_NUMERACY', monthLabel, selectedYear);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('PDF Literasi & Numerasi berhasil diunduh.', { id: toastId });
      }
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast.error(err.message || 'Gagal membuat file PDF.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen || !currentStudent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-3 sm:p-5 overflow-hidden">
      <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 w-full max-w-6xl h-full max-h-[96vh] flex flex-col overflow-hidden">
        {/* Top Control Bar */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0 shadow">
          {/* Left: Document Tabs & Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveReportKind('MONTHLY_PROGRESS')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeReportKind === 'MONTHLY_PROGRESS'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileText size={14} />
                <span>Monthly Progress (2 Hal)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReportKind('LITERACY_NUMERACY')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeReportKind === 'LITERACY_NUMERACY'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <BarChart2 size={14} />
                <span>Literasi &amp; Numerasi (1 Hal)</span>
              </button>
            </div>
          </div>

          {/* Center: Student Navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevStudent}
              disabled={currentIndex <= 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-200"
              title="Siswa Sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>

            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-xs"
            >
              {students.map((st, idx) => (
                <option key={st.id} value={st.id}>
                  {idx + 1}. {st.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNextStudent}
              disabled={currentIndex >= students.length - 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-200"
              title="Siswa Berikutnya"
            >
              <ChevronRight size={16} />
            </button>
            <span className="text-[11px] text-slate-400 font-semibold ml-1">
              ({currentIndex + 1} / {students.length})
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={15} />
              <span>{isExporting ? 'Memproses...' : 'Unduh PDF'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Document Container Preview Area */}
        <div className="flex-1 overflow-y-auto bg-slate-200/80 p-6 flex justify-center">
          {activeReportKind === 'MONTHLY_PROGRESS' ? (
            <UpperMonthlyProgressDocument
              snapshot={publishedDoc?.monthlyProgressSnapshot || null}
              previewData={{
                student: currentStudent,
                classInfo: selectedClass,
                academicYear: selectedYear,
                semester: selectedSemester,
                month: selectedMonth,
                monthLabel,
                curriculumDoc,
                studentDataDoc,
                narrativesDoc,
                attendanceSummary,
                signatory
              }}
              isDraft={!publishedDoc}
            />
          ) : (
            <UpperLiteracyNumeracyDocument
              snapshot={publishedDoc?.litNumSnapshot || null}
              previewData={{
                student: currentStudent,
                classInfo: selectedClass,
                academicYear: selectedYear,
                semester: selectedSemester,
                month: selectedMonth,
                monthLabel,
                classConfigDoc,
                recordDoc: litNumRecordDoc,
                narrativesDoc,
                signatory
              }}
              isDraft={!publishedDoc}
            />
          )}
        </div>
      </div>
    </div>
  );
};
