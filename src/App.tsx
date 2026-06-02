import { useState } from 'react';
import Header from './components/Header';
import LandingScreen from './screens/LandingScreen';
import PMSelectNameScreen from './screens/PMSelectNameScreen';
import PMHomeScreen from './screens/PMHomeScreen';
import AddReportFlow from './screens/AddReportFlow';
import GCDashboard from './screens/GCDashboard';
import GCDetailPage from './screens/GCDetailPage';
import CSVUploadScreen from './screens/CSVUploadScreen';
import { type ProjectManager } from './lib/supabase';

type Screen =
  | 'landing'
  | 'pm-select-name'
  | 'pm-home'
  | 'pm-add-report'
  | 'gc-dashboard'
  | 'gc-detail'
  | 'csv-upload';

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [selectedPM, setSelectedPM] = useState<ProjectManager | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [selectedGCId, setSelectedGCId] = useState<string | null>(null);

  function handlePMSelected(pm: ProjectManager) {
    setSelectedPM(pm);
    setConfirmationMessage('');
    setScreen('pm-home');
  }

  function handleReportComplete(gcName: string) {
    setConfirmationMessage(`Rating submitted for ${gcName}. Thank you.`);
    setScreen('pm-home');
  }

  const headerSubtitle =
    screen === 'gc-dashboard' ? 'GC Performance Dashboard' :
    screen === 'csv-upload' ? 'Upload Bid Data' :
    'GC Rating System';

  function handleHome() {
    setScreen('landing');
    setSelectedPM(null);
    setConfirmationMessage('');
  }

  return (
    <div className="min-h-screen bg-navy-900 text-white">
      <Header subtitle={headerSubtitle} onHome={handleHome} />

      {screen === 'landing' && (
        <LandingScreen
          onSelectPM={() => setScreen('pm-select-name')}
          onSelectEstimator={() => setScreen('gc-dashboard')}
        />
      )}

      {screen === 'pm-select-name' && (
        <PMSelectNameScreen
          onSelect={handlePMSelected}
          onBack={() => setScreen('landing')}
        />
      )}

      {screen === 'pm-home' && selectedPM && (
        <PMHomeScreen
          pm={selectedPM}
          confirmationMessage={confirmationMessage}
          onAddReport={() => { setConfirmationMessage(''); setScreen('pm-add-report'); }}
          onViewDashboard={() => setScreen('gc-dashboard')}
          onBack={() => { setScreen('pm-select-name'); setSelectedPM(null); }}
        />
      )}

      {screen === 'pm-add-report' && selectedPM && (
        <AddReportFlow
          pm={selectedPM}
          onComplete={handleReportComplete}
          onBack={() => setScreen('pm-home')}
          onHome={handleHome}
        />
      )}

      {screen === 'gc-dashboard' && (
        <GCDashboard
          onBack={() => setScreen(selectedPM ? 'pm-home' : 'landing')}
          backLabel={selectedPM ? '← Back to Home' : '← Back'}
          onSelectGC={(id) => { setSelectedGCId(id); setScreen('gc-detail'); }}
          onUploadCSV={() => setScreen('csv-upload')}
        />
      )}

      {screen === 'gc-detail' && selectedGCId && (
        <GCDetailPage
          gcId={selectedGCId}
          onBack={() => setScreen('gc-dashboard')}
          onAwardProbabilityUpdated={() => {}}
        />
      )}

      {screen === 'csv-upload' && (
        <CSVUploadScreen
          onBack={() => setScreen('gc-dashboard')}
          onComplete={() => setScreen('gc-dashboard')}
        />
      )}
    </div>
  );
}
