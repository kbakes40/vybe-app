import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { Delete, ChevronUp, Globe } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Standard iOS keyboard layout
const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'delete'],
];

const NUMBER_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
  ['#+=', '.', ',', '?', '!', "'", 'delete'],
];

const SYMBOL_ROWS = [
  ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='],
  ['_', '\\', '|', '~', '<', '>', '€', '£', '¥', '•'],
  ['123', '.', ',', '?', '!', "'", 'delete'],
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface KeyProps {
  label: string;
  width: number;
  height: number;
  onPress: () => void;
  isShiftActive?: boolean;
  isSpecial?: boolean;
  isAccent?: boolean;
}

function Key({ label, width, height, onPress, isShiftActive, isSpecial, isAccent }: KeyProps) {
  const bgOpacity = useSharedValue(0);

  const bgAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: isAccent
      ? `rgba(139, 92, 246, ${1 - bgOpacity.value * 0.3})`
      : isSpecial
      ? `rgba(99, 99, 99, ${0.6 + bgOpacity.value * 0.2})`
      : `rgba(255, 255, 255, ${0.2 + bgOpacity.value * 0.15})`,
  }));

  const handlePressIn = () => {
    bgOpacity.value = withTiming(1, { duration: 50 });
  };

  const handlePressOut = () => {
    bgOpacity.value = withTiming(0, { duration: 100 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const getKeyContent = () => {
    if (label === 'delete') {
      return <Delete size={22} color="#fff" strokeWidth={1.5} />;
    }
    if (label === 'shift') {
      return (
        <ChevronUp
          size={22}
          color="#fff"
          strokeWidth={isShiftActive ? 2.5 : 1.5}
          fill={isShiftActive ? '#fff' : 'transparent'}
        />
      );
    }
    if (label === 'globe') {
      return <Globe size={20} color="#fff" strokeWidth={1.5} />;
    }
    if (label === 'search') {
      return <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>search</Text>;
    }
    if (label === 'space') {
      return <Text style={{ color: '#fff', fontSize: 16 }}>space</Text>;
    }

    const displayLabel = isShiftActive && label.length === 1 && /[a-z]/.test(label)
      ? label.toUpperCase()
      : label;

    return (
      <Text
        style={{
          color: '#fff',
          fontSize: label.length === 1 ? 23 : 15,
          fontWeight: label.length === 1 ? '400' : '500',
        }}
      >
        {displayLabel}
      </Text>
    );
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{
        width,
        height,
        marginHorizontal: 3,
        marginVertical: 5,
      }}
    >
      <Animated.View
        style={[
          bgAnimatedStyle,
          {
            flex: 1,
            borderRadius: 5,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        {getKeyContent()}
      </Animated.View>
    </AnimatedPressable>
  );
}

interface VybeKeyboardProps {
  onKeyPress: (key: string) => void;
  onDelete: () => void;
  onSearch: () => void;
  onSpace: () => void;
}

export function VybeKeyboard({ onKeyPress, onDelete, onSearch, onSpace }: VybeKeyboardProps) {
  const [keyboardMode, setKeyboardMode] = useState<'letters' | 'numbers' | 'symbols'>('letters');
  const [isShiftActive, setIsShiftActive] = useState(false);

  // iOS keyboard dimensions
  const keyWidth = (SCREEN_WIDTH - 6 - 10 * 6) / 10; // 10 keys with 3px margin each side
  const keyHeight = 42;
  const wideKeyWidth = keyWidth * 1.5;

  const handleKeyPress = useCallback((label: string) => {
    if (label === 'shift') {
      setIsShiftActive(prev => !prev);
      return;
    }
    if (label === 'delete') {
      onDelete();
      return;
    }
    if (label === 'search') {
      onSearch();
      return;
    }
    if (label === 'space') {
      onSpace();
      return;
    }
    if (label === '123') {
      setKeyboardMode('numbers');
      return;
    }
    if (label === 'ABC') {
      setKeyboardMode('letters');
      return;
    }
    if (label === '#+=') {
      setKeyboardMode('symbols');
      return;
    }
    if (label === 'globe') {
      return;
    }

    const char = isShiftActive && /[a-z]/.test(label) ? label.toUpperCase() : label;
    onKeyPress(char);

    if (isShiftActive && /[a-z]/.test(label)) {
      setIsShiftActive(false);
    }
  }, [isShiftActive, onKeyPress, onDelete, onSearch, onSpace]);

  const renderLetterRows = () => (
    <>
      {/* Row 1 - QWERTY */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        {LETTER_ROWS[0].map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
            isShiftActive={isShiftActive}
          />
        ))}
      </View>

      {/* Row 2 - ASDF */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        {LETTER_ROWS[1].map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
            isShiftActive={isShiftActive}
          />
        ))}
      </View>

      {/* Row 3 - ZXCV with shift and delete */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <Key
          label="shift"
          width={wideKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('shift')}
          isShiftActive={isShiftActive}
          isSpecial
        />
        {LETTER_ROWS[2].slice(1, -1).map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
            isShiftActive={isShiftActive}
          />
        ))}
        <Key
          label="delete"
          width={wideKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('delete')}
          isSpecial
        />
      </View>
    </>
  );

  const renderNumberRows = () => (
    <>
      {/* Row 1 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        {NUMBER_ROWS[0].map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
          />
        ))}
      </View>

      {/* Row 2 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        {NUMBER_ROWS[1].map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
          />
        ))}
      </View>

      {/* Row 3 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <Key
          label="#+='"
          width={wideKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('#+=')}
          isSpecial
        />
        {NUMBER_ROWS[2].slice(1, -1).map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
          />
        ))}
        <Key
          label="delete"
          width={wideKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('delete')}
          isSpecial
        />
      </View>
    </>
  );

  const renderSymbolRows = () => (
    <>
      {/* Row 1 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        {SYMBOL_ROWS[0].map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
          />
        ))}
      </View>

      {/* Row 2 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        {SYMBOL_ROWS[1].map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
          />
        ))}
      </View>

      {/* Row 3 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <Key
          label="123"
          width={wideKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('123')}
          isSpecial
        />
        {SYMBOL_ROWS[2].slice(1, -1).map((key) => (
          <Key
            key={key}
            label={key}
            width={keyWidth}
            height={keyHeight}
            onPress={() => handleKeyPress(key)}
          />
        ))}
        <Key
          label="delete"
          width={wideKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('delete')}
          isSpecial
        />
      </View>
    </>
  );

  // Bottom row widths (matching iOS)
  const modeKeyWidth = keyWidth * 1.3;
  const spaceKeyWidth = SCREEN_WIDTH - modeKeyWidth * 2 - keyWidth * 2 - 6 * 8 - 6;

  return (
    <View
      style={{
        backgroundColor: '#1C1C1E',
        paddingTop: 8,
        paddingBottom: 4,
        paddingHorizontal: 3,
      }}
    >
      {keyboardMode === 'letters' && renderLetterRows()}
      {keyboardMode === 'numbers' && renderNumberRows()}
      {keyboardMode === 'symbols' && renderSymbolRows()}

      {/* Bottom row - 123/ABC, globe, space, search */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        <Key
          label={keyboardMode === 'letters' ? '123' : 'ABC'}
          width={modeKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress(keyboardMode === 'letters' ? '123' : 'ABC')}
          isSpecial
        />
        <Key
          label="globe"
          width={keyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('globe')}
          isSpecial
        />
        <Key
          label="space"
          width={spaceKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('space')}
        />
        <Key
          label="search"
          width={modeKeyWidth}
          height={keyHeight}
          onPress={() => handleKeyPress('search')}
          isAccent
        />
      </View>
    </View>
  );
}
