import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, FileText, ChevronRight, 
  Map, Calendar, Users, GraduationCap
} from 'lucide-react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { User as AppUser, Student } from '../../types';
import { getStudentById } from '../../lib/firebase';
import { cn } from '../../lib/utils';

export default function StudentDashboard() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const navigate = useNavigate();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchStudent = async () => {
      if (currentUser.luminaId) {
        setLoading(true);
        const data = await getStudentById(currentUser.luminaId);
        setStudentData(data);
        setLoading(false);
      }
    };
    fetchStudent();
  }, [currentUser]);

  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="space-y-4 relative">
          <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Halo, <span className="text-blue-600">{currentUser.displayName.split(' ')[0]}! 👋</span>
          </h1>
          <div className="flex flex-wrap gap-4">
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <GraduationCap size={14} className="text-blue-500" /> NIS: {currentUser.luminaId || '-'}
             </div>
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <Users size={14} className="text-emerald-500" /> Class: {studentData?.classId || '-'}
             </div>
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <Calendar size={14} className="text-purple-500" /> 2025/2026
             </div>
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <Link 
            to="/self-exploration/my"
            className="group p-10 bg-gray-900 text-white rounded-[3rem] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all relative overflow-hidden flex flex-col justify-between aspect-square md:aspect-auto md:h-80"
         >
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-500/20 transition-colors" />
            
            <div className="space-y-6 relative">
               <div className="w-14 h-14 bg-white/10 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:rotate-6 transition-all duration-500">
                  <Sparkles className="text-blue-400 group-hover:text-white" size={28} />
               </div>
               <div className="space-y-2">
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter">Self Exploration</h2>
                  <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-[200px]">Rencanakan dan jalankan projek eksplorasi minat bakatmu!</p>
               </div>
            </div>

            <div className="relative flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 group-hover:text-white transition-colors">
               Mulai Eksplorasi <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
         </Link>

         <Link 
            to="/student/reports"
            className="group p-10 bg-white border border-gray-100 rounded-[3rem] shadow-sm hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between aspect-square md:aspect-auto md:h-80"
         >
            <div className="space-y-6 relative">
               <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                  <FileText className="text-blue-600 group-hover:text-white" size={28} />
               </div>
               <div className="space-y-2">
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors">Rapor Saya</h2>
                  <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-[200px]">Cek dan download hasil belajarmu di sini.</p>
               </div>
            </div>

            <div className="relative flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 group-hover:text-blue-600 transition-colors">
               Lihat Rapor <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
         </Link>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 p-10 rounded-[3rem] border border-blue-100 flex flex-col md:flex-row items-center gap-8 justify-between">
         <div className="space-y-2">
            <h3 className="text-lg font-black text-blue-900 uppercase italic tracking-tighter">Butuh Bantuan?</h3>
            <p className="text-sm text-blue-600 font-bold">Hubungi wali kelas atau mentor jika kamu menemui kesulitan mengakses portal.</p>
         </div>
         <button className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-sm hover:shadow-md transition-shadow">
            Pusat Bantuan
         </button>
      </div>
    </div>
  );
}
