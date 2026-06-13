/** 成组对象树节点（由消费方构建） */
export interface GroupingTreeNode {
  id: string
  name: string
  icon: string
  depth: number
  parentId: string | undefined
  children: GroupingTreeNode[]
}

/** 扁平化节点（用于渲染） */
export interface FlatGroupingNode {
  id: string
  name: string
  icon: string
  depth: number
  parentId: string | undefined
  hasChildren: boolean
}

/** 将树结构扁平化为渲染列表 */
export function flattenGroupingTree(
  roots: GroupingTreeNode[],
  expandedIds: Set<string>,
): FlatGroupingNode[] {
  const result: FlatGroupingNode[] = []
  function walk(nodes: GroupingTreeNode[]): void {
    for (const node of nodes) {
      result.push({
        id: node.id,
        name: node.name,
        icon: node.icon,
        depth: node.depth,
        parentId: node.parentId,
        hasChildren: node.children.length > 0,
      })
      if (node.children.length > 0 && expandedIds.has(node.id)) {
        walk(node.children)
      }
    }
  }
  walk(roots)
  return result
}
