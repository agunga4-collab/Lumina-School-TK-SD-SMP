import * as React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUpRight, BookOpen, Clock, AlertCircle } from 'lucide-react';

interface SelfExplorationReferenceSectionProps {
  loading: boolean;
  referenceData: {
    periodLabel: string;
    enrollment: any | null;
  } | null;
  grade?: number;
}

export default function SelfExplorationReferenceSection({ loading, referenceData, grade }: SelfExplorationReferenceSectionProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm flex items-center justify-center min-h-[200px]">
        <div className="flex flex-col items-center gap-3">
          <Clock className="animate-spin text-blue-600" size={32} />
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Loading Self-Exploration Reference...</p>
        </div>
      </div>
    );
  }

  const enrollment = referenceData?.enrollment;
  const periodLabel = referenceData?.periodLabel;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Self-Exploration Card */}
      <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Sparkles size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">My Self-Exploration</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                {periodLabel || 'Active Semester Period'}
              </p>
            </div>
          </div>

          <Link
            to="/self-exploration/my"
            className="flex items-center gap-2 px-5 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm self-start sm:self-auto"
          >
            Open Self-Exploration <ArrowUpRight size={14} />
          </Link>
        </div>

        {enrollment ? (
          <div className="space-y-6">
            {/* Status & Overview */}
            <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Enrollment Status</p>
                <p className="text-xs font-black text-blue-700 uppercase">{enrollment.status || 'PLANNING'}</p>
              </div>
            </div>

            {/* Choices Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {enrollment.choices && enrollment.choices.map((choice: any, idx: number) => (
                <div key={idx} className="p-6 bg-gray-50 rounded-2xl space-y-4 border border-gray-100">
                  <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Choice Slot {choice.slot || idx + 1}</span>
                    <span className="text-[9px] font-black px-2 py-1 bg-white border border-gray-200 rounded-lg text-gray-500 uppercase">{choice.strand}</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-gray-800 uppercase tracking-tight">Selected Activity</h4>
                    <p className="text-sm font-bold text-gray-600 mt-1">{choice.activityName || choice.customActivity || '-'}</p>
                  </div>
                  {choice.finalTarget && (
                    <div>
                      <h4 className="text-xs font-black text-gray-800 uppercase tracking-tight">Final Goal/Target</h4>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed italic">"{choice.finalTarget}"</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-dashed border-gray-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-gray-400 mx-auto">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-sm font-black text-gray-700 uppercase italic">No plan found</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
              No Self-Exploration plan has been added for this period. Click the button above to set up your exploration activities!
            </p>
          </div>
        )}
      </div>

      {/* Grade 9 Karya Ilmiah */}
      {grade === 9 && (
        <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-6 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <BookOpen size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Karya Ilmiah / Scientific Research / Graduation Project</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Grade 9 Graduation Project Summary</p>
            </div>
          </div>

          {enrollment && enrollment.choices && enrollment.choices.length > 0 ? (
            <div className="space-y-4">
              <div className="p-5 bg-indigo-50/35 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-indigo-100/50 pb-2">
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Research / Project Registration</span>
                  <span className="text-[9px] font-black px-2 py-1 bg-white border border-indigo-100 rounded-lg text-indigo-600 uppercase">
                    {enrollment.choices[0].strand || 'Rational'}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-tight">Proposed Research Topic</h4>
                  <p className="text-sm font-bold text-indigo-900 mt-1">
                    {enrollment.choices[0].activityName || enrollment.choices[0].customActivity || 'No topic registered'}
                  </p>
                </div>
                {enrollment.choices[0].finalTarget && (
                  <div>
                    <h4 className="text-xs font-black text-indigo-950 uppercase tracking-tight">Final Goal & Target</h4>
                    <p className="text-xs text-indigo-700/80 mt-1 leading-relaxed italic">
                      "{enrollment.choices[0].finalTarget}"
                    </p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
                This project summary is a read-only reference pulled directly from your active Self-Exploration record.
              </p>
            </div>
          ) : (
            <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-dashed border-gray-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-gray-400 mx-auto">
                <AlertCircle size={24} className="text-indigo-500" />
              </div>
              <h3 className="text-sm font-black text-gray-700 uppercase italic">No registration found</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                No active Graduation Project or Self-Exploration plan has been added for this period. Register your plan in Self-Exploration to see your project details here.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
