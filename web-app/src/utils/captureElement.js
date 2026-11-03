// 傳 LINE 時需夠大：畫布約 1440px 寬，字級一併放大
const CARD_WIDTH = 720;
const SCALE = 2;
const PADDING_X = 40;
const PADDING_TOP = 40;
const PADDING_BOTTOM = 40;
const LABEL_WIDTH = 110;
const COLUMN_GAP = 18;
const ROW_PADDING_Y = 14;
const VALUE_LINE_HEIGHT = 32;
const FONT_FAMILY = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';

// 東東品牌：深色底 + 橘色強調（勿用萬兔白底海軍藍）
const COLORS = {
  background: '#121214',
  border: 'rgba(255, 255, 255, 0.14)',
  divider: 'rgba(255, 255, 255, 0.08)',
  title: '#ececee',
  label: '#9a9aa3',
  value: '#ececee',
  emphasisBg: 'rgba(255, 140, 0, 0.16)',
  emphasisText: '#ffab40',
  iconBg: 'rgba(67, 160, 71, 0.22)',
  icon: '#81c784',
};

function wrapText(ctx, text, maxWidth) {
  const value = String(text || '-');
  const lines = [];
  let line = '';

  for (const char of value) {
    const next = line + char;

    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
      continue;
    }

    line = next;
  }

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : ['-'];
}

function roundRect(ctx, x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + width, y, x + width, y + height, corner);
  ctx.arcTo(x + width, y + height, x, y + height, corner);
  ctx.arcTo(x, y + height, x, y, corner);
  ctx.arcTo(x, y, x + width, y, corner);
  ctx.closePath();
}

function measureRows(ctx, rows, valueWidth) {
  return rows.map((row) => {
    const size = row.emphasis ? 28 : 24;
    ctx.font = `${row.emphasis ? 800 : 600} ${size * SCALE}px ${FONT_FAMILY}`;
    const lines = wrapText(ctx, row.value, valueWidth);
    const lineHeight = row.emphasis ? 36 : VALUE_LINE_HEIGHT;
    const height = Math.max(lineHeight, lines.length * lineHeight) + ROW_PADDING_Y * 2;

    return { ...row, lines, lineHeight, height };
  });
}

function drawSuccessCard(rows, title) {
  const valueWidth = (CARD_WIDTH - PADDING_X * 2 - LABEL_WIDTH - COLUMN_GAP) * SCALE;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  const measured = measureRows(ctx, rows, valueWidth);
  const headerHeight = 150;
  const bodyHeight = measured.reduce((total, row) => total + row.height, 0);
  const height = PADDING_TOP + headerHeight + bodyHeight + PADDING_BOTTOM;

  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = height * SCALE;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = SCALE;
  roundRect(ctx, SCALE, SCALE, canvas.width - SCALE * 2, canvas.height - SCALE * 2, 24 * SCALE);
  ctx.stroke();

  const centerX = canvas.width / 2;
  const iconY = (PADDING_TOP + 36) * SCALE;
  ctx.beginPath();
  ctx.arc(centerX, iconY, 36 * SCALE, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.iconBg;
  ctx.fill();
  ctx.fillStyle = COLORS.icon;
  ctx.font = `800 ${40 * SCALE}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✓', centerX, iconY + SCALE);

  ctx.fillStyle = COLORS.title;
  ctx.font = `800 ${32 * SCALE}px ${FONT_FAMILY}`;
  ctx.fillText(title || '預約完成', centerX, (PADDING_TOP + 108) * SCALE);

  let cursorY = (PADDING_TOP + headerHeight) * SCALE;
  const contentLeft = PADDING_X * SCALE;
  const valueLeft = (PADDING_X + LABEL_WIDTH + COLUMN_GAP) * SCALE;

  measured.forEach((row, index) => {
    const rowHeight = row.height * SCALE;

    if (row.emphasis) {
      ctx.fillStyle = COLORS.emphasisBg;
      roundRect(ctx, 24 * SCALE, cursorY, (CARD_WIDTH - 48) * SCALE, rowHeight, 14 * SCALE);
      ctx.fill();
    } else if (index < measured.length - 1) {
      ctx.strokeStyle = COLORS.divider;
      ctx.lineWidth = SCALE;
      ctx.beginPath();
      ctx.moveTo(contentLeft, cursorY + rowHeight);
      ctx.lineTo(canvas.width - contentLeft, cursorY + rowHeight);
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.label;
    ctx.font = `700 ${20 * SCALE}px ${FONT_FAMILY}`;
    ctx.fillText(row.label, contentLeft, cursorY + ROW_PADDING_Y * SCALE);

    ctx.fillStyle = row.emphasis ? COLORS.emphasisText : COLORS.value;
    ctx.font = `${row.emphasis ? 800 : 600} ${(row.emphasis ? 28 : 24) * SCALE}px ${FONT_FAMILY}`;
    row.lines.forEach((line, lineIndex) => {
      ctx.fillText(line, valueLeft, cursorY + ROW_PADDING_Y * SCALE + lineIndex * row.lineHeight * SCALE);
    });

    cursorY += rowHeight;
  });

  return canvas;
}

function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadSuccessCardJpg({
  filename = 'screenshot.jpg',
  rows = [],
  title = '預約完成',
} = {}) {
  const canvas = drawSuccessCard(rows, title);

  if (!canvas) {
    return false;
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

  if (!dataUrl || dataUrl.length < 32) {
    return false;
  }

  triggerDownload(dataUrl, filename.endsWith('.jpg') ? filename : `${filename}.jpg`);
  return true;
}
