import * as React from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { LXD, LXDStatus } from '../../types';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ChevronRight, 
  Search, 
  Filter,
  Calendar,
  User,
  BookOpen,
  Clock,
  ArrowRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export default function LXDApprovalQueue() {
  const { currentUser } = useOutletContext<{ currentUser: any }>();
  const navigate = useNavigate();
  const [lxds, setLxds] = React.useState<LXD[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterType, setFilterType] = React.useState<string>('ALL');

  React.useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'HEAD_UNIT') {
      navigate('/academic/lxd');
      return;
    }

    if (currentUser.role) {
      fetchPendingLXDs();
    }
  }, [currentUser]);

  const fetchPendingLXDs = async () => {
    setLoading(true);
    try {
      // Simplified query to avoid index issues with orderBy on potentially missing fields
      const q = query(
        collection(db, 'lxd'),
        where('status', '==', 'PENDING_APPROVAL')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LXD));
      
      // Sort in memory to ensure robustness
      const sortedData = [...data].sort((a, b) => {
        const timeA = a.approval?.submittedAt || 0;
        const timeB = b.approval?.submittedAt || 0;
        return timeB - timeA;
      });

      console.log('LXD pending count:', data.length);
      console.log('LXD pending data:', data);
      
      setLxds(sortedData);
    } catch (error) {
      console.error("Error fetching approval queue:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLxds = filterType === 'ALL' 
    ? lxds 
    : lxds.filter(l => l.type === filterType);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-bold animate-pulse uppercase tracking-widest text-xs">Memuat Antrean Approval...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-blue-50 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500" />
        <div className="relative">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Antrean Approval LXD</h1>
          <p className="text-gray-500 font-medium mt-1">Review dan kelola LXD yang menunggu persetujuan.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-5 py-3 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span className="text-sm font-black text-blue-700 tracking-tight">{lxds.length} LXD Tertunda</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {(['ALL', 'WEEKLY_LESSONS', 'UNIT_AKTIVITAS', 'LEARNING_JOURNEY'] as const).map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              filterType === type
                ? "bg-gray-900 text-white shadow-lg"
                : "bg-white text-gray-400 hover:text-gray-900 hover:bg-gray-50 border border-transparent"
            )}
          >
            {type.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table/List Section */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        {filteredLxds.length === 0 ? (
          <div className="p-20 text-center space-y-6">
            <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto text-gray-200">
              <FileText size={48} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Tidak Ada Antrean</h3>
              <p className="text-gray-500 font-medium max-w-sm mx-auto mt-2">
                Selamat! Semua LXD telah ditinjau. Tidak ada dokumen yang menunggu approval saat ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredLxds.map((lxd) => (
              <div 
                key={lxd.id}
                className="group p-6 hover:bg-gray-50/80 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-5 flex-1 min-w-0">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm shrink-0 border-2 border-white ring-1 ring-gray-100",
                    lxd.type === 'WEEKLY_LESSONS' ? "bg-indigo-50 text-indigo-600" :
                    lxd.type === 'UNIT_AKTIVITAS' ? "bg-blue-50 text-blue-600" :
                    "bg-amber-50 text-amber-600"
                  )}>
                    <BookOpen size={24} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-lg border",
                        lxd.type === 'WEEKLY_LESSONS' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                        lxd.type === 'UNIT_AKTIVITAS' ? "bg-blue-50 text-blue-700 border-blue-100" :
                        "bg-amber-50 text-amber-700 border-amber-100"
                      )}>
                        {lxd.type.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-gray-900 tracking-tight truncate group-hover:text-blue-600 transition-colors">
                      {lxd.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <User size={14} className="text-gray-300" />
                        <span>{lxd.subject}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ChevronRight size={14} className="text-gray-200" />
                        <span>Kelas {lxd.grade}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-gray-300" />
                        <span>Disubmit: {lxd.approval?.submittedAt ? format(lxd.approval.submittedAt, 'dd MMM yyyy, HH:mm', { locale: id }) : '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:text-right space-y-3 w-full md:w-auto">
                  <div className="flex items-center gap-2 md:justify-end">
                    <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-black ring-2 ring-white shadow-sm overflow-hidden border border-blue-200">
                      {lxd.approval?.submittedByName?.[0] || '?'}
                    </span>
                    <span className="text-xs font-bold text-gray-600">Disubmit oleh {lxd.approval?.submittedByName}</span>
                  </div>
                  <button 
                    onClick={() => navigate(`/academic/lxd/${lxd.id}`)}
                    className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
                  >
                    Review Document
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
