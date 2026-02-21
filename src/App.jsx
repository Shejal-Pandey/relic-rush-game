import { useState, useEffect } from 'react'
import DesktopPage from './pages/DesktopPage'
import MobilePage from './pages/MobilePage'

function App() {
    const [view, setView] = useState(null) // 'desktop' or 'mobile'
    const [sessionId, setSessionId] = useState(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const session = params.get('session')
        const path = window.location.pathname

        if (path === '/controller' && session) {
            setView('mobile')
            setSessionId(session)
        } else {
            setView('desktop')
        }
    }, [])

    if (!view) return null

    if (view === 'mobile') {
        return <MobilePage sessionId={sessionId} />
    }

    return <DesktopPage />
}

export default App
