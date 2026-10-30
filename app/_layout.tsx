import { Link, Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import SoundToggle from './components/SoundToggle';

export default function Layout() {
  return (
    <>
      <Head>
        <title>WodBuilder</title>
      </Head>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#141414' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#000' },
          headerTitle: ({ children }) => (
            <Link href="/" style={styles.headerTitleLink}>
              {children}
            </Link>
          ),
        }}
      >
        <Stack.Screen name="index" options={{ title: 'WodBuilder' }} />
        <Stack.Screen name="new" options={{ title: 'New WOD' }} />
        <Stack.Screen name="ai" options={{ title: 'Build WOD with AI' }} />
        <Stack.Screen name="pick" options={{ title: 'Pick Exercises' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Edit WOD' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen
          name="workout/[id]"
          options={{
            title: 'Workout',
            headerBackTitle: 'Quit',
            headerRight: () => <SoundToggle />,
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitleLink: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
