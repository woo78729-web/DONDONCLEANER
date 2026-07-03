export function resolveScheduleEventAnchor(schedule, clickEvent) {
  const eventNode = clickEvent?.currentTarget?.closest?.('.rbc-event')
    ?? clickEvent?.target?.closest?.('.rbc-event');

  if (eventNode) {
    return eventNode.getBoundingClientRect();
  }

  if (schedule?.id) {
    const byId = document.querySelector(`[data-schedule-id="${schedule.id}"]`);

    if (byId) {
      return byId.getBoundingClientRect();
    }
  }

  return null;
}

export function computeSchedulePopoverStyle(anchor, { width = 380, estimatedHeight = 260 } = {}) {
  if (!anchor) {
    return null;
  }

  const margin = 12;
  const popoverWidth = Math.min(width, window.innerWidth - margin * 2);
  let left = anchor.left + (anchor.width / 2) - (popoverWidth / 2);
  left = Math.max(margin, Math.min(left, window.innerWidth - popoverWidth - margin));

  let top = anchor.bottom + 8;

  if (top + estimatedHeight > window.innerHeight - margin) {
    top = anchor.top - estimatedHeight - 8;
  }

  top = Math.max(margin, Math.min(top, window.innerHeight - estimatedHeight - margin));

  return {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(popoverWidth)}px`,
    maxHeight: `calc(100vh - ${margin * 2}px)`,
    overflowY: 'auto',
  };
}
