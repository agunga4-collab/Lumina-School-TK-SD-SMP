import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Upload, Save, X, Sparkles, 
  ChevronRight, LayoutGrid, Heart, BookOpen, 
  Languages, Brain, Activity, Palette, Compass,
  Music, Film, Star, CheckCircle2, Loader2, Image as ImageIcon,
  UserCheck, RefreshCw, AlertTriangle, HelpCircle, Check, Info, Trash2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import type { KGActivity, KGDomain, KGGrading } from '../../types';
import { DEFAULT_STUDENTS } from '../../lib/kindergartenWeeklyReport';

interface StudentObservation {
  grading: KGGrading | null;
  notes: string;
  photo: string | null;
}

const activities: { id: KGActivity; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'MAKE_BELIEVE', label: 'Make-Believe', icon: <Compass />, color: 'teal' },
  { id: 'ISLAMIC_AWARENESS', label: 'Islamic Awareness', icon: <Heart />, color: 'emerald' },
  { id: 'LIBRARY_LITERACY', label: 'Library & Literacy', icon: <BookOpen />, color: 'blue' },
  { id: 'DISCOVERY', label: 'Discovery', icon: <Brain />, color: 'orange' },
  { id: 'BLOCKS_BUILDING', label: 'Blocks & Building', icon: <LayoutGrid />, color: 'indigo' },
  { id: 'ART_EXPLORATIONS', label: 'Art Explorations', icon: <Palette />, color: 'purple' },
  { id: 'ENGLISH', label: 'English', icon: <Languages />, color: 'sky' },
  { id: 'MUSIC', label: 'Music', icon: <Music />, color: 'rose' },
  { id: 'OUTSIDE', label: 'Outside', icon: <Activity />, color: 'lime' },
  { id: 'AUDIO_VISUAL', label: 'Audio Visual', icon: <Film />, color: 'violet' },
];

const domains: { id: KGDomain; label: string; desc: string }[] = [
  { id: 'AGAMA_BUDI_PEKERTI', label: 'Nilai Agama & Budi Pekerti', desc: 'Mengenal tuhan, ibadah harian, budi pekerti mulia' },
  { id: 'SOSIAL_EMOSIONAL', label: 'Sosial-Emosional', desc: 'Regulasi emosi, kemandirian, interaksi sosial, gotong royong' },
  { id: 'BAHASA', label: 'Bahasa', desc: 'Komunikasi ekspresif, reseptif, keaksaraan awal' },
  { id: 'KOGNITIF', label: 'Kognitif', desc: 'Problem solving, berpikir logis, pemecahan masalah sederhana' },
  { id: 'FISIK_MOTORIK', label: 'Fisik-Motorik', desc: 'Motorik kasar, motorik halus, kesehatan fisik' },
  { id: 'SENI', label: 'Seni', desc: 'Apresiasi karya, kreasi seni musik, rupa, peran' },
];

