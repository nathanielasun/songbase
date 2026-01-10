# Audio Feature Extraction Pipeline
# Extracts BPM, key, energy, mood, danceability, and acoustic features from audio files

from .config import FeatureConfig
from .extractors import (
    BaseExtractor,
    ExtractionResult,
    BPMExtractor,
    KeyExtractor,
    EnergyExtractor,
    MoodExtractor,
    DanceabilityExtractor,
    AcousticExtractor,
)
from .pipeline import FeaturePipeline, extract_features
from .utils import AudioLoader, AudioLoadError, FeatureNormalizer, FeatureAggregator
from .utils.aggregation import AggregatedFeatures

__all__ = [
    # Config
    "FeatureConfig",
    # Pipeline
    "FeaturePipeline",
    "extract_features",
    # Extractors
    "BaseExtractor",
    "ExtractionResult",
    "BPMExtractor",
    "KeyExtractor",
    "EnergyExtractor",
    "MoodExtractor",
    "DanceabilityExtractor",
    "AcousticExtractor",
    # Utils
    "AudioLoader",
    "AudioLoadError",
    "FeatureNormalizer",
    "FeatureAggregator",
    "AggregatedFeatures",
]

ANALYZER_VERSION = "1.0.0"
