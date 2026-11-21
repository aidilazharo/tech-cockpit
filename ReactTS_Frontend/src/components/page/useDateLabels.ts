import { useTranslation } from 'react-i18next'
import type { DatePickerLabels } from '../qi'

/** DatePicker texts from i18n. */
export function useDateLabels(): DatePickerLabels {
  const { t } = useTranslation()
  return {
    openCalendar: t('dates.openCalendar'),
    previousMonth: t('dates.previousMonth'),
    nextMonth: t('dates.nextMonth'),
    invalid: t('dates.invalid'),
    tooEarly: t('dates.tooEarly'),
    tooLate: t('dates.tooLate'),
  }
}
