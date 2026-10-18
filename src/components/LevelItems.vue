<script setup lang="ts">
/**
 * Items: how often each one turns up on this level, and what the items are.
 *
 * This level: a × on every bonus item's chance (cherry, star, the pills,
 * hearts, the totem, and home-made ones).
 * Every level: tweaks to the stock items (how often, how long they stay on
 * the board, how long their effect runs, what a second one does while the
 * first still runs, how much fruit grows you), and home-made items: fruit
 * that grows, scores and heals, or power-ups that set off any mix of effects,
 * held for later or used at once.
 */
import { computed, ref } from 'vue'
import { FRUIT_GROW, HEART_PATH, POWER_KINDS, POWERS, type CustomId } from '../game'
import { COLORS, design, ITEM_RANGE, LEVEL_RANGE, newItem, SHAPES, type CustomItem, type Effect, type ItemTweak, type Stack } from '../design'
import AutoSlider from './AutoSlider.vue'
import PowerIcon from './PowerIcon.vue'

const props = defineProps<{ level: number }>()
const edit = computed(() => design.levels[props.level]!)

type StockId = 'apple' | 'cherry' | 'star' | 'heart' | 'totem' | (typeof POWER_KINDS)[number]
interface StockInfo { id: StockId; name: string; fruit: boolean; life: number; bars?: number; dropped: boolean }
const STOCK: StockInfo[] = [
  { id: 'apple', name: 'Apple', fruit: true, life: 0, dropped: false },
  { id: 'cherry', name: 'Cherries', fruit: true, life: 3, dropped: true },
  { id: 'star', name: 'Star', fruit: true, life: 2, dropped: true },
  ...POWER_KINDS.map((k) => ({ id: k, name: POWERS[k].name, fruit: false, life: 3, bars: POWERS[k].bars || undefined, dropped: true })),
  { id: 'heart', name: 'Heart', fruit: false, life: 2.5, dropped: true },
  { id: 'totem', name: 'Totem', fruit: false, life: 2, dropped: true },
]

/* ─── This level ─── */

const levelRate = (id: string) => edit.value.items?.[id] ?? 1
function setLevelRate(id: string, value: number | undefined) {
  const items = { ...(edit.value.items ?? {}) }
  if (value === undefined || value === 1) delete items[id]
  else items[id] = value
  if (Object.keys(items).length) edit.value.items = items
  else delete edit.value.items
}
const droppable = computed(() => [
  ...STOCK.filter((s) => s.dropped).map((s) => ({ id: s.id as string, name: s.name })),
  ...design.custom.map((c) => ({ id: c.id as string, name: c.name })),
])

/* ─── Stock items, every level ─── */

const open = ref<string | null>(null)
const tweak = (id: string): ItemTweak => design.items[id] ?? {}
function setTweak<K extends keyof ItemTweak>(id: string, key: K, value: ItemTweak[K] | undefined) {
  const next = { ...tweak(id) }
  if (value === undefined) delete next[key]
  else next[key] = value
  if (Object.keys(next).length) design.items[id] = next
  else delete design.items[id]
}

const STACKS: { value: Stack; name: string; hint: string }[] = [
  { value: 'extend', name: 'Add time', hint: 'a second one adds its time to what is left' },
  { value: 'refresh', name: 'Start over', hint: 'a second one starts the clock again' },
  { value: 'keep', name: 'No effect', hint: 'a second one does nothing while the first runs' },
]

/* ─── Home-made items ─── */

const EFFECTS: Effect[] = ['shield', 'double', 'slow', 'dash', 'magnet', 'ghost']
function add(kind: CustomItem['kind']) {
  const id = `c${design.nextItem++}`
  design.custom.push(newItem(id, kind))
  open.value = id
}
function remove(id: string) {
  design.custom = design.custom.filter((c) => c.id !== id)
  for (const l of design.levels) {
    if (l.items && id in l.items) {
      delete l.items[id]
      if (!Object.keys(l.items).length) delete l.items
    }
  }
}
function toggleEffect(c: CustomItem, e: Effect) {
  c.effects = c.effects.includes(e) ? c.effects.filter((x) => x !== e) : EFFECTS.filter((x) => x === e || c.effects.includes(x))
}
const fruitColor: Record<string, string> = { apple: 'var(--coral)', cherry: 'var(--rose)', star: 'var(--sun)' }
</script>

