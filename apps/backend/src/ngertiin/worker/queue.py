"""Procrastinate owns job delivery; LangGraph owns workflow checkpoints."""

from procrastinate import App, PsycopgConnector

from ngertiin.config import get_settings

queue_app = App(
    connector=PsycopgConnector(conninfo=get_settings().database_url.get_secret_value()),
)

__all__ = ["queue_app"]
