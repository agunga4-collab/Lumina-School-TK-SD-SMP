import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { Student, ThreeWayConference } from '../../../types';
import { Loader2, ShieldAlert, ArrowLeft, RefreshCw, Compass } from 'lucide-react';
import { ThreeWayConferencePresentationViewer } from '../../../components/Student/MyPresentation/ThreeWayConferencePresentationViewer';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export default function TeacherPresentationPage() {
  const { conferenceId } = useParams<{ conferenceId: string }>();
  const { profile, loading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  // Component States
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<{
    conference: ThreeWayConference;
    student: Student;
  } | null>(null);

  // Perform access check and load data
  const loadPresentation = React.useCallback(async () => {
    if (!conferenceId || !profile) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch data through the explicit secure service
      const data = await threeWayConferenceService.getConferencePresentationForViewer(conferenceId, profile);
      setPayload(data);

      // 2. Perform lightweight audit log (Non-blocking)
      try {
        await addDoc(collection(db, 'auditLogs'), {
          action: 'CONFERENCE_PRESENTATION_OPENED',
          conferenceId: conferenceId,
          studentId: data.conference.studentId,
          openedByUid: profile.uid,
          openedByRole: profile.role,
          openedAt: Date.now()
        });
      } catch (auditErr) {
        console.warn('[Audit] Lightweight logging failed (non-blocking):', auditErr);
      }

    } catch (err: any) {
      console.error('Error opening teacher presentation:', err);
      setError(err.message || 'Anda tidak memiliki akses untuk membuka presentasi ini.');
    } finally {
      setLoading(false);
    }
  }, [conferenceId, profile]);

  React.useEffect(() => {
    if (!isAuthLoading) {
      loadPresentation();
    }
  }, [loadPresentation, isAuthLoading]);

  const handleBackToWorkspace = () => {
    if (payload?.student?.id) {
      navigate(`/junior-high/conference/workspace?studentId=${payload.student.id}`);
    } else {
      navigate('/junior-high/conference/workspace');
    }
  };

  // 1. Authentication or Initial Loading
  if (isAuthLoading || (loading && !payload && !error)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6" id="teacher-present-loading">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest animate-pulse">
          Memvalidasi Akses Presentasi...
        </p>
      </div>
    );
  }

  // 2. Unauthorized or Not Found Error States
  if (error || !payload) {
    const isNotFoundError = error?.includes('tidak ditemukan') || error?.includes('ditemukan');
    const displayMessage = error || 'Anda tidak memiliki akses untuk membuka presentasi ini.';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" id="teacher-present-error">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-red-100 text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-2xl mx-auto flex items-center justify-center text-red-500">
            <ShieldAlert size={32} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              {isNotFoundError ? 'Presentasi Tidak Ditemukan' : 'Akses Ditolak'}
            </h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {displayMessage}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {!isNotFoundError && (
              <button 
                onClick={loadPresentation}
                className="w-full py-3 bg-[#002366] text-white rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} />
                <span>Coba Lagi</span>
              </button>
            )}
            <button 
              onClick={handleBackToWorkspace}
              className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} />
              <span>Kembali ke Workspace</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Render Shared presentation viewer in teacher mode
  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8" id="teacher-presentation-page">
      <div className="max-w-5xl mx-auto">
        <ThreeWayConferencePresentationViewer
          conference={payload.conference}
          student={payload.student}
          viewerMode="TEACHER"
          viewerName={profile?.displayName || profile?.email || ''}
          canEdit={false}
        />
      </div>
    </div>
  );
}
