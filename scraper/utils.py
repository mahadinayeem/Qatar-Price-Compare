"""
Utility functions for Qatar Price Comparison scraper
"""

import re
import logging

logger = logging.getLogger(__name__)

COUNTRY_TOKENS = {
    "qatar", "china", "india", "egypt", "uganda", "italy", "holland",
    "australia", "usa", "south", "north", "new", "pakistan", "bangladesh",
    "morocco", "spain", "saudi",
}

JUNK_TOKENS = {
    "hover", "image", "kg", "g", "gm", "gram", "grams", "ml", "ltr",
    "packet", "pack", "pkt", "pcs", "pc",
}

PAREN_RE = re.compile(r"\([^)]*\)")
WEIGHT_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:kg|g|gm|gram|grams|ml|ltr|l|pcs|pc)\b",
    flags=re.I,
)

# Known brands to match (extend as needed)
KNOWN_BRANDS = [
    "Agrico", "Dole", "Chiquita", "Del Monte", "Driscoll's",
    "Fresh", "Natures", "Nature's", "Sun", "Golden", "Royal",
    "Qatar", "Local", "Premium", "Organic", "Sunfresh",
    "Happy Fresh", "Green", "Farm", "Valley", "Mountain",
]


def extract_brand_and_name(full_name: str) -> tuple[str, str]:
    """
    Extract brand and clean product name from full product title.
    
    Example:
        "Agrico Mushroom White Bottom Qatar 250gm"
        -> brand="Agrico", name="Mushroom White Bottom Qatar 250gm"
    """
    if not full_name:
        return "Unknown", full_name

    full_name = full_name.strip()

    # Check known brands first
    for brand in KNOWN_BRANDS:
        if full_name.lower().startswith(brand.lower()):
            product_name = full_name[len(brand):].strip()
            if product_name:
                return brand, product_name

    # Heuristic: if first word is capitalized and not common word, treat as brand
    words = full_name.split()
    if len(words) >= 2:
        first_word = words[0]
        # If first word looks like a brand (capitalized, not a generic term)
        generic_starters = {
            "fresh", "frozen", "organic", "local", "mixed", "mini",
            "baby", "red", "green", "yellow", "white", "black",
            "large", "small", "medium", "big", "whole", "sliced",
        }
        if (
            first_word[0].isupper()
            and first_word.lower() not in generic_starters
            and len(first_word) > 2
        ):
            return first_word, " ".join(words[1:])

    return "Unknown", full_name


def parse_price(price_str: str) -> float | None:
    """
    Parse price from various string formats.
    
    Examples:
        "QAR 7.50" -> 7.50
        "7.50 QAR" -> 7.50
        "7,500" -> 7.5 (Qatar decimal)
        "7.50" -> 7.50
        "QAR\n53\n.00" -> 53.00 (with newlines)
    """
    if not price_str:
        return None

    # First normalize: remove newlines and extra whitespace
    normalized = str(price_str).replace("\n", " ").strip()
    
    # Remove duplicate patterns (e.g., "QAR 53 .00 QAR 53 .00" -> keep first occurrence)
    # Keep only first occurrence of price pattern
    words = normalized.split()
    
    # Find first valid price pattern
    cleaned_parts = []
    for i, word in enumerate(words):
        if any(c.isdigit() for c in word) or word == ".":
            # Start of price number sequence
            cleaned_parts.append(word)
        elif word.upper() == "QAR" and (not cleaned_parts or cleaned_parts[-1] == "."):
            # QAR at start or after decimal - skip
            continue
        elif cleaned_parts:
            # Once we have digits, keep building until we have enough
            cleaned_parts.append(word)
            if len(cleaned_parts) >= 3:  # e.g., "53", ".", "00"
                break

    # Remove currency symbols and non-numeric (except decimal)
    if cleaned_parts:
        cleaned = re.sub(r"[^\d.,]", "", " ".join(cleaned_parts)).strip()
    else:
        cleaned = re.sub(r"[^\d.,]", "", normalized).strip()
    
    if not cleaned:
        return None

    # Handle comma as decimal separator
    if "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    elif "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")

    try:
        price = float(cleaned)
        # Sanity check: prices between 0.1 and 1000 QAR
        if 0.1 <= price <= 1000:
            return round(price, 2)
        return None
    except ValueError:
        logger.debug(f"Could not parse price: {price_str!r}")
        return None


def normalize_product_name(name: str) -> str:
    """Normalize product name for comparison."""
    if not name:
        return ""

    normalized = name.lower()
    normalized = PAREN_RE.sub(" ", normalized)
    normalized = WEIGHT_RE.sub(" ", normalized)
    normalized = normalized.replace("-", " ")
    normalized = re.sub(r"[^\w\s]", " ", normalized)

    for token in COUNTRY_TOKENS | JUNK_TOKENS:
        normalized = re.sub(rf"\b{re.escape(token)}\b", " ", normalized)

    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def build_common_product_name(name: str) -> str:
    """Build a readable common product name for grouping across stores."""
    normalized = normalize_product_name(name)
    if normalized:
        return normalized.title()
    return (name or "").strip()


def setup_logging(level: str = "INFO"):
    """Configure logging for scrapers."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
