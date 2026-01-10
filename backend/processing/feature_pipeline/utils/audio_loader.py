"""Audio loading and preprocessing utilities."""

from pathlib import Path
from typing import Optional, Tuple, Union

import numpy as np


class AudioLoadError(Exception):
    """Raised when audio loading fails."""

    pass


class AudioLoader:
    """Load and preprocess audio files for feature extraction."""

    SUPPORTED_FORMATS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma"}

    def __init__(
        self,
        target_sr: int = 22050,
        mono: bool = True,
        duration: Optional[float] = None,
        offset: float = 0.0,
    ):
        """
        Initialize audio loader.

        Args:
            target_sr: Target sample rate for resampling
            mono: Convert to mono if True
            duration: Maximum duration to load (None for full file)
            offset: Start time offset in seconds
        """
        self.target_sr = target_sr
        self.mono = mono
        self.duration = duration
        self.offset = offset

    def load(self, file_path: Union[str, Path]) -> Tuple[np.ndarray, int]:
        """
        Load audio file and return audio array with sample rate.

        Args:
            file_path: Path to audio file

        Returns:
            Tuple of (audio array, sample rate)

        Raises:
            AudioLoadError: If loading fails
        """
        import librosa

        file_path = Path(file_path)

        if not file_path.exists():
            raise AudioLoadError(f"File not found: {file_path}")

        if file_path.suffix.lower() not in self.SUPPORTED_FORMATS:
            raise AudioLoadError(
                f"Unsupported format: {file_path.suffix}. "
                f"Supported: {', '.join(self.SUPPORTED_FORMATS)}"
            )

        try:
            audio, sr = librosa.load(
                str(file_path),
                sr=self.target_sr,
                mono=self.mono,
                duration=self.duration,
                offset=self.offset,
            )

            # Validate loaded audio
            if len(audio) == 0:
                raise AudioLoadError(f"Empty audio file: {file_path}")

            return audio, sr

        except Exception as e:
            if isinstance(e, AudioLoadError):
                raise
            raise AudioLoadError(f"Failed to load {file_path}: {e}") from e

    def load_segment(
        self,
        file_path: Union[str, Path],
        start: float,
        end: float,
    ) -> Tuple[np.ndarray, int]:
        """
        Load a specific segment of an audio file.

        Args:
            file_path: Path to audio file
            start: Start time in seconds
            end: End time in seconds

        Returns:
            Tuple of (audio segment array, sample rate)
        """
        import librosa

        file_path = Path(file_path)

        if not file_path.exists():
            raise AudioLoadError(f"File not found: {file_path}")

        duration = end - start
        if duration <= 0:
            raise AudioLoadError(f"Invalid segment: start={start}, end={end}")

        try:
            audio, sr = librosa.load(
                str(file_path),
                sr=self.target_sr,
                mono=self.mono,
                duration=duration,
                offset=start,
            )

            return audio, sr

        except Exception as e:
            if isinstance(e, AudioLoadError):
                raise
            raise AudioLoadError(f"Failed to load segment from {file_path}: {e}") from e

    def get_duration(self, file_path: Union[str, Path]) -> float:
        """
        Get the duration of an audio file without loading it fully.

        Args:
            file_path: Path to audio file

        Returns:
            Duration in seconds
        """
        import librosa

        file_path = Path(file_path)

        if not file_path.exists():
            raise AudioLoadError(f"File not found: {file_path}")

        try:
            return librosa.get_duration(path=str(file_path))
        except Exception as e:
            raise AudioLoadError(f"Failed to get duration of {file_path}: {e}") from e

    @staticmethod
    def normalize_audio(audio: np.ndarray) -> np.ndarray:
        """
        Normalize audio to [-1, 1] range.

        Args:
            audio: Audio array

        Returns:
            Normalized audio array
        """
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            return audio / max_val
        return audio

    @staticmethod
    def trim_silence(
        audio: np.ndarray,
        sr: int,
        top_db: float = 30.0,
    ) -> Tuple[np.ndarray, Tuple[int, int]]:
        """
        Trim silence from beginning and end of audio.

        Args:
            audio: Audio array
            sr: Sample rate
            top_db: Threshold in dB below peak to consider silence

        Returns:
            Tuple of (trimmed audio, (start_sample, end_sample))
        """
        import librosa

        trimmed, index = librosa.effects.trim(audio, top_db=top_db)
        return trimmed, index
