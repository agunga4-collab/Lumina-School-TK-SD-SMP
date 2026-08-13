import * as React from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { 
  collection, 
  doc, 
  getDoc,
  updateDoc,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  User as AppUser,
  Student
} from '../../types';
import { 
  ChevronLeft, 
  FileText, 
  Calendar, 
  Award, 
  CheckCircle2, 
  Heart, 
  Smile, 
  Meh, 
  Frown, 
  Flame, 
  Loader2, 
  AlertCircle, 
  Image as ImageIcon,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

export default function WeeklyReportDetail() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const trackedReportIdRef = React.useRef<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<any | null>(null);
  const [activeDayKey, setActiveDayKey] = React.useState<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'>('monday');
  const [innerPhotoIndexes, setInnerPhotoIndexes] = React.useState<Record<string, number>>({
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0
  });

  const daysList: Array<{ key: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'; label: string }> = [
    { key: 'monday', label: 'Senin' },
    { key: 'tuesday', label: 'Selasa' },
    { key: 'wednesday', label: 'Rabu' },
    { key: 'thursday', label: 'Kamis' },
    { key: 'friday', label: 'Jumat' }
  ];

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
        // 1. Fetch Report Document
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

        // 2. Security / Ownership check
        const reportStudentId = reportData.studentId || reportData.reportSnapshot?.student?.id;

        if (!reportStudentId) {
          setError("Data siswa pada laporan ini tidak valid.");
          setLoading(false);
          return;
        }

        // Access controls
        const isStudent = currentUser?.role === 'STUDENT';
        if (isStudent) {
          const userStudentId = currentUser?.luminaId;
          if (!userStudentId || userStudentId.trim() !== reportStudentId.trim()) {
            setError("Anda tidak memiliki izin untuk melihat laporan ini.");
            setLoading(false);
            return;
          }
          if (reportData.status !== 'sent') {
            setError("Laporan ini belum dikirim atau tidak dapat diakses.");
            setLoading(false);
            return;
          }
        }

        setReport(reportData);

        // Tracking viewed status for authenticated students (not for admin/teachers/BK)
        if (isStudent && trackedReportIdRef.current !== reportId) {
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

  const handleNextDay = () => {
    const currentIndex = daysList.findIndex(d => d.key === activeDayKey);
    const nextIndex = (currentIndex + 1) % daysList.length;
    setActiveDayKey(daysList[nextIndex].key);
  };

  const handlePrevDay = () => {
    const currentIndex = daysList.findIndex(d => d.key === activeDayKey);
    const prevIndex = (currentIndex - 1 + daysList.length) % daysList.length;
    setActiveDayKey(daysList[prevIndex].key);
  };

  const handleNextPhoto = (dayKey: string, totalPhotos: number) => {
    setInnerPhotoIndexes(prev => ({
      ...prev,
      [dayKey]: (prev[dayKey] + 1) % totalPhotos
    }));
  };

  const handlePrevPhoto = (dayKey: string, totalPhotos: number) => {
    setInnerPhotoIndexes(prev => ({
      ...prev,
      [dayKey]: (prev[dayKey] - 1 + totalPhotos) % totalPhotos
    }));
  };

  const handleBackToList = () => {
    navigate('/student/reports');
  };

  // 1. Loading state with elegant skeletons
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-between pb-10">
        <div className="w-full max-w-md mx-auto bg-white min-h-screen shadow-lg border border-gray-100 flex flex-col">
          {/* Header Skeleton */}
          <div className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 sticky top-0 z-10 shrink-0">
            <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
            <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
            <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
          </div>

          {/* Hero Identity Skeleton */}
          <div className="p-5 border-b border-gray-100 space-y-3">
            <div className="flex justify-between items-start">
              <div className="space-y-1.5 flex-1">
                <div className="h-6 w-3/4 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
              </div>
              <div className="w-20 h-6 bg-gray-100 rounded-full animate-pulse" />
            </div>
            <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
          </div>

          {/* Body Skeleton */}
          <div className="p-5 space-y-6 flex-1">
            <div className="space-y-3">
              <div className="h-5 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="h-5 w-48 bg-gray-100 rounded animate-pulse" />
              <div className="h-52 bg-gray-50 rounded-2xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Error or Not Found State
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
            Kembali ke Daftar Rapor
          </button>
        </div>
      </div>
    );
  }

  const snapshot = report.reportSnapshot;

  // 3. Document has no snapshot (Fallback for older reports)
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
              Kembali ke Daftar Rapor
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Indonesian month formatting helper
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

  const periodRange = `${formatDateIndonesia(snapshot.period?.startDate)} - ${formatDateIndonesia(snapshot.period?.endDate)}`;

  // Active documentation info
  const activeDayDoc = snapshot.dailyDocumentation?.[activeDayKey] || {
    dayLabel: activeDayKey,
    activityName: '',
    caption: '',
    imageUrl: null,
    imageUrls: [],
    hasDocumentation: false
  };

  const currentPhotosList = activeDayDoc.imageUrls && activeDayDoc.imageUrls.length > 0 
    ? activeDayDoc.imageUrls 
    : (activeDayDoc.imageUrl ? [activeDayDoc.imageUrl] : []);

  const activePhotoIndex = innerPhotoIndexes[activeDayKey] || 0;
  const currentPhoto = currentPhotosList[activePhotoIndex] || null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl border-x border-gray-100 flex flex-col relative pb-20">
        
        {/* 1. Header Sticky & Compact */}
        <div className="h-14 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 sticky top-0 z-20 shrink-0">
          <button 
            onClick={handleBackToList}
            className="flex items-center gap-1 text-gray-600 hover:text-emerald-600 transition-colors font-bold text-sm cursor-pointer"
          >
            <ChevronLeft size={20} />
            <span>Rapor Saya</span>
          </button>
          
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-800">Laporan Mingguan</h2>
          
          {report.driveFileUrl ? (
            <a 
              href={report.driveFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-full transition-all cursor-pointer"
              title="Lihat PDF"
            >
              <FileText size={20} />
            </a>
          ) : (
            <div className="w-9" />
          )}
        </div>

        {/* 2. Hero Identitas Anak */}
        <div className="p-5 bg-gradient-to-b from-emerald-50/70 to-white border-b border-gray-100 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/30 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />
          
          <div className="flex justify-between items-start gap-2 relative z-10">
            <div className="space-y-1">
              <h1 className="text-xl font-extrabold text-gray-900 tracking-tight leading-snug">
                {snapshot.student?.name}
              </h1>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-md inline-block">
                Kelas: {snapshot.student?.className}
              </p>
            </div>
            
            <div className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow shadow-emerald-600/20">
              <ShieldCheck size={10} />
              <span>Terbit</span>
            </div>
          </div>

          <div className="text-[11px] font-bold text-gray-500 space-y-1 relative z-10">
            <div className="flex items-center gap-1.5">
              <Calendar size={12} className="text-emerald-600" />
              <span>Pekan {snapshot.period?.weekLabel} ({periodRange})</span>
            </div>
            {snapshot.period?.theme && (
              <div className="flex items-center gap-1.5">
                <Award size={12} className="text-emerald-600" />
                <span className="uppercase">Tema: {snapshot.period.theme}</span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Ringkasan Mingguan */}
        <div className="p-5 space-y-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Perkembangan Minggu Ini</h3>
          </div>
          
          <div className="p-4 bg-white border border-emerald-100/60 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#109E58]" />
            <p className="text-sm leading-relaxed text-gray-700 font-medium whitespace-pre-line pl-1.5">
              {snapshot.weeklyComments?.trim() 
                ? snapshot.weeklyComments 
                : "Guru belum menambahkan komentar mingguan."}
            </p>
          </div>
        </div>

        {/* 4. Dokumentasi Kegiatan */}
        <div className="p-5 space-y-4 border-b border-gray-100 bg-gray-50/40">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
              <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Dokumentasi Kegiatan</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
              Senin - Jumat
            </span>
          </div>

          {/* Day Navigation Tabs */}
          <div className="grid grid-cols-5 gap-1.5">
            {daysList.map((day) => {
              const isActive = activeDayKey === day.key;
              const hasDoc = snapshot.dailyDocumentation?.[day.key]?.hasDocumentation;
              return (
                <button
                  key={day.key}
                  onClick={() => setActiveDayKey(day.key)}
                  className={cn(
                    "py-2 rounded-xl text-center text-xs font-black uppercase transition-all relative cursor-pointer border",
                    isActive
                      ? "bg-emerald-600 text-white border-emerald-600 shadow shadow-emerald-600/15"
                      : "bg-white text-gray-400 border-gray-100 hover:text-gray-600 hover:border-gray-200"
                  )}
                >
                  {day.label}
                  {hasDoc && (
                    <span className={cn(
                      "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
                      isActive ? "bg-white" : "bg-emerald-500"
                    )} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Swipeable / Actionable Day Card Container */}
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeDayKey}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[340px]"
              >
                {/* Header of card */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-800">
                    {daysList.find(d => d.key === activeDayKey)?.label}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400">
                    {activeDayDoc.date ? formatDateIndonesia(activeDayDoc.date) : ''}
                  </span>
                </div>

                {/* Day content */}
                {activeDayDoc.hasDocumentation ? (
                  <div className="flex-1 flex flex-col">
                    {/* Media Gallery / Main Image Frame */}
                    {currentPhoto ? (
                      <div className="relative aspect-video bg-gray-900 flex items-center justify-center overflow-hidden shrink-0 group">
                        <img 
                          src={currentPhoto}
                          alt={`Dokumentasi kegiatan ${daysList.find(d => d.key === activeDayKey)?.label}: ${activeDayDoc.activityName || ''}`}
                          referrerPolicy="no-referrer"
                          className="max-h-full max-w-full object-contain"
                        />
                        
                        {/* Multiple Photos Navigation */}
                        {currentPhotosList.length > 1 && (
                          <>
                            {/* Previous Photo Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrevPhoto(activeDayKey, currentPhotosList.length);
                              }}
                              className="absolute left-2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition-all cursor-pointer"
                            >
                              <ChevronLeft size={16} />
                            </button>

                            {/* Next Photo Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNextPhoto(activeDayKey, currentPhotosList.length);
                              }}
                              className="absolute right-2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition-all cursor-pointer"
                            >
                              <ChevronRight size={16} />
                            </button>

                            {/* Inner Pagination Counter Dots */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/40 backdrop-blur-sm rounded-full flex gap-1 items-center">
                              {currentPhotosList.map((_, pIdx) => (
                                <span 
                                  key={pIdx} 
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full transition-all",
                                    activePhotoIndex === pIdx ? "bg-white scale-110" : "bg-white/40"
                                  )}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="h-44 bg-gray-50 flex flex-col items-center justify-center text-gray-300 gap-1 border-b border-gray-100 shrink-0">
                        <ImageIcon size={32} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Tanpa Foto Dokumentasi</span>
                      </div>
                    )}

                    {/* Captions / Details */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        {activeDayDoc.activityName && (
                          <div className="flex items-start gap-1.5">
                            <MapPin size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                            <h4 className="text-xs font-black uppercase text-gray-900 tracking-tight leading-snug">
                              Aktivitas: {activeDayDoc.activityName}
                            </h4>
                          </div>
                        )}
                        <p className="text-sm leading-relaxed text-gray-600 font-semibold whitespace-pre-line pl-5">
                          {activeDayDoc.caption || 'Tidak ada deskripsi aktivitas.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400 space-y-2">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 text-gray-300">
                      <ImageIcon size={20} />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-tight">Hari {daysList.find(d => d.key === activeDayKey)?.label}</p>
                      <p className="text-xs font-medium text-gray-400">Belum ada dokumentasi kegiatan pada hari ini.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Prev/Next buttons below card to allow easy keyboard/tap navigation */}
            <div className="flex justify-between items-center mt-2.5 px-1">
              <button
                onClick={handlePrevDay}
                className="flex items-center gap-1 text-[11px] font-black uppercase text-gray-500 hover:text-[#109E58] transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} /> Sebelumnya
              </button>
              
              <button
                onClick={handleNextDay}
                className="flex items-center gap-1 text-[11px] font-black uppercase text-gray-500 hover:text-[#109E58] transition-colors cursor-pointer"
              >
                Selanjutnya <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 5. Kehadiran & Mood */}
        <div className="p-5 space-y-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Kehadiran & Suasana Hati</h3>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {/* Attendance Sub-box */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2.5">
              <div className="flex justify-between items-center border-b border-gray-50 pb-1.5">
                <span className="text-[10px] font-black uppercase text-gray-400">Kehadiran</span>
                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[9px] font-extrabold uppercase">
                  {snapshot.attendanceSummary?.totalSchoolDays || 0} Hari
                </span>
              </div>
              <div className="space-y-1.5 text-xs font-bold text-gray-600">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">🟢 Hadir</span>
                  <span className="text-gray-900">{snapshot.attendanceSummary?.present || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">🟡 Sakit</span>
                  <span className="text-gray-900">{snapshot.attendanceSummary?.sick || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">🔵 Izin</span>
                  <span className="text-gray-900">{snapshot.attendanceSummary?.permission || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">🔴 Alpa</span>
                  <span className="text-gray-900">{snapshot.attendanceSummary?.absentWithoutNotice || 0}</span>
                </div>
              </div>
            </div>

            {/* Mood Sub-box */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2.5">
              <div className="flex justify-between items-center border-b border-gray-50 pb-1.5">
                <span className="text-[10px] font-black uppercase text-gray-400">Suasana Hati</span>
              </div>
              <div className="space-y-1.5 text-xs font-bold text-gray-600">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">😊 Happy</span>
                  <span className="text-gray-900">{snapshot.moodSummary?.happy || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">😐 Okay</span>
                  <span className="text-gray-900">{snapshot.moodSummary?.okay || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">😢 Sedih</span>
                  <span className="text-gray-900">{snapshot.moodSummary?.sad || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">😠 Marah</span>
                  <span className="text-gray-900">{snapshot.moodSummary?.angry || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Perkembangan Sosial-Emosional */}
        <div className="p-5 space-y-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-[#109E58] rounded-full" />
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-800">Perkembangan Sosial-Emosional</h3>
          </div>
          
          <div className="p-4 bg-white border border-emerald-100/60 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#109E58]" />
            <p className="text-sm leading-relaxed text-gray-700 font-medium whitespace-pre-line pl-1.5">
              {snapshot.socialEmotionalComment?.trim() 
                ? snapshot.socialEmotionalComment 
                : "Guru belum menambahkan catatan sosial-emosional."}
            </p>
          </div>
        </div>

        {/* 7. Penutup & Tombol PDF */}
        <div className="p-5 space-y-4">
          {report.driveFileUrl && (
            <a
              href={report.driveFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-[#002366] text-white rounded-xl font-extrabold flex items-center justify-center gap-2 hover:bg-opacity-95 transition-all text-xs uppercase tracking-widest shadow shadow-blue-900/10 cursor-pointer"
            >
              <ExternalLink size={14} /> Lihat Versi PDF
            </a>
          )}
          
          <div className="text-center space-y-0.5">
            <p className="text-[9px] font-bold text-gray-400">
              Laporan diterbitkan pada {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
            </p>
            {report.publishedByEmail && (
              <p className="text-[8px] font-extrabold text-gray-400 uppercase tracking-widest">
                Oleh: {report.publishedByEmail}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
