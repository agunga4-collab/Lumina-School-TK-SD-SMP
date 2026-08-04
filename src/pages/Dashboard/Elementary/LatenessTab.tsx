import * as React from 'react';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip as ChartTooltip, Legend as ChartLegend 
} from "recharts";
import { Search, ChevronLeft, ChevronRight, Clock, Award, ShieldAlert } from 'lucide-react';
import { LatenessRecord, ElementaryClass } from './types';

interface Props {
  filteredLateness: LatenessRecord[];
  classes: ElementaryClass[];
  startDate: string;
  endDate: string;
  formatDate: (val: string | number) => string;
}

export default function LatenessTab({
  filteredLateness,
  classes,
  startDate,
  endDate,
  formatDate
}: Props) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 8;

  // Helper to convert time "HH:MM" to minutes
  const timeToMinutes = (tStr: string) => {
    if (!tStr) return 0;
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
  };

  // --- STATS CARD 1: Total Terlambat ---
  const totalLatenessCount = filteredLateness.length;

  // --- STATS CARD 2: Avg Minutes ---
  const avgMinutes = React.useMemo(() => {
    if (filteredLateness.length === 0) return 0;
    const totalMins = filteredLateness.reduce((acc, rec) => {
      const arr = timeToMinutes(rec.arrivalTime);
      const limit = timeToMinutes('07:30');
      return acc + Math.max(0, arr - limit);
    }, 0);
    return Math.round(totalMins / filteredLateness.length);
  }, [filteredLateness]);

  // --- STATS CARD 3: Class with Most Lateness ---
  const classMostLateness = React.useMemo(() => {
    if (filteredLateness.length === 0) return '—';
    const counts: Record<string, number> = {};
    filteredLateness.forEach(rec => {
      const clsName = classes.find(c => c.id === rec.classId || c.name === rec.classId)?.name || rec.classId || 'Unknown';
      counts[clsName] = (counts[clsName] || 0) + 1;
    });

    let topClass = '—';
    let max = 0;
    Object.entries(counts).forEach(([cls, count]) => {
      if (count > max) {
        max = count;
        topClass = cls;
      }
    });

    return max > 0 ? `${topClass} (${max} kali)` : '—';
  }, [filteredLateness, classes]);

  // --- RECHARTS CHART: Daily Trend ---
  const chartData = React.useMemo(() => {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Safely generate date sequence up to max 60 days to prevent infinite loops
    let limit = 0;
    for (let d = new Date(start); d <= end && limit < 60; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
      limit++;
    }

    const dailyCounts: Record<string, number> = {};
    filteredLateness.forEach(rec => {
      if (rec.date) {
        dailyCounts[rec.date] = (dailyCounts[rec.date] || 0) + 1;
      }
    });

    return dates.map(d => {
      const parts = d.split('-');
      return {
        displayDate: `${parts[2]}/${parts[1]}`, // DD/MM
        'Jumlah Terlambat': dailyCounts[d] || 0
      };
    });
  }, [filteredLateness, startDate, endDate]);

  // --- FILTERED TABLE DATA ---
  const tableData = React.useMemo(() => {
    return filteredLateness.filter(rec => {
      const name = (rec.studentName || '').toLowerCase();
      const reason = (rec.reason || '').toLowerCase();
      const term = searchTerm.toLowerCase();
      const clsName = (classes.find(c => c.id === rec.classId || c.name === rec.classId)?.name || '').toLowerCase();

      return name.includes(term) || reason.includes(term) || clsName.includes(term);
    });
  }, [filteredLateness, searchTerm, classes]);

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(tableData.length / itemsPerPage));
  const paginatedData = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return tableData.slice(start, start + itemsPerPage);
  }, [tableData, currentPage]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Terlambat</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalLatenessCount} <span className="text-sm font-normal text-slate-400">kali</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rata-rata Menit</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{avgMinutes} <span className="text-sm font-normal text-slate-400">menit</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Keterlambatan Terbanyak</h3>
            <p className="text-lg font-extrabold text-slate-900 mt-0.5 truncate">{classMostLateness}</p>
          </div>
        </div>
      </div>

      {/* Grid: Chart & Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trend Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">Tren Keterlambatan Harian</h3>
            <p className="text-xs text-slate-500 mb-6">Frekuensi keterlambatan unit SD dalam rentang tanggal terpilih</p>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="displayDate" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                <ChartTooltip />
                <Line 
                  type="monotone" 
                  dataKey="Jumlah Terlambat" 
                  stroke="#f59e0b" 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2 }}
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Details Table */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Catatan Detil Keterlambatan</h3>
                <p className="text-xs text-slate-500">Rincian jam kedatangan dan alasan siswa terlambat</p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input 
                  type="text"
                  placeholder="Cari siswa/kelas/alasan..."
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
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">Selisih</th>
                    <th className="py-2.5 px-3">Alasan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                        Tidak ada catatan keterlambatan yang cocok.
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((rec) => {
                      const mins = Math.max(0, timeToMinutes(rec.arrivalTime) - timeToMinutes('07:30'));
                      const clsName = classes.find(c => c.id === rec.classId || c.name === rec.classId)?.name || rec.classId || '—';
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-bold text-slate-800">{rec.studentName || '—'}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-600">{clsName}</td>
                          <td className="py-2.5 px-3 text-slate-500">{formatDate(rec.date)}</td>
                          <td className="py-2.5 px-3 text-slate-800 font-semibold">{rec.arrivalTime}</td>
                          <td className="py-2.5 px-3">
                            <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-100">
                              +{mins}m
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-medium truncate max-w-[150px]" title={rec.reason}>
                            {rec.reason || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 text-xs text-slate-500">
              <span>Halaman {currentPage} dari {totalPages} ({tableData.length} data)</span>
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
