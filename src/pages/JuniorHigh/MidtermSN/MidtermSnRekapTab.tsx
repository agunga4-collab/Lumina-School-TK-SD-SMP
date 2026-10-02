import * as React from 'react';
import {
  FileCheck, ExternalLink, CheckCircle2, Clock,
  Eye, RefreshCw, Loader2, ShieldAlert, Send, Undo2, X, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import type { SnStudentDoc, SnPublishedMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Class, User } from '../../../types';

interface MidtermSnRekapTabProps {
  currentUser: User;
  selectedClass: Class;
  snStudents: SnStudentDoc[];
  publishedReports: SnPublishedMidtermReportDoc[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  onRefreshData: () => Promise<void>;
  loading: boolean;
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

export const MidtermSnRekapTab: React.FC<MidtermSnRekapTabProps> = ({
  currentUser,
  selectedClass,
  snStudents,
  publishedReports,
  academicYear,
  semester,
  midtermTerm,
  onRefreshData,
  loading
}) => {
  // Map published SN reports by student ID to get the latest version
  const publishedMap = React.useMemo(() => {
    const map: Record<string, SnPublishedMidtermReportDoc> = {};
    (publishedReports || []).forEach((pub) => {
      if (!map[pub.studentId] || (pub.reportVersion || 0) > (map[pub.studentId].reportVersion || 0)) {
        map[pub.studentId] = pub;
      }
    });
    return map;
  }, [publishedReports]);

  // Delivery tracking & student accounts maps
  const [deliveryTrackingMap, setDeliveryTrackingMap] = React.useState<Record<string, any>>({});
  const [studentAccountsMap, setStudentAccountsMap] = React.useState<Record<string, { studentUid: string; studentAccountId: string } | null>>({});
  const [isFetchingTracking, setIsFetchingTracking] = React.useState<boolean>(false);
  const [isProcessingAction, setIsProcessingAction] = React.useState<boolean>(false);

  // Withdrawal modal state
  const [withdrawalModal, setWithdrawalModal] = React.useState<{ studentId: string; studentName: string } | null>(null);
  const [withdrawalReason, setWithdrawalReason] = React.useState<string>('');

  // Permission Checks: homeroom teacher or head/admin staff
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

  // Primary function to fetch all delivery stats and check student accounts
  const fetchDeliveryTrackingAndAccounts = async () => {
    if (!selectedClass?.id || !academicYear) return;
    setIsFetchingTracking(true);
    try {
      // 1. Fetch Tracking Records from jh_midterm_delivery_tracking
      const q = query(
        collection(db, 'jh_midterm_delivery_tracking'),
        where('classId', '==', selectedClass.id),
        where('academicYear', '==', academicYear),
        where('semester', '==', semester),
        where('midtermTerm', '==', midtermTerm)
      );
      const snap = await getDocs(q);
      const trackMap: Record<string, any> = {};

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        let item = { id: docSnap.id, ...data };

        // Backfill missing studentUid if needed (exactly matching regular tab logic)
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
          trackMap[data.studentId] = item;
        }
      }
      setDeliveryTrackingMap(trackMap);

      // 2. Resolve Student Firebase Accounts
      const accMap: Record<string, { studentUid: string; studentAccountId: string } | null> = {};
      for (const std of snStudents) {
        const acc = await resolveStudentUserAccount(std.studentId, std.studentName);
        accMap[std.studentId] = acc;
      }
      setStudentAccountsMap(accMap);
    } catch (err) {
      console.error('[MidtermSnRekapTab] Error loading delivery tracking/accounts:', err);
    } finally {
      setIsFetchingTracking(false);
    }
  };

  React.useEffect(() => {
    fetchDeliveryTrackingAndAccounts();
  }, [selectedClass?.id, academicYear, semester, midtermTerm, snStudents]);

  // Aksi Kirim / Kirim Ulang Rapor
  const handleSendReport = async (student: SnStudentDoc) => {
    if (!canManageDelivery) {
      toast.error('Anda tidak memiliki izin untuk mengelola pengiriman untuk kelas ini.');
      return;
    }

    const pubDoc = publishedMap[student.studentId];
    if (!pubDoc) {
      toast.error('Rapor siswa belum dipublish.');
      return;
    }

    const acc = studentAccountsMap[student.studentId];
    if (!acc) {
      toast.error('Gagal mengirim: Akun siswa belum terhubung.');
      return;
    }

    setIsProcessingAction(true);
    const toastId = toast.loading(`Mengirim rapor untuk ${student.studentName}...`);
    try {
      const docId = `JH_${student.studentId}_S${semester}_T${midtermTerm}`;
      const trackingRef = doc(db, 'jh_midterm_delivery_tracking', docId);

      const existingTracking = deliveryTrackingMap[student.studentId];
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
        version: pubDoc.reportVersion || 1
      });

      const payload = {
        id: docId,
        studentId: student.studentId,
        studentUid: acc.studentUid,
        studentAccountId: acc.studentAccountId,
        studentName: student.studentName,
        nisnSnapshot: student.nisn || pubDoc.reportSnapshot?.student?.nisn || '-',
        classId: selectedClass.id,
        className: selectedClass.name || '',
        unit: 'JUNIOR_HIGH',
        academicYear,
        semester,
        midtermTerm,
        reportId: pubDoc.id,
        activeReportId: pubDoc.id,
        reportVersion: pubDoc.reportVersion || 1,
        pdfFileId: pubDoc.driveFileId || '',
        pdfUrl: pubDoc.driveFileUrl || '',
        activePdfUrl: pubDoc.driveFileUrl || '',
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
      toast.success(`Rapor Midterm untuk ${student.studentName} (v${pubDoc.reportVersion || 1}) berhasil ${isResend ? 'dikirim ulang' : 'dikirim'}!`, { id: toastId });
      await fetchDeliveryTrackingAndAccounts();
    } catch (err: any) {
      console.error('[MidtermSnRekapTab] Error sending report:', err);
      toast.error('Gagal mengirim rapor: ' + (err.message || 'Error'), { id: toastId });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Aksi Tarik Rapor (Withdraw Access)
  const handleWithdrawReport = async () => {
    if (!canManageDelivery) {
      toast.error('Anda tidak memiliki izin untuk mengelola pengiriman untuk kelas ini.');
      return;
    }
    if (!withdrawalModal) return;
    if (!withdrawalReason.trim()) {
      toast.error('Alasan penarikan wajib diisi.');
      return;
    }

    setIsProcessingAction(true);
    const toastId = toast.loading(`Menarik akses rapor untuk ${withdrawalModal.studentName}...`);
    try {
      const { studentId, studentName } = withdrawalModal;
      const docId = `JH_${studentId}_S${semester}_T${midtermTerm}`;
      const trackingRef = doc(db, 'jh_midterm_delivery_tracking', docId);

      const existingTracking = deliveryTrackingMap[studentId];
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
      toast.success(`Akses laporan untuk ${studentName} berhasil ditarik.`, { id: toastId });
      setWithdrawalModal(null);
      setWithdrawalReason('');
      await fetchDeliveryTrackingAndAccounts();
    } catch (err: any) {
      console.error('[MidtermSnRekapTab] Error withdrawing report:', err);
      toast.error('Gagal menarik rapor: ' + (err.message || 'Error'), { id: toastId });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Helper to determine status and colors
  const getDeliveryStatusDisplay = (studentId: string) => {
    const pubDoc = publishedMap[studentId];
    const track = deliveryTrackingMap[studentId];

    if (!pubDoc) {
      return {
        label: 'Belum Publish',
        color: 'bg-slate-100 text-slate-500 border-slate-200',
        description: 'Laporan harus dipublish terlebih dahulu'
      };
    }

    if (!track) {
      return {
        label: 'Siap Dikirim',
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        description: 'Laporan sudah terbit & siap dikirim'
      };
    }

    const st = String(track.deliveryStatus || '').toUpperCase();
    if (st === 'WITHDRAWN') {
      return {
        label: 'Ditarik',
        color: 'bg-rose-100 text-rose-800 border-rose-200',
        description: `Ditarik pada ${new Date(track.withdrawnAt).toLocaleString('id-ID')} oleh ${track.withdrawnByName || 'Guru'}`
      };
    }

    if (st === 'VIEWED' || track.viewCount > 0 || track.firstViewedAt) {
      return {
        label: 'Dilihat',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        description: `Pertama kali dilihat pada ${new Date(track.firstViewedAt || track.firstOpenedAt).toLocaleString('id-ID')}`
      };
    }

    if (st === 'SENT') {
      return {
        label: 'Terkirim',
        color: 'bg-amber-100 text-amber-800 border-amber-200',
        description: `Dikirim pada ${new Date(track.sentAt).toLocaleString('id-ID')} oleh ${track.sentByName || 'Guru'}`
      };
    }

    return {
      label: 'Siap Dikirim',
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      description: 'Laporan sudah terbit & siap dikirim'
    };
  };

  const handleManualRefresh = async () => {
    await onRefreshData();
    await fetchDeliveryTrackingAndAccounts();
    toast.success('Data berhasil diperbarui!');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck size={20} className="text-purple-300" />
            <h2 className="text-base font-black tracking-tight">
              Rekap Publikasi, Pengiriman & Tracking Siswa SN: <span className="text-amber-300">{selectedClass.name}</span>
            </h2>
          </div>
          <p className="text-xs text-purple-200">
            Daftar status publikasi, pengiriman rapor, dan pemantauan akses orang tua/siswa khusus Rapor SN.
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={loading || isFetchingTracking}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 border border-white/20 cursor-pointer"
        >
          <RefreshCw size={14} className={(loading || isFetchingTracking) ? 'animate-spin' : ''} />
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
                  <th className="p-4">Link Drive</th>
                  <th className="p-4">Akun Siswa</th>
                  <th className="p-4">Status Pengiriman</th>
                  <th className="p-4 text-center">Aksi Pengiriman</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {snStudents.map((student, idx) => {
                  const pubDoc = publishedMap[student.studentId];
                  const tracking = deliveryTrackingMap[student.studentId];
                  const account = studentAccountsMap[student.studentId];
                  const deliveryStatus = getDeliveryStatusDisplay(student.studentId);

                  const isPublished = !!pubDoc;
                  const isAccountLinked = !!account;

                  return (
                    <tr key={student.studentId} className="hover:bg-slate-50/80 transition-all">
                      <td className="p-4 font-extrabold text-slate-400">{idx + 1}</td>
                      <td className="p-4 font-black text-slate-900">
                        <div>{student.studentName}</div>
                        {tracking?.withdrawalReason && deliveryStatus.label === 'Ditarik' && (
                          <div className="text-[10px] text-red-500 font-bold italic mt-0.5">
                            Alasan Tarik: {tracking.withdrawalReason}
                          </div>
                        )}
                      </td>
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
                      <td className="p-4">
                        {pubDoc?.driveFileUrl ? (
                          <a
                            href={pubDoc.driveFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg inline-flex items-center gap-1 font-bold text-[11px] transition-all border border-purple-100"
                          >
                            <ExternalLink size={13} /> Buka PDF
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4">
                        {isAccountLinked ? (
                          <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold rounded-lg">
                            Terhubung
                          </span>
                        ) : (
                          <span
                            className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-bold rounded-lg cursor-help"
                            title="Akun belum terhubung. Pastikan email atau data di database user sudah lengkap."
                          >
                            Belum Terhubung
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg border inline-flex items-center gap-1 ${deliveryStatus.color}`}>
                            {deliveryStatus.label}
                          </span>
                          <p className="text-[10px] text-slate-400 leading-snug">{deliveryStatus.description}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          {/* Send/Resend Button */}
                          {!isPublished ? (
                            <span className="text-[10px] text-slate-400 italic">Publish dahulu</span>
                          ) : !isAccountLinked ? (
                            <span className="text-[10px] text-rose-500 font-bold italic">Akun belum terhubung</span>
                          ) : (
                            <>
                              {(!tracking || tracking.deliveryStatus === 'WITHDRAWN') ? (
                                <button
                                  onClick={() => handleSendReport(student)}
                                  disabled={isProcessingAction || !canManageDelivery}
                                  className="px-3 py-1.5 bg-purple-900 hover:bg-purple-800 text-white rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Send size={12} /> Kirim
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSendReport(student)}
                                  disabled={isProcessingAction || !canManageDelivery}
                                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <RefreshCw size={12} /> Kirim Ulang
                                </button>
                              )}

                              {/* Withdraw Button */}
                              {tracking && tracking.deliveryStatus !== 'WITHDRAWN' && (
                                <button
                                  onClick={() => setWithdrawalModal({ studentId: student.studentId, studentName: student.studentName })}
                                  disabled={isProcessingAction || !canManageDelivery}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Undo2 size={12} /> Tarik
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

      {/* Withdrawal Dialog / Modal */}
      {withdrawalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Undo2 size={18} className="text-rose-600" />
                Tarik Akses Rapor SN
              </h3>
              <button
                onClick={() => {
                  setWithdrawalModal(null);
                  setWithdrawalReason('');
                }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Tarik akses rapor untuk siswa <strong className="text-slate-900">{withdrawalModal.studentName}</strong>. Setelah ditarik, rapor tidak akan terlihat di halaman siswa/orang tua.
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  Alasan Penarikan Rapor <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={withdrawalReason}
                  onChange={(e) => setWithdrawalReason(e.target.value)}
                  placeholder="Masukkan alasan pembatalan/penarikan pengiriman..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setWithdrawalModal(null);
                    setWithdrawalReason('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Batal
                </button>
                <button
                  onClick={handleWithdrawReport}
                  disabled={isProcessingAction || !withdrawalReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 disabled:opacity-50"
                >
                  {isProcessingAction ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                  Tarik Akses
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
