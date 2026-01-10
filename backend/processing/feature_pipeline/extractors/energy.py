"""Energy/intensity extraction from audio."""

import numpy as np

from .base import BaseExtractor, ExtractionResult


class EnergyExtractor(BaseExtractor):
    """Extract energy/intensity features from audio."""

    name = "energy"

    def __init__(
        self,
        sample_rate: int = 22050,
        rms_min: float = 0.0,
        rms_max: float = 0.3,
        centroid_min: float = 1000.0,
        centroid_max: float = 5000.0,
        onset_min: float = 0.0,
        onset_max: float = 2.0,
        flux_min: float = 0.0,
        flux_max: float = 1.0,
    ):
        """
        Initialize energy extractor.

        Args:
            sample_rate: Expected sample rate of input audio
            rms_min: Minimum RMS for normalization
            rms_max: Maximum RMS for normalization
            centroid_min: Minimum spectral centroid (Hz)
            centroid_max: Maximum spectral centroid (Hz)
            onset_min: Minimum onset rate
            onset_max: Maximum onset rate
            flux_min: Minimum spectral flux
            flux_max: Maximum spectral flux
        """
        super().__init__(sample_rate)
        self.rms_min = rms_min
        self.rms_max = rms_max
        self.centroid_min = centroid_min
        self.centroid_max = centroid_max
        self.onset_min = onset_min
        self.onset_max = onset_max
        self.flux_min = flux_min
        self.flux_max = flux_max

    def extract(self, audio: np.ndarray, sr: int) -> ExtractionResult:
        """
        Extract energy score from audio.

        Combines multiple features:
        - RMS energy (overall loudness)
        - Spectral centroid (brightness)
        - Onset rate (rhythmic activity)
        - Spectral flux (timbral variation)

        Args:
            audio: Audio signal (mono)
            sr: Sample rate

        Returns:
            ExtractionResult with energy score (0-100)
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
            # RMS energy (overall loudness)
            rms = librosa.feature.rms(y=audio)[0]
            rms_mean = float(np.mean(rms))
            rms_max = float(np.max(rms))
            rms_var = float(np.var(rms))

            # Spectral centroid (brightness/sharpness)
            spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
            centroid_mean = float(np.mean(spectral_centroid))

            # Onset rate (rhythmic activity)
            onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
            onset_rate = float(np.mean(onset_env))

            # Spectral flux (timbral variation)
            mel_spec = librosa.feature.melspectrogram(y=audio, sr=sr)
            spectral_flux = float(np.mean(np.abs(np.diff(mel_spec, axis=1))))

            # Normalize each component to 0-1 range
            norm_rms = self._normalize(rms_mean, self.rms_min, self.rms_max)
            norm_centroid = self._normalize(centroid_mean, self.centroid_min, self.centroid_max)
            norm_onset = self._normalize(onset_rate, self.onset_min, self.onset_max)
            norm_flux = self._normalize(spectral_flux, self.flux_min, self.flux_max)

            # Weighted combination
            energy_score = (
                0.4 * norm_rms
                + 0.3 * norm_centroid
                + 0.2 * norm_onset
                + 0.1 * norm_flux
            )

            # Scale to 0-100
            energy_0_100 = int(round(energy_score * 100))
            energy_0_100 = max(0, min(100, energy_0_100))

            # Calculate peak energy (highest moment)
            peak_idx = int(np.argmax(rms))
            peak_energy = int(round(self._normalize(float(rms[peak_idx]), self.rms_min, self.rms_max) * 100))

            return ExtractionResult(
                feature_name=self.name,
                value=energy_0_100,
                confidence=1.0,
                metadata={
                    "rms_mean": rms_mean,
                    "rms_max": rms_max,
                    "spectral_centroid_mean": centroid_mean,
                    "onset_rate": onset_rate,
                    "spectral_flux": spectral_flux,
                    "variance": rms_var,
                    "peak_energy": peak_energy,
                },
            )

        except Exception as e:
            return ExtractionResult(
                feature_name=self.name,
                value=None,
                confidence=0.0,
                metadata={"error": str(e)},
            )

    def _normalize(self, value: float, min_val: float, max_val: float) -> float:
        """
        Normalize value to 0-1 range.

        Args:
            value: Value to normalize
            min_val: Minimum expected value
            max_val: Maximum expected value

        Returns:
            Normalized value in 0-1 range
        """
        if max_val == min_val:
            return 0.5
        return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))
