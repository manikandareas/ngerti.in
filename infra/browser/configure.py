"""Explicit configuration for the direct browser_use.mcp.server entry point."""
import json
from pathlib import Path

Path('/tmp/browser-config.json').write_text(json.dumps({
    'browser_profile': {'ngertiin': {
        'id': 'ngertiin', 'default': True, 'headless': False,
        'user_data_dir': '/profile', 'cdp_url': 'http://127.0.0.1:9222',
        'keep_alive': True, 'is_local': False, 'enable_default_extensions': False,
        'downloads_path': '/tmp/downloads', 'disable_security': False,
    }},
    'llm': {}, 'agent': {},
}))
