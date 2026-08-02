import * as React from 'react';
import { MessageSquare, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import AttendanceStatusSelector from './AttendanceStatusSelector';

interface StudentAttendance {
  id: string;
  name: string;
  status: any;
  note: string;
  absencesThisMonth: number;
}

interface AttendanceStudentCardProps {
  key?: any;
  student: any;
  attendanceType: any;
  onStatusChange: (status: any) => void;
  onNoteChange: (note: string) => void;
  onDeleteOne: () => any;
  deleting?: boolean;
  threshold?: number;
  disabled?: boolean;
}

export default function AttendanceStudentCard({
  student,
  attendanceType,
  onStatusChange,
  onNoteChange,
  onDeleteOne,
  deleting = false,
  threshold = 3,
  disabled = false,
}: AttendanceStudentCardProps) {
  const isHighRisk = student.absencesThisMonth >= threshold;

  return (
    <div 
      id={`student-card-${student.id}`}
      className={cn(
        "bg-white p-4 rounded-xl border transition-all space-y-4",
        isHighRisk ? "border-red-100 bg-red-50/5" : "border-gray-100"
      )}
    >
      {/* Head section: Student Name, ID and Escalation */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 text-sm leading-snug break-words">
            {student.name}
          </p>
          <p className="text-[10px] text-gray-400 font-bold mt-0.5">
            #{student.id}
          </p>
        </div>

        {/* Escalation Badge */}
        <div className="shrink-0">
          {isHighRisk ? (
            <div className="flex items-center gap-1 bg-red-50 border border-red-100 text-red-600 px-2.5 py-1 rounded-full">
              <AlertTriangle size={12} className="shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-wider">High Risk</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 px-2.5 py-1 rounded-full">
              <span className="text-[9px] font-black uppercase tracking-wider">Aman</span>
            </div>
          )}
        </div>
      </div>

      {/* Status Selector Section */}
      <div className="space-y-1.5">
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
          Status Kehadiran
        </span>
        <AttendanceStatusSelector
          value={student.status}
          onChange={onStatusChange}
          attendanceType={attendanceType}
          layout="mobile"
          disabled={disabled}
        />
      </div>

      {/* Note and Actions Section */}
      <div className="flex items-center gap-2 pt-1">
        {/* Note Input */}
        <div className="relative flex-1">
          <MessageSquare size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tambahkan catatan..."
            disabled={disabled}
            className="w-full bg-gray-50/50 border border-gray-100 focus:border-blue-300 focus:bg-white outline-none text-xs transition-all py-2 pl-8 pr-3 rounded-xl placeholder:text-gray-400 font-medium"
            value={student.note}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        </div>

        {/* Individual delete action */}
        {student.status && (
          <button
            type="button"
            onClick={onDeleteOne}
            disabled={disabled || deleting}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-gray-100 bg-white shadow-sm shrink-0"
            title="Hapus Kehadiran Siswa Ini"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
