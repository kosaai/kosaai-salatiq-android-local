import type {
  PrayerEngineEvent,
  PrayerPose,
  PrayerSequenceState,
  SahwAlert,
  SahwSkippedStage,
  SahwAlertType,
  PrayerStage,
  PrayerState,
  PrayerType,
} from '../types/prayer';
import { prayerConfig } from '../constants/prayers';
import { fajrSequence, type PrayerSequenceStage } from '../constants/fajrSequence';
import { maghribSequence } from '../constants/maghribSequence';
import { fourRakahSequence } from '../constants/fourRakahSequence';

export function createInitialPrayerState(prayer: PrayerType = 'FAJR'): PrayerState {
  return {
    prayerType: prayer,
    currentPose: null,
    prayerStage: null,
    confidence: null,
    currentRakah: 1,
    totalRakahs: prayerConfig[prayer].rakahs,
    currentSujud: 0,
    sequence: {
      pendingBowing: false,
      rukuDone: false,
      awaitingFirstTashahhud: false,
      awaitingFinalTashahhud: false,
    },
    sahwWarning: null,
    sahwAlerts: [],
    expectedIndex: 0,
    completedStageIds: [],
    skippedStageIds: [],
    prayerCompleted: false,
    firstTashahhudStartedAt: null,
    fajrEarlySittingStartedAt: null,
    maghribEarlySittingStartedAt: null,
    fourRakahEarlySittingStartedAt: null,
    prayerStarted: false,
  };
}

const poses: ReadonlySet<PrayerPose> = new Set([
  'STANDING',
  'BOWING',
  'PROSTRATING',
  'SITTING',
  'TRANSITION',
  'UNKNOWN',
]);

const stages: ReadonlySet<Exclude<PrayerStage, null>> = new Set([
  'STANDING',
  'BOWING',
  'ITIDAL',
  'SUJUD_1',
  'SITTING_BETWEEN_SUJUD',
  'SUJUD_2',
  'TASHAHHUD',
]);

const sahwMessages: Record<SahwAlertType, string> = {
  MISSING_BOWING: 'تم تجاوز الركوع',
  MISSING_SECOND_SUJUD: 'تم تجاوز السجود الثاني',
  EXTRA_BOWING: 'ركوع زائد',
  EXTRA_SUJUD: 'تم رصد سجود زائد',
  MISSING_STAGE: 'تم تجاوز مرحلة من الصلاة',
  EXTRA_STAGE: 'تم تكرار مرحلة من الصلاة',
  EXTRA_RAKAH: 'تم البدء بركعة زائدة بعد إتمام ركعتي الفجر',
  EARLY_TASHAHHUD: 'تم الجلوس للتشهد قبل إكمال الركعة الثانية',
};

const sahwSkippedStages: Record<SahwAlertType, SahwSkippedStage[]> = {
  MISSING_BOWING: [{ stage: 'BOWING' }],
  MISSING_SECOND_SUJUD: [{ stage: 'SUJUD_2' }],
  EXTRA_BOWING: [],
  EXTRA_SUJUD: [],
  MISSING_STAGE: [],
  EXTRA_STAGE: [],
  EXTRA_RAKAH: [],
  EARLY_TASHAHHUD: [],
};

function addSahwAlert(
  state: PrayerState,
  type: SahwAlertType,
  rakah = state.currentRakah,
): PrayerState {
  const alert: SahwAlert = {
    type,
    kind: type.startsWith('MISSING') ? 'MISSING' : 'EXTRA',
    rakah,
    message_ar: sahwMessages[type],
    skippedStages: sahwSkippedStages[type],
  };
  const hasAlreadyBeenReported = state.sahwAlerts.some(
    (item) => item.type === alert.type && item.rakah === alert.rakah,
  );

  if (hasAlreadyBeenReported) return state;

  return {
    ...state,
    sahwWarning: alert.message_ar,
    sahwAlerts: [...state.sahwAlerts, alert],
  };
}

/**
 * Single normalization boundary for future API/YOLO engine events.
 * UI code reads PrayerState only and never parses transport responses.
 */
