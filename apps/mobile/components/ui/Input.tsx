import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  TextInputProps,
  ViewStyle,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../hooks/use-theme';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
  prefix?: string;  // e.g. country code "+1"
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
      <View
        style={[
          styles.inputRow,
          {
            borderRadius: radius.md,
            borderColor: error
              ? colors.error
              : focused
              ? colors.borderFocus
              : colors.border,
            backgroundColor: colors.surface,
          },
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
              minHeight: 48,
            },
            style,
          ]}
          placeholderTextColor={colors.textTertiary}
          onFocus={() => {
            setFocused(true);
            props.onFocus?.({} as any);
          }}
          onBlur={() => {
            setFocused(false);
            props.onBlur?.({} as any);
          }}
        />
      </View>
      {(error || hint) && (
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 12,
            color: error ? colors.error : colors.textTertiary,
            marginTop: 4,
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
    borderWidth: 1.5,
  },
});
