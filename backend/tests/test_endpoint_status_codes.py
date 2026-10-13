"""Smoke tests: read endpoints return 200 (never 500) once real data exists.

/api/reports/income-expenses uses Postgres-only SQL (to_char), so it is left
to the Postgres-backed tests.

Several 500s only show up when rows exist (lazy relationships touched during
response serialization, e.g. the group transactions MissingGreenlet). These
tests seed one account, category, group with a split and a transaction, then
hit the main GET endpoints that consume them.
"""
import uuid

import pytest
from httpx import AsyncClient


async def _create_account(client: AsyncClient, auth_headers) -> dict:
    resp = await client.post(
        "/api/accounts",
        headers=auth_headers,
        json={"name": "Wallet", "type": "checking", "balance": 0, "currency": "USD"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


async def _create_category(client: AsyncClient, auth_headers) -> dict:
    resp = await client.post(
        "/api/categories",
        headers=auth_headers,
        json={"name": "Food", "type": "expense"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


async def _create_group_with_split_tx(client: AsyncClient, auth_headers, account_id) -> dict:
    group_resp = await client.post(
        "/api/groups",
        headers=auth_headers,
        json={"name": "Roommates", "kind": "social", "default_currency": "USD"},
    )
    assert group_resp.status_code == 201, group_resp.text
    group = group_resp.json()

    member_resp = await client.post(
        f"/api/groups/{group['id']}/members",
        headers=auth_headers,
        json={"name": "Ana"},
    )
    assert member_resp.status_code == 201, member_resp.text
    member = member_resp.json()

    tx_resp = await client.post(
        "/api/transactions",
        headers=auth_headers,
        json={
            "account_id": account_id,
            "description": "Groceries",
            "amount": 60,
            "date": "2026-04-28",
            "type": "debit",
            "currency": "USD",
            "splits": {
                "share_type": "equal",
                "splits": [{"group_member_id": member["id"]}],
            },
        },
    )
    assert tx_resp.status_code == 201, tx_resp.text
    return {"group": group, "member": member, "transaction": tx_resp.json()}


@pytest.fixture
async def seeded(client: AsyncClient, auth_headers, test_user) -> dict:
    account = await _create_account(client, auth_headers)
    category = await _create_category(client, auth_headers)
    grouped = await _create_group_with_split_tx(client, auth_headers, account["id"])
    return {
        "account_id": account["id"],
        "category_id": category["id"],
        "group_id": grouped["group"]["id"],
        "transaction_id": grouped["transaction"]["id"],
    }


class TestReadEndpointsWithData:
    """Every listed GET must answer 200 with seeded data present."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "url_template",
        [
            "/api/transactions?limit=5",
            "/api/transactions/{transaction_id}",
            "/api/transactions/{transaction_id}/transfer-candidates",
            "/api/groups",
            "/api/groups/{group_id}",
            "/api/groups/{group_id}/members",
            "/api/groups/{group_id}/transactions",
            "/api/groups/{group_id}/balances",
            "/api/groups/{group_id}/settlements",
            "/api/accounts",
            "/api/accounts/{account_id}",
            "/api/accounts/{account_id}/summary",
            "/api/categories",
            "/api/payees",
            "/api/budgets",
            "/api/goals",
            "/api/goals/summary",
            "/api/dashboard/summary",
            "/api/dashboard/spending-by-category",
            "/api/reports/net-worth",
            "/api/recurring-transactions",
            "/api/assets",
            "/api/workspaces/current",
            "/api/users/me",
            "/api/search?q=Groceries",
        ],
    )
    async def test_get_returns_200(
        self, client: AsyncClient, auth_headers, seeded, url_template
    ):
        url = url_template.format(**seeded)
        resp = await client.get(url, headers=auth_headers)
        assert resp.status_code == 200, f"{url} -> {resp.status_code}: {resp.text[:300]}"


class TestReadEndpointsUnknownIds:
    """Unknown ids are a 404, never a 500."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "url_template",
        [
            "/api/transactions/{missing}",
            "/api/groups/{missing}",
            "/api/groups/{missing}/transactions",
            "/api/groups/{missing}/balances",
            "/api/accounts/{missing}",
            "/api/accounts/{missing}/summary",
        ],
    )
    async def test_unknown_id_returns_404(
        self, client: AsyncClient, auth_headers, test_user, url_template
    ):
        url = url_template.format(missing=uuid.uuid4())
        resp = await client.get(url, headers=auth_headers)
        assert resp.status_code == 404, f"{url} -> {resp.status_code}: {resp.text[:300]}"
