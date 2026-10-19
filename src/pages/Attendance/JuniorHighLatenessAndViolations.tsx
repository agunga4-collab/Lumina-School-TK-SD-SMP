import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, AlertCircle, Calendar, Search, Save, History, TrendingUp, 
  Loader2, Trash2, Check, X, Edit2, ClipboardList, BarChart3, 
  User, BookOpen, ArrowUpRight, ShieldAlert, Filter, CheckCircle2, 
  Info, Settings, Plus, LayoutDashboard, ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { db, getActiveStudents } from '../../lib/firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, getDoc,
  serverTimestamp, deleteDoc, onSnapshot, updateDoc, addDoc 
} from 'firebase/firestore';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { UnitType } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Default reasons for lateness
const JUNIOR_HIGH_REASONS = [
  'Macet',
  'Bangun kesiangan',
  'Menunggu anggota keluarga',
  'Sakit perut',
  'Hujan'
];

export interface ViolationChoice {
  code: string;
  label: string;
  helperText?: string;
}

export interface ViolationCategory {
  id: string;
  label: string;
  violations: ViolationChoice[];
}

export const JUNIOR_HIGH_VIOLATIONS_MASTER: ViolationCategory[] = [
  {
    id: 'berpakaian',
    label: 'Tata Tertib Berpakaian',
    violations: [
      { code: 'A01', label: 'Baju tidak sesuai aturan', helperText: 'Termasuk baju tidak dimasukkan, lengan baju digulung, tidak mengancingkan lengan baju, membuka lebih dari satu kancing, kaos dalam tidak sesuai ketentuan, tidak memakai kaos kaki putih, atau tidak memakai ikat pinggang hitam.' },
      { code: 'A02', label: 'Pakaian dicorat-coret/ditempel selain logo sekolah' },
      { code: 'A03', label: 'Aksesori atau penampilan tidak pantas', helperText: 'Contoh: anting, cincin, gelang, pin, make up berlebihan, soft lens berwarna, atau topi selain topi sekolah.' },
      { code: 'A04', label: 'Sepatu bagian tumit dilipat/dinjak' },
      { code: 'A05', label: 'Celana diinjak-injak' },
      { code: 'A06', label: 'Rambut belakang menjuntai melewati jilbab' },
      { code: 'A07', label: 'Tidak memakai celana lapis/boxer' },
      { code: 'A08', label: 'Rambut siswa laki-laki melewati kerah atau telinga' },
      { code: 'A09', label: 'Tidak memakai seragam' },
      { code: 'A10', label: 'Memakai celana atau rok ketat' },
      { code: 'A11', label: 'Celana melorot hingga pakaian dalam terlihat' },
      { code: 'A12', label: 'Memakai sandal keluar kelas tanpa keperluan yang diizinkan', helperText: 'Termasuk memakai sandal ke kantin atau gedung lain, kecuali waktu salat.' },
      { code: 'A13', label: 'Tidak memakai kaos kaki' },
      { code: 'A14', label: 'Tidak memakai sepatu hitam' },
      { code: 'A15', label: 'Memakai sandal atau sepatu sandal' },
      { code: 'A16', label: 'Pakaian hari Rabu tidak sesuai ketentuan', helperText: 'Hari Rabu wajib baju muslim bebas rapi atau kemeja. T-shirt dan polo shirt tidak diperkenankan.' },
      { code: 'A17', label: 'Mengecat rambut' }
    ]
  },
  {
    id: 'belajar',
    label: 'Tata Tertib Belajar',
    violations: [
      { code: 'B01', label: 'Makan/minum di kelas saat belajar tanpa izin' },
      { code: 'B02', label: 'Menaruh perlengkapan pribadi sembarangan' },
      { code: 'B03', label: 'Melakukan kegiatan yang tidak berhubungan dengan pelajaran' },
      { code: 'B04', label: 'Berjualan di dalam kelas selain program JA' },
      { code: 'B05', label: 'Membawa mainan ke sekolah tanpa izin' },
      { code: 'B06', label: 'Terlambat mengikuti kegiatan atau belajar tanpa izin', helperText: 'Termasuk terlambat mengikuti kegiatan lain/belajar setelah toleransi atau jeda pergantian 3 menit.' },
      { code: 'B07', label: 'Izin keluar kelas lebih dari 3 kali' },
      { code: 'B08', label: 'Tidak menyelesaikan tugas tepat waktu' },
      { code: 'B09', label: 'Tidak merapikan meja saat pergantian pelajaran' },
      { code: 'B10', label: 'Mengerjakan PR di sekolah' },
      { code: 'B11', label: 'Meninggalkan kelas atau pelajaran tanpa izin' },
      { code: 'B12', label: 'Tidur saat belajar' },
      { code: 'B13', label: 'Mengganggu proses belajar mengajar', helperText: 'Contoh: mengobrol atau bercanda berlebihan hingga mengganggu pembelajaran.' },
      { code: 'B14', label: 'Mengerjakan pelajaran lain pada waktu belajar tanpa izin' },
      { code: 'B15', label: 'Memakai barang orang lain tanpa izin' },
      { code: 'B16', label: 'Merusak barang orang lain' },
      { code: 'B17', label: 'Tidak membawa buku agenda, penghubung, atau pelajaran' },
      { code: 'B18', label: 'Menyembunyikan barang milik orang lain' },
      { code: 'B19', label: 'Tidak mengerjakan tugas, PR, atau projek' },
      { code: 'B20', label: 'Menyontek atau memberikan kunci jawaban saat ujian' },
      { code: 'B21', label: 'Membawa HP selama mengikuti kegiatan sekolah', helperText: 'HP tidak diperkenankan di luar maupun di dalam area sekolah selama siswa mengikuti kegiatan sekolah.' }
    ]
  },
  {
    id: 'kebersihan',
    label: 'Tata Tertib Kebersihan',
    violations: [
      { code: 'C01', label: 'Kuku panjang atau kotor' },
      { code: 'C02', label: 'Tidak meletakkan shower toilet pada tempatnya' },
      { code: 'C03', label: 'Tidak memakai sandal ke toilet saat wudhu' },
      { code: 'C04', label: 'Membiarkan sisa makanan berceceran' },
      { code: 'C05', label: 'Meletakkan tempat makan catering sembarangan', helperText: 'Tempat makan catering harus diletakkan di box depan kelas.' },
      { code: 'C06', label: 'Membuang sampah tidak pada tempatnya' },
      { code: 'C07', label: 'Tidak merapikan loker dan laci' },
      { code: 'C08', label: 'Tidak menyiram toilet setelah digunakan' },
      { code: 'C09', label: 'Corat-coret fasilitas atau lingkungan sekolah' }
    ]
  },
  {
    id: 'kehadiran',
    label: 'Kehadiran & Izin',
    violations: [
      { code: 'D01', label: 'Tidak hadir tanpa pemberitahuan' },
      { code: 'D02', label: 'Pulang tanpa izin saat ada kegiatan sekolah' }
    ]
  },
  {
    id: 'kantin',
    label: 'Tata Tertib Kantin',
    violations: [
      { code: 'E01', label: 'Makan atau minum sambil berjalan' },
      { code: 'E02', label: 'Mengambil/mengganggu teman yang sedang makan/minum' },
      { code: 'E03', label: 'Meminta atau mengambil makanan dengan paksa' },
      { code: 'E04', label: 'Menyerobot antrean' },
      { code: 'E05', label: 'Tidak membersihkan bekas makan/minum pribadi di kantin' },
      { code: 'E06', label: 'Memakan catering orang lain tanpa izin' }
    ]
  },
  {
    id: 'other',
    label: 'Lainnya / Tulis Manual',
    violations: []
  }
];

// Helper to get JKT current time
const getCurrentTimeStr = () => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return formatter.format(new Date());
};

// Helper to get JKT current date in YYYY-MM-DD
const getCurrentDateStr = () => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
};

