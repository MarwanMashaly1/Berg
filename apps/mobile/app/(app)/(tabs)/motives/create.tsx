import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { C, Fonts } from '../../../../constants/theme';
import {
  apiFetch,
  MyCircle,
  PlaceDetail,
} from '../../../../lib/api';
import { trackMotiveCreated } from '../../../../lib/analytics';
import { CATEGORY_MAP, CategoryKey } from '../../../../constants/motives';
import { PlacePicker } from '../../../../components/motives/create/PlacePicker';
import { DatePickerModal, formatDateFull } from '../../../../components/motives/create/DatePickerModal';
import { Step2People } from '../../../../components/motives/create/Step2People';
import { Step4Review } from '../../../../components/motives/create/Step4Review';
import { BackButton } from '../../../../components/ui/BackButton';

// ─── Category helper ──────────────────────────────────────────────────────────
type CatKey = CategoryKey;
function getCat(key: string) {
  return CATEGORY_MAP[key as CatKey] ?? { label: key, color: C.textTertiary, emoji: '•', tint: 'rgba(150,150,150,0.08)' };
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Person = {
  id: string;
  name: string | null;
  username: string | null;
};

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ step, total }: { step: number; total: number }) {
  const progress = useSharedValue((step / total) * 100);

  useEffect(() => {
    progress.value = withTiming((step / total) * 100, { duration: 300 });
  }, [step]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

// ─── Category grid constants ─────────────────────────────────────────────────
const GRID_PADDING = 20;
const GRID_GAP = 10;
// CAT_ROWS is a fixed 3×3 grid
const CAT_ROWS: CatKey[][] = [
  ['food', 'outdoors', 'catchup'],
  ['movies', 'active', 'party'],
  ['gaming', 'travel', 'creative'],
];

// ─── Category cell ────────────────────────────────────────────────────────────
function CategoryCell({
  catKey,
  selected,
  onSelect,
}: {
  catKey: CatKey;
  selected: boolean;
  onSelect: () => void;
}) {
  const cat = getCat(catKey);
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(1.05, { damping: 10, stiffness: 300 }, () => {
      scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    });
    onSelect();
  };

  return (
    <Animated.View style={[styles.catCellWrap, animStyle]}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.catCell,
          {
            backgroundColor: selected ? cat.tint : C.surface,
            borderColor: selected ? cat.color : C.border,
            borderWidth: selected ? 2 : 1.5,
          },
        ]}
      >
        <Text style={styles.catEmoji}>{cat.emoji}</Text>
        <Text style={[styles.catLabel, { color: selected ? cat.color : C.textSecondary }]}>
          {cat.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Bottom CTA ───────────────────────────────────────────────────────────────
function BottomCTA({
  label,
  enabled,
  onPress,
  insetBottom,
}: {
  label: string;
  enabled: boolean;
  onPress: () => void;
  insetBottom: number;
}) {
  return (
    <View style={[styles.ctaContainer, { bottom: insetBottom + 20 }]}>
      <TouchableOpacity
        onPress={enabled ? onPress : undefined}
        style={[styles.ctaBtn, !enabled && styles.ctaBtnDisabled]}
        activeOpacity={0.85}
      >
        <Text style={[styles.ctaText, !enabled && styles.ctaTextDisabled]}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 1: Category ─────────────────────────────────────────────────────────
function Step1({
  selected,
  onSelect,
  onNext,
  insetBottom,
}: {
  selected: CatKey | null;
  onSelect: (k: CatKey) => void;
  onNext: () => void;
  insetBottom: number;
}) {
  return (
    <View style={styles.stepRoot}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insetBottom + 100 }}
      >
        <Text style={styles.stepTitle}>What kind of plan?</Text>
        <Text style={styles.stepSubtitle}>Pick a vibe</Text>
        <View style={styles.catGrid}>
          {CAT_ROWS.map((row, ri) => (
            <View key={ri} style={styles.catRow}>
              {row.map(k => (
                <CategoryCell
                  key={k}
                  catKey={k}
                  selected={selected === k}
                  onSelect={() => onSelect(k)}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <BottomCTA
        label="Next"
        enabled={selected !== null}
        onPress={onNext}
        insetBottom={insetBottom}
      />
    </View>
  );
}

// ─── Step 3: Details ──────────────────────────────────────────────────────────
function Step3({
  category,
  selectedPeopleNames,
  title,
  setTitle,
  date,
  setDate,
  selectedPlace,
  setSelectedPlace,
  note,
  setNote,
  onNext,
  insetBottom,
}: {
  category: CatKey | null;
  selectedPeopleNames: string[];
  title: string;
  setTitle: (v: string) => void;
  date: Date | null;
  setDate: (d: Date | null) => void;
  selectedPlace: PlaceDetail | null;
  setSelectedPlace: (p: PlaceDetail | null) => void;
  note: string;
  setNote: (v: string) => void;
  onNext: () => void;
  insetBottom: number;
}) {
  const [showDateModal, setShowDateModal] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const cat = category ? getCat(category) : null;

  // Auto-update title when a place is selected and title is still default/empty
  function handlePlaceSelect(place: PlaceDetail | null) {
    setSelectedPlace(place);
    if (place && !title.trim()) {
      // e.g. "Drinks at The Ivy"
      const verb = cat?.label ?? 'Meetup';
      setTitle(`${verb} at ${place.name}`);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.stepRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insetBottom + 100 }}
      >
        <Text style={styles.stepTitle}>Set the details</Text>

        {/* Title field */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>NAME YOUR PLAN</Text>
          <TextInput
            style={styles.fieldInput}
            value={title}
            onChangeText={setTitle}
            placeholder={
              cat && selectedPeopleNames.length > 0
                ? `${cat.label} with ${selectedPeopleNames[0]}`
                : 'Give your plan a name'
            }
            placeholderTextColor={C.textTertiary}
          />
        </View>

        {/* Date & time field */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>WHEN</Text>
          <Pressable
            onPress={() => setShowDateModal(true)}
            style={styles.fieldInputRow}
          >
            <Text style={[styles.fieldInputText, !date && styles.fieldPlaceholder]}>
              {date ? formatDateFull(date) : 'Pick a date and time'}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={C.textTertiary} />
          </Pressable>
        </View>

        {/* Place picker — Google Places with contextual suggestions */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>WHERE (OPTIONAL)</Text>
          <PlacePicker
            category={category}
            value={selectedPlace}
            onChange={handlePlaceSelect}
          />
        </View>

        {/* Note field */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldMultiline]}
            value={note}
            onChangeText={v => setNote(v.slice(0, 200))}
            placeholder="Add a note for your friends…"
            placeholderTextColor={C.textTertiary}
            multiline
            numberOfLines={4}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            textAlignVertical="top"
          />
          {noteFocused && (
            <Text style={styles.charCount}>{note.length}/200</Text>
          )}
        </View>
      </ScrollView>

      <BottomCTA
        label="Next"
        enabled={true}
        onPress={onNext}
        insetBottom={insetBottom}
      />

      <DatePickerModal
        visible={showDateModal}
        value={date}
        onConfirm={setDate}
        onClose={() => setShowDateModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Main create screen ───────────────────────────────────────────────────────
export default function CreateMotiveScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prefillUsers?: string; prefillCategory?: string; originPromptId?: string }>();
  const [step, setStep] = useState(1);
  const TOTAL = 4;

  // Step 1
  const [category, setCategory] = useState<CatKey | null>(null);
  // Step 2
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [selectedCircles, setSelectedCircles] = useState<MyCircle[]>([]);
  const selectedIds = selectedPeople.map(p => p.id);

  // [align-1] Pre-fill from match notification (motive/create deep link)
  // prefillCategory: optionKey from the match (maps to motive category)
  // prefillUsers: JSON array of { id, name, username } to pre-invite
  // originPromptId: stored on motive for funnel tracking (Item 2)
  useEffect(() => {
    const hasCat = params.prefillCategory && params.prefillCategory in CATEGORY_MAP;
    const hasUsers = !!params.prefillUsers;

    if (hasCat) {
      setCategory(params.prefillCategory as CatKey);
    }

    if (hasUsers) {
      try {
        const users = JSON.parse(params.prefillUsers!) as Person[];
        if (Array.isArray(users) && users.length > 0) {
          setSelectedPeople(users);
        }
      } catch {}
    }

    // Jump to the right step based on what was pre-filled
    if (hasCat && hasUsers) {
      setStep(3); // Category + people known — go straight to details
    } else if (hasCat) {
      setStep(2); // Category known — pick people
    } else if (hasUsers) {
      setStep(3); // Legacy: only users provided
    }
  }, []);

  // Step 3
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetail | null>(null);
  const [note, setNote] = useState('');
  // Step 4
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const togglePerson = useCallback((person: Person) => {
    setSelectedPeople(prev =>
      prev.some(p => p.id === person.id)
        ? prev.filter(p => p.id !== person.id)
        : [...prev, person]
    );
  }, []);

  const toggleCircle = useCallback((circle: MyCircle) => {
    setSelectedCircles(prev =>
      prev.some(c => c.id === circle.id)
        ? prev.filter(c => c.id !== circle.id)
        : [...prev, circle]
    );
  }, []);

  function getAutoTitle(): string {
    if (!category) return 'New plan';
    const cat = getCat(category);
    const firstName = selectedPeople[0]?.name?.split(' ')[0];
    return firstName ? `${cat.label} with ${firstName}` : `${cat.label} plan`;
  }

  const resolvedTitle = title.trim() || getAutoTitle();

  const handleSubmit = async (isDraft = false) => {
    setSubmitError(null);

    if (!isDraft) {
      if (selectedIds.length === 0) {
        setSubmitError('Add at least one person before sending invites.');
        return;
      }
      if (!date) {
        setSubmitError('Pick a date and time so your friends know when to show up.');
        return;
      }
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/motives', {
        method: 'POST',
        body: JSON.stringify({
          category,
          title: resolvedTitle,
          scheduledAt: date?.toISOString() ?? null,
          placeName: selectedPlace?.name ?? null,
          placeAddress: selectedPlace?.address ?? null,
          placeId: selectedPlace?.placeId ?? null,
          lat: selectedPlace?.lat ?? null,
          lng: selectedPlace?.lng ?? null,
          note: note || null,
          invitedUserIds: selectedIds,
          invitedCircleIds: selectedCircles.map(c => c.id),
          status: isDraft ? 'planning' : 'confirmed',
          originPromptId: params.originPromptId ?? null,
        }),
      });
      trackMotiveCreated({
        category: category ?? '',
        invitee_count: selectedIds.length,
        has_place: !!selectedPlace,
        has_date: !!date,
        status: isDraft ? 'planning' : 'confirmed',
      });
      router.replace('/(app)/(tabs)/motives');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <BackButton onPress={() => step > 1 ? setStep(s => s - 1) : router.back()} />
        <Text style={styles.navStep}>Step {step} of {TOTAL}</Text>
        <View style={styles.navRight} />
      </View>

      {/* Progress bar */}
      <ProgressBar step={step} total={TOTAL} />

      {/* Step content */}
      {step === 1 && (
        <Step1
          selected={category}
          onSelect={setCategory}
          onNext={() => setStep(2)}
          insetBottom={insets.bottom}
        />
      )}
      {step === 2 && (
        <Step2People
          selectedPeople={selectedPeople}
          onTogglePerson={togglePerson}
          selectedCircles={selectedCircles}
          onToggleCircle={toggleCircle}
          onNext={() => setStep(3)}
          insetBottom={insets.bottom}
        />
      )}
      {step === 3 && (
        <Step3
          category={category}
          selectedPeopleNames={selectedPeople.map(p => p.name?.split(' ')[0] ?? '').filter(Boolean)}
          title={title}
          setTitle={setTitle}
          date={date}
          setDate={setDate}
          selectedPlace={selectedPlace}
          setSelectedPlace={setSelectedPlace}
          note={note}
          setNote={setNote}
          onNext={() => setStep(4)}
          insetBottom={insets.bottom}
        />
      )}
      {step === 4 && (
        <Step4Review
          category={category}
          title={resolvedTitle}
          date={date}
          selectedPlace={selectedPlace}
          selectedPeople={selectedPeople}
          onSubmit={() => handleSubmit(false)}
          onDraft={() => handleSubmit(true)}
          submitting={submitting}
          error={submitError}
          insetBottom={insets.bottom}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.surface,
  },
  // Nav
  navBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  navStep: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.textTertiary,
  },
  navRight: {
    width: 34,
  },
  // Progress
  progressTrack: {
    height: 2,
    backgroundColor: C.border,
    width: '100%',
  },
  progressFill: {
    height: 2,
    backgroundColor: C.primary,
  },
  // Step shell
  stepRoot: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontStyle: 'italic',
    fontSize: 26,
    color: C.text,
    paddingHorizontal: 24,
    marginTop: 28,
    marginBottom: 4,
    lineHeight: 32,
  },
  stepSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.textTertiary,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  // Category grid
  catGrid: {
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  catRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  catCellWrap: {
    flex: 1,
    aspectRatio: 1,
  },
  catCell: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  catEmoji: {
    fontSize: 28,
  },
  catLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 14,
  },
  // Fields (Step 3)
  fieldWrapper: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.text,
  },
  fieldMultiline: {
    height: 96,
    paddingTop: 12,
    paddingBottom: 12,
  },
  fieldInputRow: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldInputText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  fieldPlaceholder: {
    color: C.textTertiary,
  },
  charCount: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    textAlign: 'right',
    marginTop: 4,
  },
  // CTA
  ctaContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  ctaBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnDisabled: {
    backgroundColor: C.border,
  },
  ctaText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
  ctaTextDisabled: {
    color: C.textTertiary,
  },
});
