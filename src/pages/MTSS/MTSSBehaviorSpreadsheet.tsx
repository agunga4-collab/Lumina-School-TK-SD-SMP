import * as React from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, User, Save, Trash2, Plus, Clock, BookOpen, ChevronLeft, ChevronRight, FileText, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { db, getClasses, getActiveStudents, getTeachers, createBehaviorAlert } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import type { MTSSCase, Student, Class, User as AppUser } from '../../types';

interface BehaviorTargetRow { id: string; text: string; }
type DayScores = { checkIn: number | null; checkOut: number | null };
interface CICOWeeklyWorksheet {
  studentId: string;
  classId: string;
  weekStartingDate: string;
  targets: BehaviorTargetRow[];
  scores: Record<string, Record<number, DayScores>>;
  halBaik: string;
  refleksi: string;
  teacherNotes: string;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  return date;
}
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return dateKey(date) === value ? date : null;
}
function formatLocalDate(date: Date): string {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
function aliases(student: Student): string[] {
  const item = student as unknown as Record<string, unknown>;
  return Array.from(new Set(['id', 'studentId', 'luminaId', 'nis', 'nisn'].map(key => item[key])
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(value => String(value).trim()).filter(Boolean)));
}
function matchesStudent(student: Student, value: string): boolean {
  return aliases(student).includes(String(value).trim());
}
function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4;
}
function statistics(targets: BehaviorTargetRow[], scores: CICOWeeklyWorksheet['scores'], day?: number) {
  let earned = 0;
  let slots = 0;
  targets.filter(target => target.text.trim()).forEach(target => {
    const days = day === undefined ? [0, 1, 2, 3, 4] : [day];
    days.forEach(index => {
      const cell = scores[target.id]?.[index];
      if (cell) [cell.checkIn, cell.checkOut].forEach(value => {
        if (isScore(value)) { earned += value; slots += 1; }
      });
    });
  });
  const possible = slots * 4;
  return { earned, possible, pct: possible ? Math.round(earned / possible * 100) : null };
}
function message(error: unknown): string {
  const item = error as { code?: string; message?: string };
  if (item?.code === 'permission-denied') return 'Akses Firestore ditolak. Periksa rules dan hak akses staf; ini bukan berarti data kosong.';
  return item?.message || String(error);
}
function readWorkbook(data: Record<string, any>): CICOWeeklyWorksheet {
  if (!Array.isArray(data.targets) || !data.scores || typeof data.scores !== 'object' || Array.isArray(data.scores)) {
    throw new Error('Format workbook lama tidak sesuai. Data tidak diubah; periksa dokumen sebelum menyimpan.');
  }
  const ids = new Set<string>();
  const targets = data.targets.map((target: any) => {
    if (!target || typeof target.id !== 'string' || !target.id || typeof target.text !== 'string' || ids.has(target.id)) {
      throw new Error('Ada target tanpa ID/teks yang valid atau ID ganda. Data historis tidak diubah.');
    }
    ids.add(target.id);
    return { id: target.id, text: target.text };
  });
  const scores: CICOWeeklyWorksheet['scores'] = {};
  targets.forEach((target: BehaviorTargetRow) => {
    scores[target.id] = {};
    for (let day = 0; day < 5; day += 1) {
      const cell = data.scores[target.id]?.[day];
      if (!cell) continue;
      const checkIn = cell.checkIn ?? null;
      const checkOut = cell.checkOut ?? null;
      if ((checkIn !== null && !isScore(checkIn)) || (checkOut !== null && !isScore(checkOut))) {
        throw new Error('Workbook berisi nilai di luar skala 1–4. Penyimpanan diblokir agar data lama tidak dikonversi tanpa persetujuan.');
      }
      scores[target.id][day] = { checkIn, checkOut };
    }
  });
  return { ...data, targets, scores, halBaik: data.halBaik || '', refleksi: data.refleksi || '', teacherNotes: data.teacherNotes || '' } as CICOWeeklyWorksheet;
}

