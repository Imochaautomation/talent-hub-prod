import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSocket, initSocket, disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { queryKeys } from '../lib/queryClient';
import type { Notification } from '@shared/types/index';

export function useSocket() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const { addNotification, setCriticalAlert } = useNotificationStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = initSocket(accessToken);

    socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', () => {
      if (import.meta.env.DEV) console.log('[Socket] Disconnected');
    });

    socket.on('notification:new', (notification: Notification) => {
      addNotification(notification);
      // No toast — notifications are visible in the badge + panel.
      // Toasting every AI scan finding (runs on every backend startup) is disruptive.
    });

    socket.on('notification:critical', (notification: Notification) => {
      addNotification(notification);
      setCriticalAlert(notification);
      // No toast — the red banner in AppShell already surfaces CRITICAL alerts prominently.
    });

    socket.on('pay:anomaly', (payload: { employee: { firstName: string; lastName: string }; band: string; delta: number }) => {
      toast.warning(`Pay Anomaly Detected`, {
        description: `${payload.employee.firstName} ${payload.employee.lastName} is outside band ${payload.band}`,
        duration: 8000,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.payEquity.heatmap });
    });

    socket.on('budget:threshold', (payload: { department: string; used: number; limit: number }) => {
      toast.warning(`Budget Alert: ${payload.department}`, {
        description: `${((payload.used / payload.limit) * 100).toFixed(0)}% of budget consumed`,
        duration: 8000,
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('rsu:vesting', (payload: { employee: { firstName: string; lastName: string }; units: number }) => {
      toast.success(`RSU Vesting Event`, {
        description: `${payload.employee.firstName} ${payload.employee.lastName} — ${payload.units} units vested`,
        duration: 6000,
      });
      queryClient.invalidateQueries({ queryKey: ['rsu'] });
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
    });

    // Invalidate every dashboard query key, not just kpis + bandDistribution.
    socket.on('dashboard:refresh', () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    // New employee created — refresh employees list plus every module whose
    // aggregates (compa-ratio bands, pay gaps, salary outliers) just changed.
    socket.on('employee:created', (payload: { employee: { firstName: string; lastName: string } }) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      toast.success(`New employee added: ${payload.employee.firstName} ${payload.employee.lastName}`, { duration: 4000 });
    });

    // Employee record edited — compa-ratio, pay gap, band outliers may all shift.
    socket.on('employee:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    });

    // Real-time import progress — query invalidation is deferred to import:complete.
    // UploadCard (DataCenterPage) handles the per-batch progress display itself.
    socket.on('import:progress', (_payload: { processed: number; total: number; errors: unknown[] }) => {
      // intentionally empty — UploadCard owns the progress UI
    });

    // Bulk import complete — full refresh of every data-dependent module.
    socket.on('import:complete', (_payload: { imported: number; failed: number }) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      // UploadCard shows its own completion summary — no duplicate toast here
    });

    // Emitted by employee.service after any create/update — catches cases where
    // the specific 'employee:created' / 'employee:updated' events aren't enough.
    socket.on('employee:data:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    });

    // Emitted when a SalaryBand record is updated (feat-008).
    // Compa-ratios for every employee in that band become stale.
    socket.on('salary:band:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      // Only refetch bands/hierarchy if a component is actively observing them —
      // avoids spurious 401s when the user is on a page that doesn't mount these queries.
      queryClient.invalidateQueries({ queryKey: ['bands'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['job-architecture', 'hierarchy'], refetchType: 'active' });
    });

    return () => {
      socket.off('notification:new');
      socket.off('notification:critical');
      socket.off('pay:anomaly');
      socket.off('budget:threshold');
      socket.off('rsu:vesting');
      socket.off('dashboard:refresh');
      socket.off('employee:created');
      socket.off('employee:updated');
      socket.off('import:progress');
      socket.off('import:complete');
      socket.off('employee:data:changed');
      socket.off('salary:band:updated');
    };
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    return () => {
      if (!isAuthenticated) {
        disconnectSocket();
      }
    };
  }, [isAuthenticated]);
}
