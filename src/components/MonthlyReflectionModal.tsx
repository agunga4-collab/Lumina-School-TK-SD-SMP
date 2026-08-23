import * as React from 'react';
import { 
  Sparkles, Calendar, Clock, CheckCircle2, AlertCircle, 
  FileText, Loader2, ChevronDown, ChevronUp, AlertTriangle, X
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Student, SEEnrollment, SEMonthlyReflection, SEMonthlyReflectionSlot, SEChoice } from '../types';
import { saveSEMonthlyReflection } from '../lib/firebase';

function getCurrentPeriodKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getPeriodLabel(key: string) {
  const [year, month] = key.split('-');
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const idx = parseInt(month, 10) - 1;
  return `${monthNames[idx]} ${year}`;
}

interface MonthlyReflectionModalProps {
  studentData: Student;
  activePeriod: any;
  enrollment: SEEnrollment | null;
  monthlyReflection: SEMonthlyReflection | null;
  onClose: () => void;
}

export default function MonthlyReflectionModal({ 
  studentData, 
  activePeriod, 
  enrollment, 
  monthlyReflection, 
  onClose 
}: MonthlyReflectionModalProps) {
  const isGrade9 = studentData.grade === 9;
  const numSlots = isGrade9 ? 1 : 2;

  const [reflectionText1, setReflectionText1] = React.useState('');
  const [reflectionText2, setReflectionText2] = React.useState('');
  const [showExample1, setShowExample1] = React.useState(false);
  const [showExample2, setShowExample2] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Load existing reflections
  React.useEffect(() => {
    if (monthlyReflection) {
      const slot1 = monthlyReflection.slots.find(s => s.slot === 1);
      const slot2 = monthlyReflection.slots.find(s => s.slot === 2);
      setReflectionText1(slot1?.reflectionText || '');
      setReflectionText2(slot2?.reflectionText || '');
    } else {
      setReflectionText1('');
      setReflectionText2('');
    }
  }, [monthlyReflection]);

  // Check if choices are missing
  const isChoiceMissing = (slotNum: 1 | 2) => {
    if (!enrollment || !enrollment.choices) return true;
    const choice = enrollment.choices.find(c => c.slot === slotNum);
    return !choice || !choice.strand || !choice.activityName;
  };

  const choice1 = enrollment?.choices?.find(c => c.slot === 1);
  const choice2 = enrollment?.choices?.find(c => c.slot === 2);

  // Overall read-only check
  const isReadOnly = monthlyReflection?.overallStatus === 'SUBMITTED' || monthlyReflection?.overallStatus === 'APPROVED';

  // Determine if inputs are valid for submission (minimum 80 chars per active/available slot)
  const isInputValid = React.useMemo(() => {
    if (isChoiceMissing(1)) return false;
    if (reflectionText1.trim().length < 80) return false;

    if (numSlots === 2) {
      if (isChoiceMissing(2)) return false;
      if (reflectionText2.trim().length < 80) return false;
    }

    return true;
  }, [reflectionText1, reflectionText2, numSlots, enrollment]);

  // Handle Draft or Submit saving
  const handleSave = async (isSubmit: boolean) => {
    if (!studentData || !activePeriod) return;
    setSaving(true);

    try {
      const periodKey = getCurrentPeriodKey();
      
      const slotsArray: SEMonthlyReflectionSlot[] = [];

      // Slot 1
      if (!isChoiceMissing(1) && choice1) {
        slotsArray.push({
          slot: 1,
          strandId: choice1.strand,
          strandNameSnapshot: choice1.strand,
          activityId: choice1.activityId,
          activityNameSnapshot: choice1.activityName,
          reflectionText: reflectionText1,
          status: isSubmit ? 'SUBMITTED' : 'DRAFT',
          teacherFeedback: monthlyReflection?.slots?.find(s => s.slot === 1)?.teacherFeedback || '',
          submittedAt: isSubmit ? Date.now() : (monthlyReflection?.slots?.find(s => s.slot === 1)?.submittedAt || null),
          reviewedAt: monthlyReflection?.slots?.find(s => s.slot === 1)?.reviewedAt || null,
          reviewedBy: monthlyReflection?.slots?.find(s => s.slot === 1)?.reviewedBy || null
        });
      }

      // Slot 2 if Grade 7/8
      if (numSlots === 2 && !isChoiceMissing(2) && choice2) {
        slotsArray.push({
          slot: 2,
          strandId: choice2.strand,
          strandNameSnapshot: choice2.strand,
          activityId: choice2.activityId,
          activityNameSnapshot: choice2.activityName,
          reflectionText: reflectionText2,
          status: isSubmit ? 'SUBMITTED' : 'DRAFT',
          teacherFeedback: monthlyReflection?.slots?.find(s => s.slot === 2)?.teacherFeedback || '',
          submittedAt: isSubmit ? Date.now() : (monthlyReflection?.slots?.find(s => s.slot === 2)?.submittedAt || null),
          reviewedAt: monthlyReflection?.slots?.find(s => s.slot === 2)?.reviewedAt || null,
          reviewedBy: monthlyReflection?.slots?.find(s => s.slot === 2)?.reviewedBy || null
        });
      }

      // Determine overallStatus based on submission action
      const overallStatus = isSubmit ? 'SUBMITTED' : 'DRAFT';

      const reflectionDoc: SEMonthlyReflection = {
        studentId: studentData.id,
        classId: studentData.classId || '',
        unit: 'JUNIOR_HIGH',
        academicYear: activePeriod.academicYear,
        semester: activePeriod.semester,
        periodKey,
        studentNameSnapshot: studentData.name,
        classNameSnapshot: studentData.classId || '',
        gradeSnapshot: studentData.grade,
        slots: slotsArray,
        overallStatus,
        createdAt: monthlyReflection?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await saveSEMonthlyReflection(reflectionDoc);

      alert(isSubmit ? "Refleksi bulanan Anda berhasil dikirim!" : "Refleksi berhasil disimpan sebagai draft.");
      onClose();
    } catch (err: any) {
      console.error("Failed to save Monthly Reflection:", err);
      alert("Gagal menyimpan refleksi. Silakan coba kembali.");
    } finally {
      setSaving(false);
    }
  };

  const currentPeriodLabel = getPeriodLabel(getCurrentPeriodKey());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="monthly-reflection-modal">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
        onClick={onClose} 
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-3xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-8 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Refleksi Bulanan</span>
            <h3 className="text-xl font-black text-gray-900 mt-1">{currentPeriodLabel}</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              {studentData.name} • KELAS {studentData.classId} • TA {activePeriod.academicYear}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-900 border border-gray-100 transition-all"
            id="btn-close-reflection"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Workspace */}
        <div className="p-8 space-y-8 overflow-y-auto flex-1 text-left">
          
          {/* Status Alert Banner */}
          {monthlyReflection?.overallStatus && (
            <div className={cn(
              "p-5 rounded-2xl border flex items-start gap-4",
              monthlyReflection.overallStatus === 'SUBMITTED' && "bg-blue-50/50 border-blue-100 text-blue-800",
              monthlyReflection.overallStatus === 'APPROVED' && "bg-emerald-50/50 border-emerald-100 text-emerald-800",
              monthlyReflection.overallStatus === 'REVISION_REQUESTED' && "bg-amber-50 border-amber-100 text-amber-800"
            )}>
              <div className="shrink-0 mt-0.5">
                {monthlyReflection.overallStatus === 'SUBMITTED' && <Clock className="text-blue-600 animate-pulse" size={18} />}
                {monthlyReflection.overallStatus === 'APPROVED' && <CheckCircle2 className="text-emerald-600" size={18} />}
                {monthlyReflection.overallStatus === 'REVISION_REQUESTED' && <AlertCircle className="text-amber-600" size={18} />}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wider">
                  Status Refleksi: {
                    monthlyReflection.overallStatus === 'SUBMITTED' ? 'Menunggu Review' :
                    monthlyReflection.overallStatus === 'APPROVED' ? 'Selesai / Disetujui' :
                    monthlyReflection.overallStatus === 'REVISION_REQUESTED' ? 'Perlu Revisi' : 'Draft'
                  }
                </p>
                <p className="text-xs font-medium opacity-90">
                  {monthlyReflection.overallStatus === 'SUBMITTED' && 'Refleksi Anda sedang direview oleh guru pembimbing. Anda dapat mengedit kembali jika dikembalikan untuk revisi.'}
                  {monthlyReflection.overallStatus === 'APPROVED' && 'Luar biasa! Refleksi bulanan Anda telah disetujui oleh guru pembimbing.'}
                  {monthlyReflection.overallStatus === 'REVISION_REQUESTED' && 'Guru pembimbing meminta beberapa revisi. Harap baca umpan balik di bawah dan perbaiki refleksi Anda.'}
                </p>
              </div>
            </div>
          )}

          {/* Slot 1 Workspace */}
          <div className="space-y-5 border-b border-gray-100 pb-6 last:border-0 last:pb-0">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-gray-900 uppercase italic tracking-wide">Slot 1: Refleksi Pembelajaran</h4>
              {choice1 && (
                <span className="px-3 py-1 bg-pink-50 text-pink-700 border border-pink-100 rounded-full text-[9px] font-black uppercase tracking-wider">
                  {choice1.strand}
                </span>
              )}
            </div>

            {isChoiceMissing(1) ? (
              <div className="p-6 bg-red-50/50 rounded-2xl border border-red-100 flex items-start gap-3">
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-xs font-black text-red-800 uppercase tracking-wider">Aktivitas Belum Dipilih</p>
                  <p className="text-xs text-red-600 font-semibold mt-1">Lengkapi pilihan Self-Exploration terlebih dahulu sebelum mengisi refleksi.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Aktivitas Terpilih</span>
                  <p className="text-sm font-bold text-gray-800 mt-1">{choice1?.activityName}</p>
                </div>

                {/* Teacher Feedback Slot 1 */}
                {monthlyReflection?.slots?.find(s => s.slot === 1)?.teacherFeedback && (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">Masukan Guru Pembimbing</span>
                    <p className="text-xs font-bold text-amber-800 italic mt-1">
                      "{monthlyReflection.slots.find(s => s.slot === 1)?.teacherFeedback}"
                    </p>
                  </div>
                )}

                {/* Sentence Stems and Collapsible Example */}
                <div className="space-y-3">
                  <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-50/80 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-700">Panduan Kalimat Pemantik (Sentence Stems)</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-blue-800 leading-relaxed pt-1">
                      <div>
                        <p className="font-bold underline mb-1">Bahasa Indonesia:</p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>Di bulan ini, saya ...</li>
                          <li>Salah satu tantangan terbesar yang saya hadapi adalah ...</li>
                          <li>Untuk ke depannya, saya akan ...</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-bold underline mb-1">English:</p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>This month, I ...</li>
                          <li>One of the biggest challenges I faced was ...</li>
                          <li>Moving forward, I would like to ...</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Example 1 */}
                  <div>
                    <button 
                      onClick={() => setShowExample1(!showExample1)}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-700"
                    >
                      <span>{showExample1 ? 'Sembunyikan Contoh Refleksi' : 'Lihat Contoh Refleksi'}</span>
                      {showExample1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showExample1 && (
                      <div className="p-4 bg-indigo-50/30 rounded-2xl border border-indigo-50 text-xs font-medium text-indigo-900 mt-2 space-y-2 leading-relaxed">
                        <p><strong>Bahasa Indonesia:</strong> "Di bulan ini, saya belajar tentang dasar-dasar pemrograman robotika menggunakan modul Arduino. Salah satu tantangan terbesar yang saya hadapi adalah merakit kabel sensor inframerah yang rumit dan sering mengalami malfungsi saat diuji. Untuk ke depannya, saya akan lebih teliti membaca diagram sirkuit sebelum menyalakan daya."</p>
                        <p><strong>English:</strong> "This month, I learned the basics of robotics programming using the Arduino module. One of the biggest challenges I faced was assembling the infrared sensor cables, which were complex and frequently malfunctioned during testing. Moving forward, I would like to pay closer attention to the circuit diagrams before powering on."</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Textarea */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <span>Tulisan Refleksi Anda</span>
                    <span className={cn(
                      "font-bold",
                      reflectionText1.length < 80 ? "text-red-500" : "text-emerald-600"
                    )}>
                      {reflectionText1.length} / Min. 80 Karakter
                    </span>
                  </div>
                  <textarea
                    disabled={isReadOnly}
                    value={reflectionText1}
                    onChange={(e) => setReflectionText1(e.target.value)}
                    placeholder="Tuliskan refleksi komprehensif Anda mengenai aktivitas ini..."
                    className="w-full min-h-[120px] p-5 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-600 font-medium text-sm leading-relaxed disabled:opacity-60"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Slot 2 Workspace if Grade 7/8 */}
          {numSlots === 2 && (
            <div className="space-y-5 border-b border-gray-100 pb-6 last:border-0 last:pb-0 pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-gray-900 uppercase italic tracking-wide">Slot 2: Refleksi Pembelajaran</h4>
                {choice2 && (
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[9px] font-black uppercase tracking-wider">
                    {choice2.strand}
                  </span>
                )}
              </div>

              {isChoiceMissing(2) ? (
                <div className="p-6 bg-red-50/50 rounded-2xl border border-red-100 flex items-start gap-3">
                  <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs font-black text-red-800 uppercase tracking-wider">Aktivitas Belum Dipilih</p>
                    <p className="text-xs text-red-600 font-semibold mt-1">Lengkapi pilihan Self-Exploration terlebih dahulu sebelum mengisi refleksi.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Aktivitas Terpilih</span>
                    <p className="text-sm font-bold text-gray-800 mt-1">{choice2?.activityName}</p>
                  </div>

                  {/* Teacher Feedback Slot 2 */}
                  {monthlyReflection?.slots?.find(s => s.slot === 2)?.teacherFeedback && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">Masukan Guru Pembimbing</span>
                      <p className="text-xs font-bold text-amber-800 italic mt-1">
                        "{monthlyReflection.slots.find(s => s.slot === 2)?.teacherFeedback}"
                      </p>
                    </div>
                  )}

                  {/* Sentence Stems and Collapsible Example */}
                  <div className="space-y-3">
                    <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-50/80 space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-blue-700">Panduan Kalimat Pemantik (Sentence Stems)</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-blue-800 leading-relaxed pt-1">
                        <div>
                          <p className="font-bold underline mb-1">Bahasa Indonesia:</p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Di bulan ini, saya ...</li>
                            <li>Salah satu tantangan terbesar yang saya hadapi adalah ...</li>
                            <li>Untuk ke depannya, saya akan ...</li>
                          </ul>
                        </div>
                        <div>
                          <p className="font-bold underline mb-1">English:</p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>This month, I ...</li>
                            <li>One of the biggest challenges I faced was ...</li>
                            <li>Moving forward, I would like to ...</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Example 2 */}
                    <div>
                      <button 
                        onClick={() => setShowExample2(!showExample2)}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-700"
                      >
                        <span>{showExample2 ? 'Sembunyikan Contoh Refleksi' : 'Lihat Contoh Refleksi'}</span>
                        {showExample2 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {showExample2 && (
                        <div className="p-4 bg-indigo-50/30 rounded-2xl border border-indigo-50 text-xs font-medium text-indigo-900 mt-2 space-y-2 leading-relaxed">
                          <p><strong>Bahasa Indonesia:</strong> "Di bulan ini, saya belajar tentang dasar-dasar pemrograman robotika menggunakan modul Arduino. Salah satu tantangan terbesar yang saya hadapi adalah merakit kabel sensor inframerah yang rumit dan sering mengalami malfungsi saat diuji. Untuk ke depannya, saya akan lebih teliti membaca diagram sirkuit sebelum menyalakan daya."</p>
                          <p><strong>English:</strong> "This month, I learned the basics of robotics programming using the Arduino module. One of the biggest challenges I faced was assembling the infrared sensor cables, which were complex and frequently malfunctioned during testing. Moving forward, I would like to pay closer attention to the circuit diagrams before powering on."</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Textarea */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <span>Tulisan Refleksi Anda</span>
                      <span className={cn(
                        "font-bold",
                        reflectionText2.length < 80 ? "text-red-500" : "text-emerald-600"
                      )}>
                        {reflectionText2.length} / Min. 80 Karakter
                      </span>
                    </div>
                    <textarea
                      disabled={isReadOnly}
                      value={reflectionText2}
                      onChange={(e) => setReflectionText2(e.target.value)}
                      placeholder="Tuliskan refleksi komprehensif Anda mengenai aktivitas ini..."
                      className="w-full min-h-[120px] p-5 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-600 font-medium text-sm leading-relaxed disabled:opacity-60"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button 
            onClick={onClose}
            className="py-3.5 px-6 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all"
          >
            Tutup
          </button>

          {!isReadOnly && (
            <div className="flex gap-3">
              <button
                disabled={saving}
                onClick={() => handleSave(false)}
                className="py-3.5 px-6 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-indigo-600 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all"
              >
                {saving ? 'Menyimpan...' : 'Simpan Draft'}
              </button>

              <button
                disabled={!isInputValid || saving}
                onClick={() => handleSave(true)}
                className="py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-100 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {saving ? 'Mengirim...' : monthlyReflection?.overallStatus === 'REVISION_REQUESTED' ? 'Perbaiki & Kirim Ulang' : 'Kirim untuk Review'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
