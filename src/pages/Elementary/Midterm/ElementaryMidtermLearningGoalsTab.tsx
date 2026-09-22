import * as React from 'react';
import { 
  Plus, Edit2, Trash2, CheckCircle2, AlertCircle, RefreshCw, 
  Sparkles, Layers, BookOpen, User, Check, X, ArrowRight
} from 'lucide-react';
import { 
  saveElementaryMidtermMasterGoals, 
  saveElementaryMidtermStudentRemark,
  saveBulkElementaryMidtermStudentRemarks,
  fetchElementaryStudentUnitActivityEnrollment
} from '../../../services/elementaryMidtermService';
import { getLearningGoals } from '../../../lib/firebase';
import { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc,
  ElementaryMidtermGoalItem,
  ELEMENTARY_OFFICIAL_SUBJECTS,
  normalizeElementarySubjectName
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, User as UserType, UnitActivityEnrollment } from '../../../types';
import { ACADEMIC_SUBJECTS } from '../../../constants';

interface ElementaryMidtermLearningGoalsTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  masterGoalsMap: Record<string, ElementaryMidtermMasterGoalDoc>;
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  currentUser: UserType | null;
}

export const ElementaryMidtermLearningGoalsTab: React.FC<ElementaryMidtermLearningGoalsTabProps> = ({
  selectedClassId,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  students,
  masterGoalsMap,
  studentDataMap,
  onRefreshData,
  currentUser
}) => {
  // Official subjects for Elementary
  const elementarySubjects = ELEMENTARY_OFFICIAL_SUBJECTS;

  const [activeSubject, setActiveSubject] = React.useState<string>(elementarySubjects[0]);

  // Lookup master doc for selected active subject (including checking legacy keys)
  const currentSubjectMasterDoc = React.useMemo(() => {
    if (masterGoalsMap[activeSubject]) return masterGoalsMap[activeSubject];
    // Find doc where normalized subjectKey matches activeSubject
    const foundKey = Object.keys(masterGoalsMap).find(
      key => normalizeElementarySubjectName(key) === activeSubject
    );
    return foundKey ? masterGoalsMap[foundKey] : undefined;
  }, [masterGoalsMap, activeSubject]);
  const [goals, setGoals] = React.useState<ElementaryMidtermGoalItem[]>([]);
  const [editingGoalId, setEditingGoalId] = React.useState<string | null>(null);
  const [goalTextInput, setGoalTextInput] = React.useState<string>('');
  const [savingGoals, setSavingGoals] = React.useState<boolean>(false);

  // Student remarks map for local reactive edits: studentId -> { goalId -> 'A' | 'D' | 'B' }
  const [localRemarks, setLocalRemarks] = React.useState<Record<string, Record<string, string>>>({});
  
  // Save status indicator: 'saved' | 'saving' | 'error' | null
  const [saveStatus, setSaveStatus] = React.useState<'saved' | 'saving' | 'error' | null>(null);

  // Bulk Confirmation Modal State
  const [bulkModal, setBulkModal] = React.useState<{
    isOpen: boolean;
    goalId: string;
    goalText: string;
    value: 'A' | 'D' | 'B';
  }>({
    isOpen: false,
    goalId: '',
    goalText: '',
    value: 'D'
  });

  // Student Unit Activity Enrollments map: studentId -> UnitActivityEnrollment | null
  const [studentUaEnrollments, setStudentUaEnrollments] = React.useState<Record<string, UnitActivityEnrollment | null>>({});
  const [loadingEnrollments, setLoadingEnrollments] = React.useState<boolean>(false);

  // Synchronize master goals when activeSubject or masterGoalsMap changes
  React.useEffect(() => {
    if (currentSubjectMasterDoc && Array.isArray(currentSubjectMasterDoc.goals)) {
      setGoals(currentSubjectMasterDoc.goals);
    } else {
      // Auto-load default goals from system learning_goals if available
      const loadDefaultGoals = async () => {
        try {
          const classGrade = selectedClass?.grade || selectedClass?.name?.match(/\d+/)?.[0] || '';
          const sysGoals = await getLearningGoals({
            unitId: 'ELEMENTARY',
            grade: classGrade ? String(classGrade) : undefined,
            subject: activeSubject,
            academicYear: selectedYear,
            isActive: true
          });
          if (sysGoals && sysGoals.length > 0) {
            const mapped = sysGoals.slice(0, 5).map((g, idx) => ({
              id: g.id || `lg_${idx + 1}`,
              text: g.goalText || g.code || `Goal ${idx + 1}`,
              order: idx + 1
            }));
            setGoals(mapped);
          } else {
            setGoals([]);
          }
        } catch (e) {
          console.warn("Could not fetch default system goals:", e);
          setGoals([]);
        }
      };
      loadDefaultGoals();
    }
  }, [activeSubject, currentSubjectMasterDoc, selectedClass, selectedYear]);

  // Synchronize studentRemarks from props into local state
  React.useEffect(() => {
    const map: Record<string, Record<string, string>> = {};
    Object.keys(studentDataMap).forEach(sId => {
      map[sId] = { ...(studentDataMap[sId]?.remarks || {}) };
    });
    setLocalRemarks(map);
  }, [studentDataMap]);

  // Fetch student Unit Activity Enrollments for Performing Arts / Unit Activity
  React.useEffect(() => {
    const fetchEnrollments = async () => {
      if (!students || students.length === 0) return;
      setLoadingEnrollments(true);
      const map: Record<string, UnitActivityEnrollment | null> = {};
      await Promise.all(
        students.map(async (st) => {
          if (!st.id) return;
          const enr = await fetchElementaryStudentUnitActivityEnrollment(st.id, selectedYear, selectedSemester);
          map[st.id] = enr;
        })
      );
      setStudentUaEnrollments(map);
      setLoadingEnrollments(false);
    };

    if (activeSubject === 'Performing Arts' || activeSubject.toLowerCase().includes('art')) {
      fetchEnrollments();
    }
  }, [activeSubject, students, selectedYear, selectedSemester]);

  // Handle adding or editing a Goal
  const handleSaveGoal = async () => {
    if (!goalTextInput.trim()) return;
    setSavingGoals(true);

    let updatedGoals = [...goals];
    if (editingGoalId) {
      updatedGoals = updatedGoals.map(g => g.id === editingGoalId ? { ...g, text: goalTextInput.trim() } : g);
    } else {
      const newId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      updatedGoals.push({
        id: newId,
        text: goalTextInput.trim(),
        order: updatedGoals.length + 1
      });
    }

    try {
      const category = activeSubject === 'Projects' ? 'PROJECTS' : 'SUBJECTS';
      await saveElementaryMidtermMasterGoals(
        selectedClassId,
        selectedClass?.name || '',
        selectedYear,
        selectedSemester,
        selectedTerm,
        activeSubject,
        category,
        updatedGoals,
        currentUser
      );

      setGoals(updatedGoals);
      setGoalTextInput('');
      setEditingGoalId(null);
      await onRefreshData();
    } catch (e) {
      console.error("Error saving goal:", e);
    } finally {
      setSavingGoals(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus Goal ini?")) return;
    const updatedGoals = goals.filter(g => g.id !== goalId);
    setSavingGoals(true);
    try {
      const category = activeSubject === 'Projects' ? 'PROJECTS' : 'SUBJECTS';
      await saveElementaryMidtermMasterGoals(
        selectedClassId,
        selectedClass?.name || '',
        selectedYear,
        selectedSemester,
        selectedTerm,
        activeSubject,
        updatedGoals,
        currentUser
      );
      setGoals(updatedGoals);
      await onRefreshData();
    } catch (e) {
      console.error("Error deleting goal:", e);
    } finally {
      setSavingGoals(false);
    }
  };

  // Handle Individual Remark Click
  const handleRemarkChange = async (studentId: string, studentName: string, goalId: string, value: 'A' | 'D' | 'B') => {
    // Immediate optimistic local update
    setLocalRemarks(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [goalId]: value
      }
    }));

    setSaveStatus('saving');
    try {
      await saveElementaryMidtermStudentRemark(
        studentId,
        studentName,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        goalId,
        value,
        currentUser
      );
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (e) {
      console.error("Error saving remark:", e);
      setSaveStatus('error');
    }
  };

  // Confirm and Execute Bulk Action
  const executeBulkRemark = async () => {
    const { goalId, value } = bulkModal;
    if (!goalId || !value) return;

    // Local optimistic update for all active students for this specific goalId ONLY
    setLocalRemarks(prev => {
      const updated = { ...prev };
      students.forEach(st => {
        if (st.id) {
          updated[st.id] = {
            ...(updated[st.id] || {}),
            [goalId]: value
          };
        }
      });
      return updated;
    });

    setSaveStatus('saving');
    setBulkModal(prev => ({ ...prev, isOpen: false }));

    try {
      const studentList = students.map(s => ({ id: s.id, name: s.name }));
      await saveBulkElementaryMidtermStudentRemarks(
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        goalId,
        value,
        studentList,
        currentUser
      );
      setSaveStatus('saved');
      await onRefreshData();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error("Error executing bulk action:", e);
      setSaveStatus('error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Subject Navigation Tabs */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-xs tracking-wider">
            <BookOpen size={16} className="text-emerald-600" />
            <span>Pilih Mata Pelajaran / Subjek:</span>
          </div>
          {saveStatus && (
            <div className="flex items-center gap-2 text-xs font-bold transition-all">
              {saveStatus === 'saving' && (
                <span className="text-amber-600 flex items-center gap-1.5 animate-pulse">
                  <RefreshCw size={14} className="animate-spin" />
                  Menyimpan...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  Semua perubahan tersimpan
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  Gagal menyimpan. Coba lagi.
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {elementarySubjects.map(subj => {
            const isActive = activeSubject === subj;
            const isProject = subj === 'Projects';
            return (
              <button
                key={subj}
                onClick={() => setActiveSubject(subj)}
                className={`px-4 py-2 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? isProject
                      ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-300'
                      : 'bg-emerald-800 text-white shadow-sm ring-2 ring-emerald-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {subj}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: MASTER GOALS MANAGEMENT FOR SELECTED SUBJECT */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Layers size={18} className="text-emerald-600" />
              <span>Learning Goals: {activeSubject}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Atur target capaian belajar untuk mata pelajaran ini pada kelas {selectedClass?.name || ''}.
            </p>
          </div>
        </div>

        {/* List of current goals */}
        <div className="space-y-3">
          {goals.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400 font-medium">
              Belum ada Learning Goals untuk {activeSubject}. Tambahkan di bawah.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {goals.map((goal, idx) => (
                <div 
                  key={goal.id} 
                  className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 transition-all text-xs"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-xl bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0 text-[11px]">
                      {idx + 1}
                    </span>
                    <p className="font-semibold text-slate-800 leading-relaxed pt-0.5">
                      {goal.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setEditingGoalId(goal.id);
                        setGoalTextInput(goal.text);
                      }}
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                      title="Edit Goal"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                      title="Hapus Goal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Goal Input Box */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            {editingGoalId ? 'Edit Learning Goal' : '+ Tambah Learning Goal Baru'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={goalTextInput}
              onChange={(e) => setGoalTextInput(e.target.value)}
              placeholder="Tulis kalimat indikator Learning Goal..."
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveGoal}
                disabled={savingGoals || !goalTextInput.trim()}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all"
              >
                {savingGoals ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>{editingGoalId ? 'Simpan Edit' : 'Tambah'}</span>
              </button>
              {editingGoalId && (
                <button
                  onClick={() => {
                    setEditingGoalId(null);
                    setGoalTextInput('');
                  }}
                  className="px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: INPUT REMARK SISWA TABLE WITH BULK ACTIONS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <User size={18} className="text-emerald-600" />
              <span>Input Remark Siswa — {activeSubject}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Pilih nilai <strong className="text-slate-800">A (Achieved)</strong>, <strong className="text-slate-800">D (Developing)</strong>, atau <strong className="text-slate-800">B (Beginning)</strong> untuk tiap siswa.
            </p>
          </div>
        </div>

        {goals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Tambahkan minimal satu Learning Goal di atas terlebih dahulu untuk mulai memasukkan nilai remark siswa.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="p-3 w-12 text-center border-r border-slate-800">No</th>
                  <th className="p-3 w-48 border-r border-slate-800">Nama Siswa</th>
                  {activeSubject === 'Performing Arts' && (
                    <th className="p-3 w-40 border-r border-slate-800">Enrolled UA</th>
                  )}
                  {goals.map((g, idx) => (
                    <th key={g.id} className="p-3 min-w-[220px] border-r border-slate-800 space-y-2 align-top">
                      <div className="text-[10.5px] font-bold text-slate-200 leading-snug line-clamp-2">
                        G{idx + 1}: {g.text}
                      </div>

                      {/* Bulk Action Buttons Header for this Goal */}
                      <div className="flex items-center gap-1 pt-1 border-t border-slate-800">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mr-1">
                          Bulk:
                        </span>
                        <button
                          onClick={() => setBulkModal({ isOpen: true, goalId: g.id, goalText: g.text, value: 'A' })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-slate-700"
                          title="Set semua siswa pada Goal ini ke nilai A"
                        >
                          Set Semua A
                        </button>
                        {/* Prominent/Primary default quick action: Set Semua D */}
                        <button
                          onClick={() => setBulkModal({ isOpen: true, goalId: g.id, goalText: g.text, value: 'D' })}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition-all shadow-xs ring-1 ring-amber-300"
                          title="Set semua siswa pada Goal ini ke nilai D (Pilihan Cepat Utama)"
                        >
                          ★ Set Semua D
                        </button>
                        <button
                          onClick={() => setBulkModal({ isOpen: true, goalId: g.id, goalText: g.text, value: 'B' })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-slate-700"
                          title="Set semua siswa pada Goal ini ke nilai B"
                        >
                          Set Semua B
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {students.map((st, sIdx) => {
                  const uaEnr = studentUaEnrollments[st.id];
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">
                        {sIdx + 1}
                      </td>
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-900">
                        {st.name}
                      </td>
                      {activeSubject === 'Performing Arts' && (
                        <td className="p-3 border-r border-slate-100 text-[11px] font-medium text-slate-600">
                          {uaEnr ? (
                            <span className="px-2 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg border border-purple-100">
                              {uaEnr.normalizedUaName || uaEnr.sourceUaName || 'Enrolled'}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">(Tidak terdaftar UA)</span>
                          )}
                        </td>
                      )}
                      {goals.map((g) => {
                        const currentVal = localRemarks[st.id]?.[g.id] || '';
                        return (
                          <td key={g.id} className="p-3 border-r border-slate-100 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {(['A', 'D', 'B'] as const).map((val) => {
                                const isSelected = currentVal === val;
                                return (
                                  <button
                                    key={val}
                                    onClick={() => handleRemarkChange(st.id, st.name, g.id, val)}
                                    className={`w-9 h-8 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center justify-center ${
                                      isSelected
                                        ? val === 'A'
                                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                                          : val === 'D'
                                          ? 'bg-amber-500 text-slate-950 shadow-sm ring-2 ring-amber-300'
                                          : 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                                    }`}
                                  >
                                    {val}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BULK ACTION CONFIRMATION MODAL */}
      {bulkModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-lg">
              <Sparkles size={24} />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Konfirmasi Bulk Nilai
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Terapkan nilai <strong className="text-amber-700 font-black">{bulkModal.value}</strong> untuk semua siswa pada Goal ini?
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 italic">
                "{bulkModal.goalText}"
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              * Perubahan hanya berlaku untuk Goal ini. Anda tetap dapat mengubah nilai tiap siswa satu per satu setelahnya.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setBulkModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeBulkRemark}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm"
              >
                Terapkan Nilai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
