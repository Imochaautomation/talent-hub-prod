import { useNavigate } from 'react-router-dom';
import { Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useNotificationStore } from '../../store/notificationStore';

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { unreadCount } = useNotificationStore();
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 right-0 left-16 h-16 bg-card/90 backdrop-blur-sm border-b border-border z-30 flex items-center px-6 gap-3">
      <div className="flex-1" />
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
