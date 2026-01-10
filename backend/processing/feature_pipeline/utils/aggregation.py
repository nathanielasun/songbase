"""Feature aggregation utilities for combining extraction results."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..extractors.base import ExtractionResult


@dataclass
class AggregatedFeatures:
    """Container for aggregated feature extraction results."""

    # Core features
    bpm: Optional[int] = None
    key: Optional[str] = None
    mode: Optional[str] = None
    camelot: Optional[str] = None
    energy: Optional[int] = None
    danceability: Optional[int] = None
    acousticness: Optional[int] = None
    instrumentalness: Optional[int] = None
    primary_mood: Optional[str] = None
    secondary_mood: Optional[str] = None

    # Confidence scores
    confidence: Dict[str, float] = field(default_factory=dict)

    # Raw metadata from extractors
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Overall extraction status
    success: bool = True
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage."""
        return {
            "bpm": self.bpm,
            "key": self.key,
            "mode": self.mode,
            "camelot": self.camelot,
            "energy": self.energy,
            "danceability": self.danceability,
            "acousticness": self.acousticness,
            "instrumentalness": self.instrumentalness,
            "primary_mood": self.primary_mood,
            "secondary_mood": self.secondary_mood,
            "confidence": self.confidence,
            "success": self.success,
            "errors": self.errors,
        }

    def to_db_columns(self) -> Dict[str, Any]:
        """Convert to flat dictionary matching database columns."""
        return {
            "bpm": self.bpm,
            "key": self.key,
            "mode": self.mode,
            "camelot": self.camelot,
            "energy": self.energy,
            "danceability": self.danceability,
            "acousticness": self.acousticness,
            "instrumentalness": self.instrumentalness,
            "mood": self.primary_mood,
        }


class FeatureAggregator:
    """Aggregate results from multiple feature extractors."""

    def aggregate(self, results: List[ExtractionResult]) -> AggregatedFeatures:
        """
        Aggregate extraction results into unified feature set.

        Args:
            results: List of ExtractionResult from various extractors

        Returns:
            AggregatedFeatures with all extracted values
        """
        aggregated = AggregatedFeatures()
        confidence = {}
        metadata = {}
        errors = []

        for result in results:
            # Store metadata
            metadata[result.feature_name] = result.metadata

            # Handle extraction errors
            if result.confidence == 0.0 and "error" in result.metadata:
                errors.append(f"{result.feature_name}: {result.metadata['error']}")
                continue

            # Store confidence
            confidence[result.feature_name] = result.confidence

            # Map features based on extractor name
            if result.feature_name == "bpm":
                aggregated.bpm = result.value

            elif result.feature_name == "key":
                if isinstance(result.value, dict):
                    aggregated.key = result.value.get("key")
                    aggregated.mode = result.value.get("mode")
                    aggregated.camelot = result.value.get("camelot")

            elif result.feature_name == "energy":
                aggregated.energy = result.value

            elif result.feature_name == "danceability":
                aggregated.danceability = result.value

            elif result.feature_name == "acoustic":
                if isinstance(result.value, dict):
                    aggregated.acousticness = result.value.get("acousticness")
                    aggregated.instrumentalness = result.value.get("instrumentalness")

            elif result.feature_name == "mood":
                if isinstance(result.value, dict):
                    aggregated.primary_mood = result.value.get("primary")
                    aggregated.secondary_mood = result.value.get("secondary")

        aggregated.confidence = confidence
        aggregated.metadata = metadata
        aggregated.errors = errors
        aggregated.success = len(errors) == 0

        return aggregated

    def merge_aggregated(
        self,
        *aggregated_list: AggregatedFeatures,
    ) -> AggregatedFeatures:
        """
        Merge multiple AggregatedFeatures, preferring higher confidence values.

        Useful for combining results from different processing passes.

        Args:
            *aggregated_list: Multiple AggregatedFeatures to merge

        Returns:
            Merged AggregatedFeatures
        """
        if len(aggregated_list) == 0:
            return AggregatedFeatures()

        if len(aggregated_list) == 1:
            return aggregated_list[0]

        merged = AggregatedFeatures()
        all_confidence = {}

        for agg in aggregated_list:
            # Merge BPM (prefer higher confidence)
            if agg.bpm is not None:
                bpm_conf = agg.confidence.get("bpm", 0)
                if merged.bpm is None or bpm_conf > all_confidence.get("bpm", 0):
                    merged.bpm = agg.bpm
                    all_confidence["bpm"] = bpm_conf

            # Merge key/mode/camelot
            if agg.key is not None:
                key_conf = agg.confidence.get("key", 0)
                if merged.key is None or key_conf > all_confidence.get("key", 0):
                    merged.key = agg.key
                    merged.mode = agg.mode
                    merged.camelot = agg.camelot
                    all_confidence["key"] = key_conf

            # Merge energy
            if agg.energy is not None:
                energy_conf = agg.confidence.get("energy", 0)
                if merged.energy is None or energy_conf > all_confidence.get("energy", 0):
                    merged.energy = agg.energy
                    all_confidence["energy"] = energy_conf

            # Merge danceability
            if agg.danceability is not None:
                dance_conf = agg.confidence.get("danceability", 0)
                if merged.danceability is None or dance_conf > all_confidence.get("danceability", 0):
                    merged.danceability = agg.danceability
                    all_confidence["danceability"] = dance_conf

            # Merge acoustic features
            if agg.acousticness is not None:
                acoustic_conf = agg.confidence.get("acoustic", 0)
                if merged.acousticness is None or acoustic_conf > all_confidence.get("acoustic", 0):
                    merged.acousticness = agg.acousticness
                    merged.instrumentalness = agg.instrumentalness
                    all_confidence["acoustic"] = acoustic_conf

            # Merge mood
            if agg.primary_mood is not None:
                mood_conf = agg.confidence.get("mood", 0)
                if merged.primary_mood is None or mood_conf > all_confidence.get("mood", 0):
                    merged.primary_mood = agg.primary_mood
                    merged.secondary_mood = agg.secondary_mood
                    all_confidence["mood"] = mood_conf

            # Collect errors
            merged.errors.extend(agg.errors)

        merged.confidence = all_confidence
        merged.success = len(merged.errors) == 0

        return merged
