import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Share, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { C, Fonts } from '../../constants/theme';
import { Avatar } from '../ui/Avatar';
import { getPublicUser, requestConnection } from '../../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  inviteUrl: string | null;
  displayName: string;
  username?: string | null;
  userImage?: string | null;
}

export function QrModal({ visible, onClose, userId, inviteUrl, displayName, username, userImage }: Props) {
  const insets = useSafeAreaInsets();

  const [qrTab, setQrTab] = useState<'my' | 'scan'>('my');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanResult, setScanResult] = useState<{ userId: string; name: string | null; image: string | null } | null>(null);
  const [scanSending, setScanSending] = useState(false);
  const [scanDone, setScanDone] = useState<'success' | 'error' | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const scanCooldown = useRef(false);

  function handleClose() {
    setScanResult(null);
    setScanDone(null);
    setScanMessage('');
    scanCooldown.current = false;
    setQrTab('my');
    onClose();
  }

  async function handleQRScan({ data }: BarcodeScanningResult) {
    if (scanCooldown.current || scanResult) return;
    // Parse berg://connect/{userId}
    const match = data.match(/^berg:\/\/connect\/([a-z0-9_-]+)$/i);
    if (!match) return;
    const scannedUserId = match[1];
    if (scannedUserId === userId) return; // can't connect with yourself
    scanCooldown.current = true;
    try {
      const { user: scannedUser } = await getPublicUser(scannedUserId);
      if (scannedUser.connectionStatus === 'confirmed') {
        setScanMessage(`You're already connected with ${scannedUser.name ?? 'this person'}!`);
        setScanDone('success');
      } else {
        setScanResult({ userId: scannedUserId, name: scannedUser.name, image: scannedUser.image });
      }
    } catch {
      scanCooldown.current = false;
    }
  }

  async function handleSendRequest() {
    if (!scanResult) return;
    setScanSending(true);
    try {
      await requestConnection(scanResult.userId);
      setScanMessage(`Request sent to ${scanResult.name ?? 'this person'}!`);
      setScanDone('success');
    } catch (e: any) {
      setScanMessage(e.message ?? 'Could not send request.');
      setScanDone('error');
    } finally {
      setScanSending(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={handleClose}
    >
      <View style={styles.qrModal}>
        {/* Header */}
        <View style={[styles.qrModalHeader, { paddingTop: Math.max(insets.top + 8, 20) }]}>
          <TouchableOpacity style={styles.qrModalBack} onPress={handleClose}>
            <Text style={styles.qrModalBackText}>Close</Text>
          </TouchableOpacity>
          {/* Tab toggle */}
          <View style={styles.qrTabBar}>
            <TouchableOpacity
              style={[styles.qrTab, qrTab === 'my' && styles.qrTabActive]}
              onPress={() => setQrTab('my')}
            >
              <Text style={[styles.qrTabText, qrTab === 'my' && styles.qrTabTextActive]}>My Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.qrTab, qrTab === 'scan' && styles.qrTabActive]}
              onPress={async () => {
                if (!cameraPermission?.granted) await requestCameraPermission();
                setScanResult(null);
                scanCooldown.current = false;
                setQrTab('scan');
              }}
            >
              <Text style={[styles.qrTabText, qrTab === 'scan' && styles.qrTabTextActive]}>Scan</Text>
            </TouchableOpacity>
          </View>
          <View style={{ width: 52 }} />
        </View>

        {/* My Code tab */}
        {qrTab === 'my' && (
          <View style={styles.qrContent}>
            <Avatar name={displayName} userId={userId} uri={userImage ?? undefined} size="xl" style={styles.qrAvatar} />
            <Text style={styles.qrName}>{displayName}</Text>
            {username ? <Text style={styles.qrUsername}>@{username}</Text> : null}
            {userId ? (
              <>
                <View style={styles.qrBox}>
                  {/* QR value = berg://connect/{userId} — unique per user */}
                  <QRCode
                    value={`berg://connect/${userId}`}
                    size={160}
                    color="#1a1a1a"
                    backgroundColor="#fff"
                  />
                </View>
                <Text style={styles.qrHint}>
                  Ask friends to scan this to connect with you
                </Text>
                {inviteUrl && (
                  <TouchableOpacity
                    style={styles.qrShareBtn}
                    onPress={() => Share.share({ message: `Add me on Berg!\n${inviteUrl}` })}
                  >
                    <Text style={styles.qrShareText}>Share invite link</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: Fonts.body }}>Loading…</Text>
            )}
          </View>
        )}

        {/* Scan tab */}
        {qrTab === 'scan' && (
          <View style={{ flex: 1 }}>
            {cameraPermission?.granted ? (
              scanResult ? (
                scanDone ? (
                  // Success / error result card
                  <View style={styles.scanConfirm}>
                    <View style={[styles.scanResultIcon, scanDone === 'success' ? styles.scanResultIconSuccess : styles.scanResultIconError]}>
                      <Text style={styles.scanResultIconText}>{scanDone === 'success' ? '✓' : '!'}</Text>
                    </View>
                    <Text style={styles.scanConfirmName}>
                      {scanDone === 'success' ? 'Request sent!' : 'Hmm, something went wrong'}
                    </Text>
                    <Text style={styles.scanConfirmSub}>{scanMessage}</Text>
                    <TouchableOpacity
                      style={[styles.qrShareBtn, { marginTop: 28 }]}
                      onPress={handleClose}
                    >
                      <Text style={styles.qrShareText}>Done</Text>
                    </TouchableOpacity>
                    {scanDone === 'error' && (
                      <TouchableOpacity
                        style={styles.scanRetry}
                        onPress={() => { setScanResult(null); setScanDone(null); setScanMessage(''); scanCooldown.current = false; }}
                      >
                        <Text style={styles.scanRetryText}>Try again</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  // Show confirmation after successful scan
                  <View style={styles.scanConfirm}>
                    <Avatar name={scanResult.name} userId={scanResult.userId} uri={scanResult.image ?? undefined} size="xl" style={{ marginBottom: 16 }} />
                    <Text style={styles.scanConfirmName}>{scanResult.name ?? 'Someone'}</Text>
                    <Text style={styles.scanConfirmSub}>Send them a connection request?</Text>
                    <TouchableOpacity
                      style={[styles.qrShareBtn, { marginTop: 24 }]}
                      onPress={handleSendRequest}
                      disabled={scanSending}
                    >
                      <Text style={styles.qrShareText}>
                        {scanSending ? 'Sending…' : 'Send connection request'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.scanRetry}
                      onPress={() => { setScanResult(null); scanCooldown.current = false; }}
                    >
                      <Text style={styles.scanRetryText}>Scan again</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                // Camera viewfinder
                <View style={{ flex: 1 }}>
                  <CameraView
                    style={{ flex: 1 }}
                    facing="back"
                    onBarcodeScanned={handleQRScan}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  />
                  <View style={styles.scanOverlay}>
                    <View style={styles.scanFrame} />
                    <Text style={styles.scanHint}>Point at an Berg QR code</Text>
                  </View>
                </View>
              )
            ) : (
              <View style={styles.scanConfirm}>
                <Text style={styles.scanConfirmName}>Camera access needed</Text>
                <Text style={styles.scanConfirmSub}>Allow camera access to scan QR codes</Text>
                <TouchableOpacity style={[styles.qrShareBtn, { marginTop: 20 }]} onPress={requestCameraPermission}>
                  <Text style={styles.qrShareText}>Allow camera</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── QR modal (stays dark) ──
  qrModal: { flex: 1, backgroundColor: '#111111' },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  qrModalBack: {},
  qrModalBackText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    width: 52,
  },
  // Tab toggle — dark-mode styling
  qrTabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 3,
  },
  qrTab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  qrTabActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  qrTabText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  qrTabTextActive: { color: '#fff' },
  // My code content
  qrContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 60,
  },
  qrAvatar: { marginBottom: 16 },
  qrName: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    color: C.textInverse,
    marginBottom: 4,
    letterSpacing: -0.5,
    fontStyle: 'italic',
  },
  qrUsername: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 24,
  },
  qrBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  qrHint: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 19,
  },
  qrShareBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 36,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  qrShareText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  // Scan tab
  scanOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: C.primary,
    shadowColor: C.primary,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 4,
  },
  scanHint: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textInverse,
    marginTop: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scanConfirm: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  scanConfirmName: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    color: C.textInverse,
    fontStyle: 'italic',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  scanConfirmSub: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  scanRetry: { marginTop: 16, padding: 12 },
  scanRetryText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  scanResultIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  scanResultIconSuccess: { backgroundColor: 'rgba(45,106,79,0.25)', borderWidth: 2, borderColor: '#2D6A4F' },
  scanResultIconError: { backgroundColor: 'rgba(197,48,48,0.2)', borderWidth: 2, borderColor: '#C53030' },
  scanResultIconText: {
    fontFamily: Fonts.heading,
    fontSize: 32,
    color: C.textInverse,
  },
});
