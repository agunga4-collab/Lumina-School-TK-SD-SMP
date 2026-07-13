import * as React from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, AlertTriangle, ListFilter,
  CheckCircle2, Layers, MessageSquare,
  Activity, Bell, User, Clock, ShieldAlert,
  ArrowRight, ChevronRight
} from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { db, handleFirestoreError, getBehaviorNotifications } from '../../lib/firebase.ts';
import { useAuth } from '../../context/AuthContext';
import type { MTSSCase, BehaviorNotification } from '../../types';
import { cn, formatDate } from '../../lib/utils';

export default function MTSSBehaviorOverview() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: any }>();
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [loading, setLoading] = React.useState(true);
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
      
      // Client-side sort to avoid requiring composite index
      const sortedCases = [...casesData].sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
      setCases(sortedCases);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', 'behaviorCases');
    });

    return () => unsubscribe();
  }, [filters.academicYear]);

  const totalActive = cases.filter(c => c.status !== 'CLOSED').length;
  const tier3Count = cases.filter(c => c.tier === 'Tier 3' && c.status !== 'CLOSED').length;
  const criticalUpdates = cases.filter(c => c.status !== 'CLOSED' && (Date.now() - c.lastUpdatedAt) > (7 * 86400000)).length;
  const attentionNeeded = tier3Count + criticalUpdates;

  if (loading) return (
    <div className="h-[40vh] flex flex-col items-center justify-center space-y-4">
      <Activity className="animate-pulse text-blue-600" size={48} />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Loading Behavior Overview</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPIBox 
          icon={<ShieldAlert size={20} />} 
          label="Active Cases" 
          value={totalActive} 
          color="blue"
          sub="Current support active"
        />
        <KPIBox 
          icon={<AlertTriangle size={20} />} 
          label="Tier 3 (High)" 
          value={tier3Count} 
          color="red"
          sub="Requires immediate attention"
        />
        <KPIBox 
          icon={<Clock size={20} />} 
          label="Dormant Cases" 
          value={criticalUpdates} 
          color="amber"
          sub="No update > 7 days"
        />
        <KPIBox 
          icon={<Activity size={20} />} 
          label="Engagement" 
          value={notifications.length} 
          color="emerald"
          sub="Total interaction alerts"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Feed Section */}
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Recent Activity</h3>
                <button 
                  onClick={() => navigate('/junior-high/behavior/mtss/cases')}
                  className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline flex items-center gap-1"
                >
                  View All Cases <ArrowRight size={14} />
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {cases.slice(0, 5).map(c => (
                  <button 
                    key={c.id}
                    onClick={() => navigate(`/junior-high/behavior/mtss/cases/${c.id}`)}
                    className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-4">
                       <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-lg",
                          c.tier === 'Tier 1' ? "bg-blue-500 shadow-blue-100" :
                          c.tier === 'Tier 2' ? "bg-amber-500 shadow-amber-100" : "bg-red-500 shadow-red-100"
                       )}>
                          {c.tier.split(' ')[1]}
                       </div>
                       <div>
                          <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{c.studentName}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 py-0.5 bg-gray-100 rounded-lg">{c.classId}</span>
                             <span className="text-[10px] font-bold text-gray-400">Update {formatDate(c.lastUpdatedAt)}</span>
                          </div>
                       </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <StatusBadge status={c.status} />
                       <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-600" />
                    </div>
                  </button>
                ))}
              </div>
           </div>
        </div>

        {/* Sidebar Insights */}
        <div className="space-y-6">
           <div className="bg-blue-900 rounded-[2rem] p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                 <TrendingUp size={120} />
              </div>
              <h3 className="text-xl font-black italic tracking-tighter mb-4">Quick Insight</h3>
              <p className="text-blue-100 text-xs font-bold leading-relaxed mb-6 uppercase tracking-widest">
                {attentionNeeded > 0 
                  ? `Ada ${attentionNeeded} kasus yang butuh perhatian segera minggu ini.`
                  : "Semua kasus berjalan sesuai rencana pemantauan."}
              </p>
              <button 
                onClick={() => navigate('/junior-high/behavior/mtss/cases')}
                className="w-full py-4 bg-white text-blue-900 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
              >
                Lapor Kasus Baru
              </button>
           </div>

           <div className="bg-white rounded-[2rem] border border-gray-100 p-6 space-y-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">At-a-glance Analytics</h4>
              <div className="space-y-4">
                 <StatRow label="Tier 1 Supporters" count={cases.filter(c => c.tier === 'Tier 1').length} total={cases.length} />
                 <StatRow label="Tier 2 Targeted" count={cases.filter(c => c.tier === 'Tier 2').length} total={cases.length} />
                 <StatRow label="Tier 3 Intensive" count={cases.filter(c => c.tier === 'Tier 3').length} total={cases.length} />
              </div>
              <div className="pt-4 mt-4 border-t border-gray-50">
                 <button 
                   onClick={() => navigate('/junior-high/behavior/mtss/analytics')}
                   className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                 >
                    Full Analytics Report
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function KPIBox({ icon, label, value, color, sub }: any) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100 shadow-blue-50",
    red: "bg-red-50 text-red-600 border-red-100 shadow-red-50",
    amber: "bg-amber-50 text-amber-600 border-amber-100 shadow-amber-50",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-50",
  };

  return (
    <div className={cn("p-6 rounded-[2rem] border shadow-sm transition-all hover:shadow-lg", (colors as any)[color])}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-white rounded-xl shadow-sm">{icon}</div>
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
      </div>
      <p className="text-4xl font-black tracking-tighter mb-1">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 leading-tight">{sub}</p>
    </div>
  );
}

function StatRow({ label, count, total }: any) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-900">{count}</span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className="h-full bg-blue-600"
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    'OPEN': 'bg-gray-100 text-gray-600',
    'IN_PROGRESS': 'bg-blue-100 text-blue-600',
    'ESCALATED': 'bg-red-100 text-red-600',
    'UNDER_REVIEW': 'bg-purple-100 text-purple-600',
    'CLOSED': 'bg-emerald-100 text-emerald-600',
  };
  return (
    <span className={cn(
      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
      (styles as any)[status] || 'bg-gray-100 text-gray-600'
    )}>
      {status.replace('_', ' ')}
    </span>
  );
}
