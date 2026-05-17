import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Upload, Save, X, Plus, Sparkles, 
  ChevronRight, LayoutGrid, Heart, BookOpen, 
  Languages, Brain, Activity, Palette, Compass,
  Music, Film, Star, CheckCircle2, Loader2, Image as ImageIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { KGActivity, KGDomain, KGGrading } from '../../types';

interface DomainEvaluation {
  domain: KGDomain;
  grading: KGGrading;
  notes: string;
}

const activities: { id: KGActivity; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'MAKE_BELIEVE', label: 'Make-Believe', icon: <Compass />, color: 'pink' },
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

const domains: { id: KGDomain; label: string }[] = [
  { id: 'AGAMA_BUDI_PEKERTI', label: 'Nilai Agama & Budi Pekerti' },
  { id: 'SOSIAL_EMOSIONAL', label: 'Sosial-Emosional' },
  { id: 'BAHASA', label: 'Bahasa' },
  { id: 'KOGNITIF', label: 'Kognitif' },
  { id: 'FISIK_MOTORIK', label: 'Fisik-Motorik' },
  { id: 'SENI', label: 'Seni' },
];

const grades: { id: KGGrading; label: string; color: string; desc: string }[] = [
  { id: 'BB', label: 'Belum Berkembang', color: 'bg-rose-100 text-rose-700', desc: 'Anak perlu bimbingan penuh' },
  { id: 'MB', label: 'Mulai Berkembang', color: 'bg-yellow-100 text-yellow-700', desc: 'Anak mulai mencoba secara mandiri' },
  { id: 'BSH', label: 'Berkembang Sesuai Harapan', color: 'bg-emerald-100 text-emerald-700', desc: 'Anak konsisten melakukan secara mandiri' },
  { id: 'BSB', label: 'Berkembang Sangat Baik', color: 'bg-emerald-700 text-white', desc: 'Anak mandiri dan mampu membantu teman' },
  { id: 'ABSENT', label: 'Tidak Masuk', color: 'bg-gray-100 text-gray-500', desc: '' },
  { id: 'NOT_PARTICIPATING', label: 'Tidak Mengikuti', color: 'bg-gray-100 text-gray-500', desc: '' },
];

export default function Observation() {
  const [selectedActivity, setSelectedActivity] = React.useState<KGActivity>('ART_EXPLORATIONS');
  const [evaluations, setEvaluations] = React.useState<DomainEvaluation[]>(
    domains.map(d => ({ domain: d.id, grading: 'BSH', notes: '' }))
  );
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  const updateGrading = (domainId: KGDomain, grading: KGGrading) => {
    setEvaluations(prev => prev.map(e => e.domain === domainId ? { ...e, grading } : e));
  };

  const updateNotes = (domainId: KGDomain, notes: string) => {
    setEvaluations(prev => prev.map(e => e.domain === domainId ? { ...e, notes } : e));
  };

  const handlePhotoUpload = () => {
    // Simulating photo upload
    setPhotos(prev => [...prev, 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&q=80&w=200']);
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert('Catatan observasi dan foto berhasil disimpan! ✨');
    }, 1500);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Observasi & Aktivitas Harian</h1>
        <p className="text-gray-500 font-medium">Dokumentasikan momen belajar anak dan beri apresiasi pada setiap langkahnya.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Activity Selection */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
             <div className="flex items-center gap-2 px-2 border-b border-gray-50 pb-3">
                <LayoutGrid size={18} className="text-pink-500" />
                <h3 className="text-sm font-bold text-gray-900 uppercase">Pilih Sentra / Sesi</h3>
             </div>
             <div className="space-y-1">
                {activities.map(act => (
                  <button
                    key={act.id}
                    onClick={() => setSelectedActivity(act.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all",
                      selectedActivity === act.id ? "bg-pink-600 text-white shadow-lg shadow-pink-100" : "text-gray-600 hover:bg-pink-50"
                    )}
                  >
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      selectedActivity === act.id ? "bg-white/20" : "bg-gray-50"
                    )}>
                      {React.cloneElement(act.icon as React.ReactElement, { size: 16 })}
                    </div>
                    <span className="text-xs font-bold">{act.label}</span>
                  </button>
                ))}
             </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-pink-500">Foto Aktivitas</h3>
                <span className="text-xs text-gray-400">{photos.length} Foto</span>
             </div>
             <div className="grid grid-cols-2 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-gray-100 relative group overflow-hidden">
                     <img src={p} alt="Activity" className="w-full h-full object-cover" />
                     <button className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all">
                        <X size={10} />
                     </button>
                  </div>
                ))}
                <button 
                  onClick={handlePhotoUpload}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-pink-300 hover:text-pink-400 transition-all"
                >
                   <Camera size={20} />
                   <span className="text-[10px] font-black uppercase">Unggah</span>
                </button>
             </div>
          </div>
        </div>

        {/* Right: Domain Evaluation */}
        <div className="lg:col-span-9 space-y-8">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-10 space-y-10">
             <div className="flex justify-between items-center bg-gray-50/50 p-6 rounded-3xl">
                <div className="flex items-center gap-4">
                   <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-2xl font-bold text-pink-600 border border-pink-50">
                      Z
                   </div>
                   <div>
                      <h2 className="text-xl font-bold text-gray-900 leading-tight">Zianka Azura</h2>
                      <div className="flex items-center gap-2 text-pink-500 text-sm font-bold mt-1">
                         {activities.find(a => a.id === selectedActivity)?.icon}
                         {activities.find(a => a.id === selectedActivity)?.label}
                      </div>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Waktu Observasi</p>
                   <p className="font-bold text-gray-500">Sekarang</p>
                </div>
             </div>

             <div className="space-y-12">
               {evaluations.map((edit) => (
                 <section key={edit.domain} className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                       <Star size={16} className="text-yellow-400" />
                       <h3 className="font-bold text-gray-900">{domains.find(d => d.id === edit.domain)?.label}</h3>
                    </div>

                    <div className="space-y-4 px-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-loose">Tingkat Capaian</label>
                       <div className="flex flex-wrap gap-2">
                          {grades.map((g) => (
                            <button
                              key={g.id}
                              onClick={() => updateGrading(edit.domain, g.id)}
                              className={cn(
                                "px-4 py-2 rounded-2xl text-[10px] font-bold transition-all border shrink-0",
                                edit.grading === g.id 
                                  ? g.color + " shadow-md border-transparent scale-105" 
                                  : "bg-white text-gray-400 border-gray-200 hover:border-pink-200"
                              )}
                            >
                              {g.label}
                            </button>
                          ))}
                       </div>
                       <p className="text-[10px] italic text-gray-400 pl-1 font-medium">
                          {grades.find(g => g.id === edit.grading)?.desc}
                       </p>
                    </div>

                    <div className="space-y-2 px-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan Tambahan (Opsional)</label>
                       <textarea 
                         rows={2}
                         className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-pink-300 transition-all italic text-gray-600"
                         placeholder="Tuliskan momen spesifik atau ucapan berkesan si kecil..."
                         value={edit.notes}
                         onChange={(e) => updateNotes(edit.domain, e.target.value)}
                       />
                    </div>
                 </section>
               ))}
             </div>

             <div className="flex justify-end pt-8 border-t border-gray-50">
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-3 bg-pink-600 hover:bg-pink-700 text-white font-bold px-12 py-4 rounded-3xl shadow-xl shadow-pink-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                  Simpan Hasil Observasi
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
