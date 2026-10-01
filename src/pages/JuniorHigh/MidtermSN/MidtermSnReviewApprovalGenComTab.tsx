import * as React from 'react';
import {
  FileCheck2, CheckCircle2, Clock, AlertTriangle, Send,
  MessageSquare, User, History, Loader2, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { saveSnMidtermReport } from '../../../services/juniorHighSnMidtermService';
import type { SnMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Student, Class, User as AppUser } from '../../../types';

interface MidtermSnReviewApprovalGenComTabProps {
  currentUser: AppUser;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: SnMidtermReportDoc;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermSnReviewApprovalGenComTab: React.FC<MidtermSnReviewApprovalGenComTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  onRefreshData,
  loading
}) => {
  const [feedback, setFeedback] = React.useState<string>('');
  const [processing, setProcessing] = React.useState<boolean>(false);

  const reviewStatus = reportDoc.reviewStatus || 'DRAFT';
  const historyList = reportDoc.reviewHistory || [];
  const finalComment = reportDoc.generalComment?.finalComment || '';

  const isHeadOrAdmin = [
    'SUPER_ADMIN',
    'HEAD_UNIT',
    'HEAD_JUNIOR',
    'PRINCIPAL',
    'VICE_PRINCIPAL',
    'ADMIN'
  ].includes((currentUser.role || '').toUpperCase());

  const handleUpdateStatus = async (
    newStatus: string,
    actionLabel: string,
    historyAction: string
  ) => {
    setProcessing(true);
    try {
      const newEntry = {
        action: historyAction,
        actorId: currentUser.uid,
        actorName: currentUser.displayName || currentUser.email || 'Pengguna',
        actorRole: currentUser.role || 'GURU',
        timestamp: Date.now(),
        feedback: feedback.trim() || undefined,
        commentSnapshot: finalComment
      };

      const updatedHistory = [newEntry, ...historyList];

      await saveSnMidtermReport(
        {
          ...reportDoc,
          reviewStatus: newStatus,
          generalComment: {
            ...reportDoc.generalComment,
            status: newStatus === 'APPROVED' ? 'APPROVED' : 'DRAFT'
          },
          reviewHistory: updatedHistory
        },
        currentUser
      );

      setFeedback('');
      toast.success(`Status review berhasil diperbarui menjadi: ${actionLabel}`);
    } catch (err: any) {
      toast.error('Gagal mengupdate status review: ' + (err.message || 'Error'));
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-full border border-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-600" /> DISETUJUI (APPROVED)
          </span>
        );
      case 'SUBMITTED_FOR_REVIEW':
        return (
          <span className="px-3 py-1 bg-blue-100 text-blue-800 font-extrabold text-xs rounded-full border border-blue-200 flex items-center gap-1.5">
            <Clock size={14} className="text-blue-600" /> MENUNGGU REVIEW
          </span>
        );
      case 'REVISION_REQUESTED':
        return (
          <span className="px-3 py-1 bg-amber-100 text-amber-800 font-extrabold text-xs rounded-full border border-amber-200 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-amber-600" /> PERLU REVISI
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-slate-100 text-slate-700 font-extrabold text-xs rounded-full border border-slate-200 flex items-center gap-1.5">
            <Clock size={14} className="text-slate-500" /> DRAF
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck2 size={20} className="text-purple-300" />
            <h2 className="text-base font-black tracking-tight">
              Review & Approval GenCom: <span className="text-amber-300">{selectedStudent.name}</span>
            </h2>
          </div>
          <p className="text-xs text-purple-200">
            Alur pengajuan dan persetujuan komentar umum siswa SN oleh Kepala Unit / Admin.
          </p>
        </div>

        <div>{getStatusBadge(reviewStatus)}</div>
      </div>

      {/* Comment Content Preview */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <MessageSquare size={16} className="text-purple-600" />
          Komentar Umum Saat Ini
        </h3>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-800 leading-relaxed min-h-[80px]">
          {finalComment ? (
            finalComment
          ) : (
            <span className="text-slate-400 italic">Belum ada komentar ditulis.</span>
          )}
        </div>
      </div>

      {/* Review Actions Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <ShieldCheck size={16} className="text-purple-600" />
          Aksi Review & Persetujuan
        </h3>

        {/* Feedback Input */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
            Catatan Feedback Reviewer (Opsional)
          </label>
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tuliskan masukan atau alasan revisi..."
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          {/* Guru: Submit for review */}
          <button
            onClick={() =>
              handleUpdateStatus(
                'SUBMITTED_FOR_REVIEW',
                'Diajukan Review',
                'SUBMITTED_FOR_REVIEW'
              )
            }
            disabled={processing || !finalComment}
            className="px-5 py-2.5 bg-purple-900 hover:bg-purple-800 text-white text-xs font-bold rounded-2xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            <span>Ajukan Review ke Kepala Unit</span>
          </button>

          {/* Head / Admin: Approve or Request Revision */}
          {isHeadOrAdmin && (
            <>
              <button
                onClick={() =>
                  handleUpdateStatus('APPROVED', 'Disetujui', 'APPROVED')
                }
                disabled={processing || !finalComment}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={15} />}
                <span>Setujui (Approve)</span>
              </button>

              <button
                onClick={() =>
                  handleUpdateStatus(
                    'REVISION_REQUESTED',
                    'Minta Revisi',
                    'REVISION_REQUESTED'
                  )
                }
                disabled={processing}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-2xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={15} />}
                <span>Minta Revisi</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* History Log */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <History size={16} className="text-purple-600" />
          Riwayat Review ({historyList.length})
        </h3>

        {historyList.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Belum ada riwayat aktivitas review.</p>
        ) : (
          <div className="space-y-3">
            {historyList.map((entry, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {entry.actorName} ({entry.actorRole})
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {new Date(entry.timestamp).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-purple-900">
                  Aksi: {entry.action}
                </div>
                {entry.feedback && (
                  <p className="text-[11px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200 mt-1">
                    Catatan: &ldquo;{entry.feedback}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
