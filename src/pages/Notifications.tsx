import React from 'react';
import { 
  Bell, Filter, Search, ChevronRight, Activity, 
  AlertTriangle, Info, Clock, CheckCircle2, X, Plus 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { getBehaviorNotifications, markBehaviorNotificationAsRead, dismissBehaviorNotification, markAllBehaviorNotificationsRead } from '../lib/firebase';
import { BehaviorNotification } from '../types';
import { cn, formatDate } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

const NotificationsPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = React.useState<BehaviorNotification[]>([]);
  const [filter, setFilter] = React.useState<'all' | 'unread' | 'high' | 'warning' | 'info'>('all');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!profile) return;
    const load = async () => {
      setLoading(true);
      const data = await getBehaviorNotifications(profile.uid);
      setNotifications(data || []);
      setLoading(false);
    };
    load();
  }, [profile]);

  const filteredNotifs = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead?.[profile?.uid || ''];
    if (filter === 'high') return n.severity === 'HIGH';
    if (filter === 'warning') return n.severity === 'WARNING';
    if (filter === 'info') return n.severity === 'INFO';
    return true;
  });

  const handleAction = async (n: BehaviorNotification) => {
    if (!profile) return;
    await markBehaviorNotificationAsRead(n.id, profile.uid);
    navigate(n.actionUrl);
  };

  const handleDismiss = async (id: string) => {
    if (!profile) return;
    await dismissBehaviorNotification(id, profile.uid);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleMarkAllRead = async () => {
    if (!profile) return;
    const unreadIds = notifications.filter(n => !n.isRead?.[profile.uid]).map(n => n.id);
    if (unreadIds.length === 0) return;
    await markAllBehaviorNotificationsRead(profile.uid, unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: { ...n.isRead, [profile.uid]: true } })));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'HIGH': return 'text-rose-500 bg-rose-50 border-rose-100';
      case 'WARNING': return 'text-amber-500 bg-amber-50 border-amber-100';
      default: return 'text-blue-500 bg-blue-50 border-blue-100';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'HIGH': return <AlertTriangle size={20} />;
      case 'WARNING': return <Info size={20} />;
      default: return <Activity size={20} />;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gray-900 pt-32 pb-20 px-8 rounded-b-[4rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-20 opacity-10 rotate-12">
          <Bell size={240} className="text-white" />
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
             <div className="flex items-center gap-3 text-blue-400 font-black text-xs uppercase tracking-widest leading-none">
                <Bell size={14} />
                <span>Smart Notifications</span>
             </div>
             <h1 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter leading-none">ALERT center.</h1>
             <p className="text-xl text-white/50 font-bold max-w-xl">
               Sistem deteksi otomatis untuk kondisi kasus perilaku yang memerlukan perhatian guru dan konselor.
             </p>
          </div>
          <button 
            onClick={handleMarkAllRead}
            className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 backdrop-blur-md transition-all"
          >
            Mark all as read
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 -mt-12">
        <div className="bg-white rounded-[3rem] shadow-4xl border border-gray-100 min-h-[60vh] flex flex-col">
          {/* Toolbar */}
          <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-2xl">
              {(['all', 'unread', 'high', 'warning', 'info'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    filter === f ? "bg-gray-900 text-white shadow-xl" : "text-gray-400 hover:text-gray-900"
                  )}
                >
                  {f === 'all' ? 'Semua' : f === 'unread' ? 'Belum Diupdate' : f}
                </button>
              ))}
            </div>
            
            <div className="relative w-full md:w-80">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="Cari notifikasi..."
                className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-bold text-sm outline-none transition-all"
              />
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 p-8 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                 <div className="w-12 h-12 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin" />
                 <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Memuat notifikasi...</p>
              </div>
            ) : filteredNotifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
                 <div className="w-24 h-24 rounded-full bg-gray-50 flex items-center justify-center text-gray-200">
                    <CheckCircle2 size={48} />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Everything's good!</h3>
                    <p className="text-gray-400 font-bold mt-1 uppercase text-xs tracking-widest">Tidak ada notifikasi yang sesuai filter.</p>
                 </div>
              </div>
            ) : (
              <div className="space-y-4">
                 {filteredNotifs.map((n) => (
                   <div 
                    key={n.id}
                    className={cn(
                      "p-8 rounded-[2.5rem] border transition-all relative flex flex-col md:flex-row md:items-center gap-8 group",
                      !n.isRead?.[profile?.uid || ''] ? "bg-blue-50/50 border-blue-100" : "bg-white border-gray-100 hover:border-gray-300"
                    )}
                   >
                     <div className={cn(
                       "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border",
                       getSeverityColor(n.severity)
                     )}>
                        {getSeverityIcon(n.severity)}
                     </div>

                     <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                           <span className={cn(
                             "px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] border",
                             getSeverityColor(n.severity)
                           )}>{n.severity}</span>
                           <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-1">
                             <Clock size={12} />
                             {formatDate(n.createdAt.toString())}
                           </span>
                        </div>
                        <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter leading-tight">{n.title}</h3>
                        <p className="text-gray-500 font-medium leading-relaxed max-w-3xl">{n.message}</p>
                        
                        <div className="flex items-center gap-6 mt-4">
                           <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                 <Plus size={8} />
                              </div>
                              <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest">{n.studentName}</span>
                           </div>
                           {n.targetRoles && (
                             <div className="flex gap-1">
                                {n.targetRoles.map((r, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-[8px] font-black text-gray-400 uppercase">{r}</span>
                                ))}
                             </div>
                           )}
                        </div>
                     </div>

                     <div className="flex items-center gap-3 shrink-0">
                        <button 
                          onClick={() => handleAction(n)}
                          className="px-8 py-4 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-3 hover:scale-105 transition-all"
                        >
                          Buka Kasus <ChevronRight size={14} />
                        </button>
                        <button 
                          onClick={() => handleDismiss(n.id)}
                          className="p-4 rounded-2xl bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all"
                        >
                          <X size={20} />
                        </button>
                     </div>

                     {!n.isRead?.[profile?.uid || ''] && (
                       <div className="absolute top-8 right-8 w-3 h-3 rounded-full bg-blue-600 shadow-xl shadow-blue-200" />
                     )}
                   </div>
                 ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="py-20" />
    </div>
  );
};

export default NotificationsPage;
