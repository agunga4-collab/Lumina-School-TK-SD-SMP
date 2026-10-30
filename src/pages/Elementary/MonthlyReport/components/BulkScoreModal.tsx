import * as React from 'react';
import { X, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import type { 
  ElementaryMonthlySubject, 
  ElementaryMonthlyLearningObjective,
  ElementaryMonthlyStudentScoreDoc 
} from '../../../../types/elementaryMonthlyReport';
import type { Student } from '../../../../types';
import { toast } from 'sonner';

interface BulkScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  subject: ElementaryMonthlySubject | null;
  existingScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  onApply: (params: {
    loId: string;
    score: number;
    onlyEmpty: boolean;
    targetStudentIds: string[];
  }) => Promise<void>;
}

export const BulkScoreModal: React.FC<BulkScoreModalProps> = ({
  isOpen,
  onClose,
  students,
  subject,
  existingScoresMap,
  onApply
}) => {
  const [selectedLoId, setSelectedLoId] = React.useState<string>('');
  const [scoreInput, setScoreInput] = React.useState<string>('80');
  const [onlyEmpty, setOnlyEmpty] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);

  // Flatten all LOs in this subject
  const allLOs = React.useMemo(() => {
    if (!subject) return [];
    const list: Array<{ lo: ElementaryMonthlyLearningObjective; lgCode: string; lgTitle: string }> = [];
    (subject.learningGoals || []).forEach(lg => {
      (lg.learningObjectives || []).forEach(lo => {
        list.push({ lo, lgCode: lg.code, lgTitle: lg.title });
      });
    });
    return list;
  }, [subject]);

  React.useEffect(() => {
    if (isOpen && allLOs.length > 0 && !selectedLoId) {
      setSelectedLoId(allLOs[0].lo.id);
    }
  }, [isOpen, allLOs, selectedLoId]);

  if (!isOpen || !subject) return null;

  const currentLoInfo = allLOs.find(item => item.lo.id === selectedLoId);

  // Compute affected students
  const affectedStudents = students.filter(student => {
    if (!selectedLoId) return false;
    const existingScore = existingScoresMap[student.id]?.scores?.[selectedLoId];
    if (onlyEmpty) {
      return existingScore === undefined || existingScore === null;
    }
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoId) {
      toast.warning('Pilih Learning Objective target.');
      return;
    }

    const num = parseFloat(scoreInput);
    if (isNaN(num) || num < 0 || num > 100) {
      toast.warning('Nilai harus berupa angka antara 0 dan 100.');
      return;
    }

    if (affectedStudents.length === 0) {
      toast.info('Tidak ada siswa yang memenuhi kriteria untuk dinilai.');
      return;
    }

    const confirmMsg = `Terapkan nilai ${num} pada ${currentLoInfo?.lo.code || 'LO'} untuk ${affectedStudents.length} siswa?${!onlyEmpty ? ' (Nilai lama akan ditimpa)' : ''}`;
    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    try {
      await onApply({
        loId: selectedLoId,
        score: num,
        onlyEmpty,
        targetStudentIds: affectedStudents.map(s => s.id)
      });
      toast.success(`Nilai massal berhasil diterapkan ke ${affectedStudents.length} siswa.`);
      onClose();
    } catch (err: any) {
      toast.error('Gagal menerapkan nilai massal: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
        <header className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Nilai Massal (Bulk Score)</h2>
              <p className="text-xs text-slate-500">Pelajaran: {subject.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Pilih Target Learning Objective (LO)
            </label>
            <select
              value={selectedLoId}
              onChange={(e) => setSelectedLoId(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
            >
              {allLOs.map(({ lo, lgCode }) => (
                <option key={lo.id} value={lo.id}>
                  {lgCode} · {lo.code} - {lo.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Nilai yang Ditetapkan (0 – 100)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              className="w-full text-sm font-bold px-3 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: 85"
              required
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Cakupan Siswa
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={onlyEmpty}
                  onChange={() => setOnlyEmpty(true)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Hanya untuk siswa yang <strong>belum memiliki nilai</strong> pada LO ini</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={!onlyEmpty}
                  onChange={() => setOnlyEmpty(false)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Terapkan ke <strong>seluruh siswa</strong> di kelas (timpa nilai yang ada)</span>
              </label>
            </div>
          </div>

          {/* Impact preview */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {affectedStudents.length} dari {students.length} siswa akan diberikan nilai {scoreInput || '0'}.
              </p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Rata-rata LG dan predikat capaian siswa akan dihitung ulang secara otomatis.
              </p>
            </div>
          </div>

          <footer className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !selectedLoId || affectedStudents.length === 0}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Menerapkan...' : `Terapkan ke ${affectedStudents.length} Siswa`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
