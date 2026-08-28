import * as React from 'react';
import { 
  BookOpen, Calculator, Sparkles, MessageCircleCode, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { JuniorHighAAPResult, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { cn, makeAAPResultId } from '../../lib/utils';

const normalizeMathLevelForRender = (val: string | null | undefined): string => {
  if (!val) return 'Belum ada hasil asesmen';
  const trimmed = val.trim().replace(/\s+/g, ' ').toLowerCase();
  if (trimmed === '-' || trimmed === 'unknown' || trimmed === '') return 'Belum ada hasil asesmen';
  if (trimmed.includes('beginning') || trimmed.includes('foundations') || trimmed.includes('building')) return 'Beginning Understanding';
  if (trimmed.includes('supported') || trimmed.includes('guidance') || trimmed.includes('growing')) return 'Supported Understanding';
  if (trimmed.includes('independent') || trimmed.includes('independently') || trimmed.includes('progressing')) return 'Independent Understanding';
  if (trimmed.includes('mastery') || trimmed.includes('demonstrating')) return 'Demonstrating Mastery';
  return val; // fallback
};

const normalizeEnglishLevelForRender = (val: string | null | undefined): string => {
  if (!val) return 'Belum ada hasil asesmen';
  const trimmed = val.trim().replace(/\s+/g, ' ').toUpperCase();
  if (trimmed === '-' || trimmed === 'UNKNOWN' || trimmed === '') return 'Belum ada hasil asesmen';
  if (trimmed === 'IR+' || trimmed === 'IR +') return 'IR+';
  if (trimmed === 'ER') return 'ER';
  if (trimmed === 'ER EN' || trimmed === 'EREN' || trimmed.includes('ER EN') || trimmed.includes('ER-EN')) return 'ER EN';
  return val; // fallback
};

const getEnglishFullMeaning = (val: string): string => {
  if (val === 'IR+') return 'IR+ — Intensive Reading Plus (Needs Support)';
  if (val === 'ER') return 'ER — Extensive Reading (On Level)';
  if (val === 'ER EN') return 'ER EN — Extensive Reading Enrichment (Above Level)';
  return val;
};

const getMengajiFullMeaning = (val: string | null | undefined): string => {
  if (!val) return '—';
  const upper = val.toUpperCase().trim();
  if (upper === 'ISYROF') return 'Isyrof — Perlu pendampingan intensif';
  if (upper === 'MUBTADI') return 'Mubtadi — Pemula';
  if (upper === 'MAQBUL') return 'Maqbul — Cukup';
  if (upper === 'JAYYID') return 'Jayyid — Baik';
  return val;
};

// Helper component to render progress pathways
interface PathwayProps {
  steps: string[];
  currentValue: string;
  activeColor: string;
}

function ProgressPathway({ steps, currentValue, activeColor }: PathwayProps) {
  const currentIndex = steps.findIndex(s => s.toLowerCase().trim() === currentValue.toLowerCase().trim());

  return (
    <div className="w-full py-4">
      {/* Visual Line and Dots */}
      <div className="relative flex items-center justify-between">
        {/* Connecting Background Line */}
        <div className="absolute left-0 right-0 h-1 bg-gray-100 -z-10 top-1/2 transform -translate-y-1/2 rounded-full" />
        
        {/* Active Connecting Line */}
        {currentIndex !== -1 && (
          <div 
            className="absolute left-0 h-1 -z-10 top-1/2 transform -translate-y-1/2 rounded-full transition-all duration-500"
            style={{ 
              width: `${(currentIndex / (steps.length - 1)) * 100}%`,
              backgroundColor: activeColor 
            }}
          />
        )}

        {steps.map((step, idx) => {
          const isActive = idx === currentIndex;
          const isPassed = idx < currentIndex;
          
          return (
            <div key={step} className="flex flex-col items-center flex-1 text-center relative">
              {/* Dot indicator */}
              <div 
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 border-2",
                  isActive ? "scale-125 z-10" : "scale-100",
                  isActive ? "bg-white" : isPassed ? "bg-white" : "bg-gray-50",
                  isActive ? "border-blue-600 text-blue-600" : isPassed ? "text-blue-500" : "border-gray-200 text-gray-400"
                )}
                style={isActive ? { borderColor: activeColor, color: activeColor } : isPassed ? { borderColor: activeColor, color: activeColor } : {}}
              >
                {isActive ? (
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeColor }} />
                ) : isPassed ? (
                  <CheckCircle size={12} style={{ color: activeColor }} />
                ) : (
                  idx + 1
                )}
              </div>
              
              {/* Step Text */}
              <span 
                className={cn(
                  "mt-2 text-[9px] sm:text-[10px] font-black uppercase tracking-wider max-w-[120px] transition-colors leading-tight",
                  isActive ? "text-gray-900" : "text-gray-400"
                )}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AAPStudentPage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [studentInfo, setStudentInfo] = React.useState<Student | null>(null);
  const [aapResult, setAapResult] = React.useState<JuniorHighAAPResult | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchStudentAndAAP = async () => {
      if (!profile) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        let resolvedStudentId = profile.luminaId || null;
        let sInfo: Student | null = null;

        // Try to query 'students' collection if no direct luminaId or to get name snapshots
        if (profile.email) {
          const targetEmail = profile.email.toLowerCase().trim();
          const sSnap = await getDocs(query(
            collection(db, 'students'),
            where('email', 'in', [targetEmail, profile.email, profile.email.toLowerCase(), profile.email.trim()]),
            limit(1)
          ));
          if (!sSnap.empty) {
            resolvedStudentId = sSnap.docs[0].id;
            sInfo = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() } as Student;
            setStudentInfo(sInfo);
          }
        }

        if (!resolvedStudentId) {
          setError("Data akun Anda belum terhubung ke data siswa.");
          setLoading(false);
          return;
        }

        setStudentId(resolvedStudentId);

        // Fetch published AAP record
        const docId = makeAAPResultId(resolvedStudentId, activeYear);
        const docRef = doc(db, 'junior_high_aap_results', docId);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          const data = snap.data() as JuniorHighAAPResult;
          if (data.status === 'PUBLISHED') {
            setAapResult(data);
          } else {
            setAapResult(null); // Keep as null to trigger 'Not published yet' message
          }
        } else {
          setAapResult(null);
        }

      } catch (err) {
        console.error("Error loading AAP result:", err);
        setError("Gagal memuat hasil Asesmen Awal Pembelajaran.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudentAndAAP();
  }, [profile, activeYear]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <Loader2 className="animate-spin w-12 h-12 text-blue-600 mx-auto mb-4" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat hasil Asesmen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 max-w-lg mx-auto text-center bg-white rounded-[3rem] border border-gray-100 shadow-sm">
        <AlertCircle size={44} className="mx-auto text-amber-500 mb-4" />
        <h3 className="text-lg font-black uppercase tracking-tight text-gray-900 mb-1">Informasi Akun</h3>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (!aapResult) {
    return (
      <div className="p-12 max-w-xl mx-auto text-center bg-white rounded-[3rem] border border-gray-100 shadow-sm mt-10">
        <Sparkles size={48} className="mx-auto text-blue-500/80 mb-4" />
        <h2 className="text-lg font-black uppercase italic tracking-tight text-gray-900 mb-2">Hasil AAP Belum Tersedia</h2>
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed font-medium">
          Hasil Asesmen Awal Pembelajaran belum tersedia.<br />
          Hasil akan tampil setelah dipublikasikan oleh sekolah.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* AAP Header */}
      <div>
        <div className="flex items-center gap-2 text-blue-600">
          <Sparkles size={18} />
          <span className="text-xs font-black uppercase tracking-widest">Asesmen Awal Pembelajaran</span>
        </div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase mt-1">Laporan Hasil AAP</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-xs font-bold text-gray-400">
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
            {aapResult.academicYear}
          </span>
          <span>Kelas: <strong className="text-gray-700 uppercase italic">{aapResult.classNameSnapshot}</strong></span>
          <span>Siswa: <strong className="text-gray-700 uppercase italic">{aapResult.studentNameSnapshot}</strong></span>
        </div>
      </div>

      {/* Assessment Areas Grids */}
      <div className="space-y-6">
        
        {/* 1. Matematika */}
        {(() => {
          const displayMath = normalizeMathLevelForRender(aapResult.mathLevel);
          const hasMathPathway = displayMath !== 'Belum ada hasil asesmen';
          return (
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Calculator size={20} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Dimensi Literasi</h3>
                  <h2 className="text-lg font-black uppercase italic tracking-tight text-indigo-900">Matematika</h2>
                </div>
              </div>

              <div className="p-5 bg-indigo-50/30 rounded-2xl border border-indigo-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs font-black text-indigo-800 uppercase tracking-wider">Capaian Saat Ini:</span>
                <span className="text-sm font-black text-indigo-700 uppercase italic tracking-wide">
                  {displayMath}
                </span>
              </div>

              {hasMathPathway && (
                <ProgressPathway 
                  steps={['Beginning Understanding', 'Supported Understanding', 'Independent Understanding', 'Demonstrating Mastery']}
                  currentValue={displayMath}
                  activeColor="#4f46e5" // Indigo-600
                />
              )}
            </div>
          );
        })()}

        {/* 2. Reading Fluency */}
        {(() => {
          const displayEnglish = normalizeEnglishLevelForRender(aapResult.readingFluencyLevel);
          const hasEnglishPathway = displayEnglish !== 'Belum ada hasil asesmen';
          return (
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Dimensi Literasi Bahasa</h3>
                  <h2 className="text-lg font-black uppercase italic tracking-tight text-amber-900">Reading Fluency</h2>
                </div>
              </div>

              <div className="p-5 bg-amber-50/30 rounded-2xl border border-amber-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs font-black text-amber-800 uppercase tracking-wider">Tingkat Kemampuan:</span>
                <span className="text-sm font-black text-amber-700 block">
                  {getEnglishFullMeaning(displayEnglish)}
                </span>
              </div>

              {hasEnglishPathway && (
                <ProgressPathway 
                  steps={['IR+', 'ER', 'ER EN']}
                  currentValue={displayEnglish}
                  activeColor="#d97706" // Amber-600
                />
              )}

              {hasEnglishPathway && (
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Keterangan Reading Fluency</h4>
                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-600">
                    <div><span className="font-bold text-gray-700">IR+</span> — Intensive Reading Plus (Needs Support)</div>
                    <div><span className="font-bold text-gray-700">ER</span> — Extensive Reading (On Level)</div>
                    <div><span className="font-bold text-gray-700">ER EN</span> — Extensive Reading Enrichment (Above Level)</div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 3. Mengaji */}
        {(aapResult.mengajiMaterial || aapResult.mengajiCategory) && (
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Dimensi Keagamaan</h3>
                <h2 className="text-lg font-black uppercase italic tracking-tight text-emerald-900">Mengaji</h2>
              </div>
            </div>

            {/* Split Material & Category Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 bg-emerald-50/20 rounded-2xl border border-emerald-50/50 space-y-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Materi Saat Ini</span>
                <span className="text-sm sm:text-base font-black text-emerald-800 block">
                  Materi saat ini: {aapResult.mengajiMaterial || '—'}
                </span>
              </div>
              <div className="p-5 bg-emerald-50/20 rounded-2xl border border-emerald-50/50 space-y-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Kategori Capaian</span>
                <span className="text-sm sm:text-base font-black text-emerald-800 block">
                  Kategori capaian: {getMengajiFullMeaning(aapResult.mengajiCategory)}
                </span>
              </div>
            </div>

            <ProgressPathway 
              steps={['Isyrof', 'Mubtadi', 'Maqbul', 'Jayyid']}
              currentValue={aapResult.mengajiCategory}
              activeColor="#059669" // Emerald-600
            />

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Keterangan Mengaji</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                <div><span className="font-bold text-gray-700">Isyrof</span> — Perlu pendampingan intensif</div>
                <div><span className="font-bold text-gray-700">Mubtadi</span> — Pemula</div>
                <div><span className="font-bold text-gray-700">Maqbul</span> — Cukup</div>
                <div><span className="font-bold text-gray-700">Jayyid</span> — Baik</div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Bahasa Indonesia */}
        {aapResult.bahasaIndonesiaLabel && (
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                <MessageCircleCode size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Dimensi Kebahasaan</h3>
                <h2 className="text-lg font-black uppercase italic tracking-tight text-blue-900">Bahasa Indonesia</h2>
              </div>
            </div>

            <div className="p-5 bg-blue-50/30 rounded-2xl border border-blue-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-blue-800 uppercase tracking-wider">Level {aapResult.bahasaIndonesiaLevel}:</span>
              </div>
              <span className="text-sm font-black text-blue-700 uppercase italic tracking-wide">
                {aapResult.bahasaIndonesiaLabel}
              </span>
            </div>

            <ProgressPathway 
              steps={['Perlu Pendampingan Intensif', 'Perlu Penguatan Terarah', 'Siap Berkembang', 'Siap Lanjut']}
              currentValue={aapResult.bahasaIndonesiaLabel}
              activeColor="#2563eb" // Blue-600
            />
          </div>
        )}

      </div>
    </div>
  );
}
