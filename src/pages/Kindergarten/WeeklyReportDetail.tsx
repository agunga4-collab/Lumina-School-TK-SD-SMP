import * as React from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { 
  doc, 
  getDoc,
  updateDoc,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User as AppUser } from '../../types';
import { 
  ChevronLeft, 
  FileText, 
  Loader2, 
  AlertCircle, 
  Image as ImageIcon,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Helper to sanitize strings and filter out placeholders
const sanitizeString = (val: any): string => {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';
  if (/^(undefined|null|-|Sentra undefined|domain undefined|Tidak ada deskripsi aktivitas)$/i.test(trimmed)) return '';
  if (trimmed.toLowerCase().includes('undefined') || trimmed.toLowerCase().includes('null')) return '';
  return trimmed;
};

// Indonesian date formatter
const formatDateIndonesia = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
};

const DAYS_ORDER: Array<{ key: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'; labelId: string; labelEn: string }> = [
  { key: 'monday', labelId: 'Senin', labelEn: 'Monday' },
  { key: 'tuesday', labelId: 'Selasa', labelEn: 'Tuesday' },
  { key: 'wednesday', labelId: 'Rabu', labelEn: 'Wednesday' },
  { key: 'thursday', labelId: 'Kamis', labelEn: 'Thursday' },
  { key: 'friday', labelId: 'Jumat', labelEn: 'Friday' },
];

