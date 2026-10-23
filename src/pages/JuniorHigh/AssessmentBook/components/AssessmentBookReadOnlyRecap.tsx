import * as React from 'react';
import { BookOpen, Layers, BarChart3, Lock, RefreshCw, Search, ChevronDown, ChevronRight, Info, X, Loader2, AlertCircle } from 'lucide-react';
import { useAcademicYear } from '../../../../context/AcademicYearContext';
import type { Class as SchoolClass, Student, LearningGoal, JHAssessmentLO, JHFormativeEntry, JHSummativeEntry } from '../../../../types';
import { isLegacyScore } from '../../../../types';
import { getClasses, getActiveStudents } from '../../../../lib/firebase';
import { JH_SUBJECT_CATALOG } from '../../../../constants/juniorHighSubjectCatalog';
import { getJHGradeLevelNumber } from '../../../../services/juniorHighMidtermService';
import { getJuniorHighLGs, getJuniorHighUALGs, getJHUnitActivities, getJHUnitActivityEnrolledStudents, getLOsForLG, getFormativeEntries, getSummativeEntries, buildUAClassId, formatDateWIB, JH_UA_CATEGORIES_CONFIG } from '../../../../services/juniorHighAssessmentBookService';
import type { JHUAActivityOption } from '../../../../services/juniorHighAssessmentBookService';

