import { MTSSAcademicBasicSkill } from '../types';

export const MTSS_ACADEMIC_BASIC_SKILLS: MTSSAcademicBasicSkill[] = [
  // GRADE 7 - NUMERACY
  { code: 'G7-NUM-01', title: 'Place Value 4 Digit', description: 'Memahami nilai tempat hingga ribuan', grade: 7, domain: 'NUM' },
  { code: 'G7-NUM-02', title: 'Add/Sub 2 Digit', description: 'Operasi penjumlahan & pengurangan 2 digit', grade: 7, domain: 'NUM' },
  { code: 'G7-NUM-03', title: 'Mul/Div 1 Digit', description: 'Operasi perkalian & pembagian 1 digit', grade: 7, domain: 'NUM' },
  { code: 'G7-NUM-04', title: 'Negative Numbers', description: 'Pengenalan bilangan negatif 1 digit', grade: 7, domain: 'NUM' },
  
  // GRADE 7 - LITERACY (BI/ENG)
  { code: 'G7-LIT-01', title: 'Main Idea', description: 'Menemukan ide pokok dalam teks sederhana', grade: 7, domain: 'BI' },
  { code: 'G7-LIT-02', title: 'Explicit Info', description: 'Menemukan informasi eksplisit dalam teks', grade: 7, domain: 'BI' },
  { code: 'G7-LIT-03', title: 'Vocabulary', description: 'Memahami makna kata/frasa sederhana', grade: 7, domain: 'BI' },
  
  // GRADE 8 - NUMERACY
  { code: 'G8-NUM-01', title: 'Fractions Operations', description: 'Operasi dasar pecahan', grade: 8, domain: 'NUM' },
  { code: 'G8-NUM-02', title: 'Linear Equations', description: 'Persamaan linear satu variabel sederhana', grade: 8, domain: 'NUM' },
  
  // GRADE 8 - LITERACY
  { code: 'G8-LIT-01', title: 'Implicit Inference', description: 'Kesimpulan implisit dari teks', grade: 8, domain: 'BI' },
  { code: 'G8-LIT-02', title: 'Text Structure', description: 'Memahami struktur teks deskripsi/naratif', grade: 8, domain: 'BI' }
];

export const MTSS_SOP_CONFIG = {
  TIER2_THRESHOLD_PERCENTAGE: 20,
  INITIAL_DIAGNOSIS_SESSIONS: 4,
  TIER2_CYCLE_SESSIONS: 8,
  TIER2_CYCLE_WEEKS: 4,
  MAX_ABSENCE_LIMIT: 2,
  SCORE_LOW_THRESHOLD: 65,
  SCORE_CRITICAL_THRESHOLD: 50
};
