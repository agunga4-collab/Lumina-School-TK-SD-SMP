import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Plus, Search, Filter, Trash2, Edit2, BookOpen, 
  ChevronRight, AlertCircle, Loader2, Calendar, User, 
  Tag, Clock, CheckCircle2, LayoutGrid, List, MoreVertical,
  Eye, BarChart3
} from 'lucide-react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { getAssessments, deleteAssessment } from '../../lib/firebase';
import { Assessment, User as AppUser } from '../../types';
import { cn } from '../../lib/utils';

import StudentSearch from '../../components/StudentSearch';

export default function AssessmentList() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const navigate = useNavigate();
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterClass, setFilterClass] = React.useState('');

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      const data = await getAssessments({
        userEmail: currentUser.email,
        userRole: currentUser.role
      });
      setAssessments(data);
    } catch (error) {
      console.error("Error fetching assessments:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchAssessments();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus sesi penilaian ini secara permanen?")) return;
    try {
      await deleteAssessment(id);
      fetchAssessments();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const filteredAssessments = assessments.filter(a => 
    (a.lxdTitle.toLowerCase().includes(searchTerm.toLowerCase()) || 
     a.assessmentLabel.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (filterClass ? a.classId === filterClass : true)
  );

  const classes = Array.from(new Set(assessments.map(a => a.classId))).sort();

  if (loading) return (
     <div className="py-40 text-center">
        <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Memuat Buku Nilai...</p>
     </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-blue-600 mb-2">
             <div className="p-2 bg-blue-50 rounded-xl">
                <BookOpen size={20} />
             </div>
             <span className="text-xs font-black uppercase tracking-[0.2em]">Academic System</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Buku <span className="text-blue-600">Nilai</span>
          </h1>
          <p className="text-gray-400 font-bold text-sm uppercase tracking-wider">
            Sistem Penilaian Berbasis Learning Goals (A/D/B)
          </p>
        </div>

        <div className="flex gap-4">
           <Link
             to="/academic/buku-nilai/rekap"
             className="flex items-center gap-3 bg-white border-2 border-gray-900 text-gray-900 px-8 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-gray-50 transition-all shadow-xl shadow-gray-100"
           >
             <BarChart3 size={18} />
             Rekap Kelas
           </Link>
           <Link
             to="/academic/lxd/assess/new"
             className="group flex items-center gap-3 bg-gray-900 text-white px-8 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-100"
           >
             <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
             Buat Sesi Penilaian
           </Link>
        </div>
      </div>

      {/* Stats Quick View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <StatCard label="Total Sesi" value={assessments.length.toString()} icon={<List size={20} />} />
         <StatCard label="Siswa Dinilai" value="-" icon={<User size={20} />} />
         <StatCard label="Semester Aktif" value="1" icon={<Tag size={20} />} />
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-blue-500 transition-colors" size={20} />
          <input 
            type="text"
            placeholder="Cari Judul LXD atau Label Sesi..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-100 pl-16 pr-8 py-5 rounded-[2rem] text-sm font-bold shadow-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all"
          />
        </div>
        <div className="relative flex-1 group">
          <StudentSearch 
            placeholder="Cari profil siswa (nama/panggilan)..."
            onSelect={(student) => navigate(`/academic/buku-nilai/siswa/${student.id}`)}
          />
        </div>
        <div className="flex gap-2">
           <select 
             value={filterClass}
             onChange={(e) => setFilterClass(e.target.value)}
             className="bg-white border border-gray-100 px-8 py-5 rounded-[2rem] text-xs font-black uppercase tracking-widest shadow-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all"
           >
             <option value="">Semua Kelas</option>
             {classes.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
        </div>
      </div>

      {/* Assessment Table */}
      <div className="bg-white rounded-[3rem] border border-gray-100 shadow-xl shadow-gray-100/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">LXD & Sesi</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Kelas & Mapel</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Status</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Dinilai Oleh</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredAssessments.length > 0 ? (
                filteredAssessments.map((a) => (
                  <tr key={a.id} className="group hover:bg-blue-50/30 transition-all duration-300">
                    <td className="px-8 py-6">
                       <div className="space-y-1">
                          <p className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase italic">{a.lxdTitle}</p>
                          <div className="flex items-center gap-2">
                             <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[9px] font-black uppercase tracking-wider">{a.assessmentLabel}</span>
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sem {a.semester} • {a.academicYear}</span>
                          </div>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className="space-y-1">
                          <p className="text-xs font-black text-gray-700 uppercase tracking-widest">{a.classId}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">{a.subject === "Learning Journey" ? "LJ Interdisciplinary" : a.subject}</p>
                       </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                       <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg">
                          <CheckCircle2 size={12} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Recorded</span>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400 uppercase">
                             {a.assessedBy.substring(0, 2)}
                          </div>
                          <div className="space-y-0.5">
                             <p className="text-[10px] font-bold text-gray-700">{a.assessedBy}</p>
                             <p className="text-[9px] font-medium text-gray-400">{new Date(a.assessedAt).toLocaleDateString('id-ID')}</p>
                          </div>
                       </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => navigate(`/academic/buku-nilai/${a.id}`)}
                            className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"
                          >
                             <Eye size={16} />
                          </button>
                          {(currentUser.role === 'SUPER_ADMIN' || a.assessedBy === currentUser.email) && (
                             <>
                               <button 
                                 onClick={() => navigate(`/academic/lxd/assess/edit/${a.id}`)}
                                 className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-amber-600 hover:border-amber-100 transition-all shadow-sm"
                               >
                                  <Edit2 size={16} />
                               </button>
                               <button 
                                 onClick={() => handleDelete(a.id)}
                                 className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-red-600 hover:border-red-100 transition-all shadow-sm"
                               >
                                  <Trash2 size={16} />
                               </button>
                             </>
                          )}
                       </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                   <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="max-w-xs mx-auto space-y-4">
                         <AlertCircle size={48} className="text-gray-100 mx-auto" />
                         <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Tidak ada data sesi penilaian yang ditemukan</p>
                      </div>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
   return (
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between group hover:border-blue-100 transition-all">
         <div className="space-y-1">
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{label}</p>
            <p className="text-3xl font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase">{value}</p>
         </div>
         <div className="p-4 bg-gray-50 text-gray-300 rounded-[1.5rem] group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
            {icon}
         </div>
      </div>
   );
}
