# GPU/Metal Acceleration for VGGish Embeddings

This document describes GPU and Metal acceleration support for VGGish audio embedding generation.

## Overview

VGGish embedding generation can leverage hardware acceleration for improved performance:
- **Metal GPU** on Apple Silicon Macs (M1/M2/M3)
- **NVIDIA CUDA GPUs** on Linux/Windows
- **CPU fallback** when no GPU is available

## Quick Start

### Test GPU Detection

Run the detection test to see what devices are available on your system:

```bash
python backend/processing/audio_pipeline/test_gpu_detection.py
```

### Enable Metal on macOS (Apple Silicon)

For Apple Silicon Macs (M1/M2/M3), tensorflow-metal is auto-installed by `bootstrap.py`.

**Important:** tensorflow-metal requires TensorFlow 2.13-2.17. The `requirements.txt` pins TensorFlow to `>=2.16.0,<2.18.0` for compatibility.

To manually install:

```bash
pip install tensorflow-metal
```

**Note:** tensorflow-metal works as a TensorFlow plugin and is loaded automatically when TensorFlow initializes. You cannot import it directly as a Python module.

### Enable CUDA on Linux/Windows

TensorFlow 2.x includes built-in CUDA support. Ensure you have:
1. CUDA Toolkit installed (compatible version with TensorFlow)
2. cuDNN library installed
3. NVIDIA GPU with CUDA support

No additional Python packages required.

## Configuration

### Config File (`config.py`)

Configure device preferences in `backend/processing/audio_pipeline/config.py`:

```python
# Device preference: "auto", "cpu", "gpu", "metal"
VGGISH_DEVICE_PREFERENCE = "auto"

# GPU memory fraction (0.0 to 1.0)
VGGISH_GPU_MEMORY_FRACTION = 0.8

# Allow GPU memory to grow dynamically
VGGISH_GPU_ALLOW_GROWTH = True
```

### Device Preference Options

- **`"auto"`** (default): Automatically selects best available device
  - Priority: Metal > GPU > CPU
  - Recommended for most users

- **`"cpu"`**: Forces CPU usage
  - Use when you want to reserve GPU for other tasks
  - More consistent but slower performance

- **`"gpu"`**: Use NVIDIA CUDA GPU
  - Only works on systems with NVIDIA GPUs
  - Falls back to CPU if unavailable

- **`"metal"`**: Use Apple Metal GPU
  - Only works on Apple Silicon Macs with tensorflow-metal installed
  - Falls back to CPU if unavailable

### GPU Memory Management

**`VGGISH_GPU_MEMORY_FRACTION`** (default: 0.8)
- Fraction of total GPU memory to allocate
- Range: 0.0 to 1.0
- Lower values leave more memory for other applications
- Only applies when using GPU/Metal

**`VGGISH_GPU_ALLOW_GROWTH`** (default: True)
- When True: TensorFlow allocates memory dynamically as needed
- When False: TensorFlow allocates all memory upfront
- Recommended: True for better memory sharing

## Programmatic Usage

### Load Model with Custom Device

```python
from backend.processing.audio_pipeline.vggish_model import load_vggish_model

# Use auto-detection
model = load_vggish_model()

# Force CPU
model = load_vggish_model(device_preference="cpu")

# Use Metal (if available)
model = load_vggish_model(
    device_preference="metal",
    gpu_memory_fraction=0.7,
    gpu_allow_growth=True
)

# Use NVIDIA GPU with specific memory settings
model = load_vggish_model(
    device_preference="gpu",
    gpu_memory_fraction=0.5,
    gpu_allow_growth=False
)
```

### Check Available Devices

```python
from backend.processing.audio_pipeline.device_config import (
    detect_available_devices,
    log_device_info
)

# Get list of available devices
devices = detect_available_devices()

for device in devices:
    print(f"{device.device_type.value}: {device.available}")

# Log device info
log_device_info()
```

## Performance Expectations

### Typical Speedup (compared to CPU)

- **Apple Silicon Metal**: 2-4x faster
- **NVIDIA GPU (e.g., RTX 3080)**: 3-6x faster
- **CPU**: Baseline performance

Actual performance depends on:
- Hardware specifications
- Batch size
- Audio file length
- Other system load

### Benchmarking

