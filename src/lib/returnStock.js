import { base44 } from '@/api/base44Client';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Applies an approved return to the branch stock on the server (stockOps → returnStock):
 * returned items go back to stock, exchange items leave it.
 * The server keeps one operation per return, so calling this again (retry, double click,
 * another computer) never changes the stock twice. A lost connection is retried here.
 */
export async function applyReturnStock(returnId) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await base44.functions.invoke('stockOps', { action: 'returnStock', return_id: returnId });
      return;
    } catch (e) {
      lastError = e;
      const status = e?.response?.status || e?.status;
      // 403 / 404 / not approved — retrying will not help
      if (status && status !== 409 && status < 500) break;
      await wait(800 * (attempt + 1));
    }
  }
  const msg = lastError?.response?.data?.error || lastError?.message || 'שגיאה לא ידועה';
  throw new Error(`ההחזרה נשמרה, אבל עדכון המלאי נכשל: ${msg}. אשר אותה שוב מדף ההחזרות כדי להשלים את עדכון המלאי.`);
}
