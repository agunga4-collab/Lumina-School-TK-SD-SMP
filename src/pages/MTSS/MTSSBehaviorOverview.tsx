import * as React from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, getClasses } from '../../lib/firebase.ts';
import { useAuth } from '../../context/AuthContext';
import type { MTSSCase, Class } from '../../types';
import { cn, formatDate } from '../../lib/utils';
import {
  ShieldAlert, AlertTriangle, Clock, CheckCircle2,
  ArrowRight, Activity, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';

type Filters = { academicYear: string; semester: string };
type ReadError = { scope: string; message: string };
const BASE = '/junior-high/behavior/mtss';
const clean = (value: unknown) => value == null ? '' : String(value).trim();
function yearKey(value: unknown): string {
  const input = clean(value);
  const parts = input.match(/\d{4}/g);
  return parts && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : input;
}
function readableError(error: unknown): string {
  let value = '';
  if (error instanceof Error) value = error.message;
  else if (typeof error === 'string') value = error;
  else if (error && typeof error === 'object') {
    const candidate = error as { error?: unknown; message?: unknown };
    if (typeof candidate.error === 'string') value = candidate.error;
    else if (typeof candidate.message === 'string') value = candidate.message;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch { /* Native Firebase errors are plain strings. */ }
  return value || 'Data belum dapat dimuat. Silakan coba lagi.';
}
function makeClassLabels(classes: Array<Pick<Class, 'id' | 'name'>>): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const cls of classes) {
    const name = clean(cls.name);
    if (!name) continue;
    for (const key of [clean(cls.id), name]) {
      if (!key) continue;
      if (!result.has(key)) result.set(key, name);
      else if (result.get(key) !== name) result.set(key, null);
    }
  }
  return result;
}
function classLabel(classId: string, snapshotName: unknown, labels: Map<string, string | null>, pending: boolean): string {
  const mapped = labels.get(clean(classId));
  if (mapped) return mapped;
  const snapshot = clean(snapshotName);
  if (snapshot && snapshot !== classId && !/^(JUNIOR_HIGH|ELEMENTARY|KINDERGARTEN)[_-]/i.test(snapshot)) return snapshot;
  return pending ? 'Memuat kelas…' : 'Kelas belum tersedia';
}
function statusLabel(value: unknown): string {
  const labels: Record<string, string> = {
    OPEN: 'Terbuka', IN_PROGRESS: 'Dalam penanganan', ESCALATED: 'Eskalasi',
    UNDER_REVIEW: 'Dalam peninjauan', CLOSED: 'Ditutup',
  };
  return labels[clean(value)] || 'Status belum tersedia';
}
function dateLabel(value: number | undefined): string {
  return value ? formatDate(value) : 'Belum tersedia';
}

