// ================= IMPORTS =================
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalBlock } = goals
const mcDataLoader = require('minecraft-data')
const { Vec3 } = require('vec3')
const express = require('express')
const path = require('path')
const { mineflayer: viewer } = require('prismarine-viewer')

// ================= CONFIG =================
const LAN_PORT = 6767
const WEB_PORT = 3000
const COMMAND_PREFIX = '\\'
const CROPS = {
  wheat:       { maxAge: 7, seed: 'wheat_seeds',    product: 'wheat' },
  carrots:     { maxAge: 7, seed: 'carrot',         product: 'carrot' },
  potatoes:    { maxAge: 7, seed: 'potato',         product: 'potato' },
  beetroots:   { maxAge: 3, seed: 'beetroot_seeds', product: 'beetroot' },
}

// ================= BOT =================
const bot = mineflayer.createBot({
  host: 'localhost',
  port: LAN_PORT,
  username: 'nigabot'
})

bot.loadPlugin(pathfinder)

// ================= STATE =================
let currentTask = null // follow | farm | branchmine | setorechest | setseedchest | setcropchest
let taskTimeouts = [] // Track all timeouts for proper cleanup
let followInterval = null // Track follow interval separately

let farmState = 'IDLE' // IDLE | FARMING | DEPOSITING
let seedChest = null
let cropChest = null

// Branch mining state
let oreChest = null
let miningStartPos = null
let oresCollected = 0
let branchDirection = 0 // 0=north, 1=east, 2=south, 3=west
let tunnelLength = 0
const BRANCH_LENGTH = 16
const BRANCH_SPACING = 3
const ORE_TYPES = ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore', 'lapis_ore', 'redstone_ore', 'copper_ore', 'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_gold_ore', 'deepslate_diamond_ore', 'deepslate_emerald_ore', 'deepslate_lapis_ore', 'deepslate_redstone_ore', 'deepslate_copper_ore']

// ================= SPAWN =================
bot.once('spawn', () => {
  console.log('🤖 Bot joined the world')
  bot.chat('🤖 Hi I am online!')
  viewer(bot, {
  port: 3001,
  firstPerson: true,
  viewDistance: 4,
  renderEntities: false,
  lighting: false
})

})

// ================= MOVEMENT SETUP =================
function setupMovements () {
  const mcData = mcDataLoader(bot.version)
  const movements = new Movements(bot, mcData)
  bot.pathfinder.setMovements(movements)
}

// ================= TASK CLEANUP =================
function cancelAllTasks() {
  // Clear all timeouts
  taskTimeouts.forEach(timeout => clearTimeout(timeout))
  taskTimeouts = []
  
  // Clear follow interval
  if (followInterval) {
    clearInterval(followInterval)
    followInterval = null
  }
  
  // Stop pathfinding
  bot.pathfinder.setGoal(null)
  bot.clearControlStates()
  
  currentTask = null
  farmState = 'IDLE'
  
  // Reset branch mining state
  miningStartPos = null
  oresCollected = 0
  branchDirection = 0
  tunnelLength = 0
}

// ================= HELPERS =================
function countCrops () {
  return bot.inventory.items().reduce((sum, item) => {
    if (CROPS[item.name]) return sum + item.count
    return sum
  }, 0)
}

function hasEnoughCrops () {
  return countCrops() >= 64
}

function hasSeed (cropName) {
  const seed = CROPS[cropName].seed
  return bot.inventory.items().some(i => i.name === seed)
}

function countOres() {
  return bot.inventory.items().reduce((sum, item) => {
    if (ORE_TYPES.includes(item.name)) {
      return sum + item.count
    }
    return sum
  }, 0)
}

function needsToDeposit() {
  // Check if we have 64+ ores
  if (countOres() >= 64) return true
  
  // Check if health is critical (below 6 hearts)
  if (bot.health <= 12) return true
  
  // Check if tools are broken/low durability
  const tool = bot.inventory.items().find(i => 
    i.name.includes('pickaxe') && bot.heldItem?.name === i.name
  )
  
  // If no pickaxe equipped or durability info not available, continue
  if (!tool || !tool.durabilityUsed || !tool.maxDurability) return false
  
  const durabilityLeft = tool.maxDurability - tool.durabilityUsed
  return durabilityLeft <= 10
}

