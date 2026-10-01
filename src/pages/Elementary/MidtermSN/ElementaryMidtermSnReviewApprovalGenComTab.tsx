import * as React from 'react';
import {
  FileCheck2, CheckCircle2, Clock, AlertTriangle, Send,
  MessageSquare, User, History, Loader2, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { saveElemSnMidtermReport } from '../../../services/elementarySnMidtermService';
import type { ElementarySnMidtermReportDoc } from '../../../types/elementaryMidtermSnReport';
import type { Student, Class, User as UserType } from '../../../types';

interface ElementaryMidtermSnReviewApprovalGenComTabProps {
  currentUser: UserType;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: ElementarySnMidtermReportDoc;
  onUpdateReportDoc: (updated: ElementarySnMidtermReportDoc) => void;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const ElementaryMidtermSnReviewApprovalGenComTab: React.FC<ElementaryMidtermSnReviewApprovalGenComTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  onUpdateReportDoc,
  onRefreshData,
  loading
}) => {
  const [feedback, setFeedback] = React.useState<string>('');
  const [processing, setProcessing] = React.useState<boolean>(false);

  const isPrincipalOrAdmin = React.useMemo(() => {
    const role = (currentUser?.role || (currentUser as any)?.roleId || '').toUpperCase();
    return ['SUPER_ADMIN', 'HEAD_UNIT', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ADMIN', 'COORDINATOR'].includes(role);
  }, [currentUser]);

  const currentStatus = reportDoc?.reviewStatus || 'DRAFT';
  const finalComment = reportDoc?.generalComment?.finalComment || '';

  const handleAction = async (action: 'SUBMIT' | 'APPROVE' | 'REVISE' | 'RESET') => {
    if (!reportDoc || !selectedStudent?.id || !selectedClass?.id || !currentUser?.uid) {
      toast.error('Data laporan tidak lengkap.');
      return;
    }

    if (action === 'SUBMIT' && !finalComment.trim()) {
      toast.error('Komentar akhir belum diisi. Lengkapi komentar sebelum mengajukan review.');
      return;
    }

    if (action === 'REVISE' && !feedback.trim()) {
      toast.error('Wajib mengisi catatan revisi.');
      return;
    }

    setProcessing(true);
    try {
      let newStatus = currentStatus;
      let historyAction = '';

      if (action === 'SUBMIT') {
        newStatus = 'SUBMITTED_FOR_REVIEW';
        historyAction = 'SUBMITTED_FOR_REVIEW';
      } else if (action === 'APPROVE') {
        newStatus = 'APPROVED';
        historyAction = 'APPROVED';
      } else if (action === 'REVISE') {
        newStatus = 'REVISION_REQUESTED';
        historyAction = 'REVISION_REQUESTED';
      } else if (action === 'RESET') {
        newStatus = 'DRAFT';
        historyAction = 'DRAFT_RESET';
      }

      const newHistoryEntry = {
        action: historyAction,
        actorId: currentUser.uid,
        actorName: currentUser.displayName || currentUser.name || 'User',
        actorRole: (currentUser.role || 'TEACHER').toUpperCase(),
        timestamp: Date.now(),
        feedback: feedback.trim() || undefined,
        commentSnapshot: finalComment
      };

      const updatedDoc: ElementarySnMidtermReportDoc = {
        ...reportDoc,
        reviewStatus: newStatus,
        reviewHistory: [newHistoryEntry, ...(reportDoc.reviewHistory || [])],
        generalComment: {
          ...reportDoc.generalComment,
          status: newStatus === 'APPROVED' ? 'APPROVED' : newStatus === 'SUBMITTED_FOR_REVIEW' ? 'SUBMITTED' : 'DRAFT',
          updatedAt: Date.now(),
          updatedBy: currentUser.uid
        },
        updatedAt: Date.now(),
        updatedBy: currentUser.uid
      };

      await saveElemSnMidtermReport(updatedDoc, currentUser);
      onUpdateReportDoc(updatedDoc);
      setFeedback('');

      if (action === 'SUBMIT') toast.success('General Comments berhasil diajukan untuk review!');
      if (action === 'APPROVE') toast.success('General Comments berhasil disetujui (APPROVED)!');
      if (action === 'REVISE') toast.success('Permintaan revisi berhasil dikirim ke guru.');
      if (action === 'RESET') toast.success('Status berhasil dikembalikan ke Draf.');
    } catch (err: any) {
      console.error('[ElementaryMidtermSnReviewApprovalGenComTab] action error:', err);
      toast.error('Gagal memproses aksi: ' + (err.message || 'Error'));
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = () => {
    switch (currentStatus) {
      case 'APPROVED':
        return (
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black flex items-center gap-1.5">
            <CheckCircle2 size={14} /> APPROVED
          </span>
        );
      case 'SUBMITTED_FOR_REVIEW':
        return (
          <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-xl text-xs font-black flex items-center gap-1.5">
            <Clock size={14} /> MENUNGGU REVIEW
          </span>
        );
      case 'REVISION_REQUESTED':
        return (
          <span className="px-3 py-1 bg-red-100 text-red-800 rounded-xl text-xs font-black flex items-center gap-1.5">
            <AlertTriangle size={14} /> PERLU REVISI
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-black flex items-center gap-1.5">
            <Clock size={14} /> DRAFT
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Review & Approval General Comments: <span className="text-amber-800">{selectedStudent.name}</span>
            </h2>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-slate-500">
            Alur verifikasi dan persetujuan komentar umum sebelum rapor SN dirilis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentStatus !== 'APPROVED' && (
            <button
              onClick={() => handleAction('SUBMIT')}
              disabled={processing || currentStatus === 'SUBMITTED_FOR_REVIEW'}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-2xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send size={14} />
              <span>{currentStatus === 'SUBMITTED_FOR_REVIEW' ? 'Sedang Diajukan' : 'Ajukan Review'}</span>
            </button>
          )}

          {isPrincipalOrAdmin && (
            <>
              {currentStatus !== 'APPROVED' && (
                <button
                  onClick={() => handleAction('APPROVE')}
                  disabled={processing}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-2xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  <span>Setujui (Approve)</span>
                </button>
              )}

              {currentStatus === 'APPROVED' && (
                <button
                  onClick={() => handleAction('RESET')}
                  disabled={processing}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Kembalikan ke Draf
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Comment Preview Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-amber-800" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
            Komentar yang Diajukan
          </h3>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 leading-relaxed min-h-[90px] whitespace-pre-wrap">
          {finalComment || <span className="text-slate-400 italic">Belum ada komentar yang ditulis pada tab General Comments.</span>}
        </div>
      </div>

      {/* Revision Box for Admin / Principal */}
      {isPrincipalOrAdmin && currentStatus !== 'APPROVED' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
            Catatan Revisi / Feedback (Untuk Guru)
          </h3>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tuliskan catatan revisi apabila komentar memerlukan perbaikan..."
            rows={3}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-500 outline-hidden resize-y"
          />
          <div className="flex justify-end">
            <button
              onClick={() => handleAction('REVISE')}
              disabled={processing || !feedback.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <AlertTriangle size={14} /> Minta Revisi
            </button>
          </div>
        </div>
      )}

      {/* History Timeline */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <History size={18} className="text-slate-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
            Riwayat Review & Aktivitas
          </h3>
        </div>

        {(!reportDoc?.reviewHistory || reportDoc.reviewHistory.length === 0) ? (
          <p className="text-xs text-slate-400 py-2">Belum ada riwayat aktivitas review.</p>
        ) : (
          <div className="space-y-3">
            {reportDoc.reviewHistory.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900">{item.actorName}</span>
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold">
                      {item.actorRole}
                    </span>
                    <span className="font-bold text-slate-600">
                      • {item.action}
                    </span>
                  </div>
                  {item.feedback && (
                    <p className="text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 mt-1">
                      Catatan: {item.feedback}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 font-medium shrink-0">
                  {new Date(item.timestamp).toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
