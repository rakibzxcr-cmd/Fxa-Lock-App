import re
import uuid
import requests
from telegram import Update
from telegram.ext import ContextTypes
from utils.keyboards import vote_keyboard, back_keyboard
from utils.formatters import fmt_ip
from config import AWAITING_IP, IPINFO_TOKEN

IP_RE = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}"
    r"(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
)

async def ask_ip(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🌐 *IP Lookup*\n\nSend an IPv4 address.\n\nExample: `8.8.8.8`",
        parse_mode="Markdown",
        reply_markup=back_keyboard(),
    )
    return AWAITING_IP

async def handle_ip(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "🏠 Main Menu":
        from handlers.start import start
        return await start(update, ctx)

    if not IP_RE.match(text):
        await update.message.reply_text(
            "❌ Invalid IP address. Try again.",
            reply_markup=back_keyboard(),
        )
        return AWAITING_IP

    await update.message.reply_text("🔎 Looking up...")

    try:
        r = requests.get(
            f"http://ip-api.com/json/{text}",
            params={
                "fields": "status,message,country,countryCode,region,regionName,"
                          "city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,mobile,query"
            },
            timeout=8,
        )
        data = r.json()

        if data.get("status") == "fail":
            await update.message.reply_text(f"❌ {data.get('message', 'Lookup failed.')}")
            return AWAITING_IP

        if IPINFO_TOKEN:
            try:
                ri = requests.get(
                    f"https://ipinfo.io/{text}/json",
                    headers={"Authorization": f"Bearer {IPINFO_TOKEN}"},
                    timeout=5,
                )
                extra = ri.json()
                data["abuse"]   = extra.get("abuse", {})
                data["privacy"] = extra.get("privacy", {})
            except Exception:
                pass

        result_id = str(uuid.uuid4())[:8]
        ctx.user_data[f"result_{result_id}"] = {"type": "ip", "query": text}

        await update.message.reply_text(
            fmt_ip(data),
            parse_mode="Markdown",
            reply_markup=vote_keyboard(result_id),
        )
    except requests.RequestException as e:
        await update.message.reply_text(f"❌ Network error: {e}")

    return AWAITING_IP
