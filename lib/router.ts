type Envelope = Record<string, unknown>
type Constructor<T> = new (...args: any[]) => T
type DependencyType = 'singleton' | 'request-scoped'
type Next = () => Promise<void> | void
type RouterSlug = `v${number}.${string}`
type MiddlewareSlug = `v${number}.${string}`
type HandlerCallbackWithDeps<T extends any[]> = (args: { envelope: Envelope; deps: T; meta?: any }) => Promise<void> | void

type RouteHandler<T extends any[]> = (args: { envelope: Envelope; deps: T; meta?: any }) => Promise<void> | void
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

type DependencyEntry = { type: DependencyType; object: any }

export function createRouter() {
  // amazing how you can mimic oop behaviour without any actual oop syntax
  const routeMap = new Map<RouterSlug, RouteEntry<any>>()
  const routeBeforeMiddlewareMap = new Map<RouterSlug, MiddlewareSlug[]>()
  const routeAfterMiddlewareMap = new Map<RouterSlug, MiddlewareSlug[]>()
  const middlewareMap = new Map<MiddlewareSlug, MiddlewareEntry<any>[]>()
  const dependencyMap = new Map<any, DependencyEntry>()

  function registerDependency<T>(dependency: Constructor<T>, type: DependencyType) {
    if (dependencyMap.has(dependency)) {
      throw new Error('Dependency already registered')
    }
    dependencyMap.set(dependency, { type, object: dependency })
  }

  function resolveDependency(depConstructor: any): any {
    const entry = dependencyMap.get(depConstructor)
    if (!entry) {
      throw new Error(`Dependency ${depConstructor} not registered`)
    }

    if (entry.type === 'singleton') {
      if (typeof entry.object === 'function') {
        const instance = new entry.object()
        entry.object = instance
        dependencyMap.set(depConstructor, entry)
      }
      return entry.object
    } else if (entry.type === 'request-scoped') {
      return new entry.object()
    }

    throw new Error('Unknown dependency type')
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

  async function dispatch<T extends Constructor<any>[]>(slug: RouterSlug, envelope: Envelope) {
    const route = routeMap.get(slug) as RouteEntry<T> | undefined
    if (!route) {
      throw new Error('Route not found')
    }

    // Collect before middlewares
    const beforeMiddlewareSlugs = routeBeforeMiddlewareMap.get(slug) ?? []
    const beforeMiddlewares: MiddlewareEntry<any>[] = []

    for (const slug of beforeMiddlewareSlugs) {
      const middlewareFunction = middlewareMap.get(slug)
      if (!middlewareFunction) {
        throw new Error(`Unregistered middleware being called from route ${route}`)
      }
      beforeMiddlewares.push(...middlewareFunction)
    }

    // Collect after middlewares
    const afterMiddlewareSlugs = routeAfterMiddlewareMap.get(slug) ?? []
    const afterMiddlewares: MiddlewareEntry<any>[] = []

    for (const slug of afterMiddlewareSlugs) {
      const middlewareFunction = middlewareMap.get(slug)
      if (!middlewareFunction) {
        throw new Error(`Unregistered middleware being called from route ${route}`)
      }
      afterMiddlewares.push(...middlewareFunction)
    }

    let beforeIndex = -1
    const runBeforeMiddleware = async (i: number) => {
      if (i <= beforeIndex) throw new Error('next() called multiple times')
      beforeIndex = i

      // If no more before middleware → execute route, then run after middleware
      if (i === beforeMiddlewares.length) {
        const deps = route.depsConstructors.map(resolveDependency) as {
          [K in keyof T]: T[K] extends Constructor<infer R> ? R : never
        }

        console.log(`DISPATCH : [${slug}] -> ${JSON.stringify(route.meta, null, 2)}`)
        await route.callback({
          envelope,
          deps,
          meta: route.meta
        })

        // After route completes, run after middleware chain
        await runAfterMiddleware(0)
        return
      }

      const mw = beforeMiddlewares.at(i)
      if (!mw) {
        throw new Error('Middleware before route handling attempted')
      }

      // const deps = mw.depsConstructors.map(resolveDependency)
      // lots just doing this to make ts happy
      const deps = mw.depsConstructors.map(resolveDependency) as {
        [K in keyof typeof mw.depsConstructors]: (typeof mw.depsConstructors)[K] extends Constructor<infer R> ? R : never
      }[number][]

      await mw.callback({
        envelope,
        deps,
        meta: mw.meta,
        next: async () => await runBeforeMiddleware(i + 1)
      })
    }

    let afterIndex = -1
    const runAfterMiddleware = async (i: number) => {
      if (i <= afterIndex) throw new Error('next() called multiple times')
      afterIndex = i

      if (i === afterMiddlewares.length) {
        return
      }

      const mw = afterMiddlewares.at(i)
      if (!mw) {
        throw new Error('Middleware after route handling attempted')
      }

      // const deps = mw.depsConstructors.map(resolveDependency)
      // lots just doing this to make ts happy
      const deps = mw.depsConstructors.map(resolveDependency) as {
        [K in keyof typeof mw.depsConstructors]: (typeof mw.depsConstructors)[K] extends Constructor<infer R> ? R : never
      }[number][]

      await mw.callback({
        envelope,
        deps,
        meta: mw.meta,
        next: async () => await runAfterMiddleware(i + 1)
      })
    }

    await runBeforeMiddleware(0)

    // try {
    //   runBeforeMiddleware(0)
    // } catch (err) {
    //   runErrorMiddleware(err)
    // }
  }

  return { registerRoute, registerMiddleware, registerDependency, dispatch }
}
