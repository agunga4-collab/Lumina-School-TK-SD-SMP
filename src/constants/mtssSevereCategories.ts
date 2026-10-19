export interface SevereBehaviorCategory {
  code: string;
  number: number;
  label: string;
}

export const SEVERE_BEHAVIOR_CATEGORIES: SevereBehaviorCategory[] = [
  { code: 'G01', number: 1, label: 'Membawa/menghisap rokok di dalam area sekolah' },
  { code: 'G02', number: 2, label: 'Merusak fasilitas sekolah dengan sengaja' },
  { code: 'G03', number: 3, label: 'Perayaan ulang tahun yang tidak lazim (dengan telur)' },
  { code: 'G04', number: 4, label: 'Bertaruh atau berjudi' },
  { code: 'G05', number: 5, label: 'Membawa senjata tajam' },
  { code: 'G06', number: 6, label: 'Meminta sesuatu kepada teman dengan cara memaksa (uang dan barang berharga)' },
  { code: 'G07', number: 7, label: 'Mencuri di dalam/di luar sekolah' },
  { code: 'G08', number: 8, label: 'Mengancam teman/pihak sekolah' },
  { code: 'G09', number: 9, label: 'Berkelahi (adu fisik)' },
  { code: 'G10', number: 10, label: 'Melakukan pelecehan baik fisik, perkataan maupun perbuatan' },
  { code: 'G11', number: 11, label: 'Membawa hal-hal yang berkaitan dengan pornografi' },
  { code: 'G12', number: 12, label: 'Memakai uang orang lain' },
  { code: 'G13', number: 13, label: 'Membuat dokumen palsu dan membuat tanda tangan palsu' },
  { code: 'G14', number: 14, label: 'Terbukti menjadi anggota salah satu geng' },
  { code: 'G15', number: 15, label: 'Menghina/merendahkan/melecehkan nama baik sekolah' },
  { code: 'G16', number: 16, label: 'Berpacaran di lingkungan sekolah' },
  { code: 'G17', number: 17, label: 'Melakukan perbuatan di luar batas (berpelukan, berpegangan tangan, berciuman) di lingkungan sekolah' },
];
