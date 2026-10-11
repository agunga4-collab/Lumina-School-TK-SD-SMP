import * as React from 'react';
import { useState } from 'react';
import { X, Users, CheckSquare, Square, Save, Calendar, Target, Check } from 'lucide-react';
import {
  AssessmentBookOptions,
  ComprehensionLevel,
  JHAssessmentLO,
  Student
} from '../../../../types';
import {
  bulkAddFormativeEntries,
  getTodayWIB
} from '../../../../services/juniorHighAssessmentBookService';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lo: JHAssessmentLO;
  students: Student[];
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  options: AssessmentBookOptions;
  teacherId: string;
  teacherName: string;
  onSuccess: () => void;
}

export function BulkFormativeModal({
  isOpen,
  onClose,
  lo,
  students,
  classId,
  subjectId,
  academicYear,
  semester,
  options,
  teacherId,
  teacherName,
  onSuccess
}: Props) {
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() => students.map(s => s.id));
  const [date, setDate] = useState<string>(() => getTodayWIB());
  const [formativeTask, setFormativeTask] = useState<string>(() => options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
  const [comprehensionLevel, setComprehensionLevel] = useState<ComprehensionLevel>('A');
  const [nextAction, setNextAction] = useState<string>('Lanjut ke LO Berikutnya');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedStudentIds(students.map(s => s.id));
      setDate(getTodayWIB());
      setFormativeTask(options.formativeTasks[0] || 'Lembar Kerja (LKPD)');
      setComprehensionLevel('A');
      setNextAction('Lanjut ke LO Berikutnya');
      setNotes('');
    }
  }, [isOpen, students, options]);

  // Suggest nextAction based on level
  const handleLevelChange = (lvl: ComprehensionLevel) => {
    setComprehensionLevel(lvl);
    if (lvl === 'A') {
      setNextAction('Lanjut ke LO Berikutnya');
    } else if (lvl === 'D') {
      setNextAction('Tutor Sebaya');
    } else {
      setNextAction('Bimbingan Personal Guru');
    }
  };

  if (!isOpen) return null;

  const handleToggleStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedStudentIds(students.map(s => s.id));
  };

  const handleDeselectAll = () => {
    setSelectedStudentIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudentIds.length === 0) {
      toast.warning('Pilih minimal 1 siswa');
      return;
    }

    setSaving(true);
    try {
      const selectedStudentsList = students.filter(s => selectedStudentIds.includes(s.id));
      const payloadEntries = selectedStudentsList.map(s => ({
        loId: lo.id,
        lgId: lo.lgId,
        classId,
        subjectId,
        academicYear,
        semester,
        studentId: s.id,
        studentName: s.name,
        date,
        formativeTask,
        comprehensionLevel,
        nextAction,
        notes: notes.trim(),
        teacherId,
        teacherName
      }));

      await bulkAddFormativeEntries(payloadEntries);
      toast.success(`Berhasil menerapkan nilai formatif ke ${selectedStudentsList.length} siswa!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan pengisian massal: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Isi Nilai Formatif Massal</h2>
              <p className="text-xs text-gray-500">
                Terapkan nilai yang sama sekaligus ke banyak siswa untuk <span className="font-bold text-purple-700">{lo.code}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* LO Banner */}
        <div className="bg-purple-50/60 px-6 py-2 border-b border-purple-100 text-xs text-purple-900 flex items-center gap-2">
          <span className="font-bold shrink-0">{lo.code}:</span>
          <span className="truncate">{lo.title}</span>
        </div>

        {/* Body */}
        <form id="bulk-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Tanggal Asesmen (WIB) <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Formative Task <span className="text-red-500">*</span>
              </label>
              <select
                value={formativeTask}
                onChange={e => setFormativeTask(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                {options.formativeTasks.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Level B/D/A */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
              Tingkat Pemahaman (Comprehension Level) <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleLevelChange('B')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  comprehensionLevel === 'B'
                    ? 'bg-rose-50 border-rose-400 text-rose-900 ring-2 ring-rose-400'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-base font-black">B</span>
                <span className="text-[10px] font-bold">Beginning</span>
              </button>

              <button
                type="button"
                onClick={() => handleLevelChange('D')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  comprehensionLevel === 'D'
                    ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-400'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-base font-black">D</span>
                <span className="text-[10px] font-bold">Developing</span>
              </button>

              <button
                type="button"
                onClick={() => handleLevelChange('A')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  comprehensionLevel === 'A'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-400'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-base font-black">A</span>
                <span className="text-[10px] font-bold">Achieved</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Next Action</label>
              <select
                value={nextAction}
                onChange={e => setNextAction(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {options.nextActions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Catatan (Opsional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Catatan bersama..."
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          {/* Student selection checkbox list */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Pilih Siswa ({selectedStudentIds.length} dari {students.length} dipilih)
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-blue-600 hover:underline cursor-pointer font-medium"
                >
                  Pilih Semua
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-gray-500 hover:underline cursor-pointer"
                >
                  Batal Pilih
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-xl bg-gray-50/50">
              {students.map((student, idx) => {
                const isChecked = selectedStudentIds.includes(student.id);
                return (
                  <label
                    key={student.id}
                    className={`flex items-center gap-2.5 p-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                      isChecked
                        ? 'bg-blue-50/70 border-blue-200 text-blue-950 font-medium'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleStudent(student.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="w-5 text-gray-400 font-mono text-[10px]">
                      {student.attendanceNumber ?? (student as any).noAbsen ?? idx + 1}.
                    </span>
                    <span className="truncate flex-1">{student.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            form="bulk-form"
            disabled={saving || selectedStudentIds.length === 0}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Check size={14} />
            {saving ? 'Menerapkan...' : `Terapkan ke ${selectedStudentIds.length} Siswa`}
          </button>
        </div>
      </div>
    </div>
  );
}