async function openChestAt (pos) {
  let reached = false

  // Try all 4 horizontal sides
  const offsets = [
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1)
  ]

  for (const offset of offsets) {
    const target = pos.plus(offset)
    const block = bot.blockAt(target)
    if (!block || block.boundingBox !== 'empty') continue

    try {
      await bot.pathfinder.goto(
        new GoalBlock(target.x, target.y, target.z)
      )
      reached = true
      break
    } catch {
      // try next side
    }
  }

  if (!reached) {
    throw new Error('CHEST_UNREACHABLE')
  }

  const chestBlock = bot.blockAt(pos)
  if (!chestBlock) {
    throw new Error('CHEST_MISSING')
  }

  return bot.openChest(chestBlock)
}



// ================= MAIN COMMAND HANDLER =================
async function handleCommand (rawCommand, source = 'unknown') {
  if (!rawCommand) return null

  const command = rawCommand.toLowerCase().trim()
  console.log(`[${source}] → ${command}`)
  setupMovements()

  // ---------- STOP ----------
  if (command === 'stop') {
    cancelAllTasks()
    return '🛑 Stopped'
  }

  // ---------- FOLLOW ----------
  if (command === 'follow' || command.startsWith('follow ')) {
    let targetPlayer = null
    
    if (command.startsWith('follow ')) {
    const targetUsername = command.split(' ')[1]
    targetPlayer = bot.players[targetUsername]?.entity
    
    if (!targetPlayer) {
      return `❌ Player '${targetUsername}' not found`
    }
  } else {
    targetPlayer = bot.nearestEntity(
      e => e.type === 'player' && e.username !== bot.username
    )
    
    if (!targetPlayer) return '❌ No player nearby'
  }

    cancelAllTasks()
    currentTask = 'follow'
    
    const followingUsername = targetPlayer.username
    
    // Update follow goal continuously
    followInterval = setInterval(() => {
      if (currentTask !== 'follow') {
        clearInterval(followInterval)
        return
      }
      
      const target = bot.players[followingUsername]?.entity
      
      if (target) {
        bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true)
      }
    }, 1000)
    
    return `👣 Following ${followingUsername}`
  }

  // ---------- FARM ----------
  if (command === 'farm') {
    currentTask = 'farm'
    bot.chat('🌾 Farming started')
    farmProperly()
    return
  }

  // ================= SET SEED CHEST =================
  if (command === 'setseedchest') {
    bot.chat('Place the seed chest near me...')
    await bot.waitForTicks(40)

    const chest = bot.findBlock({
      matching: b => b.name.includes('chest'),
      maxDistance: 10
    })

    if (!chest) return bot.chat('❌ Stand next to a chest')
    seedChest = chest.position.clone()
    bot.chat('🌱 Seed chest set')
    return
  }

  // ================= SET PRODUCT CHEST =================
  if (command === 'setcropchest') {
    bot.chat('Place the crop chest near me...')
    await bot.waitForTicks(40)

    const chest = bot.findBlock({
      matching: b => b.name.includes('chest'),
      maxDistance: 10
    })

    if (!chest) return bot.chat('❌ Stand next to a chest')
    cropChest = chest.position.clone()
    bot.chat('📦 Crop chest set')
    return
  }

  // ================= SET ORE CHEST =================
  if (command === 'setorechest') {
    bot.chat('Place the ore chest near me...')
    await bot.waitForTicks(40)

    const chest = bot.findBlock({
      matching: b => b.name.includes('chest'),
      maxDistance: 10
    })

    if (!chest) return bot.chat('❌ Stand next to a chest')
    oreChest = chest.position.clone()
    bot.chat('⛏️ Ore chest set')
    return
  }

  // ================= BRANCH MINE =================
  if (command === 'branchmine') {
    if (!oreChest) {
      return '❌ Set ore chest first with \\setorechest'
    }
    
    cancelAllTasks()
    currentTask = 'branchmine'
    miningStartPos = bot.entity.position.clone()
    oresCollected = 0
    branchDirection = 0
    tunnelLength = 0
    
    bot.chat('⛏️ Starting branch mining...')
    branchMine()
    return
  }

  // ---------- HELP ----------
  if (command === 'help') {
    return `COMMANDS:\n${COMMAND_PREFIX}help | ${COMMAND_PREFIX}follow | ${COMMAND_PREFIX}stop | ${COMMAND_PREFIX}farm | ${COMMAND_PREFIX}setcropchest| ${COMMAND_PREFIX}setseedchest | ${COMMAND_PREFIX}branchmine | ${COMMAND_PREFIX}setorechest`
  }

  return null
}

