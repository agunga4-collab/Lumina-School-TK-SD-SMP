import * as React from 'react';
import { useState, useMemo } from 'react';
import { Search, Plus, Check, X, Award, History, Users } from 'lucide-react';
import {
  AssessmentBookOptions,
  JHAssessmentLO,
  JHFormativeEntry,
  JHFormativeScore,
  JHSummativeEntry,
  isLegacyScore,
  LearningGoal,
  Student
} from '../../../../types';
import {
  formatDateWIB,
  getTodayWIB,
  addFormativeEntry,
  correctFormativeEntry,
  hardDeleteFormativeEntry
} from '../../../../services/juniorHighAssessmentBookService';
import { toast } from 'sonner';

interface Props {
  students: Student[];
  lg: LearningGoal;
  los: JHAssessmentLO[];
  formativeEntries: JHFormativeEntry[];
  summativeEntries: JHSummativeEntry[];
  options: AssessmentBookOptions;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  teacherId: string;
  teacherName: string;
  isReadOnly?: boolean;
  mode?: 'SUBJECT' | 'UNIT_ACTIVITY';
  showClassColumn?: boolean;
  classesMap?: Record<string, string>;
  onOpenFormativeModal: (student: Student, lo: JHAssessmentLO) => void;
  onOpenSummativeModal: (student: Student) => void;
  onOpenManageLOModal: () => void;
  onOpenBulkModal: (lo: JHAssessmentLO) => void;
  onRefreshData: () => void;
}

