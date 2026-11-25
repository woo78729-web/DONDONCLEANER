// 傳 LINE 時需夠大：桌機約 1440px 寬；手機降解析度避免卡住
const CARD_WIDTH = 720;
const DESKTOP_SCALE = 2;
const MOBILE_SCALE = 1.25;
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

function isMobileCaptureEnvironment() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
}

function yieldToMain() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

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

function measureRows(ctx, rows, valueWidth, scale) {
  return rows.map((row) => {
    const size = row.emphasis ? 28 : 24;
    ctx.font = `${row.emphasis ? 800 : 600} ${size * scale}px ${FONT_FAMILY}`;
    const lines = wrapText(ctx, row.value, valueWidth);
    const lineHeight = row.emphasis ? 36 : VALUE_LINE_HEIGHT;
    const height = Math.max(lineHeight, lines.length * lineHeight) + ROW_PADDING_Y * 2;

    return { ...row, lines, lineHeight, height };
  });
}

function drawSuccessCard(rows, title, scale = DESKTOP_SCALE) {
  const valueWidth = (CARD_WIDTH - PADDING_X * 2 - LABEL_WIDTH - COLUMN_GAP) * scale;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  if (!ctx) {
    return null;
  }

  const measured = measureRows(ctx, rows, valueWidth, scale);
  const headerHeight = 150;
  const bodyHeight = measured.reduce((total, row) => total + row.height, 0);
  const height = PADDING_TOP + headerHeight + bodyHeight + PADDING_BOTTOM;

  canvas.width = Math.round(CARD_WIDTH * scale);
  canvas.height = Math.round(height * scale);

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = scale;
  roundRect(ctx, scale, scale, canvas.width - scale * 2, canvas.height - scale * 2, 24 * scale);
  ctx.stroke();

  const centerX = canvas.width / 2;
  const iconY = (PADDING_TOP + 36) * scale;
  ctx.beginPath();
  ctx.arc(centerX, iconY, 36 * scale, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.iconBg;
  ctx.fill();
  ctx.fillStyle = COLORS.icon;
  ctx.font = `800 ${40 * scale}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✓', centerX, iconY + scale);

  ctx.fillStyle = COLORS.title;
  ctx.font = `800 ${32 * scale}px ${FONT_FAMILY}`;
  ctx.fillText(title || '預約完成', centerX, (PADDING_TOP + 108) * scale);

  let cursorY = (PADDING_TOP + headerHeight) * scale;
  const contentLeft = PADDING_X * scale;
  const valueLeft = (PADDING_X + LABEL_WIDTH + COLUMN_GAP) * scale;

  measured.forEach((row, index) => {
    const rowHeight = row.height * scale;

    if (row.emphasis) {
      ctx.fillStyle = COLORS.emphasisBg;
      roundRect(ctx, 24 * scale, cursorY, (CARD_WIDTH - 48) * scale, rowHeight, 14 * scale);
      ctx.fill();
    } else if (index < measured.length - 1) {
      ctx.strokeStyle = COLORS.divider;
      ctx.lineWidth = scale;
      ctx.beginPath();
      ctx.moveTo(contentLeft, cursorY + rowHeight);
      ctx.lineTo(canvas.width - contentLeft, cursorY + rowHeight);
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.label;
    ctx.font = `700 ${20 * scale}px ${FONT_FAMILY}`;
    ctx.fillText(row.label, contentLeft, cursorY + ROW_PADDING_Y * scale);

    ctx.fillStyle = row.emphasis ? COLORS.emphasisText : COLORS.value;
    ctx.font = `${row.emphasis ? 800 : 600} ${(row.emphasis ? 28 : 24) * scale}px ${FONT_FAMILY}`;
    row.lines.forEach((line, lineIndex) => {
      ctx.fillText(line, valueLeft, cursorY + ROW_PADDING_Y * scale + lineIndex * row.lineHeight * scale);
    });

    cursorY += rowHeight;
  });

  return canvas;
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.88) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
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

async function shareOrDownloadBlob(blob, filename) {
  if (!blob) {
    return false;
  }

  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

  if (
    isMobileCaptureEnvironment()
    && typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: '預約完成',
      });
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return true;
      }
      // fall through to download
    }
  }

  const url = URL.createObjectURL(blob);

  try {
    triggerDownload(url, filename);
    return true;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

export function shouldAutoDownloadSuccessCard() {
  return !isMobileCaptureEnvironment();
}

export async function downloadSuccessCardJpg({
  filename = 'screenshot.jpg',
  rows = [],
  title = '預約完成',
} = {}) {
  await yieldToMain();

  const scale = isMobileCaptureEnvironment() ? MOBILE_SCALE : DESKTOP_SCALE;
  const canvas = drawSuccessCard(rows, title, scale);

  if (!canvas) {
    return false;
  }

  await yieldToMain();

  const safeName = filename.endsWith('.jpg') ? filename : `${filename}.jpg`;
  let blob = null;

  try {
    blob = await canvasToBlob(canvas, 'image/jpeg', isMobileCaptureEnvironment() ? 0.84 : 0.92);
  } catch {
    blob = null;
  }

  // 部分舊瀏覽器 toBlob 失敗時退回 data URL
  if (!blob) {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    if (!dataUrl || dataUrl.length < 32) {
      return false;
    }
    triggerDownload(dataUrl, safeName);
    return true;
  }

  return shareOrDownloadBlob(blob, safeName);
}