export default function MTSSBehaviorSpreadsheet() {
  const { profile } = useAuth();
  const outlet = useOutletContext<{ filters: { academicYear: string; semester: string | number } }>();
  const filters = outlet?.filters;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStudentId = searchParams.get('studentId') || '';
  const urlClassId = searchParams.get('classId') || '';
  const urlCaseId = searchParams.get('caseId') || '';
  const urlYear = searchParams.get('academicYear') || '';
  const urlSemester = searchParams.get('semester') || '';
  const urlWeek = searchParams.get('week') || searchParams.get('date') || '';
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [teachers, setTeachers] = React.useState<AppUser[]>([]);
  const [linkedCase, setLinkedCase] = React.useState<MTSSCase | null>(null);
  const [selectedClassId, setSelectedClassId] = React.useState('');
  const [selectedStudentId, setSelectedStudentId] = React.useState('');
  const [storageStudentId, setStorageStudentId] = React.useState('');
  const [academicYear, setAcademicYear] = React.useState('');
  const [semester, setSemester] = React.useState('');
  const [currentWeekMonday, setCurrentWeekMonday] = React.useState(() => getMonday(parseDate(urlWeek) || new Date()));
  const [metadataLoading, setMetadataLoading] = React.useState(true);
  const [rosterLoading, setRosterLoading] = React.useState(false);
  const [contextError, setContextError] = React.useState('');
  const [casesError, setCasesError] = React.useState('');
  const [loadError, setLoadError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [reload, setReload] = React.useState(0);
  const [targets, setTargets] = React.useState<BehaviorTargetRow[]>([]);
  const [scores, setScores] = React.useState<CICOWeeklyWorksheet['scores']>({});
  const [halBaik, setHalBaik] = React.useState('');
  const [refleksi, setRefleksi] = React.useState('');
  const [teacherNotes, setTeacherNotes] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loadedKey, setLoadedKey] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const loadedDocRef = React.useRef<{ id: string; studentId: string } | null>(null);
  const baselinePctRef = React.useRef<number | null>(null);
  const savingRef = React.useRef(false);
  const mondayStr = dateKey(currentWeekMonday);
  const workbookKey = JSON.stringify([academicYear, semester, selectedClassId, selectedStudentId, storageStudentId, mondayStr]);
  const activeStudentObj = students.find(student => student.id === selectedStudentId);
  const activeStudentRef = React.useRef(activeStudentObj);
  activeStudentRef.current = activeStudentObj;
  const wantedStudentRef = React.useRef(urlStudentId);
  wantedStudentRef.current = urlStudentId;

  React.useEffect(() => {
    if (!profile || !filters?.academicYear) return;
    let cancelled = false;
    setMetadataLoading(true);
    setContextError('');
    setSelectedClassId(''); setSelectedStudentId(''); setStorageStudentId('');
    setStudents([]); setClasses([]); setLinkedCase(null);
    const run = async () => {
      try {
        if (urlWeek && !parseDate(urlWeek)) throw new Error('Parameter tanggal tidak valid. Gunakan YYYY-MM-DD.');
        let contextCase: MTSSCase | null = null;
        if (urlCaseId) {
          const snapshot = await getDoc(doc(db, 'behaviorCases', urlCaseId));
          if (!snapshot.exists()) throw new Error('Kasus pada tautan tidak ditemukan. Tidak memilih siswa lain.');
          contextCase = { ...snapshot.data(), id: snapshot.id } as MTSSCase;
        }
        const contextYear = urlYear || contextCase?.academicYear || filters.academicYear;
        const contextSemester = urlSemester || String(contextCase?.semester || filters.semester || '');
        if (urlYear && contextCase?.academicYear && urlYear !== contextCase.academicYear) throw new Error('Tahun ajaran pada tautan tidak sesuai kasus.');
        if (urlSemester && contextCase?.semester && urlSemester !== String(contextCase.semester)) throw new Error('Semester pada tautan tidak sesuai kasus.');
        const allClasses = await getClasses();
        if (cancelled) return;
        const available = (allClasses || []).filter(item => item.unitId === 'JUNIOR_HIGH' && item.academicYear === contextYear && item.status !== 'archived');
        const classId = urlClassId || contextCase?.classId || '';
        if (urlClassId && contextCase?.classId && urlClassId !== contextCase.classId) throw new Error('Kelas pada tautan tidak sesuai kasus.');
        if ((urlStudentId || urlCaseId) && !classId) throw new Error('Tautan siswa tidak memiliki kelas. Buka kembali melalui profil kasus.');
        if (classId && !available.some(item => item.id === classId)) throw new Error('Kelas pada tautan tidak ditemukan pada unit/tahun ajaran ini. Tidak beralih ke kelas pertama.');
        setAcademicYear(contextYear); setSemester(contextSemester);
        setLinkedCase(contextCase); setClasses(available);
        setCurrentWeekMonday(getMonday(parseDate(urlWeek) || new Date()));
        setSelectedClassId(classId);
      } catch (error) {
        if (!cancelled) setContextError(message(error));
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [profile?.uid, filters?.academicYear, filters?.semester, urlClassId, urlStudentId, urlCaseId, urlYear, urlSemester, reload]);

  React.useEffect(() => {
    if (urlWeek && parseDate(urlWeek)) setCurrentWeekMonday(getMonday(parseDate(urlWeek)!));
  }, [urlWeek]);

  React.useEffect(() => {
    if (!profile || !academicYear || metadataLoading || contextError) return;
    setCases([]); setCasesError('');
    let cancelled = false;
    const unsubscribe = onSnapshot(query(collection(db, 'behaviorCases'), where('academicYear', '==', academicYear)), snapshot => {
      if (cancelled) return;
      const items = snapshot.docs.map(item => ({ ...item.data(), id: item.id })) as MTSSCase[];
      setCases(items.filter(item => !semester || !item.semester || String(item.semester) === semester));
    }, error => { if (!cancelled) setCasesError(message(error)); });
    getTeachers().then(items => { if (!cancelled) setTeachers(items || []); }).catch(error => console.error('Error loading teachers:', error));
    return () => { cancelled = true; unsubscribe(); };
  }, [profile?.uid, academicYear, semester, metadataLoading, contextError, reload]);

  React.useEffect(() => {
    if (!selectedClassId || !academicYear || metadataLoading || contextError) return;
    let cancelled = false;
    setRosterLoading(true); setStudents([]); setSelectedStudentId(''); setStorageStudentId('');
    const run = async () => {
      try {
        const roster = await getActiveStudents(selectedClassId, academicYear);
        if (cancelled) return;
        const list = roster || [];
        const wanted = urlStudentId || linkedCase?.studentId || '';
        let resolved: Student | undefined;
        if (wanted) {
          resolved = list.find(student => student.id === wanted);
          if (!resolved) {
            const matches = list.filter(student => matchesStudent(student, wanted));
            if (matches.length !== 1) throw new Error('Siswa pada tautan tidak ditemukan secara unik di kelas ini. Tidak memilih siswa pertama.');
            resolved = matches[0];
          }
          if (linkedCase?.studentId && !matchesStudent(resolved, linkedCase.studentId)) throw new Error('Identitas siswa tidak sesuai kasus.');
        }
        setStudents(list);
        if (resolved) {
          setSelectedStudentId(resolved.id);
          setStorageStudentId(linkedCase?.studentId || wanted || resolved.id);
        }
      } catch (error) {
        if (!cancelled) setContextError(message(error));
      } finally { if (!cancelled) setRosterLoading(false); }
    };
    void run();
    return () => { cancelled = true; };
  }, [selectedClassId, academicYear, metadataLoading, urlStudentId, linkedCase?.id, contextError, reload]);

  React.useEffect(() => {
    let cancelled = false;
    setTargets([]); setScores({}); setHalBaik(''); setRefleksi(''); setTeacherNotes('');
    setLoadedKey(''); setLoadError(''); setNotice(''); setDirty(false);
    loadedDocRef.current = null; baselinePctRef.current = null;
    if (!selectedStudentId || !storageStudentId || metadataLoading || rosterLoading || contextError) {
      setLoading(false);
      return;
    }
    const student = activeStudentRef.current;
    if (!student) return;
    setLoading(true);
    const run = async () => {
      try {
        const candidateIds = Array.from(new Set([storageStudentId, selectedStudentId, wantedStudentRef.current, ...aliases(student)].filter(Boolean)));
        let found: { id: string; data: CICOWeeklyWorksheet } | null = null;
        for (const studentId of candidateIds) {
          const id = `${studentId}_${mondayStr}`;
          const snapshot = await getDoc(doc(db, 'cicoWeeklyWorksheets', id));
          if (cancelled) return;
          if (!snapshot.exists()) continue;
          const raw = snapshot.data();
          if (!matchesStudent(student, String(raw.studentId || '')) || raw.weekStartingDate !== mondayStr || raw.classId !== selectedClassId) {
            throw new Error('Identitas siswa/kelas/minggu dalam workbook tidak cocok. Penyimpanan diblokir agar data tidak tertimpa.');
          }
          if (found) throw new Error('Ada lebih dari satu workbook untuk siswa/minggu ini dengan ID berbeda. Tidak digabung atau ditimpa otomatis.');
          found = { id, data: readWorkbook(raw) };
        }
        if (cancelled) return;
        if (found) {
          setTargets(found.data.targets); setScores(found.data.scores);
          setHalBaik(found.data.halBaik); setRefleksi(found.data.refleksi); setTeacherNotes(found.data.teacherNotes);
          loadedDocRef.current = { id: found.id, studentId: found.data.studentId };
          baselinePctRef.current = statistics(found.data.targets, found.data.scores).pct;
        } else {
          loadedDocRef.current = { id: `${storageStudentId}_${mondayStr}`, studentId: storageStudentId };
        }
        setLoadedKey(workbookKey);
      } catch (error) { if (!cancelled) setLoadError(message(error)); }
      finally { if (!cancelled) setLoading(false); }
    };
    void run();
    return () => { cancelled = true; };
  }, [workbookKey, metadataLoading, rosterLoading, contextError, reload]);

  React.useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const confirmLeave = () => !savingRef.current && (!dirty || window.confirm('Ada perubahan yang belum disimpan. Tinggalkan perubahan?'));
  const changeClass = (classId: string) => {
    if (!confirmLeave()) return;
    setStudents([]); setSelectedStudentId(''); setStorageStudentId(''); setSelectedClassId(''); setDirty(false);
    const params = new URLSearchParams(searchParams);
    ['studentId', 'caseId'].forEach(key => params.delete(key));
    classId ? params.set('classId', classId) : params.delete('classId');
    setSearchParams(params);
  };
  const changeStudent = (studentId: string) => {
    if (!confirmLeave()) return;
    const student = students.find(item => item.id === studentId);
    const params = new URLSearchParams(searchParams);
    params.delete('caseId');
    student ? params.set('studentId', student.id) : params.delete('studentId');
    setSelectedStudentId(''); setStorageStudentId(''); setDirty(false);
    setSearchParams(params);
  };
  const changeWeek = (direction: 'prev' | 'next') => {
    if (!confirmLeave()) return;
    const next = new Date(currentWeekMonday);
    next.setDate(next.getDate() + (direction === 'prev' ? -7 : 7));
    const params = new URLSearchParams(searchParams);
    params.set('week', dateKey(next)); params.delete('date');
    setDirty(false); setCurrentWeekMonday(next); setSearchParams(params);
  };
  const handleAddTargetRow = () => {
    if (savingRef.current) return;
    setTargets(previous => [...previous, { id: doc(collection(db, 'cicoWeeklyWorksheets')).id, text: '' }]);
    setDirty(true);
  };
  const handleRemoveTargetRow = (id: string) => {
    if (savingRef.current) return;
    const row = targets.find(item => item.id === id);
    if ((row?.text.trim() || Object.keys(scores[id] || {}).length) && !window.confirm('Hapus target beserta nilainya dari workbook ini saat disimpan?')) return;
    setTargets(previous => previous.filter(target => target.id !== id));
    setScores(previous => { const next = { ...previous }; delete next[id]; return next; }); setDirty(true);
  };
  const handleScoreChange = (targetId: string, day: number, type: 'checkIn' | 'checkOut', value: number | null) => {
    if (savingRef.current || (value !== null && !isScore(value))) return;
    setScores(previous => ({ ...previous, [targetId]: { ...previous[targetId], [day]: { checkIn: previous[targetId]?.[day]?.checkIn ?? null, checkOut: previous[targetId]?.[day]?.checkOut ?? null, [type]: value } } }));
    setDirty(true);
  };
  const activeCases = cases.filter(item => activeStudentObj && matchesStudent(activeStudentObj, item.studentId) && item.status !== 'CLOSED');
  const contextCase = linkedCase || (activeCases.length === 1 ? activeCases[0] : null);
  const namedTargets = targets.filter(target => target.text.trim());
  const weeklyStats = statistics(targets, scores);
  const ready = !!selectedStudentId && loadedKey === workbookKey && !loading && !metadataLoading && !rosterLoading && !loadError && !contextError;

  const handleSaveWorkbook = async () => {
    if (!ready || savingRef.current || !activeStudentObj || !loadedDocRef.current) return;
    const blankWithScores = targets.some(target => !target.text.trim() && Object.values(scores[target.id] || {}).some(cell => isScore(cell.checkIn) || isScore(cell.checkOut)));
    if (blankWithScores) { setNotice('Isi teks target yang memiliki skor sebelum menyimpan. Nilai tidak dibuang otomatis.'); return; }
    const savedTargets = namedTargets.map(target => ({ ...target, text: target.text.trim() }));
    const savedScores: CICOWeeklyWorksheet['scores'] = {};
    savedTargets.forEach(target => {
      savedScores[target.id] = {};
      for (let day = 0; day < 5; day += 1) {
        const cell = scores[target.id]?.[day];
        if (cell) savedScores[target.id][day] = { checkIn: cell.checkIn ?? null, checkOut: cell.checkOut ?? null };
      }
    });
    const targetDoc = loadedDocRef.current;
    const payload: CICOWeeklyWorksheet = { studentId: targetDoc.studentId, classId: selectedClassId, weekStartingDate: mondayStr, targets: savedTargets, scores: savedScores, halBaik, refleksi, teacherNotes };
    const stats = statistics(savedTargets, savedScores);
    const previousPct = baselinePctRef.current;
    savingRef.current = true; setSaving(true); setNotice('');
    try {
      await setDoc(doc(db, 'cicoWeeklyWorksheets', targetDoc.id), payload, { mergeFields: Object.keys(payload) });
      setTargets(savedTargets); setScores(savedScores); setDirty(false); baselinePctRef.current = stats.pct;
      setNotice('Workbook pemantauan perilaku berhasil disimpan.');
      if (contextCase && contextCase.status !== 'CLOSED' && stats.pct !== null && stats.pct < 60 && (previousPct === null || previousPct >= 60)) {
        try {
          const targetRoles = ['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'];
          const targetUserIds = teachers.filter(teacher => targetRoles.includes(teacher.role)).map(teacher => teacher.uid);
          if (targetUserIds.length) await createBehaviorAlert({ type: 'ALERT-T2-02', severity: 'HIGH', title: 'Skor CICO Mingguan Rendah', message: `${contextCase.studentName} memperoleh rata-rata CICO mingguan ${stats.pct}% (di bawah batas 60%).`, caseId: contextCase.id, studentId: contextCase.studentId, studentName: contextCase.studentName, targetUserIds, actionUrl: `/junior-high/behavior/mtss/cases/${contextCase.id}` });
        } catch (error) { setNotice(`Workbook sudah tersimpan, tetapi notifikasi gagal: ${message(error)}`); }
      }
    } catch (error) { setNotice(`Gagal menyimpan workbook: ${message(error)}`); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const daysOfWeek = Array.from({ length: 5 }, (_, index) => { const date = new Date(currentWeekMonday); date.setDate(date.getDate() + index); return date; });
  const inputClass = 'w-full text-xs font-bold text-gray-700 bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none py-2';
  const selectedClassName = classes.find(item => item.id === selectedClassId)?.name || selectedClassId;
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-1">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 min-w-[150px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Class</span>
            <select aria-label="Pilih kelas" value={selectedClassId} disabled={metadataLoading || saving} onChange={event => changeClass(event.target.value)} className="text-xs font-black bg-transparent outline-none cursor-pointer text-gray-800 w-full">
              <option value="">Select Class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 flex-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Student</span>
            <select aria-label="Pilih siswa" value={selectedStudentId} disabled={metadataLoading || rosterLoading || saving || !selectedClassId || !!contextError} onChange={event => changeStudent(event.target.value)} className="text-xs font-black bg-transparent outline-none cursor-pointer text-gray-800 w-full">
              <option value="">Select Student Workbook</option>{students.map(student => {
                const studentCases = cases.filter(item => matchesStudent(student, item.studentId) && item.status !== 'CLOSED');
                return <option key={student.id} value={student.id}>{student.name}{studentCases.length ? ` (${studentCases.length} kasus aktif)` : ''}</option>;
              })}
            </select>
          </div>
          {contextCase && <Link to={`/junior-high/behavior/mtss/cases/${encodeURIComponent(contextCase.id)}`} onClick={event => { if (!confirmLeave()) event.preventDefault(); }} className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-800 rounded-xl text-xs font-bold"><FileText size={14} /> Profil Kasus ({contextCase.tier})</Link>}
        </div>
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100 self-center">
          <button type="button" aria-label="Minggu sebelumnya" disabled={saving || metadataLoading} onClick={() => changeWeek('prev')} className="p-2"><ChevronLeft size={16} /></button>
          <div className="text-center px-3 min-w-[160px]"><p className="text-[9px] font-black uppercase text-gray-400">Selected Week</p><p className="text-[11px] font-black mt-1">{formatLocalDate(daysOfWeek[0])} – {formatLocalDate(daysOfWeek[4])}</p></div>
          <button type="button" aria-label="Minggu berikutnya" disabled={saving || metadataLoading} onClick={() => changeWeek('next')} className="p-2"><ChevronRight size={16} /></button>
        </div>
      </div>
      <p className="text-xs text-gray-500">Junior High · {academicYear || filters?.academicYear} · Semester {semester || filters?.semester}. Workbook mengikuti siswa dan minggu; tautan kasus tidak membuat workbook kedua.</p>
      {(contextError || loadError || casesError) && <div role="alert" className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-2xl text-sm space-y-2"><div className="flex gap-2"><AlertTriangle size={18} /><span>{contextError || loadError || casesError}</span></div><button type="button" disabled={saving} onClick={() => { if (confirmLeave()) setReload(value => value + 1); }} className="underline font-bold">Coba muat ulang</button></div>}
      {notice && <div role="status" className="p-4 bg-blue-50 text-blue-900 border border-blue-100 rounded-2xl text-sm">{notice}</div>}
      {metadataLoading || rosterLoading || loading ? <div className="h-[35vh] flex flex-col items-center justify-center gap-4 bg-white rounded-[2rem] border border-gray-100"><Clock className="animate-pulse text-blue-600" size={32} /><p className="text-xs text-gray-500">Memuat konteks siswa dan workbook...</p></div> : !selectedStudentId && !contextError ? <div className="bg-white p-16 rounded-[2rem] border border-gray-100 text-center space-y-4"><FileSpreadsheet size={32} className="mx-auto text-blue-600" /><h3 className="font-black">MTSS Behavior Worksheet</h3><p className="text-sm text-gray-500">Pilih kelas dan siswa. Sistem tidak memilih siswa pertama secara otomatis.</p></div> : ready ? (
        <div className="space-y-6">
          {activeCases.length > 1 && <div className="bg-amber-50 text-amber-900 p-4 rounded-2xl text-xs">Siswa memiliki beberapa kasus aktif. Workbook ini tetap pemantauan mingguan siswa, bukan salinan terpisah untuk tiap kasus.{linkedCase ? ` Konteks rujukan: ${linkedCase.id}.` : ' Buka dari profil kasus bila ingin membawa konteks rujukan tertentu.'}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center gap-4"><User size={22} className="text-blue-600" /><div><span className="text-[9px] font-black uppercase text-gray-400">Active Student</span><p className="text-sm font-black">{activeStudentObj?.name}</p><p className="text-xs text-gray-400">{selectedClassName} · NISN: {activeStudentObj?.nisn || '—'}</p></div></div>
            <div className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center gap-4"><FileSpreadsheet size={22} className="text-emerald-600" /><div><span className="text-[9px] font-black uppercase text-gray-400">Target Rows Count</span><p className="text-sm font-black">{namedTargets.length} Target Behaviors</p>{targets.length > namedTargets.length && <p className="text-xs text-gray-400">{targets.length - namedTargets.length} baris draft kosong, tidak dihitung</p>}</div></div>
            <div className="bg-[#001033] p-6 rounded-2xl text-white flex items-center justify-between"><div><span className="text-xs font-bold text-blue-300">Weekly Achievement</span><p className="text-xs text-blue-100/70 mt-1">Skor terisi saja · skala 1–4</p></div><div className="text-right"><p className="text-lg font-black text-blue-300">{weeklyStats.pct === null ? '—' : `${weeklyStats.pct}%`}</p>{weeklyStats.possible > 0 && <p className="text-xs">{weeklyStats.earned} / {weeklyStats.possible} pts</p>}</div></div>
          </div>
          <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center"><h3 className="font-black uppercase flex items-center gap-2"><FileSpreadsheet size={20} className="text-blue-600" />Check In Check Out Monitoring System</h3><button type="button" onClick={handleAddTargetRow} className="flex items-center gap-2 bg-[#002366] text-white px-4 py-3 rounded-xl text-xs font-bold"><Plus size={14} />Add Target Row</button></div>
              <div className="overflow-x-auto"><table className="w-full text-left border-collapse min-w-[950px]"><thead><tr className="bg-gray-50 border-b text-[10px] font-black uppercase text-gray-500"><th className="px-6 py-4 w-[280px]">Behavior Targets</th>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((name, index) => <th key={name} className="px-3 py-3 border-l text-center"><div>{name}</div><div className="text-gray-400 mt-1">{formatLocalDate(daysOfWeek[index])}</div><div className="grid grid-cols-2 mt-2 text-blue-900"><div>IN</div><div>OUT</div></div></th>)}<th className="p-4 text-center">Delete</th></tr></thead>
                <tbody className="divide-y divide-gray-100">{targets.map((target, index) => <tr key={target.id} className="hover:bg-gray-50/30"><td className="px-6 py-4"><div className="flex items-center gap-2"><span className="text-xs text-gray-400">{index + 1}.</span><input aria-label={`Target perilaku ${index + 1}`} value={target.text} onChange={event => { const text = event.target.value; setTargets(previous => previous.map(item => item.id === target.id ? { ...item, text } : item)); setDirty(true); }} placeholder="Tulis target perilaku..." className={inputClass} /></div></td>{[0, 1, 2, 3, 4].map(day => <td key={day} className="px-3 py-3 border-l"><div className="grid grid-cols-2 gap-2">{(['checkIn', 'checkOut'] as const).map(type => {
                  const value = scores[target.id]?.[day]?.[type] ?? null;
                  return <select key={type} aria-label={`${target.text || `Target ${index + 1}`} ${day + 1} ${type}`} disabled={!target.text.trim()} value={value === null ? '' : String(value)} onChange={event => handleScoreChange(target.id, day, type, event.target.value === '' ? null : Number(event.target.value))} className={cn('w-full text-center text-xs font-black rounded-lg border py-2 outline-none cursor-pointer disabled:opacity-40', value === 4 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : value === 3 ? 'bg-blue-50 text-blue-700 border-blue-200' : value === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' : value === 1 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-400 border-gray-100')}><option value="">—</option>{[4, 3, 2, 1].map(score => <option key={score} value={score}>{score}</option>)}</select>;
                })}</div></td>)}<td className="px-4 text-center"><button type="button" title="Hapus target" onClick={() => handleRemoveTargetRow(target.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button></td></tr>)}
                {targets.length === 0 && <tr><td colSpan={7} className="text-center p-10 text-gray-500 text-sm">Belum ada target perilaku. Klik “Add Target Row” untuk menambahkan.</td></tr>}
                <tr className="bg-blue-50/40 text-xs font-bold"><td className="px-6 py-4">Daily Point Sum &amp; Pct</td>{[0, 1, 2, 3, 4].map(day => { const stats = statistics(targets, scores, day); return <td key={day} className="p-3 text-center border-l">{stats.pct === null ? '—' : <><div>{stats.pct}%</div><div className="text-[10px] text-gray-400 mt-1">{stats.earned} / {stats.possible} pts</div></>}</td>; })}<td /></tr></tbody></table></div>
              <div className="p-4 bg-gray-50 border-t flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-bold text-gray-500"><span>Scores:</span><span>4: Outstanding effort (76–100)</span><span>3: Good effort and acceptable behavior (51–75)</span><span>2: Some effort with limited success (26–50)</span><span>1: Little/no effort (0–25)</span></div>
            </div>
            <div className="bg-white rounded-[2rem] border border-gray-100 p-6 space-y-6"><div className="flex items-center gap-3 border-b pb-4"><BookOpen size={20} className="text-blue-600" /><div><h3 className="font-black">Reflections and Notes</h3><p className="text-xs text-gray-400">Weekly monitoring reflections and evaluations</p></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><label htmlFor="hal-baik" className="text-xs font-bold block mb-2">1. Hal baik yang sudah dilakukan minggu ini</label><textarea id="hal-baik" rows={4} value={halBaik} onChange={event => { setHalBaik(event.target.value); setDirty(true); }} className="w-full text-xs p-4 border rounded-2xl outline-none focus:border-blue-400" /></div>
              <div><label htmlFor="refleksi" className="text-xs font-bold block mb-2">2. Refleksi mingguan</label><textarea id="refleksi" rows={4} value={refleksi} onChange={event => { setRefleksi(event.target.value); setDirty(true); }} className="w-full text-xs p-4 border rounded-2xl outline-none focus:border-blue-400" /></div>
              <div className="md:col-span-2"><label htmlFor="teacher-notes" className="text-xs font-bold block mb-2">3. Teacher’s Note</label><textarea id="teacher-notes" rows={4} value={teacherNotes} onChange={event => { setTeacherNotes(event.target.value); setDirty(true); }} className="w-full text-xs p-4 border rounded-2xl outline-none focus:border-blue-400" /></div>
            </div><div className="flex items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-amber-700">{dirty ? 'Ada perubahan yang belum disimpan.' : ''}</span><button type="button" disabled={saving || !ready} onClick={() => void handleSaveWorkbook()} className="flex items-center gap-2 bg-[#002366] text-white px-6 py-4 rounded-xl font-bold text-xs disabled:opacity-50"><Save size={14} />{saving ? 'Saving Workbook...' : 'Save Weekly Workbook'}</button></div></div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
