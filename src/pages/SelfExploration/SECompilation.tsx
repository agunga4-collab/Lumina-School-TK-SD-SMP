import * as React from 'react';
import { 
  Search, Filter, ClipboardCheck, ClipboardList, Copy, 
  AlertCircle, Sparkles, Loader2, Calendar, FileText, ChevronRight, User
} from 'lucide-react';
import { 
  getSEPeriods, getActiveStudents, db 
} from '../../lib/firebase';
import { SEReflectionCycle, SEMonthlyReflection, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { toast } from 'sonner';

const normalizeGrade = (raw: any): number | null => {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const lower = str.toLowerCase();
  if (lower === 'vii' || lower === 'vii.' || lower.includes('kelas 7') || lower.includes('grade 7') || lower === '7' || lower === 'seven') return 7;
  if (lower === 'viii' || lower === 'viii.' || lower.includes('kelas 8') || lower.includes('grade 8') || lower === '8' || lower === 'eight') return 8;
  if (lower === 'ix' || lower === 'ix.' || lower.includes('kelas 9') || lower.includes('grade 9') || lower === '9' || lower === 'nine') return 9;
  
  if (/\b7\b/.test(lower) || /\bvii\b/.test(lower)) return 7;
  if (/\b8\b/.test(lower) || /\bviii\b/.test(lower)) return 8;
  if (/\b9\b/.test(lower) || /\bix\b/.test(lower)) return 9;

  const num = parseInt(str, 10);
  if (num === 7 || num === 8 || num === 9) return num;
  return null;
};

export default function SECompilation() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
  const navigate = useNavigate();

  // Filters state
  const [selectedYear, setSelectedYear] = React.useState<string>(activeYear || '');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedCycleId, setSelectedCycleId] = React.useState<string>('');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Loaded data state
  const [classes, setClasses] = React.useState<any[]>([]);
  const [allCycles, setAllCycles] = React.useState<SEReflectionCycle[]>([]);
  const [roster, setRoster] = React.useState<Student[]>([]);
  const [reflections, setReflections] = React.useState<SEMonthlyReflection[]>([]);

  // Loading states
  const [initialLoading, setInitialLoading] = React.useState<boolean>(true);
  const [dataLoading, setDataLoading] = React.useState<boolean>(false);

  // Check Junior High staff / admin authorized roles
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

  // Handle activeYear updates
  React.useEffect(() => {
    if (activeYear && !selectedYear) {
      setSelectedYear(activeYear);
    }
  }, [activeYear]);

  // Phase 1: Fetch classes & cycles
  const fetchMetadata = React.useCallback(async () => {
    if (!isAuthorized || !selectedYear) return;
    setInitialLoading(true);
    try {
      // Fetch Classes for Junior High
      const q = query(collection(db, 'classes'), where('unitId', '==', 'JUNIOR_HIGH'));
      const cSnap = await getDocs(q);
      const filteredClasses = cSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(c => c.academicYear === selectedYear && c.status === 'active')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setClasses(filteredClasses);

      if (filteredClasses.length > 0) {
        // Keep selected class if valid in new list, else use first one
        const exists = filteredClasses.some(c => c.id === selectedClassId);
        if (!exists) {
          setSelectedClassId(filteredClasses[0].id);
        }
      } else {
        setSelectedClassId('');
      }

      // Fetch Reflection Cycles
      const cycleSnap = await getDocs(query(collection(db, 'seReflectionCycles'), where('unit', '==', 'JUNIOR_HIGH')));
      const cyclesList = cycleSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SEReflectionCycle));
      setAllCycles(cyclesList);

    } catch (err) {
      console.error("Error fetching SE compilation metadata:", err);
      toast.error("Gagal memuat metadata kelas & siklus.");
    } finally {
      setInitialLoading(false);
    }
  }, [isAuthorized, selectedYear, selectedClassId]);

  React.useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Filter cycles based on selected Year & Semester
  const currentCycles = React.useMemo(() => {
    return allCycles.filter(c => c.academicYear === selectedYear && c.semester === selectedSemester);
  }, [allCycles, selectedYear, selectedSemester]);

  // Keep selected cycle valid
  React.useEffect(() => {
    if (currentCycles.length > 0) {
      const exists = currentCycles.some(c => c.id === selectedCycleId);
      if (!exists) {
        setSelectedCycleId(currentCycles[0].id || '');
      }
    } else {
      setSelectedCycleId('');
    }
  }, [currentCycles, selectedCycleId]);

  // Phase 2: Fetch student roster and their reflections
  const fetchRosterAndReflections = React.useCallback(async () => {
    if (!selectedClassId || !selectedCycleId) {
      setRoster([]);
      setReflections([]);
      return;
    }
    setDataLoading(true);
    try {
      // 1. Get student roster
      const rosterData = await getActiveStudents(selectedClassId, selectedYear);
      setRoster(rosterData || []);

      // 2. Fetch reflections for selected cycle
      const q = query(
        collection(db, 'seMonthlyReflections'),
        where('unit', '==', 'JUNIOR_HIGH'),
        where('reflectionCycleId', '==', selectedCycleId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SEMonthlyReflection));
      setReflections(list);

    } catch (err) {
      console.error("Error fetching roster & reflections:", err);
      toast.error("Gagal memuat data refleksi kelas.");
    } finally {
      setDataLoading(false);
    }
  }, [selectedClassId, selectedCycleId, selectedYear]);

  React.useEffect(() => {
    fetchRosterAndReflections();
  }, [fetchRosterAndReflections]);

  // Sort and Filter Roster
  const sortedRoster = React.useMemo(() => {
    return [...roster]
      .filter(s => {
        const name = s.name || s.fullName || '';
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      })
      .sort((a: any, b: any) => {
        const numA = Number(a.nomorAbsen || 999);
        const numB = Number(b.nomorAbsen || 999);
        if (numA !== numB) return numA - numB;
        const nameA = a.name || a.fullName || '';
        const nameB = b.name || b.fullName || '';
        return nameA.localeCompare(nameB);
      });
  }, [roster, searchQuery]);

  // Selected Class details
  const currentClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Determine Grade 9 context
  const isGrade9 = React.useMemo(() => {
    if (currentClassObj) {
      const g = normalizeGrade(currentClassObj.grade) || normalizeGrade(currentClassObj.gradeLevel) || normalizeGrade(currentClassObj.level);
      if (g === 9) return true;
      if (g === 7 || g === 8) return false;
    }
    if (sortedRoster.length > 0) {
      const firstStudentGrade = normalizeGrade(sortedRoster[0].grade) || normalizeGrade(sortedRoster[0].gradeLevel) || normalizeGrade(sortedRoster[0].level);
      if (firstStudentGrade === 9) return true;
    }
    return false;
  }, [currentClassObj, sortedRoster]);

  // Normalize cell text to keep paste layout perfectly aligned in single cell
  const formatCellForTSV = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.replace(/[\r\n]+/g, " ").replace(/\t/g, " ").trim();
  };

  // Fallback copy utility for iframe environments
  const copyToClipboardWithFallback = (text: string): Promise<void> => {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      return new Promise<void>((resolve, reject) => {
        if (document.execCommand('copy')) {
          resolve();
        } else {
          reject(new Error("execCommand copy failed"));
        }
        document.body.removeChild(textArea);
      });
    }
  };

  // TSV generation and Clipboard copy action
  const handleCopy = (includeHeaders: boolean) => {
    if (sortedRoster.length === 0) {
      toast.error("Tidak ada data siswa untuk disalin.");
      return;
    }

    const rows: string[][] = [];

    // Add headers if requested
    if (includeHeaders) {
      if (isGrade9) {
        rows.push(["NO", "NAMA", "SE_01 Strand", "SE_01", "MONTHLY REFLECTION 1"]);
      } else {
        rows.push(["NO", "NAMA", "SE_01 Strand", "SE_01", "MONTHLY REFLECTION 1", "SE_02 Strand", "SE_02", "MONTHLY REFLECTION 2"]);
      }
    }

    // Process each student row
    sortedRoster.forEach((student, index) => {
      const deterministicId = `${student.id}_${selectedCycleId}`;
      let reflection = reflections.find(r => r.id === deterministicId);
      if (!reflection) {
        reflection = reflections.find(r => r.studentId === student.id && r.reflectionCycleId === selectedCycleId);
      }

      const slot1 = reflection?.slots?.find(s => s.slot === 1);
      const slot2 = reflection?.slots?.find(s => s.slot === 2);

      const no = String(student.nomorAbsen || index + 1);
      const name = student.name || student.fullName || "";
      const se01Strand = slot1?.strandNameSnapshot || "";
      const se01Act = slot1?.activityNameSnapshot || "";
      const refText1 = slot1?.reflectionText || "";

      if (isGrade9) {
        rows.push([
          no,
          name,
          se01Strand,
          se01Act,
          refText1
        ].map(formatCellForTSV));
      } else {
        const se02Strand = slot2?.strandNameSnapshot || "";
        const se02Act = slot2?.activityNameSnapshot || "";
        const refText2 = slot2?.reflectionText || "";

        rows.push([
          no,
          name,
          se01Strand,
          se01Act,
          refText1,
          se02Strand,
          se02Act,
          refText2
        ].map(formatCellForTSV));
      }
    });

    const tsvContent = rows.map(r => r.join("\t")).join("\n");

    copyToClipboardWithFallback(tsvContent).then(() => {
      toast.success(`Data ${sortedRoster.length} siswa berhasil disalin. Tempelkan mulai baris pertama data di Google Sheets.`);
    }).catch(err => {
      console.error("Gagal menyalin data ke clipboard:", err);
      toast.error("Gagal menyalin data. Pastikan browser memberikan izin clipboard.");
    });
  };

  if (!profile) return null;

  if (!isAuthorized) {
    return (
      <div className="p-10 max-w-lg mx-auto mt-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
        <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-black uppercase italic tracking-tight text-gray-900 mb-2">Akses Terbatas</h2>
        <p className="text-sm text-gray-500 mb-6">Hanya Staf Pengajar atau Admin Junior High yang memiliki akses ke modul kompilasi refleksi ini.</p>
        <button 
          onClick={() => navigate('/self-exploration')}
          className="bg-gray-900 text-white px-8 py-3 rounded-full text-xs font-black uppercase tracking-wider hover:bg-gray-800 transition-all"
        >
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <div className="flex items-center gap-2 text-blue-600">
             <ClipboardList size={20} />
             <span className="text-xs font-black uppercase tracking-widest">Junior High</span>
           </div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase mt-1">Kompilasi Refleksi SE</h1>
           <p className="text-sm text-gray-500 font-medium mt-1">Salin data refleksi mandiri siswa untuk disematkan langsung ke Google Sheets.</p>
        </div>
        
        {/* Navigation Tabs bar inside page */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/self-exploration/class')}
            className="flex items-center gap-2 px-6 py-3.5 bg-white border border-gray-100 hover:border-gray-200 text-gray-600 rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-sm transition-all active:scale-95"
          >
            Pantau Kelas SE <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Filter size={14} /> Filter Kompilasi Data
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Academic Year */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block pl-2">Tahun Ajaran</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold text-xs uppercase tracking-wider focus:ring-2 focus:ring-blue-600"
            >
              <option value="2024/2025">2024/2025</option>
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          {/* Semester */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block pl-2">Semester</label>
            <select
              value={selectedSemester}
              onChange={e => setSelectedSemester(e.target.value)}
              className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold text-xs uppercase tracking-wider focus:ring-2 focus:ring-blue-600"
            >
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>

          {/* Class selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block pl-2">Kelas</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold text-xs uppercase tracking-wider focus:ring-2 focus:ring-blue-600"
              disabled={initialLoading}
            >
              {initialLoading ? (
                <option value="">Memuat kelas...</option>
              ) : classes.length === 0 ? (
                <option value="">Tidak ada kelas</option>
              ) : (
                classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              )}
            </select>
          </div>

          {/* Reflection Cycle selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block pl-2">Siklus Refleksi</label>
            <select
              value={selectedCycleId}
              onChange={e => setSelectedCycleId(e.target.value)}
              className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold text-xs uppercase tracking-wider focus:ring-2 focus:ring-blue-600"
              disabled={initialLoading}
            >
              {initialLoading ? (
                <option value="">Memuat siklus...</option>
              ) : currentCycles.length === 0 ? (
                <option value="">Tidak ada siklus aktif</option>
              ) : (
                currentCycles.map(cy => <option key={cy.id || ''} value={cy.id || ''}>{cy.title || cy.periodKey}</option>)
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Main Data Section */}
      {!selectedClassId || !selectedCycleId ? (
        <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Silakan lengkapi pilihan filter kelas dan siklus refleksi.</p>
        </div>
      ) : dataLoading ? (
        <div className="py-24 text-center">
          <Loader2 className="animate-spin w-12 h-12 text-blue-600 mx-auto mb-4" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat data kompilasi...</p>
        </div>
      ) : roster.length === 0 ? (
        <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada siswa terdaftar di kelas terpilih untuk tahun ajaran ini.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            {/* Student Search */}
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Cari nama siswa..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-11 pr-4 bg-gray-50 rounded-2xl border-none text-xs font-bold focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            {/* Copy options buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleCopy(true)}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95"
                title="Salin data beserta baris judul kolom"
              >
                <ClipboardList size={14} /> Salin dengan Header
              </button>
              
              <button
                onClick={() => handleCopy(false)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-blue-100 active:scale-95"
                title="Salin baris data saja (pilihan utama untuk paste Google Sheets)"
              >
                <Copy size={14} /> Salin Tabel untuk Google Sheets
              </button>
            </div>
          </div>

          {/* Compilation Table */}
          <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <th className="px-6 py-4 text-center w-16">NO</th>
                    <th className="px-6 py-4 w-60">NAMA</th>
                    <th className="px-6 py-4 w-40">SE_01 Strand</th>
                    <th className="px-6 py-4 w-52">SE_01</th>
                    <th className="px-6 py-4 max-w-[400px]">MONTHLY REFLECTION 1</th>
                    {!isGrade9 && (
                      <>
                        <th className="px-6 py-4 w-40">SE_02 Strand</th>
                        <th className="px-6 py-4 w-52">SE_02</th>
                        <th className="px-6 py-4 max-w-[400px]">MONTHLY REFLECTION 2</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedRoster.length === 0 ? (
                    <tr>
                      <td colSpan={isGrade9 ? 5 : 8} className="px-6 py-12 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Tidak ada siswa yang cocok dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    sortedRoster.map((student, index) => {
                      const deterministicId = `${student.id}_${selectedCycleId}`;
                      let reflection = reflections.find(r => r.id === deterministicId);
                      if (!reflection) {
                        reflection = reflections.find(r => r.studentId === student.id && r.reflectionCycleId === selectedCycleId);
                      }

                      const slot1 = reflection?.slots?.find(s => s.slot === 1);
                      const slot2 = reflection?.slots?.find(s => s.slot === 2);

                      return (
                        <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-center font-black text-xs text-gray-400">
                            {student.nomorAbsen || index + 1}
                          </td>
                          <td className="px-6 py-4 font-black uppercase italic text-xs text-gray-900">
                            {student.name || student.fullName}
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                              slot1?.strandNameSnapshot === 'Imaginal' ? "bg-pink-50 text-pink-700" :
                              slot1?.strandNameSnapshot === 'Rational' ? "bg-blue-50 text-blue-700" :
                              slot1?.strandNameSnapshot === 'Physical' ? "bg-amber-50 text-amber-700" :
                              "bg-gray-100 text-gray-500"
                            )}>
                              {slot1?.strandNameSnapshot || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-black uppercase text-gray-800 italic truncate max-w-[200px]" title={slot1?.activityNameSnapshot}>
                            {slot1?.activityNameSnapshot || '—'}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-w-[400px]">
                            {slot1?.reflectionText || <span className="text-gray-300 italic font-medium">Belum diisi</span>}
                          </td>
                          {!isGrade9 && (
                            <>
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                                  slot2?.strandNameSnapshot === 'Imaginal' ? "bg-pink-50 text-pink-700" :
                                  slot2?.strandNameSnapshot === 'Rational' ? "bg-blue-50 text-blue-700" :
                                  slot2?.strandNameSnapshot === 'Physical' ? "bg-amber-50 text-amber-700" :
                                  "bg-gray-100 text-gray-500"
                                )}>
                                  {slot2?.strandNameSnapshot || '—'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs font-black uppercase text-gray-800 italic truncate max-w-[200px]" title={slot2?.activityNameSnapshot}>
                                {slot2?.activityNameSnapshot || '—'}
                              </td>
                              <td className="px-6 py-4 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-w-[400px]">
                                {slot2?.reflectionText || <span className="text-gray-300 italic font-medium">Belum diisi</span>}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {/* Summary Footer */}
            <div className="bg-gray-50/50 p-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Menampilkan {sortedRoster.length} dari {roster.length} siswa terdaftar
              </span>
              <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-100 px-4 py-2 rounded-full">
                Format Tab: <span className="font-black text-blue-600 uppercase tracking-widest text-[9px]">{isGrade9 ? 'Grade 9 (5 Kolom)' : 'Grade 7-8 (8 Kolom)'}</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
