import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, lightColors } from '../constants/theme';
import { predictImage, type PredictionPose } from '../services/predictionApi';
import type { CameraStatus, EngineStatus } from '../types/prayer';

type PrayerCameraProps = {
  onStatusChange: (status: CameraStatus) => void;
  engineStatus: EngineStatus;
  onCheckEngine: () => Promise<EngineStatus>;
  onPoseDetected: (pose: PredictionPose, confidence: number) => void;
  onStartNewPrayerSession: () => void;
  sessionId: number;
  preSujudTransitionStartedAt: number | null;
  postSujudTransitionStartedAt: number | null;
  firstTashahhudStartedAt: number | null;
  isDarkMode: boolean;
};

type SessionValue<T> = {
  sessionId: number;
  value: T;
};

type PoseCandidate = {
  pose: PredictionPose;
  startedAt: number;
};

const POSE_STABILITY_MS = 1_000;
const LIVE_NEXT_CAPTURE_DELAY_MS = 0;
const MAX_UPLOAD_WIDTH = 640;
const WEB_FRAME_WIDTH = 384;
const WEB_FRAME_HEIGHT = 640;
const WEB_JPEG_QUALITY = 0.95;

function loadWebFrame(uri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the captured web frame.'));
    image.src = uri;
  });
}

function encodeWebFrame(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Captured web frame has no dimensions.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = WEB_FRAME_WIDTH;
  canvas.height = WEB_FRAME_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create a canvas context for the web frame.');
  }

  const scale = Math.min(WEB_FRAME_WIDTH / sourceWidth, WEB_FRAME_HEIGHT / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const originX = (WEB_FRAME_WIDTH - width) / 2;
  const originY = (WEB_FRAME_HEIGHT - height) / 2;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, WEB_FRAME_WIDTH, WEB_FRAME_HEIGHT);
  context.drawImage(source, originX, originY, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Unable to encode the web frame as JPEG.'))),
      'image/jpeg',
      WEB_JPEG_QUALITY,
    );
  });
}

async function prepareWebFrame(uri: string) {
  const image = await loadWebFrame(uri);
  return encodeWebFrame(image, image.naturalWidth, image.naturalHeight);
}

// TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
function prepareWebVideoFrame(video: HTMLVideoElement) {
  return encodeWebFrame(video, video.videoWidth, video.videoHeight);
}

