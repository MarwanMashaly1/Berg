import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
} from 'react-native';
import { C, Fonts } from '../../constants/theme';

export type SheetOption = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

type BergSheetProps = {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onDismiss: () => void;
};

export function BergSheet({ visible, title, options, onDismiss }: BergSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {title && (
          <>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.divider} />
          </>
        )}

        {options.map((opt, i) => (
          <React.Fragment key={i}>
            <TouchableOpacity
              style={styles.option}
              onPress={() => { onDismiss(); opt.onPress(); }}
              activeOpacity={0.65}
            >
              <Text style={[styles.optionText, opt.destructive && styles.destructiveText]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
            {i < options.length - 1 && <View style={styles.optionDivider} />}
          </React.Fragment>
        ))}

        <View style={styles.cancelGap} />

        <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.backgroundWarm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 16,
    color: C.text,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.07)',
    marginBottom: 4,
  },
  option: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  optionText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: C.primary,
  },
  destructiveText: {
    color: C.error,
  },
  optionDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: 8,
  },
  cancelGap: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginHorizontal: -16,
    marginTop: 8,
    marginBottom: 8,
  },
  cancelBtn: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: C.textSecondary,
  },
});
