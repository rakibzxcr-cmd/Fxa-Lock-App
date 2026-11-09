import re
import uuid
import requests
from bs4 import BeautifulSoup
from telegram import Update
from telegram.ext import ContextTypes
from utils.keyboards import vote_keyboard, back_keyboard
from utils.formatters import fmt_phone
from config import AWAITING_PHONE, NUMVERIFY_KEY

# Bangladesh default prefix
BD_PREFIX = "+880"
PHONE_RE  = re.compile(r"^\+?[\d\s\-\(\)]{7,20}$")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36"
}

def _normalize_bd(number: str) -> str:
    """Auto-prefix Bangladesh numbers that start with 01x."""
    n = number.strip()
    if re.match(r"^01[3-9]\d{8}$", n):
        return f"+880{n[1:]}"
    if re.match(r"^8801[3-9]\d{8}$", n):
        return f"+{n}"
    return n

def _numverify(number: str) -> dict:
    if not NUMVERIFY_KEY:
        return {}
    try:
        r = requests.get(
            "http://apilayer.net/api/validate",
            params={"access_key": NUMVERIFY_KEY, "number": number, "format": "1"},
            timeout=8,
        )
        return r.json()
    except Exception:
        return {}

def _facebook_from_phone(number: str) -> str | None:
    try:
        clean = re.sub(r"[\s\-\(\)\+]", "", number)
        r = requests.get(
            "https://www.facebook.com/login/identify",
            params={"ctx": "recover", "q": clean},
            headers=HEADERS,
            timeout=8,
            allow_redirects=True,
        )
        soup = BeautifulSoup(r.text, "html.parser")
        link = soup.find("a", href=re.compile(r"facebook\.com/profile"))
        if link:
            return link["href"]
        if "profile" in r.url:
            return r.url
    except Exception:
        pass
    return None

def _instagram_from_phone(number: str) -> str | None:
    try:
        clean = re.sub(r"[\s\-\(\)\+]", "", number)
        r = requests.get(
            "https://www.instagram.com/api/v1/users/lookup_phone/",
            params={"phone": clean},
            headers={"User-Agent": "Instagram 76.0.0.15.395 Android"},
            timeout=6,
        )
        if r.status_code == 200:
            uid = r.json().get("user_id") or r.json().get("id")
            if uid:
                return str(uid)
    except Exception:
        pass
    return None

async def ask_phone(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "📱 *Phone Lookup*\n\n"
        "Send a number. BD numbers auto-prefixed (+880).\n\n"
        "Examples:\n"
        "`01712345678` → auto +880\n"
        "`+8801712345678`\n"
        "`+447911123456`",
        parse_mode="Markdown",
        reply_markup=back_keyboard(),
    )
    return AWAITING_PHONE

async def handle_phone(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "🏠 Main Menu":
        from handlers.start import start
        return await start(update, ctx)

    # BD auto-prefix
    normalized = _normalize_bd(text)

    if not PHONE_RE.match(normalized):
        await update.message.reply_text(
            "❌ Invalid format. Try `01712345678` or `+8801712345678`.",
            parse_mode="Markdown",
            reply_markup=back_keyboard(),
        )
        return AWAITING_PHONE

    await update.message.reply_text(f"🔎 Looking up `{normalized}`...", parse_mode="Markdown")

    nv_data = _numverify(normalized)
    if not nv_data:
        # Fallback structure
        nv_data = {
            "valid": bool(PHONE_RE.match(normalized)),
            "international_format": normalized,
            "local_format": text,
            "country_name": "Bangladesh" if normalized.startswith("+880") else "N/A",
            "country_code": "BD" if normalized.startswith("+880") else "N/A",
            "carrier": "N/A (set NUMVERIFY_KEY for carrier data)",
            "line_type": "N/A",
            "location": "N/A",
        }

    result_id = str(uuid.uuid4())[:8]
    ctx.user_data[f"result_{result_id}"] = {"type": "phone", "query": normalized}

    msg = fmt_phone(nv_data, normalized)
    msg += "\n\n🔗 *Social ID Search*\n━━━━━━━━━━━━━━━━━━━"

    fb = _facebook_from_phone(normalized)
    msg += f"\n📘 Facebook: {fb if fb else '❌ Not found / private'}"

    ig = _instagram_from_phone(normalized)
    msg += f"\n📸 Instagram ID: {ig if ig else '❌ Not exposed publicly'}"

    msg += "\n🎵 TikTok: ❌ No public phone-to-ID API"

    await update.message.reply_text(
        msg,
        parse_mode="Markdown",
        reply_markup=vote_keyboard(result_id),
    )
    return AWAITING_PHONE
