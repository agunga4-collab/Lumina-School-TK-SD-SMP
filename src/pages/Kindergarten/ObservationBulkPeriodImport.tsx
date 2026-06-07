import * as React from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { 
  Compass, Heart, BookOpen, Brain, LayoutGrid, Palette, Languages, Music, Activity, Film,
  Sparkles, Calendar, ClipboardList, CheckCircle2, AlertTriangle, 
  FileSpreadsheet, Loader2, Info, ArrowLeft, ArrowRight, UserCheck, HelpCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { getStoredStudents } from '../../lib/kindergartenWeeklyReport';
import type { KGActivity, KGDomain, KGGrading } from '../../types';
import { format, addDays, isWeekend, parseISO } from 'date-fns';

const activitiesList: { id: KGActivity; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'MAKE_BELIEVE', label: 'Make-Believe', icon: <Compass size={14} />, color: 'teal' },
  { id: 'ISLAMIC_AWARENESS', label: 'Islamic Awareness', icon: <Heart size={14} />, color: 'emerald' },
  { id: 'LIBRARY_LITERACY', label: 'Library & Literacy', icon: <BookOpen size={14} />, color: 'blue' },
  { id: 'DISCOVERY', label: 'Discovery', icon: <Brain size={14} />, color: 'orange' },
  { id: 'BLOCKS_BUILDING', label: 'Blocks & Building', icon: <LayoutGrid size={14} />, color: 'indigo' },
  { id: 'ART_EXPLORATIONS', label: 'Art Explorations', icon: <Palette size={14} />, color: 'purple' },
  { id: 'ENGLISH', label: 'English', icon: <Languages size={14} />, color: 'sky' },
  { id: 'MUSIC', label: 'Music', icon: <Music size={14} />, color: 'rose' },
  { id: 'OUTSIDE', label: 'Outside', icon: <Activity size={14} />, color: 'lime' },
  { id: 'AUDIO_VISUAL', label: 'Audio Visual', icon: <Film size={14} />, color: 'violet' },
];

const domainsList: { id: KGDomain; label: string; desc: string }[] = [
  { id: 'AGAMA_BUDI_PEKERTI', label: 'Nilai Agama & Budi Pekerti', desc: 'Mengenal tuhan, ibadah harian, budi pekerti mulia' },
  { id: 'SOSIAL_EMOSIONAL', label: 'Sosial-Emosional', desc: 'Regulasi emosi, kemandirian, interaksi sosial, gotong royong' },
  { id: 'BAHASA', label: 'Bahasa', desc: 'Komunikasi ekspresif, reseptif, keaksaraan awal' },
  { id: 'KOGNITIF', label: 'Kognitif', desc: 'Problem solving, berpikir logis, pemecahan masalah sederhana' },
  { id: 'FISIK_MOTORIK', label: 'Fisik-Motorik', desc: 'Motorik kasar, motorik halus, kesehatan fisik' },
  { id: 'SENI', label: 'Seni', desc: 'Apresiasi karya, kreasi seni musik, rupa, peran' },
];

