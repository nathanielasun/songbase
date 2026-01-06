from __future__ import annotations

from pathlib import Path
from typing import Optional

from . import config

try:
    from .. import dependencies
except ImportError:
    import dependencies
from .embedding import embed_examples, pcm_to_examples
from .io import load_wav
from .preprocessing import resample, to_mono
from .vggish_model import VggishModel, load_vggish_model

_VGGISH_MODEL: Optional[VggishModel] = None


def get_vggish_model() -> VggishModel:
    global _VGGISH_MODEL
    if _VGGISH_MODEL is None:
        dependencies.ensure_dependencies(["vggish_source", "vggish_assets"])
        _VGGISH_MODEL = load_vggish_model()
    return _VGGISH_MODEL


def embed_wav_file(path):
    audio, sr = load_wav(path)
    audio = to_mono(audio)
    audio = resample(audio, sr, config.TARGET_SAMPLE_RATE)

    model = get_vggish_model()
    examples = pcm_to_examples(audio, config.TARGET_SAMPLE_RATE)
    embeddings = embed_examples(model, examples)

    return embeddings


def embedding_metadata() -> dict:
    model = get_vggish_model()
    return dict(model.metadata)


def output_path_for_wav(input_dir: Path, output_dir: Path, wav_path: Path) -> Path:
    relative_path = wav_path.relative_to(input_dir)
    return (output_dir / relative_path).with_suffix(config.EMBEDDING_EXTENSION)
