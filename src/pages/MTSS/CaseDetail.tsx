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
  Cloud, RefreshCw, Pencil, X
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
  getBehaviorNotifications,
  deleteMTSSConcern,
  getTeachers
} from '../../lib/firebase';
import { SEVERE_BEHAVIOR_CATEGORIES } from '../../constants/mtssSevereCategories';
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
interface EditCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  mtssCase: MTSSCase;
  teachers: any[];
  onUpdated: (updates: Partial<MTSSCase>) => void;
}

function EditCaseModal({ isOpen, onClose, mtssCase, teachers, onUpdated }: EditCaseModalProps) {
  const [categoryCode, setCategoryCode] = React.useState(mtssCase.categoryCode || '');
  const [lastConcernSummary, setLastConcernSummary] = React.useState(mtssCase.lastConcernSummary || '');
  const [status, setStatus] = React.useState<MTSSStatus>(mtssCase.status || 'OPEN');
  const [picId, setPicId] = React.useState(mtssCase.picId || '');
  const [picName, setPicName] = React.useState(mtssCase.picName || '');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setCategoryCode(mtssCase.categoryCode || '');
    setLastConcernSummary(mtssCase.lastConcernSummary || '');
    setStatus(mtssCase.status || 'OPEN');
    setPicId(mtssCase.picId || '');
    setPicName(mtssCase.picName || '');
  }, [mtssCase]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const selectedCat = SEVERE_BEHAVIOR_CATEGORIES.find(c => c.code === categoryCode);
    const catLabel = selectedCat ? selectedCat.label : (categoryCode ? (mtssCase.categoryLabel || '') : '');

    setSaving(true);
    try {
      const updates: Partial<MTSSCase> = {
        categoryCode,
        categoryLabel: catLabel,
        lastConcernSummary,
        status,
        picId,
        picName,
      };

      await updateMTSSCase(mtssCase.id, updates);
      onUpdated(updates);
      toast.success("Data kasus berhasil diperbarui");
      onClose();
    } catch (err) {
      console.error("Error updating case:", err);
      toast.error("Gagal memperbarui data kasus");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Pencil size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 tracking-tight">Edit Kasus MTSS Behavior</h3>
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{mtssCase.studentName} • Kelas {mtssCase.classId}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Read-only Tier badge */}
          <div className="flex items-center justify-between bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tier Penanganan:</span>
            <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200">
              {mtssCase.tier} (Tetap)
            </span>
          </div>

          {/* Kategori Dropdown (Bagian G nomor 1-17) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase text-blue-900 tracking-widest flex items-center gap-1.5">
                <span>Kategori Pelanggaran Berat</span>
              </label>
              <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                Bagian G (Nomor 1–17)
              </span>
            </div>
            <div className="relative">
              <select
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none font-bold text-xs appearance-none cursor-pointer text-gray-900"
              >
                <option value="">-- Pilih Kategori Pelanggaran --</option>
                {SEVERE_BEHAVIOR_CATEGORIES.map(cat => (
                  <option key={cat.code} value={cat.code}>
                    {cat.number}. {cat.label}
                  </option>
                ))}
              </select>
              <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={16} />
            </div>
          </div>

          {/* Status Kasus */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
              Status Kasus
            </label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MTSSStatus)}
                className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none font-bold text-xs appearance-none cursor-pointer text-gray-900"
              >
                <option value="OPEN">OPEN (Sedang Dibuka)</option>
                <option value="IN_PROGRESS">IN PROGRESS (Dalam Penanganan)</option>
                <option value="UNDER_REVIEW">UNDER REVIEW (Dalam Evaluasi)</option>
                <option value="CLOSED">CLOSED (Selesai/Ditutup)</option>
              </select>
              <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={16} />
            </div>
          </div>

          {/* PIC Kasus */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
              Guru Penanggung Jawab (PIC)
            </label>
            <div className="relative">
              <select
                value={picId}
                onChange={(e) => {
                  setPicId(e.target.value);
                  const matched = teachers.find(t => t.uid === e.target.value);
                  if (matched) setPicName(matched.displayName || matched.name);
                }}
                className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none font-bold text-xs appearance-none cursor-pointer text-gray-900"
              >
                <option value="">{picName || 'Pilih Guru PIC'}</option>
                {teachers.map(t => (
                  <option key={t.uid} value={t.uid}>
                    {t.displayName || t.name} ({t.role})
                  </option>
                ))}
              </select>
              <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={16} />
            </div>
          </div>

          {/* Ringkasan Kasus / Concern */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
              Ringkasan Kasus / Kronologi
            </label>
            <textarea
              rows={3}
              value={lastConcernSummary}
              onChange={(e) => setLastConcernSummary(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none font-medium text-xs text-gray-900 leading-relaxed"
              placeholder="Deskripsi kronologi kejadian..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-gray-400 hover:text-gray-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Simpan Perubahan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [showEditCaseModal, setShowEditCaseModal] = React.useState(false);
  const [teachersList, setTeachersList] = React.useState<any[]>([]);

  React.useEffect(() => {
    getTeachers().then(res => setTeachersList(res || [])).catch(console.error);
  }, []);

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

  const handleDeleteConcern = async (concernId: string) => {
    if (!id) return;
    if (!window.confirm("Apakah Anda yakin ingin menghapus log kejadian ini?")) return;
    try {
      await deleteMTSSConcern(id, concernId);
      toast.success("Log kejadian berhasil dihapus.");
      const concernsData = await getMTSSConcerns(id);
      setConcerns(concernsData || []);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus log kejadian.");
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
    const params = new URLSearchParams(window.location.search);
    if (params.get('addConcern') === 'true') {
      setShowAddDataModal(true);
      setActiveTab('concerns');
      // Clean up URL parameter to avoid re-opening on reload
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [id]);

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
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-2">
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
        <div className="bg-white rounded-[3rem] p-12 border border-gray-100 shadow-2xl text-center space-y-4">
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
             Return to Go to Dashboard
           </button>
        </div>
      </div>
    );
  }

  const showSidebar = (mtssCase.tier === 'Tier 2') || (academicContext && academicContext.activeAcademicCaseId);

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
        {showEditCaseModal && (
          <EditCaseModal
            isOpen={showEditCaseModal}
            onClose={() => setShowEditCaseModal(false)}
            mtssCase={mtssCase}
            teachers={teachersList}
            onUpdated={(updates) => {
              setMtssCase(prev => prev ? ({ ...prev, ...updates }) : null);
            }}
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
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md relative overflow-hidden group/card">
        {/* Abstract Deco */}
        <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none group-hover/card:rotate-12 transition-transform duration-1000">
           <Activity size={120} />
        </div>
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div className="flex flex-col md:flex-row gap-6 items-center">
            {/* Avatar Section */}
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#002366] to-blue-800 flex items-center justify-center text-white text-2xl font-black italic tracking-tighter shadow-md ring-4 ring-blue-50/50">
                {mtssCase.studentName.split(' ').map(n => n[0]).join('')}
              </div>
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                  "absolute -bottom-2 -right-2 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border-2 border-white shadow-md",
                  mtssCase.tier === 'Tier 1' ? "bg-emerald-500 text-white" :
                  mtssCase.tier === 'Tier 2' ? "bg-amber-500 text-white" :
                  "bg-rose-500 text-white"
                )}
              >
                {mtssCase.tier}
              </motion.div>
            </div>
            
            {/* Info Section */}
            <div className="space-y-2 text-center md:text-left">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight uppercase leading-none">{mtssCase.studentName}</h1>
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-3 py-1 bg-blue-50 rounded-xl border border-blue-100/50">Kelas {mtssCase.classId}</span>
                </div>
                {(mtssCase.categoryLabel || mtssCase.categoryCode) && (
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 px-2.5 py-1 rounded-lg border border-rose-200 shadow-xs">
                      {mtssCase.categoryCode || 'Kategori'}
                    </span>
                    <span className="text-xs font-bold text-gray-800">
                      {mtssCase.categoryLabel}
                    </span>
                  </div>
                )}
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Student Behavior Profile</p>
              </div>

              <div className="flex flex-wrap justify-center md:justify-start items-center gap-6 text-[10px] font-black uppercase tracking-wider text-gray-400">
                <div className="flex items-center gap-1.5 group/meta">
                   <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner group-hover/meta:scale-105 transition-transform">
                      <UserCircle size={12} />
                   </div>
                   Reporter: <span className="text-gray-900">{mtssCase.picName}</span>
                </div>
                <div className="flex items-center gap-1.5 group/meta">
                   <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner group-hover/meta:scale-105 transition-transform">
                      <Clock size={12} />
                   </div>
                   AY: <span className="text-gray-900">{mtssCase.academicYear}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border ${mtssCase.status === 'UNDER_REVIEW' ? 'bg-purple-50 border-purple-100 text-purple-600' : mtssCase.status === 'CLOSED' ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                   <div className={cn("w-1.5 h-1.5 rounded-full", 
                     mtssCase.status === 'OPEN' ? "bg-blue-500" :
                     mtssCase.status === 'IN_PROGRESS' ? "bg-amber-500" :
                     mtssCase.status === 'UNDER_REVIEW' ? "bg-purple-500" :
                     "bg-gray-400"
                   )} />
                   <span className="text-[9px] font-black uppercase tracking-wider">{mtssCase.status.replace('_', ' ')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <button 
              onClick={() => setShowEditCaseModal(true)}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm hover:-translate-y-0.5 active:scale-95"
            >
                <Pencil size={15} /> Edit Kasus
            </button>
            {mtssCase.status !== 'CLOSED' && (
              <>
                <button 
                  onClick={() => setShowAddDataModal(true)}
                  className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:-translate-y-0.5 active:scale-95"
                >
                    <Plus size={16} /> Tambah Data Baru
                </button>
                
                {mtssCase.tier === 'Tier 1' && (
                  <button 
                    onClick={() => setShowTier2MeetingModal(true)}
                    className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:-translate-y-0.5 active:scale-95"
                  >
                      <TrendingUp size={16} /> Eskalasi ke Tier 2
                  </button>
                )}

                <button 
                  onClick={() => setShowCloseCaseModal(true)}
                  className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md"
                >
                    Tutup Kasus
                </button>
              </>
            )}
          </div>
        </div>
      </div>


      <div className={cn(showSidebar ? "grid grid-cols-1 lg:grid-cols-4 gap-8" : "space-y-8")}>
        {showSidebar && (
          <div className="lg:col-span-1 space-y-4">
            {/* CICO Mini Dashboard */}
            {mtssCase.tier === 'Tier 2' && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-6 relative overflow-hidden group/cico-dash">
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover/cico-dash:scale-110 transition-transform duration-1000">
                   <TrendingUp size={120} />
                </div>
                
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shadow-inner">
                      <TrendingUp size={20} />
                   </div>
                   <div>
                     <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest italic tracking-tighter">CICO Tracker</h4>
                     <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Quick Summary</p>
                   </div>
                </div>

                <div className="space-y-6">
                   {/* Progress Bar */}
                   <div className="space-y-2">
                     <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Cycle Progress</p>
                        <p className="text-[9px] font-black text-gray-900 uppercase tracking-widest">Minggu 3 / 4</p>
                     </div>
                     <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: '75%' }}
                         className="absolute h-full bg-amber-500 rounded-full"
                        />
                     </div>
                   </div>

                   {/* Avg Score */}
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Nilai Rata-rata</p>
                         <div className="flex items-baseline gap-1">
                            <p className="text-2xl font-black text-gray-900 italic tracking-tighter leading-none">
                               {allCicoReports.length > 0 
                                 ? (allCicoReports.reduce((acc, curr) => acc + curr.dailyAvgScore, 0) / allCicoReports.length).toFixed(1)
                                 : '0.0'}
                            </p>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">/ 3.0</p>
                         </div>
                      </div>
                      {allCicoReports.length > 0 && (
                        <div className={cn(
                          "px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest",
                          (allCicoReports.reduce((acc, curr) => acc + curr.dailyAvgScore, 0) / allCicoReports.length) >= 2.4 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                            : "bg-amber-50 text-amber-600 border-amber-100"
                        )}>
                          {((allCicoReports.reduce((acc, curr) => acc + curr.dailyAvgScore, 0) / allCicoReports.length) / 3 * 100).toFixed(0)}% SUCCESS
                        </div>
                      )}
                   </div>

                   {/* Heatmap Placeholder */}
                   <div className="space-y-3 pt-3 border-t border-gray-100">
                     <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Activity Heatmap (Past 20 entries)</p>
                     <div className="grid grid-cols-5 gap-1.5">
                         {allCicoReports.slice(0, 20).reverse().map((report, i) => (
                           <div 
                             key={report.id} 
                             className={cn(
                               "aspect-square rounded-md transition-all hover:scale-110 cursor-help",
                               report.isAbsent ? "bg-gray-200" :
                               report.dailyAvgScore >= 2.4 ? "bg-emerald-500" : 
                               report.dailyAvgScore >= 2.0 ? "bg-amber-400" : "bg-red-400"
                             )} 
                             title={`${formatDate(report.date)}: ${report.dailyAvgScore.toFixed(1)}`}
                           />
                         ))}
                         {Array.from({ length: Math.max(0, 20 - allCicoReports.length) }).map((_, i) => (
                           <div key={`empty-${i}`} className="aspect-square rounded-md bg-gray-50 h-full w-full" />
                         ))}
                     </div>
                   </div>

                   <button 
                     onClick={() => navigate(`/mtss/cico/${mtssCase.id}`)}
                     className="w-full bg-amber-50 hover:bg-amber-100 text-amber-600 py-3 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all border border-amber-100/30 flex items-center justify-center gap-1.5"
                   >
                      Review Detailed Charts <TrendingUp size={12} />
                   </button>
                </div>
              </div>
            )}

            {/* Academic Context Integration */}
            {academicContext && academicContext.activeAcademicCaseId && (
              <div className="bg-white rounded-2xl p-6 border border-violet-100 shadow-sm space-y-6 relative overflow-hidden group/academic-dash">
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover/academic-dash:scale-110 transition-transform duration-1000">
                   <BookOpen size={120} />
                </div>
                
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-violet-50 text-violet-600 rounded-xl shadow-inner">
                      <BookOpen size={20} />
                   </div>
                   <div>
                     <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest italic tracking-tighter">Academic Support</h4>
                     <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Linked Intervention</p>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="p-4 bg-violet-50/50 rounded-xl border border-violet-100">
                      <div className="flex items-center justify-between mb-1.5">
                         <span className="text-[9px] font-black text-violet-700 uppercase tracking-widest">{academicContext.currentTier}</span>
                         <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                           academicContext.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                         }`}>{academicContext.status}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 leading-tight uppercase italic">{academicContext.domains.join(' • ')}</p>
                   </div>

                   <button 
                     onClick={() => navigate(`/junior-high/academic/mtss/cases/${academicContext.activeAcademicCaseId}`)}
                     className="w-full bg-slate-900 hover:bg-violet-600 text-white py-3 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                   >
                      Open Academic Case <ExternalLink size={12} />
                   </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Middle/Main Content Column */}
        <div className={cn(showSidebar ? "lg:col-span-3 space-y-6" : "space-y-6")}>
          {/* Tab Bar Implementation */}
          <div className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-xl border border-gray-100 shadow-sm sticky top-4 z-40 backdrop-blur-md bg-white/90">
             {[
               { id: 'overview', label: 'Overview', icon: FileText },
               { id: 'concerns', label: 'Incident Units', icon: Activity },
               { id: 'cico', label: 'CICO Analytics', icon: TrendingUp },
               { id: 'home-programme', label: 'Home Programme', icon: UserCircle },
             ].filter(tab => {
               if (tab.id === 'cico') return mtssCase.tier !== 'Tier 1';
               return true;
             }).map((tab) => (
               <button
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id as any)}
                 className={cn(
                   "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                   activeTab === tab.id 
                     ? "bg-gray-900 text-white shadow-md active:scale-95" 
                     : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                 )}
               >
                 <tab.icon size={12} />
                 {tab.label}
               </button>
             ))}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5">
              {/* Active Alerts Banner */}
              {activeAlerts.length > 0 && mtssCase?.status !== 'CLOSED' && mtssCase?.status !== 'archived' && (
                <div className="space-y-3">
                  {activeAlerts.map(alert => (
                    <motion.div 
                      key={alert.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "p-4 rounded-xl border flex items-center justify-between gap-4 shadow-sm",
                        alert.severity === 'HIGH' ? "bg-rose-50 border-rose-100 text-rose-900" :
                        alert.severity === 'WARNING' ? "bg-amber-50 border-amber-100 text-amber-900" :
                        "bg-blue-50 border-blue-100 text-blue-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                         <div className={cn(
                           "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-inner",
                           alert.severity === 'HIGH' ? "bg-rose-500 text-white" :
                           alert.severity === 'WARNING' ? "bg-amber-500 text-white" :
                           "bg-blue-500 text-white"
                         )}>
                            {alert.severity === 'HIGH' ? <ShieldAlert size={18} /> : <Info size={18} />}
                         </div>
                         <div>
                            <h4 className="text-xs font-black uppercase tracking-tight italic leading-none">{alert.title}</h4>
                            <p className="text-[11px] font-medium opacity-70 mt-1 leading-snug">{alert.message}</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{formatDate(alert.createdAt)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Mini Dashboard Row */}
              <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none">MTSS Status</h4>
                    <p className="text-base font-black text-gray-900 uppercase italic tracking-tight mt-0.5">{mtssCase.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 bg-gray-50 rounded-lg text-center min-w-[100px]">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Total Concerns</p>
                    <p className="text-lg font-black text-gray-900 leading-none mt-0.5">{concerns.length}</p>
                  </div>
                  <div className="px-4 py-2 bg-gray-50 rounded-lg text-center min-w-[100px]">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Tier</p>
                    <p className="text-lg font-black text-gray-900 leading-none mt-0.5">{mtssCase.tier}</p>
                  </div>
                </div>
              </div>

              {/* Special Tier Logic Panels (Now part of Overview) */}
              <div className="grid grid-cols-1 gap-6">
                 {/* Tier 2 Specifics */}
                 {mtssCase.tier === 'Tier 2' && (
                   <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl p-5 border border-amber-100 shadow-sm space-y-6 relative overflow-hidden group/t2">
                      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover/t2:scale-110 transition-transform duration-1000">
                         <TrendingUp size={120} />
                      </div>
                      <div className="flex items-center gap-5">
                         <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shadow-inner ring-4 ring-amber-50">
                            <TrendingUp size={24} />
                         </div>
                         <div>
                            <h4 className="text-lg font-black text-gray-900 italic tracking-tighter uppercase leading-none">Tier 2 Support</h4>
                            <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mt-1">CICO Tracker Active</p>
                         </div>
                      </div>

                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div 
                              onClick={() => setShowCicoInputModal(true)}
                              className={cn(
                                "p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden group/btn",
                                todayReport ? "bg-white border-emerald-100 hover:border-emerald-200" : "bg-amber-50 border-amber-100 hover:bg-white hover:border-amber-200"
                              )}
                            >
                               <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest relative z-10">CICO Daily Input</p>
                               <p className="text-xs font-black text-gray-900 mt-1 uppercase italic tracking-tighter relative z-10">
                                  {todayReport ? 'Update Hari Ini' : 'Input Hari Ini'}
                               </p>
                               {todayReport && (
                                 <CheckCircle2 size={12} className="absolute top-2 right-2 text-emerald-500" />
                               )}
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white hover:border-amber-200 transition-all cursor-pointer text-center flex flex-col justify-center items-center">
                               <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Analytics</p>
                               <p className="text-xs font-black text-blue-600 mt-1.5 uppercase italic tracking-tighter cursor-pointer" onClick={() => setActiveTab('cico')}>Dashboard</p>
                            </div>
                        </div>
                         
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 space-y-2 relative">
                            <h5 className="text-[9px] font-black text-amber-800 uppercase tracking-widest">Behavior Contract</h5>
                            <p className="text-xs font-semibold text-gray-800 leading-relaxed italic border-l-4 border-amber-400 pl-4">
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
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5">
               <div className="bg-white rounded-xl p-5 border border-blue-900 shadow-sm space-y-6 relative overflow-hidden group/t3">
                  <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover/t3:rotate-12 transition-transform duration-1000">
                     <ShieldCheck size={120} />
                  </div>
                  <div className="flex items-center gap-4 relative z-10">
                     <div className="w-12 h-12 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-inner">
                        <ShieldCheck size={24} />
                     </div>
                     <div>
                        <h4 className="text-xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Intensive Plan</h4>
                        <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mt-1 italic">Behavior Intervention Plan (BIP)</p>
                     </div>
                  </div>

                  {!canSeeTier3 && mtssCase.tier === 'Tier 3' ? (
                    <div className="p-8 bg-gray-50 rounded-xl text-center space-y-4 border border-gray-100 relative z-10">
                       <Lock size={40} className="text-rose-500/40 mx-auto" />
                       <div>
                          <p className="text-lg font-black uppercase italic tracking-tighter text-gray-900">Confidential Access Only</p>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2 leading-relaxed max-w-xl mx-auto">
                             Dokumen BIP Tier 3 hanya dapat diakses oleh Counselor, Kepala Sekolah, dan Admin.
                          </p>
                       </div>
                    </div>
                  ) : (
                    <div className="space-y-6 relative z-10">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                             <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Plan Overview</p>
                             <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 italic font-medium text-gray-700 leading-relaxed text-xs">
                                {bipPlan?.targetBehaviors || "Strategi intensif yang melibatkan psikolog eksternal dan monitoring berkelanjutan."}
                             </div>
                          </div>
                          <div className="space-y-4">
                             <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Collaborative Strategies</p>
                             <p className="text-xs font-semibold text-gray-600 leading-relaxed pt-1">
                               {bipPlan?.replacementBehaviors || "Strategi pengganti perilaku sedang dikembangkan."}
                             </p>
                          </div>
                       </div>
                       
                       <div className="flex gap-3">
                          <Link to={`/mtss/intervention/${id}`} className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md hover:bg-blue-600">
                             <ExternalLink size={14} /> Open Full BIP Document & Signatures
                          </Link>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          )}


          {activeTab === 'concerns' && (
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-5">
               <div className="flex items-center justify-between px-6">
                  <div className="flex items-center gap-5">
                     <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 text-blue-600 flex items-center justify-center shadow-sm">
                        <History size={18} />
                     </div>
                     <div>
                        <h3 className="text-xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Timeline Kejadian</h3>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                          <Activity size={12} className="text-blue-400" />
                          Concerns & Tier 1 Data Summary
                        </p>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg">Total {concerns.length} Units</span>
                  </div>
               </div>

               <div className="relative pl-8 md:pl-16 space-y-10 before:absolute before:left-[19px] md:left-[35px] before:top-4 before:bottom-4 before:w-[4px] before:bg-gray-100 before:rounded-full">
                  {concerns.length === 0 ? (
                    <div className="py-10 text-center border-2 border-dashed border-gray-100 rounded-xl">
                       <p className="text-sm font-black text-gray-300 uppercase italic tracking-tighter">No concerns recorded yet</p>
                    </div>
                  ) : concerns.map((concern, idx) => (
                    <div key={concern.id} className="relative group/line">
                       {/* Timeline Node */}
                       <div className={cn(
                         "absolute -left-[19px] md:-left-[27px] top-4 w-9 h-9 rounded-full border-4 border-white shadow-md flex items-center justify-center z-10 transition-transform group-hover/line:scale-110 duration-500",
                         concern.isDone ? "bg-emerald-500" : "bg-blue-600 ring-8 ring-blue-50"
                       )}>
                          {concern.isDone ? <Check size={14} className="text-white" /> : <MessageSquare size={14} className="text-white" />}
                       </div>

                       {/* Incident Card */}
                       <motion.div 
                          initial={{ opacity: 0, x: -30 }} 
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          className={cn(
                            "bg-white rounded-xl p-5 border transition-all duration-500 group/card relative hover:shadow-md",
                            concern.isDone ? "border-emerald-50 shadow-sm" : "border-blue-100 shadow-2xl ring-4 ring-blue-50/30"
                          )}
                       >
                          {/* Status Done Indicator */}
                          {concern.isDone && (
                            <div className="absolute top-4 right-4 flex items-center gap-2 py-1 px-3 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shadow-sm">
                               <CheckCircle2 size={14} />
                               <span className="text-[10px] font-black uppercase tracking-widest">Selesai: {formatDate(concern.doneAt?.toString() || '')}</span>
                            </div>
                          )}

                          <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                             <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                   <span className={cn(
                                     "text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-inner",
                                     concern.isDone ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                                   )}>
                                      Record Unit {concerns.length - idx}
                                   </span>
                                   <div className="flex items-center gap-3 text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                      <Calendar size={12} className="text-blue-400" />
                                      {formatDate(concern.date)}
                                   </div>
                                </div>
                                <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] ml-2">Behavior Concern Summary</h4>
                                {concern.categoryLabel && (
                                  <div className="flex items-center gap-2 pt-1 ml-2">
                                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                                      {concern.categoryCode || 'Kategori'}
                                    </span>
                                    <span className="text-xs font-bold text-gray-800">
                                      {concern.categoryLabel}
                                    </span>
                                  </div>
                                )}
                             </div>
                             <button 
                                onClick={() => handleDeleteConcern(concern.id)}
                                className="text-red-400 hover:text-red-600 transition-colors p-2 rounded-xl hover:bg-red-50 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                                title="Hapus Log"
                             >
                                <Trash2 size={14} />
                                <span>Hapus Log</span>
                             </button>
                          </div>

                          {/* Description Narrative */}
                          <div className="mb-6">
                             <p className="text-base font-semibold text-gray-800 leading-relaxed italic max-w-4xl tracking-tight">
                                "{concern.description}"
                             </p>
                          </div>

                          {/* Details Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-gray-50">
                             <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                   <ClipboardList size={14} className="text-blue-400" />
                                   <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Interventions Tried</h5>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                   {concern.interventionsTried.map((it, i) => (
                                     <span key={i} className="px-2 py-1 bg-gray-50 text-gray-600 text-[9px] font-medium rounded-lg border border-gray-100 shadow-sm">{it}</span>
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

                             <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100 shadow-inner group/next">
                                <div className="flex items-center justify-between">
                                   <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Action Plan (Next)</h5>
                                   <div className="bg-rose-50 text-rose-500 px-3 py-1 rounded-lg text-[9px] font-black uppercase">Due: {concern.nextStepDueDate}</div>
                                </div>
                                <div className="space-y-4">
                                   <p className="text-sm font-black text-gray-900 tracking-tight uppercase italic leading-tight group-hover/next:translate-x-1 transition-transform">{concern.nextSteps}</p>
                                   <div className="flex items-center justify-between pt-4 border-t border-gray-200/50">
                                      <div className="flex items-center gap-3">
                                         <div className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center text-[10px] font-black uppercase shadow-xl">
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
                    className="bg-white border-2 border-dashed border-gray-200 text-gray-400 px-8 py-4 rounded-xl font-black text-xs uppercase tracking-wider hover:border-blue-300 hover:text-blue-600 transition-all group flex items-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  >
                     <div className="w-8 h-8 bg-gray-50 group-hover:bg-blue-50 text-gray-300 group-hover:text-blue-600 rounded-lg flex items-center justify-center transition-all">
                        <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                     </div>
                     Record New Concern Data
                  </button>
               </div>
            </section>
          )}

          {(activeTab === 'cico' && mtssCase.tier !== 'Tier 1') && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5">
              <div className="bg-white rounded-xl p-5 border border-amber-100 shadow-sm space-y-4 relative overflow-hidden group/t2">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover/t2:scale-150 transition-transform duration-1000">
                  <TrendingUp size={120} />
                </div>
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shadow-inner ring-4 ring-amber-50">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-gray-900 italic tracking-tighter uppercase leading-none">Tier 2 Support</h4>
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mt-1">CICO Tracker Active</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div 
                      onClick={() => setShowCicoInputModal(true)}
                      className={cn(
                        "p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden group/btn text-center",
                        todayReport ? "bg-white border-emerald-100 hover:border-emerald-200" : "bg-amber-50 border-amber-100 hover:bg-white hover:border-amber-200"
                      )}
                    >
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest relative z-10">CICO Daily Input</p>
                      <p className="text-xs font-black text-gray-900 mt-1 uppercase italic tracking-tighter relative z-10">
                        {todayReport ? 'Update Hari Ini' : 'Input Hari Ini'}
                      </p>
                      {todayReport && (
                        <CheckCircle2 size={12} className="absolute top-2 right-2 text-emerald-500" />
                      )}
                    </div>
                    <div 
                      onClick={() => setShowWeeklyReflectionModal(true)}
                      className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white hover:border-blue-200 transition-all cursor-pointer text-center group/refl"
                    >
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Weekly Refl.</p>
                      <p className="text-xs font-black text-blue-600 mt-1.5 uppercase italic tracking-tighter group-hover/refl:underline decoration-2">Fill Report</p>
                    </div>
                  </div>
                  
                  <Link to={`/mtss/cico/${mtssCase.id}`} className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-blue-600 transition-all group">
                    Open Detailed Charts <TrendingUp size={14} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </Link>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-4">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <Activity size={18} />
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
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5">
               <div className="bg-white rounded-xl p-5 border border-emerald-100 shadow-sm space-y-6 relative overflow-hidden group/hp">
                  <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover/hp:scale-110 transition-transform duration-1000">
                     <UserCircle size={100} />
                  </div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-6">
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                        <UserCircle size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Home Programme</h3>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                           <Activity size={12} className="text-emerald-400" />
                           Parent Collaboration Portal Settings
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-gray-900 p-3 rounded-xl shadow-md">
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
                          "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                          hpIsVisible ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20" : "bg-white/10 text-white/40"
                        )}
                      >
                        {hpIsVisible ? 'PUBLISHED' : 'PRIVATE'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="space-y-6">
                       <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                         <Star size={12} className="text-amber-500" /> Counselor Motivation Message
                       </label>
                       <textarea 
                         value={hpMotivation}
                         onChange={(e) => setHpMotivation(e.target.value)}
                         placeholder="Tulis pesan penyemangat untuk orang tua & siswa..."
                         className="w-full h-32 p-4 bg-gray-50 rounded-xl border border-gray-100 focus:border-emerald-200 outline-none text-xs font-medium leading-relaxed placeholder:italic text-gray-800 transition-all focus:bg-white resize-none shadow-inner"
                       />
                       <p className="text-[9px] font-medium text-gray-400 italic px-6 leading-relaxed">
                         Pesan ini akan dilihat orang tua di halaman utama Home Programme mereka.
                       </p>
                    </div>
                    
                    <div className="space-y-10">
                       <div className="bg-gray-50 rounded-xl border border-gray-200/50 p-4 space-y-4">
                          <h5 className="text-[10px] font-black text-gray-900 uppercase tracking-widest italic border-b border-gray-200 pb-3">Home Programme Highlights</h5>
                          <div className="space-y-6">
                             <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Weeks Published</span>
                                <span className="text-sm font-black text-emerald-600">{mtssCase.homeProgramme?.publishedWeeks?.length || 0} Weeks</span>
                             </div>
                          </div>
                       </div>
                       
                       <button 
                        onClick={handleSaveHomeProgramme}
                        className="w-full bg-gray-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                       >
                         <CheckCircle2 size={14} /> Simpan Data Program
                       </button>
                    </div>
                  </div>
               </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
