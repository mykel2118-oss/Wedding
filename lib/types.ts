export type MediaKind = "photo" | "video";

export type MediaItem = {
  id: string;
  kind: MediaKind;
  caption: string;
  sortOrder: number;
  width: number | null;
  height: number | null;
  mime: string;
  src: string;
  /** A still of the first moment, shown until the moving picture is on screen. */
  poster?: string | null;
};

export type HomeDetails = {
  address: string;
  dressCode: string;
  honored: string[];
  musicUrl: string | null;
  /** 0 hides the background film. 100 shows it with no veil. */
  backgroundOpacity: number;
  /** 0 clears the cream panels. 100 makes them solid. Words stay on the panel. */
  panelOpacity: number;
  /** A replacement for the wide photograph at the top. Null keeps the original. */
  banner: string | null;
  /** The three large story photographs, in order. Null means that spot is empty. */
  features: [string | null, string | null, string | null];
};

export type InviteRecord = {
  id: string;
  name: string;
  /** The one or two names on this invitation. */
  party: string[];
  names: string[];
  responded: boolean;
  headcount: number;
  /** Set the first time this invitation is opened. */
  openedAt: string;
};
