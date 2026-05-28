import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Colors, Fonts } from '../../../../../constants/theme';
import { Routes } from '../../../../../lib/routes';
import { Avatar } from '../../../../../components/ui/Avatar';
import { getMotiveMemories, getMotive, MemoryContributor, Motive } from '../../../../../lib/api';
import { BackButton } from '../../../../../components/ui/BackButton';

// Dark gallery mode — intentionally uses dark theme tokens
const Cd = Colors.dark;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - 4) / 3;

// ─── Rating display ───────────────────────────────────────────────────────────

function ratingStars(r: number | null): string {
  if (!r) return '';
  return '★'.repeat(r);
}

// ─── Full-screen photo viewer ─────────────────────────────────────────────────

function Lightbox({
  photos,
  initialIndex,
  visible,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const insets = useSafeAreaInsets();

  useEffect(() => setIndex(initialIndex), [initialIndex]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={lb.bg}>
        <StatusBar hidden />
        {/* Close */}
        <TouchableOpacity onPress={onClose} style={[lb.close, { top: insets.top + 12 }]}>
          <Text style={lb.closeText}>Close</Text>
        </TouchableOpacity>

        {/* Counter */}
        <Text style={[lb.counter, { top: insets.top + 16 }]}>
          {index + 1} / {photos.length}
        </Text>

        {/* Main image */}
        <Image source={{ uri: photos[index] }} style={lb.image} resizeMode="contain" />

        {/* Prev / next */}
        <View style={lb.navRow}>
          <TouchableOpacity
            onPress={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            style={[lb.navBtn, index === 0 && lb.navBtnDisabled]}
          >
            <Text style={lb.navText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIndex(i => Math.min(photos.length - 1, i + 1))}
            disabled={index === photos.length - 1}
            style={[lb.navBtn, index === photos.length - 1 && lb.navBtnDisabled]}
          >
            <Text style={lb.navText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const lb = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  close: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  closeText: {
    color: Cd.text,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },
  counter: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  navRow: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    gap: 24,
  },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.25,
  },
  navText: {
    color: Cd.text,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: Fonts.body,
  },
});

// ─── Person section ───────────────────────────────────────────────────────────

function PersonSection({
  contributor,
  onPhotoPress,
}: {
  contributor: MemoryContributor;
  onPhotoPress: (photos: string[], idx: number) => void;
}) {
  const hasPhotos = contributor.photos.length > 0;

  return (
    <View style={styles.section}>
      {/* Person header */}
      <View style={styles.personHeader}>
        <Avatar name={contributor.userName} userId={contributor.userId} size="sm" />
        <View style={styles.personInfo}>
          <Text style={styles.personName}>
            {contributor.isMe ? 'You' : (contributor.userName ?? 'Someone')}
          </Text>
          <View style={styles.personMeta}>
            {contributor.rating != null && (
              <Text style={styles.personRating}>{ratingStars(contributor.rating)}</Text>
            )}
            {contributor.vibeTags.length > 0 && (
              <Text style={styles.personVibes} numberOfLines={1}>
                {contributor.vibeTags.slice(0, 3).join(' · ')}
              </Text>
            )}
          </View>
        </View>
        {contributor.isMe && (
          <Text style={styles.youBadge}>you</Text>
        )}
      </View>

      {/* Photo grid */}
      {hasPhotos ? (
        <View style={styles.photoGrid}>
          {contributor.photos.map((url, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => onPhotoPress(contributor.photos, idx)}
              activeOpacity={0.9}
            >
              <Image source={{ uri: url }} style={styles.photo} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.noPhotos}>
          <Text style={styles.noPhotosText}>No photos shared yet</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [memories, setMemories] = useState<MemoryContributor[]>([]);
  const [motive, setMotive] = useState<Motive | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Lightbox state
  const [lbPhotos, setLbPhotos] = useState<string[]>([]);
  const [lbIndex, setLbIndex] = useState(0);
  const [lbVisible, setLbVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [memRes, motRes] = await Promise.all([
        getMotiveMemories(id),
        getMotive(id),
      ]);
      // Put "me" first
      const sorted = [...memRes.memories].sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : 0));
      setMemories(sorted);
      setMotive(motRes.motive);
    } catch (e) {
      console.error('[memories] load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handlePhotoPress(photos: string[], idx: number) {
    setLbPhotos(photos);
    setLbIndex(idx);
    setLbVisible(true);
  }

  const totalPhotos = memories.reduce((n, m) => n + m.photos.length, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton variant="dark" />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {motive?.title ?? 'Memories'}
          </Text>
          {totalPhotos > 0 && (
            <Text style={styles.headerSub}>{totalPhotos} photo{totalPhotos !== 1 ? 's' : ''}</Text>
          )}
        </View>
        {/* Add your memories shortcut */}
        <TouchableOpacity
          onPress={() => router.push(Routes.motiveMemory(id!))}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : memories.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No memories yet</Text>
          <Text style={styles.emptySub}>Be the first to share yours</Text>
          <TouchableOpacity
            onPress={() => router.push(Routes.motiveMemory(id!))}
            style={styles.emptyBtn}
          >
            <Text style={styles.emptyBtnText}>Add memories</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={C.primary}
            />
          }
        >
          {memories.map(contributor => (
            <PersonSection
              key={contributor.userId}
              contributor={contributor}
              onPhotoPress={handlePhotoPress}
            />
          ))}
        </ScrollView>
      )}

      <Lightbox
        photos={lbPhotos}
        initialIndex={lbIndex}
        visible={lbVisible}
        onClose={() => setLbVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Cd.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Cd.border,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 16,
    color: Cd.text,
    fontStyle: 'italic',
  },
  headerSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Cd.textTertiary,
    marginTop: 1,
  },
  addBtn: {
    width: 56,
    alignItems: 'flex-end',
  },
  addBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.primary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    color: Cd.text,
    fontStyle: 'italic',
  },
  emptySub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Cd.textTertiary,
  },
  emptyBtn: {
    marginTop: 16,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Cd.text,
  },
  list: {
    paddingTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Cd.text,
  },
  personMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  personRating: {
    fontSize: 13,
    color: C.primary,
  },
  personVibes: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Cd.textTertiary,
    flex: 1,
  },
  youBadge: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.primary,
    backgroundColor: 'rgba(255,107,53,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    paddingHorizontal: 2,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    backgroundColor: Cd.surface,
  },
  noPhotos: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noPhotosText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Cd.textTertiary,
    fontStyle: 'italic',
  },
});
