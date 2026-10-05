import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Calendar, Users, Save, CheckCircle2, RefreshCw, 
  AlertCircle, Info, Check, Search, Trash2, ArrowRight, ExternalLink,
  Plus, Undo2, Archive
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { 
  doc, getDoc, getDocs, deleteDoc, query, collection, where, writeBatch, serverTimestamp, onSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Class, Student } from '../../types';

interface OtherReportMapping {
  id: string; // unique key for UI list
  studentId: string; // empty if unmatched
  studentNameSnapshot: string;
  nisSnapshot: string;
  nisnSnapshot?: string;
  classId: string;
  classNameSnapshot: string;
  academicYear: string;
  semester: string;
  batchId: string;
  judul: string;
  keterangan?: string;
  fileName: string;
  fileId: string;
  driveUrl: string;
  status: 'Cocok' | 'Tidak ditemukan' | 'Duplikat' | 'Belum ada PDF' | 'Perlu diperiksa';
  matchedBy: 'NAME_AND_CLASS' | 'MANUAL' | 'STUDENT_ID' | 'NONE' | string;
  dbStatus?: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';
  // Tracking fields
  isOpened?: boolean;
  firstOpenedAt?: any;
  lastOpenedAt?: any;
  openCount?: number;
  openedByEmail?: string;
}

interface BatchSummary {
  batchId: string;
  judul: string;
  judulNormalized: string;
  keterangan?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';
  docCount: number;
}

