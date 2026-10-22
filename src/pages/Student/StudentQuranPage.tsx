import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  BookOpen,
  Edit3,
  History as HistoryIcon,
  Loader2,
  Sparkles,
  X,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { deleteQuranReadingLog } from '../../services/quranService';
import {
  getSurahByNumber,
  getSurahsInJuz,
  getAyahRangeForSurahInJuz,
} from '../../constants/quranReference';
import type { AyahRange } from '../../constants/quranReference';

const PARTICIPANTS = 'elementary_quran_participants';
const READING_LOGS = 'elementary_quran_reading_logs';

type Status =
  | 'loading'
  | 'active'
  | 'inactive'
  | 'unregistered'
  | 'error';

type ReadingForm = {
  readDate: string;
  juz: number;
  surahNumber: number;
  ayat: string;
  note: string;
};

type Participant = {
  studentUid: string;
  studentName: string;
  classId?: string;
  className?: string;
  unit: string;
  status: string;
};

type ReadingLog = {
  id: string;
  studentUid: string;
  studentName: string;
  classId: string;
  className: string;
  unit: string;
  readDate: string;
  juz: number;
  surahNumber: number;
  surahName: string;
  ayat: number;
  note: string;
  createdAt?: any;
  updatedAt?: any;
  editCount: number;
  source?: string;
};

type HistoryEntry = {
  id: string;
  readDate: string;
  juz: number;
  surahNumber: number;
  surahName: string;
  ayat: number;
  note: string;
  changedAt?: any;
  changedByUid?: string;
};

const INPUT_CLASS =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';

