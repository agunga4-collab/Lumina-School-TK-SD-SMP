import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Download, Eye, 
  Calendar, Award, ChevronLeft,
  Loader2, ExternalLink
} from 'lucide-react';
import { useOutletContext, Link } from 'react-router-dom';
import { 
  User as AppUser, 
  ReportCard,
  Student
} from '../../types';
import { 
  getReportCards,
  getStudentById
} from '../../lib/firebase';
import { cn } from '../../lib/utils';

export default function StudentReports() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [reports, setReports] = React.useState<ReportCard[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const student = await getStudentById(currentUser.luminaId || '');
        setStudentData(student);

        if (student) {
          const allReports = await getReportCards({
             unitId: student.unitId as any,
             academicYear: '2025/2026',
             status: 'PUBLISHED'
          });
          
          // Filter reports where student is included
          const studentReports = allReports.filter(rc => 
            rc.studentReports.some(sr => sr.studentId === student.id)
          );
          
          setReports(studentReports.sort((a, b) => b.createdAt - a.createdAt));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      <div className="space-y-4">
        <Link to="/student/dashboard" className="group flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-blue-600 transition-colors">
          <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Dashboard
        </Link>
        <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
          Rapor <span className="text-blue-600">Saya</span>
        </h1>
        <p className="text-gray-400 font-bold max-w-lg">
          Daftar hasil belajarmu yang sudah diterbitkan sekolah. Klik untuk melihat detail atau mengunduh file.
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 p-20 rounded-[3rem] text-center space-y-4">
          <div className="w-20 h-20 bg-gray-100 rounded-[2rem] flex items-center justify-center mx-auto">
            <FileText className="text-gray-300" size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Belum Ada Rapor</h3>
            <p className="text-sm text-gray-400 font-bold max-w-xs mx-auto">Sekolah belum menerbitkan rapor untuk periode ini.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {reports.map((report, idx) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-blue-100 hover:border-blue-100 transition-all flex flex-col justify-between aspect-square"
            >
              <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                    <FileText className="text-blue-600 group-hover:text-white" size={28} />
                  </div>
                  <div className="px-4 py-2 bg-gray-950 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest">
                    {report.type.replace('_', ' ')}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                    {report.period}
                  </h3>
                  <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                    <span className="flex items-center gap-1"><Calendar size={12} /> Sem {report.semester}</span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full" />
                    <span>{report.academicYear}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Link 
                  to={`/academic/rapor/${report.id}?view=student`} 
                  className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 hover:text-white transition-all transform active:scale-95"
                >
                  <Eye size={14} /> Lihat Detail
                </Link>
                
                <div className="flex gap-2">
                   <button className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all">
                      <Download size={14} /> PDF
                   </button>
                   {report.isEndTerm && (
                     <button className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-emerald-600 hover:text-emerald-600 transition-all">
                        <Award size={14} /> Profile
                     </button>
                   )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Motivational Card */}
      <div className="bg-gray-900 p-12 rounded-[4rem] text-white overflow-hidden relative">
         <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] -mr-32 -mt-32" />
         <div className="relative space-y-6">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter max-w-lg">
              Teruslah Bertumbuh & Berpikir Kritis! 🚀
            </h2>
            <p className="text-gray-400 font-bold text-lg max-w-xl leading-relaxed">
              Hasil belajarmu adalah cerminan dari usahamu. Jika ada nilai yang ingin kamu tingkatkan, jangan ragu untuk bertanya pada gurumu ya!
            </p>
            <div className="flex gap-4">
               <button className="px-8 py-4 bg-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-colors">
                 Melihat Pencapaian
               </button>
               <button className="px-8 py-4 bg-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white/20 transition-colors">
                 Beri Feedback Portal
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
