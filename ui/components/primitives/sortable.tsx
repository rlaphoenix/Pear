import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

type SortableState = ReturnType<typeof useSortable>;

const HorizontalCtx = createContext(false);

interface RowArgs {
  setNodeRef: SortableState["setNodeRef"];
  style: CSSProperties;
  attributes: SortableState["attributes"];
  listeners: SortableState["listeners"];
  isDragging: boolean;
}

export function SortableList({
  ids,
  onReorder,
  horizontal = false,
  children,
}: {
  ids: string[];
  onReorder: (activeId: string, overId: string) => void;
  horizontal?: boolean;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={ids}
        strategy={horizontal ? horizontalListSortingStrategy : verticalListSortingStrategy}
      >
        <HorizontalCtx.Provider value={horizontal}>{children}</HorizontalCtx.Provider>
      </SortableContext>
    </DndContext>
  );
}

export function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (args: RowArgs) => ReactNode;
}) {
  const horizontal = useContext(HorizontalCtx);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    animateLayoutChanges: (args) => args.isSorting === true,
  });
  const style: CSSProperties = {
    transform: transform
      ? horizontal
        ? `translate3d(${Math.round(transform.x)}px, 0, 0)`
        : `translate3d(0, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? "relative" : undefined,
  };
  return <>{children({ setNodeRef, style, attributes, listeners, isDragging })}</>;
}