// ================= FARM LOGIC =================
async function farmProperly () {
  if (currentTask !== 'farm') return

  const mcData = mcDataLoader(bot.version)
  const movements = new Movements(bot, mcData)
  bot.pathfinder.setMovements(movements)

  const crop = bot.findBlock({
    matching: b => {
      const cfg = CROPS[b.name]
      return cfg && b.metadata === cfg.maxAge
    },
    maxDistance: 32
  })

  if (!crop) {
    setTimeout(farmProperly, 2000)
    return
  }

  try {
    await bot.pathfinder.goto(
      new GoalBlock(crop.position.x, crop.position.y, crop.position.z, 3)
    )

    await bot.pathfinder.goto(
      new GoalBlock(crop.position.x, crop.position.y, crop.position.z)
    )

    await bot.dig(crop)
    await bot.waitForTicks(10)

    const cfg = CROPS[crop.name]
    const seedItem = bot.inventory.items().find(i => i.name === cfg.seed)

    if (!seedItem || seedItem.count < 1) {
      throw new Error('No seed for replanting')
    }

    const soil = bot.blockAt(crop.position.offset(0, -1, 0))
    await bot.equip(seedItem, 'hand')
    await bot.waitForTicks(2)
    await bot.placeBlock(soil, new Vec3(0, 1, 0))

    await depositFarmItems(cfg)
    bot.chat('🌱 Harvested, replanted & stored')
  } catch (err) {
    console.log('Farming error:', err.message)
  }

  setTimeout(farmProperly, 1500)
}

async function goNextToChest (pos) {
  const offsets = [
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1)
  ]

  for (const off of offsets) {
    const target = pos.plus(off)
    const block = bot.blockAt(target)

    if (block && block.boundingBox === 'empty') {
      await bot.pathfinder.goto(
        new GoalBlock(target.x, target.y, target.z)
      )
      return
    }
  }

  throw new Error('No walkable spot near chest')
}

async function depositFarmItems (cfg) {
  try {
    // ===== PRODUCTS =====
    if (cropChest) {
      const productItem = bot.inventory.items().find(i => i.name === cfg.product)

      if (productItem) {
        const keep = cfg.seed === cfg.product ? 16 : 0

        if (productItem.count > keep) {
          await goNextToChest(cropChest)

          const chestBlock = bot.blockAt(cropChest)
          if (!chestBlock) throw new Error('Crop chest missing')

          const chest = await bot.openChest(chestBlock)
          await chest.deposit(
            productItem.type,
            null,
            productItem.count - keep
          )
          chest.close()
          await bot.waitForTicks(10)
        }
      }
    }

    // ===== SEEDS =====
    if (seedChest && cfg.seed !== cfg.product) {
      const seedItem = bot.inventory.items().find(i => i.name === cfg.seed)

      if (seedItem && seedItem.count > 64) {
        await goNextToChest(seedChest)

        const chestBlock = bot.blockAt(seedChest)
        if (!chestBlock) throw new Error('Seed chest missing')

        const chest = await bot.openChest(chestBlock)
        await chest.deposit(
          seedItem.type,
          null,
          seedItem.count - 16
        )
        chest.close()
        await bot.waitForTicks(10)
      }
    }
  } catch (err) {
    console.log('Deposit error:', err.message)
  }
}

