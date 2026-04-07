import type { Envelope, createRouter } from './router'
import type { TelegramAction } from './types'

type Constructor<T> = new (...args: any[]) => T

// Define a "controller registration entry" with its class and required dependencies
export type ControllerEntry<C extends Constructor<any>, Deps extends any[]> = {
  cls: C
  deps: [...Deps] // array of dependency tokens (classes or strings)
}

export function registerControllers(router: ReturnType<typeof createRouter>, controllers: ControllerEntry<Constructor<any>, any[]>[]) {
  for (const { cls: ControllerClass, deps: depTokens } of controllers) {
    // Resolve only the dependencies this controller declares
    const resolvedDeps = depTokens.map((token) => router.resolveDependency(token))
    const instance: TelegramAction = new ControllerClass(...resolvedDeps)

    // Ensure the controller has slug & handle
    if (!('slug' in instance) || typeof instance.handle !== 'function') {
      throw new Error(`Controller ${ControllerClass.name} must have 'slug' property and 'handle' method`)
    }

    router.registerRoute(
      instance.slug,
      [], // dependencies are already injected via constructor
      async ({ envelope }: { envelope: Envelope }) => {
        const isAuthorized = await instance.authorize(envelope)

        if (!isAuthorized) {
          envelope.isAuthorized = false
          return
        }

        envelope.isAuthorized = true
        await instance.handle(envelope)
      },
      [], // before middleware
      [], // after middleware
      instance.meta
    )
  }
}