To benchmark embedding generation on your system:

```python
import time
from backend.processing.audio_pipeline.pipeline import embed_wav_file

start = time.time()
embeddings = embed_wav_file("path/to/audio.wav")
elapsed = time.time() - start

print(f"Generated {len(embeddings)} embeddings in {elapsed:.2f}s")
print(f"Rate: {len(embeddings)/elapsed:.1f} embeddings/sec")
```

Run this with different device preferences to compare performance.

## Troubleshooting

### Metal Not Detected on Apple Silicon

**Symptoms:**
- Test script shows Metal as unavailable
- Using CPU despite having Apple Silicon Mac

**Solutions:**
1. Install tensorflow-metal:
   ```bash
   pip install tensorflow-metal
   ```

2. Verify installation:
   ```bash
   pip list | grep tensorflow-metal
   ```

3. Check TensorFlow version compatibility:
   - tensorflow-metal requires TensorFlow 2.13-2.17
   - TensorFlow 2.18+ has compatibility issues with tensorflow-metal
   - Check with: `pip show tensorflow`
   - To install compatible version: `pip install 'tensorflow>=2.16.0,<2.18.0'`

### CUDA GPU Not Detected

**Symptoms:**
- Test script shows GPU as unavailable
- Have NVIDIA GPU but using CPU

**Solutions:**
1. Verify CUDA installation:
   ```bash
   nvidia-smi  # Should show GPU info
   ```

2. Check TensorFlow CUDA support:
   ```python
   import tensorflow as tf
   print(tf.config.list_physical_devices('GPU'))
   print(tf.test.is_built_with_cuda())
   ```

3. Ensure CUDA version matches TensorFlow requirements

### Out of Memory Errors

**Symptoms:**
- Crashes or errors during embedding generation
- "Out of memory" messages

**Solutions:**
1. Reduce GPU memory fraction:
   ```python
   VGGISH_GPU_MEMORY_FRACTION = 0.5  # or lower
   ```

2. Enable memory growth:
   ```python
   VGGISH_GPU_ALLOW_GROWTH = True
   ```

3. Process smaller batches
4. Close other GPU-intensive applications
5. Fall back to CPU if necessary

### TensorFlow v1 Compatibility Warnings

**Symptoms:**
- Deprecation warnings about TensorFlow v1 APIs

**Note:**
- These warnings are expected and harmless
- VGGish model requires TensorFlow v1 compatibility mode
- GPU/Metal acceleration still works correctly
- Warnings can be suppressed in `bootstrap.py`

## Technical Details

### TensorFlow v1 Compatibility

VGGish uses TensorFlow v1 checkpoint format and APIs. The implementation uses:
- `tensorflow.compat.v1` for backward compatibility
- TensorFlow 2.x backend for Metal/GPU support
- Session-based execution model

### Metal Plugin Architecture

Metal acceleration uses the tensorflow-metal plugin:
- Installed separately from TensorFlow
- Loaded automatically when available
- Transparent to application code
- Only works on Apple Silicon (arm64)

### Device Selection Algorithm

Auto-selection logic in `device_config.py`:

```python
def select_device():
    if metal_available and on_apple_silicon:
        return "metal"
    elif cuda_gpu_available:
        return "gpu"
    else:
        return "cpu"
```

### Session Configuration

GPU/Metal configuration is applied via `tf.ConfigProto`:
- `gpu_options.allow_growth`: Dynamic memory allocation
- `gpu_options.per_process_gpu_memory_fraction`: Memory limit
- `device_count`: Enable/disable GPU usage
- `allow_soft_placement`: Automatic fallback to CPU

## Future Improvements

Potential enhancements for consideration:
- [ ] Multi-GPU support for parallel batch processing
- [ ] TensorFlow 2.x native model conversion (better Metal support)
- [ ] Batch size auto-tuning based on available memory
- [ ] Performance monitoring and logging
- [ ] Dynamic device switching based on load

## References

- [TensorFlow GPU Guide](https://www.tensorflow.org/guide/gpu)
- [tensorflow-metal Plugin](https://developer.apple.com/metal/tensorflow-plugin/)
- [VGGish Model](https://github.com/tensorflow/models/tree/master/research/audioset/vggish)
- [CUDA Installation Guide](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/)
