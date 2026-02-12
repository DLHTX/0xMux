/** Extract project name from session name (e.g., "myproject-1" -> "myproject") */
export function extractProjectName(sessionName: string): string {
  // Remove trailing numbers and hyphens
  return sessionName.replace(/-\d+$/, '')
}

/** Generate a consistent color for a project name */
export function getProjectColor(projectName: string): string {
  // Simple hash function
  let hash = 0
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash)
  }

  // Generate HSL color with consistent hue
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 70%, 60%)`
}

/** Color used to indicate windows that are part of the same split group */
export const SPLIT_GROUP_COLOR = '#3b82f6'
