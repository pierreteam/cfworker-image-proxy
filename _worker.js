/** @type {Table} */
const Routes = {
    hub: "https://registry-1.docker.io",
    docker: "https://registry-1.docker.io",
    ghcr: "https://ghcr.io",
    k8s: "https://registry.k8s.io",
    quay: "https://quay.io",
    nvcr: "https://nvcr.io",

    // 此处添加域名前缀路由
};

export default {
    /**
     * 应用入口
     * @param {Request} req
     * @param {Env} env
     * @returns
     */
    async fetch(req, env) {
        const url = new URL(req.url);

        let target, segment;
        let path = url.pathname;

        // 路由决策
        target = routing(url, env);

        [segment, path] = nextSegment(skipSlash(path));

        // 只支持 api v2
        if (!target || segment !== "v2") return new Response("Not Found Service", { status: 404 });

        [segment, path] = nextSegment(skipSlash(path));

        // 处理授权请求
        if (segment === "auth") {
            path = skipSlash(path);

            if (path) {
                // 从 URL 中获取认证服务
                target = decodeURIComponent(path);
            } else {
                // 通过 api 协商方式，查找认证服务
                const resp = await forward(`${target}/v2/`);
                target = findAuthService(resp.headers);
            }

            if (!target) return new Response("Not Found Auth Service", { status: 404 });

            // 代理转发授权请求
            return await forward(`${target}${url.search}`, req);
        }

        // 代理转发资源请求
        const resp = await forward(`${target}${url.pathname}${url.search}`, req);
        let headers = resp.headers;

        // 改写授权中心
        if (!yes(env.DisableProxyAuth) && headers.has("WWW-Authenticate")) {
            headers === resp.headers && (headers = new Headers(headers));
            const realm = `${url.protocol}//${url.host}/v2/auth`;
            headers = replaceAuthService(headers, realm);
        }

        // 添加缓存控制
        if (resp.ok) {
            headers === resp.headers && (headers = new Headers(headers));
            headers.append("Cache-Control", "max-age=300");
            headers.append("Vary", "Accept");
            headers.append("Vary", "Accept-Encoding");
            headers.append("Vary", "Accept-Language");
            headers.append("Vary", "Authorization");
            headers.append("Vary", "User-Agent");
        }

        // 响应头未修改，直接返回
        if (headers === resp.headers) return resp;

        // 响应头被修改，重写响应
        return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers,
        });
    },
};

/**
 * 路由决策
 * @param {URL} url
 * @param {Env} env
 * @returns {string|null}
 */
function routing(url, env) {
    let target;

    // 前缀路由
    if (!yes(env.DisablePrefixRoute)) {
        target = nextSegment(url.hostname, ".")[0];
        target = Routes[target.toLowerCase()];
        if (target) return target;
    }

    // 默认配置
    return env.Target || Routes.hub || null;
}

/**
 * 代理转发
 * @param {string|URL} input
 * @param {Request|null} req
 * @returns
 */
async function forward(input, req = null) {
    if (!req) return await fetch(input, { redirect: "follow" });
    return await fetch(input, {
        headers: req.headers,
        method: req.method,
        body: req.body,
        redirect: "follow",
    });
}

/**
 * 获取认证服务
 * @param {Headers} headers - 响应头
 * @returns
 */
function findAuthService(headers) {
    const header = headers.get("WWW-Authenticate");
    if (!header) return null;

    const regexp = /realm=(?:"([^"]*)"|([^,\s]*))/i;
    const match = header.match(regexp);
    return (match && (match[1] || match[2])) || null;
}

/**
 * 替换认证服务
 * @param {Headers} headers - 待修改的响应头
 * @param {string} realm - realm 地址
 * @returns 转换后的字符串
 */
function replaceAuthService(headers, realm) {
    let header = headers.get("WWW-Authenticate");
    if (!header) return headers;

    const regexp = /(realm=)(?:"([^"]*)"|([^,\s]*))/i;
    header = header.replace(regexp, (_, prefix, quoted, unquoted) => {
        const path = encodeURIComponent(quoted || unquoted || "");
        return path ? `${prefix}"${realm}/${path}"` : `${prefix}"${realm}"`;
    });
    headers.set("WWW-Authenticate", header);
    return headers;
}

/*********************************************************************/
// 辅助函数

/**
 * @param {string|undefined} value
 * @returns
 */
function yes(value) {
    if (!value) return false;
    const val = value.toLowerCase();
    return !!val && val !== "no" && val !== "false" && val !== "0";
}

// 路径解析
/**
 * 跳过前缀路径分隔符
 * @param {string} str - 源字符串
 * @returns 跳过前缀路径分隔符后的字符串
 */
function skipSlash(str, char = "/") {
    let i = 0;
    for (; i < str.length && str[i] === char; i++);
    return str.slice(i);
}

/**
 * 获取下一段路径
 * @param {string} str - 源字符串
 * @returns {[string, string]} [首段路径, 剩余的字符串]
 */
function nextSegment(str, char = "/") {
    let i = 0;
    for (; i < str.length && str[i] !== char; i++);
    return [str.slice(0, i), str.slice(i)];
}
