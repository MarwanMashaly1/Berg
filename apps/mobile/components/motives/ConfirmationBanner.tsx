import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { C, Fonts } from '../../constants/theme';

type Props = {
  visible: boolean;
  confirming: boolean;
  onConfirm: (happened: boolean) => void;
  motiveTitle: string;
};

export function ConfirmationBanner({ visible, confirming, onConfirm, motiveTitle }: Props) {
  if (!visible) return null;

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.confirmBanner}>
      <Text style={styles.confirmQuestion}>Did this happen?</Text>
      <Text style={styles.confirmSub}>{motiveTitle}</Text>
      <View style={styles.confirmBtns}>
        <TouchableOpacity
          style={[styles.confirmBtn, styles.confirmBtnYes, confirming && { opacity: 0.5 }]}
          disabled={confirming}
          onPress={() => onConfirm(true)}
        >
          <Text style={styles.confirmBtnYesText}>Yes, it happened</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, styles.confirmBtnNo, confirming && { opacity: 0.5 }]}
          disabled={confirming}
          onPress={() => onConfirm(false)}
        >
          <Text style={styles.confirmBtnNoText}>No, it was cancelled</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  confirmBanner: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#1A1512',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
  },
  confirmQuestion: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    color: '#F2E8DC',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  confirmSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(242,232,220,0.45)',
    marginBottom: 18,
  },
  confirmBtns: { gap: 10 },
  confirmBtn: {
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnYes: {
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  confirmBtnNo: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  confirmBtnYesText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: '#fff',
  },
  confirmBtnNoText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: 'rgba(242,232,220,0.45)',
  },
});
