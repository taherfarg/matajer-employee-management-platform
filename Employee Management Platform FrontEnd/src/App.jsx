import { useCallback, useEffect, useState } from 'react'
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { Avatar, BrandMark, FormError, FormField, LoadingState, Modal, Spinner, Toast } from './components/ui.jsx'
import { useAuth } from './hooks/useAuth.jsx'
import { OrgProvider } from './hooks/useOrg.jsx'
import { useResource } from './hooks/useResource.js'
import { formatDate } from './lib/format.js'
import {
  changePassword,
  fetchNotifications,
  fetchRequests,
  markAllNotificationsRead,
  markNotificationRead,
} from './api/endpoints.js'
import LoginScreen from './pages/LoginScreen.jsx'
import AdminOverview from './pages/AdminOverview.jsx'
import PeopleDirectory from './pages/PeopleDirectory.jsx'
import AdminRequests from './pages/AdminRequests.jsx'
import EntitiesPage from './pages/EntitiesPage.jsx'
import EmployeeHome from './pages/EmployeeHome.jsx'
import EmployeeProfile from './pages/EmployeeProfile.jsx'
import EmployeeRequests from './pages/EmployeeRequests.jsx'
import ManagerTeam from './pages/ManagerTeam.jsx'

const NAV_BY_ROLE = {
  admin: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'people', label: 'People', icon: UsersRound },
    { id: 'requests', label: 'Requests', icon: ClipboardCheck },
    { id: 'entities', label: 'Legal entities', icon: Building2 },
  ],
  employee: [
    { id: 'home', label: 'Home', icon: LayoutDashboard },
    { id: 'profile', label: 'My profile', icon: UserRound },
    { id: 'my-requests', label: 'My requests', icon: ClipboardCheck },
  ],
}

/**
 * A line manager gets the employee workspace plus their team. The extra
 * destination is added here rather than as a third role list, because a manager
 * is an employee first - they still book their own leave.
 */
const MANAGER_NAV_ITEM = { id: 'my-team', label: 'My team', icon: UsersRound }

function navFor(session) {
  const base = NAV_BY_ROLE[session.role]
  return session.isManager ? [...base, MANAGER_NAV_ITEM] : base
}

const PAGE_META = {
  overview: ['Overview', 'What needs your attention across the organization.'],
  people: ['People directory', 'A single source of truth for every employee and legal entity.'],
  requests: ['Request inbox', 'Review employee requests and keep every decision traceable.'],
  entities: ['Legal entities', 'The operating structure behind every employment record.'],
  home: ['Home', 'Everything about your work, requests, and time off in one place.'],
  profile: ['My profile', 'Your personal and employment information.'],
  'my-requests': ['My requests', 'Submit a request and follow it through to a clear decision.'],
  'my-team': ['My team', 'Your direct reports, and the requests waiting on your decision.'],
}

export default function App() {
  const { session, bootstrapping } = useAuth()

  // Restoring a stored session is a network round trip; showing a boot screen
  // avoids flashing the login page to an already-signed-in user.
  if (bootstrapping) {
    return (
      <div className="boot-screen">
        <BrandMark />
        <LoadingState label="Restoring your session…" />
      </div>
    )
  }

  if (!session) return <LoginScreen />

  return (
    <OrgProvider>
      <Workspace session={session} />
    </OrgProvider>
  )
}