// ================= BRANCH MINING =================
async function branchMine() {
  if (currentTask !== 'branchmine') return

  try {
    // Check if we need to deposit
    if (needsToDeposit()) {
      const oreCount = countOres()
      const reason = bot.health <= 12 ? 'low health' : 
                     oreCount >= 64 ? '64+ ores' : 'tool breaking'
      
      bot.chat(`📦 Depositing (${reason})...`)
      await depositOres()
      
      // Return to mining position
      if (miningStartPos) {
        await bot.pathfinder.goto(
          new GoalBlock(
            Math.floor(miningStartPos.x),
            Math.floor(miningStartPos.y),
            Math.floor(miningStartPos.z)
          )
        )
      }
      
      bot.chat('⛏️ Resuming mining...')
    }

    // Mine the current 3x3 section
    await mineSection()
    
    // Move forward 1 block in current direction
    await moveForward()
    tunnelLength++

    // Check if we completed a branch
    if (tunnelLength >= BRANCH_LENGTH) {
      branchDirection = (branchDirection + 1) % 4
      tunnelLength = 0
      
      // Move to next branch starting position
      await moveToNextBranch()
      bot.chat(`↪️ Starting new branch (direction ${branchDirection})`)
    }

    // Continue mining
    const timeout = setTimeout(() => branchMine(), 500)
    taskTimeouts.push(timeout)

  } catch (err) {
    console.log('Branch mining error:', err.message)
    bot.chat(`❌ Mining error: ${err.message}`)
    
    const timeout = setTimeout(() => branchMine(), 2000)
    taskTimeouts.push(timeout)
  }
}

async function mineSection() {
  const pos = bot.entity.position
  const offsets = [
    // Current level
    new Vec3(0, 0, 0),
    new Vec3(0, 1, 0),
    new Vec3(0, 2, 0),
    // Left and right walls
    new Vec3(-1, 0, 0),
    new Vec3(-1, 1, 0),
    new Vec3(1, 0, 0),
    new Vec3(1, 1, 0),
  ]

  for (const offset of offsets) {
    const blockPos = pos.offset(offset.x, offset.y, offset.z).floor()
    const block = bot.blockAt(blockPos)
    
    if (!block || block.name === 'air' || block.name === 'cave_air') continue
    
    // Don't mine bedrock
    if (block.name === 'bedrock') continue
    
    try {
      await bot.dig(block)
      await bot.waitForTicks(2)
      
      // Track ores
      if (ORE_TYPES.includes(block.name)) {
        oresCollected++
        bot.chat(`💎 Found ${block.name}! (Total ores: ${countOres()})`)
      }
    } catch (err) {
      // Block might have been already mined or is unbreakable
      if (!err.message.includes('digging aborted')) {
        console.log(`Couldn't mine ${block.name}:`, err.message)
      }
    }
  }
}

async function moveForward() {
  const directions = [
    new Vec3(0, 0, -1),  // North (negative Z)
    new Vec3(1, 0, 0),   // East (positive X)
    new Vec3(0, 0, 1),   // South (positive Z)
    new Vec3(-1, 0, 0),  // West (negative X)
  ]
  
  const dir = directions[branchDirection]
  const currentPos = bot.entity.position
  const targetPos = currentPos.offset(dir.x, dir.y, dir.z).floor()
  
  await bot.pathfinder.goto(
    new GoalBlock(targetPos.x, targetPos.y, targetPos.z)
  )
}

async function moveToNextBranch() {
  // After completing a branch, move back to start position
  // Then offset by BRANCH_SPACING blocks perpendicular to last direction
  
  if (!miningStartPos) return
  
  // Go back to start
  await bot.pathfinder.goto(
    new GoalBlock(
      Math.floor(miningStartPos.x),
      Math.floor(miningStartPos.y),
      Math.floor(miningStartPos.z)
    )
  )
  
  // Calculate perpendicular offset based on direction
  const offsets = [
    new Vec3(BRANCH_SPACING, 0, 0),   // North -> move East
    new Vec3(0, 0, BRANCH_SPACING),   // East -> move South
    new Vec3(-BRANCH_SPACING, 0, 0),  // South -> move West
    new Vec3(0, 0, -BRANCH_SPACING),  // West -> move North
  ]
  
  const offset = offsets[branchDirection]
  miningStartPos = miningStartPos.offset(offset.x, offset.y, offset.z)
  
  await bot.pathfinder.goto(
    new GoalBlock(
      Math.floor(miningStartPos.x),
      Math.floor(miningStartPos.y),
      Math.floor(miningStartPos.z)
    )
  )
}

