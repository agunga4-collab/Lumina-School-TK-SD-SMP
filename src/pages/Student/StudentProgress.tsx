import * as React from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import {
  BookOpen, Layers, TrendingUp, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, ArrowUpRight, Clock, ChevronLeft, ChevronRight,
  Calendar, History, X, Lock, MessageSquare
} from 'lucide-react';
import type {
  StudentProgressPayload, StudentDailyEntryItem, StudentDailySection,
  StudentProgressResult
} from '../../types/studentLearningProgress';

const control = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50';
const button = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

interface ApiFailure extends Error {
  code?: string;
  status?: number;
}

function getTodayWIB(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatFullDateWIB(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'Tanggal belum dipilih';
  const parts = dateStr.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function addDaysWIB(dateStr: string, deltaDays: number): string {
  const parts = dateStr.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + deltaDays, 12, 0, 0);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultStatus(item: StudentDailyEntryItem): { title: string; subtitle: string; badgeClass: string; cardClass: string; icon: React.ReactNode } {
  if (item.type === 'SHARED_TASK' || !item.score) {
    return {
      title: 'Belum dinilai',
      subtitle: 'Kegiatan sudah dijadwalkan / ditugaskan, belum ada nilai asesmen.',
      badgeClass: 'border-slate-300 bg-slate-100 text-slate-700',
      cardClass: 'border-slate-200 bg-white',
      icon: <Clock size={13} className="shrink-0 text-slate-500" />
    };
  }
  if (item.score === 'Achieved') {
    return {
      title: 'Achieved',
      subtitle: 'Tujuan belajar sudah tercapai.',
      badgeClass: 'border-emerald-300 bg-emerald-100 text-emerald-900',
      cardClass: 'border-emerald-200 bg-emerald-50/20',
      icon: <CheckCircle2 size={13} className="shrink-0 text-emerald-700" />
    };
  }
  if (item.score === 'Not Achieved') {
    return {
      title: 'Not Achieved',
      subtitle: 'Masih perlu latihan dan penguatan.',
      badgeClass: 'border-amber-300 bg-amber-100 text-amber-950',
      cardClass: 'border-amber-200 bg-amber-50/20',
      icon: <ArrowUpRight size={13} className="shrink-0 text-amber-800" />
    };
  }
  if (['A', 'D', 'B'].includes(item.score)) {
    return {
      title: `${item.score} · Skala lama`,
      subtitle: 'Hasil lama ditampilkan tanpa konversi.',
      badgeClass: 'border-slate-300 bg-slate-100 text-slate-800',
      cardClass: 'border-slate-200 bg-white',
      icon: <Clock size={13} className="shrink-0 text-slate-600" />
    };
  }
  if (item.type === 'SUMMATIVE') {
    return {
      title: `Sumatif: ${item.score}`,
      subtitle: 'Asesmen sumatif akhir periode/lingkup materi.',
      badgeClass: 'border-indigo-300 bg-indigo-100 text-indigo-950',
      cardClass: 'border-indigo-200 bg-indigo-50/20',
      icon: <CheckCircle2 size={13} className="shrink-0 text-indigo-700" />
    };
  }
  return {
    title: item.score,
    subtitle: 'Hasil penilaian dari guru.',
    badgeClass: 'border-slate-300 bg-slate-100 text-slate-800',
    cardClass: 'border-slate-200 bg-white',
    icon: <Clock size={13} className="shrink-0 text-slate-600" />
  };
}

async function requestProgress(user: User, params: Record<string, string>, signal: AbortSignal): Promise<StudentProgressPayload> {
  const query = new URLSearchParams(params).toString();
  const url = `/api/student-learning-progress${query ? `?${query}` : ''}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (auth.currentUser?.uid !== user.uid) throw new Error('Akun login berubah. Muat ulang halaman.');
    const token = await user.getIdToken(attempt === 1);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal
    });
    if (response.status === 401 && attempt === 0) continue;
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Endpoint Learning Progress belum tersedia pada server ini. Hubungi administrator.');
    }
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(typeof body.error === 'string' ? body.error : 'Learning Progress belum dapat dimuat.') as ApiFailure;
      error.code = body.code;
      error.status = response.status;
      throw error;
    }
    if (body.version !== 1 || !body.student || !Array.isArray(body.dailySections)) {
      throw new Error('Format data Learning Progress belum sesuai. Hubungi administrator.');
    }
    if (auth.currentUser?.uid !== user.uid) throw new Error('Akun login berubah. Muat ulang halaman.');
    return body as StudentProgressPayload;
  }
  throw new Error('Sesi login perlu diperbarui. Silakan masuk kembali.');
}

function ReadOnlyDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
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
      className="m-auto max-h-[90vh] w-[92vw] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 p-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Hasil asesmen guru · Hanya lihat</p>
          </div>
          <button type="button" autoFocus aria-label="Tutup rincian" className={button} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">{children}</div>
        <footer className="flex shrink-0 justify-end border-t border-slate-100 p-3">
          <button type="button" className={button} onClick={onClose}>
            Tutup
          </button>
        </footer>
      </div>
    </dialog>
  );
}

function HistoryDetails({ result, isCurrent }: { result: StudentProgressResult; isCurrent: boolean }) {
  const isAch = result.score === 'Achieved';
  const isNach = result.score === 'Not Achieved';
  return (
    <article className={`space-y-2.5 rounded-xl border p-3.5 ${isCurrent ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
          isAch ? 'border-emerald-300 bg-emerald-100 text-emerald-900' :
          isNach ? 'border-amber-300 bg-amber-100 text-amber-950' :
          'border-slate-300 bg-slate-100 text-slate-800'
        }`}>
          {isAch ? <CheckCircle2 size={12} /> : isNach ? <ArrowUpRight size={12} /> : <Clock size={12} />}
          {result.score || 'Belum dinilai'}
        </span>
        <span className="text-xs font-semibold text-slate-500">{formatFullDateWIB(result.date)}</span>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400">Kegiatan:</p>
        <p className="mt-0.5 text-sm text-slate-800">{result.task || '—'}</p>
      </div>
      {result.nextAction && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
          <p className="flex items-center gap-1 text-xs font-bold text-amber-900">
            <ArrowUpRight size={12} /> Tindak Lanjut Guru
          </p>
          <p className="mt-0.5 text-xs text-slate-800">{result.nextAction}</p>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Dicatat oleh {result.teacherName || 'Guru'}{result.correctedAt ? ' · Pernah dikoreksi' : ''}
      </p>
    </article>
  );
}

export default function StudentProgress() {
  const { activeYear, activeSemester, isLoading: periodLoading } = useAcademicYear();
  const [user, setUser] = React.useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = React.useState(false);
  const [chosenYear, setChosenYear] = React.useState('');
  const [chosenSemester, setChosenSemester] = React.useState('');
  const [selectedDate, setSelectedDate] = React.useState('');
  const [payload, setPayload] = React.useState<StudentProgressPayload | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refresh, setRefresh] = React.useState(0);
  const [detailItem, setDetailItem] = React.useState<StudentDailyEntryItem | null>(null);

  const year = chosenYear || activeYear;
  const semester = chosenSemester || String(activeSemester);

  React.useEffect(() => onAuthStateChanged(auth, value => {
    setUser(value);
    setAuthReady(true);
  }), []);

  // Reset date and payload when account changes
  React.useEffect(() => {
    setPayload(null);
    setError(null);
    setDetailItem(null);
    setChosenYear('');
    setChosenSemester('');
    setSelectedDate('');
  }, [user?.uid]);

  // Fetch student progress automatically
  React.useEffect(() => {
    const controller = new AbortController();
    setError(null);

    if (!authReady || !user || periodLoading || !year || !['1', '2'].includes(semester)) {
      setBusy(false);
      return () => controller.abort();
    }

    const currentUser = user;
    setBusy(true);

    const params: Record<string, string> = { year, semester };
    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      params.date = selectedDate;
    }

    requestProgress(currentUser, params, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setPayload(data);
        // Sync selectedDate with resolved date from server if currently empty
        if (!selectedDate || selectedDate !== data.selectedDate) {
          setSelectedDate(data.selectedDate);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(errorText(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
        }
      });

    return () => controller.abort();
  }, [authReady, user?.uid, periodLoading, year, semester, selectedDate, refresh]);

  const years = [...new Set([...(payload?.availableYears || []), year].filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const availableDates = payload?.availableDates || [];
  const latestDate = payload?.latestDateWithRecords;
  const todayWIB = getTodayWIB();
  const currentDate = selectedDate || payload?.selectedDate || todayWIB;
  const sections = payload?.dailySections || [];
  const totalItems = sections.reduce((acc, s) => acc + s.items.length, 0);

  // Navigate to previous date
  const handlePrevDate = () => {
    if (availableDates.length > 0) {
      const priorDates = availableDates.filter(d => d < currentDate);
      if (priorDates.length > 0) {
        setSelectedDate(priorDates[priorDates.length - 1]);
        return;
      }
    }
    setSelectedDate(addDaysWIB(currentDate, -1));
  };

  // Navigate to next date
  const handleNextDate = () => {
    if (availableDates.length > 0) {
      const futureDates = availableDates.filter(d => d > currentDate);
      if (futureDates.length > 0) {
        setSelectedDate(futureDates[0]);
        return;
      }
    }
    setSelectedDate(addDaysWIB(currentDate, 1));
  };

  // Navigate to today
  const handleToday = () => {
    setSelectedDate(todayWIB);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-16 sm:p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
            <TrendingUp size={14} /> Learning Progress Junior High
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Perjalanan Belajarku</h1>
          {payload ? (
            <p className="mt-1.5 text-sm font-semibold text-slate-700">
              {payload.student.name} · {payload.student.className}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-400">
              {busy ? 'Memuat profil siswa…' : 'Hasil belajar harian dari asesmen guru'}
            </p>
          )}
          <p className="mt-1 max-w-xl text-xs text-slate-500">
            Catatan belajar dan tindak lanjut kegiatan harianmu langsung ditampilkan secara otomatis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
            <Lock size={12} /> Hanya lihat
          </span>
          <button
            type="button"
            className={button}
            disabled={busy || !user}
            onClick={() => {
              setDetailItem(null);
              setRefresh(v => v + 1);
            }}
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </header>

      {/* Unauthenticated alert */}
      {authReady && !user && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Silakan masuk dengan akun siswa untuk melihat perkembangan belajarmu.
        </div>
      )}

      {/* Controls & Filter Section */}
      <section aria-label="Filter periode dan tanggal kegiatan" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">Tahun Ajaran</span>
            <select
              className={control}
              value={year}
              disabled={!user || busy || periodLoading}
              onChange={e => {
                setChosenYear(e.target.value);
                setSelectedDate('');
              }}
            >
              {years.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">Semester</span>
            <select
              className={control}
              value={semester}
              disabled={!user || busy || periodLoading}
              onChange={e => {
                setChosenSemester(e.target.value);
                setSelectedDate('');
              }}
            >
              <option value="1">Semester 1 (Ganjil)</option>
              <option value="2">Semester 2 (Genap)</option>
            </select>
          </label>
        </div>

        {/* Date Navigator */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Tanggal Kegiatan (WIB)
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">
                  {formatFullDateWIB(currentDate)}
                </h2>
                {latestDate && currentDate === latestDate && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                    Kegiatan Terbaru
                  </span>
                )}
                {currentDate === todayWIB && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    Hari Ini
                  </span>
                )}
              </div>
            </div>

            {/* Quick Date Actions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={handlePrevDate}
                title="Tanggal Sebelumnya"
              >
                <ChevronLeft size={16} />
                <span className="text-xs">Sebelumnya</span>
              </button>
              <label className="relative inline-flex items-center">
                <input
                  type="date"
                  aria-label="Pilih tanggal kegiatan"
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 outline-none hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  value={currentDate}
                  disabled={busy}
                  onChange={e => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                />
              </label>
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={handleNextDate}
                title="Tanggal Berikutnya"
              >
                <span className="text-xs">Berikutnya</span>
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                className={`${button} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
                disabled={busy || currentDate === todayWIB}
                onClick={handleToday}
                title="Pindah ke Hari Ini"
              >
                <Calendar size={14} />
                <span className="text-xs">Hari Ini</span>
              </button>
            </div>
          </div>

          {/* Quick jump to available activity dates in this period */}
          {availableDates.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2">
              <span className="text-[11px] font-semibold text-slate-400">Tanggal yang ada catatan:</span>
              <div className="flex flex-wrap gap-1.5 overflow-x-auto py-1">
                {availableDates.slice(-7).reverse().map(d => {
                  const isCurrent = d === currentDate;
                  const isLatest = d === latestDate;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      disabled={busy}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      {formatDateShort(d)}
                      {isLatest && !isCurrent ? ' ★' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Warnings & Alerts */}
      {payload?.warnings && payload.warnings.length > 0 && (
        <div className="space-y-2">
          {payload.warnings.map((warning, idx) => (
            <p key={idx} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {warning}
            </p>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle size={18} className="shrink-0 text-rose-600 mt-0.5" />
          <div>
            <p className="font-bold">Learning Progress belum dapat dimuat.</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {busy && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500 shadow-xs">
          <Loader2 size={20} className="animate-spin text-blue-600" />
          <span>Memuat catatan kegiatan belajar…</span>
        </div>
      )}

      {/* Daily Feed Content */}
      {!busy && !error && payload && (
        <main aria-label="Catatan kegiatan belajar harian" className="space-y-5">
          {totalItems === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-xs">
              <Calendar size={36} className="mx-auto text-slate-300" />
              <h2 className="mt-3 text-base font-bold text-slate-800">Tidak ada catatan kegiatan belajar pada tanggal ini</h2>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                Guru belum mencatat asesmen atau tugas untuk tanggal {formatFullDateWIB(currentDate)}.
              </p>
              {latestDate && latestDate !== currentDate && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(latestDate)}
                    className={`${button} border-blue-600 bg-blue-600 text-white hover:bg-blue-700 shadow-xs`}
                  >
                    Buka kegiatan terbaru ({formatDateShort(latestDate)})
                  </button>
                </div>
              )}
            </section>
          ) : (
            sections.map(section => (
              <section
                key={section.key}
                aria-label={section.title}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
              >
                {/* Section Header */}
                <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 shrink-0">
                      {section.isUA ? <Layers size={15} /> : <BookOpen size={15} />}
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                      {section.title}
                    </h2>
                  </div>
                  <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {section.items.length} kegiatan
                  </span>
                </header>

                {/* Section Items List */}
                <div className="divide-y divide-slate-100 p-3 sm:p-4 space-y-3">
                  {section.items.map(item => {
                    const status = resultStatus(item);
                    return (
                      <article
                        key={item.id}
                        className={`rounded-xl border p-4 transition-all shadow-xs ${status.cardClass}`}
                      >
                        {/* Item Top Row */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.isUA && item.unitActivityName && (
                              <span className="rounded-lg bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-900">
                                {item.unitActivityName}
                              </span>
                            )}
                            <span className="text-xs font-bold text-blue-700">
                              {item.loCode || 'LO'}
                            </span>
                          </div>
                          {/* Result Badge directly visible */}
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold shadow-2xs ${status.badgeClass}`}>
                              {status.icon}
                              {status.title}
                            </span>
                          </div>
                        </div>

                        {/* Core Content: Task & Learning Objective */}
                        <div className="mt-3 space-y-2">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              Bentuk Kegiatan / Tugas:
                            </span>
                            <p className="mt-0.5 text-sm font-bold text-slate-900">
                              {item.task}
                            </p>
                          </div>

                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              Tujuan Belajar (LO):
                            </span>
                            <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">
                              {item.loTitle || item.lgText || '—'}
                            </p>
                          </div>
                        </div>

                        {/* Teacher Next Action (directly visible) */}
                        {item.nextAction && (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3">
                            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                              <ArrowUpRight size={14} className="shrink-0 text-amber-800" />
                              Tindak Lanjut Guru:
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-800 leading-relaxed">
                              {item.nextAction}
                            </p>
                          </div>
                        )}

                        {/* Footer: Teacher info & Optional History Button */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100/80 pt-2.5">
                          <p className="text-[11px] text-slate-400">
                            Dicatat oleh {item.teacherName || 'Guru'}
                            {item.correctedAt ? ' · Pernah dikoreksi' : ''}
                          </p>

                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
                            onClick={() => setDetailItem(item)}
                          >
                            <History size={13} />
                            <span>Riwayat & penjelasan lengkap</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}

          <footer className="mt-6 flex items-start gap-2 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-500">
            <MessageSquare size={14} className="shrink-0 text-slate-400 mt-0.5" />
            <span>
              Halaman ini menampilkan catatan kegiatan dan tindak lanjut belajar siswa. Catatan internal guru tidak dibagikan melalui portal ini.
            </span>
          </footer>
        </main>
      )}

      {/* Optional Detail & History Modal */}
      {detailItem && (
        <ReadOnlyDialog
          title={`${detailItem.isUA ? (detailItem.unitActivityName || detailItem.unitActivityCategory || 'UA') : detailItem.subjectLabel} · ${detailItem.loCode || 'LO'}`}
          onClose={() => setDetailItem(null)}
        >
          {/* Goal & LO Details */}
          <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            {detailItem.lgText && (
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Tujuan Belajar (LG){detailItem.lgCode ? ` · ${detailItem.lgCode}` : ''}
                </span>
                <p className="mt-1 text-sm font-semibold text-slate-800 leading-relaxed">
                  {detailItem.lgText}
                </p>
              </div>
            )}
            {detailItem.loTitle && (
              <div className="border-t border-blue-100/70 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Indikator Capaian ({detailItem.loCode || 'LO'})
                </span>
                <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                  {detailItem.loTitle}
                </p>
              </div>
            )}
          </div>

          {/* Current Activity on Date */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Catatan pada {formatFullDateWIB(detailItem.date)}
            </h3>
            <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${resultStatus(detailItem).badgeClass}`}>
                  {resultStatus(detailItem).icon}
                  {resultStatus(detailItem).title}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {detailItem.task}
              </p>
              {detailItem.nextAction && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-slate-800">
                  <span className="font-bold text-amber-900 block mb-0.5">Tindak Lanjut Guru:</span>
                  {detailItem.nextAction}
                </div>
              )}
              <p className="text-xs text-slate-400">
                Guru: {detailItem.teacherName || '—'}{detailItem.correctedAt ? ' · Ada riwayat koreksi' : ''}
              </p>
            </div>
          </div>

          {/* Full History Timeline for this LO */}
          {detailItem.history && detailItem.history.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                <History size={13} />
                Riwayat Penilaian LO ini ({detailItem.history.length} catatan)
              </h3>
              <div className="space-y-2.5">
                {detailItem.history.map(item => (
                  <HistoryDetails
                    key={item.id}
                    result={item}
                    isCurrent={item.id === detailItem.id}
                  />
                ))}
              </div>
            </div>
          )}
        </ReadOnlyDialog>
      )}
    </div>
  );
}