export function FormativeMatrixGrid({
  students,
  lg,
  los,
  formativeEntries,
  summativeEntries,
  options,
  classId,
  subjectId,
  academicYear,
  semester,
  teacherId,
  teacherName,
  isReadOnly = false,
  mode = 'SUBJECT',
  showClassColumn = false,
  classesMap = {},
  onOpenFormativeModal,
  onOpenSummativeModal,
  onOpenManageLOModal,
  onOpenBulkModal,
  onRefreshData
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [quickSavingKey, setQuickSavingKey] = useState<string | null>(null);
  const isUAMode = mode === 'UNIT_ACTIVITY' || showClassColumn;


  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(
      s => s.name?.toLowerCase().includes(term) ||
        (s.nisn && s.nisn.includes(term)) ||
        ((s as any).nis && String((s as any).nis).includes(term))
    );
  }, [students, searchTerm]);

  const formativeMap = useMemo(() => {
    const map: Record<string, { latest: JHFormativeEntry; history: JHFormativeEntry[] }> = {};
    for (const entry of formativeEntries) {
      const key = `${entry.studentId}_${entry.loId}`;
      if (!map[key]) {
        map[key] = { latest: entry, history: [entry] };
      } else {
        map[key].history.push(entry);
        map[key].latest = entry;
      }
    }
    return map;
  }, [formativeEntries]);

  const summativeMap = useMemo(() => {
    const map: Record<string, JHSummativeEntry> = {};
    for (const entry of summativeEntries) {
      map[entry.studentId] = entry;
    }
    return map;
  }, [summativeEntries]);

  const loStats = useMemo(() => {
    const stats: Record<string, {
      countAchieved: number;
      countNotAchieved: number;
      countLegacy: number;
      countUnassessed: number;
      totalAssessed: number;
    }> = {};

    for (const lo of los) {
      let countAchieved = 0;
      let countNotAchieved = 0;
      let countLegacy = 0;
      let totalAssessed = 0;

      for (const s of students) {
        const item = formativeMap[`${s.id}_${lo.id}`];
        if (item?.latest) {
          totalAssessed++;
          if (item.latest.comprehensionLevel === 'Achieved') {
            countAchieved++;
          } else if (item.latest.comprehensionLevel === 'Not Achieved') {
            countNotAchieved++;
          } else {
            countLegacy++;
          }
        }
      }
      stats[lo.id] = {
        countAchieved,
        countNotAchieved,
        countLegacy,
        countUnassessed: students.length - totalAssessed,
        totalAssessed
      };
    }
    return stats;
  }, [los, students, formativeMap]);

  const getDefaultNextAction = (lvl: JHFormativeScore) => {
    if (lvl === 'Achieved') return 'Lanjut ke LO Berikutnya';
    return 'Refleksi & Remediasi Terfokus';
  };

  const handleQuickScore = async (
    e: React.MouseEvent,
    student: Student,
    lo: JHAssessmentLO,
    level: JHFormativeScore
  ) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (quickSavingKey) return;

    const cellKey = `${student.id}_${lo.id}`;
    setQuickSavingKey(cellKey);

    const today = getTodayWIB();
    const existingGroup = formativeMap[cellKey];
    const existingSameDay = existingGroup?.history.find(
      h => h.date === today && h.teacherId === teacherId
    );
    const defaultNextAction = getDefaultNextAction(level);

    try {
      if (existingSameDay) {
        const prevLevel = existingSameDay.comprehensionLevel;
        const prevNextAction = existingSameDay.nextAction;

        await correctFormativeEntry({
          entryId: existingSameDay.id,
          comprehensionLevel: level,
          nextAction: existingSameDay.nextAction || defaultNextAction,
          correctedBy: teacherId,
          correctedByName: teacherName,
          correctionReason: 'Klik Cepat (Koreksi Hari Ini)'
        });
        onRefreshData();

        toast.success(`Nilai [${level}] tersimpan (koreksi hari ini)`, {
          duration: 5000,
          action: {
            label: 'Urungkan',
            onClick: async () => {
              try {
                await correctFormativeEntry({
                  entryId: existingSameDay.id,
                  comprehensionLevel: prevLevel,
                  nextAction: prevNextAction,
                  correctedBy: teacherId,
                  correctedByName: teacherName,
                  correctionReason: 'Urungkan Klik Cepat'
                });
                toast.info('Nilai dikembalikan ke sebelumnya.');
                onRefreshData();
              } catch (revertErr: any) {
                toast.error('Gagal mengurungkan: ' + revertErr.message);
              }
            }
          }
        });
      } else {
        const createdId = await addFormativeEntry({
          loId: lo.id,
          lgId: lo.lgId,
          classId: student.classId || classId,
          subjectId,
          academicYear,
          semester,
          studentId: student.id,
          studentName: student.name,
          date: today,
          formativeTask: '',
          comprehensionLevel: level,
          nextAction: defaultNextAction,
          teacherId,
          teacherName
        });

        onRefreshData();

        toast.success(`Nilai [${level}] tersimpan untuk ${student.name}`, {
          duration: 5000,
          action: {
            label: 'Urungkan',
            onClick: async () => {
              try {
                await hardDeleteFormativeEntry(createdId);
                toast.info('Nilai baru berhasil diurungkan.');
                onRefreshData();
              } catch (revertErr: any) {
                toast.error('Gagal mengurungkan: ' + revertErr.message);
              }
            }
          }
        });
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan nilai: ' + (err.message || 'Error'));
    } finally {
      setQuickSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari nama atau NIS siswa..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <button
              onClick={onOpenManageLOModal}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus size={14} /> Kelola Tangga LO ({los.length})
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {los.length === 0 ? (
          <div className="py-14 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
              <Plus size={24} />
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">Belum Ada Learning Objective (LO)</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
              Tambahkan minimal satu indikator LO untuk LG ini agar kolom asesmen formatif harian tampil di grid.
            </p>
            {!isReadOnly && (
              <button
                onClick={onOpenManageLOModal}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus size={14} /> Buat LO Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 uppercase text-[10px] tracking-wider font-bold">
                  <th className="py-3 px-3 w-10 text-center sticky left-0 bg-slate-50 z-20">No</th>
                  <th className="py-3 px-3 w-48 min-w-[190px] sticky left-10 bg-slate-50 z-20 border-r border-gray-200">
                    Nama Siswa
                  </th>
                  {isUAMode && (
                    <th className="py-3 px-3 w-24 min-w-[85px] bg-slate-50 border-r border-gray-200 text-center">
                      Kelas
                    </th>
                  )}
                  {los.map(lo => {
                    const st = loStats[lo.id] || {
                      countAchieved: 0,
                      countNotAchieved: 0,
                      countLegacy: 0,
                      countUnassessed: students.length,
                      totalAssessed: 0
                    };
                    return (
                      <th
                        key={lo.id}
                        className="py-3 px-3 min-w-[240px] max-w-[300px] border-r border-gray-200 align-top group/col"
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-extrabold text-purple-700 bg-purple-100/70 px-1.5 py-0.5 rounded text-[10px]">
                            {lo.code}
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onOpenBulkModal(lo)}
                              className="px-2 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-md text-[9px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title={isUAMode ? `Buka asesmen satu sesi peserta UA untuk ${lo.code}` : `Buka asesmen satu sesi kelas untuk ${lo.code}`}
                            >
                              <Users size={11} /> {isUAMode ? 'Asesmen Peserta UA' : 'Asesmen Kelas'}
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-gray-800 line-clamp-2 normal-case tracking-normal mb-1.5" title={lo.title}>
                          {lo.title}
                        </p>
                        <div className="flex items-center justify-between text-[9px] font-mono flex-wrap gap-1">
                          <span className="text-gray-400 font-sans">
                            {st.totalAssessed}/{students.length} dinilai
                          </span>
                          {st.totalAssessed > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-emerald-800 bg-emerald-50 px-1 py-0.2 rounded font-bold border border-emerald-200">
                                {st.countAchieved} Ach
                              </span>
                              <span className="text-rose-800 bg-rose-50 px-1 py-0.2 rounded font-bold border border-rose-200">
                                {st.countNotAchieved} Not
                              </span>
                              {st.countLegacy > 0 && (
                                <span
                                  className="text-amber-800 bg-amber-50 px-1 py-0.2 rounded font-bold border border-amber-200"
                                  title="Data skala lama (B/D/A)"
                                >
                                  {st.countLegacy} Lama
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="py-3 px-4 w-44 min-w-[160px] bg-emerald-50/60 text-emerald-900 border-l border-emerald-200 align-top">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Award size={14} className="text-emerald-700" />
                      <span className="font-extrabold text-[11px]">Nilai Sumatif LG</span>
                    </div>
                    <p className="text-[10px] normal-case tracking-normal text-emerald-800">
                      Capaian Akhir (Skala B / D / A)
                    </p>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={los.length + (isUAMode ? 4 : 3)} className="py-8 text-center text-gray-400">
                      Tidak ada siswa yang sesuai dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, index) => {
                    const summativeEntry = summativeMap[student.id];
                    return (
                      <tr key={student.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="py-2.5 px-3 text-center text-gray-400 font-mono sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-gray-100">
                          {student.attendanceNumber ?? (student as any).noAbsen ?? index + 1}
                        </td>
                        <td className="py-2.5 px-3 sticky left-10 bg-white group-hover:bg-slate-50 z-10 border-r border-gray-200">
                          <div className="font-semibold text-gray-900 truncate" title={student.name}>
                            {student.name}
                          </div>
                          <div className="text-[10px] text-gray-400 flex items-center gap-1.5 font-mono">
                            {student.nisn && <span>NISN: {student.nisn}</span>}
                            {(student as any).nis && <span>NIS: {(student as any).nis}</span>}
                          </div>
                        </td>
                        {isUAMode && (
                          <td className="py-2.5 px-3 border-r border-gray-200 text-center">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold text-[10px] whitespace-nowrap">
                              {(student as any).className || classesMap[student.classId] || student.classId || '-'}
                            </span>
                          </td>
                        )}

                        {los.map(lo => {
                          const item = formativeMap[`${student.id}_${lo.id}`];
                          const latest = item?.latest;
                          const historyCount = item?.history?.length || 0;
                          const isCurrentCellSaving = quickSavingKey === `${student.id}_${lo.id}`;
                          const isLegacy = latest ? isLegacyScore(latest.comprehensionLevel) : false;
                          const nextActionText = typeof latest?.nextAction === 'string'
                            ? latest.nextAction.trim()
                            : '';

                          return (
                            <td
                              key={lo.id}
                              onClick={() => onOpenFormativeModal(student, lo)}
                              className="py-3 px-2.5 border-r border-gray-200 cursor-pointer hover:bg-purple-50/40 transition-colors group/cell align-top"
                            >
                              {latest ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span
                                        className={`px-1.5 py-0.5 rounded-md font-bold text-[10px] flex items-center justify-center shrink-0 border ${
                                          latest.comprehensionLevel === 'Achieved'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : latest.comprehensionLevel === 'Not Achieved'
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                        }`}
                                      >
                                        {isLegacy ? `${latest.comprehensionLevel} (Lama)` : latest.comprehensionLevel}
                                      </span>
                                      <div className="min-w-0">
                                        <div
                                          className="text-[10px] font-semibold text-gray-800 truncate max-w-[110px]"
                                          title={latest.formativeTask || 'Asesmen Cepat'}
                                        >
                                          {latest.formativeTask || 'Asesmen Cepat'}
                                        </div>
                                        <div className="text-[9px] text-gray-400">
                                          {formatDateWIB(latest.date)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {!isReadOnly && (
                                        <div
                                          className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center gap-0.5"
                                          onClick={e => e.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            disabled={isCurrentCellSaving}
                                            onClick={e => handleQuickScore(e, student, lo, 'Achieved')}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border cursor-pointer flex items-center gap-0.5 disabled:opacity-50 ${
                                              latest.comprehensionLevel === 'Achieved'
                                                ? 'bg-emerald-600 text-white border-emerald-700'
                                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                                            }`}
                                            title="Ubah / Koreksi cepat ke Achieved"
                                          >
                                            <Check size={10} /> Ach
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isCurrentCellSaving}
                                            onClick={e => handleQuickScore(e, student, lo, 'Not Achieved')}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border cursor-pointer flex items-center gap-0.5 disabled:opacity-50 ${
                                              latest.comprehensionLevel === 'Not Achieved'
                                                ? 'bg-rose-600 text-white border-rose-700'
                                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'
                                            }`}
                                            title="Ubah / Koreksi cepat ke Not Achieved"
                                          >
                                            <X size={10} /> Not
                                          </button>
                                        </div>
                                      )}
                                      {historyCount > 1 && (
                                        <span
                                          className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-700 bg-purple-50 px-1 rounded"
                                          title={`${historyCount} kali riwayat asesmen`}
                                        >
                                          <History size={10} /> {historyCount}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Next Action ditampilkan langsung, bukan hanya di modal. */}
                                  <div className="rounded-lg border border-purple-100 bg-purple-50/60 px-2.5 py-2">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-purple-600 mb-1">
                                      Next Action
                                    </p>
                                    <p
                                      className={`text-[11px] leading-relaxed whitespace-pre-wrap break-words ${
                                        nextActionText ? 'font-medium text-gray-800' : 'italic text-gray-400'
                                      }`}
                                    >
                                      {nextActionText || 'Belum diisi'}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-1 py-1">
                                  <span className="text-[11px] text-gray-400 font-medium">Belum dinilai</span>
                                  {!isReadOnly && (
                                    <div
                                      className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        disabled={isCurrentCellSaving}
                                        onClick={e => handleQuickScore(e, student, lo, 'Achieved')}
                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-200 border border-emerald-200 cursor-pointer flex items-center gap-0.5 disabled:opacity-50"
                                        title="Beri nilai Achieved"
                                      >
                                        <Check size={10} /> Ach
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isCurrentCellSaving}
                                        onClick={e => handleQuickScore(e, student, lo, 'Not Achieved')}
                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-200 border border-rose-200 cursor-pointer flex items-center gap-0.5 disabled:opacity-50"
                                        title="Beri nilai Not Achieved"
                                      >
                                        <X size={10} /> Not
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        <td
                          onClick={() => onOpenSummativeModal(student)}
                          className="py-2 px-3 border-l border-emerald-200 bg-emerald-50/20 group-hover:bg-emerald-50/50 cursor-pointer transition-colors"
                        >
                          {summativeEntry ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 border ${
                                  summativeEntry.summativeScore === 'A'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : summativeEntry.summativeScore === 'D'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : 'bg-rose-100 text-rose-800 border-rose-300'
                                }`}
                              >
                                {summativeEntry.summativeScore}
                              </span>
                              <div className="min-w-0">
                                <div className="text-[10px] font-semibold text-emerald-950 truncate" title={summativeEntry.summativeTask}>
                                  {summativeEntry.summativeTask}
                                </div>
                                <div className="text-[9px] text-emerald-700/70">
                                  {formatDateWIB(summativeEntry.date)}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-[11px] text-emerald-700/70 py-1">
                              <span>Belum sumatif</span>
                              {!isReadOnly && <span className="text-[10px] font-bold text-emerald-800 underline">Isi</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
