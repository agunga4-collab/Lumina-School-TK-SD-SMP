import * as React from 'react';
import { useState, useMemo } from 'react';
import { Search, Award, CheckCircle2, Check, X } from 'lucide-react';
import {
  JHAssessmentLO,
  JHFormativeEntry,
  JHSummativeEntry,
  isLegacyScore,
  LearningGoal,
  Student
} from '../../../../types';

interface Props {
  students: Student[];
  lg: LearningGoal;
  los: JHAssessmentLO[];
  formativeEntries: JHFormativeEntry[];
  summativeEntries: JHSummativeEntry[];
  mode?: 'SUBJECT' | 'UNIT_ACTIVITY';
  showClassColumn?: boolean;
  classesMap?: Record<string, string>;
  onOpenFormativeModal: (student: Student, lo: JHAssessmentLO) => void;
  onOpenSummativeModal: (student: Student) => void;
}

export function StudentRecapView({
  students,
  lg,
  los,
  formativeEntries,
  summativeEntries,
  mode = 'SUBJECT',
  showClassColumn = false,
  classesMap = {},
  onOpenFormativeModal,
  onOpenSummativeModal
}: Props) {
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'A' | 'D' | 'B' | 'NONE'>('ALL');
  const isUAMode = mode === 'UNIT_ACTIVITY' || showClassColumn;


  // Map latest formative entry per student per LO
  const latestFormativeMap = useMemo(() => {
    const map: Record<string, JHFormativeEntry> = {};
    for (const entry of formativeEntries) {
      map[`${entry.studentId}_${entry.loId}`] = entry;
    }
    return map;
  }, [formativeEntries]);

  // Map summative entry per student
  const summativeMap = useMemo(() => {
    const map: Record<string, JHSummativeEntry> = {};
    for (const entry of summativeEntries) {
      map[entry.studentId] = entry;
    }
    return map;
  }, [summativeEntries]);

  const filteredStudents = useMemo(() => {
    let result = students;
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        s =>
          s.name?.toLowerCase().includes(term) ||
          (s.nisn && s.nisn.includes(term)) ||
          ((s as any).nis && String((s as any).nis).includes(term))
      );
    }
    if (filterLevel !== 'ALL') {
      result = result.filter(s => {
        const sum = summativeMap[s.id];
        if (filterLevel === 'NONE') return !sum;
        return sum?.summativeScore === filterLevel;
      });
    }
    return result;
  }, [students, search, filterLevel, summativeMap]);

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari siswa atau NIS..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
          <span className="text-[11px] font-bold text-gray-500 uppercase">Filter Sumatif:</span>
          {(['ALL', 'A', 'D', 'B', 'NONE'] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filterLevel === lvl
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {lvl === 'ALL' ? 'Semua' : lvl === 'NONE' ? 'Belum Sumatif' : lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredStudents.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-200 text-xs">
            Tidak ada data siswa yang cocok dengan filter.
          </div>
        ) : (
          filteredStudents.map((student, idx) => {
            const summative = summativeMap[student.id];

            // Counts for this student (Skala lama dihitung terpisah, TIDAK otomatis Achieved)
            let countAchieved = 0;
            let countNotAchieved = 0;
            let countLegacy = 0;

            for (const lo of los) {
              const f = latestFormativeMap[`${student.id}_${lo.id}`];
              if (f) {
                if (f.comprehensionLevel === 'Achieved') {
                  countAchieved++;
                } else if (f.comprehensionLevel === 'Not Achieved') {
                  countNotAchieved++;
                } else if (isLegacyScore(f.comprehensionLevel)) {
                  countLegacy++;
                }
              }
            }

            const totalAssessed = countAchieved + countNotAchieved + countLegacy;
            const masteryPct = los.length > 0 ? Math.round((countAchieved / los.length) * 100) : 0;

            return (
              <div
                key={student.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-xs hover:border-purple-300 transition-all p-4 space-y-3.5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 font-bold text-slate-700 flex items-center justify-center text-xs shrink-0">
                      {student.attendanceNumber ?? (student as any).noAbsen ?? idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 truncate" title={student.name}>
                        {student.name}
                      </h4>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 font-mono">
                          {student.nisn ? `NISN: ${student.nisn}` : ((student as any).nis ? `NIS: ${(student as any).nis}` : 'Junior High')}
                        </span>
                        {isUAMode && ((student as any).className || classesMap[student.classId] || student.classId) && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {(student as any).className || classesMap[student.classId] || student.classId}
                          </span>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Summative Badge (Tetap skala B / D / A) */}
                  <div className="text-right shrink-0">
                    {summative ? (
                      <button
                        onClick={() => onOpenSummativeModal(student)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer ${
                          summative.summativeScore === 'A'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : summative.summativeScore === 'D'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        <Award size={13} />
                        <span>Sumatif: {summative.summativeScore}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenSummativeModal(student)}
                        className="px-2.5 py-1 rounded-xl text-xs font-medium bg-gray-100 hover:bg-emerald-100 text-gray-600 hover:text-emerald-800 border border-gray-200 cursor-pointer transition-colors"
                      >
                        + Input Sumatif
                      </button>
                    )}
                  </div>
                </div>

                {/* Formative Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium flex-wrap gap-1">
                    <span>
                      Progres Tangga LO ({totalAssessed}/{los.length} dinilai)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-emerald-700">{masteryPct}% Achieved</span>
                      {countLegacy > 0 && (
                        <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                          {countLegacy} LO Skala Lama
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden flex">
                    {los.length > 0 && (
                      <>
                        <div
                          style={{ width: `${(countAchieved / los.length) * 100}%` }}
                          className="bg-emerald-500 h-full"
                          title={`Achieved: ${countAchieved}`}
                        />
                        <div
                          style={{ width: `${(countNotAchieved / los.length) * 100}%` }}
                          className="bg-rose-400 h-full"
                          title={`Not Achieved: ${countNotAchieved}`}
                        />
                        <div
                          style={{ width: `${(countLegacy / los.length) * 100}%` }}
                          className="bg-amber-300 h-full"
                          title={`Skala Lama: ${countLegacy}`}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* LO Breakdown List */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Rincian Tiap LO:
                  </span>
                  <div className="space-y-1">
                    {los.map(lo => {
                      const f = latestFormativeMap[`${student.id}_${lo.id}`];
                      const isLegacy = f ? isLegacyScore(f.comprehensionLevel) : false;

                      return (
                        <div
                          key={lo.id}
                          onClick={() => onOpenFormativeModal(student, lo)}
                          className="p-2 rounded-xl border border-slate-200 hover:border-purple-300 hover:bg-purple-50/40 flex items-center justify-between gap-2 text-xs cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-500"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 border border-purple-200">
                              {lo.code}
                            </span>
                            <span className="text-[11px] text-slate-700 truncate font-medium" title={lo.title}>
                              {lo.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {f ? (
                              <>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    f.comprehensionLevel === 'Achieved'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : f.comprehensionLevel === 'Not Achieved'
                                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                                      : 'bg-amber-50 text-amber-800 border-amber-300'
                                  }`}
                                >
                                  {f.comprehensionLevel === 'Achieved' ? (
                                    <Check size={11} />
                                  ) : f.comprehensionLevel === 'Not Achieved' ? (
                                    <X size={11} />
                                  ) : null}
                                  {isLegacy ? `${f.comprehensionLevel} (Lama)` : f.comprehensionLevel}
                                </span>
                                <span className="text-[10px] text-slate-400 hidden sm:inline max-w-[120px] truncate" title={f.nextAction}>
                                  {f.nextAction}
                                </span>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                Belum dinilai
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes if any */}
                {summative?.notes && (
                  <div className="p-2 bg-emerald-50/50 rounded-xl border border-emerald-100 text-[11px] text-emerald-900">
                    <span className="font-bold">Tindak Lanjut Sumatif: </span>
                    {summative.notes}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
