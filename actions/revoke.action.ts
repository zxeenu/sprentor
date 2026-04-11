import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'
import type { AuthService } from '../services/auth.service'
import type { ConfigService } from '../services/config.service'

export class RevokeAction implements TelegramAction {
  public static readonly slug = 'v1.revoke_access'
  public static readonly command = ['.revoke']
  public static readonly meta = { description: 'revoke access' }

  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService
  ) {}

  async authorize(envelope: Envelope) {
    return await this.auth.isAuthenticated(envelope)
  }

  async handle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')
    return
  }
}
