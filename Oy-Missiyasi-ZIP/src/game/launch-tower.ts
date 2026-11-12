import * as THREE from 'three'

export interface LaunchTower {
  group: THREE.Group
  update: (dt: number, stage: string, stageTimer: number) => void
  getRocketLiftY: () => number
  reset: () => void
  dispose: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function V3(x = 0, y = 0, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, y, z)
}

function mat(color: string, roughness = 0.65, metalness = 0.25): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  pos = V3(),
  parent?: THREE.Group,
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material)
  item.position.copy(pos)
  item.castShadow = castShadow
  item.receiveShadow = receiveShadow
  if (parent) parent.add(item)
  return item
}

function box(
  parent: THREE.Group,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...size), material, V3(...pos), parent, castShadow)
}

function createHazardStripeTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#22252a'
  ctx.fillRect(0, 0, size, size)

  ctx.fillStyle = '#e5a828'
  const stripeW = 20
  for (let x = -size; x < size * 2; x += stripeW * 2) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + stripeW, 0)
    ctx.lineTo(x + stripeW + size, size)
    ctx.lineTo(x + size, size)
    ctx.closePath()
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 1)
  return texture
}

export function createLaunchTower(): LaunchTower {
  // Main launch pad complex group centered at pad origin (0, 0, 0)
  const group = new THREE.Group()
  group.name = 'LaunchPadComplex'

  // Materials
  const towerSteel = mat('#b23b22', 0.68, 0.32)       // Saturn V / SLS Apollo reddish-orange
  const darkSteel = mat('#383f47', 0.72, 0.28)        // Heavy structural steel
  const greyMetal = mat('#7b8792', 0.55, 0.45)        // Galvanized structural steel
  const chromeMat = mat('#e8eff5', 0.12, 0.92)        // Hydraulic mirror chrome piston
  const hydroGreen = mat('#283630', 0.62, 0.38)       // Heavy industrial hydraulic cylinder barrel
  const catwalkMat = mat('#2c3238', 0.85, 0.15)       // Catwalk floor grating
  const railingMat = mat('#e2ab28', 0.5, 0.3)         // Safety yellow handrails
  const whiteRoomMat = mat('#e8ecef', 0.42, 0.18)     // Clean room insulated panels
  const pipeMat = mat('#c2ccd4', 0.4, 0.6)            // Stainless steel cryogenic pipes
  const clampPadMat = mat('#15171a', 0.95, 0.05)      // Neoprene vibration-damping clamp pads
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff2222' })

  const hazardTex = createHazardStripeTexture()
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.6,
    metalness: 0.2,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. VERTICAL UMBILICAL TOWER MAST (Offset at x = 4.6, Height 26m)
  // ═══════════════════════════════════════════════════════════════════════════
  const mastGroup = new THREE.Group()
  mastGroup.position.set(4.6, 0, 0)
  group.add(mastGroup)

  const towerH = 26
  const w = 2.8
  const halfW = w / 2

  // 4 Main corner vertical hollow structural steel columns
  const legSize = 0.28
  for (const lx of [-halfW, halfW]) {
    for (const lz of [-halfW, halfW]) {
      box(mastGroup, [legSize, towerH, legSize], [lx, towerH / 2, lz], towerSteel)
    }
  }

  // Enclosed internal elevator & service utility shaft
  box(mastGroup, [1.4, towerH, 1.4], [0.2, towerH / 2, 0], darkSteel)

  // Horizontal girders & diagonal X-braces across 9 tiers
  const tierCount = 9
  const tierH = towerH / tierCount
  for (let i = 1; i <= tierCount; i++) {
    const y = i * tierH
    // Perimeter horizontal box beams
    box(mastGroup, [w, 0.16, 0.16], [0, y, -halfW], towerSteel)
    box(mastGroup, [w, 0.16, 0.16], [0, y, halfW], towerSteel)
    box(mastGroup, [0.16, 0.16, w], [-halfW, y, 0], towerSteel)
    box(mastGroup, [0.16, 0.16, w], [halfW, y, 0], towerSteel)

    // Diagonal X-braces on sides
    if (i < tierCount) {
      const midY = y + tierH / 2
      const diagLen = Math.hypot(w, tierH)
      const angle = Math.atan2(tierH, w)

      const d1 = box(mastGroup, [0.12, 0.12, diagLen], [halfW, midY, 0], greyMetal)
      d1.rotation.x = angle
      const d2 = box(mastGroup, [0.12, 0.12, diagLen], [halfW, midY, 0], greyMetal)
      d2.rotation.x = -angle

      const d3 = box(mastGroup, [diagLen, 0.12, 0.12], [0, midY, halfW], greyMetal)
      d3.rotation.z = angle
      const d4 = box(mastGroup, [diagLen, 0.12, 0.12], [0, midY, halfW], greyMetal)
      d4.rotation.z = -angle
    }

    // Catwalk work platforms on levels 1, 3, 5, 6, 7
    if ([1, 3, 5, 6, 7].includes(i)) {
      box(mastGroup, [w + 0.8, 0.1, w + 0.6], [-0.4, y + 0.05, 0], catwalkMat)
      box(mastGroup, [w + 0.8, 0.9, 0.04], [-0.4, y + 0.5, halfW + 0.3], railingMat, false)
      box(mastGroup, [w + 0.8, 0.9, 0.04], [-0.4, y + 0.5, -halfW - 0.3], railingMat, false)
      box(mastGroup, [0.04, 0.9, w + 0.6], [halfW + 0.4, y + 0.5, 0], railingMat, false)
    }
  }

  // Heavy base anchor pedestals with hazard stripes
  for (const lx of [-halfW, halfW]) {
    for (const lz of [-halfW, halfW]) {
      box(mastGroup, [0.75, 0.5, 0.75], [lx, 0.25, lz], hazardMat)
    }
  }

  // Top Hammerhead Service Crane (Height 26m)
  const craneGroup = new THREE.Group()
  craneGroup.position.set(0, towerH, 0)
  mastGroup.add(craneGroup)

  mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.8, 16), darkSteel, V3(0, 0.4, 0), craneGroup)
  box(craneGroup, [1.4, 1.2, 1.8], [0.5, 1.4, 0], darkSteel)
  box(craneGroup, [1.2, 1.1, 1.6], [2.2, 1.4, 0], mat('#30353b', 0.8, 0.2))
  const boomLen = 7.5
  box(craneGroup, [boomLen, 0.45, 0.6], [-boomLen / 2 + 0.5, 1.8, 0], towerSteel)
  box(craneGroup, [0.03, 3.8, 0.03], [-boomLen + 1.2, 0.1, 0], pipeMat, false)
  mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 16), greyMetal, V3(-boomLen + 1.2, -1.8, 0), craneGroup, false)

  // Top aviation flashing beacon
  mesh(new THREE.SphereGeometry(0.25, 12, 8), beaconMat, V3(0, towerH + 2.4, 0), mastGroup, false, false)

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. TOWER ARTICULATED SWING ARMS (Umbilicals & Crew Access)
  // ═══════════════════════════════════════════════════════════════════════════
  interface SwingArmData {
    pivot: THREE.Group
    closedAngle: number
    openAngle: number
    currentAngle: number
    targetAngle: number
  }

  const swingArms: SwingArmData[] = []

  // ── ARM 1: Lower Booster Hold-Down Clamps & Umbilical (Elevation y = 2.6) ──
  const arm1Pivot = new THREE.Group()
  arm1Pivot.position.set(-halfW, 2.6, 0.75)
  mastGroup.add(arm1Pivot)

  const arm1Arm = new THREE.Group()
  arm1Pivot.add(arm1Arm)
  box(arm1Arm, [3.2, 0.45, 0.45], [-1.6, 0, -0.45], darkSteel)
  const strut1 = box(arm1Arm, [3.0, 0.12, 0.12], [-1.5, 0.45, -0.45], greyMetal)
  strut1.rotation.z = -0.15
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 12), pipeMat, V3(-0.7, 0.6, -0.2), arm1Arm)

  const jawGroup1 = new THREE.Group()
  jawGroup1.position.set(-3.2, 0, -0.75)
  arm1Arm.add(jawGroup1)
  box(jawGroup1, [0.35, 0.42, 2.9], [0, 0, 0], hazardMat)
  for (const jz of [-1.35, 1.35]) {
    box(jawGroup1, [0.8, 0.35, 0.22], [-0.35, 0, jz], darkSteel)
    box(jawGroup1, [0.18, 0.48, 0.4], [-0.05, 0, jz * 0.95], clampPadMat)
  }
  box(jawGroup1, [0.28, 0.28, 0.6], [0.15, 0, 0], pipeMat)

  swingArms.push({
    pivot: arm1Pivot,
    closedAngle: 0,
    openAngle: 1.25,
    currentAngle: 0,
    targetAngle: 0,
  })

  // ── ARM 2: Interstage Cryogenic Feed Arm (Elevation y = 10.2) ──
  const arm2Pivot = new THREE.Group()
  arm2Pivot.position.set(-halfW, 10.2, 0.75)
  mastGroup.add(arm2Pivot)

  const arm2Arm = new THREE.Group()
  arm2Pivot.add(arm2Arm)
  box(arm2Arm, [3.2, 0.35, 0.38], [-1.6, 0, -0.45], towerSteel)
  for (const pz of [-0.55, -0.35]) {
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 12), pipeMat, V3(-1.6, 0.22, pz), arm2Arm).rotation.z = Math.PI / 2
  }

  const jawGroup2 = new THREE.Group()
  jawGroup2.position.set(-3.2, 0, -0.75)
  arm2Arm.add(jawGroup2)
  box(jawGroup2, [0.3, 0.38, 2.6], [0, 0, 0], hazardMat)
  for (const jz of [-1.22, 1.22]) {
    box(jawGroup2, [0.65, 0.3, 0.2], [-0.28, 0, jz], darkSteel)
    box(jawGroup2, [0.16, 0.36, 0.35], [-0.05, 0, jz * 0.95], clampPadMat)
  }

  swingArms.push({
    pivot: arm2Pivot,
    closedAngle: 0,
    openAngle: 1.3,
    currentAngle: 0,
    targetAngle: 0,
  })

  // ── ARM 3: Crew Access Arm & White Room (Elevation y = 17.2) ──
  const arm3Pivot = new THREE.Group()
  arm3Pivot.position.set(-halfW, 17.2, 0.75)
  mastGroup.add(arm3Pivot)

  const arm3Arm = new THREE.Group()
  arm3Pivot.add(arm3Arm)
  box(arm3Arm, [3.1, 1.4, 1.2], [-1.55, 0.7, -0.45], darkSteel)
  for (const wx of [-0.8, -1.6, -2.4]) {
    box(arm3Arm, [0.45, 0.5, 0.04], [wx, 0.8, 0.16], mat('#0b1724', 0.2, 0.9), false)
  }

  const whiteRoom = new THREE.Group()
  whiteRoom.position.set(-3.2, 0, -0.75)
  arm3Arm.add(whiteRoom)
  box(whiteRoom, [1.5, 1.8, 1.6], [-0.55, 0.9, 0], whiteRoomMat)
  mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), clampPadMat, V3(-1.35, 0.9, 0), whiteRoom, false).rotation.z = Math.PI / 2
  box(whiteRoom, [1.52, 0.2, 1.62], [-0.55, 1.6, 0], mat('#1a4f8b', 0.5, 0.2), false)

  swingArms.push({
    pivot: arm3Pivot,
    closedAngle: 0,
    openAngle: 1.35,
    currentAngle: 0,
    targetAngle: 0,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. 3 MONUMENTAL HYDRAULIC TULIP SUPPORT GANTRIES ("TULPAN TUTQICHLARI")
  // ═══════════════════════════════════════════════════════════════════════════
  // Authentic Soyuz / Vostok heavy latticework hold-down gantries!
  // Arranged symmetrically in the 3 clear corridors between the 3 strap-on
  // boosters (43°, 156°, 291°) and clear of the umbilical tower mast (0°):
  //   - Front gantry facing camera (~94°)
  //   - Rear-left gantry (~214°)
  //   - Rear-right gantry (~334°)
  //
  // Kinematics (synchronized with countdown 6.5s):
  //   - Title: Lowered at Y = 0, tall truss jaws clamped firmly around rocket core waist.
  //   - T-6.5s .. T-4.1s (0.0..2.4s): Hydraulic lift pistons extend, hoisting the
  //     entire cradle platform & rocket vertically by +1.65m above the blast pit!
  //   - T-4.1s .. T-2.3s (2.4..4.2s): Held elevated at +1.65m during LOX venting.
  //   - T-2.3s .. T-0.6s (4.2..5.9s): Main engines ignite under full hold-down restraint!
  //   - T-0.6s .. T-0.0s (5.9..6.5s): Clamps snap release; counterweights swing all 3
  //     towering tulip lattice trusses wide open (72° outward petal bloom)!

  interface TulipArmData {
    rootGroup: THREE.Group
    liftGroup: THREE.Group
    pistonMesh: THREE.Mesh
    leverPivot: THREE.Group
    closedRotZ: number
    openRotZ: number
    currentRotZ: number
    targetRotZ: number
  }

  const tulipArms: TulipArmData[] = []
  const TULIP_ANGLES = [
    (94 * Math.PI) / 180,
    (214 * Math.PI) / 180,
    (334 * Math.PI) / 180,
  ]

  const MAX_LIFT_Y = 1.60
  let currentLiftY = 0.0
  let targetLiftY = 0.0

  // Synchronized central Hydraulic Launch Ring Cradle (hoists beneath rocket skirt)
  const cradleRingGroup = new THREE.Group()
  cradleRingGroup.name = 'HydraulicCradleRing'
  group.add(cradleRingGroup)

  const cradleRing = mesh(
    new THREE.TorusGeometry(2.15, 0.14, 10, 48),
    hazardMat,
    V3(0, 0.24, 0),
    cradleRingGroup,
  )
  cradleRing.rotation.x = Math.PI / 2
  const innerRingCollar = mesh(
    new THREE.TorusGeometry(1.42, 0.09, 8, 40),
    darkSteel,
    V3(0, 0.30, 0),
    cradleRingGroup,
  )
  innerRingCollar.rotation.x = Math.PI / 2

  for (let i = 0; i < TULIP_ANGLES.length; i++) {
    const angle = TULIP_ANGLES[i]!
    const root = new THREE.Group()
    root.name = `TulipSupportArm_${i + 1}`
    root.rotation.y = angle
    group.add(root)

    // Local frame inside root:
    // +X is radially outward from pad center; -X is radially inward toward rocket.
    const anchorX = 4.25

    // ── A. Concrete Blast Pedestal & Base Anchor (at radius 4.25m) ──
    box(root, [1.8, 0.65, 1.65], [anchorX, 0.32, 0], mat('#4e5760', 0.88, 0.14))
    box(root, [1.84, 0.12, 1.68], [anchorX, 0.68, 0], hazardMat)
    box(root, [1.45, 0.16, 1.35], [anchorX, 0.80, 0], darkSteel)
    for (const bz of [-0.52, 0, 0.52]) {
      for (const bx of [-0.56, 0.56]) {
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), greyMetal, V3(anchorX + bx, 0.92, bz), root)
      }
    }

    // Cushion stop bumpers behind gantry for open position
    box(root, [0.45, 1.35, 0.95], [anchorX + 0.72, 1.48, 0], darkSteel)
    box(root, [0.18, 0.52, 0.98], [anchorX + 0.52, 2.02, 0], clampPadMat)

    // ── B. Twin Heavy Industrial Vertical Hydraulic Cylinders ──
    const cylBaseX = anchorX - 0.22
    const cylinderBarrelH = 2.45
    for (const cz of [-0.36, 0.36]) {
      mesh(
        new THREE.CylinderGeometry(0.22, 0.25, cylinderBarrelH, 18),
        hydroGreen,
        V3(cylBaseX, 0.85 + cylinderBarrelH / 2, cz),
        root,
      )
      for (const cy of [1.15, 1.85, 2.55, 3.15]) {
        mesh(new THREE.TorusGeometry(0.255, 0.032, 8, 22), darkSteel, V3(cylBaseX, cy, cz), root).rotation.x = Math.PI / 2
      }
      mesh(new THREE.CylinderGeometry(0.045, 0.045, cylinderBarrelH + 0.3, 10), pipeMat, V3(cylBaseX + 0.24, 0.85 + cylinderBarrelH / 2, cz), root)
    }

    // ── C. Elevating Hydraulic Pistons & Lift Carriage (moves vertically 0 -> +1.65m) ──
    const liftGroup = new THREE.Group()
    liftGroup.position.set(0, 0, 0)
    root.add(liftGroup)

    // Tie-beam lifting the circular cradle ring together with the carriage
    box(liftGroup, [2.05, 0.24, 0.36], [anchorX - 1.1, 0.24, 0], hazardMat)
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 12), chromeMat, V3(cylBaseX - 0.5, 1.45, 0), liftGroup)

    let primaryPiston!: THREE.Mesh
    for (const cz of [-0.36, 0.36]) {
      const pRod = mesh(
        new THREE.CylinderGeometry(0.145, 0.145, 2.8, 18),
        chromeMat,
        V3(cylBaseX, 2.05, cz),
        liftGroup,
      )
      if (cz < 0) primaryPiston = pRod
      mesh(new THREE.TorusGeometry(0.165, 0.035, 8, 20), greyMetal, V3(cylBaseX, 3.25, cz), liftGroup).rotation.x = Math.PI / 2
    }

    // Heavy forged Lift Carriage Saddle at top of pistons (y = 3.45)
    box(liftGroup, [0.95, 0.55, 1.25], [cylBaseX, 3.45, 0], darkSteel)
    box(liftGroup, [0.98, 0.14, 1.28], [cylBaseX, 3.75, 0], hazardMat)

    // ── D. Monumental Inclined Tulip Lattice Gantry Boom & Counterweight ("Tulpan") ──
    const pivotY = 3.55
    const targetX = 1.28
    const targetY = 8.20
    const dx = targetX - cylBaseX
    const dy = targetY - pivotY
    const boomLen = Math.hypot(dx, dy)
    const boomAngle = Math.atan2(dy, dx)

    const leverPivot = new THREE.Group()
    leverPivot.position.set(cylBaseX, pivotY, 0)
    liftGroup.add(leverPivot)

    mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.45, 16), greyMetal, V3(0, 0, 0), leverPivot).rotation.x = Math.PI / 2

    const leverArm = new THREE.Group()
    leverPivot.add(leverArm)

    // 1. Rear Lower Counterweight Boom & Massive Cast Ballast Block
    const cwPivotGroup = new THREE.Group()
    cwPivotGroup.rotation.z = -0.35
    leverArm.add(cwPivotGroup)

    box(cwPivotGroup, [1.85, 0.42, 0.78], [0.95, 0, 0], darkSteel)
    box(cwPivotGroup, [1.15, 0.98, 1.10], [1.75, -0.05, 0], mat('#1f242a', 0.82, 0.2))
    box(cwPivotGroup, [1.18, 1.00, 0.16], [1.75, -0.05, 0.56], hazardMat)
    box(cwPivotGroup, [1.18, 1.00, 0.16], [1.75, -0.05, -0.56], hazardMat)
    for (const hx of [1.45, 2.05]) {
      mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 16), railingMat, V3(hx, 0.52, 0), cwPivotGroup)
    }

    // 2. Monumental Inclined Space-Truss Gantry Arm reaching up to rocket waist!
    const trussFrame = new THREE.Group()
    trussFrame.rotation.z = boomAngle
    leverArm.add(trussFrame)

    const chordSpreadZ = 0.36
    const chordThicknessY = 0.24
    for (const cz of [-chordSpreadZ, chordSpreadZ]) {
      box(trussFrame, [boomLen, 0.18, 0.14], [boomLen / 2, chordThicknessY, cz], towerSteel)
      box(trussFrame, [boomLen, 0.16, 0.14], [boomLen / 2, -chordThicknessY, cz], darkSteel)
    }

    const bayCount = 5
    const bayLen = boomLen / bayCount
    for (let b = 0; b < bayCount; b++) {
      const bxMid = (b + 0.5) * bayLen
      const braceH = chordThicknessY * 2
      const braceDiag = Math.hypot(bayLen, braceH)
      const braceAng = Math.atan2(braceH, bayLen)
      for (const cz of [-chordSpreadZ, chordSpreadZ]) {
        const dA = box(trussFrame, [braceDiag, 0.08, 0.08], [bxMid, 0, cz], railingMat)
        dA.rotation.z = braceAng
        const dB = box(trussFrame, [braceDiag, 0.08, 0.08], [bxMid, 0, cz], greyMetal)
        dB.rotation.z = -braceAng
      }
      box(trussFrame, [0.12, 0.52, 0.82], [(b + 1) * bayLen, 0, 0], darkSteel)
    }

    mesh(new THREE.CylinderGeometry(0.055, 0.055, boomLen * 0.92, 10), pipeMat, V3(boomLen / 2, 0.32, 0), trussFrame).rotation.z = Math.PI / 2

    // 3. Precision Rocket-Hugging Clamp Jaw Head at tip (boomLen)
    const jawHead = new THREE.Group()
    jawHead.position.set(boomLen, 0, 0)
    jawHead.rotation.z = -boomAngle
    trussFrame.add(jawHead)

    box(jawHead, [0.58, 0.95, 1.05], [0.24, 0, 0], darkSteel)
    box(jawHead, [0.12, 0.98, 1.08], [0.54, 0, 0], hazardMat)
    box(jawHead, [0.64, 0.24, 1.10], [0.22, 0.52, 0], towerSteel)

    for (const jz of [-0.52, 0.52]) {
      const finger = box(jawHead, [0.55, 0.65, 0.20], [-0.14, 0, jz], darkSteel)
      finger.rotation.y = jz > 0 ? -0.32 : 0.32
      box(jawHead, [0.18, 0.72, 0.24], [-0.24, 0, jz * 0.86], clampPadMat)
    }

    tulipArms.push({
      rootGroup: root,
      liftGroup,
      pistonMesh: primaryPiston,
      leverPivot,
      closedRotZ: 0.0,
      openRotZ: -1.25, // 72 degrees monumental petal bloom open away from rocket!
      currentRotZ: 0.0,
      targetRotZ: 0.0,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CONTROLLER UPDATE & LIFTOFF SEQUENCING
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    group,

    getRocketLiftY() {
      return currentLiftY
    },

    reset() {
      currentLiftY = 0.0
      targetLiftY = 0.0
      cradleRingGroup.position.y = 0.0
      for (const arm of tulipArms) {
        arm.currentRotZ = arm.closedRotZ
        arm.targetRotZ = arm.closedRotZ
        arm.leverPivot.rotation.z = arm.closedRotZ
        arm.liftGroup.position.y = 0.0
      }
      for (const arm of swingArms) {
        arm.currentAngle = arm.closedAngle
        arm.targetAngle = arm.closedAngle
        arm.pivot.rotation.y = arm.closedAngle
      }
    },

    update(dt: number, stage: string, stageTimer: number) {
      // 1. Red flashing aviation beacon on top crane
      const flash = Math.sin(stageTimer * 4.5) > 0.15 ? 1 : 0.04
      beaconMat.color.setRGB(flash, 0.02, 0.02)

      // 2. Authentic Countdown Lift -> Cryo Venting -> Ignition Restraint -> Bloom Release:
      if (stage === 'title') {
        targetLiftY = 0.0
        for (const arm of tulipArms) arm.targetRotZ = arm.closedRotZ
        for (const arm of swingArms) arm.targetAngle = arm.closedAngle
      } else if (stage === 'countdown') {
        // Phase A (0.0 .. 2.4s): Hydraulic rams elevate the 3-gantry cradle + rocket by +1.65m!
        if (stageTimer < 2.4) {
          const t = stageTimer / 2.4
          const smoothLift = t * t * (3 - 2 * t)
          targetLiftY = smoothLift * MAX_LIFT_Y
        } else {
          targetLiftY = MAX_LIFT_Y
        }

        // Phase B: Umbilical tower arms retract sequentially
        swingArms[2]!.targetAngle = stageTimer >= 3.0 ? swingArms[2]!.openAngle : swingArms[2]!.closedAngle
        swingArms[1]!.targetAngle = stageTimer >= 4.5 ? swingArms[1]!.openAngle : swingArms[1]!.closedAngle
        swingArms[0]!.targetAngle = stageTimer >= 5.9 ? swingArms[0]!.openAngle : swingArms[0]!.closedAngle

        // Phase C: 3 Giant Tulip Truss Petals hold rocket down during ignition, then open 72°!
        const tulipOpen = stageTimer >= 5.9
        for (const arm of tulipArms) {
          arm.targetRotZ = tulipOpen ? arm.openRotZ : arm.closedRotZ
        }
      } else if (stage === 'launch') {
        targetLiftY = MAX_LIFT_Y
        for (const arm of tulipArms) arm.targetRotZ = arm.openRotZ
        for (const arm of swingArms) arm.targetAngle = arm.openAngle
      }

      currentLiftY = THREE.MathUtils.damp(currentLiftY, targetLiftY, 5.2, dt)
      cradleRingGroup.position.y = currentLiftY

      for (const arm of tulipArms) {
        arm.liftGroup.position.y = currentLiftY
        arm.currentRotZ = THREE.MathUtils.damp(arm.currentRotZ, arm.targetRotZ, 4.5, dt)
        arm.leverPivot.rotation.z = arm.currentRotZ
      }

      for (const arm of swingArms) {
        arm.currentAngle = THREE.MathUtils.damp(arm.currentAngle, arm.targetAngle, 3.2, dt)
        arm.pivot.rotation.y = arm.currentAngle
      }
    },

    dispose() {
      hazardTex.dispose()
    },
  }
}
