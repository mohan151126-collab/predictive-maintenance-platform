import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import { AlertsPage } from "./pages/AlertsPage";
import { LoginPage } from "./pages/LoginPage";
import { MachineDetailPage } from "./pages/MachineDetailPage";
import { PlantDetailPage } from "./pages/PlantDetailPage";
import { PlantsPage } from "./pages/PlantsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TeamPage } from "./pages/TeamPage";
import { WorkOrdersPage } from "./pages/WorkOrdersPage";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/plants" element={<PlantsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/work-orders" element={<WorkOrdersPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/plants/:plantId" element={<PlantDetailPage />} />
          <Route path="/machines/:machineId" element={<MachineDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/plants" replace />} />
    </Routes>
  );
}
