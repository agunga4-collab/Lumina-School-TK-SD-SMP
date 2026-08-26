import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Calendar, Users, Save, CheckCircle2, RefreshCw, 
  AlertCircle, Info, Check, Search, X, Edit3, UserCheck, Eye, EyeOff, Sparkles
} from 'lucide-react';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { doc, getDoc, getDocs, setDoc, query, collection, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { toast } from 'sonner';
import type { Class, Student, JuniorHighMonthlyReportComment } from '../../types';

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

export default function MonthlyReportCommentsPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Selected parameters
  const [selectedYear, setSelectedYear] = React.useState<string>('2026/2027');
  const [selectedSemester, setSelectedSemester] = React.useState<string>('1');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');

  // Dropdown list & student roster
  const [classesList, setClassesList] = React.useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState<boolean>(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Comment records map (studentId -> Comment object)
  const [commentsMap, setCommentsMap] = React.useState<Record<string, JuniorHighMonthlyReportComment>>({});
  const [loadingComments, setLoadingComments] = React.useState<boolean>(false);

  // Editor modal states
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [commentText, setCommentText] = React.useState<string>('');
  const [editorStatus, setEditorStatus] = React.useState<'DRAFT' | 'FINAL'>('DRAFT');
  const [isSavingComment, setIsSavingComment] = React.useState<boolean>(false);
  const [showWarning, setShowWarning] = React.useState<boolean>(false);

  // Initialize dates and default values
  React.useEffect(() => {
    if (activeYear) setSelectedYear(activeYear);
    if (activeSemester) setSelectedSemester(String(activeSemester));

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonthStr);
  }, [activeYear, activeSemester]);

  // Fetch Junior High Classes
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

          const hasEnrolledStudent = activeClassKeys.has(c.id) || 
                                     activeClassKeys.has(c.name) || 
                                     ((c as any).classId && activeClassKeys.has((c as any).classId));
          return hasEnrolledStudent;
        });

        setClassesList(jhClasses);

        // Selection Behavior:
        // Clear if not valid in the new context, otherwise keep it
        if (selectedClassId) {
          const isStillEligible = jhClasses.some(c => c.id === selectedClassId);
          if (!isStillEligible) {
            setSelectedClassId('');
          }
        } else {
          setSelectedClassId('');
        }
      } catch (err) {
        console.error('Error loading Junior High classes:', err);
        toast.error('Gagal memuat daftar kelas');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchJHClasses();
  }, [selectedYear]);

  // Fetch Students & Comments when filters change
  const loadRosterAndComments = async () => {
    if (!selectedClassId || !selectedYear) {
      setStudents([]);
      setCommentsMap({});
      return;
    }

    setLoadingStudents(true);
    setLoadingComments(true);
    try {
      // 1. Fetch active students in class
      const list = await getActiveStudents(selectedClassId, selectedYear);
      
      // Sort: attendanceNumber/noAbsen/rollNumber/rosterNumber, fallback to name A-Z
      const sorted = (list || []).sort((a, b) => {
        const numA = a.attendanceNumber ?? a.noAbsen ?? a.rollNumber ?? a.rosterNumber ?? 999;
        const numB = b.attendanceNumber ?? b.noAbsen ?? b.rollNumber ?? b.rosterNumber ?? 999;
        if (numA !== numB) {
          return numA - numB;
        }
        return a.name.localeCompare(b.name);
      });
      setStudents(sorted);

      // 2. Fetch comments for this context
      const q = query(
        collection(db, 'junior_high_monthly_report_comments'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', selectedYear),
        where('semester', '==', selectedSemester),
        where('periodKey', '==', selectedMonth)
      );
      const snap = await getDocs(q);
      const map: Record<string, JuniorHighMonthlyReportComment> = {};
      snap.docs.forEach(doc => {
        const data = doc.data() as JuniorHighMonthlyReportComment;
        if (data.studentId) {
          map[data.studentId] = { ...data, id: doc.id };
        }
      });
      setCommentsMap(map);
    } catch (err) {
      console.error('Error loading roster and comments:', err);
      toast.error('Gagal memuat data siswa atau komentar');
    } finally {
      setLoadingStudents(false);
      setLoadingComments(false);
    }
  };

  React.useEffect(() => {
    if (selectedClassId && selectedYear && selectedSemester && selectedMonth) {
      loadRosterAndComments();
    } else {
      setStudents([]);
      setCommentsMap({});
    }
  }, [selectedClassId, selectedYear, selectedSemester, selectedMonth]);

  // Open Comment Editor Modal
  const handleOpenEditor = (student: Student) => {
    const existing = commentsMap[student.id];
    setEditingStudent(student);
    setCommentText(existing ? existing.generalComment : '');
    setEditorStatus(existing ? existing.status : 'DRAFT');
    // If status is FINAL, show a caution warning block
    setShowWarning(existing?.status === 'FINAL');
  };

  // Close Editor Modal
  const handleCloseEditor = () => {
    setEditingStudent(null);
    setCommentText('');
    setEditorStatus('DRAFT');
    setShowWarning(false);
  };

  // Save Comment to Firestore
  const handleSaveComment = async (targetStatus: 'DRAFT' | 'FINAL') => {
    if (!editingStudent || !selectedClassId || !selectedMonth) return;

    setIsSavingComment(true);
    try {
      const studentId = editingStudent.id;
      const academicYearNormalized = selectedYear.replace(/\//g, '-');
      const docId = `JUNIOR_HIGH_MONTHLY_COMMENT_${studentId}_${selectedClassId}_${academicYearNormalized}_${selectedSemester}_${selectedMonth}`;
      
      const selectedClassObj = classesList.find(c => c.id === selectedClassId);
      const gradeStr = selectedClassObj?.gradeLevel !== undefined 
        ? `Grade ${selectedClassObj.gradeLevel}` 
        : (editingStudent.grade !== undefined ? `Grade ${editingStudent.grade}` : 'Junior High');

      const docRef = doc(db, 'junior_high_monthly_report_comments', docId);
      const existingDoc = commentsMap[studentId];

      const payload: JuniorHighMonthlyReportComment = {
        unit: 'JUNIOR_HIGH',
        reportType: 'MONTHLY_PROGRESS',
        studentId,
        studentNameSnapshot: editingStudent.name,
        classId: selectedClassId,
        classNameSnapshot: selectedClassObj?.name || '',
        gradeSnapshot: gradeStr,
        academicYear: selectedYear,
        semester: selectedSemester,
        periodKey: selectedMonth,
        periodLabel: getIndonesianMonthLabel(selectedMonth),
        generalComment: commentText,
        status: targetStatus,
        createdBy: existingDoc?.createdBy || profile?.email || 'unknown',
        createdAt: existingDoc?.createdAt || new Date().toISOString(),
        updatedBy: profile?.email || 'unknown',
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, payload);

      // Update local state map
      setCommentsMap(prev => ({
        ...prev,
        [studentId]: { ...payload, id: docId }
      }));

      toast.success(
        targetStatus === 'FINAL' 
          ? `Komentar ${editingStudent.name} berhasil disimpan sebagai FINAL!` 
          : `Draft komentar ${editingStudent.name} berhasil disimpan.`
      );
      handleCloseEditor();
    } catch (err) {
      console.error('Error saving student comment:', err);
      toast.error('Gagal menyimpan komentar siswa');
    } finally {
      setIsSavingComment(false);
    }
  };

  // Filter students based on search query
  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (student.id && student.id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedClassObj = classesList.find(c => c.id === selectedClassId);

  return (
    <div id="monthly-report-comments-page" className="min-h-screen bg-slate-50/50 p-6">
      {/* Header Area */}
      <div className="mx-auto max-w-6xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#002366]/10 text-[#002366] border border-[#002366]/20">
                JUNIOR HIGH ONLY
              </span>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <Sparkles size={12} /> Komentar Umum Siswa
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <MessageSquare className="text-[#002366]" size={26} />
              Komentar Umum Siswa (General Comments)
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Input komentar deskriptif bulanan per siswa secara manual untuk rapor Monthly Progress Junior High.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={loadRosterAndComments}
              disabled={loadingStudents || loadingComments}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={(loadingStudents || loadingComments) ? 'animate-spin' : ''} />
              Muat Ulang
            </button>
          </div>
        </div>
      </div>

      {/* Control Panel Filter Card */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Tahun Ajaran
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
              <option value="2027/2028">2027/2028</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Semester
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['1', '2'].map((sem) => (
                <button
                  key={sem}
                  onClick={() => setSelectedSemester(sem)}
                  className={`py-2 text-sm font-semibold rounded-lg border transition-all ${
                    selectedSemester === sem
                      ? 'bg-[#002366] text-white border-[#002366] shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Sem {sem}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Calendar size={13} className="text-[#002366]" /> Periode Bulan
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-1.5 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Users size={13} className="text-[#002366]" /> Kelas Junior High
            </label>
            {loadingClasses ? (
              <div className="h-10 flex items-center px-3 bg-slate-50 rounded-lg text-xs text-slate-400">
                <RefreshCw size={14} className="animate-spin mr-2" />
                Memuat kelas...
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366] py-2 bg-slate-50/50 font-medium"
              >
                <option value="" disabled>
                  {classesList.length === 0 
                    ? "Tidak ada kelas aktif" 
                    : "-- Pilih Kelas --"}
                </option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {!loadingClasses && classesList.length === 0 && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>Tidak ada kelas aktif dengan siswa terdaftar pada konteks ini.</span>
          </div>
        )}
      </div>

      {/* Roster & Grid Table list */}
      <div className="mx-auto max-w-6xl bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Roster Toolbar */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Roster Siswa ({filteredStudents.length})</span>
            <div className="text-xs text-slate-400">
              Kelas: <span className="font-semibold text-slate-600">{selectedClassObj?.name || '-'}</span>
            </div>
          </div>

          {/* Search box */}
          <div className="relative max-w-xs w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Cari nama atau NIS siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-8 py-2 rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366]"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Loading / Empty States */}
        {loadingStudents || loadingComments ? (
          <div className="p-16 text-center">
            <RefreshCw size={30} className="animate-spin text-[#002366] mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Memuat daftar siswa & komentar...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-16 text-center">
            <AlertCircle size={32} className="text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600 font-medium">Tidak ada siswa ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">Harap ganti pilihan filter kelas atau sesuaikan pencarian Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/30 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-5 w-16 text-center">No</th>
                  <th className="py-3 px-5 w-28">NIS</th>
                  <th className="py-3 px-5">Nama Siswa</th>
                  <th className="py-3 px-5 w-32 text-center">Grade</th>
                  <th className="py-3 px-5 text-slate-500 font-bold text-center">
                    Attendance Preview
                    <span className="block text-[9px] font-normal text-slate-400 lowercase italic">sick / excused / absent</span>
                  </th>
                  <th className="py-3 px-5 w-32 text-center">Status</th>
                  <th className="py-3 px-5 w-40 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, idx) => {
                  const comment = commentsMap[student.id];
                  const absNum = student.attendanceNumber ?? student.noAbsen ?? student.rollNumber ?? student.rosterNumber ?? (idx + 1);
                  const isDraft = comment?.status === 'DRAFT';
                  const isFinal = comment?.status === 'FINAL';

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-5 text-center font-medium text-slate-400 text-xs">{absNum}</td>
                      <td className="py-3.5 px-5 font-mono text-xs text-slate-500">{student.id}</td>
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-800">{student.name}</div>
                      </td>
                      <td className="py-3.5 px-5 text-center text-xs font-medium text-slate-600">
                        {selectedClassObj?.gradeLevel ? `Grade ${selectedClassObj.gradeLevel}` : `Grade ${student.grade || 'JH'}`}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center justify-center gap-2.5 text-xs">
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Sick Leave: <strong className="text-slate-600 font-semibold">-</strong>
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                            Excused Leave: <strong className="text-slate-600 font-semibold">-</strong>
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            Absent: <strong className="text-slate-600 font-semibold">-</strong>
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {isFinal ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Check size={12} /> Final
                          </span>
                        ) : isDraft ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            Draft
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200">
                            Belum Diisi
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={() => handleOpenEditor(student)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-xs transition-all ${
                            isFinal
                              ? 'bg-[#002366] text-white border-[#002366] hover:bg-[#002366]/90'
                              : isDraft
                              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Edit3 size={13} />
                          {isFinal || isDraft ? 'Edit Komentar' : 'Tulis Komentar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editor dialog / modal */}
      <AnimatePresence>
        {editingStudent && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-[#002366]/5 text-[#002366]">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Edit Komentar Umum Rapor</h3>
                    <p className="text-xs text-slate-400">Monthly Progress Report</p>
                  </div>
                </div>
                <button 
                  onClick={handleCloseEditor}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                {/* Readonly identity cards */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs">
                  <div>
                    <span className="block text-slate-400">Nama Siswa</span>
                    <strong className="text-slate-800 text-sm">{editingStudent.name}</strong>
                  </div>
                  <div>
                    <span className="block text-slate-400">NIS (ID)</span>
                    <strong className="text-slate-800 text-sm font-mono">{editingStudent.id}</strong>
                  </div>
                  <div>
                    <span className="block text-slate-400">Kelas / Grade</span>
                    <strong className="text-slate-800">
                      {selectedClassObj?.name || '-'} / {selectedClassObj?.gradeLevel ? `Grade ${selectedClassObj.gradeLevel}` : `Grade ${editingStudent.grade || 'JH'}`}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-slate-400">Periode</span>
                    <strong className="text-slate-800">
                      {selectedMonth ? getIndonesianMonthLabel(selectedMonth) : '-'}
                    </strong>
                  </div>
                </div>

                {/* Final state warning display */}
                {showWarning && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle size={15} className="mt-0.5 text-amber-600 shrink-0" />
                    <div>
                      <strong className="font-semibold block mb-0.5">Peringatan: Komentar Berstatus FINAL</strong>
                      Komentar ini telah ditandai sebagai final. Anda masih dapat mengeditnya, tetapi harap pastikan perubahan telah disetujui atau dikoordinasikan.
                    </div>
                  </div>
                )}

                {/* Main comments editor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold uppercase text-slate-500">Komentar Wali Kelas</label>
                    <span className="text-[11px] text-slate-400">{commentText.length} Karakter</span>
                  </div>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={8}
                    placeholder="Tulis komentar deskriptif untuk perkembangan siswa di bulan ini secara manual..."
                    className="w-full text-sm rounded-lg border-slate-200 focus:border-[#002366] focus:ring-[#002366]"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1 italic">
                    * Harap periksa kembali tata bahasa dan ejaan sebelum menandai sebagai final.
                  </span>
                </div>
              </div>

              {/* Modal Footer actions */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  onClick={handleCloseEditor}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                >
                  Batal
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveComment('DRAFT')}
                    disabled={isSavingComment || !commentText.trim()}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50"
                  >
                    Simpan Draft
                  </button>

                  <button
                    onClick={() => handleSaveComment('FINAL')}
                    disabled={isSavingComment || !commentText.trim()}
                    className="flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-lg bg-[#002366] hover:bg-[#002366]/90 text-white shadow-sm transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 size={13} />
                    Simpan Final
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
