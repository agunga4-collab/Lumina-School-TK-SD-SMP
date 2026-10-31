import * as React from 'react';
import { 
  Plus, Trash2, Edit2, Copy, Upload, Check, AlertCircle, 
  Layers, ChevronDown, ChevronRight, Save, Eye, EyeOff, 
  Sparkles, RefreshCw, HelpCircle, ArrowUpDown, X, Settings2
} from 'lucide-react';
import type { 
  ElementaryUpperCurriculumDoc,
  ElementaryUpperStudentDataDoc,
  ElementaryUpperSubject,
  ElementaryUpperProject,
  ElementaryUpperLearningGoal,
  ElementaryUpperLearningObjective,
  ElementaryUpperProjectLearningGoal,
  UpperLGStatusMode
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  calculateUpperLGAverageAndPredicate, 
  ELEMENTARY_UPPER_DEFAULT_SUBJECT_TEMPLATES 
} from '../../../../types/elementaryMonthlyUpperReport';
import { 
  saveUpperCurriculum, 
  saveUpperStudentScore, 
  setUpperStudentLgStatus, 
  batchSetUpperLgStatus,
  copyUpperCurriculumToClass
} from '../../../../services/elementaryMonthlyUpperReportService';
import type { Student, Class, User } from '../../../../types';
import { toast } from 'sonner';

interface UpperPelajaranProyekTabProps {
  curriculumDoc: ElementaryUpperCurriculumDoc | null;
  studentDataMap: Record<string, ElementaryUpperStudentDataDoc>;
  students: Student[];
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  allUpperClasses: Class[];
  currentUser: User;
  onRefreshData: () => void;
}

