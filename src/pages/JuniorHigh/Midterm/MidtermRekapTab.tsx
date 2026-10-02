import * as React from 'react';
import { 
  Eye, ExternalLink, Copy, Check, 
  Search, CheckCircle2, AlertCircle, FileText, X,
  Layers, BookOpen, Info, ArrowRight, HelpCircle,
  Send, RefreshCw, XSquare, History, ShieldAlert,
  Clock, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { MidtermPdfTemplate } from './MidtermPdfTemplate';
import type { 
  PublishedMidtermReport, 
  MidtermReportSnapshot,
  MidtermMasterGoalDoc,
  MidtermStudentDataDoc,
  MidtermGoalItem
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
  masterGoalsMap?: Record<string, MidtermMasterGoalDoc>;
  studentDataMap?: Record<string, MidtermStudentDataDoc>;
  disabledSubjects?: string[];
}

// Helper to resolve student Firebase Auth UID from master student/profile using studentId as primary key
async function resolveStudentUserAccount(studentId: string, studentName?: string): Promise<{ studentUid: string; studentAccountId: string } | null> {
  const cleanId = String(studentId || '').trim();
  if (!cleanId) return null;

  try {
    // 1. Primary: search users collection by studentId
    const qById = query(
      collection(db, 'users'),
      where('studentId', '==', cleanId)
    );
    const snapById = await getDocs(qById);
    if (!snapById.empty) {
      const uDoc = snapById.docs[0];
      const uid = uDoc.data().uid || uDoc.id;
      return { studentUid: uid, studentAccountId: uid };
    }

    // 2. Search users collection by luminaId
    const qByLuminaId = query(
      collection(db, 'users'),
      where('luminaId', '==', cleanId)
    );
    const snapByLumina = await getDocs(qByLuminaId);
    if (!snapByLumina.empty) {
      const uDoc = snapByLumina.docs[0];
      const uid = uDoc.data().uid || uDoc.id;
      return { studentUid: uid, studentAccountId: uid };
    }

    // 3. Search students master collection
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

  return null;
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
  onRefreshData,
  masterGoalsMap = {},
  studentDataMap = {},
  disabledSubjects = []
}) => {
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safePublishedReports = Array.isArray(publishedReports) ? publishedReports.filter(Boolean) : [];
  const safeClasses = Array.isArray(classes) ? classes.filter(Boolean) : [];
  const selectedClass = safeClasses.find(c => c.id === selectedClassId) || null;

  // Delivery tracking data & loading state
  const [deliveryTrackingMap, setDeliveryTrackingMap] = React.useState<Record<string, any>>({});
  const [isFetchingTracking, setIsFetchingTracking] = React.useState<boolean>(true);
  const [trackingFetchError, setTrackingFetchError] = React.useState<string | null>(null);

  // Student Account resolution map (studentId -> account info)
  const [studentAccountsMap, setStudentAccountsMap] = React.useState<Record<string, { studentUid: string; studentAccountId: string } | null>>({});

  // Filters & search
  const [filterDeliveryStatus, setFilterDeliveryStatus] = React.useState<'ALL' | 'READY_TO_SEND' | 'SENT' | 'VIEWED' | 'WITHDRAWN' | 'UNPUBLISHED'>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Action modals
  const [withdrawModal, setWithdrawModal] = React.useState<{ studentId: string; studentName: string } | null>(null);
  const [withdrawalReason, setWithdrawalReason] = React.useState<string>('');
  const [historyModal, setHistoryModal] = React.useState<{ studentName: string; history: any[]; tracking: any; pub: any } | null>(null);
  const [bulkSendConfirm, setBulkSendConfirm] = React.useState<boolean>(false);
  const [isSending, setIsSending] = React.useState<boolean>(false);

  // Modal snapshot preview
  const [previewSnapshot, setPreviewSnapshot] = React.useState<MidtermReportSnapshot | null>(null);
  const [previewTitle, setPreviewTitle] = React.useState<string>('');

  // Check authorization & assignment: Homeroom Teacher of assigned class or Super Admin / Head Unit
  const isSuperAdminOrHead = React.useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || (currentUser as any).roleId || '').toUpperCase();
    return ['SUPER_ADMIN', 'PRINCIPAL', 'HEAD_UNIT', 'HEAD_JUNIOR', 'VICE_PRINCIPAL', 'COORDINATOR', 'SECRETARY_JH', 'ADMIN'].includes(role);
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

  const canManageDelivery = isSuperAdminOrHead || isAssignedTeacher;

  // Resolve student accounts when students list changes
  React.useEffect(() => {
    let isCancelled = false;
    const resolveAccounts = async () => {
      const map: Record<string, { studentUid: string; studentAccountId: string } | null> = {};
      for (const st of safeStudents) {
        if (!st?.id) continue;
        const acc = await resolveStudentUserAccount(st.id, st.name);
        map[st.id] = acc;
      }
      if (!isCancelled) {
        setStudentAccountsMap(map);
      }
    };
    if (safeStudents.length > 0) {
      resolveAccounts();
    } else {
      setStudentAccountsMap({});
    }
    return () => {
      isCancelled = true;
    };
  }, [safeStudents]);

  // Active latest published reports map
  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedMidtermReport> = {};
    for (const rep of safePublishedReports) {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || (rep.version ?? 0) > (map[rep.studentId].version ?? 0)) {
          map[rep.studentId] = rep;
        }
      }
    }
    return map;
  }, [safePublishedReports]);

  // Fetch Delivery Tracking from Firestore
  const fetchDeliveryTracking = React.useCallback(async () => {
    if (!selectedClassId || !academicYear) return;
    setIsFetchingTracking(true);
    setTrackingFetchError(null);
    try {
      const q = query(
        collection(db, 'jh_midterm_delivery_tracking'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', academicYear),
        where('semester', '==', semester),
        where('midtermTerm', '==', midtermTerm)
      );
      const snap = await getDocs(q);
      const map: Record<string, any> = {};

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        let item = { id: docSnap.id, ...data };

        // Backfill missing studentUid if needed
        if (data.studentId && (!data.studentUid || !data.studentAccountId)) {
          const acc = await resolveStudentUserAccount(data.studentId, data.studentName);
          if (acc?.studentUid) {
            const trackingRef = doc(db, 'jh_midterm_delivery_tracking', docSnap.id);
            const backfillPayload = {
              studentUid: acc.studentUid,
              studentAccountId: acc.studentAccountId,
              studentId: data.studentId,
              unit: 'JUNIOR_HIGH',
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
    } catch (err: any) {
      console.error('[MidtermRekapTab] Error fetching delivery tracking:', err);
      setTrackingFetchError(err.message || 'Gagal memuat status tracking pengiriman.');
    } finally {
      setIsFetchingTracking(false);
    }
  }, [selectedClassId, academicYear, semester, midtermTerm]);

  React.useEffect(() => {
    fetchDeliveryTracking();
  }, [selectedClassId, academicYear, semester, midtermTerm]);

  // Reset modal states on mount and whenever context changes
  React.useEffect(() => {
    setWithdrawModal(null);
    setHistoryModal(null);
    setPreviewSnapshot(null);
  }, [selectedClassId, academicYear, semester, midtermTerm]);

  // Helper to determine effective status
  const getStudentDeliveryStatus = React.useCallback((studentId: string): 'UNPUBLISHED' | 'READY_TO_SEND' | 'SENT' | 'VIEWED' | 'WITHDRAWN' => {
    const pub = publishedMap[studentId];
    if (!pub) return 'UNPUBLISHED';

    const track = deliveryTrackingMap[studentId];
    if (!track) return 'READY_TO_SEND';

    const st = String(track.deliveryStatus || '').toUpperCase();
    if (track.activeForStudent === false || st === 'WITHDRAWN') return 'WITHDRAWN';
    if (st === 'VIEWED') return 'VIEWED';
    if (st === 'SENT') return 'SENT';
    return 'READY_TO_SEND';
  }, [publishedMap, deliveryTrackingMap]);

  // Summary Metrics
  const totalStudents = safeStudents.length;
  const publishedStudentsCount = safeStudents.filter(s => s && s.id && Boolean(publishedMap[s.id])).length;
  const readyToSendCount = safeStudents.filter(s => s && s.id && getStudentDeliveryStatus(s.id) === 'READY_TO_SEND').length;
  const sentCount = safeStudents.filter(s => s && s.id && getStudentDeliveryStatus(s.id) === 'SENT').length;
  const viewedCount = safeStudents.filter(s => s && s.id && getStudentDeliveryStatus(s.id) === 'VIEWED').length;
  const withdrawnCount = safeStudents.filter(s => s && s.id && getStudentDeliveryStatus(s.id) === 'WITHDRAWN').length;

  // Filter student rows
  const filteredRows = React.useMemo(() => {
    return safeStudents.filter(student => {
      if (!student || !student.id) return false;
      const status = getStudentDeliveryStatus(student.id);

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const studentName = typeof student.name === 'string' ? student.name : '';
        const matchesName = studentName.toLowerCase().includes(q);
        const matchesId = String(student.id || '').toLowerCase().includes(q);
        const matchesNisn = String(student.nisn || (student as any).nis || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesNisn) return false;
      }

      // Filter Delivery Status
      if (filterDeliveryStatus !== 'ALL') {
        if (status !== filterDeliveryStatus) return false;
      }

      return true;
    });
  }, [safeStudents, getStudentDeliveryStatus, searchQuery, filterDeliveryStatus]);

  // Handle send or resend single report
  const handleSendReport = async (student: Student) => {
    if (!canManageDelivery) {
      toast.error('Anda hanya dapat mengirim rapor untuk kelas yang ditugaskan kepada Anda.');
      return;
    }

    const pubReport = publishedMap[student.id];
    if (!pubReport) {
      toast.error(`Rapor PDF belum dipublikasikan untuk ${student.name}.`);
      return;
    }

    const existingTracking = deliveryTrackingMap[student.id];
    const resolvedAcc = studentAccountsMap[student.id] || (await resolveStudentUserAccount(student.id, student.name));
    const studentUid = resolvedAcc?.studentUid || existingTracking?.studentUid || '';
    const studentAccountId = resolvedAcc?.studentAccountId || existingTracking?.studentAccountId || studentUid;

    if (!studentUid) {
      toast.error(`Akun siswa belum terhubung untuk ${student.name}. Pastikan data siswa/user sudah memiliki studentId/NIS yang sesuai.`);
      return;
    }

    setIsSending(true);
    try {
      const docId = `JH_${student.id}_S${semester}_T${midtermTerm}`;
      const trackingRef = doc(db, 'jh_midterm_delivery_tracking', docId);

      const existingStatus = String(existingTracking?.deliveryStatus || '').toUpperCase();
      const isResend = existingTracking && (existingStatus === 'SENT' || existingStatus === 'VIEWED');

      const actorName = currentUser?.displayName || (currentUser as any)?.name || currentUser?.email || 'Guru / Admin';
      const actorUid = currentUser?.uid || 'system';

      const historyLog = Array.isArray(existingTracking?.history) ? [...existingTracking.history] : [];
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
        nisnSnapshot: student.nisn || (student as any).nis || pubReport.nisnSnapshot || '-',
        classId: selectedClass?.id || selectedClassId,
        className: selectedClass?.name || '',
        unit: 'JUNIOR_HIGH',
        academicYear,
        semester,
        midtermTerm,
        reportId: pubReport.id,
        activeReportId: pubReport.id,
        reportVersion: pubReport.version || 1,
        pdfFileId: pubReport.driveFileId || '',
        pdfUrl: pubReport.driveFileUrl || pubReport.pdfUrl || '',
        activePdfUrl: pubReport.driveFileUrl || pubReport.pdfUrl || '',
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
      toast.success(`Rapor Midterm untuk ${student.name} (v${pubReport.version || 1}) berhasil ${isResend ? 'dikirim ulang' : 'dikirim'}!`);
      await fetchDeliveryTracking();
    } catch (err: any) {
      console.error('Error sending report:', err);
      toast.error('Gagal mengirim rapor: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSending(false);
    }
  };

  // Handle bulk send for all ready reports
  const handleBulkSendReady = async () => {
    if (!canManageDelivery) {
      toast.error('Anda hanya dapat mengirim rapor untuk kelas yang ditugaskan kepada Anda.');
      return;
    }

    const readyTargets = safeStudents.filter(st => {
      const pub = publishedMap[st.id];
      if (!pub) return false;
      const status = getStudentDeliveryStatus(st.id);
      return status === 'READY_TO_SEND' || status === 'WITHDRAWN';
    });

    if (readyTargets.length === 0) {
      toast.error('Tidak ada laporan siswa yang siap dikirim.');
      setBulkSendConfirm(false);
      return;
    }

    setIsSending(true);
    let sentCount = 0;

    for (const student of readyTargets) {
      try {
        const pubReport = publishedMap[student.id];
        if (!pubReport) continue;

        const docId = `JH_${student.id}_S${semester}_T${midtermTerm}`;
        const trackingRef = doc(db, 'jh_midterm_delivery_tracking', docId);

        const existingTracking = deliveryTrackingMap[student.id];
        const isResend = existingTracking && (existingTracking.deliveryStatus === 'SENT' || existingTracking.deliveryStatus === 'VIEWED');

        const actorName = currentUser?.displayName || (currentUser as any)?.name || currentUser?.email || 'Guru / Admin';
        const actorUid = currentUser?.uid || 'system';

        const resolvedAcc = await resolveStudentUserAccount(student.id, student.name);
        const studentUid = resolvedAcc?.studentUid || existingTracking?.studentUid || '';
        const studentAccountId = resolvedAcc?.studentAccountId || existingTracking?.studentAccountId || studentUid;

        const historyLog = Array.isArray(existingTracking?.history) ? [...existingTracking.history] : [];
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
          nisnSnapshot: student.nisn || (student as any).nis || pubReport.nisnSnapshot || '-',
          classId: selectedClass?.id || selectedClassId,
          className: selectedClass?.name || '',
          unit: 'JUNIOR_HIGH',
          academicYear,
          semester,
          midtermTerm,
          reportId: pubReport.id,
          activeReportId: pubReport.id,
          reportVersion: pubReport.version || 1,
          pdfFileId: pubReport.driveFileId || '',
          pdfUrl: pubReport.driveFileUrl || pubReport.pdfUrl || '',
          activePdfUrl: pubReport.driveFileUrl || pubReport.pdfUrl || '',
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
    toast.success(`Berhasil mengirim ${sentCount} rapor Midterm.`);
    await fetchDeliveryTracking();
  };

  // Handle report withdrawal
  const handleWithdrawReport = async () => {
    if (!canManageDelivery) {
      toast.error('Anda hanya dapat menarik laporan untuk kelas yang ditugaskan kepada Anda.');
      return;
    }
    if (!withdrawModal) return;
    if (!withdrawalReason.trim()) {
      toast.error('Alasan penarikan wajib diisi.');
      return;
    }

    try {
      const docId = `JH_${withdrawModal.studentId}_S${semester}_T${midtermTerm}`;
      const trackingRef = doc(db, 'jh_midterm_delivery_tracking', docId);

      const existingTracking = deliveryTrackingMap[withdrawModal.studentId];
      const actorName = currentUser?.displayName || (currentUser as any)?.name || currentUser?.email || 'Guru / Admin';
      const actorUid = currentUser?.uid || 'system';

      const historyLog = Array.isArray(existingTracking?.history) ? [...existingTracking.history] : [];
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
      toast.error('Gagal menarik laporan: ' + (err.message || 'Unknown error'));
    }
  };

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Siswa */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Total Siswa
          </span>
          <div className="text-xl font-black text-slate-900">{totalStudents}</div>
          <p className="text-[10px] text-slate-400">Terdaftar di kelas</p>
        </div>

        {/* Sudah Terbit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
            Rapor Terbit
          </span>
          <div className="text-xl font-black text-emerald-700">
            {publishedStudentsCount} <span className="text-[10px] font-bold text-slate-400">/ {totalStudents}</span>
          </div>
          <p className="text-[10px] text-slate-400">
            {totalStudents > 0 ? Math.round((publishedStudentsCount / totalStudents) * 100) : 0}% terbit
          </p>
        </div>

        {/* Siap Dikirim */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs space-y-1 bg-amber-50/30">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
            Siap Dikirim
          </span>
          <div className="text-xl font-black text-amber-700">{readyToSendCount}</div>
          <p className="text-[10px] text-amber-600">Belum dikirim ke siswa</p>
        </div>

        {/* Terkirim */}
        <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs space-y-1 bg-blue-50/30">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
            Terkirim
          </span>
          <div className="text-xl font-black text-blue-700">{sentCount}</div>
          <p className="text-[10px] text-blue-600">Menunggu dibuka</p>
        </div>

        {/* Dilihat */}
        <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-xs space-y-1 bg-purple-50/30">
          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
            Dilihat
          </span>
          <div className="text-xl font-black text-purple-700">{viewedCount}</div>
          <p className="text-[10px] text-purple-600">Sudah dibuka siswa</p>
        </div>

        {/* Ditarik */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs space-y-1 bg-rose-50/30">
          <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">
            Ditarik
          </span>
          <div className="text-xl font-black text-rose-700">{withdrawnCount}</div>
          <p className="text-[10px] text-rose-600">Akses ditutup</p>
        </div>
      </div>

      {/* Filter & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Class selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Kelas:</span>
            <select
              value={selectedClassId}
              onChange={(e) => onSelectClassId(e.target.value)}
              className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {safeClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Filter Status Delivery */}
          <select
            value={filterDeliveryStatus}
            onChange={(e) => setFilterDeliveryStatus(e.target.value as any)}
            className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="ALL">Semua Status Pengiriman</option>
            <option value="READY_TO_SEND">Siap Dikirim</option>
            <option value="SENT">Terkirim (Belum Dibuka)</option>
            <option value="VIEWED">Dilihat Siswa</option>
            <option value="WITHDRAWN">Ditarik</option>
            <option value="UNPUBLISHED">Belum Terbit</option>
          </select>
        </div>

        {/* Search & Bulk Send */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau ID siswa..."
              className="text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 w-52"
            />
          </div>

          {/* Bulk Send Button */}
          {canManageDelivery && (
            <button
              onClick={() => setBulkSendConfirm(true)}
              disabled={readyToSendCount === 0 || isSending}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              <Send size={13} /> Kirim Semua yang Siap ({readyToSendCount})
            </button>
          )}
        </div>
      </div>

      {/* Error Banner if Tracking fetch fails */}
      {trackingFetchError && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-start gap-3 shadow-xs">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-black text-rose-950 uppercase tracking-wide">
              Gagal Memuat Data Pengiriman
            </h4>
            <p className="text-xs text-rose-800">
              {trackingFetchError}
            </p>
          </div>
        </div>
      )}

      {/* Main Delivery & Tracking Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading || isFetchingTracking ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw size={24} className="animate-spin text-slate-900 mx-auto" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse">
              Memuat data tracking pengiriman...
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <AlertCircle size={32} className="text-amber-500 mx-auto" />
            <h3 className="text-sm font-black text-slate-800 uppercase">Tidak Ada Data Siswa</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Tidak ditemukan data siswa yang cocok dengan filter yang dipilih.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4 min-w-[200px]">Nama Siswa</th>
                  <th className="py-3 px-4 min-w-[120px]">Versi Rapor</th>
                  <th className="py-3 px-4 min-w-[130px]">Status Pengiriman</th>
                  <th className="py-3 px-4 min-w-[170px]">Aktivitas Terakhir</th>
                  <th className="py-3 px-4 min-w-[180px] text-center">Aksi Pengiriman</th>
                  <th className="py-3 px-4 min-w-[140px] text-right">Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {filteredRows.map((student, idx) => {
                  const pub = publishedMap[student.id];
                  const track = deliveryTrackingMap[student.id];
                  const status = getStudentDeliveryStatus(student.id);

                  const resolvedAcc = studentAccountsMap[student.id];
                  const isAccountLinked = Boolean(resolvedAcc?.studentUid || track?.studentUid);

                  const isPublished = Boolean(pub);
                  const isSent = status === 'SENT';
                  const isViewed = status === 'VIEWED';
                  const isWithdrawn = status === 'WITHDRAWN';
                  const isReady = status === 'READY_TO_SEND';

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* No */}
                      <td className="py-3.5 px-4 text-center text-slate-400 font-bold">
                        {idx + 1}
                      </td>

                      {/* Nama Siswa & ID */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900">{student.name}</div>
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400 font-bold">
                          <span>ID: {student.id}</span>
                          {student.nisn ? <span>• NISN: {student.nisn}</span> : null}
                          {!isAccountLinked && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold">
                              Akun Belum Terhubung
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Versi Rapor */}
                      <td className="py-3.5 px-4">
                        {isPublished ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={10} /> v{pub.version} Terbit
                            </span>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {formatTimestamp(pub.generatedAt)}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-500 border border-slate-200">
                            Belum Terbit
                          </span>
                        )}
                      </td>

                      {/* Status Pengiriman */}
                      <td className="py-3.5 px-4">
                        {status === 'UNPUBLISHED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-slate-100 text-slate-500">
                            –
                          </span>
                        )}
                        {status === 'READY_TO_SEND' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock size={11} /> Siap Dikirim
                          </span>
                        )}
                        {status === 'SENT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-blue-50 text-blue-800 border border-blue-200">
                            <Send size={11} /> Terkirim
                          </span>
                        )}
                        {status === 'VIEWED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-purple-50 text-purple-800 border border-purple-200">
                            <Eye size={11} /> Dilihat ({track?.viewCount || 1}x)
                          </span>
                        )}
                        {status === 'WITHDRAWN' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-rose-50 text-rose-800 border border-rose-200">
                            <ShieldAlert size={11} /> Ditarik
                          </span>
                        )}
                      </td>

                      {/* Aktivitas Terakhir */}
                      <td className="py-3.5 px-4 text-[10px] text-slate-500">
                        {isViewed && (
                          <div>
                            <div className="font-bold text-purple-700">Dibuka: {formatTimestamp(track?.lastViewedAt || track?.firstViewedAt)}</div>
                            <div className="text-slate-400">Dikirim: {formatTimestamp(track?.sentAt)}</div>
                          </div>
                        )}
                        {isSent && (
                          <div>
                            <div className="font-bold text-blue-700">Dikirim: {formatTimestamp(track?.sentAt)}</div>
                            <div className="text-slate-400">Oleh: {track?.sentByName || 'Guru'}</div>
                          </div>
                        )}
                        {isWithdrawn && (
                          <div>
                            <div className="font-bold text-rose-700">Ditarik: {formatTimestamp(track?.withdrawnAt)}</div>
                            <div className="text-slate-400 italic truncate max-w-[150px]" title={track?.withdrawalReason}>
                              "{track?.withdrawalReason || '-'}"
                            </div>
                          </div>
                        )}
                        {isReady && <span className="text-slate-400 italic">Belum dikirim</span>}
                        {!isPublished && <span className="text-slate-300">–</span>}
                      </td>

                      {/* Aksi Pengiriman (Kirim, Kirim Ulang, Tarik) */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {isPublished ? (
                            <>
                              {/* Kirim (bila READY atau WITHDRAWN) */}
                              {(isReady || isWithdrawn) && (
                                <button
                                  onClick={() => handleSendReport(student)}
                                  disabled={!canManageDelivery || isSending || !isAccountLinked}
                                  title={!canManageDelivery ? 'Hanya Guru Kelas atau Admin yang dapat mengirim' : !isAccountLinked ? 'Akun siswa belum terhubung' : 'Kirim laporan ke akun siswa'}
                                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <Send size={10} /> Kirim
                                </button>
                              )}

                              {/* Kirim Ulang (bila SENT atau VIEWED) */}
                              {(isSent || isViewed) && (
                                <button
                                  onClick={() => handleSendReport(student)}
                                  disabled={!canManageDelivery || isSending || !isAccountLinked}
                                  title={!canManageDelivery ? 'Hanya Guru Kelas atau Admin yang dapat mengirim ulang' : !isAccountLinked ? 'Akun siswa belum terhubung' : 'Kirim ulang update versi PDF terbaru'}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <RefreshCw size={10} /> Kirim Ulang
                                </button>
                              )}

                              {/* Tarik Akses (bila SENT atau VIEWED) */}
                              {(isSent || isViewed) && (
                                <button
                                  onClick={() => {
                                    setWithdrawModal({ studentId: student.id, studentName: student.name });
                                    setWithdrawalReason('');
                                  }}
                                  disabled={!canManageDelivery || isSending}
                                  title={canManageDelivery ? 'Tarik akses siswa terhadap rapor ini' : 'Hanya Guru Kelas atau Admin yang dapat menarik rapor'}
                                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-40 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <XSquare size={10} /> Tarik
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-bold">Harap Publish Dulu</span>
                          )}
                        </div>
                      </td>

                      {/* Dokumen: Link, Preview, History */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Audit History */}
                          <button
                            onClick={() => setHistoryModal({
                              studentName: student.name,
                              history: track?.history || [],
                              tracking: track,
                              pub
                            })}
                            title="Lihat Riwayat Pengiriman & Audit"
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all cursor-pointer"
                          >
                            <History size={13} />
                          </button>

                          {isPublished && (
                            <>
                              {/* Open PDF via Drive Link */}
                              {pub.driveFileUrl && (
                                <a
                                  href={pub.driveFileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Buka PDF Google Drive"
                                  className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-all"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              )}

                              {/* Copy Link */}
                              <button
                                onClick={() => handleCopyLink(pub)}
                                title="Salin Link PDF"
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all cursor-pointer"
                              >
                                {copiedId === pub.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                              </button>

                              {/* Preview Snapshot */}
                              {pub.reportSnapshot && (
                                <button
                                  onClick={() => {
                                    setPreviewSnapshot(pub.reportSnapshot);
                                    setPreviewTitle(`Preview Rapor ${student?.name || 'Siswa'} (v${pub?.version || 1})`);
                                  }}
                                  title="Preview Snapshot PDF"
                                  className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-all cursor-pointer"
                                >
                                  <Eye size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: TARIK LAPORAN (WITHDRAW) */}
      {withdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <ShieldAlert size={20} />
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                  Tarik Akses Rapor Siswa
                </h3>
              </div>
              <button
                onClick={() => setWithdrawModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                Anda akan menarik akses rapor untuk <strong className="text-slate-900">{withdrawModal.studentName}</strong>.
              </p>
              <p className="text-[11px] text-slate-500">
                Setelah ditarik, siswa tidak akan dapat melihat atau membuka rapor ini di portal siswa hingga dikirim kembali.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Alasan Penarikan <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={withdrawalReason}
                onChange={(e) => setWithdrawalReason(e.target.value)}
                placeholder="Contoh: Koreksi nilai Spiritual Health, revisi General Comments, dsb..."
                rows={3}
                className="w-full text-xs font-semibold p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setWithdrawModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleWithdrawReport}
                disabled={!withdrawalReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Konfirmasi Tarik Rapor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK SEND CONFIRMATION */}
      {bulkSendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <Send size={20} className="text-emerald-500" />
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                  Kirim Semua Rapor yang Siap
                </h3>
              </div>
              <button
                onClick={() => setBulkSendConfirm(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Apakah Anda yakin ingin mengirim <strong className="text-slate-900">{readyToSendCount} rapor siswa</strong> yang telah berstatus <strong>Siap Dikirim / Ditarik</strong> di kelas ini?
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setBulkSendConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleBulkSendReady}
                disabled={isSending}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Send size={12} /> Kirim Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RIWAYAT AUDIT (HISTORY AUDIT LOG) */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <History size={20} className="text-blue-600" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                    Riwayat Pengiriman Rapor
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">{historyModal.studentName}</p>
                </div>
              </div>
              <button
                onClick={() => setHistoryModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {(!historyModal.history || historyModal.history.length === 0) ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                  <Clock size={24} className="mx-auto text-slate-300" />
                  <p>Belum ada catatan aktivitas pengiriman.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {historyModal.history.map((ev, i) => {
                    const isSentEv = ev.action === 'SENT' || ev.action === 'RESENT';
                    const isViewedEv = ev.action === 'VIEWED';
                    const isWithdrawnEv = ev.action === 'WITHDRAWN';

                    return (
                      <div key={i} className="relative text-xs space-y-0.5">
                        <div className={`absolute -left-[19px] top-0.5 w-3 h-3 rounded-full border-2 border-white ${
                          isSentEv ? 'bg-blue-600' : isViewedEv ? 'bg-purple-600' : isWithdrawnEv ? 'bg-rose-600' : 'bg-slate-400'
                        }`} />
                        <div className="flex items-center justify-between">
                          <span className={`font-black uppercase text-[10px] ${
                            isSentEv ? 'text-blue-700' : isViewedEv ? 'text-purple-700' : isWithdrawnEv ? 'text-rose-700' : 'text-slate-700'
                          }`}>
                            {ev.action === 'SENT' ? 'Dikirim' : ev.action === 'RESENT' ? 'Dikirim Ulang' : ev.action === 'VIEWED' ? 'Dibuka Siswa' : ev.action === 'WITHDRAWN' ? 'Akses Ditarik' : ev.action}
                            {ev.version ? ` (v${ev.version})` : ''}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {formatTimestamp(ev.timestamp)}
                          </span>
                        </div>
                        {ev.actorName && (
                          <div className="text-[11px] text-slate-600">
                            Oleh: <strong className="text-slate-800">{ev.actorName}</strong>
                          </div>
                        )}
                        {ev.reason && (
                          <div className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-100 mt-1">
                            Alasan: "{ev.reason}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setHistoryModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW SNAPSHOT */}
      {previewSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-100 rounded-3xl max-w-4xl w-full h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-700">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-400" />
                <h3 className="text-sm font-black uppercase tracking-wider">{previewTitle}</h3>
              </div>
              <button
                onClick={() => setPreviewSnapshot(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex justify-center">
              <MidtermPdfTemplate snapshot={previewSnapshot} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
