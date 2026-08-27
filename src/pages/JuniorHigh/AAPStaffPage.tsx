import * as React from 'react';
import { 
  Search, Filter, ClipboardList, CheckCircle2, AlertTriangle, Trash2, 
  Loader2, Sparkles, Send, FileSpreadsheet, Eye, RefreshCw, XCircle
} from 'lucide-react';
import { 
  getActiveStudents, db 
} from '../../lib/firebase';
import { JuniorHighAAPResult, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { collection, doc, writeBatch, deleteDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

// Parsing and Normalization Helpers
const normalizeName = (name: string): string => {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
};

const parseMathLevel = (raw: string): 'Building Foundations' | 'Growing with Guidance' | 'Progressing Independently' | 'Demonstrating Mastery' | '' => {
  if (!raw) return '';
  const val = raw.trim().toLowerCase();
  if (val.includes('foundations') || val.includes('building')) return 'Building Foundations';
  if (val.includes('guidance') || val.includes('growing')) return 'Growing with Guidance';
  if (val.includes('independently') || val.includes('progressing')) return 'Progressing Independently';
  if (val.includes('mastery') || val.includes('demonstrating')) return 'Demonstrating Mastery';
  return '';
};

const parseReadingFluency = (raw: string): 'IR+' | 'IR' | 'ER' | 'ER EN' | '' => {
  if (!raw) return '';
  const val = raw.trim().toUpperCase();
  if (val === 'IR+') return 'IR+';
  if (val === 'IR') return 'IR';
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

interface PreviewRow {
  index: number;
  rawNo: string;
  rawName: string;
  rawMath: string;
  rawReading: string;
  rawMengaji: string;
  rawBahasa: string;
  
  // Parsed fields
  mathLevel: 'Building Foundations' | 'Growing with Guidance' | 'Progressing Independently' | 'Demonstrating Mastery' | '';
  readingFluencyLevel: 'IR+' | 'IR' | 'ER' | 'ER EN' | '';
  mengajiMaterial: 'IQRO 1' | 'IQRO 2' | 'IQRO 3' | 'IQRO 4' | 'IQRO 5' | 'IQRO 6' | 'JUZ AMMA' | 'ALQURAN' | '';
  mengajiCategory: 'ISYROF' | 'MUBTADI' | 'MAQBUL' | 'JAYYID' | '';
  bahasaIndonesiaLevel: number | null;
  bahasaIndonesiaLabel: 'Perlu Pendampingan Intensif' | 'Perlu Penguatan Terarah' | 'Siap Berkembang' | 'Siap Lanjut' | '';

  // Matching Info
  matchStatus: 'Cocok' | 'Tidak ditemukan' | 'Duplikat' | 'Perlu diperiksa';
  studentId: string | null;
  validationError?: string;
}

export default function AAPStaffPage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  // Filters state
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  
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

  // Check role authorization
  const isAuthorized = React.useMemo(() => {
    if (!profile) return false;
    const staffRoles = [
      'TEACHER', 'HEAD_JUNIOR', 'BK_MENTOR',
      'MTSS_ACADEMIC_PJ', 'SUPER_ADMIN', 'HEAD_UNIT',
      'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR',
      'HOMEROOM_TEACHER', 'COUNSELOR'
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
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(c => c.academicYear === selectedYear && c.status === 'active')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
  }, [isAuthorized, selectedYear, selectedClassId]);

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
        const docId = `${row.studentId}_${selectedYear}`;
        const ref = doc(db, 'junior_high_aap_results', docId);

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
          updatedAt: serverTimestamp(),
          updatedBy: profile?.email || 'admin'
        };

        // Preserve stable createdAt/createdBy if possible (handled on client fallback)
        const existing = existingResults.find(e => e.studentId === row.studentId);
        if (existing) {
          payload.createdAt = existing.createdAt;
          payload.createdBy = existing.createdBy;
        } else {
          payload.createdAt = serverTimestamp();
          payload.createdBy = profile?.email || 'admin';
        }

        if (targetStatus === 'PUBLISHED') {
          payload.publishedAt = serverTimestamp();
          payload.publishedBy = profile?.email || 'admin';
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
      const docId = `${studentId}_${selectedYear}`;
      await deleteDoc(doc(db, 'junior_high_aap_results', docId));
      toast.success("Hasil Asesmen berhasil dihapus. Data akan hilang dari portal siswa seketika.");
      fetchRosterAndResults();
    } catch (err) {
      console.error("Gagal menghapus hasil AAP:", err);
      toast.error("Gagal menghapus data.");
    }
  };

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
                setRawText('');
                setPreviewRows([]);
                setViewMode('IMPORT');
              }}
              className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95"
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
                  Roster Kelas: {roster.length} Siswa | Status Hasil AAP
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
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {roster.map((student, idx) => {
                      const result = existingResults.find(r => r.studentId === student.id);
                      
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
                            {result ? (
                              <div className="space-y-0.5">
                                <p className="font-bold text-gray-800">{result.mengajiMaterial || '—'}</p>
                                <p className="text-[10px] uppercase text-emerald-600 tracking-wider font-black">{result.mengajiCategory || '—'}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 italic">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-600">
                            {result ? (
                              <div className="space-y-0.5">
                                <p className="font-bold text-gray-800">{result.bahasaIndonesiaLabel || '—'}</p>
                                <p className="text-[10px] text-blue-600 tracking-wider font-black">Level {result.bahasaIndonesiaLevel || '—'}</p>
                              </div>
                            ) : (
                              <span className="text-gray-300 italic">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {result ? (
                              <span className={cn(
                                "inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                                result.status === 'PUBLISHED' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                              )}>
                                {result.status}
                              </span>
                            ) : (
                              <span className="inline-block px-3 py-1 bg-gray-50 text-gray-400 text-[9px] font-black uppercase tracking-wider rounded-full">
                                Kosong
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {result && (
                              <button
                                onClick={() => handleDeleteResult(student.id)}
                                className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all"
                                title="Batal Rilis / Hapus data"
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
                              <option value="Building Foundations">Building Foundations</option>
                              <option value="Growing with Guidance">Growing with Guidance</option>
                              <option value="Progressing Independently">Progressing Independently</option>
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
                              <option value="IR">IR</option>
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

    </div>
  );
}
