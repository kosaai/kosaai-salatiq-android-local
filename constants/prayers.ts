import type { PrayerType } from '../types/prayer';

export const prayerConfig: Record<PrayerType, { arabicName: string; rakahs: number }> = {
  FAJR: { arabicName: 'الفجر', rakahs: 2 },
  DHUHR: { arabicName: 'الظهر', rakahs: 4 },
  ASR: { arabicName: 'العصر', rakahs: 4 },
  MAGHRIB: { arabicName: 'المغرب', rakahs: 3 },
  ISHA: { arabicName: 'العشاء', rakahs: 4 },
};

export const prayerTypes: PrayerType[] = ['FAJR', 'DHUHR', 'ASR', 'MAGHRIB', 'ISHA'];
