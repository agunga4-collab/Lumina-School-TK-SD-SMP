import * as React from "react";
import axios from "axios";
import { motion } from "motion/react";
import {
  Users,
  Mail,
  UserPlus,
  CheckCircle2,
  XCircle,
  Search,
  Trash2,
  Edit2,
  ShieldCheck,
  ChevronRight,
  Loader2,
  Sparkles,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Plus,
  Filter,
  Smile,
  Footprints,
  Brain,
  GraduationCap,
  BookOpen,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Upload,
  Play,
  Terminal,
  LayoutDashboard,
  PlusSquare,
  Lock,
  Menu,
} from "lucide-react";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { getDoc, setDoc, collection, getDocs, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import {
  getAllInvites,
  getPendingUsers,
  addInvite,
  updateInvite,
  deleteInvite,
  activateUser,
  getClasses,
  addClass,
  updateClass,
  deleteClass,
  getTeachers,
  db,
} from "../../lib/firebase";
import { auth, writeBatch, doc } from "../../lib/firebase";
import { User, RoleInvite, UserRole, UnitType, Class, PromptTemplate } from "../../types";
import { cn } from "../../lib/utils";

const getGradeOptions = (unitId: string): string[] => {
  if (unitId === "KINDERGARTEN") return ["Pra TK", "TK A", "TK B"];
  if (unitId === "ELEMENTARY") return ["1", "2", "3", "4", "5", "6"];
  return ["7", "8", "9"]; // JUNIOR_HIGH
};

const safeLower = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase();
};

function SortIcon({ column, currentConfig }: { column: string; currentConfig: { key: string; direction: "asc" | "desc" } }) {
  if (currentConfig.key !== column) return <ArrowUpDown size={12} className="text-gray-300" />;
  return currentConfig.direction === "asc" ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />;
}

