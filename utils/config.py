import os
from dotenv import load_dotenv

load_dotenv(dotenv_path='config.env')

UNFOLLOWERS_PER_DAY = int(os.getenv("UNFOLLOWERS_PER_DAY", 200))
UNFOLLOWERS_PER_HOUR = int(os.getenv("UNFOLLOWERS_PER_HOUR", 20))
MIN_DELAY = float(os.getenv("MIN_DELAY", 2))
MAX_DELAY = float(os.getenv("MAX_DELAY", 5))
USERNAME = os.getenv("USERNAME", "")
