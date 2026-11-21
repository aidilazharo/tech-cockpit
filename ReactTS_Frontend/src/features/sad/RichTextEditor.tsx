import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table'
import { FontSize, TextStyle } from '@tiptap/extension-text-style'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, Dropdown, TextField } from '../../components/qi'
import { cn } from '../../lib/cn'
import { SAFE_URL } from './format'

// Table cells hold paragraphs of text only (the API refuses lists or tables inside cells).
const TextCell = TableCell.extend({ content: 'paragraph+' })
const TextHeader = TableHeader.extend({ content: 'paragraph+' })
const FONT_SIZES = ['small', 'normal', 'large'] as const
type FontSizeChoice = (typeof FONT_SIZES)[number]

const TOOL =
  'inline-flex min-h-10 min-w-10 items-center justify-center rounded-button px-2 text-sm font-semibold text-text-default hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-border-focus aria-pressed:bg-surface-selected-1 aria-pressed:text-text-selected'

/**
 * Formatted text for SAD answers: paragraphs, headings (Heading and Subheading, levels 4 and 5), bold, italic,
 * underline, strikethrough, a font size (small, normal, large), bullet and numbered lists, tables of text and links.
 * Only those are enabled, so the editor can never produce what the API refuses (code, quotes, HTML); links may
 * only open web pages or email.
 */
export function RichTextEditor({ id, label, value, onChange, error }: { id: string; label: string; value: unknown; onChange: (doc: object | null) => void; error?: string }) {
  const { t } = useTranslation()
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [4, 5] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', isAllowedUri: (uri) => SAFE_URL.test(uri) },
      }),
      TextStyle,
      FontSize,
      TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }),
      TextCell,
      TextHeader,
    ],
    content: (value as object | undefined) ?? '',
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': `${id}-label`,
        ...(error ? { 'aria-invalid': 'true', 'aria-describedby': `${id}-error` } : {}),
        class: cn(
          'min-h-28 rounded-form border bg-surface-enabled-1 px-3 py-2 text-base text-text-default hover:border-border-selected focus:outline-2 focus:-outline-offset-1 focus:outline-border-focus [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-text-link [&_a]:underline [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:font-semibold [&_table]:border-collapse [&_td]:border [&_td]:border-divider-default [&_td]:px-2 [&_th]:border [&_th]:border-divider-default [&_th]:px-2 [&_th]:text-left',
          error ? 'border-border-error' : 'border-border-default',
        ),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? null : current.getJSON()),
  })
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading: current.isActive('heading', { level: 4 }),
      subheading: current.isActive('heading', { level: 5 }),
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      fontSize: ((current.getAttributes('textStyle').fontSize as string | undefined) ?? 'normal') as FontSizeChoice,
      table: current.isActive('table'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      link: current.isActive('link'),
    }),
  })
  const tool = (name: Exclude<keyof typeof active, 'fontSize'>, text: string, run: () => void) => (
    <button type="button" className={TOOL} aria-pressed={active[name]} onClick={run}>
      {text}
    </button>
  )
  // Table changes apply where the cursor is; they are not toggles.
  const tableAction = (text: string, run: () => void) => (
    <button type="button" className={TOOL} onClick={run}>
      {text}
    </button>
  )
  const validUrl = SAFE_URL.test(url.trim())

  return (
    <div className="flex flex-col gap-1">
      <span id={`${id}-label`} className="text-sm font-semibold text-text-default">
        {label}
      </span>
      <div role="toolbar" aria-label={t('sad.editor.formatting', { label })} className="flex flex-wrap gap-1">
        {tool('heading', t('sad.editor.heading'), () => editor.chain().focus().toggleHeading({ level: 4 }).run())}
        {tool('subheading', t('sad.editor.subheading'), () => editor.chain().focus().toggleHeading({ level: 5 }).run())}
        {tool('bold', t('sad.editor.bold'), () => editor.chain().focus().toggleBold().run())}
        {tool('italic', t('sad.editor.italic'), () => editor.chain().focus().toggleItalic().run())}
        {tool('underline', t('sad.editor.underline'), () => editor.chain().focus().toggleUnderline().run())}
        {tool('strike', t('sad.editor.strike'), () => editor.chain().focus().toggleStrike().run())}
        <Dropdown<FontSizeChoice>
          label={t('sad.editor.fontSize')}
          hideLabel
          className="w-32"
          value={active.fontSize}
          onValueChange={(size) => (size === 'normal' ? editor.chain().focus().unsetFontSize().run() : editor.chain().focus().setFontSize(size).run())}
          options={FONT_SIZES.map((size) => ({ value: size, label: t(`sad.editor.fontSizes.${size}`) }))}
        />
        {tool('bulletList', t('sad.editor.bulletList'), () => editor.chain().focus().toggleBulletList().run())}
        {tool('orderedList', t('sad.editor.orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
        {tool('link', t('sad.editor.link'), () => {
          setUrl((editor.getAttributes('link').href as string | undefined) ?? 'https://')
          setLinking(true)
        })}
        {tool('table', t('sad.editor.table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {active.table && (
          <>
            {tableAction(t('sad.editor.tableAddRow'), () => editor.chain().focus().addRowAfter().run())}
            {tableAction(t('sad.editor.tableAddColumn'), () => editor.chain().focus().addColumnAfter().run())}
            {tableAction(t('sad.editor.tableRemoveRow'), () => editor.chain().focus().deleteRow().run())}
            {tableAction(t('sad.editor.tableRemoveColumn'), () => editor.chain().focus().deleteColumn().run())}
            {tableAction(t('sad.editor.tableRemove'), () => editor.chain().focus().deleteTable().run())}
          </>
        )}
      </div>
      <EditorContent editor={editor} />
      {error && (
        <p id={`${id}-error`} className="text-sm text-text-error">
          {error}
        </p>
      )}
      <Dialog
        open={linking}
        onClose={() => setLinking(false)}
        title={t('sad.editor.linkTitle')}
        actions={
          <>
            {active.link && (
              <Button
                variant="tertiary"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run()
                  setLinking(false)
                }}
              >
                {t('sad.editor.removeLink')}
              </Button>
            )}
            <Button
              disabled={!validUrl}
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
                setLinking(false)
              }}
            >
              {t('sad.editor.saveLink')}
            </Button>
          </>
        }
      >
        <TextField label={t('sad.editor.linkAddress')} hint={t('sad.editor.linkHint')} value={url} onChange={(event) => setUrl(event.target.value)} error={url.trim() !== '' && url !== 'https://' && !validUrl ? t('sad.editor.linkInvalid') : undefined} />
      </Dialog>
    </div>
  )
}
