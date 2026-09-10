import type React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useProfile } from './lib/hooks/useProfile';
import { OrderComposer } from './features/orders/OrderComposer';
import { DriverShift } from './features/driver/DriverShift';
import { BranchDashboard } from './features/dashboard/BranchDashboard';
import { MasterDashboard } from './features/dashboard/MasterDashboard';
import { TrackOrder } from './features/tracking/TrackOrder';
import { Login } from './features/auth/Login';

function Gate({
  children,
  allow,
}: {
  children: React.ReactElement;
  allow: string[];
}) {
  const { profile, loading } = useProfile();
  if (loading) return <div className="p-6">Loading…</div>;
  if (!profile) return <Navigate to="/login" replace />;
  if (!allow.includes(profile.role)) return <div className="p-6">Not authorised.</div>;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/track/:tracking_code" element={<TrackOrder />} />
        <Route path="/login" element={<Login />} />

        {/* Staff */}
        <Route
          path="/orders/new"
          element={
            <Gate allow={['master', 'branch_manager', 'fulfillment_officer']}>
              <OrderComposer />
            </Gate>
          }
        />
        <Route
          path="/driver"
          element={
            <Gate allow={['driver']}>
              <DriverShift />
            </Gate>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Gate allow={['branch_manager', 'fulfillment_officer']}>
              <BranchDashboard />
            </Gate>
          }
        />
        <Route
          path="/admin"
          element={
            <Gate allow={['master']}>
              <MasterDashboard />
            </Gate>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
