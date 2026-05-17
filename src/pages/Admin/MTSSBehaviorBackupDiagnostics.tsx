import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  ExternalLink,
  ChevronRight,
  Database,
  History,
  Cloud
} from 'lucide-react';
import { 
  collection, 
  query, 
  limit,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MTSSCase, MTSSSyncStatus } from '../../types';
import { mtssBehaviorRegisterService } from '../../services/mtssBehaviorRegisterService';
import { mtssBehaviorDriveService } from '../../services/mtssBehaviorDriveService';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../../lib/utils';

export default function MTSSBehaviorBackupDiagnostics() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<MTSSCase[]>([]);
  const [filter, setFilter] = useState<MTSSSyncStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    // Note: behaviorCases is the collection for MTSS Cases
    const q = query(
      collection(db, 'behaviorCases'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MTSSCase[];
      
      setCases(data.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0)));
      setLoading(false);
    }, (error) => {
      console.error("[MTSSBehaviorBackupDiagnostics] Snapshot error:", error);
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

  async function handleManualSync(mtssCase: MTSSCase) {
    setProcessingId(mtssCase.id);
    try {
      const result = await mtssBehaviorRegisterService.syncCase(mtssCase, 'MANUAL_DIAGNOSTICS');
      if (!result.success) {
        alert(`Sync failed: ${result.error}`);
      }
      // Also trigger a snapshot sync
      await mtssBehaviorDriveService.syncSnapshot(mtssCase.id);
    } catch (error) {
      alert('Network error during sync');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleSnapshotSync(caseId: string) {
    setProcessingId(`snapshot_${caseId}`);
    try {
      await mtssBehaviorDriveService.syncSnapshot(caseId);
    } catch (error) {
      alert('Snapshot sync failed');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleBulkRetry() {
    const failedCases = cases.filter(c => c.registerSyncStatus === 'FAILED' || c.snapshotSyncStatus === 'FAILED');
    if (failedCases.length === 0) return;
    
    if (confirm(`Retry sync for ${failedCases.length} behavior cases with failures? (Both Register and Snapshot)`)) {
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
        <RefreshCw className="animate-spin text-rose-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Banner */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-rose-50 text-rose-600 rounded-3xl shadow-sm shadow-rose-50">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Behavior Diagnostics</h1>
            <p className="text-gray-500 font-medium text-sm">Monitoring & Repairing Behavior Register v1</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleBulkRetry}
            disabled={syncingAll || cases.filter(c => c.registerSyncStatus === 'FAILED').length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-md shadow-rose-100 disabled:opacity-50"
          >
            {syncingAll ? <RefreshCw size={18} className="animate-spin" /> : <History size={18} />}
            Retry Failures ({cases.filter(c => c.registerSyncStatus === 'FAILED').length})
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Cases', value: cases.length, color: 'rose', icon: Database },
          { label: 'Synced', value: cases.filter(c => c.registerSyncStatus === 'SYNCED').length, color: 'emerald', icon: CheckCircle2 },
          { label: 'Pending', value: cases.filter(c => (c.registerSyncStatus || 'PENDING') === 'PENDING').length, color: 'amber', icon: RefreshCw },
          { label: 'Failed', value: cases.filter(c => c.registerSyncStatus === 'FAILED').length, color: 'rose', icon: AlertTriangle },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center gap-4 hover:border-rose-100 transition-colors">
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

      {/* List */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Filter student or case..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 py-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all text-sm font-medium"
            />
          </div>
          
          <div className="flex items-center gap-2">
            {(['ALL', 'SYNCED', 'PENDING', 'FAILED'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                  filter === s 
                    ? "bg-rose-600 text-white shadow-md shadow-rose-100" 
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
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Behavior Case</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Archival Folders</th>
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
                        <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-black text-xs">
                          {c.studentName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm group-hover:text-rose-600 transition-colors">{c.studentName}</p>
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5">{c.id} • Tier {c.tier}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      {c.driveFolderId ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                             <CheckCircle2 size={12} className="text-emerald-500" />
                             <span className="text-[10px] font-bold text-gray-600">Folder Ready</span>
                             <a 
                                href={`https://drive.google.com/drive/folders/${c.driveFolderId}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-rose-500 hover:text-rose-700"
                              >
                                <ExternalLink size={10} />
                              </a>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                             {c.latestCaseSummaryPdfId && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[8px] font-black uppercase">Summary</span>}
                             {c.latestCicoPdfId && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[8px] font-black uppercase">CICO</span>}
                             {c.latestBipPdfId && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[8px] font-black uppercase">BIP</span>}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400 italic text-[10px]">
                          <AlertTriangle size={12} />
                          No Archive Folder
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider",
                        getStatusColor(c.registerSyncStatus)
                      )}>
                        {c.registerSyncStatus === 'SYNCED' ? (
                          <CheckCircle2 size={10} />
                        ) : c.registerSyncStatus === 'FAILED' ? (
                          <ShieldAlert size={10} />
                        ) : (
                          <RefreshCw size={10} className={cn(processingId === c.id && "animate-spin")} />
                        )}
                        {c.registerSyncStatus || 'PENDING'}
                      </div>
                      <p className="text-[9px] text-gray-400 mt-1.5 uppercase font-black tracking-tighter">
                        {c.latestMetadataSyncAt ? `Last Sync: ${formatDate(c.latestMetadataSyncAt)}` : 'Sync Required'}
                      </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider",
                        getStatusColor(c.snapshotSyncStatus)
                      )}>
                        <Cloud size={10} />
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
                          className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-rose-600 hover:border-rose-100 transition-all shadow-sm"
                          title="Trigger Full Sync (v1 + v2)"
                        >
                          <RefreshCw size={14} className={cn(processingId === c.id && "animate-spin")} />
                        </button>
                        <button
                          onClick={() => handleSnapshotSync(c.id)}
                          disabled={processingId === `snapshot_${c.id}`}
                          className="p-2.5 bg-white border border-gray-100 rounded-xl text-blue-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"
                          title="Trigger Snapshot v2 Only"
                        >
                          <Cloud size={14} className={cn(processingId === `snapshot_${c.id}` && "animate-spin")} />
                        </button>
                        <Link
                          to={`/junior-high/behavior/mtss/cases/${c.id}`}
                          className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
