import * as React from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { 
  FileSpreadsheet, Sparkles, Calendar, Plus, Trash2, 
  CheckCircle2, AlertCircle, RefreshCw, X, HelpCircle, Save, Info, UserCheck,
  ArrowLeft, Check, AlertTriangle, Eye, Upload
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { getStoredStudents } from '../../lib/kindergartenWeeklyReport';
import type { KGActivity, KGDomain, KGGrading } from '../../types';
import { format, addDays, isWeekend, parseISO } from 'date-fns';
import { motion } from 'motion/react';

interface ObservationTableImporterProps {
  classes?: any[];
  students?: any[];
  initialClassId?: string;
  onImportSuccess?: () => void;
  onClose?: () => void;
}

const activitiesList: { id: KGActivity; label: string; color: string }[] = [
  { id: 'MAKE_BELIEVE', label: 'Make-Believe', color: 'teal' },
  { id: 'ISLAMIC_AWARENESS', label: 'Islamic Awareness', color: 'emerald' },
  { id: 'LIBRARY_LITERACY', label: 'Library & Literacy', color: 'blue' },
  { id: 'DISCOVERY', label: 'Discovery', color: 'orange' },
  { id: 'BLOCKS_BUILDING', label: 'Blocks & Building', color: 'indigo' },
  { id: 'ART_EXPLORATIONS', label: 'Art Explorations', color: 'purple' },
  { id: 'ENGLISH', label: 'English', color: 'sky' },
  { id: 'MUSIC', label: 'Music', color: 'rose' },
  { id: 'OUTSIDE', label: 'Outside', color: 'lime' },
  { id: 'AUDIO_VISUAL', label: 'Audio Visual', color: 'violet' },
  { id: 'SPECIAL_PROGRAM', label: 'Special Program', color: 'amber' },
  { id: 'MORNING_MOVEMENT', label: 'Morning Movement', color: 'red' },
];

const domainsList: { id: KGDomain; label: string }[] = [
  { id: 'AGAMA_BUDI_PEKERTI', label: 'Nilai Agama & Budi Pekerti' },
  { id: 'SOSIAL_EMOSIONAL', label: 'Sosial-Emosional' },
  { id: 'BAHASA', label: 'Bahasa' },
  { id: 'KOGNITIF', label: 'Kognitif' },
  { id: 'FISIK_MOTORIK', label: 'Fisik-Motorik' },
  { id: 'SENI', label: 'Seni' },
];

// Matchers
const findSentraInLine = (line: string): KGActivity | '' => {
  const s = String(line || '').toLowerCase().trim();
  if (!s) return '';
  if (s.includes('make-believe') || s.includes('make believe') || s === 'mb') return 'MAKE_BELIEVE';
  if (s.includes('islamic') || s.includes('awareness') || s.includes('agama') || s.includes('ibadah')) return 'ISLAMIC_AWARENESS';
  if (s.includes('library') || s.includes('literacy') || s.includes('baca') || s.includes('perpustakaan')) return 'LIBRARY_LITERACY';
  if (s.includes('discovery') || s.includes('sains') || s.includes('penemuan') || s.includes('ipa')) return 'DISCOVERY';
  if (s.includes('blocks') || s.includes('building') || s.includes('balok')) return 'BLOCKS_BUILDING';
  if (s.includes('art') || s.includes('explorations') || s.includes('seni rupa') || s.includes('gambar')) return 'ART_EXPLORATIONS';
  if (s.includes('english') || s.includes('inggris')) return 'ENGLISH';
  if (s.includes('music') || s.includes('musik') || s.includes('lagu')) return 'MUSIC';
  if (s.includes('outside') || s.includes('luar') || s.includes('lapangan')) return 'OUTSIDE';
  if (s.includes('audio') || s.includes('visual') || s.includes('video') || s.includes('film')) return 'AUDIO_VISUAL';
  if (s.includes('special') || s.includes('program') || s.includes('praktik')) return 'SPECIAL_PROGRAM';
  if (s.includes('morning') || s.includes('movement') || s.includes('motorik pagi') || s.includes('senam')) return 'MORNING_MOVEMENT';
  return '';
};

const findDomainInLine = (line: string): KGDomain | '' => {
  const s = String(line || '').toLowerCase().trim();
  if (!s) return '';
  if (s.includes('agama') || s.includes('pekerti') || s.includes('moral') || s.includes('ibadah')) return 'AGAMA_BUDI_PEKERTI';
  if (s.includes('sosial') || s.includes('emosi') || s.includes('sosem') || s.includes('regulasi')) return 'SOSIAL_EMOSIONAL';
  if (s.includes('bahasa') || s.includes('komunikasi') || s.includes('bicara') || s.includes('tulis')) return 'BAHASA';
  if (s.includes('kognitif') || s.includes('logis') || s.includes('hitung') || s.includes('pikir')) return 'KOGNITIF';
  if (s.includes('fisik') || s.includes('motorik') || s.includes('kasar') || s.includes('halus') || s.includes('sehat')) return 'FISIK_MOTORIK';
  if (s.includes('seni') || s.includes('kreativitas') || s.includes('nyanyi') || s.includes('warna')) return 'SENI';
  return '';
};

const isStudentInClass = (studClassId: string, activeClassObj: { id: string; name: string }) => {
  const sClass = (studClassId || '').trim().toLowerCase();
  const actId = (activeClassObj.id || '').trim().toLowerCase();
  const actName = (activeClassObj.name || '').trim().toLowerCase();
  
  if (!sClass) return false;
  if (sClass === actId || sClass === actName) return true;
  
  const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
  const normS = norm(sClass);
  const normId = norm(actId);
  const normName = norm(actName);
  
  if (normS === normName || normS === normId) return true;
  
  // Check for specific sub-classes
  const hasKoala = (str: string) => str.includes('koala');
  const hasPanda = (str: string) => str.includes('panda');
  const hasCaterpillar = (str: string) => str.includes('caterpillar');
  const hasButterfly = (str: string) => str.includes('butterfly');
  const hasCenderawasih = (str: string) => str.includes('cenderawasih');
  const hasElang = (str: string) => str.includes('elang');
  const hasKakatua = (str: string) => str.includes('kakatua');
  const hasBadak = (str: string) => str.includes('badak');
  const hasKomodo = (str: string) => str.includes('komodo');
  const hasTapir = (str: string) => str.includes('tapir');
  
  if (hasKoala(normS) && hasKoala(normName)) return true;
  if (hasPanda(normS) && hasPanda(normName)) return true;
  if (hasCaterpillar(normS) && hasCaterpillar(normName)) return true;
  if (hasButterfly(normS) && hasButterfly(normName)) return true;
  if (hasCenderawasih(normS) && hasCenderawasih(normName)) return true;
  if (hasElang(normS) && hasElang(normName)) return true;
  if (hasKakatua(normS) && hasKakatua(normName)) return true;
  if (hasBadak(normS) && hasBadak(normName)) return true;
  if (hasKomodo(normS) && hasKomodo(normName)) return true;
  if (hasTapir(normS) && hasTapir(normName)) return true;

  // Prevent generic "tka" from loosely matching specific sub-classes
  const specificClassWords = [
    'koala', 'panda', 'caterpillar', 'butterfly',
    'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir'
  ];
  const hasSpecS = specificClassWords.some(w => normS.includes(w));
  const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
  
  if (hasSpecAct && !hasSpecS) {
    return false; // student is general, but active class is specific
  }
  
  if (normId.includes(normS) || normS.includes(normId)) return true;
  
  return false;
};

const mapStringToGrading = (str: string): KGGrading | null => {
  const s = String(str || '').trim().toUpperCase();
  if (!s) return null;
  
  // Normalize string for exact Indonesian words ignoring multiple whitespaces
  const normalized = s.replace(/\s+/g, ' ');

  if (
    normalized === 'BELUM BERKEMBANG' || 
    normalized === 'BELUM' || 
    normalized === 'BB'
  ) {
    return 'BB';
  }
  
  if (
    normalized === 'BERKEMBANG SANGAT BAIK' || 
    normalized === 'SANGAT BAIK' || 
    normalized === 'BSB'
  ) {
    return 'BSB';
  }
  
  if (
    normalized === 'BERKEMBANG SESUAI HARAPAN' || 
    normalized === 'SESUAI HARAPAN' || 
    normalized === 'BSH'
  ) {
    return 'BSH';
  }
  
  if (
    normalized === 'MULAI BERKEMBANG' || 
    normalized === 'MULAI' || 
    normalized === 'MB'
  ) {
    return 'MB';
  }
  
  if (
    normalized === 'TIDAK MASUK' || 
    normalized === 'TIDAK HADIR' || 
    normalized === 'ABSENT' || 
    normalized === 'ABSEN' || 
    normalized === 'SAKIT' || 
    normalized === 'IZIN' || 
    normalized === 'A' || 
    normalized === 'S' || 
    normalized === 'I'
  ) {
    return 'ABSENT';
  }
  
  if (
    normalized === 'TIDAK MENGIKUTI KEGIATAN' || 
    normalized === 'TIDAK MENGIKUTI' || 
    normalized === 'NOT PARTICIPATING' || 
    normalized === 'T'
  ) {
    return 'NOT_PARTICIPATING';
  }

  // Fallbacks with cleaned/contains matching for robust Excel spreadsheet pastes
  const cleaned = s.replace(/[^A-Z]/g, '');
  if (cleaned.includes('BELUMBERKEMBANG') || s.includes('BELUM')) return 'BB';
  if (cleaned.includes('BERKEMBANGSANGATBAIK') || s.includes('SANGAT') || s.includes('BAIK')) return 'BSB';
  if (cleaned.includes('BERKEMBANGSESUAIHARAPAN') || s.includes('SESUAI') || s.includes('HARAPAN')) return 'BSH';
  if (cleaned.includes('MULAIBERKEMBANG') || s.includes('MULAI')) return 'MB';
  
  if (
    s.includes('TIDAK MASUK') || 
    s.includes('TIDAK HADIR') || 
    s.includes('ABSENT') || 
    s.includes('ALPHA') || 
    s.includes('SAKIT') || 
    s.includes('IZIN')
  ) {
    return 'ABSENT';
  }

  if (
    s.includes('TIDAK MENGIKUTI KEGIATAN') || 
    s.includes('TIDAK MENGIKUTI') || 
    s.includes('NOT PARTICIPATING')
  ) {
    return 'NOT_PARTICIPATING';
  }

  if (s === 'H') return 'BSH'; // Hadir maps to BSH

  return null;
};

// Helper functions for paste parsing/sanitization (shared by handlePaste and SmartPaste modal)
const sanitizeCell = (input: string | null | undefined): string => {
  let cellText = (input ?? '').trim();
  if (cellText === 'null' || cellText === 'undefined') {
    return '';
  }
  if (cellText.startsWith('"') && cellText.endsWith('"') && cellText.length >= 2) {
    cellText = cellText.substring(1, cellText.length - 1);
  }
  cellText = cellText.replace(/""/g, '"');
  return cellText;
};

const parseTabularData = (text: string): string[][] => {
  const rows = text.split(/\r?\n/);
  return rows.map(row => row.split('\t').map(sanitizeCell));
};

interface MatchResult {
  student: any | null;
  isAmbiguous: boolean;
  candidates: any[];
}

// Helper to clean and sanitize student names for comparison
const normalizeSearchName = (str: string): string => {
  return String(str || '')
    .normalize('NFD')                     // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '')     // Remove diacritics
    .replace(/[\u200b-\u200d\uFEFF]/g, '') // Remove zero-width characters/invisible spaces
    .replace(/\u00a0/g, ' ')             // Convert non-breaking spaces
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')        // Convert punctuation/special characters to spaces
    .replace(/\s+/g, ' ')                // Collapse whitespace
    .trim();
};

const robustMatchStudent = (nameVal: string, list: any[]): MatchResult => {
  const val = normalizeSearchName(nameVal);
  if (!val) {
    return { student: null, isAmbiguous: false, candidates: [] };
  }

  // Avoid matching row headers (like "Sentra", "Domain", etc.) as system students
  if (val.includes('sentra') || val.includes('domain') || val.includes('perkembangan') || val.includes('activity')) {
    return { student: null, isAmbiguous: false, candidates: [] };
  }

  // 1. Exact normalized name match (Highest priority)
  const exactNameMatches = list.filter(s => normalizeSearchName(s.name) === val);
  if (exactNameMatches.length === 1) {
    return { student: exactNameMatches[0], isAmbiguous: false, candidates: exactNameMatches };
  } else if (exactNameMatches.length > 1) {
    return { student: null, isAmbiguous: true, candidates: exactNameMatches };
  }

  // 2. Exact nickname match (Priority 2)
  const exactNickMatches = list.filter(s => s.nickName && normalizeSearchName(s.nickName) === val);
  if (exactNickMatches.length === 1) {
    return { student: exactNickMatches[0], isAmbiguous: false, candidates: exactNickMatches };
  } else if (exactNickMatches.length > 1) {
    return { student: null, isAmbiguous: true, candidates: exactNickMatches };
  }

  // 3. Contains-based normalized match (Fallback priority 3)
  const containsMatches: any[] = [];
  list.forEach(s => {
    const sName = normalizeSearchName(s.name);
    const sNick = s.nickName ? normalizeSearchName(s.nickName) : '';
    if (sName.includes(val) || val.includes(sName) || (sNick && (sNick.includes(val) || val.includes(sNick)))) {
      containsMatches.push(s);
    }
  });

  if (containsMatches.length === 1) {
    return { student: containsMatches[0], isAmbiguous: false, candidates: containsMatches };
  } else if (containsMatches.length > 1) {
    return { student: null, isAmbiguous: true, candidates: containsMatches };
  }

  // 4. Token-based similarity search (Fallback priority 4)
  const scoredCandidates: { student: any; score: number }[] = [];
  
  list.forEach(s => {
    const sName = normalizeSearchName(s.name);
    
    // Split input and student name into word tokens
    const tokensVal = val.split(' ').filter(t => t.length >= 2);
    const tokensSBytes = sName.split(' ').filter(t => t.length >= 2);
    
    if (tokensVal.length > 0 && tokensSBytes.length > 0) {
      let matchesCount = 0;
      tokensVal.forEach(tV => {
        // Full word or significant start matching
        if (tokensSBytes.some(tS => tS.includes(tV) || tV.includes(tS))) {
          matchesCount++;
        }
      });
      
      const union = new Set([...tokensVal, ...tokensSBytes]).size;
      const jaccardScore = union > 0 ? (matchesCount / union) : 0;
      
      // Calculate ratio against the minimum token count as well to handle name truncations exceptionally well
      const overlapScore = matchesCount / Math.min(tokensVal.length, tokensSBytes.length);
      
      // Combined weighted score favoring solid matches but flexible on extra/minor missing words
      const combinedScore = (jaccardScore * 0.4) + (overlapScore * 0.6);
      
      if (combinedScore >= 0.5) {
        scoredCandidates.push({ student: s, score: combinedScore });
      }
    }
  });

  if (scoredCandidates.length > 0) {
    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score);
    const highestScore = scoredCandidates[0].score;
    // Collect candidates within 0.05 of the top score to check for close tie/ambiguity
    const topMatches = scoredCandidates.filter(c => Math.abs(c.score - highestScore) <= 0.05);

    if (topMatches.length === 1) {
      return { student: topMatches[0].student, isAmbiguous: false, candidates: [topMatches[0].student] };
    } else {
      return { student: null, isAmbiguous: true, candidates: topMatches.map(c => c.student) };
    }
  }

  return { student: null, isAmbiguous: false, candidates: [] };
};

