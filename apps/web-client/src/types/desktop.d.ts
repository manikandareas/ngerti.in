export {};

declare global {
  interface Window {
    ngertiinDesktop?: {
      platform: string;
      reportComputerView(active: boolean, revision: number): void;
      onVisibility(callback: (visible: boolean) => void): () => void;
    };
  }
}
