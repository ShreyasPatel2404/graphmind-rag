"""
ollama_client.py — Local LLM wrapper for Ollama
Handles: embeddings, generation, streaming
"""

import logging
from typing import Generator, List
import ollama
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


# ─── Embeddings ───────────────────────────────────────────────────────────────
def embed_text(text: str) -> List[float]:
    """Embed a single text string."""
    try:
        resp = ollama.embeddings(
            model=settings.ollama_embed_model,
            prompt=text,
        )
        return resp["embedding"]
    except Exception as e:
        logger.error(f"Embed error: {e}")
        raise RuntimeError(f"Ollama embedding failed: {e}")


def embed_chunks(chunks: List[str]) -> List[List[float]]:
    """Embed a list of text chunks. Returns list of vectors."""
    vectors = []
    for i, chunk in enumerate(chunks):
        try:
            vec = embed_text(chunk)
            vectors.append(vec)
            if (i + 1) % 10 == 0:
                logger.info(f"Embedded {i+1}/{len(chunks)} chunks")
        except Exception as e:
            logger.error(f"Failed to embed chunk {i}: {e}")
            raise
    return vectors


# ─── Generation ───────────────────────────────────────────────────────────────
def generate(prompt: str, context: str = "", system: str = "") -> str:
    """Generate a response (blocking)."""
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        if context:
            messages.append({
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {prompt}"
            })
        else:
            messages.append({"role": "user", "content": prompt})

        resp = ollama.chat(
            model=settings.ollama_model,
            messages=messages,
        )
        return resp["message"]["content"]
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise RuntimeError(f"Ollama generation failed: {e}")


def generate_stream(prompt: str, context: str = "", system: str = "") -> Generator:
    """Stream a response token by token."""
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        if context:
            messages.append({
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {prompt}"
            })
        else:
            messages.append({"role": "user", "content": prompt})

        stream = ollama.chat(
            model=settings.ollama_model,
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            token = chunk["message"]["content"]
            if token:
                yield token
    except Exception as e:
        logger.error(f"Stream error: {e}")
        raise RuntimeError(f"Ollama stream failed: {e}")


# ─── Health check ─────────────────────────────────────────────────────────────
def check_ollama_health() -> dict:
    """Check if Ollama is running and models are available."""
    try:
        models = ollama.list()
        model_names = [m["name"] for m in models.get("models", [])]
        embed_ok = any(settings.ollama_embed_model in m for m in model_names)
        llm_ok   = any(settings.ollama_model in m for m in model_names)
        return {
            "running": True,
            "embed_model_ready": embed_ok,
            "llm_model_ready":   llm_ok,
            "models": model_names,
        }
    except Exception as e:
        return {"running": False, "error": str(e)}