import type { EngineStatus } from '../types/prayer';

const HEALTH_CHECK_TIMEOUT_MS = 7_000;

type HealthResponse = {
  status?: unknown;
};

function logEngine(message: string) {
  if (__DEV__) {
    console.log(`[Engine] ${message}`);
  }
}

function normalizeApiUrl(value: string | undefined) {
  const url = value?.trim().replace(/\/+$/, '');
  return url || null;
}

export function getEngineApiUrl() {
  return normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
}

/**
 * A connected state is returned only after /health responds with { status: 'ok' }.
 */
export async function checkEngineConnection(): Promise<EngineStatus> {
  const apiUrl = getEngineApiUrl();

  if (!apiUrl) {
    logEngine('no API URL configured');
    return 'disconnected';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    logEngine('checking connection...');
    const response = await fetch(`${apiUrl}/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as HealthResponse | null;

    if (response.ok && data?.status === 'ok') {
      logEngine('connected');
      return 'connected';
    }

    logEngine('connection failed');
    return 'error';
  } catch {
    logEngine('connection failed');
    return 'error';
  } finally {
    clearTimeout(timeoutId);
  }
}
