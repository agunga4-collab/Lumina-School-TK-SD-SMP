import * as React from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { 
  FileSpreadsheet, AlertCircle, RefreshCw, X, Save, 
  CheckCircle2, AlertTriangle, ChevronDown, Check, Sparkles, Clipboard
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  AAP_RUBRIC, 
  AAP_ASPECTS, 
  getStageFromPercentage, 
  STAGE_LABELS 
} from '../../config/aapRubric';

interface AAPImporterProps {
  classes: any[];
  students: any[];
  selectedClassId: string;
  onImportSuccess: () => void;
  onClose: () => void;
}

interface ParsedRow {
  pastedName: string;
  matchedStudentId: string; // empty if no match
  isDuplicate: boolean;
  aspectsData: {
    aspectName: string;
    indicators: { indicatorName: string; score: number | null | string }[];
    analysis: string | null;
    stimulationRecommendation: string | null;
  }[];
  validationError?: string;
}

export default function AAPImporter({ 
  classes = [], 
  students = [], 
  selectedClassId, 
  onImportSuccess, 
  onClose 
}: AAPImporterProps) {
  const { activeYear } = useAcademicYear();
  const [pastedText, setPastedText] = React.useState('');
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [existingAssessments, setExistingAssessments] = React.useState<Record<string, any>>({});
  const [isCheckingDuplicates, setIsCheckingDuplicates] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isParsed, setIsParsed] = React.useState(false);
  const [overwriteSettings, setOverwriteSettings] = React.useState<Record<string, 'OVERWRITE' | 'SKIP'>>({});
  const [showConflictDialog, setShowConflictDialog] = React.useState(false);
  
  // Determine ageGroup / ageRangeUsed based on class grade
  const selectedClass = classes.find(c => c.id === selectedClassId);
  
  const getAgeRangeFromClass = (cls: any): '2-4' | '4-5' | '5-6' => {
    const name = String(cls?.name || '').toLowerCase();
    const grade = String(cls?.grade || '').toLowerCase();
    if (name.includes('tk-b') || name.includes('tkb') || grade.includes('tk-b') || grade.includes('tkb') || grade.includes('b')) {
      return '5-6';
    }
    if (name.includes('tk-a') || name.includes('tka') || grade.includes('tk-a') || grade.includes('tka') || grade.includes('a')) {
      return '4-5';
    }
    return '2-4';
  };

  const ageRangeUsed = selectedClass ? getAgeRangeFromClass(selectedClass) : '4-5';

  // Fetch existing assessments to check for duplicates
  React.useEffect(() => {
    async function loadExisting() {
      if (!selectedClassId) return;
      try {
        setIsCheckingDuplicates(true);
        const q = query(
          collection(db, 'aap_assessments'),
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const snap = await getDocs(q);
        const records: Record<string, any> = {};
        snap.docs.forEach(d => {
          records[d.data().studentId] = d.data();
        });
        setExistingAssessments(records);
      } catch (err) {
        console.error("Error fetching existing AAP assessments:", err);
      } finally {
        setIsCheckingDuplicates(false);
      }
    }
    loadExisting();
  }, [selectedClassId, activeYear]);

  // Class students
  const classStudents = React.useMemo(() => {
    return students.filter(s => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Convert raw value to a valid score number or keep as raw text if invalid
  const convertScoreVal = (val: string | undefined): number | null | string => {
    if (val === undefined || val === '') return null;
    const s = val.toLowerCase().trim();
    if (s === '') return null;
    if (s === '1' || s === 'bb') return 1;
    if (s === '2' || s === 'mb') return 2;
    if (s === '3' || s === 'bsh') return 3;
    if (s === '4' || s === 'bsb') return 4;

    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= 4) return num;
    return val; // store raw text if invalid so we can highlight red
  };

  // Handle parsing pasted text
  const handleParse = () => {
    if (!pastedText.trim()) {
      toast.error('Masukkan teks salinan tabel dari Excel atau Google Sheet.');
      return;
    }

    const lines = pastedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const tempRows: ParsedRow[] = [];

    lines.forEach(line => {
      const cols = line.split('\t').map(c => c.trim());
      if (cols.length < 2) return;

      let name = '';
      let blockCols: string[] = [];

      // Check if column 0 looks like a serial number (integer <= 3 digits) and column 1 has text
      const isCol0Serial = /^\d+$/.test(cols[0]) && cols[0].length <= 3 && cols[1] !== '';
      if (isCol0Serial) {
        name = cols[1];
        blockCols = cols.slice(2);
      } else {
        name = cols[0];
        blockCols = cols.slice(1);
      }

      // Exact or fuzzy matching name against classStudents
      let matchedStudentId = '';
      const cleanText = (t: string) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanName = cleanText(name);

      const matchedStudent = classStudents.find(s => {
        const sClean = cleanText(s.name);
        return sClean === cleanName || sClean.includes(cleanName) || cleanName.includes(sClean);
      });

      if (matchedStudent) {
        matchedStudentId = matchedStudent.id;
      }

      // Check validation error: must have 5 aspects * 22 columns = 110 columns minimum
      let validationError = '';
      if (blockCols.length < 110) {
        validationError = `Kolom kurang dari format resmi. Minimal dibutuhkan 110 kolom data per siswa (5 aspek × 22 kolom). Terdeteksi hanya ${blockCols.length} kolom.`;
      }

      const aspectsData = AAP_ASPECTS.map((aspect, aspectIdx) => {
        const startColIdx = aspectIdx * 22;
        const activeIndicators = AAP_RUBRIC[ageRangeUsed]?.[aspect] || [];

        // Parse 20 indicator slots (we only care about active indicators up to activeIndicators.length)
        const indicatorsPayload = activeIndicators.map((indName, indIdx) => {
          const rawVal = blockCols[startColIdx + indIdx];
          const score = convertScoreVal(rawVal);
          return {
            indicatorName: indName,
            score
          };
        });

        // Parse Analisis Perkembangan at slot 20
        const analysisRaw = blockCols[startColIdx + 20];
        const analysis = (analysisRaw && analysisRaw !== '') ? analysisRaw : null;

        // Parse Rekomendasi Stimulasi at slot 21
        const recommendationRaw = blockCols[startColIdx + 21];
        const stimulationRecommendation = (recommendationRaw && recommendationRaw !== '') ? recommendationRaw : null;

        return {
          aspectName: aspect,
          indicators: indicatorsPayload,
          analysis,
          stimulationRecommendation
        };
      });

      // Check duplicate
      const isDuplicate = matchedStudentId ? !!existingAssessments[matchedStudentId] : false;

      tempRows.push({
        pastedName: name,
        matchedStudentId,
        isDuplicate,
        aspectsData,
        validationError: validationError || undefined
      });
    });

    setParsedRows(tempRows);
    setIsParsed(true);
    toast.success(`Berhasil mem-parse ${tempRows.length} baris data! Silakan tinjau tabel di bawah.`);
  };

  // Update matched student for a row
  const handleUpdateMatchedStudent = (rowIdx: number, studentId: string) => {
    setParsedRows(prev => {
      const updated = [...prev];
      updated[rowIdx] = {
        ...updated[rowIdx],
        matchedStudentId: studentId,
        isDuplicate: studentId ? !!existingAssessments[studentId] : false
      };
      return updated;
    });
  };

  // Update individual score cell
  const handleUpdateScore = (rowIdx: number, aspectIdx: number, cellIdx: number, score: any) => {
    setParsedRows(prev => {
      const updated = [...prev];
      const aspects = [...updated[rowIdx].aspectsData];
      const aspect = { ...aspects[aspectIdx] };
      const indicators = [...aspect.indicators];

      let converted: any = score;
      if (typeof score === 'string') {
        const s = score.toLowerCase().trim();
        if (s === '1' || s === 'bb') converted = 1;
        else if (s === '2' || s === 'mb') converted = 2;
        else if (s === '3' || s === 'bsh') converted = 3;
        else if (s === '4' || s === 'bsb') converted = 4;
      }

      indicators[cellIdx] = {
        ...indicators[cellIdx],
        score: converted
      };

      aspect.indicators = indicators;
      aspects[aspectIdx] = aspect;
      updated[rowIdx] = {
        ...updated[rowIdx],
        aspectsData: aspects
      };
      return updated;
    });
  };

  // Update individual text cell
  const handleUpdateText = (rowIdx: number, aspectIdx: number, fieldName: 'analysis' | 'stimulationRecommendation', text: string) => {
    setParsedRows(prev => {
      const updated = [...prev];
      const aspects = [...updated[rowIdx].aspectsData];
      const aspect = { ...aspects[aspectIdx] };

      aspect[fieldName] = text || null;

      aspects[aspectIdx] = aspect;
      updated[rowIdx] = {
        ...updated[rowIdx],
        aspectsData: aspects
      };
      return updated;
    });
  };

  // Verify and process Import
  const handlePreImportCheck = () => {
    // 1. Validate matching
    const missingMatches = parsedRows.some(r => !r.matchedStudentId);
    if (missingMatches) {
      toast.error('Ada siswa yang belum terpasang dengan profil di sistem. Harap pilih nama secara manual.');
      return;
    }

    // 2. Look for duplicates
    const duplicatedRows = parsedRows.filter(r => r.isDuplicate);
    if (duplicatedRows.length > 0) {
      // Set defaults to OVERWRITE
      const initialSettings: Record<string, 'OVERWRITE' | 'SKIP'> = {};
      duplicatedRows.forEach(r => {
        initialSettings[r.matchedStudentId] = 'OVERWRITE';
      });
      setOverwriteSettings(initialSettings);
      setShowConflictDialog(true);
    } else {
      executeImport([]);
    }
  };

  const executeImport = async (skipStudentIds: string[]) => {
    try {
      setIsSaving(true);
      const userStr = localStorage.getItem('user');
      const userParsed = userStr ? JSON.parse(userStr) : null;
      const createdBy = userParsed?.email || 'System';

      let successCount = 0;
      let skippedCount = 0;

      for (const row of parsedRows) {
        if (!row.matchedStudentId) continue;
        if (skipStudentIds.includes(row.matchedStudentId)) {
          skippedCount++;
          continue;
        }

        const student = classStudents.find(s => s.id === row.matchedStudentId);
        if (!student) continue;

        const aspectsPayload = row.aspectsData.map(aspectData => {
          const indicatorsPayload = aspectData.indicators.map(ind => {
            const scoreVal = ind.score;
            const parsedScore = typeof scoreVal === 'number' ? scoreVal : 1; // default to 1 (BB) if empty
            return {
              indicatorName: ind.indicatorName,
              score: parsedScore as 1 | 2 | 3 | 4
            };
          });

          const rawScore = indicatorsPayload.reduce((sum, item) => sum + item.score, 0);
          const maxScore = indicatorsPayload.length * 4;
          const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
          const stage = getStageFromPercentage(percentage);

          return {
            aspectName: aspectData.aspectName,
            indicators: indicatorsPayload,
            rawScore,
            maxScore,
            percentage,
            stage,
            analysis: aspectData.analysis || null,
            stimulationRecommendation: aspectData.stimulationRecommendation || null
          };
        });

        const totalRaw = aspectsPayload.reduce((sum, item) => sum + item.rawScore, 0);
        const totalMax = aspectsPayload.reduce((sum, item) => sum + item.maxScore, 0);
        const overallPercentage = totalMax > 0 ? Math.round((totalRaw / totalMax) * 100) : 0;
        const overallStage = getStageFromPercentage(overallPercentage);

        const docId = `${row.matchedStudentId}_${activeYear}`;
        const aapPayload = {
          studentId: row.matchedStudentId,
          studentName: student.name,
          classId: selectedClassId,
          className: selectedClass?.name || 'Unknown Class',
          academicYear: activeYear,
          ageRangeUsed,
          aspects: aspectsPayload,
          overallPercentage,
          overallStage,
          source: 'excel_import',
          createdBy,
          createdAt: existingAssessments[row.matchedStudentId]?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        await setDoc(doc(db, 'aap_assessments', docId), aapPayload);
        successCount++;
      }

      toast.success(`Berhasil mengimpor ${successCount} data Asesmen Awal! ${skippedCount > 0 ? `(${skippedCount} dilewati)` : ''}`);
      onImportSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error importing AAP data:", err);
      toast.error(`Gagal melakukan impor data: ${err.message}`);
    } finally {
      setIsSaving(false);
      setShowConflictDialog(false);
    }
  };

  const hasInvalidScores = parsedRows.some(r => 
    r.aspectsData.some(a => a.indicators.some(ind => ind.score !== null && (typeof ind.score !== 'number' || ind.score < 1 || ind.score > 4)))
  );

  const hasValidationErrors = parsedRows.some(r => !!r.validationError);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm space-y-8">
      {/* Importer Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-6 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider w-fit">
            <FileSpreadsheet size={14} />
            <span>Excel / Sheets Copier</span>
          </div>
          <h2 className="text-xl font-black text-gray-950">Impor Massal Asesmen Awal Pembelajaran (AAP)</h2>
          <p className="text-sm text-gray-500">
            Salin tabel dari Excel/Google Sheet format blok per aspek, tempelkan di kotak di bawah, kemudian sesuaikan baris datanya.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-3 hover:bg-gray-50 text-gray-400 hover:text-gray-700 rounded-full transition self-start active:scale-90 border border-transparent hover:border-gray-100 cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {!isParsed ? (
        <div className="space-y-6">
          {/* Quick Guide / Rubric Context */}
          <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-100/50 space-y-3">
            <h4 className="text-xs font-black text-amber-900 uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600" /> Petunjuk Format Kolom (Kelompok Usia {ageRangeUsed} Th)
            </h4>
            <div className="text-xs text-amber-800 leading-relaxed space-y-2">
              <p>
                Format Excel / Google Sheets resmi menggunakan <strong>Struktur Blok Per Aspek</strong> (Minimal 110 kolom data setelah Nama Siswa):
              </p>
              <ul className="list-decimal pl-5 space-y-1 font-sans">
                <li>Kolom A: <strong>No</strong>, Kolom B: <strong>Nama Siswa</strong></li>
                <li>Setiap dari 5 aspek memiliki blok berurutan berisi: <strong>20 slot indikator</strong> + <strong>1 kolom Analisis Perkembangan</strong> + <strong>1 kolom Rekomendasi Stimulasi</strong>.</li>
                <li>Sistem hanya membaca indikator aktif sesuai usia anak. Sisa slot indikator hingga kolom ke-20 akan dilewati secara otomatis.</li>
              </ul>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3 pt-2 border-t border-amber-100/40">
                {AAP_ASPECTS.map((aspect, aspectIdx) => {
                  const activeInds = AAP_RUBRIC[ageRangeUsed]?.[aspect] || [];
                  return (
                    <div key={aspect} className="bg-white/65 p-2 rounded-xl border border-amber-100/40">
                      <p className="font-extrabold text-[10px] uppercase text-amber-950 mb-1">
                        {aspectIdx + 1}. {aspect}
                      </p>
                      <p className="text-[9px] text-amber-800 font-bold mb-1">
                        ({activeInds.length} Indikator Aktif)
                      </p>
                      <ol className="list-decimal list-inside text-[9px] text-amber-900 space-y-0.5">
                        {activeInds.map((ind, i) => (
                          <li key={i} className="truncate" title={ind}>{ind}</li>
                        ))}
                        <li className="text-teal-700 font-bold truncate">... (Slot Kosong)</li>
                        <li className="text-indigo-800 font-extrabold">Analisis Perkembangan</li>
                        <li className="text-indigo-800 font-extrabold">Rekomendasi Stimulasi</li>
                      </ol>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Paste Area */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">
              Tempelkan Tabel Excel / Sheet Di Sini:
            </label>
            <div className="relative">
              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Salin baris dari Excel / Sheets Anda dan tempel di sini..."
                className="w-full h-80 bg-gray-50 border border-gray-200 rounded-2xl p-5 text-sm font-mono focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition"
              />
              {!pastedText && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-400 gap-2">
                  <Clipboard size={32} className="opacity-40" />
                  <span className="text-xs font-semibold">Ctrl+V / Klik & Paste data Anda di sini</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3.5 border border-gray-200 rounded-2xl text-xs font-black text-gray-500 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition active:scale-95 uppercase tracking-widest cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleParse}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-black px-7 py-3.5 rounded-2xl shadow-md transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer"
            >
              <Sparkles size={14} /> Preview & Validasi
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Validation Stats Alert */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100">
            <div className="flex items-center gap-3 text-indigo-900">
              <CheckCircle2 size={20} className="text-indigo-600 shrink-0" />
              <div className="text-xs">
                <p className="font-extrabold uppercase tracking-wide">Validasi Berhasil di-Generate</p>
                <p className="text-indigo-700 mt-0.5">
                  Berhasil mendeteksi <strong>{parsedRows.length} baris</strong> data. Tinjau pemetaan nama, nilai indikator, analisis, dan rekomendasi di bawah.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsParsed(false);
                setParsedRows([]);
              }}
              className="flex items-center gap-1.5 text-[10px] font-black text-indigo-800 bg-white hover:bg-indigo-100 border border-indigo-200 rounded-xl px-4 py-2 uppercase tracking-wider transition active:scale-95 cursor-pointer"
            >
              <RefreshCw size={12} /> Tempel Ulang
            </button>
          </div>

          {/* Warnings & Badges explanation */}
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-600 bg-gray-50 p-3 rounded-xl">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 block"></span>
              <span>Sel Kuning: Skor Kosong (Default: BB)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 block"></span>
              <span>Sel Merah: Nilai Invalid (bukan 1-4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300 block"></span>
              <span>Siswa Oranye: Nama tidak terdaftar (perlu dipetakan)</span>
            </div>
          </div>

          {/* Bulk Import Grid Sheet */}
          <div className="border border-gray-100 rounded-3xl overflow-hidden shadow-inner max-h-[500px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1500px]">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-wider select-none sticky top-0 z-10">
                  <th rowSpan={2} className="py-4 px-4 sticky left-0 bg-gray-50/90 backdrop-blur z-20 w-80 text-left">Siswa dari Excel / Database</th>
                  {AAP_ASPECTS.map((aspect) => {
                    const activeCount = (AAP_RUBRIC[ageRangeUsed]?.[aspect] || []).length;
                    return (
                      <th key={aspect} colSpan={activeCount + 2} className="py-2 px-2.5 text-center border-l border-gray-100/50 bg-indigo-50/30">
                        <div className="text-[10px] text-indigo-950 font-black">{aspect}</div>
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-[9px] font-bold text-gray-400 uppercase tracking-wider select-none sticky top-10 z-10">
                  {AAP_ASPECTS.map((aspect) => {
                    const activeIndicators = AAP_RUBRIC[ageRangeUsed]?.[aspect] || [];
                    return (
                      <React.Fragment key={aspect}>
                        {activeIndicators.map((ind, indIdx) => (
                          <th key={indIdx} className="py-2 px-1 text-center min-w-[45px] border-l border-gray-100/50" title={ind}>
                            I{indIdx + 1}
                          </th>
                        ))}
                        <th className="py-2 px-2 text-left min-w-[150px] border-l border-gray-100/50 bg-teal-50/20 text-teal-800 font-extrabold">Analisis</th>
                        <th className="py-2 px-2 text-left min-w-[150px] border-l border-gray-100/50 bg-purple-50/20 text-purple-800 font-extrabold">Rekomendasi</th>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {parsedRows.map((row, rowIdx) => {
                  const student = classStudents.find(s => s.id === row.matchedStudentId);
                  const isUnmatched = !row.matchedStudentId;

                  return (
                    <tr 
                      key={rowIdx} 
                      className={cn(
                        "hover:bg-gray-50/50 transition",
                        isUnmatched ? "bg-orange-50/30" : "",
                        row.validationError ? "bg-rose-50/30" : ""
                      )}
                    >
                      {/* Name / Match Column */}
                      <td className="py-3 px-4 font-sans sticky left-0 bg-white/95 backdrop-blur shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10">
                        <div className="space-y-1">
                          <div className="font-extrabold text-gray-900 flex items-center gap-1.5 uppercase font-sans">
                            {row.pastedName}
                            {row.isDuplicate && (
                              <span className="bg-purple-100 text-purple-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider font-sans">Ada AAP</span>
                            )}
                          </div>
                          
                          {/* Match Selector */}
                          <div className="relative">
                            <select
                              value={row.matchedStudentId}
                              onChange={e => handleUpdateMatchedStudent(rowIdx, e.target.value)}
                              className={cn(
                                "appearance-none w-full bg-white border rounded-xl pl-3 pr-8 py-2 text-[11px] font-bold tracking-wide transition outline-none",
                                isUnmatched 
                                  ? "border-orange-300 text-orange-800 bg-orange-50/30 focus:border-orange-500" 
                                  : "border-gray-200 text-gray-700 hover:border-gray-300 focus:border-indigo-500"
                              )}
                            >
                              <option value="">-- Pilih Roster Siswa --</option>
                              {classStudents.map(student => (
                                <option key={student.id} value={student.id}>
                                  {student.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>

                          {row.validationError && (
                            <p className="text-[10px] font-semibold text-rose-600 leading-tight mt-1">{row.validationError}</p>
                          )}
                        </div>
                      </td>

                      {/* Aspects Data Column Groups */}
                      {row.aspectsData.map((aspectData, aspectIdx) => {
                        return (
                          <React.Fragment key={aspectIdx}>
                            {/* Score Columns */}
                            {aspectData.indicators.map((ind, cellIdx) => {
                              const val = ind.score;
                              const isNull = val === null || val === undefined;
                              const isInvalid = !isNull && (typeof val !== 'number' || val < 1 || val > 4);

                              return (
                                <td 
                                  key={cellIdx} 
                                  className={cn(
                                    "py-2 px-1 border-l border-gray-100/50 text-center select-all",
                                    isNull ? "bg-amber-100/30" : "",
                                    isInvalid ? "bg-rose-100/40" : ""
                                  )}
                                >
                                  <input
                                    type="text"
                                    value={val !== null ? String(val) : ''}
                                    onChange={e => {
                                      const inputVal = e.target.value.trim();
                                      if (inputVal === '') {
                                        handleUpdateScore(rowIdx, aspectIdx, cellIdx, null);
                                      } else {
                                        const parsed = parseInt(inputVal, 10);
                                        if (!isNaN(parsed) && parsed >= 1 && parsed <= 4) {
                                          handleUpdateScore(rowIdx, aspectIdx, cellIdx, parsed);
                                        } else {
                                          handleUpdateScore(rowIdx, aspectIdx, cellIdx, inputVal);
                                        }
                                      }
                                    }}
                                    className={cn(
                                      "w-10 text-center bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 border rounded-lg py-1 font-black text-xs transition outline-none",
                                      isNull ? "border-amber-200 text-amber-800" : "",
                                      isInvalid ? "border-rose-300 text-rose-800" : "",
                                      !isNull && !isInvalid ? "border-transparent text-gray-800" : ""
                                    )}
                                  />
                                </td>
                              );
                            })}

                            {/* Analysis Text Column */}
                            <td className="py-2 px-2 border-l border-gray-100/50 bg-teal-50/10 min-w-[180px]">
                              <textarea
                                value={aspectData.analysis || ''}
                                onChange={e => handleUpdateText(rowIdx, aspectIdx, 'analysis', e.target.value)}
                                className="w-full min-h-[40px] text-xs font-medium bg-transparent border-transparent hover:border-gray-200 focus:border-indigo-500 focus:bg-white border rounded-lg p-1.5 transition outline-none resize-y leading-tight text-gray-800"
                                placeholder="Ketik Analisis..."
                              />
                            </td>

                            {/* Stimulation Recommendation Text Column */}
                            <td className="py-2 px-2 border-l border-gray-100/50 bg-purple-50/10 min-w-[180px]">
                              <textarea
                                value={aspectData.stimulationRecommendation || ''}
                                onChange={e => handleUpdateText(rowIdx, aspectIdx, 'stimulationRecommendation', e.target.value)}
                                className="w-full min-h-[40px] text-xs font-medium bg-transparent border-transparent hover:border-gray-200 focus:border-indigo-500 focus:bg-white border rounded-lg p-1.5 transition outline-none resize-y leading-tight text-gray-800"
                                placeholder="Ketik Rekomendasi..."
                              />
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pt-4 border-t border-gray-100 gap-4">
            <div className="text-xs text-gray-400 font-semibold">
              * Klik nama siswa dari roster jika sistem gagal memetakan nama otomatis. Kolom kosong akan otomatis bermakna Belum Berkembang (BB).
            </div>
            <div className="flex justify-end gap-3 self-end">
              <button
                type="button"
                onClick={() => {
                  setIsParsed(false);
                  setParsedRows([]);
                }}
                className="px-6 py-3.5 border border-gray-200 rounded-2xl text-xs font-black text-gray-500 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition active:scale-95 uppercase tracking-widest cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={isSaving || hasInvalidScores || hasValidationErrors}
                onClick={handlePreImportCheck}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-black px-7 py-3.5 rounded-2xl shadow-md transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Save size={14} /> Mulai Impor Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate / Conflict Dialog */}
      {showConflictDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-100 max-w-lg w-full p-7 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-50 text-purple-700 rounded-2xl border border-purple-100">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-gray-950">Konflik Data Asesmen Awal</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Beberapa siswa terpilih telah memiliki data Asesmen Awal (AAP) aktif di tahun ajaran ini ({activeYear}). Harap pilih aksi penyelesaian:
                </p>
              </div>
            </div>

            <div className="border border-gray-100 rounded-2xl max-h-[220px] overflow-y-auto p-1.5 divide-y divide-gray-100 shadow-inner">
              {parsedRows.filter(r => r.isDuplicate && r.matchedStudentId).map(row => {
                const sName = classStudents.find(s => s.id === row.matchedStudentId)?.name || row.pastedName;
                const setting = overwriteSettings[row.matchedStudentId] || 'OVERWRITE';

                return (
                  <div key={row.matchedStudentId} className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-xl transition">
                    <span className="text-xs font-bold text-gray-800 uppercase max-w-[240px] truncate">{sName}</span>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setOverwriteSettings(prev => ({ ...prev, [row.matchedStudentId]: 'OVERWRITE' }))}
                        className={cn(
                          "px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition",
                          setting === 'OVERWRITE' ? "bg-purple-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
                        )}
                      >
                        Timpa
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverwriteSettings(prev => ({ ...prev, [row.matchedStudentId]: 'SKIP' }))}
                        className={cn(
                          "px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition",
                          setting === 'SKIP' ? "bg-amber-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
                        )}
                      >
                        Lewati
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConflictDialog(false)}
                className="px-5 py-3 border border-gray-200 rounded-xl text-xs font-black text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition active:scale-95 uppercase tracking-widest cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const skipList = Object.entries(overwriteSettings)
                    .filter(([_, opt]) => opt === 'SKIP')
                    .map(([studId]) => studId);
                  executeImport(skipList);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-black px-6 py-3 rounded-xl shadow-md transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer animate-pulse"
              >
                Selesaikan & Impor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
