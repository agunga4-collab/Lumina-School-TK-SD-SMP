import * as React from 'react';
import { 
  MessageSquare, Sparkles, User, RefreshCw, CheckCircle2, 
  AlertCircle, Save, Clock, ChevronRight, Check, X
} from 'lucide-react';
import { 
  saveElementaryMidtermGeneralComment 
} from '../../../services/elementaryMidtermService';
import type { 
  ElementaryMidtermStudentDataDoc,
  ElementaryMidtermGeneralCommentData
} from '../../../types/elementaryMidtermReport';
import type { Student, Class, User as UserType } from '../../../types';

interface ElementaryMidtermGeneralCommentsTabProps {
  selectedClassId: string;
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedTerm: string;
  students: Student[];
  studentDataMap: Record<string, ElementaryMidtermStudentDataDoc>;
  onRefreshData: () => Promise<void>;
  currentUser: UserType | null;
}

export const ElementaryMidtermGeneralCommentsTab: React.FC<ElementaryMidtermGeneralCommentsTabProps> = ({
  selectedClassId,
  selectedClass,
  selectedYear,
  selectedSemester,
  selectedTerm,
  students,
  studentDataMap,
  onRefreshData,
  currentUser
}) => {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(students[0]?.id || '');

  React.useEffect(() => {
    if (students.length > 0 && (!selectedStudentId || !students.some(s => s.id === selectedStudentId))) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const activeStudent = students.find(s => s.id === selectedStudentId) || students[0] || null;
  const currentStudentData = activeStudent ? studentDataMap[activeStudent.id] : null;

  // Form State
  const [manualCommentText, setManualCommentText] = React.useState<string>('');
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = React.useState<boolean>(false);
  const [aiGenerating, setAiGenerating] = React.useState<boolean>(false);

  // Synchronize form text when active student changes
  React.useEffect(() => {
    if (currentStudentData?.generalComment) {
      setManualCommentText(
        currentStudentData.generalComment.finalComment || 
        currentStudentData.generalComment.aiDraft || 
        ''
      );
    } else {
      setManualCommentText('');
    }
    setSaveSuccess(false);
  }, [selectedStudentId, currentStudentData]);

  const handleSaveComment = async () => {
    if (!activeStudent || !activeStudent.id) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const commentPayload: ElementaryMidtermGeneralCommentData = {
        studentName: activeStudent.name,
        strengths: currentStudentData?.generalComment?.strengths || [],
        achievements: currentStudentData?.generalComment?.achievements || [],
        needsImprovement: currentStudentData?.generalComment?.needsImprovement || [],
        manualNotes: manualCommentText,
        finalComment: manualCommentText,
        isFinal: true,
        updatedAt: Date.now(),
        updatedBy: currentUser?.id || 'system'
      };

      await saveElementaryMidtermGeneralComment(
        activeStudent.id,
        activeStudent.name,
        selectedClassId,
        selectedYear,
        selectedSemester,
        selectedTerm,
        commentPayload,
        currentUser
      );

      setSaveSuccess(true);
      await onRefreshData();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Error saving general comment:", e);
    } finally {
      setIsSaving(false);
    }
  };

  // Generate Simple AI Draft Fallback Template
  const handleGenerateAiDraft = () => {
    if (!activeStudent) return;
    setAiGenerating(true);
    setTimeout(() => {
      const name = activeStudent.name;
      const draft = `${name} telah menunjukkan perkembangan belajar yang positif pada periode Midterm ini. Aktif berpartisipasi dalam diskusi kelas, mampu bekerja sama dengan baik bersama teman-teman, dan menunjukkan semangat belajar yang konsisten pada seluruh aktivitas pembelajaran. Diharapkan ${name} dapat terus mempertahankan sikap positif ini di paruh semester berikutnya.`;
      setManualCommentText(draft);
      setAiGenerating(false);
    }, 600);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Sidebar: Student Selection List */}
      <div className="lg:col-span-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <User size={16} className="text-emerald-600" />
            <span>Daftar Siswa ({students.length})</span>
          </h3>
        </div>

        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          {students.map((st, idx) => {
            const isSelected = st.id === selectedStudentId;
            const stData = studentDataMap[st.id];
            const hasComment = Boolean(
              stData?.generalComment?.finalComment || stData?.generalComment?.aiDraft
            );
            const reviewStatus = stData?.generalCommentReviewStatus || 'DRAFT';

            return (
              <button
                key={st.id}
                onClick={() => setSelectedStudentId(st.id)}
                className={`w-full p-3 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-xl font-extrabold flex items-center justify-center text-[10px] ${
                    isSelected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {idx + 1}
                  </span>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {st.name}
                    </p>
                    <span className={`text-[10px] font-medium ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                      {reviewStatus}
                    </span>
                  </div>
                </div>

                {hasComment ? (
                  <CheckCircle2 size={16} className={isSelected ? 'text-emerald-400' : 'text-emerald-600'} />
                ) : (
                  <Clock size={16} className={isSelected ? 'text-slate-500' : 'text-slate-300'} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Column: General Comment Editor */}
      <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        {activeStudent ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <MessageSquare size={18} className="text-emerald-600" />
                  <span>General Comments: {activeStudent.name}</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Kelas {selectedClass?.name || ''} — Tahun Ajaran {selectedYear}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAiDraft}
                  disabled={aiGenerating}
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
                >
                  {aiGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>Generate Draf AI</span>
                </button>
              </div>
            </div>

            {/* Comment Textarea Box */}
            <div className="space-y-3">
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Catatan Perkembangan Umum Siswa:
              </label>
              <textarea
                value={manualCommentText}
                onChange={(e) => setManualCommentText(e.target.value)}
                rows={8}
                placeholder="Tuliskan catatan perkembangan umum siswa di sini..."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs leading-relaxed font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            {/* Action buttons & save feedback */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-xs font-extrabold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                    <CheckCircle2 size={16} />
                    Catatan berhasil disimpan!
                  </span>
                )}
              </div>

              <button
                onClick={handleSaveComment}
                disabled={isSaving || !manualCommentText.trim()}
                className="px-6 py-3 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-extrabold rounded-2xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-sm"
              >
                {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Simpan Catatan</span>
              </button>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-slate-400 font-medium text-xs">
            Pilih siswa pada daftar di samping untuk memasukkan General Comments.
          </div>
        )}
      </div>
    </div>
  );
};
