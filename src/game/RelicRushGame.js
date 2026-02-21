import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { playCollision, playGameOver, playParachuteWind, playLanding, startBgMusic, stopBgMusic, playFootstep, playBreathing } from '../sounds'

/**
 * Relic Rush — Advanced 3D Temple Runner
 * Inspired by Temple Run: stone path, ancient ruins, water, archways, vines
 */
export default class RelicRushGame {
    constructor(container, callbacks = {}) {
        this.container = container
        this.callbacks = callbacks

        // Constants
        this.LANE_W = 2.8
        this.JUMP_FORCE = 14
        this.GRAVITY = 36
        this.PATH_LEN = 22
        this.TILE_N = 16
        this.OBS_N = 22
        this.COIN_N = 35
        this.INIT_SPEED = 12
        this.MAX_SPEED = 35
        this.SPEED_INC = 0.25

        // State
        this.score = 0; this.coins = 0; this.speed = this.INIT_SPEED
        this.curLane = 0; this.tgtLane = 0; this.playerY = 0
        this.jumpVel = 0; this.jumping = false; this.sliding = false
        this.slideT = 0; this.gameOver = false; this.running = false
        this.dist = 0; this.level = 1; this.combo = 1; this.comboT = 0
        this.shieldOn = false; this.shieldT = 0
        this.magnetOn = false; this.magnetT = 0

        // Parachute intro state
        this.introPhase = 'none' // 'parachute', 'landing', 'none'
        this.introTimer = 0
        this.parachuteMesh = null

        // Collision animation state
        this.collisionPhase = 'none' // 'impact', 'falling', 'lying', 'none'
        this.collisionTimer = 0

        // Footstep/Breathing timer
        this.footstepTimer = 0
        this.breathTimer = 0

        // Pools
        this.tiles = []; this.lWalls = []; this.rWalls = []
        this.obs = []; this.coinArr = []; this.torches = []
        this.pups = []; this.trees = []; this.archways = []
        this.vines = []; this.buildings = []; this.waterTiles = []

        this.clock = new THREE.Clock(false)
        this.animId = null
        this._resize = this.onResize.bind(this)
        this.init()
    }

    init() {
        const w = this.container.clientWidth, h = this.container.clientHeight

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x87CEEB)
        this.scene.fog = new THREE.Fog(0x87CEEB, 60, 180)

        this.camera = new THREE.PerspectiveCamera(68, w / h, 0.1, 300)
        this.camera.position.set(0, 6.5, 10)
        this.camera.lookAt(0, 1.5, -18)

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
        this.renderer.setSize(w, h)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 1.0
        this.container.appendChild(this.renderer.domElement)

        this.buildLighting()
        this.buildWater()
        this.buildPath()
        this.buildWalls()
        this.buildArchways()
        this.buildBuildings()
        this.buildVines()
        this.buildTrees()
        this.buildPlayer()
        this.buildObstacles()
        this.buildCoins()
        this.buildPowerUps()
        this.buildParticles()

