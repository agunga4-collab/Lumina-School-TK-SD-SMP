import * as React from 'react';
import { MessageSquare, Trash2, AlertTriangle, X, Smile, SmilePlus, Check, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import AttendanceStatusSelector from './AttendanceStatusSelector';

interface StudentAttendance {
  id: string;
  name: string;
  status: any;
  note: string;
  absencesThisMonth: number;
  emotion?: 'happy' | 'neutral' | 'sad' | null;
}

interface AttendanceStudentCardProps {
  key?: any;
  student: any;
  attendanceType: any;
  onStatusChange: (status: any) => void;
  onNoteChange: (note: string) => void;
  onEmotionChange?: (emotion: 'happy' | 'neutral' | 'sad' | null) => void;
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
  onEmotionChange,
  onDeleteOne,
  deleting = false,
  threshold = 3,
  disabled = false,
}: AttendanceStudentCardProps) {
  const isHighRisk = student.absencesThisMonth >= threshold;
  const [isBottomSheetOpen, setIsBottomSheetOpen] = React.useState(false);
  
  // Temporary state for the bottom sheet inputs
  const [tempNote, setTempNote] = React.useState(student.note || '');
  const [tempEmotion, setTempEmotion] = React.useState<'happy' | 'neutral' | 'sad' | null>(student.emotion || null);

  // Sync temp state when student updates or bottom sheet opens
  React.useEffect(() => {
    if (isBottomSheetOpen) {
      setTempNote(student.note || '');
      setTempEmotion(student.emotion || null);
    }
  }, [isBottomSheetOpen, student.note, student.emotion]);

  const handleSaveDetail = () => {
    onNoteChange(tempNote);
    if (onEmotionChange) {
      onEmotionChange(tempEmotion);
    }
    setIsBottomSheetOpen(false);
  };

  // Get student initials for initials avatar monogram
  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return parts[0].charAt(0).toUpperCase();
  };

  // Color options for the circular avatar placeholder
  const getAvatarBg = (id: string, isRisk: boolean) => {
    if (isRisk) return 'bg-red-100 text-red-700 border-red-200';
    const code = id.charCodeAt(id.length - 1) || 0;
    const colors = [
      'bg-indigo-50 text-indigo-700 border-indigo-100',
      'bg-emerald-50 text-emerald-700 border-emerald-100',
      'bg-amber-50 text-amber-700 border-amber-100',
      'bg-blue-50 text-blue-700 border-blue-100',
      'bg-purple-50 text-purple-700 border-purple-100',
    ];
    return colors[code % colors.length];
  };

  return (
    <div 
      id={`student-card-${student.id}`}
      className={cn(
        "bg-white p-4 rounded-2xl border transition-all space-y-4 shadow-sm",
        isHighRisk ? "border-red-100 bg-red-50/10" : "border-gray-100 hover:border-gray-200"
      )}
    >
      {/* Top Section: Avatar, Student Name, Emotional Checklist Status, and Risk Indicator */}
      <div className="flex items-start gap-3">
        {/* Initials Avatar Monogram */}
        <div 
          className={cn(
            "h-11 w-11 rounded-full flex items-center justify-center text-xs font-black shrink-0 border",
            getAvatarBg(student.id, isHighRisk)
          )}
        >
          {getInitials(student.name)}
        </div>

        {/* Student Info & Emotional Checklist Display */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-gray-900 text-sm leading-snug break-words">
              {student.name}
            </p>
            
            {/* Risk Badge */}
            {isHighRisk ? (
              <div className="flex items-center gap-1 bg-red-50 border border-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0">
                <AlertTriangle size={10} className="shrink-0" />
                <span className="text-[8px] font-black uppercase tracking-wider">High Risk</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full shrink-0">
                <span className="text-[8px] font-black uppercase tracking-wider">Aman</span>
              </div>
            )}
          </div>
          
          <p className="text-[10px] text-gray-400 font-bold mt-0.5">
            #{student.id}
          </p>

          {/* Interactive Emotional Checklist Trigger */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setIsBottomSheetOpen(true)}
              aria-label={`Status emosional ${student.emotion || 'Belum diisi'}. Ketuk untuk mengubah.`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all border shadow-2xs",
                student.emotion === 'happy' && "bg-green-50/70 border-green-200 text-green-700 hover:bg-green-100",
                student.emotion === 'neutral' && "bg-amber-50/70 border-amber-200 text-amber-700 hover:bg-amber-100",
                student.emotion === 'sad' && "bg-rose-50/70 border-rose-200 text-rose-700 hover:bg-rose-100",
                !student.emotion && "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
              )}
            >
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                student.emotion === 'happy' && "bg-green-500 animate-pulse",
                student.emotion === 'neutral' && "bg-amber-500",
                student.emotion === 'sad' && "bg-rose-500",
                !student.emotion && "bg-gray-400"
              )} />
              <span>
                {student.emotion === 'happy' ? '😊 Happy' :
                 student.emotion === 'neutral' ? '😐 Netral' :
                 student.emotion === 'sad' ? '😟 Butuh Perhatian' :
                 '😐 Belum diisi'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mid Section: Status Selector Section */}
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
          schoolStatus={student.schoolStatus}
        />
      </div>

      {/* Bottom Section: Detail/Notes Trigger and Clear Record Button */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-50/50">
        {/* Interactive note button */}
        <button
          type="button"
          onClick={() => setIsBottomSheetOpen(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border",
            student.note
              ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
              : "bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100"
          )}
        >
          <MessageSquare size={14} className={cn("shrink-0", student.note ? "text-blue-600" : "text-gray-400")} />
          <span>
            {student.note ? "Catatan Tersedia" : "Tambah Catatan"}
          </span>
          {student.note && (
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
          )}
        </button>

        {/* Individual delete action if status is selected */}
        {student.status && (
          <button
            type="button"
            onClick={onDeleteOne}
            disabled={disabled || deleting}
            className="min-h-[44px] px-3 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all border border-red-100/50 bg-red-50/20 shrink-0 flex items-center gap-1 text-xs font-bold"
            title="Hapus Kehadiran Siswa Ini"
            aria-label={`Hapus kehadiran untuk ${student.name}`}
          >
            <Trash2 size={14} className="shrink-0" />
            <span>Hapus</span>
          </button>
        )}
      </div>

      {/* Premium Slide-Up Bottom Sheet for Notes & Emotion Details */}
      <AnimatePresence>
        {isBottomSheetOpen && (
          <>
            {/* Backdrop Dim overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBottomSheetOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-[2px]"
            />

            {/* Bottom Sheet Container */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[28px] p-6 shadow-2xl z-50 max-h-[85vh] overflow-y-auto max-w-md mx-auto border-t border-gray-100 flex flex-col space-y-5 pb-8 sm:rounded-b-[28px] sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
            >
              {/* Drag Indicator Accent */}
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />

              {/* Header Title with Close Trigger */}
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-1.5">
                    <Sparkles size={16} className="text-blue-500 shrink-0" />
                    Catatan & Detail Kehadiran
                  </h3>
                  <p className="text-xs text-gray-400 font-bold mt-0.5">#{student.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBottomSheetOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Tutup Detail"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Student Identification Monogram Card */}
              <div className="flex items-center gap-3 bg-gray-50/50 border border-gray-100 p-3.5 rounded-2xl">
                <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-xs font-black shrink-0 border bg-white", isHighRisk ? "border-red-200 text-red-600" : "border-gray-200 text-indigo-600")}>
                  {getInitials(student.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-gray-900 leading-snug break-words">
                    {student.name}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                    Status saat ini: <span className="font-extrabold uppercase text-gray-600">{student.status || 'Belum diisi'}</span>
                  </p>
                </div>
              </div>

              {/* Section 1: Emotional Checklist Picker */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block" id="emotion-picker-label">
                  Emotional Checklist (Kondisi Emosional Siswa)
                </label>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="emotion-picker-label">
                  {/* Option 1: Happy */}
                  <button
                    type="button"
                    onClick={() => setTempEmotion('happy')}
                    role="radio"
                    aria-checked={tempEmotion === 'happy'}
                    className={cn(
                      "min-h-[48px] px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1",
                      tempEmotion === 'happy'
                        ? "bg-green-50 border-green-400 text-green-700 ring-4 ring-green-100 shadow-sm"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <span className="text-base">😊</span>
                    <span>Happy</span>
                  </button>

                  {/* Option 2: Neutral */}
                  <button
                    type="button"
                    onClick={() => setTempEmotion('neutral')}
                    role="radio"
                    aria-checked={tempEmotion === 'neutral'}
                    className={cn(
                      "min-h-[48px] px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1",
                      tempEmotion === 'neutral'
                        ? "bg-amber-50 border-amber-400 text-amber-700 ring-4 ring-amber-100 shadow-sm"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <span className="text-base">😐</span>
                    <span>Netral</span>
                  </button>

                  {/* Option 3: Attention / Sad */}
                  <button
                    type="button"
                    onClick={() => setTempEmotion('sad')}
                    role="radio"
                    aria-checked={tempEmotion === 'sad'}
                    className={cn(
                      "min-h-[48px] px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center gap-1",
                      tempEmotion === 'sad'
                        ? "bg-rose-50 border-rose-400 text-rose-700 ring-4 ring-rose-100 shadow-sm"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <span className="text-base">😟</span>
                    <span>Perhatian</span>
                  </button>
                </div>
                
                {/* Clear emotional checklist option */}
                {tempEmotion && (
                  <button
                    type="button"
                    onClick={() => setTempEmotion(null)}
                    className="text-[10px] text-gray-400 hover:text-red-500 font-extrabold flex items-center gap-1 mt-1 transition-colors"
                  >
                    Hapus pilihan emosi
                  </button>
                )}
              </div>

              {/* Section 2: Note Editor */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block" id="note-textarea-label">
                  Catatan Kehadiran / Keterangan Tambahan
                </label>
                <div className="relative">
                  <textarea
                    aria-labelledby="note-textarea-label"
                    placeholder="Contoh: Terlambat karena ban bocor, sakit demam berdarah, izin acara keluarga..."
                    value={tempNote}
                    onChange={(e) => setTempNote(e.target.value)}
                    className="w-full min-h-[90px] bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all outline-none font-medium placeholder:text-gray-400 leading-relaxed"
                  />
                </div>
              </div>

              {/* Action Buttons: Cancel and Save */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBottomSheetOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl transition-all min-h-[44px] flex items-center justify-center"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveDetail}
                  className="flex-1 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-all shadow-sm min-h-[44px] flex items-center justify-center"
                >
                  Simpan Catatan
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
