import * as React from 'react';
import { useState } from 'react';
import { X, Plus, Trash2, Save, Settings, AlertCircle } from 'lucide-react';
import { AssessmentBookOptions, DEFAULT_ASSESSMENT_BOOK_OPTIONS } from '../../../../types';
import { saveAssessmentBookOptions } from '../../../../services/juniorHighAssessmentBookService';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialOptions: AssessmentBookOptions;
  onSaved: (options: AssessmentBookOptions) => void;
}

export function AssessmentBookSettingsModal({ isOpen, onClose, initialOptions, onSaved }: Props) {
  const [options, setOptions] = useState<AssessmentBookOptions>(initialOptions);
  const [saving, setSaving] = useState(false);

  // New item inputs
  const [newFormativeTask, setNewFormativeTask] = useState('');
  const [newNextAction, setNewNextAction] = useState('');
  const [newSummativeTask, setNewSummativeTask] = useState('');

  React.useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions, isOpen]);

  if (!isOpen) return null;

  const handleAddFormativeTask = () => {
    const val = newFormativeTask.trim();
    if (!val) return;
    if (options.formativeTasks.includes(val)) {
      toast.warning('Opsi sudah ada');
      return;
    }
    setOptions(prev => ({
      ...prev,
      formativeTasks: [...prev.formativeTasks, val]
    }));
    setNewFormativeTask('');
  };

  const handleRemoveFormativeTask = (index: number) => {
    setOptions(prev => ({
      ...prev,
      formativeTasks: prev.formativeTasks.filter((_, i) => i !== index)
    }));
  };

  const handleAddNextAction = () => {
    const val = newNextAction.trim();
    if (!val) return;
    if (options.nextActions.includes(val)) {
      toast.warning('Opsi sudah ada');
      return;
    }
    setOptions(prev => ({
      ...prev,
      nextActions: [...prev.nextActions, val]
    }));
    setNewNextAction('');
  };

  const handleRemoveNextAction = (index: number) => {
    setOptions(prev => ({
      ...prev,
      nextActions: prev.nextActions.filter((_, i) => i !== index)
    }));
  };

  const handleAddSummativeTask = () => {
    const val = newSummativeTask.trim();
    if (!val) return;
    if (options.summativeTasks.includes(val)) {
      toast.warning('Opsi sudah ada');
      return;
    }
    setOptions(prev => ({
      ...prev,
      summativeTasks: [...prev.summativeTasks, val]
    }));
    setNewSummativeTask('');
  };

  const handleRemoveSummativeTask = (index: number) => {
    setOptions(prev => ({
      ...prev,
      summativeTasks: prev.summativeTasks.filter((_, i) => i !== index)
    }));
  };

  const handleResetToDefault = () => {
    if (window.confirm('Kembalikan semua daftar opsi dropdown ke default bawaan sistem?')) {
      setOptions(DEFAULT_ASSESSMENT_BOOK_OPTIONS);
      toast.info('Opsi dropdown dikembalikan ke default. Klik Simpan untuk menerapkan.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAssessmentBookOptions(options);
      toast.success('Pengaturan dropdown Assessment Book berhasil disimpan.');
      onSaved(options);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan pengaturan: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Pengaturan Opsi Dropdown</h2>
              <p className="text-xs text-gray-500">Konfigurasi opsi Formative Task, Next Action, dan Summative Task</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Notice */}
        <div className="mx-6 mt-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-2.5 text-xs text-blue-800">
          <AlertCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            Perubahan opsi dropdown akan berlaku untuk seluruh guru Junior High dan tidak akan mengubah data asesmen lampau.
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Formative Tasks */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                1. Formative Task (Bentuk Tugas Formatif)
              </label>
              <span className="text-[11px] text-gray-400">{options.formativeTasks.length} opsi</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFormativeTask}
                onChange={e => setNewFormativeTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddFormativeTask()}
                placeholder="Tambah tugas formatif baru (misal: Praktik Lab)..."
                className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddFormativeTask}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {options.formativeTasks.map((task, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200"
                >
                  {task}
                  <button
                    onClick={() => handleRemoveFormativeTask(idx)}
                    className="text-gray-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Section 2: Next Actions */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                2. Next Action (Tindak Lanjut Formatif)
              </label>
              <span className="text-[11px] text-gray-400">{options.nextActions.length} opsi</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newNextAction}
                onChange={e => setNewNextAction(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddNextAction()}
                placeholder="Tambah opsi tindak lanjut (misal: Bimbingan Intensif)..."
                className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddNextAction}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {options.nextActions.map((action, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200"
                >
                  {action}
                  <button
                    onClick={() => handleRemoveNextAction(idx)}
                    className="text-amber-500 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Section 3: Summative Tasks */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                3. Summative Task (Bentuk Penilaian Sumatif)
              </label>
              <span className="text-[11px] text-gray-400">{options.summativeTasks.length} opsi</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSummativeTask}
                onChange={e => setNewSummativeTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSummativeTask()}
                placeholder="Tambah tugas sumatif baru (misal: Gelar Karya)..."
                className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddSummativeTask}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {options.summativeTasks.map((task, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200"
                >
                  {task}
                  <button
                    onClick={() => handleRemoveSummativeTask(idx)}
                    className="text-emerald-500 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
          >
            Reset ke Default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-700 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
