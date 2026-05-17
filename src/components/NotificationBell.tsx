import React from 'react';
import { 
  Bell, X, CheckSquare, ExternalLink, Activity, AlertTriangle, 
  ShieldCheck, Info, BookOpen, CheckCircle, AlertCircle, FileText,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { 
  getBehaviorNotifications, 
  markBehaviorNotificationAsRead, 
  dismissBehaviorNotification, 
  markAllBehaviorNotificationsRead,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../lib/firebase';
import { BehaviorNotification, AppNotification } from '../types';
import { cn, formatDate } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export const NotificationBell = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);
  const [behaviorNotifs, setBehaviorNotifs] = React.useState<BehaviorNotification[]>([]);
  const [appNotifs, setAppNotifs] = React.useState<AppNotification[]>([]);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!profile) return;
    
    const loadNotifs = async () => {
      // Behavior notifications use UID
      const bData = await getBehaviorNotifications(profile.uid);
      setBehaviorNotifs(bData || []);

      // General app notifications use Email
      const aData = await getNotifications(profile.email);
      setAppNotifs(aData || []);
    };

    loadNotifs();
    const interval = setInterval(loadNotifs, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [profile]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadBehaviorCount = behaviorNotifs.filter(n => !n.isRead?.[profile?.uid || '']).length;
  const unreadAppCount = appNotifs.filter(n => !n.isRead).length;
  const unreadCount = unreadBehaviorCount + unreadAppCount;

  // Combine and sort notifications
  const allNotifications = [
    ...behaviorNotifs.map(n => ({ ...n, _source: 'behavior' as const })),
    ...appNotifs.map(n => ({ ...n, _source: 'app' as const }))
  ].sort((a, b) => b.createdAt - a.createdAt);

  const handleMarkAsRead = async (notif: any) => {
    if (!profile) return;
    if (notif._source === 'behavior') {
      await markBehaviorNotificationAsRead(notif.id, profile.uid);
      setBehaviorNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: { ...n.isRead, [profile.uid]: true } } : n));
    } else {
      await markNotificationAsRead(notif.id);
      setAppNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
  };

  const handleDismiss = async (e: React.MouseEvent, notif: any) => {
    e.stopPropagation();
    if (!profile) return;
    if (notif._source === 'behavior') {
      await dismissBehaviorNotification(notif.id, profile.uid);
      setBehaviorNotifs(prev => prev.filter(n => n.id !== notif.id));
    }
    // App notifications might not have dismiss yet, or use markAsRead as dismiss
  };

  const handleMarkAllRead = async () => {
    if (!profile) return;
    
    // Mark behavior alerts read
    const unreadBehaviorIds = behaviorNotifs.filter(n => !n.isRead?.[profile.uid]).map(n => n.id);
    if (unreadBehaviorIds.length > 0) {
      await markAllBehaviorNotificationsRead(profile.uid, unreadBehaviorIds);
      setBehaviorNotifs(prev => prev.map(n => ({ ...n, isRead: { ...n.isRead, [profile.uid]: true } })));
    }

    // Mark app notifications read
    if (appNotifs.some(n => !n.isRead)) {
      await markAllNotificationsAsRead(profile.email);
      setAppNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    }
  };

  const getNotifIcon = (notif: any) => {
    if (notif._source === 'behavior') {
      switch (notif.severity) {
        case 'HIGH': return <AlertTriangle size={18} className="text-rose-500" />;
        case 'WARNING': return <Info size={18} className="text-amber-500" />;
        default: return <Activity size={18} className="text-blue-500" />;
      }
    } else {
      switch (notif.type) {
        case 'LXD_SUBMITTED_FOR_APPROVAL': return <Clock size={18} className="text-amber-500" />;
        case 'LXD_APPROVED': return <CheckCircle size={18} className="text-emerald-500" />;
        case 'LXD_REJECTED': return <AlertCircle size={18} className="text-rose-500" />;
        case 'REPORT_PUBLISHED': return <FileText size={18} className="text-blue-500" />;
        default: return <Bell size={18} className="text-gray-400" />;
      }
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-3 rounded-2xl transition-all",
          isOpen ? "bg-gray-900 text-white shadow-xl" : "bg-white text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent shadow-sm"
        )}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full border-2 border-white flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-4 w-96 bg-white rounded-[2.5rem] shadow-4xl border border-gray-100 z-[100] overflow-hidden"
          >
            {/* Header */}
            <div className="p-8 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button 
                  onClick={handleMarkAllRead}
                  className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[32rem] overflow-y-auto p-4 space-y-2">
              {allNotifications.length === 0 ? (
                <div className="py-12 text-center text-gray-300">
                  <Bell className="mx-auto mb-4 opacity-20" size={40} />
                  <p className="text-xs font-black uppercase tracking-widest">No notifications yet</p>
                </div>
              ) : (
                allNotifications.slice(0, 15).map((n) => (
                  <div 
                    key={n.id}
                    onClick={() => {
                      handleMarkAsRead(n);
                      navigate(n._source === 'behavior' ? n.actionUrl : n.link);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "p-5 rounded-[1.5rem] transition-all cursor-pointer group relative flex gap-4 border",
                      ((n._source === 'behavior' && !n.isRead?.[profile?.uid || '']) || (n._source === 'app' && !n.isRead)) 
                        ? "bg-blue-50/30 border-blue-100/50" 
                        : "bg-white border-transparent hover:bg-gray-50"
                    )}
                  >
                    <div className="shrink-0 pt-1">
                      {getNotifIcon(n)}
                    </div>
                    <div className="space-y-1 pr-6 flex-1 min-w-0">
                      <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-tight leading-tight">
                        {n._source === 'behavior' ? n.title : n.type.replace(/_/g, ' ')}
                      </h4>
                      <p className="text-xs font-medium text-gray-500 leading-relaxed line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                         <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{formatDate(n.createdAt.toString())}</span>
                         {n._source === 'behavior' && (
                           <>
                             <span className="w-1 h-1 rounded-full bg-gray-200" />
                             <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">{n.studentName}</span>
                           </>
                         )}
                      </div>
                    </div>
                    {n._source === 'behavior' && (
                      <button 
                        onClick={(e) => handleDismiss(e, n)}
                        className="absolute top-4 right-4 p-1 rounded-lg text-gray-300 hover:text-gray-900 hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                    )}
                    {((n._source === 'behavior' && !n.isRead?.[profile?.uid || '']) || (n._source === 'app' && !n.isRead)) && (
                      <div className="absolute top-1/2 -translate-y-1/2 right-2 w-2 h-2 rounded-full bg-blue-500 shadow-lg shadow-blue-200" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <button 
              onClick={() => {
                navigate('/notifications');
                setIsOpen(false);
              }}
              className="w-full py-6 border-t border-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-blue-600 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-2"
            >
              View all notifications <ChevronRight size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Clock = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
