import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import { Colors, Fonts } from '../../constants/theme';

const C = Colors.light;

export function RenameModal({
  visible,
  currentName,
  onClose,
  onSave,
}: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(currentName);
  useEffect(() => { if (visible) setValue(currentName); }, [visible, currentName]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={rm.overlay}>
        <View style={rm.card}>
          <Text style={rm.title}>Rename group</Text>
          <TextInput
            style={rm.input}
            value={value}
            onChangeText={setValue}
            placeholder="Group name"
            placeholderTextColor={C.textTertiary}
            maxLength={60}
            autoFocus
            selectTextOnFocus
          />
          <View style={rm.row}>
            <TouchableOpacity onPress={onClose} style={rm.cancelBtn}>
              <Text style={rm.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => value.trim() && onSave(value.trim())}
              style={[rm.saveBtn, !value.trim() && rm.saveBtnDisabled]}
              disabled={!value.trim()}
            >
              <Text style={rm.saveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 20, width: '80%', gap: 16 },
  title: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: C.text, textAlign: 'center' },
  input: {
    fontFamily: Fonts.body, fontSize: 15, color: C.text,
    backgroundColor: C.surfaceAlt, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: C.border,
  },
  row: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: C.surfaceAlt },
  cancelTxt: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: C.primary },
  saveBtnDisabled: { backgroundColor: C.border },
  saveTxt: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textInverse },
});
