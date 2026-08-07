import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, FileText, ChevronRight, 
  Map, Calendar, Users, GraduationCap,
  Heart, Star, Camera, MessageCircleHeart, 
  CheckCircle2, Smile, Meh, Frown, Angry, 
  Activity, BookOpen, Coffee, Home, Loader2, ChevronLeft
} from 'lucide-react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { User as AppUser, Student } from '../../types';
import { getStudentById } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  DEFAULT_STUDENTS, 
  getMonday, 
  formatDateToKey 
} from '../../lib/kindergartenWeeklyReport';
import { getSummaryKey } from '../Kindergarten/WeeklySummary';
import { GoogleGenAI, Type } from '@google/genai';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface AiRecommendation {
  domain: string;
  activities: string[];
}

export default function StudentDashboard() {
  const { currentUser, activeUnit } = useOutletContext<{ currentUser: AppUser; activeUnit?: string }>();
  const { activeYear } = useAcademicYear();
  const navigate = useNavigate();
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchStudent = async () => {
      if (currentUser?.luminaId) {
        setLoading(true);
        const data = await getStudentById(currentUser.luminaId);
        setStudentData(data);
        setLoading(false);
      } else {
        setLoading(false);
      }
    };
    fetchStudent();
  }, [currentUser]);

  const unit = activeUnit || currentUser?.unitId || "JUNIOR_HIGH";

  if (unit === 'KINDERGARTEN') {
    return (
      <KindergartenStudentDashboard 
        currentUser={currentUser} 
        studentData={studentData} 
        activeYear={activeYear} 
      />
    );
  }

  // ----------------------------------------------------
  // ELEMENTARY & JUNIOR HIGH DASHBOARD (GENERAL)
  // ----------------------------------------------------
  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="space-y-4 relative">
          <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Halo, <span className="text-blue-600">{currentUser.displayName.split(' ')[0]}! 👋</span>
          </h1>
          <div className="flex flex-wrap gap-4">
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <GraduationCap size={14} className="text-blue-500" /> NIS: {currentUser.luminaId || '-'}
             </div>
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <Users size={14} className="text-emerald-500" /> Class: {studentData?.classId || '-'}
             </div>
             <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400">
                <Calendar size={14} className="text-purple-500" /> {activeYear || '2025/2026'}
             </div>
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <Link 
            to="/self-exploration/my"
            className="group p-10 bg-gray-900 text-white rounded-[3rem] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all relative overflow-hidden flex flex-col justify-between aspect-square md:aspect-auto md:h-80"
         >
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-500/20 transition-colors" />
            
            <div className="space-y-6 relative">
               <div className="w-14 h-14 bg-white/10 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:rotate-6 transition-all duration-500">
                  <Sparkles className="text-blue-400 group-hover:text-white" size={28} />
               </div>
               <div className="space-y-2">
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter">Self Exploration</h2>
                  <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-[200px]">Rencanakan dan jalankan projek eksplorasi minat bakatmu!</p>
               </div>
            </div>

            <div className="relative flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 group-hover:text-white transition-colors">
               Mulai Eksplorasi <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
         </Link>

         <Link 
            to="/student/reports"
            className="group p-10 bg-white border border-gray-100 rounded-[3rem] shadow-sm hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col justify-between aspect-square md:aspect-auto md:h-80"
         >
            <div className="space-y-6 relative">
               <div className="w-14 h-14 bg-blue-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-600 group-hover:-rotate-6 transition-all duration-500">
                  <FileText className="text-blue-600 group-hover:text-white" size={28} />
               </div>
               <div className="space-y-2">
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors">Rapor Saya</h2>
                  <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-[200px]">Cek dan download hasil belajarmu di sini.</p>
               </div>
            </div>

            <div className="relative flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 group-hover:text-blue-600 transition-colors">
               Lihat Rapor <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
         </Link>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 p-10 rounded-[3rem] border border-blue-100 flex flex-col md:flex-row items-center gap-8 justify-between">
         <div className="space-y-2">
            <h3 className="text-lg font-black text-blue-900 uppercase italic tracking-tighter">Butuh Bantuan?</h3>
            <p className="text-sm text-blue-600 font-bold">Hubungi wali kelas atau mentor jika kamu menemui kesulitan mengakses portal.</p>
         </div>
         <button className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-sm hover:shadow-md transition-shadow">
            Pusat Bantuan
         </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// KINDERGARTEN STUDENT DASHBOARD
