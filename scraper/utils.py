"""
Utility functions for Qatar Price Comparison scraper
"""

import re
import logging

logger = logging.getLogger(__name__)

# Country tokens: used for matching and building human-readable display labels.
# Countries distinguish products (e.g. "Sweet Potato Bangladesh" != "Sweet Potato Egypt").
COUNTRY_TOKENS = {
    "qatar", "china", "india", "egypt", "uganda", "italy", "holland",
    "australia", "usa", "south africa", "pakistan", "bangladesh",
    "morocco", "spain", "saudi", "ecuador", "brazil", "france", "kenya", "oman",
    "lebanon", "jordan", "iran", "vietnam", "thailand", "philippines", "mexico",
    "chile", "peru", "sri lanka", "turkey",
}

# Junk tokens: unit/weight suffixes that are stripped during matching normalization.
JUNK_TOKENS = {
    "hover", "image", "kg", "g", "gm", "gram", "grams", "ml", "ltr", "l",
    "packet", "pack", "pkt", "pcs", "pc", "box", "net", "weight", "approx",
}

PAREN_RE = re.compile(r"\([^)]*\)")
WEIGHT_PATTERN = r"(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams|ml|ltr|l|pcs|pc|pkt)\b"
WEIGHT_RE = re.compile(WEIGHT_PATTERN, flags=re.I)

# Map units to base units (g or ml) and conversion factor
UNIT_CONVERSION = {
    "kg": 1000,
    "g": 1,
    "gm": 1,
    "gram": 1,
    "grams": 1,
    "ml": 1,
    "ltr": 1000,
    "l": 1000,
}

KNOWN_BRANDS = {
    "Agrico", "Mazzraty", "Qinwan", "Sadeer", "Qatrat", "Wajbah", "Zad",
}


def extract_weight(name: str) -> tuple[float | None, str | None]:
    """Extract numeric weight and standard unit from product name.
    
    Example: "Banana 1kg" -> (1000.0, "g")
    """
    match = WEIGHT_RE.search(name)
    if not match:
        return None, None
    
    val, unit = match.groups()
    try:
        val = float(val)
        unit = unit.lower()
        
        if unit in UNIT_CONVERSION:
            factor = UNIT_CONVERSION[unit]
            # Standardize to g or ml
            base_unit = "ml" if unit in ["ml", "ltr", "l"] else "g"
            return val * factor, base_unit
        
        return val, unit
    except ValueError:
        return None, None


def extract_country(name: str) -> str | None:
    """Extract country of origin from name."""
    name_lower = name.lower()
    # Check multi-word countries first
    for country in sorted(COUNTRY_TOKENS, key=len, reverse=True):
        if country in name_lower:
            return country.title()
    return None


def get_clean_match_name(name: str) -> str:
    """Produce a clean tokenized name for matching.
    
    Removes weights, countries, and junk, then sorts tokens alphabetically.
    This handles "Banana Ecuador" vs "Ecuador Banana".
    """
    if not name:
        return ""
    
    # 1. Lowercase and remove parens
    normalized = name.lower()
    normalized = PAREN_RE.sub(" ", normalized)
    
    # 2. Remove Weight
    normalized = WEIGHT_RE.sub(" ", normalized)
    
    # 3. Remove Countries
    for country in COUNTRY_TOKENS:
        normalized = re.sub(rf"\b{re.escape(country)}\b", " ", normalized)
        
    # 4. Remove Junk
    for token in JUNK_TOKENS:
        normalized = re.sub(rf"\b{re.escape(token)}\b", " ", normalized)
        
    # 5. Tokenize, strip, and SORT
    tokens = [t for t in re.split(r"\W+", normalized) if t and len(t) > 1]
    tokens.sort()
    
    return " ".join(tokens)


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
    """Normalize product name for EXACT MATCHING across stores.
    
    Rules:
    - Lowercased, punctuation removed, weight/unit suffixes stripped.
    - Country names are KEPT — they distinguish products.
      e.g. "Sweet Potato Bangladesh" != "Sweet Potato Egypt"
    - Only JUNK_TOKENS (units like kg, g, ml) are stripped.
    """
    if not name:
        return ""

    normalized = name.lower()
    normalized = PAREN_RE.sub(" ", normalized)
    normalized = WEIGHT_RE.sub(" ", normalized)
    normalized = normalized.replace("-", " ")
    normalized = re.sub(r"[^\w\s]", " ", normalized)

    # Strip only unit/junk tokens — NOT country names
    for token in JUNK_TOKENS:
        normalized = re.sub(rf"\b{re.escape(token)}\b", " ", normalized)

    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def build_common_product_name(name: str) -> str:
    """Build a human-readable display label for a product group.
    
    For display only — strips country names and units to produce a clean label.
    Do NOT use this for matching logic.
    """
    if not name:
        return ""
    normalized = name.lower()
    normalized = PAREN_RE.sub(" ", normalized)
    normalized = WEIGHT_RE.sub(" ", normalized)
    normalized = normalized.replace("-", " ")
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    # Strip both country tokens AND junk tokens for display
    for token in COUNTRY_TOKENS | JUNK_TOKENS:
        normalized = re.sub(rf"\b{re.escape(token)}\b", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if normalized:
        return normalized.title()
    return name.strip()


def get_broad_category(name: str) -> str:
    """Classify product as 'Fruits' or 'Vegetables' based on name."""
    name_lower = name.lower()

    FRUIT_KEYWORDS = [
        "apple", "apples", "rockit", "gala", "fuji", "golden",
        "mango", "mangoes", "thottapuri", "green mango",
        "banana", "bananas", "rasakadali", "poovan", "ash banana", "green banana",
        "cherry", "cherries", "strawberry", "berry", "berries", "physalis", "currant",
        "orange", "mandarin", "lemon", "lime", "citrus", "valencia", "pomelo",
        "grape", "grapes",
        "date", "dates",
        "apricot", "apricots",
        "plum", "angelino",
        "melon", "watermelon", "cantaloupe",
        "nectarine",
        "peach", "peaches",
        "pear", "pears",
        "avocado", "hass",
        "coconut",
        "kiwi",
        "papaya",
        "pineapple",
        "pomegranate", "anar",
        "chickoo", "chikoo", "sapota",
        "jackfruit",
        "cut fruit",
        "fruit",
    ]

    for kw in FRUIT_KEYWORDS:
        if kw in name_lower:
            return "Fruits"

    return "Vegetables"


def get_display_name(name: str) -> str:
    """Return a short clean display name by stripping origin country and unit.

    Example: 'Pineapple Golden Kenya 1kg' -> 'Pineapple Golden'
    """
    if not name:
        return ""
    cleaned = name
    # Remove weight/unit patterns first
    cleaned = WEIGHT_RE.sub(" ", cleaned)
    # Remove country tokens (case-insensitive)
    for country in sorted(COUNTRY_TOKENS, key=len, reverse=True):
        cleaned = re.sub(rf"\b{re.escape(country)}\b", " ", cleaned, flags=re.I)
    # Remove extra spaces and capitalise
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.title() if cleaned else name.strip()


def setup_logging(level: str = "INFO"):

    """Configure logging for scrapers."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
