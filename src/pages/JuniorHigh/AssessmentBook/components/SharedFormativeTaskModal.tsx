import * as React from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { AssessmentBookOptions, JHAssessmentLO, Student } from '../../../../types';
import { getTodayWIB, saveSharedFormativeTask } from '../../../../services/juniorHighAssessmentBookService';

interface Props {
  lo: JHAssessmentLO; students: Student[]; classId: string; subjectId: string; academicYear: string; semester: string;
  options: AssessmentBookOptions; teacherId: string; teacherName: string; onClose: () => void; onSaved: () => void;
}
export function SharedFormativeTaskModal(props: Props) {
  const { lo, students, classId, subjectId, academicYear, semester, options, teacherId, teacherName, onClose, onSaved } = props;
  const [draftId] = React.useState(() => `${teacherId}_${lo.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const [date, setDate] = React.useState(getTodayWIB);
  const [task, setTask] = React.useState('');
  const [selected, setSelected] = React.useState(() => new Set(students.map(item => item.id)));
  const [saving, setSaving] = React.useState(false);
  const lock = React.useRef(false);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (!task.trim() || !date || !selected.size) { toast.warning('Isi tanggal, task, dan pilih peserta.'); return; }
    if (!window.confirm(`Tetapkan task untuk ${selected.size} siswa? Tidak ada nilai/capaian yang dibuat atau diubah.`)) return;
    lock.current = true; setSaving(true);
    try {
      await saveSharedFormativeTask({ id: draftId, loId: lo.id, lgId: lo.lgId, classId, subjectId, academicYear, semester, date, formativeTask: task.trim(), studentIds: students.filter(item => selected.has(item.id)).map(item => item.id), teacherId, teacherName });
      toast.success(`Task ditetapkan untuk ${selected.size} siswa. Capaian tetap individual.`); onSaved(); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
    <header className="p-5 border-b flex justify-between gap-3"><div><h2 className="font-bold">Tetapkan Task Bersama</h2><p className="text-xs text-gray-500 mt-1">{lo.code} · {lo.title}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="Tutup"><X size={20} /></button></header>
    <fieldset disabled={saving} className="p-5 overflow-y-auto space-y-4"><p className="p-3 bg-blue-50 rounded-xl text-xs text-blue-900">Hanya menetapkan tanggal dan task. Tidak otomatis memberi Achieved/Not Achieved, Next Action, atau mengubah riwayat. Daftar di bawah mengikuti peserta yang terlihat saat modal dibuka.</p>
      <label className="block text-xs">Tanggal asesmen<input required type="date" value={date} onChange={event => setDate(event.target.value)} className="block w-full border rounded-xl p-2 mt-1" /></label>
      <label className="block text-xs">Formative Task<input required list="shared-task-options" value={task} onChange={event => setTask(event.target.value)} placeholder="Pilih atau tulis bentuk kegiatan sendiri" className="block w-full border rounded-xl p-2 mt-1" /><datalist id="shared-task-options">{options.formativeTasks.map(value => <option key={value} value={value} />)}</datalist></label>
      <div className="flex justify-between items-center text-xs"><span>{selected.size} dari {students.length} siswa dipilih</span><div className="flex gap-3"><button type="button" className="underline" onClick={() => setSelected(new Set(students.map(item => item.id)))}>Pilih Semua</button><button type="button" className="underline" onClick={() => setSelected(new Set())}>Batal Pilih</button></div></div>
      <div className="border rounded-xl divide-y max-h-64 overflow-y-auto">{students.map(student => <label key={student.id} className="p-3 flex gap-3 items-center text-xs"><input type="checkbox" checked={selected.has(student.id)} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(student.id)) next.delete(student.id); else next.add(student.id); return next; })} /><span>{student.name}<span className="block text-gray-400">{(student as Student & { className?: string }).className || student.classId}</span></span></label>)}</div>
    </fieldset><footer className="p-4 border-t flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="px-4 py-2 border rounded-xl text-xs">Batal</button><button type="submit" disabled={saving || !selected.size || !task.trim()} className="px-4 py-2 rounded-xl bg-purple-700 text-white text-xs disabled:opacity-40">{saving ? 'Menyimpan…' : `Tetapkan Task ke ${selected.size} Siswa`}</button></footer>
  </form></div>;
}
