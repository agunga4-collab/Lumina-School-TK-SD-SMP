import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Users, Clock, BookOpen, 
  AlertCircle, LayoutGrid, Activity, ChevronRight, Loader2, ArrowRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useNavigate } from 'react-router-dom';

interface ElementaryHeadDashboardData {
  avgAttendance: number | null;
  tardinessCount: number | null;
  uniqueLateStudents: number | null;
  assessedStudentsCount: number | null;
  literacyAssessedCount: number | null;
  numeracyAssessedCount: number | null;
  ldssCompletedStudents: number | null;
  ldssEligibleStudents: number | null;
  ldssCompletionRate: number | null;
  mtssActiveCasesCount: number | null;
  mtssT2Count: number | null;
  mtssT3Count: number | null;
  schoolDaysCount: number;
  
  // Data Section untuk visualisasi
  attendancePerClass: { classId: string; className: string; rate: number }[];
  literacySummary: { area: string; assessedCount: number; onTrackCount: number; needsSupportCount: number }[];
  ldssStatusTable: { classId: string; className: string; activeStudentsCount: number; ldss1Completed: number; ldss2Completed: number; ldss3Completed: number; totalCompleted: number }[];
  mtssSummaryList: { id: string; studentName: string; className: string; subject: string; tier: string; status: string }[];
}

