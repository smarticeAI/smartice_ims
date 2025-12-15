-- ============================================================================
-- SmartICE Master Data Tables - Complete Creation Script
-- Version: 1.0.0
-- Created: 2025-12-15
--
-- 使用说明：
-- 1. 打开 Supabase Dashboard: https://supabase.com/dashboard/project/wdpeoyugsxqnpwwtkqsl
-- 2. 进入 SQL Editor
-- 3. 复制粘贴此文件全部内容
-- 4. 点击 "Run" 执行
-- ============================================================================

-- ============================================================================
-- 第一部分：创建表结构
-- ============================================================================

-- 1. 品牌表
CREATE TABLE IF NOT EXISTS master_brand (
  id INTEGER PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  name_en VARCHAR(200),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 角色表
CREATE TABLE IF NOT EXISTS master_role (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permission_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 餐厅表
CREATE TABLE IF NOT EXISTS master_restaurant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name VARCHAR(200) NOT NULL UNIQUE,
  brand_id INTEGER REFERENCES master_brand(id),
  address VARCHAR(500),
  city VARCHAR(100),
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. 员工表
CREATE TABLE IF NOT EXISTS master_employee (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  employee_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  wechat_openid VARCHAR(100),
  email VARCHAR(200),
  restaurant_id UUID REFERENCES master_restaurant(id),
  role_code VARCHAR(50) REFERENCES master_role(code),
  department VARCHAR(50),
  manager_id UUID REFERENCES master_employee(id),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 第二部分：创建索引
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_restaurant_brand ON master_restaurant(brand_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_city ON master_restaurant(city);
CREATE INDEX IF NOT EXISTS idx_restaurant_active ON master_restaurant(is_active);

CREATE INDEX IF NOT EXISTS idx_employee_restaurant ON master_employee(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_employee_role ON master_employee(role_code);
CREATE INDEX IF NOT EXISTS idx_employee_username ON master_employee(username);
CREATE INDEX IF NOT EXISTS idx_employee_manager ON master_employee(manager_id);
CREATE INDEX IF NOT EXISTS idx_employee_active ON master_employee(is_active);

-- ============================================================================
-- 第三部分：创建触发器
-- ============================================================================

-- 创建或替换更新时间戳触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为品牌表添加触发器
DROP TRIGGER IF EXISTS update_master_brand_updated_at ON master_brand;
CREATE TRIGGER update_master_brand_updated_at
  BEFORE UPDATE ON master_brand
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为餐厅表添加触发器
DROP TRIGGER IF EXISTS update_master_restaurant_updated_at ON master_restaurant;
CREATE TRIGGER update_master_restaurant_updated_at
  BEFORE UPDATE ON master_restaurant
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为员工表添加触发器
DROP TRIGGER IF EXISTS update_master_employee_updated_at ON master_employee;
CREATE TRIGGER update_master_employee_updated_at
  BEFORE UPDATE ON master_employee
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 第四部分：插入预置数据
-- ============================================================================

-- 品牌预置数据
INSERT INTO master_brand (id, code, name, name_en, description) VALUES
(1, 'yebaolin', '野百灵', 'Yebaolin', '野百灵餐饮品牌'),
(2, 'ningguixing', '宁桂杏', 'Ningguixing', '宁桂杏餐饮品牌'),
(3, 'generic', '通用', 'Generic', '通用/未分类品牌')
ON CONFLICT (id) DO NOTHING;

-- 角色预置数据
INSERT INTO master_role (code, name, description, permission_level) VALUES
('super_admin', '超级管理员', '系统最高权限，可管理所有功能', 100),
('manager', '店长/经理', '门店管理权限，可管理本店数据', 80),
('duty_manager', '值班经理', '值班管理权限，部分管理功能', 60),
('chef', '厨师', '厨房操作权限，可录入采购和库存', 40),
('staff', '员工', '基础操作权限，仅查看和录入', 20)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 第五部分：添加表注释
-- ============================================================================

COMMENT ON TABLE master_brand IS '品牌主数据表';
COMMENT ON COLUMN master_brand.id IS '品牌ID（整数，预置数据）';
COMMENT ON COLUMN master_brand.code IS '品牌代码（唯一标识）';
COMMENT ON COLUMN master_brand.name IS '品牌名称（中文）';
COMMENT ON COLUMN master_brand.name_en IS '品牌名称（英文）';
COMMENT ON COLUMN master_brand.description IS '品牌描述';
COMMENT ON COLUMN master_brand.is_active IS '是否启用';

COMMENT ON TABLE master_role IS '角色主数据表';
COMMENT ON COLUMN master_role.code IS '角色代码（主键）';
COMMENT ON COLUMN master_role.name IS '角色名称';
COMMENT ON COLUMN master_role.description IS '角色描述';
COMMENT ON COLUMN master_role.permission_level IS '权限级别（0-100，数字越大权限越高）';

COMMENT ON TABLE master_restaurant IS '餐厅主数据表';
COMMENT ON COLUMN master_restaurant.id IS '餐厅ID（UUID）';
COMMENT ON COLUMN master_restaurant.restaurant_name IS '餐厅名称（唯一）';
COMMENT ON COLUMN master_restaurant.brand_id IS '所属品牌ID';
COMMENT ON COLUMN master_restaurant.address IS '餐厅地址';
COMMENT ON COLUMN master_restaurant.city IS '所在城市';
COMMENT ON COLUMN master_restaurant.phone IS '联系电话';
COMMENT ON COLUMN master_restaurant.is_active IS '是否营业';

COMMENT ON TABLE master_employee IS '员工主数据表';
COMMENT ON COLUMN master_employee.id IS '员工ID（UUID）';
COMMENT ON COLUMN master_employee.username IS '登录用户名（唯一）';
COMMENT ON COLUMN master_employee.password_hash IS '密码哈希值';
COMMENT ON COLUMN master_employee.employee_name IS '员工姓名';
COMMENT ON COLUMN master_employee.phone IS '手机号码';
COMMENT ON COLUMN master_employee.wechat_openid IS '微信OpenID';
COMMENT ON COLUMN master_employee.email IS '电子邮箱';
COMMENT ON COLUMN master_employee.restaurant_id IS '所属餐厅ID';
COMMENT ON COLUMN master_employee.role_code IS '角色代码';
COMMENT ON COLUMN master_employee.department IS '部门';
COMMENT ON COLUMN master_employee.manager_id IS '直属上级ID（自引用）';
COMMENT ON COLUMN master_employee.is_active IS '是否在职';
COMMENT ON COLUMN master_employee.last_login_at IS '最后登录时间';

-- ============================================================================
-- 第六部分：验证数据
-- ============================================================================

-- 查看已创建的表
SELECT
  'master_brand' as table_name,
  COUNT(*) as row_count
FROM master_brand
UNION ALL
SELECT
  'master_role',
  COUNT(*)
FROM master_role
UNION ALL
SELECT
  'master_restaurant',
  COUNT(*)
FROM master_restaurant
UNION ALL
SELECT
  'master_employee',
  COUNT(*)
FROM master_employee;

-- 查看品牌数据
SELECT * FROM master_brand ORDER BY id;

-- 查看角色数据
SELECT * FROM master_role ORDER BY permission_level DESC;

-- ============================================================================
-- 脚本执行完成！
-- ============================================================================
--
-- 创建完成后，您应该看到：
-- - 4张表已创建（master_brand, master_role, master_restaurant, master_employee）
-- - master_brand 有3条数据（野百灵、宁桂杏、通用）
-- - master_role 有5条数据（超级管理员、店长、值班经理、厨师、员工）
--
-- 下一步：
-- 1. 查看 master_schema.md 了解详细表结构
-- 2. 根据需要添加测试数据
-- 3. 配置RLS（Row Level Security）策略
-- ============================================================================
