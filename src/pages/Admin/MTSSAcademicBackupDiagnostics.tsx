import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Filter,
  Eye,
  FileText,
  ExternalLink,
  ChevronRight,
  Database,
  History,
  Info
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MTSSAcademicCase, MTSSSyncStatus } from '../../types';
import { mtssAcademicRegisterService } from '../../services/mtssAcademicRegisterService';
import { mtssAcademicDriveService } from '../../services/mtssAcademicDriveService';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../../lib/utils';

export default function MTSSAcademicBackupDiagnostics() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<MTSSAcademicCase[]>([]);
  const [filter, setFilter] = useState<MTSSSyncStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'mtss_academic_cases'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MTSSAcademicCase[];
      
      // Client-side sort by updatedAt
      setCases(data.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      setLoading(false);
    }, (error) => {
      console.error("[MTSSAcademicBackupDiagnostics] Snapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredCases = cases.filter(c => {
    const matchesFilter = filter === 'ALL' || c.registerSyncStatus === filter;
    const matchesSearch = c.studentName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         c.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status?: MTSSSyncStatus) => {
    switch (status) {
      case 'SYNCED': return 'text-emerald-500 bg-emerald-50 border-emerald-100';
      case 'FAILED': return 'text-rose-500 bg-rose-50 border-rose-100';
      case 'PENDING': return 'text-amber-500 bg-amber-50 border-amber-100';
      default: return 'text-gray-400 bg-gray-50 border-gray-100';
    }
  };

  async function handleManualSync(mtssCase: MTSSAcademicCase) {
    setProcessingId(mtssCase.id);
    try {
      const result = await mtssAcademicRegisterService.syncCase(mtssCase, 'MANUAL_DIAGNOSTICS');
      if (!result.success) {
        alert(`Sync failed: ${result.error}`);
      }
      
      // Also trigger a snapshot sync
      await mtssAcademicDriveService.syncSnapshot(mtssCase.id);
    } catch (error) {
      alert('Network error during sync');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleSnapshotSync(caseId: string) {
    setProcessingId(`snapshot_${caseId}`);
    try {
      await mtssAcademicDriveService.syncSnapshot(caseId);
    } catch (error) {
      alert('Snapshot sync failed');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleBulkRetry() {
    const failedCases = cases.filter(c => c.registerSyncStatus === 'FAILED' || c.snapshotSyncStatus === 'FAILED');
    if (failedCases.length === 0) return;
    
    if (confirm(`Retry sync for ${failedCases.length} cases with failures? (Both Register and Snapshot)`)) {
      setSyncingAll(true);
      for (const c of failedCases) {
        await handleManualSync(c);
      }
      setSyncingAll(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Banner */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-rose-50 text-rose-600 rounded-3xl shadow-sm shadow-rose-50">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Backup Diagnostics</h1>
            <p className="text-gray-500 font-medium text-sm">Monitoring & Repairing MTSS Academic v1 Syncs</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleBulkRetry}
            disabled={syncingAll || cases.filter(c => c.registerSyncStatus === 'FAILED').length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
          >
            {syncingAll ? <RefreshCw size={18} className="animate-spin" /> : <History size={18} />}
            Retry Failed ({cases.filter(c => c.registerSyncStatus === 'FAILED').length})
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Cases', value: cases.length, color: 'indigo', icon: Database },
          { label: 'Synced', value: cases.filter(c => c.registerSyncStatus === 'SYNCED').length, color: 'emerald', icon: CheckCircle2 },
          { label: 'Pending', value: cases.filter(c => c.registerSyncStatus === 'PENDING').length, color: 'amber', icon: RefreshCw },
          { label: 'Failed', value: cases.filter(c => c.registerSyncStatus === 'FAILED').length, color: 'rose', icon: AlertTriangle },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={cn("p-3 rounded-2xl", `bg-${stat.color}-50 text-${stat.color}-600`)}>
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <p className={cn("text-2xl font-black", `text-${stat.color}-600`)}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main List */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by student or case ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 py-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
            />
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            {(['ALL', 'SYNCED', 'PENDING', 'FAILED'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap",
                  filter === s 
                    ? "bg-gray-900 text-white shadow-md shadow-gray-200" 
                    : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Case Info</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Archive Status</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Register Sync</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Snapshot v2</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence mode='popLayout'>
                {filteredCases.map((c) => (
                  <motion.tr 
                    layout
                    key={c.id} 
                    className="hover:bg-gray-50/50 transition-colors group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xs">
                          {c.studentName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm group-hover:text-indigo-600 transition-colors">{c.studentName}</p>
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5">{c.id} • {c.classId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      {c.driveFolderId ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          <span className="text-xs font-medium text-gray-600 truncate max-w-[150px]">Folder Ready</span>
                          <a 
                            href={`https://drive.google.com/drive/folders/${c.driveFolderId}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-indigo-500 hover:text-indigo-700 p-1 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400 italic text-xs">
                          <AlertTriangle size={14} />
                          No Folder
                        </div>
                      )}
                      {c.latestPdfFileId && (
                        <div className="flex items-center gap-2 mt-1.5 pl-5">
                          <FileText size={10} className="text-indigo-400" />
                          <span className="text-[10px] text-gray-500 font-medium truncate max-w-[150px]">PDF v{c.latestPdfVersion}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider",
                        getStatusColor(c.registerSyncStatus)
                      )}>
                        {c.registerSyncStatus === 'SYNCED' ? (
                          <CheckCircle2 size={12} />
                        ) : c.registerSyncStatus === 'FAILED' ? (
                          <ShieldAlert size={12} />
                        ) : (
                          <RefreshCw size={12} className={cn(processingId === c.id && "animate-spin")} />
                        )}
                        {c.registerSyncStatus || 'PENDING'}
                      </div>
                      {c.latestMetadataSyncAt && (
                        <p className="text-[10px] text-gray-400 mt-2 font-medium">
                          {`Synced ${formatDate(c.latestMetadataSyncAt)}`}
                        </p>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider",
                        getStatusColor(c.snapshotSyncStatus)
                      )}>
                        <Database size={12} />
                        {c.snapshotSyncStatus || 'PENDING'}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-2 font-medium">
                        {c.latestSnapshotSyncedAt ? `v${c.latestSnapshotVersion || 0} - ${formatDate(c.latestSnapshotSyncedAt)}` : 'No Snapshot'}
                      </p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleManualSync(c)}
                          disabled={processingId === c.id}
                          className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-600 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm disabled:opacity-50"
                          title="Trigger Full Sync (v1 + v2)"
                        >
                          <RefreshCw size={16} className={cn(processingId === c.id && "animate-spin")} />
                        </button>
                        <button
                          onClick={() => handleSnapshotSync(c.id)}
                          disabled={processingId === `snapshot_${c.id}`}
                          className="p-2.5 bg-white border border-gray-100 rounded-xl text-indigo-400 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm disabled:opacity-50"
                          title="Trigger Snapshot v2 Only"
                        >
                          <Database size={16} className={cn(processingId === `snapshot_${c.id}` && "animate-spin")} />
                        </button>
                        <Link
                          to={`/junior-high/academic/mtss/cases/${c.id}`}
                          className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
                          title="View Case"
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          
          {filteredCases.length === 0 && (
            <div className="py-24 text-center">
              <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Search size={32} />
              </div>
              <p className="text-gray-500 font-bold">No cases found matching your criteria</p>
              <button 
                onClick={() => { setFilter('ALL'); setSearchQuery(''); }}
                className="text-indigo-600 text-sm font-black uppercase tracking-wider mt-4 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