export default function ElementaryHeadDashboard() {
  const navigate = useNavigate();
  const { activeYear, activeSemester } = useAcademicYear();

  // Selected class filter state
  const [selectedClassId, setSelectedClassId] = React.useState<string>('ALL');

  // Default dates filter
  const [startDate, setStartDate] = React.useState<string>(() => {
    const today = new Date();
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
    const getWibDateString = (date: Date): string => {
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const wib = new Date(utc + (3600000 * 7));
      return wib.toISOString().split('T')[0];
    };
    let startStr = getWibDateString(fourteenDaysAgo);
    if (activeYear === '2026/2027' && startStr < '2026-07-20') {
      startStr = '2026-07-20';
    }
    return startStr;
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

  // Main state
  const [loading, setLoading] = React.useState<boolean>(true);
  const [classes, setClasses] = React.useState<any[]>([]);
  const [data, setData] = React.useState<ElementaryHeadDashboardData | null>(null);

  // Aggregator logic
  const loadDashboardData = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Elementary Classes
      const allClasses = await getClasses() || [];
      const elementaryClasses = allClasses.filter(
        (c: any) => c.unitId === 'ELEMENTARY' && c.status !== 'archived' && c.academicYear === activeYear
      );
      setClasses(elementaryClasses);

      // 2. Fetch Active Students in Elementary
      const activeStudents = await getActiveStudents('ALL', activeYear) || [];
      const elementaryClassIds = new Set(elementaryClasses.map((c: any) => c.id));
      const elementaryClassNames = new Set(elementaryClasses.map((c: any) => c.name));
      
      const filteredActiveStudents = activeStudents.filter((s: any) => 
        (s.classId && (elementaryClassIds.has(s.classId) || elementaryClassNames.has(s.classId)))
      );

      // Filter target students for active cohort calculations
      const targetStudents = selectedClassId === 'ALL'
        ? filteredActiveStudents
        : filteredActiveStudents.filter((s: any) => s.classId === selectedClassId);

      const targetStudentIds = new Set(targetStudents.map((s: any) => s.id));

      // Helper to check if record class matches selected class
      const matchesClassFilter = (classId: string, studentId: string) => {
        if (selectedClassId === 'ALL') {
          return elementaryClassIds.has(classId) || elementaryClassNames.has(classId);
        }
        return classId === selectedClassId || targetStudentIds.has(studentId);
      };

      // 3. Fetch Attendance Records for activeAcademicYear
      const attSnap = await getDocs(
        query(collection(db, 'attendance_records'), where('academicYear', '==', activeYear))
      );
      const attendanceRecords = attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      // Filter attendance records
      const filteredAttendance = attendanceRecords.filter((rec: any) => {
        const matchesSemester = String(rec.semester) === String(activeSemester);
        const matchesDate = rec.date >= startDate && rec.date <= endDate;
        const matchesClass = matchesClassFilter(rec.classId, rec.studentId);
        return matchesSemester && matchesDate && matchesClass;
      });

      // Compute attendance rate
      let presentCount = 0;
      let totalNonEmpty = 0;
      filteredAttendance.forEach((rec: any) => {
        if (!rec.status) return;
        const statusStr = String(rec.status).toUpperCase();
        if (statusStr === 'HADIR' || statusStr === 'LATE' || statusStr === 'H' || statusStr === 'T') {
          presentCount++;
          totalNonEmpty++;
        } else if (['SAKIT', 'IZIN', 'ALPA', 'S', 'I', 'A'].includes(statusStr)) {
          totalNonEmpty++;
        }
      });
      const avgAttendance = totalNonEmpty > 0 ? Math.round((presentCount / totalNonEmpty) * 100) : null;
      const uniqueDates = new Set(filteredAttendance.map((rec: any) => rec.date));
      const schoolDaysCount = uniqueDates.size;

      // Attendance per class
      const attendancePerClass = elementaryClasses.map((cls: any) => {
        const classRecords = attendanceRecords.filter((rec: any) => {
          const matchesSemester = String(rec.semester) === String(activeSemester);
          const matchesDate = rec.date >= startDate && rec.date <= endDate;
          const matchesClass = rec.classId === cls.id || rec.classId === cls.name;
          return matchesSemester && matchesDate && matchesClass;
        });

        let clsPresent = 0;
        let clsTotal = 0;
        classRecords.forEach((rec: any) => {
          if (!rec.status) return;
          const s = String(rec.status).toUpperCase();
          if (s === 'HADIR' || s === 'LATE' || s === 'H' || s === 'T') {
            clsPresent++;
            clsTotal++;
          } else if (['SAKIT', 'IZIN', 'ALPA', 'S', 'I', 'A'].includes(s)) {
            clsTotal++;
          }
        });

        const rate = clsTotal > 0 ? Math.round((clsPresent / clsTotal) * 100) : 100;
        return {
          classId: cls.id,
          className: cls.name,
          rate
        };
      });
      attendancePerClass.sort((a, b) => b.rate - a.rate);

      // 4. Fetch Lateness Records
      const latenessSnap = await getDocs(
        query(collection(db, 'lateness_records'), where('academicYear', '==', activeYear))
      );
      const latenessRecords = latenessSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      const filteredLateness = latenessRecords.filter((rec: any) => {
        const matchesDate = rec.date >= startDate && rec.date <= endDate;
        const matchesClass = matchesClassFilter(rec.classId, rec.studentId);
        return matchesDate && matchesClass;
      });

      const tardinessCount = filteredLateness.length > 0 ? filteredLateness.length : null;
      const uniqueLateStudents = filteredLateness.length > 0 
        ? new Set(filteredLateness.map((rec: any) => rec.studentId)).size 
        : null;

      // 5. Fetch Literacy & Numeracy progress records
      const litNumSnap = await getDocs(
        query(collection(db, 'elementary_literacy_numeracy_records'), where('schoolYear', '==', activeYear))
      );
      const literacyRecords = litNumSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      const matchesLitNumSemester = (rec: any) => {
        if (rec.semester) return String(rec.semester) === String(activeSemester);
        const recSemester = rec.period === 'MAR_JUN' ? 2 : 1;
        return recSemester === activeSemester;
      };

      const filteredLitNum = literacyRecords.filter((rec: any) => {
        const matchesSem = matchesLitNumSemester(rec);
        const matchesClass = matchesClassFilter(rec.classId, rec.studentId);
        return matchesSem && matchesClass;
      });

      const assessedStudents = new Set(filteredLitNum.map((rec: any) => rec.studentId));
      const assessedStudentsCount = assessedStudents.size > 0 ? assessedStudents.size : null;

      const literacyAssessedStudents = new Set(
        filteredLitNum
          .filter((rec: any) => rec.area === 'BAHASA_INDONESIA' || rec.area === 'ENGLISH_READING' || rec.area === 'MENGAJI')
          .map((rec: any) => rec.studentId)
      );
      const literacyAssessedCount = literacyAssessedStudents.size;

      const numeracyAssessedStudents = new Set(
        filteredLitNum
          .filter((rec: any) => rec.area === 'NUMERACY')
          .map((rec: any) => rec.studentId)
      );
      const numeracyAssessedCount = numeracyAssessedStudents.size;

      // Literacy summary table per area
      const areas: ('BAHASA_INDONESIA' | 'ENGLISH_READING' | 'MENGAJI' | 'NUMERACY')[] = [
        'BAHASA_INDONESIA', 'ENGLISH_READING', 'MENGAJI', 'NUMERACY'
      ];
      const areaLabels: Record<string, string> = {
        'BAHASA_INDONESIA': 'Bahasa Indonesia',
        'ENGLISH_READING': 'English Reading',
        'MENGAJI': 'Mengaji',
        'NUMERACY': 'Numeracy'
      };

      const literacySummary = areas.map(area => {
        const areaRecords = filteredLitNum.filter((r: any) => r.area === area);
        
        // Get unique latest record per student
        const latestMap = new Map<string, any>();
        areaRecords.forEach((rec: any) => {
          const existing = latestMap.get(rec.studentId);
          if (!existing || rec.updatedAt > existing.updatedAt) {
            latestMap.set(rec.studentId, rec);
          }
        });
        const uniqueRecords = Array.from(latestMap.values());

        const assessedCount = uniqueRecords.length;
        const onTrackCount = uniqueRecords.filter((r: any) => r.supportStatus === 'ON_TRACK').length;
        const needsSupportCount = uniqueRecords.filter((r: any) => 
          ['MONITOR', 'NEEDS_SUPPORT', 'INTERVENTION_RECOMMENDED'].includes(r.supportStatus)
        ).length;

        return {
          area: areaLabels[area],
          assessedCount,
          onTrackCount,
          needsSupportCount
        };
      });

      // 6. Fetch LDSS assessments
      const ldssSnap = await getDocs(
        query(collection(db, 'ldss_assessments'), where('academicYearId', '==', activeYear))
      );
      const ldssRecords = ldssSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      const getLdssSemester = (rec: any) => {
        if (rec.semester) return Number(rec.semester);
        if (rec.periodKey === 'LDSS_2' || rec.periodKey === 'LDSS_3') return 2;
        return 1;
      };

      const filteredLdss = ldssRecords.filter((rec: any) => {
        const isCompleted = rec.status?.toUpperCase() === 'COMPLETED';
        const matchesClass = matchesClassFilter(rec.classId, rec.studentId);
        return isCompleted && matchesClass;
      });

      const filteredLdssForSemester = filteredLdss.filter((rec: any) => getLdssSemester(rec) === activeSemester);
      const ldssCompletedStudents = filteredLdssForSemester.length > 0
        ? new Set(filteredLdssForSemester.map((rec: any) => rec.studentId)).size
        : null;

      const ldssEligibleStudents = targetStudents.length;
      const ldssCompletionRate = ldssCompletedStudents !== null && ldssEligibleStudents > 0
        ? Math.round((ldssCompletedStudents / ldssEligibleStudents) * 100)
        : null;

      // LDSS Table per class
      const ldssStatusTable = elementaryClasses.map((cls: any) => {
        const classStudents = filteredActiveStudents.filter(s => s.classId === cls.id || s.classId === cls.name);
        const activeStudentsCount = classStudents.length;

        const classLdss = ldssRecords.filter((rec: any) => {
          const matchesClass = rec.classId === cls.id || rec.classNameSnapshot === cls.name;
          const isCompleted = rec.status?.toUpperCase() === 'COMPLETED';
          return matchesClass && isCompleted;
        });

        const ldss1Completed = new Set(classLdss.filter((rec: any) => rec.periodKey === 'LDSS_1').map((rec: any) => rec.studentId)).size;
        const ldss2Completed = new Set(classLdss.filter((rec: any) => rec.periodKey === 'LDSS_2').map((rec: any) => rec.studentId)).size;
        const ldss3Completed = new Set(classLdss.filter((rec: any) => rec.periodKey === 'LDSS_3').map((rec: any) => rec.studentId)).size;
        
        const classLdssForSemester = classLdss.filter((rec: any) => getLdssSemester(rec) === activeSemester);
        const totalCompleted = new Set(classLdssForSemester.map((rec: any) => rec.studentId)).size;

        return {
          classId: cls.id,
          className: cls.name,
          activeStudentsCount,
          ldss1Completed,
          ldss2Completed,
          ldss3Completed,
          totalCompleted
        };
      });

      // 7. Fetch MTSS cases
      const mtssSnap = await getDocs(
        query(collection(db, 'elementary_mtss_cases'), where('academicYear', '==', activeYear))
      );
      const mtssCases = mtssSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      const filteredMtss = mtssCases.filter((rec: any) => {
        const matchesClass = selectedClassId === 'ALL'
          ? (elementaryClassIds.has(rec.classId) || elementaryClassNames.has(rec.classId))
          : (rec.classId === selectedClassId);
        const isActive = rec.status === 'Active';
        return matchesClass && isActive;
      });

      const mtssActiveCasesCount = filteredMtss.length;
      const mtssT2Count = filteredMtss.filter((rec: any) => rec.tier === 'Tier 2').length;
      const mtssT3Count = filteredMtss.filter((rec: any) => rec.tier === 'Tier 3').length;

      const mtssSummaryList = filteredMtss.map((rec: any) => {
        const cls = elementaryClasses.find((c: any) => c.id === rec.classId || c.name === rec.classId);
        return {
          id: rec.id,
          studentName: rec.studentName,
          className: cls ? cls.name : (rec.classNameSnapshot || rec.classId || '—'),
          subject: rec.subject,
          tier: rec.tier,
          status: rec.status
        };
      });

      setData({
        avgAttendance,
        tardinessCount,
        uniqueLateStudents,
        assessedStudentsCount,
        literacyAssessedCount,
        numeracyAssessedCount,
        ldssCompletedStudents,
        ldssEligibleStudents,
        ldssCompletionRate,
        mtssActiveCasesCount,
        mtssT2Count,
        mtssT3Count,
        schoolDaysCount,
        attendancePerClass,
        literacySummary,
        ldssStatusTable,
        mtssSummaryList
      });

    } catch (err) {
      console.error("Error loading Elementary Head Dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, startDate, endDate, activeYear, activeSemester]);

  // Load and refresh whenever any filter dependency changes
  React.useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (loading || !data) {
    return (
      <div className="h-full min-h-[500px] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-medium text-slate-500">Memuat data Dashboard SD...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      {/* Header and Filter Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 tracking-tight">Dashboard Kepala SD</h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            Tahun Ajaran: {activeYear} · Semester: {activeSemester}
          </p>
        </div>
        
        {/* Dynamic Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Kelas</span>
            <select
              id="filter-kelas"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium cursor-pointer"
            >
              <option value="ALL">Semua Kelas</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tanggal Mulai</span>
            <input
              id="filter-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium cursor-pointer"
            />
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tanggal Selesai</span>
            <input
              id="filter-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Kehadiran */}
        <StatCard 
          label="Rata-rata Kehadiran" 
          value={data.avgAttendance !== null ? `${data.avgAttendance}%` : '—'}
          sub={data.avgAttendance !== null ? `Hari efektif: ${data.schoolDaysCount}` : 'Belum ada data kehadiran pada semester ini.'} 
          icon={<Users className="text-blue-600" size={20} />} 
        />
        
        {/* 2. Keterlambatan */}
        <StatCard 
          label="Keterlambatan" 
          value={data.tardinessCount !== null ? `${data.tardinessCount} catatan` : '—'}
          sub={data.tardinessCount !== null ? `${data.uniqueLateStudents} siswa tercatat terlambat` : 'Belum ada catatan keterlambatan pada filter ini.'} 
          icon={<Clock className="text-amber-600" size={20} />} 
        />

        {/* 3. Literasi & Numerasi */}
        <StatCard 
          label="Literasi & Numerasi" 
          value={data.assessedStudentsCount !== null ? `${data.assessedStudentsCount} siswa dinilai` : '—'}
          sub={data.assessedStudentsCount !== null ? `Literasi: ${data.literacyAssessedCount} · Numerasi: ${data.numeracyAssessedCount}` : 'Belum ada data literasi dan numerasi pada semester ini.'} 
          icon={<BookOpen className="text-indigo-600" size={20} />} 
        />

        {/* 4. LDSS */}
        <StatCard 
          label="LDSS" 
          value={data.ldssCompletedStudents !== null ? `${data.ldssCompletedStudents} siswa selesai` : '—'}
          sub={data.ldssCompletedStudents !== null && data.ldssEligibleStudents > 0 ? `dari ${data.ldssEligibleStudents} siswa · ${data.ldssCompletionRate}%` : 'Belum ada LDSS selesai pada semester ini.'} 
          icon={<Activity className="text-emerald-600" size={20} />} 
        />

        {/* 5. MTSS Academic */}
        <StatCard 
          label="MTSS Academic" 
          value={data.mtssActiveCasesCount !== null ? `${data.mtssActiveCasesCount} kasus aktif` : '0 kasus aktif'}
          sub={data.mtssActiveCasesCount !== null ? `Tier 2: ${data.mtssT2Count} · Tier 3: ${data.mtssT3Count}` : 'Belum ada kasus aktif.'} 
          icon={<AlertCircle className="text-rose-600" size={20} />} 
        />
      </div>

      {/* Middle Grid: Kehadiran (40%) & Literasi (60%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Kehadiran per Kelas */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
            <LayoutGrid size={16} className="text-blue-500" />
            Kehadiran per Kelas
          </h3>
          <div className="flex-1 overflow-y-auto space-y-4 min-h-[220px] max-h-[300px] pr-1">
            {data.attendancePerClass.length > 0 ? (
              data.attendancePerClass.map((c) => (
                <div 
                  key={c.classId} 
                  onClick={() => navigate(`/attendance?classId=${c.classId}`)}
                  className="space-y-1.5 cursor-pointer group"
                >
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-slate-700 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                      Kelas {c.className}
                      <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500" />
                    </span>
                    <span className={cn("text-xs font-black", c.rate < 92 ? "text-rose-600" : "text-emerald-600")}>
                      {c.rate}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${c.rate}%` }}
                      className={cn("h-full rounded-full", c.rate < 92 ? "bg-rose-500" : "bg-emerald-500")} 
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-medium italic border border-dashed border-slate-200 rounded-2xl">
                Belum ada data kehadiran kelas
              </div>
            )}
          </div>
        </div>

        {/* Literasi & Numerasi Table */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
            <BookOpen size={16} className="text-indigo-500" />
            Ringkasan Status Literasi & Numerasi
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                  <th className="pb-3 font-semibold text-slate-500">Area Asesmen</th>
                  <th className="pb-3 font-semibold text-slate-500">Jumlah Dinilai</th>
                  <th className="pb-3 font-semibold text-slate-500">On Track</th>
                  <th className="pb-3 font-semibold text-slate-500">Butuh Dukungan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {data.literacySummary.some(area => area.assessedCount > 0) ? (
                  data.literacySummary.map((row) => (
                    <tr key={row.area} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 font-bold text-slate-900">{row.area}</td>
                      <td className="py-3.5 font-medium text-slate-600">{row.assessedCount} siswa</td>
                      <td className="py-3.5 font-semibold text-emerald-600">
                        {row.assessedCount > 0 ? (
                          <>
                            {row.onTrackCount} <span className="text-[10px] font-normal text-slate-400">({Math.round((row.onTrackCount / row.assessedCount) * 100)}%)</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 font-semibold text-rose-600">
                        {row.assessedCount > 0 ? (
                          <>
                            {row.needsSupportCount} <span className="text-[10px] font-normal text-slate-400">({Math.round((row.needsSupportCount / row.assessedCount) * 100)}%)</span>
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 text-xs font-medium italic">
                      Belum ada data literasi dan numerasi pada semester ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Bottom Grid: Status LDSS (60%) & MTSS Academic Summary (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Status LDSS Table */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
            <Activity size={16} className="text-emerald-500" />
            Status Perkembangan LDSS
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                  <th className="pb-3 font-semibold text-slate-500">Kelas</th>
                  <th className="pb-3 font-semibold text-slate-500">Siswa Aktif</th>
                  <th className="pb-3 font-semibold text-slate-500 text-center">LDSS 1</th>
                  <th className="pb-3 font-semibold text-slate-500 text-center">LDSS 2</th>
                  <th className="pb-3 font-semibold text-slate-500 text-center">LDSS 3</th>
                  <th className="pb-3 font-semibold text-slate-500 text-right">Selesai Semester ini</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {data.ldssStatusTable.length > 0 ? (
                  data.ldssStatusTable.map((row) => (
                    <tr 
                      key={row.classId} 
                      onClick={() => navigate('/elementary/ldss')}
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                        Kelas {row.className}
                      </td>
                      <td className="py-3 font-medium text-slate-600">{row.activeStudentsCount} siswa</td>
                      <td className="py-3 text-center font-medium text-slate-700">
                        {row.ldss1Completed > 0 ? `${row.ldss1Completed} / ${row.activeStudentsCount}` : '—'}
                      </td>
                      <td className="py-3 text-center font-medium text-slate-700">
                        {row.ldss2Completed > 0 ? `${row.ldss2Completed} / ${row.activeStudentsCount}` : '—'}
                      </td>
                      <td className="py-3 text-center font-medium text-slate-700">
                        {row.ldss3Completed > 0 ? `${row.ldss3Completed} / ${row.activeStudentsCount}` : '—'}
                      </td>
                      <td className="py-3 text-right font-bold text-emerald-600">
                        {row.totalCompleted > 0 ? (
                          <>
                            {row.totalCompleted} <span className="text-[10px] font-normal text-slate-400">({Math.round((row.totalCompleted / row.activeStudentsCount) * 100)}%)</span>
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-medium italic">
                      Belum ada data LDSS pada semester ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MTSS Academic Summary */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
            <AlertCircle size={16} className="text-rose-500" />
            Kasus Aktif MTSS Academic
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[220px] max-h-[300px] pr-1">
            {data.mtssSummaryList.length > 0 ? (
              data.mtssSummaryList.map((rec) => (
                <div 
                  key={rec.id} 
                  onClick={() => navigate('/elementary/mtss-academic')}
                  className="p-3.5 bg-slate-50/50 hover:bg-white hover:shadow-md border border-slate-100 rounded-xl transition-all cursor-pointer group flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 group-hover:text-rose-600 transition-colors">
                      {rec.studentName}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                      <span className="text-slate-400 uppercase">Kelas {rec.className}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500">{rec.subject}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn(
                      "px-2 py-0.5 text-[9px] font-black uppercase rounded",
                      rec.tier === 'Tier 3' ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                    )}>
                      {rec.tier}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{rec.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-medium italic border border-dashed border-slate-200 rounded-2xl">
                Tidak ada kasus aktif MTSS Academic
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between space-y-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
          {label}
        </p>
        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xl font-black text-slate-950 tracking-tight">
          {value}
        </p>
        <p className="text-[10px] text-slate-500 font-semibold leading-normal">
          {sub}
        </p>
      </div>
    </div>
  );
}
