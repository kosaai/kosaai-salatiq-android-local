import { useCallback, useEffect, useState } from 'react';
import {
  advancePrayerSequence,
  confirmPostSujudTransitionTimeout,
  confirmPreSujudTransitionTimeout,
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
    const startedAt = prayerState.preSujudTransitionStartedAt;
    if (!startedAt) return;

    const timeout = setTimeout(() => {
      setPrayerState((current) =>
        current.preSujudTransitionStartedAt === startedAt
          ? confirmPreSujudTransitionTimeout(current)
          : current,
      );
    }, Math.max(0, startedAt + 10_000 - Date.now()));

    return () => clearTimeout(timeout);
  }, [prayerState.preSujudTransitionStartedAt]);

  useEffect(() => {
    const startedAt = prayerState.postSujudTransitionStartedAt;
    if (!startedAt) return;

    const timeout = setTimeout(() => {
      setPrayerState((current) =>
        current.postSujudTransitionStartedAt === startedAt
          ? confirmPostSujudTransitionTimeout(current)
          : current,
      );
    }, Math.max(0, startedAt + 10_000 - Date.now()));

    return () => clearTimeout(timeout);
  }, [prayerState.postSujudTransitionStartedAt]);

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
