"""Danceability extraction from audio."""

import numpy as np

from .base import BaseExtractor, ExtractionResult


class DanceabilityExtractor(BaseExtractor):
    """Extract danceability score from audio."""

    name = "danceability"

    def extract(self, audio: np.ndarray, sr: int) -> ExtractionResult:
        """
        Extract danceability score from audio.

        Combines multiple factors:
        - Beat strength (how prominent/clear the beat is)
        - Tempo stability (how consistent the tempo is)
        - Rhythmic regularity (predictable rhythm patterns)
        - Groove factor (syncopation and swing)

        Args:
            audio: Audio signal (mono)
            sr: Sample rate

        Returns:
            ExtractionResult with danceability score (0-100)
        """
        import librosa

        if not self.validate_audio(audio):
            return ExtractionResult(
                feature_name=self.name,
                value=None,
                confidence=0.0,
                metadata={"error": "Invalid audio"},
            )

        try:
            # Get onset envelope and beat frames
            onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
            tempo, beat_frames = librosa.beat.beat_track(
                onset_envelope=onset_env, sr=sr, units="frames"
            )

            # Handle librosa returning array vs scalar
            if hasattr(tempo, "__len__"):
                tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
            else:
                tempo = float(tempo)

            # 1. Beat strength: how strong the onsets are at beat positions
            beat_strength = self._calculate_beat_strength(onset_env, beat_frames)

            # 2. Tempo stability: how consistent the inter-beat intervals are
            tempo_stability = self._calculate_tempo_stability(beat_frames, sr)

            # 3. Rhythmic regularity: how predictable the rhythm is
            rhythmic_regularity = self._calculate_rhythmic_regularity(onset_env)

            # 4. Groove factor: measures syncopation and swing
            groove = self._calculate_groove(onset_env, beat_frames)

            # Weighted combination
            danceability = (
                0.4 * beat_strength
                + 0.3 * tempo_stability
                + 0.2 * rhythmic_regularity
                + 0.1 * groove
            )

            # Tempo adjustment: optimal dance tempo is 115-130 BPM
            tempo_factor = self._tempo_adjustment(tempo)
            danceability *= tempo_factor

            # Scale to 0-100
            danceability_score = int(round(danceability * 100))
            danceability_score = max(0, min(100, danceability_score))

            return ExtractionResult(
                feature_name=self.name,
                value=danceability_score,
                confidence=1.0,
                metadata={
                    "tempo": tempo,
                    "beat_strength": round(beat_strength, 3),
                    "tempo_stability": round(tempo_stability, 3),
                    "rhythmic_regularity": round(rhythmic_regularity, 3),
                    "groove": round(groove, 3),
                    "tempo_factor": round(tempo_factor, 3),
                },
            )

        except Exception as e:
            return ExtractionResult(
                feature_name=self.name,
                value=None,
                confidence=0.0,
                metadata={"error": str(e)},
            )

    def _calculate_beat_strength(self, onset_env: np.ndarray, beat_frames: np.ndarray) -> float:
        """
        Calculate beat strength (how prominent beats are vs. non-beats).

        Args:
            onset_env: Onset strength envelope
            beat_frames: Beat frame indices

        Returns:
            Beat strength score (0-1)
        """
        if len(beat_frames) < 2:
            return 0.5

        # Get onset strength at beat positions
        valid_beats = beat_frames[beat_frames < len(onset_env)]
        if len(valid_beats) == 0:
            return 0.5

        beat_onsets = onset_env[valid_beats]
        mean_beat_strength = np.mean(beat_onsets)
        mean_overall = np.mean(onset_env)

        if mean_overall == 0:
            return 0.5

        # Ratio of beat strength to overall (higher = clearer beats)
        ratio = mean_beat_strength / mean_overall
        return min(1.0, ratio / 2.0)  # Normalize assuming 2x is very strong

    def _calculate_tempo_stability(self, beat_frames: np.ndarray, sr: int) -> float:
        """
        Calculate tempo stability (consistency of inter-beat intervals).

        Args:
            beat_frames: Beat frame indices
            sr: Sample rate

        Returns:
            Tempo stability score (0-1)
        """
        if len(beat_frames) < 3:
            return 0.5

        # Calculate inter-beat intervals
        intervals = np.diff(beat_frames)

        if len(intervals) < 2:
            return 0.5

        # Coefficient of variation (lower = more stable)
        mean_interval = np.mean(intervals)
        std_interval = np.std(intervals)

        if mean_interval == 0:
            return 0.5

        cv = std_interval / mean_interval

        # Convert to 0-1 score (CV of 0 = perfect stability)
        stability = max(0.0, 1.0 - cv)
        return stability

    def _calculate_rhythmic_regularity(self, onset_env: np.ndarray) -> float:
        """
        Calculate rhythmic regularity using autocorrelation.

        Args:
            onset_env: Onset strength envelope

        Returns:
            Rhythmic regularity score (0-1)
        """
        if len(onset_env) < 100:
            return 0.5

        # Autocorrelation of onset envelope
        autocorr = np.correlate(onset_env, onset_env, mode="full")
        autocorr = autocorr[len(autocorr) // 2:]

        # Normalize
        if autocorr[0] > 0:
            autocorr = autocorr / autocorr[0]

        # Find peaks in autocorrelation (regular patterns = strong peaks)
        # Look for peaks between 0.5s and 2s (common beat intervals)
        min_idx = 50  # ~0.5s at typical hop length
        max_idx = min(400, len(autocorr))  # ~2s

        if max_idx <= min_idx:
            return 0.5

        segment = autocorr[min_idx:max_idx]
        peak_strength = np.max(segment) if len(segment) > 0 else 0.5

        return min(1.0, peak_strength)

    def _calculate_groove(self, onset_env: np.ndarray, beat_frames: np.ndarray) -> float:
        """
        Calculate groove factor (syncopation and swing).

        Args:
            onset_env: Onset strength envelope
            beat_frames: Beat frame indices

        Returns:
            Groove score (0-1)
        """
        if len(beat_frames) < 4:
            return 0.5

        # Look for off-beat accents (syncopation)
        valid_beats = beat_frames[beat_frames < len(onset_env)]
        if len(valid_beats) < 2:
            return 0.5

        # Find positions between beats
        off_beat_strength = []
        for i in range(len(valid_beats) - 1):
            mid_point = (valid_beats[i] + valid_beats[i + 1]) // 2
            if mid_point < len(onset_env):
                off_beat_strength.append(onset_env[mid_point])

        if not off_beat_strength:
            return 0.5

        # Calculate ratio of off-beat to on-beat strength
        on_beat_strength = np.mean(onset_env[valid_beats])
        off_beat_mean = np.mean(off_beat_strength)

        if on_beat_strength == 0:
            return 0.5

        ratio = off_beat_mean / on_beat_strength

        # Optimal groove has some off-beat activity but not too much
        # Sweet spot around 0.3-0.7 ratio
        if ratio < 0.1:
            groove = 0.3  # Too straight
        elif ratio > 0.9:
            groove = 0.3  # Too chaotic
        else:
            # Peak groove around 0.5 ratio
            groove = 1.0 - abs(ratio - 0.5) * 2

        return max(0.0, min(1.0, groove))

    def _tempo_adjustment(self, tempo: float) -> float:
        """
        Adjust score based on tempo (optimal dance tempo is 115-130 BPM).

        Args:
            tempo: BPM

        Returns:
            Adjustment factor (0.5-1.0)
        """
        optimal_low = 115
        optimal_high = 130

        if optimal_low <= tempo <= optimal_high:
            return 1.0
        elif tempo < optimal_low:
            # Lower tempos are less danceable
            return max(0.5, 1.0 - (optimal_low - tempo) / 50)
        else:
            # Higher tempos are still good but slightly less ideal
            return max(0.6, 1.0 - (tempo - optimal_high) / 60)
