import * as React from 'react';
import { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, ArrowUp, ArrowDown, Target, BookOpen } from 'lucide-react';
import { JHAssessmentLO, LearningGoal } from '../../../../types';
import { saveLO, softDeleteLO } from '../../../../services/juniorHighAssessmentBookService';
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
  onRefresh
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // Form for adding new LO
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');

  React.useEffect(() => {
    // Propose default code e.g. "LO 1", "LO 2"
    if (isOpen) {
      const nextNum = los.length + 1;
      setNewCode(`LO ${nextNum}`);
      setNewTitle('');
      setEditingId(null);
    }
  }, [isOpen, los.length]);

  if (!isOpen) return null;

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
    setSaving(true);
    try {
      await saveLO({
        lgId: lg.id,
        classId,
        subjectId,
        academicYear,
        semester,
        code: newCode.trim() || `LO ${los.length + 1}`,
        title: newTitle.trim(),
        order: los.length + 1,
        teacherId: teacherUid,
        teacherName
      });
      toast.success('Learning Objective berhasil ditambahkan.');
      setNewTitle('');
      setNewCode(`LO ${los.length + 2}`);
      onRefresh();
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
      toast.success('LO berhasil diperbarui.');
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
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${loCode}? Data asesmen formatif terkait LO ini di grid akan terlepas.`)) {
      return;
    }
    setSaving(true);
    try {
      await softDeleteLO(loId);
      toast.success(`${loCode} berhasil dihapus.`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menghapus LO: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

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
              <h2 className="text-base font-bold text-gray-900">Kelola Learning Objectives (LO)</h2>
              <p className="text-xs text-gray-500">
                Tangga capaian formatif untuk LG: <span className="font-semibold text-gray-700">{lg.code || 'LG'} - {lg.goalText?.slice(0, 50)}...</span>
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
              <Plus size={14} /> Tambah Learning Objective Baru
            </h3>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Tuliskan tujuan spesifik pertemuan (misal: Menjelaskan tahapan siklus air)..."
                    className="flex-1 text-xs px-3 py-2 border border-purple-200 bg-white rounded-xl focus:ring-2 focus:ring-purple-400"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Plus size={14} /> Simpan
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Daftar LO yang sudah ada */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Daftar LO Aktif ({los.length})
              </h3>
              <span className="text-[11px] text-gray-400">Urutan akan muncul di kolom formatif</span>
            </div>

            {los.length === 0 ? (
              <div className="text-center py-8 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                <Target size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs font-semibold text-gray-600">Belum ada Learning Objective (LO)</p>
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
                          title="Simpan"
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
                          <button
                            onClick={() => handleStartEdit(lo)}
                            className="p-1.5 text-slate-400 hover:text-purple-700 rounded-lg hover:bg-purple-50 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-400"
                            title="Edit LO"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(lo.id, lo.code)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-rose-400"
                            title="Hapus LO"
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
    </div>
  );
}
