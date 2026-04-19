import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated } from 'react-native';

type BoundaryProps = {
  sectionTitle: string;
  children: ReactNode;
};

type BoundaryState = { hasError: boolean };

/**
 * Isolates a horizontal discover / home rail so a render throw cannot blank the whole tab.
 * Replaces the failed subtree with an OLED-black pulse skeleton (Machined language).
 */
export class DiscoverySectionBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[DiscoverySection] ${this.props.sectionTitle}:`,
      error?.message,
      info?.componentStack?.slice(0, 240),
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <MachinedSectionSkeleton title={this.props.sectionTitle} onRetry={this.handleRetry} />
      );
    }
    return this.props.children;
  }
}

function MachinedSectionSkeleton({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  const pulse = React.useRef(new Animated.Value(0.38)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 880, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.32, duration: 880, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={skeletonStyles.wrap}>
      <Animated.View style={[skeletonStyles.pill, { opacity: pulse }]}>
        <Text style={skeletonStyles.label}>MACHINED SKELETON</Text>
        <Text style={skeletonStyles.sub} numberOfLines={2}>
          {title}
        </Text>
      </Animated.View>
      <Pressable onPress={onRetry} style={skeletonStyles.retry} accessibilityRole="button" accessibilityLabel="Retry section">
        <Text style={skeletonStyles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  wrap: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  pill: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 22,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.75,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  label: {
    color: 'rgba(255,255,255,0.32)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  sub: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  retry: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

/** Convenience wrapper — keeps `actionType` in the public API for tap logging at call sites. */
export function DiscoveryRailSection({
  sectionTitle,
  actionType: _actionType,
  children,
}: {
  sectionTitle: string;
  /** Reserved for callers that log `[UI_TAP]` with the same action vocabulary. */
  actionType: string;
  children: ReactNode;
}) {
  return <DiscoverySectionBoundary sectionTitle={sectionTitle}>{children}</DiscoverySectionBoundary>;
}
