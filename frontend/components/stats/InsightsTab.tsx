'use client';

import { useState, useEffect } from 'react';
import {
  SparklesIcon,
  TrophyIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  UserIcon,
  MusicalNoteIcon,
  ClockIcon,
  FireIcon,
  HeartIcon,
  MoonIcon,
  SunIcon,
  CalendarDaysIcon,
  StarIcon,
  BoltIcon,
  GlobeAltIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { DonutChart, CHART_COLORS, getSeriesColor } from '@/components/charts';

// Types
interface StatsOverview {
  period: string;
  total_plays: number;
  completed_plays: number;
  total_duration_ms: number;
  total_duration_formatted: string;
  unique_songs: number;
  unique_artists: number;
  unique_albums: number;
  avg_completion_percent: number;
  avg_plays_per_day: number;
  most_active_day: string | null;
  current_streak_days: number;
  longest_streak_days: number;
}

interface HeatmapData {
  year: number;
  data: { day: number; hour: number; plays: number }[];
  peak_day: string;
  peak_hour: number;
  quiet_day: string;
  quiet_hour: number;
}

interface GenreData {
  genres: { genre: string; play_count: number; percentage: number }[];
}

interface TrendsData {
  current_period: string;
  previous_period: string;
  plays_change: number;
  duration_change: number;
  new_songs_discovered: number;
  rising_artists: string[];
  declining_artists: string[];
}

interface LibraryStats {
  total_songs: number;
  total_albums: number;
  total_artists: number;
  total_duration_sec: number;
  total_duration_formatted: string;
  storage_formatted: string;
  longest_song: { title: string; artist: string; duration_sec: number } | null;
  most_prolific_artist: { name: string; song_count: number } | null;
}

interface TopSong {
  sha_id: string;
  title: string;
  artist: string;
  play_count: number;
}

interface WrappedData {
  year: number;
  total_minutes: number;
  total_plays: number;
  unique_songs: number;
  unique_artists: number;
  top_song: { title: string; artist: string; play_count: number } | null;
  top_artist: { name: string; play_count: number } | null;
  top_album: { album: string; artist: string; play_count: number } | null;
  top_genre: string | null;
  listening_personality: string;
  most_replayed_day: string | null;
  monthly_breakdown: { month: number; plays: number; duration_ms: number }[];
}

interface MoodData {
  primary_moods: { mood: string; count: number; percentage: number }[];
}

interface AudioFeatures {
  energy: { avg: number };
  danceability: { avg: number };
  acousticness: { avg: number };
}

interface InsightsTabProps {
  loading?: boolean;
}

// Listening personality types
const PERSONALITIES = {
  'Night Owl': {
    icon: MoonIcon,
    description: 'You come alive after dark. Your peak listening happens in the late evening hours.',
    color: 'purple',
  },
  'Early Bird': {
    icon: SunIcon,
    description: 'Rise and shine with music! You love starting your day with your favorite tunes.',
    color: 'amber',
  },
  'Daytime Listener': {
    icon: ClockIcon,
    description: 'You keep the music flowing during working hours. Background beats fuel your productivity.',
    color: 'cyan',
  },
  'Evening Enthusiast': {
    icon: StarIcon,
    description: 'The evening is your musical sweet spot. You unwind with your favorite tracks after a long day.',
    color: 'pink',
  },
  'Weekend Warrior': {
    icon: CalendarDaysIcon,
    description: 'Weekends are made for music! You save your listening sessions for your days off.',
    color: 'green',
  },
} as const;

// Helper functions
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} min`;
  } else {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

function getPersonalityType(heatmap: HeatmapData | null): keyof typeof PERSONALITIES {
  if (!heatmap) return 'Daytime Listener';

  const peakHour = heatmap.peak_hour;
  const peakDay = heatmap.peak_day;

  // Check if weekend warrior (Saturday or Sunday peak)
  if (peakDay === 'Saturday' || peakDay === 'Sunday') {
    return 'Weekend Warrior';
  }

  // Time-based personality
  if (peakHour >= 5 && peakHour < 9) {
    return 'Early Bird';
  } else if (peakHour >= 9 && peakHour < 17) {
    return 'Daytime Listener';
  } else if (peakHour >= 17 && peakHour < 21) {
    return 'Evening Enthusiast';
  } else {
    return 'Night Owl';
  }
}

function getEnergyPreference(energy: number): { label: string; description: string } {
  if (energy >= 70) {
    return { label: 'High Energy', description: 'You love tracks that pump you up and get you moving' };
  } else if (energy >= 40) {
    return { label: 'Balanced', description: 'You enjoy a mix of energetic and chill tracks' };
  } else {
    return { label: 'Chill Vibes', description: 'You prefer relaxed, mellow music to unwind' };
  }
}

export default function InsightsTab({ loading = false }: InsightsTabProps) {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [genres, setGenres] = useState<GenreData | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [library, setLibrary] = useState<LibraryStats | null>(null);
  const [topSongs, setTopSongs] = useState<TopSong[]>([]);
  const [wrapped, setWrapped] = useState<WrappedData | null>(null);
  const [moods, setMoods] = useState<MoodData | null>(null);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Fetch all insights data
  useEffect(() => {
    const fetchInsightsData = async () => {
      setLoadingData(true);

      try {
        const [
          overviewRes,
          heatmapRes,
          genresRes,
          trendsRes,
          libraryRes,
          topSongsRes,
          wrappedRes,
          moodsRes,
          audioRes,
        ] = await Promise.all([
          fetch('/api/stats/overview?period=all'),
          fetch('/api/stats/heatmap'),
          fetch('/api/stats/genres?period=all'),
          fetch('/api/stats/trends?period=week'),
          fetch('/api/stats/library'),
          fetch('/api/stats/top-songs?period=all&limit=5'),
          fetch(`/api/stats/wrapped/${selectedYear}`),
          fetch('/api/stats/moods'),
          fetch('/api/stats/audio-features'),
        ]);

        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (heatmapRes.ok) setHeatmap(await heatmapRes.json());
        if (genresRes.ok) setGenres(await genresRes.json());
        if (trendsRes.ok) setTrends(await trendsRes.json());
        if (libraryRes.ok) setLibrary(await libraryRes.json());
        if (topSongsRes.ok) {
          const data = await topSongsRes.json();
          setTopSongs(data.songs || []);
        }
        if (wrappedRes.ok) setWrapped(await wrappedRes.json());
        if (moodsRes.ok) setMoods(await moodsRes.json());
        if (audioRes.ok) setAudioFeatures(await audioRes.json());
      } catch (e) {
        console.error('Failed to fetch insights:', e);
      } finally {
        setLoadingData(false);
      }
    };

    fetchInsightsData();
  }, [selectedYear]);

  if (loading || loadingData) {
    return <InsightsSkeleton />;
  }

  const personality = getPersonalityType(heatmap);
  const PersonalityIcon = PERSONALITIES[personality].icon;

  return (
    <div className="space-y-6">
      {/* Listening Personality */}
      <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 rounded-2xl p-6 border border-purple-700/30">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserIcon className="w-5 h-5 text-pink-500" />
          Your Listening Personality
        </h3>
        <div className="flex items-start gap-6">
          <div className={`w-20 h-20 rounded-2xl bg-${PERSONALITIES[personality].color}-500/20 flex items-center justify-center flex-shrink-0`}>
            <PersonalityIcon className={`w-10 h-10 text-${PERSONALITIES[personality].color}-400`} />
          </div>
          <div>
            <h4 className="text-2xl font-bold text-white mb-2">{personality}</h4>
            <p className="text-gray-300">{PERSONALITIES[personality].description}</p>
            {heatmap && (
              <p className="text-sm text-gray-400 mt-3">
                Peak listening: <span className="text-white">{heatmap.peak_day}s at {heatmap.peak_hour}:00</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Music Taste Profile */}
      <div className="grid lg:grid-cols-2 gap-6">
        <MusicTasteProfile genres={genres} moods={moods} audioFeatures={audioFeatures} />
        <Comparisons trends={trends} overview={overview} />
      </div>

      {/* Milestones & Fun Facts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Milestones overview={overview} library={library} />
        <FunFacts overview={overview} library={library} topSongs={topSongs} />
      </div>

      {/* Wrapped Summary */}
      <WrappedSummary
        wrapped={wrapped}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
      />
    </div>
  );
}

// Music Taste Profile Component
function MusicTasteProfile({
  genres,
  moods,
  audioFeatures,
}: {
  genres: GenreData | null;
  moods: MoodData | null;
  audioFeatures: AudioFeatures | null;
}) {
  const topGenres = genres?.genres.slice(0, 5) || [];
  const topMoods = moods?.primary_moods.slice(0, 3) || [];
  const energyPref = audioFeatures ? getEnergyPreference(audioFeatures.energy.avg) : null;

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <HeartIcon className="w-5 h-5 text-pink-500" />
        Music Taste Profile
      </h3>
      <div className="space-y-5">
        {/* Top Genres */}
        <div>
          <p className="text-sm text-gray-400 mb-3">Top Genres</p>
          <div className="flex flex-wrap gap-2">
            {topGenres.length > 0 ? (
              topGenres.map((g, i) => (
                <span
                  key={g.genre}
                  className="px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `${getSeriesColor(i)}20`,
                    color: getSeriesColor(i),
                  }}
                >
                  {g.genre} ({g.percentage}%)
                </span>
              ))
            ) : (
              <span className="text-gray-500 text-sm">No genre data available</span>
            )}
          </div>
        </div>

        {/* Energy Preference */}
        {energyPref && (
          <div className="bg-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <BoltIcon className="w-5 h-5 text-amber-400" />
              <span className="font-semibold text-white">{energyPref.label}</span>
            </div>
            <p className="text-sm text-gray-400">{energyPref.description}</p>
            {audioFeatures && (
              <div className="mt-3 flex gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Energy</span>
                    <span>{Math.round(audioFeatures.energy.avg)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-pink-500"
                      style={{ width: `${audioFeatures.energy.avg}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Danceability</span>
                    <span>{Math.round(audioFeatures.danceability.avg)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                      style={{ width: `${audioFeatures.danceability.avg}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Moods */}
        {topMoods.length > 0 && (
          <div>
            <p className="text-sm text-gray-400 mb-3">Your Moods</p>
            <div className="space-y-2">
              {topMoods.map((m, i) => (
                <div key={m.mood} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getSeriesColor(i) }}
                  />
                  <span className="text-sm text-gray-300 flex-1">{m.mood}</span>
                  <span className="text-xs text-gray-500">{m.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Comparisons Component
function Comparisons({
  trends,
  overview,
}: {
  trends: TrendsData | null;
  overview: StatsOverview | null;
}) {
  if (!trends) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ArrowTrendingUpIcon className="w-5 h-5 text-pink-500" />
          This Week vs Last Week
        </h3>
        <p className="text-gray-500 text-sm">No comparison data available yet</p>
      </div>
    );
  }

  const TrendIcon = trends.plays_change >= 0 ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
  const trendColor = trends.plays_change >= 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ArrowTrendingUpIcon className="w-5 h-5 text-pink-500" />
        This Week vs Last Week
      </h3>
      <div className="space-y-4">
        {/* Plays Change */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-3">
            <PlayIcon className="w-5 h-5 text-pink-400" />
            <span className="text-gray-300">Plays</span>
          </div>
          <div className={`flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="w-4 h-4" />
            <span className="font-semibold">{Math.abs(trends.plays_change)}%</span>
          </div>
        </div>

        {/* Duration Change */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-3">
            <ClockIcon className="w-5 h-5 text-purple-400" />
            <span className="text-gray-300">Listening Time</span>
          </div>
          <div className={`flex items-center gap-1 ${trends.duration_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trends.duration_change >= 0 ? (
              <ArrowTrendingUpIcon className="w-4 h-4" />
            ) : (
              <ArrowTrendingDownIcon className="w-4 h-4" />
            )}
            <span className="font-semibold">{Math.abs(trends.duration_change)}%</span>
          </div>
        </div>

        {/* New Discoveries */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-3">
            <SparklesIcon className="w-5 h-5 text-cyan-400" />
            <span className="text-gray-300">New Songs Discovered</span>
          </div>
          <span className="font-semibold text-white">{trends.new_songs_discovered}</span>
        </div>

        {/* Rising Artists */}
        {trends.rising_artists.length > 0 && (
          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-2">Rising Artists</p>
            <div className="flex flex-wrap gap-2">
              {trends.rising_artists.slice(0, 3).map((artist) => (
                <span
                  key={artist}
                  className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs"
                >
                  {artist}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Milestones Component
function Milestones({
  overview,
  library,
}: {
  overview: StatsOverview | null;
  library: LibraryStats | null;
}) {
  const milestones = [];

  // Plays milestones
  if (overview) {
    const playMilestones = [100, 500, 1000, 5000, 10000, 50000, 100000];
    for (const m of playMilestones) {
      if (overview.total_plays >= m) {
        milestones.push({
          icon: PlayIcon,
          label: `${formatNumber(m)} Plays`,
          achieved: true,
          color: 'pink',
        });
      } else {
        milestones.push({
          icon: PlayIcon,
          label: `${formatNumber(m)} Plays`,
          achieved: false,
          progress: Math.round((overview.total_plays / m) * 100),
          color: 'pink',
        });
        break;
      }
    }
  }

  // Library size milestones
  if (library) {
    const libMilestones = [100, 500, 1000, 5000, 10000];
    for (const m of libMilestones) {
      if (library.total_songs >= m) {
        milestones.push({
          icon: MusicalNoteIcon,
          label: `${formatNumber(m)} Songs in Library`,
          achieved: true,
          color: 'purple',
        });
      } else {
        milestones.push({
          icon: MusicalNoteIcon,
          label: `${formatNumber(m)} Songs in Library`,
          achieved: false,
          progress: Math.round((library.total_songs / m) * 100),
          color: 'purple',
        });
        break;
      }
    }
  }

  // Artist milestones
  if (overview) {
    if (overview.unique_artists >= 50) {
      milestones.push({
        icon: UserIcon,
        label: '50 Artists Explored',
        achieved: true,
        color: 'cyan',
      });
    }
    if (overview.unique_artists >= 100) {
      milestones.push({
        icon: GlobeAltIcon,
        label: '100 Artists Explored',
        achieved: true,
        color: 'cyan',
      });
    }
  }

  // Streak milestone
  if (overview && overview.longest_streak_days >= 7) {
    milestones.push({
      icon: FireIcon,
      label: '7-Day Listening Streak',
      achieved: true,
      color: 'amber',
    });
  }

  // Limit to 6 milestones
  const displayMilestones = milestones.slice(0, 6);

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrophyIcon className="w-5 h-5 text-pink-500" />
        Milestones
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {displayMilestones.map((m, i) => {
          const Icon = m.icon;
          return (
            <div
              key={i}
              className={`p-3 rounded-xl border ${
                m.achieved
                  ? 'bg-gray-800/50 border-gray-700'
                  : 'bg-gray-800/20 border-gray-800 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {m.achieved ? (
                  <CheckCircleIcon className={`w-5 h-5 text-${m.color}-400`} />
                ) : (
                  <Icon className="w-5 h-5 text-gray-500" />
                )}
                <span className={`text-xs ${m.achieved ? 'text-gray-300' : 'text-gray-500'}`}>
                  {m.label}
                </span>
              </div>
              {!m.achieved && m.progress !== undefined && (
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-${m.color}-500`}
                    style={{ width: `${m.progress}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Fun Facts Component
function FunFacts({
  overview,
  library,
  topSongs,
}: {
  overview: StatsOverview | null;
  library: LibraryStats | null;
  topSongs: TopSong[];
}) {
  const facts = [];

  // Library duration fact
  if (library && library.total_duration_sec > 0) {
    const days = Math.floor(library.total_duration_sec / 86400);
    const hours = Math.floor((library.total_duration_sec % 86400) / 3600);
    facts.push({
      emoji: '🎵',
      text: `If you listened to your entire library non-stop, it would take`,
      highlight: `${days} days and ${hours} hours`,
    });
  }

  // Most played song
  if (topSongs.length > 0) {
    const top = topSongs[0];
    facts.push({
      emoji: '🔁',
      text: `Your most played song "${top.title}" has been played`,
      highlight: `${top.play_count} times`,
    });
  }

  // Total listening time
  if (overview && overview.total_duration_ms > 0) {
    facts.push({
      emoji: '⏱️',
      text: `You've spent a total of`,
      highlight: formatDuration(overview.total_duration_ms),
      suffix: 'listening to music',
    });
  }

  // Completion rate
  if (overview && overview.avg_completion_percent > 0) {
    facts.push({
      emoji: overview.avg_completion_percent >= 80 ? '✨' : '⏭️',
      text: `On average, you listen to`,
      highlight: `${Math.round(overview.avg_completion_percent)}%`,
      suffix: 'of each song before skipping',
    });
  }

  // Longest streak
  if (overview && overview.longest_streak_days > 0) {
    facts.push({
      emoji: '🔥',
      text: `Your longest listening streak was`,
      highlight: `${overview.longest_streak_days} days`,
      suffix: 'in a row',
    });
  }

  // Prolific artist
  if (library?.most_prolific_artist) {
    facts.push({
      emoji: '👑',
      text: `${library.most_prolific_artist.name} dominates your library with`,
      highlight: `${library.most_prolific_artist.song_count} songs`,
    });
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <SparklesIcon className="w-5 h-5 text-pink-500" />
        Fun Facts
      </h3>
      <div className="space-y-4">
        {facts.length > 0 ? (
          facts.slice(0, 5).map((fact, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-xl">{fact.emoji}</span>
              <p className="text-sm text-gray-300">
                {fact.text}{' '}
                <span className="text-white font-semibold">{fact.highlight}</span>
                {fact.suffix && ` ${fact.suffix}`}
              </p>
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-sm">
            Keep listening to unlock fun facts about your music habits!
          </p>
        )}
      </div>
    </div>
  );
}

// Wrapped Summary Component
function WrappedSummary({
  wrapped,
  selectedYear,
  onYearChange,
}: {
  wrapped: WrappedData | null;
  selectedYear: number;
  onYearChange: (year: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="bg-gradient-to-br from-pink-900/30 via-purple-900/30 to-cyan-900/30 rounded-2xl p-6 border border-pink-700/30">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <StarIcon className="w-5 h-5 text-pink-500" />
          {selectedYear} Wrapped
        </h3>
        <div className="flex gap-2">
          {years.map((year) => (
            <button
              key={year}
              onClick={() => onYearChange(year)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedYear === year
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {wrapped ? (
        <div className="grid md:grid-cols-3 gap-4">
          {/* Total Minutes */}
          <div className="bg-black/30 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-pink-400">{formatNumber(wrapped.total_minutes)}</p>
            <p className="text-sm text-gray-400 mt-1">minutes listened</p>
          </div>

          {/* Top Song */}
          {wrapped.top_song && (
            <div className="bg-black/30 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase mb-2">Top Song</p>
              <p className="font-semibold text-white truncate">{wrapped.top_song.title}</p>
              <p className="text-sm text-gray-400 truncate">{wrapped.top_song.artist}</p>
              <p className="text-xs text-pink-400 mt-1">{wrapped.top_song.play_count} plays</p>
            </div>
          )}

          {/* Top Artist */}
          {wrapped.top_artist && (
            <div className="bg-black/30 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase mb-2">Top Artist</p>
              <p className="font-semibold text-white truncate">{wrapped.top_artist.name}</p>
              <p className="text-xs text-purple-400 mt-1">{wrapped.top_artist.play_count} plays</p>
            </div>
          )}

          {/* Stats Row */}
          <div className="md:col-span-3 grid grid-cols-4 gap-4 mt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{formatNumber(wrapped.total_plays)}</p>
              <p className="text-xs text-gray-500">plays</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{formatNumber(wrapped.unique_songs)}</p>
              <p className="text-xs text-gray-500">songs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{formatNumber(wrapped.unique_artists)}</p>
              <p className="text-xs text-gray-500">artists</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">{wrapped.listening_personality}</p>
              <p className="text-xs text-gray-500">personality</p>
            </div>
          </div>

          {/* Share Button */}
          <div className="md:col-span-3 flex justify-center mt-4">
            <button
              className="flex items-center gap-2 px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-full text-sm font-medium transition-colors"
              onClick={() => {
                // TODO: Implement share functionality
                alert('Share functionality coming soon!');
              }}
            >
              <ShareIcon className="w-4 h-4" />
              Share Your Wrapped
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-400">No data available for {selectedYear}</p>
          <p className="text-sm text-gray-500 mt-1">
            Start listening to build your year in review!
          </p>
        </div>
      )}
    </div>
  );
}

// Skeleton Loader
function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-gray-900/70 rounded-2xl p-6 border border-gray-800 animate-pulse h-40" />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse h-64" />
        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse h-64" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse h-56" />
        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse h-56" />
      </div>
      <div className="bg-gray-900/70 rounded-2xl p-6 border border-gray-800 animate-pulse h-64" />
    </div>
  );
}
