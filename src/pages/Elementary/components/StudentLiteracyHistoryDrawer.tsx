import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Calendar, ChevronRight, TrendingUp, TrendingDown, Minus, 
  Award, AlertTriangle, BookOpen, Clock, Activity, HelpCircle
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { 
  ElementaryProgressRecord, 
  ElementaryArea, 
  ElementaryPeriod 
} from '../../../types/elementaryLiteracyNumeracy';
import { elementaryLiteracyService } from '../../../services/elementaryLiteracyService';
import { 
  getAreaLabel, 
  getPeriodLabel, 
  getSupportStatusLabel 
} from '../../../constants/elementaryLiteracyBenchmarks';

interface Props {
  studentId: string;
  studentName: string;
  schoolYear: string;
  area: ElementaryArea;
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
  const [history, setHistory] = React.useState<ElementaryProgressRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (isOpen && studentId) {
      const fetchHistory = async () => {
        try {
          setLoading(true);
          const records = await elementaryLiteracyService.getStudentHistory(studentId, schoolYear, area);
          // Sort based on chronological period order
          const periodOrder: Record<ElementaryPeriod, number> = {
            'JUL_OCT': 1,
            'NOV_FEB': 2,
            'MAR_JUN': 3
          };
          records.sort((a, b) => (periodOrder[a.period] || 0) - (periodOrder[b.period] || 0));
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

  // Organize by periods for side-by-side comparison
  const recordByPeriod = React.useMemo(() => {
    const map: Partial<Record<ElementaryPeriod, ElementaryProgressRecord>> = {};
    history.forEach(rec => {
      map[rec.period] = rec;
    });
    return map;
  }, [history]);

  const periods: ElementaryPeriod[] = ['JUL_OCT', 'NOV_FEB', 'MAR_JUN'];

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
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  RIWAYAT CAPAIAN SISWA
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
              <div className="p-4 bg-emerald-50 text-emerald-900 border border-emerald-100/30 rounded-2xl flex items-center gap-3">
                <div className="bg-emerald-600 text-white p-2 rounded-xl">
                  <BookOpen size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">Mata Pelajaran Aktif</p>
                  <h4 className="text-xs font-black">{getAreaLabel(area)}</h4>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px] font-black uppercase tracking-wider">Memuat riwayat periode...</span>
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
                    Lini Masa Perkembangan (Chronological Journey)
                  </h5>

                  {/* Period Comparison timeline layout */}
                  <div className="relative border-l-2 border-slate-100 pl-6 ml-3 space-y-8">
                    {periods.map((p) => {
                      const record = recordByPeriod[p] as any;
                      const hasRecord = !!record;

                      return (
                        <div key={p} className="relative">
                          {/* Chronological Indicator circle */}
                          <div className={cn(
                            "absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center",
                            hasRecord ? "border-emerald-500" : "border-slate-200"
                          )}>
                            {hasRecord && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                                {getPeriodLabel(p)}
                              </span>
                              {hasRecord && record.supportStatus && (
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase border",
                                  record.supportStatus === 'ON_TRACK' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                                  record.supportStatus === 'MONITOR' && "bg-yellow-50 text-yellow-700 border-yellow-105",
                                  record.supportStatus === 'NEEDS_SUPPORT' && "bg-orange-50 text-orange-700 border-orange-100",
                                  record.supportStatus === 'INTERVENTION_RECOMMENDED' && "bg-red-50 text-red-700 border-red-100",
                                  record.supportStatus === 'INCOMPLETE_DATA' && "bg-slate-50 text-slate-500 border-slate-100"
                                )}>
                                  {getSupportStatusLabel(record.supportStatus)}
                                </span>
                              )}
                            </div>

                            {!hasRecord ? (
                              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] italic text-slate-400">
                                Data belum dientri untuk periode ini.
                              </div>
                            ) : (
                              <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3">
                                {/* DYNAMIC METRIC DISPLAYS BASED ON AREA */}
                                {(area === 'BAHASA_INDONESIA' || area === 'ENGLISH_READING') && (
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
                                        <span className="text-sm font-black text-slate-800">{record.comprehensionScore || 0}%</span>
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
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Iqro Level</p>
                                      <span className="text-sm font-black text-slate-800 block mt-0.5">
                                        Iqro {record.iqroCurrentLevel || 1}
                                      </span>
                                      <span className="text-[8px] text-slate-400 font-semibold font-mono block">
                                        Tgt: Iqro {record.targetIqroLevel || 6}
                                      </span>
                                    </div>

                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Checkpoint / Status</p>
                                      <span className="text-sm font-black text-slate-800 truncate block mt-0.5">
                                        {record.iqroCurrentCheckpoint || '-'}
                                      </span>
                                      <span className="text-[8px] text-slate-400 font-bold tracking-wide uppercase">
                                        {record.completionStatus || '-'}
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
                                      <span className="text-[8px] text-slate-400 font-bold block truncate">
                                        {record.topic || 'No topic'}
                                      </span>
                                    </div>

                                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                      <p className="text-[9px] text-slate-400 uppercase font-black">Accuracy & Speed</p>
                                      <span className="text-sm font-black text-slate-800 block mt-0.5">
                                        {record.accuracy || 0}%
                                      </span>
                                      <span className="text-[8px] text-slate-400 font-mono block">
                                        {record.speed || 0} Detik
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Specific Metadata Details */}
                                {area === 'BAHASA_INDONESIA' && (
                                  <div className="flex gap-2 text-[9px] font-black text-slate-500 uppercase tracking-wider border-t border-slate-100 pt-2 font-mono">
                                    <span>OB: {record.oneDayOneBookStatus === 'AKTIF' ? '✅ AKTIF' : '❌ NEGATIVE'}</span>
                                    <span className="text-slate-300">|</span>
                                    <span>LIB: {record.libraryBorrowStatus === 'AKTIF' ? '✅ AKTIF' : '❌ NEGATIVE'}</span>
                                  </div>
                                )}

                                {area === 'MENGAJI' && (record.letterRecognitionNote || record.tajwidNote) && (
                                  <div className="text-[10px] text-slate-500 uppercase tracking-wide border-t border-slate-100 pt-2 space-y-1">
                                    {record.letterRecognitionNote && (
                                      <p className="truncate"><span className="font-bold text-slate-700">Huruf:</span> {record.letterRecognitionNote}</p>
                                    )}
                                    {record.tajwidNote && (
                                      <p className="truncate"><span className="font-bold text-slate-700">Tajwid:</span> {record.tajwidNote}</p>
                                    )}
                                  </div>
                                )}

                                {/* Card Notes */}
                                {record.notes && (
                                  <div className="mt-2 text-[10px] text-slate-500 bg-white/60 p-2 rounded-lg border border-slate-105 italic">
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
              <span>Sistem Lumina Elementary</span>
              <span>Lajuardi Al-Falah © 2026</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
