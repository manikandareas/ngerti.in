"""Task leases fence checkpoint writes as well as domain writes."""

import asyncio

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from ngertiin.tasks.store import StaleExecution


class TaskSaver(AsyncPostgresSaver):
    def __init__(self, connection, execution: dict):
        super().__init__(connection)
        self.connection = connection
        self.execution = execution
        self.write_lock = asyncio.Lock()

    async def check_owner(self):
        cursor = await self.connection.execute(
            "SELECT id FROM background_tasks WHERE id=%s AND lease_token=%s AND revision=%s "
            "AND status='running' FOR SHARE",
            (self.execution["id"], self.execution["lease_token"], self.execution["revision"]),
        )
        if not await cursor.fetchone():
            raise StaleExecution()

    async def aput(self, config, checkpoint, metadata, new_versions):
        async with self.write_lock, self.connection.transaction():
            await self.check_owner()
            return await super().aput(config, checkpoint, metadata, new_versions)

    async def aput_writes(self, config, writes, task_id, task_path=""):
        async with self.write_lock, self.connection.transaction():
            await self.check_owner()
            await super().aput_writes(config, writes, task_id, task_path)
