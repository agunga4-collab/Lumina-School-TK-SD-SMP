import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, BookOpen, Languages, Calculator, 
  Sparkles, Loader2, ChevronRight, History, Star,
  Lightbulb, CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function LiteracySummary() {
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [aiSuggestions, setAiSuggestions] = React.useState<{ [key: string]: string[] } | null>(null);

  const mockProgress: any[] = [];

  const handleAiSuggestions = () => {
    setIsAiLoading(true);
    setAiSuggestions(null);
    setTimeout(() => {
      setAiSuggestions({
        'Bahasa Indonesia': ['Ajak Ananda membaca berita singkat di pagi hari dan ceritakan kembali isinya.', 'Tulis jurnal harian bersama tentang kegiatan favorit di akhir pekan.'],
        'English Reading': ['Tonton film animasi pendek bahasa Inggris tanpa subtitle.', 'Bacakan satu cerita pendek bahasa Inggris setiap malam sebelum tidur.'],
        'Mengaji': ['Dengarkan murottal bersama di kendaraan untuk mengasah hafalan.', 'Berikan tantangan menghafal 1 baris surat baru setiap hari.'],
        'Numerasi (Math)': ['Ajak Ananda menghitung pengeluaran saat belanja di supermarket.', 'Bermain puzzle logika atau catur bersama di rumah.'],
      });
      setIsAiLoading(false);
    }, 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Perkembangan Belajar Ananda</h1>
          <p className="text-gray-500 font-medium">Laporan berkala Literasi & Numerasi - {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date())}</p>
        </div>
        <div className="flex -space-x-2">
           <div className="w-10 h-10 rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-blue-600 font-bold shadow-sm">D</div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockProgress.map((p, idx) => (
          <motion.div
            key={p.area}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-50 rounded-xl">{p.icon}</div>
                  <h3 className="font-bold text-gray-900">{p.area}</h3>
               </div>
               <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest ring-1 ring-blue-100">
                  Level {p.level}
               </div>
            </div>
            <div className="space-y-1">
               <p className="text-sm font-bold text-blue-800">{p.label}</p>
               <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
            </div>
            <div className="pt-2">
               <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(p.level/4)*100}%` }} />
               </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 space-y-8">
        <div className="flex justify-between items-center">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-50 rounded-2xl flex items-center justify-center text-yellow-600 shadow-sm border border-yellow-100">
                 <Lightbulb size={24} />
              </div>
              <div>
                 <h3 className="font-bold text-gray-900">Saran Aktivitas di Rumah</h3>
                 <p className="text-xs text-gray-500">Dihasilkan oleh Lumina AI berdasarkan kebutuhan Ananda</p>
              </div>
           </div>
           <button 
             onClick={handleAiSuggestions}
             disabled={isAiLoading}
             className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
           >
             {isAiLoading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
             Tanya Saran AI
           </button>
        </div>

        <AnimatePresence mode="wait">
          {!aiSuggestions ? (
             <div className="p-12 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                <p className="text-gray-400 font-medium text-sm">Klik tombol di atas untuk melihat ide kegiatan menarik bersama Ananda!</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(Object.entries(aiSuggestions) as [string, string[]][]).map(([area, suggestions], idx) => (
                <motion.div
                  key={area}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="space-y-3"
                >
                  <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">{area}</h4>
                  <ul className="space-y-2">
                    {suggestions.map((s, si) => (
                      <li key={si} className="flex gap-3 text-xs text-gray-600 leading-relaxed bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                        <CheckCircle2 size={14} className="text-blue-500 shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        <div className="pt-6 border-t border-gray-50 flex items-center justify-between">
           <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium italic">
              <History size={12} />
              Riwayat perkembangan lengkap dapat dilihat di Halaman Portofolio
           </div>
           <button className="flex items-center gap-2 text-blue-600 text-xs font-bold hover:underline">
              Beri Tanggapan ke Guru
              <ChevronRight size={14} />
           </button>
        </div>
      </div>
    </div>
  );
}
