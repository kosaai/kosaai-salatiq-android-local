import type { PrayerPose } from '../types/prayer';

export const postureLabels: Record<PrayerPose, string> = {
  STANDING: 'القيام',
  BOWING: 'الركوع',
  PROSTRATING: 'السجود',
  SITTING: 'الجلوس',
  TRANSITION: 'بانتظار وضعية ثابتة',
  UNKNOWN: 'وضعية غير معروفة',
};

export const postureOrder: PrayerPose[] = [
  'STANDING',
  'BOWING',
  'PROSTRATING',
  'SITTING',
];

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}
