import os
import json
from collections import defaultdict
from telegram import Update
from telegram.ext import ContextTypes

_votes: dict = defaultdict(list)

def _save():
    try:
        with open("votes.json", "w") as f:
            json.dump(dict(_votes), f)
    except Exception:
        pass

def _load():
    if os.path.exists("votes.json"):
        try:
            with open("votes.json") as f:
                for k, v in json.load(f).items():
                    _votes[k] = v
        except Exception:
            pass

_load()
STARS = {1: "⭐", 2: "⭐⭐", 3: "⭐⭐⭐", 4: "⭐⭐⭐⭐", 5: "⭐⭐⭐⭐⭐"}

async def handle_vote(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    try:
        _, stars_str, result_id = query.data.split(":")
        stars = int(stars_str)
    except (ValueError, AttributeError):
        return

    user_id = query.from_user.id
    if any(v[0] == user_id for v in _votes[result_id]):
        await query.answer("You already voted on this.", show_alert=True)
        return

    _votes[result_id].append((user_id, stars))
    _save()

    all_s = [v[1] for v in _votes[result_id]]
    avg   = sum(all_s) / len(all_s)
    meta  = ctx.user_data.get(f"result_{result_id}", {})

    await query.edit_message_text(
        f"✅ *Vote recorded!*\n\n"
        f"You rated: {STARS[stars]} ({stars}/5)\n"
        f"Query: `{meta.get('query', '')}` [{meta.get('type', '')}]\n\n"
        f"📊 Average: {avg:.1f}/5 from {len(all_s)} vote(s)",
        parse_mode="Markdown",
    )

async def stats_command(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _votes:
        await update.message.reply_text("📊 No votes yet.")
        return
    all_s = [s for votes in _votes.values() for _, s in votes]
    avg   = sum(all_s) / len(all_s) if all_s else 0
    await update.message.reply_text(
        f"📊 *Statistics*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"Results rated: {len(_votes)}\n"
        f"Total votes: {len(all_s)}\n"
        f"Average score: {avg:.2f}/5",
        parse_mode="Markdown",
    )
