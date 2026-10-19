import * as React from 'react';
import { useOutletContext, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, User, Calendar, Save, Trash2, Plus, 
  Info, Clock, BookOpen, ChevronLeft, ChevronRight, HelpCircle,
  FileText, ArrowLeft, AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  db, getClasses, getActiveStudents, getTeachers, createBehaviorAlert,
  handleFirestoreError
} from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, limit, setDoc } from 'firebase/firestore';
import type { 
  MTSSCase, Student, Class, User as AppUser
} from '../../types';

interface BehaviorTargetRow {
  id: string;
  text: string;
}

interface CICOWeeklyWorksheet {
  studentId: string;
  classId: string;
  weekStartingDate: string; // Monday date string (YYYY-MM-DD)
  targets: BehaviorTargetRow[];
  scores: {
    [targetId: string]: {
      [dayIdx: number]: { // 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri
        checkIn: number | null;
        checkOut: number | null;
      };
    };
  };
  halBaik: string;
  refleksi: string;
  teacherNotes: string;
}

// Helper to get Monday of a week
function getMonday(d: Date): Date {
  const dateCopy = new Date(d);
  const day = dateCopy.getDay();
  const diff = dateCopy.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(dateCopy.setDate(diff));
}

// Format date to local Indonesian string
function formatLocalDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function MTSSBehaviorSpreadsheet() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: any }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL parameters if navigated from elsewhere
  const urlStudentId = searchParams.get('studentId') || '';
  const urlClassId = searchParams.get('classId') || '';
  const urlWeek = searchParams.get('week') || searchParams.get('date') || '';

  // Class & Student listing states
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [teachers, setTeachers] = React.useState<AppUser[]>([]);

  // Selection states
  const [selectedClassId, setSelectedClassId] = React.useState<string>(urlClassId || '');
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(urlStudentId || '');
  const [currentWeekMonday, setCurrentWeekMonday] = React.useState<Date>(() => {
    if (urlWeek) {
      try {
        const parsed = new Date(urlWeek);
        if (!isNaN(parsed.getTime())) return getMonday(parsed);
      } catch (e) {
        console.error("Invalid week param:", e);
      }
    }
    return getMonday(new Date());
  });

  // Core Workbook States
  const [targets, setTargets] = React.useState<BehaviorTargetRow[]>([]);
  const [scores, setScores] = React.useState<CICOWeeklyWorksheet['scores']>({});
  const [halBaik, setHalBaik] = React.useState('');
  const [refleksi, setRefleksi] = React.useState('');
  const [teacherNotes, setTeacherNotes] = React.useState('');

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const mondayStr = currentWeekMonday.toISOString().split('T')[0];

  // Sync state if url parameters change
  React.useEffect(() => {
    if (urlClassId) setSelectedClassId(urlClassId);
  }, [urlClassId]);

  React.useEffect(() => {
    if (urlStudentId) setSelectedStudentId(urlStudentId);
  }, [urlStudentId]);

  React.useEffect(() => {
    if (urlWeek) {
      try {
        const parsed = new Date(urlWeek);
        if (!isNaN(parsed.getTime())) setCurrentWeekMonday(getMonday(parsed));
      } catch (e) {
        console.error("Invalid week param:", e);
      }
    }
  }, [urlWeek]);

  // 1. Fetch Classes, Cases and Teachers initially
  React.useEffect(() => {
    if (!profile) return;
    const loadMetadata = async () => {
      try {
        const [classesData, teachersData] = await Promise.all([
          getClasses(),
          getTeachers()
        ]);
        setTeachers(teachersData || []);

        const jhClasses = (classesData || []).filter(c => 
          c.unitId === 'JUNIOR_HIGH' && 
          c.academicYear === filters.academicYear && 
          c.status !== 'archived'
        );
        setClasses(jhClasses);

        // Auto-select first class if not set by URL
        if (jhClasses.length > 0 && !selectedClassId) {
          setSelectedClassId(jhClasses[0].id);
        }
      } catch (err) {
        console.error("Error loading classes/teachers:", err);
      }
    };

    // Listen to behavior cases to match active Tier 2/3 students
    const casesQuery = query(
      collection(db, 'behaviorCases'),
      where('academicYear', '==', filters.academicYear)
    );
    const unsubscribeCases = onSnapshot(casesQuery, (snapshot) => {
      const casesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MTSSCase[];
      // Client-side semester filter for resilience with older/partially formatted case records
      const filteredCases = casesList.filter(c => 
        !filters.semester || !c.semester || String(c.semester) === String(filters.semester)
      );
      setCases(filteredCases);
    }, (err) => {
      handleFirestoreError(err, 'list', 'behaviorCases');
    });

    loadMetadata();
    return () => unsubscribeCases();
  }, [profile, filters.academicYear, filters.semester]);

  // 2. Fetch students roster dynamically for selected class
  React.useEffect(() => {
    if (!selectedClassId) return;
    const loadRoster = async () => {
      try {
        const classStudents = await getActiveStudents(selectedClassId, filters.academicYear);
        setStudents(classStudents || []);

        // Auto-select first student if not set
        if (classStudents && classStudents.length > 0) {
          const isCurrentInList = classStudents.some(s => s.id === selectedStudentId);
          if (!isCurrentInList && !urlStudentId) {
            setSelectedStudentId(classStudents[0].id);
          }
        } else {
          setSelectedStudentId('');
        }
      } catch (err) {
        console.error("Error loading roster:", err);
      }
    };
    loadRoster();
  }, [selectedClassId, filters.academicYear]);

  // 3. Load or initialize workbook for the selected student & selected Monday
  React.useEffect(() => {
    if (!selectedStudentId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const loadWorkbook = async () => {
      try {
        const docRef = doc(db, 'cicoWeeklyWorksheets', `${selectedStudentId}_${mondayStr}`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as CICOWeeklyWorksheet;
          setTargets(data.targets || []);
          setScores(data.scores || {});
          setHalBaik(data.halBaik || '');
          setRefleksi(data.refleksi || '');
          setTeacherNotes(data.teacherNotes || '');
        } else {
          // pre-fill from student's active CICO goals if any
          const matchedCase = cases.find(c => 
            c.studentId === selectedStudentId && 
            c.status !== 'CLOSED'
          );

          const caseGoals = matchedCase?.tier2Meeting?.cicoGoals || [];
          const initialTargets: BehaviorTargetRow[] = caseGoals.length > 0 
            ? caseGoals.map((g, idx) => ({ id: g.id || `target-${idx}-${Date.now()}`, text: g.label }))
            : [
                { id: `target-1-${Date.now()}`, text: '' },
                { id: `target-2-${Date.now()}`, text: '' },
                { id: `target-3-${Date.now()}`, text: '' }
              ];

          setTargets(initialTargets);
          setScores({});
          setHalBaik('');
          setRefleksi('');
          setTeacherNotes('');
        }
      } catch (err) {
        console.error("Error loading CICO workbook:", err);
      } finally {
        setLoading(false);
      }
    };

    loadWorkbook();
  }, [selectedStudentId, mondayStr, cases]);

  // Generate 5 days of the selected week
  const daysOfWeek = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(currentWeekMonday);
    d.setDate(currentWeekMonday.getDate() + i);
    return d;
  });

  // Switch weeks
  const changeWeek = (direction: 'prev' | 'next') => {
    const offset = direction === 'prev' ? -7 : 7;
    const newMon = new Date(currentWeekMonday);
    newMon.setDate(currentWeekMonday.getDate() + offset);
    setCurrentWeekMonday(newMon);
  };

  // Add target row
  const handleAddTargetRow = () => {
    const newId = `target-${Date.now()}`;
    setTargets(prev => [...prev, { id: newId, text: '' }]);
  };

  // Remove target row
  const handleRemoveTargetRow = (id: string) => {
    setTargets(prev => prev.filter(t => t.id !== id));
    setScores(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  // Update target text
  const handleTargetTextChange = (id: string, text: string) => {
    setTargets(prev => prev.map(t => t.id === id ? { ...t, text } : t));
  };

  // Update cell score (Check In / Check Out)
  const handleScoreChange = (targetId: string, dayIdx: number, type: 'checkIn' | 'checkOut', value: number | null) => {
    setScores(prev => {
      const targetScores = prev[targetId] || {};
      const dayScores = targetScores[dayIdx] || { checkIn: null, checkOut: null };
      
      return {
        ...prev,
        [targetId]: {
          ...targetScores,
          [dayIdx]: {
            ...dayScores,
            [type]: value
          }
        }
      };
    });
  };

  // Calculate scores for a single day
  const calculateDayScore = (dayIdx: number) => {
    let earned = 0;
    let possible = 0;

    targets.forEach(t => {
      const cell = scores[t.id]?.[dayIdx];
      if (cell) {
        if (cell.checkIn !== null) {
          earned += cell.checkIn;
          possible += 4;
        }
        if (cell.checkOut !== null) {
          earned += cell.checkOut;
          possible += 4;
        }
      }
    });

    return { earned, possible, pct: possible > 0 ? Math.round((earned / possible) * 100) : null };
  };

  // Calculate overall weekly score
  const calculateWeeklyScore = () => {
    let earned = 0;
    let possible = 0;

    targets.forEach(t => {
      const targetScores = scores[t.id];
      if (targetScores) {
        for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
          const cell = targetScores[dayIdx];
          if (cell) {
            if (cell.checkIn !== null) {
              earned += cell.checkIn;
              possible += 4;
            }
            if (cell.checkOut !== null) {
              earned += cell.checkOut;
              possible += 4;
            }
          }
        }
      }
    });

    return { earned, possible, pct: possible > 0 ? Math.round((earned / possible) * 100) : null };
  };

  // Save the complete weekly workbook to firestore
  const handleSaveWorkbook = async () => {
    if (!selectedStudentId) return;
    setSaving(true);
    try {
      const payload: CICOWeeklyWorksheet = {
        studentId: selectedStudentId,
        classId: selectedClassId,
        weekStartingDate: mondayStr,
        targets,
        scores,
        halBaik,
        refleksi,
        teacherNotes
      };

      const docRef = doc(db, 'cicoWeeklyWorksheets', `${selectedStudentId}_${mondayStr}`);
      await setDoc(docRef, payload);

      // Create behavior alerts if overall percentage is low and there is an active case
      const weeklyStats = calculateWeeklyScore();
      const matchedCase = cases.find(c => c.studentId === selectedStudentId && c.status !== 'CLOSED');
      
      if (matchedCase && weeklyStats.pct !== null && weeklyStats.pct < 60) {
        const targetRoles = ['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'];
        const targetUserIds = teachers.filter(t => targetRoles.includes(t.role)).map(t => t.uid);

        await createBehaviorAlert({
          type: 'ALERT-T2-02',
          severity: 'HIGH',
          title: 'Skor CICO Mingguan Rendah',
          message: `${matchedCase.studentName} memperoleh rata-rata CICO mingguan ${weeklyStats.pct}% (di bawah batas 60%).`,
          caseId: matchedCase.id,
          studentId: matchedCase.studentId,
          studentName: matchedCase.studentName,
          targetUserIds,
          actionUrl: `/junior-high/behavior/mtss/cases/${matchedCase.id}`
        });
      }

      alert("Workbook pemantauan perilaku berhasil disimpan!");
    } catch (err: any) {
      console.error(err);
      alert(`Gagal menyimpan workbook: ${err.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const activeStudentObj = students.find(s => s.id === selectedStudentId);
  const weeklyStats = calculateWeeklyScore();

  return (
    <div className="space-y-6">
      {/* 1. Classroom & Student Workbook Selector bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-1">
          {/* Class Select Dropdown */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 min-w-[150px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Class</span>
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudentId(''); // reset student
              }}
              className="text-xs font-black uppercase tracking-widest bg-transparent outline-none cursor-pointer text-gray-800 w-full"
            >
              <option value="">Select Class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Student Selector pill row */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 flex-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0">Student</span>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="text-xs font-black uppercase tracking-widest bg-transparent outline-none cursor-pointer text-gray-800 w-full"
            >
              <option value="">Select Student Workbook</option>
              {students.map(s => {
                const hasCase = cases.some(c => c.studentId === s.id && c.status !== 'CLOSED');
                const matchedC = cases.find(c => c.studentId === s.id && c.status !== 'CLOSED');
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} {hasCase ? `(${matchedC?.tier || 'CICO Active'})` : '(No active CICO program)'}
                  </option>
                );
              })}
            </select>
          </div>

          {(() => {
            const matchedCase = cases.find(c => c.studentId === selectedStudentId && c.status !== 'CLOSED');
            if (!matchedCase) return null;
            return (
              <Link
                to={`/mtss/case/${matchedCase.id}`}
                className="hidden xl:flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-[#002366] rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shrink-0 border border-blue-100"
                title="Buka Profil Kasus Siswa"
              >
                <FileText size={13} className="text-blue-600" />
                Profil Kasus ({matchedCase.tier})
              </Link>
            );
          })()}
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100 self-center">
          <button 
            onClick={() => changeWeek('prev')}
            className="p-1.5 hover:bg-white rounded-lg text-gray-500 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center px-3 min-w-[160px]">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 leading-none">Selected Week</p>
            <p className="text-[11px] font-black text-gray-800 uppercase mt-1 tracking-wider">
              {formatLocalDate(daysOfWeek[0])} - {formatLocalDate(daysOfWeek[4])}
            </p>
          </div>
          <button 
            onClick={() => changeWeek('next')}
            className="p-1.5 hover:bg-white rounded-lg text-gray-500 hover:text-blue-600 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Conditional rendering for empty or loading workbook */}
      {!selectedStudentId ? (
        <div className="bg-white p-16 rounded-[2.5rem] border border-gray-100 shadow-sm text-center max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
            <FileSpreadsheet size={32} />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase italic tracking-tight text-gray-900">MTSS Behavior Worksheet</h3>
            <p className="text-xs text-gray-500 leading-relaxed mt-2 uppercase font-semibold tracking-wider">
              Pilih kelas dan siswa di atas untuk membuka lembar kerja CICO (Check-In Check-Out) interaktif mingguan.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="h-[40vh] flex flex-col items-center justify-center space-y-4 bg-white rounded-[2.5rem] border border-gray-100">
          <Clock className="animate-pulse text-blue-600" size={36} />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Loading Student Ledger...</p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Top Score banner & KPI row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <User size={20} />
              </div>
              <div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Active Student</span>
                <p className="text-sm font-black text-gray-800 uppercase italic tracking-wide">{activeStudentObj?.name}</p>
                <p className="text-[10px] font-mono text-gray-400 font-bold mt-0.5">NISN: {activeStudentObj?.nisn || '—'}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Target Rows Count</span>
                <p className="text-sm font-black text-gray-800 font-mono mt-0.5">{targets.length} Target Behaviors</p>
              </div>
            </div>

            <div className="bg-[#001033] text-white p-6 rounded-2xl shadow-md flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-900 text-blue-300 rounded-xl">
                  <BookOpen size={20} />
                </div>
                <div>
                  <span className="text-[9px] font-black text-blue-300 uppercase tracking-widest">Weekly Achievement</span>
                  <p className="text-[10px] text-blue-100/70 font-semibold mt-0.5 uppercase tracking-wide">Overall progress rate</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black italic text-blue-300 leading-none">
                  {weeklyStats.pct !== null ? `${weeklyStats.pct}%` : '—'}
                </p>
                {weeklyStats.possible > 0 && (
                  <p className="text-[9px] font-mono text-blue-100/50 font-bold mt-1">
                    {weeklyStats.earned} / {weeklyStats.possible} pts
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* MAIN EXCEL-LIKE EDITABLE SPREADSHEET TABLE */}
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-base font-black uppercase italic tracking-tight text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-blue-600" />
                  Check In Check Out Monitoring System
                </h3>
              </div>
              <button
                onClick={handleAddTargetRow}
                className="flex items-center gap-1.5 bg-[#002366] hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm"
              >
                <Plus size={14} />
                Add Target Row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[950px]">
                <thead>
                  <tr className="bg-gray-50/75 border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-500">
                    <th className="px-6 py-4 w-[280px]">Behavior Targets</th>
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((dayName, idx) => {
                      const dayLocalDate = formatLocalDate(daysOfWeek[idx]);
                      return (
                        <th key={idx} className="px-3 py-3 border-l border-gray-100 text-center w-[150px]">
                          <div>{dayName}</div>
                          <div className="text-[8px] text-gray-400 mt-0.5 font-bold">{dayLocalDate}</div>
                          <div className="grid grid-cols-2 gap-1 mt-2 text-[8px] text-blue-900 border-t border-gray-100/80 pt-1.5">
                            <div>IN</div>
                            <div>OUT</div>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-4 py-4 text-center w-[60px]">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {targets.map((target, tIdx) => (
                    <tr key={target.id} className="hover:bg-gray-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-gray-400">{tIdx + 1}.</span>
                          <input
                            type="text"
                            value={target.text}
                            onChange={(e) => handleTargetTextChange(target.id, e.target.value)}
                            placeholder="Type behavior target (e.g. Focus on class task)"
                            className="w-full text-xs font-bold text-gray-700 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none py-1 transition-all placeholder:text-gray-300"
                          />
                        </div>
                      </td>

                      {/* Mon to Fri cell scorers */}
                      {[0, 1, 2, 3, 4].map((dayIdx) => {
                        const cellScore = scores[target.id]?.[dayIdx] || { checkIn: null, checkOut: null };

                        const renderScoreSelector = (type: 'checkIn' | 'checkOut') => {
                          const activeVal = cellScore[type];
                          return (
                            <select
                              value={activeVal === null ? '' : String(activeVal)}
                              onChange={(e) => {
                                const valStr = e.target.value;
                                const val = valStr === '' ? null : Number(valStr);
                                handleScoreChange(target.id, dayIdx, type, val);
                              }}
                              className={cn(
                                "w-full text-center text-xs font-black font-mono rounded-lg border py-1.5 outline-none cursor-pointer appearance-none transition-all",
                                activeVal === 4 ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" :
                                activeVal === 3 ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" :
                                activeVal === 2 ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100" :
                                activeVal === 1 ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100" :
                                "bg-gray-50/50 border-gray-100 text-gray-300 hover:border-gray-200 hover:bg-gray-50"
                              )}
                            >
                              <option value="">—</option>
                              <option value="4">4</option>
                              <option value="3">3</option>
                              <option value="2">2</option>
                              <option value="1">1</option>
                            </select>
                          );
                        };

                        return (
                          <td key={dayIdx} className="px-3 py-3 border-l border-gray-100">
                            <div className="grid grid-cols-2 gap-1.5">
                              {renderScoreSelector('checkIn')}
                              {renderScoreSelector('checkOut')}
                            </div>
                          </td>
                        );
                      })}

                      {/* Row actions */}
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => handleRemoveTargetRow(target.id)}
                          className="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Delete Target Behavior"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {targets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-400 text-xs font-semibold uppercase">
                        No targets found. Click "Add Target Row" to define monitoring items.
                      </td>
                    </tr>
                  )}

                  {/* Operational Summary points row (Calculated points per column) */}
                  <tr className="bg-blue-50/30 font-black text-gray-800 text-[10px] tracking-wider uppercase">
                    <td className="px-6 py-4">
                      <span>Daily Point Sum & Pct</span>
                    </td>
                    {[0, 1, 2, 3, 4].map((dayIdx) => {
                      const dayStats = calculateDayScore(dayIdx);
                      return (
                        <td key={dayIdx} className="px-3 py-4 border-l border-gray-100 text-center">
                          {dayStats.possible > 0 ? (
                            <div className="space-y-0.5">
                              <div className="text-[11px] font-mono text-blue-900">
                                {dayStats.pct}%
                              </div>
                              <div className="text-[8px] font-mono text-gray-400 font-bold">
                                {dayStats.earned} / {dayStats.possible} pts
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300 font-normal font-mono">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-4"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* General scoring guide label inside grid block */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
              <span className="text-gray-600">Scores:</span>
              <span>4: Outstanding effort (76-100)</span>
              <span>3: Good Effort and acceptable behavior (51-75)</span>
              <span>2: Some Effort with limited success (26-50)</span>
              <span>1: Little/No Effort (0-25)</span>
            </div>
          </div>

          {/* THREE CORE WEEKLY QUALITATIVE WORKBOOK TEXTAREAS */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-50">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase italic tracking-tight text-gray-900">
                  Reflections and Notes
                </h3>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 leading-none">
                  Weekly monitoring reflections and evaluations of student performance
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Field 1 */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                  1. Hal baik yang sudah dilakukan minggu ini
                </label>
                <textarea
                  rows={4}
                  value={halBaik}
                  onChange={(e) => setHalBaik(e.target.value)}
                  placeholder="Deskripsikan tindakan positif, kesuksesan, atau perilaku teladan murid minggu ini..."
                  className="w-full text-xs p-4 border border-gray-200 rounded-2xl outline-none focus:border-blue-300 resize-none leading-relaxed font-bold text-gray-700 bg-gray-50/10 focus:bg-white transition-all"
                />
              </div>

              {/* Field 2 */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                  2. Refleksi mingguan
                </label>
                <textarea
                  rows={4}
                  value={refleksi}
                  onChange={(e) => setRefleksi(e.target.value)}
                  placeholder="Tuliskan refleksi hasil evaluasi perilaku murid atau hasil diskusi guru-murid..."
                  className="w-full text-xs p-4 border border-gray-200 rounded-2xl outline-none focus:border-blue-300 resize-none leading-relaxed font-bold text-gray-700 bg-gray-50/10 focus:bg-white transition-all"
                />
              </div>

              {/* Field 3 */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                  3. Teacher’s Note
                </label>
                <textarea
                  rows={4}
                  value={teacherNotes}
                  onChange={(e) => setTeacherNotes(e.target.value)}
                  placeholder="Catatan tambahan, arahan khusus mentor, masukan wali kelas, atau pesan koordinasi orang tua..."
                  className="w-full text-xs p-4 border border-gray-200 rounded-2xl outline-none focus:border-blue-300 resize-none leading-relaxed font-bold text-gray-700 bg-gray-50/10 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Save Workbook action bar */}
            <div className="flex justify-end pt-4 border-t border-gray-50">
              <button
                disabled={saving}
                onClick={handleSaveWorkbook}
                className="flex items-center gap-2 bg-[#002366] hover:bg-blue-800 text-white px-8 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 shadow-md"
              >
                <Save size={14} />
                {saving ? "Saving Workbook..." : "Save Weekly Workbook"}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
