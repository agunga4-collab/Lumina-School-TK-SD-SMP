import * as React from 'react';
import { motion } from 'motion/react';
import {
  FileText, Download, Eye,
  Calendar, Award, ChevronLeft,
  Loader2, CheckCircle2,
  Heart, ExternalLink
} from 'lucide-react';
import { useOutletContext, Link, useSearchParams } from 'react-router-dom';
import {
  User as AppUser,
  ReportCard,
  Student,
  ParentReportView
} from '../../types';
import type { PublishedMidtermReport } from '../../types/midtermReport';
import { recordMidtermReportOpen } from '../../services/juniorHighMidtermService';
import {
  getStudentById,
  getParentReportViews,
  markReportAsViewed
} from '../../lib/firebase';
import { cn } from '../../lib/utils';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

type WeeklyReport = {
  id: string;
  studentId?: string;
  publishedAt?: number;
  sentToParent?: boolean;
  driveFileUrl?: string;
  startDate?: string;
  endDate?: string;
  theme?: string;
  className?: string;
  reportSnapshot?: any;
};

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function normalizeIds(values: string[]) {
  return uniqueStrings([
    ...values,
    ...values.map(v => v.toUpperCase()),
    ...values.map(v => v.toLowerCase())
  ]);
}

function extractReportIdsFromViews(
  views: ParentReportView[],
  selectedStudentIds: string[]
) {
  const allowedStudentIds = new Set(selectedStudentIds);
  const reportIds: string[] = [];

  for (const view of views as any[]) {
    const matchesStudent =
      !view.studentId || allowedStudentIds.has(view.studentId);

    if (!matchesStudent) continue;

    if (typeof view.reportId === 'string') {
      reportIds.push(view.reportId);
    }

    if (Array.isArray(view.reportIds)) {
      for (const id of view.reportIds) {
        if (typeof id === 'string') reportIds.push(id);
      }
    }

    if (Array.isArray(view.items)) {
      for (const item of view.items) {
        if (!item) continue;
        if (typeof item.reportId === 'string') {
          if (!item.studentId || allowedStudentIds.has(item.studentId)) {
            reportIds.push(item.reportId);
          }
        }
      }
    }
  }

  return uniqueStrings(reportIds);
}

