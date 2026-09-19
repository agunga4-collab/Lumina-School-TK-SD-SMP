import * as React from 'react';
import { 
  Sparkles, Save, CheckCircle2, AlertCircle, Wand2, 
  User as UserIcon, Plus, X, Lock, RefreshCw, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  STRENGTH_PROGRESS_BANK, 
  ACHIEVEMENT_BANK, 
  NEEDS_IMPROVEMENT_BANK,
  canUserEditMidtermGeneralComments,
  saveMidtermStudentGeneralComment,
  generateMidtermGeneralCommentAI,
  refineMidtermGeneralCommentAI
} from '../../../services/juniorHighMidtermService';
import type { 
  MidtermStudentDataDoc, 
  MidtermGeneralCommentData 
} from '../../../types/midtermReport';
import type { Student, Class, User } from '../../../types';

interface MidtermGeneralCommentsTabProps {
  currentUser: User;
  selectedClass: Class | null;
  students: Student[];
  academicYear: string;
  semester: string;
  midtermTerm: string;
  studentDataMap: Record<string, MidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermGeneralCommentsTab: React.FC<MidtermGeneralCommentsTabProps> = ({
  currentUser,
  selectedClass,
  students,
  academicYear,
  semester,
  midtermTerm,
  studentDataMap,
  onRefreshData,
  loading
}) => {
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
  const safeStudentDataMap = studentDataMap && typeof studentDataMap === 'object' ? studentDataMap : {};

  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(safeStudents[0]?.id || '');
  
  // Active editing state for current selected student
  const [nickname, setNickname] = React.useState<string>('');
  const [gender, setGender] = React.useState<'MALE' | 'FEMALE'>('MALE');
  const [selectedStrengths, setSelectedStrengths] = React.useState<string[]>([]);
  const [selectedAchievements, setSelectedAchievements] = React.useState<string[]>([]);
  const [selectedNeedsImprovement, setSelectedNeedsImprovement] = React.useState<string[]>([]);
  const [customStrength, setCustomStrength] = React.useState<string>('');
  const [customAchievement, setCustomAchievement] = React.useState<string>('');
  const [customNeed, setCustomNeed] = React.useState<string>('');
  const [manualNotes, setManualNotes] = React.useState<string>('');
  const [aiDraft, setAiDraft] = React.useState<string>('');
  const [finalComment, setFinalComment] = React.useState<string>('');
  const [isFinal, setIsFinal] = React.useState<boolean>(false);

  // Loading flags
  const [generatingAI, setGeneratingAI] = React.useState<boolean>(false);
  const [polishingAI, setPolishingAI] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);

  const canEdit = canUserEditMidtermGeneralComments(currentUser, selectedClass);

  // Auto-select first student if none selected
  React.useEffect(() => {
    if ((!selectedStudentId || !safeStudents.some(s => s && s.id === selectedStudentId)) && safeStudents.length > 0) {
      setSelectedStudentId(safeStudents[0].id);
    }
  }, [safeStudents, selectedStudentId]);

  const selectedStudent = safeStudents.find(s => s && s.id === selectedStudentId) || safeStudents[0] || null;

  // Sync form when student changes or studentDataMap updates
  React.useEffect(() => {
    if (!selectedStudent) return;
    const sData = safeStudentDataMap[selectedStudent.id];
    const gc = sData?.generalComment;

    const sName = selectedStudent.name || '';
    const detectedGender = (selectedStudent.gender === 'P' || selectedStudent.gender === 'FEMALE') ? 'FEMALE' : 'MALE';

    setNickname(gc?.nickname || (selectedStudent.nickname as any) || sName.split(' ')[0] || '');
    setGender(gc?.gender || detectedGender);
    setSelectedStrengths(Array.isArray(gc?.strengths) ? gc.strengths : []);
    setSelectedAchievements(Array.isArray(gc?.achievements) ? gc.achievements : []);
    setSelectedNeedsImprovement(Array.isArray(gc?.needsImprovement) ? gc.needsImprovement : []);
    setManualNotes(gc?.manualNotes || '');
    setAiDraft(gc?.aiDraft || '');
    setFinalComment(gc?.finalComment || gc?.aiDraft || '');
    setIsFinal(Boolean(gc?.isFinal));
  }, [selectedStudent?.id, safeStudentDataMap]);

