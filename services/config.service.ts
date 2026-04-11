import type { SlugString } from '../lib/types'

export class ConfigService {
  public commandHandlers: Record<string, SlugString> = {}

  async setCommandHandlers(data: typeof this.commandHandlers) {
    this.commandHandlers = data
  }
}
