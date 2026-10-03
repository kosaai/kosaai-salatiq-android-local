import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, lightColors } from '../constants/theme';
import { predictImage, type PredictionPose } from '../services/predictionApi';
import type { CameraStatus, EngineStatus, SahwAlert } from '../types/prayer';

type PrayerCameraProps = {
  onStatusChange: (status: CameraStatus) => void;
  engineStatus: EngineStatus;
  onCheckEngine: () => Promise<EngineStatus>;
  onPoseDetected: (pose: PredictionPose | null) => void;
  sessionId: number;
  latestSahwAlert: SahwAlert | null;
  fajrEarlySittingStartedAt: number | null;
  isDarkMode: boolean;
};

type SessionValue<T> = {
  sessionId: number;
  value: T;
};

type PoseCandidate = {
  pose: Exclude<PredictionPose, 'TRANSITION'>;
  startedAt: number;
};

type LiveTimings = {
  capture: number;
  resize: number;
  uploadPredict: number;
  total: number;
};

const POSE_STABILITY_MS = 1_000;
const LIVE_NEXT_CAPTURE_DELAY_MS = 0;
const MAX_UPLOAD_WIDTH = 640;

function isDetectedPrayerPose(pose: PredictionPose | null): pose is Exclude<PredictionPose, 'TRANSITION'> {
  return (
    pose === 'STANDING' ||
    pose === 'BOWING' ||
    pose === 'PROSTRATING' ||
    pose === 'SITTING'
  );
}

function getEnginePresentation(status: EngineStatus, cameraActive: boolean) {
  switch (status) {
    case 'connecting':
      return { text: 'جاري الاتصال بالمحرك...', color: colors.brassSoft };
    case 'connected':
      return {
        text: cameraActive ? 'الكاميرا تعمل — المحرك متصل' : 'المحرك متصل',
        color: colors.sage,
      };
    case 'error':
      return { text: 'تعذر الاتصال بالمحرك', color: colors.danger };
    case 'disconnected':
    default:
      return {
        text: cameraActive ? 'الكاميرا تعمل — المحرك غير متصل' : 'المحرك غير متصل',
        color: colors.muted,
      };
  }
}

function logLive(message: string) {
  if (__DEV__) {
    console.log(`[LIVE] ${message}`);
  }
}

