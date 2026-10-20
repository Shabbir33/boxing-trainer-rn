import { Bangers_400Regular, useFonts } from '@expo-google-fonts/bangers';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Bangers_400Regular });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.night },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="play" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}
