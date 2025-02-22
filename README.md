# 容器镜像仓库代理

-   支持所有 v2 规范的镜像仓库代理
-   支持域名路由，单点代理多个镜像仓库
-   支持域名前缀自动路由；预设前缀：`docker` `k8s` `gcr` `ghcr` `quay` `nvcr` `ecr`

## 部署

-   **Pages 部署**：`Fork 项目` -> `创建 Pages` -> `连接 GitHub` -> `选择分支` -> `保存并部署`

-   **Workers 部署**：`创建 Workers` -> `复制` [\_worker.js](https://github.com/pierreteam/cfworker-image-proxy/blob/main/_worker.js) -> `保存并部署`

-   **Workers 快捷部署**

    [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pierreteam/cloudflare-workers-image-repo)

## 参数配置

进入 Cloudflare 管理面板，修改环境变量为自己的值，保存并重新部署；如果无特殊要求可跳过

| 环境变量名         | 可选值         | 默认                         | 说明                                                         |
| ------------------ | -------------- | ---------------------------- | ------------------------------------------------------------ |
| Target             | 自定义目标仓库 | https://registry-1.docker.io | 默认镜像仓库<br>路由未命中时使用                             |
| DisableProxyAuth   | true \| false  | false                        | 禁用授权接口的代理<br>禁用后只会代理资源接口<br>感觉会安全点 |
| DisablePrefixRoute | true \| false  | false                        | 禁用域名前缀自动路由                                         |

## 域名前缀自动路由

> 要求配置参数 `DisablePrefixRoute` 为 `false`

三种自动路由方式：

-   **自定义域名**

    进入 Cloudflare 管理面板添加自定义**域名**；

    > 域名格式 `<前缀>.<自定义域名>`

-   **自定义路由** + **CNAME 记录**，实现优选 **（无本地 DNS 服务时，推荐）**

    进入 Cloudflare 管理面板添加自定义**路由**；

    > 路由格式 `<前缀>.<自定义域名>/*`

    进入 Cloudflare DNS 解析添加 CNAME 记录，把自定义域名解析为优选域名；

-   **自定义域名/路由** + **本地 DNS 服务**，实现优选 **（有本地 DNS 服务时，推荐）**

    进入 Cloudflare 管理面板添加自定义**域名/路由**；

    > 域名格式 `<前缀>.<自定义域名>`；路由格式 `<前缀>.<自定义域名>/*`；

    在本地的 DNS 服务添加 CNAME 记录，把自定义域名解析为优选域名；
