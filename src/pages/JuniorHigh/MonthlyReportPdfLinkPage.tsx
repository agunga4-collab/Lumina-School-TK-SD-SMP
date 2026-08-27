import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Calendar, Users, Save, CheckCircle2, RefreshCw, 
  AlertCircle, Info, Check, Search, X, Edit3, Eye, Trash2, ArrowRight
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { 
  doc, getDocs, setDoc, deleteDoc, query, collection, where, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Class, Student } from '../../types';

interface ReportMapping {
  id: string; // unique key for UI list
  studentId: string; // empty if unmatched
  studentNameSnapshot: string;
  nisSnapshot: string;
  classId: string;
  classNameSnapshot: string;
  academicYear: string;
  semester: string;
  periodKey: string;
  fileName: string;
  fileId: string;
  driveUrl: string;
  status: 'Cocok' | 'Tidak ditemukan' | 'Duplikat' | 'Belum ada PDF' | 'Perlu diperiksa';
  matchedBy: 'NAME_AND_CLASS' | 'MANUAL' | 'NONE';
  dbStatus?: 'DRAFT' | 'PUBLISHED'; // Status in DB if loaded
}

const indonesianMonths = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getIndonesianMonthLabel(periodKey: string): string {
  if (!periodKey || !periodKey.includes('-')) return '';
  const [year, month] = periodKey.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${indonesianMonths[monthIdx]} ${year}`;
  }
  return periodKey;
}

function cleanName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function MonthlyReportPdfLinkPage() {
  const { currentUser } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Selected parameters
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Dropdowns & students list
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [roster, setRoster] = React.useState<Student[]>([]);
  const [loadingRoster, setLoadingRoster] = React.useState<boolean>(false);

  // Raw pasted data
  const [pasteText, setPasteText] = React.useState<string>('');

  // Current mappings list in editor
  const [mappings, setMappings] = React.useState<ReportMapping[]>([]);
  const [loadingSaved, setLoadingSaved] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Action states
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isPublishing, setIsPublishing] = React.useState<boolean>(false);

  // Unresolved publish confirm modal
  const [showUnresolvedModal, setShowUnresolvedModal] = React.useState<boolean>(false);

  // Initialize filters
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonthStr);
  }, [activeYear, activeSemester]);

  // Load classes
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
          if (e.classId) {
            activeClassKeys.add(e.classId);
          }
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
        toast.error('Gagal memuat kelas');
      } finally {
        setLoadingClasses(false);
      }
    };

    fetchJHClasses();
  }, [selectedYear]);

  // Load roster and existing report links from Firestore
  const loadRosterAndSavedLinks = async () => {
    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth) return;
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

      // 2. Fetch saved report links
      const q = query(
        collection(db, 'manual_junior_high_report_links'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const snap = await getDocs(q);
      const savedDocs = snap.docs.map(doc => doc.data() as any);
      const savedMap = new Map<string, any>();
      savedDocs.forEach(doc => {
        savedMap.set(doc.studentId, doc);
      });

      const selectedClassObj = classesList.find(c => c.id === selectedClassId);

      // 3. Construct current mappings
      const initialMappings = sortedRoster.map(student => {
        const saved = savedMap.get(student.id);
        if (saved) {
          return {
            id: student.id,
            studentId: student.id,
            studentNameSnapshot: student.name,
            nisSnapshot: student.nis || '',
            classId: selectedClassId,
            classNameSnapshot: selectedClassObj?.name || '',
            academicYear: selectedYear,
            semester: selectedSemester,
            periodKey: selectedMonth,
            fileName: saved.fileName || '',
            fileId: saved.fileId || '',
            driveUrl: saved.driveUrl || '',
            status: 'Cocok' as const,
            matchedBy: saved.matchedBy || 'NAME_AND_CLASS',
            dbStatus: saved.status // DRAFT or PUBLISHED
          };
        } else {
          return {
            id: student.id,
            studentId: student.id,
            studentNameSnapshot: student.name,
            nisSnapshot: student.nis || '',
            classId: selectedClassId,
            classNameSnapshot: selectedClassObj?.name || '',
            academicYear: selectedYear,
            semester: selectedSemester,
            periodKey: selectedMonth,
            fileName: '',
            fileId: '',
            driveUrl: '',
            status: 'Belum ada PDF' as const,
            matchedBy: 'NONE' as const
          };
        }
      });

      setMappings(initialMappings);
    } catch (err) {
      console.error('Error loading roster and saved links:', err);
      toast.error('Gagal memuat data kelas');
    } finally {
      setLoadingRoster(false);
      setLoadingSaved(false);
    }
  };

  React.useEffect(() => {
    loadRosterAndSavedLinks();
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth, classesList]);

  // Bulk Paste Parsing & Auto-Matching
  const handlePreviewAndMatch = () => {
    if (!pasteText.trim()) {
      toast.error('Silakan paste data dari Google Sheets terlebih dahulu.');
      return;
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
    const unmatchedRows: ReportMapping[] = [];

    parsedRows.forEach((row, idx) => {
      // Clean row file name
      const cf = cleanName(row.fileName);

      // Match against the current roster
      const matchedStudents = roster.filter(student => {
        const cs = cleanName(student.name);
        // Match conditions: clean file name equals clean student name, or splits contain it, or either contains the other
        if (cf === cs) return true;
        
        // Check hyphen split
        const parts = row.fileName.split(/[-–—_]/).map(p => cleanName(p));
        if (parts.some(p => p === cs)) return true;

        // Substring
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
            driveUrl: `https://drive.google.com/file/d/${row.fileId}/view`,
            status: 'Cocok',
            matchedBy: 'NAME_AND_CLASS'
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
          periodKey: selectedMonth,
          fileName: row.fileName,
          fileId: row.fileId,
          driveUrl: row.fileId ? `https://drive.google.com/file/d/${row.fileId}/view` : '',
          status: matchedStudents.length > 1 ? 'Duplikat' : 'Tidak ditemukan',
          matchedBy: 'NONE'
        });
      }
    });

    // Remove duplicates or merge: If an unmatched row is parsed but some roster student got successfully updated, that is correct.
    setMappings([...updatedMappings, ...unmatchedRows]);
    toast.success(`Berhasil mencocokkan ${parsedRows.length} baris dari paste.`);
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
      // 1. Remove any placeholder "Belum ada PDF" for this student
      let filtered = prev.filter(m => !(m.studentId === targetStudentId && !m.fileId));

      // 2. Update the unmatched row with student info
      return filtered.map(m => {
        if (m.id === mappingId) {
          return {
            ...m,
            studentId: studentObj.id,
            studentNameSnapshot: studentObj.name,
            nisSnapshot: studentObj.nis || '',
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
  const handleRemoveMapping = (mappingId: string) => {
    setMappings(prev => prev.map(m => {
      if (m.id === mappingId) {
        return {
          ...m,
          fileId: '',
          fileName: '',
          driveUrl: '',
          status: m.studentId ? 'Belum ada PDF' : 'Tidak ditemukan',
          matchedBy: 'NONE'
        };
      }
      return m;
    }));
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    const validRows = mappings.filter(m => m.studentId && m.fileId);
    if (validRows.length === 0) {
      toast.error('Tidak ada mapping valid (siswa + File ID) untuk disimpan.');
      return;
    }

    setIsSaving(true);
    const batch = writeBatch(db);

    try {
      validRows.forEach(row => {
        const academicYearNormalized = row.academicYear.replace(/\//g, '-');
        const docId = `${row.studentId}_${academicYearNormalized}_${row.semester}_${row.periodKey}`;
        const ref = doc(db, 'manual_junior_high_report_links', docId);

        const dataPayload = {
          studentId: row.studentId,
          studentNameSnapshot: row.studentNameSnapshot,
          nisSnapshot: row.nisSnapshot || '',
          classId: row.classId,
          classNameSnapshot: row.classNameSnapshot,
          academicYear: row.academicYear,
          semester: row.semester,
          periodKey: row.periodKey,
          fileName: row.fileName,
          fileId: row.fileId,
          driveUrl: row.driveUrl,
          status: 'DRAFT',
          matchedBy: row.matchedBy,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff',
        };

        // For new docs, set createdAt
        if (!row.dbStatus) {
          (dataPayload as any).createdAt = serverTimestamp();
          (dataPayload as any).createdBy = currentUser?.email || currentUser?.uid || 'staff';
        }

        batch.set(ref, dataPayload, { merge: true });
      });

      await batch.commit();
      toast.success('Draft berhasil disimpan!');
      loadRosterAndSavedLinks();
    } catch (err) {
      console.error('Error saving draft:', err);
      toast.error('Gagal menyimpan draft');
    } finally {
      setIsSaving(false);
    }
  };

  // Publish validation & confirmation
  const handlePublishClick = () => {
    const validCount = mappings.filter(m => m.studentId && m.fileId).length;
    if (validCount === 0) {
      toast.error('Tidak ada mapping cocok untuk dipublikasikan.');
      return;
    }

    const unresolvedCount = mappings.filter(m => !m.studentId && m.fileId).length;
    if (unresolvedCount > 0) {
      setShowUnresolvedModal(true);
    } else {
      const confirmPub = window.confirm(`Apakah Anda yakin ingin mempublikasikan tautan rapor untuk ${validCount} siswa?`);
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
        const academicYearNormalized = row.academicYear.replace(/\//g, '-');
        const docId = `${row.studentId}_${academicYearNormalized}_${row.semester}_${row.periodKey}`;
        const ref = doc(db, 'manual_junior_high_report_links', docId);

        const dataPayload = {
          studentId: row.studentId,
          studentNameSnapshot: row.studentNameSnapshot,
          nisSnapshot: row.nisSnapshot || '',
          classId: row.classId,
          classNameSnapshot: row.classNameSnapshot,
          academicYear: row.academicYear,
          semester: row.semester,
          periodKey: row.periodKey,
          fileName: row.fileName,
          fileId: row.fileId,
          driveUrl: row.driveUrl,
          status: 'PUBLISHED',
          matchedBy: row.matchedBy,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email || currentUser?.uid || 'staff',
          publishedAt: serverTimestamp(),
          publishedBy: currentUser?.email || currentUser?.uid || 'staff',
        };

        if (!row.dbStatus) {
          (dataPayload as any).createdAt = serverTimestamp();
          (dataPayload as any).createdBy = currentUser?.email || currentUser?.uid || 'staff';
        }

        batch.set(ref, dataPayload, { merge: true });
      });

      await batch.commit();
      toast.success(`Rapor berhasil dipublikasikan untuk ${validCount} siswa!`);
      setShowUnresolvedModal(false);
      loadRosterAndSavedLinks();
    } catch (err) {
      console.error('Error publishing:', err);
      toast.error('Gagal mempublikasikan rapor');
    } finally {
      setIsPublishing(false);
    }
  };

  // Clear pastetext
  const handleClearPaste = () => {
    setPasteText('');
  };

  // Filter mappings for rendering
  const filteredMappings = React.useMemo(() => {
    return mappings.filter(m => {
      const query = searchQuery.toLowerCase();
      return (
        m.studentNameSnapshot.toLowerCase().includes(query) ||
        m.fileName.toLowerCase().includes(query) ||
        m.fileId.toLowerCase().includes(query) ||
        m.status.toLowerCase().includes(query)
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

    return { total, cocok, draft, published, pending, unresolved };
  }, [mappings, roster]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Breadcrumb / Title */}
      <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-400">
            <span>Junior High Staff</span>
            <ArrowRight size={10} className="text-slate-300" />
            <span className="text-slate-600">Report Links</span>
          </div>
          <h1 className="text-3xl font-black italic uppercase text-slate-900 mt-1">
            Monthly Report PDF Link
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Workflow distribusi manual rapor bulanan PDF menggunakan link Google Drive.
          </p>
        </div>
      </div>

      {/* Filter Parameters */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-50 pb-3 mb-2">
          <Calendar size={16} className="text-blue-600" />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
            Sesi & Konteks Kelas
          </h2>
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
              Periode Bulan
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-xs rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 py-2 bg-slate-50 font-semibold"
            />
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
                Copy kolom <strong>Nama File</strong> dan <strong>File ID</strong> langsung dari Google Sheets, lalu paste ke kotak di bawah. Format harus dipisahkan oleh tombol <kbd className="bg-slate-100 px-1 rounded">TAB</kbd> (default dari Excel/Sheets) atau koma.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Abiyyu Dhia Ayyasy - 7 Baiji\t19-dL0nLdFreh2ITYO_3WcE0mUU1k5LmB\nAbrevanza Radhitya Kristiyanto - 7 Baiji\t14nSHsi-PybvmH9DwyTD5XUahiX3JjaY0"}
                className="w-full h-64 text-xs font-mono rounded-lg border-slate-200 focus:border-blue-500 focus:ring-blue-500 bg-slate-50/50 p-3"
              />
            </div>
            <button
              onClick={handlePreviewAndMatch}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-xs mt-4 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
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
              <h4 className="text-xs font-bold text-slate-800">Bagaimana Cara Kerja Pencocokan Otomatis?</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Sistem akan membandingkan nama file yang ditempel dengan nama asli siswa dalam daftar kelas (tidak sensitif huruf besar/kecil, mengabaikan spasi ganda, tanda baca, dan menguji kecocokan sebagian). Jika ada keraguan atau hasil ganda, baris ditaruh di kategori <strong>Perlu Diperiksa</strong> atau <strong>Tidak ditemukan</strong> agar Guru dapat memetakan secara manual melalui dropdown.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Review & Edit Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-slate-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Pratinjau Hasil Pemetaan Rapor ({filteredMappings.length} Baris)
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

        {/* Unified Roster Table */}
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
          ) : (
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
                              placeholder="Masukkan Google Drive File ID"
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
                            <span className={`text-[9px] font-black px-1.5 py-0.2 rounded w-fit ${
                              m.dbStatus === 'PUBLISHED' 
                                ? 'text-blue-600 border border-blue-200 bg-blue-50' 
                                : 'text-amber-600 border border-amber-200 bg-amber-50'
                            }`}>
                              {m.dbStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {(m.fileName || m.fileId) && (
                          <button
                            onClick={() => handleRemoveMapping(m.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-1"
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
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] text-slate-500 font-semibold">
            Pastikan tautan PDF sudah dicek ("Lihat PDF") sebelum dipublikasikan ke siswa.
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleSaveDraft}
              disabled={isSaving || isPublishing || loadingRoster}
              className="flex-1 sm:flex-none bg-white hover:bg-slate-50 text-slate-700 font-black border border-slate-200 py-2 px-5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={13} /> : <Save size={13} />}
              Simpan Draft
            </button>
            <button
              onClick={handlePublishClick}
              disabled={isSaving || isPublishing || loadingRoster}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-6 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
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
                    Terdapat <strong>{stats.unresolved} baris data</strong> yang dimasukkan tetapi belum dicocokkan ke siswa.
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed mt-2">
                    Jika Anda melanjutkan, sistem hanya akan mempublikasikan tautan rapor untuk <strong>{mappings.filter(m => m.studentId && m.fileId).length} siswa</strong> yang berhasil dicocokkan secara otomatis/manual. Baris yang tidak cocok tidak akan dipublikasikan ke portofolio siswa.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 border-t border-slate-50 pt-4">
                <button
                  onClick={() => setShowUnresolvedModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-colors"
                >
                  Batal, Periksa Lagi
                </button>
                <button
                  onClick={() => executePublish(mappings.filter(m => m.studentId && m.fileId).length)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg text-xs transition-colors shadow-sm"
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
