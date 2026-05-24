import { useState, useEffect } from 'react';
import {
  Modal, View, TouchableOpacity, Text, Dimensions,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect, Circle as SvgCircle } from 'react-native-svg';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Fonts } from '../../constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');
const CROP_D = SW * 0.82;

type Props = {
  visible: boolean;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  onConfirm: (croppedUri: string) => void;
  onCancel: () => void;
};

export function CircularCropModal({
  visible, imageUri, imageWidth, imageHeight, onConfirm, onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [processing, setProcessing] = useState(false);

  const iW = imageWidth || 1;
  const iH = imageHeight || 1;
  const fillScale = Math.max(CROP_D / iW, CROP_D / iH);
  const dispW = iW * fillScale;
  const dispH = iH * fillScale;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = 1;
      savedScale.value = 1;
      tx.value = 0;
      ty.value = 0;
      savedTx.value = 0;
      savedTy.value = 0;
      setProcessing(false);
    }
  }, [visible]);

  function clamp(v: number, lo: number, hi: number) {
    'worklet';
    return Math.min(Math.max(v, lo), hi);
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, 1, 5);
    })
    .onEnd(() => { savedScale.value = scale.value; });

  const panG = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      const s = scale.value;
      const maxX = Math.max(0, (dispW * s - CROP_D) / 2);
      const maxY = Math.max(0, (dispH * s - CROP_D) / 2);
      tx.value = clamp(savedTx.value + e.translationX, -maxX, maxX);
      ty.value = clamp(savedTy.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });

  const composed = Gesture.Simultaneous(pinch, panG);

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  async function handleConfirm() {
    setProcessing(true);
    try {
      const userScale = scale.value;
      const totalScale = fillScale * userScale;

      // Image origin in the crop-circle container (CROP_D × CROP_D):
      const imgLeft = CROP_D / 2 + tx.value - (dispW * userScale) / 2;
      const imgTop = CROP_D / 2 + ty.value - (dispH * userScale) / 2;

      // Container (0,0) mapped back to original image coordinates:
      const originX = Math.max(0, Math.round(-imgLeft / totalScale));
      const originY = Math.max(0, Math.round(-imgTop / totalScale));
      const cropSz = Math.round(
        Math.min(iW - originX, iH - originY, CROP_D / totalScale),
      );

      const img = await ImageManipulator.manipulate(imageUri)
        .crop({ originX, originY, width: cropSz, height: cropSz })
        .resize({ width: 500, height: 500 })
        .renderAsync();
      const saved = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
      onConfirm(saved.uri);
    } catch (e) {
      console.error('[CircularCrop]', e);
      setProcessing(false);
    }
  }

  const cx = SW / 2;
  const cy = SH / 2;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.bg}>
        <GestureDetector gesture={composed}>
          <Animated.Image
            source={{ uri: imageUri }}
            style={[{ width: dispW, height: dispH }, imgStyle]}
          />
        </GestureDetector>

        {/* Dim surround with circular hole */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={SW} height={SH}>
            <Defs>
              <Mask id="hole">
                <Rect width={SW} height={SH} fill="white" />
                <SvgCircle cx={cx} cy={cy} r={CROP_D / 2} fill="black" />
              </Mask>
            </Defs>
            <Rect width={SW} height={SH} fill="rgba(0,0,0,0.62)" mask="url(#hole)" />
          </Svg>
        </View>

        {/* Circular border ring */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx - CROP_D / 2,
            top: cy - CROP_D / 2,
            width: CROP_D,
            height: CROP_D,
            borderRadius: CROP_D / 2,
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.85)',
          }}
        />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onCancel} style={styles.headerBtn} disabled={processing}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Move & Scale</Text>
          <View style={{ width: 64 }} />
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.hint}>Pinch to zoom · Drag to reposition</Text>
          <TouchableOpacity
            style={[styles.useBtn, processing && { opacity: 0.6 }]}
            onPress={handleConfirm}
            disabled={processing}
          >
            {processing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.useBtnText}>Use Photo</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerBtn: { padding: 8 },
  cancelText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    width: 64,
  },
  headerTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.2,
  },
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 14,
  },
  hint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  useBtn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 52,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    width: '100%',
    alignItems: 'center',
  },
  useBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.2,
  },
});