async function depositOres() {
  if (!oreChest) {
    bot.chat('❌ No ore chest set!')
    return
  }

  try {
    // Go to chest
    await goNextToChest(oreChest)

    const chestBlock = bot.blockAt(oreChest)
    if (!chestBlock) throw new Error('Ore chest missing')

    const chest = await bot.openChest(chestBlock)
    
    // Deposit all ores
    for (const item of bot.inventory.items()) {
      if (ORE_TYPES.includes(item.name)) {
        await chest.deposit(item.type, null, item.count)
        await bot.waitForTicks(5)
      }
    }
    
    chest.close()
    await bot.waitForTicks(10)
    
    bot.chat(`✅ Deposited ores (Total collected: ${oresCollected})`)
    
  } catch (err) {
    bot.chat(`❌ Deposit error: ${err.message}`)
    console.log('Deposit error:', err)
  }
}

// ================= CHAT COMMANDS =================
bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  if (!message.startsWith(COMMAND_PREFIX)) return

  const command = message.slice(COMMAND_PREFIX.length).trim()
  const response = await handleCommand(command, 'chat')
  if (response) bot.chat(response)
})

// ================= WEB SERVER =================
const app = express()
app.use(express.json())

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.get('/mc-bg.mp4', (req, res) => {
  res.sendFile(path.join(__dirname, 'mc-bg.mp4'))
})

app.post('/command', async (req, res) => {
  try {
    const result = await handleCommand(req.body.command, 'web')
    res.json({ status: result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/bot-state', (req, res) => {
  try {
    const position = bot.entity ? bot.entity.position : { x: 0, y: 0, z: 0 }
    const health = bot.health || 0
    const food = bot.food || 0
    const xp = bot.experience ? Math.floor(bot.experience.points) : 0
    
    // Get hotbar (slots 36-44) and main inventory (slots 9-35)
    const hotbar = []
    const mainInventory = []
    
    // Debug: Log all items in inventory
    const allItems = bot.inventory.items()
    // if (allItems.length > 0) {
    //   console.log('=== INVENTORY DEBUG ===')
    //   allItems.forEach(item => {
    //     console.log(`Slot ${item.slot}: ${item.name} x${item.count}`)
    //   })
    // }
    
    // Hotbar: slots 36-44 (9 slots)
    for (let i = 36; i <= 44; i++) {
      const item = bot.inventory.slots[i]
      if (item) {
        hotbar.push({
          name: item.displayName || item.name,
          count: item.count
        })
      } else {
        hotbar.push(null)
      }
    }
    
    // Main inventory: slots 9-35 (27 slots = 9x3)
    for (let i = 9; i <= 35; i++) {
      const item = bot.inventory.slots[i]
      if (item) {
        mainInventory.push({
          name: item.displayName || item.name,
          count: item.count
        })
      } else {
        mainInventory.push(null)
      }
    }
    
    res.json({
      health,
      food,
      xp,
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      currentTask: currentTask || 'IDLE',
      hotbar,
      mainInventory,
      debug: {
        totalItems: allItems.length,
        allSlots: allItems.map(i => ({ slot: i.slot, name: i.name, count: i.count }))
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(WEB_PORT, '0.0.0.0', () => {
  console.log(`🌐 Web UI running on LAN at port ${WEB_PORT}`)
})

// ================= TERMINAL CONTROL (OPTIONAL) =================
process.stdin.on('data', async data => {
  const cmd = data.toString().trim()
  const result = await handleCommand(cmd, 'terminal')
  console.log(result)
})

// ================= ERRORS =================
bot.on('error', err => console.log('Bot error:', err))
bot.on('kicked', reason => console.log('Bot kicked:', reason))

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  cancelAllTasks()
  bot.quit()
  process.exit(0)
})
