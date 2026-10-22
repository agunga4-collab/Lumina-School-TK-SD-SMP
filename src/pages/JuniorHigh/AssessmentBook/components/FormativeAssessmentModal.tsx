import * as React from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { AssessmentBookOptions, JHAssessmentLO, JHFormativeEntry, JHFormativeLevel, JHAssessmentUAContext, Student } from '../../../../types';
import { addFormativeEntry, correctFormativeEntry, hardDeleteFormativeEntry, formatDateWIB, getTodayWIB, getUAContextForLO, getAssignedFormativeTask } from '../../../../services/juniorHighAssessmentBookService';

interface Props extends JHAssessmentUAContext {
  isOpen: boolean; onClose: () => void; student: Student; lo: JHAssessmentLO; classId: string; subjectId: string; academicYear: string; semester: string;
  options: AssessmentBookOptions; historyEntries: JHFormativeEntry[]; teacherId: string; teacherName: string;
  isSuperAdmin?: boolean; isReadOnly?: boolean; isUAMode?: boolean; onSaved: () => void;
}
export function FormativeAssessmentModal(props: Props) {
  const { isOpen, onClose, student, lo, classId, subjectId, academicYear, semester, options, historyEntries, teacherId, teacherName, isSuperAdmin = false, isReadOnly = false, onSaved } = props;
  const assigned = getAssignedFormativeTask(lo, student.id);
  const [date, setDate] = React.useState(() => assigned?.date || getTodayWIB());
  const [task, setTask] = React.useState(() => assigned?.formativeTask || '');
  const [level, setLevel] = React.useState<JHFormativeLevel | ''>('');
  const [action, setAction] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [correction, setCorrection] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const lock = React.useRef(false);
  React.useEffect(() => {
    if (isOpen) { setDate(assigned?.date || getTodayWIB()); setTask(assigned?.formativeTask || ''); setLevel(''); setAction(''); setNotes(''); setReason(''); setCorrection(null); }
  }, [isOpen, student.id, lo.id, assigned?.id]);
  if (!isOpen) return null;
  const startCorrection = (entry: JHFormativeEntry) => {
    setCorrection(entry.id); setDate(entry.date); setTask(entry.formativeTask || ''); setLevel(entry.comprehensionLevel); setAction(entry.nextAction || ''); setNotes(entry.notes || ''); setReason('');
  };
  const reset = () => { setCorrection(null); setDate(assigned?.date || getTodayWIB()); setTask(assigned?.formativeTask || ''); setLevel(''); setAction(''); setNotes(''); setReason(''); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || isReadOnly) return;
    if (!level || !date) { toast.warning('Pilih tanggal dan capaian LO terlebih dahulu.'); return; }
    if (!correction && !['Achieved', 'Not Achieved'].includes(level)) { toast.warning('Entri baru memakai Achieved / Not Achieved.'); return; }
    lock.current = true; setSaving(true);
    try {
      if (correction) {
        await correctFormativeEntry({ entryId: correction, comprehensionLevel: level, formativeTask: task.trim(), nextAction: action.trim(), notes: notes.trim(), date, correctedBy: teacherId, correctedByName: teacherName, correctionReason: reason.trim() });
      } else {
        // Resolve activity identity from the verified LO, not a stale modal prop or a group ID used as an activity ID.
        const context = getUAContextForLO(lo, classId);
        await addFormativeEntry({ loId: lo.id, lgId: lo.lgId, classId: context.assessmentMode === 'UNIT_ACTIVITY' ? student.classId : classId, subjectId, academicYear, semester, studentId: student.id, studentName: student.name, date, formativeTask: task.trim(), comprehensionLevel: level, nextAction: action.trim(), notes: notes.trim(), teacherId, teacherName, ...context });
      }
      toast.success(correction ? 'Koreksi tersimpan.' : 'Asesmen tersimpan.'); onSaved(); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!isSuperAdmin || lock.current || !window.confirm('Hapus permanen entri riwayat ini?')) return;
    lock.current = true; setSaving(true);
    try { await hardDeleteFormativeEntry(id); toast.success('Entri dihapus.'); onSaved(); onClose(); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setSaving(false); }
  };
  const control = 'block w-full border rounded-xl p-2.5 text-xs mt-1';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
    <header className="p-5 border-b flex justify-between gap-3"><div><h2 className="font-bold">{correction ? 'Koreksi Asesmen Formatif' : 'Input Asesmen Formatif'}</h2><p className="text-xs text-gray-500 mt-1">{student.name} · {lo.code}</p><p className="text-xs text-purple-800 mt-2">Indikator LO: {lo.title}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="Tutup"><X size={20} /></button></header>
    <div className="p-5 overflow-y-auto space-y-4"><fieldset disabled={saving || isReadOnly} className="space-y-4">
      {assigned && !correction && <p className="text-xs rounded-xl p-3 bg-blue-50 text-blue-900">Task bersama: {assigned.formativeTask} · {formatDateWIB(assigned.date)}. Capaian dan Next Action tetap individual.</p>}
      {correction && <div className="text-xs p-3 bg-amber-50 rounded-xl">Mode koreksi riwayat. <button type="button" className="underline" onClick={reset}>Batalkan koreksi</button></div>}
      <div className="grid sm:grid-cols-2 gap-4"><label className="text-xs">Tanggal asesmen (WIB)<input required type="date" value={date} onChange={event => { const next = event.target.value; setDate(next); if (!correction) { const value = getAssignedFormativeTask(lo, student.id, next); setTask(value?.formativeTask || ''); } }} className={control} /></label><label className="text-xs">Formative Task<input list="individual-task-options" value={task} onChange={event => setTask(event.target.value)} placeholder="Pilih/tulis kegiatan; boleh kosong" className={control} /><datalist id="individual-task-options">{options.formativeTasks.map(value => <option key={value} value={value} />)}</datalist></label></div>
      <div><p className="text-xs mb-2">Capaian LO — pilih secara eksplisit</p><div className="grid grid-cols-2 gap-3">{(['Achieved', 'Not Achieved'] as const).map(value => <button type="button" key={value} onClick={() => { setLevel(value); if (!action) setAction(value === 'Achieved' ? 'Lanjut ke LO Berikutnya' : 'Bimbingan Personal Guru'); }} className={`p-4 border rounded-xl text-xs font-semibold ${level === value ? 'border-purple-600 bg-purple-50 text-purple-900 ring-1 ring-purple-500' : ''}`}>{value}</button>)}</div>{level && !['Achieved', 'Not Achieved'].includes(level) && <p className="text-xs mt-2 text-amber-800">Nilai lama: {level}. Dapat dipertahankan dalam koreksi riwayat.</p>}</div>
      <label className="block text-xs">Next Action<input list="individual-next-options" value={action} onChange={event => setAction(event.target.value)} className={control} placeholder="Tindak lanjut individual" /><datalist id="individual-next-options">{options.nextActions.map(value => <option key={value} value={value} />)}</datalist></label>
      <label className="block text-xs">Catatan observasi (opsional)<textarea value={notes} onChange={event => setNotes(event.target.value)} className={control} /></label>
      {correction && <label className="block text-xs">Alasan koreksi<input value={reason} onChange={event => setReason(event.target.value)} className={control} /></label>}
    </fieldset><section className="border-t pt-4"><h3 className="text-xs font-bold mb-3">Riwayat asesmen siswa pada LO ini ({historyEntries.length})</h3><p className="text-xs text-gray-400 mb-2">Nilai aktif = entri paling akhir.</p><div className="space-y-2">{historyEntries.map((entry, index) => <div key={entry.id} className="border rounded-xl p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span>{entry.comprehensionLevel} · {entry.formativeTask || 'Asesmen Cepat'} {index === historyEntries.length - 1 ? '· Terkini' : ''} {entry.correctedAt ? '· Dikoreksi' : ''}</span><div className="flex gap-3">{!isReadOnly && (entry.teacherId === teacherId || isSuperAdmin) && <button disabled={saving} type="button" onClick={() => startCorrection(entry)} className="text-purple-700 underline">Koreksi</button>}{isSuperAdmin && <button disabled={saving} type="button" onClick={() => void remove(entry.id)} className="text-red-700 underline">Hapus</button>}</div></div><p className="text-gray-500 mt-1">{formatDateWIB(entry.date)} · {entry.nextAction || 'Belum ada tindak lanjut'} · Oleh: {entry.teacherName || 'Guru'}</p>{entry.notes && <p className="mt-1 whitespace-pre-wrap">{entry.notes}</p>}</div>)}{!historyEntries.length && <p className="text-xs text-gray-500">Belum ada riwayat.</p>}</div></section></div>
    <footer className="p-4 border-t flex justify-end gap-3"><button disabled={saving} type="button" onClick={onClose} className="px-4 py-2 border rounded-xl text-xs">Batal</button>{!isReadOnly && <button type="submit" disabled={saving || !level} className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs disabled:opacity-40">{saving ? 'Menyimpan…' : correction ? 'Simpan Koreksi' : 'Simpan Nilai Formatif'}</button>}</footer>
  </form></div>;
}
