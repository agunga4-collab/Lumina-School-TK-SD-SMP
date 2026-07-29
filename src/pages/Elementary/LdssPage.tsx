import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { getClasses, getActiveStudents } from "../../lib/firebase";
import { Class, Student, LdssAge, LdssTemplate, LdssSessionAssessment } from "../../types";
import {
  ClipboardCheck,
  Settings,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Calendar,
  Sparkles,
  Info,
  Check,
  Lock,
  ArrowRight,
  User,
  Activity,
  FileText,
  AlertTriangle,
  Loader2,
  Trash2,
  TrendingUp,
  X,
  Plus,
  Pencil,
  CheckCircle2,
  CalendarDays,
  Play,
  Eye
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  getAllLdssTemplates,
  seedLdssTemplateAge6,
  seedLdssTemplateAge7,
  seedLdssTemplateAge8,
  seedLdssTemplateAge9,
  seedLdssTemplateAge10,
  seedLdssTemplateAge11,
  seedLdssTemplateAge12,
  getLdssSettings,
  saveLdssSettings,
  getClassLdssSessions,
  deleteLdssDraft,
  LdssSettings
} from "../../services/ldssTemplateService";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend as ChartLegend
} from "recharts";
import { SEED_DOMAINS_USIA_6 } from "../../data/ldssSeedData6";
import { SEED_DOMAINS_USIA_7 } from "../../data/ldssSeedData7";
import { SEED_DOMAINS_USIA_8 } from "../../data/ldssSeedData8";
import { SEED_DOMAINS_USIA_9 } from "../../data/ldssSeedData9";
import { SEED_DOMAINS_USIA_10 } from "../../data/ldssSeedData10";
import { SEED_DOMAINS_USIA_11 } from "../../data/ldssSeedData11";
import { SEED_DOMAINS_USIA_12 } from "../../data/ldssSeedData12";
import LdssTemplateEditor from "../../components/Elementary/LdssTemplateEditor";
import LdssAssessmentForm from "../../components/Elementary/LdssAssessmentForm";

