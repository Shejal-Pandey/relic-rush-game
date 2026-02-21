/**
 * Relic Rush — LOUD Professional Game Sound Engine
 * Uses dynamic compressor for maximum loudness
 */

let audioCtx = null
let bgMusicNodes = null
let runMusic = null
let breathingAudio = null
let compressor = null

export let isGlobalMuted = true
let isBgMusicActive = false

export function toggleMute() {
    isGlobalMuted = !isGlobalMuted

    // Explicitly resume audio context if we are unmuting
    if (!isGlobalMuted) {
        try { getCtx() } catch (e) { }
    }

    // Force-play paused tracks that were blocked by autoplay rules
    if (!runMusic) {
        runMusic = new Audio('/run_music.mp3')
        runMusic.loop = true
        runMusic.volume = 0.4
    }

    if (!breathingAudio) {
        breathingAudio = new Audio('/breathing.wav')
        breathingAudio.volume = 0.5
    }

    if (runMusic) {
        runMusic.muted = isGlobalMuted
        if (!isGlobalMuted && isBgMusicActive) {
            runMusic.play().catch(e => { })
        } else if (isGlobalMuted) {
            runMusic.pause()
        }
    }

    if (breathingAudio) {
        breathingAudio.muted = isGlobalMuted
        // We do not auto-resume breathing here. Let RelicRushGame trigger playBreathing on its timer.
        if (isGlobalMuted) {
            breathingAudio.pause()
        }
    }

    return isGlobalMuted
}

export function resumeAudioIfReady() {
    if (!isGlobalMuted) {
        try { getCtx() } catch (e) { }
    }

    if (runMusic && isBgMusicActive && runMusic.paused && !isGlobalMuted) {
        runMusic.play().catch(e => { })
    }
}

function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    if (!compressor) {
        compressor = audioCtx.createDynamicsCompressor()
        compressor.threshold.value = -24
        compressor.knee.value = 10
        compressor.ratio.value = 12
        compressor.attack.value = 0.003
        compressor.release.value = 0.15
        compressor.connect(audioCtx.destination)
    }
    return audioCtx
}

function loud(ctx, vol = 1.0) {
    const g = ctx.createGain()
    g.gain.value = isGlobalMuted ? 0 : vol
    g.connect(compressor)
    return g
}

export function playClick() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.0)
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(m); o.type = 'sine'
        o.frequency.setValueAtTime(1200, ctx.currentTime)
        o.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05)
        g.gain.setValueAtTime(1, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.1)
    } catch (e) { }
}

export function playCoinSound() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.0)
        const notes = [1318, 1976, 2637]
        notes.forEach((f, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain()
            o.connect(g); g.connect(m); o.type = 'sine'
            const t = ctx.currentTime + i * 0.06
            o.frequency.setValueAtTime(f, t)
            g.gain.setValueAtTime(0.8, t)
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
            o.start(t); o.stop(t + 0.25)
        })
    } catch (e) { }
}

export function playCollision() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.2)
        // MASSIVE bass thud
        const kick = ctx.createOscillator(), kg = ctx.createGain()
        kick.connect(kg); kg.connect(m); kick.type = 'sine'
        kick.frequency.setValueAtTime(120, ctx.currentTime)
        kick.frequency.exponentialRampToValueAtTime(15, ctx.currentTime + 0.5)
        kg.gain.setValueAtTime(1.0, ctx.currentTime)
        kg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        kick.start(ctx.currentTime); kick.stop(ctx.currentTime + 0.6)
        // Crash noise
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length)
        const ns = ctx.createBufferSource(); ns.buffer = buf
        const ng = ctx.createGain(); ns.connect(ng); ng.connect(m)
        ng.gain.setValueAtTime(0.8, ctx.currentTime)
        ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
        ns.start(ctx.currentTime); ns.stop(ctx.currentTime + 0.6)
        // Crack
        const cr = ctx.createOscillator(), cg = ctx.createGain()
        cr.connect(cg); cg.connect(m); cr.type = 'sawtooth'
        cr.frequency.setValueAtTime(400, ctx.currentTime)
        cr.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.2)
        cg.gain.setValueAtTime(0.7, ctx.currentTime)
        cg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
        cr.start(ctx.currentTime); cr.stop(ctx.currentTime + 0.3)
        // Delayed body thump
        const bt = ctx.createOscillator(), bg2 = ctx.createGain()
        bt.connect(bg2); bg2.connect(m); bt.type = 'sine'
        bt.frequency.setValueAtTime(50, ctx.currentTime + 0.3)
        bt.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.7)
        bg2.gain.setValueAtTime(0.001, ctx.currentTime)
        bg2.gain.setValueAtTime(0.9, ctx.currentTime + 0.3)
        bg2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)
        bt.start(ctx.currentTime + 0.3); bt.stop(ctx.currentTime + 0.7)
    } catch (e) { }
}

