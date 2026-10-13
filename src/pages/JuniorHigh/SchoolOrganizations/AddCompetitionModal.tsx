import React, { useState, useEffect, useMemo } from 'react';
import { X, Trophy, Save, Plus, Calendar, Shield, Search, Loader2 } from 'lucide-react';
import { collection, doc } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '../../../lib/firebase';
import { AppUser } from '../../../types';
import {
  saveGroup,
  getJuniorHighEligibleTeachers,
  JuniorHighTeacherOption
} from '../../../services/juniorHighSchoolOrganizationsService';

interface AddCompetitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  academicYear: string;
  stages: string[];
  teachers: AppUser[];
  userEmail: string;
  onSuccess: () => void;
}

const CATEGORIES = [
  'Sains & Matematika',
  'Bahasa & Debat',
  'Teknologi & Robotik',
  'Seni & Desain',
  'Olahraga & Bela Diri',
  'Keagamaan & Tahfidz',
  'Literasi & Esai',
  'Lainnya'
];

export const AddCompetitionModal: React.FC<AddCompetitionModalProps> = ({
  isOpen,
  onClose,
  academicYear,
  stages,
  teachers: initialTeachers,
  userEmail,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [organizer, setOrganizer] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMentorUids, setSelectedMentorUids] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Teachers state & search
  const [teachersList, setTeachersList] = useState<JuniorHighTeacherOption[]>(
    (initialTeachers as JuniorHighTeacherOption[]) || []
  );
  const [isLoadingTeachers, setIsLoadingTeachers] = useState<boolean>(false);
  const [teacherSearch, setTeacherSearch] = useState<string>('');

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

  if (!isOpen) return null;

  const handleToggleMentor = (uid: string) => {
    setSelectedMentorUids(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
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

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nama lomba / kompetisi tidak boleh kosong');
      return;
    }

    setIsSaving(true);
    try {
      const autoId = doc(collection(db, 'jh_so_groups')).id;
      const initialStage = stages[0] || 'Info';
      const mentorNames = selectedMentorUids.map(uid => {
        const found = teachersList.find(t => t.uid === uid || t.id === uid);
        return found?.displayName || (found as any)?.name || found?.email || 'Guru';
      });

      await saveGroup(
        {
          id: autoId,
          academicYear,
          programType: 'COMPETITION',
          name: name.trim(),
          categoryOrSubtype: category,
          description: description.trim(),
          organizer: organizer.trim(),
          targetDate: targetDate || '',
          mentorUids: selectedMentorUids,
          mentorNames,
          currentStage: initialStage,
          status: 'active'
        },
        userEmail
      );

      toast.success(`Kompetisi ${name.trim()} berhasil dibuat`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating competition:', err);
      toast.error(`Gagal membuat kompetisi: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-purple-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Tambah Lomba / Kompetisi Baru</h2>
              <p className="text-xs text-purple-100">
                Pencatatan delegasi lomba siswa Junior High tahun {academicYear}.
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

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Nama Lomba */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nama Lomba / Kompetisi <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: OSN Matematika SMP, Lomba Debat Bahasa Inggris..."
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
            />
          </div>

          {/* Bidang & Penyelenggara */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Bidang / Kategori
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Penyelenggara
              </label>
              <input
                type="text"
                placeholder="Contoh: Kemendikbudristek, Universitas..."
                value={organizer}
                onChange={e => setOrganizer(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
              />
            </div>
          </div>

          {/* Target Tanggal */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-purple-600" />
              Perkiraan Tanggal Pelaksanaan
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="w-full sm:w-60 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
            />
          </div>

          {/* Deskripsi */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Keterangan / Persyaratan Lomba
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Informasi ketentuan lomba, tautan juknis, atau target capaian..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
            />
          </div>

          {/* Pembimbing / Mentor Guru */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-purple-600" />
                Guru Pembimbing ({isLoadingTeachers ? 'Memuat...' : `${selectedMentorUids.length} dipilih dari ${teachersList.length} guru`})
              </label>
            </div>

            {/* Teacher Search */}
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Cari guru pembimbing..."
                value={teacherSearch}
                onChange={e => setTeacherSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white"
              />
            </div>

            <div className="border border-gray-200 rounded-xl p-3 max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50/50">
              {isLoadingTeachers ? (
                <div className="col-span-2 py-4 text-center">
                  <Loader2 className="w-5 h-5 text-purple-600 animate-spin mx-auto mb-1" />
                  <p className="text-xs text-gray-500">Memuat guru Junior High...</p>
                </div>
              ) : filteredTeachers.length === 0 ? (
                <div className="col-span-2 py-4 text-center text-xs text-gray-400">
                  Tidak ada guru yang sesuai pencarian.
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
                          ? 'bg-purple-50 border-purple-400 text-purple-900 font-medium'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleMentor(uid)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-semibold text-gray-800">
                          {teacher.displayName || (teacher as any).name || teacher.email}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-medium border border-purple-100">
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
            disabled={isSaving || !name.trim()}
            className="px-5 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Buat Lomba
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
