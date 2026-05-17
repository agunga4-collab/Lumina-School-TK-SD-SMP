import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Database, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink, 
  Search, 
  Filter,
  ArrowRight,
  ShieldAlert,
  FileSpreadsheet,
  AlertTriangle,
  Send,
  History
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, getDoc, doc } from 'firebase/firestore';
import { AttendanceRecord, AttendanceBackupFileMap, AttendanceBackupConfig } from '../../types';
import { attendanceBackupRetryService } from '../../services/attendanceBackupRetryService';
import { attendanceBackupConfigService } from '../../services/attendanceBackupConfigService';
import { toast } from 'sonner';

const AttendanceBackupDiagnostics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [fileMaps, setFileMaps] = useState<AttendanceBackupFileMap[]>([]);
  const [config, setConfig] = useState<AttendanceBackupConfig | null>(null);
  
  const [stats, setStats] = useState({
    total: 0,
    synced: 0,
    pending: 0,
    failed: 0
  });

  const [resyncing, setResyncing] = useState<string | null>(null);
  const [globalResyncing, setGlobalResyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load stats
      const allRecordsSnap = await getDocs(query(collection(db, 'attendance_records'), limit(1000)));
      const allRecords = allRecordsSnap.docs.map(d => d.data() as AttendanceRecord);
      
      const s = {
        total: allRecords.length,
        synced: allRecords.filter(r => r.syncStatus === 'SYNCED').length,
        pending: allRecords.filter(r => r.syncStatus === 'PENDING').length,
        failed: allRecords.filter(r => r.syncStatus === 'FAILED').length
      };
      setStats(s);
      
      // Load failed records for display
      const failedQuery = query(
        collection(db, 'attendance_records'),
        where('syncStatus', '==', 'FAILED'),
        limit(100)
      );
      const failedSnap = await getDocs(failedQuery);
      const failedRecords = failedSnap.docs.map(d => d.data() as AttendanceRecord);
      setRecords(failedRecords.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 50));

      // Load file maps
      const mapsSnap = await getDocs(collection(db, 'attendance_backup_file_maps'));
      setFileMaps(mapsSnap.docs.map(d => d.data() as AttendanceBackupFileMap));

      // Load config
      const cfg = await attendanceBackupConfigService.getConfig();
      setConfig(cfg);

    } catch (error) {
      console.error('Error loading diagnostics:', error);
      toast.error('Gagal Memuat Data', { description: 'Beberapa data statistik mungkin tidak akurat.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRetryOne = async (recordId: string) => {
    setResyncing(recordId);
    try {
      const result = await attendanceBackupRetryService.retryAttendanceSyncForRecord(recordId);
      if (result.success) {
        toast.success('Sync Berhasil', { description: `Record ${recordId} berhasil di-backup.` });
        loadData();
      } else {
        toast.error('Sync Gagal', { description: result.error });
      }
    } catch (err) {
      toast.error('Error', { description: 'Kesalahan sistem saat retry.' });
    } finally {
      setResyncing(null);
    }
  };

  const handleRetryAllFailed = async () => {
    setGlobalResyncing(true);
    try {
      const result = await attendanceBackupRetryService.retryAllFailedAttendanceSyncs(50);
      toast.success('Retry Batch Selesai', { 
        description: `Memproses ${result.processed} record, ${result.success} berhasil.` 
      });
      loadData();
    } catch (err) {
      toast.error('Error', { description: 'Batch retry gagal.' });
    } finally {
      setGlobalResyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-gray-500 font-medium animate-pulse">Menganalisis kesehatan backup attendance...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-blue-600" />
            Attendance Backup Diagnostics
          </h1>
          <p className="text-gray-500 mt-1">Lumina Junior High - Sync Reliability Panel</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => window.location.href = '/attendance/backup-config'}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-700"
            >
              Config
            </button>
            <button 
              onClick={() => window.location.href = '/attendance/backup-diagnostics'}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 shadow-sm"
            >
              Diagnostics
            </button>
          </div>
          <button 
            onClick={loadData}
            className="p-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button 
            onClick={handleRetryAllFailed}
            disabled={globalResyncing || stats.failed === 0}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50"
          >
            {globalResyncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Resync All Failed ({stats.failed})
          </button>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Attendance" 
          value={stats.total} 
          icon={<Database className="w-5 h-5 text-gray-500" />} 
          color="gray"
        />
        <StatCard 
          label="Synced Successfully" 
          value={stats.synced} 
          icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} 
          color="green" 
          subtext={`${((stats.synced / (stats.total || 1)) * 100).toFixed(1)}% compatibility`}
        />
        <StatCard 
          label="Sync Failed" 
          value={stats.failed} 
          icon={<AlertCircle className="w-5 h-5 text-red-500" />} 
          color="red"
          alert={stats.failed > 0}
        />
        <StatCard 
          label="Pending Backup" 
          value={stats.pending} 
          icon={<RefreshCw className="w-5 h-5 text-amber-500" />} 
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Failed Records List */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Daftar Sinkronisasi Gagal (50 Terakhir)
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="px-6 py-4">Siswa / Kelas</th>
                    <th className="px-6 py-4">Tanggal</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">
                        Tidak ada record yang gagal sinkronisasi.
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id} className="group hover:bg-red-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 text-sm">{r.studentName}</div>
                          <div className="text-xs text-gray-500">{r.classId} • {r.academicYear}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700 font-mono">{r.date}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit">
                              FAILED
                              {r.retryCount > 0 && <span className="opacity-60">• Retry: {r.retryCount}</span>}
                            </span>
                            <span className="text-[10px] text-gray-400 truncate max-w-[150px]" title={r.syncError || ''}>
                              {r.syncError || 'Unknown error'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleRetryOne(r.id)}
                            disabled={!!resyncing}
                            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {resyncing === r.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* File Maps / Spreadsheets */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                Backup Spreadsheets
              </h2>
            </div>
            
            <div className="p-4 space-y-3">
              {fileMaps.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs italic">
                  Belum ada spreadsheet yang di-generate.
                </div>
              ) : (
                fileMaps.map((map) => (
                  <div key={map.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition-all group">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm">Kelas {map.classId}</h4>
                        <p className="text-[10px] text-gray-500 font-medium">
                          T.A {map.academicYear} • Semester {map.semester}
                        </p>
                      </div>
                      <a 
                        href={map.spreadsheetUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Last Synced</span>
                      <span className="text-[10px] font-mono text-gray-600">
                        {new Date(map.lastSyncedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-orange-500" />
              Admin Tools
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 italic text-[11px] text-orange-800">
                Gunakan tool ini jika spreadsheet dipindah manual atau ingin menyambungkan ulang file map.
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Class ID</label>
                  <input id="tool-class-id" placeholder="Contoh: 8-A" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Academic Year</label>
                  <input id="tool-year" placeholder="2025/2026" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-gray-500 uppercase">Semester</label>
                   <select id="tool-semester" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                     <option value="1">Semester 1</option>
                     <option value="2">Semester 2</option>
                   </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Spreadsheet ID</label>
                  <input id="tool-ss-id" placeholder="Google Spreadsheet ID" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-xs" />
                </div>
                <button 
                  onClick={async () => {
                    const classId = (document.getElementById('tool-class-id') as HTMLInputElement).value;
                    const year = (document.getElementById('tool-year') as HTMLInputElement).value;
                    const semester = (document.getElementById('tool-semester') as HTMLSelectElement).value as '1' | '2';
                    const ssId = (document.getElementById('tool-ss-id') as HTMLInputElement).value;
                    
                    if (!classId || !year || !ssId) {
                       toast.error('Data tidak lengkap');
                       return;
                    }

                    try {
                      const id = `${classId}_${year.replace(/\//g, '-')}_S${semester}`;
                      await attendanceBackupConfigService.saveFileMap({
                        id,
                        classId,
                        academicYear: year,
                        semester,
                        spreadsheetId: ssId,
                        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${ssId}`,
                        folderId: '#',
                        lastSyncedAt: Date.now()
                      });
                      toast.success('File Map Diupdate');
                      loadData();
                    } catch (e) {
                      toast.error('Gagal update map');
                    }
                  }}
                  className="w-full py-2 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-black transition-all"
                >
                  Relink Spreadsheet
                </button>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
            <h3 className="text-amber-800 font-bold flex items-center gap-2 text-sm uppercase tracking-wider mb-4">
              <History className="w-4 h-4" />
              Recent System Activity
            </h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Backup configurasi diperbarui oleh <strong>{config?.lastUpdatedBy}</strong>
                  <br />
                  <span className="text-[10px] opacity-60">
                    {config?.lastUpdatedAt ? new Date(config.lastUpdatedAt).toLocaleString() : 'Never'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon, color, subtext, alert }: { 
  label: string; 
  value: number; 
  icon: React.ReactNode; 
  color: string;
  subtext?: string;
  alert?: boolean;
}) => {
  const colorMap: any = {
    gray: 'bg-gray-50 text-gray-600 border-gray-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100'
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-6 rounded-3xl border-2 shadow-sm ${colorMap[color]} ${alert ? 'animate-pulse ring-2 ring-red-500/20' : ''}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-xl bg-white shadow-sm`}>
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</h3>
        <div className="text-3xl font-black">{value}</div>
        {subtext && <p className="text-[10px] mt-2 opacity-80">{subtext}</p>}
      </div>
    </motion.div>
  );
};

export default AttendanceBackupDiagnostics;
