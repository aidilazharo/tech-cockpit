import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, DataTable, Dropdown, PageMessage, TextField } from '../../../components/qi'
import { ChevronDownIcon } from '../../../components/qi/icons'
import type { Box, Diagram, Line, Zone } from '../schemas'
import { DiagramCanvas } from './DiagramCanvas'
import { canvasEdits, lineStyle, namesOf, type Change, type PaneMode } from './helpers'
import { IconField } from './IconPicker'
import { addLine, removeItem, updateZone } from './model'
import { Facts, FormFrame, LineFields, LineForm, PaneLayout, RemoveButton, SelectButton, SizingSwitch, ZoneSize } from './parts'
import { addLane, addStep, layoutLanes, moveLane, removeLane, unnamedApprovals, updateStep } from './process'
import { PROCESS_STEPS, type ProcessStep } from './shapes'

const stepsIn = (diagram: Diagram, laneId: string) => diagram.boxes.filter((box) => box.parentId === laneId)

function useStepKinds() {
  const { t } = useTranslation()
  return {
    options: PROCESS_STEPS.map((kind) => ({ value: kind, label: t(`sad.diagram.steps.${kind}`) })),
    name: (type: string) => t(`sad.diagram.steps.${type}`, { defaultValue: type }),
  }
}

function LaneForm({ onAdd, onCancel }: { onAdd: (label: string) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [tried, setTried] = useState(false)
  return (
    <FormFrame
      title={t('sad.diagram.addLane')}
      onAdd={() => {
        setTried(true)
        if (label.trim()) onAdd(label)
      }}
      onCancel={onCancel}
    >
      <TextField label={t('sad.diagram.name')} hint={t('sad.diagram.laneHint')} value={label} onChange={(event) => setLabel(event.target.value)} error={tried && !label.trim() ? t('sad.diagram.nameNeeded') : undefined} />
    </FormFrame>
  )
}

function StepForm({ diagram, onAdd, onCancel }: { diagram: Diagram; onAdd: (step: Parameters<typeof addStep>[1]) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const kinds = useStepKinds()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<ProcessStep>('step')
  const [laneId, setLaneId] = useState<string | null>(null)
  const [approver, setApprover] = useState('')
  const [tried, setTried] = useState(false)
  return (
    <FormFrame
      title={t('sad.diagram.addStep')}
      onAdd={() => {
        setTried(true)
        if (label.trim() && laneId) onAdd({ label, type, laneId, approver })
      }}
      onCancel={onCancel}
    >
      <TextField label={t('sad.diagram.name')} value={label} onChange={(event) => setLabel(event.target.value)} error={tried && !label.trim() ? t('sad.diagram.nameNeeded') : undefined} />
      <Dropdown label={t('sad.diagram.kind')} options={kinds.options} value={type} onValueChange={setType} />
      <Dropdown
        label={t('sad.diagram.lane')}
        placeholder={t('sad.diagram.choose')}
        options={diagram.zones.map((lane) => ({ value: lane.id, label: lane.label }))}
        value={laneId}
        onValueChange={setLaneId}
        error={tried && !laneId ? t('sad.diagram.laneNeeded') : undefined}
      />
      {type === 'approval' && <TextField label={t('sad.diagram.approver')} hint={t('sad.diagram.approverHint')} value={approver} onChange={(event) => setApprover(event.target.value)} />}
    </FormFrame>
  )
}

/** The selected lane, step or connection: its fields to edit, or its facts read-only. */
function ProcessDetails({ diagram, selected, change, onRemoved }: { diagram: Diagram; selected: string | null; change?: Change; onRemoved: () => void }) {
  const { t } = useTranslation()
  const kinds = useStepKinds()
  const name = namesOf(diagram)
  const lane = diagram.zones.find((zone) => zone.id === selected)
  const step = diagram.boxes.find((box) => box.id === selected)
  const line = diagram.lines.find((item) => item.id === selected)
  if (!lane && !step && !line) return <p className="text-sm text-text-subdued">{t('sad.diagram.selectStepHint')}</p>
  const heading = line ? `${name(line.from)} → ${name(line.to)}` : (lane ?? step)!.label
  const steps = diagram.boxes.map((box) => ({ value: box.id, label: box.label }))
  if (!change) {
    const facts: [string, string][] = lane
      ? [[t('sad.diagram.stepList'), String(stepsIn(diagram, lane.id).length)]]
      : step
        ? [
            [t('sad.diagram.kind'), kinds.name(step.type)],
            [t('sad.diagram.lane'), name(step.parentId) || '—'],
            ...(step.type === 'approval' ? [[t('sad.diagram.approver'), step.approver ?? '—'] as [string, string]] : []),
          ]
        : [
            [t('sad.diagram.label'), line!.label ?? '—'],
            [t('sad.diagram.style'), lineStyle(t, line!)],
          ]
    return <Facts heading={heading} facts={facts} />
  }
  const remove = (fn: (d: Diagram) => Diagram) => {
    change(fn)
    onRemoved()
  }
  const inLane = lane ? stepsIn(diagram, lane.id).length : 0
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-base font-semibold">{heading}</h4>
      {lane && (
        <TextField
          key={`${lane.id}-label`}
          label={t('sad.diagram.name')}
          value={lane.label}
          error={lane.label.trim() ? undefined : t('sad.diagram.nameNeeded')}
          onChange={(event) => change((d) => updateZone(d, lane.id, { label: event.target.value }))}
        />
      )}
      {lane && <ZoneSize diagram={diagram} zone={lane} change={change} />}
      {step && (
        <>
          <TextField
            key={`${step.id}-label`}
            label={t('sad.diagram.name')}
            value={step.label}
            error={step.label.trim() ? undefined : t('sad.diagram.nameNeeded')}
            onChange={(event) => change((d) => updateStep(d, step.id, { label: event.target.value }))}
          />
          <Dropdown label={t('sad.diagram.kind')} options={kinds.options} value={step.type} onValueChange={(type) => change((d) => updateStep(d, step.id, { type }))} />
          <Dropdown
            label={t('sad.diagram.lane')}
            options={diagram.zones.map((zone) => ({ value: zone.id, label: zone.label }))}
            value={step.parentId ?? null}
            onValueChange={(parentId) => change((d) => updateStep(d, step.id, { parentId }))}
          />
          {step.type === 'approval' && (
            <TextField
              key={`${step.id}-approver`}
              label={t('sad.diagram.approver')}
              hint={t('sad.diagram.approverHint')}
              value={step.approver ?? ''}
              onChange={(event) => change((d) => updateStep(d, step.id, { approver: event.target.value }))}
            />
          )}
          <IconField box={step} change={change} />
        </>
      )}
      {line && <LineFields diagram={diagram} line={line} change={change} ends={steps} />}
      <RemoveButton
        confirm={inLane > 0 ? { title: t('sad.diagram.removeLaneTitle', { name: lane!.label }), description: t('sad.diagram.removeLaneBody', { count: inLane }) } : undefined}
        onRemove={() => remove((d) => (lane ? removeLane(d, lane.id) : removeItem(d, selected!)))}
      />
    </div>
  )
}

/** Before submit: approval steps that do not yet say who approves. */
function ApproverNotes({ diagram }: { diagram: Diagram }) {
  const { t } = useTranslation()
  const unnamed = unnamedApprovals(diagram)
  if (unnamed.length === 0) return null
  return <PageMessage variant="warning">{t('sad.diagram.approversMissing', { list: unnamed.map((step) => step.label).join('; ') })}</PageMessage>
}

/** The lanes (in order, with a keyboard way to reorder them), steps and connections. */
function ProcessTables({ diagram, change, select }: { diagram: Diagram; change?: Change; select: (id: string) => void }) {
  const { t } = useTranslation()
  const kinds = useStepKinds()
  const name = namesOf(diagram)
  const last = diagram.zones.length - 1
  return (
    <>
      <DataTable<Zone>
        caption={t('sad.diagram.lanes')}
        getRowId={(lane) => lane.id}
        rows={diagram.zones}
        emptyState={<p className="p-4 text-sm text-text-subdued">{t('sad.diagram.noLanes')}</p>}
        columns={[
          { id: 'order', header: t('sad.diagram.order'), accessor: (lane) => String(diagram.zones.indexOf(lane) + 1) },
          { id: 'name', header: t('sad.diagram.name'), cell: (lane) => <SelectButton onClick={() => select(lane.id)}>{lane.label}</SelectButton> },
          { id: 'steps', header: t('sad.diagram.stepList'), accessor: (lane) => String(stepsIn(diagram, lane.id).length) },
          ...(change
            ? [
                {
                  id: 'move',
                  header: t('sad.diagram.move'),
                  cell: (lane: Zone) => {
                    const at = diagram.zones.indexOf(lane)
                    return (
                      <div className="flex gap-1">
                        <Button variant="tertiary" aria-label={t('sad.diagram.moveUp', { name: lane.label })} disabled={at === 0} onClick={() => change((d) => moveLane(d, lane.id, -1))}>
                          <ChevronDownIcon aria-hidden="true" className="size-4 rotate-180" />
                        </Button>
                        <Button variant="tertiary" aria-label={t('sad.diagram.moveDown', { name: lane.label })} disabled={at === last} onClick={() => change((d) => moveLane(d, lane.id, 1))}>
                          <ChevronDownIcon aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    )
                  },
                },
              ]
            : []),
        ]}
      />
      <DataTable<Box>
        caption={t('sad.diagram.stepList')}
        getRowId={(step) => step.id}
        rows={diagram.boxes}
        emptyState={<p className="p-4 text-sm text-text-subdued">{t('sad.diagram.noSteps')}</p>}
        columns={[
          { id: 'name', header: t('sad.diagram.name'), cell: (step) => <SelectButton onClick={() => select(step.id)}>{step.label}</SelectButton> },
          { id: 'kind', header: t('sad.diagram.kind'), accessor: (step) => kinds.name(step.type) },
          { id: 'lane', header: t('sad.diagram.lane'), accessor: (step) => name(step.parentId) || '—' },
          { id: 'approver', header: t('sad.diagram.approver'), accessor: (step) => step.approver ?? '—' },
        ]}
      />
      <DataTable<Line>
        caption={t('sad.diagram.connections')}
        getRowId={(line) => line.id}
        rows={diagram.lines}
        emptyState={<p className="p-4 text-sm text-text-subdued">{t('sad.diagram.noLines')}</p>}
        columns={[
          {
            id: 'ends',
            header: `${t('sad.diagram.from')} → ${t('sad.diagram.to')}`,
            cell: (line) => (
              <SelectButton onClick={() => select(line.id)}>
                {name(line.from)} → {name(line.to)}
              </SelectButton>
            ),
          },
          { id: 'label', header: t('sad.diagram.label'), accessor: (line) => line.label ?? '—' },
          { id: 'style', header: t('sad.diagram.style'), accessor: (line) => lineStyle(t, line) },
        ]}
      />
    </>
  )
}

/** A CI or CD flow: section 10 draws its lanes, steps and connections; everyone else reads it. */
export function ProcessPane({ diagram, mode, onChange }: { diagram: Diagram; mode: PaneMode; onChange?: (diagram: Diagram) => void }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<'lane' | 'step' | 'connection' | null>(null)
  const drawing = mode === 'draw'
  // Lanes are stacked again after every change (a lane that grows pushes the ones below it down).
  const change: Change | undefined = drawing && onChange ? (fn) => onChange(layoutLanes(fn(diagram))) : undefined
  const added = (d: Diagram, kind: 'zones' | 'boxes' | 'lines') => {
    change!(() => d)
    setSelected(d[kind][d[kind].length - 1].id)
    setForm(null)
  }
  const cancel = () => setForm(null)
  return (
    <PaneLayout
      toolbar={
        change && (
          <>
            <Button variant="secondary" onClick={() => setForm('lane')}>
              {t('sad.diagram.addLane')}
            </Button>
            <Button variant="secondary" onClick={() => setForm('step')} disabled={diagram.zones.length === 0}>
              {t('sad.diagram.addStep')}
            </Button>
            <Button variant="secondary" onClick={() => setForm('connection')} disabled={diagram.boxes.length < 2}>
              {t('sad.diagram.addConnection')}
            </Button>
            <SizingSwitch diagram={diagram} change={change} />
          </>
        )
      }
      form={
        change &&
        {
          lane: <LaneForm onCancel={cancel} onAdd={(label) => added(addLane(diagram, label), 'zones')} />,
          step: <StepForm diagram={diagram} onCancel={cancel} onAdd={(step) => added(addStep(diagram, step), 'boxes')} />,
          connection: (
            <LineForm
              diagram={diagram}
              title={t('sad.diagram.addConnection')}
              ends={diagram.boxes.map((box) => ({ value: box.id, label: box.label }))}
              onCancel={cancel}
              onAdd={(line) => added(addLine(diagram, line), 'lines')}
            />
          ),
          none: null,
        }[form ?? 'none']
      }
      notes={change && <ApproverNotes diagram={diagram} />}
      canvas={<DiagramCanvas diagram={diagram} editable={drawing} selected={selected} onSelect={setSelected} onEdits={canvasEdits(diagram, change, setSelected)} />}
      hint={t(drawing ? 'sad.diagram.canvasHint' : 'sad.diagram.canvasHintReadOnly')}
      details={<ProcessDetails diagram={diagram} selected={selected} change={change} onRemoved={() => setSelected(null)} />}
      tables={<ProcessTables diagram={diagram} change={change} select={setSelected} />}
    />
  )
}
