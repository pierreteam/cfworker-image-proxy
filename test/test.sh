#!/bin/bash
# shellcheck disable=all

body() { awk 'BEGIN { in_body=0 } /^\r?$/ { in_body=1; next } in_body { print }'; }

Host=https://registry-1.docker.io && Image=library/nginx && Target=docker
# Host=https://registry.k8s.io && Image=pause && Version=3.9 && Target=k8s
# Host=https://quay.io && Image=minio/minio && Target=quay
# Host=https://ghcr.io && Image=open-webui/open-webui && Version=v0.5.9 && Target=ghcr
# Host=https://gcr.io && Image=google-containers/busybox && Target=gcr
# Host=https://nvcr.io && Image=nvidia/cuda && Target=nvcr
# Host=https://public.ecr.aws && Image=lambda/python && Version=3.8 && Target=ecr

# Host=http://$Target.pierre.test:8787

echo "==============================================================="
url="$Host/v2/"
echo "请求: $url"
echo "---------------------------------------------------------------"
response=$(curl -s -i -L "$url") || exit 1
echo "$response" | head -n 20 && echo "..."
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
    scope="repository:$Image:pull"

    echo "==============================================================="
    url="${realm}?_a=1${service:+"&service=${service}"}${scope:+"&scope=${scope}"}"
    echo "请求: $url"
    echo "---------------------------------------------------------------"
    response=$(curl -s -i -L "$url" -H "Accept: application/json" -H "Accept-Encoding: identity") || exit 1
    echo "$response"
    echo "==============================================================="
    echo

    token=$(echo "$response" | body | jq -r '.token')
    [ -z "$token" ] && echo "授权失败，中止测试" && exit 1
fi

echo "==============================================================="
url="$Host/v2/$Image/manifests/${Version:-"latest"}"
echo "请求: $url"
echo "---------------------------------------------------------------"
response=$(
    curl -s -i -L "$url" \
        -H "Accept: application/json" \
        -H "Accept: application/vnd.oci.image.index.v1+json" \
        -H "Accept: application/vnd.oci.image.manifest.v1+json" \
        -H "Accept: application/vnd.docker.distribution.manifest.v1+prettyjws" \
        -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
        -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
        ${token:+-H "Authorization: Bearer ${token}"}
) || exit 1
response=$(echo "$response" | body)
echo "$response" | jq -r '.manifests[] | "\(.digest) \(.mediaType)"'

layer=$(echo "$response" | jq -r '.manifests[-1] | "\(.digest)#\(.mediaType)"')
digest=${layer%%#*}
mediaType=${layer##*#}

echo "==============================================================="
url="$Host/v2/$Image/blobs/$digest"
echo "请求: $url"
echo "---------------------------------------------------------------"
# curl -s -I "$url" -H "Accept: $mediaType" ${token:+-H "Authorization: Bearer ${token}"}
curl -s -I -L "$url" -H "Accept: $mediaType" ${token:+-H "Authorization: Bearer ${token}"}
