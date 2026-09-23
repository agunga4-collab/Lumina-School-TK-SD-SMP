import * as React from 'react';
import { 
  FileCheck2, Eye, Download, Send, CheckCircle2, 
  AlertCircle, RefreshCw, User, Sparkles, X, Printer,
  Check, Clock, FileText, AlertTriangle
} from 'lucide-react';
import { ElementaryMidtermPdfTemplate } from './ElementaryMidtermPdfTemplate';
import { 
  publishElementaryMidtermReport,
  fetchElementaryStudentUnitActivityEnrollment
} from '../../../services/elementaryMidtermService';
import type { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc,
  PublishedElementaryMidtermReport,
  ElementaryMidtermReportSnapshot
} from '../../../types/elementaryMidtermReport';
import { normalizeElementarySubjectName } from '../../../types/elementaryMidtermReport';
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
  logoUrl?: string | null;
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
  logoUrl,
  homeroomTeacherProfile,
  onRefreshData,
  currentUser
}) => {
  // Modal Preview state
  const [previewStudent, setPreviewStudent] = React.useState<Student | null>(null);

  // Publishing State
  const [publishingStudentId, setPublishingStudentId] = React.useState<string | null>(null);
  const [publishMessage, setPublishMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Student Unit Activity Map: studentId -> UA Name (e.g. "Choir")
  const [studentUaMap, setStudentUaMap] = React.useState<Record<string, string>>({});

  // Fetch UA enrollments for students
  React.useEffect(() => {
    const loadUaEnrollments = async () => {
      if (!students || students.length === 0) return;
      const map: Record<string, string> = {};
      await Promise.all(
        students.map(async (st) => {
          if (!st.id) return;
          try {
            const enr = await fetchElementaryStudentUnitActivityEnrollment(st.id, selectedYear, selectedSemester);
            if (enr) {
              map[st.id] = enr.normalizedUaName || enr.sourceUaName || '';
            }
          } catch (e) {
            console.warn("Could not fetch UA for student:", st.id, e);
          }
        })
      );
      setStudentUaMap(map);
    };
    loadUaEnrollments();
  }, [students, selectedYear, selectedSemester]);

  // Calculate Published Map: studentId -> Latest Published Report
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

  // Calculate Master Goals stats across valid official subjects
  const allMasterGoalsList = React.useMemo(() => {
    const list: Array<{ id: string; subjectKey: string }> = [];
    Object.keys(masterGoalsMap || {}).forEach(key => {
      const doc = masterGoalsMap[key];
      const norm = normalizeElementarySubjectName(doc?.subjectKey || key);
      if (norm && doc && Array.isArray(doc.goals)) {
        doc.goals.forEach(g => {
          list.push({ id: g.id, subjectKey: norm });
        });
      }
    });
    return list;
  }, [masterGoalsMap]);

  // Publish Individual Report Function
  const handlePublishStudentReport = async (student: Student) => {
    if (!student || !selectedClass) return;
    setPublishingStudentId(student.id);
    setPublishMessage(null);

    try {
      const studentDataDoc = studentDataMap[student.id];

      // Build Snapshot Categories
      const subjectsList: Array<{ name: string; goals: Array<{ id: string; text: string; remark: string }> }> = [];

      Object.keys(masterGoalsMap || {}).forEach(subjKey => {
        const doc = masterGoalsMap[subjKey];
        const norm = normalizeElementarySubjectName(doc?.subjectKey || subjKey);
        if (norm && doc && Array.isArray(doc.goals) && doc.goals.length > 0) {
          const goalsList = doc.goals.map(g => ({
            id: g.id,
            text: g.text,
            remark: studentDataDoc?.remarks?.[g.id] || '-'
          }));
          
          let displayName = norm;
          if (norm === 'Performing Arts' && studentUaMap[student.id]) {
            displayName = `Performing Arts (${studentUaMap[student.id]})`;
          }

          subjectsList.push({ name: displayName, goals: goalsList });
        }
      });

      const categoriesSnapshot = [
        { name: 'SUBJECTS', subjects: subjectsList.filter(s => !s.name.includes('Projects')) },
        { name: 'PROJECTS', subjects: subjectsList.filter(s => s.name.includes('Projects')) }
      ];

      // Approved General Comment
      const approvedGenCom = studentDataDoc?.generalCommentReviewStatus === 'APPROVED' || studentDataDoc?.generalComment?.isFinal
        ? (studentDataDoc?.generalComment?.finalComment || studentDataDoc?.generalComment?.aiDraft || '')
        : '';

      const snapshot: ElementaryMidtermReportSnapshot = {
        student: {
          id: student.id,
          name: student.name,
          nisn: student.nisn || (student as any)?.nis || '-',
          className: selectedClass.name,
          grade: selectedClass.grade || ''
        },
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermTerm: selectedTerm,
        categories: categoriesSnapshot,
        generalComment: approvedGenCom,
        attendance: studentDataDoc?.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 },
        signatory: {
          principalName: reportConfig?.principalName || 'Principal',
          principalTitle: reportConfig?.principalTitle || 'Principal',
          principalNiy: reportConfig?.principalNIY || '',
          principalSignatureUrl: reportConfig?.principalSignatureUrl || null,
          homeroomTeacherName: selectedClass.homeroomTeacherName || homeroomTeacherProfile?.displayName || 'Homeroom Teacher',
          homeroomTeacherNiy: homeroomTeacherProfile?.niy || '',
          homeroomTeacherSignatureUrl: homeroomTeacherProfile?.signatureUrl || (selectedClass as any)?.teacherSignatureUrl || null
        },
        logoUrl: logoUrl || null
      };

      await publishElementaryMidtermReport({
        studentId: student.id,
        studentName: student.name,
        nisn: student.nisn || (student as any)?.nis || '-',
        classId: selectedClassId,
        className: selectedClass.name,
        grade: selectedClass.grade || '',
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermTerm: selectedTerm,
        reportSnapshot: snapshot,
        user: currentUser
      });

      setPublishMessage({
        type: 'success',
        text: `Rapor Midterm ${student.name} berhasil dipublikasikan!`
      });

      await onRefreshData();
      setTimeout(() => setPublishMessage(null), 4000);
    } catch (e) {
      console.error("Error publishing report:", e);
      setPublishMessage({
        type: 'error',
        text: `Gagal mempublikasikan rapor ${student.name}. Coba lagi.`
      });
    } finally {
      setPublishingStudentId(null);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* HEADER & SUMMARY STATS BAR */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <FileCheck2 size={20} className="text-emerald-600" />
            <span>Publish PDF Report — Elementary</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium pt-0.5">
            Cek kelengkapan data siswa, pratinjau format rapor PDF, dan publikasikan rapor Midterm.
          </p>
        </div>

        {/* Global Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <span className="block text-[10px] font-extrabold uppercase text-slate-400">Total Siswa</span>
            <span className="text-sm font-black text-slate-900">{students.length}</span>
          </div>
          <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
            <span className="block text-[10px] font-extrabold uppercase text-emerald-600">Published</span>
            <span className="text-sm font-black text-emerald-800">{Object.keys(publishedMap).length}</span>
          </div>
        </div>
      </div>

      {/* PUBLISH NOTIFICATION MESSAGE */}
      {publishMessage && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in duration-200 ${
          publishMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {publishMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{publishMessage.text}</span>
        </div>
      )}

      {/* STUDENT PUBLISH ROSTER TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-900 text-white font-extrabold uppercase text-xs tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={16} className="text-emerald-400" />
            <span>Daftar Siswa & Status Rapor ({students.length})</span>
          </div>
          <span className="text-[10.5px] font-medium text-slate-400">
            Preview tersedia kapan saja untuk guru mengecek rapor
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10.5px] tracking-wider border-b border-slate-200">
                <th className="p-3.5 text-center w-12 border-r border-slate-200">No</th>
                <th className="p-3.5 border-r border-slate-200 min-w-[180px]">Nama Siswa</th>
                <th className="p-3.5 border-r border-slate-200 w-32">NISN</th>
                <th className="p-3.5 border-r border-slate-200 w-40 text-center">Learning Goals</th>
                <th className="p-3.5 border-r border-slate-200 w-40 text-center">General Comments</th>
                <th className="p-3.5 border-r border-slate-200 w-36 text-center">Status Rapor</th>
                <th className="p-3.5 text-center w-48">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {students.map((st, idx) => {
                const stData = studentDataMap[st.id];
                const publishedRep = publishedMap[st.id];
                const isPub = Boolean(publishedRep);

                // Calculate goals count
                const totalGoals = allMasterGoalsList.length;
                let filledGoalsCount = 0;
                if (stData?.remarks && totalGoals > 0) {
                  allMasterGoalsList.forEach(g => {
                    if (stData.remarks[g.id]) filledGoalsCount++;
                  });
                }
                const isGoalsComplete = totalGoals === 0 || filledGoalsCount >= totalGoals;

                // General Comments Review Status
                const genComReviewStatus = stData?.generalCommentReviewStatus || (stData?.generalComment?.isFinal ? 'APPROVED' : 'DRAFT');
                const isGenComApproved = genComReviewStatus === 'APPROVED' || Boolean(stData?.generalComment?.isFinal);

                // Can publish check
                const canPublish = isGenComApproved && isGoalsComplete;
                const isPublishingThis = publishingStudentId === st.id;

                return (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-center font-bold text-slate-400 border-r border-slate-100">
                      {idx + 1}
                    </td>

                    <td className="p-3.5 border-r border-slate-100">
                      <div className="font-extrabold text-slate-900">{st.name}</div>
                      {studentUaMap[st.id] && (
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-purple-50 text-purple-700 font-bold text-[9.5px] rounded-md border border-purple-100">
                          UA: {studentUaMap[st.id]}
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 border-r border-slate-100 font-semibold text-slate-600 font-mono text-[11px]">
                      {st.nisn || (st as any)?.nis || '-'}
                    </td>

                    {/* Learning Goals Column */}
                    <td className="p-3.5 border-r border-slate-100 text-center">
                      {totalGoals === 0 ? (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-bold text-[10.5px] rounded-full">
                          Belum set goals
                        </span>
                      ) : isGoalsComplete ? (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-[10.5px] rounded-full inline-flex items-center gap-1">
                          <Check size={12} /> Lengkap ({filledGoalsCount}/{totalGoals})
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10.5px] rounded-full inline-flex items-center gap-1">
                          <Clock size={12} /> ({filledGoalsCount}/{totalGoals})
                        </span>
                      )}
                    </td>

                    {/* General Comments Column */}
                    <td className="p-3.5 border-r border-slate-100 text-center">
                      {isGenComApproved ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 font-black text-[10.5px] rounded-full inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> Approved
                        </span>
                      ) : genComReviewStatus === 'SUBMITTED_FOR_REVIEW' ? (
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 font-bold text-[10.5px] rounded-full">
                          Menunggu Review
                        </span>
                      ) : genComReviewStatus === 'REVISION_REQUESTED' ? (
                        <span className="px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 font-bold text-[10.5px] rounded-full">
                          Perlu Revisi
                        </span>
                      ) : (stData?.generalComment?.finalComment || stData?.generalComment?.aiDraft) ? (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10.5px] rounded-full">
                          Draft
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-400 font-medium text-[10.5px] rounded-full">
                          Belum Ada
                        </span>
                      )}
                    </td>

                    {/* Status Rapor Column */}
                    <td className="p-3.5 border-r border-slate-100 text-center">
                      {isPub ? (
                        <div className="space-y-0.5">
                          <span className="px-2.5 py-1 bg-emerald-800 text-white font-extrabold text-[10px] rounded-full inline-flex items-center gap-1 shadow-2xs uppercase tracking-wider">
                            <CheckCircle2 size={11} /> Published (v{publishedRep.version || 1})
                          </span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-bold text-[10.5px] rounded-full">
                          Belum Published
                        </span>
                      )}
                    </td>

                    {/* Action Column */}
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Preview Button (ALWAYS AVAILABLE) */}
                        <button
                          onClick={() => setPreviewStudent(st)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                          title="Lihat Pratinjau Rapor Midterm Elementary"
                        >
                          <Eye size={13} />
                          <span>Preview</span>
                        </button>

                        {/* Publish Button (ACTIVE ONLY IF APPROVED & COMPLETE) */}
                        <button
                          onClick={() => handlePublishStudentReport(st)}
                          disabled={!canPublish || isPublishingThis}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-all ${
                            canPublish
                              ? 'bg-emerald-800 hover:bg-emerald-900 text-white shadow-2xs cursor-pointer'
                              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                          }`}
                          title={
                            !canPublish 
                              ? !isGenComApproved 
                                ? 'General comment belum diapprove' 
                                : 'Learning goals belum lengkap'
                              : 'Publikasikan PDF Rapor Siswa'
                          }
                        >
                          {isPublishingThis ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>{isPub ? 'Re-Publish' : 'Publish'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PREVIEW RAPOR MIDTERM ELEMENTARY */}
      {previewStudent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto">
          <div className="bg-slate-900 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header Bar */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-base border border-emerald-500/30">
                  <Eye size={20} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                    Preview Rapor Midterm Elementary
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {previewStudent.name} • Kelas {selectedClass?.name || ''} • NISN: {previewStudent.nisn || (previewStudent as any)?.nis || '-'}
                  </p>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handlePrintPdf}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all border border-slate-700"
                >
                  <Printer size={14} />
                  <span>Cetak / PDF</span>
                </button>

                <button
                  onClick={async () => {
                    await handlePublishStudentReport(previewStudent);
                  }}
                  disabled={
                    publishingStudentId === previewStudent.id ||
                    !(
                      (studentDataMap[previewStudent.id]?.generalCommentReviewStatus === 'APPROVED' || Boolean(studentDataMap[previewStudent.id]?.generalComment?.isFinal))
                    )
                  }
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-sm"
                >
                  {publishingStudentId === previewStudent.id ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  <span>Publish Rapor</span>
                </button>

                <button
                  onClick={() => setPreviewStudent(null)}
                  className="p-2 bg-slate-800 hover:bg-red-900/80 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer ml-1"
                  title="Tutup Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body: Render PDF Template */}
            <div className="p-6 overflow-y-auto bg-slate-200 flex-1 flex flex-col items-center">
              <ElementaryMidtermPdfTemplate
                snapshot={publishedMap[previewStudent.id]?.reportSnapshot}
                student={previewStudent}
                currentClass={selectedClass}
                academicYear={selectedYear}
                semester={selectedSemester}
                midtermTerm={selectedTerm}
                masterGoalsMap={masterGoalsMap}
                studentDataDoc={studentDataMap[previewStudent.id]}
                reportConfig={reportConfig}
                logoUrl={logoUrl}
                homeroomTeacherProfile={homeroomTeacherProfile || undefined}
                studentUaName={studentUaMap[previewStudent.id]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
