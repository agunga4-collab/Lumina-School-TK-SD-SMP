import * as React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';

const LegacyCaseRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/junior-high/behavior/mtss/cases/${id}`} replace />;
};
import { Layout } from './components/Layout';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/Auth/LoginPage';
import PendingPage from './pages/Auth/PendingPage';
import ProfilePage from './pages/Profile/ProfilePage';
import { LuminaLogo } from './components/LuminaLogo';
import { ShieldAlert } from 'lucide-react';

import CaseList from './pages/MTSS/CaseList';
import CreateCase from './pages/MTSS/CreateCase';
import CaseDetail from './pages/MTSS/CaseDetail';
import AddConcern from './pages/MTSS/AddConcern';
import InterventionPlan from './pages/MTSS/InterventionPlan';
import CICOTracker from './pages/MTSS/CICOTracker';
import BehaviorAnalytics from './pages/MTSS/BehaviorAnalytics';
import MTSSAcademicCases from './pages/MTSSAcademic/CaseList';
import MTSSAcademicScreening from './pages/MTSSAcademic/Screening';
import MTSSAcademicCaseDetail from './pages/MTSSAcademic/CaseDetail';
import MTSSAcademicOverview from './pages/MTSSAcademic/Overview';
import MTSSBehaviorLayout from './pages/MTSS/MTSSBehaviorLayout';
import MTSSBehaviorOverview from './pages/MTSS/MTSSBehaviorOverview';
import MTSSBehaviorSpreadsheet from './pages/MTSS/MTSSBehaviorSpreadsheet';
import MTSSBehaviorTimeline from './pages/MTSS/MTSSBehaviorTimeline';
import MTSSAcademicLayout from './pages/MTSSAcademic/MTSSAcademicLayout';
import MTSSAcademicCoachingSpreadsheet from './pages/MTSSAcademic/CoachingSpreadsheet';

// Self Exploration (SMP)
const SEDashboard = React.lazy(() => import('./pages/SelfExploration/SEDashboard'));
const SEPeriods = React.lazy(() => import('./pages/SelfExploration/SEPeriods'));
const SEActivities = React.lazy(() => import('./pages/SelfExploration/SEActivities'));
const SEMy = React.lazy(() => import('./pages/SelfExploration/StudentPortal/SEMy'));
const SEPlan = React.lazy(() => import('./pages/SelfExploration/StudentPortal/SEPlan'));
const SEDetails = React.lazy(() => import('./pages/SelfExploration/StudentPortal/SEDetails'));
const SEClassView = React.lazy(() => import('./pages/SelfExploration/TeacherPortal/SEClassView'));
const SECompilation = React.lazy(() => import('./pages/SelfExploration/SECompilation'));
const AAPStaffPage = React.lazy(() => import('./pages/JuniorHigh/AAPStaffPage'));
const AAPStudentPage = React.lazy(() => import('./pages/Student/AAPStudentPage'));

import HeadDashboard from './pages/Dashboard/HeadDashboard';
import Observations from './pages/Teacher/Observations';
import Attendance from './pages/Teacher/Attendance';
import ClassDataPage from './pages/Teacher/ClassDataPage';
import ChildAttendance from './pages/Parent/Attendance';
import LiteracyInput from './pages/LiteracyNumeracy/LiteracyInput';
import LiteracyRecap from './pages/LiteracyNumeracy/LiteracyRecap';
import ElementaryLiteracyNumeracy from './pages/Elementary/LiteracyNumeracy';
import ElementaryTeacherDashboard from './pages/Elementary/TeacherDashboard';
import JuniorHighLiteracyNumeracy from './pages/JuniorHigh/LiteracyNumeracy';
import ConferencePeriodManagement from './pages/JuniorHigh/ThreeWayConference/ConferencePeriodManagement';
import TeacherConferenceWorkspace from './pages/JuniorHigh/ThreeWayConference/TeacherConferenceWorkspace';
import TeacherPresentationPage from './pages/JuniorHigh/ThreeWayConference/TeacherPresentationPage';
import ElementaryLiteracyInputPage from './pages/Elementary/ElementaryLiteracyInputPage';
import MTSSAcademicDashboard from './pages/Elementary/MTSSAcademicDashboard';
import LdssPage from './pages/Elementary/LdssPage';
import ClassAnecdotePage from './pages/Elementary/ClassAnecdotePage';
import LiteracySummary from './pages/Parent/LiteracySummary';
import Lateness from './pages/Attendance/Lateness';
import ElementaryHeadDashboard from './pages/Dashboard/ElementaryHeadDashboard';
import StudentProgress from './pages/Student/StudentProgress';
import DailyChecklist from './pages/Kindergarten/DailyChecklist';
import ObservationKG from './pages/Kindergarten/Observation';
import AAPAssessment from './pages/Kindergarten/AAPAssessment';
import AAPReport from './pages/Kindergarten/AAPReport';
import WeeklyReview from './pages/Kindergarten/WeeklyReview';
import WeeklySummary from './pages/Kindergarten/WeeklySummary';
import HeadDashboardKG from './pages/Kindergarten/HeadDashboard';
import TeacherDashboardKG from './pages/Kindergarten/TeacherDashboard';
import ParentViewKG from './pages/Kindergarten/ParentView';
import AttendanceSummaryReport from './pages/Kindergarten/AttendanceSummaryReport';
import StudentPassport from './pages/Student/StudentPassport';
import LuminaHome from './pages/Home/LuminaHome';
import SuperAdminPage from './pages/Admin/SuperAdminPage';
import AttendanceCalendarPage from './pages/Admin/AttendanceCalendarPage';
import AttendanceBackupConfigPage from './pages/Admin/AttendanceBackupConfig';
import AttendanceBackupDiagnostics from './pages/Admin/AttendanceBackupDiagnostics';
import MTSSAcademicBackupConfigPage from './pages/Admin/MTSSAcademicBackupConfig';
import MTSSAcademicBackupDiagnostics from './pages/Admin/MTSSAcademicBackupDiagnostics';
import MTSSBehaviorBackupConfigPage from './pages/Admin/MTSSBehaviorBackupConfig';
import MTSSBehaviorBackupDiagnostics from './pages/Admin/MTSSBehaviorBackupDiagnostics';
import LearningGoalsPage from './pages/Academic/LearningGoalsPage';
import LXDList from './pages/Academic/LXDList';
import LXDForm from './pages/Academic/LXDForm';
import LXDDetailPage from './pages/Academic/LXDDetailPage';
import LXDApprovalQueue from './pages/Academic/LXDApprovalQueue';
import AssessmentList from './pages/Academic/AssessmentList';
import AssessmentForm from './pages/Academic/AssessmentForm';
import AssessmentDetail from './pages/Academic/AssessmentDetail';
import ClassRecap from './pages/Academic/ClassRecap';
import StudentAssessmentProfile from './pages/Academic/StudentAssessmentProfile';
import ReportList from './pages/Academic/Reports/ReportList';
import ReportCreate from './pages/Academic/Reports/ReportCreate';
import ReportInput from './pages/Academic/Reports/ReportInput';
import ReportView from './pages/Academic/Reports/ReportView';

import NotificationsPage from './pages/Notifications';
import { useBehaviorAlerts } from './hooks/useBehaviorAlerts';
import { LGBackupTestButton } from './components/Admin/LGBackupTestButton';
import { MenuVisibilityGuard } from './components/MenuVisibilityGuard';

import StudentDashboard from './pages/Student/StudentDashboard';
import StudentReports from './pages/Student/StudentReports';
import StudentMonthlyReports from './pages/Student/StudentMonthlyReports';
import StudentGoalSettingPage from './pages/Student/StudentGoalSettingPage';
import StudentMyPresentationPage from './pages/Student/StudentMyPresentationPage';
import StudentSmartGoalTrackerPage from './pages/Student/StudentSmartGoalTrackerPage';
import StaffSmartGoalTrackerPage from './pages/JuniorHigh/ThreeWayConference/StaffSmartGoalTrackerPage';
import ParentDashboard from './pages/Parent/ParentDashboard';
import ParentReports from './pages/Parent/ParentReports';
import ParentStudents from './pages/Parent/ParentStudents';
import ReportConfigPage from './pages/Settings/ReportConfig';
import LearningPowerUpStudentPage from './pages/Student/LearningPowerUpStudentPage';
import LearningPowerUpTeacherPage from './pages/JuniorHigh/LearningPowerUpTeacherPage';
import UnitActivitiesPage from './pages/JuniorHigh/UnitActivitiesPage';
import StudentUnitActivitiesPage from './pages/Student/StudentUnitActivitiesPage';
import MonthlyReportSummaryPage from './pages/JuniorHigh/MonthlyReportSummaryPage';
import MonthlyReportCommentsPage from './pages/JuniorHigh/MonthlyReportCommentsPage';
import MonthlyReportPreviewPage from './pages/JuniorHigh/MonthlyReportPreviewPage';
import MonthlyReportTemplatePage from './pages/JuniorHigh/MonthlyReportTemplatePage';
import MonthlyReportPdfPage from './pages/JuniorHigh/MonthlyReportPdfPage';
import MonthlyReportPdfLinkPage from './pages/JuniorHigh/MonthlyReportPdfLinkPage';
import WeeklyReportDetail from './pages/Kindergarten/WeeklyReportDetail';

// High-level wrapper for Admin-only access
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  
  if (loading) return null;
  if (profile?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function RoleGuard({ children, roles }: { children: React.ReactNode, roles: string[] }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }
  
  // Scoped unit access for HEAD_UNIT of KINDERGARTEN
  if (profile?.role === 'HEAD_UNIT' && profile?.unitId === 'KINDERGARTEN') {
    const path = window.location.pathname.toLowerCase();
    if (
      path.includes('/elementary') || 
      path.includes('/junior-high') || 
      path.includes('/admin') ||
      path.includes('/head-elementary') ||
      path.includes('/settings') ||
      path.includes('/report-config')
    ) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, error, signOut } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#002366] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-gray-500 animate-pulse uppercase tracking-widest">Memproses Autentikasi...</p>
        </div>
      </div>
    );
  }

  if (error) {
    let errorMessage = error;
    try {
      const parsed = JSON.parse(error);
      if (parsed.error) {
        errorMessage = `[${parsed.operationType.toUpperCase()}] ${parsed.error}`;
        if (parsed.path) errorMessage += ` at ${parsed.path}`;
      }
    } catch {
      // Not a JSON error
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl p-8 border border-red-100 text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-2xl mx-auto flex items-center justify-center text-red-500">
            <ShieldAlert size={32} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Koneksi Terhambat</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {error.includes('permission-denied') || error.includes('insufficient permissions')
                ? "Izin akses Firestore ditolak. Mohon periksa Rules di Firebase Console Anda."
                : errorMessage}
            </p>
          </div>
          <div className="flex flex-col gap-3">
             <button 
               onClick={() => window.location.reload()}
               className="w-full py-3 bg-[#002366] text-white rounded-xl font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
             >
               Coba Lagi
             </button>
             <button 
               onClick={signOut}
               className="w-full py-3 bg-gray-50 text-gray-500 rounded-xl font-bold hover:bg-gray-100 transition-all"
             >
               Keluar
             </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile && !loading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl p-8 border border-orange-100 text-center space-y-6">
          <LuminaLogo size="lg" className="mx-auto" />
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Profil Tidak Ditemukan</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Anda berhasil masuk, tetapi profil pengguna Lumina belum ditemukan.
            </p>
          </div>
          <button 
            onClick={signOut}
            className="w-full py-3 bg-[#002366] text-white rounded-xl font-bold hover:opacity-90 transition-all"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    );
  }

  if (profile?.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  if (profile?.status === 'disabled') {
     return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl p-8 border border-gray-100 text-center space-y-6">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl mx-auto flex items-center justify-center text-gray-500">
            <ShieldAlert size={32} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Akun Dinonaktifkan</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Maaf, akses Anda ke platform LUMINA telah dinonaktifkan.
            </p>
          </div>
          <button 
            onClick={signOut}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:opacity-90 transition-all"
          >
            Keluar
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pending" element={<PendingPage />} />
        
        <Route 
          path="/" 
          element={
            <AuthGuard>
              <Layout />
              <LGBackupTestButton />
            </AuthGuard>
          }
        >
          <Route index element={<LuminaHome />} />
          <Route 
            path="admin" 
            element={
              <AdminGuard>
                <SuperAdminPage />
              </AdminGuard>
            } 
          />
          <Route 
            path="admin/attendance-calendar" 
            element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <AttendanceCalendarPage />
              </RoleGuard>
            } 
          />
          <Route path="dashboard">
            <Route path="head" element={<Navigate to="/" replace />} />
            <Route path="head-elementary" element={<ElementaryHeadDashboard />} />
            <Route path="head-kindy" element={<HeadDashboardKG />} />
          </Route>
          <Route path="attendance">
            <Route index element={<Attendance />} />
            <Route path="backup-config" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <AttendanceBackupConfigPage />
              </RoleGuard>
            } />
            <Route path="backup-diagnostics" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <AttendanceBackupDiagnostics />
              </RoleGuard>
            } />
          </Route>
          <Route path="lateness" element={<Lateness />} />
          <Route path="class-data" element={<ClassDataPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="conference/presentation/:conferenceId" element={<TeacherPresentationPage />} />
          <Route path="academic">
             <Route path="learning-goals" element={
               <MenuVisibilityGuard menuKey="learningGoals">
                 <LearningGoalsPage />
               </MenuVisibilityGuard>
             } />
             <Route path="lxd" element={
               <MenuVisibilityGuard menuKey="lxd">
                 <LXDList />
               </MenuVisibilityGuard>
             } />
             <Route path="lxd/new" element={
               <MenuVisibilityGuard menuKey="lxd">
                 <LXDForm />
               </MenuVisibilityGuard>
             } />
             <Route path="lxd/edit/:id" element={
               <MenuVisibilityGuard menuKey="lxd">
                 <LXDForm />
               </MenuVisibilityGuard>
             } />
             <Route path="lxd/approval-queue" element={
               <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT']}>
                 <MenuVisibilityGuard menuKey="lxd">
                   <LXDApprovalQueue />
                 </MenuVisibilityGuard>
               </RoleGuard>
             } />
             <Route path="lxd/:id" element={
               <MenuVisibilityGuard menuKey="lxd">
                 <LXDDetailPage />
               </MenuVisibilityGuard>
             } />
             <Route path="buku-nilai" element={
               <MenuVisibilityGuard menuKey="gradebook">
                 <AssessmentList />
               </MenuVisibilityGuard>
             } />
             <Route path="buku-nilai/rekap" element={
               <MenuVisibilityGuard menuKey="gradebook">
                 <ClassRecap />
               </MenuVisibilityGuard>
             } />
             <Route path="buku-nilai/:id" element={
               <MenuVisibilityGuard menuKey="gradebook">
                 <AssessmentDetail />
               </MenuVisibilityGuard>
             } />
             <Route path="buku-nilai/siswa/:studentId" element={
               <MenuVisibilityGuard menuKey="gradebook">
                 <StudentAssessmentProfile />
               </MenuVisibilityGuard>
             } />
             <Route path="lxd/assess/new" element={
               <MenuVisibilityGuard menuKey="lxd">
                 <AssessmentForm />
               </MenuVisibilityGuard>
             } />
             <Route path="lxd/assess/edit/:id" element={
               <MenuVisibilityGuard menuKey="lxd">
                 <AssessmentForm />
               </MenuVisibilityGuard>
             } />
             <Route path="rapor" element={
               <MenuVisibilityGuard menuKey="reportCards">
                 <ReportList />
               </MenuVisibilityGuard>
             } />
             <Route path="rapor/new" element={
               <MenuVisibilityGuard menuKey="reportCards">
                 <ReportCreate />
               </MenuVisibilityGuard>
             } />
             <Route path="rapor/:id" element={
               <MenuVisibilityGuard menuKey="reportCards">
                 <ReportInput />
               </MenuVisibilityGuard>
             } />
             <Route path="rapor/:id/preview" element={
               <MenuVisibilityGuard menuKey="reportCards">
                 <ReportView />
               </MenuVisibilityGuard>
             } />
          </Route>
          <Route path="literacy">
            <Route path="input" element={<LiteracyInput />} />
            <Route path="recap" element={<LiteracyRecap />} />
          </Route>
          <Route path="elementary/literasi-numerasi" element={<ElementaryLiteracyNumeracy />} />
          <Route path="elementary/literasi-numerasi/input" element={<ElementaryLiteracyInputPage />} />
          <Route path="elementary/dashboard" element={
            <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
              <ElementaryTeacherDashboard />
            </RoleGuard>
          } />
          <Route path="elementary/mtss-academic" element={
            <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
              <MTSSAcademicDashboard />
            </RoleGuard>
          } />
          <Route path="elementary/ldss" element={
            <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
              <LdssPage />
            </RoleGuard>
          } />
          <Route path="elementary/anecdote" element={
            <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
              <ClassAnecdotePage />
            </RoleGuard>
          } />
          <Route path="elementary/ldss/settings" element={
            <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
              <LdssPage />
            </RoleGuard>
          } />
          <Route path="elementary/ldss/settings/:age" element={
            <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
              <LdssPage />
            </RoleGuard>
          } />
          <Route path="kindy">
            <Route path="dashboard" element={<TeacherDashboardKG />} />
            <Route path="aap-assessment" element={<AAPAssessment />} />
            <Route path="aap-report" element={<AAPReport />} />
            <Route path="checklist" element={<DailyChecklist />} />
            <Route path="observation" element={<ObservationKG />} />
            <Route path="weekly-summary" element={<WeeklySummary />} />
            <Route path="weekly-review" element={<WeeklyReview />} />
            <Route path="attendance-recap" element={<AttendanceSummaryReport />} />
          </Route>
          <Route path="child">
            <Route path="attendance" element={<ChildAttendance />} />
            <Route path="literacy" element={<LiteracySummary />} />
            <Route path="progress" element={<StudentProgress />} />
            <Route path="kindy-summary" element={<ParentViewKG />} />
            <Route path="passport" element={<StudentPassport />} />
          </Route>
          <Route path="junior-high">
            <Route path="literasi-numerasi" element={<JuniorHighLiteracyNumeracy />} />
            <Route path="learning-power-up" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'COORDINATOR']}>
                <LearningPowerUpTeacherPage />
              </RoleGuard>
            } />
            <Route path="unit-activities" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_JUNIOR', 'TEACHER']}>
                <UnitActivitiesPage />
              </RoleGuard>
            } />
            <Route path="monthly-report" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <MonthlyReportSummaryPage />
              </RoleGuard>
            } />
            <Route path="monthly-comments" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <MonthlyReportCommentsPage />
              </RoleGuard>
            } />
            <Route path="monthly-report-preview" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <MonthlyReportPreviewPage />
              </RoleGuard>
            } />
            <Route path="monthly-report-template" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <MonthlyReportTemplatePage />
              </RoleGuard>
            } />
            <Route path="monthly-report-pdf" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <MonthlyReportPdfPage />
              </RoleGuard>
            } />
            <Route path="monthly-report-pdf-link" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <MonthlyReportPdfLinkPage />
              </RoleGuard>
            } />
            <Route path="aap" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL']}>
                <AAPStaffPage />
              </RoleGuard>
            } />
            <Route path="conference/admin" element={
              <RoleGuard roles={['SUPER_ADMIN']}>
                <ConferencePeriodManagement />
              </RoleGuard>
            } />
            <Route path="conference/workspace" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR']}>
                <TeacherConferenceWorkspace />
              </RoleGuard>
            } />
            <Route path="conference/tracker" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR']}>
                <StaffSmartGoalTrackerPage />
              </RoleGuard>
            } />

            <Route path="three-way-conference/settings" element={<Navigate to="/junior-high/conference/admin" replace />} />
            <Route path="three-way-conference/workspace" element={<Navigate to="/junior-high/conference/workspace" replace />} />
            <Route path="behavior/mtss" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
                <MTSSBehaviorLayout />
              </RoleGuard>
            }>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<MTSSBehaviorOverview />} />
              <Route path="cases" element={<CaseList />} />
              <Route path="cases/new" element={<CreateCase />} />
              <Route path="cases/:id" element={<CaseDetail />} />
              <Route path="spreadsheet" element={<MTSSBehaviorSpreadsheet />} />
              <Route path="timeline" element={<MTSSBehaviorTimeline />} />
              <Route path="analytics" element={<BehaviorAnalytics />} />
              <Route path="backup-config" element={
                <AdminGuard>
                  <MTSSBehaviorBackupConfigPage />
                </AdminGuard>
              } />
              <Route path="backup-diagnostics" element={
                <AdminGuard>
                  <MTSSBehaviorBackupDiagnostics />
                </AdminGuard>
              } />
            </Route>

            <Route path="academic/mtss" element={
              <RoleGuard roles={['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'BK_MENTOR', 'TEACHER']}>
                <MTSSAcademicLayout />
              </RoleGuard>
            }>
              <Route index element={<Navigate to="screening" replace />} />
              <Route path="overview" element={<MTSSAcademicOverview />} />
              <Route path="cases" element={<MTSSAcademicCases />} />
              <Route path="cases/:id" element={<MTSSAcademicCaseDetail />} />
              <Route path="coaching" element={<MTSSAcademicCoachingSpreadsheet />} />
              <Route path="screening" element={<MTSSAcademicScreening />} />
              <Route path="analytics" element={<MTSSAcademicOverview />} />
              <Route path="backup-config" element={
                <AdminGuard>
                  <MTSSAcademicBackupConfigPage />
                </AdminGuard>
              } />
              <Route path="backup-diagnostics" element={
                <AdminGuard>
                  <MTSSAcademicBackupDiagnostics />
                </AdminGuard>
              } />
            </Route>

            {/* Legacy Redirects */}
            <Route path="behavior/analytics" element={<Navigate to="/junior-high/behavior/mtss/analytics" replace />} />
          </Route>

          <Route path="mtss">
            <Route path="cases" element={<Navigate to="/junior-high/behavior/mtss/cases" replace />} />
            <Route path="create" element={<Navigate to="/junior-high/behavior/mtss/cases" replace />} />
            <Route path="case/:id" element={<LegacyCaseRedirect />} />
            <Route path="concern/new/:caseId" element={<AddConcern />} />
            <Route path="intervention/:id" element={<InterventionPlan />} />
            <Route path="cico/:caseId" element={<CICOTracker />} />
          </Route>
          
          <Route path="self-exploration">
            <Route index element={<SEDashboard />} />
            <Route path="periods" element={<SEPeriods />} />
            <Route path="activities" element={<SEActivities />} />
            <Route path="my" element={<SEMy />} />
            <Route path="my/:periodId/plan" element={<SEPlan />} />
            <Route path="my/:enrollmentId/details/:slotId" element={<SEDetails />} />
            <Route path="class" element={<SEClassView />} />
            <Route path="class/:classId" element={<SEClassView />} />
            <Route path="compilation" element={<SECompilation />} />
          </Route>

          {/* Student Portal */}
          <Route path="student">
             <Route index element={<Navigate to="dashboard" replace />} />
             <Route 
                path="dashboard" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentDashboard />
                  </RoleGuard>
                } 
             />
             <Route 
                path="learning-power-up" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <LearningPowerUpStudentPage />
                  </RoleGuard>
                } 
             />
             <Route 
                path="unit-activities" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentUnitActivitiesPage />
                  </RoleGuard>
                } 
             />
             <Route 
                path="goal-setting" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentGoalSettingPage />
                  </RoleGuard>
                } 
             />
             <Route 
                path="my-presentation" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentMyPresentationPage />
                  </RoleGuard>
                } 
             />
             <Route 
                path="smart-goal-tracker" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentSmartGoalTrackerPage />
                  </RoleGuard>
                } 
             />
             <Route 
                path="reports" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <MenuVisibilityGuard menuKey="reportCards">
                      <StudentReports />
                    </MenuVisibilityGuard>
                  </RoleGuard>
                } 
             />
             <Route 
                path="monthly-reports" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentMonthlyReports />
                  </RoleGuard>
                } 
             />
             <Route 
                path="aap" 
                element={
                  <RoleGuard roles={['STUDENT', 'SUPER_ADMIN']}>
                    <AAPStudentPage />
                  </RoleGuard>
                } 
             />
             <Route 
                path="weekly-report/:reportId" 
                element={
                  <RoleGuard roles={['STUDENT', 'PARENT', 'TEACHER', 'HEAD_UNIT', 'SUPER_ADMIN']}>
                    <MenuVisibilityGuard menuKey="reportCards">
                      <WeeklyReportDetail />
                    </MenuVisibilityGuard>
                  </RoleGuard>
                } 
             />
          </Route>

          {/* Parent Portal */}
          <Route path="parent">
             <Route index element={<Navigate to="dashboard" replace />} />
             <Route 
                path="dashboard" 
                element={
                  <RoleGuard roles={['PARENT', 'SUPER_ADMIN']}>
                    <ParentDashboard />
                  </RoleGuard>
                } 
             />
             <Route 
                path="reports" 
                element={
                  <RoleGuard roles={['PARENT', 'SUPER_ADMIN']}>
                    <MenuVisibilityGuard menuKey="reportCards">
                      <ParentReports />
                    </MenuVisibilityGuard>
                  </RoleGuard>
                } 
             />

             <Route 
                path="students" 
                element={
                  <RoleGuard roles={['PARENT', 'SUPER_ADMIN']}>
                    <ParentStudents />
                  </RoleGuard>
                } 
             />
          </Route>

          {/* Settings */}
          <Route path="settings">
             <Route 
                path="report-config" 
                element={
                  <RoleGuard roles={['HEAD_UNIT', 'SUPER_ADMIN']}>
                    <ReportConfigPage />
                  </RoleGuard>
                } 
             />
          </Route>
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
