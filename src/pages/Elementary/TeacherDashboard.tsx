import * as React from 'react';
import { useMemo, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  LayoutDashboard, AlertTriangle, CheckCircle2, Clock, Loader2, 
  Calendar, ArrowRight, BookOpen, AlertCircle, RefreshCw, ChevronDown, 
  Users, Layers, ClipboardCheck, Info, UserX, AlertOctagon, HelpCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';

// Types and Interfaces
interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  date: string;
  status: 'H' | 'T' | 'A' | 'S' | 'I' | null;
  note?: string;
}

interface LatenessRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  date: string;
  academicYear: string;
  latenessMinutes?: number | null;
  reason?: string;
}

interface ElementaryProgressRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  schoolYear: string;
  period: 'JUL_OCT' | 'NOV_FEB' | 'MAR_JUN';
  area: 'BAHASA_INDONESIA' | 'ENGLISH_READING' | 'MENGAJI' | 'NUMERACY';
  level?: string;
  notes?: string;
  updatedAt?: any;
}

interface MTSSAcademicCase {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  status: string;
  currentTier?: string;
  subject?: string;
  updatedAt?: any;
}

interface LdssAssessment {
  id: string;
  studentId: string;
  studentNameSnapshot?: string;
  classId: string;
  academicYearId: string;
  instrumentAge: number;
  status: 'draft' | 'completed';
  assessmentDate?: string;
}

interface TaskActionItem {
  id: string;
  module: 'ATTENDANCE' | 'LATENESS' | 'LIT_NUM' | 'MTSS' | 'LDSS';
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'info';
  actionLabel: string;
  onAction: () => void;
  metadata?: any;
}

const LIT_NUM_AREAS = [
  { id: 'BAHASA_INDONESIA', label: 'Bahasa Indonesia' },
  { id: 'ENGLISH_READING', label: 'English Reading' },
  { id: 'MENGAJI', label: 'Mengaji' },
  { id: 'NUMERACY', label: 'Numerasi' }
] as const;

