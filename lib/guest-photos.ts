import { changeLive, readLive, uploadBlob, type LiveGuestPhoto } from "./live";

export const GUEST_PHOTO_LIMIT = 500;

export type GuestPhoto = {
  id: string;
  name: string;
  src: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
};

function toPublic(photo: LiveGuestPhoto): GuestPhoto {
  return {
    id: photo.id,
    name: photo.name,
    src: photo.remoteUrl,
    width: photo.width,
    height: photo.height,
    sortOrder: photo.sortOrder,
  };
}

function byOrder(a: LiveGuestPhoto, b: LiveGuestPhoto) {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

export async function listGuestPhotos(): Promise<GuestPhoto[]> {
  const state = await readLive();
  return [...state.guestPhotos].sort(byOrder).map(toPublic);
}

export async function addGuestPhoto(input: {
  id: string;
  name: string;
  buf: Buffer;
  width: number | null;
  height: number | null;
}): Promise<GuestPhoto | null> {
  const existing = await readLive();
  if (existing.guestPhotos.length >= GUEST_PHOTO_LIMIT) return null;
  const remoteUrl = await uploadBlob(input.buf, `${input.id}.jpg`);
  const createdAt = new Date().toISOString();
  await changeLive((state) => {
    if (state.guestPhotos.some((row) => row.id === input.id)) return;
    if (state.guestPhotos.length >= GUEST_PHOTO_LIMIT) return;
    const sortOrder = state.guestPhotos.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
    state.guestPhotos.push({
      id: input.id,
      name: input.name,
      remoteUrl,
      width: input.width,
      height: input.height,
      sortOrder,
      createdAt,
    });
  });
  const saved = (await listGuestPhotos()).find((photo) => photo.id === input.id);
  return saved ?? null;
}

export async function deleteGuestPhoto(id: string): Promise<boolean> {
  const existing = await readLive();
  if (!existing.guestPhotos.some((photo) => photo.id === id)) return false;
  await changeLive((state) => {
    state.guestPhotos = state.guestPhotos.filter((photo) => photo.id !== id);
  });
  const still = await readLive();
  return !still.guestPhotos.some((photo) => photo.id === id);
}

export async function reorderGuestPhotos(orderedIds: string[]): Promise<GuestPhoto[] | null> {
  const existing = await readLive();
  const have = existing.guestPhotos.map((photo) => photo.id).sort();
  const want = [...orderedIds].sort();
  if (have.length !== want.length || have.some((id, index) => id !== want[index])) return null;
  await changeLive((state) => {
    const ids = new Set(state.guestPhotos.map((photo) => photo.id));
    if (orderedIds.length !== state.guestPhotos.length || orderedIds.some((id) => !ids.has(id))) return;
    orderedIds.forEach((id, index) => {
      const row = state.guestPhotos.find((photo) => photo.id === id);
      if (row) row.sortOrder = index + 1;
    });
    state.guestPhotos.sort(byOrder);
  });
  const saved = await listGuestPhotos();
  if (saved.length !== orderedIds.length || saved.some((photo, index) => photo.id !== orderedIds[index])) return null;
  return saved;
}
