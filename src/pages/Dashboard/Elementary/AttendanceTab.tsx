import * as React from 'react';
import { Search, ChevronLeft, ChevronRight, Users, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { AttendanceRecord, ElementaryClass, ElementaryStudent } from './types';

interface Props {
  filteredAttendance: AttendanceRecord[];
  classes: ElementaryClass[];
  students: ElementaryStudent[];
  selectedSemester: number;
  startDate: string;
  endDate: string;
  attendanceRecords: AttendanceRecord[];
  onClassSelect?: (classId: string) => void;
}

export default function AttendanceTab({
  filteredAttendance = [],
  classes = [],
  students = [],
  selectedSemester,
  startDate,
  endDate,
  attendanceRecords = [],
  onClassSelect
}: Props) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 10;

  // Convert date string "YYYY-MM-DD" to working days count
  const getWorkingDaysCount = (startStr: string, endStr: string): number => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) { // 0 = Sunday, 6 = Saturday
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const totalWorkingDays = React.useMemo(() => {
    return getWorkingDaysCount('2026-07-20', endDate);
  }, [endDate]);

  // --- COMPUTE REKAP PENGISIAN KEHADIRAN & SUMMARIES ---
  const rekapPengisian = React.useMemo(() => {
    return classes.map(cls => {
      // Find all unique dates that have attendance filled on working days for this class
      const uniqueFilledDates = new Set(
        attendanceRecords
          .filter(rec => {
            const matchesClass = rec.classId === cls.id || rec.classId === cls.name;
            const inRange = rec.date >= '2026-07-20' && rec.date <= endDate;
            if (!matchesClass || !inRange) return false;
            const d = new Date(rec.date);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return !isWeekend;
          })
          .map(rec => rec.date)
      );
      const filledDaysCount = uniqueFilledDates.size;

      // Compute attendance rate only from days that are filled
      let clsPresent = 0;
      let clsTotal = 0;
      attendanceRecords
        .filter(rec => {
          const matchesClass = rec.classId === cls.id || rec.classId === cls.name;
          const inRange = rec.date >= '2026-07-20' && rec.date <= endDate;
          return matchesClass && inRange;
        })
        .forEach(rec => {
          if (!rec.status) return;
          const s = String(rec.status).toUpperCase();
          if (['HADIR', 'LATE', 'H', 'T'].includes(s)) {
            clsPresent++;
            clsTotal++;
          } else if (['SAKIT', 'IZIN', 'ALPA', 'S', 'I', 'A'].includes(s)) {
            clsTotal++;
          }
        });

      const rate = clsTotal > 0 ? Math.min(100, Math.round((clsPresent / clsTotal) * 100)) : 100;

      return {
        ...cls,
        filledDaysCount,
        rate
      };
    }).sort((a, b) => a.filledDaysCount - b.filledDaysCount); // Lowest filled days first
  }, [classes, attendanceRecords, endDate]);

  const summaryStats = React.useMemo(() => {
    let totalNonEmpty = 0;
    let presentCount = 0;
    
    filteredAttendance.forEach(rec => {
      if (!rec.status) return;
      const s = String(rec.status).toUpperCase();
      if (['HADIR', 'LATE', 'H', 'T'].includes(s)) {
        presentCount++;
        totalNonEmpty++;
      } else if (['SAKIT', 'IZIN', 'ALPA', 'S', 'I', 'A'].includes(s)) {
        totalNonEmpty++;
      }
    });

    const avgAttendance = totalNonEmpty > 0 ? Math.min(100, Math.round((presentCount / totalNonEmpty) * 100)) : 100;
    
    const lowestClass = rekapPengisian.length > 0 
      ? `${rekapPengisian[0].name} (${rekapPengisian[0].filledDaysCount}/${totalWorkingDays} Hari)` 
      : '—';

    return {
      avgAttendance,
      lowestClass
    };
  }, [filteredAttendance, rekapPengisian, totalWorkingDays]);

  // --- COMPUTE SISWA YANG BUTUH PERHATIAN ---
  const attentionStudents = React.useMemo(() => {
    const studentStatsMap = new Map<string, { hadir: number; sakit: number; izin: number; alpa: number; total: number }>();
    
    // Initialize map
    students.forEach(st => {
      studentStatsMap.set(st.id, { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 });
    });

    filteredAttendance.forEach(rec => {
      if (!rec.studentId || !rec.status) return;
      const current = studentStatsMap.get(rec.studentId) || { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
      const s = String(rec.status).toUpperCase();
      
      if (['HADIR', 'LATE', 'H', 'T'].includes(s)) {
        current.hadir++;
        current.total++;
      } else if (['SAKIT', 'S'].includes(s)) {
        current.sakit++;
        current.total++;
      } else if (['IZIN', 'I'].includes(s)) {
        current.izin++;
        current.total++;
      } else if (['ALPA', 'A'].includes(s)) {
        current.alpa++;
        current.total++;
      }
      studentStatsMap.set(rec.studentId, current);
    });

    const list: any[] = [];
    students.forEach(st => {
      const stats = studentStatsMap.get(st.id) || { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
      const rate = stats.total > 0 ? Math.min(100, Math.round((stats.hadir / stats.total) * 100)) : 100;
      
      const totalAbsence = stats.sakit + stats.izin + stats.alpa;
      const needsAttention = stats.alpa > 1 || totalAbsence > 3;

      if (needsAttention) {
        list.push({
          id: st.id,
          name: st.name,
          classId: st.classId,
          className: classes.find(c => c.id === st.classId || c.name === st.classId)?.name || '—',
          ...stats,
          totalAbsence,
          rate
        });
      }
    });

    return list.filter(item => {
      const term = searchTerm.toLowerCase();
      return item.name.toLowerCase().includes(term) || item.className.toLowerCase().includes(term);
    }).sort((a, b) => b.alpa - a.alpa || a.rate - b.rate); // Prioritize highest Alpa first, then lowest rate
  }, [students, filteredAttendance, classes, searchTerm]);

  // Pagination for Student Table
  const totalPages = Math.max(1, Math.ceil(attentionStudents.length / itemsPerPage));
  const paginatedStudents = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return attentionStudents.slice(start, start + itemsPerPage);
  }, [attentionStudents, currentPage]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-[#002366]" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rata-rata Kehadiran</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{summaryStats.avgAttendance}%</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hari Kerja Efektif</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalWorkingDays} <span className="text-sm font-normal text-slate-400">hari</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pengisian Terendah</h3>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5 truncate">{summaryStats.lowestClass}</p>
          </div>
        </div>
      </div>

      {/* Grid: Rekap Pengisian Kehadiran & Student Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Card 1: Rekap Pengisian Kehadiran */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-4 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">Rekap Pengisian Kehadiran</h3>
            <p className="text-xs text-slate-500 mb-6">Kelengkapan pengisian presensi oleh guru (sejak 20 Juli)</p>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {rekapPengisian.map((cls, idx) => {
              const fillPercentage = totalWorkingDays > 0 ? Math.min(100, Math.round((cls.filledDaysCount / totalWorkingDays) * 100)) : 100;
              let barColor = 'bg-emerald-500';
              if (fillPercentage < 75) barColor = 'bg-rose-500';
              else if (fillPercentage < 95) barColor = 'bg-amber-500';

              const isWarning = cls.filledDaysCount < totalWorkingDays;

              return (
                <div key={idx} className="space-y-1.5 p-2 rounded-lg border border-slate-50 hover:bg-slate-50 transition">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">Kelas {cls.name}</span>
                    <span className="font-semibold text-slate-600">{cls.rate}% Kehadiran</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{cls.filledDaysCount} dari {totalWorkingDays} hari kerja diisi</span>
                    {isWarning && (
                      <span className="text-rose-500 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">
                        Belum Input
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className={`${barColor} h-full rounded-full transition-all duration-500`} style={{ width: `${fillPercentage}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 2: Siswa yang Butuh Perhatian */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Siswa yang Butuh Perhatian</h3>
                <p className="text-xs text-slate-500">Siswa dengan Alpa &gt; 1 hari atau total tidak hadir &gt; 3 hari</p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input 
                  type="text"
                  placeholder="Cari siswa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-60 font-medium"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3 text-center">Sakit (S)</th>
                    <th className="py-2.5 px-3 text-center">Izin (I)</th>
                    <th className="py-2.5 px-3 text-center">Alpa (A)</th>
                    <th className="py-2.5 px-3 text-center">Total Absen</th>
                    <th className="py-2.5 px-3 text-center">Rasio Hadir</th>
                    <th className="py-2.5 px-3 text-center">Tautan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attentionStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                        <div className="flex flex-col items-center justify-center gap-2 py-4">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                          <p className="text-slate-800 font-bold text-sm">Semua Kehadiran Siswa Optimal</p>
                          <p className="text-slate-400 text-xs">Tidak ada siswa yang memenuhi kriteria butuh perhatian.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedStudents.map((item) => {
                      let textClass = 'text-emerald-600 bg-emerald-50';
                      if (item.rate < 90) textClass = 'text-rose-600 bg-rose-50';
                      else if (item.rate < 95) textClass = 'text-amber-600 bg-amber-50';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3 font-bold text-slate-800">{item.name}</td>
                          <td className="py-3 px-3 font-semibold text-slate-600">Kelas {item.className}</td>
                          <td className="py-3 px-3 text-center font-medium text-slate-500">{item.sakit}</td>
                          <td className="py-3 px-3 text-center font-medium text-slate-500">{item.izin}</td>
                          <td className="py-3 px-3 text-center font-bold text-rose-600 bg-rose-50/30">{item.alpa}</td>
                          <td className="py-3 px-3 text-center font-bold text-slate-700">{item.totalAbsence} hari</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`${textClass} font-bold px-2 py-0.5 rounded text-[10px]`}>
                              {item.rate}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {onClassSelect ? (
                              <button
                                onClick={() => onClassSelect(item.classId)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#002366] hover:underline"
                              >
                                Detail Kelas <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 text-xs text-slate-500">
              <span>Halaman {currentPage} dari {totalPages} ({attentionStudents.length} data)</span>
              <div className="flex gap-1">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="p-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
