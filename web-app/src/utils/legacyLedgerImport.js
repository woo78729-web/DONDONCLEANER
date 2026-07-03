const GROUP_ALIASES = {
  鈞: 'jun',
  阡: 'qian',
  jun: 'jun',
  qian: 'qian',
};

const CHINESE_MONTH_MAP = {
  一月: 1,
  二月: 2,
  三月: 3,
  四月: 4,
  五月: 5,
  六月: 6,
  七月: 7,
  八月: 8,
  九月: 9,
  十月: 10,
  十一月: 11,
  十二月: 12,
};

const PRICE_KEYS = ['1500', '1300', '1000'];

function cellText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  const text = cellText(value).replace(/,/g, '');

  if (!text) {
    return 0;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function formatYearMonth(year, month) {
  return `${String(year)}-${String(month).padStart(2, '0')}`;
}

function guessYearFromFileName(fileName = '') {
  const match = fileName.match(/(20\d{2})/);

  return match ? match[1] : String(new Date().getFullYear());
}

function normalizeDailyUnits(rawUnits = {}) {
  const normalized = {};

  for (let day = 1; day <= 31; day += 1) {
    const key = String(day);
    const source = rawUnits[key] || rawUnits[String(day).padStart(2, '0')] || {};

    normalized[key] = {
      1500: parseNumber(source['1500'] ?? source.u1500),
      1300: parseNumber(source['1300'] ?? source.u1300),
      1000: parseNumber(source['1000'] ?? source.u1000),
    };
  }

  return normalized;
}

function findGroupBlocks(rows) {
  const blocks = [];

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const text = cellText(cell);

      if (!GROUP_ALIASES[text]) {
        return;
      }

      blocks.push({
        groupKey: GROUP_ALIASES[text],
        groupLabel: text,
        headerRow: rowIndex,
        startCol: colIndex,
      });
    });
  });

  return blocks;
}

function findColumnOffset(headerRow, startCol) {
  const offsets = { day: 0, 1500: null, 1300: null, 1000: null };

  for (let col = startCol; col < startCol + 8; col += 1) {
    const label = cellText(headerRow[col]);

    if (!label) {
      continue;
    }

    if (label.includes('日期') || label === '日') {
      offsets.day = col - startCol;
    }

    if (label.includes('1500')) {
      offsets['1500'] = col - startCol;
    }

    if (label.includes('1300')) {
      offsets['1300'] = col - startCol;
    }

    if (label.includes('1000')) {
      offsets['1000'] = col - startCol;
    }
  }

  if (offsets['1500'] === null) {
    offsets['1500'] = 1;
    offsets['1300'] = 2;
    offsets['1000'] = 3;
  }

  return offsets;
}

function parseGroupBlock(rows, block) {
  const headerRow = rows[block.headerRow] || [];
  const offsets = findColumnOffset(headerRow, block.startCol);
  const dailyUnits = {};
  const summary = {};

  for (let rowIndex = block.headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const dayCell = row[block.startCol + offsets.day];
    const day = parseNumber(dayCell);

    if (day >= 1 && day <= 31) {
      dailyUnits[String(day)] = {
        1500: parseNumber(row[block.startCol + offsets['1500']]),
        1300: parseNumber(row[block.startCol + offsets['1300']]),
        1000: parseNumber(row[block.startCol + offsets['1000']]),
      };
      continue;
    }

    const label = cellText(dayCell || row[block.startCol]);

    if (label.includes('總營業額')) {
      summary.total_revenue = parseNumber(row[block.startCol + offsets['1000'] + 1] ?? row[block.startCol + 1]);
    }

    if (label.includes('毛利')) {
      summary.gross_profit = parseNumber(row[block.startCol + offsets['1000'] + 1] ?? row[block.startCol + 1]);
    }

    if (label.includes('營利')) {
      summary.net_profit = parseNumber(row[block.startCol + offsets['1000'] + 1] ?? row[block.startCol + 1]);
    }

    if (label.includes('弘毅分')) {
      summary.hongyi_share = parseNumber(row[block.startCol + offsets['1000'] + 1] ?? row[block.startCol + 1]);
    }
  }

  return {
    group_key: block.groupKey,
    daily_units: normalizeDailyUnits(dailyUnits),
    ...summary,
  };
}

