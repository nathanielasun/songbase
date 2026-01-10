"""Base class for all audio feature extractors."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class ExtractionResult:
    """Result from a single feature extractor."""

    feature_name: str
    value: Any
    confidence: float = 1.0
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert result to dictionary."""
        return {
            "feature_name": self.feature_name,
            "value": self.value,
            "confidence": self.confidence,
            "metadata": self.metadata,
        }


class BaseExtractor(ABC):
    """Base class for all feature extractors."""

    def __init__(self, sample_rate: int = 22050):
        """
        Initialize the extractor.

        Args:
            sample_rate: Expected sample rate of input audio
        """
        self.sample_rate = sample_rate

    @abstractmethod
    def extract(self, audio: np.ndarray, sr: int) -> ExtractionResult:
        """
        Extract feature from audio signal.

        Args:
            audio: Audio signal as numpy array (mono, normalized)
            sr: Sample rate of the audio

        Returns:
            ExtractionResult with the extracted feature
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Feature name for database storage."""
        pass

    def preprocess(self, audio: np.ndarray) -> np.ndarray:
        """
        Optional preprocessing step.

        Args:
            audio: Raw audio signal

        Returns:
            Preprocessed audio signal
        """
        return audio

    def validate_audio(self, audio: np.ndarray) -> bool:
        """
        Validate that audio is suitable for extraction.

        Args:
            audio: Audio signal

        Returns:
            True if audio is valid
        """
        if audio is None or len(audio) == 0:
            return False
        if np.all(audio == 0):
            return False
        if not np.isfinite(audio).all():
            return False
        return True
