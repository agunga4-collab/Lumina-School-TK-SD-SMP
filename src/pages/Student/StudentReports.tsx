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
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function StudentReports() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { activeYear, activeSemester } = useAcademicYear();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [reports, setReports] = React.useState<ReportCard[]>([]);
  const [kgReports, setKgReports] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const student = await getStudentById(currentUser.luminaId || '');
        setStudentData(student);

        if (student) {
          if (student.unitId === 'KINDERGARTEN') {
            const studentId = student.id || (student as any).luminaId || currentUser.luminaId || '';
            const q = query(
              collection(db, 'published_kg_reports'),
              where('studentId', '==', studentId.trim()),
              where('academicYear', '==', activeYear)
            );
            const snap = await getDocs(q);
            const list = snap.docs.map(docSnap => ({
              id: docSnap.id,
              ...docSnap.data()
            } as any));
            const filteredList = list.filter((r: any) => !r.status || r.status.toLowerCase() === 'published');
            setKgReports(filteredList.sort((a: any, b: any) => (b.publishedAt || 0) - (a.publishedAt || 0)));
          } else {
            const allReports = await getReportCards({
               unitId: student.unitId as any,
               academicYear: activeYear || '2025/2026',
               status: 'PUBLISHED'
            });
            
            // Filter reports where student is included
            const studentReports = allReports.filter(rc => 
              rc.studentReports.some(sr => sr.studentId === student.id)
            );
            
            setReports(studentReports.sort((a, b) => b.createdAt - a.createdAt));
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [currentUser, activeYear]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (studentData?.unitId === 'KINDERGARTEN') {
    return (
      <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in duration-700">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gray-400">
          Rapor Saya
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Rapor <span className="text-blue-600">Saya</span>
          </h1>
          <p className="text-gray-500 font-medium">
            Lihat rapor yang telah diterbitkan sekolah.
          </p>
        </div>

        {kgReports.length === 0 ? (
          <div className="bg-white border border-gray-100 p-16 rounded-[2rem] text-center space-y-2 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900">Belum Ada Rapor</h3>
            <p className="text-sm text-gray-500 font-medium max-w-md mx-auto">
              Sekolah belum menerbitkan rapor untuk periode ini.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <th className="py-5 px-6">Tahun Ajaran</th>
                    <th className="py-5 px-6">Semester</th>
                    <th className="py-5 px-6">Periode</th>
                    <th className="py-5 px-6">Status</th>
                    <th className="py-5 px-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm font-semibold text-gray-700">
                  {kgReports.map((report) => {
                    const semesterText = report.semester || activeSemester || "Semester 1";
                    const periodText = report.theme ? `${report.theme}${report.week ? ` - Minggu ${report.week}` : ''}` : (report.period || 'Ganjil');
                    return (
                      <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-5 px-6 font-bold text-gray-900">{report.academicYear}</td>
                        <td className="py-5 px-6">{semesterText}</td>
                        <td className="py-5 px-6">{periodText}</td>
                        <td className="py-5 px-6">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Diterbitkan
                          </span>
                        </td>
                        <td className="py-5 px-6 text-right">
                          <div className="flex justify-end gap-2">
                            {report.driveFileUrl && (
                              <a
                                href={report.driveFileUrl}
                                target="_blank"
                                rel="referrer noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                              >
                                <Eye size={14} /> Lihat Rapor
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
