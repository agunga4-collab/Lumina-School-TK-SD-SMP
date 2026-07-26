import * as React from 'react';
import { 
  Plus, Trash2, CheckCircle2, XCircle, 
  Search, Filter, Sparkles, Brain, Dumbbell 
} from 'lucide-react';
import { 
  getSEActivities, saveSEActivity, deleteSEActivity 
} from '../../lib/firebase';
import { SEActivity, SEStrand } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

const STRANDS: { id: SEStrand, label: string, color: string, icon: React.ReactNode }[] = [
  { id: 'Imaginal', label: 'Imaginal', color: 'bg-pink-100 text-pink-600', icon: <Sparkles size={16} /> },
  { id: 'Rational', label: 'Rational', color: 'bg-blue-100 text-blue-600', icon: <Brain size={16} /> },
  { id: 'Physical', label: 'Physical', color: 'bg-amber-100 text-amber-600', icon: <Dumbbell size={16} /> }
];

export default function SEActivities() {
  const [activities, setActivities] = React.useState<SEActivity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [editingActivity, setEditingActivity] = React.useState<SEActivity | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [filterStrand, setFilterStrand] = React.useState<SEStrand | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');

  const [formData, setFormData] = React.useState({
    strand: 'Imaginal' as SEStrand,
    name: '',
    requiresTemplate: false,
    isProhibited: false,
    isActive: true
  });

  const fetchActivities = React.useCallback(async () => {
    const data = await getSEActivities('JUNIOR_HIGH');
    setActivities(data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleOpenModal = (act?: SEActivity) => {
    if (act) {
      setEditingActivity(act);
      setFormData({
        strand: act.strand,
        name: act.name,
        requiresTemplate: act.requiresTemplate,
        isProhibited: act.isProhibited,
        isActive: act.isActive
      });
    } else {
      setEditingActivity(null);
      setFormData({
        strand: 'Imaginal',
        name: '',
        requiresTemplate: false,
        isProhibited: false,
        isActive: true
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await saveSEActivity({
        ...formData,
        id: editingActivity?.id,
        unitId: 'JUNIOR_HIGH'
      });
      setShowModal(false);
      fetchActivities();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus kegiatan ini?")) return;
    await deleteSEActivity(id);
    fetchActivities();
  };

  const filtered = activities
    .filter(a => filterStrand === 'ALL' ? true : a.strand === filterStrand)
    .filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase">Master Kegiatan SE</h1>
           <p className="text-sm text-gray-500 font-medium mt-1">Daftar preset kegiatan untuk dipilih siswa.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
        >
          <Plus size={16} /> Tambah Kegiatan
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-[2rem] shadow-sm">
         <div className="flex-1 relative font-bold">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
            <input 
              type="text" 
              placeholder="Cari kegiatan..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-6 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-600 transition-all"
            />
         </div>
         <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400 ml-2" />
            {(['ALL', ...STRANDS.map(s => s.id)]).map(s => (
              <button 
                key={s}
                onClick={() => setFilterStrand(s as any)}
                className={cn(
                  "px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all",
                  filterStrand === s ? "bg-blue-600 text-white shadow-lg" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                )}
              >
                {s}
              </button>
            ))}
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {loading ? (
            <div className="col-span-full py-20 text-center">
               <span className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
         ) : filtered.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200">
               <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Tidak ada kegiatan ditemukan.</p>
            </div>
         ) : (
           filtered.map(act => {
             const strandInfo = STRANDS.find(s => s.id === act.strand);
             return (
               <div key={act.id} className="group bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all relative overflow-hidden">
                  {act.isProhibited && (
                    <div className="absolute top-0 right-0 bg-red-100 text-red-600 px-4 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-xl">
                       Mohon
                    </div>
                  )}
                  
                  <div className="space-y-4">
                     <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", strandInfo?.color)}>
                        {strandInfo?.icon}
                     </div>
                     <div>
                        <h3 className="text-base font-black text-gray-900 uppercase italic leading-tight">{act.name}</h3>
                        <div className="flex items-center gap-4 mt-2">
                           <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                             {act.requiresTemplate ? 'Wajib Template' : 'Bebas Template'}
                           </span>
                           {!act.isActive && (
                             <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Nonaktif</span>
                           )}
                        </div>
                     </div>

                     <div className="flex items-center gap-2 pt-4 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenModal(act)}
                          className="flex-1 py-3 bg-blue-50 text-blue-600 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-blue-100"
                        >
                           Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(act.id)}
                          className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        >
                           <Trash2 size={16} />
                        </button>
                     </div>
                  </div>
               </div>
             );
           })
         )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setShowModal(false)}
               className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
               <div className="p-10 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">
                    {editingActivity ? 'Edit Kegiatan' : 'Tambah Kegiatan'}
                  </h2>
                  <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                     <Plus size={24} className="rotate-45" />
                  </button>
               </div>

               <form onSubmit={handleSubmit} className="p-10 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Strand</label>
                    <div className="grid grid-cols-3 gap-3">
                       {STRANDS.map(s => (
                         <button 
                           key={s.id}
                           type="button"
                           onClick={() => setFormData({...formData, strand: s.id})}
                           className={cn(
                             "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                             formData.strand === s.id ? "border-blue-600 bg-blue-50 text-blue-600" : "border-gray-100 text-gray-400 hover:border-gray-200"
                           )}
                         >
                            {s.icon}
                            <span className="text-[9px] font-black uppercase tracking-widest">{s.id}</span>
                         </button>
                       ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Kegiatan</label>
                     <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600"
                        required
                     />
                  </div>

                  <div className="space-y-4 pt-4">
                     <label className="flex items-center gap-3 cursor-pointer group">
                        <input 
                           type="checkbox" 
                           checked={formData.requiresTemplate}
                           onChange={e => setFormData({...formData, requiresTemplate: e.target.checked})}
                           className="w-6 h-6 rounded-lg text-blue-600 border-gray-200 focus:ring-blue-600"
                        />
                        <span className="text-xs font-bold text-gray-700 group-hover:text-blue-600 transition-colors">Wajib menggunakan template presentasi</span>
                     </label>
                     <label className="flex items-center gap-3 cursor-pointer group">
                        <input 
                           type="checkbox" 
                           checked={formData.isProhibited}
                           onChange={e => setFormData({...formData, isProhibited: e.target.checked})}
                           className="w-6 h-6 rounded-lg text-red-600 border-gray-200 focus:ring-red-600"
                        />
                        <span className="text-xs font-bold text-gray-700 group-hover:text-red-600 transition-colors">Mohon Pilih Kegiatan Lain (Blokir pilihan siswa)</span>
                     </label>
                     <label className="flex items-center gap-3 cursor-pointer group">
                        <input 
                           type="checkbox" 
                           checked={formData.isActive}
                           onChange={e => setFormData({...formData, isActive: e.target.checked})}
                           className="w-6 h-6 rounded-lg text-emerald-600 border-gray-200 focus:ring-emerald-600"
                        />
                        <span className="text-xs font-bold text-gray-700 group-hover:text-emerald-600 transition-colors">Kegiatan Aktif</span>
                     </label>
                  </div>

                  <button 
                    disabled={submitting}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest translate-y-4 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Kegiatan'}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
