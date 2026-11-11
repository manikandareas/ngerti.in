export {};

declare global {
  interface Window {
    ngertiinDesktop?: {
      platform: string;
      nativeVisibility?: boolean;
      openExternal?(url: string): Promise<void>;
      reportComputerView(active: boolean, revision: number): void;
      onVisibility(callback: (visible: boolean) => void): () => void;
    };
  }
}
