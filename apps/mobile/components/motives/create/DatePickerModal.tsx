import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { C, Fonts } from '../../../constants/theme';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function nextWeekday(d: Date, day: number): Date {
  const r = new Date(d);
  const diff = (day - r.getDay() + 7) % 7 || 7;
  r.setDate(r.getDate() + diff);
  return r;
}

export function formatDateFull(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${h}:${m} ${ap}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ─── DatePickerModal ──────────────────────────────────────────────────────────

export function DatePickerModal({
  visible,
  value,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  value: Date | null;
  onConfirm: (d: Date) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(value ?? addDays(now, 1));
  const [calYear, setCalYear] = useState(selectedDate.getFullYear());
  const [calMonth, setCalMonth] = useState(selectedDate.getMonth());
  const [hour, setHour] = useState(value ? (value.getHours() % 12 || 12).toString() : '7');
  const [minute, setMinute] = useState(value ? value.getMinutes().toString().padStart(2, '0') : '00');
  const [isPm, setIsPm] = useState(value ? value.getHours() >= 12 : true);

  const presets = [
    { label: 'Today',    date: now },
    { label: 'Tomorrow', date: addDays(now, 1) },
    { label: 'Sat',      date: nextWeekday(now, 6) },
    { label: '+1 week',  date: addDays(now, 7) },
  ];

  function selectPreset(d: Date) {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    setSelectedDate(r);
    setCalYear(r.getFullYear());
    setCalMonth(r.getMonth());
  }

  function selectDay(day: number) {
    const r = new Date(calYear, calMonth, day);
    setSelectedDate(r);
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  function handleConfirm() {
    const result = new Date(selectedDate);
    const h = parseInt(hour, 10) || 7;
    const m = parseInt(minute, 10) || 0;
    const h24 = (h % 12) + (isPm ? 12 : 0);
    result.setHours(h24, m, 0, 0);
    onConfirm(result);
    onClose();
  }

  // Build calendar grid as rows of 7
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calRows: (number | null)[][] = [];
  for (let i = 0; i < calCells.length; i += 7) calRows.push(calCells.slice(i, i + 7));

  const isSelected = (day: number) =>
    selectedDate.getDate() === day &&
    selectedDate.getMonth() === calMonth &&
    selectedDate.getFullYear() === calYear;

  const isPast = (day: number) => {
    const d = new Date(calYear, calMonth, day);
    d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return d < t;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>

          <Text style={styles.modalTitle}>When?</Text>

          {/* Quick presets */}
          <View style={styles.presetRow}>
            {presets.map(p => {
              const active = selectedDate.toDateString() === p.date.toDateString();
              return (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => selectPreset(p.date)}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Month nav */}
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
              <MaterialIcons name="chevron-left" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.calMonthLabel}>
              {MONTHS[calMonth]} {calYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
              <MaterialIcons name="chevron-right" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Week day headers */}
          <View style={styles.calWeekRow}>
            {WEEK_DAYS.map(d => (
              <Text key={d} style={styles.calWeekDay}>{d}</Text>
            ))}
          </View>

          {/* Calendar cells — explicit rows ensure perfect column alignment */}
          <View style={styles.calGrid}>
            {calRows.map((row, ri) => (
              <View key={ri} style={styles.calRow}>
                {row.map((day, ci) => {
                  if (!day) return <View key={ci} style={styles.calDayEmpty} />;
                  const sel = isSelected(day);
                  const past = isPast(day);
                  return (
                    <TouchableOpacity
                      key={ci}
                      onPress={() => !past && selectDay(day)}
                      style={[styles.calDay, sel && styles.calDaySelected]}
                      activeOpacity={past ? 1 : 0.7}
                    >
                      <Text style={[
                        styles.calDayText,
                        sel && styles.calDayTextSelected,
                        past && styles.calDayTextPast,
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Time selector */}
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Time</Text>
            <View style={styles.timeInputs}>
              <TextInput
                style={styles.timeInput}
                value={hour}
                onChangeText={v => setHour(v.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="7"
                placeholderTextColor={C.textTertiary}
              />
              <Text style={styles.timeColon}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={minute}
                onChangeText={v => setMinute(v.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="00"
                placeholderTextColor={C.textTertiary}
              />
              <TouchableOpacity onPress={() => setIsPm(!isPm)} style={styles.ampmToggle}>
                <Text style={[styles.ampmOption, !isPm && styles.ampmActive]}>AM</Text>
                <Text style={[styles.ampmOption, isPm && styles.ampmActive]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={styles.modalConfirmText}>
              Confirm · {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]}
            </Text>
          </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Date picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    maxHeight: '92%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: Fonts.headingRegular,
    fontStyle: 'italic',
    fontSize: 22,
    color: C.text,
    marginBottom: 20,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  presetChipActive: {
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderColor: C.primary,
  },
  presetChipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
  },
  presetChipTextActive: {
    color: C.primary,
    fontFamily: Fonts.bodySemiBold,
  },
  // Calendar
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calNavBtn: {
    padding: 4,
  },
  calMonthLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.text,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    paddingVertical: 6,
  },
  calGrid: {
    marginBottom: 16,
  },
  calRow: {
    flexDirection: 'row',
  },
  calDay: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
  },
  calDayEmpty: {
    flex: 1,
    aspectRatio: 1,
  },
  calDaySelected: {
    backgroundColor: C.primary,
  },
  calDayText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.text,
  },
  calDayTextSelected: {
    color: C.textInverse,
    fontFamily: Fonts.bodySemiBold,
  },
  calDayTextPast: {
    color: C.textTertiary,
    opacity: 0.4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  timeLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.textSecondary,
  },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    width: 52,
    height: 44,
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    textAlign: 'center',
    fontFamily: Fonts.bodySemiBold,
    fontSize: 18,
    color: C.text,
  },
  timeColon: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 20,
    color: C.textSecondary,
  },
  ampmToggle: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 6,
  },
  ampmOption: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textTertiary,
  },
  ampmActive: {
    fontFamily: Fonts.bodySemiBold,
    color: C.primary,
  },
  modalConfirm: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
});
