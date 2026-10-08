export type PrayerPose =
  | 'STANDING'
  | 'BOWING'
  | 'PROSTRATING'
  | 'SITTING'
  | 'TRANSITION'
  | 'UNKNOWN';

export type PrayerStage =
  | 'STANDING'
  | 'BOWING'
  | 'ITIDAL'
  | 'SUJUD_1'
  | 'SITTING_BETWEEN_SUJUD'
  | 'SUJUD_2'
  | 'TASHAHHUD'
  | null;

export type PrayerType = 'FAJR' | 'DHUHR' | 'ASR' | 'MAGHRIB' | 'ISHA';

export type CameraStatus =
  | 'OFF'
  | 'REQUESTING_PERMISSION'
  | 'STARTING'
  | 'PERMISSION_DENIED'
  | 'READY'
  | 'ERROR';

export type EngineStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type SahwAlertType =
  | 'MISSING_BOWING'
  | 'MISSING_SECOND_SUJUD'
  | 'EXTRA_BOWING'
  | 'EXTRA_SUJUD'
  | 'MISSING_STAGE'
  | 'EXTRA_STAGE'
  | 'EXTRA_RAKAH'
  | 'MOVEMENT_AFTER_FINAL_TASHAHHUD'
  | 'EARLY_TASHAHHUD';

export interface SahwSkippedStage {
  stage: Exclude<PrayerStage, null>;
  tashahhud?: 'first' | 'final';
}

export interface SahwAlert {
  type: SahwAlertType;
  kind: 'MISSING' | 'EXTRA';
  rakah: number;
  message_ar: string;
  skippedStages: SahwSkippedStage[];
  stageId?: string;
}

export interface ActiveSahwEvent {
  alertType: SahwAlertType;
  sourceStageId?: string;
  recoveryStageIds: string[];
}

export interface PrayerSequenceState {
  pendingBowing: boolean;
  rukuDone: boolean;
  awaitingFirstTashahhud: boolean;
  awaitingFinalTashahhud: boolean;
}

export interface PrayerState {
  prayerType: PrayerType;
  currentPose: PrayerPose | null;
  prayerStage: PrayerStage;
  confidence: number | null;
  currentRakah: number;
  totalRakahs: number;
  currentSujud: number;
  sequence: PrayerSequenceState;
  sahwWarning: string | null;
  sahwAlerts: SahwAlert[];
  activeSahwEvent: ActiveSahwEvent | null;
  expectedIndex: number;
  completedStageIds: string[];
  skippedStageIds: string[];
  prayerCompleted: boolean;
  firstTashahhudStartedAt: number | null;
  preSujudTransitionStartedAt: number | null;
  postSujudTransitionStartedAt: number | null;
  finalTashahhudConfirmationStartedAt: number | null;
  finalTashahhudConfirmationPose: PrayerPose | null;
  prayerStarted: boolean;
}

export interface PrayerEngineEvent {
  state: Partial<PrayerState>;
}
