import * as React from 'react';
import { X, Search, Check, AlertCircle, Shield, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getActiveStudents } from '../../../lib/firebase';
import {
  assignElemSnStudent,
  removeElemSnStudent,
  fetchElemSnStudentsForClass
} from '../../../services/elementarySnMidtermService';
import type { Class, Student, User } from '../../../types';
import type { ElementarySnStudentDoc } from '../../../types/elementaryMidtermSnReport';

interface ManageSnStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClass: Class;
  academicYear: string;
  currentUser: User;
  onRefresh: () => Promise<void>;
}

export const ManageSnStudentsModal: React.FC<ManageSnStudentsModalProps> = ({
  isOpen,
  onClose,
  selectedClass,
  academicYear,
  currentUser,
  onRefresh
}) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [classStudents, setClassStudents] = React.useState<Student[]>([]);
  const [snStudentsMap, setSnStudentsMap] = React.useState<Record<string, ElementarySnStudentDoc>>({});
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  const loadData = React.useCallback(async () => {
    if (!selectedClass?.id || !academicYear) {
      setClassStudents([]);
      setSnStudentsMap({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const cId = selectedClass.id.trim();
      const aYear = academicYear.trim();

      const [allStudents, snDocs] = await Promise.all([
        getActiveStudents(cId, aYear),
        fetchElemSnStudentsForClass(cId, aYear)
      ]);

      setClassStudents(allStudents || []);

      const map: Record<string, ElementarySnStudentDoc> = {};
      (snDocs || []).forEach((doc) => {
        if (doc && doc.studentId && doc.isSN) {
          map[doc.studentId] = doc;
        }
      });
      setSnStudentsMap(map);
    } catch (err: any) {
      console.error('[ManageSnStudentsModal] loadData error:', {
        classId: selectedClass?.id,
        academicYear
      }, err);
      toast.error('Gagal memuat daftar siswa kelas: ' + (err.message || 'Error'));
    } finally {
      setLoading(false);
    }
  }, [selectedClass?.id, academicYear]);

  React.useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const filteredStudents = classStudents.filter((student) =>
    (student?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    ((student as any)?.nisn || (student as any)?.nis || '').includes(searchQuery)
  );

  const handleToggleSn = async (student: Student) => {
    if (!student?.id || !selectedClass?.id || !currentUser?.uid) {
      toast.error('Data siswa atau kelas tidak lengkap.');
      return;
    }

    const isCurrentlySn = !!snStudentsMap[student.id];
    setSavingId(student.id);
    try {
      if (isCurrentlySn) {
        await removeElemSnStudent(student.id, selectedClass.id);
        const updated = { ...snStudentsMap };
        delete updated[student.id];
        setSnStudentsMap(updated);
        toast.success(`Status SN untuk ${student.name} berhasil dihapus.`);
      } else {
        await assignElemSnStudent(student, selectedClass, academicYear, currentUser);
        const newDoc: ElementarySnStudentDoc = {
          id: `${student.id}_${selectedClass.id}`,
          studentId: student.id,
          studentName: student.name || 'Siswa',
          nisn: (student as any).nisn || (student as any).nis || '',
          classId: selectedClass.id,
          className: selectedClass.name || '',
          academicYear,
          isSN: true,
          assignedAt: Date.now(),
          assignedBy: currentUser.uid,
          assignedByName: currentUser.displayName || currentUser.name || 'Admin',
          updatedAt: Date.now()
        };
        setSnStudentsMap((prev) => ({ ...prev, [student.id]: newDoc }));
        toast.success(`${student.name} berhasil ditetapkan sebagai Siswa SN.`);
      }
      await onRefresh();
    } catch (err: any) {
      console.error('[ManageSnStudentsModal] toggle error:', err);
      toast.error('Gagal mengubah status SN: ' + (err.message || 'Error'));
    } finally {
      setSavingId(null);
    }
  };

  const snCount = Object.keys(snStudentsMap).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Kelola Status Siswa SN (Special Needs)
              </h3>
              <p className="text-xs text-slate-500">
                Kelas: <span className="font-bold text-slate-700">{selectedClass.name}</span> ({academicYear})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Info Banner */}
        <div className="p-6 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Cari nama siswa atau NISN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-xs focus:ring-2 focus:ring-amber-500 outline-hidden font-medium"
              />
            </div>
            <div className="px-3.5 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold shrink-0">
              {snCount} Siswa SN Ditetapkan
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Hanya Admin yang dapat menandai atau menghapus status SN siswa. Siswa yang ditandai SN akan memiliki Rapor Midterm SN khusus yang terisolasi total dari rapor reguler.
            </p>
          </div>
        </div>

        {/* Students List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 size={24} className="animate-spin text-amber-600" />
              <p className="text-xs font-bold">Memuat daftar siswa kelas...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              {searchQuery ? 'Tidak ada siswa yang cocok dengan pencarian.' : 'Tidak ada siswa di kelas ini.'}
            </div>
          ) : (
            filteredStudents.map((student) => {
              const isSn = !!snStudentsMap[student.id];
              const isSaving = savingId === student.id;
              const snData = snStudentsMap[student.id];

              return (
                <div
                  key={student.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isSn
                      ? 'bg-amber-50/40 border-amber-200/80 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSn
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isSn ? <UserCheck size={18} /> : (student.name ? student.name[0] : 'S')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 truncate">
                          {student.name}
                        </span>
                        {isSn && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-black uppercase tracking-wider">
                            SN
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium truncate">
                        NISN: {(student as any).nisn || (student as any).nis || '-'}
                        {snData?.assignedByName && (
                          <span className="text-slate-400 ml-2">
                            • Ditandai oleh {snData.assignedByName}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleSn(student)}
                    disabled={isSaving}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50 ${
                      isSn
                        ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xs'
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : isSn ? (
                      <X size={14} />
                    ) : (
                      <UserPlus size={14} />
                    )}
                    <span>{isSn ? 'Hapus Status SN' : 'Tandai Siswa SN'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
