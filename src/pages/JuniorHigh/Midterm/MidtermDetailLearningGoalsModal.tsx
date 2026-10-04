import * as React from 'react';
import { 
  BookOpen, X, CheckCircle2, AlertCircle, Clock, 
  AlertTriangle, Info, Check, ChevronRight
} from 'lucide-react';
import { 
  JH_MIDTERM_CATEGORIES, 
  type MidtermMasterGoalDoc, 
  type MidtermStudentDataDoc 
} from '../../../types/midtermReport';
import type { Student, Class } from '../../../types';

export interface JhSubjectProgress {
  subjectKey: string;
  displayName: string;
  categoryName: string;
  categoryId: string;
  totalCount: number;
  filledCount: number;
  goals: Array<{
    id: string;
    text: string;
    order: number;
    remark: string;
    isFilled: boolean;
  }>;
}

export interface JhCategoryProgress {
  id: string;
  name: string;
  subjects: JhSubjectProgress[];
  totalGoalsCount: number;
  filledGoalsCount: number;
}

export interface JhStudentGoalsProgress {
  totalGoalsCount: number;
  filledGoalsCount: number;
  isComplete: boolean;
  categories: JhCategoryProgress[];
  applicableSubjects: JhSubjectProgress[];
  unfilledGoalsList: Array<{
    subjectName: string;
    goalId: string;
    goalText: string;
    categoryName: string;
  }>;
}

/**
 * Calculates Learning Goals progress for a Junior High student.
 * Uses the exact same completeness logic as evaluateStudentMidtermStatus:
 * - Iterates over JH_MIDTERM_CATEGORIES
 * - Skips disabled subjects
 * - Subjects with 0 goals are skipped from completeness counts
 * - Checks remarks[goalId] (and spiritualHealthRemark fallback for Spiritual Health)
 */
export function calculateJhStudentGoalsProgress(
  student: Student | null | undefined,
  masterGoalsMap: Record<string, MidtermMasterGoalDoc> | null | undefined,
  studentDataDoc: MidtermStudentDataDoc | undefined | null,
  disabledSubjects: string[] = []
): JhStudentGoalsProgress {
  if (!student) {
    return {
      totalGoalsCount: 0,
      filledGoalsCount: 0,
      isComplete: false,
      categories: [],
      applicableSubjects: [],
      unfilledGoalsList: [],
    };
  }

  const safeMasterGoals = masterGoalsMap && typeof masterGoalsMap === 'object' ? masterGoalsMap : {};
  const remarks = (studentDataDoc?.remarks && typeof studentDataDoc.remarks === 'object') ? studentDataDoc.remarks : {};
  const spiritualRemark = studentDataDoc?.spiritualHealthRemark;

  let totalGoalsCount = 0;
  let filledGoalsCount = 0;
  const unfilledGoalsList: Array<{
    subjectName: string;
    goalId: string;
    goalText: string;
    categoryName: string;
  }> = [];

  const applicableSubjects: JhSubjectProgress[] = [];
  const categories: JhCategoryProgress[] = [];

  const catList = Array.isArray(JH_MIDTERM_CATEGORIES) ? JH_MIDTERM_CATEGORIES : [];

  for (const cat of catList) {
    let catTotal = 0;
    let catFilled = 0;
    const catSubjects: JhSubjectProgress[] = [];

    const subjects = Array.isArray(cat?.subjects) ? cat.subjects : [];
    for (const subj of subjects) {
      if (!subj) continue;
      if (Array.isArray(disabledSubjects) && disabledSubjects.includes(subj)) {
        continue; // Skip disabled/hidden subjects
      }

      const masterGoal = safeMasterGoals[subj];
      const rawGoals = Array.isArray(masterGoal?.goals) ? masterGoal.goals : [];

      const subjectGoals: Array<{
        id: string;
        text: string;
        order: number;
        remark: string;
        isFilled: boolean;
      }> = [];

      let subjFilled = 0;

      for (const g of rawGoals) {
        if (!g) continue;
        const rawRem = remarks[g.id];
        let rem = typeof rawRem === 'string' ? rawRem.trim() : '';

        // Fallback for Spiritual Health if specific goal remark is empty
        if ((!rem || rem.length === 0) && subj === 'Spiritual Health' && spiritualRemark && spiritualRemark.trim().length > 0) {
          rem = spiritualRemark.trim();
        }

        const isFilled = rem.length > 0;
        if (isFilled) {
          subjFilled++;
        } else {
          unfilledGoalsList.push({
            subjectName: subj,
            goalId: g.id,
            goalText: typeof g.text === 'string' ? g.text : '',
            categoryName: cat.name,
          });
        }

        subjectGoals.push({
          id: g.id,
          text: typeof g.text === 'string' ? g.text : '',
          order: g.order ?? 0,
          remark: rem,
          isFilled,
        });
      }

      const subjTotal = subjectGoals.length;

      // Only count towards system total if subject has goals
      if (subjTotal > 0) {
        catTotal += subjTotal;
        catFilled += subjFilled;
        totalGoalsCount += subjTotal;
        filledGoalsCount += subjFilled;
      }

      const subjProgress: JhSubjectProgress = {
        subjectKey: subj,
        displayName: subj,
        categoryName: cat.name,
        categoryId: cat.id,
        totalCount: subjTotal,
        filledCount: subjFilled,
        goals: subjectGoals,
      };

      catSubjects.push(subjProgress);
      applicableSubjects.push(subjProgress);
    }

    categories.push({
      id: cat.id,
      name: cat.name,
      subjects: catSubjects,
      totalGoalsCount: catTotal,
      filledGoalsCount: catFilled,
    });
  }

  const isComplete = totalGoalsCount > 0 && filledGoalsCount === totalGoalsCount;

  return {
    totalGoalsCount,
    filledGoalsCount,
    isComplete,
    categories,
    applicableSubjects,
    unfilledGoalsList,
  };
}

