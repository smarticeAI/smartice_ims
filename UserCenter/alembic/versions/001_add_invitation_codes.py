"""Add invitation codes and update status constraints

Revision ID: 001_invitation_codes
Revises:
Create Date: 2024-12-02

This migration adds:
1. invitation_codes table - for controlled registration with store association
2. invitation_usages table - audit log of invitation code usage
3. invitation_id column to accounts table
4. Updated status constraints to include 'pending' status
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP


# revision identifiers, used by Alembic.
revision: str = '001_invitation_codes'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Schema name
SCHEMA = 'usercenter'


def upgrade() -> None:
    # 1. Create invitation_codes table
    op.create_table(
        'invitation_codes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('code', sa.String(20), nullable=False, unique=True, index=True),
        sa.Column('store_id', UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('created_by', UUID(as_uuid=True), nullable=True),
        sa.Column('max_uses', sa.SmallInteger(), nullable=False, server_default='10'),
        sa.Column('used_count', sa.SmallInteger(), nullable=False, server_default='0'),
        sa.Column('expires_at', TIMESTAMP(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['store_id'], [f'{SCHEMA}.stores.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by'], [f'{SCHEMA}.accounts.id'], ondelete='SET NULL'),
        schema=SCHEMA
    )

    # 2. Create invitation_usages table
    op.create_table(
        'invitation_usages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('invitation_id', UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('account_id', UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column('used_at', TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_at', TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['invitation_id'], [f'{SCHEMA}.invitation_codes.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['account_id'], [f'{SCHEMA}.accounts.id'], ondelete='RESTRICT'),
        schema=SCHEMA
    )

    # 3. Add invitation_id column to accounts table
    op.add_column(
        'accounts',
        sa.Column('invitation_id', UUID(as_uuid=True), nullable=True),
        schema=SCHEMA
    )
    op.create_index(
        'ix_accounts_invitation_id',
        'accounts',
        ['invitation_id'],
        schema=SCHEMA
    )
    op.create_foreign_key(
        'fk_accounts_invitation_id',
        'accounts',
        'invitation_codes',
        ['invitation_id'],
        ['id'],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete='SET NULL'
    )

    # 4. Update accounts status constraint to include 'pending'
    # First drop the old constraint
    op.drop_constraint('ck_accounts_status', 'accounts', schema=SCHEMA)
    # Create new constraint with 'pending' status
    op.create_check_constraint(
        'ck_accounts_status',
        'accounts',
        "status IN ('active', 'frozen', 'disabled', 'pending')",
        schema=SCHEMA
    )

    # 5. Update employees employment_status constraint to include 'pending'
    # First drop the old constraint
    op.drop_constraint('ck_employees_status', 'employees', schema=SCHEMA)
    # Create new constraint with 'pending' status
    op.create_check_constraint(
        'ck_employees_status',
        'employees',
        "employment_status IN ('active', 'probation', 'resigned', 'terminated', 'suspended', 'pending')",
        schema=SCHEMA
    )


def downgrade() -> None:
    # 1. Revert employees employment_status constraint
    op.drop_constraint('ck_employees_status', 'employees', schema=SCHEMA)
    op.create_check_constraint(
        'ck_employees_status',
        'employees',
        "employment_status IN ('active', 'probation', 'resigned', 'terminated', 'suspended')",
        schema=SCHEMA
    )

    # 2. Revert accounts status constraint
    op.drop_constraint('ck_accounts_status', 'accounts', schema=SCHEMA)
    op.create_check_constraint(
        'ck_accounts_status',
        'accounts',
        "status IN ('active', 'frozen', 'disabled')",
        schema=SCHEMA
    )

    # 3. Remove invitation_id from accounts
    op.drop_constraint('fk_accounts_invitation_id', 'accounts', schema=SCHEMA, type_='foreignkey')
    op.drop_index('ix_accounts_invitation_id', 'accounts', schema=SCHEMA)
    op.drop_column('accounts', 'invitation_id', schema=SCHEMA)

    # 4. Drop invitation_usages table
    op.drop_table('invitation_usages', schema=SCHEMA)

    # 5. Drop invitation_codes table
    op.drop_table('invitation_codes', schema=SCHEMA)
