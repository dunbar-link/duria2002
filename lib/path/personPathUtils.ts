// C:\work\nextjs-server\lib\path\personPathUtils.ts

export type PathNode = {
  pid?: string;
  name?: string;
};

/**
 * 기관 / 학교 / 회사 판별
 */
export function isOrganizationNode(node: PathNode): boolean {
  const pid = (node?.pid || "").toLowerCase();
  const name = (node?.name || "").toLowerCase();

  if (
    pid.startsWith("org:") ||
    pid.startsWith("company:") ||
    pid.startsWith("school:") ||
    pid.startsWith("univ:")
  ) {
    return true;
  }

  if (
    name.includes("university") ||
    name.includes("school") ||
    name.includes("company") ||
    name.includes("기관")
  ) {
    return true;
  }

  return false;
}

/**
 * 사람 노드만 필터
 */
export function filterPersonNodes(nodes: PathNode[]): PathNode[] {
  return nodes.filter((n) => !isOrganizationNode(n));
}

/**
 * 단계 계산 (사람 기준)
 */
export function calculatePersonSteps(nodes: PathNode[]): number {
  const persons = filterPersonNodes(nodes);

  if (persons.length <= 1) return 0;

  return persons.length - 1;
}