  // Helper to toggle bank items
  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  // Helper to count words
  const countWords = (text: string) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };

  const handleGenerateAI = async () => {
    if (!selectedStudent) return;
    setGeneratingAI(true);
    try {
      const generated = await generateMidtermGeneralCommentAI({
        studentName: selectedStudent.name,
        nickname: nickname.trim() || undefined,
        gender,
        strengths: selectedStrengths,
        achievements: selectedAchievements,
        needsImprovement: selectedNeedsImprovement,
        manualNotes: manualNotes.trim() || undefined
      });

      setAiDraft(generated);
      // If final comment is empty or was previous AI draft, update it as well
      if (!finalComment.trim() || finalComment === aiDraft) {
        setFinalComment(generated);
      }
      toast.success('Draf komentar berhasil di-generate oleh AI.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal generate AI: ' + (err.message || 'Error'));
    } finally {
      setGeneratingAI(false);
    }
  };

  const handlePolishAI = async () => {
    if (!finalComment.trim()) {
      toast.error('Ketik atau generate draf komentar terlebih dahulu.');
      return;
    }
    setPolishingAI(true);
    try {
      const polished = await refineMidtermGeneralCommentAI({
        draftText: finalComment,
        gender,
        studentName: selectedStudent?.name
      });

      setFinalComment(polished);
      toast.success('Komentar berhasil dirapikan oleh AI.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal merapikan dengan AI: ' + (err.message || 'Error'));
    } finally {
      setPolishingAI(false);
    }
  };

  const handleSave = async (markFinal = false) => {
    if (!selectedStudent || !selectedClass) return;
    setSaving(true);
    try {
      const payload: MidtermGeneralCommentData = {
        studentName: selectedStudent.name,
        nickname: nickname.trim(),
        gender,
        strengths: selectedStrengths,
        achievements: selectedAchievements,
        needsImprovement: selectedNeedsImprovement,
        manualNotes: manualNotes.trim(),
        aiDraft: aiDraft.trim(),
        finalComment: finalComment.trim(),
        isFinal: markFinal || isFinal,
      };

      await saveMidtermStudentGeneralComment(
        selectedStudent.id,
        selectedStudent.name,
        selectedClass.id,
        academicYear,
        semester,
        midtermTerm,
        payload,
        currentUser.uid
      );

      if (markFinal) {
        setIsFinal(true);
      }

      await onRefreshData();
      toast.success(markFinal ? 'Komentar berhasil ditandai FINAL dan disimpan.' : 'Draf komentar berhasil disimpan.');
    } catch (err: any) {
      console.error(err);
      toast.error('Gagal menyimpan komentar: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const wordCount = countWords(finalComment);
  const isWordCountExceeded = wordCount > 120;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 font-medium">
          <Lock size={16} className="text-amber-600 shrink-0" />
          <span>
            Hanya <strong>Wali Kelas</strong> dari kelas ini atau <strong>Kepala Sekolah / Super Admin</strong> yang dapat mengedit dan memfinalisasi General Comments. Anda dalam mode lihat (Read-Only).
          </span>
        </div>
      )}

      {/* Main Grid: Student Selector Sidebar + Comment Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Students List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Daftar Siswa ({safeStudents.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">
              Pilih siswa
            </span>
          </div>

          <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
            {safeStudents.map((student, idx) => {
              if (!student) return null;
              const sData = safeStudentDataMap[student.id];
              const gc = sData?.generalComment;
              const hasFinal = Boolean(gc?.finalComment?.trim());
              const isMarkedFinal = Boolean(gc?.isFinal);
              const isSelected = student.id === selectedStudent?.id;

              return (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                      : 'bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                        isSelected ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="text-xs font-bold uppercase truncate">{student.name}</div>
                      <div className={`text-[10px] ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                        NISN: {student.nisn || (student as any).nis || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isMarkedFinal ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                        <Check size={10} /> Final
                      </span>
                    ) : hasFinal ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800">
                        Draft
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-200 text-slate-600">
                        Kosong
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Editor Panel (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          {/* Header Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <UserIcon className="text-emerald-600" size={18} />
                <h3 className="text-base font-extrabold text-slate-900 uppercase">
                  {selectedStudent?.name || 'Pilih Siswa'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Input narasi perkembangan akademik & karakter siswa untuk Midterm Report.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isFinal ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  <CheckCircle2 size={14} /> Status: FINAL
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                  <AlertCircle size={14} /> Status: DRAFT
                </span>
              )}
            </div>
          </div>

          {/* Student Profile Inputs: Nickname & Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nama Panggilan (Nickname)
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Contoh: Budi / Sarah"
                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Gender (Pronouns He/She)
              </label>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    disabled={!canEdit}
                    checked={gender === 'MALE'}
                    onChange={() => setGender('MALE')}
                    className="text-slate-900 focus:ring-slate-900"
                  />
                  <span>Laki-laki (He/Him/His)</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    disabled={!canEdit}
                    checked={gender === 'FEMALE'}
                    onChange={() => setGender('FEMALE')}
                    className="text-slate-900 focus:ring-slate-900"
                  />
                  <span>Perempuan (She/Her/Hers)</span>
                </label>
              </div>
            </div>
          </div>

          {/* 3 Phrase Banks (Strength, Achievement, Needs Improvement) */}
          <div className="space-y-4">
            {/* 1. Strength / Progress */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>1. Strength / Developmental Progress</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {selectedStrengths.length} dipilih
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STRENGTH_PROGRESS_BANK.map((item) => {
                  const isChecked = selectedStrengths.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleItem(selectedStrengths, setSelectedStrengths, item)}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                        isChecked
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '} {item}
                    </button>
                  );
                })}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={customStrength}
                    onChange={(e) => setCustomStrength(e.target.value)}
                    placeholder="+ Tambah custom strength/progress..."
                    className="flex-1 text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customStrength.trim()) {
                        e.preventDefault();
                        setSelectedStrengths([...selectedStrengths, customStrength.trim()]);
                        setCustomStrength('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!customStrength.trim()}
                    onClick={() => {
                      if (customStrength.trim()) {
                        setSelectedStrengths([...selectedStrengths, customStrength.trim()]);
                        setCustomStrength('');
                      }
                    }}
                    className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                  >
                    Tambah
                  </button>
                </div>
              )}
            </div>

            {/* 2. Achievement */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>2. Achievement (Prestasi / Pencapaian Tertentu)</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {selectedAchievements.length} dipilih
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ACHIEVEMENT_BANK.map((item) => {
                  const isChecked = selectedAchievements.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleItem(selectedAchievements, setSelectedAchievements, item)}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '} {item}
                    </button>
                  );
                })}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={customAchievement}
                    onChange={(e) => setCustomAchievement(e.target.value)}
                    placeholder="+ Tambah custom achievement..."
                    className="flex-1 text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customAchievement.trim()) {
                        e.preventDefault();
                        setSelectedAchievements([...selectedAchievements, customAchievement.trim()]);
                        setCustomAchievement('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!customAchievement.trim()}
                    onClick={() => {
                      if (customAchievement.trim()) {
                        setSelectedAchievements([...selectedAchievements, customAchievement.trim()]);
                        setCustomAchievement('');
                      }
                    }}
                    className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                  >
                    Tambah
                  </button>
                </div>
              )}
            </div>

            {/* 3. Needs Improvement */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>3. Needs Improvement (Area Pengembangan)</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {selectedNeedsImprovement.length} dipilih
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {NEEDS_IMPROVEMENT_BANK.map((item) => {
                  const isChecked = selectedNeedsImprovement.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleItem(selectedNeedsImprovement, setSelectedNeedsImprovement, item)}
                      className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                        isChecked
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '} {item}
                    </button>
                  );
                })}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={customNeed}
                    onChange={(e) => setCustomNeed(e.target.value)}
                    placeholder="+ Tambah custom improvement..."
                    className="flex-1 text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customNeed.trim()) {
                        e.preventDefault();
                        setSelectedNeedsImprovement([...selectedNeedsImprovement, customNeed.trim()]);
                        setCustomNeed('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!customNeed.trim()}
                    onClick={() => {
                      if (customNeed.trim()) {
                        setSelectedNeedsImprovement([...selectedNeedsImprovement, customNeed.trim()]);
                        setCustomNeed('');
                      }
                    }}
                    className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-50"
                  >
                    Tambah
                  </button>
                </div>
              )}
            </div>

            {/* Manual Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Catatan Tambahan Guru (Opsional)
              </label>
              <textarea
                disabled={!canEdit}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                rows={2}
                placeholder="Tambahkan observasi khusus dari wali kelas..."
                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* AI Generator Action Button */}
          {canEdit && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerateAI}
                disabled={generatingAI}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles size={16} className={generatingAI ? 'animate-spin' : ''} />
                {generatingAI ? 'Sedang Menyusun dengan AI...' : 'Generate Komentar dengan AI (Gemini)'}
              </button>
            </div>
          )}

          {/* AI Draft Display (if exists) */}
          {aiDraft && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Draf AI Terakhir
                </span>
                <button
                  onClick={() => setFinalComment(aiDraft)}
                  className="text-[11px] text-emerald-600 font-bold hover:underline"
                >
                  Salin ke Final Comment
                </button>
              </div>
              <p className="text-xs text-slate-700 italic leading-relaxed">
                "{aiDraft}"
              </p>
            </div>
          )}

          {/* Final Comment Textarea & Polish with AI */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider">
                Final Comment (Dicetak pada Rapor)
              </label>

              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold ${
                    isWordCountExceeded ? 'text-rose-600 font-black' : 'text-slate-500'
                  }`}
                >
                  {wordCount} / 120 kata {isWordCountExceeded && '(Melebihi batas maksimal 120 kata!)'}
                </span>

                {canEdit && (
                  <button
                    type="button"
                    onClick={handlePolishAI}
                    disabled={polishingAI || !finalComment.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-bold hover:bg-teal-100 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Wand2 size={13} className={polishingAI ? 'animate-spin' : ''} />
                    {polishingAI ? 'Merapikan...' : 'Rapikan dengan AI'}
                  </button>
                )}
              </div>
            </div>

            <textarea
              disabled={!canEdit}
              value={finalComment}
              onChange={(e) => setFinalComment(e.target.value)}
              rows={4}
              placeholder="Tulis narasi komentar atau gunakan hasil generate AI di atas..."
              className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 leading-relaxed font-sans"
            />
          </div>

          {/* Action Footer: Mark as Final & Save */}
          {canEdit && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFinal}
                  onChange={(e) => setIsFinal(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Tandai komentar sebagai FINAL</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save size={13} />
                  {saving ? 'Menyimpan...' : 'Simpan Draf'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving || !finalComment.trim() || isWordCountExceeded}
                  className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  {saving ? 'Memproses...' : 'Simpan & Finalisasi'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
