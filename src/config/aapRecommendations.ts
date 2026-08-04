export type AAPStage = 'BB' | 'MB' | 'BSH' | 'BSB';
export type AAPAspect = 'Motorik Kasar' | 'Motorik Halus' | 'Bahasa' | 'Kognitif' | 'Sosial & Kemandirian';

export const AAP_RECOMMENDATIONS: Record<AAPAspect, Record<AAPStage, string>> = {
  'Motorik Kasar': {
    'BB': 'Siswa memerlukan latihan dasar keseimbangan, koordinasi kekuatan otot besar melalui aktivitas seperti merangkak, berguling, dan memanjat playground dengan pengawasan. Sediakan sesi latihan berjalan di garis lurus setiap hari.',
    'MB': 'Latihan dasar koordinasi berjalan-lari, menangkap bola besar dari jarak dekat, melompati rintangan sangat rendah, serta bermain bebas di luar ruangan untuk melatih keseimbangan tubuh.',
    'BSH': 'Pertahankan kemampuan fisik anak dengan memperkaya aktivitas fisik terstruktur seperti senam irama, melompat dengan satu kaki bergantian, serta permainan melempar dan menangkap bola dengan target.',
    'BSB': 'Siswa menunjukkan kekuatan fisik dan koordinasi tubuh yang sangat matang. Sediakan aktivitas motorik kasar tingkat lanjut seperti rintangan ketangkasan (obstacle course), bersepeda roda dua, atau tari koreografi sederhana.'
  },
  'Motorik Halus': {
    'BB': 'Lakukan stimulasi kekuatan otot jemari dan pergelangan tangan melalui meremas kertas, bermain playdough/plastisin dengan gerakan meremas dan menggulung, serta merobek kertas bebas.',
    'MB': 'Latih koordinasi mata-tangan dengan aktivitas meronce menggunakan manik-manik berukuran besar, menggunting kertas secara acak, membuka-menutup botol, serta meniru coretan garis lurus dan lingkaran.',
    'BSH': 'Tingkatkan presisi genggaman tripod grasp dengan aktivitas menggunting garis lurus/lengkung, mewarnai gambar dengan batasan garis, meronce pola manik-manik sedang, dan melipat kertas sederhana.',
    'BSB': 'Siswa sangat terampil dalam motorik halus. Berikan tantangan tingkat tinggi seperti menggunting pola zigzag/bergelombang, melipat origami multi-langkah, menggambar detail manusia lengkap, atau mengikat tali sepatu mandiri.'
  },
  'Bahasa': {
    'BB': 'Siswa memerlukan pendampingan intensif berbicara satu-lawan-satu. Bacakan buku cerita bergambar dengan interaksi langsung, dorong anak meniru suara dan kata sederhana, serta hindari penggunaan gawai berlebihan.',
    'MB': 'Stimulasi anak untuk mengutarakan keinginan dengan kalimat lengkap (minimal 3 kata), latih kemampuan menjawab pertanyaan deskriptif (siapa, apa), serta berikan instruksi 2 langkah sederhana secara bertahap.',
    'BSH': 'Ajak anak berdiskusi aktif tentang kesehariannya, menceritakan kembali cerita pendek yang baru didengar, bermain peran (roleplay), serta perkenalkan hubungan huruf abjad dengan bunyinya (fonik dasar).',
    'BSB': 'Siswa sangat komunikatif dan ekspresif. Fasilitasi dengan kesempatan berpresentasi di depan teman sekelas, membaca buku cerita pendek berpola suku kata, menulis jurnal gambar, dan mengeksplorasi kata hubung baru.'
  },
  'Kognitif': {
    'BB': 'Fokus pada stimulasi sensorik-motorik dasar seperti menyortir benda berdasarkan satu warna primer, menyusun balok bertingkat (menara rendah), serta mengenalkan bagian tubuh utama melalui lagu interaktif.',
    'MB': 'Kenalkan konsep perbandingan sederhana (besar-kecil, panjang-pendek), mengelompokkan mainan berdasarkan kategori warna/bentuk geometri, menghitung berurutan hingga 5, dan menyusun puzzle kayu 4 keping.',
    'BSH': 'Kembangkan kemampuan berpikir logis melalui permainan mengurutkan pola gambar (patterning), berhitung benda konkrit hingga 10, menyelesaikan puzzle 8 keping, serta mengenalkan konsep ruang dan waktu dasar.',
    'BSB': 'Sediakan aktivitas stimulasi logika tingkat lanjut seperti operasi aritmatika konkrit sederhana (penjumlahan/pengurangan di bawah 10), puzzle kompleks (12-20 keping), detektif pola gambar, serta eksperimen sains sederhana.'
  },
  'Sosial & Kemandirian': {
    'BB': 'Siswa perlu didampingi dalam mengelola tantangan emosional saat terpisah dari orang tua. Latih kebiasaan merapikan mainan dengan bantuan guru, serta biasakan penggunaan toilet melalui pendampingan khusus (toilet training).',
    'MB': 'Ajarkan dan contohkan konsep berbagi mainan, bergantian giliran dengan teman sebaya melalui fasilitasi guru, membiasakan mengucapkan tiga kata ajaib (tolong, maaf, terima kasih), serta melepas-pakai sepatu sendiri.',
    'BSH': 'Pertahankan perkembangan sosial anak dengan melibatkan mereka dalam diskusi kelompok kecil, melatih pemecahan masalah sederhana (conflict resolution), serta melakukan rutinitas merapikan alat belajar secara mandiri.',
    'BSB': 'Siswa sangat mandiri dan berjiwa kepemimpinan tinggi. Berikan tanggung jawab khusus seperti menjadi ketua barisan kelas, memimpin doa, mengasuh teman yang memerlukan bantuan, serta mengorganisir permainan kelompok mandiri.'
  }
};

