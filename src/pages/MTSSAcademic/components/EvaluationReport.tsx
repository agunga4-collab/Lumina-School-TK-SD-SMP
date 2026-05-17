import * as React from 'react';
import { 
  MTSSAcademicCase, 
  MTSSAcademicEvaluation 
} from '../../../types';
import { 
  FileText, 
  Plus, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Award,
  ArrowUpRight,
  ChevronRight,
  Download,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { generateEvaluationReportPdf } from '../../../services/mtssAcademicPdfService';
import { saveMTSSAcademicDocumentRecord } from '../../../services/mtssAcademicDocumentService';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'sonner';

interface Props {
  mtssCase: MTSSAcademicCase;
  evaluations: MTSSAcademicEvaluation[];
  onUpdate: () => void;
}

export default function EvaluationReport({ mtssCase, evaluations, onUpdate }: Props) {
  const { profile } = useAuth();
  const [generating, setGenerating] = React.useState<string | null>(null);

  const handleGeneratePdf = async (evaluation: MTSSAcademicEvaluation) => {
    setGenerating(evaluation.id);
    try {
      const pdf = await generateEvaluationReportPdf(mtssCase.id, evaluation.id);
      const fileName = `Evaluation_Report_${mtssCase.studentName}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      
      await saveMTSSAcademicDocumentRecord({
        caseId: mtssCase.id,
        studentId: mtssCase.studentId,
        type: 'EVALUATION_REPORT_PDF',
        fileName,
        generatedAt: Date.now(),
        generatedBy: profile?.uid || 'system',
        relatedEvaluationId: evaluation.id
      });

      pdf.save(fileName);
      toast.success('Evaluation report generated');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate PDF');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <FileText className="text-indigo-600" size={24} />
            Evaluations & Reports
          </h3>
          <p className="text-sm text-slate-500 font-medium">Final reports for Tier cycles and program reviews</p>
        </div>
        <button 
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <Plus size={18} />
          Create Tier Report
        </button>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {evaluations.length === 0 ? (
            <div className="md:col-span-2 py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
              <Award size={48} className="opacity-20 mb-4" />
              <p className="font-bold">No evaluation reports filed yet</p>
              <p className="text-xs">Reports are typically generated at the end of a 6-12 week intervention cycle</p>
            </div>
          ) : (
            evaluations.map(evaluation => (
              <div key={evaluation.id}>
                <EvaluationCard 
                  evaluation={evaluation} 
                  onGeneratePdf={() => handleGeneratePdf(evaluation)}
                  isGenerating={generating === evaluation.id}
                />
              </div>
            ))
          )}
        </div>

      {/* Decision History Context */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Decision History</h4>
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">Current Support Tier: {mtssCase.currentTier}</p>
              <p className="text-xs text-slate-500 mt-1">
                The student is currently in {mtssCase.currentTier} for {mtssCase.subjectDomains.join(' & ')}.
                Latest evaluation status: <span className="font-bold text-indigo-600">{mtssCase.latestDecision || 'In Progress'}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvaluationCard({ 
  evaluation, 
  onGeneratePdf, 
  isGenerating 
}: { 
  evaluation: MTSSAcademicEvaluation; 
  onGeneratePdf: () => void;
  isGenerating: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <motion.div 
      layout
      className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden hover:border-indigo-300 transition-all"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Award size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[9px] font-black uppercase tracking-widest">
                  {evaluation.evaluationType.replace('_', ' ')}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  {format(evaluation.date, 'dd MMM yyyy')}
                </span>
              </div>
              <h4 className="font-black text-slate-900 mt-0.5">Program Performance Report</h4>
            </div>
          </div>
          <button 
            disabled={isGenerating}
            onClick={(e) => {
              e.stopPropagation();
              onGeneratePdf();
            }}
            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
            title="Download PDF Report"
          >
            {isGenerating ? (
              <div className="w-5 h-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
            ) : (
              <FileDown size={20} />
            )}
          </button>
        </div>

        <div className="space-y-4">
          {evaluation.domainSummaries.map((summary, idx) => (
            <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{summary.domain}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                  summary.result === 'ACHIEVED' ? 'bg-emerald-100 text-emerald-700' : 
                  summary.result === 'PARTIAL' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {summary.result}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {summary.progressComment}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recommended Action</span>
            <span className="text-sm font-black text-indigo-600">{evaluation.strategyDecision}</span>
          </div>
          <button 
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600"
          >
            Details <ChevronRight size={14} className={expanded ? 'rotate-90' : ''} />
          </button>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-6 mt-6 border-t border-slate-50">
                 <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Additional Comments</h5>
                 <p className="text-sm text-slate-600 leading-relaxed">
                   {evaluation.additionalComments}
                 </p>
                 <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white border border-indigo-200 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={16} className="text-indigo-600" />
                      </div>
                      <span className="text-xs font-bold text-indigo-700">Signed by Lead Teacher</span>
                    </div>
                    <ArrowUpRight size={16} className="text-indigo-400" />
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
