import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, ChevronRight, AlertCircle, 
  User, TrendingUp, AlertTriangle, Layers,
  Activity, ShieldAlert, RefreshCw, FileText
} from 'lucide-react';
import { useNavigate, Link, useOutletContext } from 'react-router-dom';
import { cn, formatDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, getBehaviorNotifications, markBehaviorNotificationAsRead, getStudents, getClasses, getMTSSConcerns, getActiveStudents } from '../../lib/firebase.ts';
import { NewCaseForm } from '../../components/MTSS/BehaviorForms';
import type { MTSSCase, BehaviorNotification, Student, MTSSConcern, Class } from '../../types';

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
  const [showOnlyActive, setShowOnlyActive] = React.useState(false);
  
  // Data states
  const [cases, setCases] = React.useState<MTSSCase[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [concernsMap, setConcernsMap] = React.useState<Record<string, MTSSConcern[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadingConcerns, setLoadingConcerns] = React.useState(false);
  const [showNewCaseModal, setShowNewCaseModal] = React.useState(false);
  const [preselectedStudentId, setPreselectedStudentId] = React.useState<string | undefined>(undefined);
  const [notifications, setNotifications] = React.useState<BehaviorNotification[]>([]);

  // 1. Load initial base data (notifications and Junior High classes)
  React.useEffect(() => {
    if (!profile) return;
    const loadBaseData = async () => {
      try {
        const [notifsData, classesData] = await Promise.all([
          getBehaviorNotifications(profile.uid),
          getClasses()
        ]);
        setNotifications(notifsData || []);
        
        // Filter Junior High classes for active academic year
        const jhClasses = (classesData || []).filter(c => 
          c.unitId === 'JUNIOR_HIGH' && 
          c.academicYear === filters.academicYear && 
          c.status !== 'archived'
        );
        setClasses(jhClasses);

        // Auto-select first Junior High class if current classFilter is 'all' or empty
        if (jhClasses.length > 0 && (classFilter === 'all' || !classFilter)) {
          setClassFilter(jhClasses[0].id);
        }
      } catch (err) {
        console.error("Error loading register base data:", err);
      }
    };
    loadBaseData();
  }, [profile, filters.academicYear]);

  // 2. Load active students roster dynamically when classFilter, classes, or academicYear changes
  React.useEffect(() => {
    if (!profile || classes.length === 0) return;
    
    let active = true;
    const loadRoster = async () => {
      setLoading(true);
      try {
        let roster: Student[] = [];
        if (classFilter === 'all') {
          // Fetch all active students for this academic year
          const allActive = await getActiveStudents('all', filters.academicYear);
          if (active) {
            // Keep only Junior High students
            roster = (allActive || []).filter(s => {
              const belongsToJH = s.unitId === 'JUNIOR_HIGH' || 
                                  s.currentUnit === 'JUNIOR_HIGH' || 
                                  classes.some(c => c.id === s.classId || c.name === s.classId);
              return belongsToJH;
            });
          }
        } else {
          // Fetch active students for the selected class ID
          const classActive = await getActiveStudents(classFilter, filters.academicYear);
          if (active) {
            roster = classActive || [];
          }
        }

        if (active) {
          setStudents(roster);
        }
      } catch (err) {
        console.error("Error loading active student roster for behavior register:", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadRoster();
    return () => {
      active = false;
    };
  }, [profile, classFilter, classes, filters.academicYear]);

  // 3. Load cases from firestore matching the academic year
  React.useEffect(() => {
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
    }, (error) => {
      handleFirestoreError(error, 'list', 'behaviorCases');
    });

    return () => unsubscribe();
  }, [filters.academicYear]);

  // 4. Load concerns for visible cases to enrich columns with actual spreadsheet values
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

  // 5. Filter students based on selected filters (roster-first logic)
  const filteredStudents = React.useMemo(() => {
    return students.filter(s => {
      // 1. Search term (student name, nickname, or ID)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const nameMatch = s.name?.toLowerCase().includes(term);
        const nickMatch = s.nickname ? s.nickname.toLowerCase().includes(term) : false;
        const idMatch = s.id?.toLowerCase().includes(term);
        if (!nameMatch && !nickMatch && !idMatch) {
          return false;
        }
      }

      // 2. Grade filter
      if (gradeFilter !== 'all') {
        const sClass = classes.find(c => c.id === s.classId || c.name === s.classId);
        const gradeStr = sClass?.grade ? String(sClass.grade) : '';
        // Check both grade attribute and class ID prefixes
        if (gradeStr !== gradeFilter && !s.classId?.startsWith(gradeFilter)) {
          return false;
        }
      }

      // 3. Joined Behavior Case constraints (Tier, Status, Active Only)
      const studentCase = cases.find(c => 
        c.studentId === s.id && 
        (!filters.semester || !c.semester || String(c.semester) === String(filters.semester))
      );

      if (tierFilter !== 'all') {
        if (!studentCase || studentCase.tier !== tierFilter) {
          return false;
        }
      }

      if (statusFilter !== 'all') {
        if (!studentCase || studentCase.status !== statusFilter) {
          return false;
        }
      }

      if (showOnlyActive) {
        if (!studentCase || studentCase.status === 'CLOSED') {
          return false;
        }
      }

      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [students, classes, cases, searchTerm, gradeFilter, tierFilter, statusFilter, showOnlyActive, filters.semester]);

  // Calculate statistics based on Junior High scope
  const activeCasesList = cases.filter(c => 
    c.status !== 'CLOSED' && 
    students.some(s => s.id === c.studentId) &&
    (!filters.semester || !c.semester || String(c.semester) === String(filters.semester))
  );
  
  const totalActive = activeCasesList.length;
  const tier1Count = activeCasesList.filter(c => c.tier === 'Tier 1').length;
  const tier2Count = activeCasesList.filter(c => c.tier === 'Tier 2').length;
  const tier3Count = activeCasesList.filter(c => c.tier === 'Tier 3').length;
  const updatesNeededCount = activeCasesList.filter(c => (Date.now() - c.lastUpdatedAt) > (7 * 86400000)).length;

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Activity className="animate-pulse text-blue-600" size={48} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Loading Student Register</p>
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
            onClose={() => {
              setShowNewCaseModal(false);
              setPreselectedStudentId(undefined);
            }}
            initialStudentId={preselectedStudentId}
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
                <RefreshCw size={8} className="animate-spin" /> Syncing cases...
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">
            Operational Spreadsheet Registry • Junior High • TA {filters.academicYear} • Semester {filters.semester}
          </p>
        </div>
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
        <div className="bg-rose-50/75 border border-rose-100 rounded-xl px-4 py-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-wider text-rose-800 font-mono">Attention Alert:</span>
            <span className="text-xs font-semibold text-gray-700 line-clamp-1 italic">
              {notifications[0].title} — {notifications[0].message}
            </span>
          </div>
          <Link 
            to="/notifications" 
            className="text-[9px] font-black uppercase text-rose-700 hover:underline tracking-widest shrink-0 self-end md:self-auto"
          >
            Lihat Alerts ({notifications.length})
          </Link>
        </div>
      )}

      {/* Dense Advanced Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm space-y-2">
        <div className="flex flex-col lg:flex-row gap-2">
          {/* Search bar */}
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={14} />
            <input
              type="text"
              placeholder="Cari nama siswa, kelas, or ID..."
              className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none transition-all font-semibold text-xs h-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Class filter */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg border border-transparent h-8">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Class</span>
              <select 
                className="bg-transparent py-0.5 outline-none text-[10px] font-black text-gray-700 cursor-pointer uppercase tracking-wider"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="all">ALL CLASSES</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Grade filter */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg border border-transparent h-8">
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

            {/* Tier Selector */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg border border-transparent h-8">
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
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg border border-transparent h-8">
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
            <label className="flex items-center gap-1.5 h-8 px-2.5 bg-gray-50 rounded-lg select-none hover:bg-gray-100 transition-colors cursor-pointer">
              <input 
                type="checkbox" 
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
                className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">
                Cases Only
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
                <th className="w-[180px] px-4 py-2.5">Nama Siswa</th>
                <th className="w-[80px] px-2 py-2.5 text-center">NIS</th>
                <th className="w-[80px] px-2 py-2.5 text-center">Kelas</th>
                <th className="w-[130px] px-2 py-2.5">Status Kasus / Tier</th>
                <th className="w-[250px] px-3 py-2.5">Concern Terakhir</th>
                <th className="w-[180px] px-3 py-2.5">Intervensi Terakhir</th>
                <th className="w-[180px] px-3 py-2.5">Progress Terakhir</th>
                <th className="w-[180px] px-3 py-2.5">Next Step</th>
                <th className="w-[130px] px-3 py-2.5">PJ / Responsible</th>
                <th className="w-[110px] px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student, idx) => {
                // Find matching active behavior case
                const studentCase = cases.find(c => 
                  c.studentId === student.id && 
                  (!filters.semester || !c.semester || String(c.semester) === String(filters.semester))
                );

                const studentClass = classes.find(cl => cl.id === student.classId);
                const className = studentClass ? studentClass.name : student.classId;

                const cConcerns = studentCase ? (concernsMap[studentCase.id] || []) : [];
                const latestConcern = cConcerns[0];

                const hasActiveCase = !!studentCase;

                // Behavior details fallbacks
                const concernDesc = studentCase 
                  ? (latestConcern?.description || studentCase.lastConcernSummary || 'No concern description logged')
                  : null;
                const interventionsTried = studentCase 
                  ? (latestConcern?.interventionsTried?.length ? latestConcern.interventionsTried : [])
                  : [];
                const progressNotes = studentCase 
                  ? (latestConcern?.progressNotes || 'No progress notes logged')
                  : null;
                const nextStep = studentCase 
                  ? (latestConcern?.nextSteps || 'No next steps assigned')
                  : null;
                const personResponsible = studentCase 
                  ? (latestConcern?.nextStepPicName || latestConcern?.reporterName || studentCase.picName || 'Unassigned')
                  : null;
                
                const updatedTime = studentCase 
                  ? (latestConcern?.createdAt || studentCase.lastUpdatedAt)
                  : null;

                return (
                  <motion.tr
                    key={student.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.012, 0.2) }}
                    className={cn(
                      "transition-colors group align-top border-b border-gray-50",
                      hasActiveCase ? "bg-amber-50/5 hover:bg-amber-50/15" : "hover:bg-slate-50/50"
                    )}
                  >
                    {/* Nama Siswa */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-6 h-6 rounded flex items-center justify-center font-black text-[9px] uppercase tracking-tighter shrink-0 border",
                          hasActiveCase 
                            ? "bg-amber-50 text-amber-700 border-amber-200" 
                            : "bg-blue-50 text-blue-700 border-blue-100"
                        )}>
                          {student.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-gray-900 tracking-tight leading-snug truncate text-xs" title={student.name}>
                            {student.name}
                          </p>
                          {student.nickname && (
                            <span className="text-[9px] text-gray-400 font-bold tracking-tight">
                              ({student.nickname})
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* NIS */}
                    <td className="px-2 py-2.5 text-center">
                      <span className="font-mono text-[9px] font-bold text-gray-500">
                        {student.id.slice(0, 8)}
                      </span>
                    </td>

                    {/* Kelas */}
                    <td className="px-2 py-2.5 text-center">
                      <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-bold text-[9px] uppercase tracking-wider border border-slate-200">
                        {className}
                      </span>
                    </td>

                    {/* Status Kasus / Tier */}
                    <td className="px-2 py-2.5 space-y-1">
                      {studentCase ? (
                        <>
                          <div>
                            <span className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                              studentCase.tier === 'Tier 1' ? "bg-green-50 text-green-700 border-green-200" :
                              studentCase.tier === 'Tier 2' ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-red-50 text-red-700 border-red-200"
                            )}>
                              {studentCase.tier}
                            </span>
                          </div>
                          <div>
                            <span className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider border",
                              studentCase.status === 'OPEN' ? "bg-blue-50 text-blue-700 border-blue-200" :
                              studentCase.status === 'IN_PROGRESS' ? "bg-yellow-50 text-yellow-800 border-yellow-200" :
                              studentCase.status === 'ESCALATED' ? "bg-orange-50 text-orange-700 border-orange-200" :
                              studentCase.status === 'UNDER_REVIEW' ? "bg-purple-50 text-purple-700 border-purple-200" :
                              "bg-gray-100 text-gray-600 border-gray-200"
                            )}>
                              {studentCase.status.replace('_', ' ')}
                            </span>
                          </div>
                        </>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[7.5px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border border-gray-100">
                          Belum ada kasus
                        </span>
                      )}
                    </td>

                    {/* Concern Terakhir */}
                    <td className="px-3 py-2.5">
                      {concernDesc ? (
                        <p className="text-[10.5px] text-gray-600 font-medium leading-relaxed line-clamp-2 italic pr-1" title={concernDesc}>
                          "{concernDesc}"
                        </p>
                      ) : (
                        <span className="text-[9px] text-gray-300 font-bold">—</span>
                      )}
                    </td>

                    {/* Intervensi Terakhir */}
                    <td className="px-3 py-2.5">
                      {interventionsTried.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-h-[45px] overflow-y-auto pr-1 no-scrollbar">
                          {interventionsTried.map((item, i) => (
                            <span 
                              key={i} 
                              className="px-1 py-0.5 bg-blue-50 text-blue-800 border border-blue-100/50 rounded text-[8px] font-bold uppercase tracking-wide"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-gray-300 font-bold">—</span>
                      )}
                    </td>

                    {/* Progress Terakhir */}
                    <td className="px-3 py-2.5">
                      {progressNotes ? (
                        <p className="text-[10px] text-gray-500 font-medium leading-relaxed line-clamp-2 italic pr-1" title={progressNotes}>
                          {progressNotes}
                        </p>
                      ) : (
                        <span className="text-[9px] text-gray-300 font-bold">—</span>
                      )}
                    </td>

                    {/* Next Step */}
                    <td className="px-3 py-2.5">
                      {nextStep ? (
                        <p className="text-[10px] text-gray-700 font-bold leading-relaxed line-clamp-2 pr-1" title={nextStep}>
                          {nextStep}
                        </p>
                      ) : (
                        <span className="text-[9px] text-gray-300 font-bold">—</span>
                      )}
                    </td>

                    {/* PJ / Responsible */}
                    <td className="px-3 py-2.5">
                      {personResponsible ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-black text-[8px] uppercase tracking-tighter shrink-0">
                            {personResponsible.split(' ').map(n => n[0]).slice(0, 2).join('')}
                          </div>
                          <span className="text-[10px] font-bold text-gray-600 truncate max-w-[85px]" title={personResponsible}>
                            {personResponsible}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-gray-300 font-bold">—</span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/junior-high/behavior/mtss/spreadsheet?studentId=${student.id}&classId=${classFilter}`}
                          className="inline-flex items-center gap-1 border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap"
                          title="Buka Spreadsheet CICO"
                        >
                          CICO Sheet
                        </Link>
                        {hasActiveCase ? (
                          <>
                            <Link
                              to={`/junior-high/behavior/mtss/cases/${studentCase.id}`}
                              className="inline-flex items-center gap-0.5 bg-[#002366] hover:bg-blue-800 text-white px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 whitespace-nowrap"
                            >
                              View Log
                              <ChevronRight size={10} />
                            </Link>
                            <Link
                              to={`/junior-high/behavior/mtss/cases/${studentCase.id}?addConcern=true`}
                              className="inline-flex items-center gap-1 border border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50/50 text-blue-600 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 whitespace-nowrap cursor-pointer"
                            >
                              <Plus size={10} />
                              Lapor
                            </Link>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setPreselectedStudentId(student.id);
                              setShowNewCaseModal(true);
                            }}
                            className="inline-flex items-center gap-1 border border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50/50 text-blue-600 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 whitespace-nowrap cursor-pointer"
                          >
                            <Plus size={10} />
                            Lapor
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredStudents.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="text-xs font-black text-gray-900 italic tracking-tighter uppercase">No students matched</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 px-12 max-w-md leading-relaxed">
                Tidak ditemukan data siswa yang sesuai dengan filter pencarian atau parameter kelas SMP saat ini.
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
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
