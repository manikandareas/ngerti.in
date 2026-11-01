// noVNC 1.7 exports the ESM client at its package root; DefinitelyTyped 1.6 names the previous path.
declare module "@novnc/novnc" {
  export { default } from "@novnc/novnc/lib/rfb";
}
