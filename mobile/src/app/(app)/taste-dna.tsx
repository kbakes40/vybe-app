import React, { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, Share, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import {
  ChevronLeft,
  Share2,
  Dna,
  TrendingUp,
  TrendingDown,
  RotateCcw,
} from 'lucide-react-native';
import { useTasteDNAStore } from '@/stores/tasteDNAStore';
import { useDiscoveryAlgorithmStore } from '@/stores/discoveryAlgorithmStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_SIZE = SCREEN_WIDTH - 80;
const CHART_CENTER = CHART_SIZE / 2;
const CHART_RADIUS = CHART_SIZE / 2 - 30;

// Radar chart component for taste visualization
function TasteRadarChart({ dimensions }: { dimensions: { name: string; value: number }[] }) {
  const points = dimensions.length;
  const angleStep = (2 * Math.PI) / points;

  // Generate polygon points for data
  const dataPoints = dimensions.map((dim, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = CHART_RADIUS * dim.value;
    return {
      x: CHART_CENTER + r * Math.cos(angle),
      y: CHART_CENTER + r * Math.sin(angle),
    };
  });

  const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Generate grid lines
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <Svg width={CHART_SIZE} height={CHART_SIZE}>
      {/* Background grid */}
      {gridLevels.map((level, i) => {
        const gridPoints = dimensions.map((_, j) => {
          const angle = j * angleStep - Math.PI / 2;
          const r = CHART_RADIUS * level;
          return `${CHART_CENTER + r * Math.cos(angle)},${CHART_CENTER + r * Math.sin(angle)}`;
        }).join(' ');
        return (
          <Polygon
            key={i}
            points={gridPoints}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        );
      })}

      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const angle = i * angleStep - Math.PI / 2;
        return (
          <Line
            key={i}
            x1={CHART_CENTER}
            y1={CHART_CENTER}
            x2={CHART_CENTER + CHART_RADIUS * Math.cos(angle)}
            y2={CHART_CENTER + CHART_RADIUS * Math.sin(angle)}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        );
      })}

      {/* Data polygon */}
      <Polygon
        points={dataPath}
        fill="rgba(139, 92, 246, 0.3)"
        stroke="#8B5CF6"
        strokeWidth={2}
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <Circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4}
          fill="#8B5CF6"
        />
      ))}

      {/* Labels */}
      {dimensions.map((dim, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const labelR = CHART_RADIUS + 20;
        const x = CHART_CENTER + labelR * Math.cos(angle);
        const y = CHART_CENTER + labelR * Math.sin(angle);
        return (
          <SvgText
            key={i}
            x={x}
            y={y}
            fill="rgba(255,255,255,0.6)"
            fontSize={11}
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {dim.name}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// Tag chip component
function TagChip({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <View
      className={`px-3 py-1.5 rounded-full mr-2 mb-2 ${
        highlight ? 'bg-[#8B5CF6]/30' : 'bg-white/10'
      }`}
    >
      <Text className={`text-sm ${highlight ? 'text-[#8B5CF6]' : 'text-white/70'}`}>
        {label}
      </Text>
    </View>
  );
}

// Shift indicator
function ShiftIndicator({ label, direction }: { label: string; direction: 'up' | 'down' }) {
  return (
    <View className="flex-row items-center bg-white/5 rounded-lg px-3 py-2 mr-2 mb-2">
      {direction === 'up' ? (
        <TrendingUp size={14} color="#10B981" />
      ) : (
        <TrendingDown size={14} color="#EF4444" />
      )}
      <Text className="text-white/60 text-xs ml-1.5">{label}</Text>
    </View>
  );
}

export default function TasteDNAScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const data = useTasteDNAStore(s => s.data);
  const isLoading = useTasteDNAStore(s => s.isLoading);
  const fetchTasteDNA = useTasteDNAStore(s => s.fetchTasteDNA);
  const resetProfile = useDiscoveryAlgorithmStore(s => s.resetProfile);

  useEffect(() => {
    fetchTasteDNA();
  }, []);

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!data) return;

    const shareText = `My VYBE Taste DNA\n\n` +
      `Energy: ${data.dimensions.find(d => d.name === 'Energy')?.label || 'Medium'}\n` +
      `Tempo: ${data.dimensions.find(d => d.name === 'Tempo')?.label || 'Mid'}\n\n` +
      `Top Vibes: ${data.topMoods.slice(0, 3).map(m => m.name).join(', ')}\n` +
      `Top Rhythms: ${data.topRhythms.slice(0, 3).map(r => r.name).join(', ')}\n\n` +
      `#VYBE #TasteDNA`;

    try {
      await Share.share({ message: shareText });
    } catch (error) {
      console.log('Share failed:', error);
    }
  };

  const handleReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    resetProfile();
    fetchTasteDNA();
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 400 }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top }} className="px-4">
          <View className="flex-row items-center justify-between py-4">
            <Pressable onPress={() => router.back()} className="p-2 -ml-2">
              <ChevronLeft size={28} color="#fff" />
            </Pressable>
            <View className="flex-row items-center">
              <Dna size={20} color="#8B5CF6" />
              <Text className="text-white font-semibold text-lg ml-2">Taste DNA</Text>
            </View>
            <Pressable onPress={handleShare} className="p-2 -mr-2">
              <Share2 size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Loading State */}
        {isLoading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#8B5CF6" />
            <Text className="text-white/60 mt-4">Loading your taste profile...</Text>
          </View>
        ) : data ? (
          <>
            {/* Title */}
            <View className="px-5 mb-6">
              <Text className="text-white/50 text-sm">Your sound profile</Text>
            </View>

            {/* Radar Chart */}
            <View className="items-center mb-8">
              {data.dimensions.length >= 3 ? (
                <TasteRadarChart dimensions={data.dimensions} />
              ) : (
                <View className="h-[200px] items-center justify-center">
                  <Text className="text-white/40">Not enough data yet</Text>
                </View>
              )}
            </View>

            {/* Core Traits */}
            <View className="px-5 mb-6">
              <Text className="text-white font-semibold text-base mb-3">Core Traits</Text>
              <View className="flex-row flex-wrap">
                {data.dimensions.map((dim, i) => (
                  <View key={i} className="bg-white/5 rounded-lg px-4 py-3 mr-3 mb-3 min-w-[100px]">
                    <Text className="text-white/40 text-xs">{dim.name}</Text>
                    <Text className="text-white font-medium text-lg">{dim.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Top Rhythms */}
            {data.topRhythms.length > 0 && (
              <View className="px-5 mb-6">
                <Text className="text-white font-semibold text-base mb-3">Rhythm Types</Text>
                <View className="flex-row flex-wrap">
                  {data.topRhythms.map((rhythm, i) => (
                    <TagChip key={i} label={rhythm.name} highlight={i < 2} />
                  ))}
                </View>
              </View>
            )}

            {/* Top Moods */}
            {data.topMoods.length > 0 && (
              <View className="px-5 mb-6">
                <Text className="text-white font-semibold text-base mb-3">Vibe Tags</Text>
                <View className="flex-row flex-wrap">
                  {data.topMoods.map((mood, i) => (
                    <TagChip key={i} label={mood.name} highlight={i < 3} />
                  ))}
                </View>
              </View>
            )}

            {/* Top Eras */}
            {data.topEras.length > 0 && (
              <View className="px-5 mb-6">
                <Text className="text-white font-semibold text-base mb-3">Era Feel</Text>
                <View className="flex-row flex-wrap">
                  {data.topEras.map((era, i) => (
                    <TagChip key={i} label={era.name} highlight={i === 0} />
                  ))}
                </View>
              </View>
            )}

            {/* Recent Shifts */}
            {data.recentShifts.length > 0 && (
              <View className="px-5 mb-6">
                <Text className="text-white font-semibold text-base mb-3">Your taste lately</Text>
                <View className="flex-row flex-wrap">
                  {data.recentShifts.map((shift, i) => (
                    <ShiftIndicator key={i} label={shift.label} direction={shift.direction} />
                  ))}
                </View>
              </View>
            )}

            {/* Stats */}
            <View className="px-5 mb-6">
              <View className="bg-white/5 rounded-xl p-4">
                <View className="flex-row justify-between mb-3">
                  <View>
                    <Text className="text-white/40 text-xs">Total Listens</Text>
                    <Text className="text-white font-semibold text-xl">
                      {data.totalListens.toLocaleString()}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-white/40 text-xs">Completed</Text>
                    <Text className="text-white font-semibold text-xl">
                      {data.totalCompletions.toLocaleString()}
                    </Text>
                  </View>
                </View>
                {data.listeningSince ? (
                  <Text className="text-white/30 text-xs">
                    Listening since {new Date(data.listeningSince).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Why this exists */}
            <View className="px-5 mb-6">
              <Text className="text-white/30 text-xs text-center">
                Built from what you play, save, and finish
              </Text>
            </View>

            {/* Controls */}
            <View className="px-5">
              <Pressable
                onPress={handleReset}
                className="flex-row items-center justify-center bg-white/5 rounded-xl py-4"
              >
                <RotateCcw size={18} color="rgba(255,255,255,0.6)" />
                <Text className="text-white/60 font-medium ml-2">Reset Taste Profile</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View className="items-center justify-center py-20">
            <Text className="text-white/60">No taste data available yet</Text>
            <Text className="text-white/40 text-sm mt-2">Start listening to build your profile</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