// Transform template format to internal grid data structure
const transformTemplateToGrid = (matrix: string[][]): string[][] => {
  if (matrix.length < 4) return matrix;

  const isTemplate = matrix.length >= 4 && (
    (matrix[0]?.[1] && (matrix[0][1].toLowerCase().includes('day') || matrix[0][1].toLowerCase().includes('hari'))) ||
    (matrix[1]?.[0] && (matrix[1][0].toLowerCase().includes('sentra') || matrix[1][0].toLowerCase().includes('activity'))) ||
    (matrix[2]?.[0] && (matrix[2][0].toLowerCase().includes('domain') || matrix[2][0].toLowerCase().includes('perkembangan')))
  );

  if (!isTemplate) return matrix;

  const reqHeight = Math.max(32, matrix.length - 1);
  const newGrid: string[][] = Array.from({ length: reqHeight }, () => new Array(21).fill(''));
  newGrid[0][0] = 'Sentra / Activity';
  newGrid[1][0] = 'Domain Perkembangan';

  // Map Sentra and Domain rows (Rows 2 and 3 of template -> Rows 0 and 1 of internal grid)
  for (let c = 1; c < 21; c++) {
    newGrid[0][c] = matrix[1]?.[c] || '';
    newGrid[1][c] = matrix[2]?.[c] || '';
  }

  // Map Student rows from index 3 onward of template -> Row index 2 onward of internal grid
  for (let r = 3; r < matrix.length; r++) {
    const gridR = r - 1; // Row index in gridData (3 -> 2 in gridData)
    newGrid[gridR][0] = matrix[r][0] || '';
    for (let c = 1; c < 21; c++) {
      newGrid[gridR][c] = matrix[r][c] || '';
    }
  }
  return newGrid;
};

