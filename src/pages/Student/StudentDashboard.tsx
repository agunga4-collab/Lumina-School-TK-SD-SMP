import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, FileText, ChevronRight, 
  Map, Calendar, Users, GraduationCap,
  Heart, Star, Camera, MessageCircleHeart, 
  CheckCircle2, Smile, Meh, Frown, Angry, 
  Activity, BookOpen, Coffee, Home, Loader2, ChevronLeft, ShieldAlert, FileSpreadsheet
} from 'lucide-react';
import { useOutletContext, Link, useNavigate, Navigate } from 'react-router-dom';
import { User as AppUser, Student } from '../../types';
import { getStudentById } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  DEFAULT_STUDENTS, 
  getMonday, 
  formatDateToKey 
} from '../../lib/kindergartenWeeklyReport';
import { getSummaryKey } from '../Kindergarten/WeeklySummary';
import { GoogleGenAI, Type } from '@google/genai';
import { doc, getDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface AiRecommendation {
  domain: string;
  activities: string[];
}

export default function StudentDashboard() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: AppUser; activeUnit?: string }>();

  const { activeYear } = useAcademicYear();
  const navigate = useNavigate();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [classData, setClassData] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [isValidated, setIsValidated] = React.useState(false);
  const [latestReportInfo, setLatestReportInfo] = React.useState<string>('Belum ada rapor yang diterbitkan.');

  React.useEffect(() => {
    const validateAndFetch = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setDataError(null);
      setIsValidated(false);

      try {
        // Guard 1: Verify user role is indeed STUDENT
        if (currentUser.role !== 'STUDENT') {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        // Guard 2: Use studentId (luminaId) as the primary key
        const studentId = currentUser.luminaId;
        if (!studentId || !studentId.trim()) {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        // Guard 3: Fetch student profile based on studentId
        const studentProfileRef = doc(db, 'students', studentId.trim());
        const studentProfileSnap = await getDoc(studentProfileRef);
        if (!studentProfileSnap.exists()) {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }
        const studentProfile = { id: studentProfileSnap.id, ...studentProfileSnap.data() } as Student;

        // Guard 4: Fetch activeEnrollment based on studentId and active academic year
        if (!activeYear) {
          setDataError("Tahun ajaran aktif belum ditentukan. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        // Search in enrollments
        const qEnroll = query(
          collection(db, 'enrollments'),
          where('studentId', '==', studentId.trim()),
          where('academicYear', '==', activeYear)
        );
        const qEnrollSnap = await getDocs(qEnroll);
        
        let enrollment = null;
        if (!qEnrollSnap.empty) {
          enrollment = qEnrollSnap.docs[0].data();
        }

        if (!enrollment) {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        // Guard 5: Strict cross-check validation
        // studentProfile.luminaId (or id) == activeEnrollment.studentId == authUser.luminaId
        const profileId = (studentProfile as any).luminaId || studentProfile.id;
        const enrollmentStudentId = enrollment.studentId;
        
        if (profileId !== studentId.trim() || enrollmentStudentId !== studentId.trim() || currentUser.luminaId !== studentId.trim()) {
          setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
          setLoading(false);
          return;
        }

        // Email matching guard: if email field exists, check case-insensitive match
        if (studentProfile.email && currentUser.email) {
          if (studentProfile.email.toLowerCase().trim() !== currentUser.email.toLowerCase().trim()) {
            setDataError("Data akun siswa belum terhubung dengan data kelas. Silakan hubungi admin.");
            setLoading(false);
            return;
          }
        }

        // Guard 6: Fetch class details using classId from the active enrollment
        const classDocRef = doc(db, 'classes', enrollment.classId);
        const classDocSnap = await getDoc(classDocRef);
        let classDetails = null;
        if (classDocSnap.exists()) {
          classDetails = { id: classDocSnap.id, ...classDocSnap.data() };
        } else {
          // If the classDoc doesn't exist by ID, try querying by class name
          const qClass = query(
            collection(db, 'classes'),
            where('name', '==', enrollment.classId)
          );
          const qClassSnap = await getDocs(qClass);
          if (!qClassSnap.empty) {
            classDetails = { id: qClassSnap.docs[0].id, ...qClassSnap.docs[0].data() };
          }
        }

        setStudentData(studentProfile);
        setClassData(classDetails);

        const userUnit = activeUnit || classDetails?.unitId || studentProfile.unitId || currentUser?.unitId || "JUNIOR_HIGH";
        if (userUnit === 'JUNIOR_HIGH') {
          try {
            const qJh = query(
              collection(db, 'jh_midterm_delivery_tracking'),
              where('studentId', '==', studentId.trim()),
              where('activeForStudent', '==', true)
            );
            const snapJh = await getDocs(qJh);
            if (!snapJh.empty) {
              const list = snapJh.docs.map(d => d.data());
              list.sort((a, b) => (b.sentAt || b.updatedAt || 0) - (a.sentAt || a.updatedAt || 0));
              const latest = list[0];
              const term = latest.midtermTerm || 1;
              const version = latest.reportVersion ? `v${latest.reportVersion}` : 'v1';
              setLatestReportInfo(`Rapor terbaru: Midterm ${term} (${version})`);
            } else {
              setLatestReportInfo('Belum ada rapor yang diterbitkan.');
            }
          } catch (jhErr) {
            console.warn("Failed to fetch latest midterm report info for dashboard:", jhErr);
          }
        }

        setIsValidated(true);
      } catch (err: any) {
        console.error("Critical student validation failed:", err);
        setDataError("Terjadi kesalahan memuat data siswa. Silakan coba beberapa saat lagi atau hubungi admin.");
      } finally {
        setLoading(false);
      }
    };

    validateAndFetch();
  }, [currentUser, activeYear]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-[#109E58] animate-spin" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memvalidasi Data Akun...</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white border border-red-100 rounded-[2rem] shadow-xl shadow-red-50/50 flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Koneksi Akun Terganggu</h2>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">{dataError}</p>
        </div>
        <div className="w-full pt-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-sm"
          >
            Segarkan Halaman
          </button>
        </div>
      </div>
    );
  }

  if (!isValidated) {
    return null;
  }

  const unit = activeUnit || classData?.unitId || currentUser?.unitId || "JUNIOR_HIGH";

  if (unit === 'KINDERGARTEN') {
    return (
      <KindergartenStudentDashboard 
        currentUser={currentUser} 
        studentData={studentData} 
        classData={classData}
        activeYear={activeYear} 
      />
    );
  }

  if (unit === 'ELEMENTARY') {
    return (
      <ElementaryStudentDashboard 
        currentUser={currentUser} 
        studentData={studentData} 
        classData={classData}
        activeYear={activeYear} 
      />
    );
  }

  // ----------------------------------------------------
  // ELEMENTARY & JUNIOR HIGH DASHBOARD (GENERAL)
  // ----------------------------------------------------
  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="space-y-4 relative">
          <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Halo, <span className="text-blue-600">{(studentData?.name || currentUser.displayName).split(' ')[0]}! 👋</span>
          </h1>
          <div className="flex flex-wrap gap-4">
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <GraduationCap size={14} className="text-blue-500" /> NIS: {currentUser.luminaId || '-'}
             </div>
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <Users size={14} className="text-emerald-500" /> Class: {classData?.name || studentData?.classId || '-'}
             </div>
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <Calendar size={14} className="text-purple-500" /> {activeYear || '2025/2026'}
             </div>
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className={cn("grid grid-cols-1 gap-8", unit === 'JUNIOR_HIGH' ? "lg:grid-cols-3 md:grid-cols-2" : "md:grid-cols-2")}>
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
                  <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-[200px]">
                    {unit === 'JUNIOR_HIGH' 
                      ? "Lihat rapor Midterm dan Rapor Bulanan yang sudah diterbitkan." 
                      : "Cek dan download hasil belajarmu di sini."}
                  </p>
                  {unit === 'JUNIOR_HIGH' && (
                    <div className="text-[11px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-xl uppercase tracking-wider inline-block mt-3">
                      {latestReportInfo}
                    </div>
                  )}
               </div>
            </div>

            <div className="relative flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 group-hover:text-blue-600 transition-colors">
               {unit === 'JUNIOR_HIGH' ? "BUKA RAPOR SAYA" : "Lihat Rapor"} <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
         </Link>

         {unit === 'JUNIOR_HIGH' && (
            <Link 
               to="/student/aap"
               className="group p-10 bg-white border border-gray-100 rounded-[3rem] shadow-sm hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between aspect-square md:aspect-auto md:h-80"
            >
               <div className="space-y-6 relative">
                  <div className="w-14 h-14 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-emerald-600 group-hover:rotate-6 transition-all duration-500">
                     <FileSpreadsheet className="text-emerald-600 group-hover:text-white" size={28} />
                  </div>
                  <div className="space-y-2">
                     <h2 className="text-3xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-emerald-600 transition-colors">Asesmen Awal</h2>
                     <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-[200px]">Lihat hasil asesmen awal diagnostik belajarmu.</p>
                  </div>
               </div>

               <div className="relative flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 group-hover:text-emerald-600 transition-colors">
                  Buka Asesmen <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
               </div>
            </Link>
         )}
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

// ----------------------------------------------------
// KINDERGARTEN STUDENT DASHBOARD
// ----------------------------------------------------
function KindergartenStudentDashboard({ 
  currentUser, 
  studentData, 
  classData,
  activeYear 
}: { 
  currentUser: AppUser; 
  studentData: Student | null; 
  classData: any | null;
  activeYear: string | null;
}) {
  const [hasReport, setHasReport] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    const checkReports = async () => {
      try {
        const studentId = studentData?.id || currentUser.luminaId || '';
        if (!studentId) {
          setHasReport(false);
          setChecking(false);
          return;
        }
        const q = query(
          collection(db, 'published_kg_reports'),
          where('studentId', '==', studentId.trim()),
          where('status', '==', 'sent')
        );
        const snap = await getDocs(q);
        setHasReport(!snap.empty);
      } catch (err) {
        console.error("Error checking published reports:", err);
        setHasReport(false);
      } finally {
        setChecking(false);
      }
    };
    checkReports();
  }, [currentUser, studentData]);

  const studentName = studentData?.name || currentUser.displayName || 'Ananda';
  const groupName = classData?.name || studentData?.classId || '';

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8 animate-in fade-in duration-500">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 p-8 rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -mr-12 -mt-12" />
        <div className="relative space-y-4">
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">
            Taman Kanak-Kanak Lazuardi
          </span>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-none">
            Halo, <span className="text-[#109E58]">{studentName}! 👋</span>
          </h1>
          {groupName && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-100/50 rounded-xl text-[10px] font-black uppercase tracking-wider text-emerald-800 border border-emerald-200/50">
              Kelompok: {groupName}
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Card & Report Status */}
      <div className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm hover:shadow-md transition-shadow duration-300 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                <FileText size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900">Rapor Saya</h2>
                <p className="text-sm text-gray-500 font-bold mt-0.5">Lihat rapor perkembangan anak</p>
              </div>
            </div>
          </div>

          <Link
            to="/student/reports"
            className="w-full md:w-auto px-8 py-4 bg-[#109E58] hover:bg-[#0e884b] text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-100/50 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer group"
          >
            Buka Rapor
            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Optional Report Status */}
        <div className="pt-6 border-t border-gray-50 flex items-center">
          {checking ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 font-bold">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              Memeriksa ketersediaan rapor...
            </div>
          ) : hasReport ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-wider border border-emerald-100">
              <CheckCircle2 size={14} className="text-emerald-500" />
              Rapor terbaru tersedia
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-black uppercase tracking-wider border border-amber-100">
              <ShieldAlert size={14} className="text-amber-500" />
              Belum ada rapor yang diterbitkan
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ElementaryStudentDashboard({
  currentUser,
  studentData,
  classData,
  activeYear
}: {
  currentUser: AppUser;
  studentData: Student | null;
  classData: any | null;
  activeYear: string | null;
}) {
  const studentName = studentData?.name || currentUser.displayName || '-';
  const nis = studentData?.nis || studentData?.id || currentUser.luminaId || '-';
  const nisn = studentData?.nisn || '-';
  const className = classData?.name || '-';
  const academicYear = activeYear || '-';

  return (
    <div className="max-w-4xl mx-auto space-y-12 py-12 animate-in fade-in duration-500">
      {/* Welcome & Greeting */}
      <div className="space-y-4">
        <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-none">
          Halo, <span className="text-blue-600">{studentName}! 👋</span>
        </h1>
        <p className="text-lg font-medium text-gray-600">
          Selamat datang di Portal Siswa Lazuardi Elementary.
        </p>
      </div>

      {/* Two Main Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Card: Informasi Sekolah (Segera Hadir / Read-only Placeholder) */}
        <div className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between group relative overflow-hidden h-[300px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gray-100 rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500" />
          
          <div className="space-y-4 relative">
            <div className="w-14 h-14 bg-gray-100 rounded-[1.5rem] flex items-center justify-center text-gray-400">
              <BookOpen size={28} />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                  Informasi Sekolah
                </h3>
                <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg text-[9px] font-black uppercase tracking-wider">
                  Segera Hadir
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-400">
                Informasi sekolah akan tersedia di sini.
              </p>
            </div>
          </div>
          
          <div className="pt-6 relative">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 text-center">
              Selalu Update dengan Berita Terbaru
            </div>
          </div>
        </div>

        {/* Card: Rapor Saya (Active Card leading to Rapor Saya page) */}
        <Link 
          to="/student/reports" 
          className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all flex flex-col justify-between group relative overflow-hidden h-[300px]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500" />
          
          <div className="space-y-4 relative">
            <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
              <FileText size={28} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight group-hover:text-blue-600 transition-colors">
                Rapor Saya
              </h3>
              <p className="text-sm font-semibold text-gray-500 group-hover:text-gray-600 transition-colors">
                Lihat hasil belajarmu yang telah diterbitkan oleh sekolah.
              </p>
            </div>
          </div>
          
          <div className="pt-6 relative flex items-center justify-between text-blue-600 font-black text-[10px] uppercase tracking-widest">
            <span>Buka Rapor Saya</span>
            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Student Real Identity Section (Data real siswa read-only) */}
      <div className="bg-white border border-gray-100 p-10 rounded-[2.5rem] shadow-sm space-y-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Identitas Siswa</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="p-6 bg-gray-50 rounded-2xl space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Nama</span>
            <p className="text-sm font-bold text-gray-800 truncate">{studentName}</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-2xl space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Kelas</span>
            <p className="text-sm font-bold text-gray-800">{className}</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-2xl space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">NIS</span>
            <p className="text-sm font-bold text-gray-800">{nis}</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-2xl space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">NISN</span>
            <p className="text-sm font-bold text-gray-800">{nisn}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
