import * as React from 'react';
import {
  FileCheck, ExternalLink, CheckCircle2, Clock,
  Eye, RefreshCw, Loader2, ShieldAlert
} from 'lucide-react';
import type { ElementarySnStudentDoc, ElementarySnPublishedMidtermReportDoc } from '../../../types/elementaryMidtermSnReport';

interface ElementaryMidtermSnRekapTabProps {
  snStudentsList: ElementarySnStudentDoc[];
  publishedReports: ElementarySnPublishedMidtermReportDoc[];
  onSelectStudentById: (studentId: string) => void;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const ElementaryMidtermSnRekapTab: React.FC<ElementaryMidtermSnRekapTabProps> = ({
  snStudentsList,
  publishedReports,
  onSelectStudentById,
  onRefreshData,
  loading
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck size={20} className="text-amber-800" />
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Rekap Publikasi & Open Tracking Siswa SN
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Pantau status penerbitan PDF dan tracking pembukaan rapor untuk seluruh siswa SN di kelas ini.
          </p>
        </div>

        <button
          onClick={onRefreshData}
          disabled={loading}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10.5px]">
                <th className="p-3.5 text-center w-12">No.</th>
                <th className="p-3.5">Nama Siswa SN</th>
                <th className="p-3.5">NISN</th>
                <th className="p-3.5 text-center">Status Rilis</th>
                <th className="p-3.5 text-center">Versi</th>
                <th className="p-3.5">Waktu Terbit</th>
                <th className="p-3.5 text-center">Status Akses / Dibuka</th>
                <th className="p-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snStudentsList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Belum ada siswa SN yang terdaftar pada kelas ini.
                  </td>
                </tr>
              ) : (
                snStudentsList.map((student, idx) => {
                  const studentReports = (publishedReports || [])
                    .filter((p) => p.studentId === student.studentId)
                    .sort((a, b) => (b.reportVersion || 0) - (a.reportVersion || 0));

                  const latest = studentReports[0];
                  const isPublished = !!latest;

                  return (
                    <tr
                      key={student.studentId || idx}
                      className="hover:bg-slate-50/80 transition-all"
                    >
                      <td className="p-3.5 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      <td className="p-3.5 font-bold text-slate-900">
                        <button
                          onClick={() => onSelectStudentById(student.studentId)}
                          className="hover:text-amber-800 text-left cursor-pointer transition-all"
                        >
                          {student.studentName}
                        </button>
                      </td>

                      <td className="p-3.5 text-slate-600 font-medium">
                        {student.nisn || '-'}
                      </td>

                      <td className="p-3.5 text-center">
                        {isPublished ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1">
                            <CheckCircle2 size={12} /> TERBIT
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10.5px] font-bold">
                            BELUM PUBLISH
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-black text-slate-700">
                        {isPublished ? `v${latest.reportVersion}` : '-'}
                      </td>

                      <td className="p-3.5 text-slate-600">
                        {isPublished ? (
                          <div>
                            <p className="font-semibold text-slate-800">
                              {new Date(latest.publishedAt).toLocaleDateString('id-ID')}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              oleh {latest.publishedByName}
                            </p>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        {isPublished ? (
                          latest.isOpened ? (
                            <span className="px-2.5 py-1 bg-sky-100 text-sky-800 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1">
                              <Eye size={12} /> DIBUKA ({latest.openCount || 1}x)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg text-[10.5px] font-bold">
                              Belum Dibuka
                            </span>
                          )
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isPublished && latest.driveFileUrl && (
                            <a
                              href={latest.driveFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 text-slate-400 hover:text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all"
                              title="Buka Drive PDF"
                            >
                              <ExternalLink size={16} />
                            </a>
                          )}

                          <button
                            onClick={() => onSelectStudentById(student.studentId)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Kelola Rapor
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
