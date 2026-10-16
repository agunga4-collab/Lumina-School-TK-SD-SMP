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
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';

import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import {
  registerQuranParticipant,
  updateQuranParticipantStatus,
} from '../../services/quranService';
import type { QuranParticipant } from '../../services/quranService';
import { cn } from '../../lib/utils';

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

  if (
    units.includes('JUNIOR_HIGH') ||
    units.includes('KINDERGARTEN')
  ) {
    return false;
  }

  return (
    units.includes('ELEMENTARY') ||
    classId.startsWith('ELEMENTARY_')
  );
}

export default function QuranParticipantsPage() {
  const { profile } = useAuth();
  const { activeYear, isLoading: isYearLoading } = useAcademicYear();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [participantsMap, setParticipantsMap] = useState<
    Record<string, QuranParticipant>
  >({});

  const [selectedClassId, setSelectedClassId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [processingAction, setProcessingAction] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

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
        const allClasses = await getClasses();

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

        const allStudents = await getActiveStudents('ALL', activeYear);
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

          // Prioritaskan ID kelas. Nama hanya untuk data lama
          // yang menyimpan nama kelas, bukan ID.
          let schoolClass =
            classById.get(rawClassId) ||
            classById.get(rawClassName);

          if (!schoolClass) {
            const classReference = rawClassId || rawClassName;
            const isStructuredId = /^(ELEMENTARY|JUNIOR_HIGH|KINDERGARTEN)_/
              .test(classReference);

            if (!isStructuredId) {
              const candidates = classesByName.get(
                normalize(classReference)
              );

              if (candidates?.length === 1) {
                schoolClass = candidates[0];
              }
            }
          }

          // Tidak ada fallback ke semua siswa/unit.
          if (!schoolClass) return;

          studentMap.set(id, {
            id,
            name:
              text(student.name) ||
              text(student.fullName) ||
              'Siswa',
            classId: schoolClass.id,
            className: schoolClass.name,
          });
        });

        const participantSnapshot = await getDocs(
          collection(db, 'elementary_quran_participants')
        );

        const nextParticipants: Record<string, QuranParticipant> = {};

        participantSnapshot.forEach(snapshot => {
          nextParticipants[snapshot.id] =
            snapshot.data() as QuranParticipant;
        });

        if (cancelled) return;

        setClasses(elementaryClasses);
        setStudents(
          [...studentMap.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'id')
          )
        );
        setParticipantsMap(nextParticipants);
        setSelectedStudentIds([]);
        setSelectedClassId(previous =>
          previous === 'all' || classById.has(previous)
            ? previous
            : 'all'
        );
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
        selectedClassId === 'all' ||
        student.classId === selectedClassId;

      return matchesClass && normalize(student.name).includes(search);
    });
  }, [students, selectedClassId, searchQuery]);

  const activeCountByClass = useMemo(() => {
    const counts: Record<string, number> = {};

    students.forEach(student => {
      if (participantsMap[student.id]?.status === 'active') {
        counts[student.classId] = (counts[student.classId] || 0) + 1;
      }
    });

    return counts;
  }, [students, participantsMap]);

  const totalActiveCount = useMemo(
    () =>
      students.filter(
        student => participantsMap[student.id]?.status === 'active'
      ).length,
    [students, participantsMap]
  );

  const allVisibleSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every(student =>
      selectedStudentIds.includes(student.id)
    );

  const selectedClass = classes.find(
    schoolClass => schoolClass.id === selectedClassId
  );

  const actorUid = text(profile?.uid);

  const handleToggleSelectAll = () => {
    if (processingAction) return;

    setSelectedStudentIds(
      allVisibleSelected
        ? []
        : filteredStudents.map(student => student.id)
    );
  };

  const handleSelectStudent = (id: string) => {
    if (processingAction) return;

    setSelectedStudentIds(previous =>
      previous.includes(id)
        ? previous.filter(item => item !== id)
        : [...previous, id]
    );
  };

  const registerStudents = async (targetStudents: StudentRow[]) => {
    if (!actorUid) {
      toast.error('Identitas akun belum siap. Muat ulang halaman.');
      return;
    }

    // Batasi target pada daftar siswa SD yang sudah tervalidasi.
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
          await updateQuranParticipantStatus(
            student.id,
            'active',
            actorUid
          );
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
            registeredByUid:
              previous[student.id]?.registeredByUid || actorUid,
          } as QuranParticipant,
        }));

        successCount += 1;
      }

      setSelectedStudentIds([]);
      toast.success(`Berhasil mengaktifkan ${successCount} peserta.`);
    } catch (error) {
      console.error('[QuranParticipantsPage] Pendaftaran gagal:', error);
      toast.error(
        `Pendaftaran terhenti. ${successCount} siswa berhasil diproses.`
      );
    } finally {
      setProcessingAction(false);
      setConfirmation(null);
    }
  };

  const updateStatus = async (
    studentId: string,
    status: 'active' | 'inactive'
  ) => {
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

    // Ambil seluruh kelas, tidak dipengaruhi pencarian nama.
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
          <h2 className="text-xl font-bold text-amber-900">
            Akses Terbatas
          </h2>
          <p className="text-amber-700 mt-2">
            Halaman ini khusus untuk staf Elementary yang berwenang dan
            Super Admin.
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
              Pilih siswa Elementary yang akan mengikuti program
              pencatatan bacaan Al-Qur&apos;an.
            </p>
          </div>
          <div className="bg-white/10 px-5 py-4 rounded-xl border border-white/20 text-center shrink-0">
            <span className="block text-3xl font-bold text-emerald-200">
              {totalActiveCount}
            </span>
            <span className="text-xs text-emerald-100">
              Peserta Aktif pada Tahun Ajaran Ini
            </span>
          </div>
        </div>
      </div>

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {filteredStudents.length} siswa ditampilkan
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={confirmClassRegistration}
              disabled={
                processingAction ||
                selectedClassId === 'all' ||
                !selectedClass
              }
              className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Users className="w-4 h-4" />
              Daftarkan Semua di Kelas Ini
            </button>

            <button
              onClick={confirmSelectedRegistration}
              disabled={
                processingAction || selectedStudentIds.length === 0
              }
              className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserCheck className="w-4 h-4" />
              Daftarkan yang Dipilih ({selectedStudentIds.length})
            </button>
          </div>
        </div>
      </div>

      {classes.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Tidak ada kelas Elementary yang dikenali. Periksa unitId atau
          unit pada data kelas. Kelas Test tidak otomatis dianggap SD.
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase">
                <th className="p-4 w-12">
                  <button
                    onClick={handleToggleSelectAll}
                    disabled={
                      processingAction || filteredStudents.length === 0
                    }
                    aria-label="Pilih semua siswa yang ditampilkan"
                  >
                    {allVisibleSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-4">Nama Siswa</th>
                <th className="p-4">Kelas</th>
                <th className="p-4">Status Partisipasi</th>
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 px-4 text-center text-slate-400"
                  >
                    Tidak ada siswa yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const status =
                    participantsMap[student.id]?.status || 'unregistered';
                  const selected = selectedStudentIds.includes(student.id);

                  return (
                    <tr
                      key={student.id}
                      className={cn(
                        'hover:bg-slate-50',
                        selected && 'bg-emerald-50/50'
                      )}
                    >
                      <td className="p-4">
                        <button
                          onClick={() => handleSelectStudent(student.id)}
                          disabled={processingAction}
                          aria-label={`Pilih ${student.name}`}
                        >
                          {selected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="p-4 font-semibold text-slate-900">
                        {student.name}
                      </td>
                      <td className="p-4 text-slate-600">
                        {student.className}
                      </td>
                      <td className="p-4">
                        <span
                          className={cn(
                            'inline-flex px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap',
                            status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : status === 'inactive'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-amber-50 text-amber-700'
                          )}
                        >
                          {status === 'active'
                            ? 'Peserta Aktif'
                            : status === 'inactive'
                              ? 'Nonaktif'
                              : 'Belum terdaftar'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {status === 'active' ? (
                          <button
                            onClick={() =>
                              setConfirmation({
                                title: 'Nonaktifkan Peserta',
                                message: `Nonaktifkan ${student.name}? Riwayat bacaannya tidak dihapus.`,
                                action: () =>
                                  updateStatus(student.id, 'inactive'),
                              })
                            }
                            disabled={processingAction}
                            className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Nonaktifkan
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (status === 'inactive') {
                                void updateStatus(student.id, 'active');
                              } else {
                                void registerStudents([student]);
                              }
                            }}
                            disabled={processingAction}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            {status === 'inactive'
                              ? 'Aktifkan Lagi'
                              : 'Daftarkan'}
                          </button>
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

      {confirmation && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quran-confirm-title"
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <h3
              id="quran-confirm-title"
              className="text-lg font-bold text-slate-900"
            >
              {confirmation.title}
            </h3>
            <p className="text-sm text-slate-600">
              {confirmation.message}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmation(null)}
                disabled={processingAction}
                className="px-4 py-2 rounded-xl text-sm text-slate-600 disabled:opacity-40"
              >
                Batal
              </button>
              <button
                onClick={() => void confirmation.action()}
                disabled={processingAction}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40"
              >
                {processingAction && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {processingAction ? 'Memproses...' : 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}