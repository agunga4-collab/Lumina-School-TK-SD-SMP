import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  UserPlus,
  AlertCircle,
  Check,
  Users,
  Loader2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, Class } from '../../../types';
import { SOGroup } from '../../../types/schoolOrganizations';
import {
  saveMembership,
  getJuniorHighClasses,
  getJuniorHighActiveStudentsForClass,
  getJuniorHighAllStudents
} from '../../../services/juniorHighSchoolOrganizationsService';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: SOGroup;
  classes: Class[];
  allStudents?: Student[];
  existingStudentIds: string[];
  currentMemberCount: number;
  userEmail: string;
  onSuccess: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  group,
  classes: initialClasses,
  allStudents: initialAllStudents = [],
  existingStudentIds,
  currentMemberCount,
  userEmail,
  onSuccess,
}) => {
  const [classesList, setClassesList] = useState<Class[]>(initialClasses);
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [roleTitle, setRoleTitle] = useState<string>(() => {
    if (group.programType === 'OSIS') return 'Anggota';
    if (group.programType === 'SWJ') return 'Anggota Tim';
    return 'Peserta Lomba';
  });
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Loading & error state
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>(initialAllStudents);

  // Suggested roles
  const suggestedRoles = useMemo(() => {
    if (group.programType === 'OSIS') {
      if (group.categoryOrSubtype === 'EXECUTIVE') {
        return ['Presiden OSIS', 'Wakil Presiden OSIS', 'Sekretaris', 'Bendahara', 'Koordinator Divisi'];
      }
      return ['Captain Team', 'Wakil Captain', 'Sekretaris Tim', 'Anggota'];
    }
    if (group.programType === 'SWJ') {
      return ['Koordinator Siswa', 'Anggota Tim'];
    }
    return ['Ketua Tim', 'Peserta Lomba', 'Anggota Tim'];
  }, [group.programType, group.categoryOrSubtype]);

  // Load / refresh classes if not provided or empty
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const checkClasses = async () => {
      if (initialClasses && initialClasses.length > 0) {
        setClassesList(initialClasses);
        return;
      }
      try {
        const loaded = await getJuniorHighClasses(group.academicYear);
        if (!isCancelled) {
          setClassesList(loaded);
        }
      } catch (err: any) {
        console.error('Gagal memuat kelas Junior High:', err);
      }
    };

    checkClasses();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, initialClasses, group.academicYear]);

  // Load students based on selectedClassId and academicYear
  const fetchStudents = useCallback(async () => {
    if (!isOpen) return;
    setIsLoadingStudents(true);
    setLoadError(null);

    try {
      if (selectedClassId === 'ALL') {
        // Lintas kelas: ambil seluruh kelas Junior High aktif pada tahun ajaran ini
        let targetClasses = classesList;
        if (!targetClasses || targetClasses.length === 0) {
          targetClasses = await getJuniorHighClasses(group.academicYear);
          setClassesList(targetClasses);
        }

        if (targetClasses.length === 0) {
          setStudents([]);
          setIsLoadingStudents(false);
          return;
        }

        const { students: allJhStudents, errors } = await getJuniorHighAllStudents(
          targetClasses,
          group.academicYear
        );

        if (errors.length > 0 && allJhStudents.length === 0) {
          setLoadError(errors.join('; '));
        }
        setStudents(allJhStudents);
      } else {
        // Ambil siswa untuk kelas terpilih secara spesifik
        const targetClass = classesList.find(c => c.id === selectedClassId);
        const classStudents = await getJuniorHighActiveStudentsForClass(
          selectedClassId,
          group.academicYear,
          targetClass
        );

        const mapped = classStudents.map(s => ({
          ...s,
          classId: selectedClassId,
          className: targetClass?.name || (s as any).className || 'Junior High'
        }));
        setStudents(mapped);
      }
    } catch (err: any) {
      console.error('Error fetching students in AddMemberModal:', err);
      setLoadError(err.message || 'Gagal memuat data siswa dari server');
    } finally {
      setIsLoadingStudents(false);
    }
  }, [isOpen, selectedClassId, classesList, group.academicYear]);

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
  }, [isOpen, selectedClassId, fetchStudents]);

  // Filter students by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) {
      return students;
    }
    const q = searchQuery.toLowerCase().trim();
    return students.filter(s => {
      const name = (s.name || '').toLowerCase();
      const idStr = (s.id || '').toLowerCase();
      const nisn = ((s as any).nisn || '').toLowerCase();
      const nis = ((s as any).nis || '').toLowerCase();
      const className = ((s as any).className || '').toLowerCase();
      return (
        name.includes(q) ||
        idStr.includes(q) ||
        nisn.includes(q) ||
        nis.includes(q) ||
        className.includes(q)
      );
    });
  }, [students, searchQuery]);

  if (!isOpen) return null;

  const isQuotaExceeded = group.quota !== undefined && group.quota > 0 && currentMemberCount >= group.quota;

  const handleSave = async () => {
    if (!selectedStudent) {
      toast.error('Pilih siswa terlebih dahulu');
      return;
    }
    if (!roleTitle.trim()) {
      toast.error('Peran / jabatan siswa tidak boleh kosong');
      return;
    }

    setIsSaving(true);
    try {
      const foundClass = classesList.find(c => c.id === selectedStudent.classId);
      const resolvedClassName =
        (selectedStudent as any).className || foundClass?.name || 'Junior High';

      await saveMembership(
        {
          groupId: group.id,
          academicYear: group.academicYear,
          programType: group.programType,
          studentId: selectedStudent.id,
          studentName: selectedStudent.name,
          classId: selectedStudent.classId || '',
          className: resolvedClassName,
          roleTitle: roleTitle.trim(),
          joinedAt: new Date().toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          status: 'ACTIVE',
          notes: notes.trim()
        },
        userEmail
      );

      toast.success(`${selectedStudent.name} berhasil ditambahkan ke ${group.name}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error adding member:', err);
      toast.error(`Gagal menambahkan anggota: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Tambah Anggota: {group.name}</h2>
              <p className="text-xs text-blue-100">
                Pilih siswa Junior High untuk dimasukkan ke dalam keanggotaan aktif tahun {group.academicYear}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quota Warning banner if applicable */}
        {isQuotaExceeded && (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-amber-800 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              <strong>Perhatian Kuota:</strong> Anggota saat ini ({currentMemberCount}) sudah mencapai atau melebihi kuota ({group.quota}). Menambahkan siswa baru akan melampaui kapasitas.
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Filter Kelas ({classesList.length} kelas Junior High)
              </label>
              <select
                value={selectedClassId}
                onChange={e => {
                  setSelectedClassId(e.target.value);
                  setSelectedStudent(null);
                }}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">Semua Kelas Junior High (Lintas Kelas)</option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Cari Nama, NIS, atau Kelas
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Ketik nama atau NIS siswa..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Error Message Box */}
          {loadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Gagal memuat data siswa</p>
                <p className="text-red-700 mt-0.5">{loadError}</p>
              </div>
              <button
                type="button"
                onClick={fetchStudents}
                className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-medium rounded-lg text-xs flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Coba Lagi
              </button>
            </div>
          )}

          {/* Student Picker List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Pilih Siswa ({isLoadingStudents ? 'Memuat...' : `${filteredStudents.length} ditemukan`})
              </label>
              {selectedStudent && (
                <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Terpilih: {selectedStudent.name}
                </span>
              )}
            </div>

            <div className="border border-gray-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-gray-100 bg-gray-50/50">
              {isLoadingStudents ? (
                <div className="p-8 text-center space-y-2">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
                  <p className="text-xs text-gray-500 font-medium">
                    Memuat daftar siswa aktif Junior High ({group.academicYear})...
                  </p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 space-y-1">
                  <p className="font-semibold text-gray-700">Tidak ada siswa yang ditemukan</p>
                  <p className="text-gray-400">
                    {searchQuery.trim()
                      ? 'Tidak ada siswa yang cocok dengan kata kunci pencarian.'
                      : classesList.length === 0
                      ? `Belum ada kelas Junior High yang terdaftar pada tahun ajaran ${group.academicYear}.`
                      : `Tidak ada siswa aktif yang terdaftar pada ${selectedClassId === 'ALL' ? 'seluruh kelas Junior High' : 'kelas terpilih'} untuk tahun ajaran ${group.academicYear}.`}
                  </p>
                </div>
              ) : (
                filteredStudents.map(student => {
                  const isAlreadyMember = existingStudentIds.includes(student.id);
                  const isSelected = selectedStudent?.id === student.id;
                  const studentClass = classesList.find(c => c.id === student.classId);
                  const classNameDisplay =
                    (student as any).className || studentClass?.name || 'Junior High';

                  return (
                    <button
                      type="button"
                      key={student.id}
                      disabled={isAlreadyMember}
                      onClick={() => setSelectedStudent(student)}
                      className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between transition-colors ${
                        isAlreadyMember
                          ? 'opacity-50 bg-gray-100/60 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-50/90 border-l-4 border-blue-600'
                          : 'hover:bg-white bg-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {(student.name || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">
                            {student.name}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            NIS: {student.id} {student.nisn ? `• NISN: ${student.nisn}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                          {classNameDisplay}
                        </span>
                        {isAlreadyMember && (
                          <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-md">
                            Sudah Bergabung
                          </span>
                        )}
                        {isSelected && !isAlreadyMember && (
                          <span className="text-blue-600 font-bold text-xs flex items-center gap-0.5">
                            <Check className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Status Footer info */}
            {!isLoadingStudents && (
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-400 px-1">
                <span>
                  Ditemukan {classesList.length} kelas dan {students.length} siswa aktif
                </span>
                {searchQuery.trim() && (
                  <span>Menampilkan {filteredStudents.length} hasil pencarian</span>
                )}
              </div>
            )}
          </div>

          {/* Form Role & Notes */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Peran / Jabatan Siswa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={roleTitle}
                onChange={e => setRoleTitle(e.target.value)}
                placeholder="Misal: Anggota, Koordinator, dsb."
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {/* Saran peran cepat */}
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="text-[11px] text-gray-400 self-center">Pilihan:</span>
                {suggestedRoles.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRoleTitle(role)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      roleTitle === role
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Catatan Tambahan (Opsional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Catatan penugasan khusus, minat, atau peran..."
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {selectedStudent ? (
              <span className="text-gray-700 font-medium">
                Siswa: <strong>{selectedStudent.name}</strong> ({roleTitle || 'Tanpa Peran'})
              </span>
            ) : (
              <span>Pilih siswa dari daftar di atas</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !selectedStudent || !roleTitle.trim()}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" /> Tambahkan Anggota
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
