import * as React from 'react';
import { Search, ChevronLeft, ChevronRight, Activity, ClipboardCheck, Sparkles, AlertTriangle } from 'lucide-react';
import { LDSSAssessment, ElementaryClass } from './types';

// Error Boundary for LDSSTab to prevent crashing
class LDSSTabErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null as Error | null };

  constructor(props: any) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("LDSSTab rendering crashed:", error, errorInfo);
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-8 text-center my-6">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-rose-900">Terjadi Kesalahan Tampilan LDSS</h3>
          <p className="text-sm text-rose-600 mt-2 max-w-md mx-auto">
            Sistem gagal memproses data asesmen Sensory & Motorik karena struktur data yang tidak cocok.
          </p>
          <p className="text-xs text-rose-500 mt-1">Detail: {(this as any).state.error?.message}</p>
          <button
            onClick={() => (this as any).setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 bg-[#002366] hover:bg-opacity-90 text-white rounded-lg text-xs font-bold transition shadow-sm"
          >
            Coba Muat Ulang Tab
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

interface Props {
  filteredLDSS: LDSSAssessment[];
  classes: ElementaryClass[];
  formatDate: (val: string | number) => string;
}

function LDSSTabContent({
  filteredLDSS = [],
  classes = [],
  formatDate
}: Props) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 10;

  // --- STATS OVERVIEW ---
  const stats = React.useMemo(() => {
    const activeAssessments = Array.isArray(filteredLDSS) ? filteredLDSS : [];

    const totalCount = activeAssessments.length;
    const completedCount = activeAssessments.filter(r => r?.status?.toUpperCase() === 'COMPLETED').length;
    const progressCount = activeAssessments.filter(r => {
      const s = r?.status?.toUpperCase();
      return s === 'IN_PROGRESS' || s === 'DRAFT' || s === 'IN PROGRESS';
    }).length;

    return {
      totalCount,
      completedCount,
      progressCount
    };
  }, [filteredLDSS]);

  // --- FILTER TABLE DATA ---
  const tableData = React.useMemo(() => {
    if (!Array.isArray(filteredLDSS)) return [];
    return filteredLDSS.filter(rec => {
      if (!rec) return false;
      const name = (rec.studentName || '').toLowerCase();
      const period = (rec.periodKey || '').toLowerCase();
      const status = (rec.status || '').toLowerCase();
      const clsName = (rec.classNameSnapshot || classes?.find(c => c.id === rec.classId)?.name || rec.classId || '').toLowerCase();
      const term = (searchTerm || '').toLowerCase();

      return name.includes(term) || period.includes(term) || status.includes(term) || clsName.includes(term);
    });
  }, [filteredLDSS, searchTerm, classes]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(tableData.length / itemsPerPage));
  const paginatedData = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return tableData.slice(start, start + itemsPerPage);
  }, [tableData, currentPage]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (!filteredLDSS || filteredLDSS.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
        <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Activity className="w-8 h-8 text-[#002366]" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Belum Ada Asesmen LDSS</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
          Asesmen Sensory & Motorik (Lumina Developmental Support System) belum diisi oleh tim spesialis/homeroom teacher untuk unit Elementary pada Tahun Ajaran dan Semester ini.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <span className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full font-semibold">
            Tahun Ajaran Aktif
          </span>
          <span className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full font-semibold">
            Semester Aktif
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4 animate-fadeIn">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-6 h-6 text-[#002366]" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Kasus / Asesmen</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.totalCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4 animate-fadeIn">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Selesai (Completed)</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.completedCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4 animate-fadeIn">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Berjalan (Draft / In Progress)</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.progressCount}</p>
          </div>
        </div>
      </div>

      {/* LDSS Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Pemantauan Asesmen LDSS</h3>
              <p className="text-xs text-slate-500">Log pengerjaan asesmen Sensory & Motorik siswa SD</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input 
                type="text"
                placeholder="Cari siswa/kelas/status..."
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
                  <th className="py-2.5 px-3">Periode</th>
                  <th className="py-2.5 px-3">Terakhir Diperbarui</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                      Tidak ada catatan asesmen LDSS yang sesuai.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((rec) => {
                    const clsName = rec.classNameSnapshot || classes?.find(c => c.id === rec.classId)?.name || rec.classId || '—';
                    const isCompleted = rec.status?.toUpperCase() === 'COMPLETED';

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-bold text-slate-800">{rec.studentName || '—'}</td>
                        <td className="py-3 px-3 font-semibold text-slate-600">Kelas {clsName}</td>
                        <td className="py-3 px-3 font-medium text-slate-800">{rec.periodKey || 'Asesmen'}</td>
                        <td className="py-3 px-3 text-slate-500">{formatDate(rec.updatedAt || rec.createdAt)}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`font-bold text-[10px] px-2.5 py-0.5 rounded-full inline-block ${isCompleted ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                            {isCompleted ? 'Completed' : (rec.status || 'DRAFT')}
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

export default function LDSSTab(props: Props) {
  return (
    <LDSSTabErrorBoundary>
      <LDSSTabContent {...props} />
    </LDSSTabErrorBoundary>
  );
}
