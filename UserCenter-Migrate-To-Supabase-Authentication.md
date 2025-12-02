# UserCenter Migration to Supabase Authentication

> **Status**: Planning
> **Created**: 2025-12-03
> **Target**: Migrate UserCenter authentication layer to Supabase Auth while preserving business logic

---

## Executive Summary

This document outlines the migration strategy to replace the custom JWT authentication in UserCenter with Supabase Auth, while retaining all business-specific tables (organization hierarchy, RBAC, employee management, invitation system).

### Key Decision

| Component | Current | After Migration |
|-----------|---------|-----------------|
| Authentication | Custom JWT (FastAPI) | Supabase Auth |
| User Storage | `accounts` table | `auth.users` (Supabase) |
| Password Management | bcrypt in app | Supabase managed |
| Session/Tokens | Custom JWT | Supabase JWT |
| Organization Hierarchy | Custom tables | **Keep as-is** |
| RBAC | Custom tables | **Keep as-is** |
| Employee Management | Custom tables | **Keep as-is** |
| Invitation System | Custom tables | **Keep as-is** |

---

## Current Architecture

### Tables in `usercenter` Schema (12 tables)

```
Organization Hierarchy (5 tables):
├── enterprise          # L1 - Company group (single record)
├── brands              # L2 - Brands (野百灵, 宁桂杏)
├── regions             # L3 - Regions (四川区域, 江苏区域)
├── cities              # L4 - Cities (成都, 绵阳)
└── stores              # L5 - Stores (春熙路店)

User Management (4 tables):
├── employees           # Employee profiles (linked to stores)
├── accounts            # Login accounts (1:1 with employees) ← WILL BE REPLACED
├── roles               # 8 predefined roles
└── account_roles       # N:M role assignments ← WILL BE RENAMED

Invitation System (2 tables):
├── invitation_codes    # Registration codes
└── invitation_usages   # Usage audit trail

Migration (1 table):
└── legacy_user_mapping # Historical migration data
```

### Current Authentication Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Client    │────►│  FastAPI Auth   │────►│  accounts   │
│             │     │  (JWT creation) │     │   table     │
└─────────────┘     └─────────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  bcrypt     │
                    │  password   │
                    │  verify     │
                    └─────────────┘
```

---

## Target Architecture

### After Migration

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Client    │────►│  Supabase Auth  │────►│ auth.users  │
│             │     │  (managed JWT)  │     │ (Supabase)  │
└─────────────┘     └─────────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────────┐
                    │  user_profiles  │ (new bridge table)
                    │  + user_roles   │ (renamed from account_roles)
                    └─────────────────┘
                           │
                           ▼
                    ┌─────────────────┐
                    │  Business Data  │
                    │  (org hierarchy,│
                    │   employees,    │
                    │   invitations)  │
                    └─────────────────┘
```

### Schema Changes

#### 1. NEW: `user_profiles` Table (replaces `accounts`)

```sql
CREATE TABLE usercenter.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id UUID UNIQUE REFERENCES usercenter.employees(id),
    invitation_id UUID REFERENCES usercenter.invitation_codes(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'frozen', 'disabled')),
    status_reason VARCHAR(200),
    frozen_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_employee ON usercenter.user_profiles(employee_id);
CREATE INDEX idx_user_profiles_status ON usercenter.user_profiles(status);
```

#### 2. RENAME: `account_roles` → `user_roles`

```sql
ALTER TABLE usercenter.account_roles RENAME TO user_roles;
ALTER TABLE usercenter.user_roles RENAME COLUMN account_id TO user_id;

-- Update FK to point to auth.users
ALTER TABLE usercenter.user_roles
    DROP CONSTRAINT account_roles_account_id_fkey,
    ADD CONSTRAINT user_roles_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

#### 3. DROP: `accounts` Table (after migration)

```sql
-- Only after all data migrated and verified
DROP TABLE usercenter.accounts;
```

---

## Feature Implementation

### 1. Registration with Invitation Code

**Current Flow:**
1. User submits: name, phone, password, invitation_code
2. Backend validates invitation code
3. Backend creates `employees` record (status='pending')
4. Backend creates `accounts` record (status='pending')
5. User cannot login until approved

**New Flow:**
```
┌──────────┐    ┌───────────────┐    ┌─────────────────┐
│  Client  │───►│ Custom API    │───►│ Supabase Admin  │
│          │    │ /auth/register│    │ API: createUser │
└──────────┘    └───────────────┘    └─────────────────┘
                       │                      │
                       ▼                      ▼
              ┌────────────────┐      ┌─────────────┐
              │ 1. Validate    │      │ auth.users  │
              │    invitation  │      │ created     │
              │ 2. Create      │      └─────────────┘
              │    employee    │
              │ 3. Create      │
              │    user_profile│
              │    (pending)   │
              └────────────────┘
