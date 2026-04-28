import { AuthGate } from "@/components/AuthGate";
import { DashboardShell } from "@/components/DashboardShell";

export default function App() {
  return (
    <AuthGate>
      <DashboardShell />
    </AuthGate>
  );
}
