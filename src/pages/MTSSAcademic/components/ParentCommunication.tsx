import * as React from 'react';
import { 
  MTSSAcademicCase, 
  MTSSAcademicParentDocument 
} from '../../../types';
import { 
  HeartHandshake, 
  Plus, 
  Mail, 
  FileCheck, 
  Clock, 
  ChevronRight,
  ExternalLink,
  MessageCircle,
  ShieldCheck,
  Send,
  AlertCircle,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { generateParentCommitmentPdf } from '../../../services/mtssAcademicPdfService';
import { saveMTSSAcademicDocumentRecord } from '../../../services/mtssAcademicDocumentService';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'sonner';

interface Props {
  mtssCase: MTSSAcademicCase;
  documents: MTSSAcademicParentDocument[];
  onUpdate: () => void;
}

export default function ParentCommunication({ mtssCase, documents, onUpdate }: Props) {
  const { profile } = useAuth();
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerateCommitment = async () => {
    setIsGenerating(true);
    try {
      const pdf = await generateParentCommitmentPdf(mtssCase.id);
      const fileName = `Parent_Commitment_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;

      await saveMTSSAcademicDocumentRecord({
        caseId: mtssCase.id,
        studentId: mtssCase.studentId,
        type: 'PARENT_COMMITMENT_PDF',
        fileName,
        generatedAt: Date.now(),
        generatedBy: profile?.uid || 'system',
      });

      pdf.save(fileName);
      toast.success('Commitment letter generated');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <HeartHandshake className="text-rose-600" size={24} />
            Parent Hub
          </h3>
          <p className="text-sm text-slate-500 font-medium">Manage program consent, commitment letters, and family outreach</p>
        </div>
        <div className="flex items-center gap-3">
           <button 
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <MessageCircle size={18} />
            Call Log
          </button>
          <button 
            onClick={handleGenerateCommitment}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 disabled:opacity-50"
          >
            {isGenerating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus size={18} />
            )}
            Generate Letter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {documents.length === 0 ? (
            <div className="py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
              <Mail size={48} className="opacity-20 mb-4" />
              <p className="font-bold">No documents sent yet</p>
              <p className="text-xs">Send an initial support notification or commitment letter to begin</p>
            </div>
          ) : (
            documents.map(doc => (
              <div key={doc.id}>
                <DocumentCard doc={doc} />
              </div>
            ))
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 text-rose-50 opacity-20 -rotate-12 translate-x-4">
                <ShieldCheck size={80} />
             </div>
             <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Family Partnership</h4>
             <div className="space-y-4">
                <StatusItem 
                  label="Initial Meeting" 
                  status={mtssCase.parentMeetingStatus === 'COMPLETED' ? 'success' : 'pending'} 
                  text={mtssCase.parentMeetingStatus.replace('_', ' ')}
                />
                <StatusItem 
                  label="Support Consent" 
                  status={mtssCase.parentCommitmentStatus === 'SIGNED' ? 'success' : 'pending'} 
                  text={mtssCase.parentCommitmentStatus.replace('_', ' ')}
                />
             </div>
             <div className="mt-6 p-4 bg-rose-50 rounded-2xl border border-rose-100 italic text-[11px] text-rose-700 leading-relaxed">
                "Family engagement is the cornerstone of academic resilience. We don't just inform parents; we invite them into the support process."
             </div>
          </div>

          <button className="w-full p-4 bg-white border border-slate-200 rounded-3xl flex items-center justify-between hover:bg-slate-50 transition-all group">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                   <Mail size={20} />
                </div>
                <div className="text-left">
                   <p className="text-sm font-black text-slate-800">Support Invitation</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase">Standard Template</p>
                </div>
             </div>
             <ChevronRight size={18} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentCard({ doc }: { doc: MTSSAcademicParentDocument }) {
  const statusConfig = {
    DRAFT: { icon: Clock, color: 'text-slate-400 bg-slate-100', label: 'Draft' },
    SENT: { icon: Send, color: 'text-blue-500 bg-blue-50', label: 'Sent to Parent' },
    SIGNED: { icon: FileCheck, color: 'text-emerald-500 bg-emerald-50', label: 'Acknowledged' },
    ARCHIVED: { icon: AlertCircle, color: 'text-slate-400 bg-slate-50', label: 'Archived' }
  };

  const { icon: Icon, color, label } = statusConfig[doc.status];

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-all">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
          <Icon size={24} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight text-sm">
              {doc.type.replace('_', ' ')}
            </h4>
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${color}`}>
               {label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {doc.sentAt ? `Emailed ${format(doc.sentAt, 'dd MMM yyyy')}` : 'Not yet sent'}
            {doc.acknowledgedAt && <span className="text-emerald-600 font-black flex items-center gap-1">• Signed {format(doc.acknowledgedAt, 'dd MMM')}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
         {doc.fileUrl && (
            <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
               <ExternalLink size={18} />
            </button>
         )}
         <button className="p-2 text-slate-300 hover:text-slate-500 rounded-xl">
            <MoreVertical size={18} />
         </button>
      </div>
    </div>
  );
}

function StatusItem({ label, status, text }: { label: string; status: 'success' | 'pending'; text: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${status === 'success' ? 'text-emerald-600' : 'text-amber-500'}`}>
          {text}
        </span>
        <div className={`w-2 h-2 rounded-full ${status === 'success' ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
      </div>
    </div>
  );
}
