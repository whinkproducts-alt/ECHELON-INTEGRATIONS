"""Never-store filter. Marcus may use this content in the moment but must not save or log it.

Categories: passwords, card or bank numbers, government ID numbers, health details.
This is a pattern filter. It over-blocks on purpose; it cannot understand context.
"""
import logging
import re
from typing import Optional

_F = re.I

_PASSWORD = [
    re.compile(r"\b(?:password|passphrase|passcode|pwd)\b\s*(?:is|are|was|will be|[:=])\s*\S+", _F),
    re.compile(r"\bpin(?:\s+code)?\b\s*(?:is|[:=])\s*\d{3,8}\b", _F),
]

_CARD_CANDIDATE = re.compile(r"(?<![\d])(?:\d[ -]?){13,19}(?![\d])")
_BANK = [
    re.compile(r"\b(?:account|acct|routing|transit|institution|swift|bic|iban)\b[^.\n]{0,25}?\d{5,}", _F),
    re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b"),
]

_GOV_ID = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),  # US SSN
    re.compile(r"\b\d{3}[- ]\d{3}[- ]\d{3}\b"),  # Canadian SIN
    re.compile(r"\b(?:sin|ssn|social insurance|social security)\b[^.\n]{0,30}?\b\d{9}\b", _F),
    re.compile(r"\bpassport\b[^.\n]{0,20}?\b[A-Z]{1,2}\d{6,9}\b", _F),
    re.compile(r"\blicen[cs]e\b[^.\n]{0,20}?\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{5,}\b", _F),
]

_HEALTH = re.compile(
    r"\b(?:diagnos\w*|medications?|prescri\w+|symptoms?|blood pressure|blood sugar|cancer|"
    r"diabet\w*|hiv|depress\w*|anxiety|surgery|chemotherapy|therap(?:y|ist)|"
    r"medical (?:condition|history|record\w*)|health (?:condition|issue|problem)s?|"
    r"disease|illness|allerg\w+|pregnan\w+|mental health)\b",
    _F,
)


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def check(text: Optional[str]) -> Optional[str]:
    """Return the category name if text must not be stored, else None."""
    if not text:
        return None
    for rx in _PASSWORD:
        if rx.search(text):
            return "passwords"
    for m in _CARD_CANDIDATE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if 13 <= len(digits) <= 19 and _luhn_ok(digits):
            return "card or bank numbers"
    for rx in _BANK:
        if rx.search(text):
            return "card or bank numbers"
    for rx in _GOV_ID:
        if rx.search(text):
            return "government ID numbers"
    if _HEALTH.search(text):
        return "health details"
    return None


REDACTED = "[redacted: never-store content]"
_installed = False


def install_log_filter() -> None:
    """Redact never-store content from every log record, whichever logger made it."""
    global _installed
    if _installed:
        return
    _installed = True
    previous = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = previous(*args, **kwargs)
        try:
            message = record.getMessage()
        except Exception:
            return record
        if check(message):
            record.msg = REDACTED
            record.args = ()
        return record

    logging.setLogRecordFactory(factory)
