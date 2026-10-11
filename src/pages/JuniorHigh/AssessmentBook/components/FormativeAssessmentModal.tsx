import * as React from 'react';
import { useState } from 'react';
import { X, Check, Calendar, History, Trash2, Save, ArrowRight, User, Target, Clock, Edit3, AlertCircle } from 'lucide-react';
import {
  AssessmentBookOptions,
  ComprehensionLevel,
  JHAssessmentLO,
  JHFormativeEntry,
  Student
} from '../../../../types';
import {
  addFormativeEntry,
  correctFormativeEntry,
  hardDeleteFormativeEntry,
  formatDateWIB,
  getTodayWIB
} from '../../../../services/juniorHighAssessmentBookService';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  lo: JHAssessmentLO;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  options: AssessmentBookOptions;
  historyEntries: JHFormativeEntry[];
  teacherId: string;
  teacherName: string;
  isSuperAdmin?: boolean;
  isReadOnly?: boolean;
  onSaved: () => void;
}

export function FormativeAssessmentModal({
  isOpen,
  onClose,
  student,
  lo,
  classId,
  subjectId,
  academicYear,
  semester,
  options,
  historyEntries,
  teacherId,
  teacherName,
  isSuperAdmin = false,
  isReadOnly = false,
  onSaved
}: Props) {
  const latestEntry = historyEntries[historyEntries.length - 1];

  const [date, setDate] = useState<string>(() => getTodayWIB());
  const [task, setTask] = useState<string>(() => {
    return latestEntry?.formativeTask || options.formativeTasks[0] || 'Lembar Kerja (LKPD)';
  });
  const [level, setLevel] = useState<ComprehensionLevel>(() => {
    return latestEntry?.comprehensionLevel || 'A';
  });
  const [nextAction, setNextAction] = useState<string>(() => {
    return latestEntry?.nextAction || options.nextActions[0] || 'Lanjut ke LO Berikutnya';
  });
  const [notes, setNotes] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctingEntryId, setCorrectingEntryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setDate(getTodayWIB());
      setCorrectingEntryId(null);
      setCorrectionReason('');
      if (latestEntry) {
        setTask(latestEntry.formativeTask || options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
        setLevel(latestEntry.comprehensionLevel || 'A');
        setNextAction(latestEntry.nextAction || options.nextActions[0] || 'Lanjut ke LO Berikutnya');
      } else {
        setTask(options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
        setLevel('A');
        setNextAction(options.nextActions[0] || 'Lanjut ke LO Berikutnya');
      }
      setNotes('');
    }
  }, [isOpen, latestEntry, options]);

  if (!isOpen) return null;

  // Auto suggest nextAction when level changes
  const handleLevelChange = (lvl: ComprehensionLevel) => {
    setLevel(lvl);
    if (lvl === 'A') {
      setNextAction('Lanjut ke LO Berikutnya');
    } else if (lvl === 'D') {
      setNextAction('Tutor Sebaya');
    } else {
      setNextAction('Bimbingan Personal Guru');
    }
  };

  const handleStartCorrection = (entry: JHFormativeEntry) => {
    setCorrectingEntryId(entry.id);
    setDate(entry.date);
    setTask(entry.formativeTask || '');
    setLevel(entry.comprehensionLevel);
    setNextAction(entry.nextAction || '');
    setNotes(entry.notes || '');
    setCorrectionReason('');
    toast.info('Mode Koreksi Riwayat aktif. Silakan ubah data lalu simpan koreksi.');
  };

  const handleCancelCorrection = () => {
    setCorrectingEntryId(null);
    setDate(getTodayWIB());
    setTask(latestEntry?.formativeTask || options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
    setLevel(latestEntry?.comprehensionLevel || 'A');
    setNextAction(latestEntry?.nextAction || options.nextActions[0] || 'Lanjut ke LO Berikutnya');
    setNotes('');
    setCorrectionReason('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!level) {
      toast.warning('Pilih Tingkat Pemahaman (B/D/A)');
      return;
    }

    setSaving(true);
    try {
      if (correctingEntryId) {
        // Mode Koreksi
        await correctFormativeEntry({
          entryId: correctingEntryId,
          comprehensionLevel: level,
          formativeTask: task,
          nextAction,
          notes: notes.trim(),
          date,
          correctedBy: teacherId,
          correctedByName: teacherName,
          correctionReason: correctionReason.trim()
        });
        toast.success(`Koreksi asesmen untuk ${student.name} berhasil disimpan!`);
      } else {
        // Mode Entri Baru
        await addFormativeEntry({
          loId: lo.id,
          lgId: lo.lgId,
          classId,
          subjectId,
          academicYear,
          semester,
          studentId: student.id,
          studentName: student.name,
          date,
          formativeTask: task,
          comprehensionLevel: level,
          nextAction,
          notes: notes.trim(),
          teacherId,
          teacherName
        });
        toast.success(`Asesmen formatif untuk ${student.name} berhasil disimpan!`);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan asesmen: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePermanentDelete = async (entryId: string) => {
    if (!isSuperAdmin) {
      toast.error('Hanya Super Admin yang berhak menghapus entri riwayat secara permanen.');
      return;
    }
    if (!window.confirm('Hapus permanen entri riwayat asesmen formatif ini? Tindakan ini tidak dapat dibatalkan.')) return;

    setDeletingId(entryId);
    try {
      await hardDeleteFormativeEntry(entryId);
      toast.success('Entri riwayat berhasil dihapus permanen oleh Admin.');
      onSaved();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menghapus entri: ' + (err.message || 'Error'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${correctingEntryId ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
              {correctingEntryId ? <Edit3 size={20} /> : <Target size={20} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {correctingEntryId ? 'Koreksi Nilai Asesmen' : 'Input Asesmen Formatif'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                <span className="font-semibold text-gray-800 flex items-center gap-1">
                  <User size={13} className="text-gray-400" /> {student.name}
                </span>
                <span>•</span>
                <span className="font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                  {lo.code}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Correction Mode Warning Banner */}
        {correctingEntryId && (
          <div className="bg-amber-50 px-6 py-2.5 border-b border-amber-200 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-600 shrink-0" />
              <span>Anda sedang mengoreksi entri riwayat sebelumnya.</span>
            </div>
            <button
              type="button"
              onClick={handleCancelCorrection}
              className="text-amber-800 font-bold hover:underline cursor-pointer"
            >
              Batalkan Koreksi
            </button>
          </div>
        )}

        {/* LO Description Banner */}
        <div className="bg-purple-50/60 px-6 py-2.5 border-b border-purple-100 flex items-center gap-2 text-xs text-purple-900">
          <span className="font-bold shrink-0">Indikator LO:</span>
          <span className="truncate" title={lo.title}>{lo.title}</span>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <form id="formative-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tanggal Asesmen */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tanggal Asesmen (WIB) <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
                  required
                />
              </div>

              {/* Formative Task */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Formative Task (Bentuk Tugas)
                </label>
                <select
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
                >
                  <option value="">(Boleh Kosong / Entri Cepat)</option>
                  {options.formativeTasks.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comprehension Level (B / D / A) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                Tingkat Pemahaman (Comprehension Level) <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {/* B */}
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleLevelChange('B')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    level === 'B'
                      ? 'bg-rose-50 border-rose-400 text-rose-900 ring-2 ring-rose-400 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg font-black">B</span>
                  <span className="text-[11px] font-bold">Beginning</span>
                  <span className="text-[10px] text-gray-500 leading-tight">Perlu bimbingan mendasar</span>
                </button>

                {/* D */}
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleLevelChange('D')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    level === 'D'
                      ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-400 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg font-black">D</span>
                  <span className="text-[11px] font-bold">Developing</span>
                  <span className="text-[10px] text-gray-500 leading-tight">Sedang berkembang</span>
                </button>

                {/* A */}
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleLevelChange('A')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    level === 'A'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-400 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg font-black">A</span>
                  <span className="text-[11px] font-bold">Achieved</span>
                  <span className="text-[10px] text-gray-500 leading-tight">Mencapai / Proficient</span>
                </button>
              </div>
            </div>

            {/* Next Action */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Next Action (Tindak Lanjut)
              </label>
              <select
                value={nextAction}
                onChange={e => setNextAction(e.target.value)}
                disabled={isReadOnly}
                className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
              >
                {options.nextActions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Catatan Tindak Lanjut / Observasi */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Catatan Observasi / Kendala Siswa (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={isReadOnly}
                placeholder="misal: Masih keliru di tanda negatif persamaan linear..."
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
              />
            </div>

            {/* Alasan Koreksi (hanya tampil jika mode koreksi) */}
            {correctingEntryId && (
              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">
                  Alasan Koreksi (Audit Trail)
                </label>
                <input
                  type="text"
                  value={correctionReason}
                  onChange={e => setCorrectionReason(e.target.value)}
                  placeholder="misal: Koreksi nilai setelah penilaian ulang..."
                  className="w-full text-xs px-3 py-2 border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-amber-50/50"
                />
              </div>
            )}
          </form>

          {/* Section: Riwayat Asesmen untuk LO ini */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <History size={14} className="text-blue-600" />
                Riwayat Asesmen Siswa pada LO Ini ({historyEntries.length})
              </h3>
              <span className="text-[11px] text-gray-400">Nilai saat ini = entri paling akhir</span>
            </div>

            {historyEntries.length === 0 ? (
              <div className="text-center py-5 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 text-xs text-gray-500">
                Belum ada riwayat asesmen sebelumnya untuk siswa ini.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {historyEntries.map((h, index) => {
                  const isLatest = index === historyEntries.length - 1;
                  const isOwnEntry = h.teacherId === teacherId;

                  return (
                    <div
                      key={h.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                        isLatest
                          ? 'bg-blue-50/50 border-blue-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 border ${
                            h.comprehensionLevel === 'A'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : h.comprehensionLevel === 'D'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {h.comprehensionLevel}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{h.formativeTask || 'Asesmen Cepat'}</span>
                            {isLatest && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-600 text-white">
                                Terkini
                              </span>
                            )}
                            {h.correctedAt && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                                Dikoreksi
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                            <span>{formatDateWIB(h.date)}</span>
                            <span>•</span>
                            <span className="text-gray-700 font-medium">{h.nextAction}</span>
                            {h.notes && (
                              <>
                                <span>•</span>
                                <span className="italic text-gray-500">"{h.notes}"</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-gray-400">Oleh: {h.teacherName || 'Guru'}</span>

                        {/* Koreksi button (for entry owner or admin) */}
                        {!isReadOnly && (isOwnEntry || isSuperAdmin) && (
                          <button
                            type="button"
                            onClick={() => handleStartCorrection(h)}
                            className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Koreksi data riwayat ini"
                          >
                            <Edit3 size={12} /> Koreksi
                          </button>
                        )}

                        {/* Permanent delete (Admin only) */}
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => handlePermanentDelete(h.id)}
                            disabled={deletingId === h.id}
                            className="p-1 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer disabled:opacity-50"
                            title="Hapus permanen (Hanya Super Admin)"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            Batal
          </button>
          {!isReadOnly && (
            <button
              type="submit"
              form="formative-form"
              disabled={saving}
              className={`px-5 py-2 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 ${
                correctingEntryId
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              <Save size={14} />
              {saving
                ? 'Menyimpan...'
                : correctingEntryId
                ? 'Simpan Koreksi'
                : 'Simpan Nilai Formatif'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
