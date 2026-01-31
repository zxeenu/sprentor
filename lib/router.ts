export type Envelope = {
  [key: string]: any
  username: string
  messageText: string
  correlationId: string
  isCommand: boolean
  isAdmin: boolean
  failed: boolean
  errors: unknown[]
}

type Constructor<T> = new (...args: any[]) => T
type DependencyType = 'singleton' | 'request-scoped'
type Next = () => Promise<void> | void
type RouterSlug = `v${number}.${string}`
type MiddlewareSlug = `v${number}.${string}`
type HandlerCallbackWithDeps<T extends any[]> = (args: { envelope: Envelope; deps: T; meta?: any }) => Promise<void> | void

type RouteHandler<T extends any[]> = (args: { envelope: Envelope; deps: T; meta?: any }) => Promise<any> | void
type RouteEntry<T extends Constructor<any>[]> = {
  callback: RouteHandler<{ [K in keyof T]: T[K] extends Constructor<infer R> ? R : never }>
  depsConstructors: T
  meta: any
}

type MiddlewareHandler<T extends any[]> = (args: { envelope: Envelope; deps: T; meta?: any; next: Next }) => Promise<void> | void
type MiddlewareEntry<T extends Constructor<any>[]> = {
  callback: MiddlewareHandler<{ [K in keyof T]: T[K] extends Constructor<infer R> ? R : never }>
  depsConstructors: T
  meta: any
}

type ErrorHandler = (args: { error: unknown; envelope: Envelope; meta?: any; routeSlug?: RouterSlug; next: () => Promise<void> | void }) => Promise<void> | void

type DependencyToken = string | Constructor<any>
type DependencyFactory = { type: DependencyType; factory: () => any; instance?: any }

type DispatchResult = { success: true; data: any } | { success: false; error: unknown }

