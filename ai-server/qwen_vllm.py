"""
Sentti LLM server on Modal (app name money-coach-llm, kept from before the rename): Qwen3.6-35B-A3B (FP8) behind vLLM's
OpenAI-compatible "chat completions" API, with tool calling. Owner: AI person.

    modal deploy ai-server/qwen_vllm.py     # deploy / update (prints the URL)
    modal app stop money-coach-llm          # STOP it (stops the GPU bill)
    modal app logs money-coach-llm          # server logs

Then in .env.local:
    LLM_BASE_URL=https://<workspace>--money-coach-llm-qwen.modal.run/v1
    LLM_MODEL=qwen
    LLM_API_KEY=<the value stored in the Modal secret "money-coach-llm-key">

WHY this model: MoE with ~3B active params → fast answers on one GPU, and its
model card highlights tool calling (vLLM parser `qwen3_coder`). Qwen3.8-27B is
newer but dense (slower per token) and its card gives no tool-parser flags.

WHY min_containers=1: one GPU stays on 24/7 so users never wait for a cold
start (model load ≈ minutes). This costs money every hour, even when idle.
"""

import json
import subprocess

import modal

MINUTES = 60
PORT = 8000

MODEL_NAME = "Qwen/Qwen3.6-35B-A3B-FP8"
# WHY "qwen": short name for LLM_MODEL in .env.local; survives model swaps.
SERVED_NAME = "qwen"

image = (
    modal.Image.from_registry("nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    # Pinned to the versions in Modal's current vLLM example (card needs vllm>=0.19).
    .uv_pip_install("vllm==0.21.0", "transformers==5.8.1")
    .env({"HF_XET_HIGH_PERFORMANCE": "1"})
)

hf_cache = modal.Volume.from_name("huggingface-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("vllm-cache", create_if_missing=True)

app = modal.App("money-coach-llm")


@app.server(
    image=image,
    gpu="H100",
    min_containers=1,  # always warm — see WHY at the top
    scaledown_window=15 * MINUTES,
    startup_timeout=20 * MINUTES,  # first boot downloads ~35 GB of weights
    volumes={"/root/.cache/huggingface": hf_cache, "/root/.cache/vllm": vllm_cache},
    # WHY a secret: the endpoint is public, so vLLM itself checks
    # "Authorization: Bearer <VLLM_API_KEY>" (our client already sends it).
    secrets=[modal.Secret.from_name("money-coach-llm-key")],
    port=PORT,
    target_concurrency=32,
    unauthenticated=True,
)
class Qwen:
    @modal.enter()
    def start(self):
        cmd = [
            "vllm", "serve", MODEL_NAME,
            "--served-model-name", SERVED_NAME,
            "--host", "0.0.0.0",
            "--port", str(PORT),
            # Our prompt + 17 tool schemas + results fit easily; shorter = more KV room.
            "--max-model-len", "65536",
            "--language-model-only",  # text only: frees GPU memory for KV cache
            # Tool calling (required by lib/ai/chat.ts)
            "--enable-auto-tool-choice",
            "--tool-call-parser", "qwen3_coder",
            # If thinking is ever on, keep it out of the visible answer.
            "--reasoning-parser", "qwen3",
            # WHY thinking off by default: a phone chat needs answers in seconds;
            # the tools do the hard work. Per request it can be re-enabled.
            "--default-chat-template-kwargs", json.dumps({"enable_thinking": False}),
            # Model card's recommended non-thinking sampling.
            "--override-generation-config",
            json.dumps({"temperature": 0.7, "top_p": 0.8, "top_k": 20, "presence_penalty": 1.5}),
            # Multi-token prediction: faster decoding (from the model card).
            "--speculative-config",
            json.dumps({"method": "qwen3_next_mtp", "num_speculative_tokens": 2}),
        ]
        print(*cmd)
        self.process = subprocess.Popen(cmd)

    @modal.exit()
    def stop(self):
        self.process.terminate()
