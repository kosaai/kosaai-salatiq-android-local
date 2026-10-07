import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors, lightColors } from '../constants/theme';
import { FontAwesomeIcon } from './FontAwesomeIcon';

type PageShellProps = {
  title: string;
  isDarkMode: boolean;
  children?: ReactNode;
  /** Rendered under the title inside the header area (the hero logo). */
  headerExtra?: ReactNode;
  /** Very low opacity Salatiq logo used as a decorative header background. */
  watermark?: boolean;
};

/**
 * Shared scaffold for the secondary pages: same gradient, padding and colour
 * tokens as the home screen, a circular back button, and a large RTL title.
 */
export function PageShell({
  title,
  isDarkMode,
  children,
  headerExtra,
  watermark = false,
}: PageShellProps) {
  const theme = isDarkMode ? colors : lightColors;
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 360 ? 12 : 16;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <LinearGradient
      colors={isDarkMode ? ['#16303F', colors.background] : ['#FFF9EC', lightColors.background]}
      locations={[0, 0.38]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            {watermark ? (
              <Image
                accessibilityElementsHidden
                importantForAccessibility="no"
                source={
                  isDarkMode
                    ? require('../assets/branding/salatiq-logo-dark.png')
                    : require('../assets/branding/salatiq-logo-light.png')
                }
                resizeMode="contain"
                style={styles.watermark}
              />
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              hitSlop={10}
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backButton,
                { borderColor: theme.line, backgroundColor: theme.panel },
                pressed && styles.pressed,
              ]}
            >
              <FontAwesomeIcon name="arrow-right" size={17} color={theme.brassSoft} />
            </Pressable>

            <Text style={[styles.title, { color: theme.ivory }]}>{title}</Text>
            {headerExtra}
          </View>

          <View style={styles.body}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingTop: 14, paddingBottom: 48 },
  header: { position: 'relative', overflow: 'hidden', paddingBottom: 2 },
  watermark: { position: 'absolute', top: -70, left: 0, right: 0, height: 300, opacity: 0.07 },
  backButton: {
    alignSelf: 'flex-end',
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: {
    color: colors.ivory,
    fontSize: 27,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 12,
  },
  body: { marginTop: 20 },
  pressed: { opacity: 0.8 },
});
