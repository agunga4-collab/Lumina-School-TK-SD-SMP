import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Clock, CheckCircle2, BookOpen, AlertCircle, 
  AlertTriangle, ShieldAlert, ArrowRight, Check, Calendar 
} from 'lucide-react';
import { 
  ElementaryClass, ElementaryStudent, AttendanceRecord, 
  LatenessRecord, LiteracyNumeracyRecord, MTSSCase, LDSSAssessment 
} from './types';

interface Props {
  todayStr: string;
  classes: ElementaryClass[];
  students: ElementaryStudent[];
  latenessRecords: LatenessRecord[];
  attendanceRecords: AttendanceRecord[];
  literacyRecords: LiteracyNumeracyRecord[];
  mtssCases: MTSSCase[];
  ldssAssessments: LDSSAssessment[];
  overdueDays: number;
  onTabChange: (tab: string) => void;
  formatDate: (val: string | number) => string;
}

export default function DailyRecapTab({
  todayStr,
  classes,
  students,
  latenessRecords,
  attendanceRecords,
  literacyRecords,
  mtssCases,
  ldssAssessments,
  overdueDays,
  onTabChange,
  formatDate
}: Props) {

  // Convert time "HH:MM" to minutes
  const timeToMinutes = (tStr: string) => {
    if (!tStr) return 0;
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
  };

  // --- CARD 1: Keterlambatan Hari Ini ---
  const todayLateness = React.useMemo(() => {
    return latenessRecords.filter(rec => rec.date === todayStr);
  }, [latenessRecords, todayStr]);

  const todayLateCount = todayLateness.length;

  const avgMinutesLateToday = React.useMemo(() => {
    if (todayLateness.length === 0) return 0;
    const totalMinutes = todayLateness.reduce((acc, rec) => {
      const arrival = timeToMinutes(rec.arrivalTime);
      const limit = timeToMinutes('07:30'); // gate time for Elementary is 07:30
      return acc + Math.max(0, arrival - limit);
    }, 0);
    return Math.round(totalMinutes / todayLateness.length);
  }, [todayLateness]);

  const recurrentLateCount = React.useMemo(() => {
    // 7 days up to today
    const last7Days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const wib = new Date(utc + (3600000 * 7) - i * 24 * 60 * 60 * 1000);
      last7Days.push(wib.toISOString().split('T')[0]);
    }
    const recs7Days = latenessRecords.filter(rec => last7Days.includes(rec.date));
    const counts: Record<string, number> = {};
    recs7Days.forEach(r => {
      if (r.studentId) counts[r.studentId] = (counts[r.studentId] || 0) + 1;
    });
    return Object.values(counts).filter(c => c > 1).length;
  }, [latenessRecords]);

  // --- CARD 2: Kehadiran Hari Ini ---
  const todayAttendance = React.useMemo(() => {
    return attendanceRecords.filter(rec => rec.date === todayStr);
  }, [attendanceRecords, todayStr]);

  const todayAttendanceStats = React.useMemo(() => {
    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let alpa = 0;
    const uniqueStudentsToday = new Set<string>();

    todayAttendance.forEach(rec => {
      if (!rec.studentId) return;
      uniqueStudentsToday.add(rec.studentId);
      const s = String(rec.status).toUpperCase();
      if (s === 'HADIR' || s === 'LATE' || s === 'H' || s === 'T') {
        hadir++;
      } else if (s === 'SAKIT' || s === 'S') {
        sakit++;
      } else if (s === 'IZIN' || s === 'I') {
        izin++;
      } else if (s === 'ALPA' || s === 'A') {
        alpa++;
      }
    });

    const activeCount = students.length;
    const denominator = Math.max(activeCount, uniqueStudentsToday.size);
    const rate = denominator > 0 ? Math.min(100, Math.round((hadir / denominator) * 100)) : 100;

    return { rate, hadir, sakit, izin, alpa };
  }, [todayAttendance, students]);

  // --- CARD 3: Literasi & Numerasi ---
  const todayPeriod = React.useMemo(() => {
    const d = new Date(todayStr);
    const m = d.getMonth();
    if (m >= 6 && m <= 9) return 'JUL_OCT';
    if (m === 10 || m === 11 || m === 0 || m === 1) return 'NOV_FEB';
    return 'MAR_JUN';
  }, [todayStr]);

  const litNumStats = React.useMemo(() => {
    const activePeriodRecs = literacyRecords.filter(rec => rec.period === todayPeriod);
    
    // Start of today in local
    const todayStartMs = new Date(todayStr).setHours(0, 0, 0, 0);
    const sevenDaysAgoMs = todayStartMs - 7 * 24 * 60 * 60 * 1000;

    const assessedToday = new Set(activePeriodRecs.filter(r => r.updatedAt >= todayStartMs).map(r => r.studentId)).size;
    const assessedThisWeek = new Set(activePeriodRecs.filter(r => r.updatedAt >= sevenDaysAgoMs).map(r => r.studentId)).size;

    // Most frequent area this week
    const areaCounts: Record<string, number> = {};
    activePeriodRecs.filter(r => r.updatedAt >= sevenDaysAgoMs).forEach(r => {
      areaCounts[r.area] = (areaCounts[r.area] || 0) + 1;
    });

    const areaLabels: Record<string, string> = {
      'BAHASA_INDONESIA': 'B. Indonesia',
      'ENGLISH_READING': 'Eng Reading',
      'MENGAJI': 'Mengaji',
      'NUMERACY': 'Numeracy'
    };

    let mostFrequentArea = '—';
    let maxCount = 0;
    Object.entries(areaCounts).forEach(([area, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentArea = areaLabels[area] || area;
      }
    });

    return { assessedToday, assessedThisWeek, mostFrequentArea };
  }, [literacyRecords, todayPeriod, todayStr]);

  // --- CARD 4: MTSS Academic ---
  const mtssStats = React.useMemo(() => {
    const activeCases = mtssCases;
    const today = new Date(todayStr);
    const startOfMonthMs = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    
    const newCasesCount = activeCases.filter(c => c.createdAt >= startOfMonthMs).length;

    const openCases = activeCases.filter(c => c.status === 'Active');
    const closedCases = activeCases.filter(c => c.status === 'Achieved');

    const overdueThresholdMs = overdueDays * 24 * 60 * 60 * 1000;
    const overdueCases = openCases.filter(c => {
      const lastUpdate = c.updatedAt || c.createdAt || 0;
      return Date.now() - lastUpdate > overdueThresholdMs;
    });

    return {
      newCasesCount,
      overdueCount: overdueCases.length,
      openCount: openCases.length,
      closedCount: closedCases.length,
      overdueCases
    };
  }, [mtssCases, todayStr, overdueDays]);

  // --- SECTION PERHATIAN: OVERDUE CASESS ---
  const overdueLDSS = React.useMemo(() => {
    const overdueThresholdMs = overdueDays * 24 * 60 * 60 * 1000;
    return ldssAssessments.filter(rec => {
      const isCompleted = rec.status?.toUpperCase() === 'COMPLETED';
      if (isCompleted) return false;
      const lastUpdate = rec.updatedAt || rec.createdAt || 0;
      return Date.now() - lastUpdate > overdueThresholdMs;
    });
  }, [ldssAssessments, overdueDays]);

  const overdueList = React.useMemo(() => {
    const list: any[] = [];
    mtssStats.overdueCases.forEach(c => {
      list.push({
        id: c.id,
        studentName: c.studentName,
        className: classes.find(cl => cl.id === c.classId || cl.name === c.classId)?.name || '—',
        type: `MTSS Academic: ${c.subject}`,
        info: `Tier: ${c.tier}`,
        lastUpdated: c.updatedAt || c.createdAt,
        daysOverdue: Math.floor((Date.now() - (c.updatedAt || c.createdAt)) / (24 * 60 * 60 * 1000)),
        link: 'mtss_academic'
      });
    });
    overdueLDSS.forEach(rec => {
      list.push({
        id: rec.id,
        studentName: rec.studentName,
        className: rec.classNameSnapshot || classes.find(cl => cl.id === rec.classId)?.name || '—',
        type: `LDSS: ${rec.periodKey || 'Asesmen'}`,
        info: `Status: ${rec.status || 'DRAFT'}`,
        lastUpdated: rec.updatedAt || rec.createdAt,
        daysOverdue: Math.floor((Date.now() - (rec.updatedAt || rec.createdAt)) / (24 * 60 * 60 * 1000)),
        link: 'ldss'
      });
    });
    return list.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [mtssStats.overdueCases, overdueLDSS, classes]);

  // --- SECTION KELENGKAPAN ---
  const uncompletedClasses = React.useMemo(() => {
    return classes.map(cls => {
      const clsStudents = students.filter(s => s.classId === cls.id || s.className === cls.name);
      const recsToday = todayAttendance.filter(rec => rec.classId === cls.id || rec.classId === cls.name);
      const isCompleted = clsStudents.length === 0 || recsToday.length >= clsStudents.length;
      return {
        ...cls,
        totalStudents: clsStudents.length,
        recsTodayCount: recsToday.length,
        isCompleted
      };
    }).filter(c => !c.isCompleted);
  }, [classes, students, todayAttendance]);

  return (
    <div className="space-y-6">
      {/* 4 KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Lateness */}
        <div 
          onClick={() => onTabChange('keterlambatan')}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition cursor-pointer group"
          id="kpi-lateness"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
              Real-time
            </span>
            <Clock className="w-5 h-5 text-slate-400 group-hover:text-amber-500 transition" />
          </div>
          <h3 className="text-sm font-medium text-slate-500">Terlambat Hari Ini</h3>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-slate-900">{todayLateCount}</span>
            <span className="text-sm text-slate-400">Siswa</span>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-3 flex flex-col gap-1 text-xs text-slate-500">
            <div>Rata-rata: <strong className="text-slate-800">{avgMinutesLateToday} menit</strong></div>
            <div>Berulang (7 hari): <strong className="text-slate-800">{recurrentLateCount} siswa</strong></div>
          </div>
        </div>

        {/* Card 2: Attendance */}
        <div 
          onClick={() => onTabChange('kehadiran')}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition cursor-pointer group"
          id="kpi-attendance"
        >
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${uncompletedClasses.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {uncompletedClasses.length > 0 ? '⚠️ Roster Parsial' : '✓ Lengkap'}
            </span>
            <CheckCircle2 className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition" />
          </div>
          <h3 className="text-sm font-medium text-slate-500">Persentase Kehadiran</h3>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-slate-900">{todayAttendanceStats.rate}%</span>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-3 flex items-center justify-between text-xs text-slate-500">
            <span>Sakit: <strong className="text-slate-800">{todayAttendanceStats.sakit}</strong></span>
            <span>Izin: <strong className="text-slate-800">{todayAttendanceStats.izin}</strong></span>
            <span>Alpa: <strong className="text-slate-800">{todayAttendanceStats.alpa}</strong></span>
          </div>
        </div>

        {/* Card 3: LitNum */}
        <div 
          onClick={() => onTabChange('literasi_numerasi')}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition cursor-pointer group"
          id="kpi-litnum"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
              Periode {todayPeriod === 'JUL_OCT' ? 'P1' : todayPeriod === 'NOV_FEB' ? 'P2' : 'P3'}
            </span>
            <BookOpen className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition" />
          </div>
          <h3 className="text-sm font-medium text-slate-500">Asesmen LitNum (WIB)</h3>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-slate-900">{litNumStats.assessedThisWeek}</span>
            <span className="text-sm text-slate-400">Minggu ini</span>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-3 flex flex-col gap-1 text-xs text-slate-500">
            <div>Hari ini: <strong className="text-slate-800">{litNumStats.assessedToday} dinilai</strong></div>
            <div className="truncate">Top Area: <strong className="text-slate-800">{litNumStats.mostFrequentArea}</strong></div>
          </div>
        </div>

        {/* Card 4: MTSS Academic */}
        <div 
          onClick={() => onTabChange('mtss_academic')}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition cursor-pointer group"
          id="kpi-mtss"
        >
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${mtssStats.overdueCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
              {mtssStats.overdueCount > 0 ? '⚠️ Overdue' : '✓ Terpantau'}
            </span>
            <AlertCircle className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition" />
          </div>
          <h3 className="text-sm font-medium text-slate-500">MTSS Kasus Baru</h3>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-slate-900">{mtssStats.newCasesCount}</span>
            <span className="text-sm text-slate-400">Bulan ini</span>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-3 flex flex-col gap-1 text-xs text-slate-500">
            <div>Butuh Follow-up: <strong className="text-rose-600 font-semibold">{mtssStats.overdueCount} kasus</strong></div>
            <div>Status Kasus: <strong className="text-slate-800">Aktif: {mtssStats.openCount} · Lulus: {mtssStats.closedCount}</strong></div>
          </div>
        </div>
      </div>

      {/* Grid: Attention & Submission Completeness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section Perhatian */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              Perhatian & Overdue Follow-up
            </h3>
            <span className="text-xs text-slate-400">Ambang batas: {overdueDays} hari</span>
          </div>

          {overdueList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <Check className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-700">Semua penanganan terpantau aktif dan tepat waktu.</p>
              <p className="text-xs text-slate-400 mt-1">Tidak ada kasus yang terlewat dari ambang batas update.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {overdueList.map((item, idx) => (
                <div 
                  key={idx} 
                  onClick={() => onTabChange(item.link)}
                  className="p-3 border border-slate-100 hover:border-rose-200 hover:bg-rose-50/10 rounded-lg flex items-start justify-between cursor-pointer transition group"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800 text-sm group-hover:text-rose-700 transition">{item.studentName}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">Kelas {item.className}</span>
                      <span>•</span>
                      <span>{item.type}</span>
                    </div>
                    <p className="text-xs text-slate-400">{item.info} · Terakhir diperbarui {formatDate(item.lastUpdated)}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-rose-50 text-rose-600 font-bold text-[10px] px-2 py-0.5 rounded-full border border-rose-100">
                      +{item.daysOverdue} hari tanpa update
                    </span>
                    <div className="text-[10px] text-rose-400 group-hover:translate-x-1 transition flex items-center gap-0.5 mt-2 justify-end">
                      Detail <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section Kelengkapan Absensi */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Kelengkapan Absensi Hari Ini
            </h3>
            <span className="text-xs text-slate-500">
              {classes.length - uncompletedClasses.length} dari {classes.length} Kelas Mengirim
            </span>
          </div>

          {uncompletedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <Check className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-700">Lengkap! Semua kelas telah mengirim absensi.</p>
              <p className="text-xs text-slate-400 mt-1">Data kehadiran terhimpun 100% untuk hari ini.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {uncompletedClasses.map((cls, idx) => (
                <div 
                  key={idx}
                  className="p-3 border border-slate-100 rounded-lg flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-800 text-sm">Kelas {cls.name}</p>
                    <p className="text-xs text-slate-400">Homeroom: {cls.homeroomTeacherName || '—'}</p>
                    <p className="text-[10px] text-slate-500">Terbaca: {cls.recsTodayCount} / {cls.totalStudents} siswa</p>
                  </div>
                  <div>
                    <span className="bg-rose-50 text-rose-600 border border-rose-100 text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1 shadow-sm">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Belum Kirim
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
