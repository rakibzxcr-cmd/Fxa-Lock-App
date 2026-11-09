import re
import uuid
import requests
from bs4 import BeautifulSoup
from telegram import Update
from telegram.ext import ContextTypes
from utils.keyboards import vote_keyboard, back_keyboard
from utils.formatters import fmt_social
from config import AWAITING_SOCIAL

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def _instagram(username: str) -> dict:
    try:
        r = requests.get(
            f"https://www.instagram.com/{username}/",
            headers=HEADERS, timeout=8,
        )
        if r.status_code == 404:
            return {"found": False}
        soup = BeautifulSoup(r.text, "html.parser")
        title = soup.find("meta", property="og:title")
        desc  = soup.find("meta", property="og:description")
        name  = title["content"] if title else None
        bio   = desc["content"]  if desc  else None
        followers = None
        if bio:
            m = re.search(r"([\d,\.]+[KMBk]?)\s*Followers", bio)
            if m:
                followers = m.group(1)
        return {
            "found": r.status_code == 200,
            "data": {
                "name": name, "bio": bio,
                "followers": followers,
                "url": f"https://www.instagram.com/{username}/",
            },
        }
    except Exception:
        return {"found": False}

def _tiktok(username: str) -> dict:
    try:
        r = requests.get(
            f"https://www.tiktok.com/@{username}",
            headers=HEADERS, timeout=8,
        )
        if r.status_code == 404:
            return {"found": False}
        soup = BeautifulSoup(r.text, "html.parser")
        title = soup.find("meta", property="og:title")
        desc  = soup.find("meta", property="og:description")
        name  = title["content"] if title else None
        bio   = desc["content"]  if desc  else None
        followers = None
        if bio:
            m = re.search(r"([\d,\.]+[KMBk]?)\s*Followers", bio, re.IGNORECASE)
            if m:
                followers = m.group(1)
        return {
            "found": r.status_code == 200,
            "data": {
                "name": name, "bio": bio,
                "followers": followers,
                "url": f"https://www.tiktok.com/@{username}",
            },
        }
    except Exception:
        return {"found": False}

def _twitter(username: str) -> dict:
    try:
        r = requests.get(
            f"https://twitter.com/{username}",
            headers=HEADERS, timeout=8,
        )
        soup = BeautifulSoup(r.text, "html.parser")
        title = soup.find("meta", property="og:title")
        desc  = soup.find("meta", property="og:description")
        name  = title["content"] if title else None
        bio   = desc["content"]  if desc  else None
        if r.status_code == 404 or (bio and "this account doesn't exist" in bio.lower()):
            return {"found": False}
        return {
            "found": r.status_code == 200,
            "data": {"name": name, "bio": bio,
                     "url": f"https://twitter.com/{username}"},
        }
    except Exception:
        return {"found": False}

def _github(username: str) -> dict:
    try:
        r = requests.get(
            f"https://api.github.com/users/{username}",
            headers={"Accept": "application/vnd.github+json"},
            timeout=8,
        )
        if r.status_code == 404:
            return {"found": False}
        d = r.json()
        return {
            "found": True,
            "data": {
                "name":      d.get("name"),
                "bio":       d.get("bio"),
                "followers": d.get("followers"),
                "url":       d.get("html_url"),
            },
        }
    except Exception:
        return {"found": False}

SCRAPERS = {
    "Instagram": _instagram,
    "TikTok":    _tiktok,
    "Twitter/X": _twitter,
    "GitHub":    _github,
}

async def ask_social(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "👤 *Social Media Scraper*\n\n"
        "Scrapes public info from Instagram, TikTok, Twitter/X, GitHub.\n\n"
        "Example: `username`",
        parse_mode="Markdown",
        reply_markup=back_keyboard(),
    )
    return AWAITING_SOCIAL

async def handle_social(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "🏠 Main Menu":
        from handlers.start import start
        return await start(update, ctx)

    if len(text) < 2 or len(text) > 60 or " " in text:
        await update.message.reply_text("❌ Invalid username.", reply_markup=back_keyboard())
        return AWAITING_SOCIAL

    msg = await update.message.reply_text("🔎 Scraping public profiles...")

    results = {p: fn(text) for p, fn in SCRAPERS.items()}

    result_id = str(uuid.uuid4())[:8]
    ctx.user_data[f"result_{result_id}"] = {"type": "social", "query": text}

    output = fmt_social(text, results)
    if len(output) > 4000:
        output = output[:4000] + "\n...truncated."

    await msg.edit_text(output, parse_mode="Markdown")
    await update.message.reply_text(
        "⭐ Rate this result:",
        reply_markup=vote_keyboard(result_id),
    )
    return AWAITING_SOCIAL
