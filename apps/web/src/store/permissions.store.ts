import { create } from 'zustand'

export type PerfilKey = 'DESENVOLVEDOR' | 'ADMIN' | 'FISCAL_TRIBUTARIO' | 'SETOR_PROJETOS' | 'FISCAL_CAMPO' | 'CIDADAO'

export type Modulo = {
  id: string
  label: string
  defaultPerfis: PerfilKey[]
}

export const MODULOS: Modulo[] = [
  { id: 'mapa',                 label: 'Mapa',                  defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS','FISCAL_CAMPO','CIDADAO'] },
  { id: 'cadastro_imobiliario', label: 'Cadastro Imobiliário',  defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'viabilidade',          label: 'Viabilidade',           defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS','CIDADAO'] },
  { id: 'iluminacao_publica',   label: 'Iluminação Pública',    defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'arborizacao',          label: 'Arborização',           defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'pgv',                  label: 'PGV',                   defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'aprovacao_projetos',   label: 'Aprovação de Projetos', defaultPerfis: ['ADMIN','SETOR_PROJETOS'] },
  { id: 'habite_se',            label: 'Habite-se',             defaultPerfis: ['ADMIN','SETOR_PROJETOS'] },
  { id: 'reurb',                label: 'REURB',                 defaultPerfis: ['ADMIN','SETOR_PROJETOS'] },
  { id: 'cadastro_social',      label: 'Cadastro Social',       defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'numeracao_predial',    label: 'Numeração Predial',     defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'app_chamados',         label: 'App de Chamados',       defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS'] },
  { id: 'patrimonio',           label: 'Patrimônio Público',    defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'cemiterio',            label: 'Cemitério',             defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { id: 'nuvem_3d',             label: 'Nuvem 3D',              defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS'] },
  { id: 'banco_dados',          label: 'Banco de Dados',        defaultPerfis: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS'] },
  { id: 'gestao_sig',           label: 'Gestão do SIG',         defaultPerfis: ['ADMIN'] },
]

// override: modulo -> perfil -> boolean. undefined = usa o default
type Overrides = Record<string, Record<string, boolean>>

interface PermissionsState {
  overrides: Overrides
  previewPerfil: PerfilKey | null
  loaded: boolean
  initOverrides: (rows: { modulo: string; perfil: string; habilitado: boolean }[]) => void
  setOverride: (modulo: string, perfil: string, habilitado: boolean) => void
  setPreviewPerfil: (perfil: PerfilKey | null) => void
  isHabilitado: (moduloId: string, perfil: string) => boolean
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  overrides: {},
  previewPerfil: null,
  loaded: false,

  initOverrides: (rows) => {
    const overrides: Overrides = {}
    for (const row of rows) {
      if (!overrides[row.modulo]) overrides[row.modulo] = {}
      overrides[row.modulo][row.perfil] = row.habilitado
    }
    set({ overrides, loaded: true })
  },

  setOverride: (modulo, perfil, habilitado) =>
    set(state => ({
      overrides: {
        ...state.overrides,
        [modulo]: { ...(state.overrides[modulo] ?? {}), [perfil]: habilitado },
      },
    })),

  setPreviewPerfil: (perfil) => set({ previewPerfil: perfil }),

  isHabilitado: (moduloId, perfil) => {
    const { overrides } = get()
    if (overrides[moduloId]?.[perfil] !== undefined) return overrides[moduloId][perfil]
    const modulo = MODULOS.find(m => m.id === moduloId)
    return modulo?.defaultPerfis.includes(perfil as PerfilKey) ?? false
  },
}))
