"""Turn a request into a part spec: local Ollama first, cloud fallback, keyword fallback.

The LLM never emits geometry. It picks one catalog part and fills parameters in
millimetres; catalog.clamp() bounds everything before OpenSCAD runs.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from typing import Any

import httpx

from .catalog import PARTS, all_param_names, catalog_text

log = logging.getLogger("forge.llm")

OLLAMA_URL = os.environ.get("FORGE_OLLAMA_URL", "http://127.0.0.1:11434")
# One small model, pinned in memory: alternating between a 27B and a 4B model made Ollama reload on
# every request on the box (2 GB dedicated VRAM + shared memory), which is what the 12-second Lens
# timeout cannot absorb. The catalog is simple enough for a 4B model; the keyword fallback covers the rest.
OLLAMA_MODELS = [m.strip() for m in os.environ.get("FORGE_OLLAMA_MODELS", "qwen3:4b").split(",") if m.strip()]
OLLAMA_KEEP_ALIVE = os.environ.get("FORGE_OLLAMA_KEEP_ALIVE", "-1")  # -1 = never evict
CLOUD_BASE_URL = os.environ.get("FORGE_CLOUD_BASE_URL", "")  # OpenAI-compatible, e.g. https://api.openai.com/v1
CLOUD_API_KEY = os.environ.get("FORGE_CLOUD_API_KEY", "")
CLOUD_MODEL = os.environ.get("FORGE_CLOUD_MODEL", "gpt-4o-mini")
# The Lens gives up at 15 s and the OpenSCAD render needs 1-2 s, so the model gets at most ~8 s.
# Anything slower falls through to the keyword designer, which answers in milliseconds.
LLM_TIMEOUT = float(os.environ.get("FORGE_LLM_TIMEOUT", "8"))
NUM_CTX = int(os.environ.get("FORGE_NUM_CTX", "8192"))  # KV cache size; keep small or Ollama eats RAM
PS_TIMEOUT = 1.5  # seconds for the "is the model resident?" probe

_warm_lock = threading.Lock()
_warm_thread: threading.Thread | None = None
LAST_WARM: dict[str, Any] = {}


def _keep_alive() -> int | str:
    try:
        return int(OLLAMA_KEEP_ALIVE)
    except ValueError:
        return OLLAMA_KEEP_ALIVE


def primary_model() -> str:
    return OLLAMA_MODELS[0] if OLLAMA_MODELS else ""


def ollama_loaded(model: str) -> bool | None:
    """True/False = whether `model` is resident in Ollama right now; None = Ollama unreachable.

    A cold load of even a 4B model takes 10-30 s on the box when another model is being
    shuffled in and out, so a request that would trigger a load is not worth waiting for.
    """
    if not model:
        return False
    try:
        r = httpx.get(f"{OLLAMA_URL}/api/ps", timeout=PS_TIMEOUT)
        r.raise_for_status()
        names = set()
        for m in r.json().get("models", []):
            for key in ("name", "model"):
                if m.get(key):
                    names.add(m[key])
        return model in names or f"{model}:latest" in names
    except Exception as e:
        log.warning("ollama /api/ps failed: %s", e)
        return None

SYSTEM_PROMPT = """You are Forge, a parametric part designer for a desktop 3D printer.
The user describes something they need. Pick exactly ONE part type from the catalog and fill in its
parameters in millimetres so the part fits what they described. Infer sizes from everyday objects
(headphones band ~ 30 mm wide, a phone ~ 10 mm thick in a case, a USB cable ~ 5 mm, a desk edge ~ 25 mm).
Use numbers the user gives (convert inches and cm to mm). Only use parameter names from the catalog.
Size the part to what it holds: a headphone hook needs hook_width 35-40 and hook_reach 40; a bag or coat hook
needs hook_drop 70+; a cable clip's cable_dia is the cable's diameter plus ~1 mm of clearance; a phone stand's
device_th is the phone thickness plus ~2 mm.
Give the part a short friendly name in plain words with spaces (max 5 words, e.g. "Headphone Desk Hook") and a
one-sentence rationale that mentions the key dimension.

