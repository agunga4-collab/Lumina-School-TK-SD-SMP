import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  limit,
  orderBy,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { AttendanceSyncResult } from '../types';
import { attendanceSyncService, GenericAttendanceRecord } from './attendanceBackupConfigService';

interface SyncResultItem {
  id: string;
  success: boolean;
  error?: string;
}

interface BatchSyncPayload {
  classId: string;
  date: string;
  academicYearId: string;
  semester: string;
  recordIds: string[];
}

interface DhuhurBatchSyncPayload {
  classId: string;
  date: string;
  academicYearId: string;
  semester: string;
  recordIds: string[];
}

/**
 * Service to handle retry logic and manual resync for Attendance Backup
 */
export const attendanceBackupRetryService = {
  /**
   * Mark a sync attempt as failed in Firestore
   */
  async markAttendanceSyncFailed(recordId: string, error: string, collectionName: string = 'attendance_records'): Promise<void> {
    try {
      const docRef = doc(db, collectionName, recordId);
      const docSnap = await getDoc(docRef);
      const currentRetryCount = docSnap.exists() ? (docSnap.data().retryCount || 0) : 0;
      
      await updateDoc(docRef, {
        syncStatus: 'FAILED',
        syncError: error,
        lastSyncAt: Date.now(),
        retryCount: currentRetryCount + 1
      });
    } catch (err) {
      console.error('Error marking sync failed:', err);
    }
  },

  /**
   * Mark a sync attempt as success in Firestore
   */
  async markAttendanceSyncSuccess(recordId: string, collectionName: string = 'attendance_records'): Promise<void> {
    try {
      const docRef = doc(db, collectionName, recordId);
      await updateDoc(docRef, {
        syncStatus: 'SYNCED',
        syncError: null,
        lastSyncAt: Date.now()
      });
    } catch (err) {
      console.error('Error marking sync success:', err);
    }
  },

  /**
   * Retry sync for a single record
   */
  async retryAttendanceSyncForRecord(recordId: string, collectionName: string = 'attendance_records'): Promise<AttendanceSyncResult> {
    try {
      const docRef = doc(db, collectionName, recordId);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        return { recordId, success: false, timestamp: Date.now(), error: 'Record not found' };
      }

      const rawData = snap.data();
      const record: GenericAttendanceRecord = {
        id: recordId,
        studentId: rawData.studentId,
        classId: rawData.classId,
        semester: String(rawData.semester),
        date: rawData.date,
        status: rawData.status,
        backupType: rawData.backupType,
        academicYear: rawData.academicYear,
        academicYearId: rawData.academicYearId,
        studentName: rawData.studentName || rawData.studentNameSnapshot,
        studentNameSnapshot: rawData.studentNameSnapshot,
        classNameSnapshot: rawData.classNameSnapshot,
        note: rawData.note
      };
      const result = await attendanceSyncService.triggerSync(record);
      
      if (result.success) {
        await this.markAttendanceSyncSuccess(recordId, collectionName);
      } else {
        await this.markAttendanceSyncFailed(recordId, result.error || 'Unknown error during retry', collectionName);
      }
      
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Retry failed';
      await this.markAttendanceSyncFailed(recordId, msg, collectionName);
      return { recordId, success: false, timestamp: Date.now(), error: msg };
    }
  },

  /**
   * Retry all failed records for a specific class and date range
   */
  async retryAttendanceSyncForClassAndDateRange(
    classId: string, 
    startDate: string, 
    endDate: string
  ): Promise<{ total: number; success: number; failed: number }> {
    try {
      const q = query(
        collection(db, 'attendance_records'),
        where('classId', '==', classId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        where('syncStatus', '==', 'FAILED')
      );
      
      const snap = await getDocs(q);
      let successCount = 0;
      let failedCount = 0;

      // Group records by date to batch-sync them
      const recordsByDate = new Map<string, string[]>();
      const recordDocsMap = new Map<string, GenericAttendanceRecord>();

      snap.docs.forEach(d => {
        const rawData = d.data();
        const dateStr = rawData.date;
        if (!recordsByDate.has(dateStr)) {
          recordsByDate.set(dateStr, []);
        }
        recordsByDate.get(dateStr)!.push(d.id);
        
        recordDocsMap.set(d.id, {
          id: d.id,
          studentId: rawData.studentId,
          classId: rawData.classId,
          semester: String(rawData.semester),
          date: rawData.date,
          status: rawData.status,
          backupType: rawData.backupType,
          academicYear: rawData.academicYear,
          academicYearId: rawData.academicYearId,
          studentName: rawData.studentName,
          note: rawData.note
        });
      });

      const idToken = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      for (const [dateStr, recordIds] of recordsByDate.entries()) {
        try {
          const firstRec = recordDocsMap.get(recordIds[0]);
          if (!firstRec) {
            failedCount += recordIds.length;
            continue;
          }

          const response = await fetch('/api/attendance/sync-batch', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              classId,
              date: dateStr,
              academicYearId: (firstRec.academicYear || '').replace(/\//g, '-'),
              semester: firstRec.semester,
              recordIds
            })
          });

          if (response.ok) {
            const resData = await response.json();
            const results = (resData.results || []) as SyncResultItem[];
            results.forEach(r => {
              if (r.success) {
                successCount++;
              } else {
                failedCount++;
              }
            });
          } else {
            failedCount += recordIds.length;
          }
        } catch (err) {
          console.error(`Error syncing batch for date ${dateStr}:`, err);
          failedCount += recordIds.length;
        }
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return { total: snap.size, success: successCount, failed: failedCount };
    } catch (error) {
      console.error('Error in batch retry:', error);
      throw error;
    }
  },

  /**
   * Retry all failed syncs across the system (with limit)
   */
  async retryAllFailedAttendanceSyncs(maxLimit: number = 50): Promise<{ processed: number; success: number }> {
    try {
      const qDaily = query(
        collection(db, 'attendance_records'),
        where('syncStatus', '==', 'FAILED'),
        orderBy('updatedAt', 'asc'),
        limit(maxLimit)
      );
      const snapDaily = await getDocs(qDaily);
      const dailyRecords = snapDaily.docs.map(d => ({ id: d.id, data: d.data() }));

      const qDhuhur = query(
        collection(db, 'dhuhur_attendance_records'),
        where('syncStatus', '==', 'FAILED'),
        orderBy('updatedAt', 'asc'),
        limit(maxLimit)
      );
      const snapDhuhur = await getDocs(qDhuhur);
      const dhuhurRecords = snapDhuhur.docs.map(d => ({ id: d.id, data: d.data() }));

      let successCount = 0;
      let totalProcessed = 0;

      const idToken = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      // Group daily records by classId and date
      const dailyGroups = new Map<string, { classId: string, date: string, academicYear: string, semester: string, recordIds: string[] }>();
      dailyRecords.forEach(item => {
        const key = `${item.data.classId}_${item.data.date}`;
        if (!dailyGroups.has(key)) {
          dailyGroups.set(key, {
            classId: item.data.classId,
            date: item.data.date,
            academicYear: item.data.academicYear,
            semester: String(item.data.semester),
            recordIds: []
          });
        }
        dailyGroups.get(key)!.recordIds.push(item.id);
      });

      // Group Dhuhur records by classId and date
      const dhuhurGroups = new Map<string, { classId: string, date: string, academicYearId: string, semester: string, recordIds: string[] }>();
      dhuhurRecords.forEach(item => {
        const key = `${item.data.classId}_${item.data.date}`;
        if (!dhuhurGroups.has(key)) {
          dhuhurGroups.set(key, {
            classId: item.data.classId,
            date: item.data.date,
            academicYearId: item.data.academicYearId,
            semester: String(item.data.semester),
            recordIds: []
          });
        }
        dhuhurGroups.get(key)!.recordIds.push(item.id);
      });

      // Process Daily batches
      for (const group of dailyGroups.values()) {
        try {
          const response = await fetch('/api/attendance/sync-batch', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              classId: group.classId,
              date: group.date,
              academicYearId: group.academicYear.replace(/\//g, '-'),
              semester: group.semester,
              recordIds: group.recordIds
            })
          });
          if (response.ok) {
            const resData = await response.json();
            const results = (resData.results || []) as SyncResultItem[];
            results.forEach(r => {
              if (r.success) successCount++;
            });
          }
          totalProcessed += group.recordIds.length;
        } catch (err) {
          console.error('Error in daily batch retry:', err);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Process Dhuhur batches
      for (const group of dhuhurGroups.values()) {
        try {
          const response = await fetch('/api/attendance/dhuhur/sync-batch', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              classId: group.classId,
              date: group.date,
              academicYearId: group.academicYearId,
              semester: group.semester,
              recordIds: group.recordIds
            })
          });
          if (response.ok) {
            const resData = await response.json();
            const results = (resData.results || []) as SyncResultItem[];
            results.forEach(r => {
              if (r.success) successCount++;
            });
          }
          totalProcessed += group.recordIds.length;
        } catch (err) {
          console.error('Error in Dhuhur batch retry:', err);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return { processed: totalProcessed, success: successCount };
    } catch (error) {
      console.error('Error in global retry:', error);
      throw error;
    }
  }
};
