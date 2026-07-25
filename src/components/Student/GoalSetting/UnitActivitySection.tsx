import * as React from 'react';
import { ClipboardList, AlertCircle, CheckCircle2, ChevronRight, HelpCircle } from 'lucide-react';
import { UnitActivityItem } from '../../../types';

interface UnitActivitySectionProps {
  unitActivity: string; // legacy fallback
  unitActivities?: UnitActivityItem[];
  disabled: boolean;
  onChange: (field: string, value: any) => void;
  reviews?: {
    extracurricular?: { status: string; comment?: string };
  };
}

const CATEGORIES = [
  'Performing Arts',
  'Arts & Makerspace',
  'Physical Education',
  'Digital Literacy'
];

const CHOSEN_OPTIONS: Record<string, string[]> = {
  'Performing Arts': ['Orchestra', 'Choir', 'Traditional Music', 'Drumline', 'Theatre'],
  'Arts & Makerspace': ['Papercraft', 'Makerspace', 'Seni Kreasi Bebas', 'Membatik', 'Painting'],
  'Physical Education': ['Bola Kecil', 'Bola Besar', 'Senam & Gerak Berirama', 'Atletik', 'Swimming & Physical Training'],
  'Digital Literacy': ['Animation', 'Videography', 'Graphic Design', '3D Structure Building', 'Coding']
};

