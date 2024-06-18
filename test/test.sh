#!/bin/bash
# shellcheck disable=all

Host=https://registry-1.docker.io && Image=ollama/ollama
# Host=https://registry.k8s.io && Image=external-dns/external-dns
# Host=https://ghcr.io && Image=ollama-webui/ollama-webui
# Host=https://nvcr.io;

# Host=https://quay.io && Image=strimzi/kafka
# Host=https://gcr.io

Host=http://hub.pierre.local:5000

scope="repository:$Image:pull"
echo "==============================================================="
url="$Host/v2/"
echo "请求: $url"
echo "---------------------------------------------------------------"
response=$(curl -s -i "$url")
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

if [ -n "$realm" ]; then

    ###############################################################################################################
    
    echo "==============================================================="
    url="${realm}?_a=1${service:+"&service=${service}"}${scope:+"&scope=${scope}"}"
    echo "请求: $url"
    echo "---------------------------------------------------------------"
    response=$(curl -s -i "$url" -H "Accept: application/json")
    [ -z "$response" ] && echo "请求失败，中止测试" && exit 1
    echo "$response" | head -n 20
    echo "==============================================================="
    echo

    token=$(echo "$response" | awk 'BEGIN { in_body=0 } /^\r?$/ { in_body=1; next } in_body { print }' | jq -r '.token')
    [ -z "$token" ] && echo "授权失败，中止测试" && exit 1
fi

curl -s -i "$Host/v2/$Image/manifests/latest" \
    -H "Accept: application/json" \
    -H "Accept: application/vnd.oci.image.index.v1+json" \
    -H "Accept: application/vnd.oci.image.manifest.v1+json" \
    -H "Accept: application/vnd.docker.distribution.manifest.v1+prettyjws" \
    -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
    -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
    -H "Authorization: Bearer ${token}" \
    -H "Connection: close" -o - | head -n 20

    echo $token
