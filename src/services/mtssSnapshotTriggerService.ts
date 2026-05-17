import { mtssAcademicDriveService } from './mtssAcademicDriveService.ts';
import { mtssBehaviorDriveService } from './mtssBehaviorDriveService.ts';
import { db } from '../lib/firebase.ts';
import { doc, updateDoc } from 'firebase/firestore';

type ModuleType = 'ACADEMIC' | 'BEHAVIOR';

class MTSSSnapshotTriggerService {
  private debouncers: Map<string, NodeJS.Timeout> = new Map();
  private DEBOUNCE_DELAY = 10000; // 10 seconds to allow grouping multiple edits

  /**
   * Main entry point to trigger a snapshot sync.
   * Implements a debounced call to avoid spamming the Shared Drive.
   */
  async trigger(moduleType: ModuleType, caseId: string) {
    const key = `${moduleType}_${caseId}`;

    // 1. Mark as Pending in Firestore immediately (Audit/Diagnostics awareness)
    await this.markPending(moduleType, caseId);

    // 2. Clear existing timeout if any (Deduplication)
    if (this.debouncers.has(key)) {
      clearTimeout(this.debouncers.get(key)!);
    }

    // 3. Set new timeout
    const timeout = setTimeout(async () => {
      try {
        console.log(`[SnapshotTrigger] Executing debounced sync for ${key}...`);
        if (moduleType === 'ACADEMIC') {
          await mtssAcademicDriveService.syncSnapshot(caseId);
        } else {
          await mtssBehaviorDriveService.syncSnapshot(caseId);
        }
        this.debouncers.delete(key);
      } catch (error) {
        console.error(`[SnapshotTrigger] Automated sync failed for ${key}:`, error);
        // Error handling is managed inside the sync services (updates Firestore with status FAILED)
        this.debouncers.delete(key);
      }
    }, this.DEBOUNCE_DELAY);

    this.debouncers.set(key, timeout);
  }

  private async markPending(moduleType: ModuleType, caseId: string) {
    try {
      const collectionName = moduleType === 'ACADEMIC' ? 'mtssAcademicCases' : 'behaviorCases';
      const caseRef = doc(db, collectionName, caseId);
      
      await updateDoc(caseRef, {
        snapshotSyncStatus: 'PENDING',
        snapshotNeedsRefresh: true,
        snapshotLastTriggeredAt: Date.now()
      });
    } catch (error) {
      console.error(`[SnapshotTrigger] Failed to mark case ${caseId} as pending:`, error);
    }
  }

  /**
   * Immediate trigger for high-priority events if needed,
   * but usually debounce is safer.
   */
  async triggerImmediate(moduleType: ModuleType, caseId: string) {
    // Clear any pending debounce
    const key = `${moduleType}_${caseId}`;
    if (this.debouncers.has(key)) {
      clearTimeout(this.debouncers.get(key)!);
      this.debouncers.delete(key);
    }

    await this.markPending(moduleType, caseId);
    if (moduleType === 'ACADEMIC') {
      return mtssAcademicDriveService.syncSnapshot(caseId);
    } else {
      return mtssBehaviorDriveService.syncSnapshot(caseId);
    }
  }
}

export const mtssSnapshotTriggerService = new MTSSSnapshotTriggerService();
