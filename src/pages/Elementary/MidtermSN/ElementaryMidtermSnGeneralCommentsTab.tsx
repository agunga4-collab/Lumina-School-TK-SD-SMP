import * as React from 'react';
import {
  MessageSquare, Sparkles, Save, CheckCircle2,
  AlertCircle, Loader2, Plus, Trash2, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { saveElemSnMidtermReport } from '../../../services/elementarySnMidtermService';
import type {
  ElementarySnMidtermReportDoc
} from '../../../types/elementaryMidtermSnReport';
import type { Student, Class, User } from '../../../types';

export const ELEM_SN_STRENGTH_PROGRESS_BANK = [
  'Menunjukkan antusiasme dan rasa ingin tahu yang tinggi dalam proses pembelajaran.',
  'Mampu mengikuti rutinitas harian di kelas dengan pendampingan yang konsisten.',
  'Memperlihatkan perkembangan positif dalam fokus dan konsentrasi saat mengerjakan tugas.',
  'Menunjukkan usaha dan kegigihan yang luar biasa dalam menyelesaikan instruksi bertahap.',
  'Aktif dan berani mengekspresikan diri serta berinteraksi dengan guru dan teman sebaya.',
  'Mampu mengenali dan mengekspresikan emosi dengan lebih adaptif dan tenang.'
];

export const ELEM_SN_ACHIEVEMENT_BANK = [
  'Berhasil mencapai target Learning Goals yang telah disesuaikan dengan sangat baik.',
  'Menunjukkan kemandirian yang semakin meningkat dalam kegiatan motorik dan bina diri.',
  'Mampu menyelesaikan tugas proyek individu maupun kelompok kecil secara tuntas.',
  'Menunjukkan kemampuan komunikasi dan penyampaian ide yang semakin berkembang.',
  'Dapat beradaptasi dengan baik pada lingkungan belajar dan transisi aktivitas baru.'
];

export const ELEM_SN_NEEDS_IMPROVEMENT_BANK = [
  'Perlu pendampingan lebih lanjut dalam mempertahankan fokus pada durasi aktivitas yang lebih panjang.',
  'Diharapkan terus berlatih mengelola emosi dan meregulasi diri saat menghadapi tantangan tugas.',
  'Perlu stimulasi berkelanjutan dalam penguasaan kosakata dan komunikasi dua arah.',
  'Dianjurkan untuk terus dibiasakan menyelesaikan instruksi secara mandiri di rumah.'
];

interface ElementaryMidtermSnGeneralCommentsTabProps {
  currentUser: User;
  selectedClass: Class;
  selectedStudent: Student;
  reportDoc: ElementarySnMidtermReportDoc;
  onUpdateReportDoc: (updated: ElementarySnMidtermReportDoc) => void;
  onRefreshData: () => Promise<void>;
  loading: boolean;
}

export const ElementaryMidtermSnGeneralCommentsTab: React.FC<ElementaryMidtermSnGeneralCommentsTabProps> = ({
  currentUser,
  selectedClass,
  selectedStudent,
  reportDoc,
  onUpdateReportDoc,
  onRefreshData,
  loading
}) => {
  const [finalComment, setFinalComment] = React.useState<string>('');
  const [manualNotes, setManualNotes] = React.useState<string>('');
  const [selectedStrengths, setSelectedStrengths] = React.useState<string[]>([]);
  const [selectedAchievements, setSelectedAchievements] = React.useState<string[]>([]);
  const [selectedNeedsImprovement, setSelectedNeedsImprovement] = React.useState<string[]>([]);
  const [attendance, setAttendance] = React.useState<{ sakit: number; izin: number; tanpaKeterangan: number }>({
    sakit: 0,
    izin: 0,
    tanpaKeterangan: 0
  });

  const [saving, setSaving] = React.useState<boolean>(false);
  const [generatingAI, setGeneratingAI] = React.useState<boolean>(false);

  // Sync state when reportDoc changes
  React.useEffect(() => {
    if (reportDoc) {
      setFinalComment(reportDoc.generalComment?.finalComment || '');
      setManualNotes(reportDoc.generalComment?.manualNotes || '');
      setSelectedStrengths(reportDoc.generalComment?.strengths || []);
      setSelectedAchievements(reportDoc.generalComment?.achievements || []);
      setSelectedNeedsImprovement(reportDoc.generalComment?.needsImprovement || []);
      setAttendance(reportDoc.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 });
    }
  }, [reportDoc]);

  const toggleStrength = (item: string) => {
    setSelectedStrengths((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const toggleAchievement = (item: string) => {
    setSelectedAchievements((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const toggleNeed = (item: string) => {
    setSelectedNeedsImprovement((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const handleGenerateDraft = () => {
    setGeneratingAI(true);
    try {
      const studentName = selectedStudent.name || 'Ananda';
      const parts: string[] = [];

      // Opening paragraph with strengths
      if (selectedStrengths.length > 0) {
        parts.push(`Sepanjang pertengahan semester ini, ${studentName} ${selectedStrengths.join(' Selain itu, ')}.`);
      } else {
        parts.push(`Sepanjang pertengahan semester ini, ${studentName} menunjukkan proses belajar yang penuh semangat dan dedikasi.`);
      }

      // Achievement paragraph
      if (selectedAchievements.length > 0) {
        parts.push(`Dalam pencapaian tujuan pembelajaran yang telah disesuaikan, ${studentName} ${selectedAchievements.join(' Serta ')}.`);
      }

      // Needs improvement / support paragraph
      if (selectedNeedsImprovement.length > 0) {
        parts.push(`Untuk pengembangan ke depan, ${studentName} ${selectedNeedsImprovement.join(' ')}.`);
      }

      // Additional manual notes
      if (manualNotes.trim()) {
        parts.push(manualNotes.trim());
      }

      const generated = parts.join('\n\n');
      setFinalComment(generated);
      toast.success('Draf komentar umum berhasil digenerate!');
    } catch (err: any) {
      toast.error('Gagal membuat draf komentar.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSave = async () => {
    if (!reportDoc || !selectedStudent?.id || !selectedClass?.id || !currentUser?.uid) {
      toast.error('Data laporan tidak lengkap.');
      return;
    }

    setSaving(true);
    try {
      const updatedDoc: ElementarySnMidtermReportDoc = {
        ...reportDoc,
        generalComment: {
          ...reportDoc.generalComment,
          finalComment,
          manualNotes,
          strengths: selectedStrengths,
          achievements: selectedAchievements,
          needsImprovement: selectedNeedsImprovement,
          updatedAt: Date.now(),
          updatedBy: currentUser.uid
        },
        attendance,
        updatedAt: Date.now(),
        updatedBy: currentUser.uid
      };

      await saveElemSnMidtermReport(updatedDoc, currentUser);
      onUpdateReportDoc(updatedDoc);
      toast.success('General Comments & Presensi Siswa SN berhasil disimpan!');
    } catch (err: any) {
      console.error('[ElementaryMidtermSnGeneralCommentsTab] save error:', err);
      toast.error('Gagal menyimpan komentar: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              General Comments & Presensi Siswa SN: <span className="text-amber-800">{selectedStudent.name}</span>
            </h2>
            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-black uppercase">
              SN Context
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Tulis narasi komentar umum dan rekap kehadiran khusus untuk siswa SN ini yang akan tercetak pada halaman PDF Rapor.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          <span>Simpan Komentar</span>
        </button>
      </div>

      {/* Attendance Inputs Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Rekap Kehadiran Siswa SN
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">(Tercetak pada PDF)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Sakit (hari)
            </label>
            <input
              type="number"
              min={0}
              value={attendance.sakit}
              onChange={(e) => setAttendance({ ...attendance, sakit: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Izin (hari)
            </label>
            <input
              type="number"
              min={0}
              value={attendance.izin}
              onChange={(e) => setAttendance({ ...attendance, izin: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Tanpa Keterangan (hari)
            </label>
            <input
              type="number"
              min={0}
              value={attendance.tanpaKeterangan}
              onChange={(e) => setAttendance({ ...attendance, tanpaKeterangan: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Phrase Banks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strengths & Progress */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                Kekuatan & Perkembangan
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">Pilih poin keunggulan siswa:</p>
            <div className="space-y-2">
              {ELEM_SN_STRENGTH_PROGRESS_BANK.map((item, idx) => {
                const isSelected = selectedStrengths.includes(item);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleStrength(item)}
                    className={`p-3 rounded-2xl text-xs font-medium cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                        : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <CheckCircle2 size={12} />}
                      </div>
                      <span className="leading-relaxed">{item}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                Capaian & Pembelajaran
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">Pilih capaian positif siswa:</p>
            <div className="space-y-2">
              {ELEM_SN_ACHIEVEMENT_BANK.map((item, idx) => {
                const isSelected = selectedAchievements.includes(item);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleAchievement(item)}
                    className={`p-3 rounded-2xl text-xs font-medium cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
                        : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-amber-600 border-amber-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <CheckCircle2 size={12} />}
                      </div>
                      <span className="leading-relaxed">{item}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Needs Improvement & Support */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                Rekomendasi & Dukungan
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">Pilih aspek yang perlu didukung:</p>
            <div className="space-y-2">
              {ELEM_SN_NEEDS_IMPROVEMENT_BANK.map((item, idx) => {
                const isSelected = selectedNeedsImprovement.includes(item);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleNeed(item)}
                    className={`p-3 rounded-2xl text-xs font-medium cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-sky-50 border-sky-300 text-sky-900 shadow-xs'
                        : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <CheckCircle2 size={12} />}
                      </div>
                      <span className="leading-relaxed">{item}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Notes & AI Generator */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
            Catatan Tambahan & Generator Draf
          </h3>
          <button
            onClick={handleGenerateDraft}
            disabled={generatingAI}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white text-xs font-bold rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Sparkles size={16} className="text-amber-200" />
            <span>Susun Draf Komentar Otomatis</span>
          </button>
        </div>

        <textarea
          value={manualNotes}
          onChange={(e) => setManualNotes(e.target.value)}
          placeholder="Tulis catatan personal guru mengenai siswa ini (opsional)..."
          rows={2}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-500 outline-hidden resize-y"
        />
      </div>

      {/* Final Comment Text Area */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-amber-800" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              Komentar Akhir (Tercetak pada Rapor)
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            {finalComment.length} karakter
          </span>
        </div>

        <textarea
          value={finalComment}
          onChange={(e) => setFinalComment(e.target.value)}
          placeholder="Tulis atau periksa komentar akhir di sini..."
          rows={6}
          className="w-full p-4 bg-slate-50/50 border border-slate-300 rounded-2xl text-xs font-medium text-slate-900 leading-relaxed focus:ring-2 focus:ring-amber-500 outline-hidden resize-y whitespace-pre-wrap"
        />

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>Simpan Komentar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
