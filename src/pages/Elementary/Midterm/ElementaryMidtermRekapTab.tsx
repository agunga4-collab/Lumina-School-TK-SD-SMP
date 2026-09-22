import * as React from 'react';
import { 
  FileSpreadsheet, Eye, Clock, CheckCircle2, AlertCircle, 
  Search, ExternalLink, RefreshCw
} from 'lucide-react';
import type { PublishedElementaryMidtermReport } from '../../../types/elementaryMidtermReport';
import type { Student, Class } from '../../../types';

interface ElementaryMidtermRekapTabProps {
  students: Student[];
  publishedReports: PublishedElementaryMidtermReport[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  onRefreshData: () => Promise<void>;
}

export const ElementaryMidtermRekapTab: React.FC<ElementaryMidtermRekapTabProps> = ({
  students,
  publishedReports,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = React.useState<string>('');

  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedElementaryMidtermReport> = {};
    (publishedReports || []).forEach(rep => {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || (rep.version || 0) > (map[rep.studentId].version || 0)) {
          map[rep.studentId] = rep;
        }
      }
    });
    return map;
  }, [publishedReports]);

  const filteredStudents = students.filter(st => 
    st.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (st.nisn || '').includes(searchTerm)
  );

  const totalStudents = students.length;
  const totalPublished = Object.keys(publishedMap).length;
  const totalOpened = Object.values(publishedMap).filter(r => r.isOpened).length;

  return (
    <div className="space-y-6">
      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider block">
            Total Siswa Kelas
          </span>
          <p className="text-2xl font-black text-slate-900">{totalStudents}</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider block">
            Status Publikasi
          </span>
          <p className="text-2xl font-black text-emerald-800">
            {totalPublished} / {totalStudents} <span className="text-xs font-medium text-slate-400">Terpublikasi</span>
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs font-extrabold text-purple-600 uppercase tracking-wider block">
            Open Tracking Orang Tua
          </span>
          <p className="text-2xl font-black text-purple-800">
            {totalOpened} / {totalPublished} <span className="text-xs font-medium text-slate-400">Dibuka Orang Tua</span>
          </p>
        </div>
      </div>

      {/* Roster & Tracking Table */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-emerald-600" />
            <span>Rekapitulasi & Open Tracking PDF</span>
          </h2>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama siswa..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                <th className="p-3 w-12 text-center border-r border-slate-800">No</th>
                <th className="p-3 w-56 border-r border-slate-800">Nama Siswa</th>
                <th className="p-3 w-32 border-r border-slate-800">NISN</th>
                <th className="p-3 w-36 border-r border-slate-800 text-center">Status Publikasi</th>
                <th className="p-3 w-36 border-r border-slate-800 text-center">Versi PDF</th>
                <th className="p-3 w-48 text-center">Status Open Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredStudents.map((st, idx) => {
                const pubDoc = publishedMap[st.id];

                return (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">
                      {idx + 1}
                    </td>
                    <td className="p-3 border-r border-slate-100 font-bold text-slate-900">
                      {st.name}
                    </td>
                    <td className="p-3 border-r border-slate-100 font-medium text-slate-600">
                      {st.nisn || '-'}
                    </td>
                    <td className="p-3 border-r border-slate-100 text-center">
                      {pubDoc ? (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-extrabold text-[10px] rounded-lg border border-emerald-100 inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> Terpublikasi
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-extrabold text-[10px] rounded-lg inline-flex items-center gap-1">
                          <Clock size={12} /> Belum Publish
                        </span>
                      )}
                    </td>
                    <td className="p-3 border-r border-slate-100 text-center font-bold text-slate-700">
                      {pubDoc ? `v${pubDoc.version}` : '-'}
                    </td>
                    <td className="p-3 text-center">
                      {pubDoc ? (
                        pubDoc.isOpened ? (
                          <span className="px-2.5 py-1 bg-purple-50 text-purple-700 font-extrabold text-[10px] rounded-lg border border-purple-100 inline-flex items-center gap-1">
                            <Eye size={12} /> Dibuka ({pubDoc.openCount || 1}x)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-medium">Belum dibuka</span>
                        )
                      ) : (
                        <span className="text-slate-300 text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
