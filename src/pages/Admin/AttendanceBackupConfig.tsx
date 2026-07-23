import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Cloud, 
  CheckCircle2, 
  AlertTriangle, 
  FolderSearch, 
  FolderPlus, 
  Save, 
  ExternalLink,
  Shield,
  ShieldAlert,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Database
} from 'lucide-react';
import { attendanceBackupConfigService } from '../../services/attendanceBackupConfigService';
import { AttendanceBackupConfig, User } from '../../types';
import { auth } from '../../lib/firebase';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

const AttendanceBackupConfigPage: React.FC = () => {
  const [config, setConfig] = useState<AttendanceBackupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Form State
  const [rootFolderId, setRootFolderId] = useState('');
  const [sharedDriveId, setSharedDriveId] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    // Mock user for now if needed, but in real app it comes from context
    // Assume auth.currentUser exists
    const loadConfig = async () => {
      setLoading(true);
      const cfg = await attendanceBackupConfigService.getConfig();
      if (cfg) {
        setConfig(cfg);
        setRootFolderId(cfg.rootFolderId);
        setSharedDriveId(cfg.sharedDriveId);
        setIsEnabled(cfg.isEnabled);
      }
      setLoading(false);
    };

    loadConfig();
  }, []);

  const handleSave = async () => {
    if (!rootFolderId || !sharedDriveId) {
      toast.error('Gagal Simpan', {
        description: 'Folder ID dan Shared Drive ID wajib diisi.'
      });
      return;
    }

    setSaving(true);
    try {
      const userEmail = auth.currentUser?.email || 'system';
      const newConfig: AttendanceBackupConfig = {
        id: 'junior_high_attendance',
        rootFolderId,
        sharedDriveId,
        isEnabled,
        lastUpdatedBy: userEmail,
        lastUpdatedAt: Date.now(),
        rootFolderPath: '#' // Path calculation happens in backend/validation
      };

      await attendanceBackupConfigService.saveConfig(newConfig);
      setConfig(newConfig);
      toast.success('Konfigurasi Disimpan', {
        description: 'Pengaturan backup attendance berhasil diperbarui.'
      });
    } catch (error) {
      toast.error('Gagal Simpan', {
        description: 'Terjadi kesalahan saat menyimpan konfigurasi.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setTesting(true);
    try {
      // API Call to verify folder access
      const response = await fetch('/api/attendance/verify-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootFolderId, sharedDriveId })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        toast.success('Akses Google Drive berhasil diverifikasi. Konfigurasi siap digunakan.', {
          description: 'Verify Access hanya memeriksa akses folder; folder dan Google Sheet baru dibuat setelah presensi disimpan.'
        });
      } else {
        toast.error('Verifikasi Gagal', {
          description: data.error || 'Folder tidak dapat diakses atau Shared Drive salah.'
        });
      }
    } catch (error: any) {
      toast.error('Error', {
        description: error?.message || 'Koneksi ke server gagal.'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-7 h-7 text-blue-600" />
            Attendance Backup Configuration
          </h1>
          <p className="text-gray-500 mt-1">
            Pengaturan sinkronisasi real-time data kehadiran ke Google Sheets Shared Drive.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
            <button 
              onClick={() => window.location.href = '/attendance/backup-config'}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-600 shadow-sm"
            >
              Config
            </button>
            <button 
              onClick={() => window.location.href = '/attendance/backup-diagnostics'}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-700"
            >
              Diagnostics
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1 self-center" />
            <button 
              onClick={() => window.location.href = '/junior-high/academic/mtss/backup-config'}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-blue-600"
            >
              MTSS Academic
            </button>
          </div>
          <button
            onClick={handleVerify}
            disabled={testing}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {testing ? <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> : <Shield className="w-4 h-4" />}
            {testing ? 'Verifying...' : 'Verify Access'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-md shadow-blue-200 flex items-center gap-2 disabled:opacity-50 active:scale-95"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Settings */}
        <div className="lg:col-span-8 space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500" />
                Google Drive Integration
              </h2>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 block">
                  Root Folder ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={rootFolderId}
                    onChange={(e) => setRootFolderId(e.target.value)}
                    placeholder="Masukkan Google Drive Folder ID"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-gray-700"
                  />
                  <FolderSearch className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-xs text-gray-500 italic">
                  Folder induk tempat semua subfolder (Tahun Akademik) akan dibuat otomatis.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 block">
                  Shared Drive ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={sharedDriveId}
                    onChange={(e) => setSharedDriveId(e.target.value)}
                    placeholder="Masukkan Shared Drive ID"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm text-gray-700"
                  />
                  <Database className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="pt-4 flex items-start gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <div className="bg-blue-100 p-1.5 rounded-lg">
                  <FolderPlus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900">Auto-Structure Enabled</h4>
                  <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                    Sistem akan otomatis membuat struktur: <br/> 
                    <code className="bg-blue-100/50 px-1 rounded">Attendance / {`{AcademicYear}`} / {`{Semester}`} / {`{ClassSheet}`}</code>
                  </p>
                </div>
              </div>

              <div className="text-xs text-gray-500 bg-gray-50 p-3.5 rounded-xl border border-gray-100 leading-relaxed">
                <p className="font-semibold text-gray-700 mb-1">Pemberitahuan Verifikasi Akses:</p>
                Verify Access hanya memeriksa akses folder utama. Subfolder dan Google Sheet baru baru akan dibuat secara otomatis setelah data presensi disimpan.
              </div>
            </div>
          </motion.div>

          {/* Sync Logic Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Synchronization Mode</h2>
              <div 
                onClick={() => setIsEnabled(!isEnabled)}
                className={`w-12 h-6 rounded-full cursor-pointer transition-colors relative ${isEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isEnabled ? 'left-7' : 'left-1'}`} />
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className={`mt-1 p-1 rounded ${isEnabled ? 'text-green-500 bg-green-50' : 'text-gray-400 bg-gray-100'}`}>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Real-time Backend Sync</p>
                  <p className="text-xs text-gray-500">
                    Setiap perubahan di Lumina akan langsung dikirim ke antrian backup Google Sheets.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={`mt-1 p-1 rounded ${isEnabled ? 'text-blue-500 bg-blue-50' : 'text-gray-400 bg-gray-100'}`}>
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Spreadsheet Auto-Generation</p>
                  <p className="text-xs text-gray-500">
                    Jika spreadsheet untuk kelas/semester tertentu belum ada, sistem akan menemukannya atau membuat baru dengan template resmi.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
            <h3 className="text-amber-800 font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4" />
              Operational Guide
            </h3>
            <ul className="mt-4 space-y-3">
              <li className="text-xs text-amber-700 flex gap-2">
                <span className="shrink-0">•</span>
                Pastikan Service Account memiliki akses <strong>"Manager"</strong> atau <strong>"Contributor"</strong> ke Shared Drive.
              </li>
              <li className="text-xs text-amber-700 flex gap-2">
              <span className="shrink-0">•</span>
                Root Folder ID bisa didapatkan dari URL folder di Google Drive.
              </li>
              <li className="text-xs text-amber-700 flex gap-2">
              <span className="shrink-0">•</span>
                Jangan memindahkan subfolder yang telah dibuat oleh sistem untuk menjaga konsistensi path.
              </li>
            </ul>
          </div>

          <div className="bg-gray-900 rounded-2xl p-6 text-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full" />
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <RefreshCw className="w-4 h-4 text-blue-400" />
              Backup Status
            </h3>
            
            <div className="space-y-4 relative">
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-xs text-gray-400">Environment</span>
                <span className="text-xs font-mono bg-blue-500/20 px-2 py-0.5 rounded text-blue-300 uppercase">Production</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-xs text-gray-400">Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1.5 ${isEnabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                  {isEnabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Last Sync Activity</span>
                <span className="text-xs text-gray-300">
                  {config?.lastUpdatedAt ? new Date(config.lastUpdatedAt).toLocaleDateString() : 'Never'}
                </span>
              </div>
            </div>

            <button className="w-full mt-6 py-2.5 bg-white/10 border border-white/10 rounded-xl text-xs font-medium hover:bg-white/20 transition-all flex items-center justify-center gap-2">
              View Log History
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceBackupConfigPage;
