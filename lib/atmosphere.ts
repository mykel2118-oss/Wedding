/** Scroll-tied background. These files are not films and are not in the library. */
export const SCROLL_VIDEO = "/atmosphere/kling_20261105_VIDEO_use__Video_2740_0.mp4";

/** Full-size JPEG frames of that same clip, painted on a canvas when a browser will not scrub the video. */
export const SCROLL_FRAME_COUNT = 49;

export function scrollFrameSrc(index: number) {
  const n = String(index + 1).padStart(2, "0");
  return `/atmosphere/frames/frame-${n}.jpg`;
}
