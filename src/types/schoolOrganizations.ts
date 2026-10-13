export type SchoolOrgProgramType = 'OSIS' | 'SWJ' | 'COMPETITION';

export interface DesignTeamOption {
  id: string;
  name: string;
  description: string;
  order: number;
  isActive: boolean;
}

export interface SwjRoleOption {
  id: string;
  name: string;
  description: string;
  defaultQuota: number;
  order: number;
  isActive: boolean;
}

export interface SOMasterOptions {
  designTeams: DesignTeamOption[];
  swjRoles: SwjRoleOption[];
  swjFlowStages: string[];
  competitionStages: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SO_MASTER_OPTIONS: SOMasterOptions = {
  designTeams: [
    {
      id: 'dt-islamic-practices',
      name: 'Islamic Practices',
      description: 'Penguatan pengamalan ibadah harian, adab Islami, dan syiar keagamaan di lingkungan sekolah',
      order: 1,
      isActive: true,
    },
    {
      id: 'dt-student-wellbeing',
      name: 'Student Well Being Center',
      description: 'Dukungan kesehatan mental, kepedulian kawan sebaya, dan iklim interaksi positif siswa',
      order: 2,
      isActive: true,
    },
    {
      id: 'dt-talent-disposition',
      name: 'Student Range of Talent and Disposition',
      description: 'Eksplorasi minat bakat, ekspresi seni/kreativitas, dan pembentukan disposisi kepemimpinan siswa',
      order: 3,
      isActive: true,
    },
    {
      id: 'dt-student-spotlight',
      name: 'Student Spotlight',
      description: 'Publikasi karya, dokumentasi kegiatan, media mading/jurnalistik, dan apresiasi prestasi siswa',
      order: 4,
      isActive: true,
    },
    {
      id: 'dt-school-wide-job',
      name: 'School-Wide Job',
      description: 'Koordinasi pergerakan umum relawan siswa, sinergi kepanitiaan, dan operasional lintas unit kegiatan',
      order: 5,
      isActive: true,
    },
  ],
  swjRoles: [
    {
      id: 'swj-ball-boys',
      name: 'Ball Boys',
      description: 'Pengelolaan dan ketertiban peralatan olahraga saat istirahat dan kegiatan',
      defaultQuota: 6,
      order: 1,
      isActive: true,
    },
    {
      id: 'swj-medic-crew',
      name: 'Medic Crew',
      description: 'Dukungan pertolongan pertama (P3K) dan siaga UKS pada aktivitas siswa',
      defaultQuota: 6,
      order: 2,
      isActive: true,
    },
    {
      id: 'swj-duty-care',
      name: 'Duty Care (Morning)',
      description: 'Penyambutan pagi hari, adab salam, dan penertiban area gerbang serta selasar',
      defaultQuota: 8,
      order: 3,
      isActive: true,
    },
    {
      id: 'swj-referees',
      name: 'Referees',
      description: 'Wasit pertandingan olahraga persahabatan, classmeeting, dan liga siswa',
      defaultQuota: 6,
      order: 4,
      isActive: true,
    },
    {
      id: 'swj-english-enthusiasts',
      name: 'English Enthusiasts',
      description: 'Penggerak English Day, tantangan percakapan, dan atmosfer bilingual sekolah',
      defaultQuota: 8,
      order: 5,
      isActive: true,
    },
    {
      id: 'swj-attire-models',
      name: 'Attire Models',
      description: 'Teladan kerapian seragam dan adab berbusana sesuai tata tertib madani',
      defaultQuota: 6,
      order: 6,
      isActive: true,
    },
    {
      id: 'swj-green-leaders',
      name: 'Green Leaders',
      description: 'Duta kelestarian lingkungan, edukasi pemilahan sampah, dan kebersihan sekolah',
      defaultQuota: 8,
      order: 7,
      isActive: true,
    },
    {
      id: 'swj-pro-solvers',
      name: 'Pro-Solvers',
      description: 'Bantuan solusi teknis cepat, pendukung logistik kelas, audio-visual, dan multimedia',
      defaultQuota: 6,
      order: 8,
      isActive: true,
    },
  ],
  swjFlowStages: [
    'Sosialisasi',
    'Pendaftaran',
    'Rekrutmen',
    'Orientasi',
    'Berjalan',
  ],
  competitionStages: [
    'Info',
    'Pendaftaran',
    'Persiapan',
    'Pelaksanaan',
    'Hasil',
    'Evaluasi',
  ],
};

export interface StageHistoryItem {
  stage: string;
  timestamp: string; // ISO string
  updatedBy: string; // email or name
}

export interface SOGroup {
  id: string; // for OSIS & SWJ: `${academicYearKey}_${programType}_${masterOptionId}`; for COMPETITION: auto-id
  academicYear: string;
  programType: SchoolOrgProgramType;
  name: string;
  categoryOrSubtype: string; // OSIS: 'EXECUTIVE' | 'DESIGN_TEAM'; SWJ: master option id; COMPETITION: kategori lomba
  description?: string;
  mentorUids: string[];
  mentorNames: string[];
  studentCoordinatorId?: string; // NIS
  studentCoordinatorName?: string;
  currentStage: string; // SWJ: from swjFlowStages; COMPETITION: from competitionStages; OSIS: 'Aktif'
  stageHistory?: StageHistoryItem[];
  quota?: number; // SWJ quota
  organizer?: string; // COMPETITION organizer
  targetDate?: string; // COMPETITION event date
  status: 'active' | 'archived';
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SOMembership {
  id: string; // `${groupId}_${studentId}`
  groupId: string;
  academicYear: string;
  programType: SchoolOrgProgramType;
  studentId: string; // NIS (Student doc ID)
  studentName: string;
  classId: string;
  className: string;
  roleTitle: string; // e.g. Presiden, Captain Team, Anggota, Koordinator Siswa, Peserta Lomba
  canAssignTasks?: boolean; // Captain task assignment and team report reading permission
  joinedAt: string;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SOWeeklyReport {
  id: string; // `${groupId}_${studentId}_${weekStart}`
  groupId: string;
  groupName: string;
  programType: 'OSIS' | 'SWJ';
  academicYear: string;
  studentId: string; // NIS
  studentName: string;
  classId: string;
  className: string;
  weekStart: string; // YYYY-MM-DD (Senin)
  weekEnd: string; // YYYY-MM-DD (Minggu)
  doneText: string; // max 1500 chars
  nextText: string; // max 1500 chars
  status: 'DRAFT' | 'SUBMITTED';
  submittedAt?: string | null;
  isLate: boolean;
  createdAt: string;
  updatedAt: string;
  feedbackText?: string | null; // max 300 chars
  feedbackBy?: string | null;
  feedbackByName?: string | null;
  feedbackAt?: string | null;
  readAt?: string | null;
  readBy?: string | null;
  readByName?: string | null;
}
