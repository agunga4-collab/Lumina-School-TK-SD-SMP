import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  limit,
  orderBy,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AttendanceRecord, AttendanceSyncResult } from '../types';
import { attendanceSyncService } from './attendanceBackupConfigService';

/**
 * Service to handle retry logic and manual resync for Attendance Backup
 */
export const attendanceBackupRetryService = {
  /**
   * Mark a sync attempt as failed in Firestore
   */
  async markAttendanceSyncFailed(recordId: string, error: string): Promise<void> {
    try {
      const docRef = doc(db, 'attendance_records', recordId);
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
  async markAttendanceSyncSuccess(recordId: string): Promise<void> {
    try {
      const docRef = doc(db, 'attendance_records', recordId);
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
  async retryAttendanceSyncForRecord(recordId: string): Promise<AttendanceSyncResult> {
    try {
      const docRef = doc(db, 'attendance_records', recordId);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        return { recordId, success: false, timestamp: Date.now(), error: 'Record not found' };
      }

      const record = snap.data() as AttendanceRecord;
      const result = await attendanceSyncService.triggerSync(record);
      
      if (result.success) {
        await this.markAttendanceSyncSuccess(recordId);
      } else {
        await this.markAttendanceSyncFailed(recordId, result.error || 'Unknown error during retry');
      }
      
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Retry failed';
      await this.markAttendanceSyncFailed(recordId, msg);
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

      // Process in sequence with small delay to avoid rate limits
      for (const d of snap.docs) {
        const result = await this.retryAttendanceSyncForRecord(d.id);
        if (result.success) successCount++;
        else failedCount++;
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
      const q = query(
        collection(db, 'attendance_records'),
        where('syncStatus', '==', 'FAILED'),
        orderBy('updatedAt', 'asc'),
        limit(maxLimit)
      );
      
      const snap = await getDocs(q);
      let successCount = 0;

      for (const d of snap.docs) {
        const result = await this.retryAttendanceSyncForRecord(d.id);
        if (result.success) successCount++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return { processed: snap.size, success: successCount };
    } catch (error) {
      console.error('Error in global retry:', error);
      throw error;
    }
  }
};
