import * as React from 'react';
import { 
  CheckCircle2, AlertCircle, RefreshCw,
  Check, X, Clock, ShieldCheck, Lock, UserCheck
} from 'lucide-react';
import { 
  updateElementaryGenComReviewStatus,
  isElementaryHeadOrSuperAdmin
} from '../../../services/elementaryMidtermService';
import {
  getApprovedByName,
  formatIndonesianDateTime
} from '../../../types/elementaryMidtermReport';
import type { 
  ElementaryMidtermStudentDataDoc,
  ElementaryMidtermGenComReviewStatus
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, User as UserType } from '../../../types';
import { toast } from 'sonner';

interface ElementaryReviewApprovalGenComTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  currentUser: UserType | null;
}

export const ElementaryReviewApprovalGenComTab: React.FC<ElementaryReviewApprovalGenComTabProps> = ({
  selectedClassId,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  students,
  studentDataMap,
  onRefreshData,
  currentUser
}) => {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(students[0]?.id || '');
  const [revisionFeedback, setRevisionFeedback] = React.useState<string>('');
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);

  // Strict check: Only Head Unit Elementary and Super Admin can approve or request revision
  const canApproveOrRevise = isElementaryHeadOrSuperAdmin(currentUser);

  const activeStudent = students.find(s => s.id === selectedStudentId) || students[0] || null;
  const currentStudentData = activeStudent ? studentDataMap[activeStudent.id] : null;

  const currentStatus: ElementaryMidtermGenComReviewStatus = 
    currentStudentData?.generalCommentReviewStatus || 'DRAFT';

  const isPendingReview = currentStatus === 'SUBMITTED_FOR_REVIEW' || (currentStatus as string) === 'PENDING_REVIEW';
  const isApproved = currentStatus === 'APPROVED';

  const commentText = 
    currentStudentData?.generalComment?.finalComment || 
    currentStudentData?.generalComment?.aiDraft || 
    '';

  const resolvedApprovedByName = React.useMemo(() => {
    return getApprovedByName(currentStudentData) || 'Kepala Unit Elementary';
  }, [currentStudentData]);

  const formattedApprovedTime = React.useMemo(() => {
    return formatIndonesianDateTime(currentStudentData?.approvedAt);
  }, [currentStudentData?.approvedAt]);

  const handleAction = async (action: 'APPROVE' | 'REQUEST_REVISION') => {
    if (!activeStudent || !currentUser) return;

    // Strict validation in UI handler
    if (!canApproveOrRevise) {
      toast.error('Akses ditolak: Hanya Head Unit Elementary dan Super Admin yang berhak menyetujui (Approve) atau meminta revisi General Comments.');
      return;
    }

    if (action === 'REQUEST_REVISION' && !revisionFeedback.trim()) {
      toast.error('Silakan isi catatan feedback revisi terlebih dahulu.');
      return;
    }

    setIsProcessing(true);

    try {
      await updateElementaryGenComReviewStatus(
        activeStudent.id,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        action,
        currentUser,
        revisionFeedback.trim(),
        commentText
      );

      if (action === 'APPROVE') {
        toast.success(`General Comment untuk ${activeStudent.name} berhasil disetujui (Approved).`);
      } else {
        toast.success(`Permintaan revisi untuk ${activeStudent.name} berhasil dikirim.`);
      }

      setRevisionFeedback('');
      await onRefreshData();
    } catch (e: any) {
      console.error("Error updating review status:", e);
      toast.error(e.message || 'Gagal memperbarui status review.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Student List */}
      <div className="lg:col-span-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>Status Approval GenCom ({students.length})</span>
          </h3>
        </div>

        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          {students.map((st, idx) => {
            const isSelected = st.id === selectedStudentId;
            const stData = studentDataMap[st.id];
            const status: ElementaryMidtermGenComReviewStatus = stData?.generalCommentReviewStatus || 'DRAFT';
            const isStPending = status === 'SUBMITTED_FOR_REVIEW' || (status as string) === 'PENDING_REVIEW';
            const isStApproved = status === 'APPROVED';

            return (
              <button
                key={st.id}
                onClick={() => setSelectedStudentId(st.id)}
                className={`w-full p-3 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-xl font-extrabold flex items-center justify-center text-[10px] ${
                    isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {idx + 1}
                  </span>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {st.name}
                    </p>
                    <span className={`text-[10px] font-bold ${
                      isStApproved ? 'text-emerald-400' :
                      isStPending ? 'text-amber-400' :
                      status === 'REVISION_REQUESTED' ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {isStApproved ? '✓ Approved' :
                       isStPending ? '• Menunggu Review' :
                       status === 'REVISION_REQUESTED' ? '✕ Perlu Revisi' : 'Draft'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Review Box */}
      <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        {activeStudent ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600" />
                  <span>Review GenCom: {activeStudent.name}</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Kelas {selectedClass?.name || ''} — Status:{' '}
                  <strong className="text-slate-800">
                    {isApproved ? 'Approved' : isPendingReview ? 'Menunggu Review' : currentStatus === 'REVISION_REQUESTED' ? 'Perlu Revisi' : 'Draft'}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isApproved ? (
                  <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs">
                    <CheckCircle2 size={14} className="text-emerald-600" /> Approved
                  </span>
                ) : isPendingReview ? (
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs">
                    <Clock size={14} className="text-blue-600" /> Menunggu Review
                  </span>
                ) : currentStatus === 'REVISION_REQUESTED' ? (
                  <span className="px-3 py-1.5 bg-amber-100 text-amber-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs">
                    <AlertCircle size={14} className="text-amber-600" /> Perlu Revisi
                  </span>
                ) : (
                  <span className="px-3 py-1.5 bg-slate-100 text-slate-700 font-extrabold text-xs rounded-xl flex items-center gap-1.5">
                    Draft
                  </span>
                )}
              </div>
            </div>

            {/* Approver Details Banner if APPROVED */}
            {isApproved && (
              <div className="p-4 bg-emerald-50 text-emerald-900 rounded-2xl border border-emerald-200 flex items-start gap-3 shadow-2xs">
                <UserCheck className="text-emerald-700 shrink-0 mt-0.5" size={18} />
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-950">
                    Approved by: {resolvedApprovedByName}
                  </h4>
                  <p className="text-[11px] font-bold text-emerald-800">
                    Waktu Approval: {formattedApprovedTime}
                  </p>
                  <p className="text-[10px] text-emerald-700 font-medium pt-1">
                    Komentar telah disetujui secara resmi dan siap diterbitkan ke dalam laporan PDF.
                  </p>
                </div>
              </div>
            )}

            {/* Display General Comment */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Isi General Comments Siswa:
              </label>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs leading-relaxed font-medium text-slate-800 min-h-[140px] whitespace-pre-wrap">
                {commentText || <span className="text-slate-400 italic">Belum ada komentar tertulis.</span>}
              </div>
            </div>

            {/* Revision Feedback Box if needed */}
            {currentStatus === 'REVISION_REQUESTED' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs space-y-1">
                <span className="font-extrabold text-red-700 uppercase tracking-wider block">Catatan Revisi Sebelumnya:</span>
                <p className="text-red-900 font-medium">{currentStudentData?.revisionFeedback || '-'}</p>
                {currentStudentData?.revisionRequestedByName && (
                  <p className="text-[10px] text-red-600 font-bold mt-1">
                    Oleh: {currentStudentData.revisionRequestedByName} {currentStudentData?.revisionRequestedAt ? `(${formatIndonesianDateTime(currentStudentData.revisionRequestedAt)})` : ''}
                  </p>
                )}
              </div>
            )}

            {/* Role restriction banner for non-approvers */}
            {!canApproveOrRevise && (
              <div className="p-3.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl text-xs font-bold flex items-center gap-2.5">
                <Lock size={16} className="text-amber-600 shrink-0" />
                <span>
                  Hanya Kepala Unit Elementary dan Super Admin yang berhak menyetujui (Approve) atau meminta revisi General Comments. Guru Kelas hanya dapat memantau status persetujuan secara read-only.
                </span>
              </div>
            )}

            {/* Reviewer Action Buttons */}
            {canApproveOrRevise && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Catatan Feedback (Wajib untuk Minta Revisi, Opsional untuk Catatan):
                  </label>
                  <input
                    type="text"
                    value={revisionFeedback}
                    onChange={(e) => setRevisionFeedback(e.target.value)}
                    placeholder="Berikan arahan atau bagian yang perlu diperbaiki oleh Guru Kelas..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    onClick={() => handleAction('REQUEST_REVISION')}
                    disabled={isProcessing}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <X size={14} />
                    <span>Minta Revisi</span>
                  </button>

                  <button
                    onClick={() => handleAction('APPROVE')}
                    disabled={isProcessing || isApproved}
                    className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-sm disabled:opacity-50"
                  >
                    {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>{isApproved ? 'Sudah Approved' : 'Approve Comment'}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center text-slate-400 font-medium text-xs">
            Pilih siswa pada daftar di samping untuk melakukan review dan approval.
          </div>
        )}
      </div>
    </div>
  );
};
