import type { PrayerStage } from '../types/prayer';

export type PrayerSequenceStage = {
  id: string;
  rakah: number;
  stage: Exclude<PrayerStage, null>;
  tashahhud?: 'first' | 'final';
  label: string;
};

export const fajrSequence: readonly PrayerSequenceStage[] = [
  { id: 'R1_STANDING', rakah: 1, stage: 'STANDING', label: 'القيام' },
  { id: 'R1_BOWING', rakah: 1, stage: 'BOWING', label: 'الركوع' },
  { id: 'R1_ITIDAL', rakah: 1, stage: 'ITIDAL', label: 'الاعتدال' },
  { id: 'R1_SUJUD_1', rakah: 1, stage: 'SUJUD_1', label: 'السجود الأول' },
  { id: 'R1_SITTING_BETWEEN', rakah: 1, stage: 'SITTING_BETWEEN_SUJUD', label: 'الجلوس بين السجدتين' },
  { id: 'R1_SUJUD_2', rakah: 1, stage: 'SUJUD_2', label: 'السجود الثاني' },
  { id: 'R2_STANDING', rakah: 2, stage: 'STANDING', label: 'القيام' },
  { id: 'R2_BOWING', rakah: 2, stage: 'BOWING', label: 'الركوع' },
  { id: 'R2_ITIDAL', rakah: 2, stage: 'ITIDAL', label: 'الاعتدال' },
  { id: 'R2_SUJUD_1', rakah: 2, stage: 'SUJUD_1', label: 'السجود الأول' },
  { id: 'R2_SITTING_BETWEEN', rakah: 2, stage: 'SITTING_BETWEEN_SUJUD', label: 'الجلوس بين السجدتين' },
  { id: 'R2_SUJUD_2', rakah: 2, stage: 'SUJUD_2', label: 'السجود الثاني' },
  { id: 'R2_FINAL_TASHAHHUD', rakah: 2, stage: 'TASHAHHUD', tashahhud: 'final', label: 'التشهد الأخير' },
];
