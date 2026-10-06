import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileSpreadsheet, Eye, Clock, CheckCircle2, AlertCircle, 
  Search, ExternalLink, RefreshCw, Send, XSquare, History,
  Check, X, ShieldAlert, AlertTriangle
} from 'lucide-react';
import { doc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { toast } from 'sonner';
import type { PublishedElementaryMidtermReport } from '../../../types/elementaryMidtermReport';
import type { Student, Class, User } from '../../../types';

interface ElementaryMidtermRekapTabProps {
  students: Student[];
  publishedReports: PublishedElementaryMidtermReport[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  onRefreshData: () => Promise<void>;
  currentUser?: User | null;
}

// Helper to resolve student Firebase Auth UID from master student/profile
async function resolveStudentUserAccount(studentId: string, nisn?: string, studentName?: string): Promise<{ studentUid: string; studentAccountId: string } | null> {
  const cleanId = String(studentId || '').trim();
  const cleanNisn = String(nisn || '').trim();
  const cleanName = String(studentName || '').trim();

  // 1. Primary: search users collection by studentId / luminaId
  if (cleanId) {
    try {
      const qById = query(
        collection(db, 'users'),
        where('role', '==', 'STUDENT'),
        where('studentId', '==', cleanId)
      );
      const snapById = await getDocs(qById);
      if (!snapById.empty) {
        const uDoc = snapById.docs[0];
        const uid = uDoc.data().uid || uDoc.id;
        return { studentUid: uid, studentAccountId: uid };
      }

      const qByLuminaId = query(
        collection(db, 'users'),
        where('role', '==', 'STUDENT'),
        where('luminaId', '==', cleanId)
      );
      const snapByLumina = await getDocs(qByLuminaId);
      if (!snapByLumina.empty) {
        const uDoc = snapByLumina.docs[0];
        const uid = uDoc.data().uid || uDoc.id;
        return { studentUid: uid, studentAccountId: uid };
      }

      // Any user role by studentId
      const qAnyStudentId = query(
        collection(db, 'users'),
        where('studentId', '==', cleanId)
      );
      const snapAnyStudentId = await getDocs(qAnyStudentId);
      if (!snapAnyStudentId.empty) {
        const uDoc = snapAnyStudentId.docs[0];
        const uid = uDoc.data().uid || uDoc.id;
        return { studentUid: uid, studentAccountId: uid };
      }

      // Check students master collection
      const qStudentDoc = query(
        collection(db, 'students'),
        where('id', '==', cleanId)
      );
      const snapStudentDoc = await getDocs(qStudentDoc);
      if (!snapStudentDoc.empty) {
        const sData = snapStudentDoc.docs[0].data();
        const sUid = sData.uid || sData.userId || sData.accountId;
        if (sUid) return { studentUid: sUid, studentAccountId: sUid };
        if (sData.email) {
          const qUserEmail = query(
            collection(db, 'users'),
            where('email', '==', sData.email)
          );
          const snapUserEmail = await getDocs(qUserEmail);
          if (!snapUserEmail.empty) {
            const uDoc = snapUserEmail.docs[0];
            const uid = uDoc.data().uid || uDoc.id;
            return { studentUid: uid, studentAccountId: uid };
          }
        }
      }
    } catch (err) {
      console.warn('[resolveStudentUserAccount] Query by student ID failed:', err);
    }
  }

  // 2. Fallback: search users collection by NISN
  if (cleanNisn) {
    try {
      const qByNisn = query(
        collection(db, 'users'),
        where('nisn', '==', cleanNisn)
      );
      const snapByNisn = await getDocs(qByNisn);
      if (!snapByNisn.empty) {
        const uDoc = snapByNisn.docs[0];
        const uid = uDoc.data().uid || uDoc.id;
        return { studentUid: uid, studentAccountId: uid };
      }
    } catch (err) {
      console.warn('[resolveStudentUserAccount] Query by NISN failed:', err);
    }
  }

  return null;
}

export function getStudentDeliveryStatus(pub: any, track: any): 'NOT_PUBLISHED' | 'READY_TO_SEND' | 'SENT' | 'VIEWED' | 'WITHDRAWN' {
  if (!pub) return 'NOT_PUBLISHED';
  if (!track) return 'READY_TO_SEND';

  const status = String(track.deliveryStatus || '').toUpperCase();
  const activeForStudent = track.activeForStudent;

  if (status === 'WITHDRAWN' || status === 'REVOKED' || activeForStudent === false) {
    return 'WITHDRAWN';
  }
  if (status === 'VIEWED' || track.firstViewedAt || track.firstOpenedAt || track.lastViewedAt) {
    return 'VIEWED';
  }
  if (status === 'SENT' || track.sentAt) {
    return 'SENT';
  }
  if (status === 'READY_TO_SEND') {
    return 'READY_TO_SEND';
  }

  return 'READY_TO_SEND';
}

export const ElementaryMidtermRekapTab: React.FC<ElementaryMidtermRekapTabProps> = ({
  students,
  publishedReports,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  onRefreshData,
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = React.useState<string>('');
  const [deliveryTrackingMap, setDeliveryTrackingMap] = React.useState<Record<string, any>>({});
  const [isFetchingTracking, setIsFetchingTracking] = React.useState<boolean>(true);

  // Modals state
  const [withdrawModal, setWithdrawModal] = React.useState<{ studentId: string; studentName: string } | null>(null);
  const [withdrawalReason, setWithdrawalReason] = React.useState<string>('');
  const [historyModal, setHistoryModal] = React.useState<{ studentName: string; history: any[]; tracking: any; pub: any } | null>(null);
  const [bulkSendConfirm, setBulkSendConfirm] = React.useState<boolean>(false);
  const [isSending, setIsSending] = React.useState<boolean>(false);

  // Check authorization & assignment
  const isSuperAdminOrHead = React.useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || (currentUser as any).roleId || '').toUpperCase();
    return ['SUPER_ADMIN', 'PRINCIPAL', 'HEAD_UNIT', 'VICE_PRINCIPAL', 'COORDINATOR', 'SECRETARY_ELEM', 'ADMIN'].includes(role);
  }, [currentUser]);

  const isAssignedTeacher = React.useMemo(() => {
    if (!selectedClass || !currentUser?.uid) return false;
    const uid = currentUser.uid;
    if (selectedClass.homeroomTeacherId === uid) return true;
    if (Array.isArray(selectedClass.homeroomTeacherIds) && selectedClass.homeroomTeacherIds.includes(uid)) return true;
    if (Array.isArray((selectedClass as any).waliKelasIds) && (selectedClass as any).waliKelasIds.includes(uid)) return true;
    if (Array.isArray(selectedClass.assignedTeacherIds) && selectedClass.assignedTeacherIds.includes(uid)) return true;
    if (Array.isArray(selectedClass.teacherAssignments) && selectedClass.teacherAssignments.some((a: any) => a.userId === uid)) return true;
    return false;
  }, [selectedClass, currentUser?.uid]);

  const canPublishForCurrentClass = isSuperAdminOrHead || isAssignedTeacher;

  // Active latest published reports map
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

  // Fetch Delivery Tracking from Firestore & backfill missing studentUid
  const fetchDeliveryTracking = React.useCallback(async () => {
    if (!selectedClass?.id || !selectedYear) return;
    setIsFetchingTracking(true);
    try {
      const q = query(
        collection(db, 'elem_midterm_delivery_tracking'),
        where('classId', '==', selectedClass.id),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('midtermTerm', '==', selectedTerm)
      );
      const snap = await getDocs(q);
      const map: Record<string, any> = {};

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        let item = { id: docSnap.id, ...data };

        // Backfill missing studentUid / studentAccountId if needed
        if (data.studentId && (!data.studentUid || !data.studentAccountId)) {
          const acc = await resolveStudentUserAccount(data.studentId, data.nisnSnapshot || data.nisn);
          if (acc?.studentUid) {
            const trackingRef = doc(db, 'elem_midterm_delivery_tracking', docSnap.id);
            const backfillPayload = {
              studentUid: acc.studentUid,
              studentAccountId: acc.studentAccountId,
              studentId: data.studentId || '2511040',
              nisnSnapshot: data.nisnSnapshot || data.nisn || '3191023406',
              unit: 'ELEMENTARY',
              deliveryStatus: (data.deliveryStatus || 'sent').toLowerCase(),
              activeReportId: data.activeReportId || data.reportId || '',
              activePdfUrl: data.activePdfUrl || data.pdfUrl || data.driveFileUrl || '',
              pdfUrl: data.activePdfUrl || data.pdfUrl || data.driveFileUrl || '',
              updatedAt: Date.now()
            };
            await setDoc(trackingRef, backfillPayload, { merge: true }).catch(() => {});
            item = { ...item, ...backfillPayload };
          }
        }

        if (data.studentId) {
          map[data.studentId] = item;
        }
      }

      setDeliveryTrackingMap(map);
    } catch (err) {
      console.error('[ElementaryMidtermRekapTab] Error fetching delivery tracking:', err);
    } finally {
      setIsFetchingTracking(false);
    }
  }, [selectedClass?.id, selectedYear, selectedSemester, selectedTerm]);

  React.useEffect(() => {
    fetchDeliveryTracking();
  }, [fetchDeliveryTracking]);

  // Handle single student report send / resend
  const handleSendReport = async (student: Student) => {
    if (!canPublishForCurrentClass) {
      toast.error("Anda hanya dapat mengirim rapor untuk kelas yang ditugaskan kepada Anda.");
      return;
    }

    const pubReport = publishedMap[student.id];
    if (!pubReport) {
      toast.error(`Laporan PDF belum terbit (published) untuk ${student.name}.`);
      return;
    }

    setIsSending(true);
    try {
      const docId = `ELEM_${student.id}_S${selectedSemester}_T${selectedTerm}`;
      const trackingRef = doc(db, 'elem_midterm_delivery_tracking', docId);

      const existingTracking = deliveryTrackingMap[student.id];
      const existingStatus = String(existingTracking?.deliveryStatus || '').toLowerCase();
      const isResend = existingTracking && (existingStatus === 'sent' || existingStatus === 'viewed');

      const actorName = currentUser?.displayName || currentUser?.name || currentUser?.email || 'Guru / Admin';
      const actorUid = currentUser?.uid || 'system';

      const resolvedAcc = await resolveStudentUserAccount(student.id, student.nisn || pubReport.nisnSnapshot);
      const studentUid = resolvedAcc?.studentUid || existingTracking?.studentUid || '';
      const studentAccountId = resolvedAcc?.studentAccountId || existingTracking?.studentAccountId || studentUid;

      const historyLog = existingTracking?.history || [];
      historyLog.push({
        action: isResend ? 'RESENT' : 'SENT',
        timestamp: Date.now(),
        actorUid,
        actorName,
        version: pubReport.version || 1
      });

      const payload = {
        id: docId,
        studentId: student.id,
        studentUid,
        studentAccountId,
        studentName: student.name,
        nisnSnapshot: student.nisn || pubReport.nisnSnapshot || '3191023406',
        classId: selectedClass?.id || '',
        className: selectedClass?.name || '',
        unit: 'ELEMENTARY',
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermTerm: selectedTerm,
        reportId: pubReport.id,
        activeReportId: pubReport.id,
        reportVersion: pubReport.version || 1,
        pdfFileId: pubReport.driveFileId || '',
        pdfUrl: pubReport.driveFileUrl || pubReport.pdfUrl || '',
        activePdfUrl: pubReport.driveFileUrl || pubReport.pdfUrl || '',
        sentAt: Date.now(),
        sentBy: actorUid,
        sentByName: actorName,
        deliveryStatus: 'sent',
        activeForStudent: true,
        viewCount: existingTracking?.viewCount || 0,
        firstViewedAt: existingTracking?.firstViewedAt || null,
        lastViewedAt: existingTracking?.lastViewedAt || null,
        history: historyLog,
        updatedAt: Date.now()
      };

      await setDoc(trackingRef, payload, { merge: true });
      toast.success(`Laporan Midterm untuk ${student.name} berhasil ${isResend ? 'dikirim ulang' : 'dikirim'}!`);
      await fetchDeliveryTracking();
    } catch (err: any) {
      console.error('Error sending report:', err);
      toast.error('Gagal mengirim laporan. Silakan coba lagi.');
    } finally {
      setIsSending(false);
    }
  };

  // Handle bulk send for all ready reports
  const handleBulkSendReady = async () => {
    if (!canPublishForCurrentClass) {
      toast.error("Anda hanya dapat mengirim rapor untuk kelas yang ditugaskan kepada Anda.");
      return;
    }

    const readyTargets = students.filter(st => {
      const pub = publishedMap[st.id];
      if (!pub) return false;
      const track = deliveryTrackingMap[st.id];
      const statusKey = getStudentDeliveryStatus(pub, track);
      return statusKey === 'READY_TO_SEND' || statusKey === 'WITHDRAWN';
    });

    if (readyTargets.length === 0) {
      toast.error("Tidak ada laporan siswa yang siap dikirim.");
      setBulkSendConfirm(false);
      return;
    }

    setIsSending(true);
    let sentCount = 0;

    for (const student of readyTargets) {
      try {
        const pubReport = publishedMap[student.id];
        if (!pubReport) continue;

        const docId = `ELEM_${student.id}_S${selectedSemester}_T${selectedTerm}`;
        const trackingRef = doc(db, 'elem_midterm_delivery_tracking', docId);

        const existingTracking = deliveryTrackingMap[student.id];
        const existingStatus = existingTracking ? getStudentDeliveryStatus(pubReport, existingTracking) : 'READY_TO_SEND';
        const isResend = existingStatus === 'SENT' || existingStatus === 'VIEWED';

        const actorName = currentUser?.displayName || currentUser?.name || currentUser?.email || 'Guru / Admin';
        const actorUid = currentUser?.uid || 'system';

        const historyLog = existingTracking?.history || [];
        historyLog.push({
          action: isResend ? 'RESENT' : 'SENT',
          timestamp: Date.now(),
          actorUid,
          actorName,
          version: pubReport.version || 1
        });

        const payload = {
          id: docId,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass?.id || '',
          className: selectedClass?.name || '',
          unit: 'ELEMENTARY',
          academicYear: selectedYear,
          semester: selectedSemester,
          midtermTerm: selectedTerm,
          reportId: pubReport.id,
          reportVersion: pubReport.version || 1,
          pdfFileId: pubReport.driveFileId || '',
          pdfUrl: pubReport.driveFileUrl || '',
          sentAt: Date.now(),
          sentBy: actorUid,
          sentByName: actorName,
          deliveryStatus: 'SENT',
          activeForStudent: true,
          viewCount: existingTracking?.viewCount || 0,
          firstViewedAt: existingTracking?.firstViewedAt || null,
          lastViewedAt: existingTracking?.lastViewedAt || null,
          history: historyLog,
          updatedAt: Date.now()
        };

        await setDoc(trackingRef, payload, { merge: true });
        sentCount++;
      } catch (err) {
        console.error(`Error bulk sending for ${student.name}:`, err);
      }
    }

    setIsSending(false);
    setBulkSendConfirm(false);
    toast.success(`Berhasil mengirim ${sentCount} laporan Midterm.`);
    await fetchDeliveryTracking();
  };

  // Handle report withdrawal
  const handleWithdrawReport = async () => {
    if (!canPublishForCurrentClass) {
      toast.error("Anda hanya dapat menarik laporan untuk kelas yang ditugaskan kepada Anda.");
      return;
    }
    if (!withdrawModal) return;
    if (!withdrawalReason.trim()) {
      toast.error("Alasan penarikan wajib diisi.");
      return;
    }

    try {
      const docId = `ELEM_${withdrawModal.studentId}_S${selectedSemester}_T${selectedTerm}`;
      const trackingRef = doc(db, 'elem_midterm_delivery_tracking', docId);

      const existingTracking = deliveryTrackingMap[withdrawModal.studentId];
      const actorName = currentUser?.displayName || currentUser?.name || currentUser?.email || 'Guru / Admin';
      const actorUid = currentUser?.uid || 'system';

      const historyLog = existingTracking?.history || [];
      historyLog.push({
        action: 'WITHDRAWN',
        timestamp: Date.now(),
        actorUid,
        actorName,
        reason: withdrawalReason.trim(),
        version: existingTracking?.reportVersion || 1
      });

      const payload = {
        activeForStudent: false,
        deliveryStatus: 'WITHDRAWN',
        withdrawnAt: Date.now(),
        withdrawnBy: actorUid,
        withdrawnByName: actorName,
        withdrawalReason: withdrawalReason.trim(),
        history: historyLog,
        updatedAt: Date.now()
      };

      await setDoc(trackingRef, payload, { merge: true });
      toast.success(`Akses laporan untuk ${withdrawModal.studentName} berhasil ditarik.`);
      setWithdrawModal(null);
      setWithdrawalReason('');
      await fetchDeliveryTracking();
    } catch (err: any) {
      console.error('Error withdrawing report:', err);
      toast.error('Gagal menarik laporan. Silakan coba lagi.');
    }
  };

  // Metrics summary
  const trackingSummary = React.useMemo(() => {
    const total = students.length;
    let publishedCount = 0;
    let ready = 0;
    let sent = 0;
    let viewed = 0;
    let withdrawn = 0;

    students.forEach(st => {
      const pub = publishedMap[st.id];
      if (pub) publishedCount++;
      const track = deliveryTrackingMap[st.id];

      if (pub) {
        const statusKey = getStudentDeliveryStatus(pub, track);
        if (statusKey === 'READY_TO_SEND') {
          ready++;
        } else if (statusKey === 'SENT') {
          sent++;
        } else if (statusKey === 'VIEWED') {
          viewed++;
        } else if (statusKey === 'WITHDRAWN') {
          withdrawn++;
          ready++; // Can be re-sent
        }
      }
    });

    return { total, publishedCount, ready, sent, viewed, withdrawn };
  }, [students, publishedMap, deliveryTrackingMap]);

  const filteredStudents = students.filter(st => 
    st.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (st.nisn || '').includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Header & Bulk Actions */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight font-sans">
              Pengiriman & Delivery Tracking Rapor
            </h2>
            <p className="text-xs text-slate-500 font-medium font-sans">
              Kelas: <span className="font-bold text-slate-800">{selectedClass?.name || 'Unknown'}</span> | Semester {selectedSemester} | Term {selectedTerm} | T.A. {selectedYear}
            </p>
          </div>

          <button
            onClick={() => setBulkSendConfirm(true)}
            disabled={trackingSummary.ready === 0 || !canPublishForCurrentClass || isSending}
            className="bg-[#109E58] hover:bg-[#0e8a4d] disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs px-5 py-2.5 rounded-2xl flex items-center gap-2 shadow-md shadow-emerald-600/10 cursor-pointer transition-all font-sans"
          >
            <Send size={14} />
            <span>Kirim Semua yang Siap ({trackingSummary.ready})</span>
          </button>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-sans">
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3.5 space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Siswa</span>
            <p className="text-xl font-black text-slate-900">{trackingSummary.total}</p>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3.5 space-y-1">
            <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Terpublikasi</span>
            <p className="text-xl font-black text-emerald-800">{trackingSummary.publishedCount}</p>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3.5 space-y-1">
            <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Siap Dikirim</span>
            <p className="text-xl font-black text-amber-800">{trackingSummary.ready}</p>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-3.5 space-y-1">
            <span className="text-[10px] font-black uppercase text-blue-700 tracking-wider">Terkirim</span>
            <p className="text-xl font-black text-blue-800">{trackingSummary.sent}</p>
          </div>

          <div className="bg-purple-50/70 border border-purple-200/60 rounded-2xl p-3.5 space-y-1">
            <span className="text-[10px] font-black uppercase text-purple-700 tracking-wider">Dilihat Siswa</span>
            <p className="text-xl font-black text-purple-800">{trackingSummary.viewed}</p>
          </div>

          <div className="bg-rose-50/70 border border-rose-200/60 rounded-2xl p-3.5 space-y-1">
            <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider">Akses Ditarik</span>
            <p className="text-xl font-black text-rose-800">{trackingSummary.withdrawn}</p>
          </div>
        </div>
      </div>

      {/* Roster & Tracking Table */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-emerald-600" />
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
              Daftar Rapor Siswa & Delivery Tracking
            </h2>
            {isFetchingTracking && (
              <RefreshCw size={14} className="animate-spin text-slate-400 ml-1" />
            )}
          </div>

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

        {!canPublishForCurrentClass && (
          <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl p-3.5 text-xs font-semibold flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0 text-amber-600" />
            <span>Anda dapat melihat status tracking, namun aksi pengiriman, kirim ulang, dan penarikan laporan hanya dapat dilakukan oleh Guru Kelas yang ditugaskan atau Kepala Unit/Admin.</span>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                <th className="p-3.5 w-12 text-center border-r border-slate-800">No</th>
                <th className="p-3.5 w-56 border-r border-slate-800">Nama Siswa</th>
                <th className="p-3.5 w-28 border-r border-slate-800">NISN</th>
                <th className="p-3.5 w-24 border-r border-slate-800 text-center">Versi PDF</th>
                <th className="p-3.5 w-36 border-r border-slate-800 text-center">Status Pengiriman</th>
                <th className="p-3.5 w-44 border-r border-slate-800 text-center">Waktu Kirim / Lihat</th>
                <th className="p-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredStudents.map((st, idx) => {
                const pub = publishedMap[st.id];
                const track = deliveryTrackingMap[st.id];
                const statusKey = getStudentDeliveryStatus(pub, track);

                return (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-center font-bold text-slate-400 border-r border-slate-100">
                      {idx + 1}
                    </td>
                    <td className="p-3.5 border-r border-slate-100 font-bold text-slate-900">
                      {st.name}
                    </td>
                    <td className="p-3.5 border-r border-slate-100 font-medium text-slate-600">
                      {st.nisn || '-'}
                    </td>
                    <td className="p-3.5 border-r border-slate-100 text-center font-bold text-slate-700">
                      {pub ? `v${pub.version}` : '-'}
                    </td>
                    <td className="p-3.5 border-r border-slate-100 text-center">
                      {statusKey === 'NOT_PUBLISHED' && (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-extrabold text-[10px] rounded-lg inline-flex items-center gap-1">
                          <Clock size={11} /> Belum Publish
                        </span>
                      )}
                      {statusKey === 'READY_TO_SEND' && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 font-extrabold text-[10px] rounded-lg inline-flex items-center gap-1">
                          <AlertCircle size={11} /> Siap Dikirim
                        </span>
                      )}
                      {statusKey === 'SENT' && (
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 font-extrabold text-[10px] rounded-lg inline-flex items-center gap-1">
                          <Send size={11} /> Terkirim
                        </span>
                      )}
                      {statusKey === 'VIEWED' && (
                        <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 font-extrabold text-[10px] rounded-lg inline-flex items-center gap-1">
                          <Eye size={11} /> Dilihat ({track?.viewCount || 1}x)
                        </span>
                      )}
                      {statusKey === 'WITHDRAWN' && (
                        <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 font-extrabold text-[10px] rounded-lg inline-flex items-center gap-1">
                          <XSquare size={11} /> Ditarik
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 border-r border-slate-100 text-center text-[11px] text-slate-600 font-medium">
                      {track?.lastViewedAt ? (
                        <span className="text-purple-700 font-semibold">
                          Lihat: {new Date(track.lastViewedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : track?.sentAt ? (
                        <span>
                          Kirim: {new Date(track.sentAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : statusKey === 'WITHDRAWN' ? (
                        <span className="text-rose-600 font-bold">Akses Ditarik</span>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Buka PDF link */}
                        {pub?.driveFileUrl && (
                          <a
                            href={pub.driveFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                            title="Buka PDF di Drive"
                          >
                            <Eye size={15} />
                          </a>
                        )}

                        {/* Send / Resend button */}
                        {pub && canPublishForCurrentClass && (
                          (statusKey === 'READY_TO_SEND' || statusKey === 'NOT_PUBLISHED') ? (
                            <button
                              onClick={() => handleSendReport(st)}
                              disabled={isSending}
                              className="bg-[#109E58] hover:bg-[#0e8a4d] disabled:opacity-50 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                            >
                              <Send size={12} /> Kirim
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSendReport(st)}
                              disabled={isSending}
                              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                            >
                              <RefreshCw size={12} /> Kirim Ulang
                            </button>
                          )
                        )}

                        {/* Withdraw button */}
                        {canPublishForCurrentClass && (statusKey === 'SENT' || statusKey === 'VIEWED') && (
                          <button
                            onClick={() => setWithdrawModal({ studentId: st.id, studentName: st.name })}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-[11px] px-2.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <XSquare size={12} /> Tarik
                          </button>
                        )}

                        {/* Audit History button */}
                        {track?.history && track.history.length > 0 && (
                          <button
                            onClick={() => setHistoryModal({ studentName: st.name, history: track.history, tracking: track, pub })}
                            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                            title="Lihat Riwayat Audit"
                          >
                            <History size={15} />
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

      {/* Bulk Send Confirmation Modal */}
      {bulkSendConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto font-sans">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setBulkSendConfirm(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
          />
          <div className="flex min-h-screen items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-150 space-y-5"
            >
              <div className="flex items-start gap-3 text-emerald-600">
                <Send size={24} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-900">Konfirmasi Kirim Rapor Massal</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Anda akan mengirimkan laporan Midterm untuk <b>{trackingSummary.ready} siswa</b> yang sudah terpublikasi dan siap dikirim.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setBulkSendConfirm(false)}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleBulkSendReady}
                  disabled={isSending}
                  className="bg-[#109E58] hover:bg-[#0e8a4d] disabled:opacity-50 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl cursor-pointer shadow-md shadow-emerald-600/10 flex items-center gap-1.5"
                >
                  {isSending && <RefreshCw size={12} className="animate-spin" />}
                  <span>Ya, Kirim Sekarang ({trackingSummary.ready})</span>
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Withdrawal Modal */}
      {withdrawModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto font-sans">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setWithdrawModal(null)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
          />
          <div className="flex min-h-screen items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-150 space-y-5"
            >
              <div className="flex items-start gap-3 text-rose-600">
                <XSquare size={24} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-900">Tarik Akses Laporan Midterm</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Siswa <b>{withdrawModal.studentName}</b> tidak akan dapat melihat laporan ini di Rapor Saya. File PDF dan riwayat audit tetap tersimpan.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wide">
                  Alasan Penarikan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={withdrawalReason}
                  onChange={(e) => setWithdrawalReason(e.target.value)}
                  placeholder="Contoh: Terdapat perbaikan evaluasi pada bagian General Comments..."
                  className="w-full border border-slate-250 rounded-2xl p-3 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none min-h-[90px]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => {
                    setWithdrawModal(null);
                    setWithdrawalReason('');
                  }}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleWithdrawReport}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl cursor-pointer shadow-md shadow-rose-600/10"
                >
                  Ya, Tarik Akses Laporan
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto font-sans">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHistoryModal(null)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
          />
          <div className="flex min-h-screen items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-xl border border-slate-150 space-y-4"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900">
                  <History size={18} className="text-emerald-600" />
                  <h3 className="text-sm font-black uppercase tracking-tight">
                    Riwayat Audit Delivery: {historyModal.studentName}
                  </h3>
                </div>
                <button
                  onClick={() => setHistoryModal(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {historyModal.history.map((item: any, i: number) => {
                  const dateStr = new Date(item.timestamp).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  });

                  return (
                    <div key={i} className="p-3 bg-slate-50 border border-slate-150 rounded-2xl space-y-1 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span className={`uppercase tracking-wider text-[10px] px-2 py-0.5 rounded ${
                          item.action === 'SENT' ? 'bg-blue-100 text-blue-800' :
                          item.action === 'RESENT' ? 'bg-emerald-100 text-emerald-800' :
                          item.action === 'VIEWED' ? 'bg-purple-100 text-purple-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {item.action === 'SENT' ? 'Pengiriman Pertama' :
                           item.action === 'RESENT' ? 'Dikirim Ulang' :
                           item.action === 'VIEWED' ? 'Dilihat Siswa' : 'Akses Ditarik'}
                          {item.version ? ` (v${item.version})` : ''}
                        </span>
                        <span className="text-slate-400 text-[10px]">{dateStr}</span>
                      </div>
                      {item.actorName && (
                        <p className="text-slate-600 font-medium">Oleh: <b>{item.actorName}</b></p>
                      )}
                      {item.reason && (
                        <p className="text-rose-700 italic bg-rose-50/80 p-2 rounded-xl text-[11px]">
                          " {item.reason} "
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setHistoryModal(null)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
};
