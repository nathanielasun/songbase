"""Configuration for audio feature extraction pipeline."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FeatureConfig:
    """Configuration settings for feature extraction."""

    # Audio loading settings
    sample_rate: int = 22050
    mono: bool = True

    # BPM detection settings
    bpm_min: float = 60.0
    bpm_max: float = 180.0
    bpm_start_prior: float = 120.0

    # Key detection settings
    use_camelot: bool = True

    # Energy normalization bounds
    energy_rms_min: float = 0.0
    energy_rms_max: float = 0.3
    energy_centroid_min: float = 1000.0
    energy_centroid_max: float = 5000.0
    energy_onset_min: float = 0.0
    energy_onset_max: float = 2.0
    energy_flux_min: float = 0.0
    energy_flux_max: float = 1.0

    # Weights for energy calculation
    energy_weights: dict = field(
        default_factory=lambda: {
            "rms": 0.4,
            "centroid": 0.3,
            "onset": 0.2,
            "flux": 0.1,
        }
    )

    # Weights for danceability calculation
    danceability_weights: dict = field(
        default_factory=lambda: {
            "beat_strength": 0.4,
            "tempo_stability": 0.3,
            "rhythmic_regularity": 0.2,
            "groove": 0.1,
        }
    )

    # Mood thresholds
    mood_tempo_fast: float = 120.0
    mood_tempo_slow: float = 90.0
    mood_energy_high: float = 0.15
    mood_energy_low: float = 0.1

    # Extractors to run (can disable individual extractors)
    extractors: dict = field(
        default_factory=lambda: {
            "bpm": True,
            "key": True,
            "energy": True,
            "mood": True,
            "danceability": True,
            "acoustic": True,
        }
    )

    def to_dict(self) -> dict[str, Any]:
        """Convert config to dictionary."""
        return {
            "sample_rate": self.sample_rate,
            "mono": self.mono,
            "bpm_min": self.bpm_min,
            "bpm_max": self.bpm_max,
            "extractors": self.extractors,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FeatureConfig":
        """Create config from dictionary."""
        return cls(**{k: v for k, v in data.items() if hasattr(cls, k)})
