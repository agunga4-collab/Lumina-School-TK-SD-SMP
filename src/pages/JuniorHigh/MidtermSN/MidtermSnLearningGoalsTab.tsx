import * as React from 'react';
import {
  Plus, Trash2, Edit2, Check, Save,
  Layers, CheckCircle2, BookOpen, Clock, Loader2,
  X, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { MIDTERM_REMARKS_CONFIG } from '../../../services/juniorHighMidtermService';
import { saveSnMidtermReport } from '../../../services/juniorHighSnMidtermService';
import type { SnMidtermReportDoc, SnSubject, SnLearningGoal } from '../../../types/midtermSnReport';
import type { Student, Class, User } from '../../../types';

interface MidtermSnLearningGoalsTabProps {
  currentUser: User;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: SnMidtermReportDoc;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermSnLearningGoalsTab: React.FC<MidtermSnLearningGoalsTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  onRefreshData,
  loading
}) => {
  const [subjects, setSubjects] = React.useState<SnSubject[]>(reportDoc.subjects || []);
  const [saveStatus, setSaveStatus] = React.useState<'SAVED' | 'DIRTY' | 'SAVING' | 'ERROR'>('SAVED');

  // New Subject State
  const [isAddingSubject, setIsAddingSubject] = React.useState<boolean>(false);
  const [newSubjectName, setNewSubjectName] = React.useState<string>('');

  // Editing Subject State
  const [editingSubjectId, setEditingSubjectId] = React.useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = React.useState<string>('');

  // New Goal State per subject
  const [addingGoalSubjectId, setAddingGoalSubjectId] = React.useState<string | null>(null);
  const [newGoalText, setNewGoalText] = React.useState<string>('');

  // Editing Goal State
  const [editingGoalId, setEditingGoalId] = React.useState<string | null>(null);
  const [editingGoalText, setEditingGoalText] = React.useState<string>('');

  // Sync state when reportDoc changes
  React.useEffect(() => {
    if (reportDoc && reportDoc.subjects) {
      setSubjects(reportDoc.subjects);
      setSaveStatus('SAVED');
    }
  }, [reportDoc?.id, reportDoc?.updatedAt]);

  const handlePersistSubjects = async (updatedSubjects: SnSubject[]) => {
    if (!reportDoc?.id || !currentUser?.uid) {
      toast.error('Data dokumen tidak lengkap untuk menyimpan.');
      return;
    }
    setSaveStatus('SAVING');
    setSubjects(updatedSubjects);
    try {
      await saveSnMidtermReport(
        {
          ...reportDoc,
          subjects: updatedSubjects
        },
        currentUser
      );
      setSaveStatus('SAVED');
    } catch (err: any) {
      setSaveStatus('ERROR');
      console.error("[MidtermSnLearningGoalsTab] handlePersistSubjects error:", {
        reportId: reportDoc?.id,
        studentId: selectedStudent?.id,
        classId: selectedClass?.id
      }, err);
      toast.error('Gagal menyimpan perubahan: ' + (err.message || 'Error'));
    }
  };

  // Add Subject
  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) {
      toast.error('Nama Bidang Studi tidak boleh kosong');
      return;
    }
    const newSubject: SnSubject = {
      subjectId: `subj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      subjectName: newSubjectName.trim(),
      order: subjects.length + 1,
      learningGoals: []
    };
    const updated = [...subjects, newSubject];
    setNewSubjectName('');
    setIsAddingSubject(false);
    await handlePersistSubjects(updated);
    toast.success('Bidang Studi baru berhasil ditambahkan');
  };

  // Edit Subject Name
  const handleSaveEditSubjectName = async (subjectId: string) => {
    if (!editingSubjectName.trim()) {
      toast.error('Nama Bidang Studi tidak boleh kosong');
      return;
    }
    const updated = subjects.map((subj) =>
      subj.subjectId === subjectId
        ? { ...subj, subjectName: editingSubjectName.trim() }
        : subj
    );
    setEditingSubjectId(null);
    setEditingSubjectName('');
    await handlePersistSubjects(updated);
    toast.success('Nama Bidang Studi diperbarui');
  };

  // Delete Subject
  const handleDeleteSubject = async (subjectId: string, subjectName: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus bidang studi "${subjectName}" beserta seluruh Learning Goal-nya?`)) {
      return;
    }
    const updated = subjects.filter((subj) => subj.subjectId !== subjectId);
    await handlePersistSubjects(updated);
    toast.success(`Bidang Studi "${subjectName}" dihapus`);
  };

  // Add Goal to Subject
  const handleAddGoal = async (subjectId: string) => {
    if (!newGoalText.trim()) {
      toast.error('Teks Learning Goal tidak boleh kosong');
      return;
    }
    const updated = subjects.map((subj) => {
      if (subj.subjectId === subjectId) {
        const newGoal: SnLearningGoal = {
          goalId: `lg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          text: newGoalText.trim(),
          remark: '',
          order: (subj.learningGoals || []).length + 1
        };
        return {
          ...subj,
          learningGoals: [...(subj.learningGoals || []), newGoal]
        };
      }
      return subj;
    });

    setAddingGoalSubjectId(null);
    setNewGoalText('');
    await handlePersistSubjects(updated);
    toast.success('Learning Goal ditambahkan');
  };

  // Edit Goal Text
  const handleSaveEditGoal = async (subjectId: string, goalId: string) => {
    if (!editingGoalText.trim()) {
      toast.error('Teks Learning Goal tidak boleh kosong');
      return;
    }
    const updated = subjects.map((subj) => {
      if (subj.subjectId === subjectId) {
        return {
          ...subj,
          learningGoals: subj.learningGoals.map((g) =>
            g.goalId === goalId ? { ...g, text: editingGoalText.trim() } : g
          )
        };
      }
      return subj;
    });

    setEditingGoalId(null);
    setEditingGoalText('');
    await handlePersistSubjects(updated);
    toast.success('Learning Goal diperbarui');
  };

  // Delete Goal
  const handleDeleteGoal = async (subjectId: string, goalId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus Learning Goal ini?')) return;

    const updated = subjects.map((subj) => {
      if (subj.subjectId === subjectId) {
        return {
          ...subj,
          learningGoals: subj.learningGoals.filter((g) => g.goalId !== goalId)
        };
      }
      return subj;
    });

    await handlePersistSubjects(updated);
    toast.success('Learning Goal dihapus');
  };

  // Set Remark for Goal
  const handleSetRemark = async (subjectId: string, goalId: string, remarkCode: string) => {
    const updated = subjects.map((subj) => {
      if (subj.subjectId === subjectId) {
        return {
          ...subj,
          learningGoals: subj.learningGoals.map((g) => {
            if (g.goalId === goalId) {
              const newRemark = g.remark === remarkCode ? '' : remarkCode;
              return { ...g, remark: newRemark };
            }
            return g;
          })
        };
      }
      return subj;
    });

    await handlePersistSubjects(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Info Banner & Status */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-purple-300" />
            <h2 className="text-base font-black tracking-tight">
              Learning Goals Custom: <span className="text-amber-300">{selectedStudent.name}</span>
            </h2>
          </div>
          <p className="text-xs text-purple-200">
            Learning Goals pada modul SN ini bersifat individual. Penambahan, pengubahan, atau penghapusan Learning Goal hanya berdampak pada siswa ini.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xs px-3.5 py-1.5 rounded-xl text-xs font-bold border border-white/20">
            {saveStatus === 'SAVING' && (
              <>
                <Loader2 size={14} className="animate-spin text-amber-300" />
                <span>Menyimpan...</span>
              </>
            )}
            {saveStatus === 'SAVED' && (
              <>
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-emerald-200">Tersimpan Otomatis</span>
              </>
            )}
            {saveStatus === 'ERROR' && (
              <>
                <AlertCircle size={14} className="text-rose-400" />
                <span className="text-rose-200">Gagal Menyimpan</span>
              </>
            )}
          </div>

          <button
            onClick={() => setIsAddingSubject(true)}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={16} /> Tambah Bidang Studi
          </button>
        </div>
      </div>

      {/* Add New Subject Form */}
      {isAddingSubject && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-amber-900 uppercase tracking-wider">
              Tambah Bidang Studi Baru untuk {selectedStudent.name}
            </h3>
            <button
              onClick={() => setIsAddingSubject(false)}
              className="p-1 text-amber-700 hover:text-amber-900 rounded-lg cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Contoh: B. Indonesia Adap, Matematika Khusus, Bina Diri..."
              className="flex-1 px-4 py-2.5 bg-white border border-amber-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={handleAddSubject}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
            >
              Simpan Bidang Studi
            </button>
          </div>
        </div>
      )}

      {/* Subjects & Learning Goals List */}
      <div className="space-y-6">
        {subjects.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
            <Layers size={36} className="mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">Belum ada Bidang Studi untuk siswa SN ini.</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Klik tombol &ldquo;Tambah Bidang Studi&rdquo; di atas untuk mulai membuat Learning Goals khusus untuk {selectedStudent.name}.
            </p>
          </div>
        ) : (
          subjects.map((subject, sIdx) => {
            const isEditingSubj = editingSubjectId === subject.subjectId;
            const isAddingGoal = addingGoalSubjectId === subject.subjectId;

            return (
              <div
                key={subject.subjectId}
                className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-purple-200"
              >
                {/* Subject Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="w-7 h-7 rounded-xl bg-purple-100 text-purple-800 text-xs font-black flex items-center justify-center shrink-0">
                      {sIdx + 1}
                    </span>

                    {isEditingSubj ? (
                      <div className="flex items-center gap-2 flex-1 max-w-md">
                        <input
                          type="text"
                          value={editingSubjectName}
                          onChange={(e) => setEditingSubjectName(e.target.value)}
                          className="px-3 py-1.5 bg-white border border-purple-300 rounded-xl text-xs font-bold w-full focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveEditSubjectName(subject.subjectId)}
                          className="p-2 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingSubjectId(null)}
                          className="p-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          {subject.subjectName}
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400">
                          ({(subject.learningGoals || []).length} Goals)
                        </span>
                      </div>
                    )}
                  </div>

                  {!isEditingSubj && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditingSubjectId(subject.subjectId);
                          setEditingSubjectName(subject.subjectName);
                        }}
                        className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all cursor-pointer"
                        title="Edit Nama Bidang Studi"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(subject.subjectId, subject.subjectName)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="Hapus Bidang Studi"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setAddingGoalSubjectId(subject.subjectId);
                          setNewGoalText('');
                        }}
                        className="ml-2 px-3 py-1.5 bg-purple-900 hover:bg-purple-800 text-white text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} /> Tambah Goal
                      </button>
                    </div>
                  )}
                </div>

                {/* Add Goal Form for this Subject */}
                {isAddingGoal && (
                  <div className="p-4 bg-purple-50/50 border-b border-purple-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-purple-900">
                        Tambah Learning Goal untuk {subject.subjectName}
                      </span>
                      <button
                        onClick={() => setAddingGoalSubjectId(null)}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        value={newGoalText}
                        onChange={(e) => setNewGoalText(e.target.value)}
                        placeholder="Tuliskan capaian/pembelajaran custom untuk siswa SN ini..."
                        className="flex-1 p-2.5 bg-white border border-purple-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                      <button
                        onClick={() => handleAddGoal(subject.subjectId)}
                        className="px-4 py-2 bg-purple-900 text-white text-xs font-bold rounded-2xl hover:bg-purple-800 self-end cursor-pointer"
                      >
                        Simpan
                      </button>
                    </div>
                  </div>
                )}

                {/* Goals Table / List */}
                <div className="p-4 space-y-3">
                  {(subject.learningGoals || []).length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-2xl">
                      Belum ada Learning Goal pada bidang studi ini. Klik &ldquo;Tambah Goal&rdquo; untuk menambahkan.
                    </div>
                  ) : (
                    subject.learningGoals.map((goal, gIdx) => {
                      const isEditingGoal = editingGoalId === goal.goalId;

                      return (
                        <div
                          key={goal.goalId}
                          className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-all hover:bg-slate-50"
                        >
                          <div className="flex items-start gap-3 flex-1">
                            <span className="text-xs font-bold text-slate-400 mt-0.5">
                              {gIdx + 1}.
                            </span>

                            {isEditingGoal ? (
                              <div className="flex items-center gap-2 flex-1">
                                <textarea
                                  rows={2}
                                  value={editingGoalText}
                                  onChange={(e) => setEditingGoalText(e.target.value)}
                                  className="p-2.5 bg-white border border-purple-300 rounded-xl text-xs font-semibold w-full focus:outline-none"
                                />
                                <button
                                  onClick={() => handleSaveEditGoal(subject.subjectId, goal.goalId)}
                                  className="p-2 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingGoalId(null)}
                                  className="p-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs font-semibold text-slate-800 leading-relaxed">
                                {goal.text}
                              </p>
                            )}
                          </div>

                          {/* Action Buttons & Remarks */}
                          <div className="flex items-center gap-3 w-full md:w-auto justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200 shrink-0">
                            {/* Remarks Selector */}
                            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                              {MIDTERM_REMARKS_CONFIG.map((conf) => {
                                const isSelected = goal.remark === conf.code;
                                return (
                                  <button
                                    key={conf.code}
                                    onClick={() => handleSetRemark(subject.subjectId, goal.goalId, conf.code)}
                                    title={`${conf.label}: ${conf.description}`}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                                      isSelected
                                        ? conf.code === 'A'
                                          ? 'bg-emerald-600 text-white shadow-2xs'
                                          : conf.code === 'D'
                                          ? 'bg-amber-500 text-white shadow-2xs'
                                          : 'bg-rose-500 text-white shadow-2xs'
                                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    {conf.code}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Goal Edit & Delete */}
                            {!isEditingGoal && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingGoalId(goal.goalId);
                                    setEditingGoalText(goal.text);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer"
                                  title="Edit Goal"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteGoal(subject.subjectId, goal.goalId)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  title="Hapus Goal"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