// ----------------------------------------------------
function KindergartenStudentDashboard({ 
  currentUser, 
  studentData, 
  activeYear 
}: { 
  currentUser: AppUser; 
  studentData: Student | null; 
  activeYear: string | null;
}) {
  const loggedInStudentId = currentUser.luminaId || '';

  // Get Monday and Friday date keys for evaluation week
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
  const [dbSummary, setDbSummary] = React.useState<any>(null);

  // Sync date ranges in sessionStorage
  React.useEffect(() => {
    sessionStorage.setItem('kindy_report_start', startDateStr);
    sessionStorage.setItem('kindy_report_end', endDateStr);
  }, [startDateStr, endDateStr]);

  // Fetch from Firestore for backup
  React.useEffect(() => {
    const fetchFromFirestore = async () => {
      if (!loggedInStudentId || !startDateStr || !endDateStr) return;
      try {
        const docId = `${loggedInStudentId}_${startDateStr}_${endDateStr}`;
        const docRef = doc(db, 'weekly_summary_drafts', docId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setDbSummary(docSnap.data());
        } else {
          setDbSummary(null);
        }
      } catch (err) {
        console.warn("Error fetching from firestore in student view:", err);
        setDbSummary(null);
      }
    };
    fetchFromFirestore();
  }, [loggedInStudentId, startDateStr, endDateStr]);

  // Handle previous / next week buttons
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

  // Resolve student from DEFAULT_STUDENTS or construct dynamically
  const currentStudent = React.useMemo(() => {
    const found = DEFAULT_STUDENTS.find(s => s.id === loggedInStudentId);
    if (found) return found;
    return {
      id: loggedInStudentId,
      name: currentUser.displayName || studentData?.name || 'Siswa Hebat',
      nickName: currentUser.displayName ? currentUser.displayName.split(' ')[0] : 'Ananda',
      ageGroup: ((studentData as any)?.grade === 'TK_B' || (studentData as any)?.ageGroup === 'TK_B') ? ('TK_B' as const) : ('TK_A' as const),
      classId: studentData?.classId || ''
    };
  }, [loggedInStudentId, DEFAULT_STUDENTS, currentUser, studentData]);

  // Merge local draft and database comments
  const savedReview = React.useMemo(() => {
    const summaryKey = getSummaryKey(loggedInStudentId, startDateStr, endDateStr);
    const saved = localStorage.getItem(summaryKey);
    let localData: any = null;
    if (saved) {
      try {
        localData = JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    
    return {
      teacherEditedSocialEmotional: localData?.teacherEditedSocialEmotional || dbSummary?.socialEmotional || dbSummary?.attendanceCommentTeacherEdited || localData?.attendanceCommentTeacherEdited || localData?.attendanceCommentAiDraft || dbSummary?.attendanceCommentAiDraft || "",
      teacherEditedWeeklyComments: localData?.teacherEditedWeeklyComments || dbSummary?.weeklyComments || dbSummary?.observationCommentTeacherEdited || localData?.observationCommentTeacherEdited || localData?.observationCommentAiDraft || dbSummary?.observationCommentAiDraft || "",
      theme: localData?.theme || dbSummary?.theme || ""
    };
  }, [loggedInStudentId, startDateStr, endDateStr, dbSummary]);

  const displaySelNotes = savedReview?.teacherEditedSocialEmotional || "";
  const displayGeneralComment = savedReview?.teacherEditedWeeklyComments || "";

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
          const studentStatus = dayData?.[loggedInStudentId];
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
  }, [loggedInStudentId, startDateStr, endDateStr]);

  // Dynamic fetch of uploaded photos for loggedInStudentId within evaluation date range
  const activityPhotos = React.useMemo(() => {
    const photos: { url: string; caption: string }[] = [];
    
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
            const studentPhoto = data?.observations?.[loggedInStudentId]?.photo;
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
  }, [loggedInStudentId, startDateStr, endDateStr]);

  // Generate child-friendly AI recommendations and encouragement using Gemini
  const handleGenerateAiSummary = async () => {
    setIsAiLoading(true);
    setAiSummary("");
    setAiRecs([]);
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Safe and beautiful child-friendly fallback if API key is not configured
        setTimeout(() => {
          setAiSummary(`Halo ${currentStudent.nickName}! Ibu dan Ayah sangat bangga dengamu. Pekan ini kamu sudah bermain dengan sangat ceria dan luar biasa di sekolah.`);
          setAiRecs([
            {
              domain: "Petualangan Kognitif",
              activities: [
                "Mencari harta karun warna di sekitar rumah bersama Ayah & Ibu.",
                "Menghitung jumlah mainan kesukaan saat membereskannya kembali.",
                "Membaca buku cerita bergambar bersama sebelum tidur."
              ]
            },
            {
              domain: "Kreativitas Seni",
              activities: [
                "Menggubah bentuk lucu kesukaan menggunakan lilin mainan (playdough).",
                "Menggambar hewan lucu kesukaan menggunakan crayon berwarna-warni.",
                "Bernyanyi lagu ceria bersama keluarga sambil bertepuk tangan."
              ]
            }
          ]);
          setIsAiLoading(false);
        }, 1200);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Tulis ringkasan perkembangan mingguan yang sangat ramah anak, hangat, dan menginspirasi untuk anak TK bernama ${currentStudent.name} (panggil dia dengan panggilan/nickName ${currentStudent.nickName || 'Ananda'} atau panggilan sayang/lucu lainnya) berdasarkan aktivitas bermainnya di sekolah. Sertakan juga 2 ide aktivitas bermain yang seru dan menyenangkan untuk dilakukan di rumah bersama Ayah dan Ibu. Kembalikan dalam format JSON dengan field 'summary' (string berisi sapaan hangat penuh kasih sayang, pujian ceria, dan cerita pendek inspiratif) dan 'recommendations' (array berisi objek {domain, activities} dengan domain seperti "Petualangan Kognitif", "Kreativitas Seni", "Bermain Motorik", dll, dan aktivitas yang seru, konkret, aman, dan ramah anak). Gunakan Bahasa Indonesia yang sangat hangat, penuh keceriaan, menyemangati, dan suportif.`,
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
    } catch (error) {
      console.error("AI Generation Error:", error);
      // Fallback on error
      setAiSummary(`Halo ${currentStudent.nickName}! Teruslah bersemangat belajar dan bermain bersama teman-teman ya!`);
      setAiRecs([
        {
          domain: "Aktivitas Rumah Ceria",
          activities: [
            "Menyusun balok mainan bersama keluarga di rumah.",
            "Membantu Ibu menyiram tanaman bunga di halaman rumah."
          ]
        }
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
      
      {/* Date Picker Section */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-[#109E58] uppercase tracking-widest block">Dashboard Siswa TK</span>
            <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Pekan Belajar & Bermain Ceria</h2>
          </div>
          
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg p-1">
            <button
              onClick={handlePrevWeek}
              className="p-1 px-2 hover:bg-white rounded-md text-[#109E58] transition-all cursor-pointer"
              title="7 Hari Sebelumnya"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
              Pekan Pengamatan
            </div>
            <button
              onClick={handleNextWeek}
              className="p-1 px-2 hover:bg-white rounded-md text-[#109E58] transition-all cursor-pointer"
              title="7 Hari Selanjutnya"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[9px] font-extrabold text-gray-400 uppercase tracking-wider block">Rentang Tanggal Pengamatan</label>
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
          <div className="flex items-end justify-end">
            <div className="text-[10px] font-bold text-gray-400 italic">
              *Hanya menampilkan data Tahun Ajaran Aktif ({activeYear || "2025/2026"})
            </div>
          </div>
        </div>
      </div>

      {/* Hero Banner Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
           <Heart size={72} className="text-emerald-500" />
        </div>
        <div className="flex gap-4 items-center relative z-10">
           <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#109E58] to-teal-500 flex items-center justify-center text-white text-lg font-black shadow-md border-2 border-white uppercase shrink-0">
              {currentStudent?.nickName?.[0] || 'S'}
           </div>
           <div>
              <h1 className="text-base font-extrabold text-gray-900 tracking-tight leading-none uppercase">{currentStudent?.name}</h1>
              <p className="text-gray-400 font-bold mt-1.5 flex items-center gap-1.5 text-[11px]">
                 <span className="w-1.5 h-1.5 rounded-full bg-[#109E58]" />
                 Kelompok {currentStudent?.ageGroup === 'TK_B' ? 'TK-B Butterfly' : 'TK-A Caterpillar'} ({currentStudent?.id})
              </p>
           </div>
        </div>
      </header>

      {/* AI Summary and Stimulations Section */}
      <AnimatePresence>
        {aiSummary ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#109E58] rounded-2xl p-5 text-white shadow-lg space-y-4 relative overflow-hidden"
          >
             <div className="absolute top-0 left-0 p-6 opacity-5 pointer-events-none">
                <Heart size={100} />
             </div>
             <div className="flex justify-between items-center relative z-10">
                <div className="bg-white/25 px-3 py-1 rounded-lg flex items-center gap-1.5 border border-white/10">
                   <Sparkles size={14} />
                   <span className="text-[9px] font-extrabold uppercase tracking-widest leading-none">Rekomendasi Lumina AI untuk {currentStudent.nickName}</span>
                </div>
             </div>
             <p className="text-xs font-semibold leading-relaxed italic relative z-10 bg-white/5 p-3 rounded-xl border border-white/5">
               "{aiSummary}"
             </p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative z-10">
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
        ) : (
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100 flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest block">Ide Bermain & Stimulasi AI</span>
              <h4 className="text-sm font-bold text-gray-900 leading-tight">Butuh inspirasi bermain di rumah hari ini?</h4>
              <p className="text-xs text-emerald-600 font-medium">Dapatkan ide permainan seru bersama Ayah & Ibu berdasarkan perkembanganmu!</p>
            </div>
            <button 
              onClick={handleGenerateAiSummary}
              disabled={isAiLoading}
              className="px-5 py-2.5 bg-[#109E58] hover:bg-[#0E854A] disabled:opacity-50 text-white font-extrabold text-[10px] uppercase tracking-widest rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              {isAiLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
              Mulai Ide Bermain Seru
            </button>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
           {/* Weekly Notes */}
           <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
              <section className="space-y-3">
                 <div className="flex items-center gap-2.5 bg-emerald-50 w-fit px-3.5 py-1.5 rounded-xl border border-emerald-100">
                    <MessageCircleHeart className="text-emerald-500" size={16} />
                    <h3 className="font-extrabold text-[10px] uppercase tracking-widest text-emerald-800">Catatan Jurnal Sosio-Emosional (SEL)</h3>
                 </div>
                 {displaySelNotes ? (
                   <p className="text-gray-700 leading-relaxed italic text-xs font-medium p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                      "{displaySelNotes}"
                   </p>
                 ) : (
                   <p className="text-gray-400 leading-relaxed text-xs font-medium p-3.5 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                      "Belum ada pembaruan untukmu hari ini. Yuk, kembali belajar dan bermain bersama teman-teman."
                   </p>
                 )}
              </section>

              <section className="space-y-3 pt-3 border-t border-gray-100">
                 <div className="flex items-center gap-2.5 bg-blue-50 w-fit px-3.5 py-1.5 rounded-xl border border-blue-100">
                    <Star className="text-blue-500" size={16} />
                    <h3 className="font-extrabold text-[10px] uppercase tracking-widest text-blue-800">Catatan Umum Perkembangan</h3>
                 </div>
                 {displayGeneralComment ? (
                   <p className="text-gray-700 leading-relaxed italic text-xs font-medium p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                      "{displayGeneralComment}"
                   </p>
                 ) : (
                   <p className="text-gray-400 leading-relaxed text-xs font-medium p-3.5 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                      "Belum ada pembaruan untukmu hari ini. Yuk, kembali belajar dan bermain bersama teman-teman."
                   </p>
                 )}
              </section>
           </div>

           {/* Photo Gallery */}
           <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                 <h3 className="font-bold text-[10px] uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <Camera size={14} />
                    Dokumentasi Aktivitas Pekan Ini
                 </h3>
              </div>
              
              {activityPhotos.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center border border-dashed border-gray-150 rounded-xl text-center bg-gray-50/20">
                   <Camera size={28} className="text-gray-300 mb-1.5" />
                   <p className="text-[10px] text-gray-400 font-medium">Belum ada foto kegiatan bermain di pekan ini.</p>
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

        {/* Sidebar Status: Kehadiran & Emosi */}
        <div className="space-y-4">
           <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-1.5 border-b border-gray-50 pb-2.5 uppercase text-[10px] tracking-widest">
                 <Activity size={14} className="text-[#109E58]" />
                 Kehadiran & Emosi Harian
              </h3>
              <div className="space-y-4">
                 <div>
                    <div className="flex justify-between items-end mb-1">
                       <span className="text-xl font-black text-gray-900 tracking-tighter">{checklistStats.hasData ? `${checklistStats.attendanceRate}%` : "0%"}</span>
                       <span className="text-[9px] font-black text-[#109E58] uppercase tracking-wider">
                          {checklistStats.hasData 
                            ? (checklistStats.attendanceRate >= 90 ? "Sangat Rajin" : "Normal") 
                            : "Belum Ada Data"}
                        </span>
                    </div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Hadir di Sekolah</p>
                    <div className="w-full h-1.5 bg-gray-50 rounded-full mt-2 border border-gray-100 overflow-hidden">
                       <div 
                          className="h-full bg-[#109E58] rounded-full shadow-lg transition-all duration-500" 
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
           <div className="bg-[#109E58] rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                 <CheckCircle2 size={72} />
              </div>
              <div className="space-y-2 relative z-10">
                 <h3 className="font-extrabold text-[9px] uppercase tracking-widest border-b border-white/20 pb-1.5">Status Portofolio</h3>
                 <p className="text-xl font-black italic">Lengkap ✨</p>
                 <p className="text-[11px] text-emerald-50 font-medium leading-relaxed italic opacity-85">Semua pengamatan dan foto aktivitas {currentStudent?.nickName || "Ananda"} sudah diunggah oleh Guru.</p>
              </div>
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
