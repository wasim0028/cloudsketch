import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Icon } from '../icons/registry'
import { ICON_SIZE, PORT_Y } from '../layout/elk'

export type ServiceData = { label: string; icon?: string; auto?: boolean }
export type GroupData = { label: string; icon?: string; depth: number }

const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 }

function Handles({ top }: { top?: number }) {
  const style = top == null ? hidden : { ...hidden, top }
  return (
    <>
      <Handle type="target" position={Position.Left} style={style} />
      <Handle type="source" position={Position.Right} style={style} />
    </>
  )
}

export function ServiceNode({ data, selected }: NodeProps<Node<ServiceData>>) {
  return (
    <div className={`svc ${selected ? 'is-selected' : ''} ${data.auto ? 'is-auto' : ''}`}>
      <Handles top={PORT_Y} />
      <div className="svc-icon"><Icon iconKey={data.icon} size={ICON_SIZE} /></div>
      <div className="svc-label">{data.label}</div>
    </div>
  )
}

export function GroupNode({ data, selected }: NodeProps<Node<GroupData>>) {
  return (
    <div className={`grp depth-${Math.min(data.depth, 3)} ${selected ? 'is-selected' : ''}`}>
      <Handles />
      <div className="grp-header">
        {data.icon && <Icon iconKey={data.icon} size={20} />}
        <span>{data.label}</span>
      </div>
    </div>
  )
}

export const nodeTypes = { service: ServiceNode, group: GroupNode }
