import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { MACHINED_CYAN } from '@/constants/machinedTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Subtle outer glow on primary actions (machined cyan). */
const CHILL_OK_OUTER_GLOW = {
  shadowColor: MACHINED_CYAN,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.55,
  shadowRadius: 14,
  ...(Platform.OS === 'android' ? { elevation: 14 } : {}),
} as const;

// Types
export type VybePopupType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface VybePopupAction {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface VybePopupConfig {
  title: string;
  message?: string;
  type?: VybePopupType;
  /** Relaxed typography + cyan glass / OK glow (post-login welcome, etc.). */
  visualTone?: 'default' | 'chill';
  icon?: React.ReactNode;
  showCloseButton?: boolean;
  actions?: VybePopupAction[];
  onDismiss?: () => void;
}

interface VybePopupState extends VybePopupConfig {
  visible: boolean;
  loading: boolean;
  loadingActionIndex: number | null;
}

interface VybePopupContextType {
  showVybePopup: (config: VybePopupConfig) => void;
  hideVybePopup: () => void;
}

const VybePopupContext = createContext<VybePopupContextType | null>(null);

// Icon component based on type
function PopupIcon({
  type,
  customIcon,
  visualTone,
}: {
  type?: VybePopupType;
  customIcon?: React.ReactNode;
  visualTone?: 'default' | 'chill';
}) {
  if (customIcon) return <>{customIcon}</>;

  const iconSize = 32;
  const iconProps = { size: iconSize };

  switch (type) {
    case 'success':
      return (
        <CheckCircle
          {...iconProps}
          color={visualTone === 'chill' ? MACHINED_CYAN : '#10B981'}
        />
      );
    case 'warning':
      return <AlertTriangle {...iconProps} color="#F59E0B" />;
    case 'error':
      return <AlertCircle {...iconProps} color="#EF4444" />;
    case 'confirm':
      return <AlertTriangle {...iconProps} color="#8B5CF6" />;
    case 'info':
    default:
      return <Info {...iconProps} color="#3B82F6" />;
  }
}

// Get icon background color based on type
function getIconBgColor(type?: VybePopupType, visualTone?: 'default' | 'chill'): string {
  switch (type) {
    case 'success':
      return visualTone === 'chill' ? 'rgba(0, 255, 255, 0.14)' : 'rgba(16, 185, 129, 0.15)';
    case 'warning':
      return 'rgba(245, 158, 11, 0.15)';
    case 'error':
      return 'rgba(239, 68, 68, 0.15)';
    case 'confirm':
      return 'rgba(139, 92, 246, 0.15)';
    case 'info':
    default:
      return 'rgba(59, 130, 246, 0.15)';
  }
}

// Button component
function PopupButton({
  action,
  isLoading,
  onPress,
  isLast,
  visualTone,
}: {
  action: VybePopupAction;
  isLoading: boolean;
  onPress: () => void;
  isLast: boolean;
  visualTone?: 'default' | 'chill';
}) {
  const isDestructive = action.style === 'destructive';
  const isCancel = action.style === 'cancel';
  const chillPrimary = visualTone === 'chill' && !isDestructive && !isCancel;

  return (
    <Pressable
      onPressIn={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPress={onPress}
      disabled={isLoading}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      className={`flex-1 py-3.5 rounded-xl items-center justify-center ${
        isDestructive
          ? 'bg-red-500/20'
          : isCancel
          ? 'bg-white/10'
          : chillPrimary
          ? ''
          : 'bg-[#8B5CF6]'
      } ${!isLast ? 'mr-3' : ''}`}
      style={({ pressed }) => ({
        opacity: isLoading ? 0.6 : pressed ? 0.8 : 1,
        ...(chillPrimary
          ? {
              backgroundColor: MACHINED_CYAN,
              ...CHILL_OK_OUTER_GLOW,
            }
          : {}),
      })}
    >
      {isLoading ? (
        <ActivityIndicator
          color={
            isDestructive ? '#EF4444' : isCancel ? '#fff' : chillPrimary ? '#0A0A0A' : '#fff'
          }
          size="small"
        />
      ) : (
        <Text
          className={`text-base ${
            isDestructive
              ? 'font-semibold text-red-400'
              : isCancel
              ? 'font-semibold text-white/80'
              : chillPrimary
              ? 'font-semibold text-[#0A0A0A]'
              : 'font-semibold text-white'
          }`}
        >
          {action.text}
        </Text>
      )}
    </Pressable>
  );
}

// Main Popup Component
function VybePopupModal({
  state,
  onClose,
  onActionPress,
}: {
  state: VybePopupState;
  onClose: () => void;
  onActionPress: (index: number) => void;
}) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (state.visible) {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 20, stiffness: 300 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
    }
  }, [state.visible]);

  const animatedBackdrop = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const animatedCard = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  const chill = state.visualTone === 'chill';

  const handleClose = useCallback(() => {
    opacity.value = withTiming(0, { duration: 150 });
    scale.value = withTiming(0.9, { duration: 150 });
    translateY.value = withTiming(20, { duration: 150 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose]);

  // Default OK action if none provided
  const actions = state.actions?.length
    ? state.actions
    : [{ text: 'OK', style: 'default' as const }];

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/*
        GestureHandlerRootView: RNGH + transparent Modal often drops Pressable taps
        on the root tree; inner wrapper fixes “OK” not responding (Enjoy the Vibes).
      */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          pointerEvents="box-none"
        >
        {/* Dark backdrop with blur — zIndex 0 so card + actions stay above for hit-testing */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 0,
            },
            animatedBackdrop,
          ]}
        >
          <BlurView
            intensity={40}
            tint="dark"
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
            }}
          />
        </Animated.View>

        {/* Popup Card — above backdrop so OK / actions receive touches */}
        <Animated.View
          style={[
            {
              width: SCREEN_WIDTH - 48,
              maxWidth: 400,
              zIndex: 1,
              elevation: Platform.OS === 'android' ? 24 : 0,
            },
            animatedCard,
          ]}
        >
          <View
            className="bg-[#1A1A1A] rounded-2xl overflow-hidden"
            style={{
              borderWidth: 1,
              borderColor: chill ? 'rgba(0, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.1)',
              shadowColor: chill ? MACHINED_CYAN : '#000',
              shadowOffset: { width: 0, height: chill ? 0 : 10 },
              shadowOpacity: chill ? 0.22 : 0.5,
              shadowRadius: chill ? 18 : 20,
              elevation: 20,
            }}
          >
            {/* Close Button (if enabled) */}
            {state.showCloseButton ? (
              <Pressable
                onPress={handleClose}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/10 items-center justify-center"
                hitSlop={8}
              >
                <X size={18} color="rgba(255, 255, 255, 0.6)" />
              </Pressable>
            ) : null}

            {/* Content */}
            <View className="p-6">
              {/* Icon */}
              <View
                className="w-16 h-16 rounded-full items-center justify-center self-center mb-4"
                style={{
                  backgroundColor: getIconBgColor(state.type, state.visualTone),
                }}
              >
                <PopupIcon
                  type={state.type}
                  customIcon={state.icon}
                  visualTone={state.visualTone}
                />
              </View>

              {/* Title */}
              <Text
                className={`text-white text-xl text-center mb-2 ${
                  chill ? 'font-medium' : 'font-bold'
                }`}
              >
                {state.title}
              </Text>

              {/* Message */}
              {state.message ? (
                <Text
                  className={`text-base text-center leading-6 ${
                    chill
                      ? 'font-normal text-[#67E8F9]'
                      : 'font-normal text-white/70'
                  }`}
                >
                  {state.message}
                </Text>
              ) : null}
            </View>

            {/* Actions */}
            <View className="px-6 pb-6 pt-2">
              <View className="flex-row">
                {actions.map((action, index) => (
                  <PopupButton
                    key={index}
                    action={action}
                    isLoading={Boolean(state.loading && state.loadingActionIndex === index)}
                    onPress={() => onActionPress(index)}
                    isLast={index === actions.length - 1}
                    visualTone={state.visualTone}
                  />
                ))}
              </View>
            </View>
          </View>
        </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Provider Component
