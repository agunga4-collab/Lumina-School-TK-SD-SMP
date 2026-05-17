import * as React from 'react';
import { 
  Plus, Calendar, Trash2, CheckCircle2, XCircle, 
  ChevronRight, AlertCircle, Clock, Info 
} from 'lucide-react';
import { 
  getSEPeriods, saveSEPeriod, toggleSEPeriodActive, deleteSEPeriod, 
  sendNotification, db 
} from '../../lib/firebase';
import { SEPeriod } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function SEPeriods() {
  const { profile } = useAuth();
  const [periods, setPeriods] = React.useState<SEPeriod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [formData, setFormData] = React.useState({
    academicYear: '2025/2026',
    semester: '1' as '1' | '2',
    periodNumber: 1 as 1 | 2,
    label: '',
    startDate: '',
    endDate: '',
    totalSessions: 9,
    planningDeadline: '',
    exhibitionDate: ''
  });

  const fetchPeriods = React.useCallback(async () => {
    const data = await getSEPeriods('JUNIOR_HIGH');
    setPeriods(data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await saveSEPeriod({
        unitId: 'JUNIOR_HIGH',
        academicYear: formData.academicYear,
        semester: formData.semester,
        periodNumber: formData.periodNumber,
        label: formData.label,
        startDate: new Date(formData.startDate).getTime(),
        endDate: new Date(formData.endDate).getTime(),
        totalSessions: formData.totalSessions,
        planningDeadline: new Date(formData.planningDeadline).getTime(),
        exhibitionDate: new Date(formData.exhibitionDate).getTime(),
        isActive: false,
        createdBy: profile?.email || ''
      });
      setShowModal(false);
      fetchPeriods();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    if (!current) {
      if (!confirm("Aktifkan periode ini? Periode lain akan otomatis dinonaktifkan.")) return;
    }
    await toggleSEPeriodActive(id, !current, 'JUNIOR_HIGH');
    
    if (!current) {
      // Send notifications to all students
      const studentsSnap = await getDocs(query(collection(db, 'users'), where('unitId', '==', 'JUNIOR_HIGH'), where('role', '==', 'STUDENT')));
      studentsSnap.docs.forEach(d => {
        const userData = d.data();
        if (userData.email) {
          sendNotification({
            userId: userData.email,
            type: 'SE_PERIOD_OPEN',
            message: `Periode SE baru telah dibuka! Segera pilih kegiatanmu.`,
            link: '/self-exploration/my'
          });
        }
      });
    }
    
    fetchPeriods();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus periode ini? Tindakan ini tidak dapat dibatalkan.")) return;
    await deleteSEPeriod(id);
    fetchPeriods();
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase">Kelola Periode SE</h1>
           <p className="text-sm text-gray-500 font-medium mt-1">Konfigurasi jadwal eksplorasi diri per semester.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
        >
          <Plus size={16} /> Buat Periode Baru
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="p-20 text-center">
            <Clock className="w-12 h-12 text-blue-200 animate-spin mx-auto mb-4" />
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat Periode...</p>
          </div>
        ) : periods.length === 0 ? (
          <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
             <Calendar className="w-16 h-16 text-gray-200 mx-auto mb-6" />
             <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada periode yang dibuat.</p>
          </div>
        ) : (
          periods.map(period => (
            <div 
              key={period.id}
              className={cn(
                "group relative bg-white p-8 rounded-[3rem] border-2 transition-all hover:shadow-2xl hover:shadow-gray-100",
                period.isActive ? "border-blue-600" : "border-gray-50"
              )}
            >
               {period.isActive && (
                 <div className="absolute -top-4 left-10 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                    Aktif Sekarang
                 </div>
               )}

               <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div className="space-y-4">
                     <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                           <Calendar size={24} />
                        </div>
                        <div>
                           <h3 className="text-lg font-black text-gray-900 italic uppercase leading-none">{period.label}</h3>
                           <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">
                              {period.academicYear} • Semester {period.semester}
                           </p>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <InfoItem icon={<Calendar size={12} />} label="Mulai" value={new Date(period.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
                        <InfoItem icon={<Calendar size={12} />} label="Selesai" value={new Date(period.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
                        <InfoItem icon={<Clock size={12} />} label="Sesi" value={`${period.totalSessions} Sesi`} />
                        <InfoItem icon={<AlertCircle size={12} />} label="Deadline Rencana" value={new Date(period.planningDeadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} />
                     </div>
                  </div>

                  <div className="flex items-center gap-3 lg:border-l lg:border-gray-100 lg:pl-8">
                     <button 
                        onClick={() => handleToggleActive(period.id, period.isActive)}
                        className={cn(
                          "flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all",
                          period.isActive 
                            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" 
                            : "bg-gray-100 text-gray-400 hover:bg-blue-600 hover:text-white"
                        )}
                     >
                        {period.isActive ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {period.isActive ? "Aktif" : "Aktifkan"}
                     </button>
                     <button 
                        onClick={() => handleDelete(period.id)}
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                     >
                        <Trash2 size={18} />
                     </button>
                  </div>
               </div>
            </div>
          ))
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
               className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
               <div className="p-10 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Buat Periode Baru</h2>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">Input parameter jadwal SE</p>
                  </div>
                  <button onClick={() => setShowModal(false)} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white transition-all text-gray-400">
                     <Plus size={24} className="rotate-45" />
                  </button>
               </div>

               <form onSubmit={handleSubmit} className="p-10 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Tahun Akademik">
                       <input 
                         type="text" 
                         value={formData.academicYear}
                         onChange={e => setFormData({...formData, academicYear: e.target.value})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                         required
                       />
                    </FormField>
                    <FormField label="Semester">
                       <select 
                         value={formData.semester}
                         onChange={e => setFormData({...formData, semester: e.target.value as '1' | '2'})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                       >
                         <option value="1">Semester 1</option>
                         <option value="2">Semester 2</option>
                       </select>
                    </FormField>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Nomor Periode (1 atau 2)">
                       <select 
                         value={formData.periodNumber}
                         onChange={e => setFormData({...formData, periodNumber: parseInt(e.target.value) as 1 | 2})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                       >
                         <option value={1}>Periode 1</option>
                         <option value={2}>Periode 2</option>
                       </select>
                    </FormField>
                    <FormField label="Total Sesi">
                       <input 
                         type="number" 
                         value={formData.totalSessions}
                         onChange={e => setFormData({...formData, totalSessions: parseInt(e.target.value)})}
                         className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                         min="1"
                       />
                    </FormField>
                  </div>

                  <FormField label="Nama Label Periode">
                     <input 
                       type="text" 
                       placeholder="Contoh: Periode 1 — Juli s.d. September 2025"
                       value={formData.label}
                       onChange={e => setFormData({...formData, label: e.target.value})}
                       className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 transition-all"
                       required
                     />
                  </FormField>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Tanggal Mulai">
                       <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                    <FormField label="Tanggal Selesai">
                       <input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <FormField label="Deadline Perencanaan">
                       <input type="date" value={formData.planningDeadline} onChange={e => setFormData({...formData, planningDeadline: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                    <FormField label="Tanggal Exhibition">
                       <input type="date" value={formData.exhibitionDate} onChange={e => setFormData({...formData, exhibitionDate: e.target.value})} className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600" required />
                    </FormField>
                  </div>

                  <button 
                    disabled={submitting}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest translate-y-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Periode Baru'}
                  </button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="space-y-1">
       <span className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">
          {icon} {label}
       </span>
       <p className="text-xs font-bold text-gray-700">{value}</p>
    </div>
  );
}
