"""Feature normalization utilities."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import numpy as np


@dataclass
class NormalizationConfig:
    """Configuration for feature normalization."""

    # BPM normalization
    bpm_min: float = 60.0
    bpm_max: float = 180.0

    # Energy normalization (RMS-based)
    energy_min: float = 0.0
    energy_max: float = 100.0

    # Danceability bounds
    danceability_min: float = 0.0
    danceability_max: float = 100.0

    # Acoustic features bounds
    acousticness_min: float = 0.0
    acousticness_max: float = 100.0
    instrumentalness_min: float = 0.0
    instrumentalness_max: float = 100.0


class FeatureNormalizer:
    """Normalize extracted features to consistent ranges."""

    def __init__(self, config: Optional[NormalizationConfig] = None):
        """
        Initialize normalizer.

        Args:
            config: Normalization configuration (uses defaults if None)
        """
        self.config = config or NormalizationConfig()

    def normalize_bpm(self, bpm: float) -> int:
        """
        Normalize BPM to standard range (60-180).

        Handles half-time and double-time by normalizing to the primary range.

        Args:
            bpm: Raw BPM value

        Returns:
            Normalized BPM as integer
        """
        if bpm <= 0:
            return 120  # Default

        # Normalize to 60-180 range
        while bpm < self.config.bpm_min:
            bpm *= 2
        while bpm > self.config.bpm_max:
            bpm /= 2

        return int(round(bpm))

    def normalize_score(
        self,
        value: float,
        min_val: float = 0.0,
        max_val: float = 100.0,
    ) -> int:
        """
        Normalize a score to 0-100 integer range.

        Args:
            value: Raw value
            min_val: Expected minimum
            max_val: Expected maximum

        Returns:
            Normalized score (0-100)
        """
        if max_val == min_val:
            return 50

        normalized = (value - min_val) / (max_val - min_val)
        score = int(round(normalized * 100))
        return max(0, min(100, score))

    def normalize_confidence(self, confidence: float) -> float:
        """
        Normalize confidence to 0-1 range.

        Args:
            confidence: Raw confidence value

        Returns:
            Normalized confidence (0.0-1.0)
        """
        return max(0.0, min(1.0, confidence))

    def normalize_features(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize a dictionary of extracted features.

        Args:
            features: Dictionary of raw feature values

        Returns:
            Dictionary with normalized values
        """
        normalized = {}

        for key, value in features.items():
            if value is None:
                normalized[key] = None
                continue

            if key == "bpm":
                normalized[key] = self.normalize_bpm(value)
            elif key in ("energy", "danceability", "acousticness", "instrumentalness"):
                # These are already 0-100 from extractors, just ensure bounds
                normalized[key] = max(0, min(100, int(round(value))))
            elif key == "key":
                # Key dict passes through
                normalized[key] = value
            elif key == "mood":
                # Mood dict passes through
                normalized[key] = value
            elif key == "confidence":
                normalized[key] = self.normalize_confidence(value)
            else:
                normalized[key] = value

        return normalized

    @staticmethod
    def z_score_normalize(
        values: np.ndarray,
        mean: Optional[float] = None,
        std: Optional[float] = None,
    ) -> np.ndarray:
        """
        Apply z-score normalization.

        Args:
            values: Array of values
            mean: Pre-computed mean (or None to compute)
            std: Pre-computed std (or None to compute)

        Returns:
            Z-score normalized values
        """
        if mean is None:
            mean = np.mean(values)
        if std is None:
            std = np.std(values)

        if std == 0:
            return np.zeros_like(values)

        return (values - mean) / std

    @staticmethod
    def min_max_normalize(
        values: np.ndarray,
        min_val: Optional[float] = None,
        max_val: Optional[float] = None,
    ) -> np.ndarray:
        """
        Apply min-max normalization to 0-1 range.

        Args:
            values: Array of values
            min_val: Pre-computed min (or None to compute)
            max_val: Pre-computed max (or None to compute)

        Returns:
            Min-max normalized values (0-1)
        """
        if min_val is None:
            min_val = np.min(values)
        if max_val is None:
            max_val = np.max(values)

        if max_val == min_val:
            return np.full_like(values, 0.5)

        return (values - min_val) / (max_val - min_val)
