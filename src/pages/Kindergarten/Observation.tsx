import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Upload, Save, X, Sparkles, ArrowLeft,
  ChevronRight, LayoutGrid, Heart, BookOpen, 
  Languages, Brain, Activity, Palette, Compass,
  Music, Film, Star, CheckCircle2, Loader2, Image as ImageIcon,
  UserCheck, RefreshCw, AlertTriangle, AlertCircle, HelpCircle, Check, Info, Trash2, ClipboardList,
  Mic, MicOff, ArrowLeftRight, Lock, Unlock, Edit
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import type { KGActivity, KGDomain, KGGrading } from '../../types';
import { DEFAULT_STUDENTS, getStoredStudents, saveStoredStudents } from '../../lib/kindergartenWeeklyReport';
import ObservationBulkPeriodImport from './ObservationBulkPeriodImport';
import { collection, query, where, getDocs, getDoc, writeBatch, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { useTeacherAssignedClasses } from '../../hooks/useTeacherAssignedClasses';
import { normalizeStudentName } from '../../lib/namecentricResolver';
import { getKindergartenClasses, getKindergartenStudents, logFirestoreRead, resolveCanonicalClassId } from '../../lib/kindergartenMetadataCache';

const getStudentObs = (obsSource: Record<string, StudentObservation> | undefined, student: any): StudentObservation => {
  if (!obsSource) return { grading: null, notes: '', photo: null };
  if (obsSource[student.id]) return obsSource[student.id];
  if (student.oldLuminaId && obsSource[student.oldLuminaId]) return obsSource[student.oldLuminaId];
  if (student.nis && obsSource[student.nis]) return obsSource[student.nis];
  if (student.name) {
    const normStudentName = normalizeStudentName(student.name);
    const keyMatch = Object.keys(obsSource).find(k => {
      return normalizeStudentName(k) === normStudentName;
    });
    if (keyMatch) return obsSource[keyMatch];
  }
  return { grading: null, notes: '', photo: null };
};

const getStudentObsStrict = (obsSource: Record<string, StudentObservation> | undefined, student: any): StudentObservation => {
  if (!obsSource || !student) return { grading: null, notes: '', photo: null };
  if (student.id && obsSource[student.id]) return obsSource[student.id];
  if (student.oldLuminaId && obsSource[student.oldLuminaId]) return obsSource[student.oldLuminaId];
  if (student.nis && obsSource[student.nis]) return obsSource[student.nis];
  return { grading: null, notes: '', photo: null };
};

const isValidObservationSession = (session: any): boolean => {
  if (!session) return false;
  
  // Exclude holiday sessions
  const isHoliday = 
    session.specialActivityType === 'holiday' || 
    (session.activity === 'SPECIAL_ACTIVITY' && session.specialActivityType === 'holiday') ||
    String(session.title || '').toLowerCase().includes('libur') ||
    String(session.specialActivityName || '').toLowerCase().includes('libur');
  if (isHoliday) return false;

  // Exclude weekly reports or report summaries or report documentations
  const isWeeklyReport = 
    session.isWeeklyReport === true || 
    session.type === 'weekly-report' || 
    session.category === 'weekly-report' ||
    String(session.title || '').toLowerCase().includes('weekly report') ||
    String(session.caption || '').toLowerCase().includes('weekly report') ||
    String(session.title || '').toLowerCase().includes('dokumentasi mingguan') ||
    String(session.activity || '').toLowerCase().includes('weekly-report') ||
    String(session.activity || '').toLowerCase().includes('weekly_report');
  if (isWeeklyReport) return false;

  // Must have a valid observations map
  if (!session.observations || typeof session.observations !== 'object') {
    return false;
  }

  return true;
};

const cleanFirestoreData = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(cleanFirestoreData);
  }
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val === undefined) continue;
      if (val instanceof Map) {
        clean[key] = cleanFirestoreData(Object.fromEntries(val));
      } else if (val instanceof Set) {
        clean[key] = Array.from(val).map(cleanFirestoreData);
      } else {
        clean[key] = cleanFirestoreData(val);
      }
    }
    return clean;
  }
  return obj;
};

interface StudentObservation {
  grading: KGGrading | null;
  notes: string;
  photo: string | null;
}

const activities: { id: KGActivity; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'MAKE_BELIEVE', label: 'Make-Believe', icon: <Compass />, color: 'teal' },
  { id: 'ISLAMIC_AWARENESS', label: 'Islamic Awareness', icon: <Heart />, color: 'emerald' },
  { id: 'LIBRARY_LITERACY', label: 'Library & Literacy', icon: <BookOpen />, color: 'blue' },
  { id: 'DISCOVERY', label: 'Discovery', icon: <Brain />, color: 'orange' },
  { id: 'BLOCKS_BUILDING', label: 'Blocks & Building', icon: <LayoutGrid />, color: 'indigo' },
  { id: 'ART_EXPLORATIONS', label: 'Art Explorations', icon: <Palette />, color: 'purple' },
  { id: 'ENGLISH', label: 'English', icon: <Languages />, color: 'sky' },
  { id: 'MUSIC', label: 'Music', icon: <Music />, color: 'rose' },
  { id: 'OUTSIDE', label: 'Outside', icon: <Activity />, color: 'lime' },
  { id: 'AUDIO_VISUAL', label: 'Audio Visual', icon: <Film />, color: 'violet' },
  { id: 'SPECIAL_PROGRAM', label: 'Special Program', icon: <Sparkles />, color: 'pink' },
  { id: 'SPECIAL_ACTIVITY', label: 'Kegiatan Khusus', icon: <Star />, color: 'amber' },
];

const domains: { id: KGDomain; label: string; desc: string }[] = [
  { id: 'AGAMA_BUDI_PEKERTI', label: 'Nilai Agama & Budi Pekerti', desc: 'Mengenal tuhan, ibadah harian, budi pekerti mulia' },
  { id: 'SOSIAL_EMOSIONAL', label: 'Sosial-Emosional', desc: 'Regulasi emosi, kemandirian, interaksi sosial, gotong royong' },
  { id: 'BAHASA', label: 'Bahasa', desc: 'Komunikasi ekspresif, reseptif, keaksaraan awal' },
  { id: 'KOGNITIF', label: 'Kognitif', desc: 'Problem solving, berpikir logis, pemecahan masalah sederhana' },
  { id: 'FISIK_MOTORIK', label: 'Fisik-Motorik', desc: 'Motorik kasar, motorik halus, kesehatan fisik' },
  { id: 'SENI', label: 'Seni', desc: 'Apresiasi karya, kreasi seni musik, rupa, peran' },
];

const grades: { id: KGGrading; label: string; color: string; desc: string }[] = [
  { id: 'BB', label: 'Belum Berkembang', color: 'bg-rose-100 text-rose-700 border-rose-200', desc: 'Anak perlu bimbingan penuh' },
  { id: 'MB', label: 'Mulai Berkembang', color: 'bg-yellow-105 text-yellow-800 border-yellow-250', desc: 'Anak mulai mencoba secara mandiri' },
  { id: 'BSH', label: 'Berkembang Sesuai Harapan', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', desc: 'Anak konsisten melakukan secara mandiri' },
  { id: 'BSB', label: 'Berkembang Sangat Baik', color: 'bg-teal-100 text-teal-800 border-teal-200', desc: 'Anak mandiri dan mampu membantu teman' },
  { id: 'ABSENT', label: 'Tidak Masuk', color: 'bg-gray-100 text-gray-500 border-gray-200', desc: 'Siswa tidak datang ke sekolah' },
  { id: 'NOT_PARTICIPATING', label: 'Tidak Mengikuti Kegiatan', color: 'bg-gray-100 text-gray-500 border-gray-200', desc: 'Ada di sekolah tapi tidak mengikuti sesi' },
];

const months = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' }
];

const getJakartaDate = (d?: Date): Date => {
  const date = d || new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '2026', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
  
  return new Date(year, month, day, 0, 0, 0, 0);
};

