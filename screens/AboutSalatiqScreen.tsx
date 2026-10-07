import { PageShell } from '../components/PageShell';
import { colors, lightColors } from '../constants/theme';
import { usePageTheme } from '../hooks/usePageTheme';
import { Image, StyleSheet, Text, View } from 'react-native';

const paragraphs = [
  'صلاتك هو تطبيق ذكي صُمم لمساعدة المصلّي على متابعة تسلسل صلاته والتنبيه عند حدوث خطأ محتمل بسبب الزيادة أو النقص في حركات الصلاة أو الركعات.',
  'تم تطوير التطبيق للمساعدة في حال حدوث نسيان أو سهو غير متوقع أثناء الصلاة، بحيث يتابع تسلسل الصلاة باستخدام تقنيات الذكاء الاصطناعي.',
  'يتعرّف التطبيق على وضعيات الصلاة الأساسية، مثل القيام والركوع والسجود والجلوس، ويتابع انتقال المصلّي بينها بحسب الصلاة التي اختارها.',
  'وعند اكتشاف خطأ محتمل في تسلسل الصلاة، يقوم التطبيق بالتحقق من الحالة أولًا، ثم يصدر تنبيهًا صوتيًا لمساعدة المصلّي على الانتباه عند حدوث زيادة أو نقص محتمل.',
  'صلاتك ليس بديلًا عن انتباه المصلّي أو معرفته بصلاته، وقد تحدث أخطاء في التعرّف أو المتابعة بحسب وضع الكاميرا، والإضاءة، وزاوية التصوير، أو ظروف الاستخدام المختلفة.',
  'لذلك يُستخدم صلاتك كوسيلة مساعدة إضافية في حال حدوث نسيان أو سهو غير متوقع أثناء الصلاة.',
];

export function AboutSalatiqScreen() {
  const isDarkMode = usePageTheme();
  const theme = isDarkMode ? colors : lightColors;

  return (
    <PageShell
      title="عن صلاتك"
      isDarkMode={isDarkMode}
      watermark
      headerExtra={
        <Image
          accessibilityLabel="شعار صلاتك"
          source={
            isDarkMode
              ? require('../assets/branding/salatiq-logo-dark.png')
              : require('../assets/branding/salatiq-logo-light.png')
          }
          resizeMode="contain"
          style={styles.heroLogo}
        />
      }
    >
      <View style={styles.paragraphs}>
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={[styles.paragraph, { color: theme.ivory }]}>
            {paragraph}
          </Text>
        ))}
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  heroLogo: { width: 150, height: 150, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  paragraphs: { gap: 16 },
  paragraph: {
    color: colors.ivory,
    fontSize: 14.5,
    lineHeight: 27,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
