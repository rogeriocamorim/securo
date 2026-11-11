"""drop the retired category allocations table and categories.is_income

The personal branch once carried its own category split (the
transaction_category_allocations table and categories.is_income, revisions
102/103/a9338a1741a6). Main's category lines replaced it. Databases that ran
those old revisions still hold the leftovers; fresh databases never had them.

Revision ID: 109
Revises: 108
"""

import sqlalchemy as sa

from alembic import op

revision = "109"
down_revision = "108"
branch_labels = None
depends_on = None

ALLOCATIONS_TABLE = "transaction_category_allocations"
CATEGORIES_TABLE = "categories"
IS_INCOME_COLUMN = "is_income"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    if ALLOCATIONS_TABLE in inspector.get_table_names():
        op.drop_table(ALLOCATIONS_TABLE)

    category_columns = {column["name"] for column in inspector.get_columns(CATEGORIES_TABLE)}
    if IS_INCOME_COLUMN in category_columns:
        op.drop_column(CATEGORIES_TABLE, IS_INCOME_COLUMN)


def downgrade() -> None:
    # The retired columns are not restored: nothing in main reads them.
    pass
