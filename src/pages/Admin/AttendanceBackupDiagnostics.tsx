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
import { db, auth } from '../../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { AttendanceRecord, AttendanceBackupFileMap, AttendanceBackupConfig } from '../../types';
import { attendanceBackupRetryService } from '../../services/attendanceBackupRetryService';
import { attendanceBackupConfigService } from '../../services/attendanceBackupConfigService';
import { toast } from 'sonner';

interface BackupJob {
  id: string;
  backupType: 'ATTENDANCE' | 'DHUHUR_ATTENDANCE';
  unit: string;
  status: 'IDLE' | 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'RETRYING' | 'FAILED';
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  currentBatch: number;
  totalBatches: number;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  retryCount?: number;
  nextRetryAt?: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt?: number;
}

const AttendanceBackupDiagnostics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [fileMaps, setFileMaps] = useState<AttendanceBackupFileMap[]>([]);
  const [config, setConfig] = useState<AttendanceBackupConfig | null>(null);
  
  const [jobs, setJobs] = useState<{
    attendance_junior_high: BackupJob | null;
    dhuhur_junior_high: BackupJob | null;
  }>({
    attendance_junior_high: null,
    dhuhur_junior_high: null
  });
  const [triggeringJob, setTriggeringJob] = useState<string | null>(null);

  useEffect(() => {
    const unsubDaily = onSnapshot(doc(db, "system_backup_jobs", "attendance_junior_high"), (snapshot) => {
      if (snapshot.exists()) {
        setJobs(prev => ({ ...prev, attendance_junior_high: snapshot.data() as BackupJob }));
      } else {
        setJobs(prev => ({ ...prev, attendance_junior_high: {
          id: 'attendance_junior_high',
          backupType: 'ATTENDANCE',
          unit: 'JUNIOR_HIGH',
          status: 'IDLE',
          totalRows: 0,
          processedRows: 0,
          successRows: 0,
          failedRows: 0,
          currentBatch: 0,
          totalBatches: 0
        }}));
      }
    });

    const unsubDhuhur = onSnapshot(doc(db, "system_backup_jobs", "dhuhur_junior_high"), (snapshot) => {
      if (snapshot.exists()) {
        setJobs(prev => ({ ...prev, dhuhur_junior_high: snapshot.data() as BackupJob }));
      } else {
        setJobs(prev => ({ ...prev, dhuhur_junior_high: {
          id: 'dhuhur_junior_high',
          backupType: 'DHUHUR_ATTENDANCE',
          unit: 'JUNIOR_HIGH',
          status: 'IDLE',
          totalRows: 0,
          processedRows: 0,
          successRows: 0,
          failedRows: 0,
          currentBatch: 0,
          totalBatches: 0
        }}));
      }
    });

    return () => {
      unsubDaily();
      unsubDhuhur();
    };
  }, []);

  const handleTriggerJob = async (jobId: string, mode: 'START' | 'RETRY_FAILED' | 'REBUILD_ALL') => {
    setTriggeringJob(jobId);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/backup/run-job', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobId, mode })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal menjalankan job backup.');
      }

      toast.success('Job Backup Dimulai', { description: data.message });
    } catch (error: any) {
      console.error('Trigger backup job failed:', error);
      toast.error('Gagal Memulai Backup', { description: error.message || 'Kesalahan sistem.' });
    } finally {
      setTriggeringJob(null);
    }
  };
  
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
      // Load stats for DAILY and DHUHUR
      const dailyRecordsSnap = await getDocs(query(collection(db, 'attendance_records'), limit(1000)));
      const dailyRecords = dailyRecordsSnap.docs.map(d => ({ ...d.data(), id: d.id }) as AttendanceRecord);

      const dhuhurRecordsSnap = await getDocs(query(collection(db, 'dhuhur_attendance_records'), limit(1000)));
      const dhuhurRecords = dhuhurRecordsSnap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        studentName: d.data().studentNameSnapshot || d.data().studentName || 'Siswa'
      }) as any);
      
      const allRecords = [...dailyRecords, ...dhuhurRecords];
      
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
      const failedRecords = failedSnap.docs.map(d => ({ ...d.data(), id: d.id }) as AttendanceRecord);

      const failedDhuhurQuery = query(
        collection(db, 'dhuhur_attendance_records'),
        where('syncStatus', '==', 'FAILED'),
        limit(100)
      );
      const failedDhuhurSnap = await getDocs(failedDhuhurQuery);
      const failedDhuhurRecords = failedDhuhurSnap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        studentName: d.data().studentNameSnapshot || d.data().studentName || 'Siswa'
      }) as any);

      const mergedFailed = [...failedRecords, ...failedDhuhurRecords];
      setRecords(mergedFailed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 50));

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
      const record = records.find(r => r.id === recordId);
      const colName = record?.backupType === 'DHUHUR_ATTENDANCE' ? 'dhuhur_attendance_records' : 'attendance_records';
      const result = await attendanceBackupRetryService.retryAttendanceSyncForRecord(recordId, colName);
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

  const renderBackupJobCard = (jobId: string, title: string, job: BackupJob | null) => {
    if (!job) {
      return (
        <div className="p-6 rounded-2xl border border-gray-100 bg-gray-50/50 flex flex-col items-center justify-center min-h-[220px]">
          <RefreshCw className="w-6 h-6 text-blue-500 animate-spin mb-2" />
          <p className="text-xs text-gray-400 font-medium">Memuat status job...</p>
        </div>
      );
    }

    const {
      status,
      totalRows,
      processedRows,
      successRows,
      failedRows,
      currentBatch,
      totalBatches,
      spreadsheetUrl,
      lastErrorCode,
      lastErrorMessage,
      retryCount,
      nextRetryAt,
      updatedAt
    } = job;

    const progressPercent = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;

    const badgeColors: Record<string, string> = {
      IDLE: 'bg-gray-100 text-gray-600 border-gray-200',
      PREPARING: 'bg-blue-50 text-blue-600 border-blue-100',
      IN_PROGRESS: 'bg-indigo-50 text-indigo-600 border-indigo-100 animate-pulse',
      RETRYING: 'bg-amber-50 text-amber-700 border-amber-200',
      COMPLETED: 'bg-green-50 text-green-600 border-green-100',
      PARTIAL: 'bg-orange-50 text-orange-600 border-orange-100',
      FAILED: 'bg-red-50 text-red-600 border-red-100'
    };

    const isRunning = ['PREPARING', 'IN_PROGRESS', 'RETRYING'].includes(status);

    return (
      <div className="p-6 rounded-2xl border border-gray-100 bg-gray-50/30 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-extrabold text-gray-900 text-sm tracking-tight">{title}</h3>
              <p className="text-[11px] text-gray-500 font-medium">Unit: JUNIOR_HIGH</p>
            </div>
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${badgeColors[status] || badgeColors.IDLE}`}>
              {status}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">
                {status === 'IDLE' ? 'Belum dijalankan' : `${processedRows} dari ${totalRows} baris diproses`}
              </span>
              <span className="font-extrabold text-gray-900">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm text-center">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Sukses</div>
              <div className="text-lg font-black text-green-600">{successRows}</div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm text-center">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Gagal</div>
              <div className="text-lg font-black text-red-600">{failedRows}</div>
            </div>
          </div>

          <div className="text-xs space-y-1 text-gray-500 font-medium">
            {totalBatches > 0 && (
              <div className="flex justify-between">
                <span>Batch saat ini:</span>
                <span className="font-bold text-gray-800">{currentBatch} dari {totalBatches}</span>
              </div>
            )}
            {retryCount !== undefined && retryCount > 0 && (
              <div className="flex justify-between text-amber-700 font-bold">
                <span>Retries (Google Quota):</span>
                <span>{retryCount} / 5</span>
              </div>
            )}
            {nextRetryAt && status === 'RETRYING' && (
              <div className="flex justify-between text-amber-600 italic">
                <span>Retry berikutnya pada:</span>
                <span>{new Date(nextRetryAt).toLocaleTimeString()}</span>
              </div>
            )}
            {updatedAt && (
              <div className="flex justify-between text-[10px] text-gray-400 pt-1">
                <span>Terakhir diperbarui:</span>
                <span>{new Date(updatedAt).toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          {lastErrorMessage && (
            <div className="p-3.5 rounded-xl border bg-red-50/50 border-red-100 text-xs text-red-700 leading-relaxed space-y-1">
              <div className="font-extrabold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                Detail Kesalahan:
              </div>
              <p className="font-medium text-red-600/90">{lastErrorMessage}</p>
              {lastErrorCode && (
                <div className="text-[10px] font-mono text-red-400">Kode Teknis: {lastErrorCode}</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          {status === 'IDLE' || status === 'FAILED' ? (
            <button
              onClick={() => handleTriggerJob(jobId, 'START')}
              disabled={isRunning || triggeringJob === jobId}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {status === 'FAILED' ? 'Coba Lagi' : 'Mulai Backup'}
            </button>
          ) : status === 'PARTIAL' ? (
            <button
              onClick={() => handleTriggerJob(jobId, 'RETRY_FAILED')}
              disabled={isRunning || triggeringJob === jobId}
              className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-xs shadow-md shadow-orange-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Ulangi Data Gagal
            </button>
          ) : status === 'COMPLETED' ? (
            <button
              onClick={() => handleTriggerJob(jobId, 'REBUILD_ALL')}
              disabled={isRunning || triggeringJob === jobId}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-xs shadow-md shadow-gray-100 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Backup Ulang
            </button>
          ) : (
            <button
              disabled
              className="flex-1 py-2.5 bg-gray-200 text-gray-400 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Sedang Mencadangkan...
            </button>
          )}

          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-green-50 text-green-600 border border-green-100 hover:bg-green-100/50 rounded-xl font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Buka Google Sheet
            </a>
          )}
        </div>
      </div>
    );
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

      {/* Google Sheets Backup Job Monitor */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 tracking-tight">Google Sheets Backup Monitor (Junior High)</h2>
          <p className="text-xs text-gray-500 mt-1">Status sinkronisasi batch real-time dan kontrol pencadangan ke Google Sheets</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {renderBackupJobCard('attendance_junior_high', 'Backup Kehadiran Harian', jobs.attendance_junior_high)}
          {renderBackupJobCard('dhuhur_junior_high', 'Backup Kehadiran Shalat Dhuhur', jobs.dhuhur_junior_high)}
        </div>
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
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{r.classId} • {r.academicYear}</span>
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              r.backupType === 'DHUHUR_ATTENDANCE' 
                                ? "bg-orange-50 text-orange-600 border border-orange-100" 
                                : "bg-blue-50 text-blue-600 border border-blue-100"
                            }`}>
                              {r.backupType === 'DHUHUR_ATTENDANCE' ? 'Shalat Dhuhur' : 'Harian'}
                            </span>
                          </div>
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
