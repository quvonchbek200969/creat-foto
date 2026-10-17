import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Studio from './pages/Studio.jsx'
import Admin from './pages/Admin.jsx'
import { Login, Register } from './pages/AuthPages.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Layout><Studio /></Layout>} />
      <Route path="/admin" element={<Layout><Admin /></Layout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
