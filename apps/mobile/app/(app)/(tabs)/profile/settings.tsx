import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, StyleSheet, ToastAndroid, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authClient } from '../../../../lib/auth';
import { Colors, Fonts } from '../../../../constants/theme';
import { BackButton } from '../../../../components/ui/BackButton';
import { patchUser } from '../../../../lib/api';

const C = Colors.light;
function showToast(msg: string) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert('', msg);
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const user = session?.user as any;

  const [notifyPrompt,   setNotifyPrompt]   = useState<boolean>(user?.notifyPromptMatches  ?? true);
  const [notifyCircle,   setNotifyCircle]   = useState<boolean>(user?.notifyCircleRequests ?? true);
  const [notifyMotive,   setNotifyMotive]   = useState<boolean>(user?.notifyMotiveInvites  ?? false);
  const [showInDisc,     setShowInDisc]     = useState<boolean>(user?.showInDiscovery      ?? true);

  async function toggle(field: string, value: boolean) { await patchUser({ [field]: value }); }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton variant="light" />
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.icon}>📱</Text>
            <View style={{ flex: 1 }}><Text style={styles.label}>Phone number</Text><Text style={styles.sub}>{user?.phoneNumber ? '+•• ••• •••• ••••' : 'Not added'}</Text></View>
            <TouchableOpacity onPress={() => showToast('Coming soon — phone change will be available in the next update.')}><Text style={styles.link}>Change</Text></TouchableOpacity>
          </View>
          <View style={[styles.row, styles.border]}>
            <Text style={styles.icon}>✉️</Text>
            <View style={{ flex: 1 }}><Text style={styles.label}>Email</Text><Text style={styles.sub}>{user?.email}</Text></View>
            <Text style={styles.arrow}>▸</Text>
          </View>
          <View style={[styles.row, styles.border, styles.last]}>
            <Text style={styles.icon}>🔒</Text>
            <View style={{ flex: 1 }}><Text style={styles.label}>Contacts sync</Text><Text style={styles.sub}>Off</Text></View>
            <TouchableOpacity onPress={() => showToast('Re-syncing...')}><Text style={styles.link}>Re-sync</Text></TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Prompt matches</Text><Text style={styles.sub}>When someone agrees with you</Text></View>
            <Switch value={notifyPrompt} thumbColor="#fff" trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setNotifyPrompt(v); toggle('notifyPromptMatches', v); }} />
          </View>
          <View style={[styles.row, styles.border]}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Circle requests</Text><Text style={styles.sub}>When someone wants to connect</Text></View>
            <Switch value={notifyCircle} thumbColor="#fff" trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setNotifyCircle(v); toggle('notifyCircleRequests', v); }} />
          </View>
          <View style={[styles.row, styles.border, styles.last]}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Motive invites</Text><Text style={styles.sub}>When you're invited to a plan</Text></View>
            <Switch value={notifyMotive} thumbColor="#fff" trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setNotifyMotive(v); toggle('notifyMotiveInvites', v); }} />
          </View>
        </View>

        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Show in discovery</Text><Text style={styles.sub}>Let others find you via friends-of-friends</Text></View>
            <Switch value={showInDisc} thumbColor="#fff" trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setShowInDisc(v); toggle('showInDiscovery', v); }} />
          </View>
          <View style={[styles.row, styles.border, styles.last]}>
            <Text style={styles.icon}>🛑</Text>
            <Text style={[styles.label, { flex: 1 }]}>Blocked users</Text>
            <Text style={styles.arrow}>▸</Text>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 20 }]}>
          <TouchableOpacity style={styles.row} onPress={async () => { await authClient.signOut(); router.replace('/(auth)/welcome'); }}>
            <Text style={styles.icon}>🚪</Text>
            <Text style={[styles.label, { flex: 1, color: C.error }]}>Sign out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.border, styles.last]} onPress={() => Alert.alert('Delete account', 'This is permanent. All your data will be deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => showToast('Account deletion requested.') }])}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={[styles.label, { flex: 1, color: C.error }]}>Delete account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.backgroundWarm },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontFamily: Fonts.heading, fontSize: 18, color: C.text, flex: 1, fontStyle: 'italic' },
  sectionLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textTertiary, letterSpacing: 0.6, paddingHorizontal: 18, marginBottom: 6, marginTop: 12 },
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  border: { borderTopWidth: 1, borderTopColor: C.borderWarm },
  last: {},
  icon: { fontSize: 16 },
  label: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.text },
  sub: { fontFamily: Fonts.body, fontSize: 9, color: C.textTertiary, marginTop: 1 },
  link: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: C.primary },
  arrow: { fontSize: 10, color: C.textTertiary },
});
