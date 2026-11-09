import os

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
HIBP_API_KEY = os.environ.get("HIBP_API_KEY", "")
NUMVERIFY_KEY = os.environ.get("NUMVERIFY_KEY", "")
HUNTER_API_KEY = os.environ.get("HUNTER_API_KEY", "")
IPINFO_TOKEN = os.environ.get("IPINFO_TOKEN", "")

(
    CHOOSING,
    AWAITING_IP,
    AWAITING_EMAIL,
    AWAITING_USERNAME,
    AWAITING_PHONE,
    AWAITING_SOCIAL,
    AWAITING_TG_USERNAME,
) = range(7)
