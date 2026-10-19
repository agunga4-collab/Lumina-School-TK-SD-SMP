import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  RefreshCw,
  Settings,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Plus
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/junior-high/behavior/mtss/overview' },
  { id: 'cases', label: 'Behavior Intervention Records', icon: ShieldAlert, path: '/junior-high/behavior/mtss/cases' },
  { id: 'spreadsheet', label: 'Spreadsheet', icon: FileSpreadsheet, path: '/junior-high/behavior/mtss/spreadsheet' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/junior-high/behavior/mtss/analytics' },
  { id: 'backup-config', label: 'Backup Config', icon: Settings, path: '/junior-high/behavior/mtss/backup-config', adminOnly: true },
  { id: 'backup-diagnostics', label: 'Backup Health', icon: ShieldAlert, path: '/junior-high/behavior/mtss/backup-diagnostics', adminOnly: true },
];

export default function MTSSBehaviorLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'SUPER_ADMIN';
  const { activeYear, activeSemester, isLoading } = useAcademicYear();
  
  const [filters, setFilters] = useState({
    academicYear: '',
    semester: ''
  });

  // Sync with context on load or context changes
  useEffect(() => {
    if (activeYear) {
      setFilters({
        academicYear: activeYear,
        semester: String(activeSemester)
      });
    }
  }, [activeYear, activeSemester]);

  const isPrivileged = profile?.role && [
    'SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL'
  ].includes(profile.role);

  const handleRefresh = () => {
    window.location.reload();
  };

  // Check if current filter view is viewing an archived/historical period
  const isArchive = filters.academicYear && filters.semester && (
    filters.academicYear !== activeYear || filters.semester !== String(activeSemester)
  );

  const handleBackToActive = () => {
    setFilters({
      academicYear: activeYear,
      semester: String(activeSemester)
    });
  };

  if (isLoading) {
    return (
      <div className="h-[40vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="animate-spin text-blue-600" size={32} />
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest animate-pulse">Memuat periode akademik aktif...</p>
      </div>
    );
  }

  const hasConfigError = !activeYear || !activeSemester;
  if (hasConfigError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-[2rem] p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <ShieldAlert size={48} className="text-red-500 mx-auto" />
        <h3 className="text-lg font-black text-red-900 uppercase tracking-tight">Kesalahan Konfigurasi</h3>
        <p className="text-sm font-semibold text-red-700 leading-relaxed">
          {isAdmin 
            ? "Tahun ajaran aktif belum dikonfigurasi. Silakan atur tahun ajaran aktif di menu pengaturan systemConfig." 
            : "Tahun ajaran aktif belum dikonfigurasi. Silakan hubungi Administrator."}
        </p>
      </div>
    );
  }

  // Years that are valid from config (or default set)
  const yearOptions = Array.from(new Set(['2024/2025', '2025/2026', '2026/2027', activeYear].filter(Boolean))).sort();

  return (
    <div className="space-y-6">
      {/* Compact Page Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={18} />
            </div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight italic uppercase">
              MTSS <span className="text-blue-600">Behavior</span>
            </h1>
          </div>
          <p className="text-[10px] font-black text-gray-400 font-mono uppercase tracking-widest px-0.5">
            Junior High • Semester {filters.semester} • {filters.academicYear}
          </p>
        </div>

        {/* Right Header Side Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Period / Archive Status Indicator */}
          {isArchive ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg">
                <AlertTriangle size={10} /> Menampilkan Arsip
              </span>
              <button
                onClick={handleBackToActive}
                className="text-[9px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-900 hover:underline px-2 py-1"
              >
                Kembali ke Periode Aktif
              </button>
            </div>
          ) : (
            <span className="text-[9px] font-black uppercase tracking-wider bg-green-50 text-green-700 px-2.5 py-1 rounded-lg">
              Periode Aktif
            </span>
          )}

          {/* Historical Period Dropdowns */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-1.5">
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Year</span>
            <select 
              className="text-[10px] font-black uppercase tracking-wider bg-transparent outline-none cursor-pointer text-gray-700"
              value={filters.academicYear}
              onChange={(e) => setFilters(prev => ({ ...prev, academicYear: e.target.value }))}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-1.5">
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Sem</span>
            <select 
              className="text-[10px] font-black uppercase tracking-wider bg-transparent outline-none cursor-pointer text-gray-700"
              value={filters.semester}
              onChange={(e) => setFilters(prev => ({ ...prev, semester: e.target.value }))}
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>

          <div className="w-px h-6 bg-gray-100 mx-1 hidden sm:block" />

          {/* Main Actions */}
          <Link
            to="/junior-high/behavior/mtss/cases/new"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-sm"
          >
            <Plus size={12} />
            Lapor Kasus Baru (Tier 2 Intervention)
          </Link>

          {/* Refresh Action */}
          <button 
            onClick={handleRefresh}
            className="p-2 bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-100 transition-all active:scale-95 shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw size={14} />
          </button>

          {isPrivileged && (
            <button 
              onClick={() => navigate('/junior-high/behavior/mtss/backup-config')}
              className="p-2 bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-100 transition-all active:scale-95 shadow-sm"
              title="Module Settings"
            >
              <Settings size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Segmented Tab Navigation with Blue Underline */}
      <div className="flex items-center justify-between border-b border-gray-100 overflow-x-auto no-scrollbar pb-px">
        <div className="flex gap-8">
          {TABS.filter(t => !t.adminOnly || isAdmin).map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname.startsWith(tab.path);
            
            return (
              <NavLink
                key={tab.id}
                to={tab.path}
                className={cn(
                  "flex items-center gap-2 py-3 border-b-2 text-[10px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap",
                  isActive 
                    ? "border-blue-600 text-blue-600" 
                    : "border-transparent text-gray-400 hover:text-gray-900"
                )}
              >
                <Icon size={12} className={cn(isActive ? "text-blue-600" : "text-gray-400")} />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Inner Route Content */}
      <div className="mt-6">
        <Outlet context={{ filters, setFilters }} />
      </div>
    </div>
  );
}