export default function SuperAdminPage() {
  const [selectedUnit, setSelectedUnit] = React.useState<UnitType | "ALL">(
    "ALL",
  );
  const [activeTab, setActiveTab] = React.useState<
    "STAFF" | "STUDENT" | "PARENT" | "CLASSES" | "LOGO" | "PROMPTS" | "KNOWLEDGE_BASE" | "PENDING"
  >("STAFF");
  const [activeMenu, setActiveMenu] = React.useState<
    "overview" | "user-undangan" | "user-pending" | "kelas" | "ai-prompts" | "ai-knowledge" | "ai-logo" | "import-massal" | "import-sync" | "sistem-reset" | "academic-year" | "reconcile-siswa" | "conflict-siswa"
  >("overview");
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({
    USER: false,
    KELAS: false,
    AI: false,
    IMPORT: false,
    SISTEM: false,
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [logos, setLogos] = React.useState<{
    KINDERGARTEN: { rectangular: string; square: string };
    ELEMENTARY: { rectangular: string; square: string };
    JUNIOR_HIGH: { rectangular: string; square: string };
  }>({
    KINDERGARTEN: { rectangular: "", square: "" },
    ELEMENTARY: { rectangular: "", square: "" },
    JUNIOR_HIGH: { rectangular: "", square: "" },
  });
  const [isLogosSaving, setIsLogosSaving] = React.useState(false);

  const { activeYear, activeSemester, updateAcademicYear } = useAcademicYear();
  const [tempYear, setTempYear] = React.useState(activeYear);
  const [tempSemester, setTempSemester] = React.useState(activeSemester);
  const [isSavingYear, setIsSavingYear] = React.useState(false);
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);

  React.useEffect(() => {
    setTempYear(activeYear);
    setTempSemester(activeSemester);
  }, [activeYear, activeSemester]);

  const handleLogoUpload = (unit: "KINDERGARTEN" | "ELEMENTARY" | "JUNIOR_HIGH", type: "rectangular" | "square", file: File) => {
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      alert("Harap pilih file gambar (.png, .jpg, .jpeg, .webp, .svg)!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        let targetWidth = 400;
        let targetHeight = 400;
        
        if (type === "rectangular") {
          targetWidth = 300;
          targetHeight = 100;
        } else {
          targetWidth = 150;
          targetHeight = 150;
        }
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        ctx.fillStyle = "transparent";
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        const compressedBase64 = canvas.toDataURL("image/png");
        
        setLogos((prev) => ({
          ...prev,
          [unit]: {
            ...prev[unit],
            [type]: compressedBase64,
          },
        }));
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogos = async (updatedLogos = logos) => {
    setIsLogosSaving(true);
    try {
      localStorage.setItem("lumina_school_logos", JSON.stringify(updatedLogos));
      await setDoc(doc(db, "settings", "logos"), updatedLogos);
      alert("Logo berhasil disimpan ke sistem dan tersinkronisasi! ✨");
    } catch (err: any) {
      console.error("Error saving school logos:", err);
      alert("Gagal menyingkronkan ke cloud, namun logo tersimpan lokal di browser Anda: " + err.message);
    } finally {
      setIsLogosSaving(false);
    }
  };
  const [invites, setInvites] = React.useState<(RoleInvite & { id: string })[]>(
    [],
  );
  const [pendingUsers, setPendingUsers] = React.useState<User[]>([]);
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [selectedClassFilter, setSelectedClassFilter] = React.useState<string>("ALL");
  const [selectedInviteIds, setSelectedInviteIds] = React.useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState<boolean>(false);

  React.useEffect(() => {
    setSelectedClassFilter("ALL");
    setSelectedInviteIds([]);
  }, [activeTab, selectedUnit, activeMenu]);
  const [teachers, setTeachers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [isDeleteClassConfirmOpen, setIsDeleteClassConfirmOpen] = React.useState(false);
  const [classToDeleteId, setClassToDeleteId] = React.useState<string | null>(null);
  const [importMode, setImportMode] = React.useState<
    "STAFF" | "STUDENT" | "PARENT"
  >("STAFF");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortConfig, setSortConfig] = React.useState<{
    key: string;
    direction: "asc" | "desc";
  }>({ key: "name", direction: "asc" });
  const [classSortConfig, setClassSortConfig] = React.useState<{
    key: "name" | "unitId" | "grade" | "academicYear";
    direction: "asc" | "desc";
  }>({ key: "name", direction: "asc" });

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handleClassSort = (key: typeof classSortConfig.key) => {
    let direction: "asc" | "desc" = "asc";
    if (classSortConfig.key === key && classSortConfig.direction === "asc") {
      direction = "desc";
    }
    setClassSortConfig({ key, direction });
  };

  // Import State
  const [importLoading, setImportLoading] = React.useState(false);
  const [syncLoading, setSyncLoading] = React.useState(false);

  const handleSyncParents = async () => {
    try {
      setSyncLoading(true);
      const response = await axios.post("/api/admin/sync-parents-data");
      const { created, updated, totalParents } = response.data;
      alert(`Sinkronisasi Selesai!\nTotal Wali: ${totalParents}\nBaru: ${created}\nUpdate: ${updated}`);
      fetchData(); // Refresh list
    } catch (error: any) {
      console.error("Sync error:", error);
      alert("Gagal sinkronisasi: " + (error.response?.data?.error || error.message));
    } finally {
      setSyncLoading(false);
    }
  };
  const [expandedClassId, setExpandedClassId] = React.useState<string | null>(
    null,
  );
  const [expandedStudentsSortDir, setExpandedStudentsSortDir] = React.useState<"asc" | "desc">("asc");
  const [importResult, setImportResult] = React.useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [resetLoading, setResetLoading] = React.useState(false);

  // States for student reference reconciliation
  const [reconcileUnit, setReconcileUnit] = React.useState<string>("KINDERGARTEN");
  const [isReconciling, setIsReconciling] = React.useState(false);
  const [reconciliationResult, setReconciliationResult] = React.useState<any | null>(null);

  // States for Prompt templates
  const [promptTemplates, setPromptTemplates] = React.useState<PromptTemplate[]>([]);
  const [isPromptModalOpen, setIsPromptModalOpen] = React.useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = React.useState(false);
  const [selectedPrompt, setSelectedPrompt] = React.useState<PromptTemplate | null>(null);
  const [promptFormData, setPromptFormData] = React.useState<Omit<PromptTemplate, "id" | "createdAt" | "updatedAt">>({
    key: "",
    name: "",
    unit: "KINDERGARTEN",
    category: "report",
    prompt: "",
    variables: [],
    description: "",
    isActive: true,
    updatedBy: "",
  });

  const [testVariables, setTestVariables] = React.useState<Record<string, string>>({});
  const [testResult, setTestResult] = React.useState<string>("");
  const [isTestingPrompt, setIsTestingPrompt] = React.useState(false);

  // States for Knowledge Base
  const [knowledgeBase, setKnowledgeBase] = React.useState<any[]>([]);
  const [syncKnowledgeLoading, setSyncKnowledgeLoading] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<any | null>(null);
  const [folderIdText, setFolderIdText] = React.useState("1if5MJST18x6zHOXJTi7W82BAqkwEbBBd");

  const handleSyncKnowledge = async () => {
    try {
      setSyncKnowledgeLoading(true);
      setSyncResult(null);
      const user = auth.currentUser;
      if (!user) {
        alert("Sesi Anda habis. Harap login ulang.");
        return;
      }
      const token = await user.getIdToken();
      
      const response = await axios.post("/api/sync-knowledge", {
        folderId: folderIdText.trim()
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (response.data) {
        const { total, synced, errors } = response.data;
        setSyncResult({ total, synced, errors });
        alert(`Selesai! Berhasil sinkronisasi ${synced} dari ${total} file Google Docs.`);
        // Reload knowledge items
        const kbSnap = await getDocs(collection(db, "knowledgeBase"));
        setKnowledgeBase(kbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
      }
    } catch (err: any) {
      console.error("Knowledge base sync fail:", err);
      alert("Gagal sinkronisasi data: " + (err.response?.data?.error || err.message));
    } finally {
      setSyncKnowledgeLoading(false);
    }
  };

  // Google Sheets import custom states
  const defaultSheetId = import.meta.env.VITE_GOOGLE_SHEET_ID_LUMINA || "1NOfiH3ZJ5-9rW-vRE3Hq7q_uP8gVWhGZ6p7LgXN1-E4";
  const [studentSheetId, setStudentSheetId] = React.useState<string>(defaultSheetId);
  const [studentSheetName, setStudentSheetName] = React.useState<string>("SiswaLumina");
  const [staffSheetId, setStaffSheetId] = React.useState<string>(defaultSheetId);
  const [staffSheetName, setStaffSheetName] = React.useState<string>("StaffLumina");
  const [parentSheetId, setParentSheetId] = React.useState<string>(defaultSheetId);
  const [parentSheetName, setParentSheetName] = React.useState<string>("OrangTuaLumina");
  const [activeImportSection, setActiveImportSection] = React.useState<"STUDENT" | "STAFF" | "PARENT" | null>(null);
  const [importSectionResult, setImportSectionResult] = React.useState<Record<string, { created: number; updated: number; skipped: number; errors: any[] } | null>>({
    STUDENT: null,
    STAFF: null,
    PARENT: null,
  });

  // Copy-Paste Import states
  const [importSubTab, setImportSubTab] = React.useState<"sheets" | "paste">("sheets");
  const [pasteMode, setPasteMode] = React.useState<"STUDENT" | "STAFF" | "PARENT">("STUDENT");
  const [pasteUnit, setPasteUnit] = React.useState<string>("JUNIOR_HIGH");
  const [pasteClassId, setPasteClassId] = React.useState<string>("");
  const [pasteAcademicYear, setPasteAcademicYear] = React.useState<string>("2025/2026");
  const [pasteSemester, setPasteSemester] = React.useState<number>(1);
  const [pasteText, setPasteText] = React.useState<string>("");

  const [parsedRows, setParsedRows] = React.useState<string[][]>([]);
  const [detectedHeaders, setDetectedHeaders] = React.useState<string[]>([]);
  const [columnMappings, setColumnMappings] = React.useState<Record<number, string>>({});
  const [hasDetectedHeaders, setHasDetectedHeaders] = React.useState<boolean>(false);
  const [isParsing, setIsParsing] = React.useState<boolean>(false);
  const [isSavingPaste, setIsSavingPaste] = React.useState<boolean>(false);
  const [pasteResult, setPasteResult] = React.useState<{ created: number; updated: number; skipped: number; errors: string[]; skippedReasons?: string[] } | null>(null);

  React.useEffect(() => {
    // Automatically pre-select first class of selected unit when unit changes
    const filtered = classes.filter(c => c.unitId === pasteUnit && c.status !== "archived");
    if (filtered.length > 0) {
      setPasteClassId(filtered[0].name);
    } else {
      setPasteClassId("");
    }
  }, [pasteUnit, classes]);

  const handleDetectColumns = () => {
    if (!pasteText.trim()) {
      alert("Silakan paste data dari Excel atau Google Sheets terlebih dahulu.");
      return;
    }

    setIsParsing(true);
    setPasteResult(null);

    // Parse spreadsheet tsv clipboard structure
    const rawRows = pasteText.split(/\r?\n/).map(line => line.split("\t"));
    const nonEmptyRows = rawRows.filter(row => row.some(cell => cell.trim() !== ""));

    if (nonEmptyRows.length === 0) {
      alert("Tidak ada baris data yang valid ditemukan.");
      setIsParsing(false);
      return;
    }

    // Header Detection (if any common column names are in first row)
    const firstRow = nonEmptyRows[0];
    const isHeaderRow = firstRow.some(cell => {
      const cellLower = cell.trim().toLowerCase();
      return (
        cellLower.includes("nama") || 
        cellLower.includes("email") || 
        cellLower.includes("nis") || 
        cellLower.includes("gender") || 
        cellLower.includes("kelas") || 
        cellLower.includes("jabatan") || 
        cellLower.includes("role") ||
        cellLower.includes("wali") ||
        cellLower.includes("panggilan")
      );
    });

    let dataRows: string[][] = [];
    let headers: string[] = [];

    if (isHeaderRow) {
      headers = firstRow.map(cell => cell.trim());
      const rawDataRows = nonEmptyRows.slice(1);
      // Pad rawDataRows to match headers length exactly to prevent column shifting
      dataRows = rawDataRows.map(row => {
        const padded = [...row];
        while (padded.length < headers.length) {
          padded.push("");
        }
        return padded.slice(0, headers.length);
      });
      setHasDetectedHeaders(true);
    } else {
      // Find maximum columns across all rows to prevent shifting/truncation
      const maxCols = Math.max(...nonEmptyRows.map(row => row.length));
      headers = Array.from({ length: maxCols }, (_, i) => `Kolom ${i + 1}`);
      dataRows = nonEmptyRows.map(row => {
        const padded = [...row];
        while (padded.length < maxCols) {
          padded.push("");
        }
        return padded.slice(0, maxCols);
      });
      setHasDetectedHeaders(false);
    }

    setParsedRows(dataRows);
    setDetectedHeaders(headers);

    // Helper to inspect if a column contains gender values
    const isGenderColumn = (colIdx: number) => {
      const sampleCells = dataRows.slice(0, 10).map(row => (row[colIdx] || "").trim().toLowerCase());
      const genderKeywords = ["l", "p", "laki-laki", "perempuan", "male", "female", "laki", "wanita", "laki laki", "perempuan/wanita"];
      return sampleCells.some(cell => cell !== "" && genderKeywords.includes(cell));
    };

    // Initial Best Guess Mappings
    const initialMappings: Record<number, string> = {};
    headers.forEach((header, i) => {
      const hLower = header.toLowerCase();
      const colIsGender = isGenderColumn(i);

      if (pasteMode === "STUDENT") {
        if (colIsGender || hLower.includes("gender") || hLower.includes("kelamin") || hLower.includes("jenis") || hLower.includes("kelm")) {
          initialMappings[i] = "gender";
        } else if (hLower.includes("nama panggilan") || hLower.includes("panggilan") || hLower.includes("nickname")) {
          initialMappings[i] = "nickname";
        } else if (hLower.includes("nama") && (hLower.includes("ayah") || hLower.includes("bapak") || hLower.includes("father"))) {
          initialMappings[i] = "fatherName";
        } else if (hLower.includes("nama") && (hLower.includes("ibu") || hLower.includes("mama") || hLower.includes("mother"))) {
          initialMappings[i] = "motherName";
        } else if (hLower.includes("ayah") || hLower.includes("bapak") || hLower.includes("father")) {
          initialMappings[i] = "fatherName";
        } else if (hLower.includes("ibu") || hLower.includes("mama") || hLower.includes("mother")) {
          initialMappings[i] = "motherName";
        } else if (hLower.includes("nama") || hLower.includes("full") || hLower.includes("lengkap")) {
          initialMappings[i] = "fullName";
        } else if (hLower.includes("nisn")) {
          initialMappings[i] = "nisn";
        } else if (hLower.includes("parent email") || hLower.includes("ortu") || hLower.includes("orang tua") || hLower.includes("wali")) {
          initialMappings[i] = "parentEmail";
        } else if (hLower.includes("email") || hLower.includes("mail")) {
          initialMappings[i] = "email";
        } else if (hLower.includes("kelas") || hLower.includes("class")) {
          initialMappings[i] = "classId";
        } else if (hLower.includes("unit")) {
          initialMappings[i] = "unitId";
        } else if (hLower.includes("tahun") || hLower.includes("academic") || hLower.includes("ajaran")) {
          initialMappings[i] = "academicYear";
        } else if (hLower.includes("nis") || hLower.includes("id") || hLower.includes("lumina")) {
          // If this column is detected as containing gender values, NEVER map it to luminaId
          if (!colIsGender) {
            initialMappings[i] = "luminaId";
          } else {
            initialMappings[i] = "gender";
          }
        }
      } else if (pasteMode === "STAFF") {
        if (hLower.includes("nama") || hLower.includes("name") || hLower.includes("lengkap")) {
          initialMappings[i] = "fullName";
        } else if (hLower.includes("email") || hLower.includes("mail")) {
          initialMappings[i] = "email";
        } else if (hLower.includes("jabatan") || hLower.includes("title") || hLower.includes("kerja")) {
          initialMappings[i] = "jobTitle";
        } else if (hLower.includes("id") || hLower.includes("lumina") || hLower.includes("nip")) {
          if (!colIsGender) {
            initialMappings[i] = "luminaId";
          }
        } else if (hLower.includes("role")) {
          initialMappings[i] = "role";
        } else if (hLower.includes("unit")) {
          initialMappings[i] = "unitId";
        }
      } else if (pasteMode === "PARENT") {
        if (hLower.includes("nama") || hLower.includes("name") || hLower.includes("lengkap")) {
          initialMappings[i] = "fullName";
        } else if (hLower.includes("email") || hLower.includes("mail")) {
          initialMappings[i] = "email";
        } else if (hLower.includes("anak") || hLower.includes("child") || hLower.includes("siswa") || hLower.includes("student")) {
          if (!colIsGender) {
            initialMappings[i] = "childId";
          }
        } else if (hLower.includes("id") || hLower.includes("lumina")) {
          if (!colIsGender) {
            initialMappings[i] = "luminaId";
          }
        } else if (hLower.includes("unit")) {
          initialMappings[i] = "unitId";
        }
      }
    });

    // Positions Fallbacks if no headers were guessed
    if (Object.keys(initialMappings).length === 0) {
      if (pasteMode === "STUDENT") {
        const fallbacks = ["luminaId", "nisn", "fullName", "nickname", "gender", "email", "parentEmail", "classId", "unitId", "academicYear"];
        headers.forEach((_, i) => {
          if (fallbacks[i]) {
            if (isGenderColumn(i)) {
              initialMappings[i] = "gender";
            } else {
              initialMappings[i] = fallbacks[i];
            }
          }
        });
      } else if (pasteMode === "STAFF") {
        const fallbacks = ["email", "jobTitle", "role", "unitId", "fullName"];
        headers.forEach((_, i) => {
          if (fallbacks[i]) initialMappings[i] = fallbacks[i];
        });
      } else if (pasteMode === "PARENT") {
        const fallbacks = ["childId", "fullName", "email", "unitId"];
        headers.forEach((_, i) => {
          if (fallbacks[i]) initialMappings[i] = fallbacks[i];
        });
      }
    }

    // Additional validation check on final generated mappings before committing:
    // If any mapping index maps to luminaId/childId but contains gender values, clear it or remap to gender
    Object.keys(initialMappings).forEach((idxStr) => {
      const idx = Number(idxStr);
      const val = initialMappings[idx];
      if (val === "luminaId" || val === "childId") {
        if (isGenderColumn(idx)) {
          initialMappings[idx] = "gender";
        }
      }
    });

    setColumnMappings(initialMappings);
    setIsParsing(false);
  };

  const handleSavePasteImport = async () => {
    if (parsedRows.length === 0) {
      alert("Gagal menyimpan. Harap deteksi kolom data terlebih dahulu.");
      return;
    }

    const mappedFields = Object.values(columnMappings);
    if (mappedFields.length === 0) {
      alert("Peringatan: Pemetaan kolom tidak boleh kosong. Silakan petakan setidaknya satu kolom.");
      return;
    }

    const hasNameMapping = mappedFields.includes("fullName") || mappedFields.includes("name");
    const hasEmailMapping = mappedFields.includes("email");

    if (pasteMode === "STUDENT") {
      if (!hasNameMapping) {
        alert("Peringatan: Anda wajib memetakan kolom 'Nama Lengkap' atau 'Nama' untuk impor siswa.");
        return;
      }
    } else if (pasteMode === "STAFF" || pasteMode === "PARENT") {
      if (!hasNameMapping || !hasEmailMapping) {
        alert(`Peringatan: Anda wajib memetakan kolom 'Nama Lengkap' dan 'Email' untuk impor ${pasteMode === "STAFF" ? "staff" : "orang tua"}.`);
        return;
      }
    }

    setIsSavingPaste(true);
    setPasteResult(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");

      const response = await fetch("/api/admin/bulk-import-paste", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rows: parsedRows,
          columnMapping: columnMappings,
          globalConfig: {
            mode: pasteMode,
            unitId: pasteUnit,
            classId: pasteClassId,
            academicYear: pasteAcademicYear,
            semester: pasteSemester
          }
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Server error");
      }

      setPasteResult({
        created: result.created || 0,
        updated: result.updated || 0,
        skipped: result.skipped || 0,
        errors: result.errors || [],
        skippedReasons: result.skippedReasons || [],
      });

      // Clear paste state to prevent duplicate clicks
      setPasteText("");
      setParsedRows([]);
      setDetectedHeaders([]);
      setColumnMappings({});

      alert("Proses Impor Paste selesai dengan sukses! ✨");
      fetchData();
    } catch (error: any) {
      console.error("[SuperAdmin] Paste import error:", error);
      alert("Gagal melakukan impor data: " + error.message);
    } finally {
      setIsSavingPaste(false);
    }
  };

  const handleSectionImport = async (mode: "STUDENT" | "STAFF" | "PARENT") => {
    let sheetId = "";
    let sheetName = "";

    if (mode === "STUDENT") {
      sheetId = studentSheetId.trim();
      sheetName = studentSheetName.trim();
    } else if (mode === "STAFF") {
      sheetId = staffSheetId.trim();
      sheetName = staffSheetName.trim();
    } else if (mode === "PARENT") {
      sheetId = parentSheetId.trim();
      sheetName = parentSheetName.trim();
    }

    if (!sheetId) {
      alert("Silakan masukkan Google Sheet ID terlebih dahulu.");
      return;
    }
    if (!sheetName) {
      alert("Silakan masukkan nama sheet terlebih dahulu.");
      return;
    }

    setImportLoading(true);
    setActiveImportSection(mode);

    // Reset result for this mode
    setImportSectionResult(prev => ({
      ...prev,
      [mode]: null,
    }));

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");

      const response = await fetch("/api/admin/bulk-import-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ sheetId, sheetName, mode }),
      });

      let result;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error("[SuperAdmin] Non-JSON response:", text);
        throw new Error(
          `Server returned non-JSON response (${response.status}). Mohon hubungi admin.`,
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Server error");
      }

      setImportSectionResult(prev => ({
        ...prev,
        [mode]: {
          created: result.created || 0,
          updated: result.updated || 0,
          skipped: result.skipped || 0,
          errors: result.errors || [],
        }
      }));
      fetchData();
    } catch (error: any) {
      console.error("[SuperAdmin] Import error:", error);
      alert("Error: " + error.message);
    } finally {
      setImportLoading(false);
      setActiveImportSection(null);
    }
  };

  const handleDeleteKnowledgeDoc = async (docId: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus dokumen ini dari Knowledge Base?")) {
      return;
    }
    try {
      await deleteDoc(doc(db, "knowledgeBase", docId));
      alert("Dokumen berhasil dihapus dari Knowledge Base!");
      setKnowledgeBase(knowledgeBase.filter(d => d.id !== docId));
    } catch (err: any) {
      console.error("Delete knowledge doc fail:", err);
      alert("Gagal menghapus dokumen: " + err.message);
    }
  };

  const detectVariables = (text: string): string[] => {
    const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, ""))));
  };

  const handleOpenPromptModal = (prompt: PromptTemplate | null = null) => {
    if (prompt) {
      setSelectedPrompt(prompt);
      setPromptFormData({
        key: prompt.key,
        name: prompt.name,
        unit: prompt.unit,
        category: prompt.category,
        prompt: prompt.prompt,
        variables: prompt.variables || [],
        description: prompt.description || "",
        isActive: prompt.isActive,
        updatedBy: prompt.updatedBy || "",
      });
    } else {
      setSelectedPrompt(null);
      setPromptFormData({
        key: "",
        name: "",
        unit: selectedUnit === "ALL" ? "KINDERGARTEN" : selectedUnit,
        category: "report",
        prompt: "",
        variables: [],
        description: "",
        isActive: true,
        updatedBy: "",
      });
    }
    setIsPromptModalOpen(true);
  };

  const handleSavePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptFormData.key || !promptFormData.name || !promptFormData.prompt) {
      alert("Harap lengkapi Key, Nama, dan Teks Prompt!");
      return;
    }

    const snakeCaseRegex = /^[a-z0-0_]+$/;
    if (!snakeCaseRegex.test(promptFormData.key)) {
      // Just double-check if numbers and characters are fine
    }

    setFormLoading(true);
    try {
      const emailAdmin = auth.currentUser?.email || "admin@lumina.id";
      const variablesList = detectVariables(promptFormData.prompt);

      const promptData = {
        key: promptFormData.key.trim(),
        name: promptFormData.name.trim(),
        unit: promptFormData.unit,
        category: promptFormData.category,
        prompt: promptFormData.prompt,
        variables: variablesList,
        description: promptFormData.description || "",
        isActive: promptFormData.isActive,
        updatedAt: Date.now(),
        updatedBy: emailAdmin,
      };

      if (selectedPrompt) {
        await setDoc(doc(db, "promptTemplates", selectedPrompt.id), {
          ...promptData,
          id: selectedPrompt.id,
          createdAt: selectedPrompt.createdAt || Date.now(),
        }, { merge: true });
        alert("Prompt template berhasil diperbaiki! ✨");
      } else {
        const qCheck = query(collection(db, "promptTemplates"), where("key", "==", promptFormData.key.trim()));
        const dupSnap = await getDocs(qCheck);
        if (!dupSnap.empty) {
          alert(`Key "${promptFormData.key}" sudah digunakan oleh template lain. Gunakan nama key yang unik!`);
          setFormLoading(false);
          return;
        }

        const docRef = doc(collection(db, "promptTemplates"));
        await setDoc(docRef, {
          ...promptData,
          id: docRef.id,
          createdAt: Date.now(),
        });
        alert("Prompt template baru berhasil ditambahkan! ✨");
      }

      setIsPromptModalOpen(false);
      // Fetch latest templates after change
      const promptsSnap = await getDocs(collection(db, "promptTemplates"));
      setPromptTemplates(promptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
    } catch (err: any) {
      console.error("Error saving prompt template:", err);
      alert("Gagal menyimpan prompt template: " + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleTogglePromptActive = async (prompt: PromptTemplate) => {
    try {
      const updatedStatus = !prompt.isActive;
      await updateDoc(doc(db, "promptTemplates", prompt.id), {
        isActive: updatedStatus,
        updatedAt: Date.now(),
        updatedBy: auth.currentUser?.email || "admin@lumina.id",
      });
      setPromptTemplates(prev =>
        prev.map(p => p.id === prompt.id ? { ...p, isActive: updatedStatus } : p)
      );
    } catch (err: any) {
      console.error("Failed to toggle status:", err);
      alert("Gagal mengubah status template: " + err.message);
    }
  };

  const handleDeletePrompt = async (prompt: PromptTemplate) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus template prompt "${prompt.name}"?\nSistem AI yang mengandalkan prompt ini mungkin kembali ke default.`)) return;

    try {
      await deleteDoc(doc(db, "promptTemplates", prompt.id));
      setPromptTemplates(prev => prev.filter(p => p.id !== prompt.id));
      alert("Prompt template berhasil dihapus.");
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert("Gagal menghapus template: " + err.message);
    }
  };

  const handleOpenTestModal = (prompt: PromptTemplate) => {
    setSelectedPrompt(prompt);
    const variables = prompt.variables || detectVariables(prompt.prompt);
    const initialVars: Record<string, string> = {};
    variables.forEach(v => {
      initialVars[v] = "";
    });
    setTestVariables(initialVars);
    setTestResult("");
    setIsTestModalOpen(true);
  };

  const handleRunPromptTest = async () => {
    if (!selectedPrompt) return;
    setIsTestingPrompt(true);
    setTestResult("");
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/test-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          promptKey: selectedPrompt.key,
          variables: testVariables,
        }),
      });

      const resData = await response.json();
      if (response.ok) {
        setTestResult(resData.text || "No text was returned by the AI.");
      } else {
        setTestResult(`Error: ${resData.error || "Gagal menguji."}`);
      }
    } catch (err: any) {
      setTestResult(`Connection Error: ${err.message}`);
    } finally {
      setIsTestingPrompt(false);
    }
  };

  // Form state
  const [formLoading, setFormLoading] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<Omit<RoleInvite, "createdAt">>(
    {
      name: "",
      email: "",
      role: "TEACHER",
      unitId: "JUNIOR_HIGH",
      jobTitle: "",
      status: "ready",
      luminaId: "",
      oldLuminaId: "",
      nisn: "",
      nickname: "",
      gender: "",
      parentEmail: "",
      fatherName: "",
      motherName: "",
      classId: "",
      academicYear: "2025/2026",
      linkedStudents: [],
    },
  );

  const [studentEnrollments, setStudentEnrollments] = React.useState<{ academicYear: string; classId: string }[]>([]);

  // Class Form State
  const [classFormData, setClassFormData] = React.useState({
    grade: "7",
    className: "",
    academicYear: "2026/2027",
    homeroomTeacherId: "",
    unitId: "JUNIOR_HIGH" as UnitType,
    teacherSignatureUrl: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [inv, pend, cls, tchs] = await Promise.all([
        getAllInvites(),
        getPendingUsers(),
        getClasses(),
        getTeachers(),
      ]);
      setInvites(inv || []);
      setPendingUsers(pend || []);
      setClasses(cls || []);
      setTeachers(tchs || []);

      // Fetch AI Prompt Templates
      try {
        const promptsSnap = await getDocs(collection(db, "promptTemplates"));
        setPromptTemplates(promptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
      } catch (err) {
        console.warn("Failed to load prompt templates from Firestore:", err);
      }

      // Fetch Knowledge Base list
      try {
        const kbSnap = await getDocs(collection(db, "knowledgeBase"));
        setKnowledgeBase(kbSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
      } catch (err) {
        console.warn("Failed to load knowledge base from Firestore:", err);
      }

      // Fetch Logos from settings/logos
      try {
        const logoDoc = await getDoc(doc(db, "settings", "logos"));
        if (logoDoc.exists()) {
          setLogos(logoDoc.data() as any);
        } else {
          const localLogos = localStorage.getItem("lumina_school_logos");
          if (localLogos) {
            setLogos(JSON.parse(localLogos));
          }
        }
      } catch (err) {
        console.warn("Failed to load logos from Firestore, fallback to localStorage:", err);
        const localLogos = localStorage.getItem("lumina_school_logos");
        if (localLogos) {
          setLogos(JSON.parse(localLogos));
        }
      }
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetData = async () => {
    if (
      !confirm(
        "⚠️ PERINGATAN: Ini akan MENGHAPUS SEMUA data dummy (siswa, kasus MTSS, asesmen, LXD, dsb) di semua unit (TK, SD, SMP). Tindakan ini tidak dapat dibatalkan. Lanjutkan?",
      )
    )
      return;

    setResetLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/admin/reset-dummy-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      let result;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error("[SuperAdmin] Reset error - Non-JSON response:", text);
        throw new Error(
          `Server returned non-JSON response (${response.status}).`,
        );
      }

      if (result.success) {
        // Clear kindergarten local data from localStorage which might contain dummy histories
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith("kg_") || key.startsWith("kindy_") || key.includes("kindergarten"))) {
            localStorage.removeItem(key);
          }
        }
        alert("Pembersihan data dummy berhasil di semua unit (termasuk TK/Kindy)! Silakan mulai mengisi data baru. ✨");
        fetchData();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleReconcileStudentRefs = async (dryRun: boolean) => {
    if (!dryRun) {
      const confirmFirst = window.confirm(
        "⚠️ PERINGATAN LIVE UPDATE!\n\nAnda akan melakukan sinkronisasi referensi ID siswa di database produksi secara langsung.\nTindakan ini akan memodifikasi field referensi di collections observations, published_kg_reports, users, dll.\n\nApakah Anda sungguh yakin ingin melanjutkan?"
      );
      if (!confirmFirst) return;
    }

    setIsReconciling(true);
    setReconciliationResult(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sesi login Anda tidak valid. Silakan masuk kembali.");

      const response = await fetch("/api/admin/reconcile-student-refs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          dryRun,
          unitId: reconcileUnit,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Gagal menghubungi backend server.");
      }

      setReconciliationResult(resData);
      if (dryRun) {
        alert("Simulasi Rekonsiliasi selesai! Silakan periksa hasil analisis di bawah sebelum melakukan Live Run. ✨");
      } else {
        alert("Selamat! Rekonsiliasi & Sinkronisasi DB Live berhasil diselesaikan! 🚀");
        fetchData();
      }
    } catch (err: any) {
      console.error("[ReconcileUI] Error:", err);
      alert("Proses Rekonsiliasi Gagal: " + err.message);
    } finally {
      setIsReconciling(false);
    }
  };

  const [isCleaningUpIds, setIsCleaningUpIds] = React.useState<boolean>(false);
  const [cleanupResult, setCleanupResult] = React.useState<any>(null);

  const handleCleanupInvalidOldIds = async (dryRun: boolean) => {
    if (!dryRun) {
      const confirmFirst = window.confirm(
        "⚠️ PERINGATAN LIVE CLEANUP!\n\nAnda akan membersihkan oldLuminaId yang korup (berisi data Gender 'Perempuan/Laki-laki') secara langsung.\nTindakan ini aman dan hanya akan mengosongkan NIS lama yang tidak valid.\n\nApakah Anda ingin melanjutkan?"
      );
      if (!confirmFirst) return;
    }

    setIsCleaningUpIds(true);
    setCleanupResult(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sesi login Anda tidak valid. Silakan masuk kembali.");

      const response = await fetch("/api/admin/cleanup-invalid-ids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ dryRun }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Gagal menghubungi backend server.");
      }

      setCleanupResult(resData);
      if (dryRun) {
        alert(`Analisis selesai! Menemukan ${resData.updatedCount} record terinfeksi. Silakan jalankan 'Terapkan Pembersihan' untuk membersihkannya.`);
      } else {
        alert(`Sukses! Berhasil membersihkan ${resData.updatedCount} record korup di database! 🎉`);
        fetchData();
      }
    } catch (err: any) {
      console.error("[CleanupUI] Error:", err);
      alert("Proses Pembersihan Gagal: " + err.message);
    } finally {
      setIsCleaningUpIds(false);
    }
  };

  // Identity Conflict scan states
  const [conflictUnit, setConflictUnit] = React.useState<string>("KINDERGARTEN");
  const [isScanningConflicts, setIsScanningConflicts] = React.useState<boolean>(false);
  const [conflictResult, setConflictResult] = React.useState<any>(null);
  const [conflictFilter, setConflictFilter] = React.useState<"ALL" | "HIGH" | "STANDARD" | "REVIEW">("ALL");
  const [expandedConflictId, setExpandedConflictId] = React.useState<string | null>(null);

  const handleScanIdentityConflicts = async () => {
    setIsScanningConflicts(true);
    setConflictResult(null);
    setExpandedConflictId(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sesi login Anda tidak valid. Silakan masuk kembali.");

      const response = await fetch("/api/admin/scan-identity-conflicts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          unitId: conflictUnit,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Gagal menghubungi backend server.");
      }

      setConflictResult(resData);
    } catch (err: any) {
      console.error("[ConflictUI] Error scanning:", err);
      alert("Proses Pemindaian Konflik Gagal: " + err.message);
    } finally {
      setIsScanningConflicts(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const handleImport = async () => {
    setImportLoading(true);
    setImportResult(null);
    setIsImportModalOpen(false);

    try {
      const sheetId =
        import.meta.env.VITE_GOOGLE_SHEET_ID_LUMINA || "GOOGLE_SHEET_ID_LUMINA";
      let sheetName = "";

      if (importMode === "STAFF")
        sheetName = import.meta.env.VITE_GOOGLE_SHEET_NAME_GURU || "GuruLumina";
      else if (importMode === "STUDENT") sheetName = "SiswaLumina";
      else if (importMode === "PARENT") sheetName = "OrtuLumina";

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");

      const response = await fetch("/api/admin/bulk-import-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ sheetId, sheetName, mode: importMode }),
      });

      let result;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error("[SuperAdmin] Non-JSON response:", text);
        throw new Error(
          `Server returned non-JSON response (${response.status}). Mohon hubungi admin.`,
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Server error");
      }

      setImportResult({
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors || [],
      });
      fetchData();
    } catch (error: any) {
      console.error("[SuperAdmin] Import error:", error);
      alert("Error: " + error.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleCreateOrUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const fullClassName = `${classFormData.grade} ${classFormData.className}`;
      const teacher = teachers.find(
        (t) => t.uid === classFormData.homeroomTeacherId,
      );

      const classData = {
        name: fullClassName,
        grade: classFormData.grade,
        unitId: classFormData.unitId,
        academicYear: classFormData.academicYear,
        homeroomTeacherId: classFormData.homeroomTeacherId || null,
        homeroomTeacherName: teacher?.displayName ? teacher.displayName.replace(/^\s*\(UNDANGAN\)\s*/i, "") : null,
        teacherSignatureUrl: classFormData.teacherSignatureUrl || null,
        status: "active" as const,
      };

      if (editingId && (activeTab === "classes" || activeTab === "CLASSES")) {
        await updateClass(editingId, classData);
      } else {
        await addClass(classData);
      }

      setIsClassModalOpen(false);
      setEditingId(null);
      setClassFormData({
        grade: "7",
        className: "",
        academicYear: "2026/2027",
        homeroomTeacherId: "",
        unitId: "JUNIOR_HIGH",
        teacherSignatureUrl: "",
      });
      fetchData();
      alert("Kelas berhasil disimpan!");
    } catch (error: any) {
      console.error("Class form error:", error);
      alert("Error: " + error.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingId) {
        // Fetch invite before updating to find previous values for student detection
        const originalInviteSnap = await getDoc(doc(db, "roleInvites", editingId));
        let previousLuminaId = "";
        let previousOldLuminaId = "";
        if (originalInviteSnap.exists()) {
          const origData = originalInviteSnap.data();
          previousLuminaId = origData.luminaId || "";
          previousOldLuminaId = origData.oldLuminaId || "";
        }

        // Auto-detect Old Lumina ID (NIS) rename
        let finalOldLuminaId = formData.oldLuminaId || previousOldLuminaId;
        if (formData.role === "STUDENT" && previousLuminaId && formData.luminaId && previousLuminaId !== formData.luminaId) {
          if (!finalOldLuminaId || finalOldLuminaId === formData.luminaId) {
            finalOldLuminaId = previousLuminaId;
          }
        }

        const activeEnrollment = studentEnrollments[0] || { academicYear: "2025/2026", classId: "" };
        const updatedFormData = {
          ...formData,
          oldLuminaId: finalOldLuminaId,
          academicYear: activeEnrollment.academicYear,
          classId: activeEnrollment.classId,
        };
        await updateInvite(editingId, updatedFormData);
        
        // Propagate the change to active student and enrollment records
        if (formData.role === "STUDENT" && formData.luminaId) {
          try {
            const batch = writeBatch(db);
            
            // Delete old student & enrollment records if NIS changed
            if (previousLuminaId && previousLuminaId !== formData.luminaId) {
              const oldStudentRef = doc(db, "students", previousLuminaId);
              batch.delete(oldStudentRef);
              
              // Fetch and delete all old enrollments under previous student ID
              const oldEnrollsQ = query(collection(db, "enrollments"), where("studentId", "==", previousLuminaId));
              const oldEnrollsSnap = await getDocs(oldEnrollsQ);
              oldEnrollsSnap.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });
            } else {
              // Delete enrollments that are no longer in our list
              const enrollsQ = query(collection(db, "enrollments"), where("studentId", "==", formData.luminaId));
              const enrollsSnap = await getDocs(enrollsQ);
              const existingEnrollIds = enrollsSnap.docs.map(docSnap => docSnap.id);
              const newEnrollIds = studentEnrollments.map(e => `${formData.luminaId}_${e.academicYear.replace(/\//g, "-")}`);
              
              existingEnrollIds.forEach(id => {
                if (!newEnrollIds.includes(id)) {
                  batch.delete(doc(db, "enrollments", id));
                }
              });
            }

            // Create/Update student record
            const studentRef = doc(db, "students", formData.luminaId);
            batch.set(studentRef, {
              id: formData.luminaId,
              luminaId: formData.luminaId,
              oldLuminaId: finalOldLuminaId,
              name: formData.name,
              email: formData.email,
              classId: activeEnrollment.classId,
              unitId: formData.unitId,
              academicYear: activeEnrollment.academicYear,
              nisn: formData.nisn || "",
              nickname: formData.nickname || "",
              gender: formData.gender || "",
              parentEmail: formData.parentEmail || "",
              status: "active",
              updatedAt: Date.now(),
              createdAt: Date.now()
            }, { merge: true });

            // Create/Update all enrollment records in our list
            studentEnrollments.forEach(e => {
              const enrollmentId = `${formData.luminaId}_${e.academicYear.replace(/\//g, "-")}`;
              const enrollmentRef = doc(db, "enrollments", enrollmentId);
              batch.set(enrollmentRef, {
                id: enrollmentId,
                studentId: formData.luminaId,
                classId: e.classId,
                unitId: formData.unitId,
                academicYear: e.academicYear,
                status: "active",
                updatedAt: Date.now()
              }, { merge: true });
            });

            await batch.commit();
            console.log("[SuperAdmin] Edited Student and Enrollment updated/propagated successfully.");
          } catch (studentErr) {
            console.error("[SuperAdmin] Failed to update/delete student/enrollment records on edit:", studentErr);
          }
        }

        // Propagate the change to the active user profile if it exists
        try {
          const qUser = query(collection(db, "users"), where("email", "==", formData.email.toLowerCase().trim()));
          const userSnap = await getDocs(qUser);
          if (!userSnap.empty) {
            const batch = writeBatch(db);
            userSnap.docs.forEach((docSnap) => {
              batch.update(docSnap.ref, {
                role: formData.role,
                unitId: formData.unitId,
                jobTitle: formData.jobTitle || null,
                luminaId: formData.luminaId || null,
                oldLuminaId: finalOldLuminaId || null,
                nickname: formData.nickname || null,
                linkedStudents: formData.linkedStudents || [],
                classId: activeEnrollment.classId || null,
                academicYear: activeEnrollment.academicYear || null,
                fatherName: formData.fatherName || null,
                motherName: formData.motherName || null,
              });
            });
            await batch.commit();
            console.log("[SuperAdmin] Updated active user(s) document to match edited invitation.");
          }
        } catch (uErr) {
          console.error("[SuperAdmin] Failed to propagate edit to active user(s):", uErr);
        }
      } else {
        const activeEnrollment = studentEnrollments[0] || { academicYear: "2025/2026", classId: "" };
        const updatedNewFormData = {
          ...formData,
          academicYear: activeEnrollment.academicYear,
          classId: activeEnrollment.classId,
        };
        const inviteId = await addInvite(updatedNewFormData);

        // If STUDENT, also ensure student and enrollment records exist
        if (formData.role === "STUDENT" && formData.luminaId && studentEnrollments.length > 0) {
          try {
            const batch = writeBatch(db);
            
            // 1. Ensure student record
            const studentRef = doc(db, "students", formData.luminaId);
            batch.set(studentRef, {
              id: formData.luminaId,
              luminaId: formData.luminaId,
              oldLuminaId: formData.oldLuminaId || "",
              name: formData.name,
              email: formData.email,
              classId: activeEnrollment.classId,
              unitId: formData.unitId,
              academicYear: activeEnrollment.academicYear,
              nisn: formData.nisn || "",
              nickname: formData.nickname || "",
              gender: formData.gender || "",
              parentEmail: formData.parentEmail || "",
              status: "active",
              updatedAt: Date.now(),
              createdAt: Date.now()
            }, { merge: true });

            // 2. Ensure all enrollment records
            studentEnrollments.forEach(e => {
              const enrollmentId = `${formData.luminaId}_${e.academicYear.replace(/\//g, "-")}`;
              const enrollmentRef = doc(db, "enrollments", enrollmentId);
              batch.set(enrollmentRef, {
                id: enrollmentId,
                studentId: formData.luminaId,
                classId: e.classId,
                unitId: formData.unitId,
                academicYear: e.academicYear,
                status: "active",
                updatedAt: Date.now()
              }, { merge: true });
            });

            await batch.commit();
            console.log("[SuperAdmin] Created/Updated Student & Enrollment for manual invite.");
          } catch (err) {
            console.error("[SuperAdmin] Failed to create student/enrollment records:", err);
          }
        }

        // Auto-create Parent Invite if Student has parent details
        if (
          formData.role === "STUDENT" &&
          formData.parentEmail &&
          (formData.fatherName || formData.motherName)
        ) {
          const parentName =
            formData.fatherName || formData.motherName || "Orang Tua";
          const parentInvite: Omit<RoleInvite, "createdAt"> = {
            name: parentName,
            email: formData.parentEmail,
            role: "PARENT",
            unitId: formData.unitId,
            status: "ready",
            linkedStudents: [formData.luminaId || `INVITE_${inviteId}`],
          };

          // Check if parent invite already exists for this email
          const existingInvites = await getAllInvites();
          const existingParent = existingInvites.find(
            (i) =>
              i.email.toLowerCase() === formData.parentEmail?.toLowerCase() &&
              i.role === "PARENT",
          );

          if (existingParent) {
            // Update existing parent's linked students
            const currentLinks = existingParent.linkedStudents || [];
            if (
              !currentLinks.includes(formData.luminaId || `INVITE_${inviteId}`)
            ) {
              await updateInvite(existingParent.id, {
                linkedStudents: [
                  ...currentLinks,
                  formData.luminaId || `INVITE_${inviteId}`,
                ],
              });
            }
          } else {
            // Add new parent invite
            await addInvite(parentInvite);
          }
        }
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({
        name: "",
        email: "",
        role: "TEACHER",
        unitId: "JUNIOR_HIGH",
        jobTitle: "",
        status: "ready",
        luminaId: "",
        oldLuminaId: "",
        nisn: "",
        nickname: "",
        gender: "",
        parentEmail: "",
        fatherName: "",
        motherName: "",
        linkedStudents: [],
      });
      fetchData();
    } catch (error) {
      console.error("Form error:", error);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus undangan ini?")) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sesi login Anda tidak valid. Silakan masuk kembali.");

      const response = await fetch("/api/admin/delete-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ inviteIds: [id] }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Gagal menghubungi backend server.");
      }

      fetchData();
    } catch (error: any) {
      console.error("Delete error:", error);
      alert("Gagal menghapus: " + error.message);
    }
  };



  const handleActivate = async (uid: string, email: string) => {
    const invite = invites.find(
      (i) =>
        i.email.toLowerCase() === email.toLowerCase() && i.status === "ready",
    );
    try {
      await activateUser(uid, invite);
      if (invite) {
        await updateInvite(invite.id, { status: "used" });
      }
      fetchData();
      alert("Akun berhasil diaktifkan!");
    } catch (error) {
      console.error("Activation error:", error);
    }
  };

  const handleDeleteClass = (id: string) => {
    setClassToDeleteId(id);
    setIsDeleteClassConfirmOpen(true);
  };

  const confirmDeleteClass = async () => {
    if (!classToDeleteId) return;
    try {
      await deleteClass(classToDeleteId);
      setIsDeleteClassConfirmOpen(false);
      setClassToDeleteId(null);
      fetchData();
      alert("Kelas berhasil dihapus!");
    } catch (error: any) {
      alert("Gagal menghapus kelas: " + error.message);
    }
  };

  const unitStats = React.useMemo(() => {
    const units: UnitType[] = ["KINDERGARTEN", "ELEMENTARY", "JUNIOR_HIGH"];
    return units.reduce(
      (acc, unit) => {
        acc[unit] = {
          students: invites.filter(
            (i) => i.unitId === unit && i.role === "STUDENT",
          ).length,
          staff: invites.filter(
            (i) =>
              i.unitId === unit &&
              [
                "TEACHER",
                "STAFF",
                "BK_MENTOR",
                "HEAD_UNIT",
                "HEAD_JUNIOR",
              ].includes(i.role),
          ).length,
          classes: classes.filter((c) => c.unitId === unit).length,
          pending: pendingUsers.filter((u) => u.unitId === unit).length,
        };
        return acc;
      },
      {} as Record<string, any>,
    );
  }, [invites, classes, pendingUsers]);

  const studentIdToUnitId = React.useMemo(() => {
    const map: Record<string, string> = {};
    invites.forEach((i) => {
      if (i.role === "STUDENT" && i.luminaId) {
        map[i.luminaId] = i.unitId;
      }
    });
    return map;
  }, [invites]);

  const studentIdToClassId = React.useMemo(() => {
    const map: Record<string, string> = {};
    invites.forEach((i) => {
      if (i.role === "STUDENT" && i.luminaId && i.classId) {
        map[i.luminaId] = i.classId;
      }
    });
    return map;
  }, [invites]);

  const filteredInvites = invites.filter((i) => {
    if (!i) return false;
    const searchLower = safeLower(searchTerm);
    const matchesSearch =
      safeLower(i.email).includes(searchLower) ||
      safeLower(i.name).includes(searchLower) ||
      safeLower(i.luminaId).includes(searchLower);

    const matchesUnit = selectedUnit === "ALL" || 
      i.unitId === selectedUnit || 
      (i.role === "PARENT" && Array.isArray(i.linkedStudents) && i.linkedStudents.some(sid => studentIdToUnitId[sid] === selectedUnit));

    let matchesClass = true;
    if (activeMenu === "user-undangan" && (activeTab === "STUDENT" || activeTab === "PARENT") && selectedClassFilter !== "ALL") {
      if (selectedClassFilter === "EMPTY") {
        if (i.role === "STUDENT") {
          matchesClass = !i.classId;
        } else if (i.role === "PARENT") {
          matchesClass = !i.linkedStudents || i.linkedStudents.length === 0 || i.linkedStudents.every(sid => !studentIdToClassId[sid]);
        }
      } else {
        if (i.role === "STUDENT") {
          matchesClass = i.classId === selectedClassFilter || 
                         classes.find(c => c.id === selectedClassFilter)?.name === i.classId ||
                         classes.find(c => c.name === selectedClassFilter)?.id === i.classId;
        } else if (i.role === "PARENT") {
          matchesClass = Array.isArray(i.linkedStudents) && i.linkedStudents.some(sid => {
            const scId = studentIdToClassId[sid];
            return scId === selectedClassFilter ||
                   classes.find(c => c.id === selectedClassFilter)?.name === scId ||
                   classes.find(c => c.name === selectedClassFilter)?.id === scId;
          });
        }
      }
    }

    if (activeTab === "STAFF") {
      return (
        matchesSearch &&
        matchesUnit &&
        matchesClass && (
        [
          "SUPER_ADMIN",
          "HEAD_UNIT",
          "HEAD_JUNIOR",
          "TEACHER",
          "BK_MENTOR",
          "STAFF",
          "PROFILE_TEACHER",
        ].includes(i.role) || [
          "SUPER_ADMIN",
          "HEAD_UNIT",
          "HEAD_JUNIOR",
          "TEACHER",
          "BK_MENTOR",
          "STAFF",
        ].includes(i.role))
      );
    }
    if (activeTab === "STUDENT") {
      return matchesSearch && matchesUnit && matchesClass && i.role === "STUDENT";
    }
    if (activeTab === "PARENT") {
      return matchesSearch && matchesUnit && matchesClass && i.role === "PARENT";
    }
    return matchesSearch && matchesUnit && matchesClass;
  });

  const classOptions = React.useMemo(() => {
    return classes.filter(c => selectedUnit === "ALL" || c.unitId === selectedUnit);
  }, [classes, selectedUnit]);

  const studentIdToName = React.useMemo(() => {
    const map: Record<string, string> = {};
    invites.forEach((i) => {
      if (i.role === "STUDENT" && i.luminaId) {
        map[i.luminaId] = i.name;
      }
    });
    return map;
  }, [invites]);

  const sortedInvites = React.useMemo(() => {
    const sortableItems = [...filteredInvites];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue: any = (a as any)[sortConfig.key] || "";
        let bValue: any = (b as any)[sortConfig.key] || "";

        // Custom sorting for linkedStudents
        if (sortConfig.key === "linkedStudents") {
          const aId = a.linkedStudents?.[0] || "";
          const bId = b.linkedStudents?.[0] || "";
          aValue = studentIdToName[aId] || aId;
          bValue = studentIdToName[bId] || bId;
        }

        const aLower = safeLower(aValue);
        const bLower = safeLower(bValue);

        if (aLower < bLower) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aLower > bLower) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredInvites, sortConfig, studentIdToName]);

  const isAllSelected = sortedInvites.length > 0 && sortedInvites.every(i => selectedInviteIds.includes(i.id));
  
  const handleSelectAll = () => {
    if (isAllSelected) {
      const sortedIds = sortedInvites.map(i => i.id);
      setSelectedInviteIds(prev => prev.filter(id => !sortedIds.includes(id)));
    } else {
      const sortedIds = sortedInvites.map(i => i.id);
      setSelectedInviteIds(prev => Array.from(new Set([...prev, ...sortedIds])));
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedInviteIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedInviteIds.length === 0) return;
    const confirmDelete = window.confirm(
      `⚠️ Apakah Anda yakin ingin menghapus ${selectedInviteIds.length} undangan terpilih?`
    );
    if (!confirmDelete) return;

    setIsBulkDeleting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sesi login Anda tidak valid. Silakan masuk kembali.");

      const response = await fetch("/api/admin/delete-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ inviteIds: selectedInviteIds }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Gagal menghubungi backend server.");
      }

      alert(`Berhasil menghapus ${selectedInviteIds.length} undangan!`);
      setSelectedInviteIds([]);
      fetchData();
    } catch (error: any) {
      console.error("Bulk delete error:", error);
      alert("Gagal menghapus beberapa undangan: " + error.message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleDeleteAllFiltered = async () => {
    if (sortedInvites.length === 0) return;
    const confirmDelete = window.confirm(
      `⚠️ PERINGATAN BERSKALA BESAR!\n\nApakah Anda yakin ingin menghapus SEMUA (${sortedInvites.length}) undangan yang tampil saat ini?`
    );
    if (!confirmDelete) return;

    setIsBulkDeleting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sesi login Anda tidak valid. Silakan masuk kembali.");

      const idsToDelete = sortedInvites.map(i => i.id);
      const response = await fetch("/api/admin/delete-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ inviteIds: idsToDelete }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || "Gagal menghubungi backend server.");
      }

      alert(`Berhasil menghapus semua (${idsToDelete.length}) undangan!`);
      setSelectedInviteIds([]);
      fetchData();
    } catch (error: any) {
      console.error("Delete all filtered error:", error);
      alert("Gagal menghapus semua undangan: " + error.message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const sortedClasses = React.useMemo(() => {
    const filtered = classes.filter((c) => {
      const searchLower = safeLower(searchTerm);
      const matchesSearch =
        safeLower(c.name).includes(searchLower) ||
        safeLower(c.academicYear).includes(searchLower) ||
        safeLower(c.homeroomTeacherName).includes(searchLower);
      const matchesUnit = selectedUnit === "ALL" || c.unitId === selectedUnit;
      return matchesSearch && matchesUnit;
    });

    return filtered.sort((a, b) => {
      const aValue = a[classSortConfig.key] || "";
      const bValue = b[classSortConfig.key] || "";
      const aLower = safeLower(aValue);
      const bLower = safeLower(bValue);
      if (aLower < bLower) {
        return classSortConfig.direction === "asc" ? -1 : 1;
      }
      if (aLower > bLower) {
        return classSortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [classes, searchTerm, selectedUnit, classSortConfig]);

  const filteredPending = pendingUsers.filter((u) => {
    if (!u) return false;
    const searchLower = safeLower(searchTerm);
    const matchesSearch =
      safeLower(u.displayName).includes(searchLower) ||
      safeLower(u.email).includes(searchLower);
    const matchesUnit = selectedUnit === "ALL" || u.unitId === selectedUnit;
    return matchesSearch && matchesUnit;
  });

  const counts = {
    STAFF: invites.filter(
      (i) =>
        (selectedUnit === "ALL" || i.unitId === selectedUnit) &&
        [
          "TEACHER",
          "STAFF",
          "BK_MENTOR",
          "HEAD_UNIT",
          "HEAD_JUNIOR",
          "SUPER_ADMIN",
        ].includes(i.role),
    ).length,
    STUDENT: invites.filter(
      (i) =>
        (selectedUnit === "ALL" || i.unitId === selectedUnit) &&
        i.role === "STUDENT",
    ).length,
    PARENT: invites.filter(
      (i) =>
        i.role === "PARENT" &&
        (selectedUnit === "ALL" ||
          i.unitId === selectedUnit ||
          (Array.isArray(i.linkedStudents) &&
            i.linkedStudents.some((sid) => studentIdToUnitId[sid] === selectedUnit))),
    ).length,
    CLASSES: classes.filter(
      (c) => selectedUnit === "ALL" || c.unitId === selectedUnit,
    ).length,
    PENDING: pendingUsers.filter(
      (u) => selectedUnit === "ALL" || u.unitId === selectedUnit,
    ).length,
    PROMPTS: promptTemplates.filter(
      (p) => selectedUnit === "ALL" || p.unit === "ALL" || p.unit === selectedUnit,
    ).length,
    KNOWLEDGE_BASE: knowledgeBase.length,
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <button
          onClick={() => {
            setActiveMenu("overview");
            setIsMobileSidebarOpen(false);
          }}
          className={cn(
            "w-full px-4 py-3 rounded-xl text-xs font-bold transition-all text-left flex items-center gap-3",
            activeMenu === "overview"
              ? "bg-blue-600 text-white font-black shadow-lg shadow-blue-900/30"
              : "hover:bg-slate-900 text-slate-400 hover:text-slate-250"
          )}
        >
          <LayoutDashboard size={16} />
          Overview
        </button>
      </div>

      {/* Group: USER */}
      <div className="space-y-1">
        <div 
          onClick={() => setCollapsedGroups(prev => ({ ...prev, USER: !prev.USER }))}
          className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-1 cursor-pointer hover:text-slate-350 select-none"
        >
          <div className="flex items-center gap-2">
            <Users size={12} />
            <span>USER</span>
          </div>
          <ChevronDown 
            size={12} 
            className={cn("transition-transform duration-200", collapsedGroups.USER && "rotate-180")} 
          />
        </div>
        
        {!collapsedGroups.USER && (
          <div className="space-y-0.5 pl-2 mt-1">
            <button
              onClick={() => {
                setActiveMenu("user-undangan");
                if (activeTab === "PENDING" || activeTab === "CLASSES" || activeTab === "PROMPTS" || activeTab === "KNOWLEDGE_BASE" || activeTab === "LOGO") {
                  setActiveTab("STAFF");
                }
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "user-undangan"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Undangan</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-900 text-slate-500 border border-slate-850">
                {counts.STAFF + counts.STUDENT + counts.PARENT}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveMenu("user-pending");
                setActiveTab("PENDING");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "user-pending"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>Pending</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-950 text-red-400">
                {counts.PENDING}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Group: KELAS */}
      <div className="space-y-1">
        <div 
          onClick={() => setCollapsedGroups(prev => ({ ...prev, KELAS: !prev.KELAS }))}
          className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-1 cursor-pointer hover:text-slate-350 select-none animate-none"
        >
          <div className="flex items-center gap-2">
            <BookOpen size={12} />
            <span>KELAS</span>
          </div>
          <ChevronDown 
            size={12} 
            className={cn("transition-transform duration-200", collapsedGroups.KELAS && "rotate-180")} 
          />
        </div>
        
        {!collapsedGroups.KELAS && (
          <div className="space-y-0.5 pl-2 mt-1">
            <button
              onClick={() => {
                setActiveMenu("kelas");
                setActiveTab("CLASSES");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "kelas"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Manajemen</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-900 text-slate-500 border border-slate-850">
                {counts.CLASSES}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Group: AI & KONTEN */}
      <div className="space-y-1">
        <div 
          onClick={() => setCollapsedGroups(prev => ({ ...prev, AI: !prev.AI }))}
          className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-1 cursor-pointer hover:text-slate-350 select-none animate-none"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={12} />
            <span>AI & KONTEN</span>
          </div>
          <ChevronDown 
            size={12} 
            className={cn("transition-transform duration-200", collapsedGroups.AI && "rotate-180")} 
          />
        </div>
        
        {!collapsedGroups.AI && (
          <div className="space-y-0.5 pl-2 mt-1">
            <button
              onClick={() => {
                setActiveMenu("ai-prompts");
                setActiveTab("PROMPTS");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "ai-prompts"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Prompts</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-900 text-slate-500 border border-slate-850">
                {counts.PROMPTS}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveMenu("ai-knowledge");
                setActiveTab("KNOWLEDGE_BASE");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "ai-knowledge"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Knowledge</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-900 text-slate-500 border border-slate-850">
                {counts.KNOWLEDGE_BASE}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveMenu("ai-logo");
                setActiveTab("LOGO");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "ai-logo"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Logo</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Group: IMPORT */}
      <div className="space-y-1">
        <div 
          onClick={() => setCollapsedGroups(prev => ({ ...prev, IMPORT: !prev.IMPORT }))}
          className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-1 cursor-pointer hover:text-slate-350 select-none animate-none"
        >
          <div className="flex items-center gap-2">
            <PlusSquare size={12} />
            <span>IMPORT</span>
          </div>
          <ChevronDown 
            size={12} 
            className={cn("transition-transform duration-200", collapsedGroups.IMPORT && "rotate-180")} 
          />
        </div>
        
        {!collapsedGroups.IMPORT && (
          <div className="space-y-0.5 pl-2 mt-1">
            <button
              onClick={() => {
                setActiveMenu("import-massal");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "import-massal"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Impor Massal</span>
              </div>
            </button>
            <button
              onClick={() => {
                setActiveMenu("import-sync");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "import-sync"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Sync Data</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Group: SISTEM */}
      <div className="space-y-1">
        <div 
          onClick={() => setCollapsedGroups(prev => ({ ...prev, SISTEM: !prev.SISTEM }))}
          className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-1 cursor-pointer hover:text-slate-355 select-none animate-none"
        >
          <div className="flex items-center gap-2">
            <Lock size={12} />
            <span>SISTEM</span>
          </div>
          <ChevronDown 
            size={12} 
            className={cn("transition-transform duration-200", collapsedGroups.SISTEM && "rotate-180")} 
          />
        </div>
        
        {!collapsedGroups.SISTEM && (
          <div className="space-y-0.5 pl-2 mt-1">
            <button
              onClick={() => {
                setActiveMenu("sistem-reset");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "sistem-reset"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Reset Data</span>
              </div>
            </button>
            <button
              onClick={() => {
                setActiveMenu("academic-year");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "academic-year"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                <span>Konfigurasi Tahun Ajaran</span>
              </div>
            </button>
            <button
              onClick={() => {
                setActiveMenu("reconcile-siswa");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "reconcile-siswa"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <span>Rekonsiliasi ID Siswa</span>
              </div>
            </button>
            <button
              onClick={() => {
                setActiveMenu("conflict-siswa");
                setIsMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-left flex items-center justify-between transition-all",
                activeMenu === "conflict-siswa"
                  ? "bg-slate-900 text-white font-bold border border-slate-800"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
              )}
            >
              <div className="flex items-center gap-2.5 flex-1 select-none">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>Deteksi Konflik Identitas</span>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Admin Header Banner */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-700 md:hidden transition-all duration-150"
          >
            <Menu size={20} />
          </button>
          <div className="p-2 bg-blue-600 rounded-xl text-white shadow-md">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-black text-gray-900 tracking-tight italic uppercase flex items-center gap-2">
              Lumina <span className="text-blue-600">Admin</span>
              <span className="hidden sm:inline bg-blue-50 text-blue-605 px-2 py-0.5 rounded-full text-[8.5px] font-black not-italic uppercase ml-2 border border-blue-100">
                Command Center
              </span>
            </h1>
            <p className="hidden xs:block text-[8px] md:text-[9.5px] font-black text-gray-400 uppercase tracking-widest leading-none">
              Centralised Authority & Access Management
            </p>
          </div>
        </div>

        {/* Global Unit Selector */}
        <div className="flex items-center p-1 bg-gray-50 border border-gray-200 rounded-xl">
          <button
            onClick={() => setSelectedUnit("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
              selectedUnit === "ALL"
                ? "bg-white text-blue-600 shadow-sm font-black"
                : "text-gray-450 hover:text-gray-700",
            )}
          >
            Semua Unit
          </button>
          {["KINDERGARTEN", "ELEMENTARY", "JUNIOR_HIGH"].map((uid) => (
            <button
              key={uid}
              onClick={() => setSelectedUnit(uid as any)}
              className={cn(
                "hidden sm:inline px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                selectedUnit === uid
                  ? "bg-white text-blue-605 shadow-sm font-black"
                  : "text-gray-450 hover:text-gray-700",
              )}
            >
              {uid.replace("_", " ")}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row relative">
        {/* MOBILE DRAWER SIDEBAR */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div 
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <motion.aside 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              className="relative w-64 bg-slate-950 text-slate-300 flex flex-col h-full p-4 space-y-6 z-10 border-r border-slate-800"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Navigasi Admin</span>
                <button onClick={() => setIsMobileSidebarOpen(false)} className="text-slate-500 hover:text-white font-extrabold p-1">✕</button>
              </div>
              {renderSidebarContent()}
            </motion.aside>
          </div>
        )}

        {/* DESKTOP SIDEBAR KIRI */}
        <aside className="hidden md:flex w-[230px] bg-slate-950 text-slate-300 flex-col border-r border-slate-800 shrink-0 select-none sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto custom-scrollbar p-4 space-y-6">
          {renderSidebarContent()}
        </aside>

        {/* KONTEN UTAMA */}
        <main className="flex-1 p-6 md:p-8 bg-slate-50 overflow-y-auto w-full min-h-[calc(100vh-73px)]">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* VIEWS: OVERVIEW */}
            {activeMenu === "overview" && (
              <div className="space-y-8 animate-in fade-in duration-200">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
                    Admin Command Dashboard
                  </h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                    Pusat Konfigurasi & Statistik Unit Lazuardi GCS
                  </p>
                </div>
                          {/* Unit Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    {
                      id: "KINDERGARTEN",
                      name: "Kindergarten",
                      icon: <Smile className="text-orange-500" />,
                      color: "orange",
                    },
                    {
                      id: "ELEMENTARY",
                      name: "Elementary",
                      icon: <Footprints className="text-blue-500" />,
                      color: "blue",
                    },
                    {
                      id: "JUNIOR_HIGH",
                      name: "Junior High",
                      icon: <Brain className="text-purple-500" />,
                      color: "purple",
                    },
                  ].map((unit) => (
                    <motion.button
                      key={unit.id}
                      whileHover={{ y: -5 }}
                      onClick={() => setSelectedUnit(unit.id as any)}
                      className={cn(
                        "text-left p-8 rounded-[2.5rem] border-2 transition-all relative overflow-hidden group w-full cursor-pointer",
                        selectedUnit === unit.id
                          ? "bg-white border-blue-500 shadow-2xl shadow-blue-100"
                          : "bg-white border-gray-50 hover:border-gray-200 shadow-sm",
                      )}
                    >
                      <div className="relative z-10 space-y-4">
                        <div className="flex items-center justify-between">
                          <div
                            className={cn(
                              "p-4 rounded-[1.5rem]",
                              selectedUnit === unit.id
                                ? "bg-blue-50 text-blue-600"
                                : "bg-gray-50 text-gray-400",
                            )}
                          >
                            {unit.icon}
                          </div>
                          {unitStats[unit.id as keyof typeof unitStats]?.pending > 0 && (
                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[9px] font-black uppercase tracking-widest">
                              {unitStats[unit.id as keyof typeof unitStats].pending} Pending
                            </span>
                          )}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900 tracking-tight italic uppercase">
                            {unit.name}
                          </h3>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="space-y-0.5">
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                Students
                              </p>
                              <p className="text-lg font-black text-gray-700">
                                {unitStats[unit.id as keyof typeof unitStats]?.students || 0}
                              </p>
                            </div>
                            <div className="w-px h-8 bg-gray-100" />
                            <div className="space-y-0.5">
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                Staff
                              </p>
                              <p className="text-lg font-black text-gray-700">
                                {unitStats[unit.id as keyof typeof unitStats]?.staff || 0}
                              </p>
                            </div>
                            <div className="w-px h-8 bg-gray-100" />
                            <div className="space-y-0.5">
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                Classes
                              </p>
                              <p className="text-lg font-black text-gray-700">
                                {unitStats[unit.id as keyof typeof unitStats]?.classes || 0}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 flex items-center gap-2 text-blue-600 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            Kelola Unit
                          </span>
                          <ChevronRight size={14} />
                        </div>
                      </div>
                      {selectedUnit === unit.id && (
                        <div className="absolute top-0 right-0 p-4">
                          <CheckCircle2 className="text-blue-500" size={20} />
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* General Welcome Card */}
                <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                  <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                    Selamat Datang di Command Center Lumina Admin
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-4xl">
                    Silakan gunakan navigasi sidebar sebelah kiri untuk mengelola berbagai fitur administrasi. Filter unit di bagian atas header berlaku secara global untuk memudahkan pencarian data pada unit (TK, SD, SMP) tertentu secara dinamis.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                    <div onClick={() => { setActiveMenu("user-undangan"); setActiveTab("STAFF"); }} className="p-4 bg-slate-50 hover:bg-blue-50/40 rounded-2xl border border-gray-100 cursor-pointer transition-all">
                      <p className="text-xs font-black text-slate-800">Undangan Staff</p>
                      <p className="text-[10px] text-gray-450 mt-1 uppercase">Kelola {counts.STAFF} Staff</p>
                    </div>
                    <div onClick={() => { setActiveMenu("user-undangan"); setActiveTab("STUDENT"); }} className="p-4 bg-slate-50 hover:bg-blue-50/40 rounded-2xl border border-gray-100 cursor-pointer transition-all">
                      <p className="text-xs font-black text-slate-800">Undangan Siswa</p>
                      <p className="text-[10px] text-gray-455 mt-1 uppercase">Kelola {counts.STUDENT} Siswa</p>
                    </div>
                    <div onClick={() => { setActiveMenu("ai-prompts"); }} className="p-4 bg-slate-50 hover:bg-blue-50/40 rounded-2xl border border-gray-100 cursor-pointer transition-all">
                      <p className="text-xs font-black text-slate-800">AI Prompts</p>
                      <p className="text-[10px] text-gray-455 mt-1 uppercase">Evaluasi {counts.PROMPTS} Prompts</p>
                    </div>
                    <div onClick={() => { setActiveMenu("import-massal"); }} className="p-4 bg-slate-50 hover:bg-blue-55/40 rounded-2xl border border-gray-100 cursor-pointer transition-all">
                      <p className="text-xs font-black text-slate-800">Impor Massal</p>
                      <p className="text-[10px] text-gray-455 mt-1 uppercase">Impor Spreadsheet</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* VIEWS: DATABASE LISTS (STANDARD RENDER IN SIDEBAR MENU) */}
            {["user-undangan", "user-pending", "kelas", "ai-prompts", "ai-knowledge", "ai-logo"].includes(activeMenu) && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Dynamically adjust title based on activeMenu */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <Users size={20} className="text-indigo-600" />
                      {activeMenu === "user-undangan" && "Manajemen Undangan"}
                      {activeMenu === "user-pending" && "Pending Aktivasi Akun"}
                      {activeMenu === "kelas" && "Manajemen Kelas"}
                      {activeMenu === "ai-prompts" && "Templat Prompt AI"}
                      {activeMenu === "ai-knowledge" && "Knowledge Base Sync"}
                      {activeMenu === "ai-logo" && "Sistem Unggah Logo"}
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mt-1">
                      {activeMenu === "user-undangan" && `Pusat Log Undangan Aktif (${counts[activeTab as keyof typeof counts] || 0} ${activeTab.toLowerCase()})`}
                      {activeMenu === "user-pending" && "Daftar User Pendaftar Baru yang Memerlukan Tindakan"}
                      {activeMenu === "kelas" && "Atur Kelas, Angkatan & Guru Lazuardi GCS"}
                      {activeMenu === "ai-prompts" && "Ubah & Atur Instruksi Agen Gemini Lazuardi-AI"}
                      {activeMenu === "ai-knowledge" && "Sinkronkan & Indeks Google Drive Folder ID"}
                      {activeMenu === "ai-logo" && "Dual Logos Per-Education Unit TK/SD/SMP"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeMenu === "user-undangan" && (
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setFormData({
                            name: "",
                            email: "",
                            role: "TEACHER",
                            unitId: selectedUnit === "ALL" ? "JUNIOR_HIGH" : selectedUnit,
                            jobTitle: "",
                            status: "ready",
                            luminaId: "",
                            oldLuminaId: "",
                            classId: "",
                            academicYear: "2025/2026",
                            linkedStudents: [],
                          });
                          setStudentEnrollments([
                            {
                              academicYear: "2025/2026",
                              classId: "",
                            }
                          ]);
                          setIsModalOpen(true);
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold tracking-wide flex items-center gap-1.5 hover:bg-indigo-700 transition-all cursor-pointer shadow-sm shadow-indigo-100"
                      >
                        <Plus size={14} />
                        Undang Manual
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub Tab Navigation for Undangan (Active Tab inside user-undangan) */}
                <div className="space-y-4">
                  {activeMenu === "user-undangan" && (
                    <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
                        {[
                          { id: "STAFF" as const, icon: <Users size={14} />, label: "Staff" },
                          { id: "STUDENT" as const, icon: <GraduationCap size={14} />, label: "Siswa" },
                          { id: "PARENT" as const, icon: <Users size={14} />, label: "Ortu" },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => {
                              setActiveTab(tab.id);
                            }}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer",
                              activeTab === tab.id
                                ? "bg-slate-900 text-white shadow-md shadow-slate-200"
                                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
                            )}
                          >
                            {tab.icon}
                            {tab.label}
                            <span
                              className={cn(
                                "ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold",
                                activeTab === tab.id
                                  ? "bg-white/20 text-white"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {counts[tab.id as keyof typeof counts]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* View Content layout wrappers */}
                  <div className="space-y-4">
          {/* Unified Search & Filter Control Group */}
          <div className="bg-slate-50/50 p-2.5 rounded-2xl border border-slate-100/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Cari nama, email, atau NIS di unit ${selectedUnit === "ALL" ? "semua" : selectedUnit.toLowerCase()}...`}
                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none"
              />
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {activeMenu === "user-undangan" && (activeTab === "STUDENT" || activeTab === "PARENT") && (
                <div className="relative" id="class-filter-select-wrapper">
                  <select
                    value={selectedClassFilter}
                    onChange={(e) => setSelectedClassFilter(e.target.value)}
                    className="appearance-none bg-white border border-slate-200/80 rounded-xl pl-4 pr-10 py-2.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all cursor-pointer outline-none min-w-[150px] h-[38px]"
                  >
                    <option value="ALL">Semua Kelas</option>
                    <option value="EMPTY">Belum Ada Kelas</option>
                    {classOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        Kelas {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                    <Filter size={12} />
                  </div>
                </div>
              )}

              {activeTab === "CLASSES" && (
                <button
                  onClick={() => {
                    setEditingId(null);
                    const defaultUnit = selectedUnit === "ALL" ? "KINDERGARTEN" : selectedUnit;
                    const defaultGrade = getGradeOptions(defaultUnit)[0];
                    setClassFormData({
                      grade: defaultGrade,
                      className: "",
                      academicYear: "2026/2027",
                      homeroomTeacherId: "",
                      unitId: defaultUnit,
                      teacherSignatureUrl: "",
                    });
                    setIsClassModalOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold tracking-wide flex items-center gap-1.5 transition-all shadow-sm cursor-pointer h-[38px]"
                >
                  <Plus size={14} />
                  Tambah Kelas
                </button>
              )}

              {activeTab === "PROMPTS" && (
                <button
                  onClick={() => handleOpenPromptModal(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold tracking-wide flex items-center gap-1.5 transition-all shadow-sm cursor-pointer h-[38px]"
                >
                  <Plus size={14} />
                  Tambah Prompt
                </button>
              )}

              {activeTab === "KNOWLEDGE_BASE" && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={folderIdText}
                    onChange={(e) => setFolderIdText(e.target.value)}
                    placeholder="Folder Google Drive ID..."
                    className="px-3 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none w-56 h-[38px]"
                  />
                  <button
                    onClick={handleSyncKnowledge}
                    disabled={syncKnowledgeLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer h-[38px]"
                  >
                    {syncKnowledgeLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={14} />
                        Sync GDrive
                      </>
                    )}
                  </button>
                </div>
              )}
              
              <button className="p-2.5 bg-white border border-slate-200/80 rounded-xl text-slate-400 hover:text-slate-600 transition-all shadow-sm h-[38px] w-[38px] flex items-center justify-center">
                <Filter size={15} />
              </button>
            </div>
          </div>

          {/* Selection Actions Toolbar */}
          {activeMenu === "user-undangan" && ["STAFF", "STUDENT", "PARENT"].includes(activeTab) && (
            <div className={cn(
              "border rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300",
              selectedInviteIds.length > 0 
                ? "bg-indigo-50/70 border-indigo-100 shadow-sm shadow-indigo-50" 
                : "bg-slate-50/50 border-slate-100/60"
            )}>
              <div className="flex items-center gap-3 select-none">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                  selectedInviteIds.length > 0 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "bg-slate-200 text-slate-500"
                )}>
                  <Users size={14} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Manajemen Aksi Massal</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                    {selectedInviteIds.length} dari {sortedInvites.length} record dipilih
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedInviteIds.length === 0 || isBulkDeleting}
                  className="px-3.5 py-1.5 h-8 bg-red-655 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-[10px] font-bold tracking-wider cursor-pointer disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-sm"
                  id="btn-delete-selected"
                >
                  {isBulkDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  HAPUS PILIHAN ({selectedInviteIds.length})
                </button>

                <button
                  onClick={handleDeleteAllFiltered}
                  disabled={sortedInvites.length === 0 || isBulkDeleting}
                  className="px-3.5 py-1.5 h-8 bg-slate-800 hover:bg-red-600 disabled:opacity-40 text-white rounded-lg text-[10px] font-bold tracking-wider cursor-pointer disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-sm"
                  id="btn-delete-all-filtered"
                >
                  {isBulkDeleting ? <Loader2 size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                  HAPUS SEMUA ({sortedInvites.length})
                </button>

                {selectedInviteIds.length > 0 && (
                  <button
                    onClick={() => setSelectedInviteIds([])}
                    className="px-3 py-1.5 h-8 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 rounded-lg text-[10px] font-bold tracking-wider cursor-pointer transition-all"
                    id="btn-cancel-selection"
                  >
                    Batal
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Table/List Area */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto relative min-h-[400px]">
            {loading && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
                <Loader2 size={40} className="text-blue-500 animate-spin" />
              </div>
            )}

            {activeTab === "CLASSES" ? (
              <table className="w-full text-left">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th 
                      onClick={() => handleClassSort("name")}
                      className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-2">
                        Unit / Nama Kelas
                        <SortIcon column="name" currentConfig={classSortConfig} />
                      </div>
                    </th>
                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-center">
                      Siswa
                    </th>
                    <th 
                      onClick={() => handleClassSort("grade")}
                      className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-center cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center justify-center gap-2">
                        Grade
                        <SortIcon column="grade" currentConfig={classSortConfig} />
                      </div>
                    </th>
                    <th 
                      onClick={() => handleClassSort("academicYear")}
                      className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-center cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center justify-center gap-2">
                        TA
                        <SortIcon column="academicYear" currentConfig={classSortConfig} />
                      </div>
                    </th>
                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                      Wali Kelas
                    </th>
                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedClasses.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-10 py-20 text-center text-gray-400 italic"
                      >
                        No classes found in this unit.
                      </td>
                    </tr>
                  ) : (
                    sortedClasses.map((cls) => {
                      const classStudents = invites
                        .filter((i) => i.role === "STUDENT" && (i.classId === cls.id || i.classId === cls.name))
                        .sort((a, b) => {
                          const aName = a.name.toLowerCase();
                          const bName = b.name.toLowerCase();
                          if (expandedStudentsSortDir === "asc") {
                            return aName < bName ? -1 : aName > bName ? 1 : 0;
                          } else {
                            return aName > bName ? -1 : aName < bName ? 1 : 0;
                          }
                        });
                      const isExpanded = expandedClassId === cls.id;
                      
                      return (
                        <React.Fragment key={cls.id}>
                          <tr
                            className={cn(
                              "group hover:bg-gray-50/50 transition-all",
                              isExpanded && "bg-blue-50/20"
                            )}
                          >
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-tight italic">
                                    {cls.name}
                                  </span>
                                  <span className="text-[9px] font-bold text-gray-300 uppercase">
                                    {cls.unitId}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-10 py-6 text-center">
                              <button
                                onClick={() => setExpandedClassId(isExpanded ? null : cls.id)}
                                className={cn(
                                  "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center gap-2 transition-all",
                                  isExpanded 
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                                    : "bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600"
                                )}
                              >
                                {isExpanded ? <EyeOff size={12} /> : <Eye size={12} />}
                                {classStudents.length} Siswa
                              </button>
                            </td>
                            <td className="px-10 py-6 text-center">
                              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-[9px] font-black uppercase">
                                {cls.grade}
                              </span>
                            </td>
                            <td className="px-10 py-6 text-center font-bold text-[11px] text-gray-500 tabular-nums">
                              {cls.academicYear}
                            </td>
                            <td className="px-10 py-6">
                              <span className="text-xs font-bold text-gray-700">
                                {cls.homeroomTeacherName ? cls.homeroomTeacherName.replace(/^\s*\(UNDANGAN\)\s*/i, "") : "-"}
                              </span>
                            </td>
                            <td className="px-10 py-6 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => {
                                    setEditingId(cls.id);
                                    const grade = cls.grade || "";
                                    const className = cls.name.startsWith(grade)
                                      ? cls.name.substring(grade.length).trim()
                                      : cls.name;
                                    setClassFormData({
                                      grade,
                                      className: className,
                                      academicYear: cls.academicYear,
                                      homeroomTeacherId:
                                        cls.homeroomTeacherId || "",
                                      unitId: cls.unitId,
                                      teacherSignatureUrl: cls.teacherSignatureUrl || "",
                                    });
                                    setIsClassModalOpen(true);
                                  }}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl shadow-sm"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteClass(cls.id)}
                                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-xl shadow-sm"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          
                          {isExpanded && (
                            <tr className="bg-blue-50/10">
                              <td colSpan={6} className="px-10 py-6">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <Users size={14} className="text-blue-600" />
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Daftar Siswa Terdaftar</span>
                                  </div>
                                  <button 
                                    onClick={() => setExpandedStudentsSortDir(expandedStudentsSortDir === "asc" ? "desc" : "asc")}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-xl text-[9px] font-black uppercase tracking-tight text-gray-500 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"
                                  >
                                    <ArrowUpDown size={12} />
                                    Sort: {expandedStudentsSortDir === "asc" ? "A-Z" : "Z-A"}
                                  </button>
                                </div>
                                <motion.div 
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
                                >
                                  {classStudents.length === 0 ? (
                                    <div className="col-span-full py-8 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">
                                      Belum ada siswa di kelas ini
                                    </div>
                                  ) : (
                                    classStudents.map((s) => (
                                      <div key={s.id} className="p-3 bg-white border border-blue-50 rounded-2xl flex items-center gap-3 shadow-sm">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-black text-blue-600">
                                          {s.name.charAt(0)}
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-black text-gray-900 uppercase">
                                            {s.name}
                                          </span>
                                          <span className="text-[9px] font-mono text-gray-400">
                                            {s.luminaId}
                                          </span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : activeTab === "PENDING" ? (
              <table className="w-full text-left">
                <thead className="bg-red-50/50">
                  <tr>
                    <th className="px-10 py-6 text-[10px] font-black text-red-500 uppercase tracking-widest border-b border-red-50">
                      Pending Request
                    </th>
                    <th className="px-10 py-6 text-[10px] font-black text-red-500 uppercase tracking-widest border-b border-red-50">
                      Target Unit / Role
                    </th>
                    <th className="px-10 py-6 text-[10px] font-black text-red-500 uppercase tracking-widest border-b border-red-50">
                      Status Undangan
                    </th>
                    <th className="px-10 py-6 text-[10px] font-black text-red-500 uppercase tracking-widest border-b border-red-50 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPending.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-10 py-20 text-center text-gray-400 italic"
                      >
                        No pending activation requests.
                      </td>
                    </tr>
                  ) : (
                    filteredPending.map((user) => {
                      const hasInvite = invites.some(
                        (i) =>
                          i.email.toLowerCase() === user.email.toLowerCase() &&
                          i.status === "ready",
                      );
                      return (
                        <tr
                          key={user.uid}
                          className="group hover:bg-red-50/20 transition-all"
                        >
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-red-100 rounded-[1.2rem] flex items-center justify-center text-red-600 font-black text-lg italic shadow-sm">
                                {user.displayName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-black text-gray-900 tracking-tight italic uppercase">
                                  {user.displayName}
                                </p>
                                <p className="text-[10px] font-bold text-gray-400">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-10 py-6">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-black text-gray-700 uppercase tracking-tighter">
                                {user.role}
                              </span>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                {user.unitId}
                              </span>
                            </div>
                          </td>
                          <td className="px-10 py-6">
                            {hasInvite ? (
                              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl w-fit border border-emerald-100">
                                <CheckCircle2 size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest italic">
                                  Siap Aktivasi
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-red-400 bg-red-50 px-3 py-1.5 rounded-xl w-fit border border-red-100">
                                <XCircle size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest italic">
                                  Undangan Belum Ada
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-10 py-6 text-right">
                            <button
                              onClick={() =>
                                handleActivate(user.uid, user.email)
                              }
                              disabled={!hasInvite}
                              className={cn(
                                "px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl",
                                hasInvite
                                  ? "bg-red-600 text-white shadow-red-100 hover:scale-105 active:scale-95"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed",
                              )}
                            >
                              Aktifkan Akun
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : activeTab === "PROMPTS" ? (
              <div className="p-8 space-y-6" id="prompt-templates-manager">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
                      <Sparkles size={18} className="text-blue-600 animate-pulse" />
                      Manajer Prompt AI (AI Prompt Manager)
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Kelola semua instruksi prompt system AI untuk Lumina secara aman. Ubah variabel, sesuaikan nada model, tanpa perlu deploy ulang platform.
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenPromptModal(null)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-3 rounded-2xl shadow-lg shadow-blue-100 transition-all active:scale-95 text-[10px] uppercase tracking-widest shrink-0 font-bold"
                  >
                    <Plus size={14} />
                    Tambah Template Baru
                  </button>
                </div>

                {promptTemplates.filter(p => {
                  const matchesUnit = selectedUnit === "ALL" || p.unit === "ALL" || p.unit === selectedUnit;
                  const matchesSearch = !searchTerm || 
                    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    p.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
                  return matchesUnit && matchesSearch;
                }).length === 0 ? (
                  <div className="text-center py-20 bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-100">
                    <Sparkles className="mx-auto text-gray-300 animate-pulse mb-3" size={32} />
                    <p className="text-xs font-bold text-gray-550">Belum ada template prompt yang cocok.</p>
                    <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                      Silakan sesuaikan filter unit di atas atau tambahkan prompt template baru secepatnya.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[950px]">
                      <thead>
                        <tr className="border-b border-gray-50">
                          <th className="py-4 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Informasi Prompt</th>
                          <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Unit & Kategori</th>
                          <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Variabel</th>
                          <th className="py-4 pr-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pembaruan Terakhir</th>
                          <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                          <th className="py-4 pl-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {promptTemplates.filter(p => {
                          const matchesUnit = selectedUnit === "ALL" || p.unit === "ALL" || p.unit === selectedUnit;
                          const matchesSearch = !searchTerm || 
                            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            p.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
                          return matchesUnit && matchesSearch;
                        }).map((prompt) => (
                          <tr key={prompt.id} className="hover:bg-gray-50/35 transition-colors group">
                            <td className="py-5 pr-4">
                              <div className="space-y-1">
                                <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors text-sm">{prompt.name}</p>
                                <p className="font-mono text-[9px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md w-fit font-bold">{prompt.key}</p>
                                {prompt.description && (
                                  <p className="text-xs text-gray-500 leading-relaxed max-w-md">{prompt.description}</p>
                                )}
                              </div>
                            </td>
                            <td className="py-5 px-4 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                  prompt.unit === "ALL" && "bg-orange-50 text-orange-600 border-orange-100",
                                  prompt.unit === "KINDERGARTEN" && "bg-purple-50 text-purple-600 border-purple-100",
                                  prompt.unit === "ELEMENTARY" && "bg-teal-50 text-teal-600 border-teal-100",
                                  prompt.unit === "JUNIOR_HIGH" && "bg-blue-50 text-blue-600 border-blue-100"
                                )}>
                                  {prompt.unit}
                                </span>
                                <span className="text-[9px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-gray-100">
                                  {prompt.category || "General"}
                                </span>
                              </div>
                            </td>
                            <td className="py-5 px-4 text-center">
                              {prompt.variables && prompt.variables.length > 0 ? (
                                <div className="flex flex-wrap justify-center gap-1 max-w-[150px] mx-auto">
                                  {prompt.variables.map((v, i) => (
                                    <span key={i} className="bg-blue-50 text-blue-600 font-mono text-[9px] px-1.5 py-0.5 rounded border border-blue-100/30">
                                      {v}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">No variables</span>
                              )}
                            </td>
                            <td className="py-5 pr-4 text-xs text-gray-550">
                              <div className="space-y-0.5">
                                <p className="font-semibold text-gray-700">{prompt.updatedBy || "System Admin"}</p>
                                <p className="text-[9px] text-gray-400 font-bold whitespace-nowrap">
                                  {prompt.updatedAt ? new Date(prompt.updatedAt).toLocaleString("id-ID") : "-"}
                                </p>
                              </div>
                            </td>
                            <td className="py-5 px-4 text-center font-bold">
                              <button
                                onClick={() => handleTogglePromptActive(prompt)}
                                className={cn(
                                  "w-12 h-6 rounded-full p-1 transition-colors relative inline-flex items-center",
                                  prompt.isActive ? "bg-emerald-500" : "bg-gray-200"
                                )}
                              >
                                <span className={cn(
                                  "w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200",
                                  prompt.isActive ? "translate-x-6" : "translate-x-0"
                                )} />
                              </button>
                            </td>
                            <td className="py-5 text-right whitespace-nowrap space-x-1">
                              <button
                                onClick={() => handleOpenTestModal(prompt)}
                                className="px-3 py-1.5 bg-indigo-55 hover:bg-blue-600 text-white bg-blue-500 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                Test
                              </button>
                              <button
                                onClick={() => handleOpenPromptModal(prompt)}
                                className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors border border-gray-100"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeletePrompt(prompt)}
                                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors border border-red-100/50"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : activeTab === "LOGO" ? (
              <div id="logo-uploader-container" className="p-8 space-y-8 bg-white rounded-[3rem] border border-gray-100">
                <div id="logo-uploader-header" className="bg-gradient-to-r from-blue-500/15 via-indigo-500/10 to-transparent p-6 rounded-3xl border border-blue-100/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-gray-950 flex items-center gap-2">
                      <Sparkles size={16} className="text-blue-600 animate-pulse" />
                      Sistem Unggah Logo Ganda (Dual-Logo System)
                    </h3>
                    <p className="text-xs text-gray-600 leading-relaxed max-w-3xl">
                      Lumina mendukung penyimpanan logo berukuran ganda untuk masing-masing unit pendidikan (**TK, SD, dan SMP**). 
                      Logo persegi panjang digunakan untuk laporan rapor (KOP rapor) & header sekolah, sedangkan logo persegi digunakan untuk avatar profil, favicon, serta stempel digital resmi.
                    </p>
                  </div>
                  <button
                    id="btn-save-all-logos"
                    onClick={() => handleSaveLogos()}
                    disabled={isLogosSaving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 text-[10px] uppercase tracking-widest shrink-0 self-stretch md:self-auto justify-center"
                  >
                    {isLogosSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Simpan Semua Logo
                  </button>
                </div>

                <div id="logo-uploader-grid" className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                    { id: "KINDERGARTEN" as const, unitTitle: "Unit Kindergarten (TK)", accent: "emerald", label: "Lumina Kindergarten" },
                    { id: "ELEMENTARY" as const, unitTitle: "Unit Elementary (SD)", accent: "blue", label: "Lumina Elementary School" },
                    { id: "JUNIOR_HIGH" as const, unitTitle: "Unit Junior High (SMP)", accent: "indigo", label: "Lumina Junior High School" }
                  ].map((unitInfo) => {
                    const unit = unitInfo.id;
                    const unitLogos = logos[unit] || { rectangular: "", square: "" };
                    
                    return (
                      <div id={`logo-card-${unit}`} key={unit} className="bg-gray-50/30 rounded-[2rem] border border-gray-100 p-6 space-y-6 flex flex-col justify-between">
                        <div className="space-y-2">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                            unit === "KINDERGARTEN" && "bg-emerald-50 text-emerald-700 border border-emerald-100",
                            unit === "ELEMENTARY" && "bg-blue-50 text-blue-700 border border-blue-100",
                            unit === "JUNIOR_HIGH" && "bg-indigo-50 text-indigo-700 border border-indigo-100"
                          )}>
                            {unitInfo.unitTitle}
                          </span>
                          <h4 className="text-sm font-black text-gray-900 tracking-tight leading-tight">{unitInfo.label}</h4>
                          <p className="text-[10px] text-gray-400 font-bold">Harap unggah logo berukuran sesuai aspek rasio untuk performa terbaik.</p>
                        </div>

                        <div className="space-y-5 flex-1 mt-2">
                          {/* 1. Rectangular Logo Shape */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-gray-400">
                              <span>Logo Persegi Panjang (3:1)</span>
                              <span className="text-[8px] text-blue-500">Rekomendasi: 300x100 px</span>
                            </div>

                            {unitLogos.rectangular ? (
                              <div id={`preview-rect-${unit}`} className="border border-gray-100 rounded-2xl p-4 bg-white relative overflow-hidden flex items-center justify-center h-24 group shadow-sm">
                                <img src={unitLogos.rectangular} alt="Logo Rectangular" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                                <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                                  <label id={`lbl-rect-upload-${unit}`} className="p-2 bg-white/90 hover:bg-white text-gray-900 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-md transition-transform hover:scale-105">
                                    Ganti
                                    <input
                                      id={`input-file-rect-${unit}`}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleLogoUpload(unit, "rectangular", file);
                                      }}
                                    />
                                  </label>
                                  <button
                                    id={`btn-clear-rect-${unit}`}
                                    onClick={() => {
                                      setLogos(prev => ({
                                        ...prev,
                                        [unit]: { ...prev[unit], rectangular: "" }
                                      }));
                                    }}
                                    className="p-2 bg-red-600/95 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-md transition-transform hover:scale-105"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label id={`dropzone-rect-${unit}`} className="border border-dashed border-gray-200 hover:border-blue-400 rounded-2xl h-24 flex flex-col items-center justify-center bg-white hover:bg-blue-50/10 cursor-pointer group transition-all">
                                <Upload size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors mb-1.5" />
                                <span className="text-[10px] font-bold text-gray-450 group-hover:text-blue-600">Klik / Seret Gambar</span>
                                <span className="text-[8px] text-gray-300 font-bold uppercase tracking-widest mt-0.5">landscape</span>
                                <input
                                  id={`input-file-rect-empty-${unit}`}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleLogoUpload(unit, "rectangular", file);
                                  }}
                                />
                              </label>
                            )}
                          </div>

                          {/* 2. Square Logo Shape */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-gray-400">
                              <span>Logo Persegi (1:1)</span>
                              <span className="text-[8px] text-blue-500">Rekomendasi: 150x150 px</span>
                            </div>

                            {unitLogos.square ? (
                              <div id={`preview-square-${unit}`} className="border border-gray-100 rounded-2xl p-4 bg-white relative overflow-hidden flex items-center justify-center h-28 group shadow-sm">
                                <img src={unitLogos.square} alt="Logo Square" className="h-20 w-20 object-contain rounded-xl shadow-inner bg-white p-1 border border-gray-105" />
                                <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                                  <label id={`lbl-square-upload-${unit}`} className="p-2 bg-white/90 hover:bg-white text-gray-950 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-md transition-transform hover:scale-105">
                                    Ganti
                                    <input
                                      id={`input-file-square-${unit}`}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleLogoUpload(unit, "square", file);
                                      }}
                                    />
                                  </label>
                                  <button
                                    id={`btn-clear-square-${unit}`}
                                    onClick={() => {
                                      setLogos(prev => ({
                                        ...prev,
                                        [unit]: { ...prev[unit], square: "" }
                                      }));
                                    }}
                                    className="p-2 bg-red-600/95 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-md transition-transform hover:scale-105"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label id={`dropzone-square-${unit}`} className="border border-dashed border-gray-200 hover:border-blue-400 rounded-2xl h-28 flex flex-col items-center justify-center bg-white hover:bg-blue-50/10 cursor-pointer group transition-all">
                                <Upload size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors mb-1.5" />
                                <span className="text-[10px] font-bold text-gray-450 group-hover:text-blue-600">Klik / Seret Gambar</span>
                                <span className="text-[8px] text-gray-300 font-bold uppercase tracking-widest mt-0.5">square 1:1</span>
                                <input
                                  id={`input-file-square-empty-${unit}`}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleLogoUpload(unit, "square", file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        {/* Reset individual unit logos */}
                        {(unitLogos.rectangular || unitLogos.square) && (
                          <button
                            id={`btn-clear-unit-logos-${unit}`}
                            onClick={() => {
                              setLogos(prev => ({
                                ...prev,
                                [unit]: { rectangular: "", square: "" }
                              }));
                            }}
                            className="w-full text-center text-[10px] font-black uppercase text-red-500 hover:text-red-700 tracking-wider pt-3 border-t border-dashed border-gray-200 transition-colors"
                          >
                            Reset Logo Unit Ini
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : activeTab === "KNOWLEDGE_BASE" ? (
              <div className="p-8 space-y-6 bg-white rounded-[3rem] border border-gray-100">
                <div className="bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent p-6 rounded-3xl border border-emerald-100/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-gray-950 flex items-center gap-2">
                      <Sparkles size={16} className="text-emerald-600 animate-pulse" />
                      Pangkalan Data Pengetahuan AI (Grounded Knowledge Base)
                    </h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Dokumen di bawah ini disinkronisasikan langsung dari folder repositori Google Drive resmi Lazuardi GCS. AI Lumina Chat memanfaatkan konten dokumen ini untuk memberikan jawaban yang kredibel, akurat, dan grounded (sesuai fakta).
                    </p>
                  </div>
                  {syncResult && (
                    <div className="bg-white/80 px-4 py-2.5 rounded-2xl border border-emerald-100 text-[10px] font-bold text-emerald-800 space-y-0.5">
                      <p>Total Diperiksa: {syncResult.total}</p>
                      <p>Berhasil Disinkronkan: {syncResult.synced}</p>
                      {syncResult.errors && syncResult.errors.length > 0 && (
                        <p className="text-red-500">Error: {syncResult.errors.length} file</p>
                      )}
                    </div>
                  )}
                </div>

                {knowledgeBase.length === 0 ? (
                  <div className="text-center py-24 text-gray-400 italic space-y-3">
                    <Brain size={40} className="mx-auto text-gray-300 animate-pulse" />
                    <p>Belum ada dokumen di Knowledge Base. Masukkan Google Drive Folder ID dan klik sync di atas.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Judul Dokumen</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Drive File ID</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Jumlah Kata</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Waktu Sinkronisasi</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {knowledgeBase.map((docItem) => (
                          <tr key={docItem.id} className="hover:bg-gray-50/40 transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                <BookOpen size={14} className="text-blue-500" />
                                {docItem.title || "Tanpa Judul"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                {docItem.driveFileId || docItem.id}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-bold text-gray-600 text-sm">
                              {docItem.wordCount || 0} kata
                            </td>
                            <td className="px-6 py-4 text-center text-xs text-gray-500">
                              {docItem.lastSynced ? new Date(docItem.lastSynced).toLocaleString() : "-"}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleDeleteKnowledgeDoc(docItem.id)}
                                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-650 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border border-red-200"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <table className="w-full text-left min-w-[1200px]">
                <thead className="bg-gray-50/50">
                  <tr>
                    {activeMenu === "user-undangan" && (
                      <th className="px-6 py-6 w-12 border-b border-gray-100 text-center select-none">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={handleSelectAll}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 bg-white w-4 cursor-pointer"
                        />
                      </th>
                    )}
                    <th 
                      onClick={() => handleSort("name")}
                      className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        Name / Email
                        <SortIcon column="name" currentConfig={sortConfig} />
                      </div>
                    </th>
                    {activeTab === "STUDENT" && (
                      <>
                        <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                          Panggilan
                        </th>
                        <th 
                          onClick={() => handleSort("luminaId")}
                          className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 cursor-pointer hover:bg-gray-100"
                        >
                          <div className="flex items-center gap-2">
                            NIS
                            <SortIcon column="luminaId" currentConfig={sortConfig} />
                          </div>
                        </th>
                        <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                          NISN
                        </th>
                        <th className="px-4 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                          JK
                        </th>
                        <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">
                          Kelas
                        </th>
                        <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                          Ortu
                        </th>
                      </>
                    )}
                    {activeTab === "STAFF" && (
                      <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                        Details
                      </th>
                    )}
                    {activeTab === "PARENT" && (
                      <th 
                        onClick={() => handleSort("linkedStudents")}
                        className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 cursor-pointer hover:bg-gray-100"
                      >
                        <div className="flex items-center gap-2">
                          Siswa Terhubung
                          <SortIcon column="linkedStudents" currentConfig={sortConfig} />
                        </div>
                      </th>
                    )}
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">
                      Unit
                    </th>
                    <th 
                      onClick={() => handleSort("status")}
                      className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 cursor-pointer hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-2">
                        Status
                        <SortIcon column="status" currentConfig={sortConfig} />
                      </div>
                    </th>
                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right sticky right-0 bg-white shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.05)] z-10">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedInvites.length === 0 ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-10 py-20 text-center text-gray-400 italic"
                      >
                        No users found match criteria.
                      </td>
                    </tr>
                  ) : (
                    sortedInvites.map((invite) => (
                      <tr
                        key={invite.id}
                        className="group hover:bg-gray-50/30 transition-all"
                      >
                        {activeMenu === "user-undangan" && (
                          <td className="px-6 py-6 text-center w-12 select-none">
                            <input
                              type="checkbox"
                              checked={selectedInviteIds.includes(invite.id)}
                              onChange={() => handleSelectOne(invite.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 bg-white w-4 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-gray-900 uppercase tracking-tight italic">
                              {invite.name}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                              {invite.email}
                            </span>
                          </div>
                        </td>
                        
                        {activeTab === "STUDENT" && (
                          <>
                            <td className="px-6 py-6">
                              <span className="text-[11px] font-bold text-gray-600 uppercase">
                                {invite.nickname || "-"}
                              </span>
                            </td>
                            <td className="px-6 py-6">
                              <div className="flex flex-col">
                                <span className="text-[11px] font-mono font-bold text-blue-600">
                                  {invite.luminaId || "-"}
                                </span>
                                {invite.oldLuminaId && (
                                  <span className="text-[9px] font-mono font-bold text-gray-400 mt-0.5 leading-none bg-gray-50 border border-gray-100 rounded px-1 py-0.5 max-w-max" title="NIS Lama">
                                    Lama: {invite.oldLuminaId}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-6">
                              <span className="text-[11px] font-mono text-gray-400">
                                {invite.nisn || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-6">
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[9px] font-black",
                                invite.gender === "L" ? "bg-blue-50 text-blue-500" : "bg-pink-50 text-pink-500"
                              )}>
                                {invite.gender || "?"}
                              </span>
                            </td>
                            <td className="px-6 py-6 text-center">
                              <span className="text-[11px] font-black text-gray-700 italic">
                                {invite.classId || "-"}
                              </span>
                            </td>
                            <td className="px-6 py-6">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">
                                  {invite.fatherName ? `A: ${invite.fatherName}` : ""}
                                </span>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">
                                  {invite.motherName ? `I: ${invite.motherName}` : ""}
                                </span>
                                {invite.parentEmail && (
                                  <span className="text-[8px] font-bold text-blue-400 truncate max-w-[120px]">
                                    {invite.parentEmail}
                                  </span>
                                )}
                              </div>
                            </td>
                          </>
                        )}

                        {activeTab === "STAFF" && (
                          <td className="px-10 py-6">
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] font-black text-blue-600 uppercase tracking-tighter leading-none">
                                {invite.role}
                              </span>
                              {invite.jobTitle && (
                                <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                                  {invite.jobTitle}
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {activeTab === "PARENT" && (
                          <td className="px-6 py-6">
                            <div className="flex flex-wrap gap-2">
                              {invite.linkedStudents && invite.linkedStudents.length > 0 ? (
                                [...invite.linkedStudents]
                                  .sort((a, b) => {
                                    const nameA = studentIdToName[a] ? safeLower(studentIdToName[a]) : safeLower(a);
                                    const nameB = studentIdToName[b] ? safeLower(studentIdToName[b]) : safeLower(b);
                                    return nameA.localeCompare(nameB);
                                  })
                                  .map((sid, idx) => (
                                  <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg uppercase tracking-tight flex items-center gap-2 border border-blue-100">
                                    <span className="opacity-40 font-mono">{sid}</span>
                                    {studentIdToName[sid] && (
                                      <span className="font-black italic text-blue-700">{studentIdToName[sid]}</span>
                                    )}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] font-bold text-gray-300 italic">
                                  Belum terhubung
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        <td className="px-6 py-6 text-center text-[10px] font-black text-gray-400 uppercase italic">
                          {invite.role === "PARENT" ? (
                            <div className="flex flex-col gap-1 items-center justify-center max-w-[120px] mx-auto">
                              {Array.from(new Set([
                                invite.unitId,
                                ...(invite.linkedStudents || []).map(sid => studentIdToUnitId[sid]).filter(Boolean)
                              ])).map(unit => (
                                <span key={unit} className={cn(
                                  "px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-tighter leading-none whitespace-nowrap",
                                  unit === "KINDERGARTEN" 
                                    ? "bg-teal-50 text-teal-700 border border-teal-100" 
                                    : unit === "ELEMENTARY" 
                                      ? "bg-amber-50 text-amber-700 border border-amber-100" 
                                      : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                                )}>
                                  {unit === "KINDERGARTEN" ? "KINDERGARTEN" : unit === "ELEMENTARY" ? "ELEMENTARY" : "JUNIOR HIGH"}
                                </span>
                              ))}
                            </div>
                          ) : (
                            invite.unitId
                          )}
                        </td>
                        <td className="px-8 py-6">
                          <span
                            className={cn(
                              "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                              invite.status === "ready"
                                ? "bg-emerald-50 text-emerald-600"
                                : invite.status === "used"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-red-50 text-red-600",
                            )}
                          >
                            {invite.status}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right sticky right-0 bg-white group-hover:bg-gray-50 transition-all z-10 shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={async () => {
                                setEditingId(invite.id);
                                setFormData({ ...invite });
                                if (invite.role === "STUDENT" && invite.luminaId) {
                                  try {
                                    const q = query(
                                      collection(db, "enrollments"),
                                      where("studentId", "==", invite.luminaId)
                                    );
                                    const snap = await getDocs(q);
                                    const enrolls = snap.docs.map(doc => {
                                      const data = doc.data();
                                      return {
                                        academicYear: data.academicYear || "",
                                        classId: data.classId || "",
                                      };
                                    });
                                    if (enrolls.length === 0) {
                                      setStudentEnrollments([
                                        {
                                          academicYear: invite.academicYear || "2025/2026",
                                          classId: invite.classId || "",
                                        }
                                      ]);
                                    } else {
                                      setStudentEnrollments(enrolls);
                                    }
                                  } catch (err) {
                                    console.error("Failed to fetch student enrollments on edit:", err);
                                    setStudentEnrollments([
                                      {
                                        academicYear: invite.academicYear || "2025/2026",
                                        classId: invite.classId || "",
                                      }
                                    ]);
                                  }
                                } else {
                                  setStudentEnrollments([
                                    {
                                      academicYear: invite.academicYear || "2025/2026",
                                      classId: invite.classId || "",
                                    }
                                  ]);
                                }
                                setIsModalOpen(true);
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl shadow-sm"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(invite.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-xl shadow-sm"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )}

    {activeMenu === "import-massal" && (
      <div className="space-y-8 animate-in fade-in duration-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
                    Pusat Impor Massal GCS
                  </h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                    Sinkronisasikan data siswa, staff, dan orang tua via Google Sheets atau salin langsung dari Excel.
                  </p>
                </div>

                {/* Tab Selector for Sheets vs Copy-Paste */}
                <div className="flex bg-slate-100/80 p-1 rounded-2xl border border-gray-200/50 w-full sm:w-auto shrink-0">
                  <button
                    onClick={() => setImportSubTab("sheets")}
                    className={cn(
                      "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center justify-center gap-1.5 flex-1 sm:flex-initial",
                      importSubTab === "sheets"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    <RefreshCw size={12} className={cn(importLoading && "animate-spin")} />
                    Google Sheets Sync
                  </button>
                  <button
                    onClick={() => setImportSubTab("paste")}
                    className={cn(
                      "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center justify-center gap-1.5 flex-1 sm:flex-initial",
                      importSubTab === "paste"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    <Upload size={12} />
                    Kopi-Tempel (Copy-Paste)
                  </button>
                </div>
              </div>

              {importSubTab === "paste" ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left Column: Input and Setup */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                          <PlusSquare size={18} />
                        </div>
                        <div>
                          <h3 className="text-md font-black text-gray-900 tracking-tight">
                            Atur & Tempel Data
                          </h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">
                            Pengaturan Global & Input Clipboard
                          </p>
                        </div>
                      </div>

                      {/* Tipe Data */}
                      <div>
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                          Tipe Data Impor
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: "STUDENT", label: "Siswa" },
                            { id: "STAFF", label: "Staff/Guru" },
                            { id: "PARENT", label: "Orang Tua" },
                          ].map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setPasteMode(t.id as any);
                                setParsedRows([]);
                                setDetectedHeaders([]);
                                setColumnMappings({});
                              }}
                              className={cn(
                                "py-2.5 text-[10px] font-black uppercase tracking-wider rounded-xl border transition-all cursor-pointer",
                                pasteMode === t.id
                                  ? "bg-gray-900 border-gray-900 text-white shadow-sm"
                                  : "bg-slate-50 border-slate-100 text-gray-500 hover:bg-slate-100"
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Global Config Section */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Unit Tujuan
                          </label>
                          <select
                            value={pasteUnit}
                            onChange={(e) => setPasteUnit(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white text-gray-700"
                          >
                            <option value="KINDERGARTEN">KINDERGARTEN</option>
                            <option value="ELEMENTARY">ELEMENTARY</option>
                            <option value="JUNIOR_HIGH">JUNIOR_HIGH</option>
                          </select>
                        </div>

                        {pasteMode === "STUDENT" ? (
                          <div>
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                              Kelas Tujuan
                            </label>
                            <select
                              value={pasteClassId}
                              onChange={(e) => setPasteClassId(e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white text-gray-750"
                            >
                              <option value="">-- Pilih Kelas --</option>
                              {classes
                                .filter(c => c.unitId === pasteUnit && c.status !== "archived")
                                .map(c => (
                                  <option key={c.id} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 opacity-40">
                              Kelas Tujuan
                            </label>
                            <div className="px-4 py-3 bg-gray-100/50 border border-gray-50 rounded-xl text-xs font-bold text-gray-400 select-none">
                              Tidak Berlaku
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Tahun Ajaran
                          </label>
                          <select
                            value={pasteAcademicYear}
                            onChange={(e) => setPasteAcademicYear(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white text-gray-700"
                          >
                            <option value="2024/2025">2024/2025</option>
                            <option value="2025/2026">2025/2026</option>
                            <option value="2026/2027">2026/2027</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Semester
                          </label>
                          <select
                            value={pasteSemester}
                            onChange={(e) => setPasteSemester(Number(e.target.value))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white text-gray-700"
                          >
                            <option value={1}>1 (Ganjil)</option>
                            <option value={2}>2 (Genap)</option>
                          </select>
                        </div>
                      </div>

                      {/* Textarea Input */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                            Tempel Data Excel / Sheets
                          </label>
                          <span className="text-[8px] font-black text-gray-400 uppercase bg-gray-50 px-2 py-0.5 rounded border border-gray-100 font-mono">
                            Tab Separated
                          </span>
                        </div>
                        <textarea
                          rows={6}
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          placeholder="Salin data tabel Anda di Microsoft Excel atau Google Sheets, lalu klik di sini dan tekan tombol Paste (Ctrl+V) untuk menempelkan data..."
                          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-mono outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-gray-700 resize-y leading-relaxed"
                        />
                        <p className="text-[9px] text-gray-400 leading-relaxed font-bold">
                          Sistem akan mendeteksi baris pertama sebagai nama kolom jika berisi teks header, dan membagi kolom per baris secara otomatis.
                        </p>
                      </div>

                      {/* Deteksi Kolom Trigger Button */}
                      <button
                        type="button"
                        onClick={handleDetectColumns}
                        disabled={isParsing || !pasteText.trim()}
                        className="w-full py-3.5 bg-gray-900 text-white hover:bg-blue-650 active:bg-blue-700 rounded-2xl text-[10.5px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-40"
                      >
                        {isParsing ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Menganalisis Format...
                          </>
                        ) : (
                          <>
                            <Search size={14} />
                            Deteksi Kolom & Preview
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick Tips */}
                    <div className="bg-slate-50/70 p-6 rounded-[2rem] border border-gray-100 text-[11px] text-gray-500 space-y-2">
                      <p className="font-black text-gray-700 text-[9px] uppercase tracking-wider flex items-center gap-1">
                        <Sparkles size={11} className="text-yellow-500" /> Panduan Impor:
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-[10.5px] text-gray-400 leading-relaxed">
                        <li>Gunakan data terstruktur. Kolom **Nama Lengkap** adalah satu-satunya kolom wajib di mapping.</li>
                        <li>NIM (Lumina ID) & Email opsional. Jika kosong, sistem otomatis men-generate data unik yang valid.</li>
                        <li>Selalu periksa tabel mapping pratinjau sebelum menekan tombol simpan final di kanan.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Right Column: Mapping configuration and Preview */}
                  <div className="lg:col-span-7 space-y-6">
                    {parsedRows.length > 0 ? (
                      <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                              <CheckCircle2 size={18} />
                            </div>
                            <div>
                              <h3 className="text-md font-black text-gray-900 tracking-tight">
                                Pemetaan & Pratinjau
                              </h3>
                              <p className="text-[10px] text-emerald-600 font-bold uppercase">
                                Terdeteksi {parsedRows.length} baris data clipboard
                              </p>
                            </div>
                          </div>

                          <div className="text-[9px] bg-slate-50 text-slate-500 border border-gray-100 font-black px-2.5 py-1 rounded-xl uppercase tracking-wider">
                            {hasDetectedHeaders ? "Header Aktif" : "Tanpa Header"}
                          </div>
                        </div>

                        {/* Mapping Tool */}
                        <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50 p-5 space-y-4">
                          <div>
                            <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest block">
                              MAPPING KOLOM DATABASE LUMINA
                            </h4>
                            <p className="text-[9.5px] text-gray-400 mt-1 leading-relaxed">
                              Tautkan setiap kolom input Anda dengan field sistem Lumina yang terdaftar untuk tipe **{pasteMode === "STUDENT" ? "SISWA" : pasteMode === "STAFF" ? "STAFF/GURU" : "ORANG TUA"}**.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                            {detectedHeaders.map((header, index) => (
                              <div key={index} className="bg-white p-3.5 rounded-xl border border-gray-100 flex flex-col justify-between space-y-2 shadow-sm">
                                <div className="flex justify-between items-start gap-1">
                                  <span className="font-mono bg-blue-50 text-blue-600 font-bold px-1 rounded text-[9px] shrink-0">
                                    Kolom {index + 1}
                                  </span>
                                  <span className="text-[9.5px] font-bold text-gray-400 truncate max-w-[120px]" title={header}>
                                    {header}
                                  </span>
                                </div>

                                <select
                                  value={columnMappings[index] || ""}
                                  onChange={(e) => {
                                    setColumnMappings(prev => ({
                                      ...prev,
                                      [index]: e.target.value
                                    }));
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[10.5px] font-bold outline-none text-gray-800 focus:bg-white focus:ring-1 focus:ring-blue-100"
                                >
                                  <option value="">(Abaikan Kolom Ini)</option>
                                  {pasteMode === "STUDENT" && (
                                    <>
                                      <option value="fullName">Nama Lengkap *</option>
                                      <option value="luminaId">NIM / Lumina ID</option>
                                      <option value="email">Email Siswa</option>
                                      <option value="nisn">NISN</option>
                                      <option value="nickname">Nama Panggilan</option>
                                      <option value="gender">Jenis Kelamin (L/P)</option>
                                      <option value="parentEmail">Email Orang Tua</option>
                                      <option value="fatherName">Nama Ayah</option>
                                      <option value="motherName">Nama Ibu</option>
                                      <option value="classId">Kelas Spesifik</option>
                                      <option value="unitId">Unit Spesifik</option>
                                      <option value="academicYear">Tahun Ajaran Spesifik</option>
                                    </>
                                  )}
                                  {pasteMode === "STAFF" && (
                                    <>
                                      <option value="fullName">Nama Lengkap *</option>
                                      <option value="email">Email Staff/Guru *</option>
                                      <option value="jobTitle">Jabatan Kerja / Tugas</option>
                                      <option value="role">Role (TEACHER/STAFF/HEAD_UNIT)</option>
                                      <option value="luminaId">Lumina ID Kepegawaian</option>
                                      <option value="unitId">Unit Spesifik</option>
                                    </>
                                  )}
                                  {pasteMode === "PARENT" && (
                                    <>
                                      <option value="fullName">Nama Lengkap *</option>
                                      <option value="email">Email Orang Tua *</option>
                                      <option value="childId">Lumina ID Anak / Siswa *</option>
                                      <option value="luminaId">Lumina ID Orang Tua</option>
                                      <option value="unitId">Unit Spesifik</option>
                                    </>
                                  )}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top 10 Preview Grid */}
                        <div className="space-y-3">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                            Pratinjau Data (Maksimal 10 Baris Pertama)
                          </label>

                          <div className="border border-gray-100 rounded-2xl overflow-x-auto">
                            <table className="w-full text-left border-collapse text-[10.5px]">
                              <thead>
                                <tr className="bg-slate-50 border-b border-gray-100 text-gray-500 font-bold select-none">
                                  <th className="px-4 py-3 text-center w-12 text-[9px] font-mono">#</th>
                                  {detectedHeaders.map((header, index) => (
                                    <th key={index} className="px-4 py-3 min-w-[110px]">
                                      <span className="block text-[8px] text-blue-500 font-mono tracking-widest uppercase">
                                        {columnMappings[index] ? columnMappings[index] : "diabaikan"}
                                      </span>
                                      <span className="block truncate font-bold text-gray-700">{header}</span>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {parsedRows.slice(0, 10).map((row, rowIdx) => (
                                  <tr key={rowIdx} className="border-b border-gray-50 hover:bg-slate-50/50">
                                    <td className="px-4 py-3 text-center text-gray-400 font-mono font-bold">
                                      {rowIdx + 1}
                                    </td>
                                    {detectedHeaders.map((_, colIdx) => (
                                      <td key={colIdx} className="px-4 py-3 font-semibold text-gray-650 truncate max-w-[180px]">
                                        {row[colIdx] || <em className="text-gray-300">Kosong</em>}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Summary / Confirmation Area */}
                        {pasteResult && (
                          <div className="p-5 bg-emerald-50/70 border border-emerald-100/50 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10.5px] font-black text-emerald-800 flex items-center gap-1.5">
                                <CheckCircle2 size={14} /> HASIL IMPORT TERAKHIR:
                              </p>
                              <span className="text-[8px] font-mono font-black uppercase text-emerald-600 bg-white border border-emerald-100 rounded px-1.5 py-0.5 select-none">
                                BERHASIL
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-center font-black">
                              <div className="p-2 bg-white rounded-xl border border-emerald-100 shadow-sm">
                                <div className="text-md text-emerald-850">{pasteResult.created}</div>
                                <div className="text-[8px] text-gray-400 uppercase tracking-widest">BARU</div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-emerald-100 shadow-sm">
                                <div className="text-md text-emerald-850">{pasteResult.updated}</div>
                                <div className="text-[8px] text-gray-400 uppercase tracking-widest">UPDATE</div>
                              </div>
                              <div className="p-2 bg-white rounded-xl border border-emerald-100 shadow-sm">
                                <div className="text-md text-emerald-850">{pasteResult.skipped}</div>
                                <div className="text-[8px] text-gray-400 uppercase tracking-widest">LEWAT</div>
                              </div>
                            </div>

                            {pasteResult.errors.length > 0 && (
                              <div className="pt-2 border-t border-emerald-100/60 text-left">
                                <p className="text-[9px] font-black text-red-600 uppercase tracking-widest">
                                  {pasteResult.errors.length} Kesalahan baris data:
                                </p>
                                <div className="max-h-28 overflow-y-auto text-[9px] font-mono text-red-650 mt-1.5 space-y-1 bg-white p-3 rounded-lg border border-red-50/50">
                                  {pasteResult.errors.map((err, errIdx) => (
                                    <div key={errIdx} className="flex gap-1.5 items-start">
                                      <span className="text-[8px] font-sans bg-red-50 text-red-500 px-1 rounded">X</span>
                                      <span>{err}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {pasteResult.skippedReasons && pasteResult.skippedReasons.length > 0 && (
                              <div className="pt-2 border-t border-emerald-100/60 text-left">
                                <p className="text-[9px] font-black text-amber-650 uppercase tracking-widest">
                                  {pasteResult.skippedReasons.length} Baris Dilewati:
                                </p>
                                <div className="max-h-28 overflow-y-auto text-[9px] font-mono text-amber-700 mt-1.5 space-y-1 bg-white p-3 rounded-lg border border-amber-50/50">
                                  {pasteResult.skippedReasons.map((reason, reasonIdx) => (
                                    <div key={reasonIdx} className="flex gap-1.5 items-start">
                                      <span className="text-[8px] font-sans bg-amber-50 text-amber-500 px-1.5 rounded">i</span>
                                      <span>{reason}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Execute Import Button */}
                        <button
                          type="button"
                          onClick={handleSavePasteImport}
                          disabled={isSavingPaste}
                          className="w-full py-4 bg-gray-950 text-white hover:bg-emerald-600 active:bg-emerald-700 rounded-2xl text-[10.5px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-40"
                        >
                          {isSavingPaste ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Memproses Impor ({parsedRows.length} Baris)...
                            </>
                          ) : (
                            <>
                              <Upload size={14} />
                              Mulai Simpan & Import Sekarang
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100 h-[420px] flex flex-col items-center justify-center text-center p-8 select-none">
                        <div className="p-4 bg-white rounded-2xl text-gray-300 shadow-sm mb-3">
                          <Upload size={28} />
                        </div>
                        <h4 className="text-xs font-black text-gray-900 tracking-tight uppercase">Pratinjau Data Otomatis</h4>
                        <p className="text-[10px] text-gray-400 max-w-[260px] mt-1.5 leading-relaxed font-semibold">
                          Salin data spreadsheet Anda ke kolom kiri, kemudian klik tombol "Deteksi Kolom & Preview". Pratinjau tabel interaktif akan dinamis muncul di sini.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  {/* SECTION 1: STUDENT */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl">
                          <GraduationCap size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-gray-900 tracking-tight">
                            Impor Data Siswa
                          </h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">
                            Siswa & Informasi Kelas
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Google Sheets ID
                          </label>
                          <input
                            type="text"
                            value={studentSheetId}
                            onChange={(e) => setStudentSheetId(e.target.value)}
                            placeholder="Sheet ID"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-gray-800"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Nama Sheet (Tab)
                          </label>
                          <input
                            type="text"
                            value={studentSheetName}
                            onChange={(e) => setStudentSheetName(e.target.value)}
                            placeholder="SiswaLumina"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-gray-800"
                          />
                        </div>
                      </div>

                      {/* Column Guide */}
                      <div className="bg-slate-50/75 p-4 rounded-2xl border border-gray-50">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          Format Kolom Google Sheets:
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { col: "A", label: "NIS" },
                            { col: "B", label: "NISN" },
                            { col: "C", label: "Nama Lengkap" },
                            { col: "D", label: "Nama Panggilan" },
                            { col: "E", label: "Gender (L/P)" },
                            { col: "F", label: "Email Siswa" },
                            { col: "G", label: "Email Ortu" },
                            { col: "H", label: "Kelas (e.g. 7 Baiji)" },
                            { col: "I", label: "Unit (JUNIOR_HIGH)" },
                            { col: "J", label: "Tahun Ajaran (2025/2026)" },
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[10px] text-gray-600">
                              <span className="font-mono bg-blue-50 text-blue-600 font-bold px-1 rounded text-[9px] w-4 text-center">
                                {item.col}
                              </span>
                              <span className="font-sans text-[9px] truncate">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4">
                      {/* Section Result */}
                      {importSectionResult.STUDENT && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2">
                          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 size={14} /> Berhasil Diimpor
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-emerald-700">
                            <div>Baru: {importSectionResult.STUDENT.created}</div>
                            <div>Update: {importSectionResult.STUDENT.updated}</div>
                            <div>Lewat: {importSectionResult.STUDENT.skipped}</div>
                          </div>
                          {importSectionResult.STUDENT.errors.length > 0 && (
                            <div className="pt-2 border-t border-emerald-200">
                              <p className="text-[9px] font-black text-red-650 uppercase tracking-widest">
                                {importSectionResult.STUDENT.errors.length} Kesalahan:
                              </p>
                              <div className="max-h-20 overflow-y-auto text-[8px] font-mono text-red-600 mt-1 space-y-0.5">
                                {importSectionResult.STUDENT.errors.map((err, errIdx) => (
                                  <div key={errIdx}>{String(err)}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => handleSectionImport("STUDENT")}
                        disabled={importLoading}
                        className="w-full py-3.5 bg-gray-900 text-white hover:bg-blue-600 active:bg-blue-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {importLoading && activeImportSection === "STUDENT" ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Mengimpor Siswa...
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            Mulai Import Siswa
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>

                  {/* SECTION 2: STAFF */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3.5 bg-orange-50 text-orange-600 rounded-2xl">
                          <Users size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-gray-900 tracking-tight">
                            Impor Data Staff
                          </h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">
                            Guru & Tenaga Kependidikan
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Google Sheets ID
                          </label>
                          <input
                            type="text"
                            value={staffSheetId}
                            onChange={(e) => setStaffSheetId(e.target.value)}
                            placeholder="Sheet ID"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-gray-800"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Nama Sheet (Tab)
                          </label>
                          <input
                            type="text"
                            value={staffSheetName}
                            onChange={(e) => setStaffSheetName(e.target.value)}
                            placeholder="StaffLumina"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-gray-800"
                          />
                        </div>
                      </div>

                      {/* Column Guide */}
                      <div className="bg-slate-50/75 p-4 rounded-2xl border border-gray-50">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          Format Kolom Google Sheets:
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { col: "A", label: "Email" },
                            { col: "B", label: "Jabatan" },
                            { col: "C", label: "Role (TEACHER/STAFF/HEAD_UNIT)" },
                            { col: "D", label: "Unit (KINDERGARTEN, etc.)" },
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[10px] text-gray-600">
                              <span className="font-mono bg-orange-50 text-orange-600 font-bold px-1 rounded text-[9px] w-4 text-center">
                                {item.col}
                              </span>
                              <span className="font-sans text-[9px] truncate">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4">
                      {/* Section Result */}
                      {importSectionResult.STAFF && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2">
                          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 size={14} /> Berhasil Diimpor
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-emerald-700">
                            <div>Baru: {importSectionResult.STAFF.created}</div>
                            <div>Update: {importSectionResult.STAFF.updated}</div>
                            <div>Lewat: {importSectionResult.STAFF.skipped}</div>
                          </div>
                          {importSectionResult.STAFF.errors.length > 0 && (
                            <div className="pt-2 border-t border-emerald-200">
                              <p className="text-[9px] font-black text-red-650 uppercase tracking-widest">
                                {importSectionResult.STAFF.errors.length} Kesalahan:
                              </p>
                              <div className="max-h-20 overflow-y-auto text-[8px] font-mono text-red-600 mt-1 space-y-0.5">
                                {importSectionResult.STAFF.errors.map((err, errIdx) => (
                                  <div key={errIdx}>{String(err)}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => handleSectionImport("STAFF")}
                        disabled={importLoading}
                        className="w-full py-3.5 bg-gray-900 text-white hover:bg-orange-600 active:bg-orange-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {importLoading && activeImportSection === "STAFF" ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Mengimpor Staff...
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            Mulai Import Staff
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>

                  {/* SECTION 3: PARENT */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-between space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3.5 bg-purple-50 text-purple-600 rounded-2xl">
                          <Smile size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-gray-900 tracking-tight">
                            Impor Data Orang Tua
                          </h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">
                            Wali Siswa & Orang Tua GCS
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Google Sheets ID
                          </label>
                          <input
                            type="text"
                            value={parentSheetId}
                            onChange={(e) => setParentSheetId(e.target.value)}
                            placeholder="Sheet ID"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-gray-800"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                            Nama Sheet (Tab)
                          </label>
                          <input
                            type="text"
                            value={parentSheetName}
                            onChange={(e) => setParentSheetName(e.target.value)}
                            placeholder="OrangTuaLumina"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all text-gray-800"
                          />
                        </div>
                      </div>

                      {/* Column Guide */}
                      <div className="bg-slate-50/75 p-4 rounded-2xl border border-gray-50">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          Format Kolom Google Sheets:
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { col: "A", label: "ID Anak" },
                            { col: "B", label: "Nama Ortu" },
                            { col: "C", label: "Email Ortu" },
                            { col: "D", label: "Unit (TK, SD, SMP)" },
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[10px] text-gray-600">
                              <span className="font-mono bg-purple-50 text-purple-600 font-bold px-1 rounded text-[9px] w-4 text-center">
                                {item.col}
                              </span>
                              <span className="font-sans text-[9px] truncate">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4">
                      {/* Section Result */}
                      {importSectionResult.PARENT && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2">
                          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 size={14} /> Berhasil Diimpor
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-emerald-700">
                            <div>Baru: {importSectionResult.PARENT.created}</div>
                            <div>Update: {importSectionResult.PARENT.updated}</div>
                            <div>Lewat: {importSectionResult.PARENT.skipped}</div>
                          </div>
                          {importSectionResult.PARENT.errors.length > 0 && (
                            <div className="pt-2 border-t border-emerald-200">
                              <p className="text-[9px] font-black text-red-650 uppercase tracking-widest">
                                {importSectionResult.PARENT.errors.length} Kesalahan:
                              </p>
                              <div className="max-h-20 overflow-y-auto text-[8px] font-mono text-red-600 mt-1 space-y-0.5">
                                {importSectionResult.PARENT.errors.map((err, errIdx) => (
                                  <div key={errIdx}>{String(err)}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => handleSectionImport("PARENT")}
                        disabled={importLoading}
                        className="w-full py-3.5 bg-gray-900 text-white hover:bg-purple-600 active:bg-purple-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {importLoading && activeImportSection === "PARENT" ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Mengimpor Ortu...
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            Mulai Import Orang Tua
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>
          )}

          {activeMenu === "import-sync" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
                  Sinkronisasi Relasi Orang Tua
                </h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  Petakan Email Orang Tua dari Akun Siswa ke Akun Wali secara dinamis.
                </p>
              </div>

              <div className="max-w-3xl bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-3xl shrink-0 mt-1">
                    <RefreshCw size={24} className={cn(syncLoading && "animate-spin")} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-black text-gray-900 tracking-tight">
                      Cara Kerja Sinkronisasi Wali
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Sistem akan memindai semua siswa terdaftar yang memiliki field "Email Ortu", kemudian mendeteksi akun Ortu yang bersesuaian di sistem. Jika akun Ortu belum memiliki relasi aktif dengan NIM/Lumina ID sang anak, sistem akan menautkannya secara otomatis dan aman.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                    Catatan Penting
                  </p>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Prosedur ini aman dijalankan berulang kali kapan saja tanpa merusak data absensi, nilai, maupun rekam medis siswa dan orang tua. Harap tunggu hingga notifikasi selesai muncul sebelum beralih ke halaman lain.
                  </p>
                </div>

                <button
                  onClick={handleSyncParents}
                  disabled={syncLoading}
                  className="px-8 py-4 bg-gray-900 text-white hover:bg-blue-600 active:bg-blue-700 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50 select-none shadow-md shadow-gray-100"
                >
                  {syncLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sedang Sinkronisasi Wali...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Mulai Sinkronisasi Wali
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeMenu === "sistem-reset" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
                  Pusat Reset & Pembersihan Data GCS
                </h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  Bersihkan database Anda dari data dummy Lazuardi GCS untuk menyiapkan peluncuran produksi yang aman.
                </p>
              </div>

              <div className="max-w-3xl bg-white p-8 rounded-[2rem] border border-red-100 shadow-sm space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-4 bg-red-50 text-red-650 rounded-3xl shrink-0 mt-1">
                    <AlertCircle size={24} className="text-red-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-black text-red-600 tracking-tight italic uppercase">
                      PERINGATAN: Tindakan Ini Tidak Dapat Dibatalkan!
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Tindakan ini akan menghapus seluruh data guru, siswa, kelas, relasi orang tua, log kehadiran, back-up rekam akademis/perilaku, dan file pendukung dari semua unit (TK, SD, SMP). Gunakan fitur ini hanya sebelum live production atau jika Anda ingin mengulangi konfigurasi dari awal.
                    </p>
                  </div>
                </div>

                <div className="bg-red-50/40 p-5 rounded-2xl border border-red-50">
                  <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-1.5">
                    Prosedur Pengosongan
                  </p>
                  <p className="text-[11px] text-red-600 leading-relaxed">
                    Sistem akan melakukan wipe out data secara otomatis di Firebase Firestore dan mengosongkan local storage agen. Setelah proses ini selesai, unit penjemputan di TK dan modul presensi serta modul akademis akan kembali ke kondisi bawaan awal (blank state).
                  </p>
                </div>

                <button
                  onClick={handleResetData}
                  disabled={resetLoading}
                  className="px-8 py-4 bg-red-600 hover:bg-red-750 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50 select-none shadow-md shadow-red-100 font-sans font-black"
                >
                  {resetLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sedang Menghapus Seluruh Data...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Mulai Reset & Pengosongan Data GCS
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeMenu === "reconcile-siswa" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-[9px] font-black bg-orange-100 text-orange-700 rounded-full uppercase tracking-widest">
                    Super Admin Engine
                  </span>
                  <span className="px-2 py-0.5 text-[9px] font-black bg-slate-100 text-slate-700 rounded-full uppercase tracking-widest">
                    Firestore Integrity
                  </span>
                </div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
                  Rekonsiliasi & Sinkronisasi ID Siswa
                </h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  Mendeteksi, memetakan, dan menyinkronkan kembali identifier siswa (LMN ID vs NIS) yang tidak konsisten di berbagai koleksi sekunder Lumina.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Control Panel Card */}
                <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest border-b border-gray-50 pb-3 flex items-center gap-2">
                    <Terminal size={16} className="text-orange-500" />
                    Parameter Eksekusi
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                        Pilih Unit Target Rekonsiliasi
                      </label>
                      <select
                        value={reconcileUnit}
                        onChange={(e) => setReconcileUnit(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-700 outline-none focus:border-orange-200 transition-all cursor-pointer"
                      >
                        <option value="KINDERGARTEN">Kindergarten (TK)</option>
                        <option value="ELEMENTARY">Elementary (SD)</option>
                        <option value="JUNIOR_HIGH">Junior High (SMP)</option>
                        <option value="ALL">Seluruh Unit (ALL LEVEL)</option>
                      </select>
                    </div>

                    <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-100/50 space-y-2">
                      <div className="flex items-center gap-1.5 text-amber-700">
                        <AlertTriangle size={14} className="shrink-0" />
                        <h4 className="text-[10px] font-black uppercase tracking-wider">
                          Informasi Alur Kerja :
                        </h4>
                      </div>
                      <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                        Sistem memetakan link hubungan di <span className="text-amber-800 font-bold">roleInvites</span> ke siswa master di <span className="text-amber-800 font-bold">students</span>, lalu menulis kembali ID internal yang stabil ke collections: observations, published_kg_reports, users, attendance, lateness_records, & parentStudentLinks.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => handleReconcileStudentRefs(true)}
                      disabled={isReconciling}
                      className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50 select-none shadow-md shadow-slate-100"
                    >
                      {isReconciling ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Menganalisis...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={14} />
                          Simulasikan (Dry Run)
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleReconcileStudentRefs(false)}
                      disabled={isReconciling}
                      className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50 select-none shadow-md shadow-orange-100"
                    >
                      {isReconciling ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Memproses DB...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} />
                          Terapkan (Live Update)
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Clean Corrupted oldLuminaId References Card */}
                <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest border-b border-gray-50 pb-3 flex items-center gap-2">
                      <AlertCircle size={16} className="text-red-500" />
                      Integritas Data NIS Lama
                    </h3>
                    <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                      Memindai dan membersihkan field <span className="font-bold text-red-600">oldLuminaId</span> (NIS Lama) yang salah isi (berisi data gender seperti &quot;Perempuan&quot; atau &quot;Laki-laki&quot;).
                    </p>

                    {cleanupResult && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] space-y-1.5 font-bold uppercase text-gray-600 leading-snug">
                        <div className="text-[11px] text-gray-800 tracking-tight mb-1 border-b border-gray-100 pb-1 font-black">
                          HASIL {cleanupResult.mode}:
                        </div>
                        <div>Total Record Korup: <span className="text-red-500 font-black">{cleanupResult.updatedCount}</span></div>
                        {cleanupResult.samples && cleanupResult.samples.length > 0 && (
                          <div className="text-[9px] text-gray-400 capitalize normal-case font-medium max-h-24 overflow-y-auto space-y-1 mt-1 border-t border-gray-50 pt-1">
                            {cleanupResult.samples.map((s: any, idx: number) => (
                              <div key={idx}>• {s.name} ({s.collection}): &quot;{s.oldValue}&quot;</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => handleCleanupInvalidOldIds(true)}
                      disabled={isCleaningUpIds}
                      className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50 select-none border border-slate-200"
                    >
                      {isCleaningUpIds ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      Analisis Korup (Dry Run)
                    </button>

                    <button
                      onClick={() => handleCleanupInvalidOldIds(false)}
                      disabled={isCleaningUpIds}
                      className="w-full py-3 bg-red-600 hover:bg-red-750 text-white rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50 select-none shadow-md shadow-red-100"
                    >
                      <CheckCircle2 size={12} />
                      Terapkan Pembersihan (Live)
                    </button>
                  </div>
                </div>

                {/* Results Screen Card */}
                <div className="lg:col-span-2 space-y-6">
                  {isReconciling && (
                    <div className="bg-white p-12 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
                      <div className="p-4 bg-orange-50 text-orange-600 rounded-full animate-pulse border border-orange-105">
                        <RefreshCw size={32} className="animate-spin text-orange-500" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-1">
                          Mesin Rekonsiliasi Sedang Berjalan
                        </h4>
                        <p className="text-xs text-gray-450 font-bold max-w-sm mx-auto">
                          Memindai, menguji integritas, dan memverifikasi keselarasan ID siswa di seluruh koleksi Firestore. Harap tunggu sebentar...
                        </p>
                      </div>
                    </div>
                  )}

                  {!isReconciling && !reconciliationResult && (
                    <div className="bg-slate-50/40 p-12 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="p-4 bg-gray-100/80 text-gray-450 rounded-full">
                        <Terminal size={28} className="text-slate-400" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">
                          Belum Ada Analisis Terbuka
                        </h4>
                        <p className="text-[11px] text-gray-450 font-bold max-w-sm mx-auto">
                          Jalankan simulasi &quot;Dry Run&quot; atau filter unit target di panel kiri untuk me-load hasil pencocokan relasi data siswa.
                        </p>
                      </div>
                    </div>
                  )}

                  {!isReconciling && reconciliationResult && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      {/* Diagnostic Summary Bento Layout */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Mode Eksekusi
                          </span>
                          <span className={cn(
                            "text-xs font-black uppercase tracking-wide mt-1.5 px-2 py-0.5 rounded-md inline-block max-w-max",
                            reconciliationResult.mode === "DRY-RUN" 
                              ? "bg-blue-50 text-blue-700 border border-blue-100" 
                              : "bg-green-50 text-green-700 border border-green-100"
                          )}>
                            {reconciliationResult.mode}
                          </span>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Siswa Master
                          </span>
                          <span className="text-base font-black text-slate-800 mt-1">
                            {reconciliationResult.scannedStudentsCount || 0} <span className="text-[9px] text-gray-400 uppercase font-black tracking-normal">Data</span>
                          </span>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Undangan (ST)
                          </span>
                          <span className="text-base font-black text-indigo-700 mt-1">
                            {reconciliationResult.scannedSTUDENTInvitesCount || 0} <span className="text-[9px] text-gray-400 uppercase font-black tracking-normal">Siswa</span>
                          </span>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Sinkron / Total Map
                          </span>
                          <span className="font-mono text-base font-bold mt-1 text-orange-600">
                            {reconciliationResult.mappingCount || 0} <span className="text-[9px] text-gray-400 uppercase font-black tracking-normal font-sans">Kunci</span>
                          </span>
                        </div>
                      </div>

                      {/* Detail Mapping Statistics */}
                      <div className="bg-gradient-to-br from-indigo-50/20 to-orange-50/10 p-5 rounded-3xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white/80 p-3.5 rounded-2xl border border-white flex items-center gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <CheckCircle2 size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 font-black uppercase">Relasi Terverifikasi</p>
                            <p className="text-sm font-black text-emerald-700">{reconciliationResult.matchedInvitesCount || 0} Siswa</p>
                          </div>
                        </div>

                        <div className="bg-white/80 p-3.5 rounded-2xl border border-white flex items-center gap-3">
                          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <AlertTriangle size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 font-black uppercase">Unlinked / Yatim Piatu</p>
                            <p className="text-sm font-black text-amber-700">{reconciliationResult.unmatchedInvitesCount || 0} Siswa</p>
                          </div>
                        </div>

                        <div className="bg-white/80 p-3.5 rounded-2xl border border-white flex items-center gap-3">
                          <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                            <RefreshCw size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-450 font-black uppercase">Perubahan Referensi</p>
                            <p className="text-sm font-black text-orange-700">{reconciliationResult.changesCount || 0} Dokumen</p>
                          </div>
                        </div>
                      </div>

                      {/* Detailed Priority Tier Match Diagnostics */}
                      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4">
                        <div className="border-b border-gray-55 pb-3">
                          <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
                            <Sparkles size={14} className="text-indigo-500 animate-pulse" />
                            Statistik Tingkat Pencocokan (5-Tier Alignment Engine)
                          </h4>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5 tracking-wider">
                            Breakdown performa logika pencocokan dari prioritas tertinggi (Doc ID) hingga fallback terlemah (Nama Normalisasi).
                          </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 pt-1">
                          <div className="bg-slate-50/60 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between">
                            <div>
                              <span className="text-[8px] font-black uppercase text-indigo-500 tracking-wider">Tier 1</span>
                              <p className="text-[10.5px] font-black text-slate-700 leading-tight mt-0.5">Exact Doc ID</p>
                            </div>
                            <div className="mt-3.5 flex items-baseline gap-1">
                              <span className="text-lg font-extrabold text-slate-800">{reconciliationResult.matchedByDocId || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold uppercase">Siswa</span>
                            </div>
                          </div>

                          <div className="bg-slate-50/60 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between">
                            <div>
                              <span className="text-[8px] font-black uppercase text-indigo-500 tracking-wider">Tier 2</span>
                              <p className="text-[10.5px] font-black text-slate-700 leading-tight mt-0.5">Lumina ID Property</p>
                            </div>
                            <div className="mt-3.5 flex items-baseline gap-1">
                              <span className="text-lg font-extrabold text-slate-800">{reconciliationResult.matchedByLuminaId || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold uppercase">Siswa</span>
                            </div>
                          </div>

                          <div className="bg-slate-50/60 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between">
                            <div>
                              <span className="text-[8px] font-black uppercase text-indigo-500 tracking-wider">Tier 3</span>
                              <p className="text-[10.5px] font-black text-slate-700 leading-tight mt-0.5">NIS / National ID</p>
                            </div>
                            <div className="mt-3.5 flex items-baseline gap-1">
                              <span className="text-lg font-extrabold text-slate-800">{reconciliationResult.matchedByNis || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold uppercase">Siswa</span>
                            </div>
                          </div>

                          <div className="bg-slate-50/60 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between">
                            <div>
                              <span className="text-[8px] font-black uppercase text-indigo-500 tracking-wider">Tier 4</span>
                              <p className="text-[10.5px] font-black text-slate-700 leading-tight mt-0.5">Unique Email</p>
                            </div>
                            <div className="mt-3.5 flex items-baseline gap-1">
                              <span className="text-lg font-extrabold text-slate-800">{reconciliationResult.matchedByEmail || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold uppercase">Siswa</span>
                            </div>
                          </div>

                          <div className="bg-slate-50/60 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between col-span-2 md:col-span-1">
                            <div>
                              <span className="text-[8px] font-black uppercase text-orange-600 tracking-wider">Tier 5</span>
                              <p className="text-[10.5px] font-black text-slate-700 leading-tight mt-0.5">Tolerant Name Fallback</p>
                            </div>
                            <div className="mt-3.5 flex items-baseline gap-1">
                              <span className="text-lg font-extrabold text-orange-600">{reconciliationResult.matchedByName || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold uppercase">Siswa</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Ambiguous Duplicate Matches Logs */}
                      {reconciliationResult.ambiguousMatches && reconciliationResult.ambiguousMatches.length > 0 && (
                        <div className="bg-amber-50/40 rounded-[2rem] border border-amber-100 p-6 space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-amber-100 pb-3">
                            <div>
                              <h4 className="text-xs font-black text-amber-850 uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle size={15} className="text-amber-600" />
                                Deteksi Ambiguitas Ganda ({reconciliationResult.ambiguousMatches.length}) - Dilewati Otomatis
                              </h4>
                              <p className="text-[10px] text-amber-700/80 font-semibold mt-0.5 uppercase tracking-wider">
                                Demi integritas data, pencarian di bawah ini diabaikan karena menghasilkan lebih dari 1 kandidat yang sama (seperti nama duplikat / kembar).
                              </p>
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-2">
                            {reconciliationResult.ambiguousMatches.map((msg: string, idx: number) => (
                              <div key={idx} className="p-3 bg-white rounded-xl border border-amber-100/60 text-xs text-amber-900 leading-relaxed font-semibold flex items-start gap-2">
                                <span className="p-1 px-2 bg-amber-50 text-amber-600 rounded text-[9px] font-black shrink-0">AMBIGU</span>
                                <span>{msg}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Explicit Warning For 0 Mappings */}
                      {reconciliationResult.mappingCount === 0 && (
                        <div className="p-6 bg-rose-50/60 rounded-3xl border border-rose-150/60 space-y-3.5">
                          <div className="flex items-center gap-2.5 text-rose-800">
                            <AlertCircle size={20} className="shrink-0" />
                            <h4 className="text-xs font-black uppercase tracking-widest">
                              Mengapa Hasil Output Mapping Kosong?
                            </h4>
                          </div>
                          <div className="text-xs text-gray-550 leading-relaxed font-semibold space-y-2">
                            <p>
                              Mesin sinkronisasi berhasil menganalisis database, tetapi **0 entitas kunci referensi** yang perlu diperbarui karena:
                            </p>
                            <ul className="list-disc list-inside space-y-1.5 pl-2">
                              <li>
                                <span className="text-slate-800 font-bold">Semua data sudah sinkron</span>: Kolom referensi ID siswa pada records observations dan users Anda sudah mengarah dengan tepat ke master student ID.
                              </li>
                              <li>
                                <span className="text-slate-800 font-bold">Tidak ada roleInvites STUDENT berstatus aktif</span> untuk unit target <span className="font-bold underline text-rose-700">{reconcileUnit}</span>.
                              </li>
                              <li>
                                <span className="text-slate-800 font-bold">Mismatch Nama / Email</span>: Siswa pada tabel undangan roleInvites gagal dicocokkan ke master data students dikarenakan ketidakcocokan literal nama dan email. Silakan periksa daftar siswa unlinked di bagian bawah.
                              </li>
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Scanned Collections Table */}
                      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
                        <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
                          <ShieldCheck size={14} className="text-green-600" />
                          Hasil Pemindaian Koleksi
                        </h4>
                        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                          <table className="w-full border-collapse text-left">
                            <thead>
                              <tr className="bg-slate-50 border-b border-gray-100">
                                <th className="p-3.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Koleksi Firestore</th>
                                <th className="p-3.5 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Total Dokumen</th>
                                <th className="p-3.5 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Diselaraskan (Disinkron)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs">
                              {Object.entries(reconciliationResult.scannedCollections || {}).map(([name, stats]: [string, any]) => (
                                <tr key={name} className="hover:bg-slate-50/50">
                                  <td className="p-3.5 font-mono font-medium text-slate-600 whitespace-nowrap">{name}</td>
                                  <td className="p-3.5 text-center font-semibold text-slate-400">{stats.scanned}</td>
                                  <td className="p-3.5 text-center">
                                    <span className={cn(
                                      "px-2.5 py-0.5 rounded-full font-bold font-mono text-[10px]",
                                      stats.matched > 0 ? "bg-orange-50 text-orange-700 border border-orange-100" : "bg-slate-50 text-slate-400"
                                    )}>
                                      {stats.matched}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Unmatched Samples Table */}
                      {reconciliationResult.unmatchedSamples && reconciliationResult.unmatchedSamples.length > 0 && (
                        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4 animate-in slide-in-from-bottom duration-300">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-gray-50 pb-3">
                            <div>
                              <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle size={15} className="text-amber-500" />
                                Daftar Undangan Tanpa Relasi Siswa Master ({reconciliationResult.unmatchedInvitesCount})
                              </h4>
                              <p className="text-[10px] text-gray-400 font-semibold mt-0.5 uppercase tracking-wider">
                                Email atau Nama siswa di invitations ini tidak terhubung dengan dokumen mana pun di koleksi Master Students.
                              </p>
                            </div>
                            <span className="text-[9px] font-black text-gray-400 tracking-wider uppercase bg-gray-50 px-2 py-1 rounded-md shrink-0">
                              Maks. 20 Sampel Teratas
                            </span>
                          </div>

                          <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                            <table className="w-full border-collapse text-left">
                              <thead>
                                <tr className="bg-slate-50 border-b border-gray-100">
                                  <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Nama Undangan</th>
                                  <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Email Siswa</th>
                                  <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Unit</th>
                                  <th className="p-3 text-[9px] font-black text-slate-500 uppercase tracking-widest font-mono">Doc ID Invite</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 text-xs">
                                {reconciliationResult.unmatchedSamples.map((item: any) => (
                                  <tr key={item.id} className="hover:bg-amber-50/20">
                                    <td className="p-3 font-semibold text-slate-700">{item.name}</td>
                                    <td className="p-3 text-slate-550">{item.email}</td>
                                    <td className="p-3 text-center">
                                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9.5px] font-black uppercase">{item.unitId}</span>
                                    </td>
                                    <td className="p-3 font-mono text-[10px] text-gray-400">{item.id}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Samples Block */}
                      {reconciliationResult.sampleChanges && reconciliationResult.sampleChanges.length > 0 && (
                        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden p-6 space-y-4">
                          <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <Terminal size={14} className="text-slate-650" />
                              Sampel Log Perubahan (Siswa / Dokumen)
                            </span>
                            <span className="text-[9px] font-black text-gray-400 tracking-wider">
                              Menampilkan maks. {reconciliationResult.sampleChanges.length} perubahan
                            </span>
                          </h4>

                          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                            {reconciliationResult.sampleChanges.map((change: any, index: number) => (
                              <div key={index} className="flex flex-col md:flex-row md:items-center justify-between p-3.5 bg-slate-50/60 rounded-2xl border border-slate-50 text-[11px] gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <span className="px-1.5 py-0.5 font-mono text-[9.5px] bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                                      {change.collection}
                                    </span>
                                    <span className="text-slate-400 font-normal">ID: {change.docId}</span>
                                  </div>
                                  <div className="text-slate-500 font-semibold">
                                    Field: <span className="font-mono font-bold text-slate-600">{change.field}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-100 shrink-0 font-mono text-xs">
                                  <span className="text-red-500 font-bold line-through">{change.oldValue}</span>
                                  <ArrowRight size={12} className="text-slate-400 shrink-0" />
                                  <span className="text-green-600 font-bold">{change.newValue}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Errors or Warnings warnings */}
                      {reconciliationResult.errorsCount > 0 && (
                        <div className="bg-red-50/40 rounded-[2rem] border border-red-100 p-6 space-y-3">
                          <h4 className="text-xs font-black text-red-700 uppercase tracking-widest flex items-center gap-2">
                            <AlertCircle size={14} />
                            Log Masalah / Warning Integritas ({reconciliationResult.errorsCount})
                          </h4>
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                            {reconciliationResult.errors.map((errMessage: string, index: number) => (
                              <div key={index} className="p-2.5 bg-white rounded-xl border border-red-50 text-[10.5px] text-red-650 font-semibold leading-relaxed">
                                {errMessage}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeMenu === "conflict-siswa" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-[9px] font-black bg-rose-100 text-rose-700 rounded-full uppercase tracking-widest animate-pulse">
                    Identity Core Engine
                  </span>
                  <span className="px-2 py-0.5 text-[9px] font-black bg-slate-100 text-slate-700 rounded-full uppercase tracking-widest">
                    Name-Centric Layer
                  </span>
                </div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase flex items-center gap-2">
                  Deteksi & Review Konflik Identitas Siswa
                </h2>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                  Mendeteksi, memetakan, dan menganalisis konflik identitas siswa berdasarkan Nama Lengkap sebagai Layer Identitas Utama (Primary Layer).
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Control Panel Panel */}
                <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-6 flex flex-col justify-between">
                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest border-b border-gray-50 pb-3 flex items-center gap-2">
                      <Terminal size={14} className="text-rose-500 animate-pulse" />
                      Parameter Pemindaian
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                          Unit Target Pemindaian
                        </label>
                        <select
                          value={conflictUnit}
                          onChange={(e) => setConflictUnit(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-700 outline-none focus:border-rose-200 transition-all cursor-pointer"
                        >
                          <option value="KINDERGARTEN">Kindergarten (TK)</option>
                          <option value="ELEMENTARY">Elementary (SD)</option>
                          <option value="JUNIOR_HIGH">Junior High (SMP)</option>
                          <option value="ALL">Seluruh Unit (ALL LEVEL)</option>
                        </select>
                      </div>

                      <div className="p-4 bg-rose-50/40 rounded-2xl border border-rose-100/50 space-y-2">
                        <div className="flex items-center gap-1.5 text-rose-700">
                          <AlertTriangle size={14} className="shrink-0" />
                          <h4 className="text-[10px] font-black uppercase tracking-wider">
                            Aturan Deteksi Sistem:
                          </h4>
                        </div>
                        <ul className="text-[10px] text-gray-500 leading-relaxed font-semibold list-disc list-inside space-y-1">
                          <li><strong className="text-rose-700">High Confidence:</strong> Nama sama persis & detail kelas/ortu/unit selaras.</li>
                          <li><strong className="text-orange-600">Standard Conflict:</strong> Nama sama persis namun NIS / ID berbeda.</li>
                          <li><strong className="text-amber-600">Needs Review:</strong> Kemiripan nama tinggi (Levenshtein ≥ 75%).</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={handleScanIdentityConflicts}
                      disabled={isScanningConflicts}
                      className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50 select-none shadow-md shadow-slate-150"
                    >
                      {isScanningConflicts ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Memindai...
                        </>
                      ) : (
                        <>
                          <Search size={14} />
                          Pindai Core Identitas
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Dashboard & Results View */}
                <div className="lg:col-span-3 space-y-6">
                  {isScanningConflicts && (
                    <div className="bg-white p-16 rounded-[2.5rem] border border-gray-155 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
                      <div className="p-4 bg-rose-50 text-rose-600 rounded-full animate-pulse border border-rose-100">
                        <Loader2 size={32} className="animate-spin text-rose-500" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-1">
                          Menghitung Indeks Kemiripan Nama Siswa
                        </h4>
                        <p className="text-xs text-gray-400 font-bold max-w-sm mx-auto leading-relaxed">
                          Menormalisasi field fullNameNormalized, mengekstraksi record dari koleksi students & roleInvites, dan menjalankan algoritma Levenshtein distance. Harap tunggu sebentar...
                        </p>
                      </div>
                    </div>
                  )}

                  {!isScanningConflicts && !conflictResult && (
                    <div className="bg-slate-50/50 p-16 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="p-4 bg-gray-100/80 text-gray-400 rounded-full">
                        <Users size={32} className="text-slate-400" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">
                          Pemindaian Identitas Belum Berjalan
                        </h4>
                        <p className="text-[11px] text-gray-450 font-bold max-w-md mx-auto leading-relaxed">
                          Tekan tombol &quot;Pindai Core Identitas&quot; pada panel kiri untuk memetakan siswa dan undangan siswa yang memiliki potensi konflik identitas nama ganda (Duplicate/Conflict) di unit target Lumina GCS.
                        </p>
                      </div>
                    </div>
                  )}

                  {!isScanningConflicts && conflictResult && (
                    <div className="space-y-6">
                      {/* STATS TILES */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-center">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Siswa Dipindai</p>
                          <p className="text-2xl font-black text-slate-800">{conflictResult.totalScanned}</p>
                        </div>
                        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-center">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Nama Unik</p>
                          <p className="text-2xl font-black text-blue-600">{conflictResult.totalUniqueNames}</p>
                        </div>
                        <div className="bg-white p-5 rounded-3xl bg-rose-50/20 border border-rose-100 text-center">
                          <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Konflik Identitas</p>
                          <p className="text-2xl font-black text-rose-600">{conflictResult.totalConflicts}</p>
                        </div>
                        <div className="bg-white p-5 rounded-3xl bg-amber-50/20 border border-amber-100 text-center">
                          <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Needs Review</p>
                          <p className="text-2xl font-black text-amber-600">{conflictResult.totalNeedsReview}</p>
                        </div>
                      </div>

                      {/* FILTER BUTTONS */}
                      <div className="flex border-b border-gray-100 pb-3 gap-2 overflow-x-auto">
                        <button
                          onClick={() => setConflictFilter("ALL")}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                            conflictFilter === "ALL"
                              ? "bg-slate-900 text-white font-extrabold"
                              : "text-gray-400 hover:text-gray-700 bg-slate-100/50"
                          )}
                        >
                          Semua Kelompok ({conflictResult.groups?.length || 0})
                        </button>
                        <button
                          onClick={() => setConflictFilter("HIGH")}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                            conflictFilter === "HIGH"
                              ? "bg-rose-600 text-white font-extrabold"
                              : "text-rose-500 bg-rose-50 hover:bg-rose-100/50"
                          )}
                        >
                          High Confidence ({conflictResult.groups?.filter((g: any) => g.status === "HIGH CONFIDENCE CONFLICT").length || 0})
                        </button>
                        <button
                          onClick={() => setConflictFilter("STANDARD")}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                            conflictFilter === "STANDARD"
                              ? "bg-orange-600 text-white font-extrabold"
                              : "text-orange-600 bg-orange-50 hover:bg-orange-100/50"
                          )}
                        >
                          Standard Conflict ({conflictResult.groups?.filter((g: any) => g.status === "CONFLICT").length || 0})
                        </button>
                        <button
                          onClick={() => setConflictFilter("REVIEW")}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                            conflictFilter === "REVIEW"
                              ? "bg-amber-600 text-white font-extrabold"
                              : "text-amber-600 bg-amber-50 hover:bg-amber-100/50"
                          )}
                        >
                          Needs Review ({conflictResult.groups?.filter((g: any) => g.status === "NEEDS REVIEW").length || 0})
                        </button>
                      </div>

                      {/* CONFLICT LIST GROUPS */}
                      <div className="space-y-4">
                        {conflictResult.groups?.filter((grp: any) => {
                          if (conflictFilter === "ALL") return true;
                          if (conflictFilter === "HIGH") return grp.status === "HIGH CONFIDENCE CONFLICT";
                          if (conflictFilter === "STANDARD") return grp.status === "CONFLICT";
                          if (conflictFilter === "REVIEW") return grp.status === "NEEDS REVIEW";
                          return true;
                        }).length === 0 ? (
                          <div className="p-12 bg-white text-center rounded-[2.5rem] border border-gray-100 shadow-sm">
                            <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
                            <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider mb-1">Database Bersih</h4>
                            <p className="text-[11px] text-gray-400 font-semibold max-w-sm mx-auto leading-relaxed">
                              Tidak ditemukan record konflik atau nama mirip pada filter unit & status terpilih saat ini. Siswa terstruktur dengan baik.
                            </p>
                          </div>
                        ) : (
                          conflictResult.groups?.filter((grp: any) => {
                            if (conflictFilter === "ALL") return true;
                            if (conflictFilter === "HIGH") return grp.status === "HIGH CONFIDENCE CONFLICT";
                            if (conflictFilter === "STANDARD") return grp.status === "CONFLICT";
                            if (conflictFilter === "REVIEW") return grp.status === "NEEDS REVIEW";
                            return true;
                          }).map((grp: any) => {
                            const isExpanded = expandedConflictId === grp.id;
                            
                            return (
                              <div
                                key={grp.id}
                                className={cn(
                                  "bg-white rounded-[2rem] border overflow-hidden transition-all shadow-sm",
                                  grp.status === "HIGH CONFIDENCE CONFLICT" ? "border-rose-100 hover:border-rose-200" :
                                  grp.status === "CONFLICT" ? "border-orange-100 hover:border-orange-200" :
                                  "border-amber-100 hover:border-amber-200"
                                )}
                              >
                                {/* Group Header Wrapper */}
                                <div
                                  onClick={() => setExpandedConflictId(isExpanded ? null : grp.id)}
                                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/40 select-none"
                                >
                                  <div className="space-y-1.5 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="text-sm font-black text-gray-900 tracking-tight">
                                        {grp.primaryName}
                                      </h3>
                                      <span className={cn(
                                        "px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider",
                                        grp.status === "HIGH CONFIDENCE CONFLICT" ? "bg-rose-100 text-rose-700" :
                                        grp.status === "CONFLICT" ? "bg-orange-100 text-orange-700" :
                                        "bg-amber-100 text-amber-700"
                                      )}>
                                        {grp.status === "HIGH CONFIDENCE CONFLICT" ? "High Confidence" :
                                         grp.status === "CONFLICT" ? "Standard Conflict" : "Needs Review"}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                      <AlertCircle size={12} className={cn(
                                        grp.status === "HIGH CONFIDENCE CONFLICT" ? "text-rose-500" :
                                        grp.status === "CONFLICT" ? "text-orange-500" : "text-amber-500"
                                      )} />
                                      {grp.reason}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-3 self-end md:self-auto">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50 px-2.5 py-1 rounded-xl">
                                      {grp.records?.length || 0} Record Terkait
                                    </span>
                                    <button className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors">
                                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                  </div>
                                </div>

                                {/* Class detail breakdown rows */}
                                {isExpanded && (
                                  <div className="border-t border-gray-55/65 bg-slate-50/20 p-5 space-y-5 animate-in slide-in-from-top-2 duration-200">
                                    {/* Comparative Grid Table */}
                                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                          <thead>
                                            <tr className="border-b border-gray-150/70 text-[10px] font-black text-gray-400 uppercase tracking-wider bg-slate-50/50">
                                              <th className="px-4 py-3">Sumber Record</th>
                                              <th className="px-4 py-3">NIS (Primary ID)</th>
                                              <th className="px-4 py-3">Nama Lengkap</th>
                                              <th className="px-4 py-3">Panggilan</th>
                                              <th className="px-4 py-3">NISN</th>
                                              <th className="px-4 py-3">JK</th>
                                              <th className="px-4 py-3">Kelas</th>
                                              <th className="px-4 py-3">Wali / Ortu</th>
                                              <th className="px-4 py-3">Unit</th>
                                              <th className="px-4 py-3">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-50">
                                            {grp.records?.map((rec: any, idx: number) => (
                                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3.5">
                                                  <span className={cn(
                                                    "px-2.5 py-1 rounded-full text-[9px] font-extrabold tracking-wider uppercase inline-flex items-center gap-1.5",
                                                    rec.source === "students" 
                                                      ? "bg-cyan-50 text-cyan-700 border border-cyan-100" 
                                                      : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                                                  )}>
                                                    {rec.source === "students" ? "Siswa Aktif" : "Undangan"}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3.5 font-mono font-bold text-gray-800">
                                                  {rec.nis || <span className="text-gray-300 italic">-</span>}
                                                </td>
                                                <td className="px-4 py-3.5 font-extrabold text-gray-900">
                                                  {rec.name}
                                                </td>
                                                <td className="px-4 py-3.5 text-gray-500 font-semibold">
                                                  {rec.nickname || "-"}
                                                </td>
                                                <td className="px-4 py-3.5 text-gray-500 font-mono text-[10.5px]">
                                                  {rec.nisn || "-"}
                                                </td>
                                                <td className="px-4 py-3.5 text-gray-500 font-bold text-center">
                                                  {rec.gender === "L" || rec.gender === "LAKI_LAKI" || rec.gender === "MALE" || rec.gender === "Laki-laki" ? "L" : rec.gender === "P" || rec.gender === "PEREMPUAN" || rec.gender === "FEMALE" || rec.gender === "Perempuan" ? "P" : "-"}
                                                </td>
                                                <td className="px-4 py-3.5 font-semibold text-gray-600">
                                                  {rec.classId || <span className="text-gray-300 italic">belum diatur</span>}
                                                </td>
                                                <td className="px-4 py-3.5 text-xs text-gray-500 font-medium">
                                                  <div className="max-w-[170px] truncate" title={rec.parentEmail || rec.fatherName || rec.motherName}>
                                                    {rec.parentEmail || rec.fatherName || rec.motherName ? (
                                                      <span>{rec.parentEmail || `${rec.fatherName || ""}/${rec.motherName || ""}`}</span>
                                                    ) : (
                                                      <span className="text-gray-300 italic">-</span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                  <span className="px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider bg-slate-100 text-slate-700">
                                                    {rec.unitId}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                  <span className={cn(
                                                    "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                                    rec.status === "active" ? "bg-emerald-50 text-emerald-700" :
                                                    rec.status === "ready" ? "bg-blue-50 text-blue-700" :
                                                    rec.status === "used" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"
                                                  )}>
                                                    {rec.status}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    {/* Actionable Analytic Diagnosis */}
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-gray-600 space-y-2 leading-relaxed">
                                      <h4 className="font-black uppercase tracking-wider text-[10px] text-slate-800 flex items-center gap-1">
                                        <Terminal size={12} className="text-slate-500" />
                                        Analisa Diagnostik Konflik Identitas:
                                      </h4>
                                      <div className="space-y-1 font-semibold text-gray-500">
                                        <p>
                                          1. <strong className="text-slate-700">Divergensi Identifier (Secondary Layers):</strong> {grp.records.filter((r: any) => r.nis).length > 0 ? (
                                            <span>
                                              Ditemukan nomor induk berbeda (NIS: {Array.from(new Set(grp.records.map((r: any) => r.nis).filter(Boolean))).join(", ") || "tidak diisi"}).
                                            </span>
                                          ) : (
                                            <span>Semua record dalam kelompok ini memiliki nomor NIS kosong.</span>
                                          )}
                                        </p>
                                        <p>
                                          2. <strong className="text-slate-700">Keselarasan Wali & Ortu (Family Linkage):</strong> {new Set(grp.records.map((r: any) => r.parentEmail?.toLowerCase().trim()).filter(Boolean)).size === 1 ? (
                                            <span className="text-emerald-600">Terindentifikasi wali orang tua yang sama ({grp.records.map((r: any) => r.parentEmail).filter(Boolean)[0]}), mengonfirmasi ini adalah anak yang sama pada collection students vs roleInvites.</span>
                                          ) : (
                                            <span>Email Wali tidak selaras atau belum terdaftar pada salah satu record.</span>
                                          )}
                                        </p>
                                        <p>
                                          3. <strong className="text-slate-700">Rekomendasi Tindakan Admin:</strong> {grp.status === "HIGH CONFIDENCE CONFLICT" ? (
                                            <span>Gunakan tab &quot;Rekonsiliasi ID Siswa&quot; untuk menyelaraskan ID internal pada record anak ini agar data masa lalu (Observation, Attendance) dapat menyatu secara utuh.</span>
                                          ) : grp.status === "CONFLICT" ? (
                                            <span>Verifikasi ke bagian administrasi sekolah apakah anak ini terdaftar ganda (misal akibat mutasi unit atau kesalahan entri internal sekolah).</span>
                                          ) : (
                                            <span>Grup ini memiliki kemiripan nama yang tinggi. Periksa secara manual apakah ada kesalahan penulisan nama ketikan (typo) atau memang dua anak yang berbeda.</span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeMenu === "academic-year" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">
                  Konfigurasi Tahun Ajaran Aktif
                </h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  Atur tahun ajaran dan semester aktif untuk seluruh sistem Lazuardi GCS.
                </p>
              </div>

              <div className="max-w-3xl bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">
                    Tahun Ajaran Aktif Saat Ini
                  </p>
                  <div className="flex items-center gap-3 bg-blue-50/50 p-4 rounded-2xl border border-blue-50">
                    <ShieldCheck size={20} className="text-blue-600" />
                    <span className="text-sm font-bold text-gray-800">
                      Tahun ajaran aktif saat ini: <span className="text-blue-700">{activeYear}</span> Semester {activeSemester}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">
                      PILIH TAHUN AJARAN
                    </label>
                    <select
                      value={tempYear}
                      onChange={(e) => setTempYear(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-xs font-bold"
                    >
                      <option value="2024/2025">2024/2025</option>
                      <option value="2025/2026">2025/2026</option>
                      <option value="2026/2027">2026/2027</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">
                      PILIH SEMESTER
                    </label>
                    <select
                      value={tempSemester}
                      onChange={(e) => setTempSemester(Number(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-xs font-bold"
                    >
                      <option value={1}>Semester 1</option>
                      <option value={2}>Semester 2</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-4 border-t border-gray-50">
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    className="px-8 py-3.5 bg-gray-900 text-white hover:bg-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-sm"
                  >
                    <RefreshCw size={14} />
                    Simpan & Aktifkan
                  </button>
                </div>
              </div>

              {/* Modal Konfirmasi */}
              {showConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/35 backdrop-blur-sm">
                  <div className="bg-white p-8 rounded-[2rem] border border-gray-100 max-w-md w-full shadow-2xl relative space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-red-50 text-red-650 rounded-2xl shrink-0">
                        <AlertCircle size={24} className="text-red-600" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tight italic">
                          Konfirmasi Perubahan
                        </h3>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          Mengubah tahun ajaran aktif akan mempengaruhi tampilan data di seluruh aplikasi. Lanjutkan?
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl space-y-1.5 text-[11px] text-gray-600 border border-gray-100">
                      <div>
                        <strong>Tahun Ajaran Baru:</strong> {tempYear}
                      </div>
                      <div>
                        <strong>Semester Baru:</strong> {tempSemester}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 justify-end text-[10px] font-black">
                      <button
                        onClick={() => setShowConfirmModal(false)}
                        className="px-5 py-2.5 hover:bg-gray-100 rounded-xl text-gray-500 uppercase tracking-wider"
                      >
                        Batal
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            setIsSavingYear(true);
                            await updateAcademicYear(tempYear, tempSemester);
                            setShowConfirmModal(false);
                            alert("Tahun ajaran berhasil diperbarui secara global!");
                          } catch (err) {
                            console.error(err);
                            alert("Gagal mengupdate tahun ajaran aktif.");
                          } finally {
                            setIsSavingYear(false);
                          }
                        }}
                        disabled={isSavingYear}
                        className="px-6 py-2.5 bg-red-600 text-white rounded-xl uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      >
                        {isSavingYear ? "Menyimpan..." : "Ya, Lanjutkan"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Modal Undangan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-8 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 tracking-tight italic">
                {editingId ? "Edit Undangan" : "Undang Manual"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900"
              >
                <XCircle size={24} strokeWidth={1.5} />
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdate} className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Nama{" "}
                    {formData.role === "STUDENT" ? "Lengkap" : "(Email prefix)"}
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                    placeholder={
                      formData.role === "STUDENT"
                        ? "Nama Lengkap Siswa"
                        : "Nama"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Email {formData.role === "STUDENT" ? "Siswa" : "(Username)"}
                  </label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      const newEmail = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        email: newEmail,
                        name: prev.name || newEmail.split("@")[0],
                      }));
                    }}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                    placeholder="email@lazuardi.sch.id"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Peran (Role)
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        role: e.target.value as UserRole,
                      })
                    }
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="TEACHER">TEACHER</option>
                    <option value="HEAD_UNIT">HEAD_UNIT</option>
                    <option value="HEAD_JUNIOR">HEAD_JUNIOR</option>
                    <option value="BK_MENTOR">BK_MENTOR</option>
                    <option value="STUDENT">STUDENT</option>
                    <option value="PARENT">PARENT</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Unit
                  </label>
                  <select
                    value={formData.unitId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        unitId: e.target.value as UnitType,
                      })
                    }
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="KINDERGARTEN">KINDERGARTEN</option>
                    <option value="ELEMENTARY">ELEMENTARY</option>
                    <option value="JUNIOR_HIGH">JUNIOR_HIGH</option>
                  </select>
                </div>
              </div>

              {formData.role === "STUDENT" ? (
                <div className="space-y-6">
                  {/* Dynamic Academic Year and Class List */}
                  <div className="space-y-4 bg-slate-50/50 p-5 rounded-3xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                        Daftar Kelas & Tahun Ajaran
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setStudentEnrollments((prev) => [
                            ...prev,
                            { academicYear: "2025/2026", classId: "" },
                          ]);
                        }}
                        className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={12} /> Tambah Tahun Ajaran
                      </button>
                    </div>

                    {studentEnrollments.map((enrollment, index) => (
                      <div key={index} className="flex items-end gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative">
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Tahun Ajaran
                          </label>
                          <input
                            required
                            type="text"
                            value={enrollment.academicYear}
                            onChange={(e) => {
                              const newYear = e.target.value;
                              setStudentEnrollments((prev) => {
                                const next = [...prev];
                                next[index] = { ...next[index], academicYear: newYear };
                                return next;
                              });
                            }}
                            className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl text-xs italic font-medium focus:ring-2 focus:ring-blue-100"
                            placeholder="2025/2026"
                          />
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Pilih Kelas
                          </label>
                          <select
                            required
                            value={enrollment.classId}
                            onChange={(e) => {
                              const newClass = e.target.value;
                              setStudentEnrollments((prev) => {
                                const next = [...prev];
                                next[index] = { ...next[index], classId: newClass };
                                return next;
                              });
                            }}
                            className="w-full px-4 py-2.5 bg-gray-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-100"
                          >
                            <option value="">Pilih Kelas</option>
                            {classes
                              .filter((c) => c.unitId === formData.unitId)
                              .map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        {studentEnrollments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setStudentEnrollments((prev) => prev.filter((_, idx) => idx !== index));
                            }}
                            className="p-2.5 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        NIS (Lumina ID)
                      </label>
                      <input
                        type="text"
                        value={formData.luminaId}
                        onChange={(e) =>
                          setFormData({ ...formData, luminaId: e.target.value })
                        }
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. 2025001"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        NIS Lama (Old Lumina ID) / Opsional
                      </label>
                      <input
                        type="text"
                        value={formData.oldLuminaId || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, oldLuminaId: e.target.value })
                        }
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. LMN-178..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        NISN
                      </label>
                      <input
                        type="text"
                        value={formData.nisn}
                        onChange={(e) =>
                          setFormData({ ...formData, nisn: e.target.value })
                        }
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                        placeholder="e.g. 0123456789"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Nama Panggilan
                      </label>
                      <input
                        type="text"
                        value={formData.nickname}
                        onChange={(e) =>
                          setFormData({ ...formData, nickname: e.target.value })
                        }
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                        placeholder="Panggilan"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Jenis Kelamin
                      </label>
                      <select
                        value={formData.gender}
                        onChange={(e) =>
                          setFormData({ ...formData, gender: e.target.value })
                        }
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Pilih</option>
                        <option value="L">LAKI-LAKI (L)</option>
                        <option value="P">PEREMPUAN (P)</option>
                      </select>
                    </div>
                    <div className="space-y-2 opacity-0 select-none">
                      {/* Spacer to keep beautiful alignment */}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-6 -mt-4 pb-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          Nama Ayah
                        </label>
                        <input
                          type="text"
                          value={formData.fatherName || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              fatherName: e.target.value,
                            })
                          }
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                          placeholder="Nama Ayah"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          Nama Ibu
                        </label>
                        <input
                          type="text"
                          value={formData.motherName || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              motherName: e.target.value,
                            })
                          }
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                          placeholder="Nama Ibu"
                        />
                      </div>
                    </div>
                    <label
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest ml-1 transition-all",
                        !formData.fatherName && !formData.motherName
                          ? "text-gray-300"
                          : "text-gray-400",
                      )}
                    >
                      Email Orang Tua{" "}
                      {!formData.fatherName &&
                        !formData.motherName &&
                        "(Isi nama ortu dulu)"}
                    </label>
                    <input
                      type="email"
                      disabled={!formData.fatherName && !formData.motherName}
                      value={formData.parentEmail}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentEmail: e.target.value,
                        })
                      }
                      className={cn(
                        "w-full px-5 py-4 border-none rounded-2xl text-sm italic font-medium focus:ring-2 transition-all",
                        !formData.fatherName && !formData.motherName
                          ? "bg-gray-50 opacity-50 cursor-not-allowed"
                          : "bg-gray-50 focus:ring-blue-100",
                      )}
                      placeholder="ortu@gmail.com"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {formData.role === "PARENT" ? (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        IDs Anak (comma separated)
                      </label>
                      <input
                        type="text"
                        value={formData.linkedStudents?.join(",")}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            linkedStudents: e.target.value
                              .split(",")
                              .map((s) => s.trim()),
                          })
                        }
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                        placeholder="ID1, ID2"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Jabatan / Kelas
                      </label>
                      <select
                        value={formData.jobTitle}
                        onChange={(e) =>
                          setFormData({ ...formData, jobTitle: e.target.value })
                        }
                        className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Pilih Kelas (Opsional)</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-4 bg-[#002366] text-white rounded-2xl font-bold flex items-center justify-center gap-2"
                >
                  {formLoading && (
                    <Loader2 size={18} className="animate-spin" />
                  )}
                  {editingId ? "Update" : "Terbitkan"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal Tambah/Edit Kelas */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setIsClassModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-8 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 tracking-tight italic">
                {editingId ? "Edit Kelas" : "Tambah Kelas Baru"}
              </h2>
              <button
                onClick={() => setIsClassModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900"
              >
                <XCircle size={24} strokeWidth={1.5} />
              </button>
            </div>

            <form
              onSubmit={handleCreateOrUpdateClass}
              className="p-8 space-y-6 overflow-y-auto flex-1"
            >
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Grade
                  </label>
                  <select
                    required
                    value={classFormData.grade}
                    onChange={(e) =>
                      setClassFormData({
                        ...classFormData,
                        grade: e.target.value,
                      })
                    }
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  >
                    {getGradeOptions(classFormData.unitId).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Nama Unik (e.g. Baiji)
                  </label>
                  <input
                    required
                    type="text"
                    value={classFormData.className}
                    onChange={(e) =>
                      setClassFormData({
                        ...classFormData,
                        className: e.target.value,
                      })
                    }
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                    placeholder="Contoh: Baiji"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                  Review Nama Kelas:
                </span>
                <span className="font-black text-blue-700 italic">
                  {classFormData.grade} {classFormData.className || "..."}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Tahun Ajaran
                  </label>
                  <select
                    required
                    value={classFormData.academicYear}
                    onChange={(e) =>
                      setClassFormData({
                        ...classFormData,
                        academicYear: e.target.value,
                      })
                    }
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="2025/2026">2025/2026</option>
                    <option value="2026/2027">2026/2027</option>
                    <option value="2027/2028">2027/2028</option>
                    <option value="2028/2029">2028/2029</option>
                    <option value="2029/2030">2029/2030</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Unit
                  </label>
                  <select
                    value={classFormData.unitId}
                    onChange={(e) => {
                      const newUnit = e.target.value as UnitType;
                      setClassFormData({
                        ...classFormData,
                        unitId: newUnit,
                        grade: getGradeOptions(newUnit)[0],
                      });
                    }}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="KINDERGARTEN">KINDERGARTEN (Pra TK, TK A, TK B)</option>
                    <option value="ELEMENTARY">ELEMENTARY (Kelas 1-6)</option>
                    <option value="JUNIOR_HIGH">JUNIOR_HIGH (Kelas 7-9)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Wali Kelas
                </label>
                <select
                  value={classFormData.homeroomTeacherId}
                  onChange={(e) =>
                    setClassFormData({
                      ...classFormData,
                      homeroomTeacherId: e.target.value,
                    })
                  }
                  className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Pilih Wali Kelas</option>
                  {teachers.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      {t.displayName} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Tanda Tangan Digital Guru (Per Kelas)
                </label>
                
                {classFormData.teacherSignatureUrl ? (
                  <div className="relative border border-gray-150 rounded-2xl p-4 flex flex-col items-center bg-gray-50/50 group/sig">
                    <img
                      src={classFormData.teacherSignatureUrl}
                      alt="Tanda Tangan Guru"
                      className="max-h-24 object-contain mb-2 mix-blend-multiply bg-white rounded-lg p-2 shadow-sm border border-gray-100"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex gap-2">
                      <label className="px-3 py-1.5 bg-white text-gray-700 text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-sm border border-gray-200 hover:text-blue-600 hover:border-blue-300 cursor-pointer transition-all">
                        Ganti TTD
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (!file.type.startsWith("image/")) {
                                alert("Harap pilih file gambar!");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = (re) => {
                                const img = new Image();
                                img.onload = () => {
                                  const canvas = document.createElement("canvas");
                                  const ctx = canvas.getContext("2d");
                                  if (ctx) {
                                    canvas.width = 300;
                                    canvas.height = 150;
                                    ctx.fillStyle = "transparent";
                                    ctx.fillRect(0, 0, 300, 150);
                                    ctx.drawImage(img, 0, 0, 300, 150);
                                    const compressed = canvas.toDataURL("image/png");
                                    setClassFormData(prev => ({ ...prev, teacherSignatureUrl: compressed }));
                                  }
                                };
                                img.src = re.target?.result as string;
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setClassFormData(prev => ({ ...prev, teacherSignatureUrl: "" }))}
                        className="px-3 py-1.5 bg-white text-red-600 text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-sm border border-gray-200 hover:bg-red-50 hover:text-red-700 hover:border-red-100 transition-all"
                      >
                        Hapus TTD
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/10 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group/sig">
                    <Upload size={20} className="text-gray-300 group-hover/sig:text-blue-500 transition-colors mb-2" />
                    <span className="text-[10px] font-bold text-gray-500 group-hover/sig:text-blue-600 transition-colors">
                      Klik untuk Unggah Tanda Tangan Guru
                    </span>
                    <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                      Format landscape (PNG/JPG)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (!file.type.startsWith("image/")) {
                            alert("Harap pilih file gambar!");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (re) => {
                            const img = new Image();
                            img.onload = () => {
                              const canvas = document.createElement("canvas");
                              const ctx = canvas.getContext("2d");
                              if (ctx) {
                                canvas.width = 300;
                                canvas.height = 150;
                                ctx.fillStyle = "transparent";
                                ctx.fillRect(0, 0, 300, 150);
                                ctx.drawImage(img, 0, 0, 300, 150);
                                const compressed = canvas.toDataURL("image/png");
                                setClassFormData(prev => ({ ...prev, teacherSignatureUrl: compressed }));
                              }
                            };
                            img.src = re.target?.result as string;
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-4 bg-[#002366] text-white rounded-2xl font-bold flex items-center justify-center gap-2"
                >
                  {formLoading && (
                    <Loader2 size={18} className="animate-spin" />
                  )}
                  Simpan Kelas
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal Konfirmasi Impor */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            onClick={() => setIsImportModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 p-10 text-center space-y-6"
          >
            <div className="w-20 h-20 bg-blue-50 rounded-3xl mx-auto flex items-center justify-center text-blue-600">
              <Mail size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight italic">
                Konfirmasi Impor
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Mulai proses impor massal <b>{importMode}</b> dari Google
                Sheets?
                {importMode === "STUDENT" && (
                  <span className="block mt-2 text-[10px] text-blue-500 font-bold uppercase tracking-tight">
                    * Pastikan sheet menyertakan kolom: luminaId, classId, dan academicYear.
                  </span>
                )}
              </p>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-left space-y-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Target Sheet
                </p>
                <p className="text-xs font-bold text-blue-600">
                  {importMode === "STAFF"
                    ? "GuruLumina"
                    : importMode === "STUDENT"
                      ? "SiswaLumina"
                      : "OrtuLumina"}
                </p>
              </div>
            </div>
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest"
              >
                Batal
              </button>
              <button
                onClick={handleImport}
                disabled={importLoading}
                className="flex-1 py-4 bg-[#002366] text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
              >
                {importLoading && (
                  <Loader2 size={18} className="animate-spin" />
                )}
                Mulai Impor
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Tambah/Edit Prompt Template */}
      {isPromptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="prompt-form-modal">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setIsPromptModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-8 border-b border-gray-150 flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 tracking-tight italic flex items-center gap-2">
                <Sparkles className="text-blue-600 animate-pulse" size={20} />
                {selectedPrompt ? "Edit Template Prompt" : "Tambah Template Prompt Baru"}
              </h2>
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 cursor-pointer"
              >
                <XCircle size={24} strokeWidth={1.5} />
              </button>
            </div>

            <form
              onSubmit={handleSavePrompt}
              className="p-8 space-y-5 overflow-y-auto flex-1 text-left"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    System Key (Code Name / Unique Key)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!selectedPrompt}
                    placeholder="contoh: kindergarten_weekly_report"
                    value={promptFormData.key}
                    onChange={(e) => setPromptFormData({ ...promptFormData, key: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 disabled:opacity-50 disabled:bg-gray-100"
                  />
                  {!selectedPrompt && (
                    <p className="text-[9px] text-gray-400 italic ml-1">
                      * Gunakan format snake_case (huruf kecil & underscore). Tidak boleh ada spasi atau simbol khusus.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Display Name (Nama Tampilan)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: Weekly Report - Kindergarten"
                    value={promptFormData.name}
                    onChange={(e) => setPromptFormData({ ...promptFormData, name: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    School Unit (Unit Sekolah)
                  </label>
                  <select
                    value={promptFormData.unit}
                    onChange={(e) => setPromptFormData({ ...promptFormData, unit: e.target.value as any })}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  >
                    <option value="ALL">ALL (Semua Unit)</option>
                    <option value="KINDERGARTEN">KINDERGARTEN (TK)</option>
                    <option value="ELEMENTARY">ELEMENTARY (SD)</option>
                    <option value="JUNIOR_HIGH">JUNIOR HIGH (SMP)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Category (Kategori)
                  </label>
                  <select
                    value={promptFormData.category}
                    onChange={(e) => setPromptFormData({ ...promptFormData, category: e.target.value as any })}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  >
                    <option value="report">Report (Rapor & Komentar)</option>
                    <option value="chat">Chat (Lumina Chat)</option>
                    <option value="analysis">Analysis (Asesmen & Data)</option>
                    <option value="notification">Notification (Notifikasi Ortu)</option>
                  </select>
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Description (Deskripsi Singkat Kegunaan)
                  </label>
                  <input
                    type="text"
                    placeholder="Masukkan kegunaan prompt ini..."
                    value={promptFormData.description}
                    onChange={(e) => setPromptFormData({ ...promptFormData, description: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      System Prompt (Teks Instruksi AI)
                    </label>
                    <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                      Auto-Detect Variables
                    </span>
                  </div>
                  <textarea
                    required
                    rows={8}
                    placeholder="Tulis instruksi system prompt di sini... Gunakan Double Braces {{variableName}} untuk menandai variabel dinamis. Contoh: 'Sajikan evaluasi mingguan untuk siswa bernama {{studentName}}.'"
                    value={promptFormData.prompt}
                    onChange={(e) => setPromptFormData({ ...promptFormData, prompt: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-150 font-mono text-xs rounded-2xl focus:ring-2 focus:ring-blue-100 whitespace-pre-wrap leading-relaxed outline-none"
                  />
                </div>

                <div className="col-span-2 bg-blue-50/30 p-4 rounded-2xl border border-blue-100/50 space-y-1">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">
                    Variabel Terdeteksi Saat Ini:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {detectVariables(promptFormData.prompt).length > 0 ? (
                      detectVariables(promptFormData.prompt).map((v) => (
                        <span key={v} className="bg-blue-100 text-blue-700 font-mono text-[10px] px-2 py-0.5 rounded border border-blue-200">
                          {`{{${v}}}`}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">
                        Belum ada variabel terdeteksi. Gunakan pola {"{{nama_variabel}}"} pada teks prompt di atas.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Status Aktif
                  </label>
                  <button
                    type="button"
                    onClick={() => setPromptFormData({ ...promptFormData, isActive: !promptFormData.isActive })}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-colors relative inline-flex items-center",
                      promptFormData.isActive ? "bg-emerald-500" : "bg-gray-200"
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200",
                      promptFormData.isActive ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPromptModalOpen(false)}
                  className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-4 bg-[#002366] hover:bg-blue-900 transition-colors text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-100 cursor-pointer"
                >
                  {formLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Simpan Template
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal Test Prompt Template */}
      {isTestModalOpen && selectedPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="test-prompt-modal">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setIsTestModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[95vh]"
          >
            <div className="p-8 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight italic flex items-center gap-2">
                  <Play size={18} className="text-emerald-500" />
                  KONSOL UJI PROMPT (PROMPT TEST CONSOLE)
                </h2>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mt-1">
                  Uji output AI langsung dengan live data menggunakan model <span className="text-emerald-600">Gemini 2.5 Flash</span>
                </p>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 cursor-pointer"
              >
                <XCircle size={24} strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              <div className="space-y-5">
                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-1">
                    Informasi Template
                  </p>
                  <p className="text-sm font-bold text-gray-800">{selectedPrompt.name}</p>
                  <p className="font-mono text-[9px] text-gray-500 bg-gray-200/50 px-2 py-0.5 rounded w-fit font-bold">{selectedPrompt.key}</p>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Input Variabel Uji
                  </p>
                  
                  {Object.keys(testVariables).length === 0 ? (
                    <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded-xl">
                      Template ini tidak memiliki variabel. Anda bisa langsung menjalankan test.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {Object.keys(testVariables).map((v) => (
                        <div key={v} className="space-y-1.5">
                          <label className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wide">
                            {`{{${v}}}`}
                          </label>
                          <textarea
                            rows={selectedPrompt.key.includes("report") ? 4 : 2}
                            placeholder={`Masukkan contoh isi nilai untuk variabel ${v}...`}
                            value={testVariables[v]}
                            onChange={(e) => setTestVariables({ ...testVariables, [v]: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-150 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-105 outline-none leading-relaxed"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRunPromptTest}
                  disabled={isTestingPrompt}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-emerald-100 cursor-pointer"
                >
                  {isTestingPrompt ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Memproses Evaluasi Gemini...
                    </>
                  ) : (
                    <>
                      <Play size={14} fill="currentColor" />
                      Jalankan Tes Prompt
                    </>
                  )}
                </button>
              </div>

              {/* Live result column */}
              <div className="flex flex-col h-full space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Output Hasil Simulasi AI
                </p>
                <div className="flex-1 bg-gray-900 text-gray-100 p-6 rounded-[2rem] font-mono text-xs overflow-y-auto min-h-[300px] border border-gray-805 shadow-inner relative whitespace-pre-wrap leading-relaxed select-text">
                  {isTestingPrompt && (
                    <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-[1px] flex flex-col items-center justify-center text-center space-y-3">
                      <Sparkles size={24} className="text-emerald-400 animate-spin" />
                      <p className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                        Running Generation...
                      </p>
                    </div>
                  )}

                  {testResult ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-[10px] text-gray-500 uppercase font-black tracking-widest border-b border-gray-800 pb-2">
                        <span>Response</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(testResult);
                            alert("Teks simulasi berhasil dicopas! 📋");
                          }}
                          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded uppercase font-bold text-[8px] cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-gray-200 select-text font-sans text-xs leading-relaxed whitespace-pre-wrap">{testResult}</p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-10">
                      <Terminal size={28} className="mb-2 text-gray-600" />
                      <p className="text-[10px] font-bold uppercase tracking-wider">Awaiting Execution</p>
                      <p className="text-[9px] mt-1 text-gray-400 max-w-xs leading-normal">
                        Nilai variabel di sebelah kiri akan disubstitusikan ke dalam templates, kemudian dikirim langsung ke Gemini. Hasil output akan dicetak di sini.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="px-8 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
              >
                Tutup Konsol
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Warning Penghapusan Kelas */}
      {isDeleteClassConfirmOpen && classToDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            onClick={() => {
              setIsDeleteClassConfirmOpen(false);
              setClassToDeleteId(null);
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 p-10 text-center space-y-6"
          >
            <div className="w-20 h-20 bg-rose-50 rounded-3xl mx-auto flex items-center justify-center text-rose-600 shadow-md">
              <AlertTriangle size={40} />
            </div>
            
            <div className="space-y-3">
              <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-[10.5px] font-black rounded-full uppercase tracking-wider">
                Peringatan Penting
              </span>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">
                Hapus Kelas {classes.find(c => c.id === classToDeleteId)?.name || ""}?
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed font-semibold">
                Tindakan ini tidak dapat dibatalkan secara otomatis dari database sistem.
              </p>
              
              <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 text-left space-y-2.5">
                <span className="text-[9.5px] font-black text-rose-955 uppercase tracking-widest block">
                  Konsekuensi & Dampak:
                </span>
                <ul className="text-[10.5px] text-rose-900 font-bold list-disc pl-4 space-y-1">
                  <li>Data akun siswa yang terdaftar di kelas <strong className="font-extrabold">tidak akan dihapus</strong>.</li>
                  <li>Namun, referensi kelas pada riwayat akademik atau rapor siswa tersebut akan terputus.</li>
                  <li>Nama kelas ini tidak lagi muncul di menu filter wali atau bimbingan guru.</li>
                </ul>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteClassConfirmOpen(false);
                  setClassToDeleteId(null);
                }}
                className="flex-1 py-4 text-xs font-black text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-2xl transition uppercase tracking-widest"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteClass}
                className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-100 transition active:scale-97 text-xs uppercase tracking-widest"
              >
                <Trash2 size={16} /> Ya, Hapus
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
