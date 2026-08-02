import * as React from 'react';
import { User, Calendar, GraduationCap, Users } from 'lucide-react';
import { Student } from '../../../types';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';

interface StudentProfileSectionProps {
  student: Student | null;
  academicYear: string;
  semester: number;
}

export default function StudentProfileSection({ student, academicYear, semester }: StudentProfileSectionProps) {
  const [resolvedClass, setResolvedClass] = React.useState<string>('');
  const [resolvedGrade, setResolvedGrade] = React.useState<string>('');

  React.useEffect(() => {
    if (student?.id && academicYear) {
      threeWayConferenceService.resolveConferenceEnrollment({
        studentId: student.id,
        academicYear
      }).then(res => {
        setResolvedClass(res.className);
        setResolvedGrade(res.gradeLabel);
      }).catch(err => {
        console.error('Failed to resolve enrollment in profile section:', err);
      });
    }
  }, [student?.id, academicYear]);

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
          <User size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Student Profile</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Trusted School Records</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Full Name */}
        <div className="p-4 bg-gray-50 rounded-2xl space-y-1">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <User size={12} className="text-blue-500" /> Full Name
          </div>
          <div className="font-bold text-gray-800 text-sm">
            {student?.name || 'Loading name...'}
          </div>
        </div>

        {/* NIS / Lumina ID */}
        <div className="p-4 bg-gray-50 rounded-2xl space-y-1">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <GraduationCap size={12} className="text-blue-500" /> NIS (Lumina ID)
          </div>
          <div className="font-bold text-gray-800 text-sm font-mono">
            {student?.id || student?.nis || '-'}
          </div>
        </div>

        {/* Class and Grade */}
        <div className="p-4 bg-gray-50 rounded-2xl space-y-1">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <Users size={12} className="text-emerald-500" /> Class & Grade
          </div>
          <div className="font-bold text-gray-800 text-sm">
            {resolvedClass ? `${resolvedClass} (${resolvedGrade || 'Grade —'})` : (student?.classId ? `${student.classId} (Grade ${student.grade || '-'})` : '-')}
          </div>
        </div>

        {/* Academic Period */}
        <div className="p-4 bg-gray-50 rounded-2xl space-y-1">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <Calendar size={12} className="text-purple-500" /> Academic Period
          </div>
          <div className="font-bold text-gray-800 text-sm">
            {academicYear} • Semester {semester}
          </div>
        </div>
      </div>
    </div>
  );
}