interface MidtermDetailLearningGoalsModalProps {
  student: Student;
  selectedClass: Class | null;
  academicYear: string;
  semester: string;
  midtermTerm: string;
  masterGoalsMap: Record<string, MidtermMasterGoalDoc>;
  studentDataDoc: MidtermStudentDataDoc | undefined | null;
  disabledSubjects?: string[];
  onClose: () => void;
  onSwitchTab?: (tab: 'GOALS' | 'COMMENTS' | 'REVIEW' | 'PUBLISH' | 'REKAP') => void;
}

export const MidtermDetailLearningGoalsModal: React.FC<MidtermDetailLearningGoalsModalProps> = ({
  student,
  selectedClass,
  academicYear,
  semester,
  midtermTerm,
  masterGoalsMap,
  studentDataDoc,
  disabledSubjects = [],
  onClose,
  onSwitchTab,
}) => {
  // Calculate progress dynamically using current master goals & remarks (draft state)
  const progress = React.useMemo(() => {
    return calculateJhStudentGoalsProgress(
      student,
      masterGoalsMap,
      studentDataDoc,
      disabledSubjects
    );
  }, [student, masterGoalsMap, studentDataDoc, disabledSubjects]);

  // Handle Escape key to close modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOpenLearningGoalsTab = () => {
    onClose();
    if (onSwitchTab) {
      onSwitchTab('GOALS');
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'learning-goals');
      if (selectedClass?.id) {
        url.searchParams.set('classId', selectedClass.id);
      }
      window.history.replaceState(null, '', url.pathname + url.search);
      if (!onSwitchTab) {
        window.location.search = url.searchParams.toString();
      }
    } catch (e) {
      console.warn('URL sync error:', e);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 font-sans text-slate-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Modal Header Bar */}
        <div className="p-5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-base border border-emerald-500/30 shrink-0">
              <BookOpen size={20} />
            </div>
            <div className="min-w-0">
              <h3 id="modal-title" className="text-base font-black text-white uppercase tracking-tight truncate">
                Detail Learning Goals — {student.name}
              </h3>
              <p className="text-xs text-slate-400 font-medium truncate">
                {selectedClass?.name ? `Kelas ${selectedClass.name}` : 'Kelas'} • NISN: {student.nisn || (student as any)?.nis || '-'} • {academicYear} S{semester} (Midterm {midtermTerm})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenLearningGoalsTab}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Buka Tab Learning Goals & Remarks"
            >
              <BookOpen size={14} />
              <span className="hidden sm:inline">Buka Learning Goals & Remarks</span>
              <span className="sm:hidden">Buka Tab 1</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Tutup (Esc)"
              aria-label="Tutup modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">

          {/* Summary Banner */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            progress.isComplete
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center gap-2.5">
              {progress.isComplete ? (
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={22} className="text-amber-600 shrink-0" />
              )}
              <div>
                <span className="text-sm font-black uppercase tracking-tight block">
                  {progress.filledGoalsCount} DARI {progress.totalGoalsCount} LEARNING GOALS TELAH DINILAI
                </span>
                <p className="text-xs font-medium opacity-80 pt-0.5">
                  {progress.isComplete
                    ? 'Semua Learning Goals aktif sudah memiliki nilai A/D/B valid.'
                    : `Masih ada ${progress.unfilledGoalsList.length} Learning Goals yang belum dinilai.`}
                </p>
              </div>
            </div>

            <div className="shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                progress.isComplete
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-600 text-white'
              }`}>
                {progress.isComplete ? '100% LENGKAP' : `${progress.unfilledGoalsList.length} BELUM DIISI`}
              </span>
            </div>
          </div>

          {/* Unfilled Goals Banner List (If Any) */}
          {progress.unfilledGoalsList.length > 0 && (
            <div className="p-4 bg-red-50/70 border border-red-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-red-900 font-extrabold text-xs uppercase tracking-wider">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>Daftar Learning Goals Belum Dinilai ({progress.unfilledGoalsList.length})</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {progress.unfilledGoalsList.map((ug, uIdx) => (
                  <div key={`unfilled-${uIdx}`} className="p-3 bg-white rounded-xl border border-red-100 flex items-start justify-between gap-3 text-xs shadow-2xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-md">
                          {ug.subjectName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          ({ug.categoryName})
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 leading-relaxed pt-1">
                        • {ug.goalText}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-extrabold text-[10px] rounded-full shrink-0 flex items-center gap-1">
                      <Clock size={11} /> Belum dinilai
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grouped By Junior High Categories Detail */}
          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-200 pb-2">
              <BookOpen size={16} className="text-emerald-600" />
              <span>STATUS PENGISIAN PER MATA PELAJARAN</span>
            </h4>

            {progress.categories.map((cat) => {
              // Hide empty category if no subjects configured
              if (!cat.subjects || cat.subjects.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-3">
                  {/* Category Header */}
                  <div className="flex items-center justify-between bg-slate-100/90 px-3.5 py-2 rounded-xl border border-slate-200">
                    <span className="font-black text-slate-800 text-xs tracking-wider uppercase">
                      {cat.name}
                    </span>
                    <span className={`text-[10.5px] font-black px-2 py-0.5 rounded-full ${
                      cat.totalGoalsCount === 0
                        ? 'bg-slate-200 text-slate-600'
                        : cat.filledGoalsCount === cat.totalGoalsCount
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {cat.totalGoalsCount === 0
                        ? 'Tidak ada goals'
                        : `${cat.filledGoalsCount}/${cat.totalGoalsCount} Terisi`}
                    </span>
                  </div>

                  {/* Subjects in this Category */}
                  <div className="space-y-3 pl-1 sm:pl-2">
                    {cat.subjects.map((subj, sIdx) => {
                      const hasGoals = subj.totalCount > 0;
                      const isSubjComplete = hasGoals && subj.filledCount === subj.totalCount;

                      return (
                        <div key={`subj-${cat.id}-${sIdx}`} className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 gap-2">
                            <span className="font-black text-slate-900 text-xs uppercase tracking-tight">
                              {subj.displayName}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold shrink-0 ${
                              !hasGoals
                                ? 'bg-slate-200/70 text-slate-600'
                                : isSubjComplete
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {!hasGoals
                                ? 'Tidak ada learning goals'
                                : `${subj.displayName}: ${subj.filledCount}/${subj.totalCount} Terisi`}
                            </span>
                          </div>

                          {!hasGoals ? (
                            <p className="text-xs text-slate-400 italic py-1">
                              Tidak ada learning goals untuk mata pelajaran ini.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {subj.goals.map((g) => (
                                <div key={g.id} className="p-2.5 bg-white rounded-xl border border-slate-200/60 flex items-center justify-between gap-3 text-xs shadow-2xs">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] mt-0.5 ${
                                      g.isFilled
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {g.isFilled ? '✓' : '!'}
                                    </span>
                                    <span className="font-medium text-slate-800 leading-relaxed">
                                      {g.text}
                                    </span>
                                  </div>

                                  <div className="shrink-0">
                                    {g.isFilled ? (
                                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[10.5px] rounded-lg inline-flex items-center gap-1 shadow-2xs">
                                        <Check size={11} /> Nilai: {g.remark}
                                      </span>
                                    ) : (
                                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10.5px] rounded-lg inline-flex items-center gap-1">
                                        <Clock size={11} /> Belum dinilai
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* LG yang Dihitung Sistem Table */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Info size={15} className="text-blue-600" />
                  <span>LG yang Dihitung Sistem (Total: {progress.totalGoalsCount})</span>
                </h4>
                <p className="text-[11px] text-slate-500 pt-0.5">
                  Rincian jumlah Learning Goals aktif yang relevan untuk konteks kelas, semester, dan mata pelajaran saat ini.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="p-2.5">Mata Pelajaran</th>
                    <th className="p-2.5 text-center">Kategori</th>
                    <th className="p-2.5 text-center">Jumlah Active Goal</th>
                    <th className="p-2.5 text-center">Status Terisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {progress.applicableSubjects.map((s, idx) => (
                    <tr key={`sys-breakdown-${idx}`} className="hover:bg-slate-50/60">
                      <td className="p-2.5 font-bold text-slate-800">{s.displayName}</td>
                      <td className="p-2.5 text-center text-slate-500 text-[10.5px]">{s.categoryName}</td>
                      <td className="p-2.5 text-center font-extrabold text-slate-900">{s.totalCount}</td>
                      <td className="p-2.5 text-center">
                        {s.totalCount === 0 ? (
                          <span className="text-slate-400 text-[10.5px] font-normal italic">Tidak ada goal</span>
                        ) : (
                          <span className={`font-bold text-[10.5px] ${s.filledCount === s.totalCount ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {s.filledCount}/{s.totalCount}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-black uppercase text-xs">
                    <td className="p-2.5" colSpan={2}>Total Learning Goals Sistem</td>
                    <td className="p-2.5 text-center text-emerald-400">{progress.totalGoalsCount}</td>
                    <td className="p-2.5 text-center">
                      <span className={progress.filledGoalsCount === progress.totalGoalsCount && progress.totalGoalsCount > 0 ? 'text-emerald-400' : 'text-amber-300'}>
                        {progress.filledGoalsCount}/{progress.totalGoalsCount} Terisi
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium">
            Modal bersifat baca-saja. Nilai diambil dari draft saat ini.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
