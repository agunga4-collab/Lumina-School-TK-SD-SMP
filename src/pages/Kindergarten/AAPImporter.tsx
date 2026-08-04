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
  scores: (number | null | string)[]; // 1-4 or raw text if invalid
  isDuplicate: boolean;
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

  // Flat indicators sequence for this ageRange
  const flatIndicators = React.useMemo(() => {
    const list: { aspect: typeof AAP_ASPECTS[number]; indicatorName: string; index: number }[] = [];
    let idx = 0;
    AAP_ASPECTS.forEach(aspect => {
      const indicators = AAP_RUBRIC[ageRangeUsed]?.[aspect] || [];
      indicators.forEach(ind => {
        list.push({ aspect, indicatorName: ind, index: idx++ });
      });
    });
    return list;
  }, [ageRangeUsed]);

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
      let scoreCols: string[] = [];

      // Check if column 0 looks like a serial number (integer <= 3 digits) and column 1 has text
      const isCol0Serial = /^\d+$/.test(cols[0]) && cols[0].length <= 3 && cols[1] !== '';
      if (isCol0Serial) {
        name = cols[1];
        scoreCols = cols.slice(2);
      } else {
        name = cols[0];
        scoreCols = cols.slice(1);
      }

      // Exact or fuzzy matching name against classStudents
      let matchedStudentId = '';
      const cleanText = (t: string) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanName = cleanText(name);

      // 1. Try exact/fuzzy name match
      const matchedStudent = classStudents.find(s => {
        const sClean = cleanText(s.name);
        return sClean === cleanName || sClean.includes(cleanName) || cleanName.includes(sClean);
      });

      if (matchedStudent) {
        matchedStudentId = matchedStudent.id;
      }

      // Convert score values
      const convertedScores = flatIndicators.map((_, indIdx) => {
        const val = scoreCols[indIdx];
        if (val === undefined || val === '') return null;
        
        const s = val.toLowerCase();
        if (s === '1' || s === 'bb') return 1;
        if (s === '2' || s === 'mb') return 2;
        if (s === '3' || s === 'bsh') return 3;
        if (s === '4' || s === 'bsb') return 4;

        const num = parseInt(val, 10);
        if (!isNaN(num) && num >= 1 && num <= 4) return num;
        
        return val; // store raw text if invalid so we can highlight red
      });

      // Check duplicate
      const isDuplicate = matchedStudentId ? !!existingAssessments[matchedStudentId] : false;

      tempRows.push({
        pastedName: name,
        matchedStudentId,
        scores: convertedScores,
        isDuplicate
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
  const handleUpdateScore = (rowIdx: number, cellIdx: number, score: number | null) => {
    setParsedRows(prev => {
      const updated = [...prev];
      const newScores = [...updated[rowIdx].scores];
      newScores[cellIdx] = score;
      updated[rowIdx] = {
        ...updated[rowIdx],
        scores: newScores
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

        // Group scores into aspects
        const aspectsData = AAP_ASPECTS.map(aspect => {
          const aspectInds = flatIndicators.filter(f => f.aspect === aspect);
          const indicatorsPayload = aspectInds.map(f => {
            const scoreVal = row.scores[f.index];
            const parsedScore = typeof scoreVal === 'number' ? scoreVal : 1; // default to 1 (BB) if empty
            return {
              indicatorName: f.indicatorName,
              score: parsedScore as 1 | 2 | 3 | 4
            };
          });

          const rawScore = indicatorsPayload.reduce((sum, item) => sum + item.score, 0);
          const maxScore = indicatorsPayload.length * 4;
          const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
          const stage = getStageFromPercentage(percentage);

          return {
            aspectName: aspect,
            indicators: indicatorsPayload,
            rawScore,
            maxScore,
            percentage,
            stage
          };
        });

        const totalRaw = aspectsData.reduce((sum, item) => sum + item.rawScore, 0);
        const totalMax = aspectsData.reduce((sum, item) => sum + item.maxScore, 0);
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
          aspects: aspectsData,
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
    r.scores.some(s => s !== null && (typeof s !== 'number' || s < 1 || s > 4))
  );

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
            Salin tabel dari Excel/Google Sheet, tempelkan di kotak di bawah, kemudian sesuaikan baris datanya.
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
                Susun kolom Excel Anda dengan urutan sebagai berikut:
              </p>
              <ul className="list-decimal pl-5 space-y-1 font-sans">
                <li>Kolom 1: <strong>Nama Siswa</strong> (atau No. Urut di Kolom 1, Nama di Kolom 2)</li>
                <li>Kolom berikutnya: <strong>25 Nilai Indikator</strong> berurutan (Skala 1-4 atau teks BB, MB, BSH, BSB):</li>
              </ul>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3 pt-2 border-t border-amber-100/40">
                {AAP_ASPECTS.map(aspect => (
                  <div key={aspect} className="bg-white/65 p-2 rounded-xl border border-amber-100/40">
                    <p className="font-extrabold text-[10px] uppercase text-amber-950 mb-1">{aspect}</p>
                    <ol className="list-decimal list-inside text-[9px] text-amber-900 space-y-0.5">
                      {(AAP_RUBRIC[ageRangeUsed]?.[aspect] || []).map((ind, i) => (
                        <li key={i} className="truncate" title={ind}>{ind}</li>
                      ))}
                    </ol>
                  </div>
                ))}
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
                placeholder="Contoh format:&#10;Agung Adiputra	3	2	4	3	3	2	3	2	4	3	2	3	2	4	3	2	3	2	4	3	2	3	2	4	3&#10;Dewi Lestari	4	3	3	4	3	3	3	4	3	3	4	3	3	4	3	3	4	3	3	4	3	3	4	3	3"
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
                  Berhasil mendeteksi <strong>{parsedRows.length} baris</strong> data. Tinjau pemetaan nama dan nilai indikator di bawah.
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
          <div className="border border-gray-100 rounded-3xl overflow-hidden shadow-inner max-h-[480px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-wider select-none sticky top-0 z-10">
                  <th className="py-4 px-4 sticky left-0 bg-gray-50/90 backdrop-blur z-20 w-80">Siswa dari Excel / Database</th>
                  {flatIndicators.map((f, i) => (
                    <th key={i} className="py-4 px-2.5 text-center min-w-[50px] border-l border-gray-100/50" title={`${f.aspect}: ${f.indicatorName}`}>
                      <div className="text-[9px] text-gray-400 font-extrabold">{f.aspect.substring(0, 7)}</div>
                      <div className="text-[10px] text-gray-700 font-black mt-0.5">I{i+1}</div>
                    </th>
                  ))}
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
                        isUnmatched ? "bg-orange-50/30" : ""
                      )}
                    >
                      {/* Name / Match Column */}
                      <td className="py-3 px-4 font-sans sticky left-0 bg-white/95 backdrop-blur shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-10">
                        <div className="space-y-1">
                          <div className="font-extrabold text-gray-900 flex items-center gap-1.5 uppercase font-sans">
                            {row.pastedName}
                            {row.isDuplicate && (
                              <span className="bg-purple-100 text-purple-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Ada AAP</span>
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
                        </div>
                      </td>

                      {/* Score Columns */}
                      {flatIndicators.map((f, cellIdx) => {
                        const val = row.scores[cellIdx];
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
                                  handleUpdateScore(rowIdx, cellIdx, null);
                                } else {
                                  const parsed = parseInt(inputVal, 10);
                                  if (!isNaN(parsed)) {
                                    handleUpdateScore(rowIdx, cellIdx, parsed);
                                  } else {
                                    // Let user type letters but keep raw text so they can see invalid
                                    handleUpdateScore(rowIdx, cellIdx, inputVal as any);
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pt-4 border-t border-gray-100 gap-4">
            <div className="text-xs text-gray-400 font-semibold">
              * Klik nama siswa dari dropdown untuk menyelaraskan jika sistem gagal melakukan pemetaan nama secara otomatis.
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
                disabled={isSaving || hasInvalidScores}
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