export default function ObservationTableImporter({ classes = [], students = [], initialClassId = 'ALL', onImportSuccess, onClose }: ObservationTableImporterProps) {
  const systemStudents = React.useMemo(() => {
    if (students && students.length > 0) return students;
    return getStoredStudents();
  }, [students]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>(initialClassId);
  
  // File Upload states and references
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [parsedMatrix, setParsedMatrix] = React.useState<string[][] | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);

  // Configuration Dates
  const [startDateStr, setStartDateStr] = React.useState<string>(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return format(start, 'yyyy-MM-dd');
  });
  
  const [endDateStr, setEndDateStr] = React.useState<string>(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return format(end, 'yyyy-MM-dd');
  });

  const [activeCell, setActiveCell] = React.useState<{ r: number; c: number } | null>(null);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isReviewing, setIsReviewing] = React.useState<boolean>(false);

  // Derive Weekdays Monday-Friday
  const workdays = React.useMemo(() => {
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
      return dates.slice(0, 20); // Maximum 20 days per collection cycle
    } catch (e) {
      console.error(e);
      return [];
    }
  }, [startDateStr, endDateStr]);

  // 2D grid matrix state: r rows, 21 columns
  // gridData[0] is Sentra row
  // gridData[1] is Domain row
  // gridData[r >= 2] are Student Rows
  const [gridData, setGridData] = React.useState<string[][]>(() => {
    const data: string[][] = [];
    // Start with a completely blank canvas of 32 rows
    const numRows = 32;
    for (let r = 0; r < numRows; r++) {
      const row = new Array(21).fill('');
      if (r === 0) row[0] = 'Sentra / Activity';
      if (r === 1) row[0] = 'Domain Perkembangan';
      data.push(row);
    }
    return data;
  });

  // Handle class level selection (reference only, but offers load option)
  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    toast.info(`Kelas aktif diubah ke: ${classes.find(c => c.id === newClassId)?.name || 'Semua Kelas'}. Klik "Muat Otomatis Murid dari Sistem" jika ingin mengisi nama.`);
  };

  // Pre-load current class names into the grid from the system (Optional helper)
  const loadSystemStudents = () => {
    const activeClassObj = classes.find(c => c.id === selectedClassId);
    let filtered = systemStudents;
    if (selectedClassId !== 'ALL' && activeClassObj) {
      filtered = systemStudents.filter(student => isStudentInClass(student.classId || '', activeClassObj));
    }

    setGridData(prev => {
      const copy = prev.map(row => [...row]);
      // Ensure we have enough rows
      const neededHeight = Math.max(copy.length, filtered.length + 2);
      while (copy.length < neededHeight) {
        copy.push(new Array(21).fill(''));
      }

      // Write names starting from row index 2
      for (let r = 2; r < copy.length; r++) {
        const studentIdx = r - 2;
        if (studentIdx < filtered.length) {
          copy[r][0] = filtered[studentIdx].name;
        } else if (r >= filtered.length + 2) {
          // preserve whatever they already had in columns 1..20, just blank out empty name slots
          copy[r][0] = '';
        }
      }
      return copy;
    });

    toast.success(`Berhasil memuat ${filtered.length} nama siswa dari sistem ke grid.`);
  };

  // Keyboard navigation arrows handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    let nextR = r;
    let nextC = c;

    switch (e.key) {
      case 'ArrowUp':
        nextR = Math.max(0, r - 1);
        e.preventDefault();
        break;
      case 'ArrowDown':
        nextR = Math.min(gridData.length - 1, r + 1);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (e.currentTarget.selectionStart === 0 || e.currentTarget.value === '') {
          nextC = Math.max(0, c - 1);
          e.preventDefault();
        }
        break;
      case 'ArrowRight':
        if (e.currentTarget.selectionEnd === e.currentTarget.value.length || e.currentTarget.value === '') {
          nextC = Math.min(20, c + 1);
          e.preventDefault();
        }
        break;
      case 'Enter':
        nextR = Math.min(gridData.length - 1, r + 1);
        e.preventDefault();
        break;
      default:
        return;
    }

    if (nextR !== r || nextC !== c) {
      setActiveCell({ r: nextR, c: nextC });
      const targetId = `cell-${nextR}-${nextC}`;
      setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          (element as HTMLInputElement).focus();
          (element as HTMLInputElement).select();
        }
      }, 10);
    }
  };

  // Check if a row is a pasted header row (contains metadata keywords)
  const isHeaderRow = (row: string[]): boolean => {
    const firstCell = String(row[0] || '').toLowerCase().trim();
    if (!firstCell) return false;
    return (
      firstCell.includes('nama') || 
      firstCell.includes('siswa') || 
      firstCell.includes('student') || 
      firstCell.includes('day') ||
      firstCell.includes('sentra') ||
      firstCell.includes('activity') ||
      firstCell.includes('domain') ||
      firstCell.includes('perkembangan') ||
      findSentraInLine(row[0]) !== '' ||
      findDomainInLine(row[0]) !== ''
    );
  };

  // Paste handler supporting full grid distribution
  const handlePaste = (e: React.ClipboardEvent, startRow: number, startCol: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;

    const matrix = parseTabularData(text);
    
    // Check if it matches template
    const isTemplate = matrix.length >= 4 && (
      (matrix[0]?.[1] && (matrix[0][1].toLowerCase().includes('day') || matrix[0][1].toLowerCase().includes('hari'))) ||
      (matrix[1]?.[0] && (matrix[1][0].toLowerCase().includes('sentra') || matrix[1][0].toLowerCase().includes('activity'))) ||
      (matrix[2]?.[0] && (matrix[2][0].toLowerCase().includes('domain') || matrix[2][0].toLowerCase().includes('perkembangan')))
    );

    if (isTemplate) {
      setGridData(transformTemplateToGrid(matrix));
      toast.success(`Berhasil mengimpor data via template.`);
      return;
    }

    setGridData(prevGrid => {
      const nextGrid = prevGrid.map(row => [...row]);
      const reqHeight = startRow + matrix.length;

      while (nextGrid.length < reqHeight) {
        nextGrid.push(new Array(21).fill(''));
      }

      for (let r = 0; r < matrix.length; r++) {
        const targetR = startRow + r;
        const lineCells = matrix[r];
        for (let c = 0; c < lineCells.length; c++) {
          const targetC = startCol + c;
          if (targetC < 21) {
            nextGrid[targetR][targetC] = lineCells[c];
          }
        }
      }
      return nextGrid;
    });

    toast.success(`Berhasil menempel tabel data (${matrix.length} baris, ${matrix[0]?.length || 0} kolom)`);
  };

  const parseFileToMatrix = (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawJson = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
          
          // Convert all elements to string and sanitize
          const matrix: string[][] = rawJson.map((row: any[]) => {
            return row.map(cell => {
              if (cell === null || cell === undefined) return '';
              return sanitizeCell(String(cell));
            });
          });
          resolve(matrix);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsUploadModalOpen(true);

    try {
      const matrix = await parseFileToMatrix(file);
      setParsedMatrix(matrix);
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal membaca file: ${err.message || String(err)}`);
      setUploadedFile(null);
      setParsedMatrix(null);
      setIsUploadModalOpen(false);
    }
    
    // Reset file input value so same file can be uploaded again if needed
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleImportApply = () => {
    if (!parsedMatrix) return;

    // Apply the parsed matrix onto the main 2D grid's columns and rows.
    const transformed = transformTemplateToGrid(parsedMatrix);

    setGridData(transformed);
    setIsUploadModalOpen(false);
    setUploadedFile(null);
    setParsedMatrix(null);
    toast.success(`Berhasil mengimpor data template ke editor tabel.`);
  };

  const resolveStudentInfoForClass = React.useCallback((nameVal: string, roster: any[]) => {
    const matchRes = robustMatchStudent(nameVal, roster);
    if (matchRes.isAmbiguous) return { matches: false, student: null, name: 'Ambigus', isAmbiguous: true };
    if (matchRes.student) return { matches: true, student: matchRes.student, name: matchRes.student.name };
    return { matches: false, student: null, name: '' };
  }, []);

  const currentClassObj = React.useMemo(() => {
    return classes.find(c => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  const targetRoster = React.useMemo(() => {
    if (selectedClassId === 'ALL') return systemStudents;
    if (!currentClassObj) return [];
    return systemStudents.filter(s => isStudentInClass(s.classId || '', currentClassObj));
  }, [selectedClassId, currentClassObj, systemStudents]);

  // Student name matching resolution helper
  const resolveStudentInfo = React.useCallback((nameVal: string) => {
    const val = String(nameVal || '').trim().toLowerCase();
    if (!val) return { matches: false, student: null, label: 'Kosong' };

    // Avoid matching row headers (like "Sentra", "Domain", etc.) as system students
    if (val.includes('sentra') || val.includes('domain') || val.includes('perkembangan') || val.includes('activity')) {
      return { matches: false, student: null, label: 'Header' };
    }

    const matchRes = robustMatchStudent(nameVal, targetRoster);

    if (matchRes.isAmbiguous) {
      return { 
        matches: false, 
        student: null, 
        label: `Ambigus (${matchRes.candidates.map(c => c.name).join(', ')})`,
        isAmbiguous: true 
      };
    }

    if (matchRes.student) {
      return { matches: true, student: matchRes.student, label: matchRes.student.name };
    }
    return { matches: false, student: null, label: 'Luar Sistem (Dilewati)' };
  }, [targetRoster]);

  const previewStats = React.useMemo(() => {
    if (!parsedMatrix || parsedMatrix.length < 4) {
      return {
        isValidTemplate: false,
        classNameFromFile: '',
        studentRowsCount: 0,
        dayColsCount: 0,
        unmatchedStudents: [] as string[],
        ambiguousStudents: [] as string[],
        matchedStudentsCount: 0,
        invalidGradesCount: 0,
        firstThreeRows: [] as string[][],
      };
    }

    const firstRow = parsedMatrix[0];
    const classNameFromFile = firstRow?.[0] || 'Tidak Diketahui';

    // Let's count how many DAY columns we have (Cols B-U)
    let dayColsCount = 0;
    for (let c = 1; c < 21; c++) {
      if (firstRow?.[c]) dayColsCount++;
    }

    const studentRows = parsedMatrix.slice(3);
    const studentRowsCount = studentRows.length;

    const unmatchedStudents: string[] = [];
    const ambiguousStudents: string[] = [];
    let matchedStudentsCount = 0;
    let invalidGradesCount = 0;

    studentRows.forEach(row => {
      const nameVal = row[0]?.trim();
      if (!nameVal) return;

      const resolveRes = resolveStudentInfoForClass(nameVal, targetRoster);
      if (resolveRes.matches) {
        matchedStudentsCount++;
      } else if (resolveRes.isAmbiguous) {
        ambiguousStudents.push(nameVal);
      } else {
        unmatchedStudents.push(nameVal);
      }

      // Check remaining columns for invalid grades
      for (let c = 1; c < 21; c++) {
        const cellVal = row[c];
        if (cellVal && cellVal.trim()) {
          const matchedGrading = mapStringToGrading(cellVal);
          if (!matchedGrading) {
            invalidGradesCount++;
          }
        }
      }
    });

    return {
      isValidTemplate: true,
      classNameFromFile,
      studentRowsCount,
      dayColsCount,
      unmatchedStudents,
      ambiguousStudents,
      matchedStudentsCount,
      invalidGradesCount,
      firstThreeRows: studentRows.slice(0, 3),
    };
  }, [parsedMatrix, targetRoster, resolveStudentInfoForClass]);

  // Edit cell value
  const updateCellValue = (r: number, c: number, value: string) => {
    setGridData(prev => {
      const copy = prev.map(row => [...row]);
      copy[r][c] = value;
      return copy;
    });
  };

  // Add empty row
  const addRow = () => {
    setGridData(prev => [...prev, new Array(21).fill('')]);
  };

  // Reset grid
  const resetGrid = () => {
    if (!window.confirm("Apakah Anda yakin ingin mengosongkan grid spreadsheet ini? Seluruh konfigurasi dan nilai ketikan akan hilang.")) return;
    
    const data: string[][] = [];
    const numRows = 32;
    for (let r = 0; r < numRows; r++) {
      const row = new Array(21).fill('');
      if (r === 0) row[0] = 'Sentra / Activity';
      if (r === 1) row[0] = 'Domain Perkembangan';
      data.push(row);
    }
    setGridData(data);
    toast.info("Grid spreadsheet dikembalikan ke kanvas kosong.");
  };

  // Structure for previewing items map
  interface PreviewItem {
    studentName: string;
    systemStudent: any | null;
    matched: boolean;
    entries: {
      dayNum: number;
      date: Date;
      activity: KGActivity;
      domain: KGDomain;
      rawText: string;
      grading: KGGrading;
    }[];
  }

  const previewItems = React.useMemo<PreviewItem[]>(() => {
    if (workdays.length === 0) return [];

    const items: PreviewItem[] = [];

    // Rows 0 is Sentra, Rows 1 is Domain
    // Real student items start at row index 2
    for (let r = 2; r < gridData.length; r++) {
      const row = gridData[r];
      if (!row[0] || !row[0].trim()) continue;
      if (isHeaderRow(row)) continue;

      const nameVal = row[0].trim();
      const res = resolveStudentInfo(nameVal);

      const entries: {
        dayNum: number;
        date: Date;
        activity: KGActivity;
        domain: KGDomain;
        rawText: string;
        grading: KGGrading;
      }[] = [];

      for (let idx = 0; idx < workdays.length; idx++) {
        const colIndex = idx + 1;
        const cellVal = row[colIndex];
        if (!cellVal || !cellVal.trim()) continue;

        const matchedGrading = mapStringToGrading(cellVal);
        if (!matchedGrading) continue;

        // Obtain parsed configurations from Row 0 and Row 1
        const rawSentraVal = gridData[0][colIndex] || '';
        const rawDomainVal = gridData[1][colIndex] || '';

        const activity = findSentraInLine(rawSentraVal);
        const domain = findDomainInLine(rawDomainVal);

        if (!activity || !domain) continue;

        entries.push({
          dayNum: idx + 1,
          date: workdays[idx],
          activity,
          domain,
          rawText: cellVal,
          grading: matchedGrading
        });
      }

      // Show students if they matches, or if we have mapped observations
      if (entries.length > 0 || res.matches) {
        items.push({
          studentName: nameVal,
          systemStudent: res.student,
          matched: res.matches,
          entries
        });
      }
    }

    return items;
  }, [gridData, workdays]);

  const totalMatchedCount = previewItems.filter(item => item.matched && item.entries.length > 0).length;
  const totalWarningsCount = previewItems.filter(item => !item.matched && item.studentName.trim() !== '').length;
  const totalEntriesCount = previewItems.reduce((acc, item) => acc + (item.matched ? item.entries.length : 0), 0);

  const invalidEntriesCount = React.useMemo(() => {
    let count = 0;
    for (let r = 2; r < gridData.length; r++) {
      const row = gridData[r];
      if (!row[0] || !row[0].trim()) continue;
      if (isHeaderRow(row)) continue;

      for (let idx = 0; idx < workdays.length; idx++) {
        const colIndex = idx + 1;
        const cellVal = row[colIndex];
        if (!cellVal || !cellVal.trim()) continue;

        const grading = mapStringToGrading(cellVal);
        if (!grading) {
          count++;
        }
      }
    }
    return count;
  }, [gridData, workdays]);

  const getSentraLabel = (id: string) => {
    return activitiesList.find(a => a.id === id)?.label || id;
  };

  const getDomainLabel = (id: string) => {
    return domainsList.find(d => d.id === id)?.label || id;
  };

  const getGradingLabel = (grading: KGGrading): string => {
    switch (grading) {
      case 'BB': return 'Belum Berkembang (BB)';
      case 'MB': return 'Mulai Berkembang (MB)';
      case 'BSH': return 'Berkembang Sesuai Harapan (BSH)';
      case 'BSB': return 'Berkembang Sangat Baik (BSB)';
      case 'ABSENT': return 'Tidak Masuk';
      case 'NOT_PARTICIPATING': return 'Tidak Mengikuti Kegiatan';
      default: return String(grading);
    }
  };

  const getGradingBadgeStyles = (grading: KGGrading) => {
    switch (grading) {
      case 'BB': return { colorClass: 'bg-rose-50 border-rose-250 text-rose-700 font-black' };
      case 'MB': return { colorClass: 'bg-yellow-50 border-yellow-250 text-yellow-850 font-black' };
      case 'BSH': return { colorClass: 'bg-emerald-50 border-emerald-250 text-emerald-850 font-black' };
      case 'BSB': return { colorClass: 'bg-teal-50 border-teal-250 text-teal-850 font-black' };
      case 'ABSENT': return { colorClass: 'bg-orange-50 border-orange-200 text-orange-850 font-bold' };
      case 'NOT_PARTICIPATING': return { colorClass: 'bg-gray-100 border-gray-200 text-gray-600 font-bold' };
      default: return { colorClass: 'bg-white border-gray-205 text-gray-800' };
    }
  };

  const handleProceedToPreview = () => {
    if (workdays.length === 0) {
      toast.error("Silakan tentukan " + "Mulai & Selesai" + " Rentang Tanggal evaluasi yang valid terlebih dahulu.");
      return;
    }

    // Check if at least one workday column is fully mapped with a Sentra and Domain
    let hasConfig = false;
    for (let idx = 0; idx < workdays.length; idx++) {
      const colIndex = idx + 1;
      const rawSentra = gridData[0][colIndex] || '';
      const rawDomain = gridData[1][colIndex] || '';
      if (findSentraInLine(rawSentra) && findDomainInLine(rawDomain)) {
        hasConfig = true;
        break;
      }
    }

    if (!hasConfig) {
      toast.error("Silakan tentukan nama Sentra & Domain minimal pada satu kolom Hari Kerja (Day 1-20) di baris 1 & 2.");
      return;
    }

    const activeEntriesCount = previewItems.reduce((acc, item) => acc + (item.matched ? item.entries.length : 0), 0);
    if (activeEntriesCount === 0) {
      toast.error("Belum ada data nilai harian valid (BB, MB, BSH, BSB) yang cocok diisi dalam baris siswa terpeta.");
      return;
    }

    setIsReviewing(true);
    toast.success("Pratinjau data siap diperiksa! Harap verifikasi nama anak.");
  };

  // Save observations to Firestore DB (Review Stage Confirmation)
  const handleSaveToFirestore = async () => {
    if (workdays.length === 0) {
      toast.error("Silakan tentukan StartDate & EndDate yang valid untuk memetakan tanggal kerja (Senin-Jumat).");
      return;
    }

    try {
      setIsSaving(true);
      toast.info("Memulai penyimpanan data ke Firestore...");

      // Transpile records using our calculated previewItems
      // Group structures in existing system:
      // key: `${activity}_${domain}_${date}`
      // collections: observations -> { id, activity, domain, date, generalPhotoUrl, observations: { studentId -> { grading, notes, photo } } }
      const batchCommits: Record<string, {
        id: string;
        activity: KGActivity;
        domain: KGDomain;
        date: string;
        observations: Record<string, { grading: KGGrading; notes: string; photo: string | null }>;
      }> = {};

      let validObservationsCount = 0;
      let matchedCount = 0;

      for (const item of previewItems) {
        if (!item.matched || !item.systemStudent) continue;
        if (item.entries.length === 0) continue;

        matchedCount++;
        const student = item.systemStudent;

        for (const entry of item.entries) {
          const dateStr = format(entry.date, 'yyyy-MM-dd');
          const key = `${entry.activity}_${entry.domain}_${dateStr}`;

          if (!batchCommits[key]) {
            batchCommits[key] = {
              id: key,
              activity: entry.activity,
              domain: entry.domain,
              date: dateStr,
              observations: {}
            };
          }

          batchCommits[key].observations[student.id] = {
            grading: entry.grading,
            notes: `Observation imported via smart period bulk paste. [${format(entry.date, 'dd MMM yyyy')}]`,
            photo: null // bypassed photo validation per specs
          };
          validObservationsCount++;
        }
      }

      const keysArray = Object.keys(batchCommits);
      if (keysArray.length === 0) {
        toast.error("Tidak ada data penilaian valid yang cocok untuk disimpan.");
        setIsSaving(false);
        return;
      }

      // Write each group doc in firestore using merged setDoc (non-destructive!)
      for (const key of keysArray) {
        const item = batchCommits[key];
        const docRef = doc(db, 'observations', key);

        await setDoc(docRef, {
          id: key,
          activity: item.activity,
          domain: item.domain,
          date: item.date,
          generalPhotoUrl: null,
          observations: item.observations,
          timestamp: new Date(item.date).getTime(),
          importedAt: Date.now()
        }, { merge: true });
      }

      toast.success(`Berhasil menyimpan ${validObservationsCount} data penilaian harian siswa dari ${matchedCount} murid ke database.`);
      
      if (onImportSuccess) {
        onImportSuccess();
      }
      if (onClose) {
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menyimpan data observasi: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getCellBgColorClass = (val: string, r: number, c: number) => {
    if (c === 0) {
      if (r === 0) return 'bg-slate-900 border-slate-800 text-slate-100 font-extrabold text-[10.5px] uppercase';
      if (r === 1) return 'bg-slate-800 border-slate-750 text-slate-100 font-extrabold text-[10.5px] uppercase';
      
      const res = resolveStudentInfo(val);
      if (val === '') return 'bg-gray-50 text-gray-400';
      return res.matches ? 'bg-emerald-50/10 text-gray-800 border-emerald-100 font-medium' : 'bg-orange-50/15 text-orange-800 border-orange-100 font-medium';
    }

    if (r === 0) {
      const hasSentra = findSentraInLine(val);
      return hasSentra ? 'bg-emerald-50/25 border-emerald-250 text-emerald-900' : 'bg-gray-50 text-gray-400';
    }

    if (r === 1) {
      const hasDomain = findDomainInLine(val);
      return hasDomain ? 'bg-sky-50/25 border-sky-250 text-sky-905' : 'bg-gray-50 text-gray-400';
    }

    const grade = mapStringToGrading(val);
    if (!grade) {
      if (val === '') return 'bg-white text-gray-800';
      return 'bg-blue-50/30 text-blue-800 font-medium'; // unmapped text
    }

    switch (grade) {
      case 'BB': return 'bg-rose-50 border-rose-200/60 text-rose-700 font-bold';
      case 'MB': return 'bg-yellow-50 border-yellow-250/70 text-yellow-800 font-bold';
      case 'BSH': return 'bg-emerald-50 border-emerald-250/70 text-emerald-800 font-bold';
      case 'BSB': return 'bg-teal-50 border-teal-250/70 text-teal-850 font-bold';
      case 'ABSENT': return 'bg-orange-50 border-orange-200 text-orange-700 font-medium text-xs';
      case 'NOT_PARTICIPATING': return 'bg-gray-100 border-gray-200 text-gray-650 font-medium text-xs';
      default: return 'bg-white';
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <FileSpreadsheet className="text-emerald-400" size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Import Grid Spreadsheet</h3>
              <p className="text-[11px] text-slate-400">Tempel / paste nilai evaluasi multi-hari dan multi-sentra secara sekaligus.</p>
            </div>
          </div>
        </div>

        {/* StartDate & EndDate configuration */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer"
          >
            <Upload size={13} className="stroke-[3]" />
            Upload XLSX/CSV Template
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          {classes && classes.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-705/80 rounded-2xl px-3 py-1.5 focus-within:ring-1 focus-within:ring-emerald-500">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">KELAS:</span>
              <select
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                disabled={isReviewing}
                className="bg-transparent text-xs font-bold text-white outline-none border-0 p-0 focus:ring-0 cursor-pointer pr-4 disabled:opacity-50"
                style={{ colorScheme: 'dark' }}
              >
                <option value="ALL" className="bg-slate-900 text-white font-semibold">Semua Kelas</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id} className="bg-slate-900 text-white font-semibold">
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-705/80 rounded-2xl px-3 py-1.5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MULAI:</span>
            <input 
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              disabled={isReviewing}
              className="bg-transparent text-xs font-bold text-white outline-none border-0 p-0 focus:ring-0 cursor-pointer disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-705/80 rounded-2xl px-3 py-1.5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SELESAI:</span>
            <input 
              type="date"
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              disabled={isReviewing}
              className="bg-transparent text-xs font-bold text-white outline-none border-0 p-0 focus:ring-0 cursor-pointer disabled:opacity-50"
            />
          </div>

          {/* Badge workdays mapping */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-2xl flex items-center gap-1.5 shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider">
              {workdays.length} HARI KERJA
            </span>
          </div>
        </div>
      </div>

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/85 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-8 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto border border-gray-100">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Pratinjau Unggah Template</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">SINKRONISASI FILE EVALUASI</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadedFile(null);
                  setParsedMatrix(null);
                }} 
                className="text-gray-400 hover:text-gray-900 transition p-1.5 hover:bg-gray-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target vs File Dashboard Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Target Class & Hours Details */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-gray-200/60 shadow-sm">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">TARGET PERIODE (DARI UI)</span>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span className="font-semibold text-gray-500">Kelas Target:</span>
                    <span className="text-slate-900 uppercase font-black">
                      {classes.find(c => c.id === selectedClassId)?.name || 'Semua Kelas'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span className="font-semibold text-gray-500">Bulan & Tahun:</span>
                    <span className="text-slate-900">
                      {startDateStr ? format(parseISO(startDateStr), 'MMMM yyyy') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span className="font-semibold text-gray-500">Hari Kerja Aplikasi:</span>
                    <span className="text-emerald-700 font-extrabold">{workdays.length} Hari Aktif</span>
                  </div>
                </div>
              </div>

              {/* Uploaded File Metadata */}
              <div className="bg-emerald-50/15 rounded-2xl p-4 border border-emerald-100 shadow-sm">
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block mb-2">DETAIL FILE EXCEL / CSV</span>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span className="font-semibold text-gray-500">Nama File:</span>
                    <span className="text-emerald-950 font-extrabold truncate max-w-[180px]" title={uploadedFile?.name}>
                      {uploadedFile?.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span className="font-semibold text-gray-500">Kelas di File:</span>
                    <span className="text-emerald-900 uppercase font-bold">
                      {previewStats.classNameFromFile || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span className="font-semibold text-gray-500">Kolom Terdeteksi:</span>
                    <span className="text-emerald-900 font-bold">{previewStats.dayColsCount} Kolom Hari (DAY)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Validation Alerts / Analysis */}
            {parsedMatrix && (
              <div className="space-y-3.5">
                <div className="bg-gray-50 rounded-2xl border border-gray-150 p-4.5">
                  <h4 className="text-[11px] font-black text-gray-800 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
                    Ringkasan Hasil Analisis Data
                  </h4>
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col justify-between shadow-sm">
                      <span className="text-[10px] font-bold text-gray-500">Siswa Roster Cocok</span>
                      <span className="text-lg font-black text-emerald-600 mt-0.5">
                        {previewStats.matchedStudentsCount} / {previewStats.studentRowsCount}
                      </span>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col justify-between shadow-sm">
                      <span className="text-[10px] font-bold text-gray-500">Nilai Tidak Valid</span>
                      <span className="text-lg font-black text-red-600 mt-0.5">
                        {previewStats.invalidGradesCount} Sel
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-warnings: Unmatched students */}
                {previewStats.unmatchedStudents.length > 0 && (
                  <div className="bg-rose-50 rounded-2xl border border-rose-150 p-4 flex gap-3 text-rose-900 items-start">
                    <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-rose-800 font-semibold w-full">
                      <span className="font-black text-rose-950 uppercase block mb-1">
                        Siswa Tidak Cocok Dengan Roster Kelas ({previewStats.unmatchedStudents.length})
                      </span>
                      <p className="font-medium text-[10.5px] leading-relaxed text-rose-700">
                        Nama-nama di bawah ini ada di file tetapi tidak terdaftar di daftar murid kelas pilihan Anda di sistem Lumina. Siswa ini akan diabaikan secara otomatis:
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto pr-1">
                        {previewStats.unmatchedStudents.map((name, i) => (
                          <span key={i} className="bg-rose-100/80 border border-rose-200 text-rose-900 px-2 py-0.5 rounded-lg text-[9.5px] font-extrabold">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-warnings: Ambiguous students */}
                {previewStats.ambiguousStudents && previewStats.ambiguousStudents.length > 0 && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-150 p-4 flex gap-3 text-amber-900 items-start">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-800 font-semibold w-full">
                      <span className="font-black text-amber-950 uppercase block mb-1">
                        Siswa Ambigus / Banyak Kemungkinan Kecocokan ({previewStats.ambiguousStudents.length})
                      </span>
                      <p className="font-medium text-[10.5px] leading-relaxed text-amber-700">
                        Nama-nama di bawah ini menghasilkan beberapa kemungkinan kecocokan di kelas target Anda. Harap edit nama di baris file agar lebih spesifik:
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto pr-1">
                        {previewStats.ambiguousStudents.map((name, i) => (
                          <span key={i} className="bg-amber-100/80 border border-amber-200 text-amber-900 px-2 py-0.5 rounded-lg text-[9.5px] font-extrabold">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning and information description */}
                <div className="bg-sky-50 rounded-2xl border border-sky-150 p-4 flex gap-3 text-sky-900 items-start">
                  <Info size={16} className="text-sky-600 shrink-0 mt-0.5" />
                  <div className="text-[10.5px] text-sky-800 font-semibold leading-relaxed">
                    <span className="font-black text-sky-950 uppercase block mb-0.5">Informasi Pemetaan Kolom:</span>
                    Sistem akan memetakan data `DAY 1` sampai `DAY 20` dari file ke {workdays.length} rentang hari kerja aktif di aplikasi secara berurutan. Format evaluasi standar (BB, MB, BSH, BSB, Absen) akan otomatis disaring.
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button 
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadedFile(null);
                  setParsedMatrix(null);
                }}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-wider transition active:scale-95 cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleImportApply}
                disabled={!parsedMatrix}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-600/10 transition active:scale-95 cursor-pointer"
              >
                <Check size={14} className="stroke-[3]" />
                Terapkan ke Grid Tabel
              </button>
            </div>
          </div>
        </div>
      )}
      {isReviewing ? (
        <div className="space-y-6 animate-fade-in">
          {/* Preview Warning & Success Info */}
          <div className={cn("grid grid-cols-1 gap-4", invalidEntriesCount > 0 ? "md:grid-cols-4" : "md:grid-cols-3")}>
            <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="text-emerald-600 mt-0.5 shrink-0" size={16} />
              <div>
                <h5 className="text-xs font-black text-emerald-900 uppercase">Siswa Teridentifikasi</h5>
                <p className="text-[11px] text-emerald-700 font-medium mt-1">
                  <strong>{totalMatchedCount}</strong> siswa berhasil dicocokkan dengan sistem Lumina secara cerdas.
                </p>
              </div>
            </div>

            <div className="bg-teal-50 border border-teal-250 p-4 rounded-2xl flex items-start gap-3">
              <Eye className="text-teal-600 mt-0.5 shrink-0" size={16} />
              <div>
                <h5 className="text-xs font-black text-teal-900 uppercase">Total Entri Diimpor</h5>
                <p className="text-[11px] text-teal-700 font-medium mt-1">
                  Ada <strong>{totalEntriesCount}</strong> baris evaluasi yang siap dikomit ke database Firestore Anda.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-250 p-4 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="text-amber-600 mt-0.5 shrink-0" size={16} />
              <div>
                <h5 className="text-xs font-black text-amber-900 uppercase">Siswa Luar Sistem</h5>
                <p className="text-[11px] text-amber-700 font-medium mt-1">
                  Siswa tidak dikenal/kosong berjumlah <strong>{totalWarningsCount}</strong> baris dilewati demi keamanan.
                </p>
              </div>
            </div>

            {invalidEntriesCount > 0 && (
              <div className="bg-rose-50 border border-rose-250 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="text-rose-600 mt-0.5 shrink-0" size={16} />
                <div>
                  <h5 className="text-xs font-black text-rose-900 uppercase">Nilai Tidak Valid</h5>
                  <p className="text-[11px] text-rose-700 font-bold mt-1">
                    Terdapat <strong>{invalidEntriesCount}</strong> sel mempunyai format tidak dikenal (dilewati otomatis).
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-teal-50 rounded-2xl border border-teal-200/70 p-4 flex gap-3 text-teal-900 items-start shadow-sm shadow-teal-500/5">
            <Info size={16} className="text-teal-700 shrink-0 mt-0.5" />
            <div className="text-[11px] font-semibold text-teal-800 leading-relaxed">
              <span className="font-extrabold text-teal-950 uppercase block mb-0.5">Mode Pratinjau Aman (Safety Check Mode):</span>
              Berikut adalah pemetaan langsung dari sel spreadsheet yang Anda tempelkan. Baris berstatus <span className="text-emerald-800 font-extrabold">TERPETAKAN</span> akan disimpan. Model mencocokkan kata lengkap maupun singkatan (misalnya <em>Belum Berkembang</em> menjadi <strong>BB</strong>, <em>Berkembang Sangat Baik</em> menjadi <strong>BSB</strong>, dsb).
            </div>
          </div>

          {/* Students list parsed */}
          <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
            {previewItems.map((item, idx) => (
              <div key={idx} className="bg-white border border-gray-150 rounded-2xl p-4.5 space-y-3.5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    {item.matched ? (
                      <div className="bg-emerald-50 text-emerald-700 h-6 w-6 rounded-lg flex items-center justify-center border border-emerald-100">
                        <Check size={14} className="stroke-[3]" />
                      </div>
                    ) : (
                      <div className="bg-amber-50 text-amber-700 h-6 w-6 rounded-lg flex items-center justify-center border border-amber-100">
                        <AlertTriangle size={14} className="stroke-[2.5]" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-black text-gray-800 uppercase tracking-wide">
                        {item.studentName}
                      </h4>
                      {item.matched && item.systemStudent ? (
                        <p className="text-[10px] text-gray-500 font-semibold flex items-center gap-1 mt-0.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Terpeta ke: <strong className="text-emerald-800 font-black">{item.systemStudent.name}</strong> ({item.systemStudent.classId || 'No Class'})
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1 mt-0.5">
                          ⚠️ Tidak cocok. Baris ini akan otomatis diabaikan dari import DB.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    {item.matched ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-emerald-50 border border-emerald-250 text-emerald-800 leading-none">
                        {item.entries.length} Nilai Siap Simpan
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider bg-amber-50 border border-amber-250 text-amber-800 leading-none font-bold">
                        Dilewati (Unregistered)
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub table for matches */}
                {item.entries.length > 0 ? (
                  <div className="overflow-hidden border border-gray-100 rounded-xl bg-gray-50/50">
                    <table className="w-full text-left text-[11px] border-collapse p-0 m-0">
                      <thead>
                        <tr className="bg-gray-100/70 text-gray-500 font-extrabold uppercase text-[9px] tracking-wider border-b border-gray-150">
                          <th className="p-2 pl-3">Day / Tanggal</th>
                          <th className="p-2">Sentra / Activity</th>
                          <th className="p-2">Domain Perkembangan</th>
                          <th className="p-2">Nilai Sel</th>
                          <th className="p-2 pr-3 text-right">Hasil Konversi Evaluasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {item.entries.map((entry, eIdx) => {
                          const grConfig = getGradingBadgeStyles(entry.grading);
                          return (
                            <tr key={eIdx} className="hover:bg-gray-50/50">
                              <td className="p-2 pl-3 font-semibold text-gray-755">
                                <span className="font-mono text-[10px] text-gray-400 mr-2">Day {entry.dayNum}</span>
                                {format(entry.date, 'dd MMM yyyy')}
                              </td>
                              <td className="p-2 font-black text-slate-800 text-[10px] uppercase">
                                {getSentraLabel(entry.activity)}
                              </td>
                              <td className="p-2 font-semibold text-gray-650">
                                {getDomainLabel(entry.domain)}
                              </td>
                              <td className="p-2 font-mono text-[10px] text-gray-450 select-all italic">
                                "{entry.rawText}"
                              </td>
                              <td className="p-2 pr-3 text-right">
                                <span className={cn("px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border leading-none inline-block whitespace-nowrap", grConfig.colorClass)}>
                                  {getGradingLabel(entry.grading)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-2.5 text-center text-gray-400 text-[10px] font-semibold italic bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                    {item.matched ? "Tidak ada nilai input dimasukkan dalam rentang tanggal kerja terpilih." : "Siswa luar sistem — baris dilewati secara otomatis."}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action buttons preview mode */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-2 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={() => setIsReviewing(false)}
              className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-250 text-[10px] uppercase font-black tracking-wider text-gray-700 transition active:scale-95 text-center cursor-pointer rounded-2xl flex items-center justify-center gap-1.5"
              disabled={isSaving}
            >
              <ArrowLeft size={12} />
              Kembali ke Edit Grid
            </button>

            <button
              type="button"
              onClick={handleSaveToFirestore}
              disabled={isSaving}
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl text-[11px] uppercase font-black tracking-widest shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="animate-spin" size={13} />
                  Menyimpan ke Firestore...
                </>
              ) : (
                <>
                  <Save size={13} />
                  Kirim & Simpan {totalEntriesCount} Penilaian ke Database
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Edit Mode: Default input spreadsheet grid */
        <>
          <div className="bg-amber-50 rounded-2xl border border-amber-200/70 p-4.5 flex gap-3 text-amber-900 items-start shadow-sm leading-relaxed">
            <Info size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="text-[11px] font-semibold text-amber-800">
              <span className="font-extrabold text-amber-950 uppercase block mb-0.5">Petunjuk Grid Spreadsheet (Smart Paste):</span>
              Klik pada sel pertama (sel <strong>Nama Siswa / Row Type</strong> atau sel Sentra Day 1), lalu tekan <kbd className="px-1 py-0.5 bg-amber-100 rounded text-amber-950 border border-amber-200 font-mono text-[9px]">Ctrl + V</kbd> untuk menempelkan seluruh tabel data dari Excel atau Google Sheets. 
              Sistem akan mendistribusikan baris pertama ke baris Sentra, baris kedua ke baris Domain, dan baris-baris siswa ke bawahnya secara instan!
            </div>
          </div>

          {(totalWarningsCount > 0 || invalidEntriesCount > 0) && (
            <div className="bg-rose-50 rounded-2xl border border-rose-250 p-4.5 flex gap-3 text-rose-900 items-start shadow-sm leading-relaxed animate-fade-in">
              <AlertTriangle size={16} className="text-rose-700 shrink-0 mt-0.5" />
              <div className="text-[11px] font-semibold text-rose-800 w-full">
                <span className="font-extrabold text-rose-950 uppercase block mb-0.5">Peringatan Validasi Data (Validation Warning):</span>
                <ul className="list-disc list-inside space-y-1 mt-1 font-medium">
                  {totalWarningsCount > 0 && (
                    <li>Terdapat <strong className="text-rose-950">{totalWarningsCount}</strong> baris siswa luar sistem (nama tidak cocok dengan daftar murid di database). Baris ini akan otomatis diabaikan saat penyimpanan.</li>
                  )}
                  {invalidEntriesCount > 0 && (
                    <li>Terdapat <strong className="text-rose-950">{invalidEntriesCount}</strong> sel nilai evaluasi dengan format tidak valid (selain BB, MB, BSH, BSB, Absen, dll.). Sel ini tidak akan disimpan ke database.</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-gray-150 shadow-sm overflow-hidden flex flex-col">
            {/* Table Operations Row */}
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span className="text-[10px] font-extrabold text-gray-500 tracking-wider uppercase">Visual Grid Live Simulator</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={loadSystemStudents}
                  className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition text-emerald-800 font-extrabold px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer active:scale-95 shadow-sm"
                >
                  <UserCheck size={11} /> Muat Murid dari Sistem
                </button>
                <button
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-1.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 transition text-gray-700 font-extrabold px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer active:scale-95 shadow-sm"
                >
                  <Plus size={11} /> Tambah Baris
                </button>
                <button
                  type="button"
                  onClick={resetGrid}
                  className="flex items-center gap-1.5 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-100 hover:text-red-700 transition text-gray-600 font-extrabold px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer active:scale-95 shadow-sm"
                >
                  <Trash2 size={11} /> Kosongkan Grid
                </button>
              </div>
            </div>

            {/* Scrollable Spreadsheet Base */}
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full border-collapse border-b border-gray-100 text-xs min-w-[2000px]">
                {/* Header Dates Row */}
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="p-2 pl-4 border-r border-gray-250 font-black text-gray-500 uppercase tracking-widest text-[9.5px] sticky left-0 bg-gray-50 z-30 w-12 text-center shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                      No
                    </th>
                    <th className="p-2 border-r border-gray-250 font-black text-gray-500 uppercase tracking-widest text-[9.5px] sticky left-[48px] bg-gray-50 z-30 w-72 shadow-[4px_0_6px_rgba(0,0,0,0.03)] text-left">
                      Nama Siswa / Row Type
                    </th>
                    {Array.from({ length: 20 }).map((_, idx) => {
                      const hasDay = idx < workdays.length;
                      const dateLabel = hasDay ? format(workdays[idx], 'dd/MM/yyyy') : '—';
                      
                      const rawSentra = gridData[0][idx + 1] || '';
                      const rawDomain = gridData[1][idx + 1] || '';
                      const isConfigured = findSentraInLine(rawSentra) && findDomainInLine(rawDomain);

                      return (
                        <th 
                          key={idx} 
                          className={cn(
                            "p-2 border-r border-gray-200 text-center uppercase tracking-wider font-extrabold transition",
                            hasDay 
                              ? isConfigured 
                                ? "bg-slate-900 border-slate-800 text-white" 
                                : "bg-emerald-50 bg-opacity-75 text-emerald-800"
                              : "bg-gray-100/50 text-gray-350"
                          )}
                        >
                          <div className="flex flex-col items-center gap-0.5 py-0.5">
                            <span className="text-[10px] font-black whitespace-nowrap">Day {idx + 1}</span>
                            <span className="text-[8.5px] opacity-75 font-mono leading-none tracking-normal font-medium">{dateLabel}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* Matrix Data Rows */}
                <tbody>
                  {gridData.map((row, rIdx) => {
                    const headerSkip = isHeaderRow(row);
                    const isSpecialConfigRow = rIdx === 0 || rIdx === 1;

                    return (
                      <tr 
                        key={rIdx} 
                        className={cn(
                          "hover:bg-gray-50/40 border-b border-gray-150 transition-colors",
                          headerSkip && !isSpecialConfigRow && "bg-amber-50/25 italic",
                          rIdx === 0 && "bg-emerald-50/5",
                          rIdx === 1 && "bg-sky-50/5"
                        )}
                      >
                        {/* Index column */}
                        <td className="p-1 border-r border-gray-250 sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.015)] text-center text-[10px] font-extrabold text-gray-400 font-mono w-12">
                          {isSpecialConfigRow ? 'CFG' : rIdx - 1}
                        </td>

                        {/* Column 0: Student Name / Specialized Row Label */}
                        <td className={cn(
                          "p-1.5 border-r border-gray-250 sticky left-[48px] bg-white z-10 shadow-[3px_0_5px_rgba(0,0,0,0.02)] w-72",
                          rIdx === 0 && "bg-emerald-950/5",
                          rIdx === 1 && "bg-sky-950/5"
                        )}>
                          <div className="flex items-center gap-1.5 min-w-0 pr-1">
                            <input
                              id={`cell-${rIdx}-0`}
                              type="text"
                              value={row[0]}
                              onChange={(e) => updateCellValue(rIdx, 0, e.target.value)}
                              onPaste={(e) => handlePaste(e, rIdx, 0)}
                              onFocus={() => setActiveCell({ r: rIdx, c: 0 })}
                              onKeyDown={(e) => handleKeyDown(e, rIdx, 0)}
                              placeholder={isSpecialConfigRow ? "" : "Ketik atau paste nama anak..."}
                              readOnly={isSpecialConfigRow}
                              className={cn(
                                "w-full bg-transparent border-0 outline-none p-1 font-semibold focus:ring-1 focus:ring-emerald-500 rounded text-xs select-element text-gray-800 truncate leading-tight",
                                isSpecialConfigRow && "font-black tracking-wide text-[10px] cursor-not-allowed select-none text-slate-800",
                                activeCell?.r === rIdx && activeCell?.c === 0 ? "ring-2 ring-emerald-500 bg-white" : ""
                              )}
                            />
                            {row[0] && !isSpecialConfigRow && !headerSkip && (
                              <div className="shrink-0 flex items-center pr-1.5">
                                {(() => {
                                  const res = resolveStudentInfo(row[0]);
                                  return res.matches ? (
                                    <CheckCircle2 size={13} className="text-emerald-500" title={`Cocok: ${res.label}`} />
                                  ) : (
                                    <AlertCircle size={13} className="text-yellow-500 shrink-0" title="Tidak dikenal (Akan dilewati saat simpan)" />
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Columns 1-20: Ratings or Configurations */}
                        {Array.from({ length: 20 }).map((_, cIdx) => {
                          const colNum = cIdx + 1;
                          const hasDay = cIdx < workdays.length;
                          const isCellActive = activeCell?.r === rIdx && activeCell?.c === colNum;
                          
                          if (!hasDay) {
                            return <td key={cIdx} className="bg-gray-100/30 border-r border-gray-150"></td>;
                          }

                          const cellVal = row[colNum];
                          const parsedSentraId = rIdx === 0 ? findSentraInLine(cellVal) : null;
                          const parsedDomainId = rIdx === 1 ? findDomainInLine(cellVal) : null;
                          const mappedGrade = rIdx >= 2 ? mapStringToGrading(cellVal) : null;

                          return (
                            <td 
                              key={cIdx} 
                              className={cn(
                                "p-1.5 border-r border-gray-150 transition-all text-center min-w-[130px] align-top",
                                getCellBgColorClass(cellVal, rIdx, colNum)
                              )}
                            >
                              <div className="relative group/cell w-full flex flex-col gap-1 items-stretch justify-start">
                                <input
                                  id={`cell-${rIdx}-${colNum}`}
                                  type="text"
                                  value={cellVal}
                                  onChange={(e) => updateCellValue(rIdx, colNum, e.target.value)}
                                  onPaste={(e) => handlePaste(e, rIdx, colNum)}
                                  onFocus={() => setActiveCell({ r: rIdx, c: colNum })}
                                  onKeyDown={(e) => handleKeyDown(e, rIdx, colNum)}
                                  className={cn(
                                    "w-full text-center bg-transparent border-0 outline-none p-1 font-bold text-xs focus:ring-1 focus:ring-emerald-500 rounded select-element antialiased leading-none text-gray-800",
                                    isCellActive ? "ring-2 ring-emerald-500 bg-white" : "",
                                    rIdx === 0 && "text-emerald-900 placeholder-emerald-700/40",
                                    rIdx === 1 && "text-sky-900 placeholder-sky-750/40"
                                  )}
                                  maxLength={50}
                                  placeholder={
                                    rIdx === 0 ? "Ketik/Paste Sentra" : 
                                    rIdx === 1 ? "Ketik/Paste Domain" : 
                                    "Isi BB/MB.."
                                  }
                                />
                                
                                {/* Specialized Auto-correct Dropdowns for Header Configurations */}
                                {rIdx === 0 && (
                                  <select
                                    value={parsedSentraId || ''}
                                    onChange={(e) => {
                                      const selectedId = e.target.value;
                                      const matchedItem = activitiesList.find(a => a.id === selectedId);
                                      if (matchedItem) {
                                        updateCellValue(0, colNum, matchedItem.label);
                                        toast.success(`Kolom ${colNum} auto-correct: "${matchedItem.label}"`);
                                      } else {
                                        updateCellValue(0, colNum, '');
                                      }
                                    }}
                                    className="w-full text-[9px] font-semibold bg-white border border-gray-200 hover:border-gray-300 rounded px-1 py-0.5 tracking-wider outline-none cursor-pointer focus:ring-1 focus:ring-emerald-500"
                                  >
                                    <option value="">(Belum Terpeta)</option>
                                    {activitiesList.map(item => (
                                      <option key={item.id} value={item.id}>{item.label}</option>
                                    ))}
                                  </select>
                                )}

                                {rIdx === 1 && (
                                  <select
                                    value={parsedDomainId || ''}
                                    onChange={(e) => {
                                      const selectedId = e.target.value;
                                      const matchedItem = domainsList.find(d => d.id === selectedId);
                                      if (matchedItem) {
                                        updateCellValue(1, colNum, matchedItem.label);
                                        toast.success(`Kolom ${colNum} auto-correct: "${matchedItem.label}"`);
                                      } else {
                                        updateCellValue(1, colNum, '');
                                      }
                                    }}
                                    className="w-full text-[9px] font-semibold bg-white border border-gray-200 hover:border-gray-300 rounded px-1 py-0.5 tracking-wider outline-none cursor-pointer focus:ring-1 focus:ring-emerald-500"
                                  >
                                    <option value="">(Belum Terpeta)</option>
                                    {domainsList.map(item => (
                                      <option key={item.id} value={item.id}>{item.label}</option>
                                    ))}
                                  </select>
                                )}

                                {/* Overlay tag indicator for grading conversion validation */}
                                {mappedGrade && cellVal !== mappedGrade && !isCellActive && (
                                  <div className="absolute right-0.5 bottom-0.5 bg-black/60 text-white rounded text-[7px] font-black px-1 scale-90 opacity-0 group-hover/cell:opacity-100 pointer-events-none transition uppercase">
                                    {mappedGrade}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 hover:border-gray-300 rounded-2xl text-[10px] uppercase font-black tracking-wider text-gray-700 transition active:scale-95 text-center cursor-pointer disabled:opacity-50"
              disabled={isSaving}
            >
              Batalkan & Keluar
            </button>

            <button
              type="button"
              onClick={handleProceedToPreview}
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl text-[11px] uppercase font-black tracking-widest shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Eye size={13} />
              Pratinjau & Validasi Data ({totalEntriesCount} Nilai)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
