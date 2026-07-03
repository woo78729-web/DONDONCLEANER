import { Layout } from '../components/Layout';
import { EmergencyMaintenancePanel } from '../components/EmergencyMaintenancePanel';

export default function EmergencyMaintenancePage() {
  return (
    <Layout title="緊急維修">
      <EmergencyMaintenancePanel />
    </Layout>
  );
}
