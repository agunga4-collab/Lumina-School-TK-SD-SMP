import * as React from 'react';
import {
  FileCheck, ExternalLink, CheckCircle2, Clock,
  Eye, RefreshCw, Loader2, Send, XSquare,
  AlertCircle, AlertTriangle, User, History, ShieldAlert
} from 'lucide-react';
import { doc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { toast } from 'sonner';
import type { ElementarySnStudentDoc, ElementarySnPublishedMidtermReportDoc } from '../../../types/elementaryMidtermSnReport';
import type { Class, User as UserType } from '../../../types';

interface ElementaryMidtermSnRekapTabProps {
  snStudentsList: ElementarySnStudentDoc[];
  publishedReports: ElementarySnPublishedMidtermReportDoc[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  currentUser: UserType | null;
  onSelectStudentById: (studentId: string) => void;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

// Helper to resolve student Firebase Auth UID from studentId (Primary Key)
async function resolveStudentUserAccount(studentId: string): Promise<{ studentUid: string; studentAccountId: string } | null> {
  const cleanId = String(studentId || '').trim();
  if (!cleanId) return null;

  try {
    // 1. Primary: search users collection by studentId / luminaId
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

    // 2. Search any user role by studentId
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

    // 3. Check students master collection
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

export const ElementaryMidtermSnRekapTab: React.FC<ElementaryMidtermSnRekapTabProps> = ({
  snStudentsList,
  publishedReports,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  currentUser,
  onSelectStudentById,
  onRefreshData,
  loading
}) => {
  const [deliveryTrackingMap, setDeliveryTrackingMap] = React.useState<Record<string, any>>({});
  const [studentAccountsMap, setStudentAccountsMap] = React.useState<Record<string, { studentUid: string; studentAccountId: string } | null>>({});
  const [isFetchingTracking, setIsFetchingTracking] = React.useState<boolean>(true);

  // Modals state
  const [withdrawModal, setWithdrawModal] = React.useState<{ studentId: string; studentName: string } | null>(null);
  const [withdrawalReason, setWithdrawalReason] = React.useState<string>('');
  const [isActionLoading, setIsActionLoading] = React.useState<boolean>(false);

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

  const canManageDelivery = isSuperAdminOrHead || isAssignedTeacher;

  // Active latest published reports map per studentId
  const publishedMap = React.useMemo(() => {
    const map: Record<string, ElementarySnPublishedMidtermReportDoc> = {};
    (publishedReports || []).forEach((rep) => {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || (rep.reportVersion || 0) > (map[rep.studentId].reportVersion || 0)) {
          map[rep.studentId] = rep;
        }
      }
    });
    return map;
  }, [publishedReports]);

  // Fetch Delivery Tracking from Firestore
  const fetchDeliveryTracking = React.useCallback(async () => {
    if (!selectedClass?.id || !selectedYear) {
      setIsFetchingTracking(false);
      return;
    }
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
        if (data.studentId) {
          map[data.studentId] = { id: docSnap.id, ...data };
        }
      }

      setDeliveryTrackingMap(map);

      // Resolve student user accounts for all SN students
      const accMap: Record<string, { studentUid: string; studentAccountId: string } | null> = {};
      for (const student of snStudentsList) {
        const acc = await resolveStudentUserAccount(student.studentId);
        accMap[student.studentId] = acc;
      }
      setStudentAccountsMap(accMap);
    } catch (err) {
      console.error('[ElementaryMidtermSnRekapTab] fetchDeliveryTracking error:', err);
    } finally {
      setIsFetchingTracking(false);
    }
  }, [selectedClass?.id, selectedYear, selectedSemester, selectedTerm, snStudentsList]);

  React.useEffect(() => {
    fetchDeliveryTracking();
  }, [fetchDeliveryTracking]);

  // Handle Send / Resend Delivery
  const handleSendReport = async (student: ElementarySnStudentDoc) => {
    if (!canManageDelivery) {
      toast.error('Anda tidak memiliki hak akses untuk mengirim rapor kelas ini.');
      return;
    }

    const pubReport = publishedMap[student.studentId];
    if (!pubReport || !pubReport.driveFileUrl) {
      toast.error(`Rapor PDF belum terbit (published) untuk ${student.studentName}.`);
      return;
    }

    const resolvedAcc = studentAccountsMap[student.studentId] || await resolveStudentUserAccount(student.studentId);
    if (!resolvedAcc?.studentUid) {
      toast.error(`Akun siswa belum terhubung untuk ${student.studentName} (studentId: ${student.studentId}). Pengiriman tidak dapat dilakukan.`);
      return;
    }

    setIsActionLoading(true);
    try {
      const docId = `ELEM_${student.studentId}_S${selectedSemester}_T${selectedTerm}`;
      const trackingRef = doc(db, 'elem_midterm_delivery_tracking', docId);

      const existingTracking = deliveryTrackingMap[student.studentId];
      const existingStatus = String(existingTracking?.deliveryStatus || '').toLowerCase();
      const isResend = existingTracking && (existingStatus === 'sent' || existingStatus === 'viewed');

      const actorName = currentUser?.displayName || currentUser?.name || currentUser?.email || 'Guru / Admin';
      const actorUid = currentUser?.uid || 'system';

      const historyLog = Array.isArray(existingTracking?.history) ? [...existingTracking.history] : [];
      historyLog.push({
        action: isResend ? 'RESENT' : 'SENT',
        timestamp: Date.now(),
        actorUid,
        actorName,
        version: pubReport.reportVersion || 1
      });

      const payload = {
        id: docId,
        studentId: student.studentId,
        studentUid: resolvedAcc.studentUid,
        studentAccountId: resolvedAcc.studentAccountId,
        studentName: student.studentName,
        nisnSnapshot: student.nisn || pubReport.nisn || '',
        classId: selectedClass?.id || '',
        className: selectedClass?.name || '',
        unit: 'ELEMENTARY',
        academicYear: selectedYear,
        semester: selectedSemester,
        midtermTerm: selectedTerm,
        reportId: pubReport.id,
        activeReportId: pubReport.id,
        reportVersion: pubReport.reportVersion || 1,
        pdfFileId: pubReport.driveFileId || '',
        pdfUrl: pubReport.driveFileUrl || '',
        activePdfUrl: pubReport.driveFileUrl || '',
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
      toast.success(`Rapor Midterm SN untuk ${student.studentName} berhasil ${isResend ? 'dikirim ulang' : 'dikirim'}!`);
      await fetchDeliveryTracking();
    } catch (err: any) {
      console.error('[ElementaryMidtermSnRekapTab] handleSendReport error:', err);
      toast.error('Gagal mengirim laporan: ' + (err.message || 'Error'));
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle Withdraw (Tarik)
  const handleConfirmWithdraw = async () => {
    if (!withdrawModal) return;
    if (!canManageDelivery) {
      toast.error('Anda tidak memiliki hak akses untuk menarik rapor.');
      return;
    }

    const { studentId, studentName } = withdrawModal;
    const docId = `ELEM_${studentId}_S${selectedSemester}_T${selectedTerm}`;
    const trackingRef = doc(db, 'elem_midterm_delivery_tracking', docId);

    setIsActionLoading(true);
    try {
      const existingTracking = deliveryTrackingMap[studentId];
      const historyLog = Array.isArray(existingTracking?.history) ? [...existingTracking.history] : [];
      const actorName = currentUser?.displayName || currentUser?.name || currentUser?.email || 'Guru / Admin';
      const actorUid = currentUser?.uid || 'system';

      historyLog.push({
        action: 'WITHDRAWN',
        timestamp: Date.now(),
        actorUid,
        actorName,
        reason: withdrawalReason || 'Ditarik oleh pengajar/admin'
      });

      const payload = {
        deliveryStatus: 'withdrawn',
        activeForStudent: false,
        withdrawnAt: Date.now(),
        withdrawnBy: actorUid,
        withdrawnByName: actorName,
        withdrawalReason: withdrawalReason || '',
        history: historyLog,
        updatedAt: Date.now()
      };

      await setDoc(trackingRef, payload, { merge: true });
      toast.success(`Rapor SN untuk ${studentName} berhasil ditarik.`);
      setWithdrawModal(null);
      setWithdrawalReason('');
      await fetchDeliveryTracking();
    } catch (err: any) {
      console.error('[ElementaryMidtermSnRekapTab] handleConfirmWithdraw error:', err);
      toast.error('Gagal menarik rapor: ' + (err.message || 'Error'));
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck size={20} className="text-amber-800" />
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Rekap Pengiriman & Open Tracking Siswa SN
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Kirim, kirim ulang, dan tarik rapor Midterm untuk siswa SN. Rapor yang terkirim akan langsung tampil di portal Rapor Saya milik siswa.
          </p>
        </div>

        <button
          onClick={async () => {
            await onRefreshData();
            await fetchDeliveryTracking();
          }}
          disabled={loading || isFetchingTracking}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading || isFetchingTracking ? 'animate-spin' : ''} />
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
                <th className="p-3.5 text-center">Status Rilis</th>
                <th className="p-3.5 text-center">Versi PDF</th>
                <th className="p-3.5 text-center">Akun Siswa</th>
                <th className="p-3.5 text-center">Status Pengiriman</th>
                <th className="p-3.5">Waktu Kirim / Lihat</th>
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
                  const pubReport = publishedMap[student.studentId];
                  const isPublished = !!pubReport && !!pubReport.driveFileUrl;

                  const tracking = deliveryTrackingMap[student.studentId];
                  const resolvedAcc = studentAccountsMap[student.studentId];
                  const isAccountConnected = !!resolvedAcc?.studentUid;

                  const deliveryStatus = (tracking?.deliveryStatus || 'not_sent').toLowerCase();

                  // Determine display badge for delivery status
                  let deliveryBadge = (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10.5px] font-bold">
                      Siap Dikirim
                    </span>
                  );

                  if (deliveryStatus === 'sent') {
                    deliveryBadge = (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1">
                        <Send size={12} /> Terkirim
                      </span>
                    );
                  } else if (deliveryStatus === 'viewed') {
                    deliveryBadge = (
                      <span className="px-2.5 py-1 bg-sky-100 text-sky-800 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1">
                        <Eye size={12} /> Dilihat ({tracking?.viewCount || tracking?.openCount || 1}x)
                      </span>
                    );
                  } else if (deliveryStatus === 'withdrawn') {
                    deliveryBadge = (
                      <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1">
                        <XSquare size={12} /> Ditarik
                      </span>
                    );
                  }

                  const canSend = isPublished && isAccountConnected;

                  return (
                    <tr key={student.studentId || idx} className="hover:bg-slate-50/80 transition-all">
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

                      <td className="p-3.5 text-center">
                        {isPublished ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1">
                            <CheckCircle2 size={12} /> TERBIT
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg text-[10.5px] font-bold">
                            Belum Terbit
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-black text-slate-700">
                        {isPublished ? `v${pubReport.reportVersion}` : '-'}
                      </td>

                      <td className="p-3.5 text-center">
                        {isAccountConnected ? (
                          <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-md text-[10px] font-bold">
                            Terhubung
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md text-[10px] font-bold" title={`Belum terhubung ke akun siswa (studentId: ${student.studentId})`}>
                            Belum Terhubung
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        {deliveryBadge}
                      </td>

                      <td className="p-3.5 text-slate-600 text-[11px]">
                        {tracking?.sentAt ? (
                          <div>
                            <p className="font-medium text-slate-800">
                              Kirim: {new Date(tracking.sentAt).toLocaleString('id-ID')}
                            </p>
                            {(tracking.firstViewedAt || tracking.firstOpenedAt) && (
                              <p className="text-[10px] text-sky-700 font-semibold">
                                Lihat: {new Date(tracking.firstViewedAt || tracking.firstOpenedAt).toLocaleString('id-ID')}
                              </p>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Send / Resend button */}
                          <button
                            onClick={() => handleSendReport(student)}
                            disabled={!canSend || isActionLoading}
                            title={
                              !isPublished
                                ? 'Rapor belum terbit (published)'
                                : !isAccountConnected
                                ? `Akun siswa belum terhubung (ID: ${student.studentId})`
                                : deliveryStatus === 'sent' || deliveryStatus === 'viewed'
                                ? 'Kirim Ulang Rapor'
                                : 'Kirim Rapor ke Portal Siswa'
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                              deliveryStatus === 'sent' || deliveryStatus === 'viewed'
                                ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            <Send size={13} />
                            <span>
                              {deliveryStatus === 'sent' || deliveryStatus === 'viewed' ? 'Kirim Ulang' : 'Kirim'}
                            </span>
                          </button>

                          {/* Withdraw (Tarik) button */}
                          {(deliveryStatus === 'sent' || deliveryStatus === 'viewed') && (
                            <button
                              onClick={() => setWithdrawModal({ studentId: student.studentId, studentName: student.studentName })}
                              disabled={isActionLoading}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                              title="Tarik Rapor dari Siswa"
                            >
                              Tarik
                            </button>
                          )}

                          {/* History / Open Drive PDF */}
                          {isPublished && pubReport.driveFileUrl && (
                            <a
                              href={pubReport.driveFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shrink-0"
                              title="Buka Drive PDF"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}

                          <button
                            onClick={() => onSelectStudentById(student.studentId)}
                            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
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

      {/* Modal Withdraw Confirmation */}
      {withdrawModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Tarik Rapor SN</h3>
                <p className="text-xs text-slate-500">Siswa: {withdrawModal.studentName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Setelah ditarik, akses rapor pada portal Rapor Saya milik siswa akan ditutup dan status berubah menjadi <strong>Ditarik</strong>.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Alasan Penarikan (Opsional):</label>
              <textarea
                value={withdrawalReason}
                onChange={(e) => setWithdrawalReason(e.target.value)}
                placeholder="Contoh: Perbaikan nilai / revisi versi..."
                className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:outline-hidden focus:border-rose-500 h-20 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setWithdrawModal(null);
                  setWithdrawalReason('');
                }}
                disabled={isActionLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmWithdraw}
                disabled={isActionLoading}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-2xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isActionLoading && <Loader2 size={14} className="animate-spin" />}
                <span>Ya, Tarik Rapor</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
