import * as React from 'react';
import { 
  Eye, ExternalLink, Copy, Check, 
  Search, CheckCircle2, EyeOff, FileText, X,
  Layers, BookOpen, Info, ArrowRight, HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { MidtermPdfTemplate } from './MidtermPdfTemplate';
import type { 
  PublishedMidtermReport, 
  MidtermReportSnapshot,
  MidtermMasterGoalDoc,
  MidtermStudentDataDoc,
  MidtermGoalItem
} from '../../../types/midtermReport';
import type { Student, Class, User } from '../../../types';

interface MidtermRekapTabProps {
  currentUser: User;
  classes: Class[];
  selectedClassId: string;
  onSelectClassId: (id: string) => void;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  publishedReports: PublishedMidtermReport[];
  loading: boolean;
  onRefreshData: () => Promise<void>;
  masterGoalsMap?: Record<string, MidtermMasterGoalDoc>;
  studentDataMap?: Record<string, MidtermStudentDataDoc>;
}

export const MidtermRekapTab: React.FC<MidtermRekapTabProps> = ({
  currentUser,
  classes,
  selectedClassId,
  onSelectClassId,
  students,
  academicYear,
  semester,
  midtermTerm,
  publishedReports,
  loading,
  onRefreshData,
  masterGoalsMap = {},
  studentDataMap = {}
}) => {
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safePublishedReports = Array.isArray(publishedReports) ? publishedReports.filter(Boolean) : [];
  const safeClasses = Array.isArray(classes) ? classes.filter(Boolean) : [];

  const [filterPublishStatus, setFilterPublishStatus] = React.useState<'ALL' | 'PUBLISHED' | 'UNPUBLISHED'>('ALL');
  const [filterOpenStatus, setFilterOpenStatus] = React.useState<'ALL' | 'OPENED' | 'UNOPENED'>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Toggle detail learning goals - persistent in localStorage
  const [showDetailGoals, setShowDetailGoals] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('jh_midterm_show_detail_goals');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });

  const handleToggleDetailGoals = (val: boolean) => {
    setShowDetailGoals(val);
    try {
      localStorage.setItem('jh_midterm_show_detail_goals', String(val));
    } catch (e) {
      console.error('Error saving detail goals preference:', e);
    }
  };

  // Subject filter when in detail view
  const [selectedSubjectFilter, setSelectedSubjectFilter] = React.useState<string>('ALL');

  // Tooltip tracking state for accessibility and touch/focus
  const [activeTooltipId, setActiveTooltipId] = React.useState<string | null>(null);

  // Modal snapshot preview
  const [previewSnapshot, setPreviewSnapshot] = React.useState<MidtermReportSnapshot | null>(null);
  const [previewTitle, setPreviewTitle] = React.useState<string>('');

  // Map published report by studentId (highest version)
  const publishedMap = React.useMemo(() => {
    const map: Record<string, PublishedMidtermReport> = {};
    for (const rep of safePublishedReports) {
      if (rep && rep.studentId) {
        if (!map[rep.studentId] || (rep.version ?? 0) > (map[rep.studentId].version ?? 0)) {
          map[rep.studentId] = rep;
        }
      }
    }
    return map;
  }, [safePublishedReports]);

  // Compute stats
  const totalStudents = safeStudents.length;
  const publishedStudentsCount = safeStudents.filter(s => s && s.id && Boolean(publishedMap[s.id])).length;
  const openedStudentsCount = safeStudents.filter(s => {
    if (!s || !s.id) return false;
    const rep = publishedMap[s.id];
    return Boolean(rep && rep.isOpened);
  }).length;
  const openRatePercent = publishedStudentsCount > 0 ? Math.round((openedStudentsCount / publishedStudentsCount) * 100) : 0;

  // Filter student rows
  const filteredRows = React.useMemo(() => {
    return safeStudents.filter(student => {
      if (!student || !student.id) return false;
      const rep = publishedMap[student.id];
      const isPublished = Boolean(rep);
      const isOpened = Boolean(rep?.isOpened);

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const studentName = typeof student.name === 'string' ? student.name : '';
        const matchesName = studentName.toLowerCase().includes(q);
        const matchesNisn = String(student.nisn || (student as any).nis || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNisn) return false;
      }

      // Publish status
      if (filterPublishStatus === 'PUBLISHED' && !isPublished) return false;
      if (filterPublishStatus === 'UNPUBLISHED' && isPublished) return false;

      // Open status
      if (filterOpenStatus === 'OPENED' && !isOpened) return false;
      if (filterOpenStatus === 'UNOPENED' && (!isPublished || isOpened)) return false;

      return true;
    });
  }, [safeStudents, publishedMap, searchQuery, filterPublishStatus, filterOpenStatus]);

  // Extract active subjects and their defined goals
  const activeSubjectsAndGoals = React.useMemo(() => {
    const list: { subject: string; goals: MidtermGoalItem[] }[] = [];
    if (!masterGoalsMap) return list;

    // Define standard junior high subjects list to enforce a consistent layout ordering
    const orderedSubjects = [
      'Spiritual Health',
      'Bahasa Indonesia',
      'Science',
      'Mathematics',
      'English',
      'Social Studies and Civics',
      'Islamic Studies',
      'Quran Recitation',
      'Household & Urban Gardening',
      'Kewirausahaan',
      'Performing Arts',
      'Art & Makerspace',
      'Physical Education',
      'Digital Literacy'
    ];

    for (const sub of orderedSubjects) {
      const mDoc = masterGoalsMap[sub];
      if (mDoc && Array.isArray(mDoc.goals) && mDoc.goals.length > 0) {
        list.push({
          subject: sub,
          goals: mDoc.goals.filter(g => g && g.id && g.text)
        });
      }
    }

    // Capture any dynamically defined subjects outside standard list
    for (const sub of Object.keys(masterGoalsMap)) {
      if (!orderedSubjects.includes(sub)) {
        const mDoc = masterGoalsMap[sub];
        if (mDoc && Array.isArray(mDoc.goals) && mDoc.goals.length > 0) {
          list.push({
            subject: sub,
            goals: mDoc.goals.filter(g => g && g.id && g.text)
          });
        }
      }
    }

    return list;
  }, [masterGoalsMap]);

  // Compute total active goals
  const totalActiveGoalsCount = React.useMemo(() => {
    return activeSubjectsAndGoals.reduce((sum, item) => sum + item.goals.length, 0);
  }, [activeSubjectsAndGoals]);

  // Filter subjects based on user select filter
  const filteredSubjectsAndGoals = React.useMemo(() => {
    if (selectedSubjectFilter === 'ALL') {
      return activeSubjectsAndGoals;
    }
    return activeSubjectsAndGoals.filter(item => item.subject === selectedSubjectFilter);
  }, [activeSubjectsAndGoals, selectedSubjectFilter]);

  // Subject code mapping helper
  const getSubjectCode = React.useCallback((subj: string): string => {
    const clean = subj.trim().toLowerCase();
    if (clean.includes('indonesia')) return 'BIN';
    if (clean.includes('science') || clean.includes('ipa')) return 'IPA';
    if (clean.includes('math')) return 'MTK';
    if (clean.includes('english') || clean.includes('inggris')) return 'ENG';
    if (clean.includes('social') || clean.includes('civics') || clean.includes('ips')) return 'IPS';
    if (clean.includes('spiritual')) return 'SPH';
    if (clean.includes('islamic') || clean.includes('agama islam')) return 'ISL';
    if (clean.includes('quran')) return 'QUR';
    if (clean.includes('gardening') || clean.includes('gardens')) return 'HUG';
    if (clean.includes('kewirausahaan') || clean.includes('entrepreneur')) return 'KWU';
    if (clean.includes('performing') || clean.includes('music') || clean.includes('drama')) return 'PFA';
    if (clean.includes('art') || clean.includes('makerspace')) return 'AMS';
    if (clean.includes('physical') || clean.includes('pe ') || clean.includes('olahraga')) return 'PHE';
    if (clean.includes('digital') || clean.includes('computer') || clean.includes('ict')) return 'DGL';
    return subj.substring(0, 3).toUpperCase();
  }, []);

  // Compute completion metrics per student
  const getStudentLgStats = React.useCallback((studentId: string) => {
    const sData = studentDataMap ? studentDataMap[studentId] : null;
    const remarks = sData?.remarks || {};

    let filled = 0;
    let total = 0;

    for (const item of activeSubjectsAndGoals) {
      const isSpiritual = item.subject === 'Spiritual Health';
      for (const g of item.goals) {
        total++;
        const val = remarks[g.id] || (isSpiritual ? sData?.spiritualHealthRemark : '') || '';
        if (val && val.trim() !== '') {
          filled++;
        }
      }
    }

    return { filled, total };
  }, [studentDataMap, activeSubjectsAndGoals]);

  // Formatting stored grade nicely
  const getGradeDisplay = React.useCallback((grade: string) => {
    if (!grade) return { text: '–', className: 'text-slate-300 font-medium' };
    const clean = grade.trim().toLowerCase();
    if (clean === 'a' || clean === 'sangat baik') {
      return { text: clean === 'a' ? 'A' : 'SB', className: 'text-emerald-600 font-black' };
    }
    if (clean === 'd' || clean === 'baik') {
      return { text: clean === 'd' ? 'D' : 'B', className: 'text-amber-500 font-black' };
    }
    if (clean === 'b' || clean === 'cukup') {
      return { text: clean === 'b' ? 'B' : 'C', className: 'text-rose-500 font-black' };
    }
    // Fallback display
    return { text: grade.substring(0, 2).toUpperCase(), className: 'text-slate-700 font-bold' };
  }, []);

  const handleCopyLink = (rep: PublishedMidtermReport) => {
    const url = rep.driveFileUrl || window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedId(rep.id);
    toast.success('Link PDF berhasil disalin.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = (ts: number | null | undefined) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Siswa */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Siswa
          </span>
          <div className="text-2xl font-black text-slate-900">{totalStudents}</div>
          <p className="text-[11px] text-slate-400">Terdaftar di kelas ini</p>
        </div>

        {/* Sudah Terbit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
            Rapor Terbit
          </span>
          <div className="text-2xl font-black text-emerald-700">
            {publishedStudentsCount} <span className="text-xs font-bold text-slate-400">/ {totalStudents}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {totalStudents > 0 ? Math.round((publishedStudentsCount / totalStudents) * 100) : 0}% telah dipublikasikan
          </p>
        </div>

        {/* Dibuka Orang Tua */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
            Dibuka Orang Tua
          </span>
          <div className="text-2xl font-black text-blue-700">
            {openedStudentsCount} <span className="text-xs font-bold text-slate-400">({openRatePercent}%)</span>
          </div>
          <p className="text-[11px] text-slate-400">Berdasarkan akun Parent resmi</p>
        </div>

        {/* Belum Dibuka */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
            Belum Dibuka
          </span>
          <div className="text-2xl font-black text-amber-700">
            {Math.max(0, publishedStudentsCount - openedStudentsCount)}
          </div>
          <p className="text-[11px] text-slate-400">Perlu follow-up wali murid</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Class selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Kelas:</span>
            <select
              value={selectedClassId}
              onChange={(e) => onSelectClassId(e.target.value)}
              className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {safeClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Filter Status Publikasi */}
          <select
            value={filterPublishStatus}
            onChange={(e) => setFilterPublishStatus(e.target.value as any)}
            className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="ALL">Semua Publikasi</option>
            <option value="PUBLISHED">Sudah Terbit</option>
            <option value="UNPUBLISHED">Belum Terbit</option>
          </select>

          {/* Filter Status Dibuka */}
          <select
            value={filterOpenStatus}
            onChange={(e) => setFilterOpenStatus(e.target.value as any)}
            className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="ALL">Semua Tracking</option>
            <option value="OPENED">Sudah Dibuka Orang Tua</option>
            <option value="UNOPENED">Belum Dibuka Orang Tua</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari siswa atau NISN..."
            className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 w-52"
          />
        </div>
      </div>

      {/* Optional Mode Control & Metadata Info Row */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Unboxed Metadata Info */}
        <div className="text-xs text-slate-500 font-medium">
          Menampilkan {filteredRows.length} siswa · {totalActiveGoalsCount} Learning Goals · {activeSubjectsAndGoals.length} mata pelajaran
        </div>

        {/* Mode Toggle Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {showDetailGoals && (
            <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span>Geser untuk melihat detail LG</span>
              <ArrowRight size={11} className="animate-pulse text-emerald-500" />
            </div>
          )}

          {/* View Toggle */}
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDetailGoals}
              onChange={(e) => handleToggleDetailGoals(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="text-xs font-bold text-slate-700">Tampilkan Detail Learning Goals</span>
          </label>

          {/* Subject Filter when Detail mode is active */}
          {showDetailGoals && (
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Mapel:</span>
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="text-xs font-bold px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 max-w-[140px]"
              >
                <option value="ALL">Semua Mapel</option>
                {activeSubjectsAndGoals.map(sg => (
                  <option key={sg.subject} value={sg.subject}>{getSubjectCode(sg.subject)} - {sg.subject}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Legenda status/nilai */}
      {showDetailGoals && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1 uppercase text-[10px] tracking-wider text-slate-400 font-black">
            <Info size={12} className="text-slate-400" />
            <span>Legenda Nilai:</span>
          </div>
          <span className="flex items-center gap-1"><strong className="text-emerald-600">A / SB</strong> Achieved / Sangat Baik</span>
          <span className="flex items-center gap-1"><strong className="text-amber-500">D / B</strong> Developing / Baik</span>
          <span className="flex items-center gap-1"><strong className="text-rose-500">B / C</strong> Beginning / Cukup</span>
          <span className="text-slate-300 font-normal">| Hover/klik kode LG di baris atas untuk teks lengkap. Hover sel untuk detail siswa.</span>
        </div>
      )}

      {/* Rekap Table with Horizontal scroll containment */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden max-w-full">
        <div className="overflow-x-auto overflow-y-auto max-w-full custom-scrollbar">
          <table className="w-full text-left border-collapse table-fixed" style={{ minWidth: showDetailGoals ? '1200px' : '950px' }}>
            {/* Double header levels */}
            {showDetailGoals ? (
              <thead>
                {/* Level 1: Subject groupings */}
                <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="p-3 w-12 text-center sticky left-0 top-0 z-40 bg-slate-100 border-r border-slate-200" rowSpan={2}>No</th>
                  <th className="p-3 w-48 sticky left-12 top-0 z-40 bg-slate-100 border-r border-slate-200" rowSpan={2}>Nama Siswa</th>
                  <th className="p-3 w-28 sticky left-[240px] top-0 z-40 bg-slate-100 border-r border-slate-200" rowSpan={2}>NISN</th>
                  <th className="p-3 w-28 text-center sticky top-0 z-30 bg-slate-100 border-r border-slate-200" rowSpan={2}>LG Ringkasan</th>

                  {filteredSubjectsAndGoals.map((sg) => (
                    <th 
                      key={sg.subject} 
                      colSpan={sg.goals.length} 
                      className="p-2 text-center border-r border-slate-200 bg-slate-50/90 border-b border-slate-200 text-[10px] font-black truncate sticky top-0 z-30"
                      title={sg.subject}
                    >
                      {sg.subject}
                    </th>
                  ))}

                  <th className="p-3 w-40 text-center sticky top-0 z-30 bg-slate-100 border-r border-slate-200" rowSpan={2}>General Comments</th>
                  <th className="p-3 w-28 text-center sticky top-0 z-30 bg-slate-100 border-r border-slate-200" rowSpan={2}>Status Rapor</th>
                  <th className="p-3 w-28 text-right sticky top-0 z-30 bg-slate-100" rowSpan={2}>Aksi</th>
                </tr>

                {/* Level 2: Goal keys (MTK-1, IPA-1, etc.) */}
                <tr className="bg-slate-50 text-slate-500 text-[9px] font-extrabold uppercase border-b border-slate-200">
                  {filteredSubjectsAndGoals.flatMap((sg) => 
                    sg.goals.map((goal, goalIdx) => {
                      const subjectCode = getSubjectCode(sg.subject);
                      const codeLabel = `${subjectCode}-${goalIdx + 1}`;
                      return (
                        <th
                          key={goal.id}
                          tabIndex={0}
                          className="p-1.5 border-r border-slate-200 text-center relative cursor-help select-none w-16"
                          onMouseEnter={() => setActiveTooltipId(goal.id)}
                          onMouseLeave={() => setActiveTooltipId(null)}
                          onFocus={() => setActiveTooltipId(goal.id)}
                          onBlur={() => setActiveTooltipId(null)}
                          onClick={() => setActiveTooltipId(prev => prev === goal.id ? null : goal.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setActiveTooltipId(prev => prev === goal.id ? null : goal.id);
                            }
                          }}
                        >
                          <span className="underline decoration-dotted decoration-slate-400">{codeLabel}</span>
                          {activeTooltipId === goal.id && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-3 bg-slate-950 text-white rounded-xl shadow-xl border border-slate-800 z-50 text-left normal-case tracking-normal font-sans font-normal pointer-events-auto">
                              <div className="text-emerald-400 font-bold text-[9px] uppercase tracking-wider mb-0.5">
                                {codeLabel} · {sg.subject}
                              </div>
                              <div className="text-[10.5px] text-slate-200 leading-relaxed font-semibold">
                                {goal.text}
                              </div>
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 mt-[-4px] w-2.5 h-2.5 bg-slate-950 border-t border-l border-slate-800 rotate-45"></div>
                            </div>
                          )}
                        </th>
                      );
                    })
                  )}
                </tr>
              </thead>
            ) : (
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="p-3 w-12 text-center">No</th>
                  <th className="p-3 w-56">Nama Siswa</th>
                  <th className="p-3 w-32">NISN</th>
                  <th className="p-3 w-36 text-center">Learning Goals</th>
                  <th className="p-3 w-44">General Comments</th>
                  <th className="p-3 w-32 text-center">Status Rapor</th>
                  <th className="p-3 w-32 text-right">Aksi</th>
                </tr>
              </thead>
            )}

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={showDetailGoals ? 100 : 7} className="p-8 text-center text-slate-400 font-medium">
                    Tidak ada data rekap yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((student, idx) => {
                  const rep = publishedMap[student.id];
                  const isPublished = Boolean(rep);
                  const sData = studentDataMap[student.id];
                  const stats = getStudentLgStats(student.id);

                  // Extract comment completeness
                  const commentText = sData?.generalComment?.finalComment || sData?.generalComment?.aiDraft || sData?.generalComment?.manualNotes || '';
                  const isCommentFilled = commentText.trim().length > 0;
                  const commentStatus = sData?.generalComment?.finalComment 
                    ? 'Terisi (Final)' 
                    : isCommentFilled 
                    ? 'Terisi (Draft)' 
                    : 'Belum';

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* No */}
                      {showDetailGoals ? (
                        <td className="p-3 text-center font-bold text-slate-400 sticky left-0 z-20 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200 w-12">
                          {idx + 1}
                        </td>
                      ) : (
                        <td className="p-3 text-center font-bold text-slate-400 w-12">{idx + 1}</td>
                      )}

                      {/* Nama Siswa */}
                      {showDetailGoals ? (
                        <td className="p-3 font-bold text-slate-900 uppercase sticky left-12 z-20 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200 w-48 truncate" title={student.name}>
                          {student.name}
                        </td>
                      ) : (
                        <td className="p-3 font-bold text-slate-900 uppercase w-56 truncate" title={student.name}>
                          {student.name}
                        </td>
                      )}

                      {/* NISN */}
                      {showDetailGoals ? (
                        <td className="p-3 font-medium text-slate-500 sticky left-[240px] z-20 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200 w-28">
                          {student.nisn || (student as any).nis || '-'}
                        </td>
                      ) : (
                        <td className="p-3 font-medium text-slate-500 w-32">
                          {student.nisn || (student as any).nis || '-'}
                        </td>
                      )}

                      {/* Learning Goals Column */}
                      {showDetailGoals ? (
                        <td className="p-3 text-center font-bold text-slate-700 border-r border-slate-200 w-28">
                          {stats.filled} / {stats.total}
                        </td>
                      ) : (
                        <td className="p-3 text-center font-bold text-slate-700 w-36">
                          {stats.filled} / {stats.total} Terisi
                        </td>
                      )}

                      {/* Subject LG Columns (Detail mode only) */}
                      {showDetailGoals && filteredSubjectsAndGoals.flatMap((sg) =>
                        sg.goals.map((goal, goalIdx) => {
                          const remarks = sData?.remarks || {};
                          const isSpiritual = sg.subject === 'Spiritual Health';
                          const grade = remarks[goal.id] || (isSpiritual ? sData?.spiritualHealthRemark : '') || '';
                          const display = getGradeDisplay(grade);
                          const codeLabel = `${getSubjectCode(sg.subject)}-${goalIdx + 1}`;

                          return (
                            <td 
                              key={goal.id} 
                              className="p-1.5 text-center border-r border-slate-200 align-middle relative group/cell hover:bg-slate-100 transition-colors w-16"
                            >
                              <span className={display.className}>{display.text}</span>

                              {/* CSS Only High Performance Tooltip */}
                              <div className="hidden group-hover/cell:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-60 p-3 bg-slate-950 text-white rounded-xl shadow-xl border border-slate-800 z-50 text-left pointer-events-none font-normal tracking-normal">
                                <div className="text-emerald-400 font-bold text-[9px] uppercase tracking-wider mb-0.5">
                                  {student.name}
                                </div>
                                <div className="text-[10px] text-slate-400 uppercase font-black mb-1">
                                  {sg.subject} · {codeLabel}
                                </div>
                                <p className="text-[10.5px] text-slate-200 leading-relaxed font-semibold mb-1.5 whitespace-normal">
                                  {goal.text}
                                </p>
                                <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                                  <span className="text-slate-400 font-bold">Status/Nilai:</span>
                                  <span className="font-extrabold text-white uppercase">{grade || 'Belum diisi'}</span>
                                </div>
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 mb-[-4px] w-2.5 h-2.5 bg-slate-950 border-b border-r border-slate-800 rotate-45"></div>
                              </div>
                            </td>
                          );
                        })
                      )}

                      {/* General Comments */}
                      <td className={`p-3 text-slate-700 ${showDetailGoals ? 'border-r border-slate-200 w-40' : 'w-44'}`}>
                        <span className={`font-semibold ${
                          commentStatus.includes('Final') 
                            ? 'text-emerald-600' 
                            : commentStatus.includes('Draft') 
                            ? 'text-amber-500' 
                            : 'text-slate-400 font-normal'
                        }`}>
                          {commentStatus}
                        </span>
                      </td>

                      {/* Status Rapor */}
                      <td className={`p-3 text-center ${showDetailGoals ? 'border-r border-slate-200 w-28' : 'w-32'}`}>
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                            Terbit
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-500">
                            Belum
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className={`p-3 text-right space-x-1.5 ${showDetailGoals ? 'w-28' : 'w-32'}`}>
                        {rep ? (
                          <>
                            <button
                              onClick={() => {
                                if (rep.reportSnapshot) {
                                  setPreviewSnapshot(rep.reportSnapshot);
                                  setPreviewTitle(`${student.name} (v${rep.version})`);
                                } else {
                                  toast.info('Snapshot dokumen tidak tersedia.');
                                }
                              }}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors inline-block cursor-pointer"
                              title="Lihat Dokumen Snapshot"
                            >
                              <Eye size={14} />
                            </button>

                            <button
                              onClick={() => handleCopyLink(rep)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors inline-block cursor-pointer"
                              title="Salin Link Dokumen"
                            >
                              {copiedId === rep.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            </button>

                            {rep.driveFileUrl && rep.driveFileUrl !== '#' && (
                              <a
                                href={rep.driveFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors inline-block cursor-pointer"
                                title="Buka di Google Drive"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300 text-[11px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL SNAPSHOT PREVIEW */}
      {previewSnapshot && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-700">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <FileText className="text-emerald-400" size={20} />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Arsip Snapshot Rapor Terbit: {previewTitle}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Dokumen ini bersifat immutable dan tidak terpengaruh oleh perubahan data terbaru.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPreviewSnapshot(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-800 flex justify-center">
              <MidtermPdfTemplate snapshot={previewSnapshot} />
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-800 flex items-center justify-end bg-slate-900 text-white rounded-b-3xl">
              <button
                onClick={() => setPreviewSnapshot(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
