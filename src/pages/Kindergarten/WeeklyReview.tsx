import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Smile, Meh, Frown, Angry, AlertCircle, Calendar, ChevronLeft, ChevronRight, 
  Printer, BookOpen, Clock, Heart, ShieldAlert, FileText, ArrowRight, Sparkles, ChevronDown
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { 
  DEFAULT_STUDENTS, 
  getMonday, 
  formatDateToKey 
} from '../../lib/kindergartenWeeklyReport';

export default function WeeklyReview() {
  const navigate = useNavigate();
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('K001');

  // Load start and end date from sessionStorage or use current week's Mon-Fri
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    const fromSession = sessionStorage.getItem('kindy_report_start');
    if (fromSession) return fromSession;
    const mon = getMonday(new Date());
    return formatDateToKey(mon);
  });
  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
    const fromSession = sessionStorage.getItem('kindy_report_end');
    if (fromSession) return fromSession;
    const mon = getMonday(new Date());
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return formatDateToKey(fri);
  });

  const [loadedDraft, setLoadedDraft] = React.useState<any | null>(null);

  // Sync date ranges to sessionStorage when changed
  React.useEffect(() => {
    sessionStorage.setItem('kindy_report_start', startDateStr);
    sessionStorage.setItem('kindy_report_end', endDateStr);
  }, [startDateStr, endDateStr]);

  // Load the draft based on selected student and custom period
  React.useEffect(() => {
    // 1. Try to fetch from the standard dynamic date-range summary store
    const summaryKey = `kg_weekly_summary_${selectedStudentId}_${startDateStr}_${endDateStr}`;
    const savedSummary = localStorage.getItem(summaryKey);

    if (savedSummary) {
      try {
        setLoadedDraft(JSON.parse(savedSummary));
        return;
      } catch (e) {
        console.error('Error parsing loaded summary draft:', e);
      }
    }

    // 2. Backwards compatibility fallback strategy (using standard weekKey)
    const mon = new Date(startDateStr);
    const startMon = getMonday(mon);
    const firstDay = new Date(startMon.getFullYear(), startMon.getMonth(), 1);
    const firstMon = getMonday(firstDay);
    const weekDiff = Math.floor((startMon.getTime() - firstMon.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const weekNumber = Math.max(1, weekDiff + 1);
    const weekKey = `${startMon.getFullYear()}_W${weekNumber}`;
    const legacyKey = `kg_weekly_report_${selectedStudentId}_${weekKey}`;
    const savedLegacy = localStorage.getItem(legacyKey);

    if (savedLegacy) {
      try {
        setLoadedDraft(JSON.parse(savedLegacy));
        return;
      } catch (e) {
        console.error('Error parsing legacy draft:', e);
      }
    }

    // No draft found
    setLoadedDraft(null);
  }, [selectedStudentId, startDateStr, endDateStr]);

  const handlePrint = () => {
    window.print();
  };

  const handlePrevWeek = () => {
    // Move both dates back by 7 days
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      s.setDate(s.getDate() - 7);
      e.setDate(e.getDate() - 7);
      setStartDateStr(formatDateToKey(s));
      setEndDateStr(formatDateToKey(e));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNextWeek = () => {
    // Move both dates forward by 7 days
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      s.setDate(s.getDate() + 7);
      e.setDate(e.getDate() + 7);
      setStartDateStr(formatDateToKey(s));
      setEndDateStr(formatDateToKey(e));
    } catch (err) {
      console.error(err);
    }
  };

  // Safe checks and extracted properties
  const hasDraft = !!loadedDraft;
  const finalWeeklyComments = loadedDraft?.teacherEditedWeeklyComments || loadedDraft?.aiWeeklyCommentsDraft || '';
  const finalSocialEmotional = loadedDraft?.teacherEditedSocialEmotional || loadedDraft?.aiSocialEmotionalDraft || '';
  const finalTheme = loadedDraft?.theme || 'Aku dan Lingkunganku';
  const finalSnapshots = loadedDraft?.dailySnapshots || [];
  const finalAttendance = loadedDraft?.attendanceSummary || { happy: 0, sad: 0, angry: 0, ok: 0, noNews: 0, sick: 0, izin: 0, earlyLeave: 0 };
  const finalObsSummary = loadedDraft?.groupedObservationSummary || [];

  // Format Month
  const formattedMonth = React.useMemo(() => {
    try {
      const d = new Date(startDateStr);
      return d.toLocaleDateString('en-US', { month: 'long' });
    } catch {
      return 'May';
    }
  }, [startDateStr]);

  // Format Date range
  const formattedDateRange = React.useMemo(() => {
    try {
      const s = new Date(startDateStr);
      const e = new Date(endDateStr);
      const sDay = s.getDate();
      const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
      const eDay = e.getDate();
      const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
      if (sMonth === eMonth) {
        return `${sDay} - ${eDay} ${sMonth}`;
      }
      return `${sDay} ${sMonth} - ${eDay} ${eMonth}`;
    } catch {
      return '18 - 22 May';
    }
  }, [startDateStr, endDateStr]);

  // Compute week
  const computedWeek = React.useMemo(() => {
    try {
      const s = new Date(startDateStr);
      const jan1 = new Date(s.getFullYear(), 0, 1);
      const days = Math.floor((s.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
      return Math.ceil((days + jan1.getDay() + 1) / 7);
    } catch {
      return '18';
    }
  }, [startDateStr]);

  // Format Signature Date label
  const formattedSignDate = React.useMemo(() => {
    try {
      const d = new Date(endDateStr);
      const day = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'long' });
      const year = d.getFullYear();
      return `DEPOK, ${day} ${month} ${year}`.toUpperCase();
    } catch {
      return 'DEPOK, 22 MAY 2026';
    }
  }, [endDateStr]);

  const getSnapForDay = (dayKey: string) => {
    return finalSnapshots?.find((s: any) => s.dayKey?.toUpperCase() === dayKey.toUpperCase());
  };

  const renderSnapshotCard = (dayKey: string, snap: any) => {
    return (
      <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col h-full">
        <div className="bg-[#109E58] text-white text-center py-1.5 font-extrabold text-[11px] tracking-wider uppercase">
          SNAPSHOT - {dayKey}
        </div>
        <div className="p-2 flex-1 flex flex-col justify-between bg-white min-h-[145px]">
          {snap?.photoUrl ? (
            <div className="w-full h-[125px] overflow-hidden rounded-sm border border-gray-100">
              <img 
                src={snap.photoUrl} 
                alt={`Snapshot ${dayKey}`} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="w-full h-[125px] bg-[#fdfdfd] border border-dashed border-gray-200 flex items-center justify-center p-3 text-center">
              <span className="text-[9px] text-gray-400 font-bold italic leading-tight">No Documentation</span>
            </div>
          )}
          <div className="text-[9px] text-gray-500 font-semibold italic text-left mt-1 px-0.5 line-clamp-1">
            {snap?.photoUrl ? "Dokumentasi Terlampir" : (snap?.fallbackText || "Belum ada dokumen")}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 px-4 md:px-0 font-sans">
      
      {/* 1. TOPBAR CONTROLS (Hidden in Print) */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider">Tahap 2</span>
            <span className="text-xs text-gray-400 font-bold">Pratinjau Rapor Laporan Mingguan</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Weekly Report Final View</h1>
          <p className="text-sm text-gray-500">
            Halaman cetak mandiri untuk orang tua siswa. Hanya menampilkan data matang yang sudah diselamatkan drafnya di halaman kerja ringkasan guru.
          </p>
        </div>

        {hasDraft && (
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-[#109E58] hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-3.5 rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Printer size={14} />
            Cetak Laporan / Simpan PDF
          </button>
        )}
      </header>

      {/* 2. FILTER & SELECTIONS (Hidden in Print) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-white p-6 rounded-[2rem] border border-gray-150 shadow-sm print:hidden">
        
        {/* Student pick */}
        <div className="lg:col-span-6 space-y-2">
          <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Pilih Siswa</label>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_STUDENTS.map(s => {
              const isSelected = s.id === selectedStudentId;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                    isSelected 
                      ? "bg-[#109E58] text-white border-transparent shadow shadow-emerald-600/20"
                      : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100"
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date / Period Controls */}
        <div className="lg:col-span-6 space-y-2 flex flex-col justify-between">
          <div>
            <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Periode Tanggal Evaluasi</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <input 
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none text-gray-700"
              />
              <input 
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none text-gray-700"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-xl p-1 mt-2">
            <button
              onClick={handlePrevWeek}
              className="p-1 px-2 hover:bg-white rounded-lg text-gray-500 hover:text-emerald-800 transition-all cursor-pointer"
              title="7 Hari Sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 text-center text-[10.5px] font-black text-gray-600 uppercase">
              Minggu Lompat Pekan
            </div>
            <button
              onClick={handleNextWeek}
              className="p-1 px-2 hover:bg-white rounded-lg text-gray-500 hover:text-emerald-800 transition-all cursor-pointer"
              title="7 Hari Selanjutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </div>

      {/* 3. FALLBACK BLOCK IF DRAFT DOESN'T EXIST */}
      {!hasDraft ? (
        <div className="bg-white rounded-[2rem] border border-gray-150 p-12 text-center space-y-5 shadow-sm print:hidden">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto text-red-550 border border-red-100">
            <AlertCircle size={30} className="text-red-500" />
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h2 className="text-base font-black text-gray-900 uppercase">Weekly Summary belum disiapkan</h2>
            <p className="text-xs text-gray-500 leading-relaxed font-medium">
              Data mingguan dan komentar untuk anak hebat ini belum disiapkan oleh Guru di modul summary. Silakan klik tombol di bawah untuk mengisi data dan komentar.
            </p>
          </div>

          <button 
            onClick={() => navigate('/kindy/weekly-summary')}
            className="inline-flex items-center gap-2 bg-[#109E58] hover:bg-emerald-700 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles size={14} />
            Buka Halaman Weekly Summary
            <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        /* 4. FORMAL REPORT DOCUMENT PRINTABLE VIEW */
        <div className="bg-white p-8 md:p-12 shadow-sm border border-gray-200 text-gray-950 mx-auto w-full max-w-[800px] font-sans flex flex-col gap-5 print:border-none print:shadow-none print:p-0" id="formal-weekly-report">
          
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body {
                background: white !important;
                color: black !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .print-hidden {
                display: none !important;
              }
              #formal-weekly-report {
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
              }
              @page {
                size: A4 portrait;
                margin: 0.8cm 1cm 0.8cm 1cm;
              }
            }
          `}} />

          {/* Lazuardi school design banner */}
          <div className="bg-[#109E58] p-5 text-white relative flex flex-col justify-between rounded-sm">
            {/* Top row with Logo and Title */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/20 pb-4 mb-4 gap-4">
              
              {/* Left Column: Logo & Name */}
              <div className="flex items-center gap-3">
                <div className="bg-white/10 p-2 rounded-xl">
                  <svg className="w-10 h-10 text-white" viewBox="0 0 100 100" fill="currentColor">
                    <path d="M50 10 C42 35 25 45 10 50 C25 55 42 65 50 90 C58 65 75 55 90 50 C75 45 58 35 50 10 Z" />
                    <path d="M50 25 C45 40 35 48 25 50 C35 52 45 60 50 75 C55 60 65 52 75 50 C65 48 55 40 50 25 Z" fill="#109E58" />
                  </svg>
                </div>
                <div className="text-left leading-none">
                  <span className="block font-sans text-lg font-black tracking-widest text-white m-0">Lazuardi</span>
                  <span className="block font-sans text-[10px] font-bold tracking-[0.25em] text-emerald-100 m-0 uppercase leading-none mt-0.5">KINDERGARTEN</span>
                  <span className="block font-sans text-[7.5px] text-emerald-200 mt-1 uppercase tracking-wider leading-none font-semibold">Global Compassionate School</span>
                </div>
              </div>

              {/* Right Column: Large report title */}
              <div className="text-right sm:text-right w-full sm:w-auto">
                <h1 className="text-lg sm:text-xl font-sans font-black tracking-wider text-white uppercase leading-none">
                  STUDENT'S WEEKLY REPORT
                </h1>
              </div>

            </div>

            {/* Bottom row: Student Metadata details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-12 text-[11px] font-sans">
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 leading-none">
                  <span className="col-span-4 font-bold text-emerald-100">Student's name</span>
                  <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                  <span className="col-span-7 font-extrabold text-white text-xs -mt-0.5">{loadedDraft.studentName}</span>
                </div>
                <div className="grid grid-cols-12 leading-none">
                  <span className="col-span-4 font-bold text-emerald-100">Class</span>
                  <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                  <span className="col-span-7 font-bold text-white">{loadedDraft.classGroup || loadedDraft.className || "A3 Kakatua"}</span>
                </div>
                <div className="grid grid-cols-12 leading-none">
                  <span className="col-span-4 font-bold text-emerald-100">Theme</span>
                  <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                  <span className="col-span-7 font-bold text-white leading-normal">{finalTheme}</span>
                </div>
              </div>

              <div className="space-y-1.5 sm:pl-8">
                <div className="grid grid-cols-12 leading-none">
                  <span className="col-span-3 font-bold text-emerald-100">Month</span>
                  <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                  <span className="col-span-8 font-bold text-white">{formattedMonth}</span>
                </div>
                <div className="grid grid-cols-12 leading-none">
                  <span className="col-span-3 font-bold text-emerald-100">Week</span>
                  <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                  <span className="col-span-8 font-bold text-white">{computedWeek}</span>
                </div>
                <div className="grid grid-cols-12 leading-none">
                  <span className="col-span-3 font-bold text-emerald-100">Date</span>
                  <span className="col-span-1 text-emerald-100/70 text-center">:</span>
                  <span className="col-span-8 font-bold text-white">{formattedDateRange}</span>
                </div>
              </div>
            </div>

          </div>

          {/* SECTION I: WEEKLY COMMENTS */}
          <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white min-h-[224px] flex flex-col">
            <div className="bg-[#109E58] text-white text-center py-1.5 font-extrabold text-[11px] tracking-wider uppercase">
              WEEKLY COMMENTS
            </div>
            <div className="p-4 text-[11.5px] leading-relaxed text-left text-gray-800 bg-white flex-1">
              {finalWeeklyComments || (
                <span className="text-gray-400 italic">Komentar perkembangan mingguan belum diisi oleh guru.</span>
              )}
            </div>
          </div>

          {/* SECTION II: SNAPSHOTS GRID ROUND 1 (Monday, Tuesday, Wednesday) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {renderSnapshotCard('MONDAY', getSnapForDay('MONDAY'))}
            {renderSnapshotCard('TUESDAY', getSnapForDay('TUESDAY'))}
            {renderSnapshotCard('WEDNESDAY', getSnapForDay('WEDNESDAY'))}
          </div>

          {/* SECTION III & IV: COHESIVE LOWER GRID (UNEVEN 3:2 COLUMNS FOR 1.5X PROPORTION) */}
          <div className="grid grid-cols-5 gap-3 items-stretch">
            
            {/* Column A (Left): Thursday Snapshot & Social Emotional progress (col-span-3) */}
            <div className="col-span-3 flex flex-col gap-3">
              {/* Snapshot Thursday with EXACT matching size, aligned to right for visual centering */}
              <div className="w-full flex justify-end">
                <div className="w-[calc((500%-48px)/9)]">
                  {renderSnapshotCard('THURSDAY', getSnapForDay('THURSDAY'))}
                </div>
              </div>
              
              {/* SOCIAL-EMOTIONAL LEARNING DEVELOPMENT */}
              <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col flex-1 min-h-[140px] md:min-h-[150px]">
                <div className="bg-[#109E58] text-white text-center py-1.5 font-extrabold text-[11px] tracking-wider uppercase">
                  SOCIAL-EMOTIONAL LEARNING DEVELOPMENT
                </div>
                <div className="p-3 bg-white flex-1 flex flex-col justify-start">
                  <p className="text-[11px] leading-relaxed text-left text-gray-800 font-sans whitespace-pre-wrap">
                    {finalSocialEmotional || (
                      <span className="text-gray-400 italic block">Komentar sosial emosional belum diisi oleh guru.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Column B (Right): Friday Snapshot & Teacher Signature area (col-span-2) */}
            <div className="col-span-2 flex flex-col gap-3">
              {/* Snapshot Friday with EXACT matching size, aligned to left for visual centering */}
              <div className="w-full flex justify-start">
                <div className="w-[calc((500%-12px)/6)]">
                  {renderSnapshotCard('FRIDAY', getSnapForDay('FRIDAY'))}
                </div>
              </div>

              {/* Signature block with date */}
              <div className="border-2 border-[#109E58] rounded-sm overflow-hidden bg-white flex flex-col flex-1 min-h-[140px] md:min-h-[150px]">
                <div className="bg-[#109E58] text-white text-center py-1.5 font-extrabold text-[11px] tracking-wider uppercase">
                  {formattedSignDate}
                </div>
                <div className="p-3 bg-white flex-1 flex flex-col items-center justify-center min-h-[100px] py-1.5">
                  <svg className="w-20 h-10 text-indigo-950 my-0.5" viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 42 Q 35 20, 45 45 T 75 18 T 105 32" />
                    <path d="M25 38 C 20 22, 50 12, 42 42" />
                    <path d="M48 35 L 72 35" />
                    <path d="M68 25 C 75 15, 82 45, 78 40" />
                  </svg>
                  <div className="text-center font-sans mt-1">
                    <div className="font-extrabold text-[12px] text-gray-900 border-b border-gray-300 w-32 pb-0.5 mx-auto uppercase">
                      Toharoh
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold mt-1 uppercase">
                      11.00.003
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* FOOTER BLOCK: Exact matching of Griya Cinere school contacts */}
          <div className="bg-[#109E58] text-white text-center py-2 px-4 text-[8px] font-sans rounded-sm mt-3 border-t border-emerald-300">
            <div className="font-bold tracking-wide uppercase">{`Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa Barat 16515`}</div>
            <div className="text-[7.5px] mt-0.5 opacity-90 font-medium">{`Telp. (021) 753 4841   Email: information@lazuardi.sch.id   WhatsApp: +62 813 8925 7784`}</div>
          </div>

        </div>
      )}

    </div>
  );
}