export function createRouter() {
  // amazing how you can mimic oop behaviour without any actual oop syntax
  const routeMap = new Map<RouterSlug, RouteEntry<any>>()
  const routeBeforeMiddlewareMap = new Map<RouterSlug, MiddlewareSlug[]>()
  const routeAfterMiddlewareMap = new Map<RouterSlug, MiddlewareSlug[]>()
  const middlewareMap = new Map<MiddlewareSlug, MiddlewareEntry<any>[]>()
  const dependencyMap = new Map<DependencyToken, DependencyFactory>()
  const errorHandlers: ErrorHandler[] = []

  function registerErrorHandler(handler: ErrorHandler) {
    errorHandlers.push(handler)
  }

  function registerDependency(token: DependencyToken, type: DependencyType, factory: () => any) {
    if (dependencyMap.has(token)) {
      throw new Error('Dependency already registered')
    }
    dependencyMap.set(token, { type, factory })
  }

  function registerSingleton(token: DependencyToken, factory?: () => any) {
    if (dependencyMap.has(token)) {
      throw new Error('Dependency already registered')
    }

    let resolvedFactory: () => any

    if (factory) {
      resolvedFactory = factory
    } else {
      if (typeof token === 'string') {
        throw new Error('String token requires a factory callback')
      }
      resolvedFactory = () => new token() // safe because token is Constructor<any>
    }

    dependencyMap.set(token, { type: 'singleton', factory: resolvedFactory })
  }

  function resolveDependency(token: DependencyToken) {
    const entry = dependencyMap.get(token)
    if (!entry) {
      throw new Error(`Dependency ${token} not registered`)
    }

    if (entry.type === 'singleton') {
      if (!entry.instance) {
        entry.instance = entry.factory()
      }
      return entry.instance
    }

    return entry.factory()
  }

  function registerRoute<T extends Constructor<any>[]>(
    slug: RouterSlug,
    depsConstructors: [...T],
    callback: HandlerCallbackWithDeps<{ [K in keyof T]: T[K] extends Constructor<infer R> ? R : never }>,
    beforeMiddlewareSlug?: MiddlewareSlug[],
    afterMiddlewareSlug?: MiddlewareSlug[],
    meta?: any
  ) {
    if (routeMap.has(slug)) {
      throw new Error('Route already registered')
    }

    for (const depsConstructor of depsConstructors) {
      const entry = dependencyMap.get(depsConstructor)
      if (!entry) {
        throw new Error(`Dependency ${depsConstructor} not registered`)
      }
    }

    const _meta = meta ?? {}
    routeMap.set(slug, { callback, depsConstructors, meta: _meta } as RouteEntry<T>)

    const _beforeMiddlewareSlug = beforeMiddlewareSlug ?? []
    routeBeforeMiddlewareMap.set(slug, _beforeMiddlewareSlug)

    const _afterMiddlewareSlug = afterMiddlewareSlug ?? []
    routeAfterMiddlewareMap.set(slug, _afterMiddlewareSlug)
  }

  function registerMiddleware<T extends Constructor<any>[]>(
    slug: MiddlewareSlug,
    depsConstructors: [...T],
    callback: MiddlewareHandler<{ [K in keyof T]: T[K] extends Constructor<infer R> ? R : never }>,
    meta?: any
  ) {
    const list = middlewareMap.get(slug) ?? []

    for (const dep of depsConstructors) {
      if (!dependencyMap.has(dep)) {
        throw new Error(`Dependency ${dep} not registered`)
      }
    }

    list.push({
      callback,
      depsConstructors,
      meta: meta ?? {}
    } as MiddlewareEntry<T>)

    middlewareMap.set(slug, list)
  }

  // --- dispatch preserves tuple type ---
  // function dispatch<T extends Constructor<any>[]>(slug: RouterSlug, envelope: Envelope) {
  //   const entry = routeMap.get(slug) as RouteEntry<T> | undefined
  //   if (!entry) throw new Error('Route not found')

  //   const resolvedDeps = entry.depsConstructors.map(resolveDependency) as {
  //     [K in keyof T]: T[K] extends Constructor<infer R> ? R : never
  //   }

  //   console.log(`DISPATCH : [${slug}] -> ${JSON.stringify(entry.meta, null, 2)}`)
  //   entry.callback({ envelope, deps: resolvedDeps, meta: entry.meta })
  // }

  async function runErrorHandlers(error: unknown, envelope: Envelope, meta?: any, routeSlug?: RouterSlug) {
    let idx = -1
    const run = async (i: number): Promise<void> => {
      if (i <= idx) throw new Error('next() called multiple times in error handler')
      idx = i
      if (i === errorHandlers.length) return
      const handler = errorHandlers.at(i)

      if (!handler) {
        throw new Error('Error handler could not be found! Fatal error!')
      }

      await handler({
        error,
        envelope,
        meta,
        routeSlug,
        next: async () => run(i + 1)
      })
    }

    await run(0)
  }

  async function _dispatch<T extends Constructor<any>[]>(slug: RouterSlug, envelope: Envelope) {
    const route = routeMap.get(slug) as RouteEntry<T> | undefined
    if (!route) throw new Error('Route not found')

    // collect middlewares
    const beforeMiddlewares = (routeBeforeMiddlewareMap.get(slug) ?? []).flatMap((s) => middlewareMap.get(s) ?? [])
    const afterMiddlewares = (routeAfterMiddlewareMap.get(slug) ?? []).flatMap((s) => middlewareMap.get(s) ?? [])

    // Helper to run middleware imperatively
    const runMiddlewares = async (middlewares: MiddlewareEntry<any>[]) => {
      for (const mw of middlewares) {
        const deps = mw.depsConstructors.map(resolveDependency)
        let calledNext = false
        await mw.callback({
          envelope,
          deps,
          meta: mw.meta,
          next: async () => {
            calledNext = true
          }
        })
        if (!calledNext) break // stop chain if next() not called
      }
    }

    // Run before middlewares
    await runMiddlewares(beforeMiddlewares)

    // Run route
    const deps = route.depsConstructors.map(resolveDependency) as any
    const data = await route.callback({ envelope, deps, meta: route.meta })

    // Run after middlewares
    await runMiddlewares(afterMiddlewares)

    return data
  }

  async function dispatch<T extends Constructor<any>[]>(slug: RouterSlug, envelope: Envelope): Promise<DispatchResult> {
    try {
      const data = await _dispatch<T>(slug, envelope)
      return {
        success: true,
        data: data
      }
    } catch (err) {
      const route = routeMap.get(slug) as RouteEntry<T> | undefined

      envelope.failed = true

      console.error(err)
      envelope.errors.push(err)

      try {
        await runErrorHandlers(err, envelope, route?.meta, slug)
      } catch (handlerErr) {
        // Error handler threw or called next() incorrectly; rethrow the original or handler error
        console.error(handlerErr)
        envelope.errors.push(handlerErr)
      }

      return {
        success: false,
        error: err
      }
    }
  }

  return { registerRoute, registerMiddleware, registerDependency, dispatch, registerErrorHandler, registerSingleton, resolveDependency }
}
