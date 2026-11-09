const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

// Security: the login redirect goes to app_base_url, and a ?app_base_url= link is remembered —
// only this site or a Base44 host is accepted (no open redirect to a look-alike login page).
const safeBaseUrl = (value) => {
	if (!value || isNode) return value;
	try {
		const u = new URL(value, window.location.origin);
		const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
		const httpsOk = u.protocol === 'https:' || (local && u.protocol === 'http:');
		const host = u.hostname.toLowerCase();
		const trusted = u.origin === window.location.origin || local ||
			host === 'base44.app' || host.endsWith('.base44.app') || host === 'base44.com' || host.endsWith('.base44.com');
		if (httpsOk && trusted) return value;
	} catch { /* invalid URL */ }
	try { storage.removeItem('base44_app_base_url'); } catch { /* storage blocked */ }
	return import.meta.env.VITE_BASE44_APP_BASE_URL || null;
}

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl: safeBaseUrl(getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL })),
	}
}


export const appParams = {
	...getAppParams()
}
