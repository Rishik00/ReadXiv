export function notificationsSupported() {
  return Boolean(window.electron?.showNotification || 'Notification' in window)
}

export async function requestNotificationPermission() {
  if (window.electron?.showNotification) return true
  if (!('Notification' in window)) return false
  if (window.Notification.permission === 'granted') return true
  if (window.Notification.permission === 'denied') return false
  return (await window.Notification.requestPermission()) === 'granted'
}

export function showNotification(title, body, data = {}) {
  if (window.electron?.showNotification) {
    window.electron.showNotification(title, body, data)
    return true
  }
  if ('Notification' in window && window.Notification.permission === 'granted') {
    const notification = new window.Notification(title, { body, data })
    notification.onclick = () => {
      window.focus()
      window.dispatchEvent(new CustomEvent('readxiv-notification-activated', { detail: data }))
      notification.close()
    }
    return true
  }
  return false
}
