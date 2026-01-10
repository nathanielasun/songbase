"""Musical key and mode detection from audio."""

import numpy as np

from .base import BaseExtractor, ExtractionResult


class KeyExtractor(BaseExtractor):
    """Extract musical key and mode from audio using chroma features."""

    name = "key"

    # Krumhansl-Schmuckler key profiles
    MAJOR_PROFILE = np.array(
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    )
    MINOR_PROFILE = np.array(
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    )

    # Key names (starting from C)
    KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    # Camelot wheel mapping (for DJ mixing)
    CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"]
    CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"]

    def extract(self, audio: np.ndarray, sr: int) -> ExtractionResult:
        """
        Extract musical key and mode from audio.

        Args:
            audio: Audio signal (mono)
            sr: Sample rate

        Returns:
            ExtractionResult with key, mode, camelot notation, and confidence
        """
        import librosa

        if not self.validate_audio(audio):
            return ExtractionResult(
                feature_name=self.name,
                value={"key": None, "mode": None, "camelot": None},
                confidence=0.0,
                metadata={"error": "Invalid audio"},
            )

        try:
            # Compute chromagram (pitch class distribution)
            chroma = librosa.feature.chroma_cqt(y=audio, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)

            # Normalize chroma vector
            chroma_norm = chroma_mean / (np.linalg.norm(chroma_mean) + 1e-10)

            # Correlate with all key profiles
            major_correlations = []
            minor_correlations = []

            for shift in range(12):
                major_profile_shifted = np.roll(self.MAJOR_PROFILE, shift)
                minor_profile_shifted = np.roll(self.MINOR_PROFILE, shift)

                # Normalize profiles
                major_norm = major_profile_shifted / np.linalg.norm(major_profile_shifted)
                minor_norm = minor_profile_shifted / np.linalg.norm(minor_profile_shifted)

                major_corr = np.corrcoef(chroma_norm, major_norm)[0, 1]
                minor_corr = np.corrcoef(chroma_norm, minor_norm)[0, 1]

                major_correlations.append(float(major_corr) if np.isfinite(major_corr) else 0.0)
                minor_correlations.append(float(minor_corr) if np.isfinite(minor_corr) else 0.0)

            # Find best match
            major_best = max(major_correlations)
            minor_best = max(minor_correlations)

            if major_best >= minor_best:
                key_idx = major_correlations.index(major_best)
                mode = "Major"
                confidence = major_best
                camelot = self.CAMELOT_MAJOR[key_idx]
            else:
                key_idx = minor_correlations.index(minor_best)
                mode = "Minor"
                confidence = minor_best
                camelot = self.CAMELOT_MINOR[key_idx]

            key_name = self.KEY_NAMES[key_idx]

            return ExtractionResult(
                feature_name=self.name,
                value={
                    "key": key_name,
                    "mode": mode,
                    "camelot": camelot,
                },
                confidence=round(max(0.0, min(1.0, confidence)), 2),
                metadata={
                    "chroma_profile": chroma_mean.tolist(),
                    "major_correlations": major_correlations,
                    "minor_correlations": minor_correlations,
                },
            )

        except Exception as e:
            return ExtractionResult(
                feature_name=self.name,
                value={"key": None, "mode": None, "camelot": None},
                confidence=0.0,
                metadata={"error": str(e)},
            )