export function normalizePrayerEngineState(
  update: PrayerEngineEvent['state'],
): Partial<PrayerState> {
  const normalized: Partial<PrayerState> = {};

  if (update.currentPose === null || (update.currentPose && poses.has(update.currentPose))) {
    normalized.currentPose = update.currentPose;
  }

  if (update.prayerStage === null || (update.prayerStage && stages.has(update.prayerStage))) {
    normalized.prayerStage = update.prayerStage;
  }

  if (
    update.confidence === null ||
    (typeof update.confidence === 'number' &&
      Number.isFinite(update.confidence) &&
      update.confidence >= 0 &&
      update.confidence <= 1)
  ) {
    normalized.confidence = update.confidence;
  }

  if (typeof update.currentRakah === 'number') normalized.currentRakah = update.currentRakah;
  if (typeof update.totalRakahs === 'number') normalized.totalRakahs = update.totalRakahs;
  if (typeof update.currentSujud === 'number') normalized.currentSujud = update.currentSujud;
  if (typeof update.prayerStarted === 'boolean') normalized.prayerStarted = update.prayerStarted;
  if (update.sahwWarning === null || typeof update.sahwWarning === 'string') {
    normalized.sahwWarning = update.sahwWarning;
  }

  return normalized;
}

export function getTotalRakahs(prayer: PrayerType) {
  return prayerConfig[prayer].rakahs;
}

function completeSecondSujud(state: PrayerState, sequence: PrayerSequenceState): PrayerState {
  const isFinalRakah = state.currentRakah === state.totalRakahs;
  const needsFirstTashahhud = state.currentRakah === 2 && state.totalRakahs > 2;

  return {
    ...state,
    prayerStage: 'SUJUD_2',
    currentSujud: 2,
    currentRakah:
      isFinalRakah || needsFirstTashahhud ? state.currentRakah : state.currentRakah + 1,
    sequence: {
      ...sequence,
      pendingBowing: false,
      awaitingFirstTashahhud: needsFirstTashahhud,
      awaitingFinalTashahhud: isFinalRakah,
    },
  };
}

/**
 * Advances the prayer sequence from one stable pose only.
 * TRANSITION and UNKNOWN deliberately do not advance any stage or counter.
 */
function advanceBasePrayerSequence(state: PrayerState, pose: PrayerPose): PrayerState {
  if (pose === 'TRANSITION' || pose === 'UNKNOWN') {
    return { ...state, currentPose: pose };
  }

  const nextState = { ...state, currentPose: pose };
  const sequence = { ...state.sequence };

  switch (pose) {
    case 'BOWING':
      if (sequence.rukuDone) {
        return addSahwAlert(nextState, 'EXTRA_BOWING');
      }

      if (state.prayerStage === 'STANDING') {
        return {
          ...nextState,
          prayerStage: 'BOWING',
          sequence: { ...sequence, pendingBowing: true },
        };
      }
      return nextState;

    case 'STANDING':
      if (sequence.pendingBowing) {
        return {
          ...nextState,
          prayerStage: 'ITIDAL',
          sequence: { ...sequence, pendingBowing: false, rukuDone: true },
        };
      }

      if (sequence.awaitingFirstTashahhud) {
        return {
          ...nextState,
          prayerStage: 'STANDING',
          currentRakah: state.currentRakah + 1,
          currentSujud: 0,
          sequence: { ...sequence, awaitingFirstTashahhud: false, rukuDone: false },
        };
      }

      if (sequence.awaitingFinalTashahhud) {
        return nextState;
      }

      if (
        state.prayerStage === 'SUJUD_1' ||
        state.prayerStage === 'SITTING_BETWEEN_SUJUD'
      ) {
        return {
          ...addSahwAlert(nextState, 'MISSING_SECOND_SUJUD'),
          prayerStage: 'STANDING',
          currentRakah:
            state.currentRakah < state.totalRakahs ? state.currentRakah + 1 : state.currentRakah,
          currentSujud: 0,
          sequence: { ...sequence, pendingBowing: false, rukuDone: false },
        };
      }

      return {
        ...nextState,
        prayerStage: 'STANDING',
        currentSujud: 0,
        sequence:
          state.prayerStage === 'SUJUD_2'
            ? { ...sequence, rukuDone: false }
            : sequence,
      };

    case 'PROSTRATING':
      if (sequence.pendingBowing) {
        sequence.pendingBowing = false;
        return {
          ...(usesSingleSahwAlert(state.prayerType)
            ? nextState
            : addSahwAlert(nextState, 'MISSING_BOWING')),
          prayerStage: 'SUJUD_1',
          currentSujud: 1,
          sequence,
        };
      }

      if (state.prayerStage === 'SITTING_BETWEEN_SUJUD') {
        return completeSecondSujud(nextState, sequence);
      }

      if (state.prayerStage === 'SUJUD_1') {
        return completeSecondSujud(nextState, sequence);
      }

      if (state.prayerStage === 'STANDING') {
        return {
          ...addSahwAlert(nextState, 'MISSING_BOWING'),
          prayerStage: 'SUJUD_1',
          currentSujud: 1,
          sequence,
        };
      }

      if (state.prayerStage === 'ITIDAL') {
        return {
          ...nextState,
          prayerStage: 'SUJUD_1',
          currentSujud: 1,
          sequence,
        };
      }

      if (state.prayerStage === 'SUJUD_2') {
        const completedRakah =
          sequence.awaitingFirstTashahhud || sequence.awaitingFinalTashahhud
            ? state.currentRakah
            : state.currentRakah - 1;
        return addSahwAlert(nextState, 'EXTRA_SUJUD', completedRakah);
      }

      return { ...nextState, sequence };

    case 'SITTING':
      if (state.prayerStage === 'SUJUD_1') {
        return {
          ...nextState,
          prayerStage: 'SITTING_BETWEEN_SUJUD',
          currentSujud: 1,
          sequence,
        };
      }

      if (
        state.prayerStage === 'SUJUD_2' &&
        (sequence.awaitingFirstTashahhud || sequence.awaitingFinalTashahhud)
      ) {
        return { ...nextState, prayerStage: 'TASHAHHUD', sequence };
      }

      return { ...nextState, sequence };

    default:
      return nextState;
  }
}

