-- ============================================================
-- Migration: Add invitation codes and update status constraints
-- Date: 2024-12-02
-- Description: 添加邀请码功能支持账号注册
-- ============================================================

-- 设置 schema
SET search_path TO usercenter;

-- ============================================================
-- 1. 创建 invitation_codes 表
-- ============================================================
CREATE TABLE IF NOT EXISTS usercenter.invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    store_id UUID NOT NULL REFERENCES usercenter.stores(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES usercenter.accounts(id) ON DELETE SET NULL,
    max_uses SMALLINT NOT NULL DEFAULT 10,
    used_count SMALLINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS ix_invitation_codes_code ON usercenter.invitation_codes(code);
CREATE INDEX IF NOT EXISTS ix_invitation_codes_store_id ON usercenter.invitation_codes(store_id);

COMMENT ON TABLE usercenter.invitation_codes IS '邀请码表 - 用于控制员工注册并关联门店';
COMMENT ON COLUMN usercenter.invitation_codes.code IS '邀请码（唯一）';
COMMENT ON COLUMN usercenter.invitation_codes.store_id IS '关联的门店ID';
COMMENT ON COLUMN usercenter.invitation_codes.created_by IS '创建者账号ID';
COMMENT ON COLUMN usercenter.invitation_codes.max_uses IS '最大使用次数';
COMMENT ON COLUMN usercenter.invitation_codes.used_count IS '已使用次数';
COMMENT ON COLUMN usercenter.invitation_codes.expires_at IS '过期时间（NULL表示永不过期）';
COMMENT ON COLUMN usercenter.invitation_codes.is_active IS '是否启用';

-- ============================================================
-- 2. 创建 invitation_usages 表（使用审计）
-- ============================================================
CREATE TABLE IF NOT EXISTS usercenter.invitation_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES usercenter.invitation_codes(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL UNIQUE REFERENCES usercenter.accounts(id) ON DELETE RESTRICT,
    used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS ix_invitation_usages_invitation_id ON usercenter.invitation_usages(invitation_id);

COMMENT ON TABLE usercenter.invitation_usages IS '邀请码使用记录 - 审计表，记录每个账号使用的邀请码';
COMMENT ON COLUMN usercenter.invitation_usages.invitation_id IS '使用的邀请码ID';
COMMENT ON COLUMN usercenter.invitation_usages.account_id IS '注册的账号ID（每账号只能用一个邀请码）';
COMMENT ON COLUMN usercenter.invitation_usages.used_at IS '使用时间';

-- ============================================================
-- 3. 为 accounts 表添加 invitation_id 列
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'usercenter'
        AND table_name = 'accounts'
        AND column_name = 'invitation_id'
    ) THEN
        ALTER TABLE usercenter.accounts
        ADD COLUMN invitation_id UUID REFERENCES usercenter.invitation_codes(id) ON DELETE SET NULL;

        CREATE INDEX ix_accounts_invitation_id ON usercenter.accounts(invitation_id);
    END IF;
END $$;

COMMENT ON COLUMN usercenter.accounts.invitation_id IS '注册时使用的邀请码ID（3NF：只存FK，不存冗余码值）';

-- ============================================================
-- 4. 更新 accounts.status 约束（添加 pending 状态）
-- ============================================================
-- 先检查约束是否存在，如果存在则删除后重建
DO $$
BEGIN
    -- 尝试删除旧约束
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_schema = 'usercenter'
        AND table_name = 'accounts'
        AND constraint_name = 'ck_accounts_status'
    ) THEN
        ALTER TABLE usercenter.accounts DROP CONSTRAINT IF EXISTS ck_accounts_status;
    END IF;

    -- 创建新约束（包含 pending）
    ALTER TABLE usercenter.accounts
    ADD CONSTRAINT ck_accounts_status
    CHECK (status IN ('active', 'frozen', 'disabled', 'pending'));
END $$;

-- ============================================================
-- 5. 更新 employees.employment_status 约束（添加 pending 状态）
-- ============================================================
DO $$
BEGIN
    -- 尝试删除旧约束
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_schema = 'usercenter'
        AND table_name = 'employees'
        AND constraint_name = 'ck_employees_status'
    ) THEN
        ALTER TABLE usercenter.employees DROP CONSTRAINT IF EXISTS ck_employees_status;
    END IF;

    -- 创建新约束（包含 pending）
    ALTER TABLE usercenter.employees
    ADD CONSTRAINT ck_employees_status
    CHECK (employment_status IN ('active', 'probation', 'resigned', 'terminated', 'suspended', 'pending'));
END $$;

-- ============================================================
-- 6. 创建触发器自动更新 updated_at
-- ============================================================
-- 为 invitation_codes 创建触发器
DROP TRIGGER IF EXISTS update_invitation_codes_updated_at ON usercenter.invitation_codes;
CREATE TRIGGER update_invitation_codes_updated_at
    BEFORE UPDATE ON usercenter.invitation_codes
    FOR EACH ROW
    EXECUTE FUNCTION usercenter.update_updated_at_column();

-- 为 invitation_usages 创建触发器
DROP TRIGGER IF EXISTS update_invitation_usages_updated_at ON usercenter.invitation_usages;
CREATE TRIGGER update_invitation_usages_updated_at
    BEFORE UPDATE ON usercenter.invitation_usages
    FOR EACH ROW
    EXECUTE FUNCTION usercenter.update_updated_at_column();

-- ============================================================
-- 7. 插入初始测试邀请码（可选）
-- ============================================================
-- 注意：需要先有 store 数据才能执行以下语句
-- 获取第一个门店的 ID 并创建测试邀请码
DO $$
DECLARE
    v_store_id UUID;
    v_admin_id UUID;
BEGIN
    -- 获取第一个门店
    SELECT id INTO v_store_id FROM usercenter.stores LIMIT 1;

    -- 获取 admin 账号
    SELECT id INTO v_admin_id FROM usercenter.accounts WHERE username = 'admin' LIMIT 1;

    -- 如果门店存在，创建测试邀请码
    IF v_store_id IS NOT NULL THEN
        INSERT INTO usercenter.invitation_codes (code, store_id, created_by, max_uses, is_active)
        VALUES ('WELCOME2024', v_store_id, v_admin_id, 100, true)
        ON CONFLICT (code) DO NOTHING;

        RAISE NOTICE '测试邀请码已创建: WELCOME2024';
    ELSE
        RAISE NOTICE '警告: 没有找到门店数据，跳过测试邀请码创建';
    END IF;
END $$;

-- ============================================================
-- 验证迁移结果
-- ============================================================
SELECT
    'invitation_codes' as table_name,
    COUNT(*) as row_count
FROM usercenter.invitation_codes
UNION ALL
SELECT
    'invitation_usages' as table_name,
    COUNT(*) as row_count
FROM usercenter.invitation_usages;

-- 显示 accounts 表结构确认 invitation_id 列已添加
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'usercenter' AND table_name = 'accounts'
ORDER BY ordinal_position;

-- ============================================================
-- 迁移完成
-- ============================================================
