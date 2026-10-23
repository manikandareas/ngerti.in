"""Backend grants from fresh browser evidence, never the actor's risk assessment.

Routine reading/search is automatic. Unknown controls and writes need exact approval;
secrets require private takeover. This applies to old and new session policy snapshots.
"""

import re
from dataclasses import asdict, dataclass
from urllib.parse import parse_qsl, unquote, urlsplit

from ngertiin.computer.contracts import Action, InspectedTarget, NeedsHuman

EFFECT = re.compile(
    r"\b(send|submit|post|publish|reply|forward|compose|delete|remove|erase|trash|save|update|"
    r"edit|create|add|upload|attach|buy|purchase|pay|payment|checkout|order|book|reserve|subscribe|"
    r"unsubscribe|like|follow|unfollow|share|invite|accept|approve|confirm|allow|grant|connect|"
    r"archive|mute|unmute|block|unblock|enable|disable|activate|deactivate|restore|reset|"
    r"rename|move|copy|transfer|change|cancel|mark|"
    r"login|signin|logon|logout|signout|signup|register|auth|authenticate|authorize|oauth|"
    r"consent|password|security|credential|"
    r"recipient|subject|message|body|compose|email|"
    r"kirim|balas|teruskan|terbitkan|hapus|buang|simpan|ubah|sunting|buat|tambah|unggah|"
    r"beli|bayar|pesan|reservasi|berlangganan|bagikan|undang|setujui|izinkan|masuk|keluar|"
    r"arsipkan|batalkan|nonaktifkan|aktifkan|perbarui|ganti|konfirmasi|terima|tolak|blokir)\b",
    re.I,
)
SECRET_KEYS = {"access_token", "refresh_token", "id_token", "token", "password", "secret", "code"}
# Resource nouns are common read URLs. They only imply a write when used as an
# explicit operation or on a control/form, rather than as an article/resource path.
URL_NOUNS = {"post", "book", "order", "recipient", "subject", "message", "body", "email"}
READ_CONTROL = re.compile(
    r"^(next page|previous page|read more|show more|load more|view details|back to results|"
    r"halaman berikutnya|halaman sebelumnya|baca selengkapnya|lihat detail|kembali ke hasil)$",
    re.I,
)


@dataclass(frozen=True)
class Decision:
    decision: str
    reason_code: str
    policy_version: str = "routine-auto-sensitive-approval-v2"

    def record(self):
        return asdict(self)


def decide(action: Action, target: InspectedTarget):
    try:
        approval = requires_approval(action, target)
    except NeedsHuman:
        return Decision("takeover", "private_target")
    if approval:
        return Decision("approval", "external_effect_or_unknown")
    return Decision("auto", "observed_routine_action")


def effect_text(value):
    # Split common URL/identifier spellings (signOut, delete_account, sign-in).
    value = re.sub(r"([a-z])([A-Z])", r"\1 \2", unquote(value or ""))
    value = re.sub(r"[^\w]+|_", " ", value)
    return re.sub(r"\b(log|sign)\s+(in|out|on)\b", r"\1\2", value, flags=re.I)


def url_approval(url):
    try:
        parsed = urlsplit(url)
        valid = parsed.scheme == "https" and parsed.hostname and parsed.port in (None, 443)
    except ValueError:
        return True
    query = parse_qsl(parsed.query) + parse_qsl(parsed.fragment)
    if parsed.username or parsed.password or any(k.lower() in SECRET_KEYS for k, _ in query):
        raise NeedsHuman("URL berisi kredensial/token. Lanjutkan melalui takeover privat.")
    if not valid:
        return True
    # Search terms themselves cannot turn an ordinary query into a write. Only
    # route and explicit operation parameters affect this gate.
    operations = " ".join(
        v for k, v in query if k.lower() in {"action", "operation", "do", "intent", "command"}
    )
    route = parsed.path + (parsed.fragment if parsed.fragment.startswith("/") else "")
    segments = [effect_text(segment).strip() for segment in route.split("/")]
    route_effect = any(
        EFFECT.match(segment)
        for segment in segments
        if segment and segment.lower() not in URL_NOUNS
    )
    return bool(route_effect or EFFECT.search(effect_text(operations)))


def requires_approval(action: Action, target: InspectedTarget):
    if action.kind == "navigate":
        return url_approval(action.url)
    if action.kind in ("scroll", "wait"):
        return False
    context = target.context
    if not context:
        return True
    if context.get("private"):
        raise NeedsHuman("Target privat memerlukan takeover.")
    if action.kind == "key" and action.key in ("Tab", "Escape"):
        return False
    if (
        action.kind == "click"
        and context.get("browser_error")
        and context.get("id") == "reload-button"
        and context.get("tag") == "BUTTON"
    ):
        return False
    form = context.get("form") or {}
    labels = " ".join(str(context.get(k) or "") for k in ("label", "name", "id"))
    fields = " ".join(form.get("fields", []))
    if context.get("href"):
        # A headline mentioning "change", "security" or "publish" is not a
        # command. Links use their destination plus command-shaped labels.
        label = effect_text(context.get("label", "")).strip()
        label = re.sub(
            r"^(?:(?:please|confirm|permanently|yes)\s+|click here to\s+)+", "", label, flags=re.I
        )
        command_label = EFFECT.match(label)
        identifiers = effect_text(str(context.get("name", "")) + " " + str(context.get("id", "")))
        return (
            action.kind != "click"
            or bool(context.get("download"))
            or url_approval(context["href"])
            or bool(command_label)
            or bool(EFFECT.search(identifiers))
        )
    if EFFECT.search(effect_text(labels + " " + fields)):
        return True
    if form and url_approval(form.get("action", "")):
        return True
    # Only search semantics observed on the actual input/form grant automatic
    # typing/submit. Arbitrary textboxes may autosave, chat or edit account data.
    search = form.get("search") if form else context.get("search")
    if search and not context.get("editable_rich"):
        if action.kind in ("click", "type", "select"):
            return False
        if action.kind == "key":
            return action.key not in ("Enter", "BackSpace", "Up", "Down", "Left", "Right")
    if action.kind == "click" and not form:
        if context.get("tag") == "SUMMARY" or context.get("role") == "tab":
            return False
        if context.get("disclosure"):
            return False
        if READ_CONTROL.fullmatch(context.get("label", "").strip()):
            return False
    return True