function addFajrAlert(
  state: PrayerState,
  type: 'MISSING_STAGE' | 'EXTRA_STAGE' | 'EXTRA_RAKAH',
  stage: PrayerSequenceStage | null,
): PrayerState {
  const stageId = stage?.id ?? 'EXTRA_RAKAH';
  if (state.sahwAlerts.some((alert) => alert.type === type && alert.stageId === stageId)) {
    return state;
  }

  const message_ar =
    type === 'EXTRA_RAKAH'
      ? state.prayerType === 'MAGHRIB'
        ? 'تم البدء بركعة زائدة بعد إتمام ثلاث ركعات المغرب'
        : state.prayerType === 'DHUHR' || state.prayerType === 'ASR' || state.prayerType === 'ISHA'
          ? 'تم البدء بركعة زائدة بعد إتمام أربع ركعات'
          : sahwMessages.EXTRA_RAKAH
      : type === 'MISSING_STAGE'
        ? `تم تجاوز ${stage?.label}`
        : `تم تكرار ${stage?.label}`;
  const alert: SahwAlert = {
    type,
    kind: type === 'MISSING_STAGE' ? 'MISSING' : 'EXTRA',
    rakah: stage?.rakah ?? 3,
    message_ar,
    skippedStages:
      type === 'MISSING_STAGE' && stage
        ? [{ stage: stage.stage, ...(stage.tashahhud ? { tashahhud: stage.tashahhud } : {}) }]
        : [],
    stageId,
  };

  return {
    ...state,
    sahwWarning: message_ar,
    sahwAlerts: [...state.sahwAlerts, alert],
  };
}

function isFourRakahPrayer(prayer: PrayerType) {
  return prayer === 'DHUHR' || prayer === 'ASR' || prayer === 'ISHA';
}

function usesSingleSahwAlert(prayer: PrayerType) {
  return prayer === 'MAGHRIB' || isFourRakahPrayer(prayer);
}

function isFourRakahNextStanding(stage: PrayerSequenceStage | undefined) {
  return stage?.id === 'R2_STANDING' || stage?.id === 'R4_STANDING';
}

function validateSequenceStage(
  state: PrayerState,
  sequence: readonly PrayerSequenceStage[],
  stage: Exclude<PrayerStage, null>,
): PrayerState {
  if (state.prayerCompleted) {
    return stage === 'STANDING' ? addFajrAlert(state, 'EXTRA_RAKAH', null) : state;
  }

  const expected = sequence[state.expectedIndex];
  if (!expected) return state;
  const nextIndex = sequence.findIndex((item, index) => index >= state.expectedIndex && item.stage === stage);

  if (nextIndex < 0) {
    const repeated = sequence.find((item) => state.completedStageIds.includes(item.id) && item.stage === stage);
    return repeated ? addFajrAlert(state, 'EXTRA_STAGE', repeated) : state;
  }

  const missingStages = sequence.slice(state.expectedIndex, nextIndex);
  let nextState = state;
  if (usesSingleSahwAlert(state.prayerType)) {
    const missing = missingStages[0];
    if (missing) {
      nextState = addFajrAlert(nextState, 'MISSING_STAGE', missing);
    }
  } else {
    for (const missing of missingStages) {
      nextState = addFajrAlert(nextState, 'MISSING_STAGE', missing);
    }
  }

  const completed = sequence[nextIndex];
  const completedStageIds = [...nextState.completedStageIds, completed.id];
  const confirmedMissingStages = usesSingleSahwAlert(state.prayerType)
    ? missingStages.slice(0, 1)
    : missingStages;
  const skippedStageIds = usesSingleSahwAlert(state.prayerType)
    ? [
        ...nextState.skippedStageIds,
        ...confirmedMissingStages
          .map((item) => item.id)
          .filter((stageId) => !nextState.skippedStageIds.includes(stageId)),
      ]
    : [...nextState.skippedStageIds, ...confirmedMissingStages.map((item) => item.id)];
  const expectedIndex = nextIndex + 1;

  return {
    ...nextState,
    expectedIndex,
    completedStageIds,
    skippedStageIds,
    prayerCompleted: expectedIndex === sequence.length,
    firstTashahhudStartedAt:
      completed.id === 'R2_FIRST_TASHAHHUD'
        ? Date.now()
        : completed.id === 'R3_STANDING'
          ? null
          : nextState.firstTashahhudStartedAt,
  };
}

