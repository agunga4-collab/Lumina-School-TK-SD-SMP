import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Compass, Users, CheckCircle, XCircle, Plus, Search, Filter, 
  Trash2, AlertCircle, X, ChevronDown, Calendar, Briefcase, 
  GraduationCap, Clock, HelpCircle, AlertTriangle, Download, Upload, RefreshCw, Eye
} from 'lucide-react';
import { db, getClasses, getActiveStudents, getStudents } from '../../lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Student, Class, UnitActivityEnrollment, JuniorHighUnitActivityImportBatch } from '../../types';
import * as XLSX from 'xlsx';

const CATEGORIES = [
  'Performing Arts',
  'Arts & Makerspace',
  'Physical Education',
  'Digital Literacy'
];

const UA_BY_CATEGORY: Record<string, string[]> = {
  'Performing Arts': ['Orchestra', 'LGP', 'Traditional Music', 'Drumline'],
  'Arts & Makerspace': ['Papercraft', 'Makerspace', 'Seni Kreasi Bebas', 'Membatik', 'Painting'],
  'Physical Education': ['Bola Kecil', 'Bola Besar', 'Senam & Gerak Berirama', 'Atletik', 'Swimming & Physical Training'],
  'Digital Literacy': ['Animation', 'Videography', 'Graphic Design', '3D Structure Building', 'Coding']
};

export function normalizeEnrollmentForUI(e: UnitActivityEnrollment): UnitActivityEnrollment {
  const isLgp = e.isLgp || 
    ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName) || 
    ['Choir', 'Theatre', 'Musical Theatre Band'].includes(e.sourceUaName || '');

  const normalizedUaName = isLgp ? 'LGP' : e.normalizedUaName;

  let category = e.category || 'Performing Arts';
  if (isLgp || ['Performing Arts', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(category)) {
    category = 'Performing Arts';
  } else if (['Sports', 'Physical Education'].includes(category)) {
    category = 'Physical Education';
  } else if (['Art', 'Arts & Makerspace'].includes(category)) {
    category = 'Arts & Makerspace';
  } else if (category === 'Digital Literacy') {
    category = 'Digital Literacy';
  } else {
    if (!CATEGORIES.includes(category)) {
      category = 'Performing Arts';
    }
  }

  return {
    ...e,
    normalizedUaName,
    category
  };
}