export default function LdssPage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
  const location = useLocation();
  const navigate = useNavigate();
  const { age } = useParams();

  const selectedAgeParam = age ? parseInt(age, 10) as LdssAge : null;

  // Route & Tab sync
  const isAdmin = profile?.role === "SUPER_ADMIN" || profile?.role === "HEAD_UNIT";
  const isSettingsPath = location.pathname.includes("/settings");
  const isEditorPath = isSettingsPath && selectedAgeParam !== null;
  const activeTab = isSettingsPath ? "settings" : "filling";

  // Redirect non-admins trying to access settings
  React.useEffect(() => {
    if (isSettingsPath && !isAdmin) {
      navigate("/elementary/ldss", { replace: true });
    }
  }, [isSettingsPath, isAdmin, navigate]);

  const handleTabChange = (tab: "filling" | "settings") => {
    if (tab === "settings") {
      if (isAdmin) {
        navigate("/elementary/ldss/settings");
      }
    } else {
      navigate("/elementary/ldss");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 min-h-screen">
      {/* Header section */}
      <div className="bg-white border-b border-gray-100 py-6 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <ClipboardCheck size={20} />
              </div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                LDSS
              </h1>
            </div>
            <p className="text-xs text-gray-400 font-bold tracking-wide uppercase">
              Lazuardi Developmental Screening System
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 bg-slate-50 border border-gray-100 px-4 py-2.5 rounded-2xl w-fit">
            <Calendar size={14} className="text-indigo-500" />
            <span>Tahun Ajaran Aktif: {activeYear || "2026/2027"}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
        {/* Reusable LdssTabs */}
        {!isEditorPath && (
          <LdssTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            isAdmin={isAdmin}
          />
        )}

        {/* Content Panel with transitions */}
        <AnimatePresence mode="wait">
          {isEditorPath && selectedAgeParam !== null ? (
            <motion.div
              key="editor-panel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <LdssTemplateEditor age={selectedAgeParam} />
            </motion.div>
          ) : activeTab === "filling" ? (
            <motion.div
              key="filling-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <LdssSelectionPanel activeYear={activeYear || "2026/2027"} />
            </motion.div>
          ) : (
            <motion.div
              key="settings-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <LdssSettingsShell />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// 1. Reusable LdssTabs Component
interface LdssTabsProps {
  activeTab: "filling" | "settings";
  onTabChange: (tab: "filling" | "settings") => void;
  isAdmin: boolean;
}

function LdssTabs({ activeTab, onTabChange, isAdmin }: LdssTabsProps) {
  return (
    <div className="flex border-b border-gray-200 w-full mb-6 gap-6">
      <button
        onClick={() => onTabChange("filling")}
        className={`pb-4 px-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
          activeTab === "filling"
            ? "border-indigo-600 text-indigo-600 font-black"
            : "border-transparent text-gray-400 hover:text-gray-600"
        }`}
      >
        <ClipboardCheck size={16} />
        Pengisian LDSS
      </button>

      {isAdmin && (
        <button
          onClick={() => onTabChange("settings")}
          className={`pb-4 px-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "settings"
              ? "border-indigo-600 text-indigo-600 font-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <Settings size={16} />
          Pengaturan LDSS
        </button>
      )}
    </div>
  );
}

// 2. Reusable LdssSelectionPanel Component
interface LdssSelectionPanelProps {
  activeYear: string;
}

function LdssSelectionPanel({ activeYear }: LdssSelectionPanelProps) {
  const { profile } = useAuth();
  const userEmail = profile?.email || "teacher@lazuardi.sch.id";
  const location = useLocation();
  const locState = location.state as {
    initialClassId?: string;
    initialStudentId?: string;
    initialAge?: LdssAge;
  } | null;

  // Dropdown options loading states
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const [loadingStudents, setLoadingStudents] = React.useState(false);

  // Selections
  const [selectedClass, setSelectedClass] = React.useState<Class | null>(null);
  const [selectedStudent, setSelectedStudent] = React.useState<Student | null>(null);
  const [selectedAge, setSelectedAge] = React.useState<LdssAge | null>(null);

  // Search filter for students dropdown
  const [studentSearch, setStudentSearch] = React.useState("");

  // Dropdown open states
  const [isClassDropdownOpen, setIsClassDropdownOpen] = React.useState(false);
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = React.useState(false);
  const [isAgeDropdownOpen, setIsAgeDropdownOpen] = React.useState(false);

  // References for handling click outside to close custom popover dropdowns
  const classDropdownRef = React.useRef<HTMLDivElement>(null);
  const studentDropdownRef = React.useRef<HTMLDivElement>(null);
  const ageDropdownRef = React.useRef<HTMLDivElement>(null);

  // NEW: LDSS settings and class sessions tracking
  const [ldssSettings, setLdssSettings] = React.useState<LdssSettings | null>(null);
  const [classSessions, setClassSessions] = React.useState<LdssSessionAssessment[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(false);

  // NEW: Chart controls
  const [chartStudentId, setChartStudentId] = React.useState<string>("");
  const [checkedDomains, setCheckedDomains] = React.useState<Record<string, boolean>>({});

  // Age calculation helper
  const calculateStudentAge = (birthDateString?: string): LdssAge => {
    if (!birthDateString) return 6;
    const birthDate = new Date(birthDateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 6) return 6;
    if (age > 12) return 12;
    return age as LdssAge;
  };

  // Load global period settings
  const fetchSettings = async () => {
    try {
      const s = await getLdssSettings();
      setLdssSettings(s);
    } catch (err) {
      console.error("Failed to fetch global settings:", err);
    }
  };

  // Load class sessions
  const fetchClassSessions = async () => {
    if (!selectedClass) return;
    try {
      setLoadingSessions(true);
      const data = await getClassLdssSessions(selectedClass.id, activeYear);
      setClassSessions(data);
    } catch (err) {
      console.error("Failed to fetch class sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  React.useEffect(() => {
    fetchSettings();
  }, []);

  React.useEffect(() => {
    if (selectedClass) {
      fetchClassSessions();
    }
  }, [selectedClass, activeYear]);

  // Load Classes when activeYear changes
  React.useEffect(() => {
    const loadClasses = async () => {
      try {
        setLoadingClasses(true);
        const allClasses = await getClasses();
        // Filter only Active Elementary Classes for activeYear
        const elementaryClasses = allClasses.filter(
          (c) => c.unitId === "ELEMENTARY" && c.status !== "archived" && c.academicYear === activeYear
        );
        setClasses(elementaryClasses);

        // Auto-select initial class from location state if available
        if (locState?.initialClassId) {
          const matchedClass = elementaryClasses.find(c => c.id === locState.initialClassId);
          if (matchedClass) {
            setSelectedClass(matchedClass);
          }
        }
      } catch (err) {
        console.error("Failed to load elementary classes for LDSS:", err);
      } finally {
        setLoadingClasses(false);
      }
    };
    loadClasses();
  }, [activeYear, locState]);

  // Load Students when class changes
  React.useEffect(() => {
    const loadStudents = async () => {
      if (!selectedClass) {
        setStudents([]);
        return;
      }
      try {
        setLoadingStudents(true);
        const activeStudents = await getActiveStudents(selectedClass.id, activeYear);
        setStudents(activeStudents);

        // Auto-select initial student and age from location state if available
        if (locState?.initialStudentId && selectedClass.id === locState.initialClassId) {
          const matchedStudent = activeStudents.find(s => s.id === locState.initialStudentId);
          if (matchedStudent) {
            setSelectedStudent(matchedStudent);
          }
        }
        if (locState?.initialAge && selectedClass.id === locState.initialClassId) {
          setSelectedAge(locState.initialAge);
        }
      } catch (err) {
        console.error("Failed to load students for selected class:", err);
      } finally {
        setLoadingStudents(false);
      }
    };
    loadStudents();
  }, [selectedClass, activeYear, locState]);

  // Click outside listener to close absolute dropdown portals
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(event.target as Node)) {
        setIsStudentDropdownOpen(false);
      }
      if (ageDropdownRef.current && !ageDropdownRef.current.contains(event.target as Node)) {
        setIsAgeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const agesList: LdssAge[] = [6, 7, 8, 9, 10, 11, 12];

  // Filters students by search input
  const filteredStudents = React.useMemo(() => {
    return students.filter((s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase())
    );
  }, [students, studentSearch]);

  const handleClassSelect = (cls: Class) => {
    setSelectedClass(cls);
    setSelectedStudent(null);
    setSelectedAge(null);
    setIsClassDropdownOpen(false);
    setChartStudentId("");
  };

  const handleStudentSelect = (std: Student) => {
    setSelectedStudent(std);
    // Keep selectedAge if already set to allow quick consecutive assessment
    if (!selectedAge) {
      setSelectedAge(calculateStudentAge(std.birthDate));
    }
    setStudentSearch("");
    setIsStudentDropdownOpen(false);
  };

  const handlePrevStudent = () => {
    if (!selectedStudent || students.length <= 1) return;
    const currentIndex = students.findIndex((s) => s.id === selectedStudent.id);
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + students.length) % students.length;
    const nextStd = students[prevIndex];
    setSelectedStudent(nextStd);
    setSelectedAge(calculateStudentAge(nextStd.birthDate));
  };

  const handleNextStudent = () => {
    if (!selectedStudent || students.length <= 1) return;
    const currentIndex = students.findIndex((s) => s.id === selectedStudent.id);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % students.length;
    const nextStd = students[nextIndex];
    setSelectedStudent(nextStd);
    setSelectedAge(calculateStudentAge(nextStd.birthDate));
  };

  const handleAgeSelect = (age: LdssAge) => {
    setSelectedAge(age);
    setIsAgeDropdownOpen(false);
  };

  // NEW: Delete draft click handler
  const handleDeleteDraft = async (sessionId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus draft asesmen ini secara permanen?")) return;
    try {
      await deleteLdssDraft(
        sessionId,
        profile?.uid || "",
        profile?.role || "",
        [selectedClass?.id || ""]
      );
      alert("Draft asesmen berhasil dihapus.");
      fetchClassSessions();
    } catch (err: any) {
      console.error("Error deleting draft:", err);
      alert(err.message || "Gagal menghapus draft.");
    }
  };

  // Compile Chart data for the selected chart student
  const chartDataAndDomains = React.useMemo(() => {
    if (!chartStudentId || classSessions.length === 0) return { data: [], domains: [] };

    // Get completed sessions for this student
    const studentCompleted = classSessions.filter(
      (s) => s.studentId === chartStudentId && s.status?.toUpperCase() === "COMPLETED"
    );

    if (studentCompleted.length === 0) return { data: [], domains: [] };

    // Group by period key
    const p1 = studentCompleted.find((s) => s.periodKey === "LDSS_1");
    const p2 = studentCompleted.find((s) => s.periodKey === "LDSS_2");
    const p3 = studentCompleted.find((s) => s.periodKey === "LDSS_3");

    // Gather all domain keys
    const domainKeysSet = new Set<string>();
    studentCompleted.forEach((s) => {
      if (s.domainScores) {
        Object.keys(s.domainScores).forEach((k) => domainKeysSet.add(k));
      }
    });
    const domains = Array.from(domainKeysSet);

    // Build charts coordinates
    const data = [
      { name: "LDSS 1", ...p1?.domainScores },
      { name: "LDSS 2", ...p2?.domainScores },
      { name: "LDSS 3", ...p3?.domainScores },
    ];

    return { data, domains };
  }, [chartStudentId, classSessions]);

  // Set default checked domains once domains are loaded
  React.useEffect(() => {
    if (chartDataAndDomains.domains.length > 0) {
      const initial: Record<string, boolean> = {};
      chartDataAndDomains.domains.forEach((d, i) => {
        // Check first 5 domains by default to avoid a cluttered initial graph
        initial[d] = i < 5;
      });
      setCheckedDomains(initial);
    }
  }, [chartDataAndDomains.domains]);

  const hasCompletedSessions = React.useMemo(() => {
    return classSessions.some((s) => s.status?.toUpperCase() === "COMPLETED");
  }, [classSessions]);

  // Students with completed assessments
  const completedStudents = React.useMemo(() => {
    const ids = new Set(classSessions.filter(s => s.status?.toUpperCase() === "COMPLETED").map(s => s.studentId));
    return students.filter(s => ids.has(s.id));
  }, [students, classSessions]);

  // Auto-select chart student
  React.useEffect(() => {
    if (completedStudents.length > 0 && !chartStudentId) {
      setChartStudentId(completedStudents[0].id);
    }
  }, [completedStudents, chartStudentId]);

  return (
    <div className="space-y-6">
      {/* Active Form Mode with Back button */}
      {selectedClass && selectedStudent && selectedAge ? (() => {
        const activePeriodKey = ldssSettings?.activePeriodKey || "LDSS_1";
        const studentActiveSession = classSessions.find(
          s => s.studentId === selectedStudent.id && s.periodKey === activePeriodKey
        );
        const isCompleted = studentActiveSession?.status?.toUpperCase() === "COMPLETED";

        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedStudent(null);
                  setSelectedAge(null);
                }}
                className="px-4 py-2 bg-white border border-gray-150 hover:bg-slate-50 text-xs font-black text-slate-700 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer transition-all"
              >
                <ChevronLeft size={16} className="stroke-[2.5]" />
                <span>Kembali ke Rekap Kelas</span>
              </button>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                <span>Siswa: <strong className="text-gray-800">{selectedStudent.name}</strong></span>
                <span className="text-gray-200">|</span>
                {isCompleted || ldssSettings?.status === 'CLOSED' ? (
                  <span>Usia: <strong className="text-gray-800">{selectedAge} Tahun</strong></span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span>Usia:</span>
                    <select
                      value={selectedAge}
                      onChange={(e) => setSelectedAge(Number(e.target.value) as LdssAge)}
                      className="bg-slate-50 hover:bg-slate-100 border border-gray-200 rounded-lg px-2 py-1 text-xs font-black text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer transition-all"
                    >
                      {[6, 7, 8, 9, 10, 11, 12].map((a) => (
                        <option key={a} value={a}>
                          {a} Tahun
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <LdssAssessmentForm
              student={selectedStudent}
              classInfo={selectedClass}
              age={selectedAge}
              academicYear={activeYear}
              periodKey={ldssSettings?.activePeriodKey}
              periodLabel={ldssSettings?.activePeriodLabel}
              periodStatus={ldssSettings?.status}
              onSaveOrComplete={fetchClassSessions}
            />
          </div>
        );
      })() : (
        /* Class Overview Dashboard Mode */
        <div className="space-y-6">
          {/* Criteria Selection Header */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm relative z-45">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-4">
              Pilihan Kriteria Screening
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Dropdown 1: Pilih Kelas */}
              <div ref={classDropdownRef} className="relative space-y-1.5 text-left">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">
                  Pilih Kelas
                </label>
                <button
                  type="button"
                  onClick={() => !loadingClasses && setIsClassDropdownOpen(!isClassDropdownOpen)}
                  className="w-full px-4 py-3 bg-white border border-gray-150 rounded-xl text-xs font-bold text-gray-800 shadow-sm hover:bg-slate-50 flex items-center justify-between cursor-pointer focus:ring-2 focus:ring-indigo-100 transition-all h-[44px]"
                >
                  <span className="truncate">
                    {loadingClasses
                      ? "Memuat Kelas..."
                      : selectedClass
                      ? `${selectedClass.name} (${selectedClass.academicYear})`
                      : "Pilih Kelas"}
                  </span>
                  <ChevronDown size={14} className="text-gray-400 shrink-0" />
                </button>

                <AnimatePresence>
                  {isClassDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      transition={{ duration: 0.15 }}
                      className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
                    >
                      {classes.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-gray-400 italic text-center font-semibold">
                          Tidak ada kelas aktif ditemukan.
                        </div>
                      ) : (
                        <div className="py-1">
                          {classes.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleClassSelect(c)}
                              className={`w-full px-4 py-2.5 text-left text-xs font-bold flex items-center justify-between hover:bg-indigo-50/50 transition-colors ${
                                selectedClass?.id === c.id
                                  ? "bg-indigo-50/30 text-indigo-600"
                                  : "text-gray-700"
                              }`}
                            >
                              <span>
                                {c.name} ({c.academicYear})
                              </span>
                              {selectedClass?.id === c.id && (
                                <Check size={14} className="text-indigo-600" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Disabled/Helper info for Student Selection when class not loaded */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-gray-100 flex items-center gap-3 md:col-span-2">
                <Info size={18} className="text-indigo-500 shrink-0" />
                <p className="text-xs font-bold text-slate-500 leading-relaxed text-left">
                  {selectedClass 
                    ? `Kelas ${selectedClass.name} aktif dipilih. Di bawah adalah rekapitulasi 3 kali screening tahun ini. Anda dapat memulai atau mengubah draft untuk masing-masing siswa langsung dari tabel.`
                    : "Pilih Kelas terlebih dahulu untuk melihat tabel tracking dan grafik perkembangan seluruh siswa."}
                </p>
              </div>
            </div>
          </div>

          {selectedClass ? (
            <div className="space-y-6">
              {/* Table Card */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden text-left">
                <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-gray-950 tracking-tight flex items-center gap-2">
                      <ClipboardCheck className="text-indigo-600 shrink-0" size={18} />
                      Status Pengisian LDSS Kelas: {selectedClass.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-bold">
                      Tabel pelacakan asesmen berkala untuk tiga periode (LDSS 1, LDSS 2, LDSS 3) tahun ajaran aktif.
                    </p>
                  </div>
                  {ldssSettings && (
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-800 px-3 py-1.5 rounded-xl text-xs font-black w-fit">
                      <CalendarDays size={14} className="text-indigo-600" />
                      <span>Periode Aktif: {ldssSettings.activePeriodLabel} • {ldssSettings.status === 'OPEN' ? 'TERBUKA' : 'DITUTUP'}</span>
                    </div>
                  )}
                </div>

                {loadingSessions || loadingStudents ? (
                  <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                    <p className="text-xs text-slate-400 font-bold">Memuat rekapitulasi data kelas...</p>
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-16 text-center text-slate-400 italic text-xs font-semibold">
                    Tidak ada siswa aktif ditemukan di kelas ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        <tr>
                          <th className="py-3 px-4 w-12 text-center">No</th>
                          <th className="py-3 px-4 min-w-[180px]">Nama Siswa</th>
                          <th className="py-3 px-4 w-20 text-center">Usia</th>
                          <th className="py-3 px-4 text-center">LDSS 1</th>
                          <th className="py-3 px-4 text-center">LDSS 2</th>
                          <th className="py-3 px-4 text-center">LDSS 3</th>
                          <th className="py-3 px-4 min-w-[140px]">Terakhir Diperbarui</th>
                          <th className="py-3 px-4 text-center w-36">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students.map((student, idx) => {
                          const computedAge = calculateStudentAge(student.birthDate);
                          
                          // Find assessments
                          const s1 = classSessions.find(s => s.studentId === student.id && s.periodKey === "LDSS_1");
                          const s2 = classSessions.find(s => s.studentId === student.id && s.periodKey === "LDSS_2");
                          const s3 = classSessions.find(s => s.studentId === student.id && s.periodKey === "LDSS_3");

                          // Find active period session and determine action state
                          const activePeriodKey = ldssSettings?.activePeriodKey || "LDSS_1";
                          const activeSession = classSessions.find(s => s.studentId === student.id && s.periodKey === activePeriodKey);

                          // Last updated session
                          const allStudSessions = [s1, s2, s3].filter(Boolean) as LdssSessionAssessment[];
                          allStudSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                          const latestSession = allStudSessions[0];

                          const renderPeriodStatus = (sess: LdssSessionAssessment | undefined) => {
                            if (!sess) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full text-[10px] font-bold">
                                  Belum Diisi
                                </span>
                              );
                            }
                            
                            const isCompleted = sess.status?.toUpperCase() === "COMPLETED";
                            if (isCompleted) {
                              const percent = sess.scoringSummary?.percentCompleted || 0;
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold">
                                  <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
                                  Selesai ({percent}%)
                                </span>
                              );
                            } else {
                              const percent = sess.scoringSummary?.percentCompleted || 0;
                              const isMyDraft = sess.createdByUid === profile?.uid;
                              return (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">
                                    <Pencil size={10} className="text-amber-500 shrink-0" />
                                    Draf ({percent}%)
                                  </span>
                                  {isMyDraft && (
                                    <button
                                      onClick={() => handleDeleteDraft(sess.id)}
                                      className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-100"
                                      title="Hapus Draft Milik Saya"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              );
                            }
                          };

                          const teacherAge = activeSession?.instrumentAge || latestSession?.instrumentAge;

                          return (
                            <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                              <td className="py-3.5 px-4 font-black text-slate-800">{student.name}</td>
                              <td className="py-3.5 px-4 text-center font-bold text-slate-600">
                                {teacherAge ? (
                                  `${teacherAge} Th`
                                ) : (
                                  <span className="text-slate-400 font-semibold italic">Belum diisi</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center">{renderPeriodStatus(s1)}</td>
                              <td className="py-3.5 px-4 text-center">{renderPeriodStatus(s2)}</td>
                              <td className="py-3.5 px-4 text-center">{renderPeriodStatus(s3)}</td>
                              <td className="py-3.5 px-4 text-slate-400 font-bold">
                                {latestSession 
                                  ? `${new Date(latestSession.updatedAt).toLocaleDateString("id-ID")} - ${latestSession.updatedBy?.name || latestSession.createdBy?.name || "Guru"}`
                                  : "-"
                                }
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <button
                                  onClick={() => {
                                    setSelectedStudent(student);
                                    // Use active session instrument age, fallback to latest or computed age
                                    setSelectedAge(activeSession?.instrumentAge || latestSession?.instrumentAge || computedAge);
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black tracking-wide flex items-center justify-center gap-1 w-full border transition-all cursor-pointer ${
                                    activeSession?.status?.toUpperCase() === "COMPLETED"
                                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-250"
                                      : activeSession
                                      ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm"
                                      : ldssSettings?.status === "CLOSED"
                                      ? "bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed"
                                      : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-650 shadow-sm"
                                  }`}
                                  disabled={!activeSession && ldssSettings?.status === "CLOSED"}
                                >
                                  {activeSession?.status?.toUpperCase() === "COMPLETED" ? (
                                    <>
                                      <Eye size={12} />
                                      <span>Tinjau</span>
                                    </>
                                  ) : activeSession ? (
                                    <>
                                      <Pencil size={12} />
                                      <span>Edit Draf</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus size={12} />
                                      <span>Mulai</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Progress Chart Card */}
              <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm text-left space-y-6">
                <div className="border-b border-gray-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-gray-950 tracking-tight flex items-center gap-2">
                      <TrendingUp className="text-indigo-600 shrink-0" size={18} />
                      Perkembangan LDSS Kelas / Siswa
                    </h3>
                    <p className="text-xs text-slate-400 font-bold">
                      Grafik tren perkembangan skor pencapaian per domain/komponen dalam satu tahun ajaran (diambil dari data Lengkap).
                    </p>
                  </div>

                  {completedStudents.length > 0 && (
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="text-slate-400 font-bold whitespace-nowrap">Pilih Siswa:</span>
                      <select
                        value={chartStudentId}
                        onChange={(e) => setChartStudentId(e.target.value)}
                        className="bg-slate-50 border border-gray-150 rounded-xl px-3 py-2 text-xs font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-150 h-[38px] cursor-pointer"
                      >
                        {completedStudents.map((cs) => (
                          <option key={cs.id} value={cs.id}>
                            {cs.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {!hasCompletedSessions ? (
                  <div className="py-12 px-6 rounded-2xl bg-slate-50/50 border border-dashed border-gray-150 text-center flex flex-col items-center justify-center text-slate-400 space-y-3">
                    <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <TrendingUp size={20} className="text-slate-300" />
                    </div>
                    <div className="max-w-xs space-y-0.5">
                      <p className="text-xs font-black text-slate-600">Grafik Tidak Tersedia</p>
                      <p className="text-[11px] font-semibold leading-relaxed">
                        Belum ada data asesmen dengan status <strong className="text-slate-500">Selesai (Completed)</strong> di kelas ini. Grafik akan aktif secara otomatis setelah asesmen difinalisasi.
                      </p>
                    </div>
                  </div>
                ) : chartDataAndDomains.data.length === 0 ? (
                  <div className="text-center text-slate-400 py-12 text-xs font-semibold">
                    Silakan tentukan pilihan siswa yang memiliki asesmen Selesai untuk memplot grafik.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Checkboxes selector on the left (1 column) */}
                    <div className="space-y-3 lg:border-r border-gray-100 lg:pr-6 max-h-80 overflow-y-auto">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider sticky top-0 bg-white pb-1.5 z-10 border-b border-gray-50">
                        Filter Domain ({chartDataAndDomains.domains.length})
                      </p>
                      <div className="space-y-1.5">
                        {chartDataAndDomains.domains.map((domKey) => {
                          const capitalizedName = domKey.replace(/_/g, " ").replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
                          return (
                            <label key={domKey} className="flex items-start gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors text-[11px] font-bold text-slate-600">
                              <input
                                type="checkbox"
                                checked={!!checkedDomains[domKey]}
                                onChange={() => setCheckedDomains(prev => ({ ...prev, [domKey]: !prev[domKey] }))}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span className="leading-tight truncate">{capitalizedName}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive Chart on the right (3 columns) */}
                    <div className="lg:col-span-3 h-[320px] w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartDataAndDomains.data}
                          margin={{ top: 10, right: 30, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#94a3b8' }} />
                          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#94a3b8' }} unit="%" />
                          <ChartTooltip
                            contentStyle={{ backgroundColor: "#ffffff", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)", fontSize: "11px", fontWeight: "600" }}
                            formatter={(value: any, name: string) => [`${value}%`, name.replace(/_/g, " ").toUpperCase()]}
                          />
                          <ChartLegend wrapperStyle={{ fontSize: "10px", fontWeight: "bold", paddingTop: "15px" }} />
                          {chartDataAndDomains.domains.map((domKey, idx) => {
                            if (!checkedDomains[domKey]) return null;
                            const colors = [
                              "#6366f1", // Indigo
                              "#10b981", // Emerald
                              "#f59e0b", // Amber
                              "#ef4444", // Rose
                              "#8b5cf6", // Violet
                              "#06b6d4", // Cyan
                              "#ec4899", // Pink
                              "#14b8a6", // Teal
                              "#f97316", // Orange
                              "#22c55e", // Green
                              "#3b82f6", // Blue
                              "#eab308", // Yellow
                            ];
                            const strokeColor = colors[idx % colors.length];
                            const labelName = domKey.replace(/_/g, " ").toUpperCase();
                            return (
                              <Line
                                key={domKey}
                                type="monotone"
                                dataKey={domKey}
                                name={labelName}
                                stroke={strokeColor}
                                strokeWidth={2.5}
                                activeDot={{ r: 6 }}
                                connectNulls
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty state selection card when no class is selected */
            <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-12 shadow-sm text-center flex flex-col items-center justify-center text-slate-400 space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 border border-slate-100">
                <GraduationCap size={24} className="text-indigo-500" />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-black text-gray-700">Rekapitulasi Kelas Elementary</p>
                <p className="text-xs text-gray-400 font-medium leading-relaxed">
                  Silakan pilih salah satu Kelas di atas untuk menampilkan daftar pengisian LDSS 1, 2, 3 dan melacak kemajuan siswa.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 3. Reusable LdssSettingsShell Component
function LdssSettingsShell() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userEmail = profile?.email || "admin@lazuardi.sch.id";
  const settingsAges: LdssAge[] = [6, 7, 8, 9, 10, 11, 12];
  
  const [templates, setTemplates] = React.useState<LdssTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showSeedModal, setShowSeedModal] = React.useState(false);
  const [seedAge, setSeedAge] = React.useState<LdssAge | null>(null);
  const [seeding, setSeeding] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await getAllLdssTemplates();
        setTemplates(data);
      } catch (err) {
        console.error("Error loading templates in settings dashboard:", err);
      } finally {
        setLoading(false);
      }
    };
    loadTemplates();
  }, []);

  const handleSeedClick = (ageToSeed: LdssAge) => {
    setErrorMessage(null);
    setSeedAge(ageToSeed);
    setShowSeedModal(true);
  };

  const executeSeed = async () => {
    if (!seedAge) return;
    setSeeding(true);
    setErrorMessage(null);
    try {
      if (seedAge === 6) {
        await seedLdssTemplateAge6(userEmail, SEED_DOMAINS_USIA_6);
      } else if (seedAge === 7) {
        await seedLdssTemplateAge7(userEmail, SEED_DOMAINS_USIA_7);
      } else if (seedAge === 8) {
        await seedLdssTemplateAge8(userEmail, SEED_DOMAINS_USIA_8);
      } else if (seedAge === 9) {
        await seedLdssTemplateAge9(userEmail, SEED_DOMAINS_USIA_9);
      } else if (seedAge === 10) {
        await seedLdssTemplateAge10(userEmail, SEED_DOMAINS_USIA_10);
      } else if (seedAge === 11) {
        await seedLdssTemplateAge11(userEmail, SEED_DOMAINS_USIA_11);
      } else if (seedAge === 12) {
        await seedLdssTemplateAge12(userEmail, SEED_DOMAINS_USIA_12);
      } else {
        throw new Error("Seeding tidak didukung untuk usia " + seedAge);
      }
      
      // Store flag for toast on next screen
      sessionStorage.setItem("ldss_seed_success", "true");
      
      // Close modal
      setShowSeedModal(false);
      
      // Navigate directly to the template editor
      navigate(`/elementary/ldss/settings/${seedAge}`);
    } catch (err: any) {
      console.error("Error during template seeding:", err);
      setErrorMessage(err?.message || "Gagal memuat template resmi. Silakan coba kembali.");
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-gray-150 p-16 shadow-sm flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-500 font-bold">Memuat konfigurasi template...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Header */}
      <div className="text-left space-y-1.5">
        <h2 className="text-lg font-black text-gray-900 tracking-tight">
          Pengaturan LDSS
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Kelola template instrumen LDSS berdasarkan usia.
        </p>
      </div>

      {/* Grid of seven active/draft age cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {settingsAges.map((age) => {
          const ageTemplates = templates.filter(t => t.age === age);
          const activeTemplate = ageTemplates.find(t => t.status === "active");
          const draftTemplate = ageTemplates.find(t => t.status === "draft");
          
          const latestTemplate = activeTemplate || draftTemplate || ageTemplates[0];

          let statusBadgeClass = "bg-slate-100 text-slate-600 border-slate-200";
          let statusLabel = "Belum dikonfigurasi";

          if (activeTemplate) {
            statusBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
            statusLabel = `Aktif: ${activeTemplate.version}`;
          } else if (draftTemplate) {
            statusBadgeClass = "bg-amber-50 text-amber-700 border-amber-200";
            statusLabel = `Draft: ${draftTemplate.version}`;
          } else if (ageTemplates.length > 0) {
            statusBadgeClass = "bg-slate-100 text-slate-500 border-slate-250";
            statusLabel = `Arsip: ${ageTemplates[0].version}`;
          }

          const hasTemplate = ageTemplates.length > 0;
          const totalDomains = latestTemplate?.domains?.length || 0;
          const totalIndicators = latestTemplate?.domains?.reduce((sum, d) => sum + (d.indicators?.length || 0), 0) || 0;

          return (
            <div
              key={age}
              className="bg-white border border-gray-150 hover:border-gray-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-5 transition-all text-left hover:shadow-md"
            >
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-gray-800 uppercase tracking-wider">
                    Usia {age} Tahun
                  </span>
                  {/* Status Badge */}
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${statusBadgeClass}`}>
                    {statusLabel}
                  </span>
                </div>

                {hasTemplate ? (
                  <div className="space-y-2.5">
                    <div className="space-y-0.5">
                      <p className="text-[11px] text-indigo-650 font-black">
                        {totalDomains} Domain • {totalIndicators} Indikator
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                        Selesai dimodifikasi pada {new Date(latestTemplate.updatedAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    {latestTemplate?.domains && latestTemplate.domains.length > 0 && (
                      <div className="pt-2 border-t border-gray-100 space-y-1.5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Daftar Domain:</p>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                          {latestTemplate.domains.map((dom) => (
                            <span key={dom.id} className="px-2 py-0.5 bg-slate-50 border border-gray-150 text-slate-600 rounded-lg text-[9px] font-semibold">
                              {dom.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {age === 6 ? (
                      <p className="text-[11px] text-indigo-600 font-bold leading-relaxed">
                        Tersedia opsi memuat draft instrumen standar dengan 15 domain dan 75 indikator, atau buat baru dari awal.
                      </p>
                    ) : age === 7 || age === 8 || age === 9 || age === 10 || age === 11 || age === 12 ? (
                      <p className="text-[11px] text-indigo-600 font-bold leading-relaxed">
                        Membuat draft instrumen 15 domain dan 75 indikator.
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Belum ada instrumen yang ditambahkan untuk anak usia {age} tahun.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action button */}
              {(age === 6 || age === 7 || age === 8 || age === 9 || age === 10 || age === 11 || age === 12) && !hasTemplate ? (
                <div className="flex flex-col gap-1.5 w-full pt-1">
                  <button
                    onClick={() => handleSeedClick(age)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-650 shadow-sm"
                  >
                    <span>Muat Template Resmi Usia {age}</span>
                    <Sparkles size={12} className="shrink-0 text-emerald-100" />
                  </button>
                  <button
                    onClick={() => navigate(`/elementary/ldss/settings/${age}`)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer bg-white border-gray-200 hover:bg-slate-50 text-gray-700 shadow-sm"
                  >
                    <span>Atur Template Manual</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => navigate(`/elementary/ldss/settings/${age}`)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                    hasTemplate
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-650 shadow-sm"
                      : "bg-indigo-50 hover:bg-indigo-100/75 text-indigo-700 border-indigo-100 shadow-sm"
                  }`}
                >
                  <span>{hasTemplate ? "Kelola Template" : "Atur Template"}</span>
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Seed Confirmation Modal */}
      <AnimatePresence>
        {showSeedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => !seeding && setShowSeedModal(false)}
            ></motion.div>

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white border border-gray-150 rounded-3xl p-6 shadow-2xl max-w-md w-full text-left space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                  <Sparkles size={20} />
                </div>
                <h4 className="text-base font-black text-gray-900 tracking-tight">
                  Muat Template LDSS Usia {seedAge}?
                </h4>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Template ini akan membuat draft v1.0 dengan 15 domain dan 75 indikator. Anda masih dapat meninjau dan mengeditnya sebelum mengaktifkan template.
              </p>

              {errorMessage && (
                <div className="bg-rose-50 border border-rose-100 text-rose-800 text-xs p-3 rounded-xl font-bold flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  disabled={seeding}
                  onClick={() => setShowSeedModal(false)}
                  className="px-4 py-2.5 bg-slate-50 border border-gray-200 hover:bg-slate-100 text-gray-700 text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  disabled={seeding}
                  onClick={executeSeed}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {seeding ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-white" />
                      <span>Memuat...</span>
                    </>
                  ) : (
                    <span>Muat Template</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
