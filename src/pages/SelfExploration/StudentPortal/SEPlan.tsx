import * as React from 'react';
import { 
  ChevronLeft, Sparkles, AlertCircle, Calendar, Clock, 
  UploadCloud, Trash2, CheckCircle2, Save, Send, Loader2, Info, Lock
} from 'lucide-react';
import { 
  getSEPeriods, getSEEnrollment, db, storage, ref, uploadBytes, 
  getDownloadURL, deleteObject 
} from '../../../lib/firebase';
import { SEPeriod, SEEnrollment, Student, SEStrand } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { doc, getDoc, setDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';

interface WeekPlan {
  weekNumber: number;
  studentTarget: string;
  supervisorNotes: string;
}

interface SinglePlan {
  planIndex: number;
  strand: string;
  activity: string;
  objective: string;
  currentLevel: string;
  weeks: WeekPlan[];
  status: "draft" | "submitted" | "verified";
  photoUrl: string | null;
  scanConfidence: "high" | "low" | null;
}

interface StudentPlansDoc {
  grade: number;
  planCount: number;
  plans: SinglePlan[];
  updatedAt?: number;
}

const MANDATED_WEEKS: Record<number, string> = {
  1: "Goal Setting & Plan Alignment",
  2: "Pre-assessment",
  8: "Mid-Term Evaluation",
  15: "Self Assessment",
  16: "Exhibition Prep",
  17: "Exhibition & Reflection"
};

const createDefaultWeeks = (): WeekPlan[] => {
  return Array.from({ length: 17 }, (_, i) => {
    const weekNum = i + 1;
    return {
      weekNumber: weekNum,
      studentTarget: MANDATED_WEEKS[weekNum] || "",
      supervisorNotes: ""
    };
  });
};

const STRANDS_CONFIG: { id: SEStrand; label: string; color: string; desc: string }[] = [
  { id: 'Imaginal', label: 'Imaginal', color: 'text-pink-600 bg-pink-50 border-pink-100', desc: 'Imagination & Creativity' },
  { id: 'Rational', label: 'Rational', color: 'text-blue-600 bg-blue-50 border-blue-100', desc: 'Cognitive Flexibility' },
  { id: 'Physical', label: 'Material/Physical', color: 'text-amber-600 bg-amber-50 border-amber-100', desc: 'Physical fitness & practical skills' }
];

export default function SEPlan() {
  const { periodId } = useParams();
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [activePeriod, setActivePeriod] = React.useState<SEPeriod | null>(null);
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [enrollment, setEnrollment] = React.useState<SEEnrollment | null>(null);
  const [plansDoc, setPlansDoc] = React.useState<StudentPlansDoc | null>(null);
  const [activePlanTab, setActivePlanTab] = React.useState<number>(1);

  const [loading, setLoading] = React.useState(true);
  const [savingPlanIndex, setSavingPlanIndex] = React.useState<number | null>(null);
  const [scanningPlanIndex, setScanningPlanIndex] = React.useState<number | null>(null);
  const [feedbackMsg, setFeedbackMsg] = React.useState<{ [key: number]: { text: string; type: 'success' | 'error' } }>({});

  const fileInputRefs = React.useRef<{ [key: number]: HTMLInputElement | null }>({});

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const fetchData = React.useCallback(async () => {
    if (!profile?.email || !periodId) return;

    try {
      // Get Period Info
      const periods = await getSEPeriods('JUNIOR_HIGH');
      const currentPeriod = periods.find(p => p.id === periodId);
      if (currentPeriod) {
        setActivePeriod(currentPeriod);
      }

      // Get Student Profile
      const sSnap = await getDocs(query(collection(db, 'students'), where('email', '==', profile.email), limit(1)));
      if (!sSnap.empty) {
        const student = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() } as Student;
        setStudentData(student);

        // Get Enrollment (to get pre-fill choices if any)
        const enroll = await getSEEnrollment(periodId, student.id);
        setEnrollment(enroll || null);

        // Get Plans document
        const planDocRef = doc(db, 'selfExploration', student.id, 'plans', periodId);
        const planDocSnap = await getDoc(planDocRef);

        if (planDocSnap.exists()) {
          const loadedData = planDocSnap.data() as StudentPlansDoc;
          
          // Ensure structure is correct and contains full 17 weeks for each plan
          const updatedPlans = loadedData.plans.map(p => {
            const cleanWeeks = Array.from({ length: 17 }, (_, i) => {
              const wNum = i + 1;
              const found = p.weeks?.find(w => w.weekNumber === wNum);
              return {
                weekNumber: wNum,
                studentTarget: MANDATED_WEEKS[wNum] || (found ? found.studentTarget : ""),
                supervisorNotes: found ? found.supervisorNotes || "" : ""
              };
            });
            return { ...p, weeks: cleanWeeks };
          });

          setPlansDoc({
            ...loadedData,
            plans: updatedPlans
          });
        } else {
          // Initialize fresh plans structure
          const grade = student.grade || 7;
          const planCount = grade === 9 ? 1 : 2;
          const initialPlans: SinglePlan[] = Array.from({ length: planCount }, (_, idx) => {
            const pIndex = idx + 1;
            const choice = enroll?.choices?.find((c: any) => c.slot === pIndex);
            return {
              planIndex: pIndex,
              strand: choice?.strand || "",
              activity: choice?.activityName || "",
              objective: "",
              currentLevel: "",
              weeks: createDefaultWeeks(),
              status: "draft",
              photoUrl: null,
              scanConfidence: null
            };
          });

          setPlansDoc({
            grade,
            planCount,
            plans: initialPlans
          });
        }
      }
    } catch (err) {
      console.error("Error loading plans data:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.email, periodId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showFeedback = (planIndex: number, text: string, type: 'success' | 'error') => {
    setFeedbackMsg(prev => ({ ...prev, [planIndex]: { text, type } }));
    setTimeout(() => {
      setFeedbackMsg(prev => {
        const copy = { ...prev };
        delete copy[planIndex];
        return copy;
      });
    }, 5000);
  };

  const handleFieldChange = (planIndex: number, field: keyof SinglePlan, value: any) => {
    if (!plansDoc) return;
    const updatedPlans = plansDoc.plans.map(p => {
      if (p.planIndex === planIndex) {
        return { ...p, [field]: value };
      }
      return p;
    });
    setPlansDoc({ ...plansDoc, plans: updatedPlans });
  };

  const handleWeekTargetChange = (planIndex: number, weekNumber: number, text: string) => {
    if (!plansDoc) return;
    const updatedPlans = plansDoc.plans.map(p => {
      if (p.planIndex === planIndex) {
        const updatedWeeks = p.weeks.map(w => {
          if (w.weekNumber === weekNumber) {
            return { ...w, studentTarget: text };
          }
          return w;
        });
        return { ...p, weeks: updatedWeeks };
      }
      return p;
    });
    setPlansDoc({ ...plansDoc, plans: updatedPlans });
  };

  const savePlan = async (planIndex: number, overrideStatus?: "draft" | "submitted") => {
    if (!plansDoc || !studentData || !periodId) return;
    setSavingPlanIndex(planIndex);

    const planToSave = plansDoc.plans.find(p => p.planIndex === planIndex);
    if (!planToSave) return;

    try {
      const nextStatus = overrideStatus || planToSave.status || "draft";
      
      // Update local state first
      const updatedPlans = plansDoc.plans.map(p => {
        if (p.planIndex === planIndex) {
          return { ...p, status: nextStatus };
        }
        return p;
      });

      const updatedDocPayload: StudentPlansDoc = {
        ...plansDoc,
        plans: updatedPlans,
        updatedAt: Date.now()
      };

      const docRef = doc(db, 'selfExploration', studentData.id, 'plans', periodId);
      await setDoc(docRef, updatedDocPayload, { merge: true });
      
      setPlansDoc(updatedDocPayload);
      showFeedback(
        planIndex, 
        nextStatus === "submitted" ? "Rencana berhasil dikirim untuk verifikasi!" : "Rencana mingguan berhasil disimpan!", 
        "success"
      );
    } catch (err: any) {
      console.error("Save plan failed:", err);
      showFeedback(planIndex, `Gagal menyimpan rencana: ${err.message}`, "error");
    } finally {
      setSavingPlanIndex(null);
    }
  };

  const handleFileUpload = async (planIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !studentData || !activePeriod) return;

    setScanningPlanIndex(planIndex);
    try {
      // 1. Upload original photo to Firebase Storage
      const sanitizedAY = activePeriod.academicYear.replace('/', '_');
      const storagePath = `self-exploration/${sanitizedAY}/${activePeriod.semester}/${activePeriod.id}/${studentData.id}/plan-${planIndex}/scan_photo_${Date.now()}_${file.name}`;
      const fileRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(fileRef, file);
      const photoUrl = await getDownloadURL(snapshot.ref);

      // 2. Transcribe using backend API route
      const base64 = await fileToBase64(file);
      const scanRes = await fetch("/api/self-exploration/scan-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: base64 })
      });

      if (!scanRes.ok) {
        throw new Error("Server gagal memproses transkripsi vision.");
      }

      const scanData = await scanRes.json();
      if (!scanData.success || !scanData.weeks) {
        throw new Error(scanData.error || "Gagal menginterpretasi struktur tabel.");
      }

      // 3. Merging scanned targets with mandated weeks constraint
      if (plansDoc) {
        const updatedPlans = plansDoc.plans.map(p => {
          if (p.planIndex === planIndex) {
            const cleanWeeks = Array.from({ length: 17 }, (_, idx) => {
              const wNum = idx + 1;
              const scanItem = scanData.weeks.find((sw: any) => sw.weekNumber === wNum);
              return {
                weekNumber: wNum,
                studentTarget: MANDATED_WEEKS[wNum] || (scanItem ? scanItem.studentTarget || "" : ""),
                supervisorNotes: ""
              };
            });
            return {
              ...p,
              photoUrl,
              scanConfidence: "high" as const,
              weeks: cleanWeeks
            };
          }
          return p;
        });

        setPlansDoc({ ...plansDoc, plans: updatedPlans });
        showFeedback(planIndex, "Scan AI selesai! Silakan review hasil transkripsi sebelum menyimpan.", "success");
      }
    } catch (err: any) {
      console.error("Scanning failed:", err);
      showFeedback(planIndex, `Scan AI Gagal: ${err.message}. Masukkan target secara manual.`, "error");
    } finally {
      setScanningPlanIndex(null);
    }
  };

  const removePhoto = async (planIndex: number) => {
    if (!plansDoc) return;
    const plan = plansDoc.plans.find(p => p.planIndex === planIndex);
    if (!plan || !plan.photoUrl) return;

    try {
      // Find storage reference and delete it
      const fileRef = ref(storage, plan.photoUrl);
      await deleteObject(fileRef).catch(e => console.warn("Delete storage file failed (might be already deleted):", e));

      const updatedPlans = plansDoc.plans.map(p => {
        if (p.planIndex === planIndex) {
          return { ...p, photoUrl: null, scanConfidence: null };
        }
        return p;
      });

      setPlansDoc({ ...plansDoc, plans: updatedPlans });
      showFeedback(planIndex, "Foto berhasil dihapus.", "success");
    } catch (err: any) {
      console.error("Remove photo failed:", err);
      showFeedback(planIndex, "Gagal menghapus foto.", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest animate-pulse">Menghubungkan Database...</p>
      </div>
    );
  }

  if (!activePeriod || !studentData || !plansDoc) {
    return (
      <div className="p-20 bg-gray-50 rounded-[3rem] border border-gray-200 text-center space-y-4 max-w-2xl mx-auto mt-10">
         <div className="w-16 h-16 bg-white rounded-3xl shadow-lg flex items-center justify-center mx-auto text-gray-400">
            <AlertCircle size={32} />
         </div>
         <h2 className="text-xl font-black text-gray-900 uppercase italic">Terjadi Kesalahan</h2>
         <p className="text-gray-500 font-medium">Gagal memproses data rencana. Silakan kembali beberapa saat lagi.</p>
         <button onClick={() => navigate('/self-exploration/my')} className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest">
            Kembali ke Beranda
         </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 max-w-6xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/self-exploration/my')} 
            className="w-14 h-14 bg-white border border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:text-blue-600 transition-all shadow-sm shrink-0"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <span className="px-4 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-100">
                Grade {studentData.grade} • {studentData.nisn}
              </span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">My Plan Target</span>
            </div>
            <h1 className="text-3xl font-black italic uppercase text-gray-900 tracking-tight mt-1">17-Week Activity Plan</h1>
          </div>
        </div>

        {/* Period Details */}
        <div className="bg-white px-6 py-4 border border-gray-100 rounded-3xl flex items-center gap-4 shadow-sm">
          <Calendar size={18} className="text-blue-600" />
          <div className="text-xs">
            <p className="font-black text-gray-900 uppercase">{activePeriod.label}</p>
            <p className="text-gray-400 font-semibold">{activePeriod.totalSessions} Sesi Pembimbingan</p>
          </div>
        </div>
      </div>

      {/* Plan tabs (Only if more than 1 plan is active) */}
      {plansDoc.planCount > 1 && (
        <div className="flex border-b border-gray-100 gap-2 pb-1">
          {plansDoc.plans.map(p => {
            const hasSlot = enrollment?.choices?.find((c: any) => c.slot === p.planIndex);
            const slotStrand = hasSlot?.strand || p.strand || `Slot ${p.planIndex}`;
            return (
              <button
                key={p.planIndex}
                onClick={() => setActivePlanTab(p.planIndex)}
                className={cn(
                  "px-8 py-4 font-black uppercase text-[10px] tracking-widest transition-all rounded-t-3xl border-t border-x",
                  activePlanTab === p.planIndex
                    ? "bg-white text-blue-600 border-gray-100 shadow-sm"
                    : "bg-gray-50/50 text-gray-400 border-transparent hover:text-gray-600"
                )}
              >
                Plan {p.planIndex} ({slotStrand})
              </button>
            );
          })}
        </div>
      )}

      {/* Active Plan Content Container */}
      <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm p-8 sm:p-10">
        {plansDoc.plans.map((plan) => {
          if (plansDoc.planCount > 1 && plan.planIndex !== activePlanTab) return null;

          const isSubmitted = plan.status === 'submitted' || plan.status === 'verified';
          const feedback = feedbackMsg[plan.planIndex];

          return (
            <div key={plan.planIndex} className="space-y-10">
              
              {/* Top Meta Details & Verification Status Banner */}
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 p-6 bg-gray-50/60 rounded-[2rem] border border-gray-100">
                <div className="space-y-2">
                  <span className={cn(
                    "px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                    plan.status === 'verified' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    plan.status === 'submitted' ? "bg-blue-50 text-blue-600 border-blue-100" :
                    "bg-gray-100 text-gray-500 border-gray-200"
                  )}>
                    {plan.status === 'verified' ? "Disetujui Pembimbing" : 
                     plan.status === 'submitted' ? "Menunggu Verifikasi" : "Draft"}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Aktivitas Terdaftar:</p>
                    <p className="text-sm font-extrabold text-gray-800">{plan.activity || "Tidak Terdaftar"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full lg:w-auto">
                  <button
                    disabled={isSubmitted || savingPlanIndex !== null || scanningPlanIndex !== null}
                    onClick={() => savePlan(plan.planIndex, "draft")}
                    className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {savingPlanIndex === plan.planIndex ? (
                      <Loader2 size={14} className="animate-spin text-gray-500" />
                    ) : (
                      <Save size={14} />
                    )}
                    Simpan Draft
                  </button>

                  <button
                    disabled={isSubmitted || savingPlanIndex !== null || scanningPlanIndex !== null}
                    onClick={() => savePlan(plan.planIndex, "submitted")}
                    className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 shadow-lg shadow-blue-100"
                  >
                    <Send size={14} />
                    Kirim Rencana
                  </button>
                </div>
              </div>

              {/* Feedback Alert Container */}
              {feedback && (
                <div className={cn(
                  "p-4 rounded-2xl flex items-center gap-3 border text-xs font-bold",
                  feedback.type === 'success' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                )}>
                  {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <p>{feedback.text}</p>
                </div>
              )}

              {/* Plan Setup: Objective & Current Level */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    Target Akhir / Objective <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    disabled={isSubmitted}
                    value={plan.objective}
                    onChange={(e) => handleFieldChange(plan.planIndex, "objective", e.target.value)}
                    placeholder="Apa target/kompetensi akhir yang ingin dicapai dalam 17 minggu ini?"
                    rows={3}
                    className="w-full p-4 border border-gray-100 rounded-2xl bg-gray-50 focus:bg-white text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all resize-none disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Level Saat Ini / Current Level
                  </label>
                  <textarea
                    disabled={isSubmitted}
                    value={plan.currentLevel}
                    onChange={(e) => handleFieldChange(plan.planIndex, "currentLevel", e.target.value)}
                    placeholder="Kondisi atau tingkat pemahaman Anda saat ini terkait aktivitas ini?"
                    rows={3}
                    className="w-full p-4 border border-gray-100 rounded-2xl bg-gray-50 focus:bg-white text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all resize-none disabled:opacity-60"
                  />
                </div>
              </div>

              {/* FASE 2: AI Vision Photo Scanner */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="text-blue-600" size={18} />
                    <h3 className="font-black uppercase italic text-sm text-gray-800">Scan Rencana Tulisan Tangan</h3>
                  </div>
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest rounded-full">AI Vision Powered</span>
                </div>

                {!isSubmitted && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Upload Zone */}
                    <div className="lg:col-span-2">
                      <div 
                        onClick={() => fileInputRefs.current[plan.planIndex]?.click()}
                        className={cn(
                          "border-2 border-dashed rounded-[2rem] p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px]",
                          scanningPlanIndex === plan.planIndex 
                            ? "border-blue-300 bg-blue-50/20 pointer-events-none" 
                            : "border-gray-200 hover:border-blue-400 hover:bg-gray-50/50"
                        )}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          ref={el => fileInputRefs.current[plan.planIndex] = el}
                          onChange={(e) => handleFileUpload(plan.planIndex, e)}
                          className="hidden"
                        />

                        {scanningPlanIndex === plan.planIndex ? (
                          <div className="flex flex-col items-center gap-4">
                            <Loader2 className="animate-spin text-blue-600" size={36} />
                            <div>
                              <p className="text-xs font-black text-gray-800 uppercase tracking-widest animate-pulse">Menelaah Rencana Kerja...</p>
                              <p className="text-[10px] font-medium text-gray-400 mt-1">Lumina AI sedang mentranskripsikan tabel 17 baris</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                              <UploadCloud size={24} />
                            </div>
                            <div>
                              <p className="text-xs font-black text-gray-800 uppercase tracking-widest">Foto & Scan Tabel My Plan</p>
                              <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">Format JPG, JPEG, PNG • Maksimal 5MB</p>
                            </div>
                            <p className="text-[10px] font-medium text-gray-400 max-w-sm leading-relaxed mx-auto italic">
                              Letakkan lembar My Plan di permukaan datar dengan cahaya terang, foto lurus, lalu upload di sini untuk transkripsi otomatis.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Image Preview */}
                    <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100 flex flex-col justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Preview Dokumen Terunggah</p>
                      
                      {plan.photoUrl ? (
                        <div className="space-y-4 flex-1 flex flex-col justify-between">
                          <div className="relative aspect-video rounded-2xl overflow-hidden border border-gray-200 bg-white">
                            <img 
                              src={plan.photoUrl} 
                              alt="Scanned plan physical table" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 pt-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={16} className="text-emerald-500" />
                              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Berhasil Diunggah</span>
                            </div>
                            <button
                              onClick={() => removePhoto(plan.planIndex)}
                              className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all"
                              title="Hapus Foto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                          <p className="text-xs font-bold text-gray-400">Belum ada foto lembar rencana yang diunggah.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 17-Week Plan Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-blue-600" />
                    <h3 className="font-black uppercase italic text-sm text-gray-800">Target Rencana Per Pekan</h3>
                  </div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full">17 Pekan Pertemuan</p>
                </div>

                {/* Dense modern table */}
                <div className="border border-gray-100 rounded-[2rem] overflow-hidden shadow-sm bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                          <th className="py-4 px-6 w-24 text-center">Pekan</th>
                          <th className="py-4 px-6">Target Kegiatan Siswa (Student Target)</th>
                          <th className="py-4 px-6 w-1/3">Catatan Pembimbing (Supervisor Feedback)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-xs font-semibold text-gray-700">
                        {plan.weeks.map((week) => {
                          const isMandated = !!MANDATED_WEEKS[week.weekNumber];
                          return (
                            <tr 
                              key={week.weekNumber}
                              className={cn(
                                "transition-colors",
                                isMandated ? "bg-amber-50/20" : "hover:bg-gray-50/40"
                              )}
                            >
                              {/* Week Badge */}
                              <td className="py-3 px-4 text-center border-r border-gray-50/50">
                                <div className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center font-black mx-auto",
                                  isMandated ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                                )}>
                                  W{week.weekNumber}
                                </div>
                              </td>

                              {/* Target Content */}
                              <td className="py-3 px-6">
                                {isMandated ? (
                                  <div className="flex items-center justify-between gap-4 p-3 bg-amber-50/40 border border-amber-100/50 rounded-xl">
                                    <span className="font-bold text-amber-800 italic">{week.studentTarget}</span>
                                    <span className="flex items-center gap-1.5 bg-amber-100 text-amber-800 font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded-md shrink-0">
                                      <Lock size={10} /> Sesi Wajib
                                    </span>
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    disabled={isSubmitted}
                                    value={week.studentTarget}
                                    onChange={(e) => handleWeekTargetChange(plan.planIndex, week.weekNumber, e.target.value)}
                                    placeholder={`Masukkan target spesifik untuk pekan ${week.weekNumber}...`}
                                    className="w-full p-3 border border-gray-100 rounded-xl bg-gray-50/30 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all disabled:opacity-75"
                                  />
                                )}
                              </td>

                              {/* Supervisor Feedback */}
                              <td className="py-3 px-6 border-l border-gray-50/50">
                                {week.supervisorNotes ? (
                                  <div className="p-3 bg-blue-50/50 border border-blue-100/40 rounded-xl text-blue-800 text-[11px] leading-relaxed italic">
                                    "{week.supervisorNotes}"
                                  </div>
                                ) : (
                                  <span className="text-gray-400/80 italic font-medium px-1">Belum ada feedback</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