const grades: { id: KGGrading; label: string; color: string; desc: string }[] = [
  { id: 'BB', label: 'Belum Berkembang', color: 'bg-rose-100 text-rose-700 border-rose-200', desc: 'Anak perlu bimbingan penuh' },
  { id: 'MB', label: 'Mulai Berkembang', color: 'bg-yellow-105 text-yellow-800 border-yellow-250', desc: 'Anak mulai mencoba secara mandiri' },
  { id: 'BSH', label: 'Berkembang Sesuai Harapan', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', desc: 'Anak konsisten melakukan secara mandiri' },
  { id: 'BSB', label: 'Berkembang Sangat Baik', color: 'bg-teal-100 text-teal-800 border-teal-200', desc: 'Anak mandiri dan mampu membantu teman' },
  { id: 'ABSENT', label: 'Tidak Masuk', color: 'bg-gray-100 text-gray-500 border-gray-200', desc: 'Siswa tidak datang ke sekolah' },
  { id: 'NOT_PARTICIPATING', label: 'Tidak Mengikuti', color: 'bg-gray-100 text-gray-500 border-gray-200', desc: 'Ada di sekolah tapi tidak mengikuti sesi' },
];

export default function Observation() {
  const [selectedActivity, setSelectedActivity] = React.useState<KGActivity>('ART_EXPLORATIONS');
  const [selectedDomain, setSelectedDomain] = React.useState<KGDomain>('SOSIAL_EMOSIONAL');
  
  // High fidelity general photo (Starts pre-filled with a beautiful school activity image)
  const [generalPhoto, setGeneralPhoto] = React.useState<string | null>(null);
  
  // Observations for the 5 students, keyed by student studentId
  const [observations, setObservations] = React.useState<Record<string, StudentObservation>>(() => {
    // Try to load from localStorage first for stateful interactions
    const saved = localStorage.getItem('kg_observation_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    // Default initial data
    return DEFAULT_STUDENTS.reduce((acc, student) => {
      acc[student.id] = { grading: null, notes: '', photo: null };
      return acc;
    }, {} as Record<string, StudentObservation>);
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploadingGeneral, setIsUploadingGeneral] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, boolean>>({});

  // Triggered when selected Sentra + Domain combo changes: load / initialize specific data
  React.useEffect(() => {
    const key = `kg_obs_hist_${selectedActivity}_${selectedDomain}`;
    const savedComboData = localStorage.getItem(key);
    if (savedComboData) {
      try {
        const parsed = JSON.parse(savedComboData);
        if (parsed.observations) setObservations(parsed.observations);
        if (parsed.generalPhoto) setGeneralPhoto(parsed.generalPhoto);
      } catch (e) {
        console.error(e);
      }
    } else {
      // Restore default values if no saved session exist for this combo
      const cleared = DEFAULT_STUDENTS.reduce((acc, kid) => {
        acc[kid.id] = { grading: null, notes: '', photo: null };
        return acc;
      }, {} as Record<string, StudentObservation>);
      setObservations(cleared);
    }
  }, [selectedActivity, selectedDomain]);

  const updateStudentField = (studentId: string, field: keyof StudentObservation, value: any) => {
    setObservations(prev => {
      const updated = {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: value
        }
      };
      // Keep in running scratchpad state
      localStorage.setItem('kg_observation_data', JSON.stringify(updated));
      return updated;
    });
  };

  // Real uploader for general activity photo
  const handleGeneralPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingGeneral(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setGeneralPhoto(reader.result as string);
        setIsUploadingGeneral(false);
        toast.success('Foto Kegiatan Utama berhasil diunggah! ✨');
      };
      reader.onerror = () => {
        setIsUploadingGeneral(false);
        toast.error('Gagal membaca fail foto.');
      };
      reader.readAsDataURL(file);
    }
  };

  // Real uploader for specific student photo
  const handleStudentPhotoUpload = (studentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadProgress(prev => ({ ...prev, [studentId]: true }));
      const reader = new FileReader();
      reader.onloadend = () => {
        updateStudentField(studentId, 'photo', reader.result as string);
        setUploadProgress(prev => ({ ...prev, [studentId]: false }));
        toast.success('Foto khusus siswa berhasil diunggah! 📸');
      };
      reader.onerror = () => {
        setUploadProgress(prev => ({ ...prev, [studentId]: false }));
        toast.error('Gagal membaca fail foto.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAll = () => {
    // 1. Mandatory check: general photo MUST escape empty or null values
    if (!generalPhoto) {
      toast.error('Gagal menyimpan! Foto General (kegiatan utama) wajib diisi.', {
        style: { background: '#fecaca', color: '#b91c1c', border: '1px solid #fee2e2' }
      });
      return;
    }

    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      
      // Save permanently for this combo key
      const comboKey = `kg_obs_hist_${selectedActivity}_${selectedDomain}`;
      const payload = {
        selectedActivity,
        selectedDomain,
        generalPhoto,
        observations,
        timestamp: Date.now()
      };
      localStorage.setItem(comboKey, JSON.stringify(payload));
      
      toast.success('Observation Data berhasil disimpan ke sistem! ✨', {
        description: `Sentra: ${activities.find(a => a.id === selectedActivity)?.label}, Domain: ${domains.find(d => d.id === selectedDomain)?.label}`
      });
    }, 1500);
  };

  const clearGeneralPhoto = () => {
    setGeneralPhoto(null);
    toast.info('Foto General dikosongkan. Mohon unggah kembali sebelum menyimpan.');
  };

  const currentSentraObj = activities.find(a => a.id === selectedActivity);
  const currentDomainObj = domains.find(d => d.id === selectedDomain);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
      
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4 md:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black uppercase rounded-full tracking-widest">Kindergarten Unit</span>
            <span className="flex items-center gap-1 text-[11px] text-gray-400 font-bold">
              <Sparkles size={12} className="text-emerald-500 animate-pulse" /> Live Tracker
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Observation Data</h1>
          <p className="text-gray-500 font-medium text-sm">
            Guru mengevaluasi aktivitas 1 Sentra & 1 Domain perkembangan utama per pertemuan dengan dukungan foto general wajib.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-center">
          <button 
            onClick={handleSaveAll}
            disabled={isSaving}
            className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Simpan Sesi Observasi
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Configuration Block (4 grid columns) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 1. Sentra Selection */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-2">
                <Compass size={18} className="text-emerald-500" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">1. Pilih Sentra / Sesi</h3>
              </div>
              <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-black uppercase rounded-full">Pilih 1</span>
            </div>
            
            <div className="grid grid-cols-1 gap-1.5 max-h-[300px] overflow-y-auto pr-1">
              {activities.map(act => {
                const isSelected = selectedActivity === act.id;
                return (
                  <button
                    key={act.id}
                    onClick={() => setSelectedActivity(act.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all border border-transparent",
                      isSelected 
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-100 font-bold border-emerald-500 scale-[1.01]" 
                        : "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 bg-gray-50/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        isSelected ? "bg-white/20 text-white" : "bg-white text-gray-500 shadow-sm"
                      )}>
                        {React.cloneElement(act.icon as React.ReactElement, { size: 14 })}
                      </div>
                      <span className="text-[11px] font-bold tracking-tight">{act.label}</span>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-emerald-600">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Domain Selection */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-2">
                <Brain size={18} className="text-emerald-500" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">2. Pilih Domain Perkembangan</h3>
              </div>
              <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-black uppercase rounded-full">Pilih 1</span>
            </div>
            
            <p className="text-xs text-gray-400 pl-1">
              Sesuai arahan kurikulum, pilih satu fokus kompetensi utama per pertemuan ini untuk dilaporkan.
            </p>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {domains.map(dom => {
                const isSelected = selectedDomain === dom.id;
                return (
                  <button
                    key={dom.id}
                    onClick={() => setSelectedDomain(dom.id)}
                    className={cn(
                      "w-full flex flex-col p-3 rounded-2xl text-left transition-all border",
                      isSelected 
                        ? "bg-gray-900 text-white border-gray-900 shadow-lg scale-[1.01]" 
                        : "text-gray-700 hover:bg-gray-50 border-gray-100 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-black tracking-wide">{dom.label}</span>
                      {isSelected ? (
                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white scale-90">
                          <Check size={10} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-gray-100 border border-gray-200" />
                      )}
                    </div>
                    <span className={cn(
                      "text-[9px] mt-1 line-clamp-1 leading-snug",
                      isSelected ? "text-gray-300" : "text-gray-400"
                    )}>
                      {dom.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. General Photo (Wajib Diisi) */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-rose-500" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">3. Foto General (Wajib)</h3>
              </div>
              <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-[9.5px] font-black uppercase rounded-full animate-pulse">Required</span>
            </div>

            <p className="text-xs text-gray-400">
              Unggah satu foto utama seputar kegiatan hari ini. Foto ini menjadi fallback visual untuk siswa yang tidak memiliki foto individual khusus.
            </p>

            <AnimatePresence mode="wait">
              {generalPhoto ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-3"
                >
                  <div className="relative aspect-video rounded-2xl overflow-hidden group bg-gray-100 border border-gray-100 shadow-inner">
                    <img src={generalPhoto} alt="General Activity" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <label className="p-2.5 bg-white/90 hover:bg-white text-gray-800 rounded-xl font-bold text-xs transition-transform hover:scale-105 flex items-center gap-1.5 shadow-md cursor-pointer">
                        <RefreshCw size={14} className="text-emerald-600" /> Ganti
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleGeneralPhotoUpload} 
                          className="hidden" 
                        />
                      </label>
                      <button 
                        onClick={clearGeneralPhoto}
                        className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-transform hover:scale-105 flex items-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <Trash2 size={14} /> Hapus
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-rose-600 text-white px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider">
                      Active Fallback
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-150">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Lolos verifikasi. Foto ini akan melengkapi arsip harian siswa secara otomatis.</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/20 p-8 flex flex-col items-center justify-center text-center gap-3 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                    <AlertTriangle size={24} className="animate-bounce" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-rose-800 uppercase tracking-widest">Foto Harian Belum Diisi</h4>
                    <p className="text-[10px] text-rose-600 mt-1 max-w-[200px] leading-relaxed mx-auto">
                      Sesi ini tidak dapat disimpan sebelum Foto General diunggah.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-lg shadow-rose-100 transition-all hover:scale-103 cursor-pointer">
                    {isUploadingGeneral ? (
                      <>
                        <Loader2 className="animate-spin" size={14} /> Membaca...
                      </>
                    ) : (
                      <>
                        <Upload size={14} /> Unggah Foto Kegiatan
                      </>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleGeneralPhotoUpload} 
                      className="hidden" 
                    />
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT COLUMN: Active Evaluator Workspace (8 grid columns) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Sesi Header Context Card */}
          <div className="bg-gray-900 rounded-[2rem] p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center shadow-lg gap-4 relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
            <div className="space-y-1 bg-white/5 py-3.5 px-5 rounded-2xl border border-white/5">
              <span className="text-[9px] font-black text-emerald-400 tracking-widest uppercase">Target Evaluasi Sesi</span>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
                <span className="text-sm font-black tracking-tight">{currentSentraObj?.label}</span>
                <span className="text-gray-500 text-xs">&gt;</span>
                <span className="text-xs font-bold text-gray-300">{currentDomainObj?.label}</span>
              </div>
            </div>
            
            <div className="text-left md:text-right flex items-center md:flex-col gap-2 md:gap-0 font-mono">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Waktu Observasi</span>
              <span className="text-xs font-bold text-emerald-400 mt-1">Hari Ini (2026-05-21)</span>
            </div>
          </div>

          {/* Student Observations Loop Container */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <UserCheck size={16} className="text-emerald-600" /> Lembar Penilaian Siswa KKG
              </h2>
              <span className="text-gray-400 text-xs font-bold">{DEFAULT_STUDENTS.length} Siswa Terdaftar</span>
            </div>

            {DEFAULT_STUDENTS.map((student) => {
              const obs = observations[student.id] || { grading: null, notes: '', photo: null };
              const resolvedPhoto = obs.photo || generalPhoto;
              const hasSpecificPhoto = !!obs.photo;

              return (
                <div 
                  key={student.id}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all duration-300 grid grid-cols-1 md:grid-cols-12 gap-6 relative"
                >
                  
                  {/* Left block: student info & initials avatar */}
                  <div className="md:col-span-3 flex flex-col justify-start space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-base flex items-center justify-center shadow-md">
                        {student.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-gray-900 tracking-tight leading-tight uppercase truncate">{student.name}</h4>
                        <p className="text-[10px] font-bold text-gray-400 font-mono mt-0.5">NIS: {student.id}</p>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50/70 rounded-xl p-2.5 border border-gray-100 text-[10px] text-gray-500 leading-normal">
                      <span className="font-bold block text-gray-700">Status Capaian:</span>
                      <span className="font-semibold block italic mt-0.5 text-emerald-700">
                        {grades.find(g => g.id === obs.grading)?.label || 'Belum Dinilai'}
                      </span>
                    </div>
                  </div>

                  {/* Middle block: grading metrics selector & notes */}
                  <div className="md:col-span-6 space-y-4">
                    {/* Capaian Pill selector */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1 leading-none">
                        Tingkat Capaian <HelpCircle size={10} className="text-gray-300" />
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {grades.map((gr) => {
                          const isCurrentGrading = obs.grading === gr.id;
                          return (
                            <button
                              key={gr.id}
                              type="button"
                              onClick={() => updateStudentField(student.id, 'grading', obs.grading === gr.id ? null : gr.id)}
                              title={gr.desc}
                              className={cn(
                                "px-2.5 py-1.5 rounded-xl text-[9px] font-bold transition-all border shrink-0",
                                isCurrentGrading 
                                  ? gr.color + " border-transparent shadow-sm scale-103 font-black" 
                                  : "bg-white text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-600"
                              )}
                            >
                              {gr.id}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9.5px] italic text-gray-400 pl-1 leading-normal">
                        Keterangan: {grades.find(g => g.id === obs.grading)?.desc || '-'}
                      </p>
                    </div>

                    {/* Notes textarea */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Catatan Pembelajaran (Opsional)</label>
                      <textarea 
                        rows={2}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-emerald-400 focus:bg-white transition-all text-gray-700 font-medium placeholder:italic"
                        placeholder={`Tulis momen spesifik mengenai perilaku ${student.name.split(' ')[0]} terkait ${currentDomainObj?.label}...`}
                        value={obs.notes}
                        onChange={(e) => updateStudentField(student.id, 'notes', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Right block: Student specific photo override */}
                  <div className="md:col-span-3 flex flex-col justify-between space-y-2">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none block">
                        Foto Siswa (Opsional)
                      </label>
                      
                      {/* Photo preview block */}
                      <div className="relative aspect-video md:aspect-square md:w-full rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center group shadow-inner">
                        {resolvedPhoto ? (
                          <>
                            <img src={resolvedPhoto} alt={student.name} className="w-full h-full object-cover" />
                            {hasSpecificPhoto ? (
                              <button
                                onClick={() => updateStudentField(student.id, 'photo', null)}
                                className="absolute top-1 right-1 p-1.5 bg-red-600 text-white rounded-lg hover:scale-110 opacity-0 group-hover:opacity-100 transition-all shadow-md"
                                title="Reset gunakan Foto Harian"
                              >
                                <X size={10} strokeWidth={4} />
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-center p-2 flex flex-col items-center justify-center gap-1">
                            <ImageIcon size={18} className="text-gray-300" />
                            <span className="text-[8px] text-gray-400 leading-tight">Belum ada foto</span>
                          </div>
                        )}

                        {/* Glass overlay label specifying photo source */}
                        {resolvedPhoto && (
                          <div className={cn(
                            "absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide uppercase shadow-sm",
                            hasSpecificPhoto 
                              ? "bg-emerald-600/90 text-white" 
                              : "bg-gray-800/80 text-gray-200"
                          )}>
                            {hasSpecificPhoto ? "Foto Khusus" : "Foto Harian"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Native student-specific file uploader */}
                    <label
                      className={cn(
                        "w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        hasSpecificPhoto 
                          ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700" 
                          : "bg-white hover:bg-gray-50 border-gray-200 text-gray-600"
                      )}
                    >
                      {uploadProgress[student.id] ? (
                        <>
                          <Loader2 className="animate-spin" size={10} /> Membaca...
                        </>
                      ) : (
                        <>
                          <Camera size={10} /> 
                          {hasSpecificPhoto ? "Ganti Foto Khusus" : "Unggah Foto Khusus"}
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleStudentPhotoUpload(student.id, e)} 
                        className="hidden" 
                      />
                    </label>
                    
                    {!hasSpecificPhoto && generalPhoto && (
                      <span className="text-[8px] text-gray-400 leading-none text-center block italic">
                        Otomatis mewarisi Foto General
                      </span>
                    )}
                  </div>

                </div>
              );
            })}
          </div>

          {/* Bottom Save Action Panel */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-emerald-50 text-emerald-600">
                <Info size={18} />
              </div>
              <div className="text-xs">
                <p className="font-black text-gray-900">Periksa Ulang Sebelum Menyimpan</p>
                <p className="text-gray-400 mt-0.5">Penilaian ini bernilai dinamis dan langsung disinkronkan ke local storage sasi terkait.</p>
              </div>
            </div>

            <button 
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 py-4 rounded-2.5xl shadow-xl shadow-emerald-150 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest shrink-0"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Simpan Observation Data
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
