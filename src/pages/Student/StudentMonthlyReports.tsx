import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Calendar, ChevronLeft,
  Loader2, ExternalLink, ShieldAlert
} from 'lucide-react';
import { useOutletContext, Link } from 'react-router-dom';
import { User as AppUser, Student } from '../../types';
import { getStudentById } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getIndonesianMonthLabel(periodKey: string): string {
  if (!periodKey || !periodKey.includes('-')) return periodKey || '';
  const [year, month] = periodKey.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${indonesianMonths[monthIdx]} ${year}`;
  }
  return periodKey;
}

export default function StudentMonthlyReports() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { activeYear } = useAcademicYear();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [jhManualLinks, setJhManualLinks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchReports = async () => {
      if (!currentUser?.luminaId) {
        setLoading(false);
        setError("Data akun siswa belum terhubung. Silakan hubungi admin.");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const student = await getStudentById(currentUser.luminaId.trim());
        setStudentData(student);

        if (student) {
          if (student.unitId !== 'JUNIOR_HIGH') {
            setError("Halaman ini hanya dapat diakses oleh siswa Junior High.");
            setLoading(false);
            return;
          }

          const qJh = query(
            collection(db, 'manual_junior_high_report_links'),
            where('studentId', '==', student.id),
            where('status', '==', 'PUBLISHED')
          );
          const jhSnap = await getDocs(qJh);
          const jhLinks = jhSnap.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          } as any));

          // Sort by periodKey descending (newest period first)
          jhLinks.sort((a, b) => (b.periodKey || '').localeCompare(a.periodKey || ''));
          setJhManualLinks(jhLinks);
        } else {
          setError("Profil siswa tidak ditemukan. Silakan hubungi admin.");
        }
      } catch (err: any) {
        console.error("Error fetching manual report links:", err);
        setError("Gagal memuat rapor bulanan. Silakan coba lagi.");
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [currentUser, activeYear]);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Memuat Rapor Bulanan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white border border-red-100 rounded-[2rem] shadow-xl shadow-red-50/50 flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Terjadi Hambatan</h2>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">{error}</p>
        </div>
        <div className="w-full pt-2">
          <Link
            to="/student/dashboard"
            className="w-full block py-4 bg-gray-900 hover:bg-gray-800 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-sm text-center"
          >
            Kembali ke Dashboard
          </Link>
        </div>
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
          Rapor <span className="text-blue-600">Bulanan</span>
        </h1>
        <p className="text-gray-400 font-bold max-w-lg">
          Daftar hasil belajar bulananmu yang sudah diterbitkan sekolah. Silakan klik tombol untuk membuka tautan berkas rapor PDF di Google Drive.
        </p>
      </div>

      {jhManualLinks.length === 0 ? (
        <div className="bg-white border border-gray-100 p-20 rounded-[3rem] text-center space-y-4 shadow-sm">
          <div className="w-20 h-20 bg-blue-50/50 rounded-[2rem] flex items-center justify-center mx-auto">
            <FileText className="text-blue-300" size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Belum Ada Rapor</h3>
            <p className="text-sm text-gray-400 font-bold max-w-xs mx-auto">Sekolah belum menerbitkan rapor bulanan untuk akun Anda.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {jhManualLinks.map((link, idx) => {
            const monthLabel = getIndonesianMonthLabel(link.periodKey);
            return (
              <motion.div
                key={link.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-blue-100/50 hover:border-blue-100 transition-all flex flex-col justify-between aspect-square"
              >
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                      <FileText className="text-blue-600 group-hover:text-white" size={28} />
                    </div>
                    <div className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl text-[9px] font-black uppercase tracking-widest">
                      DITERBITKAN
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                      {monthLabel || 'Rapor Bulanan'}
                    </h3>
                    <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> Sem {link.semester || '1'}
                      </span>
                      <span className="w-1 h-1 bg-gray-300 rounded-full" />
                      <span>{link.academicYear || activeYear}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {link.driveUrl ? (
                    <a 
                      href={link.driveUrl} 
                      target="_blank"
                      rel="noreferrer noopener"
                      className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all transform active:scale-95 shadow-sm shadow-blue-100 text-center"
                    >
                      <ExternalLink size={14} className="inline mr-1" /> Lihat Rapor (PDF)
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-400 border border-gray-200 rounded-2xl font-black uppercase text-[10px] tracking-widest cursor-not-allowed text-center"
                    >
                      Tautan Tidak Tersedia
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
