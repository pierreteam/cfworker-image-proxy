const Targets = {
	__proto__: null, // 避免原型链查找
	hub: "https://registry-1.docker.io",
	ghcr: "https://ghcr.io",
	k8s: "https://registry.k8s.io",
	quay: "https://quay.io",
	nvcr: "https://nvcr.io",
};

// 路由；目前只支持 Hostname 路由，不支持端口和协议路由
// 格式: "你的入站域名": hub | ghcr | k8s | quay | nvcr | 自定义
const Routes = {
	__proto__: null, // 避免原型链查找
};

// 本节点的网址；如：https://XXXXXX.worker.dev
// 留空自动获取入站域名；普通用户留空就行；
// 二次开发远程调试的话；需要填写（远程调试时自动获取的域名的远程临时Worker的地址）
const BaseURL = "";

export default {
	/**
	 * 应用入口
	 * @param {Request} request
	 * @param {*} env
	 * @returns
	 */
	async fetch(request, env) {
		const url = new URL(request.url);

		let [segment, pathname] = nextSegment(skipSlash(url.pathname));

		if (segment !== "v2") return new Response("Not Found", { status: 404 });

		// 路由决策
		const [target, baseURL] = routing(url, env);

		[segment, pathname] = nextSegment(skipSlash(pathname));

		// 代理转发授权请求
		if (segment === "auth") {
			pathname = skipSlash(pathname);

			pathname = pathname
				? decodeURIComponent(pathname)
				: await findAuthService(target);

			if (!pathname)
				return new Response("Not Found Auth Service", { status: 404 });

			return await proxy(`${pathname}${url.search}`, request);
		}

		// 代理转发资源请求
		let respone = await proxy(`${target}${url.pathname}${url.search}`, request);
		let headers = respone.headers;

		// 手动重定向；proxy 中使用了 follow 重定向; 理论上不会进入这个逻辑；写上安全些
		while (headers.has("location"))
			respone = await fetch(headers.get("location"), request);

		// 改写授权中心
		const key = "www-authenticate";
		if (!yes(env.DisableProxyAuth) && respone.headers.has(key)) {
			respone = new Response(respone.body, respone);
			headers = respone.headers;

			const header = transformWWWAuth(headers.get(key), baseURL);
			header ? headers.set(key, header) : headers.delete(key);
		}

		return respone;
	},
};

/**
 * 路由决策
 * @param {URL} url
 * @param {*} env
 */
function routing(url, env) {
	let target = Routes?.[url.hostname]; // 配置路由
	if (!target && !yes(env.DisablePrefixRoute))
		target = nextSegment(url.hostname, ".")[0]; // 前缀路由

	if (target && Targets[target])
		return [Targets[target], `${url.protocol}//${url.host}`]; // 必须遵循路由

	target = env.Target && Targets[env.Target.toLowerCase()]; // 切换预设
	target = target || env.Target; // 自定义
	target = target || Targets.hub; // 默认
	return [target, env.BaseURL || BaseURL || `${url.protocol}//${url.host}`];
}

/**
 * 代理转发
 * @param {string} target
 * @param {Request} request
 * @returns
 */
async function proxy(target, request) {
	return await fetch(target, {
		headers: request.headers,
		method: request.method,
		body: request.body,
		redirect: "follow", // 自动重定向
	});
}

/**
 * 获取认证服务
 * @param {string} target
 * @returns
 */
async function findAuthService(target) {
	const resp = await fetch(`${target}/v2/`, {
		method: "GET",
		redirect: "follow",
	});
	const key = "www-authenticate";
	if (!resp.headers.has(key)) return;

	const [, params] = parseValueAndParams(resp.headers.get(key), "realm");
	return params?.realm;
}

/**
 * 转换 `WWW-Authenticate` 头
 * @param {string} input - 待转换字符串
 * @param {string} realmBase - realm 基础地址
 * @returns 转换后的字符串
 */
function transformWWWAuth(input, realmBase) {
	const [value, params] = parseValueAndParams(input);
	if (value.toLowerCase() !== "bearer" || !params || !params.realm)
		return input;

	let out = `Bearer realm="${realmBase}/v2/auth/${encodeURIComponent(params.realm)}"`;
	for (const key in params) {
		if (key === "realm") continue;
		out += `,${key}="${params[key]}"`;
	}
	return out;
}

/*********************************************************************/
// 辅助函数

function yes(value) {
	if (!value) return false;
	const val = value.toLowerCase();
	return val && val !== "no" && val !== "false" && val !== "0";
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

// 头部解析
const CToken = 1 << 0;
const CSpace = 1 << 1;

const OctetTypes = (() => {
	const types = new Uint8Array(0xff);
	let sets = " \t\r\n";
	for (let i = 0, c = 0; i < sets.length; i++) {
		c = sets.charCodeAt(i);
		if (c < 0x80) types[c] |= CSpace;
	}

	for (let i = 0x20; i < 0x7f; i++) types[i] |= CToken;

	sets = ' \t"(),/:;<=>?@[]\\{}';
	for (let i = 0, c = 0; i < sets.length; i++) {
		c = sets.charCodeAt(i);
		if (c < 0x80) types[c] &= ~CToken;
	}

	return types;
})();

/**
 * 解析值和参数
 * @param {string} input - 待解析字符串
 * @return {[string | null, Object.<string, string> | null]} [值, 参数]
 */
export function parseValueAndParams(input, key = null) {
	let [value, s] = nextToken(input);
	if (!value) return [null, null];

	/** @type {Object.<string, string> | null} */
	const params = Object.create(null);
	let pkey;
	let pval;
	for (;;) {
		[pkey, s] = nextToken(skipSpace(s));
		if (!pkey || !s.startsWith("=")) break;

		[pval, s] = nextTokenQuoted(s.slice(1));
		if (!pval) break;

		pkey = pkey.toLowerCase();
		params[pkey] = pval;
		if (key && key === pkey) break;

		s = skipSpace(s);
		if (!s.startsWith(",")) break;
		s = s.slice(1);
	}
	return [value, params];
}

/**
 * 跳过空白字符
 * @param {string} str - 源字符串
 * @return 跳过空白字符后的字符串
 */
function skipSpace(str) {
	let i = 0;
	for (; i < str.length; i++) {
		const c = str.charCodeAt(i);
		if (c < 0x80 && (OctetTypes[c] & CSpace) === 0) break;
	}
	return str.slice(i);
}

/**
 * 获取下一个 token
 * @param {string} str - 源字符串
 * @return {[string, string]} [token, 剩余的字符串]
 */
function nextToken(str) {
	let i = 0;
	for (; i < str.length; i++) {
		const c = str.charCodeAt(i);
		if (c < 0x80 && (OctetTypes[c] & CToken) === 0) break;
	}
	return [str.slice(0, i), str.slice(i)];
}

/**
 * 获取下一个 token; 可能带有引号
 * @param {string} str - 源字符串
 * @return {[string, string]} [token, 剩余的字符串]
 */
function nextTokenQuoted(str) {
	if (!str.startsWith('"')) return nextToken(str);

	let idx = 1;
	do idx = str.indexOf('"', idx);
	while (idx >= 1 && str[idx - 1] === "\\");

	if (idx >= 1) return [str.slice(1, idx), str.slice(idx + 1)];
	return ["", ""];
}
