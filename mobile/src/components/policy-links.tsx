import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './ui';

const websiteUrl = 'https://arcelassist.vercel.app';
const policies = [
  { path: 'about', label: 'About Us' },
  { path: 'privacy', label: 'Privacy Policy' },
  { path: 'terms', label: 'Terms of Service' },
] as const;

/** Open About and public policies in a browser sheet, before or after sign-in. */
export function PolicyLinks() {
  const [error, setError] = useState<string | null>(null);
  const openPolicy = async (path: typeof policies[number]['path']) => {
    setError(null);
    try { await WebBrowser.openBrowserAsync(`${websiteUrl}/${path}`); }
    catch { setError('Could not open this page. Please try again.'); }
  };
  return <View>
    <View style={styles.row}>
      {policies.map(({ path, label }) => <Pressable key={path} accessibilityRole="link"
        accessibilityLabel={label} onPress={() => void openPolicy(path)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <AppText tone="secondary" style={styles.label}>{label}</AppText>
      </Pressable>)}
    </View>
    {error ? <AppText tone="secondary" style={styles.error}>{error}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8 },
  link: { minHeight: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 16, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
  error: { fontSize: 12, textAlign: 'center' },
});
