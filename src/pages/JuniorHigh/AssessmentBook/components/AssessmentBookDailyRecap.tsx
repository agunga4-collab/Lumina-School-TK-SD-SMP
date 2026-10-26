import * as React from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, RefreshCw, Search,
  Download, AlertCircle, Loader2, X, Check, BookOpen, Layers,
  Clock, Info, User
} from 'lucide-react';
import { useAcademicYear } from '../../../../context/AcademicYearContext';
import type { Class as SchoolClass, Student } from '../../../../types';
import { isLegacyScore } from '../../../../types';
import { getClasses } from '../../../../lib/firebase';
import {
  getTodayWIB, formatDateWIB, formatFullDayDateWIB, shiftDateWIB,
  getJuniorHighDailyRecap, JHDailyRecapData, JHDailyRecapColumn, JHDailyRecapCellItem
} from '../../../../services/juniorHighAssessmentBookService';

interface Props {
  initialYear?: string;
  initialSemester?: string;
  initialClassId?: string;
}

const control = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 transition-colors hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50';
const button = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer active:scale-95';

function sumStyle(score: string): string {
  if (score === 'A') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (score === 'D') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (score === 'B') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function FormativeBadge({ level }: { level?: string }) {
  if (!level) return <span aria-label="Belum dinilai" className="text-slate-400">—</span>;
  const legacy = isLegacyScore(level);
  const text = level === 'Achieved' ? 'ACH' : level === 'Not Achieved' ? 'NACH' : legacy ? `${level} (Lama)` : String(level);
  const color = level === 'Achieved'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : level === 'Not Achieved'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <span
      aria-label={legacy ? `${level}, skala lama` : level}
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold border ${color}`}
    >
      {level === 'Achieved' ? <Check size={10} className="shrink-0" /> : level === 'Not Achieved' ? <X size={10} className="shrink-0" /> : null}
      {text}
    </span>
  );
}

function ReadOnlyDialog({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      previous?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[90vh] w-[92vw] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <div>
            <h2 className="font-bold text-slate-900 text-sm sm:text-base">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-600 font-medium">{subtitle}</p>}
            <p className="mt-1 text-[11px] text-slate-400">Hanya lihat · tidak mengubah penilaian</p>
          </div>
          <button type="button" autoFocus aria-label="Tutup detail" className={button} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
        <footer className="flex shrink-0 justify-end border-t border-slate-200 p-3 bg-slate-50/50">
          <button type="button" className={button} onClick={onClose}>
            Tutup
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default function AssessmentBookDailyRecap({
  initialYear,
  initialSemester = '1',
  initialClassId = ''
}: Props) {
  const { activeYear } = useAcademicYear();

  // Filters state
  const [year, setYear] = React.useState(initialYear || activeYear || '2026/2027');
  const [semester, setSemester] = React.useState(initialSemester);
  const [classId, setClassId] = React.useState(initialClassId);
  const [date, setDate] = React.useState(getTodayWIB);
  const [search, setSearch] = React.useState('');

  // Classes list
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const [classError, setClassError] = React.useState('');

  // Data state
  const [recapData, setRecapData] = React.useState<JHDailyRecapData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState('');
  const [reload, setReload] = React.useState(0);

  // Detail Modal State
  const [detailCell, setDetailCell] = React.useState<{
    student: any;
    column: JHDailyRecapColumn;
    items: JHDailyRecapCellItem[];
    isEnrolled: boolean;
  } | null>(null);

  const requestCounter = React.useRef(0);

  // Load Classes
  React.useEffect(() => {
    let cancelled = false;
    setLoadingClasses(true);
    setClassError('');
    getClasses()
      .then(items => {
        if (cancelled) return;
        const list = (items || []).filter(
          item => item.unitId === 'JUNIOR_HIGH' && item.academicYear === year && item.status !== 'archived'
        );
        setClasses(list);
        setClassId(previous => (list.some(item => item.id === previous) ? previous : list[0]?.id || ''));
      })
      .catch(err => {
        if (!cancelled) setClassError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingClasses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, reload]);

  // Load Daily Recap Data
  const currentScope = JSON.stringify([classId, year, semester, date]);
  React.useEffect(() => {
    let cancelled = false;
    const currentRequestId = ++requestCounter.current;

    setDataError('');
    if (!classId || !year || !semester || !date) {
      setRecapData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getJuniorHighDailyRecap({
      classId,
      academicYear: year,
      semester,
      date
    })
      .then(result => {
        if (cancelled || currentRequestId !== requestCounter.current) return;
        setRecapData(result);
      })
      .catch(err => {
        if (cancelled || currentRequestId !== requestCounter.current) return;
        setDataError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled && currentRequestId === requestCounter.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentScope, reload]);

  // Derived Values
  const selectedClass = classes.find(c => c.id === classId);
  const years = React.useMemo(() => {
    return [...new Set([initialYear, activeYear, year, ...classes.map(item => item.academicYear)].filter(Boolean))].sort(
      (a, b) => b!.localeCompare(a!)
    ) as string[];
  }, [classes, initialYear, activeYear, year]);

  const students = recapData?.students || [];
  const columns = recapData?.columns || [];
  const cellMap = recapData?.cellMap || {};
  const enrollmentSet = recapData?.enrollmentSet || {};

  const visibleStudents = React.useMemo(() => {
    if (!search.trim()) return students;
    const term = search.trim().toLowerCase();
    return students.filter(s =>
      `${s.name} ${s.nisn || ''} ${s.nis || ''} ${s.id}`.toLowerCase().includes(term)
    );
  }, [students, search]);

  // Date handlers
  const handlePrevDay = () => setDate(prev => shiftDateWIB(prev, -1));
  const handleNextDay = () => setDate(prev => shiftDateWIB(prev, 1));
  const handleToday = () => setDate(getTodayWIB());

  // Count active entries on this day
  const totalEntriesCount = React.useMemo(() => {
    let count = 0;
    for (const key of Object.keys(cellMap)) {
      count += (cellMap[key] || []).length;
    }
    return count;
  }, [cellMap]);

  // Export to Excel
  const handleExportExcel = async () => {
    if (!recapData || !students.length) return;
    try {
      const XLSX = await import('xlsx');
      const headerRows: any[][] = [
        ['REKAP HARIAN ASSESMEN — JUNIOR HIGH'],
        ['Kelas', selectedClass?.name || classId, 'Tahun Ajaran', year, 'Semester', semester],
        ['Tanggal Kegiatan', formatFullDayDateWIB(date), 'Acuan Tanggal', 'entry.date (WIB)'],
        [],
        [
          'No',
          'NIS/NISN',
          'Nama Siswa',
          ...columns.map(col => col.label)
        ]
      ];

      students.forEach((student, index) => {
        const studentRow: any[] = [
          index + 1,
          student.nisn || student.nis || student.id,
          student.name
        ];

        columns.forEach(col => {
          const key = `${student.id}|${col.key}`;
          const items = cellMap[key] || [];
          if (!items.length) {
            studentRow.push('—');
          } else {
            const cellText = items
              .map(item => {
                const prefix = col.isUA && item.unitActivityName ? `${item.unitActivityName} — ` : '';
                if (item.type === 'FORMATIVE') {
                  return `${prefix}${item.loCode || 'LO'}: ${item.comprehensionLevel}`;
                }
                if (item.type === 'SUMMATIVE') {
                  return `${prefix}Sumatif: ${item.summativeScore}`;
                }
                if (item.type === 'SHARED_TASK') {
                  return `${prefix}Tugas: ${item.taskTitle || item.loCode || 'Tugas'} (Belum dinilai)`;
                }
                return '—';
              })
              .join('\n');
            studentRow.push(cellText);
          }
        });

        headerRows.push(studentRow);
      });

      const sheet = XLSX.utils.aoa_to_sheet(headerRows);
      sheet['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 30 },
        ...columns.map(col => ({ wch: col.isUA ? 35 : 22 }))
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Rekap Harian');
      XLSX.writeFile(
        workbook,
        `Rekap_Harian_${(selectedClass?.name || classId).replace(/[^a-zA-Z0-9]/g, '_')}_${date}.xlsx`
      );
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Card */}
      <section aria-label="Filter Rekap Harian" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          {/* Kelas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Kelas</label>
            <select
              className={`${control} w-full`}
              value={classId}
              disabled={loadingClasses}
              onChange={e => setClassId(e.target.value)}
            >
              <option value="">Pilih kelas...</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tahun Ajaran */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tahun Ajaran</label>
            <select
              className={`${control} w-full`}
              value={year}
              disabled={loadingClasses}
              onChange={e => {
                setYear(e.target.value);
                setClassId('');
              }}
            >
              {years.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Semester */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Semester</label>
            <select
              className={`${control} w-full`}
              value={semester}
              onChange={e => setSemester(e.target.value)}
            >
              <option value="1">Semester 1 (Ganjil)</option>
              <option value="2">Semester 2 (Genap)</option>
            </select>
          </div>

          {/* Tanggal Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Tanggal Kegiatan</label>
            <input
              type="date"
              className={`${control} w-full`}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Date Navigation Strip */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 p-3 rounded-xl border">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevDay}
              className={button}
              title="Hari sebelumnya"
            >
              <ChevronLeft size={15} />
              <span>Sebelumnya</span>
            </button>
            <button
              type="button"
              onClick={handleToday}
              className={`${button} ${date === getTodayWIB() ? 'bg-purple-50 border-purple-300 text-purple-700 font-bold' : ''}`}
              title="Ke tanggal hari ini"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={handleNextDay}
              className={button}
              title="Hari berikutnya"
            >
              <span>Berikutnya</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-purple-700 shrink-0" />
            <span className="text-sm font-extrabold text-slate-900 tracking-tight">
              {formatFullDayDateWIB(date)}
            </span>
            <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              WIB
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => setReload(r => r + 1)}
              className={button}
              title="Muat ulang data"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Segarkan</span>
            </button>
            <button
              type="button"
              disabled={!students.length || loading}
              onClick={() => void handleExportExcel()}
              className={`${button} bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 font-bold`}
            >
              <Download size={13} />
              <span>Ekspor Excel</span>
            </button>
          </div>
        </div>
      </section>

      {/* Info Notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <p>
          Acuan tanggal: <strong className="text-slate-700">entry.date</strong> (kegiatan yang dilaksanakan pada hari tersebut, waktu input tidak menggeser hari).
        </p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> ACH = Achieved
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> NACH = Not Achieved
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Tugas (Belum dinilai)
          </span>
          <span className="text-slate-400">— = Tidak ada kegiatan</span>
        </div>
      </div>

      {/* Error state */}
      {(classError || dataError) && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle size={18} className="shrink-0 text-rose-600 mt-0.5" />
          <div>
            <p className="font-bold">Gagal memuat rekap harian</p>
            <p className="mt-1 text-xs whitespace-pre-wrap">{classError || dataError}</p>
            <button
              type="button"
              onClick={() => setReload(r => r + 1)}
              className="mt-2 text-xs font-bold underline hover:text-rose-950 cursor-pointer"
            >
              Coba muat ulang
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && !dataError && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-600">
          <Loader2 size={18} className="animate-spin text-purple-600" />
          <span>Memuat rekap kegiatan tanggal {formatFullDayDateWIB(date)}…</span>
        </div>
      )}

      {/* Unselected or Empty Class */}
      {!classId && !loading && !classError && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Pilih kelas untuk menampilkan rekap kegiatan harian.
        </div>
      )}

      {/* Main Table */}
      {recapData && !loading && (
        <div className="space-y-3">
          {/* Sub-toolbar: Search & Stats */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${control} w-full pl-9`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari siswa atau NIS..."
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                Menampilkan <strong className="text-slate-900">{visibleStudents.length}</strong> dari {students.length} siswa
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Total <strong className="text-purple-700">{totalEntriesCount}</strong> catatan kegiatan/asesmen pada tanggal ini
              </span>
            </div>
          </div>

          {/* Table Container */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabel Rekap Harian Semua Mata Pelajaran dan Unit Aktivitas"
            className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs min-w-[1200px]">
              <thead className="sticky top-0 z-20 bg-slate-50 shadow-xs">
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 min-w-[220px] border-b border-r border-slate-200 bg-slate-50 p-3 align-bottom font-bold text-slate-900"
                  >
                    <div>
                      <p className="font-extrabold text-slate-900 text-sm">Nama Siswa</p>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                        {selectedClass?.name} · {students.length} siswa aktif
                      </p>
                    </div>
                  </th>

                  {/* Regular Subjects Section */}
                  <th
                    colSpan={columns.filter(c => !c.isUA).length}
                    className="border-b border-r border-slate-200 bg-blue-50/80 p-2 text-center font-bold text-blue-900 uppercase tracking-wider text-[11px]"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <BookOpen size={14} className="text-blue-700" />
                      <span>Mata Pelajaran Wajib & Akademik</span>
                    </div>
                  </th>

                  {/* UA Activities Section */}
                  {columns.some(c => c.isUA) && (
                    <th
                      colSpan={columns.filter(c => c.isUA).length}
                      className="border-b border-r border-slate-200 bg-purple-50/80 p-2 text-center font-bold text-purple-900 uppercase tracking-wider text-[11px]"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Layers size={14} className="text-purple-700" />
                        <span>Unit Aktivitas (UA) Peserta Kelas</span>
                      </div>
                    </th>
                  )}
                </tr>

                {/* Sub-header with column titles */}
                <tr>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      title={col.label}
                      className={`border-b border-r border-slate-200 px-3 py-2.5 text-center font-bold text-xs ${
                        col.isUA
                          ? 'min-w-[190px] max-w-[260px] bg-purple-50/60 text-purple-950'
                          : 'min-w-[140px] max-w-[180px] bg-slate-50 text-slate-800'
                      }`}
                    >
                      <p className="truncate leading-tight font-extrabold">{col.label}</p>
                      {col.isUA && (
                        <span className="block text-[10px] font-normal text-purple-700 mt-0.5">
                          Kategori UA
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {visibleStudents.map((student, index) => (
                  <tr key={student.id} className="group hover:bg-slate-50/80 transition-colors">
                    {/* Sticky Student Column */}
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white p-3 font-normal group-hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="min-w-[22px] text-xs font-mono font-medium text-slate-400 pt-0.5">
                          {student.attendanceNumber ?? student.noAbsen ?? index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-xs truncate max-w-[170px]" title={student.name}>
                            {student.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {student.nisn || student.nis || student.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </th>

                    {/* Columns for this student */}
                    {columns.map(col => {
                      const cellKey = `${student.id}|${col.key}`;
                      const items = cellMap[cellKey] || [];
                      const isUACol = col.isUA;
                      const studentEnrolledCategories = enrollmentSet[student.id] || [];
                      const isEnrolled = !isUACol || studentEnrolledCategories.includes(col.category || '') || items.length > 0;
                      const hasItems = items.length > 0;

                      return (
                        <td
                          key={col.key}
                          className={`border-b border-r border-slate-100 p-1.5 align-middle text-center ${
                            isUACol ? 'bg-purple-50/10' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setDetailCell({
                                student,
                                column: col,
                                items,
                                isEnrolled
                              })
                            }
                            aria-label={`Rincian ${col.label} untuk ${student.name}`}
                            className="w-full min-h-[46px] rounded-lg p-1.5 transition-all hover:bg-slate-100/90 hover:shadow-xs flex flex-col items-center justify-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                          >
                            {!hasItems ? (
                              <span className="text-slate-300 font-bold" title={isEnrolled ? 'Tidak ada catatan asesmen pada tanggal ini' : 'Bukan peserta kategori ini'}>
                                —
                              </span>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1 w-full">
                                {items.map(item => {
                                  const uaPrefix = isUACol && item.unitActivityName ? `${item.unitActivityName} — ` : '';
                                  if (item.type === 'FORMATIVE') {
                                    return (
                                      <span
                                        key={item.id}
                                        title={`${uaPrefix}${item.loCode || 'LO'}: ${item.comprehensionLevel}${item.taskTitle ? ` (${item.taskTitle})` : ''}`}
                                        className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-bold border border-slate-200 shadow-2xs whitespace-nowrap max-w-full"
                                      >
                                        <span className="text-slate-800 font-bold truncate">
                                          {uaPrefix}{item.loCode || 'LO'}:
                                        </span>
                                        <FormativeBadge level={item.comprehensionLevel} />
                                      </span>
                                    );
                                  }
                                  if (item.type === 'SUMMATIVE') {
                                    return (
                                      <span
                                        key={item.id}
                                        title={`${uaPrefix}Sumatif: ${item.summativeScore}${item.taskTitle ? ` (${item.taskTitle})` : ''}`}
                                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${sumStyle(
                                          item.summativeScore || ''
                                        )} whitespace-nowrap max-w-full`}
                                      >
                                        <span className="truncate">{uaPrefix}Sum:</span>
                                        <span>{item.summativeScore}</span>
                                      </span>
                                    );
                                  }
                                  if (item.type === 'SHARED_TASK') {
                                    return (
                                      <span
                                        key={item.id}
                                        title={`${uaPrefix}Tugas bersama terjadwal: ${item.taskTitle} (Belum dinilai)`}
                                        className="inline-flex items-center gap-1 rounded bg-blue-50/90 text-blue-800 border border-dashed border-blue-300 px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap max-w-full"
                                      >
                                        <Clock size={10} className="text-blue-600 shrink-0" />
                                        <span className="truncate max-w-[140px]">
                                          {uaPrefix}{item.taskTitle || item.loCode || 'Tugas'} (Belum dinilai)
                                        </span>
                                      </span>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {!visibleStudents.length && (
                  <tr>
                    <td colSpan={columns.length + 1} className="p-8 text-center text-slate-500 text-xs">
                      Tidak ada siswa yang cocok dengan pencarian "{search}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ReadOnly Detail Dialog */}
      {detailCell && (
        <ReadOnlyDialog
          title={`Detail Asesmen Harian · ${detailCell.column.label}`}
          subtitle={`${detailCell.student.name} (${selectedClass?.name || classId}) · ${formatFullDayDateWIB(date)}`}
          onClose={() => setDetailCell(null)}
        >
          {/* Header Metadata */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">Siswa:</span>
              <span className="font-bold text-slate-900">{detailCell.student.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">NISN / NIS:</span>
              <span className="font-mono text-slate-700">{detailCell.student.nisn || detailCell.student.nis || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">Mata Pelajaran / Unit Aktivitas:</span>
              <span className="font-bold text-purple-800">{detailCell.column.label}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold">Tanggal Kegiatan (Acuan entry.date):</span>
              <span className="font-bold text-slate-900">{formatFullDayDateWIB(date)}</span>
            </div>
            {detailCell.column.isUA && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-500 font-semibold">Kepesertaan Kategori UA:</span>
                <span className={`font-bold ${detailCell.isEnrolled ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {detailCell.isEnrolled ? 'Terdaftar Aktif' : 'Bukan Peserta Kategori Ini'}
                </span>
              </div>
            )}
          </div>

          {/* List of items */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Catatan Asesmen & Kegiatan ({detailCell.items.length})
            </h4>

            {!detailCell.items.length && (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
                Tidak ada catatan asesmen atau kegiatan pada tanggal ini.
              </div>
            )}

            {detailCell.items.map(item => (
              <article key={item.id} className="p-4 rounded-xl border border-slate-200 space-y-3 bg-white shadow-2xs">
                {/* UA Activity Name Badge */}
                {detailCell.column.isUA && item.unitActivityName && (
                  <div className="flex items-center gap-2 pb-1">
                    <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 font-extrabold text-xs inline-flex items-center gap-1.5 shadow-2xs">
                      <Layers size={13} className="text-purple-700" />
                      Aktivitas: {item.unitActivityName}
                    </span>
                    {item.unitActivityCategory && (
                      <span className="text-[11px] font-semibold text-purple-700">
                        ({item.unitActivityCategory})
                      </span>
                    )}
                  </div>
                )}

                {/* Type & Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    {item.type === 'FORMATIVE' && (
                      <>
                        <span className="text-xs font-extrabold text-purple-800">{item.loCode || 'LO'}</span>
                        <FormativeBadge level={item.comprehensionLevel} />
                      </>
                    )}
                    {item.type === 'SUMMATIVE' && (
                      <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${sumStyle(item.summativeScore || '')}`}>
                        Nilai Sumatif: {item.summativeScore}
                      </span>
                    )}
                    {item.type === 'SHARED_TASK' && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-800 border border-dashed border-blue-300">
                        Tugas Bersama (Belum Dinilai)
                      </span>
                    )}
                  </div>

                  {item.correctedAt && (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                      Dikoreksi
                    </span>
                  )}
                </div>

                {/* LO Title */}
                {item.loTitle && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Indikator LO</span>
                    <p className="text-xs font-medium text-slate-800 leading-snug">{item.loTitle}</p>
                  </div>
                )}

                {/* Formative / Summative Task */}
                {item.taskTitle && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Bentuk Kegiatan / Tugas
                    </span>
                    <p className="text-xs font-semibold text-slate-900 leading-snug">{item.taskTitle}</p>
                  </div>
                )}

                {/* Next Action */}
                {item.nextAction && (
                  <div className="p-2.5 rounded-lg bg-purple-50/70 border border-purple-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">Next Action</span>
                    <p className="text-xs text-purple-950 font-medium whitespace-pre-wrap mt-0.5">{item.nextAction}</p>
                  </div>
                )}

                {/* Notes */}
                {item.notes && (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Catatan Guru</span>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap mt-0.5">{item.notes}</p>
                  </div>
                )}

                {/* Teacher & Metadata Footer */}
                <footer className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 font-medium">
                    <User size={12} className="text-slate-400" />
                    Guru: <strong className="text-slate-700">{item.teacherName || '—'}</strong>
                  </span>
                  <span>
                    Dicatat: {formatDateWIB(item.createdAt)}
                  </span>
                </footer>

                {/* Correction note */}
                {item.correctedAt && (
                  <div className="p-2 rounded bg-amber-50/60 border border-amber-200 text-[10px] text-amber-900 space-y-0.5">
                    <p>
                      <strong>Riwayat Koreksi:</strong> {formatDateWIB(item.correctedAt)}
                      {item.correctedByName ? ` oleh ${item.correctedByName}` : ''}
                    </p>
                    {item.correctionReason && <p className="italic">Alasan: "{item.correctionReason}"</p>}
                  </div>
                )}
              </article>
            ))}
          </div>
        </ReadOnlyDialog>
      )}
    </div>
  );
}

export { AssessmentBookDailyRecap };
