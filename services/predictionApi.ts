import { getEngineApiUrl } from './engineConnection';
import type { PrayerPose } from '../types/prayer';

const PREDICTION_TIMEOUT_MS = 7_000;

function logYolo(message: string, detail?: unknown) {
  if (__DEV__) {
    console.log(`[YOLO] ${message}`, detail ?? '');
  }
}

function isRequestCancellation(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.name === 'AbortError' ||
    error.name === 'FetchRequestCanceledException' ||
    /fetch request has been canceled|request (?:has been )?cancelled/i.test(error.message)
  );
}

export type PredictionPose = Exclude<PrayerPose, 'UNKNOWN' | 'TRANSITION'>;

export type PredictionResponse = {
  pose: PredictionPose;
  confidence: number;
};

const predictionPoses: ReadonlySet<PredictionPose> = new Set([
  'STANDING',
  'BOWING',
  'PROSTRATING',
  'SITTING',
]);

function parsePredictionResponse(value: unknown): PredictionResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid prediction response');
  }

  const response = value as Record<string, unknown>;
  if (typeof response.pose !== 'string' || !predictionPoses.has(response.pose as PredictionPose)) {
    throw new Error('Invalid prediction pose');
  }
  if (
    typeof response.confidence !== 'number' ||
    !Number.isFinite(response.confidence) ||
    response.confidence < 0 || response.confidence > 1
  ) {
    throw new Error('Invalid prediction confidence');
  }

  return {
    pose: response.pose as PredictionPose,
    confidence: response.confidence,
  };
}

/** Sends one captured camera frame to the FastAPI /predict endpoint. */
export async function predictImage(
  image: string | Blob,
  signal?: AbortSignal,
): Promise<PredictionResponse> {
  const apiUrl = getEngineApiUrl();
  if (!apiUrl) {
    throw new Error('API URL is not configured');
  }

  let timedOut = false;

  try {
    let blob: Blob;
    if (typeof image === 'string') {
      logYolo('photo uri:', image);

      let imageResponse: Response;
      try {
        imageResponse = await fetch(image);
      } catch (error) {
        const name = error instanceof Error ? error.name : 'UnknownError';
        const message = error instanceof Error ? error.message : String(error);
        if (__DEV__) {
          console.error('[YOLO] photo read failed:', { name, message });
        }
        throw error;
      }

      if (!imageResponse.ok) {
        throw new Error(`Unable to read captured photo (${imageResponse.status})`);
      }

      blob = await imageResponse.blob();
    } else {
      blob = image;
    }

    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, PREDICTION_TIMEOUT_MS);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });

    if (signal?.aborted) {
      controller.abort();
    }

    try {
      logYolo('sending request...');
      const response = await fetch(`${apiUrl}/predict`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
        signal: controller.signal,
      });
      const responseBody = await response.text();
      logYolo('response status:', response.status);
      logYolo('response body:', responseBody);

      if (!response.ok) {
        throw new Error(`Prediction request failed (${response.status}): ${responseBody}`);
      }

      try {
        return parsePredictionResponse(responseBody ? JSON.parse(responseBody) : null);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Invalid prediction response: ${error.message}`);
        }

        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const message = error instanceof Error ? error.message : String(error);
    if (__DEV__ && (!isRequestCancellation(error) || timedOut)) {
      console.error('[YOLO] request exception:', { name, message });
    }
    throw error;
  }
}
