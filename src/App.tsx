import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import Home from './pages/Home'
import CaseView from './pages/CaseView'
import ExtractionLab from './pages/ExtractionLab'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/case/:id" element={<Navigate to="dashboard" replace />} />
        {/* The Extraction Lab is full-bleed cinematic — its own route, not a
            tab inside CaseView's section chrome. */}
        <Route path="/case/:id/lab" element={<ExtractionLab />} />
        <Route path="/case/:id/:section" element={<CaseView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
