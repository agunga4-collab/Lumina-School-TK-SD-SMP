import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronRight, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  Download,
  FilterX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  getMTSSAcademicCases, 
  getStudents, 
  getClasses,
  addMTSSAcademicCase 
} from '../../lib/firebase';
import { mtssAcademicBackupService } from '../../services/mtssAcademicBackupService';
import { 
  MTSSAcademicCase, 
  Student, 
  Class, 
  MTSSAcademicTier, 
  MTSSAcademicStatus,
  MTSSAcademicDomain
} from '../../types';
import { format } from 'date-fns';

import StudentSearch from '../../components/StudentSearch';

const DOMAINS: { value: MTSSAcademicDomain; label: string; color: string }[] = [
  { value: 'ENGLISH', label: 'English', color: 'bg-blue-100 text-blue-700' },
  { value: 'NUMERACY', label: 'Numeracy', color: 'bg-amber-100 text-amber-700' },
  { value: 'BAHASA_INDONESIA', label: 'Bahasa Indonesia', color: 'bg-red-100 text-red-700' },
];

const TIER_COLORS: Record<MTSSAcademicTier, string> = {
  'Tier 1': 'bg-slate-100 text-slate-700',
  'Tier 2': 'bg-orange-100 text-orange-700',
  'Tier 3': 'bg-rose-100 text-rose-700',
};

const STATUS_CONFIG: Record<MTSSAcademicStatus, { label: string; color: string; icon: any }> = {
  'SCREENING': { label: 'Screening', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: Search },
  'INITIAL_MEETING': { label: 'Initial Meeting', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: Clock },
  'ACTIVE': { label: 'Active', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: TrendingUp },
  'UNDER_REVIEW': { label: 'Under Review', color: 'bg-violet-50 text-violet-600 border-violet-200', icon: AlertCircle },
  'ESCALATED': { label: 'Escalated', color: 'bg-rose-50 text-rose-600 border-rose-200', icon: AlertCircle },
  'CLOSED': { label: 'Closed', color: 'bg-slate-50 text-slate-600 border-slate-200', icon: CheckCircle2 },
};

