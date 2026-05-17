import React from 'react';
import { 
  X, Save, AlertCircle, CheckCircle2, User, 
  Calendar as CalendarIcon, ClipboardCheck, Info,
  ChevronLeft, ChevronRight, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  saveCICODailyReport, 
  getCICODailyReport, 
  getTeachers,
  createBehaviorAlert,
  getCICODailyReports
} from '../../lib/firebase';
import { CICO_SESSIONS, CICO_DEFAULT_GOALS } from '../../constants';
import type { 
  MTSSCase, 
  CICODailyReport, 
  CICOSessionData, 
  User as AppUser 
} from '../../types';

interface CICOInputFormProps {
  isOpen: boolean;
  onClose: () => void;
  mtssCase: MTSSCase;
  initialDate?: string; // YYYY-MM-DD
}

export const CICOInputForm: React.FC<CICOInputFormProps> = ({ 
  isOpen, 
  onClose, 
  mtssCase,
  initialDate = new Date().toISOString().split('T')[0]
}) => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [fetchingExisting, setFetchingExisting] = React.useState(true);
  const [teachers, setTeachers] = React.useState<AppUser[]>([]);
  
  const [selectedDate, setSelectedDate] = React.useState(initialDate);
  const [weekNumber, setWeekNumber] = React.useState(1);
  const [sessions, setSessions] = React.useState<CICOSessionData[]>([]);
  const [dailyNote, setDailyNote] = React.useState('');
  const [hasSpecialIncident, setHasSpecialIncident] = React.useState(false);
  const [incidentNote, setIncidentNote] = React.useState('');
  const [isAbsent, setIsAbsent] = React.useState(false);
  
  const goals = mtssCase.tier2Meeting?.cicoGoals || CICO_DEFAULT_GOALS.map((g, i) => ({ id: `goal${i+1}`, label: g }));

  React.useEffect(() => {
    const fetchData = async () => {
      setFetchingExisting(true);
      const [existingReport, teacherList] = await Promise.all([
        getCICODailyReport(mtssCase.id, selectedDate),
        getTeachers()
      ]);
      
      setTeachers(teacherList);

      if (existingReport) {
        setSessions(existingReport.sessions);
        setDailyNote(existingReport.dailyNote || '');
        setHasSpecialIncident(existingReport.hasSpecialIncident || false);
        setIncidentNote(existingReport.incidentNote || '');
        setIsAbsent(existingReport.isAbsent || false);
        setWeekNumber(existingReport.weekNumber);
      } else {
        // Initialize empty sessions
        const initialSessions: CICOSessionData[] = CICO_SESSIONS.map(s => ({
          sessionId: s.id,
          sessionName: s.label,
          timeSlot: s.time,
          scores: { goal1: null, goal2: null, goal3: null, goal4: null },
          isNA: false,
          filledBy: profile?.uid || '',
          filledByName: profile?.displayName || ''
        }));
        setSessions(initialSessions);
        
        // Calculate week number based on MTSS Case start date if available
        // For now, simplify and just set 1 or let it be manual
        setWeekNumber(1); 
        setDailyNote('');
        setHasSpecialIncident(false);
        setIncidentNote('');
        setIsAbsent(false);
      }
      setFetchingExisting(false);
    };
    
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, mtssCase.id, selectedDate, profile]);

  const handleScoreChange = (sessionId: string, goalKey: keyof CICOSessionData['scores'], score: 1 | 2 | 3 | null) => {
    setSessions(prev => prev.map(s => {
      if (s.sessionId === sessionId) {
        return {
          ...s,
          scores: {
            ...s.scores,
            [goalKey]: s.scores[goalKey] === score ? null : score // Toggle logic
          }
        };
      }
      return s;
    }));
  };

  const toggleNA = (sessionId: string) => {
    setSessions(prev => prev.map(s => {
      if (s.sessionId === sessionId) {
        return { ...s, isNA: !s.isNA };
      }
      return s;
    }));
  };

  const handleTeacherChange = (sessionId: string, teacherUid: string) => {
    const teacher = teachers.find(t => t.uid === teacherUid);
    setSessions(prev => prev.map(s => {
      if (s.sessionId === sessionId) {
        return {
          ...s,
          filledBy: teacherUid,
          filledByName: teacher?.displayName || ''
        };
      }
      return s;
    }));
  };

  const calculateDailyMetrics = () => {
    let totalEarned = 0;
    let totalPossible = 0;
    let activeSessionsCount = 0;

    sessions.forEach(s => {
      if (s.isNA) return;
      
      let sessionHasScore = false;
      Object.entries(s.scores).forEach(([key, val]) => {
        if (val !== null) {
          totalEarned += val as number;
          totalPossible += 3;
          sessionHasScore = true;
        }
      });
      
      if (sessionHasScore) activeSessionsCount++;
    });

    const average = totalPossible > 0 ? (totalEarned / (totalPossible/3)) / goals.length : 0;
    const percentage = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;

    return { average, percentage, activeSessionsCount };
  };

  const { average, percentage, activeSessionsCount } = calculateDailyMetrics();

  const handleSubmit = async () => {
    if (activeSessionsCount < 5 && !isAbsent) {
      if (!confirm(`Hanya ${activeSessionsCount} sesi yang diisi (Minimal 5). Yakin ingin menyimpan?`)) {
        return;
      }
    }

    setLoading(true);
    try {
      const reportData: Omit<CICODailyReport, 'id' | 'createdAt' | 'updatedAt'> = {
        caseId: mtssCase.id,
        studentId: mtssCase.studentId,
        date: selectedDate,
        weekNumber,
        sessions,
        dailyAvgScore: average,
        dailyNote,
        hasSpecialIncident,
        incidentNote,
        isAbsent,
        createdBy: profile?.uid || '',
        isLateInput: selectedDate !== new Date().toISOString().split('T')[0]
      };

      await saveCICODailyReport(reportData);
      
      // ALERT-T2-02: Skor CICO Merah Berturut-turut (3 days < 1.5)
      if (!isAbsent) {
        const lastReports = await getCICODailyReports(mtssCase.id);
        // Get last 3 non-absent reports
        const validReports = lastReports.filter(r => !r.isAbsent).slice(0, 3);
        
        if (validReports.length === 3 && validReports.every(r => r.dailyAvgScore < 1.5)) {
          const targetRoles = ['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'];
          const teacherList = await getTeachers();
          const targetUserIds = teacherList.filter(t => targetRoles.includes(t.role)).map(t => t.uid);

          await createBehaviorAlert({
            type: 'ALERT-T2-02',
            severity: 'HIGH',
            title: 'Intervensi Tier 2 - Skor Rendah Berulang',
            message: `${mtssCase.studentName} mendapat skor CICO di bawah target (< 1.5) selama 3 hari berturut-turut. Review segera diperlukan.`,
            caseId: mtssCase.id,
            studentId: mtssCase.studentId,
            studentName: mtssCase.studentName,
            targetUserIds,
            actionUrl: `/mtss/cases/${mtssCase.id}`
          });
        }
      }

      // Trigger Weekly Reflection if Friday
      const dateObj = new Date(selectedDate);
      if (dateObj.getDay() === 5) { // 5 = Friday
         // Show reflection trigger or handle internally
      }

      onClose();
    } catch (err) {
      console.error("Error saving CICO report:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-6xl max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <ClipboardCheck size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                CICO Daily Progress Report
              </h2>
              <p className="text-sm font-bold text-gray-500 mt-1 flex items-center gap-2">
                <span className="text-blue-600 uppercase tracking-wider">{mtssCase.studentName}</span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span>Kelas {mtssCase.classId}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-gray-100 rounded-2xl transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
          
          {/* Controls Hook */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Date Picker */}
            <div className="bg-gray-50 rounded-3xl p-6 space-y-3">
               <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Tanggal Laporan</label>
               <div className="relative">
                 <CalendarIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                 <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  min={new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white border-2 border-transparent focus:border-blue-500 transition-all font-bold text-gray-900 outline-none shadow-sm"
                 />
               </div>
            </div>

            {/* Week Number */}
            <div className="bg-gray-50 rounded-3xl p-6 space-y-3">
               <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Minggu Ke-</label>
               <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setWeekNumber(Math.max(1, weekNumber - 1))}
                    className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex-1 h-12 bg-white rounded-xl flex items-center justify-center font-black text-lg shadow-sm">
                    {weekNumber} <span className="text-gray-300 font-bold ml-2 text-sm uppercase tracking-widest">/ 4</span>
                  </div>
                  <button 
                    onClick={() => setWeekNumber(Math.min(10, weekNumber + 1))}
                    className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
                  >
                    <ChevronRight size={20} />
                  </button>
               </div>
            </div>

            {/* Status Switch */}
            <div className="bg-gray-50 rounded-3xl p-6 flex items-center justify-between">
               <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Status Siswa</label>
                  <p className="font-bold text-gray-900 mt-1">{isAbsent ? 'Tidak Masuk' : 'Hadir'}</p>
               </div>
               <button 
                onClick={() => setIsAbsent(!isAbsent)}
                className={cn(
                  "px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all",
                  isAbsent ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
                )}
               >
                 Tandai {isAbsent ? 'Hadir' : 'Absen'}
               </button>
            </div>
          </div>

          {!isAbsent && (
            <div className="space-y-6">
              {/* Scoring Legend */}
              <div className="flex flex-wrap items-center gap-6 px-4 py-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest">3 = 0-1 Reminder</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest">2 = 2 Reminders</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest">1 = 3+ Reminders</span>
                </div>
              </div>

              {/* Grid Header */}
              <div className="grid grid-cols-[1.5fr_repeat(4,1fr)_1fr] gap-4 px-4 hidden md:grid">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sesi / Waktu</div>
                {goals.map(g => (
                  <div key={g.id} className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center truncate px-2" title={g.label}>
                    {g.label}
                  </div>
                ))}
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">PIC Guru</div>
              </div>

              {/* Grid Rows */}
              <div className="space-y-3">
                {sessions.map((s, idx) => (
                  <motion.div 
                    key={s.sessionId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={cn(
                      "grid grid-cols-1 md:grid-cols-[1.5fr_repeat(4,1fr)_1fr] gap-4 items-center p-4 rounded-3xl border-2 transition-all",
                      s.isNA ? "bg-gray-50 border-transparent opacity-60" : "bg-white border-gray-50 hover:border-blue-100 shadow-sm"
                    )}
                  >
                    {/* Session Info */}
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => toggleNA(s.sessionId)}
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                          s.isNA ? "bg-gray-200 text-gray-500" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        )}
                        title="N/A (Skip Sesi)"
                      >
                        {s.isNA ? <X size={16} /> : <span className="text-[10px] font-black">N/A</span>}
                      </button>
                      <div>
                        <h4 className="font-bold text-gray-900 leading-tight">{s.sessionName}</h4>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{s.timeSlot}</p>
                      </div>
                    </div>

                    {/* Goals */}
                    {(['goal1', 'goal2', 'goal3', 'goal4'] as const).map((gKey, gIdx) => (
                      <div key={gKey} className="flex flex-col items-center gap-2">
                        <div className="md:hidden text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                          {goals[gIdx]?.label}
                        </div>
                        <div className="flex bg-gray-100 p-1 rounded-xl w-full max-w-[120px]">
                          {[1, 2, 3].map(score => (
                            <button
                              key={score}
                              disabled={s.isNA}
                              onClick={() => handleScoreChange(s.sessionId, gKey, score as 1|2|3)}
                              className={cn(
                                "flex-1 h-8 rounded-lg font-black text-xs transition-all",
                                s.isNA ? "cursor-not-allowed" : "hover:scale-105 active:scale-95",
                                s.scores[gKey] === score 
                                  ? (score === 3 ? "bg-green-500 text-white shadow-lg shadow-green-200" : 
                                     score === 2 ? "bg-amber-500 text-white shadow-lg shadow-amber-200" : 
                                     "bg-red-500 text-white shadow-lg shadow-red-200")
                                  : "text-gray-400 border-transparent"
                              )}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* PIC Guru */}
                    <div className="flex flex-col items-end">
                      <div className="md:hidden text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">PIC Guru</div>
                      <select 
                        disabled={s.isNA}
                        value={s.filledBy}
                        onChange={(e) => handleTeacherChange(s.sessionId, e.target.value)}
                        className="w-full md:w-32 bg-gray-50 border-none rounded-xl text-[10px] font-black uppercase tracking-wider py-2 pl-3 pr-8 focus:ring-2 focus:ring-blue-500/20"
                      >
                        {teachers.map(t => (
                          <option key={t.uid} value={t.uid}>{t.displayName}</option>
                        ))}
                      </select>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Info */}
          {!isAbsent && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-100">
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-2">
                  <MessageSquare size={14} className="text-blue-500" />
                  Catatan Harian Guru
                </label>
                <textarea 
                  value={dailyNote}
                  onChange={(e) => setDailyNote(e.target.value)}
                  placeholder="Ceritakan progres siswa hari ini..."
                  className="w-full h-32 px-6 py-5 rounded-3xl bg-gray-50 border-2 border-transparent focus:border-blue-500 transition-all font-bold text-gray-900 placeholder:text-gray-300 resize-none outline-none"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between ml-2">
                  <label className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-[0.2em]">
                    <AlertCircle size={14} className="text-amber-500" />
                    Kejadian Khusus
                  </label>
                  <button 
                    onClick={() => setHasSpecialIncident(!hasSpecialIncident)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      hasSpecialIncident ? "bg-amber-500" : "bg-gray-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                      hasSpecialIncident ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>
                <AnimatePresence>
                  {hasSpecialIncident && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <textarea 
                        value={incidentNote}
                        onChange={(e) => setIncidentNote(e.target.value)}
                        placeholder="Detail kejadian (apa yang terjadi, pemicu, respon...)"
                        className="w-full h-32 px-6 py-5 rounded-3xl bg-amber-50 border-2 border-amber-100 focus:border-amber-400 transition-all font-bold text-gray-900 placeholder:text-amber-200 resize-none outline-none"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                {!hasSpecialIncident && (
                  <div className="h-32 rounded-3xl bg-gray-50 border-2 border-dashed border-gray-100 flex items-center justify-center text-gray-400 font-bold text-sm italic">
                    Tidak ada kejadian khusus hari ini
                  </div>
                )}
              </div>
            </div>
          )}

          {isAbsent && (
            <div className="py-20 text-center space-y-6">
               <div className="w-24 h-24 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mx-auto">
                 <User size={48} className="opacity-20" />
               </div>
               <div>
                  <h3 className="text-xl font-bold text-gray-900">Siswa Ditandai Tidak Masuk</h3>
                  <p className="text-gray-500 font-medium max-w-sm mx-auto mt-2 italic">
                    Input CICO tidak diperlukan jika siswa absen/libur. 
                    Dokumen akan tetap disimpan sebagai catatan kehadiran.
                  </p>
               </div>
               <textarea 
                value={dailyNote}
                onChange={(e) => setDailyNote(e.target.value)}
                placeholder="Alasan absen (Sakit, Izin, Libur...)"
                className="w-full max-w-lg mx-auto px-6 py-5 rounded-3xl bg-gray-50 border-2 border-transparent focus:border-blue-500 transition-all font-bold text-gray-900 text-center outline-none"
               />
            </div>
          )}
        </div>

        {/* Footer Stats & Actions */}
        <div className="px-8 py-6 border-t border-gray-100 bg-gray-50/50 flex flex-col md:flex-row items-center gap-6">
          {!isAbsent ? (
            <div className="flex items-center gap-8 flex-1">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex flex-col items-center justify-center border border-gray-100">
                   <span className="text-[10px] font-black text-gray-400 uppercase leading-none mb-0.5">Skor</span>
                   <span className={cn(
                     "font-black text-lg leading-none",
                     average >= 2.4 ? "text-green-500" : average >= 2.0 ? "text-amber-500" : "text-red-500"
                   )}>{average.toFixed(1)}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-gray-900">{percentage.toFixed(0)}%</span>
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          percentage >= 80 ? "bg-green-500" : percentage >= 70 ? "bg-amber-500" : "bg-red-500"
                        )}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Harian (Target: 80%)</p>
                </div>
              </div>

              <div className="h-8 w-px bg-gray-200 hidden md:block" />

              <div className="flex items-center gap-3">
                 <div className={cn(
                   "px-3 py-1.5 rounded-xl flex items-center gap-2",
                   activeSessionsCount >= 5 ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                 )}>
                   {activeSessionsCount >= 5 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                   <span className="text-[10px] font-black uppercase tracking-widest">{activeSessionsCount} Sesi Terisi</span>
                 </div>
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={onClose}
              className="flex-1 md:flex-none px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-500 hover:bg-gray-100 transition-all border-2 border-transparent"
            >
              Batal
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading || fetchingExisting}
              className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-200"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
              {fetchingExisting ? 'Memuat...' : 'Simpan Laporan'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
