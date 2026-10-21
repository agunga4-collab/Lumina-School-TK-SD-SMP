import * as React from 'react';
import { useState } from 'react';
import {
  X,
  Check,
  Calendar,
  History,
  Trash2,
  Save,
  User,
  Target,
  Edit3,
  AlertCircle
} from 'lucide-react';
import {
  AssessmentBookOptions,
  JHAssessmentLO,
  JHFormativeEntry,
  JHFormativeLevel,
  JHFormativeScore,
  isLegacyScore,
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
  const [taskChoice, setTaskChoice] = useState<string>(() => {
    if (latestEntry?.formativeTask) {
      return options.formativeTasks.includes(latestEntry.formativeTask)
        ? latestEntry.formativeTask
        : '__CUSTOM__';
    }
    return options.formativeTasks[0] || 'Lembar Kerja (LKPD)';
  });
  const [customTaskText, setCustomTaskText] = useState<string>(() => {
    if (latestEntry?.formativeTask && !options.formativeTasks.includes(latestEntry.formativeTask)) {
      return latestEntry.formativeTask;
    }
    return '';
  });

  const [level, setLevel] = useState<JHFormativeLevel>(() => {
    if (latestEntry?.comprehensionLevel) {
      return latestEntry.comprehensionLevel;
    }
    return 'Achieved';
  });

  const [nextActionChoice, setNextActionChoice] = useState<string>(() => {
    if (latestEntry?.nextAction) {
      return options.nextActions.includes(latestEntry.nextAction)
        ? latestEntry.nextAction
        : '__CUSTOM__';
    }
    return options.nextActions[0] || 'Lanjut ke LO Berikutnya';
  });
  const [customNextActionText, setCustomNextActionText] = useState<string>(() => {
    if (latestEntry?.nextAction && !options.nextActions.includes(latestEntry.nextAction)) {
      return latestEntry.nextAction;
    }
    return '';
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
        const isKnownTask = options.formativeTasks.includes(latestEntry.formativeTask);
        setTaskChoice(isKnownTask ? latestEntry.formativeTask : (latestEntry.formativeTask ? '__CUSTOM__' : options.formativeTasks[0]));
        setCustomTaskText(isKnownTask ? '' : (latestEntry.formativeTask || ''));

        setLevel(latestEntry.comprehensionLevel || 'Achieved');

        const isKnownAction = options.nextActions.includes(latestEntry.nextAction);
        setNextActionChoice(isKnownAction ? latestEntry.nextAction : (latestEntry.nextAction ? '__CUSTOM__' : options.nextActions[0]));
        setCustomNextActionText(isKnownAction ? '' : (latestEntry.nextAction || ''));
      } else {
        setTaskChoice(options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
        setCustomTaskText('');
        setLevel('Achieved');
        setNextActionChoice(options.nextActions[0] || 'Lanjut ke LO Berikutnya');
        setCustomNextActionText('');
      }
      setNotes('');
    }
  }, [isOpen, latestEntry, options]);

  if (!isOpen) return null;

  // Change score - DO NOT auto-overwrite Next Action if already chosen
  const handleScoreChange = (newLevel: JHFormativeScore) => {
    setLevel(newLevel);
    // Only suggest if Next Action is completely empty
    if (!nextActionChoice || (nextActionChoice === '__CUSTOM__' && !customNextActionText)) {
      if (newLevel === 'Achieved') {
        setNextActionChoice('Lanjut ke LO Berikutnya');
      } else {
        setNextActionChoice('Refleksi & Remediasi Terfokus');
      }
    }
  };

  const handleStartCorrection = (entry: JHFormativeEntry) => {
    setCorrectingEntryId(entry.id);
    setDate(entry.date);

    const isKnownTask = options.formativeTasks.includes(entry.formativeTask);
    setTaskChoice(isKnownTask ? entry.formativeTask : (entry.formativeTask ? '__CUSTOM__' : ''));
    setCustomTaskText(isKnownTask ? '' : (entry.formativeTask || ''));

    setLevel(entry.comprehensionLevel);

    const isKnownAction = options.nextActions.includes(entry.nextAction);
    setNextActionChoice(isKnownAction ? entry.nextAction : (entry.nextAction ? '__CUSTOM__' : ''));
    setCustomNextActionText(isKnownAction ? '' : (entry.nextAction || ''));

    setNotes(entry.notes || '');
    setCorrectionReason('');
    toast.info('Mode Koreksi Riwayat aktif. Mengedit riwayat asesmen yang dipilih.');
  };

  const handleCancelCorrection = () => {
    setCorrectingEntryId(null);
    setDate(getTodayWIB());
    if (latestEntry) {
      const isKnownTask = options.formativeTasks.includes(latestEntry.formativeTask);
      setTaskChoice(isKnownTask ? latestEntry.formativeTask : (latestEntry.formativeTask ? '__CUSTOM__' : options.formativeTasks[0]));
      setCustomTaskText(isKnownTask ? '' : (latestEntry.formativeTask || ''));

      setLevel(latestEntry.comprehensionLevel || 'Achieved');

      const isKnownAction = options.nextActions.includes(latestEntry.nextAction);
      setNextActionChoice(isKnownAction ? latestEntry.nextAction : (latestEntry.nextAction ? '__CUSTOM__' : options.nextActions[0]));
      setCustomNextActionText(isKnownAction ? '' : (latestEntry.nextAction || ''));
    } else {
      setTaskChoice(options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
      setCustomTaskText('');
      setLevel('Achieved');
      setNextActionChoice(options.nextActions[0] || 'Lanjut ke LO Berikutnya');
      setCustomNextActionText('');
    }
    setNotes('');
    setCorrectionReason('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !subjectId.trim()) {
      toast.warning('Mata pelajaran tidak boleh kosong');
      return;
    }

    // Resolve Formative Task
    const resolvedTask = taskChoice === '__CUSTOM__' ? customTaskText.trim() : taskChoice.trim();
    if (taskChoice === '__CUSTOM__' && !resolvedTask) {
      toast.warning('Silakan tuliskan nama Formative Task kustom');
      return;
    }

    // Resolve Next Action
    const resolvedNextAction = nextActionChoice === '__CUSTOM__' ? customNextActionText.trim() : nextActionChoice.trim();
    if (nextActionChoice === '__CUSTOM__' && !resolvedNextAction) {
      toast.warning('Silakan tuliskan Next Action kustom');
      return;
    }

    if (!level) {
      toast.warning('Pilih Capaian LO (Achieved / Not Achieved)');
      return;
    }

    setSaving(true);
    try {
      if (correctingEntryId) {
        // Mode Koreksi
        await correctFormativeEntry({
          entryId: correctingEntryId,
          comprehensionLevel: level,
          formativeTask: resolvedTask,
          nextAction: resolvedNextAction,
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
          formativeTask: resolvedTask,
          comprehensionLevel: level,
          nextAction: resolvedNextAction || 'Lanjut ke LO Berikutnya',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${correctingEntryId ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
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
              <span>Mode Koreksi: Mengubah data riwayat tanpa mengubah identitas pembuat awal.</span>
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
                  className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white disabled:opacity-50"
                  required
                />
              </div>

              {/* Formative Task with Lainnya option */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Formative Task (Bentuk Kegiatan)
                </label>
                <select
                  value={taskChoice}
                  onChange={e => setTaskChoice(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white disabled:opacity-50"
                >
                  <option value="">(Boleh Kosong / Entri Cepat)</option>
                  {options.formativeTasks.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__CUSTOM__">✍️ Lainnya — Tulis sendiri...</option>
                </select>

                {taskChoice === '__CUSTOM__' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={customTaskText}
                      onChange={e => setCustomTaskText(e.target.value)}
                      placeholder="Tuliskan nama bentuk tugas... *"
                      disabled={isReadOnly}
                      className="w-full text-xs px-3 py-2 border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 bg-purple-50/40"
                      required
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Capaian LO: Achieved vs Not Achieved */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  Capaian LO (Tingkat Pemahaman) <span className="text-red-500">*</span>
                </label>
                {isLegacyScore(level) && (
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    Skala lama: {level}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Achieved */}
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleScoreChange('Achieved')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    level === 'Achieved'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Check size={18} className={level === 'Achieved' ? 'text-emerald-700' : 'text-gray-400'} />
                    <span className="text-sm font-black">Achieved</span>
                  </div>
                  <span className="text-[11px] text-gray-500">Mencapai / Tuntas LO</span>
                </button>

                {/* Not Achieved */}
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleScoreChange('Not Achieved')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    level === 'Not Achieved'
                      ? 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-500 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <X size={18} className={level === 'Not Achieved' ? 'text-rose-700' : 'text-gray-400'} />
                    <span className="text-sm font-black">Not Achieved</span>
                  </div>
                  <span className="text-[11px] text-gray-500">Belum mencapai / Perlu bimbingan</span>
                </button>
              </div>
            </div>

            {/* Next Action with Lainnya option */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Next Action (Tindak Lanjut)
              </label>
              <select
                value={nextActionChoice}
                onChange={e => setNextActionChoice(e.target.value)}
                disabled={isReadOnly}
                className="w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white disabled:opacity-50"
              >
                {options.nextActions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
                <option value="__CUSTOM__">✍️ Lainnya — Tulis sendiri...</option>
              </select>

              {nextActionChoice === '__CUSTOM__' && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={customNextActionText}
                    onChange={e => setCustomNextActionText(e.target.value)}
                    placeholder="Tuliskan Next Action kustom... *"
                    disabled={isReadOnly}
                    className="w-full text-xs px-3 py-2 border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 bg-purple-50/40"
                    required
                  />
                </div>
              )}
            </div>

            {/* Catatan Observasi */}
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
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white disabled:opacity-50"
              />
            </div>

            {/* Alasan Koreksi (Audit Trail) */}
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
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <History size={14} className="text-purple-600" />
                Riwayat Asesmen Siswa pada LO Ini ({historyEntries.length})
              </h3>
              <span className="text-[11px] text-gray-400">Nilai aktif = entri paling akhir</span>
            </div>

            {historyEntries.length === 0 ? (
              <div className="text-center py-5 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 text-xs text-gray-500">
                Belum ada riwayat asesmen sebelumnya untuk siswa ini pada LO ini.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {historyEntries.map((h, index) => {
                  const isLatest = index === historyEntries.length - 1;
                  const isOwnEntry = h.teacherId === teacherId;
                  const isLegacy = isLegacyScore(h.comprehensionLevel);

                  return (
                    <div
                      key={h.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                        isLatest
                          ? 'bg-purple-50/40 border-purple-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Score Badge */}
                        <span
                          className={`px-2 py-1 rounded-lg font-bold text-[11px] flex items-center justify-center shrink-0 border ${
                            h.comprehensionLevel === 'Achieved'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : h.comprehensionLevel === 'Not Achieved'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}
                        >
                          {isLegacy ? `${h.comprehensionLevel} (Lama)` : h.comprehensionLevel}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-gray-900 truncate">
                              {h.formativeTask || 'Asesmen Cepat'}
                            </span>
                            {isLatest && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-700 text-white">
                                Terkini
                              </span>
                            )}
                            {h.correctedAt && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                                Dikoreksi
                              </span>
                            )}
                            {h.sessionId && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-gray-100 text-gray-600">
                                Sesi
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
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
                        <span className="text-[10px] text-gray-400 hidden sm:inline">
                          Oleh: {h.teacherName || 'Guru'}
                        </span>

                        {/* Koreksi button */}
                        {!isReadOnly && (isOwnEntry || isSuperAdmin) && (
                          <button
                            type="button"
                            onClick={() => handleStartCorrection(h)}
                            className="px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
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
                  : 'bg-purple-600 hover:bg-purple-700'
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
