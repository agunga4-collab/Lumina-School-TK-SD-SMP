import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, Users, Search, CheckCircle2, XCircle, AlertCircle, 
  UserCheck, UserX, Loader2, ShieldAlert, CheckSquare, Square, Filter
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { db, getClasses, getActiveStudents } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { QuranParticipant, registerQuranParticipant, updateQuranParticipantStatus } from '../../services/quranService';
import { cn } from '../../lib/utils';

export default function QuranParticipantsPage() {
  const { profile } = useAuth();
  const { activeYear, isLoading: isYearLoading } = useAcademicYear();
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [participantsMap, setParticipantsMap] = useState<Record<string, QuranParticipant>>({});
  
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudentUids, setSelectedStudentUids] = useState<string[]>([]);
  const [processingAction, setProcessingAction] = useState<boolean>(false);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {}
  });

  // Verify access: Elementary teacher or Super Admin
  const isElementaryTeacherOrAdmin = useMemo(() => {
    if (!profile) return false;
    if (profile.role === 'SUPER_ADMIN') return true;
    if (profile.role === 'TEACHER' || profile.role === 'STAFF') {
      const units = profile.units || [];
      const primaryUnit = profile.unit;
      return units.includes('ELEMENTARY') || primaryUnit === 'ELEMENTARY';
    }
    return false;
  }, [profile]);

  useEffect(() => {
    if (!isElementaryTeacherOrAdmin) {
      setLoading(false);
      return;
    }
    if (isYearLoading || !activeYear) {
      setLoading(true);
      return;
    }
    loadData();
  }, [isElementaryTeacherOrAdmin, isYearLoading, activeYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      // 1. Fetch Elementary Classes
      let allClasses: any[] = [];
      try {
        allClasses = await getClasses();
      } catch (err: any) {
        console.error('[QuranParticipantsPage] Error calling getClasses (list /classes):', err);
        throw new Error(JSON.stringify({ operation: 'list', path: 'classes', original: err }));
      }

      const filteredClasses = allClasses.filter((c: any) => 
        (c.unit || '').toUpperCase() === 'ELEMENTARY' || 
        (c.name || '').toLowerCase().includes('elementary') ||
        (c.grade && Number(c.grade) >= 1 && Number(c.grade) <= 6)
      );
      setClasses(filteredClasses.length > 0 ? filteredClasses : allClasses);

      // 2. Fetch Active Students in Elementary using activeYear
      let allStudents: any[] = [];
      try {
        allStudents = await getActiveStudents('ALL', activeYear);
      } catch (err: any) {
        console.error('[QuranParticipantsPage] Error calling getActiveStudents (list /enrollments or /students):', err);
        throw new Error(JSON.stringify({ operation: 'list', path: 'enrollments / students', original: err }));
      }

      const elemStudents = allStudents.filter((s: any) => {
        const unit = (s.unit || '').toUpperCase();
        const grade = Number(s.grade || s.classGrade || 0);
        return unit === 'ELEMENTARY' || (grade >= 1 && grade <= 6);
      });
      setStudents(elemStudents);

      // 3. Fetch Quran Participants from Firestore
      let partSnapshot;
      try {
        partSnapshot = await getDocs(collection(db, 'elementary_quran_participants'));
      } catch (err: any) {
        console.error('[QuranParticipantsPage] Error fetching elementary_quran_participants (list /elementary_quran_participants):', err);
        throw new Error(JSON.stringify({ operation: 'list', path: 'elementary_quran_participants', original: err }));
      }

      const pMap: Record<string, QuranParticipant> = {};
      partSnapshot.forEach(docSnap => {
        pMap[docSnap.id] = docSnap.data() as QuranParticipant;
      });
      setParticipantsMap(pMap);
    } catch (err: any) {
      console.error('Error loading Sahabat Quran data:', err);
      let parsedPath = 'elementary_quran_participants';
      let parsedOp = 'list';
      try {
        if (err.message && err.message.startsWith('{')) {
          const info = JSON.parse(err.message);
          parsedPath = info.path || 'elementary_quran_participants';
        }
      } catch (e) {}

      if (parsedPath.includes('permission') || (err.message && err.message.includes('Missing or insufficient permissions'))) {
        toast.error('Kamu belum memiliki izin untuk melihat data ini. Hubungi admin.');
      } else {
        toast.error(`Gagal memuat data peserta Sahabat Qur'an (${parsedPath})`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Filtered students based on class and search
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchesClass = selectedClassId === 'all' || s.classId === selectedClassId || s.className === selectedClassId;
      const matchesSearch = (s.name || s.fullName || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesClass && matchesSearch;
    });
  }, [students, selectedClassId, searchQuery]);

  // Active participants count per class summary
  const activeCountByClass = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(participantsMap).forEach(p => {
      if (p.status === 'active' && p.classId) {
        counts[p.classId] = (counts[p.classId] || 0) + 1;
      }
    });
    return counts;
  }, [participantsMap]);

  const totalActiveCount = useMemo(() => {
    return Object.values(participantsMap).filter(p => p.status === 'active').length;
  }, [participantsMap]);

  const handleToggleSelectAll = () => {
    if (selectedStudentUids.length === filteredStudents.length) {
      setSelectedStudentUids([]);
    } else {
      setSelectedStudentUids(filteredStudents.map(s => s.id || s.uid));
    }
  };

  const handleSelectStudent = (id: string) => {
    setSelectedStudentUids(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleRegisterSingle = async (student: any) => {
    const sId = student.id || student.uid;
    const sName = student.name || student.fullName || 'Siswa';
    const cId = student.classId || '';
    const cName = student.className || '';

    try {
      setProcessingAction(true);
      await registerQuranParticipant(sId, sName, cId, cName, profile?.uid || 'teacher');
      setParticipantsMap(prev => ({
        ...prev,
        [sId]: {
          studentUid: sId,
          studentName: sName,
          classId: cId,
          className: cName,
          unit: 'ELEMENTARY',
          status: 'active',
          registeredByUid: profile?.uid || 'teacher'
        }
      }));
      toast.success(`Berhasil mendaftarkan ${sName} ke Sahabat Qur'an`);
    } catch (err) {
      console.error('Error registering participant:', err);
      toast.error('Gagal mendaftarkan peserta');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleUpdateStatusSingle = async (studentUid: string, newStatus: 'active' | 'inactive') => {
    try {
      setProcessingAction(true);
      await updateQuranParticipantStatus(studentUid, newStatus, profile?.uid || 'teacher');
      setParticipantsMap(prev => ({
        ...prev,
        [studentUid]: {
          ...prev[studentUid],
          status: newStatus
        }
      }));
      toast.success(`Status peserta berhasil diubah menjadi ${newStatus === 'active' ? 'Aktif' : 'Nonaktif'}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Gagal mengubah status peserta');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleBulkRegister = async (uidsToRegister: any[]) => {
    if (uidsToRegister.length === 0) {
      toast.info('Tidak ada siswa yang dipilih');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Pendaftaran Massal',
      message: `Apakah kamu yakin ingin mendaftarkan ${uidsToRegister.length} siswa terpilih ke Sahabat Qur'an?`,
      action: async () => {
        try {
          setProcessingAction(true);
          const newMap = { ...participantsMap };
          for (const s of uidsToRegister) {
            const sId = s.id || s.uid;
            const sName = s.name || s.fullName || 'Siswa';
            const cId = s.classId || '';
            const cName = s.className || '';
            
            await registerQuranParticipant(sId, sName, cId, cName, profile?.uid || 'teacher');
            newMap[sId] = {
              studentUid: sId,
              studentName: sName,
              classId: cId,
              className: cName,
              unit: 'ELEMENTARY',
              status: 'active',
              registeredByUid: profile?.uid || 'teacher'
            };
          }
          setParticipantsMap(newMap);
          setSelectedStudentUids([]);
          toast.success(`Berhasil mendaftarkan ${uidsToRegister.length} siswa.`);
        } catch (err) {
          console.error('Bulk register error:', err);
          toast.error('Gagal melakukan pendaftaran massal');
        } finally {
          setProcessingAction(false);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleRegisterAllInClass = () => {
    const unregisteredInFiltered = filteredStudents.filter(s => {
      const p = participantsMap[s.id || s.uid];
      return !p || p.status !== 'active';
    });

    if (unregisteredInFiltered.length === 0) {
      toast.info('Semua siswa di kelas ini sudah terdaftar dan aktif.');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Daftarkan Semua di Kelas Ini',
      message: `Apakah kamu yakin ingin mendaftarkan ${unregisteredInFiltered.length} siswa yang belum aktif di kelas ini?`,
      action: async () => {
        try {
          setProcessingAction(true);
          const newMap = { ...participantsMap };
          for (const s of unregisteredInFiltered) {
            const sId = s.id || s.uid;
            const sName = s.name || s.fullName || 'Siswa';
            const cId = s.classId || '';
            const cName = s.className || '';
            
            await registerQuranParticipant(sId, sName, cId, cName, profile?.uid || 'teacher');
            newMap[sId] = {
              studentUid: sId,
              studentName: sName,
              classId: cId,
              className: cName,
              unit: 'ELEMENTARY',
              status: 'active',
              registeredByUid: profile?.uid || 'teacher'
            };
          }
          setParticipantsMap(newMap);
          toast.success(`Berhasil mendaftarkan ${unregisteredInFiltered.length} siswa.`);
        } catch (err) {
          console.error('Register all error:', err);
          toast.error('Gagal mendaftarkan semua siswa');
        } finally {
          setProcessingAction(false);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  if (!isElementaryTeacherOrAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 shadow-sm">
          <ShieldAlert className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-amber-900 mb-2">Akses Terbatas</h2>
          <p className="text-amber-700">Halaman ini khusus untuk Guru Unit Elementary dan Super Admin.</p>
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-700 rounded-2xl p-6 md:p-8 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-700/60 px-3 py-1 rounded-full text-xs font-medium text-emerald-100 mb-3">
              <BookOpen className="w-3.5 h-3.5" />
              Portal Guru Elementary
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">Peserta Sahabat Qur'an</h1>
            <p className="text-emerald-100 mt-1 max-w-2xl text-sm md:text-base">
              Kelola partisipasi siswa unit Elementary dalam program pencatatan bacaan Al-Qur'an harian.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-5 py-4 rounded-xl border border-white/20 text-center">
            <span className="block text-3xl font-extrabold text-emerald-200">{totalActiveCount}</span>
            <span className="text-xs text-emerald-100 font-medium">Total Peserta Aktif</span>
          </div>
        </div>
      </div>

      {/* Filter & Action Bar */}
      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Class Filter */}
          <div className="w-full sm:w-64">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Semua Kelas Elementary</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {activeCountByClass[c.id] ? `(${activeCountByClass[c.id]} aktif)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Cari nama siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Bulk Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          <button
            onClick={handleRegisterAllInClass}
            disabled={processingAuthor(processingAction)}
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Daftarkan Semua di Kelas Ini
          </button>
          
          <button
            onClick={() => {
              const selectedStudentsList = filteredStudents.filter(s => selectedStudentUids.includes(s.id || s.uid));
              handleBulkRegister(selectedStudentsList);
            }}
            disabled={selectedStudentUids.length === 0 || processingAction}
            className={cn(
              "px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2",
              selectedStudentUids.length > 0 
                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm" 
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            <UserCheck className="w-4 h-4" />
            Daftarkan yang Dipilih ({selectedStudentUids.length})
          </button>
        </div>
      </div>

      {/* Students Table / List Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="py-4 px-4 sm:px-6 w-12 text-center">
                  <button onClick={handleToggleSelectAll} className="text-slate-400 hover:text-slate-600">
                    {selectedStudentUids.length > 0 && selectedStudentUids.length === filteredStudents.length ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-4 px-4 sm:px-6">Nama Siswa</th>
                <th className="py-4 px-4 sm:px-6">Kelas</th>
                <th className="py-4 px-4 sm:px-6">Status Partisipasi</th>
                <th className="py-4 px-4 sm:px-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Tidak ada siswa yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const sId = student.id || student.uid;
                  const participant = participantsMap[sId];
                  const status = participant ? participant.status : 'unregistered';
                  const isSelected = selectedStudentUids.includes(sId);

                  return (
                    <tr key={sId} className={cn("hover:bg-slate-50/50 transition", isSelected && "bg-emerald-50/30")}>
                      <td className="py-4 px-4 sm:px-6 text-center">
                        <button onClick={() => handleSelectStudent(sId)} className="text-slate-400 hover:text-slate-600">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                        {student.name || student.fullName}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-slate-600 font-medium">
                        {student.className || student.classId || '-'}
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        {status === 'active' && (
                          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Peserta Aktif
                          </span>
                        )}
                        {status === 'inactive' && (
                          <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            Nonaktif
                          </span>
                        )}
                        {status === 'unregistered' && (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            Belum terdaftar
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        {status === 'unregistered' && (
                          <button
                            onClick={() => handleRegisterSingle(student)}
                            disabled={processingAction}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Daftarkan
                          </button>
                        )}
                        {status === 'active' && (
                          <button
                            onClick={() => handleUpdateStatusSingle(sId, 'inactive')}
                            disabled={processingAction}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5"
                          >
                            <UserX className="w-3.5 h-3.5 text-slate-500" />
                            Nonaktifkan
                          </button>
                        )}
                        {status === 'inactive' && (
                          <button
                            onClick={() => handleUpdateStatusSingle(sId, 'active')}
                            disabled={processingAction}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 border border-emerald-200"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Aktifkan lagi
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

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">{confirmModal.title}</h3>
            <p className="text-sm text-slate-600">{confirmModal.message}</p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button
                onClick={confirmModal.action}
                disabled={processingAction}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function processingAuthor(processingAction: boolean) {
  return processingAction;
}
