import * as React from 'react';
import { toast } from 'sonner';
import { Check, X, Search, Loader2, FileSpreadsheet, Calendar, AlertTriangle } from 'lucide-react';
import {
  AssessmentBookOptions,
  JHAssessmentLO,
  JHFormativeEntry,
  JHSummativeEntry,
  LearningGoal,
  Student,
  isLegacyScore
} from '../../../../types';
import {
  addFormativeEntry,
  correctFormativeEntry,
  formatDateWIB,
  getAssignedFormativeTask,
  getTodayWIB,
  getEffectiveLODate,
  updateLOAssessmentDate,
  LODateResolution
} from '../../../../services/juniorHighAssessmentBookService';
import { LODateConfirmModal } from './LODateConfirmModal';

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
  onUpdateLODate?: (loId: string, newDate: string) => Promise<void>;
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
    onUpdateLODate,
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

  // Local draft dates per LO for the date input
  const [draftDates, setDraftDates] = React.useState<Record<string, string>>({});

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = React.useState<{
    isOpen: boolean;
    lo: JHAssessmentLO | null;
    oldDate: string;
    newDate: string;
    affectedCount: number;
    hasConflict: boolean;
    distinctDates: { date: string; count: number }[];
  }>({
    isOpen: false,
    lo: null,
    oldDate: '',
    newDate: '',
    affectedCount: 0,
    hasConflict: false,
    distinctDates: []
  });

  const visible = students.filter(item =>
    `${item.name} ${item.nisn || ''} ${(item as Student & { nis?: string }).nis || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate latest entry per student and LO regardless of date
  const latest = React.useMemo(() => {
    const result: Record<string, JHFormativeEntry> = {};
    [...formativeEntries]
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))
      .forEach(item => {
        result[`${item.studentId}|${item.loId}`] = item;
      });
    return result;
  }, [formativeEntries]);

  // Group entries by LO
  const entriesByLO = React.useMemo(() => {
    const map = new Map<string, JHFormativeEntry[]>();
    for (const e of formativeEntries) {
      const list = map.get(e.loId) || [];
      list.push(e);
      map.set(e.loId, list);
    }
    return map;
  }, [formativeEntries]);

  // Resolution per LO
  const loResolutions = React.useMemo(() => {
    const map = new Map<string, LODateResolution>();
    for (const lo of los) {
      const list = entriesByLO.get(lo.id) || [];
      map.set(lo.id, getEffectiveLODate(lo, list));
    }
    return map;
  }, [los, entriesByLO]);

  const getEffectiveDate = (loId: string): string => {
    return loResolutions.get(loId)?.date || getTodayWIB();
  };

  const getDraftDate = (loId: string): string => {
    return draftDates[loId] !== undefined ? draftDates[loId] : getEffectiveDate(loId);
  };

  const openConfirmModal = (lo: JHAssessmentLO, newDate: string, isAlign = false) => {
    const res = loResolutions.get(lo.id);
    const affectedCount = entriesByLO.get(lo.id)?.length || 0;
    setConfirmModal({
      isOpen: true,
      lo,
      oldDate: res?.isExplicit ? res.date : (isAlign ? 'Beragam' : res?.date || getTodayWIB()),
      newDate,
      affectedCount,
      hasConflict: !!res?.hasConflict,
      distinctDates: res?.distinctDates || []
    });
  };

  const handleConfirmDateChange = async () => {
    if (!confirmModal.lo || !confirmModal.newDate) return;
    const loId = confirmModal.lo.id;
    const newDate = confirmModal.newDate;

    if (onUpdateLODate) {
      await onUpdateLODate(loId, newDate);
    } else {
      const res = await updateLOAssessmentDate({
        loId,
        newDate,
        teacherId,
        teacherName,
        scope: {
          classId,
          subjectId,
          academicYear,
          semester,
          lgId: lg.id
        }
      });
      if (!res.success) {
        toast.error(res.error || 'Gagal memperbarui tanggal asesmen LO');
        return;
      }
      toast.success(`Tanggal asesmen LO diperbarui ke ${formatDateWIB(newDate)} (${res.updatedEntriesCount} entri diselaraskan).`);
      onRefreshData();
    }

    setDraftDates(prev => {
      const next = { ...prev };
      delete next[loId];
      return next;
    });
  };

  const quick = async (student: Student, lo: JHAssessmentLO, level: 'Achieved' | 'Not Achieved') => {
    if (isReadOnly || lock.current) return;
    const effectiveDate = getEffectiveDate(lo.id);
    const assigned = getAssignedFormativeTask(lo, student.id);
    const existingEntry = latest[`${student.id}|${lo.id}`];

    lock.current = true;
    setSaving(`${student.id}|${lo.id}`);
    const nextAction = existingEntry?.nextAction || (level === 'Achieved' ? 'Lanjut ke LO Berikutnya' : 'Bimbingan Personal Guru');

    try {
      if (existingEntry) {
        await correctFormativeEntry({
          entryId: existingEntry.id,
          comprehensionLevel: level,
          nextAction,
          date: effectiveDate,
          correctedBy: teacherId,
          correctedByName: teacherName,
          correctionReason: 'Klik cepat kelas'
        });
      } else {
        await addFormativeEntry({
          loId: lo.id,
          lgId: lo.lgId,
          classId,
          subjectId,
          academicYear,
          semester,
          studentId: student.id,
          studentName: student.name,
          date: effectiveDate,
          formativeTask: assigned?.formativeTask || '',
          comprehensionLevel: level,
          nextAction,
          notes: '',
          teacherId,
          teacherName
        });
      }
      toast.success(`Capaian ${formatDateWIB(effectiveDate)} tersimpan.`);
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
      {/* Top Header Filter & Actions */}
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

      {/* Matrix Table */}
      <div className="relative isolate w-full min-w-0 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs border-separate border-spacing-0">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-700">
            <tr>
              <th className="sticky left-0 z-20 w-[48px] min-w-[48px] max-w-[48px] bg-slate-50 p-3 text-center font-bold">
                No
              </th>
              <th className="sticky left-[48px] z-20 w-[200px] min-w-[200px] max-w-[200px] border-r border-slate-200 bg-slate-50 p-3 font-bold shadow-[4px_0_6px_-4px_rgba(15,23,42,0.25)]">
                Nama Siswa
              </th>
              {los.map(lo => {
                const res = loResolutions.get(lo.id) || {
                  date: getTodayWIB(),
                  isExplicit: false,
                  hasConflict: false,
                  distinctDates: [],
                  totalEntriesCount: 0
                };
                const effectiveDate = res.date;
                const draftDate = getDraftDate(lo.id);
                const isDateDirty = draftDate !== effectiveDate;

                // Total assessed count on this LO (never drops to zero on draft date change!)
                const assessedCount = students.filter(st => latest[`${st.id}|${lo.id}`]).length;

                return (
                  <th key={lo.id} className="p-3 min-w-[280px] border-l border-slate-200 align-top bg-white">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-purple-800 font-bold text-xs px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 inline-block">
                        {lo.code}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {assessedCount}/{students.length} dinilai
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 text-xs leading-snug break-words">{lo.title}</p>

                    {/* Single LO Assessment Date Editor */}
                    <div className={`mt-2.5 p-2 rounded-xl border text-left transition-colors ${
                      isDateDirty
                        ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-300'
                        : res.hasConflict
                        ? 'bg-amber-50/70 border-amber-300'
                        : 'bg-slate-50/90 border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <label className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                          <Calendar size={12} className="text-purple-600 shrink-0" />
                          <span>Tanggal Asesmen LO</span>
                        </label>
                        {draftDate !== getTodayWIB() && !isReadOnly && (
                          <button
                            type="button"
                            onClick={() => setDraftDates(prev => ({ ...prev, [lo.id]: getTodayWIB() }))}
                            className="text-[9px] text-purple-700 hover:text-purple-900 font-semibold cursor-pointer underline"
                            title="Set input ke hari ini"
                          >
                            Hari ini
                          </button>
                        )}
                      </div>

                      <input
                        type="date"
                        value={draftDate}
                        disabled={isReadOnly}
                        onChange={event => {
                          const val = event.target.value;
                          if (val) setDraftDates(prev => ({ ...prev, [lo.id]: val }));
                        }}
                        className="w-full text-[11px] font-medium py-1 px-2 border border-slate-300 rounded-lg bg-white hover:border-slate-400 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500 transition-colors"
                      />

                      <div className="flex items-center justify-between gap-1 mt-1 text-[10px]">
                        <span className="text-slate-500 truncate" title={formatDateWIB(draftDate)}>
                          {formatDateWIB(draftDate)}
                        </span>
                        {res.isExplicit && !isDateDirty && (
                          <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Tersimpan
                          </span>
                        )}
                      </div>

                      {/* Conflict Alert if dates differ among existing entries */}
                      {res.hasConflict && !isDateDirty && (
                        <div className="mt-2 pt-1.5 border-t border-amber-200 text-amber-900 space-y-1">
                          <div className="flex items-center gap-1 font-semibold text-[10px] text-amber-800">
                            <AlertTriangle size={11} className="shrink-0 text-amber-600" />
                            <span>Terdapat {res.distinctDates.length} tanggal berbeda ({res.totalEntriesCount} entri)</span>
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => openConfirmModal(lo, draftDate, true)}
                              className="w-full py-1 px-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] text-center shadow-2xs cursor-pointer active:scale-95 transition-all"
                            >
                              Selaraskan ke {formatDateWIB(draftDate)}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Dirty Date: Action to Save and Confirm Date Change */}
                      {isDateDirty && !isReadOnly && (
                        <div className="mt-2 pt-1.5 border-t border-purple-200 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => openConfirmModal(lo, draftDate, false)}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-[10px] text-center shadow-2xs cursor-pointer active:scale-95 transition-all"
                          >
                            Simpan Perubahan Tanggal
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraftDates(prev => {
                              const next = { ...prev };
                              delete next[lo.id];
                              return next;
                            })}
                            className="py-1.5 px-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 text-[10px] font-semibold cursor-pointer"
                            title="Batalkan perubahan input tanggal"
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>

                    {!isReadOnly && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
              <tr key={student.id} className="group hover:bg-slate-50/90 transition-colors">
                <td className="sticky left-0 z-10 w-[48px] min-w-[48px] max-w-[48px] bg-white p-3 align-top text-center font-mono text-slate-400 group-hover:bg-slate-50">
                  {student.attendanceNumber ?? (student as Student & { noAbsen?: number }).noAbsen ?? index + 1}
                </td>
                <td className="sticky left-[48px] z-10 w-[200px] min-w-[200px] max-w-[200px] border-r border-slate-200 bg-white p-3 align-top font-semibold text-slate-900 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.25)] group-hover:bg-slate-50">
                  <span className="block whitespace-normal break-words text-xs">{student.name}</span>
                  <span className="mt-0.5 block break-all font-mono text-[10px] font-normal text-slate-400">
                    {student.nisn || student.id}
                  </span>
                </td>
                {los.map(lo => {
                  const entry = latest[`${student.id}|${lo.id}`];
                  const studentLoHistory = formativeEntries.filter(
                    item => item.studentId === student.id && item.loId === lo.id
                  );
                  const assigned = getAssignedFormativeTask(lo, student.id);

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
                            <p className="text-[10px] text-slate-400 font-normal">
                              {formatDateWIB(entry.date)}
                              {studentLoHistory.length > 1 && ` · ${studentLoHistory.length} entri`}
                            </p>
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
                            className={`flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-2xs ${
                              entry?.comprehensionLevel === 'Achieved'
                                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400'
                            }`}
                            title={`Nilai Achieved`}
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
                            className={`flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-rose-500 shadow-2xs ${
                              entry?.comprehensionLevel === 'Not Achieved'
                                ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                                : 'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 hover:border-rose-400'
                            }`}
                            title={`Nilai Not Achieved`}
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

      {/* Date change confirmation modal */}
      {confirmModal.lo && (
        <LODateConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          lo={confirmModal.lo}
          oldDate={confirmModal.oldDate}
          newDate={confirmModal.newDate}
          affectedCount={confirmModal.affectedCount}
          hasConflict={confirmModal.hasConflict}
          distinctDates={confirmModal.distinctDates}
          onConfirm={handleConfirmDateChange}
        />
      )}
    </div>
  );
}
