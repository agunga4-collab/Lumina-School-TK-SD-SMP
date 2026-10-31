import * as React from 'react';
import { 
  Settings2, Users, FileSpreadsheet, Copy, Search, Plus, 
  Check, AlertCircle, RefreshCw, ChevronRight, Layers, Sparkles, CheckCircle2,
  BookOpen
} from 'lucide-react';
import type { 
  ElementaryMonthlyCurriculumDoc, 
  ElementaryMonthlySubject, 
  ElementaryMonthlyLearningGoal,
  ElementaryMonthlyLearningObjective,
  ElementaryMonthlyStudentScoreDoc,
  ElementaryMonthlyPredicate
} from '../../../../types/elementaryMonthlyReport';
import { calculateLGAverageAndPredicate } from '../../../../types/elementaryMonthlyReport';
import type { Student, Class, User } from '../../../../types';
import { 
  saveElementaryMonthlySingleScore,
  saveBulkElementaryMonthlyScores,
  importTableElementaryMonthlyScores,
  saveElementaryMonthlyCurriculum
} from '../../../../services/elementaryMonthlyReportService';
import { CurriculumStructureModal } from './CurriculumStructureModal';
import { BulkScoreModal } from './BulkScoreModal';
import { ImportScoreTableModal } from './ImportScoreTableModal';
import { CopyCurriculumModal } from './CopyCurriculumModal';
import { toast } from 'sonner';

