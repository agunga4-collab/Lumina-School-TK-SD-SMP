import * as React from 'react';
import { X, Check, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AssessmentBookOptions, JHAssessmentLO, JHFormativeEntry, JHFormativeLevel, JHAssessmentUAContext, Student, isLegacyScore } from '../../../../types';
import { addFormativeEntry, correctFormativeEntry, hardDeleteFormativeEntry, formatDateWIB, getTodayWIB, getUAContextForLO, getAssignedFormativeTask } from '../../../../services/juniorHighAssessmentBookService';

interface Props extends JHAssessmentUAContext {
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
  initialDate?: string;
  isSuperAdmin?: boolean;
  isReadOnly?: boolean;
  isUAMode?: boolean;
  onSaved: () => void;
}

export function FormativeAssessmentModal(props: Props) {
  const {
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
    initialDate,
    isSuperAdmin = false,
    isReadOnly = false,
    onSaved
  } = props;

  const targetDate = initialDate || lo.assessmentDate || getTodayWIB();
  const assigned = getAssignedFormativeTask(lo, student.id, targetDate) || getAssignedFormativeTask(lo, student.id);
  
  const existingEntry = React.useMemo(() => {
    const list = historyEntries.filter(item => item.studentId === student.id && item.loId === lo.id);
    if (!list.length) return undefined;
    const onDate = list.find(item => item.date === targetDate);
    if (onDate) return onDate;
    return [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))[list.length - 1];
  }, [historyEntries, student.id, lo.id, targetDate]);

  const [date, setDate] = React.useState(() => existingEntry ? (targetDate || existingEntry.date) : targetDate);
  const [task, setTask] = React.useState(() => existingEntry?.formativeTask || assigned?.formativeTask || '');
  const [level, setLevel] = React.useState<JHFormativeLevel | ''>(() => existingEntry ? existingEntry.comprehensionLevel : '');
  const [action, setAction] = React.useState(() => existingEntry?.nextAction || '');
  const [notes, setNotes] = React.useState(() => existingEntry?.notes || '');
  const [reason, setReason] = React.useState('');
  const [correction, setCorrection] = React.useState<string | null>(() => existingEntry ? existingEntry.id : null);
  const [actionOpen, setActionOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const lock = React.useRef(false);

  React.useEffect(() => {
    if (isOpen) {
      if (existingEntry) {
        setCorrection(existingEntry.id);
        setDate(targetDate || existingEntry.date);
        setTask(existingEntry.formativeTask || assigned?.formativeTask || '');
        setLevel(existingEntry.comprehensionLevel);
        setAction(existingEntry.nextAction || '');
        setNotes(existingEntry.notes || '');
      } else {
        setCorrection(null);
        setDate(targetDate);
        setTask(assigned?.formativeTask || '');
        setLevel('');
        setAction('');
        setNotes('');
      }
      setReason('');
      setActionOpen(false);
    }
  }, [isOpen, existingEntry, targetDate, assigned?.formativeTask]);

  if (!isOpen) return null;

  const startCorrection = (entry: JHFormativeEntry) => {
    setCorrection(entry.id);
    setDate(entry.date);
    setTask(entry.formativeTask || '');
    setLevel(entry.comprehensionLevel);
    setAction(entry.nextAction || '');
    setNotes(entry.notes || '');
    setReason('');
    setActionOpen(false);
  };

  const reset = () => {
    setCorrection(null);
    setDate(latestEntry?.date || assigned?.date || getTodayWIB());
    setTask(latestEntry?.formativeTask || assigned?.formativeTask || '');
    setLevel(latestEntry?.comprehensionLevel || '');
    setAction(latestEntry?.nextAction || '');
    setNotes(latestEntry?.notes || '');
    setReason('');
    setActionOpen(false);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || isReadOnly) return;
    if (!level || !date) {
      toast.warning('Pilih tanggal dan capaian LO terlebih dahulu.');
      return;
    }
    if (!correction && !['Achieved', 'Not Achieved'].includes(level)) {
      toast.warning('Entri baru memakai Achieved / Not Achieved.');
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      if (correction) {
        await correctFormativeEntry({
          entryId: correction,
          comprehensionLevel: level,
          formativeTask: task.trim(),
          nextAction: action.trim(),
          notes: notes.trim(),
          date,
          correctedBy: teacherId,
          correctedByName: teacherName,
          correctionReason: reason.trim()
        });
      } else {
        const context = getUAContextForLO(lo, classId);
        await addFormativeEntry({
          loId: lo.id,
          lgId: lo.lgId,
          classId: context.assessmentMode === 'UNIT_ACTIVITY' ? student.classId : classId,
          subjectId,
          academicYear,
          semester,
          studentId: student.id,
          studentName: student.name,
          date,
          formativeTask: task.trim(),
          comprehensionLevel: level,
          nextAction: action.trim(),
          notes: notes.trim(),
          teacherId,
          teacherName,
          ...context
        });
      }
      toast.success(correction ? 'Koreksi tersimpan.' : 'Asesmen tersimpan.');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!isSuperAdmin || lock.current || !window.confirm('Hapus permanen entri riwayat ini?')) return;
    lock.current = true;
    setSaving(true);
    try {
      await hardDeleteFormativeEntry(id);
      toast.success('Entri dihapus.');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const control = 'block w-full border border-slate-300 rounded-xl p-2.5 text-xs mt-1 bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-slate-200 flex justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              {correction ? 'Koreksi Asesmen Formatif' : 'Input Asesmen Formatif'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong className="text-slate-800">{student.name}</strong> · <span className="font-bold text-purple-700">{lo.code}</span>
            </p>
            <p className="text-xs text-purple-900 mt-1 font-medium bg-purple-50 border border-purple-100 rounded-lg p-2">
              Indikator LO: {lo.title}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4">
          <fieldset disabled={saving || isReadOnly} className="space-y-4">
            {assigned && !correction && (
              <div className="text-xs rounded-xl p-3 bg-blue-50 border border-blue-200 text-blue-900">
                <span className="font-bold block text-blue-800">Task Bersama: {assigned.formativeTask}</span>
                <span className="text-slate-500 block text-[11px] mt-0.5">Ditetapkan untuk tanggal {formatDateWIB(assigned.date)}. Capaian dan Next Action tetap individual.</span>
              </div>
            )}
            {correction && (
              <div className="text-xs p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center justify-between">
                <span>Mode koreksi riwayat asesmen sebelumnya.</span>
                <button
                  type="button"
                  className="font-bold underline text-amber-800 hover:text-amber-950 cursor-pointer active:scale-95 ml-2"
                  onClick={reset}
                >
                  Batalkan koreksi
                </button>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-xs font-semibold text-slate-700">
                <span className="flex items-center justify-between mb-1">
                  <span>Tanggal asesmen (WIB)</span>
                  <span className="text-[11px] text-purple-700 font-semibold">{formatDateWIB(date)}</span>
                </span>
                <input
                  required
                  type="date"
                  value={date}
                  onChange={event => {
                    const next = event.target.value;
                    setDate(next);
                    if (!correction) {
                      const value = getAssignedFormativeTask(lo, student.id, next);
                      setTask(value?.formativeTask || '');
                    }
                  }}
                  className={control}
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Formative Task (Bentuk Kegiatan)
                <input
                  list="individual-task-options"
                  value={task}
                  onChange={event => setTask(event.target.value)}
                  placeholder="Pilih/tulis kegiatan; boleh kosong"
                  className={control}
                />
                <datalist id="individual-task-options">
                  {options.formativeTasks.map(value => <option key={value} value={value} />)}
                </datalist>
              </label>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Capaian LO — pilih secara eksplisit
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLevel('Achieved');
                    if (!action) setAction('Lanjut ke LO Berikutnya');
                  }}
                  className={`p-3.5 border rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    level === 'Achieved'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500 shadow-xs'
                      : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800'
                  }`}
                >
                  <Check size={16} className={level === 'Achieved' ? 'text-emerald-600' : 'text-slate-400'} />
                  Achieved
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLevel('Not Achieved');
                    if (!action) setAction('Bimbingan Personal Guru');
                  }}
                  className={`p-3.5 border rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 focus-visible:ring-2 focus-visible:ring-rose-500 ${
                    level === 'Not Achieved'
                      ? 'border-rose-500 bg-rose-50 text-rose-900 ring-2 ring-rose-500 shadow-xs'
                      : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-800'
                  }`}
                >
                  <X size={16} className={level === 'Not Achieved' ? 'text-rose-600' : 'text-slate-400'} />
                  Not Achieved
                </button>
              </div>
              {level && !['Achieved', 'Not Achieved'].includes(level) && (
                <p className="text-xs mt-2 text-amber-800 font-medium bg-amber-50 border border-amber-200 p-2 rounded-lg">
                  Nilai lama terdeteksi: <strong>{level}</strong>. Nilai ini dipertahankan dalam mode koreksi riwayat.
                </p>
              )}
            </div>

            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Next Action (Tindak Lanjut)
              </label>
              <button
                type="button"
                onClick={() => setActionOpen(!actionOpen)}
                className="w-full flex items-center justify-between border border-slate-300 rounded-xl p-2.5 text-xs bg-slate-50/50 hover:bg-white focus:bg-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500 transition-colors text-left"
              >
                <span className={action ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                  {action || 'Pilih tindak lanjut atau ketik manual...'}
                </span>
                <ChevronDown size={14} className="text-slate-400 shrink-0 ml-2" />
              </button>
              {actionOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto p-1.5 space-y-1">
                  {options.nextActions.map(opt => {
                    const isSelected = action === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setAction(opt);
                          setActionOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-purple-50 text-purple-900 font-semibold'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <span className="break-words">{opt}</span>
                        {isSelected && <Check size={14} className="text-purple-700 shrink-0" />}
                      </button>
                    );
                  })}
                  <div className="pt-2 border-t border-slate-100 px-2 pb-1">
                    <input
                      type="text"
                      value={action}
                      onChange={e => setAction(e.target.value)}
                      placeholder="Atau ketik tindak lanjut kustom..."
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-slate-50 focus:bg-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-400"
                    />
                  </div>
                </div>
              )}
            </div>

            <label className="block text-xs font-semibold text-slate-700">
              Catatan observasi (opsional)
              <textarea
                rows={2}
                value={notes}
                onChange={event => setNotes(event.target.value)}
                className={`${control} resize-none`}
                placeholder="Catatan perkembangan pemahaman siswa..."
              />
            </label>

            {correction && (
              <label className="block text-xs font-semibold text-slate-700">
                Alasan koreksi
                <input
                  required
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  className={control}
                  placeholder="misal: Salah ketik nilai, asesmen susulan..."
                />
              </label>
            )}
          </fieldset>

          <section className="border-t border-slate-200 pt-4">
            <h3 className="text-xs font-bold text-slate-800 mb-1">
              Riwayat asesmen siswa pada LO ini ({historyEntries.length})
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">Nilai aktif pada matriks = entri paling akhir.</p>
            <div className="space-y-2">
              {historyEntries.map((entry, index) => {
                const isLatest = index === historyEntries.length - 1;
                return (
                  <div key={entry.id} className="border border-slate-200 rounded-xl p-3 text-xs bg-slate-50/50 space-y-1.5">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          entry.comprehensionLevel === 'Achieved'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : entry.comprehensionLevel === 'Not Achieved'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}>
                          {entry.comprehensionLevel === 'Achieved' ? <Check size={11} /> : entry.comprehensionLevel === 'Not Achieved' ? <X size={11} /> : null}
                          {entry.comprehensionLevel}
                          {isLegacyScore(entry.comprehensionLevel) ? ' (lama)' : ''}
                        </span>
                        <span className="font-medium text-slate-800">{entry.formativeTask || 'Asesmen Cepat'}</span>
                        {isLatest && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            Terkini
                          </span>
                        )}
                        {entry.correctedAt && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Dikoreksi
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!isReadOnly && (entry.teacherId === teacherId || isSuperAdmin) && (
                          <button
                            disabled={saving}
                            type="button"
                            onClick={() => startCorrection(entry)}
                            className="text-purple-700 hover:text-purple-900 font-semibold cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-400 px-2 py-1 rounded"
                          >
                            Koreksi
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button
                            disabled={saving}
                            type="button"
                            onClick={() => void remove(entry.id)}
                            className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 font-semibold cursor-pointer active:scale-95 transition-colors px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-rose-400"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-slate-500 text-[11px]">
                      {formatDateWIB(entry.date)} · <strong className="text-purple-800">Next Action:</strong> {entry.nextAction || 'Belum ada tindak lanjut'} · Oleh: {entry.teacherName || 'Guru'}
                    </p>
                    {entry.notes && (
                      <p className="text-slate-600 text-[11px] whitespace-pre-wrap bg-white p-2 rounded-lg border border-slate-100">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                );
              })}
              {!historyEntries.length && (
                <p className="text-xs text-slate-400 italic">Belum ada riwayat asesmen sebelumnya.</p>
              )}
            </div>
          </section>
        </div>

        <footer className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50/50">
          <button
            disabled={saving}
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-40"
          >
            Batal
          </button>
          {!isReadOnly && (
            <button
              type="submit"
              disabled={saving || !level}
              className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Menyimpan…
                </>
              ) : correction ? (
                'Simpan Koreksi'
              ) : (
                'Simpan Nilai Formatif'
              )}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}

