import * as React from 'react';
import {
  FileCheck, ExternalLink, CheckCircle2, Clock,
  Eye, RefreshCw, Loader2, ShieldAlert
} from 'lucide-react';
import type { SnStudentDoc, SnPublishedMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Class } from '../../../types';

interface MidtermSnRekapTabProps {
  selectedClass: Class;
  snStudents: SnStudentDoc[];
  publishedReports: SnPublishedMidtermReportDoc[];
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermSnRekapTab: React.FC<MidtermSnRekapTabProps> = ({
  selectedClass,
  snStudents,
  publishedReports,
  onRefreshData,
  loading
}) => {
  const publishedMap = React.useMemo(() => {
    const map: Record<string, SnPublishedMidtermReportDoc> = {};
    (publishedReports || []).forEach((pub) => {
      if (!map[pub.studentId] || (pub.reportVersion || 0) > (map[pub.studentId].reportVersion || 0)) {
        map[pub.studentId] = pub;
      }
    });
    return map;
  }, [publishedReports]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck size={20} className="text-purple-300" />
            <h2 className="text-base font-black tracking-tight">
              Rekap Publikasi & Open Tracking Siswa SN: <span className="text-amber-300">{selectedClass.name}</span>
            </h2>
          </div>
          <p className="text-xs text-purple-200">
            Daftar status publikasi dan pemantauan akses orang tua/siswa khusus Rapor SN.
          </p>
        </div>

        <button
          onClick={onRefreshData}
          disabled={loading}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 border border-white/20 cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Table Content */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {snStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <ShieldAlert size={32} className="mx-auto text-slate-300" />
            <p className="text-xs font-bold">Belum ada siswa SN yang ditetapkan pada kelas ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4">No</th>
                  <th className="p-4">Nama Siswa SN</th>
                  <th className="p-4">NISN</th>
                  <th className="p-4">Status Publikasi</th>
                  <th className="p-4">Tanggal Publish</th>
                  <th className="p-4">Drive Link</th>
                  <th className="p-4">Open Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {snStudents.map((student, idx) => {
                  const pubDoc = publishedMap[student.studentId];

                  return (
                    <tr key={student.studentId} className="hover:bg-slate-50/80 transition-all">
                      <td className="p-4 font-extrabold text-slate-400">{idx + 1}</td>
                      <td className="p-4 font-black text-slate-900">{student.studentName}</td>
                      <td className="p-4 font-mono text-slate-500">{student.nisn || '-'}</td>
                      <td className="p-4">
                        {pubDoc ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold text-[10px] rounded-lg border border-emerald-200 inline-flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-600" /> PUBLISHED v{pubDoc.reportVersion}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 font-extrabold text-[10px] rounded-lg border border-slate-200 inline-flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" /> BELUM PUBLISH
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-slate-600 font-semibold">
                        {pubDoc?.publishedAt
                          ? new Date(pubDoc.publishedAt).toLocaleString('id-ID')
                          : '-'}
                      </td>
                      <td className="p-4">
                        {pubDoc?.driveFileUrl ? (
                          <a
                            href={pubDoc.driveFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg inline-flex items-center gap-1 font-bold text-[11px] transition-all"
                          >
                            <ExternalLink size={13} /> Link PDF
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4">
                        {pubDoc?.isOpened ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <Eye size={13} /> Dibuka ({pubDoc.openCount || 1}x)
                          </span>
                        ) : pubDoc ? (
                          <span className="text-slate-400">Belum Dibuka</span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
