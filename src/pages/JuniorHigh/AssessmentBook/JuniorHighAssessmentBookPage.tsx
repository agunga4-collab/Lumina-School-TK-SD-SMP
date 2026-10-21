import * as React from 'react';
import { BookOpen, Layers, Download, Settings, RefreshCw, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { Class, Student, LearningGoal, JHAssessmentLO, JHFormativeEntry, JHSummativeEntry, JHFormativeScore, JHAssessmentUAContext, AssessmentBookOptions, DEFAULT_ASSESSMENT_BOOK_OPTIONS, isLegacyScore } from '../../../types';
import { getClasses, getActiveStudents } from '../../../lib/firebase';
import { getAssessmentBookOptions, getJuniorHighLGs, getJuniorHighUALGs, getJHUnitActivities, getJHUnitActivityEnrolledStudents, JH_UA_CATEGORIES_CONFIG, JHUAActivityOption, JHUAParticipant, buildUAClassId, parseUAGroupId, getLOsForLG, getFormativeEntries, getSummativeEntries, getTodayWIB, formatDateWIB, addFormativeEntry, correctFormativeEntry, bulkAddFormativeEntries } from '../../../services/juniorHighAssessmentBookService';
import { getJHGradeLevelNumber } from '../../../services/juniorHighMidtermService';
import { FormativeMatrixGrid } from './components/FormativeMatrixGrid';
import { StudentRecapView } from './components/StudentRecapView';
import { FormativeAssessmentModal } from './components/FormativeAssessmentModal';
import { SummativeModal } from './components/SummativeModal';
import { ManageLOModal } from './components/ManageLOModal';
import { ProposeLGModal } from './components/ProposeLGModal';
import { BulkFormativeModal } from './components/BulkFormativeModal';
import { AssessmentBookSettingsModal } from './components/AssessmentBookSettingsModal';
import { exportJuniorHighAssessmentBookExcel } from '../../../utils/exportJuniorHighAssessmentBookExcel';
import { JH_SUBJECT_CATALOG, getJHSubjectLabel } from '../../../constants/juniorHighSubjectCatalog';
import { toast } from 'sonner';

type UAStudent = Student & { className: string; grade?: number };
const control = 'w-full text-xs px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-500 disabled:opacity-50';
const fieldLabel = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1';
const otherValue = '__CUSTOM_VALUE__';
function problem(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function scoreText(value: JHFormativeEntry['comprehensionLevel']): string { return isLegacyScore(value) ? `${value} (Lama)` : value; }
function latestEntries(entries: JHFormativeEntry[]): Record<string, JHFormativeEntry> {
  const result: Record<string, JHFormativeEntry> = {};
  [...entries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id)).forEach(entry => { result[`${entry.studentId}|${entry.loId}`] = entry; });
  return result;
}
function TextChoice({ label, options, value, onChange, optional = false }: { label: string; options: string[]; value: string; onChange: (value: string) => void; optional?: boolean }) {
  const [custom, setCustom] = React.useState(false);
  const listed = options.includes(value);
  const customMode = custom || (!!value && !listed);
  return <div><label className={fieldLabel}>{label}</label><select className={control} value={customMode ? otherValue : value} onChange={event => {
    const next = event.target.value;
    setCustom(next === otherValue);
    onChange(next === otherValue ? '' : next);
  }}><option value="">{optional ? 'Boleh kosong' : 'Pilih...'}</option>{options.filter(Boolean).map(option => <option key={option} value={option}>{option}</option>)}<option value={otherValue}>Lainnya — Tulis sendiri</option></select>{customMode && <input className={`${control} mt-2`} value={value} onChange={event => onChange(event.target.value)} placeholder="Tulis pilihan Anda..." required />}</div>;
}
interface UASessionProps {
  students: UAStudent[]; lo: JHAssessmentLO; scope: { classId: string; subjectId: string; academicYear: string; semester: string };
  options: AssessmentBookOptions; teacherId: string; teacherName: string; onClose: () => void; onSaved: () => void;
}
function UASessionModal({ students, lo, scope, options, teacherId, teacherName, onClose, onSaved }: UASessionProps) {
  const [sessionId] = React.useState(() => `UA-${teacherId}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [date, setDate] = React.useState(getTodayWIB);
  const [task, setTask] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [rows, setRows] = React.useState<Record<string, { level: JHFormativeScore | ''; action: string; notes: string }>>({});
  const [sharedAction, setSharedAction] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const visible = students.filter(student => `${student.name} ${student.nisn || ''} ${student.id} ${student.className}`.toLowerCase().includes(search.toLowerCase()));
  const selected = visible.filter(student => selection.has(student.id));
  const assessed = selected.filter(student => rows[student.id]?.level);
  const edit = (id: string, changes: Partial<{ level: JHFormativeScore | ''; action: string; notes: string }>) => setRows(previous => ({ ...previous, [id]: { level: '', action: '', notes: '', ...previous[id], ...changes } }));
  const close = () => { if (!savingRef.current && (!Object.keys(rows).length || window.confirm('Tutup sesi? Perubahan yang belum disimpan akan hilang.'))) onClose(); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!date || !task.trim()) { toast.warning('Isi tanggal dan bentuk kegiatan sesi.'); return; }
    if (!assessed.length) { toast.warning('Pilih peserta dan isi capaian LO; tidak ada nilai default.'); return; }
    if (!window.confirm(`Simpan asesmen ${assessed.length} peserta yang dipilih dan terlihat? ${selected.length - assessed.length} peserta terpilih tanpa nilai tidak disimpan.`)) return;
    savingRef.current = true; setSaving(true);
    try {
      await bulkAddFormativeEntries(assessed.map(student => ({
        loId: lo.id, lgId: lo.lgId, classId: student.classId, subjectId: scope.subjectId,
        academicYear: scope.academicYear, semester: scope.semester, studentId: student.id, studentName: student.name,
        date, formativeTask: task.trim(), comprehensionLevel: rows[student.id].level as JHFormativeScore,
        nextAction: rows[student.id].action.trim(), notes: rows[student.id].notes.trim(), teacherId, teacherName, sessionId,
        ...parseUAGroupId(scope.classId)!
      })));
      toast.success(`Asesmen ${assessed.length} peserta UA tersimpan.`); onSaved(); onClose();
    } catch (error) { toast.error(problem(error)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="bg-white rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl"><header className="p-5 border-b flex justify-between items-center"><div><h2 className="font-bold">Asesmen Peserta UA</h2><p className="text-xs text-gray-500">{lo.unitActivityName} · {lo.code} · {lo.title}</p></div><button type="button" disabled={saving} onClick={close} aria-label="Tutup"><X size={20} /></button></header><form onSubmit={save} className="overflow-y-auto p-5 space-y-4"><fieldset disabled={saving} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4"><div><label className={fieldLabel}>Tanggal asesmen (WIB)</label><input type="date" required value={date} onChange={event => setDate(event.target.value)} className={control} /></div><TextChoice label="Formative Task / Bentuk Kegiatan" options={options.formativeTasks} value={task} onChange={setTask} /></div><div className="p-3 rounded-xl bg-purple-50 grid sm:grid-cols-[1fr_auto] gap-3 items-end"><TextChoice label="Next Action untuk peserta terpilih" options={options.nextActions} value={sharedAction} onChange={setSharedAction} /><button type="button" className="px-4 py-2.5 rounded-xl bg-purple-700 text-white text-xs font-bold disabled:opacity-50" disabled={!sharedAction.trim() || !selected.length} onClick={() => {
    if (selected.some(student => rows[student.id]?.action.trim()) && !window.confirm('Ganti Next Action yang sudah terisi untuk peserta terpilih yang terlihat?')) return;
    selected.forEach(student => edit(student.id, { action: sharedAction.trim() }));
  }}>Terapkan ke {selected.length} Peserta</button></div><p className="text-xs text-gray-500">Next Action hanya mengisi draft sesi baru, tidak mengubah nilai atau riwayat. Yang disimpan hanya peserta terpilih, terlihat, dan sudah dinilai.</p><div className="flex flex-wrap gap-3 items-center"><input className={`${control} max-w-sm`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari peserta/kelas/NIS..." /><button type="button" className="text-xs text-purple-700 underline" onClick={() => setSelection(new Set(visible.map(student => student.id)))}>Pilih semua yang terlihat ({visible.length})</button><button type="button" className="text-xs underline" onClick={() => setSelection(new Set())}>Batal pilih</button></div><div className="overflow-x-auto border rounded-xl"><table className="w-full text-left text-xs min-w-[850px]"><thead className="bg-gray-50"><tr>{['Pilih', 'Nama Peserta', 'Kelas Asal', 'Capaian LO', 'Next Action', 'Catatan'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{visible.map(student => <tr key={student.id} className="border-t"><td className="p-3"><input type="checkbox" aria-label={`Pilih ${student.name}`} checked={selection.has(student.id)} onChange={() => setSelection(previous => { const next = new Set(previous); next.has(student.id) ? next.delete(student.id) : next.add(student.id); return next; })} /></td><td className="p-3 font-semibold">{student.name}</td><td className="p-3">{student.className}</td><td className="p-3"><select className={control} value={rows[student.id]?.level || ''} onChange={event => edit(student.id, { level: event.target.value as JHFormativeScore | '' })}><option value="">Belum dinilai</option><option value="Achieved">Achieved</option><option value="Not Achieved">Not Achieved</option></select></td><td className="p-3"><input className={control} value={rows[student.id]?.action || ''} onChange={event => edit(student.id, { action: event.target.value })} placeholder="Tindak lanjut individual" /></td><td className="p-3"><input className={control} value={rows[student.id]?.notes || ''} onChange={event => edit(student.id, { notes: event.target.value })} placeholder="Catatan individual" /></td></tr>)}</tbody></table></div><div className="flex justify-end gap-3 items-center pt-3"><span className="text-xs text-gray-500">{assessed.length} peserta siap disimpan</span><button type="button" className="px-4 py-2 rounded-xl border" onClick={close}>Batal</button><button type="submit" disabled={saving || !assessed.length} className="px-4 py-2 rounded-xl bg-purple-700 text-white font-bold text-xs disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Sesi UA'}</button></div></fieldset></form></div></div>;
}

export default function JuniorHighAssessmentBookPage() {
  const auth = useAuth() as any;
  const effectiveUser = auth.profile || auth.currentUser;
  const { activeYear } = useAcademicYear();
  const role = String(effectiveUser?.role || effectiveUser?.roleId || '').toUpperCase();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isReadOnly = ['PRINCIPAL', 'VICE_PRINCIPAL'].includes(role);
  const teacherId = effectiveUser?.uid || effectiveUser?.id || '';
  const teacherName = effectiveUser?.displayName || effectiveUser?.name || 'Guru';
  const [mode, setMode] = React.useState<'SUBJECT' | 'UNIT_ACTIVITY'>('SUBJECT');
  const isUA = mode === 'UNIT_ACTIVITY';
  const [year, setYear] = React.useState(activeYear || '2026/2027');
  const [semester, setSemester] = React.useState('1');
  const [classId, setClassId] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [uaCategory, setUACategory] = React.useState('');
  const [uaId, setUAId] = React.useState('');
  const [uaGrade, setUAGrade] = React.useState('ALL');
  const [uaClass, setUAClass] = React.useState('ALL');
  const [uaSearch, setUASearch] = React.useState('');
  const [uaOptions, setUAOptions] = React.useState<JHUAActivityOption[]>([]);
  const [loadingUAOptions, setLoadingUAOptions] = React.useState(false);
  const [uaRoster, setUARoster] = React.useState<JHUAParticipant[]>([]);
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [regularStudents, setRegularStudents] = React.useState<Student[]>([]);
  const [goals, setGoals] = React.useState<LearningGoal[]>([]);
  const [lgId, setLGId] = React.useState('');
  const [los, setLOs] = React.useState<JHAssessmentLO[]>([]);
  const [formative, setFormative] = React.useState<JHFormativeEntry[]>([]);
  const [summative, setSummative] = React.useState<JHSummativeEntry[]>([]);
  const [options, setOptions] = React.useState<AssessmentBookOptions>(DEFAULT_ASSESSMENT_BOOK_OPTIONS);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const [loadingRoster, setLoadingRoster] = React.useState(false);
  const [loadingGoals, setLoadingGoals] = React.useState(false);
  const [loadingData, setLoadingData] = React.useState(false);
  const [error, setError] = React.useState('');
  const [reload, setReload] = React.useState(0);
  const [tab, setTab] = React.useState<'MATRIX' | 'RECAP'>('MATRIX');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [proposal, setProposal] = React.useState<{ open: boolean; parentLG?: LearningGoal; existingLG?: LearningGoal }>({ open: false });
  const [bulkLO, setBulkLO] = React.useState<JHAssessmentLO | null>(null);
  const [individual, setIndividual] = React.useState<{ student: Student; lo: JHAssessmentLO } | null>(null);
  const [sumStudent, setSumStudent] = React.useState<Student | null>(null);
  const [quickKey, setQuickKey] = React.useState('');
  const quickLock = React.useRef(false);
  const goalRequest = React.useRef(0);
  const assessmentRequest = React.useRef(0);
  const [loadedScope, setLoadedScope] = React.useState('');
  const [loadedGoals, setLoadedGoals] = React.useState('');
  const [loadedRoster, setLoadedRoster] = React.useState('');
  const selectedClass = classes.find(item => item.id === classId);
  const regularGrade = selectedClass ? String(getJHGradeLevelNumber(selectedClass) || '') : '';
  const activity = uaOptions.find(item => item.id === uaId && item.category === uaCategory);
  const goalScope = JSON.stringify([mode, year, semester, isUA ? uaId : classId, isUA ? 'ALL' : subject, isUA ? uaCategory : regularGrade]);
  const currentGoalScope = React.useRef(goalScope); currentGoalScope.current = goalScope;
  const activeLG = loadedGoals === goalScope ? goals.find(item => item.id === lgId) : undefined;
  // UA learning goals/objectives are shared; grade only filters the roster.
  const targetGrade = isUA ? 'ALL' : regularGrade;
  const groupId = isUA && activity && targetGrade ? buildUAClassId(activity.name, targetGrade, activity.category) : '';
  const effectiveClassId = isUA ? groupId : classId;
  const effectiveSubject = isUA ? activity?.name || '' : subject;
  const scopeKey = JSON.stringify([mode, year, semester, effectiveClassId, effectiveSubject, lgId]);
  const currentScope = React.useRef(scopeKey); currentScope.current = scopeKey;
  const rosterKey = JSON.stringify([mode, year, semester, isUA ? uaId : classId]);
  const students: Student[] = React.useMemo(() => {
    if (loadedRoster !== rosterKey) return [];
    if (!isUA) return regularStudents;
    return uaRoster.filter(student => (uaGrade === 'ALL' || String(student.grade) === uaGrade) &&
      (uaClass === 'ALL' || student.classId === uaClass) && `${student.name} ${student.id} ${student.nisn || ''} ${student.className}`.toLowerCase().includes(uaSearch.toLowerCase())) as unknown as Student[];
  }, [loadedRoster, rosterKey, isUA, regularStudents, uaRoster, uaGrade, uaClass, uaSearch]);
  const visibleIds = new Set(students.map(student => student.id));
  const visibleFormative = isUA ? formative.filter(entry => visibleIds.has(entry.studentId)) : formative;
  const visibleSummative = isUA ? summative.filter(entry => visibleIds.has(entry.studentId)) : summative;
  const refresh = () => setReload(value => value + 1);
  const closeAssessmentModals = () => { setBulkLO(null); setIndividual(null); setSumStudent(null); setManageOpen(false); setProposal({ open: false }); };
  const resetLG = () => { setLGId(''); setGoals([]); setLOs([]); setFormative([]); setSummative([]); closeAssessmentModals(); };
  const selectMode = (next: 'SUBJECT' | 'UNIT_ACTIVITY') => { if (quickLock.current) return; resetLG(); setError(''); setMode(next); setTab('MATRIX'); if (next === 'UNIT_ACTIVITY') { setUAClass('ALL'); setUASearch(''); } };

  React.useEffect(() => {
    let cancelled = false;
    setLoadingClasses(true); setError('');
    Promise.all([getClasses(), getAssessmentBookOptions()]).then(([all, opts]) => {
      if (cancelled) return;
      const list = (all || []).filter(item => item.unitId === 'JUNIOR_HIGH' && item.academicYear === year && item.status !== 'archived');
      setClasses(list); setOptions(opts);
      setClassId(previous => list.some(item => item.id === previous) ? previous : list[0]?.id || '');
    }).catch(issue => { if (!cancelled) setError(problem(issue)); }).finally(() => { if (!cancelled) setLoadingClasses(false); });
    return () => { cancelled = true; };
  }, [year, reload]);

  React.useEffect(() => {
    if (!isUA) return;
    let cancelled = false;
    setUAOptions([]); setError(''); setLoadingUAOptions(true);
    getJHUnitActivities({ academicYear: year, semester }).then(list => {
      if (cancelled) return;
      setUAOptions(list);
      setUAId(previous => list.some(item => item.id === previous && item.category === uaCategory) ? previous : '');
    }).catch(issue => { if (!cancelled) setError(problem(issue)); }).finally(() => { if (!cancelled) setLoadingUAOptions(false); });
    return () => { cancelled = true; };
  }, [isUA, year, semester, reload]);

  React.useEffect(() => {
    let cancelled = false;
    setLoadedRoster(''); setLoadingRoster(true); setRegularStudents([]); setUARoster([]);
    const run = async () => {
      try {
        if (isUA) {
          if (!activity || loadingClasses) return;
          const classesMap = Object.fromEntries(classes.map(item => [item.id, item.name]));
          const classGrades = Object.fromEntries(classes.map(item => [item.id, String(getJHGradeLevelNumber(item) || '')]));
          const list = await getJHUnitActivityEnrolledStudents({ academicYear: year, semester, category: activity.category, unitActivityName: activity.name, classesMap, classGrades });
          if (!cancelled) setUARoster(list);
        } else {
          if (!classId || loadingClasses) return;
          const list = await getActiveStudents(classId, year);
          if (!cancelled) setRegularStudents([...list || []].sort((a, b) => (a.attendanceNumber ?? a.noAbsen ?? 999) - (b.attendanceNumber ?? b.noAbsen ?? 999) || a.name.localeCompare(b.name)));
        }
        if (!cancelled) setLoadedRoster(rosterKey);
      } catch (issue) { if (!cancelled) setError(problem(issue)); }
      finally { if (!cancelled) setLoadingRoster(false); }
    };
    void run(); return () => { cancelled = true; };
  }, [rosterKey, activity?.id, loadingClasses, classes, reload]);

  const loadLearningGoals = React.useCallback(async () => {
    const request = ++goalRequest.current;
    const key = goalScope;
    setLoadingGoals(true); setLoadedGoals(''); setGoals([]);
    try {
      if (isUA ? !activity : !subject || !regularGrade) { setLGId(''); return; }
      const list = isUA ? await getJuniorHighUALGs({ unitActivityName: activity!.name, category: activity!.category, targetGrade: 'ALL', academicYear: year }) : await getJuniorHighLGs(regularGrade, subject, year);
      if (request !== goalRequest.current || key !== currentGoalScope.current) return;
      setGoals(list); setLoadedGoals(key); setLGId(previous => list.some(item => item.id === previous) ? previous : list[0]?.id || '');
    } catch (issue) { if (request === goalRequest.current && key === currentGoalScope.current) setError(problem(issue)); }
    finally { if (request === goalRequest.current) setLoadingGoals(false); }
  }, [goalScope, isUA, activity?.id, subject, regularGrade, year, reload]);
  React.useEffect(() => { void loadLearningGoals(); return () => { goalRequest.current++; }; }, [loadLearningGoals]);

  const loadAssessmentData = React.useCallback(async () => {
    const request = ++assessmentRequest.current;
    const key = scopeKey;
    setLOs([]); setFormative([]); setSummative([]); setLoadedScope(''); setLoadingData(true);
    try {
      if (!activeLG || !effectiveClassId || !effectiveSubject) return;
      const params = { classId: effectiveClassId, subjectId: effectiveSubject, academicYear: year, semester, lgId: activeLG.id, isUAMode: isUA };
      const [loList, fList, sList] = await Promise.all([getLOsForLG(params), getFormativeEntries(params), getSummativeEntries(params)]);
      if (request !== assessmentRequest.current || key !== currentScope.current) return;
      setLOs(loList); setFormative(fList); setSummative(sList); setLoadedScope(key);
    } catch (issue) { if (request === assessmentRequest.current && key === currentScope.current) setError(problem(issue)); }
    finally { if (request === assessmentRequest.current) setLoadingData(false); }
  }, [scopeKey, activeLG?.id, effectiveClassId, effectiveSubject, year, semester, isUA, reload]);
  React.useEffect(() => { void loadAssessmentData(); return () => { assessmentRequest.current++; }; }, [loadAssessmentData]);
  React.useEffect(() => { closeAssessmentModals(); }, [scopeKey, uaGrade, uaClass, uaSearch]);

  const ownUnusedLG = !!activeLG && (activeLG.createdBy === teacherId || (!!effectiveUser?.email && activeLG.createdBy?.toLowerCase() === effectiveUser.email.toLowerCase())) && !los.length && !formative.length && !summative.length;
  const canRender = !!activeLG && loadedScope === scopeKey && !loadingData;
  const context: JHAssessmentUAContext = isUA && groupId ? parseUAGroupId(groupId)! : {};
  const latest = latestEntries(visibleFormative);
  const quickScore = async (student: Student, lo: JHAssessmentLO, level: JHFormativeScore) => {
    if (isReadOnly || quickLock.current) return;
    quickLock.current = true; setQuickKey(`${student.id}|${lo.id}`);
    const old = [...formative].reverse().find(entry => entry.studentId === student.id && entry.loId === lo.id && entry.teacherId === teacherId && entry.date === getTodayWIB());
    try {
      const nextAction = old?.nextAction || (level === 'Achieved' ? 'Lanjut ke LO Berikutnya' : 'Refleksi & Remediasi Terfokus');
      if (old) await correctFormativeEntry({ entryId: old.id, comprehensionLevel: level, correctedBy: teacherId, correctedByName: teacherName, correctionReason: 'Klik cepat UA', nextAction });
      else await addFormativeEntry({ loId: lo.id, lgId: lo.lgId, classId: student.classId, subjectId: effectiveSubject, academicYear: year, semester, studentId: student.id, studentName: student.name, date: getTodayWIB(), formativeTask: '', comprehensionLevel: level, nextAction, teacherId, teacherName, ...context });
      toast.success('Capaian LO tersimpan.'); void loadAssessmentData();
    } catch (issue) { toast.error(problem(issue)); }
    finally { quickLock.current = false; setQuickKey(''); }
  };
  const exportExcel = async () => {
    if (!activeLG || !students.length || !canRender) return;
    try {
      if (!isUA) {
        exportJuniorHighAssessmentBookExcel({ className: selectedClass?.name || 'Junior_High', subjectName: subject, academicYear: year, semester, lg: activeLG, los, students, formativeEntries: visibleFormative, summativeEntries: visibleSummative });
      } else {
        const XLSX = await import('xlsx');
        const rows: any[][] = [['LUMINA JUNIOR HIGH — ASSESMEN UNIT AKTIVITAS'], ['Kategori', activity?.category, 'Aktivitas', activity?.name], ['Tahun Ajaran', year, 'Semester', semester, 'Kelompok target', targetGrade], ['LG', activeLG.code || '', activeLG.goalText], [], ['No', 'NIS/NISN', 'Nama', 'Kelas Asal', ...los.flatMap(lo => [`${lo.code} Capaian`, `${lo.code} Tugas`, `${lo.code} Next Action`, `${lo.code} Tanggal`]), 'Sumatif LG', 'Tugas Sumatif', 'Tanggal Sumatif']];
        students.forEach((student, index) => {
          const row: any[] = [index + 1, student.nisn || student.nis || student.id, student.name, (student as UAStudent).className || student.classId];
          los.forEach(lo => { const entry = latest[`${student.id}|${lo.id}`]; row.push(entry ? scoreText(entry.comprehensionLevel) : 'Belum dinilai', entry?.formativeTask || '', entry?.nextAction || '', entry ? formatDateWIB(entry.date) : ''); });
          const entry = visibleSummative.find(item => item.studentId === student.id); row.push(entry?.summativeScore || '', entry?.summativeTask || '', entry ? formatDateWIB(entry.date) : ''); rows.push(row);
        });
        const sheet = XLSX.utils.aoa_to_sheet(rows); sheet['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 30 }, { wch: 25 }, ...los.flatMap(() => [{ wch: 20 }, { wch: 25 }, { wch: 35 }, { wch: 18 }])];
        const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Assessment UA'); XLSX.writeFile(workbook, `Assessment_UA_${activity?.name.replace(/[^a-zA-Z0-9]/g, '_')}_Sem${semester}.xlsx`);
      }
      toast.success('Ekspor selesai.');
    } catch (issue) { toast.error(problem(issue)); }
  };

  const renderUAMatrix = () => <div className="border rounded-2xl bg-white overflow-x-auto"><table className="w-full text-xs text-left border-collapse"><thead className="bg-slate-50"><tr><th className="p-3">No</th><th className="p-3 min-w-[190px]">Nama Peserta</th><th className="p-3 min-w-[150px]">Kelas Asal</th>{los.map(lo => <th key={lo.id} className="p-3 min-w-[250px] border-l align-top"><div className="flex justify-between gap-2"><span className="text-purple-700 font-bold">{lo.code}</span>{!isReadOnly && <button className="text-[10px] px-2 py-1 rounded bg-purple-100 text-purple-800" onClick={() => setBulkLO(lo)}>Asesmen Peserta UA</button>}</div><p className="mt-2 font-medium">{lo.title}</p></th>)}<th className="p-3 bg-emerald-50 min-w-[150px]">Nilai Sumatif LG<br /><span className="font-normal">Skala B/D/A</span></th></tr></thead><tbody>{students.map((student, index) => <tr key={student.id} className="border-t hover:bg-slate-50/50"><td className="p-3 align-top">{index + 1}</td><td className="p-3 font-semibold align-top">{student.name}<p className="text-[10px] text-gray-400 font-normal">{student.nisn || student.id}</p></td><td className="p-3 align-top">{(student as UAStudent).className || student.classId}</td>{los.map(lo => {
    const entry = latest[`${student.id}|${lo.id}`];
    const count = visibleFormative.filter(item => item.studentId === student.id && item.loId === lo.id).length;
    return <td key={lo.id} className="p-3 border-l align-top"><button type="button" className="w-full text-left space-y-2" onClick={() => setIndividual({ student, lo })}>{entry ? <><span className={`inline-block px-2 py-1 border rounded-lg font-bold ${entry.comprehensionLevel === 'Achieved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : entry.comprehensionLevel === 'Not Achieved' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>{scoreText(entry.comprehensionLevel)}</span><p>{entry.formativeTask || 'Asesmen Cepat'}</p><p className="text-[10px] text-gray-400">{formatDateWIB(entry.date)} · {count} riwayat</p><div className="p-2 rounded-lg bg-purple-50 border border-purple-100"><p className="text-[9px] uppercase font-bold text-purple-600">Next Action</p><p className="mt-1 whitespace-pre-wrap break-words">{entry.nextAction?.trim() || 'Belum diisi'}</p></div></> : <span className="text-gray-400">Belum dinilai</span>}</button>{!isReadOnly && <div className="flex gap-2 mt-3"><button disabled={!!quickKey} className="text-[10px] rounded px-2 py-1 bg-emerald-50 text-emerald-800 disabled:opacity-40" onClick={() => void quickScore(student, lo, 'Achieved')}>✓ Achieved</button><button disabled={!!quickKey} className="text-[10px] rounded px-2 py-1 bg-rose-50 text-rose-800 disabled:opacity-40" onClick={() => void quickScore(student, lo, 'Not Achieved')}>× Not Achieved</button></div>}</td>;
  })}<td className="p-3 bg-emerald-50/30 align-top"><button className="text-emerald-800 underline" onClick={() => setSumStudent(student)}>{visibleSummative.find(item => item.studentId === student.id)?.summativeScore || (isReadOnly ? 'Belum sumatif' : 'Isi Sumatif')}</button></td></tr>)}</tbody></table>{!students.length && <p className="p-8 text-center text-gray-500">Belum ada peserta terdaftar yang cocok dengan filter ini.</p>}</div>;

  return <div className="min-h-screen bg-slate-50/50 pb-16"><header className="bg-white border-b"><div className="max-w-7xl mx-auto p-5 flex flex-wrap justify-between gap-4 items-center"><div><p className="text-xs text-blue-600 font-semibold">Lumina Junior High · Buku Asesmen Guru</p><h1 className="text-2xl font-black flex items-center gap-2 mt-1"><BookOpen className="text-blue-600" />Assessment Book</h1><p className="text-xs text-gray-500 mt-1">Mata pelajaran berbasis kelas · Unit Aktivitas lintas kelas</p></div><div className="flex gap-2"><button type="button" disabled={loadingData || !!quickKey} onClick={refresh} className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-semibold"><RefreshCw size={14} className="inline mr-1" />Segarkan</button><button type="button" disabled={!canRender || !students.length} onClick={() => void exportExcel()} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40"><Download size={14} className="inline mr-1" />Ekspor Excel</button>{isSuperAdmin && <button type="button" onClick={() => setSettingsOpen(true)} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"><Settings size={14} className="inline mr-1" />Pengaturan Opsi</button>}</div></div></header>
    <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex gap-2 p-1 bg-white rounded-2xl border w-fit" role="tablist" aria-label="Mode Assessment Book">{(['SUBJECT', 'UNIT_ACTIVITY'] as const).map(value => <button key={value} role="tab" type="button" aria-selected={mode === value} disabled={!!quickKey} onClick={() => selectMode(value)} className={`px-5 py-3 text-xs font-bold rounded-xl transition-colors ${mode === value ? 'bg-purple-700 text-white' : 'text-gray-600 hover:bg-purple-50'}`}>{value === 'SUBJECT' ? 'Mata Pelajaran' : 'Unit Aktivitas'}</button>)}</div>
      {isReadOnly && <p className="p-3 rounded-xl bg-amber-50 border text-xs text-amber-900">Mode baca-saja: input dan perubahan nilai dinonaktifkan.</p>}
      {error && <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex gap-2 items-start"><AlertCircle size={18} /><div>{error}<button className="block underline mt-2 text-xs" onClick={() => { setError(''); refresh(); }}>Coba muat ulang</button></div></div>}
      <fieldset disabled={!!quickKey} className="bg-white border rounded-2xl p-4 space-y-4"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><div><label className={fieldLabel}>Tahun Ajaran</label><select className={control} value={year} onChange={event => { resetLG(); setYear(event.target.value); setUAId(''); setError(''); }}>{Array.from(new Set(['2024/2025', '2025/2026', '2026/2027', activeYear || '', year].filter(Boolean))).map(value => <option key={value}>{value}</option>)}</select></div><div><label className={fieldLabel}>Semester</label><select className={control} value={semester} onChange={event => { resetLG(); setSemester(event.target.value); setUAId(''); setError(''); }}><option value="1">Semester 1 (Ganjil)</option><option value="2">Semester 2 (Genap)</option></select></div>{!isUA ? <><div><label className={fieldLabel}>Kelas Junior High</label><select className={control} disabled={loadingClasses} value={classId} onChange={event => { resetLG(); setClassId(event.target.value); }}>{!classes.length && <option value="">Tidak ada kelas</option>}{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label className={fieldLabel}>Mata Pelajaran</label><select className={control} value={subject} onChange={event => { resetLG(); setSubject(event.target.value); }}><option value="">Pilih Mata Pelajaran</option>{JH_SUBJECT_CATALOG.map(item => <option key={item.label} value={item.label}>{getJHSubjectLabel(item.label)}</option>)}</select></div></> : <><div><label className={fieldLabel}>Kategori UA</label><select className={control} value={uaCategory} onChange={event => { resetLG(); setUACategory(event.target.value); setUAId(''); setUAClass('ALL'); setUASearch(''); setError(''); }}><option value="">Pilih kategori UA</option>{JH_UA_CATEGORIES_CONFIG.map(item => <option key={item.key} value={item.key}>{item.shortLabel}</option>)}</select></div><div><label className={fieldLabel}>Unit Aktivitas</label><select className={control} disabled={!uaCategory || loadingUAOptions} value={uaId} onChange={event => { resetLG(); setUAId(event.target.value); setUAClass('ALL'); setUASearch(''); setError(''); }}><option value="">{loadingUAOptions ? 'Memuat Unit Aktivitas...' : 'Pilih Unit Aktivitas'}</option>{uaOptions.filter(item => item.category === uaCategory).map(item => <option key={item.id} value={item.id}>{item.name} ({item.confirmedCount} peserta)</option>)}</select>{uaCategory && !loadingUAOptions && !uaOptions.some(item => item.category === uaCategory) && <p className="text-[10px] text-gray-400 mt-1">Belum ada aktivitas dengan pemetaan kategori ini pada periode terpilih.</p>}</div></>}</div>
      {isUA && <div className="grid sm:grid-cols-3 gap-4 border-t pt-4"><div><label className={fieldLabel}>Filter Grade (opsional)</label><select className={control} value={uaGrade} onChange={event => { closeAssessmentModals(); setUAGrade(event.target.value); }}><option value="ALL">Semua Grade</option>{['7', '8', '9'].map(value => <option key={value} value={value}>Grade {value}</option>)}</select></div><div><label className={fieldLabel}>Filter Kelas Asal (opsional)</label><select className={control} value={uaClass} onChange={event => setUAClass(event.target.value)}><option value="ALL">Semua Kelas</option>{classes.filter(item => uaRoster.some(student => student.classId === item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label className={fieldLabel}>Cari Nama / NIS / Kelas</label><input className={control} value={uaSearch} onChange={event => setUASearch(event.target.value)} placeholder="Cari peserta UA..." /></div></div>}</fieldset>
      {isUA && activity && <div className="p-4 rounded-2xl bg-purple-50 border border-purple-100 text-xs text-purple-900"><strong>{activity.name}</strong> · {activity.category} · {students.length} peserta ditampilkan dari {uaRoster.length} peserta aktif lintas kelas.{targetGrade && <span> LG dan LO bersama untuk seluruh grade.</span>}<p className="mt-1">Filter grade dan kelas hanya menyaring peserta; LG/LO aktivitas tetap sama.</p></div>}
      <section className="bg-white rounded-2xl border p-4 space-y-4"><div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-xs font-bold uppercase flex gap-2 items-center"><Layers size={18} className="text-purple-600" />Pilih Learning Goal (LG) yang Dinilai</h2>{!isReadOnly && effectiveSubject && <div className="flex gap-2">{activeLG && <button className="px-3 py-2 text-xs rounded-xl bg-indigo-50 text-indigo-800" onClick={() => setProposal(ownUnusedLG && !isUA ? { open: true, existingLG: activeLG } : { open: true, parentLG: activeLG })}>{ownUnusedLG && !isUA ? 'Edit LG' : 'Ajukan Versi Baru'}</button>}<button className="px-3 py-2 text-xs rounded-xl bg-blue-50 text-blue-800" title={isUA ? 'Usulkan LG bersama untuk aktivitas ini' : 'Usulkan LG Baru'} onClick={() => setProposal({ open: true })}>Usulkan LG Baru</button></div>}</div>
      {!effectiveSubject ? <p className="p-4 bg-amber-50 border rounded-xl text-xs text-amber-900">{isUA ? 'Pilih kategori dan Unit Aktivitas terlebih dahulu.' : 'Pilih mata pelajaran terlebih dahulu.'}</p> : loadingGoals ? <p className="text-xs text-gray-400">Memuat Learning Goals...</p> : <><select className={control} value={lgId} disabled={!goals.length} onChange={event => { closeAssessmentModals(); setLGId(event.target.value); }}>{!goals.length && <option value="">Belum ada LG yang sesuai — tidak mengambil LG aktivitas lain</option>}{goals.map(goal => <option key={goal.id} value={goal.id}>[{goal.code || 'LG'}] {isUA ? `[Asal master: ${goal.grade || 'tanpa grade'}] ` : ''}{goal.goalText?.slice(0, 140)}</option>)}</select>{activeLG && <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs leading-relaxed"><span className="font-bold">{activeLG.code} · </span>{activeLG.goalText}<p className="text-[10px] text-gray-500 mt-2">Status: {activeLG.status || 'PUBLISHED'}</p></div>}{isUA && activeLG && <p className="text-xs text-purple-800">LG terpilih dipakai bersama untuk seluruh peserta aktivitas ini. Grade pada kode master bukan pembatas peserta. LG master lain tidak digabung otomatis.</p>}</>}</section>
      {(loadingRoster || loadingData) && <p className="text-xs text-gray-500 p-4">Memuat peserta/data asesmen...</p>}
      {canRender && <><div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3"><div className="flex gap-2"><button className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'MATRIX' ? 'bg-slate-900 text-white' : 'bg-white border'}`} onClick={() => setTab('MATRIX')}>Matrix Asesmen (Grid)</button><button className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'RECAP' ? 'bg-slate-900 text-white' : 'bg-white border'}`} onClick={() => setTab('RECAP')}>Rekap Capaian Siswa ({students.length})</button></div><span className="text-xs text-gray-500">{los.length} LO aktif · {students.length} {isUA ? 'peserta UA' : 'siswa'}</span></div>
        {isUA ? <><div className="flex justify-end">{!isReadOnly && <button className="px-3 py-2 bg-purple-50 border border-purple-200 text-purple-800 rounded-xl text-xs font-bold" onClick={() => setManageOpen(true)}>+ Kelola Tangga LO ({los.length})</button>}</div>{tab === 'MATRIX' ? los.length ? renderUAMatrix() : <p className="p-8 bg-white rounded-2xl border text-sm text-center text-gray-500">Belum ada LO pada aktivitas/kelompok ini. Tambahkan melalui Kelola Tangga LO.</p> : <div className="grid md:grid-cols-2 gap-4">{students.map(student => <div key={student.id} className="p-4 bg-white rounded-2xl border space-y-3"><h3 className="text-sm font-bold">{student.name}</h3><p className="text-xs text-gray-500">{(student as UAStudent).className || student.classId}</p>{los.map(lo => { const entry = latest[`${student.id}|${lo.id}`]; return <button key={lo.id} className="block w-full text-left p-3 bg-slate-50 rounded-xl text-xs" onClick={() => setIndividual({ student, lo })}><p className="font-semibold">{lo.code} · {lo.title}</p><p className="mt-1">{entry ? scoreText(entry.comprehensionLevel) : 'Belum dinilai'}</p><p className="mt-1 text-purple-700 whitespace-pre-wrap">Next Action: {entry?.nextAction || 'Belum diisi'}</p></button>; })}</div>)}</div>}</> : tab === 'MATRIX' ? <FormativeMatrixGrid students={students} lg={activeLG!} los={los} formativeEntries={formative} summativeEntries={summative} options={options} classId={classId} subjectId={subject} academicYear={year} semester={semester} teacherId={teacherId} teacherName={teacherName} isReadOnly={isReadOnly} onOpenFormativeModal={(student, lo) => setIndividual({ student, lo })} onOpenSummativeModal={setSumStudent} onOpenManageLOModal={() => setManageOpen(true)} onOpenBulkModal={setBulkLO} onRefreshData={loadAssessmentData} /> : <StudentRecapView students={students} lg={activeLG!} los={los} formativeEntries={formative} summativeEntries={summative} onOpenFormativeModal={(student, lo) => setIndividual({ student, lo })} onOpenSummativeModal={setSumStudent} />}</>}
    </main>
    {isSuperAdmin && <AssessmentBookSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} initialOptions={options} onSaved={setOptions} />}
    {!isReadOnly && proposal.open && <ProposeLGModal isOpen onClose={() => setProposal({ open: false })} grade={isUA ? 'ALL' : regularGrade || '7'} subject={effectiveSubject} academicYear={year} teacherId={teacherId} teacherName={teacherName} parentLG={proposal.parentLG} existingLG={proposal.existingLG} onSuccess={() => { setProposal({ open: false }); void loadLearningGoals(); }} />}
    {activeLG && manageOpen && !isReadOnly && <ManageLOModal key={scopeKey} isOpen onClose={() => setManageOpen(false)} lg={activeLG} classId={effectiveClassId} subjectId={effectiveSubject} academicYear={year} semester={semester} los={los} teacherUid={teacherId} teacherName={teacherName} onRefresh={loadAssessmentData} />}
    {bulkLO && !isReadOnly && (isUA ? <UASessionModal key={`${scopeKey}|${bulkLO.id}`} students={students as UAStudent[]} lo={bulkLO} scope={{ classId: effectiveClassId, subjectId: effectiveSubject, academicYear: year, semester }} options={options} teacherId={teacherId} teacherName={teacherName} onClose={() => setBulkLO(null)} onSaved={loadAssessmentData} /> : <BulkFormativeModal isOpen onClose={() => setBulkLO(null)} lo={bulkLO} students={students} classId={classId} subjectId={subject} academicYear={year} semester={semester} options={options} teacherId={teacherId} teacherName={teacherName} onSuccess={loadAssessmentData} />)}
    {individual && <FormativeAssessmentModal key={`${scopeKey}|${individual.student.id}|${individual.lo.id}`} isOpen onClose={() => setIndividual(null)} student={individual.student} lo={individual.lo} classId={effectiveClassId} subjectId={effectiveSubject} academicYear={year} semester={semester} options={options} historyEntries={formative.filter(entry => entry.studentId === individual.student.id && entry.loId === individual.lo.id)} teacherId={teacherId} teacherName={teacherName} isSuperAdmin={isSuperAdmin} isReadOnly={isReadOnly} onSaved={loadAssessmentData} {...{ ...context, isUAMode: isUA }} />}
    {sumStudent && activeLG && <SummativeModal key={`${scopeKey}|${sumStudent.id}`} isOpen onClose={() => setSumStudent(null)} student={sumStudent} lg={activeLG} los={los} loScores={Object.fromEntries(los.map(lo => [lo.id, latestEntries(formative)[`${sumStudent.id}|${lo.id}`]?.comprehensionLevel]))} existingSummative={summative.find(entry => entry.studentId === sumStudent.id)} classId={effectiveClassId} subjectId={effectiveSubject} academicYear={year} semester={semester} options={options} teacherId={teacherId} teacherName={teacherName} isReadOnly={isReadOnly} onSaved={loadAssessmentData} {...{ ...context, isUAMode: isUA }} />}
  </div>;
}
