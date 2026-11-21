import { useTranslation } from 'react-i18next'
import type { ColourMode } from '../colouring'

/** The text for a value in a colour mode (colour is never the only signal). */
export function useValueLabel(mode: ColourMode) {
  const { t } = useTranslation()
  return (key: string) => {
    if (mode === 'time') return t(`trm.time.${key || 'none'}`)
    if (mode === 'functionalFit' || mode === 'technicalFit') return t(`trm.fit.${key || 'none'}`)
    return key || t(`trm.landscape.noValue.${mode}`)
  }
}
