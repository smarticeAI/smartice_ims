#!/bin/bash
# 全流程测试脚本

set -e
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY

BASE_URL="http://127.0.0.1:8001"
NEW_ACCOUNT_ID="519efdbb-eb82-4fee-abcd-24366ba53684"
NEW_PHONE="13864676981"

echo "============================================"
echo "       UserCenter 全流程测试"
echo "============================================"

echo ""
echo "=== 测试1: 新用户登录（待审核状态，应失败）==="
RESP=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$NEW_PHONE\",\"password\":\"Test123456\"}")
echo "$RESP"

echo ""
echo "=== 测试2: 管理员登录 ==="
ADMIN_RESP=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800000000","password":"admin123"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "管理员Token: ${ADMIN_TOKEN:0:40}..."

echo ""
echo "=== 测试3: 查看待审核列表 ==="
curl -s "$BASE_URL/api/v1/admin/accounts/pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool

echo ""
echo "=== 测试4: 审核通过新用户 ==="
curl -s -X POST "$BASE_URL/api/v1/admin/accounts/$NEW_ACCOUNT_ID/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"approve"}' | python3 -m json.tool

echo ""
echo "=== 测试5: 新用户登录（审核通过后，应成功）==="
NEW_RESP=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$NEW_PHONE\",\"password\":\"Test123456\"}")
echo "$NEW_RESP" | python3 -m json.tool
NEW_TOKEN=$(echo "$NEW_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")

if [ -n "$NEW_TOKEN" ]; then
  echo ""
  echo "=== 测试6: 新用户获取个人信息 ==="
  curl -s "$BASE_URL/api/v1/auth/me" \
    -H "Authorization: Bearer $NEW_TOKEN" | python3 -m json.tool
fi

echo ""
echo "=== 测试7: 邀请码列表 ==="
curl -s "$BASE_URL/api/v1/invitations" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool

echo ""
echo "============================================"
echo "       全流程测试完成"
echo "============================================"
