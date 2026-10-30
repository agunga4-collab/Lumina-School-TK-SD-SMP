import * as React from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Settings2, BookOpen, Layers, Check, AlertCircle } from 'lucide-react';
import type { 
  ElementaryMonthlySubject, 
  ElementaryMonthlyLearningGoal, 
  ElementaryMonthlyLearningObjective,
  ElementaryMonthlyCurriculumDoc
} from '../../../../types/elementaryMonthlyReport';
import { ELEMENTARY_DEFAULT_SUBJECT_TEMPLATES } from '../../../../types/elementaryMonthlyReport';
import { toast } from 'sonner';

interface CurriculumStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: ElementaryMonthlySubject[];
  onSave: (updatedSubjects: ElementaryMonthlySubject[]) => Promise<void>;
  className: string;
  monthLabel: string;
}

export const CurriculumStructureModal: React.FC<CurriculumStructureModalProps> = ({
  isOpen,
  onClose,
  subjects: initialSubjects,
  onSave,
  className,
  monthLabel
}) => {
  const [subjects, setSubjects] = React.useState<ElementaryMonthlySubject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      // Clone subjects deeply
      const cloned = JSON.parse(JSON.stringify(initialSubjects || []));
      setSubjects(cloned);
      if (cloned.length > 0) {
        setActiveSubjectId(cloned[0].id);
      } else {
        setActiveSubjectId('');
      }
    }
  }, [isOpen, initialSubjects]);

  if (!isOpen) return null;

  const currentSubject = subjects.find(s => s.id === activeSubjectId) || subjects[0];

  const handleAddSubject = (nameInput?: string) => {
    const name = nameInput || prompt('Masukkan nama pelajaran baru:');
    if (!name || !name.trim()) return;
    const newId = `subj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSubj: ElementaryMonthlySubject = {
      id: newId,
      name: name.trim(),
      kkm: 70,
      order: subjects.length,
      learningGoals: [
        {
          id: `lg_${Date.now()}_1`,
          code: 'LG 1',
          title: 'Learning Goal 1',
          order: 0,
          learningObjectives: [
            {
              id: `lo_${Date.now()}_1_1`,
              code: 'LO 1.1',
              title: 'Learning Objective 1',
              order: 0
            }
          ]
        }
      ]
    };
    const next = [...subjects, newSubj];
    setSubjects(next);
    setActiveSubjectId(newId);
  };

  const handleLoadDefaults = () => {
    if (subjects.length > 0 && !window.confirm('Muat templat standar? Pelajaran yang belum disimpan akan digabungkan.')) {
      return;
    }
    const templates: ElementaryMonthlySubject[] = ELEMENTARY_DEFAULT_SUBJECT_TEMPLATES.map((name, idx) => ({
      id: `subj_default_${idx}_${Date.now()}`,
      name,
      kkm: 70,
      order: subjects.length + idx,
      learningGoals: [
        {
          id: `lg_def_${idx}_1_${Date.now()}`,
          code: 'LG 1',
          title: `Tujuan Pembelajaran ${name}`,
          order: 0,
          learningObjectives: [
            {
              id: `lo_def_${idx}_1_1_${Date.now()}`,
              code: 'LO 1.1',
              title: `Indikator / Capaian LO 1`,
              order: 0
            }
          ]
        }
      ]
    }));
    const next = [...subjects, ...templates];
    setSubjects(next);
    if (!activeSubjectId && next.length > 0) {
      setActiveSubjectId(next[0].id);
    }
    toast.success('Templat pelajaran berhasil ditambahkan.');
  };

  const handleDeleteSubject = (subjId: string) => {
    const subj = subjects.find(s => s.id === subjId);
    if (!window.confirm(`Hapus pelajaran "${subj?.name || ''}" beserta semua LG dan LO di dalamnya?`)) return;
    const next = subjects.filter(s => s.id !== subjId);
    setSubjects(next);
    if (activeSubjectId === subjId) {
      setActiveSubjectId(next[0]?.id || '');
    }
  };

  const handleMoveSubject = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subjects.length) return;
    const copy = [...subjects];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    // update order
    copy.forEach((s, idx) => { s.order = idx; });
    setSubjects(copy);
  };

  // LG Actions
  const handleAddLG = () => {
    if (!currentSubject) return;
    const lgNum = (currentSubject.learningGoals || []).length + 1;
    const newLG: ElementaryMonthlyLearningGoal = {
      id: `lg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: `LG ${lgNum}`,
      title: `Learning Goal ${lgNum}`,
      order: lgNum - 1,
      learningObjectives: [
        {
          id: `lo_${Date.now()}_${lgNum}_1`,
          code: `LO ${lgNum}.1`,
          title: `Learning Objective ${lgNum}.1`,
          order: 0
        }
      ]
    };
    setSubjects(prev => prev.map(s => {
      if (s.id !== currentSubject.id) return s;
      return {
        ...s,
        learningGoals: [...(s.learningGoals || []), newLG]
      };
    }));
  };

  const handleDeleteLG = (lgId: string) => {
    if (!currentSubject) return;
    if (!window.confirm('Hapus Learning Goal ini beserta seluruh LO di dalamnya?')) return;
    setSubjects(prev => prev.map(s => {
      if (s.id !== currentSubject.id) return s;
      const filtered = (s.learningGoals || []).filter(lg => lg.id !== lgId);
      filtered.forEach((lg, idx) => { lg.order = idx; });
      return { ...s, learningGoals: filtered };
    }));
  };

  // LO Actions
  const handleAddLO = (lgId: string) => {
    if (!currentSubject) return;
    setSubjects(prev => prev.map(s => {
      if (s.id !== currentSubject.id) return s;
      return {
        ...s,
        learningGoals: (s.learningGoals || []).map(lg => {
          if (lg.id !== lgId) return lg;
          const loNum = (lg.learningObjectives || []).length + 1;
          const newLO: ElementaryMonthlyLearningObjective = {
            id: `lo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            code: `${lg.code || 'LO'}.${loNum}`,
            title: `Learning Objective ${loNum}`,
            order: loNum - 1
          };
          return {
            ...lg,
            learningObjectives: [...(lg.learningObjectives || []), newLO]
          };
        })
      };
    }));
  };

  const handleDeleteLO = (lgId: string, loId: string) => {
    if (!currentSubject) return;
    setSubjects(prev => prev.map(s => {
      if (s.id !== currentSubject.id) return s;
      return {
        ...s,
        learningGoals: (s.learningGoals || []).map(lg => {
          if (lg.id !== lgId) return lg;
          const filtered = (lg.learningObjectives || []).filter(lo => lo.id !== loId);
          filtered.forEach((lo, idx) => { lo.order = idx; });
          return { ...lg, learningObjectives: filtered };
        })
      };
    }));
  };

  const handleSaveAll = async () => {
    // Validate
    if (subjects.length === 0) {
      toast.warning('Tambahkan minimal 1 pelajaran.');
      return;
    }

    for (const sub of subjects) {
      if (!sub.name.trim()) {
        toast.warning('Nama pelajaran tidak boleh kosong.');
        return;
      }
      if (typeof sub.kkm !== 'number' || sub.kkm <= 0 || sub.kkm >= 100) {
        toast.warning(`KKM untuk "${sub.name}" harus antara 1 dan 99 (0 < K < 100).`);
        return;
      }
      for (const lg of sub.learningGoals || []) {
        if (!lg.title.trim()) {
          toast.warning(`Judul Learning Goal di "${sub.name}" tidak boleh kosong.`);
          return;
        }
        if (lg.kkmOverride !== undefined && (lg.kkmOverride <= 0 || lg.kkmOverride >= 100)) {
          toast.warning(`KKM override pada ${lg.code} harus antara 1 dan 99.`);
          return;
        }
        if (!lg.learningObjectives || lg.learningObjectives.length === 0) {
          toast.warning(`Setiap LG harus memiliki minimal 1 LO. Periksa ${lg.code} di ${sub.name}.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      await onSave(subjects);
      toast.success('Struktur Pelajaran, LG, dan LO berhasil disimpan!');
      onClose();
    } catch (err: any) {
      toast.error('Gagal menyimpan struktur kurikulum: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <header className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Settings2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Kelola Pelajaran, LG & LO</h2>
              <p className="text-xs text-slate-500">
                Kelas: <span className="font-semibold text-slate-700">{className}</span> · Bulan: <span className="font-semibold text-slate-700">{monthLabel}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr]">
          {/* Left: Subjects List */}
          <div className="border-r border-slate-200 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Daftar Pelajaran</span>
              <button
                type="button"
                onClick={() => handleAddSubject()}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>

            {subjects.length === 0 ? (
              <div className="p-4 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-2">
                <p className="text-xs text-slate-500">Belum ada pelajaran terdaftar.</p>
                <button
                  type="button"
                  onClick={handleLoadDefaults}
                  className="w-full text-xs font-semibold py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Muat Templat Standar
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {subjects.map((sub, idx) => {
                  const isActive = sub.id === currentSubject?.id;
                  const lgCount = (sub.learningGoals || []).length;
                  const loCount = (sub.learningGoals || []).reduce((acc, lg) => acc + (lg.learningObjectives?.length || 0), 0);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => setActiveSubjectId(sub.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between group ${
                        isActive 
                          ? 'bg-emerald-50/80 border-emerald-300 shadow-xs' 
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-semibold text-slate-800 truncate">{sub.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>KKM: {sub.kkm ?? 70}</span>
                          <span>·</span>
                          <span>{lgCount} LG, {loCount} LO</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => { e.stopPropagation(); handleMoveSubject(idx, 'UP'); }}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                          title="Naikkan urutan"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === subjects.length - 1}
                          onClick={(e) => { e.stopPropagation(); handleMoveSubject(idx, 'DOWN'); }}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                          title="Turunkan urutan"
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteSubject(sub.id); }}
                          className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                          title="Hapus Pelajaran"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {subjects.length > 0 && (
              <button
                type="button"
                onClick={handleLoadDefaults}
                className="w-full text-[11px] font-medium py-1.5 px-2 bg-slate-200/60 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer text-center"
              >
                + Tambah dari Templat Standar
              </button>
            )}
          </div>

          {/* Right: Selected Subject Details (Name, KKM, LGs, LOs) */}
          <div className="p-5 overflow-y-auto space-y-6">
            {!currentSubject ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Pilih atau buat pelajaran di sebelah kiri.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Subject Settings Header */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Nama Pelajaran
                    </label>
                    <input
                      type="text"
                      value={currentSubject.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSubjects(prev => prev.map(s => s.id === currentSubject.id ? { ...s, name: val } : s));
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      placeholder="Contoh: Mathematics, Bahasa Indonesia"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      KKM / KKTP Standar (0 &lt; K &lt; 100)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={currentSubject.kkm ?? 70}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 70;
                        setSubjects(prev => prev.map(s => s.id === currentSubject.id ? { ...s, kkm: val } : s));
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Batas A = K + (100-K)/2 = {((currentSubject.kkm ?? 70) + (100 - (currentSubject.kkm ?? 70)) / 2).toFixed(1)}
                    </p>
                  </div>
                </div>

                {/* LG and LO Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-emerald-700" />
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Learning Goals (LG) &amp; Learning Objectives (LO)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddLG}
                      className="text-xs font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus size={14} /> Tambah LG
                    </button>
                  </div>

                  {(currentSubject.learningGoals || []).length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs">
                      Belum ada Learning Goal pada pelajaran ini. Klik &quot;Tambah LG&quot; di atas.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {currentSubject.learningGoals.map((lg, lgIdx) => (
                        <div
                          key={lg.id}
                          className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-3"
                        >
                          {/* LG Title & Code */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                              <input
                                type="text"
                                value={lg.code}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSubjects(prev => prev.map(s => s.id === currentSubject.id ? {
                                    ...s,
                                    learningGoals: s.learningGoals.map(g => g.id === lg.id ? { ...g, code: val } : g)
                                  } : s));
                                }}
                                className="w-20 text-xs font-bold px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-center"
                                placeholder="LG 1"
                              />
                              <input
                                type="text"
                                value={lg.title}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSubjects(prev => prev.map(s => s.id === currentSubject.id ? {
                                    ...s,
                                    learningGoals: s.learningGoals.map(g => g.id === lg.id ? { ...g, title: val } : g)
                                  } : s));
                                }}
                                className="flex-1 text-xs font-semibold px-3 py-1 border border-slate-300 rounded-lg bg-white"
                                placeholder="Deskripsi Learning Goal..."
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Optional KKM Override */}
                              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <span className="text-[11px] text-slate-400">KKM Override:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={lg.kkmOverride !== undefined ? lg.kkmOverride : ''}
                                  placeholder="Default"
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                    setSubjects(prev => prev.map(s => s.id === currentSubject.id ? {
                                      ...s,
                                      learningGoals: s.learningGoals.map(g => g.id === lg.id ? { ...g, kkmOverride: val } : g)
                                    } : s));
                                  }}
                                  className="w-16 text-xs px-2 py-1 border border-slate-300 rounded-lg text-center"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteLG(lg.id)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer transition-colors"
                                title="Hapus LG"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          {/* LOs under this LG */}
                          <div className="pl-2 sm:pl-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                Indikator / Learning Objectives ({lg.learningObjectives?.length || 0})
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddLO(lg.id)}
                                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={12} /> Tambah LO
                              </button>
                            </div>

                            <div className="space-y-1.5">
                              {(lg.learningObjectives || []).map((lo) => (
                                <div key={lo.id} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={lo.code}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setSubjects(prev => prev.map(s => s.id === currentSubject.id ? {
                                        ...s,
                                        learningGoals: s.learningGoals.map(g => g.id === lg.id ? {
                                          ...g,
                                          learningObjectives: g.learningObjectives.map(o => o.id === lo.id ? { ...o, code: val } : o)
                                        } : g)
                                      } : s));
                                    }}
                                    className="w-16 text-xs font-bold px-2 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-center shrink-0"
                                    placeholder="LO 1.1"
                                  />
                                  <input
                                    type="text"
                                    value={lo.title}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setSubjects(prev => prev.map(s => s.id === currentSubject.id ? {
                                        ...s,
                                        learningGoals: s.learningGoals.map(g => g.id === lg.id ? {
                                          ...g,
                                          learningObjectives: g.learningObjectives.map(o => o.id === lo.id ? { ...o, title: val } : o)
                                        } : g)
                                      } : s));
                                    }}
                                    className="flex-1 text-xs px-3 py-1 border border-slate-200 rounded-lg bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                                    placeholder="Deskripsi LO..."
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLO(lg.id, lo.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                                    title="Hapus LO"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <footer className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="text-xs text-slate-500">
            Pastikan setiap pelajaran memiliki minimal 1 LG dan 1 LO untuk dapat dinilai.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              {saving ? 'Menyimpan...' : 'Simpan Struktur Kurikulum'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
