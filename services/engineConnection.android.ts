import { localClassification } from '../modules/local-classification';
import type { EngineStatus } from '../types/prayer';

export function getEngineApiUrl(): null {
  return null;
}

/** Local native-module/bundled-asset availability; no HTTP health check. */
export async function checkEngineConnection(): Promise<EngineStatus> {
  try {
    return (await localClassification?.checkAvailability()) ? 'connected' : 'error';
  } catch {
    return 'error';
  }
}
