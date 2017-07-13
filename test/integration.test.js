require('./setup')
const assert = require('assert')
const deepEqual = require('deep-equal')
const Buffer = require('./helpers/buffer')
const Editor = require('./helpers/editor')
const FakePortalDelegate = require('./helpers/fake-portal-delegate')
const Client = require('../lib/real-time-client')
const PusherPubSubGateway = require('../lib/pusher-pub-sub-gateway')
const {startTestServer} = require('@atom/real-time-server')

suite('Client Integration', () => {
  let server, portals, conditionErrorMessage

  suiteSetup(async () => {
    const params = {databaseURL: process.env.TEST_DATABASE_URL}
    // Uncomment and provide credentials to test against Pusher.
    // params.pusherCredentials = {
    //   appId: '123',
    //   key: '123',
    //   secret: '123'
    // }
    server = await startTestServer(params)
  })

  suiteTeardown(() => {
    return server.stop()
  })

  setup(() => {
    conditionErrorMessage = null
    portals = []
    return server.reset()
  })

  teardown(async () => {
    if (conditionErrorMessage) {
      console.error('Condition failed with error message: ', conditionErrorMessage)
    }

    for (const portal of portals) {
      await portal.dispose()
    }
  })

  test.only('sharing a portal and performing basic collaboration with a guest', async () => {
    const host = await buildClient()
    const guest = await buildClient()

    const hostPortal = await host.createPortal()

    let hostSetTextCallCount = 0
    const hostBuffer = new Buffer('hello world', {didSetText: () => hostSetTextCallCount++})
    // const hostSharedBuffer = await hostPortal.createSharedBuffer({uri: 'uri-1', text: hostBuffer.text})
    // hostSharedBuffer.setDelegate(hostBuffer)
    // assert.equal(hostSetTextCallCount, 0)

    // const hostSharedEditor = await hostPortal.createSharedEditor({
    //   sharedBuffer: hostSharedBuffer,
    //   selectionRanges: {
    //     1: {start: {row: 0, column: 0}, end: {row: 0, column: 5}},
    //     2: {start: {row: 0, column: 6}, end: {row: 0, column: 11}}
    //   }
    // })
    // const hostEditor = new Editor()
    // hostSharedEditor.setDelegate(hostEditor)
    // assert(!hostEditor.markerLayerForSiteId(1))
    // await hostPortal.setActiveSharedEditor(hostSharedEditor)

    const guestPortalDelegate = new FakePortalDelegate()
    const guestPortal = await guest.joinPortal(hostPortal.id)
    // guestPortal.setDelegate(guestPortalDelegate)

    return

    const guestEditor = new Editor()
    const guestSharedEditor = guestPortalDelegate.getActiveSharedEditor()
    guestSharedEditor.setDelegate(guestEditor)
    assert.deepEqual(guestEditor.markerLayerForSiteId(1), {
      1: {start: {row: 0, column: 0}, end: {row: 0, column: 5}},
      2: {start: {row: 0, column: 6}, end: {row: 0, column: 11}}
    })

    const guestBuffer = new Buffer()
    const guestSharedBuffer = guestSharedEditor.sharedBuffer
    guestSharedBuffer.setDelegate(guestBuffer)
    assert.equal(guestSharedBuffer.uri, 'uri-1')
    assert.equal(guestBuffer.getText(), 'hello world')

    hostSharedBuffer.apply(hostBuffer.insert({row: 0, column: 5}, ' cruel'))
    guestSharedBuffer.apply(guestBuffer.delete({row: 0, column: 0}, {row: 0, column: 5}))
    guestSharedBuffer.apply(guestBuffer.insert({row: 0, column: 0}, 'goodbye'))

    await condition(() => hostBuffer.text === 'goodbye cruel world')
    await condition(() => guestBuffer.text === 'goodbye cruel world')

    hostSharedEditor.setSelectionRanges({
      1: {start: {row: 0, column: 6}, end: {row: 0, column: 11}}
    })
    guestSharedEditor.setSelectionRanges({
      1: {start: {row: 0, column: 2}, end: {row: 0, column: 4}},
      2: {start: {row: 0, column: 6}, end: {row: 0, column: 8}}
    })
    await condition(() => {
      return (
        deepEqual(guestEditor.markerLayerForSiteId(1), {1: {start: {row: 0, column: 6}, end: {row: 0, column: 11}}}) &&
        deepEqual(hostEditor.markerLayerForSiteId(2), {1: {start: {row: 0, column: 2}, end: {row: 0, column: 4}},
          2: {start: {row: 0, column: 6}, end: {row: 0, column: 8}}
        })
      )
    })
  })

  test('switching a portal\'s active editor', async () => {
    const host = buildClient()
    const guest = buildClient()

    const hostPortal = await host.createPortal()
    const hostSharedBuffer1 = await hostPortal.createSharedBuffer({uri: 'buffer-a', text: ''})
    const hostSharedEditor1 = await hostPortal.createSharedEditor({
      sharedBuffer: hostSharedBuffer1,
      selectionRanges: {}
    })
    await hostPortal.setActiveSharedEditor(hostSharedEditor1)

    const guestPortalDelegate = new FakePortalDelegate()
    const guestPortal = await guest.joinPortal(hostPortal.id)
    guestPortal.setDelegate(guestPortalDelegate)
    assert.equal(guestPortalDelegate.getActiveBufferURI(), 'buffer-a')

    const hostSharedBuffer2 = await hostPortal.createSharedBuffer({uri: 'buffer-b', text: ''})
    const hostSharedEditor2 = await hostPortal.createSharedEditor({
      sharedBuffer: hostSharedBuffer2,
      selectionRanges: {}
    })
    await hostPortal.setActiveSharedEditor(hostSharedEditor2)
    await condition(() => guestPortalDelegate.getActiveBufferURI() === 'buffer-b')

    await hostPortal.setActiveSharedEditor(hostSharedEditor1)
    await condition(() => guestPortalDelegate.getActiveBufferURI() === 'buffer-a')
  })

  test('closing a portal\'s active editor', async () => {
    const host = buildClient()
    const guest = buildClient()

    const hostPortal = await host.createPortal()
    const hostSharedBuffer = await hostPortal.createSharedBuffer({uri: 'some-buffer', text: ''})
    const hostSharedEditor = await hostPortal.createSharedEditor({
      sharedBuffer: hostSharedBuffer,
      selectionRanges: {}
    })

    const guestPortalDelegate = new FakePortalDelegate()
    const guestPortal = await guest.joinPortal(hostPortal.id)
    guestPortal.setDelegate(guestPortalDelegate)
    assert(guestPortalDelegate.getActiveSharedEditor() === null)

    await hostPortal.setActiveSharedEditor(hostSharedEditor)
    await condition(() => guestPortalDelegate.getActiveSharedEditor() != null)
    assert.equal(guestPortalDelegate.getActiveBufferURI(), 'some-buffer')

    await hostPortal.setActiveSharedEditor(null)
    await condition(() => guestPortalDelegate.getActiveSharedEditor() == null)

    await hostPortal.setActiveSharedEditor(hostSharedEditor)
    await condition(() => guestPortalDelegate.getActiveSharedEditor() != null)
    assert.equal(guestPortalDelegate.getActiveBufferURI(), 'some-buffer')
  })

  suite('heartbeat', () => {
    const HEARTBEAT_INTERVAL_IN_MS = 10
    const EVICTION_PERIOD_IN_MS = 2 * HEARTBEAT_INTERVAL_IN_MS

    let hostPortal, hostEditor
    let guest1Portal, guest1PortalDelegate, guest1Editor
    let guest2Portal, guest2PortalDelegate, guest2Editor
    let guest3Portal, guest3PortalDelegate, guest3Editor

    suiteSetup(() => {
      server.heartbeatService.setEvictionPeriod(EVICTION_PERIOD_IN_MS)
    })

    setup(async () => {
      const host = buildClient({heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
      hostPortal = await host.createPortal()

      const guest1 = buildClient({heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
      guest1PortalDelegate = new FakePortalDelegate()
      guest1Portal = await guest1.joinPortal(hostPortal.id)
      guest1Portal.setDelegate(guest1PortalDelegate)

      const guest2 = buildClient({heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
      guest2PortalDelegate = new FakePortalDelegate()
      guest2Portal = await guest2.joinPortal(hostPortal.id)
      guest2Portal.setDelegate(guest2PortalDelegate)

      const guest3 = buildClient({heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
      guest3PortalDelegate = new FakePortalDelegate()
      guest3Portal = await guest3.joinPortal(hostPortal.id)
      guest3Portal.setDelegate(guest3PortalDelegate)

      const hostSharedBuffer = await hostPortal.createSharedBuffer({uri: 'some-buffer', text: ''})
      hostEditor = new Editor()
      const hostSharedEditor = await hostPortal.createSharedEditor({
        sharedBuffer: hostSharedBuffer,
        selectionRanges: {}
      })
      hostSharedEditor.setDelegate(hostEditor)
      await hostPortal.setActiveSharedEditor(hostSharedEditor)
      await condition(() =>
        guest1PortalDelegate.getActiveSharedEditor() != null &&
        guest2PortalDelegate.getActiveSharedEditor() != null &&
        guest3PortalDelegate.getActiveSharedEditor() != null
      )

      const guest1SharedEditor = guest1PortalDelegate.getActiveSharedEditor()
      guest1Editor = new Editor()
      guest1SharedEditor.setDelegate(guest1Editor)
      guest1SharedEditor.setSelectionRanges({1: {start: {row: 0, column: 0}, end: {row: 0, column: 0}}})

      const guest2SharedEditor = guest2PortalDelegate.getActiveSharedEditor()
      guest2Editor = new Editor()
      guest2SharedEditor.setDelegate(guest2Editor)
      guest2SharedEditor.setSelectionRanges({1: {start: {row: 0, column: 0}, end: {row: 0, column: 0}}})

      const guest3SharedEditor = guest3PortalDelegate.getActiveSharedEditor()
      guest3Editor = new Editor()
      guest3SharedEditor.setDelegate(guest3Editor)
      guest3SharedEditor.setSelectionRanges({1: {start: {row: 0, column: 0}, end: {row: 0, column: 0}}})

      await condition(() =>
        hostEditor.markerLayerForSiteId(guest1Portal.siteId) != null &&
        hostEditor.markerLayerForSiteId(guest2Portal.siteId) != null &&
        hostEditor.markerLayerForSiteId(guest3Portal.siteId) != null
      )
    })

    test('guest disconnection', async () => {
      await guest1Portal.simulateNetworkFailure()
      await condition(async () => deepEqual(
        await server.heartbeatService.findDeadSites(),
        [{portalId: guest1Portal.id, id: guest1Portal.siteId}]
      ), 'Expected to find one dead site: Guest 1')
      server.heartbeatService.evictDeadSites()
      await condition(() =>
        hostEditor.markerLayerForSiteId(guest1Portal.siteId) == null &&
        guest2Editor.markerLayerForSiteId(guest1Portal.siteId) == null &&
        guest3Editor.markerLayerForSiteId(guest1Portal.siteId) == null
      )
      assert(hostEditor.markerLayerForSiteId(guest2Portal.siteId))
      assert(hostEditor.markerLayerForSiteId(guest3Portal.siteId))
    })

    test('host disconnection', async () => {
      await hostPortal.simulateNetworkFailure()
      await condition(async () => deepEqual(
        await server.heartbeatService.findDeadSites(),
        [{portalId: hostPortal.id, id: hostPortal.siteId}]
      ), 'Expected to find one dead site: Host')
      assert(!guest1PortalDelegate.hasHostDisconnected() && !guest2PortalDelegate.hasHostDisconnected() && !guest3PortalDelegate.hasHostDisconnected())
      server.heartbeatService.evictDeadSites()
      await condition(() => guest1PortalDelegate.hasHostDisconnected() && guest2PortalDelegate.hasHostDisconnected() && guest3PortalDelegate.hasHostDisconnected())

      assert(!guest1Editor.markerLayerForSiteId(hostPortal.siteId))
      assert(!guest1Editor.markerLayerForSiteId(guest2Portal.siteId))
      assert(!guest1Editor.markerLayerForSiteId(guest3Portal.siteId))

      assert(!guest2Editor.markerLayerForSiteId(hostPortal.siteId))
      assert(!guest2Editor.markerLayerForSiteId(guest1Portal.siteId))
      assert(!guest2Editor.markerLayerForSiteId(guest3Portal.siteId))

      assert(!guest3Editor.markerLayerForSiteId(hostPortal.siteId))
      assert(!guest3Editor.markerLayerForSiteId(guest1Portal.siteId))
      assert(!guest3Editor.markerLayerForSiteId(guest2Portal.siteId))
    })
  })

  async function buildClient ({heartbeatIntervalInMilliseconds}={}) {
    const client = new Client({
      restGateway: server.restGateway,
      pubSubGateway: server.pubSubGateway || new PusherPubSubGateway(server.pusherCredentials),
      heartbeatIntervalInMilliseconds,
      didCreateOrJoinPortal: (portal) => portals.push(portal)
    })
    await client.initialize()
    return client
  }

  function condition (fn, message) {
    assert(!conditionErrorMessage, 'Cannot await on multiple conditions at the same time')

    conditionErrorMessage = message
    return new Promise((resolve) => {
      async function callback () {
        const resultOrPromise = fn()
        const result = (resultOrPromise instanceof Promise) ? (await resultOrPromise) : resultOrPromise
        if (result) {
          conditionErrorMessage = null
          resolve()
        } else {
          setTimeout(callback, 5)
        }
      }

      callback()
    })
  }
})
