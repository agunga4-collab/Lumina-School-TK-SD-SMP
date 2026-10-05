import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Download, Eye, 
  Calendar, Award, ChevronLeft,
  Loader2, ExternalLink, Send, X
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
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, onSnapshot, increment } from 'firebase/firestore';
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
  const [jhOtherReports, setJhOtherReports] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedReportForViewer, setSelectedReportForViewer] = React.useState<any | null>(null);
  const [selectedOtherReport, setSelectedOtherReport] = React.useState<any | null>(null);
  
  const [views, setViews] = React.useState<any[]>([]);
  const [activeReportForPopup, setActiveReportForPopup] = React.useState<any | null>(null);
  const [submittingView, setSubmittingView] = React.useState(false);

  const formatViewTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const d = date.getDate();
    const m = indonesianMonths[date.getMonth()];
    const y = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${d} ${m} ${y}, ${hours}.${minutes}`;
  };

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
          let studentReports: any[] = [];
          try {
            const studentIdVal = (student?.nis || student?.luminaId || (currentUser as any)?.studentId || currentUser?.luminaId || '').trim();
            const allReports = await getReportCards({
               unitId: effectiveUnit as any,
               academicYear: activeYear || '2025/2026',
               status: 'PUBLISHED',
               studentId: studentIdVal || undefined
            });
            
            // Filter reports where student is included
            studentReports = allReports.filter(rc => 
              rc.studentReports.some(sr => candidateIds.has(sr.studentId))
            );
          } catch (rcErr) {
            console.warn("[StudentReports] getReportCards failed (isolated fallback):", rcErr);
          }
          
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

            // Fetch Elementary Other Report links (published only)
            const elemPrimaryId = (
              student?.nis || 
              student?.luminaId || 
              (currentUser as any)?.studentId || 
              currentUser?.luminaId || 
              student?.id || 
              currentUser?.uid || 
              ''
            ).trim();

            if (elemPrimaryId) {
              const loadElemOtherReports = async () => {
                const matchedReports: any[] = [];
                console.log(`[StudentReports] Initiating query on collection 'elem_other_report_links' with filters: studentId == '${elemPrimaryId}' AND status == 'PUBLISHED'`);
                try {
                  const qElemOther = query(
                    collection(db, 'elem_other_report_links'),
                    where('studentId', '==', elemPrimaryId),
                    where('status', '==', 'PUBLISHED')
                  );
                  const snap = await getDocs(qElemOther);
                  console.log(`[StudentReports] Query on 'elem_other_report_links' succeeded. Returned ${snap.docs.length} documents.`);
                  
                  snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    console.log(`[StudentReports] Found other report document ID: '${docSnap.id}', data:`, data);
                    matchedReports.push({
                      id: docSnap.id,
                      _collection: 'elem_other_report_links',
                      ...data
                    });
                  });
                } catch (err: any) {
                  console.error(`[StudentReports] Query on 'elem_other_report_links' failed! Collection: 'elem_other_report_links', Filters: studentId == '${elemPrimaryId}' AND status == 'PUBLISHED'. Error Code/Message:`, err);
                }
                
                matchedReports.sort((a, b) => {
                  const timeA = a.publishedAt?.toMillis ? a.publishedAt.toMillis() : (typeof a.publishedAt === 'number' ? a.publishedAt : (a.createdAt?.toMillis ? a.createdAt.toMillis() : (typeof a.createdAt === 'number' ? a.createdAt : 0)));
                  const timeB = b.publishedAt?.toMillis ? b.publishedAt.toMillis() : (typeof b.publishedAt === 'number' ? b.publishedAt : (b.createdAt?.toMillis ? b.createdAt.toMillis() : (typeof b.createdAt === 'number' ? b.createdAt : 0)));
                  return timeB - timeA;
                });
                
                setJhOtherReports(matchedReports);
              };
              
              loadElemOtherReports();
            }
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
              // Sort by periodKey descending (newest period first)
              jhLinks.sort((a, b) => (b.periodKey || '').localeCompare(a.periodKey || ''));
              setJhManualLinks(jhLinks);
            }, (err) => {
              console.error("onSnapshot error in StudentReports manual links:", err);
            });

            // 3. Fetch monthlyReportViews real-time
            const qViews = query(
              collection(db, 'monthlyReportViews'),
              where('studentId', '==', primaryId)
            );
            const unsubscribeViews = onSnapshot(qViews, (snapshot) => {
              const list = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
              } as any));
              setViews(list);
            }, (err) => {
              console.error("onSnapshot error in monthlyReportViews:", err);
            });

            // 4. Fetch Junior High Other Report links (published only)
            const qOtherReports = query(
              collection(db, 'jh_other_report_links'),
              where('studentId', '==', primaryId),
              where('status', '==', 'PUBLISHED')
            );
            const unsubscribeOther = onSnapshot(qOtherReports, (snapshot) => {
              const otherList = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
              } as any));
              // Urutkan dari yang terbaru (publishedAt or createdAt or updatedAt descending)
              otherList.sort((a, b) => {
                const timeA = a.publishedAt?.toMillis ? a.publishedAt.toMillis() : (typeof a.publishedAt === 'number' ? a.publishedAt : (a.createdAt?.toMillis ? a.createdAt.toMillis() : (typeof a.createdAt === 'number' ? a.createdAt : 0)));
                const timeB = b.publishedAt?.toMillis ? b.publishedAt.toMillis() : (typeof b.publishedAt === 'number' ? b.publishedAt : (b.createdAt?.toMillis ? b.createdAt.toMillis() : (typeof b.createdAt === 'number' ? b.createdAt : 0)));
                return timeB - timeA;
              });
              setJhOtherReports(otherList);
            }, (err) => {
              console.error("onSnapshot error in jh_other_report_links:", err);
            });

            const originalUnsubscribeJh = unsubscribeJh;
            unsubscribeJh = () => {
              if (originalUnsubscribeJh) originalUnsubscribeJh();
              if (unsubscribeViews) unsubscribeViews();
              if (unsubscribeOther) unsubscribeOther();
            };
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

  const handlePdfClick = (reportId: string, driveFileUrl: string, report: any) => {
    setSelectedReportForViewer({
      id: reportId,
      type: 'KG_WEEKLY',
      unit: 'KINDERGARTEN',
      driveFileUrl,
      pdfUrl: driveFileUrl,
      academicYear: report.academicYear || activeYear,
      semester: report.semester || activeSemester || '1',
      studentName: studentData?.name || currentUser?.displayName || 'Siswa'
    });
  };

  const handleMidtermPdfClick = (report: any) => {
    setSelectedReportForViewer({
      ...report,
      type: 'KG_MIDTERM',
      unit: 'KINDERGARTEN',
      studentName: studentData?.name || currentUser?.displayName || 'Siswa'
    });

    // Update the local list so the UI immediately shows "Dilihat"
    setKgMidtermReports(prev =>
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
            viewCount: (r.viewCount || 0) + 1,
            openCount: (r.openCount || r.viewCount || 0) + 1
          };
        }
        return r;
      })
    );
  };

  const handleElemMidtermPdfClick = (report: any) => {
    setSelectedReportForViewer(report);

    // Update the local list so the UI immediately shows "Dilihat"
    setElemMidtermReports(prev =>
      prev.map(r => {
        if (r.id === report.id) {
          const now = Date.now();
          return {
            ...r,
            deliveryStatus: 'viewed',
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

  const handleOpenOtherReport = (report: any) => {
    // 1. Immediately set report for viewer modal so UI renders instantly without waiting
    setSelectedOtherReport(report);

    // 2. Optimistically update local state so badge turns to 'Sudah Dilihat' immediately
    setJhOtherReports(prev => prev.map(r => {
      if (r.id === report.id) {
        return {
          ...r,
          isOpened: true,
          openCount: (r.openCount || 0) + 1,
          lastOpenedAt: Date.now()
        };
      }
      return r;
    }));

    // 3. Catat tracking secara non-blocking dan atomik (tanpa await sebelum PDF tampil)
    try {
      const targetCol = report._collection || (report.classId && String(report.classId).startsWith('ELEMENTARY') ? 'elem_other_report_links' : 'jh_other_report_links');
      const docRef = doc(db, targetCol, report.id);
      const now = Date.now();
      const updateData: any = {
        isOpened: true,
        lastOpenedAt: now,
        openCount: increment(1),
        openedByEmail: currentUser?.email || ''
      };
      if (!report.isOpened && !report.firstOpenedAt) {
        updateData.firstOpenedAt = now;
      }
      updateDoc(docRef, updateData).catch(err => {
        console.error("Failed to update tracking for other report:", err);
      });
    } catch (e) {
      console.error("Error dispatching tracking update:", e);
    }
  };

  const handleSelectRole = async (role: 'student' | 'parent') => {
    if (!activeReportForPopup || !studentData) return;
    setSubmittingView(true);
    
    try {
      const viewCol = collection(db, 'monthlyReportViews');
      const newDoc = {
        studentId: studentData.id,
        reportId: activeReportForPopup.id,
        period: activeReportForPopup.periodKey,
        viewerRole: role,
        viewedAt: serverTimestamp()
      };
      
      try {
        await addDoc(viewCol, newDoc);
      } catch (fsErr) {
        console.error("Firestore save failed inside handleSelectRole:", fsErr);
      }
    } catch (err) {
      console.error("Error logging monthly report view event:", err);
    } finally {
      setSelectedReportForViewer({
        id: activeReportForPopup.id,
        type: 'MONTHLY',
        driveFileUrl: activeReportForPopup.driveUrl,
        academicYear: activeReportForPopup.academicYear || activeYear,
        semester: activeReportForPopup.semester || 1,
        studentName: studentData?.name || currentUser?.displayName
      });
      setSubmittingView(false);
      setActiveReportForPopup(null);
    }
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
                                <button
                                  onClick={() => handlePdfClick(report.id, report.driveFileUrl, report)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                                >
                                  <FileText size={12} /> Lihat PDF
                                </button>
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
          Rapor Midterm dan Rapor Bulanan yang sudah diterbitkan sekolah.
        </p>
      </div>

      {reports.length === 0 && jhManualLinks.length === 0 && jhMidtermReports.length === 0 ? (
        <div className="bg-white border border-gray-100 p-20 rounded-[3rem] text-center space-y-4 shadow-sm">
          <div className="w-20 h-20 bg-blue-50/50 rounded-[2rem] flex items-center justify-center mx-auto">
            <FileText className="text-blue-300" size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Belum Ada Rapor</h3>
            <p className="text-sm text-gray-400 font-bold max-w-xs mx-auto">Belum ada rapor yang diterbitkan.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {/* SECTION: JUNIOR HIGH MIDTERM REPORT */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
                <FileText size={16} className="text-emerald-600" />
                MIDTERM REPORT
              </h2>
            </div>

            {jhMidtermReports.length === 0 ? (
              <div className="bg-white border border-gray-100 p-8 rounded-3xl text-center space-y-1 shadow-sm">
                <p className="text-sm font-bold text-gray-400">Belum ada rapor yang diterbitkan.</p>
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
            )}
          </div>

          {/* SECTION: RAPOR BULANAN */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
                <FileText size={16} className="text-blue-600" />
                RAPOR BULANAN
              </h2>
            </div>

            {jhManualLinks.length === 0 ? (
              <div className="bg-white border border-gray-100 p-8 rounded-3xl text-center space-y-1 shadow-sm">
                <p className="text-sm font-bold text-gray-400">Belum ada rapor yang diterbitkan.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {jhManualLinks.map((link, idx) => {
                  const monthLabel = getIndonesianMonthLabel(link.periodKey);
                  
                  // Calculate tracking summaries
                  const reportViews = views.filter(v => v.reportId === link.id);
                  const hasStudentView = reportViews.some(v => v.viewerRole === 'student');
                  const hasParentView = reportViews.some(v => v.viewerRole === 'parent');

                  let trackingSummary = 'Belum dilihat';
                  if (hasStudentView && hasParentView) {
                    trackingSummary = 'Sudah dilihat oleh siswa dan orang tua/wali';
                  } else if (hasStudentView) {
                    trackingSummary = 'Sudah dilihat sebagai siswa';
                  } else if (hasParentView) {
                    trackingSummary = 'Sudah dilihat sebagai orang tua/wali';
                  }

                  const studentViews = reportViews.filter(v => v.viewerRole === 'student');
                  const parentViews = reportViews.filter(v => v.viewerRole === 'parent');

                  const getLatestTimestamp = (vList: any[]) => {
                    if (vList.length === 0) return null;
                    return vList.reduce((latest, current) => {
                      const latTime = latest.viewedAt?.toMillis ? latest.viewedAt.toMillis() : (latest.viewedAt?.seconds ? latest.viewedAt.seconds * 1000 : 0);
                      const curTime = current.viewedAt?.toMillis ? current.viewedAt.toMillis() : (current.viewedAt?.seconds ? current.viewedAt.seconds * 1000 : 0);
                      return curTime > latTime ? current : latest;
                    }, vList[0]).viewedAt;
                  };

                  const latestStudentTime = getLatestTimestamp(studentViews);
                  const latestParentTime = getLatestTimestamp(parentViews);

                  return (
                    <motion.div
                      key={link.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-blue-100/50 hover:border-blue-100 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                            <FileText className="text-blue-600 group-hover:text-white" size={28} />
                          </div>
                          <div className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl text-[9px] font-black uppercase tracking-widest">
                            DITERBITKAN
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                            {monthLabel || 'Rapor Bulanan'}
                          </h3>
                          <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} /> Sem {link.semester || '1'}
                            </span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span>{link.academicYear || activeYear}</span>
                          </div>
                        </div>
                      </div>

                      {/* View Tracking Summary Box */}
                      <div className="my-6 py-4 px-5 bg-gray-50 rounded-[1.5rem] border border-gray-100/80 space-y-2 text-[10px]">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${
                            hasStudentView && hasParentView ? 'bg-emerald-500' : (hasStudentView || hasParentView ? 'bg-blue-500' : 'bg-gray-300')
                          }`} />
                          <span className="font-extrabold uppercase tracking-wider text-gray-600">
                            {trackingSummary}
                          </span>
                        </div>
                        {(latestStudentTime || latestParentTime) && (
                          <div className="space-y-1 border-t border-gray-100 pt-2 font-bold text-gray-400">
                            {latestStudentTime && (
                              <div>
                                Dilihat siswa: <span className="text-gray-700">{formatViewTimestamp(latestStudentTime)}</span>
                              </div>
                            )}
                            {latestParentTime && (
                              <div>
                                Dilihat orang tua/wali: <span className="text-gray-700">{formatViewTimestamp(latestParentTime)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {link.driveUrl ? (
                          <button
                            onClick={() => setActiveReportForPopup(link)}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all transform active:scale-95 shadow-sm shadow-blue-100 text-center cursor-pointer"
                          >
                            <ExternalLink size={14} className="inline mr-1" /> Lihat Rapor (Drive)
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-400 border border-gray-200 rounded-2xl font-black uppercase text-[10px] tracking-widest cursor-not-allowed text-center"
                          >
                            Tautan Tidak Tersedia
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION: RAPOR LAINNYA */}
          {jhOtherReports.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 font-mono">
                  <FileText size={16} className="text-blue-600" />
                  RAPOR LAINNYA
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {jhOtherReports.map((report, idx) => {
                  const isOpened = !!report.isOpened;

                  return (
                    <motion.div
                      key={report.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-blue-100/50 hover:border-blue-100 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-14 h-14 bg-indigo-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                            <FileText className="text-indigo-600 group-hover:text-white" size={28} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isOpened ? (
                              <div className="px-3.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                <Eye size={11} /> SUDAH DILIHAT
                              </div>
                            ) : (
                              <div className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl text-[9px] font-black uppercase tracking-widest">
                                DITERBITKAN
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                            {report.judul || 'Rapor Lainnya'}
                          </h3>
                          {report.keterangan && (
                            <p className="text-xs text-gray-500 font-medium line-clamp-2">
                              {report.keterangan}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} /> Sem {report.semester || '1'}
                            </span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span>{report.academicYear || activeYear}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 mt-6">
                        {report.driveFileUrl || report.driveFileId ? (
                          <button
                            onClick={() => handleOpenOtherReport(report)}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all transform active:scale-95 shadow-sm shadow-blue-100 text-center cursor-pointer"
                          >
                            <ExternalLink size={14} className="inline mr-1" /> Lihat Rapor (Drive)
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-400 border border-gray-200 rounded-2xl font-black uppercase text-[10px] tracking-widest cursor-not-allowed text-center"
                          >
                            Tautan Tidak Tersedia
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedReportForViewer && (
        <PdfViewerModal
          report={selectedReportForViewer}
          onClose={() => setSelectedReportForViewer(null)}
          currentUser={currentUser}
        />
      )}

      {selectedOtherReport && (
        <OtherReportViewerModal
          report={selectedOtherReport}
          onClose={() => setSelectedOtherReport(null)}
          currentUser={currentUser}
        />
      )}

      {activeReportForPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white max-w-lg w-full rounded-[2.5rem] border border-gray-100 p-10 shadow-2xl space-y-8 animate-in zoom-in-95 duration-300">
            <div className="space-y-3 text-center">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 leading-none">
                Siapa yang melihat rapor ini?
              </h3>
              <p className="text-sm font-bold text-gray-500">
                Silakan pilih untuk membantu sekolah mengetahui rapor telah dilihat.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => handleSelectRole('student')}
                disabled={submittingView}
                className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-gray-100 hover:border-blue-600 hover:bg-blue-50/20 active:scale-95 transition-all rounded-3xl group text-center"
              >
                <span className="text-sm font-black uppercase tracking-wider text-gray-700 group-hover:text-blue-600 transition-colors">
                  Lihat sebagai Siswa
                </span>
              </button>
              <button
                onClick={() => handleSelectRole('parent')}
                disabled={submittingView}
                className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-gray-100 hover:border-blue-600 hover:bg-blue-50/20 active:scale-95 transition-all rounded-3xl group text-center"
              >
                <span className="text-sm font-black uppercase tracking-wider text-gray-700 group-hover:text-blue-600 transition-colors">
                  Lihat sebagai Orang Tua/Wali
                </span>
              </button>
            </div>

            <p className="text-[10px] text-center font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
              Pilihan ini hanya digunakan untuk pencatatan bahwa rapor telah dilihat.
            </p>
          </div>
        </div>
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
  const [isWarningDismissed, setIsWarningDismissed] = React.useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dismissed_pdf_viewer_warning') === 'true';
    } catch (_) {
      return false;
    }
  });
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
      const isElementary = report.unit === 'ELEMENTARY';
      const isKindergarten = report.unit === 'KINDERGARTEN';
      const trackingCollection = 
        isKindergarten 
          ? (report.type === 'KG_WEEKLY' ? 'published_kg_reports' : 'kg_midterm_delivery_tracking')
          : (isElementary ? 'elem_midterm_delivery_tracking' : 'jh_midterm_delivery_tracking');
      
      const deliveryStatusVal = isElementary ? 'viewed' : 'VIEWED';

      // a. Start tracking (async, non-blocking, error-safe)
      if (report.id && !hasTrackedRef.current) {
        hasTrackedRef.current = true;
        // Run tracking as non-blocking async
        (async () => {
          try {
            const trackingRef = doc(db, trackingCollection, report.id);
            const historyLog = Array.isArray(report.history) ? [...report.history] : [];
            
            if (report.type === 'KG_WEEKLY') {
              // Kindergarten Weekly Report Tracking
              await updateDoc(trackingRef, {
                pdfOpenedAt: serverTimestamp()
              });
            } else if (report.type === 'KG_MIDTERM') {
              // Kindergarten Midterm Report Tracking
              historyLog.push({
                action: 'VIEWED',
                timestamp: Date.now(),
                actorUid: currentUser?.uid || 'student'
              });

              const now = Date.now();
              const updatePayload = {
                deliveryStatus: 'VIEWED',
                isOpened: true,
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
            } else {
              // Junior High / Elementary Midterm Report Tracking
              historyLog.push({
                action: 'VIEWED',
                timestamp: Date.now(),
                actorUid: currentUser?.uid || 'student'
              });

              const now = Date.now();
              const updatePayload = {
                deliveryStatus: deliveryStatusVal,
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
            }
          } catch (err) {
            console.error(`Failed to update ${report.unit} ${report.type} tracking view:`, err);
          }
        })();
      }

      // b. Resolve driveFileId
      try {
        if (report.type === 'MONTHLY' || report.type === 'KG_WEEKLY' || report.type === 'KG_MIDTERM') {
          const fid = extractDriveFileId(driveFileUrl);
          if (isMounted) {
            setDriveFileId(fid);
            setLoading(false);
          }
        } else {
          // Midterm Report
          const reportId = report.reportId || report.activeReportId;
          if (reportId) {
            if (isElementary) {
              // Elementary: check elem_midterm_published_reports first
              const pubSnap = await getDocs(
                query(
                  collection(db, 'elem_midterm_published_reports'),
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

              // Sibling check for Elementary SN: elem_sn_midterm_published_reports
              const snPubSnap = await getDocs(
                query(
                  collection(db, 'elem_sn_midterm_published_reports'),
                  where('id', '==', reportId)
                )
              );
              if (!snPubSnap.empty) {
                const pubData = snPubSnap.docs[0].data();
                if (pubData.driveFileId && isMounted) {
                  setDriveFileId(pubData.driveFileId);
                  setLoading(false);
                  return;
                }
              }
            } else {
              // Junior High
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

  const unitNameText = report.unit === 'ELEMENTARY' ? 'Elementary' : report.unit === 'KINDERGARTEN' ? 'Kindergarten' : 'Junior High';
  const headerTitle = report.type === 'KG_WEEKLY' ? 'Weekly Report' : (report.type === 'MONTHLY' ? 'Rapor Bulanan' : `Midterm Report Viewer - ${unitNameText}`);

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
                {headerTitle}
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
              {showWarning && !isWarningDismissed && (
                <div className="mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-900 shadow-sm relative">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">⚠️</span>
                    <span className="font-semibold text-slate-800 truncate">
                      Dokumen tidak muncul? Silakan buka lewat tombol <strong>"Buka di Tab Baru"</strong>.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setIsWarningDismissed(true);
                      try {
                        sessionStorage.setItem('dismissed_pdf_viewer_warning', 'true');
                      } catch (_) {}
                    }}
                    className="p-1 hover:bg-amber-100 rounded-lg text-amber-800 transition-colors cursor-pointer shrink-0"
                    title="Tutup"
                  >
                    <X size={14} />
                  </button>
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
            Lazuardi {unitNameText} Student Portal
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

// ----------------------------------------------------------------------
// SYSTEM-INTEGRATED SAFARI-SAFE OTHER REPORT PDF VIEWER
// ----------------------------------------------------------------------
export function OtherReportViewerModal({ 
  report, 
  onClose, 
  currentUser 
}: { 
  report: any; 
  onClose: () => void; 
  currentUser: AppUser;
}) {
  const [showWarning, setShowWarning] = React.useState<boolean>(false);
  const [isWarningDismissed, setIsWarningDismissed] = React.useState<boolean>(false);

  const driveFileId = report.driveFileId || (() => {
    const url = report.driveFileUrl || report.driveUrl || '';
    const m = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : '';
  })();

  const driveFileUrl = report.driveFileUrl || report.driveUrl || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : '');

  React.useEffect(() => {
    const timer = setTimeout(() => setShowWarning(true), 4500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                {report.judul || 'Rapor Siswa'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {report.studentNameSnapshot || currentUser?.displayName || 'Siswa'} • {report.academicYear} (Semester {report.semester})
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
          {driveFileId ? (
            <div className="w-full h-full relative flex flex-col">
              {showWarning && !isWarningDismissed && (
                <div className="mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-900 shadow-sm relative">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">⚠️</span>
                    <span className="font-semibold text-slate-800 truncate">
                      Dokumen tidak muncul? Silakan buka lewat tombol <strong>"Buka di Tab Baru"</strong>.
                    </span>
                  </div>
                  <button
                    onClick={() => setIsWarningDismissed(true)}
                    className="p-1 hover:bg-amber-100 rounded-lg text-amber-800 transition-colors cursor-pointer shrink-0"
                    title="Tutup"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
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
                  Tautan dokumen tidak memiliki Google Drive File ID yang valid.
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
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
            >
              Kembali
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
