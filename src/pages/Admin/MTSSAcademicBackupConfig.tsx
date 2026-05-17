import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  Database, 
  FileSpreadsheet, 
  FolderOpen, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Search,
  ChevronRight
} from 'lucide-react';
import { mtssAcademicBackupConfigService } from '../../services/mtssAcademicBackupConfigService';
import { MTSSAcademicBackupConfig } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export default function MTSSAcademicBackupConfigPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [config, setConfig] = useState<MTSSAcademicBackupConfig>({
    id: 'junior_high_mtss_v1',
    schoolUnit: 'JUNIOR_HIGH',
    isEnabled: false,
    sharedDriveId: '',
    rootFolderName: 'MTSS Academic',
    rootFolderId: '',
    masterRegisterSpreadsheetId: '',
    folderNamingPattern: '{caseId}_{studentName}',
    pdfNamingPattern: 'MTSS_{caseId}_{studentName}_v{version}',
    autoCreateFolder: true,
    autoSyncRegister: true,
    autoUploadPdf: true,
    lastValidatedAt: null,
    lastValidatedBy: null,
    updatedAt: Date.now(),
    updatedBy: ''
  });

  const [verifyStatus, setVerifyStatus] = useState<{
    success?: boolean;
    message?: string;
    details?: any;
  }>({});

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    const data = await mtssAcademicBackupConfigService.getConfig();
    if (data) {
      setConfig(data);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await mtssAcademicBackupConfigService.saveConfig(config, profile.id);
      alert('Configuration saved successfully');
    } catch (error) {
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyStatus({});
    const result = await mtssAcademicBackupConfigService.verifyConfig(config);
    setVerifyStatus({
      success: result.success,
      message: result.success ? 'Configuration verified successfully' : result.error,
      details: result.details
    });
    setVerifying(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl shadow-sm shadow-indigo-50">
            <Settings size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Backup Configuration</h1>
            <p className="text-gray-500 font-medium text-sm">MTSS Academic Backup v1 • Junior High</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-2xl hover:bg-gray-50 transition-all shadow-sm"
          >
            {verifying ? <RefreshCw size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            Verify Access
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            Save Config
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Settings */}
        <div className="lg:col-span-2 space-y-8">
          {/* Storage Section */}
          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
              <Database size={20} className="text-indigo-500" />
              <h2 className="text-xl font-black text-gray-900 italic uppercase">Storage & Drive</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Shared Drive ID</label>
                <input
                  type="text"
                  value={config.sharedDriveId}
                  onChange={(e) => setConfig({ ...config, sharedDriveId: e.target.value })}
                  placeholder="Paste Shared Drive ID here"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Root Folder ID (Optional)</label>
                <input
                  type="text"
                  value={config.rootFolderId}
                  onChange={(e) => setConfig({ ...config, rootFolderId: e.target.value })}
                  placeholder="Defaults to Shared Drive root if empty"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Root Folder Name</label>
                <input
                  type="text"
                  value={config.rootFolderName}
                  onChange={(e) => setConfig({ ...config, rootFolderName: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                />
              </div>
            </div>
          </section>

          {/* Registration Section */}
          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
              <FileSpreadsheet size={20} className="text-emerald-500" />
              <h2 className="text-xl font-black text-gray-900 italic uppercase">Master Register</h2>
            </div>
            
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Spreadsheet ID</label>
              <input
                type="text"
                value={config.masterRegisterSpreadsheetId}
                onChange={(e) => setConfig({ ...config, masterRegisterSpreadsheetId: e.target.value })}
                placeholder="ID of the Google Spreadsheet to use as Master Register"
                className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-sm"
              />
              <p className="mt-2 text-xs text-gray-400 ml-1 italic">
                Ensure the spreadsheet has a sheet named "Register" with correct headers.
              </p>
            </div>
          </section>

          {/* Patterns Section */}
          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
              <FolderOpen size={20} className="text-amber-500" />
              <h2 className="text-xl font-black text-gray-900 italic uppercase">Naming Patterns</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Case Folder Pattern</label>
                <input
                  type="text"
                  value={config.folderNamingPattern}
                  onChange={(e) => setConfig({ ...config, folderNamingPattern: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-medium text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">PDF Archive Pattern</label>
                <input
                  type="text"
                  value={config.pdfNamingPattern}
                  onChange={(e) => setConfig({ ...config, pdfNamingPattern: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all font-medium text-sm"
                />
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Available Tokens</span>
              <div className="flex flex-wrap gap-2">
                {['{caseId}', '{studentName}', '{studentId}', '{classId}', '{academicYear}', '{semester}', '{version}'].map(token => (
                  <code key={token} className="px-2 py-1 bg-white text-indigo-600 rounded-lg border border-gray-100 text-xs font-bold">{token}</code>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar Controls */}
        <div className="space-y-8">
          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <span className="font-black text-gray-900 italic uppercase">System Status</span>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                config.isEnabled ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"
              )}>
                {config.isEnabled ? "Active" : "Disabled"}
              </div>
            </div>

            <button
              onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-2xl transition-all",
                config.isEnabled ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-gray-100"
              )}
            >
              <span className="text-sm font-bold text-gray-700">Enable Backup</span>
              {config.isEnabled ? <ToggleRight className="text-emerald-500" size={32} /> : <ToggleLeft className="text-gray-300" size={32} />}
            </button>

            <div className="space-y-4 pt-4 border-t border-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Auto-create Folders</span>
                <input
                  type="checkbox"
                  checked={config.autoCreateFolder}
                  onChange={(e) => setConfig({ ...config, autoCreateFolder: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Auto-sync Register</span>
                <input
                  type="checkbox"
                  checked={config.autoSyncRegister}
                  onChange={(e) => setConfig({ ...config, autoSyncRegister: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Auto-upload PDF</span>
                <input
                  type="checkbox"
                  checked={config.autoUploadPdf}
                  onChange={(e) => setConfig({ ...config, autoUploadPdf: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* Verification Results */}
          {verifyStatus.message && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-6 rounded-[2rem] border shadow-sm space-y-3",
                verifyStatus.success ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
              )}
            >
              <div className="flex items-center gap-2">
                {verifyStatus.success ? (
                  <CheckCircle2 size={20} className="text-emerald-500" />
                ) : (
                  <AlertTriangle size={20} className="text-rose-500" />
                )}
                <span className={cn(
                  "font-bold text-sm",
                  verifyStatus.success ? "text-emerald-700" : "text-rose-700"
                )}>
                  {verifyStatus.success ? "Verification Passed" : "Verification Failed"}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed italic">{verifyStatus.message}</p>
              
              {verifyStatus.details && (
                <div className="pt-3 space-y-2 border-t border-emerald-100/50">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-400 uppercase font-black tracking-widest">Shared Drive</span>
                    <span className="font-bold text-emerald-600 truncate max-w-[120px]">{verifyStatus.details.driveName}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-400 uppercase font-black tracking-widest">Register</span>
                    <span className="font-bold text-emerald-600 truncate max-w-[120px]">{verifyStatus.details.registerTitle}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Info Card */}
          <div className="p-6 bg-indigo-600 rounded-[2rem] text-white shadow-lg shadow-indigo-100">
            <h3 className="font-black italic uppercase tracking-tight text-lg mb-2">Pro-Tip</h3>
            <p className="text-xs text-indigo-100 leading-relaxed">
              Arsitektur v1 menggunakan Shared Drive sebagai arsip resmi. Pastikan Akun Layanan Lumina memiliki akses 'Content Manager' ke Drive tersebut.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
