const CAPTURE_BACKGROUND = '#121214';

function prepareElementForCapture(element) {
  element.classList.add('schedule-success-modal--capture');
  element.style.background = CAPTURE_BACKGROUND;
  element.style.backdropFilter = 'none';
  element.style.webkitBackdropFilter = 'none';

  element.querySelectorAll('.schedule-success-modal__actions, .schedule-success-modal__hint').forEach((node) => {
    node.style.display = 'none';
  });

  element.querySelectorAll('*').forEach((node) => {
    node.style.backdropFilter = 'none';
    node.style.webkitBackdropFilter = 'none';
  });
}

export async function captureElementAsPng(element, { filename = 'screenshot.png', scale = 2 } = {}) {
  if (!element) {
    return false;
  }

  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, {
    backgroundColor: CAPTURE_BACKGROUND,
    scale,
    useCORS: true,
    logging: false,
    onclone: (_document, clonedElement) => {
      prepareElementForCapture(clonedElement);
    },
  });

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (!blob) {
    return false;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return true;
}
