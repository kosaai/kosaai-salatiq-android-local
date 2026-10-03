import type { PrayerSequenceStage } from './fajrSequence';

const rakahStages = (rakah: number): PrayerSequenceStage[] => [
  { id: `R${rakah}_STANDING`, rakah, stage: 'STANDING', label: 'القيام' },
  { id: `R${rakah}_BOWING`, rakah, stage: 'BOWING', label: 'الركوع' },
  { id: `R${rakah}_ITIDAL`, rakah, stage: 'ITIDAL', label: 'الاعتدال' },
  { id: `R${rakah}_SUJUD_1`, rakah, stage: 'SUJUD_1', label: 'السجود الأول' },
  { id: `R${rakah}_SITTING_BETWEEN`, rakah, stage: 'SITTING_BETWEEN_SUJUD', label: 'الجلوس بين السجدتين' },
  { id: `R${rakah}_SUJUD_2`, rakah, stage: 'SUJUD_2', label: 'السجود الثاني' },
];

/** Shared validator sequence for DHUHR, ASR, and ISHA. */
export const fourRakahSequence: readonly PrayerSequenceStage[] = [
  ...rakahStages(1),
  ...rakahStages(2),
  { id: 'R2_FIRST_TASHAHHUD', rakah: 2, stage: 'TASHAHHUD', tashahhud: 'first', label: 'التشهد الأول' },
  ...rakahStages(3),
  ...rakahStages(4),
  { id: 'R4_FINAL_TASHAHHUD', rakah: 4, stage: 'TASHAHHUD', tashahhud: 'final', label: 'التشهد الأخير' },
];
