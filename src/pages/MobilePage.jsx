import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createSocket } from '../socket'
import { playClick, playSwipe, playJump, playSlide } from '../sounds'

export default function MobilePage({ sessionId }) {
    const [stage, setStage] = useState('name') // name, playing, gameover
    const [name, setName] = useState('')
    const [score, setScore] = useState(0)
    const [coins, setCoins] = useState(0)
    const [swipeFeedback, setSwipeFeedback] = useState(null)
    const socketRef = useRef(null)
    const touchStartRef = useRef({ x: 0, y: 0 })
    const swipeFiredRef = useRef(false)
    const feedbackTimerRef = useRef(null)

    // Connect socket
    useEffect(() => {
        const socket = createSocket()
        socketRef.current = socket

        socket.on('score_update', (data) => {
            setScore(data.score || 0)
            setCoins(data.coins || 0)
        })

        socket.on('game_ended', (data) => {
            setScore(data.score || 0)
            setCoins(data.coins || 0)
            setStage('gameover')
        })

        return () => {
            socket.disconnect()
        }
    }, [])

    const handleStartGame = useCallback(() => {
        if (!name.trim()) return
        playClick()
        const socket = socketRef.current
        if (socket) {
            socket.emit('join_session', {
                sessionId,
                role: 'controller',
                name: name.trim()
            })
            socket.emit('start_game', { sessionId })
        }
        setStage('playing')
    }, [name, sessionId])

    const sendControl = useCallback((direction) => {
        const socket = socketRef.current
        if (socket) {
            socket.emit('control', { sessionId, direction })
        }
        // Direction-specific audio feedback
        if (direction === 'up') playJump()
        else if (direction === 'down') playSlide()
        else playSwipe()
        // Haptic feedback — short and sharp
        if (navigator.vibrate) {
            navigator.vibrate(15)
        }
        // Visual feedback
        const labels = { left: '←', right: '→', up: '↑', down: '↓' }
        setSwipeFeedback(labels[direction] || direction)
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
        feedbackTimerRef.current = setTimeout(() => setSwipeFeedback(null), 400)
    }, [sessionId])

    const handleEndGame = useCallback(() => {
        playClick()
        const socket = socketRef.current
        if (socket) {
            socket.emit('end_game', { sessionId, score, coins })
        }
        setStage('gameover')
    }, [sessionId, score, coins])

    const handlePlayAgain = useCallback(() => {
        playClick()
        const socket = socketRef.current
        if (socket) {
            socket.emit('restart_game', { sessionId })
            socket.emit('join_session', { sessionId, role: 'controller', name: name.trim() })
            socket.emit('start_game', { sessionId })
        }
        setScore(0)
        setCoins(0)
        setStage('playing')
    }, [sessionId, name])

    const handleQuit = useCallback(() => {
        playClick()
        setScore(0)
        setCoins(0)
        setName('')
        setStage('name')
    }, [])

    useEffect(() => {
        const onStart = (e) => {
            const touch = e.touches[0]
            touchStartRef.current = { x: touch.clientX, y: touch.clientY }
            swipeFiredRef.current = false
        }
        const onMove = (e) => {
            if (stage === 'playing') e.preventDefault() // Must prevent scroll to capture left swipe
            if (stage !== 'playing' || swipeFiredRef.current) return
            const touch = e.touches[0]
            const dx = touch.clientX - touchStartRef.current.x
            const dy = touch.clientY - touchStartRef.current.y
            const absDx = Math.abs(dx), absDy = Math.abs(dy)

            // Reduced to 10px for hyper-responsive smooth swiping
            if (absDx < 10 && absDy < 10) return

            swipeFiredRef.current = true

            let direction = ''
            if (absDx > absDy) direction = dx > 0 ? 'right' : 'left'
            else direction = dy > 0 ? 'down' : 'up'

            // Optional: visual trigger on the DOM element if we had refs, but we'll let CSS handle hover/active
            sendControl(direction)
        }
        const onEnd = () => { swipeFiredRef.current = false }

        document.addEventListener('touchstart', onStart, { passive: true })
        document.addEventListener('touchmove', onMove, { passive: false })
        document.addEventListener('touchend', onEnd, { passive: true })
        return () => {
            document.removeEventListener('touchstart', onStart)
            document.removeEventListener('touchmove', onMove)
            document.removeEventListener('touchend', onEnd)
        }
    }, [stage, sendControl])

    return (
        <div className="mobile-container">
            <div className="mobile-bg" />

            <AnimatePresence mode="wait">
                {/* Name Entry */}
                {stage === 'name' && (
                    <motion.div
                        key="name-entry"
                        className="name-entry"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <img
                            src="/logo.png"
                            alt="Relic Rush Logo"
                            style={{
                                width: '140px',
                                height: 'auto',
                                borderRadius: '18px',
                                filter: 'drop-shadow(0 4px 16px rgba(139, 105, 20, 0.3))',
                            }}
                        />
                        <h1 className="game-title">Relic Rush</h1>
                        <p className="enter-text">Enter your name to begin</p>

                        <input
                            className="name-input"
                            type="text"
                            placeholder="Your Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleStartGame()}
                            maxLength={20}
                            autoFocus
                            autoComplete="off"
                            autoCapitalize="words"
                        />

                        <motion.button
                            className="btn btn-primary"
                            onClick={handleStartGame}
                            whileTap={{ scale: 0.95 }}
                            style={{ opacity: name.trim() ? 1 : 0.4, pointerEvents: name.trim() ? 'auto' : 'none' }}
                        >
                            START
                        </motion.button>
                    </motion.div>
                )}

                {/* Controller */}
                {stage === 'playing' && (
                    <motion.div
                        key="controller"
                        className="controller"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="controller-header">
                            <div>
                                <div className="controller-score">{score.toLocaleString()}M</div>
                                <div className="controller-coins">{coins} COINS</div>
                            </div>
                            <button className="btn btn-end" onClick={handleEndGame}>
                                DISCONNECT
                            </button>
                        </div>

                        <div className="controller-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="trackpad-container">
                                <p className="swipe-hint" style={{ position: 'relative', top: '-10px', marginTop: '10px' }}>Swipe anywhere to move</p>

                                {/* Aesthetically pleasing D-Pad / Trackpad visual */}
                                <div className="trackpad-visual">
                                    <div className="trackpad-ring"></div>
                                    <div className="trackpad-center"></div>
                                    {/* Directional Chevrons */}
                                    <div className="chevron chevron-up"></div>
                                    <div className="chevron chevron-down"></div>
                                    <div className="chevron chevron-left"></div>
                                    <div className="chevron chevron-right"></div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Game Over */}
                {stage === 'gameover' && (
                    <motion.div
                        key="gameover"
                        className="mobile-gameover"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <h2 className="gameover-title">Game Over</h2>

                        <div className="gameover-stats">
                            <div className="stat-item">
                                <div className="stat-value">{score.toLocaleString()}M</div>
                                <div className="stat-label">Distance</div>
                            </div>
                            <div className="stat-item">
                                <div className="stat-value" style={{ color: 'var(--color-gold)' }}>{coins}</div>
                                <div className="stat-label">Captured</div>
                            </div>
                        </div>

                        <div className="gameover-actions" style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button className="btn btn-primary" onClick={handlePlayAgain} style={{ flex: 1 }}>
                                RESTART
                            </button>
                            <button className="btn btn-end" onClick={handleQuit} style={{ flex: 1 }}>
                                DISCONNECT
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Swipe feedback overlay */}
            <AnimatePresence>
                {swipeFeedback && (
                    <motion.div
                        key={Date.now()}
                        className="swipe-feedback"
                        initial={{ opacity: 1, scale: 0.5 }}
                        animate={{ opacity: 0, scale: 1.2 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        {swipeFeedback}
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    )
}
