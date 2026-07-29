import * as React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError } from '../../lib/firebase.ts';
import { useAuth } from '../../context/AuthContext';
import type { MTSSCase } from '../../types';
import { cn, formatDate } from '../../lib/utils';
import { 
  ShieldAlert, AlertTriangle, Clock, 
  CheckCircle2, ArrowRight, ChevronRight, Activity
} from 'lucide-react';

export default function MTSSBehaviorOverview() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: any }>();
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const q = query(
      collection(db, 'behaviorCases'),
      where('academicYear', '==', filters.academicYear)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MTSSCase[];
      
      // Filter by semester on the client side to be safe with older data missing semester, while strictly isolating active period
      const filteredCases = casesData.filter(c => 
        !filters.semester || !c.semester || String(c.semester) === String(filters.semester)
      );

      const sortedCases = [...filteredCases].sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
      setCases(sortedCases);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', 'behaviorCases');
    });

    return () => unsubscribe();
  }, [filters.academicYear, filters.semester]);

  // Derived metrics
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

  // Sorted list for "Perlu Ditindaklanjuti" section (Active cases, Tier 3 first, then oldest update)
  const activeCases = cases.filter(c => c.status !== 'CLOSED');
  const sortedFollowUp = [...activeCases].sort((a, b) => {
    const isATier3 = a.tier === 'Tier 3';
    const isBTier3 = b.tier === 'Tier 3';
    if (isATier3 && !isBTier3) return -1;
    if (!isATier3 && isBTier3) return 1;
    
    const timeA = a.lastUpdatedAt || a.createdAt || 0;
    const timeB = b.lastUpdatedAt || b.createdAt || 0;
    return timeA - timeB; // oldest first
  });
  const displayFollowUp = sortedFollowUp.slice(0, 8);

  // Dynamic Recent Activities based on real data (most recently updated cases with a summary)
  const recentActivities = cases
    .filter(c => c.lastConcernSummary)
    .slice(0, 5)
    .map(c => ({
      studentName: c.studentName,
      action: c.lastConcernSummary,
      time: formatDate(c.lastConcernDate || c.lastUpdatedAt)
    }));

  if (loading) return (
    <div className="h-[40vh] flex flex-col items-center justify-center space-y-4">
      <Activity className="animate-pulse text-blue-600" size={32} />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Loading Behavior Overview</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Action-Oriented Small Summary Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Kasus Aktif */}
        <button
          onClick={() => navigate('/junior-high/behavior/mtss/cases?showOnlyActive=true')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl shadow-sm text-left transition-all active:scale-[0.98] flex items-center justify-between"
        >
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kasus Aktif</p>
            <p className="text-2xl font-black text-slate-900">{totalActive}</p>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <ShieldAlert size={18} />
          </div>
        </button>

        {/* Perlu Tindak Lanjut */}
        <button
          onClick={() => navigate('/junior-high/behavior/mtss/cases?needFollowup=true')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl shadow-sm text-left transition-all active:scale-[0.98] flex items-center justify-between"
        >
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perlu Tindak Lanjut</p>
            <p className="text-2xl font-black text-amber-600">{criticalUpdates}</p>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={18} />
          </div>
        </button>

        {/* Tier 3 */}
        <button
          onClick={() => navigate('/junior-high/behavior/mtss/cases?tier=Tier%203&showOnlyActive=true')}
          className={cn(
            "p-4 border rounded-2xl shadow-sm text-left transition-all active:scale-[0.98] flex items-center justify-between",
            tier3Count > 0 
              ? "bg-red-50/50 border-red-100 hover:bg-red-50 text-red-700" 
              : "bg-white border-slate-100 hover:bg-slate-50 text-slate-900"
          )}
        >
          <div className="space-y-1">
            <p className={cn("text-[10px] font-black uppercase tracking-widest", tier3Count > 0 ? "text-red-500" : "text-slate-400")}>Tier 3</p>
            <p className={cn("text-2xl font-black", tier3Count > 0 ? "text-red-600" : "text-slate-900")}>{tier3Count}</p>
          </div>
          <div className={cn("p-2.5 rounded-xl", tier3Count > 0 ? "bg-white text-red-600" : "bg-slate-50 text-slate-400")}>
            <AlertTriangle size={18} />
          </div>
        </button>

        {/* Kasus Baru */}
        <button
          onClick={() => navigate('/junior-high/behavior/mtss/cases?newCases=true')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl shadow-sm text-left transition-all active:scale-[0.98] flex items-center justify-between"
        >
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kasus Baru</p>
            <p className="text-2xl font-black text-emerald-600">{newCasesCount}</p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={18} />
          </div>
        </button>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column Utama (Perlu Ditindaklanjuti) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-900">Perlu Ditindaklanjuti</h3>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 px-2.5 py-0.5 rounded-lg">
                Maksimal 8 kasus prioritas
              </span>
            </div>
            
            {displayFollowUp.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-xs font-semibold uppercase tracking-wider">
                Tidak ada kasus yang memerlukan tindak lanjut pada periode ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="px-6 py-3">Nama Siswa</th>
                      <th className="px-4 py-3 text-center">Kelas</th>
                      <th className="px-4 py-3 text-center">Tier</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3">Update Terakhir</th>
                      <th className="px-6 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayFollowUp.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                        <td className="px-6 py-4 font-bold text-gray-900">{c.studentName}</td>
                        <td className="px-4 py-4 text-center font-bold text-gray-500">{c.classId}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                            c.tier === 'Tier 1' ? "bg-blue-100 text-blue-700" :
                            c.tier === 'Tier 2' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {c.tier}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-gray-600 text-[10px]">{c.status.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-4 text-gray-400 font-medium">
                          {formatDate(c.lastUpdatedAt || c.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => navigate(`/junior-high/behavior/mtss/cases/${c.id}`)}
                            className="text-[10px] font-black text-blue-600 hover:text-blue-900 uppercase tracking-widest"
                          >
                            Buka Kasus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          {/* Card Aksi Cepat */}
          <div className="bg-white rounded-[2rem] border border-gray-100 p-6 shadow-sm space-y-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi Cepat</h4>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/junior-high/behavior/mtss/cases/new')}
                className="w-full text-left px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-all active:scale-[0.98]"
              >
                <span>+ Lapor Kasus Baru</span>
                <ArrowRight size={14} />
              </button>
              
              <button
                onClick={() => navigate('/junior-high/behavior/mtss/cases')}
                className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-all"
              >
                <span>Buka Semua Kasus</span>
                <ArrowRight size={14} />
              </button>
              
              <button
                onClick={() => navigate('/junior-high/behavior/mtss/spreadsheet')}
                className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-all"
              >
                <span>Buka Spreadsheet</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Card Aktivitas Terbaru */}
          <div className="bg-white rounded-[2rem] border border-gray-100 p-6 shadow-sm space-y-4">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aktivitas Terbaru</h4>
            
            {recentActivities.length === 0 ? (
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center py-4">
                Belum ada aktivitas pada periode ini.
              </p>
            ) : (
              <div className="space-y-4 divide-y divide-gray-50">
                {recentActivities.map((act, idx) => (
                  <div key={idx} className={cn("pt-3 space-y-1 text-xs", idx === 0 && "pt-0")}>
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-gray-900">{act.studentName}</span>
                      <span className="text-[9px] text-gray-400 font-mono">{act.time}</span>
                    </div>
                    <p className="text-gray-500 font-medium line-clamp-2 leading-relaxed">{act.action}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