export function playGameOver() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.0)
        // Peaceful sad melody for waterfall scene
        const melody = [392, 370, 330, 294, 262, 247, 220, 196]
        melody.forEach((f, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain()
            o.connect(g); g.connect(m); o.type = 'sine'
            const t = ctx.currentTime + i * 0.35
            o.frequency.setValueAtTime(f, t)
            g.gain.setValueAtTime(0.6, t)
            g.gain.linearRampToValueAtTime(0.3, t + 0.2)
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
            o.start(t); o.stop(t + 0.45)
            // Harmony
            const h = ctx.createOscillator(), hg = ctx.createGain()
            h.connect(hg); hg.connect(m); h.type = 'sine'
            h.frequency.setValueAtTime(f * 1.5, t)
            hg.gain.setValueAtTime(0.2, t)
            hg.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
            h.start(t); h.stop(t + 0.4)
        })
        // Water ambient
        const wBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
        const wd = wBuf.getChannelData(0)
        for (let i = 0; i < wd.length; i++) wd[i] = (Math.random() * 2 - 1) * 0.15 * Math.sin(i / wd.length * Math.PI)
        const wn = ctx.createBufferSource(); wn.buffer = wBuf
        const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 600
        const wg = ctx.createGain(); wn.connect(wf); wf.connect(wg); wg.connect(m)
        wg.gain.value = 0.4
        wn.start(ctx.currentTime); wn.stop(ctx.currentTime + 4)
    } catch (e) { }
}

export function playPowerUp() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.0)
        const notes = [523, 659, 784, 1047, 1319]
        notes.forEach((f, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain()
            o.connect(g); g.connect(m); o.type = 'sine'
            const t = ctx.currentTime + i * 0.05
            o.frequency.setValueAtTime(f, t)
            g.gain.setValueAtTime(0.8, t)
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
            o.start(t); o.stop(t + 0.25)
        })
    } catch (e) { }
}

export function playSwipe() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.0)
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(i / d.length * Math.PI)
        const ns = ctx.createBufferSource(); ns.buffer = buf
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 2
        const g = ctx.createGain(); ns.connect(f); f.connect(g); g.connect(m)
        g.gain.setValueAtTime(1.0, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
        ns.start(ctx.currentTime); ns.stop(ctx.currentTime + 0.12)
    } catch (e) { }
}

export function playJump() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.0)
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(m); o.type = 'sine'
        o.frequency.setValueAtTime(200, ctx.currentTime)
        o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.12)
        g.gain.setValueAtTime(0.9, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.18)
    } catch (e) { }
}

export function playSlide() {
    try {
        const ctx = getCtx(), m = loud(ctx, 1.0)
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(m); o.type = 'sine'
        o.frequency.setValueAtTime(700, ctx.currentTime)
        o.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15)
        g.gain.setValueAtTime(0.8, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2)
    } catch (e) { }
}

export function playParachuteWind() {
    try {
        const ctx = getCtx(), m = loud(ctx, 0.8)
        const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(i / d.length * Math.PI)
        const ns = ctx.createBufferSource(); ns.buffer = buf
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'
        f.frequency.setValueAtTime(400, ctx.currentTime)
        f.frequency.linearRampToValueAtTime(900, ctx.currentTime + 1.5)
        f.frequency.linearRampToValueAtTime(300, ctx.currentTime + 3)
        f.Q.value = 1
        const g = ctx.createGain(); ns.connect(f); f.connect(g); g.connect(m)
        g.gain.setValueAtTime(0.9, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3)
        ns.start(ctx.currentTime); ns.stop(ctx.currentTime + 3)
    } catch (e) { }
}

export function playLanding() {
    try {
        const audio = new Audio('/landing.mp3')
        audio.volume = 1.0
        audio.muted = isGlobalMuted
        audio.play().catch(e => console.error(e))
    } catch (e) {
        console.error(e)
    }
}

export function playBreathing() {
    try {
        if (!breathingAudio) {
            breathingAudio = new Audio('/breathing.wav')
            breathingAudio.volume = 0.5
        }
        breathingAudio.muted = isGlobalMuted
        breathingAudio.currentTime = 0
        const playPromise = breathingAudio.play()
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                // Ignore autoplay block errors silently in the console to avoid spam
            })
        }
    } catch (e) { }
}

export function playFootstep() {
    try {
        const ctx = getCtx(), m = loud(ctx, 0.5)
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.connect(g); g.connect(m); o.type = 'sine'
        o.frequency.setValueAtTime(90 + Math.random() * 40, ctx.currentTime)
        o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.05)
        g.gain.setValueAtTime(0.7, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.07)
    } catch (e) { }
}

/**
 * EPIC ADVENTURE RUNNING SONG — Classic temple run style
 * Driving percussion + bass riff + adventure melody loop
 */
export function startBgMusic() {
    try {
        isBgMusicActive = true
        if (runMusic) {
            runMusic.pause()
            runMusic.currentTime = 0
        }
        runMusic = new Audio('/run_music.mp3')
        runMusic.loop = true
        runMusic.volume = 0.4
        runMusic.muted = isGlobalMuted

        if (!isGlobalMuted) {
            // Use an interaction-driven promise chain
            const playPromise = runMusic.play()
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.warn('[Relic Rush] Auto-play prevented for music. Ensure user clicked.', e)
                })
            }
        }
    } catch (e) { console.error(e) }
}

export function stopBgMusic() {
    isBgMusicActive = false
    try {
        if (runMusic) {
            runMusic.pause()
            runMusic.currentTime = 0
            runMusic = null
        }
    } catch (e) { }
}
