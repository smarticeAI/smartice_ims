"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, accounts, employees, orgs, roles, invitations, admin

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["Accounts"])
api_router.include_router(employees.router, prefix="/employees", tags=["Employees"])
api_router.include_router(orgs.router, prefix="/orgs", tags=["Organizations"])
api_router.include_router(roles.router, prefix="/roles", tags=["Roles"])
api_router.include_router(invitations.router, prefix="/invitations", tags=["Invitations"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
