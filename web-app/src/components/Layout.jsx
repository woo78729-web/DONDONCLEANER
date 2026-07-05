import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { assetUrl } from '../utils/assetUrl';
import { getMobileTabItems, getNavStructure } from '../utils/navItems';
import { canAccess, getRoleLabel } from '../utils/permissions';
import { RemittanceAlertModal } from './RemittanceAlertModal';
import { UnitChangeAlertModal } from './UnitChangeAlertModal';
import { api } from '../api/client';

function NavItemLink({ item, onNavigate, className = 'nav-link' }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `${className}${isActive ? ' active' : ''}`}
      onClick={onNavigate}
    >
      {item.label}
    </NavLink>
  );
}

function isNavItemActive(item, pathname) {
  if (item.end) {
    return pathname === item.to;
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function NavGroupMenu({ group, isOpen, onToggle, onClose }) {
  const location = useLocation();
  const groupRef = useRef(null);
  const isActive = group.items.some((item) => isNavItemActive(item, location.pathname));

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!groupRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={groupRef}
      className={`nav-group${isOpen ? ' is-open' : ''}${isActive ? ' is-active' : ''}`}
    >
      <button
        type="button"
        className={`nav-group__trigger${isActive ? ' active' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => onToggle(group.key)}
      >
        {group.label}
        <span className="nav-group__caret" aria-hidden="true">▾</span>
      </button>
      <div className="nav-group__menu" role="menu">
        {group.items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive: itemActive }) => `nav-group__link${itemActive ? ' active' : ''}`}
            role="menuitem"
            onClick={onClose}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function MobileNavSection({ entry, onNavigate }) {
  if (entry.type === 'link') {
    return (
      <NavItemLink
        item={entry.item}
        className="mobile-nav-drawer__link"
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div className="mobile-nav-drawer__section">
      <p className="mobile-nav-drawer__section-title">{entry.label}</p>
      {entry.items.map((item) => (
        <NavItemLink
          key={item.to}
          item={item}
          className="mobile-nav-drawer__link mobile-nav-drawer__link--nested"
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

export function Layout({ title, children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState(null);
  const [remittanceAlerts, setRemittanceAlerts] = useState([]);
  const [remittanceAlertOpen, setRemittanceAlertOpen] = useState(false);
  const [unitChangeAlerts, setUnitChangeAlerts] = useState([]);
  const [unitChangeAlertOpen, setUnitChangeAlertOpen] = useState(false);
  const [dismissingUnitAlerts, setDismissingUnitAlerts] = useState(false);

  const navStructure = user ? getNavStructure(user) : [];
  const mobileTabItems = user ? getMobileTabItems(user) : [];
  const canTrackRemittance = user ? canAccess(user, 'remittance.track') : false;
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user || !canTrackRemittance) {
      setRemittanceAlerts([]);
      setRemittanceAlertOpen(false);
      return;
    }

    api.getRemittanceAlerts()
      .then((result) => {
        const items = result.data?.items || [];
        setRemittanceAlerts(items);
        setRemittanceAlertOpen(items.length > 0);
      })
      .catch(() => {
        setRemittanceAlerts([]);
        setRemittanceAlertOpen(false);
      });
  }, [user, canTrackRemittance]);

  useEffect(() => {
    if (!user || !isAdmin) {
      setUnitChangeAlerts([]);
      setUnitChangeAlertOpen(false);
      return;
    }

    api.getUnitChangeAlerts()
      .then((result) => {
        const items = result.data?.items || [];
        setUnitChangeAlerts(items);
        setUnitChangeAlertOpen(items.length > 0);
      })
      .catch(() => {
        setUnitChangeAlerts([]);
        setUnitChangeAlertOpen(false);
      });
  }, [user, isAdmin]);

  async function closeUnitChangeAlerts() {
    if (!unitChangeAlerts.length) {
      setUnitChangeAlertOpen(false);
      return;
    }

    setDismissingUnitAlerts(true);

    try {
      await api.dismissUnitChangeAlerts(unitChangeAlerts.map((item) => item.id));
      setUnitChangeAlerts([]);
      setUnitChangeAlertOpen(false);
    } catch {
      setUnitChangeAlertOpen(false);
    } finally {
      setDismissingUnitAlerts(false);
    }
  }

  useEffect(() => {
    setMenuOpen(false);
    setOpenNavGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('mobile-nav-open', menuOpen);

    return () => {
      document.body.classList.remove('mobile-nav-open');
    };
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <div className="app-shell__backdrop" aria-hidden="true">
        <div className="app-shell__glow app-shell__glow--left" />
        <div className="app-shell__glow app-shell__glow--right" />
      </div>

      <div className="app-shell__content">
        <header className="topbar glass-panel">
          <div className="topbar-brand">
            {user && (
              <button
                type="button"
                className="mobile-menu-btn"
                aria-label={menuOpen ? '關閉選單' : '開啟選單'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="mobile-menu-btn__bar" />
                <span className="mobile-menu-btn__bar" />
                <span className="mobile-menu-btn__bar" />
              </button>
            )}
            <img className="brand-mark brand-mark--logo" src={assetUrl('/images/logo.png')} alt="東東冷氣" />
            <div className="topbar-brand__text">
              <p className="brand-title">東東冷氣專業清洗</p>
              <p className="brand-subtitle">{title}</p>
            </div>
          </div>
          {user && (
            <div className="topbar-actions">
              <span className="user-chip hide-mobile">{user.name}</span>
              <span className="role-chip">{getRoleLabel(user.role)}</span>
              <button type="button" className="btn btn-glass btn-sm" onClick={logout}>登出</button>
            </div>
          )}
        </header>

        {user && (
          <nav className="main-nav glass-panel" aria-label="主要導覽">
            {navStructure.map((entry) => (
              entry.type === 'link' ? (
                <NavItemLink key={entry.item.to} item={entry.item} />
              ) : (
                <NavGroupMenu
                  key={entry.key}
                  group={entry}
                  isOpen={openNavGroup === entry.key}
                  onToggle={(key) => setOpenNavGroup((current) => (current === key ? null : key))}
                  onClose={() => setOpenNavGroup(null)}
                />
              )
            ))}
          </nav>
        )}

        <main className="page-content">{children}</main>

        <RemittanceAlertModal
          open={remittanceAlertOpen}
          items={remittanceAlerts}
          onClose={() => setRemittanceAlertOpen(false)}
        />

        <UnitChangeAlertModal
          open={unitChangeAlertOpen}
          items={unitChangeAlerts}
          onClose={closeUnitChangeAlerts}
          dismissing={dismissingUnitAlerts}
        />

        {user && (
          <nav className="mobile-bottom-nav glass-panel" aria-label="手機快捷導覽">
            {mobileTabItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `mobile-bottom-nav__item${isActive ? ' is-active' : ''}`}
              >
                <span className="mobile-bottom-nav__label">{item.shortLabel}</span>
              </NavLink>
            ))}
            <button
              type="button"
              className={`mobile-bottom-nav__item mobile-bottom-nav__item--menu${menuOpen ? ' is-active' : ''}`}
              aria-label="開啟完整選單"
              onClick={() => setMenuOpen(true)}
            >
              <span className="mobile-bottom-nav__label">選單</span>
            </button>
          </nav>
        )}

        {user && (
          <>
            <button
              type="button"
              className="mobile-nav-backdrop"
              aria-label="關閉選單"
              onClick={() => setMenuOpen(false)}
            />
            <aside className={`mobile-nav-drawer glass-panel${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen}>
              <div className="mobile-nav-drawer__header">
                <div>
                  <p className="mobile-nav-drawer__title">{user.name}</p>
                  <p className="mobile-nav-drawer__subtitle">{getRoleLabel(user.role)}</p>
                </div>
                <button
                  type="button"
                  className="mobile-nav-drawer__close"
                  aria-label="關閉選單"
                  onClick={() => setMenuOpen(false)}
                >
                  ×
                </button>
              </div>
              <nav className="mobile-nav-drawer__links">
                {navStructure.map((entry) => (
                  entry.type === 'link' ? (
                    <MobileNavSection
                      key={entry.item.to}
                      entry={entry}
                      onNavigate={() => setMenuOpen(false)}
                    />
                  ) : (
                    <MobileNavSection
                      key={entry.key}
                      entry={entry}
                      onNavigate={() => setMenuOpen(false)}
                    />
                  )
                ))}
              </nav>
              <div className="mobile-nav-drawer__footer">
                <button type="button" className="btn btn-glass" onClick={logout}>登出</button>
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
