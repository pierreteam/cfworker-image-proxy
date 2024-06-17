#!/bin/bash
# shellcheck disable=all

# Host=https://registry-1.docker.io
# Host=https://registry.k8s.io
# Host=https://ghcr.io
# Host=https://nvcr.io
# Host=https://quay.io

# Host=https://gcr.io

Host=http://host.docker.internal:5000

url="$Host/v2/"
echo "==============================================================="
echo "请求: $url"
echo "---------------------------------------------------------------"
response=$(curl -s -i "$url" ${token:+-H "Authorization: Bearer ${token}"})
[ -z "$response" ] && echo "请求失败，中止测试" && exit 1
echo "$response" | head -n 20
echo "---------------------------------------------------------------"
response=$(echo "$response" | sed -n '/^www-authenticate: Bearer/I s/^www-authenticate: Bearer //Ip')
realm=$(echo "$response" | sed -n -E 's/.*realm="([^"]+)".*/\1/p')
service=$(echo "$response" | sed -n -E 's/.*service="([^"]+)".*/\1/p')
scope=$(echo "$response" | sed -n -E 's/.*scope="([^"]+)".*/\1/p')
echo "授权中心的地址" "$realm"
echo "需要授权的服务" "$service"
echo "需要授权的范围" "$scope"
echo "==============================================================="
echo
[ -z "$realm" ] && echo "未发现授权中心，中止测试" && exit 1

exit 0 # 测试授权开关

###############################################################################################################
# scope="repository:ollama-webui/ollama-webui:pull"

url="${realm}?_a=1${service:+"&service=${service}"}${scope:+"&scope=${scope}"}"
echo "==============================================================="
echo "请求: $url"
echo "---------------------------------------------------------------"
response=$(curl -s -i "$url" -H "Accept: application/json")
[ -z "$response" ] && echo "请求失败，中止测试" && exit 1
echo "$response" | head -n 20
echo "---------------------------------------------------------------"
token=$(echo "$response" | awk 'BEGIN { in_body=0 } /^\r?$/ { in_body=1; next } in_body { print }' | jq -r '.token')
echo "Token: " "$(echo "$token" | cut -c 1-32)..."
echo "==============================================================="
echo

[ -z "$token" ] && echo "授权失败，中止测试" && exit 1

# curl -s -I "$Host/v2/ollama/ollama/manifests/latest" \
#     -H "Accept: application/json" \
#     -H "Accept: application/vnd.oci.image.index.v1+json" \
#     -H "Accept: application/vnd.oci.image.manifest.v1+json" \
#     -H "Accept: application/vnd.docker.distribution.manifest.v1+prettyjws" \
#     -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
#     -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
#     -H "Authorization: Bearer ${token}" \
#     -H "Connection: close" -o -
