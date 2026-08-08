export function StatusBadge({ status }) {
  const map = {
    active: { label: '啟用', className: 'status-success' },
    inactive: { label: '停用', className: 'status-muted' },
    reported: { label: '已回報', className: 'status-success' },
    pending: { label: '未回報', className: 'status-warning' },
    overdue: { label: '逾時未回報', className: 'status-danger' },
    line_bound: { label: '已綁定成功', className: 'status-success' },
    line_unbound: { label: '未綁定 LINE', className: 'status-muted' },
  };

  const item = map[status] ?? { label: status, className: 'status-muted' };

  return <span className={`status-badge ${item.className}`}>{item.label}</span>;
}
