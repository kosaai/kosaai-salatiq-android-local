import { useCallback, useEffect, useState } from 'react';
import {
  advancePrayerSequence,
  confirmFajrEarlySittingTimeout,
  createInitialPrayerState,
  normalizePrayerEngineState,
} from '../services/prayerEngine';
import type { CameraStatus, PrayerEngineEvent, PrayerState, PrayerType } from '../types/prayer';

export function usePrayerSession() {
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerType>('FAJR');
  const [prayerState, setPrayerState] = useState<PrayerState>(() =>
    createInitialPrayerState('FAJR'),
  );
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('OFF');
  const [sessionId, setSessionId] = useState(0);

  useEffect(() => {
    const startedAt = prayerState.fajrEarlySittingStartedAt;
    if (!startedAt) return;

    const timeout = setTimeout(() => {
      setPrayerState((current) =>
        current.fajrEarlySittingStartedAt === startedAt
          ? confirmFajrEarlySittingTimeout(current)
          : current,
      );
    }, Math.max(0, startedAt + 10_000 - Date.now()));

    return () => clearTimeout(timeout);
  }, [prayerState.fajrEarlySittingStartedAt]);

  const selectPrayer = useCallback((prayer: PrayerType) => {
    if (prayer === selectedPrayer) return;

    setSelectedPrayer(prayer);
    setPrayerState(createInitialPrayerState(prayer));
    setSessionId((current) => current + 1);
  }, [selectedPrayer]);

  const startNewPrayerSession = useCallback(() => {
    setPrayerState(createInitialPrayerState(selectedPrayer));
    setSessionId((current) => current + 1);
  }, [selectedPrayer]);

  const applyEngineEvent = useCallback((event: PrayerEngineEvent) => {
    setPrayerState((current) => {
      const normalized = normalizePrayerEngineState(event.state);
      const nextState = { ...current, ...normalized };

      return normalized.currentPose ? advancePrayerSequence(nextState, normalized.currentPose) : nextState;
    });
  }, []);

  return {
    selectedPrayer,
    prayerState,
    cameraStatus,
    sessionId,
    selectPrayer,
    startNewPrayerSession,
    setCameraStatus,
    applyEngineEvent,
  };
}
