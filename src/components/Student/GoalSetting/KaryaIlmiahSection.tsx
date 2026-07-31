import * as React from 'react';
import { BookOpen, AlertCircle } from 'lucide-react';

interface KaryaIlmiahSectionProps {
  karyaIlmiahReferenceId: string;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
  reviews?: {
    karyaIlmiah?: { status: string; comment?: string };
  };
}

export default function KaryaIlmiahSection({
  karyaIlmiahReferenceId,
  disabled,
  onChange,
  reviews,
}: KaryaIlmiahSectionProps) {

  const isFieldDisabled = () => {
    if (disabled) return true;
    if (!reviews) return false;
    const rev = reviews.karyaIlmiah;
    if (!rev) return false;
    return rev.status !== 'REVISION_REQUIRED';
  };

  const renderFeedback = () => {
    const rev = reviews?.karyaIlmiah;
    if (!rev || !rev.comment) return null;
    
    return (
      <div className={`p-4 rounded-xl text-xs mt-3 font-medium border ${
        rev.status === 'APPROVED' 
          ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
          : rev.status === 'REVISION_REQUIRED' 
            ? 'bg-rose-50 text-rose-800 border-rose-100 animate-pulse' 
            : 'bg-gray-50 text-gray-700 border-gray-100'
      }`}>
        <p className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider">
          {rev.status === 'APPROVED' ? '✓ Disetujui Guru' : rev.status === 'REVISION_REQUIRED' ? '⚠ Perlu Revisi' : 'Reviewer'}
        </p>
        <p className="mt-1.5 leading-relaxed">{rev.comment}</p>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Introduction Card */}
      <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Karya Ilmiah Reference</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Grade 9 Research Proposal</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl text-xs text-amber-800 flex items-start gap-2.5">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-black uppercase tracking-wider text-[9px] text-amber-700">PENTING BAGI SISWA KELAS 9</p>
              <p className="mt-0.5 leading-relaxed font-medium">
                Sebagai siswa kelas 9, Anda wajib menyertakan rujukan topik, judul, atau ID proposal Karya Ilmiah Anda. Informasi ini akan didiskusikan selama sesi Three-Way Conference.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Topik / Judul / ID Rujukan Karya Ilmiah *
            </label>
            <p className="text-xs text-gray-400 font-medium">
              Masukkan topik penelitian, judul Karya Ilmiah, atau ID proposal pendaftaran riset Anda secara jelas.
            </p>
            <input
              type="text"
              disabled={isFieldDisabled()}
              value={karyaIlmiahReferenceId}
              onChange={(e) => onChange('karyaIlmiahReferenceId', e.target.value)}
              placeholder="Contoh: ID Proposal #908 - Studi Efektivitas Energi Terbarukan pada Lumina School"
              className="w-full p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-blue-500 outline-none transition-all duration-200 text-sm font-bold text-gray-700 leading-relaxed placeholder:text-gray-300 disabled:opacity-75"
            />
            {renderFeedback()}
          </div>
        </div>
      </div>
    </div>
  );
}
