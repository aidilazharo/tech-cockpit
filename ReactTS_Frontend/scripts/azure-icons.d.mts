export interface IconFile {
  /** The folder in Microsoft's set, e.g. "compute" */
  category: string
  /** e.g. "10021-icon-service-Virtual-Machine.svg" */
  file: string
}

export interface IconEntry {
  id: string
  name: string
  categories: string[]
  file: string
}

export function buildIconIndex(files: IconFile[]): IconEntry[]