type Mode = 'SUBJECT' | 'UNIT_ACTIVITY';
type RecapStudent = Student & { className?: string; nis?: string };
interface Props {
  onSelectInput: (mode: Mode) => void;
  initialYear?: string;
  initialSemester?: string;
  initialMode?: Mode;
  initialSubject?: string;
  initialClassId?: string;
  initialCategory?: string;
  initialActivityId?: string;
}
interface Group {
  goal: LearningGoal;
  los: JHAssessmentLO[];
  formative: JHFormativeEntry[];
  latest: Map<string, JHFormativeEntry>;
  summative: Map<string, JHSummativeEntry>;
  conflicts: Set<string>;
}
interface Bundle { scope: string; students: RecapStudent[]; groups: Group[]; }
type Detail = { kind: 'GOAL'; goalId: string } | { kind: 'LO'; goalId: string; studentId: string; loId: string } | { kind: 'SUM'; goalId: string; studentId: string };
const control = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50';
const action = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const keyOf = (studentId: string, loId: string) => `${studentId}|${loId}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const goalText = (goal: LearningGoal) => goal.goalText || goal.code || 'Learning Goal';
function scoreStyle(value: string): string {
  if (value === 'A' || value === 'Achieved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (value === 'B' || value === 'Not Achieved') return 'bg-rose-50 text-rose-800 border-rose-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
function FormativeBadge({ entry }: { entry?: JHFormativeEntry }) {
  if (!entry) return <span aria-label="Belum dinilai" className="text-slate-400">—</span>;
  const score = entry.comprehensionLevel;
  const legacy = isLegacyScore(score);
  const label = score === 'Achieved' ? 'ACH' : score === 'Not Achieved' ? 'NACH' : legacy ? `${score} (Lama)` : String(score);
  return <span aria-label={legacy ? `${score}, skala lama` : score} className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${legacy ? 'bg-amber-50 text-amber-800 border-amber-200' : scoreStyle(score)}`}>{label}</span>;
}
function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="m-auto max-h-[90vh] w-[92vw] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40">
    <div className="flex max-h-[90vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs text-slate-500">Hanya lihat · tidak mengubah penilaian</p></div><button type="button" autoFocus aria-label="Tutup detail" onClick={onClose} className={action}><X size={16} /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      <footer className="flex shrink-0 justify-end border-t border-slate-200 p-3"><button type="button" className={action} onClick={onClose}>Tutup</button></footer>
    </div>
  </dialog>;
}
async function mapLimited<T, R>(items: T[], task: (item: T) => Promise<R>, cancelled: () => boolean): Promise<R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  let stopped = false;
  const worker = async () => {
    while (!cancelled() && !stopped) {
      const index = cursor++;
      if (index >= items.length) return;
      try { result[index] = await task(items[index]); }
      catch (error) { stopped = true; throw error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, () => worker()));
  return result;
}
function makeGroup(goal: LearningGoal, los: JHAssessmentLO[], entries: JHFormativeEntry[], sums: JHSummativeEntry[], eligible: Set<string>): Group {
  const formative = entries.filter(entry => eligible.has(entry.studentId)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
  const latest = new Map<string, JHFormativeEntry>();
  formative.forEach(entry => latest.set(keyOf(entry.studentId, entry.loId), entry));
  const summative = new Map<string, JHSummativeEntry>();
  const conflicts = new Set<string>();
  sums.filter(entry => eligible.has(entry.studentId)).forEach(entry => {
    if (summative.has(entry.studentId)) conflicts.add(entry.studentId);
    else summative.set(entry.studentId, entry);
  });
  return { goal, los, formative, latest, summative, conflicts };
}

export default function AssessmentBookReadOnlyRecap({ onSelectInput, initialYear, initialSemester = '1', initialMode = 'SUBJECT', initialSubject = '', initialClassId = '', initialCategory = '', initialActivityId = '' }: Props) {
  const { activeYear } = useAcademicYear();
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [year, setYear] = React.useState(initialYear || activeYear || '');
  const [semester, setSemester] = React.useState(initialSemester);
  const [subject, setSubject] = React.useState(initialSubject);
  const [classId, setClassId] = React.useState(initialClassId);
  const [category, setCategory] = React.useState(initialCategory);
  const [activityId, setActivityId] = React.useState(initialActivityId);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [classesBusy, setClassesBusy] = React.useState(true);
  const [classesError, setClassesError] = React.useState('');
  const [classesRetry, setClassesRetry] = React.useState(0);
  const [activities, setActivities] = React.useState<JHUAActivityOption[]>([]);
  const [activitiesBusy, setActivitiesBusy] = React.useState(false);
  const [activitiesError, setActivitiesError] = React.useState('');
  const [activityPeriodLoaded, setActivityPeriodLoaded] = React.useState('');
  const [activitiesRetry, setActivitiesRetry] = React.useState(0);
  const [bundle, setBundle] = React.useState<Bundle | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<{ scope: string; text: string } | null>(null);
  const [reload, setReload] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [goalFilter, setGoalFilter] = React.useState('ALL');
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const isUA = mode === 'UNIT_ACTIVITY';
  const activityPeriod = JSON.stringify([year, semester]);
  const yearOptions = React.useMemo(() => [...new Set([initialYear, activeYear, year, ...classes.map(item => item.academicYear)].filter((value): value is string => !!value))].sort((a, b) => b.localeCompare(a)), [classes, initialYear, activeYear, year]);
  const yearClasses = React.useMemo(() => classes.filter(item => item.unitId === 'JUNIOR_HIGH' && item.academicYear === year && item.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true })), [classes, year]);
  const selectedClass = yearClasses.find(item => item.id === classId);
  const activity = activityPeriodLoaded === activityPeriod ? activities.find(item => item.id === activityId && item.category === category) : undefined;
  const scope = JSON.stringify([mode, year, semester, classId, isUA ? category : '', isUA ? activityId : subject]);
  const ready = !!year && !!semester && !!selectedClass && !classesBusy && !classesError && (isUA ? !!activity && !activitiesBusy && !activitiesError : !!subject);

  React.useEffect(() => {
    let cancelled = false;
    setClassesBusy(true); setClassesError('');
    getClasses().then(items => { if (!cancelled) setClasses(items || []); }).catch(error => { if (!cancelled) setClassesError(errorMessage(error)); }).finally(() => { if (!cancelled) setClassesBusy(false); });
    return () => { cancelled = true; };
  }, [classesRetry]);
  React.useEffect(() => {
    if (!isUA) return;
    let cancelled = false;
    setActivitiesBusy(true); setActivitiesError(''); setActivityPeriodLoaded('');
    getJHUnitActivities({ academicYear: year, semester }).then(items => {
      if (cancelled) return;
      setActivities(items); setActivityPeriodLoaded(activityPeriod);
      setActivityId(previous => items.some(item => item.id === previous) ? previous : '');
    }).catch(error => { if (!cancelled) setActivitiesError(errorMessage(error)); }).finally(() => { if (!cancelled) setActivitiesBusy(false); });
    return () => { cancelled = true; };
  }, [isUA, year, semester, activityPeriod, activitiesRetry]);
  React.useEffect(() => { setDetail(null); setGoalFilter('ALL'); setCollapsed(new Set()); }, [scope]);

  React.useEffect(() => {
    let cancelled = false;
    setFailure(null);
    if (!ready || !selectedClass) { setBusy(false); return () => { cancelled = true; }; }
    const selected = selectedClass;
    const selectedActivity = activity;
    setBusy(true);
    const load = async () => {
      try {
        let students: RecapStudent[];
        let goals: LearningGoal[];
        let assessmentClassId = selected.id;
        let assessmentSubject = subject;
        if (isUA && selectedActivity) {
          const classesMap = Object.fromEntries(yearClasses.map(item => [item.id, item.name]));
          const classGrades = Object.fromEntries(yearClasses.map(item => [item.id, String(getJHGradeLevelNumber(item) || '')]));
          const [roster, list] = await Promise.all([
            getJHUnitActivityEnrolledStudents({ academicYear: year, semester, category: selectedActivity.category, unitActivityName: selectedActivity.name, classesMap, classGrades }),
            getJuniorHighUALGs({ unitActivityName: selectedActivity.name, category: selectedActivity.category, targetGrade: 'ALL', academicYear: year })
          ]);
          students = roster.filter(student => student.classId === selected.id).map(student => ({ ...student, className: selected.name } as unknown as RecapStudent));
          goals = list;
          assessmentClassId = buildUAClassId(selectedActivity.name, 'ALL', selectedActivity.category);
          assessmentSubject = selectedActivity.name;
        } else {
          const grade = String(getJHGradeLevelNumber(selected) || '');
          if (!grade) throw new Error('Grade kelas tidak dapat dikenali. Periksa data kelas terlebih dahulu.');
          const [roster, list] = await Promise.all([getActiveStudents(selected.id, year), getJuniorHighLGs(grade, subject, year)]);
          students = (roster || []).map(student => ({ ...student, className: selected.name }));
          goals = list;
        }
        if (cancelled) return;
        students.sort((a, b) => (a.attendanceNumber ?? a.noAbsen ?? 999) - (b.attendanceNumber ?? b.noAbsen ?? 999) || a.name.localeCompare(b.name, 'id'));
        goals = [...new Map(goals.map(goal => [goal.id, goal])).values()].sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'id', { numeric: true }) || a.id.localeCompare(b.id));
        const eligible = new Set(students.map(student => student.id));
        const groups = await mapLimited(goals, async goal => {
          const params = { classId: assessmentClassId, subjectId: assessmentSubject, academicYear: year, semester, lgId: goal.id, isUAMode: isUA };
          const [los, formative, summative] = await Promise.all([getLOsForLG(params), getFormativeEntries(params), getSummativeEntries(params)]);
          return makeGroup(goal, los, formative, summative, eligible);
        }, () => cancelled);
        if (!cancelled) setBundle({ scope, students, groups });
      } catch (error) { if (!cancelled) setFailure({ scope, text: errorMessage(error) }); }
      finally { if (!cancelled) setBusy(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [scope, ready, selectedClass, activity, yearClasses, reload]);
  React.useEffect(() => {
    if (bundle?.scope === scope && goalFilter !== 'ALL' && !bundle.groups.some(group => group.goal.id === goalFilter)) setGoalFilter('ALL');
  }, [bundle, scope, goalFilter]);

  const data = ready && !busy && bundle?.scope === scope && failure?.scope !== scope ? bundle : null;
  const error = classesError || (isUA ? activitiesError : '') || (failure?.scope === scope ? failure.text : '');
  const loading = classesBusy || (isUA && activitiesBusy) || busy;
  const groups = data?.groups.filter(group => goalFilter === 'ALL' || group.goal.id === goalFilter) || [];
  const students = data?.students.filter(student => `${student.name} ${student.nisn || ''} ${student.nis || ''}`.toLowerCase().includes(search.trim().toLowerCase())) || [];
  const conflicts = data?.groups.reduce((total, group) => total + group.conflicts.size, 0) || 0;
  const columnCount = 1 + groups.reduce((total, group) => total + 1 + (collapsed.has(group.goal.id) ? 0 : group.los.length), 0);
  const detailGroup = detail && data?.groups.find(group => group.goal.id === detail.goalId);
  const detailStudent = detail && detail.kind !== 'GOAL' ? data?.students.find(student => student.id === detail.studentId) : undefined;
  const detailLO = detail?.kind === 'LO' ? detailGroup?.los.find(lo => lo.id === detail.loId) : undefined;
  const history = detail?.kind === 'LO' ? detailGroup?.formative.filter(entry => entry.studentId === detail.studentId && entry.loId === detail.loId).slice().reverse() || [] : [];
  const active = detail?.kind === 'LO' ? detailGroup?.latest.get(keyOf(detail.studentId, detail.loId)) : undefined;
  const sum = detail?.kind === 'SUM' ? detailGroup?.summative.get(detail.studentId) : undefined;
  const sumConflict = detail?.kind === 'SUM' && detailGroup?.conflicts.has(detail.studentId);
  const toggleGoal = (id: string) => setCollapsed(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const refresh = () => {
    setDetail(null);
    if (classesError) setClassesRetry(value => value + 1);
    else if (isUA && (activitiesError || !activity)) setActivitiesRetry(value => value + 1);
    else setReload(value => value + 1);
  };

  return <div className="min-h-screen bg-slate-50/50 pb-16">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 p-5"><div><p className="text-xs font-semibold text-blue-600">Lumina Junior High · Buku Asesmen Guru</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900"><BookOpen className="text-blue-600" />Assessment Book</h1><p className="mt-1 text-xs text-slate-500">Rekap LG, LO, dan sumatif per kelas.</p></div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600"><Lock size={12} />Hanya lihat</span><button type="button" disabled={loading} className={action} onClick={refresh}><RefreshCw size={14} />Segarkan</button></div></div></header>
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <nav aria-label="Mode Assessment Book" className="flex w-fit max-w-full flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1"><button type="button" className={`${action} border-transparent`} onClick={() => onSelectInput('SUBJECT')}><BookOpen size={14} />Mata Pelajaran</button><button type="button" className={`${action} border-transparent`} onClick={() => onSelectInput('UNIT_ACTIVITY')}><Layers size={14} />Unit Aktivitas</button><button type="button" aria-current="page" className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-purple-500"><BarChart3 size={14} />Rekap</button></nav>
      <section aria-label="Filter Rekap" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Konteks"><select className={control} value={mode} onChange={event => { setMode(event.target.value as Mode); setClassId(''); }}><option value="SUBJECT">Mata Pelajaran</option><option value="UNIT_ACTIVITY">Unit Aktivitas</option></select></Field>
          <Field label="Tahun ajaran"><select className={control} value={year} disabled={classesBusy} onChange={event => { setYear(event.target.value); setClassId(''); setActivityId(''); }}><option value="">Pilih tahun ajaran</option>{yearOptions.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
          <Field label="Semester"><select className={control} value={semester} onChange={event => setSemester(event.target.value)}><option value="1">Semester 1 (Ganjil)</option><option value="2">Semester 2 (Genap)</option></select></Field>
        </div>
        <div className={`grid gap-3 ${isUA ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {isUA ? <><Field label="Kategori Unit Aktivitas"><select className={control} value={category} onChange={event => { setCategory(event.target.value); setActivityId(''); }}><option value="">Pilih kategori</option>{JH_UA_CATEGORIES_CONFIG.map(item => <option key={item.key} value={item.key}>{item.shortLabel}</option>)}</select></Field><Field label="Unit Aktivitas"><select className={control} value={activityId} disabled={!category || activitiesBusy || activityPeriodLoaded !== activityPeriod || !!activitiesError} onChange={event => setActivityId(event.target.value)}><option value="">{activitiesBusy ? 'Memuat aktivitas…' : 'Pilih aktivitas'}</option>{activities.filter(item => item.category === category).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></> : <Field label="Mata pelajaran"><select className={control} value={subject} onChange={event => setSubject(event.target.value)}><option value="">Pilih mata pelajaran</option>{subject && !JH_SUBJECT_CATALOG.some(item => item.label === subject) && <option value={subject}>{subject}</option>}{JH_SUBJECT_CATALOG.map(item => <option key={item.key} value={item.label}>{item.label}</option>)}</select></Field>}
          <Field label={isUA ? 'Kelas asal peserta (wajib)' : 'Kelas (wajib)'}><select className={control} value={classId} disabled={classesBusy} onChange={event => setClassId(event.target.value)}><option value="">Pilih satu kelas</option>{yearClasses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        </div>
      </section>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={18} className="shrink-0" /><div><p className="font-semibold">Rekap belum dapat dimuat.</p><p className="mt-1 whitespace-pre-wrap break-words">{error}</p><p className="mt-1">Ini bukan berarti siswa belum dinilai. Periksa pesan izin/indeks jika ada, lalu klik Segarkan.</p></div></div>}
      {loading && !error && <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600"><Loader2 size={18} className="animate-spin" />Memuat rekap…</div>}
      {!ready && !error && !classesBusy && !(isUA && activitiesBusy) && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Pilih {isUA ? 'aktivitas dan satu kelas asal peserta' : 'mata pelajaran dan satu kelas'} untuk melihat rekap.</div>}
      {data && <>
        <section className="rounded-xl border border-purple-100 bg-purple-50/50 p-4"><h2 className="font-bold text-slate-900">{isUA ? activity?.name : subject} · {selectedClass?.name}</h2><p className="mt-1 text-sm text-slate-600">{year} · Semester {semester} · {data.students.length} {isUA ? 'peserta aktivitas dari kelas ini' : 'siswa'} · {data.groups.length} LG</p>{isUA && <p className="mt-1 text-xs text-slate-500">LG/LO bersama milik aktivitas. Daftar siswa dibatasi peserta dari kelas asal terpilih.</p>}</section>
        {conflicts > 0 && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ada {conflicts} pasangan siswa/LG dengan sumatif ganda. Sel ditandai Konflik, tidak dipilih otomatis.</div>}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3"><label className="relative block min-w-[180px] flex-1"><span className="sr-only">Cari nama siswa atau NIS</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${control} pl-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama / NIS…" /></label><div className="min-w-[200px]"><Field label="Learning Goal"><select className={control} value={goalFilter} onChange={event => setGoalFilter(event.target.value)}><option value="ALL">Semua LG</option>{data.groups.map((group, index) => <option key={group.goal.id} value={group.goal.id}>{group.goal.code || `LG ${index + 1}`} · {goalText(group.goal)}</option>)}</select></Field></div><p className="pb-2 text-xs text-slate-500">{students.length} dari {data.students.length} siswa ditampilkan</p></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"><span><span className="font-bold text-emerald-700">ACH</span> = Achieved</span><span><span className="font-bold text-rose-700">NACH</span> = Not Achieved</span><span>— = Belum dinilai / belum sumatif</span><span>(Lama) = Formatif skala lama, tidak dikonversi</span><span>Sumatif: B / D / A</span></div>
        {!data.students.length ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{isUA ? 'Tidak ada peserta aktivitas dari kelas ini pada periode terpilih.' : 'Tidak ada siswa aktif pada kelas/tahun ajaran terpilih.'}</div> : !data.groups.length ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Belum ada LG tersedia untuk konteks ini.</div> : <div tabIndex={0} role="region" aria-label="Tabel Rekap LG LO dan Sumatif; geser untuk melihat kolom lain" className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm">
              <tr><th rowSpan={2} className="sticky left-0 z-30 min-w-[210px] border-b border-r border-slate-200 bg-slate-50 p-3">Nama siswa</th>{groups.map(group => <th key={group.goal.id} colSpan={1 + (collapsed.has(group.goal.id) ? 0 : group.los.length)} className="border-b border-r border-slate-200 bg-slate-50 p-2 align-top"><div className="flex items-center justify-between gap-2"><button type="button" aria-expanded={!collapsed.has(group.goal.id)} aria-label={`${collapsed.has(group.goal.id) ? 'Tampilkan' : 'Ringkas'} LO ${group.goal.code || 'LG'}`} onClick={() => toggleGoal(group.goal.id)} className="flex items-center gap-1 rounded-md px-1 py-1 font-bold text-purple-800 hover:bg-purple-100 focus-visible:ring-2 focus-visible:ring-purple-500 cursor-pointer">{collapsed.has(group.goal.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{group.goal.code || 'LG'}</button><button type="button" aria-label={`Lihat indikator ${group.goal.code || 'LG'}`} onClick={() => setDetail({ kind: 'GOAL', goalId: group.goal.id })} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-purple-500 cursor-pointer"><Info size={15} /></button></div><p title={goalText(group.goal)} className="max-w-[360px] truncate px-1 text-xs font-normal text-slate-600">{goalText(group.goal)}</p>{!group.los.length && <p className="px-1 text-xs font-normal text-slate-400">Belum ada LO</p>}</th>)}</tr>
              <tr>{groups.map(group => <React.Fragment key={group.goal.id}>{!collapsed.has(group.goal.id) && group.los.map(lo => <th key={lo.id} title={lo.title} className="min-w-[108px] border-b border-r border-slate-200 bg-white px-2 py-2 text-center text-xs font-semibold text-slate-700"><button type="button" onClick={() => setDetail({ kind: 'GOAL', goalId: group.goal.id })} className="rounded p-1 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-purple-500 cursor-pointer">{lo.code || 'LO'}</button></th>)}<th className="min-w-[110px] border-b border-r border-slate-200 bg-blue-50 px-2 py-2 text-center text-xs font-bold text-blue-900">Sumatif</th></React.Fragment>)}</tr>
            </thead>
            <tbody>{students.length ? students.map((student, index) => <tr key={student.id} className="group hover:bg-slate-50"><th scope="row" className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white p-3 font-normal group-hover:bg-slate-50"><div className="flex items-start gap-2"><span className="min-w-[24px] text-xs text-slate-400">{student.attendanceNumber ?? student.noAbsen ?? index + 1}</span><div><p className="font-semibold text-slate-900">{student.name}</p><p className="mt-0.5 text-xs text-slate-500">{student.nisn || student.nis || '—'}</p>{isUA && <p className="mt-0.5 text-xs text-slate-500">{student.className}</p>}</div></div></th>{groups.map(group => <React.Fragment key={group.goal.id}>{!collapsed.has(group.goal.id) && group.los.map(lo => <td key={lo.id} className="border-b border-r border-slate-100 p-1.5 text-center"><button type="button" aria-label={`Lihat ${lo.code} untuk ${student.name}`} onClick={() => setDetail({ kind: 'LO', goalId: group.goal.id, studentId: student.id, loId: lo.id })} className="w-full rounded-lg px-2 py-2 hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 cursor-pointer"><FormativeBadge entry={group.latest.get(keyOf(student.id, lo.id))} /></button></td>)}<td className="border-b border-r border-slate-200 bg-blue-50/30 p-1.5 text-center"><button type="button" aria-label={`Lihat sumatif ${group.goal.code} untuk ${student.name}`} onClick={() => setDetail({ kind: 'SUM', goalId: group.goal.id, studentId: student.id })} className="w-full rounded-lg px-2 py-2 hover:bg-blue-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 cursor-pointer">{group.conflicts.has(student.id) ? <span className="text-xs font-semibold text-amber-800">Konflik</span> : group.summative.has(student.id) ? <span className={`inline-flex rounded-md border px-3 py-1 text-xs font-bold ${scoreStyle(group.summative.get(student.id)!.summativeScore)}`}>{group.summative.get(student.id)!.summativeScore}</span> : <span aria-label="Belum ada sumatif" className="text-slate-400">—</span>}</button></td></React.Fragment>)}</tr>) : <tr><td colSpan={columnCount} className="p-8 text-center text-slate-500">Tidak ada siswa yang sesuai pencarian.</td></tr>}</tbody>
          </table>
        </div>}
      </>}
    </main>
    {detail && detailGroup && <Dialog title={detail.kind === 'GOAL' ? 'Indikator LG dan LO' : detail.kind === 'LO' ? 'Rincian formatif' : 'Rincian sumatif'} onClose={() => setDetail(null)}>
      {detailStudent && <div><h3 className="font-bold text-slate-900">{detailStudent.name}</h3><p className="text-sm text-slate-500">{selectedClass?.name} · {year} · Semester {semester}</p></div>}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-purple-700">{detailGroup.goal.code || 'Learning Goal'}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{goalText(detailGroup.goal)}</p></section>
      {detail.kind === 'GOAL' && <div className="space-y-2">{detailGroup.los.length ? detailGroup.los.map(lo => <section key={lo.id} className="rounded-xl border border-slate-200 p-3"><h4 className="text-sm font-bold">{lo.code}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{lo.title}</p></section>) : <p className="text-sm text-slate-500">Belum ada LO.</p>}</div>}
      {detail.kind === 'LO' && <><section><h4 className="text-sm font-bold">{detailLO?.code}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{detailLO?.title}</p></section><div className="flex items-center gap-3"><span className="text-sm font-semibold">Capaian aktif:</span>{active ? <FormativeBadge entry={active} /> : <span className="text-sm text-slate-500">Belum dinilai</span>}</div><p className="text-xs text-slate-500">Nilai aktif mengikuti createdAt lalu ID, sama dengan halaman input; bukan tanggal asesmen.</p><h4 className="text-sm font-bold">Riwayat asesmen ({history.length})</h4>{!history.length && <p className="text-sm text-slate-500">Belum ada asesmen pada LO ini.</p>}{history.map(entry => <article key={entry.id} className="space-y-2 rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center gap-2"><FormativeBadge entry={entry} />{entry.id === active?.id && <span className="rounded bg-purple-50 px-2 py-1 text-xs font-bold text-purple-700">Terkini</span>}{entry.correctedAt && <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Dikoreksi</span>}</div><p className="text-sm">Tanggal asesmen: {formatDateWIB(entry.date)}</p><p className="text-sm">Kegiatan: {entry.formativeTask || '—'}</p><p className="whitespace-pre-wrap text-sm">Next Action: {entry.nextAction || '—'}</p>{entry.notes && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm">{entry.notes}</p>}<p className="text-xs text-slate-500">Oleh: {entry.teacherName || '—'} · Dicatat: {formatDateWIB(entry.createdAt)}</p>{entry.correctedAt && <p className="text-xs text-slate-500">Dikoreksi: {formatDateWIB(entry.correctedAt)}{entry.correctedByName ? ` · ${entry.correctedByName}` : ''}{entry.correctionReason ? ` · ${entry.correctionReason}` : ''}</p>}</article>)}</>}
      {detail.kind === 'SUM' && (sumConflict ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ada sumatif ganda. Rekap tidak memilih salah satunya otomatis. Periksa melalui alur administrasi yang berlaku.</p> : sum ? <section className="space-y-3"><p><span className={`inline-flex rounded-lg border px-4 py-2 font-bold ${scoreStyle(sum.summativeScore)}`}>Sumatif: {sum.summativeScore}</span></p><p className="text-sm">Tanggal asesmen: {formatDateWIB(sum.date)}</p><p className="text-sm">Kegiatan: {sum.summativeTask || '—'}</p>{sum.notes && <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">{sum.notes}</p>}<p className="text-xs text-slate-500">Oleh: {sum.teacherName || '—'} · Dicatat: {formatDateWIB(sum.createdAt)}</p>{sum.updatedAt && <p className="text-xs text-slate-500">Diperbarui: {formatDateWIB(sum.updatedAt)}{sum.updatedByName ? ` · ${sum.updatedByName}` : ''}</p>}</section> : <p className="text-sm text-slate-500">Belum ada nilai sumatif pada LG ini.</p>)}
    </Dialog>}
  </div>;
}
