"""Normalize model output into public, ordered parts with stable identifiers."""

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage


class Projection:
    def __init__(self, initial: list | None = None):
        self.parts: list[dict] = initial or []
        self.chunks: dict[str, AIMessageChunk] = {}
        self.usage: dict = {}
        self._aliases: dict[str, str] = {}
        self._response_parts: dict[str, set[str]] = {}

    def _response_key(self, message, source: str | None = None):
        # Responses starts with resp_*, streams under lc_run--*, then adds item
        # IDs at output_text.done. All are aliases of one model invocation.
        response_id = message.response_metadata.get("id")
        aliases = [f"stream:{source}"] if source else []
        aliases.extend(f"message:{mid}" for mid in (response_id, message.id) if mid)
        aliases.extend(f"item:{block['id']}" for block in message.content_blocks if block.get("id"))
        key = next(
            (self._aliases[alias] for alias in aliases if alias in self._aliases),
            response_id or message.id or source or "response",
        )
        for alias in aliases:
            self._aliases[alias] = key
        return key

    def upsert(self, part: dict):
        for i, existing in enumerate(self.parts):
            if existing["id"] == part["id"]:
                self.parts[i] = {**existing, **part}
                return
        self.parts.append(part)

    def message(self, message):
        if isinstance(message, (AIMessage, AIMessageChunk)):
            mid = self._response_key(message)
            current: set[str] = set()
            counts: dict[str, int] = {}
            for block in message.content_blocks:
                kind = block["type"]
                if kind not in ("text", "reasoning"):
                    continue
                index = counts.get(kind, 0)
                counts[kind] = index + 1
                # A provider item may identify several text/summary blocks.
                # Public IDs use the response and block slot, never a late item ID.
                bid = f"{mid}:{kind}:{index}"
                if block["type"] == "text":
                    current.add(bid)
                    self.upsert({"id": bid, "type": "text", "text": block["text"]})
                elif block["type"] == "reasoning":
                    # Only the OpenAI Responses adapter's public summary is surfaced.
                    summary = block.get("reasoning", "")
                    if summary:
                        current.add(bid)
                        self.upsert({"id": bid, "type": "reasoning", "text": summary})
            obsolete = self._response_parts.get(mid, set()) - current
            if obsolete:
                self.parts = [part for part in self.parts if part["id"] not in obsolete]
            self._response_parts[mid] = current
            for call in message.tool_calls:
                if call.get("id"):
                    self.upsert(
                        {
                            "id": call["id"],
                            "type": "tool",
                            "name": call["name"],
                            "input": call["args"],
                            "status": "preparing",
                        }
                    )
            # The final node update owns usage; stream chunks can carry a different
            # LangChain run ID for this same provider response.
            if message.usage_metadata and not isinstance(message, AIMessageChunk):
                response_id = message.response_metadata.get("id") or mid
                self.usage[response_id] = message.usage_metadata
        elif isinstance(message, ToolMessage):
            import json

            try:
                result = json.loads(message.content) if isinstance(message.content, str) else {}
            except (ValueError, TypeError):
                result = {}
            self.upsert(
                {
                    "id": message.tool_call_id,
                    "type": "tool",
                    "name": message.name,
                    "status": "failed" if message.status == "error" else "complete",
                    "result": result.get("message", "Selesai.")
                    if isinstance(result, dict)
                    else "Selesai.",
                }
            )

            if (
                message.name == "search_resources"
                and isinstance(result, dict)
                and "items" in result
            ):
                self.upsert(
                    {
                        "id": message.tool_call_id + ":resources",
                        "type": "resources",
                        "refs": [item["ref"] for item in result["items"]],
                        "query": result.get("query", ""),
                        "has_more": result.get("next_offset") is not None,
                    }
                )

    def chunk(self, chunk: AIMessageChunk, *, source: str | None = None):
        key = self._response_key(chunk, source)
        combined = self.chunks[key] + chunk if key in self.chunks else chunk
        self.chunks[key] = combined
        self.message(combined)

    def reconcile(self, messages: list):
        self.parts = []
        self.chunks.clear()
        self._response_parts.clear()
        start = max(
            (i + 1 for i, m in enumerate(messages) if isinstance(m, HumanMessage)), default=0
        )
        for message in messages[start:]:
            self.message(message)
