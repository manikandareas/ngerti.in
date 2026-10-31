"""Minimal audited patch: native binding metadata and visible tab activation, no model loop."""
from pathlib import Path
import importlib.util

spec = importlib.util.find_spec('browser_use.mcp.server')
path = Path(spec.origin)
source = path.read_text()
old = "\t\tresult: dict[str, Any] = {\n\t\t\t'url': state.url,"
new = """\t\tresult: dict[str, Any] = {
\t\t\t'binding': {
\t\t\t\t'native_session_id': self.browser_session.id,
\t\t\t\t'target_id': self.browser_session.agent_focus_target_id,
\t\t\t\t'tabs': [{'target_id': tab.target_id, 'tab_id': tab.target_id[-4:]} for tab in await self.browser_session.get_tabs()],
\t\t\t},
\t\t\t'url': state.url,"""
assert source.count(old) == 1, 'Upstream state contract changed'
source = source.replace(old, new)
# CDP focus and visual focus must agree after any direct action. The application serializes calls.
old = "\t\t\t\tresult = await self._execute_tool(name, arguments or {})"
new = """\t\t\t\tresult = await self._execute_tool(name, arguments or {})
\t\t\t\tif self.browser_session and self.browser_session.agent_focus_target_id:
\t\t\t\t\tawait self.browser_session.cdp_client.send.Target.activateTarget(params={'targetId': self.browser_session.agent_focus_target_id})"""
assert source.count(old) == 1, 'Upstream dispatch contract changed'
source = source.replace(old, new)
path.write_text(source)
