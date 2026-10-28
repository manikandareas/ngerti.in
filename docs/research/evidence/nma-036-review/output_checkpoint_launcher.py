"""Kill after all script outputs commit, before presentation settlement."""
import json
import os
import signal
from pathlib import Path
from ngertiin_engine.store import Store

original = Store.write

def write(self, operation, **kwargs):
    result = original(self, operation, **kwargs)
    if 'Automations.execute.<locals>.<lambda>' in operation.__qualname__:
        rows = original(self, lambda c: c.execute(
            "SELECT configuration,outputs FROM nma_automation_jobs WHERE state='running'"
        ).fetchall())
        for config, outputs in rows:
            if len(json.loads(outputs)) == len(json.loads(config)['automation']['steps']):
                Path(os.environ['NMA_TEST_MARKER']).write_text('all_outputs_committed')
                os.kill(os.getpid(), signal.SIGKILL)
    return result

Store.write = write
from ngertiin_engine.service import main
main()
