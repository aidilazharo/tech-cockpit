export interface QiTokenDocument {
  source: string
  extracted: string
  shape: Record<string, string>
  light: Record<string, string>
  dark: Record<string, string>
}

export function buildQiCss(tokens: QiTokenDocument): string
