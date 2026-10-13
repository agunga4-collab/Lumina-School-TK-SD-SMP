import * as React from 'react';
import { useState, useEffect } from 'react';
import { X, Sparkles, Plus, AlertCircle, Edit3, GitBranch } from 'lucide-react';
import { proposeNewLG, updateTeacherOwnLG } from '../../../../services/juniorHighAssessmentBookService';
import { LearningGoal } from '../../../../types';
import { toast } from 'sonner';
import { cn } from '../../../../lib/utils';
import { getJHSubjectLabel } from '../../../../constants/juniorHighSubjectCatalog';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  grade: string;
  subject: string;
  academicYear: string;
  teacherId: string;
  teacherName: string;
  parentLG?: LearningGoal | null;
  existingLG?: LearningGoal | null;
  onSuccess: (newLGId: string) => void;
}

export function ProposeLGModal({
  isOpen,
  onClose,
  grade,
  subject,
  academicYear,
  teacherId,
  teacherName,
  parentLG,
  existingLG,
  onSuccess
}: Props) {
  const isEditMode = Boolean(existingLG);
  const isVersionMode = Boolean(parentLG);

  const [code, setCode] = useState('');
  const [strand, setStrand] = useState('Core Competency');
  const [goalText, setGoalText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (existingLG) {
        setCode(existingLG.code || '');
        setStrand(existingLG.strand || 'Core Competency');
        setGoalText(existingLG.goalText || '');
      } else if (parentLG) {
        setCode(parentLG.code || '');
        setStrand(parentLG.strand || 'Core Competency');
        setGoalText(parentLG.goalText || '');
      } else {
        setCode('');
        setStrand('Core Competency');
        setGoalText('');
      }
    }
  }, [isOpen, existingLG, parentLG]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !subject.trim()) {
      toast.warning('Pilih mata pelajaran terlebih dahulu');
      return;
    }
    if (!goalText.trim()) {
      toast.warning('Teks Tujuan Pembelajaran (LG) wajib diisi');
      return;
    }
    setSaving(true);
    try {
      if (isEditMode && existingLG) {
        // Edit di tempat untuk LG milik sendiri yang belum dipakai
        await updateTeacherOwnLG({
          goalId: existingLG.id,
          code: code.trim() || existingLG.code,
          goalText: goalText.trim(),
          strand: strand.trim() || 'Core Competency'
        });
        toast.success('Learning Goal berhasil diperbarui!');
        onSuccess(existingLG.id);
        onClose();
      } else if (isVersionMode && parentLG) {
        // Ajukan versi baru
        const nextVersion = (parentLG.version || 1) + 1;
        const newId = await proposeNewLG({
          code: code.trim() || parentLG.code,
          grade,
          subject,
          strand: strand.trim() || 'Core Competency',
          goalText: goalText.trim(),
          academicYear,
          teacherId,
          teacherName,
          parentGoalId: parentLG.id,
          version: nextVersion
        });
        toast.success(`Versi baru (v${nextVersion}) berhasil diajukan dan disimpan di Bank LG!`);
        onSuccess(newId);
        onClose();
      } else {
        // Ajukan LG baru
        const newId = await proposeNewLG({
          code: code.trim() || `LG-${Date.now().toString().slice(-4)}`,
          grade,
          subject,
          strand: strand.trim() || 'Core Competency',
          goalText: goalText.trim(),
          academicYear,
          teacherId,
          teacherName,
          version: 1
        });
        toast.success('Learning Goal usulan baru berhasil diajukan dan disimpan di Bank LG!');
        onSuccess(newId);
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal memproses LG: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "p-2 rounded-xl",
              isEditMode ? "bg-amber-100 text-amber-700" :
              isVersionMode ? "bg-indigo-100 text-indigo-700" :
              "bg-blue-100 text-blue-700"
            )}>
              {isEditMode ? <Edit3 size={20} /> : isVersionMode ? <GitBranch size={20} /> : <Sparkles size={20} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEditMode
                  ? 'Edit Learning Goal (Milik Sendiri)'
                  : isVersionMode
                  ? `Ajukan Versi Baru (v${(parentLG?.version || 1) + 1})`
                  : 'Usulkan Learning Goal (LG) Baru'}
              </h2>
              <p className="text-xs text-gray-500">Unit Junior High • {getJHSubjectLabel(subject)} (Grade {grade})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isVersionMode ? (
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-xs text-indigo-900 flex items-start gap-2">
              <GitBranch size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                Membuat versi baru dari <strong>{parentLG?.code}</strong>. Dokumen baru akan berstatus <strong>DRAFT</strong> dengan referensi ke LG induk hingga disetujui Head Unit / Super Admin.
              </div>
            </div>
          ) : isEditMode ? (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Edit3 size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                Mengubah rumusan LG milik Anda secara langsung karena LG ini belum memiliki entri asesmen.
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                LG baru yang diajukan akan langsung aktif untuk kelas Anda di Assessment Book dengan status <span className="font-bold">Menunggu Persetujuan</span> dari Head Unit / Super Admin.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Kode LG (Opsional)</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="misal: LG 1, LG 2"
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Strand / Kategori</label>
              <input
                type="text"
                value={strand}
                onChange={e => setStrand(e.target.value)}
                placeholder="misal: Aljabar, Ekologi"
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Rumusan Learning Goal (Capaian Pembelajaran) <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={goalText}
              onChange={e => setGoalText(e.target.value)}
              placeholder="Tuliskan rumusan tujuan pembelajaran sumatif secara komprehensif..."
              className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "px-4 py-2 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50",
                isEditMode ? "bg-amber-600 hover:bg-amber-700" :
                isVersionMode ? "bg-indigo-600 hover:bg-indigo-700" :
                "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {isEditMode ? <Edit3 size={14} /> : isVersionMode ? <GitBranch size={14} /> : <Plus size={14} />}
              {saving
                ? 'Menyimpan...'
                : isEditMode
                ? 'Simpan Perubahan'
                : isVersionMode
                ? 'Ajukan Versi Baru'
                : 'Ajukan LG Baru'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
