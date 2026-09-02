import * as React from 'react';
import { 
  Search, Filter, ClipboardList, CheckCircle2, AlertTriangle, Trash2, 
  Loader2, Sparkles, Send, FileSpreadsheet, Eye, RefreshCw, XCircle,
  X, BookOpen, Calculator
} from 'lucide-react';
import { 
  getActiveStudents, db 
} from '../../lib/firebase';
import { JuniorHighAAPResult, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn, makeAAPResultId } from '../../lib/utils';
import { collection, doc, writeBatch, deleteDoc, getDocs, getDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

// Helper to determine if a teacher has authorization to access a class
const checkClassAccess = (classObj: any, userProfile: any): boolean => {
  if (!classObj || !userProfile) return false;

  // Admins and non-teacher staff roles bypass standard class-access restrictions
  const superRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'SECRETARY_JH', 'COORDINATOR'];
  if (superRoles.includes(userProfile.role)) {
    return true;
  }

  // If standard teacher or homeroom teacher, verify assignment
  const uid = userProfile.uid;
  
  const isHomeroom = classObj.homeroomTeacherId === uid ||
    (classObj.homeroomTeacherIds && classObj.homeroomTeacherIds.includes(uid)) ||
    (classObj.waliKelasIds && classObj.waliKelasIds.includes(uid));

  const isAssigned = (classObj.assignedTeacherIds && classObj.assignedTeacherIds.includes(uid)) ||
    (classObj.gpkTeacherIds && classObj.gpkTeacherIds.includes(uid));

  const hasAssignmentInArray = classObj.teacherAssignments && classObj.teacherAssignments.some((a: any) => a.userId === uid);

  return !!(isHomeroom || isAssigned || hasAssignmentInArray);
};

// Parsing and Normalization Helpers
const normalizeName = (name: string): string => {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
};

const parseMathLevel = (raw: string): 'Beginning Understanding' | 'Supported Understanding' | 'Independent Understanding' | 'Demonstrating Mastery' | '' => {
  if (!raw) return '';
  const val = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (val.includes('beginning') || val.includes('foundations') || val.includes('building')) return 'Beginning Understanding';
  if (val.includes('supported') || val.includes('guidance') || val.includes('growing')) return 'Supported Understanding';
  if (val.includes('independent') || val.includes('independently') || val.includes('progressing')) return 'Independent Understanding';
  if (val.includes('mastery') || val.includes('demonstrating')) return 'Demonstrating Mastery';
  return '';
};

const parseReadingFluency = (raw: string): 'IR+' | 'ER' | 'ER EN' | '' => {
  if (!raw) return '';
  const val = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  if (val === 'IR+' || val === 'IR +') return 'IR+';
  if (val === 'ER') return 'ER';
  if (val === 'ER EN' || val === 'EREN' || val.includes('ER EN') || val.includes('ER-EN')) return 'ER EN';
  return '';
};

