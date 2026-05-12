import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  TextInputProps,
  ViewStyle,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/use-theme';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
  prefix?: string;
};

export function Input({
  label,
  error,
  hint,
  containerStyle,
  prefix,
  style,
  ...props
}: InputProps) {
  const { colors, fonts, radius } = useTheme();
  const [focused, setFocused] = useState(false);

  const focusProgress = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [error ? colors.error : colors.border, error ? colors.error : 'rgba(26,26,26,0.28)'],
    ),
    borderWidth: 1.5,
  }));

  function handleFocus(e: any) {
    setFocused(true);
    focusProgress.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.ease) });
    props.onFocus?.(e);
  }

  function handleBlur(e: any) {
    setFocused(false);
    focusProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.ease) });
    props.onBlur?.(e);
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text
          style={{
            fontFamily: fonts.bodySemiBold,
            fontSize: 14,
            color: colors.textSecondary,
            marginBottom: 6,
          }}
        >
          {label}
        </Text>
      )}
      <Animated.View
        style={[
          styles.inputRow,
          { borderRadius: radius.md, backgroundColor: colors.surface },
          borderStyle,
        ]}
      >
        {prefix && (
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 16,
              color: colors.textSecondary,
              paddingLeft: 14,
              paddingRight: 8,
            }}
          >
            {prefix}
          </Text>
        )}
        <TextInput
          {...props}
          style={[
            {
              flex: 1,
              fontFamily: fonts.body,
              fontSize: 16,
              color: colors.text,
              paddingHorizontal: prefix ? 0 : 14,
              paddingVertical: 14,
              minHeight: 50,
            },
            style,
          ]}
          placeholderTextColor={colors.textTertiary}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
      {(error || hint) && (
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 12,
            color: error ? colors.error : colors.textTertiary,
            marginTop: 5,
          }}
        >
          {error ?? hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