export default function UnitActivitySection({
  unitActivity,
  unitActivities = [],
  disabled,
  onChange,
  reviews
}: UnitActivitySectionProps) {
  const [activeTab, setActiveTab] = React.useState<string>('Performing Arts');

  const isSectionDisabled = disabled || (reviews?.extracurricular ? reviews.extracurricular.status !== 'REVISION_REQUIRED' : false);

  // Safely build/maintain exactly 4 blocks in state
  const currentActivities = React.useMemo(() => {
    const list = [...unitActivities];
    CATEGORIES.forEach(cat => {
      if (!list.some(item => item.category === cat)) {
        list.push({ category: cat, activityName: '', worries: '', overcomingPlan: '' });
      }
    });
    // Maintain stable order matching CATEGORIES
    return CATEGORIES.map(cat => {
      const found = list.find(item => item.category === cat);
      return found || { category: cat, activityName: '', worries: '', overcomingPlan: '' };
    });
  }, [unitActivities]);

  const handleItemChange = (category: string, field: 'activityName' | 'worries' | 'overcomingPlan', value: string) => {
    if (isSectionDisabled) return;
    const updated = currentActivities.map(item => {
      if (item.category === category) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onChange('unitActivities', updated);
  };

  const isLegacy = !unitActivities.length && !!unitActivity;

  // Helpers to check completion
  const getBlockStatus = (cat: string) => {
    const item = currentActivities.find(u => u.category === cat);
    if (!item) return false;
    return !!(item.activityName.trim() && item.worries.trim() && item.overcomingPlan.trim());
  };

  const activeItem = currentActivities.find(u => u.category === activeTab) || {
    category: activeTab,
    activityName: '',
    worries: '',
    overcomingPlan: ''
  };

  const handleNextTab = () => {
    const currentIndex = CATEGORIES.indexOf(activeTab);
    if (currentIndex < CATEGORIES.length - 1) {
      setActiveTab(CATEGORIES[currentIndex + 1]);
    }
  };

  const renderFeedback = () => {
    const rev = reviews?.extracurricular;
    if (!rev || !rev.comment) return null;
    
    return (
      <div className={`p-4 rounded-xl text-xs font-medium border ${
        rev.status === 'APPROVED' 
          ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
          : rev.status === 'REVISION_REQUIRED' 
            ? 'bg-rose-50 text-rose-800 border-rose-100 animate-pulse' 
            : 'bg-gray-50 text-gray-700 border-gray-100'
      }`}>
        <p className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider">
          {rev.status === 'APPROVED' ? '✓ Disetujui Guru' : rev.status === 'REVISION_REQUIRED' ? '⚠ Perlu Revisi' : 'Reviewer'}
        </p>
        <p className="mt-1.5 leading-relaxed">{rev.comment}</p>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-8 animate-in fade-in duration-300">
      
      <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
        <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600">
          <ClipboardList size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Unit Activity</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Elective, Performing Arts, & Extracurricular Reflection</p>
        </div>
      </div>

      {/* Extracurricular reviews feedback */}
      {renderFeedback()}

      {/* Legacy Data Notice / Fallback */}
      {isLegacy && (
        <div className="p-5 bg-amber-50 border border-amber-100 rounded-2xl space-y-2 text-amber-800">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle size={16} />
            <span className="text-[10px] font-black uppercase tracking-wider">Legacy Narrative Data Detected</span>
          </div>
          <p className="text-xs font-semibold leading-relaxed">
            You have existing unit activity information saved under our old format. Please fill out the 4 structured categories below to complete your response. Your old response is retained as background fallback:
          </p>
          <div className="bg-white/60 p-3 rounded-lg border border-amber-200/50 text-xs italic text-gray-700 font-medium whitespace-pre-wrap">
            {unitActivity}
          </div>
        </div>
      )}

      {/* Beautiful Tab Selection Header */}
      <div className="bg-gray-50 p-2 rounded-[2rem] border border-gray-100">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {CATEGORIES.map((cat) => {
            const isCompleted = getBlockStatus(cat);
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveTab(cat)}
                className={`flex flex-col items-center justify-center py-3.5 px-4 rounded-[1.5rem] border text-center transition-all duration-200 ${
                  isActive
                    ? 'bg-white border-teal-500/30 text-teal-950 shadow-sm font-black'
                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 font-bold'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider">{cat}</span>
                  {isCompleted ? (
                    <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" title="Pending completion" />
                  )}
                </div>
                <span className="text-[8px] uppercase tracking-widest text-gray-400">
                  {isCompleted ? 'Complete' : 'Required'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Panel */}
      <div className="p-6 lg:p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 space-y-6">
        <div className="flex items-center justify-between border-b border-gray-200/50 pb-4">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-teal-600">Active Block</span>
            <h3 className="text-lg font-black text-gray-900 uppercase italic tracking-tight">{activeTab} Reflection</h3>
          </div>
          <div className="flex items-center gap-2">
            {getBlockStatus(activeTab) ? (
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
                <CheckCircle2 size={12} /> Block Complete
              </span>
            ) : (
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100 flex items-center gap-1">
                <HelpCircle size={12} /> Incomplete
              </span>
            )}
          </div>
        </div>

        {/* Dropdown for specific category */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            {activeTab} Chosen <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-400 font-medium">Select your elective activity or course for {activeTab}.</p>
          <select
            disabled={isSectionDisabled}
            value={activeItem.activityName}
            onChange={(e) => handleItemChange(activeTab, 'activityName', e.target.value)}
            className="w-full p-4 bg-white focus:bg-white rounded-2xl border border-gray-200/60 focus:border-teal-500 outline-none shadow-sm transition-all duration-200 text-sm font-semibold text-gray-700 disabled:opacity-75"
          >
            <option value="">-- Choose {activeTab} Activity --</option>
            {(CHOSEN_OPTIONS[activeTab] || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Worries per category */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            Your worries joining {activeTab} <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-400 font-medium">What challenges, skill gaps, or doubts are you concerned about for this activity?</p>
          <textarea
            disabled={isSectionDisabled}
            value={activeItem.worries}
            onChange={(e) => handleItemChange(activeTab, 'worries', e.target.value)}
            placeholder={`I'm worried about my skills or confidence in ${activeItem.activityName || activeTab}...`}
            className="w-full min-h-[100px] p-5 bg-white focus:bg-white rounded-2xl border border-gray-200/60 focus:border-teal-500 outline-none shadow-sm transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 disabled:opacity-75"
          />
        </div>

        {/* Overcoming Plan per category */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            How will you plan to overcome it <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-400 font-medium">What is your concrete step or approach to handle these worries?</p>
          <textarea
            disabled={isSectionDisabled}
            value={activeItem.overcomingPlan}
            onChange={(e) => handleItemChange(activeTab, 'overcomingPlan', e.target.value)}
            placeholder="My plan to overcome this and build confidence is..."
            className="w-full min-h-[100px] p-5 bg-white focus:bg-white rounded-2xl border border-gray-200/60 focus:border-teal-500 outline-none shadow-sm transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 disabled:opacity-75"
          />
        </div>

        {/* Navigation button for seamless flow */}
        {activeTab !== CATEGORIES[CATEGORIES.length - 1] && (
          <div className="pt-4 flex justify-end">
            <button
              type="button"
              onClick={handleNextTab}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-xl text-xs transition-all duration-150"
            >
              Next Category <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
