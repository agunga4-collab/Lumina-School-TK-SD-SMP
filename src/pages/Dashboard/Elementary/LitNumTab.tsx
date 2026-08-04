import * as React from 'react';
import { BookOpen, Check, AlertCircle, Sparkles, Filter } from 'lucide-react';
import { LiteracyNumeracyRecord, ElementaryClass, ElementaryStudent } from './types';

interface Props {
  literacyRecords: LiteracyNumeracyRecord[];
  classes: ElementaryClass[];
  students: ElementaryStudent[];
  todayPeriod: 'JUL_OCT' | 'NOV_FEB' | 'MAR_JUN';
}

export default function LitNumTab({
  literacyRecords,
  classes,
  students,
  todayPeriod
}: Props) {
  const [litNumPeriod, setLitNumPeriod] = React.useState<'JUL_OCT' | 'NOV_FEB' | 'MAR_JUN'>(todayPeriod);

  React.useEffect(() => {
    setLitNumPeriod(todayPeriod);
  }, [todayPeriod]);

  // --- STATS OVERVIEW FOR 4 AREAS ---
  const areaStats = React.useMemo(() => {
    const activePeriodRecs = literacyRecords.filter(rec => rec.period === litNumPeriod);

    const areas: ('BAHASA_INDONESIA' | 'ENGLISH_READING' | 'MENGAJI' | 'NUMERACY')[] = [
      'BAHASA_INDONESIA', 'ENGLISH_READING', 'MENGAJI', 'NUMERACY'
    ];

    const areaLabels: Record<string, string> = {
      'BAHASA_INDONESIA': 'Bahasa Indonesia',
      'ENGLISH_READING': 'English Reading',
      'MENGAJI': 'Mengaji',
      'NUMERACY': 'Numeracy'
    };

    return areas.map(area => {
      const areaRecords = activePeriodRecs.filter(r => r.area === area);
      
      // Get latest record per student
      const latestMap = new Map<string, any>();
      areaRecords.forEach(rec => {
        const existing = latestMap.get(rec.studentId);
        if (!existing || rec.updatedAt > existing.updatedAt) {
          latestMap.set(rec.studentId, rec);
        }
      });
      const uniqueRecords = Array.from(latestMap.values());

      const assessedCount = uniqueRecords.length;
      const onTrackCount = uniqueRecords.filter(r => r.supportStatus === 'ON_TRACK').length;
      const needsSupportCount = uniqueRecords.filter(r => 
        ['MONITOR', 'NEEDS_SUPPORT', 'INTERVENTION_RECOMMENDED'].includes(r.supportStatus)
      ).length;

      const onTrackRate = assessedCount > 0 ? Math.round((onTrackCount / assessedCount) * 100) : 0;
      const needsSupportRate = assessedCount > 0 ? Math.round((needsSupportCount / assessedCount) * 100) : 0;

      return {
        area,
        label: areaLabels[area],
        assessedCount,
        onTrackRate,
        needsSupportRate
      };
    });
  }, [literacyRecords, litNumPeriod]);

  // --- CLASS BREAKDOWN TABLE ---
  const classBreakdown = React.useMemo(() => {
    return classes.map(cls => {
      const clsStudents = students.filter(s => s.classId === cls.id || s.className === cls.name);
      const clsRecs = literacyRecords.filter(rec => {
        const matchesPeriod = rec.period === litNumPeriod;
        const matchesClass = rec.classId === cls.id || rec.classId === cls.name;
        return matchesPeriod && matchesClass;
      });

      // Assessed students count
      const assessedIds = new Set(clsRecs.map(rec => rec.studentId));
      const assessedCount = assessedIds.size;
      const assessedRate = clsStudents.length > 0 ? Math.round((assessedCount / clsStudents.length) * 100) : 0;

      // Unique latest assessments
      const latestMap = new Map<string, any>();
      clsRecs.forEach(rec => {
        const key = `${rec.studentId}_${rec.area}`;
        const existing = latestMap.get(key);
        if (!existing || rec.updatedAt > existing.updatedAt) {
          latestMap.set(key, rec);
        }
      });
      const uniqueRecs = Array.from(latestMap.values());
      const totalUnique = uniqueRecs.length;

      const onTrackCount = uniqueRecs.filter(r => r.supportStatus === 'ON_TRACK').length;
      const needsSupportCount = uniqueRecs.filter(r => 
        ['MONITOR', 'NEEDS_SUPPORT', 'INTERVENTION_RECOMMENDED'].includes(r.supportStatus)
      ).length;

      const onTrackRate = totalUnique > 0 ? Math.round((onTrackCount / totalUnique) * 100) : 0;
      const needsSupportRate = totalUnique > 0 ? Math.round((needsSupportCount / totalUnique) * 100) : 0;

      return {
        ...cls,
        studentCount: clsStudents.length,
        assessedCount,
        assessedRate,
        onTrackRate,
        needsSupportRate
      };
    });
  }, [classes, students, literacyRecords, litNumPeriod]);

  return (
    <div className="space-y-6">
      {/* Period Selection Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-700">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Periode Asesmen:</span>
        </div>
        <div className="flex bg-slate-200/60 p-1 rounded-lg">
          {(['JUL_OCT', 'NOV_FEB', 'MAR_JUN'] as const).map((p) => {
            const isActive = litNumPeriod === p;
            const label = p === 'JUL_OCT' ? 'JUL - OKT (P1)' : p === 'NOV_FEB' ? 'NOP - PEB (P2)' : 'MAR - JUN (P3)';
            return (
              <button
                key={p}
                onClick={() => setLitNumPeriod(p)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition shadow-sm ${isActive ? 'bg-[#002366] text-white' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of 4 Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {areaStats.map((stat) => (
          <div key={stat.area} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                {stat.label}
              </span>
              <Sparkles className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-slate-400">Total Dinilai</h4>
              <p className="text-2xl font-extrabold text-slate-800">{stat.assessedCount} <span className="text-xs font-normal text-slate-400">siswa</span></p>
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-500" /> On Track
                </span>
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{stat.onTrackRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Butuh Dukungan
                </span>
                <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{stat.needsSupportRate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Class Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900 text-sm">Pemantauan Asesmen per Kelas</h3>
          <p className="text-xs text-slate-500">Persentase kemajuan input asesmen dan rasio performa siswa</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Nama Kelas</th>
                <th className="py-2.5 px-3">Homeroom Teacher</th>
                <th className="py-2.5 px-3 text-center">Siswa Roster</th>
                <th className="py-2.5 px-3 text-center">Rasio Terasesmen</th>
                <th className="py-2.5 px-3 text-center">On Track</th>
                <th className="py-2.5 px-3 text-center">Butuh Dukungan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classBreakdown.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-3 font-bold text-slate-800">Kelas {row.name}</td>
                  <td className="py-3 px-3 text-slate-600 font-medium">{row.homeroomTeacherName || '—'}</td>
                  <td className="py-3 px-3 text-center font-semibold text-slate-800">{row.studentCount}</td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-bold text-slate-700">{row.assessedCount} ({row.assessedRate}%)</span>
                      <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                        <div className="bg-[#002366] h-full rounded-full" style={{ width: `${row.assessedRate}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded text-[10px] border border-emerald-100">
                      {row.onTrackRate}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="bg-rose-50 text-rose-700 font-bold px-2.5 py-0.5 rounded text-[10px] border border-rose-100">
                      {row.needsSupportRate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
