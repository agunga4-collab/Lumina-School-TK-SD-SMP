import * as React from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { 
  ElementaryPeriod, 
  ElementaryProgressRecord 
} from '../../../types/elementaryLiteracyNumeracy';
import { 
  getAreaLabel, 
  getSupportStatusLabel 
} from '../../../constants/elementaryLiteracyBenchmarks';
import { 
  Users, CheckCircle2, AlertTriangle, AlertCircle, Sparkles, 
  Search, ShieldAlert, GraduationCap, ChevronRight, HelpCircle
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import StudentLiteracyHistoryDrawer from './StudentLiteracyHistoryDrawer';

interface Props {
  schoolYear: string;
  period: ElementaryPeriod;
}

export default function ElementaryLiteracyOverview({ schoolYear, period }: Props) {
  const [allRecords, setAllRecords] = React.useState<ElementaryProgressRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  
  // Detail drawer integration
  const [selectedStudent, setSelectedStudent] = React.useState<{ id: string; name: string; area: any } | null>(null);

  const fetchOverviewData = React.useCallback(async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'elementary_literacy_numeracy_records'),
        where('schoolYear', '==', schoolYear),
        where('period', '==', period)
      );
      
      const snap = await getDocs(q);
      const loaded: ElementaryProgressRecord[] = [];
      snap.forEach((docSnap) => {
        loaded.push(docSnap.data() as ElementaryProgressRecord);
      });
      setAllRecords(loaded);
    } catch (err) {
      console.error("Error fetching overview metrics:", err);
    } finally {
      setLoading(false);
    }
  }, [schoolYear, period]);

  React.useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  // Aggregate stats
  const stats = React.useMemo(() => {
    const uniqueStudentIds = new Set(allRecords.map(r => r.studentId));
    const totalStudentsFilled = uniqueStudentIds.size;

    let onTrackCount = 0;
    let needsSupportCount = 0;
    const followUpList: ElementaryProgressRecord[] = [];

    allRecords.forEach(rec => {
      if (rec.supportStatus === 'ON_TRACK') {
        onTrackCount++;
      } else if (
        rec.supportStatus === 'MONITOR' || 
        rec.supportStatus === 'NEEDS_SUPPORT'
      ) {
        needsSupportCount++;
        followUpList.push(rec);
      }
    });

    return {
      totalInputRecords: allRecords.length,
      totalStudentsFilled,
      onTrackCount,
      needsSupportCount,
      followUpList
    };
  }, [allRecords]);

  // Handle click on follow-up student to launch history drawer
  const handleStudentClick = (rec: ElementaryProgressRecord) => {
    setSelectedStudent({
      id: rec.studentId,
      name: rec.studentName,
      area: rec.area
    });
  };

  // Filtered follow-up list search
  const filteredFollowUpList = React.useMemo(() => {
    return stats.followUpList.filter(rec => 
      rec.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getAreaLabel(rec.area).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stats.followUpList, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-gray-100 shadow-sm gap-3 text-slate-400">
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-black uppercase tracking-wider">Memuat Dasbor Analitis...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* KPI GRID CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Input */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
            <Users size={120} className="text-slate-900" />
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-50 text-slate-700 rounded-2xl">
              <Users size={18} />
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              SITUS TERDATA
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
              {stats.totalStudentsFilled}
            </h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
              ({stats.totalInputRecords} Catatan Penilaian)
            </p>
          </div>
        </div>

        {/* Card 2: Jumlah ON_TRACK */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
            <CheckCircle2 size={120} className="text-emerald-900" />
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <CheckCircle2 size={18} />
            </div>
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
              TIER 1 (ON TRACK)
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-black text-emerald-600 tracking-tight leading-none">
              {stats.onTrackCount}
            </h4>
            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
              MENCAPAI TARGET PEMBELAJARAN
            </p>
          </div>
        </div>

        {/* Card 3: Jumlah NEEDS_SUPPORT */}
        <div className="bg-gradient-to-tr from-rose-500/5 to-rose-600/0 border border-rose-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
            <AlertTriangle size={120} className="text-rose-900" />
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl">
              <AlertTriangle size={18} />
            </div>
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">
              BUTUH INTERVENSI (TIER 2 & TIER 3)
            </span>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-black text-rose-600 tracking-tight leading-none">
              {stats.needsSupportCount}
            </h4>
            <p className="text-[10px] text-rose-500 font-bold mt-1 uppercase">
              BUTUH INTERVENSI EKSTRA
            </p>
          </div>
        </div>
      </div>

      {/* DETAILED FOLLOW-UP RADAR */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Section Title */}
        <div className="p-5 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-red-50/10">
          <div className="flex items-center gap-2">
            <div className="bg-rose-500/10 text-rose-600 p-1.5 rounded-xl">
              <AlertCircle size={15} />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">
                Pemantauan Kelas & Prioritas Pendampingan
              </h3>
              <p className="text-[10px] text-slate-400 font-bold">
                Daftar siswa tingkat dasar dengan capaian di bawah benchmark minimum (Wajib Follow Up).
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-2.5 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Cari nama atau pelajaran..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 text-xs px-9 py-2 rounded-xl outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Dynamic results list */}
        {stats.followUpList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 gap-2">
            <Sparkles size={28} className="text-emerald-500" />
            <p className="text-xs font-bold text-slate-700">Kinerja Siswa Luar Biasa!</p>
            <p className="text-[10px] text-slate-400 max-w-sm">Semua siswa untuk periode dan tahun ajaran terpilih mencatatkan capaian target atau berada dalam zona 'On Track'.</p>
          </div>
        ) : filteredFollowUpList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 gap-1">
            <Search size={22} className="text-slate-300" />
            <p className="text-xs font-bold">Tidak ada hasil pencarian yang cocok.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="py-3 px-5">Nama Siswa</th>
                  <th className="py-3 px-4">Pelajaran</th>
                  <th className="py-3 px-4">Level Capaian</th>
                  <th className="py-3 px-4 text-center">Benchmark Score / WPM</th>
                  <th className="py-3 px-4">Catatan Hambatan</th>
                  <th className="py-3 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                {filteredFollowUpList.map((rec, idx) => {
                  return (
                    <tr key={rec.id || idx} className="hover:bg-rose-50/10 transition-colors">
                      <td className="py-3.5 px-5 font-bold text-slate-950">
                        {rec.studentName}
                        <span className="text-[9px] text-slate-400 font-mono block mt-0.5">Kelas {rec.gradeLevel}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-bold uppercase tracking-wider">
                          {getAreaLabel(rec.area)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        {rec.area === 'MENGAJI' && (rec as any).iqroCurrentLevel ? `Iqro ${(rec as any).iqroCurrentLevel}` : ''}
                        {(rec.area === 'BAHASA_INDONESIA' || rec.area === 'ENGLISH_READING') && (rec as any).readingLevel ? `Reading Level: ${(rec as any).readingLevel}` : ''}
                        {rec.area === 'NUMERACY' && (rec as any).mathLevel ? `Math Level: ${(rec as any).mathLevel}` : ''}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="font-mono text-slate-900 font-bold">
                            {rec.area === 'MENGAJI' ? (rec as any).completionStatus : ''}
                            {(rec.area === 'BAHASA_INDONESIA' || rec.area === 'ENGLISH_READING') ? `${(rec as any).wpm || 0} WPM` : ''}
                            {rec.area === 'NUMERACY' ? `${(rec as any).accuracy || 0}% Acc` : ''}
                          </span>
                          {(rec.area === 'BAHASA_INDONESIA' || rec.area === 'ENGLISH_READING') && (
                            <span className="text-[9px] text-slate-400 font-bold">
                              (Comp: {(rec as any).comprehensionScore === 'N/A' || (rec as any).comprehensionScore === null ? 'N/A' : `${(rec as any).comprehensionScore || 0}%`})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-[240px] truncate text-slate-500 italic text-[11px]">
                        {rec.notes ? `"${rec.notes}"` : '-'}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => handleStudentClick(rec)}
                          className="inline-flex items-center gap-1 hover:gap-2 text-indigo-600 hover:text-indigo-800 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          Lihat Riwayat
                          <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STUDENT HISTORY DRAWER WRAPPER */}
      {selectedStudent && (
        <StudentLiteracyHistoryDrawer
          isOpen={true}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          schoolYear={schoolYear}
          area={selectedStudent.area}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </div>
  );
}
