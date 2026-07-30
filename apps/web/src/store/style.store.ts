import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LayerStylePrefs = {
  color?: string
  fillOpacity?: number
}

type StyleState = {
  layerPrefs: Record<string, LayerStylePrefs>
  setLayerPref: (layerId: string, prefs: Partial<LayerStylePrefs>) => void
  resetLayerPref: (layerId: string) => void
}

export const useStyleStore = create<StyleState>()(
  persist(
    (set) => ({
      layerPrefs: {},
      setLayerPref: (layerId, prefs) =>
        set((state) => ({
          layerPrefs: {
            ...state.layerPrefs,
            [layerId]: { ...state.layerPrefs[layerId], ...prefs },
          },
        })),
      resetLayerPref: (layerId) =>
        set((state) => {
          const newPrefs = { ...state.layerPrefs }
          delete newPrefs[layerId]
          return { layerPrefs: newPrefs }
        }),
    }),
    {
      name: 'sigweb-layer-styles',
    }
  )
)
