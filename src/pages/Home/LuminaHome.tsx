import * as React from 'react';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, ClipboardList, ShieldAlert, User as UserIcon, Target, 
  Users, Home, Eye, CheckSquare, Mail, BookOpen, Folder, Heart, 
  Baby, History, BarChart3, TrendingUp, Clock, Camera, Smile, Sparkles,
  ChevronRight, Bell, Calendar, Zap, AlertCircle, ArrowRight, Map
} from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import type { UserRole, UnitType, User } from '../../types';
import KindergartenHeadDashboard from '../Kindergarten/HeadDashboard';

export default function LuminaHome() {
  const { 
    currentUser, 
    activeUnit, 
    selectedStudentId, 
    setSelectedStudentId,
    parentStudents
  } = useOutletContext<{ 
    currentUser: User; 
    activeUnit: UnitType;
    selectedStudentId?: string;
    setSelectedStudentId?: (id: string) => void;
    parentStudents?: any[];
  }>();
  
  const navigate = useNavigate();
  const userName = currentUser.displayName;
  const userRole = currentUser.role;

  if (activeUnit === 'KINDERGARTEN' && (userRole === 'HEAD_UNIT' || userRole === 'SUPER_ADMIN')) {
    return <KindergartenHeadDashboard />;
  }

  const isParent = userRole === 'PARENT';
  
  const studentsInUnit = React.useMemo(() => {
    if (!parentStudents) return [];
    return parentStudents.filter(s => (s.unitId || s.currentUnit) === activeUnit);
  }, [parentStudents, activeUnit]);

  const hasMultipleKids = isParent && studentsInUnit.length > 1;

  const currentSelectedStudentName = React.useMemo(() => {
    const student = studentsInUnit.find(s => s.id === selectedStudentId);
    return student ? student.name : '';
  }, [studentsInUnit, selectedStudentId]);

  const getUnitDisplayName = (unit: UnitType) => {
    switch(unit) {
      case 'KINDERGARTEN': return 'Kindergarten';
      case 'ELEMENTARY': return 'Elementary';
      case 'JUNIOR_HIGH': return 'Junior High';
      default: return '';
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Greeting Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 p-10 rounded-[3rem] text-white shadow-xl shadow-blue-100">
        <div className="absolute top-0 right-0 p-10 opacity-10">
           <Zap size={180} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-widest backdrop-blur-sm">Selamat Datang</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <h1 className="text-4xl font-black tracking-tight leading-none italic">Halo, {userName}!</h1>
            <p className="text-blue-100 font-medium text-sm flex flex-wrap items-center gap-2">
               <Calendar size={16} /> 
               <span>{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span>
               <span>•</span>
               <span>Unit {getUnitDisplayName(activeUnit)}</span>
               {currentSelectedStudentName && (
                 <>
                   <span>•</span>
                   <span className="bg-white/10 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider backdrop-blur-sm">
                      Ananda: {currentSelectedStudentName}
                   </span>
                 </>
               )}
            </p>
          </div>

          {hasMultipleKids && (
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-[2rem] border border-white/10 space-y-3 min-w-[240px]">
               <div className="flex items-center gap-2 px-1">
                  <Baby size={14} className="text-blue-200" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-100">Pilih Data Anak</span>
               </div>
               <div className="flex flex-wrap gap-2">
                  {studentsInUnit.map(student => (
                    <button 
                      key={student.id}
                      onClick={() => setSelectedStudentId?.(student.id)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black transition-all border",
                        selectedStudentId === student.id 
                          ? "bg-white text-blue-600 border-white shadow-lg" 
                          : "bg-white/5 text-blue-100 border-white/10 hover:bg-white/10"
                      )}
                    >
                      {((student.name || student.fullName || student.displayName || "Ananda") + "").split(' ')[0]}
                    </button>
                  ))}
               </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Grid: Shortcuts & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Shortcuts Column */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 px-2">Akses Cepat Transaksi</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Shortcut role={userRole} unit={activeUnit} />
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Informasi Terkini</h3>
                <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:translate-x-1 transition-transform flex items-center gap-1">
                   Lihat Semua <ArrowRight size={12} />
                </button>
             </div>
             <div className="space-y-4">
                <StatusCard role={userRole} unit={activeUnit} />
             </div>
          </div>
        </div>

        {/* Action / Alert Column */}
        <div className="space-y-6">
           <div className="bg-orange-50 rounded-[2.5rem] p-8 border border-orange-100">
              <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-white rounded-2xl text-orange-600 shadow-sm">
                    <AlertCircle size={24} />
                 </div>
                 <div>
                    <h4 className="text-sm font-black text-orange-950 leading-tight">Perhatian Mendesak</h4>
                    <p className="text-[10px] text-orange-700 font-bold uppercase tracking-wider">Butuh Konfirmasi</p>
                 </div>
              </div>
              <AlertList role={userRole} unit={activeUnit} />
           </div>

           <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">Agenda Sekolah</h4>
              <div className="text-center py-4 border border-dashed border-gray-700 rounded-2xl opacity-50">
                 <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Belum Ada Agenda</p>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}

function Shortcut({ role, unit }: { role: UserRole; unit: UnitType }) {
  const isHead = role === 'HEAD_UNIT' || role === 'HEAD_JUNIOR' || role === 'SUPER_ADMIN';
  const isTeacher = role === 'TEACHER';
  const isBK = role === 'BK_MENTOR';
  const isParent = role === 'PARENT';
  const isStudent = role === 'STUDENT';

  const shortcuts = [];

  if (isHead) {
    if (unit === 'KINDERGARTEN') {
      shortcuts.push(
        { label: 'Analisis Unit', icon: <LayoutDashboard size={20} />, to: '/dashboard/head-kindy', color: 'bg-blue-50 text-blue-600' },
        { label: 'Student Portfolio', icon: <Map size={20} />, to: '/child/passport', color: 'bg-emerald-50 text-emerald-600' }
      );
    } else {
      shortcuts.push(
        { label: 'Analisis Unit', icon: <LayoutDashboard size={20} />, to: '/dashboard/head', color: 'bg-blue-50 text-blue-600' },
        { label: 'MTSS Summary', icon: <BarChart3 size={20} />, to: '/mtss/cases', color: 'bg-purple-50 text-purple-600' },
        { label: 'Student Portfolio', icon: <Map size={20} />, to: '/child/passport', color: 'bg-emerald-50 text-emerald-600' },
        { label: 'Laporan Unit', icon: <BookOpen size={20} />, to: '/', color: 'bg-teal-50 text-teal-600' }
      );
    }
  } else if (isTeacher) {
    if (unit === 'KINDERGARTEN') {
      shortcuts.push(
        { label: 'Attendance & Emotional Checklist', icon: <Smile size={20} />, to: '/kindy/checklist', color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Observation Data', icon: <Camera size={20} />, to: '/kindy/observation', color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Weekly Summary & AI', icon: <Sparkles size={20} />, to: '/kindy/weekly-summary', color: 'bg-emerald-50 text-emerald-600' },
        { label: 'Weekly Report (Final)', icon: <History size={20} />, to: '/kindy/weekly-review', color: 'bg-emerald-50 text-emerald-600' },
        { label: 'Student Portfolio', icon: <Map size={20} />, to: '/child/passport', color: 'bg-orange-50 text-orange-600' }
      );
    } else {
      shortcuts.push(
        { label: unit === 'JUNIOR_HIGH' ? 'Tardiness' : 'Keterlambatan', icon: <Clock size={20} />, to: '/lateness', color: 'bg-pink-50 text-pink-600' },
        { label: 'Kehadiran', icon: <CheckSquare size={20} />, to: '/attendance', color: 'bg-blue-50 text-blue-600' },
        { label: 'Literasi/Num', icon: <BookOpen size={20} />, to: '/literacy/input', color: 'bg-emerald-50 text-emerald-600' },
        { label: 'MTSS Intv', icon: <ShieldAlert size={20} />, to: '/mtss/cases', color: 'bg-orange-50 text-orange-600' }
      );
    }
  } else if (isBK) {
    shortcuts.push(
      { label: 'MTSS Behavior', icon: <ShieldAlert size={20} />, to: '/mtss/cases', color: 'bg-orange-50 text-orange-600' },
      { label: 'Intervensi', icon: <ClipboardList size={20} />, to: '/', color: 'bg-blue-50 text-blue-600' },
      { label: 'Exploration', icon: <Target size={20} />, to: '/exploration/mentor', color: 'bg-purple-50 text-purple-600' },
      { label: 'Student Portfolio', icon: <Map size={20} />, to: '/child/passport', color: 'bg-emerald-50 text-emerald-600' }
    );
  } else if (isParent) {
    shortcuts.push(
      { label: 'Student Portfolio', icon: <Map size={20} />, to: '/child/passport', color: 'bg-blue-50 text-blue-600' },
      { label: 'Progress Belajar', icon: <TrendingUp size={20} />, to: '/child/progress', color: 'bg-emerald-50 text-emerald-600' },
      { label: 'Kehadiran', icon: <CheckSquare size={20} />, to: '/child/attendance', color: 'bg-orange-50 text-orange-600' },
      { label: 'Pesan', icon: <Mail size={20} />, to: '/messages', color: 'bg-indigo-50 text-indigo-600' }
    );
  } else if (isStudent) {
    shortcuts.push(
      { label: 'Halaman Saya', icon: <UserIcon size={20} />, to: '/', color: 'bg-blue-50 text-blue-600' },
      { label: 'Student Portfolio', icon: <Map size={20} />, to: '/child/passport', color: 'bg-emerald-50 text-emerald-600' },
      { label: 'Refleksi Diri', icon: <ClipboardList size={20} />, to: '/exploration/reflection', color: 'bg-purple-50 text-purple-600' },
      { label: 'Portofolio', icon: <Folder size={20} />, to: '/', color: 'bg-orange-50 text-orange-600' }
    );
  }

  const navigate = useNavigate();

  return (
    <>
      {shortcuts.map((s, i) => (
        <button 
          key={i}
          onClick={() => navigate(s.to)}
          className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all text-left flex flex-col group justify-between h-40"
        >
          <div className={cn("p-4 rounded-2xl w-fit group-hover:scale-110 transition-transform", s.color.split(' ')[0])}>
            {React.cloneElement(s.icon as React.ReactElement, { className: s.color.split(' ')[1] })}
          </div>
          <span className="text-xs font-black text-gray-900 leading-tight">{s.label}</span>
        </button>
      ))}
    </>
  );
}

function StatusCard({ role, unit }: { role: UserRole; unit: UnitType }) {
  const stats = React.useMemo(() => {
    if (unit !== 'KINDERGARTEN') return null;
    
    const studentsStr = localStorage.getItem('kg_students');
    if (!studentsStr) return null;
    try {
      const parsedStudents = JSON.parse(studentsStr);
      if (!Array.isArray(parsedStudents) || parsedStudents.length === 0) {
        return null;
      }
    } catch {
      return null;
    }
    
    const savedChecklist = localStorage.getItem('kg_checklist_records');
    if (!savedChecklist) return null;
    
    try {
      const records = JSON.parse(savedChecklist);
      let totalSlots = 0;
      let presentCount = 0;
      let happyCount = 0;
      
      Object.values(records).forEach((studentMap: any) => {
        Object.values(studentMap).forEach((status: any) => {
          totalSlots++;
          if (status.attendance === 'PRESENT') {
            presentCount++;
            if (status.emotion === 'HAPPY' || status.emotion === 'OK') {
              happyCount++;
            }
          }
        });
      });
      
      return {
        hasData: totalSlots > 0,
        attendanceRate: totalSlots > 0 ? Math.round((presentCount / totalSlots) * 100) : 0,
        happyRate: presentCount > 0 ? Math.round((happyCount / presentCount) * 100) : 0,
        totalEntries: totalSlots
      };
    } catch {
      return null;
    }
  }, [unit]);

  if (unit === 'KINDERGARTEN' && stats && stats.hasData) {
    return (
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 p-6 rounded-[2.5rem] space-y-4 w-full">
         <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-100/60 px-3 py-1 rounded-full">Statistik Lumina Kindergarten</span>
            <Sparkles className="text-emerald-500 animate-pulse" size={14} />
         </div>
         <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-emerald-50 shadow-sm">
               <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Rataan Kehadiran</span>
               <div className="text-xl font-black text-emerald-800">{stats.attendanceRate}%</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-emerald-50 shadow-sm">
               <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Indeks Bahagia</span>
               <div className="text-xl font-black text-rose-600">{stats.happyRate}%</div>
            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-dashed border-gray-200 rounded-2xl w-full">
       <BarChart3 className="text-gray-300 mb-2" size={32} />
       <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Belum Ada Data</p>
    </div>
  );
}

function AlertList({ role, unit }: { role: UserRole; unit: UnitType }) {
  return (
    <div className="text-center py-6">
       <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-200 mx-auto mb-3 shadow-sm">
          <Bell size={24} />
       </div>
       <p className="text-[10px] font-black text-orange-800 uppercase tracking-widest">Tidak Ada Antrean</p>
       <p className="text-[9px] text-orange-600/60 font-medium mt-1">Semua tugas selesai!</p>
    </div>
  );
}
