// Pure rules for block selections; no ProseMirror or DOM access.

// `touched` is in document order; `ancestorIds` runs outermost to nearest parent.
export function normalizeTouchedBlocks(touched) {
  if (!touched.length) return [];
  const depth = Math.min(...touched.map(({ ancestorIds }) => ancestorIds.length));
  const ids = touched.map(({ id, ancestorIds }) => (ancestorIds.length === depth ? id : ancestorIds[depth]));
  return [...new Set(ids)];
}

// Returns the new sibling order, or null when nothing may move.
export function planSiblingMove(siblingIds, selectedIds, direction) {
  const selected = new Set(selectedIds);
  const indices = siblingIds.map((id, index) => (selected.has(id) ? index : -1)).filter((index) => index >= 0);
  if (!indices.length) return null;
  const edge = direction < 0 ? 0 : siblingIds.length - 1;
  if (indices.includes(edge)) return null;
  const order = [...siblingIds];
  if (direction > 0) indices.reverse();
  for (const index of indices) {
    const neighbour = index + direction;
    if (selected.has(order[neighbour])) continue;
    [order[index], order[neighbour]] = [order[neighbour], order[index]];
  }
  return order;
}