export const AAP_DEVELOPMENT_ANALYSIS: Record<AAPAspect, Record<AAPStage, string>> = {
  'Motorik Kasar': {
    'BB': 'Siswa masih kesulitan melakukan gerakan lokomotor dasar seperti melompat atau menjaga keseimbangan dinamis.',
    'MB': 'Siswa mulai mampu berkoordinasi dalam gerakan dasar lokomotor dan non-lokomotor namun masih perlu bimbingan untuk kestabilan penuh.',
    'BSH': 'Siswa sudah memiliki kemampuan fisik yang matang, dapat melompat, berlari seimbang, dan menangkap objek dengan koordinasi baik.',
    'BSB': 'Siswa menunjukkan kelincahan, ketahanan fisik, dan keseimbangan dinamis yang luar biasa melampaui rata-rata usianya.'
  },
  'Motorik Halus': {
    'BB': 'Siswa membutuhkan latihan koordinasi motorik halus awal untuk menggenggam dan memanipulasi objek kecil.',
    'MB': 'Siswa mampu memegang alat tulis dasar dan menggerakkan jemari, namun kekuatan otot jari dan pergelangan masih perlu dimatangkan.',
    'BSH': 'Siswa memiliki kelenturan jari yang baik, mampu menggunting dengan rapi dan memegang pensil secara presisi.',
    'BSB': 'Siswa memiliki kekuatan dan presisi jemari yang sangat tinggi, mahir mengontrol gerakan detail yang rumit secara mandiri.'
  },
  'Bahasa': {
    'BB': 'Siswa memerlukan stimulasi tambahan untuk memperbanyak kosakata aktif dan memahami struktur kalimat sederhana.',
    'MB': 'Siswa sudah mampu mengerti instruksi dasar dan berbicara secara verbal meskipun struktur kalimatnya kadang belum lengkap.',
    'BSH': 'Siswa sudah mampu berkomunikasi dengan kalimat terstruktur, mengutarakan ide, serta menyimak dan memahami narasi pendek.',
    'BSB': 'Siswa memiliki penguasaan bahasa yang sangat kaya, mampu berargumen logis, dan mengenal bunyi abjad serta simbol fonik dengan fasih.'
  },
  'Kognitif': {
    'BB': 'Siswa membutuhkan pendampingan untuk memetakan objek secara visual berdasarkan karakteristik sederhana seperti bentuk atau warna.',
    'MB': 'Siswa mulai mengenal konsep kuantitas konkrit awal dan bentuk geometri, namun penyelesaian masalah logis masih perlu dipandu.',
    'BSH': 'Siswa sudah mampu mengklasifikasi benda secara multi-atribut, berhitung secara koresponden, dan memahami relasi sebab-akibat.',
    'BSB': 'Siswa memiliki logika berpikir deduktif yang sangat tajam, tangkas memecahkan masalah pola abstrak, dan memahami operasi simbolis dasar.'
  },
  'Sosial & Kemandirian': {
    'BB': 'Siswa masih menunjukkan kecemasan berpisah (separation anxiety) dan memerlukan bimbingan intensif untuk membiasakan toilet training.',
    'MB': 'Siswa mulai beradaptasi dengan lingkungan sekolah dan aturan kelas, namun interaksi berbagi mainan dan antre masih perlu diingatkan.',
    'BSH': 'Siswa sangat bersahabat, kooperatif, mandiri dalam mengurus kebutuhan diri dasar (seperti sepatu), dan peka terhadap perasaan teman.',
    'BSB': 'Siswa menunjukkan kecerdasan emosional yang tinggi, berinisiatif menolong sesama, bertanggung jawab penuh atas tugasnya, dan siap memimpin.'
  }
};
