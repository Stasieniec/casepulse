import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import Home from './pages/Home'
import CaseView from './pages/CaseView'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/case/:id" element={<Navigate to="dashboard" replace />} />
        <Route path="/case/:id/:section" element={<CaseView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
