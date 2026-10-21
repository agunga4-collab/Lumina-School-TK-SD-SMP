import * as React from 'react';
import { useState, useMemo } from 'react';
import {
  X,
  Users,
  Save,
  Calendar,
  Target,
  Check,
  CheckCheck,
  AlertCircle,
  HelpCircle,
  Edit2,
  Search,
  Filter
} from 'lucide-react';
import {
  AssessmentBookOptions,
  JHAssessmentLO,
  JHFormativeScore,
  Student
} from '../../../../types';
import {
  bulkAddFormativeEntries,
  getTodayWIB
} from '../../../../services/juniorHighAssessmentBookService';
import { toast } from 'sonner';

interface StudentRowState {
  comprehensionLevel: JHFormativeScore | null;
  nextAction: string;
  isCustomNextAction: boolean;
  customNextActionText: string;
  notes: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lo: JHAssessmentLO;
  students: Student[];
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  options: AssessmentBookOptions;
  teacherId: string;
  teacherName: string;
  onSuccess: () => void;
  mode?: 'SUBJECT' | 'UNIT_ACTIVITY';
  showClassColumn?: boolean;
  classesMap?: Record<string, string>;
  unitActivityName?: string;
  unitActivityCategory?: string;
  targetGrade?: string;
}

export function BulkFormativeModal({
  isOpen,
  onClose,
  lo,
  students,
  classId,
  subjectId,
  academicYear,
  semester,
  options,
  teacherId,
  teacherName,
  onSuccess,
  mode = 'SUBJECT',
  showClassColumn = false,
  classesMap = {},
  unitActivityName = '',
  unitActivityCategory = '',
  targetGrade = 'ALL'
}: Props) {
  const isUAMode = mode === 'UNIT_ACTIVITY' || showClassColumn;

  // Session-wide fields (filled once for the whole class session)
  const [date, setDate] = useState<string>(() => getTodayWIB());
  const [taskChoice, setTaskChoice] = useState<string>(() => options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
  const [customTaskText, setCustomTaskText] = useState<string>('');
  const [sessionId] = useState<string>(() => `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

  // Selected students for bulk Next Action
  const [selectedForNextAction, setSelectedForNextAction] = useState<string[]>([]);
  const [bulkNextActionChoice, setBulkNextActionChoice] = useState<string>(() => options.nextActions[0] || 'Lanjut ke LO Berikutnya');
  const [bulkCustomNextActionText, setBulkCustomNextActionText] = useState<string>('');

  // Modal in-table filters
  const [modalSearch, setModalSearch] = useState('');
  const [modalGradeFilter, setModalGradeFilter] = useState<'ALL' | '7' | '8' | '9'>('ALL');
  const [modalClassFilter, setModalClassFilter] = useState<string>('ALL');

  // Per-student rows (initialized with null score so unassessed students remain blank)
  const [studentRows, setStudentRows] = useState<Record<string, StudentRowState>>(() => {
    const init: Record<string, StudentRowState> = {};
    for (const s of students) {
      init[s.id] = {
        comprehensionLevel: null,
        nextAction: '',
        isCustomNextAction: false,
        customNextActionText: '',
        notes: ''
      };
    }
    return init;
  });

  const [saving, setSaving] = useState(false);

  // Available classes in the current student list for filtering in UA mode
  const availableModalClasses = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (s.classId) {
        const name = (s as any).className || classesMap[s.classId] || s.classId;
        map.set(s.classId, name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [students, classesMap]);

  // Reset or reinitialize when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDate(getTodayWIB());
      setTaskChoice(options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
      setCustomTaskText('');
      setSelectedForNextAction([]);
      setBulkNextActionChoice(options.nextActions[0] || 'Lanjut ke LO Berikutnya');
      setBulkCustomNextActionText('');
      setModalSearch('');
      setModalGradeFilter('ALL');
      setModalClassFilter('ALL');

      const init: Record<string, StudentRowState> = {};
      for (const s of students) {
        init[s.id] = {
          comprehensionLevel: null,
          nextAction: '',
          isCustomNextAction: false,
          customNextActionText: '',
          notes: ''
        };
      }
      setStudentRows(init);
    }
  }, [isOpen, students, options]);

  // Filtered visible students based on in-modal search & filters
  const visibleStudents = useMemo(() => {
    return students.filter(s => {
      if (modalSearch.trim()) {
        const term = modalSearch.toLowerCase();
        const matchName = s.name?.toLowerCase().includes(term);
        const matchNis = (s as any).nis && String((s as any).nis).includes(term);
        const matchNisn = s.nisn && s.nisn.includes(term);
        if (!matchName && !matchNis && !matchNisn) return false;
      }
      if (modalGradeFilter !== 'ALL') {
        const g = (s as any).grade;
        if (g && String(g) !== String(modalGradeFilter)) return false;
      }
      if (modalClassFilter !== 'ALL') {
        if (s.classId !== modalClassFilter) return false;
      }
      return true;
    });
  }, [students, modalSearch, modalGradeFilter, modalClassFilter]);

  // Statistics across all students
  const { countAchieved, countNotAchieved, countUnassessed, countAssessed } = useMemo(() => {
    let achieved = 0;
    let notAchieved = 0;
    let unassessed = 0;

    for (const s of students) {
      const row = studentRows[s.id];
      if (row?.comprehensionLevel === 'Achieved') achieved++;
      else if (row?.comprehensionLevel === 'Not Achieved') notAchieved++;
      else unassessed++;
    }
    return {
      countAchieved: achieved,
      countNotAchieved: notAchieved,
      countUnassessed: unassessed,
      countAssessed: achieved + notAchieved
    };
  }, [students, studentRows]);

  if (!isOpen) return null;

  // Toggle single student checkbox for Next Action
  const handleToggleSelectForNextAction = (studentId: string) => {
    setSelectedForNextAction(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  // Toggle select all / deselect all for VISIBLE students only
  const isAllVisibleSelected =
    visibleStudents.length > 0 && visibleStudents.every(s => selectedForNextAction.includes(s.id));

  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      // Deselect only the currently visible students
      const visibleIds = new Set(visibleStudents.map(s => s.id));
      setSelectedForNextAction(prev => prev.filter(id => !visibleIds.has(id)));
    } else {
      // Select all visible students
      const set = new Set(selectedForNextAction);
      visibleStudents.forEach(s => set.add(s.id));
      setSelectedForNextAction(Array.from(set));
    }
  };

  // Change individual student score (Achieved / Not Achieved / clear)
  // CRITICAL: Does NOT overwrite existing Next Action!
  const handleSetStudentScore = (studentId: string, level: JHFormativeScore) => {
    setStudentRows(prev => {
      const current = prev[studentId] || {
        comprehensionLevel: null,
        nextAction: '',
        isCustomNextAction: false,
        customNextActionText: '',
        notes: ''
      };

      // Toggle off if clicking the active level
      const nextLevel: JHFormativeScore | null = current.comprehensionLevel === level ? null : level;

      // Suggest nextAction ONLY if it's completely blank, never overwrite existing!
      let resolvedNextAction = current.nextAction;
      let resolvedIsCustom = current.isCustomNextAction;
      let resolvedCustomText = current.customNextActionText;

      if (!resolvedNextAction && nextLevel !== null) {
        if (nextLevel === 'Achieved') {
          resolvedNextAction = 'Lanjut ke LO Berikutnya';
        } else {
          resolvedNextAction = 'Refleksi & Remediasi Terfokus';
        }
      }

      return {
        ...prev,
        [studentId]: {
          ...current,
          comprehensionLevel: nextLevel,
          nextAction: resolvedNextAction,
          isCustomNextAction: resolvedIsCustom,
          customNextActionText: resolvedCustomText
        }
      };
    });
  };

  // Change individual Next Action
  const handleStudentNextActionChange = (studentId: string, val: string) => {
    setStudentRows(prev => {
      const current = prev[studentId];
      if (val === '__CUSTOM__') {
        return {
          ...prev,
          [studentId]: {
            ...current,
            nextAction: '__CUSTOM__',
            isCustomNextAction: true
          }
        };
      }
      return {
        ...prev,
        [studentId]: {
          ...current,
          nextAction: val,
          isCustomNextAction: false
        }
      };
    });
  };

  // Change individual Custom Next Action Text
  const handleStudentCustomNextActionText = (studentId: string, text: string) => {
    setStudentRows(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        customNextActionText: text
      }
    }));
  };

  // Change individual Notes
  const handleStudentNotesChange = (studentId: string, notes: string) => {
    setStudentRows(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        notes
      }
    }));
  };

  // Apply Next Action to selected students
  const handleApplyBulkNextAction = () => {
    if (selectedForNextAction.length === 0) {
      toast.warning('Pilih minimal 1 siswa dengan mencentang kotak di tabel');
      return;
    }

    const isCustom = bulkNextActionChoice === '__CUSTOM__';
    const targetText = isCustom ? bulkCustomNextActionText.trim() : bulkNextActionChoice;

    if (isCustom && !targetText) {
      toast.warning('Tuliskan teks Next Action kustom terlebih dahulu');
      return;
    }

    // Get selected students info
    const selectedStudentsList = students.filter(s => selectedForNextAction.includes(s.id));
    const studentNames = selectedStudentsList.map(s => s.name);
    const namesPreview =
      studentNames.slice(0, 5).join(', ') +
      (studentNames.length > 5 ? ` dan ${studentNames.length - 5} lainnya` : '');

    // Check if any selected student already has a non-empty next action different from target
    const studentsWithExistingAction = selectedStudentsList.filter(s => {
      const row = studentRows[s.id];
      if (!row) return false;
      const currentText = row.isCustomNextAction ? row.customNextActionText.trim() : row.nextAction;
      return Boolean(currentText && currentText !== targetText);
    });

    if (studentsWithExistingAction.length > 0) {
      const existingNames = studentsWithExistingAction
        .map(s => s.name)
        .slice(0, 4)
        .join(', ');
      const confirmed = window.confirm(
        `Sebanyak ${studentsWithExistingAction.length} peserta terpilih (${existingNames}${
          studentsWithExistingAction.length > 4 ? '...' : ''
        }) sudah memiliki Next Action terisi.\n\nApakah Anda yakin ingin menimpa Next Action mereka dengan "${targetText}"?\n(Capaian LO tidak akan diubah)`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(
        `Terapkan Next Action "${targetText}" kepada ${selectedForNextAction.length} peserta terpilih:\n(${namesPreview})?\n\n(Capaian LO tidak akan diubah)`
      );
      if (!confirmed) return;
    }

    setStudentRows(prev => {
      const updated = { ...prev };
      for (const sid of selectedForNextAction) {
        updated[sid] = {
          ...updated[sid],
          nextAction: isCustom ? '__CUSTOM__' : targetText,
          isCustomNextAction: isCustom,
          customNextActionText: isCustom ? targetText : ''
        };
      }
      return updated;
    });

    toast.success(`Next Action berhasil diterapkan ke ${selectedForNextAction.length} peserta terpilih!`);
  };

  // Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subjectId || !subjectId.trim()) {
      toast.warning('Mata pelajaran tidak boleh kosong');
      return;
    }

    // Resolve Formative Task
    const resolvedTask = taskChoice === '__CUSTOM__' ? customTaskText.trim() : taskChoice.trim();
    if (taskChoice === '__CUSTOM__' && !resolvedTask) {
      toast.warning('Silakan tuliskan nama Formative Task kustom untuk sesi ini');
      return;
    }
    if (!resolvedTask) {
      toast.warning('Formative Task tidak boleh kosong');
      return;
    }

    // Filter only assessed students (comprehensionLevel !== null)
    const assessedStudents = students.filter(s => {
      const row = studentRows[s.id];
      return row && row.comprehensionLevel !== null;
    });

    if (assessedStudents.length === 0) {
      toast.warning('Belum ada siswa yang dinilai. Beri nilai Achieved atau Not Achieved pada minimal 1 siswa.');
      return;
    }

    // Check that custom next actions have text if chosen
    for (const s of assessedStudents) {
      const row = studentRows[s.id];
      if (row.isCustomNextAction && !row.customNextActionText.trim()) {
        toast.warning(`Peserta ${s.name} memilih "Lainnya" pada Next Action tapi teksnya masih kosong.`);
        return;
      }
    }

    const assessedNamesPreview =
      assessedStudents.map(s => s.name).slice(0, 5).join(', ') +
      (assessedStudents.length > 5 ? ` dan ${assessedStudents.length - 5} lainnya` : '');

    const confirmSave = window.confirm(
      `Konfirmasi Simpan Sesi Asesmen:\n\n` +
      `• Tanggal: ${date}\n` +
      `• Kegiatan: ${resolvedTask}\n` +
      `• Peserta dinilai: ${assessedStudents.length} peserta (${assessedNamesPreview})\n` +
      `• Peserta belum dinilai: ${students.length - assessedStudents.length} (tetap kosong/tidak disimpan)\n\n` +
      `Lanjutkan simpan?`
    );
    if (!confirmSave) return;

    setSaving(true);
    try {
      const payloadEntries = assessedStudents.map(s => {
        const row = studentRows[s.id];
        const resolvedNextAction = row.isCustomNextAction
          ? row.customNextActionText.trim()
          : (row.nextAction.trim() || 'Lanjut ke LO Berikutnya');

        return {
          loId: lo.id,
          lgId: lo.lgId,
          classId: s.classId || classId, // Origin classId strictly preserved
          subjectId,
          academicYear,
          semester,
          studentId: s.id,
          studentName: s.name,
          date,
          formativeTask: resolvedTask,
          comprehensionLevel: row.comprehensionLevel as JHFormativeScore,
          nextAction: resolvedNextAction,
          notes: (row.notes || '').trim(),
          sessionId,
          teacherId,
          teacherName,
          assessmentMode: mode,
          unitActivityId: unitActivityName || undefined,
          unitActivityName: unitActivityName || undefined,
          unitActivityCategory: unitActivityCategory || undefined,
          targetGrade: targetGrade !== 'ALL' ? targetGrade : undefined
        };
      });

      await bulkAddFormativeEntries(payloadEntries);
      toast.success(
        `Berhasil menyimpan sesi asesmen untuk ${assessedStudents.length} peserta! (${students.length - assessedStudents.length} peserta belum dinilai tetap kosong)`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan sesi asesmen: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
              <Users size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900">
                  {isUAMode ? 'Asesmen Satu Sesi Peserta UA' : 'Asesmen Satu Sesi Kelas'}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                  {lo.code}
                </span>
                {isUAMode && unitActivityName && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {unitActivityName}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 line-clamp-1 max-w-2xl" title={lo.title}>
                {lo.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Container */}
        <form id="session-bulk-form" onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Top Session Config Bar (Filled once for this session) */}
          <div className="p-4 sm:p-5 bg-purple-50/40 border-b border-purple-100/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                <Target size={14} className="text-purple-600" />
                {isUAMode
                  ? 'Informasi Sesi Pembelajaran (Berlaku untuk Peserta UA Terpilih)'
                  : 'Informasi Sesi Pembelajaran (Berlaku Satu Kelas)'}
              </span>
              <span className="text-[11px] text-gray-400 font-mono">
                ID Sesi: {sessionId.substring(0, 14)}...
              </span>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tanggal Asesmen */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tanggal Asesmen (WIB) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white"
                    required
                  />
                </div>
              </div>

              {/* Formative Task with Lainnya option */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Formative Task (Bentuk Kegiatan) <span className="text-red-500">*</span>
                </label>
                <select
                  value={taskChoice}
                  onChange={e => setTaskChoice(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 bg-white"
                  required
                >
                  {options.formativeTasks.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__CUSTOM__">✍️ Lainnya — Tulis sendiri...</option>
                </select>

                {taskChoice === '__CUSTOM__' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={customTaskText}
                      onChange={e => setCustomTaskText(e.target.value)}
                      placeholder="Tuliskan nama bentuk tugas formatif... *"
                      className="w-full text-xs px-3 py-2 border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 bg-purple-50/50"
                      required
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Modal Filter and Search Bar */}
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  placeholder="Cari peserta dalam sesi ini..."
                  className="w-full pl-8 pr-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:ring-1 focus:ring-purple-500"
                />
              </div>
              {isUAMode && (
                <>
                  <select
                    value={modalGradeFilter}
                    onChange={e => setModalGradeFilter(e.target.value as any)}
                    className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white"
                  >
                    <option value="ALL">Semua Grade</option>
                    <option value="7">Grade 7</option>
                    <option value="8">Grade 8</option>
                    <option value="9">Grade 9</option>
                  </select>
                  {availableModalClasses.length > 1 && (
                    <select
                      value={modalClassFilter}
                      onChange={e => setModalClassFilter(e.target.value)}
                      className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white"
                    >
                      <option value="ALL">Semua Kelas Asal</option>
                      {availableModalClasses.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>

            <div className="text-[11px] text-gray-500 font-medium">
              Menampilkan <strong className="text-gray-900">{visibleStudents.length}</strong> dari {students.length} peserta
            </div>
          </div>

          {/* Bulk Next Action Bar */}
          <div className="px-4 py-3 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-700">Terapkan Next Action Cepat:</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-[11px]">
                {selectedForNextAction.length} peserta terpilih
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end max-w-xl">
              <select
                value={bulkNextActionChoice}
                onChange={e => setBulkNextActionChoice(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-xl bg-white max-w-xs focus:ring-2 focus:ring-blue-500"
              >
                {options.nextActions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
                <option value="__CUSTOM__">✍️ Lainnya — Tulis sendiri...</option>
              </select>

              {bulkNextActionChoice === '__CUSTOM__' && (
                <input
                  type="text"
                  value={bulkCustomNextActionText}
                  onChange={e => setBulkCustomNextActionText(e.target.value)}
                  placeholder="Next Action kustom..."
                  className="text-xs px-2.5 py-1.5 border border-blue-300 rounded-xl bg-white w-44 focus:ring-2 focus:ring-blue-500"
                />
              )}

              <button
                type="button"
                onClick={handleApplyBulkNextAction}
                disabled={selectedForNextAction.length === 0}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
              >
                <CheckCheck size={14} /> Terapkan ke Peserta Terpilih
              </button>
            </div>
          </div>

          {/* Main Table */}
          <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 p-4">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-gray-200 text-gray-700 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={handleToggleSelectAll}
                      title="Pilih / Batal Pilih Semua peserta yang tampil untuk Next Action"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-2 w-10 text-center font-mono">No</th>
                  <th className="py-2.5 px-3 min-w-[170px] max-w-[210px]">Nama Siswa</th>
                  {isUAMode && (
                    <th className="py-2.5 px-3 w-24 text-center">Kelas</th>
                  )}
                  <th className="py-2.5 px-3 min-w-[210px] text-center">
                    Capaian LO <span className="text-gray-400 normal-case font-normal">(Klik untuk menilai)</span>
                  </th>
                  <th className="py-2.5 px-3 min-w-[220px]">Next Action (Tindak Lanjut)</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Catatan Siswa (Opsional)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleStudents.length === 0 ? (
                  <tr>
                    <td colSpan={isUAMode ? 7 : 6} className="py-8 text-center text-gray-400">
                      Tidak ada peserta yang sesuai filter pencarian di modal ini.
                    </td>
                  </tr>
                ) : (
                  visibleStudents.map((student, idx) => {
                    const row = studentRows[student.id] || {
                      comprehensionLevel: null,
                      nextAction: '',
                      isCustomNextAction: false,
                      customNextActionText: '',
                      notes: ''
                    };
                    const isChecked = selectedForNextAction.includes(student.id);

                    return (
                      <tr
                        key={student.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          row.comprehensionLevel ? 'bg-white' : 'bg-gray-50/40 text-gray-500'
                        }`}
                      >
                        {/* Checkbox for bulk Next Action */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectForNextAction(student.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* No Absen */}
                        <td className="py-2 px-2 text-center text-gray-400 font-mono">
                          {student.attendanceNumber ?? (student as any).noAbsen ?? idx + 1}
                        </td>

                        {/* Nama Siswa */}
                        <td className="py-2 px-3">
                          <div className="font-semibold text-gray-900 truncate" title={student.name}>
                            {student.name}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            {student.nisn ? `NISN: ${student.nisn}` : ((student as any).nis ? `NIS: ${(student as any).nis}` : '')}
                          </div>
                        </td>

                        {/* Kelas Asal (UA mode) */}
                        {isUAMode && (
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold text-[10px] whitespace-nowrap">
                              {(student as any).className || classesMap[student.classId] || student.classId || '-'}
                            </span>
                          </td>
                        )}


                      {/* Capaian LO: Achieved vs Not Achieved vs Belum dinilai */}
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Achieved */}
                          <button
                            type="button"
                            onClick={() => handleSetStudentScore(student.id, 'Achieved')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              row.comprehensionLevel === 'Achieved'
                                ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400'
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            <Check size={13} /> Achieved
                          </button>

                          {/* Not Achieved */}
                          <button
                            type="button"
                            onClick={() => handleSetStudentScore(student.id, 'Not Achieved')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              row.comprehensionLevel === 'Not Achieved'
                                ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-400'
                                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                            }`}
                          >
                            <X size={13} /> Not Achieved
                          </button>

                          {/* Status Indicator if unassessed */}
                          {row.comprehensionLevel === null && (
                            <span className="text-[10px] text-gray-400 italic ml-1">
                              (Kosong)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Next Action */}
                      <td className="py-2 px-3">
                        <div className="space-y-1.5">
                          <select
                            value={row.isCustomNextAction ? '__CUSTOM__' : (row.nextAction || options.nextActions[0])}
                            onChange={e => handleStudentNextActionChange(student.id, e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                          >
                            {options.nextActions.map(a => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                            <option value="__CUSTOM__">✍️ Lainnya — Tulis sendiri...</option>
                          </select>

                          {row.isCustomNextAction && (
                            <input
                              type="text"
                              value={row.customNextActionText}
                              onChange={e => handleStudentCustomNextActionText(student.id, e.target.value)}
                              placeholder="Tuliskan Next Action... *"
                              className="w-full text-xs px-2 py-1 border border-purple-300 rounded-lg bg-purple-50/50 focus:ring-2 focus:ring-purple-500"
                            />
                          )}
                        </div>
                      </td>

                      {/* Catatan Siswa */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={e => handleStudentNotesChange(student.id, e.target.value)}
                          placeholder="Catatan observasi..."
                          className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                        />
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>

          {/* Modal Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            {/* Live Stats */}
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-gray-700">
                {countAssessed} dari {students.length} {isUAMode ? 'peserta' : 'siswa'} dinilai:
              </span>
              <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                {countAchieved} Achieved
              </span>
              <span className="px-2 py-0.5 rounded-md font-bold bg-rose-100 text-rose-800 border border-rose-200">
                {countNotAchieved} Not Achieved
              </span>
              {countUnassessed > 0 && (
                <span className="text-gray-400 text-[11px] hidden md:inline">
                  • {countUnassessed} belum dinilai tidak akan disimpan
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                form="session-bulk-form"
                disabled={saving || countAssessed === 0}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Save size={15} />
                {saving ? 'Menyimpan Sesi...' : `Simpan Sesi Asesmen (${countAssessed} ${isUAMode ? 'Peserta' : 'Siswa'})`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