const getFormattedDateLong = (dateStr: any) => {
  if (typeof dateStr !== 'string' || !dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const [year, month, day] = parts.map(Number);
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

class InterventionErrorBoundary extends React.Component<any, any> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Dukungan Guru Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="p-8 bg-red-50/50 rounded-3xl border border-red-100 text-center max-w-lg mx-auto my-12 space-y-4 relative z-10 bg-white shadow-xl">
          <p className="text-sm font-black text-red-600">
            Dukungan Guru tidak dapat dimuat.
          </p>
          <p className="text-xs text-gray-500 font-bold leading-normal">
            Terdapat ketidakcocokan data atau kesalahan tak terduga dalam catatan kejadian siswa. Silakan tutup sesi untuk memulihkan halaman.
          </p>
          <button
            type="button"
            onClick={() => {
              (this as any).setState({ hasError: false });
              (this as any).props.onReset();
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
          >
            Tutup & Coba Lagi
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

const getInitials = (name: string) => {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const getLatenessMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  const mins = h * 60 + m;
  const limitMin = 7 * 60 + 30; // 07:30
  return Math.max(0, mins - limitMin);
};

export default function JuniorHighLatenessAndViolations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParamsState] = useSearchParams();
  const { activeUnit } = useOutletContext<{ activeUnit: UnitType }>();
  const { activeYear, activeSemester } = useAcademicYear();
  const { profile } = useAuth();

  // Role permissions
  const currentUserRole = profile?.role || 'GUEST';
  const isStudentOrParent = ['STUDENT', 'PARENT'].includes(currentUserRole);

  // Active Tab: 'lateness' | 'violations' | 'rekap'
  const [activeTab, setActiveTab] = React.useState<'lateness' | 'violations' | 'rekap'>('lateness');

  // Master Data State
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<any[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const loadingMetadata = loadingClasses;

  // Common selected date & class
  const [selectedClassId, setSelectedClassId] = React.useState<string>(searchParams.get('classId') || '');

  // ----------------------------------------------------
  // TAB 1: KETERLAMBATAN (Tardiness existing)
  // ----------------------------------------------------
  const [latenessRecords, setLatenessRecords] = React.useState<any[]>([]);
  const [latenessClassStudents, setLatenessClassStudents] = React.useState<any[]>([]);
  const [latenessTodaySaved, setLatenessTodaySaved] = React.useState<any[]>([]);
  const [latenessDate, setLatenessDate] = React.useState<string>(getCurrentDateStr());
  const [latenessSearch, setLatenessSearch] = React.useState('');
  const [savingLateness, setSavingLateness] = React.useState(false);
  const [loadingLateness, setLoadingLateness] = React.useState(false);
  const [loadingTodayLateness, setLoadingTodayLateness] = React.useState(false);
  const [highlightedStudentId, setHighlightedStudentId] = React.useState<string | null>(null);
  
  // Custom reasons for current unsaved entries
  const [latenessCustomReasons, setLatenessCustomReasons] = React.useState<Record<string, boolean>>({});

  // Inline edit states for saved lateness
  const [editingLatenessId, setEditingLatenessId] = React.useState<string | null>(null);
  const [editingLatenessReason, setEditingLatenessReason] = React.useState('');
  const [editingLatenessTime, setEditingLatenessTime] = React.useState('');
  const [editingLatenessCustom, setEditingLatenessCustom] = React.useState(false);
  const [updatingLatenessId, setUpdatingLatenessId] = React.useState<string | null>(null);

  // Stats
  const [mostFrequentDay, setMostFrequentDay] = React.useState('-');
  const [avgLateMinutes, setAvgLateMinutes] = React.useState('-');

  // ----------------------------------------------------
  // TAB 2: PELANGGARAN RINGAN
  // ----------------------------------------------------
  const [violationDate, setViolationDate] = React.useState<string>(getCurrentDateStr());
  const [selectedViolationStudentId, setSelectedViolationStudentId] = React.useState('');
  const [violationType, setViolationType] = React.useState('');
  const [selectedViolationCategory, setSelectedViolationCategory] = React.useState('');
  const [selectedViolationCode, setSelectedViolationCode] = React.useState('');
  const [customViolationText, setCustomViolationText] = React.useState('');
  const [violationNotes, setViolationNotes] = React.useState('');
  const [savingViolation, setSavingViolation] = React.useState(false);
  const [loadingTodayViolations, setLoadingTodayViolations] = React.useState(false);
  const [todayViolations, setTodayViolations] = React.useState<any[]>([]);
  const [violationSearch, setViolationSearch] = React.useState('');
  const [violationClassFilter, setViolationClassFilter] = React.useState('');
  const [studentSearchInput, setStudentSearchInput] = React.useState('');
  const [showStudentDropdown, setShowStudentDropdown] = React.useState(false);

  // Global search autocomplete states
  const [violationSearchInput, setViolationSearchInput] = React.useState('');
  const [showViolationDropdown, setShowViolationDropdown] = React.useState(false);
  const [categoryManuallySelected, setCategoryManuallySelected] = React.useState(false);
  const [highlightedViolationIndex, setHighlightedViolationIndex] = React.useState(0);

  // flat list of all prepared violations
  const allPreparedViolations = React.useMemo(() => {
    const list: Array<{
      categoryId: string;
      categoryLabel: string;
      code: string;
      label: string;
      helperText?: string;
    }> = [];
    
    JUNIOR_HIGH_VIOLATIONS_MASTER.forEach(category => {
      if (category.id === 'other') return;
      category.violations.forEach(v => {
        list.push({
          categoryId: category.id,
          categoryLabel: category.label,
          code: v.code,
          label: v.label,
          helperText: v.helperText
        });
      });
    });
    
    return list;
  }, []);

  // Filtered prepared violations based on search input and selected category
  const filteredPreparedViolations = React.useMemo(() => {
    let list = allPreparedViolations;
    
    // If a category was chosen, filter the list to only that category's violations
    if (selectedViolationCategory && selectedViolationCategory !== 'other') {
      list = list.filter(v => v.categoryId === selectedViolationCategory);
    }
    
    const queryStr = violationSearchInput.trim().toLowerCase();
    if (!queryStr) return list;
    
    // We want to perform case-insensitive, whitespace-insensitive search
    // to match code, violation label, category label, or helper text
    return list.filter(v => {
      const codeMatch = v.code.toLowerCase().includes(queryStr);
      const labelMatch = v.label.toLowerCase().includes(queryStr);
      const catMatch = v.categoryLabel.toLowerCase().includes(queryStr);
      const helperMatch = v.helperText ? v.helperText.toLowerCase().includes(queryStr) : false;
      
      return codeMatch || labelMatch || catMatch || helperMatch;
    });
  }, [allPreparedViolations, selectedViolationCategory, violationSearchInput]);

  // Group filtered violations by category for UI presentation
  const groupedFilteredViolations = React.useMemo(() => {
    const groups: Record<string, { label: string; items: Array<any> }> = {};
    filteredPreparedViolations.forEach((item, index) => {
      const itemWithIndex = { ...item, flatIndex: index };
      if (!groups[item.categoryId]) {
        groups[item.categoryId] = {
          label: item.categoryLabel,
          items: []
        };
      }
      groups[item.categoryId].items.push(itemWithIndex);
    });
    return Object.values(groups);
  }, [filteredPreparedViolations]);

  // Selection handler for global search selection
  const selectViolation = (v: any) => {
    if (v === null) {
      setSelectedViolationCode('');
      setViolationSearchInput('');
      if (!categoryManuallySelected) {
        setSelectedViolationCategory('');
      }
    } else {
      setSelectedViolationCategory(v.categoryId);
      setSelectedViolationCode(v.code);
      setViolationSearchInput(`${v.code} · ${v.label}`);
    }
    setShowViolationDropdown(false);
  };

  const handleViolationInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showViolationDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowViolationDropdown(true);
        setHighlightedViolationIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedViolationIndex(prev => 
        Math.min(prev + 1, filteredPreparedViolations.length - 1)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedViolationIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredPreparedViolations.length > 0 && highlightedViolationIndex >= 0 && highlightedViolationIndex < filteredPreparedViolations.length) {
        const selected = filteredPreparedViolations[highlightedViolationIndex];
        selectViolation(selected);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowViolationDropdown(false);
    }
  };

  // Helper to render text with highlighted matching search query
  const highlightMatch = (text: string, search: string) => {
    if (!search || !search.trim()) return <span>{text}</span>;
    const cleanSearch = search.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // escape regex chars
    const regex = new RegExp(`(${cleanSearch})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <mark key={i} className="bg-amber-100 text-amber-950 font-extrabold rounded px-0.5">{part}</mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  // Inline edit states for saved violations
  const [editingViolationId, setEditingViolationId] = React.useState<string | null>(null);
  const [editingViolationType, setEditingViolationType] = React.useState('');
  const [editingViolationNotes, setEditingViolationNotes] = React.useState('');
  const [updatingViolationId, setUpdatingViolationId] = React.useState<string | null>(null);

  // ----------------------------------------------------
  // TAB 3: RECAP & LEADERBOARD
  // ----------------------------------------------------
  const [rekapStartDate, setRekapStartDate] = React.useState<string>(() => {
    // Start of current week (Monday)
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split('T')[0];
  });
  const [rekapEndDate, setRekapEndDate] = React.useState<string>(getCurrentDateStr());
  const [rekapClassFilter, setRekapClassFilter] = React.useState('all');
  const [rekapDataType, setRekapDataType] = React.useState<'all' | 'lateness' | 'violations'>('all');
  const [rekapAcademicYear, setRekapAcademicYear] = React.useState(activeYear || '');
  const [rekapSemester, setRekapSemester] = React.useState(activeSemester || 1);
  const [loadingRekap, setLoadingRekap] = React.useState(false);
  const [rekapLatenessData, setRekapLatenessData] = React.useState<any[]>([]);
  const [rekapViolationData, setRekapViolationData] = React.useState<any[]>([]);
  const [rekapError, setRekapError] = React.useState<string | null>(null);

  // Sync rekapAcademicYear & rekapSemester with activeYear & activeSemester
  React.useEffect(() => {
    if (activeYear) setRekapAcademicYear(activeYear);
    if (activeSemester) setRekapSemester(activeSemester);
  }, [activeYear, activeSemester]);

  // Selected student timeline modal
  const [selectedTimelineStudent, setSelectedTimelineStudent] = React.useState<any | null>(null);
  const [studentTimeline, setStudentTimeline] = React.useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = React.useState(false);

  // Teacher Support Interventions state variables
  const [rekapSubTab, setRekapSubTab] = React.useState<'overview' | 'dukungan'>('overview');
  const [dukunganSubTab, setDukunganSubTab] = React.useState<'lateness' | 'minor_violation'>('lateness');
  const [interventions, setInterventions] = React.useState<any[]>([]);
  const [loadingInterventions, setLoadingInterventions] = React.useState(false);
  const [savingIntervention, setSavingIntervention] = React.useState(false);

  // Intervention Modal Form state
  const [showInterventionModal, setShowInterventionModal] = React.useState(false);
  const [activeIntervention, setActiveIntervention] = React.useState<any | null>(null);
  const [activeInterventionStudent, setActiveInterventionStudent] = React.useState<any | null>(null);
  const [activeInterventionIssueType, setActiveInterventionIssueType] = React.useState<'lateness' | 'minor_violation'>('lateness');
  const [selectedIncidentIds, setSelectedIncidentIds] = React.useState<Set<string>>(new Set());
  const [interventionPlanText, setInterventionPlanText] = React.useState('');
  const [activeInterventionStatus, setActiveInterventionStatus] = React.useState<'in_progress' | 'completed'>('in_progress');
  const [interventionOutcomeNote, setInterventionOutcomeNote] = React.useState('');
  const [studentEligibleIncidents, setStudentEligibleIncidents] = React.useState<any[]>([]);

  // Derived state mappings for modal markup compatibility
  const editingInterventionId = activeIntervention?.id || null;
  const selectedInterventionStudent = activeInterventionStudent;
  const selectedInterventionIssueType = activeInterventionIssueType;

  const isJuniorHighStaff = React.useCallback(() => {
    return ['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(profile?.role || '');
  }, [profile?.role]);

  const resetInterventionForm = React.useCallback(() => {
    setActiveIntervention(null);
    setActiveInterventionStudent(null);
    setSelectedIncidentIds(new Set());
    setInterventionPlanText('');
    setActiveInterventionStatus('in_progress');
    setInterventionOutcomeNote('');
    setStudentEligibleIncidents([]);
  }, []);

  // Subscribe to interventions for current activeYear and semester
  React.useEffect(() => {
    if (!activeYear) return;
    setLoadingInterventions(true);
    const q = query(
      collection(db, 'teacherSupportInterventions'),
      where('academicYear', '==', activeYear),
      where('semester', '==', String(activeSemester))
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      setInterventions(list);
      setLoadingInterventions(false);
    }, (error) => {
      console.error("Error subscribing to interventions:", error);
      setLoadingInterventions(false);
    });
    return () => unsubscribe();
  }, [activeYear, activeSemester]);

  // Set of completed incident IDs across all completed interventions
  const completedIncidentIdsSet = React.useMemo(() => {
    const completedIds = new Set<string>();
    if (Array.isArray(interventions)) {
      interventions.forEach(item => {
        if (item && item.status === 'completed' && Array.isArray(item.incidentIds)) {
          item.incidentIds.forEach((id: any) => {
            if (typeof id === 'string' && id.length > 0) {
              completedIds.add(id);
            }
          });
        }
      });
    }
    return completedIds;
  }, [interventions]);

  // ----------------------------------------------------
  // INITIAL LOAD & CONFIG SEEDING
  // ----------------------------------------------------
  const classesCacheRef = React.useRef<Map<string, any[]>>(new Map());

  // Dedicated function to fetch Junior High active classes for a specific academic year
  const getActiveJuniorHighClasses = React.useCallback(async (academicYear: string) => {
    const cacheKey = `unit:JUNIOR_HIGH,academicYear:${academicYear}`;
    if (classesCacheRef.current.has(cacheKey)) {
      return classesCacheRef.current.get(cacheKey) || [];
    }

    const q = query(
      collection(db, 'classes'),
      where('unitId', '==', 'JUNIOR_HIGH'),
      where('academicYear', '==', academicYear)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    
    // Sort classes alphabetically
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // status aktif bila field status tersedia
    const filteredList = list.filter((c: any) => {
      if (c.status !== undefined) {
        return c.status === 'active' || c.status === true;
      }
      if (c.active !== undefined) {
        return c.active === true;
      }
      return true;
    });

    classesCacheRef.current.set(cacheKey, filteredList);
    return filteredList;
  }, []);

  // Hook/Effect triggered when activeYear changes
  React.useEffect(() => {
    let isMounted = true;
    async function loadYearClasses() {
      if (!activeYear) return;
      
      // 1. Kosongkan class list lama
      setClasses([]);
      // 2. Tampilkan loading pada dropdown
      setLoadingClasses(true);
      // 4. Set class filter ke 'all'
      setRekapClassFilter('all');

      try {
        // 3. Ambil kelas untuk tahun baru
        const classesList = await getActiveJuniorHighClasses(activeYear);
        
        if (isMounted) {
          setClasses(classesList);
          
          // Bersihkan selectedClassId jika tidak ada lagi pada daftar kelas periode aktif
          if (selectedClassId && !classesList.some(c => c.id === selectedClassId)) {
            setSelectedClassId(classesList[0]?.id || '');
          } else if (!selectedClassId && classesList.length > 0) {
            setSelectedClassId(classesList[0].id);
          }

          setLoadingClasses(false);
        }
      } catch (err) {
        console.error('Error loading academic year classes:', err);
        if (isMounted) {
          setLoadingClasses(false);
          toast.error(`Gagal memuat kelas untuk tahun ajaran ${activeYear}.`);
        }
      }
    }

    loadYearClasses();
    return () => { isMounted = false; };
  }, [activeYear, getActiveJuniorHighClasses]);

  // Whenever selectedClassId changes, fetch students list
  React.useEffect(() => {
    if (!selectedClassId) return;
    
    let isMounted = true;
    async function loadStudents() {
      try {
        const fetchedS = await getActiveStudents(selectedClassId, activeYear);
        if (isMounted) {
          const mappedS = fetchedS.map(s => ({
            id: s.id,
            name: s.name,
            nickname: s.nickname || (s as any).panggilan || (s as any).nicknameStr || ''
          }));
          mappedS.sort((a, b) => a.name.localeCompare(b.name));
          setStudents(mappedS);
          
          // Clear active student in violation form when class changes
          setSelectedViolationStudentId('');
          setStudentSearchInput('');
        }
      } catch (err) {
        console.warn('Failed to load active students:', err);
      }
    }
    loadStudents();
    return () => { isMounted = false; };
  }, [selectedClassId, activeYear]);

  // ----------------------------------------------------
  // TAB 1: LATENESS LISTENERS & ACTIONS
  // ----------------------------------------------------
  // Load monthly lateness stats for records
  React.useEffect(() => {
    if (!selectedClassId) return;

    // We fetch current month's lateness count for each student
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);
    const startStr = startOfMonth.toISOString().split('T')[0];

    const q = query(
      collection(db, 'lateness_records'),
      where('classId', '==', selectedClassId),
      where('date', '>=', startStr)
    );

    const unsub = onSnapshot(q, (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.studentId) {
          counts[data.studentId] = (counts[data.studentId] || 0) + 1;
        }
      });

      // Map to classStudentsList
      const rosterList = students.map(s => ({
        id: s.id,
        name: s.name,
        nickname: s.nickname,
        arrivalTime: '',
        reason: '',
        parentNote: false,
        countThisMonth: counts[s.id] || 0,
        classId: selectedClassId,
        className: classes.find(c => c.id === selectedClassId)?.name || ''
      }));

      setLatenessClassStudents(rosterList);
    });

    return unsub;
  }, [selectedClassId, students, classes]);

  // Load Lateness Records saved for selected date
  React.useEffect(() => {
    setLoadingTodayLateness(true);
    const q = query(
      collection(db, 'lateness_records'),
      where('date', '==', latenessDate),
      where('classId', '==', selectedClassId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      list.sort((a, b) => {
        const timeA = a.arrivalTime || '00:00';
        const timeB = b.arrivalTime || '00:00';
        return timeB.localeCompare(timeA);
      });
      setLatenessTodaySaved(list);
      setLoadingTodayLateness(false);
    }, (err) => {
      console.error(err);
      setLoadingTodayLateness(false);
    });

    return unsub;
  }, [selectedClassId, latenessDate]);

  // Load pattern analysis stats for side bar
  React.useEffect(() => {
    if (!selectedClassId) return;
    
    const q = query(
      collection(db, 'lateness_records'),
      where('classId', '==', selectedClassId)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setMostFrequentDay('-');
        setAvgLateMinutes('-');
        return;
      }

      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const dayCounts: Record<string, number> = {};
      let totalMinutes = 0;
      let lateRecordsCount = 0;

      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.date) {
          const d = new Date(data.date);
          const dayName = days[d.getDay()];
          dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
        }
        
        // Calculate minutes late relative to 07:30 JKT threshold
        if (data.arrivalTime) {
          const [h, m] = data.arrivalTime.split(':').map(Number);
          const arrivalMin = h * 60 + m;
          const limitMin = 7 * 60 + 30; // 07:30
          if (arrivalMin > limitMin) {
            totalMinutes += (arrivalMin - limitMin);
            lateRecordsCount++;
          }
        }
      });

      // Most frequent day
      let maxDay = '-';
      let maxCount = 0;
      Object.entries(dayCounts).forEach(([day, count]) => {
        if (count > maxCount) {
          maxCount = count;
          maxDay = day;
        }
      });

      setMostFrequentDay(maxDay !== '-' ? `${maxDay} (${maxCount}x)` : '-');
      setAvgLateMinutes(lateRecordsCount > 0 ? `${Math.round(totalMinutes / lateRecordsCount)} menit` : '0 menit');
    });

    return unsub;
  }, [selectedClassId]);

  // Update lateness input state for a student
  const updateLatenessTime = (studentId: string, val: string) => {
    setLatenessClassStudents(prev => prev.map(s => s.id === studentId ? { ...s, arrivalTime: val } : s));
  };

  const handleTimeChange = (id: string, val: string, updateFn: (id: string, time: string) => void) => {
    // Allow digits and colons only, max length 5 (HH:MM)
    let cleaned = val.replace(/[^0-9:]/g, '');
    if (cleaned.length > 5) {
      cleaned = cleaned.slice(0, 5);
    }
    updateFn(id, cleaned);
  };

  const handleTimeBlur = (id: string, val: string, updateFn: (id: string, time: string) => void) => {
    if (!val) return;
    
    // Extract only digits
    let digits = val.replace(/[^0-9]/g, '');
    if (digits.length === 0) {
      updateFn(id, '');
      return;
    }
    
    let hours = '00';
    let minutes = '00';
    
    if (digits.length === 1) {
      hours = '0' + digits;
    } else if (digits.length === 2) {
      hours = digits;
    } else if (digits.length === 3) {
      hours = '0' + digits[0];
      minutes = digits.slice(1);
    } else if (digits.length >= 4) {
      hours = digits.slice(0, 2);
      minutes = digits.slice(2, 4);
    }
    
    // Range check hours and minutes
    let hNum = parseInt(hours, 10);
    let mNum = parseInt(minutes, 10);
    if (hNum > 23) hNum = 23;
    if (mNum > 59) mNum = 59;
    
    const hStr = hNum.toString().padStart(2, '0');
    const mStr = mNum.toString().padStart(2, '0');
    
    updateFn(id, `${hStr}:${mStr}`);
  };

  const updateLatenessReason = (studentId: string, val: string) => {
    setLatenessClassStudents(prev => prev.map(s => s.id === studentId ? { ...s, reason: val } : s));
  };

  const removeLatenessDraft = (studentId: string) => {
    setLatenessClassStudents(prev => prev.map(s => s.id === studentId ? { ...s, arrivalTime: '', reason: '' } : s));
  };

  // Save lateness logs
  const handleSaveLateness = async () => {
    const toSave = latenessClassStudents.filter(s => s.arrivalTime !== '');
    if (toSave.length === 0) {
      toast.error('Harap masukkan minimal satu waktu tiba siswa.');
      return;
    }

    setSavingLateness(true);
    try {
      const selectedClassObj = classes.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || 'Kelas Lain';

      const promises = toSave.map(async (record) => {
        const recordId = `${latenessDate}_${record.id}`;
        const recordRef = doc(db, 'lateness_records', recordId);
        const recordSnap = await getDoc(recordRef);
        
        if (recordSnap.exists()) {
          // Update existing record
          await setDoc(recordRef, {
            arrivalTime: record.arrivalTime,
            reason: record.reason || '',
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else {
          // Create new record
          await setDoc(recordRef, {
            studentId: record.id,
            studentName: record.name,
            classId: selectedClassId,
            className: className,
            date: latenessDate,
            arrivalTime: record.arrivalTime,
            reason: record.reason || '',
            parentNote: false,
            recordedAt: serverTimestamp(),
            academicYear: activeYear,
            semester: activeSemester,
            unitId: 'JUNIOR_HIGH'
          });
        }
      });

      await Promise.all(promises);
      toast.success(`Berhasil menyimpan ${toSave.length} catatan keterlambatan.`);
      
      // Clear draft forms
      setLatenessClassStudents(prev => prev.map(s => ({ ...s, arrivalTime: '', reason: '' })));
      setLatenessCustomReasons({});
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan data keterlambatan.');
    } finally {
      setSavingLateness(false);
    }
  };

  // Update saved reason and time
  const handleUpdateSavedLatenessReason = async (recordId: string) => {
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(editingLatenessTime)) {
      toast.error('Format waktu tidak valid. Gunakan format HH:MM (contoh: 07:45).');
      return;
    }

    setUpdatingLatenessId(recordId);
    try {
      await updateDoc(doc(db, 'lateness_records', recordId), {
        reason: editingLatenessReason,
        arrivalTime: editingLatenessTime,
        updatedAt: serverTimestamp()
      });
      toast.success('Data keterlambatan berhasil diperbarui.');
      setEditingLatenessId(null);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui data keterlambatan.');
    } finally {
      setUpdatingLatenessId(null);
    }
  };

  const handleDeleteSavedLateness = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus data keterlambatan ini?')) {
      try {
        await deleteDoc(doc(db, 'lateness_records', id));
        toast.success('Catatan keterlambatan berhasil dihapus.');
      } catch (err) {
        console.error(err);
        toast.error('Gagal menghapus data.');
      }
    }
  };

  // ----------------------------------------------------
  // TAB 2: PELANGGARAN RINGAN ACTIONS
  // ----------------------------------------------------
  // Load today's saved violations
  React.useEffect(() => {
    setLoadingTodayViolations(true);
    const q = query(
      collection(db, 'minor_violations'),
      where('date', '==', violationDate),
      where('unit', '==', 'JUNIOR_HIGH')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setTodayViolations(list);
      setLoadingTodayViolations(false);
    }, (err) => {
      console.error(err);
      setLoadingTodayViolations(false);
    });

    return unsub;
  }, [violationDate]);

  // Save new violation
  const handleSaveViolation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedViolationStudentId) {
      toast.error('Pilih siswa terlebih dahulu.');
      return;
    }
    if (!violationDate) {
      toast.error('Pilih tanggal terlebih dahulu.');
      return;
    }
    if (!selectedClassId) {
      toast.error('Pilih kelas terlebih dahulu.');
      return;
    }
    if (!selectedViolationCategory) {
      toast.error('Pilih kategori pelanggaran terlebih dahulu.');
      return;
    }

    let categoryId = '';
    let categoryLabel = '';
    let violationCode: string | null = null;
    let violationLabel = '';
    let isCustom = false;

    if (selectedViolationCategory === 'other') {
      if (!customViolationText.trim()) {
        toast.error('Isi jenis pelanggaran terlebih dahulu.');
        return;
      }
      categoryId = 'other';
      categoryLabel = 'Lainnya';
      violationCode = null;
      violationLabel = customViolationText.trim();
      isCustom = true;
    } else {
      if (!selectedViolationCode) {
        toast.error('Pilih jenis pelanggaran terlebih dahulu.');
        return;
      }
      const categoryObj = JUNIOR_HIGH_VIOLATIONS_MASTER.find(c => c.id === selectedViolationCategory);
      if (!categoryObj) {
        toast.error('Kategori tidak valid.');
        return;
      }
      const violationObj = categoryObj.violations.find(v => v.code === selectedViolationCode);
      if (!violationObj) {
        toast.error('Jenis pelanggaran tidak valid.');
        return;
      }
      categoryId = categoryObj.id;
      categoryLabel = categoryObj.label;
      violationCode = violationObj.code;
      violationLabel = violationObj.label;
      isCustom = false;
    }

    setSavingViolation(true);
    try {
      const studentObj = students.find(s => s.id === selectedViolationStudentId);
      const classObj = classes.find(c => c.id === selectedClassId);

      if (!studentObj) {
        toast.error('Siswa tidak ditemukan.');
        setSavingViolation(false);
        return;
      }

      const payload = {
        unit: 'JUNIOR_HIGH',
        studentId: studentObj.id,
        studentName: studentObj.name,
        classId: selectedClassId,
        className: classObj?.name || 'Kelas Lain',
        date: violationDate,
        violationType: violationLabel, // backward compatibility
        incidentType: 'minor_violation',
        categoryId,
        categoryLabel,
        violationCode,
        violationLabel,
        isCustom,
        notes: violationNotes.trim() || null,
        recordedByUid: profile?.uid || 'system',
        recordedByName: profile?.displayName || 'Guru / Staff',
        createdAt: new Date(), // Local fallback for instant sync
        updatedAt: new Date(),
        academicYear: activeYear,
        semester: activeSemester
      };

      // Add to Firestore (let Firestore generate document ID)
      await addDoc(collection(db, 'minor_violations'), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      toast.success('Catatan pelanggaran ringan berhasil disimpan.');

      // Reset student selection and inputs, KEEP date and class
      setSelectedViolationStudentId('');
      setStudentSearchInput('');
      setSelectedViolationCategory('');
      setSelectedViolationCode('');
      setCustomViolationText('');
      setViolationNotes('');
      setViolationSearchInput('');
      setCategoryManuallySelected(false);
    } catch (err) {
      console.error('Error saving minor violation:', err);
      toast.error('Gagal menyimpan catatan pelanggaran ringan.');
    } finally {
      setSavingViolation(false);
    }
  };

  // Update minor violation
  const handleUpdateViolation = async (violationId: string) => {
    if (!editingViolationType.trim()) {
      toast.error('Jenis pelanggaran wajib diisi.');
      return;
    }
    setUpdatingViolationId(violationId);
    try {
      await updateDoc(doc(db, 'minor_violations', violationId), {
        violationType: editingViolationType.trim(),
        notes: editingViolationNotes,
        updatedAt: serverTimestamp()
      });
      toast.success('Catatan pelanggaran ringan berhasil diperbarui.');
      setEditingViolationId(null);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui catatan.');
    } finally {
      setUpdatingViolationId(null);
    }
  };

  // Delete minor violation
  const handleDeleteViolation = async (violationId: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus catatan pelanggaran ringan ini?')) {
      try {
        await deleteDoc(doc(db, 'minor_violations', violationId));
        toast.success('Catatan pelanggaran ringan berhasil dihapus.');
      } catch (err) {
        console.error(err);
        toast.error('Gagal menghapus catatan.');
      }
    }
  };

  // Search filtered violations for table
  const filteredViolationsList = React.useMemo(() => {
    return todayViolations.filter(v => {
      const matchClass = violationClassFilter ? v.classId === violationClassFilter : true;
      const matchSearch = violationSearch 
        ? (v.studentName || '').toLowerCase().includes(violationSearch.toLowerCase()) 
        : true;
      return matchClass && matchSearch;
    });
  }, [todayViolations, violationClassFilter, violationSearch]);

  // Sidebar Today Violation statistics
  const violationTodayStats = React.useMemo(() => {
    const total = todayViolations.length;
    const uniqueStudents = new Set(todayViolations.map(v => v.studentId)).size;
    
    // Most frequent violation type today
    const typeCounts: Record<string, number> = {};
    const originalLabels: Record<string, string> = {}; // to preserve original casing

    todayViolations.forEach(v => {
      const typeStr = (v.violationType || '').trim();
      if (typeStr) {
        const normalized = typeStr.toLowerCase();
        typeCounts[normalized] = (typeCounts[normalized] || 0) + 1;
        if (!originalLabels[normalized]) {
          originalLabels[normalized] = typeStr;
        }
      }
    });

    let mostFreqType = '-';
    let maxCount = 0;
    Object.entries(typeCounts).forEach(([norm, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostFreqType = originalLabels[norm];
      }
    });

    return {
      total,
      uniqueStudents,
      mostFreqType: mostFreqType !== '-' ? `${mostFreqType} (${maxCount}x)` : '-'
    };
  }, [todayViolations]);

  // ----------------------------------------------------
  // TAB 3: RECAP & LEADERBOARD LOGIC
  // ----------------------------------------------------
  const normalizeTardinessRecord = React.useCallback((r: any) => {
    // Normalize date to YYYY-MM-DD
    let normDate = '';
    const rawDate = r.date || r.attendanceDate || r.recordDate || r.createdAt;
    if (rawDate) {
      if (typeof rawDate === 'string') {
        if (rawDate.includes('-')) {
          normDate = rawDate.split('T')[0];
        } else if (rawDate.includes('/')) {
          const parts = rawDate.split('/');
          if (parts[0].length === 4) {
            normDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            normDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      } else if (rawDate.seconds !== undefined && rawDate.nanoseconds !== undefined) {
        // Firestore Timestamp
        const d = new Date(rawDate.seconds * 1000);
        const formatter = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        normDate = formatter.format(d);
      } else if (rawDate instanceof Date) {
        const formatter = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        normDate = formatter.format(rawDate);
      }
    }

    if (!normDate) {
      normDate = getCurrentDateStr();
    }

    const studentId = r.studentId || '';
    const studentName = r.studentName || r.name || 'Siswa';
    const classId = r.classId || '';
    const className = r.className || r.class || 'Kelas Lain';
    const arrivalTime = r.arrivalTime || r.time || r.arrivalAt || '00:00';
    const reason = r.reason || r.notes || r.description || '';
    const unitId = r.unitId || r.unit || '';

    return {
      id: r.id || '',
      studentId,
      studentName,
      classId,
      className,
      date: normDate,
      arrivalTime,
      reason,
      academicYear: r.academicYear,
      semester: r.semester ? Number(r.semester) : undefined,
      unitId
    };
  }, []);

  const isJuniorHighRecord = React.useCallback((r: any, classesList: any[]) => {
    // 1. If explicit unitId/unit exists
    const u = (r.unitId || r.unit || '').toUpperCase();
    if (u) {
      return u === 'JUNIOR_HIGH';
    }

    // 2. Try matching with known active classes
    if (r.classId && classesList.some(c => c.id === r.classId)) {
      return true;
    }

    // 3. Fallback name-based detection
    const nameLower = (r.className || r.class || '').toLowerCase();
    const idLower = (r.classId || '').toLowerCase();
    
    const isSmp = nameLower.includes('smp') || 
                  nameLower.includes('junior') || 
                  nameLower.includes('al-jazari') || 
                  nameLower.includes('al jazari') ||
                  nameLower.includes('grade 7') || 
                  nameLower.includes('grade 8') || 
                  nameLower.includes('grade 9') ||
                  nameLower.includes('kelas 7') || 
                  nameLower.includes('kelas 8') || 
                  nameLower.includes('kelas 9') ||
                  /\b(7|8|9)\b/.test(nameLower) ||
                  /\b(7|8|9)\b/.test(idLower) ||
                  nameLower.startsWith('7') ||
                  nameLower.startsWith('8') ||
                  nameLower.startsWith('9');

    if (isSmp) return true;

    return false;
  }, []);

  const fetchRekapData = async () => {
    if (!rekapAcademicYear) return;
    setLoadingRekap(true);
    setRekapError(null);
    try {
      // Query lateness records for selected date range
      const latenessQ = query(
        collection(db, 'lateness_records'),
        where('date', '>=', rekapStartDate),
        where('date', '<=', rekapEndDate)
      );

      // Query minor violations for selected date range
      const violationQ = query(
        collection(db, 'minor_violations'),
        where('date', '>=', rekapStartDate),
        where('date', '<=', rekapEndDate)
      );

      const [latenessSnap, violationSnap] = await Promise.all([
        getDocs(latenessQ),
        getDocs(violationQ)
      ]);

      const rawLateness = latenessSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const rawViolations = violationSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // Normalisasi data Tardiness dengan adapter
      const normalizedLateness = rawLateness.map(normalizeTardinessRecord).filter(r => isJuniorHighRecord(r, classes));
      
      // Filter minor violations to unit == 'JUNIOR_HIGH'
      const juniorHighViolations = rawViolations.filter(v => 
        (v.unit || v.unitId || '').toUpperCase() === 'JUNIOR_HIGH' || 
        classes.some(c => c.id === v.classId)
      );

      setRekapLatenessData(normalizedLateness);
      setRekapViolationData(juniorHighViolations);

      console.log('Rekap fetch successful:', {
        activeAcademicYear: rekapAcademicYear,
        semester: rekapSemester,
        startDate: rekapStartDate,
        endDate: rekapEndDate,
        selectedClassId: rekapClassFilter,
        collections: ['lateness_records', 'minor_violations'],
        rawLatenessCount: rawLateness.length,
        normalizedLatenessCount: normalizedLateness.length,
        rawViolationsCount: rawViolations.length,
        filteredViolationsCount: juniorHighViolations.length
      });

    } catch (err: any) {
      console.error('Error fetching rekap data:', {
        activeAcademicYear: rekapAcademicYear,
        semester: rekapSemester,
        startDate: rekapStartDate,
        endDate: rekapEndDate,
        selectedClassId: rekapClassFilter,
        error: err?.message || err
      });
      setRekapError('Data keterlambatan tidak dapat dimuat. Coba muat ulang.');
      toast.error('Data keterlambatan tidak dapat dimuat. Coba muat ulang.');
    } finally {
      setLoadingRekap(false);
    }
  };

  // Safe and reactive filter on retrieved collections
  const filteredLateness = React.useMemo(() => {
    if (rekapDataType === 'violations') return [];
    return rekapLatenessData.filter(r => {
      // 1. Date range filter
      if (r.date < rekapStartDate || r.date > rekapEndDate) return false;
      
      // 2. Class filter
      if (rekapClassFilter !== 'all') {
        const classObj = classes.find(c => c.id === rekapClassFilter);
        const matchesId = r.classId === rekapClassFilter;
        const matchesName = classObj && r.className && r.className.toLowerCase() === classObj.name.toLowerCase();
        if (!matchesId && !matchesName) return false;
      }

      // 3. Academic Year & Semester if fields exist on record, else pass
      if (r.academicYear && r.academicYear !== rekapAcademicYear) return false;
      if (r.semester && Number(r.semester) !== Number(rekapSemester)) return false;
      return true;
    });
  }, [rekapLatenessData, rekapStartDate, rekapEndDate, rekapClassFilter, rekapAcademicYear, rekapSemester, rekapDataType, classes]);

  const filteredViolations = React.useMemo(() => {
    if (rekapDataType === 'lateness') return [];
    return rekapViolationData.filter(r => {
      // 1. Date range filter
      if (r.date < rekapStartDate || r.date > rekapEndDate) return false;
      
      // 2. Class filter
      if (rekapClassFilter !== 'all') {
        const classObj = classes.find(c => c.id === rekapClassFilter);
        const matchesId = r.classId === rekapClassFilter;
        const matchesName = classObj && r.className && r.className.toLowerCase() === classObj.name.toLowerCase();
        if (!matchesId && !matchesName) return false;
      }

      // 3. Academic Year & Semester must match
      if (r.academicYear && r.academicYear !== rekapAcademicYear) return false;
      if (r.semester && Number(r.semester) !== Number(rekapSemester)) return false;
      return true;
    });
  }, [rekapViolationData, rekapStartDate, rekapEndDate, rekapClassFilter, rekapAcademicYear, rekapSemester, rekapDataType, classes]);

  // Trigger rekap fetch on tab mount or filter changes
  React.useEffect(() => {
    if (activeTab === 'rekap' && !loadingClasses) {
      fetchRekapData();
    }
  }, [activeTab, rekapStartDate, rekapEndDate, rekapClassFilter, rekapAcademicYear, rekapSemester, loadingClasses]);

  const handleApplyRekapFilters = () => {
    fetchRekapData();
  };

  const handleResetRekapFilters = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    setRekapStartDate(monday.toISOString().split('T')[0]);
    setRekapEndDate(getCurrentDateStr());
    setRekapClassFilter('all');
    setRekapDataType('all');
    setRekapAcademicYear(activeYear || '');
    setRekapSemester(activeSemester || 1);
  };

  // ==========================================
  // GURU SUPPORT (INTERVENTION) HANDLERS
  // ==========================================

  const handleOpenNewInterventionModal = (student: any, issueType: 'lateness' | 'minor_violation') => {
    resetInterventionForm();
    if (!student || typeof student.studentId !== 'string') {
      toast.error('Data siswa tidak valid.');
      return;
    }
    const safeIssueType = (issueType === 'minor_violation') ? 'minor_violation' : 'lateness';

    setActiveInterventionStudent(student);
    setActiveInterventionIssueType(safeIssueType);

    // Get all active incidents for this student of this type
    const incidents = safeIssueType === 'lateness'
      ? rekapLatenessData.filter(r => r && typeof r.id === 'string' && r.studentId === student.studentId && !completedIncidentIdsSet.has(r.id))
      : rekapViolationData.filter(r => r && typeof r.id === 'string' && r.studentId === student.studentId && !completedIncidentIdsSet.has(r.id));

    setStudentEligibleIncidents(incidents);
    // Pre-select all of them by default
    const validIds = incidents.map(inc => inc.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
    setSelectedIncidentIds(new Set(validIds));
    setShowInterventionModal(true);
  };

  const handleOpenEditInterventionModal = (intervention: any, student: any) => {
    resetInterventionForm();
    if (!intervention) {
      toast.error('Data intervensi tidak valid.');
      return;
    }
    setActiveIntervention(intervention);
    setActiveInterventionStudent({
      studentId: intervention.studentId || '',
      studentName: intervention.studentName || 'Siswa',
      className: intervention.className || 'Kelas Lain',
      classId: intervention.classId || '',
    });
    
    const safeIssueType = (intervention.issueType === 'minor_violation') ? 'minor_violation' : 'lateness';
    setActiveInterventionIssueType(safeIssueType);
    setInterventionPlanText(intervention.interventionPlan || '');
    setActiveInterventionStatus(intervention.status || 'in_progress');
    setInterventionOutcomeNote(intervention.outcomeNote || '');

    // Normalize currently linked IDs
    const currentlyLinkedIds = Array.isArray(intervention.incidentIds)
      ? intervention.incidentIds.filter((id: any): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const currentlyLinkedSet = new Set(currentlyLinkedIds);

    const activeIncidents = safeIssueType === 'lateness'
      ? rekapLatenessData.filter(r => r && typeof r.id === 'string' && r.studentId === intervention.studentId && (!completedIncidentIdsSet.has(r.id) || currentlyLinkedSet.has(r.id)))
      : rekapViolationData.filter(r => r && typeof r.id === 'string' && r.studentId === intervention.studentId && (!completedIncidentIdsSet.has(r.id) || currentlyLinkedSet.has(r.id)));

    setStudentEligibleIncidents(activeIncidents);
    setSelectedIncidentIds(new Set(currentlyLinkedIds));
    setShowInterventionModal(true);
  };

  const handleToggleIncidentSelection = (incidentId: string) => {
    setSelectedIncidentIds(prev => {
      const next = new Set(prev);
      if (next.has(incidentId)) {
        next.delete(incidentId);
      } else {
        next.add(incidentId);
      }
      return next;
    });
  };

  const handleSelectAllIncidents = () => {
    const validIds = studentEligibleIncidents.map(inc => inc.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
    setSelectedIncidentIds(new Set(validIds));
  };

  const handleClearSelectedIncidents = () => {
    setSelectedIncidentIds(new Set());
  };

  const handleSaveIntervention = async () => {
    if (!isJuniorHighStaff()) {
      toast.error('Hanya staf/guru SMP yang memiliki otorisasi untuk mengelola intervensi.');
      return;
    }

    const incidentIdsArray = Array.from(selectedIncidentIds).filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (incidentIdsArray.length === 0) {
      toast.error('Anda harus memilih setidaknya 1 catatan kejadian yang valid.');
      return;
    }

    if (!activeInterventionStudent?.studentId || typeof activeInterventionStudent.studentId !== 'string' || activeInterventionStudent.studentId.trim() === '') {
      toast.error('ID siswa tidak valid.');
      return;
    }

    const planText = interventionPlanText.trim();
    if (planText.length < 5) {
      toast.error('Rencana dukungan guru wajib diisi (minimal 5 karakter).');
      return;
    }

    if (activeInterventionStatus === 'completed' && interventionOutcomeNote.trim().length < 5) {
      toast.error('Catatan hasil penyelesaian wajib diisi untuk intervensi selesai.');
      return;
    }

    setSavingIntervention(true);
    try {
      const interventionId = activeIntervention?.id || doc(collection(db, 'teacherSupportInterventions')).id;
      const safeIssueType = (activeInterventionIssueType === 'minor_violation') ? 'minor_violation' : 'lateness';

      const payload: any = {
        id: interventionId,
        studentId: activeInterventionStudent.studentId,
        studentName: activeInterventionStudent.studentName || 'Siswa',
        className: activeInterventionStudent.className || 'Kelas Lain',
        classId: activeInterventionStudent.classId || '',
        academicYear: activeYear,
        semester: String(activeSemester),
        issueType: safeIssueType,
        incidentIds: incidentIdsArray,
        interventionPlan: planText,
        status: activeInterventionStatus,
        outcomeNote: activeInterventionStatus === 'completed' ? interventionOutcomeNote.trim() : '',
        updatedBy: profile?.uid || '',
        updatedAt: serverTimestamp(),
        completedBy: activeInterventionStatus === 'completed' ? (profile?.uid || profile?.email || 'system') : '',
        completedAt: activeInterventionStatus === 'completed' ? serverTimestamp() : null,
      };

      if (activeIntervention?.id) {
        // Keep original creator fields on update
        payload.createdAt = activeIntervention.createdAt || serverTimestamp();
        payload.createdBy = activeIntervention.createdBy || profile?.uid || '';
        payload.createdByName = activeIntervention.createdByName || profile?.displayName || 'Guru';
      } else {
        // Seeding creator fields on create
        payload.createdAt = serverTimestamp();
        payload.createdBy = profile?.uid || '';
        payload.createdByName = profile?.displayName || 'Guru';
      }

      // Using setDoc to satisfy both create and update while strictly complying with isValidTeacherSupportIntervention
      await setDoc(doc(db, 'teacherSupportInterventions', interventionId), payload);
      toast.success(activeIntervention?.id ? 'Sesi intervensi berhasil diperbarui.' : 'Dukungan Guru baru berhasil dimulai.');

      setShowInterventionModal(false);
      resetInterventionForm();
    } catch (err: any) {
      console.error('Error saving teacher support intervention:', err);
      toast.error(`Gagal menyimpan intervensi: ${err.message || err}`);
    } finally {
      setSavingIntervention(false);
    }
  };

  // Compile Leaderboard from filtered records
  const leaderboardList = React.useMemo(() => {
    const studentMap: Record<string, {
      studentId: string;
      studentName: string;
      className: string;
      classId: string;
      latenessCount: number;
      latenessSelesaiCount: number;
      latenessAktifCount: number;
      violationCount: number;
      violationSelesaiCount: number;
      violationAktifCount: number;
      totalCount: number;
      lastRecordedDate: string;
    }> = {};

    // Helper to log or update student entry
    const touchStudent = (studentId: string, name: string, className: string, classId: string, date: string) => {
      if (!studentMap[studentId]) {
        studentMap[studentId] = {
          studentId,
          studentName: name,
          className,
          classId,
          latenessCount: 0,
          latenessSelesaiCount: 0,
          latenessAktifCount: 0,
          violationCount: 0,
          violationSelesaiCount: 0,
          violationAktifCount: 0,
          totalCount: 0,
          lastRecordedDate: date
        };
      } else {
        if (date > studentMap[studentId].lastRecordedDate) {
          studentMap[studentId].lastRecordedDate = date;
        }
      }
    };

    // Aggregate lateness
    if (rekapDataType === 'all' || rekapDataType === 'lateness') {
      filteredLateness.forEach(r => {
        if (!r.studentId) return;
        touchStudent(r.studentId, r.studentName, r.className || 'Kelas Lain', r.classId, r.date);
        studentMap[r.studentId].latenessCount++;
        if (completedIncidentIdsSet.has(r.id)) {
          studentMap[r.studentId].latenessSelesaiCount++;
        } else {
          studentMap[r.studentId].latenessAktifCount++;
        }
        studentMap[r.studentId].totalCount++;
      });
    }

    // Aggregate violations
    if (rekapDataType === 'all' || rekapDataType === 'violations') {
      filteredViolations.forEach(r => {
        if (!r.studentId) return;
        touchStudent(r.studentId, r.studentName, r.className || 'Kelas Lain', r.classId, r.date);
        studentMap[r.studentId].violationCount++;
        if (completedIncidentIdsSet.has(r.id)) {
          studentMap[r.studentId].violationSelesaiCount++;
        } else {
          studentMap[r.studentId].violationAktifCount++;
        }
        studentMap[r.studentId].totalCount++;
      });
    }

    // Convert map to array
    const result = Object.values(studentMap);

    result.sort((a, b) => {
      const scoreA = rekapDataType === 'lateness' ? a.latenessCount : rekapDataType === 'violations' ? a.violationCount : a.totalCount;
      const scoreB = rekapDataType === 'lateness' ? b.latenessCount : rekapDataType === 'violations' ? b.violationCount : b.totalCount;
      
      if (scoreB !== scoreA) {
        return scoreB - scoreA; // Descending count
      }
      return b.lastRecordedDate.localeCompare(a.lastRecordedDate); // Tied -> most recent first
    });

    return result;
  }, [filteredLateness, filteredViolations, rekapDataType, completedIncidentIdsSet]);

  // Aggregate Metrics for cards
  const rekapMetrics = React.useMemo(() => {
    const list = leaderboardList;
    const totalLateness = filteredLateness.length;
    const totalViolations = filteredViolations.length;
    
    let maxStudentName = '-';
    let maxStudentCount = 0;
    list.forEach(s => {
      const count = rekapDataType === 'lateness' ? s.latenessCount : rekapDataType === 'violations' ? s.violationCount : s.totalCount;
      if (count > maxStudentCount) {
        maxStudentCount = count;
        maxStudentName = s.studentName;
      }
    });

    // Find class with most records
    const classCounts: Record<string, number> = {};
    if (rekapDataType === 'all' || rekapDataType === 'lateness') {
      filteredLateness.forEach(r => {
        if (r.className) classCounts[r.className] = (classCounts[r.className] || 0) + 1;
      });
    }
    if (rekapDataType === 'all' || rekapDataType === 'violations') {
      filteredViolations.forEach(r => {
        if (r.className) classCounts[r.className] = (classCounts[r.className] || 0) + 1;
      });
    }

    let maxClassName = '-';
    let maxClassCount = 0;
    Object.entries(classCounts).forEach(([name, count]) => {
      if (count > maxClassCount) {
        maxClassCount = count;
        maxClassName = name;
      }
    });

    const needLatenessSupportCount = list.filter(s => s.latenessAktifCount >= 3).length;
    const needViolationSupportCount = list.filter(s => s.violationAktifCount >= 3).length;

    return {
      totalLateness,
      totalViolations,
      topStudent: maxStudentCount > 0 ? `${maxStudentName} (${maxStudentCount}x)` : '-',
      topClass: maxClassCount > 0 ? `${maxClassName} (${maxClassCount}x)` : '-',
      needLatenessSupportCount,
      needViolationSupportCount
    };
  }, [leaderboardList, filteredLateness, filteredViolations, rekapDataType]);

  // Chart Data compilation (Catatan per Kelas)
  const chartData = React.useMemo(() => {
    const classesMap: Record<string, { name: string; Keterlambatan: number; 'Pelanggaran Ringan': number }> = {};
    
    // Pre-populate with our classes list for consistent layout
    classes.forEach(c => {
      classesMap[c.id] = { name: c.name, Keterlambatan: 0, 'Pelanggaran Ringan': 0 };
    });

    if (rekapDataType === 'all' || rekapDataType === 'lateness') {
      filteredLateness.forEach(r => {
        if (r.classId && classesMap[r.classId]) {
          classesMap[r.classId].Keterlambatan++;
        }
      });
    }

    if (rekapDataType === 'all' || rekapDataType === 'violations') {
      filteredViolations.forEach(v => {
        if (v.classId && classesMap[v.classId]) {
          classesMap[v.classId]['Pelanggaran Ringan']++;
        }
      });
    }

    return Object.values(classesMap);
  }, [classes, filteredLateness, filteredViolations, rekapDataType]);

  // Open Student History Timeline derived from currently filtered active dataset
  const handleOpenStudentHistory = (student: any) => {
    setSelectedTimelineStudent(student);
    setLoadingTimeline(true);
    try {
      const historyList: any[] = [];
      const studentLateness = filteredLateness.filter(r => r.studentId === student.studentId);
      const studentViolations = filteredViolations.filter(r => r.studentId === student.studentId);

      studentLateness.forEach(data => {
        historyList.push({
          id: data.id,
          type: 'lateness',
          title: 'Keterlambatan',
          timeLabel: data.arrivalTime || 'Tiba',
          category: data.arrivalTime > '07:30' ? 'Terlambat' : 'Tepat Waktu',
          reason: data.reason || 'Tanpa keterangan',
          recordedBy: data.recordedByName || 'Guru / Staff',
          date: data.date,
          color: 'blue'
        });
      });

      studentViolations.forEach(data => {
        historyList.push({
          id: data.id,
          type: 'violation',
          title: 'Pelanggaran Ringan',
          timeLabel: 'Pelanggaran',
          category: data.violationType || 'Pelanggaran',
          reason: data.notes || 'Tanpa keterangan',
          recordedBy: data.recordedByName || 'Guru / Staff',
          date: data.date,
          color: 'amber'
        });
      });

      // Sort timeline descending
      historyList.sort((a, b) => b.date.localeCompare(a.date));
      setStudentTimeline(historyList);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat timeline siswa.');
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Navigate to create MTSS Case
  const handleCreateMTSSCase = (studentId: string) => {
    navigate(`/junior-high/behavior/mtss/cases/new?studentId=${studentId}`);
  };

  // Nav to student portfolio
  const handleOpenPortfolio = () => {
    navigate(`/child/passport`);
  };

  // ----------------------------------------------------
  // SUB-RENDER: TAB 1 KETERLAMBATAN Form & Table
  // ----------------------------------------------------
  const recordedStudentIds = React.useMemo(() => {
    return latenessTodaySaved.map(r => r.studentId);
  }, [latenessTodaySaved]);

  const filteredLatenessClassStudents = React.useMemo(() => {
    return latenessClassStudents.filter(s => {
      const isRecorded = recordedStudentIds.includes(s.id);
      if (isRecorded) return false;
      return s.name.toLowerCase().includes(latenessSearch.toLowerCase()) || 
        (s.nickname && s.nickname.toLowerCase().includes(latenessSearch.toLowerCase()));
    });
  }, [latenessClassStudents, recordedStudentIds, latenessSearch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">School Code of Conduct</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">Pencatatan harian dan rekap disiplin siswa SMP</p>
        </div>
        {/* Unit Selector Context display */}
        <div className="flex items-center gap-2 bg-blue-50/50 text-blue-700 px-4 py-2.5 rounded-2xl border border-blue-100">
          <BookOpen size={16} />
          <span className="text-xs font-black uppercase tracking-wider">Unit: SMP (Junior High)</span>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-1">
        <button
          onClick={() => setActiveTab('lateness')}
          className={cn(
            "flex items-center gap-2 px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer",
            activeTab === 'lateness' 
              ? "bg-blue-50/50 text-blue-600 border-blue-600 shadow-sm shadow-blue-50/30" 
              : "text-gray-400 border-transparent hover:text-gray-600"
          )}
        >
          <Clock size={16} />
          Keterlambatan
        </button>
        <button
          onClick={() => setActiveTab('violations')}
          className={cn(
            "flex items-center gap-2 px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer",
            activeTab === 'violations' 
              ? "bg-amber-50/50 text-amber-600 border-amber-500 shadow-sm shadow-amber-50/30" 
              : "text-gray-400 border-transparent hover:text-gray-600"
          )}
        >
          <ClipboardList size={16} />
          Pelanggaran Ringan
        </button>
        {!isStudentOrParent && (
          <button
            onClick={() => setActiveTab('rekap')}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer",
              activeTab === 'rekap' 
                ? "bg-violet-50/50 text-violet-600 border-violet-600 shadow-sm shadow-violet-50/30" 
                : "text-gray-400 border-transparent hover:text-gray-600"
            )}
          >
            <BarChart3 size={16} />
            Rekap & Leaderboard
          </button>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB CONTENT: KETERLAMBATAN (TARDINESS) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'lateness' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1 & 2: Form Input */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Form Card */}
              <div className="bg-white rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shrink-0">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Catat Kedatangan Siswa</h2>
                      <p className="text-xs text-gray-400 mt-0.5 md:block hidden">Waktu kedatangan di bawah jam 07:30 dianggap tepat waktu</p>
                      <p className="text-xs text-amber-600 font-bold mt-0.5 block md:hidden">Batas tepat waktu: 07:30</p>
                    </div>
                  </div>
                  
                  {/* Date & Class Selectors */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                    <input
                      type="date"
                      value={latenessDate}
                      onChange={(e) => setLatenessDate(e.target.value)}
                      className="w-full sm:w-auto bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-11 sm:h-auto"
                    />
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="w-full sm:w-auto bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer h-11 sm:h-auto"
                    >
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Search Bar inside form */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    placeholder="Cari siswa dalam kelas ini..."
                    value={latenessSearch}
                    onChange={(e) => setLatenessSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 md:py-2.5 bg-gray-50/50 border border-gray-100 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium h-11"
                  />
                </div>

                {/* Mobile Ringkasan */}
                {!loadingMetadata && filteredLatenessClassStudents.length > 0 && (
                  <div className="block md:hidden flex items-center justify-between px-1 text-xs font-black text-gray-500 uppercase tracking-wider pb-1">
                    <span>{filteredLatenessClassStudents.length} Siswa</span>
                    {filteredLatenessClassStudents.filter(s => s.arrivalTime && s.arrivalTime > '07:30').length > 0 && (
                      <span className="text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-lg">
                        {filteredLatenessClassStudents.filter(s => s.arrivalTime && s.arrivalTime > '07:30').length} terlambat
                      </span>
                    )}
                  </div>
                )}

                {/* Entry List/Table Area */}
                <div>
                  {loadingMetadata ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-blue-500" />
                      <p className="text-xs font-black uppercase tracking-wider">Memuat data kelas...</p>
                    </div>
                  ) : filteredLatenessClassStudents.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                      {latenessClassStudents.length === 0 ? (
                        <p className="text-sm italic font-medium">Tidak ada siswa ditemukan di kelas ini.</p>
                      ) : latenessSearch !== '' ? (
                        <p className="text-sm italic font-medium">Tidak ada siswa yang cocok dengan pencarian.</p>
                      ) : (
                        <p className="text-sm italic font-medium">Tidak ada siswa lain yang perlu dicatat untuk tanggal ini.</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* DESKTOP TABLE VIEW */}
                      <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-50">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50/50">
                            <tr>
                              <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                              <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu Tiba</th>
                              <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan / Keterangan</th>
                              <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50/50">
                            {filteredLatenessClassStudents.map(student => (
                              <tr key={student.id} className="hover:bg-gray-50/30 transition-all">
                                <td className="px-5 py-3.5">
                                  <p className="font-bold text-gray-900 text-sm">{student.name}</p>
                                  <p className="text-[10px] font-semibold text-gray-400 mt-0.5 uppercase tracking-wider">
                                    Frekuensi bulan ini: {student.countThisMonth}x
                                  </p>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="07:30"
                                      inputMode="numeric"
                                      value={student.arrivalTime}
                                      onChange={(e) => handleTimeChange(student.id, e.target.value, updateLatenessTime)}
                                      onBlur={(e) => handleTimeBlur(student.id, e.target.value, updateLatenessTime)}
                                      className="bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-black text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-24 text-center"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateLatenessTime(student.id, getCurrentTimeStr())}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                      title="Set jam saat ini"
                                    >
                                      <Clock size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  {(() => {
                                    const isCustom = latenessCustomReasons[student.id] || 
                                      (student.reason !== '' && !JUNIOR_HIGH_REASONS.includes(student.reason));

                                    if (isCustom) {
                                      return (
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            placeholder="Tulis alasan..."
                                            value={student.reason}
                                            onChange={(e) => updateLatenessReason(student.id, e.target.value)}
                                            className="bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none text-xs py-1 placeholder:text-gray-300 font-bold text-gray-700 w-full"
                                            autoFocus
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setLatenessCustomReasons(prev => ({ ...prev, [student.id]: false }));
                                              updateLatenessReason(student.id, '');
                                            }}
                                            className="text-[10px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-wider"
                                          >
                                            Batal
                                          </button>
                                        </div>
                                      );
                                    }

                                    return (
                                      <select
                                        value={student.reason}
                                        onChange={(e) => {
                                          if (e.target.value === 'custom') {
                                            setLatenessCustomReasons(prev => ({ ...prev, [student.id]: true }));
                                            updateLatenessReason(student.id, '');
                                          } else {
                                            updateLatenessReason(student.id, e.target.value);
                                          }
                                        }}
                                        className="bg-transparent border-b border-gray-100 hover:border-gray-200 focus:border-blue-500 outline-none text-xs py-1.5 font-bold text-gray-700 cursor-pointer w-full"
                                      >
                                        <option value="">-- Pilih Alasan --</option>
                                        {JUNIOR_HIGH_REASONS.map(r => (
                                          <option key={r} value={r}>{r}</option>
                                        ))}
                                        <option value="custom" className="text-blue-600 font-bold">Lainnya...</option>
                                      </select>
                                    );
                                  })()}
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeLatenessDraft(student.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Reset"
                                    disabled={!student.arrivalTime}
                                  >
                                    <X size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* MOBILE CARD VIEW */}
                      <div className="block md:hidden space-y-3 pb-24">
                        {filteredLatenessClassStudents.map(student => {
                          const isLate = student.arrivalTime && student.arrivalTime > '07:30';
                          const isOntime = student.arrivalTime && student.arrivalTime <= '07:30';
                          const lateMins = getLatenessMinutes(student.arrivalTime);
                          const initials = getInitials(student.name);

                          const isCustom = latenessCustomReasons[student.id] || 
                            (student.reason !== '' && !JUNIOR_HIGH_REASONS.includes(student.reason));

                          return (
                            <div 
                              key={student.id}
                              className="p-4 bg-gray-50/40 border border-gray-100 rounded-2xl space-y-3 shadow-sm hover:bg-gray-50/80 transition-all"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {/* Avatar / Inisial */}
                                  <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                                    {initials}
                                  </div>
                                  {/* Student Name & Metadata */}
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-900 text-sm leading-snug break-words">
                                      {student.name}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-semibold text-gray-500">
                                      {isOntime && (
                                        <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">
                                          Tepat waktu
                                        </span>
                                      )}
                                      {isLate && (
                                        <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md">
                                          Terlambat +{lateMins} mnt
                                        </span>
                                      )}
                                      {!student.arrivalTime && (
                                        <span className="text-gray-400">Belum diisi</span>
                                      )}
                                      <span className="text-gray-300">•</span>
                                      <span className={cn(
                                        "px-1.5 py-0.5 rounded-md",
                                        student.countThisMonth > 0 ? "text-amber-700 bg-amber-50" : "text-gray-400"
                                      )}>
                                        Bulan ini: {student.countThisMonth}×
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Inputs & Timings */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <input
                                    type="text"
                                    placeholder="07:30"
                                    inputMode="numeric"
                                    value={student.arrivalTime}
                                    onChange={(e) => handleTimeChange(student.id, e.target.value, updateLatenessTime)}
                                    onBlur={(e) => handleTimeBlur(student.id, e.target.value, updateLatenessTime)}
                                    className="bg-white border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-2.5 py-2.5 text-sm font-black text-gray-700 w-20 text-center outline-none h-11"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateLatenessTime(student.id, getCurrentTimeStr())}
                                    className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 bg-white border border-gray-200 rounded-xl transition-all h-11 flex items-center justify-center shrink-0"
                                    title="Set jam saat ini"
                                  >
                                    <Clock size={16} />
                                  </button>
                                  {student.arrivalTime && (
                                    <button
                                      type="button"
                                      onClick={() => removeLatenessDraft(student.id)}
                                      className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 bg-white border border-gray-200 rounded-xl transition-all h-11 flex items-center justify-center shrink-0"
                                      title="Reset"
                                    >
                                      <X size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Custom / select Reason drop down */}
                              {student.arrivalTime && (
                                <div className="pt-2 border-t border-gray-100">
                                  {isCustom ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        placeholder="Tulis alasan..."
                                        value={student.reason}
                                        onChange={(e) => updateLatenessReason(student.id, e.target.value)}
                                        className="bg-white border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl text-xs py-2 px-3 placeholder:text-gray-300 font-bold text-gray-700 w-full h-10 outline-none"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLatenessCustomReasons(prev => ({ ...prev, [student.id]: false }));
                                          updateLatenessReason(student.id, '');
                                        }}
                                        className="px-2.5 h-10 bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold rounded-xl text-[10px] uppercase tracking-wider shrink-0"
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  ) : (
                                    <select
                                      value={student.reason}
                                      onChange={(e) => {
                                        if (e.target.value === 'custom') {
                                          setLatenessCustomReasons(prev => ({ ...prev, [student.id]: true }));
                                          updateLatenessReason(student.id, '');
                                        } else {
                                          updateLatenessReason(student.id, e.target.value);
                                        }
                                      }}
                                      className="w-full bg-white border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl text-xs px-3 py-2.5 font-bold text-gray-700 cursor-pointer h-10 outline-none"
                                    >
                                      <option value="">-- Pilih Alasan --</option>
                                      {JUNIOR_HIGH_REASONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                      <option value="custom" className="text-blue-600 font-bold">Lainnya...</option>
                                    </select>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Save Button */}
                <div className="pt-2 md:block flex flex-col w-full md:relative fixed bottom-0 left-0 right-0 p-4 md:p-0 bg-white md:bg-transparent border-t border-gray-100 md:border-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] md:shadow-none">
                  <button
                    disabled={savingLateness || loadingMetadata}
                    onClick={handleSaveLateness}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-3.5 rounded-2xl shadow-lg shadow-blue-100 transition-all disabled:opacity-50 text-xs uppercase tracking-wider cursor-pointer h-11"
                  >
                    {savingLateness ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {savingLateness ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>

              {/* Lateness Today List Card */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Keterlambatan Hari Ini</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Siswa yang terdata pada {getFormattedDateLong(latenessDate)}</p>
                    </div>
                  </div>
                  <span className="bg-blue-50 text-blue-700 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    {latenessTodaySaved.length} Siswa
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {loadingTodayLateness ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-blue-500" />
                      <p className="text-xs font-medium uppercase tracking-widest">Memuat data keterlambatan...</p>
                    </div>
                  ) : latenessTodaySaved.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                      <p className="text-sm italic">Belum ada data keterlambatan yang disimpan hari ini.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu Tiba</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan / Keterangan</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {latenessTodaySaved.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50/30 transition-all">
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900 text-sm">{record.studentName}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                {record.className}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {editingLatenessId === record.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="07:30"
                                    inputMode="numeric"
                                    value={editingLatenessTime}
                                    onChange={(e) => handleTimeChange(record.id, e.target.value, (_, val) => setEditingLatenessTime(val))}
                                    onBlur={(e) => handleTimeBlur(record.id, e.target.value, (_, val) => setEditingLatenessTime(val))}
                                    className="bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-black text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-24 text-center"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setEditingLatenessTime(getCurrentTimeStr())}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                    title="Set jam saat ini"
                                  >
                                    <Clock size={14} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-black text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg">
                                  {record.arrivalTime}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {editingLatenessId === record.id ? (
                                <div className="flex items-center gap-2">
                                  {editingLatenessCustom ? (
                                    <div className="flex items-center gap-2 w-full">
                                      <input
                                        type="text"
                                        value={editingLatenessReason}
                                        onChange={(e) => setEditingLatenessReason(e.target.value)}
                                        className="bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none text-xs font-bold text-gray-700 py-1"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingLatenessCustom(false);
                                          setEditingLatenessReason('');
                                        }}
                                        className="text-[10px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-wider"
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  ) : (
                                    <select
                                      value={editingLatenessReason}
                                      onChange={(e) => {
                                        if (e.target.value === 'custom') {
                                          setEditingLatenessCustom(true);
                                          setEditingLatenessReason('');
                                        } else {
                                          setEditingLatenessReason(e.target.value);
                                        }
                                      }}
                                      className="bg-transparent border-b border-gray-200 outline-none text-xs font-bold text-gray-700 py-1"
                                    >
                                      <option value="">-- Pilih Alasan --</option>
                                      {JUNIOR_HIGH_REASONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                      <option value="custom" className="text-blue-600 font-bold">Lainnya...</option>
                                    </select>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-600">{record.reason || <span className="text-gray-300 italic">Tidak ada alasan</span>}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {editingLatenessId === record.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleUpdateSavedLatenessReason(record.id)}
                                    disabled={updatingLatenessId === record.id}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  >
                                    {updatingLatenessId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingLatenessId(null);
                                      setEditingLatenessReason('');
                                      setEditingLatenessCustom(false);
                                    }}
                                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingLatenessId(record.id);
                                      setEditingLatenessReason(record.reason || '');
                                      setEditingLatenessTime(record.arrivalTime || '');
                                      const isPreset = JUNIOR_HIGH_REASONS.includes(record.reason || '') || (record.reason || '') === '';
                                      setEditingLatenessCustom(!isPreset);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  >
                                    <Edit2 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSavedLateness(record.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Column: Stats */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-500" />
                  Analisis Pola Keterlambatan
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hari Paling Sering</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{mostFrequentDay}</p>
                    </div>
                    <History size={18} className="text-gray-300" />
                  </div>
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rerata Menit Terlambat</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{avgLateMinutes}</p>
                    </div>
                    <Clock size={18} className="text-gray-300" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB CONTENT: PELANGGARAN RINGAN */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'violations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main Column: Form input */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
                      <ClipboardList size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Catat Pelanggaran Ringan</h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={violationDate}
                      onChange={(e) => setViolationDate(e.target.value)}
                      className="bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none"
                    />
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="bg-gray-50/70 border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none cursor-pointer"
                    >
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <form onSubmit={handleSaveViolation} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Student Selector */}
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Siswa *</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={students.length === 0 ? "Memuat siswa..." : "Cari & Pilih Siswa..."}
                          value={studentSearchInput}
                          onChange={(e) => {
                            setStudentSearchInput(e.target.value);
                            setShowStudentDropdown(true);
                          }}
                          onFocus={() => setShowStudentDropdown(true)}
                          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold"
                          disabled={students.length === 0}
                        />
                        <Search size={14} className="absolute right-3 top-3.5 text-gray-400" />
                      </div>

                      {/* Search Autocomplete Dropdown */}
                      {showStudentDropdown && students.length > 0 && (
                        <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-100 shadow-xl rounded-xl divide-y divide-gray-50">
                          {(() => {
                            const filteredSList = students.filter(s => 
                              s.name.toLowerCase().includes(studentSearchInput.toLowerCase()) ||
                              (s.nickname && s.nickname.toLowerCase().includes(studentSearchInput.toLowerCase()))
                            );
                            
                            if (filteredSList.length === 0) {
                              return <div className="p-3 text-xs text-gray-400 italic">Siswa tidak ditemukan</div>;
                            }

                            return filteredSList.map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setSelectedViolationStudentId(s.id);
                                  setStudentSearchInput(s.name);
                                  setShowStudentDropdown(false);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-amber-50/50 text-xs font-bold text-gray-700 block transition-all"
                              >
                                {s.name} {s.nickname ? `(${s.nickname})` : ''}
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                      {showStudentDropdown && (
                        <div 
                          className="fixed inset-0 z-20" 
                          onClick={() => setShowStudentDropdown(false)}
                        />
                      )}
                    </div>

                    {/* Category Selector */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Kategori Pelanggaran *</label>
                      <select
                        value={selectedViolationCategory}
                        onChange={(e) => {
                          const catId = e.target.value;
                          setSelectedViolationCategory(catId);
                          setSelectedViolationCode('');
                          setCustomViolationText('');
                          setViolationSearchInput('');
                          setCategoryManuallySelected(catId !== '');
                        }}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold cursor-pointer"
                        required
                      >
                        <option value="">-- Pilih Kategori --</option>
                        {JUNIOR_HIGH_VIOLATIONS_MASTER.map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Violation Selector or Manual Input */}
                  <div className="space-y-2 relative">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Jenis Pelanggaran *</label>
                    {selectedViolationCategory === 'other' ? (
                      <input
                        type="text"
                        placeholder="Tulis pelanggaran secara singkat..."
                        value={customViolationText}
                        onChange={(e) => setCustomViolationText(e.target.value.slice(0, 100))}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold"
                        maxLength={100}
                        required
                      />
                    ) : (
                      <div className="relative">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="🔍 Cari contoh: kaos kaki, HP, sampah, seragam..."
                            value={violationSearchInput}
                            onChange={(e) => {
                              setViolationSearchInput(e.target.value);
                              setShowViolationDropdown(true);
                              setHighlightedViolationIndex(0);
                              
                              if (!e.target.value) {
                                selectViolation(null);
                              }
                            }}
                            onFocus={() => {
                              setShowViolationDropdown(true);
                              setHighlightedViolationIndex(0);
                            }}
                            onKeyDown={handleViolationInputKeyDown}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-4 pr-10 py-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold"
                            required={!selectedViolationCode}
                          />
                          
                          {violationSearchInput ? (
                            <button
                              type="button"
                              onClick={() => selectViolation(null)}
                              className="absolute right-3 top-3.5 text-gray-400 hover:text-red-500 transition-all cursor-pointer"
                              title="Hapus pilihan"
                            >
                              <X size={14} />
                            </button>
                          ) : (
                            <Search size={14} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
                          )}
                        </div>

                        {/* Search Autocomplete Dropdown */}
                        {showViolationDropdown && selectedViolationCategory !== 'other' && (
                          <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-100 shadow-xl rounded-xl divide-y divide-gray-50 p-1">
                            {filteredPreparedViolations.length === 0 ? (
                              <div className="p-3 text-xs text-gray-400 italic">Jenis pelanggaran tidak ditemukan</div>
                            ) : (
                              groupedFilteredViolations.map((group) => (
                                <div key={group.label} className="p-1">
                                  <div className="px-2 py-1 text-[9px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/5 rounded-md mb-1 select-none">
                                    {group.label}
                                  </div>
                                  <div className="space-y-0.5">
                                    {group.items.map((item) => {
                                      const isHighlighted = item.flatIndex === highlightedViolationIndex;
                                      const isSelected = selectedViolationCode === item.code && selectedViolationCategory === item.categoryId;
                                      return (
                                        <button
                                          key={item.code}
                                          type="button"
                                          onMouseEnter={() => setHighlightedViolationIndex(item.flatIndex)}
                                          onClick={() => selectViolation(item)}
                                          className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg text-xs transition-all block",
                                            isHighlighted ? "bg-amber-500/5 text-amber-950 font-extrabold" : "text-gray-700 font-bold hover:bg-gray-50/50",
                                            isSelected && "bg-amber-500/10 text-amber-900 font-black border-l-2 border-amber-500 rounded-l-none"
                                          )}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="truncate">
                                              {highlightMatch(item.code, violationSearchInput)} · {highlightMatch(item.label, violationSearchInput)}
                                            </span>
                                            {isSelected && <Check size={14} className="text-amber-600 shrink-0 ml-2" />}
                                          </div>
                                          <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                            {highlightMatch(item.categoryLabel, violationSearchInput)}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        {showViolationDropdown && (
                          <div 
                            className="fixed inset-0 z-20" 
                            onClick={() => setShowViolationDropdown(false)}
                          />
                        )}
                      </div>
                    )}

                    {/* Helper text tooltip for selected prepared violation */}
                    {(() => {
                      if (!selectedViolationCategory || selectedViolationCategory === 'other' || !selectedViolationCode) return null;
                      const catObj = JUNIOR_HIGH_VIOLATIONS_MASTER.find(c => c.id === selectedViolationCategory);
                      const violObj = catObj?.violations.find(v => v.code === selectedViolationCode);
                      if (!violObj?.helperText) return null;
                      return (
                        <div className="mt-2 p-3 bg-amber-50/70 border border-amber-100 rounded-xl text-[11px] text-amber-800 leading-relaxed flex items-start gap-2.5">
                          <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          <span>{violObj.helperText}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                        Keterangan Singkat
                      </label>
                      <span className="text-[10px] font-bold text-gray-400">{violationNotes.length}/300</span>
                    </div>
                    <textarea
                      placeholder="Tulis catatan tambahan di sini (Opsional)..."
                      value={violationNotes}
                      onChange={(e) => setViolationNotes(e.target.value.slice(0, 300))}
                      rows={3}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    />
                  </div>

                  {/* Recorded By */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Dicatat Oleh</label>
                      <div className="bg-gray-100/50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-black text-gray-500 flex items-center gap-2">
                        <User size={14} />
                        {profile?.displayName || 'Guru / Staff'}
                      </div>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={savingViolation}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-3 px-8 rounded-xl shadow-lg shadow-amber-50 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {savingViolation ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {savingViolation ? 'Menyimpan...' : 'Simpan Catatan Pelanggaran'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Today's Violations List */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <ClipboardList size={18} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-sm">Catatan Pelanggaran Hari Ini</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Log pelanggaran ringan tanggal {getFormattedDateLong(violationDate)}</p>
                    </div>
                  </div>

                  {/* Filter & Search list */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={violationClassFilter}
                      onChange={(e) => setViolationClassFilter(e.target.value)}
                      className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 outline-none cursor-pointer"
                    >
                      <option value="">Semua Kelas</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Cari siswa..."
                        value={violationSearch}
                        onChange={(e) => setViolationSearch(e.target.value)}
                        className="bg-gray-50 border border-gray-100 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-gray-700 outline-none w-36"
                      />
                      <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {loadingTodayViolations ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-amber-500" />
                      <p className="text-xs font-medium uppercase tracking-widest">Memuat catatan...</p>
                    </div>
                  ) : filteredViolationsList.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                      <p className="text-sm italic">Belum ada catatan pelanggaran ringan pada tanggal ini.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Jenis Pelanggaran</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Keterangan</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Dicatat Oleh</th>
                          <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredViolationsList.map(record => (
                          <tr key={record.id} className="hover:bg-gray-50/30 transition-all">
                            <td className="px-5 py-4">
                              <p className="font-bold text-gray-900 text-xs">{record.studentName}</p>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                                {record.className}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {editingViolationId === record.id ? (
                                <input
                                  type="text"
                                  value={editingViolationType}
                                  onChange={(e) => setEditingViolationType(e.target.value.slice(0, 100))}
                                  className="bg-transparent border-b border-gray-300 focus:border-amber-500 outline-none text-xs font-bold text-gray-700 py-1 w-full"
                                  maxLength={100}
                                />
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] font-black text-gray-400 tracking-wider uppercase">
                                    {record.categoryLabel || 'Catatan lama'}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {record.violationCode && (
                                      <span className="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                                        {record.violationCode}
                                      </span>
                                    )}
                                    <span className="text-xs font-bold text-gray-800">
                                      {record.violationLabel || record.violationType}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 max-w-xs">
                              {editingViolationId === record.id ? (
                                <input
                                  type="text"
                                  value={editingViolationNotes}
                                  onChange={(e) => setEditingViolationNotes(e.target.value)}
                                  className="w-full bg-transparent border-b border-gray-300 focus:border-amber-500 outline-none text-xs font-bold text-gray-700 py-1"
                                />
                              ) : (
                                <p className="text-xs text-gray-500 break-words font-medium">{record.notes || <span className="text-gray-300 italic">-</span>}</p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-[10px] font-bold text-gray-500">{record.recordedByName || 'Guru'}</p>
                            </td>
                            <td className="px-5 py-4 text-right">
                              {editingViolationId === record.id ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleUpdateViolation(record.id)}
                                    disabled={updatingViolationId === record.id}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  >
                                    {updatingViolationId === record.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingViolationId(null);
                                      setEditingViolationNotes('');
                                    }}
                                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingViolationId(record.id);
                                      setEditingViolationType(record.violationType || '');
                                      setEditingViolationNotes(record.notes || '');
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteViolation(record.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Tab 2 Sidebar: stats & master categories manager */}
            <div className="space-y-6">
              
              {/* Stats Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                  <TrendingUp size={16} className="text-amber-500" />
                  Ringkasan Hari Ini
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Catatan</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{violationTodayStats.total} kejadian</p>
                    </div>
                    <ClipboardList size={18} className="text-gray-300" />
                  </div>
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa Terlibat</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{violationTodayStats.uniqueStudents} siswa</p>
                    </div>
                    <User size={18} className="text-gray-300" />
                  </div>
                  <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Jenis Pelanggaran Terbanyak</p>
                    <p className="text-xs font-bold text-gray-800 mt-1 break-words leading-relaxed">{violationTodayStats.mostFreqType}</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB CONTENT: REKAP & LEADERBOARD */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'rekap' && !isStudentOrParent && (
        <div className="space-y-6">
          
          {rekapError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-sm animate-fade-in">
              <AlertCircle size={16} className="text-red-500 shrink-0" />
              <span>{rekapError}</span>
            </div>
          )}

          {/* Sub Tab Navigation */}
          <div className="flex border-b border-gray-100 pb-px">
            <button
              onClick={() => setRekapSubTab('overview')}
              className={cn(
                "px-5 py-2.5 font-bold text-xs uppercase tracking-wider border-b-2 -mb-px transition-all cursor-pointer",
                rekapSubTab === 'overview'
                  ? "text-violet-600 border-violet-600 font-black"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              Tabel Rekap & Tren
            </button>
            <button
              onClick={() => setRekapSubTab('dukungan')}
              className={cn(
                "px-5 py-2.5 font-bold text-xs uppercase tracking-wider border-b-2 -mb-px transition-all cursor-pointer flex items-center gap-1.5",
                rekapSubTab === 'dukungan'
                  ? "text-violet-600 border-violet-600 font-black"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              <ShieldAlert size={14} />
              Dukungan Guru (Intervensi)
              {(rekapMetrics.needLatenessSupportCount > 0 || rekapMetrics.needViolationSupportCount > 0) && (
                <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse ml-0.5">
                  {rekapMetrics.needLatenessSupportCount + rekapMetrics.needViolationSupportCount}
                </span>
              )}
            </button>
          </div>

          {rekapSubTab === 'overview' ? (
            <div className="space-y-6 animate-fade-in">
              {/* Controls / Filter Panel Card */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
                <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                  <Filter size={16} className="text-violet-600" />
                  Filter Rekap Keterlambatan dan Pelanggaran Ringan
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  
                  {/* Date Range Start */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Mulai Tanggal</label>
                    <input
                      type="date"
                      value={rekapStartDate}
                      onChange={(e) => setRekapStartDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>

                  {/* Date Range End */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Sampai Tanggal</label>
                    <input
                      type="date"
                      value={rekapEndDate}
                      onChange={(e) => setRekapEndDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>

                  {/* Class filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Kelas ({rekapAcademicYear})</label>
                    <select
                      value={rekapClassFilter}
                      onChange={(e) => setRekapClassFilter(e.target.value)}
                      disabled={loadingClasses}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15 cursor-pointer disabled:opacity-50"
                    >
                      {loadingClasses ? (
                        <option value="all">Memuat kelas {rekapAcademicYear}...</option>
                      ) : (
                        <>
                          <option value="all">Semua Kelas</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </>
                      )}
                    </select>
                    {!loadingClasses && classes.length === 0 && (
                      <p className="text-[10px] text-amber-600 font-bold mt-1 leading-normal">
                        Belum ada kelas Junior High untuk tahun ajaran {rekapAcademicYear}.
                      </p>
                    )}
                  </div>

                  {/* Data Type filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Jenis Catatan</label>
                    <select
                      value={rekapDataType}
                      onChange={(e) => setRekapDataType(e.target.value as any)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15 cursor-pointer"
                    >
                      <option value="all">Semua Catatan</option>
                      <option value="lateness">Hanya Keterlambatan</option>
                      <option value="violations">Hanya Pelanggaran Ringan</option>
                    </select>
                  </div>

                  {/* Year & Semester Context */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Tahun Ajaran</label>
                      <input
                        type="text"
                        value={rekapAcademicYear}
                        disabled
                        className="w-full bg-gray-100 border border-gray-100 text-gray-400 rounded-xl px-2 py-2.5 text-[10px] font-bold text-center"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Semester</label>
                      <input
                        type="text"
                        value={`SM ${rekapSemester}`}
                        disabled
                        className="w-full bg-gray-100 border border-gray-100 text-gray-400 rounded-xl px-2 py-2.5 text-[10px] font-bold text-center"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleResetRekapFilters}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyRekapFilters}
                    className="bg-violet-600 hover:bg-violet-700 text-white font-black px-8 py-2.5 rounded-xl shadow-md shadow-violet-50 transition-all text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Terapkan Filter
                  </button>
                </div>
              </div>

              {/* Aggregate Metrics Cards (4 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Card 1 */}
                <div 
                  onClick={() => setRekapDataType('lateness')}
                  className={cn(
                    "bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-violet-300 transition-all",
                    rekapDataType === 'lateness' && "ring-2 ring-violet-600/30 border-violet-400 bg-violet-50/10"
                  )}
                >
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Keterlambatan</p>
                    {loadingRekap ? (
                      <div className="h-6 w-16 bg-gray-100 animate-pulse rounded mt-2" />
                    ) : (
                      <p className="text-xl font-black text-blue-600 mt-1">{rekapMetrics.totalLateness}x</p>
                    )}
                  </div>
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <Clock size={20} />
                  </div>
                </div>

                {/* Card 2 */}
                <div 
                  onClick={() => setRekapDataType('violations')}
                  className={cn(
                    "bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-violet-300 transition-all",
                    rekapDataType === 'violations' && "ring-2 ring-violet-600/30 border-violet-400 bg-violet-50/10"
                  )}
                >
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Pelanggaran Ringan</p>
                    {loadingRekap ? (
                      <div className="h-6 w-16 bg-gray-100 animate-pulse rounded mt-2" />
                    ) : (
                      <p className="text-xl font-black text-amber-600 mt-1">{rekapMetrics.totalViolations}x</p>
                    )}
                  </div>
                  <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl">
                    <ClipboardList size={20} />
                  </div>
                </div>

                {/* Card 3 */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div className="max-w-[70%]">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa dengan Catatan Terbanyak</p>
                    {loadingRekap ? (
                      <div className="h-4 w-32 bg-gray-100 animate-pulse rounded mt-2" />
                    ) : (
                      <p className="text-xs font-bold text-gray-700 mt-1 truncate leading-relaxed">{rekapMetrics.topStudent}</p>
                    )}
                  </div>
                  <div className="p-3 bg-violet-50 text-violet-600 rounded-2xl">
                    <User size={20} />
                  </div>
                </div>

                {/* Card 4 */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div className="max-w-[70%]">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas dengan Catatan Terbanyak</p>
                    {loadingRekap ? (
                      <div className="h-4 w-32 bg-gray-100 animate-pulse rounded mt-2" />
                    ) : (
                      <p className="text-xs font-bold text-gray-700 mt-1 truncate leading-relaxed">{rekapMetrics.topClass}</p>
                    )}
                  </div>
                  <div className="p-3 bg-gray-50 text-gray-500 rounded-2xl">
                    <LayoutDashboard size={20} />
                  </div>
                </div>
              </div>

              {/* Support Eligibility Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* Card 1: Siswa Perlu Dukungan Keterlambatan */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa Perlu Dukungan Keterlambatan</p>
                    {loadingRekap ? (
                      <div className="h-6 w-16 bg-gray-100 animate-pulse rounded mt-2" />
                    ) : (
                      <p className="text-xl font-black text-red-600 mt-1">{rekapMetrics.needLatenessSupportCount} Siswa</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1 font-medium">Siswa dengan &ge; 3 keterlambatan aktif</p>
                  </div>
                  <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
                    <ShieldAlert size={20} />
                  </div>
                </div>

                {/* Card 2: Siswa Perlu Dukungan Pelanggaran Ringan */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa Perlu Dukungan Pelanggaran Ringan</p>
                    {loadingRekap ? (
                      <div className="h-6 w-16 bg-gray-100 animate-pulse rounded mt-2" />
                    ) : (
                      <p className="text-xl font-black text-amber-600 mt-1">{rekapMetrics.needViolationSupportCount} Siswa</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1 font-medium">Siswa dengan &ge; 3 pelanggaran ringan aktif</p>
                  </div>
                  <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl">
                    <AlertCircle size={20} />
                  </div>
                </div>

              </div>

              {/* Visual Chart Section */}
              <div className="w-full bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="font-black text-gray-900 text-sm">Pola Catatan per Kelas</h3>
                </div>

                {loadingRekap ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin text-violet-500" />
                    <p className="text-xs font-medium">Menyusun data pola...</p>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-gray-400 italic text-xs">
                    Tidak ada data untuk rentang filter saat ini
                  </div>
                ) : (
                  <div className="h-64 w-full text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontWeight: 'bold' }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontWeight: 'bold' }} />
                        <Tooltip 
                          contentStyle={{ background: '#ffffff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                        />
                         <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                        {(rekapDataType === 'all' || rekapDataType === 'lateness') && (
                          <Bar dataKey="Keterlambatan" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        )}
                        {(rekapDataType === 'all' || rekapDataType === 'violations') && (
                          <Bar dataKey="Pelanggaran Ringan" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Main Leaderboard Table */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                  <div>
                    <h2 className="font-black text-gray-900 text-sm">Tabel Rekapitulasi Catatan Siswa</h2>
                  </div>
                  <span className="bg-violet-50 text-violet-700 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    {leaderboardList.length} Siswa Terdata
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {loadingRekap ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin text-violet-500" />
                      <p className="text-xs font-medium uppercase tracking-widest">Menyusun data rekap...</p>
                    </div>
                  ) : leaderboardList.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                      <p className="text-sm italic">Tidak ada catatan yang cocok dengan filter aktif.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="bg-gray-50/50">
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Urutan</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kelas</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Keterlambatan</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Pelanggaran Ringan</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Dukungan Guru</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Terakhir Tercatat</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {leaderboardList.map((item, index) => (
                          <tr key={item.studentId} className="hover:bg-gray-50/30 transition-all duration-200">
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-gray-400"># {index + 1}</span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900 text-sm">{item.studentName}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                                {item.className}
                              </span>
                            </td>
                            
                            {/* Keterlambatan Column */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col gap-1 items-center justify-center">
                                <span className={cn(
                                  "text-xs font-black px-2.5 py-1 rounded-full",
                                  item.latenessCount > 0 ? "text-blue-700 bg-blue-50/80 border border-blue-100" : "text-gray-400 bg-gray-50/50"
                                )}>
                                  {item.latenessCount} Total
                                </span>
                                <span className="text-[9px] font-medium text-gray-400 whitespace-nowrap">
                                  {item.latenessSelesaiCount} selesai · {item.latenessAktifCount} aktif
                                </span>
                              </div>
                            </td>

                            {/* Pelanggaran Ringan Column */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col gap-1 items-center justify-center">
                                <span className={cn(
                                  "text-xs font-black px-2.5 py-1 rounded-full",
                                  item.violationCount > 0 ? "text-amber-700 bg-amber-50/80 border border-amber-100" : "text-gray-400 bg-gray-50/50"
                                )}>
                                  {item.violationCount} Total
                                </span>
                                <span className="text-[9px] font-medium text-gray-400 whitespace-nowrap">
                                  {item.violationSelesaiCount} selesai · {item.violationAktifCount} aktif
                                </span>
                              </div>
                            </td>

                            {/* Dukungan Guru Eligibility Indicator Column */}
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5 items-center justify-center">
                                {item.latenessAktifCount >= 3 ? (
                                  <button 
                                    onClick={() => {
                                      setRekapSubTab('dukungan');
                                      setDukunganSubTab('lateness');
                                    }}
                                    className="text-[9px] font-black text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 px-2.5 py-1 rounded-full uppercase tracking-wider text-center block cursor-pointer transition-all shadow-sm"
                                  >
                                    Dukungan Guru — Keterlambatan
                                  </button>
                                ) : null}
                                {item.violationAktifCount >= 3 ? (
                                  <button 
                                    onClick={() => {
                                      setRekapSubTab('dukungan');
                                      setDukunganSubTab('minor_violation');
                                    }}
                                    className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2.5 py-1 rounded-full uppercase tracking-wider text-center block cursor-pointer transition-all shadow-sm"
                                  >
                                    Dukungan Guru — Pelanggaran Ringan
                                  </button>
                                ) : null}
                                {item.latenessAktifCount < 3 && item.violationAktifCount < 3 && (
                                  <span className="text-[10px] font-bold text-gray-400 bg-gray-50/50 border border-gray-100/30 px-2.5 py-1 rounded-full">
                                    Belum perlu dukungan
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <p className="text-xs text-gray-500 font-medium">{item.lastRecordedDate}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleOpenStudentHistory(item)}
                                className="flex items-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-600 font-black px-4 py-1.5 rounded-xl text-[10px] uppercase tracking-wider ml-auto cursor-pointer"
                              >
                                Lihat Riwayat
                                <ArrowUpRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Dukungan Guru Workspace */
            <div className="space-y-6 animate-fade-in">
              {/* Secondary Tabs inside Dukungan Guru */}
              <div className="flex border-b border-gray-100 pb-px gap-4">
                <button
                  onClick={() => setDukunganSubTab('lateness')}
                  className={cn(
                    "px-4 py-2 font-bold text-xs uppercase tracking-wider border-b-2 -mb-px transition-all cursor-pointer flex items-center gap-2",
                    dukunganSubTab === 'lateness'
                      ? "text-blue-600 border-blue-600 font-black"
                      : "text-gray-400 border-transparent hover:text-gray-600"
                  )}
                >
                  <Clock size={14} />
                  Keterlambatan
                </button>
                <button
                  onClick={() => setDukunganSubTab('minor_violation')}
                  className={cn(
                    "px-4 py-2 font-bold text-xs uppercase tracking-wider border-b-2 -mb-px transition-all cursor-pointer flex items-center gap-2",
                    dukunganSubTab === 'minor_violation'
                      ? "text-amber-600 border-amber-600 font-black"
                      : "text-gray-400 border-transparent hover:text-gray-600"
                  )}
                >
                  <ClipboardList size={14} />
                  Pelanggaran Ringan
                </button>
              </div>

              {/* Dukungan Guru Lists Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Siswa Perlu Dukungan (Active/In Progress Cases) */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-gray-50">
                    <h4 className="font-black text-gray-900 text-sm">
                      Daftar Siswa Perlu Intervensi {dukunganSubTab === 'lateness' ? 'Keterlambatan' : 'Pelanggaran Ringan'}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">Siswa dengan &ge; 3 catatan aktif atau memiliki intervensi aktif yang belum selesai.</p>
                  </div>

                  <div className="divide-y divide-gray-50 flex-1 overflow-y-auto max-h-[600px]">
                    {loadingInterventions ? (
                      <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                        <Loader2 size={24} className="animate-spin text-violet-500" />
                        <p className="text-xs font-black uppercase tracking-wider">Memuat daftar dukungan...</p>
                      </div>
                    ) : (() => {
                      const activeStudentsForDukungan = leaderboardList.filter(s => {
                        const activeCount = dukunganSubTab === 'lateness' ? s.latenessAktifCount : s.violationAktifCount;
                        const hasActiveIntervention = interventions.some(int => 
                          int.studentId === s.studentId && 
                          int.issueType === dukunganSubTab && 
                          int.status === 'in_progress'
                        );
                        return activeCount >= 3 || hasActiveIntervention;
                      });

                      if (activeStudentsForDukungan.length === 0) {
                        return (
                          <div className="p-12 text-center text-gray-400">
                            <p className="text-sm italic">Tidak ada siswa yang memerlukan dukungan intervensi saat ini.</p>
                          </div>
                        );
                      }

                      return activeStudentsForDukungan.map(s => {
                        const activeCount = dukunganSubTab === 'lateness' ? s.latenessAktifCount : s.violationAktifCount;
                        const selesaiCount = dukunganSubTab === 'lateness' ? s.latenessSelesaiCount : s.violationSelesaiCount;
                        const activeInt = interventions.find(int => 
                          int.studentId === s.studentId && 
                          int.issueType === dukunganSubTab && 
                          int.status === 'in_progress'
                        );

                        return (
                          <div key={s.studentId} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50/20 transition-all">
                            <div className="space-y-1.5 max-w-md">
                              <div className="flex items-center gap-2.5">
                                <h5 className="font-bold text-gray-900 text-sm">{s.studentName}</h5>
                                <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                  {s.className}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 font-medium">
                                <span className="flex items-center gap-1 font-bold text-red-500">
                                  <AlertCircle size={12} />
                                  {activeCount} Catatan Aktif
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 font-bold text-emerald-600">
                                  <CheckCircle2 size={12} />
                                  {selesaiCount} Diselesaikan
                                </span>
                              </div>

                              {activeInt && (
                                <div className="mt-3 p-3 bg-violet-50/30 rounded-2xl border border-violet-100/50 space-y-1 text-xs">
                                  <p className="font-bold text-violet-700 flex items-center gap-1">
                                    <ShieldAlert size={12} />
                                    Intervensi Aktif Berjalan
                                  </p>
                                  <p className="text-gray-600 line-clamp-2 italic">&ldquo;{activeInt.interventionPlan}&rdquo;</p>
                                  <p className="text-[10px] text-gray-400 font-bold mt-1">
                                    Oleh: {activeInt.createdByName || 'Guru'} • {activeInt.incidentIds?.length || 0} catatan dicakup
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 md:self-center shrink-0">
                              {activeInt ? (
                                <button
                                  onClick={() => handleOpenEditInterventionModal(activeInt, s)}
                                  className="bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-md shadow-violet-50 transition-all cursor-pointer"
                                >
                                  Edit / Selesaikan
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleOpenNewInterventionModal(s, dukunganSubTab)}
                                  className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-md shadow-red-50 transition-all cursor-pointer"
                                >
                                  Mulai Dukungan
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Riwayat Intervensi Selesai (Completed Cases sidebar) */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden h-full">
                  <div className="p-6 border-b border-gray-50 bg-gray-50/30">
                    <h4 className="font-black text-gray-900 text-sm">Riwayat Intervensi Selesai</h4>
                    <p className="text-xs text-gray-400 mt-1">Daftar kasus yang sudah ditangani secara tuntas.</p>
                  </div>

                  <div className="divide-y divide-gray-100 overflow-y-auto max-h-[600px] flex-1">
                    {loadingInterventions ? (
                      <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                        <Loader2 size={24} className="animate-spin text-violet-500" />
                        <p className="text-xs font-black uppercase tracking-wider">Memuat riwayat...</p>
                      </div>
                    ) : (() => {
                      const completedInterventions = interventions.filter(int => 
                        int.issueType === dukunganSubTab && 
                        int.status === 'completed'
                      );

                      if (completedInterventions.length === 0) {
                        return (
                          <div className="p-12 text-center text-gray-400 italic text-xs">
                            Belum ada riwayat intervensi selesai untuk semester ini.
                          </div>
                        );
                      }

                      return completedInterventions.map(int => (
                        <div key={int.id} className="p-5 space-y-3 hover:bg-gray-50/40 transition-all">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-bold text-gray-800 text-sm">{int.studentName}</p>
                              <p className="text-[10px] font-bold text-blue-600 mt-0.5">Kelas: {int.className}</p>
                            </div>
                            <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
                              <Check size={10} />
                              Selesai
                            </span>
                          </div>

                          <div className="bg-gray-50 p-3 rounded-2xl border border-gray-50 space-y-2 text-xs text-gray-600">
                            <div>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Rencana Dukungan</span>
                              <p className="italic font-medium leading-relaxed mt-0.5">&ldquo;{int.interventionPlan}&rdquo;</p>
                            </div>
                            <div className="pt-2 border-t border-gray-200/50">
                              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider block">Catatan Hasil</span>
                              <p className="font-semibold text-gray-700 mt-0.5">{int.outcomeNote}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold pt-1">
                            <span>Oleh: {int.createdByName || 'Staff'}</span>
                            <span>{int.completedAt ? getFormattedDateLong(new Date(int.completedAt.seconds * 1000).toISOString().split('T')[0]) : 'Selesai'}</span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TIMELINE DETAILS MODAL / SIDE PANEL */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {selectedTimelineStudent && (
          <div className="fixed inset-0 z-50 flex justify-end">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTimelineStudent(null)}
              className="absolute inset-0 bg-black/60"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10"
            >
              {/* Panel Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-violet-50/10">
                <div>
                  <span className="text-[9px] font-black text-violet-600 uppercase tracking-widest bg-violet-50 px-2.5 py-1 rounded-full">
                    Log Keterlambatan & Pelanggaran Ringan
                  </span>
                  <h3 className="text-lg font-black text-gray-900 mt-2">{selectedTimelineStudent.studentName}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Kelas: {selectedTimelineStudent.className} • Periode: {rekapAcademicYear} SM {rekapSemester}</p>
                </div>
                <button
                  onClick={() => setSelectedTimelineStudent(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Panel Body / Timeline */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loadingTimeline ? (
                  <div className="py-24 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 size={24} className="animate-spin text-violet-500" />
                    <p className="text-xs font-medium uppercase tracking-widest">Menyusun timeline...</p>
                  </div>
                ) : studentTimeline.length === 0 ? (
                  <div className="py-24 text-center text-gray-400 italic text-xs">
                    Tidak ditemukan log untuk range filter ini.
                  </div>
                ) : (
                  <div className="relative border-l border-gray-100 ml-3 pl-6 space-y-6">
                    {studentTimeline.map((item) => (
                      <div key={item.id} className="relative">
                        
                        {/* Dot indicator */}
                        <div className={cn(
                          "absolute -left-[31px] top-1 p-1.5 rounded-full border-2 bg-white",
                          item.type === 'lateness' ? "text-blue-500 border-blue-500" : "text-amber-500 border-amber-500"
                        )}>
                          {item.type === 'lateness' ? <Clock size={10} /> : <ClipboardList size={10} />}
                        </div>

                        {/* Card Content */}
                        <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-50 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                              item.type === 'lateness' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                            )}>
                              {item.title}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                              {getFormattedDateLong(item.date)}
                            </span>
                          </div>

                          <p className="text-xs font-bold text-gray-800">
                            {item.category} {item.type === 'lateness' ? `(${item.timeLabel})` : ''}
                          </p>

                          <div className="bg-white/80 p-2.5 rounded-xl border border-gray-50 text-xs text-gray-600 font-medium leading-relaxed italic">
                            &ldquo;{item.reason}&rdquo;
                          </div>

                          <p className="text-[10px] font-bold text-gray-400">
                            Dicatat oleh: {item.recordedBy}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel Footer Actions */}
              <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                <button
                  type="button"
                  onClick={handleOpenPortfolio}
                  className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-black px-4 py-3 rounded-2xl shadow-lg shadow-violet-100 text-xs uppercase tracking-wider cursor-pointer"
                >
                  <BookOpen size={14} />
                  Buka Student Portfolio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* TEACHER SUPPORT INTERVENTION CREATION/EDIT MODAL */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {showInterventionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!savingIntervention) {
                  setShowInterventionModal(false);
                  resetInterventionForm();
                }
              }}
              className="absolute inset-0 bg-black/60"
            />

            <InterventionErrorBoundary onReset={() => {
              setShowInterventionModal(false);
              resetInterventionForm();
            }}>
              {/* Modal Box */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative z-10 border border-gray-100"
              >
              {/* Header */}
              <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-violet-50/10">
                <div>
                  <span className="text-[9px] font-black text-violet-600 uppercase tracking-widest bg-violet-50 px-2.5 py-1 rounded-full">
                    Dukungan Guru &bull; {selectedInterventionIssueType === 'lateness' ? 'Keterlambatan' : 'Pelanggaran Ringan'}
                  </span>
                  <h3 className="text-base font-black text-gray-900 mt-2">
                    {editingInterventionId ? 'Edit Sesi Dukungan Guru' : 'Mulai Dukungan Guru Baru'}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Siswa: <span className="font-bold text-gray-700">{selectedInterventionStudent?.studentName}</span> &bull; Kelas: {selectedInterventionStudent?.className}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!savingIntervention) {
                      setShowInterventionModal(false);
                      resetInterventionForm();
                    }
                  }}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Section 1: Select Incidents */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Pilih Catatan Kejadian yang Tercakup
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllIncidents}
                        className="text-[10px] font-bold text-violet-600 hover:text-violet-700 cursor-pointer"
                      >
                        Pilih Semua
                      </button>
                      <span className="text-gray-200 text-xs">|</span>
                      <button
                        type="button"
                        onClick={handleClearSelectedIncidents}
                        className="text-[10px] font-bold text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>

                  {studentEligibleIncidents.length === 0 ? (
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center text-xs text-gray-400 italic">
                      Tidak ada catatan {selectedInterventionIssueType === 'lateness' ? 'keterlambatan' : 'pelanggaran ringan'} aktif yang tersedia.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {studentEligibleIncidents.map(inc => {
                        const isChecked = selectedIncidentIds instanceof Set ? selectedIncidentIds.has(inc.id) : false;
                        return (
                          <div
                            key={inc.id}
                            onClick={() => handleToggleIncidentSelection(inc.id)}
                            className={cn(
                              "p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3",
                              isChecked
                                ? "bg-violet-50/20 border-violet-200"
                                : "bg-gray-50/50 border-gray-100 hover:bg-gray-50"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by click container
                              className="mt-0.5 rounded text-violet-600 focus:ring-violet-500/10 cursor-pointer"
                            />
                            <div className="flex-1 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className={cn(
                                  "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                                  selectedInterventionIssueType === 'lateness' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                                )}>
                                  {selectedInterventionIssueType === 'lateness' ? 'Keterlambatan' : 'Pelanggaran'}
                                </span>
                                <span className="font-bold text-gray-400">
                                  {getFormattedDateLong(inc.date)}
                                </span>
                              </div>
                              <p className="font-black text-gray-800 mt-1">
                                {selectedInterventionIssueType === 'lateness' 
                                  ? `Keterlambatan (${inc.timeString || inc.timeLabel || inc.minutesLate + ' menit'})` 
                                  : (inc.violationLabel || inc.violationType || 'Pelanggaran Ringan')
                                }
                              </p>
                              {inc.notes && (
                                <p className="text-gray-500 mt-1 italic font-medium leading-normal">&ldquo;{inc.notes}&rdquo;</p>
                              )}
                              {inc.violationReason && (
                                <p className="text-gray-500 mt-1 italic font-medium leading-normal">&ldquo;{inc.violationReason}&rdquo;</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedIncidentIds.length === 0 && (
                    <p className="text-[10px] text-red-500 font-bold">
                      * Anda harus memilih setidaknya 1 catatan kejadian untuk membuat/menyimpan intervensi.
                    </p>
                  )}
                </div>

                {/* Section 2: Intervention Plan */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                    Rencana Dukungan Guru (Intervensi)
                  </label>
                  <textarea
                    rows={3}
                    value={interventionPlanText}
                    onChange={(e) => setInterventionPlanText(e.target.value)}
                    placeholder="Rangkum rencana dukungan Guru (misal: bimbingan wali kelas, kesepakatan tata tertib, pemanggilan orang tua, bimbingan konseling)..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15 leading-relaxed"
                  />
                  {interventionPlanText.trim().length < 5 && (
                    <p className="text-[10px] text-red-500 font-bold">
                      * Rencana dukungan guru wajib diisi (minimal 5 karakter).
                    </p>
                  )}
                </div>

                {/* Section 3: Status selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                    Status Dukungan Guru
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setActiveInterventionStatus('in_progress')}
                      className={cn(
                        "p-4 rounded-2xl border text-left cursor-pointer transition-all flex flex-col gap-1",
                        activeInterventionStatus === 'in_progress'
                          ? "bg-amber-50/20 border-amber-300 ring-2 ring-amber-300/10"
                          : "bg-gray-50/30 border-gray-100 hover:bg-gray-50"
                      )}
                    >
                      <span className="text-xs font-black text-amber-600 flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin animate-none shrink-0" />
                        Sedang Berjalan
                      </span>
                      <span className="text-[10px] font-medium text-gray-400">Kasus masih dipantau dan belum tuntas.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveInterventionStatus('completed')}
                      className={cn(
                        "p-4 rounded-2xl border text-left cursor-pointer transition-all flex flex-col gap-1",
                        activeInterventionStatus === 'completed'
                          ? "bg-emerald-50/20 border-emerald-300 ring-2 ring-emerald-300/10"
                          : "bg-gray-50/30 border-gray-100 hover:bg-gray-50"
                      )}
                    >
                      <span className="text-xs font-black text-emerald-600 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="shrink-0" />
                        Selesai & Diselesaikan
                      </span>
                      <span className="text-[10px] font-medium text-gray-400">Seluruh kejadian yang dipilih ditandai diselesaikan.</span>
                    </button>
                  </div>
                </div>

                {/* Section 4: Outcome note (visible if completed) */}
                {activeInterventionStatus === 'completed' && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Catatan Hasil Penyelesaian (Wajib jika selesai)
                    </label>
                    <textarea
                      rows={3}
                      value={interventionOutcomeNote}
                      onChange={(e) => setInterventionOutcomeNote(e.target.value)}
                      placeholder="Tuliskan kesimpulan hasil intervensi (misal: siswa berjanji mematuhi aturan, orang tua kooperatif dan menandatangani surat kesepakatan)..."
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-violet-500/15 leading-relaxed"
                    />
                    {interventionOutcomeNote.trim().length < 5 && (
                      <p className="text-[10px] text-red-500 font-bold">
                        * Catatan hasil penyelesaian wajib diisi untuk mengubah status ke Selesai (minimal 5 karakter).
                      </p>
                    )}
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-50 bg-gray-50/30 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={savingIntervention}
                  onClick={() => {
                    setShowInterventionModal(false);
                    resetInterventionForm();
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={
                    savingIntervention ||
                    selectedIncidentIds.size === 0 ||
                    interventionPlanText.trim().length < 5 ||
                    (activeInterventionStatus === 'completed' && interventionOutcomeNote.trim().length < 5)
                  }
                  onClick={handleSaveIntervention}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-black px-8 py-2.5 rounded-xl shadow-md shadow-violet-50 transition-all text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingIntervention ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan Intervensi'
                  )}
                </button>
              </div>
            </motion.div>
            </InterventionErrorBoundary>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