export function confirmFajrEarlySittingTimeout(state: PrayerState): PrayerState {
  if (
    state.prayerType !== 'FAJR' ||
    !state.fajrEarlySittingStartedAt ||
    fajrSequence[state.expectedIndex]?.id !== 'R2_STANDING'
  ) {
    return state;
  }

  if (state.sahwAlerts.some((alert) => alert.type === 'EARLY_TASHAHHUD')) return state;

  const alert: SahwAlert = {
    type: 'EARLY_TASHAHHUD',
    kind: 'MISSING',
    rakah: 2,
    message_ar: sahwMessages.EARLY_TASHAHHUD,
    skippedStages: [],
    stageId: 'R2_EARLY_TASHAHHUD',
  };

  return {
    ...state,
    sahwWarning: alert.message_ar,
    sahwAlerts: [...state.sahwAlerts, alert],
    fajrEarlySittingStartedAt: null,
  };
}

export function confirmMaghribEarlySittingTimeout(state: PrayerState): PrayerState {
  if (
    state.prayerType !== 'MAGHRIB' ||
    !state.maghribEarlySittingStartedAt ||
    maghribSequence[state.expectedIndex]?.id !== 'R2_STANDING'
  ) {
    return state;
  }

  if (state.sahwAlerts.some((alert) => alert.type === 'EARLY_TASHAHHUD')) {
    return { ...state, maghribEarlySittingStartedAt: null };
  }

  const alert: SahwAlert = {
    type: 'EARLY_TASHAHHUD',
    kind: 'MISSING',
    rakah: 2,
    message_ar: sahwMessages.EARLY_TASHAHHUD,
    skippedStages: [],
    stageId: 'R2_EARLY_TASHAHHUD',
  };

  return {
    ...state,
    sahwWarning: alert.message_ar,
    sahwAlerts: [...state.sahwAlerts, alert],
    maghribEarlySittingStartedAt: null,
  };
}

export function confirmFourRakahEarlySittingTimeout(state: PrayerState): PrayerState {
  const expected = fourRakahSequence[state.expectedIndex];
  if (
    !isFourRakahPrayer(state.prayerType) ||
    !state.fourRakahEarlySittingStartedAt ||
    !isFourRakahNextStanding(expected)
  ) {
    return state;
  }

  return {
    ...addFajrAlert(state, 'MISSING_STAGE', expected),
    fourRakahEarlySittingStartedAt: null,
  };
}

function clearFajrEarlySittingAlert(state: PrayerState): PrayerState {
  const sahwAlerts = state.sahwAlerts.filter((alert) => alert.stageId !== 'R2_EARLY_TASHAHHUD');

  if (sahwAlerts.length === state.sahwAlerts.length) return state;

  return {
    ...state,
    sahwAlerts,
    sahwWarning: sahwAlerts[sahwAlerts.length - 1]?.message_ar ?? null,
    fajrEarlySittingStartedAt: null,
  };
}

function getValidatorSequence(prayer: PrayerType) {
  if (prayer === 'FAJR') return fajrSequence;
  if (prayer === 'MAGHRIB') return maghribSequence;
  if (prayer === 'DHUHR' || prayer === 'ASR' || prayer === 'ISHA') return fourRakahSequence;
  return null;
}

