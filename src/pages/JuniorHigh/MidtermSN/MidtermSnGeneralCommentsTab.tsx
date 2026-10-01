import * as React from 'react';
import {
  MessageSquare, Sparkles, Save, CheckCircle2,
  AlertCircle, Loader2, Plus, Trash2, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import {
  STRENGTH_PROGRESS_BANK,
  ACHIEVEMENT_BANK,
  NEEDS_IMPROVEMENT_BANK
} from '../../../services/juniorHighMidtermService';
import { saveSnMidtermReport } from '../../../services/juniorHighSnMidtermService';
import type { SnMidtermReportDoc } from '../../../types/midtermSnReport';
import type { Student, Class, User } from '../../../types';

interface MidtermSnGeneralCommentsTabProps {
  currentUser: User;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: SnMidtermReportDoc;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const MidtermSnGeneralCommentsTab: React.FC<MidtermSnGeneralCommentsTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  onRefreshData,
  loading
}) => {
  const [finalComment, setFinalComment] = React.useState<string>(
    reportDoc.generalComment?.finalComment || ''
  );
  const [manualNotes, setManualNotes] = React.useState<string>(
    reportDoc.generalComment?.manualNotes || ''
  );

  const [selectedStrengths, setSelectedStrengths] = React.useState<string[]>(
    reportDoc.generalComment?.strengths || []
  );
  const [selectedAchievements, setSelectedAchievements] = React.useState<string[]>(
    reportDoc.generalComment?.achievements || []
  );
  const [selectedNeeds, setSelectedNeeds] = React.useState<string[]>(
    reportDoc.generalComment?.needsImprovement || []
  );

  const [saving, setSaving] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (reportDoc?.generalComment) {
      setFinalComment(reportDoc.generalComment.finalComment || '');
      setManualNotes(reportDoc.generalComment.manualNotes || '');
      setSelectedStrengths(reportDoc.generalComment.strengths || []);
      setSelectedAchievements(reportDoc.generalComment.achievements || []);
      setSelectedNeeds(reportDoc.generalComment.needsImprovement || []);
    }
  }, [reportDoc?.id, reportDoc?.updatedAt]);

  const handleGenerateAiDraft = () => {
    const studentFirstName = (selectedStudent.name || 'Siswa').split(' ')[0];

    let generated = `Selama periode midterm ini, ${studentFirstName} menunjukkan perkembangan yang baik dengan program pendampingan khusus. `;

    if (selectedStrengths.length > 0) {
      generated += `${studentFirstName} ${selectedStrengths.join(', ')}. `;
    }

    if (selectedAchievements.length > 0) {
      generated += `Pencapaian khusus yang dicapai antara lain: ${selectedAchievements.join(', ')}. `;
    }

    if (selectedNeeds.length > 0) {
      generated += `Untuk peningkatan selanjutnya, ${studentFirstName} disarankan untuk ${selectedNeeds.join(', ')}. `;
    }

    if (manualNotes.trim()) {
      generated += `Catatan Khusus Guru: ${manualNotes.trim()}`;
    }

    setFinalComment(generated.trim());
    toast.success('Draf Komentar berhasil digenerate berdasarkan frasa yang dipilih!');
  };

  const handleSaveGeneralComment = async () => {
    setSaving(true);
    try {
      const updatedGenCom = {
        ...reportDoc.generalComment,
        finalComment,
        manualNotes,
        strengths: selectedStrengths,
        achievements: selectedAchievements,
        needsImprovement: selectedNeeds,
        status: reportDoc.generalComment?.status || 'DRAFT',
        updatedAt: Date.now(),
        updatedBy: currentUser.uid
      };

      await saveSnMidtermReport(
        {
          ...reportDoc,
          generalComment: updatedGenCom
        },
        currentUser
      );

      toast.success('General Comment berhasil disimpan!');
    } catch (err: any) {
      toast.error('Gagal menyimpan General Comment: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const toggleSelection = (
    item: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-3xl p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} className="text-purple-300" />
            <h2 className="text-base font-black tracking-tight">
              General Comments: <span className="text-amber-300">{selectedStudent.name}</span>
            </h2>
          </div>
          <p className="text-xs text-purple-200">
            Tuliskan narasi perkembangan, kekuatan, dan area peningkatan untuk {selectedStudent.name}.
          </p>
        </div>

        <button
          onClick={handleSaveGeneralComment}
          disabled={saving}
          className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          <span>Simpan Komentar</span>
        </button>
      </div>

      {/* Phrase Bank Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Strength & Progress */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            Kekuatan & Perkembangan
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {STRENGTH_PROGRESS_BANK.map((item, idx) => {
              const active = selectedStrengths.includes(item);
              return (
                <button
                  key={idx}
                  onClick={() => toggleSelection(item, selectedStrengths, setSelectedStrengths)}
                  className={`w-full text-left p-2.5 rounded-2xl text-[11px] font-semibold transition-all border cursor-pointer ${
                    active
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                      : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        {/* Achievement Bank */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            Pencapaian Khusus
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {ACHIEVEMENT_BANK.map((item, idx) => {
              const active = selectedAchievements.includes(item);
              return (
                <button
                  key={idx}
                  onClick={() => toggleSelection(item, selectedAchievements, setSelectedAchievements)}
                  className={`w-full text-left p-2.5 rounded-2xl text-[11px] font-semibold transition-all border cursor-pointer ${
                    active
                      ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                      : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        {/* Needs Improvement Bank */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            Area Peningkatan
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {NEEDS_IMPROVEMENT_BANK.map((item, idx) => {
              const active = selectedNeeds.includes(item);
              return (
                <button
                  key={idx}
                  onClick={() => toggleSelection(item, selectedNeeds, setSelectedNeeds)}
                  className={`w-full text-left p-2.5 rounded-2xl text-[11px] font-semibold transition-all border cursor-pointer ${
                    active
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                      : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Manual Notes & AI Generate */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
            Catatan Tambahan & Draf Komentar
          </h3>
          <button
            onClick={handleGenerateAiDraft}
            className="px-4 py-2 bg-purple-900 hover:bg-purple-800 text-white text-xs font-bold rounded-2xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Sparkles size={14} className="text-amber-300" />
            <span>Generate Draf dari Frasa Terpilih</span>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Catatan Manual Guru (Opsional)
            </label>
            <input
              type="text"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Contoh: Menunjukkan motivasi luar biasa dalam sesi mentoring..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Narasi General Comment Final
            </label>
            <textarea
              rows={5}
              value={finalComment}
              onChange={(e) => setFinalComment(e.target.value)}
              placeholder="Tuliskan narasi lengkap untuk rapor..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 leading-relaxed"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveGeneralComment}
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>Simpan Narasi Final</span>
          </button>
        </div>
      </div>
    </div>
  );
};
