import * as React from 'react';
import { 
  Plus, Trash2, Edit2, Check, AlertCircle, Save, 
  Layers, CheckCircle2, ChevronRight, BookOpen, Clock, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  JH_MIDTERM_CATEGORIES, 
  type MidtermMasterGoalDoc, 
  type MidtermStudentDataDoc,
  type MidtermGoalItem
} from '../../../types/midtermReport';
import { 
  MIDTERM_REMARKS_CONFIG, 
  SPIRITUAL_HEALTH_OPTIONS,
  canUserEditMidtermGoals,
  saveMidtermMasterGoal,
  saveMidtermStudentRemark,
  saveBulkMidtermStudentRemarks
} from '../../../services/juniorHighMidtermService';
import type { Student, Class, User } from '../../../types';

interface MidtermLearningGoalsTabProps {
  currentUser: User;
  selectedClass: Class | null;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  masterGoalsMap: Record<string, MidtermMasterGoalDoc>;
  studentDataMap: Record<string, MidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermLearningGoalsTab: React.FC<MidtermLearningGoalsTabProps> = ({
  currentUser,
  selectedClass,
  students,
  academicYear,
  semester,
  midtermTerm,
  masterGoalsMap,
  studentDataMap,
  onRefreshData,
  loading
}) => {
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safeMasterGoalsMap = masterGoalsMap && typeof masterGoalsMap === 'object' ? masterGoalsMap : {};
  const safeStudentDataMap = studentDataMap && typeof studentDataMap === 'object' ? studentDataMap : {};
  const categoriesList = Array.isArray(JH_MIDTERM_CATEGORIES) ? JH_MIDTERM_CATEGORIES : [];

  const [selectedCategoryIndex, setSelectedCategoryIndex] = React.useState<number>(0);
  const [selectedSubject, setSelectedSubject] = React.useState<string>('Bahasa Indonesia');
  
  // Master Goal editing state
  const [isAddingGoal, setIsAddingGoal] = React.useState<boolean>(false);
  const [newGoalText, setNewGoalText] = React.useState<string>('');
  const [editingGoalId, setEditingGoalId] = React.useState<string | null>(null);
  const [editingGoalText, setEditingGoalText] = React.useState<string>('');
  const [savingMaster, setSavingMaster] = React.useState<boolean>(false);

  // Remarks saving state
  const [savingRemarkKey, setSavingRemarkKey] = React.useState<string | null>(null);

  // Save status indicator state
  const [saveStatus, setSaveStatus] = React.useState<'SAVED' | 'DIRTY' | 'SAVING' | 'ERROR'>('SAVED');

  // Bulk grade confirmation modal state
  const [bulkConfirmModal, setBulkConfirmModal] = React.useState<{
    goal: MidtermGoalItem;
    goalIndex: number;
    grade: 'A' | 'D' | 'B';
  } | null>(null);

  const currentCategory = categoriesList[selectedCategoryIndex] || categoriesList[0];
  const currentCategorySubjects = Array.isArray(currentCategory?.subjects) ? currentCategory.subjects : [];

  // Auto sync selected subject when category changes
  React.useEffect(() => {
    if (currentCategorySubjects.length > 0 && !currentCategorySubjects.includes(selectedSubject)) {
      setSelectedSubject(currentCategorySubjects[0]);
    }
  }, [selectedCategoryIndex, currentCategory, selectedSubject, currentCategorySubjects]);

  // Reset save status on subject or category change
  React.useEffect(() => {
    if (saveStatus !== 'SAVING') {
      setSaveStatus('SAVED');
    }
  }, [selectedSubject, selectedCategoryIndex]);

  const canEdit = canUserEditMidtermGoals(currentUser, selectedClass, selectedSubject);
  const currentMasterGoalDoc = safeMasterGoalsMap[selectedSubject];
  const goals: MidtermGoalItem[] = Array.isArray(currentMasterGoalDoc?.goals) ? currentMasterGoalDoc.goals.filter(Boolean) : [];

  const handleAddGoal = async () => {
    if (!newGoalText.trim() || !selectedClass) return;
    setSavingMaster(true);
    try {
      const newGoal: MidtermGoalItem = {
        id: `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        text: newGoalText.trim(),
        order: goals.length + 1
      };

      const updatedGoals = [...goals, newGoal];
      await saveMidtermMasterGoal({
        classId: selectedClass.id,
        className: selectedClass.name,
        academicYear,
        semester,
        midtermTerm,
        category: currentCategory.name,
        subjectKey: selectedSubject,
        goals: updatedGoals,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || (currentUser as any).name || 'Guru'
      });

      setNewGoalText('');
      setIsAddingGoal(false);
      await onRefreshData();
      toast.success(`Learning goal untuk ${selectedSubject} berhasil ditambahkan.`);
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menambahkan learning goal: ' + (err.message || 'Error'));
    } finally {
      setSavingMaster(false);
    }
  };

  const handleUpdateGoal = async (goalId: string) => {
    if (!editingGoalText.trim() || !selectedClass) return;
    setSavingMaster(true);
    try {
      const updatedGoals = goals.map(g => 
        g.id === goalId ? { ...g, text: editingGoalText.trim() } : g
      );

      await saveMidtermMasterGoal({
        classId: selectedClass.id,
        className: selectedClass.name,
        academicYear,
        semester,
        midtermTerm,
        category: currentCategory.name,
        subjectKey: selectedSubject,
        goals: updatedGoals,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || (currentUser as any).name || 'Guru'
      });

      setEditingGoalId(null);
      setEditingGoalText('');
      await onRefreshData();
      toast.success('Learning goal berhasil diperbarui.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal memperbarui learning goal: ' + (err.message || 'Error'));
    } finally {
      setSavingMaster(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!selectedClass) return;
    if (!window.confirm('Yakin ingin menghapus learning goal ini? Remark siswa yang terkait akan dinonaktifkan.')) {
      return;
    }
    setSavingMaster(true);
    try {
      const updatedGoals = goals.filter(g => g.id !== goalId).map((g, idx) => ({ ...g, order: idx + 1 }));
      await saveMidtermMasterGoal({
        classId: selectedClass.id,
        className: selectedClass.name,
        academicYear,
        semester,
        midtermTerm,
        category: currentCategory.name,
        subjectKey: selectedSubject,
        goals: updatedGoals,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || (currentUser as any).name || 'Guru'
      });

      await onRefreshData();
      toast.success('Learning goal berhasil dihapus.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menghapus learning goal: ' + (err.message || 'Error'));
    } finally {
      setSavingMaster(false);
    }
  };

  const handleRemarkChange = async (student: Student, goalId: string, remarkValue: string) => {
    if (!selectedClass || !canEdit) return;
    const remarkKey = `${student.id}_${goalId}`;
    setSavingRemarkKey(remarkKey);
    setSaveStatus('DIRTY');
    setSaveStatus('SAVING');

    try {
      const isSpiritual = selectedSubject === 'Spiritual Health';
      await saveMidtermStudentRemark(
        student.id,
        student.name,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        goalId,
        remarkValue,
        currentUser.uid,
        isSpiritual
      );
      await onRefreshData();
      setSaveStatus('SAVED');
    } catch (err: any) {
      console.error(err);
      setSaveStatus('ERROR');
      toast.error('Gagal menyimpan remark: ' + (err.message || 'Error'));
    } finally {
      setSavingRemarkKey(null);
    }
  };

  const handleOpenBulkConfirm = (goal: MidtermGoalItem, goalIndex: number, grade: 'A' | 'D' | 'B') => {
    if (!canEdit) return;
    setBulkConfirmModal({ goal, goalIndex, grade });
  };

  const handleApplyBulkGrade = async () => {
    if (!bulkConfirmModal || !selectedClass || !canEdit) return;
    const { goal, grade } = bulkConfirmModal;
    setBulkConfirmModal(null);

    setSaveStatus('DIRTY');
    setSaveStatus('SAVING');

    try {
      const isSpiritual = selectedSubject === 'Spiritual Health';
      const studentsPayload = safeStudents.map(s => ({
        id: s.id,
        name: s.name || 'Siswa'
      }));

      await saveBulkMidtermStudentRemarks(
        studentsPayload,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        goal.id,
        grade,
        currentUser.uid,
        safeStudentDataMap,
        isSpiritual
      );

      await onRefreshData();
      setSaveStatus('SAVED');
      toast.success(`✓ Nilai ${grade} berhasil diterapkan dan tersimpan untuk semua siswa pada Goal ini.`);
    } catch (err: any) {
      console.error('Error applying bulk grade:', err);
      setSaveStatus('ERROR');
      toast.error('Gagal menyimpan. Coba lagi.');
    }
  };

  const isSpiritualHealth = selectedSubject === 'Spiritual Health';

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {JH_MIDTERM_CATEGORIES.map((cat, idx) => {
          const isActive = idx === selectedCategoryIndex;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryIndex(idx)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Layers size={14} className={isActive ? 'text-emerald-400' : 'text-slate-400'} />
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Subject Pills within Category */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
          Mata Pelajaran:
        </span>
        {currentCategorySubjects.map(subj => {
          const isCurrent = subj === selectedSubject;
          const master = safeMasterGoalsMap[subj];
          const count = Array.isArray(master?.goals) ? master.goals.length : 0;
          return (
            <button
              key={subj}
              onClick={() => setSelectedSubject(subj)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                isCurrent
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>{subj}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  isCurrent ? 'bg-emerald-700 text-white' : count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {count} Goal{count !== 1 ? 's' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* Master Learning Goals Management Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="text-emerald-600" size={18} />
              <h3 className="text-base font-extrabold text-slate-900 uppercase">
                Learning Goals: {selectedSubject}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Definisikan learning goals untuk {selectedClass?.name || 'kelas'} pada semester {semester}, Midterm {midtermTerm}.
            </p>
          </div>

          {canEdit && !isAddingGoal && (
            <button
              onClick={() => {
                setIsAddingGoal(true);
                setNewGoalText('');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
            >
              <Plus size={14} />
              Tambah Goal
            </button>
          )}
        </div>

        {/* Learning Goals List */}
        {goals.length === 0 ? (
          <div className="p-8 border border-dashed border-amber-300 rounded-xl bg-amber-50/50 text-center space-y-2">
            <AlertCircle className="mx-auto text-amber-600" size={24} />
            <div className="text-xs font-bold text-amber-900 uppercase">
              Belum Ada Learning Goal untuk {selectedSubject}
            </div>
            <p className="text-xs text-amber-700 max-w-md mx-auto">
              Silakan tambahkan minimal 1 learning goal untuk mata pelajaran ini agar dapat menginput remark siswa dan memenuhi syarat publikasi rapor.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {goals.map((g, idx) => (
              <div
                key={g.id}
                className="flex items-start justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1">
                  <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    {idx + 1}
                  </span>

                  {editingGoalId === g.id ? (
                    <div className="flex-1 space-y-2">
                      <textarea
                        value={editingGoalText}
                        onChange={(e) => setEditingGoalText(e.target.value)}
                        rows={2}
                        className="w-full text-xs p-2.5 bg-white border border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Ketik learning goal..."
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateGoal(g.id)}
                          disabled={savingMaster}
                          className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check size={12} /> Simpan
                        </button>
                        <button
                          onClick={() => setEditingGoalId(null)}
                          className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-slate-900 leading-relaxed pt-0.5">
                      {g.text}
                    </div>
                  )}
                </div>

                {canEdit && editingGoalId !== g.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingGoalId(g.id);
                        setEditingGoalText(g.text);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                      title="Edit Goal"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(g.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors"
                      title="Hapus Goal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Goal Input Area */}
        {isAddingGoal && (
          <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
            <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider">
              Learning Goal Baru
            </label>
            <textarea
              value={newGoalText}
              onChange={(e) => setNewGoalText(e.target.value)}
              rows={2}
              placeholder={`Ketik learning goal untuk ${selectedSubject}...`}
              className="w-full text-xs p-3 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddGoal}
                disabled={savingMaster || !newGoalText.trim()}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                <Save size={13} />
                {savingMaster ? 'Menyimpan...' : 'Simpan Goal'}
              </button>
              <button
                onClick={() => {
                  setIsAddingGoal(false);
                  setNewGoalText('');
                }}
                className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Remarks Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-extrabold text-slate-900 uppercase">
                Input Remark Siswa: {selectedSubject}
              </h3>

              {/* Status Penyimpanan Badge */}
              <div className="inline-flex items-center transition-all">
                {saveStatus === 'SAVING' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                    <Loader2 className="animate-spin text-amber-600" size={13} />
                    <span>Menyimpan...</span>
                  </span>
                )}
                {saveStatus === 'SAVED' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                    <CheckCircle2 className="text-emerald-600" size={13} />
                    <span>✓ Semua perubahan tersimpan</span>
                  </span>
                )}
                {saveStatus === 'DIRTY' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold">
                    <Clock className="text-slate-500" size={13} />
                    <span>Perubahan belum tersimpan</span>
                  </span>
                )}
                {saveStatus === 'ERROR' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                    <AlertCircle className="text-rose-600" size={13} />
                    <span>Gagal menyimpan. Coba lagi.</span>
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-0.5">
              {isSpiritualHealth 
                ? 'Pilih evaluasi Spiritual Health: Sangat Baik, Baik, atau Cukup.'
                : 'Pilih status ketercapaian: A (Achieved), D (Developing), B (Beginning).'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold">
            {!isSpiritualHealth && (
              <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-xl text-slate-700 text-[11px]">
                <span><strong className="text-emerald-700">A</strong>: Achieved</span>
                <span><strong className="text-amber-700">D</strong>: Developing</span>
                <span><strong className="text-rose-700">B</strong>: Beginning</span>
              </div>
            )}
          </div>
        </div>

        {goals.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 font-medium">
            Tambahkan minimal 1 learning goal di atas sebelum menginput remark siswa.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="p-3 w-12 text-center align-top">No</th>
                  <th className="p-3 w-48 align-top">Nama Siswa</th>
                  <th className="p-3 w-28 align-top">NISN</th>
                  {goals.map((g, idx) => (
                    <th key={g.id} className="p-3 text-center min-w-[200px] align-top">
                      <div className="space-y-2">
                        <div className="line-clamp-2 max-w-[220px] mx-auto text-slate-800 normal-case text-xs font-bold leading-snug" title={g.text}>
                          Goal {idx + 1}: {g.text}
                        </div>

                        {canEdit && !isSpiritualHealth && (
                          <div className="pt-1.5 border-t border-slate-200/80 flex flex-col items-center gap-1">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <button
                                type="button"
                                disabled={saveStatus === 'SAVING'}
                                onClick={() => handleOpenBulkConfirm(g, idx + 1, 'A')}
                                className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200/90 hover:bg-emerald-100 text-emerald-800 transition-all cursor-pointer disabled:opacity-50 border border-slate-300/50"
                                title={`Set Semua A untuk Goal ${idx + 1}`}
                              >
                                Set Semua A
                              </button>

                              {/* Set Semua D - Default / Prominent Choice */}
                              <button
                                type="button"
                                disabled={saveStatus === 'SAVING'}
                                onClick={() => handleOpenBulkConfirm(g, idx + 1, 'D')}
                                className="px-2.5 py-0.5 rounded text-[10px] font-black bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 ring-2 ring-amber-400/50"
                                title={`Set Semua D (Pilihan Cepat) untuk Goal ${idx + 1}`}
                              >
                                Set Semua D
                              </button>

                              <button
                                type="button"
                                disabled={saveStatus === 'SAVING'}
                                onClick={() => handleOpenBulkConfirm(g, idx + 1, 'B')}
                                className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200/90 hover:bg-rose-100 text-rose-800 transition-all cursor-pointer disabled:opacity-50 border border-slate-300/50"
                                title={`Set Semua B untuk Goal ${idx + 1}`}
                              >
                                Set Semua B
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {safeStudents.map((student, sIdx) => {
                  if (!student) return null;
                  const sData = safeStudentDataMap[student.id];
                  const remarks = (sData?.remarks && typeof sData.remarks === 'object') ? sData.remarks : {};

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400">{sIdx + 1}</td>
                      <td className="p-3 font-bold text-slate-900 uppercase">
                        {student.name || '-'}
                      </td>
                      <td className="p-3 font-medium text-slate-500">
                        {student.nisn || (student as any).nis || '-'}
                      </td>

                      {goals.map((g) => {
                        if (!g) return null;
                        const currentVal = remarks[g.id] || (isSpiritualHealth ? sData?.spiritualHealthRemark : '') || '';
                        const isSavingThis = savingRemarkKey === `${student.id}_${g.id}`;

                        return (
                          <td key={g.id} className="p-3 text-center align-middle">
                            {isSpiritualHealth ? (
                              /* Spiritual Health Select or Chips */
                              <div className="flex items-center justify-center gap-1">
                                {SPIRITUAL_HEALTH_OPTIONS.map((opt) => {
                                  const isSelected = currentVal.toLowerCase() === opt.toLowerCase();
                                  return (
                                    <button
                                      key={opt}
                                      disabled={!canEdit || isSavingThis || saveStatus === 'SAVING'}
                                      onClick={() => handleRemarkChange(student, g.id, opt)}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                        isSelected
                                          ? 'bg-emerald-600 text-white shadow-sm'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Standard Subject Remark A / D / B */
                              <div className="flex items-center justify-center gap-1.5">
                                {MIDTERM_REMARKS_CONFIG.map((rem) => {
                                  const isSelected = currentVal === rem.code;
                                  const colorActive =
                                    rem.code === 'A'
                                      ? 'bg-emerald-600 text-white'
                                      : rem.code === 'D'
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-rose-600 text-white';

                                  return (
                                    <button
                                      key={rem.code}
                                      disabled={!canEdit || isSavingThis || saveStatus === 'SAVING'}
                                      onClick={() => handleRemarkChange(student, g.id, rem.code)}
                                      title={`${rem.label} - ${rem.description}`}
                                      className={`w-7 h-7 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                                        isSelected
                                          ? `${colorActive} shadow-sm scale-105 ring-2 ring-slate-900/10`
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                      } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                      {rem.code}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
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

      {/* Confirmation Modal for Bulk Grade Application */}
      {bulkConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                bulkConfirmModal.grade === 'A' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : bulkConfirmModal.grade === 'D' 
                  ? 'bg-amber-100 text-amber-700' 
                  : 'bg-rose-100 text-rose-700'
              }`}>
                <AlertCircle size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-extrabold text-slate-900 leading-snug">
                  Terapkan nilai {bulkConfirmModal.grade} untuk semua siswa pada Goal ini?
                </h4>
                <p className="text-xs text-slate-500">
                  Goal {bulkConfirmModal.goalIndex}: <span className="font-semibold text-slate-700">{bulkConfirmModal.goal.text}</span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">Detail Penerapan Bulk:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                <li>Nilai <strong>{bulkConfirmModal.grade}</strong> akan diisikan ke seluruh <strong>{safeStudents.length} siswa</strong> pada Goal ini.</li>
                <li>Goal lain, remark, dan data Midterm lain tidak akan diubah.</li>
                <li>Anda tetap dapat mengubah nilai tiap siswa secara individu kapan saja.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyBulkGrade}
                className={`px-4 py-2 rounded-xl text-white font-black text-xs shadow-md transition-all cursor-pointer ${
                  bulkConfirmModal.grade === 'A'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : bulkConfirmModal.grade === 'D'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Terapkan Nilai {bulkConfirmModal.grade}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