function Workspace({ session }) {
  const { signOut } = useAuth()
  const [page, setPage] = useState(session.role === 'admin' ? 'overview' : 'home')
  const [toast, setToast] = useState(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(Boolean(session.mustChangePassword))

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
  }, [])

  // Signing in as a different role must not leave the previous role's page selected.
  useEffect(() => {
    setPage(session.role === 'admin' ? 'overview' : 'home')
    setSecurityOpen(Boolean(session.mustChangePassword))
  }, [session.role, session.userId])

  const notifications = useResource(() => fetchNotifications(), [])
  const pendingBadge = useResource(
    () => (session.isManagement ? fetchRequests({ status: 'PENDING', pageSize: 1 }) : Promise.resolve(null)),
    [session.isManagement],
  )

  const navigate = (id) => {
    setPage(id)
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const markEveryNotificationRead = async () => {
    try {
      const result = await markAllNotificationsRead()
      notifications.reload()
      showToast(`${result.updated} notification${result.updated === 1 ? '' : 's'} marked as read.`)
    } catch (error) {
      showToast(error.message || 'Could not update notifications.', 'error')
    }
  }

  const selectNotification = async (item) => {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.id)
        notifications.reload()
      } catch {
        // Navigation is still useful even when read-state persistence fails.
      }
    }
    if (item.entityType === 'Request') {
      navigate(session.role === 'admin' ? 'requests' : 'my-requests')
    } else if (session.role === 'employee' && item.entityType === 'Document') {
      navigate('profile')
    } else if (session.role === 'admin' && item.entityType === 'Employee') {
      navigate('people')
    } else {
      setNotificationsOpen(false)
    }
  }

  const meta = PAGE_META[page] ?? ['People Hub', '']
  const user = session.employee

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="grain" aria-hidden="true" />

      <Sidebar
        session={session}
        page={page}
        onNavigate={navigate}
        onLogout={signOut}
        onSecurity={() => setSecurityOpen(true)}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        pendingCount={pendingBadge.data?.summary?.PENDING ?? 0}
      />

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu size={22} />
          </button>
          <div className="page-title">
            <p className="eyebrow">{formatDate(new Date())}</p>
            <h1>
              {page === 'overview' || page === 'home'
                ? `${greeting()}, ${user?.firstName ?? 'there'}`
                : meta[0]}
            </h1>
            <span>{meta[1]}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-search"
              aria-label="Open search"
              onClick={() => navigate(session.role === 'admin' ? 'people' : 'my-requests')}
            >
              <Search size={18} />
              <span>Search workspace</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="notification-button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell size={19} />
              {(notifications.data?.unreadCount ?? 0) > 0 && <i />}
            </button>
            <Avatar employee={user} size="sm" />
            {notificationsOpen && (
              <NotificationsPopover
                state={notifications}
                onSelect={selectNotification}
                onMarkAll={markEveryNotificationRead}
                onClose={() => setNotificationsOpen(false)}
              />
            )}
          </div>
        </header>

        <main id="main-content" className="main-content">
          {session.role === 'admin' && page === 'overview' && (
            <AdminOverview onNavigate={navigate} onToast={showToast} onDecided={pendingBadge.reload} />
          )}
          {session.role === 'admin' && page === 'people' && <PeopleDirectory onToast={showToast} />}
          {session.role === 'admin' && page === 'requests' && (
            <AdminRequests onToast={showToast} onDecided={pendingBadge.reload} />
          )}
          {session.role === 'admin' && page === 'entities' && <EntitiesPage />}

          {session.role === 'employee' && page === 'home' && (
            <EmployeeHome session={session} onNavigate={navigate} onToast={showToast} />
          )}
          {session.role === 'employee' && page === 'profile' && (
            <EmployeeProfile session={session} onToast={showToast} />
          )}
          {session.role === 'employee' && page === 'my-requests' && <EmployeeRequests onToast={showToast} />}
          {session.isManager && page === 'my-team' && <ManagerTeam session={session} onToast={showToast} />}
        </main>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
      <ChangePasswordModal
        open={securityOpen}
        forced={Boolean(session.mustChangePassword)}
        onClose={() => setSecurityOpen(false)}
        onComplete={signOut}
      />
    </div>
  )
}

