import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Filter, Plus, ChevronRight, AlertCircle, 
  Clock, User, TrendingUp, AlertTriangle, ListFilter,
  CheckCircle2, Layers, MoreVertical, MessageSquare,
  Activity, Bell
} from 'lucide-react';
import { useNavigate, Link, useOutletContext } from 'react-router-dom';
import { cn, formatDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { db, handleFirestoreError, getBehaviorNotifications, markBehaviorNotificationAsRead } from '../../lib/firebase.ts';
import { NewCaseForm } from '../../components/MTSS/BehaviorForms';
import type { MTSSCase, MTSSStatus, MTSSTier, BehaviorNotification } from '../../types';

export default function CaseList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: any }>();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [tierFilter, setTierFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [classFilter, setClassFilter] = React.useState<string>('all');
  const [showOnlyActive, setShowOnlyActive] = React.useState(true);
  
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showNewCaseModal, setShowNewCaseModal] = React.useState(false);
  const [notifications, setNotifications] = React.useState<BehaviorNotification[]>([]);

  React.useEffect(() => {
    if (!profile) return;
    const loadNotifs = async () => {
      const data = await getBehaviorNotifications(profile.uid);
      setNotifications(data || []);
    };
    loadNotifs();
  }, [profile]);

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
      
      // Sort client-side
      const sortedCases = [...casesData].sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
      setCases(sortedCases);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', 'behaviorCases');
    });

    return () => unsubscribe();
  }, [filters.academicYear]);

  const totalActive = cases.filter(c => c.status !== 'CLOSED').length;
  const tier1Count = cases.filter(c => c.tier === 'Tier 1' && c.status !== 'CLOSED').length;
  const tier2Count = cases.filter(c => c.tier === 'Tier 2' && c.status !== 'CLOSED').length;
  const tier3Count = cases.filter(c => c.tier === 'Tier 3' && c.status !== 'CLOSED').length;
  const noUpdate7Days = cases.filter(c => c.status !== 'CLOSED' && (Date.now() - c.lastUpdatedAt) > (7 * 86400000)).length;

  const filteredCases = cases.filter(c => {
    const matchSearch = c.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || c.classId.includes(searchTerm);
    const matchTier = tierFilter === 'all' || c.tier === tierFilter;
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchClass = classFilter === 'all' || c.classId === classFilter;
    const matchActive = !showOnlyActive || c.status !== 'CLOSED';
    
    return matchSearch && matchTier && matchStatus && matchClass && matchActive;
  });

  if (loading) return (
    <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
      <Activity className="animate-pulse text-blue-600" size={48} />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Loading Case Records</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Modals */}
      <AnimatePresence>
        {showNewCaseModal && (
          <NewCaseForm 
            isOpen={showNewCaseModal} 
            onClose={() => setShowNewCaseModal(false)}
            onSuccess={(id) => navigate(`/junior-high/behavior/mtss/cases/${id}`)}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase italic">Monitoring <span className="text-blue-600">Behavior Cases</span></h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5 font-mono">Filter by academic context: {filters.academicYear} • Sem {filters.semester}</p>
        </div>
        <button
          onClick={() => setShowNewCaseModal(true)}
          className="flex items-center gap-3 bg-[#002366] hover:bg-blue-900 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-200 hover:-translate-y-0.5 active:translate-y-0 text-xs uppercase tracking-widest"
        >
          <Plus size={16} />
          Lapor Kasus Baru
        </button>
      </div>

      {/* Smart Summary: Perlu Perhatian Hari Ini */}
      {notifications.length > 0 && (
        <div className="space-y-4">
           <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                 <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">Perlu Perhatian Hari Ini</h3>
              </div>
              <Link to="/notifications" className="text-[10px] font-black uppercase text-blue-600 hover:underline tracking-widest">
                 Lihat Semua ({notifications.length})
              </Link>
           </div>
           
           <div className="flex gap-4 overflow-x-auto pb-4 px-2 no-scrollbar">
              {notifications.slice(0, 5).map((n) => (
                <div 
                  key={n.id}
                  onClick={() => {
                    markBehaviorNotificationAsRead(n.id, profile?.uid || '');
                    navigate(n.actionUrl);
                  }}
                  className={cn(
                    "min-w-[300px] md:min-w-[350px] p-6 rounded-[2rem] border transition-all cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 flex flex-col justify-between h-48",
                    n.severity === 'HIGH' ? "bg-rose-50 border-rose-100" :
                    n.severity === 'WARNING' ? "bg-amber-50 border-amber-100" :
                    "bg-blue-50 border-blue-100"
                  )}
                >
                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <span className={cn(
                           "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border",
                           n.severity === 'HIGH' ? "bg-rose-500 text-white border-rose-500" :
                           n.severity === 'WARNING' ? "bg-amber-500 text-white border-amber-500" :
                           "bg-blue-500 text-white border-blue-500"
                         )}>{n.severity}</span>
                         <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{formatDate(n.createdAt)}</span>
                      </div>
                      <h4 className="text-sm font-black text-gray-900 uppercase italic tracking-tighter leading-tight line-clamp-2">{n.title}</h4>
                      <p className="text-[10px] font-medium text-gray-500 leading-relaxed line-clamp-2 italic">{n.message}</p>
                   </div>

                   <div className="flex items-center justify-between border-t border-black/5 pt-4">
                      <div className="flex items-center gap-2">
                         <div className="w-6 h-6 rounded-lg bg-white/50 flex items-center justify-center">
                            <User size={12} className="text-gray-400" />
                         </div>
                         <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{n.studentName}</span>
                      </div>
                      <ChevronRight size={14} className="text-gray-300" />
                   </div>
                </div>
              ))}
              {notifications.length > 5 && (
                <Link 
                  to="/notifications"
                  className="min-w-[200px] flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-[2rem] text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-all group"
                >
                   <Bell size={24} className="mb-2 group-hover:animate-bounce" />
                   <span className="text-[10px] font-black uppercase tracking-widest">+{notifications.length - 5} Lainnya</span>
                </Link>
              )}
           </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-blue-200 transition-all">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">Active Cases</span>
          </div>
          <div>
            <h3 className="text-4xl font-black text-gray-900 italic tracking-tighter">{totalActive}</h3>
            <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Total kasus aktif bulan ini</p>
          </div>
        </div>

        <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm transition-all">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
              <Layers size={24} />
            </div>
            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest">Tier Breakdown</span>
          </div>
          <div className="flex items-end gap-3 h-10">
            <div className="flex flex-col items-center gap-1 group">
               <div className="w-6 bg-green-500 rounded-t-lg transition-all" style={{ height: `${(tier1Count/totalActive)*100}%` }} title="Tier 1" />
               <span className="text-[10px] font-black">{tier1Count}</span>
            </div>
            <div className="flex flex-col items-center gap-1 group">
               <div className="w-6 bg-amber-500 rounded-t-lg transition-all" style={{ height: `${(tier2Count/totalActive)*100}%` }} title="Tier 2" />
               <span className="text-[10px] font-black">{tier2Count}</span>
            </div>
            <div className="flex flex-col items-center gap-1 group">
               <div className="w-6 bg-red-500 rounded-t-lg transition-all" style={{ height: `${(tier3Count/totalActive)*100}%` }} title="Tier 3" />
               <span className="text-[10px] font-black">{tier3Count}</span>
            </div>
            <div className="ml-4 space-y-1">
              <p className="text-[10px] font-black flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> T1: {tier1Count}</p>
              <p className="text-[10px] font-black flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> T2: {tier2Count}</p>
              <p className="text-[10px] font-black flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> T3: {tier3Count}</p>
            </div>
          </div>
        </div>

        <div className="p-8 bg-rose-50 rounded-[2.5rem] border border-rose-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <span className="px-3 py-1 bg-white text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest">Attention Needed</span>
          </div>
          <div>
            <h3 className="text-4xl font-black text-rose-600 italic tracking-tighter">{noUpdate7Days}</h3>
            <p className="text-xs font-bold text-rose-400 mt-1 uppercase tracking-widest leading-relaxed">Kasus tanpa update &gt; 7 hari</p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
            <input
              type="text"
              placeholder="Cari nama siswa atau kelas..."
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-4 px-4 bg-gray-50 rounded-2xl border border-transparent">
             <ListFilter size={18} className="text-gray-400" />
             <select 
               className="bg-transparent py-4 outline-none text-sm font-bold text-gray-600 cursor-pointer"
               value={classFilter}
               onChange={(e) => setClassFilter(e.target.value)}
             >
               <option value="all">Semua Kelas</option>
               <option value="7-A">7-A</option>
               <option value="7-B">7-B</option>
               <option value="8-A">8-A</option>
               <option value="9-B">9-B</option>
             </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-6 pt-4 border-t border-gray-50">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Filter Tier:</span>
                <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
                   {['all', 'Tier 1', 'Tier 2', 'Tier 3'].map(t => (
                     <button
                       key={t}
                       onClick={() => setTierFilter(t)}
                       className={cn(
                         "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                         tierFilter === t ? "bg-white text-blue-600 shadow-sm scale-110" : "text-gray-400 hover:text-gray-600"
                       )}
                     >
                       {t === 'all' ? 'Semua' : t}
                     </button>
                   ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Filter Status:</span>
                <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
                   {['all', 'OPEN', 'IN_PROGRESS', 'ESCALATED', 'CLOSED'].map(s => (
                     <button
                       key={s}
                       onClick={() => setStatusFilter(s)}
                       className={cn(
                         "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                         statusFilter === s ? "bg-white text-blue-600 shadow-sm scale-110" : "text-gray-400 hover:text-gray-600"
                       )}
                     >
                       {s === 'all' ? 'Semua' : s.replace('_', ' ')}
                     </button>
                   ))}
                </div>
              </div>
           </div>

           <label className="flex items-center gap-3 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
                className="w-5 h-5 rounded-lg border-2 border-gray-200 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-gray-500 group-hover:text-gray-900 transition-colors uppercase tracking-widest">Hanya Kasus Aktif</span>
           </label>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Siswa & Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Concern Terakhir</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">PIC & Update</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">MTSS Progress</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCases.map((c, idx) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="hover:bg-blue-50/20 transition-all group"
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-600 font-black text-sm uppercase tracking-tighter shadow-inner">
                          {c.studentName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className={cn(
                          "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm",
                          c.status === 'OPEN' ? "bg-blue-500" :
                          c.status === 'IN_PROGRESS' ? "bg-yellow-500" :
                          c.status === 'ESCALATED' ? "bg-orange-500" :
                          c.status === 'UNDER_REVIEW' ? "bg-purple-500" :
                          "bg-gray-400"
                        )} />
                      </div>
                      <div>
                        <p className="font-black text-gray-900 tracking-tight leading-none mb-1">{c.studentName}</p>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{c.classId}</span>
                           <span className="text-gray-300">•</span>
                           <span className={cn(
                             "text-[9px] font-black uppercase tracking-widest",
                             c.status === 'OPEN' ? "text-blue-500" :
                             c.status === 'IN_PROGRESS' ? "text-yellow-600" :
                             c.status === 'ESCALATED' ? "text-orange-600" :
                             c.status === 'UNDER_REVIEW' ? "text-purple-600" :
                             "text-gray-400"
                           )}>
                             {c.status.replace('_', ' ')}
                           </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-6 max-w-xs">
                    <div className="flex items-start gap-2">
                      <MessageSquare size={14} className="text-gray-300 mt-1 shrink-0" />
                      <p className="text-[11px] font-medium text-gray-500 leading-relaxed italic line-clamp-2">
                        "{c.lastConcernSummary}"
                      </p>
                    </div>
                  </td>

                  <td className="px-6 py-6">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <User size={12} className="text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-600">{c.picName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-gray-300" />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          {formatDate(c.lastUpdatedAt.toString())}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                         <span className={cn(
                           "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                           c.tier === 'Tier 1' ? "bg-green-100 text-green-700" :
                           c.tier === 'Tier 2' ? "bg-amber-100 text-amber-700" :
                           "bg-red-100 text-red-700"
                         )}>
                           {c.tier}
                         </span>
                         <span className="text-[10px] font-black text-gray-400">Data {c.totalConcerns}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            c.tier === 'Tier 1' ? "bg-green-500" :
                            c.tier === 'Tier 2' ? "bg-amber-500" :
                            "bg-red-500"
                          )}
                          style={{ width: `${Math.min((c.totalConcerns / 10) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link 
                        to={`/mtss/concern/new/${c.id}`}
                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors group flex items-center gap-1.5" 
                        title="Tambah Data"
                      >
                         <Plus size={16} />
                         <span className="text-[10px] font-black uppercase tracking-widest hidden group-hover:block">Data</span>
                      </Link>
                      <Link
                        to={`/mtss/case/${c.id}`}
                        className="h-10 px-6 inline-flex items-center gap-2 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-sm hover:shadow-blue-100"
                      >
                        Detail
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCases.length === 0 && (
          <div className="py-32 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-200">
               <AlertCircle size={48} />
            </div>
            <div>
               <h3 className="text-xl font-black text-gray-900 italic tracking-tighter uppercase">Tidak Ada Kasus</h3>
               <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-2 px-12">
                 Tidak ditemukan data kasus perilaku yang sesuai dengan filter pencarian Anda.
               </p>
            </div>
            <button 
              onClick={() => {
                setSearchTerm('');
                setTierFilter('all');
                setStatusFilter('all');
                setClassFilter('all');
                setShowOnlyActive(false);
              }}
              className="text-xs font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              Bersihkan Semua Filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