export function VybePopupProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<VybePopupState>({
    visible: false,
    loading: false,
    loadingActionIndex: null,
    title: '',
  });

  const configRef = useRef<VybePopupConfig | null>(null);

  const showVybePopup = useCallback((config: VybePopupConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    configRef.current = config;
    setState({
      ...config,
      visible: true,
      loading: false,
      loadingActionIndex: null,
    });
  }, []);

  const hideVybePopup = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
    if (configRef.current?.onDismiss) {
      configRef.current.onDismiss();
    }
    configRef.current = null;
  }, []);

  const handleActionPress = useCallback(async (index: number) => {
    const config = configRef.current;
    if (!config) return;

    const action = config.actions?.[index] || { text: 'OK' };

    // Handle cancel action immediately
    if (action.style === 'cancel' && !action.onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      hideVybePopup();
      return;
    }

    // If there is an onPress handler
    if (action.onPress) {
      Haptics.impactAsync(
        action.style === 'destructive'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : Haptics.ImpactFeedbackStyle.Medium
      );

      setState((prev) => ({
        ...prev,
        loading: true,
        loadingActionIndex: index,
      }));

      try {
        await action.onPress();
        hideVybePopup();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong. Please try again.';
        Alert.alert('Error', msg);
      } finally {
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingActionIndex: null,
        }));
      }
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      hideVybePopup();
    }
  }, [hideVybePopup]);

  return (
    <VybePopupContext.Provider value={{ showVybePopup, hideVybePopup }}>
      {children}
      <VybePopupModal
        state={state}
        onClose={hideVybePopup}
        onActionPress={handleActionPress}
      />
    </VybePopupContext.Provider>
  );
}

// Hook
export function useVybePopup() {
  const context = useContext(VybePopupContext);
  if (!context) {
    throw new Error('useVybePopup must be used within a VybePopupProvider');
  }
  return context;
}

// Convenience function for common alert patterns
export function createVybeAlert(showPopup: (config: VybePopupConfig) => void) {
  return {
    info: (title: string, message?: string, onPress?: () => void) =>
      showPopup({
        title,
        message,
        type: 'info',
        actions: [{ text: 'OK', onPress }],
      }),
    success: (title: string, message?: string, onPress?: () => void) =>
      showPopup({
        title,
        message,
        type: 'success',
        actions: [{ text: 'OK', onPress }],
      }),
    warning: (title: string, message?: string, onPress?: () => void) =>
      showPopup({
        title,
        message,
        type: 'warning',
        actions: [{ text: 'OK', onPress }],
      }),
    error: (title: string, message?: string, onPress?: () => void) =>
      showPopup({
        title,
        message,
        type: 'error',
        actions: [{ text: 'OK', onPress }],
      }),
    confirm: (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      options?: {
        confirmText?: string;
        cancelText?: string;
        destructive?: boolean;
      }
    ) =>
      showPopup({
        title,
        message,
        type: options?.destructive ? 'error' : 'confirm',
        actions: [
          { text: options?.cancelText || 'Cancel', style: 'cancel' },
          {
            text: options?.confirmText || 'Confirm',
            style: options?.destructive ? 'destructive' : 'default',
            onPress: onConfirm,
          },
        ],
      }),
  };
}
