import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'react-qr-code'
import { motion, AnimatePresence } from 'framer-motion'
import { createSocket } from '../socket'
import RelicRushGame from '../game/RelicRushGame'
import { playClick, playCoinSound, playGameOver, playPowerUp, stopBgMusic, toggleMute, isGlobalMuted, resumeAudioIfReady } from '../sounds'

export default function DesktopPage() {
    const [stage, setStage] = useState('loading') // loading, qr, game, gameover
    const [sessionId, setSessionId] = useState(null)
    const [qrUrl, setQrUrl] = useState('')
    const [playerName, setPlayerName] = useState('')
    const [score, setScore] = useState(0)
    const [coins, setCoins] = useState(0)
    const [isSoundMuted, setIsSoundMuted] = useState(isGlobalMuted)
    const [gameKey, setGameKey] = useState(0)
    const socketRef = useRef(null)
    const gameRef = useRef(null)
    const canvasRef = useRef(null)
    const lastCoinCount = useRef(0)

    // Create session and show QR code
    useEffect(() => {
        async function initSession() {
            try {
                const res = await fetch('http://localhost:5002/api/session', { method: 'POST' })
                const data = await res.json()
                const { sessionId: sid, ip, port } = data
                setSessionId(sid)
                setQrUrl(`http://${ip}:${port}/controller?session=${sid}`)

                // Connect socket
                const socket = createSocket()
                socketRef.current = socket

                socket.on('connect', () => {
                    socket.emit('join_session', { sessionId: sid, role: 'desktop' })
                })

                // When a player joins from mobile
                socket.on('player_joined', (data) => {
                    setPlayerName(data.name)
                    setStage('game')
                    // Automatically awake audio as game starts
                    resumeAudioIfReady()
                })

                // Receive control events from mobile
                socket.on('control', (data) => {
                    if (gameRef.current) {
                        const { direction } = data
                        switch (direction) {
                            case 'left': gameRef.current.moveLeft(); break
                            case 'right': gameRef.current.moveRight(); break
                            case 'up': gameRef.current.jump(); break
                            case 'down': gameRef.current.slide(); break
                        }
                    }
                })

                // Phone explicitly hits START Game
                socket.on('game_started', () => {
                    resumeAudioIfReady()
                })

                // Phone ended the game
                socket.on('game_ended', (data) => {
                    if (gameRef.current) {
                        gameRef.current.endGame()
                    }
                })

                // Phone wants to play again
                socket.on('restart_game', () => {
                    if (gameRef.current) {
                        gameRef.current.destroy()
                        gameRef.current = null
                    }
                    setScore(0)
                    setCoins(0)
                    setStage('game') // Go directly to game, not QR
                    // Awake audio for second run
                    resumeAudioIfReady()
                })

                setStage('qr')
            } catch (err) {
                console.error('Failed to create session:', err)
                // Still show QR with fallback
                setStage('qr')
            }
        }

        initSession()

        // 🔊 SILENT AUDIO UNLOCKER: Browsers require a user interaction to allow audio context start.
        // Instead of showing a button, we listen for the VERY FIRST click anywhere on the page, play a silent tone,
        // and instantly grant global audio permissions. 
        const silentUnlock = () => {
            try {
                // Creates a tiny, unnoticeable beep to satisfy the browser's interaction requirements
                const AudioContext = window.AudioContext || window.webkitAudioContext
                if (AudioContext) {
                    const ctx = new AudioContext()
                    const osc = ctx.createOscillator()
                    osc.connect(ctx.destination)
                    osc.start(0)
                    osc.stop(0)
                }

                // Forcefully unmute if the user clicks anywhere on the screen
                if (isGlobalMuted) {
                    const newState = toggleMute()
                    setIsSoundMuted(newState)
                    playClick()
                }

                resumeAudioIfReady()
            } catch (e) { }
            // Once we have unlocked it, we remove the listeners so we don't spam beeps
            window.removeEventListener('click', silentUnlock)
            window.removeEventListener('keydown', silentUnlock)
            window.removeEventListener('touchstart', silentUnlock)
        }
        window.addEventListener('click', silentUnlock)
        window.addEventListener('keydown', silentUnlock)
        window.addEventListener('touchstart', silentUnlock)


        return () => {
            if (socketRef.current) socketRef.current.disconnect()
            if (gameRef.current) gameRef.current.destroy()
            stopBgMusic()
            window.removeEventListener('click', silentUnlock)
            window.removeEventListener('keydown', silentUnlock)
            window.removeEventListener('touchstart', silentUnlock)
        }
    }, [])

    // Start the game when stage changes to 'game' — gameKey forces fresh mount
    useEffect(() => {
        if (stage === 'game' && canvasRef.current) {
            // Destroy any lingering game first
            if (gameRef.current) {
                gameRef.current.destroy()
                gameRef.current = null
            }
            lastCoinCount.current = 0

            const game = new RelicRushGame(canvasRef.current, {
                onScoreUpdate: (s, c) => {
                    setScore(s)
                    setCoins(c)
                    // Play coin sound when coins increase
                    if (c > lastCoinCount.current) {
                        playCoinSound()
                        lastCoinCount.current = c
                    }
                    // Send score to phone
                    if (socketRef.current && sessionId) {
                        socketRef.current.emit('score_update', { sessionId, score: s, coins: c })
                    }
                },
                onGameOver: (s, c) => {
                    setScore(s)
                    setCoins(c)
                    setStage('gameover')
                    // Sound is handled by game engine after 4s lie-down
                    // Notify phone
                    if (socketRef.current && sessionId) {
                        socketRef.current.emit('end_game', { sessionId, score: s, coins: c })
                    }
                },
                onPowerUp: () => {
                    playPowerUp()
                }
            })
            gameRef.current = game
            game.start()
        }

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy()
                gameRef.current = null
            }
        }
    }, [stage, sessionId, gameKey])

    // Keyboard controls for desktop testing
    useEffect(() => {
        const handleKey = (e) => {
            if (!gameRef.current) return
            switch (e.key) {
                case 'ArrowLeft': case 'a': gameRef.current.moveLeft(); break
                case 'ArrowRight': case 'd': gameRef.current.moveRight(); break
                case 'ArrowUp': case 'w': case ' ': gameRef.current.jump(); e.preventDefault(); break
                case 'ArrowDown': case 's': gameRef.current.slide(); break
            }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [])

    const handleEndGame = useCallback(() => {
        playClick()
        if (gameRef.current) {
            gameRef.current.endGame()
        }
    }, [])

    const handlePlayAgain = useCallback(() => {
        playClick()
        stopBgMusic()
        // Destroy old game
        if (gameRef.current) {
            gameRef.current.destroy()
            gameRef.current = null
        }
        // Reset state and bump gameKey to force fresh canvas mount
        setScore(0)
        setCoins(0)
        lastCoinCount.current = 0
        setGameKey(k => k + 1)
        setStage('game')
    }, [])

    return (
        <>
            <div className="desktop-bg min-h-screen text-white font-sans overflow-hidden relative">
                {/* Sound Toggle Button and Instruction */}
                <div className="absolute top-6 left-6 z-[99999] flex items-center gap-4">
                    <div
                        onClick={() => {
                            const newMuteState = toggleMute()
                            setIsSoundMuted(newMuteState)
                            if (!newMuteState) playClick()
                        }}
                        className="bg-transparent hover:scale-105 active:scale-95 text-white rounded-full flex items-center justify-center cursor-pointer transition-transform border-[3px] border-white/50 overflow-hidden shadow-xl"
                        style={{ outline: 'none', width: '56px', height: '56px' }}
                    >
                        {isSoundMuted ? (
                            <img src="/sound_off.png" alt="Sound Off" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <img src="/sound_on.png" alt="Sound On" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                    </div>
                    {isSoundMuted && (
                        <span className="text-white/80 text-sm font-semibold tracking-wider uppercase animate-pulse" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                            Click here to ON the sound via cursor →
                        </span>
                    )}
                </div>

                {/* QR Code Screen */}
                <AnimatePresence mode="wait">
                    {(stage === 'loading' || stage === 'qr') && (
                        <motion.div
                            key="qr-screen"
                            className="desktop-container"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.5 } }}
                        >
                            <div className="desktop-bg" />
                            <img
                                src="/logo.png"
                                alt="Relic Rush Logo"
                                style={{
                                    width: 'clamp(120px, 18vw, 220px)',
                                    height: 'auto',
                                    borderRadius: '24px',
                                    marginBottom: '0.8rem',
                                    zIndex: 1,
                                    filter: 'drop-shadow(0 4px 20px rgba(139, 105, 20, 0.35))',
                                    objectFit: 'cover',
                                }}
                            />
                            <h1 className="game-title">Relic Rush</h1>
                            <p className="game-subtitle">Ancient Temple Adventure</p>

                            {stage === 'loading' ? (
                                <div className="glass-card qr-section">
                                    <p className="waiting-text">Creating game session...</p>
                                    <div className="loading-dots">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            ) : (
                                <motion.div
                                    className="glass-card qr-section"
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <p className="scan-text">
                                        SCAN TO PLAY
                                    </p>
                                    <div className="qr-wrapper">
                                        <QRCode
                                            value={qrUrl || 'loading...'}
                                            size={200}
                                            bgColor="#ffffff"
                                            fgColor="#0a0a1a"
                                            level="M"
                                        />
                                    </div>
                                    <p className="waiting-text">
                                        Waiting for player to join
                                        <span className="loading-dots" style={{ marginLeft: 6 }}>
                                            <span /><span /><span />
                                        </span>
                                    </p>
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Game Screen */}
                {(stage === 'game' || stage === 'gameover') && (
                    <div className="game-container">
                        <div className="game-canvas-wrapper" key={gameKey} ref={canvasRef} />
                        <div className="game-hud">
                            <div className="hud-left">
                                <div className="hud-score">{score.toLocaleString()}M</div>
                                <div className="hud-coins">{coins} COINS</div>
                                {playerName && <div className="hud-player-name">{playerName.toUpperCase()}</div>}
                            </div>
                            <div className="hud-right">
                                {/* Desktop controls removed to enforce mobile phone remote usage */}
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
                                    Mobile Remote Active
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Game Over — Waterfall Rest Scene */}
                <AnimatePresence>
                    {stage === 'gameover' && (
                        <motion.div
                            className="overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.5 }}
                        >
                            <motion.div
                                className="minimal-card gameover-card"
                                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                                animate={{ scale: 1, y: 0, opacity: 1 }}
                                transition={{ type: 'spring', damping: 20, delay: 0.2 }}
                                style={{ position: 'relative', zIndex: 2 }}
                            >
                                <h2 className="gameover-title">RUN ENDED</h2>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '24px' }}>
                                    Signal Lost
                                </p>
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
                                <div className="gameover-actions" style={{ marginTop: '30px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '3px', animation: 'pulse 3s infinite' }}>
                                        Awaiting Remote Input
                                    </p>
                                    <button
                                        onClick={() => {
                                            playClick()
                                            setTimeout(() => window.location.reload(), 200)
                                        }}
                                        className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-full shadow-lg shadow-red-600/50 transition-all active:scale-95 border-2 border-red-400 tracking-widest uppercase"
                                        style={{ outline: 'none' }}
                                    >
                                        QUIT GAME
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    )
}
