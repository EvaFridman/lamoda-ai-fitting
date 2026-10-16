import type { StorageService } from '../../storage/storage.service.js';
import { createFileActivities } from './files.activities.js';
import { createHelloActivities } from './hello.activities.js';

// Every activity the worker registers, with the services they need from its Nest context
// (run-worker.ts). Workflow code imports only their types, from the files that define them.
export function createActivities(storage: StorageService) {
  return { ...createHelloActivities(), ...createFileActivities(storage) };
}
