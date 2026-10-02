import type { ChannelShape } from '../engine/openChannel'

// Shape plumbing shared by the three open-channel modes — types, the shape
// builder and the sample values. Components live in openChannelShared.tsx;
// this file stays component-free so fast refresh can do its job.

export type ShapeKind = 'rect' | 'trap' | 'tri' | 'circle'

export interface ShapeState {
  kind: ShapeKind
  b: string
  z: string
  D: string
}

export const SHAPE_SAMPLE: ShapeState = { kind: 'trap', b: '2', z: '1.5', D: '2' }

export function buildShape(s: ShapeState): ChannelShape {
  const b = parseFloat(s.b) || 0
  const z = parseFloat(s.z) || 0
  const D = parseFloat(s.D) || 0
  if (s.kind === 'rect') return { kind: 'rect', b }
  if (s.kind === 'trap') return { kind: 'trap', b, z }
  if (s.kind === 'tri') return { kind: 'tri', z }
  return { kind: 'circle', D }
}
