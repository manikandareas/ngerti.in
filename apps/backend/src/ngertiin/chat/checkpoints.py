"""Fence checkpoint writes with the same run ownership checked by domain writes."""

import asyncio

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from ngertiin.chat.store import StaleRun


class RunSaver(AsyncPostgresSaver):
    def __init__(self, connection, run: dict):
        super().__init__(connection)
        self.connection = connection
        self.run = run
        self.write_lock = asyncio.Lock()

    async def check_owner(self):
        cursor = await self.connection.execute(
            "SELECT id FROM chat_runs WHERE id=%s AND lease_token=%s "
            "AND status='running' AND NOT cancel_requested FOR SHARE",
            (self.run["id"], self.run["lease_token"]),
        )
        if not await cursor.fetchone():
            raise StaleRun()

    async def aput(self, config, checkpoint, metadata, new_versions):
        async with self.write_lock, self.connection.transaction():
            await self.check_owner()
            return await super().aput(config, checkpoint, metadata, new_versions)

    async def aput_writes(self, config, writes, task_id, task_path=""):
        async with self.write_lock, self.connection.transaction():
            await self.check_owner()
            await super().aput_writes(config, writes, task_id, task_path)
