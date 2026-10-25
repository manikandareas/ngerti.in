"""Account upsert and durable setup requests share one PostgreSQL transaction."""

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from ngertiin.models import Account


def ensure_account(session: Session, subject: str) -> Account:
    account = Account(clerk_user_id=subject)
    session.exec(
        insert(Account)
        .values(id=account.id, clerk_user_id=subject, created_at=account.created_at)
        .on_conflict_do_nothing(index_elements=["clerk_user_id"])
    )
    account = session.exec(select(Account).where(Account.clerk_user_id == subject)).one()
    enqueue(session, str(account.id))
    return account


def enqueue(session: Session, owner: str):
    session.execute(
        text(
            "INSERT INTO account_provisioning(owner_id) VALUES (:owner) ON "
            "CONFLICT(owner_id) DO NOTHING"
        ),
        {"owner": owner},
    )


def status(session: Session, owner: str):
    row = (
        session.execute(
            text("SELECT status,error_code,result FROM account_provisioning WHERE owner_id=:owner"),
            {"owner": owner},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else {"status": "pending", "error_code": None, "result": None}