interface LearningGoalsScoreGridProps {
  curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
  studentScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  students: Student[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  allElementaryClasses: Class[];
  currentUser: User | null;
  onRefreshData: () => Promise<void>;
}

export const LearningGoalsScoreGrid: React.FC<LearningGoalsScoreGridProps> = ({
  curriculumDoc,
  studentScoresMap,
  students,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  allElementaryClasses,
  currentUser,
  onRefreshData
}) => {
  const subjects = curriculumDoc?.subjects || [];
  const [activeSubjectId, setActiveSubjectId] = React.useState<string>('');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Modals
  const [structureModalOpen, setStructureModalOpen] = React.useState<boolean>(false);
  const [bulkModalOpen, setBulkModalOpen] = React.useState<boolean>(false);
  const [importModalOpen, setImportModalOpen] = React.useState<boolean>(false);
  const [copyModalOpen, setCopyModalOpen] = React.useState<boolean>(false);

  // Local draft scores for seamless typing before blur/save
  // studentId -> loId -> raw string
  const [draftScores, setDraftScores] = React.useState<Record<string, Record<string, string>>>({});
  const [savingCells, setSavingCells] = React.useState<Record<string, boolean>>({});

  // Ensure an active subject is selected
  React.useEffect(() => {
    if (subjects.length > 0) {
      if (!activeSubjectId || !subjects.some(s => s.id === activeSubjectId)) {
        setActiveSubjectId(subjects[0].id);
      }
    } else {
      setActiveSubjectId('');
    }
  }, [subjects, activeSubjectId]);

  const activeSubject: ElementaryMonthlySubject | null = React.useMemo(() => {
    return subjects.find(s => s.id === activeSubjectId) || subjects[0] || null;
  }, [subjects, activeSubjectId]);

  // Filter students by search
  const filteredStudents = React.useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.nisn && s.nisn.toLowerCase().includes(q)) ||
      (s.id && s.id.toLowerCase().includes(q))
    );
  }, [students, searchQuery]);

  // Helper to read score value for cell
  const getCellScoreString = (studentId: string, loId: string): string => {
    if (draftScores[studentId]?.[loId] !== undefined) {
      return draftScores[studentId][loId];
    }
    const saved = studentScoresMap[studentId]?.scores?.[loId];
    if (saved !== undefined && saved !== null) {
      return String(saved);
    }
    return '';
  };

  const handleCellChange = (studentId: string, loId: string, rawVal: string) => {
    setDraftScores(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [loId]: rawVal
      }
    }));
  };

  const handleCellBlur = async (student: Student, loId: string) => {
    const rawVal = draftScores[student.id]?.[loId];
    if (rawVal === undefined) return; // not changed

    const trimmed = rawVal.trim();
    let numScore: number | null = null;

    if (trimmed !== '') {
      const parsed = parseFloat(trimmed.replace(',', '.'));
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        toast.warning('Nilai harus berupa angka antara 0 dan 100.');
        // Revert to saved
        setDraftScores(prev => {
          const next = { ...prev };
          if (next[student.id]) {
            delete next[student.id][loId];
          }
          return next;
        });
        return;
      }
      numScore = parsed;
    }

    const cellKey = `${student.id}_${loId}`;
    setSavingCells(prev => ({ ...prev, [cellKey]: true }));

    try {
      if (!selectedClass) return;
      await saveElementaryMonthlySingleScore({
        studentId: student.id,
        studentName: student.name,
        classId: selectedClass.id,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        loId,
        score: numScore,
        user: currentUser
      });

      // Clear draft once saved into map
      setDraftScores(prev => {
        const next = { ...prev };
        if (next[student.id]) {
          delete next[student.id][loId];
        }
        return next;
      });

      // Silently refresh state in background
      await onRefreshData();
    } catch (err: any) {
      toast.error('Gagal menyimpan nilai: ' + err.message);
    } finally {
      setSavingCells(prev => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
    }
  };

  const handleSaveCurriculumStructure = async (updatedSubjects: ElementaryMonthlySubject[]) => {
    if (!selectedClass) return;
    await saveElementaryMonthlyCurriculum({
      classId: selectedClass.id,
      className: selectedClass.name,
      gradeLevel: selectedClass.grade || 1,
      academicYear: selectedYear,
      semester: selectedSemester,
      month: selectedMonth,
      subjects: updatedSubjects,
      createdAt: curriculumDoc?.createdAt,
      createdBy: curriculumDoc?.createdBy,
      createdByName: curriculumDoc?.createdByName
    }, currentUser);

    await onRefreshData();
  };

  const handleApplyBulkScore = async (params: {
    loId: string;
    score: number;
    onlyEmpty: boolean;
    targetStudentIds: string[];
  }) => {
    if (!selectedClass) return;
    await saveBulkElementaryMonthlyScores({
      classId: selectedClass.id,
      academicYear: selectedYear,
      semester: selectedSemester,
      month: selectedMonth,
      loId: params.loId,
      score: params.score,
      students,
      targetStudentIds: params.targetStudentIds,
      onlyEmpty: params.onlyEmpty,
      existingScoresMap: studentScoresMap,
      user: currentUser
    });
    // Clear draft scores
    setDraftScores({});
    await onRefreshData();
  };

  const handleApplyImportTable = async (scoresByStudent: Record<string, Record<string, number>>) => {
    if (!selectedClass) return;
    await importTableElementaryMonthlyScores({
      classId: selectedClass.id,
      academicYear: selectedYear,
      semester: selectedSemester,
      month: selectedMonth,
      scoresByStudent,
      students,
      existingScoresMap: studentScoresMap,
      user: currentUser
    });
    setDraftScores({});
    await onRefreshData();
  };

  const renderPredicateBadge = (pred: ElementaryMonthlyPredicate | null) => {
    if (!pred) {
      return <span className="text-slate-300 font-semibold">-</span>;
    }
    if (pred === 'A') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs" title="Achieved (≥ Batas A)">
          A
        </span>
      );
    }
    if (pred === 'D') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs" title="Developing (KKM – < Batas A)">
          D
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs" title="Beginning (< KKM)">
        B
      </span>
    );
  };

  if (!selectedClass) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        Pilih kelas terlebih dahulu.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Subject Selector Tabs & Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-emerald-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Pelajaran ({subjects.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStructureModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 size={14} /> Kelola Pelajaran, LG &amp; LO
            </button>
            <button
              type="button"
              onClick={() => setCopyModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Copy size={14} /> Salin dari Bulan/Kelas Lain
            </button>
          </div>
        </div>

        {/* Subjects horizontal pill tabs */}
        {subjects.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
            <p className="text-xs text-slate-500 font-medium">
              Belum ada pelajaran terdaftar untuk {selectedClass.name} pada {monthLabel}.
            </p>
            <button
              type="button"
              onClick={() => setStructureModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Mulai Atur Pelajaran &amp; LG
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
            {subjects.map(subj => {
              const isSelected = subj.id === activeSubject?.id;
              const lgCount = (subj.learningGoals || []).length;
              return (
                <button
                  key={subj.id}
                  type="button"
                  onClick={() => setActiveSubjectId(subj.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-2 ${
                    isSelected
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{subj.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isSelected ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {lgCount} LG
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeSubject && (
        <>
          {/* Active Subject Information & Action Tools */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-slate-900">{activeSubject.name}</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200">
                    KKM Standar: {activeSubject.kkm ?? 70}
                  </span>
                </div>
                {/* KKM & Conversion Formula display */}
                <p className="text-[11px] text-slate-500 mt-1">
                  Formula Batas A: <span className="font-semibold text-slate-700">K + (100 - K) / 2 = {((activeSubject.kkm ?? 70) + (100 - (activeSubject.kkm ?? 70)) / 2).toFixed(1)}</span> · 
                  <span className="text-emerald-700 font-bold ml-1">A: ≥ {((activeSubject.kkm ?? 70) + (100 - (activeSubject.kkm ?? 70)) / 2).toFixed(1)}</span> · 
                  <span className="text-blue-700 font-bold ml-1">D: {activeSubject.kkm ?? 70} – &lt; {((activeSubject.kkm ?? 70) + (100 - (activeSubject.kkm ?? 70)) / 2).toFixed(1)}</span> · 
                  <span className="text-amber-700 font-bold ml-1">B: &lt; {activeSubject.kkm ?? 70}</span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Users size={14} /> Nilai Massal
                </button>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={14} /> Impor / Tempel Tabel
                </button>
              </div>
            </div>

            {/* Search Filter */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama siswa / NISN..."
                  className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <span className="text-xs text-slate-500">
                Menampilkan <strong>{filteredStudents.length}</strong> dari {students.length} siswa
              </span>
            </div>
          </div>

          {/* Scoring Grid */}
          {(activeSubject.learningGoals || []).length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
              Belum ada Learning Goal pada pelajaran ini. Klik &quot;Kelola Pelajaran, LG &amp; LO&quot; di atas untuk menambahkan.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto max-h-[600px] relative">
                <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                  {/* Table Header with Grouped LGs */}
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-20 border-b border-slate-200">
                    {/* Top Header Row: Student info & LG groups */}
                    <tr>
                      <th className="p-2.5 w-12 text-center font-bold sticky left-0 z-30 bg-slate-100 border-r border-slate-200">
                        No
                      </th>
                      <th className="p-2.5 min-w-[200px] font-bold sticky left-12 z-30 bg-slate-100 border-r border-slate-300 shadow-xs">
                        Nama Siswa
                      </th>

                      {activeSubject.learningGoals.map((lg) => {
                        const effectiveKkm = lg.kkmOverride ?? activeSubject.kkm ?? 70;
                        const batasA = effectiveKkm + (100 - effectiveKkm) / 2;
                        const loCount = (lg.learningObjectives || []).length;
                        const colSpan = loCount + 3; // LOs + Rata-rata + Predikat + Status

                        return (
                          <th
                            key={lg.id}
                            colSpan={colSpan}
                            className="p-2.5 text-center font-bold border-l-2 border-r-2 border-slate-300 bg-emerald-50/70"
                          >
                            <div className="flex items-center justify-between gap-2 px-2">
                              <span className="text-xs font-black text-emerald-900 px-2 py-0.5 rounded bg-emerald-200/60 border border-emerald-300">
                                {lg.code}
                              </span>
                              <span className="font-semibold text-slate-800 truncate text-xs" title={lg.title}>
                                {lg.title}
                              </span>
                              <span className="text-[10px] text-emerald-800 font-medium whitespace-nowrap bg-white px-2 py-0.5 rounded border border-emerald-200">
                                KKM: {effectiveKkm} (A: ≥{batasA.toFixed(1)})
                              </span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>

                    {/* Sub Header Row: Individual LOs and LG summary columns */}
                    <tr className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                      <th className="p-2 text-center font-semibold sticky left-0 z-30 bg-slate-50 border-r border-slate-200">
                        -
                      </th>
                      <th className="p-2 font-semibold sticky left-12 z-30 bg-slate-50 border-r border-slate-300 shadow-xs">
                        {filteredStudents.length} Siswa Terdaftar
                      </th>

                      {activeSubject.learningGoals.map((lg) => (
                        <React.Fragment key={lg.id}>
                          {(lg.learningObjectives || []).map((lo) => (
                            <th
                              key={lo.id}
                              className="p-2 min-w-[70px] max-w-[90px] text-center font-bold text-slate-800 border-l border-slate-200"
                              title={lo.title}
                            >
                              <div className="truncate">{lo.code}</div>
                            </th>
                          ))}
                          <th className="p-2 min-w-[85px] text-center font-bold text-slate-900 bg-slate-100/90 border-l border-slate-300">
                            Rata LG
                          </th>
                          <th className="p-2 min-w-[65px] text-center font-bold text-slate-900 bg-slate-100/90 border-l border-slate-200">
                            Predikat
                          </th>
                          <th className="p-2 min-w-[85px] text-center font-bold text-slate-900 bg-slate-100/90 border-l border-r-2 border-slate-300">
                            Status
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((student, idx) => {
                      const studentScores = studentScoresMap[student.id]?.scores || {};

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Sticky Left: No */}
                          <td className="p-2 text-center text-slate-400 font-medium sticky left-0 z-10 bg-white border-r border-slate-200">
                            {idx + 1}
                          </td>

                          {/* Sticky Left: Name */}
                          <td className="p-2 font-bold text-slate-900 sticky left-12 z-10 bg-white border-r border-slate-300 shadow-xs">
                            <div className="truncate max-w-[190px]">{student.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {student.nisn || student.nis || student.id}
                            </div>
                          </td>

                          {/* LGs and LO scores */}
                          {activeSubject.learningGoals.map((lg) => {
                            const effectiveKkm = lg.kkmOverride ?? activeSubject.kkm ?? 70;
                            const loList = lg.learningObjectives || [];

                            // Merge saved scores with any active draft scores for real-time live preview
                            const mergedScores: Record<string, number | undefined> = { ...studentScores };
                            loList.forEach(lo => {
                              const draft = draftScores[student.id]?.[lo.id];
                              if (draft !== undefined) {
                                const num = draft === '' ? undefined : parseFloat(draft.replace(',', '.'));
                                mergedScores[lo.id] = isNaN(num as any) ? undefined : num;
                              }
                            });

                            const lgResult = calculateLGAverageAndPredicate(mergedScores, loList, effectiveKkm);

                            return (
                              <React.Fragment key={lg.id}>
                                {loList.map((lo) => {
                                  const cellVal = getCellScoreString(student.id, lo.id);
                                  const isSaving = !!savingCells[`${student.id}_${lo.id}`];

                                  return (
                                    <td key={lo.id} className="p-1.5 text-center border-l border-slate-100">
                                      <div className="relative">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={cellVal}
                                          onChange={(e) => handleCellChange(student.id, lo.id, e.target.value)}
                                          onBlur={() => handleCellBlur(student, lo.id)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              (e.target as HTMLInputElement).blur();
                                            }
                                          }}
                                          placeholder="-"
                                          disabled={isSaving}
                                          className={`w-full text-center text-xs font-bold py-1 px-1 rounded-lg border transition-all ${
                                            cellVal !== ''
                                              ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500'
                                              : 'bg-white border-dashed border-slate-200 text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
                                          }`}
                                        />
                                        {isSaving && (
                                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                                            <div className="w-2.5 h-2.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}

                                {/* LG Average Column */}
                                <td className="p-2 text-center font-bold text-slate-900 bg-slate-50/70 border-l border-slate-300">
                                  <span>{lgResult.displayAverage}</span>
                                  {lgResult.totalLOs > 0 && lgResult.filledLOs > 0 && (
                                    <div className="text-[10px] text-slate-400 font-normal">
                                      {lgResult.filledLOs}/{lgResult.totalLOs} LO
                                    </div>
                                  )}
                                </td>

                                {/* LG Predicate Column */}
                                <td className="p-2 text-center border-l border-slate-200 bg-slate-50/70">
                                  {renderPredicateBadge(lgResult.predicate)}
                                </td>

                                {/* LG Status Column */}
                                <td className="p-2 text-center text-[10px] font-semibold border-l border-r-2 border-slate-300 bg-slate-50/70">
                                  {lgResult.isComplete ? (
                                    <span className="text-emerald-700 font-bold inline-flex items-center gap-0.5">
                                      <CheckCircle2 size={11} /> Lengkap
                                    </span>
                                  ) : lgResult.filledLOs > 0 ? (
                                    <span className="text-amber-700 font-bold">
                                      Belum lengkap
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">
                                      Belum dinilai
                                    </span>
                                  )}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {structureModalOpen && (
        <CurriculumStructureModal
          isOpen={structureModalOpen}
          onClose={() => setStructureModalOpen(false)}
          subjects={subjects}
          onSave={handleSaveCurriculumStructure}
          className={selectedClass.name}
          monthLabel={monthLabel}
        />
      )}

      {bulkModalOpen && activeSubject && (
        <BulkScoreModal
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          students={students}
          subject={activeSubject}
          existingScoresMap={studentScoresMap}
          onApply={handleApplyBulkScore}
        />
      )}

      {importModalOpen && activeSubject && (
        <ImportScoreTableModal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          students={students}
          subject={activeSubject}
          existingScoresMap={studentScoresMap}
          onImport={handleApplyImportTable}
        />
      )}

      {copyModalOpen && (
        <CopyCurriculumModal
          isOpen={copyModalOpen}
          onClose={() => setCopyModalOpen(false)}
          targetClass={selectedClass}
          targetYear={selectedYear}
          targetSemester={selectedSemester}
          targetMonth={selectedMonth}
          availableClasses={allElementaryClasses}
          currentUser={currentUser}
          onCopied={onRefreshData}
        />
      )}
    </div>
  );
};
