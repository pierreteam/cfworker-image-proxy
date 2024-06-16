// 默认目标
const TargetURL = "https://registry-1.docker.io";

// 本节点的网址；如：https://XXXXXX.worker.dev
// 留空自动获取入站域名
const BaseURL = "";

export default {
	/**
	 * @param {Request} request
	 * @param {Object} env
	 * @return {Promise<Response>}
	 */
	async fetch(request, env) {
		const url = new URL(request.url);

		let [segment, pathname] = nextSegment(skipSlash(url.pathname));

		if (segment === "token") {
			pathname = skipSlash(pathname);
			if (!pathname)
				return new Response("Invalid Auth Service", { status: 400 });

			pathname = decodeURIComponent(pathname);
			return await proxy(`${pathname}${url.search}`, request);
		}

		const target = env.TargetURL || TargetURL;
		let respone = await proxy(`${target}${url.pathname}${url.search}`, request);
		let headers = respone.headers;

		while (headers.has("location"))
			respone = await fetch(headers.get("location"), request);

		const key = "www-authenticate";
		if (respone.headers.has(key)) {
			respone = new Response(respone.body, respone);
			headers = respone.headers;

			const baseURL = env.BaseURL || BaseURL || `${url.protocol}//${url.host}`;

			const header = transformWWWAuth(headers.get(key), baseURL);
			header ? headers.set(key, header) : headers.delete(key);
		}

		return respone;
	},
};

/**
 * 发起代理请求
 * @param {string} target
 * @param {Request} request
 * @returns
 */
async function proxy(target, request) {
	const url = new URL(target);
	const headers = new Headers(request.headers);
	headers.set("host", url.host);
	return await fetch(url, {
		headers: headers,
		method: request.method,
		body: request.body,
		redirect: "follow",
	});
}

/**
 * 转换 `WWW-Authenticate` 头
 * @param {string} input - 待转换字符串
 * @param {string} realmBase - realm 基础地址
 * @returns {string} 转换后的字符串
 */
function transformWWWAuth(input, realmBase) {
	const [value, params] = parseValueAndParams(input);
	if (value.toLowerCase() !== "bearer" || !params || !params.realm)
		return input;

	let realm = params.realm || "";
	if (realm.startsWith(`"`)) realm = realm.slice(1, -1);

	let out = `Bearer realm="${realmBase}/token/${encodeURIComponent(realm)}"`;
	for (const key in params) {
		if (key === "realm") continue;
		out += `,${key}=${params[key]}`;
	}
	return out;
}

/**
 * 解析值和参数
 * @param {string} input - 待解析字符串
 * @return {[string | null, Object.<string, string> | null]} [值, 参数]
 */
function parseValueAndParams(input) {
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

		params[pkey.toLowerCase()] = pval;

		s = skipSpace(s);
		if (!s.startsWith(",")) break;
		s = s.slice(1);
	}
	return [value, params];
}

/*********************************************************************/
// 辅助函数

// 路径解析
/**
 * 跳过前缀路径分隔符
 * @param {string} str - 源字符串
 * @returns {string} 跳过前缀路径分隔符后的字符串
 */
function skipSlash(str) {
	let i = 0;
	for (; i < str.length && str[i] === "/"; i++);
	return str.slice(i);
}

/**
 * 获取下一段路径
 * @param {string} str - 源字符串
 * @returns {[string, string]} [首段路径, 剩余的字符串]
 */
function nextSegment(str) {
	let i = 0;
	for (; i < str.length && str[i] !== "/"; i++);
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
 * 跳过空白字符
 * @param {string} str - 源字符串
 * @return {string} 跳过空白字符后的字符串
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

	let idx = 0;
	do idx = str.indexOf('"', idx + 1);
	while (idx > 0 && str[idx - 1] === "\\");

	if (idx <= 0) return ["", ""];
	idx += 1;
	return [str.slice(0, idx), str.slice(idx)];
}
