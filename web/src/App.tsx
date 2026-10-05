import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { FullScreenSpinner } from './components/ui';
import Login from './pages/Login';
import Work from './pages/Work';
import MyDay from './pages/MyDay';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Services from './pages/admin/Services';
import Employees from './pages/admin/Employees';
import Sessions from './pages/admin/Sessions';
import System from './pages/admin/System';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={user.role === 'ADMIN' ? '/admin' : '/work'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="/work" element={user ? <Work /> : <Navigate to="/login" replace />} />
      <Route path="/work/today" element={user ? <MyDay /> : <Navigate to="/login" replace />} />
      <Route
        path="/admin"
        element={user?.role === 'ADMIN' ? <AdminLayout /> : <Navigate to="/" replace />}
      >
        <Route index element={<Dashboard />} />
        <Route path="services" element={<Services />} />
        <Route path="employees" element={<Employees />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="system" element={<System />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
