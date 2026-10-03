import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Download, Eye, 
  Calendar, Award, ChevronLeft,
  Loader2, ExternalLink, Send
} from 'lucide-react';
import { useOutletContext, Link } from 'react-router-dom';
import { 
  User as AppUser, 
  ReportCard,
  Student
} from '../../types';
import { 
  getReportCards,
  getStudentById
} from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'sonner';

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getIndonesianMonthLabel(periodKey: string): string {
  if (!periodKey || !periodKey.includes('-')) return '';
  const [year, month] = periodKey.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${indonesianMonths[monthIdx]} ${year}`;
  }
  return periodKey;
}

export default function StudentReports() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { activeYear, activeSemester } = useAcademicYear();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [reports, setReports] = React.useState<ReportCard[]>([]);
  const [kgReports, setKgReports] = React.useState<any[]>([]);
  const [kgMidtermReports, setKgMidtermReports] = React.useState<any[]>([]);
  const [elemMidtermReports, setElemMidtermReports] = React.useState<any[]>([]);
  const [jhMidtermReports, setJhMidtermReports] = React.useState<any[]>([]);
  const [jhManualLinks, setJhManualLinks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedReportForViewer, setSelectedReportForViewer] = React.useState<any | null>(null);

  React.useEffect(() => {
    let unsubscribeJh: (() => void) | undefined;

    const fetchReports = async () => {
      setLoading(true);
      try {
        const searchId = currentUser?.luminaId || (currentUser as any)?.studentId || currentUser?.uid || '';
        let student = await getStudentById(searchId);

        if (!student && currentUser) {
          student = {
            id: currentUser.luminaId || currentUser.uid,
            luminaId: currentUser.luminaId || currentUser.uid,
            name: currentUser.displayName || currentUser.email || 'Ananda',
            email: currentUser.email || '',
            currentUnit: currentUser.unitId || 'ELEMENTARY',
            unitId: currentUser.unitId || 'ELEMENTARY',
            academicYear: activeYear || '2025/2026',
            classId: (currentUser as any).classId || 'TBD',
            status: 'active'
          } as Student;
        }
        setStudentData(student);

        const candidateIds = new Set<string>();
        if (student?.id) candidateIds.add(String(student.id).trim());
        if (student?.luminaId) candidateIds.add(String(student.luminaId).trim());
        if ((student as any)?.docId) candidateIds.add(String((student as any).docId).trim());
        if (currentUser?.luminaId) candidateIds.add(String(currentUser.luminaId).trim());
        if (currentUser?.uid) candidateIds.add(String(currentUser.uid).trim());
        if ((currentUser as any)?.studentId) candidateIds.add(String((currentUser as any).studentId).trim());

        const effectiveUnit = student?.unitId || currentUser?.unitId || 'ELEMENTARY';

        if (effectiveUnit === 'KINDERGARTEN') {
          const studentIdClean = (student?.id || student?.luminaId || currentUser?.luminaId || '').trim();
          
          // 1. Weekly Reports (existing logic unchanged)
          const qWeekly = query(
            collection(db, 'published_kg_reports'),
            where('studentId', '==', studentIdClean),
            where('academicYear', '==', activeYear),
            where('status', '==', 'sent')
          );
          const snapWeekly = await getDocs(qWeekly);
          const listWeekly = snapWeekly.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          } as any));
          setKgReports(listWeekly.sort((a: any, b: any) => (b.publishedAt || 0) - (a.publishedAt || 0)));

          // 2. Midterm Reports Tracking
          const qMidterm = query(
            collection(db, 'kg_midterm_delivery_tracking'),
            where('studentId', '==', studentIdClean),
            where('activeForStudent', '==', true)
          );
          const snapMidterm = await getDocs(qMidterm);
          const listMidterm: any[] = [];
          snapMidterm.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.deliveryStatus === 'SENT' || data.deliveryStatus === 'VIEWED') {
              listMidterm.push({
                id: docSnap.id,
                ...data
              });
            }
          });
          setKgMidtermReports(listMidterm.sort((a: any, b: any) => (b.sentAt || b.updatedAt || 0) - (a.sentAt || a.updatedAt || 0)));
        } else {
          const allReports = await getReportCards({
             unitId: effectiveUnit as any,
             academicYear: activeYear || '2025/2026',
             status: 'PUBLISHED'
          });
          
          // Filter reports where student is included
          const studentReports = allReports.filter(rc => 
            rc.studentReports.some(sr => candidateIds.has(sr.studentId))
          );
          
          setReports(studentReports.sort((a, b) => b.createdAt - a.createdAt));

          // Fetch Elementary Midterm Delivery Tracking if unit is ELEMENTARY
          if (effectiveUnit === 'ELEMENTARY') {
            const listElemMidterm: any[] = [];
            const userUid = currentUser?.uid || '';

            // 1. Primary: Query by studentUid == auth.uid
            if (userUid) {
              try {
                const qUid = query(
                  collection(db, 'elem_midterm_delivery_tracking'),
                  where('studentUid', '==', userUid)
                );
                const snapUid = await getDocs(qUid);
                snapUid.docs.forEach(docSnap => {
                  const data = docSnap.data();
                  const st = String(data.deliveryStatus || '').toLowerCase();
                  if (
                    data.activeForStudent !== false &&
                    (st === 'sent' || st === 'viewed')
                  ) {
                    if (!listElemMidterm.some(item => item.id === docSnap.id)) {
                      listElemMidterm.push({ id: docSnap.id, ...data });
                    }
                  }
                });
              } catch (e) {
                console.warn("[StudentReports] studentUid query:", e);
              }

              // 2. Query by studentAccountId == auth.uid
              try {
                const qAcc = query(
                  collection(db, 'elem_midterm_delivery_tracking'),
                  where('studentAccountId', '==', userUid)
                );
                const snapAcc = await getDocs(qAcc);
                snapAcc.docs.forEach(docSnap => {
                  const data = docSnap.data();
                  const st = String(data.deliveryStatus || '').toLowerCase();
                  if (
                    data.activeForStudent !== false &&
                    (st === 'sent' || st === 'viewed')
                  ) {
                    if (!listElemMidterm.some(item => item.id === docSnap.id)) {
                      listElemMidterm.push({ id: docSnap.id, ...data });
                    }
                  }
                });
              } catch (e) {
                console.warn("[StudentReports] studentAccountId query:", e);
              }
            }

            // 3. Fallback: Query by internal studentId matching
            if (listElemMidterm.length === 0) {
              for (const stId of Array.from(candidateIds)) {
                if (!stId) continue;
                try {
                  const qElem = query(
                    collection(db, 'elem_midterm_delivery_tracking'),
                    where('studentId', '==', stId)
                  );
                  const snapElem = await getDocs(qElem);
                  snapElem.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const st = String(data.deliveryStatus || '').toLowerCase();
                    if (
                      data.activeForStudent !== false &&
                      (st === 'sent' || st === 'viewed')
                    ) {
                      if (!listElemMidterm.some(item => item.id === docSnap.id)) {
                        listElemMidterm.push({ id: docSnap.id, ...data });
                      }
                    }
                  });
                } catch (e) {
                  console.warn("[StudentReports] studentId query:", e);
                }
              }
            }

            setElemMidtermReports(listElemMidterm.sort((a, b) => (b.sentAt || b.updatedAt || 0) - (a.sentAt || a.updatedAt || 0)));
          }

          // Fetch manual junior high PDF links if unit is JUNIOR_HIGH
          if (effectiveUnit === 'JUNIOR_HIGH') {
            const primaryId = (student?.id || student?.luminaId || (currentUser as any)?.studentId || currentUser?.luminaId || currentUser?.uid || '').trim();
            const candidateList = Array.from(candidateIds).filter(Boolean);
            if (primaryId && !candidateList.includes(primaryId)) candidateList.push(primaryId);

            // 1. Fetch Junior High Midterm Delivery Tracking based on studentId as primary key
            const listJhMidterm: any[] = [];
            for (const stId of candidateList) {
              try {
                const qJh = query(
                  collection(db, 'jh_midterm_delivery_tracking'),
                  where('studentId', '==', stId)
                );
                const snapJh = await getDocs(qJh);
                snapJh.docs.forEach(docSnap => {
                  const data = docSnap.data();
                  const st = String(data.deliveryStatus || '').toUpperCase();
                  if (
                    data.activeForStudent !== false &&
                    (st === 'SENT' || st === 'VIEWED')
                  ) {
                    if (!listJhMidterm.some(item => item.id === docSnap.id)) {
                      listJhMidterm.push({ id: docSnap.id, ...data });
                    }
                  }
                });
              } catch (e) {
                console.warn("[StudentReports] JH midterm studentId query error:", e);
              }
            }

            // Also check by studentUid / studentAccountId if currentUser.uid is available
            const userUid = currentUser?.uid || '';
            if (userUid) {
              try {
                const qUid = query(
                  collection(db, 'jh_midterm_delivery_tracking'),
                  where('studentUid', '==', userUid)
                );
                const snapUid = await getDocs(qUid);
                snapUid.docs.forEach(docSnap => {
                  const data = docSnap.data();
                  const st = String(data.deliveryStatus || '').toUpperCase();
                  if (
                    data.activeForStudent !== false &&
                    (st === 'SENT' || st === 'VIEWED')
                  ) {
                    if (!listJhMidterm.some(item => item.id === docSnap.id)) {
                      listJhMidterm.push({ id: docSnap.id, ...data });
                    }
                  }
                });
              } catch (e) {
                console.warn("[StudentReports] JH midterm studentUid query error:", e);
              }
            }

            setJhMidtermReports(listJhMidterm.sort((a, b) => (b.sentAt || b.updatedAt || 0) - (a.sentAt || a.updatedAt || 0)));

            // 2. Fetch manual junior high PDF links
            const qJhManual = query(
              collection(db, 'manual_junior_high_report_links'),
              where('studentId', '==', primaryId),
              where('status', '==', 'PUBLISHED')
            );
            unsubscribeJh = onSnapshot(qJhManual, (snapshot) => {
              const jhLinks = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
              } as any));
              setJhManualLinks(jhLinks);
            }, (err) => {
              console.error("onSnapshot error in StudentReports:", err);
            });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();

    return () => {
      if (unsubscribeJh) {
        unsubscribeJh();
      }
    };
  }, [currentUser, activeYear]);

  const handlePdfClick = async (reportId: string) => {
    try {
      const reportRef = doc(db, 'published_kg_reports', reportId);
      await updateDoc(reportRef, {
        pdfOpenedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Failed to track PDF open status:", err);
    }
  };

  const handleMidtermPdfClick = async (report: any) => {
    try {
      if (report.id) {
        const trackingRef = doc(db, 'kg_midterm_delivery_tracking', report.id);
        const historyLog = report.history || [];
        historyLog.push({
          action: 'VIEWED',
          timestamp: Date.now(),
          actorUid: currentUser?.uid || 'student'
        });

        const now = Date.now();
        const updatePayload = {
          deliveryStatus: 'VIEWED',
          firstViewedAt: report.firstViewedAt || now,
          lastViewedAt: now,
          viewCount: (report.viewCount || 0) + 1,
          history: historyLog,
          updatedAt: now
        };

        await setDoc(trackingRef, updatePayload, { merge: true });

        setKgMidtermReports(prev =>
          prev.map(r => r.id === report.id ? { ...r, ...updatePayload } : r)
        );
      }
    } catch (err) {
      console.warn("Failed to update midterm tracking view:", err);
    }

    const pdfUrl = report.pdfUrl || report.driveFileUrl;
    if (pdfUrl) {
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast.error("URL PDF tidak tersedia.");
    }
  };

  const handleElemMidtermPdfClick = async (report: any) => {
    try {
      if (report.id) {
        const trackingRef = doc(db, 'elem_midterm_delivery_tracking', report.id);
        const historyLog = Array.isArray(report.history) ? [...report.history] : [];
        historyLog.push({
          action: 'VIEWED',
          timestamp: Date.now(),
          actorUid: currentUser?.uid || 'student'
        });

        const now = Date.now();
        const updatePayload = {
          deliveryStatus: 'viewed',
          firstOpenedAt: report.firstOpenedAt || report.firstViewedAt || now,
          firstViewedAt: report.firstViewedAt || report.firstOpenedAt || now,
          lastOpenedAt: now,
          lastViewedAt: now,
          openCount: (report.openCount || report.viewCount || 0) + 1,
          viewCount: (report.viewCount || report.openCount || 0) + 1,
          openedByEmail: currentUser?.email || '',
          history: historyLog,
          updatedAt: now
        };

        await setDoc(trackingRef, updatePayload, { merge: true });

        setElemMidtermReports(prev =>
          prev.map(r => r.id === report.id ? { ...r, ...updatePayload } : r)
        );
      }
    } catch (err) {
      console.warn("Failed to update elem midterm tracking view:", err);
    }

    const pdfUrl = report.activePdfUrl || report.pdfUrl || report.driveFileUrl;
    if (pdfUrl) {
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast.error("URL PDF tidak tersedia.");
    }
  };

  const handleJhMidtermPdfClick = (report: any) => {
    setSelectedReportForViewer(report);

    // Update the local list so the UI immediately shows "Dilihat"
    setJhMidtermReports(prev =>
      prev.map(r => {
        if (r.id === report.id) {
          const now = Date.now();
          return {
            ...r,
            deliveryStatus: 'VIEWED',
            firstOpenedAt: r.firstOpenedAt || r.firstViewedAt || now,
            firstViewedAt: r.firstViewedAt || r.firstOpenedAt || now,
            lastOpenedAt: now,
            lastViewedAt: now,
            openCount: (r.openCount || r.viewCount || 0) + 1,
            viewCount: (r.viewCount || r.openCount || 0) + 1
          };
        }
        return r;
      })
    );
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (studentData?.unitId === 'KINDERGARTEN') {
    return (
      <div className="max-w-5xl mx-auto space-y-10 pb-20 animate-in fade-in duration-700">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gray-400">
          Rapor Saya
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Rapor <span className="text-blue-600">Saya</span>
          </h1>
          <p className="text-gray-500 font-medium">
            Lihat rapor yang telah diterbitkan sekolah.
          </p>
        </div>

        {/* SECTION 1: WEEKLY REPORT */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Calendar size={16} className="text-purple-600" />
              WEEKLY REPORT
            </h2>
          </div>

          {kgReports.length === 0 ? (
            <div className="bg-white border border-gray-100 p-8 rounded-3xl text-center space-y-1 shadow-sm">
              <p className="text-sm font-bold text-gray-700">Belum Ada Weekly Report</p>
              <p className="text-xs text-gray-400 font-medium">
                Sekolah belum menerbitkan laporan mingguan untuk periode ini.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="py-4 px-6">Tahun Ajaran</th>
                      <th className="py-4 px-6">Semester</th>
                      <th className="py-4 px-6">Periode</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm font-semibold text-gray-700">
                    {kgReports.map((report) => {
                      const semesterText = report.semester || activeSemester || "Semester 1";
                      const periodText = report.theme ? `${report.theme}${report.week ? ` - Minggu ${report.week}` : ''}` : (report.period || 'Ganjil');
                      return (
                        <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-4 px-6 font-bold text-gray-900">{report.academicYear}</td>
                          <td className="py-4 px-6">{semesterText}</td>
                          <td className="py-4 px-6">{periodText}</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Diterbitkan
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-2">
                              {report.reportSnapshot ? (
                                <Link
                                  to={`/student/weekly-report/${report.id}`}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                                >
                                  <Eye size={12} /> Lihat Mobile
                                </Link>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <button
                                    disabled
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-black uppercase tracking-wider border border-gray-200 cursor-not-allowed"
                                  >
                                    <Eye size={12} /> Lihat Mobile
                                  </button>
                                  <span className="text-[9px] text-gray-400 font-bold mt-1 text-right max-w-[180px] leading-normal">
                                    Tampilan mobile tersedia untuk laporan setelah pembaruan sistem.
                                  </span>
                                </div>
                              )}

                              {report.driveFileUrl && (
                                <a
                                  href={report.driveFileUrl}
                                  onClick={() => handlePdfClick(report.id)}
                                  target="_blank"
                                  rel="referrer noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap"
                                >
                                  <FileText size={12} /> Lihat PDF
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: MIDTERM REPORT */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
              <FileText size={16} className="text-emerald-600" />
              MIDTERM REPORT
            </h2>
          </div>

          {kgMidtermReports.length === 0 ? (
            <div className="bg-white border border-gray-100 p-8 rounded-3xl text-center space-y-1 shadow-sm">
              <p className="text-sm font-bold text-gray-700">Belum ada laporan Midterm yang dikirim untuk Anda.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="py-4 px-6">Tahun Ajaran</th>
                      <th className="py-4 px-6">Semester</th>
                      <th className="py-4 px-6">Periode</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm font-semibold text-gray-700">
                    {kgMidtermReports.map((report) => {
                      const academicYear = report.academicYear || activeYear || '2026/2027';
                      const sem = report.semester || 1;
                      const periodLabel = `Midterm ${sem}`;

                      return (
                        <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-4 px-6 font-bold text-gray-900">{academicYear}</td>
                          <td className="py-4 px-6">{sem}</td>
                          <td className="py-4 px-6 font-bold text-gray-800">{periodLabel}</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Diterbitkan
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => handleMidtermPdfClick(report)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                            >
                              <FileText size={12} /> Lihat PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>
    );
  }

  if (studentData?.unitId === 'ELEMENTARY' || currentUser?.unitId === 'ELEMENTARY') {
    return (
      <div className="max-w-5xl mx-auto space-y-10 pb-20 animate-in fade-in duration-700">
        <div className="space-y-4">
          <Link to="/student/dashboard" className="group flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-blue-600 transition-colors">
            <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Dashboard
          </Link>
          <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Rapor <span className="text-blue-600">Saya</span>
          </h1>
          <p className="text-gray-400 font-bold max-w-lg">
            Daftar hasil belajarmu yang sudah diterbitkan sekolah.
          </p>
        </div>

        {/* SECTION: MIDTERM REPORT */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
              <FileText size={16} className="text-emerald-600" />
              MIDTERM REPORT
            </h2>
          </div>

          {elemMidtermReports.length === 0 ? (
            <div className="bg-white border border-gray-100 p-8 rounded-3xl text-center space-y-1 shadow-sm">
              <p className="text-sm font-bold text-gray-700">Belum ada laporan Midterm yang dikirim untuk Anda.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="py-4 px-6">Tahun Ajaran</th>
                      <th className="py-4 px-6">Semester</th>
                      <th className="py-4 px-6">Periode</th>
                      <th className="py-4 px-6">Versi PDF</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm font-semibold text-gray-700">
                    {elemMidtermReports.map((report) => {
                      const academicYear = report.academicYear || activeYear || '2026/2027';
                      const sem = report.semester || 1;
                      const term = report.midtermTerm || 1;
                      const periodLabel = `Mid Term ${term}`;
                      const isViewed = String(report.deliveryStatus || '').toLowerCase() === 'viewed';
                      const versionText = report.reportVersion ? `v${report.reportVersion}` : 'v1';

                      return (
                        <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-4 px-6 font-bold text-gray-900">{academicYear}</td>
                          <td className="py-4 px-6">Semester {sem}</td>
                          <td className="py-4 px-6 font-bold text-gray-800">{periodLabel}</td>
                          <td className="py-4 px-6 font-black text-gray-700">{versionText}</td>
                          <td className="py-4 px-6">
                            {isViewed ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                <Eye size={12} /> Dilihat
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                                <Send size={12} /> Terkirim
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => handleElemMidtermPdfClick(report)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                            >
                              <FileText size={12} /> Buka Rapor PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* SECTION: ACADEMIC REPORT CARDS */}
        {reports.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Award size={16} className="text-blue-600" />
                RAPOR AKHIR SEMESTER
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {reports.map((report, idx) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-blue-100 hover:border-blue-100 transition-all flex flex-col justify-between aspect-square"
                >
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                        <FileText className="text-blue-600 group-hover:text-white" size={28} />
                      </div>
                      <div className="px-4 py-2 bg-gray-950 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest">
                        {report.type.replace('_', ' ')}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                        {report.period}
                      </h3>
                      <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                        <span className="flex items-center gap-1"><Calendar size={12} /> Sem {report.semester}</span>
                        <span className="w-1 h-1 bg-gray-300 rounded-full" />
                        <span>{report.academicYear}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Link 
                      to={`/academic/rapor/${report.id}?view=student`} 
                      className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 hover:text-white transition-all transform active:scale-95"
                    >
                      <Eye size={14} /> Lihat Detail
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      <div className="space-y-4">
        <Link to="/student/dashboard" className="group flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-blue-600 transition-colors">
          <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Dashboard
        </Link>
        <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
          Rapor <span className="text-blue-600">Saya</span>
        </h1>
        <p className="text-gray-400 font-bold max-w-lg">
          Daftar hasil belajarmu yang sudah diterbitkan sekolah. Klik untuk melihat detail atau mengunduh file.
        </p>
      </div>

      {reports.length === 0 && jhManualLinks.length === 0 && jhMidtermReports.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 p-20 rounded-[3rem] text-center space-y-4">
          <div className="w-20 h-20 bg-gray-100 rounded-[2rem] flex items-center justify-center mx-auto">
            <FileText className="text-gray-300" size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Belum Ada Rapor</h3>
            <p className="text-sm text-gray-400 font-bold max-w-xs mx-auto">Sekolah belum menerbitkan rapor untuk periode ini.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {/* SECTION: JUNIOR HIGH MIDTERM REPORT */}
          {jhMidtermReports.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <FileText size={16} className="text-emerald-600" />
                  MIDTERM REPORT
                </h2>
              </div>

              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-[11px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                        <th className="py-4 px-6">Tahun Ajaran</th>
                        <th className="py-4 px-6">Semester</th>
                        <th className="py-4 px-6">Periode</th>
                        <th className="py-4 px-6">Versi PDF</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm font-semibold text-gray-700">
                      {jhMidtermReports.map((report) => {
                        const academicYear = report.academicYear || activeYear || '2025/2026';
                        const sem = report.semester || 1;
                        const term = report.midtermTerm || 1;
                        const periodLabel = `Mid Term ${term}`;
                        const isViewed = String(report.deliveryStatus || '').toUpperCase() === 'VIEWED';
                        const versionText = report.reportVersion ? `v${report.reportVersion}` : 'v1';

                        return (
                          <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 px-6 font-bold text-gray-900">{academicYear}</td>
                            <td className="py-4 px-6">Semester {sem}</td>
                            <td className="py-4 px-6 font-bold text-gray-800">{periodLabel}</td>
                            <td className="py-4 px-6 font-black text-gray-700">{versionText}</td>
                            <td className="py-4 px-6">
                              {isViewed ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                  <Eye size={12} /> Dilihat
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  <Send size={12} /> Terkirim
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <button
                                onClick={() => handleJhMidtermPdfClick(report)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                              >
                                <FileText size={12} /> Buka Rapor PDF
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {reports.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">
                Laporan Hasil Belajar <span className="text-blue-600">Akademik</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {reports.map((report, idx) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-blue-100 hover:border-blue-100 transition-all flex flex-col justify-between aspect-square"
                  >
                    <div className="space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                          <FileText className="text-blue-600 group-hover:text-white" size={28} />
                        </div>
                        <div className="px-4 py-2 bg-gray-950 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest">
                          {report.type.replace('_', ' ')}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                          {report.period}
                        </h3>
                        <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                          <span className="flex items-center gap-1"><Calendar size={12} /> Sem {report.semester}</span>
                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                          <span>{report.academicYear}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Link 
                        to={`/academic/rapor/${report.id}?view=student`} 
                        className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-900 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 hover:text-white transition-all transform active:scale-95"
                      >
                        <Eye size={14} /> Lihat Detail
                      </Link>
                      
                      <div className="flex gap-2">
                         <button className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all">
                            <Download size={14} /> PDF
                         </button>
                         {report.isEndTerm && (
                           <button className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-emerald-600 hover:text-emerald-600 transition-all">
                              <Award size={14} /> Profile
                           </button>
                         )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {jhManualLinks.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">
                Rapor Bulanan <span className="text-blue-600">PDF (Drive Link)</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {jhManualLinks.map((link, idx) => {
                  const monthLabel = getIndonesianMonthLabel(link.periodKey);
                  return (
                    <motion.div
                      key={link.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-100 hover:border-indigo-100 transition-all flex flex-col justify-between aspect-square"
                    >
                      <div className="space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-14 h-14 bg-indigo-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-indigo-600 group-hover:-rotate-6 transition-all duration-500">
                            <FileText className="text-indigo-600 group-hover:text-white" size={28} />
                          </div>
                          <div className="px-4 py-2 bg-indigo-950 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest">
                            MONTHLY PDF
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-indigo-600 transition-colors leading-tight">
                            {monthLabel || 'Rapor Bulanan'}
                          </h3>
                          <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                            <span className="flex items-center gap-1"><Calendar size={12} /> Sem {link.semester}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span>{link.academicYear}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={() => setSelectedReportForViewer({
                            id: link.id,
                            type: 'MONTHLY',
                            driveFileUrl: link.driveUrl,
                            academicYear: link.academicYear || activeYear,
                            semester: link.semester || 1,
                            studentName: studentData?.name || currentUser?.displayName
                          })}
                          className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all transform active:scale-95 shadow-sm shadow-indigo-100 text-center cursor-pointer"
                        >
                          <ExternalLink size={14} className="inline mr-1" /> Lihat Rapor (Drive)
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Motivational Card */}
      <div className="bg-gray-900 p-12 rounded-[4rem] text-white overflow-hidden relative">
         <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] -mr-32 -mt-32" />
         <div className="relative space-y-6">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter max-w-lg">
              Teruslah Bertumbuh & Berpikir Kritis! 🚀
            </h2>
            <p className="text-gray-400 font-bold text-lg max-w-xl leading-relaxed">
              Hasil belajarmu adalah cerminan dari usahamu. Jika ada nilai yang ingin kamu tingkatkan, jangan ragu untuk bertanya pada gurumu ya!
            </p>
            <div className="flex gap-4">
               <button className="px-8 py-4 bg-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-colors">
                 Melihat Pencapaian
               </button>
               <button className="px-8 py-4 bg-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white/20 transition-colors">
                 Beri Feedback Portal
               </button>
            </div>
         </div>
      </div>

      {selectedReportForViewer && (
        <PdfViewerModal
          report={selectedReportForViewer}
          onClose={() => setSelectedReportForViewer(null)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// GORGEOUS SYSTEM-INTEGRATED SAFARI-SAFE PDF VIEWER
// ----------------------------------------------------------------------
interface PdfViewerModalProps {
  report: any;
  onClose: () => void;
  currentUser: AppUser;
}

export function PdfViewerModal({ report, onClose, currentUser }: PdfViewerModalProps) {
  const [driveFileId, setDriveFileId] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [showWarning, setShowWarning] = React.useState<boolean>(false);
  const hasTrackedRef = React.useRef(false);

  const driveFileUrl = report.driveFileUrl || report.pdfUrl || report.activePdfUrl || '';

  // 1. Extract file ID helper
  const extractDriveFileId = (url: string): string => {
    if (!url) return '';
    const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (fileDMatch && fileDMatch[1]) return fileDMatch[1];
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) return idMatch[1];
    return '';
  };

  // 2. Fetch published report for precise driveFileId & perform tracking
  React.useEffect(() => {
    let isMounted = true;

    const initializeViewer = async () => {
      // a. Start tracking (async, non-blocking, error-safe)
      if (report.type !== 'MONTHLY' && report.id && !hasTrackedRef.current) {
        hasTrackedRef.current = true;
        // Run tracking as non-blocking async
        (async () => {
          try {
            const trackingRef = doc(db, 'jh_midterm_delivery_tracking', report.id);
            const historyLog = Array.isArray(report.history) ? [...report.history] : [];
            historyLog.push({
              action: 'VIEWED',
              timestamp: Date.now(),
              actorUid: currentUser?.uid || 'student'
            });

            const now = Date.now();
            const updatePayload = {
              deliveryStatus: 'VIEWED',
              isOpened: true, // as requested: isOpened = true
              firstOpenedAt: report.firstOpenedAt || report.firstViewedAt || now,
              firstViewedAt: report.firstViewedAt || report.firstOpenedAt || now,
              lastOpenedAt: now,
              lastViewedAt: now,
              openCount: (report.openCount || report.viewCount || 0) + 1,
              viewCount: (report.viewCount || report.openCount || 0) + 1,
              openedByEmail: currentUser?.email || '',
              history: historyLog,
              updatedAt: now
            };

            await setDoc(trackingRef, updatePayload, { merge: true });
          } catch (err) {
            console.error("Failed to update jh midterm tracking view:", err);
          }
        })();
      }

      // b. Resolve driveFileId
      try {
        if (report.type === 'MONTHLY') {
          const fid = extractDriveFileId(driveFileUrl);
          if (isMounted) {
            setDriveFileId(fid);
            setLoading(false);
          }
        } else {
          // Midterm Report
          // First attempt: try fetching from jh_midterm_published_reports
          const reportId = report.reportId || report.activeReportId;
          if (reportId) {
            const pubSnap = await getDocs(
              query(
                collection(db, 'jh_midterm_published_reports'),
                where('id', '==', reportId)
              )
            );
            if (!pubSnap.empty) {
              const pubData = pubSnap.docs[0].data();
              if (pubData.driveFileId && isMounted) {
                setDriveFileId(pubData.driveFileId);
                setLoading(false);
                return;
              }
            }
          }

          // Fallback: parse from tracking pdfUrl / driveFileUrl
          const fid = report.pdfFileId || report.driveFileId || extractDriveFileId(driveFileUrl);
          if (isMounted) {
            setDriveFileId(fid);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Error resolving driveFileId:", err);
        const fid = report.pdfFileId || report.driveFileId || extractDriveFileId(driveFileUrl);
        if (isMounted) {
          setDriveFileId(fid);
          setLoading(false);
        }
      }
    };

    initializeViewer();

    // c. Safari cross-site tracking / fallback warning after 4.5 seconds
    const timer = setTimeout(() => {
      if (isMounted) {
        setShowWarning(true);
      }
    }, 4500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [report, driveFileUrl, currentUser]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                {report.type === 'MONTHLY' ? 'Rapor Bulanan' : 'Midterm Report Viewer'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {report.studentName || report.studentNameSnapshot || currentUser?.displayName || 'Siswa'} • {report.academicYear} (Semester {report.semester})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl cursor-pointer transition-colors uppercase tracking-wider"
          >
            Kembali
          </button>
        </div>

        {/* Viewer Content */}
        <div className="flex-1 bg-slate-100 p-4 relative flex flex-col items-center justify-center min-h-[50vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center text-slate-500 gap-3">
              <Loader2 size={32} className="animate-spin text-blue-600" />
              <p className="text-xs font-black uppercase tracking-wider">Menyiapkan Dokumen Rapor...</p>
            </div>
          ) : driveFileId ? (
            <div className="w-full h-full relative flex flex-col">
              
              {/* Optional browser block helper banner */}
              {showWarning && (
                <div className="mb-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900 shadow-sm">
                  <span className="text-base mt-0.5">⚠️</span>
                  <div className="space-y-1">
                    <p className="font-black leading-tight">Apakah dokumen tidak muncul?</p>
                    <p className="font-semibold text-slate-500 text-[11px] leading-relaxed">
                      Beberapa peramban (terutama Safari pada iPhone/iPad/Mac) memblokir sematan Google Drive demi privasi ("Prevent Cross-Site Tracking"). Jika layar di bawah kosong atau meminta login, silakan klik tombol <strong>"Buka di Tab Baru"</strong> di atas/bawah.
                    </p>
                  </div>
                </div>
              )}

              {/* PDF Iframe */}
              <iframe
                src={`https://drive.google.com/file/d/${driveFileId}/preview`}
                className="w-full flex-1 rounded-2xl border border-slate-200 shadow-xs"
                title="Google Drive PDF Preview"
                allow="autoplay"
              />
            </div>
          ) : (
            <div className="text-center p-8 max-w-md space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                ⚠️
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-800">Pratinjau Gagal Dimuat</h4>
                <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                  Kami tidak dapat memuat pratinjau dokumen ini secara langsung di halaman. Anda tetap dapat membuka atau mengunduhnya secara aman di luar sistem.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Lazuardi Junior High Student Portal
          </div>
          <div className="flex items-center gap-2">
            
            {/* Standard Anchor Link - 100% pop-up blocker proof */}
            {driveFileUrl && (
              <a
                href={driveFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
              >
                <ExternalLink size={14} />
                <span>Buka di Tab Baru</span>
              </a>
            )}

            {driveFileUrl && (
              <a
                href={driveFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
              >
                <Download size={14} />
                <span>Unduh</span>
              </a>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl uppercase tracking-wider cursor-pointer"
            >
              Kembali
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
