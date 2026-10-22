import * as React from 'react';
import { useState } from 'react';
import { X, Award, CheckCircle2, User, Save, Target, AlertCircle, Loader2 } from 'lucide-react';
import {
  AssessmentBookOptions,
  JHFormativeLevel,
  JHSummativeScore,
  JHAssessmentLO,
  JHSummativeEntry,
  isLegacyScore,
  LearningGoal,
  Student
} from '../../../../types';
import {
  formatDateWIB,
  getTodayWIB,
  saveSummativeEntry
} from '../../../../services/juniorHighAssessmentBookService';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  lg: LearningGoal;
  los: JHAssessmentLO[];
  loScores: Record<string, JHFormativeLevel | undefined>;
  existingSummative?: JHSummativeEntry;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  options: AssessmentBookOptions;
  teacherId: string;
  teacherName: string;
  isReadOnly?: boolean;
  mode?: 'SUBJECT' | 'UNIT_ACTIVITY';
  unitActivityName?: string;
  unitActivityCategory?: string;
  targetGrade?: string;
  onSaved: () => void;
}

export function SummativeModal({
  isOpen,
  onClose,
  student,
  lg,
  los,
  loScores,
  existingSummative,
  classId,
  subjectId,
  academicYear,
  semester,
  options,
  teacherId,
  teacherName,
  isReadOnly = false,
  mode = 'SUBJECT',
  unitActivityName = '',
  unitActivityCategory = '',
  targetGrade = 'ALL',
  onSaved
}: Props) {

  const [date, setDate] = useState<string>(() => existingSummative?.date || getTodayWIB());
  const [task, setTask] = useState<string>(() => {
    return existingSummative?.summativeTask || options.summativeTasks[0] || 'Proyek Pembelajaran (LJ)';
  });
  const [score, setScore] = useState<ComprehensionLevel>(() => {
    return existingSummative?.summativeScore || 'A';
  });
  const [notes, setNotes] = useState<string>(() => existingSummative?.notes || '');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setDate(existingSummative?.date || getTodayWIB());
      setTask(existingSummative?.summativeTask || options.summativeTasks[0] || 'Proyek Pembelajaran (LJ)');
      setScore(existingSummative?.summativeScore || 'A');
      setNotes(existingSummative?.notes || '');
    }
  }, [isOpen, existingSummative, options]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !subjectId.trim()) {
      toast.warning('Mata pelajaran tidak boleh kosong');
      return;
    }
    if (!task) {
      toast.warning('Pilih bentuk tugas sumatif');
      return;
    }

    setSaving(true);
    try {
      await saveSummativeEntry({
        id: existingSummative?.id,
        lgId: lg.id,
        classId: student.classId || classId,
        subjectId,
        academicYear,
        semester,
        studentId: student.id,
        studentName: student.name,
        date,
        summativeTask: task,
        summativeScore: score,
        notes: notes.trim(),
        teacherId,
        teacherName,
        updatedBy: teacherId,
        updatedByName: teacherName,
        assessmentMode: mode,
        unitActivityId: unitActivityName || undefined,
        unitActivityName: unitActivityName || undefined,
        unitActivityCategory: unitActivityCategory || undefined,
        targetGrade: targetGrade !== 'ALL' ? targetGrade : undefined
      });

      toast.success(`Nilai Sumatif LG untuk ${student.name} berhasil disimpan!`);
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan sumatif: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <Award size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Penilaian Sumatif LG</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                <span className="font-semibold text-gray-800 flex items-center gap-1">
                  <User size={13} className="text-gray-400" /> {student.name}
                </span>
                <span>•</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {lg.code || 'LG'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* LG Description */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700">
            <span className="font-bold text-gray-900">Capaian LG: </span>
            {lg.goalText}
          </div>

          {/* Formative Evidence Summary */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2 flex items-center gap-1">
              <CheckCircle2 size={14} className="text-blue-600" /> Bukti Formatif Pendukung (Tangga LO)
            </label>
            {los.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Belum ada LO yang dikonfigurasi pada LG ini.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {los.map(lo => {
                  const s = loScores[lo.id];
                  const isLegacy = s ? isLegacyScore(s) : false;

                  return (
                    <div
                      key={lo.id}
                      className="p-2 rounded-xl border border-gray-200 bg-white flex items-center justify-between gap-1 text-xs"
                    >
                      <span className="font-bold text-gray-800 truncate" title={lo.title}>
                        {lo.code}
                      </span>
                      {s ? (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 border ${
                            s === 'Achieved' || s === 'A'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : s === 'Not Achieved' || s === 'B'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}
                        >
                          {isLegacy ? `${s} (Lama)` : s}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 font-medium">Belum</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form */}
          <form id="summative-form" onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tanggal Sumatif (WIB) <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Summative Task <span className="text-red-500">*</span>
                </label>
                <select
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                >
                  {options.summativeTasks.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Score Buttons B / D / A */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                Skor Sumatif (Summative Score) <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setScore('B')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 active:scale-95 focus-visible:ring-2 focus-visible:ring-rose-500 ${
                    score === 'B'
                      ? 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-500 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-rose-50 hover:border-rose-300'
                  }`}
                >
                  <span className="text-lg font-black">B</span>
                  <span className="text-[11px] font-bold">Beginning</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScore('D')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 active:scale-95 focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    score === 'D'
                      ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <span className="text-lg font-black">D</span>
                  <span className="text-[11px] font-bold">Developing</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScore('A')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    score === 'A'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300'
                  }`}
                >
                  <span className="text-lg font-black">A</span>
                  <span className="text-[11px] font-bold">Achieved / Proficient</span>
                </button>
              </div>
            </div>

            {/* Notes / Tindak Lanjut */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Catatan / Tindak Lanjut Pasca Sumatif (Opsional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="misal: Perlu pendampingan pada bab lanjutan, proyek sangat kreatif..."
                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white resize-none"
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Batal
          </button>
          <button
            type="submit"
            form="summative-form"
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save size={14} />
                Simpan Nilai Sumatif
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
