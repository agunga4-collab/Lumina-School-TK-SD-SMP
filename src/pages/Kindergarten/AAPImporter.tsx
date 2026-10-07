import * as React from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
import { 
  FileSpreadsheet, AlertCircle, RefreshCw, X, Save, 
  CheckCircle2, AlertTriangle, ChevronDown, Check, Sparkles, FileText, UploadCloud, Eye
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';
import { isTeacherAssignedToClass } from '../../services/classTeacherAssignmentService';
import { 
  AAP_RUBRIC, 
  AAP_ASPECTS, 
  getStageFromPercentage, 
  STAGE_LABELS 
} from '../../config/aapRubric';
import * as XLSX from 'xlsx';

interface AAPImporterProps {
  classes: any[];
  students: any[];
  selectedClassId: string;
  onImportSuccess: () => void;
  onClose: () => void;
}

interface ParsedRow {
  excelRowIndex: number; // 1-based row index in Excel
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
  validationWarning?: string;
  rowAction: 'IMPORT' | 'SKIP';
}

export default function AAPImporter({ 
  classes = [], 
  students = [], 
  selectedClassId, 
  onImportSuccess, 
  onClose 
}: AAPImporterProps) {
  const { activeYear } = useAcademicYear();
  const { profile } = useAuth();
  
  // File Upload states
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [workbook, setWorkbook] = React.useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = React.useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = React.useState<string>('');
  const [isReadingFile, setIsReadingFile] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  // Parsing & Import states
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [existingAssessments, setExistingAssessments] = React.useState<Record<string, any>>({});
  const [isCheckingDuplicates, setIsCheckingDuplicates] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isParsed, setIsParsed] = React.useState(false);
  const [overwriteSettings, setOverwriteSettings] = React.useState<Record<string, 'OVERWRITE' | 'SKIP'>>({});
  const [showConflictDialog, setShowConflictDialog] = React.useState(false);
  const [detectedAspectsMeta, setDetectedAspectsMeta] = React.useState<{
    aspectName: string;
    indicatorCount: number;
    labels: string[];
    isMismatched: boolean;
    mismatchReason?: string;
  }[]>([]);
  const [excelClassName, setExcelClassName] = React.useState<string>('');
  
  // Detail Modal state
  const [selectedRowIdxForDetail, setSelectedRowIdxForDetail] = React.useState<number | null>(null);

  // File input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  // Security Verification
  const isSuperAdminOrHead = profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_UNIT';
  const isAssigned = selectedClass ? isTeacherAssignedToClass(selectedClass, profile?.uid || '') : false;
  const hasPermission = isSuperAdminOrHead || isAssigned;

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
  const convertScoreVal = (val: any): number | null | string => {
    if (val === undefined || val === null || val === '') return null;
    const s = String(val).toLowerCase().trim();
    if (s === '') return null;
    if (s === '1' || s === 'bb') return 1;
    if (s === '2' || s === 'mb') return 2;
    if (s === '3' || s === 'bsh') return 3;
    if (s === '4' || s === 'bsb') return 4;

    const num = parseInt(s, 10);
    if (!isNaN(num) && num >= 1 && num <= 4) return num;
    return val; // store raw text if invalid so we can highlight red
  };

  // Format bytes to readable size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processSelectedFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('Format file salah. Hanya diizinkan berkas .xlsx atau .xls');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran berkas melebihi batas 10 MB.');
      return;
    }

    setSelectedFile(file);
    setIsReadingFile(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        if (wb.SheetNames.length > 0) {
          setSelectedSheetName(wb.SheetNames[0]);
        }
        toast.success(`Berkas ${file.name} berhasil dibaca.`);
      } catch (err: any) {
        console.error(err);
        toast.error(`Gagal membaca berkas Excel: ${err.message}`);
      } finally {
        setIsReadingFile(false);
      }
    };
    reader.onerror = () => {
      toast.error('Terjadi kesalahan saat membaca file.');
      setIsReadingFile(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const resetFileSelection = () => {
    setSelectedFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheetName('');
    setParsedRows([]);
    setIsParsed(false);
    setSelectedRowIdxForDetail(null);
    setDetectedAspectsMeta([]);
    setExcelClassName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle parsing spreadsheet content
  const handleParseExcel = () => {
    if (!workbook || !selectedSheetName) {
      toast.error('Silakan unggah berkas Excel dan pilih sheet data terlebih dahulu.');
      return;
    }

    try {
      const sheet = workbook.Sheets[selectedSheetName];
      // Convert sheet to JSON array of arrays (header: 1 forces 2D array output)
      // raw: true reads formula calculated value results instead of the formula string
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: null,
        raw: true
      });

      if (rows.length === 0) {
        toast.error('Worksheet kosong atau tidak dapat di-parse.');
        return;
      }

      // Read Class Name from B2 (row index 1, column index 1)
      const classNameFromExcel = rows[1]?.[1] ? String(rows[1][1]).trim() : '';
      setExcelClassName(classNameFromExcel);

      // Helper to resolve aspect standard name
      const getAspectFromHeader = (text: string): string | null => {
        const t = String(text || '').toLowerCase().trim();
        if (t.includes('motorik kasar') || t.includes('kasar')) return 'Motorik Kasar';
        if (t.includes('motorik halus') || t.includes('halus')) return 'Motorik Halus';
        if (t.includes('bahasa')) return 'Bahasa';
        if (t.includes('kognitif')) return 'Kognitif';
        if (t.includes('sosial') || t.includes('kemandirian')) return 'Sosial & Kemandirian';
        return null;
      };

      // Detect headers and aspects
      let aspectRowIdx = -1;
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r];
        if (!row) continue;
        const hasAspectMarker = row.some(cell => cell && String(cell).toLowerCase().includes('aspek'));
        if (hasAspectMarker) {
          aspectRowIdx = r;
          break;
        }
      }

      if (aspectRowIdx === -1) {
        toast.error('Tidak menemukan baris Header Aspek (yang berisi kata "Aspek") di dalam Excel.');
        return;
      }

      const indicatorRowIdx = aspectRowIdx + 1;
      const dataStartRowIdx = indicatorRowIdx + 1;

      // Find Name Column Index dynamically (with header "Full Name")
      let nameColIdx = -1;
      const aspectRow = rows[aspectRowIdx];
      const indicatorRow = rows[indicatorRowIdx];

      aspectRow.forEach((cell, idx) => {
        if (cell && (String(cell).toLowerCase().trim() === 'full-name' || String(cell).toLowerCase().trim() === 'full name')) {
          nameColIdx = idx;
        }
      });
      if (nameColIdx === -1) {
        indicatorRow.forEach((cell, idx) => {
          if (cell && (String(cell).toLowerCase().trim() === 'full-name' || String(cell).toLowerCase().trim() === 'full name' || String(cell).toLowerCase().trim() === 'nama' || String(cell).toLowerCase().trim() === 'nama siswa')) {
            nameColIdx = idx;
          }
        });
      }
      if (nameColIdx === -1) {
        nameColIdx = 1; // Fallback to column B
      }

      // Map aspect column starts
      const aspectHeaders: { colIdx: number; aspectName: string; rawHeader: string }[] = [];
      aspectRow.forEach((cell: any, colIdx: number) => {
        if (!cell) return;
        const aspectName = getAspectFromHeader(cell);
        if (aspectName) {
          // Avoid duplicate aspect column headers
          if (!aspectHeaders.some(h => h.aspectName === aspectName)) {
            aspectHeaders.push({ colIdx, aspectName, rawHeader: String(cell) });
          }
        }
      });

      aspectHeaders.sort((a, b) => a.colIdx - b.colIdx);

      // Find DJ3:DM3 = BB, MB, BSH, BSB (kolom ringkasan)
      let summaryStartColIdx = -1;
      const lastAspectColIdx = aspectHeaders[aspectHeaders.length - 1]?.colIdx || 0;
      for (let c = lastAspectColIdx; c < indicatorRow.length; c++) {
        const cellVal = String(aspectRow[c] || '').toUpperCase().trim();
        const indVal = String(indicatorRow[c] || '').toUpperCase().trim();
        if (cellVal === 'BB' || cellVal === 'MB' || cellVal === 'BSH' || cellVal === 'BSB' ||
            indVal === 'BB' || indVal === 'MB' || indVal === 'BSH' || indVal === 'BSB' ||
            indVal === '1' || indVal === '2' || indVal === '3' || indVal === '4' ||
            cellVal === '1' || cellVal === '2' || cellVal === '3' || cellVal === '4' ||
            indVal === 'JML BB' || indVal === 'JUMLAH BB') {
          summaryStartColIdx = c;
          break;
        }
      }

      if (summaryStartColIdx === -1) {
        summaryStartColIdx = indicatorRow.length;
      }

      interface AspectColumnMap {
        aspectName: string;
        startColIdx: number;
        indicators: { colIdx: number; label: string }[];
        analysisColIdx: number;
        recommendationColIdx: number;
      }

      const aspectColumnMaps: AspectColumnMap[] = [];

      aspectHeaders.forEach((aspectHeader, i) => {
        const startColIdx = aspectHeader.colIdx;
        const endColIdx = (i < aspectHeaders.length - 1) 
          ? aspectHeaders[i+1].colIdx 
          : summaryStartColIdx;

        const indicators: { colIdx: number; label: string }[] = [];
        let analysisColIdx = -1;
        let recommendationColIdx = -1;

        for (let c = startColIdx; c < endColIdx; c++) {
          const detailVal = indicatorRow[c];
          if (detailVal === null || detailVal === undefined) continue;
          const detailStr = String(detailVal).trim();
          if (detailStr === '') continue;

          // Check for special columns
          if (detailStr === 'Analisis Perkembangan') {
            analysisColIdx = c;
          } else if (detailStr === 'Rekomendasi Stimulasi') {
            recommendationColIdx = c;
          } else {
            // Check if numeric (like 11, 12... 20)
            const isNum = !isNaN(Number(detailStr)) && detailStr !== '';
            if (!isNum) {
              indicators.push({ colIdx: c, label: detailStr });
            }
          }
        }

        aspectColumnMaps.push({
          aspectName: aspectHeader.aspectName,
          startColIdx,
          indicators,
          analysisColIdx,
          recommendationColIdx
        });
      });

      // Map all 5 standard aspects
      const finalAspectColumnMaps: AspectColumnMap[] = [];
      AAP_ASPECTS.forEach(aspect => {
        const found = aspectColumnMaps.find(m => m.aspectName === aspect);
        if (found) {
          finalAspectColumnMaps.push(found);
        } else {
          // fallback
          const activeIndicators = AAP_RUBRIC[ageRangeUsed]?.[aspect] || [];
          finalAspectColumnMaps.push({
            aspectName: aspect,
            startColIdx: -1,
            indicators: activeIndicators.map((lbl, iIdx) => ({ colIdx: -1, label: lbl })),
            analysisColIdx: -1,
            recommendationColIdx: -1
          });
        }
      });

      // Find BB/MB/BSH/BSB summary columns
      let summaryColBB = -1;
      let summaryColMB = -1;
      let summaryColBSH = -1;
      let summaryColBSB = -1;

      indicatorRow.forEach((cell: any, cIdx: number) => {
        if (!cell) return;
        const s = String(cell).toUpperCase().trim();
        if (s === 'BB' || s === 'JML BB' || s === 'JUMLAH BB' || s === 'TOTAL BB' || s === 'JML_BB' || s === '1') summaryColBB = cIdx;
        else if (s === 'MB' || s === 'JML MB' || s === 'JUMLAH MB' || s === 'TOTAL MB' || s === 'JML_MB' || s === '2') summaryColMB = cIdx;
        else if (s === 'BSH' || s === 'JML BSH' || s === 'JUMLAH BSH' || s === 'TOTAL BSH' || s === 'JML_BSH' || s === '3') summaryColBSH = cIdx;
        else if (s === 'BSB' || s === 'JML BSB' || s === 'JUMLAH BSB' || s === 'TOTAL BSB' || s === 'JML_BSB' || s === '4') summaryColBSB = cIdx;
      });

      if (summaryColBB === -1 || summaryColMB === -1 || summaryColBSH === -1 || summaryColBSB === -1) {
        aspectRow.forEach((cell: any, cIdx: number) => {
          if (!cell) return;
          const s = String(cell).toUpperCase().trim();
          if (s === 'BB' || s === 'JML BB' || s === 'JUMLAH BB' || s === 'TOTAL BB' || s === 'JML_BB' || s === '1') summaryColBB = cIdx;
          else if (s === 'MB' || s === 'JML MB' || s === 'JUMLAH MB' || s === 'TOTAL MB' || s === 'JML_MB' || s === '2') summaryColMB = cIdx;
          else if (s === 'BSH' || s === 'JML BSH' || s === 'JUMLAH BSH' || s === 'TOTAL BSH' || s === 'JML_BSH' || s === '3') summaryColBSH = cIdx;
          else if (s === 'BSB' || s === 'JML BSB' || s === 'JUMLAH BSB' || s === 'TOTAL BSB' || s === 'JML_BSB' || s === '4') summaryColBSB = cIdx;
        });
      }

      const getExcelNum = (val: any) => {
        if (val === undefined || val === null || val === '') return 0;
        const num = parseInt(String(val).trim(), 10);
        return isNaN(num) ? 0 : num;
      };

      // Set preview metadata
      const meta = finalAspectColumnMaps.map(aspectMap => {
        const defaultRubric = AAP_RUBRIC[ageRangeUsed]?.[aspectMap.aspectName] || [];
        const isMismatched = aspectMap.indicators.length !== defaultRubric.length || 
          aspectMap.indicators.some((ind, idx) => ind.label !== defaultRubric[idx]);
        
        let mismatchReason = '';
        if (isMismatched) {
          if (aspectMap.indicators.length !== defaultRubric.length) {
            mismatchReason = `Jumlah indikator berbeda (Excel: ${aspectMap.indicators.length}, Rubrik default: ${defaultRubric.length})`;
          } else {
            mismatchReason = `Teks indikator berbeda dengan rubrik default`;
          }
        }

        return {
          aspectName: aspectMap.aspectName,
          indicatorCount: aspectMap.indicators.length,
          labels: aspectMap.indicators.map(ind => ind.label),
          isMismatched,
          mismatchReason: mismatchReason || undefined
        };
      });

      setDetectedAspectsMeta(meta);

      const tempRows: ParsedRow[] = [];
      const studentDataRows = rows.slice(dataStartRowIdx);

      studentDataRows.forEach((row, relativeRowIdx) => {
        const actualExcelRowIndex = dataStartRowIdx + relativeRowIdx + 1; // 1-based row index in Excel
        if (!row || row.length === 0) return;

        const nameVal = row[nameColIdx];
        if (nameVal === undefined || nameVal === null) return;

        const nameStr = String(nameVal).trim();
        if (nameStr === '' || nameStr === '0' || nameStr === '0.0') return; // Skip empty or '0' values

        const cleanNameStr = nameStr.toLowerCase();
        
        // Skip header words or standard non-student texts
        if (
          cleanNameStr === 'no' ||
          cleanNameStr === 'nama' ||
          cleanNameStr === 'nama siswa' ||
          cleanNameStr === 'jumlah' ||
          cleanNameStr === 'total' ||
          cleanNameStr === 'rata-rata' ||
          cleanNameStr === 'average' ||
          cleanNameStr.startsWith('aspek') ||
          AAP_ASPECTS.some(asp => cleanNameStr === asp.toLowerCase())
        ) {
          return;
        }

        // Skip purely numeric names (like row numbering 1, 2, 3...)
        const parsedNameInt = parseInt(nameStr, 10);
        if (!isNaN(parsedNameInt)) {
          return;
        }

        const name = nameStr;

        // Match roster student automatically
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

        let validationError = '';
        
        const aspectsData = finalAspectColumnMaps.map(aspectMap => {
          const indicatorsPayload = aspectMap.indicators.map(ind => {
            const rawVal = ind.colIdx !== -1 ? row[ind.colIdx] : null;
            const score = convertScoreVal(rawVal);
            return {
              indicatorName: ind.label,
              score
            };
          });

          // Pre-calculate score metrics to ensure we match Excel's rules
          const rawScore = indicatorsPayload.reduce((sum, item) => {
            const val = typeof item.score === 'number' ? item.score : 1;
            return sum + val;
          }, 0);
          const maxScore = indicatorsPayload.length * 4;
          const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
          const stage = getStageFromPercentage(percentage);

          const analysisRaw = aspectMap.analysisColIdx !== -1 ? row[aspectMap.analysisColIdx] : null;
          const analysis = (analysisRaw !== undefined && analysisRaw !== null && String(analysisRaw).trim() !== '') ? String(analysisRaw).trim() : null;

          const recommendationRaw = aspectMap.recommendationColIdx !== -1 ? row[aspectMap.recommendationColIdx] : null;
          const stimulationRecommendation = (recommendationRaw !== undefined && recommendationRaw !== null && String(recommendationRaw).trim() !== '') ? String(recommendationRaw).trim() : null;

          return {
            aspectName: aspectMap.aspectName,
            indicators: indicatorsPayload,
            rawScore,
            maxScore,
            percentage,
            stage,
            analysis,
            stimulationRecommendation
          };
        });

        // Cross validation with BB/MB/BSH/BSB columns in Excel
        let calculatedBB = 0;
        let calculatedMB = 0;
        let calculatedBSH = 0;
        let calculatedBSB = 0;

        aspectsData.forEach(asp => {
          asp.indicators.forEach(ind => {
            if (ind.score === 1) calculatedBB++;
            else if (ind.score === 2) calculatedMB++;
            else if (ind.score === 3) calculatedBSH++;
            else if (ind.score === 4) calculatedBSB++;
          });
        });

        const hasSummaryCols = summaryColBB !== -1 && summaryColMB !== -1 && summaryColBSH !== -1 && summaryColBSB !== -1;
        let validationWarning = '';

        if (hasSummaryCols) {
          const excelBB = getExcelNum(row[summaryColBB]);
          const excelMB = getExcelNum(row[summaryColMB]);
          const excelBSH = getExcelNum(row[summaryColBSH]);
          const excelBSB = getExcelNum(row[summaryColBSB]);

          if (calculatedBB !== excelBB || calculatedMB !== excelMB || calculatedBSH !== excelBSH || calculatedBSB !== excelBSB) {
            validationWarning = `Konfirmasi Excel (BB:${excelBB}, MB:${excelMB}, BSH:${excelBSH}, BSB:${excelBSB}) tidak cocok dengan hitung butir (BB:${calculatedBB}, MB:${calculatedMB}, BSH:${calculatedBSH}, BSB:${calculatedBSB})`;
          }
        }

        const isDuplicate = matchedStudentId ? !!existingAssessments[matchedStudentId] : false;

        tempRows.push({
          excelRowIndex: actualExcelRowIndex,
          pastedName: name,
          matchedStudentId,
          isDuplicate,
          aspectsData,
          validationError: validationError || undefined,
          validationWarning: validationWarning || undefined,
          rowAction: 'IMPORT'
        });
      });

      if (tempRows.length === 0) {
        toast.error('Tidak ada baris data siswa yang valid terdeteksi di sheet terpilih.');
        return;
      }

      setParsedRows(tempRows);
      setIsParsed(true);
      toast.success(`Berhasil mem-parse ${tempRows.length} baris data siswa! Silakan tinjau hasil validasi di bawah.`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Terjadi kesalahan saat mem-parse sheet: ${err.message}`);
    }
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

  // Toggle row skip action
  const handleToggleRowAction = (rowIdx: number) => {
    setParsedRows(prev => {
      const updated = [...prev];
      updated[rowIdx] = {
        ...updated[rowIdx],
        rowAction: updated[rowIdx].rowAction === 'IMPORT' ? 'SKIP' : 'IMPORT'
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
    // 1. Validate matching for rows that are NOT skipped
    const activeImportRows = parsedRows.filter(r => r.rowAction === 'IMPORT');
    const missingMatches = activeImportRows.some(r => !r.matchedStudentId);
    if (missingMatches) {
      toast.error('Ada siswa aktif impor yang belum terpasang dengan roster profil di sistem. Harap hubungkan manual atau pilih Lewati.');
      return;
    }

    // 2. Look for duplicates
    const duplicatedRows = activeImportRows.filter(r => r.isDuplicate);
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
      const createdBy = userParsed?.email || profile?.email || 'System';

      let successCount = 0;
      let skippedCount = 0;

      const importByPayload = {
        uid: profile?.uid || 'Unknown',
        name: profile?.name || profile?.displayName || profile?.email || 'Unknown'
      };

      for (const row of parsedRows) {
        if (row.rowAction === 'SKIP') {
          skippedCount++;
          continue;
        }

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

        const docId = `${row.matchedStudentId}_${activeYear.replace('/', '_')}`;
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
          sourceFileName: selectedFile?.name || 'file_upload.xlsx',
          sourceSheetName: selectedSheetName,
          importedAt: Timestamp.now(),
          importedBy: importByPayload,
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

  // Validation helpers
  const hasRowInvalidScores = (row: ParsedRow): boolean => {
    return row.aspectsData.some(a => 
      a.indicators.some(ind => ind.score !== null && (typeof ind.score !== 'number' || ind.score < 1 || ind.score > 4))
    );
  };

  const hasRowNullScores = (row: ParsedRow): boolean => {
    return row.aspectsData.some(a => 
      a.indicators.some(ind => ind.score === null || ind.score === undefined)
    );
  };

  // Active / Import counts among active import settings
  const activeRows = parsedRows.filter(r => r.rowAction === 'IMPORT');
  const invalidRowsCount = activeRows.filter(hasRowInvalidScores).length;
  const unmatchedRowsCount = activeRows.filter(r => !r.matchedStudentId).length;
  const readyRowsCount = activeRows.filter(r => r.matchedStudentId && !hasRowInvalidScores(r) && !r.validationError).length;
  const totalWarningRowsCount = activeRows.filter(r => r.matchedStudentId && hasRowNullScores(r) && !hasRowInvalidScores(r) && !r.validationError).length;

  const hasInvalidScoresOverall = activeRows.some(hasRowInvalidScores);
  const hasValidationErrorsOverall = activeRows.some(r => !!r.validationError);
  const hasUnmatchedOverall = activeRows.some(r => !r.matchedStudentId);

  // Security Access Check Render
  if (!hasPermission) {
    return (
      <div className="bg-white rounded-3xl border border-gray-150 p-8 shadow-sm space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col items-center text-center space-y-4 py-8">
          <div className="p-4 bg-rose-50 text-rose-600 rounded-full border border-rose-100">
            <AlertCircle size={40} />
          </div>
          <h3 className="text-xl font-extrabold text-gray-900">Akses Ditolak</h3>
          <p className="text-gray-500 max-w-md text-sm leading-relaxed">
            Anda tidak memiliki izin untuk mengimpor data untuk kelas <strong>{selectedClass?.name || 'ini'}</strong>. Hanya Wali Kelas Kindergarten yang diampu, Kepala Unit Kindergarten, atau Super Admin yang diizinkan untuk mengimpor data AAP.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 px-6 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-gray-200 transition active:scale-95"
          >
            Tutup Importer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm space-y-8">
      {/* Importer Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-6 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider w-fit">
            <FileSpreadsheet size={14} />
            <span>Excel / Sheets Importer</span>
          </div>
          <h2 className="text-xl font-black text-gray-950">Impor Excel Asesmen Awal Pembelajaran (AAP)</h2>
          <p className="text-sm text-gray-500">
            Unggah file Excel (.xlsx atau .xls) dari perangkat Anda, pilih worksheet, dan tinjau validasi data sebelum impor ke sistem.
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
                File Excel / Google Sheets harus menggunakan <strong>Struktur Blok Per Aspek</strong> (Minimal 110 kolom data setelah kolom Nama Siswa):
              </p>
              <ul className="list-decimal pl-5 space-y-1 font-sans">
                <li>Kolom A: <strong>No</strong>, Kolom B: <strong>Nama Siswa</strong> (Sistem otomatis mencari baris header "No" / "Nama")</li>
                <li>Setiap dari 5 aspek memiliki blok berurutan berisi: <strong>20 slot indikator</strong> + <strong>1 kolom Analisis Perkembangan</strong> + <strong>1 kolom Rekomendasi Stimulasi</strong>.</li>
                <li>Sistem membaca hasil rumus otomatis, mengabaikan slot indikator kosong yang melebihi jumlah indikator aktif usia anak, serta menyajikan review per-siswa sebelum disimpan.</li>
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
                        <li className="text-teal-700 font-bold truncate">... (Slot Kosong s/d 20)</li>
                        <li className="text-indigo-800 font-extrabold">Analisis Perkembangan</li>
                        <li className="text-indigo-800 font-extrabold">Rekomendasi Stimulasi</li>
                      </ol>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* File Upload Selector / Drag Area */}
          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className={cn(
                "border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-4 transition cursor-pointer text-center",
                isDragging 
                  ? "border-indigo-500 bg-indigo-50/50 text-indigo-700" 
                  : "border-gray-200 bg-gray-50/30 hover:bg-gray-50 text-gray-400 hover:text-gray-600"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                <UploadCloud size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-extrabold text-gray-800">Unggah File Excel AAP</p>
                <p className="text-xs text-gray-500">Tarik dan lepas berkas di sini, atau klik untuk memilih file</p>
              </div>
              <div className="text-[10px] bg-white border border-gray-100 shadow-sm px-3 py-1 rounded-full font-bold text-gray-400 uppercase tracking-wider">
                Format: .XLSX / .XLS • Maks. 10MB
              </div>
            </div>
          ) : (
            <div className="border border-gray-150 rounded-2xl p-6 bg-gray-50/30 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-extrabold text-gray-900 truncate max-w-md">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(selectedFile.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetFileSelection}
                  className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition border border-transparent hover:border-rose-100"
                  title="Ganti File"
                >
                  <X size={16} />
                </button>
              </div>

              {sheetNames.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-white p-4 rounded-xl border border-gray-100">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">Pilih Sheet Data:</label>
                    <div className="relative">
                      <select
                        value={selectedSheetName}
                        onChange={e => setSelectedSheetName(e.target.value)}
                        className="appearance-none w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 outline-none transition focus:ring-2 focus:ring-indigo-100"
                      >
                        {sheetNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleParseExcel}
                    disabled={isReadingFile}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-sm transition active:scale-95 w-full cursor-pointer"
                  >
                    {isReadingFile ? (
                      <>
                        <RefreshCw className="animate-spin" size={14} /> Membaca...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Baca & Validasi File
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3.5 border border-gray-200 rounded-2xl text-xs font-black text-gray-500 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition active:scale-95 uppercase tracking-widest cursor-pointer"
            >
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Validation Stats Alert */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100">
            <div className="flex items-start gap-3 text-indigo-900">
              <CheckCircle2 size={20} className="text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-extrabold uppercase tracking-wide">Validasi Berhasil di-Generate</p>
                <div className="text-indigo-700 mt-1 space-y-1">
                  <p>Berkas: <strong className="font-extrabold text-indigo-950">{selectedFile?.name}</strong> • Sheet: <strong className="font-extrabold text-indigo-950">{selectedSheetName}</strong></p>
                  <p>Nama Kelas di Excel: <strong className="font-extrabold text-indigo-950">{excelClassName || 'Tidak Terdeteksi'}</strong></p>
                  <p>Jumlah Siswa Terdeteksi: <strong className="font-extrabold text-indigo-950">{parsedRows.length} Siswa</strong></p>
                  <p>Menghubungkan ke kelas: <strong className="font-extrabold text-indigo-950">{selectedClass?.name}</strong> ({ageRangeUsed} Tahun)</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={resetFileSelection}
              className="flex items-center gap-1.5 text-[10px] font-black text-indigo-800 bg-white hover:bg-indigo-100 border border-indigo-200 rounded-xl px-4 py-2.5 uppercase tracking-wider transition active:scale-95 cursor-pointer self-start lg:self-center"
            >
              <RefreshCw size={12} /> Ganti File Excel
            </button>
          </div>

          {/* Contoh Narasi Siswa Pertama */}
          {parsedRows.length > 0 && (
            <div className="bg-indigo-50/30 border border-indigo-100/50 rounded-3xl p-6 space-y-4 shadow-sm">
              <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-600" /> Contoh Narasi Siswa Pertama: <span className="text-gray-900 font-extrabold uppercase">{parsedRows[0].pastedName}</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {parsedRows[0].aspectsData.map((asp, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 space-y-2 text-xs">
                    <span className="font-black text-indigo-700 uppercase text-[10px] tracking-wider block border-b border-gray-50 pb-1.5">{asp.aspectName}</span>
                    <div className="space-y-1.5 text-gray-600">
                      <p className="leading-relaxed"><strong className="text-gray-900">Analisis:</strong> {asp.analysis || <span className="text-gray-300 italic">Tidak ada narasi</span>}</p>
                      <p className="leading-relaxed"><strong className="text-gray-900">Rekomendasi:</strong> {asp.stimulationRecommendation || <span className="text-gray-300 italic">Tidak ada narasi</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Struktur Aspek & Indikator dari Excel */}
          <div className="bg-white border border-gray-150 rounded-3xl p-6 space-y-4 shadow-sm">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
              <FileText size={16} className="text-indigo-600" /> Pratinjau Struktur Aspek & Indikator dari Excel
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Berikut adalah aspek dan jumlah indikator yang berhasil dibaca dari baris header Excel Anda secara dinamis.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {detectedAspectsMeta.map(asp => (
                <div key={asp.aspectName} className={cn(
                  "p-4 rounded-2xl border space-y-2.5",
                  asp.isMismatched ? "bg-amber-50/30 border-amber-200" : "bg-gray-50/30 border-gray-150"
                )}>
                  <div className="flex flex-col gap-1 border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-black text-gray-900 uppercase truncate" title={asp.aspectName}>
                      {asp.aspectName}
                    </span>
                    <span className={cn(
                      "text-[9px] font-black px-2 py-0.5 rounded w-fit uppercase",
                      asp.isMismatched ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    )}>
                      {asp.indicatorCount} Indikator
                    </span>
                  </div>
                  {asp.isMismatched && (
                    <div className="flex items-start gap-1 text-[9px] font-bold text-amber-800 bg-amber-100/50 p-2 rounded-xl">
                      <AlertCircle size={10} className="shrink-0 mt-0.5" />
                      <p>{asp.mismatchReason}</p>
                    </div>
                  )}
                  <div className="max-h-[120px] overflow-y-auto space-y-1 text-[9px] font-medium text-gray-500">
                    {asp.labels.map((lbl, lIdx) => (
                      <div key={lIdx} className="truncate bg-white p-1 rounded border border-gray-100/80 leading-normal" title={lbl}>
                        {lIdx + 1}. {lbl}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 text-center">
              <span className="text-2xl font-black text-gray-950 block">{parsedRows.length}</span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Total Baris</span>
            </div>
            <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/50 text-center">
              <span className="text-2xl font-black text-emerald-700 block">{readyRowsCount}</span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Siap Impor</span>
            </div>
            <div className="bg-amber-50/40 p-4 rounded-2xl border border-amber-100/50 text-center">
              <span className="text-2xl font-black text-amber-700 block">{totalWarningRowsCount}</span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Skor Parsial/Kosong</span>
            </div>
            <div className="bg-rose-50/40 p-4 rounded-2xl border border-rose-100/50 text-center col-span-2 md:col-span-1">
              <span className="text-2xl font-black text-rose-700 block">{invalidRowsCount + unmatchedRowsCount}</span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600">Tinjau / Salah Nama</span>
            </div>
          </div>

          {/* Table Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider">Daftar Hasil Deteksi</h3>
              <span className="text-[10px] font-bold text-gray-400">* Klik tombol "Tinjau Detail" di ujung baris untuk mengoreksi nilai indikator & teks analisis secara interaktif.</span>
            </div>
            
            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-inner max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-black text-gray-500 uppercase tracking-wider sticky top-0 z-10">
                    <th className="py-3 px-4 text-center w-20">Baris Excel</th>
                    <th className="py-3 px-4">Nama dalam File</th>
                    <th className="py-3 px-4 w-64">Siswa Roster Lumina</th>
                    <th className="py-3 px-2 text-center">MK</th>
                    <th className="py-3 px-2 text-center">MH</th>
                    <th className="py-3 px-2 text-center">Bahasa</th>
                    <th className="py-3 px-2 text-center">Kognitif</th>
                    <th className="py-3 px-2 text-center">Sosial</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center w-40">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {parsedRows.map((row, rowIdx) => {
                    const isSkipped = row.rowAction === 'SKIP';
                    const isUnmatched = !row.matchedStudentId;
                    const hasInvalid = hasRowInvalidScores(row);
                    const hasNulls = hasRowNullScores(row);

                    // Aspect status generators
                    const getAspectBadge = (aspIdx: number) => {
                      const asp = row.aspectsData[aspIdx];
                      const invalid = asp.indicators.some(i => i.score !== null && (typeof i.score !== 'number' || i.score < 1 || i.score > 4));
                      if (invalid) return <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Invalid</span>;
                      
                      const nullCount = asp.indicators.filter(i => i.score === null).length;
                      if (nullCount === asp.indicators.length) return <span className="bg-gray-100 text-gray-400 text-[9px] font-semibold px-1.5 py-0.5 rounded">Kosong</span>;
                      if (nullCount > 0) return <span className="bg-amber-100 text-amber-800 text-[9px] font-medium px-1.5 py-0.5 rounded">Parsial</span>;
                      
                      // Calculate average & stage
                      const totalScore = asp.indicators.reduce((sum, item) => sum + (typeof item.score === 'number' ? item.score : 1), 0);
                      const maxScore = asp.indicators.length * 4;
                      const percentage = Math.round((totalScore / maxScore) * 100);
                      const stage = getStageFromPercentage(percentage);
                      return <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded">{stage}</span>;
                    };

                    let statusBadge = <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wide">Siap Impor</span>;
                    if (isSkipped) {
                      statusBadge = <span className="bg-gray-100 text-gray-400 text-[9px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide">Dilewati</span>;
                    } else if (isUnmatched) {
                      statusBadge = <span className="bg-orange-100 text-orange-800 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wide">Nama Salah</span>;
                    } else if (hasInvalid || row.validationError) {
                      statusBadge = <span className="bg-rose-100 text-rose-800 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wide">Tinjau/Error</span>;
                    } else if (hasNulls) {
                      statusBadge = <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wide">Skor Parsial</span>;
                    }

                    return (
                      <tr 
                        key={rowIdx}
                        className={cn(
                          "hover:bg-gray-50/50 transition font-sans",
                          isSkipped ? "bg-gray-50/20 opacity-60" : "",
                          isUnmatched && !isSkipped ? "bg-orange-50/10" : "",
                          hasInvalid && !isSkipped ? "bg-rose-50/10" : ""
                        )}
                      >
                        {/* Excel Row Index */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-gray-400">
                          {row.excelRowIndex}
                        </td>

                        {/* Excel Name */}
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-gray-900 uppercase">
                            {row.pastedName}
                          </div>
                          {row.isDuplicate && !isSkipped && (
                            <span className="bg-purple-100 text-purple-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider mt-0.5 inline-block">Ada AAP</span>
                          )}
                          {row.validationError && (
                            <p className="text-[10px] font-medium text-rose-600 mt-1 leading-tight">{row.validationError}</p>
                          )}
                          {row.validationWarning && (
                            <p className="text-[10px] font-bold text-amber-600 mt-1 leading-tight flex items-start gap-1">
                              <AlertCircle size={10} className="shrink-0 mt-0.5" />
                              <span>{row.validationWarning}</span>
                            </p>
                          )}
                        </td>

                        {/* Roster Matching Dropdown */}
                        <td className="py-3 px-4">
                          <div className="relative">
                            <select
                              value={row.matchedStudentId}
                              disabled={isSkipped}
                              onChange={e => handleUpdateMatchedStudent(rowIdx, e.target.value)}
                              className={cn(
                                "appearance-none w-full bg-white border rounded-xl pl-3 pr-8 py-2 text-[11px] font-bold tracking-wide transition outline-none disabled:bg-gray-50 disabled:cursor-not-allowed",
                                isUnmatched && !isSkipped
                                  ? "border-orange-300 text-orange-800 bg-orange-50/30 focus:border-orange-500" 
                                  : "border-gray-200 text-gray-700 hover:border-gray-300 focus:border-indigo-500"
                              )}
                            >
                              <option value="">-- Hubungkan Roster --</option>
                              {classStudents.map(student => (
                                <option key={student.id} value={student.id}>
                                  {student.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                        </td>

                        {/* Aspect statuses */}
                        <td className="py-3 px-2 text-center">{getAspectBadge(0)}</td>
                        <td className="py-3 px-2 text-center">{getAspectBadge(1)}</td>
                        <td className="py-3 px-2 text-center">{getAspectBadge(2)}</td>
                        <td className="py-3 px-2 text-center">{getAspectBadge(3)}</td>
                        <td className="py-3 px-2 text-center">{getAspectBadge(4)}</td>

                        {/* Row Status */}
                        <td className="py-3 px-4 text-center">
                          {statusBadge}
                        </td>

                        {/* Row Actions */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedRowIdxForDetail(rowIdx)}
                              className="flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg uppercase tracking-wider transition active:scale-95 cursor-pointer"
                              title="Tinjau & Edit detail murid"
                            >
                              <Eye size={12} /> Detail
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleRowAction(rowIdx)}
                              className={cn(
                                "text-[10px] font-black px-2.5 py-1.5 rounded-lg uppercase tracking-wider transition active:scale-95 cursor-pointer",
                                isSkipped 
                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" 
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              )}
                            >
                              {isSkipped ? 'Impor' : 'Lewati'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pt-6 border-t border-gray-100 gap-4">
            <div className="text-xs text-gray-400 font-semibold leading-relaxed">
              * Pastikan status semua siswa aktif adalah hijau (atau kuning jika bersedia membiarkan nilai kosong).<br />
              * Tombol impor tidak dapat diklik selama ada nilai invalid atau nama yang salah belum di-Exclude ("Lewati").
            </div>
            <div className="flex justify-end gap-3 self-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsParsed(false);
                  setParsedRows([]);
                  setSelectedRowIdxForDetail(null);
                }}
                className="px-6 py-3.5 border border-gray-200 rounded-2xl text-xs font-black text-gray-500 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition active:scale-95 uppercase tracking-widest cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={isSaving || hasInvalidScoresOverall || hasValidationErrorsOverall || hasUnmatchedOverall}
                onClick={handlePreImportCheck}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-black px-7 py-3.5 rounded-2xl shadow-md transition active:scale-95 text-xs uppercase tracking-widest cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Save size={14} /> Import Data ({activeRows.length} Siswa)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Detail Modal */}
      {selectedRowIdxForDetail !== null && parsedRows[selectedRowIdxForDetail] && (() => {
        const row = parsedRows[selectedRowIdxForDetail];
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-gray-100 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">Baris Excel {row.excelRowIndex}</span>
                  <h3 className="text-lg font-black text-gray-950 uppercase mt-1">Detail Asesmen: {row.pastedName}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRowIdxForDetail(null)}
                  className="p-2 hover:bg-gray-50 text-gray-400 hover:text-gray-700 rounded-full transition active:scale-90"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body (Scrollable) */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 font-sans">
                {row.aspectsData.map((aspect, aspectIdx) => (
                  <div key={aspect.aspectName} className="border border-gray-150 rounded-2xl p-5 bg-gray-50/30 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">{aspectIdx + 1}. {aspect.aspectName}</span>
                    </div>

                    {/* Indicators list */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {aspect.indicators.map((ind, cellIdx) => {
                        const isNull = ind.score === null || ind.score === undefined;
                        const isInvalid = !isNull && (typeof ind.score !== 'number' || ind.score < 1 || ind.score > 4);
                        return (
                          <div 
                            key={cellIdx} 
                            className={cn(
                              "p-3 rounded-xl border flex items-center justify-between gap-4 transition",
                              isNull ? "bg-amber-50/50 border-amber-200" : "",
                              isInvalid ? "bg-rose-50/50 border-rose-300" : "",
                              !isNull && !isInvalid ? "bg-white border-gray-100" : ""
                            )}
                          >
                            <span className="text-xs font-bold text-gray-700 leading-tight">
                              <span className="text-indigo-600 font-extrabold mr-1.5">[I{cellIdx + 1}]</span>
                              {ind.indicatorName}
                            </span>
                            
                            <select
                              value={ind.score !== null ? String(ind.score) : ''}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '') {
                                  handleUpdateScore(selectedRowIdxForDetail, aspectIdx, cellIdx, null);
                                } else {
                                  const parsed = parseInt(val, 10);
                                  handleUpdateScore(selectedRowIdxForDetail, aspectIdx, cellIdx, isNaN(parsed) ? val : parsed);
                                }
                              }}
                              className={cn(
                                "border rounded-lg text-xs font-black px-2 py-1 outline-none transition w-28 text-center shrink-0",
                                isNull ? "border-amber-300 text-amber-800 bg-amber-50 focus:border-amber-500" : "",
                                isInvalid ? "border-rose-400 text-rose-800 bg-rose-50 focus:border-rose-500" : "border-gray-200 text-gray-800 focus:border-indigo-500"
                              )}
                            >
                              <option value="">Belum Dinilai</option>
                              <option value="1">1 (BB)</option>
                              <option value="2">2 (MB)</option>
                              <option value="3">3 (BSH)</option>
                              <option value="4">4 (BSB)</option>
                              {isInvalid && (
                                <option value={String(ind.score)}>{String(ind.score)} (Invalid)</option>
                              )}
                            </select>
                          </div>
                        );
                      })}
                    </div>

                    {/* Text fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800 block">Analisis Perkembangan:</label>
                        <textarea
                          value={aspect.analysis || ''}
                          onChange={e => handleUpdateText(selectedRowIdxForDetail, aspectIdx, 'analysis', e.target.value)}
                          rows={2}
                          placeholder="Masukkan analisis observasi siswa..."
                          className="w-full text-xs font-medium border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl p-2.5 outline-none bg-white transition resize-none leading-tight"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800 block">Rekomendasi Stimulasi:</label>
                        <textarea
                          value={aspect.stimulationRecommendation || ''}
                          onChange={e => handleUpdateText(selectedRowIdxForDetail, aspectIdx, 'stimulationRecommendation', e.target.value)}
                          rows={2}
                          placeholder="Masukkan rekomendasi stimulasi lanjutan..."
                          className="w-full text-xs font-medium border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl p-2.5 outline-none bg-white transition resize-none leading-tight"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-gray-100 flex justify-end shrink-0 bg-gray-50/50 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setSelectedRowIdxForDetail(null)}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition active:scale-95 shadow-md cursor-pointer"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
              {parsedRows.filter(r => r.isDuplicate && r.matchedStudentId && r.rowAction === 'IMPORT').map(row => {
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