async function getReportCardsByIds(reportIds: string[]): Promise<ReportCard[]> {
  const docs = await Promise.all(
    reportIds.map(async (reportId) => {
      try {
        const ref = doc(db, 'reportCards', reportId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return {
          id: snap.id,
          ...snap.data()
        } as ReportCard;
      } catch (error) {
        console.warn(`[ParentReports] Failed to load report ${reportId}:`, error);
        return null;
      }
    })
  );

  return docs.filter(Boolean) as ReportCard[];
}

export default function ParentReports() {
  const { currentUser, selectedStudentId } = useOutletContext<{
    currentUser: AppUser;
    selectedStudentId?: string | null;
  }>();

  const [searchParams] = useSearchParams();
  const studentId = searchParams.get('studentId') || selectedStudentId;

  const [student, setStudent] = React.useState<Student | null>(null);
  const [reports, setReports] = React.useState<ReportCard[]>([]);
  const [viewedReports, setViewedReports] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);

  const [weeklyReports, setWeeklyReports] = React.useState<WeeklyReport[]>([]);
  const [midtermReports, setMidtermReports] = React.useState<PublishedMidtermReport[]>([]);
  const [activeTab, setActiveTab] = React.useState<'ACADEMIC' | 'WEEKLY' | 'MIDTERM'>('ACADEMIC');

  React.useEffect(() => {
    const fetchData = async () => {
      if (!studentId || !currentUser?.email) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [studentData, viewsData] = await Promise.all([
          getStudentById(studentId),
          getParentReportViews(currentUser.email)
        ]);

        setStudent(studentData);
        setViewedReports(new Set((viewsData || []).map((v: any) => v.reportId).filter(Boolean)));

        if (!studentData) {
          setReports([]);
          setWeeklyReports([]);
          setLoading(false);
          return;
        }

        const baseIds = uniqueStrings([
          studentData.id,
          (studentData as any).luminaId,
          (studentData as any).docId,
          (studentData as any).firebaseId,
          studentId
        ]);

        const studentIdsToSearch = normalizeIds(baseIds);

        // IMPORTANT: Allowed report IDs from parentReportViews, then getDoc one by one.
        const reportIds = extractReportIdsFromViews(
          (viewsData || []) as ParentReportView[],
          studentIdsToSearch
        );

        const fetchedReports = await getReportCardsByIds(reportIds);

        const filteredReports = fetchedReports
          .filter((rc: any) => {
            if (rc.status !== 'PUBLISHED') return false;

            if (rc.studentId && studentIdsToSearch.includes(rc.studentId)) return true;

            if (Array.isArray(rc.studentReports)) {
              return rc.studentReports.some((sr: any) =>
                sr?.studentId && studentIdsToSearch.includes(sr.studentId)
              );
            }

            return false;
          })
          .sort((a: any, b: any) => {
            const aTime = a.createdAt?.seconds
              ? a.createdAt.seconds * 1000
              : Number(a.createdAt || 0);
            const bTime = b.createdAt?.seconds
              ? b.createdAt.seconds * 1000
              : Number(b.createdAt || 0);
            return bTime - aTime;
          });

        setReports(filteredReports);

        if (studentData.unitId === 'KINDERGARTEN') {
          try {
            const kgList: WeeklyReport[] = [];
            for (const sid of studentIdsToSearch) {
              const qKg = query(
                collection(db, 'published_kg_reports'),
                where('studentId', '==', sid),
                where('status', '==', 'sent')
              );
              const snapKg = await getDocs(qKg);
              snapKg.docs.forEach(docSnap => {
                kgList.push({
                  id: docSnap.id,
                  ...docSnap.data()
                } as WeeklyReport);
              });
            }
            const uniqueKgMap = new Map();
            kgList.forEach(item => uniqueKgMap.set(item.id, item));
            const sortedKg = Array.from(uniqueKgMap.values()).sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
            setWeeklyReports(sortedKg);
            if (sortedKg.length > 0) {
              setActiveTab('WEEKLY');
            } else {
              setActiveTab('ACADEMIC');
            }
          } catch (kgErr) {
            console.warn("Failed to query Kindergarten weekly reports for parent:", kgErr);
            setWeeklyReports([]);
            setActiveTab('ACADEMIC');
          }
        } else {
          setWeeklyReports([]);
          setActiveTab('ACADEMIC');
        }

        // Fetch Junior High published midterm reports
        try {
          const midtermSnap = await getDocs(
            query(
              collection(db, 'jh_midterm_published_reports'),
              where('studentId', 'in', studentIdsToSearch.slice(0, 10))
            )
          );
          const mList: PublishedMidtermReport[] = [];
          midtermSnap.docs.forEach(docSnap => {
            mList.push({ id: docSnap.id, ...docSnap.data() } as PublishedMidtermReport);
          });
          // Keep highest version per midterm term/semester
          mList.sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));
          setMidtermReports(mList);
          if (studentData.unitId === 'JUNIOR_HIGH' && mList.length > 0 && filteredReports.length === 0) {
            setActiveTab('MIDTERM');
          }
        } catch (mErr) {
          console.warn("Failed to query Midterm reports for parent:", mErr);
          setMidtermReports([]);
        }
      } catch (err) {
        console.error(err);
        setReports([]);
        setWeeklyReports([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [studentId, currentUser?.email]);

  const handleOpenReport = async (reportId: string) => {
    if (!viewedReports.has(reportId)) {
      try {
        await markReportAsViewed(currentUser?.email || '', reportId, studentId!);
        setViewedReports(prev => new Set([...prev, reportId]));
      } catch (err) {
        console.error('Error marking as viewed:', err);
      }
    }
  };

  const handleOpenMidtermReport = async (rep: PublishedMidtermReport) => {
    try {
      await recordMidtermReportOpen(rep.id, currentUser?.email || 'parent', rep.studentId);
      setMidtermReports(prev => prev.map(m => m.id === rep.id ? { ...m, isOpened: true, openCount: (m.openCount || 0) + 1 } : m));
    } catch (err) {
      console.warn('Error recording midterm report open:', err);
    }
  };

  if (!studentId) {
    return <div className="p-8 text-center font-bold text-xs text-gray-400 uppercase tracking-widest">Pilih ananda terlebih dahulu dari dashboard.</div>;
  }

  if (loading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
      
      {/* Back to Dashboard and Title: Compact Layout */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <Link
            to="/parent/dashboard"
            className="group inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-emerald-600 transition-colors"
          >
            <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" /> Dashboard
          </Link>
          <div className="space-y-0.5">
            <h1 className="text-lg font-extrabold uppercase tracking-tight text-gray-900 leading-none">
              Daftar <span className="text-emerald-600">Rapor</span>
            </h1>
            <p className="text-xs text-gray-400 font-bold">Rapor {student?.name} • Tahun Akademik 2025/2026</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-wider">
            Total: {reports.length} Laporan
          </div>
          <div className="px-3.5 py-1.5 bg-gray-50 text-gray-400 rounded-lg text-[9px] font-black uppercase tracking-wider">
            Belum Dibaca: {reports.filter(r => !viewedReports.has(r.id)).length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-100 pb-1">
        <button
          id="tab-btn-academic"
          onClick={() => setActiveTab('ACADEMIC')}
          className={cn(
            'px-4 py-2 font-bold uppercase text-[11px] tracking-wider transition-all border-b-2 -mb-[2px] text-left sm:text-center cursor-pointer',
            activeTab === 'ACADEMIC'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          )}
        >
          Rapor Akhir Semester & Academic
        </button>

        {weeklyReports.length > 0 && (
          <button
            id="tab-btn-weekly"
            onClick={() => setActiveTab('WEEKLY')}
            className={cn(
              'px-4 py-2 font-bold uppercase text-[11px] tracking-wider transition-all border-b-2 -mb-[2px] text-left sm:text-center cursor-pointer flex items-center gap-1.5',
              activeTab === 'WEEKLY'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            )}
          >
            Laporan Mingguan
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-100 text-emerald-800 font-black">
              {weeklyReports.length}
            </span>
          </button>
        )}

        {midtermReports.length > 0 && (
          <button
            id="tab-btn-midterm"
            onClick={() => setActiveTab('MIDTERM')}
            className={cn(
              'px-4 py-2 font-bold uppercase text-[11px] tracking-wider transition-all border-b-2 -mb-[2px] text-left sm:text-center cursor-pointer flex items-center gap-1.5',
              activeTab === 'MIDTERM'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            )}
          >
            Midterm Report
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-100 text-emerald-800 font-black">
              {midtermReports.length}
            </span>
          </button>
        )}
      </div>

      {activeTab === 'ACADEMIC' && (
        reports.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 p-10 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
              <FileText className="text-gray-300" size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-tight">Tidak Ada Rapor</h3>
              <p className="text-xs text-gray-400 font-bold max-w-xs mx-auto leading-relaxed">
                Saat ini belum ada rapor akademis akhir semester yang dipublikasikan.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report, idx) => {
              const isNew = !viewedReports.has(report.id);

              const publishedTime =
                (report as any).publishedAt?.seconds
                  ? new Date((report as any).publishedAt.seconds * 1000)
                  : new Date((report as any).publishedAt || 0);

              return (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    'group relative bg-white p-5 rounded-2xl border transition-all flex flex-col justify-between aspect-square',
                    isNew
                      ? 'border-emerald-200 shadow shadow-emerald-50 ring-2 ring-emerald-50/50'
                      : 'border-gray-150 shadow-sm hover:shadow hover:border-emerald-200'
                  )}
                >
                  {isNew && (
                    <div className="absolute -top-2.5 -right-2 bg-emerald-600 text-white px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow shadow-emerald-700/20 animate-bounce">
                      Baru
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300',
                          isNew
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
                        )}
                      >
                        <FileText size={18} />
                      </div>

                      <div className="text-right">
                        <div className="px-2.5 py-1 bg-gray-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest inline-block">
                          {(report as any).type?.split('_')[0] || 'REPORT'}
                        </div>
                        <p className="text-[9px] font-bold text-gray-400 mt-1">
                          Published: {isNaN(publishedTime.getTime()) ? '-' : publishedTime.toLocaleDateString('id-ID')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="text-base font-extrabold uppercase tracking-tight text-gray-900 group-hover:text-emerald-600 transition-colors leading-tight line-clamp-2">
                        {(report as any).period || 'Laporan Akademik'}
                      </h3>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={10} /> Semester {(report as any).semester || '-'}
                        </span>
                        {viewedReports.has(report.id) && (
                          <span className="flex items-center gap-0.5 text-emerald-500 opacity-80">
                            <CheckCircle2 size={10} /> Sudah Dibaca
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4">
                    <Link
                      to={`/academic/rapor/${report.id}?view=parent`}
                      onClick={() => handleOpenReport(report.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gray-900 text-white rounded-xl font-extrabold uppercase text-[9px] tracking-widest hover:bg-emerald-600 transition-all shadow-sm"
                    >
                      <Eye size={12} /> Buka Laporan
                    </Link>

                    <div className="flex gap-1.5">
                      <button className="flex-1 flex items-center justify-center gap-1 py-2 border border-gray-100 text-gray-400 rounded-xl font-bold uppercase text-[9px] tracking-wider hover:border-emerald-600 hover:text-emerald-600 transition-all cursor-pointer">
                        <Download size={12} /> PDF
                      </button>

                      {(report as any).isEndTerm && (
                        <button className="flex-1 flex items-center justify-center gap-1 py-2 border border-gray-100 text-gray-400 rounded-xl font-bold uppercase text-[9px] tracking-wider hover:border-blue-600 hover:text-blue-600 transition-all cursor-pointer">
                          <Award size={12} /> Diploma
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {activeTab === 'WEEKLY' && (
        weeklyReports.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 p-10 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
              <Calendar className="text-emerald-600" size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-tight">Tidak Ada Laporan Mingguan</h3>
              <p className="text-xs text-gray-400 font-bold max-w-xs mx-auto leading-relaxed">
                Saat ini belum ada laporan mingguan yang dipublikasikan untuk periode ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weeklyReports.map((report, idx) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group relative bg-white p-5 rounded-2xl border border-gray-150 shadow-sm hover:shadow hover:border-emerald-200 transition-all flex flex-col justify-between aspect-square"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-[#109E58] group-hover:text-white flex items-center justify-center transition-all duration-300">
                      <Calendar size={18} />
                    </div>

                    <div className="text-right">
                      <div className="px-2.5 py-1 bg-[#109E58] text-white rounded-lg text-[8px] font-black uppercase tracking-widest inline-block">
                        Weekly
                      </div>
                      <p className="text-[9px] font-bold text-gray-400 mt-1">
                        {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('id-ID') : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-base font-extrabold uppercase tracking-tight text-gray-900 group-hover:text-[#109E58] transition-colors leading-tight line-clamp-2">
                      Pekan: {report.startDate} - {report.endDate}
                    </h3>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {report.theme && (
                        <span className="inline-block px-2 py-0.5 bg-gray-50 border border-gray-100 rounded-md text-[9px] text-gray-500 font-bold uppercase">
                          Tema: {report.theme}
                        </span>
                      )}
                      {report.className && (
                        <div className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider block bg-emerald-50 px-2 py-0.5 rounded-md">
                          Kelas: {report.className}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    {report.reportSnapshot ? (
                      <Link
                        to={`/student/weekly-report/${report.id}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-xl font-extrabold uppercase text-[9px] tracking-widest hover:bg-emerald-700 transition-all shadow-sm cursor-pointer text-center"
                      >
                        <Eye size={12} /> Lihat Mobile
                      </Link>
                    ) : null}
                    {report.driveFileUrl && (
                      <a
                        href={report.driveFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-900 text-white rounded-xl font-extrabold uppercase text-[9px] tracking-widest hover:bg-[#109E58] transition-all shadow-sm cursor-pointer text-center"
                      >
                        <FileText size={12} /> Lihat PDF
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}

      {activeTab === 'MIDTERM' && (
        midtermReports.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 p-10 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto">
              <FileText className="text-gray-300" size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-tight">Belum Ada Midterm Report</h3>
              <p className="text-xs text-gray-400 font-bold max-w-xs mx-auto leading-relaxed">
                Rapor midterm untuk ananda belum diterbitkan oleh pihak sekolah.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {midtermReports.map((rep) => (
              <motion.div
                key={rep.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">
                      v{rep.version}
                    </span>
                    <p className="text-[9px] font-bold text-gray-400 mt-1">
                      {new Date(rep.generatedAt).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase text-gray-900 tracking-tight">
                    Midterm {rep.midtermTerm} — Semester {rep.semester}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Tahun Ajaran {rep.academicYear} • {rep.classNameSnapshot}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  {rep.driveFileUrl && rep.driveFileUrl !== '#' ? (
                    <a
                      href={rep.driveFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleOpenMidtermReport(rep)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
                    >
                      <ExternalLink size={14} /> Buka Rapor PDF
                    </a>
                  ) : (
                    <div className="text-center text-xs text-gray-400 font-medium py-2">
                      File sedang diproses
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}

      {/* Brand Foot-banner: Sleeker & Compact */}
      <div className="bg-emerald-900 p-6 rounded-2xl text-white overflow-hidden relative">
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/10 rounded-full blur-[64px] -ml-16 -mb-16 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <div className="space-y-2 flex-1">
            <h2 className="text-lg font-extrabold uppercase tracking-tight">
              Apresiasi Setiap Langkah Kecil Pertumbuhan! ✨
            </h2>
            <p className="text-emerald-200 font-medium text-xs leading-relaxed max-w-xl">
              Terima kasih Ayah & Bunda atas kolaborasinya dalam membimbing ananda. Mari kita rayakan setiap milestone perkembangannya dengan hangat.
            </p>
            <div className="flex flex-wrap gap-2 pt-1.5">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-lg">
                <Award className="text-emerald-400" size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Growth Mindset</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-lg">
                <Heart className="text-emerald-400" size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Well-being</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-56 shrink-0">
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-1">
              <p className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                Jadwal Konsultasi
              </p>
              <p className="text-[11px] font-bold leading-relaxed italic text-emerald-100">
                "Silakan hubungi wali kelas via Portal ini atau WhatsApp untuk jadwal diskusi rapor."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