export const UpperPelajaranProyekTab: React.FC<UpperPelajaranProyekTabProps> = ({
  curriculumDoc,
  studentDataMap,
  students,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedMonth,
  monthLabel,
  allUpperClasses,
  currentUser,
  onRefreshData
}) => {
  // Active view mode: 'SUBJECTS' or 'PROJECTS'
  const [activeSubTab, setActiveSubTab] = React.useState<'SUBJECTS' | 'PROJECTS'>('SUBJECTS');

  // Search & Filter
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Bulk Edit / IP Status Modal
  const [bulkModalOpen, setBulkModalOpen] = React.useState<boolean>(false);
  const [bulkTargetLg, setBulkTargetLg] = React.useState<{ id: string; title: string; isProject?: boolean } | null>(null);
  const [bulkStatusMode, setBulkStatusMode] = React.useState<UpperLGStatusMode>('IP');

  // Copy Config Modal
  const [copyModalOpen, setCopyModalOpen] = React.useState<boolean>(false);
  const [targetClassId, setTargetClassId] = React.useState<string>('');

  // Import / Paste Modal with Sentinel 1 Mapping Checkbox
  const [importModalOpen, setImportModalOpen] = React.useState<boolean>(false);
  const [pastedText, setPastedText] = React.useState<string>('');
  const [treatOneAsIpSentinel, setTreatOneAsIpSentinel] = React.useState<boolean>(false);
  const [selectedImportLgId, setSelectedImportLgId] = React.useState<string>('');

  // Curriculum Editor Modal
  const [editCurriculumModalOpen, setEditCurriculumModalOpen] = React.useState<boolean>(false);
  const [curriculumDraft, setCurriculumDraft] = React.useState<ElementaryUpperCurriculumDoc | null>(null);

  // Initialize draft when opening curriculum editor
  const handleOpenCurriculumEditor = () => {
    if (!curriculumDoc) {
      // create initial starter structure with default subjects
      const initSubjects: ElementaryUpperSubject[] = ELEMENTARY_UPPER_DEFAULT_SUBJECT_TEMPLATES.map((name, idx) => ({
        id: `subj_${Date.now()}_${idx}`,
        name,
        kkm: 70,
        order: idx,
        isActiveForReport: true,
        learningGoals: [
          {
            id: `lg_${Date.now()}_${idx}_1`,
            code: `LG ${idx + 1}.1`,
            title: `Capaian Pembelajaran ${name}`,
            order: 0,
            isActiveForReport: true,
            learningObjectives: [
              { id: `lo_${Date.now()}_${idx}_1_1`, code: `LO 1`, title: 'Tujuan Pembelajaran 1', order: 0 },
              { id: `lo_${Date.now()}_${idx}_1_2`, code: `LO 2`, title: 'Tujuan Pembelajaran 2', order: 1 }
            ]
          }
        ]
      }));

      const initProjects: ElementaryUpperProject[] = [
        {
          id: `proj_${Date.now()}_1`,
          name: 'Proyek Kolaboratif STEM',
          performanceOfUnderstanding: 'Siswa merancang purwarupa sistem penjernih air sederhana dan mempresentasikannya.',
          order: 0,
          isActiveForReport: true,
          learningGoals: [
            {
              id: `plg_${Date.now()}_1`,
              code: 'PLG 1',
              title: 'Penerapan Konsep Ilmiah & Rekayasa',
              order: 0,
              learningObjectives: [
                { id: `plo_${Date.now()}_1_1`, code: 'PLO 1', title: 'Perancangan Alat & Kerja Kelompok', order: 0 },
                { id: `plo_${Date.now()}_1_2`, code: 'PLO 2', title: 'Pengujian & Presentasi Solusi', order: 1 }
              ]
            }
          ]
        }
      ];

      setCurriculumDraft({
        id: `upper_${selectedClass?.id}_${selectedYear.replace(/\//g, '_')}_S${selectedSemester}_M${selectedMonth}`,
        classId: selectedClass?.id || '',
        className: selectedClass?.name || '',
        gradeLevel: selectedClass?.grade || 4,
        academicYear: selectedYear,
        semester: selectedSemester,
        month: selectedMonth,
        subjects: initSubjects,
        projects: initProjects,
        createdAt: Date.now(),
        createdBy: currentUser.uid || 'system',
        updatedAt: Date.now(),
        updatedBy: currentUser.uid || 'system'
      });
    } else {
      setCurriculumDraft(JSON.parse(JSON.stringify(curriculumDoc)));
    }
    setEditCurriculumModalOpen(true);
  };

  const handleSaveCurriculumDraft = async () => {
    if (!curriculumDraft) return;
    try {
      await saveUpperCurriculum(curriculumDraft, currentUser);
      toast.success('Struktur pelajaran & proyek berhasil disimpan.');
      setEditCurriculumModalOpen(false);
      onRefreshData();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan kurikulum.');
    }
  };

  // Cell Score Change
  const handleScoreChange = async (student: Student, loId: string, valStr: string, isProject: boolean = false) => {
    let score: number | null = null;
    if (valStr.trim() !== '') {
      const num = parseFloat(valStr.replace(',', '.'));
      if (!isNaN(num)) {
        score = Math.max(0, Math.min(100, num));
      }
    }
    try {
      await saveUpperStudentScore(
        {
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass!.id,
          academicYear: selectedYear,
          semester: selectedSemester,
          month: selectedMonth,
          loId,
          score,
          isProject
        },
        currentUser
      );
      onRefreshData();
    } catch (e: any) {
      toast.error('Gagal memperbarui nilai.');
    }
  };

  // Toggle IP status mode for a student's LG
  const handleToggleLgStatus = async (student: Student, lgId: string, currentMode: UpperLGStatusMode, isProject: boolean = false) => {
    const newMode: UpperLGStatusMode = currentMode === 'IP' ? 'AUTO' : 'IP';
    try {
      await setUpperStudentLgStatus(
        {
          studentId: student.id,
          studentName: student.name,
          classId: selectedClass!.id,
          academicYear: selectedYear,
          semester: selectedSemester,
          month: selectedMonth,
          lgId,
          statusMode: newMode,
          isProject
        },
        currentUser
      );
      toast.success(newMode === 'IP' ? `LG ${student.name} diubah ke status IP (In Progress)` : `LG ${student.name} kembali ke kalkulasi angka.`);
      onRefreshData();
    } catch (e: any) {
      toast.error('Gagal mengubah status LG.');
    }
  };

  // Handle Bulk IP Status
  const handleExecuteBulkLgStatus = async () => {
    if (!bulkTargetLg || !selectedClass) return;
    try {
      await batchSetUpperLgStatus(
        {
          classId: selectedClass.id,
          academicYear: selectedYear,
          semester: selectedSemester,
          month: selectedMonth,
          lgId: bulkTargetLg.id,
          statusMode: bulkStatusMode,
          students,
          isProject: bulkTargetLg.isProject
        },
        currentUser
      );
      toast.success(`Berhasil mengatur status ${bulkStatusMode} untuk seluruh siswa pada ${bulkTargetLg.title}.`);
      setBulkModalOpen(false);
      onRefreshData();
    } catch (e: any) {
      toast.error('Gagal mengatur status massal.');
    }
  };

  // Handle Copy Curriculum to another class
  const handleExecuteCopyConfig = async () => {
    if (!targetClassId || !curriculumDoc) return;
    const targetCls = allUpperClasses.find(c => c.id === targetClassId);
    if (!targetCls) return;

    try {
      await copyUpperCurriculumToClass(
        curriculumDoc,
        targetClassId,
        targetCls.name,
        targetCls.grade || 4,
        currentUser
      );
      toast.success(`Struktur kurikulum & proyek berhasil disalin ke kelas ${targetCls.name} (nilai siswa tidak ikut disalin).`);
      setCopyModalOpen(false);
    } catch (e: any) {
      toast.error('Gagal menyalin konfigurasi.');
    }
  };

  // Filtered Students
  const filteredStudents = React.useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q) || (s as any).nisn?.includes(q));
  }, [students, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Controls: Mode Switch, Copy, Settings */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          {/* Sub-tabs: Pelajaran vs Proyek */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveSubTab('SUBJECTS')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeSubTab === 'SUBJECTS' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mata Pelajaran &amp; LG
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('PROJECTS')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeSubTab === 'PROJECTS' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Proyek Kelas &amp; Capaian
            </button>
          </div>

          <div className="text-xs text-slate-500 hidden sm:block">
            {activeSubTab === 'SUBJECTS' 
              ? `${curriculumDoc?.subjects?.length || 0} Mata Pelajaran` 
              : `${curriculumDoc?.projects?.length || 0} Proyek`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Kelola Struktur Kurikulum */}
          <button
            type="button"
            onClick={handleOpenCurriculumEditor}
            className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Settings2 size={14} className="text-emerald-600" />
            <span>Kelola Struktur Pelajaran &amp; Proyek</span>
          </button>

          {/* Salin Konfigurasi ke Kelas Lain */}
          <button
            type="button"
            onClick={() => setCopyModalOpen(true)}
            disabled={!curriculumDoc}
            className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Salin struktur ke kelas paralel tanpa nilai"
          >
            <Copy size={14} />
            <span>Salin Struktur ke Kelas Lain</span>
          </button>
        </div>
      </div>

      {/* SUBJECTS VIEW */}
      {activeSubTab === 'SUBJECTS' ? (
        !curriculumDoc || !curriculumDoc.subjects || curriculumDoc.subjects.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
              <Layers size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Belum Ada Struktur Pelajaran untuk Periode Ini</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Klik tombol di bawah untuk membuat mata pelajaran, Learning Goals, dan Learning Objectives awal.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCurriculumEditor}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              Buat Struktur Pelajaran &amp; Proyek
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {curriculumDoc.subjects.map((sub, sIdx) => {
              return (
                <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  {/* Subject Header */}
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                        {sIdx + 1}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">
                        {sub.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                        KKM: {sub.kkm || 70}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500 font-semibold">
                        Batas A: {(sub.kkm || 70) + (100 - (sub.kkm || 70)) / 2}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500">
                      {sub.learningGoals?.length || 0} Learning Goals
                    </div>
                  </div>

                  {/* Grid Table per LG */}
                  <div className="p-4 space-y-6">
                    {sub.learningGoals?.map((lg) => {
                      const effectiveKkm = lg.kkmOverride || sub.kkm || 70;
                      return (
                        <div key={lg.id} className="border border-slate-200 rounded-xl overflow-hidden">
                          {/* LG Subheader & Bulk Controls */}
                          <div className="p-3 bg-emerald-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px]">
                                  {lg.code || 'LG'}
                                </span>
                                <span>{lg.title}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                KKM: {effectiveKkm} · {lg.learningObjectives?.length || 0} Learning Objectives
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setBulkTargetLg({ id: lg.id, title: `${lg.code}: ${lg.title}`, isProject: false });
                                setBulkStatusMode('IP');
                                setBulkModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                            >
                              Atur Status Massal (IP / Auto)
                            </button>
                          </div>

                          {/* Student Scores Grid with Freeze Name Column */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-10">No</th>
                                  <th className="py-2.5 px-3 min-w-[180px] sticky left-10 bg-slate-100 z-10 border-r border-slate-200">
                                    Nama Siswa
                                  </th>
                                  {lg.learningObjectives?.map((lo, loIdx) => (
                                    <th key={lo.id} className="py-2.5 px-3 min-w-[100px] text-center border-r border-slate-200">
                                      <div className="font-bold text-slate-800">{lo.code || `LO ${loIdx + 1}`}</div>
                                      <div className="text-[9px] font-normal text-slate-500 truncate max-w-[110px]" title={lo.title}>
                                        {lo.title}
                                      </div>
                                    </th>
                                  ))}
                                  <th className="py-2.5 px-3 w-28 text-center bg-emerald-50/70 border-r border-slate-200">
                                    Rata-rata LG
                                  </th>
                                  <th className="py-2.5 px-3 w-24 text-center bg-emerald-100/70">
                                    Predikat
                                  </th>
                                  <th className="py-2.5 px-3 w-28 text-center">
                                    Aksi Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {students.map((st, idx) => {
                                  const stData = studentDataMap[st.id];
                                  const scores = stData?.scores || {};
                                  const statusMode = stData?.lgStatus?.[lg.id] || 'AUTO';

                                  const result = calculateUpperLGAverageAndPredicate(
                                    scores,
                                    lg.learningObjectives || [],
                                    effectiveKkm,
                                    statusMode
                                  );

                                  return (
                                    <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="py-2 px-3 text-center text-slate-400 font-semibold sticky left-0 bg-white hover:bg-slate-50 z-10">
                                        {idx + 1}
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-slate-800 sticky left-10 bg-white hover:bg-slate-50 z-10 border-r border-slate-200">
                                        {st.name}
                                      </td>

                                      {/* LO inputs */}
                                      {lg.learningObjectives?.map((lo) => {
                                        const rawVal = scores[lo.id];
                                        const displayVal = rawVal !== undefined && rawVal !== null ? rawVal : '';
                                        return (
                                          <td key={lo.id} className="py-2 px-2 text-center border-r border-slate-200">
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={displayVal}
                                              onChange={(e) => handleScoreChange(st, lo.id, e.target.value, false)}
                                              placeholder="-"
                                              className="w-16 px-2 py-1 text-center font-bold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white text-xs"
                                            />
                                          </td>
                                        );
                                      })}

                                      {/* Average */}
                                      <td className="py-2 px-3 text-center font-black text-slate-800 bg-emerald-50/30 border-r border-slate-200">
                                        {result.displayAverage}
                                      </td>

                                      {/* Predicate or IP */}
                                      <td className="py-2 px-3 text-center bg-emerald-50/50">
                                        {result.predicate === 'IP' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                            IP
                                          </span>
                                        ) : result.predicate === 'A' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                            A
                                          </span>
                                        ) : result.predicate === 'D' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-800">
                                            D
                                          </span>
                                        ) : result.predicate === 'B' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                                            B
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">-</span>
                                        )}
                                      </td>

                                      {/* Toggle IP / Auto */}
                                      <td className="py-2 px-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleLgStatus(st, lg.id, statusMode, false)}
                                          className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                                            statusMode === 'IP'
                                              ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                          }`}
                                          title={statusMode === 'IP' ? 'Klik untuk kembali ke mode hitung otomatis angka' : 'Klik untuk mengeset status In Progress (IP)'}
                                        >
                                          {statusMode === 'IP' ? 'Kembali Auto' : 'Set IP'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* PROJECTS VIEW */
        !curriculumDoc || !curriculumDoc.projects || curriculumDoc.projects.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Belum Ada Proyek untuk Periode Ini</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Upper Grade mendukung satu atau lebih proyek dengan nama, &quot;Performance of Understanding&quot;, dan Learning Goals tersendiri.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCurriculumEditor}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              Tambah Proyek Baru
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {curriculumDoc.projects.map((proj, pIdx) => {
              return (
                <div key={proj.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  {/* Project Header */}
                  <div className="p-4 bg-purple-50/60 border-b border-purple-100 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-purple-200 text-purple-800 font-bold text-xs flex items-center justify-center">
                          P{pIdx + 1}
                        </span>
                        <h3 className="text-sm font-bold text-purple-950 uppercase tracking-tight">
                          {proj.name}
                        </h3>
                      </div>
                      <span className="text-xs text-purple-700 font-semibold">
                        {proj.learningGoals?.length || 0} Project Goals
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 bg-white/80 p-3 rounded-xl border border-purple-200">
                      <strong className="text-purple-900">Performance of Understanding:</strong>{' '}
                      {proj.performanceOfUnderstanding || 'Belum diisi'}
                    </div>
                  </div>

                  {/* Project Goals Grid */}
                  <div className="p-4 space-y-6">
                    {proj.learningGoals?.map((plg) => {
                      return (
                        <div key={plg.id} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px]">
                                {plg.code || 'PLG'}
                              </span>
                              <span>{plg.title}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setBulkTargetLg({ id: plg.id, title: plg.title, isProject: true });
                                setBulkStatusMode('IP');
                                setBulkModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                            >
                              Atur Status Massal (IP / Auto)
                            </button>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-100 z-10">No</th>
                                  <th className="py-2.5 px-3 min-w-[180px] sticky left-10 bg-slate-100 z-10 border-r border-slate-200">
                                    Nama Siswa
                                  </th>
                                  {plg.learningObjectives?.map((plo, ploIdx) => (
                                    <th key={plo.id} className="py-2.5 px-3 min-w-[100px] text-center border-r border-slate-200">
                                      <div className="font-bold text-slate-800">{plo.code || `PLO ${ploIdx + 1}`}</div>
                                      <div className="text-[9px] font-normal text-slate-500 truncate max-w-[110px]" title={plo.title}>
                                        {plo.title}
                                      </div>
                                    </th>
                                  ))}
                                  <th className="py-2.5 px-3 w-28 text-center bg-purple-50/70 border-r border-slate-200">
                                    Rata-rata
                                  </th>
                                  <th className="py-2.5 px-3 w-24 text-center bg-purple-100/70">
                                    Predikat
                                  </th>
                                  <th className="py-2.5 px-3 w-28 text-center">
                                    Aksi Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {students.map((st, idx) => {
                                  const stData = studentDataMap[st.id];
                                  const projectScores = stData?.projectScores || {};
                                  const statusMode = stData?.projectLgStatus?.[plg.id] || 'AUTO';

                                  const result = calculateUpperLGAverageAndPredicate(
                                    projectScores,
                                    plg.learningObjectives || [],
                                    70,
                                    statusMode
                                  );

                                  return (
                                    <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="py-2 px-3 text-center text-slate-400 font-semibold sticky left-0 bg-white hover:bg-slate-50 z-10">
                                        {idx + 1}
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-slate-800 sticky left-10 bg-white hover:bg-slate-50 z-10 border-r border-slate-200">
                                        {st.name}
                                      </td>

                                      {/* Project LO inputs */}
                                      {plg.learningObjectives?.map((plo) => {
                                        const rawVal = projectScores[plo.id];
                                        const displayVal = rawVal !== undefined && rawVal !== null ? rawVal : '';
                                        return (
                                          <td key={plo.id} className="py-2 px-2 text-center border-r border-slate-200">
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={displayVal}
                                              onChange={(e) => handleScoreChange(st, plo.id, e.target.value, true)}
                                              placeholder="-"
                                              className="w-16 px-2 py-1 text-center font-bold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white text-xs"
                                            />
                                          </td>
                                        );
                                      })}

                                      <td className="py-2 px-3 text-center font-black text-slate-800 bg-purple-50/30 border-r border-slate-200">
                                        {result.displayAverage}
                                      </td>

                                      <td className="py-2 px-3 text-center bg-purple-50/50">
                                        {result.predicate === 'IP' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                            IP
                                          </span>
                                        ) : result.predicate === 'A' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                            A
                                          </span>
                                        ) : result.predicate === 'D' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-800">
                                            D
                                          </span>
                                        ) : result.predicate === 'B' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                                            B
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">-</span>
                                        )}
                                      </td>

                                      <td className="py-2 px-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleLgStatus(st, plg.id, statusMode, true)}
                                          className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                                            statusMode === 'IP'
                                              ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                          }`}
                                        >
                                          {statusMode === 'IP' ? 'Kembali Auto' : 'Set IP'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* MODAL 1: Bulk Set IP / Auto Status */}
      {bulkModalOpen && bulkTargetLg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Atur Status Massal LG</h3>
              <button type="button" onClick={() => setBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <p>Target LG: <strong>{bulkTargetLg.title}</strong></p>
              <p>Pilih status yang akan diterapkan pada <strong>seluruh {students.length} siswa</strong>:</p>
              <div className="flex gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="radio"
                    name="bulkStatus"
                    value="IP"
                    checked={bulkStatusMode === 'IP'}
                    onChange={() => setBulkStatusMode('IP')}
                  />
                  <span>IP (In Progress - Proses Berlangsung)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="radio"
                    name="bulkStatus"
                    value="AUTO"
                    checked={bulkStatusMode === 'AUTO'}
                    onChange={() => setBulkStatusMode('AUTO')}
                  />
                  <span>AUTO (Kalkulasi Angka LO)</span>
                </label>
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-2">
                Catatan: Mengubah status ke IP tidak menghapus nilai angka yang tersimpan. Siswa dapat dikembalikan ke mode hitung kapan pun.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkLgStatus}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Terapkan Massal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Copy Config to Another Class */}
      {copyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Salin Struktur ke Kelas Lain</h3>
              <button type="button" onClick={() => setCopyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Salin daftar mata pelajaran, KKM, LG, LO, dan proyek kelas <strong>{selectedClass?.name}</strong> ke kelas Upper Grade paralel:
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pilih Kelas Tujuan:</label>
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {allUpperClasses.filter(c => c.id !== selectedClass?.id).map(c => (
                    <option key={c.id} value={c.id}>{c.name} (Grade {c.grade || 4})</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                Aman: Tindakan ini hanya menyalin template struktur. Nilai dan capaian siswa di kelas tujuan tidak akan tertimpa.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteCopyConfig}
                disabled={!targetClassId}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
              >
                Salin Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Curriculum Structure Editor */}
      {editCurriculumModalOpen && curriculumDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Pengaturan Struktur Pelajaran &amp; Proyek</h3>
                <p className="text-xs text-slate-500">
                  Tambah, ubah nama, atur KKM, serta tambahkan Learning Goals/Objectives dan Proyek.
                </p>
              </div>
              <button type="button" onClick={() => setEditCurriculumModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Subjects Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide">Daftar Mata Pelajaran</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const newSubj: ElementaryUpperSubject = {
                        id: `subj_${Date.now()}`,
                        name: 'Mata Pelajaran Baru',
                        kkm: 70,
                        order: curriculumDraft.subjects.length,
                        isActiveForReport: true,
                        learningGoals: []
                      };
                      setCurriculumDraft({
                        ...curriculumDraft,
                        subjects: [...curriculumDraft.subjects, newSubj]
                      });
                    }}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"
                  >
                    <Plus size={13} />
                    <span>Tambah Pelajaran</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {curriculumDraft.subjects.map((sub, sIdx) => (
                    <div key={sub.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Nama Pelajaran</label>
                          <input
                            type="text"
                            value={sub.name}
                            onChange={(e) => {
                              const copy = [...curriculumDraft.subjects];
                              copy[sIdx].name = e.target.value;
                              setCurriculumDraft({ ...curriculumDraft, subjects: copy });
                            }}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">KKM Pelajaran</label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={sub.kkm}
                            onChange={(e) => {
                              const copy = [...curriculumDraft.subjects];
                              copy[sIdx].kkm = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 70));
                              setCurriculumDraft({ ...curriculumDraft, subjects: copy });
                            }}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-bold text-center"
                          />
                        </div>

                        <div className="flex justify-end pt-3 sm:pt-0">
                          <button
                            type="button"
                            onClick={() => {
                              const copy = curriculumDraft.subjects.filter((_, i) => i !== sIdx);
                              setCurriculumDraft({ ...curriculumDraft, subjects: copy });
                            }}
                            className="p-2 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50"
                            title="Hapus Pelajaran"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Learning Goals under this Subject */}
                      <div className="pl-4 border-l-2 border-emerald-300 space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 text-[11px]">Learning Goals ({sub.learningGoals?.length || 0})</span>
                          <button
                            type="button"
                            onClick={() => {
                              const copy = [...curriculumDraft.subjects];
                              const newLg: ElementaryUpperLearningGoal = {
                                id: `lg_${Date.now()}`,
                                code: `LG ${copy[sIdx].learningGoals.length + 1}`,
                                title: 'Judul Learning Goal baru',
                                order: copy[sIdx].learningGoals.length,
                                isActiveForReport: true,
                                learningObjectives: [
                                  { id: `lo_${Date.now()}_1`, code: 'LO 1', title: 'Tujuan 1', order: 0 }
                                ]
                              };
                              copy[sIdx].learningGoals.push(newLg);
                              setCurriculumDraft({ ...curriculumDraft, subjects: copy });
                            }}
                            className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
                          >
                            <Plus size={11} />
                            <span>Tambah LG</span>
                          </button>
                        </div>

                        {sub.learningGoals?.map((lg, lgIdx) => (
                          <div key={lg.id} className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                              <div>
                                <input
                                  type="text"
                                  value={lg.code}
                                  onChange={(e) => {
                                    const copy = [...curriculumDraft.subjects];
                                    copy[sIdx].learningGoals[lgIdx].code = e.target.value;
                                    setCurriculumDraft({ ...curriculumDraft, subjects: copy });
                                  }}
                                  placeholder="LG 1.1"
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-bold"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <input
                                  type="text"
                                  value={lg.title}
                                  onChange={(e) => {
                                    const copy = [...curriculumDraft.subjects];
                                    copy[sIdx].learningGoals[lgIdx].title = e.target.value;
                                    setCurriculumDraft({ ...curriculumDraft, subjects: copy });
                                  }}
                                  placeholder="Judul Learning Goal"
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                />
                              </div>
                              <div className="flex justify-end items-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copy = [...curriculumDraft.subjects];
                                    copy[sIdx].learningGoals = copy[sIdx].learningGoals.filter((_, i) => i !== lgIdx);
                                    setCurriculumDraft({ ...curriculumDraft, subjects: copy });
                                  }}
                                  className="p-1 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Projects Section */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide">Daftar Proyek Kelas</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const newProj: ElementaryUpperProject = {
                        id: `proj_${Date.now()}`,
                        name: 'Proyek Kolaboratif Baru',
                        performanceOfUnderstanding: 'Deskripsi Performance of Understanding',
                        order: curriculumDraft.projects.length,
                        isActiveForReport: true,
                        learningGoals: [
                          {
                            id: `plg_${Date.now()}`,
                            code: 'PLG 1',
                            title: 'Tujuan Capaian Proyek 1',
                            order: 0,
                            learningObjectives: [
                              { id: `plo_${Date.now()}`, code: 'PLO 1', title: 'Indikator Proyek 1', order: 0 }
                            ]
                          }
                        ]
                      };
                      setCurriculumDraft({
                        ...curriculumDraft,
                        projects: [...curriculumDraft.projects, newProj]
                      });
                    }}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 flex items-center gap-1"
                  >
                    <Plus size={13} />
                    <span>Tambah Proyek</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {curriculumDraft.projects.map((proj, pIdx) => (
                    <div key={proj.id} className="p-4 bg-purple-50/50 rounded-2xl border border-purple-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={proj.name}
                          onChange={(e) => {
                            const copy = [...curriculumDraft.projects];
                            copy[pIdx].name = e.target.value;
                            setCurriculumDraft({ ...curriculumDraft, projects: copy });
                          }}
                          placeholder="Nama Proyek"
                          className="w-full sm:w-2/3 px-3 py-1.5 border border-purple-300 rounded-lg bg-white font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const copy = curriculumDraft.projects.filter((_, i) => i !== pIdx);
                            setCurriculumDraft({ ...curriculumDraft, projects: copy });
                          }}
                          className="p-1 text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-purple-900 uppercase">Performance of Understanding</label>
                        <textarea
                          rows={2}
                          value={proj.performanceOfUnderstanding}
                          onChange={(e) => {
                            const copy = [...curriculumDraft.projects];
                            copy[pIdx].performanceOfUnderstanding = e.target.value;
                            setCurriculumDraft({ ...curriculumDraft, projects: copy });
                          }}
                          className="w-full px-3 py-2 border border-purple-300 rounded-lg bg-white text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setEditCurriculumModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200/50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveCurriculumDraft}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                Simpan Struktur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
