import * as React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { LpuTrackerActor, LpuTrackerStudent, LpuTrackerCell, LpuTrackerLevel, LpuTrackerCoachAssignment, LpuTrackerLegacyRow } from '../../types/learningPowerUpTracker';
import { TRACKER_SUBJECTS, resolveLpuTrackerStudent, loadLpuTrackerCells, loadLpuTrackerLevels, loadLpuTrackerCoaches, trackerLevelKey, loadLpuTrackerLegacy } from '../../services/learningPowerUpTrackerService';
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
function updatedDate(value: number): string {
  return value ? new Date(value).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short'
  }) : 'Belum ada isian';
}
export default function LearningPowerUpStudentPage() {
  const {
    currentUser
  } = useOutletContext<{
    currentUser: LpuTrackerActor & {
      luminaId?: string;
      studentId?: string;
    };
  }>();
  const {
    activeYear
  } = useAcademicYear();
  const [year, setYear] = React.useState(activeYear || '');
  const [semester, setSemester] = React.useState('ALL');
  const [subject, setSubject] = React.useState('ALL');
  const [student, setStudent] = React.useState<LpuTrackerStudent | null>(null);
  const [cells, setCells] = React.useState<LpuTrackerCell[]>([]);
  const [levels, setLevels] = React.useState<Record<string, LpuTrackerLevel>>({});
  const [coaches, setCoaches] = React.useState<LpuTrackerCoachAssignment[]>([]);
  const [legacy, setLegacy] = React.useState<LpuTrackerLegacyRow[] | null>(null);
  const [loadingLegacy, setLoadingLegacy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [refresh, setRefresh] = React.useState(0);
  React.useEffect(() => {
    if (activeYear) setYear(activeYear);
  }, [activeYear]);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setStudent(null);
    setCells([]);
    setLevels({});
    setCoaches([]);
    setLegacy(null);
    const load = async () => {
      if (!year || !currentUser) return;
      try {
        const own = await resolveLpuTrackerStudent(currentUser, year);
        const [values, currentLevels, assignments] = await Promise.all([loadLpuTrackerCells(year, undefined, undefined, own.id), loadLpuTrackerLevels(year, own.id), loadLpuTrackerCoaches(year, undefined, own.id)]);
        if (!cancelled) {
          setStudent(own);
          setCells(values);
          setLevels(currentLevels);
          setCoaches(assignments);
        }
      } catch (issue) {
        if (!cancelled) setError(errorText(issue));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [year, currentUser?.uid, refresh]);
  if (currentUser?.role !== 'STUDENT') return <p className="p-8 text-rose-700">Halaman ini hanya untuk akun siswa.</p>;
  const years = [...new Set([activeYear, year].filter(Boolean))];
  return <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5"><header className="bg-white border rounded-2xl p-6"><p className="text-xs text-emerald-700">Lumina Junior High · Learning Power-Up</p><h1 className="text-2xl font-bold mt-1">Laporan Learning Power-Up Saya</h1><p className="mt-2 text-sm text-slate-500">Seluruh catatan dari awal sampai akhir periode. Data diisi guru; halaman ini hanya untuk dibaca.</p>{student && <p className="mt-3 text-xs text-slate-600">Siswa: {student.name} · Kelas: {student.className} · NIS: {student.nis}</p>}</header>
    <div className="flex flex-wrap gap-3 items-end bg-white border rounded-2xl p-4"><label className="text-xs">Tahun ajaran<select value={year} onChange={event => setYear(event.target.value)} className="block border rounded-lg p-2 mt-1">{years.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs">Semester<select value={semester} onChange={event => setSemester(event.target.value)} className="block border rounded-lg p-2 mt-1"><option value="ALL">Seluruh semester</option><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label><label className="text-xs">Pelajaran<select value={subject} onChange={event => setSubject(event.target.value)} className="block border rounded-lg p-2 mt-1"><option value="ALL">Seluruh pelajaran</option>{TRACKER_SUBJECTS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><button disabled={loading} className="border rounded-lg px-3 py-2 text-xs" onClick={() => setRefresh(value => value + 1)}>Segarkan</button></div>
    {loading && <p className="p-8 text-sm text-slate-500">Memuat laporan pribadi…</p>}{error && <div role="alert" className="bg-rose-50 border rounded-xl p-4 text-sm text-rose-800 whitespace-pre-wrap">{error}</div>}
    {!loading && !error && student && TRACKER_SUBJECTS.filter(item => subject === 'ALL' || item.key === subject).map(item => {
      const rows = cells.filter(cell => cell.subjectKey === item.key && (semester === 'ALL' || cell.semester === semester)).sort((a, b) => a.semester.localeCompare(b.semester) || a.order - b.order || a.columnId.localeCompare(b.columnId));
      const level = levels[trackerLevelKey(student.id, item.key)];
      return <section key={item.key} className="bg-white border rounded-2xl overflow-hidden"><header className="p-5 border-b"><h2 className="text-lg font-bold">{item.label}</h2><p className="text-xs text-slate-500 mt-1">Level terkini dari Literasi & Numerasi: {level?.label || 'Belum ditetapkan'}</p>{item.key === 'numerasi' && <p className="text-xs text-slate-500 mt-1">{coaches.filter(coach => semester === 'ALL' || coach.semester === semester).map(coach => `Coach Semester ${coach.semester}: ${coach.coachName || 'Belum ditetapkan'}`).join(' · ') || 'Coach belum ditetapkan'}</p>}</header>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="p-3">Semester</th><th className="p-3 min-w-[180px]">Kolom / Kegiatan</th><th className="p-3 min-w-[130px]">Periode</th><th className="p-3 min-w-[170px]">Hasil / Catatan Guru</th><th className="p-3 min-w-[140px]">Pembaruan Isian</th></tr></thead><tbody>{rows.map(cell => <tr key={cell.id} className="border-t"><td className="p-3 align-top">{cell.semester}</td><td className="p-3 align-top font-medium">{cell.label}</td><td className="p-3 align-top text-slate-500">{cell.periodLabel || '—'}</td><td className="p-3 align-top whitespace-pre-wrap break-words">{cell.value === '' ? <span className="text-slate-400">Belum ada catatan</span> : String(cell.value)}</td><td className="p-3 align-top text-xs text-slate-400">{updatedDate(cell.valueUpdatedAt)}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">Belum ada kolom/catatan yang ditujukan kepada Anda pada periode ini.</p>}
      </section>;
    })}
    {!loading && !error && student && <section className="border bg-white rounded-2xl p-4"><button disabled={loadingLegacy} className="underline text-sm text-slate-600" onClick={async () => {
        if (legacy) {
          setLegacy(null);
          return;
        }
        setLoadingLegacy(true);
        try {
          setLegacy(await loadLpuTrackerLegacy(year, student.id));
        } catch (issue) {
          setError(errorText(issue));
        } finally {
          setLoadingLegacy(false);
        }
      }}>{loadingLegacy ? 'Memuat riwayat…' : legacy ? 'Tutup riwayat tugas lama' : 'Lihat riwayat tugas lama'}</button>{legacy && <div className="mt-4 space-y-3"><p className="text-xs text-slate-500">Riwayat sistem lama tetap disimpan. Tidak ada tombol mengirim atau mengubah status.</p>{legacy.map(row => <article key={row.id} className="border rounded-xl p-3 text-xs"><p className="font-semibold">{TRACKER_SUBJECTS.find(item => item.key === row.subjectKey)?.label || row.subjectKey} · {row.date || 'Tanggal tidak tercatat'}</p><p className="mt-1">{row.title}</p>{row.instructions && <p className="mt-1 whitespace-pre-wrap text-slate-500">{row.instructions}</p>}<p className="mt-2 text-slate-400">Status historis: {row.status}</p></article>)}{!legacy.length && <p className="text-xs text-slate-400">Tidak ada riwayat tugas lama pada tahun ajaran ini.</p>}</div>}</section>}
  </div>;
}
