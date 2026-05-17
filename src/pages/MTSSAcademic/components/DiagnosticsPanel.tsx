import * as React from 'react';
import { 
  ShieldAlert, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  RefreshCw,
  Search,
  ZapOff
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { format } from 'date-fns';
import { runAcademicIntegrityChecks, logOperationalMetric } from '../../../services/mtssAcademicIntegrityService';

export default function DiagnosticsPanel() {
  const [loading, setLoading] = React.useState(false);
  const [stats, setStats] = React.useState<any>(null);
  const [issues, setIssues] = React.useState<any[]>([]);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const casesSnap = await getDocs(collection(db, 'juniorhigh_mtss_academic_cases'));
      const academicCases = casesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const foundIssues: any[] = [];
      
      // 1. Check for Active Cases without Goals
      for (const c of academicCases.filter(c => c.status === 'ACTIVE')) {
         const goalsSnap = await getDocs(collection(db, 'juniorhigh_mtss_academic_cases', c.id, 'goals'));
         if (goalsSnap.empty) {
           foundIssues.push({
             type: 'MISSING_GOALS',
             severity: 'HIGH',
             description: `Active Case #${c.id} for "${c.studentName}" has no goals defined.`,
             caseId: c.id
           });
         }
      }

      // 2. Check for Tier 2+ without sessions
      for (const c of academicCases.filter(c => ['Tier 2', 'Tier 3'].includes(c.currentTier) && c.status === 'ACTIVE')) {
        const sessionsSnap = await getDocs(collection(db, 'juniorhigh_mtss_academic_cases', c.id, 'sessions'));
        if (sessionsSnap.empty) {
          foundIssues.push({
            type: 'NO_SESSIONS',
            severity: 'MEDIUM',
            description: `${c.currentTier} case for "${c.studentName}" has 0 sessions logged.`,
            caseId: c.id
          });
        }
      }

      // 3. Stale Drafts
      const draftsSnap = await getDocs(collection(db, 'mtss_academic_drafts'));
      const oldDrafts = draftsSnap.docs.filter(d => (Date.now() - d.data().lastSavedAt) > 14 * 24 * 60 * 60 * 1000);
      if (oldDrafts.length > 0) {
        foundIssues.push({
          type: 'STALE_DRAFTS',
          severity: 'LOW',
          description: `There are ${oldDrafts.length} drafts older than 14 days pending cleanup.`
        });
      }

      setStats({
        totalCases: academicCases.length,
        activeCases: academicCases.filter(c => c.status === 'ACTIVE').length,
        closedCases: academicCases.filter(c => c.status === 'CLOSED').length,
        drafts: draftsSnap.size
      });
      setIssues(foundIssues);

      logOperationalMetric('DIAGNOSTICS_RUN', {
        issuesCount: foundIssues.length,
        caseCount: academicCases.length
      });

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase">Operational Diagnostics</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Health & Integrity Monitoring</p>
        </div>
        <button 
          onClick={runDiagnostics}
          disabled={loading}
          className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
        >
          {loading ? <RefreshCw className="animate-spin" size={14} /> : <ZapOff size={14} />}
          Run Health Check
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Cases', value: stats?.totalCases || 0, icon: Database, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Active Support', value: stats?.activeCases || 0, icon: Clock, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Closed/Archived', value: stats?.closedCases || 0, icon: CheckCircle2, color: 'bg-slate-50 text-slate-400' },
          { label: 'Unsaved Drafts', value: stats?.drafts || 0, icon: Trash2, color: 'bg-amber-50 text-amber-600' }
        ].map(card => (
          <div key={card.label} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <div className={`p-3 w-fit rounded-2xl mb-4 ${card.color}`}>
              <card.icon size={20} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
            <p className="text-2xl font-black text-slate-900 italic tracking-tighter">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-rose-500" size={18} />
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Detected Integrity Issues</h3>
          </div>
          <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest">
            {issues.length} Concerns found
          </span>
        </div>

        <div className="divide-y divide-slate-50">
          {issues.length > 0 ? (
            issues.map((issue, idx) => (
              <div key={idx} className="p-6 flex items-start justify-between hover:bg-slate-50/50 transition-colors">
                <div className="flex gap-4">
                  <div className={`p-2 rounded-lg mt-1 ${
                    issue.severity === 'HIGH' ? 'bg-rose-50 text-rose-600' :
                    issue.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'
                  }`}>
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                        issue.severity === 'HIGH' ? 'bg-rose-100 text-rose-700' :
                        issue.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {issue.severity}
                      </span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{issue.type}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{issue.description}</p>
                  </div>
                </div>
                {issue.caseId && (
                  <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                    <Search size={18} />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest italic tracking-tighter">System is Healthy</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">No major integrity issues detected at this time.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
