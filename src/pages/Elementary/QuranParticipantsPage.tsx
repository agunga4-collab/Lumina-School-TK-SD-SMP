import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  UserCheck,
  UserX,
  Loader2,
  ShieldAlert,
  CheckSquare,
  Square,
  Users,
  Calendar,
  FileText,
  Eye,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import {
  registerQuranParticipant,
  updateQuranParticipantStatus,
  getQuranReadingLogs,
} from '../../services/quranService';
import type { QuranParticipant, QuranReadingLog } from '../../services/quranService';

type SchoolClass = {
  id: string;
  name: string;
  [key: string]: any;
};

type StudentRow = {
  id: string;
  name: string;
  classId: string;
  className: string;
};

type Confirmation = {
  title: string;
  message: string;
  action: () => Promise<void>;
};

const ELEM_ROLES = [
  'TEACHER',
  'HOMEROOM_TEACHER',
  'HEAD_UNIT',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'COORDINATOR',
  'SECRETARY_ELEM',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalize(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function declaredUnits(data: any): string[] {
  return [
    data?.unitId,
    data?.unit,
    ...(Array.isArray(data?.units) ? data.units : []),
  ]
    .map(value => text(value).toUpperCase())
    .filter(Boolean);
}

function isElementaryClass(schoolClass: any): boolean {
  const units = declaredUnits(schoolClass);
  const classId = text(schoolClass.id);
  const status = normalize(schoolClass.status);

  if (['archived', 'inactive', 'deleted'].includes(status)) {
    return false;
  }

  if (
    classId.startsWith('JUNIOR_HIGH_') ||
    classId.startsWith('KINDERGARTEN_')
  ) {
    return false;
  }

  if (units.includes('JUNIOR_HIGH') || units.includes('KINDERGARTEN')) {
    return false;
  }

  return units.includes('ELEMENTARY') || classId.startsWith('ELEMENTARY_');
}

function getDefaultMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = wibNow.getUTCFullYear();
  const month = wibNow.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function formatTimestamp(value: any): string {
  if (!value) return '—';
  const millis =
    typeof value.toMillis === 'function'
      ? value.toMillis()
      : typeof value === 'number'
      ? value
      : 0;
  if (!millis) return '—';
  return new Date(millis).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function QuranParticipantsPage() {
  const { profile } = useAuth();
  const { activeYear, isLoading: isYearLoading } = useAcademicYear();

  const [activeTab, setActiveTab] = useState<'monitoring' | 'participants'>('monitoring');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [participantsMap, setParticipantsMap] = useState<Record<string, QuranParticipant>>({});
  const [readingLogs, setReadingLogs] = useState<QuranReadingLog[]>([]);

  const defaultRange = getDefaultMonthRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [showInactive, setShowInactive] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [processingAction, setProcessingAction] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const [historyStudent, setHistoryStudent] = useState<StudentRow | null>(null);
  const [historyAllMode, setHistoryAllMode] = useState(false);

  const canAccess = useMemo(() => {
    if (!profile) return false;
    if (profile.role === 'SUPER_ADMIN') return true;
    if (!ELEM_ROLES.includes(profile.role)) return false;

    const units = declaredUnits(profile);
    return units.includes('ELEMENTARY') || units.includes('ALL');
  }, [profile]);

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    if (isYearLoading || !activeYear) {
      setLoading(true);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const [allClasses, allStudents, logs] = await Promise.all([
          getClasses(),
          getActiveStudents('ALL', activeYear),
          getQuranReadingLogs(),
        ]);

        const elementaryClasses: SchoolClass[] = allClasses
          .filter(isElementaryClass)
          .map((schoolClass: any) => ({
            ...schoolClass,
            id: text(schoolClass.id),
            name: text(schoolClass.name) || text(schoolClass.id),
          }))
          .filter((schoolClass: SchoolClass) => Boolean(schoolClass.id))
          .sort((a: SchoolClass, b: SchoolClass) =>
            a.name.localeCompare(b.name, 'id', { numeric: true })
          );

        const classById = new Map<string, SchoolClass>();
        const classesByName = new Map<string, SchoolClass[]>();

        elementaryClasses.forEach(schoolClass => {
          classById.set(schoolClass.id, schoolClass);
          const key = normalize(schoolClass.name);
          const existing = classesByName.get(key) || [];
          classesByName.set(key, [...existing, schoolClass]);
        });

        const studentMap = new Map<string, StudentRow>();

        allStudents.forEach((student: any) => {
          const id = text(student.id) || text(student.uid);
          if (!id) return;

          const units = declaredUnits(student);
          const rawClassId = text(student.classId);
          const rawClassName = text(student.className);

          if (
            units.includes('JUNIOR_HIGH') ||
            units.includes('KINDERGARTEN') ||
            rawClassId.startsWith('JUNIOR_HIGH_') ||
            rawClassId.startsWith('KINDERGARTEN_') ||
            rawClassName.startsWith('JUNIOR_HIGH_') ||
            rawClassName.startsWith('KINDERGARTEN_')
          ) {
            return;
          }

          let schoolClass =
            classById.get(rawClassId) || classById.get(rawClassName);

          if (!schoolClass) {
            const classReference = rawClassId || rawClassName;
            const isStructuredId = /^(ELEMENTARY|JUNIOR_HIGH|KINDERGARTEN)_/
              .test(classReference);

            if (!isStructuredId) {
              const candidates = classesByName.get(normalize(classReference));
              if (candidates?.length === 1) {
                schoolClass = candidates[0];
              }
            }
          }

          if (!schoolClass) return;

          studentMap.set(id, {
            id,
            name: text(student.name) || text(student.fullName) || 'Siswa',
            classId: schoolClass.id,
            className: schoolClass.name,
          });
        });

        // Load participants from DB
        import('firebase/firestore').then(async ({ collection: col, getDocs: gd }) => {
          const partSnap = await gd(col(db, 'elementary_quran_participants'));
          const nextParticipants: Record<string, QuranParticipant> = {};
          partSnap.forEach(snap => {
            nextParticipants[snap.id] = snap.data() as QuranParticipant;
          });

          if (cancelled) return;

          setClasses(elementaryClasses);
          setStudents(
            [...studentMap.values()].sort((a, b) =>
              a.name.localeCompare(b.name, 'id')
            )
          );
          setParticipantsMap(nextParticipants);
          setReadingLogs(logs);
          setSelectedStudentIds([]);
          setSelectedClassId(previous =>
            previous === 'all' || classById.has(previous) ? previous : 'all'
          );
        });
      } catch (error: any) {
        if (cancelled) return;
        console.error('[QuranParticipantsPage] Gagal memuat data:', error);
        const message =
          error?.code === 'permission-denied'
            ? 'Akses data ditolak. Periksa rules Sahabat Qur’an.'
            : 'Data gagal dimuat. Silakan coba lagi.';
        setLoadError(message);
        setStudents([]);
        setClasses([]);
        setParticipantsMap({});
        setReadingLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [canAccess, activeYear, isYearLoading, reloadKey]);

  useEffect(() => {
    setSelectedStudentIds([]);
  }, [selectedClassId, searchQuery]);

  const filteredStudents = useMemo(() => {
    const search = normalize(searchQuery);

    return students.filter(student => {
      const matchesClass =
        selectedClassId === 'all' || student.classId === selectedClassId;
      return matchesClass && normalize(student.name).includes(search);
    });
  }, [students, selectedClassId, searchQuery]);

  // Monitoring filtered students: active participants (and optional inactive if showInactive)
  const monitoringStudents = useMemo(() => {
    return filteredStudents.filter(student => {
      const part = participantsMap[student.id];
      const isActive = part?.status === 'active';
      if (!showInactive && !isActive) return false;
      return true;
    });
  }, [filteredStudents, participantsMap, showInactive]);

  // Logs map / filtering for period [startDate, endDate]
  const logsInPeriod = useMemo(() => {
    return readingLogs.filter(log => {
      if (!log.readDate) return false;
      return log.readDate >= startDate && log.readDate <= endDate;
    });
  }, [readingLogs, startDate, endDate]);

  const logsByStudentInPeriod = useMemo(() => {
    const map = new Map<string, QuranReadingLog[]>();
    logsInPeriod.forEach(log => {
      const uid = text(log.studentUid);
      if (!uid) return;
      const list = map.get(uid) || [];
      map.set(uid, [...list, log]);
    });
    return map;
  }, [logsInPeriod]);

  // All logs by student for history modal
  const allLogsByStudent = useMemo(() => {
    const map = new Map<string, QuranReadingLog[]>();
    readingLogs.forEach(log => {
      const uid = text(log.studentUid);
      if (!uid) return;
      const list = map.get(uid) || [];
      map.set(uid, [...list, log]);
    });
    return map;
  }, [readingLogs]);

  // Summary counts for active participants
  const activeStudentsList = useMemo(() => {
    return students.filter(student => {
      const matchesClass =
        selectedClassId === 'all' || student.classId === selectedClassId;
      const matchesSearch = normalize(student.name).includes(normalize(searchQuery));
      const isActive = participantsMap[student.id]?.status === 'active';
      return matchesClass && matchesSearch && isActive;
    });
  }, [students, participantsMap, selectedClassId, searchQuery]);

  const totalActiveCount = activeStudentsList.length;

  const activeWithLogsCount = useMemo(() => {
    return activeStudentsList.filter(student => {
      const logs = logsByStudentInPeriod.get(student.id) || [];
      return logs.length > 0;
    }).length;
  }, [activeStudentsList, logsByStudentInPeriod]);

  const activeWithoutLogsCount = Math.max(0, totalActiveCount - activeWithLogsCount);

  const activeCountByClass = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach(student => {
      if (participantsMap[student.id]?.status === 'active') {
        counts[student.classId] = (counts[student.classId] || 0) + 1;
      }
    });
    return counts;
  }, [students, participantsMap]);

  const allVisibleSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every(student => selectedStudentIds.includes(student.id));

  const selectedClass = classes.find(
    schoolClass => schoolClass.id === selectedClassId
  );

  const actorUid = text(profile?.uid);

  const handleToggleSelectAll = () => {
    if (processingAction) return;
    setSelectedStudentIds(
      allVisibleSelected ? [] : filteredStudents.map(student => student.id)
    );
  };

  const handleSelectStudent = (id: string) => {
    if (processingAction) return;
    setSelectedStudentIds(previous =>
      previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
    );
  };

  const registerStudents = async (targetStudents: StudentRow[]) => {
    if (!actorUid) {
      toast.error('Identitas akun belum siap. Muat ulang halaman.');
      return;
    }

    const allowedIds = new Set(students.map(student => student.id));
    const targets = [
      ...new Map(
        targetStudents
          .filter(student => allowedIds.has(student.id))
          .map(student => [student.id, student])
      ).values(),
    ].filter(student => participantsMap[student.id]?.status !== 'active');

    if (targets.length === 0) {
      toast.info('Tidak ada siswa yang perlu didaftarkan.');
      return;
    }

    setProcessingAction(true);
    let successCount = 0;

    try {
      for (const student of targets) {
        const existing = participantsMap[student.id];
        if (existing) {
          await updateQuranParticipantStatus(student.id, 'active', actorUid);
        } else {
          await registerQuranParticipant(
            student.id,
            student.name,
            student.classId,
            student.className,
            actorUid
          );
        }

        setParticipantsMap(previous => ({
          ...previous,
          [student.id]: {
            ...previous[student.id],
            studentUid: student.id,
            studentName: student.name,
            classId: student.classId,
            className: student.className,
            unit: 'ELEMENTARY',
            status: 'active',
            registeredByUid: previous[student.id]?.registeredByUid || actorUid,
          } as QuranParticipant,
        }));
        successCount += 1;
      }

      setSelectedStudentIds([]);
      toast.success(`Berhasil mengaktifkan ${successCount} peserta.`);
    } catch (error) {
      console.error('[QuranParticipantsPage] Pendaftaran gagal:', error);
      toast.error(`Pendaftaran terhenti. ${successCount} siswa berhasil diproses.`);
    } finally {
      setProcessingAction(false);
      setConfirmation(null);
    }
  };

  const updateStatus = async (studentId: string, status: 'active' | 'inactive') => {
    if (!actorUid) {
      toast.error('Identitas akun belum siap. Muat ulang halaman.');
      return;
    }

    setProcessingAction(true);

    try {
      await updateQuranParticipantStatus(studentId, status, actorUid);
      setParticipantsMap(previous => ({
        ...previous,
        [studentId]: {
          ...previous[studentId],
          status,
        },
      }));
      toast.success(
        status === 'active'
          ? 'Peserta berhasil diaktifkan.'
          : 'Peserta berhasil dinonaktifkan.'
      );
    } catch (error) {
      console.error('[QuranParticipantsPage] Perubahan status gagal:', error);
      toast.error('Gagal mengubah status peserta.');
    } finally {
      setProcessingAction(false);
      setConfirmation(null);
    }
  };

  const confirmSelectedRegistration = () => {
    const targets = filteredStudents.filter(
      student =>
        selectedStudentIds.includes(student.id) &&
        participantsMap[student.id]?.status !== 'active'
    );

    if (targets.length === 0) {
      toast.info('Pilih siswa yang belum aktif terlebih dahulu.');
      return;
    }

    setConfirmation({
      title: 'Daftarkan Siswa Terpilih',
      message: `Daftarkan atau aktifkan ${targets.length} siswa terpilih ke Sahabat Qur’an?`,
      action: () => registerStudents(targets),
    });
  };

  const confirmClassRegistration = () => {
    if (selectedClassId === 'all' || !selectedClass) {
      toast.info('Pilih satu kelas terlebih dahulu.');
      return;
    }

    const targets = students.filter(
      student =>
        student.classId === selectedClassId &&
        participantsMap[student.id]?.status !== 'active'
    );

    if (targets.length === 0) {
      toast.info('Semua siswa di kelas ini sudah aktif.');
      return;
    }

    setConfirmation({
      title: 'Daftarkan Satu Kelas',
      message: `Daftarkan atau aktifkan ${targets.length} siswa dari kelas ${selectedClass.name}?`,
      action: () => registerStudents(targets),
    });
  };

  if (!canAccess) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
          <ShieldAlert className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-amber-900">Akses Terbatas</h2>
          <p className="text-amber-700 mt-2">
            Halaman ini khusus untuk staf Elementary yang berwenang dan Super Admin.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-red-700">{loadError}</p>
          <button
            onClick={() => setReloadKey(previous => previous + 1)}
            className="mt-4 rounded-xl bg-red-600 text-white px-4 py-2"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="bg-gradient-to-r from-emerald-800 to-teal-700 rounded-2xl p-6 md:p-8 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs mb-3">
              <BookOpen className="w-3.5 h-3.5" />
              Portal Guru Elementary
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Peserta Sahabat Qur&apos;an
            </h1>
            <p className="text-emerald-100 mt-2 text-sm md:text-base">
              Pantau pengisian bacaan Al-Qur&apos;an peserta dan kelola keanggotaan program.
            </p>
          </div>
          <div className="bg-white/10 px-5 py-4 rounded-xl border border-white/20 text-center shrink-0">
            <span className="block text-3xl font-bold text-emerald-200">
              {totalActiveCount}
            </span>
            <span className="text-xs text-emerald-100">
              Peserta Aktif Terdaftar
            </span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('monitoring')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'monitoring'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Monitoring Bacaan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('participants')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'participants'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Kelola Peserta
        </button>
      </div>

      {activeTab === 'monitoring' ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500">Peserta Aktif</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalActiveCount}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Sesuai filter kelas & pencarian</p>
            </div>
            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
              <p className="text-xs font-semibold text-emerald-800">Sudah Mencatat pada Periode</p>
              <p className="text-2xl font-bold text-emerald-950 mt-1">{activeWithLogsCount}</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">Siswa unik dengan catatan ({startDate} s.d. {endDate})</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500">Belum Ada Catatan pada Periode</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{activeWithoutLogsCount}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Belum mengisi pada rentang tanggal ini</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={selectedClassId}
                onChange={event => setSelectedClassId(event.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="all">Semua Kelas Elementary</option>
                {classes.map(schoolClass => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </select>

              <div className="relative md:col-span-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder="Cari nama siswa..."
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 shrink-0">Dari:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={event => setStartDate(event.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 shrink-0">Hingga:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={event => setEndDate(event.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={event => setShowInactive(event.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Tampilkan peserta nonaktif dalam tabel
              </label>
              <p className="text-[11px] text-slate-400">
                Periode kegiatan dihitung berdasarkan tanggal bacaan (<code className="bg-slate-100 px-1 py-0.5 rounded">readDate</code>).
              </p>
            </div>
          </div>

          {/* Monitoring Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="p-3.5 font-bold">Nama Siswa</th>
                    <th className="p-3.5 font-bold">Kelas</th>
                    <th className="p-3.5 font-bold">Status Partisipasi</th>
                    <th className="p-3.5 font-bold text-center">Jumlah Catatan</th>
                    <th className="p-3.5 font-bold">Bacaan Terakhir pada Periode</th>
                    <th className="p-3.5 font-bold">Tanggal Bacaan</th>
                    <th className="p-3.5 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monitoringStudents.map(student => {
                    const participant = participantsMap[student.id];
                    const isActive = participant?.status === 'active';
                    const studentLogs = logsByStudentInPeriod.get(student.id) || [];
                    // Sort descending by readDate, then createdAt
                    const sortedLogs = [...studentLogs].sort((a, b) => {
                      const dateCmp = (b.readDate || '').localeCompare(a.readDate || '');
                      if (dateCmp !== 0) return dateCmp;
                      const timeA = a.createdAt?.toMillis?.() || 0;
                      const timeB = b.createdAt?.toMillis?.() || 0;
                      return timeB - timeA;
                    });
                    const latestLog = sortedLogs[0];

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 font-semibold text-slate-900">
                          {student.name}
                        </td>
                        <td className="p-3.5 text-slate-600">{student.className}</td>
                        <td className="p-3.5">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Nonaktif
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-800">
                          {studentLogs.length > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs">
                              {studentLogs.length}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-700">
                          {latestLog ? (
                            <div>
                              <span className="font-semibold">{latestLog.surahName}</span> : Ayat {latestLog.ayat}
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Juz {latestLog.juz}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Belum ada catatan pada periode</span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                          {latestLog?.readDate || '—'}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryStudent(student);
                              setHistoryAllMode(false);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold transition-all cursor-pointer active:scale-95"
                          >
                            <Eye size={13} /> Lihat Riwayat
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {monitoringStudents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        Tidak ada peserta yang cocok dengan filter saat ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* KELOLA PESERTA TAB (Existing UI) */
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={selectedClassId}
              onChange={event => setSelectedClassId(event.target.value)}
              disabled={processingAction}
              className="w-full min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            >
              <option value="all">Semua Kelas Elementary</option>
              {classes.map(schoolClass => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                  {activeCountByClass[schoolClass.id]
                    ? ` (${activeCountByClass[schoolClass.id]} aktif)`
                    : ''}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Cari nama siswa..."
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                disabled={processingAction}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                disabled={processingAction || filteredStudents.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold hover:bg-slate-50 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                Pilih Semua Ditampilkan ({filteredStudents.length})
              </button>
              {selectedStudentIds.length > 0 && (
                <span className="text-xs text-slate-600">
                  {selectedStudentIds.length} siswa dipilih
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={confirmSelectedRegistration}
                disabled={processingAction || selectedStudentIds.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer active:scale-95 disabled:opacity-50 shadow-2xs"
              >
                <UserCheck className="w-4 h-4" />
                Daftarkan Terpilih
              </button>
              {selectedClassId !== 'all' && (
                <button
                  type="button"
                  onClick={confirmClassRegistration}
                  disabled={processingAction}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer active:scale-95 disabled:opacity-50 shadow-2xs"
                >
                  <Users className="w-4 h-4" />
                  Daftarkan 1 Kelas ({selectedClass?.name || ''})
                </button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="p-3.5 w-12 text-center">Pilih</th>
                    <th className="p-3.5 font-bold">Nama Siswa</th>
                    <th className="p-3.5 font-bold">Kelas</th>
                    <th className="p-3.5 font-bold">Status Partisipasi</th>
                    <th className="p-3.5 font-bold text-right">Aksi Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map(student => {
                    const participant = participantsMap[student.id];
                    const isActive = participant?.status === 'active';
                    const isSelected = selectedStudentIds.includes(student.id);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleSelectStudent(student.id)}
                            disabled={processingAction}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900">
                          {student.name}
                        </td>
                        <td className="p-3.5 text-slate-600">{student.className}</td>
                        <td className="p-3.5">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Belum Terdaftar
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          {isActive ? (
                            <button
                              type="button"
                              disabled={processingAction}
                              onClick={() =>
                                setConfirmation({
                                  title: 'Nonaktifkan Peserta',
                                  message: `Nonaktifkan ${student.name} dari Sahabat Qur’an? Riwayat bacaan tetap tersimpan.`,
                                  action: () => updateStatus(student.id, 'inactive'),
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              Nonaktifkan
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={processingAction}
                              onClick={() =>
                                setConfirmation({
                                  title: 'Aktifkan Peserta',
                                  message: `Daftarkan atau aktifkan kembali ${student.name} ke Sahabat Qur’an?`,
                                  action: () => registerStudents([student]),
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Aktifkan
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        Tidak ada siswa yang cocok dengan filter saat ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {historyStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Riwayat Bacaan: {historyStudent.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kelas: {historyStudent.className} · Status:{' '}
                  {participantsMap[historyStudent.id]?.status === 'active' ? 'Aktif' : 'Nonaktif'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryStudent(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryAllMode(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !historyAllMode
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Periode Terpilih ({startDate} s.d. {endDate})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryAllMode(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    historyAllMode
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Seluruh Riwayat Siswa
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Mode Tampilan Guru (View-only)
              </p>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const studentAllLogs = allLogsByStudent.get(historyStudent.id) || [];
                const studentLogs = historyAllMode
                  ? studentAllLogs
                  : studentAllLogs.filter(
                      log => log.readDate && log.readDate >= startDate && log.readDate <= endDate
                    );

                const sortedStudentLogs = [...studentLogs].sort((a, b) => {
                  const dateCmp = (b.readDate || '').localeCompare(a.readDate || '');
                  if (dateCmp !== 0) return dateCmp;
                  const timeA = a.createdAt?.toMillis?.() || 0;
                  const timeB = b.createdAt?.toMillis?.() || 0;
                  return timeB - timeA;
                });

                if (sortedStudentLogs.length === 0) {
                  return (
                    <p className="text-center text-slate-400 py-12 text-sm">
                      {historyAllMode
                        ? 'Belum ada riwayat catatan bacaan untuk siswa ini.'
                        : `Belum ada catatan bacaan pada periode ${startDate} s.d. ${endDate}.`}
                    </p>
                  );
                }

                return sortedStudentLogs.map(log => (
                  <div
                    key={log.id}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {log.surahName} (Surah ke-{log.surahNumber})
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-bold text-xs">
                          Ayat {log.ayat}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-[11px]">
                          Juz {log.juz}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        Tanggal Baca: {log.readDate}
                      </span>
                    </div>

                    {log.note && (
                      <p className="text-slate-700 bg-white p-3 rounded-xl border border-slate-200 whitespace-pre-wrap">
                        {log.note}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                      <span>Waktu Input: {formatTimestamp(log.createdAt || log.updatedAt)}</span>
                      {log.editCount > 0 && <span>Diedit {log.editCount}x</span>}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryStudent(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {confirmation.title}
            </h3>
            <p className="text-xs text-slate-600">{confirmation.message}</p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={processingAction}
                onClick={() => setConfirmation(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={processingAction}
                onClick={() => void confirmation.action()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {processingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}