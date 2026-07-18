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
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../context/AuthContext";
import { Student, Class, LdssAge, LdssTemplate, LdssAssessment } from "../../types";
import { 
  getActiveLdssTemplateForAge, 
  getLdssAssessment, 
  saveLdssAssessment 
} from "../../services/ldssTemplateService";

interface LdssAssessmentFormProps {
  student: Student;
  classInfo: Class;
  age: LdssAge;
  academicYear: string;
}

export default function LdssAssessmentForm({
  student,
  classInfo,
  age,
  academicYear
}: LdssAssessmentFormProps) {
  const { profile } = useAuth();
  const userEmail = profile?.email || "teacher@lazuardi.sch.id";

  // State Management
  const [loading, setLoading] = React.useState(true);
  const [activeTemplate, setActiveTemplate] = React.useState<LdssTemplate | null>(null);
  const [assessmentId, setAssessmentId] = React.useState<string>("");
  const [scores, setScores] = React.useState<Record<string, "YA" | "TIDAK" | null>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [generalNotes, setGeneralNotes] = React.useState<string>("");

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [expandedDomains, setExpandedDomains] = React.useState<Record<string, boolean>>({});

  // Loading and Initializing Data
  React.useEffect(() => {
    const initializeForm = async () => {
      try {
        setLoading(true);
        setSaveSuccess(false);

        // 1. Fetch active template for age
        const template = await getActiveLdssTemplateForAge(age);
        setActiveTemplate(template);

        if (!template) {
          setLoading(false);
          return;
        }

        // 2. Compute Document ID
        const docId = `${student.id}_${age}_${academicYear.replace("/", "-")}`;
        setAssessmentId(docId);

        // 3. Fetch previous assessment record if exists
        const prevAssessment = await getLdssAssessment(student.id, age, academicYear);

        // Initialize state
        const initialScores: Record<string, "YA" | "TIDAK" | null> = {};
        const initialNotes: Record<string, string> = {};

        // Prep all indicator IDs in the active template to have an initial score
        template.domains.forEach((domain) => {
          domain.indicators.forEach((ind) => {
            initialScores[ind.id] = null;
            initialNotes[ind.id] = "";
          });
        });

        if (prevAssessment) {
          // Merge existing scores and notes
          Object.assign(initialScores, prevAssessment.scores);
          Object.assign(initialNotes, prevAssessment.notes);
          setGeneralNotes(prevAssessment.generalNotes || "");
        } else {
          setGeneralNotes("");
        }

        setScores(initialScores);
        setNotes(initialNotes);

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
  }, [student.id, age, academicYear]);

  // Handle score change
  const handleScoreChange = (indicatorId: string, val: "YA" | "TIDAK") => {
    setScores((prev) => ({
      ...prev,
      [indicatorId]: prev[indicatorId] === val ? null : val // Toggle off if clicked again
    }));
    setSaveSuccess(false);
  };

  // Handle note change
  const handleNoteChange = (indicatorId: string, text: string) => {
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

  // Save assessment to Firestore
  const handleSave = async () => {
    if (!activeTemplate) return;
    try {
      setIsSaving(true);
      setSaveSuccess(false);

      const now = new Date().toISOString();
      const payload: LdssAssessment = {
        id: assessmentId,
        studentId: student.id,
        studentName: student.name,
        classId: classInfo.id,
        academicYear,
        age,
        templateId: activeTemplate.id,
        scores,
        notes,
        generalNotes,
        assessedBy: userEmail,
        assessedAt: now,
        updatedAt: now
      };

      await saveLdssAssessment(payload);
      setSaveSuccess(true);
      
      // Clear success notification after 4 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (err) {
      console.error("Error saving LDSS assessment:", err);
      alert("Gagal menyimpan asesmen LDSS. Silakan coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  // Calculations for Progress Bars
  const progressStats = React.useMemo(() => {
    if (!activeTemplate) return { total: 0, completed: 0, percent: 0, domainStats: {} };

    let total = 0;
    let completed = 0;
    const domainStats: Record<string, { total: number; completed: number; percent: number }> = {};

    activeTemplate.domains.forEach((dom) => {
      let domTotal = 0;
      let domCompleted = 0;

      dom.indicators.forEach((ind) => {
        total++;
        domTotal++;
        if (scores[ind.id] !== undefined && scores[ind.id] !== null) {
          completed++;
          domCompleted++;
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
      domainStats
    };
  }, [activeTemplate, scores]);

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

  return (
    <div className="space-y-6 text-left">
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
                  <div className="flex items-center gap-2">
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
                            className="bg-white border border-gray-150 p-4 rounded-xl flex flex-col md:flex-row md:items-start justify-between gap-4 shadow-sm hover:border-gray-200 transition-all"
                          >
                            {/* Indicator Text & Order */}
                            <div className="flex items-start gap-2.5 flex-1">
                              <span className="text-[10px] font-black text-slate-400 bg-slate-50 border border-gray-150 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                                {index + 1}.{indIdx + 1}
                              </span>
                              <p className="text-xs font-bold text-slate-700 leading-relaxed">
                                {ind.text}
                              </p>
                            </div>

                            {/* Scoring Buttons and Note Panel */}
                            <div className="flex flex-col gap-3 shrink-0 w-full md:w-auto md:max-w-sm">
                              {/* YES/NO Score Toggles */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleScoreChange(ind.id, "YA")}
                                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border cursor-pointer transition-all ${
                                    currentScore === "YA"
                                      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                                      : "bg-white border-gray-200 text-gray-500 hover:bg-emerald-50/45 hover:text-emerald-700 hover:border-emerald-200"
                                  }`}
                                >
                                  <Check size={12} className="stroke-[3]" />
                                  <span>YA</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleScoreChange(ind.id, "TIDAK")}
                                  className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border cursor-pointer transition-all ${
                                    currentScore === "TIDAK"
                                      ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                                      : "bg-white border-gray-200 text-gray-500 hover:bg-rose-50/45 hover:text-rose-700 hover:border-rose-200"
                                  }`}
                                >
                                  <X size={12} className="stroke-[3]" />
                                  <span>TIDAK</span>
                                </button>
                              </div>

                              {/* Indicator-Specific Notes */}
                              <input
                                type="text"
                                value={currentNote}
                                onChange={(e) => handleNoteChange(ind.id, e.target.value)}
                                placeholder="Tambah catatan khusus (opsional)..."
                                className="w-full bg-slate-50 border border-gray-150 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-150 rounded-xl px-3 py-1.5 text-[11px] font-medium text-slate-700 placeholder-slate-400 transition-all"
                              />
                            </div>
                          </div>
                        );
                      })}
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

        <textarea
          value={generalNotes}
          onChange={(e) => {
            setGeneralNotes(e.target.value);
            setSaveSuccess(false);
          }}
          placeholder="Tulis kesimpulan umum screening, observasi tambahan, atau rekomendasi program perkembangan untuk siswa di sini..."
          rows={4}
          className="w-full bg-slate-50 border border-gray-150 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-150 rounded-2xl p-4 text-xs font-semibold text-slate-700 placeholder-slate-400 leading-relaxed transition-all"
        />
      </div>

      {/* Bottom Save bar with status notifications */}
      <div className="bg-slate-50 rounded-3xl border border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-40 shadow-lg">
        <div className="flex items-center gap-2.5 text-xs text-slate-500 font-semibold pl-2">
          <Info size={14} className="text-indigo-500" />
          <span>Jangan lupa simpan perubahan asesmen sebelum meninggalkan halaman.</span>
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

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer min-w-[150px]"
          >
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Simpan Asesmen</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
