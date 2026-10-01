import * as React from 'react';
import { X, Search, Check, AlertCircle, Shield, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getActiveStudents } from '../../../lib/firebase';
import {
  assignSnStudent,
  removeSnStudent,
  fetchSnStudentsForClass
} from '../../../services/juniorHighSnMidtermService';
import type { Class, Student, User } from '../../../types';
import type { SnStudentDoc } from '../../../types/midtermSnReport';

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
  const [snStudentsMap, setSnStudentsMap] = React.useState<Record<string, SnStudentDoc>>({});
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  const loadData = React.useCallback(async () => {
    if (!selectedClass?.id) return;
    setLoading(true);
    try {
      const [allStudents, snDocs] = await Promise.all([
        getActiveStudents(selectedClass.id),
        fetchSnStudentsForClass(selectedClass.id, academicYear)
      ]);

      setClassStudents(allStudents || []);

      const map: Record<string, SnStudentDoc> = {};
      (snDocs || []).forEach((doc) => {
        if (doc.isSN) {
          map[doc.studentId] = doc;
        }
      });
      setSnStudentsMap(map);
    } catch (err: any) {
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
    (student.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    ((student as any).nisn || '').includes(searchQuery)
  );

  const handleToggleSn = async (student: Student) => {
    const isCurrentlySn = !!snStudentsMap[student.id];
    setSavingId(student.id);
    try {
      if (isCurrentlySn) {
        await removeSnStudent(student.id, selectedClass.id);
        const updated = { ...snStudentsMap };
        delete updated[student.id];
        setSnStudentsMap(updated);
        toast.success(`Status SN untuk ${student.name} berhasil dihapus.`);
      } else {
        await assignSnStudent(student, selectedClass, academicYear, currentUser);
        setSnStudentsMap((prev) => ({
          ...prev,
          [student.id]: {
            id: `${student.id}_${selectedClass.id}`,
            studentId: student.id,
            studentName: student.name,
            nisn: (student as any).nisn || '',
            classId: selectedClass.id,
            className: selectedClass.name,
            academicYear,
            isSN: true,
            assignedAt: Date.now(),
            assignedBy: currentUser.uid,
            assignedByName: currentUser.displayName || currentUser.email || 'Admin',
            updatedAt: Date.now()
          }
        }));
        toast.success(`${student.name} ditetapkan sebagai siswa SN.`);
      }
      await onRefresh();
    } catch (err: any) {
      toast.error('Gagal memperbarui status SN: ' + (err.message || 'Error'));
    } finally {
      setSavingId(null);
    }
  };

  const snCount = Object.keys(snStudentsMap).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-purple-100 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-purple-500/20 rounded-xl text-purple-300">
                <Shield size={20} />
              </span>
              <h2 className="text-lg font-black tracking-tight">Kelola Siswa Special Needs (SN)</h2>
            </div>
            <p className="text-xs text-purple-200 font-medium">
              Kelas: <span className="font-bold text-white">{selectedClass.name}</span> | Ditetapkan: <span className="font-black text-amber-300">{snCount} Siswa</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-purple-200 hover:text-white hover:bg-white/10 rounded-2xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info Banner */}
        <div className="p-4 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-start gap-2 shrink-0">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-bold">Hak Akses Admin:</p>
            <p className="text-amber-800">
              Hanya Admin yang dapat menentukan status SN siswa. Siswa yang ditandai SN akan muncul pada modul Rapor Midterm SN untuk pengelolaan Learning Goals khusus.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama siswa atau NISN..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
            />
          </div>
        </div>

        {/* Student List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={24} className="animate-spin text-purple-600" />
              <p className="text-xs font-bold uppercase tracking-wider">Memuat daftar siswa...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <UserPlus size={32} className="mx-auto text-slate-300" />
              <p className="text-xs font-semibold">Tidak ada siswa ditemukan di kelas ini.</p>
            </div>
          ) : (
            filteredStudents.map((student) => {
              const isSn = !!snStudentsMap[student.id];
              const isSaving = savingId === student.id;

              return (
                <div
                  key={student.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isSn
                      ? 'bg-purple-50/60 border-purple-200 shadow-xs'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900">{student.name}</span>
                      {isSn && (
                        <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-black uppercase tracking-wider rounded-md">
                          Siswa SN
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium">
                      NISN: {(student as any).nisn || '-'}
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleSn(student)}
                    disabled={isSaving}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      isSn
                        ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                        : 'bg-purple-900 text-white hover:bg-purple-800 shadow-xs'
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : isSn ? (
                      <>
                        <X size={14} /> Hapus Status SN
                      </>
                    ) : (
                      <>
                        <UserCheck size={14} /> Tandai Sebagai SN
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
