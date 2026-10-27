"""Wait for the submitted document, rather than the departing document's readiness.

The pinned native helper polls readyState only. During cross-document navigation,
the old document remains complete until response headers arrive. Track the native
Navigation API before actions and retain the helper's signature and timeout result.
Neither observation nor waiting submits or retries an action.
"""

import time

INITIALIZE = """(() => {
  const key = Symbol.for('ngertiin.browser.navigation.v1');
  if (globalThis[key]) return;
  const state = globalThis[key] = {pending: false};
  if (globalThis.navigation) {
    navigation.addEventListener('navigate', event => {
      if (!event.destination.sameDocument) state.pending = true;
    });
    navigation.addEventListener('navigateerror', () => { state.pending = false; });
  }
})()"""

PREAMBLE = (
    "import sys as _nma_sys\n"
    "_nma_sys.path.insert(0, '/opt/engine')\n"
    "from ngertiin_engine.browser_load import wait_for_load\n"
)


def wait_for_load(timeout=15.0):
    from browser_harness.helpers import js

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            state = js(
                # Form submission schedules navigation on a later browser task.
                # Await that task boundary before trusting the departing page.
                "new Promise(resolve => setTimeout(() => resolve({ready: document.readyState, pending: !!globalThis[Symbol.for('ngertiin.browser.navigation.v1')]?.pending}), 0))"
            )
        except RuntimeError as error:
            if not any(
                message in str(error)
                for message in (
                    "Execution context was destroyed",
                    "Cannot find context with specified id",
                    "Cannot find default execution context",
                )
            ):
                raise
        else:
            if state["ready"] == "complete" and not state["pending"]:
                return True
        time.sleep(0.05)
    return False
