import * as React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getStudentById } from '../../lib/firebase';
import { threeWayConferenceService } from '../../services/threeWayConferenceService';
import { Student, ConferencePeriod, StudentConferenceResponse } from '../../types';
import { Loader2 } from 'lucide-react';
import { PresentationEmptyState } from '../../components/Student/MyPresentation/PresentationEmptyState';
import { ThreeWayConferencePresentationViewer } from '../../components/Student/MyPresentation/ThreeWayConferencePresentationViewer';

export default function StudentMyPresentationPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Loading States
  const [loading, setLoading] = React.useState(true);

  // Core Data
  const [student, setStudent] = React.useState<Student | null>(null);
  const [period, setPeriod] = React.useState<ConferencePeriod | null>(null);
  const [response, setResponse] = React.useState<StudentConferenceResponse | null>(null);

  const studentId = profile?.luminaId || '';

  const fetchData = React.useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch student trusted records
      const sData = await getStudentById(studentId);
      setStudent(sData);

      // Fetch active conference period
      const activePeriod = await threeWayConferenceService.getCurrentConferencePeriod(activeYear, activeSemester);
      setPeriod(activePeriod);

      if (activePeriod) {
        // Fetch existing response
        const existingResponse = await threeWayConferenceService.getCurrentStudentConferenceResponse(activePeriod.id, studentId);
        setResponse(existingResponse);
      }
    } catch (err) {
      console.error('Error fetching data for presentation:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId, activeYear, activeSemester]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" id="student-presentation-loading">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">
          Loading Presentation...
        </p>
      </div>
    );
  }

  // Availability Checks
  if (!period) {
    return <PresentationEmptyState type="NO_PERIOD" />;
  }

  if (!response) {
    return <PresentationEmptyState type="NO_RESPONSE" />;
  }

  return (
    <div className="min-h-screen p-6 md:p-8 space-y-8 max-w-5xl mx-auto" id="student-presentation-page">
      <ThreeWayConferencePresentationViewer
        conference={response}
        student={student}
        viewerMode="STUDENT"
        viewerName={profile?.displayName || profile?.email || ''}
        canEdit={false}
      />
    </div>
  );
}
