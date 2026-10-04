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

export type PoseKeypoint = {
  x: number;
  y: number;
  confidence: number;
};

export type PredictionPose = Exclude<PrayerPose, 'UNKNOWN'>;

export type PredictionResponse = {
  status: 'ok' | 'error';
  person_detected?: boolean;
  pose?: PredictionPose | null;
  pose_ar?: string | null;
  keypoints?: PoseKeypoint[] | null;
  message?: string;
};

const predictionPoses: ReadonlySet<PredictionPose> = new Set([
  'STANDING',
  'BOWING',
  'PROSTRATING',
  'SITTING',
  'TRANSITION',
]);

function isPoseKeypoint(value: unknown): value is PoseKeypoint {
  if (!value || typeof value !== 'object') return false;

  const keypoint = value as Record<string, unknown>;
  return (
    typeof keypoint.x === 'number' &&
    typeof keypoint.y === 'number' &&
    typeof keypoint.confidence === 'number'
  );
}

function parsePredictionResponse(value: unknown): PredictionResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid prediction response');
  }

  const response = value as Record<string, unknown>;
  if (response.status !== 'ok' && response.status !== 'error') {
    throw new Error('Invalid prediction status');
  }

  const keypoints = Array.isArray(response.keypoints)
    ? response.keypoints.filter(isPoseKeypoint)
    : response.keypoints === null
      ? null
      : undefined;
  const pose =
    response.pose === null
      ? null
      : typeof response.pose === 'string' && predictionPoses.has(response.pose as PredictionPose)
        ? (response.pose as PredictionPose)
        : undefined;

  return {
    status: response.status,
    person_detected:
      typeof response.person_detected === 'boolean' ? response.person_detected : undefined,
    pose,
    pose_ar:
      response.pose_ar === null ? null : typeof response.pose_ar === 'string' ? response.pose_ar : undefined,
    keypoints,
    message: typeof response.message === 'string' ? response.message : undefined,
  };
}

/** Sends one captured camera frame to the FastAPI /predict endpoint. */
export async function predictImage(
  image: string | Blob,
  signal?: AbortSignal,
  onFrameSize?: (frameSizeKb: number) => void,
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

    onFrameSize?.(blob.size / 1024);
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
      const predictionStartedAt = Date.now();
      const response = await fetch(`${apiUrl}/predict`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
        signal: controller.signal,
      });
      const responseBody = await response.text();
      if (__DEV__) {
        console.log(`[LIVE] upload+predict ms: ${Date.now() - predictionStartedAt}`);
      }
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
