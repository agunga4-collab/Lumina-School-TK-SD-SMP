import * as React from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Calendar, GraduationCap, Heart, BookOpen, 
  Target, Award, ShieldAlert, ChevronRight, Map, 
  Star, MessageCircle, ArrowUpRight, Flame, Smile, LayoutDashboard,
  Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { UnitType, User as UserType } from '../../types';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function StudentPassport() {
  const [currentUser, setCurrentUser] = React.useState<UserType | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setCurrentUser({ uid: user.uid, ...snap.data() } as UserType);
        }
      } catch (err) {
        console.error('Error fetching user for passport:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 size={40} className="animate-spin text-blue-600" />
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Mempersiapkan Passport...</p>
      </div>
    );
  }

  const name = currentUser?.displayName || 'Siswa Lumina';
  const luminaId = currentUser?.luminaId || '-';
  const unit = currentUser?.unitId || '-';
  const isNew = !currentUser?.createdAt;

  const mockPassportData: any[] = [];

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5">
           <Map size={120} className="text-blue-500" />
        </div>
        <div className="flex gap-6 items-center relative z-10">
           <div className="w-24 h-24 rounded-3xl bg-blue-50 flex items-center justify-center text-blue-600 text-4xl font-black shadow-xl shadow-blue-50 border-4 border-white">
              {name[0]}
           </div>
           <div>
              <div className="flex items-center gap-2 mb-1">
                 <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest leading-none">Student Passport</span>
                 <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none italic">{name}</h1>
              </div>
              <p className="text-gray-500 font-bold mt-2 flex items-center gap-2">
                 <GraduationCap size={18} className="text-gray-300" />
                 ID: {luminaId} • Unit: {unit}
              </p>
           </div>
        </div>
        <div className="flex flex-col items-end gap-1 relative z-10">
           <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Status di Lumina</p>
           <p className="font-bold text-gray-900">{isNew ? 'Baru Bergabung' : 'Siswa Aktif'}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: General Insights */}
        <div className="space-y-6">
           <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-black text-xs uppercase tracking-widest text-gray-900 border-b border-gray-50 pb-4 flex items-center gap-2">
                 <Flame size={18} className="text-orange-500" />
                 Kekuatan Utama
              </h3>
              <div className="space-y-3 py-4 border border-dashed border-gray-100 rounded-2xl text-center opacity-50">
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Belum Ada Data</p>
              </div>
           </section>

           <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-black text-xs uppercase tracking-widest text-gray-900 border-b border-gray-50 pb-4 flex items-center gap-2">
                 <MessageCircle size={18} className="text-blue-500" />
                 Area Pendampingan
              </h3>
              <div className="py-4 border border-dashed border-gray-100 rounded-2xl text-center opacity-50">
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Belum Ada Data</p>
              </div>
           </section>

           <section className="bg-gradient-to-br from-gray-900 to-blue-900 rounded-[2rem] p-8 text-white shadow-xl">
              <h3 className="font-black text-[10px] uppercase tracking-widest text-blue-200 border-b border-white/10 pb-4">Catatan Transisi</h3>
              <p className="text-xs font-medium leading-relaxed mt-4 opacity-50 italic">
                Informasi perkembangan antar unit akan muncul di sini.
              </p>
           </section>
        </div>

        {/* Right: Journey Timeline */}
        <div className="lg:col-span-2 space-y-8">
           <div className="flex items-center gap-4 bg-gray-100/50 p-4 rounded-2xl border border-gray-100 w-fit">
              <LayoutDashboard size={20} className="text-blue-600" />
              <h2 className="font-black text-sm uppercase tracking-[0.2em] text-gray-900">Perjalanan Berkembang (Timeline)</h2>
           </div>

           {mockPassportData.length > 0 ? (
             mockPassportData.map((entry, idx) => (
               <motion.div 
                 key={entry.year}
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: idx * 0.1 }}
                 className="relative pl-8 border-l-2 border-gray-100 pb-12 last:pb-0"
               >
                  {/* Timeline Dot */}
                  <div className={cn(
                    "absolute left-[-11px] top-0 w-5 h-5 rounded-full border-4 border-white shadow-md ring-2",
                    entry.unit === 'KINDERGARTEN' ? "bg-pink-500 ring-pink-100" :
                    entry.unit === 'ELEMENTARY' ? "bg-emerald-500 ring-emerald-100" :
                    "bg-blue-600 ring-blue-100"
                  )} />

                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6 hover:shadow-xl hover:translate-x-1 transition-all duration-300">
                     <div className="flex justify-between items-start">
                        <div>
                           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{entry.year}</p>
                           <h4 className="text-xl font-bold text-gray-900 mt-1">{getUnitName(entry.unit)} - {entry.class}</h4>
                        </div>
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                          getUnitStyles(entry.unit)
                        )}>
                           Unit {entry.unit.replace('_', ' ')}
                        </div>
                     </div>

                     <p className="text-sm text-gray-600 leading-relaxed font-medium">
                        {entry.summary}
                     </p>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                        {entry.highlights.map((h, i) => (
                          <div key={i} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                             <div className="flex items-center gap-2 text-gray-400">
                                {h.icon}
                                <span className="text-[10px] font-black uppercase tracking-widest leading-none">{h.label}</span>
                             </div>
                             <p className="text-xs font-bold text-gray-800 leading-tight">{h.value}</p>
                          </div>
                        ))}
                     </div>

                     <div className="pt-6 border-t border-gray-50 flex justify-between items-center">
                        <span className="text-[10px] text-gray-400 font-bold italic">Lihat Detail Rapor untuk Tahun Ini</span>
                        <ChevronRight size={16} className="text-gray-300" />
                     </div>
                  </div>
               </motion.div>
             ))
           ) : (
             <div className="p-20 border-2 border-dashed border-gray-100 rounded-[3rem] text-center">
                <Map size={48} className="text-gray-200 mx-auto mb-4" />
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Belum Ada Riwayat Perjalanan</p>
                <p className="text-xs text-gray-300 mt-2">Data passport akan terakumulasi seiring berjalannya tahun ajaran.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <div className={cn("px-4 py-2 rounded-xl text-xs font-bold border w-fit", color)}>
      {label}
    </div>
  );
}

function getUnitName(unit: UnitType) {
  switch(unit) {
    case 'KINDERGARTEN': return 'Lumina Kindergarten';
    case 'ELEMENTARY': return 'Lumina Elementary';
    case 'JUNIOR_HIGH': return 'Lumina Junior High';
    default: return '';
  }
}

function getUnitStyles(unit: UnitType) {
  switch(unit) {
    case 'KINDERGARTEN': return 'bg-pink-50 text-pink-600 ring-1 ring-pink-100';
    case 'ELEMENTARY': return 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100';
    case 'JUNIOR_HIGH': return 'bg-blue-50 text-blue-600 ring-1 ring-blue-100';
    default: return 'bg-gray-50 text-gray-500';
  }
}
