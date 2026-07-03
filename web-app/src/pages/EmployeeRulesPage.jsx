import { Layout } from '../components/Layout';
import { EmployeeRulesContent } from '../components/EmployeeRulesContent';
import './employee-onboarding.css';

export default function EmployeeRulesPage() {
  return (
    <Layout title="員工守則">
      <section className="card employee-rules-page">
        <EmployeeRulesContent />
      </section>
    </Layout>
  );
}
