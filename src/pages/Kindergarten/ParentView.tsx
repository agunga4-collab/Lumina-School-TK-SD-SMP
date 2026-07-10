import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Heart, Star, Camera, Calendar, 
  MessageCircleHeart, LayoutGrid, CheckCircle2, 
  ChevronRight, Smile, Meh, Frown, Angry, 
  Activity, BookOpen, Coffee, Home, Loader2, Send, Edit3, ChevronLeft
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { KGEmotionStatus } from '../../types';
import { 
  DEFAULT_STUDENTS, 
  getMonday, 
  formatDateToKey 
} from '../../lib/kindergartenWeeklyReport';
import { getSummaryKey } from './WeeklySummary';

interface AiRecommendation {
  domain: string;
  activities: string[];
}

import { GoogleGenAI, Type } from '@google/genai';

export default function ParentView() {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('K001');

  // Load start and end date from sessionStorage or use current week's Mon-Fri
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    const fromSession = sessionStorage.getItem('kindy_report_start');
    if (fromSession) return fromSession;
    const mon = getMonday(new Date());
    return formatDateToKey(mon);
  });
  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
    const fromSession = sessionStorage.getItem('kindy_report_end');
    if (fromSession) return fromSession;
    const mon = getMonday(new Date());
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return formatDateToKey(fri);
  });

  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [aiSummary, setAiSummary] = React.useState<string>("");
  const [aiRecs, setAiRecs] = React.useState<AiRecommendation[]>([]);
  const [isEditingAi, setIsEditingAi] = React.useState(false);
  const [showAiLabel, setShowAiLabel] = React.useState(false);

  const currentStudent = React.useMemo(() => {
    return DEFAULT_STUDENTS.find(s => s.id === selectedStudentId) || DEFAULT_STUDENTS[0] || {
      id: '',
      name: 'Belum Ada Siswa',
      nickName: 'Ananda',
      ageGroup: 'TK_A' as const
    };
  }, [selectedStudentId]);

  // Sync date ranges in sessionStorage
  React.useEffect(() => {
    sessionStorage.setItem('kindy_report_start', startDateStr);
    sessionStorage.setItem('kindy_report_end', endDateStr);
  }, [startDateStr, endDateStr]);

  // Dynamic fetch of weekly review (SEL & General Comment) from the actual teacher's review store
  const savedReview = React.useMemo(() => {
    try {
      const summaryKey = getSummaryKey(selectedStudentId, startDateStr, endDateStr);
      const saved = localStorage.getItem(summaryKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }, [selectedStudentId, startDateStr, endDateStr]);

  const displaySelNotes = savedReview?.teacherEditedSocialEmotional || savedReview?.attendanceCommentTeacherEdited || savedReview?.attendanceCommentAiDraft || "";
  const displayGeneralComment = savedReview?.teacherEditedWeeklyComments || savedReview?.observationCommentTeacherEdited || savedReview?.observationCommentAiDraft || "";
  const displayTheme = savedReview?.theme || "";

  // Dynamic fetch of attendance & emotion stats from kg_checklist_records matching our dates & studentId
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
        
        // Generate list of date strings in current period
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        const temp = new Date(start);
        const datesInPeriod: string[] = [];
        
        while (temp <= end) {
          datesInPeriod.push(formatDateToKey(temp));
          temp.setDate(temp.getDate() + 1);
        }

        datesInPeriod.forEach(dateKey => {
          const dayData = records[dateKey];
          const studentStatus = dayData?.[selectedStudentId];
          if (studentStatus) {
            totalDays++;
            if (studentStatus.attendance === 'PRESENT') {
              presentDays++;
              if (studentStatus.emotion === 'HAPPY') happy++;
              else if (studentStatus.emotion === 'OK') ok++;
              else if (studentStatus.emotion === 'SAD') sad++;
              else if (studentStatus.emotion === 'ANGRY') angry++;
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
  }, [selectedStudentId, startDateStr, endDateStr]);

  // Dynamic fetch of uploaded photos for selectedStudentId within our active period dates
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

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const startTs = start.setHours(0,0,0,0);
    const endTs = end.setHours(23,59,59,999);

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_obs_hist_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          const obsTimestamp = data.timestamp || Date.now();
          if (obsTimestamp >= startTs && obsTimestamp <= endTs) {
            const studentPhoto = data?.observations?.[selectedStudentId]?.photo;
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
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
    
    return photos;
  }, [selectedStudentId, startDateStr, endDateStr]);

  const handlePrevWeek = () => {
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      s.setDate(s.getDate() - 7);
      e.setDate(e.getDate() - 7);
      setStartDateStr(formatDateToKey(s));
      setEndDateStr(formatDateToKey(e));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNextWeek = () => {
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      s.setDate(s.getDate() + 7);
      e.setDate(e.getDate() + 7);
      setStartDateStr(formatDateToKey(s));
      setEndDateStr(formatDateToKey(e));
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateAiSummary = async () => {
    setIsAiLoading(true);
    setAiSummary("");
    setAiRecs([]);
    setShowAiLabel(false);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Tulis ringkasan perkembangan untuk orang tua anak TK bernama ${currentStudent.name}. Sertakan 3 rekomendasi aktivitas di rumah. Kembalikan dalam JSON format dengan field 'summary' (string) dan 'recommendations' (array of {domain, activities}).`,
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
    <div className="max-w-4xl mx-auto space-y-4 pb-12">
      
      {/* Dynamic Controls Header: Student Picker & Date filter */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest block">Portal Orang Tua</span>
            <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Pilih Siswa & Rentang Tanggal</h2>
          </div>
          
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg p-1">
            <button
              onClick={handlePrevWeek}
              className="p-1 px-2 hover:bg-white rounded-md text-emerald-800 transition-all cursor-pointer"
              title="7 Hari Sebelumnya"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
              Pekan Evaluasi
            </div>
            <button
              onClick={handleNextWeek}
              className="p-1 px-2 hover:bg-white rounded-md text-emerald-800 transition-all cursor-pointer"
              title="7 Hari Selanjutnya"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[9px] font-extrabold text-gray-400 uppercase tracking-wider block">Pilih Nama Anak Hebat</label>
            <div className="flex flex-wrap gap-1">
              {DEFAULT_STUDENTS.map(s => {
                const isSelected = s.id === selectedStudentId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudentId(s.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer",
                      isSelected 
                        ? "bg-[#109E58] text-white border-transparent shadow-sm"
                        : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-extrabold text-gray-400 uppercase tracking-wider block">Rencana Tanggal Pengamatan</label>
            <div className="grid grid-cols-2 gap-2">
              <input 
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none text-gray-700 focus:border-emerald-300"
              />
              <input 
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none text-gray-700 focus:border-emerald-300"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hero Banner Header: Slimmer & Compact */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
           <Heart size={72} className="text-emerald-500" />
        </div>
        <div className="flex gap-4 items-center relative z-10">
           <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center text-white text-lg font-black shadow-md border-2 border-white uppercase shrink-0">
              {currentStudent?.nickName?.[0] || 'S'}
           </div>
           <div>
              <h1 className="text-base font-extrabold text-gray-900 tracking-tight leading-none uppercase">{currentStudent?.name}</h1>
              <p className="text-gray-400 font-bold mt-1.5 flex items-center gap-1.5 text-[11px]">
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                 Kelompok {currentStudent?.ageGroup === 'TK_B' ? 'TK-B Butterfly' : 'TK-A Caterpillar'} ({currentStudent?.id})
              </p>
           </div>
        </div>
        <button 
          onClick={handleGenerateAiSummary}
          disabled={isAiLoading}
          className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white font-extrabold text-[10px] uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 relative z-10 cursor-pointer shrink-0"
        >
          {isAiLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
          Buat Ringkasan Progress (AI)
        </button>
      </header>

      {/* AI Summary Section: Compact */}
      <AnimatePresence>
        {aiSummary && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-800 rounded-2xl p-5 text-white shadow-lg space-y-4 relative overflow-hidden"
          >
             <div className="absolute top-0 left-0 p-6 opacity-5 pointer-events-none">
                <Heart size={100} />
             </div>
             <div className="flex justify-between items-center relative z-10">
                <div className="bg-white/25 px-3 py-1 rounded-lg flex items-center gap-1.5 border border-white/10">
                   <Sparkles size={14} />
                   <span className="text-[9px] font-extrabold uppercase tracking-widest leading-none">Rekomendasi Lumina AI</span>
                </div>
                {aiSummary && (
                   <button 
                     onClick={() => setIsEditingAi(!isEditingAi)}
                     className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30 transition-all"
                   >
                     {isEditingAi ? <CheckCircle2 size={14} /> : <Edit3 size={14} />}
                   </button>
                )}
             </div>
             {isEditingAi ? (
                <textarea
                  value={aiSummary}
                  onChange={(e) => setAiSummary(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-xs font-medium leading-relaxed italic text-white outline-none focus:ring-1 focus:ring-white/40"
                  rows={3}
                />
             ) : (
                <p className="text-xs font-semibold leading-relaxed italic relative z-10 bg-white/5 p-3 rounded-xl border border-white/5">
                  "{aiSummary}"
                </p>
             )}
             {showAiLabel && (
                <p className="text-[9px] font-bold text-emerald-200 italic mt-1 relative z-10">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
             )}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-3 relative z-10">
                 {aiRecs.map((rec, i) => (
                   <div key={i} className="bg-white/10 rounded-xl p-3 border border-white/10 backdrop-blur-sm space-y-2">
                      <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5">
                         <Home size={12} className="text-emerald-100" />
                         <h4 className="font-extrabold text-[9px] uppercase tracking-widest">{rec.domain}</h4>
                      </div>
                      <ul className="space-y-1.5">
                         {rec.activities.map((act, j) => (
                           <li key={j} className="flex gap-1.5 text-[11px] font-medium leading-normal">
                              <span className="w-1 h-1 rounded-full bg-emerald-100 mt-1.5 shrink-0" />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
           {/* Weekly Notes: Compact */}
           <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
              <section className="space-y-3">
                 <div className="flex items-center gap-2.5 bg-emerald-50 w-fit px-3.5 py-1.5 rounded-xl border border-emerald-100">
                    <MessageCircleHeart className="text-emerald-500" size={16} />
                    <h3 className="font-extrabold text-[10px] uppercase tracking-widest text-emerald-800">Weekly SEL Notes</h3>
                 </div>
                 <p className="text-gray-700 leading-relaxed italic text-xs font-medium p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    {displaySelNotes ? `"${displaySelNotes}"` : "Belum ada catatan jurnal perkembangan sosial-emosional minggu ini dari guru."}
                 </p>
              </section>

              <section className="space-y-3 pt-3 border-t border-gray-100">
                 <div className="flex items-center gap-2.5 bg-blue-50 w-fit px-3.5 py-1.5 rounded-xl border border-blue-100">
                    <Star className="text-blue-500" size={16} />
                    <h3 className="font-extrabold text-[10px] uppercase tracking-widest text-blue-800">Weekly General Comment</h3>
                 </div>
                 <p className="text-gray-700 leading-relaxed italic text-xs font-medium p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    {displayGeneralComment ? `"${displayGeneralComment}"` : "Belum ada catatan umum perkembangan minggu ini dari guru."}
                 </p>
              </section>
           </div>

           {/* Photo Gallery: Compact */}
           <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                 <h3 className="font-bold text-[10px] uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <Camera size={14} />
                    Galeri Aktivitas Pekan Ini
                 </h3>
                 <span className="text-[9px] font-extrabold text-emerald-600 tracking-wider">LIHAT SEMUA</span>
              </div>
              
              {activityPhotos.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center border border-dashed border-gray-150 rounded-xl text-center bg-gray-50/20">
                   <Camera size={28} className="text-gray-300 mb-1.5" />
                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Belum ada foto kegiatan pekan ini</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                   {activityPhotos.map((p, i) => (
                     <motion.div 
                       key={i} 
                       whileHover={{ scale: 1.03 }}
                       className="aspect-square rounded-xl bg-gray-50 overflow-hidden relative group cursor-pointer border border-gray-100"
                     >
                       <img src={p.url} alt={p.caption} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                       <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                          <p className="text-white text-[9px] font-bold uppercase tracking-widest leading-tight">{p.caption}</p>
                       </div>
                     </motion.div>
                   ))}
                </div>
              )}
           </div>
        </div>

        {/* Sidebar Status: Compact */}
        <div className="space-y-4">
           <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-1.5 border-b border-gray-50 pb-2.5 uppercase text-[10px] tracking-widest">
                 <Activity size={14} className="text-emerald-600" />
                 Kehadiran & Emosi
              </h3>
              <div className="space-y-4">
                 <div>
                    <div className="flex justify-between items-end mb-1">
                       <span className="text-xl font-black text-gray-900 tracking-tighter">{checklistStats.hasData ? `${checklistStats.attendanceRate}%` : "0%"}</span>
                       <span className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">
                          {checklistStats.hasData 
                            ? (checklistStats.attendanceRate >= 90 ? "Sangat Rajin" : "Normal") 
                            : "Belum Ada Data"}
                        </span>
                    </div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Hadir di Sekolah</p>
                    <div className="w-full h-1.5 bg-gray-50 rounded-full mt-2 border border-gray-100 overflow-hidden">
                       <div 
                          className="h-full bg-emerald-500 rounded-full shadow-lg transition-all duration-500" 
                          style={{ width: `${checklistStats.hasData ? checklistStats.attendanceRate : 0}%` }}
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-2">
                    <EmotionMiniStat icon={<Smile className="text-yellow-400" size={16} />} label="Happy" count={checklistStats.happy} />
                    <EmotionMiniStat icon={<Meh className="text-emerald-400" size={16} />} label="OK" count={checklistStats.ok} />
                 </div>
              </div>
           </div>

           {/* Portfolio status block */}
           <div className="bg-emerald-600 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                 <CheckCircle2 size={72} />
              </div>
              <div className="space-y-2 relative z-10">
                 <h3 className="font-extrabold text-[9px] uppercase tracking-widest border-b border-white/20 pb-1.5">Status Portofolio</h3>
                 <p className="text-xl font-black italic">Lengkap ✨</p>
                 <p className="text-[11px] text-emerald-50 font-medium leading-relaxed italic opacity-85">Semua observasi dan foto aktivitas {currentStudent?.nickName || currentStudent?.name || "Ananda"} sudah diunggah oleh Guru.</p>
              </div>
              <button className="w-full py-2.5 mt-4 bg-white text-emerald-700 font-extrabold rounded-xl text-[9px] shadow hover:bg-emerald-50 transition-all uppercase tracking-widest">
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
    <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex flex-col items-center gap-1">
       {icon}
       <span className="text-sm font-black text-gray-900 leading-none">{count}</span>
       <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight leading-none">{label}</span>
    </div>
  );
}
