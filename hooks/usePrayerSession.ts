import { useCallback, useEffect, useState } from 'react';
import {
  advancePrayerSequence,
  confirmFajrEarlySittingTimeout,
  confirmFourRakahEarlySittingTimeout,
  confirmMaghribEarlySittingTimeout,
  confirmPreSujudSittingTimeout,
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
    const startedAt = prayerState.preSujudSittingStartedAt;
    if (!startedAt) return;

    const timeout = setTimeout(() => {
      setPrayerState((current) =>
        current.preSujudSittingStartedAt === startedAt
          ? confirmPreSujudSittingTimeout(current)
          : current,
      );
    }, Math.max(0, startedAt + 10_000 - Date.now()));

    return () => clearTimeout(timeout);
  }, [prayerState.preSujudSittingStartedAt]);

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

  useEffect(() => {
    const startedAt = prayerState.maghribEarlySittingStartedAt;
    if (!startedAt) return;

    const timeout = setTimeout(() => {
      setPrayerState((current) =>
        current.maghribEarlySittingStartedAt === startedAt
          ? confirmMaghribEarlySittingTimeout(current)
          : current,
      );
    }, Math.max(0, startedAt + 10_000 - Date.now()));

    return () => clearTimeout(timeout);
  }, [prayerState.maghribEarlySittingStartedAt]);

  useEffect(() => {
    const startedAt = prayerState.fourRakahEarlySittingStartedAt;
    if (!startedAt) return;

    const timeout = setTimeout(() => {
      setPrayerState((current) =>
        current.fourRakahEarlySittingStartedAt === startedAt
          ? confirmFourRakahEarlySittingTimeout(current)
          : current,
      );
    }, Math.max(0, startedAt + 10_000 - Date.now()));

    return () => clearTimeout(timeout);
  }, [prayerState.fourRakahEarlySittingStartedAt]);

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
