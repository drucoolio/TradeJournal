"""Add the mac/ directory to sys.path so tests can import receiver."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