```

**Backend Implementation:**

```python
# app/api/v1/endpoints/auth.py

from supabase import create_client

@router.post("/register")
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # 1. Validate invitation code (existing logic)
    invitation = await validate_invitation_code(db, request.invitation_code)

    # 2. Create user in Supabase Auth
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    auth_response = supabase.auth.admin.create_user({
        "phone": request.phone,
        "password": request.password,
        "user_metadata": {"name": request.name}
    })
    supabase_user_id = auth_response.user.id

    # 3. Create employee (status='pending')
    employee = Employee(
        name=request.name,
        phone=request.phone,
        store_id=invitation.store_id,
        employment_status='pending'
    )
    db.add(employee)

    # 4. Create user_profile (status='pending')
    profile = UserProfile(
        user_id=supabase_user_id,
        employee_id=employee.id,
        invitation_id=invitation.id,
        status='pending'
    )
    db.add(profile)

    # 5. Update invitation usage
    invitation.used_count += 1

    await db.commit()
    return {"message": "Registration successful, pending approval"}
```

### 2. Login Flow

**Current Flow:**
1. User submits credentials
2. Backend verifies password
3. Backend checks `accounts.status`
4. Backend generates JWT

**New Flow:**
```
┌──────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Client  │───►│  Supabase Auth  │───►│ JWT with claims │
│          │    │  signInWithPhone│    │ (via Auth Hook) │
└──────────┘    └─────────────────┘    └─────────────────┘
                                              │
                       ┌──────────────────────┘
                       ▼
              ┌────────────────────┐
              │  RLS Policy checks │
              │  user_profiles     │
              │  .status = 'active'│
              └────────────────────┘
```

**Auth Hook for Custom Claims:**

```sql
-- Supabase Auth Hook: Add roles and status to JWT
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims jsonb;
    user_status text;
    user_roles text[];
    employee_record record;
BEGIN
    -- Get user profile status
    SELECT status INTO user_status
    FROM usercenter.user_profiles
    WHERE user_id = (event->>'user_id')::uuid;

    -- Get user roles
    SELECT array_agg(r.code) INTO user_roles
    FROM usercenter.user_roles ur
    JOIN usercenter.roles r ON r.id = ur.role_id
    WHERE ur.user_id = (event->>'user_id')::uuid
      AND ur.is_active = true;

    -- Get employee info
    SELECT e.id, e.store_id, e.name INTO employee_record
    FROM usercenter.user_profiles up
    JOIN usercenter.employees e ON e.id = up.employee_id
    WHERE up.user_id = (event->>'user_id')::uuid;

    -- Build custom claims
    claims := jsonb_build_object(
        'user_status', COALESCE(user_status, 'unknown'),
        'roles', COALESCE(user_roles, ARRAY[]::text[]),
        'employee_id', employee_record.id,
        'store_id', employee_record.store_id,
        'name', employee_record.name
    );

    -- Add claims to token
    RETURN jsonb_set(event, '{claims,app_metadata}', claims);
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA usercenter TO supabase_auth_admin;
GRANT SELECT ON usercenter.user_profiles TO supabase_auth_admin;
GRANT SELECT ON usercenter.user_roles TO supabase_auth_admin;
GRANT SELECT ON usercenter.roles TO supabase_auth_admin;
GRANT SELECT ON usercenter.employees TO supabase_auth_admin;
```

### 3. Pending Account Blocking

**Option A: Client-side check (simpler)**
```typescript
// Frontend after login
const { data: { user } } = await supabase.auth.getUser();
const status = user.app_metadata.user_status;

if (status === 'pending') {
    await supabase.auth.signOut();
    showError('账号正在审核中，请等待管理员审核通过后再登录');
}
```

**Option B: RLS Policy (more secure)**
```sql
-- Block all data access for non-active users
CREATE POLICY "Only active users can access data"
ON usercenter.employees
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM usercenter.user_profiles
        WHERE user_id = auth.uid()
        AND status = 'active'
    )
);
```

### 4. Admin Approval

**No change to API structure, only implementation:**

```python
# app/api/v1/endpoints/admin.py