export default function WeeklyReportDetail() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const trackedReportIdRef = React.useRef<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<any | null>(null);

  // Photo carousel index tracker per day
  const [photoIndexes, setPhotoIndexes] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const loadAndVerifyReport = async () => {
      if (!reportId) {
        setError("ID Laporan tidak ditemukan di URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const reportRef = doc(db, 'published_kg_reports', reportId);
        const reportSnap = await getDoc(reportRef);

        if (!reportSnap.exists()) {
          setError("Laporan tidak ditemukan. Silakan periksa kembali tautan Anda.");
          setLoading(false);
          return;
        }

        const reportData = {
          id: reportSnap.id,
          ...reportSnap.data()
        } as any;

        const reportStudentId = reportData.studentId || reportData.reportSnapshot?.student?.id;

        if (!reportStudentId) {
          setError("Data siswa pada laporan ini tidak valid.");
          setLoading(false);
          return;
        }

        // Access controls: Check student ownership if role is STUDENT
        if (currentUser?.role === 'STUDENT') {
          const userStudentId = currentUser?.luminaId || (currentUser as any)?.id;
          if (!userStudentId || userStudentId.trim() !== reportStudentId.trim()) {
            setError("Anda tidak memiliki izin untuk melihat laporan ini.");
            setLoading(false);
            return;
          }
        }

        // Check report status
        if (reportData.status !== 'sent' && !['TEACHER', 'HEAD_UNIT', 'SUPER_ADMIN', 'PARENT'].includes(currentUser?.role)) {
          setError("Laporan ini belum dikirim atau tidak dapat diakses.");
          setLoading(false);
          return;
        }

        setReport(reportData);

        // Tracking viewed status for students
        if (currentUser?.role === 'STUDENT' && trackedReportIdRef.current !== reportId) {
          trackedReportIdRef.current = reportId;
          const updatePayload: any = {
            lastStudentViewedAt: serverTimestamp(),
            viewCount: increment(1)
          };
          if (!reportData.studentViewedAt) {
            updatePayload.studentViewedAt = serverTimestamp();
          }
          try {
            await updateDoc(reportRef, updatePayload);
          } catch (trackErr) {
            console.warn("Failed to update student viewed status:", trackErr);
          }
        }
      } catch (err) {
        console.error("Error loading report detail:", err);
        setError("Gagal memuat detail laporan mingguan. Silakan coba lagi.");
      } finally {
        setLoading(false);
      }
    };

    loadAndVerifyReport();
  }, [reportId, currentUser]);

  const handleBackToList = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/student/reports');
    }
  };

  const handleNextPhoto = (dayKey: string, max: number) => {
    setPhotoIndexes(prev => ({
      ...prev,
      [dayKey]: ((prev[dayKey] || 0) + 1) % max
    }));
  };

  const handlePrevPhoto = (dayKey: string, max: number) => {
    setPhotoIndexes(prev => ({
      ...prev,
      [dayKey]: ((prev[dayKey] || 0) - 1 + max) % max
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-gray-100 shadow-md text-center space-y-4">
          <Loader2 className="w-8 h-8 text-[#109E58] animate-spin mx-auto" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Memuat Laporan Mingguan...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-red-50 text-center shadow-md space-y-5">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl mx-auto flex items-center justify-center">
            <AlertCircle size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Terjadi Kendala</h2>
            <p className="text-sm text-gray-500 leading-relaxed font-semibold">{error || "Laporan mingguan tidak dapat dimuat."}</p>
          </div>
          <button 
            onClick={handleBackToList}
            className="w-full py-3 bg-[#002366] text-white rounded-xl font-bold hover:bg-opacity-95 transition-all text-xs uppercase tracking-widest cursor-pointer"
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  const snapshot = report.reportSnapshot;

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-emerald-50 text-center shadow-md space-y-6">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center">
            <FileText size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Tampilan Mobile Belum Tersedia</h2>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Tampilan mobile interaktif hanya tersedia untuk laporan mingguan yang diterbitkan setelah pembaruan sistem.
            </p>
            <p className="text-xs text-gray-400 font-bold leading-normal pt-1">
              Anda masih dapat mengunduh dan membaca berkas PDF resmi dari Google Drive.
            </p>
          </div>
          
          <div className="space-y-3">
            {report.driveFileUrl && (
              <a
                href={report.driveFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-[#109E58] text-white rounded-xl font-extrabold flex items-center justify-center gap-2 hover:bg-opacity-95 transition-all text-xs uppercase tracking-widest shadow-sm cursor-pointer"
              >
                <ExternalLink size={14} /> Lihat PDF di Drive
              </a>
            )}
            <button 
              onClick={handleBackToList}
              className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all text-xs uppercase tracking-widest cursor-pointer"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  const periodRange = `${formatDateIndonesia(snapshot.period?.startDate)} - ${formatDateIndonesia(snapshot.period?.endDate)}`;

  const commentFormat =
    snapshot.commentFormat === "GENERAL_COMMENT"
      ? "GENERAL_COMMENT"
      : "LEGACY_TWO_COMMENTS";

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-0 sm:py-6">
      <div className="w-full max-w-md bg-white min-h-screen sm:min-h-0 sm:rounded-3xl shadow-xl border-x border-gray-100 flex flex-col relative pb-12 overflow-x-hidden">
        
        {/* Top Navigation Bar */}
        <div className="h-14 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 sticky top-0 z-20 shrink-0">
          <button 
            onClick={handleBackToList}
            className="flex items-center gap-1 text-gray-600 hover:text-[#109E58] transition-colors font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            <ChevronLeft size={18} />
            <span>Kembali</span>
          </button>
          
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">Laporan Mingguan</h2>
          
          {report.driveFileUrl ? (
            <a 
              href={report.driveFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-[#109E58] hover:bg-emerald-50 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] font-black uppercase"
              title="Lihat PDF"
            >
              <FileText size={16} />
              <span className="hidden sm:inline">PDF</span>
            </a>
          ) : (
            <div className="w-8" />
          )}
        </div>

        {/* 1. Header & School Identity */}
        <div className="bg-gradient-to-b from-[#109E58] to-emerald-800 text-white p-5 space-y-4 relative overflow-hidden">
          <div className="flex justify-between items-start gap-2 relative z-10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">
                TK ISLAM LAZUARDI
              </p>
              <h1 className="text-xl font-black tracking-tight uppercase leading-tight">
                LAPORAN MINGGUAN
              </h1>
              <p className="text-xs font-bold text-emerald-100 italic">
                WEEKLY REPORT
              </p>
            </div>
            <span className="shrink-0 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full text-[9px] font-black uppercase tracking-widest text-white border border-white/20 flex items-center gap-1">
              <ShieldCheck size={11} />
              <span>TERBIT</span>
            </span>
          </div>

          {/* Student & Period Info */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/15 text-xs space-y-2 font-medium text-white">
            <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
              <span className="text-emerald-200 font-bold uppercase text-[10px]">Siswa:</span>
              <span className="font-extrabold text-sm text-white">{snapshot.student?.name}</span>
            </div>
            <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
              <span className="text-emerald-200 font-bold uppercase text-[10px]">Kelas:</span>
              <span className="font-bold text-white">{snapshot.student?.className}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-emerald-200 font-bold uppercase text-[10px]">Periode:</span>
              <span className="font-bold text-white">Pekan {snapshot.period?.weekLabel} ({periodRange})</span>
            </div>
            {snapshot.period?.theme && (
              <div className="flex justify-between items-center pt-0.5 border-t border-white/10 mt-1">
                <span className="text-emerald-200 font-bold uppercase text-[10px]">Tema:</span>
                <span className="font-bold text-emerald-100 uppercase">{snapshot.period.theme}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. DOKUMENTASI KEGIATAN MINGGUAN */}
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
            <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
            <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">
              DOKUMENTASI KEGIATAN MINGGUAN
            </h2>
          </div>

          <div className="space-y-5">
            {DAYS_ORDER.map((day) => {
              const dayDoc = snapshot.dailyDocumentation?.[day.key] || {};
              const generalNote = sanitizeString(dayDoc.caption || dayDoc.generalNote);
              const secondaryLabel = sanitizeString(dayDoc.activityName);

              const photoUrls: string[] = Array.isArray(dayDoc.imageUrls) && dayDoc.imageUrls.length > 0
                ? dayDoc.imageUrls.filter((u: string) => typeof u === 'string' && u.trim().length > 0)
                : (dayDoc.imageUrl ? [dayDoc.imageUrl] : []);

              const currentPhotoIdx = photoIndexes[day.key] || 0;
              const activePhoto = photoUrls[currentPhotoIdx] || null;

              return (
                <div 
                  key={day.key}
                  className="bg-white rounded-2xl border-2 border-[#109E58] shadow-sm overflow-hidden flex flex-col w-full"
                >
                  {/* Day Header */}
                  <div className="bg-[#109E58] text-white px-3.5 py-2 font-black text-xs uppercase tracking-wider flex justify-between items-center">
                    <span>{day.labelId} / {day.labelEn}</span>
                    <span className="text-[10px] text-emerald-100 font-bold">
                      {dayDoc.date ? formatDateIndonesia(dayDoc.date) : ''}
                    </span>
                  </div>

                  {/* Day Photo */}
                  {activePhoto ? (
                    <div className="relative w-full bg-gray-900 flex items-center justify-center overflow-hidden min-h-[180px] max-h-[300px]">
                      <img 
                        src={activePhoto}
                        alt={`Dokumentasi ${day.labelId}`}
                        referrerPolicy="no-referrer"
                        className="w-full max-h-[300px] object-contain"
                      />

                      {/* Multi-photo controls */}
                      {photoUrls.length > 1 && (
                        <>
                          <button
                            onClick={() => handlePrevPhoto(day.key, photoUrls.length)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            onClick={() => handleNextPhoto(day.key, photoUrls.length)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer"
                          >
                            <ChevronRight size={16} />
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/50 rounded-full flex gap-1">
                            {photoUrls.map((_, pIdx) => (
                              <span 
                                key={pIdx}
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full transition-all",
                                  pIdx === currentPhotoIdx ? "bg-white scale-125" : "bg-white/40"
                                )}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="h-32 bg-gray-50 flex flex-col items-center justify-center text-gray-300 gap-1 border-b border-gray-100">
                      <ImageIcon size={28} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tanpa Foto</span>
                    </div>
                  )}

                  {/* Day Caption & Label */}
                  <div className="p-3 bg-gray-50/80 border-t border-gray-100 flex flex-col items-center text-center gap-1.5 w-full">
                    {secondaryLabel && (
                      <span className="font-black text-[#109E58] text-xs uppercase tracking-wider block text-center w-full truncate">
                        {secondaryLabel}
                      </span>
                    )}
                    {generalNote && (
                      <p 
                        className="text-gray-700 font-semibold text-xs text-center leading-relaxed w-full break-words max-h-[58px] overflow-hidden"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical'
                        }}
                      >
                        {generalNote}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {commentFormat === 'GENERAL_COMMENT' ? (
          /* 3. GENERAL COMMENTS */
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">
                GENERAL COMMENTS
              </h2>
            </div>
            <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl text-xs font-semibold text-gray-800 leading-relaxed whitespace-pre-line shadow-sm">
              {snapshot.generalComments?.trim() || "General comments belum diisi oleh guru."}
            </div>
          </div>
        ) : (
          <>
            {/* 3. CATATAN MINGGUAN GURU */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">
                  CATATAN MINGGUAN GURU
                </h2>
              </div>
              <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl text-xs font-semibold text-gray-800 leading-relaxed whitespace-pre-line shadow-sm">
                {snapshot.weeklyComments?.trim() || "Guru belum menambahkan catatan mingguan."}
              </div>
            </div>

            {/* 4. PERKEMBANGAN SOSIAL-EMOSIONAL */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">
                  PERKEMBANGAN SOSIAL-EMOSIONAL
                </h2>
              </div>
              <div className="p-4 bg-white border border-gray-200 rounded-2xl text-xs font-semibold text-gray-800 leading-relaxed whitespace-pre-line shadow-sm">
                {snapshot.socialEmotionalComment?.trim() || "Guru belum menambahkan catatan sosial-emosional."}
              </div>
            </div>
          </>
        )}

        {/* 5. TANDA TANGAN & UNDUH PDF */}
        <div className="p-4 border-t border-gray-100 pt-5 space-y-4">
          <div className="flex justify-between items-center bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Wali Kelas / Guru</p>
              <p className="text-xs font-extrabold text-gray-900">
                {snapshot.teacherName || report.publishedByEmail || 'Wali Kelas'}
              </p>
            </div>
            {snapshot.teacherSignatureUrl ? (
              <img 
                src={snapshot.teacherSignatureUrl} 
                alt="Tanda Tangan Guru" 
                className="h-10 object-contain"
              />
            ) : (
              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                <UserCheck size={12} />
                <span>Terverifikasi</span>
              </div>
            )}
          </div>

          {report.driveFileUrl && (
            <a
              href={report.driveFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-[#002366] text-white rounded-xl font-extrabold flex items-center justify-center gap-2 hover:bg-opacity-95 transition-all text-xs uppercase tracking-widest shadow-md cursor-pointer"
            >
              <ExternalLink size={14} /> Lihat Versi PDF (Google Drive)
            </a>
          )}

          <div className="text-center pt-2">
            <p className="text-[9px] font-bold text-gray-400">
              Laporan diterbitkan pada {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
