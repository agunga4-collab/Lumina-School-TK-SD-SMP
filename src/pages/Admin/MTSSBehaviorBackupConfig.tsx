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
  ShieldCheck
} from 'lucide-react';
import { mtssBehaviorBackupConfigService } from '../../services/mtssBehaviorBackupConfigService';
import { MTSSBehaviorBackupConfig } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export default function MTSSBehaviorBackupConfigPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [config, setConfig] = useState<MTSSBehaviorBackupConfig>({
    id: 'junior_high_mtss_behavior_v1',
    schoolUnit: 'JUNIOR_HIGH',
    isEnabled: false,
    sharedDriveId: '',
    rootFolderName: 'MTSS Behavior',
    rootFolderId: '',
    masterRegisterSpreadsheetId: '',
    folderNamingPattern: '{caseId}_{studentName}',
    pdfNamingPattern: 'MTSS_BH_{caseId}_{studentName}_v{version}',
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
    const data = await mtssBehaviorBackupConfigService.getConfig();
    if (data) {
      setConfig(data);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await mtssBehaviorBackupConfigService.saveConfig(config, profile.id);
      alert('Behavior Configuration saved successfully');
    } catch (error) {
      alert('Failed to save behavior configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyStatus({});
    const result = await mtssBehaviorBackupConfigService.verifyConfig(config);
    setVerifyStatus({
      success: result.success,
      message: result.success ? 'Behavior-archive configuration verified' : result.error,
      details: result.details
    });
    setVerifying(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-rose-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-rose-50 text-rose-600 rounded-3xl shadow-sm shadow-rose-50">
            <Settings size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Behavior Backup Config</h1>
            <p className="text-gray-500 font-medium text-sm">MTSS Behavior Backup v1 • Junior High</p>
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
            className="flex items-center gap-2 px-6 py-3 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-md shadow-rose-100"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            Save Config
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Storage */}
          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
              <Database size={20} className="text-rose-500" />
              <h2 className="text-xl font-black text-gray-900 italic uppercase">Shared Drive</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Shared Drive ID</label>
                <input
                  type="text"
                  value={config.sharedDriveId}
                  onChange={(e) => setConfig({ ...config, sharedDriveId: e.target.value })}
                  placeholder="Paste Shared Drive ID here"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-rose-500 outline-none transition-all font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Root Folder Name</label>
                <input
                  type="text"
                  value={config.rootFolderName}
                  onChange={(e) => setConfig({ ...config, rootFolderName: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-rose-500 outline-none transition-all font-medium"
                />
              </div>
            </div>
          </section>

          {/* Master Register */}
          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
              <FileSpreadsheet size={20} className="text-emerald-500" />
              <h2 className="text-xl font-black text-gray-900 italic uppercase">Behavior Intervention Records</h2>
            </div>
            
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Spreadsheet ID</label>
              <input
                type="text"
                value={config.masterRegisterSpreadsheetId}
                onChange={(e) => setConfig({ ...config, masterRegisterSpreadsheetId: e.target.value })}
                placeholder="ID of the Google Spreadsheet to use as Behavior Master Register"
                className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-sm"
              />
            </div>
          </section>

          {/* Patterns */}
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
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <span className="font-black text-gray-900 italic uppercase underline decoration-rose-500 underline-offset-4">Auto Sync</span>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                config.isEnabled ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"
              )}>
                {config.isEnabled ? "Active" : "Off"}
              </div>
            </div>

            <button
              onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-2xl transition-all",
                config.isEnabled ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
              )}
            >
              <span className="text-sm font-bold text-gray-700">Enable Backup</span>
              {config.isEnabled ? <ToggleRight className="text-emerald-500" size={32} /> : <ToggleLeft className="text-rose-300" size={32} />}
            </button>

            <div className="space-y-3 pt-4 border-t border-gray-50">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-bold text-gray-600 group-hover:text-gray-900 transition-colors">Auto-create Folders</span>
                <input
                  type="checkbox"
                  checked={config.autoCreateFolder}
                  onChange={(e) => setConfig({ ...config, autoCreateFolder: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-bold text-gray-600 group-hover:text-gray-900 transition-colors">Auto-sync Register</span>
                <input
                  type="checkbox"
                  checked={config.autoSyncRegister}
                  onChange={(e) => setConfig({ ...config, autoSyncRegister: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs font-bold text-gray-600 group-hover:text-gray-900 transition-colors">Auto-upload generated PDF</span>
                <input
                  type="checkbox"
                  checked={config.autoUploadPdf}
                  onChange={(e) => setConfig({ ...config, autoUploadPdf: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                />
              </label>
            </div>
          </section>

          {/* Verification */}
          {verifyStatus.message && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "p-6 rounded-[2rem] border shadow-sm space-y-4",
                verifyStatus.success ? "bg-emerald-50 border-emerald-100 text-emerald-900" : "bg-rose-50 border-rose-100 text-rose-900"
              )}
            >
               <div className="flex items-center gap-2">
                {verifyStatus.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <span className="font-black uppercase italic tracking-tight">{verifyStatus.success ? "Ready" : "Error"}</span>
              </div>
              <p className="text-xs font-medium leading-relaxed italic opacity-80">{verifyStatus.message}</p>
              
              {verifyStatus.details && (
                <div className="pt-3 border-t border-emerald-100/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-black uppercase tracking-widest opacity-60">Drive</span>
                    <span className="font-bold truncate max-w-[120px]">{verifyStatus.details.driveName}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-black uppercase tracking-widest opacity-60">Master Register</span>
                    <span className="font-bold truncate max-w-[120px]">{verifyStatus.details.registerTitle}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
