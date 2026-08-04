import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Clock, BookOpen, AlertCircle, LayoutGrid, 
  Activity, Loader2, Calendar, Sliders, Settings2, ShieldAlert
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useNavigate } from 'react-router-dom';

// Types
import { 
  ElementaryClass, ElementaryStudent, AttendanceRecord, 
  LatenessRecord, LiteracyNumeracyRecord, MTSSCase, LDSSAssessment 
} from './Elementary/types';

// Tab Components
import DailyRecapTab from './Elementary/DailyRecapTab';
import LatenessTab from './Elementary/LatenessTab';
import AttendanceTab from './Elementary/AttendanceTab';
import LitNumTab from './Elementary/LitNumTab';
import MTSSAcademicTab from './Elementary/MTSSAcademicTab';
import LDSSTab from './Elementary/LDSSTab';

export default function ElementaryHeadDashboard() {
  const navigate = useNavigate();
  const { activeYear, activeSemester } = useAcademicYear();

  // --- STATE FOR GLOBAL FILTERS ---
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear);
  const [selectedSemester, setSelectedSemester] = React.useState<number>(Number(activeSemester));
  const [selectedClassId, setSelectedClassId] = React.useState<string>('ALL');
  const [overdueDays, setOverdueDays] = React.useState<number>(7);

  // Sync with context on load
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(Number(activeSemester));
  }, [activeYear, activeSemester]);

  // Default dates filter
  const [startDate, setStartDate] = React.useState<string>(() => {
    const today = new Date();
    const getWibDateString = (date: Date): string => {
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const wib = new Date(utc + (3600000 * 7));
      return wib.toISOString().split('T')[0];
    };
    return getWibDateString(today);
  });

  const [endDate, setEndDate] = React.useState<string>(() => {
    const today = new Date();
    const getWibDateString = (date: Date): string => {
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const wib = new Date(utc + (3600000 * 7));
      return wib.toISOString().split('T')[0];
    };
    return getWibDateString(today);
  });

  // --- TAB NAVIGATION STATE ---
  const [activeAnalysisTab, setActiveAnalysisTab] = React.useState<string>('rekap_harian');

  // --- CORE DATA STORES ---
  const [loading, setLoading] = React.useState<boolean>(true);
  const [classes, setClasses] = React.useState<ElementaryClass[]>([]);
  const [students, setStudents] = React.useState<ElementaryStudent[]>([]);
  
  // Real datasets matching source collections
  const [attendanceRecords, setAttendanceRecords] = React.useState<AttendanceRecord[]>([]);
  const [latenessRecords, setLatenessRecords] = React.useState<LatenessRecord[]>([]);
  const [literacyRecords, setLiteracyRecords] = React.useState<LiteracyNumeracyRecord[]>([]);
  const [mtssCases, setMTSSCases] = React.useState<MTSSCase[]>([]);
  const [ldssAssessments, setLDSSAssessments] = React.useState<LDSSAssessment[]>([]);

  // --- DATA LOADING TRIGGERED ONCE ON YEAR/SEM CHANGE ---
  const loadDashboardData = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Elementary Classes
      const allClasses = await getClasses() || [];
      const elementaryClasses = allClasses.filter(
        (c: any) => c.unitId === 'ELEMENTARY' && c.status !== 'archived' && c.academicYear === selectedYear
      ) as ElementaryClass[];
      setClasses(elementaryClasses);

      const elementaryClassIds = new Set(elementaryClasses.map(c => c.id));
      const elementaryClassNames = new Set(elementaryClasses.map(c => c.name));

      // 2. Fetch Active Students in Elementary
      const activeStudents = await getActiveStudents('ALL', selectedYear) || [];
      const filteredActiveStudents = activeStudents.filter((s: any) => 
        s.classId && (elementaryClassIds.has(s.classId) || elementaryClassNames.has(s.classId))
      ).map((s: any) => ({
        id: s.id,
        name: s.name || s.fullName || 'Siswa Tanpa Nama',
        classId: s.classId,
        className: elementaryClasses.find(c => c.id === s.classId)?.name || s.classId
      })) as ElementaryStudent[];
      setStudents(filteredActiveStudents);

      const targetStudentIds = new Set(filteredActiveStudents.map(s => s.id));

      // 3. Fetch Attendance Records for selected academic year
      const attSnap = await getDocs(
        query(collection(db, 'attendance_records'), where('academicYear', '==', selectedYear))
      );
      const loadedAttendance = attSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((r: any) => {
          if (r.unitId) return r.unitId.toUpperCase() === 'ELEMENTARY';
          return elementaryClassIds.has(r.classId) || elementaryClassNames.has(r.classId);
        }) as any[];
      setAttendanceRecords(loadedAttendance);

      // 4. Fetch Lateness Records
      const latSnap = await getDocs(
        query(collection(db, 'lateness_records'), where('academicYear', '==', selectedYear))
      );
      const loadedLateness = latSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((r: any) => {
          if (r.unitId) return r.unitId.toUpperCase() === 'ELEMENTARY';
          return elementaryClassIds.has(r.classId) || elementaryClassNames.has(r.classId) ||
                 elementaryClassIds.has(r.className) || elementaryClassNames.has(r.className);
        }) as any[];
      setLatenessRecords(loadedLateness);

      // 5. Fetch Literacy/Numeracy Records
      const litNumSnap = await getDocs(
        query(collection(db, 'elementary_literacy_numeracy_records'), where('schoolYear', '==', selectedYear))
      );
      const loadedLiteracy = litNumSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setLiteracyRecords(loadedLiteracy);

      // 6. Fetch MTSS Cases
      const mtssSnap = await getDocs(
        query(collection(db, 'elementary_mtss_cases'), where('academicYear', '==', selectedYear))
      );
      const loadedMTSS = mtssSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setMTSSCases(loadedMTSS);

      // 7. Fetch LDSS Assessments
      const ldssSnap = await getDocs(
        query(collection(db, 'ldss_assessments'), where('academicYearId', '==', selectedYear))
      );
      const loadedLDSS = ldssSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setLDSSAssessments(loadedLDSS);

    } catch (err) {
      console.error("Error loading Elementary Head Dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  // Reload data on selected academic year change
  React.useEffect(() => {
    loadDashboardData();
  }, [selectedYear, loadDashboardData]);

  // --- MEMOIZED FILTERED SUBSETS BASED ON CURRENT CLASS & DATES ---
  const filteredStudentsSubset = React.useMemo(() => {
    if (selectedClassId === 'ALL') return students;
    return students.filter(s => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  const filteredStudentIds = React.useMemo(() => new Set(filteredStudentsSubset.map(s => s.id)), [filteredStudentsSubset]);

  const filteredAttendanceSubset = React.useMemo(() => {
    return attendanceRecords.filter(rec => {
      const matchesSemester = String(rec.semester) === String(selectedSemester);
      const matchesDate = rec.date >= startDate && rec.date <= endDate;
      const matchesClass = selectedClassId === 'ALL'
        ? classes.some(c => c.id === rec.classId || c.name === rec.classId)
        : (rec.classId === selectedClassId);
      return matchesSemester && matchesDate && matchesClass;
    });
  }, [attendanceRecords, selectedSemester, startDate, endDate, selectedClassId, classes]);

  const filteredLatenessSubset = React.useMemo(() => {
    return latenessRecords.filter(rec => {
      const matchesDate = rec.date >= startDate && rec.date <= endDate;
      const matchesClass = selectedClassId === 'ALL'
        ? classes.some(c => c.id === rec.classId || c.name === rec.classId)
        : (rec.classId === selectedClassId);
      return matchesDate && matchesClass;
    });
  }, [latenessRecords, startDate, endDate, selectedClassId, classes]);

  const filteredLiteracySubset = React.useMemo(() => {
    return literacyRecords.filter(rec => {
      const matchesClass = selectedClassId === 'ALL'
        ? classes.some(c => c.id === rec.classId || c.name === rec.classId)
        : (rec.classId === selectedClassId);
      return matchesClass;
    });
  }, [literacyRecords, selectedClassId, classes]);

  const filteredMTSSSubset = React.useMemo(() => {
    return mtssCases.filter(rec => {
      const matchesClass = selectedClassId === 'ALL'
        ? classes.some(c => c.id === rec.classId || c.name === rec.classId)
        : (rec.classId === selectedClassId);
      return matchesClass;
    });
  }, [mtssCases, selectedClassId, classes]);

  const filteredLDSSSubset = React.useMemo(() => {
    return ldssAssessments.filter(rec => {
      const matchesClass = selectedClassId === 'ALL'
        ? classes.some(c => c.id === rec.classId || c.classNameSnapshot === rec.classNameSnapshot)
        : (rec.classId === selectedClassId);
      return matchesClass;
    });
  }, [ldssAssessments, selectedClassId, classes]);

  // Indonesian date formatter
  const formatIndonesianDate = (val: string | number) => {
    if (!val) return '—';
    const date = new Date(val);
    if (isNaN(date.getTime())) return String(val);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const getTodayWibDate = () => {
    const today = new Date();
    const utc = today.getTime() + (today.getTimezoneOffset() * 60000);
    const wib = new Date(utc + (3600000 * 7));
    return wib.toISOString().split('T')[0];
  };
  const todayStr = React.useMemo(() => getTodayWibDate(), []);

  // --- SUB-TABS DECLARATION ---
  const analysisTabs = [
    { id: 'rekap_harian', label: 'Rekap Harian', icon: LayoutGrid },
    { id: 'keterlambatan', label: 'Keterlambatan', icon: Clock },
    { id: 'kehadiran', label: 'Kehadiran', icon: Users },
    { id: 'literasi_numerasi', label: 'Literasi & Numerasi', icon: BookOpen },
    { id: 'mtss_academic', label: 'MTSS Academic', icon: AlertCircle },
    { id: 'ldss', label: 'LDSS', icon: Activity }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-black text-[#002366] tracking-tight">Analisis Unit — Lumina Elementary</h1>
          <p className="text-slate-500 text-sm mt-1">Pusat monitoring, sinkronisasi, dan rekapitulasi data real-time unit SD Lumina</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => loadDashboardData()}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950 transition shadow-sm"
          >
            Refreshed Real-time
          </button>
        </div>
      </div>

      {/* Control Filters Area */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-[#002366]" /> Filter Global Unit
          </span>
          <span className="text-xs text-slate-400">Pembaruan filter otomatis memengaruhi seluruh sub-tab di bawah</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Academic Year Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Tahun Ajaran</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          {/* Semester Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Semester</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
          </div>

          {/* Class Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Kelas</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Kelas (SD)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>Kelas {c.name}</option>
              ))}
            </select>
          </div>

          {/* Start Date Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Mulai Tanggal</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* End Date Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Sampai Tanggal</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Tab Navigation Menu */}
      <div className="bg-slate-100 p-1.5 rounded-xl border border-slate-200 flex flex-wrap gap-1">
        {analysisTabs.map((tab) => {
          const isActive = activeAnalysisTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveAnalysisTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm",
                isActive 
                  ? "bg-[#002366] text-white shadow" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Tab Rendering Area */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-20 flex flex-col items-center justify-center shadow-sm">
          <Loader2 className="w-10 h-10 text-[#002366] animate-spin mb-4" />
          <p className="text-sm font-semibold text-slate-700">Mengkonsolidasi Data Real-time Elementary...</p>
          <p className="text-xs text-slate-400 mt-1">Mengkueri Firestore untuk seluruh metrik dan parameter sinkron</p>
        </div>
      ) : (
        <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeAnalysisTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeAnalysisTab === 'rekap_harian' && (
                <DailyRecapTab
                  todayStr={endDate}
                  classes={classes}
                  students={students}
                  latenessRecords={latenessRecords}
                  attendanceRecords={attendanceRecords}
                  literacyRecords={literacyRecords}
                  mtssCases={mtssCases}
                  ldssAssessments={ldssAssessments}
                  overdueDays={overdueDays}
                  onTabChange={setActiveAnalysisTab}
                  formatDate={formatIndonesianDate}
                />
              )}

              {activeAnalysisTab === 'keterlambatan' && (
                <LatenessTab
                  filteredLateness={filteredLatenessSubset}
                  classes={classes}
                  startDate={startDate}
                  endDate={endDate}
                  formatDate={formatIndonesianDate}
                />
              )}

              {activeAnalysisTab === 'kehadiran' && (
                <AttendanceTab
                  filteredAttendance={filteredAttendanceSubset}
                  classes={classes}
                  students={students}
                  selectedSemester={selectedSemester}
                  startDate={startDate}
                  endDate={endDate}
                  attendanceRecords={attendanceRecords}
                  onClassSelect={setSelectedClassId}
                />
              )}

              {activeAnalysisTab === 'literasi_numerasi' && (
                <LitNumTab
                  literacyRecords={filteredLiteracySubset}
                  classes={classes}
                  students={students}
                  todayPeriod={todayStr >= startDate && todayStr <= endDate ? 'JUL_OCT' : 'JUL_OCT'} // Placeholder mapping logic, let component manage period
                />
              )}

              {activeAnalysisTab === 'mtss_academic' && (
                <MTSSAcademicTab
                  filteredMTSS={filteredMTSSSubset}
                  classes={classes}
                  overdueDays={overdueDays}
                  formatDate={formatIndonesianDate}
                />
              )}

              {activeAnalysisTab === 'ldss' && (
                <LDSSTab
                  filteredLDSS={filteredLDSSSubset}
                  classes={classes}
                  formatDate={formatIndonesianDate}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