Catalog:
""" + catalog_text()


def _schema() -> dict[str, Any]:
    props: dict[str, Any] = {}
    for name in all_param_names():
        props[name] = {"type": "string"} if name == "text_str" else {"type": "number"}
    return {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": list(PARTS.keys())},
            "name": {"type": "string"},
            "params": {"type": "object", "properties": props},
            "rationale": {"type": "string"},
        },
        "required": ["type", "name", "params", "rationale"],
    }


def _clean_name(raw: Any, fallback: str) -> str:
    """Small models like to answer 'specs_tag'; show 'Specs Tag' on the plate instead."""
    name = str(raw or "").strip()
    if " " not in name:  # snake_case / kebab-case single token
        name = re.sub(r"[_\-]+", " ", name)
    name = re.sub(r"\s+", " ", name.replace("_", " ")).strip()
    if not name:
        return fallback
    if name == name.lower():
        name = name.title()
    return name[:40]


def _validate(spec: dict[str, Any], source: str) -> dict[str, Any] | None:
    if not isinstance(spec, dict):
        return None
    ptype = str(spec.get("type", "")).strip().lower()
    if ptype not in PARTS:
        return None
    params = spec.get("params") if isinstance(spec.get("params"), dict) else {}
    part = PARTS[ptype]
    clamped = part.clamp(params)
    return {
        "type": ptype,
        "name": _clean_name(spec.get("name"), part.title),
        "params": clamped,
        "rationale": (str(spec.get("rationale") or ""))[:240],
        "source": source,
    }


# ---------------------------------------------------------------- local (Ollama)
def _ollama_chat(model: str, prompt: str, think: bool | None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
        "stream": False,
        "format": _schema(),
        "options": {"temperature": 0.1, "num_ctx": NUM_CTX, "num_predict": 400},
        "keep_alive": _keep_alive(),
    }
    if think is not None:
        body["think"] = think
    with httpx.Client(timeout=LLM_TIMEOUT) as client:
        r = client.post(f"{OLLAMA_URL}/api/chat", json=body)
        r.raise_for_status()
        data = r.json()
    content = data.get("message", {}).get("content", "")
    return json.loads(content)


def warm_local(timeout: float = 120.0) -> dict[str, Any]:
    """Load the primary model into memory with a one-token request, so the first /design is fast.

    Deliberately NOT a full design call: that would occupy Ollama for 10+ seconds right when the
    user is about to pinch a chip. Blocking; the HTTP layer calls warm_async() instead.
    """
    global LAST_WARM
    model = primary_model()
    if not model:
        return {"ok": False, "model": None, "seconds": 0.0}
    t0 = time.time()
    body: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "stream": False,
        "think": False,
        # Same num_ctx as the design calls: Ollama sizes the KV cache from num_ctx and reloads the
        # model whenever it changes. Without it, qwen3's 262k default context allocated ~80 GB.
        "options": {"num_predict": 1, "num_ctx": NUM_CTX},
        "keep_alive": _keep_alive(),
    }
    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(f"{OLLAMA_URL}/api/chat", json=body)
            if r.status_code == 400 and "think" in r.text.lower():
                body.pop("think", None)
                r = client.post(f"{OLLAMA_URL}/api/chat", json=body)
            r.raise_for_status()
        result = {"ok": True, "model": model, "seconds": round(time.time() - t0, 1), "at": time.time()}
    except Exception as e:
        log.warning("warm %s failed: %s", model, e)
        result = {"ok": False, "model": model, "seconds": round(time.time() - t0, 1), "error": str(e)[:120], "at": time.time()}
    LAST_WARM = result
    return result


def warm_async() -> dict[str, Any]:
    """Kick off warm_local() in a background thread (one at a time) and return immediately."""
    global _warm_thread
    model = primary_model()
    loaded = ollama_loaded(model)
    started = False
    with _warm_lock:
        if loaded is False and (_warm_thread is None or not _warm_thread.is_alive()):
            _warm_thread = threading.Thread(target=warm_local, name="forge-warm", daemon=True)
            _warm_thread.start()
            started = True
    return {
        "ok": True,
        "model": model or None,
        "loaded": loaded,
        "started": started,
        "warming": bool(_warm_thread and _warm_thread.is_alive()),
        "last": {k: v for k, v in LAST_WARM.items() if k != "at"},
    }


def design_local(prompt: str) -> dict[str, Any] | None:
    for model in OLLAMA_MODELS:
        loaded = ollama_loaded(model)
        if loaded is None:
            return None  # Ollama down: straight to cloud / keywords
        if loaded is False:
            # The model has been evicted (something else is using the GPU). Loading it would blow the
            # Lens's time budget, so answer with keywords now and warm in the background for next time.
            log.warning("ollama %s not resident; using keyword designer and warming in background", model)
            warm_async()
            continue
        for think in (False, None):
            t0 = time.time()
            try:
                spec = _ollama_chat(model, prompt, think)
            except httpx.HTTPStatusError as e:
                msg = e.response.text[:200]
                log.warning("ollama %s (think=%s) http %s: %s", model, think, e.response.status_code, msg)
                if think is False and "think" in msg.lower():
                    continue  # model does not support the think flag; retry without it
                break
            except Exception as e:  # timeout, bad JSON, connection refused
                log.warning("ollama %s (think=%s) failed: %s", model, think, e)
                break
            spec = _validate(spec, f"ollama:{model}")
            if spec:
                spec["llm_seconds"] = round(time.time() - t0, 1)
                return spec
            break
    return None


# ---------------------------------------------------------------- cloud (OpenAI-compatible)
def design_cloud(prompt: str) -> dict[str, Any] | None:
    if not (CLOUD_BASE_URL and CLOUD_API_KEY):
        return None
    t0 = time.time()
    body = {
        "model": CLOUD_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT + "\nRespond with a single JSON object: {type, name, params, rationale}."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    try:
        with httpx.Client(timeout=LLM_TIMEOUT) as client:
            r = client.post(
                f"{CLOUD_BASE_URL.rstrip('/')}/chat/completions",
                json=body,
                headers={"Authorization": f"Bearer {CLOUD_API_KEY}"},
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
        spec = _validate(json.loads(content), f"cloud:{CLOUD_MODEL}")
        if spec:
            spec["llm_seconds"] = round(time.time() - t0, 1)
        return spec
    except Exception as e:
        log.warning("cloud design failed: %s", e)
        return None


# ---------------------------------------------------------------- keyword fallback
_UNIT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(mm|millimet|cm|centimet|in(?:ch|ches)?|\")", re.I)


def _first_dimension_mm(prompt: str) -> float | None:
    m = _UNIT_RE.search(prompt)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("cm") or unit.startswith("centimet"):
        return val * 10.0
    if unit.startswith("in") or unit == '"':
        return val * 25.4
    return val


def design_keywords(prompt: str) -> dict[str, Any]:
    text = prompt.lower()
    best, best_hits = "hook", 0
    for ptype, part in PARTS.items():
        hits = sum(1 for k in part.keywords if k in text)
        if hits > best_hits:
            best, best_hits = ptype, hits
    part = PARTS[best]
    params: dict[str, Any] = {}
    dim = _first_dimension_mm(prompt)
    if dim is not None and part.primary_dim:
        params[part.primary_dim] = dim
    if best == "tag":
        m = re.search(r"(?:says?|reads?|text|that says|with)\s+[\"']?([A-Za-z0-9 ]{1,12})[\"']?", prompt)
        if m:
            params["text_str"] = m.group(1).strip().upper()
    return {
        "type": best,
        "name": part.title,
        "params": part.clamp(params),
        "rationale": "Matched by keywords; sizes are catalog defaults" + (f" with {dim:.0f} mm from your request." if dim else "."),
        "source": "keywords",
    }


def design(prompt: str) -> dict[str, Any]:
    prompt = (prompt or "").strip()[:600]
    if not prompt:
        return design_keywords("hook")
    spec = design_local(prompt) or design_cloud(prompt) or design_keywords(prompt)
    return spec
