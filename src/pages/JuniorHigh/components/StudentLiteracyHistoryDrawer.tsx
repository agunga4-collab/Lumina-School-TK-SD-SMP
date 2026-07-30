import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Calendar, ChevronRight, BookOpen, Clock, Activity, HelpCircle
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { 
  JuniorHighProgressRecord, 
  JuniorHighArea, 
  JuniorHighSessionKey 
} from '../../../types/juniorHighLiteracyNumeracy';
import { juniorHighLiteracyService } from '../../../services/juniorHighLiteracyService';
import { 
  getAreaLabel, 
  getPeriodLabel
} from '../../../constants/juniorHighLiteracyBenchmarks';

interface Props {
  studentId: string;
  studentName: string;
  schoolYear: string;
  area: JuniorHighArea;
  isOpen: boolean;
  onClose: () => void;
}

export default function StudentLiteracyHistoryDrawer({
  studentId,
  studentName,
  schoolYear,
  area,
  isOpen,
  onClose
}: Props) {
  const [history, setHistory] = React.useState<JuniorHighProgressRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (isOpen && studentId) {
      const fetchHistory = async () => {
        try {
          setLoading(true);
          const records = await juniorHighLiteracyService.getStudentHistory(studentId, schoolYear, area);
          
          // Sort based on chronological session order
          const sessionOrder: Record<JuniorHighSessionKey, number> = {
            'SEMESTER_1_START': 1,
            'SEMESTER_1_END': 2,
            'SEMESTER_2_START': 3,
            'SEMESTER_2_END': 4,
            'SPRING_ASSESSMENT_3': 5
          };
          records.sort((a, b) => (sessionOrder[a.sessionKey] || 0) - (sessionOrder[b.sessionKey] || 0));
          setHistory(records);
        } catch (err) {
          console.error("Error fetching student history:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchHistory();
    }
  }, [isOpen, studentId, schoolYear, area]);

  // Organize by sessions for side-by-side comparison
  const recordBySession = React.useMemo(() => {
    const map: Partial<Record<JuniorHighSessionKey, JuniorHighProgressRecord>> = {};
    history.forEach(rec => {
      map[rec.sessionKey] = rec;
    });
    return map;
  }, [history]);

  const sessions: JuniorHighSessionKey[] = ['SEMESTER_1_START', 'SEMESTER_1_END', 'SEMESTER_2_START', 'SEMESTER_2_END', 'SPRING_ASSESSMENT_3'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-50 transition-opacity"
          />

          {/* Drawer Body */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                  RIWAYAT CAPAIAN SISWA (SMP)
                </span>
                <h3 className="text-base font-black tracking-tight truncate max-w-[280px]">
                  {studentName}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold font-mono">
                  NIS: {studentId} • {schoolYear}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Inner Content scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Active Area Badge */}
              <div className="p-4 bg-indigo-50 text-indigo-900 border border-indigo-100/30 rounded-2xl flex items-center gap-3">
                <div className="bg-indigo-600 text-white p-2 rounded-xl">
                  <BookOpen size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-indigo-700 uppercase tracking-wider">Mata Pelajaran Aktif</p>
                  <h4 className="text-xs font-black">{getAreaLabel(area)}</h4>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px] font-black uppercase tracking-wider">Memuat riwayat sesi...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-2 text-slate-400">
                  <HelpCircle size={32} className="text-slate-300" />
                  <p className="text-xs font-bold text-slate-700">Belum Ada Riwayat Penilaian</p>
                  <p className="text-[10px] text-slate-400 max-w-xs">Data pembelajaran literasi atau numerasi untuk siswa ini belum diinput pada tahun pelajaran terpilih.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <h5 className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                    Lini Masa Perkembangan Semester
                  </h5>

                  {/* Session Comparison timeline layout */}
                  <div className="relative border-l-2 border-slate-100 pl-6 ml-3 space-y-8">
                    {sessions.map((sKey) => {
                      const record = recordBySession[sKey] as any;
                      const hasRecord = !!record;

                      return (
                        <div key={sKey} className="relative">
                          {/* Chronological Indicator circle */}
                          <div className={cn(
                            "absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center",
                            hasRecord ? "border-indigo-500" : "border-slate-200"
                          )}>
                            {hasRecord && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                                {getPeriodLabel(sKey)}
                              </span>
                            </div>

                            {!hasRecord ? (
                              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] italic text-slate-400">
                                Data belum dientri untuk sesi ini.
                              </div>
                            ) : (
                              <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3">
                                {/* DYNAMIC METRIC DISPLAYS BASED ON AREA */}
                                {area === 'BAHASA_INDONESIA' && (
                                  <div className="grid grid-cols-1 gap-3 text-xs">
                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Level Membaca</p>
                                      <span className="text-sm font-black text-slate-800 mt-0.5 block">{record.readingLevel || '-'}</span>
                                      
                                      <p className="text-[9px] text-slate-400 uppercase font-black mt-2">Pemahaman Bacaan</p>
                                      <span className="text-sm font-black text-slate-800 block mt-0.5">
                                        {record.readingComprehension !== undefined && record.readingComprehension !== '' && record.readingComprehension !== null 
                                          ? `${record.readingComprehension}%` 
                                          : '-'
                                        }
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {area === 'ENGLISH_READING' && (
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Words per Minute</p>
                                      <div className="flex items-baseline gap-1 mt-0.5">
                                        <span className="text-sm font-black text-slate-800">{record.wpm || 0}</span>
                                        <span className="text-[10px] text-slate-400">WPM</span>
                                      </div>
                                      <p className="text-[8px] text-slate-400 font-medium font-mono">
                                        R: {record.wordsRead || 0} | E: {record.errors || 0}
                                      </p>
                                    </div>

                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Comprehension</p>
                                      <div className="flex items-baseline gap-1 mt-0.5">
                                        <span className="text-sm font-black text-slate-800">
                                          {record.comprehension !== undefined && record.comprehension !== '' && record.comprehension !== null 
                                            ? `${record.comprehension}%` 
                                            : '-'
                                          }
                                        </span>
                                      </div>
                                      <p className="text-[8px] text-slate-400 truncate font-semibold">
                                        Lv: {record.readingLevel || '-'}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {area === 'MENGAJI' && (
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Mengaji Level</p>
                                      <span className="text-sm font-black text-slate-800 block mt-0.5">
                                        {record.level || '-'}
                                      </span>
                                    </div>

                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Target Level</p>
                                      <span className="text-sm font-black text-slate-800 block mt-0.5">
                                        {record.targetLevel || '-'}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {area === 'NUMERACY' && (
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Math Level</p>
                                      <span className="text-sm font-black text-slate-800 block mt-0.5 max-w-full truncate">
                                        {record.mathLevel || '-'}
                                      </span>
                                    </div>

                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Accuracy</p>
                                      <span className="text-sm font-black text-slate-800 block mt-0.5">
                                        {record.accuracy !== undefined && record.accuracy !== '' && record.accuracy !== null 
                                          ? `${record.accuracy}%` 
                                          : '-'
                                        }
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Card Notes */}
                                {record.notes && (
                                  <div className="mt-2 text-[10px] text-slate-500 bg-white/60 p-2 rounded-lg border border-slate-100 italic">
                                    "{record.notes}"
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            {/* Drawer Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>Sistem Lumina Junior High</span>
              <span>Lajuardi Al-Falah © 2026</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
