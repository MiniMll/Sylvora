type StorageMap = Record<string, string>

function createLocalStorageMock(seed: StorageMap = {}) {
  const store: StorageMap = { ...seed }
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key]
    },
    dump() {
      return { ...store }
    },
  }
}

const localStorageMock = createLocalStorageMock({
  'sylvora-pos': JSON.stringify({ state: { items: [{ producto_id: 'legacy' }] } }),
})

Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  configurable: true,
})

let ok = 0
let fail = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    ok += 1
    console.log(`  ✓ ${name}`)
  } catch (e) {
    fail += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function main() {
  const { usePOSStore } = await import('../lib/store')

  console.log('\n[smoke-pos-cart-namespace] Verificando aislamiento del carrito POS...\n')

  await check('1. comercio A persiste en key namespaced y borra legacy global', () => {
  usePOSStore.getState().setComercioActivo('comercio-a')
  usePOSStore.getState().agregarItem({
    producto_id: 'producto-a',
    comercio_id: 'comercio-a',
    nombre: 'Producto A',
    precio_unitario: 100,
    cantidad: 1,
    codigo_barras: 'A',
    stock_disponible: 5,
  })

  const dump = localStorageMock.dump()
  assert(!dump['sylvora-pos'], 'la key global legacy sigue presente')
  assert(Boolean(dump['sylvora:pos-cart:comercio-a']), 'no se escribió la key del comercio A')
  })

  await check('2. comercio B no ve carrito de comercio A', () => {
  usePOSStore.getState().setComercioActivo('comercio-b')
  assert(usePOSStore.getState().items.length === 0, 'comercio B heredó items de comercio A')
  })

  await check('3. comercio A reaparece al volver a comercio A', () => {
  usePOSStore.getState().setComercioActivo('comercio-a')
  const items = usePOSStore.getState().items
  assert(items.length === 1, `esperaba 1 item, recibió ${items.length}`)
  assert(items[0].producto_id === 'producto-a', 'el item restaurado no es el esperado')
  })

  await check('4. validación bloquea item de otro comercio', () => {
  usePOSStore.setState({
    items: [{
      producto_id: 'producto-b',
      comercio_id: 'comercio-b',
      nombre: 'Producto B',
      precio_unitario: 50,
      cantidad: 1,
      subtotal: 50,
      codigo_barras: 'B',
    }],
  })
  assert(!usePOSStore.getState().carritoPerteneceAComercio('comercio-a'), 'validación no detectó mismatch')
  })

  await check('5. sync remueve productos inexistentes o de otro comercio', () => {
  usePOSStore.setState({
    comercioId: 'comercio-a',
    storageReady: true,
    items: [
      {
        producto_id: 'producto-a',
        comercio_id: 'comercio-a',
        nombre: 'Producto A',
        precio_unitario: 100,
        cantidad: 1,
        subtotal: 100,
        codigo_barras: 'A',
      },
      {
        producto_id: 'producto-b',
        comercio_id: 'comercio-b',
        nombre: 'Producto B',
        precio_unitario: 50,
        cantidad: 1,
        subtotal: 50,
        codigo_barras: 'B',
      },
    ],
  })
  const removidos = usePOSStore.getState().sincronizarStock({
    'producto-a': { stock_actual: 4, comercio_id: 'comercio-a' },
    'producto-b': { stock_actual: 4, comercio_id: 'comercio-b' },
  })
  assert(removidos === 1, `esperaba remover 1 item, removió ${removidos}`)
  assert(usePOSStore.getState().items.length === 1, 'quedó más de un item')
  assert(usePOSStore.getState().items[0].producto_id === 'producto-a', 'se removió el item incorrecto')
  })

  console.log(`\n[smoke-pos-cart-namespace] ${ok} OK / ${fail} FAIL\n`)
  if (fail > 0) process.exit(1)
}

void main()
