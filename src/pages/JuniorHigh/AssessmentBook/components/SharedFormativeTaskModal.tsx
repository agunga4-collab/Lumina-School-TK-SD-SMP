import * as React from 'react';
import { X, Loader2, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AssessmentBookOptions, JHAssessmentLO, Student } from '../../../../types';
import { getTodayWIB, formatDateWIB, saveSharedFormativeTask } from '../../../../services/juniorHighAssessmentBookService';

interface Props {
  lo: JHAssessmentLO;
  students: Student[];
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  options: AssessmentBookOptions;
  teacherId: string;
  teacherName: string;
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SharedFormativeTaskModal(props: Props) {
  const { lo, students, classId, subjectId, academicYear, semester, options, teacherId, teacherName, initialDate, onClose, onSaved } = props;
  const [draftId] = React.useState(() => `${teacherId}_${lo.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const [date, setDate] = React.useState(() => initialDate || getTodayWIB());
  const [task, setTask] = React.useState('');
  const [selected, setSelected] = React.useState(() => new Set(students.map(item => item.id)));
  const [saving, setSaving] = React.useState(false);
  const lock = React.useRef(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (!task.trim() || !date || !selected.size) {
      toast.warning('Isi tanggal, task, dan pilih peserta.');
      return;
    }
    if (!window.confirm(`Tetapkan task untuk ${selected.size} siswa? Tidak ada nilai/capaian yang dibuat atau diubah.`)) return;
    lock.current = true;
    setSaving(true);
    try {
      await saveSharedFormativeTask({
        id: draftId,
        loId: lo.id,
        lgId: lo.lgId,
        classId,
        subjectId,
        academicYear,
        semester,
        date,
        formativeTask: task.trim(),
        studentIds: students.filter(item => selected.has(item.id)).map(item => item.id),
        teacherId,
        teacherName
      });
      toast.success(`Task ditetapkan untuk ${selected.size} siswa. Capaian tetap individual.`);
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-slate-200 flex justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Tetapkan Task Bersama</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-bold text-purple-700">{lo.code}</span> · {lo.title}
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

        <fieldset disabled={saving} className="p-5 overflow-y-auto space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
            Hanya menetapkan tanggal dan judul Formative Task bersama. Tidak otomatis memberi nilai <em>Achieved</em>/<em>Not Achieved</em>, tidak mengubah Next Action, dan tidak mengubah riwayat siswa. Capaian tetap dinilai secara individual.
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-xs font-semibold text-slate-700">
              <span className="flex items-center justify-between mb-1">
                <span>Tanggal asesmen (WIB)</span>
                <span className="text-[11px] text-purple-700 font-semibold">{formatDateWIB(date)}</span>
              </span>
              <input
                required
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
                className={control}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Formative Task (Bentuk Kegiatan)
              <input
                required
                list="shared-task-options"
                value={task}
                onChange={event => setTask(event.target.value)}
                placeholder="Pilih atau ketik nama kegiatan"
                className={control}
              />
              <datalist id="shared-task-options">
                {options.formativeTasks.map(value => <option key={value} value={value} />)}
              </datalist>
            </label>
          </div>

          <div className="flex justify-between items-center text-xs pt-2">
            <span className="text-slate-700 font-semibold">
              <strong className="text-purple-700">{selected.size}</strong> dari {students.length} siswa dipilih
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-purple-700 hover:text-purple-900 font-semibold cursor-pointer hover:underline px-2 py-1 rounded"
                onClick={() => setSelected(new Set(students.map(item => item.id)))}
              >
                Pilih Semua
              </button>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 cursor-pointer hover:underline px-2 py-1 rounded"
                onClick={() => setSelected(new Set())}
              >
                Batal Pilih
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto bg-slate-50/30">
            {students.map(student => {
              const isChecked = selected.has(student.id);
              return (
                <label
                  key={student.id}
                  className={`p-3 flex gap-3 items-center text-xs cursor-pointer transition-colors ${
                    isChecked ? 'bg-purple-50/40 hover:bg-purple-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => setSelected(previous => {
                      const next = new Set(previous);
                      if (next.has(student.id)) next.delete(student.id);
                      else next.add(student.id);
                      return next;
                    })}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-slate-800 block truncate">{student.name}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {(student as Student & { className?: string }).className || student.classId} {student.nisn ? `· NISN: ${student.nisn}` : ''}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        <footer className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50/50">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-40"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving || !selected.size || !task.trim()}
            className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Menyimpan…
              </>
            ) : (
              <>
                <CheckCheck size={14} />
                Tetapkan Task ke {selected.size} Siswa
              </>
            )}
          </button>
        </footer>
      </form>
    </div>
  );
}

