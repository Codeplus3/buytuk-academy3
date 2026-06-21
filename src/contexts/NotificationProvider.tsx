import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface NotificationMessage {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read?: boolean;
}

interface NotificationContextValue {
  notifications: NotificationMessage[];
  markAllRead: () => void;
  addNotification: (notification: NotificationMessage) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);

  useEffect(() => {
    // TODO: استبدل الكود التالي باتصال Supabase Realtime
    const channelName = "notifications";
    console.debug(`NotificationProvider mounted: ${channelName}`);

    return () => {
      console.debug(`NotificationProvider unmounted: ${channelName}`);
    };
  }, []);

  const value = useMemo(() => ({
    notifications,
    markAllRead: () => setNotifications(current => current.map(n => ({ ...n, read: true }))),
    addNotification: (notification: NotificationMessage) => setNotifications(current => [notification, ...current]),
  }), [notifications]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
