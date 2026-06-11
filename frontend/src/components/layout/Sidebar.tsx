import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, BarChart3, Scale, Sparkles, Gift,
  TrendingUp, Zap, FlaskConical, Bell, Settings,
  Layers, Building2, Database, ScrollText, FileText, LogOut,
} from 'lucide-react';
import { cn, getInitials } from '../../lib/utils';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { useLogout } from '../../hooks/useAuth';
import { HR_STAFF_DEFAULT_PERMISSIONS } from '@shared/constants/index';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  feature?: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'core',
    label: 'Core',
    items: [
      { path: '/dashboard',          label: 'Dashboard',          icon: LayoutDashboard, feature: 'dashboard'     },
      { path: '/ai-assistant',       label: 'AI Assistant',       icon: Sparkles,        feature: 'ai_insights'   },
      { path: '/leadership-report',  label: 'Leadership Report',  icon: FileText,        feature: 'ai_insights'   },
      { path: '/notifications',      label: 'Notifications',      icon: Bell,            feature: 'notifications' },
    ],
  },
  {
    id: 'compensation',
    label: 'Compensation',
    items: [
      { path: '/salary-bands', label: 'Salary Bands', icon: BarChart3,    feature: 'salary_bands'  },
      { path: '/pay-equity',   label: 'Pay Equity',   icon: Scale,         feature: 'pay_equity'    },
      { path: '/variable-pay', label: 'Variable Pay', icon: Zap,           feature: 'variable_pay'  },
      { path: '/scenarios',    label: 'Scenarios',    icon: FlaskConical,  feature: 'scenario.view' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { path: '/job-architecture', label: 'Job Architecture', icon: Layers                                  },
      { path: '/performance',      label: 'Performance',      icon: TrendingUp, feature: 'performance.view' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      { path: '/data-center', label: 'Data Center', icon: Database, feature: 'data_center' },
    ],
  },
  {
    id: 'benefits',
    label: 'Benefits',
    items: [
      { path: '/benefits-hub', label: 'Hub Overview',   icon: Building2, feature: 'benefits.view' },
      { path: '/benefits',     label: 'Benefits & RSU', icon: Gift,      feature: 'benefits.view' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { path: '/app-logs',          label: 'Application Logs',  icon: ScrollText, feature: 'audit_log'         },
      { path: '/settings/platform', label: 'Platform Settings', icon: Settings,   feature: 'settings.platform' },
      { path: '/settings/user',     label: 'User Settings',     icon: Users                                    },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const { unreadCount } = useNotificationStore();
  const user = useAuthStore(s => s.user);
  const logout = useLogout();

  const canAccess = (feature: string | undefined): boolean => {
    if (!feature) return true;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    const perms =
      user.permissions && user.permissions.length > 0
        ? user.permissions
        : HR_STAFF_DEFAULT_PERMISSIONS;
    return perms.includes(feature);
  };

  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => canAccess(item.feature)),
  })).filter(g => g.items.length > 0);

  const isNavActive = (path: string) =>
    path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path);

  const firstName = user?.name?.split(' ')[0] || '';
  const lastName  = user?.name?.split(' ')[1] || '';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col z-40 group',
        'w-16 hover:w-[224px] transition-[width] duration-300 overflow-hidden'
      )}
      style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)' }}
    >
      {/* ── Logo ─────────────────────────────────── */}
      <div className="flex items-center h-16 px-4 border-b border-white/[0.07] overflow-hidden flex-shrink-0">
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center font-extrabold text-white text-sm flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
            boxShadow: '0 4px 12px rgba(167,139,250,0.4)',
          }}
        >
          C
        </div>
        <div className="ml-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 overflow-hidden whitespace-nowrap">
          <div className="text-[15px] font-bold text-white tracking-tight leading-none">CompSense</div>
          <div className="text-[8px] font-semibold tracking-[0.05em] mt-0.5" style={{ color: 'rgba(165,180,252,0.6)' }}>
            POWERED BY iMOCHA
          </div>
        </div>
      </div>

      {/* ── Nav: collapsed (icon only) — hidden on hover ── */}
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll group-hover:hidden">
        <ul className="space-y-1 px-2">
          {visibleGroups.map(group => {
            const firstActive = group.items.find(i => isNavActive(i.path));
            const badge = group.id === 'core' ? unreadCount : undefined;
            const RepIcon = (firstActive ?? group.items[0]).icon;
            const isGroupActive = !!firstActive;
            return (
              <li key={group.id}>
                <NavLink
                  to={group.items[0].path}
                  title={group.label}
                  className={cn(
                    'flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all relative',
                    isGroupActive
                      ? 'text-white'
                      : 'hover:bg-white/5'
                  )}
                  style={
                    isGroupActive
                      ? { background: 'linear-gradient(90deg,rgba(167,139,250,0.25),rgba(96,165,250,0.12))', boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.3)', color: '#fff' }
                      : { color: 'rgba(255,255,255,0.55)' }
                  }
                >
                  <RepIcon className="w-4 h-4" />
                  {badge !== undefined && badge > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full text-white text-[8px] font-bold flex items-center justify-center px-0.5"
                      style={{ background: 'linear-gradient(135deg,#f43f5e,#fb7185)' }}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Nav: expanded (labels) — shown on hover ── */}
      <nav className="flex-1 overflow-y-auto py-2 sidebar-scroll hidden group-hover:block">
        <div className="space-y-4 px-2">
          {visibleGroups.map(group => (
            <div key={group.id}>
              <div
                className="px-2 mb-1 text-[9px] font-bold tracking-[0.1em] uppercase whitespace-nowrap"
                style={{ color: 'rgba(165,180,252,0.45)' }}
              >
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = isNavActive(item.path);
                  const badge = item.path === '/notifications' ? unreadCount : undefined;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={cn(
                        'flex items-center gap-[9px] px-2.5 py-[7px] rounded-[9px] text-[12.5px] transition-all whitespace-nowrap',
                        active ? 'font-semibold text-white' : 'font-medium hover:bg-white/5'
                      )}
                      style={
                        active
                          ? { background: 'linear-gradient(90deg,rgba(167,139,250,0.25),rgba(96,165,250,0.12))', boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.3)', color: '#fff' }
                          : { color: 'rgba(255,255,255,0.55)' }
                      }
                    >
                      <Icon className="w-[13px] h-[13px] flex-shrink-0" style={{ minWidth: 13 }} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge !== undefined && badge > 0 && (
                        <span
                          className="min-w-[18px] h-[18px] rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1 flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#f43f5e,#fb7185)' }}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Footer: collapsed ── */}
      <div
        className="flex-shrink-0 group-hover:hidden flex flex-col items-center gap-2 px-2 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#a78bfa,#60a5fa)' }}
          title={user?.name}
        >
          {firstName ? getInitials(firstName, lastName) : 'U'}
        </div>
        <button
          onClick={logout}
          className="w-8 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: 'rgba(165,180,252,0.6)' }}
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Footer: expanded ── */}
      <div
        className="flex-shrink-0 hidden group-hover:flex items-center gap-[9px] px-[14px] py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#a78bfa,#60a5fa)' }}
        >
          {firstName ? getInitials(firstName, lastName) : 'U'}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-[11.5px] font-semibold text-white truncate leading-tight whitespace-nowrap">
            {user?.name || 'User'}
          </div>
          <div
            className="text-[9px] capitalize truncate leading-tight mt-0.5 whitespace-nowrap"
            style={{ color: 'rgba(165,180,252,0.6)' }}
          >
            {user?.role?.toLowerCase() || 'admin'}
          </div>
        </div>
        <button
          onClick={logout}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          style={{ color: 'rgba(165,180,252,0.6)' }}
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
