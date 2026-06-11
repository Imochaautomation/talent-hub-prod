import { Outlet, useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSocket } from '../../hooks/useSocket';
import { ChatPanel } from '../ChatPanel';
import { useNotificationStore } from '../../store/notificationStore';

export function AppShell() {
  useSocket();

  const { criticalAlert, setCriticalAlert } = useNotificationStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <TopBar />

      {criticalAlert && (
        <div
          className="fixed top-16 left-16 right-0 z-30 flex items-start gap-3 px-5 py-3
                     bg-red-600/95 text-white shadow-lg backdrop-blur-sm"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">{criticalAlert.title}</p>
            <p className="text-xs text-red-100 mt-0.5 line-clamp-2">{criticalAlert.message}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { navigate('/notifications'); setCriticalAlert(null); }}
              className="text-xs underline text-red-100 hover:text-white whitespace-nowrap"
            >
              View all
            </button>
            <button
              onClick={() => setCriticalAlert(null)}
              className="text-red-200 hover:text-white transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main
        className="ml-16 pt-16 min-h-screen"
        style={{ paddingTop: criticalAlert ? '5.5rem' : undefined }}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      <ChatPanel />
    </div>
  );
}
