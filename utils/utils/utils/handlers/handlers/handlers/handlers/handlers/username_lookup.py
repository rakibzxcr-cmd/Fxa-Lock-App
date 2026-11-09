import uuid
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from telegram import Update
from telegram.ext import ContextTypes
from utils.keyboards import vote_keyboard, back_keyboard
from utils.formatters import fmt_username
from config import AWAITING_USERNAME

PLATFORMS = {
    "GitHub":      "https://github.com/{u}",
    "GitLab":      "https://gitlab.com/{u}",
    "Twitter/X":   "https://twitter.com/{u}",
    "Instagram":   "https://www.instagram.com/{u}/",
    "TikTok":      "https://www.tiktok.com/@{u}",
    "Reddit":      "https://www.reddit.com/user/{u}",
    "Pinterest":   "https://www.pinterest.com/{u}/",
    "Twitch":      "https://www.twitch.tv/{u}",
    "YouTube":     "https://www.youtube.com/@{u}",
    "Medium":      "https://medium.com/@{u}",
    "Telegram":    "https://t.me/{u}",
    "Steam":       "https://steamcommunity.com/id/{u}",
    "DeviantArt":  "https://www.deviantart.com/{u}",
    "SoundCloud":  "https://soundcloud.com/{u}",
    "Keybase":     "https://keybase.io/{u}",
    "Pastebin":    "https://pastebin.com/u/{u}",
    "HackerNews":  "https://news.ycombinator.com/user?id={u}",
    "VK":          "https://vk.com/{u}",
    "Replit":      "https://replit.com/@{u}",
    "Snapchat":    "https://www.snapchat.com/add/{u}",
    "Linktree":    "https://linktr.ee/{u}",
    "ProductHunt": "https://www.producthunt.com/@{u}",
}

NOT_FOUND = [
    "this page isn't available", "user not found", "page not found",
    "doesn't exist", "no user", "account not found",
    "this account doesn't exist", "sorry, that page doesn't exist",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def _check(platform: str, url: str, username: str) -> tuple:
    try:
        r = requests.get(url, headers=HEADERS, timeout=7, allow_redirects=True)
        body = r.text.lower()
        if r.status_code == 404:
            return platform, {"found": False, "url": url}
        if r.status_code == 200:
            for indicator in NOT_FOUND:
                if indicator in body:
                    return platform, {"found": False, "url": url}
            if username.lower() in body:
                return platform, {"found": True, "url": url}
            return platform, {"found": True, "url": url}
        return platform, {"found": False, "url": url}
    except Exception:
        return platform, {"found": False, "url": url}

async def ask_username(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "🔍 *Username Lookup*\n\nSend a username to scan 20+ platforms.\n\nExample: `johndoe`",
        parse_mode="Markdown",
        reply_markup=back_keyboard(),
    )
    return AWAITING_USERNAME

async def handle_username(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "🏠 Main Menu":
        from handlers.start import start
        return await start(update, ctx)

    if len(text) < 2 or len(text) > 50 or " " in text:
        await update.message.reply_text(
            "❌ Username: 2–50 chars, no spaces.",
            reply_markup=back_keyboard(),
        )
        return AWAITING_USERNAME

    msg = await update.message.reply_text(f"🔎 Scanning {len(PLATFORMS)} platforms...")

    urls    = {p: t.format(u=text) for p, t in PLATFORMS.items()}
    results = {}

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_check, p, u, text): p for p, u in urls.items()}
        for future in as_completed(futures):
            platform, data = future.result()
            results[platform] = data

    result_id = str(uuid.uuid4())[:8]
    ctx.user_data[f"result_{result_id}"] = {"type": "username", "query": text}

    output = fmt_username(text, results)
    if len(output) > 4000:
        output = output[:4000] + "\n\n...truncated."

    await msg.edit_text(output, parse_mode="Markdown")
    await update.message.reply_text(
        "⭐ Rate this result:",
        reply_markup=vote_keyboard(result_id),
    )
    return AWAITING_USERNAME