export default function ElementaryTeacherDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  // Selected class state
  const [homeroomClasses, setHomeroomClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [schoolHolidays, setSchoolHolidays] = useState<string[]>([]);

  // Operational states
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingClassData, setLoadingClassData] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Class-specific data
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [latenessRecords, setLatenessRecords] = useState<any[]>([]);
  const [litNumRecords, setLitNumRecords] = useState<ElementaryProgressRecord[]>([]);
  const [mtssCases, setMtssCases] = useState<MTSSAcademicCase[]>([]);
  const [ldssAssessments, setLdssAssessments] = useState<LdssAssessment[]>([]);

  const activeSemester = '1'; // Default active semester fallback

  // Current selected class entity
  const selectedClass = useMemo(() => {
    return homeroomClasses.find(c => c.id === selectedClassId) || null;
  }, [homeroomClasses, selectedClassId]);

  // Today representation (Jakarta time safely)
  const todayStr = useMemo(() => {
    const tzOffset = 7 * 60; // WIB offset
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const wib = new Date(utc + (3600000 * 7));
    return wib.toISOString().split('T')[0];
  }, []);

  // Is today weekend or holiday? Or before school year start on 20 July 2026?
  const isTodayWeekendOrHoliday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const isWeekend = (day === 0 || day === 6);
    const isHoliday = schoolHolidays.includes(todayStr);
    const isBeforeCutoff = (activeYear === '2026/2027' && todayStr < '2026-07-20');
    return isWeekend || isHoliday || isBeforeCutoff;
  }, [schoolHolidays, todayStr, activeYear]);

  // Generate 14 past school days, respecting the July 20 Cutoff for 2026/2027
  const last14SchoolDays = useMemo(() => {
    const dates: string[] = [];
    const curr = new Date();
    let checked = 0;
    while (dates.length < 14 && checked < 50) {
      const day = curr.getDay();
      const dateStr = curr.toISOString().split('T')[0];
      const isWeekend = (day === 0 || day === 6);
      const isHoliday = schoolHolidays.includes(dateStr);
      const isBeforeCutoff = (activeYear === '2026/2027' && dateStr < '2026-07-20');
      if (!isWeekend && !isHoliday && !isBeforeCutoff) {
        dates.push(dateStr);
      }
      curr.setDate(curr.getDate() - 1);
      checked++;
    }
    return dates;
  }, [schoolHolidays, activeYear]);

  // Load initial meta configuration (Assigned homeroom classes & holidays)
  useEffect(() => {
    async function loadInitial() {
      if (!profile || !activeYear) return;
      setLoadingInitial(true);
      try {
        // Fetch classes
        const allClasses = await getClasses() || [];
        const isUserAdmin = ['SUPER_ADMIN', 'HEAD_UNIT'].includes(profile.role);

        let elementaryClasses = allClasses.filter(
          c => c.unitId === 'ELEMENTARY' && c.status !== 'archived' && c.academicYear === activeYear
        );

        if (!isUserAdmin) {
          // Standard teacher only sees their assigned homeroom classes
          elementaryClasses = elementaryClasses.filter(c => c.homeroomTeacherId === profile.uid);
        }

        setHomeroomClasses(elementaryClasses);

        if (elementaryClasses.length > 0) {
          setSelectedClassId(elementaryClasses[0].id);
        }

        // Fetch holidays
        const holidaySnap = await getDocs(collection(db, 'school_holidays'));
        const holidayList = holidaySnap.docs.map(d => d.data().date || d.id).filter(Boolean);
        setSchoolHolidays(holidayList);
      } catch (err) {
        console.error('Error initializing elementary teacher dashboard:', err);
        toast.error('Gagal memuat data awal guru kelas.');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadInitial();
  }, [profile, activeYear]);

  // Fetch detailed data for selected class
  useEffect(() => {
    async function fetchClassData() {
      if (!selectedClassId || !activeYear) return;
      setLoadingClassData(true);
      try {
        // 1. Students in class
        const classStudents = await getActiveStudents(selectedClassId, activeYear);
        setStudents(classStudents);

        if (classStudents.length === 0) {
          setAttendanceRecords([]);
          setLatenessRecords([]);
          setLitNumRecords([]);
          setMtssCases([]);
          setLdssAssessments([]);
          setLoadingClassData(false);
          return;
        }

        // 2. Attendance records for class
        const attQuery = query(
          collection(db, 'attendance_records'),
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const attSnap = await getDocs(attQuery);
        const attList = attSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as AttendanceRecord));
        const filteredAttList = activeYear === '2026/2027'
          ? attList.filter(r => r.date >= '2026-07-20')
          : attList;
        setAttendanceRecords(filteredAttList);

        // 3. Lateness records
        const lateQuery = query(
          collection(db, 'lateness_records'),
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const lateSnap = await getDocs(lateQuery);
        const lateList = lateSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        const filteredLateList = activeYear === '2026/2027'
          ? lateList.filter((r: any) => r.date >= '2026-07-20')
          : lateList;
        setLatenessRecords(filteredLateList);

        // 4. LitNum progress records
        const litNumQuery = query(
          collection(db, 'elementary_literacy_numeracy_records'),
          where('classId', '==', selectedClassId),
          where('schoolYear', '==', activeYear)
        );
        const litNumSnap = await getDocs(litNumQuery);
        const litNumList = litNumSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ElementaryProgressRecord));
        setLitNumRecords(litNumList);

        // 5. Active MTSS Academic cases
        const mtssQuery = query(
          collection(db, 'elementary_mtss_cases'),
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const mtssSnap = await getDocs(mtssQuery);
        const mtssList = mtssSnap.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as MTSSAcademicCase))
          .filter(c => c.status !== 'CLOSED');
        setMtssCases(mtssList);

        // 6. LDSS Assessments
        const ldssQuery = query(
          collection(db, 'ldss_assessments'),
          where('classId', '==', selectedClassId),
          where('academicYearId', '==', activeYear)
        );
        const ldssSnap = await getDocs(ldssQuery);
        const ldssList = ldssSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LdssAssessment));
        setLdssAssessments(ldssList);

      } catch (err) {
        console.error('Error fetching elementary class details:', err);
        toast.error('Gagal memuat rincian data operasional kelas.');
      } finally {
        setLoadingClassData(false);
      }
    }
    fetchClassData();
  }, [selectedClassId, activeYear, refreshCounter]);

  // Calculate current active assessment period based on today's month
  const activePeriod = useMemo(() => {
    const month = new Date().getMonth() + 1; // 1-12
    if (month >= 7 && month <= 10) return 'JUL_OCT';
    if (month >= 11 || month <= 2) return 'NOV_FEB';
    return 'MAR_JUN';
  }, []);

  const activePeriodLabel = useMemo(() => {
    if (activePeriod === 'JUL_OCT') return 'Juli - Oktober';
    if (activePeriod === 'NOV_FEB') return 'November - Februari';
    return 'Maret - Juni';
  }, [activePeriod]);

  // 1. CALCULATE ATTENDANCE TASKS
  const attendanceTasks = useMemo(() => {
    if (students.length === 0) return [];
    const tasks: TaskActionItem[] = [];

    // Today's incomplete check
    if (!isTodayWeekendOrHoliday) {
      const todayRecords = attendanceRecords.filter(r => r.date === todayStr);
      const incompleteCount = students.length - todayRecords.length;
      if (incompleteCount > 0) {
        tasks.push({
          id: `attendance-today-${todayStr}`,
          module: 'ATTENDANCE',
          title: 'Kehadiran Hari Ini Belum Lengkap',
          description: `Terdapat ${incompleteCount} dari ${students.length} siswa yang belum terisi status kehadiran untuk hari ini.`,
          severity: 'high',
          actionLabel: 'Isi Kehadiran',
          onAction: () => navigate(`/attendance?classId=${selectedClassId}&date=${todayStr}`)
        });
      }
    }

    // Past school days incomplete check (last 14 school days, excluding today)
    const pastSchoolDays = last14SchoolDays.filter(d => d < todayStr);
    pastSchoolDays.forEach(dateStr => {
      const recordsForDay = attendanceRecords.filter(r => r.date === dateStr);
      const incompleteCount = students.length - recordsForDay.length;
      if (incompleteCount > 0) {
        tasks.push({
          id: `attendance-past-${dateStr}`,
          module: 'ATTENDANCE',
          title: `Absensi Tertinggal: ${dateStr}`,
          description: `Terdapat ${incompleteCount} siswa belum diisi status kehadiran pada hari sekolah ${new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dateStr))}.`,
          severity: 'medium',
          actionLabel: 'Lengkapi Absensi',
          onAction: () => navigate(`/attendance?classId=${selectedClassId}&date=${dateStr}`)
        });
      }
    });

    return tasks;
  }, [students, attendanceRecords, last14SchoolDays, todayStr, isTodayWeekendOrHoliday, selectedClassId, navigate]);

  // 2. CALCULATE LATENESS TASKS & LIST
  const latenessData = useMemo(() => {
    if (students.length === 0) return { tasks: [], lateList: [] };
    const tasks: TaskActionItem[] = [];
    const lateList: { studentId: string; studentName: string; totalLate: number; lastLateDate: string }[] = [];

    // Get 7 school days including today
    const last7Days = last14SchoolDays.slice(0, 7);

    students.forEach(student => {
      const studentLates = latenessRecords.filter(r => r.studentId === student.id && last7Days.includes(r.date));
      if (studentLates.length > 0) {
        // Sort to find latest
        const sortedLates = [...studentLates].sort((a, b) => b.date.localeCompare(a.date));
        const totalLate = studentLates.length;
        const lastLateDate = sortedLates[0].date;

        lateList.push({
          studentId: student.id,
          studentName: student.name,
          totalLate,
          lastLateDate
        });

        // Trigger task action if they have been late recently
        tasks.push({
          id: `lateness-${student.id}`,
          module: 'LATENESS',
          title: `Siswa Terlambat: ${student.name}`,
          description: `Tercatat terlambat pada ${lastLateDate} (total ${totalLate} kali dalam 7 hari sekolah terakhir).`,
          severity: 'medium',
          actionLabel: 'Buka Log Keterlambatan',
          onAction: () => navigate(`/lateness?classId=${selectedClassId}`)
        });
      }
    });

    return { tasks, lateList };
  }, [students, latenessRecords, last14SchoolDays, selectedClassId, navigate]);

  // 3. CALCULATE LITERACY & NUMERACY MISSING INPUTS (SINGLE SUMMARY TASK ONLY)
  const missingLitNumCount = useMemo(() => {
    if (students.length === 0) return 0;
    let missingCount = 0;
    students.forEach(student => {
      LIT_NUM_AREAS.forEach(area => {
        const hasRecord = litNumRecords.some(
          r => r.studentId === student.id && 
               r.period === activePeriod && 
               r.area === area.id
        );
        if (!hasRecord) {
          missingCount++;
        }
      });
    });
    return missingCount;
  }, [students, litNumRecords, activePeriod]);

  const litNumTasks = useMemo(() => {
    if (missingLitNumCount === 0) return [];
    return [{
      id: `litnum-summary-${activePeriod}`,
      module: 'LIT_NUM' as const,
      title: 'Literasi & Numerasi Belum Lengkap',
      description: `Literasi & Numerasi: ${missingLitNumCount} input belum lengkap pada periode aktif.`,
      severity: 'medium' as const,
      actionLabel: 'Buka Kelengkapan Input',
      onAction: () => navigate('/elementary/literasi-numerasi', {
        state: {
          initialClassId: selectedClassId,
          initialPeriod: activePeriod
        }
      })
    }];
  }, [missingLitNumCount, activePeriod, selectedClassId, navigate]);

  // 4. CALCULATE MTSS ACADEMIC CASES
  const mtssTasks = useMemo(() => {
    if (mtssCases.length === 0) return [];
    return mtssCases.map(c => ({
      id: `mtss-${c.id}`,
      module: 'MTSS' as const,
      title: `Kasus MTSS Aktif: ${c.studentName}`,
      description: `Siswa terdaftar dalam kasus intervensi aktif [${c.subject || 'Akademik'}], Tier: ${c.currentTier || 'Tier 2'}, Status: ${c.status}.`,
      severity: 'info' as const,
      actionLabel: 'Lihat Kasus',
      onAction: () => navigate('/elementary/mtss-academic')
    }));
  }, [mtssCases, navigate]);

  // 5. CALCULATE LDSS INCOMPLETE SCREENING (SINGLE SUMMARY TASK ONLY)
  const draftLdssCount = useMemo(() => {
    return ldssAssessments.filter(a => a.status === 'draft').length;
  }, [ldssAssessments]);

  const ldssTasks = useMemo(() => {
    if (draftLdssCount === 0) return [];
    return [{
      id: `ldss-summary-${activeYear}`,
      module: 'LDSS' as const,
      title: 'Asesmen LDSS Belum Lengkap',
      description: `Asesmen LDSS: ${draftLdssCount} asesmen belum selesai/draft.`,
      severity: 'medium' as const,
      actionLabel: 'Buka LDSS',
      onAction: () => navigate('/elementary/ldss', {
        state: {
          initialClassId: selectedClassId
        }
      })
    }];
  }, [draftLdssCount, activeYear, selectedClassId, navigate]);

  // Unified Needs Follow Up Action List
  const unifiedTasks = useMemo(() => {
    return [
      ...attendanceTasks,
      ...latenessData.tasks,
      ...litNumTasks,
      ...mtssTasks,
      ...ldssTasks
    ];
  }, [attendanceTasks, latenessData.tasks, litNumTasks, mtssTasks, ldssTasks]);

  const handleManualRefresh = () => {
    setRefreshCounter(prev => prev + 1);
    toast.success('Data diperbarui dari server.');
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
          Menginisialisasi Dashboard Wali Kelas...
        </p>
      </div>
    );
  }

  // Guard: Not assigned to any classes
  if (homeroomClasses.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-100 shadow-sm text-center space-y-6">
        <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
          <AlertOctagon size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide">
            Akses Terbatas Dashboard
          </h2>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            Halaman ini hanya dapat diakses oleh Wali Kelas SD yang memiliki penugasan aktif di Tahun Ajaran {activeYear}. Silakan hubungi tim administrasi sekolah jika Anda merasa ini merupakan kekeliruan.
          </p>
        </div>
        <Link 
          to="/" 
          className="inline-block px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors"
        >
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans max-w-7xl mx-auto px-4 py-2 text-slate-700">
      
      {/* Title block & Dropdown Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="text-indigo-600" size={20} />
            <h1 className="text-lg font-black text-slate-900 uppercase tracking-wider italic">
              DASHBOARD GURU KELAS — {selectedClass?.name || 'SD'}
            </h1>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Unit Akademik Lumina Elementary • Tahun Ajaran {activeYear}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Class Switcher */}
          {homeroomClasses.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Kelas:</span>
              <div className="relative">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="appearance-none bg-transparent pr-8 pl-1 py-1 font-black text-xs uppercase tracking-wider text-slate-700 border-none outline-none focus:ring-0 cursor-pointer"
                >
                  {homeroomClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1 top-1.5 text-slate-500 pointer-events-none" size={14} />
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <button 
            onClick={handleManualRefresh}
            disabled={loadingClassData}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-100 transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw size={14} className={cn(loadingClassData && "animate-spin")} />
          </button>
        </div>
      </div>

      {loadingClassData ? (
        <div className="py-24 text-center space-y-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin inline-block" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Sinkronisasi rincian data kelas asuhan...
          </p>
        </div>
      ) : students.length === 0 ? (
        <div className="p-16 bg-white rounded-2xl border border-dashed border-slate-200 text-center max-w-xl mx-auto space-y-4">
          <UserX className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Tidak ada siswa aktif</h3>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            Belum ada siswa aktif terdaftar di kelas asuhan {selectedClass?.name} pada tahun ajaran {activeYear}.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* UNIFIED NEEDS FOLLOW UP SECTION */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <ClipboardCheck size={18} />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Tugas Perlu Ditindaklanjuti
                  </h2>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    Konsolidasi Tindakan Harian & Penilaian Terkendali
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-slate-950 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-sm">
                {unifiedTasks.length} Tindakan
              </span>
            </div>

            <div className="p-6">
              {unifiedTasks.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    Tidak ada tindak lanjut untuk kelas ini
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Semua operasional kehadiran, input LitNum, dan skrining selesai tepat waktu.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {unifiedTasks.map((task) => (
                    <div key={task.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "p-2 rounded-lg shrink-0 mt-0.5",
                          task.severity === 'high' ? "bg-rose-50 text-rose-600" :
                          task.severity === 'medium' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                        )}>
                          <AlertTriangle size={14} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                              {task.title}
                            </span>
                            <span className={cn(
                              "px-2 py-0.5 font-black text-[8px] uppercase tracking-widest rounded-full",
                              task.module === 'ATTENDANCE' ? "bg-blue-50 text-blue-700" :
                              task.module === 'LATENESS' ? "bg-amber-50 text-amber-700" :
                              task.module === 'LIT_NUM' ? "bg-indigo-50 text-indigo-700" :
                              task.module === 'MTSS' ? "bg-purple-50 text-purple-700" : "bg-teal-50 text-teal-700"
                            )}>
                              {task.module}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed font-medium">
                            {task.description}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={task.onAction}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all self-start sm:self-center shrink-0",
                          task.severity === 'high' 
                            ? "bg-rose-600 hover:bg-rose-700 text-white shadow-sm" 
                            : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                        )}
                      >
                        {task.actionLabel}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* TWO COLUMN SUMMARY VIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* COLUMN 1: OPERATIONAL & PERFORMANCE */}
            <div className="space-y-8">
              
              {/* KEHADIRAN (ATTENDANCE) SECTION */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <ClipboardCheck size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Kehadiran Kelas
                      </h3>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        Roster Harian Terpadu
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {isTodayWeekendOrHoliday ? (
                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <Info className="text-slate-400 shrink-0 mt-0.5" size={16} />
                      <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                          Tidak Ada Absensi Hari Ini
                        </h4>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed mt-0.5">
                          Hari ini merupakan akhir pekan atau libur sekolah yang diatur dalam kalender.
                        </p>
                      </div>
                    </div>
                  ) : attendanceTasks.some(t => t.id.includes('today')) ? (
                    <div className="flex items-center justify-between gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                        <div>
                          <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide">
                            Absensi Hari Ini Belum Lengkap
                          </h4>
                          <p className="text-xs text-amber-700 leading-relaxed font-medium mt-0.5">
                            Silakan isi kehadiran siswa hari ini agar terhindar dari keterlambatan data.
                          </p>
                        </div>
                      </div>
                      <Link
                        to={`/attendance?classId=${selectedClassId}&date=${todayStr}`}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shrink-0 text-center"
                      >
                        Isi Absen
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                      <div>
                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                          Absensi Hari Ini Selesai
                        </h4>
                        <p className="text-xs text-emerald-700 font-medium leading-relaxed mt-0.5">
                          Semua siswa aktif kelas asuhan telah terdaftar dengan status kehadiran lengkap.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Absensi Tertinggal List */}
                  <div>
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1">
                      Absensi Hari Sekolah Sebelumnya
                    </h4>
                    
                    {attendanceTasks.filter(t => !t.id.includes('today')).length === 0 ? (
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider py-2 px-1">
                        Sempurna: Tidak ada data absensi yang tertinggal.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {attendanceTasks.filter(t => !t.id.includes('today')).map((task) => (
                          <div key={task.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors">
                            <div className="flex items-center gap-2.5">
                              <Calendar size={14} className="text-slate-400" />
                              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                                {task.title.replace('Absensi Tertinggal: ', '')}
                              </span>
                            </div>
                            <button
                              onClick={task.onAction}
                              className="px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-200 text-[9px] font-black uppercase tracking-wider rounded-lg border border-slate-200 transition-all"
                            >
                              Lengkapi
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* KETERLAMBATAN (LATENESS) SECTION */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Keterlambatan Siswa
                      </h3>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        Tangkapan 7 Hari Sekolah Terakhir
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/lateness?classId=${selectedClassId}`}
                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-1 transition-all"
                  >
                    Buka Log <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="p-6">
                  {latenessData.lateList.length === 0 ? (
                    <div className="py-6 text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                      <p className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Luar Biasa! Tidak Ada Keterlambatan
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Tidak ada siswa terlambat dalam 7 hari sekolah terakhir.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Siswa</th>
                            <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Terlambat Terakhir</th>
                            <th className="pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Frekuensi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {latenessData.lateList.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-3 text-xs font-black text-slate-800 uppercase tracking-wide">
                                {row.studentName}
                              </td>
                              <td className="py-3 text-xs text-slate-500 font-medium">
                                {row.lastLateDate}
                              </td>
                              <td className="py-3 text-xs text-center">
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 font-black text-[10px] rounded-full">
                                  {row.totalLate}x
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* COLUMN 2: ACADEMIC & SUPPORT INTERVENTIONS */}
            <div className="space-y-8">
              
              {/* LITERASI & NUMERASI SECTION */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Literasi & Numerasi
                      </h3>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        Kelengkapan Input Periode {activePeriodLabel}
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/elementary/literasi-numerasi"
                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-1 transition-all"
                  >
                    Buka Modul <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="p-6">
                  {missingLitNumCount === 0 ? (
                    <div className="py-8 text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                      <p className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Semua Input Lengkap
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Seluruh siswa telah memiliki assessment LitNum lengkap untuk periode ini.
                      </p>
                    </div>
                  ) : (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                      <AlertTriangle className="w-10 h-10 text-amber-500" />
                      <div className="space-y-1">
                        <p className="text-sm font-black text-slate-800 uppercase tracking-wide">
                          Literasi & Numerasi Belum Lengkap
                        </p>
                        <p className="text-xs text-slate-500 font-medium max-w-sm leading-relaxed">
                          Literasi & Numerasi: <span className="font-bold text-amber-600">{missingLitNumCount}</span> input belum lengkap pada periode aktif.
                        </p>
                      </div>
                      <button
                        onClick={() => navigate('/elementary/literasi-numerasi', {
                          state: {
                            initialClassId: selectedClassId,
                            initialPeriod: activePeriod
                          }
                        })}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                      >
                        Buka Kelengkapan Input
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* MTSS ACADEMIC SECTION */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                      <Layers size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        MTSS Academic
                      </h3>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        Kasus Intervensi Siswa Aktif
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/elementary/mtss-academic"
                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-1 transition-all"
                  >
                    Buka Kasus <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="p-6">
                  {mtssCases.length === 0 ? (
                    <div className="py-6 text-center space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Tidak Ada Kasus Aktif
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Tidak ada siswa yang terdaftar dalam intervensi intensif MTSS Akademik.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mtssCases.map((row) => (
                        <div key={row.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors">
                          <div className="space-y-0.5">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide leading-tight">
                              {row.studentName}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                              <span>Mata Pelajaran: {row.subject || 'Akademik'}</span>
                              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                              <span className="text-purple-700 font-black">{row.currentTier || 'Tier 2'}</span>
                            </p>
                          </div>
                          <Link
                            to="/elementary/mtss-academic"
                            className="px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                          >
                            Detail
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* LDSS SECTION */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                      <ClipboardCheck size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Skrining LDSS
                      </h3>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        Status Evaluasi & Diagnostik Khusus
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/elementary/ldss"
                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-1 transition-all"
                  >
                    Buka LDSS <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="p-6">
                  {draftLdssCount === 0 ? (
                    <div className="py-6 text-center space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Semua Asesmen Selesai
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Tidak ada draf skrining diagnostik khusus (LDSS) yang tertunda.
                      </p>
                    </div>
                  ) : (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                      <AlertTriangle className="w-10 h-10 text-teal-600" />
                      <div className="space-y-1">
                        <p className="text-sm font-black text-slate-800 uppercase tracking-wide">
                          Asesmen LDSS Belum Selesai
                        </p>
                        <p className="text-xs text-slate-500 font-medium max-w-sm leading-relaxed">
                          Asesmen LDSS: <span className="font-bold text-teal-600">{draftLdssCount}</span> asesmen belum selesai/draft.
                        </p>
                      </div>
                      <button
                        onClick={() => navigate('/elementary/ldss', {
                          state: {
                            initialClassId: selectedClassId
                          }
                        })}
                        className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                      >
                        Buka LDSS
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
