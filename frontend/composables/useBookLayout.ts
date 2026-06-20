// Direct API composable for book-layout (no orval — complex new module)

export interface BookSize {
  value: 'S20x20' | 'S20x30' | 'S25x25' | 'S30x30';
  label: string;
  spreadRatio: number; // spreadWidth / spreadHeight
  pageRatio: number;   // pageWidth / pageHeight (for cover)
}

export const BOOK_SIZES: BookSize[] = [
  { value: 'S20x20', label: '20×20 см (квадрат)', spreadRatio: 2, pageRatio: 1 },
  { value: 'S20x30', label: '20×30 см (портрет)', spreadRatio: 4 / 3, pageRatio: 2 / 3 },
  { value: 'S25x25', label: '25×25 см (квадрат)', spreadRatio: 2, pageRatio: 1 },
  { value: 'S30x30', label: '30×30 см (квадрат)', spreadRatio: 2, pageRatio: 1 },
];

export interface TemplateTextSlot {
  placeholder: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
}

export interface LayoutTemplate {
  id: string;
  name: string;
  kind: 'PHOTO' | 'TEXT' | 'MIXED';
  cells: number;
  photoSlots: number;
  columns: string;
  rows: string;
  areas?: string;
  cellKinds?: ('photo' | 'text')[];
  textSlots?: TemplateTextSlot[];
  gridPadding?: string;
  category: string;
}

export interface BookPhoto {
  id: string;
  bookProjectId: string;
  storageKey: string;
  thumbKey: string;
  thumbUrl: string;
  originalUrl: string;
  originalThumbUrl: string;
  fileName: string;
  width: number;
  height: number;
  takenAt?: string | null;
  order: number;
  uploadedAt: string;
  enhancedKey?: string | null;
  enhancedThumbKey?: string | null;
  enhancedThumbUrl?: string | null;
  enhancedOriginalUrl?: string | null;
  useEnhanced: boolean;
}

export interface PhotoQuality {
  effectiveDpi: number;
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor';
  levelLabel: string;
  levelColor: string;
  recommendation: string;
  photoPixels: { w: number; h: number };
  requiredPixels: { w: number; h: number };
  cellCm: { w: number; h: number };
}

export interface BookPlacement {
  id: string;
  spreadId: string;
  photoId: string;
  photo: BookPhoto;
  cellIndex: number;
  rotation: number;
  scale: number;
  panX: number;
  panY: number;
  z: number;
}

export interface BookTextElement {
  id: string;
  spreadId: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BookSpread {
  id: string;
  bookProjectId: string;
  index: number;
  kind: 'COVER' | 'SPREAD';
  templateId?: string | null;
  placements: BookPlacement[];
  textElements: BookTextElement[];
}

export interface BookProjectSummary {
  id: string;
  title: string;
  size: string;
  orderNumber?: string | null;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
  _count: { photos: number; spreads: number };
  coverThumbUrl?: string | null;
}

export interface BookProjectFull extends Omit<BookProjectSummary, '_count'> {
  photos: BookPhoto[];
  spreads: BookSpread[];
}

export function useBookLayout() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  function headers(): Record<string, string> {
    const token = process.client ? localStorage.getItem('auth_token') : '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function api<T>(method: string, path: string, body?: any): Promise<T> {
    return $fetch<T>(`${apiBase}/api/book-layout${path}`, {
      method: method as any,
      headers: headers(),
      body,
    });
  }

  return {
    // Templates
    getTemplates: () => api<LayoutTemplate[]>('GET', '/templates'),

    // Projects
    listProjects: () => api<BookProjectSummary[]>('GET', '/projects'),
    createProject: (title: string, size: string) =>
      api<BookProjectFull>('POST', '/projects', { title, size }),
    getProject: (id: string) => api<BookProjectFull>('GET', `/projects/${id}`),
    getProjectByToken: (token: string) =>
      api<BookProjectFull>('GET', `/projects/share/${token}`),
    updateProject: (id: string, data: { title?: string; orderNumber?: string | null }) =>
      api<any>('PATCH', `/projects/${id}`, data),
    deleteProject: (id: string) => api<any>('DELETE', `/projects/${id}`),

    // Photos
    uploadPhotos: async (projectId: string, files: File[]): Promise<BookPhoto[]> => {
      const token = process.client ? (localStorage.getItem('auth_token') ?? '') : '';
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const result = await $fetch<BookPhoto[]>(
        `${apiBase}/api/book-layout/projects/${projectId}/photos`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd },
      );
      return result;
    },
    deletePhoto: (photoId: string) => api<any>('DELETE', `/photos/${photoId}`),

    // Spreads
    addSpread: (projectId: string) => api<BookSpread>('POST', `/projects/${projectId}/spreads`),
    deleteSpread: (spreadId: string) => api<any>('DELETE', `/spreads/${spreadId}`),
    saveSpread: (
      spreadId: string,
      data: {
        templateId?: string;
        placements?: { photoId: string; cellIndex: number; rotation?: number; scale?: number; panX?: number; panY?: number }[];
        textElements?: Partial<BookTextElement>[];
      },
    ) => api<BookSpread>('PATCH', `/spreads/${spreadId}`, data),

    // Auto-layout
    autoLayout: (projectId: string) => api<BookProjectFull>('POST', `/projects/${projectId}/auto-layout`),

    // Photo quality & enhancement
    getPhotoQuality: (
      photoId: string,
      bookSize: string,
      templateId: string,
      cellIndex: number,
    ) => api<PhotoQuality>('GET', `/photos/${photoId}/quality?bookSize=${bookSize}&templateId=${templateId}&cellIndex=${cellIndex}`),
    enhancePhoto: (photoId: string) => api<BookPhoto>('POST', `/photos/${photoId}/enhance`),
    enhancePhotoStart: (
      photoId: string,
      ctx?: { bookSize?: string; templateId?: string; cellIndex?: number },
    ) => api<{ jobId: string }>('POST', `/photos/${photoId}/enhance/start`, ctx ?? {}),
    getEnhanceJobStatus: (photoId: string, jobId: string) =>
      api<{ jobId: string; status: string; progress: number; message: string; error?: string; photo?: BookPhoto }>(
        'GET', `/photos/${photoId}/enhance/job/${jobId}`,
      ),
    applyEnhancement: (photoId: string, apply: boolean) =>
      api<BookPhoto>('POST', `/photos/${photoId}/enhance/apply`, { apply }),

    // Travelbook cover generation
    startCoverGeneration: (
      projectId: string,
      params: { location: string; style: string; bookSize: string; seed?: number },
    ) => api<{ jobId: string }>('POST', `/projects/${projectId}/cover/generate`, params),
    getCoverStatus: (jobId: string) =>
      api<{ job_id: string; status: string; progress: number; message: string; has_result: boolean }>(
        'GET', `/cover/generate/status/${jobId}`,
      ),
    applyCoverResult: (
      projectId: string,
      params: { jobId: string; title?: string; subtitle?: string; style?: string },
    ) => api<BookSpread>('POST', `/projects/${projectId}/cover/apply`, params),
  };
}
