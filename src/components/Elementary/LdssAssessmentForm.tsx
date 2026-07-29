import * as React from "react";
import { 
  Check, 
  X, 
  Save, 
  Loader2, 
  AlertTriangle, 
  Sparkles, 
  CheckCircle2, 
  Info, 
  ChevronDown, 
  ChevronUp,
  FileText,
  Mic,
  MicOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../context/AuthContext";
import { Student, Class, LdssAge, LdssTemplate, LdssAssessment, LdssSessionAssessment, LdssSessionResponse, LdssSessionProgress } from "../../types";
import { 
  getActiveLdssTemplateForAge, 
  getLdssAssessment, 
  saveLdssAssessment,
  generateLdssSessionId,
  getStudentLdssSessions,
  saveLdssSession
} from "../../services/ldssTemplateService";

interface AutosizeTextareaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  id: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

function AutosizeTextarea({
  value,
  onChange,
  placeholder = "Tambah catatan...",
  id,
  rows = 1,
  className = "",
  disabled = false
}: AutosizeTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = React.useState(false);
  const [lang, setLang] = React.useState<"id-ID" | "en-US">("id-ID");
  const [speechSupported, setSpeechSupported] = React.useState(true);
  const recognitionRef = React.useRef<any>(null);

  // Auto-resize effect
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  // Check speech recognition support
  React.useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
  }, []);

  const toggleListening = () => {
    if (!speechSupported || disabled) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = lang;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          const appended = value 
            ? `${value.trim()} ${transcript}` 
            : transcript;
          onChange(appended);
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      setIsListening(false);
    }
  };

  return (
    <div className={`w-full space-y-1 text-left ${className}`}>
      <div className={`relative flex items-end border focus-within:ring-2 focus-within:ring-indigo-150 rounded-xl transition-all ${
        disabled 
          ? "bg-slate-100/50 border-gray-200 cursor-not-allowed" 
          : "bg-slate-50 border-gray-150 hover:bg-white hover:border-gray-200 focus-within:bg-white"
      }`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full bg-transparent focus:outline-none rounded-xl pl-4 pr-24 py-2 text-xs font-semibold text-slate-700 placeholder-slate-400 resize-none min-h-[36px] max-h-48 overflow-y-auto leading-relaxed disabled:text-slate-500 disabled:cursor-not-allowed"
        />

        {/* Speech-to-Text and Lang Selection Container */}
        {!disabled && (
          <div className="absolute right-2 bottom-1.5 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded-lg border border-gray-100 shadow-sm z-10">
            {speechSupported && (
              <>
                {/* Language Selector Pill */}
                <button
                  type="button"
                  onClick={() => setLang(prev => prev === "id-ID" ? "en-US" : "id-ID")}
                  className="text-[9px] font-black text-slate-500 hover:text-indigo-600 px-1 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Ganti Bahasa (ID / EN)"
                >
                  {lang === "id-ID" ? "🇮🇩 ID" : "🇺🇸 EN"}
                </button>

                <span className="w-px h-3 bg-gray-200" />
              </>
            )}

            {/* Microphone Trigger Button */}
            {speechSupported ? (
              <button
                type="button"
                onClick={toggleListening}
                className={`p-1 rounded-md cursor-pointer transition-all relative flex items-center justify-center ${
                  isListening
                    ? "bg-rose-50 text-rose-600 ring-2 ring-rose-200"
                    : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
                }`}
                title={isListening ? "Berhenti mendengarkan" : "Mulai merekam suara"}
              >
                {isListening ? (
                  <>
                    <Mic size={13} className="animate-pulse" />
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                  </>
                ) : (
                  <Mic size={13} />
                )}
              </button>
            ) : (
              <div className="p-1 text-slate-300" title="Voice typing tidak didukung browser ini">
                <MicOff size={13} />
              </div>
            )}
          </div>
        )}
      </div>
      {isListening && !disabled && (
        <motion.p 
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] text-rose-500 font-bold flex items-center gap-1 pl-2 animate-pulse"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 block"></span>
          Mendengarkan ({lang === "id-ID" ? "Bahasa Indonesia" : "English"})... Silakan bicara.
        </motion.p>
      )}
    </div>
  );
}

interface LdssAssessmentFormProps {
  student: Student;
  classInfo: Class;
  age: LdssAge;
  academicYear: string;
  periodKey?: 'LDSS_1' | 'LDSS_2' | 'LDSS_3';
  periodLabel?: 'LDSS 1' | 'LDSS 2' | 'LDSS 3';
  periodStatus?: 'OPEN' | 'CLOSED';
  onSaveOrComplete?: () => void;
}

