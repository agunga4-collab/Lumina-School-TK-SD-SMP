import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, ChevronRight, AlertCircle, 
  User, TrendingUp, AlertTriangle, Layers,
  Activity, ShieldAlert, RefreshCw
} from 'lucide-react';
import { useNavigate, Link, useOutletContext } from 'react-router-dom';
import { cn, formatDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, getBehaviorNotifications, markBehaviorNotificationAsRead, getStudents, getMTSSConcerns } from '../../lib/firebase.ts';
import { NewCaseForm } from '../../components/MTSS/BehaviorForms';
import type { MTSSCase, BehaviorNotification, Student, MTSSConcern } from '../../types';

export default function CaseList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: any; setFilters: any }>();
  
  // Local filter states
  const [searchTerm, setSearchTerm] = React.useState('');
  const [gradeFilter, setGradeFilter] = React.useState<string>('all');
  const [classFilter, setClassFilter] = React.useState<string>('all');
  const [tierFilter, setTierFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [showOnlyActive, setShowOnlyActive] = React.useState(true);
  
  // Data states
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [concernsMap, setConcernsMap] = React.useState<Record<string, MTSSConcern[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadingConcerns, setLoadingConcerns] = React.useState(false);
  const [showNewCaseModal, setShowNewCaseModal] = React.useState(false);
  const [notifications, setNotifications] = React.useState<BehaviorNotification[]>([]);

  // Load notifications and student database
  React.useEffect(() => {
    if (!profile) return;
    const loadData = async () => {
      const [notifsData, studentsData] = await Promise.all([
        getBehaviorNotifications(profile.uid),
        getStudents()
      ]);
      setNotifications(notifsData || []);
      setStudents(studentsData || []);
    };
    loadData();
  }, [profile]);

  // Load cases from firestore matching the academic year
  React.useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'behaviorCases'),
      where('academicYear', '==', filters.academicYear)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MTSSCase[];
      
      const sortedCases = [...casesData].sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
      setCases(sortedCases);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', 'behaviorCases');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filters.academicYear]);

  // Load concerns for visible cases to enrich columns with actual spreadsheet values
  React.useEffect(() => {
    if (cases.length === 0) {
      setConcernsMap({});
      return;
    }

    let active = true;
    const fetchAllConcerns = async () => {
      setLoadingConcerns(true);
      try {
        const tempMap: Record<string, MTSSConcern[]> = {};
        await Promise.all(
          cases.map(async (c) => {
            const list = await getMTSSConcerns(c.id);
            if (list) {
              tempMap[c.id] = list;
            }
          })
        );
        if (active) {
          setConcernsMap(tempMap);
        }
      } catch (err) {
        console.error("Failed to load behavior concerns for register:", err);
      } finally {
        if (active) {
          setLoadingConcerns(false);
        }
      }
    };

    fetchAllConcerns();
    return () => {
      active = false;
    };
  }, [cases]);

  // Derive unique classes from students & cases for the class filter
  const uniqueClasses = React.useMemo(() => {
    const classesSet = new Set<string>();
    cases.forEach(c => {
      if (c.classId) {
        classesSet.add(c.classId);
      }
    });
    students.forEach(s => {
      if (s.classId) {
        classesSet.add(s.classId);
      }
    });
    return Array.from(classesSet).sort();
  }, [cases, students]);

  // Calculate statistics for the compact metrics strip
  const totalActive = cases.filter(c => c.status !== 'CLOSED').length;
  const tier1Count = cases.filter(c => c.tier === 'Tier 1' && c.status !== 'CLOSED').length;
  const tier2Count = cases.filter(c => c.tier === 'Tier 2' && c.status !== 'CLOSED').length;
  const tier3Count = cases.filter(c => c.tier === 'Tier 3' && c.status !== 'CLOSED').length;
  const updatesNeededCount = cases.filter(c => c.status !== 'CLOSED' && (Date.now() - c.lastUpdatedAt) > (7 * 86400000)).length;

  // Filter cases based on search and selected options
  const filteredCases = cases.filter(c => {
    const student = students.find(s => s.id === c.studentId);
    
    // Name search
    const matchSearch = 
      c.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (student?.nickname && student.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      c.classId.toLowerCase().includes(searchTerm.toLowerCase());
      
    // Grade filter (7, 8, 9)
    const matchGrade = gradeFilter === 'all' || c.classId.startsWith(gradeFilter);
    
    // Class filter
    const matchClass = classFilter === 'all' || c.classId === classFilter;
    
    // Tier filter
    const matchTier = tierFilter === 'all' || c.tier === tierFilter;
    
    // Status filter
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    
    // Active case filter
    const matchActive = !showOnlyActive || c.status !== 'CLOSED';

    // Semester filter (if defined in case)
    const matchSemester = !filters.semester || !c.semester || String(c.semester) === String(filters.semester);
    
    return matchSearch && matchGrade && matchClass && matchTier && matchStatus && matchActive && matchSemester;
  });

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Activity className="animate-pulse text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Loading Behavior Register</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Modals */}
      <AnimatePresence>
        {showNewCaseModal && (
          <NewCaseForm 
            isOpen={showNewCaseModal} 
            onClose={() => setShowNewCaseModal(false)}
            onSuccess={(id) => navigate(`/junior-high/behavior/mtss/cases/${id}`)}
          />
        )}
      </AnimatePresence>

      {/* Highly Compact Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight flex items-center gap-2">
              <ShieldAlert className="text-blue-900" size={20} />
              Behavior <span className="text-blue-600">Intervention Register</span>
            </h2>
            {loadingConcerns && (
              <span className="flex items-center gap-1 text-[9px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md">
                <RefreshCw size={8} className="animate-spin" /> Loading logs...
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
            spreadsheet registry matrix • TA {filters.academicYear} • Semester {filters.semester}
          </p>
        </div>
        
        <button
          onClick={() => setShowNewCaseModal(true)}
          className="flex items-center gap-2 bg-[#002366] hover:bg-blue-800 text-white px-4 py-2 rounded-xl font-black transition-all shadow-sm active:scale-95 text-[10px] uppercase tracking-widest shrink-0"
        >
          <Plus size={14} />
          Lapor Kasus Baru
        </button>
      </div>

      {/* Extreme Compact Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold text-slate-700">
        <div className="flex items-center gap-2 px-2">
          <TrendingUp size={14} className="text-blue-600 shrink-0" />
          <span>Active Cases:</span>
          <span className="text-blue-700 font-black text-sm">{totalActive}</span>
        </div>
        
        <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-x border-slate-200 px-2 py-1.5 sm:py-0">
          <Layers size={14} className="text-amber-600 shrink-0" />
          <span className="mr-1">Tiers:</span>
          <span className="flex gap-2">
            <span className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded font-black text-[10px]">T1: {tier1Count}</span>
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-black text-[10px]">T2: {tier2Count}</span>
            <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded font-black text-[10px]">T3: {tier3Count}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 px-2 justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-600 shrink-0" />
            <span>Attention needed:</span>
            <span className="text-rose-700 font-black text-sm">{updatesNeededCount}</span>
          </div>
          <span className="text-[9px] text-slate-400 font-normal italic uppercase font-mono hidden lg:inline">(&gt; 7 days stale)</span>
        </div>
      </div>

      {/* Perlu Perhatian Hari Ini (Compact Notification alert bar) */}
      {notifications.length > 0 && (
        <div className="bg-rose-50/75 border border-rose-100 rounded-xl px-4 py-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 font-mono">Attention Alert:</span>
            <span className="text-xs font-bold text-gray-700 line-clamp-1 italic">
              {notifications[0].title} — {notifications[0].message}
            </span>
          </div>
          <Link 
            to="/notifications" 
            className="text-[9px] font-black uppercase text-rose-700 hover:underline tracking-widest shrink-0 self-end md:self-auto"
          >
            Lihat Semua Alerts ({notifications.length})
          </Link>
        </div>
      )}

      {/* Dense Advanced Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={16} />
            <input
              type="text"
              placeholder="Cari nama siswa, kelas, or behavior concern..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all font-semibold text-xs h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Grade filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-transparent h-9">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Grade</span>
              <select 
                className="bg-transparent py-0.5 outline-none text-[10px] font-black text-gray-700 cursor-pointer uppercase tracking-wider"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
              >
                <option value="all">ALL</option>
                <option value="7">7</option>
                <option value="8">8</option>
                <option value="9">9</option>
              </select>
            </div>

            {/* Class filter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-transparent h-9">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Class</span>
              <select 
                className="bg-transparent py-0.5 outline-none text-[10px] font-black text-gray-700 cursor-pointer uppercase tracking-wider"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="all">ALL</option>
                {uniqueClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Tier Selector */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-transparent h-9">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Tier</span>
              <select 
                className="bg-transparent py-0.5 outline-none text-[10px] font-black text-gray-700 cursor-pointer uppercase tracking-wider"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
              >
                <option value="all">ALL</option>
                <option value="Tier 1">Tier 1</option>
                <option value="Tier 2">Tier 2</option>
                <option value="Tier 3">Tier 3</option>
              </select>
            </div>

            {/* Status Selector */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-transparent h-9">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Status</span>
              <select 
                className="bg-transparent py-0.5 outline-none text-[10px] font-black text-gray-700 cursor-pointer uppercase tracking-wider"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">ALL</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN PROGRESS</option>
                <option value="ESCALATED">ESCALATED</option>
                <option value="UNDER_REVIEW">UNDER REVIEW</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>

            {/* Active only checkbox */}
            <label className="flex items-center gap-2 cursor-pointer h-9 px-3 bg-gray-50 rounded-xl select-none hover:bg-gray-100 transition-colors">
              <input 
                type="checkbox" 
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">
                Active Only
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Operational Spreadsheet Table - Directly Visible Immediately */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[1300px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[9px] font-black text-gray-400 uppercase tracking-widest sticky top-0 bg-white z-10">
                <th className="w-[180px] px-4 py-3">Student Name</th>
                <th className="w-[80px] px-2 py-3 text-center">Class</th>
                <th className="w-[130px] px-2 py-3">Tier / Status</th>
                <th className="w-[250px] px-3 py-3">Latest Behavior Concern</th>
                <th className="w-[180px] px-3 py-3">Interventions Tried</th>
                <th className="w-[180px] px-3 py-3">Latest Progress</th>
                <th className="w-[180px] px-3 py-3">Next Step</th>
                <th className="w-[130px] px-3 py-3">Responsible</th>
                <th className="w-[100px] px-2 py-3 text-center">Last Update</th>
                <th className="w-[90px] px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCases.map((c, idx) => {
                const cConcerns = concernsMap[c.id] || [];
                const latestConcern = cConcerns[0];

                // Direct or fallback maps matching XLSX layout Logic
                const concernDesc = latestConcern?.description || c.lastConcernSummary || 'No concern recorded';
                const interventionsTried = latestConcern?.interventionsTried?.length 
                  ? latestConcern.interventionsTried 
                  : [];
                const progressNotes = latestConcern?.progressNotes || 'No progress notes logged';
                const nextStep = latestConcern?.nextSteps || 'No next steps assigned';
                const personResponsible = latestConcern?.nextStepPicName || latestConcern?.reporterName || c.picName || 'Unassigned';
                
                const updatedTime = latestConcern?.createdAt || c.lastUpdatedAt;

                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.015, 0.3) }}
                    className="hover:bg-blue-50/20 transition-colors group align-top border-b border-gray-50"
                  >
                    {/* Student Name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-black text-[10px] uppercase tracking-tighter shrink-0 border border-blue-100">
                          {c.studentName.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-gray-900 tracking-tight leading-snug truncate text-xs" title={c.studentName}>
                            {c.studentName}
                          </p>
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                            ID: {c.studentId.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Class */}
                    <td className="px-2 py-3.5 text-center">
                      <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded font-bold text-[9px] uppercase tracking-wider border border-gray-200">
                        {c.classId}
                      </span>
                    </td>

                    {/* Active Tier / Status */}
                    <td className="px-2 py-3.5 space-y-1">
                      <div>
                        <span className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                          c.tier === 'Tier 1' ? "bg-green-50 text-green-700 border-green-200" :
                          c.tier === 'Tier 2' ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-red-50 text-red-700 border-red-200"
                        )}>
                          {c.tier}
                        </span>
                      </div>
                      <div>
                        <span className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                          c.status === 'OPEN' ? "bg-blue-50 text-blue-700 border-blue-200" :
                          c.status === 'IN_PROGRESS' ? "bg-yellow-50 text-yellow-800 border-yellow-200" :
                          c.status === 'ESCALATED' ? "bg-orange-50 text-orange-700 border-orange-200" :
                          c.status === 'UNDER_REVIEW' ? "bg-purple-50 text-purple-700 border-purple-200" :
                          "bg-gray-100 text-gray-600 border-gray-200"
                        )}>
                          {c.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>

                    {/* Latest Behavior Concern */}
                    <td className="px-3 py-3.5">
                      <p className="text-[11px] text-gray-600 font-medium leading-relaxed line-clamp-3 italic pr-1" title={concernDesc}>
                        "{concernDesc}"
                      </p>
                    </td>

                    {/* Latest Intervention Tried */}
                    <td className="px-3 py-3.5">
                      {interventionsTried.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto pr-1 no-scrollbar">
                          {interventionsTried.map((item, i) => (
                            <span 
                              key={i} 
                              className="px-1 py-0.5 bg-blue-50/75 text-blue-800 border border-blue-100/50 rounded text-[8px] font-bold uppercase tracking-wide"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-gray-400 font-bold italic uppercase tracking-wider">None logged</span>
                      )}
                    </td>

                    {/* Latest Progress */}
                    <td className="px-3 py-3.5">
                      <p className="text-[10px] text-gray-500 font-medium leading-relaxed line-clamp-3 italic pr-1" title={progressNotes}>
                        {progressNotes}
                      </p>
                    </td>

                    {/* Next Step */}
                    <td className="px-3 py-3.5">
                      <p className="text-[10px] text-gray-700 font-bold leading-relaxed line-clamp-3 pr-1" title={nextStep}>
                        {nextStep}
                      </p>
                    </td>

                    {/* Person Responsible */}
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600 font-black text-[8px] uppercase tracking-tighter shrink-0">
                          {personResponsible.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        <span className="text-[10px] font-bold text-gray-600 truncate max-w-[90px]" title={personResponsible}>
                          {personResponsible}
                        </span>
                      </div>
                    </td>

                    {/* Last Update */}
                    <td className="px-2 py-3.5 text-center">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                        {formatDate(updatedTime.toString())}
                      </span>
                    </td>

                    {/* View Full Log Action Button */}
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        to={`/junior-high/behavior/mtss/cases/${c.id}`}
                        className="inline-flex items-center gap-0.5 bg-[#002366] hover:bg-blue-800 text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 whitespace-nowrap"
                      >
                        View Log
                        <ChevronRight size={10} />
                      </Link>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredCases.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="text-xs font-black text-gray-900 italic tracking-tighter uppercase">No students matched</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 px-12 max-w-md leading-relaxed">
                Tidak ditemukan data register perilaku siswa yang sesuai dengan filter pencarian atau parameter semester saat ini.
              </p>
            </div>
            <button 
              onClick={() => {
                setSearchTerm('');
                setGradeFilter('all');
                setClassFilter('all');
                setTierFilter('all');
                setStatusFilter('all');
                setShowOnlyActive(false);
              }}
              className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
