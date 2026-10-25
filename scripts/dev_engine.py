"""Run the durable account provisioner in development."""

from ngertiin.agent_engine.provisioner import main
from ngertiin.config import get_settings

if __name__ == "__main__":
    if get_settings().app_env != "development":
        raise RuntimeError(
            "Use the production provisioner with an isolated partition driver"
        )
    main()
