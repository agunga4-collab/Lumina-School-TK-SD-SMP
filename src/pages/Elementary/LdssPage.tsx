import * as React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { getClasses, getActiveStudents } from "../../lib/firebase";
import { Class, Student, LdssAge, LdssTemplate } from "../../types";
import {
  ClipboardCheck,
  Settings,
  Search,
  ChevronDown,
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
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getAllLdssTemplates, seedLdssTemplateAge6 } from "../../services/ldssTemplateService";
import { SEED_DOMAINS_USIA_6 } from "../../data/ldssSeedData6";
import LdssTemplateEditor from "../../components/Elementary/LdssTemplateEditor";

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

  // Load Classes on mount
  React.useEffect(() => {
    const loadClasses = async () => {
      try {
        setLoadingClasses(true);
        const allClasses = await getClasses();
        // Filter only Active Elementary Classes
        const elementaryClasses = allClasses.filter(
          (c) => c.unitId === "ELEMENTARY" && c.status !== "archived"
        );
        setClasses(elementaryClasses);
      } catch (err) {
        console.error("Failed to load elementary classes for LDSS:", err);
      } finally {
        setLoadingClasses(false);
      }
    };
    loadClasses();
  }, []);

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
      } catch (err) {
        console.error("Failed to load students for selected class:", err);
      } finally {
        setLoadingStudents(false);
      }
    };
    loadStudents();
  }, [selectedClass, activeYear]);

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
  };

  const handleStudentSelect = (std: Student) => {
    setSelectedStudent(std);
    setSelectedAge(null);
    setStudentSearch("");
    setIsStudentDropdownOpen(false);
  };

  const handleAgeSelect = (age: LdssAge) => {
    setSelectedAge(age);
    setIsAgeDropdownOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Selection Panel Grid Layout */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm relative z-40">
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

            {/* Float Portal Dropdown */}
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

          {/* Dropdown 2: Pilih Siswa */}
          <div ref={studentDropdownRef} className="relative space-y-1.5 text-left">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">
              Pilih Siswa
            </label>
            <button
              type="button"
              disabled={!selectedClass}
              onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
              className={`w-full px-4 py-3 bg-white border rounded-xl text-xs font-bold shadow-sm flex items-center justify-between transition-all h-[44px] ${
                !selectedClass
                  ? "bg-slate-50 border-gray-100 text-gray-400 cursor-not-allowed"
                  : "border-gray-150 text-gray-800 hover:bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-100"
              }`}
            >
              <span className="truncate">
                {loadingStudents
                  ? "Memuat Siswa..."
                  : selectedStudent
                  ? selectedStudent.name
                  : !selectedClass
                  ? "Pilih kelas terlebih dahulu"
                  : "Pilih Siswa"}
              </span>
              <ChevronDown size={14} className="text-gray-400 shrink-0" />
            </button>

            {/* Float Portal Dropdown with Search, Max Height & Internal Scroll */}
            <AnimatePresence>
              {isStudentDropdownOpen && selectedClass && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl flex flex-col max-h-72"
                >
                  {/* Search Header inside dropdown */}
                  <div className="p-2 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Cari siswa..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-gray-150 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        onClick={(e) => e.stopPropagation()} // Prevent closing dropdown on input click
                      />
                      <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                    </div>
                  </div>

                  {/* Scrollable list */}
                  <div className="overflow-y-auto flex-1 max-h-56 py-1">
                    {filteredStudents.length === 0 ? (
                      <div className="px-4 py-4 text-xs text-gray-400 italic text-center font-semibold">
                        Siswa tidak ditemukan.
                      </div>
                    ) : (
                      filteredStudents.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleStudentSelect(s)}
                          className={`w-full px-4 py-2.5 text-left text-xs font-bold flex items-center justify-between hover:bg-indigo-50/50 transition-colors ${
                            selectedStudent?.id === s.id
                              ? "bg-indigo-50/30 text-indigo-600"
                              : "text-gray-700"
                          }`}
                        >
                          <span className="truncate">{s.name}</span>
                          {selectedStudent?.id === s.id && (
                            <Check size={14} className="text-indigo-600" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dropdown 3: Pilih Usia */}
          <div ref={ageDropdownRef} className="relative space-y-1.5 text-left">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">
              Pilih Usia
            </label>
            <button
              type="button"
              disabled={!selectedStudent}
              onClick={() => setIsAgeDropdownOpen(!isAgeDropdownOpen)}
              className={`w-full px-4 py-3 bg-white border rounded-xl text-xs font-bold shadow-sm flex items-center justify-between transition-all h-[44px] ${
                !selectedStudent
                  ? "bg-slate-50 border-gray-100 text-gray-400 cursor-not-allowed"
                  : "border-gray-150 text-gray-800 hover:bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-100"
              }`}
            >
              <span className="truncate">
                {selectedAge ? `Usia ${selectedAge} Tahun` : "Pilih Usia"}
              </span>
              <ChevronDown size={14} className="text-gray-400 shrink-0" />
            </button>

            {/* Read-only helper text */}
            <p className="text-[10px] text-slate-400 font-bold ml-1 flex items-center gap-1 mt-1">
              <Info size={11} className="text-slate-400 shrink-0" />
              Pilih usia instrumen sesuai kebutuhan screening.
            </p>

            {/* Float Portal Dropdown */}
            <AnimatePresence>
              {isAgeDropdownOpen && selectedStudent && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto py-1"
                >
                  {agesList.map((age) => (
                    <button
                      key={age}
                      type="button"
                      onClick={() => handleAgeSelect(age)}
                      className={`w-full px-4 py-2.5 text-left text-xs font-bold flex items-center justify-between hover:bg-indigo-50/50 transition-colors ${
                        selectedAge === age
                          ? "bg-indigo-50/30 text-indigo-600"
                          : "text-gray-700"
                      }`}
                    >
                      <span>Usia {age} Tahun</span>
                      {selectedAge === age && (
                        <Check size={14} className="text-indigo-600" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Placeholder / Empty State showing assessment detail card */}
      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {selectedClass && selectedStudent && selectedAge ? (
            <motion.div
              key="ldss-filled-placeholder"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl border border-gray-150 p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto"
            >
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                <Activity size={32} />
              </div>
              <div className="space-y-2">
                <h4 className="text-base font-black text-gray-900 tracking-tight">
                  Instrumen LDSS Usia {selectedAge} Tahun
                </h4>
                <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                  Instrumen asesmen Lazuardi Developmental Screening System untuk{" "}
                  <span className="font-bold text-indigo-600">{selectedStudent.name}</span> ({selectedClass.name}){" "}
                  akan ditampilkan di sini setelah konfigurasi indikator selesai.
                </p>
              </div>

              {/* Status Badge */}
              <div className="inline-flex items-center gap-1.5 bg-yellow-50 text-yellow-700 border border-yellow-100 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm">
                <Sparkles size={13} className="text-yellow-600 animate-pulse" />
                <span>Tahap berikutnya: Pengisian indikator</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="ldss-empty-placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-3xl border border-dashed border-gray-200 p-12 shadow-sm text-center flex flex-col items-center justify-center text-slate-400 space-y-4"
            >
              <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 border border-slate-100">
                <User size={24} />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-black text-gray-700">Asesmen LDSS Siswa</p>
                <p className="text-xs text-gray-400 font-medium leading-relaxed">
                  Silakan tentukan pilihan Kelas, Siswa, dan Usia di atas untuk memulai atau meninjau screening instrumen.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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

  const handleSeedClick = () => {
    setErrorMessage(null);
    setShowSeedModal(true);
  };

  const executeSeed = async () => {
    setSeeding(true);
    setErrorMessage(null);
    try {
      await seedLdssTemplateAge6(userEmail, SEED_DOMAINS_USIA_6);
      
      // Store flag for toast on next screen
      sessionStorage.setItem("ldss_seed_success", "true");
      
      // Close modal
      setShowSeedModal(false);
      
      // Navigate directly to Usia 6 template editor
      navigate(`/elementary/ldss/settings/6`);
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
                  <div className="space-y-1">
                    <p className="text-[11px] text-indigo-650 font-black">
                      {totalDomains} Domain • {totalIndicators} Indikator
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                      Selesai dimodifikasi pada {new Date(latestTemplate.updatedAt).toLocaleDateString("id-ID")}
                    </p>
                  </div>
                ) : (
                  <div>
                    {age === 6 ? (
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
              {age === 6 && !hasTemplate ? (
                <button
                  onClick={handleSeedClick}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-650 shadow-sm"
                >
                  <span>Muat Template Resmi Usia 6</span>
                  <Sparkles size={12} className="shrink-0 text-emerald-100" />
                </button>
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
                  Muat Template LDSS Usia 6?
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