export default function MTSSBehaviorOverview() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: Filters }>();
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadedScope, setLoadedScope] = React.useState('');
  const [readError, setReadError] = React.useState<ReadError | null>(null);
  const [reload, setReload] = React.useState(0);
  const [showRecent, setShowRecent] = React.useState(false);
  const recentId = React.useId();
  const accountScope = JSON.stringify([profile?.uid || '', profile?.role || '', profile?.status || '', profile?.unitId || '']);
  const scope = JSON.stringify([accountScope, filters.academicYear, filters.semester]);
  const canRequest = !!profile?.uid && !!filters.academicYear && !!filters.semester;

  const [classLabels, setClassLabels] = React.useState<Map<string, string | null>>(new Map());
  const [classLoadedScope, setClassLoadedScope] = React.useState('');
  const [classError, setClassError] = React.useState<ReadError | null>(null);
  const [classReload, setClassReload] = React.useState(0);
  const classScope = JSON.stringify([accountScope, filters.academicYear]);

  React.useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setLoading(true); setReadError(null); setLoadedScope(''); setCases([]); setShowRecent(false);
    if (!canRequest) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    const fail = (error: unknown) => {
      if (cancelled) return;
      setCases([]); setReadError({ scope, message: readableError(error) }); setLoading(false);
    };
    try {
      // Preserve the existing year query and compatibility for missing semester.
      const q = query(collection(db, 'behaviorCases'), where('academicYear', '==', filters.academicYear));
      unsubscribe = onSnapshot(q, snapshot => {
        if (cancelled) return;
        const data = snapshot.docs.map(item => ({ ...item.data(), id: item.id })) as MTSSCase[];
        const filtered = data.filter(c => !filters.semester || !c.semester || String(c.semester) === String(filters.semester));
        const sorted = [...filtered].sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
        setCases(sorted); setLoadedScope(scope); setReadError(null); setLoading(false);
      }, fail);
    } catch (error) { fail(error); }
    return () => { cancelled = true; unsubscribe?.(); };
  }, [scope, canRequest, filters.academicYear, filters.semester, reload]);

  React.useEffect(() => {
    let cancelled = false;
    setClassLabels(new Map()); setClassLoadedScope(''); setClassError(null);
    if (!profile?.uid || !filters.academicYear) return () => { cancelled = true; };
    getClasses().then(all => {
      if (cancelled) return;
      // Archived class names remain useful for displaying historical cases.
      const eligible = (all || []).filter(cls => cls.unitId === 'JUNIOR_HIGH' && yearKey(cls.academicYear) === yearKey(filters.academicYear));
      setClassLabels(makeClassLabels(eligible)); setClassLoadedScope(classScope);
    }).catch(error => {
      if (!cancelled) setClassError({ scope: classScope, message: readableError(error) });
    });
    return () => { cancelled = true; };
  }, [classScope, profile?.uid, filters.academicYear, classReload]);

  // Keep the original metric definitions and priority ordering.
  const totalActive = cases.filter(c => c.status !== 'CLOSED').length;

  const criticalUpdates = cases.filter(c => {
    if (c.status === 'CLOSED') return false;
    const lastUpdated = c.lastUpdatedAt || c.createdAt || 0;
    return (Date.now() - lastUpdated) > (7 * 86400000);
  }).length;

  const tier3Count = cases.filter(c => c.tier === 'Tier 3' && c.status !== 'CLOSED').length;

  const newCasesCount = cases.filter(c => {
    const created = c.createdAt || 0;
    return (Date.now() - created) <= (7 * 86400000);
  }).length;

  const activeCases = cases.filter(c => c.status !== 'CLOSED');
  const sortedFollowUp = [...activeCases].sort((a, b) => {
    const isATier3 = a.tier === 'Tier 3';
    const isBTier3 = b.tier === 'Tier 3';
    if (isATier3 && !isBTier3) return -1;
    if (!isATier3 && isBTier3) return 1;
    const timeA = a.lastUpdatedAt || a.createdAt || 0;
    const timeB = b.lastUpdatedAt || b.createdAt || 0;
    return timeA - timeB;
  });
  const displayFollowUp = sortedFollowUp.slice(0, 8);

  const recentActivities = cases.filter(c => c.lastConcernSummary).slice(0, 5).map(c => ({
    id: c.id, studentName: c.studentName, action: c.lastConcernSummary,
    time: dateLabel(c.lastConcernDate || c.lastUpdatedAt),
  }));
  const currentError = readError?.scope === scope ? readError.message : '';
  const ready = loadedScope === scope && !loading && !currentError;
  const classPending = classLoadedScope !== classScope && classError?.scope !== classScope;
  const usableClassLabels = classLoadedScope === classScope ? classLabels : new Map<string, string | null>();
  const casePath = (id: string) => `${BASE}/cases/${encodeURIComponent(id)}`;
  const metricItems = [
    { label: 'Kasus aktif', value: totalActive, icon: ShieldAlert, path: `${BASE}/cases?showOnlyActive=true`, valueClass: 'text-slate-900' },
    { label: 'Perlu tindak lanjut', value: criticalUpdates, icon: Clock, path: `${BASE}/cases?needFollowup=true`, valueClass: criticalUpdates ? 'text-amber-700' : 'text-slate-900' },
    { label: 'Tier 3', value: tier3Count, icon: AlertTriangle, path: `${BASE}/cases?tier=Tier%203&showOnlyActive=true`, valueClass: tier3Count ? 'text-rose-700' : 'text-slate-900' },
    { label: 'Kasus baru', value: newCasesCount, icon: CheckCircle2, path: `${BASE}/cases?newCases=true`, valueClass: 'text-slate-900' },
  ];

  if (currentError) {
    return <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5"><h2 className="flex items-center gap-2 font-semibold text-rose-900"><AlertTriangle size={18}/>Ringkasan belum dapat dimuat</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-rose-800">{currentError}</p><p className="mt-2 text-xs text-rose-700">Kondisi ini bukan berarti tidak ada kasus. Angka statistik tidak ditampilkan sampai data berhasil dimuat.</p><button type="button" onClick={() => setReload(value => value + 1)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-400 cursor-pointer"><RefreshCw size={15}/>Coba lagi</button></section>;
  }
  if (!ready) {
    return <p role="status" className="flex min-h-[25vh] items-center justify-center gap-2 text-sm text-slate-500"><Activity size={19} className="animate-pulse"/>{canRequest ? 'Memuat ringkasan…' : 'Menunggu akun dan periode akademik…'}</p>;
  }

  return <div className="space-y-5">
    <section aria-label="Ringkasan kasus" className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4">{metricItems.map((item, index) => {
      const Icon = item.icon;
      return <button type="button" key={item.label} onClick={() => navigate(item.path)} className={cn('flex items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 cursor-pointer', index % 2 === 1 && 'border-l border-slate-100', index > 1 && 'border-t border-slate-100 lg:border-t-0', index === 2 && 'lg:border-l')}><div><p className="text-xs font-medium text-slate-500">{item.label}</p><p className={cn('mt-2 text-2xl font-semibold tabular-nums', item.valueClass)}>{item.value}</p></div><Icon size={17} className="mt-0.5 shrink-0 text-slate-400"/></button>;
    })}</section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5"><h2 className="text-base font-semibold text-slate-900">Kasus aktif</h2><Link to={`${BASE}/cases`} className="inline-flex items-center gap-1 rounded text-sm font-medium text-blue-600 hover:text-blue-800 focus-visible:ring-2 focus-visible:ring-blue-400">Semua kasus<ArrowRight size={14}/></Link></header>
      {classError?.scope === classScope && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"><p>Nama kelas belum dapat dimuat. Data kasus tetap ditampilkan.</p><button type="button" onClick={() => setClassReload(value => value + 1)} className="rounded font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer">Coba lagi</button></div>}
      {!displayFollowUp.length ? <div className="px-5 py-12 text-center"><p className="text-sm font-medium text-slate-600">Tidak ada kasus aktif pada periode ini.</p><p className="mt-1 text-xs text-slate-400">Kasus yang sudah ditutup tetap dapat dilihat melalui daftar kasus.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium text-slate-500"><th className="px-4 py-3 font-medium sm:px-5">Siswa</th><th className="px-3 py-3 font-medium">Kelas</th><th className="px-3 py-3 font-medium">Tier</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Pembaruan</th><th className="px-4 py-3 text-right font-medium sm:px-5">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{displayFollowUp.map(c => <tr key={c.id} className="align-top hover:bg-slate-50/60"><td className="px-4 py-3.5 font-semibold leading-relaxed text-slate-800 sm:px-5">{c.studentName || 'Nama belum tersedia'}</td><td className="px-3 py-3.5 text-slate-600">{classLabel(c.classId, (c as MTSSCase & { className?: string }).className, usableClassLabels, classPending)}</td><td className="px-3 py-3.5"><span className={cn('inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', c.tier === 'Tier 3' ? 'bg-rose-50 text-rose-700' : c.tier === 'Tier 2' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600')}>{c.tier}</span></td><td className="px-3 py-3.5 text-slate-600">{statusLabel(c.status)}</td><td className="whitespace-nowrap px-3 py-3.5 text-slate-500">{dateLabel(c.lastUpdatedAt || c.createdAt)}</td><td className="px-4 py-3.5 text-right sm:px-5"><Link to={casePath(c.id)} aria-label={`Buka kasus ${c.studentName}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Buka<ArrowRight size={12}/></Link></td></tr>)}</tbody></table></div>}
      {activeCases.length > displayFollowUp.length && <footer className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">{displayFollowUp.length} dari {activeCases.length} kasus aktif ditampilkan. <Link to={`${BASE}/cases?showOnlyActive=true`} className="rounded font-medium text-blue-600 hover:underline focus-visible:ring-2 focus-visible:ring-blue-400">Lihat semuanya</Link></footer>}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h2><button type="button" aria-expanded={showRecent} aria-controls={recentId} onClick={() => setShowRecent(current => !current)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 cursor-pointer sm:px-5"><span className="text-sm font-medium text-slate-600">Aktivitas terbaru</span>{showRecent ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}</button></h2>
      <div id={recentId} hidden={!showRecent} className="border-t border-slate-100">{!recentActivities.length ? <p className="px-5 py-6 text-sm text-slate-500">Belum ada aktivitas pada periode ini.</p> : <ul className="divide-y divide-slate-100">{recentActivities.map(item => <li key={item.id} className="px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-2"><Link to={casePath(item.id)} className="rounded text-sm font-medium text-slate-800 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-400">{item.studentName}</Link><span className="text-xs text-slate-400">{item.time}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-500">{item.action}</p></li>)}</ul>}</div>
    </section>
  </div>;
}
