import * as React from 'react';
import { Target, Plus, Compass, Sparkles, Heart, Activity } from 'lucide-react';
import { SmartGoal, ConferenceGoalStrand } from '../../../types';
import GoalEditor from './GoalEditor';

interface GoalsSectionProps {
  goals: SmartGoal[];
  disabled: boolean;
  onGoalsChange: (updatedGoals: SmartGoal[]) => void;
}

const STRAND_CONFIGS: {
  strand: ConferenceGoalStrand;
  title: string;
  prompt: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
}[] = [
  {
    strand: 'SPIRITUAL',
    title: 'Spiritual Strand',
    prompt: 'Set a goal that helps you strengthen your connection to God, yourself, others, your emotional intelligence, or a Lazuardi value.',
    icon: <Heart size={20} />,
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-600',
  },
  {
    strand: 'IMAGINAL',
    title: 'Imaginal Strand',
    prompt: 'Set a goal related to imagination, aesthetics, creativity, innovation, or your personal interests and talents.',
    icon: <Sparkles size={20} />,
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-600',
  },
  {
    strand: 'RATIONAL',
    title: 'Rational Strand',
    prompt: 'Set a goal related to flexible thinking, problem solving, reflection, or finding and using information.',
    icon: <Compass size={20} />,
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
  },
  {
    strand: 'MATERIAL_PHYSICAL',
    title: 'Material/Physical Strand',
    prompt: 'Set a goal related to physical activity, psychomotor development, sensory awareness, health, or well-being.',
    icon: <Activity size={20} />,
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
  },
];

export default function GoalsSection({ goals, disabled, onGoalsChange }: GoalsSectionProps) {
  
  // Local unique ID generator as safe fallback if crypto.randomUUID isn't defined
  const generateId = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'goal_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  };

  const handleAddGoal = (strand: ConferenceGoalStrand) => {
    const strandGoals = goals.filter(g => g.strand === strand);
    if (strandGoals.length >= 2) return; // Prompt maximum 2 goals

    const newGoal: SmartGoal = {
      id: generateId(),
      strand,
      goal: '',
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRelevant: '',
      smartTimeBound: '',
      actions: '',
      evidence: '',
      startDate: null,
      targetDate: null,
      status: 'DRAFT',
      order: goals.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    onGoalsChange([...goals, newGoal]);
  };

  const handleUpdateGoal = (updatedGoal: SmartGoal) => {
    const updated = goals.map(g => (g.id === updatedGoal.id ? updatedGoal : g));
    onGoalsChange(updated);
  };

  const handleRemoveGoal = (goalId: string) => {
    const filtered = goals.filter(g => g.id !== goalId);
    onGoalsChange(filtered);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-300">
      
      {/* Intro Header */}
      <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
        <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tight flex items-center gap-2">
          <Target className="text-blue-600" size={24} /> Set Your SMART Goals
        </h2>
        <p className="text-xs text-gray-400 font-medium mt-2 leading-relaxed">
          For each of the four workbook strands (Spiritual, Imaginal, Rational, and Material/Physical), 
          you can set up to <strong>two goals</strong>. Start by selecting <strong>+ Add Goal</strong> under the relevant strand.
        </p>
      </div>

      {/* Strands Iteration */}
      {STRAND_CONFIGS.map(({ strand, title, prompt, icon, bgColor, textColor }) => {
        const strandGoals = goals.filter(g => g.strand === strand);

        return (
          <div key={strand} className="space-y-6">
            
            {/* Strand Title Banner */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${bgColor} ${textColor} rounded-xl flex items-center justify-center`}>
                    {icon}
                  </div>
                  <h3 className="font-black text-gray-900 uppercase italic text-base tracking-tight">
                    {title}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                  {prompt}
                </p>
              </div>

              {/* Add Goal Button */}
              {!disabled && strandGoals.length < 2 && (
                <button
                  type="button"
                  onClick={() => handleAddGoal(strand)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest ${bgColor} ${textColor} hover:brightness-95 transition-all self-start md:self-auto`}
                >
                  <Plus size={14} /> Add Goal
                </button>
              )}
            </div>

            {/* Empty State / Goal Cards */}
            {strandGoals.length === 0 ? (
              <div className="p-8 bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-200 text-center space-y-2">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  No goals configured for this strand
                </p>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleAddGoal(strand)}
                    className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                  >
                    + Add first goal
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {strandGoals.map((goal) => (
                  <GoalEditor
                    key={goal.id}
                    goal={goal}
                    disabled={disabled}
                    onUpdate={handleUpdateGoal}
                    onRemove={() => handleRemoveGoal(goal.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
