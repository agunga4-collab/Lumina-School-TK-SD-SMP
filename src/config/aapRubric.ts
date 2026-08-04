export type AAPAspectName = 'Motorik Kasar' | 'Motorik Halus' | 'Bahasa' | 'Kognitif' | 'Sosial & Kemandirian';

export const AAP_RUBRIC: Record<
  '2-4' | '4-5' | '5-6',
  Record<AAPAspectName, string[]>
> = {
  '2-4': {
    'Motorik Kasar': [
      'Melompat kedua kaki ke depan',
      'Melompat kedua kaki ke belakang',
      'Naik tangga dengan berpegangan',
      'Berdiri dengan satu kaki selama 1-3 detik',
      'Menendang bola besar ke depan'
    ],
    'Motorik Halus': [
      'Membawa benda dengan dua tangan',
      'Makan sendiri tanpa kesulitan',
      'Menyusun menara balok 4-6 tingkat',
      'Meremas kertas dengan jari',
      'Mencoret-coret bebas'
    ],
    'Bahasa': [
      'Memiliki kosa kata 50-300 kata',
      'Bicara dengan kombinasi 3-4 kata',
      'Menyebutkan nama diri sendiri',
      'Memahami instruksi sederhana (contoh: "ambil bola")',
      'Bertanya menggunakan kata tanya sederhana (apa, siapa)'
    ],
    'Kognitif': [
      'Mencari benda yang disembunyikan',
      'Mencocokkan warna primer sederhana',
      'Mengelompokkan benda sejenis',
      'Memahami konsep ukuran besar-kecil',
      'Mengenal bagian tubuh dasar'
    ],
    'Sosial & Kemandirian': [
      'Bermain berdampingan dengan anak lain (parallel play)',
      'Mulai mengekspresikan emosi secara verbal',
      'Mau berbagi mainan dengan bantuan',
      'Mencuci tangan sendiri dengan bantuan',
      'Mulai menggunakan toilet dengan bantuan (toilet training)'
    ]
  },
  '4-5': {
    'Motorik Kasar': [
      'Berlari sambil berbelok tanpa jatuh',
      'Melompat melompati rintangan rendah',
      'Berdiri dengan satu kaki selama 4-6 detik',
      'Menangkap bola besar dengan kedua tangan',
      'Berjalan di atas papan titian'
    ],
    'Motorik Halus': [
      'Menggunting kertas mengikuti garis lurus',
      'Memegang alat tulis dengan tripod grasp',
      'Meniru bentuk lingkaran dan tanda tambah',
      'Meronce dengan manik-manik sedang',
      'Membuka dan menutup kancing baju besar'
    ],
    'Bahasa': [
      'Berbicara dengan kalimat lengkap (4-6 kata)',
      'Menjawab pertanyaan "apa", "mengapa", "bagaimana"',
      'Menceritakan kembali cerita pendek',
      'Mengikuti 2-3 langkah instruksi berurutan',
      'Menyebutkan sebagian besar huruf abjad'
    ],
    'Kognitif': [
      'Menghitung benda secara berurutan hingga 10',
      'Mengelompokkan benda berdasarkan warna, bentuk, ukuran',
      'Menyusun puzzle 4-8 keping',
      'Memahami konsep waktu (siang, malam)',
      'Mengenal dan menyebutkan bentuk geometri dasar'
    ],
    'Sosial & Kemandirian': [
      'Bermain kooperatif dalam kelompok kecil',
      'Mampu menunjukkan empati (menghibur teman yang sedih)',
      'Mengikuti aturan kelas dan antre dengan sabar',
      'Membuka dan menggunakan sepatu sendiri',
      'Merespon dan merapikan mainan setelah digunakan'
    ]
  },
  '5-6': {
    'Motorik Kasar': [
      'Melompati tali setinggi lutut',
      'Melompat dengan satu kaki bergantian',
      'Menangkap bola tenis/kecil dengan satu atau dua tangan',
      'Mengendarai sepeda roda dua/tiga dengan stabil',
      'Melakukan gerakan senam sederhana'
    ],
    'Motorik Halus': [
      'Menggunting pola lingkaran atau gelombang',
      'Menulis huruf abjad dan angka sendiri',
      'Melipat kertas menjadi bentuk sederhana (origami dasar)',
      'Mengikat tali sepatu sendiri atau dengan sedikit bantuan',
      'Menggambar orang lengkap dengan bagian tubuh (kepala, badan, kaki, tangan)'
    ],
    'Bahasa': [
      'Menggunakan kalimat kompleks dengan kata hubung',
      'Membaca kata-kata pendek sederhana (2-3 suku kata)',
      'Menjelaskan arti kata sederhana',
      'Mengajukan pertanyaan kritis tentang kejadian sekitar',
      'Menulis nama lengkap sendiri'
    ],
    'Kognitif': [
      'Melakukan penjumlahan dan pengurangan sederhana di bawah 10',
      'Menyelesaikan puzzle 12 keping atau lebih',
      'Memahami pola urutan gambar (patterning)',
      'Membedakan konsep kanan dan kiri',
      'Menjelaskan fungsi benda-benda di sekitar'
    ],
    'Sosial & Kemandirian': [
      'Bermain dengan aturan kelompok yang lebih kompleks',
      'Menyelesaikan konflik kecil dengan berdiskusi',
      'Menunjukkan rasa bangga atas hasil karya sendiri',
      'Mandi dan memakai pakaian lengkap secara mandiri',
      'Melaksanakan tugas piket kelas sederhana secara bertanggung jawab'
    ]
  }
};

export const AAP_ASPECTS: AAPAspectName[] = [
  'Motorik Kasar',
  'Motorik Halus',
  'Bahasa',
  'Kognitif',
  'Sosial & Kemandirian'
];

export const STAGE_LABELS = {
  1: 'BB',
  2: 'MB',
  3: 'BSH',
  4: 'BSB'
};

export function getStageFromPercentage(percentage: number): 'BB' | 'MB' | 'BSH' | 'BSB' {
  if (percentage < 40) return 'BB';
  if (percentage < 65) return 'MB';
  if (percentage < 85) return 'BSH';
  return 'BSB';
}
