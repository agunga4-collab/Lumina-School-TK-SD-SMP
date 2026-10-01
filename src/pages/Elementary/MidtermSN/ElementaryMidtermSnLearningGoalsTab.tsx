import * as React from 'react';
import {
  Plus, Trash2, Edit2, Check, Save,
  Layers, CheckCircle2, BookOpen, Clock, Loader2,
  X, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { saveElemSnMidtermReport } from '../../../services/elementarySnMidtermService';
import type {
  ElementarySnMidtermReportDoc,
  ElementarySnSubject,
  ElementarySnLearningGoal
} from '../../../types/elementaryMidtermSnReport';
import type { Student, Class, User } from '../../../types';

export const ELEMENTARY_MIDTERM_REMARKS_CONFIG = [
  { key: 'A', label: 'Achieved', code: 'A', desc: 'Demonstrates mastery of learning', bg: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { key: 'D', label: 'Developing', code: 'D', desc: 'Shows progress towards achieving learning goals', bg: 'bg-amber-50 text-amber-800 border-amber-300' },
  { key: 'B', label: 'Beginner', code: 'B', desc: 'Early stage of learning, needs further support', bg: 'bg-sky-50 text-sky-800 border-sky-300' }
] as const;

interface ElementaryMidtermSnLearningGoalsTabProps {
  currentUser: User;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: ElementarySnMidtermReportDoc;
  onUpdateReportDoc: (updated: ElementarySnMidtermReportDoc) => void;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const ElementaryMidtermSnLearningGoalsTab: React.FC<ElementaryMidtermSnLearningGoalsTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  onUpdateReportDoc,
  onRefreshData,
  loading
}) => {
  const [subjects, setSubjects] = React.useState<ElementarySnSubject[]>([]);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState<boolean>(false);

  // Modals / forms state
  const [newSubjectName, setNewSubjectName] = React.useState<string>('');
  const [newSubjectCategory, setNewSubjectCategory] = React.useState<'ACADEMIC' | 'PROJECTS'>('ACADEMIC');
  const [showAddSubjectModal, setShowAddSubjectModal] = React.useState<boolean>(false);

  const [editingSubjectIndex, setEditingSubjectIndex] = React.useState<number | null>(null);
  const [editSubjectName, setEditSubjectName] = React.useState<string>('');

  // Sync state when reportDoc changes
  React.useEffect(() => {
    if (reportDoc?.subjects) {
      setSubjects(JSON.parse(JSON.stringify(reportDoc.subjects)));
      setHasUnsavedChanges(false);
    }
  }, [reportDoc]);

  const handleRemarkChange = (subjectIdx: number, goalIdx: number, remark: 'A' | 'D' | 'B' | '') => {
    const updated = [...subjects];
    const targetSubj = { ...updated[subjectIdx] };
    const targetGoals = [...targetSubj.learningGoals];
    targetGoals[goalIdx] = {
      ...targetGoals[goalIdx],
      remark: targetGoals[goalIdx].remark === remark ? '' : remark
    };
    targetSubj.learningGoals = targetGoals;
    updated[subjectIdx] = targetSubj;

    setSubjects(updated);
    setHasUnsavedChanges(true);
    onUpdateReportDoc({ ...reportDoc, subjects: updated });
  };

  const handleAddGoal = (subjectIdx: number) => {
    const updated = [...subjects];
    const targetSubj = { ...updated[subjectIdx] };
    const targetGoals = [...(targetSubj.learningGoals || [])];

    const newGoal: ElementarySnLearningGoal = {
      goalId: `elem_goal_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      text: '',
      remark: '',
      order: targetGoals.length + 1
    };

    targetGoals.push(newGoal);
    targetSubj.learningGoals = targetGoals;
    updated[subjectIdx] = targetSubj;

    setSubjects(updated);
    setHasUnsavedChanges(true);
    onUpdateReportDoc({ ...reportDoc, subjects: updated });
  };

  const handleGoalTextChange = (subjectIdx: number, goalIdx: number, text: string) => {
    const updated = [...subjects];
    const targetSubj = { ...updated[subjectIdx] };
    const targetGoals = [...targetSubj.learningGoals];
    targetGoals[goalIdx] = {
      ...targetGoals[goalIdx],
      text
    };
    targetSubj.learningGoals = targetGoals;
    updated[subjectIdx] = targetSubj;

    setSubjects(updated);
    setHasUnsavedChanges(true);
    onUpdateReportDoc({ ...reportDoc, subjects: updated });
  };

  const handleDeleteGoal = (subjectIdx: number, goalIdx: number) => {
    const updated = [...subjects];
    const targetSubj = { ...updated[subjectIdx] };
    const targetGoals = targetSubj.learningGoals.filter((_, idx) => idx !== goalIdx);
    targetSubj.learningGoals = targetGoals;
    updated[subjectIdx] = targetSubj;

    setSubjects(updated);
    setHasUnsavedChanges(true);
    onUpdateReportDoc({ ...reportDoc, subjects: updated });
  };

  const handleAddSubject = () => {
    if (!newSubjectName.trim()) {
      toast.error('Nama bidang studi wajib diisi.');
      return;
    }

    const newSubj: ElementarySnSubject = {
      subjectId: `elem_subj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      subjectName: newSubjectName.trim(),
      order: subjects.length + 1,
      category: newSubjectCategory,
      learningGoals: [
        {
          goalId: `elem_goal_${Date.now()}_1`,
          text: '',
          remark: '',
          order: 1
        }
      ]
    };

    const updated = [...subjects, newSubj];
    setSubjects(updated);
    setHasUnsavedChanges(true);
    onUpdateReportDoc({ ...reportDoc, subjects: updated });
    setNewSubjectName('');
    setShowAddSubjectModal(false);
    toast.success(`Bidang studi "${newSubj.subjectName}" berhasil ditambahkan.`);
  };

  const handleSaveEditSubject = (subjectIdx: number) => {
    if (!editSubjectName.trim()) {
      toast.error('Nama bidang studi tidak boleh kosong.');
      return;
    }
    const updated = [...subjects];
    updated[subjectIdx] = { ...updated[subjectIdx], subjectName: editSubjectName.trim() };
    setSubjects(updated);
    setHasUnsavedChanges(true);
    onUpdateReportDoc({ ...reportDoc, subjects: updated });
    setEditingSubjectIndex(null);
    setEditSubjectName('');
    toast.success('Nama bidang studi diperbarui.');
  };

  const handleDeleteSubject = (subjectIdx: number) => {
    const subjName = subjects[subjectIdx]?.subjectName || 'Bidang Studi';
    if (!window.confirm(`Yakin ingin menghapus bidang studi "${subjName}" beserta seluruh Learning Goals-nya?`)) {
      return;
    }

    const updated = subjects.filter((_, idx) => idx !== subjectIdx);
    setSubjects(updated);
    setHasUnsavedChanges(true);
    onUpdateReportDoc({ ...reportDoc, subjects: updated });
    toast.success(`Bidang studi "${subjName}" berhasil dihapus.`);
  };

  const handleSaveAll = async () => {
    if (!reportDoc || !selectedStudent?.id || !selectedClass?.id || !currentUser?.uid) {
      toast.error('Data laporan tidak lengkap untuk disimpan.');
      return;
    }

    setSaving(true);
    try {
      const updatedDoc: ElementarySnMidtermReportDoc = {
        ...reportDoc,
        subjects,
        updatedAt: Date.now(),
        updatedBy: currentUser.uid
      };

      await saveElemSnMidtermReport(updatedDoc, currentUser);
      onUpdateReportDoc(updatedDoc);
      setHasUnsavedChanges(false);
      toast.success('Data Learning Goals & Remarks Siswa SN berhasil disimpan ke Firestore!');
    } catch (err: any) {
      console.error('[ElementaryMidtermSnLearningGoalsTab] save error:', err);
      toast.error('Gagal menyimpan: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  // Progress metrics
  let totalGoals = 0;
  let markedGoals = 0;
  subjects.forEach((s) => {
    (s.learningGoals || []).forEach((g) => {
      if (g.text && g.text.trim()) {
        totalGoals++;
        if (g.remark) markedGoals++;
      }
    });
  });

  const completionPercent = totalGoals > 0 ? Math.round((markedGoals / totalGoals) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Learning Goals & Remarks Siswa SN: <span className="text-amber-800">{selectedStudent.name}</span>
            </h2>
            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-black uppercase">
              Custom SN
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Learning goals bersifat kustom per siswa SN. Perubahan pada siswa ini tidak akan mempengaruhi siswa lain atau modul reguler.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => setShowAddSubjectModal(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={16} />
            <span>Tambah Bidang Studi</span>
          </button>

          <button
            onClick={handleSaveAll}
            disabled={saving || !hasUnsavedChanges}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{hasUnsavedChanges ? 'Simpan Perubahan' : 'Tersimpan'}</span>
          </button>
        </div>
      </div>

      {/* Progress & Legend Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase">Progress Remark</span>
            <p className="text-sm font-black text-slate-900">
              {markedGoals} / {totalGoals} Goals ({completionPercent}%)
            </p>
          </div>
        </div>

        {ELEMENTARY_MIDTERM_REMARKS_CONFIG.map((rem) => (
          <div key={rem.key} className={`p-4 rounded-2xl border shadow-xs ${rem.bg}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase">
                {rem.code} - {rem.label}
              </span>
            </div>
            <p className="text-[10.5px] opacity-80 mt-0.5">{rem.desc}</p>
          </div>
        ))}
      </div>

      {/* Subjects & Learning Goals List */}
      <div className="space-y-6">
        {subjects.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4">
            <BookOpen size={40} className="mx-auto text-slate-300" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-700">Belum ada Bidang Studi untuk Siswa SN ini</h3>
              <p className="text-xs text-slate-400">
                Silakan tambah bidang studi dan Learning Goals kustom untuk siswa SN terpilih.
              </p>
            </div>
            <button
              onClick={() => setShowAddSubjectModal(true)}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Plus size={16} /> Tambah Bidang Studi
            </button>
          </div>
        ) : (
          subjects.map((subj, sIdx) => {
            const isEditingThisSubject = editingSubjectIndex === sIdx;
            const goals = subj.learningGoals || [];

            return (
              <div
                key={subj.subjectId || sIdx}
                className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden"
              >
                {/* Subject Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shrink-0">
                      {sIdx + 1}
                    </span>

                    {isEditingThisSubject ? (
                      <div className="flex items-center gap-2 flex-1 max-w-md">
                        <input
                          type="text"
                          value={editSubjectName}
                          onChange={(e) => setEditSubjectName(e.target.value)}
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold w-full outline-hidden focus:ring-2 focus:ring-amber-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveEditSubject(sIdx)}
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingSubjectIndex(null)}
                          className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 uppercase">
                          {subj.subjectName}
                        </h3>
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold">
                          {subj.category === 'PROJECTS' ? 'Section 2: Projects' : 'Section 1: Academic'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isEditingThisSubject && (
                      <button
                        onClick={() => {
                          setEditingSubjectIndex(sIdx);
                          setEditSubjectName(subj.subjectName);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition-all cursor-pointer"
                        title="Edit Nama Bidang Studi"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteSubject(sIdx)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all cursor-pointer"
                      title="Hapus Bidang Studi"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Learning Goals Rows */}
                <div className="p-4 space-y-3">
                  {goals.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400">
                      Belum ada Learning Goals untuk bidang studi ini. Klik tombol di bawah untuk menambahkan.
                    </div>
                  ) : (
                    goals.map((goal, gIdx) => (
                      <div
                        key={goal.goalId || gIdx}
                        className="p-3 bg-slate-50/70 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-start gap-2.5 flex-1 w-full">
                          <span className="text-xs font-bold text-slate-400 mt-2 shrink-0">
                            •
                          </span>
                          <textarea
                            value={goal.text}
                            onChange={(e) => handleGoalTextChange(sIdx, gIdx, e.target.value)}
                            placeholder="Tulis deskripsi Learning Goal di sini..."
                            rows={2}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-500 outline-hidden resize-y"
                          />
                        </div>

                        {/* Remarks Selector Buttons */}
                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                            {ELEMENTARY_MIDTERM_REMARKS_CONFIG.map((rem) => {
                              const isSelected = goal.remark === rem.code;
                              return (
                                <button
                                  key={rem.code}
                                  onClick={() => handleRemarkChange(sIdx, gIdx, rem.code as any)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                    isSelected
                                      ? rem.bg + ' shadow-xs ring-1 ring-inset'
                                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                  }`}
                                  title={rem.desc}
                                >
                                  {rem.code}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => handleDeleteGoal(sIdx, gIdx)}
                            className="p-2 text-slate-300 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all cursor-pointer"
                            title="Hapus Goal"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <button
                    onClick={() => handleAddGoal(sIdx)}
                    className="w-full py-2 border border-dashed border-slate-300 hover:border-amber-400 rounded-2xl text-xs font-bold text-slate-500 hover:text-amber-800 hover:bg-amber-50/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} /> Tambah Learning Goal
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Add Subject */}
      {showAddSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Tambah Bidang Studi SN</h3>
              <button
                onClick={() => setShowAddSubjectModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Bidang Studi
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Islamic Studies, Mathematics, Bina Diri..."
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-hidden"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Kategori Bagian PDF
                </label>
                <select
                  value={newSubjectCategory}
                  onChange={(e) => setNewSubjectCategory(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-hidden"
                >
                  <option value="ACADEMIC">Section 1: Academic Subjects</option>
                  <option value="PROJECTS">Section 2: Projects</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddSubjectModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleAddSubject}
                className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 cursor-pointer shadow-xs"
              >
                Tambahkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
