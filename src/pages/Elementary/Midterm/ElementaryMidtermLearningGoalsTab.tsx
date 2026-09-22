import * as React from 'react';
import { 
  Plus, Edit2, Trash2, CheckCircle2, AlertCircle, RefreshCw, 
  Sparkles, Layers, BookOpen, User, Music, PlusCircle, FolderPlus
} from 'lucide-react';
import { 
  saveElementaryMidtermMasterGoals, 
  saveBulkElementaryMidtermMasterGoalForClasses,
  saveElementaryMidtermStudentRemark,
  saveBulkElementaryMidtermStudentRemarks,
  fetchElementaryStudentUnitActivityEnrollment,
  saveElementaryMidtermStudentPerformingArtsUa,
  fetchElementaryMidtermCustomUas,
  saveElementaryMidtermCustomUas
} from '../../../services/elementaryMidtermService';
import { getLearningGoals } from '../../../lib/firebase';
import { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc,
  ElementaryMidtermGoalItem,
  ELEMENTARY_OFFICIAL_SUBJECTS,
  normalizeElementarySubjectName,
  getGradeLevelNumber,
  getDefaultPerformingArtsUAs
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, User as UserType, UnitActivityEnrollment } from '../../../types';

interface ElementaryMidtermLearningGoalsTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  allElementaryClasses?: Class[];
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
  allElementaryClasses = [],
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

  // Grade level detection (1 to 6)
  const gradeNum = React.useMemo(() => getGradeLevelNumber(selectedClass), [selectedClass]);

  // Default Unit Activities for this grade level
  const defaultUas = React.useMemo(() => getDefaultPerformingArtsUAs(gradeNum), [gradeNum]);

  // Custom UAs added by teachers for this class
  const [customUas, setCustomUas] = React.useState<string[]>([]);

  // Combined Active UAs for this grade level/class
  const activeGradeUas = React.useMemo(() => {
    const combined = [...defaultUas];
    customUas.forEach(u => {
      if (!combined.includes(u)) combined.push(u);
    });
    return combined;
  }, [defaultUas, customUas]);

  // Active Performing Arts Unit Activity Sub-tab
  const [activeUaTab, setActiveUaTab] = React.useState<string>('');

  // Find all active classes on the same grade level
  const sameGradeClasses = React.useMemo(() => {
    if (!selectedClass) return [];
    const targetGrade = getGradeLevelNumber(selectedClass);
    const matched = (allElementaryClasses || []).filter(c => c && getGradeLevelNumber(c) === targetGrade);
    if (selectedClass && !matched.some(c => c.id === selectedClass.id)) {
      matched.push(selectedClass);
    }
    return matched;
  }, [selectedClass, allElementaryClasses]);

  // Selected target class IDs for multi-class Goal application
  const [selectedTargetClassIds, setSelectedTargetClassIds] = React.useState<string[]>([]);
  const [showAddGoalConfirmModal, setShowAddGoalConfirmModal] = React.useState<boolean>(false);
  const [bulkGoalSuccessMsg, setBulkGoalSuccessMsg] = React.useState<string | null>(null);

  // Synchronize default selected target classes when grade or selected class changes
  React.useEffect(() => {
    if (sameGradeClasses.length > 0) {
      setSelectedTargetClassIds(sameGradeClasses.map(c => c.id));
    } else if (selectedClassId) {
      setSelectedTargetClassIds([selectedClassId]);
    }
  }, [selectedClassId, sameGradeClasses]);

  // Keep activeUaTab valid when grade level or UAs change
  React.useEffect(() => {
    if (activeGradeUas.length > 0 && (!activeUaTab || !activeGradeUas.includes(activeUaTab))) {
      setActiveUaTab(activeGradeUas[0]);
    }
  }, [activeGradeUas, activeUaTab]);

  // Load custom UAs for current class
  React.useEffect(() => {
    const loadCustomUas = async () => {
      if (!selectedClassId) return;
      const uas = await fetchElementaryMidtermCustomUas(selectedClassId, selectedYear, selectedSemester, selectedTerm);
      setCustomUas(uas);
    };
    loadCustomUas();
  }, [selectedClassId, selectedYear, selectedSemester, selectedTerm]);

  // Effective Subject Key for Firestore storage and lookup
  const effectiveSubjectKey = React.useMemo(() => {
    if (activeSubject === 'Performing Arts' && activeUaTab) {
      return `Performing Arts - ${activeUaTab}`;
    }
    return activeSubject;
  }, [activeSubject, activeUaTab]);

  // Lookup master doc for selected active subject and UA
  const currentSubjectMasterDoc = React.useMemo(() => {
    if (masterGoalsMap[effectiveSubjectKey]) return masterGoalsMap[effectiveSubjectKey];

    const foundKey = Object.keys(masterGoalsMap).find(key => {
      if (activeSubject === 'Performing Arts') {
        return key === `Performing Arts - ${activeUaTab}` || key === `Performing Arts::${activeUaTab}`;
      }
      return normalizeElementarySubjectName(key) === activeSubject;
    });

    return foundKey ? masterGoalsMap[foundKey] : undefined;
  }, [masterGoalsMap, effectiveSubjectKey, activeSubject, activeUaTab]);

  const [goals, setGoals] = React.useState<ElementaryMidtermGoalItem[]>([]);
  const [editingGoalId, setEditingGoalId] = React.useState<string | null>(null);
  const [goalTextInput, setGoalTextInput] = React.useState<string>('');
  const [savingGoals, setSavingGoals] = React.useState<boolean>(false);

  // Student remarks map: studentId -> { goalId -> 'A' | 'D' | 'B' }
  const [localRemarks, setLocalRemarks] = React.useState<Record<string, Record<string, string>>>({});
  
  // Student Performing Arts UA selection map: studentId -> UA string
  const [studentUaSelection, setStudentUaSelection] = React.useState<Record<string, string>>({});
  const [uaSaveStatus, setUaSaveStatus] = React.useState<'saved' | 'saving' | 'error' | null>(null);

  // Modal State for adding custom UA
  const [showAddUaModal, setShowAddUaModal] = React.useState<boolean>(false);
  const [newUaInput, setNewUaInput] = React.useState<string>('');
  const [savingCustomUa, setSavingCustomUa] = React.useState<boolean>(false);

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

  // Synchronize master goals when effectiveSubjectKey or masterGoalsMap changes
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
  }, [effectiveSubjectKey, currentSubjectMasterDoc, selectedClass, selectedYear, activeSubject]);

  // Synchronize studentRemarks and studentUaSelection from props into local state
  React.useEffect(() => {
    const remarksMap: Record<string, Record<string, string>> = {};
    const uasMap: Record<string, string> = {};

    Object.keys(studentDataMap).forEach(sId => {
      remarksMap[sId] = { ...(studentDataMap[sId]?.remarks || {}) };
      if (studentDataMap[sId]?.performingArtsUA) {
        uasMap[sId] = studentDataMap[sId].performingArtsUA;
      }
    });

    setLocalRemarks(remarksMap);
    setStudentUaSelection(uasMap);
  }, [studentDataMap]);

  // Handle adding custom UA
  const handleAddCustomUa = async () => {
    const trimmed = newUaInput.trim();
    if (!trimmed) return;
    setSavingCustomUa(true);
    try {
      const updated = [...customUas];
      if (!updated.includes(trimmed)) {
        updated.push(trimmed);
        await saveElementaryMidtermCustomUas(
          selectedClassId,
          selectedClass?.name || '',
          selectedYear,
          selectedSemester,
          selectedTerm,
          updated,
          currentUser
        );
        setCustomUas(updated);
        setActiveUaTab(trimmed);
      }
      setNewUaInput('');
      setShowAddUaModal(false);
    } catch (e) {
      console.error("Error adding custom UA:", e);
    } finally {
      setSavingCustomUa(false);
    }
  };

  // Handle Student UA assignment change
  const handleStudentUaChange = async (studentId: string, studentName: string, selectedUa: string) => {
    setStudentUaSelection(prev => ({ ...prev, [studentId]: selectedUa }));
    setUaSaveStatus('saving');
    try {
      await saveElementaryMidtermStudentPerformingArtsUa(
        studentId,
        studentName,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        selectedUa,
        currentUser
      );
      setUaSaveStatus('saved');
      await onRefreshData();
      setTimeout(() => setUaSaveStatus(null), 2500);
    } catch (e) {
      console.error("Error saving student UA:", e);
      setUaSaveStatus('error');
    }
  };

  // Handle adding or editing a Goal
  const handleSaveGoal = async () => {
    if (!goalTextInput.trim()) return;

    if (editingGoalId) {
      // Editing existing goal for current selected class
      setSavingGoals(true);
      let updatedGoals = goals.map(g => g.id === editingGoalId ? { ...g, text: goalTextInput.trim() } : g);
      try {
        const category = activeSubject === 'Projects' ? 'PROJECTS' : 'SUBJECTS';
        await saveElementaryMidtermMasterGoals(
          selectedClassId,
          selectedClass?.name || '',
          selectedYear,
          selectedSemester,
          selectedTerm,
          effectiveSubjectKey,
          category,
          updatedGoals,
          currentUser
        );

        setGoals(updatedGoals);
        setGoalTextInput('');
        setEditingGoalId(null);
        await onRefreshData();
      } catch (e) {
        console.error("Error editing goal:", e);
      } finally {
        setSavingGoals(false);
      }
    } else {
      // Adding new goal -> check selected target classes & open confirmation modal
      if (selectedTargetClassIds.length === 0) {
        alert("Pilih minimal satu kelas untuk menerapkan Learning Goal.");
        return;
      }
      setShowAddGoalConfirmModal(true);
    }
  };

  // Execute bulk save of new Learning Goal across all selected target classes
  const executeAddGoalBulk = async () => {
    if (!goalTextInput.trim() || selectedTargetClassIds.length === 0) return;
    setSavingGoals(true);
    setShowAddGoalConfirmModal(false);

    try {
      const category = activeSubject === 'Projects' ? 'PROJECTS' : 'SUBJECTS';
      const targetClassesToApply = sameGradeClasses.filter(c => selectedTargetClassIds.includes(c.id));

      await saveBulkElementaryMidtermMasterGoalForClasses(
        targetClassesToApply,
        selectedYear,
        selectedSemester,
        selectedTerm,
        effectiveSubjectKey,
        category,
        goalTextInput.trim(),
        currentUser
      );

      const count = selectedTargetClassIds.length;
      setBulkGoalSuccessMsg(`✓ Learning Goal berhasil diterapkan ke ${count} kelas.`);
      setGoalTextInput('');
      await onRefreshData();

      setTimeout(() => {
        setBulkGoalSuccessMsg(null);
      }, 6000);
    } catch (e) {
      console.error("Error bulk adding learning goal:", e);
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
        effectiveSubjectKey,
        category,
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

  // Active students for input remarks table (filtered by UA if subject is Performing Arts)
  const activeStudentsForGrading = React.useMemo(() => {
    if (activeSubject === 'Performing Arts') {
      return students.filter(st => studentUaSelection[st.id] === activeUaTab);
    }
    return students;
  }, [students, activeSubject, studentUaSelection, activeUaTab]);

  // Confirm and Execute Bulk Action
  const executeBulkRemark = async () => {
    const { goalId, value } = bulkModal;
    if (!goalId || !value) return;

    // Local optimistic update for active students for this goalId ONLY
    setLocalRemarks(prev => {
      const updated = { ...prev };
      activeStudentsForGrading.forEach(st => {
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
      const studentList = activeStudentsForGrading.map(s => ({ id: s.id, name: s.name }));
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

        {/* Performing Arts Unit Activity Sub-Tabs */}
        {activeSubject === 'Performing Arts' && (
          <div className="mt-4 pt-3 border-t border-slate-100 bg-purple-50/60 p-4 rounded-2xl border border-purple-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-purple-950 font-black text-xs uppercase tracking-wider">
                <Music size={16} className="text-purple-700" />
                <span>Unit Activity Performing Arts (Kelas {selectedClass?.name || ''} — Level Grade {gradeNum}):</span>
              </div>
              <span className="text-[11px] font-semibold text-purple-700">
                Unit Activity khusus tingkat Kelas {gradeNum <= 2 ? '1–2' : gradeNum <= 4 ? '3–4' : '5–6'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeGradeUas.map(ua => {
                const isUaActive = activeUaTab === ua;
                return (
                  <button
                    key={ua}
                    onClick={() => setActiveUaTab(ua)}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                      isUaActive
                        ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-300'
                        : 'bg-white text-purple-900 hover:bg-purple-100 border border-purple-200'
                    }`}
                  >
                    {ua}
                  </button>
                );
              })}

              <button
                onClick={() => setShowAddUaModal(true)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              >
                <Plus size={14} />
                <span>+ Tambah Unit Activity</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: MASTER GOALS MANAGEMENT FOR SELECTED SUBJECT / UA */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Layers size={18} className="text-emerald-600" />
              <span>Learning Goals: {activeSubject} {activeSubject === 'Performing Arts' && activeUaTab ? `— ${activeUaTab}` : ''}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Atur target capaian belajar untuk {activeSubject === 'Performing Arts' ? `Unit Activity ${activeUaTab}` : activeSubject} pada kelas {selectedClass?.name || ''}.
            </p>
          </div>
        </div>

        {/* List of current goals */}
        <div className="space-y-3">
          {goals.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400 font-medium">
              Belum ada Learning Goals untuk {activeSubject === 'Performing Arts' ? `Performing Arts (${activeUaTab})` : activeSubject}. Tambahkan di bawah.
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

        {/* Bulk Success Alert Message */}
        {bulkGoalSuccessMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-extrabold text-emerald-900 flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              {bulkGoalSuccessMsg}
            </span>
            <button
              onClick={() => setBulkGoalSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 font-black text-xs px-2 py-0.5 rounded-lg hover:bg-emerald-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Add/Edit Goal Input Box */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            {editingGoalId ? 'Edit Learning Goal' : `+ Tambah Learning Goal Baru (${activeSubject === 'Performing Arts' ? activeUaTab : activeSubject})`}
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
                disabled={savingGoals || !goalTextInput.trim() || (!editingGoalId && selectedTargetClassIds.length === 0)}
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

          {/* Multi-select Checkboxes for Target Classes */}
          {!editingGoalId && sameGradeClasses.length > 0 && (
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Terapkan ke Kelas:
                </label>
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedTargetClassIds(sameGradeClasses.map(c => c.id))}
                    className="text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                  >
                    Pilih Semua Kelas Grade {gradeNum}
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTargetClassIds([selectedClassId])}
                    className="text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                  >
                    Hanya {selectedClass?.name || 'Kelas Ini'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 p-3 bg-white rounded-xl border border-slate-200">
                {sameGradeClasses.map(cls => {
                  const isChecked = selectedTargetClassIds.includes(cls.id);
                  return (
                    <label
                      key={cls.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs ring-1 ring-emerald-200'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTargetClassIds(prev => [...prev, cls.id]);
                          } else {
                            setSelectedTargetClassIds(prev => prev.filter(id => id !== cls.id));
                          }
                        }}
                        className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                      />
                      <span>{cls.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2 (SPECIAL): TABEL PENETAPAN UNIT ACTIVITY SISWA (PERFORMING ARTS) */}
      {activeSubject === 'Performing Arts' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <User size={18} className="text-purple-600" />
                <span>Tabel Penetapan Unit Activity Performing Arts Siswa</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Pilih 1 Unit Activity untuk tiap siswa pada kelas {selectedClass?.name || ''}. Hanya siswa terdaftar yang muncul saat menginput nilai pada tab UA tersebut.
              </p>
            </div>
            {uaSaveStatus && (
              <div className="flex items-center gap-2 text-xs font-bold transition-all">
                {uaSaveStatus === 'saving' && (
                  <span className="text-amber-600 flex items-center gap-1.5 animate-pulse">
                    <RefreshCw size={14} className="animate-spin" />
                    Menyimpan...
                  </span>
                )}
                {uaSaveStatus === 'saved' && (
                  <span className="text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    Semua perubahan tersimpan
                  </span>
                )}
                {uaSaveStatus === 'error' && (
                  <span className="text-red-600 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    Gagal menyimpan. Coba lagi.
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="p-3 w-12 text-center border-r border-slate-800">No</th>
                  <th className="p-3 border-r border-slate-800">Nama Siswa</th>
                  <th className="p-3 w-64 text-center">Unit Activity Selected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {students.map((st, sIdx) => {
                  const currentUa = studentUaSelection[st.id] || '';
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">
                        {sIdx + 1}
                      </td>
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-900">
                        {st.name}
                      </td>
                      <td className="p-3 text-center">
                        <select
                          value={currentUa}
                          onChange={(e) => handleStudentUaChange(st.id, st.name, e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                        >
                          <option value="">-- Pilih Unit Activity --</option>
                          {activeGradeUas.map(ua => (
                            <option key={ua} value={ua}>
                              {ua}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: INPUT REMARK SISWA TABLE WITH BULK ACTIONS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <User size={18} className="text-emerald-600" />
              <span>Input Remark Siswa — {activeSubject} {activeSubject === 'Performing Arts' ? `(${activeUaTab})` : ''}</span>
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
        ) : activeSubject === 'Performing Arts' && activeStudentsForGrading.length === 0 ? (
          <div className="p-8 text-center text-xs text-purple-700 font-bold bg-purple-50/80 rounded-2xl border border-dashed border-purple-200 space-y-1">
            <p>Belum ada siswa yang memilih Unit Activity "{activeUaTab}".</p>
            <p className="text-[11px] text-purple-600 font-normal">Silakan tetapkan Unit Activity siswa pada Tabel Penetapan Unit Activity di atas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="p-3 w-12 text-center border-r border-slate-800">No</th>
                  <th className="p-3 w-48 border-r border-slate-800">Nama Siswa</th>
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
                        {/* Primary default quick action: Set Semua D */}
                        <button
                          onClick={() => setBulkModal({ isOpen: true, goalId: g.id, goalText: g.text, value: 'D' })}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition-all shadow-xs ring-1 ring-amber-300"
                          title="Set semua siswa pada Goal ini ke nilai D"
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
                {activeStudentsForGrading.map((st, sIdx) => {
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">
                        {sIdx + 1}
                      </td>
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-900">
                        {st.name}
                      </td>
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

      {/* MODAL: TAMBAH CUSTOM UNIT ACTIVITY */}
      {showAddUaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-lg">
              <FolderPlus size={24} />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Tambah Unit Activity Performing Arts
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Tambahkan nama Unit Activity baru khusus untuk kelas {selectedClass?.name || ''} (Grade Level {gradeNum}):
              </p>
            </div>

            <input
              type="text"
              value={newUaInput}
              onChange={(e) => setNewUaInput(e.target.value)}
              placeholder="Contoh: Theatre, Angklung Ensemble, Modern Dance..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowAddUaModal(false);
                  setNewUaInput('');
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleAddCustomUa}
                disabled={savingCustomUa || !newUaInput.trim()}
                className="px-5 py-2.5 bg-purple-900 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm flex items-center gap-2"
              >
                {savingCustomUa && <RefreshCw size={14} className="animate-spin" />}
                <span>Tambah UA</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                Terapkan nilai <strong className="text-amber-700 font-black">{bulkModal.value}</strong> untuk semua ({activeStudentsForGrading.length}) siswa pada Goal ini?
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

      {/* CONFIRMATION MODAL: TERAPKAN LEARNING GOAL KE BEBERAPA KELAS */}
      {showAddGoalConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-lg">
              <Layers size={24} />
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Konfirmasi Terapkan Learning Goal
              </h3>
              
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/80 text-emerald-950 font-black text-sm">
                Terapkan Learning Goal ini ke {selectedTargetClassIds.length} kelas?
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 space-y-2">
                <div>
                  <span className="font-bold text-slate-900">Mata Pelajaran: </span>
                  <span className="font-semibold text-slate-700">{activeSubject} {activeSubject === 'Performing Arts' ? `(${activeUaTab})` : ''}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">Learning Goal: </span>
                  <p className="italic text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80 mt-1">
                    "{goalTextInput.trim()}"
                  </p>
                </div>
                <div>
                  <span className="font-bold text-slate-900">Kelas Terpilih ({selectedTargetClassIds.length}):</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {sameGradeClasses
                      .filter(c => selectedTargetClassIds.includes(c.id))
                      .map(c => (
                        <span key={c.id} className="px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg font-black text-[11px] border border-emerald-200">
                          {c.name}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              * Learning goal tidak akan diduplikasi jika sudah ada pada kelas sasaran. Nilai atau remark siswa yang sudah ada tidak akan diubah.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAddGoalConfirmModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeAddGoalBulk}
                disabled={savingGoals}
                className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm flex items-center gap-2"
              >
                {savingGoals && <RefreshCw size={14} className="animate-spin" />}
                <span>Terapkan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
