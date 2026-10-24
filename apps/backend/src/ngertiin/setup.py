"""Apply the preserved additive account/data migration history explicitly."""

from alembic import command
from alembic.config import Config

from ngertiin.config import ROOT


def main():
    command.upgrade(Config(str(ROOT / "apps/backend/alembic.ini")), "head")
    print("Database migrations complete. Provision owner engine partitions separately.")


if __name__ == "__main__":
    main()
