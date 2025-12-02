# Supabase 数据库连接配置指南

## 问题背景

前端与 Supabase 数据库连接时遇到 **406 (Not Acceptable)** 错误，导致无法查询供应商和产品数据。

### 错误日志示例

```
GET https://wdpeoyugsxqnpwwtkqsl.supabase.co/rest/v1/supplier?select=*&supplier_name=eq.test&is_active=eq.true 406 (Not Acceptable)
[提交] 供应商未找到: test
[匹配] 产品未找到: 新疆牛肉
```

---

## 问题根因

1. **缺少 Schema 指定**：Supabase 客户端未指定使用 `ims` schema，默认查询 `public` schema
2. **缺少必要 Headers**：未配置 `Accept` 和 `Prefer` headers
3. **RLS 策略缺失**：Supabase 默认启用 Row Level Security，但未创建访问策略

---

## 解决方案

### 1. 修复 Supabase 客户端配置

**文件**：`frontend/services/supabaseService.ts`

**修改内容**：

```typescript
// 创建 Supabase 客户端
export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!SUPABASE_ANON_KEY) {
      console.warn('VITE_SUPABASE_ANON_KEY 未配置');
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: {
        schema: 'ims', // ✅ 指定使用 ims schema
      },
      auth: {
        persistSession: false, // 前端不持久化会话
      },
      global: {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json', // ✅ 添加 Accept header
          'Prefer': 'return=representation', // ✅ 要求返回完整数据
        },
      },
    });
  }
  return supabase;
}
```

**关键配置说明**：

| 配置项 | 说明 |
|--------|------|
| `db.schema` | 指定 `ims` schema，所有查询将在此 schema 下执行 |
| `Accept` | 告诉 Supabase 返回 JSON 格式数据 |
| `Prefer: return=representation` | 插入/更新操作后返回完整记录 |
| `persistSession: false` | 前端不持久化会话（无认证需求） |

---

### 2. 配置 RLS 策略

**问题**：Supabase 默认为所有表启用 Row Level Security (RLS)，但没有创建任何策略，导致 `anon` 用户无法访问数据。

**解决方案**：在 Supabase SQL Editor 中执行以下脚本之一。

#### 选项 A：临时禁用 RLS（开发/测试环境）

**文件**：`Database/db/schema/IMS_rls_policies.sql`

```sql
-- 基础表
ALTER TABLE ims.supplier DISABLE ROW LEVEL SECURITY;
ALTER TABLE ims.product DISABLE ROW LEVEL SECURITY;
ALTER TABLE ims.product_sku DISABLE ROW LEVEL SECURITY;
ALTER TABLE ims.unit_of_measure DISABLE ROW LEVEL SECURITY;
ALTER TABLE ims.product_category DISABLE ROW LEVEL SECURITY;

-- 价格和库存表
ALTER TABLE ims.store_purchase_price DISABLE ROW LEVEL SECURITY;
ALTER TABLE ims.inventory_transaction DISABLE ROW LEVEL SECURITY;

-- 门店和品牌表
ALTER TABLE ims.store DISABLE ROW LEVEL SECURITY;
ALTER TABLE ims.brand DISABLE ROW LEVEL SECURITY;
```

**适用场景**：
- 开发环境快速测试
- 无需权限控制的内部工具

**警告**：⚠️ 此方式完全禁用表的安全保护，**不可用于生产环境**！

#### 选项 B：创建允许读取的策略（推荐）

```sql
-- 供应商表策略
CREATE POLICY "允许匿名读取供应商"
  ON ims.supplier
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "允许认证用户写入供应商"
  ON ims.supplier
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 产品表策略
CREATE POLICY "允许匿名读取产品"
  ON ims.product
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- （其他表类似）
```

**适用场景**：
- 开发环境，需要一定安全保护
- 允许匿名读取，认证后写入

---

### 3. 验证连接

#### 方式 1：使用测试页面（推荐）

**文件**：`frontend/test-supabase-connection.html`

1. 在浏览器中打开 `frontend/test-supabase-connection.html`
2. 点击测试按钮，查看连接状态
3. 检查控制台输出

**测试项目**：
- ✅ 基础连接测试
- ✅ 查询 suppliers 表
- ✅ 查询 products 表
- ✅ 查询 unit_of_measure 表
- ✅ 对比 public schema

#### 方式 2：浏览器控制台

```javascript
// 在浏览器控制台执行
const { createClient } = window.supabase;
const client = createClient(
  'https://wdpeoyugsxqnpwwtkqsl.supabase.co',
  'YOUR_ANON_KEY',
  { db: { schema: 'ims' } }
);

// 测试查询
const { data, error } = await client
  .from('supplier')
  .select('*')
  .limit(5);

console.log('数据:', data);
console.log('错误:', error);
```

#### 方式 3：SQL Editor

在 Supabase Dashboard > SQL Editor 中执行：

```sql
-- 检查表的 RLS 状态
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'ims'
  AND tablename IN ('supplier', 'product', 'product_sku', 'unit_of_measure')
ORDER BY tablename;

-- 查看现有策略
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'ims'
ORDER BY tablename, policyname;
```

---

## 常见问题

### Q1: 为什么是 406 错误而不是 403？

**A**: `406 Not Acceptable` 通常表示请求的格式不被服务器接受，常见原因：
- 缺少 `Accept` header
- Schema 不存在或拼写错误
- 表名不存在

`403 Forbidden` 才是 RLS 策略阻止访问的典型错误。

### Q2: 表名是单数还是复数？

**A**: 根据 `Database/db/schema/IMS_schema_core_mvp.sql`，表名使用**单数形式**：
- `supplier`（不是 `suppliers`）
- `product`（不是 `products`）
- `unit_of_measure`
- `product_sku`

### Q3: 如何在前端切换 schema？

**A**: 通过 Supabase 客户端配置：

```typescript
// 使用 ims schema
const client = createClient(url, key, {
  db: { schema: 'ims' }
});

// 使用 public schema
const publicClient = createClient(url, key, {
  db: { schema: 'public' }
});
```

### Q4: 生产环境如何配置 RLS？

**A**: 生产环境应基于用户角色和门店创建细粒度策略：

```sql
-- 示例：员工只能查看自己门店的采购记录
CREATE POLICY "员工查看本店采购记录"
  ON ims.store_purchase_price
  FOR SELECT
  TO authenticated
  USING (
    store_id = (
      SELECT store_id
      FROM usercenter.employees
      WHERE account_id = auth.uid()
    )
  );
```

---

## 部署检查清单

### 开发环境

- [x] 配置 Supabase 客户端（schema + headers）
- [x] 执行 RLS 策略脚本（选项 A 或 B）
- [x] 使用测试页面验证连接
- [x] 检查前端表单提交功能

### 生产环境

- [ ] 启用所有表的 RLS
- [ ] 创建基于角色的细粒度策略
- [ ] 配置 JWT 认证
- [ ] 审计所有 API 访问权限
- [ ] 测试跨门店数据隔离

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `frontend/services/supabaseService.ts` | Supabase 客户端配置与 API 封装 |
| `frontend/services/inventoryService.ts` | 库存数据提交服务 |
| `frontend/test-supabase-connection.html` | 连接测试页面 |
| `Database/db/schema/IMS_rls_policies.sql` | RLS 策略配置脚本 |
| `Database/db/schema/IMS_schema_core_mvp.sql` | 数据库 Schema 定义 |
| `frontend/.env` | 环境变量配置 |

---

## 更新记录

| 日期 | 说明 |
|------|------|
| 2025-12-02 | 初始版本 - 修复 406 错误，添加 schema 配置 |
