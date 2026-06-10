import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, FileText, ChevronRight, 
  Calendar, Award, User,
  Loader2, Bell, Heart
} from 'lucide-react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { 
  User as AppUser, 
  Student, 
  ParentStudentLink 
} from '../../types';
import { 
  getParentStudentLinks, 
  getStudentById 
} from '../../lib/firebase';
import { cn } from '../../lib/utils';

export default function ParentDashboard() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: AppUser; activeUnit: string }>();
  const navigate = useNavigate();
  const [links, setLinks] = React.useState<ParentStudentLink | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchLinks = async () => {
      setLoading(true);
      try {
        const linkData = await getParentStudentLinks(currentUser.email);
        setLinks(linkData);

        if (linkData && linkData.studentIds.length > 0) {
          const studentPromises = linkData.studentIds.map(id => getStudentById(id));
          const studentData = await Promise.all(studentPromises);
          const validStudents = studentData.filter(s => s !== null) as Student[];
          setStudents(validStudents);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLinks();
  }, [currentUser]);

  const studentsInUnit = React.useMemo(() => {
    if (!activeUnit) return students;
    return students.filter(s => (s.unitId || s.currentUnit) === activeUnit);
  }, [students, activeUnit]);

  // Handle auto-selecting student in unit
  React.useEffect(() => {
    if (students.length > 0 && activeUnit) {
      const filtered = students.filter(s => (s.unitId || s.currentUnit) === activeUnit);
      if (filtered.length > 0) {
        const isCurrentSelectedInUnit = filtered.some(s => s.id === selectedStudentId);
        if (!isCurrentSelectedInUnit) {
          setSelectedStudentId(filtered[0].id);
        }
      } else {
        setSelectedStudentId(null);
      }
    }
  }, [activeUnit, students, selectedStudentId]);

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      {/* Account Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="space-y-4 relative">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <Heart className="text-emerald-600" size={20} />
             </div>
             <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Parent Portal</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Selamat Datang, <span className="text-emerald-600">{currentUser.displayName.split(' ')[0]}!</span>
          </h1>
          <p className="text-gray-400 font-bold">Pantau perkembangan belajar ananda di Lazuardi Lumina.</p>
        </div>

        {studentsInUnit.length > 1 && (
          <div className="relative w-full md:w-auto">
             <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">Pilih Ananda:</label>
             <div className="flex gap-2 p-2 bg-gray-50 rounded-3xl">
                {studentsInUnit.map(student => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudentId(student.id)}
                    className={cn(
                      "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all",
                      selectedStudentId === student.id 
                        ? "bg-white text-emerald-600 shadow-sm"
                        : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    {((student.name || student.fullName || student.displayName || "Ananda") + "").split(' ')[0]}
                  </button>
                ))}
             </div>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {selectedStudent && (
          <motion.div
            key={selectedStudent.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Student Info Card */}
            <div className="lg:col-span-1 space-y-8">
               <div className="p-10 bg-gray-900 text-white rounded-[3.5rem] shadow-2xl relative overflow-hidden h-full">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
                  
                  <div className="space-y-8 relative">
                     <div className="w-20 h-20 bg-white/10 rounded-[2rem] flex items-center justify-center">
                        <User className="text-white" size={32} />
                     </div>
                     
                     <div className="space-y-4">
                        <div className="space-y-1">
                           <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-tight">
                             {selectedStudent.name}
                           </h2>
                           <p className="text-emerald-400 font-black text-sm uppercase tracking-widest italic">{selectedStudent.classId}</p>
                        </div>
                        
                        <div className="space-y-3 pt-6 border-t border-white/10">
                           <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-gray-400 uppercase tracking-widest">NIS</span>
                              <span>{selectedStudent.id}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-gray-400 uppercase tracking-widest">Unit</span>
                              <span className="text-emerald-400 italic">{selectedStudent.unitId}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-gray-400 uppercase tracking-widest">Tahun</span>
                              <span>2025/2026</span>
                           </div>
                        </div>
                     </div>

                     <div className="pt-6">
                        <div className="p-6 bg-white/5 rounded-3xl space-y-1 border border-white/5">
                           <p className="text-[10px] font-black uppercase text-gray-500">Wali Kelas:</p>
                           <p className="font-bold text-sm">Ms. Sarah Kartika</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Actions Grid */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
               <Link 
                  to={`/parent/reports?studentId=${selectedStudent.id}`}
                  className="group p-10 bg-white border border-gray-100 rounded-[3.5rem] shadow-sm hover:shadow-2xl hover:shadow-emerald-100 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between"
               >
                  <div className="space-y-8">
                     <div className="w-16 h-16 bg-emerald-50 rounded-[1.8rem] flex items-center justify-center group-hover:bg-emerald-600 group-hover:rotate-6 transition-all duration-500">
                        <FileText className="text-emerald-600 group-hover:text-white" size={32} />
                     </div>
                     <div className="space-y-2">
                        <h3 className="text-3xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-emerald-600 transition-colors">Rapor Ananda</h3>
                        <p className="text-sm font-bold text-gray-400 leading-relaxed">Akses semua laporan berkala dan hasil belajar akhir semester.</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 group-hover:text-emerald-600 transition-colors pt-12">
                     Lihat Semua Rapor <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </div>
               </Link>

               <div className="group p-10 bg-gray-50 border border-gray-100 rounded-[3.5rem] opacity-60 grayscale cursor-not-allowed">
                  <div className="space-y-8">
                     <div className="w-16 h-16 bg-white rounded-[1.8rem] flex items-center justify-center">
                        <Bell className="text-gray-300" size={32} />
                     </div>
                     <div className="space-y-2">
                        <h3 className="text-3xl font-black uppercase italic tracking-tighter text-gray-400">Kehadiran</h3>
                        <p className="text-sm font-bold text-gray-400 leading-relaxed">Pantau absensi harian ananda dalam waktu dekat.</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 pt-12">
                     Coming Soon
                  </div>
               </div>

               <div className="p-10 bg-emerald-50 border border-emerald-100 rounded-[3.5rem] md:col-span-2 flex flex-col md:flex-row items-center gap-8 justify-between">
                  <div className="space-y-2">
                     <h4 className="text-lg font-black text-emerald-900 uppercase italic tracking-tighter">Pesan dari Sekolah</h4>
                     <p className="text-sm text-emerald-600 font-bold max-w-md">"Ayah & Bunda, laporan Monthly 2 sudah tersedia untuk ditinjau. Mari berikan apresiasi terbaik untuk ananda."</p>
                  </div>
                  <button className="whitespace-nowrap px-8 py-4 bg-white text-emerald-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-sm hover:shadow-md transition-shadow">
                     Hubungi Sekolah
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedStudent && !loading && (
        <div className="p-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[4rem] text-center space-y-6">
           <div className="w-24 h-24 bg-gray-100 rounded-[2.5rem] flex items-center justify-center mx-auto">
              <Users className="text-gray-300" size={48} />
           </div>
           <div className="space-y-2">
              <h3 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Data Ananda Belum Terhubung</h3>
              <p className="text-gray-400 font-bold max-w-md mx-auto leading-relaxed">
                Akun orang tua Anda belum terhubung ke data siswa manapun. Silakan hubungi admin sekolah untuk verifikasi.
              </p>
           </div>
           <button className="px-10 py-5 bg-gray-900 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 transition-all">
             Hubungi Admin via WhatsApp
           </button>
        </div>
      )}
    </div>
  );
}
