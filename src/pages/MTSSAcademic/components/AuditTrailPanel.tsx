import * as React from 'react';
import { 
  ShieldCheck, 
  User, 
  Clock, 
  ArrowRight,
  Database,
  Search,
  ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { MTSSAcademicAuditRecord } from '../../../types';

interface Props {
  auditLogs: MTSSAcademicAuditRecord[];
}

export default function AuditTrailPanel({ auditLogs }: Props) {
  const [search, setSearch] = React.useState('');
  
  const filtered = auditLogs.filter(log => 
    log.action.toLowerCase().includes(search.toLowerCase()) ||
    log.performedBy.toLowerCase().includes(search.toLowerCase()) ||
    log.entityType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <ShieldCheck className="text-indigo-600" size={24} />
            Case Audit Trail
          </h3>
          <p className="text-sm text-slate-500 font-medium">Immutable history of actions performed on this case</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Search audit actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 w-full md:w-64"
          />
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User & Role</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entity</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Database className="mx-auto text-slate-200 mb-4" size={48} />
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No audit records found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  // @ts-ignore
                  <AuditLogRow key={log.id} log={log} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditLogRow({ log }: { log: MTSSAcademicAuditRecord }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <>
      <tr className="hover:bg-slate-50/50 transition-colors group">
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-300" />
            <span className="text-xs font-bold text-slate-600">{format(log.timestamp, 'dd/MM/yy HH:mm')}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
              <User size={16} />
            </div>
            <div>
              <p className="text-xs font-black text-slate-900 leading-none mb-1">{log.performedBy}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{log.performedByRole}</p>
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
            log.action.includes('CREATED') ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
            log.action.includes('UPDATED') ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
            log.action.includes('RESOLVED') ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-600'
          }`}>
            {log.action.replace('_', ' ')}
          </span>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.entityType}</span>
            <ArrowRight size={10} className="text-slate-300" />
            <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[120px]">
              {log.entityId}
            </span>
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          >
            <ChevronDown size={18} className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-6 pb-6 pt-2 bg-slate-50/30">
            <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-inner grid grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Before Action</p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 overflow-x-auto">
                  <pre className="text-[10px] font-mono text-slate-500">
                    {log.beforeSnapshot ? JSON.stringify(log.beforeSnapshot, null, 2) : 'No state change recorded'}
                  </pre>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">After Action</p>
                <div className="bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/30 overflow-x-auto">
                  <pre className="text-[10px] font-mono text-indigo-900/70">
                    {log.afterSnapshot ? JSON.stringify(log.afterSnapshot, null, 2) : 'No state captured'}
                  </pre>
                </div>
              </div>
              {log.note && (
                <div className="col-span-2 pt-4 border-t border-slate-50">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Internal Note / Reason</p>
                   <p className="text-xs font-bold text-slate-700">{log.note}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