export default function UnitActivitiesPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  const canManage = profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_JUNIOR';

  // Selected period
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>(String(activeSemester || '1'));

  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));
  }, [activeYear, activeSemester]);

  // Master lists
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(false);

  // Enrollments State
  const [enrollments, setEnrollments] = React.useState<UnitActivityEnrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = React.useState(false);

  // Tab State
  const [activeTab, setActiveTab] = React.useState<'active_semester' | 'student_history' | 'import_history'>('active_semester');

  // Master list of all students for matching
  const [allStudentsList, setAllStudentsList] = React.useState<Student[]>([]);
  const [loadingAllStudents, setLoadingAllStudents] = React.useState(false);

  // Import Tab State
  interface ParsedRow {
    rowNum: number;
    studentId: string;
    studentNameInFile: string;
    matchedStudentName: string;
    matchedStudent?: Student;
    classNameInFile: string;
    gradeInFile: string;
    academicYear: string;
    semester: string;
    categoryInFile: string;
    normalizedCategory: string;
    uaNameInFile: string;
    normalizedUaName: string;
    notes: string;
    status: 'VALID' | 'WARNING' | 'ERROR';
    errors: string[];
    warnings: string[];
    duplicateType?: 'EXISTING' | 'FILE' | 'NONE';
  }

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [importBatches, setImportBatches] = React.useState<JuniorHighUnitActivityImportBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = React.useState(false);
  const [previewFilter, setPreviewFilter] = React.useState<'ALL' | 'READY' | 'WARNING' | 'ERROR' | 'DUPLICATE'>('ALL');
  const [isProcessingImport, setIsProcessingImport] = React.useState(false);
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  
  const [showDetailBatch, setShowDetailBatch] = React.useState<JuniorHighUnitActivityImportBatch | null>(null);
  const [batchEnrollmentsForDetail, setBatchEnrollmentsForDetail] = React.useState<UnitActivityEnrollment[]>([]);
  const [loadingBatchDetail, setLoadingBatchDetail] = React.useState(false);
  
  const [showRollbackModal, setShowRollbackModal] = React.useState<JuniorHighUnitActivityImportBatch | null>(null);
  const [rollbackReason, setRollbackReason] = React.useState('');
  const [isRollingBack, setIsRollingBack] = React.useState(false);

  // History Tab States & Filters
  const [allActiveStudents, setAllActiveStudents] = React.useState<Student[]>([]);
  const [loadingActiveStudents, setLoadingActiveStudents] = React.useState(false);
  const [allHistoryEnrollments, setAllHistoryEnrollments] = React.useState<UnitActivityEnrollment[]>([]);
  const [loadingHistoryEnrollments, setLoadingHistoryEnrollments] = React.useState(false);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = React.useState<Student | null>(null);

  const [histFilterClassId, setHistFilterClassId] = React.useState<string>('ALL');
  const [histFilterGrade, setHistFilterGrade] = React.useState<string>('ALL');
  const [histFilterCategory, setHistFilterCategory] = React.useState<string>('ALL');
  const [histSearchKeyword, setHistSearchKeyword] = React.useState<string>('');

  // Filters
  const [filterClassId, setFilterClassId] = React.useState<string>('ALL');
  const [filterGrade, setFilterGrade] = React.useState<string>('ALL');
  const [filterCategory, setFilterCategory] = React.useState<string>('ALL');
  const [filterUaName, setFilterUaName] = React.useState<string>('ALL');
  const [filterStatus, setFilterStatus] = React.useState<string>('CONFIRMED');
  const [searchKeyword, setSearchKeyword] = React.useState<string>('');

  // UI state
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [cancellingEnrollment, setCancellingEnrollment] = React.useState<UnitActivityEnrollment | null>(null);

  // Modal Form State
  const [formCategory, setFormCategory] = React.useState<string>('');
  const [formUa, setFormUa] = React.useState<string>('');
  const [formClassId, setFormClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load JH classes
  const fetchClasses = async () => {
    setLoadingClasses(true);
    try {
      const all = await getClasses();
      const jhClasses = (all || []).filter(c => 
        c.unitId === 'JUNIOR_HIGH' && 
        c.status !== 'archived'
      );
      setClassesList(jhClasses);
    } catch (err) {
      console.error('Error loading classes:', err);
      toast.error('Gagal memuat daftar kelas');
    } finally {
      setLoadingClasses(false);
    }
  };

  // Load all UA enrollments for the selected year & semester
  const fetchEnrollments = async () => {
    setLoadingEnrollments(true);
    try {
      const q = query(
        collection(db, 'junior_high_unit_activity_enrollments'),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnitActivityEnrollment));
      setEnrollments(list.map(normalizeEnrollmentForUI));
    } catch (err) {
      console.error('Error loading enrollments:', err);
      toast.error('Gagal memuat data peserta');
    } finally {
      setLoadingEnrollments(false);
    }
  };

  React.useEffect(() => {
    fetchClasses();
  }, []);

  const fetchAllActiveStudents = async () => {
    setLoadingActiveStudents(true);
    try {
      const list = await getActiveStudents('all', selectedYear);
      // Filter only for Junior High classes
      const jhStudents = (list || []).filter(s => 
        classesList.some(c => c.id === s.classId)
      );
      setAllActiveStudents(jhStudents);
    } catch (err) {
      console.error('Error fetching all active students:', err);
    } finally {
      setLoadingActiveStudents(false);
    }
  };

  const fetchAllHistoryEnrollments = async () => {
    setLoadingHistoryEnrollments(true);
    try {
      const q = query(collection(db, 'junior_high_unit_activity_enrollments'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnitActivityEnrollment));
      setAllHistoryEnrollments(list.map(normalizeEnrollmentForUI));
    } catch (err) {
      console.error('Error loading history enrollments:', err);
    } finally {
      setLoadingHistoryEnrollments(false);
    }
  };

  React.useEffect(() => {
    if (classesList.length > 0) {
      fetchAllActiveStudents();
    }
  }, [selectedYear, classesList]);

  React.useEffect(() => {
    fetchAllHistoryEnrollments();
  }, [selectedYear, selectedSemester]);

  React.useEffect(() => {
    fetchEnrollments();
  }, [selectedYear, selectedSemester]);

  const fetchImportBatches = async () => {
    setLoadingBatches(true);
    try {
      const q = query(collection(db, 'junior_high_unit_activity_import_batches'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JuniorHighUnitActivityImportBatch));
      // Sort newest to oldest
      list.sort((a, b) => b.importedAt - a.importedAt);
      setImportBatches(list);
    } catch (err) {
      console.error('Error fetching import batches:', err);
    } finally {
      setLoadingBatches(false);
    }
  };

  const fetchStudentsMasterList = async () => {
    setLoadingAllStudents(true);
    try {
      const list = await getStudents();
      setAllStudentsList(list || []);
    } catch (err) {
      console.error('Error loading master student list:', err);
    } finally {
      setLoadingAllStudents(false);
    }
  };

  React.useEffect(() => {
    if (canManage) {
      fetchImportBatches();
      fetchStudentsMasterList();
    }
  }, [canManage]);

  // --- PHASE 2: IMPORT & ROLLBACK HANDLERS ---
  
  const handleDownloadTemplate = () => {
    const headers = ['studentId', 'studentName', 'className', 'grade', 'academicYear', 'semester', 'category', 'uaName', 'notes'];
    const data = [
      {
        studentId: 'NIS001',
        studentName: 'Contoh Siswa A',
        className: '7A',
        grade: '7',
        academicYear: '2025/2026',
        semester: '1',
        category: 'Performing Arts',
        uaName: 'Choir',
        notes: 'Ini contoh data historis Choir yang otomatis ternormalisasi ke LGP'
      },
      {
        studentId: 'NIS002',
        studentName: 'Contoh Siswa B',
        className: '8B',
        grade: '8',
        academicYear: '2025/2026',
        semester: '2',
        category: 'Digital Literacy',
        uaName: 'Coding',
        notes: 'Ini contoh data coding'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template_Import');
    XLSX.writeFile(workbook, 'Template_Import_Riwayat_UA.xlsx');
    toast.success('Template impor berhasil diunduh.');
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParsedRows([]);
    setPreviewFilter('ALL');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
      toast.error('Format file salah. Hanya diperbolehkan berkas .xlsx, .xls, atau .csv');
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        let workbook;
        if (ext === 'csv') {
          workbook = XLSX.read(data, { type: 'string' });
        } else {
          workbook = XLSX.read(data, { type: 'binary' });
        }
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Use raw: false to ensure cells (like student IDs and semesters) are read as text strings
        const jsonRows = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, raw: false, defval: '' });
        
        if (jsonRows.length < 2) {
          toast.error('File kosong atau tidak memiliki baris data.');
          return;
        }

        const headers = jsonRows[0].map((h: any) => String(h || '').trim());
        const requiredHeaders = ['studentId', 'academicYear', 'semester', 'uaName'];
        const missing = requiredHeaders.filter(h => !headers.includes(h));
        
        if (missing.length > 0) {
          toast.error(`Header kolom tidak valid. Kurang kolom wajib: ${missing.join(', ')}`);
          return;
        }

        const headerIndexes: Record<string, number> = {};
        headers.forEach((h, idx) => {
          headerIndexes[h] = idx;
        });

        // Load all existing enrollments from Firestore to detect database duplicates
        const enrollmentsSnap = await getDocs(collection(db, 'junior_high_unit_activity_enrollments'));
        const existingEnrollments = enrollmentsSnap.docs.map(doc => doc.data() as UnitActivityEnrollment);

        const rows: ParsedRow[] = [];
        const fileKeysMap: Record<string, number[]> = {};

        for (let i = 1; i < jsonRows.length; i++) {
          const rawRow = jsonRows[i];
          if (!rawRow || rawRow.every((cell: any) => String(cell || '').trim() === '')) {
            continue;
          }

          const getValue = (colName: string) => {
            const idx = headerIndexes[colName];
            if (idx === undefined) return '';
            return String(rawRow[idx] || '').trim();
          };

          const studentId = getValue('studentId');
          const studentNameInFile = getValue('studentName');
          const classNameInFile = getValue('className');
          const gradeInFile = getValue('grade');
          const academicYear = getValue('academicYear');
          const semester = getValue('semester');
          const categoryInFile = getValue('category');
          const uaNameInFile = getValue('uaName');
          const notes = getValue('notes');

          const rowNum = i + 1;
          const errors: string[] = [];
          const warnings: string[] = [];
          let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
          let duplicateType: 'EXISTING' | 'FILE' | 'NONE' = 'NONE';

          // 1. Mandatory Fields check
          if (!studentId) errors.push('studentId wajib diisi');
          if (!academicYear) errors.push('academicYear wajib diisi');
          if (!semester) errors.push('semester wajib diisi');
          if (!uaNameInFile) errors.push('uaName wajib diisi');

          // 2. Validate academicYear format (YYYY/YYYY)
          if (academicYear) {
            const yearMatch = academicYear.match(/^(\d{4})\/(\d{4})$/);
            if (!yearMatch) {
              errors.push('academicYear harus berformat YYYY/YYYY (misal: 2024/2025)');
            } else {
              const y1 = parseInt(yearMatch[1]);
              const y2 = parseInt(yearMatch[2]);
              if (y2 - y1 !== 1) {
                errors.push('Tahun ajaran tidak valid (selisih harus tepat 1 tahun, misal: 2024/2025)');
              }
            }
          }

          // 3. Validate semester
          if (semester && semester !== '1' && semester !== '2') {
            errors.push('semester harus bernilai 1 atau 2');
          }

          // 4. Match student
          let matchedStudent: Student | undefined;
          let matchedStudentName = '';
          if (studentId) {
            matchedStudent = allStudentsList.find(s => s.id === studentId);
            if (!matchedStudent) {
              errors.push(`Siswa dengan NIS "${studentId}" tidak ditemukan`);
              status = 'ERROR';
            } else {
              matchedStudentName = matchedStudent.name;
              // warnings for mismatched names or classes
              if (studentNameInFile && studentNameInFile.toLowerCase() !== matchedStudent.name.toLowerCase()) {
                warnings.push(`Mismatch nama: File: "${studentNameInFile}", Sistem: "${matchedStudent.name}"`);
              }
              if (classNameInFile) {
                const actualClass = classesList.find(c => c.id === matchedStudent?.classId);
                if (actualClass && actualClass.name.toLowerCase() !== classNameInFile.toLowerCase()) {
                  warnings.push(`Mismatch kelas: File: "${classNameInFile}", Sistem: "${actualClass.name}"`);
                }
              }
            }
          }

          // 5. Normalization of UA and Category
          let normalizedUaName = '';
          let normalizedCategory = '';
          
          if (uaNameInFile) {
            const fileUaUpper = uaNameInFile.toUpperCase();
            if (['CHOIR', 'THEATRE', 'MUSICAL THEATRE BAND', 'LGP'].includes(fileUaUpper)) {
              normalizedUaName = 'LGP';
              normalizedCategory = 'Performing Arts';
            } else {
              let found = false;
              for (const [catName, uas] of Object.entries(UA_BY_CATEGORY)) {
                const matched = uas.find(ua => ua.toLowerCase() === uaNameInFile.toLowerCase());
                if (matched) {
                  normalizedUaName = matched;
                  normalizedCategory = catName;
                  found = true;
                  break;
                }
              }
              if (!found) {
                errors.push(`Unit Aktivitas "${uaNameInFile}" tidak dikenal di katalog resmi`);
              }
            }
          }

          // 6. Check duplicate inside the file
          if (studentId && academicYear && semester) {
            const key = `${studentId}_${academicYear}_${semester}`;
            if (!fileKeysMap[key]) {
              fileKeysMap[key] = [];
            }
            fileKeysMap[key].push(rowNum);
          }

          // 7. Check duplicates against Firestore CONFIRMED/CANCELLED/MOVED
          if (studentId && academicYear && semester && matchedStudent) {
            const isPeriodActiveSemester = academicYear === '2026/2027' && semester === '1';

            const existingConf = existingEnrollments.find(e => 
              e.studentId === studentId && 
              e.academicYear === academicYear && 
              String(e.semester) === String(semester) &&
              e.status === 'CONFIRMED'
            );

            if (existingConf) {
              if (isPeriodActiveSemester) {
                errors.push('Konflik: Sudah terdapat pendaftaran aktif (CONFIRMED) untuk Semester Aktif 1 2026/2027 di sistem');
                duplicateType = 'EXISTING';
              } else {
                errors.push(`Konflik: Sudah terdapat pendaftaran CONFIRMED untuk periode ${academicYear} S${semester} di sistem`);
                duplicateType = 'EXISTING';
              }
            } else {
              const existingOther = existingEnrollments.find(e => 
                e.studentId === studentId && 
                e.academicYear === academicYear && 
                String(e.semester) === String(semester) &&
                ['CANCELLED', 'MOVED'].includes(e.status)
              );
              if (existingOther) {
                errors.push(`Konflik: Sudah terdapat pendaftaran dengan status ${existingOther.status} pada periode ini di sistem`);
                duplicateType = 'EXISTING';
              }
            }
          }

          if (errors.length > 0) {
            status = 'ERROR';
          } else if (warnings.length > 0) {
            status = 'WARNING';
          }

          rows.push({
            rowNum,
            studentId,
            studentNameInFile,
            matchedStudentName,
            matchedStudent,
            classNameInFile,
            gradeInFile,
            academicYear,
            semester,
            categoryInFile,
            normalizedCategory,
            uaNameInFile,
            normalizedUaName,
            notes,
            status,
            errors,
            warnings,
            duplicateType
          });
        }

        // Apply File-level duplication marking
        Object.entries(fileKeysMap).forEach(([key, rowNums]) => {
          if (rowNums.length > 1) {
            rowNums.forEach(rNum => {
              const matchedRow = rows.find(r => r.rowNum === rNum);
              if (matchedRow) {
                matchedRow.status = 'ERROR';
                if (!matchedRow.errors.includes('Duplikat pendaftaran siswa pada periode yang sama di dalam file import')) {
                  matchedRow.errors.push('Duplikat pendaftaran siswa pada periode yang sama di dalam file import');
                }
                matchedRow.duplicateType = 'FILE';
              }
            });
          }
        });

        setParsedRows(rows);
        toast.success(`Berhasil mengurai ${rows.length} baris dari file.`);
      } catch (err) {
        console.error('Error parsing file:', err);
        toast.error('Gagal memproses file Excel/CSV.');
      }
    };

    if (ext === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const writeInBatches = async (items: any[]) => {
    const batchSize = 400;
    const createdIds: string[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const batchObj = writeBatch(db);
      
      for (const item of chunk) {
        const docRef = doc(collection(db, 'junior_high_unit_activity_enrollments'));
        batchObj.set(docRef, {
          ...item,
          id: docRef.id
        });
        createdIds.push(docRef.id);
      }
      
      await batchObj.commit();
    }
    return createdIds;
  };

  const handleExecuteImport = async () => {
    if (!canManage) return;

    const validRows = parsedRows.filter(r => r.status === 'VALID' || r.status === 'WARNING');
    if (validRows.length === 0) {
      toast.error('Tidak ada baris data valid yang siap untuk diimpor.');
      return;
    }

    setIsProcessingImport(true);
    try {
      const batchId = doc(collection(db, 'junior_high_unit_activity_import_batches')).id;
      const originalFileName = selectedFile?.name || 'import_file.xlsx';

      const academicYearsDetected = Array.from(new Set(parsedRows.map(r => r.academicYear).filter(Boolean))) as string[];
      const semestersDetected = Array.from(new Set(parsedRows.map(r => r.semester).filter(Boolean))) as string[];

      const totalRowsRead = parsedRows.length;
      const validRowsImported = validRows.length;
      const warningRowsSkipped = 0;
      const errorRowsSkipped = parsedRows.filter(r => r.status === 'ERROR').length;

      const duplicateExistingCount = parsedRows.filter(r => r.duplicateType === 'EXISTING').length;
      const duplicateInFileCount = parsedRows.filter(r => r.duplicateType === 'FILE').length;
      const studentNotFoundCount = parsedRows.filter(r => r.errors.some(e => e.includes('tidak ditemukan'))).length;
      const unknownUaCount = parsedRows.filter(r => r.errors.some(e => e.includes('katalog resmi'))).length;
      const invalidPeriodCount = parsedRows.filter(r => r.errors.some(e => e.includes('berformat YYYY/YYYY') || e.includes('semester harus'))).length;

      const enrollmentsToWrite = validRows.map(row => {
        const studentClass = classesList.find(c => c.id === row.matchedStudent?.classId);
        const isLgp = row.normalizedUaName === 'LGP';
        const actId = row.normalizedUaName.toLowerCase().replace(/[^a-z0-9]+/g, '_');

        return {
          studentId: row.studentId,
          studentName: row.matchedStudent?.name || row.studentNameInFile,
          classId: row.matchedStudent?.classId || '',
          className: studentClass?.name || row.classNameInFile || '',
          grade: studentClass ? String(studentClass.grade) : row.gradeInFile || '',
          academicYear: row.academicYear,
          semester: row.semester,
          category: row.normalizedCategory,
          sourceUaId: row.uaNameInFile.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          sourceUaName: row.uaNameInFile,
          normalizedUaId: actId,
          normalizedUaName: row.normalizedUaName,
          activityId: actId,
          unitActivityId: actId,
          unit: 'JUNIOR_HIGH',
          isLgp,
          status: 'CONFIRMED' as const,
          source: 'IMPORT' as const,
          notes: row.notes || 'Diimpor melalui batch ' + batchId,
          importBatchId: batchId,
          createdAt: Date.now(),
          createdBy: profile?.id || profile?.email || 'admin',
          createdByName: profile?.name || 'Administrator',
          updatedAt: Date.now(),
          updatedBy: profile?.id || profile?.email || 'admin',
          updatedByName: profile?.name || 'Administrator'
        };
      });

      const createdIds = await writeInBatches(enrollmentsToWrite);

      // Create batch audit document
      const batchDoc: JuniorHighUnitActivityImportBatch = {
        id: batchId,
        unit: 'JUNIOR_HIGH',
        originalFileName,
        importedAt: Date.now(),
        importedBy: profile?.id || profile?.email || 'admin',
        importedByName: profile?.name || 'Administrator',
        academicYearsDetected,
        semestersDetected,
        totalRowsRead,
        validRowsImported,
        warningRowsSkipped,
        errorRowsSkipped,
        duplicateExistingCount,
        duplicateInFileCount,
        studentNotFoundCount,
        unknownUaCount,
        invalidPeriodCount,
        importStatus: 'COMPLETED',
        enrollmentIdsCreated: createdIds,
        notes: `Berhasil mengimpor ${validRowsImported} data riwayat siswa.`
      };

      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'junior_high_unit_activity_import_batches', batchId), batchDoc);

      toast.success(`Impor berhasil! ${validRowsImported} pendaftaran disimpan.`);

      handleReset();
      fetchImportBatches();
      fetchEnrollments();
      fetchAllHistoryEnrollments();
    } catch (err: any) {
      console.error('Error executing import:', err);
      toast.error('Proses impor gagal: ' + err.message);
    } finally {
      setIsProcessingImport(false);
      setShowConfirmModal(false);
    }
  };

  const fetchBatchDetails = async (batch: JuniorHighUnitActivityImportBatch) => {
    setLoadingBatchDetail(true);
    setShowDetailBatch(batch);
    try {
      const q = query(
        collection(db, 'junior_high_unit_activity_enrollments'),
        where('importBatchId', '==', batch.id)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnitActivityEnrollment));
      setBatchEnrollmentsForDetail(list.map(normalizeEnrollmentForUI));
    } catch (err) {
      console.error('Error loading batch detail:', err);
      toast.error('Gagal memuat detail pendaftaran untuk batch ini.');
    } finally {
      setLoadingBatchDetail(false);
    }
  };

  const handleExecuteRollback = async () => {
    if (!canManage || !showRollbackModal) return;

    setIsRollingBack(true);
    try {
      const batchObj = showRollbackModal;
      const batchId = batchObj.id;

      const q = query(
        collection(db, 'junior_high_unit_activity_enrollments'),
        where('importBatchId', '==', batchId)
      );
      const snapshot = await getDocs(q);
      const enrollmentsToRollback = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UnitActivityEnrollment));

      const actualImportEnrollments = enrollmentsToRollback.filter(e => e.source === 'IMPORT' && e.status === 'CONFIRMED');

      if (actualImportEnrollments.length > 0) {
        const batchSize = 400;
        for (let i = 0; i < actualImportEnrollments.length; i += batchSize) {
          const chunk = actualImportEnrollments.slice(i, i + batchSize);
          const fBatch = writeBatch(db);

          chunk.forEach(e => {
            const docRef = doc(db, 'junior_high_unit_activity_enrollments', e.id);
            fBatch.update(docRef, {
              status: 'CANCELLED',
              cancelledAt: Date.now(),
              cancelledBy: profile?.id || profile?.email || 'admin',
              cancelledByName: profile?.name || 'Administrator',
              cancelReason: `Rollback Batch Impor: ${batchObj.originalFileName}`,
              rolledBackAt: Date.now(),
              rolledBackBy: profile?.id || profile?.email || 'admin',
              rolledBackByName: profile?.name || 'Administrator',
              rollbackReason: rollbackReason || 'Rollback batch oleh admin',
              rollbackBatchId: batchId
            });
          });

          await fBatch.commit();
        }
      }

      // Update batch status to ROLLED_BACK
      const batchRef = doc(db, 'junior_high_unit_activity_import_batches', batchId);
      await updateDoc(batchRef, {
        importStatus: 'ROLLED_BACK',
        notes: `Batch di-rollback pada ${new Date().toLocaleString('id-ID')} oleh ${profile?.name || 'Administrator'}. Alasan: ${rollbackReason}`
      });

      toast.success('Batch berhasil di-rollback. Seluruh pendaftaran dalam batch ini dibatalkan.');
      setShowRollbackModal(null);
      setRollbackReason('');

      fetchImportBatches();
      fetchEnrollments();
      fetchAllHistoryEnrollments();
    } catch (err: any) {
      console.error('Error rolling back batch:', err);
      toast.error('Gagal melakukan rollback: ' + err.message);
    } finally {
      setIsRollingBack(false);
    }
  };

  // Handle category change in modal form
  React.useEffect(() => {
    setFormUa('');
  }, [formCategory]);

  // Load active students for the selected class in form modal
  React.useEffect(() => {
    const fetchClassStudents = async () => {
      if (!formClassId) {
        setStudents([]);
        return;
      }
      setLoadingStudents(true);
      setSelectedStudentIds([]);
      try {
        const list = await getActiveStudents(formClassId, selectedYear);
        setStudents(list || []);
      } catch (err) {
        console.error('Error loading students:', err);
        toast.error('Gagal memuat siswa kelas');
      } finally {
        setLoadingStudents(false);
      }
    };
    fetchClassStudents();
  }, [formClassId, selectedYear]);

  // Utility to generate dynamic id from UA Name
  const getUaId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  // Trigger Bulk Save
  const handleBulkSave = async () => {
    if (!canManage) {
      toast.error('Akses ditolak: Anda tidak memiliki wewenang untuk mengelola peserta.');
      return;
    }
    if (!formCategory || !formUa || !formClassId || selectedStudentIds.length === 0) {
      toast.error('Harap isi semua form dan pilih minimal 1 siswa');
      return;
    }

    const selectedClassObj = classesList.find(c => c.id === formClassId);
    if (!selectedClassObj) {
      toast.error('Kelas tidak valid');
      return;
    }

    setIsSaving(true);
    try {
      const batchPromises = selectedStudentIds.map(async (studentId) => {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        // Double check confirmation to avoid duplicates on fast double-clicks or multiple runs
        const isAlreadyAssigned = enrollments.some(e => 
          e.studentId === studentId && 
          e.status === 'CONFIRMED' && 
          e.academicYear === selectedYear && 
          e.semester === selectedSemester
        );

        if (isAlreadyAssigned) return;

        const isLgpVal = formUa === 'LGP';

        await addDoc(collection(db, 'junior_high_unit_activity_enrollments'), {
          studentId: student.id,
          studentName: student.name,
          classId: selectedClassObj.id,
          className: selectedClassObj.name,
          grade: String(selectedClassObj.grade),
          academicYear: selectedYear,
          semester: selectedSemester,
          category: formCategory,
          sourceUaId: getUaId(formUa),
          sourceUaName: formUa,
          normalizedUaId: getUaId(formUa),
          normalizedUaName: formUa,
          activityId: getUaId(formUa),
          unitActivityId: getUaId(formUa),
          unit: 'JUNIOR_HIGH',
          isLgp: isLgpVal,
          status: 'CONFIRMED',
          source: 'MANUAL',
          createdAt: Date.now(),
          createdBy: profile?.uid || 'system',
          createdByName: profile?.displayName || profile?.email || 'Admin',
          updatedAt: Date.now(),
          updatedBy: profile?.uid || 'system',
          updatedByName: profile?.displayName || profile?.email || 'Admin'
        });
      });

      await Promise.all(batchPromises);
      toast.success(`Berhasil menambahkan ${selectedStudentIds.length} peserta Unit Aktivitas`);
      setShowAddModal(false);
      
      // Reset Modal Form
      setFormCategory('');
      setFormUa('');
      setFormClassId('');
      setStudents([]);
      setSelectedStudentIds([]);

      // Refresh list
      fetchEnrollments();
    } catch (err) {
      console.error('Error saving bulk enrollments:', err);
      toast.error('Gagal menyimpan pendaftaran peserta');
    } finally {
      setIsSaving(false);
    }
  };

  // Soft cancel an enrollment
  const handleConfirmCancel = async () => {
    if (!canManage) {
      toast.error('Akses ditolak: Anda tidak memiliki wewenang untuk mengelola peserta.');
      return;
    }
    if (!cancellingEnrollment) return;

    try {
      const docRef = doc(db, 'junior_high_unit_activity_enrollments', cancellingEnrollment.id);
      await updateDoc(docRef, {
        status: 'CANCELLED',
        cancelledAt: Date.now(),
        cancelledBy: profile?.uid || 'system',
        cancelledByName: profile?.displayName || profile?.email || 'Admin',
        cancelReason: 'Dibatalkan secara manual oleh admin',
        updatedAt: Date.now(),
        updatedBy: profile?.uid || 'system',
        updatedByName: profile?.displayName || profile?.email || 'Admin'
      });

      toast.success(`Pendaftaran ${cancellingEnrollment.studentName} berhasil dibatalkan`);
      setCancellingEnrollment(null);
      fetchEnrollments();
    } catch (err) {
      console.error('Error cancelling enrollment:', err);
      toast.error('Gagal membatalkan pendaftaran');
    }
  };

  // Filter Logic (Client-side)
  const filteredEnrollments = enrollments.filter(e => {
    // Search keyword (studentName or NIS)
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      const nameMatch = e.studentName?.toLowerCase().includes(keyword);
      const nisMatch = e.studentId?.toLowerCase().includes(keyword);
      if (!nameMatch && !nisMatch) return false;
    }

    // Filter class
    if (filterClassId !== 'ALL' && e.classId !== filterClassId) return false;

    // Filter grade
    if (filterGrade !== 'ALL' && e.grade !== filterGrade) return false;

    // Filter category
    if (filterCategory !== 'ALL' && e.category !== filterCategory) return false;

    // Filter UA
    if (filterUaName !== 'ALL' && e.normalizedUaName !== filterUaName) return false;

    // Filter status
    if (filterStatus !== 'ALL' && e.status !== filterStatus) return false;

    return true;
  });

  // Filter Logic for Student History (Client-side)
  const filteredStudentsForHistory = allActiveStudents.filter(student => {
    // Search keyword
    if (histSearchKeyword) {
      const keyword = histSearchKeyword.toLowerCase();
      const nameMatch = student.name?.toLowerCase().includes(keyword);
      const nisMatch = student.id?.toLowerCase().includes(keyword);
      if (!nameMatch && !nisMatch) return false;
    }

    // Class filter
    if (histFilterClassId !== 'ALL' && student.classId !== histFilterClassId) return false;

    // Grade filter
    if (histFilterGrade !== 'ALL') {
      const classObj = classesList.find(c => c.id === student.classId);
      if (!classObj || String(classObj.grade) !== histFilterGrade) return false;
    }

    // Category filter
    if (histFilterCategory !== 'ALL') {
      const studentHistory = allHistoryEnrollments.filter(e => e.studentId === student.id && e.status === 'CONFIRMED');
      const hasCategory = studentHistory.some(e => e.category === histFilterCategory);
      if (!hasCategory) return false;
    }

    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Compass size={22} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Unit Aktivitas</h1>
          </div>
          <p className="text-xs text-gray-500 font-medium tracking-tight">
            Peserta Unit Aktivitas • Junior High • TA {selectedYear} • Semester {selectedSemester}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">TA</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none"
            >
              <option value="2026/2027">2026/2027</option>
              <option value="2025/2026">2025/2026</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Sem</span>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none"
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>

          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 bg-[#002366] hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus size={15} />
              Tambah Peserta
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active_semester')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 -mb-[1px] cursor-pointer ${
            activeTab === 'active_semester'
              ? 'border-[#002366] text-[#002366]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Peserta Semester Aktif
        </button>
        <button
          onClick={() => setActiveTab('student_history')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 -mb-[1px] cursor-pointer ${
            activeTab === 'student_history'
              ? 'border-[#002366] text-[#002366]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Riwayat Siswa
        </button>
        {canManage && (
          <button
            onClick={() => setActiveTab('import_history')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 -mb-[1px] cursor-pointer ${
              activeTab === 'import_history'
                ? 'border-[#002366] text-[#002366]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Import Riwayat
          </button>
        )}
      </div>

      {activeTab === 'active_semester' && (
        <>
          {/* Filter Card */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
          <Filter size={14} className="text-gray-400" />
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filter Pencarian</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Class Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas</label>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Kelas</option>
              {classesList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Grade Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade</label>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Grade</option>
              <option value="7">Grade 7</option>
              <option value="8">Grade 8</option>
              <option value="9">Grade 9</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kategori UA</label>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setFilterUaName('ALL');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Kategori</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* UA Name Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unit Aktivitas</label>
            <select
              value={filterUaName}
              onChange={(e) => setFilterUaName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua UA</option>
              {filterCategory !== 'ALL' ? (
                (UA_BY_CATEGORY[filterCategory] || []).map(ua => (
                  <option key={ua} value={ua}>{ua}</option>
                ))
              ) : (
                Object.values(UA_BY_CATEGORY).flat().map(ua => (
                  <option key={ua} value={ua}>{ua}</option>
                ))
              )}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            >
              <option value="ALL">Semua Status</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="MOVED">Moved</option>
            </select>
          </div>

          {/* Student Search */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nama / NIS</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Cari siswa..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-semibold text-gray-700 placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-gray-100">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[200px]">
                  Nama Siswa
                </th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">NIS</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Kelas</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Grade</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Unit Aktivitas</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Sumber</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Pembaruan Terakhir</th>
                {canManage && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingEnrollments ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-gray-500 font-medium">Memuat data peserta...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredEnrollments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                      <div className="p-3 bg-slate-50 text-slate-400 rounded-full">
                        <Compass size={28} />
                      </div>
                      <h3 className="text-xs font-bold text-gray-700">Belum Ada Peserta</h3>
                      <p className="text-[11px] text-gray-500 leading-normal">
                        Belum ada peserta Unit Aktivitas yang tercatat untuk periode ini. Klik tombol tambah peserta untuk mendaftarkan siswa.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEnrollments.map((e, index) => (
                  <tr key={e.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 text-[13px] font-semibold text-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.015)] border-r border-gray-100/30">
                      {e.studentName}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-500">
                      {e.studentId}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">
                      {e.className}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-500">
                      Grade {e.grade}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-600">
                      {e.category}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-900">
                      {e.normalizedUaName}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                        e.status === 'CONFIRMED' ? 'bg-green-50 text-green-700 border-green-100' :
                        e.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-100' :
                        'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          e.source === 'MANUAL' ? 'bg-blue-500' :
                          e.source === 'IMPORT' ? 'bg-amber-500' :
                          'bg-purple-500'
                        }`} />
                        {e.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-medium">
                      <div className="flex flex-col">
                        <span>{new Date(e.updatedAt || e.createdAt).toLocaleDateString('id-ID')}</span>
                        <span className="text-[10px] text-gray-400">Oleh: {e.updatedByName || e.createdByName || 'Admin'}</span>
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {e.status === 'CONFIRMED' && (
                          <button
                            onClick={() => setCancellingEnrollment(e)}
                            className="inline-flex items-center gap-1 border border-dashed border-red-200 hover:border-red-400 hover:bg-red-50 text-red-600 px-2 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            Batalkan
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* --- Part A: STUDENT HISTORY VIEW --- */}
      {activeTab === 'student_history' && (
        <>
          {/* Filters for history */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
              <Filter size={14} className="text-gray-400" />
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filter Riwayat Siswa</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Class Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas</label>
                <select
                  value={histFilterClassId}
                  onChange={(e) => setHistFilterClassId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                >
                  <option value="ALL">Semua Kelas</option>
                  {classesList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Grade Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade</label>
                <select
                  value={histFilterGrade}
                  onChange={(e) => setHistFilterGrade(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                >
                  <option value="ALL">Semua Grade</option>
                  <option value="7">Grade 7</option>
                  <option value="8">Grade 8</option>
                  <option value="9">Grade 9</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kategori UA</label>
                <select
                  value={histFilterCategory}
                  onChange={(e) => setHistFilterCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                >
                  <option value="ALL">Semua Kategori</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Student Search */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nama / NIS</label>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={histSearchKeyword}
                    onChange={(e) => setHistSearchKeyword(e.target.value)}
                    placeholder="Cari siswa..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-semibold text-gray-700 placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main Table for history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto relative">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-gray-100">
                    <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[200px]">
                      Nama Siswa
                    </th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">NIS</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Kelas Saat Ini</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Riwayat Unit Aktivitas</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Jumlah UA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingActiveStudents || loadingHistoryEnrollments ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                        Memuat data...
                      </td>
                    </tr>
                  ) : filteredStudentsForHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                        Siswa tidak ditemukan
                      </td>
                    </tr>
                  ) : (
                    filteredStudentsForHistory.map(student => {
                      const currentClassObj = classesList.find(c => c.id === student.classId);
                      const studentHistory = allHistoryEnrollments
                        .filter(e => e.studentId === student.id && e.status === 'CONFIRMED')
                        .sort((a, b) => {
                          if (a.academicYear !== b.academicYear) {
                            return a.academicYear.localeCompare(b.academicYear);
                          }
                          return a.semester.localeCompare(b.semester);
                        });

                      const hasRecords = studentHistory.length > 0;

                      return (
                        <tr
                          key={student.id}
                          onClick={() => setSelectedStudentForDetail(student)}
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                        >
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/50 px-4 py-3 text-xs font-semibold text-gray-900 shadow-[2px_0_5px_rgba(0,0,0,0.02)] min-w-[200px]">
                            {student.name}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-gray-500">{student.id}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-medium">{currentClassObj?.name || '-'}</td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex flex-wrap gap-1.5 max-w-2xl">
                              {hasRecords ? (
                                studentHistory.map(e => {
                                  const isLgp = e.isLgp || ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName);
                                  const displayName = isLgp ? 'LGP' : e.normalizedUaName;
                                  return (
                                    <span
                                      key={e.id}
                                      className="inline-flex items-center gap-1 bg-blue-50 text-[#002366] text-[10px] font-bold px-2 py-0.5 rounded border border-blue-100/50"
                                    >
                                      TA {e.academicYear} S{e.semester} — {displayName}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-xs text-gray-400 italic font-medium">Data belum diimpor</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-[#002366]">{studentHistory.length}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --- PHASE 2: IMPORT HISTORY TAB VIEW --- */}
      {activeTab === 'import_history' && canManage && (
        <div className="space-y-6">
          {/* Action Row */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-gray-900">Impor Riwayat Unit Aktivitas</h2>
              <p className="text-xs text-gray-500 font-medium leading-normal">Unggah data riwayat Unit Aktivitas Junior High dari file Excel (.xlsx, .xls) atau CSV secara bertahap.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                <Download size={15} />
                Unduh Template
              </button>
              
              <label className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
                <Upload size={15} />
                Pilih File
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
              </label>

              {selectedFile && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  <X size={15} />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Selected file card (if any) */}
          {selectedFile && (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Upload size={20} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">{selectedFile.name}</h3>
                  <p className="text-[10px] text-gray-500 font-medium">Ukuran: {(selectedFile.size / 1024).toFixed(1)} KB • Total: {parsedRows.length} baris data ditemukan</p>
                </div>
              </div>
              <div className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Terunggah
              </div>
            </div>
          )}

          {/* Preview Panel if rows are parsed */}
          {parsedRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                <div className="flex items-center gap-1.5">
                  <Eye size={16} className="text-gray-400" />
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Preview Hasil Validasi Data</h3>
                </div>
                
                {/* Execute Import triggers confirmation */}
                <button
                  disabled={parsedRows.filter(r => r.status === 'VALID' || r.status === 'WARNING').length === 0}
                  onClick={() => setShowConfirmModal(true)}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <CheckCircle size={15} />
                  Import Data Valid ({parsedRows.filter(r => r.status === 'VALID' || r.status === 'WARNING').length})
                </button>
              </div>

              {/* Metrics Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase">Total Baris</span>
                  <span className="text-lg font-bold text-gray-700">{parsedRows.length}</span>
                </div>
                <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                  <span className="block text-[9px] font-bold text-emerald-600 uppercase">Siap Diimpor</span>
                  <span className="text-lg font-bold text-emerald-700">{parsedRows.filter(r => r.status === 'VALID').length}</span>
                </div>
                <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                  <span className="block text-[9px] font-bold text-amber-600 uppercase">Warning</span>
                  <span className="text-lg font-bold text-amber-700">{parsedRows.filter(r => r.status === 'WARNING').length}</span>
                </div>
                <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100">
                  <span className="block text-[9px] font-bold text-rose-600 uppercase">Error</span>
                  <span className="text-lg font-bold text-rose-700">{parsedRows.filter(r => r.status === 'ERROR' && r.duplicateType === 'NONE').length}</span>
                </div>
                <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100">
                  <span className="block text-[9px] font-bold text-orange-600 uppercase">Duplikat / Konflik</span>
                  <span className="text-lg font-bold text-orange-700">{parsedRows.filter(r => r.duplicateType !== 'NONE' && r.duplicateType !== undefined).length}</span>
                </div>
              </div>

              {/* Filters for Preview */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-50 pb-2.5">
                <button
                  onClick={() => setPreviewFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === 'ALL'
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Semua ({parsedRows.length})
                </button>
                <button
                  onClick={() => setPreviewFilter('READY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === 'READY'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'text-gray-400 hover:text-emerald-600'
                  }`}
                >
                  Siap Diimpor ({parsedRows.filter(r => r.status === 'VALID' || r.status === 'WARNING').length})
                </button>
                <button
                  onClick={() => setPreviewFilter('WARNING')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === 'WARNING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'text-gray-400 hover:text-amber-600'
                  }`}
                >
                  Warning ({parsedRows.filter(r => r.status === 'WARNING').length})
                </button>
                <button
                  onClick={() => setPreviewFilter('ERROR')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === 'ERROR'
                      ? 'bg-rose-100 text-rose-800'
                      : 'text-gray-400 hover:text-rose-600'
                  }`}
                >
                  Error ({parsedRows.filter(r => r.status === 'ERROR' && r.duplicateType === 'NONE').length})
                </button>
                <button
                  onClick={() => setPreviewFilter('DUPLICATE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewFilter === 'DUPLICATE'
                      ? 'bg-orange-100 text-orange-800'
                      : 'text-gray-400 hover:text-orange-600'
                  }`}
                >
                  Duplikat ({parsedRows.filter(r => r.duplicateType !== 'NONE' && r.duplicateType !== undefined).length})
                </button>
              </div>

              {/* Table Preview */}
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider sticky top-0">
                        <th className="px-3 py-2.5 text-center w-12">Baris</th>
                        <th className="px-3 py-2.5 w-24">NIS</th>
                        <th className="px-3 py-2.5">Nama Siswa</th>
                        <th className="px-3 py-2.5">Kelas/TA</th>
                        <th className="px-3 py-2.5">UA Sumber</th>
                        <th className="px-3 py-2.5">UA Normalisasi</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Pesan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {parsedRows
                        .filter(row => {
                          if (previewFilter === 'READY') return row.status === 'VALID' || row.status === 'WARNING';
                          if (previewFilter === 'WARNING') return row.status === 'WARNING';
                          if (previewFilter === 'ERROR') return row.status === 'ERROR' && row.duplicateType === 'NONE';
                          if (previewFilter === 'DUPLICATE') return row.duplicateType !== 'NONE' && row.duplicateType !== undefined;
                          return true;
                        })
                        .map(row => (
                          <tr key={row.rowNum} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2.5 text-center font-bold text-gray-400">{row.rowNum}</td>
                            <td className="px-3 py-2.5 font-semibold text-gray-700">{row.studentId || '-'}</td>
                            <td className="px-3 py-2.5">
                              <span className="font-bold text-gray-800 block">{row.matchedStudentName || row.studentNameInFile || '-'}</span>
                              {row.studentNameInFile && row.matchedStudentName && row.studentNameInFile !== row.matchedStudentName && (
                                <span className="text-[10px] text-gray-400 italic">Nama di file: "{row.studentNameInFile}"</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-medium text-gray-700 block">{row.classNameInFile || row.matchedStudent?.classId || '-'}</span>
                              <span className="text-[10px] text-gray-400 font-medium">{row.academicYear} • S{row.semester}</span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">{row.uaNameInFile || '-'}</td>
                            <td className="px-3 py-2.5">
                              <span className="font-bold text-[#002366] block">{row.normalizedUaName || '-'}</span>
                              <span className="text-[9px] text-gray-400 uppercase block tracking-tight font-bold">{row.normalizedCategory || '-'}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              {row.status === 'VALID' && (
                                <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 font-bold border border-emerald-100 rounded-full px-2 py-0.5 text-[9px] uppercase">
                                  <CheckCircle size={10} /> Valid
                                </span>
                              )}
                              {row.status === 'WARNING' && (
                                <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 font-bold border border-amber-100 rounded-full px-2 py-0.5 text-[9px] uppercase">
                                  <AlertTriangle size={10} /> Warning
                                </span>
                              )}
                              {row.status === 'ERROR' && (
                                <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-700 font-bold border border-rose-100 rounded-full px-2 py-0.5 text-[9px] uppercase">
                                  <XCircle size={10} /> Error
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-[10px]">
                              {row.errors.length > 0 && (
                                <ul className="list-disc pl-4 text-rose-600 font-medium space-y-0.5">
                                  {row.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                                </ul>
                              )}
                              {row.warnings.length > 0 && (
                                <ul className="list-disc pl-4 text-amber-600 font-medium space-y-0.5">
                                  {row.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                                </ul>
                              )}
                              {row.errors.length === 0 && row.warnings.length === 0 && (
                                <span className="text-gray-400 italic font-semibold">Siap diimpor</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Import Batches History Section */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 border-b border-gray-50 pb-2.5">
              <Clock size={16} className="text-gray-400" />
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Riwayat Batch Impor</h2>
            </div>

            {loadingBatches ? (
              <div className="flex justify-center items-center py-8 gap-2 text-xs font-semibold text-gray-400">
                <RefreshCw size={15} className="animate-spin text-blue-600" />
                Memuat riwayat batch...
              </div>
            ) : importBatches.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400 italic">
                Belum ada riwayat batch impor historis yang terdaftar.
              </div>
            ) : (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider">
                        <th className="px-4 py-3">Waktu Impor</th>
                        <th className="px-4 py-3">Nama File</th>
                        <th className="px-4 py-3">Pengimpor</th>
                        <th className="px-4 py-3 text-center">Jumlah Baris</th>
                        <th className="px-4 py-3">Periode Terdeteksi</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {importBatches.map(batch => (
                        <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-700">
                            {new Date(batch.importedAt).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-800">{batch.originalFileName}</td>
                          <td className="px-4 py-3 text-gray-500 font-medium">{batch.importedByName || batch.importedBy}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-emerald-600">{batch.validRowsImported}</span>
                            <span className="text-gray-400 font-medium"> / {batch.totalRowsRead}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {batch.academicYearsDetected.map(y => (
                                <span key={y} className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  {y} (S{batch.semestersDetected.join(',')})
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {batch.importStatus === 'COMPLETED' && (
                              <span className="bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                Completed
                              </span>
                            )}
                            {batch.importStatus === 'ROLLED_BACK' && (
                              <span className="bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                Rolled Back
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => fetchBatchDetails(batch)}
                              className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                            >
                              <Eye size={12} /> Detail
                            </button>
                            {batch.importStatus === 'COMPLETED' && (
                              <button
                                onClick={() => setShowRollbackModal(batch)}
                                className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                              >
                                <Trash2 size={12} /> Rollback
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Read-Only Student History Modal */}
      {selectedStudentForDetail && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-[#002366]" />
                <h3 className="text-sm font-bold text-gray-900">Detail Riwayat Siswa</h3>
              </div>
              <button
                onClick={() => setSelectedStudentForDetail(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-lg hover:bg-gray-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Profile Card */}
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nama Siswa</span>
                  <span className="text-xs font-bold text-gray-800">{selectedStudentForDetail.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">NIS</span>
                  <span className="text-xs font-semibold text-gray-700">{selectedStudentForDetail.id}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {classesList.find(c => c.id === selectedStudentForDetail.classId)?.name || '-'}
                  </span>
                </div>
              </div>

              {/* History Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Riwayat Unit Aktivitas</h4>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-100">
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Tahun Ajaran</th>
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider text-center">Semester</th>
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                        <th className="px-4 py-2 font-bold text-gray-500 uppercase tracking-wider">Unit Aktivitas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allHistoryEnrollments
                        .filter(e => e.studentId === selectedStudentForDetail.id && e.status === 'CONFIRMED')
                        .sort((a, b) => {
                          if (a.academicYear !== b.academicYear) {
                            return a.academicYear.localeCompare(b.academicYear);
                          }
                          return a.semester.localeCompare(b.semester);
                        })
                        .map(e => {
                          const isLgp = e.isLgp || ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName);
                          const displayName = isLgp ? 'LGP' : e.normalizedUaName;
                          return (
                            <tr key={e.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-semibold text-gray-700">{e.academicYear}</td>
                              <td className="px-4 py-2.5 text-center font-bold text-gray-500">{e.semester}</td>
                              <td className="px-4 py-2.5 font-medium text-gray-500">{e.category}</td>
                              <td className="px-4 py-2.5 font-bold text-[#002366]">{displayName}</td>
                            </tr>
                          );
                        })}
                      {allHistoryEnrollments.filter(e => e.studentId === selectedStudentForDetail.id && e.status === 'CONFIRMED').length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                            Data belum diimpor
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-slate-50">
              <button
                onClick={() => setSelectedStudentForDetail(null)}
                className="bg-white hover:bg-slate-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border border-gray-200 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Modal (Form Bulk Assignment) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Compass size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Mendaftarkan Peserta Baru</h3>
                  <p className="text-[10px] text-gray-400 font-medium tracking-tight">Bulk Assignment Semester 1 TA {selectedYear}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Year & Semester (Static lock for simple visual clarity) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tahun Ajaran & Semester</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-600 flex items-center gap-1.5 select-none">
                    <Calendar size={13} className="text-gray-400" />
                    TA {selectedYear} • Sem {selectedSemester}
                  </div>
                </div>

                {/* Category Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kategori Rumpun UA *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  >
                    <option value="">-- Pilih Kategori --</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* UA Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unit Aktivitas *</label>
                  <select
                    value={formUa}
                    onChange={(e) => setFormUa(e.target.value)}
                    disabled={!formCategory}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors disabled:opacity-50"
                  >
                    <option value="">-- Pilih UA --</option>
                    {formCategory && (UA_BY_CATEGORY[formCategory] || []).map(ua => (
                      <option key={ua} value={ua}>{ua}</option>
                    ))}
                  </select>
                </div>

                {/* Class Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kelas Siswa *</label>
                  <select
                    value={formClassId}
                    onChange={(e) => setFormClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {classesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Student Checklist Panel */}
              {formClassId && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pilih Peserta Didik ({students.length} Siswa)</label>
                    {students.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          // Select all non-allocated students
                          const availableIds = students
                            .filter(s => !enrollments.some(e => e.studentId === s.id && e.status === 'CONFIRMED'))
                            .map(s => s.id);
                          if (selectedStudentIds.length === availableIds.length) {
                            setSelectedStudentIds([]);
                          } else {
                            setSelectedStudentIds(availableIds);
                          }
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        {selectedStudentIds.length === students.filter(s => !enrollments.some(e => e.studentId === s.id && e.status === 'CONFIRMED')).length
                          ? 'Deselect All'
                          : 'Select All Available'}
                      </button>
                    )}
                  </div>

                  {loadingStudents ? (
                    <div className="py-8 text-center text-xs text-gray-400">Loading daftar siswa...</div>
                  ) : students.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">Tidak ada siswa aktif di kelas ini</div>
                  ) : (
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-50">
                      {students.map(s => {
                        const existingConfirmed = enrollments.find(e => e.studentId === s.id && e.status === 'CONFIRMED');
                        const isAssigned = !!existingConfirmed;

                        return (
                          <div 
                            key={s.id} 
                            className={`flex items-center justify-between p-2.5 transition-colors text-xs ${
                              isAssigned ? 'bg-slate-50 text-gray-400' : 'hover:bg-slate-50/50'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 flex-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={selectedStudentIds.includes(s.id)}
                                disabled={isAssigned}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentIds(prev => [...prev, s.id]);
                                  } else {
                                    setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                                  }
                                }}
                                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                              />
                              <div className="flex flex-col text-left">
                                <span className="font-semibold">{s.name}</span>
                                <span className="text-[10px] text-gray-400 font-medium">NIS: {s.id}</span>
                              </div>
                            </label>

                            {isAssigned && (
                              <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-amber-100">
                                <AlertTriangle size={8} />
                                Terdaftar: {existingConfirmed.normalizedUaName}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Summary & Buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-600">
                Terpilih: <span className="font-bold text-blue-700">{selectedStudentIds.length}</span> siswa
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSaving || selectedStudentIds.length === 0}
                  onClick={handleBulkSave}
                  className="inline-flex items-center gap-1 bg-[#002366] hover:bg-blue-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Soft Cancel Confirm Dialog */}
      {cancellingEnrollment && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex gap-3 text-red-600">
              <div className="p-2 bg-red-50 rounded-xl shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-normal">Batalkan Pendaftaran Unit Aktivitas?</h3>
                <p className="text-[11px] text-gray-500 leading-normal mt-0.5">
                  Anda akan membatalkan pendaftaran <strong>{cancellingEnrollment.studentName}</strong> dari Unit Aktivitas <strong>{cancellingEnrollment.normalizedUaName}</strong>.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-gray-600 leading-normal">
              <strong>Catatan Audit:</strong> Data pendaftaran tidak akan dihapus, tetapi statusnya akan berubah menjadi <strong>CANCELLED</strong> dalam rekam riwayat peserta.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancellingEnrollment(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmCancel}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Konfirmasi Batalkan
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirm Import Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex gap-3 text-emerald-600">
              <div className="p-2 bg-emerald-50 rounded-xl shrink-0">
                <CheckCircle size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-normal">Konfirmasi Impor Data Historis</h3>
                <p className="text-[11px] text-gray-500 leading-normal mt-0.5">
                  Anda akan mengimpor sebanyak <strong>{parsedRows.filter(r => r.status === 'VALID' || r.status === 'WARNING').length}</strong> baris data valid ke dalam sistem.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] text-gray-600 space-y-1.5 leading-relaxed">
              <p>• Seluruh data yang diimpor akan disimpan dengan status <strong>CONFIRMED</strong> dan sumber <strong>IMPORT</strong>.</p>
              <p>• Data pendaftaran aktif Semester 1 TA 2026/2027 yang diinput manual <strong>tidak akan terpengaruh/tertimpa</strong>.</p>
              <p>• Log audit batch akan dibuat dan Anda dapat melakukan rollback di masa mendatang jika diperlukan.</p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                disabled={isProcessingImport}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                disabled={isProcessingImport}
                onClick={handleExecuteImport}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1"
              >
                {isProcessingImport ? 'Memproses...' : 'Ya, Impor Sekarang'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Batch Detail Modal */}
      {showDetailBatch && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Compass size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Detail Pendaftaran Batch</h3>
                  <p className="text-[10px] text-gray-400 font-medium tracking-tight">
                    File: {showDetailBatch.originalFileName} • ID: {showDetailBatch.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDetailBatch(null);
                  setBatchEnrollmentsForDetail([]);
                }}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-lg hover:bg-gray-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content list */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase">Waktu Impor</span>
                  <span className="font-semibold text-gray-700">{new Date(showDetailBatch.importedAt).toLocaleString('id-ID')}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase">Diimpor Oleh</span>
                  <span className="font-semibold text-gray-700">{showDetailBatch.importedByName}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase">Jumlah Baris Impor</span>
                  <span className="font-bold text-emerald-600">{showDetailBatch.validRowsImported} baris</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-gray-400 uppercase">Status Batch</span>
                  <span className={`font-bold uppercase ${showDetailBatch.importStatus === 'COMPLETED' ? 'text-green-600' : 'text-red-600'}`}>
                    {showDetailBatch.importStatus}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Daftar Hasil Impor</h4>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider sticky top-0">
                          <th className="px-4 py-2">NIS</th>
                          <th className="px-4 py-2">Nama Siswa</th>
                          <th className="px-4 py-2">Kelas</th>
                          <th className="px-4 py-2">Tahun / Sem</th>
                          <th className="px-4 py-2">Kategori</th>
                          <th className="px-4 py-2">Unit Aktivitas</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {loadingBatchDetail ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-gray-400 font-semibold">
                              <RefreshCw size={14} className="animate-spin inline-block mr-1 text-blue-600" /> Memuat detail...
                            </td>
                          </tr>
                        ) : batchEnrollmentsForDetail.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-gray-400 italic">
                              Tidak ada data pendaftaran aktif untuk batch ini (mungkin semua sudah di-rollback atau dibatalkan).
                            </td>
                          </tr>
                        ) : (
                          batchEnrollmentsForDetail.map(e => (
                            <tr key={e.id} className="hover:bg-slate-50/30">
                              <td className="px-4 py-2.5 font-mono text-gray-600">{e.studentId}</td>
                              <td className="px-4 py-2.5 font-bold text-gray-800">{e.studentName}</td>
                              <td className="px-4 py-2.5 font-semibold text-gray-700">{e.className}</td>
                              <td className="px-4 py-2.5 text-gray-500">{e.academicYear} • S{e.semester}</td>
                              <td className="px-4 py-2.5 text-gray-400 font-medium">{e.category}</td>
                              <td className="px-4 py-2.5 font-bold text-[#002366]">{e.normalizedUaName}</td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                  e.status === 'CONFIRMED' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                                }`}>
                                  {e.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-slate-50">
              <button
                onClick={() => {
                  setShowDetailBatch(null);
                  setBatchEnrollmentsForDetail([]);
                }}
                className="bg-white hover:bg-slate-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border border-gray-200 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Rollback Batch Modal */}
      {showRollbackModal && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex gap-3 text-red-600">
              <div className="p-2 bg-red-50 rounded-xl shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-normal">Rollback Batch Impor?</h3>
                <p className="text-[11px] text-gray-500 leading-normal mt-0.5">
                  Seluruh <strong>{showRollbackModal.validRowsImported}</strong> pendaftaran yang diimpor melalui berkas <strong>{showRollbackModal.originalFileName}</strong> akan dibatalkan.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Alasan Rollback (Wajib)</label>
              <textarea
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Tuliskan alasan membatalkan seluruh pendaftaran dalam batch ini..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 placeholder-gray-400 focus:ring-1 focus:ring-red-500 focus:outline-none transition-colors min-h-[80px]"
              />
            </div>

            <div className="bg-red-50 p-3 rounded-xl border border-red-100 text-[10px] text-red-700 leading-relaxed font-semibold">
              Peringatan: Tindakan ini akan mengubah status seluruh pendaftaran di batch ini menjadi CANCELLED. Rekam audit historis tidak dihapus demi kepatuhan log audit.
            </div>

            <div className="flex justify-end gap-2">
              <button
                disabled={isRollingBack}
                onClick={() => {
                  setShowRollbackModal(null);
                  setRollbackReason('');
                }}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                disabled={isRollingBack || !rollbackReason.trim()}
                onClick={handleExecuteRollback}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                {isRollingBack ? 'Memproses Rollback...' : 'Ya, Rollback Batch'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
