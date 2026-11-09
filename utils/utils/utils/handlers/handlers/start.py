from telegram import Update
from telegram.ext import ContextTypes
from utils.keyboards import main_menu_keyboard
from config import CHOOSING

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = (
        "👁️ *OSINT Bot — BD Vet Community*\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        "🔍 Username Lookup\n"
        "📧 Email Lookup\n"
        "🌐 IP Lookup\n"
        "💥 Breach Checker\n"
        "📱 Phone Lookup\n"
        "👤 Social Scraper\n"
        "✈️ Telegram Username Lookup\n\n"
        "_All lookups use publicly available data only._"
    )
    await update.message.reply_text(
        text,
        parse_mode="Markdown",
        reply_markup=main_menu_keyboard(),
    )
    return CHOOSING

async def cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🏠 Back to main menu.",
        reply_markup=main_menu_keyboard(),
    )
    return CHOOSING
