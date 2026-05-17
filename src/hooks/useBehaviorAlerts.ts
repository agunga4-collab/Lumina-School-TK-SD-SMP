import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  getMTSSCases, 
  getMTSSConcerns, 
  getCICODailyReport, 
  getTeachers, 
  createBehaviorAlert,
  getBIPPlan
} from '../lib/firebase';
import { MTSSCase, BehaviorNotification, User as AppUser, BIPPlan } from '../types';

export function useBehaviorAlerts() {
  const { profile } = useAuth();

  useEffect(() => {
    // Only Counselor, Principal, or Admin can trigger scans
    if (!profile || !['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'].includes(profile.role)) return;

    const runScan = async () => {
      // Check last check time to avoid spamming scans
      const lastCheck = sessionStorage.getItem('mtss_last_scan');
      if (lastCheck && Date.now() - parseInt(lastCheck) < 60 * 60 * 1000) return; // Check once per hour

      console.log("[useBehaviorAlerts] Running diagnostic scan...");
      
      try {
        const cases = await getMTSSCases({ status: 'OPEN' }); // Also need IN_PROGRESS
        const inProgressCases = await getMTSSCases({ status: 'IN_PROGRESS' });
        const underReviewCases = await getMTSSCases({ status: 'UNDER_REVIEW' });
        const allActiveCases = [...cases, ...inProgressCases, ...underReviewCases];
        
        const allTeachers = await getTeachers();
        const counselors = allTeachers.filter(t => ['BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN'].includes(t.role));
        const counselorIds = counselors.map(c => c.uid);

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const isFriday = now.getDay() === 5;

        for (const mtCase of allActiveCases) {
          // ALERT-T1-01: No updates > 7 days
          if (Date.now() - mtCase.lastUpdatedAt > 7 * 24 * 60 * 60 * 1000) {
            await createBehaviorAlert({
              type: 'ALERT-T1-01',
              severity: 'WARNING',
              title: 'Kasus Tidak Diupdate',
              message: `${mtCase.studentName} — kasus ${mtCase.tier} belum diupdate sejak ${Math.floor((Date.now() - mtCase.lastUpdatedAt) / (24*60*60*1000))} hari.`,
              caseId: mtCase.id,
              studentId: mtCase.studentId,
              studentName: mtCase.studentName,
              targetUserIds: [mtCase.picId, ...counselorIds],
              actionUrl: `/mtss/case/${mtCase.id}`
            });
          }

          // ALERT-T1-03: Next Steps Overdue
          const concerns = await getMTSSConcerns(mtCase.id);
          const overdueConcern = concerns.find(c => !c.isDone && c.nextStepDueDate && new Date(c.nextStepDueDate) < now);
          if (overdueConcern) {
            await createBehaviorAlert({
              type: 'ALERT-T1-03',
              severity: 'WARNING',
              title: 'Next Steps Overdue',
              message: `Next steps untuk ${mtCase.studentName} jatuh tempo ${overdueConcern.nextStepDueDate}. Mohon update status.`,
              caseId: mtCase.id,
              studentId: mtCase.studentId,
              studentName: mtCase.studentName,
              targetUserIds: [mtCase.picId, ...counselorIds], // Should ideally include specific PIC of next step
              actionUrl: `/mtss/case/${mtCase.id}`
            });
          }

          // ALERT-T2-01: CICO Belum Diisi Hari Ini (after 15:00)
          if (mtCase.tier === 'Tier 2' && now.getHours() >= 15 && now.getDay() >= 1 && now.getDay() <= 5) {
            const todayCico = await getCICODailyReport(mtCase.id, todayStr);
            if (!todayCico) {
               await createBehaviorAlert({
                 type: 'ALERT-T2-01',
                 severity: 'INFO',
                 title: 'CICO Belum Diisi Hari Ini',
                 message: `CICO ${mtCase.studentName} belum diisi hari ini. Isi sebelum akhir hari.`,
                 caseId: mtCase.id,
                 studentId: mtCase.studentId,
                 studentName: mtCase.studentName,
                 targetUserIds: [mtCase.picId], // Target the teacher
                 actionUrl: `/mtss/case/${mtCase.id}`
               });
            }
          }

          // ALERT-T3-01: Review BIP Jatuh Tempo (> 60 days)
          if (mtCase.tier === 'Tier 3') {
             const bip = await getBIPPlan(mtCase.id);
             if (bip && Date.now() - bip.updatedAt > 60 * 24 * 60 * 60 * 1000) {
                await createBehaviorAlert({
                  type: 'ALERT-T3-01',
                  severity: 'HIGH',
                  title: 'Review BIP Jatuh Tempo',
                  message: `BIP ${mtCase.studentName} belum direview sejak ${Math.floor((Date.now() - bip.updatedAt) / (24*60*60*1000))} hari.`,
                  caseId: mtCase.id,
                  studentId: mtCase.studentId,
                  studentName: mtCase.studentName,
                  targetUserIds: counselorIds,
                  actionUrl: `/mtss/case/${mtCase.id}`
                });
             }
          }
          
          // ALERT-T3-02: Home Programme Belum Diisi Counselor (Friday)
          if (isFriday && (mtCase.tier === 'Tier 2' || mtCase.tier === 'Tier 3')) {
             if (!mtCase.homeProgramme?.isVisibleToParent || !mtCase.homeProgramme?.motivationMessage) {
                await createBehaviorAlert({
                  type: 'ALERT-T3-02',
                  severity: 'WARNING',
                  title: 'Home Programme Belum Lengkap',
                  message: `Catatan Home Programme minggu ini untuk ${mtCase.studentName} belum diisi.`,
                  caseId: mtCase.id,
                  studentId: mtCase.studentId,
                  studentName: mtCase.studentName,
                  targetUserIds: counselorIds,
                  actionUrl: `/mtss/case/${mtCase.id}`
                });
             }
          }
        }

        sessionStorage.setItem('mtss_last_scan', Date.now().toString());
      } catch (err) {
        console.error("[useBehaviorAlerts] Scan failed:", err);
      }
    };

    runScan();
  }, [profile]);
}
