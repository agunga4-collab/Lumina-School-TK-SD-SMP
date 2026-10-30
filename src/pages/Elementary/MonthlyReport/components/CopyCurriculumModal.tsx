import * as React from 'react';
import { X, Copy, AlertTriangle, Layers, BookOpen, Check } from 'lucide-react';
import type { Class } from '../../../../types';
import type { ElementaryMonthlyCurriculumDoc } from '../../../../types/elementaryMonthlyReport';
import { 
  fetchElementaryMonthlyCurriculum, 
  copyElementaryMonthlyCurriculum,
  formatMonthLabel,
  getMonthOptionsForAcademicYear
} from '../../../../services/elementaryMonthlyReportService';
import { toast } from 'sonner';

interface CopyCurriculumModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetClass: Class | null;
  targetYear: string;
  targetSemester: string;
  targetMonth: string;
  availableClasses: Class[];
  currentUser: any;
  onCopied: () => Promise<void>;
}

export const CopyCurriculumModal: React.FC<CopyCurriculumModalProps> = ({
  isOpen,
  onClose,
  targetClass,
  targetYear,
  targetSemester,
  targetMonth,
  availableClasses,
  currentUser,
  onCopied
}) => {
  const [sourceClassId, setSourceClassId] = React.useState<string>('');
  const [sourceYear, setSourceYear] = React.useState<string>(targetYear);
  const [sourceSemester, setSourceSemester] = React.useState<string>(targetSemester);
  const [sourceMonth, setSourceMonth] = React.useState<string>('');
  const [loadingPreview, setLoadingPreview] = React.useState<boolean>(false);
  const [sourceCurriculum, setSourceCurriculum] = React.useState<ElementaryMonthlyCurriculumDoc | null>(null);
  const [saving, setSaving] = React.useState<boolean>(false);

  // Filter classes of the same grade or all elementary grade 1-3
  const targetGrade = targetClass?.grade || 1;
  const sameGradeClasses = React.useMemo(() => {
    return availableClasses.filter(c => (c.grade || 1) === targetGrade);
  }, [availableClasses, targetGrade]);

  const sourceMonths = React.useMemo(() => {
    return getMonthOptionsForAcademicYear(sourceYear, sourceSemester);
  }, [sourceYear, sourceSemester]);

  React.useEffect(() => {
    if (isOpen) {
      setSourceClassId(targetClass?.id || '');
      setSourceYear(targetYear);
      setSourceSemester(targetSemester);
      // Pick a previous or different month if available
      const otherMonths = sourceMonths.filter(m => m.value !== targetMonth);
      setSourceMonth(otherMonths[0]?.value || targetMonth);
    }
  }, [isOpen, targetClass, targetYear, targetSemester, targetMonth, sourceMonths]);

  // Load preview of source curriculum
  React.useEffect(() => {
    if (!isOpen || !sourceClassId || !sourceYear || !sourceSemester || !sourceMonth) {
      setSourceCurriculum(null);
      return;
    }

    // Do not copy from exact same class & month
    if (sourceClassId === targetClass?.id && sourceMonth === targetMonth && sourceYear === targetYear && sourceSemester === targetSemester) {
      setSourceCurriculum(null);
      return;
    }

    let isCancelled = false;
    setLoadingPreview(true);
    fetchElementaryMonthlyCurriculum(sourceClassId, sourceYear, sourceSemester, sourceMonth)
      .then(res => {
        if (!isCancelled) {
          setSourceCurriculum(res);
        }
      })
      .catch(err => {
        if (!isCancelled) {
          console.error("Error loading source curriculum:", err);
          setSourceCurriculum(null);
        }
      })
      .finally(() => {
        if (!isCancelled) setLoadingPreview(false);
      });

    return () => { isCancelled = true; };
  }, [isOpen, sourceClassId, sourceYear, sourceSemester, sourceMonth, targetClass?.id, targetMonth, targetYear, targetSemester]);

  if (!isOpen || !targetClass) return null;

  const handleExecuteCopy = async () => {
    if (!sourceCurriculum || !sourceCurriculum.subjects || sourceCurriculum.subjects.length === 0) {
      toast.warning('Sumber kurikulum yang dipilih tidak memiliki pelajaran atau data.');
      return;
    }

    const confirmMsg = `Salin struktur kurikulum (${sourceCurriculum.subjects.length} Pelajaran) ke ${targetClass.name} untuk bulan ${formatMonthLabel(targetMonth)}? Nilai siswa tidak ikut disalin.`;
    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    try {
      await copyElementaryMonthlyCurriculum({
        sourceCurriculum,
        targetClassId: targetClass.id,
        targetClassName: targetClass.name,
        targetGradeLevel: targetClass.grade || 1,
        targetAcademicYear: targetYear,
        targetSemester: targetSemester,
        targetMonth,
        user: currentUser
      });

      toast.success('Struktur kurikulum berhasil disalin ke kelas/bulan ini!');
      await onCopied();
      onClose();
    } catch (err: any) {
      toast.error('Gagal menyalin kurikulum: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const isExactSame = sourceClassId === targetClass.id && 
                      sourceMonth === targetMonth && 
                      sourceYear === targetYear && 
                      sourceSemester === targetSemester;

  const totalLGs = (sourceCurriculum?.subjects || []).reduce((acc, s) => acc + (s.learningGoals?.length || 0), 0);
  const totalLOs = (sourceCurriculum?.subjects || []).reduce(
    (acc, s) => acc + (s.learningGoals || []).reduce((lgAcc, lg) => lgAcc + (lg.learningObjectives?.length || 0), 0), 
    0
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
        <header className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Copy size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Salin Struktur Kurikulum (Bank LG)</h2>
              <p className="text-xs text-slate-500">
                Tujuan: {targetClass.name} · {formatMonthLabel(targetMonth)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 leading-relaxed">
            Pilih kelas dan bulan sumber untuk menyalin struktur Pelajaran, Learning Goals, dan Learning Objectives. <strong>Nilai siswa tidak ikut disalin</strong>.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Kelas Sumber (Grade {targetGrade})
              </label>
              <select
                value={sourceClassId}
                onChange={(e) => setSourceClassId(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {sameGradeClasses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.id === targetClass.id ? '(Kelas Ini)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Bulan Sumber
              </label>
              <select
                value={sourceMonth}
                onChange={(e) => setSourceMonth(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {sourceMonths.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label} {m.value === targetMonth ? '(Bulan Ini)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Source Status & Preview */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Ringkasan Data Sumber
            </span>

            {isExactSame ? (
              <div className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                <AlertTriangle size={14} /> Pilih kelas atau bulan sumber yang berbeda dari tujuan.
              </div>
            ) : loadingPreview ? (
              <div className="text-xs text-slate-400 py-2">Memeriksa struktur sumber...</div>
            ) : !sourceCurriculum || !sourceCurriculum.subjects || sourceCurriculum.subjects.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">
                Tidak ada data kurikulum tersimpan pada sumber yang dipilih.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs font-bold text-slate-800">
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-teal-700">
                    {sourceCurriculum.subjects.length} Pelajaran
                  </span>
                  <span>·</span>
                  <span className="text-slate-600">{totalLGs} Learning Goals</span>
                  <span>·</span>
                  <span className="text-slate-600">{totalLOs} Objectives</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {sourceCurriculum.subjects.map(s => (
                    <span key={s.id} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                      {s.name} ({s.learningGoals?.length || 0} LG)
                    </span>
                  ))}
                </div>
              </div>
            )}
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
              type="button"
              onClick={handleExecuteCopy}
              disabled={saving || isExactSame || !sourceCurriculum || !sourceCurriculum.subjects?.length}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saving ? 'Menyalin...' : 'Konfirmasi & Salin Struktur'}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
};
