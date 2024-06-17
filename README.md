# 容器镜像代理

### 功能介绍

-   支持所有 v2 规范的镜像仓库代理
-   支持域名路由，单点代理多个镜像仓库
-   支持域名前缀自动路由（预设 hub, k8s, ghcr, quay, nvcr）

### 参数说明

| 环境变量名        | 可选值                                                                     | 说明                                         |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| Target            | 预设名: `hub`, `k8s`, `ghcr`, `quay`, `nvcr`<br>自定义：`https://xxxxx.io` | 路由未命中的默认镜像仓库                     |
| BaseURL           |                                                                            | 本项目部署的地址<br>调试用的，普通用户不用管 |
| EnableProxyAuth   | `true`, `false` (默认：`false`)                                            | 启用授权接口的代理<br>默认只代理资源接口     |
| EnablePrefixRoute | `true`, `false` (默认：`false`)                                            | 启用域名前缀自动路由<br>只支持预设名作前缀   |

### 部署说明

1. **Cloudflare Workers** 部署：复制 \_worker.js 代码至 Workers 编译面版，保存并部署

    [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pierre-primary/cloudflare-workers-image-repo)

2. **Cloudflare Pages** 部署：Fork 项目后；创建 Pages 时连接 GitHub 一键部署

3. **配置参数**: 如果特殊要求可跳过；复制项目中 vars.tmpl 的内容，粘贴到 Cloudflare 环境变量编辑页，修改为自己的值，保存并重新部署

4. **绑定多个域名**: 如果路由需求的，请在 Cloudflare 中添加自定义域名；要使用域名前缀自动路由的，域名前缀需要遵循预设名，或者自行修改添加预设。

### 使用说明

```bash
# 例子

docker pull hub.xxxxx.yyy/ollama/ollama:latest # docker 仓库

docker pull k8s.xxxxx.yyy/pause:3.6 # k8s 仓库

docker pull ghcr.xxxxx.yyy/ollama-webui/ollama-webui:latest # github 仓库

# ...

```