@router.post("/accounts/{account_id}/review")
async def review_account(
    account_id: UUID,  # This is now Supabase user_id
    request: ReviewRequest,
    db: AsyncSession = Depends(get_db)
):
    # Update user_profiles instead of accounts
    profile = await db.get(UserProfile, account_id)

    if request.action == "approve":
        profile.status = "active"
        # Also update employee status
        employee = await db.get(Employee, profile.employee_id)
        employee.employment_status = "active"
    else:
        profile.status = "disabled"
        profile.status_reason = request.reason
        employee = await db.get(Employee, profile.employee_id)
        employee.employment_status = "terminated"

    await db.commit()
    return {"message": "审核完成"}
```

### 5. Current User Info (`/auth/me`)

```python
@router.get("/me")
async def get_current_user(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)  # From Supabase JWT
):
    # Query user_profiles instead of accounts
    profile = await db.execute(
        select(UserProfile)
        .options(
            joinedload(UserProfile.employee)
            .joinedload(Employee.store)
            .joinedload(Store.city)
            .joinedload(City.region)
            .joinedload(Region.brand)
        )
        .where(UserProfile.user_id == user.id)
    )
    profile = profile.scalar_one_or_none()

    return CurrentUserResponse(
        user_id=user.id,
        phone=user.phone,
        email=user.email,
        status=profile.status,
        employee_id=profile.employee.id if profile.employee else None,
        # ... rest of fields
    )
```

---

## Migration Steps

### Phase 1: Preparation (Day 1)

| Step | Task | SQL/Code |
|------|------|----------|
| 1.1 | Create `user_profiles` table | See schema above |
| 1.2 | Rename `account_roles` → `user_roles` | See schema above |
| 1.3 | Create Auth Hook function | See SQL above |
| 1.4 | Enable Auth Hook in Supabase Dashboard | Dashboard → Auth → Hooks |
| 1.5 | Add Supabase SDK to backend | `pip install supabase` |
| 1.6 | Add new env vars | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |

### Phase 2: Data Migration (Day 1-2)

```sql
-- Migrate existing accounts to auth.users
-- This must be done via Supabase Admin API (cannot directly insert into auth.users)

-- Step 1: Export current accounts
SELECT
    id as legacy_account_id,
    phone,
    username,
    email,
    password_hash,  -- Note: bcrypt hashes are compatible with Supabase
    status,
    employee_id
FROM usercenter.accounts
WHERE status != 'disabled';
```

**Migration Script (Python):**

```python
# scripts/migrate_to_supabase_auth.py

import asyncio
from supabase import create_client
from sqlalchemy import select
from app.config.database import async_session
from app.models import Account, UserProfile

async def migrate_accounts():
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    async with async_session() as db:
        # Get all active accounts
        result = await db.execute(
            select(Account).where(Account.status != 'disabled')
        )
        accounts = result.scalars().all()

        for account in accounts:
            try:
                # Create user in Supabase (preserving password hash)
                # Note: Supabase accepts bcrypt hashes directly
                auth_user = supabase.auth.admin.create_user({
                    "phone": account.phone,
                    "email": account.email,
                    "password_hash": account.password_hash,  # Direct hash transfer
                    "user_metadata": {"migrated_from": str(account.id)}
                })

                # Create user_profile
                profile = UserProfile(
                    user_id=auth_user.user.id,
                    employee_id=account.employee_id,
                    status=account.status,
                    created_at=account.created_at
                )
                db.add(profile)

                # Migrate role assignments
                await db.execute(
                    text("""
                        UPDATE usercenter.user_roles
                        SET user_id = :new_id
                        WHERE user_id = :old_id
                    """),
                    {"new_id": auth_user.user.id, "old_id": account.id}
                )

                print(f"Migrated: {account.phone}")

            except Exception as e:
                print(f"Failed to migrate {account.phone}: {e}")

        await db.commit()

asyncio.run(migrate_accounts())
```

### Phase 3: Backend Updates (Day 2-3)

| File | Changes |
|------|---------|
| `app/config/settings.py` | Add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| `app/api/deps.py` | Replace JWT decode with Supabase JWT validation |
| `app/api/v1/endpoints/auth.py` | Update login/register/refresh endpoints |
| `app/api/v1/endpoints/accounts.py` | Update to use `user_profiles` |
| `app/api/v1/endpoints/admin.py` | Update review endpoints |
| `app/models/` | Add `UserProfile`, update relationships |
| `app/schemas/` | Update response schemas |

**Key Dependency Change:**

```python
# app/api/deps.py

