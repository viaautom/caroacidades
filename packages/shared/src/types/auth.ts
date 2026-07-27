export type UserRole =
  | 'DESENVOLVEDOR'
  | 'ADMIN'
  | 'FISCAL_TRIBUTARIO'
  | 'SETOR_PROJETOS'
  | 'FISCAL_CAMPO'
  | 'CIDADAO'

export interface AuthUser {
  uid: string
  email: string
  displayName: string | null
  perfil: UserRole
}

export interface JwtPayload {
  uid: string
  email: string
  perfil: UserRole
  iat: number
  exp: number
}
