import { useState, useCallback, useEffect } from 'react'
import type { Notification } from '../lib/types'
import {
  getNotifications,
  deleteNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/api'

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const resp = await getNotifications(50)
      setNotifications(resp.notifications)
      setUnreadCount(resp.unread_count)
    } catch {
      // ignore
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    refresh()
  }, [refresh])

  const pushNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => {
      // Prevent duplicates
      if (prev.some((n) => n.id === notification.id)) return prev
      return [notification, ...prev].slice(0, 200)
    })
    if (!notification.read) {
      setUnreadCount((c) => c + 1)
    }
  }, [])

  const dismiss = useCallback(async (id: string) => {
    try {
      await deleteNotification(id)
      setNotifications((prev) => {
        const item = prev.find((n) => n.id === id)
        if (item && !item.read) {
          setUnreadCount((c) => Math.max(0, c - 1))
        }
        return prev.filter((n) => n.id !== id)
      })
    } catch {
      // ignore
    }
  }, [])

  const markRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // ignore
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }, [])

  return {
    notifications,
    unreadCount,
    pushNotification,
    dismiss,
    markRead,
    markAllRead,
    refresh,
  }
}
