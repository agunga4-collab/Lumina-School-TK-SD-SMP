import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, Calendar, TrendingUp, BookOpen, 
  Clock, ShieldAlert, Sparkles, Loader2, 
  ChevronRight, Heart, FileText, CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function StudentProgress() {
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);

  const handleAiSummary = () => {
    setIsAiLoading(true);
    setAiSummary(null);
    setTimeout(() => {
      setAiSummary("Ananda Arka menunjukkan perkembangan yang sangat menggembirakan bulan ini. Dalam Literasi Bahasa Indonesia, ia beranjak ke level Mahir dengan kemampuan menyerap isi bacaan secara detail. Kehadirannya juga sangat terjaga (98%). Fokus pendampingan selanjutnya adalah pada area Numerasi untuk memperkuat konsep dasar pembagian.");
      setIsAiLoading(false);
    }, 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-start">
        <div className="flex gap-4 items-center">
           <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-xl font-black">A</div>
           <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Perkembangan Benaya Arka</h1>
              <p className="text-gray-500 font-medium">Lumina Elementary - Kelas 2-A</p>
           </div>
        </div>
        <button 
           onClick={handleAiSummary}
           disabled={isAiLoading}
           className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold px-6 py-3 rounded-2xl shadow-xl shadow-blue-100 transition-all disabled:opacity-50"
        >
          {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
          Buat Ringkasan untuk Ortu (AI)
        </button>
      </header>

      {/* AI Summary Section */}
      <AnimatePresence>
        {aiSummary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50/50 p-8 rounded-3xl border border-blue-100 space-y-4"
          >
            <div className="flex justify-between items-center bg-white px-4 py-2 rounded-xl border border-blue-100 w-fit">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-500" />
                <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Ringkasan Orang Tua oleh Lumina AI</span>
              </div>
            </div>
            <p className="text-gray-800 leading-relaxed font-medium italic">
              "{aiSummary}"
            </p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Klik untuk edit sebelum dikirim melalui WhatsApp / Pesan</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Academic Progress */}
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-50 pb-4">
                 <BookOpen size={18} className="text-blue-500" />
                 Status Literasi & Numerasi
              </h3>
              <div className="grid grid-cols-2 gap-6">
                 <ProgressItem label="Bahasa Indonesia" level="Level 4" status="Mahir" color="emerald" progress={100} />
                 <ProgressItem label="English Reading" level="Level 3" status="Lancar" color="blue" progress={75} />
                 <ProgressItem label="Mengaji" level="Al-Quran" status="Lancar" color="teal" progress={85} />
                 <ProgressItem label="Numerasi (Math)" level="Level 2" status="Cukup" color="orange" progress={45} />
              </div>
           </div>

           <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-50 pb-4">
                 <FileText size={18} className="text-purple-500" />
                 Log Observasi Terbaru
              </h3>
              <div className="space-y-4">
                 <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black text-blue-500 uppercase">Karakter & Kebiasaan</span>
                       <span className="text-[10px] text-gray-400 font-bold uppercase">20 Apr 2026</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      "Arka sangat antusias saat praktik menanam di kebun sekolah. Ia telaten merawat bibitnya dan dengan senang hati berbagi alat dengan teman sebangkunya."
                    </p>
                 </div>
              </div>
           </div>
        </div>

        {/* Attendance & Character */}
        <div className="space-y-6">
           <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-50 pb-4">
                 <Clock size={18} className="text-orange-500" />
                 Kehadiran Unit SD
              </h3>
              <div className="space-y-6">
                 <div className="flex justify-between items-end">
                    <div>
                       <p className="text-2xl font-black text-gray-900">98%</p>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hadir Bulan Ini</p>
                    </div>
                    <div className="text-right">
                       <p className="text-sm font-bold text-emerald-600 flex items-center gap-1 justify-end">
                          <CheckCircle2 size={12} />
                          Sangat Disiplin
                       </p>
                    </div>
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase">
                       <span>Senin - Jumat</span>
                       <span>Target: 95%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                       <div className="h-full bg-emerald-500 w-[98%] rounded-full" />
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-red-600 rounded-3xl p-8 shadow-xl text-white space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                 <ShieldAlert size={80} />
              </div>
              <h3 className="font-bold text-sm flex items-center gap-2 opacity-80 uppercase tracking-widest">
                 <ShieldAlert size={16} />
                 Status MTSS
              </h3>
              <div>
                 <p className="text-2xl font-black">Aman</p>
                 <p className="text-xs text-red-100 font-medium opacity-80 mt-1">Tidak ada kasus perilaku tercatat periode ini.</p>
              </div>
              <button className="w-full py-3 bg-white text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2 shadow-lg">
                 Laporkan Perilaku Positif
                 <Heart size={14} />
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function ProgressItem({ label, level, status, color, progress }: { label: string; level: string; status: string; color: string; progress: number }) {
  const colors = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    teal: 'bg-teal-500',
    orange: 'bg-orange-500',
  };
  return (
    <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100 space-y-3">
       <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
          <div className="flex justify-between items-baseline mt-1">
             <p className="text-sm font-bold text-gray-900">{level}</p>
             <p className="text-[10px] font-bold text-gray-500 uppercase">{status}</p>
          </div>
       </div>
       <div className="w-full h-1.5 bg-white rounded-full overflow-hidden border border-gray-50">
          <div className={cn("h-full rounded-full transition-all duration-1000", (colors as any)[color])} style={{ width: `${progress}%` }} />
       </div>
    </div>
  );
}
