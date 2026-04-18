export type MockResume = {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  sourceLabel: string;
};

export type MockFeedRow = {
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  badge?: string;
};

export type MockFeedSection = {
  id: string;
  title: string;
  subtitle?: string;
  rows: MockFeedRow[];
};

/** Moody, editorial photography — stable CDN URLs for mock UI only */
const U = (id: string, w = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const MOCK_RESUME_WAVES: MockResume[] = [
  {
    id: 'r1',
    title: 'After Hours Signal',
    subtitle: 'Session · 42 min',
    artwork: U('1493225456754-c90083d1e38e'),
    sourceLabel: 'Wave',
  },
  {
    id: 'r2',
    title: 'Concrete & Cassette',
    subtitle: 'Late set · 18 min',
    artwork: U('1514525253161-7a46d19cd819'),
    sourceLabel: 'Wave',
  },
  {
    id: 'r3',
    title: 'Subway Sonics',
    subtitle: 'Field tape · 26 min',
    artwork: U('1571266020443-e4d877b93725'),
    sourceLabel: 'Live',
  },
  {
    id: 'r4',
    title: 'Studio A — Dry Run',
    subtitle: 'Draft mix · 33 min',
    artwork: U('1598488055139-78d2473674a0'),
    sourceLabel: 'Draft',
  },
];

export const MOCK_FEED_SECTIONS: MockFeedSection[] = [
  {
    id: 's1',
    title: 'Cut to match your picks',
    subtitle: 'From onboarding — editorial, not algorithm hype',
    rows: [
      {
        id: 'f1',
        title: 'Signal Loss',
        subtitle: 'Broken drum machines & tape hiss',
        artwork: U('1511379938547-cbf895f0c4a1'),
        badge: 'Story',
      },
      {
        id: 'f2',
        title: 'Night Freight',
        subtitle: 'Low end that carries weight',
        artwork: U('1498038432885-c473f99677c8'),
        badge: 'Heavy',
      },
      {
        id: 'f3',
        title: 'Glass Corridors',
        subtitle: 'Minimal, precise, no filler',
        artwork: U('1516455570750-2da8c8e4a1b8'),
      },
    ],
  },
  {
    id: 's2',
    title: 'The rotation',
    subtitle: 'Mock recommendations — swap for API later',
    rows: [
      {
        id: 'f4',
        title: 'Redline Vocal',
        subtitle: 'Raw takes, no polish',
        artwork: U('1471478337199-b74935ea0363'),
        badge: 'Vocal',
      },
      {
        id: 'f5',
        title: 'Basement Broadcast',
        subtitle: 'Crowd noise left in on purpose',
        artwork: U('1514525253161-7a46d19cd819'),
      },
      {
        id: 'f6',
        title: 'Static Bloom',
        subtitle: 'Pads that feel like weather',
        artwork: U('1459749411175-04bf5292b717'),
      },
    ],
  },
];
