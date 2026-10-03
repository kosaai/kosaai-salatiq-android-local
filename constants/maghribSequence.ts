import type { PrayerSequenceStage } from './fajrSequence';

export const maghribSequence: readonly PrayerSequenceStage[] = [
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
  { id: 'R2_FIRST_TASHAHHUD', rakah: 2, stage: 'TASHAHHUD', tashahhud: 'first', label: 'التشهد الأول' },
  { id: 'R3_STANDING', rakah: 3, stage: 'STANDING', label: 'القيام' },
  { id: 'R3_BOWING', rakah: 3, stage: 'BOWING', label: 'الركوع' },
  { id: 'R3_ITIDAL', rakah: 3, stage: 'ITIDAL', label: 'الاعتدال' },
  { id: 'R3_SUJUD_1', rakah: 3, stage: 'SUJUD_1', label: 'السجود الأول' },
  { id: 'R3_SITTING_BETWEEN', rakah: 3, stage: 'SITTING_BETWEEN_SUJUD', label: 'الجلوس بين السجدتين' },
  { id: 'R3_SUJUD_2', rakah: 3, stage: 'SUJUD_2', label: 'السجود الثاني' },
  { id: 'R3_FINAL_TASHAHHUD', rakah: 3, stage: 'TASHAHHUD', tashahhud: 'final', label: 'التشهد الأخير' },
];