/** Applies an explicit validator for all supported prayer sequences. */
export function advancePrayerSequence(state: PrayerState, pose: PrayerPose): PrayerState {
  const validatorSequence = getValidatorSequence(state.prayerType);
  if (!validatorSequence) return advanceBasePrayerSequence(state, pose);
  if (pose === 'TRANSITION' || pose === 'UNKNOWN') return advanceBasePrayerSequence(state, pose);

  const expected = validatorSequence[state.expectedIndex];
  const shouldWaitForPostSujudStanding =
    pose === 'SITTING' &&
    state.prayerStage === 'SUJUD_2' &&
    (
      ((state.prayerType === 'FAJR' || state.prayerType === 'MAGHRIB') &&
        expected?.id === 'R2_STANDING') ||
      (isFourRakahPrayer(state.prayerType) && isFourRakahNextStanding(expected))
    );
  if (shouldWaitForPostSujudStanding) {
    if (
      state.prayerType === 'MAGHRIB' &&
      state.sahwAlerts.some((alert) => alert.type === 'EARLY_TASHAHHUD')
    ) {
      return state;
    }

    if (
      isFourRakahPrayer(state.prayerType) &&
      state.sahwAlerts.some(
        (alert) => alert.type === 'MISSING_STAGE' && alert.stageId === expected?.id,
      )
    ) {
      return state;
    }

    return {
      ...state,
      ...(state.prayerType === 'FAJR'
        ? { fajrEarlySittingStartedAt: state.fajrEarlySittingStartedAt ?? Date.now() }
        : state.prayerType === 'MAGHRIB'
          ? { maghribEarlySittingStartedAt: state.maghribEarlySittingStartedAt ?? Date.now() }
          : { fourRakahEarlySittingStartedAt: state.fourRakahEarlySittingStartedAt ?? Date.now() }),
    };
  }

  const baseState = advanceBasePrayerSequence(state, pose);
  const nextState =
    baseState.sahwAlerts.length > state.sahwAlerts.length
      ? { ...baseState, sahwAlerts: state.sahwAlerts, sahwWarning: state.sahwWarning }
      : baseState;
  const stateAfterFajrWait =
    state.prayerType === 'FAJR' &&
    pose === 'STANDING' &&
    state.fajrEarlySittingStartedAt
      ? { ...nextState, fajrEarlySittingStartedAt: null }
      : nextState;
  const stateAfterFajrEarlyAlert =
    state.prayerType === 'FAJR' && pose === 'STANDING'
      ? clearFajrEarlySittingAlert(stateAfterFajrWait)
      : stateAfterFajrWait;
  const stateAfterMaghribWait =
    state.prayerType === 'MAGHRIB' &&
    pose === 'STANDING' &&
    state.maghribEarlySittingStartedAt
      ? { ...stateAfterFajrEarlyAlert, maghribEarlySittingStartedAt: null }
      : stateAfterFajrEarlyAlert;
  const stateAfterFourRakahWait =
    isFourRakahPrayer(state.prayerType) &&
    pose === 'STANDING' &&
    state.fourRakahEarlySittingStartedAt
      ? { ...stateAfterMaghribWait, fourRakahEarlySittingStartedAt: null }
      : stateAfterMaghribWait;

  if (state.prayerCompleted && pose === 'STANDING') {
    return validateSequenceStage(stateAfterFourRakahWait, validatorSequence, 'STANDING');
  }

  if (pose === 'STANDING' && state.sequence.pendingBowing) {
    if (usesSingleSahwAlert(state.prayerType)) {
      return validateSequenceStage(stateAfterFourRakahWait, validatorSequence, 'ITIDAL');
    }

    return validateSequenceStage(
      validateSequenceStage(stateAfterFourRakahWait, validatorSequence, 'BOWING'),
      validatorSequence,
      'ITIDAL',
    );
  }

  if (pose === 'BOWING' && state.sequence.rukuDone) {
    return addSahwAlert(stateAfterFourRakahWait, 'EXTRA_BOWING');
  }

  if (pose === 'BOWING') {
    return usesSingleSahwAlert(state.prayerType)
      ? validateSequenceStage(stateAfterFourRakahWait, validatorSequence, 'BOWING')
      : stateAfterFourRakahWait;
  }

  if (pose === 'STANDING' && state.prayerStage === 'STANDING') {
    return stateAfterFourRakahWait;
  }

  const stage = stateAfterFourRakahWait.prayerStage;
  return stage
    ? validateSequenceStage(stateAfterFourRakahWait, validatorSequence, stage)
    : stateAfterFourRakahWait;
}

/**
 * Boundary for the future on-device or remote prayer engine.
 * It intentionally has no inference implementation in the Expo Go phase.
 */
export interface PrayerEngine {
  start(onEvent: (event: PrayerEngineEvent) => void): void;
  stop(): void;
}
