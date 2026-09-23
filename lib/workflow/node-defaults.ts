import type { WorkflowNodeType } from '@/types/workflow';

/**
 * Defaults for newly created nodes and the node palette.
 *
 * Shared by the store (to seed a new node) and the palette (to describe it), so
 * the two can never disagree about what a node type starts as.
 */

export const NODE_DEFAULTS: Record<
  WorkflowNodeType,
  { title: string; label: string; description: string }
> = {
  START: {
    title: 'Start',
    label: 'Start',
    description: 'Entry point of the workflow.',
  },
  TASK: {
    title: 'New task',
    label: 'Task',
    description: 'Work that a person needs to complete.',
  },
  DECISION: {
    title: 'Decision',
    label: 'Decision',
    description: 'Branches on a condition. Needs at least two outgoing connections.',
  },
  APPROVAL: {
    title: 'Approval',
    label: 'Approval',
    description: 'Blocks until a designated approver signs off.',
  },
  DELAY: {
    title: 'Wait',
    label: 'Delay',
    description: 'Pauses for a fixed interval before continuing.',
  },
  NOTIFICATION: {
    title: 'Send notification',
    label: 'Notification',
    description: 'Emits a message to the workspace.',
  },
  AI_ACTION: {
    title: 'AI action',
    label: 'AI action',
    description: 'An automated step described by a prompt.',
  },
  END: {
    title: 'End',
    label: 'End',
    description: 'Terminal node. Completes the execution.',
  },
};

/** Node types offered in the palette, in the order they are displayed. */
export const PALETTE_ORDER: WorkflowNodeType[] = [
  'TASK',
  'DECISION',
  'APPROVAL',
  'DELAY',
  'NOTIFICATION',
  'AI_ACTION',
  'START',
  'END',
];

export const DEFAULT_NODE_CONFIG: Record<WorkflowNodeType, Record<string, unknown>> = {
  START: {},
  TASK: {},
  END: {},
  DECISION: {
    conditions: [
      { label: 'Yes', expression: 'true' },
      { label: 'No', expression: 'false' },
    ],
  },
  APPROVAL: { approvers: [] },
  DELAY: { delayMinutes: 1440 },
  NOTIFICATION: { message: '' },
  AI_ACTION: { prompt: '' },
};
