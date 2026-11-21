import type { ReactNode } from 'react'
import { inputText, type RichNode, SAFE_URL } from './format'

const children = (node: RichNode | null | undefined): RichNode[] => node?.content ?? []
/** Small and large text (normal has no size). */
const FONT_SIZE: Record<string, string> = { small: 'text-sm', large: 'text-lg' }

function inline(node: RichNode, key: number): ReactNode {
  if (node.type === 'hardBreak') return <br key={key} />
  let content: ReactNode = inputText(node.text)
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') content = <strong>{content}</strong>
    if (mark.type === 'italic') content = <em>{content}</em>
    if (mark.type === 'underline') content = <u>{content}</u>
    if (mark.type === 'strike') content = <s>{content}</s>
    if (mark.type === 'textStyle' && mark.attrs?.fontSize) content = <span className={FONT_SIZE[mark.attrs.fontSize]}>{content}</span>
    if (mark.type === 'link' && mark.attrs?.href && SAFE_URL.test(mark.attrs.href)) {
      content = (
        <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer" className="text-text-link underline">
          {content}
        </a>
      )
    }
  }
  return <span key={key}>{content}</span>
}

function table(node: RichNode, key: number): ReactNode {
  return (
    <div key={key} className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <tbody>
          {children(node).map((row, index) => (
            <tr key={index}>
              {children(row).map((cell, column) => {
                const Cell = cell.type === 'tableHeader' ? 'th' : 'td'
                return (
                  <Cell key={column} scope={cell.type === 'tableHeader' ? 'col' : undefined} className="border border-divider-default px-2 py-1 text-left align-top">
                    {children(cell).map(block)}
                  </Cell>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function block(node: RichNode, key: number): ReactNode {
  // Headings sit under the page's section and group headings: Heading is level 4, Subheading level 5.
  if (node.type === 'heading') {
    return node.attrs?.level === 5 ? (
      <h5 key={key} className="font-semibold">
        {children(node).map(inline)}
      </h5>
    ) : (
      <h4 key={key} className="heading-4">
        {children(node).map(inline)}
      </h4>
    )
  }
  if (node.type === 'table') return table(node, key)
  const items = children(node).map((item, index) => <li key={index}>{children(item).map(block)}</li>)
  if (node.type === 'bulletList') return <ul key={key} className="list-disc pl-6">{items}</ul>
  if (node.type === 'orderedList') {
    return (
      <ol key={key} start={node.attrs?.start} className="list-decimal pl-6">
        {items}
      </ol>
    )
  }
  return <p key={key}>{children(node).map(inline)}</p>
}

/** A rich-text answer, built as React elements from its stored tree (never as HTML). */
export function RichText({ doc }: { doc: unknown }) {
  const nodes = children(doc as RichNode | null)
  return <div className="flex flex-col gap-2">{nodes.map(block)}</div>
}
