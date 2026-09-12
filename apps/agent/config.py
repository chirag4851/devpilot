import os
from dotenv import load_dotenv

load_dotenv()

EXPRESS_API_URL = os.environ.get("EXPRESS_API_URL", "http://localhost:5001")
