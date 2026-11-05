/** Production wiring of the storage cleanup (`storage-cleanup.ts`): real database, driver and stored-files lifecycle. Free of `astro:*` imports. */
import { db } from './db';
import { countExpiredPendingUploads, pendingSweepCutoff, sweepPendingUploads } from './pending-uploads';
import { driver } from './storage';
import { cleanupStorage, type CleanupOptions } from './storage-cleanup';
import { discardFiles } from './stored-files';

export function runStorageCleanup(options: CleanupOptions = {}) {
    return cleanupStorage(
        {
            db,
            driver,
            discard: discardFiles,
            sweepPending: () => sweepPendingUploads(),
            countExpiredPending: () => countExpiredPendingUploads(),
            pendingSweepCutoff: (now) => pendingSweepCutoff(now),
        },
        options,
    );
}
