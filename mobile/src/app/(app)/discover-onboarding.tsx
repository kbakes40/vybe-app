import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Sparkles, Music, Heart, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { useDiscoverFeedStore } from '@/stores/discoverFeedStore';
import { cn } from '@/lib/cn';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Genre options
const GENRES = [
  'Hip Hop', 'R&B', 'Pop', 'Rock', 'Electronic', 'House',
  'Techno', 'Jazz', 'Soul', 'Funk', 'Indie', 'Alternative',
  'Classical', 'Country', 'Reggae', 'Latin', 'Metal', 'Punk',
  'Folk', 'Blues', 'Ambient', 'Lo-fi', 'Trap', 'Drill',
];

// Mood options
const MOODS = [
  'Energetic', 'Chill', 'Happy', 'Sad', 'Focused', 'Romantic',
  'Angry', 'Peaceful', 'Nostalgic', 'Uplifting', 'Dark', 'Dreamy',
];

type Step = 'genres' | 'moods' | 'artists';

export default function DiscoverOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const completeOnboardingWithInstantFeed = useDiscoverFeedStore((s) => s.completeOnboardingWithInstantFeed);
  const savePreferences = useDiscoverFeedStore((s) => s.savePreferences);
  const isSaving = useDiscoverFeedStore((s) => s.isSavingPreferences);

  // State
  const [currentStep, setCurrentStep] = useState<Step>('genres');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [favoriteArtists, setFavoriteArtists] = useState('');
  const [showGenreMaxWarning, setShowGenreMaxWarning] = useState(false);
  const [showMoodMaxWarning, setShowMoodMaxWarning] = useState(false);

  // Max selections per category
  const MAX_SELECTIONS = 3;

  // Navigation
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep === 'moods') {
      setCurrentStep('genres');
    } else if (currentStep === 'artists') {
      setCurrentStep('moods');
    } else {
      router.back();
    }
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (currentStep === 'genres') {
      setCurrentStep('moods');
    } else if (currentStep === 'moods') {
      setCurrentStep('artists');
    }
  };

  const handleComplete = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Parse artists input into array
    const artistsArray = favoriteArtists
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    console.log('[DiscoverOnboarding] Submit picks:', {
      genres: selectedGenres,
      moods: selectedMoods,
      artists: artistsArray,
    });

    // Navigate immediately so the user isn't stuck if the backend is slow or
    // returns an error. The Discover tab's focus effect retries feed building
    // with the persisted preferences.
    router.replace('/(app)/(tabs)/discover');

    // Fire-and-forget: save preferences + build instant feed in the background.
    // Fallback to plain savePreferences if the instant-onboarding call errors.
    completeOnboardingWithInstantFeed({
      genres: selectedGenres,
      moods: selectedMoods,
      favoriteArtists: artistsArray,
    })
      .then((success) => {
        console.log('[DiscoverOnboarding] Onboarding result:', success);
        if (!success) {
          return savePreferences({
            genres: selectedGenres,
            moods: selectedMoods,
            favoriteArtists: artistsArray,
          });
        }
      })
      .catch((err) => {
        console.warn('[DiscoverOnboarding] instant feed failed, saving prefs only:', err);
        return savePreferences({
          genres: selectedGenres,
          moods: selectedMoods,
          favoriteArtists: artistsArray,
        });
      });
  };

  const handleSkip = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Save with minimal preferences
    await savePreferences({
      genres: selectedGenres.length > 0 ? selectedGenres : ['Pop', 'Hip Hop', 'Electronic'],
      moods: selectedMoods.length > 0 ? selectedMoods : ['Chill', 'Energetic'],
      favoriteArtists: [],
    });
    router.replace('/(app)/(tabs)/discover');
  };

  // Toggle selection with max 3 limit
  const toggleGenre = (genre: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) {
        // Unselect
        setShowGenreMaxWarning(false);
        return prev.filter((g) => g !== genre);
      } else if (prev.length < MAX_SELECTIONS) {
        // Select if under limit
        setShowGenreMaxWarning(false);
        return [...prev, genre];
      } else {
        // At limit, show warning
        setShowGenreMaxWarning(true);
        return prev;
      }
    });
  };

  const toggleMood = (mood: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMoods((prev) => {
      if (prev.includes(mood)) {
        // Unselect
        setShowMoodMaxWarning(false);
        return prev.filter((m) => m !== mood);
      } else if (prev.length < MAX_SELECTIONS) {
        // Select if under limit
        setShowMoodMaxWarning(false);
        return [...prev, mood];
      } else {
        // At limit, show warning
        setShowMoodMaxWarning(true);
        return prev;
      }
    });
  };

  // Validation - require at least 1 genre and 1 mood
  const canProceedFromGenres = selectedGenres.length >= 1;
  const canProceedFromMoods = selectedMoods.length >= 1;
  const canStartDiscovering = selectedGenres.length >= 1 && selectedMoods.length >= 1;

  // Check if at max selections
  const isGenreMaxReached = selectedGenres.length >= MAX_SELECTIONS;
  const isMoodMaxReached = selectedMoods.length >= MAX_SELECTIONS;

  // Step indicator
  const stepIndex = currentStep === 'genres' ? 0 : currentStep === 'moods' ? 1 : 2;

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Background gradient */}
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 200,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View
          style={{ paddingTop: insets.top }}
          className="px-5 pb-4"
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={handleBack}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
            >
              <ArrowLeft size={20} color="#fff" />
            </Pressable>

            <Pressable onPress={handleSkip}>
              <Text className="text-white/60 text-sm">Skip</Text>
            </Pressable>
          </View>

          {/* Progress indicator */}
          <View className="flex-row mt-6 gap-2">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                className={cn(
                  'flex-1 h-1 rounded-full',
                  i <= stepIndex ? 'bg-[#8B5CF6]' : 'bg-white/20'
                )}
              />
            ))}
          </View>
        </View>

        {/* Content */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 220 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Genres step */}
          {currentStep === 'genres' && (
            <Animated.View entering={FadeIn} className="px-5">
              <View className="flex-row items-center mb-2">
                <Music size={24} color="#8B5CF6" />
                <Text className="text-white text-2xl font-bold ml-2">
                  Pick your genres
                </Text>
              </View>
              <Text className="text-white/60 mb-6">
                Select up to 3 genres you love. This helps us find music you will enjoy.
              </Text>

              <View className="flex-row flex-wrap gap-2">
                {GENRES.map((genre, index) => (
                  <ChipButton
                    key={genre}
                    label={genre}
                    selected={selectedGenres.includes(genre)}
                    onPress={() => toggleGenre(genre)}
                    delay={index * 30}
                    disabled={isGenreMaxReached && !selectedGenres.includes(genre)}
                  />
                ))}
              </View>

              {showGenreMaxWarning ? (
                <Text className="text-amber-400 text-sm mt-4">
                  Max 3 selected. Unselect one first.
                </Text>
              ) : (
                <Text className="text-white/40 text-sm mt-4">
                  Selected: {selectedGenres.length} / 3 max
                </Text>
              )}
            </Animated.View>
          )}

          {/* Moods step */}
          {currentStep === 'moods' && (
            <Animated.View entering={FadeIn} className="px-5">
              <View className="flex-row items-center mb-2">
                <Heart size={24} color="#EC4899" />
                <Text className="text-white text-2xl font-bold ml-2">
                  How do you vibe?
                </Text>
              </View>
              <Text className="text-white/60 mb-6">
                Select up to 3 moods that match your listening style.
              </Text>

              <View className="flex-row flex-wrap gap-3">
                {MOODS.map((mood, index) => (
                  <ChipButton
                    key={mood}
                    label={mood}
                    selected={selectedMoods.includes(mood)}
                    onPress={() => toggleMood(mood)}
                    delay={index * 40}
                    variant="mood"
                    disabled={isMoodMaxReached && !selectedMoods.includes(mood)}
                  />
                ))}
              </View>

              {showMoodMaxWarning ? (
                <Text className="text-amber-400 text-sm mt-4">
                  Max 3 selected. Unselect one first.
                </Text>
              ) : (
                <Text className="text-white/40 text-sm mt-4">
                  Selected: {selectedMoods.length} / 3 max
                </Text>
              )}
            </Animated.View>
          )}

          {/* Artists step */}
          {currentStep === 'artists' && (
            <Animated.View entering={FadeIn} className="px-5">
              <View className="flex-row items-center mb-2">
                <User size={24} color="#10B981" />
                <Text className="text-white text-2xl font-bold ml-2">
                  Favorite artists
                </Text>
              </View>
              <Text className="text-white/60 mb-6">
                Optional: Tell us some artists you love. This helps us find similar music.
              </Text>

              <View className="bg-white/10 rounded-xl p-4">
                <VybeTextInput
                  value={favoriteArtists}
                  onChangeText={setFavoriteArtists}
                  placeholder="Drake, Kendrick Lamar, The Weeknd..."
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 80, textAlignVertical: 'top', backgroundColor: 'transparent', padding: 0, borderWidth: 0 }}
                />
              </View>
              <Text className="text-white/40 text-xs mt-2">
                Separate artist names with commas
              </Text>

              {/* Summary */}
              <View className="mt-8 bg-white/5 rounded-xl p-4">
                <View className="flex-row items-center mb-3">
                  <Sparkles size={18} color="#8B5CF6" />
                  <Text className="text-white font-semibold ml-2">Your preferences</Text>
                </View>

                <View className="mb-3">
                  <Text className="text-white/60 text-xs mb-1">Genres</Text>
                  <Text className="text-white text-sm">
                    {selectedGenres.join(', ')}
                  </Text>
                </View>

                <View>
                  <Text className="text-white/60 text-xs mb-1">Moods</Text>
                  <Text className="text-white text-sm">
                    {selectedMoods.join(', ')}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {/* Bottom action */}
        <View
          style={{ paddingBottom: insets.bottom + 90 }}
          className="px-5 pt-4 bg-[#0A0A0A]"
        >
          {currentStep === 'artists' ? (
            <Pressable
              onPress={handleComplete}
              disabled={isSaving || !canStartDiscovering}
              className={cn(
                'rounded-xl py-4 items-center',
                canStartDiscovering ? 'bg-[#8B5CF6]' : 'bg-white/20'
              )}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center">
                  <Sparkles size={20} color={canStartDiscovering ? '#fff' : '#ffffff66'} />
                  <Text className={cn(
                    'font-bold text-lg ml-2',
                    canStartDiscovering ? 'text-white' : 'text-white/40'
                  )}>
                    Start Discovering
                  </Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNext}
              disabled={
                (currentStep === 'genres' && !canProceedFromGenres) ||
                (currentStep === 'moods' && !canProceedFromMoods)
              }
              className={cn(
                'rounded-xl py-4 items-center',
                (currentStep === 'genres' && canProceedFromGenres) ||
                  (currentStep === 'moods' && canProceedFromMoods)
                  ? 'bg-[#8B5CF6]'
                  : 'bg-white/20'
              )}
            >
              <Text
                className={cn(
                  'font-bold text-lg',
                  (currentStep === 'genres' && canProceedFromGenres) ||
                    (currentStep === 'moods' && canProceedFromMoods)
                    ? 'text-white'
                    : 'text-white/40'
                )}
              >
                Continue
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

interface ChipButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  delay?: number;
  variant?: 'genre' | 'mood';
  disabled?: boolean;
}

function ChipButton({ label, selected, onPress, delay = 0, variant = 'genre', disabled = false }: ChipButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const selectedColor = variant === 'mood' ? '#EC4899' : '#8B5CF6';

  return (
    <Animated.View entering={FadeInUp.delay(delay).springify()}>
      <AnimatedPressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() => {
          if (!disabled) {
            scale.value = withSpring(0.95);
          }
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        style={[animatedStyle, disabled ? { opacity: 0.4 } : undefined]}
        className={cn(
          'px-4 py-2.5 rounded-full border',
          selected
            ? 'border-transparent'
            : 'border-white/20 bg-white/5'
        )}
      >
        {selected ? (
          <LinearGradient
            colors={[selectedColor, variant === 'mood' ? '#9333EA' : '#6D28D9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 999,
            }}
          />
        ) : null}
        <View className="flex-row items-center">
          {selected ? (
            <Check size={14} color="#fff" style={{ marginRight: 4 }} />
          ) : null}
          <Text
            className={cn(
              'font-medium',
              selected ? 'text-white' : 'text-white/70'
            )}
          >
            {label}
          </Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}
