import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Save, Settings, Layers, Briefcase, GitCommit, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import {
  SOMasterOptions,
  DesignTeamOption,
  SwjRoleOption,
  DEFAULT_SO_MASTER_OPTIONS
} from '../../../types/schoolOrganizations';
import { saveMasterOptions } from '../../../services/juniorHighSchoolOrganizationsService';

interface MasterOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: SOMasterOptions;
  userEmail: string;
  onSuccess: (updated: SOMasterOptions) => void;
}

export const MasterOptionsModal: React.FC<MasterOptionsModalProps> = ({
  isOpen,
  onClose,
  options,
  userEmail,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'dt' | 'swj' | 'swj_stages' | 'comp_stages'>('dt');
  const [designTeams, setDesignTeams] = useState<DesignTeamOption[]>(() => options.designTeams || DEFAULT_SO_MASTER_OPTIONS.designTeams);
  const [swjRoles, setSwjRoles] = useState<SwjRoleOption[]>(() => options.swjRoles || DEFAULT_SO_MASTER_OPTIONS.swjRoles);
  const [swjStages, setSwjStages] = useState<string[]>(() => options.swjFlowStages || DEFAULT_SO_MASTER_OPTIONS.swjFlowStages);
  const [compStages, setCompStages] = useState<string[]>(() => options.competitionStages || DEFAULT_SO_MASTER_OPTIONS.competitionStages);
  const [isSaving, setIsSaving] = useState(false);

  // New item inputs
  const [newDtName, setNewDtName] = useState('');
  const [newDtDesc, setNewDtDesc] = useState('');

  const [newSwjName, setNewSwjName] = useState('');
  const [newSwjQuota, setNewSwjQuota] = useState(6);
  const [newSwjDesc, setNewSwjDesc] = useState('');

  const [newSwjStage, setNewSwjStage] = useState('');
  const [newCompStage, setNewCompStage] = useState('');

  if (!isOpen) return null;

  const handleAddDesignTeam = () => {
    if (!newDtName.trim()) {
      toast.error('Nama Design Team tidak boleh kosong');
      return;
    }
    const id = `dt-${Date.now()}`;
    const nextOrder = designTeams.length + 1;
    setDesignTeams(prev => [
      ...prev,
      {
        id,
        name: newDtName.trim(),
        description: newDtDesc.trim(),
        order: nextOrder,
        isActive: true
      }
    ]);
    setNewDtName('');
    setNewDtDesc('');
  };

  const handleAddSwjRole = () => {
    if (!newSwjName.trim()) {
      toast.error('Nama Peran SWJ tidak boleh kosong');
      return;
    }
    const id = `swj-${Date.now()}`;
    const nextOrder = swjRoles.length + 1;
    setSwjRoles(prev => [
      ...prev,
      {
        id,
        name: newSwjName.trim(),
        description: newSwjDesc.trim(),
        defaultQuota: Number(newSwjQuota) || 6,
        order: nextOrder,
        isActive: true
      }
    ]);
    setNewSwjName('');
    setNewSwjDesc('');
    setNewSwjQuota(6);
  };

  const handleAddSwjStage = () => {
    if (!newSwjStage.trim()) return;
    if (swjStages.includes(newSwjStage.trim())) {
      toast.error('Tahap ini sudah ada');
      return;
    }
    setSwjStages(prev => [...prev, newSwjStage.trim()]);
    setNewSwjStage('');
  };

  const handleAddCompStage = () => {
    if (!newCompStage.trim()) return;
    if (compStages.includes(newCompStage.trim())) {
      toast.error('Tahap ini sudah ada');
      return;
    }
    setCompStages(prev => [...prev, newCompStage.trim()]);
    setNewCompStage('');
  };

  const moveItem = <T,>(list: T[], index: number, direction: 'up' | 'down'): T[] => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return list;
    const copy = [...list];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    return copy;
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const updatedOptions: SOMasterOptions = {
        designTeams: designTeams.map((dt, idx) => ({ ...dt, order: idx + 1 })),
        swjRoles: swjRoles.map((r, idx) => ({ ...r, order: idx + 1 })),
        swjFlowStages: swjStages,
        competitionStages: compStages,
      };

      await saveMasterOptions(updatedOptions, userEmail);
      toast.success('Pengaturan master berhasil disimpan ke sistem');
      onSuccess(updatedOptions);
      onClose();
    } catch (err: any) {
      console.error('Error saving master options:', err);
      toast.error(`Gagal menyimpan pengaturan: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Pengaturan Master School Organizations</h2>
              <p className="text-xs text-blue-200">
                Khusus Super Admin dan Kepala Unit Junior High. Pengaturan tersimpan di dokumen master_options.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 gap-2">
          <button
            onClick={() => setActiveTab('dt')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'dt'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Design Teams ({designTeams.length})
          </button>
          <button
            onClick={() => setActiveTab('swj')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'swj'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Peran SWJ ({swjRoles.length})
          </button>
          <button
            onClick={() => setActiveTab('swj_stages')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'swj_stages'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <GitCommit className="w-4 h-4" />
            Tahap Alur SWJ ({swjStages.length})
          </button>
          <button
            onClick={() => setActiveTab('comp_stages')}
            className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'comp_stages'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Tahap Lomba ({compStages.length})
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: DESIGN TEAMS */}
          {activeTab === 'dt' && (
            <div className="space-y-4">
              <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100 flex flex-col gap-3">
                <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                  Tambah Design Team Baru
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Nama Design Team..."
                    value={newDtName}
                    onChange={e => setNewDtName(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Deskripsi fokus/kegiatan tim..."
                    value={newDtDesc}
                    onChange={e => setNewDtDesc(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleAddDesignTeam}
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-xs"
                  >
                    <Plus className="w-4 h-4" /> Tambah Tim
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Daftar Design Team Aktif & Nonaktif
                </label>
                {designTeams.map((dt, idx) => (
                  <div
                    key={dt.id}
                    className="p-3 bg-white border border-gray-200 rounded-xl flex items-center gap-3 hover:border-gray-300 transition-all shadow-2xs"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        disabled={idx === 0}
                        onClick={() => setDesignTeams(moveItem(designTeams, idx, 'up'))}
                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-400"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === designTeams.length - 1}
                        onClick={() => setDesignTeams(moveItem(designTeams, idx, 'down'))}
                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-400"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="w-6 text-center text-xs font-bold text-gray-400">{idx + 1}</span>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={dt.name}
                        onChange={e => {
                          const val = e.target.value;
                          setDesignTeams(prev => prev.map(item => item.id === dt.id ? { ...item, name: val } : item));
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg focus:border-blue-500"
                      />
                      <input
                        type="text"
                        value={dt.description}
                        onChange={e => {
                          const val = e.target.value;
                          setDesignTeams(prev => prev.map(item => item.id === dt.id ? { ...item, description: val } : item));
                        }}
                        placeholder="Deskripsi tim..."
                        className="px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg focus:border-blue-500"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-600 select-none">
                      <input
                        type="checkbox"
                        checked={dt.isActive}
                        onChange={e => {
                          const checked = e.target.checked;
                          setDesignTeams(prev => prev.map(item => item.id === dt.id ? { ...item, isActive: checked } : item));
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      {dt.isActive ? 'Aktif' : 'Nonaktif'}
                    </label>

                    <button
                      onClick={() => setDesignTeams(prev => prev.filter(item => item.id !== dt.id))}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: SWJ ROLES */}
          {activeTab === 'swj' && (
            <div className="space-y-4">
              <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100 flex flex-col gap-3">
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  Tambah Peran School-Wide Job Baru
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Nama Peran (misal: Green Leaders)..."
                    value={newSwjName}
                    onChange={e => setNewSwjName(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Kuota:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={newSwjQuota}
                      onChange={e => setNewSwjQuota(Number(e.target.value))}
                      className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Deskripsi tugas relawan..."
                    value={newSwjDesc}
                    onChange={e => setNewSwjDesc(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleAddSwjRole}
                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs"
                  >
                    <Plus className="w-4 h-4" /> Tambah Peran SWJ
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Daftar Peran SWJ
                </label>
                {swjRoles.map((role, idx) => (
                  <div
                    key={role.id}
                    className="p-3 bg-white border border-gray-200 rounded-xl flex items-center gap-3 hover:border-gray-300 transition-all shadow-2xs"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        disabled={idx === 0}
                        onClick={() => setSwjRoles(moveItem(swjRoles, idx, 'up'))}
                        className="p-1 text-gray-400 hover:text-emerald-600 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === swjRoles.length - 1}
                        onClick={() => setSwjRoles(moveItem(swjRoles, idx, 'down'))}
                        className="p-1 text-gray-400 hover:text-emerald-600 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="w-6 text-center text-xs font-bold text-gray-400">{idx + 1}</span>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={role.name}
                        onChange={e => {
                          const val = e.target.value;
                          setSwjRoles(prev => prev.map(item => item.id === role.id ? { ...item, name: val } : item));
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg focus:border-emerald-500 md:col-span-1"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">Kuota:</span>
                        <input
                          type="number"
                          min={1}
                          value={role.defaultQuota}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setSwjRoles(prev => prev.map(item => item.id === role.id ? { ...item, defaultQuota: val } : item));
                          }}
                          className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:border-emerald-500"
                        />
                      </div>
                      <input
                        type="text"
                        value={role.description}
                        onChange={e => {
                          const val = e.target.value;
                          setSwjRoles(prev => prev.map(item => item.id === role.id ? { ...item, description: val } : item));
                        }}
                        placeholder="Deskripsi peran..."
                        className="px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg focus:border-emerald-500 md:col-span-2"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-600 select-none">
                      <input
                        type="checkbox"
                        checked={role.isActive}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSwjRoles(prev => prev.map(item => item.id === role.id ? { ...item, isActive: checked } : item));
                        }}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      {role.isActive ? 'Aktif' : 'Nonaktif'}
                    </label>

                    <button
                      onClick={() => setSwjRoles(prev => prev.filter(item => item.id !== role.id))}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SWJ FLOW STAGES */}
          {activeTab === 'swj_stages' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-100 flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Nama tahap alur SWJ baru..."
                  value={newSwjStage}
                  onChange={e => setNewSwjStage(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
                />
                <button
                  onClick={handleAddSwjStage}
                  className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Tambah Tahap
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Urutan Tahap Alur SWJ (Default: Sosialisasi → Pendaftaran → Rekrutmen → Orientasi → Berjalan)
                </label>
                {swjStages.map((stage, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-gray-200 rounded-xl flex items-center gap-3 shadow-2xs"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        disabled={idx === 0}
                        onClick={() => setSwjStages(moveItem(swjStages, idx, 'up'))}
                        className="p-1 text-gray-400 hover:text-amber-600 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === swjStages.length - 1}
                        onClick={() => setSwjStages(moveItem(swjStages, idx, 'down'))}
                        className="p-1 text-gray-400 hover:text-amber-600 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="w-6 text-center text-xs font-bold text-gray-400">{idx + 1}</span>

                    <input
                      type="text"
                      value={stage}
                      onChange={e => {
                        const val = e.target.value;
                        setSwjStages(prev => prev.map((s, i) => i === idx ? val : s));
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg focus:border-amber-500"
                    />

                    <button
                      onClick={() => setSwjStages(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: COMPETITION STAGES */}
          {activeTab === 'comp_stages' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-100 flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Nama tahap lomba baru..."
                  value={newCompStage}
                  onChange={e => setNewCompStage(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
                />
                <button
                  onClick={handleAddCompStage}
                  className="px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Tambah Tahap
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Urutan Tahap Lomba & Kompetisi (Default: Info → Pendaftaran → Persiapan → Pelaksanaan → Hasil → Evaluasi)
                </label>
                {compStages.map((stage, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-gray-200 rounded-xl flex items-center gap-3 shadow-2xs"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        disabled={idx === 0}
                        onClick={() => setCompStages(moveItem(compStages, idx, 'up'))}
                        className="p-1 text-gray-400 hover:text-purple-600 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === compStages.length - 1}
                        onClick={() => setCompStages(moveItem(compStages, idx, 'down'))}
                        className="p-1 text-gray-400 hover:text-purple-600 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="w-6 text-center text-xs font-bold text-gray-400">{idx + 1}</span>

                    <input
                      type="text"
                      value={stage}
                      onChange={e => {
                        const val = e.target.value;
                        setCompStages(prev => prev.map((s, i) => i === idx ? val : s));
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg focus:border-purple-500"
                    />

                    <button
                      onClick={() => setCompStages(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => {
              // Reset to defaults
              if (window.confirm('Kembalikan ke pengaturan default awal?')) {
                setDesignTeams(DEFAULT_SO_MASTER_OPTIONS.designTeams);
                setSwjRoles(DEFAULT_SO_MASTER_OPTIONS.swjRoles);
                setSwjStages(DEFAULT_SO_MASTER_OPTIONS.swjFlowStages);
                setCompStages(DEFAULT_SO_MASTER_OPTIONS.competitionStages);
              }
            }}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Reset ke Default
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
