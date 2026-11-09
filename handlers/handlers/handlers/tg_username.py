import re
import uuid
import requests
from bs4 import BeautifulSoup
from telegram import Update
from telegram.ext import ContextTypes
from utils.keyboards import vote_keyboard, back_keyboard
from utils.formatters import fmt_tg_username
from config import AWAITING_TG_USERNAME

TG_RE = re.compile(r"^@?[a-zA-Z0-9_]{5,32}$")

def _lookup(username: str) -> dict:
    clean  = username.lstrip("@")
    result = {"found": False, "username": clean}

    # Fragment check
    try:
        r = requests.get(
            f"https://fragment.telegram.org/username/{clean}",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=8,
        )
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            hdr  = soup.find("div", class_="tm-section-header")
            if hdr:
                result["fragment_status"] = hdr.get_text(strip=True)
    except Exception:
        pass

    # t.me preview
    try:
        r = requests.get(
            f"https://t.me/{clean}",
            headers={"User-Agent": "TelegramBot (like TwitterBot)"},
            timeout=8,
        )
        soup    = BeautifulSoup(r.text, "html.parser")
        tg_page = soup.find("div", class_="tgme_page")

        if tg_page:
            result["found"] = True
            name_el = soup.find("div", class_="tgme_page_title")
            desc_el = soup.find("div", class_="tgme_page_description")
            extra_el = soup.find("div", class_="tgme_page_extra")
            type_el  = soup.find("div", class_="tgme_page_context_link")

            result["first_name"]   = name_el.get_text(strip=True)  if name_el  else None
            result["bio"]          = desc_el.get_text(strip=True)   if desc_el  else None
            result["subscribers"]  = extra_el.get_text(strip=True)  if extra_el else None
            result["is_bot"]       = "bot" in (type_el.get_text(strip=True).lower() if type_el else "")
            result["profile_url"]  = f"https://t.me/{clean}"
        elif "If you have Telegram" in r.text:
            result["found"]      = True
            result["first_name"] = clean
            result["note"]       = "Profile exists but preview is private."
        else:
            result["error"] = "Username not found on Telegram."
    except Exception as e:
        result["error"] = str(e)

    result["phone"] = "❌ Not accessible via public API"
    return result

async def ask_tg_username(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "✈️ *Telegram Username Lookup*\n\n"
        "Send a Telegram username.\n\n"
        "Example: `@username` or `username`",
        parse_mode="Markdown",
        reply_markup=back_keyboard(),
    )
    return AWAITING_TG_USERNAME

async def handle_tg_username(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "🏠 Main Menu":
        from handlers.start import start
        return await start(update, ctx)

    if not TG_RE.match(text):
        await update.message.reply_text(
            "❌ Username must be 5–32 chars (letters/numbers/underscore).",
            reply_markup=back_keyboard(),
        )
        return AWAITING_TG_USERNAME

    await update.message.reply_text("🔎 Querying Telegram...")

    data      = _lookup(text)
    result_id = str(uuid.uuid4())[:8]
    ctx.user_data[f"result_{result_id}"] = {"type": "tg_username", "query": text}

    output = fmt_tg_username(text.lstrip("@"), data)
    if data.get("bio"):         output += f"\n📝 Bio: {data['bio'][:200]}"
    if data.get("subscribers"): output += f"\n👥 Subscribers: {data['subscribers']}"
    if data.get("fragment_status"): output += f"\n🔖 Fragment: {data['fragment_status']}"

    await update.message.reply_text(
        output,
        parse_mode="Markdown",
        reply_markup=vote_keyboard(result_id),
    )
    return AWAITING_TG_USERNAME
