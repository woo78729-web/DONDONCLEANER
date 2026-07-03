import { useState } from 'react';

import { Layout } from '../components/Layout';

import { CustomerPhoneLookup } from '../components/CustomerPhoneLookup';

import { MaintenanceHistoryPanel } from '../components/MaintenanceHistoryPanel';

import { ScheduleSnapshotModal } from '../components/ScheduleSnapshotModal';

import { useAuth } from '../context/AuthContext';

import { canAccess } from '../utils/permissions';



export default function PhoneLookupPage() {

  const { user } = useAuth();

  const [snapshotSchedule, setSnapshotSchedule] = useState(null);

  const [lookupPhone, setLookupPhone] = useState('');

  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);



  return (

    <Layout title="電話查詢">

      <section className="card phone-lookup">

        <div className="card-header">

          <div>

            <h2 className="card-title">客戶電話查詢</h2>

            <p className="hint">輸入電話可查詢過往清洗紀錄；查到單後可直接按報修，資訊會通知負責師傅。</p>

          </div>

        </div>

        <CustomerPhoneLookup

          onSelectSchedule={setSnapshotSchedule}

          onSearchComplete={setLookupPhone}

          onMaintenanceCreated={() => setHistoryRefreshToken((value) => value + 1)}

        />

      </section>



      {canAccess(user, 'maintenance.manage') && (

        <MaintenanceHistoryPanel

          initialPhone={lookupPhone}

          refreshToken={historyRefreshToken}

        />

      )}



      <ScheduleSnapshotModal

        open={Boolean(snapshotSchedule)}

        schedule={snapshotSchedule}

        onClose={() => setSnapshotSchedule(null)}

        showActions={false}

      />

    </Layout>

  );

}


