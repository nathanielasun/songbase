"""BPM (tempo) extraction from audio."""

import numpy as np

from .base import BaseExtractor, ExtractionResult


class BPMExtractor(BaseExtractor):
    """Extract tempo (BPM) from audio using beat tracking."""

    name = "bpm"

    def __init__(self, sample_rate: int = 22050, min_bpm: float = 60, max_bpm: float = 180):
        """
        Initialize BPM extractor.

        Args:
            sample_rate: Expected sample rate of input audio
            min_bpm: Minimum BPM for normalization (default 60)
            max_bpm: Maximum BPM for normalization (default 180)
        """
        super().__init__(sample_rate)
        self.min_bpm = min_bpm
        self.max_bpm = max_bpm

    def extract(self, audio: np.ndarray, sr: int) -> ExtractionResult:
        """
        Extract BPM from audio.

        Args:
            audio: Audio signal (mono)
            sr: Sample rate

        Returns:
            ExtractionResult with BPM value and confidence
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
            # Get onset envelope for beat tracking
            onset_env = librosa.onset.onset_strength(y=audio, sr=sr)

            # Compute tempo with prior centered around 120 BPM
            tempo, beat_frames = librosa.beat.beat_track(
                onset_envelope=onset_env,
                sr=sr,
                start_bpm=120,
                units="frames",
            )

            # Handle librosa returning array vs scalar
            if hasattr(tempo, "__len__"):
                tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
            else:
                tempo = float(tempo)

            # Get tempo histogram for confidence calculation
            try:
                tempo_histogram = librosa.beat.tempo(
                    onset_envelope=onset_env,
                    sr=sr,
                    aggregate=None,
                )
                if hasattr(tempo_histogram, "__len__") and len(tempo_histogram) > 0:
                    hist_std = np.std(tempo_histogram)
                    confidence = max(0.0, min(1.0, 1.0 - (hist_std / 30.0)))
                    top_tempos = sorted(tempo_histogram.tolist(), reverse=True)[:5]
                else:
                    confidence = 0.5
                    top_tempos = []
            except Exception:
                confidence = 0.5
                top_tempos = []

            # Normalize tempo to 60-180 range (handle half/double time)
            normalized_tempo = self._normalize_tempo(tempo)

            return ExtractionResult(
                feature_name=self.name,
                value=round(normalized_tempo, 1),
                confidence=round(confidence, 2),
                metadata={
                    "raw_tempo": float(tempo),
                    "histogram_top": top_tempos,
                    "beat_count": len(beat_frames),
                },
            )

        except Exception as e:
            return ExtractionResult(
                feature_name=self.name,
                value=None,
                confidence=0.0,
                metadata={"error": str(e)},
            )

    def _normalize_tempo(self, tempo: float) -> float:
        """
        Normalize tempo to 60-180 BPM range.

        Handles half-time and double-time detection by folding
        tempos outside the normal range.

        Args:
            tempo: Raw tempo value

        Returns:
            Normalized tempo in 60-180 range
        """
        while tempo < self.min_bpm:
            tempo *= 2
        while tempo > self.max_bpm:
            tempo /= 2
        return tempo
