import * as React from 'react';
import { toast } from 'sonner';
import { Check, X, Search, Award, Loader2, FileSpreadsheet } from 'lucide-react';
import { AssessmentBookOptions, JHAssessmentLO, JHFormativeEntry, JHSummativeEntry, LearningGoal, Student, isLegacyScore } from '../../../../types';
import { addFormativeEntry, correctFormativeEntry, formatDateWIB, getAssignedFormativeTask, getTodayWIB } from '../../../../services/juniorHighAssessmentBookService';

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
  onOpenFormativeModal: (student: Student, lo: JHAssessmentLO) => void;
  onOpenSummativeModal: (student: Student) => void;
  onOpenManageLOModal: () => void;
  onOpenBulkModal: (lo: JHAssessmentLO) => void;
  onOpenSharedTaskModal: (lo: JHAssessmentLO) => void;
  onOpenSheetImportModal?: (lo: JHAssessmentLO) => void;
  onRefreshData: () => void;
}

export function FormativeMatrixGrid(props: Props) {
  const {
    students,
    lg,
    los,
    formativeEntries,
    summativeEntries,
    classId,
    subjectId,
    academicYear,
    semester,
    teacherId,
    teacherName,
    isReadOnly = false,
    onOpenFormativeModal,
    onOpenSummativeModal,
    onOpenManageLOModal,
    onOpenBulkModal,
    onOpenSharedTaskModal,
    onOpenSheetImportModal,
    onRefreshData
  } = props;

  const [search, setSearch] = React.useState('');
  const [saving, setSaving] = React.useState('');
  const lock = React.useRef(false);

  const visible = students.filter(item =>
    `${item.name} ${item.nisn || ''} ${(item as Student & { nis?: string }).nis || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const latest = React.useMemo(() => {
    const result: Record<string, JHFormativeEntry> = {};
    [...formativeEntries]
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))
      .forEach(item => { result[`${item.studentId}|${item.loId}`] = item; });
    return result;
  }, [formativeEntries]);

  const quick = async (student: Student, lo: JHAssessmentLO, level: 'Achieved' | 'Not Achieved') => {
    if (isReadOnly || lock.current) return;
    lock.current = true;
    setSaving(`${student.id}|${lo.id}`);
    const assigned = getAssignedFormativeTask(lo, student.id);
    const date = assigned?.date || getTodayWIB();
    const old = [...formativeEntries].reverse().find(
      item => item.studentId === student.id && item.loId === lo.id && item.teacherId === teacherId && item.date === date && (!assigned || item.formativeTask === assigned.formativeTask)
    );
    const nextAction = old?.nextAction || (level === 'Achieved' ? 'Lanjut ke LO Berikutnya' : 'Bimbingan Personal Guru');
    try {
      if (old) {
        await correctFormativeEntry({ entryId: old.id, comprehensionLevel: level, nextAction, correctedBy: teacherId, correctedByName: teacherName, correctionReason: 'Klik cepat kelas' });
      } else {
        await addFormativeEntry({ loId: lo.id, lgId: lo.lgId, classId, subjectId, academicYear, semester, studentId: student.id, studentName: student.name, date, formativeTask: assigned?.formativeTask || '', comprehensionLevel: level, nextAction, notes: '', teacherId, teacherName });
      }
      toast.success('Capaian siswa tersimpan.');
      onRefreshData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      lock.current = false;
      setSaving('');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      <div className="p-4 bg-slate-50/60 border-b border-slate-200 flex flex-wrap justify-between gap-3 items-center">
        <div>
          <p className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-slate-700">{lg.code}</span> · {visible.length} siswa ditampilkan dari {students.length}
          </p>
          <div className="relative mt-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Cari nama atau NIS siswa..."
              className="w-64 pl-8 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white hover:border-slate-400 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500 transition-colors"
            />
          </div>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            onClick={onOpenManageLOModal}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-purple-50 hover:border-purple-300 text-purple-800 text-xs font-semibold cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-400 shadow-2xs"
          >
            + Kelola Tangga LO ({los.length})
          </button>
        )}
      </div>

      <div className="relative isolate w-full min-w-0 overflow-x-auto">
  <table className="w-full min-w-[900px] text-left text-xs border-separate border-spacing-0">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-700">
            <tr>
             <th
  className="sticky left-0 z-20 w-[48px] min-w-[48px] max-w-[48px] bg-slate-50 p-3 text-center font-bold"
>
  No
</th>

<th
  className="sticky left-[48px] z-20 w-[200px] min-w-[200px] max-w-[200px] border-r border-slate-200 bg-slate-50 p-3 font-bold shadow-[4px_0_6px_-4px_rgba(15,23,42,0.25)]"
>
  Nama Siswa
</th>
              {los.map(lo => {
                const count = students.filter(item => latest[`${item.id}|${lo.id}`]).length;
                return (
                  <th key={lo.id} className="p-3 min-w-[260px] border-l border-slate-200 align-top bg-white">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-purple-800 font-bold text-xs px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 inline-block">
                        {lo.code}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {count}/{students.length} dinilai
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 text-xs leading-snug break-words">{lo.title}</p>
                    {!isReadOnly && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold shadow-xs inline-flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-500 whitespace-nowrap"
                          onClick={() => onOpenSharedTaskModal(lo)}
                        >
                          Tetapkan Task Kelas
                        </button>
                        <button
                          type="button"
                          className="py-1.5 px-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-purple-400 whitespace-nowrap"
                          onClick={() => onOpenBulkModal(lo)}
                        >
                          Nilai massal — nilai sama
                        </button>
                        <button
                          type="button"
                          className="py-1.5 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-emerald-400 whitespace-nowrap"
                          onClick={() => onOpenSheetImportModal?.(lo)}
                          title="Ambil dan sinkronkan nilai dari Google Sheet"
                        >
                          <FileSpreadsheet size={12} className="text-emerald-600" />
                          Ambil dari Sheet
                        </button>
                      </div>
                    )}
                  </th>
                );
              })}
              <th className="p-3 min-w-[150px] bg-emerald-50/70 border-l border-slate-200 align-top text-emerald-950">
                <span className="font-bold text-xs block">Nilai Sumatif LG</span>
                <span className="text-[10px] text-emerald-800 font-normal">Skala B / D / A</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((student, index) => (
              <tr
  key={student.id}
  className="group hover:bg-slate-50/90 transition-colors"
>
                <td
  className="sticky left-0 z-10 w-[48px] min-w-[48px] max-w-[48px] bg-white p-3 align-top text-center font-mono text-slate-400 group-hover:bg-slate-50"
>
  {student.attendanceNumber ??
    (student as Student & { noAbsen?: number }).noAbsen ??
    index + 1}
</td>

<td
  className="sticky left-[48px] z-10 w-[200px] min-w-[200px] max-w-[200px] border-r border-slate-200 bg-white p-3 align-top font-semibold text-slate-900 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.25)] group-hover:bg-slate-50"
>
  <span className="block whitespace-normal break-words text-xs">
    {student.name}
  </span>
  <span className="mt-0.5 block break-all font-mono text-[10px] font-normal text-slate-400">
    {student.nisn || student.id}
  </span>
</td>
                {los.map(lo => {
                  const entry = latest[`${student.id}|${lo.id}`];
                  const assigned = getAssignedFormativeTask(lo, student.id);
                  const isCurrentSaving = saving === `${student.id}|${lo.id}`;
                  return (
                    <td key={lo.id} className="p-3 border-l border-slate-100 align-top">
                      <button
                        type="button"
                        className="text-left w-full space-y-2 p-2 rounded-xl border border-transparent hover:border-slate-200 hover:bg-white hover:shadow-xs transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500"
                        onClick={() => onOpenFormativeModal(student, lo)}
                      >
                        {assigned && (
                          <div className="p-2 bg-blue-50/90 border border-blue-200 text-blue-900 rounded-lg text-[11px]">
                            <span className="font-bold block text-[10px] uppercase text-blue-700">Task Bersama</span>
                            <span className="break-words font-medium">{assigned.formativeTask}</span>
                            <span className="block text-[10px] text-blue-600/80 mt-0.5">{formatDateWIB(assigned.date)}</span>
                          </div>
                        )}
                        {entry ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                  entry.comprehensionLevel === 'Achieved'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : entry.comprehensionLevel === 'Not Achieved'
                                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {entry.comprehensionLevel === 'Achieved' ? (
                                  <Check size={12} />
                                ) : entry.comprehensionLevel === 'Not Achieved' ? (
                                  <X size={12} />
                                ) : null}
                                {entry.comprehensionLevel}
                                {isLegacyScore(entry.comprehensionLevel) ? ' (lama)' : ''}
                              </span>
                            </div>
                            <p className="text-slate-700 font-medium text-xs break-words">{entry.formativeTask || 'Asesmen Cepat'}</p>
                            <p className="text-[10px] text-slate-400 font-normal">{formatDateWIB(entry.date)}</p>
                            <div className="p-2 bg-purple-50/70 border border-purple-100 rounded-lg text-[11px] text-purple-950">
                              <span className="text-[9px] uppercase font-bold text-purple-700 block">Next Action</span>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">{entry.nextAction || 'Belum diisi'}</p>
                            </div>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                            Belum dinilai
                          </span>
                        )}
                      </button>
                      {!isReadOnly && (
                        <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            disabled={!!saving}
                            onClick={e => {
                              e.stopPropagation();
                              void quick(student, lo, 'Achieved');
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-2xs"
                          >
                            <Check size={12} /> Achieved
                          </button>
                          <button
                            type="button"
                            disabled={!!saving}
                            onClick={e => {
                              e.stopPropagation();
                              void quick(student, lo, 'Not Achieved');
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 hover:border-rose-400 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-rose-500 shadow-2xs"
                          >
                            <X size={12} /> Not Achieved
                          </button>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="p-3 bg-emerald-50/20 border-l border-slate-100 align-top">
                  <button
                    type="button"
                    className="w-full text-left p-2 rounded-xl border border-transparent hover:border-emerald-300 hover:bg-emerald-50/60 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
                    onClick={() => onOpenSummativeModal(student)}
                  >
                    {summativeEntries.find(item => item.studentId === student.id)?.summativeScore ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Sumatif: {summativeEntries.find(item => item.studentId === student.id)?.summativeScore}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-700 font-semibold underline hover:text-emerald-900">
                        {isReadOnly ? 'Belum sumatif' : '+ Isi Sumatif'}
                      </span>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!los.length && (
        <p className="p-8 text-center text-sm text-slate-500">Tambahkan LO melalui Kelola Tangga LO.</p>
      )}
    </div>
  );
}

