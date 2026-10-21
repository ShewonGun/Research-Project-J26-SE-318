import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Pages/SharedPages/Login.jsx'
import Signup from './Pages/SharedPages/Signup.jsx'
import WaterLoader from './Components/SharedComponents/WaterLoader.jsx'

// Lazy-load each role's tree so a household never downloads admin code (and vice-versa).
const DashboardLayout = lazy(() => import('./Layout/DashboardLayout.jsx'))
const Dashboard = lazy(() => import('./Pages/AdminPages/Dashboard.jsx'))
const WaterPackages = lazy(() => import('./Pages/AdminPages/WaterPackages.jsx'))
const Devices = lazy(() => import('./Pages/AdminPages/Devices.jsx'))
const Subscriptions = lazy(() => import('./Pages/AdminPages/Subscriptions.jsx'))
const AdminBilling = lazy(() => import('./Pages/AdminPages/Billing.jsx'))
const ModeRequests = lazy(() => import('./Pages/AdminPages/ModeRequests.jsx'))
const AdminAlerts = lazy(() => import('./Pages/AdminPages/Alerts.jsx'))
const LeakAnalytics = lazy(() => import('./Pages/AdminPages/LeakAnalytics.jsx'))
const AdminUsageForecast = lazy(() => import('./Pages/AdminPages/UsageForecast.jsx'))
const Users = lazy(() => import('./Pages/AdminPages/Users.jsx'))
const AdminProfile = lazy(() => import('./Pages/AdminPages/Profile.jsx'))

const UserLayout = lazy(() => import('./Layout/UserLayout.jsx'))
const Home = lazy(() => import('./Pages/UserPages/Home.jsx'))
const Usage = lazy(() => import('./Pages/UserPages/Usage.jsx'))
const UsageHistory = lazy(() => import('./Pages/UserPages/UsageHistory.jsx'))
const Plans = lazy(() => import('./Pages/UserPages/Plans.jsx'))
const Billing = lazy(() => import('./Pages/UserPages/Billing.jsx'))
const Account = lazy(() => import('./Pages/UserPages/Account.jsx'))
const UserAlerts = lazy(() => import('./Pages/UserPages/Alerts.jsx'))

// The landing route for a role.
const homeFor = (role) => (role === 'admin' ? '/dashboard' : '/app')

// Require a logged-in user; optionally require a specific role.
const RequireRole = ({ role, children }) => {
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (!token) return <Navigate to="/login" replace />
  if (role && user?.role !== role) return <Navigate to={homeFor(user?.role)} replace />
  return children
}

const App = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<WaterLoader fullscreen />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Admin console */}
          <Route
            path="/dashboard"
            element={
              <RequireRole role="admin">
                <DashboardLayout />
              </RequireRole>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="packages" element={<WaterPackages />} />
            <Route path="devices" element={<Devices />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="billing" element={<AdminBilling />} />
            <Route path="mode-requests" element={<ModeRequests />} />
            <Route path="alerts" element={<AdminAlerts />} />
            <Route path="analytics" element={<LeakAnalytics />} />
            <Route path="forecast" element={<AdminUsageForecast />} />
            <Route path="users" element={<Users />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>

          {/* Consumer app */}
          <Route
            path="/app"
            element={
              <RequireRole role="user">
                <UserLayout />
              </RequireRole>
            }
          >
            <Route index element={<Home />} />
            <Route path="usage" element={<Usage />} />
            <Route path="usage/history" element={<UsageHistory />} />
            <Route path="plans" element={<Plans />} />
            <Route path="billing" element={<Billing />} />
            <Route path="account" element={<Account />} />
            <Route path="alerts" element={<UserAlerts />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
