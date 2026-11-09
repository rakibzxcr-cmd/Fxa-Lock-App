from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup

def main_menu_keyboard():
    keyboard = [
        ["🔍 Username Lookup",   "📧 Email Lookup"],
        ["🌐 IP Lookup",         "💥 Breach Checker"],
        ["📱 Phone Lookup",      "👤 Social Scraper"],
        ["✈️ Telegram Username Lookup"],
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def vote_keyboard(result_id: str) -> InlineKeyboardMarkup:
    buttons = [
        InlineKeyboardButton("⭐ 1", callback_data=f"vote:1:{result_id}"),
        InlineKeyboardButton("⭐ 2", callback_data=f"vote:2:{result_id}"),
        InlineKeyboardButton("⭐ 3", callback_data=f"vote:3:{result_id}"),
        InlineKeyboardButton("⭐ 4", callback_data=f"vote:4:{result_id}"),
        InlineKeyboardButton("⭐ 5", callback_data=f"vote:5:{result_id}"),
    ]
    return InlineKeyboardMarkup([buttons])

def back_keyboard():
    return ReplyKeyboardMarkup([["🏠 Main Menu"]], resize_keyboard=True)