        window.addEventListener('resize', this._resize)
        this.animate()
    }

    // === TEXTURES ===
    stoneTexture(baseColor, lineColor) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256
        const x = c.getContext('2d')
        x.fillStyle = baseColor; x.fillRect(0, 0, 256, 256)
        x.strokeStyle = lineColor; x.lineWidth = 2
        for (let r = 0; r < 8; r++) {
            const off = r % 2 === 0 ? 0 : 16
            x.beginPath(); x.moveTo(0, r * 32); x.lineTo(256, r * 32); x.stroke()
            for (let c2 = 0; c2 < 8; c2++) {
                x.beginPath(); x.moveTo(c2 * 32 + off, r * 32); x.lineTo(c2 * 32 + off, (r + 1) * 32); x.stroke()
            }
        }
        for (let i = 0; i < 400; i++) {
            const s = 100 + Math.floor(Math.random() * 60)
            x.fillStyle = `rgba(${s},${s - 15},${s - 30},0.12)`
            x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
        }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
    }

    mossTexture() {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128
        const x = c.getContext('2d')
        x.fillStyle = '#4a6b3a'; x.fillRect(0, 0, 128, 128)
        for (let i = 0; i < 200; i++) {
            const g = 60 + Math.floor(Math.random() * 80)
            x.fillStyle = `rgba(${30 + Math.random() * 40},${g},${20 + Math.random() * 30},0.3)`
            x.fillRect(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 4, 2 + Math.random() * 3)
        }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
    }

    // === LIGHTING ===
    buildLighting() {
        this.scene.add(new THREE.AmbientLight(0xffeedd, 0.6))
        const sun = new THREE.DirectionalLight(0xffdd88, 1.2)
        sun.position.set(10, 25, 15); sun.castShadow = true
        sun.shadow.mapSize.set(2048, 2048)
        sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 80
        sun.shadow.camera.left = -25; sun.shadow.camera.right = 25
        sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25
        this.scene.add(sun)
        this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x556B2F, 0.4))

        // Torch fires along path
        const cols = [0xff6622, 0xff8833, 0xffaa44]
        for (let i = 0; i < 14; i++) {
            const side = i % 2 === 0 ? -1 : 1
            const l = new THREE.PointLight(cols[i % 3], 0.7, 16, 1.8)
            l.position.set(side * 5.8, 4, -i * 10)
            this.scene.add(l); this.torches.push(l)
            // Flame visual
            const fg = new THREE.SphereGeometry(0.15, 6, 6)
            const fm = new THREE.MeshBasicMaterial({ color: cols[i % 3], transparent: true, opacity: 0.9 })
            const f = new THREE.Mesh(fg, fm); f.position.copy(l.position); f.position.y -= 0.3
            this.scene.add(f)
            // Torch post
            const pg = new THREE.CylinderGeometry(0.08, 0.1, 2.5, 5)
            const pm = new THREE.MeshStandardMaterial({ color: 0x3a2a1a })
            const p = new THREE.Mesh(pg, pm); p.position.set(side * 5.8, 2.5, -i * 10); this.scene.add(p)
        }
    }

    // === WATER ===
    buildWater() {
        const wGeo = new THREE.PlaneGeometry(60, this.PATH_LEN)
        const wMat = new THREE.MeshStandardMaterial({
            color: 0x0a4a4a, roughness: 0.2, metalness: 0.6,
            transparent: true, opacity: 0.85, emissive: 0x003333, emissiveIntensity: 0.2
        })
        for (let i = 0; i < this.TILE_N; i++) {
            const z = -i * this.PATH_LEN + this.PATH_LEN / 2
            const lw = new THREE.Mesh(wGeo, wMat); lw.rotation.x = -Math.PI / 2; lw.position.set(-35, -2, z)
            this.scene.add(lw); this.waterTiles.push(lw)
            const rw = new THREE.Mesh(wGeo, wMat); rw.rotation.x = -Math.PI / 2; rw.position.set(35, -2, z)
            this.scene.add(rw); this.waterTiles.push(rw)
        }
    }

    // === PATH (Detailed Temple Stone Floor) ===
    buildPath() {
        const tex = this.stoneTexture('#8a7a5a', '#706040'); tex.repeat.set(3, 6)
        const geo = new THREE.PlaneGeometry(10, this.PATH_LEN)
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, color: 0xb09060 })
        // Raised stone border along edges
        const borderGeo = new THREE.BoxGeometry(0.6, 0.35, this.PATH_LEN)
        const borderMat = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 0.9, metalness: 0.05 })
        // Gold trim
        const trimGeo = new THREE.BoxGeometry(10, 0.08, 0.3)
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xc8a830, metalness: 0.7, roughness: 0.3, emissive: 0x886600, emissiveIntensity: 0.15 })
        // Center channel engraving
        const chanGeo = new THREE.BoxGeometry(0.15, 0.03, this.PATH_LEN)
        const chanMat = new THREE.MeshStandardMaterial({ color: 0x6a5a40, roughness: 0.95 })
        // Cracked stone overlays
        const crackMat = new THREE.MeshStandardMaterial({ color: 0x7a6a48, roughness: 0.95 })

        // 1. Create the singular STARTING LINE
        this.startLine = new THREE.Mesh(trimGeo, trimMat)
        this.startLine.position.set(0, 0.01, 0) // Positioned exactly at the start
        this.scene.add(this.startLine)

        for (let i = 0; i < this.TILE_N; i++) {
            const z = -i * this.PATH_LEN + this.PATH_LEN / 2

            const group = new THREE.Group()
            group.position.set(0, 0, z)

            // Main path surface
            const t = new THREE.Mesh(geo, mat); t.rotation.x = -Math.PI / 2
            t.position.set(0, -0.01, 0); t.receiveShadow = true
            group.add(t)
            // Raised stone borders
            const lb = new THREE.Mesh(borderGeo, borderMat); lb.position.set(-5.15, 0.15, 0); lb.castShadow = true; group.add(lb)
            const rb = new THREE.Mesh(borderGeo, borderMat); rb.position.set(5.15, 0.15, 0); rb.castShadow = true; group.add(rb)
            // Center engraving lines
            const cl = new THREE.Mesh(chanGeo, chanMat); cl.position.set(-2, 0.01, 0); group.add(cl)
            const cr = new THREE.Mesh(chanGeo, chanMat); cr.position.set(2, 0.01, 0); group.add(cr)
            // Random cracked stone slabs
            if (i % 3 === 0) {
                const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5 + Math.random(), 0.06, 1 + Math.random()), crackMat)
                slab.position.set((Math.random() - 0.5) * 6, 0.02, (Math.random() - 0.5) * 8)
                slab.rotation.y = Math.random() * 0.3; group.add(slab)
            }
            // Scattered pebbles/debris along edges
            for (let p = 0; p < 4; p++) {
                const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + Math.random() * 0.06, 0), crackMat)
                pebble.position.set(-4.5 + Math.random() * 9, 0.04, (Math.random() - 0.5) * this.PATH_LEN)
                group.add(pebble)
            }
            this.scene.add(group); this.tiles.push(group)
        }
    }

    // === WALLS (Layered Ancient Temple Walls) ===
    buildWalls() {
        const tex = this.stoneTexture('#6a5a4a', '#584838'); tex.repeat.set(2, 4)
        const mossTex = this.mossTexture(); mossTex.repeat.set(3, 6)
        const wGeo = new THREE.BoxGeometry(1.2, 4, this.PATH_LEN)
        const wMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05, color: 0x8a7a60 })
        // Moss overlay panels
        const mGeo = new THREE.PlaneGeometry(this.PATH_LEN, 1.5)
        const mMat = new THREE.MeshStandardMaterial({ map: mossTex, transparent: true, opacity: 0.6, color: 0x3a6a2a, side: THREE.DoubleSide })
        // Decorative gold tiles on walls
        const dGeo = new THREE.BoxGeometry(0.15, 0.5, 0.5)
        const dMat = new THREE.MeshStandardMaterial({ color: 0xc8a020, metalness: 0.8, roughness: 0.2, emissive: 0x886600, emissiveIntensity: 0.2 })
        // Cap stones on top of walls
        const capGeo = new THREE.BoxGeometry(1.6, 0.25, this.PATH_LEN)
        const capMat = new THREE.MeshStandardMaterial({ color: 0x7a6a50, roughness: 0.85 })
        // Carved face relief
        const faceMat = new THREE.MeshStandardMaterial({ color: 0x9a8a68, roughness: 0.8, metalness: 0.1 })
        // Ivy overgrowth
        const ivyMat = new THREE.MeshStandardMaterial({ color: 0x2a6a18, roughness: 0.85 })
        // Brick layers for crumbling top
        const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.92 })

        for (let i = 0; i < this.TILE_N; i++) {
            const z = -i * this.PATH_LEN + this.PATH_LEN / 2

            // Create groups for scrolling
            const lGroup = new THREE.Group()
            lGroup.position.set(0, 0, z)
            const rGroup = new THREE.Group()
            rGroup.position.set(0, 0, z)

            // Main wall bodies
            const lw = new THREE.Mesh(wGeo, wMat); lw.position.set(-5.6, 2, 0); lw.castShadow = true
            lGroup.add(lw)
            const rw = new THREE.Mesh(wGeo, wMat); rw.position.set(5.6, 2, 0); rw.castShadow = true
            rGroup.add(rw)

            // Cap stones on top
            const lCap = new THREE.Mesh(capGeo, capMat); lCap.position.set(-5.6, 4.12, 0); lGroup.add(lCap)
            const rCap = new THREE.Mesh(capGeo, capMat); rCap.position.set(5.6, 4.12, 0); rGroup.add(rCap)

            // Crumbling brick segments on top (random heights)
            for (let b = 0; b < 5; b++) {
                const bh = 0.2 + Math.random() * 0.6
                const localZ = -this.PATH_LEN / 2 + b * 4 + Math.random() * 2
                const brick = new THREE.Mesh(new THREE.BoxGeometry(1.0, bh, 0.8 + Math.random() * 0.5), brickMat)
                brick.position.set(-5.6, 4.35 + bh / 2, localZ); lGroup.add(brick)
                const brick2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, bh * 0.7, 0.6 + Math.random() * 0.5), brickMat)
                brick2.position.set(5.6, 4.35 + bh * 0.35, localZ + 1); rGroup.add(brick2)
            }

            // Moss on walls
            const lm = new THREE.Mesh(mGeo, mMat); lm.rotation.y = Math.PI / 2; lm.position.set(-4.95, 0.8, 0); lGroup.add(lm)
            const rm = new THREE.Mesh(mGeo, mMat); rm.rotation.y = -Math.PI / 2; rm.position.set(4.95, 0.8, 0); rGroup.add(rm)

            // Gold decoration tiles
            for (let j = 0; j < 6; j++) {
                const localZ = -this.PATH_LEN / 2 + j * 3.5 + 1
                const ld = new THREE.Mesh(dGeo, dMat); ld.position.set(-4.9, 2.8, localZ); lGroup.add(ld)
                const rd = new THREE.Mesh(dGeo, dMat); rd.position.set(4.9, 2.8, localZ); rGroup.add(rd)
            }

            // Carved face reliefs (every other tile)
            if (i % 2 === 0) {
                const localZ = -2
                // Left wall face
                const fHead = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), faceMat)
                fHead.position.set(-4.85, 2.2, localZ); fHead.scale.set(0.4, 1, 1); lGroup.add(fHead)
                const fNose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), faceMat)
                fNose.position.set(-4.75, 2.15, localZ); fNose.rotation.z = Math.PI / 2; lGroup.add(fNose)
                // Right wall face
                const fHead2 = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), faceMat)
                fHead2.position.set(4.85, 2.2, localZ + 5); fHead2.scale.set(0.4, 1, 1); rGroup.add(fHead2)
            }

            // Ivy overgrowth clusters
            for (let iv = 0; iv < 3; iv++) {
                const localZ = -this.PATH_LEN / 2 + iv * 7 + Math.random() * 3
                const ivySphere = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.4, 6, 5), ivyMat)
                ivySphere.position.set(-5.0 + Math.random() * 0.3, 3.2 + Math.random() * 1.2, localZ)
                ivySphere.scale.set(1.5, 0.8, 1); lGroup.add(ivySphere)

                if (iv % 2 === 0) {
                    const ivy2 = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 6, 5), ivyMat)
                    ivy2.position.set(5.0 - Math.random() * 0.3, 2.5 + Math.random() * 1.5, localZ + 2)
                    ivy2.scale.set(1.3, 0.7, 1); rGroup.add(ivy2)
                }
            }

            // Add groups to scene and arrays for scrolling
            this.scene.add(lGroup); this.lWalls.push(lGroup)
            this.scene.add(rGroup); this.rWalls.push(rGroup)
        }
    }

    // === ARCHWAYS (Grand Temple Gates) ===
    buildArchways() {
        const sMat = new THREE.MeshStandardMaterial({ color: 0x7a6a50, roughness: 0.85, metalness: 0.1 })
        const dMat = new THREE.MeshStandardMaterial({ color: 0xc8a020, metalness: 0.8, roughness: 0.2, emissive: 0x886600, emissiveIntensity: 0.15 })
        const carveMat = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 0.75, metalness: 0.15 })
        for (let i = 0; i < 5; i++) {
            const g = new THREE.Group()
            // Fluted pillars with base+capital
            for (const side of [-4.5, 4.5]) {
                // Pillar base (wider)
                const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.5, 8), sMat)
                base.position.set(side, 0.25, 0); base.castShadow = true; g.add(base)
                // Main column (fluted — octagonal)
                const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6, 8), sMat)
                col.position.set(side, 3.5, 0); col.castShadow = true; g.add(col)
                // Pillar capital (decorative wider top)
                const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 0.6, 8), sMat)
                cap.position.set(side, 6.8, 0); g.add(cap)
                // Carved ring bands on column
                for (const ry of [1.5, 3.5, 5.0]) {
                    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.04, 6, 12), carveMat)
                    ring.position.set(side, ry, 0); ring.rotation.x = Math.PI / 2; g.add(ring)
                }
            }
            // Top beam (wider, with step)
            const beam1 = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.8, 1.8), sMat)
            beam1.position.set(0, 7.3, 0); beam1.castShadow = true; g.add(beam1)
            const beam2 = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.4, 2.2), sMat)
            beam2.position.set(0, 7.9, 0); g.add(beam2)
            // Gold emblem
            const e = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), dMat)
            e.position.set(0, 8.4, 0); e.rotation.y = Math.PI / 4; g.add(e)
            // Skull decoration with glowing eyes
            const skMat = new THREE.MeshStandardMaterial({ color: 0xd4c8a0, roughness: 0.8 })
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), skMat)
            sk.position.set(0, 7.5, 1.0); sk.scale.set(1, 1.1, 0.8); g.add(sk)
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4400 })
            const le = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat)
            le.position.set(-0.12, 7.55, 1.25); g.add(le)
            const re = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat)
            re.position.set(0.12, 7.55, 1.25); g.add(re)
            // Carved sun disc on beam front
            const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), dMat)
            sunDisc.position.set(0, 7.3, 0.92); g.add(sunDisc)

            g.position.set(0, 0, -(40 + i * 60))
            this.scene.add(g); this.archways.push(g)
        }
    }

    // === BUILDINGS (Ancient Temple Ruins & Stepped Pyramids) ===
    buildBuildings() {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.9 })
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.92 })
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.85 })
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a020, metalness: 0.7, roughness: 0.3, emissive: 0x886600, emissiveIntensity: 0.15 })
        const ivyMat = new THREE.MeshStandardMaterial({ color: 0x2a5a18, roughness: 0.85 })
        const winMat = new THREE.MeshBasicMaterial({ color: 0x081008 })

        for (let i = 0; i < 12; i++) {
            const bld = new THREE.Group()
            const isTemple = i % 3 === 0

            if (isTemple) {
                // === STEPPED PYRAMID TEMPLE ===
                const baseW = 5 + Math.random() * 2, tiers = 3 + Math.floor(Math.random() * 2)
                let yOff = 0
                for (let t = 0; t < tiers; t++) {
                    const tw = baseW - t * 1.2, th = 1.8 + Math.random() * 0.5, td = baseW * 0.8 - t * 0.9
                    const tier = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), stoneMat)
                    tier.position.y = yOff + th / 2; tier.castShadow = true; bld.add(tier)
                    // Decorative ledge
                    const ledge = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.3, 0.15, td + 0.3), darkMat)
                    ledge.position.y = yOff + th; bld.add(ledge)
                    yOff += th
                }
                // Top shrine/peak
                const peak = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2, 4), roofMat)
                peak.position.y = yOff + 1; peak.rotation.y = Math.PI / 4; bld.add(peak)
                // Gold finial
                const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), goldMat)
                finial.position.y = yOff + 2.2; bld.add(finial)
                // Staircase on front face
                for (let s = 0; s < tiers; s++) {
                    const sw = 1.5, sh = 0.2, sd = 0.6
                    const stair = new THREE.Mesh(new THREE.BoxGeometry(sw, sh * (s + 1), sd), darkMat)
                    stair.position.set(0, sh * (s + 1) / 2, baseW * 0.4 - s * 0.45 + 0.5)
                    bld.add(stair)
                }
                // Doorway entrance
                const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.3), winMat)
                door.position.set(0, 0.9, baseW * 0.4 + 0.3); bld.add(door)
            } else {
                // === RUINED TOWER / TEMPLE BLOCK ===
                const w = 3 + Math.random() * 2.5, h = 5 + Math.random() * 4, d = 3 + Math.random() * 2
                const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat)
                body.position.y = h / 2; body.castShadow = true; bld.add(body)
                // Crumbling top — irregular blocks
                for (let c = 0; c < 4; c++) {
                    const ch = 0.3 + Math.random() * 0.8
                    const cBlock = new THREE.Mesh(new THREE.BoxGeometry(w * (0.4 + Math.random() * 0.4), ch, d * (0.3 + Math.random() * 0.4)), darkMat)
                    cBlock.position.set((Math.random() - 0.5) * w * 0.3, h + ch / 2, (Math.random() - 0.5) * d * 0.3)
                    bld.add(cBlock)
                }
                // Window holes
                for (let j = 0; j < 3; j++) {
                    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), winMat)
                    win.position.set(-w / 2 + 0.6 + j * (w / 3), h * 0.6, d / 2 + 0.05)
                    bld.add(win)
                }
                // Broken column nearby
                const colH = 2 + Math.random() * 2
                const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, colH, 6), stoneMat)
                col.position.set(w / 2 + 1, colH / 2, 0); col.castShadow = true; bld.add(col)
            }

            // Ivy/moss patches on all buildings
            for (let m = 0; m < 3; m++) {
                const ivy = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.5, 5, 4), ivyMat)
                ivy.position.set((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() > 0.5 ? 1 : -1) * 2)
                ivy.scale.set(1.4, 0.6, 1); bld.add(ivy)
            }

            const side = i % 2 === 0 ? -1 : 1
            bld.position.set(side * (10 + Math.random() * 5), 0, -(i * 28 + Math.random() * 12))
            this.scene.add(bld); this.buildings.push(bld)
        }
    }

    // === VINES ===
    buildVines() {
        const vMat = new THREE.MeshStandardMaterial({ color: 0x2a5a1a, roughness: 0.9 })
        for (let i = 0; i < 20; i++) {
            const vine = new THREE.Group()
            const len = 2 + Math.random() * 4
            for (let j = 0; j < Math.floor(len * 3); j++) {
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 4), vMat)
                seg.position.set(Math.sin(j * 0.5) * 0.15, -j * 0.35, Math.cos(j * 0.3) * 0.1)
                vine.add(seg)
                // Leaf
                if (j % 3 === 0) {
                    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), new THREE.MeshStandardMaterial({ color: 0x3a7a2a }))
                    leaf.position.copy(seg.position); leaf.position.x += 0.1; vine.add(leaf)
                }
            }
            const side = i % 2 === 0 ? -1 : 1
            vine.position.set(side * (5 + Math.random()), 6.5 + Math.random() * 2, -(i * 14 + Math.random() * 8))
            this.scene.add(vine); this.vines.push(vine)
        }
    }

    // === TREES (Detailed Jungle Trees) ===
    // === TREES (Detailed Jungle Trees & Custom Model Support) ===
    buildTrees() {
        this.trees = []
        const loader = new GLTFLoader()

        // 1. Attempt to load the user's custom tree.glb
        loader.load('/tree.glb', (gltf) => {
            console.log('[Relic Rush] Custom tree.glb loaded successfully!')
            const model = gltf.scene

            // Prepare the model shadows and basic materials
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                }
            })
            // Automatically scale the model to avoid huge/tiny Sketchfab exports
            const box = new THREE.Box3().setFromObject(model)
            const size = box.getSize(new THREE.Vector3())
            let baseScale = 1
            if (size.y > 0.001) {
                baseScale = 15 / size.y // Standardize the tree height to 15 game units
            }

            // 2. Clone and spawn 20 custom trees along the path
            for (let i = 0; i < 20; i++) {
                const tree = model.clone()
                const scalar = baseScale * (0.8 + Math.random() * 0.6)
                tree.scale.set(scalar, scalar, scalar)

                const side = i % 2 === 0 ? -1 : 1
                // 3. Push the trees far off the stone path so the giant branches don't hang into the track
                tree.position.set(side * (30 + Math.random() * 10), 0, -(i * 14 + Math.random() * 8))

                // Random Y rotation so identical models look unique
                tree.rotation.y = Math.random() * Math.PI * 2

                this.scene.add(tree)
                this.trees.push(tree)
            }
        }, undefined, (err) => {
            // 3. Fallback: If no tree.glb is present in the public folder, use the procedural defaults
            console.log('[Relic Rush] No custom tree.glb found in public/. Using default procedural trees.')
            this._generateProceduralTrees()
        })
    }

    _generateProceduralTrees() {
        const barkMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.95 })
        const darkBark = new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.95 })
        const fCols = [0x1a5a2a, 0x226a30, 0x185020, 0x2a7a38, 0x1a6a28]
        const mossMat = new THREE.MeshStandardMaterial({ color: 0x2a6a1a, roughness: 0.9 })

        for (let i = 0; i < 20; i++) {
            const tree = new THREE.Group()
            const isPalm = i % 5 === 0
            const scale = 0.8 + Math.random() * 0.6

            if (isPalm) {
                // Curved segmented trunk
                for (let s = 0; s < 8; s++) {
                    const r = 0.18 - s * 0.015
                    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.02, 1.2, 6), barkMat)
                    seg.position.set(Math.sin(s * 0.2) * 0.3, s * 1.1 + 0.6, 0)
                    seg.rotation.z = Math.sin(s * 0.3) * 0.08
                    seg.castShadow = true; tree.add(seg)
                }
                // Palm fronds
                const frondMat = new THREE.MeshStandardMaterial({ color: 0x2a7a20, roughness: 0.75, side: THREE.DoubleSide })
                for (let f = 0; f < 7; f++) {
                    const angle = (f / 7) * Math.PI * 2
                    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 3.5), frondMat)
                    frond.position.set(Math.sin(angle) * 1.2, 9.2, Math.cos(angle) * 1.2)
                    frond.rotation.set(-0.6 + Math.random() * 0.3, angle, Math.PI * 0.1)
                    tree.add(frond)
                }
                // Coconuts
                const coconutMat = new THREE.MeshStandardMaterial({ color: 0x5a4020, roughness: 0.8 })
                for (let c = 0; c < 3; c++) {
                    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), coconutMat)
                    nut.position.set(Math.sin(c * 2.1) * 0.3, 8.6, Math.cos(c * 2.1) * 0.3)
                    tree.add(nut)
                }
            } else {
                // Thick tapered trunk with twist
                const trunkH = 4 + Math.random() * 2
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, trunkH, 7), barkMat)
                trunk.position.y = trunkH / 2; trunk.castShadow = true; tree.add(trunk)
                // Buttress roots
                for (let r = 0; r < 4; r++) {
                    const angle = (r / 4) * Math.PI * 2 + Math.random() * 0.3
                    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.18, 1.8, 4), darkBark)
                    root.position.set(Math.sin(angle) * 0.4, 0.6, Math.cos(angle) * 0.4)
                    root.rotation.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5)
                    tree.add(root)
                }
                // Branch forks
                const branchMat = new THREE.MeshStandardMaterial({ color: 0x3a2815 })
                for (let b = 0; b < 3; b++) {
                    const ba = (b / 3) * Math.PI * 2 + i * 0.5
                    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.5, 5), branchMat)
                    branch.position.set(Math.sin(ba) * 0.8, trunkH + 0.5, Math.cos(ba) * 0.8)
                    branch.rotation.set(Math.cos(ba) * 0.6, 0, Math.sin(ba) * 0.6)
                    branch.castShadow = true; tree.add(branch)
                }
                // Multi-cluster foliage
                const fMat = new THREE.MeshStandardMaterial({ color: fCols[i % fCols.length], roughness: 0.8 })
                const clusters = [[0, trunkH + 2.2, 0, 2.2], [1.0, trunkH + 1.5, 0.8, 1.6], [-0.8, trunkH + 1.8, -0.5, 1.4], [0.3, trunkH + 3, 0.2, 1.3]]
                for (const [fx, fy, fz, fr] of clusters) {
                    const fol = new THREE.Mesh(new THREE.SphereGeometry(fr, 8, 6), fMat)
                    fol.position.set(fx, fy, fz); fol.scale.set(1.1, 0.65, 1.1); fol.castShadow = true; tree.add(fol)
                }
                // Hanging moss/vines from branches
                for (let v = 0; v < 4; v++) {
                    const vineLen = 1 + Math.random() * 2
                    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, vineLen, 3), mossMat)
                    vine.position.set((Math.random() - 0.5) * 2.5, trunkH + 1 - vineLen / 2, (Math.random() - 0.5) * 2)
                    tree.add(vine)
                }
            }

            tree.scale.set(scale, scale, scale)
            const side = i % 2 === 0 ? -1 : 1
            tree.position.set(side * (20 + Math.random() * 8), 0, -(i * 14 + Math.random() * 8))
            this.scene.add(tree)
            this.trees.push(tree)
        }
    }

    // === PLAYER (3D Animated Soldier Model) ===
    buildPlayer() {
        this.player = new THREE.Group()
        this.playerModelLoaded = false
        this.mixer = null
        this.animActions = {} // { idle, walk, run }
        this.currentAction = null
        this.previousAction = null

        // Placeholder references for collision animation compatibility
        this.lLeg = null
        this.rLeg = null
        this.lArm = null
        this.rArm = null
        this.torso = null
        this.headGroup = null
        this.scarfEnd = null
        this.soldierModel = null

        // SHIELD (invisible until powerup)
        this.shieldMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 16, 12),
            new THREE.MeshStandardMaterial({ color: 0x44aaff, transparent: true, opacity: 0, metalness: 0.8, roughness: 0.1 })
        )
        this.shieldMesh.position.y = 1
        this.player.add(this.shieldMesh)

        // Animation time tracker
        this.animTime = 0
        this.player.position.set(0, 0, 0)
        this.scene.add(this.player)

        // Load the 3D soldier model asynchronously
        this._loadSoldierModel()
    }

    _loadSoldierModel() {
        const loader = new GLTFLoader()
        loader.load('/Soldier.glb', (gltf) => {
            this.soldierModel = gltf.scene
            // Scale and position the model to match game proportions
            this.soldierModel.scale.set(1.35, 1.35, 1.35)
            this.soldierModel.position.y = 0
            // Face the model forward (running direction = -Z)
            this.soldierModel.rotation.y = 0

            // Enable shadows on all meshes
            this.soldierModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                    // Enhance material quality
                    if (child.material) {
                        child.material.roughness = Math.max(child.material.roughness, 0.3)
                        child.material.envMapIntensity = 0.6
                    }
                }
            })

            this.player.add(this.soldierModel)

            // Set up AnimationMixer
            this.mixer = new THREE.AnimationMixer(this.soldierModel)

            // Map animations by name
            const animations = gltf.animations
            for (const clip of animations) {
                const action = this.mixer.clipAction(clip)
                const name = clip.name.toLowerCase()
                if (name.includes('idle')) {
                    this.animActions.idle = action
                } else if (name.includes('walk')) {
                    this.animActions.walk = action
                } else if (name.includes('run')) {
                    this.animActions.run = action
                }
            }

            // Default to idle
            if (this.animActions.idle) {
                this.animActions.idle.play()
                this.currentAction = this.animActions.idle
            }

            this.playerModelLoaded = true
            console.log('[Relic Rush] Soldier model loaded with animations:', Object.keys(this.animActions))
        },
            (progress) => {
                // Loading progress
            },
            (error) => {
                console.error('[Relic Rush] Failed to load Soldier model:', error)
                // Fallback: build a simple placeholder if model fails
                this._buildFallbackPlayer()
            })
    }

    _buildFallbackPlayer() {
        // Simple colored capsule as fallback
        const mat = new THREE.MeshStandardMaterial({ color: 0xff6633, roughness: 0.5 })
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 8, 12), mat)
        body.position.y = 1; body.castShadow = true
        this.player.add(body)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), mat)
        head.position.y = 2; head.castShadow = true
        this.player.add(head)
        this.playerModelLoaded = true
    }

    // Crossfade to a new animation action smoothly
    _fadeToAction(actionName, duration = 0.25) {
        const newAction = this.animActions[actionName]
        if (!newAction || newAction === this.currentAction) return

        this.previousAction = this.currentAction
        this.currentAction = newAction

        if (this.previousAction) {
            this.previousAction.fadeOut(duration)
        }

        newAction
            .reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .fadeIn(duration)
            .play()
    }

    // === OBSTACLES (High Quality Jungle & Ruins) ===
    buildObstacles() {
        const rockPBR = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.95, metalness: 0.1 })
        const mossPBR = new THREE.MeshStandardMaterial({ color: 0x2a6a1a, roughness: 0.9 })
        const woodPBR = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.95 })
        const barkDark = new THREE.MeshStandardMaterial({ color: 0x2a1a08, roughness: 0.95 })
        const leafPBR = new THREE.MeshStandardMaterial({ color: 0x1a5a2a, roughness: 0.8 })
        const ruinPBR = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.9 })

        for (let i = 0; i < this.OBS_N; i++) {
            const roll = Math.random()
            let o
            if (roll > 0.6) {
                // === JUNGLE BOULDER CLUSTER (Block / Dodge) ===
                o = new THREE.Group(); o.userData.type = 'block'; o.userData.hh = 2.8
                // Main boulder (multi-faceted geometric)
                const mainGeo = new THREE.DodecahedronGeometry(1.4, 1)
                const mainRock = new THREE.Mesh(mainGeo, rockPBR)
                mainRock.scale.set(1.1, 0.9, 0.8); mainRock.position.y = 0.2; mainRock.castShadow = true; o.add(mainRock)
                // Side rocks to make it look like a cluster
                for (let r = 0; r < 3; r++) {
                    const sideRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + Math.random() * 0.4, 0), rockPBR)
                    sideRock.position.set((Math.random() - 0.5) * 1.5, -0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 1.2)
                    sideRock.rotation.set(Math.random(), Math.random(), Math.random()); sideRock.castShadow = true; o.add(sideRock)
                }
                // Heavy moss patches
                for (let m = 0; m < 5; m++) {
                    const mossPatch = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 6, 5), mossPBR)
                    mossPatch.position.set((Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2)
                    mossPatch.scale.set(1.3, 0.4, 1.1); o.add(mossPatch)
                }
                // Small plant growing on rock
                const plant = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 4), leafPBR)
                plant.position.set(0.6, 1.1, 0.3); plant.scale.set(1, 0.5, 1); o.add(plant)
            } else if (roll > 0.3) {
                // === RUINED TEMPLE ARCH / VINE OVERHANG (Overhead / Slide) ===
                o = new THREE.Group(); o.userData.type = 'overhead'; o.userData.hh = 3.5
                // Ancient stone header beam
                const beam = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.6, 1.2), ruinPBR)
                beam.position.y = 0.5; beam.castShadow = true; o.add(beam)
                const beamTop = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.2, 1.4), ruinPBR)
                beamTop.position.y = 0.9; beamTop.castShadow = true; o.add(beamTop)
                // Crumbling pillar bases holding the beam
                const lPill = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 1.0), ruinPBR)
                lPill.position.set(-1.8, -0.7, 0); o.add(lPill)
                const keyStone = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.3), ruinPBR)
                keyStone.position.y = 0.5; o.add(keyStone)
                // Massive hanging moss/vines
                for (let v = 0; v < 8; v++) {
                    const vH = 1.5 + Math.random() * 2
                    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, vH, 4), mossPBR)
                    vine.position.set(-1.8 + v * 0.5, -vH / 2 + 0.2, (Math.random() - 0.5) * 0.4)
                    vine.rotation.z = (Math.random() - 0.5) * 0.2
                    vine.castShadow = true; o.add(vine)
                }
            } else {
                // === FALLEN BANYAN TRUNK (Barrier / Jump) ===
                o = new THREE.Group(); o.userData.type = 'barrier'; o.userData.hh = 0.8
                // Thick, twisted main trunk (tapered)
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3.8, 8), woodPBR)
                trunk.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.1; trunk.castShadow = true; o.add(trunk)
                // Broken splintered ends
                const endL = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 6), barkDark)
                endL.position.x = -1.9; endL.rotation.z = Math.PI / 2; o.add(endL)
                const endR = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.0, 6), barkDark)
                endR.position.x = 1.9; endR.rotation.z = -Math.PI / 2; o.add(endR)
                // Broken upward branches
                for (let b = 0; b < 2; b++) {
                    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.2, 5), woodPBR)
                    br.position.set(-0.8 + b * 1.6, 0.5, (Math.random() - 0.5) * 0.4)
                    br.rotation.set((Math.random() - 0.5), 0, (Math.random() - 0.5))
                    br.castShadow = true; o.add(br)
                    // Leaves on branch
                    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.25, 5, 5), leafPBR)
                    lf.position.set(br.position.x, 1.0, br.position.z); lf.scale.set(1.5, 0.5, 1); o.add(lf)
                }
                // Moss layered on top of trunk
                const tMoss = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 0.5), mossPBR)
                tMoss.position.set(0, 0.42, 0); o.add(tMoss)
            }
            o.castShadow = true; o.receiveShadow = true
            // === SMART LANE PLACEMENT — never block all 3 lanes ===
            const baseZ = -(40 + i * 28 + Math.random() * 10)
            const lane = this._pickSafeLane(baseZ)
            const yPos = o.userData.type === 'overhead' ? 2.5 : o.userData.hh / 2
            o.position.set(lane * this.LANE_W, yPos, baseZ)
            o.userData.active = true; o.userData.lane = lane
            this.scene.add(o); this.obs.push(o)
        }
    }

    // Pick a lane that won't create a 3-lane wall with nearby obstacles
    _pickSafeLane(z) {
        const MIN_Z_GAP = 5 // obstacles within this Z range are "same row"
        const nearbyLanes = new Set()
        for (const o of this.obs) {
            if (Math.abs(o.position.z - z) < MIN_Z_GAP) {
                nearbyLanes.add(o.userData.lane)
            }
        }
        // If 2 lanes already taken nearby, force the third lane to be free
        if (nearbyLanes.size >= 2) {
            // Find which lane is free and place there? NO — we must leave it free
            // So pick one of the already-taken lanes to share
            const taken = [...nearbyLanes]
            return taken[Math.floor(Math.random() * taken.length)]
        }
        // Otherwise pick any lane
        return Math.floor(Math.random() * 3) - 1
    }

    // === COINS ===
    buildCoins() {
        const cGeo = new THREE.TorusGeometry(0.25, 0.08, 8, 16)
        const cMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1, emissive: 0xff8800, emissiveIntensity: 0.4 })
        // Add inner diamond
        const iGeo = new THREE.BoxGeometry(0.18, 0.18, 0.05)
        const iMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.5 })
        for (let i = 0; i < this.COIN_N; i++) {
            const g = new THREE.Group()
            const coin = new THREE.Mesh(cGeo, cMat); g.add(coin)
            const inner = new THREE.Mesh(iGeo, iMat); inner.rotation.z = Math.PI / 4; g.add(inner)
            const lane = Math.floor(Math.random() * 3) - 1
            g.position.set(lane * this.LANE_W, 1.3 + Math.random() * 0.3, -(15 + i * 7 + Math.random() * 4))
            g.rotation.x = Math.PI / 2; g.userData.active = true
            this.scene.add(g); this.coinArr.push(g)
        }
    }

    // === POWER-UPS ===
    buildPowerUps() {
        const types = ['shield', 'magnet'], cols = { shield: 0x44aaff, magnet: 0xff44aa }
        for (let i = 0; i < 4; i++) {
            const type = types[i % 2]
            const mat = new THREE.MeshStandardMaterial({ color: cols[type], metalness: 0.7, roughness: 0.2, emissive: cols[type], emissiveIntensity: 0.4, transparent: true, opacity: 0.9 })
            const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), mat)
            const lane = Math.floor(Math.random() * 3) - 1
            m.position.set(lane * this.LANE_W, 1.5, -(60 + i * 55 + Math.random() * 30))
            m.userData.type = type; m.userData.active = true
            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: cols[type], transparent: true, opacity: 0.15 }))
            m.add(glow); this.scene.add(m); this.pups.push(m)
        }
    }

    // === PARTICLES ===
    buildParticles() {
        const n = 120, pos = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 16
            pos[i * 3 + 1] = 0.5 + Math.random() * 10
            pos[i * 3 + 2] = (Math.random() - 0.5) * 100 - 30
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        const m = new THREE.PointsMaterial({ color: 0x88ffaa, size: 0.06, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
        this.particles = new THREE.Points(g, m); this.scene.add(this.particles)
    }

    // === PARACHUTE ===
    buildParachute() {
        if (this.parachuteMesh) { this.player.remove(this.parachuteMesh); this.parachuteMesh = null }
        const chute = new THREE.Group()
        // Canopy
        const canopyGeo = new THREE.SphereGeometry(1.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0xff4420, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        const canopy = new THREE.Mesh(canopyGeo, canopyMat); canopy.position.y = 3; chute.add(canopy)
        // Stripes
        const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.82, 12, 8, 0, Math.PI / 3, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }))
        stripe.position.y = 3; chute.add(stripe)
        // Strings
        const stringMat = new THREE.MeshBasicMaterial({ color: 0x444444 })
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2
            const sGeo = new THREE.CylinderGeometry(0.01, 0.01, 3, 3)
            const s = new THREE.Mesh(sGeo, stringMat)
            s.position.set(Math.sin(angle) * 0.8, 1.5, Math.cos(angle) * 0.8)
            s.rotation.z = Math.sin(angle) * 0.25; s.rotation.x = Math.cos(angle) * 0.25
            chute.add(s)
        }
        chute.position.y = 1.5
        this.player.add(chute)
        this.parachuteMesh = chute
    }

    removeParachute() {
        if (this.parachuteMesh) {
            this.player.remove(this.parachuteMesh)
            this.parachuteMesh = null
        }
    }

    // === CONTROLS ===
    start() {
        this.running = false; this.gameOver = false; this.score = 0; this.coins = 0
        this.speed = this.INIT_SPEED; this.curLane = 0; this.tgtLane = 0
        this.playerY = 25; this.jumpVel = 0; this.jumping = false
        this.dist = 0; this.level = 1; this.combo = 1; this.comboT = 0
        this.shieldOn = false; this.magnetOn = false
        this.collisionPhase = 'none'; this.collisionTimer = 0
        this.footstepTimer = 0; this.breathTimer = 0
        this.player.rotation.set(0, 0, 0); this.player.scale.set(1, 1, 1)
        this.player.position.set(0, 25, 0)
        // Reset soldier model rotation if loaded
        if (this.soldierModel) {
            this.soldierModel.rotation.set(0, 0, 0)
        }
        // Transition to idle animation when starting
        if (this.playerModelLoaded && this.animActions.idle) {
            this._fadeToAction('idle', 0.1)
        }
        // Start parachute intro
        this.introPhase = 'parachute'; this.introTimer = 0
        this.buildParachute()
        playParachuteWind()
        this.clock.start()
    }
    moveLeft() { if (!this.gameOver && this.introPhase === 'none' && this.tgtLane > -1) this.tgtLane-- }
    moveRight() { if (!this.gameOver && this.introPhase === 'none' && this.tgtLane < 1) this.tgtLane++ }
    jump() { if (!this.gameOver && this.introPhase === 'none' && !this.jumping) { this.jumping = true; this.jumpVel = this.JUMP_FORCE } }
    slide() { if (!this.gameOver && this.introPhase === 'none') { this.sliding = true; this.slideT = 0.6 } }
    endGame() { if (!this.gameOver) this.doGameOver() }

    // === UPDATE ===
    update(dt) {
        // Handle parachute intro
        if (this.introPhase === 'parachute') {
            this.introTimer += dt
            // Descend from sky
            this.playerY = Math.max(0, 25 - this.introTimer * 10)
            this.player.position.y = this.playerY
            this.player.position.x = Math.sin(this.introTimer * 1.5) * 0.5
            // Sway parachute
            if (this.parachuteMesh) {
                this.parachuteMesh.rotation.z = Math.sin(this.introTimer * 2) * 0.15
                this.parachuteMesh.rotation.x = Math.sin(this.introTimer * 1.3) * 0.1
            }
            if (this.playerY <= 0) {
                this.playerY = 0; this.player.position.y = 0
                this.player.position.x = 0
                this.introPhase = 'landing'; this.introTimer = 0
                this.removeParachute()
                playLanding()
            }
            // Update mixer during intro
            if (this.mixer) this.mixer.update(dt)
            this.renderer.render(this.scene, this.camera)
            return
        }
        if (this.introPhase === 'landing') {
            this.introTimer += dt
            // Brief crouched landing pose then stand up
            const t = this.introTimer
            this.player.scale.y = t < 0.3 ? 0.7 : Math.min(1, 0.7 + (t - 0.3) * 1.5)
            if (t > 0.8) {
                this.introPhase = 'none'
                this.player.scale.y = 1
                this.running = true
                startBgMusic()
                // Start run animation when gameplay begins
                if (this.playerModelLoaded) {
                    this._fadeToAction('run', 0.3)
                }
            }
            // Update mixer during landing
            if (this.mixer) this.mixer.update(dt)
            this.renderer.render(this.scene, this.camera)
            return
        }

        // Handle collision animation — model-based ragdoll
        if (this.collisionPhase !== 'none') {
            this.collisionTimer += dt
            if (this.collisionPhase === 'impact') {
                // Stop run animation, switch to idle (frozen)
                if (this.mixer && this.collisionTimer < 0.05) {
                    this._fadeToAction('idle', 0.1)
                    // Freeze the mixer to stop animation
                    if (this.currentAction) this.currentAction.paused = true
                }
                // Screen shake
                this.camera.position.x = (Math.random() - 0.5) * 0.4
                this.camera.position.y = 6.5 + (Math.random() - 0.5) * 0.3
                // Player stumbles backward
                this.player.position.z += dt * 5
                if (this.collisionTimer > 0.3) { this.collisionPhase = 'falling'; this.collisionTimer = 0; this.camera.position.x = 0 }
            } else if (this.collisionPhase === 'falling') {
                // Body falls forward using whole-player rotation
                const t = Math.min(this.collisionTimer / 0.5, 1)
                this.player.rotation.x = t * (Math.PI / 2 + 0.3)
                this.playerY = Math.max(-0.5, this.playerY - dt * 12)
                this.player.position.y = this.playerY
                if (this.collisionTimer > 0.5) { this.collisionPhase = 'lying'; this.collisionTimer = 0 }
            } else if (this.collisionPhase === 'lying') {
                // Lie flat on ground for 2 seconds
                this.player.rotation.x = Math.PI / 2 + 0.3
                this.player.position.y = -0.5
                // Camera slowly pulls back
                this.camera.position.y += (8 - this.camera.position.y) * dt * 0.5
                if (this.collisionTimer > 2) {
                    this.collisionPhase = 'none'
                    playGameOver()
                    if (this.callbacks.onGameOver) this.callbacks.onGameOver(this.score, this.coins)
                }
            }
            if (this.mixer) this.mixer.update(dt)
            this.renderer.render(this.scene, this.camera)
            return
        }

        if (!this.running || this.gameOver) return
        this.speed = Math.min(this.speed + this.SPEED_INC * dt, this.MAX_SPEED)
        const nl = Math.floor(this.dist / 500) + 1
        if (nl > this.level) { this.level = nl; this.speed = Math.min(this.speed + 2, this.MAX_SPEED) }
        const mv = this.speed * dt; this.dist += mv; this.score = Math.floor(this.dist)
        if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 1 }
        if (this.shieldOn) { this.shieldT -= dt; this.shieldMesh.material.opacity = 0.3 + Math.sin(Date.now() * 0.008) * 0.1; if (this.shieldT <= 0) { this.shieldOn = false; this.shieldMesh.material.opacity = 0 } }
        if (this.magnetOn) { this.magnetT -= dt; if (this.magnetT <= 0) this.magnetOn = false }

        // Player movement — INSTANT lane switching for responsive controls
        this.player.position.x += (this.tgtLane * this.LANE_W - this.player.position.x) * 12 * dt
        if (this.jumping) { this.playerY += this.jumpVel * dt; this.jumpVel -= this.GRAVITY * dt; if (this.playerY <= 0) { this.playerY = 0; this.jumping = false; this.jumpVel = 0 } }
        this.player.position.y = this.playerY
        if (this.sliding) { this.slideT -= dt; if (this.slideT <= 0) this.sliding = false }
        this.player.rotation.x += ((this.sliding ? 0.8 : 0) - this.player.rotation.x) * 20 * dt
        // Scale player down when sliding for visual feedback
        const slideScale = this.sliding ? 0.6 : 1.0
        this.player.scale.y += (slideScale - this.player.scale.y) * 15 * dt

        // === SMOOTH RUNNING ANIMATION (3D Model + AnimationMixer) ===
        this.animTime += dt * this.speed * 0.55

        if (this.playerModelLoaded && this.mixer) {
            // Sync animation speed with game speed for natural feel
            const speedRatio = this.speed / this.INIT_SPEED
            const animSpeed = Math.max(0.8, Math.min(speedRatio * 0.85, 2.2))
            if (this.currentAction) {
                this.currentAction.setEffectiveTimeScale(animSpeed)
            }

            // Decide which animation to play based on state
            if (this.sliding) {
                // When sliding, slow down animation and scale character down
                if (this.currentAction !== this.animActions.walk && this.animActions.walk) {
                    this._fadeToAction('walk', 0.15)
                }
                if (this.currentAction) this.currentAction.setEffectiveTimeScale(0.5)
            } else if (this.jumping) {
                // During jump, slow the run cycle slightly for "airborne" feel
                if (this.currentAction) this.currentAction.setEffectiveTimeScale(animSpeed * 0.6)
            } else {
                // Normal running — choose between walk and run based on speed
                if (this.speed < this.INIT_SPEED * 0.7 && this.animActions.walk) {
                    if (this.currentAction !== this.animActions.walk) {
                        this._fadeToAction('walk', 0.3)
                    }
                } else if (this.animActions.run) {
                    if (this.currentAction !== this.animActions.run) {
                        this._fadeToAction('run', 0.3)
                    }
                }
            }

            // Update the AnimationMixer
            this.mixer.update(dt)
        }

        // Sliding: scale player for visual feedback (model ducks down)
        if (this.sliding) {
            // Tilt the model forward to simulate a slide
            if (this.soldierModel) {
                this.soldierModel.rotation.x += (0.6 - this.soldierModel.rotation.x) * 12 * dt
            }
        } else {
            if (this.soldierModel) {
                this.soldierModel.rotation.x += (0 - this.soldierModel.rotation.x) * 10 * dt
            }
        }

        // Body lean into lane changes
        const laneOffset = this.tgtLane * this.LANE_W - this.player.position.x
        this.player.rotation.z += (laneOffset * -0.12 - this.player.rotation.z) * 8 * dt

        // Camera smooth follow
        const camTargetY = 6.5 + this.playerY * 0.3
        this.camera.position.y += (camTargetY - this.camera.position.y) * 4 * dt

        // Move world
        if (this.startLine) { this.startLine.position.z += mv }
        for (const t of this.tiles) { t.position.z += mv; if (t.position.z > this.PATH_LEN) t.position.z -= this.TILE_N * this.PATH_LEN }
        for (let i = 0; i < this.lWalls.length; i++) { this.lWalls[i].position.z += mv; this.rWalls[i].position.z += mv; if (this.lWalls[i].position.z > this.PATH_LEN) { this.lWalls[i].position.z -= this.TILE_N * this.PATH_LEN; this.rWalls[i].position.z -= this.TILE_N * this.PATH_LEN } }
        for (const wt of this.waterTiles) { wt.position.z += mv; if (wt.position.z > this.PATH_LEN * 2) wt.position.z -= this.TILE_N * this.PATH_LEN }
        for (const l of this.torches) { l.position.z += mv; l.intensity = 0.5 + Math.random() * 0.4; if (l.position.z > 12) l.position.z -= 140 }
        for (const a of this.archways) { a.position.z += mv; if (a.position.z > 15) a.position.z -= 300 }
        for (const b of this.buildings) { b.position.z += mv; if (b.position.z > 20) { b.position.z -= 300; b.position.x = (b.position.x > 0 ? 1 : -1) * (9 + Math.random() * 6) } }
        for (const v of this.vines) { v.position.z += mv; v.children.forEach((c, i2) => { c.rotation.z = Math.sin(Date.now() * 0.002 + i2) * 0.05 }); if (v.position.z > 15) v.position.z -= 280 }
        for (const t of this.trees) { t.position.z += mv; if (t.position.z > 20) { t.position.z -= 256; t.position.x = (t.position.x > 0 ? 1 : -1) * (30 + Math.random() * 10) } }

        // Particles
        if (this.particles) {
            const p = this.particles.geometry.attributes.position.array
            for (let i = 0; i < p.length; i += 3) { p[i + 2] += mv; p[i + 1] += dt * 0.2; if (p[i + 2] > 12) { p[i + 2] -= 120; p[i + 1] = 0.5 + Math.random() * 10; p[i] = (Math.random() - 0.5) * 16 } }
            this.particles.geometry.attributes.position.needsUpdate = true
        }

        // Obstacles
        for (const o of this.obs) {
            o.position.z += mv
            if (o.userData.active) {
                const dx = Math.abs(o.position.x - this.player.position.x), dz = Math.abs(o.position.z - this.player.position.z)
                if (dx < 0.9 && dz < 0.8) {
                    if (this.shieldOn) { this.shieldOn = false; this.shieldMesh.material.opacity = 0; o.userData.active = false; o.visible = false }
                    else if (o.userData.type === 'block') { this.doGameOver(); return }
                    else if (o.userData.type === 'barrier' && this.playerY < o.userData.hh * 0.7 && !this.sliding) { this.doGameOver(); return }
                    else if (o.userData.type === 'overhead' && !this.sliding && this.playerY < 1.5) { this.doGameOver(); return }
                }
            }
            if (o.position.z > 8) this.recycleObs(o)
        }

        // Coins
        for (const c of this.coinArr) {
            c.position.z += mv; c.rotation.y += 3 * dt; c.position.y = 1.3 + Math.sin(Date.now() * 0.003 + c.position.z) * 0.15
            if (this.magnetOn && c.userData.active) { const dx = c.position.x - this.player.position.x, dz = c.position.z - this.player.position.z; if (Math.sqrt(dx * dx + dz * dz) < 6) { c.position.x -= dx * 5 * dt; c.position.z -= dz * 5 * dt } }
            if (c.userData.active) { const dx = Math.abs(c.position.x - this.player.position.x), dz = Math.abs(c.position.z - this.player.position.z); if (dx < 1 && dz < 1) { c.userData.active = false; c.visible = false; this.combo = Math.min(this.combo + 0.5, 5); this.comboT = 2; this.coins++; this.score += Math.floor(15 * this.combo) } }
            if (c.position.z > 8) { c.position.z = -(50 + Math.random() * 50); c.position.x = (Math.floor(Math.random() * 3) - 1) * this.LANE_W; c.userData.active = true; c.visible = true }
        }

        // Power-ups
        for (const pu of this.pups) {
            pu.position.z += mv; pu.rotation.y += 2 * dt; pu.rotation.x += 1.5 * dt; pu.position.y = 1.5 + Math.sin(Date.now() * 0.004) * 0.3
            if (pu.userData.active) { const dx = Math.abs(pu.position.x - this.player.position.x), dz = Math.abs(pu.position.z - this.player.position.z); if (dx < 1.2 && dz < 1.2) { pu.userData.active = false; pu.visible = false; if (pu.userData.type === 'shield') { this.shieldOn = true; this.shieldT = 8; this.shieldMesh.material.opacity = 0.3 } else { this.magnetOn = true; this.magnetT = 6 }; if (this.callbacks.onPowerUp) this.callbacks.onPowerUp(pu.userData.type) } }
            if (pu.position.z > 8) { pu.position.z = -(100 + Math.random() * 60); pu.position.x = (Math.floor(Math.random() * 3) - 1) * this.LANE_W; pu.userData.active = true; pu.visible = true }
        }

        // Footstep sounds
        this.footstepTimer += dt
        if (this.footstepTimer > 0.3 && !this.jumping && !this.sliding) {
            this.footstepTimer = 0
            playFootstep()
        }

        // Breathing sound
        this.breathTimer += dt
        // Play deep breath on a regular cadence (every 1.8 seconds)
        if (this.breathTimer > 1.8) {
            this.breathTimer = 0
            playBreathing()
        }

        // Score callback
        if (this.callbacks.onScoreUpdate && Math.floor(this.dist) % 2 === 0) this.callbacks.onScoreUpdate(this.score, this.coins)
    }

    recycleObs(o) {
        const newZ = -(150 + Math.random() * 80)
        const lane = this._pickSafeLane(newZ)
        const yPos = o.userData.type === 'overhead' ? 2.2 : o.userData.hh / 2
        o.position.set(lane * this.LANE_W, yPos, newZ); o.userData.active = true; o.userData.lane = lane; o.visible = true
    }

    doGameOver() {
        this.gameOver = true; this.running = false
        stopBgMusic()
        playCollision()
        // Red flash
        const fg = new THREE.PlaneGeometry(100, 100)
        const fm = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthTest: false })
        const f = new THREE.Mesh(fg, fm); f.position.copy(this.camera.position); f.position.z -= 2; this.scene.add(f)
        const fade = () => { fm.opacity -= 0.015; if (fm.opacity > 0) requestAnimationFrame(fade); else { this.scene.remove(f); fg.dispose(); fm.dispose() } }
        fade()
        // Start collision animation — impact → fall → lie 4s → game over
        this.collisionPhase = 'impact'; this.collisionTimer = 0
    }

    animate() {
        this.animId = requestAnimationFrame(() => this.animate())
        const dt = Math.min(this.clock.getDelta(), 0.05)
        this.update(dt)
        // Only render in update during intro/collision phases, otherwise render here
        if (this.introPhase === 'none' && this.collisionPhase === 'none') {
            this.renderer.render(this.scene, this.camera)
        }
    }

    onResize() {
        const w = this.container.clientWidth, h = this.container.clientHeight
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h)
    }

    destroy() {
        cancelAnimationFrame(this.animId)
        window.removeEventListener('resize', this._resize)
        this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose() } })
        this.renderer.dispose()
        if (this.container.contains(this.renderer.domElement)) this.container.removeChild(this.renderer.domElement)
        this.tiles = []; this.obs = []; this.coinArr = []; this.lWalls = []; this.rWalls = []; this.pups = []; this.trees = []; this.archways = []; this.buildings = []; this.vines = []; this.waterTiles = []
    }
}
