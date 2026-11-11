"""No network or heavyweight model required for this regression test."""
import unittest
from pathlib import Path
from unittest.mock import patch
import bootstrap


class BootstrapTests(unittest.TestCase):
    def test_existing_model_skips_download(self):
        with patch.object(bootstrap, "READY", Path(__file__)), \
             patch("importlib.util.find_spec", return_value=object()), \
             patch("subprocess.check_call") as install:
            bootstrap.main()
            install.assert_not_called()


if __name__ == "__main__":
    unittest.main()