function parseAdvanceTables(rows) {
  const advances = [];
  const seen = new Set();

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const text = cellText(cell);

      if (!text.includes('代墊')) {
        return;
      }

      let partner = null;

      if (text.includes('阿泰')) {
        partner = 'atai';
      } else if (text.includes('弘毅')) {
        partner = 'hongyi';
      } else {
        partner = 'hongyi';
      }

      let amountCol = colIndex + 2;
      const headerRow = rows[rowIndex] || row;

      for (let c = colIndex; c < colIndex + 6; c += 1) {
        if (cellText(headerRow[c]).includes('金額')) {
          amountCol = c;
          break;
        }
      }

      for (let offset = 1; offset < 30; offset += 1) {
        const dataRow = rows[rowIndex + offset];

        if (!dataRow) {
          break;
        }

        const label = cellText(dataRow[colIndex] ?? dataRow[colIndex + 1]);
        const amount = parseNumber(dataRow[amountCol] ?? dataRow[colIndex + 2] ?? dataRow[colIndex + 1]);

        if (label.includes('總計')) {
          break;
        }

        if (!label || label.includes('代墊') || label.includes('日期') || label.includes('項目')) {
          continue;
        }

        const dedupeKey = `${partner}:${label}:${amount}`;

        if (amount !== 0 && !seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          advances.push({ partner, label, amount });
        }
      }
    });
  });

  return advances;
}

function guessYearMonthFromRows(rows, fileName = '') {
  const fileMatch = fileName.match(/(20\d{2})[-_/]?(\d{1,2})/);

  if (fileMatch) {
    return formatYearMonth(fileMatch[1], fileMatch[2]);
  }

  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const text = cellText(cell);
      const match = text.match(/(20\d{2})[年/-](\d{1,2})/);

      if (match) {
        return formatYearMonth(match[1], match[2]);
      }
    }
  }

  return formatYearMonth(guessYearFromFileName(fileName), new Date().getMonth() + 1);
}

function guessYearMonthFromSheetName(sheetName, fileName = '') {
  const name = cellText(sheetName);
  const defaultYear = guessYearFromFileName(fileName);

  let match = name.match(/(20\d{2})[年\-_/ ]*(\d{1,2})/);

  if (match) {
    return formatYearMonth(match[1], match[2]);
  }

  match = name.match(/^(\d{1,2})\s*月$/);

  if (match) {
    return formatYearMonth(defaultYear, match[1]);
  }

  if (CHINESE_MONTH_MAP[name]) {
    return formatYearMonth(defaultYear, CHINESE_MONTH_MAP[name]);
  }

  match = name.match(/^(\d{1,2})$/);

  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 12) {
    return formatYearMonth(defaultYear, match[1]);
  }

  return null;
}

function summarizeGroups(groups) {
  return groups.reduce(
    (acc, group) => {
      const totals = Object.values(group.daily_units || {}).reduce(
        (dayAcc, day) => ({
          u1500: dayAcc.u1500 + (day['1500'] || 0),
          u1300: dayAcc.u1300 + (day['1300'] || 0),
          u1000: dayAcc.u1000 + (day['1000'] || 0),
        }),
        { u1500: 0, u1300: 0, u1000: 0 },
      );

      return {
        units: acc.units + totals.u1500 + totals.u1300 + totals.u1000,
        revenue: acc.revenue + (group.total_revenue || 0),
      };
    },
    { units: 0, revenue: 0 },
  );
}

function parseLegacyLedgerSheet(rows, sheetName, fileName = '') {
  const blocks = findGroupBlocks(rows);

  if (blocks.length === 0) {
    return null;
  }

  const yearMonth = guessYearMonthFromSheetName(sheetName, fileName)
    || guessYearMonthFromRows(rows, fileName);

  return {
    sheet_name: sheetName,
    year_month: yearMonth,
    groups: blocks.map((block) => parseGroupBlock(rows, block)),
    advances: parseAdvanceTables(rows),
    source: 'import',
  };
}

export function parseLegacyLedgerWorkbook(workbook, fileName = '', XLSX) {
  const months = [];
  const skippedSheets = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const parsed = parseLegacyLedgerSheet(rows, sheetName, fileName);

    if (!parsed) {
      skippedSheets.push({ sheet_name: sheetName, reason: '找不到鈞或阡' });
      return;
    }

    months.push({
      ...parsed,
      summary: summarizeGroups(parsed.groups),
    });
  });

  if (months.length === 0) {
    throw new Error('找不到可匯入的分頁，請確認每個月份分頁都有「鈞」「阡」欄位');
  }

  months.sort((a, b) => a.year_month.localeCompare(b.year_month));

  return {
    is_year_workbook: months.length > 1,
    year: guessYearFromFileName(fileName),
    months,
    skipped_sheets: skippedSheets,
  };
}

export async function readLegacyLedgerExcelFile(file) {
  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array' });
        resolve(parseLegacyLedgerWorkbook(workbook, file.name, XLSX));
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('無法讀取 Excel 檔案'));
    reader.readAsArrayBuffer(file);
  });
}

export { PRICE_KEYS, normalizeDailyUnits };
