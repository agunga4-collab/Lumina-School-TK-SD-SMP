import * as React from 'react';
import { Search, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Star, ShieldAlert } from 'lucide-react';
import { MTSSCase, ElementaryClass } from './types';

interface Props {
  filteredMTSS: MTSSCase[];
  classes: ElementaryClass[];
  overdueDays: number;
  formatDate: (val: string | number) => string;
}

export default function MTSSAcademicTab({
  filteredMTSS,
  classes,
  overdueDays,
  formatDate
}: Props) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 10;

  // --- STATS OVERVIEW ---
  const stats = React.useMemo(() => {
    const activeCases = filteredMTSS;

    // Open cases
    const openCases = activeCases.filter(c => c.status === 'Active');
    const closedCases = activeCases.filter(c => c.status === 'Achieved');

    // Tier 2 vs Tier 3 Active cases
    const activeTier2 = openCases.filter(c => c.tier === 'Tier 2').length;
    const activeTier3 = openCases.filter(c => c.tier === 'Tier 3').length;

    // New cases this month (calendar month)
    const today = new Date();
    const startOfMonthMs = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    
    const newCasesCount = activeCases.filter(c => c.createdAt >= startOfMonthMs).length;
    const closedCasesCount = activeCases.filter(c => c.status === 'Achieved' && c.updatedAt >= startOfMonthMs).length;

    return {
      openCount: openCases.length,
      closedCount: closedCases.length,
      activeTier2,
      activeTier3,
      newCasesCount,
      closedCasesCount
    };
  }, [filteredMTSS]);

  // --- FILTER TABLE DATA ---
  const tableData = React.useMemo(() => {
    return filteredMTSS.filter(rec => {
      const name = rec.studentName.toLowerCase();
      const subject = rec.subject.toLowerCase();
      const tier = rec.tier.toLowerCase();
      const clsName = (classes.find(c => c.id === rec.classId || c.name === rec.classId)?.name || '').toLowerCase();
      const term = searchTerm.toLowerCase();

      return name.includes(term) || subject.includes(term) || tier.includes(term) || clsName.includes(term);
    });
  }, [filteredMTSS, searchTerm, classes]);

  // Pagination
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
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kasus Aktif (T2/T3)</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {stats.openCount} <span className="text-sm font-normal text-slate-400">Kasus</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Tier 2: {stats.activeTier2} · Tier 3: {stats.activeTier3}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Star className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kasus Baru Bulan Ini</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.newCasesCount} <span className="text-sm font-normal text-slate-400">kasus</span></p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lulus (Achieved)</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.closedCount} <span className="text-sm font-normal text-slate-400">Selesai</span></p>
            <p className="text-[10px] text-slate-400 mt-0.5">Lulus bulan ini: +{stats.closedCasesCount}</p>
          </div>
        </div>
      </div>

      {/* Case Logs Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Pemantauan Detail Kasus MTSS</h3>
              <p className="text-xs text-slate-500">Daftar siswa yang memerlukan pendampingan khusus</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input 
                type="text"
                placeholder="Cari siswa/kelas/subjek..."
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
                  <th className="py-2.5 px-3">Bidang Studi</th>
                  <th className="py-2.5 px-3 text-center">Tingkatan</th>
                  <th className="py-2.5 px-3">Tanggal Mulai</th>
                  <th className="py-2.5 px-3">Terakhir Diperbarui</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                      Tidak ada catatan kasus MTSS yang sesuai.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((rec) => {
                    const clsName = classes.find(c => c.id === rec.classId || c.name === rec.classId)?.name || rec.classId || '—';
                    
                    const isClosed = rec.status === 'Achieved';
                    const lastUpdate = rec.updatedAt || rec.createdAt || 0;
                    const isOverdue = !isClosed && (Date.now() - lastUpdate > overdueDays * 24 * 60 * 60 * 1000);

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                          {rec.studentName}
                          {isOverdue && (
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 inline shrink-0" title="Melebihi batas update follow-up!" />
                          )}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-600">Kelas {clsName}</td>
                        <td className="py-3 px-3 text-slate-800 font-semibold">{rec.subject}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`font-bold px-2.5 py-0.5 rounded text-[10px] ${rec.tier === 'Tier 3' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                            {rec.tier}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500">{formatDate(rec.createdAt)}</td>
                        <td className="py-3 px-3 text-slate-500">
                          {formatDate(lastUpdate)}
                          {isOverdue && (
                            <span className="block text-[9px] text-rose-500 font-bold">Overdue Follow-up</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block font-bold text-[10px] px-2.5 py-0.5 rounded-full ${isClosed ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            {isClosed ? 'Lulus' : 'Aktif'}
                          </span>
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
  );
}
