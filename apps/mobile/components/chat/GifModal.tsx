import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Fonts } from '../../constants/theme';

const C = Colors.light;
const TENOR_KEY = process.env.EXPO_PUBLIC_TENOR_API_KEY ?? '';

export type TenorGif = { id: string; url: string; preview: string };

export function GifModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function search(q: string) {
    if (!TENOR_KEY) return;
    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=24&media_filter=gif,tinygif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=24&media_filter=gif,tinygif`;
      const res = await fetch(endpoint);
      const json = await res.json();
      const results: TenorGif[] = (json.results ?? []).map((r: any) => ({
        id: r.id,
        url: r.media_formats?.gif?.url ?? '',
        preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? '',
      }));
      setGifs(results.filter(g => g.url));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) search('');
  }, [visible]);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 400);
  }

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[gm.sheet, { paddingBottom: insets.bottom }]}>
        <View style={gm.handle} />

        <View style={gm.searchRow}>
          <MaterialIcons name="search" size={18} color={C.textTertiary} style={{ marginLeft: 10 }} />
          <TextInput
            style={gm.input}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search GIFs…"
            placeholderTextColor={C.textTertiary}
            autoFocus
          />
          <TouchableOpacity onPress={onClose} style={gm.closeBtn}>
            <MaterialIcons name="close" size={18} color={C.textTertiary} />
          </TouchableOpacity>
        </View>

        {!TENOR_KEY ? (
          <View style={gm.empty}>
            <Text style={gm.emptyTxt}>Add EXPO_PUBLIC_TENOR_API_KEY to .env to enable GIFs</Text>
          </View>
        ) : loading ? (
          <View style={gm.empty}><ActivityIndicator color={C.primary} /></View>
        ) : (
          <FlatList
            data={gifs}
            numColumns={2}
            keyExtractor={g => g.id}
            contentContainerStyle={{ padding: 8, gap: 6 }}
            columnWrapperStyle={{ gap: 6 }}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => { onPick(item.url); onClose(); }} style={gm.gifCell}>
                <Image source={{ uri: item.preview }} style={gm.gifImg} contentFit="cover" />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const gm = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '75%', backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, backgroundColor: C.surfaceAlt, borderRadius: 12,
  },
  input: {
    flex: 1, fontFamily: Fonts.body, fontSize: 14, color: C.text,
    paddingVertical: 10, paddingHorizontal: 8,
  },
  closeBtn: { padding: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTxt: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, textAlign: 'center' },
  gifCell: { flex: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  gifImg: { width: '100%', height: '100%' },
});
