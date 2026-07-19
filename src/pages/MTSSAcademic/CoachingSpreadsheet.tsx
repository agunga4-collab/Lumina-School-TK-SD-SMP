import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  X, 
  Calendar, 
  Trash2, 
  FileSpreadsheet, 
  UserPlus, 
  ChevronRight, 
  Info,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { 
  getMTSSAcademicCases, 
  getStudents, 
  getClasses 
} from '../../lib/firebase';
import { 
  MTSSAcademicCase, 
  Student, 
  Class, 
  MTSSAcademicDomain, 
  User 
} from '../../types';
import { 
  juniorHighMTSSAcademicCoachingService, 
  JHMTSSBatchSheet, 
  JHMTSSBlockConfig, 
  JHMTSSStudentRowData, 
  JHMTSSMeetingValue, 
  JHMTSSAssessmentValue 
} from '../../services/juniorHighMTSSAcademicCoachingService';

const DOMAIN_OPTIONS: { value: MTSSAcademicDomain; label: string; color: string }[] = [
  { value: 'ENGLISH', label: 'English', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'NUMERACY', label: 'Numeracy', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'BAHASA_INDONESIA', label: 'Bahasa Indonesia', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const MEETING_STATUS_OPTIONS = [
  'Hadir - Progres Baik',
  'Hadir - Butuh Latihan',
  'Hadir - Belum Konsisten',
  'Sakit / Izin',
  'Alpa / Tanpa Keterangan'
];

export default function CoachingSpreadsheet() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { filters } = useOutletContext<{ filters: { academicYear: string; semester: '1' | '2' } }>();

  // CORE LIST & UTILS
  const [cases, setCases] = useState<MTSSAcademicCase[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classesList, setClassesList] = useState<Class[]>([]);
  const [batchSheets, setBatchSheets] = useState<JHMTSSBatchSheet[]>([]);
  const [loading, setLoading] = useState(true);

  // VIEW STATE
  const [sheetViewState, setSheetViewState] = useState<'LIST' | 'SETUP' | 'EDIT'>('LIST');
  const [editingSheetId, setEditingSheetId] = useState<string | undefined>(undefined);
  const [isSavingSheet, setIsSavingSheet] = useState(false);
  const [isSheetModified, setIsSheetModified] = useState(false);

  // SETUP STATE
  const [setupSubject, setSetupSubject] = useState<MTSSAcademicDomain>('NUMERACY');
  const [setupTier, setSetupTier] = useState<'Tier 2' | 'Tier 3'>('Tier 2');
  const [setupClassId, setSetupClassId] = useState<string>('');
  const [setupTeacherName, setSetupTeacherName] = useState('');
  const [meetingCount, setMeetingCount] = useState<number>(4);
  const [assessmentCount, setAssessmentCount] = useState<number>(2);

  const [studentsInClass, setStudentsInClass] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // EDIT STATE
  const [editBlocks, setEditBlocks] = useState<JHMTSSBlockConfig[]>([]);
  const [editStudentsData, setEditStudentsData] = useState<Record<string, JHMTSSStudentRowData>>({});
  const [editStudentIds, setEditStudentIds] = useState<string[]>([]);

  useEffect(() => {
    fetchCoreData();
  }, [filters.academicYear, filters.semester]);

  const fetchCoreData = async () => {
    setLoading(true);
    try {
      const [casesData, studentsData, classesData, sheetsData] = await Promise.all([
        getMTSSAcademicCases({
          schoolUnit: 'JUNIOR_HIGH',
          academicYear: filters.academicYear,
          semester: filters.semester
        }),
        getStudents(),
        getClasses(),
        juniorHighMTSSAcademicCoachingService.getBatchSheets(filters.academicYear, filters.semester)
      ]);

      setCases(casesData || []);
      setStudents(studentsData || []);
      const filteredClasses = (classesData || []).filter(c => c.academicYear === filters.academicYear && c.status !== 'archived');
      setClassesList(filteredClasses);
      setBatchSheets(sheetsData || []);

      if (currentUser && !setupTeacherName) {
        setSetupTeacherName(currentUser.displayName || currentUser.email || '');
      }
    } catch (err) {
      console.error('Error fetching core data for spreadsheet:', err);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  // LOAD STUDENTS ELIGIBLE FOR SELECTED SETUP
  useEffect(() => {
    if (sheetViewState !== 'SETUP' || !setupClassId) {
      setStudentsInClass([]);
      return;
    }

    const loadEligibleStudents = () => {
      setLoadingStudents(true);
      try {
        // Filter cases that are:
        // - JUNIOR_HIGH unit (verified via query)
        // - matches academicYear & semester
        // - matches selected classId
        // - matches currentTier (Tier 2 / Tier 3)
        // - contains setupSubject in subjectDomains
        // - status is ACTIVE
        const matchingCases = cases.filter(c => 
          c.classId === setupClassId && 
          c.currentTier === setupTier &&
          c.status === 'ACTIVE' &&
          c.subjectDomains.includes(setupSubject)
        );

        const list = matchingCases.map(c => {
          const s = students.find(stud => stud.id === c.studentId);
          return {
            studentId: c.studentId,
            studentName: c.studentName,
            className: c.className || 'SMP',
            caseId: c.id,
            goal: c.primaryConcern || '',
            teachers: c.assignedTeacherIds?.length ? 'Mentor Terpilih' : ''
          };
        });

        setStudentsInClass(list);
        setSelectedStudentIds(list.map(l => l.studentId)); // Select all by default
      } catch (err) {
        console.error('Error filtering students for setup:', err);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadEligibleStudents();
  }, [setupClassId, setupSubject, setupTier, cases, students, sheetViewState]);

  // GENERATE SPREADSHEET (SETUP -> EDIT)
  const handleGenerateSpreadsheet = () => {
    if (!setupClassId) {
      toast.error('Silakan pilih Kelas terlebih dahulu!');
      return;
    }
    if (selectedStudentIds.length === 0) {
      toast.error('Pilih minimal 1 siswa untuk dimasukkan ke spreadsheet!');
      return;
    }

    const targetClass = classesList.find(c => c.id === setupClassId);
    const className = targetClass ? targetClass.name : 'SMP';

    // 1. Build initial blocks
    const blocks: JHMTSSBlockConfig[] = [];
    for (let i = 1; i <= meetingCount; i++) {
      blocks.push({ id: `block_meeting_${i}_${Date.now()}`, type: 'MEETING', label: `Meeting ${i}` });
    }
    for (let i = 1; i <= assessmentCount; i++) {
      blocks.push({ id: `block_assessment_${i}_${Date.now()}`, type: 'ASSESSMENT', label: `Assessment ${i}` });
    }

    // 2. Build student row structure
    const rowMap: Record<string, JHMTSSStudentRowData> = {};
    selectedStudentIds.forEach(stId => {
      const studInfo = studentsInClass.find(s => s.studentId === stId);
      const matchingCase = cases.find(c => 
        c.studentId === stId && 
        c.classId === setupClassId && 
        c.subjectDomains.includes(setupSubject)
      );

      const blockValues: Record<string, any> = {};
      blocks.forEach(b => {
        blockValues[b.id] = b.type === 'MEETING' 
          ? { date: '', status: '' }
          : { result: '', dateAssessed: '', note: '' };
      });

      rowMap[stId] = {
        studentId: stId,
        studentName: studInfo?.studentName || 'Siswa',
        classId: setupClassId,
        className: className,
        goal: studInfo?.goal || '',
        teachers: setupTeacherName,
        baseline: '',
        current: '',
        target: '',
        blocks: blockValues,
        finalDiagnosis: 'Active',
        notes: '',
        dateAssessed: new Date().toISOString().split('T')[0]
      };
    });

    setEditBlocks(blocks);
    setEditStudentsData(rowMap);
    setEditStudentIds(selectedStudentIds);
    setEditingSheetId(undefined);
    setIsSheetModified(true);
    setSheetViewState('EDIT');

    toast.success('Struktur Spreadsheet berhasil dibuat! Silakan mulai mengisi.');
  };

  // OPEN EXISTING SHEET FOR EDITING
  const handleOpenExistingSheet = (sheet: JHMTSSBatchSheet) => {
    setSetupSubject(sheet.subject);
    setSetupTier(sheet.tier);
    setSetupClassId(sheet.classId);
    setSetupTeacherName(sheet.teacherName);

    setEditBlocks(sheet.orderedBlocks || []);
    setEditStudentsData(sheet.studentsData || {});
    setEditStudentIds(sheet.studentIds || []);
    setEditingSheetId(sheet.id);
    setIsSheetModified(false);
    setSheetViewState('EDIT');
  };

  // DELETE BATCH SHEET
  const handleDeleteSheet = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus spreadsheet batch coaching ini? Data di dalam spreadsheet ini akan terhapus.')) return;
    try {
      await juniorHighMTSSAcademicCoachingService.deleteBatchSheet(id);
      toast.success('Spreadsheet berhasil dihapus');
      fetchCoreData();
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus spreadsheet');
    }
  };

  // EDIT SPREADSHEET CELL
  const handleEditCell = (studentId: string, blockId: string, field: string, value: any) => {
    setIsSheetModified(true);
    setEditStudentsData(prev => {
      const row = prev[studentId];
      if (!row) return prev;
      const blockVal = row.blocks[blockId] || {};
      return {
        ...prev,
        [studentId]: {
          ...row,
          blocks: {
            ...row.blocks,
            [blockId]: {
              ...blockVal,
              [field]: value
            }
          }
        }
      };
    });
  };

  // EDIT SPREADSHEET ROW ROW FIELD
  const handleEditRowField = (studentId: string, field: keyof JHMTSSStudentRowData, value: any) => {
    setIsSheetModified(true);
    setEditStudentsData(prev => {
      const row = prev[studentId];
      if (!row) return prev;
      return {
        ...prev,
        [studentId]: {
          ...row,
          [field]: value
        }
      };
    });
  };

  // ADD BLOCK ON THE FLY
  const handleAddBlockOnTheFly = (type: 'MEETING' | 'ASSESSMENT') => {
    const blockCount = editBlocks.filter(b => b.type === type).length + 1;
    const label = type === 'MEETING' ? `Meeting ${blockCount}` : `Assessment ${blockCount}`;
    const id = `block_${type.toLowerCase()}_${Date.now()}`;
    const newBlock: JHMTSSBlockConfig = { id, type, label };

    setEditBlocks([...editBlocks, newBlock]);
    setIsSheetModified(true);

    setEditStudentsData(prev => {
      const updated = { ...prev };
      editStudentIds.forEach(stId => {
        if (updated[stId]) {
          updated[stId] = {
            ...updated[stId],
            blocks: {
              ...updated[stId].blocks,
              [newBlock.id]: type === 'MEETING' 
                ? { date: '', status: '' }
                : { result: '', dateAssessed: '', note: '' }
            }
          };
        }
      });
      return updated;
    });

    toast.success(`Berhasil menambahkan kolom ${label}!`);
  };

  // REMOVE BLOCK ON THE FLY
  const handleRemoveBlockOnTheFly = (blockId: string, label: string) => {
    if (!window.confirm(`Hapus kolom "${label}"? Data di kolom ini akan hilang.`)) return;

    setEditBlocks(editBlocks.filter(b => b.id !== blockId));
    setIsSheetModified(true);

    setEditStudentsData(prev => {
      const updated = { ...prev };
      editStudentIds.forEach(stId => {
        if (updated[stId]) {
          const blocksCopy = { ...updated[stId].blocks };
          delete blocksCopy[blockId];
          updated[stId] = {
            ...updated[stId],
            blocks: blocksCopy
          };
        }
      });
      return updated;
    });

    toast.success(`Kolom ${label} berhasil dihapus.`);
  };

  // SAVE SPREADSHEET
  const handleSaveSpreadsheet = async () => {
    try {
      setIsSavingSheet(true);
      const selectedClass = classesList.find(c => c.id === setupClassId);
      const className = selectedClass ? selectedClass.name : 'SMP';

      const payload: Omit<JHMTSSBatchSheet, 'id' | 'createdAt' | 'updatedAt'> = {
        academicYear: filters.academicYear,
        semester: filters.semester,
        subject: setupSubject,
        tier: setupTier,
        classId: setupClassId,
        className,
        teacherName: setupTeacherName,
        orderedBlocks: editBlocks,
        studentsData: editStudentsData,
        studentIds: editStudentIds
      };

      const docId = await juniorHighMTSSAcademicCoachingService.saveBatchSheet(payload, editingSheetId);
      setEditingSheetId(docId);
      setIsSheetModified(false);
      toast.success('Spreadsheet dan sesi bimbingan siswa berhasil disimpan!');
      
      // Reload and return to list
      await fetchCoreData();
      setSheetViewState('LIST');
    } catch (err) {
      console.error('Error saving batch spreadsheet:', err);
      toast.error('Gagal menyimpan spreadsheet bimbingan');
    } finally {
      setIsSavingSheet(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* MODULE INTRO */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-6 transform rotate-12">
          <FileSpreadsheet size={180} />
        </div>
        <div className="relative z-10 max-w-3xl space-y-2">
          <span className="bg-emerald-500/30 text-emerald-100 border border-emerald-400/30 text-[9px] font-mono font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
            Batch Coaching Spreadsheet
          </span>
          <h2 className="text-2xl font-black italic uppercase tracking-tight">
            Junior High <span className="text-emerald-300">Coaching Spreadsheet</span>
          </h2>
          <p className="text-xs text-emerald-100 font-medium leading-relaxed">
            Kelola, rekap, dan catat bimbingan akademik massal (Coaching & Intervensi) untuk siswa SMP.
            Data yang disimpan secara otomatis disinkronkan ke dalam log sesi/timeline siswa masing-masing di Tier 2 & Tier 3.
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <div className="py-24 text-center bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-4" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">Memuat Data Spreadsheet...</p>
          </div>
        ) : (
          <motion.div
            key={sheetViewState}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* STATE 1: LIST VIEW */}
            {sheetViewState === 'LIST' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                      Daftar Coaching Spreadsheet SMP
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Berikut bimbingan massal yang saat ini aktif untuk Semester ini.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSetupClassId('');
                      setStudentsInClass([]);
                      setSheetViewState('SETUP');
                    }}
                    className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Plus size={16} />
                    Buat Spreadsheet
                  </button>
                </div>

                {batchSheets.length === 0 ? (
                  <div className="py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 text-center">
                    <FileSpreadsheet size={56} className="opacity-20 mb-4 text-emerald-600" />
                    <p className="font-black text-slate-750 text-sm uppercase tracking-wider">Belum Ada Spreadsheet Tersimpan</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm font-medium">
                      Silakan klik tombol <b>Buat Spreadsheet</b> di atas untuk mulai merancang lembar bimbingan massal.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batchSheets.map(sheet => {
                      const dom = DOMAIN_OPTIONS.find(d => d.value === sheet.subject);
                      return (
                        <div 
                          key={sheet.id}
                          className="bg-white rounded-3xl border border-gray-100 hover:border-emerald-100 hover:shadow-lg transition-all p-6 flex flex-col justify-between space-y-4 shadow-sm relative group"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border ${dom?.color || 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                {dom?.label || sheet.subject}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 font-mono">
                                {sheet.academicYear} • S{sheet.semester}
                              </span>
                            </div>

                            <div>
                              <h4 className="font-black text-slate-800 text-base leading-tight group-hover:text-emerald-600 transition-colors">
                                Kelas {sheet.className} ({sheet.tier})
                              </h4>
                              <p className="text-xs text-slate-400 font-medium mt-1">
                                Mentor: <b>{sheet.teacherName}</b>
                              </p>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono font-bold text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <div>
                                <span className="text-[9px] text-slate-400 block uppercase tracking-wider">Siswa</span>
                                <span className="text-slate-800 text-sm font-black">{sheet.studentIds?.length || 0}</span>
                              </div>
                              <div className="w-px h-6 bg-slate-200" />
                              <div>
                                <span className="text-[9px] text-slate-400 block uppercase tracking-wider">Total Kolom</span>
                                <span className="text-slate-800 text-sm font-black">{sheet.orderedBlocks?.length || 0}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                            <button
                              onClick={() => handleOpenExistingSheet(sheet)}
                              className="flex-1 py-2 text-center bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Buka & Edit
                            </button>
                            <button
                              onClick={() => handleDeleteSheet(sheet.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-100 rounded-xl transition-all cursor-pointer"
                              title="Hapus Spreadsheet"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STATE 2: SETUP WIZARD */}
            {sheetViewState === 'SETUP' && (
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 sm:p-8 space-y-8 max-w-4xl mx-auto">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                    Desain Struktur Spreadsheet Baru
                  </h3>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest font-mono">
                    Konfigurasikan sasaran bimbingan, sasaran kelas, dan pre-kolom sesi
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Subject and Tier */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block mb-1.5">Subject Domain</label>
                      <div className="grid grid-cols-3 gap-2">
                        {DOMAIN_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSetupSubject(opt.value)}
                            className={`px-3 py-2.5 rounded-xl text-center text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                              setupSubject === opt.value
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block mb-1.5">Target MTSS Tier</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Tier 2', 'Tier 3'].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setSetupTier(t as any)}
                            className={`px-3 py-2.5 rounded-xl text-center text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                              setupTier === t
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block mb-1.5">Pilih Kelas</label>
                      <select
                        value={setupClassId}
                        onChange={(e) => setSetupClassId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider outline-none focus:bg-white focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="">-- Pilih Kelas --</option>
                        {classesList.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block mb-1.5">Nama Mentor / Pengajar</label>
                      <input
                        type="text"
                        value={setupTeacherName}
                        onChange={(e) => setSetupTeacherName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:bg-white focus:border-emerald-500"
                        placeholder="Masukkan nama pengajar..."
                      />
                    </div>
                  </div>

                  {/* Columns Counts */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block mb-1.5">
                          Jumlah Sesi Meeting
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={meetingCount}
                          onChange={(e) => setMeetingCount(parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black outline-none focus:bg-white focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-450 block mb-1.5">
                          Jumlah Sesi Evaluasi
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={assessmentCount}
                          onChange={(e) => setAssessmentCount(parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black outline-none focus:bg-white focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Eligible Student Selection */}
                    <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          Pilih Siswa Aktif ({studentsInClass.length})
                        </span>
                        {studentsInClass.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedStudentIds.length === studentsInClass.length) {
                                setSelectedStudentIds([]);
                              } else {
                                setSelectedStudentIds(studentsInClass.map(s => s.studentId));
                              }
                            }}
                            className="text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700 cursor-pointer"
                          >
                            {selectedStudentIds.length === studentsInClass.length ? 'Batal Semua' : 'Pilih Semua'}
                          </button>
                        )}
                      </div>

                      {loadingStudents ? (
                        <p className="text-[11px] font-semibold text-slate-400">Menyaring siswa...</p>
                      ) : !setupClassId ? (
                        <p className="text-[11px] font-semibold text-slate-400 italic">Silakan pilih kelas terlebih dahulu untuk menyaring siswa.</p>
                      ) : studentsInClass.length === 0 ? (
                        <div className="bg-amber-50 text-amber-800 border border-amber-200 p-3 rounded-xl flex items-start gap-2">
                          <Info size={14} className="mt-0.5 shrink-0" />
                          <p className="text-[11px] font-semibold leading-relaxed">
                            Tidak ditemukan siswa dengan kasus bimbingan aktif <b>({setupSubject} - {setupTier})</b> di kelas terpilih untuk Semester ini.
                            <br />
                            <span className="text-[10px] text-amber-700">Pastikan siswa sudah masuk Tier 2 / Tier 3 di menu monitoring utama.</span>
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-2">
                          {studentsInClass.map(st => (
                            <label 
                              key={st.studentId}
                              className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-100 hover:border-emerald-100 cursor-pointer text-xs font-bold text-slate-800"
                            >
                              <input
                                type="checkbox"
                                checked={selectedStudentIds.includes(st.studentId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentIds([...selectedStudentIds, st.studentId]);
                                  } else {
                                    setSelectedStudentIds(selectedStudentIds.filter(id => id !== st.studentId));
                                  }
                                }}
                                className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                              />
                              <span className="flex-1 truncate">{st.studentName}</span>
                              <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">{st.className}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSheetViewState('LIST')}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSpreadsheet}
                    disabled={studentsInClass.length === 0}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
                  >
                    Rancang Spreadsheet
                  </button>
                </div>
              </div>
            )}

            {/* STATE 3: EDIT SPREADSHEET */}
            {sheetViewState === 'EDIT' && (
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                {/* FLOATING TOP BAR WITH CONTROLS */}
                <div className="bg-slate-900 text-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-600 text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">
                        Mode Edit Spreadsheet
                      </span>
                      <span className="text-[11px] font-bold text-slate-400 font-mono">
                        {filters.academicYear} - Semester {filters.semester}
                      </span>
                    </div>
                    <h3 className="text-lg font-black tracking-tight text-white leading-none">
                      Lembar Coaching Batch: {setupSubject} ({setupTier})
                    </h3>
                    <p className="text-[11px] font-medium text-slate-400">
                      Pengajar: <b>{setupTeacherName}</b> | Jumlah Siswa: <b>{editStudentIds.length}</b> siswa
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddBlockOnTheFly('MEETING')}
                      className="bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-wider py-2 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors text-white"
                    >
                      <Plus size={12} />
                      + Sesi Pertemuan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddBlockOnTheFly('ASSESSMENT')}
                      className="bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-wider py-2 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors text-white"
                    >
                      <Plus size={12} />
                      + Sesi Evaluasi
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSpreadsheet}
                      disabled={isSavingSheet}
                      className="bg-emerald-600 hover:bg-emerald-750 disabled:bg-slate-700 text-white text-[10px] font-black uppercase tracking-wider py-2 px-5 rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
                    >
                      <Save size={12} />
                      {isSavingSheet ? 'Menyimpan...' : 'Simpan Semua'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSheetModified && !window.confirm('Tutup tanpa menyimpan perubahan?')) return;
                        setSheetViewState('LIST');
                      }}
                      className="bg-slate-800 hover:bg-slate-750 text-[10px] font-black uppercase tracking-wider py-2 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors text-white"
                    >
                      <X size={12} />
                      Tutup
                    </button>
                  </div>
                </div>

                {/* HORIZONTALLY SCROLLABLE BATCH SPREADSHEET */}
                <div className="overflow-x-auto w-full max-h-[65vh] overflow-y-auto">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      {/* LEVEL 1: GROUP HEADERS */}
                      <tr className="bg-slate-100 text-slate-700 uppercase text-[9px] font-black tracking-wider border-b border-slate-200">
                        {/* Identitas (Left sticky) */}
                        <th colSpan={3} className="py-3 px-3 text-center border-r border-slate-200 sticky left-0 bg-slate-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          Identitas Siswa
                        </th>
                        {/* MTSS Context */}
                        <th colSpan={6} className="py-3 px-3 text-center border-r border-slate-200 bg-slate-50/50">
                          Konteks Akademik & Sasaran
                        </th>
                        {/* Dynamic Sesi blocks */}
                        {editBlocks.map((block) => (
                          <th
                            key={block.id}
                            colSpan={block.type === 'MEETING' ? 2 : 3}
                            className={`py-3 px-3 text-center border-r border-slate-200 text-white relative font-black ${
                              block.type === 'MEETING' ? 'bg-blue-900' : 'bg-purple-900'
                            }`}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <span>{block.label}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBlockOnTheFly(block.id, block.label)}
                                className="text-white/60 hover:text-white transition-colors cursor-pointer"
                                title="Hapus kolom ini"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </th>
                        ))}
                        {/* Outcome (Right) */}
                        <th colSpan={3} className="py-3 px-3 text-center bg-teal-950 text-white font-black">
                          Evaluasi Akhir / Outcome
                        </th>
                      </tr>

                      {/* LEVEL 2: COLUMN HEADERS */}
                      <tr className="bg-slate-50 text-slate-600 uppercase text-[8px] font-black tracking-wider border-b border-slate-200 sticky top-0 bg-white z-10 shadow-sm">
                        {/* Sticky left */}
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 sticky left-0 bg-slate-50 z-20 w-10">No</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 sticky left-10 bg-slate-50 z-20 w-44">Nama Siswa</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 sticky left-54 bg-slate-50 z-20 w-16 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Kelas</th>
                        
                        {/* Context info */}
                        <th className="py-2.5 px-3 border-r border-slate-200 bg-white min-w-[240px]">Goal / Sasaran</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 bg-white min-w-[90px]">Tier</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 bg-white min-w-[120px]">Mentor</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 bg-white min-w-[150px]">Baseline Score</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 bg-white min-w-[150px]">Current Score</th>
                        <th className="py-2.5 px-2 text-center border-r border-slate-200 bg-white min-w-[150px]">Target Score</th>

                        {/* Dynamic Block subheaders */}
                        {editBlocks.map((block) => (
                          <React.Fragment key={`sub-${block.id}`}>
                            {block.type === 'MEETING' ? (
                              <>
                                <th className="py-2.5 px-2 border-r border-slate-200 min-w-[120px] bg-blue-50/40 text-blue-900">Tanggal</th>
                                <th className="py-2.5 px-2 border-r border-slate-200 min-w-[130px] bg-blue-50/40 text-blue-900 text-center">Status / Progress</th>
                              </>
                            ) : (
                              <>
                                <th className="py-2.5 px-2 border-r border-slate-200 min-w-[90px] bg-purple-50/40 text-purple-900 text-center">Hasil</th>
                                <th className="py-2.5 px-2 border-r border-slate-200 min-w-[100px] bg-purple-50/40 text-purple-900">Tanggal</th>
                                <th className="py-2.5 px-2 border-r border-slate-200 min-w-[130px] bg-purple-50/40 text-purple-900">Catatan</th>
                              </>
                            )}
                          </React.Fragment>
                        ))}

                        {/* Right headers */}
                        <th className="py-2.5 px-2 border-r border-teal-900 min-w-[100px] bg-teal-50 text-teal-950">Tgl Penilaian</th>
                        <th className="py-2.5 px-2 border-r border-teal-900 min-w-[120px] bg-teal-50 text-teal-950 text-center">Outcome Akhir</th>
                        <th className="py-2.5 px-3 bg-teal-50 text-teal-950 min-w-[160px]">Catatan Akhir</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {editStudentIds.map((stId, sIdx) => {
                        const row = editStudentsData[stId];
                        if (!row) return null;

                        return (
                          <tr key={stId} className="hover:bg-slate-50/60 font-semibold text-slate-800 transition-colors">
                            {/* Sticky Identitas */}
                            <td className="py-3 px-2 text-center border-r border-slate-200 sticky left-0 bg-white z-10 font-mono text-[10px] text-slate-400">
                              {sIdx + 1}
                            </td>
                            <td className="py-3 px-3 border-r border-slate-200 sticky left-10 bg-white z-10 font-black truncate max-w-xs text-slate-900" title={row.studentName}>
                              {row.studentName}
                            </td>
                            <td className="py-3 px-2 text-center border-r border-slate-200 sticky left-54 bg-white z-10 font-black text-slate-500 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                              {row.className}
                            </td>

                            {/* Context Column Inputs */}
                            {/* Goal */}
                            <td className="py-2 px-2 border-r border-slate-200">
                              <textarea
                                value={row.goal}
                                onChange={(e) => handleEditRowField(stId, 'goal', e.target.value)}
                                className="w-full h-16 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Masukkan goal/tujuan..."
                              />
                            </td>
                            {/* Tier */}
                            <td className="py-3 px-2 text-center border-r border-slate-200 whitespace-nowrap">
                              <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border ${
                                setupTier === 'Tier 2' ? 'bg-amber-50 text-amber-850 border-amber-200' : 'bg-rose-50 text-rose-850 border-rose-200'
                              }`}>
                                {setupTier}
                              </span>
                            </td>
                            {/* Mentor */}
                            <td className="py-2 px-2 border-r border-slate-200">
                              <textarea
                                value={row.teachers}
                                onChange={(e) => handleEditRowField(stId, 'teachers', e.target.value)}
                                className="w-full h-16 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Nama mentor..."
                              />
                            </td>
                            {/* Baseline */}
                            <td className="py-2 px-2 border-r border-slate-200">
                              <textarea
                                value={row.baseline}
                                onChange={(e) => handleEditRowField(stId, 'baseline', e.target.value)}
                                className="w-full h-16 text-center bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none font-mono"
                                placeholder="Baseline"
                              />
                            </td>
                            {/* Current */}
                            <td className="py-2 px-2 border-r border-slate-200">
                              <textarea
                                value={row.current}
                                onChange={(e) => handleEditRowField(stId, 'current', e.target.value)}
                                className="w-full h-16 text-center bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none font-mono text-emerald-600"
                                placeholder="Current"
                              />
                            </td>
                            {/* Target */}
                            <td className="py-2 px-2 border-r border-slate-200">
                              <textarea
                                value={row.target}
                                onChange={(e) => handleEditRowField(stId, 'target', e.target.value)}
                                className="w-full h-16 text-center bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none font-mono text-blue-600"
                                placeholder="Target"
                              />
                            </td>

                            {/* Dynamic Sesi blocks cell inputs */}
                            {editBlocks.map((block) => {
                              const blockVal = row.blocks[block.id] || {};

                              if (block.type === 'MEETING') {
                                const mVal = blockVal as JHMTSSMeetingValue;
                                return (
                                  <React.Fragment key={`cell-${stId}-${block.id}`}>
                                    {/* Date */}
                                    <td className="py-2 px-2 border-r border-slate-200 bg-blue-50/5">
                                      <input
                                        type="date"
                                        value={mVal.date || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'date', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                                      />
                                    </td>
                                    {/* Status dropdown */}
                                    <td className="py-2 px-2 border-r border-slate-200 bg-blue-50/5 text-center">
                                      <select
                                        value={mVal.status || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'status', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs font-bold focus:outline-none cursor-pointer"
                                      >
                                        <option value="">Pilih Status</option>
                                        {MEETING_STATUS_OPTIONS.map(opt => (
                                          <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                      </select>
                                    </td>
                                  </React.Fragment>
                                );
                              } else {
                                const aVal = blockVal as JHMTSSAssessmentValue;
                                return (
                                  <React.Fragment key={`cell-${stId}-${block.id}`}>
                                    {/* Result */}
                                    <td className="py-2 px-2 border-r border-slate-200 bg-purple-50/5">
                                      <input
                                        type="text"
                                        value={aVal.result || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'result', e.target.value)}
                                        className="w-full text-center bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold focus:outline-none focus:bg-white"
                                        placeholder="Skor"
                                      />
                                    </td>
                                    {/* Date Assessed */}
                                    <td className="py-2 px-2 border-r border-slate-200 bg-purple-50/5">
                                      <input
                                        type="date"
                                        value={aVal.dateAssessed || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'dateAssessed', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                                      />
                                    </td>
                                    {/* Note */}
                                    <td className="py-2 px-2 border-r border-slate-200 bg-purple-50/5">
                                      <textarea
                                        value={aVal.note || ''}
                                        onChange={(e) => handleEditCell(stId, block.id, 'note', e.target.value)}
                                        className="w-full h-16 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                        placeholder="Catatan..."
                                      />
                                    </td>
                                  </React.Fragment>
                                );
                              }
                            })}

                            {/* Final Assessment Columns */}
                            {/* Date Assessed */}
                            <td className="py-2 px-2 border-r border-teal-900 bg-teal-50/5">
                              <input
                                type="date"
                                value={row.dateAssessed || ''}
                                onChange={(e) => handleEditRowField(stId, 'dateAssessed', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:bg-white"
                              />
                            </td>
                            {/* Outcome Option */}
                            <td className="py-2 px-2 border-r border-teal-900 bg-teal-50/5">
                              <select
                                value={row.finalDiagnosis || 'Active'}
                                onChange={(e) => handleEditRowField(stId, 'finalDiagnosis', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs font-black uppercase text-teal-950 focus:outline-none cursor-pointer"
                              >
                                <option value="Active">Tetap di Tier 2 (Active)</option>
                                <option value="Achieved">Lulus / Selesai (Passed Tier 2)</option>
                                <option value="Escalated">Naik ke Tier 3 (Escalated)</option>
                              </select>
                            </td>
                            {/* Final Notes */}
                            <td className="py-2 px-2 bg-teal-50/5">
                              <textarea
                                value={row.notes || ''}
                                onChange={(e) => handleEditRowField(stId, 'notes', e.target.value)}
                                className="w-full h-16 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:bg-white rounded px-2 py-1 text-xs font-semibold focus:outline-none resize-none"
                                placeholder="Catatan akhir kelulusan/status..."
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 font-mono uppercase tracking-wider">
                  <span>← Tarik slider horizontal untuk melihat kolom pertemuan & evaluasi lainnya</span>
                  <span className="text-emerald-600">Pastikan klik "Simpan Semua" untuk mensinkronkan data sesi siswa</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