const APPRECIATION_MESSAGES = [
  'Alhamdulillah! Bacaanmu sudah tercatat.',
  'Masya Allah! Terima kasih sudah meluangkan waktu membaca.',
  'Semangat terus belajar membaca Al-Qur’an, ya!',
  'Sedikit demi sedikit, terus jaga kebiasaan baikmu.',
  'Alhamdulillah! Catatan bacaanmu bertambah.',
  'Semoga Allah memudahkan langkah belajarmu.',
  'Hebat! Teruslah membaca dengan tenang dan teliti.',
  'Masya Allah! Pertahankan semangat belajarmu.',
  'Semoga bacaan hari ini membawa kebaikan.',
  'Yuk, terus dekat dengan Al-Qur’an setiap hari.',
  'Terima kasih sudah berusaha hari ini.',
  'Alhamdulillah! Sampai bertemu pada catatan berikutnya.',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getWibDateString(date = new Date()): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function timestampMillis(value: any): number {
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  return typeof value === 'number' ? value : 0;
}

function formatTimestamp(value: any): string {
  const millis = timestampMillis(value);
  if (!millis) return 'Menunggu waktu server';

  return new Date(millis).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function safeRange(
  juz: number,
  surahNumber: number
): AyahRange | null {
  if (
    !Number.isInteger(juz) ||
    juz < 1 ||
    juz > 30 ||
    !Number.isInteger(surahNumber) ||
    surahNumber < 1 ||
    surahNumber > 114
  ) {
    return null;
  }

  return getAyahRangeForSurahInJuz(juz, surahNumber);
}

function initialForm(): ReadingForm {
  return {
    readDate: getWibDateString(),
    juz: 1,
    surahNumber: 0,
    ayat: '',
    note: '',
  };
}

function isValidForm(form: ReadingForm): boolean {
  const range = safeRange(form.juz, form.surahNumber);
  if (!range) return false;

  const ayat = Number(form.ayat);

  return (
    form.ayat.trim() !== '' &&
    Number.isInteger(ayat) &&
    ayat >= range.startAyah &&
    ayat <= range.endAyah &&
    validDate(form.readDate) &&
    form.readDate <= getWibDateString() &&
    form.note.length <= 200
  );
}

function logToForm(log: ReadingLog): ReadingForm {
  return {
    readDate: log.readDate,
    juz: Number(log.juz),
    surahNumber: Number(log.surahNumber),
    ayat: String(log.ayat),
    note: log.note || '',
  };
}

function ReadingFields({
  value,
  onChange,
  disabled,
}: {
  value: ReadingForm;
  onChange: (next: ReadingForm) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState('');

  // Helper mengembalikan Surah[]: number, name, totalVerses.
  const surahs = useMemo(
    () => getSurahsInJuz(value.juz),
    [value.juz]
  );

  const range = safeRange(value.juz, value.surahNumber);

  const visibleSurahs = surahs.filter(
    surah =>
      surah.number === value.surahNumber ||
      surah.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  function changeJuz(nextJuz: number) {
    setSearch('');
    onChange({
      ...value,
      juz: nextJuz,
      surahNumber: 0,
      ayat: '',
    });
  }

  function changeSurah(nextSurah: number) {
    const nextRange = safeRange(value.juz, nextSurah);
    const currentAyat = Number(value.ayat);

    const keepAyat =
      nextRange !== null &&
      value.ayat.trim() !== '' &&
      Number.isInteger(currentAyat) &&
      currentAyat >= nextRange.startAyah &&
      currentAyat <= nextRange.endAyah;

    onChange({
      ...value,
      surahNumber: nextSurah,
      ayat: keepAyat ? value.ayat : '',
    });
  }

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <label className="block space-y-1.5 text-sm font-semibold">
        <span>Tanggal bacaan</span>
        <input
          type="date"
          value={value.readDate}
          max={getWibDateString()}
          onChange={event =>
            onChange({ ...value, readDate: event.target.value })
          }
          className={INPUT_CLASS}
          required
        />
      </label>

      <label className="block space-y-1.5 text-sm font-semibold">
        <span>Juz</span>
        <select
          value={value.juz}
          onChange={event => changeJuz(Number(event.target.value))}
          className={INPUT_CLASS}
        >
          {Array.from({ length: 30 }, (_, index) => index + 1).map(
            juz => (
              <option key={juz} value={juz}>
                Juz {juz}
              </option>
            )
          )}
        </select>
      </label>

      <label className="block space-y-1.5 text-sm font-semibold">
        <span>Cari surat dalam juz ini</span>
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Ketik nama surat..."
          className={INPUT_CLASS}
        />
      </label>

      <label className="block space-y-1.5 text-sm font-semibold">
        <span>Surat</span>
        <select
          value={value.surahNumber || ''}
          onChange={event =>
            changeSurah(Number(event.target.value))
          }
          className={INPUT_CLASS}
          required
        >
          <option value="">Pilih surat</option>
          {visibleSurahs.map(surah => (
            <option key={surah.number} value={surah.number}>
              {surah.number}. {surah.name}
            </option>
          ))}
        </select>
      </label>

      {visibleSurahs.length === 0 && (
        <p className="text-xs text-amber-700">
          Tidak ada surat yang cocok. Kosongkan pencarian atau ganti juz.
        </p>
      )}

      <label className="block space-y-1.5 text-sm font-semibold">
        <span>Nomor ayat terakhir</span>
        <input
          type="number"
          step={1}
          min={range ? range.startAyah : undefined}
          max={range ? range.endAyah : undefined}
          value={value.ayat}
          onChange={event =>
            onChange({ ...value, ayat: event.target.value })
          }
          disabled={disabled || !range}
          className={INPUT_CLASS}
          placeholder={range ? 'Isi nomor ayat' : 'Pilih surat dahulu'}
          required
        />
      </label>

      <p className="text-xs text-emerald-700">
        {range
          ? `Rentang yang sesuai: ayat ${range.startAyah}–${range.endAyah}.`
          : 'Pilih juz dan surat terlebih dahulu.'}
      </p>

      <label className="block space-y-1.5 text-sm font-semibold">
        <span>Catatan — opsional</span>
        <textarea
          rows={3}
          maxLength={200}
          value={value.note}
          onChange={event =>
            onChange({ ...value, note: event.target.value })
          }
          placeholder="Misalnya: Hari ini membaca dengan lancar."
          className={`${INPUT_CLASS} resize-none`}
        />
      </label>

      <p className="text-right text-xs text-slate-400">
        {value.note.length}/200
      </p>
    </fieldset>
  );
}

function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Tutup"
            className="rounded-full p-2 text-slate-500 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function StudentQuranPage() {
  const outlet = useOutletContext<
    { currentUser?: any } | undefined
  >();
  const { profile } = useAuth();

  const activeUser = outlet?.currentUser || profile;

  const studentId =
    text(activeUser?.luminaId) ||
    text(activeUser?.studentId) ||
    text(activeUser?.uid);

  const profileUnit = (
    text(activeUser?.unitId) || text(activeUser?.unit)
  ).toUpperCase();

  const [status, setStatus] = useState<Status>('loading');
  const [participant, setParticipant] =
    useState<Participant | null>(null);
  const [pageError, setPageError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [logs, setLogs] = useState<ReadingLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');

  const [form, setForm] = useState<ReadingForm>(initialForm);
  const [editing, setEditing] = useState<{
    id: string;
    form: ReadingForm;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const savingRef = useRef(false);

  const [appreciation, setAppreciation] = useState<{
    message: string;
    description: string;
  } | null>(null);

  const [historyLogId, setHistoryLogId] =
    useState<string | null>(null);
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const [deletingLog, setDeletingLog] = useState<ReadingLog | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteLog() {
    if (!deletingLog || deleting) return;
    setDeleting(true);
    try {
      await deleteQuranReadingLog(deletingLog.id);
      if (editing?.id === deletingLog.id) {
        setEditing(null);
      }
      toast.success('Catatan bacaan berhasil dihapus.');
      setDeletingLog(null);
    } catch (err: any) {
      console.error('[StudentQuranPage] delete reading log:', err);
      toast.error('Gagal menghapus catatan bacaan. Periksa izin akses.');
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    setStatus('loading');
    setParticipant(null);
    setPageError('');
    setLogs([]);
    setForm(initialForm());
    setEditing(null);
    setAppreciation(null);
    setHistoryLogId(null);

    const loadParticipant = async () => {
      try {
        if (!studentId) {
          throw new Error(
            'Identitas siswa belum tersedia. Silakan muat ulang halaman.'
          );
        }

        const studentSnapshot = await getDoc(
          doc(db, 'students', studentId)
        );

        if (cancelled) return;

        const studentData = studentSnapshot.exists()
          ? studentSnapshot.data()
          : {};

        const masterUnit = (
          text(studentData.unitId) || text(studentData.unit)
        ).toUpperCase();

        const confirmedUnit = masterUnit || profileUnit;

        if (
          confirmedUnit &&
          confirmedUnit !== 'ELEMENTARY'
        ) {
          throw new Error(
            'Fitur ini khusus untuk siswa Elementary.'
          );
        }

        unsubscribe = onSnapshot(
          doc(db, PARTICIPANTS, studentId),
          snapshot => {
            if (cancelled) return;

            if (!snapshot.exists()) {
              setParticipant(null);
              setStatus('unregistered');
              return;
            }

            const data = snapshot.data() as Participant;

            if (data.unit !== 'ELEMENTARY') {
              setPageError(
                'Data kepesertaan tidak sesuai unit Elementary.'
              );
              setStatus('error');
              return;
            }

            if (
              data.status !== 'active' &&
              data.status !== 'inactive'
            ) {
              setPageError('Status kepesertaan belum valid.');
              setStatus('error');
              return;
            }

            setParticipant(data);
            setStatus(data.status);
          },
          error => {
            if (cancelled) return;
            console.error(
              '[StudentQuranPage] get participant:',
              error
            );
            setPageError(
              'Gagal membaca kepesertaan. Periksa izin akses.'
            );
            setStatus('error');
          }
        );
      } catch (error: any) {
        if (cancelled) return;
        console.error(
          '[StudentQuranPage] resolve identity:',
          error
        );
        setPageError(
          error?.message || 'Gagal memuat identitas siswa.'
        );
        setStatus('error');
      }
    };

    void loadParticipant();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [studentId, profileUnit, reloadKey]);

  useEffect(() => {
    setLogs([]);
    setLogsError('');

    if (
      !studentId ||
      (status !== 'active' && status !== 'inactive')
    ) {
      setLogsLoading(false);
      return;
    }

    let cancelled = false;
    setLogsLoading(true);

    const logsQuery = query(
      collection(db, READING_LOGS),
      where('studentUid', '==', studentId)
    );

    const unsubscribe = onSnapshot(
      logsQuery,
      snapshot => {
        if (cancelled) return;

        const result = snapshot.docs.map(snapshotDoc => ({
          ...snapshotDoc.data(),
          id: snapshotDoc.id,
        })) as ReadingLog[];

        result.sort(
          (a, b) =>
            String(b.readDate).localeCompare(String(a.readDate)) ||
            timestampMillis(b.createdAt) -
              timestampMillis(a.createdAt) ||
            a.id.localeCompare(b.id)
        );

        setLogs(result);
        setLogsLoading(false);
      },
      error => {
        if (cancelled) return;
        console.error(
          '[StudentQuranPage] list reading logs:',
          error
        );
        setLogsError(
          'Riwayat bacaan gagal dimuat. Silakan coba lagi.'
        );
        setLogsLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [studentId, status, reloadKey]);

  useEffect(() => {
    if (status !== 'active') setEditing(null);
  }, [status]);

  useEffect(() => {
    if (!historyLogId) return;

    let cancelled = false;

    setHistoryLoading(true);
    setHistoryError('');
    setHistoryList([]);

    const loadHistory = async () => {
      try {
        const snapshot = await getDocs(
          collection(
            db,
            READING_LOGS,
            historyLogId,
            'history'
          )
        );

        if (cancelled) return;

        const result = snapshot.docs.map(snapshotDoc => ({
          ...snapshotDoc.data(),
          id: snapshotDoc.id,
        })) as HistoryEntry[];

        result.sort(
          (a, b) =>
            timestampMillis(b.changedAt) -
            timestampMillis(a.changedAt)
        );

        setHistoryList(result);
      } catch (error) {
        if (cancelled) return;
        console.error(
          '[StudentQuranPage] list history:',
          error
        );
        setHistoryError('Riwayat perubahan gagal dimuat.');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [historyLogId]);

  const summary = useMemo(() => {
    const dates = new Set(
      logs.map(log => log.readDate).filter(validDate)
    );

    const today = getWibDateString();
    let cursor = dates.has(today)
      ? today
      : previousDate(today);
    let streak = 0;

    while (dates.has(cursor)) {
      streak += 1;
      cursor = previousDate(cursor);
    }

    return {
      readToday: dates.has(today),
      totalDays: dates.size,
      streak,
      lastRead: logs[0] || null,
    };
  }, [logs]);

  const groupedLogs = useMemo(() => {
    const groups = new Map<string, ReadingLog[]>();

    logs.forEach(log => {
      const existing = groups.get(log.readDate) || [];
      groups.set(log.readDate, [...existing, log]);
    });

    return [...groups.entries()];
  }, [logs]);

  async function saveNewLog(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      savingRef.current ||
      status !== 'active' ||
      !studentId ||
      !participant
    ) {
      return;
    }

    if (!isValidForm(form)) {
      toast.error(
        'Periksa tanggal, surat, dan rentang ayat terlebih dahulu.'
      );
      return;
    }

    const surah = getSurahByNumber(form.surahNumber);

    if (!surah) {
      toast.error('Referensi surat tidak ditemukan.');
      return;
    }

    savingRef.current = true;
    setSubmitting(true);

    try {
      const data = {
        studentUid: studentId,
        studentName: text(participant.studentName) || 'Siswa',
        classId: text(participant.classId),
        className: text(participant.className),
        unit: 'ELEMENTARY',
        readDate: form.readDate,
        juz: form.juz,
        surahNumber: surah.number,
        surahName: surah.name,
        ayat: Number(form.ayat),
        note: form.note.trim(),
        createdAt: serverTimestamp(),
        updatedAt: null,
        editCount: 0,
        source: 'app',
      };

      await setDoc(
        doc(collection(db, READING_LOGS)),
        data
      );

      setAppreciation({
        message: 'Catatan bacaan berhasil disimpan. Form siap untuk catatan berikutnya.',
        description:
          `Juz ${form.juz} • ${surah.name} ayat ${Number(form.ayat)}` +
          ` • ${form.readDate}`,
      });

      setForm(initialForm());
    } catch (error) {
      console.error(
        '[StudentQuranPage] create reading log:',
        error
      );
      toast.error(
        'Bacaan belum tersimpan. Isianmu tetap tersedia.'
      );
    } finally {
      savingRef.current = false;
      setSubmitting(false);
    }
  }

  async function saveEditedLog(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      savingRef.current ||
      !editing ||
      status !== 'active'
    ) {
      return;
    }

    const draft = editing.form;

    if (!isValidForm(draft)) {
      toast.error(
        'Periksa tanggal, surat, dan rentang ayat pada perubahan.'
      );
      return;
    }

    const surah = getSurahByNumber(draft.surahNumber);
    const actorUid = getAuth(db.app).currentUser?.uid;

    if (!actorUid || !surah) {
      toast.error(
        'Identitas akun atau referensi surat belum siap.'
      );
      return;
    }

    savingRef.current = true;
    setSubmitting(true);

    try {
      const logRef = doc(
        db,
        READING_LOGS,
        editing.id
      );
      const historyRef = doc(
        collection(logRef, 'history')
      );

      const changed = await runTransaction(
        db,
        async transaction => {
          const snapshot = await transaction.get(logRef);

          if (!snapshot.exists()) {
            throw new Error(
              'Catatan bacaan tidak ditemukan.'
            );
          }

          const current = snapshot.data();

          if (current.studentUid !== studentId) {
            throw new Error(
              'Catatan ini bukan milik siswa yang sedang login.'
            );
          }

          const next = {
            readDate: draft.readDate,
            juz: draft.juz,
            surahNumber: surah.number,
            surahName: surah.name,
            ayat: Number(draft.ayat),
            note: draft.note.trim(),
          };

          const unchanged =
            current.readDate === next.readDate &&
            current.juz === next.juz &&
            current.surahNumber === next.surahNumber &&
            current.surahName === next.surahName &&
            current.ayat === next.ayat &&
            (current.note || '') === next.note;

          if (unchanged) return false;

          transaction.set(historyRef, {
            readDate: current.readDate,
            juz: current.juz,
            surahNumber: current.surahNumber,
            surahName: current.surahName,
            ayat: current.ayat,
            note: current.note || '',
            changedAt: serverTimestamp(),
            changedByUid: actorUid,
          });

          transaction.update(logRef, {
            ...next,
            updatedAt: serverTimestamp(),
            editCount:
              Number(current.editCount || 0) + 1,
          });

          return true;
        }
      );

      toast.success(
        changed
          ? 'Bacaan berhasil diperbarui.'
          : 'Tidak ada perubahan.'
      );
      setEditing(null);
    } catch (error) {
      console.error(
        '[StudentQuranPage] update reading log:',
        error
      );
      toast.error(
        'Perubahan gagal disimpan. Periksa izin akses atau coba lagi.'
      );
    } finally {
      savingRef.current = false;
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="font-bold text-red-900">
            Data belum dapat dimuat
          </h1>
          <p className="mt-2 text-sm text-red-700">
            {pageError}
          </p>
          <button
            onClick={() =>
              setReloadKey(value => value + 1)
            }
            className={`${PRIMARY_BUTTON} mt-4`}
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (status === 'unregistered') {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
          <BookOpen className="mx-auto mb-4 h-10 w-10 text-amber-600" />
          <h1 className="text-xl font-bold">
            Sahabat Qur&apos;an
          </h1>
          <p className="mt-3 text-sm text-amber-800">
            Kamu belum terdaftar di Sahabat Qur&apos;an.
            Tanyakan ke gurumu ya.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-emerald-800 to-teal-700 p-6 text-white shadow-lg md:p-9">
        <div className="mb-3 flex items-center gap-2 text-sm text-emerald-100">
          <BookOpen className="h-5 w-5" />
          Program Harian Elementary
        </div>
        <h1 className="text-3xl font-extrabold">
          Sahabat Qur&apos;an
        </h1>
        <p className="mt-2 text-sm text-emerald-100">
          Catat bacaan Al-Qur&apos;an dan lihat perjalanan belajarmu.
        </p>
      </header>

      {status === 'inactive' && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Pencatatanmu sedang nonaktif. Riwayat tetap dapat dibaca,
          tetapi kamu belum dapat menambah atau mengedit bacaan.
        </p>
      )}

      {logsError ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p>{logsError}</p>
          <button
            onClick={() =>
              setReloadKey(value => value + 1)
            }
            className="mt-2 font-bold underline"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: 'Hari Ini',
              value: logsLoading
                ? 'Memuat...'
                : summary.readToday
                  ? 'Sudah membaca'
                  : 'Belum tercatat',
            },
            {
              title: 'Berturut-turut',
              value: logsLoading
                ? 'Memuat...'
                : `${summary.streak} hari`,
            },
            {
              title: 'Total Hari Membaca',
              value: logsLoading
                ? 'Memuat...'
                : `${summary.totalDays} hari`,
            },
            {
              title: 'Bacaan Terakhir',
              value: logsLoading
                ? 'Memuat...'
                : summary.lastRead
                  ? `${summary.lastRead.surahName} • ayat ${summary.lastRead.ayat}`
                  : 'Belum ada',
            },
          ].map(card => (
            <div
              key={card.title}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase text-slate-500">
                {card.title}
              </p>
              <p className="mt-3 break-words text-lg font-bold text-slate-900">
                {card.value}
              </p>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {status === 'active' && (
          <section className="min-w-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:p-6 lg:col-span-5">
            <h2 className="mb-1 text-lg font-bold">
              Catat Bacaan Baru
            </h2>
            <p className="mb-5 text-xs text-slate-500">
              Isi posisi ayat terakhir yang kamu baca.
            </p>

            <form
              onSubmit={saveNewLog}
              className="space-y-5"
            >
              <ReadingFields
                value={form}
                onChange={setForm}
                disabled={submitting}
              />

              <button
                type="submit"
                disabled={
                  submitting || !isValidForm(form)
                }
                className={`${PRIMARY_BUTTON} w-full`}
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {submitting
                  ? 'Menyimpan...'
                  : 'Simpan Catatan Bacaan'}
              </button>
            </form>
          </section>
        )}

        <section
          className={`min-w-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:p-6 ${
            status === 'active'
              ? 'lg:col-span-7'
              : 'lg:col-span-12'
          }`}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              Riwayat Bacaan
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
              {logs.length} entri
            </span>
          </div>

          {logsLoading ? (
            <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-emerald-600" />
          ) : logsError ? (
            <p className="text-sm text-red-600">
              {logsError}
            </p>
          ) : logs.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Belum ada bacaan yang tercatat.
            </p>
          ) : (
            <div className="space-y-6">
              {groupedLogs.map(([date, entries]) => (
                <div key={date} className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500">
                    {date}
                  </h3>

                  {entries.map(log => (
                    <article
                      key={log.id}
                      className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                          Juz {log.juz}
                        </span>
                        <h4 className="text-sm font-bold">
                          {log.surahName} • ayat {log.ayat}
                        </h4>
                      </div>

                      <p className="text-xs text-slate-500">
                        Input: {formatTimestamp(log.createdAt)}
                      </p>

                      {log.note && (
                        <p className="whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-sm text-slate-600">
                          {log.note}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {log.editCount > 0 && (
                          <>
                            <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-800">
                              Diedit {log.editCount}x
                            </span>
                            <button
                              onClick={() =>
                                setHistoryLogId(log.id)
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                            >
                              <HistoryIcon className="h-3.5 w-3.5" />
                              Riwayat Perubahan
                            </button>
                          </>
                        )}

                        {status === 'active' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              disabled={submitting}
                              onClick={() =>
                                setEditing({
                                  id: log.id,
                                  form: logToForm(log),
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold cursor-pointer"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              disabled={submitting || deleting}
                              onClick={() => setDeletingLog(log)}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Hapus
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {appreciation && (
        <Modal
          title="Alhamdulillah!"
          onClose={() => setAppreciation(null)}
        >
          <div className="space-y-5 text-center">
            <Sparkles className="mx-auto h-12 w-12 text-emerald-600" />
            <p className="text-slate-700">
              {appreciation.message}
            </p>
            <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              {appreciation.description}
            </p>
            <button
              onClick={() => setAppreciation(null)}
              className={`${PRIMARY_BUTTON} w-full`}
            >
              Lanjutkan
            </button>
          </div>
        </Modal>
      )}

      {editing && status === 'active' && (
        <Modal
          title="Edit Catatan Bacaan"
          onClose={() => setEditing(null)}
          busy={submitting}
        >
          <form
            onSubmit={saveEditedLog}
            className="space-y-5"
          >
            <ReadingFields
              value={editing.form}
              onChange={next =>
                setEditing(previous =>
                  previous
                    ? { ...previous, form: next }
                    : null
                )
              }
              disabled={submitting}
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={submitting}
                className="rounded-xl px-4 py-3 text-sm text-slate-600"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={
                  submitting ||
                  !isValidForm(editing.form)
                }
                className={PRIMARY_BUTTON}
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Simpan Perubahan
              </button>
            </div>
          </form>
        </Modal>
      )}

      {historyLogId && (
        <Modal
          title="Riwayat Perubahan Bacaan"
          onClose={() => setHistoryLogId(null)}
        >
          {historyLoading ? (
            <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-emerald-600" />
          ) : historyError ? (
            <p className="text-sm text-red-600">
              {historyError}
            </p>
          ) : historyList.length === 0 ? (
            <p className="text-sm text-slate-500">
              Tidak ada riwayat perubahan.
            </p>
          ) : (
            <div className="space-y-3">
              {historyList.map(entry => (
                <article
                  key={entry.id}
                  className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"
                >
                  <p className="text-xs text-slate-500">
                    Diubah: {formatTimestamp(entry.changedAt)}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    Nilai sebelum perubahan:
                  </p>
                  <p className="font-bold">
                    Juz {entry.juz} • {entry.surahName} • ayat{' '}
                    {entry.ayat}
                  </p>
                  <p>
                    Tanggal bacaan: {entry.readDate}
                  </p>
                  {entry.note && (
                    <p className="whitespace-pre-wrap break-words text-slate-600">
                      {entry.note}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </Modal>
      )}

      {deletingLog && (
        <Modal
          title="Hapus Catatan Bacaan"
          onClose={() => setDeletingLog(null)}
          busy={deleting}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Hapus catatan bacaan ini? Pastikan ini catatan yang ingin dihapus.
            </p>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200 space-y-1">
              <p><strong>Tanggal:</strong> {deletingLog.readDate}</p>
              <p><strong>Bacaan:</strong> {deletingLog.surahName} • ayat {deletingLog.ayat} (Juz {deletingLog.juz})</p>
              {deletingLog.note && <p><strong>Catatan:</strong> {deletingLog.note}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingLog(null)}
                className="rounded-xl px-4 py-2.5 text-xs text-slate-600 border border-slate-300 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteLog()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer active:scale-95 disabled:opacity-50 shadow-2xs"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Hapus catatan
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}