import type { Envelope } from '../lib/router'

export class AuthService {
  async isAuthenticated(data: Envelope) {
    if (data.username !== process.env.ADMIN_USER_NAME) {
      return false
    }

    return true
  }
}
