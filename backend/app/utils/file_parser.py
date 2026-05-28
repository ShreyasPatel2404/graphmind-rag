"""
file_parser.py — Extract plain text from PDF / DOCX / TXT / URL
Returns: {"text": str, "page_count": int | None, "error": str | None}
"""

import io
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ─── PDF ───────────────────────────────────────────────────────────────────────
def parse_pdf(file_bytes: bytes) -> dict:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text)

        full_text = "\n\n".join(pages)
        return {"text": full_text.strip(), "page_count": len(pages), "error": None}
    except Exception as e:
        logger.error(f"PDF parse error: {e}")
        return {"text": "", "page_count": None, "error": str(e)}


# ─── DOCX ──────────────────────────────────────────────────────────────────────
def parse_docx(file_bytes: bytes) -> dict:
    try:
        import docx

        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        full_text = "\n\n".join(paragraphs)
        return {"text": full_text.strip(), "page_count": None, "error": None}
    except Exception as e:
        logger.error(f"DOCX parse error: {e}")
        return {"text": "", "page_count": None, "error": str(e)}


# ─── TXT ───────────────────────────────────────────────────────────────────────
def parse_txt(file_bytes: bytes) -> dict:
    try:
        text = file_bytes.decode("utf-8", errors="replace")
        return {"text": text.strip(), "page_count": None, "error": None}
    except Exception as e:
        logger.error(f"TXT parse error: {e}")
        return {"text": "", "page_count": None, "error": str(e)}


# ─── URL ───────────────────────────────────────────────────────────────────────
def parse_url(url: str) -> dict:
    try:
        import requests
        from bs4 import BeautifulSoup

        headers = {"User-Agent": "Mozilla/5.0 (GraphMind RAG Bot)"}
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove noisy tags
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()

        # Try to get main content first
        main = soup.find("main") or soup.find("article") or soup.find("body")
        text = main.get_text(separator="\n") if main else soup.get_text(separator="\n")

        # Clean up whitespace
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        full_text = "\n".join(lines)

        return {"text": full_text, "page_count": None, "error": None}
    except Exception as e:
        logger.error(f"URL parse error: {e}")
        return {"text": "", "page_count": None, "error": str(e)}


# ─── Router ────────────────────────────────────────────────────────────────────
def parse_file(file_bytes: bytes, file_type: str) -> dict:
    """Dispatch to the right parser based on file_type."""
    parsers = {
        "pdf":  parse_pdf,
        "docx": parse_docx,
        "txt":  parse_txt,
    }
    fn = parsers.get(file_type.lower())
    if fn is None:
        return {"text": "", "page_count": None, "error": f"Unsupported type: {file_type}"}
    return fn(file_bytes)