export default function CaseList() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<MTSSAcademicCase[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Filters
  const [filterTier, setFilterTier] = useState<MTSSAcademicTier | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<MTSSAcademicStatus | 'ALL'>('ALL');
  const [filterDomain, setFilterDomain] = useState<MTSSAcademicDomain | 'ALL'>('ALL');
  const [filterClass, setFilterClass] = useState<string>('ALL');

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [casesData, studentsData, classesData] = await Promise.all([
        getMTSSAcademicCases({
          schoolUnit: 'JUNIOR_HIGH',
          academicYear: '2023/2024' // Should be dynamic
        }),
        getStudents(),
        getClasses()
      ]);
      setCases(casesData || []);
      setStudents(studentsData || []);
      setClasses(classesData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = c.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         c.primaryConcern.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = filterTier === 'ALL' || c.currentTier === filterTier;
    const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus;
    const matchesDomain = filterDomain === 'ALL' || c.subjectDomains.includes(filterDomain as MTSSAcademicDomain);
    const matchesClass = filterClass === 'ALL' || c.classId === filterClass;
    
    return matchesSearch && matchesTier && matchesStatus && matchesDomain && matchesClass;
  });

  const clearFilters = () => {
    setFilterTier('ALL');
    setFilterStatus('ALL');
    setFilterDomain('ALL');
    setFilterClass('ALL');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase italic">Academic <span className="text-emerald-600">Case Monitoring</span></h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5 font-mono">Real-time Students Academic Progress</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchData()}
            className="p-2.5 bg-white text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-gray-100 transition-all shadow-sm active:scale-95"
            title="Refresh Data"
          >
            <Download size={18} />
          </button>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 font-bold text-xs uppercase tracking-widest"
          >
            <Plus size={16} />
            <span>New Academic Case</span>
          </button>
        </div>
      </div>



      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard 
          label="Total Active Cases" 
          value={cases.filter(c => c.status !== 'CLOSED').length} 
          icon={<TrendingUp className="text-indigo-600" />}
          color="bg-indigo-50"
        />
        <StatCard 
          label="Tier 3 (Intensive)" 
          value={cases.filter(c => c.currentTier === 'Tier 3' && c.status !== 'CLOSED').length} 
          icon={<AlertCircle className="text-rose-600" />}
          color="bg-rose-50"
        />
        <StatCard 
          label="In Screening" 
          value={cases.filter(c => c.status === 'SCREENING').length} 
          icon={<Search className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard 
          label="Under Review" 
          value={cases.filter(c => c.status === 'UNDER_REVIEW').length} 
          icon={<Clock className="text-amber-600" />}
          color="bg-amber-50"
        />
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search by student name or concern..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                showFilters || filterTier !== 'ALL' || filterStatus !== 'ALL' || filterDomain !== 'ALL' || filterClass !== 'ALL'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter size={18} />
              <span>Filters</span>
              {(filterTier !== 'ALL' || filterStatus !== 'ALL' || filterDomain !== 'ALL' || filterClass !== 'ALL') && (
                <span className="ml-1 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full">
                  {[filterTier, filterStatus, filterDomain, filterClass].filter(f => f !== 'ALL').length}
                </span>
              )}
            </button>
            {(filterTier !== 'ALL' || filterStatus !== 'ALL' || filterDomain !== 'ALL' || filterClass !== 'ALL' || searchQuery) && (
              <button 
                onClick={clearFilters}
                className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title="Clear all filters"
              >
                <FilterX size={18} />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 mt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Tier</label>
                  <select 
                    value={filterTier}
                    onChange={(e) => setFilterTier(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                  >
                    <option value="ALL">All Tiers</option>
                    <option value="Tier 1">Tier 1</option>
                    <option value="Tier 2">Tier 2</option>
                    <option value="Tier 3">Tier 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                  >
                    <option value="ALL">All Status</option>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Domain</label>
                  <select 
                    value={filterDomain}
                    onChange={(e) => setFilterDomain(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                  >
                    <option value="ALL">All Domains</option>
                    {DOMAINS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Class</label>
                  <select 
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                  >
                    <option value="ALL">All Classes</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Case Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 font-medium animate-pulse">Loading academic cases...</p>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-4">
              <TrendingUp size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No cases found</h3>
            <p className="text-slate-500 max-w-sm mx-auto">
              {searchQuery || showFilters 
                ? "No cases match your current filter criteria. Try adjusting your search." 
                : "There are no academic cases registered for this school unit and academic year."}
            </p>
            {(searchQuery || showFilters) && (
              <button 
                onClick={clearFilters}
                className="mt-4 text-indigo-600 font-medium hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student & Class</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tier & Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Domains</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.map((c) => (
                  <tr 
                    key={c.id} 
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/junior-high/academic/mtss/cases/${c.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-sm">
                          {c.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{c.studentName}</p>
                          <p className="text-xs text-slate-500">{c.className}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider w-fit ${TIER_COLORS[c.currentTier]}`}>
                          {c.currentTier}
                        </span>
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border w-fit ${STATUS_CONFIG[c.status].color}`}>
                          {React.createElement(STATUS_CONFIG[c.status].icon, { size: 12 })}
                          {STATUS_CONFIG[c.status].label}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.subjectDomains.map(d => {
                          const config = DOMAINS.find(dom => dom.value === d);
                          return (
                            <span key={d} className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${config?.color || 'bg-slate-100 text-slate-700'}`}>
                              {config?.label || d}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-slate-400 group-hover:text-indigo-400 font-medium flex items-center gap-1">
                          View Detail <ChevronRight size={14} />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal - Placeholder for now */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateCaseModal 
            onClose={() => setIsCreateModalOpen(false)} 
            students={students}
            onSuccess={() => {
              setIsCreateModalOpen(false);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function CreateCaseModal({ onClose, students, onSuccess }: { onClose: () => void; students: Student[]; onSuccess: () => void }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    studentId: '',
    subjectDomains: [] as MTSSAcademicDomain[],
    primaryConcern: '',
    sourceType: 'TEACHER_REFERRAL' as 'SCREENING' | 'TEACHER_REFERRAL' | 'DATA_REVIEW',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studentId || formData.subjectDomains.length === 0 || !formData.primaryConcern) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const student = students.find(s => s.id === formData.studentId);
      if (!student) throw new Error('Student not found');

      const newCaseId = await addMTSSAcademicCase({
        schoolUnit: 'JUNIOR_HIGH',
        academicYear: '2023/2024',
        semester: '1',
        studentId: student.id,
        studentName: student.name,
        classId: student.classId || 'N/A',
        className: 'Class ' + (student.classId || 'N/A'), // Mocking class name
        homeroomTeacherId: currentUser?.uid || '',
        subjectDomains: formData.subjectDomains,
        primaryConcern: formData.primaryConcern,
        currentTier: 'Tier 1',
        status: 'SCREENING',
        sourceType: formData.sourceType,
        assignedTeacherIds: [currentUser?.uid || ''],
        assignedSubjectTeacherIds: [],
        assignedCounselorIds: [],
        parentMeetingStatus: 'NOT_STARTED',
        parentCommitmentStatus: 'NOT_SENT',
        latestDecision: null,
        closedAt: null
      });

      // Trigger Backup Sync
      if (newCaseId) {
        mtssAcademicBackupService.triggerCaseSync(newCaseId, 'INITIAL_MEET_FINALIZED').catch(console.error);
      }

      onSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  const toggleDomain = (domain: MTSSAcademicDomain) => {
    setFormData(prev => ({
      ...prev,
      subjectDomains: prev.subjectDomains.includes(domain)
        ? prev.subjectDomains.filter(d => d !== domain)
        : [...prev.subjectDomains, domain]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-bold text-slate-900">Refer New Academic Case</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500">
            <Plus size={20} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Student <span className="text-rose-500">*</span></label>
            <StudentSearch 
              placeholder="Search name or nickname..."
              onSelect={(student) => setFormData({ ...formData, studentId: student.id })}
            />
            {formData.studentId && (
              <div className="mt-2 text-xs font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg flex items-center justify-between">
                <span>Selected: {students.find(s => s.id === formData.studentId)?.name || formData.studentId}</span>
                <button type="button" onClick={() => setFormData({ ...formData, studentId: '' })} className="hover:text-emerald-800">
                  <Plus size={14} className="rotate-45" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Subject Domains <span className="text-rose-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDomain(d.value)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    formData.subjectDomains.includes(d.value)
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Source of Case <span className="text-rose-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {['SCREENING', 'TEACHER_REFERRAL', 'DATA_REVIEW'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFormData({ ...formData, sourceType: s as any })}
                  className={`px-3 py-2 rounded-lg border text-[10px] font-bold uppercase transition-all ${
                    formData.sourceType === s
                    ? 'bg-slate-800 border-slate-800 text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Primary Concern <span className="text-rose-500">*</span></label>
            <textarea
              required
              value={formData.primaryConcern}
              onChange={(e) => setFormData({ ...formData, primaryConcern: e.target.value })}
              placeholder="Describe the specific academic challenges observed..."
              rows={3}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-bold transition-all"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              className="flex-[2] px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-bold shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Plus size={20} />
                  <span>Refer Student</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