const parseMengaji = (raw: string): { material: 'IQRO 1' | 'IQRO 2' | 'IQRO 3' | 'IQRO 4' | 'IQRO 5' | 'IQRO 6' | 'JUZ AMMA' | 'ALQURAN' | ''; category: 'ISYROF' | 'MUBTADI' | 'MAQBUL' | 'JAYYID' | '' } | null => {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/['’]/g, "").trim();
  
  let material: any = "";
  if (cleaned.includes("IQRO 1")) material = "IQRO 1";
  else if (cleaned.includes("IQRO 2")) material = "IQRO 2";
  else if (cleaned.includes("IQRO 3")) material = "IQRO 3";
  else if (cleaned.includes("IQRO 4")) material = "IQRO 4";
  else if (cleaned.includes("IQRO 5")) material = "IQRO 5";
  else if (cleaned.includes("IQRO 6")) material = "IQRO 6";
  else if (cleaned.includes("JUZ AMMA")) material = "JUZ AMMA";
  else if (cleaned.includes("ALQURAN") || cleaned.includes("AL-QURAN") || cleaned.includes("AL QURAN")) material = "ALQURAN";

  let category: any = "";
  if (cleaned.includes("ISYROF")) category = "ISYROF";
  else if (cleaned.includes("MUBTADI")) category = "MUBTADI";
  else if (cleaned.includes("MAQBUL")) category = "MAQBUL";
  else if (cleaned.includes("JAYYID")) category = "JAYYID";

  if (!material || !category) return null;
  return { material, category };
};

const parseBahasaIndonesia = (raw: string): { level: number; label: 'Perlu Pendampingan Intensif' | 'Perlu Penguatan Terarah' | 'Siap Berkembang' | 'Siap Lanjut' | '' } | null => {
  if (!raw) return null;
  const val = raw.trim().toLowerCase();
  if (val === '1' || val.includes('intensif') || val.includes('pendampingan')) {
    return { level: 1, label: 'Perlu Pendampingan Intensif' };
  }
  if (val === '2' || val.includes('terarah') || val.includes('penguatan')) {
    return { level: 2, label: 'Perlu Penguatan Terarah' };
  }
  if (val === '3' || val.includes('berkembang') || val.includes('siap berkembang')) {
    return { level: 3, label: 'Siap Berkembang' };
  }
  if (val === '4' || val.includes('lanjut') || val.includes('siap lanjut')) {
    return { level: 4, label: 'Siap Lanjut' };
  }
  return null;
};

// Helper to format audit timestamps
const formatAuditDate = (timestamp: any): string => {
  if (!timestamp) return '';
  let date: Date;
  if (typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (timestamp.seconds !== undefined) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    return '';
  }
  return date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

// Multi-component completeness & status helper
const getStudentAAPStatusAndTerisi = (result: JuniorHighAAPResult | undefined) => {
  if (!result) {
    return {
      status: 'KOSONG',
      terisiText: '0/3 komponen terisi',
      filledCount: 0
    };
  }

  const hasNumeracy = !!result.mathLevel;
  const hasReadingFluency = !!result.readingFluencyLevel;
  const hasMengaji = !!result.mengajiMaterial && !!result.mengajiCategory;

  const filledCount = (hasNumeracy ? 1 : 0) + (hasReadingFluency ? 1 : 0) + (hasMengaji ? 1 : 0);

  if (filledCount === 0) {
    return {
      status: 'KOSONG',
      terisiText: '0/3 komponen terisi',
      filledCount: 0
    };
  }

  const isLengkap = filledCount === 3;

  let status: 'PARSIAL' | 'LENGKAP' | 'PUBLISHED' | 'PERLU_PUBLISH_ULANG' = 'PARSIAL';
  if (isLengkap) {
    if (result.status === 'PUBLISHED') {
      status = 'PUBLISHED';
    } else if (result.status === 'PERLU_PUBLISH_ULANG') {
      status = 'PERLU_PUBLISH_ULANG';
    } else {
      status = 'LENGKAP';
    }
  } else {
    status = 'PARSIAL';
  }

  return {
    status,
    terisiText: `${filledCount}/3 komponen terisi`,
    filledCount
  };
};

// Build new component-level audit metadata
const buildNewComponentAudit = (
  existingAudit: any,
  currentFields: {
    mathLevel: string;
    readingFluencyLevel: string;
    mengajiMaterial: string;
    mengajiCategory: string;
  },
  existingFields: {
    mathLevel: string;
    readingFluencyLevel: string;
    mengajiMaterial: string;
    mengajiCategory: string;
  } | undefined,
  user: any
) => {
  const audit: any = existingAudit ? { ...existingAudit } : {};

  const userUid = user.uid || '';
  const userName = user.displayName || user.name || user.fullName || 'Staf';
  const userEmail = user.email || '';
  const now = new Date();

  const userIdentity = {
    uid: userUid,
    name: userName,
    email: userEmail
  };

  // 1. Numeracy
  const hasNumeracy = !!currentFields.mathLevel;
  if (hasNumeracy) {
    const prevAudit = audit.numeracy;
    const valChanged = !existingFields || currentFields.mathLevel !== existingFields.mathLevel;
    
    if (!prevAudit) {
      audit.numeracy = {
        createdBy: userIdentity.uid,
        createdByName: userIdentity.name,
        createdByEmail: userIdentity.email,
        createdAt: now,
        updatedBy: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email,
        updatedAt: now
      };
    } else if (valChanged) {
      audit.numeracy = {
        ...prevAudit,
        updatedBy: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email,
        updatedAt: now
      };
    }
  } else {
    if (!existingFields?.mathLevel) {
      delete audit.numeracy;
    }
  }

  // 2. Reading Fluency
  const hasReading = !!currentFields.readingFluencyLevel;
  if (hasReading) {
    const prevAudit = audit.readingFluency;
    const valChanged = !existingFields || currentFields.readingFluencyLevel !== existingFields.readingFluencyLevel;

    if (!prevAudit) {
      audit.readingFluency = {
        createdBy: userIdentity.uid,
        createdByName: userIdentity.name,
        createdByEmail: userIdentity.email,
        createdAt: now,
        updatedBy: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email,
        updatedAt: now
      };
    } else if (valChanged) {
      audit.readingFluency = {
        ...prevAudit,
        updatedBy: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email,
        updatedAt: now
      };
    }
  } else {
    if (!existingFields?.readingFluencyLevel) {
      delete audit.readingFluency;
    }
  }

  // 3. Mengaji
  const hasMengaji = !!currentFields.mengajiMaterial && !!currentFields.mengajiCategory;
  if (hasMengaji) {
    const prevAudit = audit.mengaji;
    const valChanged = !existingFields || 
      currentFields.mengajiMaterial !== existingFields.mengajiMaterial ||
      currentFields.mengajiCategory !== existingFields.mengajiCategory;

    if (!prevAudit) {
      audit.mengaji = {
        createdBy: userIdentity.uid,
        createdByName: userIdentity.name,
        createdByEmail: userIdentity.email,
        createdAt: now,
        updatedBy: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email,
        updatedAt: now
      };
    } else if (valChanged) {
      audit.mengaji = {
        ...prevAudit,
        updatedBy: userIdentity.uid,
        updatedByName: userIdentity.name,
        updatedByEmail: userIdentity.email,
        updatedAt: now
      };
    }
  } else {
    if (!(existingFields?.mengajiMaterial && existingFields?.mengajiCategory)) {
      delete audit.mengaji;
    }
  }

  return audit;
};

interface PreviewRow {
  index: number;
  rawNo: string;
  rawName: string;
  rawMath: string;
  rawReading: string;
  rawMengaji: string;
  rawBahasa: string;
  
  // Parsed fields
  mathLevel: 'Beginning Understanding' | 'Supported Understanding' | 'Independent Understanding' | 'Demonstrating Mastery' | '';
  readingFluencyLevel: 'IR+' | 'ER' | 'ER EN' | '';
  mengajiMaterial: 'IQRO 1' | 'IQRO 2' | 'IQRO 3' | 'IQRO 4' | 'IQRO 5' | 'IQRO 6' | 'JUZ AMMA' | 'ALQURAN' | '';
  mengajiCategory: 'ISYROF' | 'MUBTADI' | 'MAQBUL' | 'JAYYID' | '';
  bahasaIndonesiaLevel: number | null;
  bahasaIndonesiaLabel: 'Perlu Pendampingan Intensif' | 'Perlu Penguatan Terarah' | 'Siap Berkembang' | 'Siap Lanjut' | '';

  // Matching Info
  matchStatus: 'Cocok' | 'Tidak ditemukan' | 'Duplikat' | 'Perlu diperiksa';
  studentId: string | null;
  validationError?: string;
}

const renderComponentAudit = (audit: any, isCurrentlyFilled: boolean) => {
  if (!audit) {
    if (isCurrentlyFilled) {
      return (
        <span className="text-[10px] text-gray-400 italic">
          Riwayat input tidak tersedia
        </span>
      );
    }
    return (
      <span className="text-[10px] text-gray-400 italic">
        Belum diisi
      </span>
    );
  }

  const createdTime = formatAuditDate(audit.createdAt);
  const updatedTime = formatAuditDate(audit.updatedAt);
  const createdName = audit.createdByName || 'Staf';
  const updatedName = audit.updatedByName || 'Staf';

  const isCreatedAndUpdatedBySame = audit.createdBy === audit.updatedBy;

  if (isCreatedAndUpdatedBySame || !audit.updatedBy) {
    return (
      <div className="text-right">
        <p className="text-[9px] text-gray-500 font-bold leading-tight">
          Diinput oleh: <span className="text-indigo-600">{createdName}</span>
        </p>
        <p className="text-[9px] text-gray-400 font-medium">
          {createdTime}
        </p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-[9px] text-gray-500 font-bold leading-tight">
        Diinput: <span className="text-indigo-600">{createdName}</span>
      </p>
      <p className="text-[9px] text-gray-500 font-bold leading-tight mt-0.5">
        Terakhir diperbarui: <span className="text-amber-600">{updatedName}</span> · <span className="text-gray-400 font-medium">{updatedTime}</span>
      </p>
    </div>
  );
};

export default function AAPStaffPage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  // Filters state
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  
  // Search state
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Master data
  const [classes, setClasses] = React.useState<any[]>([]);
  const [roster, setRoster] = React.useState<Student[]>([]);
  const [existingResults, setExistingResults] = React.useState<JuniorHighAAPResult[]>([]);

  // Workflow modes: 'LIST' or 'IMPORT'
  const [viewMode, setViewMode] = React.useState<'LIST' | 'IMPORT'>('LIST');

  // Import state
  const [rawText, setRawText] = React.useState<string>('');
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);

  // Loading states
  const [metaLoading, setMetaLoading] = React.useState<boolean>(true);
  const [dataLoading, setDataLoading] = React.useState<boolean>(false);
  const [saveLoading, setSaveLoading] = React.useState<boolean>(false);

  // Individual edit modal states
  const [isEditModalOpen, setIsEditModalOpen] = React.useState<boolean>(false);
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [editingResult, setEditingResult] = React.useState<JuniorHighAAPResult | null>(null);
  const [openedUpdatedAt, setOpenedUpdatedAt] = React.useState<any>(null); // For conflict checks

  const [formValues, setFormValues] = React.useState({
    mathLevel: '' as 'Beginning Understanding' | 'Supported Understanding' | 'Independent Understanding' | 'Demonstrating Mastery' | '',
    readingFluencyLevel: '' as 'IR+' | 'ER' | 'ER EN' | '',
    mengajiMaterial: '' as any,
    mengajiCategory: '' as any,
    bahasaIndonesiaLevel: null as number | null,
    bahasaIndonesiaLabel: '' as any
  });

  // Check role authorization
  const isAuthorized = React.useMemo(() => {
    if (!profile) return false;
    const staffRoles = [
      'TEACHER', 'HEAD_JUNIOR', 'BK_MENTOR',
      'MTSS_ACADEMIC_PJ', 'SUPER_ADMIN', 'HEAD_UNIT',
      'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR',
      'HOMEROOM_TEACHER', 'COUNSELOR', 'SECRETARY_JH'
    ];
    return staffRoles.includes(profile.role);
  }, [profile]);

  React.useEffect(() => {
    if (activeYear && !selectedYear) {
      setSelectedYear(activeYear);
    }
  }, [activeYear]);

  // Load Classes on mount/Year update
  const fetchClasses = React.useCallback(async () => {
    if (!isAuthorized || !selectedYear) return;
    setMetaLoading(true);
    try {
      const q = query(collection(db, 'classes'), where('unitId', '==', 'JUNIOR_HIGH'));
      const snap = await getDocs(q);
      let list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(c => c.academicYear === selectedYear && c.status === 'active')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      // Apply standard teacher class permissions filtering
      const isTeacherRole = ['TEACHER', 'HOMEROOM_TEACHER'].includes(profile?.role || '');
      const isSuperUser = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'SECRETARY_JH', 'COORDINATOR'].includes(profile?.role || '');
      if (isTeacherRole && !isSuperUser) {
        list = list.filter(c => checkClassAccess(c, profile));
      }

      setClasses(list);
      if (list.length > 0) {
        const exists = list.some(c => c.id === selectedClassId);
        if (!exists) {
          setSelectedClassId(list[0].id);
        }
      } else {
        setSelectedClassId('');
      }
    } catch (err) {
      console.error("Error fetching classes:", err);
      toast.error("Gagal memuat daftar kelas.");
    } finally {
      setMetaLoading(false);
    }
  }, [isAuthorized, selectedYear, selectedClassId, profile]);

  React.useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Load Roster and existing AAP results
  const fetchRosterAndResults = React.useCallback(async () => {
    if (!selectedClassId) {
      setRoster([]);
      setExistingResults([]);
      return;
    }
    setDataLoading(true);
    try {
      // 1. Get active student roster
      const students = await getActiveStudents(selectedClassId, selectedYear);
      setRoster(students || []);

      // 2. Query saved AAP results
      const q = query(
        collection(db, 'junior_high_aap_results'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', selectedYear)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as JuniorHighAAPResult));
      setExistingResults(results);

    } catch (err) {
      console.error("Error fetching roster or results:", err);
      toast.error("Gagal memuat data kelas.");
    } finally {
      setDataLoading(false);
    }
  }, [selectedClassId, selectedYear]);

  React.useEffect(() => {
    fetchRosterAndResults();
  }, [fetchRosterAndResults]);

  // Class object helper
  const currentClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Class assignment access verification
  const isClassAccessGranted = React.useMemo(() => {
    if (!currentClassObj) return false;
    return checkClassAccess(currentClassObj, profile);
  }, [currentClassObj, profile]);

  // Handle bulk paste and auto-matching
  const handlePreview = () => {
    if (!rawText.trim()) {
      toast.error("Silakan tempel data dari spreadsheet terlebih dahulu.");
      return;
    }

    const lines = rawText.split('\n');
    const parsedRows: PreviewRow[] = [];
    let matchCount = 0;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const cells = trimmed.split('\t');
      
      // Skip typical header row if present
      if (idx === 0 && (cells[0].toLowerCase().includes("no") || cells[1]?.toLowerCase().includes("nama"))) {
        return;
      }

      // NO, NAMA, MATH, READING FLUENCY, MENGAJI, BAHASA INDONESIA
      const rawNo = cells[0] || '';
      const rawName = cells[1] || '';
      const rawMath = cells[2] || '';
      const rawReading = cells[3] || '';
      const rawMengaji = cells[4] || '';
      const rawBahasa = cells[5] || '';

      // Clean individual assessments
      const mathVal = parseMathLevel(rawMath);
      const readVal = parseReadingFluency(rawReading);
      const mengajiObj = parseMengaji(rawMengaji);
      const bahasaObj = parseBahasaIndonesia(rawBahasa);

      // Validate dimensions and check parsing fails
      let hasParseError = false;
      let errorMsg = '';

      if (rawMath && !mathVal) {
        hasParseError = true;
        errorMsg += 'Math level tidak valid. ';
      }
      if (rawReading && !readVal) {
        hasParseError = true;
        errorMsg += 'Reading Fluency tidak valid. ';
      }
      if (rawMengaji && !mengajiObj) {
        hasParseError = true;
        errorMsg += 'Mengaji tidak valid. ';
      }
      if (rawBahasa && !bahasaObj) {
        hasParseError = true;
        errorMsg += 'Bahasa Indonesia tidak valid. ';
      }

      // Auto-match name
      const normInputName = normalizeName(rawName);
      let matchedStudent: Student | null = null;
      let matchStatus: PreviewRow['matchStatus'] = 'Tidak ditemukan';

      if (normInputName) {
        const matches = roster.filter(s => {
          const sName = s.name || s.fullName || '';
          return normalizeName(sName) === normInputName;
        });

        if (matches.length === 1) {
          matchedStudent = matches[0];
          matchStatus = 'Cocok';
          matchCount++;
        } else if (matches.length > 1) {
          matchStatus = 'Duplikat';
          errorMsg += 'Nama siswa terdeteksi ganda di roster. ';
        }
      }

      if (hasParseError) {
        matchStatus = 'Perlu diperiksa';
      }

      parsedRows.push({
        index: idx,
        rawNo,
        rawName,
        rawMath,
        rawReading,
        rawMengaji,
        rawBahasa,
        mathLevel: mathVal,
        readingFluencyLevel: readVal,
        mengajiMaterial: mengajiObj?.material || '',
        mengajiCategory: mengajiObj?.category || '',
        bahasaIndonesiaLevel: bahasaObj?.level || null,
        bahasaIndonesiaLabel: bahasaObj?.label || '',
        matchStatus,
        studentId: matchedStudent?.id || null,
        validationError: errorMsg.trim() || undefined
      });
    });

    setPreviewRows(parsedRows);
    toast.success(`Berhasil mengimpor ${parsedRows.length} baris. ${matchCount} otomatis cocok.`);
  };

  // Modify individual matched student ID manually
  const handleMapStudentManually = (rowIndex: number, studentId: string) => {
    setPreviewRows(prev => prev.map(row => {
      if (row.index !== rowIndex) return row;
      
      const matched = roster.find(s => s.id === studentId);
      let updatedError = row.validationError || '';
      
      // Remove "Tidak ditemukan" error from message if manually resolved
      updatedError = updatedError.replace(/Siswa tidak ditemukan./g, '').trim();

      return {
        ...row,
        studentId: studentId || null,
        matchStatus: studentId ? 'Cocok' : 'Tidak ditemukan',
        validationError: updatedError || undefined
      } as PreviewRow;
    }));
  };

  // Update scale values inside preview row manually
  const handleUpdatePreviewValue = (
    rowIndex: number, 
    field: 'mathLevel' | 'readingFluencyLevel' | 'mengajiMaterial' | 'mengajiCategory' | 'bahasaIndonesiaLabel',
    value: any
  ) => {
    setPreviewRows(prev => prev.map(row => {
      if (row.index !== rowIndex) return row;

      const updatedRow = { ...row, [field]: value };

      // Re-normalize Bahasa level if label changed
      if (field === 'bahasaIndonesiaLabel') {
        const parsed = parseBahasaIndonesia(value);
        updatedRow.bahasaIndonesiaLevel = parsed?.level || null;
      }

      // Re-validate fields
      let errorMsg = '';
      if (updatedRow.rawMath && !updatedRow.mathLevel) errorMsg += 'Math level tidak valid. ';
      if (updatedRow.rawReading && !updatedRow.readingFluencyLevel) errorMsg += 'Reading Fluency tidak valid. ';
      if (updatedRow.mengajiMaterial && !updatedRow.mengajiCategory) errorMsg += 'Mengaji tidak valid. ';
      
      updatedRow.validationError = errorMsg.trim() || undefined;
      if (updatedRow.matchStatus === 'Perlu diperiksa' && !errorMsg) {
        updatedRow.matchStatus = updatedRow.studentId ? 'Cocok' : 'Tidak ditemukan';
      } else if (errorMsg) {
        updatedRow.matchStatus = 'Perlu diperiksa';
      }

      return updatedRow;
    }));
  };

  // Delete a preview row before saving
  const handleRemovePreviewRow = (rowIndex: number) => {
    setPreviewRows(prev => prev.filter(r => r.index !== rowIndex));
    toast.info("Baris pratinjau dihapus.");
  };

  // Check duplicate mappings inside preview before submitting
  const duplicateMappingCount = React.useMemo(() => {
    const ids = previewRows.map(r => r.studentId).filter(Boolean);
    const unique = new Set(ids);
    return ids.length - unique.size;
  }, [previewRows]);

  // Bulk save data as DRAFT or PUBLISHED
  const handleSaveBulk = async (targetStatus: 'DRAFT' | 'PUBLISHED') => {
    if (previewRows.length === 0) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }

    // Identify rows with error states or duplicate student matches
    const unresolvedRows = previewRows.filter(r => !r.studentId || r.matchStatus === 'Perlu diperiksa');
    if (targetStatus === 'PUBLISHED' && unresolvedRows.length > 0) {
      const confirmPublish = window.confirm(
        `Ada ${unresolvedRows.length} baris yang bermasalah (belum cocok atau memiliki status "Perlu Diperiksa") yang TIDAK AKAN dipublikasikan.\n\nApakah Anda ingin melanjutkan publikasi baris yang valid?`
      );
      if (!confirmPublish) return;
    }

    if (duplicateMappingCount > 0) {
      toast.error("Ada siswa yang dipetakan lebih dari satu kali dalam impor ini. Harap periksa kembali.");
      return;
    }

    setSaveLoading(true);
    try {
      const batch = writeBatch(db);
      let processedCount = 0;

      // Save only valid matched rows
      const validRows = previewRows.filter(r => r.studentId && r.matchStatus !== 'Perlu diperiksa');

      validRows.forEach(row => {
        const student = roster.find(s => s.id === row.studentId);
        const docId = makeAAPResultId(row.studentId || '', selectedYear);
        const ref = doc(db, 'junior_high_aap_results', docId);

        const existing = existingResults.find(e => e.studentId === row.studentId);

        // Build per-component audits for newly filled fields
        const updatedAudit = buildNewComponentAudit(
          existing?.componentAudit,
          {
            mathLevel: row.mathLevel,
            readingFluencyLevel: row.readingFluencyLevel,
            mengajiMaterial: row.mengajiMaterial,
            mengajiCategory: row.mengajiCategory
          },
          existing ? {
            mathLevel: existing.mathLevel || '',
            readingFluencyLevel: existing.readingFluencyLevel || '',
            mengajiMaterial: existing.mengajiMaterial || '',
            mengajiCategory: existing.mengajiCategory || ''
          } : undefined,
          profile
        );

        const payload: any = {
          studentId: row.studentId,
          studentNameSnapshot: student?.name || student?.fullName || row.rawName,
          nisSnapshot: student?.nisSnapshot || student?.nis || null,
          classId: selectedClassId,
          classNameSnapshot: currentClassObj?.name || 'Class',
          academicYear: selectedYear,
          mathLevel: row.mathLevel,
          readingFluencyLevel: row.readingFluencyLevel,
          mengajiMaterial: row.mengajiMaterial,
          mengajiCategory: row.mengajiCategory,
          bahasaIndonesiaLevel: row.bahasaIndonesiaLevel,
          bahasaIndonesiaLabel: row.bahasaIndonesiaLabel,
          status: targetStatus,
          componentAudit: updatedAudit,
          updatedAt: serverTimestamp(),
          updatedBy: profile?.email || 'admin'
        };

        // Preserve stable properties
        if (existing) {
          payload.createdAt = existing.createdAt;
          payload.createdBy = existing.createdBy;
          if (existing.publishedData) {
            payload.publishedData = existing.publishedData;
          }
        } else {
          payload.createdAt = serverTimestamp();
          payload.createdBy = profile?.email || 'admin';
        }

        if (targetStatus === 'PUBLISHED') {
          payload.publishedAt = serverTimestamp();
          payload.publishedBy = profile?.email || 'admin';
          payload.publishedData = {
            mathLevel: row.mathLevel,
            readingFluencyLevel: row.readingFluencyLevel,
            mengajiMaterial: row.mengajiMaterial,
            mengajiCategory: row.mengajiCategory,
            bahasaIndonesiaLevel: row.bahasaIndonesiaLevel,
            bahasaIndonesiaLabel: row.bahasaIndonesiaLabel,
            publishedAt: new Date(),
            publishedBy: profile?.email || 'admin'
          };
        }

        batch.set(ref, payload, { merge: true });
        processedCount++;
      });

      await batch.commit();
      toast.success(`Berhasil menyimpan ${processedCount} data AAP sebagai ${targetStatus === 'PUBLISHED' ? 'PUBLIKASI' : 'DRAFT'}.`);
      
      // Cleanup import state and return
      setRawText('');
      setPreviewRows([]);
      setViewMode('LIST');
      fetchRosterAndResults();

    } catch (err) {
      console.error("Error committing bulk AAP results:", err);
      toast.error("Gagal menyimpan hasil Asesmen.");
    } finally {
      setSaveLoading(false);
    }
  };

  // Unpublish / Delete student AAP result
  const handleDeleteResult = async (studentId: string) => {
    const confirmDelete = window.confirm("Apakah Anda yakin ingin menghapus/membatalkan publikasi data Asesmen untuk siswa ini?");
    if (!confirmDelete) return;

    try {
      const docId = makeAAPResultId(studentId, selectedYear);
      await deleteDoc(doc(db, 'junior_high_aap_results', docId));
      toast.success("Hasil Asesmen berhasil dihapus. Data akan hilang dari portal siswa seketika.");
      fetchRosterAndResults();
    } catch (err) {
      console.error("Gagal menghapus hasil AAP:", err);
      toast.error("Gagal menghapus data.");
    }
  };

  // Individual modal open & fields assignment
  const openEditModal = (student: Student, result: JuniorHighAAPResult | undefined) => {
    if (!isClassAccessGranted) {
      toast.error("Akses Ditolak: Anda tidak memiliki akses ke kelas ini.");
      return;
    }
    setEditingStudent(student);
    setEditingResult(result || null);
    setOpenedUpdatedAt(result?.updatedAt || null);
    setFormValues({
      mathLevel: result?.mathLevel || '',
      readingFluencyLevel: result?.readingFluencyLevel || '',
      mengajiMaterial: result?.mengajiMaterial || '',
      mengajiCategory: result?.mengajiCategory || '',
      bahasaIndonesiaLevel: result?.bahasaIndonesiaLevel || null,
      bahasaIndonesiaLabel: result?.bahasaIndonesiaLabel || ''
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingStudent(null);
    setEditingResult(null);
    setOpenedUpdatedAt(null);
  };

  // Individual Save implementation with conflict checking
  const handleSaveIndividual = async () => {
    if (!editingStudent) return;

    // Validation rules
    const hasMaterial = !!formValues.mengajiMaterial;
    const hasCategory = !!formValues.mengajiCategory;
    if (hasMaterial && !hasCategory) {
      toast.error("Mengaji: Jika materi diisi, capaian/kategori wajib ditentukan.");
      return;
    }
    if (!hasMaterial && hasCategory) {
      toast.error("Mengaji: Jika capaian/kategori ditentukan, materi wajib diisi.");
      return;
    }

    setSaveLoading(true);
    try {
      const docId = makeAAPResultId(editingStudent.id, selectedYear);
      const ref = doc(db, 'junior_high_aap_results', docId);

      // Fetch current database state for conflict check
      const snap = await getDoc(ref);
      let latestDoc: any = null;
      if (snap.exists()) {
        latestDoc = snap.data();
        if (openedUpdatedAt && latestDoc.updatedAt) {
          const openedTime = typeof openedUpdatedAt.toDate === 'function' ? openedUpdatedAt.toDate().getTime() : new Date(openedUpdatedAt).getTime();
          const latestTime = typeof latestDoc.updatedAt.toDate === 'function' ? latestDoc.updatedAt.toDate().getTime() : new Date(latestDoc.updatedAt).getTime();
          
          if (latestTime > openedTime + 1000) { // 1s tolerance
            toast.error("Konflik terdeteksi: Data ini telah diperbarui oleh guru lain. Memuat data terbaru...");
            setEditingResult(latestDoc);
            setFormValues({
              mathLevel: latestDoc.mathLevel || '',
              readingFluencyLevel: latestDoc.readingFluencyLevel || '',
              mengajiMaterial: latestDoc.mengajiMaterial || '',
              mengajiCategory: latestDoc.mengajiCategory || '',
              bahasaIndonesiaLevel: latestDoc.bahasaIndonesiaLevel || null,
              bahasaIndonesiaLabel: latestDoc.bahasaIndonesiaLabel || ''
            });
            setOpenedUpdatedAt(latestDoc.updatedAt);
            setSaveLoading(false);
            return;
          }
        }
      }

      // Build component audit
      const updatedAudit = buildNewComponentAudit(
        latestDoc?.componentAudit,
        formValues,
        latestDoc ? {
          mathLevel: latestDoc.mathLevel || '',
          readingFluencyLevel: latestDoc.readingFluencyLevel || '',
          mengajiMaterial: latestDoc.mengajiMaterial || '',
          mengajiCategory: latestDoc.mengajiCategory || ''
        } : undefined,
        profile
      );

      // Determine correct status
      const { status: calculatedStatus } = getStudentAAPStatusAndTerisi({
        mathLevel: formValues.mathLevel,
        readingFluencyLevel: formValues.readingFluencyLevel,
        mengajiMaterial: formValues.mengajiMaterial,
        mengajiCategory: formValues.mengajiCategory,
        status: latestDoc?.status
      } as any);

      let targetStatus: 'DRAFT' | 'PUBLISHED' | 'PERLU_PUBLISH_ULANG' = 'DRAFT';
      if (latestDoc?.status === 'PUBLISHED' || latestDoc?.status === 'PERLU_PUBLISH_ULANG') {
        targetStatus = 'PERLU_PUBLISH_ULANG';
      }

      const payload: any = {
        studentId: editingStudent.id,
        studentNameSnapshot: editingStudent.name || editingStudent.fullName,
        nisSnapshot: editingStudent.nisSnapshot || editingStudent.nis || null,
        classId: selectedClassId,
        classNameSnapshot: currentClassObj?.name || 'Class',
        academicYear: selectedYear,
        mathLevel: formValues.mathLevel,
        readingFluencyLevel: formValues.readingFluencyLevel,
        mengajiMaterial: formValues.mengajiMaterial,
        mengajiCategory: formValues.mengajiCategory,
        bahasaIndonesiaLevel: formValues.bahasaIndonesiaLevel,
        bahasaIndonesiaLabel: formValues.bahasaIndonesiaLabel,
        status: targetStatus,
        componentAudit: updatedAudit,
        updatedAt: serverTimestamp(),
        updatedBy: profile?.email || 'admin'
      };

      // Retain previously publishedData snapshot
      if (latestDoc && latestDoc.publishedData) {
        payload.publishedData = latestDoc.publishedData;
      }

      if (latestDoc) {
        payload.createdAt = latestDoc.createdAt;
        payload.createdBy = latestDoc.createdBy;
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = profile?.email || 'admin';
      }

      await writeBatch(db).set(ref, payload, { merge: true }).commit();

      // Clear, concise save status feedback
      if (targetStatus === 'PERLU_PUBLISH_ULANG') {
        toast.success("Perubahan tersimpan. Perlu publish ulang agar terlihat oleh siswa.");
      } else if (calculatedStatus === 'LENGKAP') {
        toast.success("AAP lengkap dan siap diterbitkan");
      } else if (calculatedStatus === 'PARSIAL') {
        toast.success("AAP tersimpan sebagai data parsial");
      } else {
        toast.success("Perubahan AAP berhasil disimpan");
      }

      closeEditModal();
      fetchRosterAndResults();
    } catch (err) {
      console.error("Error saving AAP:", err);
      toast.error("Gagal menyimpan perubahan AAP.");
    } finally {
      setSaveLoading(false);
    }
  };

  // Single student manual Publish / Republish
  const handlePublishIndividual = async (studentId: string) => {
    if (!isClassAccessGranted) {
      toast.error("Akses Ditolak: Anda tidak memiliki akses ke kelas ini.");
      return;
    }
    const student = roster.find(s => s.id === studentId);
    if (!student) return;

    const result = existingResults.find(r => r.studentId === studentId);
    if (!result) {
      toast.error("Data AAP tidak ditemukan. Harap isi data terlebih dahulu.");
      return;
    }

    const { status: calcStatus } = getStudentAAPStatusAndTerisi(result);
    if (calcStatus === 'KOSONG' || calcStatus === 'PARSIAL') {
      toast.error("Data AAP parsial tidak dapat dipublikasikan. Harap lengkapi semua komponen terlebih dahulu.");
      return;
    }

    const confirmPublish = window.confirm(`Apakah Anda yakin ingin menerbitkan hasil Asesmen untuk siswa ${student.name || student.fullName}?`);
    if (!confirmPublish) return;

    setSaveLoading(true);
    try {
      const docId = makeAAPResultId(studentId, selectedYear);
      const ref = doc(db, 'junior_high_aap_results', docId);

      const payload: any = {
        status: 'PUBLISHED',
        publishedAt: serverTimestamp(),
        publishedBy: profile?.email || 'admin',
        publishedData: {
          mathLevel: result.mathLevel || '',
          readingFluencyLevel: result.readingFluencyLevel || '',
          mengajiMaterial: result.mengajiMaterial || '',
          mengajiCategory: result.mengajiCategory || '',
          bahasaIndonesiaLevel: result.bahasaIndonesiaLevel || null,
          bahasaIndonesiaLabel: result.bahasaIndonesiaLabel || '',
          publishedAt: new Date(),
          publishedBy: profile?.email || 'admin'
        }
      };

      await writeBatch(db).set(ref, payload, { merge: true }).commit();
      toast.success("Data AAP berhasil dipublikasikan ke siswa.");
      fetchRosterAndResults();
    } catch (err) {
      console.error("Gagal mempublikasikan AAP:", err);
      toast.error("Gagal mempublikasikan data.");
    } finally {
      setSaveLoading(false);
    }
  };

  // Filtering student roster list by search query
  const filteredRoster = React.useMemo(() => {
    if (!searchQuery.trim()) return roster;
    const qLower = searchQuery.toLowerCase().trim();
    return roster.filter(student => {
      const result = existingResults.find(r => r.studentId === student.id);
      
      const nameMatch = (student.name || '').toLowerCase().includes(qLower) || 
                        (student.fullName || '').toLowerCase().includes(qLower);
      const emailMatch = (student.email || '').toLowerCase().includes(qLower);
      
      let assessmentMatch = false;
      if (result) {
        assessmentMatch = (result.mathLevel || '').toLowerCase().includes(qLower) ||
                          (result.readingFluencyLevel || '').toLowerCase().includes(qLower) ||
                          (result.mengajiMaterial || '').toLowerCase().includes(qLower) ||
                          (result.mengajiCategory || '').toLowerCase().includes(qLower) ||
                          (result.bahasaIndonesiaLabel || '').toLowerCase().includes(qLower) ||
                          (result.status || '').toLowerCase().includes(qLower);
      }
      
      return nameMatch || emailMatch || assessmentMatch;
    });
  }, [roster, existingResults, searchQuery]);

  if (!profile) return null;

  if (!isAuthorized) {
    return (
      <div className="p-10 max-w-lg mx-auto mt-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
        <XCircle size={48} className="mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-black uppercase italic tracking-tight text-gray-900 mb-2">Akses Terbatas</h2>
        <p className="text-sm text-gray-500 mb-6">Hanya Staf Pengajar atau Admin Junior High yang memiliki akses ke modul ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <div className="flex items-center gap-2 text-blue-600">
             <FileSpreadsheet size={20} />
             <span className="text-xs font-black uppercase tracking-widest">Kurikulum Junior High</span>
           </div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase mt-1">Asesmen Awal Pembelajaran</h1>
           <p className="text-sm text-gray-500 font-medium mt-1">Kelola, unggah massal, pratinjau, dan rilis hasil AAP (Asesmen Awal Pembelajaran) siswa.</p>
        </div>
        
        {/* Actions Button */}
        <div className="flex items-center gap-3">
          {viewMode === 'LIST' ? (
            <button 
              onClick={() => {
                if (!isClassAccessGranted) {
                  toast.error("Akses Ditolak: Anda tidak memiliki akses ke kelas ini.");
                  return;
                }
                setRawText('');
                setPreviewRows([]);
                setViewMode('IMPORT');
              }}
              disabled={!selectedClassId || !isClassAccessGranted}
              className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95"
            >
              <ClipboardList size={14} /> Impor Massal AAP
            </button>
          ) : (
            <button 
              onClick={() => setViewMode('LIST')}
              className="flex items-center gap-2 px-6 py-3.5 bg-white border border-gray-100 hover:border-gray-200 text-gray-600 rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-sm transition-all active:scale-95"
            >
              Kembali ke Daftar
            </button>
          )}
        </div>
      </div>

      {/* Primary Filters Panel */}
      <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Filter size={14} /> Pilih Konteks Kelas
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Academic Year */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block pl-2">Tahun Ajaran</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold text-xs uppercase tracking-wider focus:ring-2 focus:ring-blue-600"
              disabled={metaLoading || viewMode === 'IMPORT'}
            >
              <option value="2024/2025">2024/2025</option>
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          {/* Class select */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block pl-2">Kelas Aktif</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold text-xs uppercase tracking-wider focus:ring-2 focus:ring-blue-600"
              disabled={metaLoading || viewMode === 'IMPORT'}
            >
              {metaLoading ? (
                <option value="">Memuat kelas...</option>
              ) : classes.length === 0 ? (
                <option value="">Tidak ada kelas JH aktif</option>
              ) : (
                classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              )}
            </select>
          </div>

          {/* Search Query Filter */}
          {viewMode === 'LIST' && selectedClassId && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block pl-2">Cari Nama / Hasil</label>
              <div className="relative">
                <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari siswa atau capaian..."
                  className="w-full h-14 pl-12 pr-6 bg-gray-50 border-none rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Mode Rendering */}
      {viewMode === 'LIST' ? (
        // List Mode
        <div className="space-y-6">
          {!selectedClassId ? (
            <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Silakan tentukan tahun ajaran dan kelas aktif.</p>
            </div>
          ) : !isClassAccessGranted ? (
            <div className="p-20 bg-red-50/20 rounded-[3rem] border-2 border-dashed border-red-200 text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-sm font-black text-red-700 uppercase tracking-widest">Akses Kelas Terbatas</h3>
              <p className="text-xs text-gray-500 mt-2">Anda tidak memiliki wewenang untuk melihat atau mengelola data kelas ini di tahun ajaran terpilih.</p>
            </div>
          ) : dataLoading ? (
            <div className="py-24 text-center">
              <Loader2 className="animate-spin w-12 h-12 text-blue-600 mx-auto mb-4" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat database AAP...</p>
            </div>
          ) : roster.length === 0 ? (
            <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada siswa terdaftar di roster kelas terpilih.</p>
            </div>
          ) : (
            <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                  Roster Kelas: {filteredRoster.length} Siswa | Status Hasil AAP
                </span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full uppercase tracking-wider">
                  {existingResults.filter(r => r.status === 'PUBLISHED').length} Rilis / {existingResults.filter(r => r.status === 'DRAFT').length} Draft
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                      <th className="px-6 py-4 text-center w-16">No</th>
                      <th className="px-6 py-4">Nama Siswa</th>
                      <th className="px-6 py-4">Matematika</th>
                      <th className="px-6 py-4">Reading Fluency</th>
                      <th className="px-6 py-4">Mengaji</th>
                      <th className="px-6 py-4">Bahasa Indonesia</th>
                      <th className="px-6 py-4 text-center">Status & Completion</th>
                      <th className="px-6 py-4 text-right w-44">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredRoster.map((student, idx) => {
                      const result = existingResults.find(r => r.studentId === student.id);
                      const { status, terisiText } = getStudentAAPStatusAndTerisi(result);

                      // Compact actions text mapping
                      let primaryActionText = 'Isi AAP';
                      if (status === 'PARSIAL') primaryActionText = 'Lanjutkan AAP';
                      else if (status === 'LENGKAP' || status === 'PUBLISHED' || status === 'PERLU_PUBLISH_ULANG') {
                        primaryActionText = 'Edit AAP';
                      }

                      return (
                        <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-center text-xs font-black text-gray-400">
                            {student.nomorAbsen || idx + 1}
                          </td>
                          <td className="px-6 py-4 font-black uppercase italic text-xs text-gray-900">
                            {student.name || student.fullName}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-600">
                            {result?.mathLevel || <span className="text-gray-300 italic">—</span>}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-600">
                            {result?.readingFluencyLevel || <span className="text-gray-300 italic">—</span>}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-600">
                            {result?.mengajiMaterial && result?.mengajiCategory ? (
                              <div className="space-y-0.5">
                                <p className="font-bold text-gray-800">{result.mengajiMaterial}</p>
                                <p className="text-[10px] uppercase text-emerald-600 tracking-wider font-black">{result.mengajiCategory}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 italic">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-600">
                            {result?.bahasaIndonesiaLabel ? (
                              <div className="space-y-0.5">
                                <p className="font-bold text-gray-800">{result.bahasaIndonesiaLabel}</p>
                                <p className="text-[10px] text-blue-600 tracking-wider font-black">Level {result.bahasaIndonesiaLevel}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 italic">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={cn(
                                "inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                                status === 'PUBLISHED' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                status === 'PERLU_PUBLISH_ULANG' ? "bg-orange-50 text-orange-700 border border-orange-200" :
                                status === 'LENGKAP' ? "bg-purple-50 text-purple-700 border border-purple-200" :
                                status === 'PARSIAL' ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                "bg-gray-100 text-gray-500 border border-gray-200"
                              )}>
                                {status.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight">
                                {terisiText}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Primary Action Button */}
                              <button
                                onClick={() => openEditModal(student, result)}
                                className={cn(
                                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                  status === 'KOSONG' ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm" :
                                  status === 'PARSIAL' ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700" :
                                  "bg-gray-100 hover:bg-gray-200 text-gray-700"
                                )}
                              >
                                {primaryActionText}
                              </button>

                              {/* Manual Publish / Republish Trigger */}
                              {(status === 'LENGKAP' || status === 'PERLU_PUBLISH_ULANG') && (
                                <button
                                  onClick={() => handlePublishIndividual(student.id)}
                                  className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-all"
                                  title="Publikasikan ke Siswa"
                                >
                                  <Send size={13} />
                                </button>
                              )}

                              {/* Unpublish Action */}
                              {result && (
                                <button
                                  onClick={() => handleDeleteResult(student.id)}
                                  className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all"
                                  title="Hapus data / Batal Rilis"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Bulk Import Flow
        <div className="space-y-8">
          
          {/* Instructions and Textarea */}
          <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <Eye size={18} className="text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-widest text-indigo-950">Bulk Import Format</h2>
            </div>
            
            <p className="text-xs text-gray-500 leading-relaxed font-medium">
              Salin data dari Google Sheets (dengan susunan kolom: <strong className="text-gray-800">NO, NAMA, MATH, READING FLUENCY, MENGAJI, BAHASA INDONESIA</strong>) lalu tempel pada kolom di bawah. Program akan otomatis mencocokkan baris data dengan roster kelas terpilih.
            </p>

            <div className="space-y-2">
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={`1\tAgnia Audy Solihin\tBeginning Understanding\tER\tALQURAN - JAYYID (BAIK)\tSiap Berkembang\n2\tAisyah Larasati\tSupported Understanding\tER\tIQRO 3 - ISYROF (DALAM BIMBINGAN)\tPerlu Penguatan Terarah`}
                className="w-full h-64 p-6 bg-gray-50 rounded-2xl border-none font-mono text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setViewMode('LIST')}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all"
              >
                Batal
              </button>
              <button
                onClick={handlePreview}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 transition-all active:scale-95"
              >
                Pratinjau & Cocokkan Roster
              </button>
            </div>
          </div>

          {/* Match & Review Section */}
          {previewRows.length > 0 && (
            <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-indigo-950 flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-indigo-600" /> Hasil Pratinjau & Pemetaan Roster
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">Ulas tingkat kecocokan nama, validasi skala nilai, dan sesuaikan data yang tidak cocok.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSaveBulk('DRAFT')}
                    disabled={saveLoading}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-amber-100 transition-all active:scale-95 disabled:opacity-55"
                  >
                    {saveLoading ? <Loader2 className="animate-spin" size={14} /> : null}
                    Simpan Draft
                  </button>
                  <button
                    onClick={() => handleSaveBulk('PUBLISHED')}
                    disabled={saveLoading}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-55"
                  >
                    {saveLoading ? <Loader2 className="animate-spin" size={14} /> : null}
                    Publikasikan ke Siswa
                  </button>
                </div>
              </div>

              {/* Table of mapped preview rows */}
              <div className="overflow-x-auto rounded-3xl border border-gray-100">
                <table className="w-full text-left border-collapse min-w-[1100px]">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-3 text-center w-12">No</th>
                      <th className="px-5 py-3">Nama Input</th>
                      <th className="px-5 py-3">Roster Rujukan</th>
                      <th className="px-5 py-3">Matematika</th>
                      <th className="px-5 py-3">Reading Fluency</th>
                      <th className="px-5 py-3">Mengaji</th>
                      <th className="px-5 py-3">Bahasa Indonesia</th>
                      <th className="px-5 py-3 text-center">Status Match</th>
                      <th className="px-5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previewRows.map((row) => {
                      const hasError = !!row.validationError;

                      return (
                        <tr key={row.index} className={cn("hover:bg-gray-50/50 transition-colors", hasError && "bg-red-50/10")}>
                          <td className="px-5 py-4 text-center text-xs font-black text-gray-400">
                            {row.rawNo}
                          </td>
                          <td className="px-5 py-4 text-xs font-black text-gray-900 uppercase italic">
                            {row.rawName}
                          </td>
                          <td className="px-5 py-4">
                            {/* Manual or auto mapping selector */}
                            <select
                              value={row.studentId || ''}
                              onChange={e => handleMapStudentManually(row.index, e.target.value)}
                              className="h-10 px-4 bg-gray-50 rounded-xl border-none text-[11px] font-bold uppercase tracking-wider w-56 focus:ring-2 focus:ring-indigo-600"
                            >
                              <option value="">— Pilih Siswa Roster —</option>
                              {roster.map(st => (
                                <option key={st.id} value={st.id}>
                                  {st.nomorAbsen ? `[No ${st.nomorAbsen}] ` : ''}{st.name || st.fullName}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-5 py-4">
                            <select
                              value={row.mathLevel}
                              onChange={e => handleUpdatePreviewValue(row.index, 'mathLevel', e.target.value)}
                              className="h-10 px-4 bg-gray-50 rounded-xl border-none text-[11px] font-bold focus:ring-2 focus:ring-indigo-600"
                            >
                              <option value="">— Kosong —</option>
                              <option value="Beginning Understanding">Beginning Understanding</option>
                              <option value="Supported Understanding">Supported Understanding</option>
                              <option value="Independent Understanding">Independent Understanding</option>
                              <option value="Demonstrating Mastery">Demonstrating Mastery</option>
                            </select>
                          </td>
                          <td className="px-5 py-4">
                            <select
                              value={row.readingFluencyLevel}
                              onChange={e => handleUpdatePreviewValue(row.index, 'readingFluencyLevel', e.target.value)}
                              className="h-10 px-4 bg-gray-50 rounded-xl border-none text-[11px] font-bold focus:ring-2 focus:ring-indigo-600"
                            >
                              <option value="">— Kosong —</option>
                              <option value="IR+">IR+</option>
                              <option value="ER">ER</option>
                              <option value="ER EN">ER EN</option>
                            </select>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col gap-1.5">
                              {/* Material */}
                              <select
                                value={row.mengajiMaterial}
                                onChange={e => handleUpdatePreviewValue(row.index, 'mengajiMaterial', e.target.value)}
                                className="h-9 px-3 bg-gray-50 rounded-lg border-none text-[10px] font-bold focus:ring-2 focus:ring-indigo-600"
                              >
                                <option value="">— Materi —</option>
                                <option value="IQRO 1">IQRO 1</option>
                                <option value="IQRO 2">IQRO 2</option>
                                <option value="IQRO 3">IQRO 3</option>
                                <option value="IQRO 4">IQRO 4</option>
                                <option value="IQRO 5">IQRO 5</option>
                                <option value="IQRO 6">IQRO 6</option>
                                <option value="JUZ AMMA">JUZ AMMA</option>
                                <option value="ALQURAN">ALQURAN</option>
                              </select>
                              {/* Category */}
                              <select
                                value={row.mengajiCategory}
                                onChange={e => handleUpdatePreviewValue(row.index, 'mengajiCategory', e.target.value)}
                                className="h-9 px-3 bg-gray-50 rounded-lg border-none text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 focus:ring-2 focus:ring-indigo-600"
                              >
                                <option value="">— Capaian —</option>
                                <option value="ISYROF">ISYROF</option>
                                <option value="MUBTADI">MUBTADI</option>
                                <option value="MAQBUL">MAQBUL</option>
                                <option value="JAYYID">JAYYID</option>
                              </select>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <select
                              value={row.bahasaIndonesiaLabel}
                              onChange={e => handleUpdatePreviewValue(row.index, 'bahasaIndonesiaLabel', e.target.value)}
                              className="h-10 px-4 bg-gray-50 rounded-xl border-none text-[11px] font-bold focus:ring-2 focus:ring-indigo-600"
                            >
                              <option value="">— Kosong —</option>
                              <option value="Perlu Pendampingan Intensif">Perlu Pendampingan Intensif (Lvl 1)</option>
                              <option value="Perlu Penguatan Terarah">Perlu Penguatan Terarah (Lvl 2)</option>
                              <option value="Siap Berkembang">Siap Berkembang (Lvl 3)</option>
                              <option value="Siap Lanjut">Siap Lanjut (Lvl 4)</option>
                            </select>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={cn(
                              "inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                              row.matchStatus === 'Cocok' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                              row.matchStatus === 'Duplikat' ? "bg-red-50 text-red-700 border border-red-100" :
                              row.matchStatus === 'Perlu diperiksa' ? "bg-amber-50 text-amber-700 border border-amber-100" :
                              "bg-gray-100 text-gray-500"
                            )}>
                              {row.matchStatus}
                            </span>
                            {hasError && (
                              <p className="text-[9px] text-red-500 font-bold mt-1 max-w-[120px] leading-tight mx-auto">
                                {row.validationError}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => handleRemovePreviewRow(row.index)}
                              className="p-2 hover:bg-gray-100 text-gray-400 hover:text-red-600 rounded-xl transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
        </div>
      )}

      {/* Center Modal Edit Dialog */}
      <AnimatePresence>
        {isEditModalOpen && editingStudent && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Edit Asesmen Awal</span>
                  <h3 className="text-xl font-black text-gray-900 uppercase italic leading-none mt-1">
                    {editingStudent.name || editingStudent.fullName}
                  </h3>
                </div>
                <button 
                  onClick={closeEditModal}
                  className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-8 space-y-6 overflow-y-auto flex-1">
                {/* Numerasi Component Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-50 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-indigo-900 flex items-center gap-2">
                      <Calculator size={16} className="text-indigo-600" /> Numerasi (Matematika)
                    </h4>
                    {renderComponentAudit(editingResult?.componentAudit?.numeracy, !!formValues.mathLevel)}
                  </div>
                  <select
                    value={formValues.mathLevel}
                    onChange={e => setFormValues(prev => ({ ...prev, mathLevel: e.target.value as any }))}
                    className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none text-xs font-bold focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value="">— Kosong / Belum Diisi —</option>
                    <option value="Beginning Understanding">Beginning Understanding</option>
                    <option value="Supported Understanding">Supported Understanding</option>
                    <option value="Independent Understanding">Independent Understanding</option>
                    <option value="Demonstrating Mastery">Demonstrating Mastery</option>
                  </select>
                </div>

                {/* Reading Fluency Component Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-50 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-amber-900 flex items-center gap-2">
                      <BookOpen size={16} className="text-amber-600" /> Reading Fluency (Bahasa Inggris)
                    </h4>
                    {renderComponentAudit(editingResult?.componentAudit?.readingFluency, !!formValues.readingFluencyLevel)}
                  </div>
                  <select
                    value={formValues.readingFluencyLevel}
                    onChange={e => setFormValues(prev => ({ ...prev, readingFluencyLevel: e.target.value as any }))}
                    className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none text-xs font-bold focus:ring-2 focus:ring-amber-600"
                  >
                    <option value="">— Kosong / Belum Diisi —</option>
                    <option value="IR+">IR+</option>
                    <option value="ER">ER</option>
                    <option value="ER EN">ER EN</option>
                  </select>
                </div>

                {/* Mengaji Component Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-50 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-900 flex items-center gap-2">
                      <Sparkles size={16} className="text-emerald-600" /> Mengaji (Quran)
                    </h4>
                    {renderComponentAudit(editingResult?.componentAudit?.mengaji, !!formValues.mengajiMaterial && !!formValues.mengajiCategory)}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Materi</label>
                      <select
                        value={formValues.mengajiMaterial}
                        onChange={e => setFormValues(prev => ({ ...prev, mengajiMaterial: e.target.value as any }))}
                        className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none text-xs font-bold focus:ring-2 focus:ring-emerald-600"
                      >
                        <option value="">— Kosong / Belum Diisi —</option>
                        <option value="IQRO 1">IQRO 1</option>
                        <option value="IQRO 2">IQRO 2</option>
                        <option value="IQRO 3">IQRO 3</option>
                        <option value="IQRO 4">IQRO 4</option>
                        <option value="IQRO 5">IQRO 5</option>
                        <option value="IQRO 6">IQRO 6</option>
                        <option value="JUZ AMMA">JUZ AMMA</option>
                        <option value="ALQURAN">ALQURAN</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Capaian</label>
                      <select
                        value={formValues.mengajiCategory}
                        onChange={e => setFormValues(prev => ({ ...prev, mengajiCategory: e.target.value as any }))}
                        className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none text-xs font-bold focus:ring-2 focus:ring-emerald-600 text-emerald-700 bg-emerald-50"
                      >
                        <option value="">— Kosong / Belum Diisi —</option>
                        <option value="ISYROF">ISYROF</option>
                        <option value="MUBTADI">MUBTADI</option>
                        <option value="MAQBUL">MAQBUL</option>
                        <option value="JAYYID">JAYYID</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Bahasa Indonesia Component Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-blue-900 flex items-center gap-2">
                    <ClipboardList size={16} className="text-blue-600" /> Bahasa Indonesia (Opsional)
                  </h4>
                  <select
                    value={formValues.bahasaIndonesiaLabel}
                    onChange={e => {
                      const label = e.target.value;
                      const parsed = parseBahasaIndonesia(label);
                      setFormValues(prev => ({
                        ...prev,
                        bahasaIndonesiaLabel: label as any,
                        bahasaIndonesiaLevel: parsed?.level || null
                      }));
                    }}
                    className="w-full h-12 px-4 bg-gray-50 rounded-xl border-none text-xs font-bold focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">— Kosong / Belum Diisi —</option>
                    <option value="Perlu Pendampingan Intensif">Perlu Pendampingan Intensif (Lvl 1)</option>
                    <option value="Perlu Penguatan Terarah">Perlu Penguatan Terarah (Lvl 2)</option>
                    <option value="Siap Berkembang">Siap Berkembang (Lvl 3)</option>
                    <option value="Siap Lanjut">Siap Lanjut (Lvl 4)</option>
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-gray-400 font-bold">
                  Completion: {getStudentAAPStatusAndTerisi({
                    mathLevel: formValues.mathLevel,
                    readingFluencyLevel: formValues.readingFluencyLevel,
                    mengajiMaterial: formValues.mengajiMaterial,
                    mengajiCategory: formValues.mengajiCategory,
                    status: editingResult?.status
                  } as any).terisiText}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={closeEditModal}
                    className="px-5 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveIndividual}
                    disabled={saveLoading}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-55"
                  >
                    {saveLoading ? <Loader2 className="animate-spin" size={12} /> : null}
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
