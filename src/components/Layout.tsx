import * as React from 'react';
import { 
  Home, Bell, Grid, LogOut, ChevronRight, LayoutDashboard, 
  Map, Smile, Camera, History, Heart, CheckSquare, BookOpen, 
  Eye, Clock, ShieldAlert, ShieldCheck, ClipboardList, Target, Mail, RefreshCw,
  Baby, TrendingUp, Folder, BarChart3, FileText, Sparkles, Settings, GraduationCap, User,
  Menu, X
} from 'lucide-react';
import { NavLink, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import type { UserRole, UnitType } from '../types';
import { useAuth } from '../context/AuthContext';
import { LuminaLogo } from './LuminaLogo';
import { NotificationBell } from './NotificationBell';
import { useBehaviorAlerts } from '../hooks/useBehaviorAlerts';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [pendingLXDCount, setPendingLXDCount] = React.useState(0);
  
  // Close sidebar on navigation (mobile)
  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Listen for pending LXD count for admins
  React.useEffect(() => {
    if (profile?.role === 'HEAD_UNIT' || profile?.role === 'SUPER_ADMIN') {
      const q = query(
        collection(db, 'lxd'),
        where('status', '==', 'PENDING_APPROVAL')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log('Sidebar LXD pending count:', snapshot.docs.length);
        setPendingLXDCount(snapshot.docs.length);
      }, (error) => {
        console.error("Error listening for pending LXD count:", error);
      });
      
      return () => unsubscribe();
    }
  }, [profile?.role]);
  
  // Call the alert scanner hook
  useBehaviorAlerts();

  const currentUser = profile;

  // Use state for activeUnit so Super Admin can switch
  const [activeUnit, setActiveUnit] = React.useState<UnitType | null>(
    (currentUser?.unitId as UnitType) || 'JUNIOR_HIGH'
  );

  // Student selection for Parents
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(
    currentUser?.linkedStudents?.[0] || null
  );

  if (!currentUser) return null;

  const currentUnit = activeUnit || (currentUser.unitId as UnitType) || 'JUNIOR_HIGH';

  const getUnitName = (unit: UnitType) => {
    switch(unit) {
      case 'KINDERGARTEN': return 'Lumina Kindergarten';
      case 'ELEMENTARY': return 'Lumina Elementary';
      case 'JUNIOR_HIGH': return 'Lumina Junior High';
      default: return 'Lumina Academy';
    }
  };

  const getUnitColor = (unit: UnitType) => {
    switch(unit) {
      case 'KINDERGARTEN': return 'text-pink-600 bg-pink-50 border-pink-100';
      case 'ELEMENTARY': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'JUNIOR_HIGH': return 'text-blue-600 bg-blue-50 border-blue-100';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // If Super Admin has cleared their active unit to switch
  if (currentUser.role === 'SUPER_ADMIN' && !activeUnit) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full space-y-8">
           <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-3 mb-4">
                 <LuminaLogo size="lg" />
                 <h1 className="text-3xl font-black text-gray-900 tracking-tight">LUMINA</h1>
              </div>
              <h2 className="text-xl font-bold text-gray-800">Mode Super Admin</h2>
              <p className="text-gray-500">Pilih unit pendidikan yang ingin Anda tinjau saat ini.</p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(['KINDERGARTEN', 'ELEMENTARY', 'JUNIOR_HIGH'] as UnitType[]).map(unit => (
                  <button 
                    key={unit}
                    onClick={() => setActiveUnit(unit)}
                    className="group bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all text-left flex flex-col justify-between aspect-square"
                  >
                     <div className={cn("p-4 rounded-2xl w-fit mb-4", getUnitColor(unit).split(' ')[1])}>
                        {unit === 'KINDERGARTEN' && <Heart className="text-pink-500" />}
                        {unit === 'ELEMENTARY' && <Baby className="text-emerald-500" />}
                        {unit === 'JUNIOR_HIGH' && <Target className="text-blue-500" />}
                     </div>
                     <div>
                        <h3 className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors">{getUnitName(unit)}</h3>
                        <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-widest leading-loose">Masuk Portal</p>
                     </div>
                  </button>
              ))}
           </div>

           <div className="text-center">
              <button 
                onClick={signOut}
                className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
              >
                 Keluar & Ganti Akun
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-40 lg:z-20 transition-transform duration-300 transform lg:translate-x-0 lg:static",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LuminaLogo size="sm" />
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">LUMINA</h1>
            </div>
            <p className={cn("text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border w-fit mt-2", getUnitColor(currentUnit))}>
              {getUnitName(currentUnit)}
            </p>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-900 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 px-4 overflow-y-auto space-y-6 pb-8">
          {/* Dashboard Navigation */}
          <div className="space-y-1">
             <NavSectionLabel label="Utama" />
             
             {currentUser.role === 'STUDENT' ? (
                <>
                  <NavItem to="/student/dashboard" icon={<Home size={18} />} label="Dashboard Siswa" />
                  <NavItem to="/self-exploration/my" icon={<Sparkles size={18} />} label="Self Exploration" />
                  <NavItem to="/student/reports" icon={<FileText size={18} />} label="Rapor Saya" />
                </>
             ) : currentUser.role === 'PARENT' ? (
                <>
                  <NavItem to="/parent/dashboard" icon={<Home size={18} />} label="Dashboard Ortu" />
                  <NavItem to="/parent/reports" icon={<FileText size={18} />} label="Rapor Anak" />
                </>
             ) : (
                <NavItem to="/" icon={<Home size={18} />} label="Dashboard" />
             )}
             
             {(currentUser.role === 'HEAD_UNIT' || currentUser.role === 'HEAD_JUNIOR' || currentUser.role === 'SUPER_ADMIN') && (
                <>
                  <NavItem 
                    to={currentUnit === 'KINDERGARTEN' ? '/dashboard/head-kindy' : (currentUnit === 'ELEMENTARY' ? '/dashboard/head-elementary' : '/dashboard/head')} 
                    icon={<LayoutDashboard size={18} />} 
                    label="Analisis Unit" 
                  />
                  <NavItem to="/child/passport" icon={<Map size={18} />} label="Passport Siswa" />
                </>
             )}
          </div>

          {/* Unit Specific Menus (Teacher & Admin Only) */}
          {(currentUser.role === 'TEACHER' || currentUser.role === 'HEAD_UNIT' || currentUser.role === 'HEAD_JUNIOR' || currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'BK_MENTOR') && (
            <>
              {currentUnit === 'KINDERGARTEN' && (
                <div className="space-y-1">
                  <NavSectionLabel label="Keseharian & Belajar" />
                  <NavItem to="/kindy/checklist" icon={<Smile size={18} />} label="Hadir & Emosi" />
                  <NavItem to="/kindy/observation" icon={<Camera size={18} />} label="Observasi & Foto" />
                  <NavItem to="/kindy/weekly-review" icon={<History size={18} />} label="Weekly Review" />
                </div>
              )}

              {currentUnit === 'ELEMENTARY' && (
                <div className="space-y-1">
                  <NavSectionLabel label="Akademik" />
                  <NavItem to="/lateness" icon={<Clock size={18} />} label="Keterlambatan" />
                  <NavItem to="/attendance" icon={<CheckSquare size={18} />} label="Kehadiran" />
                  <NavItem to="/academic/learning-goals" icon={<Target size={18} />} label="Learning Goals" />
                  <NavItem to="/academic/lxd" icon={<BookOpen size={18} />} label="LXD" />
                  <NavItem to="/literacy/input" icon={<BookOpen size={18} />} label="Literasi & Numerasi" />
                  <NavItem to="/observations" icon={<Eye size={18} />} label="Observasi Guru" />
                </div>
              )}

              {currentUnit === 'JUNIOR_HIGH' && (
                <div className="space-y-1">
                  <NavSectionLabel label="Akademik & MTSS" />
                  <NavItem to="/lateness" icon={<Clock size={18} />} label="Tardiness" />
                  <NavItem to="/attendance" icon={<CheckSquare size={18} />} label="Kehadiran" />
                  <NavItem to="/academic/learning-goals" icon={<Target size={18} />} label="Learning Goals" />
                  <NavItem to="/academic/lxd" icon={<BookOpen size={18} />} label="LXD" />
                  {(currentUser.role === 'HEAD_UNIT' || currentUser.role === 'SUPER_ADMIN') && (
                    <NavItem 
                      to="/academic/lxd/approval-queue" 
                      icon={<ClipboardList size={18} />} 
                      label="Approval Queue" 
                      badge={pendingLXDCount > 0 ? pendingLXDCount.toString() : undefined}
                    />
                  )}
                  <NavItem to="/academic/buku-nilai" icon={<BarChart3 size={18} />} label="Buku Nilai" />
                  <NavItem to="/academic/rapor" icon={<FileText size={18} />} label="Rapor" />
                  <NavItem to="/self-exploration" icon={<Sparkles size={18} />} label="Self-Exploration" />
                  <NavItem to="/junior-high/behavior/mtss/overview" icon={<ShieldAlert size={18} />} label="MTSS Behavior" />
                  <NavItem to="/junior-high/academic/mtss/overview" icon={<GraduationCap size={18} />} label="MTSS Academic" />
                </div>
              )}
            </>
          )}

          {/* Shared Sections */}
          <div className="space-y-1">
            <NavSectionLabel label="Komunikasi" />
             {/* Refleksi Diri removed - replaced by Self Exploration in Academic for SMP */}
          </div>

          {(currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT') && (
            <div className="space-y-1">
              <NavSectionLabel label="Sistem" />
              <NavItem to="/settings/report-config" icon={<Settings size={18} />} label="Report Config" />
              {currentUser.role === 'SUPER_ADMIN' && (
                <NavItem to="/admin" icon={<ShieldCheck size={18} />} label="Panel Super Admin" />
              )}
            </div>
          )}
        </div>

        {/* User profile & Sign Out */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white shadow-sm border border-gray-100 mb-4">
             <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold border-2 border-white shadow-sm ring-1 ring-blue-50 overflow-hidden">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt={currentUser.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  currentUser.displayName[0]
                )}
             </div>
             <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-bold text-gray-900 truncate">{currentUser.displayName}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{currentUser.jobTitle || currentUser.role.replace('_', ' ')}</p>
             </div>
          </div>
          
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm font-bold rounded-xl transition-colors mb-1",
                isActive
                  ? "bg-blue-50 text-blue-600 shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )
            }
          >
            <User size={18} />
            My Profile
          </NavLink>

          <button 
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative h-full">
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 py-3 px-4 lg:px-8 sticky top-0 z-10 flex justify-between items-center h-[64px] lg:h-[72px]">
          <div className="flex items-center gap-3 lg:gap-4">
             <button 
               onClick={() => setSidebarOpen(true)}
               className="p-2 bg-gray-50 rounded-xl text-gray-600 hover:bg-gray-100 lg:hidden border border-gray-100"
             >
                <Menu size={20} />
             </button>
             
             <div>
                <h2 className="text-sm lg:text-lg font-bold text-gray-900 leading-tight">
                  {getUnitName(currentUnit)}
                </h2>
                <p className="text-[10px] lg:text-[11px] font-medium text-gray-500">Beranda Portal Lumina</p>
             </div>

             {currentUser.role === 'SUPER_ADMIN' && (
                <div className="ml-4 pl-4 border-l border-gray-100">
                   <button 
                     onClick={() => setActiveUnit(null)}
                     className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-100 transition-all border border-blue-100 shadow-sm shadow-blue-50"
                   >
                      <RefreshCw size={14} />
                      Ganti Unit
                   </button>
                </div>
             )}
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 border-r border-gray-100 pr-6 mr-6 hidden md:flex">
               <NotificationBell />
               <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                  <Grid size={20} />
               </button>
            </div>
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-bold text-gray-900 leading-none mb-1">
                {new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
              </span>
              <span className="text-[10px] text-gray-300 font-bold tracking-widest uppercase">Semester 2 • 2025/2026</span>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          <Outlet context={{ 
            currentUser, 
            activeUnit: currentUnit, 
            selectedStudentId, 
            setSelectedStudentId 
          }} />
        </div>
      </main>
    </div>
  );
}

function NavSectionLabel({ label }: { label: string }) {
  return (
    <div className="pt-4 pb-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
      {label}
    </div>
  );
}

function NavItem({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group",
          isActive
            ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        )
      }
    >
      <div className="flex items-center gap-3">
        <span className={cn("transition-transform group-hover:scale-110", "duration-200")}>{icon}</span>
        <span>{label}</span>
      </div>
      {badge && (
        <span className={cn(
          "px-1.5 py-0.5 rounded-md text-[10px] font-black",
          "bg-red-500 text-white"
        )}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}
