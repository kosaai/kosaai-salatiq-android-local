import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StartupSplash } from '../../components/StartupSplash';

export default function RootLayout() {
  return (
    <StartupSplash>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </StartupSplash>
  );
}
