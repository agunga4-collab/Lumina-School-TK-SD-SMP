import * as React from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend as RechartsLegend
} from 'recharts';
import { 
  Users, Heart, Palette, Star, AlertCircle, 
  Calendar, Bell, TrendingUp, Activity, Sparkles, 
  Smile, Frown, Meh, Angry, BarChart3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DEFAULT_STUDENTS, getStoredStudents, saveStoredStudents } from '../../lib/kindergartenWeeklyReport';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getKindergartenStudents } from '../../lib/kindergartenMetadataCache';

export default function KindergartenHeadDashboard() {
  const { activeYear } = useAcademicYear();
  const [students, setStudents] = React.useState<any[]>(() => DEFAULT_STUDENTS);
  const [attendanceDocs, setAttendanceDocs] = React.useState<any[]>([]);
  const [observationDocs, setObservationDocs] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  // Load dynamic student list from cache/Firestore
  React.useEffect(() => {
    async function loadKindergartenData() {
      try {
        const fetchedStudents = await getKindergartenStudents(activeYear || '2025/2026');
        if (fetchedStudents && fetchedStudents.length > 0) {
          setStudents(fetchedStudents);
          saveStoredStudents(fetchedStudents);
        } else {
          const local = getStoredStudents();
          if (local && local.length > 0) {
            setStudents(local);
          }
        }
      } catch (err) {
        console.error('Error loading Kindergarten students from Firestore:', err);
      }
    }
    loadKindergartenData();
  }, [activeYear]);

  // Period filter states
  const [periodType, setPeriodType] = React.useState<'monthly' | 'semester' | 'yearly' | 'custom'>('monthly');
  const [selectedMonth, setSelectedMonth] = React.useState<number>(() => new Date().getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = React.useState<string>('2026');
  const [selectedSemester, setSelectedSemester] = React.useState<'1' | '2'>('2');
  const [customStartDate, setCustomStartDate] = React.useState<string>('2026-01-01');
  const [customEndDate, setCustomEndDate] = React.useState<string>('2026-06-30');

  // Compute start/end date range for Firestore query
  const dateRange = React.useMemo(() => {
    let start = '';
    let end = '';
    if (periodType === 'monthly') {
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      start = `${selectedYear}-${monthStr}-01`;
      end = `${selectedYear}-${monthStr}-31`;
    } else if (periodType === 'semester') {
      if (selectedSemester === '1') {
        start = `${selectedYear}-07-01`;
        end = `${selectedYear}-12-31`;
      } else {
        start = `${selectedYear}-01-01`;
        end = `${selectedYear}-06-30`;
      }
    } else if (periodType === 'yearly') {
      start = `${selectedYear}-01-01`;
      end = `${selectedYear}-12-31`;
    } else if (periodType === 'custom') {
      start = customStartDate;
      end = customEndDate;
    }
    return { start, end };
  }, [periodType, selectedMonth, selectedYear, selectedSemester, customStartDate, customEndDate]);

  // Fetch from Firestore when date range changes
  React.useEffect(() => {
    let active = true;
    async function fetchData() {
      setIsLoading(true);
      try {
        const { start, end } = dateRange;
        
        // 1. Fetch attendance
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where('date', '>=', start),
          where('date', '<=', end)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const attDocs = attendanceSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        // 2. Fetch observations
        const observationsQuery = query(
          collection(db, 'observations'),
          where('date', '>=', start),
          where('date', '<=', end)
        );
        const observationsSnap = await getDocs(observationsQuery);
        const obsDocs = observationsSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        if (active) {
          setAttendanceDocs(attDocs);
          setObservationDocs(obsDocs);
        }
      } catch (err) {
        console.error('Error fetching HeadDashboard data from Firestore:', err);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }
    fetchData();
    return () => {
      active = false;
    };
  }, [dateRange]);

  const isChecklistDateInPeriod = React.useCallback((dateStr: string) => {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return false;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-11
    
    if (periodType === 'monthly') {
      return year === parseInt(selectedYear, 10) && month === selectedMonth;
    } else if (periodType === 'semester') {
      if (year !== parseInt(selectedYear, 10)) return false;
      return selectedSemester === '1' ? (month >= 6 && month <= 11) : (month >= 0 && month <= 5);
    } else if (periodType === 'yearly') {
      return year === parseInt(selectedYear, 10);
    } else if (periodType === 'custom') {
      return dateStr >= customStartDate && dateStr <= customEndDate;
    }
    return true;
  }, [periodType, selectedMonth, selectedYear, selectedSemester, customStartDate, customEndDate]);

  const mapFirestoreEmotionToSystem = (emotionStr: string): { attendance: string | null; emotion: string | null } => {
    const s = emotionStr || 'ok';
    switch (s) {
      case 'happy':
        return { attendance: 'PRESENT', emotion: 'HAPPY' };
      case 'sad':
        return { attendance: 'PRESENT', emotion: 'SAD' };
      case 'ok':
        return { attendance: 'PRESENT', emotion: 'OK' };
      case 'angry':
        return { attendance: 'PRESENT', emotion: 'ANGRY' };
      case 'noNews':
        return { attendance: 'NO_NEWS', emotion: null };
      case 'sick':
        return { attendance: 'SICK', emotion: null };
      case 'izin':
        return { attendance: 'PERMISSION', emotion: null };
      default:
        return { attendance: 'PRESENT', emotion: 'OK' };
    }
  };

  const stats = React.useMemo(() => {
    // 1. Process merged checklists
    const recordsByDate: Record<string, Record<string, { attendance: string | null; emotion: string | null }>> = {};

    // First load from localStorage to preserve any local edits
    const savedChecklist = localStorage.getItem('kg_checklist_records');
    if (savedChecklist) {
      try {
        const parsed = JSON.parse(savedChecklist);
        Object.entries(parsed).forEach(([dateStr, studentMap]: [string, any]) => {
          recordsByDate[dateStr] = { ...studentMap };
        });
      } catch (e) {
        console.error(e);
      }
    }

    // Then merge Firestore attendance records (Firestore is the source of truth, so we overwrite or merge)
    attendanceDocs.forEach(docData => {
      const dateStr = docData.date;
      if (!dateStr) return;
      if (!recordsByDate[dateStr]) {
        recordsByDate[dateStr] = {};
      }
      const studentsList = docData.students || [];
      studentsList.forEach((s: any) => {
        if (s.studentId) {
          recordsByDate[dateStr][s.studentId] = mapFirestoreEmotionToSystem(s.emotion);
        }
      });
    });

    let totalChecklistSlots = 0;
    let presentCount = 0;
    let happyCount = 0;
    let okCount = 0;
    let sadCount = 0;
    let angryCount = 0;

    const alertMap: Record<string, { studentId: string; name: string; reasons: string[]; lastSeen: string }> = {};

    // Get sorted checklist dates inside period for alerts
    const activeDatesInPeriod = Object.keys(recordsByDate)
      .filter(isChecklistDateInPeriod)
      .sort((a, b) => b.localeCompare(a));
      
    const latestDates = activeDatesInPeriod.slice(0, 5); // check last 5 active checklist days

    Object.entries(recordsByDate).forEach(([dateStr, studentMap]: [string, any]) => {
      if (!isChecklistDateInPeriod(dateStr)) return;
      Object.entries(studentMap).forEach(([studentId, status]: [string, any]) => {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        totalChecklistSlots++;
        if (status.attendance === 'PRESENT') {
          presentCount++;
          if (status.emotion === 'HAPPY') {
            happyCount++;
          } else if (status.emotion === 'OK') {
            okCount++;
          } else if (status.emotion === 'SAD') {
            sadCount++;
            if (latestDates.includes(dateStr)) {
              if (!alertMap[studentId]) {
                alertMap[studentId] = { studentId, name: student.name, reasons: [], lastSeen: dateStr };
              }
              alertMap[studentId].reasons.push(`Kurang bersemangat (Sedih) pada ${dateStr}`);
            }
          } else if (status.emotion === 'ANGRY') {
            angryCount++;
            if (latestDates.includes(dateStr)) {
              if (!alertMap[studentId]) {
                alertMap[studentId] = { studentId, name: student.name, reasons: [], lastSeen: dateStr };
              }
              alertMap[studentId].reasons.push(`Tampak marah / kesal pada ${dateStr}`);
            }
          }
        } else if (status.attendance && ['SICK', 'PERMISSION', 'NO_NEWS'].includes(status.attendance)) {
          if (latestDates.includes(dateStr)) {
            if (!alertMap[studentId]) {
              alertMap[studentId] = { studentId, name: student.name, reasons: [], lastSeen: dateStr };
            }
            const statusLabel = status.attendance === 'SICK' ? 'Sakit' : status.attendance === 'PERMISSION' ? 'Izin' : 'Tanpa Kabar';
            alertMap[studentId].reasons.push(`Absen (${statusLabel}) pada ${dateStr}`);
          }
        }
      });
    });

    const attendanceRate = totalChecklistSlots > 0 ? Math.round((presentCount / totalChecklistSlots) * 100) : 0;
    const totalPresentWithEmotions = happyCount + okCount + sadCount + angryCount;
    const happinessIndex = totalPresentWithEmotions > 0 ? Math.round(((happyCount + okCount) / totalPresentWithEmotions) * 100) : 0;

    // 2. Process observations
    let totalGradingsCount = 0;
    let bshOrBsbCount = 0;
    let totalSentraSessions = 0;
    
    const domainSummary: Record<string, { total: number; bshBsb: number }> = {
      AGAMA_BUDI_PEKERTI: { total: 0, bshBsb: 0 },
      SOSIAL_EMOSIONAL: { total: 0, bshBsb: 0 },
      BAHASA: { total: 0, bshBsb: 0 },
      KOGNITIF: { total: 0, bshBsb: 0 },
      FISIK_MOTORIK: { total: 0, bshBsb: 0 },
      SENI: { total: 0, bshBsb: 0 }
    };

    const sentraCounts: Record<string, number> = {};

    // Merge Firestore and LocalStorage observations
    const observationsMap = new Map<string, any>();

    // A. Add Firestore observations
    observationDocs.forEach(docData => {
      if (docData.activity && docData.domain && docData.date) {
        const key = `${docData.activity}_${docData.domain}_${docData.date}`;
        observationsMap.set(key, {
          activity: docData.activity,
          domain: docData.domain,
          date: docData.date,
          observations: docData.observations || {},
          timestamp: docData.timestamp || Date.now()
        });
      }
    });

    // B. Add LocalStorage observations
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_obs_hist_')) {
        try {
          const payload = JSON.parse(localStorage.getItem(key) || '{}');
          if (payload && payload.observations) {
            const activity = payload.selectedActivity || payload.activity;
            const domain = payload.selectedDomain || payload.domain;
            let dateStr = payload.date;
            if (!dateStr && payload.timestamp) {
              const d = new Date(payload.timestamp);
              const yr = d.getFullYear();
              const mo = String(d.getMonth() + 1).padStart(2, '0');
              const da = String(d.getDate()).padStart(2, '0');
              dateStr = `${yr}-${mo}-${da}`;
            }
            if (activity && domain && dateStr) {
              const comboKey = `${activity}_${domain}_${dateStr}`;
              const existing = observationsMap.get(comboKey);
              if (!existing || (payload.timestamp && payload.timestamp > (existing.timestamp || 0))) {
                observationsMap.set(comboKey, {
                  activity,
                  domain,
                  date: dateStr,
                  observations: payload.observations,
                  timestamp: payload.timestamp || Date.now()
                });
              }
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    observationsMap.forEach((session) => {
      if (!isChecklistDateInPeriod(session.date)) return;
      
      totalSentraSessions++;
      const domain = session.domain || '';
      const activity = session.activity || 'Lainnya';
      sentraCounts[activity] = (sentraCounts[activity] || 0) + 1;
      
      Object.values(session.observations).forEach((obs: any) => {
        if (obs && obs.grading && obs.grading !== 'ABSENT' && obs.grading !== 'NOT_PARTICIPATING') {
          totalGradingsCount++;
          const isGood = obs.grading === 'BSH' || obs.grading === 'BSB';
          if (isGood) {
            bshOrBsbCount++;
          }

          if (domainSummary[domain]) {
            domainSummary[domain].total++;
            if (isGood) {
              domainSummary[domain].bshBsb++;
            }
          }
        }
      });
    });

    const progressRate = totalGradingsCount > 0 ? Math.round((bshOrBsbCount / totalGradingsCount) * 100) : 0;

    // Build emotional distribution database
    const totalEmotionRecorded = happyCount + okCount + sadCount + angryCount;
    const emotionChartData = [
      { name: 'Happy', value: happyCount, percent: totalEmotionRecorded > 0 ? Math.round((happyCount / totalEmotionRecorded) * 100) : 0, color: '#10b981' }, // emerald
      { name: 'OK', value: okCount, percent: totalEmotionRecorded > 0 ? Math.round((okCount / totalEmotionRecorded) * 100) : 0, color: '#f59e0b' },    // amber
      { name: 'Sad', value: sadCount, percent: totalEmotionRecorded > 0 ? Math.round((sadCount / totalEmotionRecorded) * 100) : 0, color: '#3b82f6' },   // blue
      { name: 'Angry', value: angryCount, percent: totalEmotionRecorded > 0 ? Math.round((angryCount / totalEmotionRecorded) * 100) : 0, color: '#ef4444' } // red
    ].filter(item => item.value > 0);

    const displayEmotionsList = totalEmotionRecorded > 0 
      ? [
          { name: 'Happy', value: happyCount, percent: Math.round((happyCount / totalEmotionRecorded) * 100) },
          { name: 'OK', value: okCount, percent: Math.round((okCount / totalEmotionRecorded) * 100) },
          { name: 'Sad', value: sadCount, percent: Math.round((sadCount / totalEmotionRecorded) * 100) },
          { name: 'Angry', value: angryCount, percent: Math.round((angryCount / totalEmotionRecorded) * 100) }
        ]
      : [
          { name: 'Happy', value: 0, percent: 0 },
          { name: 'OK', value: 0, percent: 0 },
          { name: 'Sad', value: 0, percent: 0 },
          { name: 'Angry', value: 0, percent: 0 }
        ];

    // Build domain level details
    const domainLabels: Record<string, string> = {
      AGAMA_BUDI_PEKERTI: 'Agama',
      SOSIAL_EMOSIONAL: 'SEL',
      BAHASA: 'Bahasa',
      KOGNITIF: 'Kognitif',
      FISIK_MOTORIK: 'Motorik',
      SENI: 'Seni'
    };

    const domainChartData = Object.entries(domainSummary).map(([domainId, counts]) => {
      const pct = counts.total > 0 ? Math.round((counts.bshBsb / counts.total) * 100) : 0;
      return {
        name: domainLabels[domainId] || domainId,
        progres: pct,
        total: counts.total
      };
    });

    const activeAlerts = Object.values(alertMap).map(a => ({
      ...a,
      reasons: Array.from(new Set(a.reasons))
    }));

    // Find custom top Sentra activity
    let topSentraName = 'Belum Ada';
    let topSentraCount = 0;
    Object.entries(sentraCounts).forEach(([name, count]) => {
      if (count > topSentraCount) {
        topSentraCount = count;
        topSentraName = name;
      }
    });

    return {
      attendanceRate,
      happinessIndex,
      progressRate,
      currSentraCount: totalSentraSessions,
      emotionChartData,
      domainChartData,
      alerts: activeAlerts,
      topSentraName,
      topSentraCount,
      hasChecklistData: totalChecklistSlots > 0,
      hasObservationData: totalGradingsCount > 0,
      displayEmotionsList
    };
  }, [
    attendanceDocs, observationDocs, students,
    periodType, selectedMonth, selectedYear, selectedSemester, customStartDate, customEndDate,
    isChecklistDateInPeriod
  ]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
           <span className="text-[10px] font-black tracking-widest uppercase text-emerald-800">Unit Lumina Kindergarten</span>
           <h1 className="text-2xl font-black text-gray-900 tracking-tight italic">Dashboard Kepala TK</h1>
           <p className="text-gray-500 font-medium tracking-tight text-xs">Akses Monitoring Statistik Kehadiran, Emosi, dan Progres Domain Real-Time</p>
        </div>
        <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-gray-100 items-center gap-2">
           {isLoading && (
             <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-black uppercase tracking-widest px-2 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Sinkronisasi...
             </div>
           )}
           <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100">
              <Calendar size={14} />
              {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date())}
           </div>
        </div>
      </header>

      {/* Dynamic Period Filter Selector Panel */}
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-emerald-100/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-150/40 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
               <Calendar size={18} />
            </div>
            <div>
               <h2 className="text-xs font-black text-emerald-950 uppercase tracking-wide">Pilih Periode Analisis</h2>
               <p className="text-[10px] text-gray-500 font-medium leading-none mt-0.5">Saring statistik kehadiran, emosi, dan capaian perkembangan secara dinamis</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'monthly', label: '🗓️ Bulanan' },
              { id: 'semester', label: '🏫 Semesteran' },
              { id: 'yearly', label: '📅 Tahunan' },
              { id: 'custom', label: '✏️ Kustom' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodType(p.id as any)}
                className={cn(
                  "px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer border",
                  periodType === p.id 
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-50" 
                    : "bg-gray-50 hover:bg-gray-100 text-gray-650 border-gray-100 hover:text-gray-900"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1 select-none">
          {/* Sub-inputs dependent on selected periodType */}
          {periodType === 'monthly' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Pilih Bulan:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-xs font-extrabold text-emerald-800 outline-none cursor-pointer"
                >
                  {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Tahun:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-xs font-extrabold text-emerald-800 outline-none cursor-pointer"
                >
                  {['2025', '2026', '2027', '2028', '2029'].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {periodType === 'semester' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Pilih Semester:</span>
                <select
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value as any)}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-xs font-extrabold text-emerald-800 outline-none cursor-pointer"
                >
                  <option value="1">Semester 1 (Ganjil: Juli - Desember)</option>
                  <option value="2">Semester 2 (Genap: Januari - Juni)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Tahun:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-xs font-extrabold text-emerald-800 outline-none cursor-pointer"
                >
                  {['2025', '2026', '2027', '2028', '2029'].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {periodType === 'yearly' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">Pilih Tahun:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-xs font-extrabold text-emerald-800 outline-none cursor-pointer"
              >
                {['2025', '2026', '2027', '2028', '2029'].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {periodType === 'custom' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Mulai Tanggal:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-xs font-extrabold text-emerald-800 outline-none cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Sampai Tanggal:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-xs font-extrabold text-emerald-800 outline-none cursor-pointer"
                />
              </div>
            </div>
          )}

          <div className="ml-auto text-emerald-800 bg-emerald-50/60 border border-emerald-100 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">
             Penyaringan {periodType === 'monthly' ? `Bulanan (${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][selectedMonth]} ${selectedYear})` : periodType === 'semester' ? `Semester ${selectedSemester} (${selectedYear})` : periodType === 'yearly' ? `Tahunan (${selectedYear})` : 'Kustom'} ✨
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard 
          label="Kehadiran Siswa" 
          value={stats.hasChecklistData ? `${stats.attendanceRate}%` : "0%"} 
          detail={stats.hasChecklistData ? "Berdasarkan checklist aktif" : "Belum diisi guru"} 
          icon={<Users className="text-blue-500" />} 
        />
        <StatCard 
          label="Well-being Index" 
          value={stats.hasChecklistData ? `${stats.happinessIndex}%` : "0%"} 
          detail={stats.hasChecklistData ? "Status perasaan gembira/OK" : "Tidak ada emosi masuk"} 
          icon={<Heart className="text-rose-500" />} 
        />
        <StatCard 
          label="Progres BSH / BSB" 
          value={stats.hasObservationData ? `${stats.progressRate}%` : "0%"} 
          detail={stats.hasObservationData ? "Target tuntas tercapai" : "Belum ada observasi"} 
          icon={<Star className="text-amber-500" />} 
        />
        <StatCard 
          label="Sesi Sentra Aktif" 
          value={String(stats.currSentraCount)} 
          detail={stats.currSentraCount > 0 ? `Sentra teraktif: ${stats.topSentraName}` : "Belum ada evaluasi"} 
          icon={<Palette className="text-purple-500" />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Emotional Distribution */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6 flex flex-col justify-between">
           <div className="space-y-4">
             <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4 text-xs tracking-wider uppercase">
                <Activity size={16} className="text-emerald-500" />
                Distribusi Emosi Anak
             </h3>
             {stats.hasChecklistData ? (
                <div className="h-48 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.emotionChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {stats.emotionChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value, name, props) => [`Jumlah: ${value} (${props.payload.percent}%)`, name]}
                        contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-xs text-gray-400 font-bold uppercase tracking-widest text-[9px]">Well-being Index</span>
                     <span className="text-xl font-black text-emerald-600">{stats.happinessIndex}%</span>
                  </div>
                </div>
             ) : (
                <div className="h-48 flex flex-col items-center justify-center border border-dashed border-gray-100 rounded-3xl">
                   <Activity className="text-gray-200 mb-2" size={36} />
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Belum Ada Pengisian Hari Ini</p>
                </div>
             )}
           </div>

           <div className="grid grid-cols-2 gap-3 pt-2">
              {stats.displayEmotionsList.map(item => (
                <div key={item.name} className={cn(
                  "flex items-center gap-2 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100",
                  !stats.hasChecklistData && "opacity-45"
                )}>
                   {getEmotionIcon(item.name)}
                   <div className="flex flex-col min-w-0">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate">{item.name}</span>
                      <span className="text-xs font-black text-gray-900 leading-tight">{item.percent}%</span>
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* Domain Distribution */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6 flex flex-col justify-between">
           <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4 text-xs uppercase tracking-wider">
              <TrendingUp size={16} className="text-emerald-500" />
              Progres Capaian BSH/BSB per Domain (%)
           </h3>
           
           {stats.hasObservationData ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.domainChartData}
                    margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      formatter={(value) => [`Tuntas BSH/BSB: ${value}%`]}
                      contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }} 
                    />
                    <Bar dataKey="progres" fill="#10b981" radius={[8, 8, 0, 0]} barSize={28}>
                      {stats.domainChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.progres > 70 ? '#10b981' : entry.progres > 40 ? '#f59e0b' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
           ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-gray-150 rounded-[2.5rem] py-12">
                 <TrendingUp className="text-gray-200 mb-2" size={48} />
                 <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum Ada Progres Domain</p>
                 <span className="text-[10px] text-gray-400 italic font-medium mt-1">Tambahkan evaluasi grading di menu Observation Data</span>
              </div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Child Highlights (Contextual alert feed from real records) */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6">
           <div className="flex justify-between items-center bg-amber-50 p-4 rounded-2xl border border-amber-100">
              <h3 className="font-bold text-amber-900 flex items-center gap-2 text-xs uppercase tracking-wider">
                 <Bell size={14} />
                 Anak Butuh Perhatian Guru & Orangtua
              </h3>
              <Sparkles size={14} className="text-amber-500" />
           </div>

           <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {stats.alerts.length > 0 ? (
                stats.alerts.map((alt, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-red-50/40 p-3 rounded-xl border border-red-100/60 leading-tight">
                    <div className="p-1 rounded-lg bg-red-100 text-red-700 font-black text-[10px] mt-0.5">ALERT</div>
                    <div className="space-y-1">
                      <div className="font-extrabold text-xs text-gray-900 uppercase">{alt.name}</div>
                      <div className="text-[11px] text-gray-600 font-medium space-y-0.5">
                        {alt.reasons.map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 list-disc">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center border border-dashed border-gray-150 rounded-3xl opacity-80">
                   <Smile size={32} className="text-emerald-500 mb-2" />
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Seluruh Anak Terpantau Sehat & Bahagia ✨</p>
                   <span className="text-[9px] text-gray-400 italic text-center px-4 mt-0.5">Tidak ada laporan sakit atau mood negatif akhir-akhir ini</span>
                </div>
              )}
           </div>
        </div>

        {/* Sentra Activity Highlights */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-100/40 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
           <div className="absolute top-0 right-0 p-10 opacity-10">
              <BarChart3 size={120} />
           </div>
           
           <div className="space-y-4 relative z-10 w-full">
              <h3 className="font-bold text-[10px] bg-white/20 w-fit px-3 py-1 rounded-full uppercase tracking-widest">Rekap Sentra Mingguan</h3>
              {stats.hasObservationData ? (
                <div className="space-y-2 py-4 border-l border-white/20 pl-4 border-dashed rounded-none my-2">
                   <div className="text-xl font-black">{stats.currSentraCount} Sesi Guru Terdaftar</div>
                   <p className="text-xs text-emerald-100/90 font-medium leading-relaxed">
                     Sesi terbanyak berada pada sentra <span className="font-bold text-white underline">{stats.topSentraName}</span> (dengan jumlah {stats.topSentraCount} sesi evaluasi). Kelompok bermain aktif mengobservasi tumbuh kembang anak secara multi-domain.
                   </p>
                </div>
              ) : (
                <div className="space-y-1 py-8 border border-white/10 border-dashed rounded-2xl text-center">
                   <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest">Belum Ada Sesi Pembelajaran Terbuka</p>
                </div>
              )}
           </div>

           <div className="relative z-10 pt-2">
              <div className="text-[9px] text-emerald-100 opacity-70 font-bold uppercase tracking-widest italic">
                Unit Pengawas Mutu Lumina Kindergarten
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 space-y-4 hover:shadow-md transition-shadow">
       <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-gray-50 rounded-2xl flex items-center justify-center shadow-inner border border-white">
             {icon}
          </div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{label}</p>
       </div>
       <div>
          <p className="text-2xl font-black text-gray-900 tracking-tighter leading-none">{value}</p>
          <p className="text-[9.5px] text-gray-500 font-bold italic opacity-80 mt-1.5 truncate">{detail}</p>
       </div>
    </div>
  );
}

function getEmotionIcon(name: string) {
   switch(name) {
      case 'Happy': return <Smile size={16} className="text-[#10b981]" />;
      case 'OK': return <Meh size={16} className="text-[#f59e0b]" />;
      case 'Sad': return <Frown size={16} className="text-[#3b82f6]" />;
      case 'Angry': return <Angry size={16} className="text-[#ef4444]" />;
      default: return null;
   }
}
