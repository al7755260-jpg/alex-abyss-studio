import { createContext, useContext, type ReactNode } from 'react'
import {
  DEFAULT_STUDIO_LIGHTING,
  type StudioLightingSettings,
} from '../editor/studioLighting'

const StudioLightingSettingsContext = createContext<Readonly<StudioLightingSettings>>(
  DEFAULT_STUDIO_LIGHTING,
)

export function StudioLightingSettingsProvider({
  settings,
  children,
}: {
  settings: Readonly<StudioLightingSettings>
  children: ReactNode
}) {
  return (
    <StudioLightingSettingsContext.Provider value={settings}>
      {children}
    </StudioLightingSettingsContext.Provider>
  )
}

export function useStudioLightingSettings() {
  return useContext(StudioLightingSettingsContext)
}
