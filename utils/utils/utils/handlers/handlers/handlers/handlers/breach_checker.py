import re
import uuid
import requests
from telegram import Update
from telegram.ext import ContextTypes
from utils.keyboards import vote_keyboard, back_keyboard
from utils.formatters import fmt_breach
from config import AWAITING_EMAIL, HIBP_API_KEY

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

async def ask_breach(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "💥 *Breach Checker*\n\nSend an email address.\n\nExample: `test@example.com`",
        parse_mode="Markdown",
        reply_markup=back_keyboard(),
    )
    return AWAITING_EMAIL

async def handle_breach(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "🏠 Main Menu":
        from handlers.start import start
        return await start(update, ctx)

    if not EMAIL_RE.match(text):
        await update.message.reply_text("❌ Invalid email.", reply_markup=back_keyboard())
        return AWAITING_EMAIL

    await update.message.reply_text("🔎 Checking breach databases...")

    if not HIBP_API_KEY:
        await update.message.reply_text(
            "⚠️ HIBP_API_KEY not set.\nGet one at: https://haveibeenpwned.com/API/Key"
        )
        return AWAITING_EMAIL

    try:
        r = requests.get(
            f"https://haveibeenpwned.com/api/v3/breachedaccount/{text}",
            headers={
                "hibp-api-key": HIBP_API_KEY,
                "User-Agent": "OSINT-BD-Bot",
            },
            params={"truncateResponse": "false"},
            timeout=10,
        )
        if r.status_code == 404:
            breaches = []
        elif r.status_code == 401:
            await update.message.reply_text("❌ Invalid HIBP API key.")
            return AWAITING_EMAIL
        elif r.status_code == 429:
            await update.message.reply_text("⏳ Rate limited. Try again in a minute.")
            return AWAITING_EMAIL
        else:
            breaches = r.json() if r.status_code == 200 else []

        result_id = str(uuid.uuid4())[:8]
        ctx.user_data[f"result_{result_id}"] = {"type": "breach", "query": text}

        await update.message.reply_text(
            fmt_breach(text, breaches),
            parse_mode="Markdown",
            reply_markup=vote_keyboard(result_id),
        )
    except requests.RequestException as e:
        await update.message.reply_text(f"❌ Network error: {e}")

    return AWAITING_EMAIL