export default function Observation() {
  const { activeYear, activeSemester } = useAcademicYear();
  const [searchParams] = useSearchParams();
  const paramClassId = searchParams.get('classId');
  const paramDate = searchParams.get('date');
  const paramActivity = searchParams.get('activity');
  const paramDomain = searchParams.get('domain');
  const { profile } = useAuth();

  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  const [students, setStudents] = React.useState<any[]>(() => getStoredStudents());
  const {
    assignedClasses: classes,
    assignedClassIds,
    primaryClassId,
    isRestrictedToAssignedClasses,
    loading: isLoadingClasses,
    setLastSelectedClassId
  } = useTeacherAssignedClasses({
    userId: profile?.uid,
    academicYearId: activeYear || '2026/2027'
  });

  const canManageKindergartenObservation = React.useMemo(() => {
    if (!profile) return false;
    const role = profile.role;
    const unitId = profile.unitId;

    if (role === 'SUPER_ADMIN') return true;

    // Check if role is one of authorized Kindergarten staff roles
    const authorizedRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'TEACHER', 'HOMEROOM_TEACHER', 'kindergarten_subject_teacher', 'BK_MENTOR'];
    if (!authorizedRoles.includes(role)) return false;

    // If unitId is KINDERGARTEN, they are authorized
    if (unitId === 'KINDERGARTEN') return true;

    // If they have selected a class, verify if they are assigned to this class
    if (selectedClassId) {
      if (isRestrictedToAssignedClasses) {
        return Array.isArray(assignedClassIds) && assignedClassIds.includes(selectedClassId);
      }
      return true;
    }

    // Default fallback so they aren't blocked initially
    return true;
  }, [profile, selectedClassId, isRestrictedToAssignedClasses, assignedClassIds]);

  // Daily context state
  const [dailyContext, setDailyContext] = React.useState<any>(null);
  const [isDailyContextLoading, setIsDailyContextLoading] = React.useState<boolean>(false);
  const [isEditingDailyContext, setIsEditingDailyContext] = React.useState<boolean>(false);
  const isLockedByContext = false;

  // View States
  const [activeTab, setActiveTab] = React.useState<'input' | 'weekly' | 'recap'>('input');

  // Weekly Observation states
  const [weeklyStartDate, setWeeklyStartDate] = React.useState<Date>(() => {
    const jakartaToday = getJakartaDate();
    const day = jakartaToday.getDay();
    const diff = jakartaToday.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(jakartaToday);
    mon.setDate(diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
  });
  const [weeklyObservations, setWeeklyObservations] = React.useState<any[]>([]);
  const [isWeeklyLoading, setIsWeeklyLoading] = React.useState<boolean>(false);
  const [multipleSessionsModalData, setMultipleSessionsModalData] = React.useState<{
    student: any;
    date: Date;
    dateStr: string;
    sessions: any[];
  } | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = React.useState<string | null>(null);
  const [highlightedStudentId, setHighlightedStudentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (highlightedStudentId) {
      const element = document.getElementById(`student-row-${highlightedStudentId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    }
  }, [highlightedStudentId]);

  const loadWeeklyObservations = async () => {
    if (!selectedClassId) return;
    setIsWeeklyLoading(true);
    try {
      const canonicalClassId = resolveCanonicalClassId(selectedClassId, classes) || selectedClassId;
      const activeClassObj = classes.find(c => c.id === canonicalClassId || c.id === selectedClassId);
      
      const mon = new Date(weeklyStartDate);
      const fri = new Date(weeklyStartDate);
      fri.setDate(fri.getDate() + 4);
      
      const monStr = formatDateLocal(mon);
      const friStr = formatDateLocal(fri);
      
      const qObs = query(
        collection(db, 'observations'),
        where('date', '>=', monStr),
        where('date', '<=', friStr)
      );
      
      const qSnap = await getDocs(qObs);
      logFirestoreRead('observations', qSnap.docs.length || 1);
      
      const docsList: any[] = [];
      qSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        if (isDocForClass(d, canonicalClassId, activeClassObj, students)) {
          docsList.push({ ...d, id: docSnap.id });
        }
      });
      
      setWeeklyObservations(docsList);
    } catch (err) {
      console.error("[Weekly] Error loading observations:", err);
      toast.error("Gagal memuat rekap mingguan.");
    } finally {
      setIsWeeklyLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'weekly' && selectedClassId && classes.length > 0 && students.length > 0) {
      loadWeeklyObservations();
    }
  }, [activeTab, selectedClassId, weeklyStartDate, classes, students]);
  
  const getWeekDates = (mon: Date): Date[] => {
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const formatWeekRange = (monday: Date): string => {
    const getMonthNameIndo = (m: number) => {
      const names = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      return names[m];
    };
    
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    
    const mDay = monday.getDate();
    const mMonth = getMonthNameIndo(monday.getMonth());
    const mYear = monday.getFullYear();
    
    const fDay = friday.getDate();
    const fMonth = getMonthNameIndo(friday.getMonth());
    const fYear = friday.getFullYear();
    
    if (mYear !== fYear) {
      return `${mDay} ${mMonth} ${mYear} – ${fDay} ${fMonth} ${fYear}`;
    } else if (monday.getMonth() !== friday.getMonth()) {
      return `${mDay} ${mMonth} – ${fDay} ${fMonth} ${mYear}`;
    } else {
      return `${mDay} – ${fDay} ${mMonth} ${mYear}`;
    }
  };

  const formatWeekdayHeader = (date: Date): { dayName: string; dateStr: string } => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthsAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
    return {
      dayName: days[date.getDay()],
      dateStr: `${date.getDate()} ${monthsAbbr[date.getMonth()]} ${date.getFullYear()}`
    };
  };

  const isFutureDate = (d: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    return target > today;
  };

  const getFullGradingLabel = (code: string): string => {
    const g = grades.find(item => item.id === code);
    return g ? `${g.id} — ${g.label}` : code;
  };

  const getValidPhotoForStudentInSession = (session: any, obs: any): string | null => {
    if (!session || !obs) return null;

    // 1. Check if the session is a holiday
    const isHoliday = 
      session.specialActivityType === 'holiday' || 
      (session.activity === 'SPECIAL_ACTIVITY' && session.specialActivityType === 'holiday') ||
      String(session.title || '').toLowerCase().includes('libur') ||
      String(session.specialActivityName || '').toLowerCase().includes('libur');
    if (isHoliday) {
      return null;
    }

    // 2. Check if the session is weekly-report documentation or documentation-only
    const isWeeklyReportDoc = 
      session.isWeeklyReport === true || 
      session.type === 'weekly-report' || 
      session.category === 'weekly-report' ||
      String(session.title || '').toLowerCase().includes('weekly report') ||
      String(session.caption || '').toLowerCase().includes('weekly report') ||
      String(session.title || '').toLowerCase().includes('dokumentasi mingguan');
    if (isWeeklyReportDoc) {
      return null;
    }

    // 3. Resolve the photo using the required lookup chain:
    // student grading record -> photo attached to student record
    if (obs.photo && typeof obs.photo === 'string' && obs.photo.trim() !== '') {
      return obs.photo.trim();
    }

    // If the student-specific record doesn't have a photo, check the exact observation session's general photo.
    const generalPhoto = session.generalPhotoUrl || session.photoUrl || session.generalPhoto;
    if (generalPhoto && typeof generalPhoto === 'string' && generalPhoto.trim() !== '') {
      return generalPhoto.trim();
    }

    return null;
  };

  const handleEmptyCellClick = (studentId: string, dateStr: string) => {
    setSelectedClassId(selectedClassId);
    setObservationDate(dateStr);
    
    const params = new URLSearchParams(window.location.search);
    params.set('classId', selectedClassId);
    params.set('date', dateStr);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    
    setHighlightedStudentId(studentId);
    setActiveTab('input');
    toast.info(`Beralih ke lembar input untuk ${dateStr}. Silakan pilih Sentra & Domain.`);
  };

  const handleFilledCellClick = (item: any, studentId: string) => {
    const { session } = item;
    setSelectedClassId(session.classId);
    setObservationDate(session.date || session.observationDate);
    setSelectedActivity(session.activity || session.centerId || "");
    setSelectedDomain(session.activity === 'SPECIAL_ACTIVITY' ? 'none' : (session.domain || session.domainId || ""));
    setCurrentDocId(session.id);
    
    const params = new URLSearchParams(window.location.search);
    params.set('classId', session.classId);
    params.set('date', session.date || session.observationDate);
    if (session.activity) params.set('activity', session.activity);
    if (session.domain) params.set('domain', session.domain);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    
    setHighlightedStudentId(studentId);
    setActiveTab('input');
    toast.success(`Membuka sesi "${session.title || 'Observasi'}" untuk diedit/ditinjau.`);
  };

  // Helper to get local date in YYYY-MM-DD format
  const formatDateLocal = (date: Date): string => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const da = String(date.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  // Helper to resolve classId from students within the observations map of an unscoped document
  const getLegacyDocClassId = (observationsField: Record<string, any>, globalStudents: any[]): string | null => {
    if (!observationsField) return null;
    const observationKeys = Object.keys(observationsField);
    for (const key of observationKeys) {
      const foundStudent = globalStudents.find(s => s.id === key || s.oldLuminaId === key || s.nis === key);
      if (foundStudent && foundStudent.classId) {
        return foundStudent.classId;
      }
    }
    return null;
  };

  // Check if a document matches the selected class (including legacy documents)
  const isDocForClass = (
    d: any,
    targetClassId: string,
    activeClassObj: any,
    globalStudents: any[]
  ): boolean => {
    if (!targetClassId) return false;

    const canonicalTargetClassId = resolveCanonicalClassId(targetClassId, classes) || targetClassId;

    // Strict match if classId exists on document
    if (d.classId && d.classId !== 'unassigned') {
      const docCanonicalId = resolveCanonicalClassId(d.classId, classes) || d.classId;
      return docCanonicalId === canonicalTargetClassId;
    }

    // Specific override for "Pra TK Test Kelas" on 11 August
    const docDate = d.date || d.observationDate;
    const isAug11 = docDate === '2026-08-11' || docDate === '2025-08-11' || docDate?.includes('08-11');
    const isPraTKTest = d.generalPhotoUrl?.includes('Pra%20TK') || d.generalPhoto?.includes('Pra%20TK') || d.title?.includes('Pra TK') || d.caption?.includes('Pra TK');

    if (isAug11 && isPraTKTest) {
      const className = (activeClassObj?.name || '').toLowerCase();
      return className.includes('pra tk') || className.includes('pratk');
    }

    // Fallback: check if students inside observations match the selected class
    if (d.observations && Object.keys(d.observations).length > 0) {
      const resolvedClassId = getLegacyDocClassId(d.observations, globalStudents);
      if (resolvedClassId) {
        const docCanonicalId = resolveCanonicalClassId(resolvedClassId, classes) || resolvedClassId;
        return docCanonicalId === canonicalTargetClassId;
      }
    }

    return false;
  };

  // Date State for Observation Input
  const [observationDate, setObservationDate] = React.useState<string>(() => paramDate || formatDateLocal(new Date()));
  
  // Monthly Recap Filter States
  const [recapMonth, setRecapMonth] = React.useState<number>(() => new Date().getMonth() + 1);
  const [recapYear, setRecapYear] = React.useState<number>(() => new Date().getFullYear());

  // Auto-adjust recapYear based on the selected recapMonth and academic year
  React.useEffect(() => {
    if (!activeYear) return;
    const parts = activeYear.split('/');
    if (parts.length === 2) {
      const yearStart = parseInt(parts[0], 10);
      const yearEnd = parseInt(parts[1], 10);
      // Months Jul-Dec (7-12) are in the first year, Jan-Jun (1-6) are in the second year
      if (recapMonth >= 7) {
        setRecapYear(yearStart);
      } else {
        setRecapYear(yearEnd);
      }
    } else if (parts.length === 1 && parts[0]) {
      const parsed = parseInt(parts[0], 10);
      if (!isNaN(parsed)) {
        setRecapYear(parsed);
      }
    }
  }, [recapMonth, activeYear]);
  const [recapData, setRecapData] = React.useState<any[]>([]);
  const [isBgFetching, setIsBgFetching] = React.useState<boolean>(false);
  const [recapSubView, setRecapSubView] = React.useState<'matrix' | 'sessions' | 'monthly_table'>('monthly_table');

  // Popup/Modal detail states
  const [selectedDetailCell, setSelectedDetailCell] = React.useState<{ student: any; domain: any; entries: any[] } | null>(null);
  const [selectedDetailSession, setSelectedDetailSession] = React.useState<any | null>(null);

  // States for Editing Sesi and Pindahkan Siswa in Sesi Detail Popup
  const [isEditingPopupSession, setIsEditingPopupSession] = React.useState<boolean>(false);
  const [popupActivity, setPopupActivity] = React.useState<KGActivity | "">("");
  const [popupDomain, setPopupDomain] = React.useState<KGDomain | "">("");
  
  const [movingStudent, setMovingStudent] = React.useState<any | null>(null);
  const [movingStudentObs, setMovingStudentObs] = React.useState<any | null>(null);
  const [moveTargetActivity, setMoveTargetActivity] = React.useState<KGActivity | "">("");
  const [moveTargetDomain, setMoveTargetDomain] = React.useState<KGDomain | "">("");
  const [showMoveModal, setShowMoveModal] = React.useState<boolean>(false);

  const [selectedActivity, setSelectedActivity] = React.useState<KGActivity | "">(() => (paramActivity as KGActivity) || "");
  const [selectedDomain, setSelectedDomain] = React.useState<KGDomain | "">(() => (paramDomain as KGDomain) || "");
  const [isImportOpen, setIsImportOpen] = React.useState<boolean>(false);
  
  // High fidelity general photo (Starts pre-filled with a beautiful school activity image)
  const [generalPhoto, setGeneralPhoto] = React.useState<string | null>(null);
  const [docCreatedAt, setDocCreatedAt] = React.useState<number | null>(null);
  const [docCreatedBy, setDocCreatedBy] = React.useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<boolean>(false);

  // General note state declarations
  const [generalNote, setGeneralNote] = React.useState<string>("");
  const [generalNoteUpdatedAt, setGeneralNoteUpdatedAt] = React.useState<number | null>(null);
  const [generalNoteUpdatedBy, setGeneralNoteUpdatedBy] = React.useState<string | null>(null);
  const [generalNoteUpdatedByName, setGeneralNoteUpdatedByName] = React.useState<string | null>(null);

  // Special Activity state declarations
  const [specialActivityName, setSpecialActivityName] = React.useState<string>("");
  const [specialActivityType, setSpecialActivityType] = React.useState<'activity' | 'holiday'>('activity');

  // Popup detail general note editing states
  const [isEditingPopupGeneralNote, setIsEditingPopupGeneralNote] = React.useState<boolean>(false);
  const [popupGeneralNoteText, setPopupGeneralNoteText] = React.useState<string>("");

  React.useEffect(() => {
    if (selectedDetailSession) {
      setPopupGeneralNoteText(selectedDetailSession.generalNote || "");
      setIsEditingPopupGeneralNote(false);
    }
  }, [selectedDetailSession]);

  React.useEffect(() => {
    if (selectedActivity === 'SPECIAL_ACTIVITY') {
      setSelectedDomain(null);
    }
  }, [selectedActivity]);

  // New session level state management for "Sesi Terkunci" & "Edit Sentra & Domain"
  const [isSessionLocked, setIsSessionLocked] = React.useState<boolean>(false);
  const [isEditingSession, setIsEditingSession] = React.useState<boolean>(false);
  const [sessionStatus, setSessionStatus] = React.useState<'new' | 'locked'>('new');
  const [isLoadingSession, setIsLoadingSession] = React.useState<boolean>(false);
  const [currentDocId, setCurrentDocId] = React.useState<string | null>(null);
  const [originalActivity, setOriginalActivity] = React.useState<KGActivity | null>(null);
  const [originalDomain, setOriginalDomain] = React.useState<KGDomain | null>(null);
  const [showEditConfirm, setShowEditConfirm] = React.useState<boolean>(false);
  const [showSaveEditConfirm, setShowSaveEditConfirm] = React.useState<boolean>(false);
  const [gradingSaveStatus, setGradingSaveStatus] = React.useState<Record<string, 'idle' | 'saving' | 'success' | 'error'>>({});
  
  const [contextSaveStatus, setContextSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [generalPhotoUploadStatus, setGeneralPhotoUploadStatus] = React.useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

  const studentAutosaveTimersRef = React.useRef<Record<string, any>>({});
  const autoSaveTimerRef = React.useRef<any>(null);
  const observationsRef = React.useRef<Record<string, StudentObservation>>({});
  const lastSavedGeneralNoteRef = React.useRef<string>("");

  // Cancel pending timers on context changes
  React.useEffect(() => {
    return () => {
      Object.values(studentAutosaveTimersRef.current).forEach(timer => clearTimeout(timer as any));
      studentAutosaveTimersRef.current = {};
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current as any);
      }
    };
  }, [selectedClassId, observationDate, selectedActivity, selectedDomain]);

  const saveGeneralNoteAutosave = async (noteToSave: string) => {
    if (!selectedClassId || !observationDate) return;
    setGeneralNoteSaveStatus('saving');
    try {
      const canonicalClassId = resolveCanonicalClassId(selectedClassId, classes) || selectedClassId;
      const noteText = (noteToSave || "").trim();
      const now = Date.now();
      const updatedByUid = profile?.uid || profile?.email || 'system';
      const updatedByName = profile?.displayName || profile?.email || 'Anda';

      // Save locally
      const localKey = `kg_daily_note_${canonicalClassId}_${observationDate}`;
      localStorage.setItem(localKey, noteText);

      // Save to daily context
      const contextId = `${canonicalClassId}_${observationDate}`;
      const contextRef = doc(db, 'kindergarten_observation_daily_contexts', contextId);
      const activeClassObj = classes.find((c: any) => c.id === canonicalClassId || c.id === selectedClassId);

      await setDoc(contextRef, {
        classId: canonicalClassId,
        className: activeClassObj?.name || 'General',
        observationDate: observationDate,
        academicYear: activeYear || '2026/2027',
        semester: activeSemester || '1',
        generalNote: noteText,
        generalNoteUpdatedAt: now,
        generalNoteUpdatedBy: updatedByUid,
        generalNoteUpdatedByName: updatedByName,
        updatedAt: now,
        updatedBy: updatedByUid
      }, { merge: true });

      // Save to observation session doc if selected
      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');
      const sessionDocId = `${canonicalClassId}_${activeSentra}_${activeDomain}_${observationDate}`;
      const sessionDocRef = doc(db, 'observations', sessionDocId);
      try {
        await setDoc(sessionDocRef, {
          generalNote: noteText,
          generalNoteUpdatedAt: now,
          generalNoteUpdatedBy: updatedByUid,
          generalNoteUpdatedByName: updatedByName,
          updatedAt: now
        }, { merge: true });
      } catch (e) {
        console.warn(e);
      }

      lastSavedGeneralNoteRef.current = noteToSave;
      setGeneralNoteUpdatedAt(now);
      setGeneralNoteUpdatedBy(updatedByUid);
      setGeneralNoteUpdatedByName(updatedByName);
      setGeneralNoteSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setGeneralNoteSaveStatus('error');
    }
  };

  React.useEffect(() => {
    if (generalNote === lastSavedGeneralNoteRef.current) {
      return;
    }

    setGeneralNoteSaveStatus('saving');

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveGeneralNoteAutosave(generalNote);
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [generalNote]);

  // Observations for students, keyed by studentId
  const [observations, setObservations] = React.useState<Record<string, StudentObservation>>({});

  React.useEffect(() => {
    observationsRef.current = observations;
  }, [observations]);

  // Enrollment Audit States
  const [auditLoading, setAuditLoading] = React.useState<boolean>(false);
  const [auditResults, setAuditResults] = React.useState<any[] | null>(null);
  const [showAuditPanel, setShowAuditPanel] = React.useState<boolean>(false);

  const handleRunEnrollmentAudit = async () => {
    setAuditLoading(true);
    setAuditResults(null);
    try {
      const canonicalIds = new Set(classes.map(c => c.id));
      const enrollmentsRef = collection(db, 'enrollments');
      const q = query(
        enrollmentsRef,
        where('unitId', '==', 'KINDERGARTEN'),
        where('academicYear', '==', '2026/2027')
      );
      const snap = await getDocs(q);
      logFirestoreRead('enrollments', snap.docs.length);

      const auditList: any[] = [];
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const rawClassId = data.classId || '';

        // Only audit if classId is non-canonical
        if (rawClassId && !canonicalIds.has(rawClassId)) {
          const resolvedCanonicalId = resolveCanonicalClassId(rawClassId, classes);
          
          let studentName = 'Unknown Student';
          if (data.studentId) {
            const studentDocRef = doc(db, 'students', data.studentId);
            const studentSnap = await getDoc(studentDocRef);
            logFirestoreRead('students', 1);
            if (studentSnap.exists()) {
              studentName = studentSnap.data().fullName || studentSnap.data().name || 'Unknown Student';
            }
          }

          auditList.push({
            enrollmentDocId: docSnap.id,
            studentId: data.studentId || '',
            studentName,
            rawClassId,
            resolvedCanonicalClassId: resolvedCanonicalId || 'Unresolved/Ambiguous'
          });
        }
      }

      setAuditResults(auditList);
      toast.success(`Audit Selesai! Menemukan ${auditList.length} data non-canonical.`);
    } catch (auditErr: any) {
      console.error("[Audit Error]", auditErr);
      toast.error(`Gagal menjalankan audit: ${auditErr.message || String(auditErr)}`);
    } finally {
      setAuditLoading(false);
    }
  };

  // Fetch Daily Context when Class or Date changes
  React.useEffect(() => {
    let active = true;
    if (!selectedClassId || !observationDate) {
      setDailyContext(null);
      setIsEditingDailyContext(false);
      return;
    }

    async function fetchDailyContext() {
      setIsDailyContextLoading(true);
      const canonicalClassId = resolveCanonicalClassId(selectedClassId, classes) || selectedClassId;

      // 1. Gather all existing sessions for canonicalClassId + selectedDate
      const localSessions: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kg_obs_hist_')) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const payload = JSON.parse(raw);
              const obsTimestamp = payload.timestamp || Date.now();
              const obsDateStr = payload.date || formatDateLocal(new Date(obsTimestamp));
              if (obsDateStr === observationDate) {
                const rawDocClassId = payload.classId || '';
                const docCanonicalClassId = resolveCanonicalClassId(rawDocClassId, classes) || rawDocClassId;
                if (docCanonicalClassId === canonicalClassId) {
                  localSessions.push({ ...payload, id: key });
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }
      }

      const firestoreSessions: any[] = [];
      try {
        const qObs = query(
          collection(db, 'observations'),
          where('date', '==', observationDate)
        );
        const qSnap = await getDocs(qObs);
        logFirestoreRead('observations', qSnap.docs.length || 1);
        qSnap.docs.forEach(docSnap => {
          const d = docSnap.data();
          const rawDocClassId = d.classId || '';
          const docCanonicalClassId = resolveCanonicalClassId(rawDocClassId, classes) || rawDocClassId;
          if (docCanonicalClassId === canonicalClassId) {
            firestoreSessions.push({ ...d, id: docSnap.id });
          }
        });
      } catch (fsErr) {
        console.warn("[Fetch Session Context] Firestore error:", fsErr);
      }

      const allSessions = [...firestoreSessions, ...localSessions];

      // Extract context fields helper
      const extractSentraAndDomain = (docData: any) => {
        const sentra = docData.activity || docData.centerId || docData.title || docData.selectedActivity || docData.sentraId;
        const domain = docData.domain || docData.domainId || docData.caption || docData.selectedDomain;
        return { sentra, domain };
      };

      let foundContextSource: 'SESSION' | 'DAILY_CONTEXT' | 'EMPTY' = 'EMPTY';
      let resolvedSentraId: string = "";
      let resolvedDomainId: string = "";
      let resolvedDailyContextPayload: any = null;

      // Rule 1: Precedence goes to an existing observation session
      const validSession = allSessions.find(s => {
        const { sentra, domain } = extractSentraAndDomain(s);
        return sentra && (sentra === 'SPECIAL_ACTIVITY' || domain);
      });

      if (validSession) {
        const { sentra, domain } = extractSentraAndDomain(validSession);
        resolvedSentraId = sentra;
        resolvedDomainId = (sentra === 'SPECIAL_ACTIVITY') ? "" : (domain || "");
        foundContextSource = 'SESSION';
        
        resolvedDailyContextPayload = {
          classId: selectedClassId,
          className: classes.find((c: any) => c.id === selectedClassId)?.name || 'General',
          observationDate: observationDate,
          sentraId: resolvedSentraId,
          sentraName: resolvedSentraId === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (activities.find(a => a.id === resolvedSentraId)?.label || resolvedSentraId),
          domainId: resolvedSentraId === 'SPECIAL_ACTIVITY' ? null : resolvedDomainId,
          domainName: resolvedSentraId === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (domains.find(d => d.id === resolvedDomainId)?.label || resolvedDomainId),
          isSessionPrecedence: true,
        };
      }

      // Rule 2: If no valid session context, query daily context
      if (foundContextSource === 'EMPTY') {
        const contextId = `${selectedClassId}_${observationDate}`;
        const contextRef = doc(db, 'kindergarten_observation_daily_contexts', contextId);
        try {
          const snap = await getDoc(contextRef);
          logFirestoreRead('dailyContexts', 1);
          if (snap.exists()) {
            const data = snap.data();
            resolvedSentraId = data.sentraId || "";
            resolvedDomainId = data.domainId || "";
            resolvedDailyContextPayload = data;
            foundContextSource = 'DAILY_CONTEXT';
          }
        } catch (err) {
          console.error("Error fetching daily context doc:", err);
        }
      }

      // Rule 3: If neither, empty optional context state
      if (foundContextSource === 'EMPTY') {
        resolvedDailyContextPayload = null;
        if (!paramActivity && !paramDomain) {
          resolvedSentraId = "";
          resolvedDomainId = "";
        } else {
          resolvedSentraId = paramActivity || "";
          resolvedDomainId = paramDomain || "";
        }
      }

      // DEV-only console debugging
      console.log(
        `[DEV-only Context Diagnostic]\n` +
        `- canonical classId: ${canonicalClassId}\n` +
        `- selected date: ${observationDate}\n` +
        `- session documents found count: ${allSessions.length}\n` +
        `- session IDs: ${JSON.stringify(allSessions.map(s => s.id))}\n` +
        `- activity/centerId/title values: ${JSON.stringify(allSessions.map(s => s.activity || s.centerId || s.title || s.selectedActivity || s.sentraId))}\n` +
        `- domain/domainId/caption values: ${JSON.stringify(allSessions.map(s => s.domain || s.domainId || s.caption || s.selectedDomain))}\n` +
        `- daily context found: ${foundContextSource === 'DAILY_CONTEXT' ? 'YES' : 'NO'}\n` +
        `- final source chosen: ${foundContextSource}`
      );

      if (!active) return;

      setDailyContext(resolvedDailyContextPayload);
      setIsEditingDailyContext(false);

      if (resolvedSentraId) {
        setSelectedActivity(resolvedSentraId as any);
      } else if (!paramActivity) {
        setSelectedActivity("");
      }

      if (resolvedDomainId !== undefined) {
        setSelectedDomain(resolvedDomainId as any);
      } else if (!paramDomain) {
        setSelectedDomain("");
      }

      setIsDailyContextLoading(false);
    }

    fetchDailyContext();
    return () => {
      active = false;
    };
  }, [selectedClassId, observationDate, paramActivity, paramDomain, classes]);

  // Save/Update Daily Context to Firestore
  const handleSaveDailyContext = async (targetActivity: KGActivity | "", targetDomain: KGDomain | "") => {
    if (!selectedClassId || !observationDate) return;
    if (!targetActivity) {
      toast.error("Silakan pilih Sentra terlebih dahulu.");
      return;
    }
    if (targetActivity !== 'SPECIAL_ACTIVITY' && !targetDomain) {
      toast.error("Silakan pilih Domain terlebih dahulu.");
      return;
    }

    setContextSaveStatus('saving');
    const contextId = `${selectedClassId}_${observationDate}`;
    const contextRef = doc(db, 'kindergarten_observation_daily_contexts', contextId);
    
    const activeClassObj = classes.find((c: any) => c.id === selectedClassId);
    
    const payload = {
      classId: selectedClassId,
      className: activeClassObj?.name || 'General',
      observationDate: observationDate,
      academicYear: activeYear || '2026/2027',
      semester: activeSemester || '1',
      sentraId: targetActivity,
      sentraName: targetActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (activities.find(a => a.id === targetActivity)?.label || targetActivity),
      domainId: targetActivity === 'SPECIAL_ACTIVITY' ? null : targetDomain,
      domainName: targetActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (domains.find(d => d.id === targetDomain)?.label || targetDomain),
      updatedAt: Date.now(),
      updatedBy: profile?.uid || 'system',
    };

    try {
      const isNew = !dailyContext;
      const finalPayload = {
        ...payload,
        createdAt: isNew ? Date.now() : (dailyContext?.createdAt || Date.now()),
        createdBy: isNew ? (profile?.uid || 'system') : (dailyContext?.createdBy || 'system'),
      };

      await setDoc(contextRef, finalPayload, { merge: true });
      toast.success("Konteks Kegiatan berhasil disimpan!");
      setDailyContext(finalPayload);
      setIsEditingDailyContext(false);
      setSelectedActivity(targetActivity);
      setSelectedDomain(targetDomain);
      setContextSaveStatus('saved');
      setTimeout(() => setContextSaveStatus('idle'), 3000);
    } catch (err) {
      console.error("Error saving daily context:", err);
      toast.error("Gagal menyimpan Konteks Kegiatan.");
      setContextSaveStatus('error');
    }
  };

  const [generalNoteSaveStatus, setGeneralNoteSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Independent save for "Catatan Umum Hari Ini" (scoped by canonical classId + observationDate)
  const handleSaveGeneralNote = async () => {
    if (!selectedClassId || !observationDate) {
      toast.error("Pilih kelas dan tanggal observasi terlebih dahulu.");
      return;
    }

    const canonicalClassId = resolveCanonicalClassId(selectedClassId, classes) || selectedClassId;
    const noteText = (generalNote || "").trim();
    const now = Date.now();
    const updatedByUid = profile?.uid || profile?.email || 'system';
    const updatedByName = profile?.displayName || profile?.email || 'Guru';

    setGeneralNoteSaveStatus('saving');

    try {
      // 1. Save to LocalStorage immediately for instant local persistence & offline resilience
      const localKey = `kg_daily_note_${canonicalClassId}_${observationDate}`;
      localStorage.setItem(localKey, noteText);

      // Also update any local session history keys for this class & date
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`kg_obs_hist_${canonicalClassId}_`) && k.endsWith(`_${observationDate}`)) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const data = JSON.parse(raw);
              data.generalNote = noteText;
              data.generalNoteUpdatedAt = now;
              data.generalNoteUpdatedBy = updatedByUid;
              data.generalNoteUpdatedByName = updatedByName;
              localStorage.setItem(k, JSON.stringify(data));
            }
          } catch {}
        }
      }

      // 2. Save / update to kindergarten_observation_daily_contexts collection
      const contextId = `${canonicalClassId}_${observationDate}`;
      const contextRef = doc(db, 'kindergarten_observation_daily_contexts', contextId);
      const activeClassObj = classes.find((c: any) => c.id === canonicalClassId || c.id === selectedClassId);

      await setDoc(contextRef, {
        classId: canonicalClassId,
        className: activeClassObj?.name || 'General',
        observationDate: observationDate,
        academicYear: activeYear || '2026/2027',
        semester: activeSemester || '1',
        generalNote: noteText,
        generalNoteUpdatedAt: now,
        generalNoteUpdatedBy: updatedByUid,
        generalNoteUpdatedByName: updatedByName,
        updatedAt: now,
        updatedBy: updatedByUid
      }, { merge: true });

      // 3. If current session observation doc exists, update generalNote in it as well
      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');
      const sessionDocId = `${canonicalClassId}_${activeSentra}_${activeDomain}_${observationDate}`;
      const sessionDocRef = doc(db, 'observations', sessionDocId);
      try {
        await setDoc(sessionDocRef, {
          generalNote: noteText,
          generalNoteUpdatedAt: now,
          generalNoteUpdatedBy: updatedByUid,
          generalNoteUpdatedByName: updatedByName,
          updatedAt: now
        }, { merge: true });
      } catch (sessErr) {
        console.log("Session doc update on note save (optional):", sessErr);
      }

      setGeneralNoteUpdatedAt(now);
      setGeneralNoteUpdatedBy(updatedByUid);
      setGeneralNoteUpdatedByName(updatedByName);
      setGeneralNoteSaveStatus('saved');
      toast.success("Catatan Umum Hari Ini berhasil disimpan! 💾");
      setTimeout(() => {
        setGeneralNoteSaveStatus('idle');
      }, 3000);
    } catch (err: any) {
      console.error("Error saving general note:", err);
      setGeneralNoteSaveStatus('error');
      toast.error(`Gagal menyimpan Catatan Umum: ${err.message || 'Terjadi kesalahan'}`);
      setTimeout(() => {
        setGeneralNoteSaveStatus('idle');
      }, 4000);
    }
  };

  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploadingGeneral, setIsUploadingGeneral] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, boolean>>({});

  const isContextComplete = React.useMemo(() => {
    if (!observationDate || !selectedClassId || !selectedActivity) {
      return false;
    }
    if (selectedActivity !== 'SPECIAL_ACTIVITY' && !selectedDomain) {
      return false;
    }
    return true;
  }, [observationDate, selectedClassId, selectedActivity, selectedDomain]);

  const isGeneralPhotoDisabled = React.useMemo(() => {
    if (!isContextComplete) return true;
    if (isUploadingGeneral) return true;
    if (!canManageKindergartenObservation) return true;
    return false;
  }, [isContextComplete, isUploadingGeneral, canManageKindergartenObservation]);

  // Camera Modal States
  const [activeCameraTarget, setActiveCameraTarget] = React.useState<{ type: 'general' | 'student'; studentId?: string } | null>(null);
  const [cameraStream, setCameraStream] = React.useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = React.useState<InputDeviceInfo[]>([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = React.useState<string>('');
  const [isCameraLoading, setIsCameraLoading] = React.useState<boolean>(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Speech-to-Text States
  const [activeSpeechStudentId, setActiveSpeechStudentId] = React.useState<string | null>(null);
  const [speechLanguage, setSpeechLanguage] = React.useState<'id-ID' | 'en-US'>('id-ID');
  const [isListening, setIsListening] = React.useState<boolean>(false);
  const recognitionRef = React.useRef<any>(null);

  const isStudentInClass = (studClassId: string, activeClassObj: { id: string; name: string }) => {
    if (!studClassId || !activeClassObj) return false;

    // Use deterministic shared resolveCanonicalClassId utility when classes list is loaded
    if (classes && classes.length > 0) {
      const studentCanonicalId = resolveCanonicalClassId(studClassId, classes);
      if (studentCanonicalId && studentCanonicalId === activeClassObj.id) {
        return true;
      }
      return false;
    }

    // Fallback during initial load when classes state is not yet populated
    const sClass = (studClassId || '').trim().toLowerCase();
    const actId = (activeClassObj.id || '').trim().toLowerCase();
    const actName = (activeClassObj.name || '').trim().toLowerCase();
    
    if (sClass === actId || sClass === actName) return true;
    
    const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
    const normS = norm(sClass);
    const normId = norm(actId);
    const normName = norm(actName);
    
    if (normS === normName || normS === normId) return true;
    
    // Check for specific sub-classes
    const hasKoala = (str: string) => str.includes('koala');
    const hasPanda = (str: string) => str.includes('panda');
    const hasCaterpillar = (str: string) => str.includes('caterpillar');
    const hasButterfly = (str: string) => str.includes('butterfly');
    const hasCenderawasih = (str: string) => str.includes('cenderawasih');
    const hasElang = (str: string) => str.includes('elang');
    const hasKakatua = (str: string) => str.includes('kakatua');
    const hasBadak = (str: string) => str.includes('badak');
    const hasKomodo = (str: string) => str.includes('komodo');
    const hasTapir = (str: string) => str.includes('tapir');
    
    if (hasKoala(normS) && hasKoala(normName)) return true;
    if (hasPanda(normS) && hasPanda(normName)) return true;
    if (hasCaterpillar(normS) && hasCaterpillar(normName)) return true;
    if (hasButterfly(normS) && hasButterfly(normName)) return true;
    if (hasCenderawasih(normS) && hasCenderawasih(normName)) return true;
    if (hasElang(normS) && hasElang(normName)) return true;
    if (hasKakatua(normS) && hasKakatua(normName)) return true;
    if (hasBadak(normS) && hasBadak(normName)) return true;
    if (hasKomodo(normS) && hasKomodo(normName)) return true;
    if (hasTapir(normS) && hasTapir(normName)) return true;

    // Prevent generic "tka" from loosely matching specific sub-classes
    const specificClassWords = [
      'koala', 'panda', 'caterpillar', 'butterfly',
      'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir'
    ];
    const hasSpecS = specificClassWords.some(w => normS.includes(w));
    const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
    
    if (hasSpecAct && !hasSpecS) {
      return false; // student is general, but active class is specific
    }
    
    if (normId.includes(normS) || normS.includes(normId)) return true;
    
    return false;
  };

  // Set default selection and handle URL/storage redirection rules
  React.useEffect(() => {
    if (!isLoadingClasses && classes.length > 0) {
      const validParamClassId = paramClassId && assignedClassIds.includes(paramClassId) ? paramClassId : null;
      const defaultClassId = validParamClassId || primaryClassId;
      if (defaultClassId) {
        setSelectedClassId(defaultClassId);
      }
    }
  }, [classes, assignedClassIds, primaryClassId, paramClassId, isLoadingClasses]);

  // Real-time access check
  React.useEffect(() => {
    if (!isLoadingClasses && isRestrictedToAssignedClasses && selectedClassId) {
      if (assignedClassIds.length > 0 && !assignedClassIds.includes(selectedClassId)) {
        toast.error('Anda tidak memiliki hak akses untuk kelas ini. Mengembalikan ke kelas penugasan Anda.');
        setSelectedClassId(primaryClassId || '');
      }
    }
  }, [selectedClassId, isRestrictedToAssignedClasses, assignedClassIds, primaryClassId, isLoadingClasses]);

  // Load students from cache-enhanced Firestore service
  React.useEffect(() => {
    async function loadKindergartenStudentsData() {
      try {
        console.log('[Observation Page] Requesting cached Kindergarten students for year:', activeYear);
        
        // Fetch Kindergarten Students from Cache
        const fetchedStudents = await getKindergartenStudents(activeYear || '2025/2026');
        
        if (fetchedStudents.length > 0) {
          setStudents(fetchedStudents);
          saveStoredStudents(fetchedStudents);
        } else {
          const local = getStoredStudents();
          if (local && local.length > 0) {
            setStudents(local);
          }
        }
      } catch (err) {
        console.error('Error loading Kindergarten students from Firestore:', err);
      }
    }

    loadKindergartenStudentsData();
  }, [activeYear]);

  // Technical Dev/Admin Diagnostic Log for hidden non-roster legacy entries
  React.useEffect(() => {
    if (selectedClassId && observations && Object.keys(observations).length > 0) {
      const activeClassObj = classes.find(c => c.id === selectedClassId);
      if (activeClassObj) {
        const classStudents = students.filter(student => isStudentInClass(student.classId, activeClassObj));
        const classStudentIds = new Set(classStudents.map(s => s.id));
        const totalKeys = Object.keys(observations);
        const hiddenKeys = totalKeys.filter(k => !classStudentIds.has(k));
        if (hiddenKeys.length > 0) {
          console.warn(`Observation session contains ${hiddenKeys.length} hidden non-roster legacy entries`);
        }
      }
    }
  }, [selectedClassId, observations, students, classes]);

  // Unified monthly observation aggregator for Rekap Bulanan — optimized to load on-demand by month and year
  const loadRecapData = async () => {
    try {
      setIsBgFetching(true);
      console.log(`[Recap] Loading observation documents for month: ${recapMonth}, year: ${recapYear}...`);
      
      const monthStr = String(recapMonth).padStart(2, '0');
      const startOfRange = `${recapYear}-${monthStr}-01`;
      const endOfRange = `${recapYear}-${monthStr}-31`;

      // 1. Fetch from Firestore using date range filter
      const qObs = query(
        collection(db, 'observations'),
        where('date', '>=', startOfRange),
        where('date', '<=', endOfRange)
      );
      
      const qSnap = await getDocs(qObs).catch(e => {
        console.warn("[Recap] Error querying firestore:", e);
        return { docs: [] };
      });
      
      // Audit log reads
      logFirestoreRead('observations', qSnap.docs.length || 1);
      
      const firestoreItems = qSnap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          classId: d.classId,
          academicYearId: d.academicYearId || d.academicYear,
          activity: d.activity,
          domain: d.domain,
          date: d.date, // 'YYYY-MM-DD'
          generalPhoto: d.generalPhotoDeleted === true ? null : (d.generalPhotoUrl || d.generalPhoto),
          observations: d.observations || {},
          generalNote: d.generalNote || "",
          generalNoteUpdatedAt: d.generalNoteUpdatedAt || null,
          generalNoteUpdatedBy: d.generalNoteUpdatedBy || null,
          generalNoteUpdatedByName: d.generalNoteUpdatedByName || null,
          timestamp: d.timestamp || Date.now()
        };
      }).filter(item => {
        const activeClassObj = classes.find(c => c.id === selectedClassId);
        return isDocForClass(item, selectedClassId, activeClassObj, students);
      });

      // 2. Fetch from LocalStorage
      const localItems: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kg_obs_hist_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            const activeClassObj = classes.find(c => c.id === selectedClassId);
            // Filter local storage by isDocForClass
            if (!isDocForClass(data, selectedClassId, activeClassObj, students)) {
              continue;
            }
            if (data && data.observations) {
              const idxLastUnderscore = key.lastIndexOf('_');
              let dateStr = data.date;
              if (!dateStr && idxLastUnderscore !== -1) {
                const possibleDate = key.substring(idxLastUnderscore + 1);
                if (/^\d{4}-\d{2}-\d{2}$/.test(possibleDate)) {
                  dateStr = possibleDate;
                }
              }
              if (!dateStr && data.timestamp) {
                dateStr = formatDateLocal(new Date(data.timestamp));
              }

              localItems.push({
                id: key,
                classId: data.classId,
                activity: data.selectedActivity || data.activity,
                domain: data.selectedDomain || data.domain,
                date: dateStr,
                generalPhoto: data.generalPhotoDeleted === true ? null : (data.generalPhoto || data.generalPhotoUrl),
                observations: data.observations,
                generalNote: data.generalNote || "",
                generalNoteUpdatedAt: data.generalNoteUpdatedAt || null,
                generalNoteUpdatedBy: data.generalNoteUpdatedBy || null,
                generalNoteUpdatedByName: data.generalNoteUpdatedByName || null,
                timestamp: data.timestamp || Date.now()
              });
            }
          } catch (e) {
            console.error("[Recap] LocalStorage parsing error:", e);
          }
        }
      }

      // Merge Firestore and LocalStorage by key: activity_domain_date
      const mergedMap = new Map<string, any>();
      
      // Add firestore items first
      firestoreItems.forEach(item => {
        if (item.activity && item.domain && item.date) {
          const comboKey = `${item.activity}_${item.domain}_${item.date}`;
          mergedMap.set(comboKey, item);
        }
      });

      // Add local items (overwriting with latest timestamp if applicable)
      localItems.forEach(item => {
        if (item.activity && item.domain && item.date) {
          const comboKey = `${item.activity}_${item.domain}_${item.date}`;
          const existing = mergedMap.get(comboKey);
          if (!existing || (item.timestamp && item.timestamp > (existing.timestamp || 0))) {
            mergedMap.set(comboKey, item);
          }
        } else if (item.activity && item.domain && !item.date) {
          const fallbackDate = formatDateLocal(new Date(item.timestamp));
          const comboKey = `${item.activity}_${item.domain}_${fallbackDate}`;
          if (!mergedMap.has(comboKey)) {
            mergedMap.set(comboKey, { ...item, date: fallbackDate });
          }
        }
      });

      const mergedList = Array.from(mergedMap.values());
      console.log(`[Recap] Merged ${mergedList.length} total sessions successfully.`);
      setRecapData(mergedList);
    } catch (err) {
      console.error("[Recap] Error loading observation recap data:", err);
    } finally {
      setIsBgFetching(false);
    }
  };

  // State & function to delete entire class observation records
  const [isDeletingClassObs, setIsDeletingClassObs] = React.useState<boolean>(false);

  const handleDeleteClassObservations = async () => {
    const activeClassObj = classes.find(c => c.id === selectedClassId);
    if (!activeClassObj) {
      toast.error("Silakan pilih kelas terlebih dahulu.");
      return;
    }

    const confirmMsg = `PERINGATAN: Apakah Anda yakin ingin menghapus seluruh data observasi untuk kelas "${activeClassObj.name}"? Tindakan ini bersifat permanen dan tidak dapat dibatalkan.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setIsDeletingClassObs(true);
      toast.info(`Memulai proses penghapusan data observasi untuk kelas "${activeClassObj.name}"...`);

      // 1. Get students in this class
      const classStudentsList = students.filter(student => isStudentInClass(student.classId, activeClassObj));
      const studentIds = classStudentsList.map(s => s.id);

      if (studentIds.length === 0) {
        toast.error("Tidak ada siswa terdaftar di kelas ini untuk dihapus datanya.");
        return;
      }

      // 2. Fetch all observations from Firestore
      const qSnap = await getDocs(collection(db, 'observations'));
      let batch = writeBatch(db);
      let operationsInBatch = 0;
      let deletedDocsCount = 0;
      let updatedDocsCount = 0;

      for (const docSnap of qSnap.docs) {
        const d = docSnap.data();
        const obsMap = d.observations || {};
        
        let hasClassStudent = false;
        const newObsMap: Record<string, any> = {};

        Object.keys(obsMap).forEach(studentId => {
          if (studentIds.includes(studentId)) {
            hasClassStudent = true;
          } else {
            newObsMap[studentId] = obsMap[studentId];
          }
        });

        if (hasClassStudent) {
          if (operationsInBatch >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            operationsInBatch = 0;
          }

          if (Object.keys(newObsMap).length === 0) {
            batch.delete(docSnap.ref);
            deletedDocsCount++;
          } else {
            batch.update(docSnap.ref, { observations: newObsMap });
            updatedDocsCount++;
          }
          operationsInBatch++;
        }
      }

      if (operationsInBatch > 0) {
        await batch.commit();
      }

      // 3. Clear from localStorage key: kg_obs_hist_
      let clearedLSHistCount = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kg_obs_hist_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data && data.observations) {
              const obsMap = data.observations;
              let hasClassStudent = false;
              const newObsMap: Record<string, any> = {};

              Object.keys(obsMap).forEach(studentId => {
                if (studentIds.includes(studentId)) {
                  hasClassStudent = true;
                } else {
                  newObsMap[studentId] = obsMap[studentId];
                }
              });

              if (hasClassStudent) {
                if (Object.keys(newObsMap).length === 0) {
                  localStorage.removeItem(key);
                  clearedLSHistCount++;
                  i--;
                } else {
                  data.observations = newObsMap;
                  localStorage.setItem(key, JSON.stringify(data));
                  clearedLSHistCount++;
                }
              }
            }
          } catch (e) {
            console.error(e);
          }
        }
      }

      // 4. Also clean general kg_observation_data keys
      const kgObsDataSaved = localStorage.getItem('kg_observation_data');
      if (kgObsDataSaved) {
        try {
          const obsMap = JSON.parse(kgObsDataSaved);
          const newObsMap: Record<string, any> = {};
          let changed = false;
          Object.keys(obsMap).forEach(studentId => {
            if (studentIds.includes(studentId)) {
              changed = true;
            } else {
              newObsMap[studentId] = obsMap[studentId];
            }
          });
          if (changed) {
            localStorage.setItem('kg_observation_data', JSON.stringify(newObsMap));
          }
        } catch (e) {
          console.error(e);
        }
      }

      toast.success(`Berhasil menghapus data observasi kelas "${activeClassObj.name}"! (${deletedDocsCount} sesi dihapus penuh, ${updatedDocsCount} dokumen disesuaikan, ${clearedLSHistCount} local storage disinkronkan).`);
      loadRecapData();

    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus data observasi: ${err.message || String(err)}`);
    } finally {
      setIsDeletingClassObs(false);
    }
  };

  const handleDeleteIndividualObservation = async (studentId: string, studentName: string) => {
    if (!selectedDetailSession) return;
    const confirmMsg = `Hapus data observasi untuk siswa "${studentName}" pada sesi tanggal ${selectedDetailSession.date} ini?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const docRef = doc(db, 'observations', selectedDetailSession.id);
      const updatedObservations = { ...selectedDetailSession.observations };
      delete updatedObservations[studentId];

      if (Object.keys(updatedObservations).length === 0) {
        await deleteDoc(docRef);
        // Remove both scoped and legacy local storage keys
        const lsKeyNew = `kg_obs_hist_${selectedDetailSession.classId || selectedClassId}_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${selectedDetailSession.date}`;
        const lsKeyOld = `kg_obs_hist_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${selectedDetailSession.date}`;
        localStorage.removeItem(lsKeyNew);
        localStorage.removeItem(lsKeyOld);
        
        setSelectedDetailSession(null);
        toast.success(`Seluruh observasi kosong. Sesi ${selectedDetailSession.date} dihapus penuh.`);
      } else {
        await setDoc(docRef, cleanFirestoreData({ ...selectedDetailSession, observations: updatedObservations }));
        setSelectedDetailSession({
          ...selectedDetailSession,
          observations: updatedObservations
        });
        toast.success(`Berhasil menghapus observasi untuk "${studentName}".`);
      }
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus observasi individu: ${err.message || String(err)}`);
    }
  };

  const handleDeleteEntireSession = async () => {
    if (!selectedDetailSession) return;
    const confirmMsg = `Apakah Anda yakin ingin menghapus seluruh dokumentasi sesi (${selectedDetailSession.date}) ini? Semua penilaian siswa pada hari ini akan hilang permanen.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const docRef = doc(db, 'observations', selectedDetailSession.id);
      await deleteDoc(docRef);

      // Remove both scoped and legacy local storage keys
      const lsKeyNew = `kg_obs_hist_${selectedDetailSession.classId || selectedClassId}_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${selectedDetailSession.date}`;
      const lsKeyOld = `kg_obs_hist_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${selectedDetailSession.date}`;
      localStorage.removeItem(lsKeyNew);
      localStorage.removeItem(lsKeyOld);

      toast.success("Berhasil menghapus seluruh sesi.");
      setSelectedDetailSession(null);
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus sesi: ${err.message || String(err)}`);
    }
  };

  const handleSavePopupSession = async () => {
    if (!selectedDetailSession) return;
    if (!popupActivity || !popupDomain) {
      toast.error("Silakan pilih Sentra & Domain terlebih dahulu.");
      return;
    }

    const confirmMsg = "Perubahan Sentra dan Domain akan berlaku untuk seluruh siswa pada sesi ini.";
    if (!window.confirm(confirmMsg)) return;

    try {
      const classId = selectedDetailSession.classId || selectedClassId;
      const targetDate = selectedDetailSession.date;
      const oldDocId = selectedDetailSession.id;
      const newDocId = `${classId}_${popupActivity}_${popupDomain}_${targetDate}`;

      const payload = {
        ...selectedDetailSession,
        id: newDocId,
        classId,
        activity: popupActivity,
        domain: popupDomain,
        centerId: popupActivity,
        domainId: popupDomain,
        sentraId: popupActivity,
        sentraName: activities.find(a => a.id === popupActivity)?.label || popupActivity,
        domainName: domains.find(d => d.id === popupDomain)?.label || popupDomain,
        timestamp: Date.now()
      };

      // Write updated document to firestore
      await setDoc(doc(db, 'observations', newDocId), cleanFirestoreData(payload), { merge: true });

      // Save to local storage
      const newLsKey = `kg_obs_hist_${classId}_${popupActivity}_${popupDomain}_${targetDate}`;
      localStorage.setItem(newLsKey, JSON.stringify(payload));

      // If document ID changed, clean up the old documents/localstorage
      if (oldDocId !== newDocId) {
        await deleteDoc(doc(db, 'observations', oldDocId));
        localStorage.removeItem(`kg_obs_hist_${oldDocId}`);
        localStorage.removeItem(`kg_obs_hist_${classId}_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${targetDate}`);
        localStorage.removeItem(`kg_obs_hist_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${targetDate}`);
      }

      toast.success("Sesi berhasil diperbarui");
      setIsEditingPopupSession(false);
      setSelectedDetailSession(null);
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal memperbarui sesi: ${err.message || String(err)}`);
    }
  };

  const handleSavePopupGeneralNote = async () => {
    if (!selectedDetailSession) return;
    try {
      const classId = selectedDetailSession.classId || selectedClassId;
      const targetDate = selectedDetailSession.date;
      const docId = selectedDetailSession.id;
      const docRef = doc(db, 'observations', docId);

      const noteUpdatedAt = Date.now();
      const noteUpdatedBy = profile?.email || profile?.uid || 'System';
      const noteUpdatedByName = profile?.displayName || profile?.email || 'System';

      const updatedSession = {
        ...selectedDetailSession,
        generalNote: popupGeneralNoteText,
        generalNoteUpdatedAt: noteUpdatedAt,
        generalNoteUpdatedBy: noteUpdatedBy,
        generalNoteUpdatedByName: noteUpdatedByName,
        updatedAt: Date.now()
      };

      // Save to Firestore
      await setDoc(docRef, cleanFirestoreData(updatedSession), { merge: true });

      // Save to LocalStorage
      const domainVal = selectedDetailSession.activity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDetailSession.domain || 'none');
      const lsKeyNew = `kg_obs_hist_${classId}_${selectedDetailSession.activity}_${domainVal}_${targetDate}`;
      localStorage.setItem(lsKeyNew, JSON.stringify(updatedSession));

      // Also support legacy key format if present
      const lsKeyOld = `kg_obs_hist_${selectedDetailSession.activity}_${domainVal}_${targetDate}`;
      if (localStorage.getItem(lsKeyOld)) {
        localStorage.setItem(lsKeyOld, JSON.stringify(updatedSession));
      }

      toast.success("Catatan Umum berhasil disimpan! ✨");
      setSelectedDetailSession(updatedSession);
      setIsEditingPopupGeneralNote(false);
      loadRecapData();
    } catch (err: any) {
      console.error("Gagal menyimpan Catatan Umum:", err);
      toast.error(`Gagal menyimpan Catatan Umum: ${err.message || String(err)}`);
    }
  };

  const handleInitMoveStudent = (student: any, obs: any) => {
    if (!selectedDetailSession) return;
    setMovingStudent(student);
    setMovingStudentObs(obs);
    setMoveTargetActivity(selectedDetailSession.activity);
    setMoveTargetDomain(selectedDetailSession.domain);
    setShowMoveModal(true);
  };

  const handleExecuteMoveStudent = async () => {
    if (!selectedDetailSession || !movingStudent || !movingStudentObs) return;
    if (!moveTargetActivity || !moveTargetDomain) {
      toast.error("Silakan pilih Sentra & Domain tujuan.");
      return;
    }

    if (moveTargetActivity === selectedDetailSession.activity && moveTargetDomain === selectedDetailSession.domain) {
      toast.error("Siswa sudah berada di sesi tujuan tersebut.");
      return;
    }

    const targetSentraLabel = activities.find(a => a.id === moveTargetActivity)?.label || moveTargetActivity;
    const targetDomainLabel = domains.find(d => d.id === moveTargetDomain)?.label || moveTargetDomain;
    const confirmMsg = `Apakah Anda yakin ingin memindahkan siswa ini?\n\nPindahkan ${movingStudent.name} ke Sentra "${targetSentraLabel}" dan Domain "${targetDomainLabel}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const classId = selectedDetailSession.classId || selectedClassId;
      const targetDate = selectedDetailSession.date;
      const oldDocId = selectedDetailSession.id;
      const destDocId = `${classId}_${moveTargetActivity}_${moveTargetDomain}_${targetDate}`;

      // 1. Remove student observation from the source (old) session
      const updatedOldObservations = { ...selectedDetailSession.observations };
      delete updatedOldObservations[movingStudent.id];

      const hasObservationsLeft = Object.keys(updatedOldObservations).some(sid => {
        const studentObs = updatedOldObservations[sid];
        return studentObs && studentObs.grading;
      });

      if (!hasObservationsLeft) {
        // If no student observations left, delete the source session completely
        await deleteDoc(doc(db, 'observations', oldDocId));
        localStorage.removeItem(`kg_obs_hist_${oldDocId}`);
        localStorage.removeItem(`kg_obs_hist_${classId}_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${targetDate}`);
        localStorage.removeItem(`kg_obs_hist_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${targetDate}`);
      } else {
        // Otherwise update the source session doc with the student's entry removed
        const updatedOldSession = {
          ...selectedDetailSession,
          observations: updatedOldObservations,
          timestamp: Date.now()
        };
        await setDoc(doc(db, 'observations', oldDocId), cleanFirestoreData(updatedOldSession), { merge: true });
        localStorage.setItem(`kg_obs_hist_${classId}_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${targetDate}`, JSON.stringify(updatedOldSession));
      }

      // 2. Fetch destination session and merge or create a new one
      const destDocRef = doc(db, 'observations', destDocId);
      const destDocSnap = await getDoc(destDocRef);
      let destObservations: Record<string, any> = {};
      let destGeneralPhoto = null;
      let destDocCreatedAt = Date.now();
      let destDocCreatedBy = selectedDetailSession.createdBy || '';

      if (destDocSnap.exists()) {
        const destData = destDocSnap.data();
        destObservations = destData.observations || {};
        destGeneralPhoto = destData.generalPhotoUrl || destData.generalPhoto || null;
        destDocCreatedAt = destData.createdAt || Date.now();
        destDocCreatedBy = destData.createdBy || '';
      } else {
        const destLsKey = `kg_obs_hist_${classId}_${moveTargetActivity}_${moveTargetDomain}_${targetDate}`;
        const savedDest = localStorage.getItem(destLsKey);
        if (savedDest) {
          try {
            const parsed = JSON.parse(savedDest);
            destObservations = parsed.observations || {};
            destGeneralPhoto = parsed.generalPhoto || null;
            destDocCreatedAt = parsed.createdAt || Date.now();
            destDocCreatedBy = parsed.createdBy || '';
          } catch (e) {
            console.error(e);
          }
        }
      }

      // Add student's observation to the destination
      destObservations[movingStudent.id] = movingStudentObs;

      const destPayload = {
        id: destDocId,
        classId,
        activity: moveTargetActivity,
        domain: moveTargetDomain,
        centerId: moveTargetActivity,
        domainId: moveTargetDomain,
        sentraId: moveTargetActivity,
        sentraName: targetSentraLabel,
        domainName: targetDomainLabel,
        date: targetDate,
        generalPhoto: destGeneralPhoto || selectedDetailSession.generalPhoto,
        observations: destObservations,
        createdAt: destDocCreatedAt,
        createdBy: destDocCreatedBy,
        timestamp: Date.now()
      };

      // Write destination document
      await setDoc(destDocRef, cleanFirestoreData(destPayload), { merge: true });

      // Save to local storage
      const newLsKey = `kg_obs_hist_${classId}_${moveTargetActivity}_${moveTargetDomain}_${targetDate}`;
      localStorage.setItem(newLsKey, JSON.stringify(destPayload));

      toast.success("Siswa berhasil dipindahkan");
      setShowMoveModal(false);
      setMovingStudent(null);
      setMovingStudentObs(null);
      setSelectedDetailSession(null);
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal memindahkan siswa: ${err.message || String(err)}`);
    }
  };

  const handleDeleteMonthlyObservations = async () => {
    const confirmMsg = `PERINGATAN KRITIS: Anda yakin ingin menghapus SELURUH data observasi semua kelas untuk bulan ini? Tindakan ini bersifat permanen.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsBgFetching(true);
      const qSnap = await getDocs(collection(db, 'observations'));
      let batch = writeBatch(db);
      let operationsInBatch = 0;
      let count = 0;

      for (const docSnap of qSnap.docs) {
        const d = docSnap.data();
        if (d.date) {
          const parts = d.date.split('-');
          if (parts.length >= 2) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (y === recapYear && m === recapMonth) {
              if (operationsInBatch >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                operationsInBatch = 0;
              }
              batch.delete(docSnap.ref);
              count++;
              operationsInBatch++;
            }
          }
        }
      }

      if (operationsInBatch > 0) {
        await batch.commit();

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('kg_obs_hist_')) {
            const parts = key.split('_');
            const dateStr = parts[parts.length - 1];
            if (dateStr && dateStr.includes('-')) {
              const dParts = dateStr.split('-');
              if (dParts.length >= 2) {
                const y = parseInt(dParts[0], 10);
                const m = parseInt(dParts[1], 10);
                if (y === recapYear && m === recapMonth) {
                  localStorage.removeItem(key);
                  i--;
                }
              }
            }
          }
        }

        toast.success(`Berhasil menghapus ${count} sesi harian pada bulan ini.`);
      } else {
        toast.info("Tidak ada data observasi harian tercatat pada bulan ini.");
      }
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus data bulanan: ${err.message || String(err)}`);
    } finally {
      setIsBgFetching(false);
    }
  };

  // Monthly table helpers
  const daysInMonth = React.useMemo(() => {
    return new Date(recapYear, recapMonth, 0).getDate();
  }, [recapMonth, recapYear]);

  const isWeekendDay = (dayNum: number) => {
    const d = new Date(recapYear, recapMonth - 1, dayNum);
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  const studentDailyObsMap = React.useMemo(() => {
    const map: Record<string, Record<string, Array<{ domain: KGDomain; grading: KGGrading; activity: KGActivity }>>> = {};
    
    recapData.forEach(session => {
      const sDate = session.date;
      if (!sDate) return;
      
      const dateParts = sDate.split('-');
      if (dateParts.length < 2) return;
      const sYear = parseInt(dateParts[0], 10);
      const sMonth = parseInt(dateParts[1], 10);
      if (sYear !== recapYear || sMonth !== recapMonth) return;
      
      Object.keys(session.observations).forEach(studentId => {
        const studentObs = session.observations[studentId];
        if (studentObs && studentObs.grading) {
          if (!map[studentId]) {
            map[studentId] = {};
          }
          if (!map[studentId][sDate]) {
            map[studentId][sDate] = [];
          }
          map[studentId][sDate].push({
            domain: session.domain,
            grading: studentObs.grading,
            activity: session.activity
          });
        }
      });
    });
    
    return map;
  }, [recapData, recapMonth, recapYear]);

  React.useEffect(() => {
    if (activeTab === 'recap') {
      loadRecapData();
    }
  }, [activeTab, selectedClassId, recapMonth, recapYear]);

  // Triggered when selected Sentra + Domain combo, Class, or Observation Date changes: load / initialize specific data
  React.useEffect(() => {
    let active = true;

    // If we are actively editing the session's Sentra & Domain, do NOT trigger fetchComboDoc
    if (isEditingSession) {
      return;
    }
    
    async function fetchComboDoc() {
      // Reset all dependent states immediately when switching context to prevent any stale data leaks
      setObservations({});
      setGeneralPhoto(null);
      setDocCreatedAt(null);
      setDocCreatedBy(null);
      setGeneralNote("");
      lastSavedGeneralNoteRef.current = "";
      setGeneralNoteUpdatedAt(null);
      setGeneralNoteUpdatedBy(null);
      setGeneralNoteUpdatedByName(null);
      setSpecialActivityName("");
      setSpecialActivityType("activity");
      setIsSessionLocked(false);
      setSessionStatus('new');
      setCurrentDocId(null);
      setIsUploadingGeneral(false);

      if (!selectedClassId) {
        return;
      }

      const activeClassObj = classes.find(c => c.id === selectedClassId);
      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');
      const expectedDocId = `${selectedClassId}_${activeSentra}_${activeDomain}_${observationDate}`;

      // 1. Try to load from LocalStorage first (classId & date scoped!)
      const comboDateKey = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}_${observationDate}`;
      const savedComboData = localStorage.getItem(comboDateKey);
      
      if (savedComboData) {
        try {
          const parsed = JSON.parse(savedComboData);
          if (!active) return;
          if (parsed.observations) setObservations(parsed.observations);
          
          setDocCreatedAt(parsed.createdAt || parsed.timestamp || null);
          setDocCreatedBy(parsed.createdBy || null);
          setGeneralNote(parsed.generalNote || "");
          lastSavedGeneralNoteRef.current = parsed.generalNote || "";
          setGeneralNoteUpdatedAt(parsed.generalNoteUpdatedAt || null);
          setGeneralNoteUpdatedBy(parsed.generalNoteUpdatedBy || null);
          setGeneralNoteUpdatedByName(parsed.generalNoteUpdatedByName || null);
          
          if (selectedActivity === 'SPECIAL_ACTIVITY') {
            setSpecialActivityName(parsed.specialActivityName || "");
            setSpecialActivityType(parsed.specialActivityType || "activity");
          } else {
            setSpecialActivityName("");
            setSpecialActivityType("activity");
          }

          // Check generalPhotoDeleted flag
          if (parsed.generalPhotoDeleted === true) {
            setGeneralPhoto(null);
          } else if (parsed.generalPhoto) {
            setGeneralPhoto(parsed.generalPhoto);
          } else if (parsed.generalPhotoUrl) {
            setGeneralPhoto(parsed.generalPhotoUrl);
          } else {
            setGeneralPhoto(null);
          }

          setIsSessionLocked(true);
          setSessionStatus('locked');
          setCurrentDocId(expectedDocId);
          return; // Found in local, load that first
        } catch (e) {
          console.error(e);
        }
      }

      // Legacy fallback keys: if we find them, only use them if classId matches or is resolved
      if (selectedActivity !== 'SPECIAL_ACTIVITY') {
        const oldComboDateKey = `kg_obs_hist_${selectedActivity}_${selectedDomain}_${observationDate}`;
        const oldSavedComboData = localStorage.getItem(oldComboDateKey);
        if (oldSavedComboData) {
          try {
            const parsed = JSON.parse(oldSavedComboData);
            if (parsed && isDocForClass(parsed, selectedClassId, activeClassObj, students)) {
              if (!active) return;
              if (parsed.observations) setObservations(parsed.observations);
              
              setDocCreatedAt(parsed.createdAt || parsed.timestamp || null);
              setDocCreatedBy(parsed.createdBy || null);
              setGeneralNote(parsed.generalNote || "");
              lastSavedGeneralNoteRef.current = parsed.generalNote || "";
              setGeneralNoteUpdatedAt(parsed.generalNoteUpdatedAt || null);
              setGeneralNoteUpdatedBy(parsed.generalNoteUpdatedBy || null);
              setGeneralNoteUpdatedByName(parsed.generalNoteUpdatedByName || null);
              setSpecialActivityName("");
              setSpecialActivityType("activity");

              if (parsed.generalPhotoDeleted === true) {
                setGeneralPhoto(null);
              } else if (parsed.generalPhoto) {
                 setGeneralPhoto(parsed.generalPhoto);
              } else if (parsed.generalPhotoUrl) {
                setGeneralPhoto(parsed.generalPhotoUrl);
              } else {
                setGeneralPhoto(null);
              }

              setIsSessionLocked(true);
              setSessionStatus('locked');
              setCurrentDocId(expectedDocId);
              return;
            }
          } catch (e) {
            console.error(e);
          }
        }

        const fallbackKey = `kg_obs_hist_${selectedActivity}_${selectedDomain}`;
        const legacyComboData = localStorage.getItem(fallbackKey);
        if (legacyComboData) {
          try {
            const parsed = JSON.parse(legacyComboData);
            if (parsed && parsed.date === observationDate && isDocForClass(parsed, selectedClassId, activeClassObj, students)) {
              if (!active) return;
              if (parsed.observations) setObservations(parsed.observations);
              
              setDocCreatedAt(parsed.createdAt || parsed.timestamp || null);
              setDocCreatedBy(parsed.createdBy || null);
              setGeneralNote(parsed.generalNote || "");
              lastSavedGeneralNoteRef.current = parsed.generalNote || "";
              setGeneralNoteUpdatedAt(parsed.generalNoteUpdatedAt || null);
              setGeneralNoteUpdatedBy(parsed.generalNoteUpdatedBy || null);
              setGeneralNoteUpdatedByName(parsed.generalNoteUpdatedByName || null);
              setSpecialActivityName("");
              setSpecialActivityType("activity");

              if (parsed.generalPhotoDeleted === true) {
                setGeneralPhoto(null);
              } else if (parsed.generalPhoto) {
                setGeneralPhoto(parsed.generalPhoto);
              } else if (parsed.generalPhotoUrl) {
                setGeneralPhoto(parsed.generalPhotoUrl);
              } else {
                setGeneralPhoto(null);
              }

              setIsSessionLocked(true);
              setSessionStatus('locked');
              setCurrentDocId(expectedDocId);
              return;
            }
          } catch (e) {
            console.error(e);
          }
        }
      }

      // 2. Fetch from Firestore using multiple strategy-backed lookups
      const docId = `${selectedClassId}_${activeSentra}_${activeDomain}_${observationDate}`;
      const docRef = doc(db, 'observations', docId);

      let foundDoc: any = null;
      let matchedId: string = docId;

      // Strategy A: Direct fetch of expectedDocId
      try {
        const docSnap = await getDoc(docRef);
        logFirestoreRead('observations', 1);
        if (!active) return;
        if (docSnap.exists()) {
          foundDoc = docSnap.data();
          matchedId = docId;
        }
      } catch (e) {
        console.warn("Strategy A direct fetch failed:", e);
      }

      // Strategy B: Direct fetch of canonical class-scoped ID if different
      const canonicalClassId = resolveCanonicalClassId(selectedClassId, classes) || selectedClassId;
      const canonicalDocId = `${canonicalClassId}_${activeSentra}_${activeDomain}_${observationDate}`;
      if (!foundDoc && canonicalDocId !== docId) {
        try {
          const canonicalRef = doc(db, 'observations', canonicalDocId);
          const docSnap = await getDoc(canonicalRef);
          logFirestoreRead('observations', 1);
          if (!active) return;
          if (docSnap.exists()) {
            foundDoc = docSnap.data();
            matchedId = canonicalDocId;
          }
        } catch (e) {
          console.warn("Strategy B canonical fetch failed:", e);
        }
      }

      // Strategy C: Date Query and Client-side filter (Matches Rekap Bulanan logic)
      if (!foundDoc) {
        try {
          const q = query(
            collection(db, 'observations'),
            where('date', '==', observationDate)
          );
          const qSnap = await getDocs(q);
          logFirestoreRead('observations', qSnap.docs.length || 1);
          if (!active) return;

          const docsList = qSnap.docs.map(snap => ({ id: snap.id, ...snap.data() })) as any[];
          const match = docsList.find(d => {
            // Check class using the exact helper as Rekap Bulanan
            const isClassMatch = isDocForClass(d, selectedClassId, activeClassObj, students);
            if (!isClassMatch) return false;

            // Check activity
            const docActivity = d.activity || d.centerId || d.sentraId || 'general';
            if (docActivity !== activeSentra) return false;

            // Check domain
            const docDomain = d.activity === 'SPECIAL_ACTIVITY' ? 'none' : (d.domain || d.domainId || 'general');
            if (docDomain !== activeDomain) return false;

            // Check academic year & semester
            if (activeYear && d.academicYearId && d.academicYearId !== activeYear) return false;
            if (activeSemester && d.semester && d.semester !== activeSemester) return false;

            return true;
          });

          if (match) {
            foundDoc = match;
            matchedId = match.id;
          }
        } catch (e) {
          console.warn("Strategy C query failed:", e);
        }
      }

      // Strategy D: Unscoped legacy lookup
      if (!foundDoc && selectedActivity !== 'SPECIAL_ACTIVITY') {
        try {
          const unscopedDocId = `${selectedActivity}_${selectedDomain}_${observationDate}`;
          const unscopedRef = doc(db, 'observations', unscopedDocId);
          const unscopedSnap = await getDoc(unscopedRef);
          logFirestoreRead('observations', 1);
          if (!active) return;

          if (unscopedSnap.exists()) {
            const d = unscopedSnap.data();
            if (isDocForClass(d, selectedClassId, activeClassObj, students)) {
              foundDoc = d;
              matchedId = unscopedDocId;

              // AUTO-MIGRATION: Save it properly under standard class-scoped ID!
              try {
                const targetDate = observationDate;
                const migrationPayload = {
                  ...d,
                  id: docId,
                  unitId: 'KINDERGARTEN',
                  classId: selectedClassId,
                  date: targetDate,
                  observationDate: targetDate,
                  photoUrl: d.generalPhotoUrl || d.generalPhoto || null,
                  title: d.title || activities.find(a => a.id === selectedActivity)?.label || selectedActivity,
                  caption: d.caption || domains.find(d => d.id === selectedDomain)?.label || selectedDomain,
                  createdAt: d.createdAt || d.timestamp || Date.now(),
                  createdBy: d.createdBy || profile?.email || profile?.displayName || profile?.uid || 'System',
                  updatedAt: Date.now()
                };
                await setDoc(docRef, cleanFirestoreData(migrationPayload), { merge: true });
                console.log(`[Auto-Migration] Successfully migrated unscoped observation ${docId} to class-scoped document.`);
                matchedId = docId; // Use standard scoped ID going forward
              } catch (migrationErr) {
                console.warn("[Auto-Migration] Failed to save class-scoped migration:", migrationErr);
              }
            }
          }
        } catch (e) {
          console.warn("Strategy D unscoped fallback failed:", e);
        }
      }

      // Apply findings or initialize empty state
      if (!active) return;
      if (foundDoc) {
        if (foundDoc.observations) setObservations(foundDoc.observations);
        
        setDocCreatedAt(foundDoc.createdAt || foundDoc.timestamp || null);
        setDocCreatedBy(foundDoc.createdBy || null);
        setGeneralNote(foundDoc.generalNote || "");
        lastSavedGeneralNoteRef.current = foundDoc.generalNote || "";
        setGeneralNoteUpdatedAt(foundDoc.generalNoteUpdatedAt || null);
        setGeneralNoteUpdatedBy(foundDoc.generalNoteUpdatedBy || null);
        setGeneralNoteUpdatedByName(foundDoc.generalNoteUpdatedByName || null);
        
        if (selectedActivity === 'SPECIAL_ACTIVITY') {
          setSpecialActivityName(foundDoc.specialActivityName || "");
          setSpecialActivityType(foundDoc.specialActivityType || "activity");
        } else {
          setSpecialActivityName("");
          setSpecialActivityType("activity");
        }

        if (foundDoc.generalPhotoDeleted === true) {
          setGeneralPhoto(null);
        } else if (foundDoc.generalPhotoUrl || foundDoc.generalPhoto) {
          setGeneralPhoto(foundDoc.generalPhotoUrl || foundDoc.generalPhoto);
        } else {
          setGeneralPhoto(null);
        }

        setIsSessionLocked(true);
        setSessionStatus('locked');
        setCurrentDocId(matchedId);
      } else {
        // No entry found, initialize empty
        const classStudents = activeClassObj
          ? students.filter(student => isStudentInClass(student.classId, activeClassObj))
          : [];
        const cleared = classStudents.reduce((acc, kid) => {
          acc[kid.id] = { grading: null, notes: '', photo: null };
          return acc;
        }, {} as Record<string, StudentObservation>);
        setObservations(cleared);
        setGeneralPhoto(null);
        setDocCreatedAt(null);
        setDocCreatedBy(null);

        let dailyNote = "";
        if (dailyContext && dailyContext.generalNote) {
          dailyNote = dailyContext.generalNote;
        } else if (typeof localStorage !== 'undefined') {
          const localVal = localStorage.getItem(`kg_daily_note_${canonicalClassId}_${observationDate}`);
          if (localVal) dailyNote = localVal;
        }
        setGeneralNote(dailyNote);
        lastSavedGeneralNoteRef.current = dailyNote;
        setGeneralNoteUpdatedAt(null);
        setGeneralNoteUpdatedBy(null);
        setGeneralNoteUpdatedByName(null);
        setSpecialActivityName("");
        setSpecialActivityType("activity");

        setIsSessionLocked(false);
        setSessionStatus('new');
        setCurrentDocId(null);
      }
    }

    fetchComboDoc();

    return () => {
      active = false;
    };
  }, [selectedClassId, selectedActivity, selectedDomain, observationDate, isEditingSession]);

  const handleCancelEditSession = () => {
    if (originalActivity) setSelectedActivity(originalActivity);
    if (originalDomain) setSelectedDomain(originalDomain);
    setIsEditingSession(false);
    setOriginalActivity(null);
    setOriginalDomain(null);
  };

  const handleSaveSessionChanges = async () => {
    setIsSaving(true);
    try {
      if (!selectedClassId) throw new Error('Kelas belum dipilih.');
      
      if (selectedActivity === 'SPECIAL_ACTIVITY') {
        if (!specialActivityName || !specialActivityName.trim()) {
          throw new Error('Nama Kegiatan wajib diisi.');
        }
        if (specialActivityType === 'activity' && !generalPhoto) {
          throw new Error('Foto General (kegiatan utama) wajib diisi untuk jenis Ada Kegiatan.');
        }
      } else {
        if (!selectedActivity || !selectedDomain) throw new Error('Sentra dan Domain wajib dipilih.');
      }

      const targetDate = observationDate;
      const newDocId = selectedActivity === 'SPECIAL_ACTIVITY'
        ? `${selectedClassId}_${selectedActivity}_none_${targetDate}`
        : `${selectedClassId}_${selectedActivity}_${selectedDomain}_${targetDate}`;
      const newDocRef = doc(db, 'observations', newDocId);

      // Determine creation metadata
      const resolvedCreatedAt = docCreatedAt || Date.now();
      const resolvedCreatedBy = docCreatedBy || profile?.email || profile?.displayName || profile?.uid || 'System';

      const resolvedNoteUpdatedAt = generalNote ? (generalNoteUpdatedAt || Date.now()) : null;
      const resolvedNoteUpdatedBy = generalNote ? (generalNoteUpdatedBy || profile?.email || profile?.uid || 'System') : null;
      const resolvedNoteUpdatedByName = generalNote ? (generalNoteUpdatedByName || profile?.displayName || profile?.email || 'System') : null;

      // Build payload matching handleSaveAll exactly
      const payload = {
        id: newDocId,
        academicYearId: activeYear || '2026/2027',
        academicYear: activeYear || '2026/2027',
        unit: 'KINDERGARTEN',
        unitId: 'KINDERGARTEN',
        classId: selectedClassId,
        observationDate: targetDate,
        centerId: selectedActivity,
        domainId: selectedActivity === 'SPECIAL_ACTIVITY' ? null : selectedDomain,
        activity: selectedActivity, // backward compatibility
        domain: selectedActivity === 'SPECIAL_ACTIVITY' ? null : selectedDomain, // backward compatibility
        date: targetDate, // backward compatibility
        sentraId: selectedActivity,
        sentraName: selectedActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (activities.find(a => a.id === selectedActivity)?.label || selectedActivity),
        domainName: selectedActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (domains.find(d => d.id === selectedDomain)?.label || selectedDomain),
        photoUrl: generalPhoto || null,
        generalPhotoUrl: generalPhoto || null,
        generalPhoto: generalPhoto || null, // backward compatibility
        generalPhotoDeleted: !generalPhoto,
        title: selectedActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (activities.find(a => a.id === selectedActivity)?.label || selectedActivity),
        caption: selectedActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (domains.find(d => d.id === selectedDomain)?.label || selectedDomain),
        createdAt: resolvedCreatedAt,
        createdBy: resolvedCreatedBy,
        
        generalNote: generalNote || "",
        generalNoteUpdatedAt: resolvedNoteUpdatedAt,
        generalNoteUpdatedBy: resolvedNoteUpdatedBy,
        generalNoteUpdatedByName: resolvedNoteUpdatedByName,

        specialActivityName: selectedActivity === 'SPECIAL_ACTIVITY' ? specialActivityName : "",
        specialActivityType: selectedActivity === 'SPECIAL_ACTIVITY' ? specialActivityType : "activity",

        status: 'active',
        observations: selectedActivity === 'SPECIAL_ACTIVITY' ? {} : observations,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        updatedBy: profile?.email || profile?.displayName || profile?.uid || 'System'
      };

      // Set new doc in Firestore
      await setDoc(newDocRef, cleanFirestoreData(payload), { merge: true });

      // Save to LocalStorage under new key
      const domainVal = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : selectedDomain;
      const comboKeyDateSpecific = `kg_obs_hist_${selectedClassId}_${selectedActivity}_${domainVal}_${targetDate}`;
      localStorage.setItem(comboKeyDateSpecific, JSON.stringify(payload));

      // If the docId actually changed (different activity or domain), delete the old one to avoid duplicates!
      if (currentDocId && currentDocId !== newDocId) {
        if (currentDocId.startsWith('kg_obs_hist_')) {
          localStorage.removeItem(currentDocId);
        } else {
          const oldDocRef = doc(db, 'observations', currentDocId);
          await deleteDoc(oldDocRef);
          
          // Also remove old local storage entry if there was one
          const oldLocalKey = `kg_obs_hist_${currentDocId}`;
          localStorage.removeItem(oldLocalKey);
        }
      }

      // Update state
      setCurrentDocId(newDocId);
      setIsSessionLocked(true);
      setIsEditingSession(false);
      setSessionStatus('locked');
      setOriginalActivity(null);
      setOriginalDomain(null);
      setShowSaveEditConfirm(false);

      toast.success('Sentra & Domain berhasil diperbarui untuk seluruh siswa di sesi ini! ✨');
    } catch (err: any) {
      console.error("Gagal memperbarui Sentra & Domain:", err);
      toast.error(`Gagal memperbarui: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateStudentField = (studentId: string, field: keyof StudentObservation, value: any) => {
    setObservations(prev => {
      const updated = {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: value
        }
      };
      // Keep in running scratchpad state
      localStorage.setItem('kg_observation_data', JSON.stringify(updated));
      return updated;
    });
  };

  const updateStudentFields = (studentId: string, fields: Partial<StudentObservation>) => {
    setObservations(prev => {
      const updated = {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          ...fields
        }
      };
      localStorage.setItem('kg_observation_data', JSON.stringify(updated));
      return updated;
    });
  };

  const handleStudentNoteChange = (studentId: string, value: string) => {
    updateStudentField(studentId, 'notes', value);
    setGradingSaveStatus(prev => ({ ...prev, [studentId]: 'saving' }));

    if (studentAutosaveTimersRef.current[studentId]) {
      clearTimeout(studentAutosaveTimersRef.current[studentId]);
    }

    studentAutosaveTimersRef.current[studentId] = setTimeout(() => {
      executeSaveStudent(studentId);
    }, 1000);
  };

  const executeSaveStudent = async (studentId: string) => {
    try {
      if (!selectedClassId) {
        throw new Error('Kelas belum dipilih.');
      }
      const student = students.find(s => s.id === studentId);
      if (!student) {
        throw new Error('Siswa tidak ditemukan.');
      }

      const currentStudentObs = getStudentObs(observationsRef.current, student);
      const enrichedStudentObs = {
        ...currentStudentObs,
        studentName: student.name,
        updatedAt: Date.now(),
        updatedBy: profile?.displayName || profile?.email || 'Anda'
      };

      const targetDate = observationDate;
      const todayStr = formatDateLocal(new Date());
      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');

      const docId = currentDocId || `${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      const docRef = doc(db, 'observations', docId);

      let existingObservations: Record<string, any> = {};
      let existingGeneralPhoto = generalPhoto;

      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const d = docSnap.data();
        existingObservations = d.observations || {};
        if (d.generalPhotoUrl) {
          existingGeneralPhoto = d.generalPhotoUrl;
        }
      }

      const updatedObservations = {
        ...observationsRef.current,
        ...existingObservations,
        [studentId]: enrichedStudentObs
      };

      if (student.oldLuminaId) {
        updatedObservations[student.oldLuminaId] = enrichedStudentObs;
      }
      if (student.nis) {
        updatedObservations[student.nis] = enrichedStudentObs;
      }

      const resolvedCreatedAt = docCreatedAt || Date.now();
      const resolvedCreatedBy = docCreatedBy || profile?.email || profile?.displayName || profile?.uid || 'System';

      const resolvedNoteUpdatedAt = generalNote ? (generalNoteUpdatedAt || Date.now()) : null;
      const resolvedNoteUpdatedBy = generalNote ? (generalNoteUpdatedBy || profile?.email || profile?.uid || 'System') : null;
      const resolvedNoteUpdatedByName = generalNote ? (generalNoteUpdatedByName || profile?.displayName || profile?.email || 'System') : null;

      const payload = {
        id: docId,
        academicYearId: activeYear || '2026/2027',
        academicYear: activeYear || '2026/2027',
        unit: 'KINDERGARTEN',
        unitId: 'KINDERGARTEN',
        classId: selectedClassId,
        observationDate: targetDate,
        centerId: selectedActivity,
        domainId: selectedDomain,
        activity: selectedActivity,
        domain: selectedDomain,
        date: targetDate,
        photoUrl: existingGeneralPhoto,
        generalPhotoUrl: existingGeneralPhoto,
        generalPhoto: existingGeneralPhoto,
        generalPhotoDeleted: false,
        title: activities.find(a => a.id === selectedActivity)?.label || selectedActivity,
        caption: domains.find(d => d.id === selectedDomain)?.label || selectedDomain,
        createdAt: resolvedCreatedAt,
        createdBy: resolvedCreatedBy,
        
        generalNote: generalNote || "",
        generalNoteUpdatedAt: resolvedNoteUpdatedAt,
        generalNoteUpdatedBy: resolvedNoteUpdatedBy,
        generalNoteUpdatedByName: resolvedNoteUpdatedByName,

        status: 'active',
        observations: updatedObservations,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const comboKeyDateSpecific = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      localStorage.setItem(comboKeyDateSpecific, JSON.stringify(payload));

      if (targetDate === todayStr) {
        const comboKeyLegacy = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}`;
        localStorage.setItem(comboKeyLegacy, JSON.stringify(payload));
      }

      await setDoc(docRef, cleanFirestoreData(payload), { merge: true });
      
      setObservations(updatedObservations);
      setIsSessionLocked(true);
      setSessionStatus('locked');
      setCurrentDocId(docId);

      setGradingSaveStatus(prev => ({ ...prev, [studentId]: 'success' }));
    } catch (err: any) {
      console.error("Gagal menyimpan otomatis siswa:", err);
      setGradingSaveStatus(prev => ({ ...prev, [studentId]: 'error' }));
    }
  };

  const handleGradingChange = async (studentId: string, value: KGGrading | null) => {
    // 1. Update state immediately
    updateStudentField(studentId, 'grading', value);

    // Set save status to 'saving'
    setGradingSaveStatus(prev => ({ ...prev, [studentId]: 'saving' }));

    try {
      if (!selectedClassId) {
        throw new Error('Kelas belum dipilih.');
      }
      const student = students.find(s => s.id === studentId);
      if (!student) {
        throw new Error('Siswa tidak ditemukan.');
      }

      const currentStudentObs = getStudentObs(observationsRef.current, student);
      const enrichedStudentObs = {
        ...currentStudentObs,
        studentName: student.name,
        grading: value,
        updatedAt: Date.now(),
        updatedBy: profile?.displayName || profile?.email || 'Anda'
      };

      const targetDate = observationDate;
      const todayStr = formatDateLocal(new Date());

      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');

      // Fetch existing doc from Firestore to merge (using class-scoped prefix)
      const docId = currentDocId || `${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      const docRef = doc(db, 'observations', docId);

      let existingObservations: Record<string, any> = {};
      let existingGeneralPhoto = generalPhoto;

      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const d = docSnap.data();
        existingObservations = d.observations || {};
        if (d.generalPhotoUrl) {
          existingGeneralPhoto = d.generalPhotoUrl;
        }
      } else {
        // Fallback checks for legacy unscoped document in Firestore
        const legacyDocId = selectedActivity && selectedDomain ? `${selectedActivity}_${selectedDomain}_${targetDate}` : "none";
        const legacyDocRef = doc(db, 'observations', legacyDocId);
        const legacyDocSnap = await getDoc(legacyDocRef);
        if (legacyDocSnap.exists()) {
          const d = legacyDocSnap.data();
          existingObservations = d.observations || {};
          if (d.generalPhotoUrl) {
            existingGeneralPhoto = d.generalPhotoUrl;
          }
        }
      }

      // Merge only this student's observation
      const updatedObservations = {
        ...observationsRef.current,
        ...existingObservations,
        [studentId]: enrichedStudentObs
      };

      if (student.oldLuminaId) {
        updatedObservations[student.oldLuminaId] = enrichedStudentObs;
      }
      if (student.nis) {
        updatedObservations[student.nis] = enrichedStudentObs;
      }

      const resolvedCreatedAt = docCreatedAt || Date.now();
      const resolvedCreatedBy = docCreatedBy || profile?.email || profile?.displayName || profile?.uid || 'System';
      const payload = {
        id: docId,
        academicYearId: activeYear || '2026/2027',
        academicYear: activeYear || '2026/2027',
        unit: 'KINDERGARTEN',
        unitId: 'KINDERGARTEN',
        classId: selectedClassId,
        observationDate: targetDate,
        centerId: selectedActivity,
        domainId: selectedDomain,
        activity: selectedActivity,
        domain: selectedDomain,
        date: targetDate,
        photoUrl: existingGeneralPhoto,
        generalPhotoUrl: existingGeneralPhoto,
        generalPhoto: existingGeneralPhoto,
        generalPhotoDeleted: false,
        title: activities.find(a => a.id === selectedActivity)?.label || selectedActivity,
        caption: domains.find(d => d.id === selectedDomain)?.label || selectedDomain,
        createdAt: resolvedCreatedAt,
        createdBy: resolvedCreatedBy,
        status: 'active',
        observations: updatedObservations,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      setDocCreatedAt(resolvedCreatedAt);
      setDocCreatedBy(resolvedCreatedBy);

      // Save permanently with new format in LocalStorage
      const comboKeyDateSpecific = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      localStorage.setItem(comboKeyDateSpecific, JSON.stringify(payload));
      
      if (targetDate === todayStr) {
        const comboKeyLegacy = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}`;
        localStorage.setItem(comboKeyLegacy, JSON.stringify(payload));
      }

      // Save permanently to Firestore
      await setDoc(docRef, cleanFirestoreData(payload), { merge: true });

      // Update local state observations to include our updated ones
      setObservations(updatedObservations);

      // Lock the session now that the first grading has been saved
      setIsSessionLocked(true);
      setSessionStatus('locked');
      setCurrentDocId(docId);

      setGradingSaveStatus(prev => ({ ...prev, [studentId]: 'success' }));
    } catch (err: any) {
      console.error("Gagal menyimpan otomatis grading:", err);
      setGradingSaveStatus(prev => ({ ...prev, [studentId]: 'error' }));
      toast.error(`Gagal menyimpan otomatis: ${err.message || String(err)}`);
    }
  };

  // Real uploader for general activity photo
  const handleGeneralPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!canManageKindergartenObservation) {
      toast.error('Anda tidak memiliki izin untuk mengunggah foto observasi unit TK.');
      return;
    }

    if (!selectedClassId) {
      toast.error('Silakan pilih Kelas terlebih dahulu sebelum mengunggah foto.');
      return;
    }

    const activeClassObj = classes.find(c => c.id === selectedClassId);
    const className = activeClassObj ? activeClassObj.name : 'General';
    const academicYear = activeYear || 'Unknown';
    const targetDate = observationDate;

    setIsUploadingGeneral(true);
    toast.loading('Mengunggah foto kegiatan utama ke Google Drive...', { id: 'upload-general' });

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const response = await fetch('/api/observations/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: reader.result as string,
            type: 'general',
            academicYear,
            className,
            observationDate: targetDate,
            uploadedBy: 'Lumina Teacher'
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Server error uploading file');
        }

        const resData = await response.json();
        const previewUrl = resData.metadata.previewUrl;

        setGeneralPhoto(previewUrl);
        toast.success('Foto Kegiatan Utama berhasil disinkronisasi ke Google Drive! ✨', { id: 'upload-general' });
      } catch (err: any) {
        console.error('[UploadGeneral] Failed:', err);
        toast.error(`Gagal mengunggah foto ke Google Drive: ${err.message || String(err)}`, { id: 'upload-general' });
      } finally {
        setIsUploadingGeneral(false);
      }
    };
    reader.onerror = () => {
      setIsUploadingGeneral(false);
      toast.error('Gagal membaca berkas foto.', { id: 'upload-general' });
    };
    reader.readAsDataURL(file);
  };

  // Real uploader for specific student photo
  const handleStudentPhotoUpload = async (studentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!canManageKindergartenObservation) {
      toast.error('Anda tidak memiliki izin untuk mengunggah foto observasi unit TK.');
      return;
    }

    if (!selectedClassId) {
      toast.error('Silakan pilih Kelas terlebih dahulu sebelum mengunggah foto.');
      return;
    }

    const activeClassObj = classes.find(c => c.id === selectedClassId);
    const className = activeClassObj ? activeClassObj.name : 'General';
    const academicYear = activeYear || 'Unknown';
    const targetDate = observationDate;

    const student = students.find(s => s.id === studentId);
    const studentName = student ? student.name : 'Siswa';

    setUploadProgress(prev => ({ ...prev, [studentId]: true }));
    toast.loading(`Mengunggah foto ${studentName} ke Google Drive...`, { id: `upload-${studentId}` });

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const response = await fetch('/api/observations/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: reader.result as string,
            type: 'student',
            academicYear,
            className,
            studentId,
            studentName,
            observationDate: targetDate,
            uploadedBy: 'Lumina Teacher'
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Server error uploading file');
        }

        const resData = await response.json();
        const previewUrl = resData.metadata.previewUrl;

        updateStudentField(studentId, 'photo', previewUrl);
        toast.success(`Foto khusus ${studentName} berhasil disinkronisasi ke Google Drive! 📸`, { id: `upload-${studentId}` });
      } catch (err: any) {
        console.error(`[UploadStudent-${studentId}] Failed:`, err);
        toast.error(`Gagal mengunggah foto ke Google Drive: ${err.message || String(err)}`, { id: `upload-${studentId}` });
      } finally {
        setUploadProgress(prev => ({ ...prev, [studentId]: false }));
      }
    };
    reader.onerror = () => {
      setUploadProgress(prev => ({ ...prev, [studentId]: false }));
      toast.error('Gagal membaca berkas foto.', { id: `upload-${studentId}` });
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async (deviceId?: string) => {
    setIsCameraLoading(true);
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.error("Error playing video:", e));
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(device => device.kind === 'videoinput') as InputDeviceInfo[];
      setCameraDevices(videoDevices);
      if (videoDevices.length > 0 && !deviceId) {
        const activeTrack = stream.getVideoTracks()[0];
        const settings = activeTrack ? activeTrack.getSettings() : null;
        if (settings && settings.deviceId) {
          setSelectedCameraDeviceId(settings.deviceId);
        } else {
          setSelectedCameraDeviceId(videoDevices[0].deviceId);
        }
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      toast.error(`Gagal mengakses kamera: ${err.message || "Pastikan izin kamera diaktifkan."}`);
      setActiveCameraTarget(null);
    } finally {
      setIsCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setActiveCameraTarget(null);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !activeCameraTarget) return;

    if (!canManageKindergartenObservation) {
      toast.error('Anda tidak memiliki izin untuk mengambil foto observasi unit TK.');
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not create canvas context");
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);

      const targetType = activeCameraTarget.type;
      const targetStudentId = activeCameraTarget.studentId;
      
      stopCamera();
      
      if (targetType === 'general') {
        setIsUploadingGeneral(true);
        toast.loading('Mengunggah foto kamera ke Google Drive...', { id: 'upload-general' });
        
        const response = await fetch('/api/observations/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            type: 'general',
            academicYear: activeYear || 'Unknown',
            className: classes.find(c => c.id === selectedClassId)?.name || 'General',
            observationDate,
            uploadedBy: 'Lumina Teacher'
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Server error uploading file');
        }

        const resData = await response.json();
        setGeneralPhoto(resData.metadata.previewUrl);
        toast.success('Foto Kamera Kegiatan Utama berhasil disinkronisasi ke Google Drive! ✨', { id: 'upload-general' });
        
      } else if (targetType === 'student' && targetStudentId) {
        const student = students.find(s => s.id === targetStudentId);
        const studentName = student ? student.name : 'Siswa';

        setUploadProgress(prev => ({ ...prev, [targetStudentId]: true }));
        toast.loading(`Mengunggah foto kamera ${studentName} ke Google Drive...`, { id: `upload-${targetStudentId}` });

        const response = await fetch('/api/observations/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            type: 'student',
            academicYear: activeYear || 'Unknown',
            className: classes.find(c => c.id === selectedClassId)?.name || 'General',
            studentId: targetStudentId,
            studentName,
            observationDate,
            uploadedBy: 'Lumina Teacher'
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Server error uploading file');
        }

        const resData = await response.json();
        updateStudentField(targetStudentId, 'photo', resData.metadata.previewUrl);
        toast.success(`Foto kamera ${studentName} berhasil disinkronisasi ke Google Drive! 📸`, { id: `upload-${targetStudentId}` });
      }
    } catch (err: any) {
      console.error("Gagal mengambil foto dari kamera:", err);
      toast.error(`Gagal mengunggah foto kamera: ${err.message || String(err)}`);
    } finally {
      setIsUploadingGeneral(false);
      if (activeCameraTarget?.studentId) {
        setUploadProgress(prev => ({ ...prev, [activeCameraTarget.studentId!]: false }));
      }
    }
  };

  const toggleSpeechRecognition = (studentId: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast.error("Fitur Speech-to-Text tidak didukung di browser ini. Gunakan Google Chrome.");
      return;
    }

    if (isListening && activeSpeechStudentId === studentId) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      setActiveSpeechStudentId(null);
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = speechLanguage;

    recognition.onstart = () => {
      setIsListening(true);
      setActiveSpeechStudentId(studentId);
      toast.success(`Mendengarkan (${speechLanguage === 'id-ID' ? 'Bahasa Indonesia' : 'English'})... Silakan bicara.`);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== 'no-speech') {
        toast.error(`Speech-to-Text Error: ${event.error}`);
      }
      setIsListening(false);
      setActiveSpeechStudentId(null);
    };

    recognition.onend = () => {
      setIsListening(false);
      setActiveSpeechStudentId(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }

      if (finalTranscript) {
        setObservations(prev => {
          const currentNotes = prev[studentId]?.notes || '';
          const newNotes = currentNotes ? `${currentNotes.trim()} ${finalTranscript.trim()}` : finalTranscript.trim();
          
          const updated = {
            ...prev,
            [studentId]: {
              ...prev[studentId],
              notes: newNotes
            }
          };
          localStorage.setItem('kg_observation_data', JSON.stringify(updated));
          return updated;
        });
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSaveStudent = async (studentId: string) => {
    setIsSaving(true);
    try {
      if (!selectedClassId) {
        toast.error('Gagal menyimpan! Kelas belum dipilih.');
        return;
      }

      const targetDate = observationDate;
      const todayStr = formatDateLocal(new Date());
      
      const student = students.find(s => s.id === studentId);
      if (!student) {
        toast.error('Siswa tidak ditemukan.');
        return;
      }

      const currentStudentObs = getStudentObs(observations, student);
      
      // Enrich with student's name
      const enrichedStudentObs = {
        ...currentStudentObs,
        studentName: student.name
      };

      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');

      // Fetch the existing document from Firestore first to merge (using class-scoped prefix)
      const docId = currentDocId || `${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      const docRef = doc(db, 'observations', docId);
      
      let existingObservations: Record<string, any> = {};
      let existingGeneralPhoto = generalPhoto;

      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const d = docSnap.data();
        existingObservations = d.observations || {};
        if (d.generalPhotoUrl) {
          existingGeneralPhoto = d.generalPhotoUrl;
        }
      } else {
        // Fallback checks for legacy unscoped document in Firestore
        const legacyDocId = selectedActivity && selectedDomain ? `${selectedActivity}_${selectedDomain}_${targetDate}` : "none";
        const legacyDocRef = doc(db, 'observations', legacyDocId);
        const legacyDocSnap = await getDoc(legacyDocRef);
        if (legacyDocSnap.exists()) {
          const d = legacyDocSnap.data();
          existingObservations = d.observations || {};
          if (d.generalPhotoUrl) {
            existingGeneralPhoto = d.generalPhotoUrl;
          }
        }
      }

      // Merge only this student's observation
      const updatedObservations = {
        ...observations, // merge with current state
        ...existingObservations, // and with firestore
        [studentId]: enrichedStudentObs
      };

      // Also support other id variations if necessary
      if (student.oldLuminaId) {
        updatedObservations[student.oldLuminaId] = enrichedStudentObs;
      }
      if (student.nis) {
        updatedObservations[student.nis] = enrichedStudentObs;
      }

      // Standardized payload matching handleSaveAll
      const resolvedCreatedAt = docCreatedAt || Date.now();
      const resolvedCreatedBy = docCreatedBy || profile?.email || profile?.displayName || profile?.uid || 'System';
      
      const resolvedNoteUpdatedAt = generalNote ? (generalNoteUpdatedAt || Date.now()) : null;
      const resolvedNoteUpdatedBy = generalNote ? (generalNoteUpdatedBy || profile?.email || profile?.uid || 'System') : null;
      const resolvedNoteUpdatedByName = generalNote ? (generalNoteUpdatedByName || profile?.displayName || profile?.email || 'System') : null;

      const payload = {
        id: docId,
        academicYearId: activeYear || '2026/2027',
        academicYear: activeYear || '2026/2027',
        unit: 'KINDERGARTEN',
        unitId: 'KINDERGARTEN',
        classId: selectedClassId,
        observationDate: targetDate,
        centerId: selectedActivity,
        domainId: selectedDomain,
        activity: selectedActivity, // backward compatibility
        domain: selectedDomain, // backward compatibility
        date: targetDate, // backward compatibility
        photoUrl: existingGeneralPhoto,
        generalPhotoUrl: existingGeneralPhoto,
        generalPhoto: existingGeneralPhoto,
        generalPhotoDeleted: false,
        title: activities.find(a => a.id === selectedActivity)?.label || selectedActivity,
        caption: domains.find(d => d.id === selectedDomain)?.label || selectedDomain,
        createdAt: resolvedCreatedAt,
        createdBy: resolvedCreatedBy,
        
        generalNote: generalNote || "",
        generalNoteUpdatedAt: resolvedNoteUpdatedAt,
        generalNoteUpdatedBy: resolvedNoteUpdatedBy,
        generalNoteUpdatedByName: resolvedNoteUpdatedByName,

        status: 'active',
        observations: updatedObservations,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      // Update local states so they are retained during this session
      setDocCreatedAt(resolvedCreatedAt);
      setDocCreatedBy(resolvedCreatedBy);

      // Save permanently with new date-specific, class-scoped key format in LocalStorage
      const comboKeyDateSpecific = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      localStorage.setItem(comboKeyDateSpecific, JSON.stringify(payload));
      
      if (targetDate === todayStr) {
        const comboKeyLegacy = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}`;
        localStorage.setItem(comboKeyLegacy, JSON.stringify(payload));
      }

      // Save permanently to Firestore 'observations' collection
      await setDoc(docRef, cleanFirestoreData(payload), { merge: true });

      // Refresh monthly recap cache with the new values
      loadRecapData();

      // Update our local page observations state
      setObservations(updatedObservations);

      // Lock the session now that the observation has been saved
      setIsSessionLocked(true);
      setSessionStatus('locked');
      setCurrentDocId(docId);

      toast.success(`Observasi untuk ${student.name} berhasil disimpan ke sistem & Firestore! ✨`);
    } catch (err: any) {
      console.error("Gagal menyimpan data observasi siswa:", err);
      toast.error(`Gagal menyimpan: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!selectedClassId) {
      toast.error('Gagal menyimpan! Kelas belum dipilih.');
      return;
    }

    // 1. Mandatory check based on activity type
    if (selectedActivity === 'SPECIAL_ACTIVITY') {
      if (!specialActivityName || !specialActivityName.trim()) {
        toast.error('Gagal menyimpan! Nama Kegiatan wajib diisi.', {
          style: { background: '#fecaca', color: '#b91c1c', border: '1px solid #fee2e2' }
        });
        return;
      }
      if (specialActivityType === 'activity' && !generalPhoto) {
        toast.error('Gagal menyimpan! Foto General (kegiatan utama) wajib diisi untuk jenis Ada Kegiatan.', {
          style: { background: '#fecaca', color: '#b91c1c', border: '1px solid #fee2e2' }
        });
        return;
      }
    } else {
      if (!generalPhoto) {
        toast.error('Gagal menyimpan! Foto General (kegiatan utama) wajib diisi.', {
          style: { background: '#fecaca', color: '#b91c1c', border: '1px solid #fee2e2' }
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const targetDate = observationDate;
      const todayStr = formatDateLocal(new Date());

      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');

      const docId = currentDocId || `${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      const docRef = doc(db, 'observations', docId);

      // Enrich with student's names (only if not a special activity)
      const enrichedObservations = { ...observations };
      if (selectedActivity !== 'SPECIAL_ACTIVITY') {
        students.forEach(student => {
          if (enrichedObservations[student.id]) {
            enrichedObservations[student.id] = {
              ...enrichedObservations[student.id],
              studentName: student.name
            };
          } else if (student.oldLuminaId && enrichedObservations[student.oldLuminaId]) {
            enrichedObservations[student.oldLuminaId] = {
              ...enrichedObservations[student.oldLuminaId],
              studentName: student.name
            };
          } else if (student.nis && enrichedObservations[student.nis]) {
            enrichedObservations[student.nis] = {
              ...enrichedObservations[student.nis],
              studentName: student.name
            };
          }
        });
      }

      // Construct a fully standardized payload
      const resolvedCreatedAt = docCreatedAt || Date.now();
      const resolvedCreatedBy = docCreatedBy || profile?.email || profile?.displayName || profile?.uid || 'System';
      
      const resolvedNoteUpdatedAt = generalNote ? (generalNoteUpdatedAt || Date.now()) : null;
      const resolvedNoteUpdatedBy = generalNote ? (generalNoteUpdatedBy || profile?.email || profile?.uid || 'System') : null;
      const resolvedNoteUpdatedByName = generalNote ? (generalNoteUpdatedByName || profile?.displayName || profile?.email || 'System') : null;

      const payload = {
        id: docId,
        academicYearId: activeYear || '2026/2027',
        academicYear: activeYear || '2026/2027',
        unit: 'KINDERGARTEN',
        unitId: 'KINDERGARTEN',
        classId: selectedClassId,
        observationDate: targetDate,
        centerId: selectedActivity,
        domainId: selectedActivity === 'SPECIAL_ACTIVITY' ? null : selectedDomain,
        activity: selectedActivity, // backward compatibility
        domain: selectedActivity === 'SPECIAL_ACTIVITY' ? null : selectedDomain, // backward compatibility
        date: targetDate, // backward compatibility
        
        photoUrl: generalPhoto || null,
        generalPhotoUrl: generalPhoto || null,
        generalPhoto: generalPhoto || null, // backward compatibility
        generalPhotoStoragePath: `observations/${(activeYear || '2026/2027').replace(/\//g, '_')}/${selectedClassId}/${docId}/general.jpg`,
        generalPhotoDeleted: !generalPhoto,
        generalPhotoUpdatedAt: Date.now(),
        title: selectedActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (activities.find(a => a.id === selectedActivity)?.label || selectedActivity),
        caption: selectedActivity === 'SPECIAL_ACTIVITY' ? "Kegiatan Khusus" : (domains.find(d => d.id === selectedDomain)?.label || selectedDomain),
        createdAt: resolvedCreatedAt,
        createdBy: resolvedCreatedBy,
        
        generalNote: generalNote || "",
        generalNoteUpdatedAt: resolvedNoteUpdatedAt,
        generalNoteUpdatedBy: resolvedNoteUpdatedBy,
        generalNoteUpdatedByName: resolvedNoteUpdatedByName,

        specialActivityName: selectedActivity === 'SPECIAL_ACTIVITY' ? specialActivityName : "",
        specialActivityType: selectedActivity === 'SPECIAL_ACTIVITY' ? specialActivityType : "activity",

        status: 'active',
        observations: selectedActivity === 'SPECIAL_ACTIVITY' ? {} : enrichedObservations,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      // Update local states so they are retained during this session
      setDocCreatedAt(resolvedCreatedAt);
      setDocCreatedBy(resolvedCreatedBy);

      // Save permanently with old key format (legacy for today) but class-scoped!
      const comboKeyLegacy = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}`;
      if (targetDate === todayStr) {
        localStorage.setItem(comboKeyLegacy, JSON.stringify(payload));
      }

      // Save permanently with new date-specific, class-scoped key format in LocalStorage
      const comboKeyDateSpecific = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      localStorage.setItem(comboKeyDateSpecific, JSON.stringify(payload));

      // Save permanently to Firestore 'observations' collection
      await setDoc(docRef, cleanFirestoreData(payload), { merge: true });

      // Refresh monthly recap cache with the new values
      loadRecapData();

      // Lock the session now that the session has been saved
      setIsSessionLocked(true);
      setSessionStatus('locked');
      setCurrentDocId(docId);

      toast.success('Observation Data berhasil disimpan ke sistem & Firestore! ✨', {
        description: selectedActivity === 'SPECIAL_ACTIVITY'
          ? `Sesi: Kegiatan Khusus - ${specialActivityName}`
          : `Sentra: ${activities.find(a => a.id === selectedActivity)?.label}, Domain: ${domains.find(d => d.id === selectedDomain)?.label}`
      });
    } catch (err: any) {
      console.error("Gagal menyimpan ke Firestore:", err);
      toast.error(`Gagal menyimpan data ke Firestore: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const clearGeneralPhoto = async () => {
    if (!canManageKindergartenObservation) {
      toast.error('Anda tidak memiliki izin untuk menghapus foto observasi unit TK.');
      return;
    }

    setGeneralPhoto(null);
    toast.info('Foto General dikosongkan. Menghapus referensi foto dari Firestore...');

    try {
      if (!selectedClassId) return;

      const targetDate = observationDate;
      const activeSentra = selectedActivity || "general";
      const activeDomain = selectedActivity === 'SPECIAL_ACTIVITY' ? 'none' : (selectedDomain || 'general');
      const docId = currentDocId || `${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      const docRef = doc(db, 'observations', docId);

      // ALWAYS set the class-scoped document's generalPhoto to null and generalPhotoDeleted: true
      await setDoc(docRef, {
        generalPhotoUrl: null,
        generalPhoto: null,
        generalPhotoStoragePath: null,
        generalPhotoDeleted: true,
        generalPhotoDeletedAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });

      // ALSO check if there's a legacy unscoped document, and mark generalPhoto as deleted there too
      const legacyDocId = selectedActivity && selectedDomain ? `${selectedActivity}_${selectedDomain}_${targetDate}` : "none";
      const legacyDocRef = doc(db, 'observations', legacyDocId);
      const legacyDocSnap = await getDoc(legacyDocRef);
      if (legacyDocSnap.exists()) {
        await setDoc(legacyDocRef, {
          generalPhotoUrl: null,
          generalPhoto: null,
          generalPhotoStoragePath: null,
          generalPhotoDeleted: true,
          generalPhotoDeletedAt: Date.now(),
          updatedAt: Date.now()
        }, { merge: true });
      }

      // Also clean up local storage caches (both class-scoped and old unscoped)
      const comboKeyDateSpecific = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}_${targetDate}`;
      const saved = localStorage.getItem(comboKeyDateSpecific);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          parsed.generalPhoto = null;
          parsed.generalPhotoUrl = null;
          parsed.generalPhotoDeleted = true;
          localStorage.setItem(comboKeyDateSpecific, JSON.stringify(parsed));
        } catch (e) {
          console.error(e);
        }
      }

      const oldComboDateKey = selectedActivity && selectedDomain ? `kg_obs_hist_${selectedActivity}_${selectedDomain}_${targetDate}` : "none";
      const savedOld = localStorage.getItem(oldComboDateKey);
      if (savedOld && oldComboDateKey !== "none") {
        try {
          const parsed = JSON.parse(savedOld);
          parsed.generalPhoto = null;
          parsed.generalPhotoUrl = null;
          parsed.generalPhotoDeleted = true;
          localStorage.setItem(oldComboDateKey, JSON.stringify(parsed));
        } catch (e) {
          console.error(e);
        }
      }

      const todayStr = formatDateLocal(new Date());
      if (targetDate === todayStr) {
        const comboKeyLegacy = `kg_obs_hist_${selectedClassId}_${activeSentra}_${activeDomain}`;
        const savedLegacy = localStorage.getItem(comboKeyLegacy);
        if (savedLegacy) {
          try {
            const parsed = JSON.parse(savedLegacy);
            parsed.generalPhoto = null;
            parsed.generalPhotoUrl = null;
            parsed.generalPhotoDeleted = true;
            localStorage.setItem(comboKeyLegacy, JSON.stringify(parsed));
          } catch (e) {
            console.error(e);
          }
        }

        const oldComboLegacyKey = selectedActivity && selectedDomain ? `kg_obs_hist_${selectedActivity}_${selectedDomain}` : "none";
        const savedOldLegacy = localStorage.getItem(oldComboLegacyKey);
        if (savedOldLegacy && oldComboLegacyKey !== "none") {
          try {
            const parsed = JSON.parse(savedOldLegacy);
            parsed.generalPhoto = null;
            parsed.generalPhotoUrl = null;
            parsed.generalPhotoDeleted = true;
            localStorage.setItem(oldComboLegacyKey, JSON.stringify(parsed));
          } catch (e) {
            console.error(e);
          }
        }
      }

      // Trigger refetch of recap data so UI is instantly updated
      if (activeTab === 'recap') {
        loadRecapData();
      }

      toast.success('Foto General berhasil dihapus dari sistem & Firestore! 🗑️');
    } catch (err: any) {
      console.error("Gagal menghapus referensi foto general:", err);
      toast.error(`Gagal menghapus referensi foto: ${err.message || String(err)}`);
    }
  };

  const currentSentraObj = activities.find(a => a.id === selectedActivity);
  const currentDomainObj = domains.find(d => d.id === selectedDomain);

  if (isImportOpen) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-16 px-4">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => setIsImportOpen(false)}
            className="flex items-center gap-2 text-xs font-black text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 rounded-2xl px-5 py-3.5 transition active:scale-95 cursor-pointer border border-emerald-100 uppercase tracking-widest"
          >
            <ArrowLeft size={14} strokeWidth={2.5} /> Kembali ke Workspace
          </button>
        </div>
        <ObservationBulkPeriodImport 
          classes={classes}
          students={students}
          initialClassId={selectedClassId}
          onClose={() => setIsImportOpen(false)}
          onImportSuccess={() => {
            // Success callback: refresh components if needed, etc.
          }}
        />
      </div>
    );
  }

  if (isRestrictedToAssignedClasses && classes.length === 0 && !isLoadingClasses) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
        {/* Header Banner */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4 md:space-y-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black uppercase rounded-full tracking-widest">Kindergarten Unit</span>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Observation Data</h1>
          </div>
        </header>

        <div className="max-w-4xl mx-auto my-12 p-12 bg-white border border-gray-150 rounded-3xl shadow-sm text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-full">
              <AlertTriangle size={36} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Belum Ada Kelas Ditugaskan</h2>
            <p className="text-gray-600 max-w-md">
              Belum ada kelas aktif yang ditugaskan kepada Anda pada Tahun Ajaran {activeYear || '2026/2027'}. Hubungi Kepala Unit atau admin untuk memperbarui assignment kelas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeSentraName = selectedActivity === 'SPECIAL_ACTIVITY' 
    ? "Kegiatan Khusus" 
    : (activities.find(a => a.id === selectedActivity)?.label || selectedActivity);
  const activeDomainName = selectedActivity === 'SPECIAL_ACTIVITY' 
    ? "Kegiatan Khusus" 
    : (domains.find(d => d.id === selectedDomain)?.label || selectedDomain);

  const resolvedContext = dailyContext || (isSessionLocked && selectedActivity ? {
    sentraId: selectedActivity,
    sentraName: activeSentraName,
    domainId: selectedDomain,
    domainName: activeDomainName,
  } : null);

  const isContextActiveAndLocked = !!resolvedContext;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
      
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4 md:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black uppercase rounded-full tracking-widest">Kindergarten Unit</span>
            {(profile?.role === 'kindergarten_subject_teacher' || profile?.permissions?.includes('kindergarten_observation_all_classes')) && (
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-black uppercase rounded-full tracking-widest">
                Akses Guru Bidang Studi TK
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Observation Data</h1>
        </div>
        <div className="flex items-center gap-2.5 self-start md:self-center flex-wrap">
          <button 
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black px-5 py-3.5 rounded-2xl shadow-md border-0 transition-all active:scale-95 text-xs uppercase tracking-widest cursor-pointer"
          >
            <Sparkles size={15} className="animate-pulse" />
            Smart Bulk Import (Period)
          </button>
          
          <button 
            onClick={handleSaveAll}
            disabled={isSaving}
            className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Simpan Sesi Observasi
          </button>
        </div>
      </header>

      {/* Sub Mode Tab Switcher */}
      <div className="flex bg-white/80 backdrop-blur p-1.5 rounded-2xl border border-gray-100 shadow-sm self-start gap-1 max-w-lg">
        <button
          type="button"
          onClick={() => setActiveTab('input')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 border-0 cursor-pointer text-center whitespace-nowrap",
            activeTab === 'input'
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-955 hover:bg-gray-50/50"
          )}
        >
          📝 Input Observasi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('weekly')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 border-0 cursor-pointer text-center whitespace-nowrap",
            activeTab === 'weekly'
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-955 hover:bg-gray-50/50"
          )}
        >
          📅 Input Mingguan
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('recap');
            setRecapSubView('monthly_table');
          }}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 border-0 cursor-pointer text-center flex items-center justify-center gap-1.5 whitespace-nowrap",
            activeTab === 'recap'
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-955 hover:bg-gray-50/50"
          )}
        >
          📊 Rekap Bulanan
          {isBgFetching && <RefreshCw size={11} className="animate-spin text-emerald-600" />}
        </button>
      </div>

      {activeTab === 'input' ? (
        <div className="space-y-6">
          {/* Sticky/Top Compact Context Bar */}
          <div className="sticky top-[56px] md:top-[64px] z-40 bg-white/95 backdrop-blur-md border border-gray-100 p-4 rounded-3xl shadow-md mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Input */}
              <div className="flex flex-col min-w-[130px]">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tanggal</label>
                <input 
                  type="date"
                  value={observationDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setObservationDate(val);
                    const params = new URLSearchParams(window.location.search);
                    params.set('date', val);
                    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
                  }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white text-gray-700"
                />
              </div>

              {/* Class Selector */}
              <div className="flex flex-col min-w-[140px]">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Kelas</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedClassId(val);
                    const params = new URLSearchParams(window.location.search);
                    params.set('classId', val);
                    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
                  }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white text-gray-700"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              {/* Sentra Dropdown */}
              <div className="flex flex-col min-w-[160px]">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Sentra / Sesi</label>
                <select
                  value={selectedActivity || ""}
                  onChange={(e) => {
                    const val = e.target.value as KGActivity;
                    setSelectedActivity(val);
                    setSelectedDomain(null);
                    if (selectedClassId && val) {
                      handleSaveDailyContext(val, "");
                    }
                  }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white text-gray-700"
                >
                  <option value="">-- Pilih Sentra --</option>
                  {activities.map((act) => (
                    <option key={act.id} value={act.id}>{act.label}</option>
                  ))}
                </select>
              </div>

              {/* Domain Dropdown */}
              <div className="flex flex-col min-w-[200px]">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Domain Perkembangan</label>
                <select
                  value={selectedDomain || ""}
                  disabled={!selectedActivity || selectedActivity === 'SPECIAL_ACTIVITY'}
                  onChange={(e) => {
                    const val = e.target.value as KGDomain;
                    setSelectedDomain(val);
                    if (selectedClassId && selectedActivity && val) {
                      handleSaveDailyContext(selectedActivity, val);
                    }
                  }}
                  className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">-- Pilih Domain --</option>
                  {domains.map((dom) => (
                    <option key={dom.id} value={dom.id}>{dom.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Context status/indicator with Last Saved info */}
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-150 px-4 py-2 rounded-2xl shrink-0">
              <div className="flex flex-col text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  {isDailyContextLoading ? (
                    <>
                      <Loader2 className="animate-spin text-emerald-500" size={12} />
                      <span className="text-[10px] font-bold text-gray-500">Memuat...</span>
                    </>
                  ) : contextSaveStatus === 'saving' || isSaving ? (
                    <>
                      <Loader2 className="animate-spin text-amber-500" size={12} />
                      <span className="text-[10px] font-bold text-amber-600">Menyimpan...</span>
                    </>
                  ) : contextSaveStatus === 'error' ? (
                    <>
                      <AlertTriangle className="text-rose-500" size={12} />
                      <span className="text-[10px] font-bold text-rose-600">Gagal Menyimpan</span>
                    </>
                  ) : isSessionLocked ? (
                    <>
                      <CheckCircle2 className="text-emerald-500" size={12} />
                      <span className="text-[10px] font-bold text-emerald-600">Konteks Tersimpan</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="text-amber-500" size={12} />
                      <span className="text-[10px] font-bold text-amber-600">Belum Dikunci</span>
                    </>
                  )}
                </div>
                <span className="text-[9px] text-gray-400 mt-0.5">
                  {docCreatedAt ? `Disimpan: ${new Date(docCreatedAt).toLocaleTimeString('id-ID')} oleh ${docCreatedBy || 'Guru'}` : 'Belum disimpan'}
                </span>
              </div>
            </div>
          </div>

          {selectedClassId && !canManageKindergartenObservation && (
            <div className="bg-rose-50 border border-rose-200 rounded-[2rem] p-12 text-center space-y-4 max-w-2xl mx-auto my-8 shadow-sm animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mx-auto animate-pulse">
                <AlertTriangle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-black text-rose-900 uppercase tracking-widest">Akses Ditolak</h3>
                <p className="text-xs text-rose-600 max-w-md mx-auto leading-relaxed font-semibold">
                  Anda tidak memiliki akses untuk menginput observasi pada kelas ini. Silakan hubungi admin atau kepala unit untuk memeriksa daftar penugasan kelas Anda.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" style={selectedClassId && !canManageKindergartenObservation ? { display: 'none' } : undefined}>
          
          {/* LEFT COLUMN: Configuration Block (4 grid columns) */}
          <div className="lg:col-span-4 space-y-6">

          {/* 2b. Form Kegiatan Khusus */}
          {selectedActivity === 'SPECIAL_ACTIVITY' && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-emerald-500" />
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">Form Kegiatan Khusus</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-[9.5px] font-black uppercase rounded-full">Wajib</span>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                    Jenis Hari
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isSessionLocked && !isEditingSession}
                      onClick={() => setSpecialActivityType('activity')}
                      className={cn(
                        "p-2.5 rounded-xl border text-center font-bold text-xs transition-all",
                        specialActivityType === 'activity'
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      )}
                    >
                      Ada Kegiatan
                    </button>
                    <button
                      type="button"
                      disabled={isSessionLocked && !isEditingSession}
                      onClick={() => setSpecialActivityType('holiday')}
                      className={cn(
                        "p-2.5 rounded-xl border text-center font-bold text-xs transition-all",
                        specialActivityType === 'holiday'
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      )}
                    >
                      Libur / Tidak Ada Kegiatan
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                    Nama Kegiatan
                  </label>
                  <input
                    type="text"
                    disabled={isSessionLocked && !isEditingSession}
                    value={specialActivityName}
                    onChange={(e) => setSpecialActivityName(e.target.value)}
                    placeholder="Contoh: Upacara 17 Agustus, Field Trip, Perayaan Hari Anak, Libur Kemerdekaan"
                    className="w-full p-3 rounded-2xl border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. General Photo */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-rose-500" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                  3. Foto General {selectedActivity === 'SPECIAL_ACTIVITY' && specialActivityType === 'holiday' ? '(Opsional)' : '(Wajib)'}
                </h3>
              </div>
              {!(selectedActivity === 'SPECIAL_ACTIVITY' && specialActivityType === 'holiday') ? (
                <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-[9.5px] font-black uppercase rounded-full animate-pulse">Required</span>
              ) : (
                <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-[9.5px] font-black uppercase rounded-full">Optional</span>
              )}
            </div>

            <AnimatePresence mode="wait">
              {generalPhoto ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-3"
                >
                  <div className="relative aspect-video rounded-2xl overflow-hidden group bg-gray-100 border border-gray-100 shadow-inner">
                    <img src={generalPhoto} alt="General Activity" className="w-full h-full object-cover transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                      <label 
                        className={cn(
                          "p-2 bg-white/90 hover:bg-white text-gray-800 rounded-xl font-bold text-[10px] transition-transform hover:scale-105 flex items-center gap-1 shadow-md cursor-pointer",
                          isGeneralPhotoDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                      >
                        <RefreshCw size={12} className="text-emerald-600" /> File
                        <input 
                          key={`file_general_active_${selectedClassId}_${selectedActivity}_${selectedDomain}_${observationDate}`}
                          type="file" 
                          accept="image/*" 
                          onChange={handleGeneralPhotoUpload} 
                          className="hidden" 
                          disabled={isGeneralPhotoDisabled}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCameraTarget({ type: 'general' });
                          startCamera();
                        }}
                        disabled={isGeneralPhotoDisabled}
                        className={cn(
                          "p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] transition-transform hover:scale-105 flex items-center gap-1 shadow-md cursor-pointer border-0",
                          isGeneralPhotoDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                      >
                        <Camera size={12} /> Kamera
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-rose-600 text-white px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider">
                      Active Fallback
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-150">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Lolos verifikasi. Foto ini akan melengkapi arsip harian siswa secara otomatis.</span>
                  </div>
                  {selectedActivity === 'SPECIAL_ACTIVITY' && (
                    <div className="p-3 bg-amber-50/50 border border-amber-150 rounded-xl space-y-0.5 text-left mt-2.5">
                      <span className="text-[9px] text-amber-800 font-black uppercase tracking-widest block">Kegiatan Khusus</span>
                      <span className="text-xs font-black text-amber-950 block">{specialActivityName || '— Belum Diberi Nama —'}</span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/20 p-8 flex flex-col items-center justify-center text-center gap-3 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                    <AlertTriangle size={24} className="animate-bounce" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-rose-800 uppercase tracking-widest">Foto Harian Belum Diisi</h4>
                    <p className="text-[10px] text-rose-600 mt-1 max-w-[200px] leading-relaxed mx-auto">
                      Sesi ini tidak dapat disimpan sebelum Foto General diunggah.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5 w-full justify-center">
                    <label 
                      className={cn(
                        "flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-lg shadow-rose-100 transition-all hover:scale-103 cursor-pointer flex-1",
                        isGeneralPhotoDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
                      )}
                    >
                      {isUploadingGeneral ? (
                        <>
                          <Loader2 className="animate-spin" size={14} /> Mengunggah foto…
                        </>
                      ) : (
                        <>
                          <Upload size={14} /> Unggah Foto Kegiatan
                        </>
                      )}
                      <input 
                        key={`file_general_empty_${selectedClassId}_${selectedActivity}_${selectedDomain}_${observationDate}`}
                        type="file" 
                        accept="image/*" 
                        onChange={handleGeneralPhotoUpload} 
                        className="hidden" 
                        disabled={isGeneralPhotoDisabled}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveCameraTarget({ type: 'general' });
                        startCamera();
                      }}
                      disabled={isGeneralPhotoDisabled}
                      className={cn(
                        "flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-100 transition-all hover:scale-103 cursor-pointer flex-1 border-0",
                        isGeneralPhotoDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
                      )}
                    >
                      <Camera size={14} /> Ambil dari Kamera
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {generalPhoto && (
              <div className="pt-4 border-t border-gray-100 space-y-3">
                {!showDeleteConfirm ? (
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleSaveAll}
                      disabled={isSaving || !canManageKindergartenObservation}
                      className="flex-1 py-2.5 bg-[#109E58] hover:bg-[#0E854A] disabled:opacity-50 text-white text-[10px] font-extrabold uppercase tracking-widest rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer border-0"
                      id="btn-save-general-photo"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={!canManageKindergartenObservation}
                      className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold uppercase tracking-widest rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer border-0 disabled:opacity-50"
                      id="btn-delete-general-photo"
                    >
                      <Trash2 size={12} />
                      Hapus
                    </button>
                  </div>
                ) : (
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3.5 space-y-3">
                    <p className="text-[11px] font-bold text-rose-800 text-center">
                      Apakah Anda yakin?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await clearGeneralPhoto();
                          setShowDeleteConfirm(false);
                        }}
                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                        id="btn-confirm-delete-yes"
                      >
                        Ya, dan simpan perubahan
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center cursor-pointer"
                        id="btn-confirm-delete-no"
                      >
                        Tidak
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Active Evaluator Workspace (8 grid columns) */}
        <div className="lg:col-span-8 space-y-6">
          
          {(!selectedActivity || (selectedActivity !== 'SPECIAL_ACTIVITY' && !selectedDomain)) && (
            <div className="bg-emerald-50/55 border border-emerald-100 rounded-3xl p-5 flex items-center gap-4 shadow-sm">
              <div className="p-3 bg-white text-emerald-600 rounded-2xl shadow-sm">
                <Compass size={22} className="text-emerald-500" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-black text-emerald-800 uppercase tracking-wider">Konteks Kegiatan (Opsional)</p>
                <p className="text-[11px] text-emerald-700/80 leading-relaxed font-medium">
                  Sentra dan Domain Perkembangan belum dipilih. Anda tetap dapat langsung melakukan observasi, penilaian mandiri, dan mengunggah foto siswa di bawah ini secara bebas.
                </p>
              </div>
            </div>
          )}

          <>
            {/* Sesi Header Context Card */}
            <div className="bg-gray-900 rounded-[2rem] p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center shadow-lg gap-4 relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
              
              <div className="flex flex-col gap-3">
                <div className="space-y-1 bg-white/5 py-3.5 px-5 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-black text-emerald-400 tracking-widest uppercase">Target Evaluasi Sesi</span>
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
                    <span className="text-sm font-black tracking-tight">
                      {!selectedActivity 
                        ? 'Belum Memilih Sentra' 
                        : selectedActivity === 'SPECIAL_ACTIVITY' 
                          ? 'Kegiatan Khusus' 
                          : currentSentraObj?.label || 'Belum Memilih Sentra'}
                    </span>
                    {selectedActivity ? (
                      selectedActivity !== 'SPECIAL_ACTIVITY' ? (
                        <>
                          <span className="text-gray-500 text-xs">&gt;</span>
                          <span className="text-xs font-bold text-gray-300">{currentDomainObj?.label || 'Belum Memilih Domain'}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-500 text-xs">&gt;</span>
                          <span className="text-xs font-bold text-amber-300">{specialActivityName || '— Belum diberi nama —'}</span>
                        </>
                      )
                    ) : (
                      <>
                        <span className="text-gray-500 text-xs">&gt;</span>
                        <span className="text-xs font-bold text-gray-400 font-medium">Sentra & Domain Opsional</span>
                      </>
                    )}
                  </div>
                </div>

                  {/* Session Status & Actions */}
                  <div className="flex items-center gap-2 px-1">
                    {isSessionLocked ? (
                      isEditingSession ? (
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-xl">
                          <span className="text-[9.5px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
                            <Sparkles size={11} className="animate-pulse" /> Mode Edit Sesi
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowSaveEditConfirm(true)}
                            className="bg-amber-500 hover:bg-amber-650 text-gray-950 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border-0 transition cursor-pointer"
                          >
                            Simpan Sesi
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditSession}
                            className="bg-gray-800 hover:bg-gray-700 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border-0 transition cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl">
                          <span className="text-[9.5px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                            🔒 Sesi Terkunci
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setOriginalActivity(selectedActivity as KGActivity);
                              setOriginalDomain(selectedDomain as KGDomain);
                              setShowEditConfirm(true);
                            }}
                            className="bg-emerald-650 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border-0 transition cursor-pointer"
                          >
                            Ubah Sentra & Domain
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/25 px-3 py-1.5 rounded-xl">
                        <span className="text-[9.5px] font-black text-sky-400 uppercase tracking-wider flex items-center gap-1">
                          ✨ Sesi Baru
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-left md:text-right flex flex-col gap-1.5 min-w-[170px]">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Waktu Observasi</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={observationDate}
                      onChange={(e) => {
                        setObservationDate(e.target.value);
                      }}
                      className="bg-gray-800 text-emerald-400 text-xs font-bold border border-gray-700 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer text-center w-full"
                    />
                  </div>
                  <span className="text-[9px] text-gray-400 italic font-sans">
                    {observationDate === formatDateLocal(new Date()) ? '🗓️ Hari Ini (Otomatis)' : '📅 Tanggal Terpilih'}
                  </span>
                </div>
              </div>

              {/* Catatan Umum Hari Ini Section */}
              <div className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm space-y-3 text-left">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-indigo-600" />
                  <label className="text-xs font-black text-gray-900 uppercase tracking-wider block">
                    Catatan Umum Hari Ini
                  </label>
                  <span className="text-[10px] bg-gray-100 text-gray-500 font-extrabold px-1.5 py-0.5 rounded-md leading-none uppercase ml-auto">
                    Sesi / Kelas
                  </span>
                </div>
                <textarea
                  id="input-general-note"
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="Tulis catatan umum kegiatan kelas pada hari ini (opsional)…"
                  className="w-full h-24 p-3.5 text-xs bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-gray-800 placeholder-gray-400"
                />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <p className="text-[10px] text-gray-400 font-semibold italic flex-1">
                    * Catatan ini tersimpan secara mandiri berdasarkan kelas &amp; tanggal observasi.
                  </p>
                  <button
                    type="button"
                    id="btn-save-general-note"
                    onClick={handleSaveGeneralNote}
                    disabled={generalNoteSaveStatus === 'saving'}
                    className={cn(
                      "flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm cursor-pointer shrink-0 border-0",
                      generalNoteSaveStatus === 'saving'
                        ? "bg-amber-500 text-white cursor-not-allowed"
                        : generalNoteSaveStatus === 'saved'
                        ? "bg-emerald-600 text-white"
                        : generalNoteSaveStatus === 'error'
                        ? "bg-rose-600 text-white"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md active:scale-95"
                    )}
                  >
                    {generalNoteSaveStatus === 'saving' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Menyimpan Catatan...</span>
                      </>
                    ) : generalNoteSaveStatus === 'saved' ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Tersimpan! 💾</span>
                      </>
                    ) : generalNoteSaveStatus === 'error' ? (
                      <>
                        <AlertCircle size={14} />
                        <span>Coba Lagi</span>
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        <span>Simpan Catatan Umum</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

          {/* Student Observations Loop Container */}
          {selectedActivity === 'SPECIAL_ACTIVITY' ? (
            <div className="bg-amber-50/40 rounded-[2rem] p-8 border border-amber-200 text-center flex flex-col items-center justify-center gap-4 py-12 animate-fade-in">
              <div className="p-4 bg-amber-100/60 text-amber-500 rounded-full">
                <Star size={32} className="animate-pulse" />
              </div>
              <div className="space-y-2 max-w-lg">
                <h4 className="text-sm font-black text-amber-950 uppercase tracking-widest">
                  Sesi Kegiatan Khusus Terpilih
                </h4>
                <p className="text-xs text-amber-850 leading-relaxed font-semibold">
                  {specialActivityType === 'holiday'
                    ? `Sesi "${specialActivityName || 'Kegiatan Khusus'}" dikonfigurasi sebagai hari Libur / Tidak Ada Kegiatan. Sesi ini akan tersimpan di tingkat sesi tanpa evaluasi siswa.`
                    : `Sesi "${specialActivityName || 'Kegiatan Khusus'}" berjalan di tingkat kelas/sesi tanpa evaluasi capaian individu siswa.`
                  }
                </p>
                <div className="pt-2">
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                    {specialActivityType === 'holiday' ? 'Libur / Tidak Ada Kegiatan' : 'Ada Kegiatan'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <UserCheck size={16} className="text-emerald-600" /> Lembar Penilaian Siswa KKG
              </h2>
              
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Pilih Kelas:</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setLastSelectedClassId(e.target.value);
                  }}
                  disabled={isRestrictedToAssignedClasses && classes.length <= 1}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {classes.map((cls) => {
                    const classStudentsCount = students.filter(s => isStudentInClass(s.classId, cls)).length;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({classStudentsCount} Siswa)
                      </option>
                    );
                  })}
                  {classes.length === 0 && (
                    <option value="">Tidak ada kelas aktif</option>
                  )}
                </select>
              </div>
            </div>

            {(() => {
              const activeClassObj = classes.find(c => c.id === selectedClassId);
              const filteredStudents = students.filter((student) => {
                if (!selectedClassId) return false;
                if (!activeClassObj) return false;
                return isStudentInClass(student.classId, activeClassObj);
              });

              if (filteredStudents.length === 0) {
                return (
                  <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2.5">
                    <UserCheck className="text-gray-300" size={32} />
                    <div>
                      <p className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">Tidak Ada Siswa Terdaftar</p>
                      <p className="text-[11px] text-gray-400 font-medium mt-1">
                        Belum ada siswa yang masuk ke dalam kategori kelas ini di kelompok belajar Lumina Kindergarten.
                      </p>
                    </div>
                  </div>
                );
              }

              return filteredStudents.map((student) => {
                const obs = getStudentObs(observations, student);
                const resolvedPhoto = obs.photo || generalPhoto;
                const hasSpecificPhoto = !!obs.photo;

                return (
                  <div 
                    key={student.id}
                    className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all duration-300 grid grid-cols-1 md:grid-cols-12 gap-6 relative"
                  >
                  
                  {/* Left block: student info & initials avatar */}
                  <div className="md:col-span-3 flex flex-col justify-start space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-base flex items-center justify-center shadow-md">
                        {student.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-gray-900 tracking-tight leading-tight uppercase truncate">{student.name}</h4>
                        <p className="text-[10px] font-bold text-gray-400 font-mono mt-0.5">NIS: {student.id}</p>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50/70 rounded-xl p-2.5 border border-gray-100 text-[10px] text-gray-500 leading-normal">
                      <span className="font-bold block text-gray-700">Status Capaian:</span>
                      <span className="font-semibold block italic mt-0.5 text-emerald-700">
                        {grades.find(g => g.id === obs.grading)?.label || 'Belum Dinilai'}
                      </span>
                    </div>

                    {/* Individual Save Button */}
                    <button
                      type="button"
                      onClick={() => handleSaveStudent(student.id)}
                      disabled={isSaving}
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest py-2 px-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-sm mt-1"
                    >
                      {isSaving ? (
                        <Loader2 className="animate-spin" size={10} />
                      ) : (
                        <Save size={10} />
                      )}
                      <span>Simpan Siswa</span>
                    </button>
                  </div>

                  {/* Middle block: grading metrics selector & notes */}
                  <div className="md:col-span-6 space-y-4">
                    {/* Grading Dropdown Selector */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between h-4">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1 leading-none">
                          Grading <HelpCircle size={10} className="text-gray-300" />
                        </label>
                        
                        {/* Status UX indicator */}
                        {gradingSaveStatus[student.id] === 'saving' && (
                          <span className="text-[10px] font-bold text-emerald-600 animate-pulse flex items-center gap-1">
                            <Loader2 className="animate-spin" size={10} /> Menyimpan…
                          </span>
                        )}
                        {gradingSaveStatus[student.id] === 'success' && (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                            ✓ Tersimpan
                          </span>
                        )}
                        {gradingSaveStatus[student.id] === 'error' && (
                          <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                            Gagal menyimpan. Coba lagi.
                          </span>
                        )}
                      </div>
                      
                      <select
                        value={obs.grading || ''}
                        disabled={gradingSaveStatus[student.id] === 'saving'}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleGradingChange(student.id, val ? (val as KGGrading) : null);
                        }}
                        className={cn(
                          "w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30",
                          gradingSaveStatus[student.id] === 'saving' && "opacity-60 cursor-not-allowed bg-gray-50"
                        )}
                      >
                        <option value="" disabled>Pilih grading</option>
                        <option value="BB">Belum Berkembang</option>
                        <option value="MB">Mulai Berkembang</option>
                        <option value="BSH">Berkembang Sesuai Harapan</option>
                        <option value="BSB">Berkembang Sangat Baik</option>
                        <option value="ABSENT">Tidak Masuk</option>
                        <option value="NOT_PARTICIPATING">Tidak Mengikuti Kegiatan</option>
                      </select>
                      
                      {obs.grading && (
                        <p className="text-[9.5px] italic text-gray-400 pl-1 leading-normal">
                          Keterangan: {grades.find(g => g.id === obs.grading)?.desc || '-'}
                        </p>
                      )}
                    </div>

                    {/* Notes textarea with Speech-to-Text */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Catatan Pembelajaran (Opsional)</label>
                        
                        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 shrink-0">
                          <select
                            value={speechLanguage}
                            onChange={(e) => setSpeechLanguage(e.target.value as 'id-ID' | 'en-US')}
                            className="bg-transparent text-[8px] font-bold text-gray-500 border-none outline-none p-0 focus:ring-0 cursor-pointer"
                          >
                            <option value="id-ID">🇮🇩 Indo</option>
                            <option value="en-US">🇬🇧 English</option>
                          </select>
                          
                          <button
                            type="button"
                            onClick={() => toggleSpeechRecognition(student.id)}
                            className={cn(
                              "flex items-center gap-1 text-[8.5px] font-extrabold px-1.5 py-0.5 rounded transition",
                              isListening && activeSpeechStudentId === student.id
                                ? "bg-rose-500 text-white animate-pulse"
                                : "text-emerald-700 hover:bg-emerald-50"
                            )}
                          >
                            {isListening && activeSpeechStudentId === student.id ? (
                              <>
                                <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Mic size={9} />
                                <span>Bicara</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <textarea 
                        rows={2}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-emerald-400 focus:bg-white transition-all text-gray-700 font-medium placeholder:italic"
                        placeholder={`Tulis momen spesifik mengenai perilaku ${((student.name || "Ananda") + "").split(' ')[0]} terkait ${currentDomainObj?.label}...`}
                        value={obs.notes}
                        onChange={(e) => updateStudentField(student.id, 'notes', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Right block: Student specific photo override */}
                  <div className="md:col-span-3 flex flex-col justify-between space-y-2">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none block">
                        Foto Siswa (Opsional)
                      </label>
                      
                      {/* Photo preview block */}
                      <div className="relative aspect-video md:aspect-square md:w-full rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center group shadow-inner">
                        {resolvedPhoto ? (
                          <>
                            <img src={resolvedPhoto} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            {hasSpecificPhoto ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!canManageKindergartenObservation) {
                                    toast.error('Anda tidak memiliki izin untuk mereset foto observasi.');
                                    return;
                                  }
                                  updateStudentField(student.id, 'photo', null);
                                }}
                                disabled={!canManageKindergartenObservation}
                                className={cn(
                                  "absolute top-1 right-1 p-1.5 bg-red-600 text-white rounded-lg hover:scale-110 opacity-0 group-hover:opacity-100 transition-all shadow-md border-0 cursor-pointer",
                                  !canManageKindergartenObservation && "opacity-50 cursor-not-allowed pointer-events-none"
                                )}
                                title="Reset gunakan Foto Harian"
                              >
                                <X size={10} strokeWidth={4} />
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-center p-2 flex flex-col items-center justify-center gap-1">
                            <ImageIcon size={18} className="text-gray-300" />
                            <span className="text-[8px] text-gray-400 leading-tight">Belum ada foto</span>
                          </div>
                        )}

                        {/* Glass overlay label specifying photo source */}
                        {resolvedPhoto && (
                          <div className={cn(
                             "absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide uppercase shadow-sm",
                             hasSpecificPhoto 
                               ? "bg-emerald-600/90 text-white" 
                               : "bg-gray-800/80 text-gray-200"
                          )}>
                            {hasSpecificPhoto ? "Foto Khusus" : "Foto Harian"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Camera and File upload buttons */}
                    <div className="flex gap-1.5 w-full">
                      <label
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1 cursor-pointer",
                          hasSpecificPhoto 
                            ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700" 
                            : "bg-white hover:bg-gray-50 border-gray-200 text-gray-600",
                          !canManageKindergartenObservation && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                        title="Unggah file foto dari perangkat"
                      >
                        {uploadProgress[student.id] ? (
                          <Loader2 className="animate-spin" size={10} />
                        ) : (
                          <Upload size={10} />
                        )}
                        <span className="ml-1">File</span>
                        <input 
                          key={`file_student_${student.id}_${selectedClassId}_${selectedActivity}_${selectedDomain}_${observationDate}`}
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleStudentPhotoUpload(student.id, e)} 
                          className="hidden" 
                          disabled={!canManageKindergartenObservation}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveCameraTarget({ type: 'student', studentId: student.id });
                          startCamera();
                        }}
                        disabled={!canManageKindergartenObservation}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center justify-center gap-1 cursor-pointer",
                          !canManageKindergartenObservation && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                        title="Ambil foto langsung menggunakan kamera"
                      >
                        <Camera size={10} />
                        <span className="ml-1">Kamera</span>
                      </button>
                    </div>
                    
                    {!hasSpecificPhoto && generalPhoto && (
                      <span className="text-[8px] text-gray-400 leading-none text-center block italic">
                        Otomatis mewarisi Foto General
                      </span>
                    )}
                  </div>

                </div>
              );
            });
          })()}
          </div>
          )}
                {/* Bottom Save Action Panel */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4" style={selectedClassId && !canManageKindergartenObservation ? { display: 'none' } : undefined}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-emerald-50 text-emerald-600">
                <Info size={18} />
              </div>
              <div className="text-xs">
                <p className="font-black text-gray-900">Periksa Ulang Sebelum Menyimpan</p>
                <p className="text-gray-400 mt-0.5">Penilaian ini bernilai dinamis dan langsung disinkronkan ke local storage sasi terkait.</p>
              </div>
            </div>

            <button 
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 py-4 rounded-2.5xl shadow-xl shadow-emerald-150 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest shrink-0"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Simpan Observation Data
            </button>
          </div>
          </>

        </div>

      </div>
      </div>
      ) : activeTab === 'weekly' ? (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-5 items-stretch lg:items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Select Class (synced with top selection!) */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Kelas:</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setLastSelectedClassId(e.target.value);
                  }}
                  disabled={isRestrictedToAssignedClasses && classes.length <= 1}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {classes.map((cls) => {
                    const classStudentsCount = students.filter(s => isStudentInClass(s.classId, cls)).length;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({classStudentsCount} Siswa)
                      </option>
                    );
                  })}
                  {classes.length === 0 && (
                    <option value="">Tidak ada kelas aktif</option>
                  )}
                </select>
              </div>

              {/* Week selector/navigation */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(weeklyStartDate);
                    prev.setDate(prev.getDate() - 7);
                    setWeeklyStartDate(prev);
                  }}
                  className="px-3 py-1.5 bg-white border border-gray-150 hover:bg-gray-100 text-gray-600 hover:text-gray-900 text-[10px] font-bold rounded-xl transition cursor-pointer"
                >
                  ← Minggu Sebelumnya
                </button>
                <span className="text-xs font-black text-gray-800 px-2 font-mono whitespace-nowrap">
                  {formatWeekRange(weeklyStartDate)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(weeklyStartDate);
                    next.setDate(next.getDate() + 7);
                    setWeeklyStartDate(next);
                  }}
                  className="px-3 py-1.5 bg-white border border-gray-150 hover:bg-gray-100 text-gray-600 hover:text-gray-900 text-[10px] font-bold rounded-xl transition cursor-pointer"
                >
                  Minggu Berikutnya →
                </button>
              </div>
            </div>

            {/* Compact Summary */}
            <div className="flex items-center gap-3 bg-emerald-50/40 border border-emerald-100 rounded-2xl px-4 py-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-black text-emerald-950 leading-none">
                  {(() => {
                    const canonicalClassId = resolveCanonicalClassId(selectedClassId, classes) || selectedClassId;
                    const activeClassObj = classes.find(c => c.id === canonicalClassId || c.id === selectedClassId);
                    const classStudents = students.filter(student => {
                      if (!selectedClassId) return false;
                      if (!activeClassObj) return false;
                      return isStudentInClass(student.classId, activeClassObj);
                    });
                    const weekDates = getWeekDates(weeklyStartDate);
                    
                    const gradedStudentsCount = classStudents.filter(student => {
                      return weekDates.some(d => {
                        const dStr = formatDateLocal(d);
                        const sessionsOnDate = weeklyObservations.filter(s => 
                          isValidObservationSession(s) && (s.date === dStr || s.observationDate === dStr)
                        );
                        return sessionsOnDate.some(session => {
                          const obs = getStudentObsStrict(session.observations, student);
                          return obs && obs.grading;
                        });
                      });
                    }).length;

                    return `${gradedStudentsCount} dari ${classStudents.length} siswa sudah terdinilai`;
                  })()}
                </p>
                <p className="text-[9px] font-semibold text-emerald-700 leading-none mt-1">
                  {(() => {
                    const canonicalClassId = resolveCanonicalClassId(selectedClassId, classes) || selectedClassId;
                    const activeClassObj = classes.find(c => c.id === canonicalClassId || c.id === selectedClassId);
                    const classStudents = students.filter(student => {
                      if (!selectedClassId) return false;
                      if (!activeClassObj) return false;
                      return isStudentInClass(student.classId, activeClassObj);
                    });
                    const weekDates = getWeekDates(weeklyStartDate);
                    const totalSlots = classStudents.length * 5;
                    const filledSlots = classStudents.reduce((acc, student) => {
                      let studentCount = 0;
                      weekDates.forEach(d => {
                        const dStr = formatDateLocal(d);
                        const sessionsOnDate = weeklyObservations.filter(s => 
                          isValidObservationSession(s) && (s.date === dStr || s.observationDate === dStr)
                        );
                        const hasGrading = sessionsOnDate.some(session => {
                          const obs = getStudentObsStrict(session.observations, student);
                          return obs && obs.grading;
                        });
                        if (hasGrading) studentCount++;
                      });
                      return acc + studentCount;
                    }, 0);
                    return `Total slot terisi: ${filledSlots} dari ${totalSlots}`;
                  })()}
                </p>
              </div>
            </div>
          </div>

          {/* Weekly Table View */}
          {isWeeklyLoading ? (
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-12 text-center flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-emerald-500" size={32} />
              <p className="text-xs font-extrabold text-gray-500 uppercase tracking-widest">Memuat Data Mingguan...</p>
            </div>
          ) : (() => {
            const activeClassObj = classes.find(c => c.id === selectedClassId);
            const classStudents = students.filter(student => {
              if (!selectedClassId) return false;
              if (!activeClassObj) return false;
              return isStudentInClass(student.classId, activeClassObj);
            });
            const weekDates = getWeekDates(weeklyStartDate);

            if (classStudents.length === 0) {
              return (
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-12 text-center flex flex-col items-center justify-center gap-3">
                  <AlertCircle className="text-gray-300 animate-pulse" size={36} />
                  <div>
                    <p className="text-xs font-black text-gray-700 uppercase tracking-wider">Tidak Ada Siswa Aktif</p>
                    <p className="text-[10px] text-gray-400 font-semibold mt-1">
                      Belum ada siswa yang terdaftar di kelas terpilih untuk periode ini.
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                <div className="overflow-x-auto max-w-full relative">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400 text-center w-12 sticky left-0 bg-gray-50 z-20">
                          No
                        </th>
                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400 sticky left-12 bg-gray-50 z-20 min-w-[200px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          Nama Siswa
                        </th>
                        {weekDates.map((d, index) => {
                          const { dayName, dateStr } = formatWeekdayHeader(d);
                          return (
                            <th key={index} className="p-4 text-center min-w-[150px] border-r border-gray-100/40">
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{dayName}</span>
                                <span className="text-[10px] font-bold text-gray-400 mt-0.5">{dateStr}</span>
                              </div>
                            </th>
                          );
                        })}
                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400 text-center w-24">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {classStudents.map((student, studentIndex) => {
                        const countGradings = weekDates.reduce((acc, d) => {
                          const dStr = formatDateLocal(d);
                          const sessionsOnDate = weeklyObservations.filter(s => 
                            isValidObservationSession(s) && (s.date === dStr || s.observationDate === dStr)
                          );
                          const hasGrading = sessionsOnDate.some(session => {
                            const obs = getStudentObsStrict(session.observations, student);
                            return obs && obs.grading;
                          });
                          return acc + (hasGrading ? 1 : 0);
                        }, 0);

                        const isHighlighted = highlightedStudentId === student.id;

                        return (
                          <tr 
                            key={student.id} 
                            id={`student-row-${student.id}`}
                            className={cn(
                              "group transition-colors",
                              isHighlighted 
                                ? "bg-emerald-50/30 hover:bg-emerald-50/40 border-y-2 border-emerald-400/50" 
                                : "hover:bg-gray-50/50"
                            )}
                          >
                            <td className={cn(
                              "p-4 text-center text-xs font-mono font-bold text-gray-400 sticky left-0 z-10 border-r border-gray-100/50 transition-colors",
                              isHighlighted ? "bg-emerald-50/50" : "bg-white group-hover:bg-gray-50/50"
                            )}>
                              {studentIndex + 1}
                            </td>
                            <td className={cn(
                              "p-4 sticky left-12 z-10 border-r border-gray-100/50 shadow-[2px_0_5px_rgba(0,0,0,0.02)] transition-colors",
                              isHighlighted ? "bg-emerald-50/50" : "bg-white group-hover:bg-gray-50/50"
                            )}>
                              <div className="min-w-[180px] max-w-[240px]">
                                <p className="text-xs font-black text-gray-850 uppercase truncate" title={student.name}>
                                  {student.name}
                                </p>
                                <p className="text-[10px] font-semibold text-gray-400 mt-0.5 font-mono">
                                  NIS: {student.id}
                                </p>
                              </div>
                            </td>
                            {weekDates.map((d, dIndex) => {
                              const dStr = formatDateLocal(d);
                              const isFuture = isFutureDate(d);
                              const sessionsOnDate = weeklyObservations.filter(s => 
                                isValidObservationSession(s) && (s.date === dStr || s.observationDate === dStr)
                              );
                              
                              const allSessionsWithObs = sessionsOnDate.map(session => {
                                const obs = getStudentObsStrict(session.observations, student);
                                return { session, obs };
                              });

                              const dayHeader = formatWeekdayHeader(d);
                              const formattedDateIndo = `${d.getDate()} ${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][d.getMonth()]} ${d.getFullYear()}`;
                              const photoTooltip = `Foto kegiatan — ${dayHeader.dayName}, ${formattedDateIndo}`;

                              const handleCellClick = () => {
                                if (allSessionsWithObs.length === 0) {
                                  handleEmptyCellClick(student.id, dStr);
                                } else if (allSessionsWithObs.length === 1) {
                                  handleFilledCellClick(allSessionsWithObs[0], student.id);
                                } else {
                                  setMultipleSessionsModalData({
                                    student,
                                    date: d,
                                    dateStr: dStr,
                                    sessions: allSessionsWithObs
                                  });
                                }
                              };

                              return (
                                <td 
                                  key={dIndex} 
                                  onClick={handleCellClick}
                                  className="p-4 text-center border-r border-gray-100/40 cursor-pointer hover:bg-emerald-50/20 transition-all select-none"
                                >
                                  {allSessionsWithObs.length === 0 ? (
                                    isFuture ? (
                                      <span className="text-[10px] text-gray-350 font-bold italic block">Belum berlangsung</span>
                                    ) : (
                                      <span className="text-[10px] text-gray-450 font-bold italic block">Belum dinilai</span>
                                    )
                                  ) : allSessionsWithObs.length === 1 ? (
                                    <div className="flex flex-col items-center">
                                      {allSessionsWithObs[0].obs && allSessionsWithObs[0].obs.grading ? (
                                        <div 
                                          className={cn(
                                            "inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-[9px] font-black border uppercase tracking-wider shadow-sm",
                                            grades.find(g => g.id === allSessionsWithObs[0].obs.grading)?.color || "bg-gray-100 text-gray-750 border-gray-200"
                                          )}
                                          title={getFullGradingLabel(allSessionsWithObs[0].obs.grading || '')}
                                        >
                                          {allSessionsWithObs[0].obs.grading}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-gray-450 font-bold italic block">Belum dinilai</span>
                                      )}
                                      {(() => {
                                        const photo = getValidPhotoForStudentInSession(allSessionsWithObs[0].session, allSessionsWithObs[0].obs);
                                        if (photo) {
                                          return (
                                            <div className="mt-1.5 flex justify-center">
                                              <img 
                                                src={photo} 
                                                alt={student.name} 
                                                className="w-9 h-9 object-cover rounded-lg border border-gray-150 hover:scale-105 shadow-sm transition"
                                                referrerPolicy="no-referrer"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setPreviewImageUrl(photo);
                                                }}
                                                title={photoTooltip}
                                              />
                                            </div>
                                          );
                                        }
                                        return <span className="text-[9px] text-gray-400 font-bold block mt-1.5 font-mono uppercase tracking-wider">Foto belum ada</span>;
                                      })()}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-1.5">
                                      <span className="text-[9px] bg-indigo-50 text-indigo-750 border border-indigo-150 font-black px-1.5 py-0.5 rounded-md leading-none uppercase tracking-wider shrink-0 font-mono">
                                        {allSessionsWithObs.length} Sesi
                                      </span>
                                      <div className="flex flex-wrap gap-1 justify-center max-w-[100px]">
                                        {allSessionsWithObs.map((item, idx) => {
                                          const gradingVal = item.obs && item.obs.grading;
                                          return (
                                            <span 
                                              key={idx}
                                              className={cn(
                                                "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider shadow-sm",
                                                gradingVal 
                                                  ? (grades.find(g => g.id === gradingVal)?.color || "bg-gray-100 text-gray-750 border-gray-200")
                                                  : "bg-gray-50 text-gray-400 border-gray-150"
                                              )}
                                              title={gradingVal ? getFullGradingLabel(gradingVal || '') : "Belum dinilai"}
                                            >
                                              {gradingVal || "-"}
                                            </span>
                                          );
                                        })}
                                      </div>
                                      <span className="text-[9px] text-gray-400 font-bold block font-mono uppercase tracking-wider">
                                        {(() => {
                                          const photosCount = allSessionsWithObs.filter(item => getValidPhotoForStudentInSession(item.session, item.obs) !== null).length;
                                          return photosCount > 0 ? `📷 ${photosCount} Foto` : 'Foto belum ada';
                                        })()}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-4 text-center">
                              <span className={cn(
                                "inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-black font-mono shadow-sm border",
                                countGradings === 5
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : countGradings > 0
                                  ? "bg-indigo-50 text-indigo-755 border-indigo-150"
                                  : "bg-gray-50 text-gray-400 border-gray-150"
                              )}>
                                {countGradings}/5
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Controls Bar */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Select Class (synced with top selection!) */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Kelas:</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setLastSelectedClassId(e.target.value);
                  }}
                  disabled={isRestrictedToAssignedClasses && classes.length <= 1}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {classes.map((cls) => {
                    const classStudentsCount = students.filter(s => isStudentInClass(s.classId, cls)).length;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({classStudentsCount} Siswa)
                      </option>
                    );
                  })}
                  {classes.length === 0 && (
                    <option value="">Tidak ada kelas aktif</option>
                  )}
                </select>
              </div>

              {/* Select Month */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Bulan:</span>
                <select
                  value={recapMonth}
                  onChange={(e) => setRecapMonth(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0"
                >
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Select Year */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tahun:</span>
                <select
                  value={recapYear}
                  onChange={(e) => setRecapYear(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
            </div>

            {/* Sync trigger & sub-views selector */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <button
                  type="button"
                  onClick={handleDeleteClassObservations}
                  disabled={isDeletingClassObs}
                  className="flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-700 font-extrabold px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer w-full"
                  title="Hapus data observasi kelas terpilih"
                >
                  <Trash2 size={11} className={cn(isDeletingClassObs && "animate-spin")} />
                  Hapus OBS Kelas
                </button>

                <button
                  type="button"
                  onClick={handleDeleteMonthlyObservations}
                  disabled={isBgFetching}
                  className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-150 text-red-700 font-extrabold px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer w-full"
                  title="Hapus seluruh data observasi di bulan terpilih"
                >
                  <Trash2 size={11} className={cn(isBgFetching && "animate-spin")} />
                  Hapus Data Bulanan
                </button>
              </div>

              <button
                type="button"
                onClick={loadRecapData}
                disabled={isBgFetching}
                className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-150 text-gray-700 font-extrabold px-4 py-2.5 text-xs uppercase tracking-wider rounded-2xl transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={12} className={cn(isBgFetching && "animate-spin")} />
                Sinkronisasi
              </button>

              <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200/50">
                <button
                  type="button"
                  onClick={() => setRecapSubView('monthly_table')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border-0",
                    recapSubView === 'monthly_table'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-755 bg-transparent"
                  )}
                >
                  Tabel Bulanan
                </button>
                <button
                  type="button"
                  onClick={() => setRecapSubView('matrix')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border-0",
                    recapSubView === 'matrix'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 bg-transparent"
                  )}
                >
                  Perkembangan Domain
                </button>
                <button
                  type="button"
                  onClick={() => setRecapSubView('sessions')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border-0",
                    recapSubView === 'sessions'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 bg-transparent"
                  )}
                >
                  Log Sesi ({recapData.filter(item => {
                    if (!item.date) return false;
                    const parts = item.date.split('-');
                    if (parts.length < 2) return false;
                    const isMonthMatch = parseInt(parts[0], 10) === recapYear && parseInt(parts[1], 10) === recapMonth;
                    if (!isMonthMatch) return false;

                    const activeClassObj = classes.find(c => c.id === selectedClassId);
                    const classStudents = students.filter(student => {
                      if (!selectedClassId || !activeClassObj) return false;
                      return isStudentInClass(student.classId, activeClassObj);
                    });

                    return classStudents.some(student => {
                      const obs = item.observations?.[student.id];
                      return obs && obs.grading;
                    });
                  }).length})
                </button>
              </div>
            </div>
          </div>

          {/* Quick Insights Counts */}
          {(() => {
            const activeClassObj = classes.find(c => c.id === selectedClassId);
            const classStudents = students.filter(student => {
              if (!selectedClassId || !activeClassObj) return false;
              return isStudentInClass(student.classId, activeClassObj);
            });

            const filteredRecapSessions = recapData.filter(item => {
              if (!item.date) return false;
              const parts = item.date.split('-');
              if (parts.length < 2) return false;
              const yearItem = parseInt(parts[0], 10);
              const monthItem = parseInt(parts[1], 10);
              const isMonthMatch = monthItem === recapMonth && yearItem === recapYear;
              if (!isMonthMatch) return false;

              // Filter to show sessions only if they contain at least one evaluation for the current class's students
              return classStudents.some(student => {
                const obs = getStudentObs(item.observations, student);
                return obs && obs.grading;
              });
            });

            const assessedStudentsCount = classStudents.filter(student => {
              return filteredRecapSessions.some(session => {
                const obs = getStudentObs(session.observations, student);
                return obs && obs.grading;
              });
            }).length;

            const gradingCounts = { BB: 0, MB: 0, BSH: 0, BSB: 0 };
            filteredRecapSessions.forEach(session => {
              classStudents.forEach(student => {
                const obs = getStudentObs(session.observations, student);
                if (obs && obs.grading && obs.grading in gradingCounts) {
                  gradingCounts[obs.grading as keyof typeof gradingCounts]++;
                }
              });
            });

            let maxCount = 0;
            Object.values(gradingCounts).forEach(count => {
              if (count > maxCount) {
                maxCount = count;
              }
            });

            const maxGrades = Object.entries(gradingCounts)
              .filter(([_, count]) => count === maxCount && count > 0)
              .map(([grade, _]) => grade);

            const gradeLabelMap = {
              'BB': 'Belum Berkembang',
              'MB': 'Mulai Berkembang',
              'BSH': 'Capaian Harapan (BSH)',
              'BSB': 'Sangat Baik (BSB)'
            };
            const readableDominant = maxGrades.length === 0 
              ? 'Tidak ada data' 
              : maxGrades.length === 1 
                ? gradeLabelMap[maxGrades[0] as keyof typeof gradeLabelMap]
                : `${maxGrades.join(' & ')} (masing-masing ${maxCount} observasi)`;

            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Bento Card 1: Sesi Evaluasi */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl p-6 border border-emerald-100 flex items-center justify-between shadow-sm animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest animate-pulse">Sesi Terlaksana</span>
                      <p className="text-3xl font-black text-gray-900 tracking-tight">{filteredRecapSessions.length}</p>
                      <p className="text-[11px] text-gray-500 font-medium">Pertemuan evaluasi bulan ini</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-100">
                      <Star size={24} />
                    </div>
                  </div>

                  {/* Bento Card 2: Siswa Dinilai */}
                  <div className="bg-gradient-to-br from-indigo-50 to-sky-50 rounded-3xl p-6 border border-indigo-100 flex items-center justify-between shadow-sm animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Siswa Dinilai</span>
                      <p className="text-3xl font-black text-gray-900 tracking-tight">
                        {assessedStudentsCount} <span className="text-sm font-bold text-gray-400">/ {classStudents.length} siswa</span>
                      </p>
                      <p className="text-[11px] text-gray-500 font-medium">Siswa terdaftar di kelas aktif</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
                      <UserCheck size={24} />
                    </div>
                  </div>

                  {/* Bento Card 3: Dominan Capaian */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-6 border border-purple-100 flex items-center justify-between shadow-sm animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Capaian Dominan</span>
                      <p className="text-lg font-black text-gray-900 leading-snug mt-1 truncate max-w-[200px]" title={readableDominant}>
                        {readableDominant}
                      </p>
                      <p className="text-[11px] text-gray-500 font-medium">Berdasarkan akumulasi evaluasi</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-100">
                      <Activity size={24} />
                    </div>
                  </div>
                </div>

                {/* Sub View Content */}
                {recapSubView === 'matrix' ? (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in text-gray-900">
                    <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Matriks Perkembangan Siswa</h3>
                      </div>
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50/70 border border-emerald-100 px-3 py-1.5 rounded-xl uppercase tracking-widest self-start">
                        Klik sel untuk rincian
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-gray-50/70 text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            <th className="p-4 pl-6 w-72 min-w-[288px]">Siswa</th>
                            {domains.map(dom => (
                              <th key={dom.id} className="p-4 text-center text-[9px] w-40" title={dom.desc}>
                                {dom.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {classStudents.map(student => (
                            <tr key={student.id} className="hover:bg-gray-50/20 transition duration-150">
                              <td className="p-4 pl-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white font-black text-xs flex items-center justify-center shadow">
                                    {student.name.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-xs font-black text-gray-800 uppercase truncate leading-tight">{student.name}</h4>
                                    <span className="text-[9px] text-gray-400 font-mono">NIS: {student.id}</span>
                                  </div>
                                </div>
                              </td>

                              {domains.map(dom => {
                                const entries: any[] = [];
                                filteredRecapSessions.forEach(session => {
                                  if (session.domain === dom.id) {
                                    const studentObs = getStudentObs(session.observations, student);
                                    if (studentObs && studentObs.grading) {
                                      entries.push({
                                        date: session.date,
                                        activity: session.activity,
                                        grading: studentObs.grading,
                                        notes: studentObs.notes,
                                        photo: studentObs.photo || session.generalPhoto,
                                        hasSpecificPhoto: !!studentObs.photo
                                      });
                                    }
                                  }
                                });
                                entries.sort((a, b) => a.date.localeCompare(b.date));

                                const counts = entries.reduce((acc, entry) => {
                                  acc[entry.grading] = (acc[entry.grading] || 0) + 1;
                                  return acc;
                                }, {} as Record<string, number>);

                                const hasData = entries.length > 0;

                                return (
                                  <td 
                                    key={dom.id} 
                                    onClick={() => {
                                      if (hasData) {
                                        setSelectedDetailCell({ student, domain: dom, entries });
                                      }
                                    }}
                                    className={cn(
                                      "p-3 text-center transition cursor-pointer vertical-align-middle",
                                      hasData ? "hover:bg-emerald-50/40" : "cursor-default text-gray-300"
                                    )}
                                  >
                                    <div className="flex flex-col items-center justify-center gap-1 min-h-[46px]">
                                      {hasData ? (
                                        <>
                                          <div className="flex flex-wrap items-center justify-center gap-1 max-w-[140px]">
                                            {Object.entries(counts).map(([grade, count]) => {
                                              const colorCls = grade === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                : grade === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                : grade === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : grade === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                                                : 'bg-gray-50 text-gray-400 border-gray-100';

                                              return (
                                                <span key={grade} className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase border tracking-tight shrink-0", colorCls)}>
                                                  {grade} <span className="text-[7.5px] font-bold text-gray-400 ml-0.5">({count}x)</span>
                                                </span>
                                              );
                                            })}
                                          </div>
                                          <span className="text-[8px] font-semibold text-gray-400 italic">
                                            {entries.length} Sesi Catatan
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-[10px] text-gray-300 italic font-mono">— Nihil —</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : recapSubView === 'sessions' ? (
                  // Log Sesi & Riwayat Foto Sub-View
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {filteredRecapSessions.length === 0 ? (
                        <div className="col-span-full bg-white rounded-3xl p-16 text-center border border-gray-100 flex flex-col items-center justify-center gap-3">
                          <ClipboardList className="text-gray-350" size={40} />
                          <div>
                            <p className="text-xs font-black text-gray-700 uppercase tracking-wider">Belum Ada Sesi Bulanan</p>
                            <p className="text-[11px] text-gray-400 mt-1 max-w-sm mx-auto leading-normal">
                              Di bulan {months.find(m => m.value === recapMonth)?.label}, belum ada sesi atau data observasi yang tercatat ke sistem Lumina.
                            </p>
                          </div>
                        </div>
                      ) : (
                        filteredRecapSessions.map(session => {
                          const actConfig = activities.find(a => a.id === session.activity);
                          const totalGradedCount = Object.keys(session.observations).filter(sid => {
                            const inClass = classStudents.some(cs => cs.id === sid);
                            return inClass && session.observations[sid].grading;
                          }).length;

                          return (
                            <div 
                              key={session.id}
                              onClick={() => setSelectedDetailSession(session)}
                              className="bg-white rounded-3xl p-5 border border-gray-100 hover:border-emerald-250 hover:shadow-md transition-all duration-300 flex gap-5 cursor-pointer items-start group"
                            >
                              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0 flex items-center justify-center relative shadow-inner">
                                {session.generalPhoto ? (
                                  <img src={session.generalPhoto} alt={session.activity} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="text-center p-2 flex flex-col items-center justify-center gap-1">
                                    <ImageIcon size={22} className="text-gray-350 animate-pulse" />
                                    <span className="text-[7.5px] text-gray-400 font-bold leading-normal">Tanpa Foto</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg text-gray-400">
                                    <span className="text-[8.5px] font-bold text-gray-400 font-mono">{session.date}</span>
                                  </div>
                                  {session.activity === 'SPECIAL_ACTIVITY' ? (
                                    <span className={cn(
                                      "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wide",
                                      session.specialActivityType === 'holiday'
                                        ? "text-rose-700 bg-rose-50"
                                        : "text-amber-700 bg-amber-50"
                                    )}>
                                      {session.specialActivityType === 'holiday' ? 'Libur' : 'Kegiatan Khusus'}
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wide">
                                      {totalGradedCount} Siswa Dinilai
                                    </span>
                                  )}
                                </div>

                                <div className="space-y-0.5 mt-1">
                                  <h4 className="text-sm font-black text-gray-850 tracking-tight leading-snug truncate uppercase">
                                    {session.activity === 'SPECIAL_ACTIVITY' ? 'Kegiatan Khusus' : (actConfig?.label || session.activity)}
                                  </h4>
                                  <p className="text-[10px] text-gray-400 font-black tracking-widest uppercase">
                                    {session.activity === 'SPECIAL_ACTIVITY'
                                      ? (session.specialActivityName || '— Belum Diberi Nama —')
                                      : (domains.find(d => d.id === session.domain)?.label || session.domain)
                                    }
                                  </p>
                                </div>

                                {session.generalNote && (
                                  <div className="mt-2 text-left bg-indigo-50/40 border border-indigo-150/40 rounded-xl p-2.5 text-[10.5px] leading-relaxed text-gray-650">
                                    <strong className="text-indigo-950 block text-[9px] uppercase tracking-wider font-extrabold mb-0.5">Catatan Umum:</strong>
                                    <div className="font-medium text-gray-700 line-clamp-3">
                                      {session.generalNote}
                                    </div>
                                    {session.generalNote.length > 90 && (
                                      <span className="text-[9px] font-black text-indigo-600 block mt-1">
                                        Lihat selengkapnya...
                                      </span>
                                    )}
                                  </div>
                                )}

                                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider flex items-center gap-1 hover:text-emerald-800 transition">
                                  Lihat Sesi Rincian <ChevronRight size={12} strokeWidth={2.5} />
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  // Monthly Observation Daily Table view
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in text-gray-900">
                    <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Tabel Hasil Observasi Bulanan</h3>
                        <p className="text-[11px] font-medium text-gray-400 mt-0.5">Daftar rekap harian semua domain yang diobservasi dalam sebulan</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase">
                        <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-100">BB: Belum Berkembang</span>
                        <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100">MB: Mulai Berkembang</span>
                        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">BSH: Berkembang Sesuai Harapan</span>
                        <span className="px-2 py-1 rounded bg-teal-50 text-teal-700 border border-teal-100">BSB: Berkembang Sangat Baik</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs min-w-[1000px]">
                        <thead>
                          <tr className="bg-gray-50/70 text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            <th className="p-4 pl-6 sticky left-0 bg-gray-50 border-r border-gray-100/80 w-72 min-w-[288px] z-10">Siswa</th>
                            {Array.from({ length: daysInMonth }).map((_, idx) => {
                              const day = idx + 1;
                              const weekend = isWeekendDay(day);
                              return (
                                <th 
                                  key={day}
                                  className={cn(
                                    "p-2 text-center font-bold border-r border-gray-100/40 w-10 min-w-[40px] text-[10px]",
                                    weekend ? "bg-red-50/50 text-rose-600" : "text-gray-600"
                                  )}
                                >
                                  {day}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {classStudents.length === 0 ? (
                            <tr>
                              <td colSpan={daysInMonth + 1} className="p-8 text-center text-gray-400 font-bold italic">
                                Belum ada siswa terdaftar di kelas ini.
                              </td>
                            </tr>
                          ) : (
                            classStudents.map(student => {
                              return (
                                <tr key={student.id} className="hover:bg-gray-50/20 transition duration-150">
                                  {/* Student Name */}
                                  <td className="p-4 pl-6 font-bold text-gray-800 sticky left-0 bg-white border-r border-gray-100/80 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[288px] max-w-[320px] truncate">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded bg-emerald-500 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                                        {student.name.charAt(0)}
                                      </div>
                                      <div className="truncate">
                                        <p className="text-xs font-black truncate uppercase leading-tight text-gray-850" title={student.name}>{student.name}</p>
                                        <p className="text-[8px] text-gray-400 font-mono">ID: {student.id}</p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Daily cells */}
                                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                                    const day = idx + 1;
                                    const dayStr = String(day).padStart(2, '0');
                                    const monthStr = String(recapMonth).padStart(2, '0');
                                    const dateStr = `${recapYear}-${monthStr}-${dayStr}`;
                                    
                                    const dailyRecords = studentDailyObsMap[student.id]?.[dateStr] || [];
                                    const hasRecords = dailyRecords.length > 0;
                                    const weekend = isWeekendDay(day);

                                    return (
                                      <td 
                                        key={day}
                                        className={cn(
                                          "p-1 border-r border-gray-100/40 text-center text-[10px]",
                                          weekend ? "bg-red-50/10" : ""
                                        )}
                                      >
                                        <div className="flex flex-col items-center justify-center gap-1 min-h-[36px]">
                                          {hasRecords ? (
                                            dailyRecords.map((rec, rIdx) => {
                                              const grade = rec.grading;
                                              const colorCls = grade === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                : grade === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                : grade === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : grade === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                                                : 'bg-gray-50 text-gray-400 border-gray-100';
                                              
                                              const domainLabel = domains.find(d => d.id === rec.domain)?.label || rec.domain;
                                              const activityLabel = activities.find(a => a.id === rec.activity)?.label || rec.activity;

                                              return (
                                                <span 
                                                  key={rIdx} 
                                                  className={cn(
                                                    "px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tight border cursor-help select-none shrink-0 leading-normal",
                                                    colorCls
                                                  )}
                                                  title={`${domainLabel}\n(${activityLabel})`}
                                                >
                                                  {grade}
                                                </span>
                                              );
                                            })
                                          ) : (
                                            <span className="text-gray-150 inline-block font-black select-none text-[8px]">—</span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

        </div>
      )}

      {/* Popups & Lightboxes */}
      <AnimatePresence>
        {selectedDetailCell && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-gray-100"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between border-0">
                <div>
                  <span className="text-[9px] font-black tracking-widest uppercase text-emerald-100">Lumina Kindergarten Recap</span>
                  <h3 className="text-lg font-black tracking-tight uppercase leading-tight mt-0.5">
                    {selectedDetailCell.student.name}
                  </h3>
                  <p className="text-xs text-emerald-100 font-bold mt-1">
                    Domain: {selectedDetailCell.domain.label}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedDetailCell(null)}
                  className="p-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer text-white border-0 bg-transparent"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/50">
                <div className="flex items-center justify-between text-xs text-gray-500 font-medium pb-2 border-b border-gray-100">
                  <span>Bulan {months.find(m => m.value === recapMonth)?.label} {recapYear}</span>
                  <span className="font-bold text-gray-700">Ditemukan {selectedDetailCell.entries.length} Catatan Sesi</span>
                </div>

                <div className="space-y-4">
                  {selectedDetailCell.entries.map((entry, idx) => {
                    const actConfig = activities.find(a => a.id === entry.activity);
                    const grConfig = grades.find(g => g.id === entry.grading);
                    
                    const gradeColor = entry.grading === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                      : entry.grading === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                      : entry.grading === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : entry.grading === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                      : 'bg-gray-50 text-gray-400 border-gray-100';
                    
                    return (
                      <div key={idx} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-5 items-start">
                        {/* Photo */}
                        <div className="w-full md:w-32 aspect-video md:aspect-square bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-100 flex items-center justify-center">
                          {entry.photo ? (
                            <img src={entry.photo} alt={entry.date} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="text-center p-2 flex flex-col items-center justify-center gap-1">
                              <ImageIcon size={20} className="text-gray-305" />
                              <span className="text-[8px] text-gray-400 leading-tight">Tidak ada foto</span>
                            </div>
                          )}
                        </div>

                        {/* Text details */}
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-gray-800 uppercase">{actConfig?.label || entry.activity}</span>
                            </div>
                            
                            <span className="text-[10px] font-bold text-gray-400 font-mono">
                              {entry.date}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Capaian:</span>
                            <span className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border tracking-tight", gradeColor)}>
                              {grConfig?.label || entry.grading}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Catatan Guru:</span>
                            <p className="text-xs font-semibold text-gray-705 bg-gray-50/70 rounded-xl p-3 border border-gray-100 leading-relaxed font-sans italic pr-2">
                              {entry.notes || '— Tidak ada catatan khusus —'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedDetailCell(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer border-0"
                >
                  Tutup Rincian
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {selectedDetailSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-gray-100"
            >
              {/* Header */}
              {isEditingPopupSession ? (
                <div className="p-6 bg-gradient-to-r from-amber-600 to-indigo-800 text-white flex flex-col gap-4 border-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black tracking-widest uppercase text-amber-100">Lumina Sesi Evaluasi Detail — Edit Sesi</span>
                      <h3 className="text-lg font-black tracking-tight uppercase leading-tight mt-0.5">
                        Ubah Sentra & Domain Sesi
                      </h3>
                    </div>
                    <button 
                      onClick={() => {
                        setIsEditingPopupSession(false);
                        setSelectedDetailSession(null);
                      }}
                      className="p-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer text-white border-0 bg-transparent"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="flex flex-col gap-1 text-left">
                      <label className="text-[9px] font-black uppercase text-amber-200">Sentra (Activity)</label>
                      <select
                        value={popupActivity}
                        onChange={(e) => setPopupActivity(e.target.value as KGActivity)}
                        className="bg-amber-900/60 text-white text-xs font-bold border border-amber-500/50 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
                      >
                        {activities.map(act => (
                          <option key={act.id} value={act.id} className="text-gray-900 bg-white font-semibold">
                            {act.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 text-left">
                      <label className="text-[9px] font-black uppercase text-amber-200">Domain Perkembangan</label>
                      <select
                        value={popupDomain}
                        onChange={(e) => setPopupDomain(e.target.value as KGDomain)}
                        className="bg-indigo-900/60 text-white text-xs font-bold border border-indigo-500/50 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
                      >
                        {domains.map(dom => (
                          <option key={dom.id} value={dom.id} className="text-gray-900 bg-white font-semibold">
                            {dom.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-gradient-to-r from-teal-700 to-indigo-800 text-white flex items-center justify-between border-0">
                  <div className="text-left">
                    <span className="text-[9px] font-black tracking-widest uppercase text-indigo-100">Lumina Sesi Evaluasi Detail</span>
                    <h3 className="text-lg font-black tracking-tight uppercase leading-tight mt-0.5">
                      Sesi: {selectedDetailSession.activity === 'SPECIAL_ACTIVITY' ? 'Kegiatan Khusus' : (activities.find(a => a.id === selectedDetailSession.activity)?.label || selectedDetailSession.activity)}
                    </h3>
                    <p className="text-xs text-indigo-100 font-bold mt-1">
                      {selectedDetailSession.activity === 'SPECIAL_ACTIVITY' ? (
                        <>Nama Kegiatan: {selectedDetailSession.specialActivityName || '—'} | Jenis: {selectedDetailSession.specialActivityType === 'holiday' ? 'Libur' : 'Ada Kegiatan'} | Tanggal: {selectedDetailSession.date}</>
                      ) : (
                        <>Domain: {domains.find(d => d.id === selectedDetailSession.domain)?.label || selectedDetailSession.domain} | Tanggal: {selectedDetailSession.date}</>
                      )}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsEditingPopupSession(false);
                      setSelectedDetailSession(null);
                    }}
                    className="p-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer text-white border-0 bg-transparent"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/50">
                {/* General session photo if available */}
                {selectedDetailSession.generalPhoto && (
                  <div className="space-y-2 text-left">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Foto Kegiatan Utama (General)</span>
                    <div className="aspect-video w-full max-h-[160px] rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
                      <img src={selectedDetailSession.generalPhoto} alt="General session photo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  </div>
                )}

                {/* Catatan Umum Hari Ini */}
                <div className="bg-white rounded-3xl p-5 border border-gray-150/60 shadow-sm space-y-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Catatan Umum Hari Ini</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingPopupGeneralNote(prev => !prev);
                        setPopupGeneralNoteText(selectedDetailSession.generalNote || "");
                      }}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black rounded-lg text-[9px] uppercase tracking-wider transition cursor-pointer border-0"
                    >
                      {isEditingPopupGeneralNote ? "Batal" : "Edit Catatan Umum"}
                    </button>
                  </div>

                  {isEditingPopupGeneralNote ? (
                    <div className="space-y-2 mt-1">
                      <textarea
                        value={popupGeneralNoteText}
                        onChange={(e) => setPopupGeneralNoteText(e.target.value)}
                        placeholder="Tulis catatan umum kegiatan kelas pada hari ini (opsional)…"
                        className="w-full h-24 p-3.5 text-xs bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-gray-800 placeholder-gray-400"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSavePopupGeneralNote}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-[9px] uppercase tracking-wider flex items-center gap-1 transition shadow-sm border-0 cursor-pointer"
                        >
                          <Save size={11} />
                          Simpan Catatan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-700 font-medium whitespace-pre-wrap leading-relaxed mt-1">
                      {selectedDetailSession.generalNote || (
                        <span className="text-gray-400 italic font-medium">— Belum ada catatan umum untuk sesi ini —</span>
                      )}
                    </p>
                  )}

                  {(selectedDetailSession.generalNoteUpdatedAt || selectedDetailSession.generalNoteUpdatedByName) && (
                    <span className="text-[8.5px] text-gray-400 font-medium block pt-1.5 border-t border-gray-100">
                      Terakhir diperbarui{selectedDetailSession.generalNoteUpdatedByName ? ` oleh ${selectedDetailSession.generalNoteUpdatedByName}` : ""}{selectedDetailSession.generalNoteUpdatedAt ? ` pada ${new Date(selectedDetailSession.generalNoteUpdatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` : ""}
                    </span>
                  )}
                </div>

                {selectedDetailSession.activity !== 'SPECIAL_ACTIVITY' && (
                  <div className="space-y-4 text-left">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Daftar Penilaian Siswa</span>
                    
                    {(() => {
                      const activeClassObj = classes.find(c => c.id === selectedClassId);
                      const classStudents = students.filter(student => {
                        if (!selectedClassId || !activeClassObj) return false;
                        return isStudentInClass(student.classId, activeClassObj);
                      });

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {classStudents.map(student => {
                            const obs = getStudentObs(selectedDetailSession.observations, student);
                            const studentPhoto = obs.photo || selectedDetailSession.generalPhoto;
                            const grConfig = grades.find(g => g.id === obs.grading);
                            
                            const gradeColor = obs.grading === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                              : obs.grading === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : obs.grading === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : obs.grading === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                              : 'bg-gray-50 text-gray-400 border-gray-100';
                            
                            return (
                              <div key={student.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
                                <div className="flex gap-4">
                                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0 flex items-center justify-center">
                                    {studentPhoto ? (
                                      <img src={studentPhoto} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                      <div className="text-center p-1 font-black text-xs text-gray-300">
                                        {student.name.charAt(0)}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                      <h4 className="text-xs font-black text-gray-800 uppercase truncate pr-1">{student.name}</h4>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={cn("px-2 py-0.5 text-[8px] font-black uppercase rounded-lg border leading-none", gradeColor)}>
                                          {grConfig?.id || '—'}
                                        </span>
                                        {obs.grading && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteIndividualObservation(student.id, student.name);
                                            }}
                                            title="Hapus penilaian anak ini"
                                            className="text-red-500 hover:text-red-700 hover:scale-110 transition cursor-pointer p-0.5 border-0 bg-transparent flex items-center justify-center rounded"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <p className="text-[10px] text-gray-500 font-semibold italic line-clamp-2">
                                      {obs.notes || '— Tidak ada catatan khusus —'}
                                    </p>
                                  </div>
                                </div>

                                {obs.grading && (
                                  <div className="pt-2 border-t border-gray-50 mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleInitMoveStudent(student, obs)}
                                      className="text-indigo-600 hover:text-indigo-800 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition cursor-pointer border-0 bg-transparent py-1 px-2.5 hover:bg-indigo-50 rounded-xl"
                                    >
                                      <ArrowLeftRight size={10} /> Pindahkan Siswa
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between">
                {isEditingPopupSession ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditingPopupSession(false)}
                      className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer border-0"
                    >
                      Batal Edit Sesi
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePopupSession}
                      className="px-6 py-2.5 bg-emerald-650 hover:bg-emerald-700 text-white font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer border-0 transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                    >
                      <Save size={13} />
                      Simpan Perubahan
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleDeleteEntireSession}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-extrabold rounded-xl text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Trash2 size={12} />
                      Hapus Sesi Hari Ini
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingPopupSession(true);
                          setPopupActivity(selectedDetailSession.activity);
                          setPopupDomain(selectedDetailSession.domain);
                        }}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-gray-950 font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer border-0 transition active:scale-95 flex items-center gap-1.5"
                      >
                        <Sparkles size={12} />
                        Edit Sentra & Domain
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingPopupSession(false);
                          setSelectedDetailSession(null);
                        }}
                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer border-0"
                      >
                        Tutup Rincian
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MOVE STUDENT TARGET MODAL */}
      {showMoveModal && movingStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2rem] max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col p-8 space-y-5">
            <div className="flex items-center gap-3.5 text-indigo-600">
              <div className="p-3 bg-indigo-50 rounded-2xl">
                <ArrowLeftRight size={24} className="text-indigo-600" />
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Pindahkan Siswa</h3>
            </div>
            
            <p className="text-[11px] text-gray-600 leading-relaxed font-semibold font-sans text-left">
              Pindahkan data observasi <strong className="text-gray-900 font-extrabold">{movingStudent.name}</strong> ke sesi lain pada kelas dan tanggal yang sama (<strong className="text-gray-900 font-extrabold">{selectedDetailSession?.date}</strong>).
            </p>

            <div className="space-y-4 text-left">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase text-gray-400">Pilih Sentra Tujuan</label>
                <select
                  value={moveTargetActivity}
                  onChange={(e) => setMoveTargetActivity(e.target.value as KGActivity)}
                  className="bg-gray-50 text-gray-800 text-xs font-bold border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  {activities.map(act => (
                    <option key={act.id} value={act.id}>
                      {act.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase text-gray-400">Pilih Domain Tujuan</label>
                <select
                  value={moveTargetDomain}
                  onChange={(e) => setMoveTargetDomain(e.target.value as KGDomain)}
                  className="bg-gray-50 text-gray-800 text-xs font-bold border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  {domains.map(dom => (
                    <option key={dom.id} value={dom.id}>
                      {dom.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowMoveModal(false);
                  setMovingStudent(null);
                  setMovingStudentObs(null);
                }}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider border-0 cursor-pointer transition active:scale-95"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteMoveStudent}
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-[10px] uppercase tracking-wider border-0 cursor-pointer transition active:scale-95"
              >
                Konfirmasi Pindahkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. CONFIRM EDIT SESSION MODAL */}
      {showEditConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2rem] max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col p-8 space-y-5">
            <div className="flex items-center gap-3.5 text-amber-500">
              <div className="p-3 bg-amber-50 rounded-2xl">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Konfirmasi Edit Sesi</h3>
            </div>
            
            <p className="text-[11px] text-gray-600 leading-relaxed font-semibold font-sans">
              Apakah Anda yakin ingin mengubah Sentra atau Domain untuk sesi observasi ini? 
              Mengubahnya akan menempatkan Anda pada <strong className="text-gray-900 font-extrabold">Mode Edit Sesi</strong>. 
              Perubahan tidak akan disimpan secara permanen sebelum Anda menekan tombol <strong className="text-gray-900 font-extrabold">Simpan Sesi</strong>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEditConfirm(false)}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider border-0 cursor-pointer transition active:scale-95"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEditConfirm(false);
                  setIsEditingSession(true);
                  toast.success("Mode Edit Sesi aktif. Silakan ubah Sentra & Domain di kolom sebelah kiri.");
                }}
                className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-gray-950 font-black rounded-xl text-[10px] uppercase tracking-wider border-0 cursor-pointer transition active:scale-95"
              >
                Ya, Masuk Mode Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. CONFIRM SAVE EDIT SESSION MODAL */}
      {showSaveEditConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2rem] max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col p-8 space-y-5">
            <div className="flex items-center gap-3.5 text-emerald-600">
              <div className="p-3 bg-emerald-50 rounded-2xl">
                <Sparkles size={24} className="text-emerald-500" />
              </div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Simpan Perubahan Sesi</h3>
            </div>
            
            <p className="text-[11px] text-gray-600 leading-relaxed font-semibold font-sans">
              Apakah Anda yakin ingin menyimpan perubahan Sentra & Domain untuk sesi ini?
              Tindakan ini akan memperbarui Sentra dan Domain untuk <strong className="text-gray-900 font-extrabold">seluruh catatan observasi siswa</strong> di sesi ini.
              Grading, catatan pembelajaran, foto siswa, dan status kehadiran siswa <strong className="text-gray-900 font-extrabold">tidak akan berubah</strong> sama sekali.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveEditConfirm(false)}
                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider border-0 cursor-pointer transition active:scale-95"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowSaveEditConfirm(false);
                  await handleSaveSessionChanges();
                }}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-[10px] uppercase tracking-wider border-0 cursor-pointer transition active:scale-95"
              >
                Ya, Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA CAPTURE MODAL */}
      {activeCameraTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <Camera className="text-emerald-600" size={20} />
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                  Ambil Foto Kamera - {activeCameraTarget.type === 'general' ? 'Kegiatan Utama' : 'Khusus Siswa'}
                </h3>
              </div>
              <button 
                onClick={stopCamera}
                className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-video bg-black flex items-center justify-center">
              {isCameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900 text-white z-10">
                  <Loader2 className="animate-spin text-emerald-500" size={32} />
                  <span className="text-xs font-bold text-gray-400">Menghubungkan Kamera...</span>
                </div>
              )}
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
              />
            </div>

            {/* Modal Controls */}
            <div className="p-5 bg-gray-50 border-t border-gray-100 space-y-4">
              
              {/* Camera Source Selector (if multiple cameras available) */}
              {cameraDevices.length > 1 && (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs">
                  <span className="font-bold text-gray-500">Pilih Kamera:</span>
                  <select
                    value={selectedCameraDeviceId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSelectedCameraDeviceId(newId);
                      startCamera(newId);
                    }}
                    className="bg-transparent border-0 p-0 text-xs font-bold text-gray-800 focus:ring-0 outline-none cursor-pointer flex-1"
                  >
                    {cameraDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Kamera ${device.deviceId.substring(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex-1 py-3 border border-gray-200 hover:bg-gray-100 text-gray-700 font-extrabold text-xs uppercase tracking-wider rounded-xl transition active:scale-95"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={isCameraLoading || !cameraStream}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100"
                >
                  <CheckCircle2 size={15} />
                  Ambil & Simpan
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* DEVELOPER & ADMIN ENROLLMENT AUDIT PANEL */}
      {profile?.role === 'SUPER_ADMIN' && (
        <div className="bg-white rounded-3xl p-8 border border-gray-150 shadow-sm mt-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                Admin & Developer Enrollment Audit
              </h2>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Read-only diagnostic utility to audit Kindergarten enrollments in 2026/2027 for non-canonical classId references.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunEnrollmentAudit}
              disabled={auditLoading}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-black text-xs uppercase tracking-wider rounded-xl transition active:scale-95 flex items-center gap-2 cursor-pointer shadow-sm shadow-indigo-150 border-0"
            >
              {auditLoading ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  Running Audit...
                </>
              ) : (
                <>
                  <Activity size={14} />
                  Run Non-Mutating Audit
                </>
              )}
            </button>
          </div>

          {auditResults !== null && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">
                  Found <strong className="text-red-600 font-black">{auditResults.length}</strong> non-canonical enrollment records
                </span>
                <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-md font-bold uppercase tracking-wide">
                  Read-Only Mode — No Data Altered
                </span>
              </div>

              {auditResults.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100 text-xs font-bold text-gray-500">
                  No non-canonical enrollment records found! All active enrollments are perfectly canonical.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        <th className="p-4">Enrollment Doc ID</th>
                        <th className="p-4">Student ID / Name</th>
                        <th className="p-4">Raw classId (Incorrect)</th>
                        <th className="p-4">Resolved Canonical classId</th>
                        <th className="p-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-semibold text-gray-700">
                      {auditResults.map((res, idx) => {
                        const isAlmahyra = res.studentId === '2602014';
                        return (
                          <tr key={idx} className={`hover:bg-gray-50/50 transition ${isAlmahyra ? 'bg-amber-50/50 hover:bg-amber-50' : ''}`}>
                            <td className="p-4 font-mono text-[10px] text-gray-500">{res.enrollmentDocId}</td>
                            <td className="p-4">
                              <div className="font-extrabold text-gray-900">{res.studentName}</div>
                              <div className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {res.studentId}</div>
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-[10px] font-bold border border-red-100">
                                {res.rawClassId}
                              </span>
                            </td>
                            <td className="p-4">
                              {res.resolvedCanonicalClassId === 'Unresolved/Ambiguous' ? (
                                <span className="text-red-500 italic">Unresolved/Ambiguous</span>
                              ) : (
                                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold border border-emerald-100">
                                  {res.resolvedCanonicalClassId}
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              {isAlmahyra ? (
                                <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  Almahyra Confirmed
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                  Resolvable
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Multiple Sessions Selection Modal */}
      {multipleSessionsModalData && (
        <div className="fixed inset-0 bg-gray-950/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Pilih Sesi Observasi</h3>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5 uppercase">
                  {multipleSessionsModalData.student.name} — {formatWeekdayHeader(multipleSessionsModalData.date).dayName}, {multipleSessionsModalData.dateStr}
                </p>
              </div>
              <button 
                onClick={() => setMultipleSessionsModalData(null)}
                className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-650 transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3 max-h-[300px] overflow-y-auto">
              {multipleSessionsModalData.sessions.map((item, index) => {
                const gradingCode = item.obs ? item.obs.grading : null;
                const photo = getValidPhotoForStudentInSession(item.session, item.obs);
                const activityLabel = activities.find(a => a.id === item.session.activity)?.label || item.session.title || item.session.activity;
                const domainLabel = domains.find(dom => dom.id === item.session.domain)?.label || item.session.caption || item.session.domain;
                
                return (
                  <button
                    key={index}
                    onClick={() => {
                      handleFilledCellClick(item, multipleSessionsModalData.student.id);
                      setMultipleSessionsModalData(null);
                    }}
                    className="w-full flex items-center gap-3.5 p-3.5 bg-gray-50/70 hover:bg-emerald-50/30 border border-gray-100 hover:border-emerald-200 rounded-2xl text-left transition cursor-pointer"
                  >
                    {photo ? (
                      <img 
                        src={photo} 
                        alt={activityLabel} 
                        className="w-10 h-10 object-cover rounded-xl border border-gray-150"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 text-gray-450 rounded-xl flex items-center justify-center border border-gray-150">
                        <ImageIcon size={18} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-gray-850 truncate uppercase">{activityLabel}</p>
                      <p className="text-[10px] text-gray-400 font-semibold truncate uppercase mt-0.5">{domainLabel}</p>
                      <p className={cn(
                        "text-[9px] font-bold mt-0.5 uppercase",
                        photo ? "text-emerald-600" : "text-gray-400 font-mono"
                      )}>
                        {photo ? "✓ Foto Tersedia" : "✗ Foto belum ada"}
                      </p>
                    </div>
                    <div 
                      className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider shrink-0",
                        gradingCode ? (grades.find(g => g.id === gradingCode)?.color || "bg-gray-100 text-gray-750 border-gray-200") : "bg-gray-50 text-gray-400 border-gray-150 font-medium italic normal-case"
                      )}
                    >
                      {gradingCode || "Belum dinilai"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl bg-black">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImageUrl(null);
              }}
              className="absolute top-4 right-4 p-2 bg-gray-900/60 hover:bg-gray-900/85 rounded-full text-white/80 hover:text-white transition z-10"
            >
              <X size={18} />
            </button>
            <img 
              src={previewImageUrl} 
              alt="Pratinjau Foto Kegiatan" 
              className="max-w-full max-h-[85vh] object-contain rounded-[2rem]"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

    </div>
  );
}
