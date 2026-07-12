import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  Eye, 
  History, 
  BarChart3,
  TrendingUp,
  RefreshCw,
  Settings
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/junior-high/behavior/mtss/overview' },
  { id: 'cases', label: 'Behavior Register', icon: ShieldAlert, path: '/junior-high/behavior/mtss/cases' },
  { id: 'identification', label: 'Identification', icon: Eye, path: '/junior-high/behavior/mtss/identification' },
  { id: 'timeline', label: 'Timeline', icon: History, path: '/junior-high/behavior/mtss/timeline' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/junior-high/behavior/mtss/analytics' },
  { id: 'backup-config', label: 'Backup Config', icon: Settings, path: '/junior-high/behavior/mtss/backup-config', adminOnly: true },
  { id: 'backup-diagnostics', label: 'Backup Health', icon: ShieldAlert, path: '/junior-high/behavior/mtss/backup-diagnostics', adminOnly: true },
];

export default function MTSSBehaviorLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'SUPER_ADMIN';
  const { activeYear, activeSemester } = useAcademicYear();
  
  const [filters, setFilters] = useState({
    academicYear: activeYear || '2025/2026',
    semester: String(activeSemester || '2')
  });

  React.useEffect(() => {
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

  return (
    <div className="space-y-6">
      {/* Module Header with Shared Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12 transform translate-x-4">
           <ShieldAlert size={120} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">MTSS <span className="text-blue-600">Behavior</span></h1>
          </div>
          <p className="text-xs font-bold text-gray-400 font-mono uppercase tracking-widest px-1">Lumina Junior High • Behavior Support System</p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Year</span>
            <select 
              className="text-xs font-black uppercase tracking-widest bg-transparent outline-none cursor-pointer text-gray-700"
              value={filters.academicYear}
              onChange={(e) => setFilters(prev => ({ ...prev, academicYear: e.target.value }))}
            >
              <option value="2024/2025">2024/2025</option>
              <option value="2025/2026">2025/2026</option>
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sem</span>
            <select 
              className="text-xs font-black uppercase tracking-widest bg-transparent outline-none cursor-pointer text-gray-700"
              value={filters.semester}
              onChange={(e) => setFilters(prev => ({ ...prev, semester: e.target.value }))}
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>

          <div className="w-px h-8 bg-gray-100 mx-1" />

          <button 
            onClick={handleRefresh}
            className="p-2.5 bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-100 transition-all shadow-sm active:scale-95"
            title="Refresh Data"
          >
            <RefreshCw size={18} />
          </button>

          {isPrivileged && (
            <button 
              onClick={() => {}} // Placeholder for now
              className="p-2.5 bg-white text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-100 transition-all shadow-sm active:scale-95 group/btn"
              title="Module Settings"
            >
              <Settings size={18} className="group-hover/btn:rotate-90 transition-transform duration-500" />
            </button>
          )}
        </div>
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto no-scrollbar scroll-smooth">
        {TABS.filter(t => !t.adminOnly || isAdmin).map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname.startsWith(tab.path);
          
          return (
            <NavLink
              key={tab.id}
              to={tab.path}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 whitespace-nowrap group relative",
                isActive 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                  : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              <Icon size={14} className={cn("transition-transform group-hover:scale-110 relative z-10", isActive ? "text-white" : "text-gray-400 group-hover:text-blue-600")} />
              <span className="relative z-10">{tab.label}</span>
              {isActive && (
                <motion.div 
                  layoutId="activeTabBehavior"
                  className="absolute inset-0 bg-blue-600 rounded-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Inner Route Content */}
      <div className="mt-6">
        <Outlet context={{ filters, setFilters }} />
      </div>
    </div>
  );
}
