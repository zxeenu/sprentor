import type { createRouter } from './router'
import type { TelegramAction } from './types'

// Constructor type with static slug & meta
export type TelegramActionConstructor = {
  new (...args: any[]): TelegramAction
  slug: `v${number}.${string}`
  meta?: Record<string, any>
}

export type ControllerEntry = {
  cls: TelegramActionConstructor
  deps: any[]
}

export function registerControllers(router: ReturnType<typeof createRouter>, controllers: ControllerEntry[]) {
  for (const { cls: ControllerClass, deps: depTokens } of controllers) {
    const resolvedDeps = depTokens.map((token) => router.resolveDependency(token))

    router.registerRoute(
      ControllerClass.slug,
      depTokens,
      async ({ envelope, deps }) => {
        const controller = new ControllerClass(...resolvedDeps)
        const isAuthorized = (await controller.authorize?.(envelope)) ?? true

        if (!isAuthorized) {
          envelope.isAuthorized = false
          throw new Error('Unauthorized')
        }

        await controller.handle(envelope)
      },
      [],
      [],
      ControllerClass.meta
    )
  }
}