function Sidebar({ session, page, onNavigate, onLogout, onSecurity, open, onClose, pendingCount }) {
  const user = session.employee
  const items = navFor(session)

  return (
    <>
      {open && <button className="nav-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand brand-light">
            <BrandMark />
            <span>People Hub</span>
          </div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>

        <div className="workspace-chip">
          <span className="workspace-logo">M</span>
          <span>
            <strong>Matajer Group</strong>
            {/* A scoped HR admin sees only one entity, so the chip says so. */}
            <small>{session.scopedLegalEntityId ? 'Entity-scoped access' : 'People workspace'}</small>
          </span>
          <ChevronDown size={15} />
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <p className="nav-label">{session.role === 'admin' ? 'Management' : 'My workspace'}</p>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={page === item.id ? 'active' : ''}
                onClick={() => onNavigate(item.id)}
                key={item.id}
                aria-current={page === item.id ? 'page' : undefined}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.id === 'requests' && pendingCount > 0 && <b>{pendingCount}</b>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-fill" />

        <div className="role-chip">
          <div>
            <span>Signed in as</span>
            <strong>{formatRole(session.apiRole)}</strong>
          </div>
          <button onClick={onSecurity} aria-label="Account security" title="Account security">
            <KeyRound size={15} />
          </button>
        </div>

        <div className="sidebar-user">
          <Avatar employee={user} size="sm" />
          <span>
            <strong>{user?.fullName ?? session.email}</strong>
            <small>{user?.role ?? formatRole(session.apiRole)}</small>
          </span>
          <button onClick={onLogout} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  )
}

function NotificationsPopover({ state, onSelect, onMarkAll, onClose }) {
  const items = state.data?.items ?? []
  const unread = state.data?.unreadCount ?? 0

  return (
    <section className="notification-popover" aria-label="Notifications">
      <header>
        <div>
          <p className="eyebrow">Inbox</p>
          <h2>Notifications</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close notifications">
          <X size={17} />
        </button>
      </header>
      {state.loading && <LoadingState label="Loading notifications…" />}
      {state.error && <p className="notification-error">{state.error.message}</p>}
      {!state.loading && !state.error && (
        <div className="notification-list">
          {items.slice(0, 8).map((item) => (
            <button className={item.isRead ? '' : 'unread'} key={item.id} onClick={() => onSelect(item)}>
              <span className="notification-item-icon">
                {item.isRead ? <CheckCircle2 size={16} /> : <Bell size={16} />}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <time>{formatDate(item.createdAt, { year: undefined })}</time>
              </span>
            </button>
          ))}
          {!items.length && (
            <div className="notification-empty">
              <CheckCircle2 size={22} />
              <strong>You’re all caught up</strong>
              <p>New request decisions and HR updates will appear here.</p>
            </div>
          )}
        </div>
      )}
      {unread > 0 && (
        <footer>
          <button className="text-button" onClick={onMarkAll}>Mark all {unread} as read</button>
        </footer>
      )}
    </section>
  )
}

function ChangePasswordModal({ open, forced, onClose, onComplete }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setError(null)
    setSaving(false)
    setComplete(false)
  }, [open])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      setError('The new password and confirmation do not match.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await changePassword(form.currentPassword, form.newPassword)
      setComplete(true)
    } catch (caught) {
      setError(caught)
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!forced && !complete}
      title={complete ? 'Password updated' : forced ? 'Set a new password' : 'Account security'}
      eyebrow={forced ? 'Required before continuing' : 'Secure your account'}
    >
      {complete ? (
        <div className="password-success">
          <span><CheckCircle2 size={24} /></span>
          <h3>Your password has been changed.</h3>
          <p>All refresh sessions were revoked by the server. Sign in again with your new password to continue.</p>
          <button className="button button-primary button-wide" onClick={onComplete}>Return to sign in</button>
        </div>
      ) : (
        <form className="simple-form" onSubmit={submit} noValidate>
          <div className="security-callout">
            <KeyRound size={19} />
            <p>Use at least 10 characters with an uppercase letter, lowercase letter, and number.</p>
          </div>
          <FormField label="Current password" error={error?.fieldError?.('currentPassword')}>
            <input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => set('currentPassword', event.target.value)} required />
          </FormField>
          <FormField label="New password" error={error?.fieldError?.('newPassword')}>
            <input type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => set('newPassword', event.target.value)} required />
          </FormField>
          <FormField label="Confirm new password">
            <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => set('confirmPassword', event.target.value)} required />
          </FormField>
          <FormError error={error} />
          <div className="form-actions">
            {!forced && <button type="button" className="button button-ghost" onClick={onClose}>Cancel</button>}
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? <Spinner size={16} /> : <KeyRound size={16} />} Change password
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function formatRole(role) {
  return { ADMIN: 'Administrator', HR_ADMIN: 'HR admin', MANAGER: 'Manager', EMPLOYEE: 'Employee' }[role] ?? role
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
