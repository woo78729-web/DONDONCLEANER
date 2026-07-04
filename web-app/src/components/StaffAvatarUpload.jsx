import { useEffect, useRef, useState } from 'react';
import { getEmployeeInitials } from '../utils/employeeAvatar';

export function StaffAvatarUpload({
  staff,
  onUpload,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  async function handleChange(event) {
    const file = event.target.files?.[0];

    if (!file || !onUpload) {
      return;
    }

    setUploading(true);

    try {
      await onUpload(staff, file);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  const initials = getEmployeeInitials(staff);
  const showImage = staff.avatar_url && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [staff.avatar_url, staff.id]);

  return (
    <div className="staff-avatar-upload">
      <button
        type="button"
        className="staff-avatar-upload__preview"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        aria-label={`${staff.name || staff.account} 上傳頭像`}
        title={uploading ? '上傳中...' : '點擊上傳頭像'}
      >
        {showImage ? (
          <img
            src={staff.avatar_url}
            alt=""
            className="staff-avatar-upload__image"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="staff-avatar-upload__placeholder">{initials}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="staff-avatar-upload__input"
        onChange={handleChange}
        disabled={disabled || uploading}
      />
      <span className="hint staff-avatar-upload__hint">
        {uploading ? '上傳中...' : '更換'}
      </span>
    </div>
  );
}
