import { useTranslation } from 'react-i18next'
import { PageMessage, Tag } from '../../components/qi'

/** A question's warning (advice from the template), when its answers call for it. */
export function QuestionWarning({ text }: { text: string | null }) {
  return text ? <PageMessage variant="warning">{text}</PageMessage> : null
}

/** Marks the answer to a question later templates removed (approved versions keep it). */
export function NoLongerAsked() {
  const { t } = useTranslation()
  return <Tag>{t('sad.version.noLongerAsked')}</Tag>
}
