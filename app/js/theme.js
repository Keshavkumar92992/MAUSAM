// Whether the app is currently rendering dark. The <head> script decides
// this before first paint and stamps data-theme on <html>; every page reads
// it back from there rather than re-deriving it, so the nav icons and status
// bar can never disagree with the stylesheet they sit on.
export function isDarkTheme() {
  return document.documentElement.dataset.theme === 'dark';
}
