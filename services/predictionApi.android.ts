import type { PredictionResponse } from './predictionApi';

export type { PredictionPose, PredictionResponse } from './predictionApi';

/** Android predictions arrive directly from the native camera analyzer. */
export async function predictImage(): Promise<PredictionResponse> {
  throw new Error('Android classification requires the bundled native camera analyzer.');
}
