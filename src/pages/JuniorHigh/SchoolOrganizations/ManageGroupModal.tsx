import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  Settings2,
  Users,
  Shield,
  UserCheck,
  Search,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { AppUser, Student } from '../../../types';
import { SOGroup } from '../../../types/schoolOrganizations';
import {
  saveGroup,
  getJuniorHighEligibleTeachers,
  JuniorHighTeacherOption,
  getJuniorHighClasses,
  getJuniorHighAllStudents
} from '../../../services/juniorHighSchoolOrganizationsService';

interface ManageGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: SOGroup;
  teachers: AppUser[];
  allStudents?: Student[];
  userEmail: string;
  onSuccess: () => void;
}

export const ManageGroupModal: React.FC<ManageGroupModalProps> = ({
  isOpen,
  onClose,
  group,
  teachers: initialTeachers,
  allStudents: initialAllStudents = [],
  userEmail,
  onSuccess,
}) => {
  const [description, setDescription] = useState<string>(group.description || '');
  const [selectedMentorUids, setSelectedMentorUids] = useState<string[]>(group.mentorUids || []);
  const [coordinatorId, setCoordinatorId] = useState<string>(group.studentCoordinatorId || '');
  const [quota, setQuota] = useState<number | undefined>(group.quota);
  const [isSaving, setIsSaving] = useState(false);

  // Teacher states
  const [teachersList, setTeachersList] = useState<JuniorHighTeacherOption[]>(
    (initialTeachers as JuniorHighTeacherOption[]) || []
  );
  const [isLoadingTeachers, setIsLoadingTeachers] = useState<boolean>(false);
  const [teacherSearch, setTeacherSearch] = useState<string>('');

  // Student states for coordinator
  const [studentsList, setStudentsList] = useState<Student[]>(initialAllStudents);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [coordinatorSearch, setCoordinatorSearch] = useState<string>('');

  // Load teachers if not passed or empty
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const loadTeachers = async () => {
      if (initialTeachers && initialTeachers.length > 0) {
        setTeachersList(initialTeachers as JuniorHighTeacherOption[]);
        return;
      }
      setIsLoadingTeachers(true);
      try {
        const list = await getJuniorHighEligibleTeachers();
        if (!isCancelled) {
          setTeachersList(list);
        }
      } catch (err: any) {
        console.error('Gagal memuat guru:', err);
      } finally {
        if (!isCancelled) setIsLoadingTeachers(false);
      }
    };

    loadTeachers();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, initialTeachers]);

  // Load students for coordinator if empty
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const loadStudents = async () => {
      if (initialAllStudents && initialAllStudents.length > 0) {
        setStudentsList(initialAllStudents);
        return;
      }
      setIsLoadingStudents(true);
      try {
        const jhClasses = await getJuniorHighClasses(group.academicYear);
        const { students } = await getJuniorHighAllStudents(jhClasses, group.academicYear);
        if (!isCancelled) {
          setStudentsList(students);
        }
      } catch (err) {
        console.error('Gagal memuat siswa untuk koordinator:', err);
      } finally {
        if (!isCancelled) setIsLoadingStudents(false);
      }
    };

    loadStudents();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, initialAllStudents, group.academicYear]);

  // Filter teachers by search query
  const filteredTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return teachersList;
    const q = teacherSearch.toLowerCase().trim();
    return teachersList.filter(t => {
      const name = (t.displayName || (t as any).name || '').toLowerCase();
      const email = (t.email || '').toLowerCase();
      const role = (t.role || '').toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [teachersList, teacherSearch]);

  // Filter students for coordinator
  const filteredStudentsForCoordinator = useMemo(() => {
    if (!coordinatorSearch.trim()) return studentsList;
    const q = coordinatorSearch.toLowerCase().trim();
    return studentsList.filter(s => {
      const name = (s.name || '').toLowerCase();
      const idStr = (s.id || '').toLowerCase();
      const className = ((s as any).className || '').toLowerCase();
      return name.includes(q) || idStr.includes(q) || className.includes(q);
    });
  }, [studentsList, coordinatorSearch]);

  if (!isOpen) return null;

  const handleToggleMentor = (uid: string) => {
    setSelectedMentorUids(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const mentorNames = selectedMentorUids.map(uid => {
        const found = teachersList.find(t => t.uid === uid || t.id === uid);
        return found?.displayName || (found as any)?.name || found?.email || 'Guru';
      });

      let coordName = '';
      if (coordinatorId) {
        const foundStudent = studentsList.find(s => s.id === coordinatorId);
        coordName = foundStudent?.name || '';
      }

      await saveGroup(
        {
          id: group.id,
          academicYear: group.academicYear,
          programType: group.programType,
          name: group.name,
          categoryOrSubtype: group.categoryOrSubtype,
          description: description.trim(),
          mentorUids: selectedMentorUids,
          mentorNames: mentorNames,
          studentCoordinatorId: coordinatorId,
          studentCoordinatorName: coordName,
          quota: quota ? Number(quota) : undefined,
          status: group.status || 'active'
        },
        userEmail
      );

      toast.success(`Pengaturan tim ${group.name} berhasil disimpan`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving group:', err);
      toast.error(`Gagal menyimpan pengaturan tim: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'HEAD_UNIT':
      case 'HEAD_JUNIOR':
        return 'Head Unit';
      case 'HOMEROOM_TEACHER':
        return 'Wali Kelas';
      case 'COORDINATOR':
        return 'Koordinator';
      default:
        return 'Guru';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Kelola Tim: {group.name}</h2>
              <p className="text-xs text-slate-300">
                Atur pembina guru (mentor), koordinator siswa, dan deskripsi kegiatan.
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

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Deskripsi */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Deskripsi & Fokus Kegiatan
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Jelaskan peran, tanggung jawab, dan agenda kerja tim ini..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          {/* Quota for SWJ */}
          {group.programType === 'SWJ' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Kapasitas / Kuota Siswa Relawan
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={quota || ''}
                onChange={e => setQuota(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Misal: 6"
                className="w-32 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
          )}

          {/* Pembina Guru (Multi-select) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-blue-600" />
                Pembina / Mentor Guru ({isLoadingTeachers ? 'Memuat...' : `${selectedMentorUids.length} dipilih dari ${teachersList.length} guru`})
              </label>
            </div>

            {/* Teacher Search Bar */}
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Cari guru berdasarkan nama atau email..."
                value={teacherSearch}
                onChange={e => setTeacherSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>

            <div className="border border-gray-200 rounded-xl p-3 max-h-52 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50/50">
              {isLoadingTeachers ? (
                <div className="col-span-2 py-6 text-center">
                  <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mx-auto mb-1" />
                  <p className="text-xs text-gray-500">Memuat daftar guru Junior High...</p>
                </div>
              ) : filteredTeachers.length === 0 ? (
                <div className="col-span-2 py-6 text-center text-xs text-gray-400">
                  {teacherSearch.trim()
                    ? 'Tidak ada guru yang sesuai pencarian.'
                    : 'Belum ada guru Junior High aktif yang ditemukan.'}
                </div>
              ) : (
                filteredTeachers.map(teacher => {
                  const uid = teacher.uid || teacher.id;
                  const isSelected = selectedMentorUids.includes(uid);
                  const isUnknownUnit =
                    teacher.unitStatus === 'UNKNOWN' ||
                    (!teacher.unitId && !(teacher as any).unit);

                  return (
                    <label
                      key={uid}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/90 border-blue-400 text-blue-950 font-medium'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleMentor(uid)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-semibold text-gray-800">
                          {teacher.displayName || (teacher as any).name || teacher.email}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-medium border border-indigo-100">
                            {getRoleBadge(teacher.role)}
                          </span>
                          {isUnknownUnit ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Unit belum diset
                            </span>
                          ) : teacher.unitId === 'ALL' || (teacher as any).unit === 'ALL' ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600">
                              Semua Unit
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-600">
                              JH
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Koordinator Siswa */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                Koordinator Siswa (Opsional)
              </label>
              {coordinatorId && (
                <button
                  type="button"
                  onClick={() => setCoordinatorId('')}
                  className="text-[11px] text-red-600 hover:underline"
                >
                  Hapus koordinator
                </button>
              )}
            </div>

            {/* Quick search if many students */}
            {studentsList.length > 10 && (
              <div className="relative mb-1.5">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Saring nama atau kelas siswa..."
                  value={coordinatorSearch}
                  onChange={e => setCoordinatorSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
            )}

            <select
              value={coordinatorId}
              onChange={e => setCoordinatorId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">-- Belum Ada Koordinator Siswa --</option>
              {isLoadingStudents ? (
                <option disabled>Memuat daftar siswa...</option>
              ) : (
                filteredStudentsForCoordinator.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.name} ({(student as any).className || 'Junior High'} • NIS: {student.id})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-100"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Simpan Perubahan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
