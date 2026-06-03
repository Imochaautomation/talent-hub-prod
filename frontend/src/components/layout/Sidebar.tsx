import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, BarChart3, Scale, Sparkles, Gift,
  TrendingUp, Award, Zap, FlaskConical, Bell, Settings,
  ChevronDown, DollarSign, Layers, Building2, Database, ScrollText, FileText,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { HR_STAFF_DEFAULT_PERMISSIONS } from '@shared/constants/index';

function IMochaIcon({ size = 28 }: { size?: number }) {
  const r = 9.5;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle
        cx="14" cy="14" r={r}
        stroke="#F56521" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray="15 5 15 5 15 5"
        transform="rotate(-130 14 14)"
      />
      <circle cx="22" cy="9" r="2.5" fill="#F56521" />
    </svg>
  );
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  feature?: string; // if set, item is hidden unless user has this feature key
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'core',
    label: 'Core',
    icon: LayoutDashboard,
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
    icon: DollarSign,
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
    icon: Users,
    items: [
      { path: '/job-architecture', label: 'Job Architecture',  icon: Layers                                 },
      { path: '/performance',      label: 'Performance',       icon: TrendingUp, feature: 'performance.view'},
    ],
  },
  {
    id: 'data',
    label: 'Data Center',
    icon: Database,
    items: [
      { path: '/data-center', label: 'Data Center', icon: Database, feature: 'data_center' },
    ],
  },
  {
    id: 'benefits',
    label: 'Benefits',
    icon: Gift,
    items: [
      { path: '/benefits-hub', label: 'Hub Overview',  icon: Building2, feature: 'benefits.view' },
      { path: '/benefits',     label: 'Benefits & RSU', icon: Gift,     feature: 'benefits.view' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    items: [
      { path: '/app-logs',         label: 'Application Logs',  icon: ScrollText, feature: 'audit_log'         },
      { path: '/settings/platform',label: 'Platform Settings', icon: Settings,   feature: 'settings.platform' },
      { path: '/settings/user',    label: 'User Settings',     icon: Users                                  },
    ],
  },
];

function getActiveGroupId(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const isActive =
        item.path === '/dashboard'
          ? pathname === '/dashboard'
          : pathname.startsWith(item.path);
      if (isActive) return group.id;
    }
  }
  return 'core';
}

export function Sidebar() {
  const location = useLocation();
  const { unreadCount } = useNotificationStore();
  const user = useAuthStore(s => s.user);

  // Feature-access check (mirrors useAccess logic without a per-item hook call)
  const canAccess = (feature: string | undefined): boolean => {
    if (!feature) return true;   // no restriction on this item
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    const perms =
      user.permissions && user.permissions.length > 0
        ? user.permissions
        : HR_STAFF_DEFAULT_PERMISSIONS;
    return perms.includes(feature);
  };

  // Pre-filter groups so collapsed mode (first item NavLink) still works
  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => canAccess(item.feature)),
  })).filter(g => g.items.length > 0);

  const activeGroupId = getActiveGroupId(location.pathname);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([activeGroupId]));

  // Auto-expand the active group when route changes
  useEffect(() => {
    setExpandedGroups(prev => new Set([...prev, activeGroupId]));
  }, [activeGroupId]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col z-40 group',
        'bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]',
        'w-16 hover:w-64 transition-all duration-300 overflow-hidden'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[hsl(var(--sidebar-border))] overflow-hidden flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <IMochaIcon size={26} />
          <span className="font-bold text-[hsl(var(--sidebar-foreground))] text-sm tracking-tight whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            CompSense
          </span>
        </div>
      </div>

      {/* Nav — collapsed mode (icon only, one per group) */}
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll group-hover:hidden">
        <ul className="space-y-1 px-2">
          {visibleGroups.map(group => {
            const GroupIcon = group.icon;
            const isGroupActive = group.id === activeGroupId;
            const firstPath = group.items[0].path;
            const notifBadge = group.id === 'core' && unreadCount > 0 ? unreadCount : undefined;

            return (
              <li key={group.id}>
                <NavLink
                  to={firstPath}
                  title={group.label}
                  className={cn(
                    'flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all relative',
                    isGroupActive
                      ? 'bg-[hsl(var(--sidebar-accent)/0.15)] text-[hsl(var(--sidebar-accent))]'
                      : 'text-[hsl(var(--sidebar-foreground)/0.65)] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-white/5'
                  )}
                >
                  <GroupIcon className="w-4 h-4" />
                  {notifBadge !== undefined && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                      {notifBadge > 99 ? '99+' : notifBadge}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Nav — expanded mode (grouped with collapsible headers) */}
      <nav className="flex-1 overflow-y-auto py-2 sidebar-scroll hidden group-hover:block">
        <div className="space-y-1 px-2">
          {visibleGroups.map(group => {
            const GroupIcon = group.icon;
            const isGroupActive = group.id === activeGroupId;
            const isExpanded = expandedGroups.has(group.id);

            // Data Center: single direct link, no collapsible dropdown
            if (group.id === 'data') {
              const item = group.items[0];
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <div key={group.id}>
                  <NavLink
                    to={item.path}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all',
                      isActive
                        ? 'text-[hsl(var(--sidebar-accent))]'
                        : 'text-[hsl(var(--sidebar-foreground)/0.45)] hover:text-[hsl(var(--sidebar-foreground)/0.75)]'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left whitespace-nowrap">{group.label}</span>
                  </NavLink>
                </div>
              );
            }

            return (
              <div key={group.id}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all',
                    isGroupActive
                      ? 'text-[hsl(var(--sidebar-accent))]'
                      : 'text-[hsl(var(--sidebar-foreground)/0.45)] hover:text-[hsl(var(--sidebar-foreground)/0.75)]'
                  )}
                >
                  <GroupIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 text-left whitespace-nowrap">{group.label}</span>
                  <ChevronDown
                    className={cn('w-3 h-3 transition-transform duration-200 flex-shrink-0', !isExpanded && '-rotate-90')}
                  />
                </button>

                {/* Group items */}
                {isExpanded && (
                  <ul className="space-y-0.5 mt-0.5 mb-1 pl-1">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const isActive =
                        item.path === '/dashboard'
                          ? location.pathname === '/dashboard'
                          : location.pathname.startsWith(item.path);
                      const badge = item.path === '/notifications' ? unreadCount : undefined;

                      return (
                        <li key={item.path}>
                          <NavLink
                            to={item.path}
                            className={cn(
                              'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-all whitespace-nowrap',
                              isActive
                                ? 'bg-[hsl(var(--sidebar-accent)/0.15)] text-[hsl(var(--sidebar-accent))] font-medium'
                                : 'text-[hsl(var(--sidebar-foreground)/0.65)] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-white/5'
                            )}
                          >
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="flex-1 truncate">{item.label}</span>
                            {badge !== undefined && badge > 0 && (
                              <span className="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* iMocha branding footer */}
      <div className="px-4 py-3 border-t border-[hsl(var(--sidebar-border))] flex items-center gap-2 flex-shrink-0 overflow-hidden">
        <IMochaIcon size={20} />
        <span className="text-[10px] text-[hsl(var(--sidebar-foreground)/0.35)] font-medium tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          Powered by iMocha
        </span>
      </div>
    </aside>
  );
}
