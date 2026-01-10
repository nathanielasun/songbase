"""Main feature extraction pipeline orchestration."""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Type, Union

import numpy as np

from .config import FeatureConfig
from .extractors import (
    AcousticExtractor,
    BaseExtractor,
    BPMExtractor,
    DanceabilityExtractor,
    EnergyExtractor,
    ExtractionResult,
    KeyExtractor,
    MoodExtractor,
)
from .utils import AudioLoader, AudioLoadError, FeatureAggregator, FeatureNormalizer
from .utils.aggregation import AggregatedFeatures

logger = logging.getLogger(__name__)


class FeaturePipeline:
    """
    Main feature extraction pipeline.

    Orchestrates loading audio, running extractors, and aggregating results.
    """

    # Default extractors to run
    DEFAULT_EXTRACTORS: List[Type[BaseExtractor]] = [
        BPMExtractor,
        KeyExtractor,
        EnergyExtractor,
        MoodExtractor,
        DanceabilityExtractor,
        AcousticExtractor,
    ]

    def __init__(
        self,
        config: Optional[FeatureConfig] = None,
        extractors: Optional[List[Type[BaseExtractor]]] = None,
    ):
        """
        Initialize the feature extraction pipeline.

        Args:
            config: Feature extraction configuration
            extractors: List of extractor classes to use (None for defaults)
        """
        self.config = config or FeatureConfig()
        self.loader = AudioLoader(target_sr=self.config.sample_rate)
        self.normalizer = FeatureNormalizer()
        self.aggregator = FeatureAggregator()

        # Initialize extractors
        extractor_classes = extractors or self.DEFAULT_EXTRACTORS
        self.extractors = [cls(self.config.sample_rate) for cls in extractor_classes]

        logger.info(
            f"Initialized FeaturePipeline with {len(self.extractors)} extractors: "
            f"{[e.name for e in self.extractors]}"
        )

    def extract_from_file(
        self,
        file_path: Union[str, Path],
        include_metadata: bool = False,
    ) -> AggregatedFeatures:
        """
        Extract features from an audio file.

        Args:
            file_path: Path to audio file
            include_metadata: Whether to include detailed metadata

        Returns:
            AggregatedFeatures with extracted values
        """
        file_path = Path(file_path)
        logger.info(f"Extracting features from: {file_path}")

        try:
            # Load audio
            audio, sr = self.loader.load(file_path)
            logger.debug(f"Loaded audio: {len(audio)} samples at {sr}Hz")

            # Trim silence for better analysis
            audio, _ = self.loader.trim_silence(audio, sr)

            # Run extraction
            features = self.extract_from_array(audio, sr, include_metadata)

            # Add file info to metadata
            if include_metadata:
                features.metadata["file"] = {
                    "path": str(file_path),
                    "duration": len(audio) / sr,
                    "sample_rate": sr,
                }

            return features

        except AudioLoadError as e:
            logger.error(f"Failed to load audio: {e}")
            return AggregatedFeatures(
                success=False,
                errors=[str(e)],
            )
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            return AggregatedFeatures(
                success=False,
                errors=[f"Extraction failed: {e}"],
            )

    def extract_from_array(
        self,
        audio: np.ndarray,
        sr: int,
        include_metadata: bool = False,
    ) -> AggregatedFeatures:
        """
        Extract features from an audio array.

        Args:
            audio: Audio signal (mono)
            sr: Sample rate
            include_metadata: Whether to include detailed metadata

        Returns:
            AggregatedFeatures with extracted values
        """
        results: List[ExtractionResult] = []

        for extractor in self.extractors:
            try:
                logger.debug(f"Running {extractor.name} extractor")
                result = extractor.extract(audio, sr)
                results.append(result)
                logger.debug(
                    f"{extractor.name}: value={result.value}, confidence={result.confidence}"
                )
            except Exception as e:
                logger.error(f"Extractor {extractor.name} failed: {e}")
                results.append(
                    ExtractionResult(
                        feature_name=extractor.name,
                        value=None,
                        confidence=0.0,
                        metadata={"error": str(e)},
                    )
                )

        # Aggregate results
        aggregated = self.aggregator.aggregate(results)

        # Clear metadata if not requested
        if not include_metadata:
            aggregated.metadata = {}

        return aggregated

    def extract_single(
        self,
        file_path: Union[str, Path],
        extractor_name: str,
    ) -> Optional[ExtractionResult]:
        """
        Run a single extractor on an audio file.

        Args:
            file_path: Path to audio file
            extractor_name: Name of extractor to run

        Returns:
            ExtractionResult or None if extractor not found
        """
        extractor = next(
            (e for e in self.extractors if e.name == extractor_name),
            None,
        )

        if extractor is None:
            logger.error(f"Extractor not found: {extractor_name}")
            return None

        try:
            audio, sr = self.loader.load(file_path)
            return extractor.extract(audio, sr)
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            return ExtractionResult(
                feature_name=extractor_name,
                value=None,
                confidence=0.0,
                metadata={"error": str(e)},
            )

    def batch_extract(
        self,
        file_paths: List[Union[str, Path]],
        include_metadata: bool = False,
        progress_callback: Optional[callable] = None,
    ) -> Dict[str, AggregatedFeatures]:
        """
        Extract features from multiple files.

        Args:
            file_paths: List of paths to audio files
            include_metadata: Whether to include detailed metadata
            progress_callback: Optional callback(current, total, file_path)

        Returns:
            Dictionary mapping file paths to AggregatedFeatures
        """
        results = {}
        total = len(file_paths)

        for i, file_path in enumerate(file_paths):
            file_path = Path(file_path)

            if progress_callback:
                progress_callback(i + 1, total, str(file_path))

            logger.info(f"Processing {i + 1}/{total}: {file_path.name}")
            results[str(file_path)] = self.extract_from_file(
                file_path, include_metadata
            )

        return results

    def get_extractor_names(self) -> List[str]:
        """Get list of available extractor names."""
        return [e.name for e in self.extractors]


def extract_features(
    file_path: Union[str, Path],
    config: Optional[FeatureConfig] = None,
) -> Dict[str, Any]:
    """
    Convenience function to extract features from a single file.

    Args:
        file_path: Path to audio file
        config: Optional configuration

    Returns:
        Dictionary of extracted features for database storage
    """
    pipeline = FeaturePipeline(config=config)
    features = pipeline.extract_from_file(file_path)
    return features.to_db_columns()
