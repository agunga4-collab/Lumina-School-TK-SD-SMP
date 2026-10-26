import * as React from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import {
  LayoutDashboard, ShieldAlert, RefreshCw, Settings,
  FileSpreadsheet, BarChart3, AlertTriangle, Plus, ChevronDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const BASE = '/junior-high/behavior/mtss';
const TABS = [
  { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard, path: `${BASE}/overview` },
  { id: 'cases', label: 'Kasus', icon: ShieldAlert, path: `${BASE}/cases` },
  { id: 'spreadsheet', label: 'Pemantauan', icon: FileSpreadsheet, path: `${BASE}/spreadsheet` },
  { id: 'analytics', label: 'Analitik', icon: BarChart3, path: `${BASE}/analytics` },
];

export default function MTSSBehaviorLayout() {
  const location = useLocation();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'SUPER_ADMIN';
  const { activeYear, activeSemester, isLoading } = useAcademicYear();
  const activeSemesterText = activeSemester ? String(activeSemester) : '';
  const [filters, setFilters] = React.useState({
    academicYear: activeYear || '',
    semester: activeSemesterText,
  });
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsRef = React.useRef<HTMLDivElement>(null);
  const settingsButtonRef = React.useRef<HTMLButtonElement>(null);
  const settingsId = React.useId();

  React.useEffect(() => {
    if (activeYear) {
      setFilters({ academicYear: activeYear || '', semester: activeSemester ? String(activeSemester) : '' });
    }
  }, [activeYear, activeSemester]);

  React.useEffect(() => {
    setSettingsOpen(false);
  }, [location.pathname, profile?.uid, profile?.role]);

  React.useEffect(() => {
    if (!settingsOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target)) {
        setSettingsOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSettingsOpen(false);
      settingsButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [settingsOpen]);

  // Keep the role visibility from the supplied layout.
  const isPrivileged = !!profile?.role && [
    'SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL',
  ].includes(profile.role);
  const isArchive = !!filters.academicYear && !!filters.semester && (
    filters.academicYear !== activeYear || filters.semester !== activeSemesterText
  );
  const handleBackToActive = () => {
    setFilters({ academicYear: activeYear || '', semester: activeSemester ? String(activeSemester) : '' });
  };
  const handleRefresh = () => {
    if (window.confirm('Muat ulang halaman? Simpan perubahan yang belum tersimpan terlebih dahulu.')) {
      window.location.reload();
    }
  };

  if (isLoading) {
    return <div role="status" className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-slate-500"><RefreshCw size={18} className="animate-spin"/>Memuat periode akademik…</div>;
  }
  if (!activeYear || !activeSemester) {
    return <div role="alert" className="mx-auto my-10 max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-6"><h2 className="flex items-center gap-2 font-semibold text-rose-900"><ShieldAlert size={20}/>Periode akademik belum tersedia</h2><p className="mt-2 text-sm leading-relaxed text-rose-700">{isAdmin ? 'Atur tahun ajaran dan semester aktif pada pengaturan sistem sebelum membuka modul ini.' : 'Hubungi administrator untuk memeriksa tahun ajaran dan semester aktif.'}</p></div>;
  }

  const yearOptions = Array.from(new Set(['2024/2025', '2025/2026', '2026/2027', activeYear].filter(Boolean))).sort();
  const settingsActive = location.pathname.startsWith(`${BASE}/backup-`);
  const periodReady = !!filters.academicYear && !!filters.semester;

  return <div className="space-y-5">
    <header className="relative rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight text-slate-900">MTSS Perilaku</h1>{isArchive && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Arsip</span>}</div>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Tahun ajaran</span><select value={filters.academicYear} onChange={event => setFilters(previous => ({ ...previous, academicYear: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer">{yearOptions.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Semester</span><select value={filters.semester} onChange={event => setFilters(previous => ({ ...previous, semester: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer"><option value="1">1</option><option value="2">2</option></select></label>
          <Link to={`${BASE}/cases/new`} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"><Plus size={16}/>Lapor kasus</Link>
          <button type="button" onClick={handleRefresh} aria-label="Muat ulang halaman" title="Muat ulang halaman" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"><RefreshCw size={16}/></button>
          {isPrivileged && <div className="static" ref={settingsRef}>
            <button ref={settingsButtonRef} type="button" onClick={() => setSettingsOpen(open => !open)} aria-expanded={settingsOpen} aria-controls={settingsId} className={cn('inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer', settingsActive || settingsOpen ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}><Settings size={16}/><span className="hidden sm:inline">Pengaturan</span><ChevronDown size={13}/></button>
            {settingsOpen && <div id={settingsId} className="absolute right-0 top-full z-40 mt-2 w-60 max-w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <Link to={`${BASE}/backup-config`} onClick={() => setSettingsOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Pengaturan backup</Link>
              {isAdmin && <Link to={`${BASE}/backup-diagnostics`} onClick={() => setSettingsOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">Status backup</Link>}
            </div>}
          </div>}
        </div>
      </div>
      {isArchive && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-amber-800"><AlertTriangle size={14}/><span>Anda sedang melihat periode arsip.</span><button type="button" onClick={handleBackToActive} className="rounded font-semibold text-blue-600 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer">Kembali ke periode aktif</button></div>}
    </header>
    <nav aria-label="Navigasi MTSS Perilaku" className="overflow-x-auto border-b border-slate-200">
      <div className="flex min-w-max gap-1 sm:gap-3">{TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);
        return <NavLink key={tab.id} to={tab.path} aria-current={isActive ? 'page' : undefined} className={cn('inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400', isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800')}><Icon size={16}/>{tab.label}</NavLink>;
      })}</div>
    </nav>
    <div>{periodReady ? <Outlet context={{ filters, setFilters }}/> : <p role="status" className="p-5 text-sm text-slate-500">Menyiapkan periode…</p>}</div>
  </div>;
}