<template>
  <div class="items">
    <section>
      <h4>On level {{ level + 1 }}: how often</h4>
      <div class="grid">
        <AutoSlider
          v-for="i in droppable"
          :key="i.id"
          :name="i.name"
          :value="levelRate(i.id)"
          :own="edit.items?.[i.id] !== undefined"
          :range="LEVEL_RANGE.itemRate"
          :show="(v) => (v ? `×${v.toFixed(1)}` : 'never')"
          @set="setLevelRate(i.id, $event)"
        />
      </div>
    </section>

    <section>
      <h4>Stock items, every level</h4>
      <div class="list">
        <div v-for="s in STOCK" :key="s.id" class="item" :class="{ open: open === s.id, changed: design.items[s.id] }">
          <button class="item-head" :aria-expanded="open === s.id" @click="open = open === s.id ? null : s.id">
            <svg viewBox="-0.5 -0.5 1 1" width="22" height="22" aria-hidden="true">
              <path v-if="s.id === 'heart'" :d="HEART_PATH" transform="scale(0.12) translate(-3.5 -3)" fill="var(--coral)" />
              <circle v-else-if="s.fruit" r="0.34" :fill="fruitColor[s.id]" stroke="var(--ink)" stroke-width="0.06" />
              <PowerIcon v-else :kind="s.id as 'totem'" />
            </svg>
            <span class="item-name">{{ s.name }}</span>
            <span v-if="design.items[s.id]" class="dot" title="Changed"></span>
            <span class="caret">{{ open === s.id ? '−' : '+' }}</span>
          </button>
          <div v-if="open === s.id" class="item-body">
            <div class="grid">
              <AutoSlider
                v-if="s.dropped"
                name="How often" hint="every level"
                :value="tweak(s.id).rate ?? 1" :own="tweak(s.id).rate !== undefined"
                :range="ITEM_RANGE.rate" :show="(v) => (v ? `×${v.toFixed(1)}` : 'never')"
                @set="setTweak(s.id, 'rate', $event)"
              />
              <AutoSlider
                v-if="s.dropped"
                name="Stays" hint="on the board"
                :value="tweak(s.id).life ?? s.life" :own="tweak(s.id).life !== undefined"
                :range="ITEM_RANGE.life" :show="(v) => `${v} bars`"
                @set="setTweak(s.id, 'life', $event)"
              />
              <AutoSlider
                v-if="s.fruit"
                name="Grows" hint="cells"
                :value="tweak(s.id).grow ?? FRUIT_GROW[s.id as 'apple']" :own="tweak(s.id).grow !== undefined"
                :range="ITEM_RANGE.grow" :show="(v) => `+${v}`"
                @set="setTweak(s.id, 'grow', $event)"
              />
              <AutoSlider
                v-if="s.bars"
                name="Lasts" hint="the effect"
                :value="tweak(s.id).bars ?? s.bars" :own="tweak(s.id).bars !== undefined"
                :range="ITEM_RANGE.bars" :show="(v) => `${v} bars`"
                @set="setTweak(s.id, 'bars', $event)"
              />
            </div>
            <div v-if="s.bars" class="chips">
              <span class="label">Second one</span>
              <button
                v-for="o in STACKS"
                :key="o.value"
                class="chip"
                :title="o.hint"
                :class="{ on: (tweak(s.id).stack ?? 'extend') === o.value }"
                @click="setTweak(s.id, 'stack', o.value === 'extend' ? undefined : o.value)"
              >{{ o.name }}</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="head-row">
        <h4>Your items, every level</h4>
        <button class="tool" :disabled="design.custom.length >= 24" @click="add('fruit')">+ Fruit</button>
        <button class="tool" :disabled="design.custom.length >= 24" @click="add('power')">+ Power-up</button>
      </div>
      <p v-if="!design.custom.length" class="empty">Make a fruit that grows, scores or heals, or a power-up that mixes effects.</p>
      <div class="list">
        <div v-for="c in design.custom" :key="c.id" class="item" :class="{ open: open === c.id }">
          <button class="item-head" :aria-expanded="open === c.id" @click="open = open === c.id ? null : c.id">
            <svg viewBox="-0.5 -0.5 1 1" width="22" height="22" aria-hidden="true"><PowerIcon :kind="c.id as CustomId" /></svg>
            <span class="item-name">{{ c.name }}</span>
            <span class="kind">{{ c.kind === 'fruit' ? 'fruit' : 'power-up' }}</span>
            <span class="caret">{{ open === c.id ? '−' : '+' }}</span>
          </button>
          <div v-if="open === c.id" class="item-body">
            <div class="fields">
              <input v-model="c.name" class="text" maxlength="18" aria-label="Name" />
              <input v-model="c.blurb" class="text wide" maxlength="60" aria-label="What it does" placeholder="What it does" />
            </div>
            <div class="chips">
              <span class="label">Look</span>
              <button v-for="sh in SHAPES" :key="sh" class="chip icon" :class="{ on: c.shape === sh }" :aria-label="sh" @click="c.shape = sh">
                <svg viewBox="-0.5 -0.5 1 1" width="18" height="18"><PowerIcon v-if="c.shape === sh" :kind="c.id as CustomId" /><text v-else x="0" y="0.12" text-anchor="middle" font-size="0.36" fill="currentColor">{{ sh.slice(0, 3) }}</text></svg>
              </button>
              <button
                v-for="col in COLORS"
                :key="col"
                class="swatch"
                :class="{ on: c.color === col }"
                :style="{ background: col }"
                :aria-label="`Colour ${col}`"
                @click="c.color = col"
              ></button>
            </div>
            <div class="grid">
              <AutoSlider name="How often" hint="chance a bar" :value="c.rate" :own="true" fixed :range="ITEM_RANGE.customRate" :show="(v) => `${Math.round(v * 100)}%`" @set="c.rate = $event ?? 0.05" />
              <AutoSlider name="From level" :value="c.from" :own="true" fixed :range="ITEM_RANGE.from" :show="(v) => `${v + 1}`" @set="c.from = $event ?? 0" />
              <AutoSlider name="Stays" hint="on the board" :value="c.life" :own="true" fixed :range="ITEM_RANGE.life" :show="(v) => `${v} bars`" @set="c.life = $event ?? 3" />
              <template v-if="c.kind === 'fruit'">
                <AutoSlider name="Grows" hint="cells" :value="c.grow" :own="true" fixed :range="ITEM_RANGE.grow" :show="(v) => `+${v}`" @set="c.grow = $event ?? 0" />
                <AutoSlider name="Points" :value="c.points" :own="true" fixed :range="ITEM_RANGE.points" :show="(v) => `+${v}`" @set="c.points = $event ?? 0" />
                <AutoSlider name="Hearts" :value="c.hearts" :own="true" fixed :range="ITEM_RANGE.hearts" :show="(v) => `+${v}`" @set="c.hearts = $event ?? 0" />
              </template>
              <AutoSlider v-else name="Lasts" hint="the effects" :value="c.bars" :own="true" fixed :range="ITEM_RANGE.bars" :show="(v) => `${v} bars`" @set="c.bars = $event ?? 4" />
            </div>
            <template v-if="c.kind === 'power'">
              <div class="chips">
                <span class="label">Effects</span>
                <button v-for="e in EFFECTS" :key="e" class="chip" role="switch" :aria-checked="c.effects.includes(e)" :class="{ on: c.effects.includes(e) }" :title="POWERS[e].blurb" @click="toggleEffect(c, e)">
                  <svg viewBox="-0.5 -0.5 1 1" width="16" height="16"><PowerIcon :kind="e" /></svg>{{ POWERS[e].name }}
                </button>
              </div>
              <div class="chips">
                <span class="label">Second one</span>
                <button v-for="o in STACKS" :key="o.value" class="chip" :title="o.hint" :class="{ on: c.stack === o.value }" @click="c.stack = o.value">{{ o.name }}</button>
              </div>
              <div class="chips">
                <span class="label">On eating</span>
                <button class="chip" :class="{ on: c.hold }" @click="c.hold = true">Hold for later</button>
                <button class="chip" :class="{ on: !c.hold }" @click="c.hold = false">Use at once</button>
              </div>
            </template>
            <button class="tool danger" @click="remove(c.id)">Delete {{ c.name }}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.items { display: grid; gap: 1rem; }
