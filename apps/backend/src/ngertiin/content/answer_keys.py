"""Validate definitive keys; exact matches are an acceptance shortcut, never a rejection."""

import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Literal

from ngertiin.content.questions import DefinitiveKey

type LiteralMatch = Literal[True] | None

UNIT_ALIASES = {
    "ms": ("milidetik", "millisecond", "milliseconds"),
    "s": ("detik", "sekon", "second", "seconds"),
    "kg": ("kilogram", "kilograms"),
    "g": ("gram", "grams"),
    "m": ("meter", "metre", "meters"),
    "cm": ("sentimeter", "centimeter", "centimeters"),
    "W": ("watt", "watts"),
    "mW": ("miliwatt", "milliwatt", "milliwatts"),
    "MW": ("megawatt", "megawatts"),
    "°C": ("derajat celsius", "degree celsius", "degrees celsius"),
}
NUMBER = re.compile(r"^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*)$", re.I)


def normalized_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).split()).casefold()


def normalized_unit(value: str) -> str:
    unit = " ".join(unicodedata.normalize("NFKC", value).split())
    if unit in UNIT_ALIASES:
        return unit
    return next(
        (symbol for symbol, names in UNIT_ALIASES.items() if unit.casefold() in names), unit
    )


def numeric_parts(value: str) -> tuple[Decimal, str] | None:
    match = NUMBER.fullmatch(unicodedata.normalize("NFKC", value).strip())
    if not match:
        return None
    try:
        number = Decimal(match[1].replace(",", "."))
        if not number.is_finite() or (number and not -400 <= number.adjusted() <= 308):
            return None
        return number, normalized_unit(match[2])
    except InvalidOperation:
        return None


def key_problems(key: DefinitiveKey) -> list[str]:
    problems = []
    if any(len(value.split()) > 10 for value in [key.canonical_answer, *key.accepted_variants]):
        problems.append("TARGET_ANSWER_WORD_LIMIT")
    numeric = key.numeric
    if numeric is None:
        return problems
    unit = normalized_unit(numeric.unit or "")
    canonical = numeric_parts(key.canonical_answer)
    if canonical != (Decimal(str(numeric.value)), unit):
        problems.append("NUMERIC_CANONICAL_MISMATCH")
    for value in key.accepted_variants:
        parts = numeric_parts(value)
        if parts is None and NUMBER.fullmatch(value.strip()):
            problems.append("NUMERIC_VARIANT_MISMATCH")
        spelled_units = {
            normalized_unit(token)
            for token in value.split()
            if normalized_unit(token) in UNIT_ALIASES
        }
        if parts is None and spelled_units - {unit}:
            problems.append("NUMERIC_VARIANT_MISMATCH")
        if parts and (
            (parts[1] and parts[1] != unit)
            or abs(parts[0] - Decimal(str(numeric.value))) > Decimal(str(numeric.tolerance))
        ):
            problems.append("NUMERIC_VARIANT_MISMATCH")
    return sorted(set(problems))


def match_definitive_answer(answer: str, key: DefinitiveKey) -> LiteralMatch:
    """None requires semantic equivalence evaluation in #12; length never makes it wrong."""
    if key_problems(key):
        raise ValueError("Invalid definitive answer key")
    candidates = [key.canonical_answer, *key.accepted_variants]
    if key.numeric is None:
        return True if normalized_text(answer) in map(normalized_text, candidates) else None
    numeric = key.numeric
    parts = numeric_parts(answer)
    if parts:
        number, unit = parts
        expected_unit = normalized_unit(numeric.unit or "")
        if not unit and expected_unit:
            # Bare values are allowed only when explicitly listed by the author.
            return True if any(numeric_parts(v) == parts for v in key.accepted_variants) else None
        if unit == expected_unit and abs(number - Decimal(str(numeric.value))) <= Decimal(
            str(numeric.tolerance)
        ):
            return True
        return None

    # Spelled variants retain case-sensitive unit tokens (e.g. mW versus MW).
    def normalize_variant(value: str) -> str:
        return " ".join(
            f"unit:{normalized_unit(token)}"
            if normalized_unit(token) in UNIT_ALIASES
            else token.casefold()
            for token in unicodedata.normalize("NFKC", value).split()
        )

    return True if normalize_variant(answer) in map(normalize_variant, candidates) else None
