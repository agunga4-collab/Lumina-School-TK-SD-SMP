import * as React from 'react';
import { useState } from 'react';
import { 
  FileDown, 
  Plus, 
  FileText, 
  Download, 
  Eye, 
  Clock, 
  History,
  CheckCircle2,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../lib/utils';
import { 
  MTSSAcademicCase, 
  MTSSAcademicDocumentRecord,
  MTSSAcademicMeeting,
  MTSSAcademicEvaluation,
  MTSSAcademicDocumentType
} from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { saveMTSSAcademicDocumentRecord } from '../../../services/mtssAcademicDocumentService';
import { 
  generateInitialMeetingPdf, 
  generateParentCommitmentPdf, 
  generateEvaluationReportPdf,
  generateFollowUpMeetingPdf,
  generateTier3TransitionPdf 
} from '../../../services/mtssAcademicPdfService';
import { toast } from 'sonner';

interface CaseDocumentsProps {
  mtssCase: MTSSAcademicCase;
  documentRecords: MTSSAcademicDocumentRecord[];
  initialMeeting?: MTSSAcademicMeeting;
  latestEvaluation?: MTSSAcademicEvaluation;
  onUpdate: () => void;
}

export default function CaseDocuments({ 
  mtssCase, 
  documentRecords, 
  initialMeeting,
  latestEvaluation,
  onUpdate 
}: CaseDocumentsProps) {
  const { profile } = useAuth();
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerate = async (type: MTSSAcademicDocumentType, relatedId?: string) => {
    setGenerating(type);
    try {
      let pdf;
      let fileName = '';
      
      switch (type) {
        case 'INITIAL_MEETING_PDF':
          if (!initialMeeting) throw new Error('Initial Meeting data missing');
          pdf = await generateInitialMeetingPdf(mtssCase.id, initialMeeting.id);
          fileName = `Initial_Meeting_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
          break;
        case 'PARENT_COMMITMENT_PDF':
          pdf = await generateParentCommitmentPdf(mtssCase.id);
          fileName = `Parent_Commitment_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
          break;
        case 'EVALUATION_REPORT_PDF':
          if (!latestEvaluation) throw new Error('No evaluation found');
          pdf = await generateEvaluationReportPdf(mtssCase.id, latestEvaluation.id);
          fileName = `Evaluation_Report_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
          break;
        case 'FOLLOW_UP_MEETING_PDF':
          if (!relatedId) throw new Error('Meeting ID missing');
          pdf = await generateFollowUpMeetingPdf(mtssCase.id, relatedId);
          fileName = `FollowUp_Meeting_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
          break;
        case 'TIER_3_TRANSITION_PDF':
          pdf = await generateTier3TransitionPdf(mtssCase.id);
          fileName = `Tier3_Transition_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
          break;
      }

      if (pdf) {
        // Save record to Firestore (metadata only, we don't store the actual PDF in this simple version, just trigger download)
        await saveMTSSAcademicDocumentRecord({
          caseId: mtssCase.id,
          studentId: mtssCase.studentId,
          type,
          fileName,
          generatedAt: Date.now(),
          generatedBy: profile?.uid || 'system',
          relatedMeetingId: type === 'INITIAL_MEETING_PDF' || type === 'FOLLOW_UP_MEETING_PDF' ? (relatedId || initialMeeting?.id) : null,
          relatedEvaluationId: type === 'EVALUATION_REPORT_PDF' ? latestEvaluation?.id : null
        });

        pdf.save(fileName);
        toast.success(`${type.replace(/_/g, ' ')} generated successfully`);
        onUpdate();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to generate document');
    } finally {
      setGenerating(null);
    }
  };

  const actionCards = [
    {
      id: 'INITIAL_MEETING_PDF',
      title: 'Initial Meeting Notes',
      description: 'Official notes from the core team initial meeting.',
      type: 'INITIAL_MEETING_PDF' as MTSSAcademicDocumentType,
      ready: !!initialMeeting,
      missing: !initialMeeting ? 'Requires Initial Meeting data' : null
    },
    {
      id: 'PARENT_COMMITMENT_PDF',
      title: 'Parent Commitment Letter',
      description: 'Formal agreement and support statement for parents.',
      type: 'PARENT_COMMITMENT_PDF' as MTSSAcademicDocumentType,
      ready: true
    },
    {
      id: 'EVALUATION_REPORT_PDF',
      title: 'Tier 2 Evaluation Report',
      description: 'Comprehensive report of student progress and tier decision.',
      type: 'EVALUATION_REPORT_PDF' as MTSSAcademicDocumentType,
      ready: !!latestEvaluation,
      missing: !latestEvaluation ? 'Requires an Evaluation record' : null
    },
    {
      id: 'TIER_3_TRANSITION_PDF',
      title: 'Tier 3 Transition Summary',
      description: 'Handoff document for escalation or continued intensive support.',
      type: 'TIER_3_TRANSITION_PDF' as MTSSAcademicDocumentType,
      ready: mtssCase.currentTier === 'Tier 2' && (latestEvaluation?.recommendedTier === 'Tier 3' || mtssCase.status === 'ESCALATED'),
      missing: 'Only for Tier 3 escalation candidates'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Quick Actions */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shadow-lg shadow-indigo-100">
            <Plus size={20} />
          </div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Generate New Documents</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {actionCards.map(action => (
            <div 
              key={action.id}
              className={`p-5 rounded-[24px] border-2 transition-all flex flex-col h-full bg-white ${
                action.ready 
                  ? 'border-slate-100 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 group' 
                  : 'border-slate-50 opacity-60 grayscale cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${
                  action.ready ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
                }`}>
                  <FileText size={20} />
                </div>
                {action.ready ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <AlertCircle size={16} className="text-slate-400" />
                )}
              </div>
              
              <h3 className="text-sm font-black text-slate-900 mb-1">{action.title}</h3>
              <p className="text-[10px] font-medium text-slate-500 leading-relaxed mb-6">
                {action.ready ? action.description : action.missing}
              </p>

              <button
                disabled={!action.ready || !!generating}
                onClick={() => handleGenerate(action.type)}
                className={`mt-auto w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  action.ready && !generating
                    ? 'bg-slate-900 text-white hover:bg-indigo-600 shadow-md shadow-slate-100'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {generating === action.type ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Generate PDF
                    <Plus size={14} />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Snapshot v2 Backup */}
      <section className="bg-indigo-50 border-2 border-indigo-100 rounded-[32px] p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100 italic">
              <History size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Operational Snapshots (v2)</h2>
              <p className="text-xs font-medium text-slate-500 mt-1 max-w-xl leading-relaxed">
                Independent structured JSON snapshot for operational recovery. 
                Stored directly in the Shared Drive folder for technical redundancy.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
             <div className="px-5 py-3 bg-white rounded-2xl border border-indigo-100 flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Latest Sync Status</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      mtssCase.snapshotSyncStatus === 'SYNCED' && !mtssCase.snapshotNeedsRefresh ? "bg-emerald-500" :
                      mtssCase.snapshotSyncStatus === 'FAILED' ? "bg-rose-500" : "bg-amber-500 animate-pulse"
                    )} />
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      {mtssCase.snapshotSyncStatus === 'PENDING' || mtssCase.snapshotNeedsRefresh ? 'NEEDS_REFRESH' : (mtssCase.snapshotSyncStatus || 'NOT_STARTED')}
                      {mtssCase.snapshotNeedsRefresh && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] rounded border border-amber-200">OUTDATED</span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="w-px h-8 bg-indigo-50" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Version</span>
                  <span className="text-xs font-black text-slate-700">
                    v{mtssCase.latestSnapshotVersion || 0}
                  </span>
                </div>
             </div>

             <button
               onClick={async () => {
                 const { mtssAcademicDriveService } = await import('../../../services/mtssAcademicDriveService');
                 toast.promise(mtssAcademicDriveService.syncSnapshot(mtssCase.id), {
                   loading: 'Syncing snapshot...',
                   success: () => { onUpdate(); return 'Snapshot synced'; },
                   error: 'Sync failed'
                 });
               }}
               className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
             >
               <History size={16} />
               Manual Snapshot Sync
             </button>
          </div>
        </div>

        {mtssCase.latestSnapshotError && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-700">
            <AlertCircle size={16} />
            <p className="text-[10px] font-bold uppercase tracking-widest">{mtssCase.latestSnapshotError}</p>
          </div>
        )}
      </section>

      {/* Document History */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-slate-100 text-slate-700 rounded-xl shadow-lg shadow-slate-100">
            <History size={20} />
          </div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Generation History</h2>
        </div>

        {documentRecords.length === 0 ? (
          <div className="bg-white p-12 rounded-[32px] border-2 border-dashed border-slate-100 text-center flex flex-col items-center">
            <div className="p-4 bg-slate-50 rounded-2xl mb-4">
              <FileDown size={32} className="text-slate-300" />
            </div>
            <p className="text-slate-500 font-bold">No documents generated yet for this case.</p>
            <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-widest">Select an action above to start automation</p>
          </div>
        ) : (
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Document Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Generated</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Version</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {documentRecords.map(record => (
                  <tr key={record.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <FileText size={16} />
                        </div>
                        <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{record.fileName}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {record.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                        <Clock size={12} className="text-slate-400" />
                        {format(record.generatedAt, 'MMM d, yyyy HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-black tracking-widest uppercase">
                        v{record.version}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                        record.status === 'GENERATED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleGenerate(record.type, record.relatedMeetingId || undefined)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Regenerate / Download"
                      >
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Guidance */}
      <div className="bg-amber-50 border border-amber-100 p-6 rounded-[32px] flex items-start gap-4">
         <div className="p-2.5 bg-amber-100 text-amber-600 rounded-2xl">
            <AlertCircle size={20} />
         </div>
         <div>
            <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight mb-1">Automation Guidelines</h4>
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-700/80 leading-relaxed">
                • Documents are pre-filled using current system records to ensure consistency.
              </p>
              <p className="text-xs font-medium text-amber-700/80 leading-relaxed">
                • Generating a new version will automatically archive the previous one to maintain audit trail.
              </p>
              <p className="text-xs font-medium text-amber-700/80 leading-relaxed text-balance">
                • Please verify the generated content before printing or sharing with external parties. Signatures must be collected physically or via official digital channels.
              </p>
            </div>
         </div>
      </div>
    </div>
  );
}
