import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Eye, 
  History, 
  BarChart3,
  GraduationCap,
  RefreshCw,
  Settings,
  ShieldAlert
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/junior-high/academic/mtss/overview' },
  { id: 'cases', label: 'Cases', icon: TrendingUp, path: '/junior-high/academic/mtss/cases' },
  { id: 'screening', label: 'Screening', icon: Eye, path: '/junior-high/academic/mtss/screening' },
  { id: 'timeline', label: 'Timeline', icon: History, path: '/junior-high/academic/mtss/timeline' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/junior-high/academic/mtss/analytics' },
];

export default function MTSSAcademicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [filters, setFilters] = useState({
    academicYear: '2023/2024',
    semester: '2'
  });

  const isPrivileged = profile?.role && [
    'SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR'
  ].includes(profile.role);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Module Header with Shared Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12 transform translate-x-4">
           <GraduationCap size={120} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <GraduationCap size={20} />
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">MTSS <span className="text-emerald-600">Academic</span></h1>
          </div>
          <p className="text-xs font-bold text-gray-400 font-mono uppercase tracking-widest px-1">Lumina Junior High • Academic Support System</p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Year</span>
            <select 
              className="text-xs font-black uppercase tracking-widest bg-transparent outline-none cursor-pointer text-gray-700"
              value={filters.academicYear}
              onChange={(e) => setFilters(prev => ({ ...prev, academicYear: e.target.value }))}
            >
              <option value="2023/2024">2023/2024</option>
              <option value="2024/2025">2024/2025</option>
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
            className="p-2.5 bg-white text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-gray-100 transition-all shadow-sm active:scale-95"
            title="Refresh Data"
          >
            <RefreshCw size={18} />
          </button>

          {isPrivileged && (
            <div className="flex items-center gap-1.5 ml-1">
              <button 
                onClick={() => navigate('/junior-high/academic/mtss/backup-diagnostics')}
                className="p-2.5 bg-white text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-gray-100 transition-all shadow-sm active:scale-95 group/diag"
                title="Backup Diagnostics"
              >
                <ShieldAlert size={18} className="group-hover/diag:scale-110 transition-transform" />
              </button>
              <button 
                onClick={() => navigate('/junior-high/academic/mtss/backup-config')}
                className="p-2.5 bg-white text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-gray-100 transition-all shadow-sm active:scale-95 group/btn"
                title="Backup Config"
              >
                <Settings size={18} className="group-hover/btn:rotate-90 transition-transform duration-500" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto no-scrollbar scroll-smooth">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname.startsWith(tab.path);
          
          return (
            <NavLink
              key={tab.id}
              to={tab.path}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 whitespace-nowrap group relative",
                isActive 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100" 
                  : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              <Icon size={14} className={cn("transition-transform group-hover:scale-110 relative z-10", isActive ? "text-white" : "text-gray-400 group-hover:text-emerald-600")} />
              <span className="relative z-10">{tab.label}</span>
              {isActive && (
                <motion.div 
                  layoutId="activeTabAcademic"
                  className="absolute inset-0 bg-emerald-600 rounded-xl"
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
