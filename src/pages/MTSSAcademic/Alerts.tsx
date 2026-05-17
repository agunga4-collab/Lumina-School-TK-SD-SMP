import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  Bell, 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  Search, 
  Filter, 
  ChevronRight,
  CheckCircle2,
  Clock,
  ArrowRight,
  User,
  Calendar,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getMTSSAcademicAlerts, resolveMTSSAcademicAlert } from '../../lib/firebase';
import { MTSSAcademicAlert, MTSSAcademicAlertSeverity } from '../../types';
import { format } from 'date-fns';
import { useNavigate, useOutletContext } from 'react-router-dom';

export default function AlertsCenter() {
  const { filters } = useOutletContext<{ filters: any }>();
  const [alerts, setAlerts] = useState<MTSSAcademicAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchAlerts();
  }, [filterSeverity]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const data = await getMTSSAcademicAlerts({
        status: 'OPEN',
        severity: filterSeverity === 'ALL' ? undefined : filterSeverity
      });
      setAlerts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveMTSSAcademicAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredAlerts = alerts.filter(a => 
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.className?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header Context removed as it's in layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-2">
           <span className="text-xs font-bold text-slate-400 mt-0.5 font-mono uppercase tracking-widest">Monitoring SOP compliance and intervention progress</span>
        </div>

        <div className="flex items-center gap-3">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none w-64"
              />
           </div>
           <select 
             value={filterSeverity}
             onChange={(e) => setFilterSeverity(e.target.value)}
             className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
           >
              <option value="ALL">All Severity</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
           </select>
        </div>
      </div>

      {/* Sub Header Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2 border-b border-slate-100">
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/overview')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Overview
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/cases')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Cases
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/screening')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Screening
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/alerts')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white shadow-lg shadow-slate-200"
        >
          Alerts
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/timeline')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Timeline
        </button>
      </div>

      {loading ? (
        <div className="p-20 text-center">
            <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">Scanning for SOP violations...</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-white p-20 rounded-[40px] border-2 border-dashed border-slate-200 text-center flex flex-col items-center">
           <div className="p-6 bg-emerald-50 text-emerald-600 rounded-[32px] mb-6">
              <CheckCircle2 size={64} />
           </div>
           <h3 className="text-2xl font-black text-slate-900 mb-2">No active alerts</h3>
           <p className="text-slate-500 max-w-sm mb-8 font-medium italic">
             "Standard Operating Procedures are currently being followed. No critical deviations detected."
           </p>
           <button 
             onClick={() => navigate('/junior-high/academic/mtss/cases')}
             className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-3"
           >
              View Active Cases <ChevronRight size={18} />
           </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
           {filteredAlerts.map((alert) => (
             <AlertCard key={alert.id} alert={alert} onResolve={handleResolve} onAction={() => alert.caseId && navigate(`/junior-high/academic/mtss/cases/${alert.caseId}`)} />
           ))}
        </div>
      )}

      {/* Advisory Info */}
      <div className="bg-slate-900 p-8 rounded-[40px] text-white overflow-hidden relative group">
         <div className="absolute top-0 right-0 p-12 text-white opacity-5">
            <AlertCircle size={160} />
         </div>
         <div className="relative z-10">
            <h3 className="text-xl font-black mb-4 flex items-center gap-3 text-rose-400">
               Automated Monitoring System
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed max-w-2xl font-medium">
               This dashboard aggregates alerts based on the Junior High MTSS Academic SOP. 
               Alerts are triggered for missed sessions, incomplete documentation, and student performance flags like excessive absences or lateness during intervention.
            </p>
         </div>
      </div>
    </div>
  );
}

interface AlertCardProps {
  alert: MTSSAcademicAlert;
  onResolve: (id: string) => void | Promise<void>;
  onAction: () => void | Promise<void>;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, onResolve, onAction }) => {
  const severityColors = {
    CRITICAL: 'border-rose-200 bg-rose-50/30 text-rose-600',
    WARNING: 'border-amber-200 bg-amber-50/30 text-amber-600',
    INFO: 'border-blue-200 bg-blue-50/30 text-blue-600'
  };

  const severityIcons = {
    CRITICAL: <AlertCircle size={24} />,
    WARNING: <AlertTriangle size={24} />,
    INFO: <Info size={24} />
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`bg-white p-6 rounded-[32px] border ${severityColors[alert.severity]} shadow-sm flex flex-col md:flex-row items-center gap-6 group hover:shadow-md transition-all`}
    >
       <div className={`p-4 rounded-2xl ${severityColors[alert.severity]} bg-white shadow-sm shrink-0`}>
          {severityIcons[alert.severity]}
       </div>

       <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3">
             <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${severityColors[alert.severity]}`}>
                {alert.severity}
             </span>
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <Clock size={12} /> {format(alert.createdAt, 'dd MMM p')}
             </span>
          </div>
          <h4 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{alert.title}</h4>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
             {alert.studentName ? <strong>{alert.studentName} ({alert.className}): </strong> : ''}
             {alert.description}
          </p>
          <div className="flex items-center gap-2 pt-2">
             <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Action: {alert.recommendedAction}
             </div>
          </div>
       </div>

       <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={onAction}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 shadow-lg shadow-slate-200 transition-all flex items-center gap-2"
          >
             Take Action <ArrowRight size={16} />
          </button>
          <button 
            onClick={() => onResolve(alert.id)}
            className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
            title="Mark as Resolved"
          >
             <CheckCircle2 size={24} />
          </button>
       </div>
    </motion.div>
  );
}
