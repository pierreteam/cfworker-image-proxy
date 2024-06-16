#!/bin/bash

Host=registry-1.docker.io

[ -f /tmp/image-repo-test-token ] &&
    token=$(cat /tmp/image-repo-test-token)

response=$(
    curl -s -I https://$Host/v2/ -H "Host: $Host" \
        -H "Authorization: Bearer ${token}" |
        sed -n '/^www-authenticate: Bearer/s/^www-authenticate: Bearer //p'
)

if [ -n "$response" ]; then
    realm=$(echo "$response" | sed -E 's/.*realm="([^"]+)".*/\1/')
    service=$(echo "$response" | sed -E 's/.*service="([^"]+)".*/\1/')
    token=$(
        curl -s "${realm}?service=${service}&scope=repository:ollama/ollama:pull" \
            -H "Accept: application/json" |
            jq -r '.token' | tee /tmp/image-repo-test-token
    )
    [ -z "$token" ] && echo "授权失败" && exit 1
fi

echo "授权成功"

curl -s -I "https://$Host/v2/ollama/ollama/manifests/latest" \
    -H "Host: $Host" \
    -H "Accept: application/json" \
    -H "Accept: application/vnd.oci.image.index.v1+json" \
    -H "Accept: application/vnd.oci.image.manifest.v1+json" \
    -H "Accept: application/vnd.docker.distribution.manifest.v1+prettyjws" \
    -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
    -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
    -H "Authorization: Bearer ${token}" \
    -H "Connection: close" -o -