function cleanName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeJudul(judul: string): string {
  return (judul || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function judulToBatchSlug(judul: string): string {
  return normalizeJudul(judul)
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
}

function normalizeYear(year: string): string {
  return (year || '').replace(/\//g, '-').trim();
}

function isYearMatch(y1: any, y2: any): boolean {
  return normalizeYear(String(y1)) === normalizeYear(String(y2));
}

function isSemesterMatch(s1: any, s2: any): boolean {
  return String(s1 || '1').trim() === String(s2 || '1').trim();
}

function isStudentIdMatch(candidateId: any, student: Student): boolean {
  if (candidateId === null || candidateId === undefined) return false;
  const candStr = String(candidateId).trim().toLowerCase();
  if (!candStr) return false;

  const targetIds = [
    student.id,
    student.luminaId,
    (student as any).studentId,
    (student as any).docId,
    student.nis
  ].filter(Boolean).map(id => String(id).trim().toLowerCase());

  if (targetIds.includes(candStr)) return true;

  // Numeric comparison in case of string vs number (e.g. 2522001 vs "2522001")
  const candNum = Number(candStr);
  if (!isNaN(candNum) && candNum > 0) {
    for (const tid of targetIds) {
      const tNum = Number(tid);
      if (!isNaN(tNum) && tNum === candNum) return true;
    }
  }

  return false;
}

function findStudentMatch(student: Student, savedDocs: any[]): any | undefined {
  return savedDocs.find(d => {
    if (isStudentIdMatch(d.studentId, student)) return true;
    if (d.nis && isStudentIdMatch(d.nis, student)) return true;
    return false;
  });
}

function formatTrackingTime(timestamp: any): string {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : (typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp));
  if (isNaN(date.getTime())) return '-';
  
  const d = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${d} ${m} ${y}, ${hours}.${minutes}`;
}

export default function ElementaryOtherReportPage() {
  const { user: currentUser } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Selected Context parameters
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Batch / Judul Rapor parameters
  const [existingBatches, setExistingBatches] = React.useState<BatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = React.useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = React.useState<string>('NEW'); // 'NEW' or existing batchId
  const [inputJudul, setInputJudul] = React.useState<string>('');
  const [inputKeterangan, setInputKeterangan] = React.useState<string>('');

  // Error state for queries
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [errorIndexUrl, setErrorIndexUrl] = React.useState<string | null>(null);

  // Dropdowns & students list
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const classesListRef = React.useRef<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [roster, setRoster] = React.useState<Student[]>([]);
  const rosterRef = React.useRef<Student[]>([]);
  const [loadingRoster, setLoadingRoster] = React.useState<boolean>(false);

  // Mappings state (unified list of students and attached file links)
  const [mappings, setMappings] = React.useState<OtherReportMapping[]>([]);
  const [loadingSaved, setLoadingSaved] = React.useState<boolean>(false);

  // Bulk Paste State
  const [pasteText, setPasteText] = React.useState<string>('');

  // Filter & Search
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [activeTab, setActiveTab] = React.useState<'mapping' | 'tracking'>('mapping');

  // Action status
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isPublishing, setIsPublishing] = React.useState<boolean>(false);
  const [isUnpublishing, setIsUnpublishing] = React.useState<boolean>(false);
  const [isArchiving, setIsArchiving] = React.useState<boolean>(false);

  // Warning modal for unresolved rows
  const [showUnresolvedModal, setShowUnresolvedModal] = React.useState<boolean>(false);

  // Sync initial academic context from context if available
  React.useEffect(() => {
    if (activeYear) {
      setSelectedYear(activeYear);
    }
    if (activeSemester) {
      setSelectedSemester(String(activeSemester));
    }
  }, [activeYear, activeSemester]);

  // Fetch Elementary classes for selected academic year
  React.useEffect(() => {
    const fetchElemClasses = async () => {
      setLoadingClasses(true);
      setErrorMessage(null);
      setErrorIndexUrl(null);

      try {
        const [all, enrollmentsSnap] = await Promise.all([
          getClasses(),
          getDocs(query(
            collection(db, 'enrollments'),
            where('academicYear', '==', selectedYear),
            where('status', '==', 'active')
          ))
        ]);

        const activeClassKeys = new Set<string>();
        enrollmentsSnap.docs.forEach(d => {
          const e = d.data();
          if (e.classId) activeClassKeys.add(e.classId);
        });

        const elemClasses = (all || []).filter(c => {
          const isElem = c.unitId === 'ELEMENTARY';
          const isActiveYear = isYearMatch(c.academicYear, selectedYear);
          const isNotArchived = c.status !== 'archived';
          if (!isElem || !isActiveYear || !isNotArchived) return false;
          return activeClassKeys.has(c.id) || activeClassKeys.has(c.name);
        });

        elemClasses.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        classesListRef.current = elemClasses;
        setClassesList(elemClasses);
        if (elemClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(elemClasses[0].id);
        }
      } catch (err: any) {
        console.error('Error fetching Elementary classes:', err);
        const msg = err?.message || String(err);
        setErrorMessage(msg);
        toast.error('Gagal memuat kelas Elementary: ' + msg);
      } finally {
        setLoadingClasses(false);
      }
    };

    fetchElemClasses();
  }, [selectedYear]);

  // Construct blank mappings for roster
  const constructRosterMappings = React.useCallback((
    batchId: string,
    batchJudul: string,
    batchKeterangan: string,
    studentsRoster: Student[]
  ): OtherReportMapping[] => {
    const classList = classesListRef.current.length > 0 ? classesListRef.current : classesList;
    const selectedClassObj = classList.find(c => c.id === selectedClassId);
    return (studentsRoster || []).map(student => ({
      id: student.id,
      studentId: student.id,
      studentNameSnapshot: student.name,
      nisSnapshot: student.id || student.nis || '',
      nisnSnapshot: student.nisn || '',
      classId: selectedClassId,
      classNameSnapshot: selectedClassObj?.name || '',
      academicYear: selectedYear,
      semester: selectedSemester,
      batchId: batchId,
      judul: batchJudul,
      keterangan: batchKeterangan,
      fileName: '',
      fileId: '',
      driveUrl: '',
      status: 'Belum ada PDF' as const,
      matchedBy: 'NONE' as const
    }));
  }, [classesList, selectedClassId, selectedYear, selectedSemester]);

  // Load batch items from Firestore using batchId as primary key
  const loadBatchDocuments = React.useCallback(async (
    targetBatchId: string,
    targetJudul: string,
    targetKeterangan: string,
    studentsRoster: Student[]
  ) => {
    if (!targetBatchId || targetBatchId === 'NEW') return null;
    setLoadingSaved(true);
    setErrorMessage(null);
    setErrorIndexUrl(null);

    try {
      // Primary key query using batchId on elem_other_report_links
      const q = query(
        collection(db, 'elem_other_report_links'),
        where('batchId', '==', targetBatchId)
      );
      const snap = await getDocs(q);
      const savedDocs = snap.docs.map(docSnap => ({
        docId: docSnap.id,
        ...docSnap.data()
      } as any));

      let effJudul = targetJudul;
      let effKeterangan = targetKeterangan;

      if (savedDocs.length > 0) {
        const firstWithJudul = savedDocs.find(d => d.judul);
        if (firstWithJudul) {
          if (firstWithJudul.judul) {
            effJudul = firstWithJudul.judul;
          }
          if (firstWithJudul.keterangan !== undefined) {
            effKeterangan = firstWithJudul.keterangan || '';
          }
        }
      }

      const activeRoster = studentsRoster && studentsRoster.length > 0 ? studentsRoster : rosterRef.current;
      const classList = classesListRef.current.length > 0 ? classesListRef.current : classesList;
      const selectedClassObj = classList.find(c => c.id === selectedClassId);

      // Merge results with class roster based on studentId
      const newMappings: OtherReportMapping[] = (activeRoster || []).map(student => {
        const saved = findStudentMatch(student, savedDocs);

        if (saved) {
          const fileId = saved.driveFileId || saved.fileId || '';
          return {
            id: student.id,
            studentId: student.id,
            studentNameSnapshot: saved.studentNameSnapshot || student.name,
            nisSnapshot: student.id || student.nis || '',
            nisnSnapshot: saved.nisn || student.nisn || '',
            classId: selectedClassId,
            classNameSnapshot: selectedClassObj?.name || saved.classNameSnapshot || '',
            academicYear: saved.academicYear || selectedYear,
            semester: String(saved.semester || selectedSemester),
            batchId: targetBatchId,
            judul: saved.judul || effJudul,
            keterangan: saved.keterangan || effKeterangan,
            fileName: saved.fileName || '',
            fileId: fileId,
            driveUrl: saved.driveFileUrl || saved.driveUrl || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : ''),
            status: fileId ? 'Cocok' : 'Belum ada PDF',
            matchedBy: saved.matchedBy || 'STUDENT_ID',
            dbStatus: saved.status || 'DRAFT',
            isOpened: saved.isOpened || false,
            firstOpenedAt: saved.firstOpenedAt || null,
            lastOpenedAt: saved.lastOpenedAt || null,
            openCount: saved.openCount || 0,
            openedByEmail: saved.openedByEmail || ''
          };
        } else {
          return {
            id: student.id,
            studentId: student.id,
            studentNameSnapshot: student.name,
            nisSnapshot: student.id || student.nis || '',
            nisnSnapshot: student.nisn || '',
            classId: selectedClassId,
            classNameSnapshot: selectedClassObj?.name || '',
            academicYear: selectedYear,
            semester: selectedSemester,
            batchId: targetBatchId,
            judul: effJudul,
            keterangan: effKeterangan,
            fileName: '',
            fileId: '',
            driveUrl: '',
            status: 'Belum ada PDF',
            matchedBy: 'NONE'
          };
        }
      });

      setMappings(newMappings);
      return { effJudul, effKeterangan, count: savedDocs.length };
    } catch (err: any) {
      console.error('[ElemOtherReport] Error loading batch documents:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
      toast.error(`Gagal memuat dokumen batch: ${msg}`);
      return null;
    } finally {
      setLoadingSaved(false);
    }
  }, [classesList, selectedClassId, selectedYear, selectedSemester]);

  // Load existing batches for selected class, year, and semester
  const loadExistingBatches = React.useCallback(async (
    targetClassId: string,
    targetYear: string,
    targetSemester: string
  ): Promise<BatchSummary[]> => {
    if (!targetClassId) {
      setExistingBatches([]);
      return [];
    }

    setLoadingBatches(true);
    setErrorMessage(null);
    setErrorIndexUrl(null);

    try {
      // Query documents by classId (canonical class ID)
      const q = query(
        collection(db, 'elem_other_report_links'),
        where('classId', '==', targetClassId)
      );
      const snap = await getDocs(q);

      // In-memory filter for year & semester to prevent format mismatches ("2026/2027" vs "2026-2027")
      const matchingDocs = snap.docs.filter(d => {
        const data = d.data();
        return isYearMatch(data.academicYear, targetYear) &&
               isSemesterMatch(data.semester, targetSemester);
      });

      const batchMap = new Map<string, BatchSummary>();
      matchingDocs.forEach(d => {
        const data = d.data();
        const bId = data.batchId;
        if (!bId) return;

        if (!batchMap.has(bId)) {
          batchMap.set(bId, {
            batchId: bId,
            judul: data.judul || 'Tanpa Judul',
            judulNormalized: data.judulNormalized || normalizeJudul(data.judul || ''),
            keterangan: data.keterangan || '',
            status: data.status || 'DRAFT',
            docCount: 1
          });
        } else {
          const existing = batchMap.get(bId)!;
          existing.docCount += 1;
          if (data.status === 'PUBLISHED') {
            existing.status = 'PUBLISHED';
          }
        }
      });

      const batchList = Array.from(batchMap.values());
      setExistingBatches(batchList);
      return batchList;
    } catch (err: any) {
      console.error('[ElemOtherReport] Error loading existing batches:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
      toast.error(`Gagal memuat batch: ${msg}`);
      return [];
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  // Load roster and batches when context changes (class, year, semester)
  React.useEffect(() => {
    let isCancelled = false;

    const syncContext = async () => {
      if (!selectedClassId || !selectedYear) return;
      setLoadingRoster(true);
      setErrorMessage(null);
      setErrorIndexUrl(null);

      try {
        const studentsList = await getActiveStudents(selectedClassId, selectedYear);
        if (isCancelled) return;

        const sortedRoster = (studentsList || []).sort((a, b) => {
          const numA = a.attendanceNumber ?? a.noAbsen ?? a.rollNumber ?? a.rosterNumber ?? 999;
          const numB = b.attendanceNumber ?? b.noAbsen ?? b.rollNumber ?? b.rosterNumber ?? 999;
          if (numA !== numB) return numA - numB;
          return a.name.localeCompare(b.name);
        });

        rosterRef.current = sortedRoster;
        setRoster(sortedRoster);

        const batchList = await loadExistingBatches(selectedClassId, selectedYear, selectedSemester);
        if (isCancelled) return;

        if (batchList.length > 0) {
          const firstBatch = batchList[0];
          setSelectedBatchId(firstBatch.batchId);
          setInputJudul(firstBatch.judul);
          setInputKeterangan(firstBatch.keterangan || '');
          const res = await loadBatchDocuments(firstBatch.batchId, firstBatch.judul, firstBatch.keterangan || '', sortedRoster);
          if (res && res.effJudul) {
            setInputJudul(res.effJudul);
            if (res.effKeterangan !== undefined) setInputKeterangan(res.effKeterangan);
          }
        } else {
          setSelectedBatchId('NEW');
          setInputJudul('');
          setInputKeterangan('');
          setMappings(constructRosterMappings('', '', '', sortedRoster));
        }
      } catch (err: any) {
        if (isCancelled) return;
        console.error('[ElemOtherReport] Error syncing class context:', err);
        const msg = err?.message || String(err);
        setErrorMessage(msg);
        const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
        if (match) {
          setErrorIndexUrl(match[0]);
        }
        toast.error(`Gagal memuat data kelas: ${msg}`);
      } finally {
        if (!isCancelled) setLoadingRoster(false);
      }
    };

    syncContext();

    return () => {
      isCancelled = true;
    };
  }, [selectedClassId, selectedYear, selectedSemester, loadExistingBatches, loadBatchDocuments, constructRosterMappings]);

  // Calculate effective judul and activeBatchId
  const effectiveJudul = selectedBatchId === 'NEW' 
    ? inputJudul.trim() 
    : (inputJudul.trim() || existingBatches.find(b => b.batchId === selectedBatchId)?.judul || '');

  const effectiveKeterangan = selectedBatchId === 'NEW'
    ? inputKeterangan.trim()
    : (inputKeterangan.trim() || existingBatches.find(b => b.batchId === selectedBatchId)?.keterangan || '');

  const currentJudulNormalized = normalizeJudul(effectiveJudul);

  const activeBatchId = React.useMemo(() => {
    if (selectedBatchId && selectedBatchId !== 'NEW') {
      return selectedBatchId;
    }
    if (!currentJudulNormalized || !selectedClassId) return '';
    const yearNorm = normalizeYear(selectedYear);
    const slug = judulToBatchSlug(currentJudulNormalized);
    return `${yearNorm}_sem${selectedSemester}_${selectedClassId}_${slug}`;
  }, [selectedBatchId, currentJudulNormalized, selectedYear, selectedSemester, selectedClassId]);

  // Real-time listener for current active batch (does NOT modify input fields)
  React.useEffect(() => {
    if (!selectedBatchId || selectedBatchId === 'NEW' || roster.length === 0) return;

    const q = query(
      collection(db, 'elem_other_report_links'),
      where('batchId', '==', selectedBatchId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const savedDocs = snapshot.docs.map(docSnap => ({
        docId: docSnap.id,
        ...docSnap.data()
      } as any));

      const classList = classesListRef.current.length > 0 ? classesListRef.current : classesList;
      const selectedClassObj = classList.find(c => c.id === selectedClassId);

      setMappings(prev => {
        return roster.map(student => {
          const saved = findStudentMatch(student, savedDocs);
          if (saved) {
            const fileId = saved.driveFileId || saved.fileId || '';
            return {
              id: student.id,
              studentId: student.id,
              studentNameSnapshot: saved.studentNameSnapshot || student.name,
              nisSnapshot: student.id || student.nis || '',
              nisnSnapshot: saved.nisn || student.nisn || '',
              classId: selectedClassId,
              classNameSnapshot: selectedClassObj?.name || saved.classNameSnapshot || '',
              academicYear: saved.academicYear || selectedYear,
              semester: String(saved.semester || selectedSemester),
              batchId: selectedBatchId,
              judul: saved.judul || effectiveJudul,
              keterangan: saved.keterangan || effectiveKeterangan,
              fileName: saved.fileName || '',
              fileId: fileId,
              driveUrl: saved.driveFileUrl || saved.driveUrl || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : ''),
              status: fileId ? 'Cocok' : 'Belum ada PDF',
              matchedBy: saved.matchedBy || 'STUDENT_ID',
              dbStatus: saved.status || 'DRAFT',
              isOpened: saved.isOpened || false,
              firstOpenedAt: saved.firstOpenedAt || null,
              lastOpenedAt: saved.lastOpenedAt || null,
              openCount: saved.openCount || 0,
              openedByEmail: saved.openedByEmail || ''
            };
          } else {
            const localEntry = prev.find(p => p.studentId === student.id);
            if (localEntry && localEntry.fileId && !localEntry.dbStatus) {
              return localEntry;
            }
            return {
              id: student.id,
              studentId: student.id,
              studentNameSnapshot: student.name,
              nisSnapshot: student.id || student.nis || '',
              nisnSnapshot: student.nisn || '',
              classId: selectedClassId,
              classNameSnapshot: selectedClassObj?.name || '',
              academicYear: selectedYear,
              semester: selectedSemester,
              batchId: selectedBatchId,
              judul: effectiveJudul,
              keterangan: effectiveKeterangan,
              fileName: '',
              fileId: '',
              driveUrl: '',
              status: 'Belum ada PDF',
              matchedBy: 'NONE'
            };
          }
        });
      });
    }, (err: any) => {
      console.error('[ElemOtherReport] onSnapshot error:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedBatchId, selectedClassId, roster]);

  // Handle switching batch selection
  const handleSelectBatch = async (batchId: string) => {
    if (batchId === 'NEW') {
      setSelectedBatchId('NEW');
      setInputJudul('');
      setInputKeterangan('');
      setMappings(constructRosterMappings('', '', '', rosterRef.current));
    } else {
      setSelectedBatchId(batchId);
      const found = existingBatches.find(b => b.batchId === batchId);
      const bJudul = found?.judul || '';
      const bKet = found?.keterangan || '';
      setInputJudul(bJudul);
      setInputKeterangan(bKet);
      const res = await loadBatchDocuments(batchId, bJudul, bKet, rosterRef.current);
      if (res && res.effJudul) {
        setInputJudul(res.effJudul);
        if (res.effKeterangan !== undefined) setInputKeterangan(res.effKeterangan);
      }
    }
  };

  // Bulk Paste Parsing & Auto-Matching
  const handlePreviewAndMatch = () => {
    if (!effectiveJudul.trim()) {
      toast.error('Silakan isi Judul Rapor terlebih dahulu sebelum mencocokkan data.');
      return;
    }

    if (!pasteText.trim()) {
      toast.error('Silakan paste data dari Google Sheets terlebih dahulu.');
      return;
    }

    // Check duplicate batch judul on the same context if NEW
    if (selectedBatchId === 'NEW') {
      const duplicateBatch = existingBatches.find(
        b => b.judulNormalized === currentJudulNormalized
      );
      if (duplicateBatch) {
        toast.info(`Ditemukan batch yang sudah ada dengan judul "${duplicateBatch.judul}". Mengalihkan ke batch tersebut...`);
        setSelectedBatchId(duplicateBatch.batchId);
        setInputJudul(duplicateBatch.judul);
        setInputKeterangan(duplicateBatch.keterangan || '');
        return;
      }
    }

    const lines = pasteText.split('\n');
    const parsedRows: { fileName: string; fileId: string }[] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let fileName = '';
      let fileId = '';

      if (trimmed.includes('\t')) {
        const parts = trimmed.split('\t');
        fileName = parts[0].trim();
        fileId = parts[parts.length - 1].trim();
      } else if (trimmed.includes(',')) {
        const parts = trimmed.split(',');
        fileId = parts[parts.length - 1].trim();
        fileName = parts.slice(0, -1).join(',').trim();
      } else {
        fileName = trimmed;
        fileId = '';
      }

      if (fileName || fileId) {
        parsedRows.push({ fileName, fileId });
      }
    });

    if (parsedRows.length === 0) {
      toast.error('Tidak ada baris data valid yang terbaca.');
      return;
    }

    const selectedClassObj = classesList.find(c => c.id === selectedClassId);
    const updatedMappings = [...mappings];
    const unmatchedRows: OtherReportMapping[] = [];

    parsedRows.forEach((row, idx) => {
      const cf = cleanName(row.fileName);

      // Match against the current roster
      const matchedStudents = roster.filter(student => {
        const cs = cleanName(student.name);
        if (cf === cs) return true;
        
        // Check hyphen / underscore split
        const parts = row.fileName.split(/[-–—_]/).map(p => cleanName(p));
        if (parts.some(p => p === cs)) return true;

        // Substring match
        if (cf.includes(cs) || cs.includes(cf)) return true;

        return false;
      });

      if (matchedStudents.length === 1) {
        const student = matchedStudents[0];
        const existIdx = updatedMappings.findIndex(m => isStudentIdMatch(m.studentId, student));
        if (existIdx !== -1) {
          updatedMappings[existIdx] = {
            ...updatedMappings[existIdx],
            fileName: row.fileName,
            fileId: row.fileId,
            driveUrl: row.fileId ? `https://drive.google.com/file/d/${row.fileId}/view` : '',
            status: 'Cocok',
            matchedBy: 'NAME_AND_CLASS',
            judul: effectiveJudul,
            keterangan: inputKeterangan
          };
        }
      } else {
        // Unmatched/Duplicate Row
        unmatchedRows.push({
          id: `unmatched_${idx}_${Date.now()}`,
          studentId: '',
          studentNameSnapshot: '',
          nisSnapshot: '',
          classId: selectedClassId,
          classNameSnapshot: selectedClassObj?.name || '',
          academicYear: selectedYear,
          semester: selectedSemester,
          batchId: activeBatchId,
          judul: effectiveJudul,
          keterangan: inputKeterangan,
          fileName: row.fileName,
          fileId: row.fileId,
          driveUrl: row.fileId ? `https://drive.google.com/file/d/${row.fileId}/view` : '',
          status: matchedStudents.length > 1 ? 'Duplikat' : 'Tidak ditemukan',
          matchedBy: 'NONE'
        });
      }
    });

    setMappings([...updatedMappings, ...unmatchedRows]);
    toast.success(`Berhasil mencocokkan ${parsedRows.length} baris data.`);
  };

  // Editable File ID Change
  const handleFileIdChange = (mappingId: string, newFileId: string) => {
    setMappings(prev => prev.map(m => {
      if (m.id === mappingId) {
        const cleanFileId = newFileId.trim();
        const status = m.studentId 
          ? (cleanFileId ? 'Cocok' : 'Belum ada PDF') 
          : (cleanFileId ? m.status : 'Tidak ditemukan');
        return {
          ...m,
          fileId: cleanFileId,
          driveUrl: cleanFileId ? `https://drive.google.com/file/d/${cleanFileId}/view` : '',
          status: status as any
        };
      }
      return m;
    }));
  };

  // Manual mapping of unmatched row
  const handleManualMatch = (mappingId: string, targetStudentId: string) => {
    const studentObj = roster.find(s => s.id === targetStudentId);
    if (!studentObj) return;

    setMappings(prev => {
      // 1. Remove empty placeholder row for this student if present
      const filtered = prev.filter(m => !(m.studentId === targetStudentId && !m.fileId));

      // 2. Update the unmatched row with student info
      return filtered.map(m => {
        if (m.id === mappingId) {
          return {
            ...m,
            studentId: studentObj.id,
            studentNameSnapshot: studentObj.name,
            nisSnapshot: studentObj.id || studentObj.nis || '',
            nisnSnapshot: studentObj.nisn || '',
            status: 'Cocok' as const,
            matchedBy: 'MANUAL' as const
          };
        }
        return m;
      });
    });
    toast.success(`Berhasil memetakan manual ke ${studentObj.name}`);
  };

  // Remove individual mapping
  const handleRemoveMapping = async (mappingId: string) => {
    const target = mappings.find(m => m.id === mappingId);
    if (!target) return;

    const studentName = target.studentNameSnapshot || 'Siswa';
    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus link rapor untuk "${studentName}"?`
    );
    if (!confirmDelete) return;

    try {
      if (target.studentId && target.dbStatus && activeBatchId) {
        const studentIdKey = String(target.studentId).trim();
        const docId = `${activeBatchId}_${studentIdKey}`;
        const ref = doc(db, 'elem_other_report_links', docId);
        await deleteDoc(ref);
        toast.success(`Berhasil menghapus rapor "${studentName}" dari database.`);
        await loadExistingBatches(selectedClassId, selectedYear, selectedSemester);
        await loadBatchDocuments(activeBatchId, effectiveJudul, inputKeterangan.trim(), rosterRef.current);
      } else {
        toast.success('Berhasil melepaskan pemetaan file.');
      }

      setMappings(prev => prev.map(m => {
        if (m.id === mappingId) {
          return {
            ...m,
            fileId: '',
            fileName: '',
            driveUrl: '',
            status: m.studentId ? 'Belum ada PDF' : ('Tidak ditemukan' as const),
            matchedBy: 'NONE' as const,
            dbStatus: undefined
          };
        }
        return m;
      }));
    } catch (err: any) {
      console.error('Error deleting other report link:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
      toast.error(`Gagal menghapus link rapor: ${msg}`);
    }
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    if (!effectiveJudul.trim()) {
      toast.error('Judul Rapor wajib diisi.');
      return;
    }

    if (!activeBatchId) {
      toast.error('Konteks kelas atau judul rapor belum lengkap.');
      return;
    }

    const validRows = mappings.filter(m => m.studentId && m.fileId);
    if (validRows.length === 0) {
      toast.error('Tidak ada mapping valid (siswa + File ID) untuk disimpan.');
      return;
    }

    setIsSaving(true);
    const batch = writeBatch(db);

    try {
      let targetClassName = '';
      try {
        const classSnap = await getDoc(doc(db, 'classes', selectedClassId));
        if (classSnap.exists()) {
          targetClassName = classSnap.data().name || '';
        }
      } catch (e) {
        console.warn("Could not fetch class name snapshot directly from db:", e);
      }
      if (!targetClassName) {
        const classList = classesListRef.current.length > 0 ? classesListRef.current : classesList;
        const selectedClassObj = classList.find(c => c.id === selectedClassId);
        targetClassName = selectedClassObj?.name || '';
      }

      validRows.forEach(row => {
        const studentIdKey = String(row.studentId).trim();
        const docId = `${activeBatchId}_${studentIdKey}`;
        const ref = doc(db, 'elem_other_report_links', docId);

        const fileId = row.fileId || '';
        const driveUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : '';

        const dataPayload: any = {
          batchId: activeBatchId,
          judul: effectiveJudul,
          judulNormalized: currentJudulNormalized,
          keterangan: inputKeterangan.trim() || '',
          academicYear: selectedYear,
          semester: selectedSemester,
          classId: selectedClassId,
          classNameSnapshot: targetClassName || row.classNameSnapshot || '',
          studentId: row.studentId,
          studentNameSnapshot: row.studentNameSnapshot,
          nisn: row.nisnSnapshot || '',
          driveFileId: fileId,
          driveFileUrl: driveUrl,
          fileName: row.fileName,
          status: 'DRAFT',
          matchedBy: row.matchedBy || 'STUDENT_ID',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff',
          // initialize tracking fields if not present
          isOpened: row.isOpened || false,
          firstOpenedAt: row.firstOpenedAt || null,
          lastOpenedAt: row.lastOpenedAt || null,
          openCount: row.openCount || 0,
          openedByEmail: row.openedByEmail || ''
        };

        if (!row.dbStatus) {
          dataPayload.createdAt = serverTimestamp();
          dataPayload.createdBy = currentUser?.email || currentUser?.uid || 'staff';
        }

        batch.set(ref, dataPayload, { merge: true });
      });

      await batch.commit();
      toast.success('Draft batch berhasil disimpan!');

      const savedBatchId = activeBatchId;
      setSelectedBatchId(savedBatchId);

      await loadExistingBatches(selectedClassId, selectedYear, selectedSemester);
      await loadBatchDocuments(savedBatchId, effectiveJudul, inputKeterangan.trim(), rosterRef.current);
    } catch (err: any) {
      console.error('Error saving draft:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
      toast.error(`Gagal menyimpan draft: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Publish validation & confirmation
  const handlePublishClick = () => {
    if (!effectiveJudul.trim()) {
      toast.error('Judul Rapor wajib diisi.');
      return;
    }

    const validCount = mappings.filter(m => m.studentId && m.fileId).length;
    if (validCount === 0) {
      toast.error('Tidak ada mapping cocok untuk dipublikasikan.');
      return;
    }

    const unresolvedCount = mappings.filter(m => !m.studentId && m.fileId).length;
    if (unresolvedCount > 0) {
      setShowUnresolvedModal(true);
    } else {
      const confirmPub = window.confirm(`Apakah Anda yakin ingin mempublikasikan tautan rapor "${effectiveJudul}" untuk ${validCount} siswa?`);
      if (confirmPub) {
        executePublish(validCount);
      }
    }
  };

  const executePublish = async (validCount: number) => {
    const validRows = mappings.filter(m => m.studentId && m.fileId);
    setIsPublishing(true);
    const batch = writeBatch(db);

    try {
      let targetClassName = '';
      try {
        const classSnap = await getDoc(doc(db, 'classes', selectedClassId));
        if (classSnap.exists()) {
          targetClassName = classSnap.data().name || '';
        }
      } catch (e) {
        console.warn("Could not fetch class name snapshot directly from db:", e);
      }
      if (!targetClassName) {
        const classList = classesListRef.current.length > 0 ? classesListRef.current : classesList;
        const selectedClassObj = classList.find(c => c.id === selectedClassId);
        targetClassName = selectedClassObj?.name || '';
      }

      validRows.forEach(row => {
        const studentIdKey = String(row.studentId).trim();
        const docId = `${activeBatchId}_${studentIdKey}`;
        const ref = doc(db, 'elem_other_report_links', docId);

        const fileId = row.fileId || '';
        const driveUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : '';

        const dataPayload: any = {
          batchId: activeBatchId,
          judul: effectiveJudul,
          judulNormalized: currentJudulNormalized,
          keterangan: inputKeterangan.trim() || '',
          academicYear: selectedYear,
          semester: selectedSemester,
          classId: selectedClassId,
          classNameSnapshot: targetClassName || row.classNameSnapshot || '',
          studentId: row.studentId,
          studentNameSnapshot: row.studentNameSnapshot,
          nisn: row.nisnSnapshot || '',
          driveFileId: fileId,
          driveFileUrl: driveUrl,
          fileName: row.fileName,
          status: 'PUBLISHED',
          matchedBy: row.matchedBy || 'STUDENT_ID',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff',
          publishedAt: serverTimestamp(),
          publishedBy: currentUser?.email || currentUser?.uid || 'staff',
          publishedByName: currentUser?.displayName || currentUser?.email || 'Elementary Teacher',
          // preserve tracking
          isOpened: row.isOpened || false,
          firstOpenedAt: row.firstOpenedAt || null,
          lastOpenedAt: row.lastOpenedAt || null,
          openCount: row.openCount || 0,
          openedByEmail: row.openedByEmail || ''
        };

        if (!row.dbStatus) {
          dataPayload.createdAt = serverTimestamp();
          dataPayload.createdBy = currentUser?.email || currentUser?.uid || 'staff';
        }

        batch.set(ref, dataPayload, { merge: true });
      });

      await batch.commit();
      toast.success(`Rapor "${effectiveJudul}" berhasil dipublikasikan untuk ${validCount} siswa!`);
      setShowUnresolvedModal(false);

      const publishedBatchId = activeBatchId;
      setSelectedBatchId(publishedBatchId);

      await loadExistingBatches(selectedClassId, selectedYear, selectedSemester);
      await loadBatchDocuments(publishedBatchId, effectiveJudul, inputKeterangan.trim(), rosterRef.current);
    } catch (err: any) {
      console.error('Error publishing:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
      toast.error(`Gagal mempublikasikan rapor: ${msg}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Action: Tarik / Batalkan Publikasi
  const handleUnpublishBatch = async () => {
    if (!activeBatchId) return;
    const publishedRows = mappings.filter(m => m.studentId && m.fileId && m.dbStatus === 'PUBLISHED');
    if (publishedRows.length === 0) {
      toast.info('Tidak ada rapor berstatus terpublikasi dalam batch ini.');
      return;
    }

    const confirmUnpub = window.confirm(
      `Apakah Anda yakin ingin menarik/membatalkan publikasi batch "${effectiveJudul}"? Siswa tidak akan dapat lagi melihat rapor ini di portal.`
    );
    if (!confirmUnpub) return;

    setIsUnpublishing(true);
    const batch = writeBatch(db);

    try {
      publishedRows.forEach(row => {
        const studentIdKey = String(row.studentId).trim();
        const docId = `${activeBatchId}_${studentIdKey}`;
        const ref = doc(db, 'elem_other_report_links', docId);
        batch.update(ref, {
          status: 'UNPUBLISHED',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff'
        });
      });

      await batch.commit();
      toast.success(`Publikasi batch "${effectiveJudul}" berhasil ditarik.`);
      await loadExistingBatches(selectedClassId, selectedYear, selectedSemester);
      await loadBatchDocuments(activeBatchId, effectiveJudul, inputKeterangan.trim(), rosterRef.current);
    } catch (err: any) {
      console.error('Error unpublishing batch:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
      toast.error(`Gagal menarik publikasi batch: ${msg}`);
    } finally {
      setIsUnpublishing(false);
    }
  };

  // Action: Arsipkan Batch
  const handleArchiveBatch = async () => {
    if (!activeBatchId) return;
    const savedRows = mappings.filter(m => m.studentId && m.fileId && m.dbStatus);
    if (savedRows.length === 0) {
      toast.info('Belum ada dokumen tersimpan di database dalam batch ini.');
      return;
    }

    const confirmArch = window.confirm(
      `Apakah Anda yakin ingin mengarsipkan batch "${effectiveJudul}"?`
    );
    if (!confirmArch) return;

    setIsArchiving(true);
    const batch = writeBatch(db);

    try {
      savedRows.forEach(row => {
        const studentIdKey = String(row.studentId).trim();
        const docId = `${activeBatchId}_${studentIdKey}`;
        const ref = doc(db, 'elem_other_report_links', docId);
        batch.update(ref, {
          status: 'ARCHIVED',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff'
        });
      });

      await batch.commit();
      toast.success(`Batch "${effectiveJudul}" berhasil diarsipkan.`);
      await loadExistingBatches(selectedClassId, selectedYear, selectedSemester);
      await loadBatchDocuments(activeBatchId, effectiveJudul, inputKeterangan.trim(), rosterRef.current);
    } catch (err: any) {
      console.error('Error archiving batch:', err);
      const msg = err?.message || String(err);
      setErrorMessage(msg);
      const match = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)"]+/);
      if (match) {
        setErrorIndexUrl(match[0]);
      }
      toast.error(`Gagal mengarsipkan batch: ${msg}`);
    } finally {
      setIsArchiving(false);
    }
  };

  // Clear paste text
  const handleClearPaste = () => {
    setPasteText('');
  };

  // Filter mappings for table rendering
  const filteredMappings = React.useMemo(() => {
    return mappings.filter(m => {
      const q = searchQuery.toLowerCase();
      return (
        m.studentNameSnapshot.toLowerCase().includes(q) ||
        m.fileName.toLowerCase().includes(q) ||
        m.fileId.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
      );
    });
  }, [mappings, searchQuery]);

  // Statistics
  const stats = React.useMemo(() => {
    const total = roster.length;
    const cocok = mappings.filter(m => m.studentId && m.fileId && (m.status === 'Cocok' || m.dbStatus)).length;
    const draft = mappings.filter(m => m.studentId && m.fileId && m.dbStatus === 'DRAFT').length;
    const published = mappings.filter(m => m.studentId && m.fileId && m.dbStatus === 'PUBLISHED').length;
    const pending = mappings.filter(m => m.studentId && !m.fileId).length;
    const unresolved = mappings.filter(m => !m.studentId && m.fileId).length;
    const viewed = mappings.filter(m => m.studentId && m.isOpened).length;

    return { total, cocok, draft, published, pending, unresolved, viewed };
  }, [mappings, roster]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Breadcrumb / Title */}
      <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-400">
            <span>Elementary Staff</span>
            <ArrowRight size={10} className="text-slate-300" />
            <span className="text-slate-600">Other Reports</span>
          </div>
          <h1 className="text-3xl font-black italic uppercase text-slate-900 mt-1">
            Other Report
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Distribusi dan monitoring tautan rapor umum/khusus (seperti Progression Test, Portfolio, dll.) menggunakan link Google Drive.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3 text-xs shadow-xs">
          <AlertCircle size={18} className="shrink-0 text-red-500 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold uppercase tracking-wider">Terjadi Kendala Memuat Data Firestore</div>
            <div className="font-mono text-[11px] break-all">{errorMessage}</div>
            {errorIndexUrl && (
              <div>
                <a
                  href={errorIndexUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline font-semibold mt-1"
                >
                  Buat Composite Index di Firebase Console <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter & Batch Parameters */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-2">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-blue-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
              Sesi, Kelas & Judul Rapor
            </h2>
          </div>
          {selectedBatchId !== 'NEW' && (
            <button
              onClick={() => handleSelectBatch('NEW')}
              className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
            >
              <Plus size={14} /> Buat Judul Baru
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Tahun Akademik
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-xs rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 py-2 bg-slate-50 font-semibold"
            >
              <option value="2026/2027">2026/2027</option>
              <option value="2025/2026">2025/2026</option>
              <option value="2024/2025">2024/2025</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Semester
            </label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full text-xs rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 py-2 bg-slate-50 font-semibold"
            >
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Kelas Elementary
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              disabled={loadingClasses}
              className="w-full text-xs rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 py-2 bg-slate-50 font-semibold"
            >
              {loadingClasses ? (
                <option>Memuat kelas...</option>
              ) : classesList.length === 0 ? (
                <option>Tidak ada kelas aktif</option>
              ) : (
                classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Pilihan Batch
            </label>
            <select
              value={selectedBatchId}
              onChange={(e) => handleSelectBatch(e.target.value)}
              disabled={loadingBatches}
              className="w-full text-xs rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 py-2 bg-slate-50 font-semibold"
            >
              <option value="NEW">+ Buat Judul Baru...</option>
              {existingBatches.map(b => (
                <option key={b.batchId} value={b.batchId}>
                  {b.judul} ({b.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Judul & Keterangan Inputs */}
        <div className="pt-2 border-t border-slate-50 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
              Judul Rapor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              maxLength={80}
              value={inputJudul}
              onChange={(e) => setInputJudul(e.target.value)}
              placeholder="Contoh: Progression Test 1, Cambridge Checkpoint, Portfolio, dll."
              className="w-full text-xs rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 py-2 px-3 bg-slate-50/50 font-bold text-slate-800"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Maksimal 80 karakter. Judul akan tampil di kartu Rapor Saya siswa.
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
              Keterangan Singkat (Opsional)
            </label>
            <input
              type="text"
              maxLength={120}
              value={inputKeterangan}
              onChange={(e) => setInputKeterangan(e.target.value)}
              placeholder="Contoh: Penilaian kurikulum Cambridge term ganjil"
              className="w-full text-xs rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 py-2 px-3 bg-slate-50/50 text-slate-700 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Roster & Paste Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Paste Area (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm h-full flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                <div className="flex items-center gap-1.5">
                  <FileText size={16} className="text-indigo-600" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Paste Data Rapor
                  </h3>
                </div>
                {pasteText && (
                  <button 
                    onClick={handleClearPaste}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Copy kolom <strong>Nama File</strong> dan <strong>File ID</strong> dari Google Sheets, lalu paste ke kotak di bawah. Format dipisahkan oleh tombol <kbd className="bg-slate-100 px-1 rounded">TAB</kbd> atau koma.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Progression Test 1 - Umar Qomaruzzaman\t19-dL0nLdFreh2ITYO_3WcE0mUU1k5LmB\nProgression Test 1 - Aisha Zahra\t14nSHsi-PybvmH9DwyTD5XUahiX3JjaY0"}
                className="w-full h-64 text-xs font-mono rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 bg-slate-50/50 p-3"
              />
            </div>
            <button
              onClick={handlePreviewAndMatch}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-xs mt-4 flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw size={13} />
              Preview & Cocokkan
            </button>
          </div>
        </div>

        {/* Dashboard/Roster Metrics (8 cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Roster Aktif</span>
              <span className="text-2xl font-black text-slate-900 mt-1">{stats.total} Siswa</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tautan Cocok</span>
              <span className="text-2xl font-black text-emerald-600 mt-1">{stats.cocok} Tautan</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Draft Disimpan</span>
              <span className="text-2xl font-black text-amber-500 mt-1">{stats.draft} Draft</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Terpublikasi</span>
              <span className="text-2xl font-black text-blue-600 mt-1">{stats.published} Aktif</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200/60 p-4 flex items-start gap-3">
            <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-800">Manajemen Rapor Berbasis Batch Mandiri</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Setiap judul rapor adalah batch independen. Anda dapat membuat banyak judul rapor berbeda (misalnya Progression Test 1, Progression Test 2) untuk kelas yang sama. Siswa hanya dapat melihat rapor yang berstatus <strong>PUBLISHED</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Review & Edit Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-5 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Pratinjau Hasil Pemetaan: {effectiveJudul || '(Belum Ada Judul)'} ({filteredMappings.length} Baris)
              </h3>
            </div>
            <div className="w-full sm:w-72 relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Cari nama siswa, file, status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-1.5 rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex border-b border-slate-100 gap-2">
            <button
              onClick={() => setActiveTab('mapping')}
              className={`py-2 px-4 font-black uppercase text-[10px] tracking-widest border-b-2 transition-all cursor-pointer ${
                activeTab === 'mapping'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Kelola Pemetaan File
            </button>
            <button
              onClick={() => setActiveTab('tracking')}
              className={`py-2 px-4 font-black uppercase text-[10px] tracking-widest border-b-2 transition-all cursor-pointer ${
                activeTab === 'tracking'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Pantau Riwayat Rapor Dilihat (Tracking)
            </button>
          </div>
        </div>

        {/* Unified Table */}
        <div className="overflow-x-auto">
          {loadingRoster || loadingSaved ? (
            <div className="p-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
              <RefreshCw className="animate-spin" size={16} />
              Memuat data pratinjau...
            </div>
          ) : filteredMappings.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
              Belum ada data roster siswa atau pemetaan untuk kelas yang dipilih.
            </div>
          ) : activeTab === 'mapping' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-3 px-4 w-12 text-center">No.</th>
                  <th className="py-3 px-4 w-60">Nama Siswa</th>
                  <th className="py-3 px-4 w-32">NIS</th>
                  <th className="py-3 px-4">File PDF & ID</th>
                  <th className="py-3 px-4 w-48">Pencocokan / Aksi Guru</th>
                  <th className="py-3 px-4 w-40">Status</th>
                  <th className="py-3 px-4 w-12 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {filteredMappings.map((m, idx) => {
                  const hasFileId = !!m.fileId;
                  const isMatched = !!m.studentId;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-400">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {isMatched ? (
                          m.studentNameSnapshot
                        ) : (
                          <span className="text-slate-400 italic font-medium flex items-center gap-1">
                            <AlertCircle size={12} className="text-amber-500" />
                            Belum Terhubung
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-500">{m.nisSnapshot || '-'}</td>
                      <td className="py-3.5 px-4 space-y-1">
                        <div className="flex flex-col gap-1.5">
                          {m.fileName && (
                            <span className="text-[11px] font-medium text-slate-600 block max-w-sm truncate">
                              File: {m.fileName}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={m.fileId}
                              onChange={(e) => handleFileIdChange(m.id, e.target.value)}
                              placeholder="Google Drive File ID"
                              className="text-[11px] font-mono border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded px-2 py-0.5 w-64 bg-slate-50/50"
                            />
                            {hasFileId && (
                              <a
                                href={m.driveUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded text-[10px] shrink-0 transition-colors"
                              >
                                Lihat PDF
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {!isMatched ? (
                          <div className="space-y-1">
                            <label className="block text-[9px] font-black uppercase text-slate-400">Pilih Siswa Roster:</label>
                            <select
                              value=""
                              onChange={(e) => handleManualMatch(m.id, e.target.value)}
                              className="text-[10px] font-bold py-0.5 border-slate-200 rounded max-w-xs focus:ring-blue-500"
                            >
                              <option value="">-- Pilih Siswa --</option>
                              {roster.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 font-semibold">
                            {m.matchedBy === 'MANUAL' ? (
                              <span className="flex items-center gap-1 text-blue-600">
                                <CheckCircle2 size={12} /> Manual
                              </span>
                            ) : m.matchedBy === 'NONE' || !m.matchedBy ? (
                              <span className="text-slate-400">-</span>
                            ) : (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <Check size={12} /> {m.matchedBy === 'NAME_AND_CLASS' ? 'Auto-matched' : m.matchedBy === 'STUDENT_ID' ? 'ID Siswa' : m.matchedBy}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded w-fit ${
                            m.status === 'Cocok' 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : m.status === 'Belum ada PDF' 
                              ? 'bg-slate-100 text-slate-500' 
                              : m.status === 'Duplikat' 
                              ? 'bg-orange-50 text-orange-700' 
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {m.status}
                          </span>
                          {isMatched && m.dbStatus && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded w-fit ${
                              m.dbStatus === 'PUBLISHED' 
                                ? 'text-blue-600 border border-blue-200 bg-blue-50' 
                                : m.dbStatus === 'UNPUBLISHED'
                                ? 'text-gray-600 border border-gray-200 bg-gray-50'
                                : m.dbStatus === 'ARCHIVED'
                                ? 'text-purple-600 border border-purple-200 bg-purple-50'
                                : 'text-amber-600 border border-amber-200 bg-amber-50'
                            }`}>
                              {m.dbStatus}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {(m.fileName || m.fileId) && (
                          <button
                            onClick={() => handleRemoveMapping(m.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                            title="Hapus Pemetaan / Link"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-3 px-4 w-12 text-center">No.</th>
                  <th className="py-3 px-4 w-60">Siswa (Student)</th>
                  <th className="py-3 px-4 w-28">Status Rapor</th>
                  <th className="py-3 px-4 w-32">Status Dilihat</th>
                  <th className="py-3 px-4">Pertama Dilihat</th>
                  <th className="py-3 px-4">Terakhir Dilihat</th>
                  <th className="py-3 px-4 w-28 text-center">Frekuensi</th>
                  <th className="py-3 px-4 w-44">Akun Pengakses</th>
                  <th className="py-3 px-4 w-24 text-center">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {filteredMappings.map((m, idx) => {
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-400">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {m.studentNameSnapshot}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                          m.dbStatus === 'PUBLISHED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : m.dbStatus === 'UNPUBLISHED'
                            ? 'bg-gray-100 text-gray-600'
                            : m.dbStatus === 'ARCHIVED'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {m.dbStatus || 'DRAFT'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {m.isOpened ? (
                          <span className="inline-flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100">
                            <Check size={11} /> Sudah Dilihat
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 bg-slate-50 text-slate-400 rounded">
                            Belum Dilihat
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium text-[11px]">
                        {formatTrackingTime(m.firstOpenedAt)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium text-[11px]">
                        {formatTrackingTime(m.lastOpenedAt)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-slate-700 text-xs">
                          {m.openCount ? `${m.openCount}x` : '0'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px] truncate max-w-xs">
                        {m.openedByEmail || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {m.driveUrl ? (
                          <a
                            href={m.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold hover:underline text-[11px]"
                          >
                            <ExternalLink size={12} /> Buka
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] text-slate-500 font-semibold">
            Pastikan tautan PDF sudah diverifikasi ("Lihat PDF") sebelum dipublikasikan ke siswa.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Archive button */}
            <button
              onClick={handleArchiveBatch}
              disabled={isSaving || isPublishing || isArchiving || isUnpublishing || loadingRoster}
              className="bg-white hover:bg-slate-50 text-slate-600 font-bold border border-slate-200 py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="Arsipkan Batch"
            >
              <Archive size={13} />
              Arsipkan Batch
            </button>

            {/* Unpublish button */}
            <button
              onClick={handleUnpublishBatch}
              disabled={isSaving || isPublishing || isArchiving || isUnpublishing || loadingRoster}
              className="bg-white hover:bg-slate-50 text-amber-700 font-bold border border-amber-200 py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              title="Tarik / Batalkan Publikasi"
            >
              <Undo2 size={13} />
              Tarik Publikasi
            </button>

            {/* Save Draft */}
            <button
              onClick={handleSaveDraft}
              disabled={isSaving || isPublishing || isArchiving || isUnpublishing || loadingRoster}
              className="bg-white hover:bg-slate-50 text-slate-800 font-black border border-slate-200 py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={13} /> : <Save size={13} />}
              Simpan Draft
            </button>

            {/* Publish for Students */}
            <button
              onClick={handlePublishClick}
              disabled={isSaving || isPublishing || isArchiving || isUnpublishing || loadingRoster}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isPublishing ? <RefreshCw className="animate-spin" size={13} /> : <CheckCircle2 size={13} />}
              Publikasikan untuk Siswa
            </button>
          </div>
        </div>
      </div>

      {/* Unresolved / Warn Dialog */}
      <AnimatePresence>
        {showUnresolvedModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-100"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                  <AlertCircle size={20} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    Konfirmasi Publikasi Rapor
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Terdapat <strong>{stats.unresolved} baris data</strong> yang ditempel tetapi belum berhasil dicocokkan ke siswa.
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed mt-2">
                    Jika Anda melanjutkan, sistem hanya akan mempublikasikan tautan rapor untuk <strong>{mappings.filter(m => m.studentId && m.fileId).length} siswa</strong> yang berhasil dicocokkan. Baris yang belum terhubung tidak akan dipublikasikan ke siswa.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-50 pt-4">
                <button
                  onClick={() => setShowUnresolvedModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Batal, Periksa Lagi
                </button>
                <button
                  onClick={() => executePublish(mappings.filter(m => m.studentId && m.fileId).length)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                >
                  Ya, Publikasikan yang Cocok
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
