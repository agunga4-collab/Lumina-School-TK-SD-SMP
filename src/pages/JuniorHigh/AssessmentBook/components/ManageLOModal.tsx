import * as React from 'react';
import { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, Target, Copy, CheckSquare, Square, Layers, AlertCircle } from 'lucide-react';
import { JHAssessmentLO, LearningGoal, Class } from '../../../../types';
import {
  saveLO,
  softDeleteLO,
  saveLOMultiClass,
  getLGGrades,
  getLOsForLG
} from '../../../../services/juniorHighAssessmentBookService';
import { getJHGradeLevelNumber } from '../../../../services/juniorHighMidtermService';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lg: LearningGoal;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  los: JHAssessmentLO[];
  teacherUid: string;
  teacherName: string;
  onRefresh: () => void;
  classes?: Class[];
  isUAMode?: boolean;
}

export function ManageLOModal({
  isOpen,
  onClose,
  lg,
  classId,
  subjectId,
  academicYear,
  semester,
  los,
  teacherUid,
  teacherName,
  onRefresh,
  classes = [],
  isUAMode = false
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // Form for adding new LO
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([classId]);

  // Modal / panel state for copying an existing LO to other classes
  const [copyingLO, setCopyingLO] = useState<JHAssessmentLO | null>(null);
  const [copyTargetClassIds, setCopyTargetClassIds] = useState<string[]>([]);
  const [isCopying, setIsCopying] = useState(false);

  // Compute eligible classes matching this LG's grade(s) and academic year
  const eligibleClasses = React.useMemo(() => {
    if (isUAMode || !classes || classes.length === 0) return [];
    const lgGrades = getLGGrades(lg);
    return classes.filter(cls => {
      const isJH = !cls.unitId || cls.unitId === 'JUNIOR_HIGH';
      if (!isJH) return false;
      if (cls.academicYear && academicYear && cls.academicYear !== academicYear) return false;
      if (lgGrades.length === 0) return true;
      const gNum = getJHGradeLevelNumber(cls);
      const clsGrade = gNum ? String(gNum) : String(cls.grade || cls.gradeLevel || '').trim();
      return lgGrades.includes(clsGrade);
    });
  }, [classes, lg, isUAMode, academicYear]);

  React.useEffect(() => {
    if (isOpen) {
      const nextNum = los.length + 1;
      setNewCode(`LO ${nextNum}`);
      setNewTitle('');
      setEditingId(null);
      setSelectedClassIds([classId]);
      setCopyingLO(null);
      setCopyTargetClassIds([]);
    }
  }, [isOpen, los.length, classId]);

  if (!isOpen) return null;

  const currentClassName = eligibleClasses.find(c => c.id === classId)?.name || 'Kelas Ini';
  const lgGradesList = getLGGrades(lg);

  const toggleClassSelect = (cid: string) => {
    setSelectedClassIds(prev => 
      prev.includes(cid) ? prev.filter(id => id !== cid) : [...prev, cid]
    );
  };

  const handleSelectAllClasses = () => {
    if (selectedClassIds.length === eligibleClasses.length) {
      setSelectedClassIds([classId]);
    } else {
      setSelectedClassIds(eligibleClasses.map(c => c.id));
    }
  };

  const handleAddNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !subjectId.trim()) {
      toast.warning('Mata pelajaran tidak boleh kosong');
      return;
    }
    if (!newTitle.trim()) {
      toast.warning('Tuliskan deskripsi Learning Objective (LO)');
      return;
    }
    if (selectedClassIds.length === 0) {
      toast.warning('Pilih minimal satu kelas penerima LO.');
      return;
    }

        setSaving(true);
    try {
      if (isUAMode) {
        if (!lg.id || !classId) {
          toast.error('LG atau kelompok Unit Aktivitas belum dipilih.');
          return;
        }

        const existing = await getLOsForLG({
          lgId: lg.id,
          classId,
          subjectId,
          academicYear,
          semester,
          isUAMode: true
        });

        const titleClean = newTitle.trim();
        const duplicate = existing.find(
          lo => lo.title.trim().toLowerCase() === titleClean.toLowerCase()
        );

        if (duplicate) {
          toast.info(
            `LO dengan deskripsi serupa sudah ada (${duplicate.code}).`
          );
          return;
        }

        const nextOrder =
          existing.reduce(
            (max, lo) => Math.max(max, lo.order || 0),
            0
          ) + 1;

        const usedCodes = new Set(
          existing.map(lo => lo.code.trim().toLowerCase())
        );

        let targetCode = newCode.trim() || `LO ${nextOrder}`;
        let codeNumber = nextOrder;

        while (usedCodes.has(targetCode.toLowerCase())) {
          targetCode = `LO ${codeNumber++}`;
        }

        await saveLO({
          lgId: lg.id,
          classId,
          subjectId,
          academicYear,
          semester,
          code: targetCode,
          title: titleClean,
          order: nextOrder,
          teacherId: teacherUid,
          teacherName
        });

        toast.success(
          'Learning Objective Unit Aktivitas berhasil ditambahkan.'
        );
        setNewTitle('');
        setNewCode(`LO ${nextOrder + 1}`);
        onRefresh();
        return;
      }

      const res = await saveLOMultiClass({
        lgId: lg.id,
        targetClassIds: selectedClassIds,
        subjectId,
        academicYear,
        semester,
        code: newCode.trim() || `LO ${los.length + 1}`,
        title: newTitle.trim(),
        teacherId: teacherUid,
        teacherName
      });

      const getCName = (cid: string) =>
        eligibleClasses.find(c => c.id === cid)?.name || cid;

      if (res.successClasses.length > 0) {
        if (
          res.successClasses.length === 1 &&
          res.successClasses[0] === classId
        ) {
          toast.success('Learning Objective berhasil ditambahkan.');
        } else {
          toast.success(
            `LO berhasil dibuat pada ${res.successClasses.length} kelas: ${res.successClasses.map(getCName).join(', ')}`
          );
        }
      }

      if (res.skippedClasses.length > 0) {
        toast.info(
          `Dilewati: ${res.skippedClasses.map(s => `${getCName(s.classId)} (${s.reason})`).join(', ')}`
        );
      }

      if (res.failedClasses.length > 0) {
        toast.error(
          `Gagal pada: ${res.failedClasses.map(f => `${getCName(f.classId)}: ${f.error}`).join(', ')}`
        );
      }

      if (res.successClasses.length > 0) {
        setNewTitle('');
        setNewCode(`LO ${los.length + 2}`);
        setSelectedClassIds([classId]);
        onRefresh();
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menambahkan LO: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (lo: JHAssessmentLO) => {
    setEditingId(lo.id);
    setCode(lo.code);
    setTitle(lo.title);
  };

  const handleSaveEdit = async (loId: string, currentOrder: number) => {
    if (!subjectId || !subjectId.trim()) {
      toast.warning('Mata pelajaran tidak boleh kosong');
      return;
    }
    if (!title.trim()) {
      toast.warning('Deskripsi LO tidak boleh kosong');
      return;
    }
    setSaving(true);
    try {
      // Independent edit: only updates this LO document in the current class!
      await saveLO({
        id: loId,
        lgId: lg.id,
        classId,
        subjectId,
        academicYear,
        semester,
        code: code.trim(),
        title: title.trim(),
        order: currentOrder,
        teacherId: teacherUid,
        teacherName
      });
      toast.success('LO berhasil diperbarui untuk kelas ini.');
      setEditingId(null);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal memperbarui LO: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loId: string, loCode: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${loCode} di ${currentClassName}? Data di kelas lain tidak akan terpengaruh.`)) {
      return;
    }
    setSaving(true);
    try {
      // Independent delete: only soft deletes this LO in the current class!
      await softDeleteLO(loId);
      toast.success(`${loCode} berhasil dihapus dari ${currentClassName}.`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menghapus LO: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const openCopyModal = (lo: JHAssessmentLO) => {
    setCopyingLO(lo);
    // Default: select other eligible classes (exclude current class)
    const otherClasses = eligibleClasses.filter(c => c.id !== classId);
    setCopyTargetClassIds(otherClasses.map(c => c.id));
  };

  const handleExecuteCopy = async () => {
    if (!copyingLO) return;
    if (copyTargetClassIds.length === 0) {
      toast.warning('Pilih minimal satu kelas tujuan.');
      return;
    }

    setIsCopying(true);
    try {
      const res = await saveLOMultiClass({
        lgId: lg.id,
        targetClassIds: copyTargetClassIds,
        subjectId,
        academicYear,
        semester,
        code: copyingLO.code,
        title: copyingLO.title,
        teacherId: teacherUid,
        teacherName
      });

      const getCName = (cid: string) => eligibleClasses.find(c => c.id === cid)?.name || cid;

      if (res.successClasses.length > 0) {
        toast.success(`LO "${copyingLO.code}" berhasil disalin ke: ${res.successClasses.map(getCName).join(', ')}`);
      }
      if (res.skippedClasses.length > 0) {
        toast.info(`Dilewati: ${res.skippedClasses.map(s => `${getCName(s.classId)} (${s.reason})`).join(', ')}`);
      }
      if (res.failedClasses.length > 0) {
        toast.error(`Gagal pada: ${res.failedClasses.map(f => `${getCName(f.classId)}: ${f.error}`).join(', ')}`);
      }

      setCopyingLO(null);
      setCopyTargetClassIds([]);
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyalin LO: ' + (err.message || 'Error'));
    } finally {
      setIsCopying(false);
    }
  };

  const otherEligibleClasses = eligibleClasses.filter(c => c.id !== classId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <Target size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">Kelola Learning Objectives (LO)</h2>
                {lgGradesList.length > 1 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-700 tracking-wider">
                    Multi-Grade: Kelas {lgGradesList.join(', ')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Kelas aktif: <span className="font-semibold text-gray-700">{currentClassName}</span> · LG: <span className="font-semibold text-gray-700">{lg.code || 'LG'} - {lg.goalText?.slice(0, 45)}...</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Form Tambah LO Baru */}
          <form onSubmit={handleAddNew} className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                <Plus size={14} /> Tambah Learning Objective Baru
              </h3>
              {eligibleClasses.length > 1 && (
                <span className="text-[11px] font-medium text-purple-700">
                  Dapat dibuat sekaligus ke beberapa kelas
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <div className="md:col-span-1">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Kode LO</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  placeholder="e.g. LO 1"
                  className="w-full text-xs px-3 py-2 border border-purple-200 bg-white rounded-xl focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Deskripsi Indikator / Kompetensi (LO)</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Tuliskan tujuan spesifik pertemuan (misal: Menjelaskan tahapan siklus air)..."
                  className="w-full text-xs px-3 py-2 border border-purple-200 bg-white rounded-xl focus:ring-2 focus:ring-purple-400"
                />
              </div>
            </div>

            {/* Class Target Selector for Multi-Class */}
            {!isUAMode && eligibleClasses.length > 1 && (
              <div className="pt-2 border-t border-purple-100">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
                    <Layers size={13} />
                    Target Kelas Penerima:
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllClasses}
                    className="text-[10px] font-bold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
                  >
                    {selectedClassIds.length === eligibleClasses.length ? 'Pilih Hanya Kelas Ini' : `Pilih Semua (${eligibleClasses.length} Kelas)`}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {eligibleClasses.map(cls => {
                    const isChecked = selectedClassIds.includes(cls.id);
                    const isCurrent = cls.id === classId;
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => toggleClassSelect(cls.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
                        }`}
                      >
                        {isChecked ? <CheckSquare size={13} /> : <Square size={13} />}
                        <span>{cls.name}</span>
                        {isCurrent && (
                          <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                            isChecked ? 'bg-purple-800 text-purple-100' : 'bg-gray-100 text-gray-500'
                          }`}>
                            Aktif
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  LO akan dibuatkan dokumen mandiri di setiap kelas terpilih. Setelah dibuat, tiap kelas dapat mengedit secara independen.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Plus size={14} />
                {saving ? 'Menyimpan...' : selectedClassIds.length > 1 ? `Simpan ke ${selectedClassIds.length} Kelas` : 'Simpan LO'}
              </button>
            </div>
          </form>

          {/* Daftar LO yang sudah ada */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Daftar LO Aktif di {currentClassName} ({los.length})
              </h3>
              <span className="text-[11px] text-gray-400">Urutan akan muncul di kolom formatif</span>
            </div>

            {los.length === 0 ? (
              <div className="text-center py-8 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                <Target size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs font-semibold text-gray-600">Belum ada Learning Objective (LO) untuk kelas ini</p>
                <p className="text-[11px] text-gray-400 mt-1 max-w-sm mx-auto">
                  Tambahkan minimal 1 LO sebagai indikator formatif harian sebelum mengisi nilai siswa.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {los.map((lo, idx) => (
                  <div key={lo.id} className="p-3.5 flex items-center gap-3 hover:bg-slate-50/70 transition-colors">
                    <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>

                    {editingId === lo.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={code}
                          onChange={e => setCode(e.target.value)}
                          className="w-24 text-xs px-2.5 py-1.5 border border-purple-300 rounded-lg bg-white"
                        />
                        <input
                          type="text"
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          className="flex-1 text-xs px-2.5 py-1.5 border border-purple-300 rounded-lg bg-white"
                        />
                        <button
                          onClick={() => handleSaveEdit(lo.id, lo.order)}
                          disabled={saving}
                          className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500"
                          title="Simpan perbaikan untuk kelas ini"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-slate-400"
                          title="Batal"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="shrink-0">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            {lo.code}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate" title={lo.title}>
                            {lo.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Tombol Salin ke kelas lain */}
                          {!isUAMode && otherEligibleClasses.length > 0 && (
                            <button
                              onClick={() => openCopyModal(lo)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                              title="Salin definisi LO ini ke kelas lain"
                            >
                              <Copy size={12} />
                              <span>Salin ke Kelas Lain</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleStartEdit(lo)}
                            className="p-1.5 text-slate-400 hover:text-purple-700 rounded-lg hover:bg-purple-50 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-400"
                            title="Edit LO kelas ini secara independen"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(lo.id, lo.code)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-rose-400"
                            title="Hapus LO kelas ini"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            Selesai
          </button>
        </div>
      </div>

      {/* Modal / Dialog Salin LO ke Kelas Lain */}
      {copyingLO && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Copy size={16} className="text-indigo-600" />
                  Salin LO ke Kelas Lain
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Salin definisi LO ke kelas tujuan secara independen.
                </p>
              </div>
              <button
                onClick={() => setCopyingLO(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-1">
              <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">
                Definisi yang disalin:
              </span>
              <p className="text-xs font-bold text-gray-900">
                {copyingLO.code}: {copyingLO.title}
              </p>
              <p className="text-[10px] text-gray-500">
                * Siswa, tugas, nilai formatif, dan riwayat tidak disalin. Urutan LO di kelas tujuan akan ditambahkan di akhir.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                Pilih Kelas Tujuan:
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {otherEligibleClasses.map(cls => {
                  const isChecked = copyTargetClassIds.includes(cls.id);
                  return (
                    <label
                      key={cls.id}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                          : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setCopyTargetClassIds(prev =>
                            prev.includes(cls.id)
                              ? prev.filter(id => id !== cls.id)
                              : [...prev, cls.id]
                          );
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs">{cls.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCopyingLO(null)}
                className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isCopying || copyTargetClassIds.length === 0}
                onClick={handleExecuteCopy}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Copy size={13} />
                {isCopying ? 'Menyalin...' : `Salin ke ${copyTargetClassIds.length} Kelas`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
