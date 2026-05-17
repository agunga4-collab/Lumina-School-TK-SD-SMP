import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { 
  ChevronLeft, ChevronRight, Calendar, User, Clock, ShieldAlert, 
  FileText, Plus, Sparkles, Loader2, Check,
  MessageSquare, History, Activity, Lock, ExternalLink,
  ClipboardList, TrendingUp, AlertTriangle, Star, CheckCircle2,
  Trash2, Download, MoreVertical, ShieldCheck, UserCircle, Info, BookOpen,
  Cloud, RefreshCw
} from 'lucide-react';
import { formatDate, cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  updateMTSSCase, 
  getMTSSConcerns, 
  getBIPPlan, 
  db, 
  handleFirestoreError, 
  getCICODailyReport, 
  getCICODailyReports,
  getBehaviorNotifications
} from '../../lib/firebase';
import { getBehaviorStudentAcademicContext } from '../../services/mtssAcademicContextService';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { AddDataForm, Tier2MeetingForm, CloseCaseForm } from '../../components/MTSS/BehaviorForms';
import { CICOInputForm } from '../../components/MTSS/CICOInputForm';
import { CICOWeeklyReflectionModal } from '../../components/MTSS/CICOWeeklyReflection';
import { 
  generateWeeklyCICOReport, 
  generateFullCICOReport, 
  generateCaseSummaryReport 
} from '../../services/pdfService';
import { mtssBehaviorRegisterService } from '../../services/mtssBehaviorRegisterService';
import { mtssBehaviorDriveService } from '../../services/mtssBehaviorDriveService';
import { MTSSBehaviorPdfType } from '../../types';
import type { MTSSCase, MTSSConcern, MTSSStatus, MTSSTier, BIPPlan, CICODailyReport } from '../../types';
import { GoogleGenAI, Type } from '@google/genai';

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [mtssCase, setMtssCase] = React.useState<MTSSCase | null>(null);
  const [concerns, setConcerns] = React.useState<MTSSConcern[]>([]);
  const [bipPlan, setBipPlan] = React.useState<BIPPlan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeAlerts, setActiveAlerts] = React.useState<any[]>([]);
  const [isAiLoading, setIsAiLoading] = React.useState(false);

  React.useEffect(() => {
    if (!id || !profile) return;
    const loadAlerts = async () => {
      const data = await getBehaviorNotifications(profile.uid);
      setActiveAlerts(data.filter(n => n.caseId === id));
    };
    loadAlerts();
  }, [id, profile]);
  const [aiAnalysis, setAiAnalysis] = React.useState<{ tier: string; steps: string } | null>(null);

  // Modal States
  const [showAddDataModal, setShowAddDataModal] = React.useState(false);
  const [showTier2MeetingModal, setShowTier2MeetingModal] = React.useState(false);
  const [showCloseCaseModal, setShowCloseCaseModal] = React.useState(false);
  const [showCicoInputModal, setShowCicoInputModal] = React.useState(false);
  const [showWeeklyReflectionModal, setShowWeeklyReflectionModal] = React.useState(false);
  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'concerns' | 'cico' | 'bip' | 'home-programme'>('overview');

  const [todayReport, setTodayReport] = React.useState<CICODailyReport | null>(null);
  const [allCicoReports, setAllCicoReports] = React.useState<CICODailyReport[]>([]);
  const [academicContext, setAcademicContext] = React.useState<any>(null);
  const [archiving, setArchiving] = React.useState<string | null>(null);

  const handleManualSyncRegister = async () => {
    if (!mtssCase) return;
    setArchiving('register');
    try {
      await mtssBehaviorRegisterService.syncCase(mtssCase, 'MANUAL');
    } catch (err) {
      console.error(err);
    } finally {
      setArchiving(null);
    }
  };

  const handleManualSyncSnapshot = async () => {
    if (!mtssCase) return;
    setArchiving('snapshot');
    try {
      const result = await mtssBehaviorDriveService.syncSnapshot(mtssCase.id);
      if (result.success) {
        toast.success('Snapshot synced successfully');
      } else {
        toast.error(`Snapshot failed: ${result.error}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Sync failed');
    } finally {
      setArchiving(null);
    }
  };

  const handleManualArchivePdf = async (type: MTSSBehaviorPdfType) => {
    if (!mtssCase) return;
    setArchiving(type);
    try {
      // Simulate PDF generation or use service to trigger archive
      await mtssBehaviorDriveService.archivePdf(mtssCase.id, {
        type,
        fileName: `${type}_MANUAL_ARCHIVE.pdf`,
        generatedBy: profile?.name || 'Admin',
        version: (mtssCase.latestArchiveVersion || 0) + 1
      });
    } catch (err) {
      console.error(err);
    } finally {
      setArchiving(null);
    }
  };

  // Home Programme states
  const [hpMotivation, setHpMotivation] = React.useState('');
  const [hpIsVisible, setHpIsVisible] = React.useState(true);

  const isCounselorPlus = profile && ['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'].includes(profile.role);

  React.useEffect(() => {
    if (!id) return;

    const todayDate = new Date().toISOString().split('T')[0];
    const fetchReports = async () => {
      const today = await getCICODailyReport(id, todayDate);
      setTodayReport(today);
      
      const all = await getCICODailyReports(id);
      setAllCicoReports(all || []);
    };

    fetchReports();
  }, [id, showCicoInputModal]);

  React.useEffect(() => {
    if (!id) return;

    const unsubscribeCase = onSnapshot(doc(db, 'behaviorCases', id), async (snapshot) => {
      if (snapshot.exists()) {
        const caseData = { id: snapshot.id, ...snapshot.data() } as MTSSCase;
        setMtssCase(caseData);
        setLoading(false);

        // Fetch academic context
        getBehaviorStudentAcademicContext(caseData.studentId).then(setAcademicContext);
        
        // Also refresh concerns since we are already listening to the case doc
        // (Wait, concerns is a subcollection in some designs, or separate. 
        //  The previous code was listening to the SAME doc to trigger a getMTSSConcerns call.)
        const concernsData = await getMTSSConcerns(id);
        setConcerns(concernsData || []);
      } else {
        setLoading(false);
      }
    }, (error) => {
      handleFirestoreError(error, 'get', `behaviorCases/${id}`);
    });

    return () => {
      unsubscribeCase();
    };
  }, [id]);

  React.useEffect(() => {
    const fetchBIP = async () => {
      if (!id || !mtssCase) return;
      if (profile?.role !== 'TEACHER' || mtssCase.tier === 'Tier 1') {
        const plan = await getBIPPlan(id);
        setBipPlan(plan);
      }
    };
    fetchBIP();
  }, [id, mtssCase?.tier, profile?.role]);

  React.useEffect(() => {
    if (mtssCase?.homeProgramme) {
      setHpMotivation(mtssCase.homeProgramme.motivationMessage || '');
      setHpIsVisible(mtssCase.homeProgramme.isVisibleToParent);
    }
  }, [mtssCase]);

  const handleSaveHomeProgramme = async () => {
    if (!id || !mtssCase) return;
    try {
      await updateMTSSCase(id, {
        homeProgramme: {
          ...mtssCase.homeProgramme,
          motivationMessage: hpMotivation,
          isVisibleToParent: hpIsVisible,
          publishedWeeks: mtssCase.homeProgramme?.publishedWeeks || []
        }
      });
    } catch (err) {
      console.error("Error updating home programme:", err);
    }
  };

  const handleExport = async (type: 'weekly' | 'full' | 'case') => {
    if (!mtssCase) return;
    setShowExportMenu(false);
    
    if (type === 'weekly') {
      const currentWeek = todayReport?.weekNumber || 1;
      const weekReports = allCicoReports.filter(r => r.weekNumber === currentWeek);
      await generateWeeklyCICOReport(mtssCase, weekReports, currentWeek);
    } else if (type === 'full') {
      await generateFullCICOReport(mtssCase, allCicoReports);
    } else if (type === 'case') {
      await generateCaseSummaryReport(mtssCase, concerns);
    }
  };

  const handleAiAnalysis = async () => {
    if (!mtssCase) return;
    setIsAiLoading(true);
    setAiAnalysis(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Analisis Kasus MTSS - Siswa: ${mtssCase.studentName}, Tier Saat Ini: ${mtssCase.tier}, Status: ${mtssCase.status}.
      Konteks: SMP Lazuardi (Positive Discipline).
      Data Kejadian Terakhir: "${mtssCase.lastConcernSummary}".
      Berdasarkan data tersebut, berikan rekomendasi teknis:
      1. Apakah perlu eskalasi tier?
      2. 3 Langkah intervensi konkret berikutnya.
      
      Kembalikan dalam JSON dengan field: 'tier' (rekomendasi tier baru/tetap), 'steps' (string narasi langkah).`;
      
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tier: { type: Type.STRING },
              steps: { type: Type.STRING }
            },
            required: ["tier", "steps"]
          }
        }
      });
      
      const resData = JSON.parse(response.text || '{}');
      setAiAnalysis({
        tier: resData.tier || mtssCase.tier,
        steps: resData.steps || ''
      });
    } catch (error) {
      console.error("AI Error:", error);
      setAiAnalysis({
        tier: mtssCase.tier,
        steps: "Gagal memproses analisis AI. Silakan tinjau data secara manual."
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const isTeacher = profile?.role === 'TEACHER';
  const isCounselor = profile?.role === 'BK_MENTOR' || profile?.role === 'HEAD_JUNIOR' || profile?.role === 'SUPER_ADMIN';
  const canSeeTier3 = isCounselor;
  const canDelete = profile?.role === 'HEAD_JUNIOR' || profile?.role === 'SUPER_ADMIN';

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <Loader2 className="animate-spin text-blue-600" size={60} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-gray-400">Synchronizing Data</p>
          <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-1 italic">Building high-fidelity case view...</p>
        </div>
      </div>
    );
  }

  if (!mtssCase) {
    return (
      <div className="max-w-xl mx-auto py-20 px-6">
        <div className="bg-white rounded-[3rem] p-12 border border-gray-100 shadow-2xl text-center space-y-6">
           <div className="w-20 h-20 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mx-auto shadow-inner">
              <AlertTriangle size={40} />
           </div>
           <div>
              <h2 className="text-3xl font-black uppercase italic tracking-tighter text-gray-900 leading-none">Case Unavailable</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-3">Kasus yang Anda cari tidak ditemukan atau telah diarsipkan.</p>
           </div>
           <button 
             onClick={() => navigate('/mtss/cases')}
             className="bg-gray-900 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
           >
             Return to Dashboard
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-24 space-y-10 group/page">
      {/* Modals */}
      <AnimatePresence>
        {showAddDataModal && (
          <AddDataForm 
            isOpen={showAddDataModal} 
            onClose={() => setShowAddDataModal(false)} 
            mtssCase={mtssCase} 
          />
        )}
        {showTier2MeetingModal && (
          <Tier2MeetingForm 
            isOpen={showTier2MeetingModal} 
            onClose={() => setShowTier2MeetingModal(false)} 
            mtssCase={mtssCase} 
          />
        )}
        {showCloseCaseModal && (
          <CloseCaseForm 
            isOpen={showCloseCaseModal} 
            onClose={() => setShowCloseCaseModal(false)} 
            mtssCase={mtssCase} 
          />
        )}
        {showCicoInputModal && (
          <CICOInputForm 
            isOpen={showCicoInputModal}
            onClose={() => setShowCicoInputModal(false)}
            mtssCase={mtssCase}
          />
        )}
        {showWeeklyReflectionModal && (
          <CICOWeeklyReflectionModal
            isOpen={showWeeklyReflectionModal}
            onClose={() => setShowWeeklyReflectionModal(false)}
            caseId={mtssCase.id}
            weekNumber={todayReport?.weekNumber || 1}
            weekStartingDate={todayReport?.date || ''} // Optimization needed for week start
          />
        )}
      </AnimatePresence>

      {/* Top Header Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <button
          onClick={() => navigate('/mtss/cases')}
          className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-gray-400 hover:text-gray-900 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
            <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          </div>
          Back to List
        </button>
        
        <div className="flex items-center gap-4">
           <div className="hidden md:flex flex-col items-end">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Current View</p>
              <p className="text-xs font-black italic tracking-tight uppercase text-blue-600">{mtssCase.studentName}</p>
           </div>
           <div className="flex items-center gap-2 relative">
             {isCounselor && (
               <div className="relative">
                 <button 
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-3 bg-white border border-gray-100 text-gray-700 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md transition-all whitespace-nowrap group/export"
                 >
                   <Download size={14} className="group-hover/export:translate-y-0.5 transition-transform" />
                   Export PDF
                 </button>
                 
                 <AnimatePresence>
                   {showExportMenu && (
                     <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute right-0 top-full mt-2 w-72 bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden z-[60]"
                     >
                       <div className="p-4 bg-gray-50 border-b border-gray-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Report Type</p>
                       </div>
                       <div className="p-2">
                         <button 
                          onClick={() => handleExport('weekly')}
                          className="w-full flex items-center justify-between p-4 hover:bg-blue-50 rounded-2xl transition-all group"
                         >
                            <div className="text-left">
                              <p className="text-xs font-black text-gray-900 group-hover:text-blue-600 transition-colors">Rekap Mingguan</p>
                              <p className="text-[9px] font-bold text-gray-400 group-hover:text-blue-400">Untuk Orang Tua / Home Programme</p>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400" />
                         </button>
                         <button 
                          onClick={() => handleExport('full')}
                          className="w-full flex items-center justify-between p-4 hover:bg-amber-50 rounded-2xl transition-all group"
                         >
                            <div className="text-left">
                              <p className="text-xs font-black text-gray-900 group-hover:text-amber-600 transition-colors">Rekap 4 Minggu</p>
                              <p className="text-[9px] font-bold text-gray-400 group-hover:text-amber-400">Untuk Arsip Sekolah (Full Analytics)</p>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 group-hover:text-amber-400" />
                         </button>
                         <button 
                          onClick={() => handleExport('case')}
                          className="w-full flex items-center justify-between p-4 hover:bg-emerald-50 rounded-2xl transition-all group"
                         >
                            <div className="text-left">
                              <p className="text-xs font-black text-gray-900 group-hover:text-emerald-600 transition-colors">Rangkuman Kasus</p>
                              <p className="text-[9px] font-bold text-gray-400 group-hover:text-emerald-400">Arsip Akhir & Serah Terima</p>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 group-hover:text-emerald-400" />
                         </button>
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
             )}
              {canDelete && (
                <button className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-rose-500 hover:border-rose-100 transition-all shadow-sm">
                   <Trash2 size={18} />
                </button>
              )}
              <button className="p-3 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm">
                 <Download size={18} />
              </button>
           </div>
        </div>
      </div>

      {/* Profile Case Card */}
      <div className="bg-white rounded-[4rem] p-12 border border-gray-100 shadow-3xl relative overflow-hidden group/card">
        {/* Abstract Deco */}
        <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none group-hover/card:rotate-12 transition-transform duration-1000">
           <Activity size={240} />
        </div>
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-12 relative z-10">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            {/* Avatar Section */}
            <div className="relative">
              <div className="w-32 h-32 rounded-[3.5rem] bg-gradient-to-br from-[#002366] to-blue-800 flex items-center justify-center text-white text-5xl font-black italic tracking-tighter shadow-3xl ring-8 ring-blue-50/50">
                {mtssCase.studentName.split(' ').map(n => n[0]).join('')}
              </div>
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                  "absolute -bottom-4 -right-4 px-6 py-2 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] border-4 border-white shadow-2xl",
                  mtssCase.tier === 'Tier 1' ? "bg-emerald-500 text-white" :
                  mtssCase.tier === 'Tier 2' ? "bg-amber-500 text-white" :
                  "bg-rose-500 text-white"
                )}
              >
                {mtssCase.tier}
              </motion.div>
            </div>
            
            {/* Info Section */}
            <div className="space-y-4 text-center md:text-left">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                  <h1 className="text-5xl font-black text-gray-900 tracking-tighter italic uppercase leading-none">{mtssCase.studentName}</h1>
                  <span className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] px-5 py-2 bg-blue-50 rounded-2xl border border-blue-100/50">Kelas {mtssCase.classId}</span>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] ml-1">Student Behavior Profile</p>
              </div>

              <div className="flex flex-wrap justify-center md:justify-start items-center gap-8 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
                <div className="flex items-center gap-2 group/meta">
                   <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner group-hover/meta:scale-110 transition-transform">
                      <UserCircle size={16} />
                   </div>
                   Mentor: <span className="text-gray-900">{mtssCase.picName}</span>
                </div>
                <div className="flex items-center gap-2 group/meta">
                   <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner group-hover/meta:scale-110 transition-transform">
                      <Clock size={16} />
                   </div>
                   AY: <span className="text-gray-900">{mtssCase.academicYear}</span>
                </div>
                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border ${mtssCase.status === 'UNDER_REVIEW' ? 'bg-purple-50 border-purple-100 text-purple-600' : mtssCase.status === 'CLOSED' ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                   <div className={cn("w-2 h-2 rounded-full", 
                     mtssCase.status === 'OPEN' ? "bg-blue-500" :
                     mtssCase.status === 'IN_PROGRESS' ? "bg-amber-500" :
                     mtssCase.status === 'UNDER_REVIEW' ? "bg-purple-500" :
                     "bg-gray-400"
                   )} />
                   <span className="text-[10px] font-black uppercase tracking-widest">{mtssCase.status.replace('_', ' ')}</span>
                </div>
              </div>
            </div>
          </div>

          {mtssCase.status !== 'CLOSED' && (
            <div className="flex flex-wrap gap-4 w-full lg:w-auto">
              <button 
                onClick={() => setShowAddDataModal(true)}
                className="flex-1 lg:flex-none flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all shadow-xl hover:-translate-y-1 active:scale-95"
              >
                  <Plus size={20} /> Tambah Data Baru
              </button>
              
              {mtssCase.tier === 'Tier 1' && (
                <button 
                  onClick={() => setShowTier2MeetingModal(true)}
                  className="flex-1 lg:flex-none flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all shadow-xl hover:-translate-y-1 active:scale-95"
                >
                    <TrendingUp size={20} /> Eskalasi ke Tier 2
                </button>
              )}

              <button 
                onClick={() => setShowCloseCaseModal(true)}
                className="flex-1 lg:flex-none flex items-center justify-center gap-3 bg-gray-900 hover:bg-black text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all shadow-xl"
              >
                  Tutup Kasus
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 px-2 overflow-x-auto pb-2 no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: FileText },
          { id: 'concerns', label: 'Timeline Concerns', icon: History },
          { id: 'cico', label: 'CICO Tracking', icon: TrendingUp, hidden: mtssCase.tier === 'Tier 1' },
          { id: 'bip', label: 'Intensive Plan (BIP)', icon: ShieldCheck, hidden: mtssCase.tier === 'Tier 1' && !isCounselorPlus },
          { id: 'home-programme', label: 'Home Programme', icon: UserCircle, hidden: mtssCase.tier === 'Tier 1' || !isCounselorPlus }
        ].map(tab => !tab.hidden && (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-3 px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap",
              activeTab === tab.id 
                ? "bg-gray-900 text-white shadow-xl -translate-y-1" 
                : "bg-white text-gray-400 hover:bg-gray-50 border border-transparent shadow-sm"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
        {/* Left Column: Sidebar Assets */}
        <div className="lg:col-span-1 space-y-8">
           <div className="bg-[#001033] rounded-[3.5rem] p-10 text-white shadow-2xl relative overflow-hidden group/sidebar">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-400 opacity-5 rounded-full group-hover/sidebar:scale-125 transition-transform duration-1000" />
              <div className="relative z-10 space-y-12">
                 <div className="flex items-center gap-5">
                    <div className="p-4 bg-white/10 rounded-2xl ring-1 ring-white/20">
                       <Star size={24} className="text-blue-300" />
                    </div>
                    <div>
                       <h3 className="font-black text-sm uppercase tracking-[0.2em] italic tracking-tighter leading-none">Student Asset</h3>
                       <p className="text-[10px] text-blue-300/60 font-bold uppercase tracking-widest mt-1">Lazuardi Strength Filter</p>
                    </div>
                 </div>
                 
                 <div className="space-y-10">
                    <div className="space-y-5">
                       <p className="text-[10px] font-black uppercase text-blue-300/50 tracking-[0.3em]">Kekuatan & Minat</p>
                       <div className="flex flex-wrap gap-2">
                          {['Robotics Genius', 'Math Wizard', 'Kind Hearted', 'Visual Learner'].map(asset => (
                            <span key={asset} className="px-4 py-2 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 shadow-inner group-hover/sidebar:bg-white/10 transition-colors">{asset}</span>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-5">
                       <p className="text-[10px] font-black uppercase text-blue-300/50 tracking-[0.3em]">Background Narrative</p>
                       <div className="p-6 bg-white/5 rounded-3xl border border-white/10 italic text-[11px] leading-relaxed text-blue-50/80 font-medium">
                          "Siswa sangat responsif terhadap afirmasi positif dan sistem reward visual. Memiliki bakat teknis yang menonjol."
                       </div>
                    </div>

                    <button className="w-full bg-white text-[#002366] py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] shadow-3xl hover:bg-blue-50 transition-all">
                       Edit Asset Data
                    </button>
                 </div>
              </div>
           </div>

           {/* CICO Mini Dashboard */}
           {mtssCase.tier === 'Tier 2' && (
             <div className="bg-white rounded-[3.5rem] p-10 border border-gray-100 shadow-sm space-y-8 relative overflow-hidden group/cico-dash">
               <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover/cico-dash:scale-110 transition-transform duration-1000">
                  <TrendingUp size={120} />
               </div>
               
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl shadow-inner">
                     <TrendingUp size={24} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest italic tracking-tighter">CICO Tracker</h4>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Quick Summary</p>
                  </div>
               </div>

               <div className="space-y-8">
                  {/* Progress Bar */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                       <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Cycle Progress</p>
                       <p className="text-[9px] font-black text-gray-900 uppercase tracking-widest">Minggu 3 / 4</p>
                    </div>
                    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '75%' }}
                        className="absolute h-full bg-amber-500 rounded-full"
                       />
                    </div>
                  </div>

                  {/* Avg Score */}
                  <div className="flex items-center justify-between">
                     <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Nilai Rata-rata</p>
                        <div className="flex items-baseline gap-2">
                           <p className="text-3xl font-black text-gray-900 italic tracking-tighter leading-none">
                              {allCicoReports.length > 0 
                                ? (allCicoReports.reduce((acc, curr) => acc + curr.dailyAvgScore, 0) / allCicoReports.length).toFixed(1)
                                : '0.0'}
                           </p>
                           <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">/ 3.0</p>
                        </div>
                     </div>
                     {allCicoReports.length > 0 && (
                       <div className={cn(
                         "px-5 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest",
                         (allCicoReports.reduce((acc, curr) => acc + curr.dailyAvgScore, 0) / allCicoReports.length) >= 2.4 
                           ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                           : "bg-amber-50 text-amber-600 border-amber-100"
                       )}>
                         {((allCicoReports.reduce((acc, curr) => acc + curr.dailyAvgScore, 0) / allCicoReports.length) / 3 * 100).toFixed(0)}% SUCCESS
                       </div>
                     )}
                  </div>

                  {/* Heatmap Placeholder */}
                  <div className="space-y-4 pt-4 border-t border-gray-50">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Activity Heatmap (Past 20 entries)</p>
                    <div className="grid grid-cols-5 gap-2">
                        {allCicoReports.slice(0, 20).reverse().map((report, i) => (
                          <div 
                            key={report.id} 
                            className={cn(
                              "aspect-square rounded-lg transition-all hover:scale-110 cursor-help",
                              report.isAbsent ? "bg-gray-200" :
                              report.dailyAvgScore >= 2.4 ? "bg-emerald-500" : 
                              report.dailyAvgScore >= 2.0 ? "bg-amber-400" : "bg-red-400"
                            )} 
                            title={`${formatDate(report.date)}: ${report.dailyAvgScore.toFixed(1)}`}
                          />
                        ))}
                        {Array.from({ length: Math.max(0, 20 - allCicoReports.length) }).map((_, i) => (
                          <div key={`empty-${i}`} className="aspect-square rounded-lg bg-gray-50 h-full w-full" />
                        ))}
                    </div>
                  </div>

                  <button 
                    onClick={() => navigate(`/mtss/cico/${mtssCase.id}`)}
                    className="w-full bg-amber-50 text-amber-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 transition-all border border-amber-100/50 flex items-center justify-center gap-2"
                  >
                     Review Detailed Charts <TrendingUp size={14} />
                  </button>
               </div>
             </div>
           )}

           {/* Academic Context Integration */}
           {academicContext && academicContext.activeAcademicCaseId && (
             <div className="bg-white rounded-[3.5rem] p-10 border border-violet-100 shadow-sm space-y-8 relative overflow-hidden group/academic-dash">
               <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover/academic-dash:scale-110 transition-transform duration-1000">
                  <BookOpen size={120} />
               </div>
               
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-violet-50 text-violet-600 rounded-2xl shadow-inner">
                     <BookOpen size={24} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest italic tracking-tighter">Academic Support</h4>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Linked Intervention</p>
                  </div>
               </div>

               <div className="space-y-6">
                  <div className="p-6 bg-violet-50/50 rounded-3xl border border-violet-100">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-violet-700 uppercase tracking-widest">{academicContext.currentTier}</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                          academicContext.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>{academicContext.status}</span>
                     </div>
                     <p className="text-xs font-black text-slate-900 leading-tight uppercase italic">{academicContext.domains.join(' • ')}</p>
                  </div>

                  <button 
                    onClick={() => navigate(`/junior-high/academic/mtss/cases/${academicContext.activeAcademicCaseId}`)}
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-violet-600 transition-all flex items-center justify-center gap-2"
                  >
                     Open Academic Case <ExternalLink size={14} />
                  </button>
               </div>
             </div>
           )}

           {/* AI Analysis Sidebar */}
           <div className="bg-white rounded-[3.5rem] p-10 border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-inner">
                    <Sparkles size={24} />
                 </div>
                 <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest italic tracking-tighter">Lumina AI Diagnosis</h4>
              </div>

              <div className="space-y-8">
                 {isAiLoading ? (
                   <div className="py-12 flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-blue-600" size={32} />
                      <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest animate-pulse">Scanning Incident Patterns</p>
                   </div>
                 ) : aiAnalysis ? (
                   <div className="space-y-6">
                      <div className="space-y-2">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Recommended Decision</p>
                         <div className="flex items-center gap-2">
                            <ShieldCheck className="text-blue-600" size={18} />
                            <p className="text-xl font-black text-blue-600 italic tracking-tighter uppercase">{aiAnalysis.tier}</p>
                         </div>
                      </div>
                      <div className="space-y-3">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Action Roadmap</p>
                         <p className="text-[11px] font-medium text-gray-600 leading-relaxed italic border-l-2 border-blue-100 pl-5">
                            {aiAnalysis.steps}
                         </p>
                      </div>
                      <button onClick={handleAiAnalysis} className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all border border-transparent hover:border-blue-100">
                         Refresh Analysis
                      </button>
                   </div>
                 ) : (
                   <div className="space-y-4">
                      <p className="text-[11px] text-gray-500 italic leading-relaxed">Klik tombol di bawah untuk mendapatkan rekomendasi langkah intervensi dari AI (Lumina Intelligence).</p>
                      <button 
                        onClick={handleAiAnalysis}
                        className="w-full bg-blue-50 text-blue-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all shadow-sm"
                      >
                         Launch AI Analysis
                      </button>
                   </div>
                 )}
              </div>
           </div>

           {/* Archival & Backup Status Sidebar */}
           <div className="bg-white rounded-[3.5rem] p-10 border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl shadow-inner">
                    <Cloud size={24} />
                 </div>
                 <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest italic tracking-tighter">Backup & Archival</h4>
              </div>

              <div className="space-y-6">
                {/* Register Status */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Master Register</p>
                    <span className={cn(
                      "text-[8px] font-black px-2 py-0.5 rounded-md uppercase",
                      mtssCase.registerSyncStatus === 'SYNCED' ? "bg-emerald-50 text-emerald-600" :
                      mtssCase.registerSyncStatus === 'FAILED' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {mtssCase.registerSyncStatus || 'PENDING'}
                    </span>
                  </div>
                  <button 
                    onClick={handleManualSyncRegister}
                    disabled={archiving === 'register'}
                    className="w-full py-3 bg-gray-50 hover:bg-rose-50 text-gray-500 hover:text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-transparent hover:border-rose-100 transition-all flex items-center justify-center gap-2"
                  >
                    {archiving === 'register' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Sync Register
                  </button>
                </div>

                {/* Snapshot Sync v2 */}
                <div className="space-y-3 pt-4 border-t border-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Snapshot Sync (v2)</p>
                    <div className="flex items-center gap-1.5">
                      {mtssCase.snapshotNeedsRefresh && (
                        <span className="text-[7px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase animate-pulse">Outdated</span>
                      )}
                      <span className={cn(
                        "text-[8px] font-black px-2 py-0.5 rounded-md uppercase",
                        mtssCase.snapshotSyncStatus === 'SYNCED' && !mtssCase.snapshotNeedsRefresh ? "bg-blue-50 text-blue-600" :
                        mtssCase.snapshotSyncStatus === 'FAILED' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                      )}>
                        {mtssCase.snapshotSyncStatus === 'PENDING' || mtssCase.snapshotNeedsRefresh ? 'REFRESH' : (mtssCase.snapshotSyncStatus || 'PENDING')}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={handleManualSyncSnapshot}
                    disabled={archiving === 'snapshot'}
                    className={cn(
                      "w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border shadow-sm",
                      mtssCase.snapshotNeedsRefresh 
                        ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" 
                        : "bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blue-600 border-transparent hover:border-blue-100"
                    )}
                  >
                    {archiving === 'snapshot' ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
                    {mtssCase.snapshotNeedsRefresh ? 'Manual Refresh Now' : 'Sync Snapshot'}
                  </button>
                  {mtssCase.latestSnapshotError && (
                    <p className="text-[8px] text-rose-500 font-bold leading-tight mt-1">{mtssCase.latestSnapshotError}</p>
                  )}
                </div>

                {/* Drive Folder */}
                <div className="space-y-3 pt-4 border-t border-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Archive Folder</p>
                    {mtssCase.driveFolderId ? (
                      <a 
                        href={`https://drive.google.com/drive/folders/${mtssCase.driveFolderId}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-blue-600 hover:underline text-[9px] font-black uppercase"
                      >
                        OPEN <ExternalLink size={8} className="inline ml-1" />
                      </a>
                    ) : (
                      <span className="text-[8px] font-black bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md uppercase">MISSING</span>
                    )}
                  </div>
                </div>

                {/* PDF Archival Buttons */}
                <div className="space-y-3 pt-4 border-t border-gray-50">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-4">Manual Archive Artifacts</p>
                   
                   <div className="space-y-2">
                     {[
                       { label: 'Case Summary', type: MTSSBehaviorPdfType.CASE_SUMMARY, icon: FileText, current: mtssCase.latestCaseSummaryPdfId },
                       { label: 'CICO Progress', type: MTSSBehaviorPdfType.CICO_PROGRESS, icon: TrendingUp, current: mtssCase.latestCicoPdfId },
                       { label: 'BIP Summary', type: MTSSBehaviorPdfType.BIP_SUMMARY, icon: ShieldCheck, current: mtssCase.latestBipPdfId },
                     ].map(pdf => (
                       <button
                         key={pdf.type}
                         onClick={() => handleManualArchivePdf(pdf.type)}
                         disabled={!!archiving}
                         className={cn(
                           "w-full px-4 py-3 rounded-xl border flex items-center justify-between transition-all group/pdf",
                           pdf.current 
                             ? "bg-white border-emerald-100 hover:border-emerald-300" 
                             : "bg-gray-50 border-gray-100 hover:bg-white hover:border-rose-200"
                         )}
                       >
                         <div className="flex items-center gap-3">
                           <pdf.icon size={14} className={cn(pdf.current ? "text-emerald-500" : "text-gray-400 group-hover/pdf:text-rose-500")} />
                           <span className={cn("text-[10px] font-black uppercase tracking-tight", pdf.current ? "text-gray-700" : "text-gray-400 group-hover/pdf:text-gray-900")}>
                             {pdf.label}
                           </span>
                         </div>
                         {archiving === pdf.type ? (
                           <Loader2 size={12} className="animate-spin text-rose-500" />
                         ) : pdf.current ? (
                           <CheckCircle2 size={12} className="text-emerald-500" />
                         ) : (
                           <Plus size={12} className="text-gray-300 group-hover/pdf:text-rose-500" />
                         )}
                       </button>
                     ))}
                   </div>
                </div>
              </div>
           </div>
        </div>

        {/* Middle/Main Content Column */}
        <div className="lg:col-span-3 space-y-16">
          {/* Tab Bar Implementation */}
          <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-[2.5rem] border border-gray-100 shadow-sm sticky top-4 z-40 backdrop-blur-md bg-white/90">
             {[
               { id: 'overview', label: 'Overview', icon: FileText },
               { id: 'concerns', label: 'Incident Units', icon: Activity },
               { id: 'cico', label: 'CICO Analytics', icon: TrendingUp },
               { id: 'bip', label: 'BIP Support', icon: ShieldCheck },
               { id: 'home-programme', label: 'Home Programme', icon: UserCircle },
             ].filter(tab => {
               if (tab.id === 'cico' || tab.id === 'bip') return mtssCase.tier !== 'Tier 1';
               return true;
             }).map((tab) => (
               <button
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id as any)}
                 className={cn(
                   "flex items-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                   activeTab === tab.id 
                     ? "bg-gray-900 text-white shadow-xl shadow-gray-900/20 active:scale-95" 
                     : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                 )}
               >
                 <tab.icon size={16} />
                 {tab.label}
               </button>
             ))}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-16 animate-in fade-in slide-in-from-bottom-5">
              {/* Active Alerts Banner */}
              {activeAlerts.length > 0 && (
                <div className="space-y-4">
                  {activeAlerts.map(alert => (
                    <motion.div 
                      key={alert.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "p-6 rounded-[2rem] border flex items-center justify-between gap-6 shadow-xl",
                        alert.severity === 'HIGH' ? "bg-rose-50 border-rose-100 text-rose-900" :
                        alert.severity === 'WARNING' ? "bg-amber-50 border-amber-100 text-amber-900" :
                        "bg-blue-50 border-blue-100 text-blue-900"
                      )}
                    >
                      <div className="flex items-center gap-5">
                         <div className={cn(
                           "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner",
                           alert.severity === 'HIGH' ? "bg-rose-500 text-white" :
                           alert.severity === 'WARNING' ? "bg-amber-500 text-white" :
                           "bg-blue-500 text-white"
                         )}>
                            {alert.severity === 'HIGH' ? <ShieldAlert size={24} /> : <Info size={24} />}
                         </div>
                         <div>
                            <h4 className="text-sm font-black uppercase tracking-tight italic tracking-tighter leading-none">{alert.title}</h4>
                            <p className="text-xs font-medium opacity-70 mt-1">{alert.message}</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{formatDate(alert.createdAt)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Mini Dashboard Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Current Status Card */}
                <div className="bg-white rounded-[3.5rem] p-10 border border-gray-100 shadow-sm space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-inner">
                      <ShieldAlert size={24} />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">MTSS Status</h4>
                      <p className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">{mtssCase.status}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-gray-50 rounded-2xl text-center">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Concerns</p>
                      <p className="text-2xl font-black text-gray-900 mt-1">{concerns.length}</p>
                    </div>
                    <div className="p-6 bg-gray-50 rounded-2xl text-center">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tier</p>
                      <p className="text-2xl font-black text-gray-900 mt-1">{mtssCase.tier}</p>
                    </div>
                  </div>
                </div>

                {/* AI Analysis Preview */}
                <div className="bg-white rounded-[3.5rem] p-10 border border-blue-100 shadow-sm space-y-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                    <Sparkles size={100} />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <Sparkles size={24} />
                    </div>
                    <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">AI Next Steps</h4>
                  </div>
                  {aiAnalysis ? (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-gray-700 leading-relaxed line-clamp-3">
                        {aiAnalysis.steps}
                      </p>
                      <button className="text-[9px] font-black text-blue-600 uppercase tracking-widest underline decoration-2 underline-offset-4">
                        Read Full Analysis
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleAiAnalysis}
                      disabled={isAiLoading}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
                    >
                      {isAiLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                      Generate AI Insight
                    </button>
                  )}
                </div>
              </div>

              {/* Special Tier Logic Panels (Now part of Overview) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                 {/* Tier 2 Specifics */}
                 {mtssCase.tier === 'Tier 2' && (
                   <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[3.5rem] p-10 border border-amber-100 shadow-2xl space-y-8 relative overflow-hidden group/t2">
                      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover/t2:scale-150 transition-transform duration-1000">
                         <TrendingUp size={120} />
                      </div>
                      <div className="flex items-center gap-5">
                         <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-[1.5rem] flex items-center justify-center shadow-inner ring-4 ring-amber-50">
                            <TrendingUp size={32} />
                         </div>
                         <div>
                            <h4 className="text-2xl font-black text-gray-900 italic tracking-tighter uppercase leading-none">Tier 2 Support</h4>
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">CICO Tracker Active</p>
                         </div>
                      </div>

                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div 
                              onClick={() => setShowCicoInputModal(true)}
                              className={cn(
                                "p-6 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group/btn",
                                todayReport ? "bg-white border-emerald-100 hover:border-emerald-200" : "bg-amber-50 border-amber-100 hover:bg-white hover:border-amber-200"
                              )}
                            >
                               <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest relative z-10">CICO Daily Input</p>
                               <p className="text-sm font-black text-gray-900 mt-1 uppercase italic tracking-tighter relative z-10">
                                  {todayReport ? 'Update Hari Ini' : 'Input Hari Ini'}
                               </p>
                               {todayReport && (
                                 <CheckCircle2 size={16} className="absolute top-2 right-2 text-emerald-500" />
                               )}
                            </div>
                            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:border-amber-200 transition-all cursor-pointer text-center">
                               <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Analytics</p>
                               <p className="text-sm font-black text-blue-600 mt-1 uppercase italic tracking-tighter" onClick={() => setActiveTab('cico')}>Dashboard</p>
                            </div>
                        </div>
                         
                        <div className="p-8 bg-amber-50 rounded-[2.5rem] border border-amber-100 space-y-3 relative">
                            <h5 className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Behavior Contract</h5>
                            <p className="text-xs font-semibold text-gray-800 leading-relaxed italic border-l-4 border-amber-400 pl-5">
                               "Siswa setuju melakukan Check-In setiap pagi pkl 07:15 dengan Pak Budi dan menerapkan strategi de-eskalasi visual."
                            </p>
                         </div>
                      </div>
                   </motion.div>
                 )}
              </div>
            </div>
          )}

          {(activeTab === 'bip' && (mtssCase.tier === 'Tier 3' || mtssCase.tier === 'Tier 2')) && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-5">
               <div className="bg-white rounded-[4rem] p-12 border border-blue-900 shadow-2xl space-y-12 relative overflow-hidden group/t3">
                  <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover/t3:rotate-12 transition-transform duration-1000">
                     <ShieldCheck size={160} />
                  </div>
                  <div className="flex items-center gap-6 relative z-10">
                     <div className="w-16 h-16 rounded-[1.5rem] bg-gray-900 text-white flex items-center justify-center shadow-inner">
                        <ShieldCheck size={36} />
                     </div>
                     <div>
                        <h4 className="text-3xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Intensive Plan</h4>
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1.5 italic">Behavior Intervention Plan (BIP)</p>
                     </div>
                  </div>

                  {!canSeeTier3 && mtssCase.tier === 'Tier 3' ? (
                    <div className="p-16 bg-gray-50 rounded-[3rem] text-center space-y-6 border border-gray-100 relative z-10">
                       <Lock size={64} className="text-rose-500/40 mx-auto" />
                       <div>
                          <p className="text-xl font-black uppercase italic tracking-tighter text-gray-900">Confidential Access Only</p>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-3 leading-relaxed max-w-xl mx-auto">
                             Dokumen BIP Tier 3 hanya dapat diakses oleh Counselor, Kepala Sekolah, dan Admin.
                          </p>
                       </div>
                    </div>
                  ) : (
                    <div className="space-y-12 relative z-10">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                          <div className="space-y-4">
                             <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Plan Overview</p>
                             <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 italic font-medium text-gray-700 leading-relaxed">
                                {bipPlan?.targetBehaviors || "Strategi intensif yang melibatkan psikolog eksternal dan monitoring berkelanjutan."}
                             </div>
                          </div>
                          <div className="space-y-4">
                             <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Collaborative Strategies</p>
                             <p className="text-sm font-semibold text-gray-600 leading-relaxed pt-2">
                               {bipPlan?.replacementBehaviors || "Strategi pengganti perilaku sedang dikembangkan."}
                             </p>
                          </div>
                       </div>
                       
                       <div className="flex gap-4">
                          <Link to={`/mtss/intervention/${id}`} className="flex-1 py-6 bg-gray-900 text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-4 transition-all shadow-2xl hover:bg-blue-600">
                             <ExternalLink size={18} /> Open Full BIP Document & Signatures
                          </Link>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          )}


          {activeTab === 'concerns' && (
            <section className="space-y-12 animate-in fade-in slide-in-from-bottom-5">
               <div className="flex items-center justify-between px-6">
                  <div className="flex items-center gap-5">
                     <div className="w-14 h-14 rounded-[1.5rem] bg-gray-50 border border-gray-100 text-blue-600 flex items-center justify-center shadow-sm">
                        <History size={28} />
                     </div>
                     <div>
                        <h3 className="text-3xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Timeline Kejadian</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                          <Activity size={12} className="text-blue-400" />
                          Concerns & Tier 1 Data Summary
                        </p>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-xl">Total {concerns.length} Units</span>
                  </div>
               </div>

               <div className="relative pl-12 md:pl-28 space-y-20 before:absolute before:left-[19px] md:left-[35px] before:top-4 before:bottom-4 before:w-[4px] before:bg-gray-100 before:rounded-full">
                  {concerns.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-gray-100 rounded-[3rem]">
                       <p className="text-sm font-black text-gray-300 uppercase italic tracking-tighter">No concerns recorded yet</p>
                    </div>
                  ) : concerns.map((concern, idx) => (
                    <div key={concern.id} className="relative group/line">
                       {/* Timeline Node */}
                       <div className={cn(
                         "absolute -left-[45px] md:-left-[61px] top-4 w-14 h-14 rounded-full border-[10px] border-white shadow-2xl flex items-center justify-center z-10 transition-transform group-hover/line:scale-110 duration-500",
                         concern.isDone ? "bg-emerald-500" : "bg-blue-600 ring-8 ring-blue-50"
                       )}>
                          {concern.isDone ? <Check size={18} className="text-white" /> : <MessageSquare size={18} className="text-white" />}
                       </div>

                       {/* Incident Card */}
                       <motion.div 
                          initial={{ opacity: 0, x: -30 }} 
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          className={cn(
                            "bg-white rounded-[4rem] p-12 border transition-all duration-500 group/card relative hover:shadow-4xl",
                            concern.isDone ? "border-emerald-50 shadow-sm" : "border-blue-100 shadow-2xl ring-4 ring-blue-50/30"
                          )}
                       >
                          {/* Status Done Indicator */}
                          {concern.isDone && (
                            <div className="absolute top-10 right-10 flex items-center gap-3 py-2 px-6 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shadow-sm">
                               <CheckCircle2 size={14} />
                               <span className="text-[10px] font-black uppercase tracking-widest">Selesai: {formatDate(concern.doneAt?.toString() || '')}</span>
                            </div>
                          )}

                          <div className="flex flex-col md:flex-row justify-between items-start mb-12 gap-8">
                             <div className="space-y-4">
                                <div className="flex items-center gap-6">
                                   <span className={cn(
                                     "text-[11px] font-black uppercase tracking-[0.25em] px-6 py-2 rounded-2xl shadow-inner",
                                     concern.isDone ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                                   )}>
                                      Record Unit {concerns.length - idx}
                                   </span>
                                   <div className="flex items-center gap-3 text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                      <Calendar size={16} className="text-blue-400" />
                                      {formatDate(concern.date)}
                                   </div>
                                </div>
                                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] ml-2">Behavior Concern Summary</h4>
                             </div>
                             <button className="text-gray-200 hover:text-gray-900 transition-colors p-3 rounded-2xl hover:bg-gray-50">
                                <MoreVertical size={24} />
                             </button>
                          </div>

                          {/* Description Narrative */}
                          <div className="mb-14">
                             <p className="text-2xl font-medium text-gray-800 leading-relaxed italic max-w-4xl tracking-tight">
                                "{concern.description}"
                             </p>
                          </div>

                          {/* Details Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 pt-12 border-t border-gray-50">
                             <div className="space-y-5">
                                <div className="flex items-center gap-2">
                                   <ClipboardList size={14} className="text-blue-400" />
                                   <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Interventions Tried</h5>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                   {concern.interventionsTried.map((it, i) => (
                                     <span key={i} className="px-4 py-2 bg-gray-50 text-gray-600 text-[10px] font-bold rounded-xl border border-gray-100 shadow-sm">{it}</span>
                                   ))}
                                </div>
                             </div>

                             <div className="space-y-5">
                                <div className="flex items-center gap-2">
                                   <TrendingUp size={14} className="text-amber-400" />
                                   <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Progress Response</h5>
                                </div>
                                <p className="text-[12px] font-semibold text-gray-600 italic leading-relaxed pl-4 border-l-2 border-gray-100">
                                   {concern.progressNotes || "Belum ada catatan progres evaluasi."}
                                </p>
                             </div>

                             <div className="space-y-6 bg-gray-50/50 p-8 rounded-[3rem] border border-gray-100 shadow-inner group/next">
                                <div className="flex items-center justify-between">
                                   <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Action Plan (Next)</h5>
                                   <div className="bg-rose-50 text-rose-500 px-3 py-1 rounded-lg text-[9px] font-black uppercase">Due: {concern.nextStepDueDate}</div>
                                </div>
                                <div className="space-y-4">
                                   <p className="text-sm font-black text-gray-900 tracking-tight uppercase italic leading-tight group-hover/next:translate-x-1 transition-transform">{concern.nextSteps}</p>
                                   <div className="flex items-center justify-between pt-4 border-t border-gray-200/50">
                                      <div className="flex items-center gap-3">
                                         <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center text-[10px] font-black uppercase shadow-xl">
                                            {concern.nextStepPicName?.split(' ').map(n=>n[0]).join('') || 'PIC'}
                                         </div>
                                         <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-gray-900 uppercase leading-none">{concern.nextStepPicName}</span>
                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1 italic">Responsible PIC</span>
                                         </div>
                                      </div>
                                      {!concern.isDone && (
                                        <button className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm">
                                           <Check size={16} />
                                        </button>
                                      )}
                                   </div>
                                </div>
                             </div>
                          </div>
                       </motion.div>
                    </div>
                  ))}
               </div>

               {/* Add New Data Placeholder */}
               <div className="flex justify-center pt-8">
                  <button 
                    onClick={() => navigate(`/mtss/concern/new/${id}`)}
                    className="bg-white border-2 border-dashed border-gray-200 text-gray-400 px-16 py-8 rounded-[3.5rem] font-black text-xs uppercase tracking-[0.3em] hover:border-blue-300 hover:text-blue-600 transition-all group flex items-center gap-4 shadow-sm hover:shadow-xl hover:-translate-y-1"
                  >
                     <div className="w-12 h-12 bg-gray-50 group-hover:bg-blue-50 text-gray-300 group-hover:text-blue-600 rounded-2xl flex items-center justify-center transition-all">
                        <Plus size={24} className="group-hover:rotate-90 transition-transform" />
                     </div>
                     Record New Concern Data
                  </button>
               </div>
            </section>
          )}

          {(activeTab === 'cico' && mtssCase.tier !== 'Tier 1') && (
            <div className="space-y-16 animate-in fade-in slide-in-from-bottom-5">
              <div className="bg-white rounded-[3.5rem] p-10 border border-amber-100 shadow-2xl space-y-8 relative overflow-hidden group/t2">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover/t2:scale-150 transition-transform duration-1000">
                  <TrendingUp size={120} />
                </div>
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-[1.5rem] flex items-center justify-center shadow-inner ring-4 ring-amber-50">
                    <TrendingUp size={32} />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-gray-900 italic tracking-tighter uppercase leading-none">Tier 2 Support</h4>
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">CICO Tracker Active</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div 
                      onClick={() => setShowCicoInputModal(true)}
                      className={cn(
                        "p-6 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group/btn text-center",
                        todayReport ? "bg-white border-emerald-100 hover:border-emerald-200" : "bg-amber-50 border-amber-100 hover:bg-white hover:border-amber-200"
                      )}
                    >
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest relative z-10">CICO Daily Input</p>
                      <p className="text-sm font-black text-gray-900 mt-1 uppercase italic tracking-tighter relative z-10">
                        {todayReport ? 'Update Hari Ini' : 'Input Hari Ini'}
                      </p>
                      {todayReport && (
                        <CheckCircle2 size={16} className="absolute top-4 right-4 text-emerald-500" />
                      )}
                    </div>
                    <div 
                      onClick={() => setShowWeeklyReflectionModal(true)}
                      className="p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:border-blue-200 transition-all cursor-pointer text-center group/refl"
                    >
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Weekly Refl.</p>
                      <p className="text-sm font-black text-blue-600 mt-1 uppercase italic tracking-tighter group-hover/refl:underline decoration-2">Fill Report</p>
                    </div>
                  </div>
                  
                  <Link to={`/mtss/cico/${mtssCase.id}`} className="w-full flex items-center justify-center gap-3 py-5 bg-gray-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-600 transition-all group">
                    Open Detailed Charts <TrendingUp size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </Link>
                </div>
              </div>

              <div className="bg-white rounded-[4rem] p-12 border border-gray-100 shadow-sm space-y-10">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                        <Activity size={24} />
                      </div>
                      <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Recent CICO Trends</h4>
                   </div>
                 </div>

                 <div className="grid grid-cols-5 lg:grid-cols-10 gap-3">
                   {allCicoReports.slice(0, 30).reverse().map((report) => (
                      <div 
                        key={report.id}
                        className={cn(
                          "aspect-square rounded-xl flex items-center justify-center text-[10px] font-black shadow-sm transition-all hover:scale-110",
                          report.isAbsent ? "bg-gray-100 text-gray-400" :
                          report.dailyAvgScore >= 2.4 ? "bg-emerald-500 text-white" :
                          report.dailyAvgScore >= 1.8 ? "bg-amber-400 text-white" : "bg-rose-500 text-white"
                        )}
                        title={`${formatDate(report.date)}: ${report.dailyAvgScore.toFixed(1)}`}
                      >
                        {report.dailyAvgScore.toFixed(1)}
                      </div>
                   ))}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'home-programme' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-5">
               <div className="bg-white rounded-[4rem] p-12 border border-emerald-100 shadow-2xl space-y-12 relative overflow-hidden group/hp">
                  <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover/hp:scale-110 transition-transform duration-1000">
                     <UserCircle size={160} />
                  </div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 relative z-10">
                    <div className="flex items-center gap-6">
                      <div className="w-18 h-18 rounded-[2rem] bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                        <UserCircle size={40} />
                      </div>
                      <div>
                        <h3 className="text-3xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Home Programme</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                           <Activity size={12} className="text-emerald-400" />
                           Parent Collaboration Portal Settings
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-5 bg-gray-900 p-5 rounded-[2.5rem] shadow-2xl shadow-emerald-100">
                      <div className="flex flex-col items-end px-4">
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Portal Access</p>
                        <p className="text-[11px] font-black text-white uppercase italic tracking-tighter">{hpIsVisible ? 'Publicly Shared' : 'Locked to School'}</p>
                      </div>
                      <button 
                        onClick={() => {
                          const newVal = !hpIsVisible;
                          setHpIsVisible(newVal);
                        }}
                        className={cn(
                          "px-10 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all",
                          hpIsVisible ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20" : "bg-white/10 text-white/40"
                        )}
                      >
                        {hpIsVisible ? 'PUBLISHED' : 'PRIVATE'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                    <div className="space-y-6">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                         <Star size={12} className="text-amber-500" /> Counselor Motivation Message
                       </label>
                       <textarea 
                         value={hpMotivation}
                         onChange={(e) => setHpMotivation(e.target.value)}
                         placeholder="Tulis pesan penyemangat untuk orang tua & siswa..."
                         className="w-full h-48 p-10 bg-gray-50 rounded-[3rem] border border-gray-100 focus:border-emerald-200 outline-none text-sm font-semibold leading-relaxed placeholder:italic text-gray-800 transition-all focus:bg-white resize-none shadow-inner"
                       />
                       <p className="text-[9px] font-medium text-gray-400 italic px-6 leading-relaxed">
                         Pesan ini akan dilihat orang tua di halaman utama Home Programme mereka.
                       </p>
                    </div>
                    
                    <div className="space-y-10">
                       <div className="bg-gray-50 rounded-[3rem] border border-gray-200/50 p-10 space-y-8">
                          <h5 className="text-[11px] font-black text-gray-900 uppercase tracking-widest italic border-b border-gray-200 pb-5">Home Programme Highlights</h5>
                          <div className="space-y-6">
                             <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Weeks Published</span>
                                <span className="text-sm font-black text-emerald-600">{mtssCase.homeProgramme?.publishedWeeks?.length || 0} Weeks</span>
                             </div>
                          </div>
                       </div>
                       
                       <button 
                        onClick={handleSaveHomeProgramme}
                        className="w-full bg-gray-900 text-white py-6 rounded-[2rem] font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all flex items-center justify-center gap-4 active:scale-[0.98]"
                       >
                         <CheckCircle2 size={18} /> Simpan Data Program
                       </button>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {/* System Activity Auto-Log */}
          <section className="bg-gray-900 rounded-[4rem] p-16 text-white shadow-3xl space-y-12 relative overflow-hidden group/logs">
             {/* deco log */}
             <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover/logs:scale-110 transition-transform duration-1000">
                <History size={300} className="stroke-[0.2]" />
             </div>
             
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 relative z-10">
                <div className="flex items-center gap-6">
                   <div className="w-16 h-16 bg-white/10 rounded-[1.5rem] flex items-center justify-center text-blue-300 ring-1 ring-white/20">
                      <History size={32} />
                   </div>
                   <div className="space-y-1">
                      <h4 className="text-3xl font-black italic tracking-tighter uppercase text-white leading-none">Activity & Change Log</h4>
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">Immutable Traceability logs</p>
                   </div>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Log Integrity</p>
                  <p className="text-xs font-black text-emerald-400 uppercase italic">Verified by Lumina System</p>
                </div>
             </div>

             <div className="space-y-4 relative z-10">
                <div className="text-center py-12 border border-dashed border-white/10 rounded-[3rem] opacity-30">
                   <p className="text-xs font-black uppercase tracking-[0.2em] text-white">Log Kosong</p>
                   <p className="text-[10px] font-medium text-white/50 mt-2 italic">Belum ada riwayat aktivitas untuk kasus ini.</p>
                </div>
             </div>
             
             <button className="w-full py-5 border border-white/10 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] text-white/40 hover:bg-white/5 hover:text-white transition-all">
                Download Full Evidence Trail
             </button>
          </section>
        </div>
      </div>
    </div>
  );
}
