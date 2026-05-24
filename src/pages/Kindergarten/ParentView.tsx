import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Heart, Star, Camera, Calendar, 
  MessageCircleHeart, LayoutGrid, CheckCircle2, 
  ChevronRight, Smile, Meh, Frown, Angry, 
  Activity, BookOpen, Coffee, Home, Loader2, Send, Edit3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { KGEmotionStatus } from '../../types';

interface AiRecommendation {
  domain: string;
  activities: string[];
}

import { GoogleGenAI, Type } from '@google/genai';

export default function ParentView() {
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [aiSummary, setAiSummary] = React.useState<string>("");
  const [aiRecs, setAiRecs] = React.useState<AiRecommendation[]>([]);
  const [isEditingAi, setIsEditingAi] = React.useState(false);
  const [showAiLabel, setShowAiLabel] = React.useState(false);

  // Dynamic fetch of weekly review (SEL & General Comment) for K001
  const savedReview = React.useMemo(() => {
    try {
      const saved = localStorage.getItem('kg_weekly_review_K001');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }, []);

  const displaySelNotes = savedReview?.selNotes || "";
  const displayGeneralComment = savedReview?.generalComment || "";

  // Dynamic fetch of attendance & emotion stats from kg_checklist_records
  const checklistStats = React.useMemo(() => {
    const saved = localStorage.getItem('kg_checklist_records');
    let totalDays = 0;
    let presentDays = 0;
    let happy = 0;
    let ok = 0;
    let sad = 0;
    let angry = 0;

    if (saved) {
      try {
        const records = JSON.parse(saved);
        Object.values(records).forEach((dayData: any) => {
          const ziankaStatus = dayData?.['K001'];
          if (ziankaStatus) {
            totalDays++;
            if (ziankaStatus.attendance === 'PRESENT') {
              presentDays++;
              if (ziankaStatus.emotion === 'HAPPY') happy++;
              else if (ziankaStatus.emotion === 'OK') ok++;
              else if (ziankaStatus.emotion === 'SAD') sad++;
              else if (ziankaStatus.emotion === 'ANGRY') angry++;
            }
          }
        });
      } catch (e) {
        console.error(e);
      }
    }

    const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
    
    return {
      attendanceRate,
      presentDays,
      totalDays,
      happy,
      ok,
      sad,
      angry,
      hasData: totalDays > 0
    };
  }, []);

  // Dynamic fetch of uploaded photos for K001 from all sessions
  const activityPhotos = React.useMemo(() => {
    const photos: { url: string; caption: string }[] = [];
    
    // Constant mappings to support captions
    const sentraLabels: Record<string, string> = {
      'MAKE_BELIEVE': 'Make-Believe',
      'ISLAMIC_AWARENESS': 'Islamic Awareness',
      'LIBRARY_LITERACY': 'Library & Literacy',
      'DISCOVERY': 'Discovery',
      'BLOCKS_BUILDING': 'Blocks & Building',
      'ART_EXPLORATIONS': 'Art Explorations',
      'ENGLISH': 'English',
      'MUSIC': 'Music',
      'OUTSIDE': 'Outside',
      'AUDIO_VISUAL': 'Audio Visual',
    };

    const domainLabels: Record<string, string> = {
      'AGAMA_BUDI_PEKERTI': 'Nilai Agama',
      'SOSIAL_EMOSIONAL': 'Sosial-Emosional',
      'BAHASA': 'Bahasa',
      'KOGNITIF': 'Kognitif',
      'FISIK_MOTORIK': 'Fisik-Motorik',
      'SENI': 'Seni',
    };

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_obs_hist_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          const studentPhoto = data?.observations?.['K001']?.photo;
          const fallbackPhoto = data?.generalPhoto;
          const finalPhoto = studentPhoto || fallbackPhoto;
          
          if (finalPhoto) {
            const sentraId = data.selectedActivity;
            const domainId = data.selectedDomain;
            const sentraName = sentraLabels[sentraId] || sentraId || "Aktivitas";
            const domainName = domainLabels[domainId] || domainId || "Sentra";
            
            photos.push({
              url: finalPhoto,
              caption: `${sentraName} - ${domainName}`
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
    
    return photos;
  }, []);

  const handleGenerateAiSummary = async () => {
    setIsAiLoading(true);
    setAiSummary("");
    setAiRecs([]);
    setShowAiLabel(false);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Tulis ringkasan perkembangan untuk orang tua anak TK bernama Zianka. Sertakan 3 rekomendasi aktivitas di rumah. Kembalikan dalam JSON format dengan field 'summary' (string) dan 'recommendations' (array of {domain, activities}).",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    domain: { type: Type.STRING },
                    activities: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["domain", "activities"]
                }
              }
            },
            required: ["summary", "recommendations"]
          }
        }
      });
      
      const resData = JSON.parse(response.text || '{}');
      setAiSummary(resData.summary || "");
      setAiRecs(resData.recommendations || []);
      setIsEditingAi(true);
      setShowAiLabel(true);
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };


  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-[2.5rem] border border-emerald-50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Heart size={100} className="text-emerald-500" />
        </div>
        <div className="flex gap-6 items-center relative z-10">
           <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-emerald-100 border-4 border-white">
              Z
           </div>
           <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none italic">Zianka Azura</h1>
              <p className="text-gray-500 font-bold mt-2 flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-emerald-500" />
                 Lumina Kindergarten • Kelompok B1
              </p>
           </div>
        </div>
        <button 
          onClick={handleGenerateAiSummary}
          disabled={isAiLoading}
          className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white font-black text-xs uppercase tracking-widest px-8 py-4 rounded-3xl shadow-xl shadow-emerald-100 hover:scale-105 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3 relative z-10"
        >
          {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
          Buat Ringkasan Progress (AI)
        </button>
      </header>

      <AnimatePresence>
        {aiSummary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-700 rounded-[3rem] p-10 text-white shadow-2xl shadow-emerald-100 space-y-8 relative overflow-hidden"
          >
             <div className="absolute top-0 left-0 p-10 opacity-10">
                <Heart size={150} />
             </div>
             <div className="flex justify-between items-start relative z-10">
                <div className="bg-white/20 px-5 py-2 rounded-2xl flex items-center gap-2 border border-white/20">
                   <Sparkles size={18} />
                   <span className="text-[10px] font-black uppercase tracking-widest leading-none">Pesan Cinta dari Lumina AI</span>
                </div>
                {aiSummary && (
                   <button 
                     onClick={() => setIsEditingAi(!isEditingAi)}
                     className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all"
                   >
                     {isEditingAi ? <CheckCircle2 size={18} /> : <Edit3 size={18} />}
                   </button>
                )}
             </div>
             {isEditingAi ? (
               <textarea
                 value={aiSummary}
                 onChange={(e) => setAiSummary(e.target.value)}
                 className="w-full bg-white/10 border border-white/30 rounded-3xl p-6 text-xl font-bold leading-relaxed italic text-white outline-none focus:ring-2 focus:ring-white/50"
                 rows={4}
               />
             ) : (
               <p className="text-xl font-bold leading-relaxed italic relative z-10">
                 "{aiSummary}"
               </p>
             )}
             {showAiLabel && (
               <p className="text-[10px] font-bold text-emerald-200 italic mt-2 relative z-10">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
             )}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                {aiRecs.map((rec, i) => (
                  <div key={i} className="bg-white/10 rounded-3xl p-6 border border-white/15 backdrop-blur-sm space-y-4">
                     <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                        <Home size={16} className="text-emerald-100" />
                        <h4 className="font-black text-[10px] uppercase tracking-widest">{rec.domain}</h4>
                     </div>
                     <ul className="space-y-3">
                        {rec.activities.map((act, j) => (
                          <li key={j} className="flex gap-3 text-xs font-bold leading-snug">
                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-100 mt-1 shrink-0" />
                             {act}
                          </li>
                        ))}
                     </ul>
                  </div>
                ))}
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
           {/* Weekly Notes */}
           <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-8">
              <section className="space-y-6">
                 <div className="flex items-center gap-4 bg-emerald-50 w-fit px-6 py-2 rounded-2xl border border-emerald-100">
                    <MessageCircleHeart className="text-emerald-500" size={20} />
                    <h3 className="font-black text-xs uppercase tracking-widest text-emerald-800">Weekly SEL Notes</h3>
                 </div>
                 <p className="text-gray-700 leading-relaxed italic font-medium p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    {displaySelNotes ? `"${displaySelNotes}"` : "Belum ada catatan jurnal perkembangan sosial-emosional minggu ini dari guru."}
                 </p>
              </section>

              <section className="space-y-6 pt-4 border-t border-gray-50">
                 <div className="flex items-center gap-4 bg-blue-50 w-fit px-6 py-2 rounded-2xl border border-blue-100">
                    <Star className="text-blue-500" size={20} />
                    <h3 className="font-black text-xs uppercase tracking-widest text-blue-800">Weekly General Comment</h3>
                 </div>
                 <p className="text-gray-700 leading-relaxed italic font-medium p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    {displayGeneralComment ? `"${displayGeneralComment}"` : "Belum ada catatan umum perkembangan minggu ini dari guru."}
                 </p>
              </section>
           </div>

           {/* Photo Gallery */}
           <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6">
              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                 <h3 className="font-black text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Camera size={18} />
                    Galeri Aktivitas Pekan Ini
                 </h3>
                 <span className="text-[10px] font-black text-emerald-500">LIHAT SEMUA</span>
              </div>
              
              {activityPhotos.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center border border-dashed border-gray-150 rounded-3xl text-center bg-gray-50/20">
                   <Camera size={36} className="text-gray-300 mb-2" />
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Belum ada foto kegiatan pekan ini</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                   {activityPhotos.map((p, i) => (
                     <motion.div 
                       key={i} 
                       whileHover={{ scale: 1.05 }}
                       className="aspect-square rounded-3xl bg-gray-50 overflow-hidden relative group cursor-pointer border border-gray-100"
                     >
                       <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <p className="text-white text-[10px] font-bold uppercase tracking-widest leading-tight">{p.caption}</p>
                       </div>
                     </motion.div>
                   ))}
                </div>
              )}
           </div>
        </div>

        {/* Sidebar Status */}
        <div className="space-y-8">
           <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-50 pb-4 uppercase text-[10px] tracking-widest">
                 <Activity size={18} className="text-emerald-600" />
                 Kehadiran & Emosi
              </h3>
              <div className="space-y-6">
                 <div>
                    <div className="flex justify-between items-end mb-2">
                       <span className="text-2xl font-black text-gray-900 tracking-tighter">{checklistStats.hasData ? `${checklistStats.attendanceRate}%` : "0%"}</span>
                       <span className="text-[10px] font-black text-emerald-500 uppercase">
                          {checklistStats.hasData 
                            ? (checklistStats.attendanceRate >= 90 ? "Sangat Rajin" : "Normal") 
                            : "Belum Ada Data"}
                        </span>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hadir di Sekolah</p>
                    <div className="w-full h-2 bg-gray-50 rounded-full mt-3 border border-gray-100 overflow-hidden">
                       <div 
                          className="h-full bg-emerald-500 rounded-full shadow-lg transition-all duration-500" 
                          style={{ width: `${checklistStats.hasData ? checklistStats.attendanceRate : 0}%` }}
                        />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <EmotionMiniStat icon={<Smile className="text-yellow-400" />} label="Happy" count={checklistStats.happy} />
                    <EmotionMiniStat icon={<Meh className="text-emerald-400" />} label="OK" count={checklistStats.ok} />
                 </div>
              </div>
           </div>

           <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <CheckCircle2 size={100} />
              </div>
              <div className="space-y-4 relative z-10">
                 <h3 className="font-black text-[10px] uppercase tracking-widest border-b border-white/20 pb-2">Status Portofolio</h3>
                 <p className="text-2xl font-black italic">Lengkap ✨</p>
                 <p className="text-xs text-emerald-50 font-medium leading-relaxed italic opacity-80">Semua observasi dan foto aktivitas Zianka sudah diunggah oleh Guru.</p>
              </div>
              <button className="w-full py-4 mt-6 bg-white text-emerald-700 font-black rounded-3xl text-[10px] shadow-xl hover:bg-emerald-50 transition-all uppercase tracking-widest">
                 Lihat Full Portofolio
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function EmotionMiniStat({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="bg-gray-50 p-4 rounded-3xl border border-gray-100 flex flex-col items-center gap-2">
       {icon}
       <span className="text-lg font-black text-gray-900">{count}</span>
       <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{label}</span>
    </div>
  );
}
