import * as React from 'react';
import { 
  FileCheck2, Eye, ExternalLink, Copy, Check, 
  Search, Filter, CheckCircle2, Clock, EyeOff, FileText, X
} from 'lucide-react';
import { toast } from 'sonner';
import { MidtermPdfTemplate } from './MidtermPdfTemplate';
import type { 
  PublishedMidtermReport, 
  MidtermReportSnapshot 
} from '../../../types/midtermReport';
import type { Student, Class, User } from '../../../types';

interface MidtermRekapTabProps {
  currentUser: User;
  classes: Class[];
  selectedClassId: string;
  onSelectClassId: (id: string) => void;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  publishedReports: PublishedMidtermReport[];
  loading: boolean;
  onRefreshData: () => Promise<void>;
}

export const MidtermRekapTab: React.FC<MidtermRekapTabProps> = ({
  currentUser,
  classes,
  selectedClassId,
  onSelectClassId,
  students,
  academicYear,
  semester,
  midtermTerm,
  publishedReports,
  loading,
  onRefreshData
}) => {
  const [filterPublishStatus, setFilterPublishStatus] = React.useState<'ALL' | 'PUBLISHED' | 'UNPUBLISHED'>('ALL');
  const [filterOpenStatus, setFilterOpenStatus] = React.useState<'ALL' | 'OPENED' | 'UNOPENED'>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Modal snapshot preview
  const [previewSnapshot, setPreviewSnapshot] = React.useState<MidtermReportSnapshot | null>(null);
  const [previewTitle, setPreviewTitle] = React.useState<string>('');

  // Map published report by studentId (highest version)
  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedMidtermReport> = {};
    const list = Array.isArray(publishedReports) ? publishedReports : [];
    for (const rep of list) {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || rep.version > map[rep.studentId].version) {
          map[rep.studentId] = rep;
        }
      }
    }
    return map;
  }, [publishedReports]);

  // Compute stats
  const totalStudents = Array.isArray(students) ? students.length : 0;
  const publishedStudentsCount = (Array.isArray(students) ? students : []).filter(s => s && Boolean(publishedMap[s.id])).length;
  const openedStudentsCount = (Array.isArray(students) ? students : []).filter(s => {
    const rep = s ? publishedMap[s.id] : undefined;
    return rep && rep.isOpened;
  }).length;
  const openRatePercent = publishedStudentsCount > 0 ? Math.round((openedStudentsCount / publishedStudentsCount) * 100) : 0;

  // Filter student rows
  const filteredRows = React.useMemo(() => {
    return students.filter(student => {
      const rep = publishedMap[student.id];
      const isPublished = Boolean(rep);
      const isOpened = Boolean(rep?.isOpened);

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = student.name.toLowerCase().includes(q);
        const matchesNisn = (student.nisn || (student as any).nis || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNisn) return false;
      }

      // Publish status
      if (filterPublishStatus === 'PUBLISHED' && !isPublished) return false;
      if (filterPublishStatus === 'UNPUBLISHED' && isPublished) return false;

      // Open status
      if (filterOpenStatus === 'OPENED' && !isOpened) return false;
      if (filterOpenStatus === 'UNOPENED' && (!isPublished || isOpened)) return false;

      return true;
    });
  }, [students, publishedMap, searchQuery, filterPublishStatus, filterOpenStatus]);

  const handleCopyLink = (rep: PublishedMidtermReport) => {
    const url = rep.driveFileUrl || window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedId(rep.id);
    toast.success('Link PDF berhasil disalin.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = (ts: number | null | undefined) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Siswa */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Siswa
          </span>
          <div className="text-2xl font-black text-slate-900">{totalStudents}</div>
          <p className="text-[11px] text-slate-400">Terdaftar di kelas ini</p>
        </div>

        {/* Sudah Terbit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
            Rapor Terbit
          </span>
          <div className="text-2xl font-black text-emerald-700">
            {publishedStudentsCount} <span className="text-xs font-bold text-slate-400">/ {totalStudents}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {totalStudents > 0 ? Math.round((publishedStudentsCount / totalStudents) * 100) : 0}% telah dipublikasikan
          </p>
        </div>

        {/* Dibuka Orang Tua */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
            Dibuka Orang Tua
          </span>
          <div className="text-2xl font-black text-blue-700">
            {openedStudentsCount} <span className="text-xs font-bold text-slate-400">({openRatePercent}%)</span>
          </div>
          <p className="text-[11px] text-slate-400">Berdasarkan akun Parent resmi</p>
        </div>

        {/* Belum Dibuka */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
            Belum Dibuka
          </span>
          <div className="text-2xl font-black text-amber-700">
            {Math.max(0, publishedStudentsCount - openedStudentsCount)}
          </div>
          <p className="text-[11px] text-slate-400">Perlu follow-up wali murid</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Class selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Kelas:</span>
            <select
              value={selectedClassId}
              onChange={(e) => onSelectClassId(e.target.value)}
              className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Filter Status Publikasi */}
          <select
            value={filterPublishStatus}
            onChange={(e) => setFilterPublishStatus(e.target.value as any)}
            className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="ALL">Semua Publikasi</option>
            <option value="PUBLISHED">Sudah Terbit</option>
            <option value="UNPUBLISHED">Belum Terbit</option>
          </select>

          {/* Filter Status Dibuka */}
          <select
            value={filterOpenStatus}
            onChange={(e) => setFilterOpenStatus(e.target.value as any)}
            className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="ALL">Semua Tracking</option>
            <option value="OPENED">Sudah Dibuka Orang Tua</option>
            <option value="UNOPENED">Belum Dibuka Orang Tua</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari siswa atau NISN..."
            className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 w-52"
          />
        </div>
      </div>

      {/* Rekap Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="p-3 w-10 text-center">No</th>
                <th className="p-3 w-48">Nama Siswa</th>
                <th className="p-3 w-28">NISN</th>
                <th className="p-3 w-28 text-center">Status</th>
                <th className="p-3 w-24 text-center">Versi</th>
                <th className="p-3 w-36">Tgl Terbit</th>
                <th className="p-3 w-32">Published By</th>
                <th className="p-3 w-28 text-center">Dibuka?</th>
                <th className="p-3 w-36">Terakhir Dibuka</th>
                <th className="p-3 w-20 text-center">Count</th>
                <th className="p-3 w-28 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    Tidak ada data rekap yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((student, idx) => {
                  const rep = publishedMap[student.id];
                  const isPublished = Boolean(rep);
                  const isOpened = Boolean(rep?.isOpened);

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 uppercase">{student.name}</div>
                      </td>
                      <td className="p-3 font-medium text-slate-500">
                        {student.nisn || (student as any).nis || '-'}
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                            <CheckCircle2 size={11} /> Terbit
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-500">
                            Belum
                          </span>
                        )}
                      </td>

                      {/* Versi */}
                      <td className="p-3 text-center font-bold text-slate-700">
                        {rep ? `v${rep.version}` : '-'}
                      </td>

                      {/* Tanggal Terbit */}
                      <td className="p-3 text-slate-600">
                        {rep ? formatTimestamp(rep.generatedAt) : '-'}
                      </td>

                      {/* Published By */}
                      <td className="p-3 text-slate-600 truncate max-w-[120px]" title={rep?.generatedByName || rep?.generatedBy}>
                        {rep?.generatedByName || (rep ? 'Guru' : '-')}
                      </td>

                      {/* Status Dibuka */}
                      <td className="p-3 text-center">
                        {!isPublished ? (
                          <span className="text-slate-300">-</span>
                        ) : isOpened ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            <Eye size={11} /> Dibuka
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <EyeOff size={11} /> Belum
                          </span>
                        )}
                      </td>

                      {/* Terakhir Dibuka */}
                      <td className="p-3 text-slate-600">
                        {rep?.lastOpenedAt ? formatTimestamp(rep.lastOpenedAt) : '-'}
                      </td>

                      {/* Open Count */}
                      <td className="p-3 text-center font-bold text-slate-800">
                        {rep ? rep.openCount || 0 : '-'}
                      </td>

                      {/* Aksi */}
                      <td className="p-3 text-right space-x-1.5">
                        {rep ? (
                          <>
                            <button
                              onClick={() => {
                                if (rep.reportSnapshot) {
                                  setPreviewSnapshot(rep.reportSnapshot);
                                  setPreviewTitle(`${student.name} (v${rep.version})`);
                                } else {
                                  toast.info('Snapshot dokumen tidak tersedia.');
                                }
                              }}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors inline-block"
                              title="Lihat Dokumen Snapshot"
                            >
                              <Eye size={14} />
                            </button>

                            <button
                              onClick={() => handleCopyLink(rep)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors inline-block"
                              title="Salin Link Dokumen"
                            >
                              {copiedId === rep.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            </button>

                            {rep.driveFileUrl && rep.driveFileUrl !== '#' && (
                              <a
                                href={rep.driveFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors inline-block"
                                title="Buka di Google Drive"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300 text-[11px]">-</span>
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

      {/* MODAL SNAPSHOT PREVIEW */}
      {previewSnapshot && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-700">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <FileText className="text-emerald-400" size={20} />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Arsip Snapshot Rapor Terbit: {previewTitle}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Dokumen ini bersifat immutable dan tidak terpengaruh oleh perubahan data terbaru.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPreviewSnapshot(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-800 flex justify-center">
              <MidtermPdfTemplate snapshot={previewSnapshot} />
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-800 flex items-center justify-end bg-slate-900 text-white rounded-b-3xl">
              <button
                onClick={() => setPreviewSnapshot(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
