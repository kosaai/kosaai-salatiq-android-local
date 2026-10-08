import type { ActiveSahwEvent, SahwAlert } from '../types/prayer';

/** Read-only audio boundary: no engine state, detection rules or event IDs change. */
export function createSahwAudioEventTracker() {
  let trackedSession: number | null = null;
  let processedAlerts = 0;
  let activatedEvents = new WeakSet<ActiveSahwEvent>();

  return {
    consume(sessionId: number, alerts: readonly SahwAlert[], activeEvent: ActiveSahwEvent | null) {
      if (trackedSession !== sessionId) {
        trackedSession = sessionId;
        processedAlerts = 0;
        activatedEvents = new WeakSet();
      }

      // The existing engine appends history; only a new session resets it.
      // Array positions distinguish new alerts without inventing an engine ID.
      const newAlerts = Math.max(0, alerts.length - processedAlerts);
      processedAlerts = alerts.length;
      const newActivation = activeEvent !== null && !activatedEvents.has(activeEvent);
      if (activeEvent) activatedEvents.add(activeEvent);

      // startActiveSahwEvent creates one object, retained until recovery. A new
      // activation may reuse an already-reported alert, so type/stage keys alone
      // are insufficient. A simultaneous history append + activation is ONE event.
      return Math.max(newAlerts, newActivation ? 1 : 0);
    },
  };
}
