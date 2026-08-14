import * as React from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { 
  ClipboardCheck, Sparkles, UserCheck, ChevronDown, CheckCircle2, 
  RefreshCw, Info, Save, ChevronUp, FileSpreadsheet, Plus, AlertCircle, Edit2,
  FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useNavigate } from 'react-router-dom';
import { 
  getKindergartenClasses, 
  invalidateKindergartenCache
} from '../../lib/kindergartenMetadataCache';
import { useAuth } from '../../context/AuthContext';
import { getKindergartenActiveRoster, KindergartenRosterStudent } from '../../services/kindergartenRosterService';
import { 
  AAP_RUBRIC, 
  AAP_ASPECTS, 
  getStageFromPercentage, 
  STAGE_LABELS 
} from '../../config/aapRubric';
import AAPImporter from './AAPImporter';
import { useTeacherAssignedClasses } from '../../hooks/useTeacherAssignedClasses';

export default function AAPAssessment() {
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();
  const { profile } = useAuth();

  if (profile?.role === 'kindergarten_subject_teacher') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-red-600">Akses Ditolak</h1>
        <p className="text-gray-500 mt-2">Anda tidak memiliki izin untuk membuka halaman ini.</p>
      </div>
    );
  }
  
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
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

  const isLoading = isLoadingClasses;
  const [classStudents, setClassStudents] = React.useState<KindergartenRosterStudent[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = React.useState(false);
  
  // Importer Modal State
  const [isImportOpen, setIsImportOpen] = React.useState(false);

  // Firestore Assessments Map
  const [assessments, setAssessments] = React.useState<Record<string, any>>({});
  const [isLoadingAssessments, setIsLoadingAssessments] = React.useState(false);

  // Local Unsaved Editing Scores: Record<studentId, Record<indicatorName, score>>
  const [editingScores, setEditingScores] = React.useState<Record<string, Record<string, number>>>({});

  // Expanded student cards Map
  const [expandedStudentId, setExpandedStudentId] = React.useState<string | null>(null);

  // Audit State
  const [auditData, setAuditData] = React.useState<any[]>([]);
  const [isAuditing, setIsAuditing] = React.useState(false);
  const [showAuditPanel, setShowAuditPanel] = React.useState(false);

  const isSuperAdminOrHead = profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_UNIT';

  const runRosterAudit = React.useCallback(async () => {
    try {
      setIsAuditing(true);
      const yr = activeYear || '2026/2027';
      const fetchedClasses = await getKindergartenClasses(yr);
      
      const auditRows = await Promise.all(
        fetchedClasses.map(async (cls) => {
          // Get active roster count using the service
          const roster = await getKindergartenActiveRoster({
            classId: cls.id,
            academicYearId: yr
          });

          // Query enrollments for current class to count active students
          const enrollmentsQuery = query(
            collection(db, 'enrollments'),
            where('unitId', '==', 'KINDERGARTEN'),
            where('academicYear', '==', yr)
          );
          const enrollmentsSnap = await getDocs(enrollmentsQuery);
          const enrollments = enrollmentsSnap.docs
            .map(docSnap => docSnap.data())
            .filter(e => {
              const isActive = e.status === 'active' || !e.status;
              const matchesClass = e.classId === cls.id || e.classId === cls.name;
              return isActive && matchesClass;
            });

          const countManajemenKelas = enrollments.length;
          const rosterCount = roster.length;
          const status = countManajemenKelas === rosterCount ? 'OK' : 'MISMATCH';

          return {
            classId: cls.id,
            className: cls.name,
            countManajemenKelas,
            rosterCount,
            status
          };
        })
      );

      setAuditData(auditRows);
    } catch (err) {
      console.error("Error running roster audit:", err);
      toast.error("Gagal menjalankan audit roster.");
    } finally {
      setIsAuditing(false);
    }
  }, [activeYear]);

  React.useEffect(() => {
    if (showAuditPanel && isSuperAdminOrHead) {
      runRosterAudit();
    }
  }, [showAuditPanel, activeYear, isSuperAdminOrHead, runRosterAudit]);

  const activeClassObj = classes.find(c => c.id === selectedClassId);

  const getAgeRangeFromClass = (cls: any): '2-4' | '4-5' | '5-6' => {
    const name = String(cls?.name || '').toLowerCase();
    const grade = String(cls?.grade || '').toLowerCase();
    if (name.includes('tk-b') || name.includes('tkb') || grade.includes('tk-b') || grade.includes('tkb') || grade.includes('b')) {
      return '5-6';
    }
    if (name.includes('tk-a') || name.includes('tka') || grade.includes('tk-a') || grade.includes('tka') || grade.includes('a')) {
      return '4-5';
    }
    return '2-4';
  };

  const ageRangeUsed = activeClassObj ? getAgeRangeFromClass(activeClassObj) : '4-5';

  const flatIndicators = React.useMemo(() => {
    const list: { aspect: typeof AAP_ASPECTS[number]; indicatorName: string; index: number }[] = [];
    let idx = 0;
    AAP_ASPECTS.forEach(aspect => {
      const indicators = AAP_RUBRIC[ageRangeUsed]?.[aspect] || [];
      indicators.forEach(ind => {
        list.push({ aspect, indicatorName: ind, index: idx++ });
      });
    });
    return list;
  }, [ageRangeUsed]);

  // Set default selection and handle URL/storage redirection rules
  React.useEffect(() => {
    if (!isLoadingClasses && classes.length > 0) {
      if (selectedClassId && assignedClassIds.includes(selectedClassId)) {
        // Keep current valid selection
      } else if (primaryClassId) {
        setSelectedClassId(primaryClassId);
      }
    }
  }, [classes, assignedClassIds, primaryClassId, isLoadingClasses]);

  // Real-time access check
  React.useEffect(() => {
    if (!isLoadingClasses && isRestrictedToAssignedClasses && selectedClassId) {
      if (assignedClassIds.length > 0 && !assignedClassIds.includes(selectedClassId)) {
        toast.error('Anda tidak memiliki hak akses untuk kelas ini. Mengembalikan ke kelas penugasan Anda.');
        setSelectedClassId(primaryClassId || '');
      }
    }
  }, [selectedClassId, isRestrictedToAssignedClasses, assignedClassIds, primaryClassId, isLoadingClasses]);

  // Fetch student active roster using the unified service
  React.useEffect(() => {
    if (!selectedClassId) {
      setClassStudents([]);
      return;
    }
    async function loadRoster() {
      try {
        setIsLoadingRoster(true);
        const roster = await getKindergartenActiveRoster({
          classId: selectedClassId,
          academicYearId: activeYear || '2026/2027'
        });
        setClassStudents(roster);
      } catch (err) {
        console.error("Error loading Kindergarten active roster:", err);
        toast.error("Gagal memuat daftar siswa aktif kelas.");
      } finally {
        setIsLoadingRoster(false);
      }
    }
    loadRoster();
  }, [selectedClassId, activeYear]);

  // Fetch assessments when selectedClassId, activeYear or classStudents changes
  const loadAssessments = React.useCallback(async () => {
    if (!selectedClassId) return;
    try {
      setIsLoadingAssessments(true);
      const q = query(
        collection(db, 'aap_assessments'),
        where('classId', '==', selectedClassId),
        where('academicYear', '==', activeYear)
      );
      const snap = await getDocs(q);
      const fetched: Record<string, any> = {};
      snap.docs.forEach(docSnap => {
        fetched[docSnap.data().studentId] = docSnap.data();
      });
      setAssessments(fetched);

      // Initialize editing scores map from fetched Firestore records
      const initialScores: Record<string, Record<string, number>> = {};
      
      classStudents.forEach(s => {
        const records = fetched[s.id];
        const scoresMap: Record<string, number> = {};
        if (records) {
          records.aspects.forEach((asp: any) => {
            asp.indicators.forEach((ind: any) => {
              scoresMap[ind.indicatorName] = ind.score;
            });
          });
        }
        initialScores[s.id] = scoresMap;
      });
      setEditingScores(initialScores);
    } catch (err) {
      console.error("Error loading AAP assessments:", err);
      toast.error("Gagal menyinkronkan data Asesmen Awal.");
    } finally {
      setIsLoadingAssessments(false);
    }
  }, [selectedClassId, activeYear, classStudents]);

  React.useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  // Realtime scores aggregator & stats generator per student
  const calculateLiveScores = (studentId: string) => {
    const studentScores = editingScores[studentId] || {};
    const aspectsData = AAP_ASPECTS.map(aspect => {
      const indicators = AAP_RUBRIC[ageRangeUsed]?.[aspect] || [];
      const indicatorsWithScores = indicators.map(indName => {
        const score = studentScores[indName] || null;
        return { indicatorName: indName, score };
      });
      
      const scoredCount = indicatorsWithScores.filter(i => i.score !== null).length;
      const isFullyScored = scoredCount === indicators.length;
      const rawScore = indicatorsWithScores.reduce((sum, item) => sum + (item.score || 0), 0);
      const maxScore = indicators.length * 4;
      const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
      const stage = getStageFromPercentage(percentage);
      
      return {
        aspectName: aspect,
        indicators: indicatorsWithScores,
        rawScore,
        maxScore,
        percentage,
        stage,
        scoredCount,
        isFullyScored
      };
    });
    
    const totalRaw = aspectsData.reduce((sum, item) => sum + item.rawScore, 0);
    const totalMax = aspectsData.reduce((sum, item) => sum + item.maxScore, 0);
    const overallPercentage = totalMax > 0 ? Math.round((totalRaw / totalMax) * 100) : 0;
    const overallStage = getStageFromPercentage(overallPercentage);
    const totalScored = aspectsData.reduce((sum, item) => sum + item.scoredCount, 0);
    const totalExpected = flatIndicators.length;
    const isPartiallyScored = totalScored > 0;
    const isAllScored = totalScored === totalExpected;

    return {
      aspectsData,
      overallPercentage,
      overallStage,
      totalScored,
      totalExpected,
      isPartiallyScored,
      isAllScored
    };
  };

  const handleScoreChange = (studentId: string, indicatorName: string, score: number) => {
    setEditingScores(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [indicatorName]: score
      }
    }));
  };

  // Save single student's AAP to Firestore
  const handleSaveStudent = async (studentId: string) => {
    try {
      const student = classStudents.find(s => s.id === studentId);
      if (!student) return;

      const { aspectsData, overallPercentage, overallStage, isPartiallyScored } = calculateLiveScores(studentId);
      if (!isPartiallyScored) {
        toast.error(`Harap isi setidaknya satu nilai indikator untuk ${student.name}.`);
        return;
      }

      const toastId = toast.loading(`Menyimpan AAP untuk ${student.name}...`);
      
      const aspectsPayload = aspectsData.map(asp => ({
        aspectName: asp.aspectName,
        indicators: asp.indicators.map(ind => ({
          indicatorName: ind.indicatorName,
          score: ind.score || 1
        })),
        rawScore: asp.rawScore,
        maxScore: asp.maxScore,
        percentage: asp.percentage,
        stage: asp.stage
      }));

      const userStr = localStorage.getItem('user');
      const userParsed = userStr ? JSON.parse(userStr) : null;
      const createdBy = userParsed?.email || 'System';

      const docId = `${studentId}_${activeYear}`;
      const payload = {
        studentId,
        studentName: student.name,
        classId: selectedClassId,
        className: activeClassObj?.name || 'Unknown Class',
        academicYear: activeYear,
        ageRangeUsed,
        aspects: aspectsPayload,
        overallPercentage,
        overallStage,
        source: 'manual' as const,
        createdBy,
        createdAt: assessments[studentId]?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await setDoc(doc(db, 'aap_assessments', docId), payload);
      
      setAssessments(prev => ({
        ...prev,
        [studentId]: payload
      }));

      toast.success(`Berhasil menyimpan AAP untuk ${student.name}! 🎉`, { id: toastId });
    } catch (err: any) {
      console.error("Error saving AAP assessment:", err);
      toast.error(`Gagal menyimpan: ${err.message}`);
    }
  };

  // Bulk save class students to Firestore
  const handleSaveAll = async () => {
    try {
      const studentsToSave = classStudents.filter(student => {
        const { isPartiallyScored } = calculateLiveScores(student.id);
        return isPartiallyScored;
      });

      if (studentsToSave.length === 0) {
        toast.error('Belum ada data nilai indikator yang diisi untuk disimpan.');
        return;
      }

      const toastId = toast.loading(`Menyimpan ${studentsToSave.length} data Asesmen Awal siswa...`);

      const userStr = localStorage.getItem('user');
      const userParsed = userStr ? JSON.parse(userStr) : null;
      const createdBy = userParsed?.email || 'System';

      for (const student of studentsToSave) {
        const studentId = student.id;
        const { aspectsData, overallPercentage, overallStage } = calculateLiveScores(studentId);

        const aspectsPayload = aspectsData.map(asp => ({
          aspectName: asp.aspectName,
          indicators: asp.indicators.map(ind => ({
            indicatorName: ind.indicatorName,
            score: ind.score || 1
          })),
          rawScore: asp.rawScore,
          maxScore: asp.maxScore,
          percentage: asp.percentage,
          stage: asp.stage
        }));

        const docId = `${studentId}_${activeYear}`;
        const payload = {
          studentId,
          studentName: student.name,
          classId: selectedClassId,
          className: activeClassObj?.name || 'Unknown Class',
          academicYear: activeYear,
          ageRangeUsed,
          aspects: aspectsPayload,
          overallPercentage,
          overallStage,
          source: 'manual' as const,
          createdBy,
          createdAt: assessments[studentId]?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        await setDoc(doc(db, 'aap_assessments', docId), payload);
        
        setAssessments(prev => ({
          ...prev,
          [studentId]: payload
        }));
      }

      toast.success(`Berhasil menyimpan ${studentsToSave.length} data AAP siswa! 🌟`, { id: toastId });
    } catch (err: any) {
      console.error("Error bulk saving AAP:", err);
      toast.error(`Gagal menyimpan masal: ${err.message}`);
    }
  };

  if (isImportOpen) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-16 px-4">
        <AAPImporter 
          classes={classes}
          students={classStudents}
          selectedClassId={selectedClassId}
          onClose={() => setIsImportOpen(false)}
          onImportSuccess={loadAssessments}
        />
      </div>
    );
  }

  // Count assessed students
  const assessedCount = classStudents.filter(s => !!assessments[s.id]).length;

  if (isRestrictedToAssignedClasses && classes.length === 0 && !isLoadingClasses) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
        {/* Header Banner */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4 md:space-y-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black uppercase rounded-full tracking-widest">Kindergarten Unit</span>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-black uppercase rounded-full tracking-widest">AAP</span>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Asesmen Awal Pembelajaran (AAP)</h1>
          </div>
        </header>

        <div className="max-w-4xl mx-auto my-12 p-12 bg-white border border-gray-150 rounded-3xl shadow-sm text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-full">
              <AlertCircle size={36} />
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

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4 md:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black uppercase rounded-full tracking-widest">Kindergarten Unit</span>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-black uppercase rounded-full tracking-widest">AAP</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Asesmen Awal Pembelajaran (AAP)</h1>
          <p className="text-sm text-gray-400">
            Fokus diagnostik tumbuh kembang dan kesiapan belajar murid awal tahun ajaran.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start md:self-center flex-wrap">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black px-5 py-3.5 rounded-2xl shadow-sm border border-emerald-100 transition-all active:scale-95 text-xs uppercase tracking-widest cursor-pointer"
          >
            <FileSpreadsheet size={15} /> Impor dari Excel
          </button>
        </div>
      </header>

      {/* Global Nav Tabs */}
      <div className="bg-white border border-gray-150 p-1.5 rounded-2xl flex items-center gap-1 max-w-sm">
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all bg-indigo-600 text-white shadow-md cursor-default"
        >
          <UserCheck size={14} /> Input Penilaian
        </button>
        <button
          type="button"
          onClick={() => navigate('/kindy/aap-report')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-gray-600 hover:text-gray-900 hover:bg-gray-50 cursor-pointer"
        >
          <FileText size={14} /> Hasil & Analisis
        </button>
      </div>

      {/* Control Filters Block */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* Class Select Dropdown */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Pilih Kelas</span>
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={e => {
                  setSelectedClassId(e.target.value);
                  setLastSelectedClassId(e.target.value);
                  setExpandedStudentId(null);
                }}
                disabled={isLoading || (isRestrictedToAssignedClasses && classes.length <= 1)}
                className="appearance-none bg-gray-50 border border-gray-100 text-gray-800 rounded-2xl pl-4 pr-10 py-3 text-xs font-black uppercase tracking-wider transition outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 cursor-pointer min-w-[220px] disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {classes.length === 0 ? (
                  <option value="">Tidak ada kelas</option>
                ) : (
                  classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Age Group Info Pill */}
          {activeClassObj && (
            <div className="self-end pb-1">
              <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3.5 py-2.5 rounded-2xl border border-indigo-100 text-[11px] font-bold">
                <Info size={14} /> Usia: {ageRangeUsed === '2-4' ? 'Pra-TK (2-4 Th)' : ageRangeUsed === '4-5' ? 'TK-A (4-5 Th)' : 'TK-B (5-6 Th)'}
              </span>
            </div>
          )}
        </div>

        {/* Progress Counters Badge */}
        {classStudents.length > 0 && (
          <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl px-5 py-3 flex items-center justify-between gap-8 md:self-end">
            <div>
              <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Progress Kelas</div>
              <div className="text-sm font-black text-emerald-950 mt-0.5">
                {assessedCount} / {classStudents.length} Siswa Dinilai
              </div>
            </div>
            <div className="w-14 h-14 rounded-full border-4 border-emerald-100 flex items-center justify-center font-black text-emerald-800 text-xs shadow-sm bg-white">
              {classStudents.length > 0 ? Math.round((assessedCount / classStudents.length) * 100) : 0}%
            </div>
          </div>
        )}
      </div>

      {isLoading || isLoadingAssessments ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-4">
          <RefreshCw className="animate-spin text-emerald-600" size={32} />
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Menyelaraskan data Asesmen Awal...</p>
        </div>
      ) : classStudents.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-3">
          <UserCheck className="text-gray-300 animate-bounce" size={44} />
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Kelas Kosong atau Belum Dipilih</h3>
            <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto leading-relaxed">
              Tidak ada siswa yang terdaftar di kelas ini untuk tahun ajaran {activeYear}. Silakan pastikan data kelas dan siswa sudah terkonfigurasi.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Students List Grid */}
          <div className="grid grid-cols-1 gap-6">
            {classStudents.map(student => {
              const liveData = calculateLiveScores(student.id);
              const isAssessed = !!assessments[student.id];
              const isExpanded = expandedStudentId === student.id;

              return (
                <div 
                  key={student.id}
                  className={cn(
                    "bg-white rounded-3xl border transition-all duration-300 overflow-hidden shadow-sm",
                    isExpanded 
                      ? "border-emerald-300 ring-4 ring-emerald-50 shadow-md" 
                      : "border-gray-100 hover:border-gray-300 hover:shadow-md"
                  )}
                >
                  {/* Card Header Info Section */}
                  <div className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-gray-50 bg-white">
                    {/* Student Metadata & Initials */}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md select-none shrink-0">
                        {student.name.charAt(0)}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <h4 className="text-base font-black text-gray-900 tracking-tight leading-tight uppercase truncate">{student.name}</h4>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-tight">NIS: {student.id}</span>
                          <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Kelompok Usia {ageRangeUsed} Th</span>
                        </div>
                      </div>
                    </div>

                    {/* Computed Stats / Status Summary */}
                    <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-start md:justify-end">
                      {liveData.isPartiallyScored ? (
                        <div className="flex items-center gap-3 bg-indigo-50/50 border border-indigo-100/50 px-4 py-2 rounded-2xl">
                          <div className="text-right">
                            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block leading-none">Skor AAP</span>
                            <span className="text-xs font-black text-indigo-950 mt-1 block">
                              {liveData.overallStage} ({liveData.overallPercentage}%)
                            </span>
                          </div>
                          <span className="px-2.5 py-1 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-sm">
                            {liveData.totalScored}/{liveData.totalExpected}
                          </span>
                        </div>
                      ) : (
                        <span className="px-3 py-1.5 bg-gray-100 text-gray-500 text-[10px] font-black uppercase rounded-xl tracking-wider border border-gray-200/55">
                          Belum Dinilai
                        </span>
                      )}

                      {/* Expand / Edit trigger */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all duration-200 active:scale-95",
                            isExpanded 
                              ? "bg-amber-50 border-amber-200 text-amber-800" 
                              : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                          )}
                        >
                          {isExpanded ? (
                            <>
                              Tutup <ChevronUp size={14} />
                            </>
                          ) : (
                            <>
                              Mulai Nilai <Edit2 size={12} />
                            </>
                          )}
                        </button>

                        {/* Lihat Laporan Button */}
                        {isAssessed && (
                          <button
                            type="button"
                            onClick={() => navigate(`/kindy/aap-report?studentId=${student.id}&classId=${selectedClassId}`)}
                            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-sm border border-indigo-200 transition-all active:scale-95 cursor-pointer"
                          >
                            <FileText size={13} /> Laporan
                          </button>
                        )}

                        {/* Save Student CTA */}
                        <button
                          type="button"
                          onClick={() => handleSaveStudent(student.id)}
                          disabled={!liveData.isPartiallyScored}
                          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-sm active:scale-95 cursor-pointer transition-all border-0"
                        >
                          <Save size={13} /> Simpan
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary of Saved Aspects (Only if not expanded & has data) */}
                  {!isExpanded && liveData.isPartiallyScored && (
                    <div className="bg-gray-50/50 px-6 py-4 flex flex-wrap gap-4 border-t border-gray-100">
                      {liveData.aspectsData.map(asp => (
                        <div key={asp.aspectName} className="text-[11px] font-bold text-gray-600 bg-white border border-gray-100 px-3 py-1.5 rounded-xl">
                          <span className="text-gray-400 font-extrabold mr-1">{asp.aspectName}:</span>
                          <span className={cn(
                            "font-extrabold uppercase",
                            asp.stage === 'BSB' ? "text-indigo-600" :
                            asp.stage === 'BSH' ? "text-emerald-600" :
                            asp.stage === 'MB' ? "text-amber-600" : "text-rose-600"
                          )}>
                            {asp.stage} ({asp.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Full Interactive Scoring Matrix Sheet (Only shown when expanded) */}
                  {isExpanded && (
                    <div className="p-6 md:p-8 bg-gray-50/40 space-y-8 animate-in fade-in slide-in-from-top-4 duration-200 border-t border-gray-100">
                      {liveData.aspectsData.map(aspectObj => {
                        return (
                          <div key={aspectObj.aspectName} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-inner">
                            {/* Aspect Subheader */}
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                              <h5 className="text-xs font-black text-gray-900 uppercase tracking-widest">
                                Aspek: {aspectObj.aspectName}
                              </h5>
                              <span className={cn(
                                "text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border",
                                aspectObj.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                                aspectObj.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                aspectObj.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                "bg-rose-50 text-rose-700 border-rose-200"
                              )}>
                                {aspectObj.stage} ({aspectObj.percentage}%)
                              </span>
                            </div>

                            {/* Indicators rating items list */}
                            <div className="divide-y divide-gray-100">
                              {aspectObj.indicators.map((ind, i) => {
                                return (
                                  <div key={i} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <p className="text-xs font-bold text-gray-700 leading-relaxed font-sans max-w-[540px]">
                                      {i + 1}. {ind.indicatorName}
                                    </p>

                                    {/* 4-Scale BB/MB/BSH/BSB Radio button Group */}
                                    <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100 gap-1.5 select-none self-start md:self-center">
                                      {([1, 2, 3, 4] as const).map(scoreVal => {
                                        const label = STAGE_LABELS[scoreVal];
                                        const isSelected = ind.score === scoreVal;

                                        return (
                                          <button
                                            key={scoreVal}
                                            type="button"
                                            onClick={() => handleScoreChange(student.id, ind.indicatorName, scoreVal)}
                                            className={cn(
                                              "px-3.5 py-2 text-[10px] font-black rounded-xl uppercase tracking-wider transition-all duration-150 cursor-pointer active:scale-95 border-0",
                                              isSelected && scoreVal === 1 ? "bg-rose-600 text-white shadow-sm" :
                                              isSelected && scoreVal === 2 ? "bg-amber-500 text-white shadow-sm" :
                                              isSelected && scoreVal === 3 ? "bg-emerald-600 text-white shadow-sm" :
                                              isSelected && scoreVal === 4 ? "bg-indigo-600 text-white shadow-sm" :
                                              "text-gray-400 hover:text-gray-700 bg-transparent hover:bg-gray-100"
                                            )}
                                          >
                                            {label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Bulk Actions Panel */}
          <div className="bg-white/90 backdrop-blur rounded-3xl p-6 border border-gray-200/80 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 sticky bottom-4 z-40">
            <div className="space-y-0.5">
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Aksi Massal Kelas</h4>
              <p className="text-xs text-gray-400">
                Simpan sekaligus seluruh perubahan nilai Asesmen Awal (AAP) untuk semua siswa yang diubah.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black px-8 py-4 rounded-2xl shadow-lg transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer border-0 w-full md:w-auto"
            >
              <CheckCircle2 size={16} /> Simpan Semua Roster Kelas
            </button>
          </div>

          {/* Audit & Validasi Roster (Hanya Super Admin / Head Unit) */}
          {isSuperAdminOrHead && (
            <div className="bg-white rounded-3xl border border-gray-200/80 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between cursor-pointer border-b border-gray-100 pb-4 select-none" onClick={() => setShowAuditPanel(!showAuditPanel)}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-md tracking-wider">Admin Tool</span>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Audit & Validasi Roster</h3>
                  </div>
                  <p className="text-xs text-gray-400">
                    Bandingkan sinkronisasi roster antara Manajemen Kelas (Enrollments), Roster Aktif AAP, dan data Assessments.
                  </p>
                </div>
                <button
                  type="button"
                  className="p-2 hover:bg-gray-50 rounded-xl transition-all"
                >
                  <ChevronDown size={18} className={cn("text-gray-500 transition-transform duration-200", showAuditPanel && "rotate-180")} />
                </button>
              </div>

              {showAuditPanel && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500">Tahun Ajaran: {activeYear || '2026/2027'}</span>
                    <button
                      type="button"
                      onClick={runRosterAudit}
                      disabled={isAuditing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 rounded-xl text-xs font-bold border border-gray-150 transition-all cursor-pointer"
                    >
                      <RefreshCw size={12} className={cn(isAuditing && "animate-spin")} /> Refresh Audit
                    </button>
                  </div>

                  {isAuditing ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400 text-xs">
                      <RefreshCw size={24} className="animate-spin text-indigo-500" />
                      <span>Menghitung data audit roster...</span>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-gray-50/70 border-b border-gray-100 font-bold text-gray-500 uppercase tracking-wider">
                            <th className="px-4 py-3">Nama Kelas</th>
                            <th className="px-4 py-3 text-center">Jumlah Manajemen Kelas (Active Enrollments)</th>
                            <th className="px-4 py-3 text-center">Jumlah AAP Assessment (Roster)</th>
                            <th className="px-4 py-3 text-center">Jumlah Dropdown Importer</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-150">
                          {auditData.map((row) => {
                            const isMatch = row.status === 'OK';
                            return (
                              <tr key={row.classId} className="hover:bg-gray-50/40 transition">
                                <td className="px-4 py-3 font-extrabold text-gray-800">{row.className}</td>
                                <td className="px-4 py-3 text-center font-bold text-gray-600">{row.countManajemenKelas}</td>
                                <td className="px-4 py-3 text-center font-bold text-indigo-600">{row.rosterCount}</td>
                                <td className="px-4 py-3 text-center font-bold text-indigo-600">{row.rosterCount}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn(
                                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                    isMatch 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                      : "bg-orange-50 text-orange-700 border border-orange-200"
                                  )}>
                                    {row.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {auditData.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-gray-400 font-medium">
                                Tidak ada data kelas untuk diaudit.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
