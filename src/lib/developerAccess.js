/** Session key holding the developer code after a successful server-side verification. */
export const DEV_CODE_SESSION_KEY = 'developer_code';

export const getDevCode = () => sessionStorage.getItem(DEV_CODE_SESSION_KEY) || '';
export const clearDevCode = () => sessionStorage.removeItem(DEV_CODE_SESSION_KEY);