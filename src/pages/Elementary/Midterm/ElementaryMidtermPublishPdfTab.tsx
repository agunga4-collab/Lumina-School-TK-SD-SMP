import * as React from 'react';
import { 
  FileCheck2, Eye, Download, Send, CheckCircle2, 
  AlertCircle, RefreshCw, User, Sparkles
} from 'lucide-react';
import { ElementaryMidtermPdfTemplate } from './ElementaryMidtermPdfTemplate';
import { 
  publishElementaryMidtermReport 
} from '../../../services/elementaryMidtermService';
import type { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc,
  PublishedElementaryMidtermReport,
  ElementaryMidtermReportSnapshot
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, ReportConfig, User as UserType } from '../../../types';

interface ElementaryMidtermPublishPdfTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  masterGoalsMap: Record<string, ElementaryMidtermMasterGoalDoc>;
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  publishedReports: PublishedElementaryMidtermReport[];
  reportConfig: ReportConfig | null;
  homeroomTeacherProfile: { displayName: string; niy?: string; signatureUrl?: string | null } | null;
  onRefreshData: () => Promise<void>;
  currentUser: UserType | null;
}

export const ElementaryMidtermPublishPdfTab: React.FC<ElementaryMidtermPublishPdfTabProps> = ({
  selectedClassId,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  students,
  masterGoalsMap,
  studentDataMap,
  publishedReports,
  reportConfig,
  homeroomTeacherProfile,
  onRefreshData,
  currentUser
}) => {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(students[0]?.id || '');
  const [isPublishing, setIsPublishing] = React.useState<boolean>(false);
  const [publishedSuccess, setPublishedSuccess] = React.useState<boolean>(false);

  const activeStudent = students.find(s => s.id === selectedStudentId) || students[0] || null;
  const currentStudentData = activeStudent ? studentDataMap[activeStudent.id] : null;

  // Check if report is already published for this student
  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedElementaryMidtermReport> = {};
    (publishedReports || []).forEach(rep => {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || (rep.version || 0) > (map[rep.studentId].version || 0)) {
          map[rep.studentId] = rep;
        }
      }
    });
    return map;
  }, [publishedReports]);

  const activePublishedReport = activeStudent ? publishedMap[activeStudent.id] : null;

  const handlePublishReport = async () => {
    if (!activeStudent || !selectedClass) return;
    setIsPublishing(true);
    setPublishedSuccess(false);

    try {
      // Build snapshot
      const categoriesSnapshot: Array<{ name: string; subjects: Array<{ name: string; goals: Array<{ id: string; text: string; remark: string }> }> }> = [];

      const subjectsList: Array<{ name: string; goals: Array<{ id: string; text: string; remark: string }> }> = [];

      Object.keys(masterGoalsMap || {}).forEach(subjKey => {
        const doc = masterGoalsMap[subjKey];
        if (doc && Array.isArray(doc.goals) && doc.goals.length > 0) {
          const goalsList = doc.goals.map(g => ({
            id: g.id,
            text: g.text,
            remark: currentStudentData?.remarks?.[g.id] || '-'
          }));
          subjectsList.push({ name: subjKey, goals: goalsList });
        }
      });

      categoriesSnapshot.push({ name: 'SUBJECTS', subjects: subjectsList });

      // Approved General Comment ONLY
      const approvedGenCom = currentStudentData?.generalCommentReviewStatus === 'APPROVED' || currentStudentData?.generalComment?.isFinal
        ? (currentStudentData?.generalComment?.finalComment || currentStudentData?.generalComment?.aiDraft || '')
        : '';

      const snapshot: ElementaryMidtermReportSnapshot = {
        student: {
          id: activeStudent.id,
          name: activeStudent.name,
          nisn: activeStudent.nisn || (activeStudent as any)?.nis || '-',
          className: selectedClass.name,
          grade: selectedClass.grade || ''
        },
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermTerm: selectedTerm,
        categories: categoriesSnapshot,
        generalComment: approvedGenCom,
        attendance: currentStudentData?.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 },
        signatory: {
          principalName: reportConfig?.principalName || 'Principal',
          principalNiy: reportConfig?.principalNIY || '',
          principalSignatureUrl: reportConfig?.principalSignatureUrl || null,
          homeroomTeacherName: selectedClass.homeroomTeacherName || homeroomTeacherProfile?.displayName || 'Homeroom Teacher',
          homeroomTeacherNiy: homeroomTeacherProfile?.niy || '',
          homeroomTeacherSignatureUrl: homeroomTeacherProfile?.signatureUrl || null
        }
      };

      await publishElementaryMidtermReport({
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        nisn: activeStudent.nisn || '-',
        classId: selectedClassId,
        className: selectedClass.name,
        grade: selectedClass.grade || '',
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermTerm: selectedTerm,
        reportSnapshot: snapshot,
        user: currentUser
      });

      setPublishedSuccess(true);
      await onRefreshData();
      setTimeout(() => setPublishedSuccess(false), 3000);
    } catch (e) {
      console.error("Error publishing report:", e);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Student Roster List */}
      <div className="lg:col-span-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <User size={16} className="text-emerald-600" />
            <span>Pilih Siswa ({students.length})</span>
          </h3>
        </div>

        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          {students.map((st, idx) => {
            const isSelected = st.id === selectedStudentId;
            const isPub = Boolean(publishedMap[st.id]);

            return (
              <button
                key={st.id}
                onClick={() => setSelectedStudentId(st.id)}
                className={`w-full p-3 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-xl font-extrabold flex items-center justify-center text-[10px] ${
                    isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {idx + 1}
                  </span>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {st.name}
                    </p>
                    <span className={`text-[10px] font-bold ${
                      isPub ? 'text-emerald-400' : 'text-slate-400'
                    }`}>
                      {isPub ? '✓ Published' : 'Draf Preview'}
                    </span>
                  </div>
                </div>

                {isPub && <CheckCircle2 size={16} className="text-emerald-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live PDF Preview & Publish Action Panel */}
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <FileCheck2 size={18} className="text-emerald-600" />
              <span>Preview & Publish PDF: {activeStudent?.name || ''}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Pastikan seluruh data nilai dan GenCom sudah benar sebelum melakukan publish.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrintPdf}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all"
            >
              <Download size={14} />
              <span>Cetak PDF</span>
            </button>

            <button
              onClick={handlePublishReport}
              disabled={isPublishing || !activeStudent}
              className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-sm"
            >
              {isPublishing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              <span>Publish PDF Report</span>
            </button>
          </div>
        </div>

        {publishedSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={18} />
            PDF Midterm Report berhasil dipublikasikan!
          </div>
        )}

        {/* Printable Template Component Preview */}
        {activeStudent && (
          <div className="overflow-x-auto pb-6">
            <ElementaryMidtermPdfTemplate
              student={activeStudent}
              currentClass={selectedClass}
              academicYear={selectedYear}
              semester={selectedSemester}
              midtermTerm={selectedTerm}
              masterGoalsMap={masterGoalsMap}
              studentDataDoc={currentStudentData || undefined}
              reportConfig={reportConfig}
              homeroomTeacherProfile={homeroomTeacherProfile || undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
};
