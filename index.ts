import { createRouter } from './lib/router'

const router = createRouter()

class Logger {
  log(msg: string) {
    console.log('Log:', msg)
  }
}

class Service {
  doSomething() {
    console.log('Service action')
  }
}

class AuthService {
  isAuthenticated(data: any) {
    return true
  }
}

// register dependencies
router.registerDependency(Logger, 'singleton')
router.registerDependency(AuthService, 'singleton')
router.registerDependency(Service, 'request-scoped')

// multiple middlewares can be registered via the same slug
router.registerMiddleware('v1.auth', [AuthService], ({ deps: [auth], envelope, next }) => {
  if (!auth.isAuthenticated(envelope)) {
    throw new Error('Unauthorized')
  }

  envelope['test'] = 'shove some data inside'
  next()
})
router.registerMiddleware('v1.auth', [AuthService], ({ deps: [auth], envelope, next }) => {
  envelope['test2'] = 'shove some data inside'
  next()
})

router.registerMiddleware('v1.response', [AuthService], ({ deps: [auth], envelope, next }) => {
  console.log('response-log', envelope)
  next()
})

// register route
router.registerRoute(
  'v1.test',
  [Logger, Service],
  ({ envelope, deps: [logger, service], meta }) => {
    logger.log('Dispatching test route')
    service.doSomething()
    console.log(envelope)
  },
  ['v1.auth'],
  ['v1.response']
)

// dispatch route
router.dispatch('v1.test', {})
router.dispatch('v1.test', {})
