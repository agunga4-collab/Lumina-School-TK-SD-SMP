import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Calendar, Users, Save, CheckCircle2, RefreshCw, 
  AlertCircle, Info, Check, Search, Trash2, ArrowRight, ExternalLink,
  Plus, Undo2, Archive, Eye
} from 'lucide-react';
import { db, getClasses, getActiveStudents, handleFirestoreError } from '../../lib/firebase';
import { 
  doc, getDocs, setDoc, deleteDoc, query, collection, where, writeBatch, serverTimestamp, onSnapshot 
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
  matchedBy: 'NAME_AND_CLASS' | 'MANUAL' | 'NONE';
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
  return judul
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

export default function OtherReportPage() {
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

  // Dropdowns & students list
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [roster, setRoster] = React.useState<Student[]>([]);
  const [loadingRoster, setLoadingRoster] = React.useState<boolean>(false);

  // Raw pasted data
  const [pasteText, setPasteText] = React.useState<string>('');

  // Current mappings list in editor
  const [mappings, setMappings] = React.useState<OtherReportMapping[]>([]);
  const [loadingSaved, setLoadingSaved] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Tab
  const [activeTab, setActiveTab] = React.useState<'mapping' | 'tracking'>('mapping');

  // Action states
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isPublishing, setIsPublishing] = React.useState<boolean>(false);
  const [isUnpublishing, setIsUnpublishing] = React.useState<boolean>(false);
  const [isArchiving, setIsArchiving] = React.useState<boolean>(false);

  // Unresolved publish confirm modal
  const [showUnresolvedModal, setShowUnresolvedModal] = React.useState<boolean>(false);

  // Initialize filters
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));
  }, [activeYear, activeSemester]);

  // Load JH classes for active year
  React.useEffect(() => {
    const fetchJHClasses = async () => {
      setLoadingClasses(true);
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

        const jhClasses = (all || []).filter(c => {
          const isJH = c.unitId === 'JUNIOR_HIGH';
          const isActiveYear = c.academicYear === selectedYear;
          const isNotArchived = c.status !== 'archived';
          if (!isJH || !isActiveYear || !isNotArchived) return false;
          return activeClassKeys.has(c.id) || activeClassKeys.has(c.name);
        });

        setClassesList(jhClasses);
        if (jhClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(jhClasses[0].id);
        }
      } catch (err) {
        console.error('Error fetching classes:', err);
        toast.error('Gagal memuat kelas Junior High');
      } finally {
        setLoadingClasses(false);
      }
    };

    fetchJHClasses();
  }, [selectedYear]);

  // Load existing batches for selected year, semester, and class
  const loadExistingBatches = async () => {
    if (!selectedClassId || !selectedYear || !selectedSemester) {
      setExistingBatches([]);
      return;
    }

    setLoadingBatches(true);
    try {
      const q = query(
        collection(db, 'jh_other_report_links'),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('classId', '==', selectedClassId)
      );
      const snap = await getDocs(q);

      const batchMap = new Map<string, BatchSummary>();
      snap.docs.forEach(d => {
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

      // If currently selected batchId is not found in batches and not NEW, select first or keep NEW
      if (selectedBatchId !== 'NEW') {
        const currentFound = batchList.find(b => b.batchId === selectedBatchId);
        if (!currentFound && batchList.length > 0) {
          setSelectedBatchId(batchList[0].batchId);
          setInputJudul(batchList[0].judul);
          setInputKeterangan(batchList[0].keterangan || '');
        } else if (!currentFound) {
          setSelectedBatchId('NEW');
        }
      }
    } catch (err) {
      console.error('Error loading existing batches:', err);
    } finally {
      setLoadingBatches(false);
    }
  };

  React.useEffect(() => {
    loadExistingBatches();
  }, [selectedYear, selectedSemester, selectedClassId]);

  // Calculate current active batchId and effective judul
  const currentJudul = selectedBatchId === 'NEW' 
    ? inputJudul.trim() 
    : (existingBatches.find(b => b.batchId === selectedBatchId)?.judul || inputJudul.trim());

  const currentJudulNormalized = normalizeJudul(currentJudul);

  const calculatedBatchId = React.useMemo(() => {
    if (selectedBatchId !== 'NEW') return selectedBatchId;
    if (!currentJudulNormalized || !selectedClassId) return '';
    const yearNorm = selectedYear.replace(/\//g, '-');
    const slug = judulToBatchSlug(currentJudulNormalized);
    return `${yearNorm}_sem${selectedSemester}_${selectedClassId}_${slug}`;
  }, [selectedBatchId, currentJudulNormalized, selectedYear, selectedSemester, selectedClassId]);

  // Load roster and mappings when context or batch changes
  React.useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadData = async () => {
      if (!selectedClassId || !selectedYear) return;
      setLoadingRoster(true);
      setLoadingSaved(true);

      try {
        // 1. Fetch class active roster
        const studentsList = await getActiveStudents(selectedClassId, selectedYear);
        const sortedRoster = (studentsList || []).sort((a, b) => {
          const numA = a.attendanceNumber ?? a.noAbsen ?? a.rollNumber ?? a.rosterNumber ?? 999;
          const numB = b.attendanceNumber ?? b.noAbsen ?? b.rollNumber ?? b.rosterNumber ?? 999;
          if (numA !== numB) return numA - numB;
          return a.name.localeCompare(b.name);
        });
        setRoster(sortedRoster);

        const selectedClassObj = classesList.find(c => c.id === selectedClassId);

        // 2. If a valid batchId exists, listen to Firestore in real-time
        if (calculatedBatchId) {
          const q = query(
            collection(db, 'jh_other_report_links'),
            where('batchId', '==', calculatedBatchId)
          );

          unsubscribe = onSnapshot(q, (snapshot) => {
            const savedMap = new Map<string, any>();
            snapshot.docs.forEach(docSnap => {
              const data = docSnap.data();
              savedMap.set(data.studentId, {
                docId: docSnap.id,
                ...data
              });
            });

            // Map each student in roster
            const newMappings: OtherReportMapping[] = sortedRoster.map(student => {
              const saved = savedMap.get(student.id);
              if (saved) {
                return {
                  id: student.id,
                  studentId: student.id,
                  studentNameSnapshot: student.name,
                  nisSnapshot: student.nis || (student as any).nisn || '',
                  classId: selectedClassId,
                  classNameSnapshot: selectedClassObj?.name || '',
                  academicYear: selectedYear,
                  semester: selectedSemester,
                  batchId: calculatedBatchId,
                  judul: saved.judul || currentJudul,
                  keterangan: saved.keterangan || inputKeterangan,
                  fileName: saved.fileName || '',
                  fileId: saved.driveFileId || saved.fileId || '',
                  driveUrl: saved.driveFileUrl || (saved.driveFileId ? `https://drive.google.com/file/d/${saved.driveFileId}/view` : ''),
                  status: (saved.driveFileId || saved.fileId) ? 'Cocok' : 'Belum ada PDF',
                  matchedBy: saved.matchedBy || 'NAME_AND_CLASS',
                  dbStatus: saved.status,
                  isOpened: saved.isOpened,
                  firstOpenedAt: saved.firstOpenedAt,
                  lastOpenedAt: saved.lastOpenedAt,
                  openCount: saved.openCount,
                  openedByEmail: saved.openedByEmail
                };
              } else {
                return {
                  id: student.id,
                  studentId: student.id,
                  studentNameSnapshot: student.name,
                  nisSnapshot: student.nis || (student as any).nisn || '',
                  classId: selectedClassId,
                  classNameSnapshot: selectedClassObj?.name || '',
                  academicYear: selectedYear,
                  semester: selectedSemester,
                  batchId: calculatedBatchId,
                  judul: currentJudul,
                  keterangan: inputKeterangan,
                  fileName: '',
                  fileId: '',
                  driveUrl: '',
                  status: 'Belum ada PDF',
                  matchedBy: 'NONE'
                };
              }
            });

            setMappings(newMappings);
            setLoadingSaved(false);
          }, (err) => {
            console.error('Error listening to jh_other_report_links:', err);
            setLoadingSaved(false);
          });
        } else {
          // No batch created or chosen yet; construct clean roster mappings
          const initialMappings: OtherReportMapping[] = sortedRoster.map(student => ({
            id: student.id,
            studentId: student.id,
            studentNameSnapshot: student.name,
            nisSnapshot: student.nis || (student as any).nisn || '',
            classId: selectedClassId,
            classNameSnapshot: selectedClassObj?.name || '',
            academicYear: selectedYear,
            semester: selectedSemester,
            batchId: '',
            judul: '',
            fileName: '',
            fileId: '',
            driveUrl: '',
            status: 'Belum ada PDF',
            matchedBy: 'NONE'
          }));
          setMappings(initialMappings);
          setLoadingSaved(false);
        }
      } catch (err) {
        console.error('Error loading roster or other report links:', err);
        toast.error('Gagal memuat data kelas');
      } finally {
        setLoadingRoster(false);
      }
    };

    loadData();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedClassId, selectedYear, selectedSemester, calculatedBatchId, classesList]);

  // Handle switching batch selection
  const handleSelectBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    if (batchId === 'NEW') {
      setInputJudul('');
      setInputKeterangan('');
    } else {
      const found = existingBatches.find(b => b.batchId === batchId);
      if (found) {
        setInputJudul(found.judul);
        setInputKeterangan(found.keterangan || '');
      }
    }
  };

  // Bulk Paste Parsing & Auto-Matching
  const handlePreviewAndMatch = () => {
    if (!currentJudul.trim()) {
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
        const existIdx = updatedMappings.findIndex(m => m.studentId === student.id);
        if (existIdx !== -1) {
          updatedMappings[existIdx] = {
            ...updatedMappings[existIdx],
            fileName: row.fileName,
            fileId: row.fileId,
            driveUrl: row.fileId ? `https://drive.google.com/file/d/${row.fileId}/view` : '',
            status: 'Cocok',
            matchedBy: 'NAME_AND_CLASS',
            judul: currentJudul,
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
          batchId: calculatedBatchId,
          judul: currentJudul,
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
            nisSnapshot: studentObj.nis || (studentObj as any).nisn || '',
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
      if (target.studentId && target.dbStatus && calculatedBatchId) {
        const docId = `${calculatedBatchId}_${target.studentId}`;
        const ref = doc(db, 'jh_other_report_links', docId);
        await deleteDoc(ref);
        toast.success(`Berhasil menghapus rapor "${studentName}" dari database.`);
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
      toast.error('Gagal menghapus link rapor dari database.');
    }
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    if (!currentJudul.trim()) {
      toast.error('Judul Rapor wajib diisi.');
      return;
    }

    if (!calculatedBatchId) {
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
      validRows.forEach(row => {
        const docId = `${calculatedBatchId}_${row.studentId}`;
        const ref = doc(db, 'jh_other_report_links', docId);

        const dataPayload: any = {
          batchId: calculatedBatchId,
          judul: currentJudul,
          judulNormalized: currentJudulNormalized,
          keterangan: inputKeterangan.trim() || '',
          academicYear: selectedYear,
          semester: selectedSemester,
          classId: selectedClassId,
          classNameSnapshot: row.classNameSnapshot,
          studentId: row.studentId,
          studentNameSnapshot: row.studentNameSnapshot,
          nisn: row.nisSnapshot || '',
          driveFileId: row.fileId,
          driveFileUrl: row.driveUrl,
          fileName: row.fileName,
          status: 'DRAFT',
          matchedBy: row.matchedBy,
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
      loadExistingBatches();
    } catch (err) {
      console.error('Error saving draft:', err);
      toast.error('Gagal menyimpan draft');
    } finally {
      setIsSaving(false);
    }
  };

  // Publish validation & confirmation
  const handlePublishClick = () => {
    if (!currentJudul.trim()) {
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
      const confirmPub = window.confirm(`Apakah Anda yakin ingin mempublikasikan tautan rapor "${currentJudul}" untuk ${validCount} siswa?`);
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
      validRows.forEach(row => {
        const docId = `${calculatedBatchId}_${row.studentId}`;
        const ref = doc(db, 'jh_other_report_links', docId);

        const dataPayload: any = {
          batchId: calculatedBatchId,
          judul: currentJudul,
          judulNormalized: currentJudulNormalized,
          keterangan: inputKeterangan.trim() || '',
          academicYear: selectedYear,
          semester: selectedSemester,
          classId: selectedClassId,
          classNameSnapshot: row.classNameSnapshot,
          studentId: row.studentId,
          studentNameSnapshot: row.studentNameSnapshot,
          nisn: row.nisSnapshot || '',
          driveFileId: row.fileId,
          driveFileUrl: row.driveUrl,
          fileName: row.fileName,
          status: 'PUBLISHED',
          matchedBy: row.matchedBy,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff',
          publishedAt: serverTimestamp(),
          publishedBy: currentUser?.email || currentUser?.uid || 'staff',
          publishedByName: currentUser?.displayName || currentUser?.email || 'Junior High Teacher',
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
      toast.success(`Rapor "${currentJudul}" berhasil dipublikasikan untuk ${validCount} siswa!`);
      setShowUnresolvedModal(false);
      loadExistingBatches();
    } catch (err) {
      console.error('Error publishing:', err);
      toast.error('Gagal mempublikasikan rapor');
    } finally {
      setIsPublishing(false);
    }
  };

  // Action: Tarik / Batalkan Publikasi
  const handleUnpublishBatch = async () => {
    if (!calculatedBatchId) return;
    const publishedRows = mappings.filter(m => m.studentId && m.fileId && m.dbStatus === 'PUBLISHED');
    if (publishedRows.length === 0) {
      toast.info('Tidak ada rapor berstatus terpublikasi dalam batch ini.');
      return;
    }

    const confirmUnpub = window.confirm(
      `Apakah Anda yakin ingin menarik/membatalkan publikasi batch "${currentJudul}"? Siswa tidak akan dapat lagi melihat rapor ini di portal.`
    );
    if (!confirmUnpub) return;

    setIsUnpublishing(true);
    const batch = writeBatch(db);

    try {
      publishedRows.forEach(row => {
        const docId = `${calculatedBatchId}_${row.studentId}`;
        const ref = doc(db, 'jh_other_report_links', docId);
        batch.update(ref, {
          status: 'UNPUBLISHED',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff'
        });
      });

      await batch.commit();
      toast.success(`Publikasi batch "${currentJudul}" berhasil ditarik.`);
      loadExistingBatches();
    } catch (err) {
      console.error('Error unpublishing batch:', err);
      toast.error('Gagal menarik publikasi batch');
    } finally {
      setIsUnpublishing(false);
    }
  };

  // Action: Arsipkan Batch
  const handleArchiveBatch = async () => {
    if (!calculatedBatchId) return;
    const savedRows = mappings.filter(m => m.studentId && m.fileId && m.dbStatus);
    if (savedRows.length === 0) {
      toast.info('Belum ada dokumen tersimpan di database dalam batch ini.');
      return;
    }

    const confirmArch = window.confirm(
      `Apakah Anda yakin ingin mengarsipkan batch "${currentJudul}"?`
    );
    if (!confirmArch) return;

    setIsArchiving(true);
    const batch = writeBatch(db);

    try {
      savedRows.forEach(row => {
        const docId = `${calculatedBatchId}_${row.studentId}`;
        const ref = doc(db, 'jh_other_report_links', docId);
        batch.update(ref, {
          status: 'ARCHIVED',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff'
        });
      });

      await batch.commit();
      toast.success(`Batch "${currentJudul}" berhasil diarsipkan.`);
      loadExistingBatches();
    } catch (err) {
      console.error('Error archiving batch:', err);
      toast.error('Gagal mengarsipkan batch');
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
    const cocok = mappings.filter(m => m.studentId && m.fileId && m.status === 'Cocok').length;
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
            <span>Junior High Staff</span>
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
              className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-800 transition-colors"
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
              Kelas Junior High
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
              placeholder="Contoh: Progression Test 1, Cambridge Checkpoint, dll."
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
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline"
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
                Pratinjau Hasil Pemetaan: {currentJudul || '(Belum Ada Judul)'} ({filteredMappings.length} Baris)
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
                            {m.matchedBy === 'NAME_AND_CLASS' ? (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <Check size={12} /> Auto-matched
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-blue-600">
                                <CheckCircle2 size={12} /> Manual
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
