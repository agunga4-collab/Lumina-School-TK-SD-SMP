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
  const { currentUser, activeUnit, parentStudents } = useOutletContext<{ 
    currentUser: AppUser; 
    activeUnit: string;
    parentStudents?: Student[];
  }>();
  const navigate = useNavigate();
  const [links, setLinks] = React.useState<ParentStudentLink | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (parentStudents && parentStudents.length > 0) {
      setStudents(parentStudents);
      setLoading(false);
      return;
    }

    const fetchLinks = async () => {
      setLoading(true);
      try {
        const linkData = await getParentStudentLinks(currentUser?.email);
        setLinks(linkData);

        if (linkData && linkData.studentIds.length > 0) {
          const studentPromises = linkData.studentIds.map(id => getStudentById(id));
          const studentData = await Promise.all(studentPromises);
          const validStudents = studentData.filter(s => s !== null) as Student[];
          
          // Deduplicate students by normalized id (preferring luminaId/NIS)
          const uniqueStudentsMap = new Map<string, Student>();
          validStudents.forEach(s => {
            const studentId = (s as any).luminaId || s.id;
            if (!uniqueStudentsMap.has(studentId)) {
              uniqueStudentsMap.set(studentId, { ...s, id: studentId });
            }
          });
          const deduplicatedStudents = Array.from(uniqueStudentsMap.values()) as Student[];
          setStudents(deduplicatedStudents);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLinks();
  }, [currentUser, parentStudents]);

  const studentsInUnit = React.useMemo(() => {
    if (!activeUnit) return students;
    return students.filter(s => {
      const u = s.unitId || s.currentUnit || '';
      return u.toUpperCase() === activeUnit.toUpperCase();
    });
  }, [students, activeUnit]);

  // Handle auto-selecting student in unit
  React.useEffect(() => {
    if (students.length > 0 && activeUnit) {
      const filtered = students.filter(s => {
        const u = s.unitId || s.currentUnit || '';
        return u.toUpperCase() === activeUnit.toUpperCase();
      });
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
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
      {/* Account Header: More Compact */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
        
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
             <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center">
                <Heart className="text-emerald-600" size={14} />
             </div>
             <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Parent Portal</span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight uppercase text-gray-900 leading-none">
            Selamat Datang, <span className="text-emerald-600">{currentUser.displayName.split(' ')[0]}!</span>
          </h1>
          <p className="text-xs text-gray-400 font-bold">Pantau perkembangan belajar ananda di Lazuardi Lumina.</p>
        </div>

        {studentsInUnit.length > 1 && (
          <div className="relative w-full md:w-auto z-10">
             <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 block">Pilih Ananda:</label>
             <div className="flex gap-1 p-1 bg-gray-50 rounded-xl border border-gray-100">
                {studentsInUnit.map(student => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudentId(student.id)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                      selectedStudentId === student.id 
                        ? "bg-white text-emerald-600 shadow-sm border border-gray-100"
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
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          >
            {/* Student Info Card: Slimmer & Balanced */}
            <div className="lg:col-span-1">
               <div className="p-5 bg-gray-900 text-white rounded-2xl shadow-md relative overflow-hidden h-full flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none" />
                  
                  <div className="space-y-4 relative z-10 w-full">
                     <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                        <User className="text-white" size={24} />
                     </div>
                     
                     <div className="space-y-3">
                        <div className="space-y-1">
                           <h2 className="text-lg font-extrabold uppercase tracking-tight leading-snug">
                             {selectedStudent.name}
                           </h2>
                           <p className="text-emerald-400 font-bold text-xs uppercase tracking-wider">{selectedStudent.classId}</p>
                        </div>
                        
                        <div className="space-y-2 pt-3 border-t border-white/10 text-xs">
                           <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">NIS</span>
                              <span className="font-mono">{selectedStudent.id}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Unit</span>
                              <span className="text-emerald-400 font-bold">{selectedStudent.unitId}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Tahun</span>
                              <span className="font-medium">2025/2026</span>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-white/10 relative z-10">
                     <div className="p-3 bg-white/5 rounded-xl space-y-0.5 border border-white/5">
                        <p className="text-[9px] font-black uppercase text-gray-500">Wali Kelas:</p>
                        <p className="font-bold text-xs text-gray-200">Ms. Sarah Kartika</p>
                     </div>
                  </div>
               </div>
            </div>

            {/* Actions Grid: Compact Card Heights */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
               <Link 
                  to={`/parent/reports?studentId=${selectedStudent.id}`}
                  className="group p-5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex flex-col justify-between"
               >
                  <div className="space-y-4">
                     <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 transition-all duration-300">
                        <FileText className="text-emerald-600 group-hover:text-white" size={22} />
                     </div>
                     <div className="space-y-1">
                        <h3 className="text-lg font-extrabold uppercase tracking-tight text-gray-900 group-hover:text-emerald-600 transition-colors">Rapor Ananda</h3>
                        <p className="text-xs text-gray-400 font-medium leading-relaxed">Akses semua laporan berkala dan hasil belajar akhir semester.</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-600 pt-6">
                     Lihat Semua Rapor <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
               </Link>

               <div className="group p-5 bg-gray-50/50 border border-gray-100 rounded-2xl opacity-60 flex flex-col justify-between">
                  <div className="space-y-4">
                     <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-100">
                        <Bell className="text-gray-300" size={22} />
                     </div>
                     <div className="space-y-1">
                        <h3 className="text-lg font-extrabold uppercase tracking-tight text-gray-400">Kehadiran</h3>
                        <p className="text-xs text-gray-400 font-medium leading-relaxed">Pantau absensi harian ananda dalam waktu dekat.</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-gray-300 pt-6">
                     Coming Soon
                  </div>
               </div>

               {/* Banner: Beautifully Slimmed */}
               <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                  <div className="space-y-1">
                     <h4 className="text-xs font-black text-emerald-900 uppercase tracking-tight">Pesan dari Sekolah</h4>
                     <p className="text-xs text-emerald-700 font-semibold max-w-lg leading-relaxed">"Ayah & Bunda, laporan Monthly 2 sudah tersedia untuk ditinjau. Mari berikan apresiasi terbaik untuk ananda."</p>
                  </div>
                  <button className="whitespace-nowrap px-4 py-2 bg-white text-emerald-600 rounded-lg font-extrabold uppercase text-[10px] tracking-wider shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                     Hubungi Sekolah
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedStudent && !loading && (
        <div className="p-10 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-center space-y-4">
           <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
              <Users className="text-gray-300" size={28} />
           </div>
           <div className="space-y-1">
              <h3 className="text-base font-extrabold text-gray-900 uppercase tracking-tight">Data Ananda Belum Terhubung</h3>
              <p className="text-xs text-gray-400 font-bold max-w-md mx-auto leading-relaxed">
                Akun orang tua Anda belum terhubung ke data siswa manapun. Silakan hubungi admin sekolah untuk verifikasi.
              </p>
           </div>
           <button className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-extrabold uppercase text-[10px] tracking-wider shadow hover:scale-102 transition-all cursor-pointer">
             Hubungi Admin via WhatsApp
           </button>
        </div>
      )}
    </div>
  );
}
