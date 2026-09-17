#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export OLLAMA_HOST=127.0.0.1:11435
export OLLAMA_MODELS="$project_root/local_asset/models"
export OLLAMA_NO_CLOUD=1
# Default to CPU so existing shared GPU workloads are not displaced.
export CUDA_VISIBLE_DEVICES="${OSH_OLLAMA_GPU:--1}"
export GGML_VK_VISIBLE_DEVICES="${OSH_OLLAMA_GPU:--1}"
export HIP_VISIBLE_DEVICES="${OSH_OLLAMA_GPU:--1}"
export OLLAMA_CONTEXT_LENGTH=4096
exec "$project_root/local_asset/runtime/bin/ollama" serve
