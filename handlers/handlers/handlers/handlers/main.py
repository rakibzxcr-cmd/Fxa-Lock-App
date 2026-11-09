import logging
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    filters,
)
from config import (
    BOT_TOKEN,
    CHOOSING,
    AWAITING_IP,
    AWAITING_EMAIL,
    AWAITING_USERNAME,
    AWAITING_PHONE,
    AWAITING_SOCIAL,
    AWAITING_TG_USERNAME,
)
from handlers.start          import start, cancel
from handlers.ip_lookup      import ask_ip, handle_ip
from handlers.breach_checker import ask_breach, handle_breach
from handlers.email_lookup   import ask_email, handle_email
from handlers.username_lookup import ask_username, handle_username
from handlers.phone_lookup   import ask_phone, handle_phone
from handlers.social_scraper import ask_social, handle_social
from handlers.tg_username    import ask_tg_username, handle_tg_username
from handlers.vote_handler   import handle_vote, stats_command

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

async def route_menu(update: Update, ctx) -> int:
    text = update.message.text
    if text == "📧 Email Lookup":
        ctx.user_data["email_mode"] = "lookup"
    elif text == "💥 Breach Checker":
        ctx.user_data["email_mode"] = "breach"

    routes = {
        "🌐 IP Lookup":                   ask_ip,
        "💥 Breach Checker":              ask_breach,
        "📧 Email Lookup":                ask_email,
        "🔍 Username Lookup":             ask_username,
        "📱 Phone Lookup":                ask_phone,
        "👤 Social Scraper":              ask_social,
        "✈️ Telegram Username Lookup":    ask_tg_username,
    }
    handler = routes.get(text)
    if handler:
        return await handler(update, ctx)
    return CHOOSING

async def dispatch_email(update: Update, ctx) -> int:
    if ctx.user_data.get("email_mode") == "breach":
        return await handle_breach(update, ctx)
    return await handle_email(update, ctx)

def build_app():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    menu_filter = filters.Regex(
        r"^(🔍 Username Lookup|📧 Email Lookup|🌐 IP Lookup|"
        r"💥 Breach Checker|📱 Phone Lookup|👤 Social Scraper|"
        r"✈️ Telegram Username Lookup)$"
    )

    conv = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            CHOOSING:            [MessageHandler(filters.TEXT & ~filters.COMMAND, route_menu)],
            AWAITING_IP:         [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_ip)],
            AWAITING_EMAIL:      [MessageHandler(filters.TEXT & ~filters.COMMAND, dispatch_email)],
            AWAITING_USERNAME:   [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_username)],
            AWAITING_PHONE:      [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_phone)],
            AWAITING_SOCIAL:     [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_social)],
            AWAITING_TG_USERNAME:[MessageHandler(filters.TEXT & ~filters.COMMAND, handle_tg_username)],
        },
        fallbacks=[
            CommandHandler("cancel", cancel),
            CommandHandler("start", start),
            MessageHandler(filters.Regex(r"^🏠 Main Menu$"), start),
        ],
        allow_reentry=True,
    )

    app.add_handler(conv)
    app.add_handler(CallbackQueryHandler(handle_vote, pattern=r"^vote:"))
    app.add_handler(CommandHandler("stats", stats_command))
    return app

if __name__ == "__main__":
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN not set.")
    app = build_app()
    logging.getLogger(__name__).info("Bot starting...")
    app.run_polling(drop_pending_updates=True)
