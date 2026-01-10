"""Acoustic vs Electronic and Instrumentalness detection from audio."""

import numpy as np

from .base import BaseExtractor, ExtractionResult


class AcousticExtractor(BaseExtractor):
    """Detect acoustic characteristics and vocal presence in audio."""

    name = "acoustic"

    def extract(self, audio: np.ndarray, sr: int) -> ExtractionResult:
        """
        Extract acoustic characteristics from audio.

        Returns:
        - acousticness: 0-100 (100 = fully acoustic, 0 = electronic)
        - instrumentalness: 0-100 (100 = no vocals, 0 = spoken word)

        Args:
            audio: Audio signal (mono)
            sr: Sample rate

        Returns:
            ExtractionResult with acousticness and instrumentalness scores
        """
        import librosa

        if not self.validate_audio(audio):
            return ExtractionResult(
                feature_name=self.name,
                value={"acousticness": None, "instrumentalness": None},
                confidence=0.0,
                metadata={"error": "Invalid audio"},
            )

        try:
            # Calculate acousticness
            acousticness, acoustic_features = self._calculate_acousticness(audio, sr)

            # Calculate instrumentalness (presence of vocals)
            instrumentalness, vocal_features = self._calculate_instrumentalness(audio, sr)

            return ExtractionResult(
                feature_name=self.name,
                value={
                    "acousticness": acousticness,
                    "instrumentalness": instrumentalness,
                },
                confidence=1.0,
                metadata={
                    "acoustic_features": acoustic_features,
                    "vocal_features": vocal_features,
                },
            )

        except Exception as e:
            return ExtractionResult(
                feature_name=self.name,
                value={"acousticness": None, "instrumentalness": None},
                confidence=0.0,
                metadata={"error": str(e)},
            )

    def _calculate_acousticness(self, audio: np.ndarray, sr: int) -> tuple[int, dict]:
        """
        Calculate acousticness score.

        Acoustic music tends to have:
        - Lower spectral flatness (more tonal content)
        - More harmonic content
        - Natural attack transients
        - Varied spectral bandwidth

        Args:
            audio: Audio signal
            sr: Sample rate

        Returns:
            Tuple of (score 0-100, feature dict)
        """
        import librosa

        # Spectral flatness (electronic music has higher flatness)
        flatness = librosa.feature.spectral_flatness(y=audio)[0]
        mean_flatness = float(np.mean(flatness))

        # Harmonic-to-noise ratio approximation
        harmonic, percussive = librosa.effects.hpss(audio)
        harmonic_energy = float(np.mean(np.abs(harmonic)))
        percussive_energy = float(np.mean(np.abs(percussive)))
        total_energy = harmonic_energy + percussive_energy + 1e-10
        harmonic_ratio = harmonic_energy / total_energy

        # Spectral bandwidth (acoustic tends to have more natural bandwidth)
        bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
        mean_bandwidth = float(np.mean(bandwidth))
        bandwidth_var = float(np.var(bandwidth))

        # Zero crossing rate (electronic often has very high or very low)
        zcr = librosa.feature.zero_crossing_rate(y=audio)[0]
        mean_zcr = float(np.mean(zcr))

        # Score calculation
        # Low flatness = more acoustic (tonal)
        flatness_score = 1.0 - min(1.0, mean_flatness * 10)

        # High harmonic ratio = more acoustic
        harmonic_score = harmonic_ratio

        # Moderate bandwidth variation = more acoustic
        bandwidth_score = min(1.0, bandwidth_var / 100000) if bandwidth_var < 500000 else 0.5

        # Moderate ZCR = more acoustic (very high or very low suggests electronic)
        if 0.02 < mean_zcr < 0.15:
            zcr_score = 1.0 - abs(mean_zcr - 0.08) * 10
        else:
            zcr_score = 0.3

        # Weighted combination
        acousticness = (
            0.35 * flatness_score
            + 0.30 * harmonic_score
            + 0.20 * bandwidth_score
            + 0.15 * zcr_score
        )

        score = int(round(acousticness * 100))
        score = max(0, min(100, score))

        features = {
            "spectral_flatness": mean_flatness,
            "harmonic_ratio": harmonic_ratio,
            "bandwidth_mean": mean_bandwidth,
            "bandwidth_var": bandwidth_var,
            "zcr_mean": mean_zcr,
        }

        return score, features

    def _calculate_instrumentalness(self, audio: np.ndarray, sr: int) -> tuple[int, dict]:
        """
        Calculate instrumentalness score (presence of vocals).

        Vocal content tends to have:
        - Energy in 80-300 Hz range (fundamental)
        - Energy in 300-3400 Hz range (formants)
        - Specific spectral patterns
        - Continuous pitch in vocal range

        Args:
            audio: Audio signal
            sr: Sample rate

        Returns:
            Tuple of (score 0-100, feature dict)
        """
        import librosa

        # Compute mel spectrogram
        mel_spec = librosa.feature.melspectrogram(
            y=audio, sr=sr, n_mels=128, fmax=8000
        )
        mel_db = librosa.power_to_db(mel_spec, ref=np.max)

        # Look at vocal frequency range (80-3400 Hz corresponds to mel bands ~5-60)
        # This is approximate and depends on mel scale parameters
        vocal_range = mel_db[5:60, :]
        non_vocal_range = np.vstack([mel_db[:5, :], mel_db[60:, :]])

        vocal_energy = float(np.mean(vocal_range))
        non_vocal_energy = float(np.mean(non_vocal_range))

        # Spectral contrast in vocal range
        spectral_contrast = librosa.feature.spectral_contrast(
            y=audio, sr=sr, n_bands=6
        )
        # Lower bands (vocals) vs higher bands
        lower_contrast = float(np.mean(spectral_contrast[:3, :]))
        upper_contrast = float(np.mean(spectral_contrast[3:, :]))

        # MFCC analysis - vocals have distinctive MFCC patterns
        mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
        # Variance in lower MFCCs indicates voice
        mfcc_var = float(np.var(mfccs[1:4, :]))

        # Pitch stability in vocal range
        pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
        # Look for stable pitches in vocal range (80-400 Hz)
        vocal_pitches = pitches[(pitches > 80) & (pitches < 400)]
        pitch_stability = 1.0 if len(vocal_pitches) > 0 else 0.5

        # Score calculation
        # High vocal range energy relative to non-vocal = likely vocals
        energy_ratio = 0.5
        if non_vocal_energy != 0:
            ratio = vocal_energy / non_vocal_energy
            energy_ratio = min(1.0, ratio / 1.5)

        # High MFCC variance in lower coefficients = likely vocals
        mfcc_score = min(1.0, mfcc_var / 50)

        # Higher lower contrast = more vocal presence
        contrast_score = min(1.0, lower_contrast / 25) if lower_contrast > 0 else 0.5

        # Combine scores (lower = more vocals = less instrumental)
        vocal_presence = (
            0.35 * energy_ratio
            + 0.30 * mfcc_score
            + 0.20 * contrast_score
            + 0.15 * (pitch_stability - 0.5) * 2
        )

        # Invert to get instrumentalness
        instrumentalness = 1.0 - vocal_presence

        score = int(round(instrumentalness * 100))
        score = max(0, min(100, score))

        features = {
            "vocal_energy": vocal_energy,
            "non_vocal_energy": non_vocal_energy,
            "mfcc_variance": mfcc_var,
            "lower_contrast": lower_contrast,
            "upper_contrast": upper_contrast,
            "vocal_presence_estimate": vocal_presence,
        }

        return score, features
