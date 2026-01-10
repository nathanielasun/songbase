"""Mood classification from audio features (rule-based)."""

import numpy as np

from .base import BaseExtractor, ExtractionResult


class MoodExtractor(BaseExtractor):
    """Classify mood from audio using rule-based heuristics."""

    name = "mood"

    MOOD_CATEGORIES = [
        "happy",
        "sad",
        "energetic",
        "calm",
        "aggressive",
        "romantic",
        "dark",
        "uplifting",
    ]

    def extract(self, audio: np.ndarray, sr: int) -> ExtractionResult:
        """
        Classify mood from audio.

        Uses a rule-based approach combining:
        - Tempo (fast/slow)
        - Key mode (major/minor)
        - Energy level
        - Brightness (spectral centroid)
        - Percussiveness (zero crossing rate)

        Args:
            audio: Audio signal (mono)
            sr: Sample rate

        Returns:
            ExtractionResult with primary/secondary mood and scores
        """
        import librosa

        if not self.validate_audio(audio):
            return ExtractionResult(
                feature_name=self.name,
                value={"primary": None, "secondary": None},
                confidence=0.0,
                metadata={"error": "Invalid audio"},
            )

        try:
            # Extract features for mood classification
            features = self._extract_mood_features(audio, sr)

            # Rule-based classification
            mood_scores = self._classify_mood(features)

            # Get primary and secondary moods
            sorted_moods = sorted(mood_scores.items(), key=lambda x: x[1], reverse=True)
            primary_mood = sorted_moods[0][0] if sorted_moods[0][1] > 0 else None
            secondary_mood = sorted_moods[1][0] if len(sorted_moods) > 1 and sorted_moods[1][1] > 0.3 else None

            return ExtractionResult(
                feature_name=self.name,
                value={
                    "primary": primary_mood,
                    "secondary": secondary_mood,
                },
                confidence=round(sorted_moods[0][1], 2) if primary_mood else 0.0,
                metadata={
                    "scores": mood_scores,
                    "features": features,
                },
            )

        except Exception as e:
            return ExtractionResult(
                feature_name=self.name,
                value={"primary": None, "secondary": None},
                confidence=0.0,
                metadata={"error": str(e)},
            )

    def _extract_mood_features(self, audio: np.ndarray, sr: int) -> dict:
        """
        Extract audio features relevant to mood classification.

        Args:
            audio: Audio signal
            sr: Sample rate

        Returns:
            Dictionary of extracted features
        """
        import librosa

        # Tempo
        onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        if hasattr(tempo, "__len__"):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)

        # Energy (RMS)
        rms = librosa.feature.rms(y=audio)[0]
        energy = float(np.mean(rms))

        # Key estimation (major vs minor)
        chroma = librosa.feature.chroma_cqt(y=audio, sr=sr)
        # Simplified major/minor detection using 3rd scale degree
        major_third = float(np.mean(chroma[4]))  # E in C major
        minor_third = float(np.mean(chroma[3]))  # Eb in C minor
        is_major = major_third > minor_third

        # Spectral features
        spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
        brightness = float(np.mean(spectral_centroid))

        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
        rolloff = float(np.mean(spectral_rolloff))

        # Zero crossing rate (percussiveness/noisiness)
        zcr = librosa.feature.zero_crossing_rate(y=audio)[0]
        percussiveness = float(np.mean(zcr))

        # Spectral contrast (for dynamic range)
        spectral_contrast = librosa.feature.spectral_contrast(y=audio, sr=sr)
        contrast = float(np.mean(spectral_contrast))

        return {
            "tempo": tempo,
            "energy": energy,
            "is_major": is_major,
            "brightness": brightness,
            "rolloff": rolloff,
            "percussiveness": percussiveness,
            "contrast": contrast,
        }

    def _classify_mood(self, features: dict) -> dict:
        """
        Rule-based mood classification.

        Args:
            features: Extracted audio features

        Returns:
            Dictionary of mood scores (0-1)
        """
        scores = {mood: 0.0 for mood in self.MOOD_CATEGORIES}

        tempo = features["tempo"]
        energy = features["energy"]
        is_major = features["is_major"]
        brightness = features["brightness"]
        percussiveness = features["percussiveness"]

        # Happy: Major key, high tempo, high energy, bright
        if is_major and tempo > 100 and energy > 0.08:
            scores["happy"] = 0.5 + (0.3 * min(1, tempo / 140)) + (0.2 * min(1, energy / 0.2))

        # Sad: Minor key, low tempo, low energy
        if not is_major and tempo < 100 and energy < 0.15:
            scores["sad"] = 0.5 + (0.3 * (1 - tempo / 100)) + (0.2 * (1 - energy / 0.15))

        # Energetic: High tempo, high energy (any key)
        if tempo > 115 and energy > 0.12:
            scores["energetic"] = 0.4 + (0.35 * min(1, energy / 0.25)) + (0.25 * min(1, tempo / 160))

        # Calm: Low tempo, low energy (any key)
        if tempo < 95 and energy < 0.12:
            scores["calm"] = 0.5 + (0.3 * (1 - tempo / 95)) + (0.2 * (1 - energy / 0.12))

        # Aggressive: High energy, high percussiveness, faster tempo
        if energy > 0.18 and percussiveness > 0.08 and tempo > 100:
            scores["aggressive"] = 0.4 + (0.4 * min(1, energy / 0.3)) + (0.2 * min(1, percussiveness / 0.15))

        # Romantic: Moderate tempo, moderate energy, often major
        if 70 < tempo < 110 and 0.05 < energy < 0.15:
            base = 0.4
            if is_major:
                base += 0.2
            scores["romantic"] = base + (0.2 * (1 - abs(tempo - 90) / 40))

        # Dark: Minor key, low brightness, lower energy
        if not is_major and brightness < 2500 and energy < 0.2:
            scores["dark"] = 0.5 + (0.3 * (1 - brightness / 2500)) + (0.2 * (1 - energy / 0.2))

        # Uplifting: Major key, building dynamics, moderate-fast tempo
        if is_major and tempo > 90 and energy > 0.1:
            base = 0.4
            if tempo > 110:
                base += 0.15
            if features["contrast"] > 20:  # Dynamic range suggests build-up
                base += 0.15
            scores["uplifting"] = min(1.0, base + 0.1 * min(1, energy / 0.2))

        # Normalize scores so they sum to reasonable values
        total = sum(scores.values())
        if total > 0:
            # Only normalize if we have some signal
            max_score = max(scores.values())
            if max_score > 0:
                scores = {k: round(v / max_score, 2) if max_score > 0 else 0.0 for k, v in scores.items()}

        return scores
