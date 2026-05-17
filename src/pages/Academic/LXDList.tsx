import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Filter, Trash2, Edit2, BookOpen, 
  ChevronRight, AlertCircle, Loader2, Calendar, User, 
  Tag, Clock, CheckCircle2, FileText, Layers, Map
} from 'lucide-react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { getLXDList, deleteLXD } from '../../lib/firebase';
import { LXD, User as AppUser, UnitType, LXDType } from '../../types';
import { cn } from '../../lib/utils';
import { ACADEMIC_SUBJECTS, ACADEMIC_YEARS } from '../../constants';

export default function LXDList() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: AppUser, activeUnit: UnitType }>();
  const navigate = useNavigate();
  const [lxlst, setLxLst] = React.useState<LXD[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<LXDType>("WEEKLY_LESSONS");
  
  // Filters
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterGrade, setFilterGrade] = React.useState('ALL');
  const [filterSubject, setFilterSubject] = React.useState('ALL');
  const [filterStatus, setFilterStatus] = React.useState('ALL');

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getLXDList({
        unitId: activeUnit,
        type: activeTab,
        userEmail: currentUser.email,
        userRole: currentUser.role
      });
      setLxLst(data || []);
    } catch (error) {
      console.error("Error fetching LXD:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [activeUnit, activeTab]);

  const filteredLxd = lxlst.filter(lx => {
    const matchesSearch = lx.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = filterGrade === 'ALL' || lx.grade === filterGrade || (lx.grades?.includes(filterGrade));
    const matchesSubject = filterSubject === 'ALL' || lx.subject === filterSubject || (lx.interdisciplinarySubjects?.includes(filterSubject));
    const matchesStatus = filterStatus === 'ALL' || lx.status === filterStatus;
    return matchesSearch && matchesGrade && matchesSubject && matchesStatus;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus LXD ini secara permanen?")) return;
    try {
      await deleteLXD(id);
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'PUBLISHED':
        return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[10px] font-black uppercase tracking-wider">Published</span>;
      case 'DRAFT':
        return <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-md text-[10px] font-black uppercase tracking-wider">Draft</span>;
      default:
        return null;
    }
  };

  const getTypeIcon = (type: LXDType) => {
    switch(type) {
      case 'WEEKLY_LESSONS': return <Calendar size={16} />;
      case 'UNIT_AKTIVITAS': return <Layers size={16} />;
      case 'LEARNING_JOURNEY': return <Map size={16} />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
           <div className="flex items-center gap-3 text-blue-600 mb-1">
              <BookOpen size={24} className="stroke-[2.5px]" />
              <h1 className="text-3xl font-black tracking-tight italic uppercase">Learning Experience Design (LXD)</h1>
           </div>
           <p className="text-gray-500 font-medium max-w-xl">
             Rencana pembelajaran terintegrasi untuk Lazuardi Elementary & Junior High.
           </p>
        </div>

        <Link 
          to="/academic/lxd/new"
          className="group flex items-center gap-3 px-8 py-4 bg-[#002366] text-white rounded-[1.5rem] font-bold shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest"
        >
          <Plus size={18} />
          Buat LXD Baru
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-gray-100/50 rounded-2xl w-fit">
        {(["WEEKLY_LESSONS", "UNIT_AKTIVITAS", "LEARNING_JOURNEY"] as LXDType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeTab === tab 
                ? "bg-white text-blue-600 shadow-sm" 
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            {getTypeIcon(tab)}
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
         <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input 
                 type="text" 
                 placeholder="Cari judul LXD..." 
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-100 transition-all font-medium"
               />
            </div>

            <select 
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">Semua Mapel</option>
              {ACADEMIC_SUBJECTS[activeUnit as 'ELEMENTARY' | 'JUNIOR_HIGH'].map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>

            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-6 py-3 bg-gray-50 border-none rounded-2xl text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">Semua Status</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
            </select>
         </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center space-y-4">
             <Loader2 size={40} className="text-gray-200 animate-spin mx-auto" />
             <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Memuat database LXD...</p>
          </div>
        ) : filteredLxd.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
             <FileText size={48} className="text-gray-200 mx-auto mb-4" />
             <h3 className="text-lg font-bold text-gray-400">Belum ada LXD ditemukan</h3>
             <p className="text-sm text-gray-400 mt-1">Gunakan filter atau buat LXD baru.</p>
          </div>
        ) : filteredLxd.map((lx) => (
          <motion.div
            key={lx.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all overflow-hidden flex flex-col"
          >
            <div className="p-8 flex-1 space-y-4">
               <div className="flex items-center justify-between">
                  {getStatusBadge(lx.status)}
                  <div className="flex items-center gap-1 text-gray-300">
                     <Clock size={12} />
                     <span className="text-[10px] font-bold uppercase tracking-wider">
                       {new Date(lx.updatedAt).toLocaleDateString('id-ID')}
                     </span>
                  </div>
               </div>

               <div>
                  <h3 className="text-lg font-black text-gray-900 line-clamp-2 leading-tight min-h-[3.5rem]">
                    {lx.title}
                  </h3>
               </div>

               <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                    {lx.subject || lx.interdisciplinarySubjects?.join(', ')}
                  </span>
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest">
                    Kelas {lx.grade || lx.grades?.join(', ')}
                  </span>
                  <span className="px-2 py-1 bg-gray-50 text-gray-400 rounded-lg text-[9px] font-black uppercase tracking-widest">
                    Sem {lx.semester}
                  </span>
               </div>
            </div>

            <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
               <div className="flex items-center gap-2 pl-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[10px] font-bold border border-white">
                     {lx.createdBy[0].toUpperCase()}
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 truncate max-w-[100px]">{lx.createdBy}</span>
               </div>
               
               <div className="flex items-center gap-1">
                  <Link 
                    to={`/academic/lxd/${lx.id}`}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                  >
                     <ChevronRight size={18} />
                  </Link>
                  {(currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT' || lx.createdBy === currentUser.email) && (
                    <>
                      <Link 
                        to={`/academic/lxd/edit/${lx.id}`}
                        className="p-2 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                      >
                         <Edit2 size={16} />
                      </Link>
                      <button 
                        onClick={() => handleDelete(lx.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                         <Trash2 size={16} />
                      </button>
                    </>
                  )}
               </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