export function PrayerCamera({
  onStatusChange,
  engineStatus,
  onCheckEngine,
  onPoseDetected,
  sessionId,
  latestSahwAlert,
  fajrEarlySittingStartedAt,
  isDarkMode,
}: PrayerCameraProps) {
  const theme = isDarkMode ? colors : lightColors;
  const cameraRef = useRef<CameraView>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRequestControllerRef = useRef<AbortController | null>(null);
  const liveLoopActiveRef = useRef(false);
  const predictionInFlightRef = useRef(false);
  const lastLivePoseRef = useRef<PredictionPose | null>(null);
  const lastReceivedPoseRef = useRef<string | null>(null);
  const poseCandidateRef = useRef<PoseCandidate | null>(null);
  const lastLiveSkipLogRef = useRef(0);
  const onPoseDetectedRef = useRef(onPoseDetected);
  const cameraActiveRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const [permission, requestPermission] = useCameraPermissions();
  const [isActive, setIsActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('front');
  const [error, setError] = useState<string | null>(null);
  const [earlySittingNow, setEarlySittingNow] = useState(0);
  const [countdownState, setCountdownState] = useState<SessionValue<number> | null>(null);
  const [prayerStartedSessionId, setPrayerStartedSessionId] = useState<number | null>(null);
  const [liveTimings, setLiveTimings] = useState<LiveTimings | null>(null);
  const isPrayerStarted = prayerStartedSessionId === sessionId;
  const countdown = countdownState?.sessionId === sessionId ? countdownState.value : null;
  const canStartPrayer =
    engineStatus === 'connected' &&
    isCameraReady &&
    !isPrayerStarted &&
    countdown === null;
  const engine = getEnginePresentation(engineStatus, isActive);

  useEffect(() => {
    onPoseDetectedRef.current = onPoseDetected;
  }, [onPoseDetected]);

  useEffect(() => {
    if (!fajrEarlySittingStartedAt) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const updateCountdown = () => {
      const now = Date.now();
      setEarlySittingNow(now);
      if (now - fajrEarlySittingStartedAt < 10_000) {
        timeout = setTimeout(updateCountdown, 1_000 - ((now - fajrEarlySittingStartedAt) % 1_000));
      }
    };

    updateCountdown();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [fajrEarlySittingStartedAt]);

  const setCountdown = useCallback((value: number | null) => {
    setCountdownState(value === null ? null : { sessionId: sessionIdRef.current, value });
  }, []);

  const setPrayerStarted = useCallback(() => {
    setPrayerStartedSessionId(sessionIdRef.current);
  }, []);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const stopLiveLoop = useCallback(() => {
    const wasActive = liveLoopActiveRef.current;
    liveLoopActiveRef.current = false;

    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }

    liveRequestControllerRef.current?.abort();
    liveRequestControllerRef.current = null;
    poseCandidateRef.current = null;

    if (wasActive) {
      logLive('stopped');
    }
  }, []);

  const beginCamera = useCallback(async () => {
    setError(null);
    void onCheckEngine();
    if (!permission) {
      onStatusChange('REQUESTING_PERMISSION');
      return;
    }

    if (!permission.granted) {
      onStatusChange('REQUESTING_PERMISSION');
      const result = await requestPermission();
      if (!result.granted) {
        setError('لم يتم السماح بالوصول إلى الكاميرا. اسمح بالوصول ثم حاول مجددًا.');
        onStatusChange('PERMISSION_DENIED');
        return;
      }
    }

    cameraReadyRef.current = false;
    setIsCameraReady(false);
    cameraActiveRef.current = true;
    setIsActive(true);
    onStatusChange('STARTING');
  }, [onCheckEngine, onStatusChange, permission, requestPermission]);

  const stopCamera = useCallback(() => {
    clearCountdownTimer();
    stopLiveLoop();
    cameraActiveRef.current = false;
    cameraReadyRef.current = false;
    setIsActive(false);
    setIsCameraReady(false);
    setCountdown(null);
    setLiveTimings(null);
    setError(null);
    onStatusChange('OFF');
  }, [clearCountdownTimer, onStatusChange, setCountdown, stopLiveLoop]);

  const toggleFacing = useCallback(() => {
    setFacing((current) => (current === 'front' ? 'back' : 'front'));
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    const countdownSessionId = sessionId;

    countdownTimerRef.current = setTimeout(() => {
      countdownTimerRef.current = null;

      if (countdownSessionId !== sessionIdRef.current) return;

      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }

      setCountdown(null);
      setPrayerStarted();
    }, 1_000);

    return clearCountdownTimer;
  }, [clearCountdownTimer, countdown, sessionId, setCountdown, setPrayerStarted]);

  useEffect(
    () => () => {
      clearCountdownTimer();
      stopLiveLoop();
    },
    [clearCountdownTimer, stopLiveLoop],
  );

  useEffect(() => {
    sessionIdRef.current = sessionId;
    lastLivePoseRef.current = null;
    lastReceivedPoseRef.current = null;
    poseCandidateRef.current = null;
    clearCountdownTimer();
    stopLiveLoop();
  }, [clearCountdownTimer, sessionId, stopLiveLoop]);

  useEffect(() => {
    if (engineStatus === 'connected') return;

    clearCountdownTimer();
    stopLiveLoop();
    const resetSession = setTimeout(() => {
      setCountdown(null);
      setPrayerStartedSessionId(null);
    }, 0);

    return () => clearTimeout(resetSession);
  }, [clearCountdownTimer, engineStatus, setCountdown, stopLiveLoop]);

  useEffect(() => {
    if (
      engineStatus !== 'connected' ||
      !isActive ||
      !isCameraReady ||
      !isPrayerStarted ||
      countdown !== null
    ) {
      return;
    }

    const loopSessionId = sessionId;
    let cancelled = false;
    liveLoopActiveRef.current = true;

    const scheduleNext = () => {
      if (cancelled || loopSessionId !== sessionIdRef.current || !liveLoopActiveRef.current) return;

      liveTimerRef.current = setTimeout(() => {
        liveTimerRef.current = null;
        void runLiveCycle();
      }, LIVE_NEXT_CAPTURE_DELAY_MS);
    };

    const runLiveCycle = async () => {
      if (
        cancelled ||
        loopSessionId !== sessionIdRef.current ||
        !liveLoopActiveRef.current ||
        !cameraRef.current ||
        !cameraActiveRef.current ||
        !cameraReadyRef.current
      ) {
        return;
      }

      if (predictionInFlightRef.current) {
        const now = Date.now();
        if (now - lastLiveSkipLogRef.current > 2_000) {
          logLive('skipped: request in flight');
          lastLiveSkipLogRef.current = now;
        }
        scheduleNext();
        return;
      }

      const requestController = new AbortController();
      liveRequestControllerRef.current = requestController;
      predictionInFlightRef.current = true;

      try {
        logLive('capture');
        const cycleStartedAt = performance.now();
        const captureStartedAt = performance.now();
        const picture = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          shutterSound: false,
          base64: false,
          exif: false,
        });
        const capture = Math.round(performance.now() - captureStartedAt);
        if (__DEV__) {
          console.log(`[LIVE] capture ms: ${capture}`);
        }

        if (cancelled || loopSessionId !== sessionIdRef.current || !liveLoopActiveRef.current) {
          return;
        }

        let uploadUri = picture.uri;
        let resize = 0;
        if (picture.width > MAX_UPLOAD_WIDTH) {
          const resizeStartedAt = performance.now();
          const image = ImageManipulator.manipulate(picture.uri);
          image.resize({ width: MAX_UPLOAD_WIDTH, height: null });
          const renderedImage = await image.renderAsync();
          const resizedImage = await renderedImage.saveAsync({
            format: SaveFormat.JPEG,
            compress: 0.5,
          });
          uploadUri = resizedImage.uri;
          resize = Math.round(performance.now() - resizeStartedAt);
        }

        if (cancelled || loopSessionId !== sessionIdRef.current || !liveLoopActiveRef.current) {
          return;
        }

        const uploadPredictStartedAt = performance.now();
        const result = await predictImage(uploadUri, requestController.signal);
        const uploadPredict = Math.round(performance.now() - uploadPredictStartedAt);
        const total = Math.round(performance.now() - cycleStartedAt);
        if (__DEV__) {
          console.log(`[LIVE] total cycle ms: ${total}`);
        }

        if (cancelled || loopSessionId !== sessionIdRef.current) return;

        setLiveTimings({ capture, resize, uploadPredict, total });

        if (result.status === 'ok') {
          const pose = result.person_detected ? result.pose ?? null : null;
          const receivedPose = pose ?? 'no-person';
          if (receivedPose !== lastReceivedPoseRef.current) {
            logLive(`pose received: ${receivedPose}`);
            lastReceivedPoseRef.current = receivedPose;
          }

          if (!isDetectedPrayerPose(pose)) {
            poseCandidateRef.current = null;
          } else {
            const now = Date.now();
            const candidate = poseCandidateRef.current;

            if (!candidate || candidate.pose !== pose) {
              poseCandidateRef.current = { pose, startedAt: now };
            } else if (now - candidate.startedAt >= POSE_STABILITY_MS && pose !== lastLivePoseRef.current) {
              onPoseDetectedRef.current(pose);
              logLive(`pose: ${pose}`);
              lastLivePoseRef.current = pose;
            }
          }
        }
      } catch {
        // predictionApi logs the detailed request failure in development.
      } finally {
        if (liveRequestControllerRef.current === requestController) {
          liveRequestControllerRef.current = null;
        }
        predictionInFlightRef.current = false;
        scheduleNext();
      }
    };

    void runLiveCycle();

    return () => {
      cancelled = true;
      if (liveTimerRef.current) {
        clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [countdown, engineStatus, isActive, isCameraReady, isPrayerStarted, sessionId, stopLiveLoop]);

  const startPrayer = useCallback(() => {
    if (!canStartPrayer) return;

    setCountdown(5);
  }, [canStartPrayer, setCountdown]);

  return (
    <View>
      <LinearGradient
        colors={['rgba(201, 147, 46, 0.36)', 'rgba(201, 147, 46, 0)']}
        style={styles.frame}
      >
        <View
          style={[
            styles.cameraClip,
            { borderColor: theme.line },
            !isActive && !isDarkMode && { backgroundColor: theme.panelRaised },
          ]}
        >
          {isActive ? (
            <>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                mirror={facing === 'front'}
                onCameraReady={() => {
                  cameraReadyRef.current = true;
                  setIsCameraReady(true);
                  onStatusChange('READY');
                }}
                onMountError={({ message }) => {
                  clearCountdownTimer();
                  stopLiveLoop();
                  cameraActiveRef.current = false;
                  cameraReadyRef.current = false;
                  setError(message || 'تعذر تشغيل معاينة الكاميرا.');
                  setIsActive(false);
                  setIsCameraReady(false);
                  setCountdown(null);
                  onStatusChange('ERROR');
                }}
              />
              {countdown !== null ? (
                <View pointerEvents="none" style={styles.countdownOverlay}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              ) : null}
              {engineStatus !== 'error' ? (
                <View pointerEvents="none" style={styles.statusPill}>
                  <View style={[styles.engineDot, { backgroundColor: engine.color }]} />
                  <Text style={styles.statusText}>{engine.text}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityLabel="تبديل الكاميرا"
                onPress={toggleFacing}
                style={styles.flipButton}
              >
                <Text style={styles.flipText}>↻</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.offContent}>
              {permission === null ? (
                <ActivityIndicator color={colors.brassSoft} />
              ) : (
                <MaterialCommunityIcons
                  name="camera-off-outline"
                  size={48}
                  color={theme.brassSoft}
                />
              )}
              <Text style={[styles.offText, !isDarkMode && { color: theme.muted }]}>
                الكاميرا متوقفة
              </Text>
              <Text style={[styles.offHint, !isDarkMode && { color: theme.muted }]}>
                اضغط «بدء الكاميرا» للمتابعة
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {isActive && isCameraReady && isPrayerStarted && countdown === null && engineStatus === 'connected' ? (
        <View style={[styles.liveTimingDebug, { borderColor: theme.brassDim, backgroundColor: theme.panel }]}>
          <Text style={[styles.liveTimingDebugLabel, { color: theme.brassSoft }]}>DEBUG ACTIVE</Text>
          <Text style={[styles.liveTimingDebugText, { color: theme.muted }]}>capture: {liveTimings?.capture ?? '—'} ms</Text>
          <Text style={[styles.liveTimingDebugText, { color: theme.muted }]}>resize: {liveTimings?.resize ?? '—'} ms</Text>
          <Text style={[styles.liveTimingDebugText, { color: theme.muted }]}>upload+predict: {liveTimings?.uploadPredict ?? '—'} ms</Text>
          <Text style={[styles.liveTimingDebugText, { color: theme.muted }]}>total: {liveTimings?.total ?? '—'} ms</Text>
        </View>
      ) : null}

      {fajrEarlySittingStartedAt ? (
        <View style={[styles.earlySittingNotice, { borderColor: theme.brassDim }]}>
          <Text style={[styles.earlySittingNoticeText, { color: theme.brassSoft }]}>
            تم اكتشاف جلوس — جاري الانتظار {Math.min(10, Math.max(0, 10 - Math.floor((earlySittingNow - fajrEarlySittingStartedAt) / 1_000)))} ثوانٍ
          </Text>
        </View>
      ) : null}

      {latestSahwAlert ? (
        <View accessibilityRole="alert" style={[styles.sahwInlineAlert, { borderColor: theme.brassDim }]}>
          <MaterialCommunityIcons name="alert-outline" size={20} color={theme.brassSoft} />
          <Text style={[styles.sahwInlineText, { color: theme.brassSoft }]}>
            تنبيه سهو: {latestSahwAlert.message_ar} في الركعة {latestSahwAlert.rakah}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={permission === null}
        onPress={isActive ? stopCamera : beginCamera}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.brass },
          isActive && styles.stopButton,
          pressed && styles.pressed,
          permission === null && styles.disabled,
        ]}
      >
          <Text style={[styles.primaryButtonText, { color: isActive ? theme.brassSoft : '#1A1305' }]}>
          {isActive ? '■  إيقاف الكاميرا' : '◉  بدء الكاميرا'}
        </Text>
      </Pressable>

      {isActive ? (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={!canStartPrayer}
            onPress={startPrayer}
            style={({ pressed }) => [
              styles.testButton,
              { borderColor: theme.brassDim, backgroundColor: theme.panel },
              !canStartPrayer && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.testButtonText, { color: theme.brassSoft }]}>
              {countdown !== null ? `استعد: ${countdown}` : isPrayerStarted ? 'الصلاة قيد المتابعة' : 'بدء الصلاة'}
            </Text>
          </Pressable>
        </>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={beginCamera} style={styles.retryButton}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 150,
    padding: 1,
    paddingBottom: 14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  cameraClip: {
    aspectRatio: 3 / 4.2,
    overflow: 'hidden',
    borderRadius: 140,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    backgroundColor: '#0C1C26',
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offContent: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 28 },
  offText: { color: colors.muted, fontSize: 14, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  offHint: { color: colors.muted, fontSize: 11.5, textAlign: 'center', writingDirection: 'rtl', marginTop: -7 },
  statusPill: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,20,28,0.80)',
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
  },
  engineDot: { height: 7, width: 7, borderRadius: 4 },
  statusText: { color: colors.ivory, fontSize: 12 },
  countdownOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,20,28,0.82)',
    borderWidth: 1,
    borderColor: colors.brass,
  },
  countdownText: { color: colors.brassSoft, fontSize: 42, fontWeight: '700', fontVariant: ['tabular-nums'] },
  liveTimingDebug: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liveTimingDebugLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  liveTimingDebugText: {
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: 'center',
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  sahwInlineAlert: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(10,20,28,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  earlySittingNotice: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(10,20,28,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  earlySittingNoticeText: { fontSize: 13.5, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  sahwInlineText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  flipButton: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,20,28,0.78)',
    borderColor: colors.line,
    borderWidth: 1,
  },
  flipText: { color: colors.ivory, fontSize: 24, lineHeight: 28 },
  primaryButton: {
    marginTop: 22,
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brass,
  },
  stopButton: { backgroundColor: 'transparent', borderColor: colors.brassDim, borderWidth: 1.5 },
  primaryButtonText: { color: '#1A1305', fontSize: 16, fontWeight: '700', writingDirection: 'rtl' },
  stopButtonText: { color: colors.brassSoft },
  testButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brassDim,
    backgroundColor: colors.panel,
  },
  testButtonText: { color: colors.brassSoft, fontSize: 14, fontWeight: '700', writingDirection: 'rtl' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
  errorBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(90,20,20,0.95)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  errorText: { color: '#FFFFFF', fontSize: 13, textAlign: 'right', writingDirection: 'rtl', lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7 },
  retryText: { color: '#FFFFFF', fontSize: 12 },
});