from supabase import create_client
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def get_current_user(token: str = Depends(security)):
    """Validate Supabase JWT and return user"""
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

    try:
        # Verify JWT with Supabase
        user = supabase.auth.get_user(token.credentials)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
```

### Phase 4: Frontend Updates (Day 3-4)

| File | Changes |
|------|---------|
| `services/auth.ts` | Replace custom JWT logic with Supabase client |
| `contexts/AuthContext.tsx` | Use Supabase session management |
| `components/Login.tsx` | Use `supabase.auth.signInWithPassword` |
| `components/Register.tsx` | Call backend API (which uses Supabase Admin) |

**Frontend Auth Service:**

```typescript
// services/supabaseAuth.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const authService = {
    async login(phone: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            phone,
            password
        });

        if (error) throw error;

        // Check user status from JWT claims
        const status = data.user?.app_metadata?.user_status;
        if (status === 'pending') {
            await supabase.auth.signOut();
            throw new Error('账号正在审核中，请等待管理员审核通过后再登录');
        }

        return data;
    },

    async logout() {
        await supabase.auth.signOut();
    },

    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    onAuthStateChange(callback: (user: User | null) => void) {
        return supabase.auth.onAuthStateChange((event, session) => {
            callback(session?.user ?? null);
        });
    }
};
```

### Phase 5: Testing & Verification (Day 4-5)

| Test Case | Expected Result |
|-----------|-----------------|
| New user registration with valid invitation | User created in Supabase, profile status='pending' |
| Login with pending account | Error: "账号正在审核中" |
| Admin approves account | Profile status='active', can login |
| Login with active account | Success, JWT contains roles |
| Role-based API access | Correct permission enforcement |
| Password reset | Works via Supabase flow |
| Existing migrated user login | Password works, all data intact |

### Phase 6: Cleanup (Day 5)

```sql
-- After verification, drop old accounts table
DROP TABLE usercenter.accounts;

-- Update legacy_user_mapping to point to new user_id
ALTER TABLE usercenter.legacy_user_mapping
    ADD COLUMN supabase_user_id UUID REFERENCES auth.users(id);
```

---

## Environment Variables

### Backend (UserCenter)

```bash
# Existing
DATABASE_URL=postgresql+asyncpg://...
JWT_SECRET_KEY=...  # Can be removed after migration

# New
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # Service role key (server-side only)
SUPABASE_ANON_KEY=eyJ...     # Anon key (for JWT validation)
```

### Frontend

```bash
# Existing
VITE_USER_CENTER_URL=http://localhost:8001

# New
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## Rollback Plan

If issues arise during migration:

1. **Keep `accounts` table** until fully verified (don't drop immediately)
2. **Feature flag** for auth method: `USE_SUPABASE_AUTH=true/false`
3. **Dual-write period**: Write to both old and new during transition
4. **Quick rollback**: Set `USE_SUPABASE_AUTH=false` to revert

---

## Benefits After Migration

| Benefit | Description |
|---------|-------------|
| **Security** | Password storage handled by Supabase (battle-tested) |
| **MFA Ready** | Can enable multi-factor auth with one click |
| **OAuth Ready** | Can add Google/WeChat login easily |
| **Magic Links** | Passwordless login option |
| **Session Management** | Automatic token refresh by Supabase SDK |
| **Reduced Code** | Remove custom JWT generation/validation |
| **Admin Dashboard** | Supabase dashboard for user management |

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Preparation | 0.5 day | None |
| Phase 2: Data Migration | 0.5 day | Phase 1 |
| Phase 3: Backend Updates | 1-2 days | Phase 2 |
| Phase 4: Frontend Updates | 1 day | Phase 3 |
| Phase 5: Testing | 1 day | Phase 4 |
| Phase 6: Cleanup | 0.5 day | Phase 5 |
| **Total** | **4-5 days** | |

---

## Open Questions

1. **Phone vs Email**: Supabase Auth prefers email. Should we add email requirement or use phone-only auth?
2. **Password Migration**: Test if bcrypt hashes from Python are compatible with Supabase's format
3. **Username Login**: Supabase doesn't support username login natively. Keep username as metadata or remove?
4. **Existing Sessions**: How to handle users currently logged in during migration?

---

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
- [Supabase Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