export default function LdssAssessmentForm({
  student,
  classInfo,
  age,
  academicYear,
  periodKey,
  periodLabel,
  periodStatus = 'OPEN',
  onSaveOrComplete
}: LdssAssessmentFormProps) {
  const { profile } = useAuth();
  const userEmail = profile?.email || "teacher@lazuardi.sch.id";

  // State Management
  const [loading, setLoading] = React.useState(true);
  const [activeTemplate, setActiveTemplate] = React.useState<LdssTemplate | null>(null);
  
  // Multi-session State
  const [sessions, setSessions] = React.useState<LdssSessionAssessment[]>([]);
  const [activeSession, setActiveSession] = React.useState<LdssSessionAssessment | null>(null);
  const [showSessionSelector, setShowSessionSelector] = React.useState(false);
  const [isFormInitialized, setIsFormInitialized] = React.useState(false);

  // Core scores/notes state mapping
  const [scores, setScores] = React.useState<Record<string, "YA" | "TIDAK" | null>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [generalNotes, setGeneralNotes] = React.useState<string>("");

  // Saving states
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [expandedDomains, setExpandedDomains] = React.useState<Record<string, boolean>>({});

  // Section saving states
  const [savingSections, setSavingSections] = React.useState<Record<string, boolean>>({});
  const [saveSectionSuccess, setSaveSectionSuccess] = React.useState<Record<string, boolean>>({});

  // Local draft recovery state
  const [showRecoveryBanner, setShowRecoveryBanner] = React.useState(false);
  const [pendingRecoveryData, setPendingRecoveryData] = React.useState<any>(null);

  // Read-only checker
  const isReadOnly = activeSession?.status?.toUpperCase() === "COMPLETED" || activeSession?.status === "completed" || periodStatus === "CLOSED";

  // Loading and Initializing Data
  React.useEffect(() => {
    const initializeForm = async () => {
      try {
        setLoading(true);
        setSaveSuccess(false);
        setIsFormInitialized(false);
        setShowRecoveryBanner(false);
        setPendingRecoveryData(null);

        // 1. Fetch active template for age
        const template = await getActiveLdssTemplateForAge(age);
        setActiveTemplate(template);

        if (!template) {
          setLoading(false);
          return;
        }

        // 2. Fetch all multi-sessions for this student, age, and academic year
        const existingSessions = await getStudentLdssSessions(student.id, age, academicYear);
        setSessions(existingSessions);

        // 3. Find any session that matches the periodKey
        const targetPeriodKey = periodKey || "LDSS_1";
        const matchedSession = existingSessions.find(
          (s) => s.periodKey === targetPeriodKey || (s.periodLabel && s.periodLabel.replace(" ", "_") === targetPeriodKey)
        );

        if (matchedSession) {
          setActiveSession(matchedSession);
          setShowSessionSelector(false);

          const initialScores: Record<string, "YA" | "TIDAK" | null> = {};
          const initialNotes: Record<string, string> = {};

          template.domains.forEach((domain) => {
            domain.indicators.forEach((ind) => {
              const resp = matchedSession.responses?.[ind.id];
              initialScores[ind.id] = resp?.score !== undefined ? resp.score : null;
              initialNotes[ind.id] = resp?.note || "";
            });
          });

          setScores(initialScores);
          setNotes(initialNotes);
          setGeneralNotes(matchedSession.generalNotes || "");

          // Check for local storage recovery if draft
          const isSessionDraft = (matchedSession.status || "").toUpperCase() === "DRAFT" || matchedSession.status === "draft";
          if (isSessionDraft) {
            const localDraftStr = sessionStorage.getItem(`ldss_draft_${matchedSession.id}`);
            if (localDraftStr) {
              const localDraft = JSON.parse(localDraftStr);
              const hasDiff = JSON.stringify(localDraft.scores) !== JSON.stringify(initialScores) ||
                              JSON.stringify(localDraft.notes) !== JSON.stringify(initialNotes) ||
                              localDraft.generalNotes !== matchedSession.generalNotes;
              if (hasDiff) {
                setPendingRecoveryData(localDraft);
                setShowRecoveryBanner(true);
              }
            }
          }

          setIsFormInitialized(true);
        } else {
          // If no session for this period and period is closed, initialize a dummy read-only state
          if (periodStatus === "CLOSED") {
            const dummySession: LdssSessionAssessment = {
              id: "closed-temp",
              studentId: student.id,
              studentNameSnapshot: student.name,
              classId: classInfo.id,
              classNameSnapshot: classInfo.name,
              unitId: "ELEMENTARY",
              academicYearId: academicYear,
              academicYearLabel: `Tahun Ajaran ${academicYear}`,
              instrumentAge: age,
              assessmentDate: new Date().toISOString().split("T")[0],
              status: "COMPLETED",
              responses: {},
              sectionProgress: {},
              generalNotes: "Periode ini ditutup dan tidak ada pengisian sebelumnya.",
              scoringSummary: { totalYes: 0, totalNo: 0, totalBlank: 0, percentCompleted: 0 },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: { email: "", uid: "", name: "" },
              templateVersion: template.version,
            };
            setActiveSession(dummySession);
            setScores({});
            setNotes({});
            setGeneralNotes("");
            setIsFormInitialized(true);
            setShowSessionSelector(false);
          } else {
            // Automatically initialize a new draft session for this period
            const sessionId = generateLdssSessionId();
            const today = new Date().toISOString().split("T")[0];

            const sectionProgress: Record<string, LdssSessionProgress> = {};
            template.domains.forEach((d) => {
              sectionProgress[d.id] = {
                completed: 0,
                total: d.indicators.length,
                percent: 0,
              };
            });

            const initialScores: Record<string, "YA" | "TIDAK" | null> = {};
            const initialNotes: Record<string, string> = {};

            template.domains.forEach((domain) => {
              domain.indicators.forEach((ind) => {
                initialScores[ind.id] = null;
                initialNotes[ind.id] = "";
              });
            });

            const newSession: LdssSessionAssessment = {
              id: sessionId,
              studentId: student.id,
              studentNameSnapshot: student.name,
              classId: classInfo.id,
              classNameSnapshot: classInfo.name,
              unitId: "ELEMENTARY",
              academicYearId: academicYear,
              academicYearLabel: `Tahun Ajaran ${academicYear}`,
              instrumentAge: age,
              assessmentDate: today,
              status: "DRAFT",
              responses: {},
              sectionProgress,
              generalNotes: "",
              scoringSummary: {
                totalYes: 0,
                totalNo: 0,
                totalBlank: template.domains.reduce((sum, d) => sum + d.indicators.length, 0),
                percentCompleted: 0,
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: {
                email: userEmail,
                uid: profile?.uid,
                name: profile?.displayName || userEmail,
              },
              templateVersion: template.version,

              // Minimal schema & period properties
              unit: "ELEMENTARY",
              academicYear: academicYear,
              studentName: student.name,
              studentAge: age,
              periodKey: targetPeriodKey,
              periodLabel: periodLabel || (targetPeriodKey === 'LDSS_1' ? 'LDSS 1' : targetPeriodKey === 'LDSS_2' ? 'LDSS 2' : 'LDSS 3'),
              createdByUid: profile?.uid || "",
              createdByName: profile?.displayName || userEmail,
              domainScores: {},
            };

            setActiveSession(newSession);
            setScores(initialScores);
            setNotes(initialNotes);
            setGeneralNotes("");
            setIsFormInitialized(true);
            setShowSessionSelector(false);
          }
        }

        // Expand first domain by default
        if (template.domains.length > 0) {
          setExpandedDomains({ [template.domains[0].id]: true });
        }
      } catch (err) {
        console.error("Error initializing LDSS form:", err);
      } finally {
        setLoading(false);
      }
    };

    initializeForm();
  }, [student.id, age, academicYear, periodKey, periodStatus]);

  // Handle auto-saving to local storage for recovery (fail-safe)
  React.useEffect(() => {
    if (isFormInitialized && activeSession && activeSession.status === "draft" && !loading) {
      const draftData = {
        scores,
        notes,
        generalNotes,
        updatedAt: new Date().toISOString(),
      };
      sessionStorage.setItem(`ldss_draft_${activeSession.id}`, JSON.stringify(draftData));
    }
  }, [scores, notes, generalNotes, activeSession, isFormInitialized, loading]);

  // Handle score change
  const handleScoreChange = (indicatorId: string, val: "YA" | "TIDAK") => {
    if (isReadOnly) return;
    setScores((prev) => ({
      ...prev,
      [indicatorId]: prev[indicatorId] === val ? null : val // Toggle off if clicked again
    }));
    setSaveSuccess(false);
  };

  // Handle note change
  const handleNoteChange = (indicatorId: string, text: string) => {
    if (isReadOnly) return;
    setNotes((prev) => ({
      ...prev,
      [indicatorId]: text
    }));
    setSaveSuccess(false);
  };

  // Toggle domain expansion accordion
  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => ({
      ...prev,
      [domainId]: !prev[domainId]
    }));
  };

  // Recover Local Draft
  const handleRecoverLocalDraft = () => {
    if (pendingRecoveryData) {
      setScores(pendingRecoveryData.scores || {});
      setNotes(pendingRecoveryData.notes || {});
      setGeneralNotes(pendingRecoveryData.generalNotes || "");
      setShowRecoveryBanner(false);
      setPendingRecoveryData(null);
      alert("Isian berhasil dipulihkan dari penyimpanan perangkat.");
    }
  };

  // Discard Local Draft
  const handleDiscardLocalDraft = () => {
    if (activeSession) {
      sessionStorage.removeItem(`ldss_draft_${activeSession.id}`);
      setShowRecoveryBanner(false);
      setPendingRecoveryData(null);
      alert("Isian perangkat berhasil diabaikan.");
    }
  };

  // Select a session to view or continue
  const handleSelectSession = (session: LdssSessionAssessment) => {
    if (!activeTemplate) return;

    setActiveSession(session);

    const initialScores: Record<string, "YA" | "TIDAK" | null> = {};
    const initialNotes: Record<string, string> = {};

    activeTemplate.domains.forEach((domain) => {
      domain.indicators.forEach((ind) => {
        const resp = session.responses?.[ind.id];
        initialScores[ind.id] = resp?.score !== undefined ? resp.score : null;
        initialNotes[ind.id] = resp?.note || "";
      });
    });

    setScores(initialScores);
    setNotes(initialNotes);
    setGeneralNotes(session.generalNotes || "");

    // Reset recovery banner for this session
    setShowRecoveryBanner(false);
    setPendingRecoveryData(null);

    if (session.status === "draft") {
      const localDraftStr = sessionStorage.getItem(`ldss_draft_${session.id}`);
      if (localDraftStr) {
        const localDraft = JSON.parse(localDraftStr);
        const hasDiff = JSON.stringify(localDraft.scores) !== JSON.stringify(initialScores) ||
                        JSON.stringify(localDraft.notes) !== JSON.stringify(initialNotes) ||
                        localDraft.generalNotes !== session.generalNotes;
        if (hasDiff) {
          setPendingRecoveryData(localDraft);
          setShowRecoveryBanner(true);
        }
      }
    }

    setShowSessionSelector(false);
  };

  // Start a new blank session draft
  const handleStartNewSession = () => {
    if (!activeTemplate) return;

    const sessionId = generateLdssSessionId();
    const today = new Date().toISOString().split("T")[0];

    const sectionProgress: Record<string, LdssSessionProgress> = {};
    activeTemplate.domains.forEach((d) => {
      sectionProgress[d.id] = {
        completed: 0,
        total: d.indicators.length,
        percent: 0,
      };
    });

    const initialScores: Record<string, "YA" | "TIDAK" | null> = {};
    const initialNotes: Record<string, string> = {};

    activeTemplate.domains.forEach((domain) => {
      domain.indicators.forEach((ind) => {
        initialScores[ind.id] = null;
        initialNotes[ind.id] = "";
      });
    });

    const newSession: LdssSessionAssessment = {
      id: sessionId,
      studentId: student.id,
      studentNameSnapshot: student.name,
      classId: classInfo.id,
      classNameSnapshot: classInfo.name,
      unitId: student.currentUnit || "elementary",
      academicYearId: academicYear,
      academicYearLabel: `Tahun Ajaran ${academicYear}`,
      instrumentAge: age,
      assessmentDate: today,
      status: "draft",
      responses: {},
      sectionProgress,
      generalNotes: "",
      scoringSummary: {
        totalYes: 0,
        totalNo: 0,
        totalBlank: activeTemplate.domains.reduce((sum, d) => sum + d.indicators.length, 0),
        percentCompleted: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: {
        email: userEmail,
        uid: profile?.uid,
        name: profile?.displayName || userEmail,
      },
      templateVersion: activeTemplate.version,
    };

    setActiveSession(newSession);
    setScores(initialScores);
    setNotes(initialNotes);
    setGeneralNotes("");
    setIsFormInitialized(true);
    setShowSessionSelector(false);
    setShowRecoveryBanner(false);
    setPendingRecoveryData(null);
  };

  // Reopen a completed session for Head of Unit / Super Admin
  const handleReopenSession = async () => {
    if (!activeSession) return;
    if (confirm("Apakah Anda yakin ingin membuka kembali sesi asesmen ini? Tindakan ini akan dicatat dalam histori audit.")) {
      try {
        setIsSaving(true);

        const auditTrail = activeSession.reopenedBy || [];
        const updatedSession: LdssSessionAssessment = {
          ...activeSession,
          status: "draft",
          completedAt: null,
          reopenedBy: [
            ...auditTrail,
            {
              uid: profile?.uid,
              email: userEmail,
              name: profile?.displayName || userEmail,
              reopenedAt: new Date().toISOString()
            }
          ],
          updatedAt: new Date().toISOString(),
          updatedBy: {
            email: userEmail,
            uid: profile?.uid,
            name: profile?.displayName || userEmail
          }
        };

        await saveLdssSession(updatedSession);
        setActiveSession(updatedSession);

        // Update session list
        const updatedList = sessions.map(s => s.id === updatedSession.id ? updatedSession : s);
        setSessions(updatedList);

        alert("Sesi asesmen berhasil dibuka kembali sebagai draft.");
      } catch (err) {
        console.error("Error reopening session:", err);
        alert("Gagal membuka kembali sesi. Silakan coba lagi.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Calculations for Progress Bars
  const progressStats = React.useMemo(() => {
    if (!activeTemplate) return { total: 0, completed: 0, percent: 0, domainStats: {}, totalYes: 0, totalNo: 0, totalBlank: 0 };

    let total = 0;
    let completed = 0;
    let totalYes = 0;
    let totalNo = 0;
    let totalBlank = 0;
    const domainStats: Record<string, { total: number; completed: number; percent: number }> = {};

    activeTemplate.domains.forEach((dom) => {
      let domTotal = 0;
      let domCompleted = 0;

      dom.indicators.forEach((ind) => {
        total++;
        domTotal++;
        const val = scores[ind.id];
        if (val !== undefined && val !== null) {
          completed++;
          domCompleted++;
          if (val === "YA") totalYes++;
          else if (val === "TIDAK") totalNo++;
        } else {
          totalBlank++;
        }
      });

      domainStats[dom.id] = {
        total: domTotal,
        completed: domCompleted,
        percent: domTotal > 0 ? Math.round((domCompleted / domTotal) * 100) : 0
      };
    });

    return {
      total,
      completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      domainStats,
      totalYes,
      totalNo,
      totalBlank
    };
  }, [activeTemplate, scores]);

  // Helper to compute domain scores dynamically
  const computeDomainScores = () => {
    if (!activeTemplate) return {};
    const domainScores: Record<string, number | null> = {};
    activeTemplate.domains.forEach((dom) => {
      let answeredCount = 0;
      let yesCount = 0;
      dom.indicators.forEach((ind) => {
        const val = scores[ind.id];
        if (val === "YA" || val === "TIDAK") {
          answeredCount++;
          if (val === "YA") yesCount++;
        }
      });
      domainScores[dom.id] = answeredCount > 0 ? Math.round((yesCount / answeredCount) * 100) : null;
    });
    return domainScores;
  };

  // Helper to construct minimal schema and period tracking fields
  const getMinimalSchemaFields = (session: LdssSessionAssessment, targetStatus: 'DRAFT' | 'COMPLETED') => {
    const targetPeriodKey = periodKey || "LDSS_1";
    const domainScores = computeDomainScores();
    return {
      periodKey: targetPeriodKey,
      periodLabel: periodLabel || (targetPeriodKey === 'LDSS_1' ? 'LDSS 1' : targetPeriodKey === 'LDSS_2' ? 'LDSS 2' : 'LDSS 3'),
      unit: 'ELEMENTARY' as const,
      academicYear: academicYear,
      studentName: student.name,
      studentAge: age,
      createdByUid: session.createdByUid || profile?.uid || "",
      createdByName: session.createdByName || profile?.displayName || userEmail,
      domainScores,
      status: targetStatus,
    };
  };

  // Save single domain (partial save per domain accordion)
  const handleSaveSection = async (domainId: string, domainName: string) => {
    if (!activeSession || !activeTemplate) return;
    try {
      setSavingSections((prev) => ({ ...prev, [domainId]: true }));

      // Calculate progress stats for this specific domain
      const domStat = progressStats.domainStats[domainId] || { total: 0, completed: 0, percent: 0 };

      // Map current state responses for indicators in this domain
      const updatedResponses = { ...activeSession.responses };
      const domain = activeTemplate.domains.find((d) => d.id === domainId);
      if (domain) {
        domain.indicators.forEach((ind) => {
          updatedResponses[ind.id] = {
            score: scores[ind.id] || null,
            note: notes[ind.id] || ""
          };
        });
      }

      // Update progress snapshot for this domain
      const updatedSectionProgress = { ...activeSession.sectionProgress };
      updatedSectionProgress[domainId] = {
        completed: domStat.completed,
        total: domStat.total,
        percent: domStat.percent
      };

      // Recalculate global summary stats for current scores
      const updatedScoringSummary = {
        totalYes: progressStats.totalYes,
        totalNo: progressStats.totalNo,
        totalBlank: progressStats.totalBlank,
        percentCompleted: progressStats.percent
      };

      const updatedSession: LdssSessionAssessment = {
        ...activeSession,
        responses: updatedResponses,
        sectionProgress: updatedSectionProgress,
        scoringSummary: updatedScoringSummary,
        updatedAt: new Date().toISOString(),
        updatedBy: {
          email: userEmail,
          uid: profile?.uid,
          name: profile?.displayName || userEmail
        },
        ...getMinimalSchemaFields(activeSession, 'DRAFT')
      };

      await saveLdssSession(updatedSession);
      setActiveSession(updatedSession);

      // Add to sessions list if not there
      let updatedList = [];
      if (sessions.some((s) => s.id === updatedSession.id)) {
        updatedList = sessions.map((s) => s.id === updatedSession.id ? updatedSession : s);
      } else {
        updatedList = [updatedSession, ...sessions];
      }
      setSessions(updatedList);

      setSaveSectionSuccess((prev) => ({ ...prev, [domainId]: true }));
      setTimeout(() => {
        setSaveSectionSuccess((prev) => ({ ...prev, [domainId]: false }));
      }, 4000);
      onSaveOrComplete?.();
    } catch (err) {
      console.error("Error saving section:", err);
      alert(`Gagal menyimpan bagian ${domainName}. Silakan coba lagi.`);
    } finally {
      setSavingSections((prev) => ({ ...prev, [domainId]: false }));
    }
  };

  // Save all as draft
  const handleSaveAllDraft = async () => {
    if (!activeSession || !activeTemplate) return;
    try {
      setIsSaving(true);
      setSaveSuccess(false);

      // Build responses map
      const responses: Record<string, LdssSessionResponse> = {};
      activeTemplate.domains.forEach((domain) => {
        domain.indicators.forEach((ind) => {
          responses[ind.id] = {
            score: scores[ind.id] || null,
            note: notes[ind.id] || ""
          };
        });
      });

      // Section progress
      const sectionProgress: Record<string, LdssSessionProgress> = {};
      Object.entries(progressStats.domainStats).forEach(([domId, stats]) => {
        const domStat = stats as { total: number; completed: number; percent: number };
        sectionProgress[domId] = {
          completed: domStat.completed,
          total: domStat.total,
          percent: domStat.percent
        };
      });

      const scoringSummary = {
        totalYes: progressStats.totalYes,
        totalNo: progressStats.totalNo,
        totalBlank: progressStats.totalBlank,
        percentCompleted: progressStats.percent
      };

      const updatedSession: LdssSessionAssessment = {
        ...activeSession,
        responses,
        sectionProgress,
        generalNotes,
        scoringSummary,
        updatedAt: new Date().toISOString(),
        updatedBy: {
          email: userEmail,
          uid: profile?.uid,
          name: profile?.displayName || userEmail
        },
        ...getMinimalSchemaFields(activeSession, 'DRAFT')
      };

      await saveLdssSession(updatedSession);
      setActiveSession(updatedSession);

      // Update session list
      let updatedList = [];
      if (sessions.some((s) => s.id === updatedSession.id)) {
        updatedList = sessions.map((s) => s.id === updatedSession.id ? updatedSession : s);
      } else {
        updatedList = [updatedSession, ...sessions];
      }
      setSessions(updatedList);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      onSaveOrComplete?.();
    } catch (err) {
      console.error("Error saving draft:", err);
      alert("Gagal menyimpan draf asesmen. Silakan coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  // Finalize and lock session
  const handleFinalizeSession = async () => {
    if (!activeSession || !activeTemplate) return;
    if (confirm("Apakah Anda yakin ingin menyelesaikan asesmen ini? Setelah diselesaikan, form akan dikunci dan hanya dapat dibuka kembali oleh Kepala Unit/Admin.")) {
      try {
        setIsSaving(true);
        setSaveSuccess(false);

        // Build responses map
        const responses: Record<string, LdssSessionResponse> = {};
        activeTemplate.domains.forEach((domain) => {
          domain.indicators.forEach((ind) => {
            responses[ind.id] = {
              score: scores[ind.id] || null,
              note: notes[ind.id] || ""
            };
          });
        });

        // Section progress
        const sectionProgress: Record<string, LdssSessionProgress> = {};
        Object.entries(progressStats.domainStats).forEach(([domId, stats]) => {
          const domStat = stats as { total: number; completed: number; percent: number };
          sectionProgress[domId] = {
            completed: domStat.completed,
            total: domStat.total,
            percent: domStat.percent
          };
        });

        const scoringSummary = {
          totalYes: progressStats.totalYes,
          totalNo: progressStats.totalNo,
          totalBlank: progressStats.totalBlank,
          percentCompleted: progressStats.percent
        };

        const finalizedSession: LdssSessionAssessment = {
          ...activeSession,
          responses,
          sectionProgress,
          generalNotes,
          scoringSummary,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          updatedBy: {
            email: userEmail,
            uid: profile?.uid,
            name: profile?.displayName || userEmail
          },
          ...getMinimalSchemaFields(activeSession, 'COMPLETED')
        };

        await saveLdssSession(finalizedSession);
        setActiveSession(finalizedSession);

        // Clear local storage recovery on completion
        sessionStorage.removeItem(`ldss_draft_${activeSession.id}`);

        // Update session list
        let updatedList = [];
        if (sessions.some((s) => s.id === finalizedSession.id)) {
          updatedList = sessions.map((s) => s.id === finalizedSession.id ? finalizedSession : s);
        } else {
          updatedList = [finalizedSession, ...sessions];
        }
        setSessions(updatedList);

        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        onSaveOrComplete?.();
      } catch (err) {
        console.error("Error finalizing session:", err);
        alert("Gagal menyelesaikan asesmen. Silakan coba lagi.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-150 rounded-3xl p-16 text-center flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
        <p className="text-xs text-slate-500 font-bold tracking-wide">
          Memuat template dan riwayat screening...
        </p>
      </div>
    );
  }

  if (!activeTemplate) {
    return (
      <div className="bg-white border border-red-100 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4">
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100">
          <AlertTriangle size={28} />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h4 className="text-sm font-black text-slate-800">Template Aktif Tidak Ditemukan</h4>
          <p className="text-xs text-slate-400 font-bold leading-relaxed">
            Belum ada template instrumen LDSS yang berstatus <span className="text-red-500 font-black">AKTIF</span> untuk anak Usia {age} Tahun di pengaturan LDSS.
          </p>
          {profile?.role === "HEAD_UNIT" || profile?.role === "SUPER_ADMIN" ? (
            <p className="text-xs text-indigo-600 font-black pt-2">
              Silakan rancang dan aktifkan template LDSS terlebih dahulu di tab "Pengaturan LDSS".
            </p>
          ) : (
            <p className="text-xs text-slate-400 font-medium">
              Silakan hubungi Admin atau Kepala Unit untuk memuat dan mengaktifkan template LDSS Usia {age} Tahun.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Session Selector Panel (Shown at startup if draft sessions are found)
  if (showSessionSelector && activeSession) {
    const draftSessions = sessions.filter((s) => s.status === "draft");
    return (
      <div className="bg-white border border-indigo-100 rounded-3xl p-8 shadow-md text-left space-y-6 max-w-2xl mx-auto my-12">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
            <FileText size={24} />
          </div>
          <div className="space-y-1.5 font-sans">
            <h4 className="text-base font-black text-slate-900 tracking-tight">Sesi Draft Ditemukan</h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Terdapat draf pengisian asesmen aktif untuk <strong>{student.name}</strong> di Tahun Ajaran <strong>{academicYear}</strong>. Silakan pilih untuk melanjutkan draf yang ada atau memulai sesi asesmen baru.
            </p>
          </div>
        </div>

        <div className="space-y-3.5 pt-2">
          {draftSessions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSession(s)}
              className="w-full flex items-center justify-between p-4 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-150/70 hover:border-indigo-200 rounded-2xl transition-all cursor-pointer text-left"
            >
              <div className="space-y-1">
                <p className="text-xs font-black text-indigo-900">
                  Lanjutkan Draft Sesi Tanggal {new Date(s.assessmentDate).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold">
                  Terakhir diperbarui: {new Date(s.updatedAt).toLocaleString("id-ID")} oleh {s.updatedBy?.email || s.createdBy.email}
                </p>
              </div>
              <span className="px-3 py-1 bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-[9px] font-black uppercase tracking-wider">
                Lanjutkan
              </span>
            </button>
          ))}

          <button
            onClick={handleStartNewSession}
            className="w-full flex items-center justify-center gap-2 p-4 bg-white hover:bg-slate-50 border border-dashed border-slate-300 hover:border-indigo-300 rounded-2xl transition-all cursor-pointer text-xs font-black text-indigo-600"
          >
            <span>+ Mulai Sesi Baru</span>
          </button>
        </div>
      </div>
    );
  }

  // Active Session Form Rendering
  if (!activeSession) return null;

  return (
    <div className="space-y-6 text-left">
      {periodStatus === "CLOSED" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl flex items-center gap-2.5 text-xs font-semibold">
          <AlertTriangle className="text-amber-600 shrink-0" size={16} />
          <span>Periode {periodLabel || "ini"} saat ini sedang ditutup. Anda hanya dapat melihat data.</span>
        </div>
      )}
      
      {/* Session Control Panel (Fail-safe, multi-session selector & date tracker) */}
      <div className="bg-slate-50 rounded-3xl border border-gray-150 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white border border-gray-200 rounded-xl text-slate-600 shrink-0">
            <FileText size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">Sesi Aktif:</span>
              <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded text-[9px] font-black uppercase tracking-wider">
                Tanggal {new Date(activeSession.assessmentDate).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className={`px-2 py-0.5 border rounded text-[9px] font-black uppercase tracking-wider ${
                activeSession.status === 'completed'
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : "bg-amber-50 text-amber-700 border-amber-100"
              }`}>
                {activeSession.status === 'completed' ? 'Selesai' : 'Draft'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold leading-normal mt-0.5">
              Dibuat oleh {activeSession.createdBy.email} &bull; Template {activeSession.templateVersion}
            </p>
          </div>
        </div>

        {/* Date Selector and Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
          {activeSession.status === 'draft' && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="assessmentDate" className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tanggal:</label>
              <input
                id="assessmentDate"
                type="date"
                value={activeSession.assessmentDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  if (newDate) {
                    setActiveSession(prev => prev ? { ...prev, assessmentDate: newDate } : null);
                  }
                }}
                className="bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Reopen button */}
          {isReadOnly && (profile?.role === 'HEAD_UNIT' || profile?.role === 'SUPER_ADMIN') && (
            <button
              onClick={handleReopenSession}
              disabled={isSaving}
              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-700 text-xs font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
            >
              <span>Buka Kembali Sesi</span>
            </button>
          )}

          {/* Sesi List Dropdown / Quick Switch */}
          {sessions.length > 1 && (
            <select
              onChange={(e) => {
                const selected = sessions.find(s => s.id === e.target.value);
                if (selected) {
                  handleSelectSession(selected);
                }
              }}
              value={activeSession.id}
              className="bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-600 focus:outline-none"
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.status === 'completed' ? '✓ ' : '✎ '} Sesi {new Date(s.assessmentDate).toLocaleDateString("id-ID", { day: 'numeric', month: 'short' })} ({s.status === 'completed' ? 'Selesai' : 'Draf'})
                </option>
              ))}
            </select>
          )}

          {/* Start New Session Button */}
          <button
            onClick={() => {
              if (activeSession.status === 'draft') {
                if (confirm("Pekerjaan saat ini akan disimpan sebagai draf di daftar sesi. Apakah Anda yakin ingin memulai sesi baru?")) {
                  handleStartNewSession();
                }
              } else {
                handleStartNewSession();
              }
            }}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all animate-pulse"
          >
            Sesi Baru
          </button>
        </div>
      </div>

      {/* Local Draft Recovery Banner (Fail-safe) */}
      {showRecoveryBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-pulse">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl mt-0.5 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-1 font-sans">
              <p className="text-xs font-black text-amber-900 leading-none">Ditemukan Data Belum Tersimpan</p>
              <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
                Ada isian asesmen yang tersimpan di perangkat ini tetapi belum di-save ke database. Pulihkan data sekarang?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button
              onClick={handleDiscardLocalDraft}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-all"
            >
              Abaikan
            </button>
            <button
              onClick={handleRecoverLocalDraft}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-all"
            >
              Pulihkan
            </button>
          </div>
        </div>
      )}

      {/* Header Info & Progress Bar Card */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
              <Sparkles size={11} className="text-emerald-600 shrink-0" />
              Template Aktif {activeTemplate.version}
            </span>
            <h4 className="text-base font-black text-slate-800 tracking-tight">
              Screening Perkembangan: {student.name}
            </h4>
            <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
              <Info size={12} className="shrink-0" />
              Instrumen Usia {age} Tahun &bull; Kelas {classInfo.name} &bull; TA {academicYear}
            </p>
          </div>

          {/* Progress Percent Badge */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                Total Progress
              </span>
              <span className="text-xs font-black text-slate-700">
                {progressStats.completed} dari {progressStats.total} Indikator
              </span>
            </div>
            <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-slate-50 border border-gray-150">
              <span className="text-xs font-black text-indigo-600">{progressStats.percent}%</span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-gray-50">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressStats.percent}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="bg-indigo-600 h-full rounded-full"
          />
        </div>
      </div>

      {/* Read-only Alert Notice */}
      {isReadOnly && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-4 flex items-start gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0 mt-0.5">
            <CheckCircle2 size={18} />
          </div>
          <div className="space-y-1 font-sans">
            <p className="text-xs font-black text-emerald-900 leading-none">Asesmen Terkunci (Selesai)</p>
            <p className="text-[11px] text-emerald-700 font-semibold leading-relaxed">
              Sesi asesmen ini telah diselesaikan (completed) dan dikunci dalam mode baca-saja. Hubungi Kepala Unit jika perlu melakukan perubahan atau penyesuaian data.
            </p>
          </div>
        </div>
      )}

      {/* Accordion List for each Domain */}
      <div className="space-y-4">
        {activeTemplate.domains.map((domain, index) => {
          const isExpanded = !!expandedDomains[domain.id];
          const domStat = progressStats.domainStats[domain.id] || { total: 0, completed: 0, percent: 0 };
          const isDomainComplete = domStat.completed === domStat.total && domStat.total > 0;

          return (
            <div
              key={domain.id}
              className={`bg-white rounded-2xl border transition-all ${
                isExpanded ? "border-indigo-150 shadow-md" : "border-gray-150 shadow-sm"
              }`}
            >
              {/* Domain Header Accordion Toggle */}
              <button
                type="button"
                onClick={() => toggleDomain(domain.id)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 rounded-t-2xl text-left"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <h5 className="text-xs font-black text-slate-800 tracking-tight uppercase">
                      {domain.name}
                    </h5>
                    {isDomainComplete && (
                      <span className="p-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shrink-0">
                        <Check size={12} className="stroke-[3]" />
                      </span>
                    )}
                  </div>

                  {/* Progress Indicator inside Accordion Head */}
                  <div className="flex items-center gap-3 max-w-xs">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        style={{ width: `${domStat.percent}%` }}
                        className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold shrink-0">
                      {domStat.completed}/{domStat.total} Diisi
                    </span>
                  </div>
                </div>

                <div>
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400 shrink-0" />
                  )}
                </div>
              </button>

              {/* Indicators List inside Domain Accordion Body */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-gray-100"
                  >
                    <div className="p-5 space-y-4 bg-slate-50/30">
                      {domain.indicators.map((ind, indIdx) => {
                        const currentScore = scores[ind.id] || null;
                        const currentNote = notes[ind.id] || "";

                        return (
                          <div
                            key={ind.id}
                            className="bg-white border border-gray-150 p-4 rounded-xl flex flex-col gap-4 shadow-sm hover:border-gray-200 transition-all text-left"
                          >
                            {/* Top Row: Indicator text on the left, YES/NO buttons on the right */}
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                              {/* Indicator Text & Order */}
                              <div className="flex items-start gap-2.5 flex-1">
                                <span className="text-[10px] font-black text-slate-400 bg-slate-50 border border-gray-150 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                                  {index + 1}.{indIdx + 1}
                                </span>
                                <p className="text-xs font-bold text-slate-700 leading-relaxed">
                                  {ind.text}
                                </p>
                              </div>

                              {/* YES/NO Score Toggles */}
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={isReadOnly}
                                  onClick={() => handleScoreChange(ind.id, "YA")}
                                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border cursor-pointer transition-all ${
                                    currentScore === "YA"
                                      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                                      : "bg-white border-gray-200 text-gray-500 hover:bg-emerald-50/45 hover:text-emerald-700 hover:border-emerald-200"
                                  } disabled:opacity-85 disabled:cursor-not-allowed`}
                                >
                                  <Check size={12} className="stroke-[3]" />
                                  <span>YA</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isReadOnly}
                                  onClick={() => handleScoreChange(ind.id, "TIDAK")}
                                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border cursor-pointer transition-all ${
                                    currentScore === "TIDAK"
                                      ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                                      : "bg-white border-gray-200 text-gray-500 hover:bg-rose-50/45 hover:text-rose-700 hover:border-rose-200"
                                  } disabled:opacity-85 disabled:cursor-not-allowed`}
                                >
                                  <X size={12} className="stroke-[3]" />
                                  <span>TIDAK</span>
                                </button>
                              </div>
                            </div>

                            {/* Bottom Row: Full-width specific notes textarea with Speech-to-text */}
                            <div className="w-full">
                              <AutosizeTextarea
                                id={ind.id}
                                value={currentNote}
                                disabled={isReadOnly}
                                onChange={(val) => handleNoteChange(ind.id, val)}
                                placeholder={isReadOnly ? "Tidak ada catatan khusus" : "Tambah catatan khusus (opsional)..."}
                                rows={1}
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* Section Save Button (C. TOMBOL SIMPAN BAGIAN PER DOMAIN) */}
                      {!isReadOnly && (
                        <div className="pt-4 border-t border-gray-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                            <Info size={12} className="text-indigo-500 shrink-0" />
                            <span>Dapat dicicil: Simpan draf isian domain ini saja ke database.</span>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <AnimatePresence>
                              {saveSectionSuccess[domain.id] && (
                                <motion.span
                                  initial={{ opacity: 0, x: 5 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 5 }}
                                  className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg"
                                >
                                  ✓ Tersimpan!
                                </motion.span>
                              )}
                            </AnimatePresence>

                            <button
                              type="button"
                              disabled={savingSections[domain.id]}
                              onClick={() => handleSaveSection(domain.id, domain.name)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100/80 disabled:opacity-50 border border-indigo-150 text-indigo-700 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm"
                            >
                              {savingSections[domain.id] ? (
                                <>
                                  <Loader2 size={12} className="animate-spin text-indigo-600" />
                                  <span>Menyimpan...</span>
                                </>
                              ) : (
                                <>
                                  <Save size={12} />
                                  <span>Simpan Bagian ini</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* General Notes and Summary Section */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <FileText size={16} />
          </div>
          <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">
            Kesimpulan & Catatan Perkembangan Umum
          </h5>
        </div>

        <AutosizeTextarea
          id="general_notes"
          value={generalNotes}
          disabled={isReadOnly}
          onChange={(val) => {
            setGeneralNotes(val);
            setSaveSuccess(false);
          }}
          placeholder={isReadOnly ? "Tidak ada kesimpulan perkembangan umum" : "Tulis kesimpulan umum screening, observasi tambahan, atau rekomendasi program perkembangan untuk siswa di sini..."}
          rows={4}
        />
      </div>

      {/* Bottom Save bar with status notifications */}
      <div className="bg-slate-50 rounded-3xl border border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-40 shadow-lg">
        <div className="flex items-center gap-2.5 text-xs text-slate-500 font-semibold pl-2">
          <Info size={14} className="text-indigo-500" />
          <span>
            {isReadOnly 
              ? "Sesi dalam status selesai (Completed). Form ini terkunci dari perubahan." 
              : "Pastikan draf disimpan atau difinalisasi sebelum meninggalkan halaman ini."}
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
          <AnimatePresence>
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-1.5 text-emerald-600 font-black text-xs mr-1 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-xl shadow-sm"
              >
                <CheckCircle2 size={13} />
                <span>Asesmen Berhasil Disimpan!</span>
              </motion.div>
            )}
          </AnimatePresence>

          {!isReadOnly ? (
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAllDraft}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-slate-100 disabled:opacity-50 border border-gray-300 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer min-w-[150px]"
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <Save size={14} />
                    <span>Simpan Draft</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleFinalizeSession}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer min-w-[160px]"
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Selesaikan Asesmen</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            isReadOnly && (profile?.role === 'HEAD_UNIT' || profile?.role === 'SUPER_ADMIN') && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleReopenSession}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer min-w-[180px]"
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Buka Kembali Sesi</span>
                  </>
                )}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
