"""Add the vps/ directory to sys.path so tests can import mt5_client and main."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
