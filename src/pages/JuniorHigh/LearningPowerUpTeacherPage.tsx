import * as React from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { LpuTrackerActor, LpuTrackerSubject, LpuTrackerSemester, LpuTrackerStudent, LpuTrackerColumn, LpuTrackerCell, LpuTrackerLevel, LpuTrackerCoach, LpuTrackerCoachAssignment, LpuTrackerLegacyRow } from '../../types/learningPowerUpTracker';
import { TRACKER_SUBJECTS, canUseLpuTracker, loadLpuTrackerRoster, loadLpuCoachOptions, loadLpuTrackerLevels, loadLpuTrackerColumns, loadLpuTrackerCells, loadLpuTrackerCoaches, newLpuTrackerColumnId, saveLpuTrackerColumn, saveLpuTrackerCell, saveLpuTrackerRange, saveLpuTrackerCoach, trackerCellId, trackerLevelKey, loadLpuTrackerLegacy } from '../../services/learningPowerUpTrackerService';
const inputClass = 'w-full border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function getClassRecipients(students: LpuTrackerStudent[], classId: string): LpuTrackerStudent[] {
  if (!classId || classId === 'ALL') return [];
  return students.filter(student => student.classId === classId);
}
function resolveSelectedClass(previous: string, classes: Array<{
  id: string;
  name: string;
}>): string {
  if (previous === 'ALL') return 'ALL';
  return classes.some(item => item.id === previous) ? previous : classes[0]?.id || '';
}
function hasOutsideRecipients(column: LpuTrackerColumn, students: LpuTrackerStudent[]): boolean {
  const eligible = new Set(students.map(student => student.id));
  return column.studentIds.some(id => !eligible.has(id));
}
function CellEditor({
  cell,
  actor,
  onSaved,
  onPasteRange,
  readOnly
}: {
  cell: LpuTrackerCell;
  actor: LpuTrackerActor;
  onSaved: (cell: LpuTrackerCell) => void;
  onPasteRange: (cell: LpuTrackerCell, text: string) => Promise<void>;
  readOnly: boolean;
}) {
  const [text, setText] = React.useState(String(cell.value ?? ''));
  const [state, setState] = React.useState('');
  const focused = React.useRef(false);
  const version = React.useRef(cell.valueVersion);
  const lock = React.useRef(false);
  const cancelBlur = React.useRef(false);
  React.useEffect(() => {
    if (!focused.current && !lock.current) setText(String(cell.value ?? ''));
  }, [cell.value, cell.valueVersion]);
  const save = async () => {
    focused.current = false;
    if (cancelBlur.current) {
      cancelBlur.current = false;
      return;
    }
    if (lock.current || readOnly || text === String(cell.value ?? '')) return;
    let value: string | number = text;
    if (cell.valueType === 'NUMBER' && text.trim()) {
      value = Number(text.trim().replace(',', '.'));
      if (!Number.isFinite(value)) {
        setState('Isi angka yang valid.');
        return;
      }
    }
    lock.current = true;
    setState('Menyimpan…');
    try {
      const updated = await saveLpuTrackerCell({
        ...cell,
        valueVersion: version.current
      }, value, actor);
      setText(String(updated.value));
      setState('Tersimpan');
      onSaved(updated);
    } catch (error) {
      setState(message(error));
    } finally {
      lock.current = false;
    }
  };
  return <div>
    <textarea aria-label={`${cell.label} — ${cell.studentName}`} rows={2} readOnly={readOnly} value={text} onFocus={() => {
      focused.current = true;
      version.current = cell.valueVersion;
    }} onChange={event => setText(event.target.value)} onPaste={event => {
      const raw = event.clipboardData.getData('text/plain');
      if (readOnly || !raw.includes('\t') && !raw.includes('\n')) return;
      event.preventDefault();
      if (lock.current) return;
      cancelBlur.current = true;
      event.currentTarget.blur();
      lock.current = true;
      setState('Menyimpan rentang…');
      void onPasteRange(cell, raw).then(() => setState('Tersimpan')).catch(error => setState(message(error))).finally(() => {
        lock.current = false;
      });
    }} onBlur={() => void save()} onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.currentTarget.blur();
      }
      if (event.key === 'Escape') {
        cancelBlur.current = true;
        setText(String(cell.value ?? ''));
        event.currentTarget.blur();
      }
    }} className="w-full min-w-[180px] border border-transparent focus:border-emerald-600 rounded p-2 bg-transparent text-sm resize-y focus:bg-white outline-none" placeholder={cell.valueType === 'NUMBER' ? 'Skor / angka' : 'Teks atau angka'} />
    <p role="status" className={`text-[10px] px-2 ${state === 'Tersimpan' ? 'text-emerald-700' : 'text-rose-700'}`}>{state}</p>
  </div>;
}
function LevelDisplay({ value, failed }: { value?: LpuTrackerLevel; failed: boolean }) {
  return <div className="space-y-1">
    <p className={`text-xs font-semibold ${failed || value?.issue ? 'text-rose-700' : 'text-slate-800'}`}>
      {failed ? 'Level belum dapat dimuat' : value?.label || 'Belum tersedia'}
    </p>
    {!failed && <p className="text-[10px] text-slate-400">Litnum: {value?.sourceLabel || value?.sessionKey || 'belum ada hasil'}</p>}
    {value?.issue && <p className="max-w-[220px] text-[10px] text-amber-800">{value.issue}</p>}
    <Link to="/junior-high/literasi-numerasi" className="inline-block rounded text-[10px] text-emerald-800 underline focus-visible:ring-2 focus-visible:ring-emerald-500">Atur level/acuan di Litnum</Link>
  </div>;
}
function HeaderEditor({
  column,
  students,
  className,
  year,
  semester,
  subject,
  actor,
  defaultOrder,
  onClose,
  onSaved
}: {
  column?: LpuTrackerColumn;
  students: LpuTrackerStudent[];
  className: string;
  year: string;
  semester: LpuTrackerSemester;
  subject: LpuTrackerSubject;
  actor: LpuTrackerActor;
  defaultOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id] = React.useState(() => column?.id || newLpuTrackerColumnId());
  const [label, setLabel] = React.useState(column?.label || '');
  const [periodLabel, setPeriodLabel] = React.useState(column?.periodLabel || '');
  const [order, setOrder] = React.useState(column?.order ?? defaultOrder);
  const [valueType, setValueType] = React.useState<'FREE' | 'NUMBER'>(column?.valueType || 'FREE');
  const [ids, setIds] = React.useState(() => new Set(column?.studentIds || students.map(student => student.id)));
  const [showRecipients, setShowRecipients] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);
  const visible = students.filter(student => `${student.name} ${student.nis}`.toLowerCase().includes(search.toLowerCase()));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (!label.trim() || !ids.size) {
      setError('Isi judul dan pilih penerima.');
      return;
    }
    const eligible = new Set(students.map(student => student.id));
    if ([...ids].some(studentId => !eligible.has(studentId))) {
      setError('Ada penerima di luar kelas ini. Header lintas kelas lama tidak diubah otomatis; buat header baru khusus kelas.');
      return;
    }
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      await saveLpuTrackerColumn({
        id,
        academicYear: year,
        semester,
        subjectKey: subject,
        label,
        periodLabel,
        order,
        valueType,
        studentIds: [...ids],
        archived: column?.archived || false,
        expectedVersion: column?.version || 0
      }, actor);
      toast.success(`Header kelas ${className} tersimpan.`);
      onSaved();
      onClose();
    } catch (issue) {
      setError(message(issue));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center p-4">
      <form onSubmit={save} className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
        <header className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-base">{column ? 'Edit Header Kolom' : 'Tambah Header Kolom'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Kelas: <strong className="text-slate-800">{className}</strong> · Semester {semester}</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-40"
          >
            Tutup
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <fieldset disabled={saving} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-700">
              Judul header <span className="text-rose-500">*</span>
              <input required maxLength={200} value={label} onChange={event => setLabel(event.target.value)} className={inputClass} placeholder="Judul Buku / AAP / Jurnal 1 / Pekan 1 / lainnya" />
            </label>

            <label className="block text-xs font-semibold text-slate-700">
              Keterangan periode (opsional)
              <input maxLength={200} value={periodLabel} onChange={event => setPeriodLabel(event.target.value)} className={inputClass} placeholder="Bebas; tidak wajib tanggal atau pekan" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-700">
                Urutan <span className="text-rose-500">*</span>
                <input type="number" required value={order} onChange={event => setOrder(Number(event.target.value))} className={inputClass} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Format Isian <span className="text-rose-500">*</span>
                <select value={valueType} onChange={event => setValueType(event.target.value as 'FREE' | 'NUMBER')} className={inputClass}>
                  <option value="FREE">Bebas — teks atau angka</option>
                  <option value="NUMBER">Angka / skor</option>
                </select>
              </label>
            </div>

            <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3.5 rounded-xl leading-relaxed">
              Header ini khusus kelas <strong>{className}</strong>. Default header berlaku untuk seluruh siswa kelas ini. Anda dapat mengubah penerima jika diperlukan.
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div>
                <span className="font-bold text-slate-800"><strong className="text-emerald-700">{ids.size}</strong> dari {students.length} siswa</span> kelas {className} dipilih sebagai penerima.
              </div>
              <button
                type="button"
                onClick={() => setShowRecipients(prev => !prev)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                {showRecipients ? 'Sembunyikan daftar penerima' : 'Ubah penerima / pilih sebagian'}
              </button>
            </div>

            {showRecipients && (
              <div className="space-y-3 pt-2 border-t border-slate-100 animate-fadeIn">
                <input value={search} onChange={event => setSearch(event.target.value)} className={inputClass} placeholder={`Cari siswa di kelas ${className}...`} />
                <div className="flex gap-4 text-xs">
                  <button type="button" className="text-emerald-800 font-semibold hover:underline cursor-pointer" onClick={() => setIds(new Set(students.map(student => student.id)))}>Pilih Semua Siswa Kelas</button>
                  <button type="button" className="text-slate-500 font-semibold hover:underline cursor-pointer" onClick={() => setIds(new Set())}>Kosongkan pilihan</button>
                </div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto bg-slate-50/50">
                  {visible.map(student => {
                    const isChecked = ids.has(student.id);
                    return (
                      <label key={student.id} className={`flex gap-3 items-center p-2.5 text-xs cursor-pointer transition-colors ${isChecked ? 'bg-purple-50/50 hover:bg-purple-50' : 'hover:bg-slate-100'}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setIds(previous => {
                            const next = new Set(previous);
                            if (next.has(student.id)) next.delete(student.id);
                            else next.add(student.id);
                            return next;
                          })}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800">{student.name}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">NIS: {student.nis} · {className}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {error && <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl font-medium">{error}</p>}
          </fieldset>
        </div>

        <footer className="p-4 border-t border-slate-200 bg-slate-50/50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving || !ids.size || !label.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-5 py-2 text-xs font-bold shadow-xs cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? 'Menyimpan…' : 'Simpan Header & Penerima'}
          </button>
        </footer>
      </form>
    </div>
  );
}
export default function LearningPowerUpTeacherPage() {
  const {
    currentUser
  } = useOutletContext<{
    currentUser: LpuTrackerActor;
  }>();
  const {
    activeYear
  } = useAcademicYear();
  const [year, setYear] = React.useState(activeYear || '');
  const [semester, setSemester] = React.useState<LpuTrackerSemester>('1');
  const [subject, setSubject] = React.useState<LpuTrackerSubject>('bahasaIndonesia');
  const [classId, setClassId] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState('ALL');
  const [coachFilter, setCoachFilter] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [roster, setRoster] = React.useState<{
    classes: Array<{
      id: string;
      name: string;
    }>;
    students: LpuTrackerStudent[];
  }>({
    classes: [],
    students: []
  });
  const [columns, setColumns] = React.useState<LpuTrackerColumn[]>([]);
  const [cells, setCells] = React.useState<LpuTrackerCell[]>([]);
  const [levels, setLevels] = React.useState<Record<string, LpuTrackerLevel>>({});
  const [coaches, setCoaches] = React.useState<LpuTrackerCoach[]>([]);
  const [assignments, setAssignments] = React.useState<LpuTrackerCoachAssignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [loadedScope, setLoadedScope] = React.useState('');
  const [loadedSources, setLoadedSources] = React.useState({ roster: false, columns: false, cells: false, levels: false, coachOptions: false, coachAssignments: false });
  const [refresh, setRefresh] = React.useState(0);
  const [editor, setEditor] = React.useState<{
    column?: LpuTrackerColumn;
  } | null>(null);
  const [busy, setBusy] = React.useState('');
  const [legacy, setLegacy] = React.useState<LpuTrackerLegacyRow[] | null>(null);
  const [loadingLegacy, setLoadingLegacy] = React.useState(false);
  const readOnly = !canUseLpuTracker(currentUser, true);
  const scope = `${year}|${semester}|${subject}`;
  const scopeRef = React.useRef(scope);
  scopeRef.current = scope;
  React.useEffect(() => {
    if (activeYear) setYear(activeYear);
  }, [activeYear]);
  React.useEffect(() => {
    setLevelFilter('ALL');
    setCoachFilter('ALL');
    setLegacy(null);
  }, [subject, year, semester]);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setLoadedScope('');
    setLoadedSources({ roster: false, columns: false, cells: false, levels: false, coachOptions: false, coachAssignments: false });
    setRoster({ classes: [], students: [] }); setColumns([]); setCells([]); setLevels({}); setCoaches([]); setAssignments([]);
    if (!year || !canUseLpuTracker(currentUser)) { setLoading(false); return () => { cancelled = true; }; }
    const rosterJob = loadLpuTrackerRoster(year);
    const tasks = [
      rosterJob,
      loadLpuTrackerColumns(year, semester, subject),
      loadLpuTrackerCells(year, semester, subject),
      rosterJob.then(value => loadLpuTrackerLevels(year, undefined, value.students)),
      subject === 'numerasi' ? loadLpuCoachOptions() : Promise.resolve<LpuTrackerCoach[]>([]),
      subject === 'numerasi' ? loadLpuTrackerCoaches(year, semester) : Promise.resolve<LpuTrackerCoachAssignment[]>([])
    ] as const;
    void Promise.allSettled(tasks).then(([r, c, values, l, staff, assigned]) => {
      if (cancelled) return;
      const problems: string[] = [];
      if (r.status === 'fulfilled') { setRoster(r.value); setClassId(previous => resolveSelectedClass(previous, r.value.classes)); }
      else problems.push(`[Roster kelas/siswa] ${message(r.reason)}`);
      if (c.status === 'fulfilled') setColumns(c.value); else problems.push(`[lpu_tracker_columns] ${message(c.reason)}`);
      if (values.status === 'fulfilled') setCells(values.value); else problems.push(`[lpu_tracker_cells] ${message(values.reason)}`);
      if (l.status === 'fulfilled') setLevels(l.value); else problems.push(`[Level Litnum/acuan LPU] ${message(l.reason)}`);
      if (staff.status === 'fulfilled') setCoaches(staff.value); else problems.push(`[Opsi coach] ${message(staff.reason)}`);
      if (assigned.status === 'fulfilled') setAssignments(assigned.value); else problems.push(`[lpu_tracker_coaches] ${message(assigned.reason)}`);
      setLoadedSources({ roster: r.status === 'fulfilled', columns: c.status === 'fulfilled', cells: values.status === 'fulfilled', levels: l.status === 'fulfilled', coachOptions: staff.status === 'fulfilled', coachAssignments: assigned.status === 'fulfilled' });
      setLoadedScope(scope);
      setError(problems.join('\n'));
    }).catch(issue => { if (!cancelled) setError(`[Pemuatan LPU] ${message(issue)}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, semester, subject, currentUser?.uid, currentUser?.role, currentUser?.status, currentUser?.unitId, currentUser?.unit, refresh]);
  const sourceReady = loadedScope === scope ? loadedSources : { roster: false, columns: false, cells: false, levels: false, coachOptions: false, coachAssignments: false };
  if (!canUseLpuTracker(currentUser)) return <p className="p-8 text-rose-700">Akun ini tidak memiliki akses tracker SMP. Periksa status, role, dan unit akun.</p>;
  const selectedClass = roster.classes.find(item => item.id === classId);
  const classStudents = getClassRecipients(roster.students, classId);
  const classScopeStudents = classId === 'ALL' ? roster.students : classStudents;
  const coachByStudent = new Map(assignments.map(item => [item.studentId, item]));
  const visible = classScopeStudents.filter(student => (!sourceReady.levels || levelFilter === 'ALL' || (levels[trackerLevelKey(student.id, subject)]?.label || '') === levelFilter) && (subject !== 'numerasi' || !sourceReady.coachAssignments || coachFilter === 'ALL' || (coachFilter === 'NONE' ? !coachByStudent.get(student.id)?.coachId : coachByStudent.get(student.id)?.coachId === coachFilter)) && `${student.name} ${student.nis} ${student.className}`.toLowerCase().includes(search.toLowerCase()));
  // Header scope follows the selected class, not row search/level/coach filters.
  const classScopeIds = new Set(classScopeStudents.map(student => student.id));
  const displayedColumns = columns.filter(column => (showArchived || !column.archived) && column.studentIds.some(id => classScopeIds.has(id)));
  const cellMap = new Map(cells.map(item => [item.id, item]));
  const currentLevelOptions = [...new Set(classScopeStudents.map(student => levels[trackerLevelKey(student.id, subject)]?.label || ''))].sort();
  const coreReady = sourceReady.roster && sourceReady.columns && sourceReady.cells;
  const canAddHeader = !readOnly && !loading && coreReady && !!selectedClass && classStudents.length > 0;
  const openEditor = (column?: LpuTrackerColumn) => {
    if (!coreReady || loading) { toast.warning('Tunggu roster, header, dan sel berhasil dimuat.'); return; }
    if (!selectedClass) {
      toast.warning('Pilih satu kelas dahulu untuk membuat atau mengedit header.');
      return;
    }
    if (column && hasOutsideRecipients(column, classStudents)) {
      toast.warning('Header lama memiliki penerima di luar kelas terpilih. Buat header baru khusus kelas; penerima lama tidak diubah otomatis.');
      return;
    }
    setEditor({
      column
    });
  };
  const archive = async (column: LpuTrackerColumn) => {
    if (!coreReady || loading) return;
    if (busy) return;
    if (!selectedClass) {
      toast.warning('Pilih satu kelas dahulu.');
      return;
    }
    if (hasOutsideRecipients(column, classStudents)) {
      toast.warning('Header lama lintas kelas tidak diarsipkan dari tampilan satu kelas. Tidak ada data diubah.');
      return;
    }
    if (!window.confirm(`${column.archived ? 'Aktifkan kembali' : 'Arsipkan'} header “${column.label}” kelas ${selectedClass.name}? Isian tidak dihapus.`)) return;
    setBusy(column.id);
    try {
      await saveLpuTrackerColumn({
        ...column,
        expectedVersion: column.version,
        archived: !column.archived
      }, currentUser);
      setRefresh(value => value + 1);
    } catch (issue) {
      toast.error(message(issue));
    } finally {
      setBusy('');
    }
  };
  const pasteRange = async (start: LpuTrackerCell, raw: string) => {
    if (!coreReady || loading || readOnly) throw new Error('Data inti belum siap atau akun hanya-baca.');
    const rows = raw.replace(/\r/g, '').split('\n').map(row => row.split('\t'));
    if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
    const rowStart = visible.findIndex(student => student.id === start.studentId);
    const columnStart = displayedColumns.findIndex(column => column.id === start.columnId);
    if (rowStart < 0 || columnStart < 0) throw new Error('Sel awal tidak ada pada filter aktif.');
    const updates: Array<{
      cell: LpuTrackerCell;
      value: string | number;
    }> = [];
    rows.forEach((values, rowOffset) => values.forEach((value, columnOffset) => {
      const student = visible[rowStart + rowOffset];
      const column = displayedColumns[columnStart + columnOffset];
      const target = student && column ? cellMap.get(trackerCellId(column.id, student.id)) : undefined;
      if (!student || !column || !target || !target.visible || column.archived) throw new Error('Rentang melewati tabel atau berisi sel yang tidak berlaku. Tidak ada data disimpan.');
      let parsed: string | number = value;
      if (column.valueType === 'NUMBER' && value.trim()) {
        parsed = Number(value.trim().replace(',', '.'));
        if (!Number.isFinite(parsed)) throw new Error(`Kolom ${column.label} memerlukan angka.`);
      }
      updates.push({
        cell: target,
        value: parsed
      });
    }));
    if (!window.confirm(`Tempel ${updates.length} sel pada siswa/kolom yang terlihat? Isian lama pada rentang ini akan diganti.`)) throw new Error('Tempel dibatalkan.');
    const saved = await saveLpuTrackerRange(updates, currentUser);
    const replacements = new Map(saved.map(item => [item.id, item]));
    setCells(previous => previous.map(item => replacements.get(item.id) || item));
    toast.success(`${saved.length} sel tersimpan.`);
  };
  const years = [...new Set([activeYear, year].filter(Boolean))];
  return <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
    <header className="bg-white rounded-2xl border p-6"><p className="text-xs text-emerald-700">Lumina Junior High · Workspace Guru</p><h1 className="text-2xl font-bold mt-1">Learning Power-Up Tracker</h1><p className="text-sm text-slate-500 mt-2">Isi perkembangan belajar langsung pada tabel. Nama dan Level tetap; khusus Numerasi tersedia Coach. Header baru default untuk seluruh siswa kelas terpilih.</p><p className="text-xs text-slate-500 mt-2">Guru: {currentUser.displayName || currentUser.email}{readOnly ? ' · Baca saja' : ''}</p></header>
    <div className="flex flex-wrap gap-2">{TRACKER_SUBJECTS.map(item => <button disabled={!!editor || !!busy} key={item.key} onClick={() => setSubject(item.key)} className={`px-4 py-2 rounded-xl text-sm border ${subject === item.key ? 'bg-emerald-700 text-white' : 'bg-white'}`}>{item.label}</button>)}</div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-white border rounded-2xl p-4">
      <label className="text-xs">Tahun ajaran<select disabled={!!editor} value={year} onChange={event => setYear(event.target.value)} className={inputClass}>{years.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="text-xs">Semester<select disabled={!!editor} value={semester} onChange={event => setSemester(event.target.value as LpuTrackerSemester)} className={inputClass}><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label>
      <label className="text-xs">Kelas<select disabled={!!editor} value={classId} onChange={event => setClassId(event.target.value)} className={inputClass}><option value="" disabled>Pilih kelas</option>{roster.classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="ALL">Semua kelas SMP — lihat gabungan</option></select></label>
      <label className="text-xs">Level<select disabled={!sourceReady.levels} value={levelFilter} onChange={event => setLevelFilter(event.target.value)} className={inputClass}><option value="ALL">Semua level</option>{currentLevelOptions.map(item => <option key={item} value={item}>{item || 'Belum ada level'}</option>)}</select></label>
      {subject === 'numerasi' && <label className="text-xs">Coach<select disabled={!sourceReady.coachAssignments} value={coachFilter} onChange={event => setCoachFilter(event.target.value)} className={inputClass}><option value="ALL">Semua coach</option><option value="NONE">Belum ada coach</option>{coaches.map(item => <option key={item.uid} value={item.uid}>{item.name}</option>)}</select></label>}
      <label className="text-xs">Cari siswa<input value={search} onChange={event => setSearch(event.target.value)} className={inputClass} placeholder="Nama / NIS / kelas" /></label>
    </div>
    {classId === 'ALL' && <p className="text-xs bg-blue-50 text-blue-900 border rounded-xl p-3">Tampilan gabungan seluruh kelas. Untuk menambah atau mengedit header, pilih satu kelas dahulu.</p>}
    <div className="flex flex-wrap justify-between items-center gap-3"><p className="text-xs text-slate-500">{sourceReady.roster ? `${visible.length} siswa ditampilkan` : 'Roster belum dapat dimuat'}{selectedClass ? ` dari ${classStudents.length} siswa kelas ${selectedClass.name}` : ''} · {sourceReady.columns ? `${displayedColumns.length} kolom.` : 'Kolom belum dapat dimuat.'} Enter/klik luar untuk simpan; Shift+Enter untuk baris baru. Tempel maksimal 100 sel/10 kolom.</p><div className="flex gap-3 items-center"><label className="text-xs"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Tampilkan arsip</label><button onClick={() => setRefresh(value => value + 1)} disabled={loading || !!editor} className="border rounded-xl px-3 py-2 text-xs">Segarkan</button>{!readOnly && <button disabled={!canAddHeader} title={selectedClass ? `Tambah header untuk seluruh kelas ${selectedClass.name}` : 'Pilih satu kelas dahulu'} onClick={() => openEditor()} className="bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs disabled:opacity-40">+ Tambah Header</button>}</div></div>
    {error && <div role="alert" className="bg-rose-50 border rounded-xl p-4 text-sm text-rose-800 whitespace-pre-wrap">{error}<p className="mt-2 text-xs">Data yang berhasil dibaca tetap ditampilkan. Periksa rules yang sudah dipublikasikan pada project Firebase aktif; build aplikasi tidak mempublikasikan rules.</p></div>}
    {loading ? <p className="p-8 text-sm text-slate-500">Memuat tracker…</p> : sourceReady.roster && <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-left text-sm border-collapse"><thead className="bg-slate-50"><tr><th className="p-3 min-w-[210px] sticky left-0 bg-slate-50 z-10">Nama</th><th className="p-3 min-w-[190px]">Level</th>{subject === 'numerasi' && <th className="p-3 min-w-[190px]">Coach</th>}{displayedColumns.map(column => {
              const headerClassNames = [...new Set(roster.students.filter(student => column.studentIds.includes(student.id)).map(student => student.className))];
              return <th key={column.id} className="p-3 min-w-[210px] border-l align-top"><span>{column.label}{column.archived ? ' · Arsip' : ''}</span><p className="font-normal text-xs text-slate-400 mt-1">{column.periodLabel}</p>{classId === 'ALL' && <p className="font-normal text-[10px] text-slate-500">{headerClassNames.join(', ')}</p>}{!readOnly && <div className="flex gap-3 mt-2 text-[10px] font-normal"><button disabled={!selectedClass || !!busy} onClick={() => openEditor(column)} className="underline text-emerald-800 disabled:opacity-40">Edit / Penerima Kelas</button><button disabled={!selectedClass || !!busy} onClick={() => void archive(column)} className="underline text-slate-500 disabled:opacity-40">{column.archived ? 'Aktifkan' : 'Arsipkan'}</button></div>}</th>;
            })}</tr></thead><tbody>{visible.map(student => {
            const source = levels[trackerLevelKey(student.id, subject)];
            const assignedCoach = coachByStudent.get(student.id);
            return <tr key={student.id} className="border-t"><td className="p-3 sticky left-0 bg-white z-10"><span className="font-semibold">{student.name}</span><p className="text-[10px] text-slate-400">{student.className} · {student.nis}</p></td><td className="p-3"><LevelDisplay value={source} failed={!sourceReady.levels} /></td>{subject === 'numerasi' && <td className="p-3"><select aria-label={`Coach ${student.name}`} disabled={readOnly || !sourceReady.coachOptions || !sourceReady.coachAssignments || busy === student.id} value={assignedCoach?.coachId || ''} onChange={async event => {
                  const id = event.target.value;
                  const currentScope = scope;
                  setBusy(student.id);
                  try {
                    await saveLpuTrackerCoach(student, year, semester, id, currentUser);
                    const updated = await loadLpuTrackerCoaches(year, semester);
                    if (scopeRef.current === currentScope) setAssignments(updated);
                    toast.success('Coach tersimpan.');
                  } catch (issue) {
                    toast.error(message(issue));
                  } finally {
                    setBusy('');
                  }
                }} className="border rounded-lg p-2 text-xs w-44"><option value="">{sourceReady.coachAssignments ? 'Belum ditetapkan' : 'Data coach belum dapat dimuat'}</option>{assignedCoach?.coachId && !coaches.some(item => item.uid === assignedCoach.coachId) && <option value={assignedCoach.coachId}>{assignedCoach.coachName} (tercatat)</option>}{coaches.map(item => <option key={item.uid} value={item.uid}>{item.name}</option>)}</select></td>}{displayedColumns.map(column => {
                const cell = cellMap.get(trackerCellId(column.id, student.id));
                return <td key={column.id} className="p-1 border-l align-top">{!sourceReady.cells ? <span className="p-3 block text-xs text-rose-700">Data sel belum dapat dimuat</span> : cell && cell.visible && !column.archived ? <CellEditor cell={cell} actor={currentUser} readOnly={readOnly || !coreReady || loading} onPasteRange={pasteRange} onSaved={updated => setCells(previous => previous.map(item => item.id === updated.id ? updated : item))} /> : <span className="p-3 block text-xs text-slate-400">{column.archived ? 'Diarsipkan' : 'Tidak berlaku'}</span>}</td>;
              })}</tr>;
          })}</tbody></table>{!visible.length && <p className="p-8 text-sm text-slate-500">Tidak ada siswa yang cocok dengan filter. Filter baris tidak mengubah cakupan header kelas.</p>}{sourceReady.columns && !displayedColumns.length && !!classScopeStudents.length && <p className="p-6 text-sm text-slate-500">Belum ada header untuk kelas ini. Pilih satu kelas lalu gunakan Tambah Header.</p>}</div>}
    <section className="border rounded-2xl bg-white p-4"><button disabled={loadingLegacy} className="text-sm underline text-slate-600" onClick={async () => {
        if (legacy) {
          setLegacy(null);
          return;
        }
        setLoadingLegacy(true);
        try {
          setLegacy(await loadLpuTrackerLegacy(year));
        } catch (issue) {
          toast.error(message(issue));
        } finally {
          setLoadingLegacy(false);
        }
      }}>{loadingLegacy ? 'Memuat riwayat…' : legacy ? 'Tutup riwayat lama' : 'Lihat riwayat tugas lama — baca saja'}</button>{legacy && <div className="mt-3 max-h-96 overflow-auto text-xs"><p className="mb-3 text-slate-500">Data lama tidak diubah, tidak dibuat ulang, dan tidak dihitung sebagai progres tracker baru.</p><table className="w-full text-left"><thead><tr><th className="p-2">Siswa</th><th className="p-2">Tanggal</th><th className="p-2">Pelajaran / Tugas</th><th className="p-2">Status lama</th></tr></thead><tbody>{legacy.filter(item => item.subjectKey === subject && (classId === 'ALL' || classStudents.some(student => student.id === item.studentId))).map(item => <tr key={item.id} className="border-t"><td className="p-2">{item.studentName || item.studentId}</td><td className="p-2">{item.date}</td><td className="p-2">{item.title}<p className="text-slate-400">{item.instructions}</p></td><td className="p-2">{item.status}</td></tr>)}</tbody></table></div>}</section>
    {editor && selectedClass && <HeaderEditor key={editor.column?.id || `new-${scope}-${classId}`} column={editor.column} students={classStudents} className={selectedClass.name} year={year} semester={semester} subject={subject} actor={currentUser} defaultOrder={Math.max(0, ...columns.filter(column => column.studentIds.some(id => classScopeIds.has(id))).map(column => column.order)) + 1} onClose={() => setEditor(null)} onSaved={() => setRefresh(value => value + 1)} />}
  </div>;
}
