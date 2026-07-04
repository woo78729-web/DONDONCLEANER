const COMPANY_API_BASE = 'https://company.g0v.ronny.tw/api/show';

export function extractCompanyName(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const primaryName = data['公司名稱'] || data['名稱'];
  if (primaryName && String(primaryName).trim()) {
    return String(primaryName).trim();
  }

  const ministryData = data['財政部'];
  if (ministryData && typeof ministryData === 'object') {
    const businessName = ministryData['營業人名稱'];
    if (businessName && String(businessName).trim()) {
      return String(businessName).trim();
    }
  }

  return null;
}

export async function lookupCompanyByTaxId(taxId, signal) {
  const response = await fetch(`${COMPANY_API_BASE}/${taxId}`, { signal });

  if (!response.ok) {
    throw new Error('公司資料查詢失敗');
  }

  const json = await response.json();
  return extractCompanyName(json?.data);
}