const gradesList: { id: KGGrading; label: string; color: string }[] = [
  { id: 'BB', label: 'Belum Berkembang', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  { id: 'MB', label: 'Mulai Berkembang', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { id: 'BSH', label: 'Berkembang Sesuai Harapan', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'BSB', label: 'Berkembang Sangat Baik', color: 'bg-teal-100 text-teal-800 border-teal-200' },
];

// Helper maps
const mapStringToDomain = (str: string): KGDomain | null => {
  const s = str.toLowerCase().trim();
  if (s.includes('agama') || s.includes('budi pekerti') || s.includes('moral')) {
    return 'AGAMA_BUDI_PEKERTI';
  }
  if (s.includes('sosial') || s.includes('emosi') || s.includes('sosem')) {
    return 'SOSIAL_EMOSIONAL';
  }
  if (s.includes('bahasa')) {
    return 'BAHASA';
  }
  if (s.includes('kognitif')) {
    return 'KOGNITIF';
  }
  if (s.includes('fisik') || s.includes('motorik')) {
    return 'FISIK_MOTORIK';
  }
  if (s.includes('seni')) {
    return 'SENI';
  }
  return null;
};

const mapStringToGrading = (str: string): KGGrading | null => {
  const s = str.trim().toUpperCase();
  if (s === 'BB' || s.includes('BELUM BERKEMBANG') || s.includes('BELUM')) return 'BB';
  if (s === 'MB' || s.includes('MULAI BERKEMBANG') || s.includes('MULAI')) return 'MB';
  if (s === 'BSH' || s.includes('BERKEMBANG SESUAI HARAPAN') || s.includes('SESUAI HARAPAN') || s.includes('HARAPAN')) return 'BSH';
  if (s === 'BSB' || s.includes('BERKEMBANG SANGAT BAIK') || s.includes('SANGAT BAIK') || s.includes('SANGAT')) return 'BSB';
  return null;
};

interface StudentGradeDetail {
  studentId: string;
  studentName: string;
  pastedName: string;
  grades: {
    dayLabel: string;
    dateStr: string;
    domainId: KGDomain;
    domainLabel: string;
    grading: KGGrading;
    rawText: string;
  }[];
}

interface ObservationBulkPeriodImportProps {
  onImportSuccess?: () => void;
  onClose?: () => void;
}

export default function ObservationBulkPeriodImport({ onImportSuccess, onClose }: ObservationBulkPeriodImportProps) {
  const [activeStep, setActiveStep] = React.useState<1 | 2 | 3 | 4>(1);
  const [selectedActivity, setSelectedActivity] = React.useState<KGActivity>('ART_EXPLORATIONS');
  
  // Date period hooks 
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    const today = new Date();
    // Default to start of this month
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return format(start, 'yyyy-MM-dd');
  });
  
  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
    const today = new Date();
    // Default to end of this month
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return format(end, 'yyyy-MM-dd');
  });

  const [pastedText, setPastedText] = React.useState<string>('');
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Parsed and verified rows state
  const [parsedDays, setParsedDays] = React.useState<string[]>([]);
  const [parsedDomains, setParsedDomains] = React.useState<string[]>([]);
  const [unmappedDomainCount, setUnmappedDomainCount] = React.useState<number>(0);
  const [warningCount, setWarningCount] = React.useState<number>(0);
  const [mappedSrudentsData, setMappedStudentsData] = React.useState<StudentGradeDetail[]>([]);
  const [unmatchedNames, setUnmatchedNames] = React.useState<string[]>([]);

  // Calculate workdays in selected range
  const availableWorkdays = React.useMemo(() => {
    if (!startDateStr || !endDateStr) return [];
    try {
      const dates: Date[] = [];
      let current = parseISO(startDateStr);
      const end = parseISO(endDateStr);
      if (current > end) return [];
      
      while (current <= end) {
        if (!isWeekend(current)) {
          dates.push(new Date(current));
        }
        current = addDays(current, 1);
      }
      return dates;
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [startDateStr, endDateStr]);

  const activeActivityObj = activitiesList.find(a => a.id === selectedActivity);

  // Perform parsing of Smart Spreadsheet Text
  const handleParseText = () => {
    if (!pastedText.trim()) {
      toast.error('Gagal memproses: Teks tempel masih kosong.');
      return;
    }

    setIsProcessing(true);

    try {
      const lines = pastedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 3) {
        throw new Error('Format teks tidak valid. Minimal harus ada baris DAY, baris Nama Domain, dan baris isian siswa.');
      }

      // Step 1: Detect Header Day Line
      let header1Idx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toUpperCase().includes('DAY 1') || lines[i].toUpperCase().includes('DAY-1')) {
          header1Idx = i;
          break;
        }
      }

      if (header1Idx === -1) {
        throw new Error('Gagal mendeteksi baris Header 1. Pastikan teks mengandung penanda hari, contoh: "DAY 1 | DAY 2 | DAY 3"');
      }

      // Read Header 2 (Domain) Right under Header 1
      const header2Idx = header1Idx + 1;
      if (header2Idx >= lines.length) {
        throw new Error('Tidak menemukan baris Nama Domain (Header 2) langsung di bawah baris Header 1.');
      }

      // Split header columns
      const rawHeader1Cells = lines[header1Idx].split(/[\t|]/).map(c => c.trim()).filter(c => c.length > 0);
      const rawHeader2Cells = lines[header2Idx].split(/[\t|]/).map(c => c.trim());

      // Filter cells matching "DAY" string
      const dayIndices: number[] = [];
      const dayLabels: string[] = [];

      rawHeader1Cells.forEach((cell, idx) => {
        // Checking index alignment. If cell starts with DAY or contains DAY.
        // If there's an offset (e.g. first cell is empty or says "Nama Siswa"), we track its alignment.
        // We can check if lines[header1Idx] or the cell is indeed a DAY marker.
        if (cell.toUpperCase().includes('DAY')) {
          dayIndices.push(idx);
          dayLabels.push(cell);
        }
      });

      // If dayIndices.length is 0 because of formatting, let's assume columns from index 1 to the end
      if (dayIndices.length === 0) {
        throw new Error('Tidak dapat mengenali penomoran kolom Hari ("DAY 1", dst.). Pastikan ejaan dan pemisah kolom valid.');
      }

      const totalDaysParsed = dayIndices.length;
      if (totalDaysParsed > availableWorkdays.length) {
        toast.warning(`Peringatan: Jumlah "DAY" (${totalDaysParsed}) melebihi jumlah hari kerja tersedia di tanggal terpilih (${availableWorkdays.length} hari). Tanggal-tanggal ekstra akan diabaikan!`);
      }

      // Retrieve domains for each day
      // Since spreadsheet copy splits everything, header 2 might contain cells aligned with day indices.
      // Often, the header cells line up perfectly.
      const parsedDoms: string[] = [];
      let unmappedDoms = 0;

      dayIndices.forEach((colIdx) => {
        // Safely extract from rawHeader2Cells
        const domName = rawHeader2Cells[colIdx] || rawHeader2Cells[colIdx - 1] || 'Sosem';
        parsedDoms.push(domName);
        if (!mapStringToDomain(domName)) {
          unmappedDoms++;
        }
      });

      setParsedDays(dayLabels);
      setParsedDomains(parsedDoms);
      setUnmappedDomainCount(unmappedDoms);

      // Match students
      const systemStudents = getStoredStudents();
      const matchedResults: StudentGradeDetail[] = [];
      const missedNames: string[] = [];
      let warnings = 0;

      // Parse data rows starting after header 2
      for (let i = header2Idx + 1; i < lines.length; i++) {
        const line = lines[i];
        // Split and filter empty cells at the end, but keep cell values
        const cells = line.split(/[\t|]/).map(c => c.trim());
        if (cells.length < 2) continue; // Skip separator lines or completely empty rows

        const pastedStudentName = cells[0];
        if (!pastedStudentName || pastedStudentName.toUpperCase() === 'NAMA SISWA' || pastedStudentName.toUpperCase().includes('PRA TK')) {
          continue; // skip table header repeats
        }

        // Search in system students
        const matchedS = findStudentByName(pastedStudentName, systemStudents);
        if (!matchedS) {
          missedNames.push(pastedStudentName);
          warnings++;
          continue;
        }

        // Loop over parsed days to extract grading
        const studentGrades: StudentGradeDetail['grades'] = [];

        dayIndices.forEach((colIdx, listIdx) => {
          // If we run out of available workdays, don't map
          if (listIdx >= availableWorkdays.length) return;

          const dateObj = availableWorkdays[listIdx];
          const dateStr = format(dateObj, 'yyyy-MM-dd');
          const domainLabel = parsedDoms[listIdx] || 'Seni';
          const domainId = mapStringToDomain(domainLabel) || 'SOSIAL_EMOSIONAL';
          
          const rawCellGrade = cells[colIdx] || '';
          const grading = mapStringToGrading(rawCellGrade);

          if (grading) {
            studentGrades.push({
              dayLabel: dayLabels[listIdx],
              dateStr,
              domainId,
              domainLabel,
              grading,
              rawText: rawCellGrade
            });
          } else {
            // Unmapped or empty grading cells
            if (rawCellGrade.trim().length > 0) {
              warnings++;
            }
          }
        });

        matchedResults.push({
          studentId: matchedS.id,
          studentName: matchedS.name,
          pastedName: pastedStudentName,
          grades: studentGrades
        });
      }

      setMappedStudentsData(matchedResults);
      setUnmatchedNames(missedNames);
      setWarningCount(warnings);

      if (matchedResults.length === 0) {
        throw new Error('Tidak ada data prestasi siswa yang berhasil diurai. Periksa nama siswa dan struktur kolom.');
      }

      // Success, move to Step 3: Verification & Preview
      setActiveStep(3);
      toast.success('Analisis spreadsheet selesai! Periksa pemetaan di bawah.');
    } catch (err) {
      console.error(err);
      toast.error(`Gagal memparsing: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Matcher helper function (Case-insensitive fuzzy/include lookup)
  const findStudentByName = (name: string, studentList: ReturnType<typeof getStoredStudents>): any => {
    const cleanName = name.trim().toLowerCase();
    if (!cleanName) return null;

    // First attempt: Exact match either name or nickname
    let found = studentList.find(s => s.name.toLowerCase() === cleanName || (s.nickName && s.nickName.toLowerCase() === cleanName));
    if (found) return found;

    // Second attempt: Substring check
    found = studentList.find(s => s.name.toLowerCase().includes(cleanName) || cleanName.includes(s.name.toLowerCase()));
    if (found) return found;

    // Third attempt: Substring check of nicknames
    found = studentList.find(s => s.nickName && (s.nickName.toLowerCase().includes(cleanName) || cleanName.includes(s.nickName.toLowerCase())));
    return found || null;
  };

  // Database Save Loop
  const handleSaveImportToFirebaseAndLocalStorage = async () => {
    if (mappedSrudentsData.length === 0) return;
    setIsSaving(true);

    try {
      // Loop over combination of Tanggal + Domain + Aktivitas
      // Group evaluations by `${activity}_${domain}_${date}`
      const recordsToCommit: Record<string, {
        activity: KGActivity;
        domain: KGDomain;
        dateStr: string;
        observations: Record<string, { grading: KGGrading; notes: string; photo: string | null }>;
      }> = {};

      mappedSrudentsData.forEach((student) => {
        student.grades.forEach((g) => {
          const key = `${selectedActivity}_${g.domainId}_${g.dateStr}`;
          if (!recordsToCommit[key]) {
            recordsToCommit[key] = {
              activity: selectedActivity,
              domain: g.domainId,
              dateStr: g.dateStr,
              observations: {}
            };
          }
          recordsToCommit[key].observations[student.studentId] = {
            grading: g.grading,
            notes: `Observation imported via period bulk paste. [${g.dayLabel} - ${g.domainLabel}]`,
            photo: null
          };
        });
      });

      const uniqueComboKeys = Object.keys(recordsToCommit);
      console.log(`[BulkPeriodImport] Commit records count: ${uniqueComboKeys.length}`);

      // Save each combo to Firestore and LocalStorage
      for (const key of uniqueComboKeys) {
        const item = recordsToCommit[key];
        
        // 1. Commit to Firestore (collection: observations)
        const docRef = doc(db, 'observations', key);
        await setDoc(docRef, {
          id: key,
          activity: item.activity,
          domain: item.domain,
          date: item.dateStr,
          generalPhotoUrl: null, // bypassed per instruction
          observations: item.observations,
          timestamp: new Date(item.dateStr).getTime(),
          importedAt: Date.now()
        }, { merge: true });

        // 2. Commit to localStorage specific date combo key
        const lsKeyDate = `kg_obs_hist_${item.activity}_${item.domain}_${item.dateStr}`;
        const lsPayloadDate = {
          selectedActivity: item.activity,
          selectedDomain: item.domain,
          generalPhoto: null,
          observations: item.observations,
          timestamp: new Date(item.dateStr).getTime()
        };
        localStorage.setItem(lsKeyDate, JSON.stringify(lsPayloadDate));

        // 3. Commit also to parent overall localStorage key (last sync states)
        const lsKeyOverall = `kg_obs_hist_${item.activity}_${item.domain}`;
        localStorage.setItem(lsKeyOverall, JSON.stringify(lsPayloadDate));
      }

      toast.success(`Berhasil mengimpor data! ${uniqueComboKeys.length} kombinasi Hari & Evaluasi disimpan.`);
      setActiveStep(4);
      if (onImportSuccess) onImportSuccess();
    } catch (e) {
      console.error(e);
      toast.error(`Terjadi kesalahan saat menyimpan ke database: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const loadExampleTemplate = () => {
    const template = `PRA TK PANDA
DAY 1\tDAY 2\tDAY 3
Kognitif\tFisik-Motorik\tSosial-Emosional
Baim\tMulai Berkembang\tBerkembang Sesuai Harapan\tBelum Berkembang
Cakra\tBerkembang Sangat Baik\tMulai Berkembang\tBerkembang Sesuai Harapan
Kenan\tBelum Berkembang\tBerkembang Sesuai Harapan\tBerkembang Sangat Baik`;
    setPastedText(template);
    toast.info('Template terapan diisi ke ruang editor.');
  };

  return (
    <div className="max-w-5xl mx-auto bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden" id="observation-bulk-import-widget">
      
      {/* Top Wizard Steps Progress Header bar */}
      <div className="bg-emerald-600 text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-white/20 text-emerald-100 text-[10px] font-black uppercase rounded-full tracking-wider">
              Smart Wizard
            </span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-200">
              <Sparkles size={11} className="animate-spin" /> Period-Based Importer
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <FileSpreadsheet size={24} /> Smart Bulk Import Observation
          </h2>
          <p className="text-emerald-100 text-xs font-medium max-w-xl">
            Impor pencapaian siswa selama satu bulan sekaligus dari spreadsheet. Logika cerdas menghindari akhir pekan dan memaketkannya per aktivitas serta per domain secara modular.
          </p>
        </div>

        {onClose && (
          <button 
            type="button"
            onClick={onClose}
            className="self-end md:self-auto bg-white/15 hover:bg-white/25 px-4 py-2 text-xs font-bold rounded-xl transition-all"
          >
            Tutup
          </button>
        )}
      </div>

      {/* Progress Circles */}
      <div className="px-8 py-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-center gap-3">
        {[
          { step: 1, label: 'Konfigurasi' },
          { step: 2, label: 'Salin & Analisis' },
          { step: 3, label: 'Konfirmasi' },
          { step: 4, label: 'Selesai' }
        ].map((s, idx, arr) => (
          <React.Fragment key={s.step}>
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all",
                activeStep === s.step 
                  ? "bg-emerald-600 text-white font-extrabold ring-4 ring-emerald-100" 
                  : activeStep > s.step 
                    ? "bg-emerald-100 text-emerald-700" 
                    : "bg-gray-200 text-gray-500"
              )}>
                {activeStep > s.step ? <CheckCircle2 size={12} strokeWidth={3} /> : s.step}
              </div>
              <span className={cn(
                "text-[10px] font-bold tracking-tight uppercase Hidden sm:inline",
                activeStep === s.step ? "text-emerald-800 font-extrabold" : "text-gray-400"
              )}>
                {s.label}
              </span>
            </div>
            {idx < arr.length - 1 && (
              <div className={cn("w-6 h-0.5 sm:w-12 bg-gray-200", activeStep > s.step && "bg-emerald-200")} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Workspace Panel */}
      <div className="p-6 md:p-8 space-y-6 min-h-[350px]">
        
        {/* STEP 1: CONFIGURATION */}
        {activeStep === 1 && (
          <div className="space-y-6 transition-all duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Activity choice */}
              <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                  <Compass size={18} className="text-emerald-500" />
                  <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">1. Pilih Sentra / Sesi</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {activitiesList.map(act => {
                    const isSelected = selectedActivity === act.id;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => setSelectedActivity(act.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 p-2 rounded-xl text-left border text-[10.5px] transition-all",
                          isSelected 
                            ? "bg-emerald-600 text-white border-emerald-500 font-black shadow-md shadow-emerald-50" 
                            : "bg-gray-50/50 hover:bg-gray-100 hover:text-emerald-700 text-gray-700 border-gray-150"
                        )}
                      >
                        <div className={cn(
                          "p-1.5 rounded-lg",
                          isSelected ? "bg-white/20 text-white" : "bg-white text-gray-500 border border-gray-100"
                        )}>
                          {act.icon}
                        </div>
                        <span className="truncate">{act.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Datepicker period and Working days math */}
              <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                  <Calendar size={18} className="text-emerald-500" />
                  <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">2. Tentukan Periode Rentang</h3>
                </div>

                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Tanggal Mulai (Start Date)</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-200 text-xs font-bold font-mono text-gray-800 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-400"
                        value={startDateStr}
                        onChange={(e) => setStartDateStr(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Tanggal Berakhir (End Date)</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-200 text-xs font-bold font-mono text-gray-800 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-400"
                        value={endDateStr}
                        onChange={(e) => setEndDateStr(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Math summary info */}
                  <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex items-start gap-3">
                    <Info className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                    <div className="text-[11px] leading-relaxed text-emerald-800">
                      <p className="font-extrabold text-emerald-950 uppercase tracking-wider text-[9.5px]">Logika Hari Kerja Terdeteksi:</p>
                      <p className="mt-1">
                        Sistem memetakan entri secara beruntun hanya pada hari <strong className="font-black">Senin s.d. Jumat</strong> di antara rentang tanggal yang dipilih.
                      </p>
                      <p className="mt-1.5 font-black text-emerald-950 underline flex items-center gap-1 bg-white/70 py-1 px-2.5 rounded-lg w-fit">
                        Total Hari Kerja Efektif: {availableWorkdays.length} hari
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                disabled={availableWorkdays.length === 0}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-emerald-50 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
              >
                Lanjutkan Isi Data <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: COPY & ANALYZE */}
        {activeStep === 2 && (
          <div className="space-y-5 transition-all duration-300">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50/70 p-4 border border-gray-100 rounded-2xl gap-3">
              <div className="text-xs">
                <span className="font-extrabold text-emerald-800 block text-[10px] uppercase tracking-widest">Sentra Terpilih</span>
                <span className="font-black text-gray-800 text-sm mt-0.5 block">{activeActivityObj?.label}</span>
              </div>
              <div className="text-left md:text-right text-xs">
                <span className="font-extrabold text-emerald-800 block text-[10px] uppercase tracking-widest">Periode Observasi</span>
                <span className="font-bold text-gray-800 text-sm mt-0.5 block">
                  {format(parseISO(startDateStr), 'dd MMM yyyy')} s.d. {format(parseISO(endDateStr), 'dd MMM yyyy')} ({availableWorkdays.length} Hari Kerja)
                </span>
              </div>
            </div>

            {/* Template directions info */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Guidelines */}
              <div className="lg:col-span-4 p-5 bg-teal-50 border border-teal-100 rounded-2xl space-y-3.5">
                <h4 className="text-[10px] font-black text-teal-900 uppercase tracking-widest flex items-center gap-1.5">
                  <ClipboardList size={14} /> Aturan Layout Tempel
                </h4>
                
                <ul className="text-[10px] space-y-2 text-teal-850 leading-relaxed list-decimal pl-4 font-medium">
                  <li>Kolom pertama harus berisi <strong className="font-extrabold">Nama Lengkap</strong> atau <strong className="font-extrabold">Nama Panggilan</strong> siswa.</li>
                  <li>Baris pertama berisi marker hari: <code className="px-1 py-0.5 bg-white border border-teal-250 rounded font-mono font-bold text-[9px]">DAY 1</code>, <code className="px-1 py-0.5 bg-white border border-teal-250 rounded font-mono font-bold text-[9px]">DAY 2</code>, dst.</li>
                  <li>Baris kedua berisi nama <strong className="font-black">Domain Kompetensi</strong> (contoh: Kognitif, Bahasa, Seni).</li>
                  <li>Baris selanjutnya adalah deretan nama siswa beserta sebutan tingkat capaian (<strong className="font-black">Mulai Berkembang</strong>, dsb).</li>
                </ul>

                <button
                  type="button"
                  onClick={loadExampleTemplate}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white hover:bg-teal-100 text-teal-700 border border-teal-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm"
                >
                  <Sparkles size={11} /> Muat Template Demo
                </button>
              </div>

              {/* Paste Textarea */}
              <div className="lg:col-span-8 space-y-1.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Tempelkan Salinan Dokumen Spreadsheet Di Sini</span>
                  <span className="text-gray-300 text-[8.5px]">Mendukung tab-separated text</span>
                </label>
                
                <textarea
                  rows={9}
                  className="w-full bg-gray-50 border border-gray-200 font-mono text-[10.5px] p-4 rounded-xl leading-relaxed outline-none focus:bg-white focus:ring-1 focus:ring-emerald-400 placeholder:italic text-gray-800"
                  placeholder="PRA TK PANDA&#10;DAY 1&#9;DAY 2&#9;DAY 3&#10;Kognitif&#9;Fisik-Motorik&#9;Sosial-Emosional&#10;Baim&#9;Mulai Berkembang&#9;Berkembang Sesuai Harapan&#9;Belum Berkembang"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
              </div>

            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-600 font-bold px-4 py-3 rounded-xl border border-gray-200 text-xs transition-transform active:scale-97"
              >
                <ArrowLeft size={13} /> Kembali
              </button>

              <button
                type="button"
                onClick={handleParseText}
                disabled={isProcessing || !pastedText.trim()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-emerald-50 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Menganalisis...
                  </>
                ) : (
                  <>
                    Analisis Spreadsheet <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* STEP 3: CONFIRM PREVIEW */}
        {activeStep === 3 && (
          <div className="space-y-6 transition-all duration-300">
            
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 border border-gray-150 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-black rounded text-[10px]">PROSESSED OK</span>
                <span className="font-bold text-gray-500">Merasionalisasikan total {mappedSrudentsData.length} siswa dengan filter {availableWorkdays.length} hari kerja.</span>
              </div>

              {warningCount > 0 && (
                <div className="flex items-center gap-1.5 bg-yellow-50 text-yellow-800 px-3 py-1 border border-yellow-200 rounded-lg text-[10px] font-black uppercase tracking-wide">
                  <AlertTriangle size={12} className="text-yellow-600 shrink-0" />
                  {warningCount} Catatan Terdeteksi
                </div>
              )}
            </div>

            {/* Error alerts / unpmapped columns warning */}
            {unmappedDomainCount > 0 && (
              <div className="bg-rose-50 text-rose-800 p-4 border border-rose-100 rounded-xl flex items-start gap-3">
                <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                <div className="text-[11px] leading-relaxed">
                  <p className="font-black text-rose-900 text-[10px] uppercase tracking-wider">Deteksi Nama Domain Tidak Cocok!</p>
                  <p className="mt-0.5">
                    Sebanyak {unmappedDomainCount} kolom memiliki label domain yang tidak cocok dengan 6 Domain Resmi Kurikulum Lumina. Sistem akan mendefaultkannya secara cerdas ke domain terdekat atau "Sosial-Emosional".
                  </p>
                </div>
              </div>
            )}

            {/* Unmatched names blocks */}
            {unmatchedNames.length > 0 && (
              <div className="bg-yellow-50 text-yellow-800 p-4 border border-yellow-100 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-yellow-600" />
                  <span className="font-extrabold text-[10px] uppercase tracking-wider text-yellow-950">
                    Siswa Tidak Cocok ({unmatchedNames.length} nama diabaikan)
                  </span>
                </div>
                <p className="text-[10px] leading-relaxed text-yellow-850">
                  Berikut nama anak di spreadsheet yang tidak ditemukan kecocokan datanya dalam sistem lokal. Pastikan ejaan nama lengkap cocok:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {unmatchedNames.map((name, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white border border-yellow-250 text-xs font-semibold text-gray-700 rounded-lg">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* High visual table of student data preview */}
            <div className="space-y-2">
              <span className="text-[9.5px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                <UserCheck size={14} className="text-emerald-600" /> Tabel Verifikasi Data Observasi Periode
              </span>

              <div className="border border-gray-150 rounded-2xl overflow-hidden bg-white max-h-[380px] overflow-y-auto shadow-sm">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600 border-b border-gray-200">
                      <th className="p-3 font-black uppercase tracking-wider sticky left-0 bg-gray-100 z-10 border-r border-gray-200 min-w-[150px]">
                        Nama Siswa
                      </th>
                      {parsedDays.map((day, idx) => {
                        const dateObj = availableWorkdays[idx];
                        const dateFormatted = dateObj ? format(dateObj, 'dd MMM') : 'N/A';
                        const domLabel = parsedDomains[idx] || 'Sosem';
                        return (
                          <th key={idx} className="p-3 font-bold border-r border-gray-200 text-center min-w-[130px] leading-tight">
                            <span className="block font-black text-gray-900 text-[10px] tracking-wide">{day}</span>
                            <span className="block text-[8px] text-gray-400 mt-0.5 font-mono">{dateFormatted}</span>
                            <span className="block text-[8.5px] text-emerald-700 font-extrabold mt-1 truncate max-w-[125px]" title={domLabel}>
                              {domLabel}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedSrudentsData.map((student, sIdx) => (
                      <tr key={student.studentId} className={cn("border-b border-gray-150 hover:bg-gray-50/50", sIdx % 2 === 1 && "bg-gray-50/20")}>
                        <td className="p-3 font-black text-gray-800 uppercase tracking-tight sticky left-0 bg-white z-10 border-r border-gray-200 border-b">
                          <div className="leading-none">
                            <span>{student.studentName}</span>
                            <span className="block text-[8px] font-mono text-gray-400 mt-1">ID: {student.studentId}</span>
                          </div>
                        </td>
                        {parsedDays.map((_, idx) => {
                          const gradeObj = student.grades.find(g => g.dayLabel === parsedDays[idx]);
                          const cellGrade = gradeObj?.grading || null;
                          const rawCellText = gradeObj?.rawText || '';

                          return (
                            <td key={idx} className="p-2 border-r border-gray-200 text-center font-bold">
                              {cellGrade ? (
                                <span className={cn(
                                  "inline-block px-2.5 py-1 rounded-xl text-[9px] font-black border tracking-wide whitespace-nowrap shadow-sm",
                                  gradesList.find(g => g.id === cellGrade)?.color || "bg-gray-100 text-gray-500"
                                )}>
                                  {cellGrade}
                                </span>
                              ) : (
                                <span className="text-[8.5px] text-gray-300 italic block font-mono" title={rawCellText ? `Error parsing: "${rawCellText}"` : "Belum diisi"}>
                                  {rawCellText ? `err: "${rawCellText.slice(0,8)}"` : 'kosong'}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step Action panel */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-600 font-bold px-4 py-3 rounded-xl border border-gray-200 text-xs transition-transform active:scale-97"
              >
                <ArrowLeft size={13} /> Edit Teks
              </button>

              <button
                type="button"
                onClick={handleSaveImportToFirebaseAndLocalStorage}
                disabled={isSaving}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-7 py-4 rounded-2xl shadow-lg shadow-emerald-150 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Menyimpan Ke Firestore...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Beres & Simpan Permanen
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* STEP 4: RESULTS */}
        {activeStep === 4 && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-6 transition-all duration-300">
            
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-md scale-110">
              <CheckCircle2 size={36} strokeWidth={2.5} className="animate-pulse" />
            </div>

            <div className="space-y-2 max-w-md">
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-wide">Import Berhasil & Sinkron!</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Data observasi periodik untuk aktivitas <strong className="font-extrabold text-gray-700">{activeActivityObj?.label}</strong> telah berhasil disimpan ke koleksi database Firestore <code className="px-1 py-0.5 bg-gray-100 rounded font-mono">observations</code> dan disinkronkan secara mulus ke penyimpanan lokal (Local Storage) web browser guru.
              </p>
            </div>

            <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border border-emerald-100 text-[11px] leading-relaxed max-w-md text-left space-y-1">
              <p className="font-extrabold text-emerald-950 uppercase tracking-widest text-[9px]">Ringkasan Integrasi:</p>
              <ul className="list-disc pl-4 space-y-1 mt-1">
                <li>Bypass foto general sukses (Foto general bernilai null).</li>
                <li>Pencatatan tersebar aman tanpa menimpa data di luar periode tanggal kerja terpilih.</li>
                <li>Laporan Mingguan (Weekly Report) dapat langsung membaca log observasi ini secara dinamis.</li>
              </ul>
            </div>

            <div className="pt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPastedText('');
                  setActiveStep(1);
                }}
                className="px-5 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-black uppercase tracking-widest rounded-xl transition-all"
              >
                Impor Data Lain
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Selesai & Keluar
                </button>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
