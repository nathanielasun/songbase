from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROCESSING_DIR = BASE_DIR.parent

# VGGish assets live locally under backend/processing/vggish.
VGGISH_DIR = PROCESSING_DIR / "vggish"
VGGISH_CHECKPOINT_PATH = VGGISH_DIR / "vggish_model.ckpt"
VGGISH_PCA_PARAMS_PATH = VGGISH_DIR / "vggish_pca_params.npz"

# Model versioning (set these explicitly when updating assets).
VGGISH_CHECKPOINT_VERSION = "sha256:0962b1914e3e053922d957c45bc84a78c985765641dc6bceeeb3a7d8dfecfdf6"
VGGISH_PCA_PARAMS_VERSION = "sha256:4d878af3e306defbfb37095365aa7e5a6cecb86bad13e859e626151c4e6a8b9d"

# Core audio configuration.
TARGET_SAMPLE_RATE = 16000
PCM_DTYPE = "float32"

# Example window/hop (VGGish embeddings cadence).
VGGISH_FRAME_SEC = 0.96
VGGISH_HOP_SEC = 0.48

# VGGish frontend configuration.
VGGISH_STFT_WINDOW_SEC = 0.025
VGGISH_STFT_HOP_SEC = 0.010
VGGISH_NUM_MEL_BINS = 64
VGGISH_MEL_MIN_HZ = 125
VGGISH_MEL_MAX_HZ = 7500
VGGISH_LOG_OFFSET = 0.01
VGGISH_EMBEDDING_SIZE = 128

VGGISH_FRAMES_PER_SECOND = int(round(1.0 / VGGISH_STFT_HOP_SEC))
VGGISH_EXAMPLES_PER_SECOND = int(round(1.0 / VGGISH_HOP_SEC))

VGGISH_INPUT_TENSOR_NAME = "vggish/input_features:0"
VGGISH_OUTPUT_TENSOR_NAME = "vggish/embedding:0"

EMBEDDING_EXTENSION = ".npz"
