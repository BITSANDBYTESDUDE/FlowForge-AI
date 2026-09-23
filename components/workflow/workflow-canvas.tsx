'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import { useBuilderStore } from '@/lib/workflow/builder-store';
import { NODE_TYPES } from '@/components/workflow/workflow-node';
import type { WorkflowNodeType } from '@/types/workflow';

/**
 * React Flow canvas.
 *
 * `ReactFlowProvider` lives here (rather than in the page) because the palette
 * and toolbar both need `useReactFlow` to convert screen coordinates and drive
 * zoom, and they are siblings of the canvas.
 */
function Canvas() {
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const onNodesChange = useBuilderStore((state) => state.onNodesChange);
  const onEdgesChange = useBuilderStore((state) => state.onEdgesChange);
  const onConnect = useBuilderStore((state) => state.onConnect);
  const addNode = useBuilderStore((state) => state.addNode);
  const selectNode = useBuilderStore((state) => state.selectNode);
  const selectEdge = useBuilderStore((state) => state.selectEdge);

  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/flowforge-node') as WorkflowNodeType;
      if (!type) return;

      // `screenToFlowPosition` accounts for pan and zoom, so a drop lands under
      // the cursor at any zoom level.
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type, position);
    },
    [addNode, screenToFlowPosition],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={wrapperRef} className="h-full w-full" onDrop={handleDrop} onDragOver={handleDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => selectNode(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => selectNode(null)}
        // Shift-click and shift-drag both start a selection box, matching the
        // convention in most diagram tools.
        selectionOnDrag
        panOnScroll
        fitView
        // Room for the last layer of nodes when auto-layout runs.
        fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: false,
          style: { strokeWidth: 1.5 },
          type: 'smoothstep',
        }}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls
          showInteractive={false}
          className="!rounded-md !border !border-border !bg-card !shadow-sm"
        />
        <MiniMap
          pannable
          zoomable
          className="!hidden !rounded-md !border !border-border !bg-card sm:!block"
          maskColor="hsl(var(--muted) / 0.6)"
        />
      </ReactFlow>
    </div>
  );
}

/** Keyboard shortcuts plus an initial fit, wrapped around the canvas. */
function CanvasWithShortcuts() {
  const undo = useBuilderStore((state) => state.undo);
  const redo = useBuilderStore((state) => state.redo);
  const autoLayout = useBuilderStore((state) => state.autoLayout);
  const duplicateNode = useBuilderStore((state) => state.duplicateNode);
  const deleteNode = useBuilderStore((state) => state.deleteNode);
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId);
  const { fitView } = useReactFlow();
  const nodeCount = useBuilderStore((state) => state.nodes.length);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Never intercept keys while the user is typing in a field.
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (typing) return;

      if (modifier && event.key.toLowerCase() === 'd' && selectedNodeId) {
        event.preventDefault();
        duplicateNode(selectedNodeId);
        return;
      }

      // `L` for layout; ctrl+L is the browser address bar so require plain L.
      if (!modifier && event.key.toLowerCase() === 'l') {
        autoLayout();
        toast.success('Layout applied');
        requestAnimationFrame(() => fitView({ padding: 0.25, duration: 300 }));
        return;
      }

      if (
        selectedNodeId &&
        !modifier &&
        (event.key === 'Backspace' || event.key === 'Delete')
      ) {
        event.preventDefault();
        deleteNode(selectedNodeId);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    undo,
    redo,
    duplicateNode,
    deleteNode,
    autoLayout,
    fitView,
    selectedNodeId,
  ]);

  // Fit the graph once when it first arrives from the server.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || nodeCount === 0) return;
    fittedRef.current = true;
    requestAnimationFrame(() => fitView({ padding: 0.25 }));
  }, [nodeCount, fitView]);


  return <Canvas />;
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasWithShortcuts />
    </ReactFlowProvider>
  );
}
