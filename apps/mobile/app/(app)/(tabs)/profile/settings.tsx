import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, StyleSheet, ToastAndroid, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { authClient } from '../../../../lib/auth';
import { Colors, Fonts } from '../../../../constants/theme';
import { BackButton } from '../../../../components/ui/BackButton';
import { patchUser, deleteAccount } from '../../../../lib/api';

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
  const [deleting,       setDeleting]       = useState(false);

  async function toggle(field: string, value: boolean) { await patchUser({ [field]: value }); }

  function confirmDelete() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your profile, connections, motives, messages, and all other data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              await authClient.signOut();
              router.replace('/(auth)/welcome');
            } catch {
              setDeleting(false);
              Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
            }
          },
        },
      ],
    );
  }

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
            <MaterialIcons name="phone-iphone" size={18} color={C.textSecondary} />
            <View style={{ flex: 1 }}><Text style={styles.label}>Phone number</Text><Text style={styles.sub}>{user?.phoneNumber ? '+•• ••• •••• ••••' : 'Not added'}</Text></View>
            <TouchableOpacity onPress={() => user?.phoneNumber ? showToast('Coming soon — phone change will be available in the next update.') : router.push('/(app)/add-phone')}><Text style={styles.link}>{user?.phoneNumber ? 'Change' : 'Add'}</Text></TouchableOpacity>
          </View>
          <View style={[styles.row, styles.border]}>
            <MaterialIcons name="mail-outline" size={18} color={C.textSecondary} />
            <View style={{ flex: 1 }}><Text style={styles.label}>Email</Text><Text style={styles.sub}>{user?.email}</Text></View>
            <MaterialIcons name="chevron-right" size={18} color={C.textTertiary} />
          </View>
          <View style={[styles.row, styles.border, styles.last]}>
            <MaterialIcons name="sync" size={18} color={C.textSecondary} />
            <View style={{ flex: 1 }}><Text style={styles.label}>Contacts sync</Text><Text style={styles.sub}>Off</Text></View>
            <TouchableOpacity onPress={() => showToast('Re-syncing...')}><Text style={styles.link}>Re-sync</Text></TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Prompt matches</Text><Text style={styles.sub}>When someone agrees with you</Text></View>
            <Switch value={notifyPrompt} thumbColor={C.textInverse} trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setNotifyPrompt(v); toggle('notifyPromptMatches', v); }} />
          </View>
          <View style={[styles.row, styles.border]}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Circle requests</Text><Text style={styles.sub}>When someone wants to connect</Text></View>
            <Switch value={notifyCircle} thumbColor={C.textInverse} trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setNotifyCircle(v); toggle('notifyCircleRequests', v); }} />
          </View>
          <View style={[styles.row, styles.border, styles.last]}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Motive invites</Text><Text style={styles.sub}>When you're invited to a plan</Text></View>
            <Switch value={notifyMotive} thumbColor={C.textInverse} trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setNotifyMotive(v); toggle('notifyMotiveInvites', v); }} />
          </View>
        </View>

        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Text style={styles.label}>Show in discovery</Text><Text style={styles.sub}>Let others find you via friends-of-friends</Text></View>
            <Switch value={showInDisc} thumbColor={C.textInverse} trackColor={{ true: C.primary, false: C.border }} onValueChange={v => { setShowInDisc(v); toggle('showInDiscovery', v); }} />
          </View>
          <View style={[styles.row, styles.border, styles.last]}>
            <MaterialIcons name="block" size={18} color={C.textSecondary} />
            <Text style={[styles.label, { flex: 1 }]}>Blocked users</Text>
            <MaterialIcons name="chevron-right" size={18} color={C.textTertiary} />
          </View>
        </View>

        <Text style={styles.sectionLabel}>LEGAL</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('https://joinberg.app/privacy')}>
            <MaterialIcons name="privacy-tip" size={18} color={C.textSecondary} />
            <Text style={[styles.label, { flex: 1 }]}>Privacy Policy</Text>
            <MaterialIcons name="open-in-new" size={14} color={C.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.border]} onPress={() => Linking.openURL('https://joinberg.app/terms')}>
            <MaterialIcons name="description" size={18} color={C.textSecondary} />
            <Text style={[styles.label, { flex: 1 }]}>Terms of Service</Text>
            <MaterialIcons name="open-in-new" size={14} color={C.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.border, styles.last]} onPress={() => Linking.openURL('https://joinberg.app/delete-data')}>
            <MaterialIcons name="manage-accounts" size={18} color={C.textSecondary} />
            <Text style={[styles.label, { flex: 1 }]}>Request data deletion</Text>
            <MaterialIcons name="open-in-new" size={14} color={C.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { marginTop: 20 }]}>
          <TouchableOpacity style={styles.row} onPress={async () => { await authClient.signOut(); router.replace('/(auth)/welcome'); }}>
            <MaterialIcons name="logout" size={18} color={C.error} />
            <Text style={[styles.label, { flex: 1, color: C.error }]}>Sign out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.border, styles.last]} onPress={confirmDelete} disabled={deleting}>
            {deleting
              ? <ActivityIndicator size="small" color={C.error} style={{ marginRight: 8 }} />
              : <MaterialIcons name="warning-amber" size={18} color={C.error} />}
            <Text style={[styles.label, { flex: 1, color: C.error }]}>
              {deleting ? 'Deleting account…' : 'Delete account'}
            </Text>
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
  label: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.text },
  sub: { fontFamily: Fonts.body, fontSize: 9, color: C.textTertiary, marginTop: 1 },
  link: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: C.primary },
});
