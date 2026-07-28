import * as React from 'react';
import { useMenuVisibility, MenuVisibilityConfig, UnitMenuSettings } from '../../context/MenuVisibilityContext';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, RefreshCw, Save, Info, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

export default function MenuVisibilitySettings() {
  const { config, isLoading, updateConfig } = useMenuVisibility();
  const { profile } = useAuth();
  const [localConfig, setLocalConfig] = React.useState<MenuVisibilityConfig | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // Synchronize local state with real-time firestore config on load / change
  React.useEffect(() => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config)));
    }
  }, [config]);

  if (isLoading || !localConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-600 h-8 w-8" />
      </div>
    );
  }

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const handleToggle = (unit: keyof MenuVisibilityConfig, menuKey: keyof UnitMenuSettings) => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', {
        description: 'Hanya SUPER_ADMIN yang diizinkan untuk mengubah konfigurasi ini.'
      });
      return;
    }

    setLocalConfig((prev) => {
      if (!prev) return null;
      const updatedUnit = {
        ...prev[unit],
        [menuKey]: !prev[unit][menuKey]
      };
      return {
        ...prev,
        [unit]: updatedUnit
      };
    });
  };

  const handleSave = async () => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', {
        description: 'Hanya SUPER_ADMIN yang diizinkan untuk menyimpan konfigurasi ini.'
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateConfig(localConfig);
      toast.success('Konfigurasi Berhasil Disimpan', {
        description: 'Pengaturan menu unit telah diperbarui di seluruh sistem.'
      });
    } catch (err: any) {
      console.error('Error saving menu visibility config:', err);
      toast.error('Gagal Menyimpan', {
        description: err?.message || 'Terjadi kesalahan saat menyimpan data.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const menuLabels: Record<keyof UnitMenuSettings, { title: string; desc: string }> = {
    learningGoals: {
      title: 'Learning Goals',
      desc: 'Sembunyikan/tampilkan menu target pembelajaran bagi guru dan siswa unit.'
    },
    lxd: {
      title: 'LXD (Learning Experience Design)',
      desc: 'Sembunyikan/tampilkan menu perancangan pengalaman belajar.'
    },
    gradebook: {
      title: 'Buku Nilai',
      desc: 'Sembunyikan/tampilkan menu Buku Nilai (Assessment) unit.'
    },
    reportCards: {
      title: 'Rapor',
      desc: 'Sembunyikan/tampilkan menu penginputan, rekap, dan cetak Rapor.'
    }
  };

  const units: { key: keyof MenuVisibilityConfig; name: string; color: string }[] = [
    { key: 'KINDERGARTEN', name: 'Kindergarten (TK)', color: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    { key: 'ELEMENTARY', name: 'Elementary (SD)', color: 'border-emerald-100 bg-emerald-50 text-emerald-600' },
    { key: 'JUNIOR_HIGH', name: 'Junior High (SMP)', color: 'border-blue-100 bg-blue-50 text-blue-600' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
            PENGATURAN VISIBILITAS MENU UNIT
          </h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
            Tampilkan atau sembunyikan modul utama per-unit tanpa memengaruhi data atau fungsionalitas aslinya.
          </p>
        </div>
        
        {isSuperAdmin && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-blue-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? <RefreshCw className="animate-spin h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            Simpan Konfigurasi
          </button>
        )}
      </div>

      {!isSuperAdmin && (
        <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-2xl border border-amber-100 text-amber-800">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide">Mode Baca Saja (Read-Only)</p>
            <p className="text-xs text-amber-700 mt-1">Anda dapat melihat konfigurasi aktif, tetapi hanya SUPER_ADMIN yang memiliki izin untuk melakukan perubahan.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {units.map((unitObj) => {
          const unitKey = unitObj.key;
          const unitSettings = localConfig[unitKey];

          return (
            <div key={unitKey} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-black text-gray-900 tracking-tight">{unitObj.name}</h3>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${unitObj.color}`}>
                    {unitKey}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                  <Info size={14} />
                  <span>Konfigurasi Menu Aktif</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(Object.keys(menuLabels) as Array<keyof UnitMenuSettings>).map((menuKey) => {
                  const isActive = unitSettings[menuKey] ?? true;
                  const label = menuLabels[menuKey];

                  return (
                    <div 
                      key={menuKey} 
                      onClick={() => isSuperAdmin && handleToggle(unitKey, menuKey)}
                      className={`p-5 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                        isSuperAdmin ? 'cursor-pointer hover:border-blue-100 hover:bg-slate-50/20' : ''
                      } ${
                        isActive 
                          ? 'border-gray-100 bg-white' 
                          : 'border-gray-100 bg-gray-50/50 opacity-75'
                      }`}
                    >
                      <div className="space-y-1">
                        <p className={`text-xs font-black uppercase tracking-wider ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                          {label.title}
                        </p>
                        <p className="text-gray-400 text-[11px] font-semibold leading-relaxed">
                          {label.desc}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={!isSuperAdmin}
                        className={`shrink-0 transition-colors focus:outline-none ${
                          !isSuperAdmin ? 'cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {isActive ? (
                          <ToggleRight size={44} className="text-blue-600" />
                        ) : (
                          <ToggleLeft size={44} className="text-gray-300" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
