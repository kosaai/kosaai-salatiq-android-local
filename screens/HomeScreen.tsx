import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { PrayerCamera } from '../components/PrayerCamera';
import { PrayerOverviewCard } from '../components/PrayerOverviewCard';
import { PrayerStageCard } from '../components/PrayerStageCard';
import { prayerConfig, prayerTypes } from '../constants/prayers';
import { colors, lightColors } from '../constants/theme';
import { useEngineConnection } from '../hooks/useEngineConnection';
import { usePrayerSession } from '../hooks/usePrayerSession';

export function HomeScreen() {
  const { width } = useWindowDimensions();
  const {
    selectedPrayer,
    prayerState,
    cameraStatus,
    sessionId,
    selectPrayer,
    startNewPrayerSession,
    setCameraStatus,
    applyEngineEvent,
  } = usePrayerSession();
  const { engineStatus, checkConnection } = useEngineConnection();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const theme = isDarkMode ? colors : lightColors;
  const horizontalPadding = width < 360 ? 12 : 16;
  const cardWidth = useMemo(() => Math.max(54, (width - horizontalPadding * 2 - 40 - 28) / 5), [horizontalPadding, width]);
  const latestSahwAlert = prayerState.sahwAlerts[prayerState.sahwAlerts.length - 1] ?? null;
  const sahwPlayer = useAudioPlayer(require('../assets/audio/sahw-alert.mp3'));
  const playedAlertIdsRef = useRef(new Set<string>());

  const playSahwAlert = useCallback(() => {
    void sahwPlayer.seekTo(0).then(() => sahwPlayer.play()).catch(() => {
      // Audio failure must never affect the live prayer flow.
    });
  }, [sahwPlayer]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
      // The alert remains non-blocking if an audio session cannot be configured.
    });
  }, []);

  useEffect(() => {
    playedAlertIdsRef.current.clear();
  }, [sessionId]);

  useEffect(() => {
    if (!latestSahwAlert) return;

    const alertId = `${latestSahwAlert.type}:${latestSahwAlert.rakah}:${latestSahwAlert.stageId ?? ''}`;
    if (playedAlertIdsRef.current.has(alertId)) return;

    playedAlertIdsRef.current.add(alertId);
    playSahwAlert();
  }, [latestSahwAlert, playSahwAlert]);

  return (
    <LinearGradient colors={isDarkMode ? ['#16303F', colors.background] : ['#FFF9EC', lightColors.background]} locations={[0, 0.38]} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}
          showsVerticalScrollIndicator={false}
          >
          <View style={styles.themeHeader}>
            <Image
              accessibilityLabel="شعار صلاتك"
              source={
                isDarkMode
                  ? require('../assets/branding/salatiq-logo-dark.png')
                  : require('../assets/branding/salatiq-logo-light.png')
              }
              resizeMode="contain"
              style={styles.brandLogo}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDarkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
              onPress={() => setIsDarkMode((current) => !current)}
              hitSlop={10}
              style={styles.themeButton}
            >
              <Ionicons name={isDarkMode ? 'moon-outline' : 'sunny-outline'} size={23} color={theme.brassSoft} />
            </Pressable>
          </View>
          <View style={[styles.selector, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={[styles.selectorTitle, { color: theme.muted }]}>اختر الصلاة</Text>
            <View style={styles.prayerGrid}>
              {prayerTypes.map((prayer) => {
                const selected = selectedPrayer === prayer;
                return (
                  <Pressable
                    key={prayer}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => selectPrayer(prayer)}
                    style={({ pressed }) => [
                      styles.prayerOption,
                      { width: cardWidth },
                      { borderColor: selected ? theme.brass : theme.line, backgroundColor: selected ? theme.brassDim : 'rgba(255,255,255,0.025)' },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.prayerText, { color: selected ? theme.brassSoft : theme.muted }, selected && styles.prayerTextSelected]}>
                      {prayerConfig[prayer].arabicName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <PrayerOverviewCard
            prayer={selectedPrayer}
            state={prayerState}
            cameraStatus={cameraStatus}
            isDarkMode={isDarkMode}
          />
          <PrayerCamera
            onStatusChange={setCameraStatus}
            engineStatus={engineStatus}
            onCheckEngine={checkConnection}
            onPoseDetected={(pose) => applyEngineEvent({ state: { currentPose: pose } })}
            onStartNewPrayerSession={startNewPrayerSession}
            sessionId={sessionId}
            fajrEarlySittingStartedAt={prayerState.fajrEarlySittingStartedAt}
            maghribEarlySittingStartedAt={prayerState.maghribEarlySittingStartedAt}
            fourRakahEarlySittingStartedAt={prayerState.fourRakahEarlySittingStartedAt}
            firstTashahhudStartedAt={prayerState.firstTashahhudStartedAt}
            isDarkMode={isDarkMode}
          />

          <PrayerStageCard
            prayer={selectedPrayer}
            engineStatus={engineStatus}
            currentPose={prayerState.currentPose}
            state={prayerState}
            isDarkMode={isDarkMode}
          />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingTop: 14, paddingBottom: 48 },
  themeHeader: { marginBottom: 10, minHeight: 54, paddingHorizontal: 4, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  brandLogo: { width: 108, height: 54 },
  themeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  selector: { marginBottom: 22, padding: 16, borderRadius: 18, borderWidth: 1 },
  selectorTitle: { color: colors.muted, fontSize: 12, textAlign: 'center', writingDirection: 'rtl', marginBottom: 12 },
  prayerGrid: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 7 },
  prayerOption: { minHeight: 42, paddingHorizontal: 2, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  prayerText: { fontSize: 11.5, writingDirection: 'rtl' },
  prayerTextSelected: { fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
