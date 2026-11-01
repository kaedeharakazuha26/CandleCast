from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from pathlib import Path

import torch

from app.config import Settings

logger = logging.getLogger("candlecast.loader")

VENDOR_ROOT = Path(__file__).resolve().parents[2] / "vendor" / "kronos"
if str(VENDOR_ROOT) not in sys.path:
    sys.path.insert(0, str(VENDOR_ROOT))


def resolve_device(preferred: str) -> str:
    if preferred and preferred != "auto":
        return preferred
    if torch.cuda.is_available():
        return "cuda:0"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


@dataclass
class ModelBundle:
    predictor: object
    device: str
    model_id: str
    tokenizer_id: str
    model_version: str
    max_context: int
    loaded: bool


def load_bundle(settings: Settings) -> ModelBundle:
    device = resolve_device(settings.device)
    if settings.skip_model_load:
        logger.warning("SKIP_MODEL_LOAD is set. Inference endpoints will return 503.")
        return ModelBundle(
            predictor=None,
            device=device,
            model_id=settings.model_id,
            tokenizer_id=settings.tokenizer_id,
            model_version=settings.model_version,
            max_context=settings.max_context,
            loaded=False,
        )

    from model import Kronos, KronosPredictor, KronosTokenizer

    logger.info("Loading tokenizer %s and model %s on %s", settings.tokenizer_id, settings.model_id, device)
    tokenizer = KronosTokenizer.from_pretrained(settings.tokenizer_id)
    model = Kronos.from_pretrained(settings.model_id)
    tokenizer.eval()
    model.eval()
    predictor = KronosPredictor(
        model,
        tokenizer,
        device=device,
        max_context=settings.max_context,
        clip=settings.clip,
    )
    logger.info("Kronos predictor ready")
    return ModelBundle(
        predictor=predictor,
        device=device,
        model_id=settings.model_id,
        tokenizer_id=settings.tokenizer_id,
        model_version=settings.model_version,
        max_context=settings.max_context,
        loaded=True,
    )
