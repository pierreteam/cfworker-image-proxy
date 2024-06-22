/** @type {{[target: string]: string|null|undefined}}*/
const Targets = {
    __proto__: null,
    hub: "https://registry-1.docker.io",
    ghcr: "https://ghcr.io",
    k8s: "https://registry.k8s.io",
    quay: "https://quay.io",
    nvcr: "https://nvcr.io",

    // 此处添加自定义预设
};

/** @type {{[domain: string]: string|null|undefined}}*/
const Routes = {
    __proto__: null,

    // 此处添加自定义路由；格式如下：
    // "你的入站域名": hub | ghcr | k8s | quay | nvcr | 自定义
};

const BaseURL = "";

export default {
    /**
     * 应用入口
     * @param {Request} req
     * @param {Env} env
     * @returns
     */
    async fetch(req, env) {
        const url = new URL(req.url);

        let [segment, pathname] = nextSegment(skipSlash(url.pathname));

        if (segment !== "v2")
            return new Response("Not Found Service", { status: 404 });

        // 路由决策
        let [target, baseURL] = routing(url, env);

        [segment, pathname] = nextSegment(skipSlash(pathname));
        if (segment === "auth") {
            pathname = skipSlash(pathname);

            // 从 URL 中获取认证服务
            if (pathname) pathname = decodeURIComponent(pathname);

            // 查找认证服务
            if (!pathname) {
                const resp = await forward(`${target}/v2/`);
                // @ts-ignore
                pathname = findAuthService(resp.headers);
            }

            if (!pathname)
                return new Response("Not Found Auth Service", { status: 404 });

            // 代理转发授权请求
            return await forward(`${pathname}${url.search}`, req);
        }

        // 代理转发资源请求
        const resp = await forward(`${target}${url.pathname}${url.search}`, req);
        let headers = resp.headers;

        // 改写授权中心
        if (!yes(env.DisableProxyAuth) && headers.has("WWW-Authenticate")) {
            if (!baseURL) baseURL = `${url.protocol}//${url.host}`;
            headers = replaceAuthService(new Headers(headers), `${baseURL}/v2/auth`);
        }

        if (resp.ok) {
            if (headers === resp.headers) headers = new Headers(headers);
            // 添加缓存控制
            headers.append("Cache-Control", "max-age=300");
            headers.append("Vary", "Accept");
            headers.append("Vary", "Accept-Encoding");
            headers.append("Vary", "Accept-Language");
            headers.append("Vary", "Authorization");
            headers.append("Vary", "User-Agent");
        }

        if (headers === resp.headers) return resp;

        // 标头被修改，重写响应
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
 * @returns {[target: string|null, baseURL: string|null]}
 */
function routing(url, env) {
    // 规则路由
    // @ts-ignore
    let target = Routes?.[url.hostname];
    // @ts-ignore
    if (target) return [Targets[target] || target, null];

    // 前缀路由
    if (!yes(env.DisablePrefixRoute)) {
        target = nextSegment(url.hostname, ".")[0];
        // @ts-ignore
        target = Targets[target];
        if (target) return [target, null];
    }

    // 无法路由
    // @ts-ignore
    target = env.Target && Targets[env.Target.toLowerCase()]; // 预设
    target = target || env.Target; // 自定义
    target = target || Targets.hub || null; // 默认
    return [target, env.BaseURL || BaseURL];
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
 * @param {string} realmBase - realm 基础地址
 * @returns 转换后的字符串
 */
function replaceAuthService(headers, realmBase) {
    let header = headers.get("WWW-Authenticate");
    if (!header) return headers;

    const regexp = /(realm=)(?:"([^"]*)"|([^,\s]*))/i;
    header = header.replace(regexp, (_, prefix, quoted, unquoted) => {
        const realm = encodeURIComponent(quoted || unquoted || "");
        return realm
            ? `${prefix}"${realmBase}/${realm}"`
            : `${prefix}"${realmBase}"`;
    });
    headers.set("WWW-Authenticate", header);
    return headers;
}

/*********************************************************************/
// 辅助函数

/**
 * @param {string} value 
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
