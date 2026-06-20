export interface PhotoMeta {
  photoId: string;
  thumbPath: string;
  takenAt?: Date | null;
  order: number;
}

export interface VisionGroupResult {
  groups: { photoIds: string[]; label?: string }[];
}

export interface VisionClient {
  groupPhotos(photos: PhotoMeta[]): Promise<VisionGroupResult>;
}

// Stub implementation: sort by takenAt + order (no AI)
export class ExifOnlyVisionClient implements VisionClient {
  async groupPhotos(photos: PhotoMeta[]): Promise<VisionGroupResult> {
    const sorted = [...photos].sort((a, b) => {
      if (a.takenAt && b.takenAt) return a.takenAt.getTime() - b.takenAt.getTime();
      if (a.takenAt) return -1;
      if (b.takenAt) return 1;
      return a.order - b.order;
    });
    return { groups: [{ photoIds: sorted.map((p) => p.photoId) }] };
  }
}

// Claude/OpenAI adapter (used when VISION_API_KEY is set in env)
// TBD: inject via ConfigService when AI provider key is added.
// For now, fall back to ExifOnlyVisionClient.
export function createVisionClient(_apiKey?: string): VisionClient {
  // Future: if (_apiKey) return new ClaudeVisionClient(_apiKey);
  return new ExifOnlyVisionClient();
}
