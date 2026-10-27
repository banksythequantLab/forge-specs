"""Turn a request into a part spec: local Ollama first, cloud fallback, keyword fallback.

The LLM never emits geometry. It picks one catalog part and fills parameters in
millimetres; catalog.clamp() bounds everything before OpenSCAD runs.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import httpx

from .catalog import PARTS, all_param_names, catalog_text

log = logging.getLogger("forge.llm")

OLLAMA_URL = os.environ.get("FORGE_OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODELS = [m.strip() for m in os.environ.get("FORGE_OLLAMA_MODELS", "qwen3.8:27b,qwen3:4b").split(",") if m.strip()]
CLOUD_BASE_URL = os.environ.get("FORGE_CLOUD_BASE_URL", "")  # OpenAI-compatible, e.g. https://api.openai.com/v1
CLOUD_API_KEY = os.environ.get("FORGE_CLOUD_API_KEY", "")
CLOUD_MODEL = os.environ.get("FORGE_CLOUD_MODEL", "gpt-4o-mini")
LLM_TIMEOUT = float(os.environ.get("FORGE_LLM_TIMEOUT", "75"))

SYSTEM_PROMPT = """You are Forge, a parametric part designer for a desktop 3D printer.
The user describes something they need. Pick exactly ONE part type from the catalog and fill in its
parameters in millimetres so the part fits what they described. Infer sizes from everyday objects
(headphones band ~ 30 mm wide, a phone ~ 10 mm thick in a case, a USB cable ~ 5 mm, a desk edge ~ 25 mm).
Use numbers the user gives (convert inches and cm to mm). Only use parameter names from the catalog.
Give the part a short friendly name (max 5 words) and a one-sentence rationale that mentions the key dimension.

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
        "name": (str(spec.get("name") or part.title))[:40],
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
        "options": {"temperature": 0.1, "num_ctx": 8192, "num_predict": 400},
        "keep_alive": "30m",
    }
    if think is not None:
        body["think"] = think
    with httpx.Client(timeout=LLM_TIMEOUT) as client:
        r = client.post(f"{OLLAMA_URL}/api/chat", json=body)
        r.raise_for_status()
        data = r.json()
    content = data.get("message", {}).get("content", "")
    return json.loads(content)


def design_local(prompt: str) -> dict[str, Any] | None:
    for model in OLLAMA_MODELS:
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