function isDetectedPrayerPose(pose: PredictionPose | null): pose is PredictionPose {
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
  onStartNewPrayerSession,
  sessionId,
  preSujudTransitionStartedAt,
  postSujudTransitionStartedAt,
  firstTashahhudStartedAt,
  isDarkMode,
}: PrayerCameraProps) {
  const theme = isDarkMode ? colors : lightColors;
  const cameraRef = useRef<CameraView>(null);
  // TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoObjectUrlRef = useRef<string | null>(null);
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
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [facing, setFacing] = useState<CameraType>('front');
  const [error, setError] = useState<string | null>(null);
  const [earlySittingNow, setEarlySittingNow] = useState(0);
  const [countdownState, setCountdownState] = useState<SessionValue<number> | null>(null);
  const [prayerStartedSessionId, setPrayerStartedSessionId] = useState<number | null>(null);
  const [finishedPrayer, setFinishedPrayer] = useState(false);
  const [pendingNewSessionStartId, setPendingNewSessionStartId] = useState<number | null>(null);
  const [firstTashahhudReminderSessionId, setFirstTashahhudReminderSessionId] = useState<number | null>(null);
  const isPrayerStarted = prayerStartedSessionId === sessionId;
  const showFirstTashahhudReminder = firstTashahhudReminderSessionId === sessionId;
  const isVideoMode = Platform.OS === 'web' && videoUri !== null;
  const isSourceReady = isVideoMode ? isVideoReady : isCameraReady;
  const graceStartedAt = preSujudTransitionStartedAt ?? postSujudTransitionStartedAt;
  const graceNoticePrefix = 'تم اكتشاف حركة انتقال';
  const countdown = countdownState?.sessionId === sessionId ? countdownState.value : null;
  const canStartPrayer =
    engineStatus === 'connected' &&
    isSourceReady &&
    !isPrayerStarted &&
    countdown === null &&
    pendingNewSessionStartId === null;
  const engine = getEnginePresentation(engineStatus, isActive);

  useEffect(() => {
    onPoseDetectedRef.current = onPoseDetected;
  }, [onPoseDetected]);

  useEffect(() => {
    if (!graceStartedAt) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const updateCountdown = () => {
      const now = Date.now();
      setEarlySittingNow(now);
      if (now - graceStartedAt < 10_000) {
        timeout = setTimeout(updateCountdown, 1_000 - ((now - graceStartedAt) % 1_000));
      }
    };

    updateCountdown();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [graceStartedAt]);

  useEffect(() => {
    if (!isPrayerStarted || !firstTashahhudStartedAt) return;

    const reminderSessionId = sessionId;
    const reminderTimer = setTimeout(() => {
      if (reminderSessionId === sessionIdRef.current) {
        setFirstTashahhudReminderSessionId(reminderSessionId);
      }
    }, Math.max(0, firstTashahhudStartedAt + 60_000 - Date.now()));

    return () => clearTimeout(reminderTimer);
  }, [firstTashahhudStartedAt, isPrayerStarted, sessionId]);

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

  // TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
  const clearVideoTestMode = useCallback(() => {
    stopLiveLoop();
    videoRef.current?.pause();
    setIsVideoPlaying(false);
    setIsVideoReady(false);

    if (Platform.OS === 'web' && videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
      videoObjectUrlRef.current = null;
    }

    setVideoUri(null);
  }, [stopLiveLoop]);

  const beginCamera = useCallback(async () => {
    clearVideoTestMode();
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
  }, [clearVideoTestMode, onCheckEngine, onStatusChange, permission, requestPermission]);

  const stopCamera = useCallback(() => {
    clearCountdownTimer();
    stopLiveLoop();
    cameraActiveRef.current = false;
    cameraReadyRef.current = false;
    setIsActive(false);
    setIsCameraReady(false);
    setCountdown(null);
    setError(null);
    onStatusChange('OFF');
  }, [clearCountdownTimer, onStatusChange, setCountdown, stopLiveLoop]);

  const toggleFacing = useCallback(() => {
    setFacing((current) => (current === 'front' ? 'back' : 'front'));
  }, []);

  // TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
  const handleVideoFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || Platform.OS !== 'web') return;

    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'mp4' && extension !== 'mov') {
      setError('اختر ملف فيديو بصيغة MP4 أو MOV.');
      return;
    }

    clearCountdownTimer();
    clearVideoTestMode();
    cameraActiveRef.current = false;
    cameraReadyRef.current = false;
    setIsActive(false);
    setIsCameraReady(false);
    setError(null);
    setFinishedPrayer(false);
    setPrayerStartedSessionId(null);
    setFirstTashahhudReminderSessionId(null);
    onStatusChange('OFF');

    const objectUrl = URL.createObjectURL(file);
    videoObjectUrlRef.current = objectUrl;
    setVideoUri(objectUrl);
    setPendingNewSessionStartId(sessionId + 1);
    onStartNewPrayerSession();
    void onCheckEngine();
  }, [
    clearCountdownTimer,
    clearVideoTestMode,
    onCheckEngine,
    onStartNewPrayerSession,
    onStatusChange,
    sessionId,
  ]);

  // TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
  const handleVideoPause = useCallback(() => {
    setIsVideoPlaying(false);
    stopLiveLoop();
  }, [stopLiveLoop]);

  // TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
  const handleVideoPlay = useCallback(() => {
    setIsVideoPlaying(true);
  }, []);

  // TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
  useEffect(
    () => () => {
      if (Platform.OS === 'web' && videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
      }
    },
    [],
  );

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
    if (pendingNewSessionStartId === null || pendingNewSessionStartId !== sessionId) return;

    const startTimer = setTimeout(() => {
      setPendingNewSessionStartId(null);
      if (engineStatus !== 'connected') return;

      setFinishedPrayer(false);
      setCountdown(5);
    }, 0);

    return () => clearTimeout(startTimer);
  }, [engineStatus, pendingNewSessionStartId, sessionId, setCountdown]);

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

  // TEMP VIDEO TEST MODE - REMOVE AFTER TESTING
  useEffect(() => {
    if (!isVideoMode || !isVideoReady || !isPrayerStarted || countdown !== null) return;

    void videoRef.current?.play().catch(() => {
      // Browser playback policies may require the tester to press play.
    });
  }, [countdown, isPrayerStarted, isVideoMode, isVideoReady]);

  useEffect(() => {
    if (
      engineStatus !== 'connected' ||
      !isSourceReady ||
      (isVideoMode ? !isVideoPlaying : !isActive) ||
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
        (isVideoMode
          ? !videoRef.current || videoRef.current.paused || videoRef.current.ended || videoRef.current.readyState < 2
          : !cameraRef.current || !cameraActiveRef.current || !cameraReadyRef.current)
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
        let uploadFrame: string | Blob;

        if (isVideoMode) {
          const video = videoRef.current;
          if (!video) return;
          uploadFrame = await prepareWebVideoFrame(video);
        } else {
          const picture = await cameraRef.current!.takePictureAsync({
            quality: 0.3,
            shutterSound: false,
            base64: false,
            exif: false,
          });

          if (cancelled || loopSessionId !== sessionIdRef.current || !liveLoopActiveRef.current) {
            return;
          }

          uploadFrame = picture.uri;

          if (Platform.OS === 'web') {
            try {
              uploadFrame = await prepareWebFrame(picture.uri);
            } catch {
              logLive('web frame preparation failed; using fallback');
            }
          }

          if (typeof uploadFrame === 'string' && picture.width > MAX_UPLOAD_WIDTH) {
            const image = ImageManipulator.manipulate(picture.uri);
            image.resize({ width: MAX_UPLOAD_WIDTH, height: null });
            const renderedImage = await image.renderAsync();
            const resizedImage = await renderedImage.saveAsync({
              format: SaveFormat.JPEG,
              compress: 0.3,
            });
            uploadFrame = resizedImage.uri;
          }
        }

        if (cancelled || loopSessionId !== sessionIdRef.current || !liveLoopActiveRef.current) {
          return;
        }

        const result = await predictImage(uploadFrame, requestController.signal);

        if (cancelled || loopSessionId !== sessionIdRef.current) return;

        const pose = result.pose;
        if (pose !== lastReceivedPoseRef.current) {
          logLive(`pose received: ${pose}`);
          lastReceivedPoseRef.current = pose;
        }

        if (!isDetectedPrayerPose(pose)) {
          poseCandidateRef.current = null;
        } else {
          const now = Date.now();
          const candidate = poseCandidateRef.current;

          if (!candidate || candidate.pose !== pose) {
            poseCandidateRef.current = { pose, startedAt: now };
          } else if (now - candidate.startedAt >= POSE_STABILITY_MS && pose !== lastLivePoseRef.current) {
            onPoseDetectedRef.current(pose, result.confidence);
            logLive(`pose: ${pose}`);
            lastLivePoseRef.current = pose;
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
  }, [
    countdown,
    engineStatus,
    isActive,
    isPrayerStarted,
    isSourceReady,
    isVideoMode,
    isVideoPlaying,
    sessionId,
    stopLiveLoop,
  ]);

  const startPrayer = useCallback(() => {
    if (!canStartPrayer) return;

    if (finishedPrayer) {
      setPendingNewSessionStartId(sessionId + 1);
      onStartNewPrayerSession();
      return;
    }

    setCountdown(5);
  }, [canStartPrayer, finishedPrayer, onStartNewPrayerSession, sessionId, setCountdown]);

  const finishPrayer = useCallback(() => {
    clearCountdownTimer();
    stopLiveLoop();
    setCountdown(null);
    setPrayerStartedSessionId(null);
    setFirstTashahhudReminderSessionId(null);
    setFinishedPrayer(true);
  }, [clearCountdownTimer, setCountdown, stopLiveLoop]);

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
            !isActive && !isVideoMode && !isDarkMode && { backgroundColor: theme.panelRaised },
          ]}
        >
          {isVideoMode ? (
            <>
              {/* TEMP VIDEO TEST MODE - REMOVE AFTER TESTING */}
              <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                src={videoUri}
                onLoadedMetadata={() => setIsVideoReady(true)}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onEnded={handleVideoPause}
                onError={() => setError('تعذر تشغيل ملف الفيديو المحدد.')}
                style={{ width: '100%', height: '100%', backgroundColor: '#000000', objectFit: 'contain' }}
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
            </>
          ) : isActive ? (
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

      {graceStartedAt ? (
        <View style={[styles.earlySittingNotice, { borderColor: theme.brassDim }]}>
          <Text style={[styles.earlySittingNoticeText, { color: theme.brassSoft }]}>
            {graceNoticePrefix} — جاري الانتظار {Math.min(10, Math.max(0, 10 - Math.floor((earlySittingNow - graceStartedAt) / 1_000)))} ثوانٍ
          </Text>
        </View>
      ) : null}

      {showFirstTashahhudReminder ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.firstTashahhudReminder,
            {
              borderColor: theme.brassDim,
              backgroundColor: isDarkMode ? 'rgba(201, 147, 46, 0.12)' : 'rgba(180, 122, 22, 0.08)',
            },
          ]}
        >
          <Text style={[styles.firstTashahhudReminderText, { color: theme.brassSoft }]}>
            ربما نسيت القيام بعد التشهد الأول. إذا كنت قد أتممت الصلاة فتجاهل هذا التنبيه.
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

      {Platform.OS === 'web' ? (
        <>
          {/* TEMP VIDEO TEST MODE - REMOVE AFTER TESTING */}
          <input
            ref={videoInputRef}
            accept="video/mp4,video/quicktime,.mp4,.mov"
            onChange={handleVideoFileChange}
            style={{ display: 'none' }}
            type="file"
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => videoInputRef.current?.click()}
            style={({ pressed }) => [
              styles.videoUploadButton,
              { borderColor: theme.brassDim, backgroundColor: theme.panel },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.testButtonText, { color: theme.brassSoft }]}>رفع فيديو للاختبار</Text>
          </Pressable>
        </>
      ) : null}

      {isActive || isVideoMode ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPrayerStarted ? 'إتمام الصلاة' : 'بدء الصلاة'}
            disabled={isPrayerStarted ? false : !canStartPrayer}
            onPress={isPrayerStarted ? finishPrayer : startPrayer}
            style={({ pressed }) => [
              styles.testButton,
              { borderColor: theme.brassDim, backgroundColor: theme.panel },
              !isPrayerStarted && !canStartPrayer && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.testButtonText, { color: theme.brassSoft }]}>
              {countdown !== null ? `استعد: ${countdown}` : isPrayerStarted ? 'إتمام الصلاة' : 'بدء الصلاة'}
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
  firstTashahhudReminder: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  firstTashahhudReminderText: { fontSize: 13.5, fontWeight: '700', lineHeight: 22, textAlign: 'right', writingDirection: 'rtl' },
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
  videoUploadButton: {
    marginTop: 10,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
