import * as React from 'react';
import { motion } from 'motion/react';
import {
  FileText, Download, Eye,
  Calendar, Award, ChevronLeft,
  Loader2, CheckCircle2,
  Heart
} from 'lucide-react';
import { useOutletContext, Link, useSearchParams } from 'react-router-dom';
import {
  User as AppUser,
  ReportCard,
  Student,
  ParentReportView
} from '../../types';
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
  const [activeTab, setActiveTab] = React.useState<'ACADEMIC' | 'WEEKLY'>('ACADEMIC');

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

        // IMPORTANT:
        // Parent must NOT query/list reportCards collection directly.
        // We read allowed report IDs from parentReportViews, then getDoc one by one.
        const reportIds = extractReportIdsFromViews(
          (viewsData || []) as ParentReportView[],
          studentIdsToSearch
        );

        const fetchedReports = await getReportCardsByIds(reportIds);

        const filteredReports = fetchedReports
          .filter((rc: any) => {
            if (rc.status !== 'PUBLISHED') return false;

            // support both direct studentId and studentReports[]
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

        // Weekly KG reports can still be queried narrowly by studentId
        try {
          const fetchedWeekly: WeeklyReport[] = [];
          const seenIds = new Set<string>();

          for (const sid of studentIdsToSearch) {
            try {
              const qWeekly = query(
                collection(db, 'published_kg_reports'),
                where('studentId', '==', sid)
              );

              const weeklySnap = await getDocs(qWeekly);

              weeklySnap.docs.forEach((docSnap) => {
                if (!seenIds.has(docSnap.id)) {
                  seenIds.add(docSnap.id);
                  fetchedWeekly.push({
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<WeeklyReport, 'id'>)
                  });
                }
              });
            } catch (subErr) {
              console.warn(`[ParentReports] Weekly query failed for ${sid}:`, subErr);
            }
          }

          const sentWeekly = fetchedWeekly
            .filter((report) => report.sentToParent === true)
            .sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0));

          setWeeklyReports(sentWeekly);
          setActiveTab(sentWeekly.length > 0 ? 'WEEKLY' : 'ACADEMIC');
        } catch (weeklyErr) {
          console.error('Error fetching weekly reports for parent view:', weeklyErr);
          setWeeklyReports([]);
          setActiveTab('ACADEMIC');
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

  if (!studentId) {
    return <div className="p-12 text-center font-black">Pilih ananda terlebih dahulu dari dashboard.</div>;
  }

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-4">
          <Link
            to="/parent/dashboard"
            className="group flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-emerald-600 transition-colors"
          >
            <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Dashboard
          </Link>
          <div className="space-y-1">
            <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
              Daftar <span className="text-emerald-600">Rapor</span>
            </h1>
            <p className="text-gray-400 font-bold">Rapor {student?.name} Tahun Akademik 2025/2026</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="px-6 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest">
            Total: {reports.length} Laporan
          </div>
          <div className="px-6 py-2 bg-gray-50 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest">
            Unread: {reports.filter(r => !viewedReports.has(r.id)).length}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 border-b border-gray-100 pb-1">
        <button
          id="tab-btn-academic"
          onClick={() => setActiveTab('ACADEMIC')}
          className={cn(
            'px-6 py-3 font-black uppercase text-xs tracking-widest transition-all border-b-2 -mb-[2px] text-left sm:text-center',
            activeTab === 'ACADEMIC'
              ? 'border-emerald-600 text-emerald-600 font-extrabold'
              : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
          )}
        >
          Rapor Akhir Semester & Academic
        </button>
        <button
          id="tab-btn-weekly"
          onClick={() => setActiveTab('WEEKLY')}
          className={cn(
            'px-6 py-3 font-black uppercase text-xs tracking-widest transition-all border-b-2 -mb-[2px] text-left sm:text-center',
            activeTab === 'WEEKLY'
              ? 'border-emerald-600 text-emerald-600 font-extrabold'
              : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
          )}
        >
          Laporan Mingguan (Weekly Report)
        </button>
      </div>

      {activeTab === 'ACADEMIC' ? (
        reports.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 p-20 rounded-[4rem] text-center space-y-4">
            <div className="w-20 h-20 bg-gray-100 rounded-[2rem] flex items-center justify-center mx-auto">
              <FileText className="text-gray-300" size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Tidak Ada Rapor</h3>
              <p className="text-sm text-gray-400 font-bold max-w-xs mx-auto leading-relaxed">
                Saat ini belum ada rapor yang dipublikasikan untuk periode ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {reports.map((report, idx) => {
              const isNew = !viewedReports.has(report.id);

              const publishedTime =
                (report as any).publishedAt?.seconds
                  ? new Date((report as any).publishedAt.seconds * 1000)
                  : new Date((report as any).publishedAt || 0);

              return (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={cn(
                    'group relative bg-white p-8 rounded-[3.5rem] border transition-all flex flex-col justify-between aspect-square',
                    isNew
                      ? 'border-emerald-200 shadow-xl shadow-emerald-50 ring-4 ring-emerald-50'
                      : 'border-gray-100 shadow-sm hover:shadow-xl hover:border-emerald-100'
                  )}
                >
                  {isNew && (
                    <div className="absolute -top-3 -right-3 bg-emerald-600 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg animate-bounce">
                      Baru
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div
                        className={cn(
                          'w-14 h-14 rounded-[1.5rem] flex items-center justify-center group-hover:-rotate-6 transition-all duration-500',
                          isNew
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
                        )}
                      >
                        <FileText size={28} />
                      </div>

                      <div className="text-right">
                        <div className="px-4 py-2 bg-gray-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest inline-block">
                          {(report as any).type?.split('_')[0] || 'REPORT'}
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 mt-2">
                          Published: {isNaN(publishedTime.getTime()) ? '-' : publishedTime.toLocaleDateString('id-ID')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-emerald-600 transition-colors leading-tight">
                        {(report as any).period || 'Laporan Akademik'}
                      </h3>
                      <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} /> Semester {(report as any).semester || '-'}
                        </span>
                        {viewedReports.has(report.id) && (
                          <span className="flex items-center gap-1 text-emerald-500 opacity-60">
                            <CheckCircle2 size={12} /> Sudah Dibaca
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Link
                      to={`/academic/rapor/${report.id}?view=parent`}
                      onClick={() => handleOpenReport(report.id)}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-all transform active:scale-95 shadow-xl"
                    >
                      <Eye size={14} /> Buka Laporan
                    </Link>

                    <div className="flex gap-2">
                      <button className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-emerald-600 hover:text-emerald-600 transition-all">
                        <Download size={14} /> PDF
                      </button>

                      {(report as any).isEndTerm && (
                        <button className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all">
                          <Award size={14} /> Diploma
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )
      ) : (
        weeklyReports.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 p-20 rounded-[4rem] text-center space-y-4">
            <div className="w-20 h-20 bg-gray-100 rounded-[2rem] flex items-center justify-center mx-auto">
              <Calendar className="text-emerald-600" size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Tidak Ada Laporan Mingguan</h3>
              <p className="text-sm text-gray-400 font-bold max-w-xs mx-auto leading-relaxed">
                Saat ini belum ada laporan mingguan yang dipublikasikan untuk periode ini.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {weeklyReports.map((report, idx) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="group relative bg-white p-8 rounded-[3.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-emerald-100 transition-all flex flex-col justify-between aspect-square"
              >
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 rounded-[1.5rem] bg-emerald-50 text-emerald-600 group-hover:bg-[#109E58] group-hover:text-white flex items-center justify-center group-hover:-rotate-6 transition-all duration-500">
                      <Calendar size={28} />
                    </div>

                    <div className="text-right">
                      <div className="px-4 py-2 bg-[#109E58] text-white rounded-2xl text-[9px] font-black uppercase tracking-widest inline-block">
                        Weekly
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 mt-2">
                        {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('id-ID') : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-[#109E58] transition-colors leading-tight line-clamp-2">
                      Pekan: {report.startDate} - {report.endDate}
                    </h3>
                    <div className="space-y-2 mt-1">
                      {report.theme && (
                        <span className="inline-block px-3 py-1 bg-gray-50 border border-gray-150 rounded-xl text-[10px] text-gray-600 font-extrabold uppercase">
                          Tema: {report.theme}
                        </span>
                      )}
                      {report.className && (
                        <div className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-widest block">
                          Kelas: {report.className}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-6">
                  {report.driveFileUrl ? (
                    <a
                      href={report.driveFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#109E58] transition-all transform active:scale-95 shadow-xl cursor-pointer"
                    >
                      <Eye size={14} /> Buka Laporan di Drive
                    </a>
                  ) : (
                    <div className="w-full py-4 bg-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest text-center italic">
                      Laporan PDF belum diunggah
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}

      <div className="bg-emerald-900 p-12 rounded-[4rem] text-white overflow-hidden relative">
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-400/20 rounded-full blur-[80px] -ml-20 -mb-20" />
        <div className="relative flex flex-col md:flex-row items-center gap-12">
          <div className="space-y-6 flex-1">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">
              Masa Depan Cerah Dimulai dari Sini! ✨
            </h2>
            <p className="text-emerald-200 font-bold text-lg leading-relaxed">
              Terima kasih Ayah & Bunda atas kolaborasinya dalam membimbing ananda. Mari kita apresiasi setiap langkah kecil pertumbuhannya.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-3 px-6 py-3 bg-white/10 rounded-2xl">
                <Award className="text-emerald-400" size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Growth Mindset</span>
              </div>
              <div className="flex items-center gap-3 px-6 py-3 bg-white/10 rounded-2xl">
                <Heart className="text-emerald-400" size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Well-being</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72 space-y-4">
            <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-2">
              <p className="text-[10px] font-black uppercase text-emerald-400 underline decoration-2 underline-offset-4">
                Jadwal Konsultasi
              </p>
              <p className="text-sm font-bold leading-relaxed italic">
                "Silakan hubungi wali kelas via Portal ini atau WhatsApp untuk jadwal diskusi rapor."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}