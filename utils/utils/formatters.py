def fmt_ip(data: dict) -> str:
    lines = [
        "🌐 *IP Lookup Result*",
        "━━━━━━━━━━━━━━━━━━━",
        f"🔹 IP: `{data.get('ip', 'N/A')}`",
        f"🏳️ Country: {data.get('country', 'N/A')} ({data.get('countryCode', '')})",
        f"🌆 City: {data.get('city', 'N/A')}",
        f"🗺️ Region: {data.get('regionName', 'N/A')}",
        f"📮 ZIP: {data.get('zip', 'N/A')}",
        f"🕐 Timezone: {data.get('timezone', 'N/A')}",
        f"📡 ISP: {data.get('isp', 'N/A')}",
        f"🏢 Org: {data.get('org', 'N/A')}",
        f"📍 Lat/Lon: {data.get('lat', 'N/A')}, {data.get('lon', 'N/A')}",
        f"🔒 Proxy: {data.get('proxy', False)} | Hosting: {data.get('hosting', False)}",
        f"🕵️ Mobile: {data.get('mobile', False)}",
    ]
    return "\n".join(lines)

def fmt_breach(email: str, breaches: list) -> str:
    if not breaches:
        return f"✅ *Breach Check*\n\n`{email}` — Not found in any known breaches."
    lines = [
        "💥 *Breach Check*",
        "━━━━━━━━━━━━━━━━━━━",
        f"📧 Email: `{email}`",
        f"⚠️ Found in *{len(breaches)}* breach(es):\n",
    ]
    for b in breaches[:10]:
        lines.append(
            f"🔸 *{b.get('Name', 'Unknown')}* ({b.get('BreachDate', 'N/A')})\n"
            f"   Data: {', '.join(b.get('DataClasses', [])[:5])}"
        )
    if len(breaches) > 10:
        lines.append(f"\n...and {len(breaches) - 10} more.")
    return "\n".join(lines)

def fmt_phone(data: dict, number: str) -> str:
    lines = [
        "📱 *Phone Lookup*",
        "━━━━━━━━━━━━━━━━━━━",
        f"🔹 Number: `{number}`",
        f"✅ Valid: {data.get('valid', False)}",
        f"🌍 Country: {data.get('country_name', 'N/A')} ({data.get('country_code', 'N/A')})",
        f"📡 Carrier: {data.get('carrier', 'N/A')}",
        f"📶 Line Type: {data.get('line_type', 'N/A')}",
        f"🔢 Local Format: {data.get('local_format', 'N/A')}",
        f"🌐 Intl Format: {data.get('international_format', 'N/A')}",
        f"🏳️ Location: {data.get('location', 'N/A')}",
    ]
    return "\n".join(lines)

def fmt_username(username: str, results: dict) -> str:
    lines = [
        "🔍 *Username Lookup*",
        "━━━━━━━━━━━━━━━━━━━",
        f"👤 Username: `{username}`\n",
    ]
    found, not_found = [], []
    for site, data in results.items():
        if data["found"]:
            found.append(f"✅ *{site}*: {data['url']}")
        else:
            not_found.append(site)
    lines.append(f"🟢 Found on *{len(found)}* platforms:\n")
    lines.extend(found)
    if not_found:
        lines.append(f"\n🔴 Not found: {', '.join(not_found)}")
    return "\n".join(lines)

def fmt_email(email: str, data: dict) -> str:
    lines = [
        "📧 *Email Lookup*",
        "━━━━━━━━━━━━━━━━━━━",
        f"📮 Email: `{email}`",
        f"✅ Valid format: {data.get('valid_format', False)}",
        f"📡 Deliverable: {data.get('deliverable', 'unknown')}",
        f"🏢 Domain: {data.get('domain', 'N/A')}",
        f"📮 MX Records: {data.get('mx_records', False)}",
        f"🔒 Disposable: {data.get('disposable', False)}",
        f"🤖 Role address: {data.get('role', False)}",
        f"🌐 Free provider: {data.get('free', False)}",
    ]
    if data.get("sources"):
        lines.append("\n🔗 Found in sources:")
        for src in data["sources"][:5]:
            lines.append(f"  • {src.get('uri', 'N/A')} ({src.get('domain', '')})")
    return "\n".join(lines)

def fmt_social(username: str, results: dict) -> str:
    lines = [
        "👤 *Social Media Scraper*",
        "━━━━━━━━━━━━━━━━━━━━━━━",
        f"🔎 Target: `{username}`\n",
    ]
    for platform, info in results.items():
        status = "✅" if info.get("found") else "❌"
        lines.append(f"{status} *{platform}*")
        if info.get("found") and info.get("data"):
            d = info["data"]
            if d.get("name"):      lines.append(f"   Name: {d['name']}")
            if d.get("bio"):       lines.append(f"   Bio: {d['bio'][:80]}")
            if d.get("followers"): lines.append(f"   Followers: {d['followers']}")
            if d.get("url"):       lines.append(f"   URL: {d['url']}")
        lines.append("")
    return "\n".join(lines)

def fmt_tg_username(username: str, data: dict) -> str:
    lines = [
        "✈️ *Telegram Username Lookup*",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"🔹 Username: `@{username}`",
    ]
    if data.get("found"):
        lines += [
            f"👤 Name: {data.get('first_name', '')} {data.get('last_name', '')}".strip(),
            f"📱 Phone: {data.get('phone', '❌ Not public')}",
            f"🤖 Bot: {data.get('is_bot', False)}",
            f"🔗 Profile: https://t.me/{username}",
        ]
    else:
        lines.append(f"\n❌ {data.get('error', 'User not found or private.')}")
    return "\n".join(lines)
