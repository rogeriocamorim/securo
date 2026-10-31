"""Sync-time adoption of rows stored under the pre-fingerprint entry_reference id.

Issue #1063: a settlement batch can share one entry_reference across two
ledger lines. Rows synced before the fingerprint id were stored under that
reference, so the first sync after the upgrade must adopt them rather than
duplicate them, and must not hand one sibling's row to the other.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_connection import BankConnection
from app.models.transaction import Transaction
from app.providers.base import AccountData, TransactionData
from app.services.connection_service import sync_connection

SHARED_REF = "205062608292ALB-0068XWUO2NW7"
ROUND_UP = dict(description="Round up", amount=Decimal("0.55"), date=date(2026, 8, 31))
CARD = dict(description="Card payment", amount=Decimal("1006.45"), date=date(2026, 8, 31))


def _provider(transactions: list[TransactionData]) -> AsyncMock:
    provider = AsyncMock()
    provider.refresh_credentials = AsyncMock(return_value={"token": "t"})
    provider.get_accounts = AsyncMock(return_value=[
        AccountData(
            external_id="eb-account",
            name="Current",
            type="checking",
            balance=Decimal("100"),
            currency="EUR",
        ),
    ])
    provider.get_transactions = AsyncMock(return_value=transactions)
    provider.get_holdings = AsyncMock(return_value=[])
    return provider


def _txn(external_id: str, legacy: str | None, spec: dict) -> TransactionData:
    return TransactionData(
        external_id=external_id,
        legacy_external_id=legacy,
        description=spec["description"],
        amount=spec["amount"],
        date=spec["date"],
        type="debit",
        currency="EUR",
    )


async def _sync(session: AsyncSession, conn: BankConnection, workspace_id, user_id, provider):
    p1 = patch("app.services.connection_service.detect_transfer_pairs", new_callable=AsyncMock)
    p2 = patch("app.services.connection_service.stamp_primary_amount", new_callable=AsyncMock)
    p3 = patch("app.services.connection_service.apply_rules_to_transaction", new_callable=AsyncMock)
    with patch("app.services.connection_service.get_provider", return_value=provider), p1, p2, p3:
        await sync_connection(session, conn.id, workspace_id, user_id)


async def _make_connection(session: AsyncSession, user_id) -> BankConnection:
    conn = BankConnection(
        id=uuid.uuid4(), user_id=user_id, provider="test",
        external_id=f"ext-{uuid.uuid4().hex[:8]}",
        institution_name="Bank", credentials={"token": "fake"},
        status="active", settings=None,
        last_sync_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )
    session.add(conn)
    await session.commit()
    await session.refresh(conn)
    return conn


async def _rows(session: AsyncSession) -> list[Transaction]:
    result = await session.execute(
        select(Transaction).where(Transaction.description.in_(["Round up", "Card payment"]))
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_legacy_row_is_adopted_not_duplicated_when_window_has_one_sibling(
    session: AsyncSession, test_user, test_workspace,
):
    """Stored under the shared reference before the upgrade. The next sync's
    window holds only the card payment; it must not claim the round-up's row,
    and the round-up's own row must keep its id."""
    conn = await _make_connection(session, test_user.id)

    # Before the upgrade: the round-up was stored under the shared reference.
    await _sync(session, conn, test_workspace.id, test_user.id,
                _provider([_txn(SHARED_REF, None, ROUND_UP)]))
    assert [t.external_id for t in await _rows(session)] == [SHARED_REF]

    # After the upgrade, a window containing only the card payment.
    await _sync(session, conn, test_workspace.id, test_user.id,
                _provider([_txn("fp-card", SHARED_REF, CARD)]))

    rows = {t.description: t for t in await _rows(session)}
    assert set(rows) == {"Round up", "Card payment"}
    assert rows["Round up"].external_id == SHARED_REF
    assert rows["Card payment"].external_id == "fp-card"


@pytest.mark.asyncio
async def test_legacy_rows_are_adopted_by_their_own_transactions_in_any_order(
    session: AsyncSession, test_user, test_workspace,
):
    """Both siblings exist under the shared reference from before the upgrade
    (one of them was dropped by the old code, so it is stored once). Syncing
    with the card payment first must not steal the round-up's row."""
    conn = await _make_connection(session, test_user.id)
    await _sync(session, conn, test_workspace.id, test_user.id,
                _provider([_txn(SHARED_REF, None, ROUND_UP)]))

    await _sync(session, conn, test_workspace.id, test_user.id,
                _provider([
                    _txn("fp-card", SHARED_REF, CARD),
                    _txn("fp-round", SHARED_REF, ROUND_UP),
                ]))

    rows = {t.description: t for t in await _rows(session)}
    assert len(rows) == 2
    assert rows["Round up"].external_id == "fp-round"
    assert rows["Round up"].amount == Decimal("0.55")
    assert rows["Card payment"].external_id == "fp-card"
    assert rows["Card payment"].amount == Decimal("1006.45")
