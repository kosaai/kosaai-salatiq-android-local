import { requireNativeView } from 'expo';
import type { LocalClassificationCameraProps } from './LocalClassificationCamera';

export const LocalClassificationCamera =
  requireNativeView<LocalClassificationCameraProps>('LocalClassification');