section { display: grid; gap: 8px; }
h4 { margin: 0; font-size: 15px; font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.head-row { display: flex; align-items: center; gap: 6px; }
.head-row h4 { flex: 1; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 6px; }
.list { display: grid; gap: 6px; }
.item { border: 2px solid var(--border); border-radius: 10px; background: var(--bg-off); }
.item.open { border-color: #3A2F5A; }
.item-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  background: none;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: left;
}
.item-name { flex: 1; color: var(--text); }
.kind { font-size: 13px; color: var(--text-muted); }
.caret { font-family: var(--font-pixel); font-size: 10px; color: var(--text-muted); }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sun); }
.item-body { display: grid; gap: 8px; padding: 4px 10px 10px; }
.fields { display: flex; flex-wrap: wrap; gap: 6px; }
.text {
  flex: 1;
  min-width: 8rem;
  padding: 5px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-warm);
  color: var(--text);
  font: inherit;
  font-size: 17px;
}
.text.wide { flex: 2; }
.text:focus { outline: none; border-color: var(--mint); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.label { margin-right: 4px; font-size: 14px; text-transform: uppercase; color: var(--text-muted); }
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 14px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chip.icon { padding: 3px 5px; }
.chip.on { border-color: var(--sun); color: var(--text); }
.chip:hover { border-color: var(--sage); }
.swatch { width: 22px; height: 22px; border: 2px solid var(--ink); border-radius: 6px; }
.swatch.on { outline: 2px solid var(--text); outline-offset: 1px; }
.empty { margin: 0; font-size: 15px; color: var(--text-muted); }
.tool {
  padding: 5px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg-off);
  font-size: 15px;
  text-transform: uppercase;
  color: var(--text-dim);
  white-space: nowrap;
}
.tool:hover:not(:disabled) { border-color: var(--sage); color: var(--text); }
.tool:disabled { opacity: 0.4; cursor: default; }
.tool.danger { justify-self: start; }
.tool.danger:hover { border-color: var(--coral); color: var(--coral); }
.item-head:focus-visible, .chip:focus-visible, .swatch:focus-visible, .tool:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
</style>
